import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import agentOfferFixtures from "../../../api/tenant-protocol/conformance/agent-credit-offer-workflow-receipt.v1.fixtures.json" with { type: "json" };
import agentObligationFixtures from "../../../api/tenant-protocol/conformance/agent-sandbox-obligation-workflow-receipt.v1.fixtures.json" with { type: "json" };
import humanOfferFixtures from "../../../api/tenant-protocol/conformance/human-credit-offer-workflow-receipt.v1.fixtures.json" with { type: "json" };
import humanObligationFixtures from "../../../api/tenant-protocol/conformance/human-sandbox-obligation-workflow-receipt.v1.fixtures.json" with { type: "json" };
import { hashId } from "../../../packages/domain/src/index.js";
import { migrateUp } from "../../../scripts/migrate.mjs";
import {
  PostgresEventRepository,
  createPostgresPool,
  createTenantSecurityContext
} from "../../persistence/src/index.js";
import {
  DualNativeLifecycleSyntheticRunner,
  OperationalSignalType,
  PostgresOperationalAlertStore,
  createPrivatePilotOperationalSourceBoundary,
  operationalTenantRefHash,
  signalFromAbuseTelemetry
} from "../src/index.js";

const CONNECTION_STRING = process.env.DATABASE_URL;
const RUN_ID = randomBytes(6).toString("hex");
const RELEASE = "b".repeat(40);
const TENANT_ONE = `tenant_ops_one_${RUN_ID}`;
const TENANT_TWO = `tenant_ops_two_${RUN_ID}`;
const APP_ROLE = `ipo_ops_${RUN_ID}`;
const CONTEXT_ONE = createTenantSecurityContext({
  tenantId: TENANT_ONE,
  actorId: `actor_ops_one_${RUN_ID}`,
  policyVersion: "security_001.v1",
  source: "local_test"
});
const CONTEXT_TWO = createTenantSecurityContext({
  tenantId: TENANT_TWO,
  actorId: `actor_ops_two_${RUN_ID}`,
  policyVersion: "security_001.v1",
  source: "local_test"
});
const HUMAN_OBLIGATION = humanObligationFixtures.valid[0];
const AGENT_OBLIGATION = agentObligationFixtures.valid[0];

function linkedOffer(offerFixture, obligation) {
  const receipt = structuredClone(offerFixture);
  receipt.subjectId = obligation.subjectId;
  receipt.creditIntent.creditIntentId = obligation.creditIntentId;
  receipt.offer.creditOfferId = obligation.creditOfferId;
  receipt.offer.creditOfferHash = obligation.acceptance.creditOfferHash;
  receipt.offer.termsHash = obligation.acceptance.termsHash;
  return receipt;
}

const HUMAN_OFFER = linkedOffer(humanOfferFixtures.valid[0], HUMAN_OBLIGATION);
const AGENT_OFFER = linkedOffer(agentOfferFixtures.valid[0], AGENT_OBLIGATION);

function sequenceClock(...values) {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}

function syntheticRunner(tenantId, { fail = false, start = "2026-07-17T12:10:00.000Z" } = {}) {
  const completed = new Date(new Date(start).getTime() + 3_000).toISOString();
  const reconciliationStarted = new Date(new Date(start).getTime() + 1_000).toISOString();
  const reconciliationCompleted = new Date(new Date(start).getTime() + 2_000).toISOString();
  return new DualNativeLifecycleSyntheticRunner({
    tenantRefHash: operationalTenantRefHash(tenantId),
    clock: sequenceClock(start, completed),
    runHumanOffer: async () => {
      if (fail) throw Object.assign(new Error("redacted private executor detail"), { code: "provider_timeout" });
      return structuredClone(HUMAN_OFFER);
    },
    runAgentOffer: async () => structuredClone(AGENT_OFFER),
    runHumanObligation: async () => structuredClone(HUMAN_OBLIGATION),
    runAgentObligation: async () => structuredClone(AGENT_OBLIGATION),
    runReconciliation: async () => ({
      runId: `reconciliation_run_ops_${RUN_ID}_${fail ? "failed" : "passed"}`,
      scope: "full",
      status: "passed",
      checkCount: 11,
      discrepancyCount: 0,
      criticalCount: 0,
      truncated: false,
      release: RELEASE,
      startedAt: reconciliationStarted,
      completedAt: reconciliationCompleted,
      schemaVersion: "reconciliation_summary.v1"
    })
  });
}

function admissionSignal(windowId, observedAt) {
  return signalFromAbuseTelemetry(
    { surface: "tenant", outcome: "failed", reason: "unavailable", count: 1 },
    {
      observedAt,
      windowId,
      boundary: createPrivatePilotOperationalSourceBoundary()
    }
  );
}

async function seedTenant(pool, tenantId) {
  await pool.query(
    `INSERT INTO tenants(
       id, tenant_hash, organization_ref, display_name, status,
       pilot_jurisdiction, legal_retention_owner_ref, created_at,
       updated_at, schema_version
     ) VALUES ($1, $2, $3, $4, 'active', 'US', $5, $6, $6, 'tenant.v1')
     ON CONFLICT (id) DO NOTHING`,
    [
      tenantId,
      hashId("operations_test_tenant", tenantId),
      `org:${tenantId}`,
      `Operations Test ${tenantId}`,
      `org:${tenantId}:retention`,
      "2026-07-17T11:59:00.000Z"
    ]
  );
}

test("durable operational alerts are replay-safe, Tenant-isolated, and Evidence-linked", {
  timeout: 60_000
}, async (t) => {
  assert.ok(CONNECTION_STRING, "DATABASE_URL must be provided by scripts/run-postgres-tests.mjs");
  const pool = createPostgresPool({
    connectionString: CONNECTION_STRING,
    max: 6,
    applicationName: "ipo-one-operations-control-integration"
  });
  let appPool;
  try {
    await migrateUp({ pool });
    await seedTenant(pool, TENANT_ONE);
    await seedTenant(pool, TENANT_TWO);
    await pool.query(
      `CREATE ROLE ${APP_ROLE}
       LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await pool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`
    );
    await pool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
    const appConnection = new URL(CONNECTION_STRING);
    appConnection.username = APP_ROLE;
    appPool = createPostgresPool({
      connectionString: appConnection.toString(),
      max: 6,
      applicationName: "ipo-one-operations-control-tenant-role"
    });
    const repositoryOne = new PostgresEventRepository({ pool: appPool, tenantContext: CONTEXT_ONE });
    const repositoryTwo = new PostgresEventRepository({ pool: appPool, tenantContext: CONTEXT_TWO });
    const storeOne = new PostgresOperationalAlertStore({
      eventRepository: repositoryOne,
      clock: () => new Date("2026-07-17T12:00:30.000Z")
    });
    const storeTwo = new PostgresOperationalAlertStore({
      eventRepository: repositoryTwo,
      clock: () => new Date("2026-07-17T12:00:30.000Z")
    });
    const firstSignal = admissionSignal("window-ops-001", "2026-07-17T12:00:00.000Z");
    const secondSignal = admissionSignal("window-ops-002", "2026-07-17T12:01:00.000Z");

    await t.test("exact command and source replay cannot inflate occurrence counts", async () => {
      const first = await storeOne.ingestSignals({
        signals: [firstSignal],
        idempotencyKey: `ops-ingest-first-${RUN_ID}`
      });
      assert.equal(first.replayed, false);
      assert.equal(first.updatedAlertCount, 1);
      assert.equal(first.newOccurrenceCount, 1);
      assert.equal(first.alertStates[0].occurrenceCount, 1);
      assert.equal(first.alertStates[0].version, 1);

      const replay = await storeOne.ingestSignals({
        signals: [firstSignal],
        idempotencyKey: `ops-ingest-first-${RUN_ID}`
      });
      assert.equal(replay.replayed, true);
      assert.equal(replay.alertStates[0].occurrenceCount, 1);

      const sourceReplay = await storeOne.ingestSignals({
        signals: [firstSignal],
        idempotencyKey: `ops-ingest-source-replay-${RUN_ID}`
      });
      assert.equal(sourceReplay.replayed, false);
      assert.equal(sourceReplay.updatedAlertCount, 0);
      assert.equal(sourceReplay.newOccurrenceCount, 0);

      const second = await storeOne.ingestSignals({
        signals: [secondSignal],
        idempotencyKey: `ops-ingest-second-${RUN_ID}`
      });
      assert.equal(second.alertStates[0].occurrenceCount, 2);
      assert.equal(second.alertStates[0].version, 2);
      assert.deepEqual((await storeOne.listAlertStates()).map(({ occurrenceCount }) => occurrenceCount), [2]);
      const eventTypes = (await repositoryOne.listEvents()).map(({ eventType }) => eventType);
      assert.equal(eventTypes.filter((type) => type === "operational_signals_ingested").length, 3);
      assert.equal(eventTypes.filter((type) => type === "operational_alert_observed").length, 2);
      assert.equal((await repositoryOne.listEvidence()).length, eventTypes.length);
      assert.equal((await repositoryOne.listOutbox()).length, eventTypes.length);
    });

    await t.test("two Tenants may reuse source and idempotency identities without visibility or coupling", async () => {
      const tenantTwo = await storeTwo.ingestSignals({
        signals: [firstSignal],
        idempotencyKey: `ops-ingest-first-${RUN_ID}`
      });
      assert.equal(tenantTwo.replayed, false);
      assert.equal(tenantTwo.alertStates[0].occurrenceCount, 1);
      assert.equal((await storeOne.listAlertStates())[0].occurrenceCount, 2);
      assert.equal((await storeTwo.listAlertStates())[0].occurrenceCount, 1);
      assert.equal((await storeOne.listSyntheticRuns()).length, 0);
      assert.equal((await storeTwo.listSyntheticRuns()).length, 0);
    });

    await t.test("passed and failed dual-native checks persist exact release evidence and failed checks alert", async () => {
      const passed = await syntheticRunner(TENANT_ONE).run({
        checkId: `closed-pilot-passed-${RUN_ID}`,
        release: RELEASE
      });
      const passedRecord = await storeOne.recordSyntheticResult({
        result: passed,
        idempotencyKey: `ops-synthetic-passed-${RUN_ID}`
      });
      assert.equal(passedRecord.replayed, false);
      assert.equal(passedRecord.syntheticResult.status, "passed");
      assert.deepEqual(passedRecord.alertStates, []);

      const failed = await syntheticRunner(TENANT_ONE, {
        fail: true,
        start: "2026-07-17T12:11:00.000Z"
      }).run({
        checkId: `closed-pilot-failed-${RUN_ID}`,
        release: RELEASE
      });
      const failedRecord = await storeOne.recordSyntheticResult({
        result: failed,
        idempotencyKey: `ops-synthetic-failed-${RUN_ID}`
      });
      assert.equal(failedRecord.syntheticResult.status, "failed");
      assert.equal(failedRecord.syntheticResult.failureCode, "provider_timeout");
      assert.equal(failedRecord.alertStates[0].signalType, OperationalSignalType.SYNTHETIC_LIFECYCLE_FAILED);
      assert.equal((await storeOne.listSyntheticRuns()).length, 2);
      assert.equal((await storeTwo.listSyntheticRuns()).length, 0);

      const replay = await storeOne.recordSyntheticResult({
        result: failed,
        idempotencyKey: `ops-synthetic-failed-${RUN_ID}`
      });
      assert.equal(replay.replayed, true);
      const olderFailed = await syntheticRunner(TENANT_ONE, {
        fail: true,
        start: "2026-07-17T12:09:00.000Z"
      }).run({
        checkId: `closed-pilot-failed-${RUN_ID}`,
        release: RELEASE
      });
      const olderRecord = await storeOne.recordSyntheticResult({
        result: olderFailed,
        idempotencyKey: `ops-synthetic-older-${RUN_ID}`
      });
      assert.equal(olderRecord.alertStates[0].occurrenceCount, 2);
      assert.equal(olderRecord.alertStates[0].version, 2);
      assert.equal(olderRecord.alertStates[0].firstObservedAt, "2026-07-17T12:09:03.000Z");
      assert.equal(olderRecord.alertStates[0].lastObservedAt, "2026-07-17T12:11:03.000Z");
      assert.equal(olderRecord.alertStates[0].updatedAt, "2026-07-17T12:11:03.000Z");
      assert.equal((await storeOne.listSyntheticRuns()).length, 3);
      const serialized = JSON.stringify({
        alerts: await storeOne.listAlertStates(),
        runs: await storeOne.listSyntheticRuns(),
        events: await repositoryOne.listEvents()
      });
      assert.equal(serialized.includes(TENANT_ONE), false);
      assert.equal(serialized.includes(CONTEXT_ONE.actorId), false);
      assert.equal(serialized.includes("redacted private executor detail"), false);
    });

    await t.test("database guards reject mutation and deletion outside the approved append path", async () => {
      const alerts = await storeOne.listAlertStates();
      await assert.rejects(
        () => repositoryOne.withTenantWrite((client) => client.query(
          `UPDATE operational_alerts
              SET severity = 'low', version = version + 1, updated_at = updated_at
            WHERE id = $1`,
          [alerts[0].alertId]
        )),
        (error) => error.code === "P0001" && /immutable/.test(error.message)
      );
      await assert.rejects(
        () => repositoryOne.withTenantWrite((client) => client.query(
          `DELETE FROM operational_alerts WHERE id = $1`,
          [alerts[0].alertId]
        )),
        (error) => error.code === "P0001"
      );
      const syntheticRunId = (await storeOne.listSyntheticRuns())[0].syntheticRunId;
      await assert.rejects(
        () => repositoryOne.withTenantWrite((client) => client.query(
          `UPDATE operational_synthetic_runs SET release = $2 WHERE id = $1`,
          [syntheticRunId, "c".repeat(40)]
        )),
        (error) => error.code === "P0001"
      );
      assert.equal((await storeOne.listAlertStates()).length, 2);
      assert.equal((await storeOne.listSyntheticRuns()).length, 3);
    });

    await t.test("synthetic storage rejects cross-Tenant result binding", async () => {
      const tenantOneResult = await syntheticRunner(TENANT_ONE, {
        start: "2026-07-17T12:20:00.000Z"
      }).run({
        checkId: `closed-pilot-cross-tenant-${RUN_ID}`,
        release: RELEASE
      });
      await assert.rejects(
        () => storeTwo.recordSyntheticResult({
          result: tenantOneResult,
          idempotencyKey: `ops-synthetic-cross-tenant-${RUN_ID}`
        }),
        { name: "DomainError", code: "operational_synthetic_tenant_mismatch" }
      );
    });
  } finally {
    if (appPool) await appPool.end();
    const roleExists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
    if (roleExists.rowCount > 0) {
      await pool.query(`DROP OWNED BY ${APP_ROLE}`);
      await pool.query(`DROP ROLE ${APP_ROLE}`);
    }
    await pool.query("TRUNCATE TABLE tenants, actors RESTART IDENTITY CASCADE");
    await pool.end();
  }
});
