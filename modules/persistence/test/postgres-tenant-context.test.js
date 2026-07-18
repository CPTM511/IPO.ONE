import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTenantDatabaseRole,
  assertTenantSecurityContext,
  createTenantSecurityContext,
  createTenantSecurityContextFromAuthorization,
  setTenantTransactionContext
} from "../src/index.js";
import { createAuthenticationContext } from "../../authentication/src/authentication-context.js";
import { ActorType } from "../../authentication/src/constants.js";
import { PilotCapability, RoleBundle } from "../../authorization/src/index.js";
import {
  FIXED_NOW,
  authorizationRequest,
  createAuthorizationHarness
} from "../../authorization/test/support/authorization-fixture.js";

const VALID_CONTEXT = {
  tenantId: "tenant_ipo_one_local_pilot",
  actorId: "actor_local_system",
  policyVersion: "security_001.v1",
  source: "local_test"
};

test("Tenant Security Context is closed, bounded, and server-created", () => {
  const context = createTenantSecurityContext(VALID_CONTEXT);
  assert.deepEqual(context, VALID_CONTEXT);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(assertTenantSecurityContext(context), context);

  assert.throws(
    () => assertTenantSecurityContext({ ...VALID_CONTEXT }),
    (error) => error.code === "tenant_security_context_required"
  );
  assert.throws(
    () => createTenantSecurityContext({ ...VALID_CONTEXT, tenantId: "tenant with spaces" }),
    (error) => error.code === "invalid_tenant_security_context"
  );
  assert.throws(
    () => createTenantSecurityContext({ ...VALID_CONTEXT, source: "request_body" }),
    (error) => error.code === "invalid_tenant_security_context"
  );
});

test("verified Tenant Security Context requires the exact trusted Authentication Context", () => {
  const authentication = createAuthenticationContext({
    tenantId: "tenant_ipo_one_local_pilot",
    actorId: "actor_local_system",
    actorType: "system_worker",
    clientId: "client_local_worker",
    credentialId: "credential_local_worker",
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: ["local_non_funds_repository"],
    roles: ["system_worker"],
    tokenJtiHash: "a".repeat(43),
    authenticationMethod: "private_key_jwt",
    senderConstraintMethod: "dpop",
    authenticatedAt: new Date("2026-07-13T00:00:00.000Z"),
    amr: []
  });
  const context = createTenantSecurityContext({
    tenantId: authentication.tenantId,
    actorId: authentication.actorId,
    policyVersion: authentication.policyVersion,
    source: "verified_authentication",
    authenticationContext: authentication
  });
  assert.equal(context.source, "verified_authentication");
  assert.throws(
    () => createTenantSecurityContext({
      tenantId: authentication.tenantId,
      actorId: "actor_other",
      policyVersion: authentication.policyVersion,
      source: "verified_authentication",
      authenticationContext: authentication
    }),
    (error) => error.code === "tenant_authentication_context_mismatch"
  );
  assert.throws(
    () => createTenantSecurityContext({
      tenantId: authentication.tenantId,
      actorId: authentication.actorId,
      policyVersion: authentication.policyVersion,
      source: "verified_authentication",
      authenticationContext: { ...authentication }
    }),
    (error) => error.code === "authentication_context_required"
  );
});

test("tenant command context requires a current revalidated Authorization Decision", async () => {
  const harness = createAuthorizationHarness();
  const worker = harness.addIdentity({
    tenantId: "tenant_ipo_one_local_pilot",
    actorId: "actor_local_system",
    actorType: ActorType.SYSTEM_WORKER,
    roleBundle: RoleBundle.SYSTEM_WORKER,
    capabilities: [PilotCapability.WORKER_OUTBOX_PUBLISH]
  });
  harness.directory.registerResource({
    tenantId: worker.authenticationContext.tenantId,
    resourceType: "outbox_message",
    resourceId: "outbox_message_001",
    now: FIXED_NOW
  });
  harness.livePolicyAdapter.register({
    tenantId: worker.authenticationContext.tenantId,
    operationId: "workerPublishOutbox",
    resourceType: "outbox_message",
    resourceId: "outbox_message_001",
    checks: ["worker_lease", "delivery_attempt"],
    allowed: true
  });
  const initial = await harness.service.authorize(authorizationRequest(
    worker.authenticationContext,
    "workerPublishOutbox",
    {
      resource: { resourceType: "outbox_message", resourceId: "outbox_message_001" },
      idempotencyKey: "publish-outbox-message-0001"
    }
  ));
  assert.throws(
    () => createTenantSecurityContextFromAuthorization({
      authenticationContext: worker.authenticationContext,
      authorizationDecision: initial,
      now: FIXED_NOW
    }),
    (error) => error.code === "tenant_authorization_context_mismatch"
  );

  const revalidationTime = new Date(FIXED_NOW.getTime() + 1_000);
  const revalidated = await harness.service.revalidate({
    decision: initial,
    authenticationContext: worker.authenticationContext,
    now: revalidationTime
  });
  const context = createTenantSecurityContextFromAuthorization({
    authenticationContext: worker.authenticationContext,
    authorizationDecision: revalidated,
    now: revalidationTime
  });
  assert.equal(context.source, "verified_authorization");
  assert.equal(context.authorizationDecisionId, revalidated.decisionId);
  assert.equal(context.operationId, "workerPublishOutbox");
  assert.throws(
    () => createTenantSecurityContextFromAuthorization({
      authenticationContext: structuredClone(worker.authenticationContext),
      authorizationDecision: revalidated,
      now: revalidationTime
    }),
    (error) => error.code === "authentication_context_required"
  );
  assert.throws(
    () => createTenantSecurityContextFromAuthorization({
      authenticationContext: worker.authenticationContext,
      authorizationDecision: revalidated,
      now: new Date(revalidationTime.getTime() + 30_001)
    }),
    (error) => error.code === "authorization_decision_expired"
  );
});

test("transaction context uses parameterized transaction-local settings", async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [], rowCount: 1 };
    }
  };
  const context = createTenantSecurityContext(VALID_CONTEXT);
  await setTenantTransactionContext(client, context);

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /set_config\('app\.tenant_id', \$1, true\)/);
  assert.match(calls[0].text, /set_config\('app\.actor_id', \$2, true\)/);
  assert.match(calls[0].text, /set_config\('app\.policy_version', \$3, true\)/);
  assert.match(calls[0].text, /set_config\('search_path', 'pg_catalog, public, pg_temp', true\)/);
  assert.deepEqual(calls[0].values, [
    VALID_CONTEXT.tenantId,
    VALID_CONTEXT.actorId,
    VALID_CONTEXT.policyVersion
  ]);
});

test("tenant role safety rejects ownership and bypass privileges", async () => {
  const safe = await assertTenantDatabaseRole({
    async query() {
      return {
        rows: [{
          rolname: "ipo_one_app_test",
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolreplication: false,
          owns_rls_table: false
        }]
      };
    }
  });
  assert.deepEqual(safe, {
    roleName: "ipo_one_app_test",
    superuser: false,
    bypassRls: false,
    ownsRlsTable: false
  });

  for (const unsafeField of [
    "rolsuper",
    "rolbypassrls",
    "rolcreatedb",
    "rolcreaterole",
    "rolreplication",
    "owns_rls_table"
  ]) {
    await assert.rejects(
      () => assertTenantDatabaseRole({
        async query() {
          return {
            rows: [{
              rolname: "unsafe_role",
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              owns_rls_table: false,
              [unsafeField]: true
            }]
          };
        }
      }),
      (error) => error.code === "unsafe_postgres_tenant_role"
    );
  }
});
