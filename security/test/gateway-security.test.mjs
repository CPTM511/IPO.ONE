import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

async function source(path) {
  return readFile(`${rootDir}/${path}`, "utf8");
}

test("anonymous public sandbox has no durable Tenant Gateway import or database path", async () => {
  const [server, runtime] = await Promise.all([
    source("apps/api/src/server.js"),
    source("apps/api/src/runtime-config.js")
  ]);
  for (const body of [server, runtime]) {
    assert.doesNotMatch(body, /TenantCommandGateway|tenant-command-gateway|PostgresCoreRepository|DATABASE_URL/);
  }
  assert.match(server, /createInteractiveDemo/);
});

test("Gateway derives authority from Authentication Context and binds exact payload", async () => {
  const gateway = await source("modules/tenant-command-gateway/src/tenant-command-gateway.js");
  for (const required of [
    "assertAuthenticationContext",
    "RESERVED_PAYLOAD_AUTHORITY_KEYS",
    "commandPayloadHash",
    "requestIdentityHash",
    "lockAdmissionForTransaction",
    "findCommandInTransaction",
    "completeAdmissionInTransaction",
    "createTenantSecurityContextFromAuthorization"
  ]) {
    assert.match(gateway, new RegExp(required));
  }
  assert.doesNotMatch(gateway, /input\.tenantId|input\.actorId|input\.clientId/);
  assert.doesNotMatch(gateway, /accessToken|refreshToken|privateKey|rawIp|x-forwarded-for/i);
});

test("durable Gateway authority is Tenant-scoped, append-only, and non-secret", async () => {
  const migration = await source("db/migrations/0008_durable_tenant_command_gateway.up.sql");
  for (const required of [
    "ALTER TABLE authorization_resources FORCE ROW LEVEL SECURITY",
    "authorization_audit_events_immutable",
    "tenant_command_executions_immutable",
    "FOREIGN KEY (tenant_id, actor_id)",
    "REFERENCES memberships(tenant_id, actor_id)",
    "client_ref_hash",
    "command_payload_hash",
    "memberships_controller_fk",
    "controller_actor_id",
    "pg_advisory_xact_lock",
    "BEFORE UPDATE OR DELETE ON memberships",
    "BEFORE UPDATE OR DELETE ON access_grants",
    "BEFORE UPDATE OR DELETE ON authorization_resources",
    "BEFORE UPDATE OR DELETE ON authorization_resource_bindings",
    "Actor immutable fields cannot change",
    "actor_authorization_lock_update",
    "access_grants_participant_lock_update",
    "authorization_resources_participant_lock_update"
  ]) {
    assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(migration, /access_token|refresh_token|private_key|raw_ip|request_body|kyc_payload/i);
});

test("durable draft Mandate management can only reduce authority", async () => {
  const [handlers, gateway, server] = await Promise.all([
    source("modules/tenant-command-gateway/src/mandate-handlers.js"),
    source("modules/tenant-command-gateway/src/tenant-command-gateway.js"),
    source("apps/api/src/server.js")
  ]);
  for (const required of [
    "pilotReadMandate",
    "pilotRevokeDraftMandate",
    "MandateStatus.REVOKED",
    'expectedStatus: "active"',
    'nextStatus: "closed"'
  ]) {
    assert.match(handlers, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const required of [
    "authorizationResourceTransition",
    "authorizationDecision.resourceType",
    "authorizationDecision.resourceId",
    "authorizationDecision.resourceVersion"
  ]) {
    assert.match(gateway, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(handlers, /MandateStatus\.ACTIVE|activateMandate|signature|walletProof/i);
  assert.doesNotMatch(server, /pilotReadMandate|pilotRevokeDraftMandate|tenant-command-gateway/);
});

test("durable Subject freeze is protective, reason-coded, and private", async () => {
  const [handlers, livePolicy, clients, catalogBody, server] = await Promise.all([
    source("modules/tenant-command-gateway/src/subject-risk-handlers.js"),
    source("modules/tenant-command-gateway/src/postgres-live-policy-adapter.js"),
    source("modules/tenant-command-gateway/src/tenant-command-clients.js"),
    source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json"),
    source("apps/api/src/server.js")
  ]);
  for (const required of [
    "pilotFreezeSubject",
    "SubjectStatus.SUSPENDED",
    "SubjectTransitions",
    "PROTECTIVE_REASON_CODES",
    "SUBJECT_STATUS_CHANGED"
  ]) {
    assert.match(handlers, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(livePolicy, /\["risk", "freeze"\]/);
  assert.match(clients, /OperatorTenantCommandClient/);
  assert.doesNotMatch(handlers, /SubjectStatus\.ACTIVE|unfreeze|approvalArtifact/i);
  const catalog = JSON.parse(catalogBody);
  const freeze = catalog.operations.find(({ operationId }) => operationId === "pilotFreezeSubject");
  assert.deepEqual(freeze.actorTypes, ["risk_operator", "operations_operator"]);
  assert.equal(freeze.quotaClass, "privileged");
  assert.equal(freeze.fundsAuthority, false);
  assert.equal(catalog.operations.some(({ operationId }) => operationId === "pilotUnfreezeSubject"), false);
  assert.doesNotMatch(server, /pilotFreezeSubject|subject-risk-handlers|tenant-command-gateway/);
});

test("Tenant protocol contracts are closed, non-authoritative, and private", async () => {
  const [requestSchemaBody, resultSchemaBody, catalogBody, gateway, clients, server] = await Promise.all([
    source("schemas/v2/tenant-protocol-request.schema.json"),
    source("schemas/v2/tenant-protocol-result.schema.json"),
    source("api/tenant-protocol/ipo-one.tenant-protocol.v1.json"),
    source("modules/tenant-command-gateway/src/tenant-command-gateway.js"),
    source("modules/tenant-command-gateway/src/tenant-command-clients.js"),
    source("apps/api/src/server.js")
  ]);
  const requestSchema = JSON.parse(requestSchemaBody);
  const resultSchema = JSON.parse(resultSchemaBody);
  const catalog = JSON.parse(catalogBody);

  assert.equal(requestSchema.additionalProperties, false);
  assert.equal(resultSchema.additionalProperties, false);
  for (const property of [
    "authenticationContext",
    "tenantId",
    "actorId",
    "actorType",
    "clientId",
    "credentialId",
    "roles",
    "authorizationDecision",
    "networkContext"
  ]) {
    assert.equal(Object.hasOwn(requestSchema.properties, property), false);
  }
  assert.deepEqual(catalog.availability.enabledTransports, ["local_in_process"]);
  assert.equal(catalog.availability.publicEndpointEnabled, false);
  assert.equal(catalog.availability.authenticatedHttpEnabled, false);
  assert.equal(catalog.availability.mcpA2aEnabled, false);
  assert.equal(Object.values(catalog.safety).every((value) => value === false), true);
  assert.equal(catalog.operations.every((operation) => !operation.public && !operation.fundsAuthority), true);

  assert.ok(gateway.indexOf("assertCallerRequest(input)") < gateway.indexOf("abuseControl.admitTenant"));
  assert.ok(
    gateway.indexOf("const plannedResult = createProtocolResult") <
      gateway.indexOf("commitCommandInTransaction")
  );
  assert.match(gateway, /assertTenantProtocolResult\(result\)/);
  assert.ok(
    clients.indexOf("assertTenantProtocolRequest(request)") <
      clients.indexOf("authenticationContextProvider\(\)")
  );
  assert.doesNotMatch(server, /tenant-protocol|TENANT_PROTOCOL|pilotCreateAgentSubject/);
});
