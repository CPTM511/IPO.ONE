import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createCreditEvent, hashId } from "../../../packages/domain/src/index.js";
import {
  CoreProjectionType, PostgresCoreRepository, PostgresEventRepository,
  assertTenantDatabaseRole, createPostgresPool, createTenantSecurityContext
} from "../../persistence/src/index.js";
import { PostgresCreditOutcomeMaterializer, createCreditStateProjection } from "../../credit-learning/src/index.js";
import { readOwnCreditStateQueryHandler } from "../src/credit-state-query-handlers.js";
import { migrateUp } from "../../../scripts/migrate.mjs";
import { creditBoundaryFixture } from "./support/credit-state-boundary-fixture.mjs";

const CONNECTION = process.env.DATABASE_URL;
const NOW = new Date("2026-10-09T00:00:00.000Z");
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const role = `credit_boundary_${runId}`;

// This uses the project's real migrations, constraints, RLS and event repository.
// Only upstream fixture creation bypasses its unrelated Consent/Offer references,
// as in pool-obligation-integration. Credit outcomes/projections never bypass RLS,
// hash validation, foreign keys, immutability or tenant-context guards.
test("PostgreSQL complete credit histories and fair bounded refresh", { timeout: 120_000 }, async (t) => {
  assert.ok(CONNECTION, "DATABASE_URL is required");
  const owner = createPostgresPool({ connectionString: CONNECTION, max: 3 });
  let app;
  const instrument = { maxPage: 0, fetches: 0, timeout: undefined, afterFetch: undefined };
  try {
    await migrateUp({ pool: owner });
    await owner.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await owner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    // SET ROLE on a dedicated pool works with password-protected CI as well as
    // local trust authentication. No password or external credential is created.
    const raw = createPostgresPool({ connectionString: CONNECTION, max: 6 });
    app = {
      async connect() {
        const client = await raw.connect();
        await client.query(`SET ROLE ${role}`);
        const query = client.query.bind(client);
        return {
          async query(sql, params) {
            const result = await query(sql, params);
            if (sql.startsWith("FETCH FORWARD")) {
              if (instrument.slowFetch) {
                instrument.slowFetch = false;
                await query("SELECT pg_sleep(0.1)");
              }
              instrument.fetches++;
              instrument.maxPage = Math.max(instrument.maxPage, result.rowCount);
              instrument.timeout = (await query("SHOW statement_timeout")).rows[0].statement_timeout;
              const hook = instrument.afterFetch;
              instrument.afterFetch = undefined;
              if (hook) await hook();
            }
            return result;
          },
          release: () => client.release()
        };
      },
      async query(sql, params) {
        const client = await this.connect();
        try { return await client.query(sql, params); } finally { client.release(); }
      },
      end: () => raw.end()
    };
    await assertTenantDatabaseRole(app);
    async function tenant(name, isolation = "serializable") {
      const tenantId = `tenant_credit_${runId}_${name}`;
      await owner.query(`INSERT INTO tenants VALUES (
        $1, $2, $3, $3, 'active', 'US', $3, $4, $4, 'tenant.v1')`,
      [tenantId, hashId("boundary_tenant", tenantId), `fixture:${tenantId}`, NOW]);
      const context = createTenantSecurityContext({ tenantId,
        actorId: `actor_credit_${runId}`, policyVersion: "security_001.v1", source: "local_test" });
      const repository = new PostgresEventRepository({ pool: app, tenantContext: context, writeIsolation: isolation });
      const materializer = new PostgresCreditOutcomeMaterializer({ eventRepository: repository, clock: () => NOW });
      const seedRepository = new PostgresEventRepository({ pool: owner, tenantContext: context });
      const core = new PostgresCoreRepository({ pool: owner, eventRepository: seedRepository });
      const seen = new Set();
      return {
        repository, materializer,
        subject: (key) => `subject_credit_boundary_${runId}_${name}_${key}`,
        async seed(key, start, count, { losses = [], late = false, padding = 0 } = {}) {
          const subjectKey = `${runId}_${name}_${key}`;
          await seedRepository.withTenantWrite(async (client) => {
            // Transaction-local fixture bypass, never used by the tested worker.
            for (const table of ["risk_decisions", "obligations"]) {
              await client.query(`ALTER TABLE ${table} DISABLE TRIGGER ALL`);
              await client.query(`ALTER TABLE ${table} ENABLE TRIGGER tenant_context_guard_${table}`);
            }
            for (let i = start; i < start + count; i++) {
              const value = creditBoundaryFixture(subjectKey, i, losses.includes(i));
              value.obligation.updatedAt = late ? "2026-08-01T00:00:00.000Z"
                : new Date(Date.UTC(2026, 7, 23, 0, i)).toISOString();
              if (padding) value.riskDecision.riskFeatureSnapshot.padding = "x".repeat(padding);
              const entries = [];
              if (!seen.has(key) && i === start) entries.push(
                [CoreProjectionType.PRINCIPAL, value.principal, value.principal.principalId, "principal_created"],
                [CoreProjectionType.SUBJECT, value.subject, value.subject.subjectId, "subject_created"]
              );
              entries.push(
                [CoreProjectionType.RISK_DECISION, value.riskDecision, value.riskDecision.riskDecisionId, "risk_decision_created"],
                [CoreProjectionType.OBLIGATION, value.obligation, value.obligation.obligationId, "obligation_created"]
              );
              const events = entries.map(([type, , id, eventType]) => ({
                aggregateType: type, aggregateId: id, expectedVersion: 0,
                event: createCreditEvent({ eventType, subjectId: value.subject.subjectId,
                  ...(type === CoreProjectionType.OBLIGATION ? { obligationId: id } : {}),
                  payload: { syntheticOnly: true }, now: NOW })
              }));
              await core.commitCommandInTransaction(client, {
                aggregateType: "credit_boundary_fixture", aggregateId: value.obligation.obligationId,
                idempotencyKey: `boundary:${value.obligation.obligationId}`,
                commandHash: hashId("credit_boundary", value.obligation.obligationId), events,
                writes: entries.map(([type, data], index) => ({ type, value: data, eventId: events[index].event.eventId })),
                response: { seeded: true }
              });
            }
            for (const table of ["risk_decisions", "obligations"]) {
              await client.query(`ALTER TABLE ${table} ENABLE TRIGGER ALL`);
            }
          });
          seen.add(key);
        },
        async projection(key) {
          return repository.withTenantRead(async (client) => (await client.query(
            "SELECT projection FROM credit_state_projections WHERE subject_id = $1", [this.subject(key)]
          )).rows[0]?.projection);
        },
        async view(key) {
          return repository.withTenantRead((client) => readOwnCreditStateQueryHandler().execute({
            client, resource: { resourceType: "subject", resourceId: this.subject(key) }, payload: {}, now: NOW
          }));
        }
      };
    }

    await t.test("513th write-off, early loss, late arrival, complete v1 read and replay", async () => {
      const scenario = await tenant("history");
      await scenario.seed("one", 0, 512, { losses: [0] });
      for (let i = 0; i < 6; i++) await scenario.materializer.run({ limit: 100 });
      const initial = await scenario.projection("one");
      assert.equal(initial.trackRecord.length, 512);
      await scenario.seed("one", 512, 1, { losses: [512] });
      await scenario.materializer.run();
      const state = await scenario.projection("one");
      assert.equal(state.metrics.completedCycleCount, 513);
      assert.equal(state.trackRecord.length, 513);
      assert.equal(state.metrics.outcomeCounts.writtenOff, 2);
      assert.equal(state.metrics.totalLossMinor, "4000");
      assert.equal(state.latestOutcome.outcomeLabel, "written_off");
      assert.equal(state.trackRecord[0].outcomeLabel, "written_off");
      assert.equal(state.factors.repaymentReliability, "adverse_loss_recorded");
      assert.deepEqual((await scenario.view("one")).creditState, state);
      await scenario.seed("one", 513, 1, { late: true, losses: [513] });
      await scenario.materializer.run();
      const late = await scenario.projection("one");
      assert.equal(late.metrics.completedCycleCount, 514);
      assert.equal(late.metrics.outcomeCounts.writtenOff, 3);
      assert.deepEqual(late.latestOutcome, state.latestOutcome);
      assert.equal(late.trackRecord[0].outcomeFinalizedAt, "2026-08-01T00:00:00.000Z");
      const replay = await scenario.materializer.run();
      assert.equal(replay.materializedCount, 0);
      assert.equal(replay.creditStateUpdatedCount, 0);
      assert.deepEqual(await scenario.projection("one"), late);
      assert.ok(instrument.fetches > 8);
      assert.ok(instrument.maxPage <= 64);
      assert.equal(instrument.timeout, "5s");
      const outcomes = await scenario.repository.withTenantRead(async (client) => (await client.query(
        "SELECT outcome FROM credit_outcomes WHERE subject_id = $1", [scenario.subject("one")]
      )).rows.map(({ outcome }) => outcome));
      assert.deepEqual(createCreditStateProjection({ outcomes, updatedAt: late.updatedAt }), late);
    });

    await t.test("more than 100 subjects rotate across default, cron and worker batches", async () => {
      const scenario = await tenant("rotation");
      for (let i = 0; i < 107; i++) await scenario.seed(String(i).padStart(3, "0"), 0, 1);
      for (let i = 0; i < 5; i++) await scenario.materializer.run();
      const count = await scenario.repository.withTenantRead(async (client) => (await client.query(
        "SELECT count(*)::int AS count FROM credit_state_projections"
      )).rows[0].count);
      assert.equal(count, 107);
      for (const limit of [25, 64, 100]) {
        const seen = new Set();
        // Deliberately keep an early subject hot: it must not monopolize a batch.
        for (let run = 0; run < Math.ceil(107 / limit); run++) {
          await scenario.seed("000", 1 + limit * 10 + run, 1);
          const result = await scenario.materializer.run({ limit });
          assert.ok(result.creditStateProjectionCount <= limit);
          for (const state of result.creditStates) seen.add(state.subjectId);
        }
        assert.equal(seen.size, 107);
      }
      await assert.rejects(scenario.materializer.run({ limit: 101 }), { code: "invalid_credit_outcome_materializer" });
      await assert.rejects(scenario.materializer.run({ limit: 0 }), { code: "invalid_credit_outcome_materializer" });
      await scenario.repository.withTenantWrite((client) => client.query(
        "DELETE FROM credit_state_projections WHERE subject_id = $1", [scenario.subject("106")]
      ));
      for (let i = 0; i < 5; i++) await scenario.materializer.run();
      assert.equal((await scenario.projection("106")).metrics.completedCycleCount, 1);
    });

    await t.test("concurrent refresh, locked subject and Tenant isolation", async () => {
      const first = await tenant("concurrent");
      const other = await tenant("other");
      for (let i = 0; i < 4; i++) await first.seed(String(i), 0, 1);
      await other.seed("0", 0, 1, { losses: [0] });
      await other.materializer.run();
      const otherBefore = await other.projection("0");
      const results = await Promise.all([first.materializer.run({ limit: 2 }), first.materializer.run({ limit: 2 })]);
      assert.equal(results.reduce((sum, result) => sum + result.materializedCount, 0), 4);
      await first.materializer.run();
      const locked = await app.connect();
      try {
        await locked.query("BEGIN");
        await locked.query("SELECT set_config('app.tenant_id', $1, true)", [first.repository.tenantContext.tenantId]);
        await locked.query("SELECT id FROM subjects WHERE id = $1 FOR NO KEY UPDATE", [first.subject("0")]);
        const skipped = await first.materializer.run();
        assert.equal(skipped.creditStates.some(({ subjectId }) => subjectId === first.subject("0")), false);
      } finally { await locked.query("ROLLBACK"); locked.release(); }
      const replay = await first.materializer.run();
      assert.equal(replay.creditStateUpdatedCount, 0);
      const foreign = await first.repository.withTenantRead((client) => client.query(
        "SELECT * FROM credit_state_projections WHERE subject_id = $1", [other.subject("0")]
      ));
      assert.equal(foreign.rowCount, 0);
      assert.deepEqual(await other.projection("0"), otherBefore);
      await first.seed("0", 1, 2, { losses: [1, 2] });
      await Promise.all([first.materializer.run({ limit: 1 }), first.materializer.run({ limit: 1 })]);
      await first.materializer.run();
      assert.equal((await first.projection("0")).metrics.completedCycleCount, 3);
      assert.equal((await first.projection("0")).metrics.outcomeCounts.writtenOff, 2);
    });

    await t.test("cursor snapshot excludes concurrent late insert until next refresh", async () => {
      const scenario = await tenant("snapshot", "read_committed");
      await scenario.seed("one", 0, 65);
      await scenario.materializer.run({ limit: 100 });
      await scenario.seed("one", 65, 1, { late: true, losses: [65] });
      // Lock the source Obligation in another transaction so the first worker
      // cannot materialize it; a second worker commits it during cursor fetch.
      const lock = await owner.connect();
      await lock.query("BEGIN");
      await lock.query("SELECT id FROM obligations WHERE id = $1 FOR UPDATE", [`obligation_credit_boundary_${runId}_snapshot_one_65`]);
      instrument.afterFetch = async () => {
        await lock.query("COMMIT");
        lock.release();
        await scenario.materializer.run({ limit: 100 });
      };
      await scenario.materializer.run({ limit: 100 });
      assert.equal((await scenario.projection("one")).metrics.completedCycleCount, 65);
      await assert.rejects(scenario.view("one"), { code: "credit_state_projection_incomplete" });
      await scenario.materializer.run();
      assert.equal((await scenario.view("one")).creditState.metrics.completedCycleCount, 66);
    });

    await t.test("resource rejection preserves prior state, fails reads closed and does not starve others", async () => {
      const scenario = await tenant("budget");
      await scenario.seed("one", 0, 1);
      await scenario.materializer.run();
      const before = await scenario.projection("one");
      await scenario.seed("one", 1, 450, { padding: 40_000 });
      const lock = await owner.connect();
      try {
        await lock.query("BEGIN");
        await lock.query("SELECT id FROM subjects WHERE id = $1 FOR NO KEY UPDATE", [scenario.subject("one")]);
        for (let i = 0; i < 5; i++) await scenario.materializer.run({ limit: 100 });
      } finally { await lock.query("ROLLBACK"); lock.release(); }
      const blocked = await scenario.materializer.run({ limit: 1 });
      assert.equal(blocked.creditStateBlockedCount, 1);
      assert.equal(blocked.creditStateProjectionCount, 0);
      assert.equal(blocked.creditStates[0].reasonCode, "credit_state_resource_limit");
      assert.deepEqual(await scenario.projection("one"), before);
      await assert.rejects(scenario.view("one"), { code: "credit_state_projection_incomplete" });
      await scenario.seed("two", 0, 1);
      await scenario.materializer.run({ limit: 1 });
      assert.equal((await scenario.view("two")).creditState.metrics.completedCycleCount, 1);
    });

    await t.test("stricter statement timeout is preserved and cancels atomically", async () => {
      const scenario = await tenant("timeout");
      await scenario.seed("one", 0, 1);
      await scenario.materializer.run();
      const before = await scenario.projection("one");
      await scenario.seed("one", 1, 1, { losses: [1] });
      const write = scenario.repository.withTenantWrite.bind(scenario.repository);
      scenario.repository.withTenantWrite = (operation) => write(async client => {
        await client.query("SET LOCAL statement_timeout = '25ms'");
        return operation(client);
      });
      instrument.slowFetch = true;
      await assert.rejects(scenario.materializer.run(), { code: "57014" });
      assert.deepEqual(await scenario.projection("one"), before);
      const count = await scenario.repository.withTenantRead(async client => (await client.query(
        "SELECT count(*)::int AS count FROM credit_outcomes"
      )).rows[0].count);
      assert.equal(count, 1, "new outcome and refresh metadata roll back with the failed run");
      scenario.repository.withTenantWrite = write;
      await scenario.materializer.run();
      assert.equal((await scenario.view("one")).creditState.metrics.completedCycleCount, 2);
    });

    await t.test("refresh metadata migration rolls back without changing v1 projections", async () => {
      const before = (await owner.query("SELECT subject_id, projection FROM credit_state_projections ORDER BY subject_id")).rows;
      const down = await readFile(new URL("../../../db/migrations/0088_credit_state_refresh_rotation.down.sql", import.meta.url), "utf8");
      const up = await readFile(new URL("../../../db/migrations/0088_credit_state_refresh_rotation.up.sql", import.meta.url), "utf8");
      await owner.query(down);
      await owner.query(up);
      assert.deepEqual((await owner.query("SELECT subject_id, projection FROM credit_state_projections ORDER BY subject_id")).rows, before);
    });
  } finally {
    if (app) await app.end();
    await owner.query(`DROP OWNED BY ${role}`);
    await owner.query(`DROP ROLE ${role}`);
    await owner.end();
  }
});
