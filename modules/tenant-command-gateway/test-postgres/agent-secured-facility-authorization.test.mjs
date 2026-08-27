import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  CreditEventType,
  authorizeAgentSecuredFacilityIntent,
  createAgentSecuredFacilityAuthorization,
  createCreditEvent,
  hashId,
  revokeAgentSecuredFacilityAuthorization
} from "../../../packages/domain/src/index.js";
import {
  CoreProjectionType,
  PostgresCoreRepository,
  PostgresEventRepository,
  assertTenantDatabaseRole,
  createPostgresPool,
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../persistence/src/index.js";

const CONNECTION_STRING = process.env.DATABASE_URL;
const NOW = new Date("2026-08-25T12:00:00.000Z");

function resources(suffix) {
  const subjectId = `subject_agent_m2b001_${suffix}`;
  const principalId = `principal_m2b001_${suffix}`;
  const mandateId = `mandate_m2b001_${suffix}`;
  const accountBindingId = `account_binding_m2b001_${suffix}`;
  const obligationId = `obligation_m2b001_${suffix}`;
  const poolObligationBindingId = `pool_obligation_binding_m2b001_${suffix}`;
  const tradingFacilityId = `trading_facility_m2b001_${suffix}`;
  const h = (label) => hashId(`m2b001_${label}`, suffix);
  return {
    subject: { subjectId, subjectType: "agent", status: "active", primaryPrincipalId: principalId },
    principal: { principalId, status: "active" },
    mandate: {
      mandateId, mandateHash: h("mandate"), subjectId, principalId,
      capabilities: ["execute_sandbox_credit"], validFrom: "2026-08-25T00:00:00.000Z",
      expiresAt: "2026-09-25T00:00:00.000Z", status: "active", sandboxOnly: true,
      productionAuthority: false, schemaVersion: "mandate.v3"
    },
    accountBinding: {
      accountBindingId, subjectId, accountHash: h("account"), chainId: "eip155:84532",
      purpose: "execution", bindingKind: "execution", status: "active",
      schemaVersion: "account_binding.v3"
    },
    obligation: {
      obligationId, obligationHash: h("obligation"), subjectId, principalId, mandateId,
      authorityRef: mandateId, status: "active", executionStatus: "executed",
      poolObligationBindingId, poolExecutionReceiptId: `pool_execution_receipt_m2b001_${suffix}`,
      sandboxExecutionReceiptId: null, sandboxOnly: true, productionFundsMoved: false,
      withdrawable: false, schemaVersion: "obligation.v2"
    },
    poolObligationBinding: {
      poolObligationBindingId, bindingHash: h("pool_binding"), subjectId, principalId,
      accountBindingId, obligationId, chainId: "eip155:84532", entryMode: "agent",
      selfPrincipal: true, status: "active", syntheticOnly: true,
      productionFundsMoved: false, schemaVersion: "pool_obligation_binding.v1"
    },
    poolObligationProjection: {
      poolObligationBindingId, obligationId, projectionHash: h("pool_projection"),
      lifecycleStatus: "active", badDebtAssets: "0",
      canonicalObligationRemainsAuthoritative: true, creditStateAuthorizing: false,
      automaticLimitChange: false, syntheticOnly: true, productionFundsMoved: false,
      schemaVersion: "pool_obligation_projection.v1"
    },
    tradingFacility: {
      tradingFacilityId, facilityHash: h("facility"), stateHash: h("facility_state"),
      version: 4, subjectId, principalId, obligationId, lifecycleStatus: "active",
      riskState: "NORMAL", maturityAt: "2026-09-20T00:00:00.000Z",
      linkedCanonicalObligation: true, secondLedgerCreated: false, sandboxOnly: true,
      syntheticOnly: true, withdrawable: false, transferable: false,
      productionAuthority: false, fundsAuthority: false, schemaVersion: "trading_facility.v1"
    }
  };
}

function event(eventType, authorization, at) {
  return createCreditEvent({
    eventType,
    chainId: authorization.chainId,
    payload: {
      agentSecuredFacilityAuthorizationId: authorization.agentSecuredFacilityAuthorizationId,
      authorizationHash: authorization.authorizationHash,
      status: authorization.status,
      version: authorization.version,
      preSigningOnly: true,
      nonceCreated: false,
      signatureCreated: false,
      networkCalled: false,
      fundsMoved: false
    },
    now: at
  });
}

function command({ authorization, eventType, expectedVersion, idempotencyKey, now }) {
  const creditEvent = event(eventType, authorization, now);
  return {
    aggregateType: "agent_secured_facility_authorization",
    aggregateId: authorization.agentSecuredFacilityAuthorizationId,
    idempotencyKey,
    commandHash: hashId("m2b001_postgres_command", {
      idempotencyKey,
      authorizationHash: authorization.authorizationHash,
      status: authorization.status,
      version: authorization.version
    }),
    events: [{
      aggregateType: "agent_secured_facility_authorization",
      aggregateId: authorization.agentSecuredFacilityAuthorizationId,
      expectedVersion,
      event: creditEvent
    }],
    writes: [{
      type: CoreProjectionType.AGENT_SECURED_FACILITY_AUTHORIZATION,
      value: authorization,
      eventId: creditEvent.eventId
    }],
    response: {
      authorization,
      preSigningOnly: true,
      nonceCreated: false,
      signatureCreated: false,
      networkCalled: false,
      fundsMoved: false
    }
  };
}

async function withContext(pool, context, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantTransactionContext(client, context);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

test("M2B-001 PostgreSQL authorization is atomic, replay-safe, RLS-isolated and revoked after restart", { timeout: 30_000 }, async () => {
  assert.ok(CONNECTION_STRING, "DATABASE_URL is required");
  const suffix = randomBytes(6).toString("hex");
  const tenantId = `tenant_m2b001_${suffix}`;
  const otherTenantId = `tenant_m2b001_other_${suffix}`;
  const appRole = `ipo_one_m2b001_${suffix}`;
  const ownerPool = createPostgresPool({
    connectionString: CONNECTION_STRING,
    max: 4,
    applicationName: "m2b001-owner"
  });
  const context = createTenantSecurityContext({
    tenantId,
    actorId: `actor_m2b001_${suffix}`,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  const otherContext = createTenantSecurityContext({
    tenantId: otherTenantId,
    actorId: `actor_m2b001_other_${suffix}`,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  let appPool;
  let triggersDisabled = false;
  try {
    await ownerPool.query(
      `INSERT INTO tenants(
         id, tenant_hash, organization_ref, display_name, status,
         pilot_jurisdiction, legal_retention_owner_ref, created_at,
         updated_at, schema_version
       ) VALUES ($1, $2, $3, 'M2B-001 Test', 'active', 'US', $4, $5, $5, 'tenant.v1')`,
      [tenantId, hashId("m2b001_tenant", tenantId), `org:${tenantId}`, `org:${tenantId}:retention`, NOW]
    );
    const password = randomBytes(24).toString("base64url");
    const quoted = (await ownerPool.query("SELECT quote_literal($1) AS value", [password])).rows[0].value;
    await ownerPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD ${quoted}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
    await ownerPool.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await ownerPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}`);
    await ownerPool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appRole}`);
    await ownerPool.query("TRUNCATE agent_secured_facility_authorizations CASCADE");
    await ownerPool.query("ALTER TABLE agent_secured_facility_authorizations DISABLE TRIGGER ALL");
    triggersDisabled = true;
    await ownerPool.query(
      "ALTER TABLE agent_secured_facility_authorizations ENABLE TRIGGER agent_secured_facility_authorizations_guard"
    );
    await ownerPool.query(
      "ALTER TABLE agent_secured_facility_authorizations ENABLE TRIGGER tenant_context_guard_agent_secured_facility_authorizations"
    );

    const appUrl = new URL(CONNECTION_STRING);
    appUrl.username = appRole;
    appUrl.password = password;
    appPool = createPostgresPool({
      connectionString: appUrl.toString(),
      max: 4,
      applicationName: "m2b001-app"
    });
    await assertTenantDatabaseRole(appPool);
    const authorization = createAgentSecuredFacilityAuthorization({
      ...resources(suffix),
      now: NOW
    });
    const createInput = command({
      authorization,
      eventType: CreditEventType.AGENT_SECURED_FACILITY_AUTHORIZATION_CREATED,
      expectedVersion: 0,
      idempotencyKey: `m2b001-create-${suffix}`,
      now: NOW
    });
    const firstRepository = new PostgresCoreRepository({
      pool: appPool,
      eventRepository: new PostgresEventRepository({ pool: appPool, tenantContext: context })
    });
    const first = await firstRepository.commitCommand(createInput);
    const replayRepository = new PostgresCoreRepository({
      pool: appPool,
      eventRepository: new PostgresEventRepository({ pool: appPool, tenantContext: context })
    });
    const replay = await replayRepository.commitCommand(createInput);
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.response, first.response);

    const durable = await withContext(appPool, context, async (client) => ({
      rows: await client.query("SELECT count(*)::int AS count FROM agent_secured_facility_authorizations"),
      events: await client.query(
        "SELECT count(*)::int AS count FROM domain_events WHERE aggregate_type = 'agent_secured_facility_authorization'"
      ),
      evidence: await client.query(
        "SELECT count(*)::int AS count FROM evidence_envelopes WHERE aggregate_type = 'agent_secured_facility_authorization'"
      )
    }));
    assert.equal(durable.rows.rows[0].count, 1);
    assert.equal(durable.events.rows[0].count, 1);
    assert.equal(durable.evidence.rows[0].count, 1);
    const hidden = await withContext(appPool, otherContext, (client) =>
      client.query("SELECT * FROM agent_secured_facility_authorizations")
    );
    assert.equal(hidden.rowCount, 0);

    const revokedAt = new Date("2026-08-25T12:01:00.000Z");
    const revoked = revokeAgentSecuredFacilityAuthorization(authorization, {
      expectedAuthorizationHash: authorization.authorizationHash,
      expectedVersion: 1,
      revokedAt
    });
    await replayRepository.commitCommand(command({
      authorization: revoked,
      eventType: CreditEventType.AGENT_SECURED_FACILITY_AUTHORIZATION_REVOKED,
      expectedVersion: 1,
      idempotencyKey: `m2b001-revoke-${suffix}`,
      now: revokedAt
    }));
    const restarted = new PostgresCoreRepository({
      pool: appPool,
      eventRepository: new PostgresEventRepository({ pool: appPool, tenantContext: context })
    });
    const restored = await restarted.getAgentSecuredFacilityAuthorization(
      authorization.agentSecuredFacilityAuthorizationId
    );
    assert.equal(restored.status, "revoked");
    assert.equal(restored.version, 2);
    assert.throws(() => authorizeAgentSecuredFacilityIntent(restored, {
      kind: "close",
      expectedAuthorizationHash: restored.authorizationHash,
      expectedVersion: restored.version,
      currentResourceHashes: {},
      now: revokedAt
    }), { code: "agent_secured_facility_authorization_unavailable" });
    const history = await withContext(appPool, context, (client) => client.query(
      `SELECT
         (SELECT count(*)::int FROM domain_events WHERE aggregate_type = 'agent_secured_facility_authorization') AS events,
         (SELECT count(*)::int FROM evidence_envelopes WHERE aggregate_type = 'agent_secured_facility_authorization') AS evidence`
    ));
    assert.deepEqual(history.rows[0], { events: 2, evidence: 2 });
  } finally {
    await appPool?.end();
    if (triggersDisabled) {
      await ownerPool.query("TRUNCATE agent_secured_facility_authorizations CASCADE");
      await ownerPool.query("ALTER TABLE agent_secured_facility_authorizations ENABLE TRIGGER ALL");
    }
    const role = await ownerPool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole]);
    if (role.rowCount > 0) {
      await ownerPool.query(`DROP OWNED BY ${appRole}`);
      await ownerPool.query(`DROP ROLE ${appRole}`);
    }
    await ownerPool.end();
  }
});
