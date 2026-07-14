import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  CreditEventType,
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";
import { TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION } from "../../../packages/api-contract/src/index.js";
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
  createPostgresTenantLivePolicyAdapter,
  createTenantFoundationHandlers
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

function gateway(pool, harness, handlers = createTenantFoundationHandlers()) {
  return new TenantCommandGateway({
    pool,
    handlers: new TenantCommandHandlerRegistry(handlers),
    policyRegistry: harness.policyRegistry,
    credentialRegistry: harness.credentialRegistry,
    referenceHasher: harness.referenceHasher,
    livePolicyAdapterFactory: createPostgresTenantLivePolicyAdapter
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

function createMandateCommand({ subjectId, idempotencyKey, nonce = `${idempotencyKey}-nonce`, overrides = {} }) {
  const validFrom = new Date(Date.now() - 30_000);
  const expiresAt = new Date(validFrom.getTime() + 180 * 86_400_000);
  return {
    subjectId,
    payload: {
      capabilities: ["request_credit", "provider_spend", "capture_revenue", "route_repayment"],
      allowedProviderIds: ["provider_gateway_compute"],
      allowedCategories: ["compute"],
      assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
      perActionLimitMinor: "100000",
      aggregateLimitMinor: "500000",
      validFrom: validFrom.toISOString(),
      expiresAt: expiresAt.toISOString(),
      nonce,
      termsRef: "urn:ipo.one:test:gateway-mandate:v1",
      ...overrides
    },
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
    correlationId: `correlation_${idempotencyKey}`
  };
}

function revokeMandateCommand({ mandateId, idempotencyKey, reasonCode = "operator_request" }) {
  return {
    mandateId,
    reasonCode,
    idempotencyKey,
    requestId: `request_${idempotencyKey}`,
    correlationId: `correlation_${idempotencyKey}`
  };
}

async function transitionProjection({
  pool,
  tenantId,
  actorId,
  entityType,
  entityId,
  nextStatus,
  idempotencyKey
}) {
  const context = createTenantSecurityContext({
    tenantId,
    actorId,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  const eventRepository = new PostgresEventRepository({ pool, tenantContext: context });
  const coreRepository = new PostgresCoreRepository({ pool, eventRepository });
  const projection = entityType === "subject"
    ? await coreRepository.getSubject(entityId)
    : await coreRepository.getPrincipal(entityId);
  const registration = await coreRepository.getProjectionRegistration(entityType, entityId);
  const now = new Date();
  const event = createCreditEvent({
    eventType: entityType === "subject"
      ? CreditEventType.SUBJECT_STATUS_CHANGED
      : "principal_status_changed",
    ...(entityType === "subject" ? { subjectId: entityId } : {}),
    payload: { entityType, entityId, previousStatus: projection.status, nextStatus },
    now
  });
  return coreRepository.commitCommand({
    aggregateType: entityType,
    aggregateId: entityId,
    idempotencyKey,
    commandHash: hashId("gateway_test_status_transition", {
      tenantId,
      entityType,
      entityId,
      nextStatus,
      idempotencyKey
    }),
    events: [{
      aggregateType: entityType,
      aggregateId: entityId,
      expectedVersion: registration.aggregateVersion,
      event
    }],
    writes: [{
      type: entityType,
      value: {
        ...projection,
        status: nextStatus,
        ...(entityType === "subject" ? { updatedAt: now.toISOString() } : {})
      },
      eventId: event.eventId
    }],
    response: { entityType, entityId, status: nextStatus }
  });
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
        capabilities: [
          PilotCapability.AGENT_CREATE,
          PilotCapability.INTEGRATION_READ_OWNED,
          PilotCapability.MANDATE_DRAFT_CREATE,
          PilotCapability.MANDATE_DRAFT_REVOKE
        ],
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
        capabilities: [
          PilotCapability.AGENT_CREATE,
          PilotCapability.INTEGRATION_READ_OWNED,
          PilotCapability.MANDATE_DRAFT_CREATE,
          PilotCapability.MANDATE_DRAFT_REVOKE
        ],
        now: IDENTITY_NOW
      }),
      tenantTwoHuman: harness.addIdentity({
        tenantId: TENANT_TWO,
        actorId: `actor_gateway_two_human_${RUN_ID}`,
        actorType: ActorType.HUMAN,
        roleBundle: RoleBundle.DEVELOPER,
        capabilities: [
          PilotCapability.AGENT_CREATE,
          PilotCapability.INTEGRATION_READ_OWNED,
          PilotCapability.MANDATE_DRAFT_CREATE,
          PilotCapability.MANDATE_DRAFT_REVOKE
        ],
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
      `GRANT UPDATE (status, version, updated_at) ON authorization_resources TO ${APP_ROLE}`
    );
    await ownerPool.query(
      `GRANT INSERT, UPDATE, DELETE ON
         abuse_rate_buckets, abuse_capacity_buckets, abuse_admissions,
         abuse_command_charges, principals, subjects, mandates,
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
    let tenantOnePrincipalId;
    let tenantOneMandateId;
    let firstMandateCommand;

    await t.test("invalid protocol request fails before admission and authorization", async () => {
      const before = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM abuse_admissions WHERE tenant_id = $1) AS admissions,
           (SELECT count(*)::int FROM authorization_audit_events WHERE tenant_id = $1) AS audits`,
        [TENANT_TWO]
      );
      await assert.rejects(
        () => runtime.execute({
          authenticationContext: identities.tenantTwoHuman.authenticationContext,
          operationId: "pilotReadMandate",
          resource: { resourceType: "mandate", resourceId: `mandate_missing_${RUN_ID}` },
          payload: {},
          requestId: `request-invalid-contract-${RUN_ID}`,
          correlationId: `correlation-invalid-contract-${RUN_ID}`,
          schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
          tenantId: TENANT_ONE
        }),
        (error) => error.code === "invalid_tenant_protocol_request"
      );
      const after = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM abuse_admissions WHERE tenant_id = $1) AS admissions,
           (SELECT count(*)::int FROM authorization_audit_events WHERE tenant_id = $1) AS audits`,
        [TENANT_TWO]
      );
      assert.deepEqual(after.rows, before.rows);
    });

    await t.test("Human command and Agent query share one durable protocol", async () => {
      const created = await tenantOneHuman.createAgentSubject(firstCommand);
      tenantOneSubjectId = created.response.subjectId;
      tenantOnePrincipalId = created.response.principalId;
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

    await t.test("invalid handler result rolls back the complete command transaction", async () => {
      const handlers = createTenantFoundationHandlers().map((handler) => {
        if (handler.operationId !== "pilotCreateAgentSubject") return handler;
        return {
          ...handler,
          async plan(input) {
            const plan = await handler.plan(input);
            return {
              ...plan,
              response: { ...plan.response, uncontractedAuthority: true }
            };
          }
        };
      });
      const hostileRuntime = gateway(appPool, harness, handlers);
      const hostileClient = humanClient(
        hostileRuntime,
        identities.tenantTwoHuman.authenticationContext
      );
      const stableState = async () => ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM principals WHERE tenant_id = $1) AS principals,
           (SELECT count(*)::int FROM subjects WHERE tenant_id = $1) AS subjects,
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM evidence_envelopes WHERE tenant_id = $1) AS evidence,
           (SELECT count(*)::int FROM projection_snapshots WHERE tenant_id = $1) AS projections,
           (SELECT count(*)::int FROM authorization_resources WHERE tenant_id = $1) AS resources,
           (SELECT count(*)::int FROM authorization_resource_bindings WHERE tenant_id = $1) AS bindings,
           (SELECT count(*)::int FROM command_idempotency WHERE tenant_id = $1) AS commands,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions,
           (SELECT count(*)::int FROM authorization_audit_events WHERE tenant_id = $1) AS audits,
           (SELECT COALESCE(sum(used_count), 0)::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'agent_subjects') AS agent_capacity`,
        [TENANT_TWO]
      );
      const before = await stableState();
      const command = createCommand({
        subjectActorId: identities.tenantTwoAgent.authenticationContext.actorId,
        displayName: "Invalid Result Must Roll Back",
        idempotencyKey: `invalid-result-${RUN_ID}-0001`
      });
      await assert.rejects(
        () => hostileClient.createAgentSubject(command),
        (error) => error.code === "invalid_tenant_protocol_result"
      );
      const after = await stableState();
      assert.deepEqual(after.rows, before.rows);
      const failedAdmission = await ownerPool.query(
        `SELECT state, outcome
           FROM abuse_admissions
          WHERE tenant_id = $1 AND operation_id = 'pilotCreateAgentSubject'
          ORDER BY issued_at DESC
          LIMIT 1`,
        [TENANT_TWO]
      );
      assert.deepEqual(failedAdmission.rows, [{ state: "completed", outcome: "failed" }]);
    });

    await t.test("Human controller creates one durable draft Mandate and Agent reads a bounded summary", async () => {
      firstMandateCommand = createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `create-mandate-one-${RUN_ID}-0001`
      });
      const created = await tenantOneHuman.createDraftMandate(firstMandateCommand);
      tenantOneMandateId = created.response.mandateId;
      assert.equal(created.replayed, false);
      assert.equal(created.response.status, "draft");
      assert.equal(created.response.subjectId, tenantOneSubjectId);

      const self = await tenantOneAgent.getSelf({
        subjectId: tenantOneSubjectId,
        requestId: `request-agent-self-mandate-${RUN_ID}`,
        correlationId: `correlation-agent-self-mandate-${RUN_ID}`
      });
      assert.equal(self.response.schemaVersion, "tenant_agent_subject_view.v2");
      assert.equal(self.response.hasMoreMandates, false);
      assert.equal(self.response.mandates.length, 1);
      assert.equal(self.response.mandates[0].mandateId, tenantOneMandateId);
      assert.equal(self.response.mandates[0].status, "draft");

      const humanView = await tenantOneHuman.getMandate({
        mandateId: tenantOneMandateId,
        requestId: `request-human-mandate-${RUN_ID}`,
        correlationId: `correlation-human-mandate-${RUN_ID}`
      });
      assert.equal(humanView.response.schemaVersion, "tenant_mandate_view.v1");
      assert.equal(humanView.response.mandate.mandateId, tenantOneMandateId);
      assert.equal(humanView.response.mandate.nonce, firstMandateCommand.payload.nonce);

      const durable = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM mandates WHERE tenant_id = $1 AND id = $2) AS mandates,
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1 AND aggregate_type = 'mandate') AS events,
           (SELECT count(*)::int FROM authorization_resources
             WHERE tenant_id = $1 AND resource_type = 'mandate' AND resource_id = $2) AS resources,
           (SELECT used_count::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'agent_subjects') AS agent_subjects,
           (SELECT used_count::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'mandates') AS mandate_capacity`,
        [TENANT_ONE, tenantOneMandateId]
      );
      assert.deepEqual(durable.rows[0], {
        mandates: 1,
        events: 1,
        resources: 1,
        agent_subjects: 1,
        mandate_capacity: 1
      });
    });

    await t.test("Gateway rejects a handler plan that targets a different authorization resource", async () => {
      const handlers = createTenantFoundationHandlers().map((handler) => {
        if (handler.operationId !== "pilotRevokeDraftMandate") return handler;
        return {
          ...handler,
          async plan(input) {
            const plan = await handler.plan(input);
            return {
              ...plan,
              authorizationResourceTransition: {
                ...plan.authorizationResourceTransition,
                resourceId: `${plan.authorizationResourceTransition.resourceId}_attacker`
              }
            };
          }
        };
      });
      const hostileRuntime = gateway(appPool, harness, handlers);
      const hostileClient = humanClient(
        hostileRuntime,
        identities.tenantOneHuman.authenticationContext
      );
      const before = await ownerPool.query(
        `SELECT m.status AS mandate_status,
                r.status AS resource_status,
                r.version::int AS resource_version,
                (SELECT count(*)::int
                   FROM domain_events e
                  WHERE e.tenant_id = m.tenant_id
                    AND e.aggregate_type = 'mandate'
                    AND e.aggregate_id = m.id) AS event_count
           FROM mandates m
           JOIN authorization_resources r
             ON r.tenant_id = m.tenant_id
            AND r.resource_type = 'mandate'
            AND r.resource_id = m.id
          WHERE m.tenant_id = $1 AND m.id = $2`,
        [TENANT_ONE, tenantOneMandateId]
      );
      await assert.rejects(
        () => hostileClient.revokeDraftMandate(revokeMandateCommand({
          mandateId: tenantOneMandateId,
          idempotencyKey: `revoke-mandate-plan-target-${RUN_ID}-0001`
        })),
        (error) => error.code === "invalid_tenant_command_plan"
      );
      const after = await ownerPool.query(
        `SELECT m.status AS mandate_status,
                r.status AS resource_status,
                r.version::int AS resource_version,
                (SELECT count(*)::int
                   FROM domain_events e
                  WHERE e.tenant_id = m.tenant_id
                    AND e.aggregate_type = 'mandate'
                    AND e.aggregate_id = m.id) AS event_count
           FROM mandates m
           JOIN authorization_resources r
             ON r.tenant_id = m.tenant_id
            AND r.resource_type = 'mandate'
            AND r.resource_id = m.id
          WHERE m.tenant_id = $1 AND m.id = $2`,
        [TENANT_ONE, tenantOneMandateId]
      );
      assert.deepEqual(after.rows, before.rows);
      assert.deepEqual(after.rows, [{
        mandate_status: "draft",
        resource_status: "active",
        resource_version: 1,
        event_count: 1
      }]);
    });

    await t.test("Human revokes one durable draft and Agent observes the terminal state", async () => {
      const created = await tenantOneHuman.createDraftMandate(createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `create-mandate-revocable-${RUN_ID}-0001`
      }));
      const mandateId = created.response.mandateId;
      const command = revokeMandateCommand({
        mandateId,
        idempotencyKey: `revoke-mandate-${RUN_ID}-0001`
      });
      const revoked = await tenantOneHuman.revokeDraftMandate(command);
      assert.equal(revoked.replayed, false);
      assert.equal(revoked.response.mandateId, mandateId);
      assert.equal(revoked.response.status, "revoked");
      assert.equal(revoked.response.reasonCode, "operator_request");

      const replay = await tenantOneHuman.revokeDraftMandate(command);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.response, revoked.response);

      const humanView = await tenantOneHuman.getMandate({
        mandateId,
        requestId: `request-human-revoked-mandate-${RUN_ID}`,
        correlationId: `correlation-human-revoked-mandate-${RUN_ID}`
      });
      assert.equal(humanView.response.mandate.status, "revoked");
      const agentView = await tenantOneAgent.getSelf({
        subjectId: tenantOneSubjectId,
        requestId: `request-agent-revoked-mandate-${RUN_ID}`,
        correlationId: `correlation-agent-revoked-mandate-${RUN_ID}`
      });
      assert.equal(
        agentView.response.mandates.find((mandate) => mandate.mandateId === mandateId)?.status,
        "revoked"
      );

      const durable = await ownerPool.query(
        `SELECT m.status AS mandate_status,
                r.status AS resource_status,
                r.version::int AS resource_version,
                p.aggregate_version::int AS projection_version,
                (SELECT count(*)::int
                   FROM domain_events e
                  WHERE e.tenant_id = m.tenant_id
                    AND e.aggregate_type = 'mandate'
                    AND e.aggregate_id = m.id) AS event_count,
                (SELECT count(*)::int
                   FROM projection_snapshots s
                  WHERE s.tenant_id = m.tenant_id
                    AND s.entity_type = 'mandate'
                    AND s.entity_id = m.id) AS snapshot_count
           FROM mandates m
           JOIN authorization_resources r
             ON r.tenant_id = m.tenant_id
            AND r.resource_type = 'mandate'
            AND r.resource_id = m.id
           JOIN projection_registry p
             ON p.tenant_id = m.tenant_id
            AND p.entity_type = 'mandate'
            AND p.entity_id = m.id
          WHERE m.tenant_id = $1 AND m.id = $2`,
        [TENANT_ONE, mandateId]
      );
      assert.deepEqual(durable.rows, [{
        mandate_status: "revoked",
        resource_status: "closed",
        resource_version: 2,
        projection_version: 2,
        event_count: 2,
        snapshot_count: 2
      }]);

      await assert.rejects(
        () => tenantOneHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId,
          idempotencyKey: `revoke-mandate-fresh-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      const afterDenied = await ownerPool.query(
        `SELECT count(*)::int AS count
           FROM domain_events
          WHERE tenant_id = $1 AND aggregate_type = 'mandate' AND aggregate_id = $2`,
        [TENANT_ONE, mandateId]
      );
      assert.equal(afterDenied.rows[0].count, 2);
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

    await t.test("cross-Tenant, same-Tenant controller, and Agent Mandate management fail closed", async () => {
      const state = () => ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM mandates WHERE tenant_id IN ($1, $2)) AS count,
           (SELECT status FROM mandates WHERE tenant_id = $1 AND id = $3) AS first_status`,
        [TENANT_ONE, TENANT_TWO, tenantOneMandateId]
      );
      const before = await state();
      await assert.rejects(
        () => tenantTwoHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `cross-tenant-mandate-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneOtherHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `other-controller-mandate-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantTwoHuman.getMandate({
          mandateId: tenantOneMandateId,
          requestId: `request-cross-tenant-read-mandate-${RUN_ID}`,
          correlationId: `correlation-cross-tenant-read-mandate-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneOtherHuman.getMandate({
          mandateId: tenantOneMandateId,
          requestId: `request-other-controller-read-mandate-${RUN_ID}`,
          correlationId: `correlation-other-controller-read-mandate-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantTwoHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId: tenantOneMandateId,
          idempotencyKey: `cross-tenant-revoke-mandate-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => tenantOneOtherHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId: tenantOneMandateId,
          idempotencyKey: `other-controller-revoke-mandate-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => runtime.execute({
          authenticationContext: identities.tenantOneAgent.authenticationContext,
          schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
          operationId: "pilotCreateDraftMandate",
          resource: { resourceType: "subject", resourceId: tenantOneSubjectId },
          payload: firstMandateCommand.payload,
          idempotencyKey: `agent-created-mandate-${RUN_ID}-0001`,
          requestId: `request-agent-created-mandate-${RUN_ID}`,
          correlationId: `correlation-agent-created-mandate-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => runtime.execute({
          authenticationContext: identities.tenantOneAgent.authenticationContext,
          schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
          operationId: "pilotReadMandate",
          resource: { resourceType: "mandate", resourceId: tenantOneMandateId },
          payload: {},
          requestId: `request-agent-read-mandate-${RUN_ID}`,
          correlationId: `correlation-agent-read-mandate-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      await assert.rejects(
        () => runtime.execute({
          authenticationContext: identities.tenantOneAgent.authenticationContext,
          schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
          operationId: "pilotRevokeDraftMandate",
          resource: { resourceType: "mandate", resourceId: tenantOneMandateId },
          payload: {},
          reasonCode: "operator_request",
          idempotencyKey: `agent-revoke-mandate-${RUN_ID}-0001`,
          requestId: `request-agent-revoke-mandate-${RUN_ID}`,
          correlationId: `correlation-agent-revoke-mandate-${RUN_ID}`
        }),
        (error) => error.code === "authorization_denied"
      );
      const after = await state();
      assert.deepEqual(after.rows[0], before.rows[0]);
    });

    await t.test("Mandate replay is exact, nonce reuse conflicts, and failure releases capacity", async () => {
      const beforeCapacity = await ownerPool.query(
        `SELECT used_count::int AS count
           FROM abuse_capacity_buckets
          WHERE tenant_id = $1 AND kind = 'mandates'`,
        [TENANT_ONE]
      );
      const replay = await tenantOneHuman.createDraftMandate(firstMandateCommand);
      assert.equal(replay.replayed, true);
      assert.equal(replay.response.mandateId, tenantOneMandateId);

      await assert.rejects(
        () => tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `mandate-reused-nonce-${RUN_ID}-0001`,
          nonce: firstMandateCommand.payload.nonce
        })),
        (error) => error.code === "mandate_nonce_conflict"
      );
      await assert.rejects(
        () => tenantOneHuman.createDraftMandate({
          ...createMandateCommand({
            subjectId: tenantOneSubjectId,
            idempotencyKey: `mandate-invalid-payload-${RUN_ID}-0001`
          }),
          payload: { ...firstMandateCommand.payload, subjectId: "subject_attacker" }
        }),
        (error) => error.code === "invalid_tenant_protocol_request"
      );
      const capacity = await ownerPool.query(
        `SELECT used_count::int AS count
           FROM abuse_capacity_buckets
          WHERE tenant_id = $1 AND kind = 'mandates'`,
        [TENANT_ONE]
      );
      assert.deepEqual(capacity.rows[0], beforeCapacity.rows[0]);
    });

    await t.test("draft creation rejects suspended or closed Subjects and an inactive Principal", async () => {
      const stateSubject = await tenantOneHuman.createAgentSubject(createCommand({
        subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
        displayName: "State Guard Treasury Agent",
        idempotencyKey: `create-agent-state-guard-${RUN_ID}-0001`
      }));
      await transitionProjection({
        pool: appPool,
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        entityType: "subject",
        entityId: stateSubject.response.subjectId,
        nextStatus: "suspended",
        idempotencyKey: `suspend-state-subject-${RUN_ID}-0001`
      });
      await assert.rejects(
        () => tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: stateSubject.response.subjectId,
          idempotencyKey: `mandate-suspended-subject-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );
      await transitionProjection({
        pool: appPool,
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        entityType: "subject",
        entityId: stateSubject.response.subjectId,
        nextStatus: "closed",
        idempotencyKey: `close-state-subject-${RUN_ID}-0001`
      });
      await assert.rejects(
        () => tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: stateSubject.response.subjectId,
          idempotencyKey: `mandate-closed-subject-${RUN_ID}-0001`
        })),
        (error) => error.code === "authorization_denied"
      );

      await transitionProjection({
        pool: appPool,
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        entityType: "principal",
        entityId: tenantOnePrincipalId,
        nextStatus: "restricted",
        idempotencyKey: `restrict-principal-${RUN_ID}-0001`
      });
      await assert.rejects(
        () => tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `mandate-restricted-principal-${RUN_ID}-0001`
        })),
        (error) => error.code === "principal_not_active"
      );
      await transitionProjection({
        pool: appPool,
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        entityType: "principal",
        entityId: tenantOnePrincipalId,
        nextStatus: "active",
        idempotencyKey: `restore-principal-${RUN_ID}-0001`
      });
    });

    await t.test("protective draft revocation survives suspended Subject and inactive Principal state", async () => {
      const stateSubject = await tenantOneHuman.createAgentSubject(createCommand({
        subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
        displayName: "Revocation Independence Agent",
        idempotencyKey: `create-agent-revoke-independent-${RUN_ID}-0001`
      }));
      assert.equal(stateSubject.response.principalId, tenantOnePrincipalId);
      const draft = await tenantOneHuman.createDraftMandate(createMandateCommand({
        subjectId: stateSubject.response.subjectId,
        idempotencyKey: `create-mandate-revoke-independent-${RUN_ID}-0001`
      }));
      await transitionProjection({
        pool: appPool,
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        entityType: "subject",
        entityId: stateSubject.response.subjectId,
        nextStatus: "suspended",
        idempotencyKey: `suspend-revoke-independent-subject-${RUN_ID}-0001`
      });
      let principalRestricted = false;
      try {
        await transitionProjection({
          pool: appPool,
          tenantId: TENANT_ONE,
          actorId: identities.tenantOneHuman.authenticationContext.actorId,
          entityType: "principal",
          entityId: tenantOnePrincipalId,
          nextStatus: "restricted",
          idempotencyKey: `restrict-revoke-independent-principal-${RUN_ID}-0001`
        });
        principalRestricted = true;
        const revoked = await tenantOneHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId: draft.response.mandateId,
          reasonCode: "security_incident",
          idempotencyKey: `revoke-independent-mandate-${RUN_ID}-0001`
        }));
        assert.equal(revoked.response.status, "revoked");
        assert.equal(revoked.response.reasonCode, "security_incident");
      } finally {
        if (principalRestricted) {
          await transitionProjection({
            pool: appPool,
            tenantId: TENANT_ONE,
            actorId: identities.tenantOneHuman.authenticationContext.actorId,
            entityType: "principal",
            entityId: tenantOnePrincipalId,
            nextStatus: "active",
            idempotencyKey: `restore-revoke-independent-principal-${RUN_ID}-0001`
          });
        }
      }
      const view = await tenantOneHuman.getMandate({
        mandateId: draft.response.mandateId,
        requestId: `request-read-revoke-independent-${RUN_ID}`,
        correlationId: `correlation-read-revoke-independent-${RUN_ID}`
      });
      assert.equal(view.response.mandate.status, "revoked");
    });

    await t.test("concurrent Subject suspension cannot race a draft Mandate into existence", async () => {
      const raceSubject = await tenantOneHuman.createAgentSubject(createCommand({
        subjectActorId: identities.tenantOneAgent.authenticationContext.actorId,
        displayName: "Concurrent State Guard Agent",
        idempotencyKey: `create-agent-state-race-${RUN_ID}-0001`
      }));
      const context = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      const eventRepository = new PostgresEventRepository({ pool: appPool, tenantContext: context });
      const coreRepository = new PostgresCoreRepository({ pool: appPool, eventRepository });
      const subject = await coreRepository.getSubject(raceSubject.response.subjectId);
      const registration = await coreRepository.getProjectionRegistration(
        "subject",
        raceSubject.response.subjectId
      );
      const transitionAt = new Date();
      const event = createCreditEvent({
        eventType: CreditEventType.SUBJECT_STATUS_CHANGED,
        subjectId: subject.subjectId,
        payload: { previousStatus: subject.status, nextStatus: "suspended" },
        now: transitionAt
      });
      const before = await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1",
        [TENANT_ONE]
      );
      const client = await appPool.connect();
      let committed = false;
      try {
        await client.query("BEGIN");
        await setTenantTransactionContext(client, context);
        await coreRepository.commitCommandInTransaction(client, {
          aggregateType: "subject",
          aggregateId: subject.subjectId,
          idempotencyKey: `suspend-race-subject-${RUN_ID}-0001`,
          commandHash: hashId("gateway_test_subject_race", subject.subjectId),
          events: [{
            aggregateType: "subject",
            aggregateId: subject.subjectId,
            expectedVersion: registration.aggregateVersion,
            event
          }],
          writes: [{
            type: "subject",
            value: { ...subject, status: "suspended", updatedAt: transitionAt.toISOString() },
            eventId: event.eventId
          }],
          response: { subjectId: subject.subjectId, status: "suspended" }
        });
        const command = tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: subject.subjectId,
          idempotencyKey: `mandate-state-race-${RUN_ID}-0001`
        }));
        await new Promise((resolve) => setTimeout(resolve, 50));
        await client.query("COMMIT");
        committed = true;
        await assert.rejects(
          command,
          (error) => error.code === "stale_aggregate_version"
        );
      } finally {
        if (!committed) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Preserve the original failure.
          }
        }
        client.release();
      }
      const after = await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1",
        [TENANT_ONE]
      );
      assert.deepEqual(after.rows[0], before.rows[0]);
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
      const before = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM domain_events WHERE tenant_id = $1) AS events,
           (SELECT count(*)::int FROM tenant_command_executions WHERE tenant_id = $1) AS executions`,
        [TENANT_ONE]
      );
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
      assert.deepEqual(counts.rows[0], before.rows[0]);
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
          schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
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

    await t.test("concurrent Principal nonce reuse creates at most one draft Mandate", async () => {
      const nonce = `concurrent-mandate-nonce-${RUN_ID}`;
      const before = await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1",
        [TENANT_ONE]
      );
      const settled = await Promise.allSettled([
        tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `concurrent-mandate-a-${RUN_ID}-0001`,
          nonce
        })),
        tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `concurrent-mandate-b-${RUN_ID}-0001`,
          nonce
        }))
      ]);
      const fulfilled = settled.filter(({ status }) => status === "fulfilled");
      const rejected = settled.filter(({ status }) => status === "rejected");
      assert.equal(fulfilled.length <= 1, true);
      assert.equal(rejected.length >= 1, true);
      for (const rejection of rejected) {
        assert.equal(
          [
            "mandate_nonce_conflict",
            "request_admission_unavailable",
            "stale_aggregate_version"
          ].includes(rejection.reason?.code),
          true
        );
      }

      const recoveryCommand = createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `concurrent-mandate-recovery-${RUN_ID}-0001`,
        nonce
      });
      if (fulfilled.length === 0) {
        const recovery = await tenantOneHuman.createDraftMandate(recoveryCommand);
        assert.equal(recovery.replayed, false);
      } else {
        assert.equal(fulfilled[0].value.replayed, false);
        await assert.rejects(
          tenantOneHuman.createDraftMandate(recoveryCommand),
          (error) => error.code === "mandate_nonce_conflict"
        );
      }
      const after = await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1",
        [TENANT_ONE]
      );
      assert.equal(after.rows[0].count, before.rows[0].count + 1);
    });

    await t.test("concurrent draft revocation commits at most one terminal transition", async () => {
      const draft = await tenantOneHuman.createDraftMandate(createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `create-mandate-revoke-race-${RUN_ID}-0001`
      }));
      const mandateId = draft.response.mandateId;
      const before = await ownerPool.query(
        `SELECT count(*)::int AS count
           FROM domain_events
          WHERE tenant_id = $1 AND aggregate_type = 'mandate' AND aggregate_id = $2`,
        [TENANT_ONE, mandateId]
      );
      const settled = await Promise.allSettled([
        tenantOneHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId,
          idempotencyKey: `revoke-mandate-race-a-${RUN_ID}-0001`
        })),
        tenantOneHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId,
          idempotencyKey: `revoke-mandate-race-b-${RUN_ID}-0001`
        }))
      ]);
      const fulfilled = settled.filter(({ status }) => status === "fulfilled");
      const rejected = settled.filter(({ status }) => status === "rejected");
      assert.equal(fulfilled.length <= 1, true);
      assert.equal(rejected.length >= 1, true);
      for (const rejection of rejected) {
        assert.equal(
          [
            "authorization_denied",
            "request_admission_unavailable",
            "stale_aggregate_version"
          ].includes(rejection.reason?.code),
          true
        );
      }
      if (fulfilled.length === 0) {
        const recovery = await tenantOneHuman.revokeDraftMandate(revokeMandateCommand({
          mandateId,
          idempotencyKey: `revoke-mandate-race-recovery-${RUN_ID}-0001`
        }));
        assert.equal(recovery.response.status, "revoked");
      } else {
        assert.equal(fulfilled[0].value.response.status, "revoked");
      }
      const after = await ownerPool.query(
        `SELECT m.status AS mandate_status,
                r.status AS resource_status,
                count(e.id)::int AS event_count
           FROM mandates m
           JOIN authorization_resources r
             ON r.tenant_id = m.tenant_id
            AND r.resource_type = 'mandate'
            AND r.resource_id = m.id
           JOIN domain_events e
             ON e.tenant_id = m.tenant_id
            AND e.aggregate_type = 'mandate'
            AND e.aggregate_id = m.id
          WHERE m.tenant_id = $1 AND m.id = $2
          GROUP BY m.status, r.status`,
        [TENANT_ONE, mandateId]
      );
      assert.deepEqual(after.rows, [{
        mandate_status: "revoked",
        resource_status: "closed",
        event_count: before.rows[0].count + 1
      }]);
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

    await t.test("Agent self-read caps Mandate summaries and signals continuation", async () => {
      const existing = Number((await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1 AND subject_id = $2",
        [TENANT_ONE, tenantOneSubjectId]
      )).rows[0].count);
      for (let index = existing; index < 51; index += 1) {
        await tenantOneHuman.createDraftMandate(createMandateCommand({
          subjectId: tenantOneSubjectId,
          idempotencyKey: `mandate-page-${RUN_ID}-${String(index).padStart(4, "0")}`
        }));
      }
      const self = await tenantOneAgent.getSelf({
        subjectId: tenantOneSubjectId,
        requestId: `request-agent-self-page-${RUN_ID}`,
        correlationId: `correlation-agent-self-page-${RUN_ID}`
      });
      assert.equal(self.response.mandates.length, 50);
      assert.equal(self.response.hasMoreMandates, true);
      assert.equal(Buffer.byteLength(JSON.stringify(self.response)) < 256 * 1024, true);
    });

    await t.test("Agent self-read fails closed when normalized Mandate projection evidence is missing", async () => {
      const context = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      const mandateId = `mandate_missing_projection_${RUN_ID}`;
      const createdAt = new Date(Date.now() + 60_000);
      await withTenantTransaction(ownerPool, context, (client) => client.query(
        `INSERT INTO mandates(
           tenant_id, id, mandate_hash, principal_id, subject_id, capabilities,
           allowed_provider_ids, allowed_categories, asset_ids,
           per_action_limit_minor, aggregate_limit_minor, utilized_minor,
           valid_from, expires_at, nonce, terms_ref, status,
           created_at, updated_at, schema_version
         ) VALUES (
           $1, $2, $3, $4, $5, '["request_credit"]'::jsonb,
           '[]'::jsonb, '[]'::jsonb,
           '["urn:ipo-one:sandbox-asset:usd-cent"]'::jsonb,
           1, 1, 0, $6, $7, $8, $9, 'draft', $6, $6, 'mandate.v2'
         )`,
        [
          TENANT_ONE,
          mandateId,
          `mandate_missing_projection_hash_${RUN_ID}`,
          tenantOnePrincipalId,
          tenantOneSubjectId,
          createdAt,
          new Date(createdAt.getTime() + 86_400_000),
          `missing-projection-nonce-${RUN_ID}`,
          `urn:ipo.one:test:missing-projection:${RUN_ID}`
        ]
      ));
      try {
        await assert.rejects(
          () => tenantOneAgent.getSelf({
            subjectId: tenantOneSubjectId,
            requestId: `request-agent-self-corrupt-${RUN_ID}`,
            correlationId: `correlation-agent-self-corrupt-${RUN_ID}`
          }),
          (error) => error.code === "projection_integrity_mismatch"
        );
      } finally {
        await withTenantTransaction(ownerPool, context, (client) => client.query(
          "DELETE FROM mandates WHERE tenant_id = $1 AND id = $2",
          [TENANT_ONE, mandateId]
        ));
      }
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

    await t.test("durable Mandate baseline reaches the hard cap and blocks before object lookup", async () => {
      const existing = Number((await ownerPool.query(
        "SELECT count(*)::int AS count FROM mandates WHERE tenant_id = $1",
        [TENANT_ONE]
      )).rows[0].count);
      const seedCount = 999 - existing;
      assert.equal(seedCount >= 0, true);
      if (seedCount > 0) {
        const context = createTenantSecurityContext({
          tenantId: TENANT_ONE,
          actorId: identities.tenantOneHuman.authenticationContext.actorId,
          policyVersion: "security_001.v1",
          source: "local_test"
        });
        await withTenantTransaction(ownerPool, context, (client) => client.query(
          `INSERT INTO mandates(
             tenant_id, id, mandate_hash, principal_id, subject_id, capabilities,
             allowed_provider_ids, allowed_categories, asset_ids,
             per_action_limit_minor, aggregate_limit_minor, utilized_minor,
             valid_from, expires_at, nonce, terms_ref, status,
             created_at, updated_at, schema_version
           )
           SELECT $1,
                  'mandate_capacity_' || $6 || '_' || sequence,
                  'mandate_capacity_hash_' || $6 || '_' || sequence,
                  $2, $3, '["request_credit"]'::jsonb,
                  '[]'::jsonb, '[]'::jsonb,
                  '["urn:ipo-one:sandbox-asset:usd-cent"]'::jsonb,
                  1, 1, 0, $4, $5,
                  'capacity-nonce-' || $6 || '-' || sequence,
                  'urn:ipo.one:test:capacity:' || $6 || ':' || sequence,
                  'draft', $4, $4, 'mandate.v2'
             FROM generate_series(1, $7::int) AS sequence`,
          [
            TENANT_ONE,
            tenantOnePrincipalId,
            tenantOneSubjectId,
            IDENTITY_NOW,
            new Date(IDENTITY_NOW.getTime() + 365 * 86_400_000),
            RUN_ID,
            seedCount
          ]
        ));
      }

      const boundaryCommand = createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `mandate-cap-boundary-${RUN_ID}-0001`
      });
      const boundary = await tenantOneHuman.createDraftMandate(boundaryCommand);
      assert.equal(boundary.response.status, "draft");
      const counts = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM mandates WHERE tenant_id = $1) AS mandates,
           (SELECT used_count::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'mandates') AS capacity`,
        [TENANT_ONE]
      );
      assert.deepEqual(counts.rows[0], { mandates: 1_000, capacity: 1_000 });

      const context = createTenantSecurityContext({
        tenantId: TENANT_ONE,
        actorId: identities.tenantOneHuman.authenticationContext.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await withTenantTransaction(ownerPool, context, (client) => client.query(
        "DELETE FROM abuse_capacity_buckets WHERE tenant_id = $1 AND kind = 'mandates'",
        [TENANT_ONE]
      ));
      const replayAtCap = await tenantOneHuman.createDraftMandate(boundaryCommand);
      assert.equal(replayAtCap.replayed, true);
      assert.equal(replayAtCap.response.mandateId, boundary.response.mandateId);
      const replayState = await ownerPool.query(
        `SELECT
           (SELECT count(*)::int FROM mandates WHERE tenant_id = $1) AS mandates,
           (SELECT count(*)::int FROM abuse_capacity_buckets
             WHERE tenant_id = $1 AND kind = 'mandates') AS capacity_rows`,
        [TENANT_ONE]
      );
      assert.deepEqual(replayState.rows[0], { mandates: 1_000, capacity_rows: 0 });
      const deniedValid = createMandateCommand({
        subjectId: tenantOneSubjectId,
        idempotencyKey: `mandate-cap-valid-overflow-${RUN_ID}-0001`
      });
      const deniedMissing = createMandateCommand({
        subjectId: `subject_missing_capacity_${RUN_ID}`,
        idempotencyKey: `mandate-cap-missing-overflow-${RUN_ID}-0001`
      });
      for (const denied of [deniedValid, deniedMissing]) {
        await assert.rejects(
          () => tenantOneHuman.createDraftMandate(denied),
          (error) => error.code === "request_budget_exceeded" && error.details.retryAfterClass === "short"
        );
      }
      const audit = await ownerPool.query(
        `SELECT count(*)::int AS count
           FROM authorization_audit_events
          WHERE tenant_id = $1 AND request_id = ANY($2::text[])`,
        [TENANT_ONE, [deniedValid.requestId, deniedMissing.requestId]]
      );
      assert.equal(audit.rows[0].count, 0);
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
