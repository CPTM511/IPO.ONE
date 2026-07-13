import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import {
  PilotCapability,
  RoleBundle
} from "../../authorization/src/index.js";
import { createAuthorizationHarness } from "../../authorization/test/support/authorization-fixture.js";
import {
  PostgresCoreRepository,
  PostgresEventRepository,
  PostgresReconciliationService,
  assertTenantDatabaseRole,
  createPostgresPool,
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../persistence/src/index.js";
import { migrateUp } from "../../../scripts/migrate.mjs";
import {
  AgentTenantCommandClient,
  HumanTenantCommandClient,
  TenantCommandGateway,
  TenantCommandHandlerRegistry,
  createAgentSubjectHandlers
} from "../src/index.js";

const CONNECTION_STRING = process.env.DATABASE_URL;
const RUN_ID = randomBytes(5).toString("hex");
const IDENTITY_NOW = new Date(Date.now() - 60_000);
const TENANT_ONE = `tenant_gateway_one_${RUN_ID}`;
const TENANT_TWO = `tenant_gateway_two_${RUN_ID}`;
const APP_ROLE = `ipo_gateway_${RUN_ID}`;

async function withTenantTransaction(pool, context, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantTransactionContext(client, context);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function seedTenant(pool, tenantId) {
  await pool.query(
    `INSERT INTO tenants(
       id, tenant_hash, organization_ref, display_name, status,
       pilot_jurisdiction, legal_retention_owner_ref, created_at,
       updated_at, schema_version
     ) VALUES ($1, $2, $3, $4, 'active', 'US', $5, $6, $6, 'tenant.v1')`,
    [
      tenantId,
      hashId("gateway_test_tenant", tenantId),
      `org:${tenantId}`,
      `Gateway Test ${tenantId}`,
      `org:${tenantId}:retention`,
      IDENTITY_NOW
    ]
  );
}

async function seedIdentity(pool, tenantId, identity, { controllerActorId } = {}) {
  const { authenticationContext: context, membership } = identity;
  await pool.query(
    `INSERT INTO actors(
       id, actor_hash, actor_type, status, created_at, updated_at, schema_version
     ) VALUES ($1, $2, $3, 'active', $4, $4, 'actor.v1')`,
    [context.actorId, hashId("gateway_test_actor", context.actorId), context.actorType, IDENTITY_NOW]
  );
  const seedContext = createTenantSecurityContext({
    tenantId,
    actorId: context.actorId,
    policyVersion: context.policyVersion,
    source: "local_test"
  });
  await withTenantTransaction(pool, seedContext, (client) => client.query(
    `INSERT INTO memberships(
       id, membership_hash, tenant_id, actor_id, role_bundle, capabilities,
       client_ids, policy_version, controller_actor_id, status, valid_from, expires_at,
       created_at, updated_at, version, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6::jsonb,
       $7::jsonb, $8, $9, 'active', $10, NULL,
       $10, $10, 1, 'membership.v1'
     )`,
    [
      membership.membershipId,
      hashId("gateway_test_membership", membership.membershipId),
      tenantId,
      context.actorId,
      membership.roleBundle,
      JSON.stringify(membership.capabilities),
      JSON.stringify(membership.clientIds),
      membership.policyVersion,
      controllerActorId ?? null,
      IDENTITY_NOW
    ]
  ));
}

function gateway(pool, harness) {
  return new TenantCommandGateway({
    pool,
    handlers: new TenantCommandHandlerRegistry(createAgentSubjectHandlers()),
    policyRegistry: harness.policyRegistry,
    credentialRegistry: harness.credentialRegistry,
    referenceHasher: harness.referenceHasher
  });
}

function humanClient(runtime, authenticationContext) {
  return new HumanTenantCommandClient({
    gateway: runtime,
    authenticationContextProvider: async () => authenticationContext
  });
}

function agentClient(runtime, authenticationContext) {
  return new AgentTenantCommandClient({
    gateway: runtime,
    authenticationContextProvider: async () => authenticationContext
  });
}

function createCommand({ subjectActorId, displayName, idempotencyKey }) {
  return {
    payload: { subjectActorId, displayName, jurisdiction: "US" },
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
    correlationId: `correlation_${idempotencyKey}`
  };
}

test("durable Tenant Command Gateway is isolated, atomic, and restart-safe", { timeout: 90_000 }, async (t) => {
  assert.ok(CONNECTION_STRING, "DATABASE_URL is required");
  const ownerPool = createPostgresPool({
    connectionString: CONNECTION_STRING,
    max: 8,
    applicationName: "ipo-one-gateway-owner-test"
  });
  let appPool;
  const dropRole = async () => {
    const exists = await ownerPool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
    if (exists.rowCount === 0) return;
    await ownerPool.query(`DROP OWNED BY ${APP_ROLE}`);
    await ownerPool.query(`DROP ROLE ${APP_ROLE}`);
  };

  try {
    await migrateUp({ pool: ownerPool });
    const harness = createAuthorizationHarness();
    const identities = {
      tenantOneHuman: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_human_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.DEVELOPER,
        capabilities: [PilotCapability.AGENT_CREATE],
        now: IDENTITY_NOW
      }),
      tenantOneAgent: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_agent_${RUN_ID}`,
        actorType: ActorType.AGENT,
        roleBundle: RoleBundle.AGENT_RUNTIME,
        capabilities: [PilotCapability.SUBJECT_READ_SELF],
        now: IDENTITY_NOW
      }),
      tenantOneOtherHuman: harness.addIdentity({
        tenantId: TENANT_ONE,
        actorId: `actor_gateway_one_other_human_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.DEVELOPER,
        capabilities: [PilotCapability.AGENT_CREATE],
        now: IDENTITY_NOW
      }),
      tenantTwoHuman: harness.addIdentity({
        tenantId: TENANT_TWO,
        actorId: `actor_gateway_two_human_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.DEVELOPER,
        capabilities: [PilotCapability.AGENT_CREATE],
        now: IDENTITY_NOW
      }),
      tenantTwoAgent: harness.addIdentity({
        tenantId: TENANT_TWO,
        actorId: `actor_gateway_two_agent_${RUN_ID}`,
        actorType: ActorType.AGENT,
        roleBundle: RoleBundle.AGENT_RUNTIME,
        capabilities: [PilotCapability.SUBJECT_READ_SELF],
        now: IDENTITY_NOW
      })
    };
    await seedTenant(ownerPool, TENANT_ONE);
    await seedTenant(ownerPool, TENANT_TWO);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneHuman);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneOtherHuman);
    await seedIdentity(ownerPool, TENANT_ONE, identities.tenantOneAgent, {
      controllerActorId: identities.tenantOneHuman.authenticationContext.actorId
    });
    await seedIdentity(ownerPool, TENANT_TWO, identities.tenantTwoHuman);
    await seedIdentity(ownerPool, TENANT_TWO, identities.tenantTwoAgent, {
      controllerActorId: identities.tenantTwoHuman.authenticationContext.actorId
    });

    await dropRole();
    const password = randomBytes(24).toString("base64url");
    const quotedPassword = (await ownerPool.query("SELECT quote_literal($1) AS value", [password])).rows[0].value;
    await ownerPool.query(
      `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD ${quotedPassword}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
    await ownerPool.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await ownerPool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
    await ownerPool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
    await ownerPool.query(`GRANT UPDATE (id) ON actors, memberships, access_grants TO ${APP_ROLE}`);
    await ownerPool.query(
      `GRANT INSERT ON
         authorization_resources, authorization_resource_bindings,
         authorization_audit_events, tenant_command_executions
       TO ${APP_ROLE}`
    );
    await ownerPool.query(
      `GRANT UPDATE (resource_id) ON
         authorization_resources, authorization_resource_bindings
       TO ${APP_ROLE}`
    );
    await ownerPool.query(
      `GRANT INSERT, UPDATE, DELETE ON
         abuse_rate_buckets, abuse_capacity_buckets, abuse_admissions,
         abuse_command_charges, principals, subjects,
         aggregate_stream_heads, domain_events, credit_events,
         evidence_envelopes, outbox_messages, command_idempotency,
         command_events, projection_registry, projection_snapshots,
         reconciliation_runs, reconciliation_discrepancies
       TO ${APP_ROLE}`
    );
    const appConnection = new URL(CONNECTION_STRING);
    appConnection.username = APP_ROLE;
    appConnection.password = password;
    appPool = createPostgresPool({
      connectionString: appConnection.toString(),
      max: 12,
      applicationName: "ipo-one-gateway-runtime-test"
    });
    await assertTenantDatabaseRole(appPool);

    const runtime = gateway(appPool, harness);
    const tenantOneHuman = humanClient(runtime, identities.tenantOneHuman.authenticationContext);
    const tenantOneOtherHuman = humanClient(runtime, identities.tenantOneOtherHuman.authenticationContext);
    const tenantOneAgent = agentClient(runtime, identities.tenantOneAgent.authenticationContext);
    const tenantTwoHuman = humanClient(runtime, identities.tenantTwoHuman.authenticationContext);
    const tenantTwoAgent = agentClient(runtime, identities.tenantTwoAgent.authenticationContext);
    const firstCommand = createCommand({
      subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
      displayName: "Tenant One Treasury Agent",
      idempotencyKey: `create-agent-one-${RUN_ID}-0001`
    });
    let tenantOneSubjectId;

    await t.test("Human command and Agent query share one durable protocol", async () => {
      const created = await tenantOneHuman.createAgentSubject(firstCommand);
      tenantOneSubjectId = created.response.subjectId;
      assert.equal(created.replayed, false);
      assert.equal(created.response.subjectType, "agent");

      const self = await tenantOneAgent.getSelf({
        subjectId: tenantOneSubjectId,
        requestId: `request-agent-self-${RUN_ID}`,
        correlationId: `correlation-agent-self-${RUN_ID}`
      });
      assert.equal(self.response.subject.subjectId, tenantOneSubjectId);
      assert.equal(self.response.subject.displayName, "Tenant One Treasury Agent");

      const counts = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM projection_snapshots WHERE tenant_id = $1) AS snapshots,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions,
           (SELECT count(*)::int FROM authorization_audit_events WHERE tenant_id = $1) AS audits`,
        [TENANT_ONE]
      );
      assert.deepEqual(counts.rows[0], { events: 2, snapshots: 2, executions: 1, audits: 4 });
    });

    await t.test("cross-Tenant object reads fail closed and commit only bounded denial audit", async () => {
      const before = await ownerPool.query(
        "SELECT count(*)::int AS count FROM projection_snapshots WHERE tenant_id = $1",
        [TENANT_TWO]
      );
      await assert.rejects(
        () => tenantTwoAgent.getSelf({
          subjectId: tenantOneSubjectId,
          requestId: `request-cross-tenant-${RUN_ID}`,
          correlationId: `correlation-cross-tenant-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      const after = await ownerPool.query(
        "SELECT count(*)::int AS count FROM projection_snapshots WHERE tenant_id = $1",
        [TENANT_TWO]
      );
      assert.equal(after.rows[0].count, before.rows[0].count);
      const denial = await ownerPool.query(
        `SELECT authorization_decision, reason_code, client_ref_hash
           FROM authorization_audit_events
          WHERE tenant_id = $1 AND request_id = $2`,
        [TENANT_TWO, `request-cross-tenant-${RUN_ID}`]
      );
      assert.equal(denial.rowCount, 1);
      assert.equal(denial.rows[0].authorization_decision, "deny");
      assert.equal(denial.rows[0].reason_code, "resource_access_denied");
      assert.match(denial.rows[0].client_ref_hash, /^[A-Za-z0-9_-]{43}$/);
      assert.notEqual(denial.rows[0].client_ref_hash, identities.tenantTwoAgent.authenticationContext.clientId);
    });

    await t.test("same-Tenant Human cannot claim an Agent assigned to another controller", async () => {
      const before = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      await assert.rejects(
        () => tenantOneOtherHuman.createAgentSubject(createCommand({
          subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
          displayName: "Controller Claim Must Fail",
          idempotencyKey: `create-agent-controller-denied-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_resource_rejected"
      );
      const after = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      assert.deepEqual(after.rows[0], before.rows[0]);
    });

    await t.test("process restart recovers exact response before mutable object revalidation", async () => {
      const restarted = gateway(appPool, harness);
      const replay = await humanClient(
        restarted,
        identities.tenantOneHuman.authenticationContext
      ).createAgentSubject(firstCommand);
      assert.equal(replay.replayed, true);
      assert.equal(replay.response.subjectId, tenantOneSubjectId);

      await assert.rejects(
        () => humanClient(restarted, identities.tenantOneHuman.authenticationContext).createAgentSubject({
          ...firstCommand,
          payload: { ...firstCommand.payload, displayName: "Tampered Retry" }
        }),
        (error) => error.code === "event_idempotency_conflict"
      );
      const counts = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      assert.deepEqual(counts.rows[0], { events: 2, executions: 1 });
    });

    await t.test("Tenant authority derives from context for every implemented object operation", async () => {
      const secondCommand = createCommand({
        subjectActorId: identities.tenantTwoAgent.authenticationContext.actorId,
        displayName: "Tenant Two Treasury Agent",
        idempotencyKey: `create-agent-two-${RUN_ID}-0001`
      });
      const created = await tenantTwoHuman.createAgentSubject(secondCommand);
      const subjectId = created.response.subjectId;
      const own = await tenantTwoAgent.getSelf({
        subjectId,
        requestId: `request-agent-two-self-${RUN_ID}`,
        correlationId: `correlation-agent-two-self-${RUN_ID}`
      });
      assert.equal(own.response.subject.subjectId, subjectId);
      await assert.rejects(
        () => tenantOneAgent.getSelf({
          subjectId,
          requestId: `request-agent-one-cross-${RUN_ID}`,
          correlationId: `correlation-agent-one-cross-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
    });

    await t.test("authorization denial creates no business projection", async () => {
      const before = await ownerPool.query(
        "SELECT count(*)::int AS count FROM projection_snapshots WHERE tenant_id = $1",
        [TENANT_TWO]
      );
      await assert.rejects(
        () => runtime.execute({
          authenticationContext: identities.tenantTwoAgent.authenticationContext,
          operationId: "pilotCreateAgentSubject",
          payload: {
            subjectActorId: identities.tenantTwoAgent.authenticationContext.actorId,
            displayName: "Unauthorized Agent Creation"
          },
          idempotencyKey: `unauthorized-create-${RUN_ID}-0001`,
          requestId: `request-unauthorized-create-${RUN_ID}`,
          correlationId: `correlation-unauthorized-create-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      const after = await ownerPool.query(
        "SELECT count(*)::int AS count FROM projection_snapshots WHERE tenant_id = $1",
        [TENANT_TWO]
      );
      assert.equal(after.rows[0].count, before.rows[0].count);
      const audit = await ownerPool.query(
        `SELECT authorization_decision, reason_code
           FROM authorization_audit_events
          WHERE tenant_id = $1 AND request_id = $2`,
        [TENANT_TWO, `request-unauthorized-create-${RUN_ID}`]
      );
      assert.deepEqual(audit.rows, [{ authorization_decision: "deny", reason_code: "actor_capability_rejected" }]);
    });

    await t.test("concurrent duplicate mutation executes once and then replays", async () => {
      const concurrentCommand = createCommand({
        subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
        displayName: "Concurrent Treasury Agent",
        idempotencyKey: `create-agent-concurrent-${RUN_ID}-0001`
      });
      const before = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      const settled = await Promise.allSettled([
        tenantOneHuman.createAgentSubject(concurrentCommand),
        tenantOneHuman.createAgentSubject(concurrentCommand)
      ]);
      const fulfilled = settled.filter(({ status }) => status === "fulfilled");
      assert.equal(fulfilled.length >= 1, true);
      assert.equal(fulfilled.filter(({ value }) => value.replayed === false).length, 1);
      if (fulfilled.length === 2) {
        assert.equal(fulfilled.filter(({ value }) => value.replayed === true).length, 1);
        assert.equal(fulfilled[0].value.response.subjectId, fulfilled[1].value.response.subjectId);
      }
      const rejected = settled.find(({ status }) => status === "rejected");
      if (rejected) {
        assert.equal(
          ["idempotency_in_progress", "request_admission_consumed"].includes(rejected.reason.code),
          true
        );
      }
      const after = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
      assert.equal(after.rows[0].events, before.rows[0].events + 1);
      assert.equal(after.rows[0].executions, before.rows[0].executions + 1);
      const replay = await tenantOneHuman.createAgentSubject(concurrentCommand);
      assert.equal(replay.replayed, true);
    });

    await t.test("concurrent Agent membership revocation invalidates resource binding atomically", async () => {
      const context = createTenantSecurityContext({
        tenantId: TENANT_TWO,
        actorId: identities.tenantTwoHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      const client = await ownerPool.connect();
      const before = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_TWO]
      );
      try {
        await client.query("BEGIN");
        await setTenantTransactionContext(client, context);
        await client.query(
          `UPDATE memberships
              SET status = 'revoked', updated_at = clock_timestamp(), version = version + 1
            WHERE tenant_id = $1 AND actor_id = $2`,
          [TENANT_TWO, identities.tenantTwoAgent.authenticationContext.actorId]
        );
        const command = tenantTwoHuman.createAgentSubject(createCommand({
          subjectActorId: identities.tenantTwoAgent.authenticationContext.actorId,
          displayName: "Revoked Binding Must Roll Back",
          idempotencyKey: `create-agent-revoked-race-${RUN_ID}-0001`
        }));
        await new Promise((resolve) => setTimeout(resolve, 50));
        await client.query("COMMIT");
        await assert.rejects(command, (error) => error.code === "stale_aggregate_version");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original failure.
        }
        throw error;
      } finally {
        client.release();
      }
      const after = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_TWO]
      );
      assert.deepEqual(after.rows[0], before.rows[0]);
    });

    await t.test("append-only command authority and audit rows reject tampering", async () => {
      const context = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await assert.rejects(
        () => withTenantTransaction(ownerPool, context, (client) => client.query(
          "UPDATE tenant_command_executions SET operation_id = 'tampered' WHERE tenant_id = $1",
          [TENANT_ONE]
        )),
        /append-only rows cannot be updated or deleted/
      );
      await assert.rejects(
        () => withTenantTransaction(ownerPool, context, (client) => client.query(
          "DELETE FROM authorization_audit_events WHERE tenant_id = $1",
          [TENANT_ONE]
        )),
        /append-only rows cannot be updated or deleted/
      );
      await assert.rejects(
        () => withTenantTransaction(ownerPool, context, (client) => client.query(
          "DELETE FROM memberships WHERE tenant_id = $1 AND actor_id = $2",
          [TENANT_ONE, identities.tenantOneAgent.authenticationContext.actorId]
        )),
        /membership deletion is prohibited/
      );
      await assert.rejects(
        () => withTenantTransaction(ownerPool, context, (client) => client.query(
          `DELETE FROM authorization_resource_bindings
            WHERE tenant_id = $1 AND resource_type = 'subject' AND resource_id = $2`,
          [TENANT_ONE, tenantOneSubjectId]
        )),
        /authorization resource binding deletion is prohibited/
      );
    });

    await t.test("full reconciliation remains clean after complete Gateway flows", async () => {
      for (const [tenantId, identity] of [
        [TENANT_ONE, identities.tenantOneHuman],
        [TENANT_TWO, identities.tenantTwoHuman]
      ]) {
        const context = createTenantSecurityContext({
          tenantId,
          actorId: identity.authenticationContext.actorId,
          policyVersion: "security_001.v1",
          source: "local_test"
        });
        const eventRepository = new PostgresEventRepository({ pool: appPool, tenantContext: context });
        const coreRepository = new PostgresCoreRepository({ pool: appPool, eventRepository });
        const reconciliation = new PostgresReconciliationService({
          pool: appPool,
          eventRepository,
          coreRepository,
          release: "data-003-local-test"
        });
        const result = await reconciliation.run({
          initiatedBy: `system:data-003:${tenantId}`,
          idempotencyKey: `reconcile-${tenantId}-${RUN_ID}`
        });
        assert.equal(result.status, "passed", JSON.stringify(await reconciliation.getRun(result.runId)));
        assert.equal(result.discrepancyCount, 0);
      }
    });
  } finally {
    if (appPool) await appPool.end();
    try {
      await dropRole();
    } finally {
      await ownerPool.end();
    }
  }
});
