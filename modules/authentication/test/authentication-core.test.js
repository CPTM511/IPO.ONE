import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  ActorType,
  ClientAuthenticationMethod,
  InMemoryActorDirectory,
  InMemoryAuthenticationEventStore,
  InMemoryCredentialRegistry,
  SenderConstraintMethod,
  assertAuthenticationContext,
  assertPostgresAuthenticationRole,
  createReferenceHasher,
  loadAuthenticationRuntimeConfig
} from "../src/index.js";
import { createAuthenticationContext } from "../src/authentication-context.js";
import { parseStrictJson } from "../src/strict-json.js";
import { inspectCompactJwt } from "../src/jwt-verifier.js";

test("strict JSON rejects duplicate, escaped duplicate, malformed, and oversized objects", () => {
  assert.deepEqual(parseStrictJson('{"iss":"one","nested":{"ok":true}}'), {
    iss: "one",
    nested: { ok: true }
  });
  for (const source of [
    '{"iss":"one","iss":"two"}',
    '{"iss":"one","\\u0069ss":"two"}',
    '{"a":[1,]}',
    '{"a":01}',
    '{"a":true} trailing'
  ]) {
    assert.throws(() => parseStrictJson(source), (error) => error.code === "invalid_compact_jwt");
  }
  assert.throws(
    () => parseStrictJson(`{"value":"${"x".repeat(100)}"}`, { maximumBytes: 32 }),
    (error) => error.code === "invalid_compact_jwt"
  );
  const invalidUtf8Header = Buffer.from([0xff]).toString("base64url");
  const emptyObject = Buffer.from("{}").toString("base64url");
  assert.throws(
    () => inspectCompactJwt(`${invalidUtf8Header}.${emptyObject}.AA`, { allowedClaimFields: [] }),
    (error) => error.code === "invalid_compact_jwt"
  );
});

test("Authentication Context is server-created, frozen, and never an authorization decision", () => {
  const context = createAuthenticationContext({
    tenantId: "tenant_alpha",
    actorId: "actor_alpha",
    actorType: ActorType.AGENT,
    clientId: "client_alpha",
    credentialId: "credential_alpha",
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: ["credit.request"],
    roles: ["agent_runtime"],
    tokenJtiHash: "a".repeat(43),
    authenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraintMethod: SenderConstraintMethod.DPOP,
    authenticatedAt: new Date("2026-07-13T00:00:00.000Z"),
    amr: []
  });
  assert.equal(context.authorizationDecision, "not_evaluated");
  assert.equal(context.schemaVersion, "authentication_context.v2");
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.capabilities), true);
  assert.equal(assertAuthenticationContext(context), context);
  assert.throws(
    () => assertAuthenticationContext(structuredClone(context)),
    (error) => error.code === "authentication_context_required"
  );
});

test("credential records hash external subjects and lifecycle events contain no raw credentials", () => {
  const referenceHasher = createReferenceHasher(randomBytes(32));
  const eventStore = new InMemoryAuthenticationEventStore();
  const actorDirectory = new InMemoryActorDirectory();
  actorDirectory.register({ actorId: "actor_human_alpha", actorType: ActorType.HUMAN });
  const registry = new InMemoryCredentialRegistry({ referenceHasher, eventStore, actorDirectory });
  const credential = registry.register({
    tenantId: "tenant_alpha",
    actorId: "actor_human_alpha",
    actorType: ActorType.HUMAN,
    issuer: "https://issuer.local.test",
    externalSubject: "person-subject-not-for-storage",
    clientId: "human_console",
    clientAuthenticationMethod: ClientAuthenticationMethod.OIDC_PKCE_BFF,
    senderConstraint: {
      method: SenderConstraintMethod.HOST_SESSION,
      thumbprint: "h".repeat(43)
    },
    roles: ["tenant_owner"],
    allowedCapabilities: ["subject.read"],
    policyVersion: "security_001.v1",
    performedByActorId: "actor_security_admin",
    reasonCode: "local_test_registration",
    now: new Date("2026-07-13T00:00:00.000Z")
  });
  assert.equal("externalSubject" in credential, false);
  assert.notEqual(credential.externalSubjectHash, "person-subject-not-for-storage");
  const serialized = JSON.stringify(eventStore.list());
  assert.equal(serialized.includes("person-subject-not-for-storage"), false);
  assert.equal(eventStore.list()[0].eventType, "credential_registered");

  registry.rotate({
    credentialId: credential.credentialId,
    senderConstraint: {
      method: SenderConstraintMethod.HOST_SESSION,
      thumbprint: "i".repeat(43)
    },
    performedByActorId: "actor_security_admin",
    reasonCode: "local_test_rotation",
    now: new Date("2026-07-13T00:01:00.000Z")
  });
  registry.revoke({
    credentialId: credential.credentialId,
    performedByActorId: "actor_security_admin",
    reasonCode: "local_test_revocation",
    now: new Date("2026-07-13T00:02:00.000Z")
  });
  assert.deepEqual(
    eventStore.list().map((event) => event.eventType),
    ["credential_registered", "credential_rotated", "credential_revoked"]
  );
  assert.throws(
    () => eventStore.append({
      eventType: "credential_revoked",
      tenantId: "tenant_alpha",
      actorId: "actor_security_admin",
      credentialId: credential.credentialId,
      reasonCode: "sensitive_payload",
      occurredAt: new Date().toISOString(),
      payload: { accessToken: "forbidden" }
    }),
    (error) => error.code === "sensitive_authentication_event_rejected"
  );
  assert.throws(
    () => eventStore.append({
      eventType: "credential_revoked",
      tenantId: "tenant_alpha",
      actorId: "actor_security_admin",
      credentialId: credential.credentialId,
      reasonCode: "unexpected_payload",
      occurredAt: new Date().toISOString(),
      payload: { value: "unclassified data is forbidden" }
    }),
    (error) => error.code === "invalid_authentication_claims"
  );
});

test("Human OIDC supports shared clients and multi-tenant identities while workload clients stay unique", () => {
  const referenceHasher = createReferenceHasher(randomBytes(32));
  const eventStore = new InMemoryAuthenticationEventStore();
  const actorDirectory = new InMemoryActorDirectory();
  const registry = new InMemoryCredentialRegistry({ referenceHasher, eventStore, actorDirectory });
  const register = ({
    actorId,
    actorType,
    externalSubject,
    tenantId = "tenant_alpha",
    registerActor = true
  }) => {
    if (registerActor) actorDirectory.register({ actorId, actorType });
    return registry.register({
      tenantId,
      actorId,
      actorType,
      issuer: "https://issuer.local.test",
      externalSubject,
      clientId: actorType === ActorType.HUMAN ? "shared_human_console" : "shared_workload_client",
      clientAuthenticationMethod: actorType === ActorType.HUMAN
        ? ClientAuthenticationMethod.OIDC_PKCE_BFF
        : ClientAuthenticationMethod.PRIVATE_KEY_JWT,
      senderConstraint: {
        method: actorType === ActorType.HUMAN
          ? SenderConstraintMethod.HOST_SESSION
          : SenderConstraintMethod.DPOP,
        thumbprint: "s".repeat(43)
      },
      roles: [],
      allowedCapabilities: ["subject.read"],
      policyVersion: "security_001.v1",
      performedByActorId: "actor_security_admin",
      reasonCode: "shared_client_test",
      now: new Date("2026-07-13T00:00:00.000Z")
    });
  };

  register({ actorId: "actor_human_one", actorType: ActorType.HUMAN, externalSubject: "human-one" });
  register({ actorId: "actor_human_two", actorType: ActorType.HUMAN, externalSubject: "human-two" });
  const firstTenant = register({
    actorId: "actor_human_multi_tenant",
    actorType: ActorType.HUMAN,
    externalSubject: "human-multi-tenant",
    tenantId: "tenant_alpha"
  });
  const secondTenant = register({
    actorId: "actor_human_multi_tenant",
    actorType: ActorType.HUMAN,
    externalSubject: "human-multi-tenant",
    tenantId: "tenant_beta",
    registerActor: false
  });
  assert.notEqual(firstTenant.credentialId, secondTenant.credentialId);
  assert.equal(registry.findBySubject({
    issuer: "https://issuer.local.test",
    tenantId: "tenant_beta",
    externalSubject: "human-multi-tenant",
    clientId: "shared_human_console",
    now: new Date("2026-07-13T00:00:00.000Z")
  }).credentialId, secondTenant.credentialId);
  register({ actorId: "actor_agent_one", actorType: ActorType.AGENT, externalSubject: "agent-one" });
  assert.throws(
    () => register({ actorId: "actor_agent_two", actorType: ActorType.AGENT, externalSubject: "agent-two" }),
    (error) => error.code === "authentication_credential_conflict"
  );
});

test("credential expiry fails closed and emits an explicit lifecycle event", () => {
  const referenceHasher = createReferenceHasher(randomBytes(32));
  const eventStore = new InMemoryAuthenticationEventStore();
  const actorDirectory = new InMemoryActorDirectory();
  actorDirectory.register({ actorId: "actor_agent_alpha", actorType: ActorType.AGENT });
  const registry = new InMemoryCredentialRegistry({ referenceHasher, eventStore, actorDirectory });
  const credential = registry.register({
    tenantId: "tenant_alpha",
    actorId: "actor_agent_alpha",
    actorType: ActorType.AGENT,
    issuer: "https://issuer.local.test",
    externalSubject: "expiring-agent",
    clientId: "expiring_agent_client",
    clientAuthenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraint: {
      method: SenderConstraintMethod.DPOP,
      thumbprint: "d".repeat(43)
    },
    allowedCapabilities: ["subject.read"],
    policyVersion: "security_001.v1",
    performedByActorId: "actor_security_admin",
    reasonCode: "local_test_registration",
    expiresAt: new Date("2026-07-13T00:01:00.000Z"),
    now: new Date("2026-07-13T00:00:00.000Z")
  });
  assert.throws(
    () => registry.assertActive(credential.credentialId, new Date("2026-07-13T00:01:00.000Z")),
    (error) => error.code === "authentication_credential_rejected"
  );
  assert.equal(registry.get(credential.credentialId).status, "expired");
  assert.equal(eventStore.list().at(-1).eventType, "credential_expired");
});

test("production authentication fails closed without IdP approval and secret-manager references", () => {
  assert.deepEqual(loadAuthenticationRuntimeConfig({}), {
    enabled: false,
    mode: "disabled",
    deploymentGateSatisfied: false
  });
  assert.throws(
    () => loadAuthenticationRuntimeConfig({ IPO_ONE_AUTHENTICATION_MODE: "closed_pilot" }),
    (error) => error.code === "authentication_deployment_gate_closed"
  );
  assert.throws(
    () => loadAuthenticationRuntimeConfig({
      NODE_ENV: "production",
      IPO_ONE_AUTHENTICATION_MODE: "local_test"
    }),
    (error) => error.code === "authentication_deployment_gate_closed"
  );
  const approved = loadAuthenticationRuntimeConfig({
    IPO_ONE_AUTHENTICATION_MODE: "closed_pilot",
    IPO_ONE_IDP_DEPLOYMENT_APPROVAL: "APPROVED",
    IPO_ONE_IDP_VENDOR_ID: "synthetic_test_idp",
    IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA: "a".repeat(40),
    IPO_ONE_IDP_CONFIGURATION_REF: "projects/ipo-one-pilot/secrets/idp-issuer/versions/1",
    IPO_ONE_OIDC_CLIENT_CREDENTIAL_REF: "projects/ipo-one-pilot/secrets/oidc-client/versions/2",
    IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF: "projects/ipo-one-pilot/secrets/auth-reference-key/versions/3",
    IPO_ONE_AUTH_ENCRYPTION_KEY_REF: "projects/ipo-one-pilot/secrets/auth-encryption-key/versions/4"
  });
  assert.equal(approved.deploymentGateSatisfied, true);
});

test("authentication database role rejects a privilege vector with the right booleans in wrong slots", async () => {
  const tablePrivileges = new Map([
    ["public.tenants", [true, false, false, false, false, false, false]],
    ["public.actors", [true, false, false, false, false, false, false]],
    ["public.memberships", [true, false, false, false, false, false, false]],
    ["public.authentication_credentials", [true, true, false, true, false, false, false]]
  ]);
  const queryable = {
    async query(sql, parameters = []) {
      if (sql.includes("FROM pg_catalog.pg_roles")) {
        return {
          rows: [{
            rolname: "ipo_auth_test",
            rolsuper: false,
            rolbypassrls: false,
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false,
            rolinherit: false,
            rolcanlogin: true,
            is_session_role: true,
            has_role_membership: false,
            owns_rls_table: false
          }]
        };
      }
      if (sql.includes("has_schema_privilege")) {
        return {
          rows: [{ schema_usage: true, schema_create: false, database_create: false }]
        };
      }
      if (sql.includes("current_schemas")) {
        return { rows: [{ schemas: ["public"] }] };
      }
      const privileges = tablePrivileges.get(parameters[0]);
      if (privileges) {
        return {
          rows: [{
            can_select: privileges[0],
            can_insert: privileges[1],
            can_update: privileges[2],
            can_delete: privileges[3],
            can_truncate: privileges[4],
            can_reference: privileges[5],
            can_trigger: privileges[6]
          }]
        };
      }
      throw new Error("unexpected role assertion query");
    }
  };
  await assert.rejects(
    () => assertPostgresAuthenticationRole(queryable),
    (error) => error.code === "unsafe_postgres_authentication_role"
  );
});
