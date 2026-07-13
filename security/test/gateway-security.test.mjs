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
