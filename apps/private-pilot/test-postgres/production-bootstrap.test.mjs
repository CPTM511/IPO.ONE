import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateUp } from "../../../scripts/migrate.mjs";
import {
  assertProductionBootstrapConfig,
  bootstrapProductionDatabase
} from "../src/production-bootstrap.js";

const { Pool } = pg;

test("fresh migrations succeed for a non-superuser database owner under forced RLS", async () => {
  const suffix = randomBytes(5).toString("hex");
  const role = `ipo_migration_${suffix}`;
  const database = `ipo_migration_test_${suffix}`;
  const password = randomBytes(24).toString("hex");
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  let target;
  try {
    await admin.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
    await admin.query(`CREATE DATABASE "${database}" OWNER "${role}"`);
    const targetUrl = new URL(adminUrl);
    targetUrl.username = role;
    targetUrl.password = password;
    targetUrl.pathname = `/${database}`;
    target = new Pool({ connectionString: targetUrl.toString(), max: 1 });
    const applied = await migrateUp({ pool: target });
    assert.equal(applied.at(-1), "0025_durable_human_authentication");
    assert.ok(applied.includes("0008_durable_tenant_command_gateway"));
  } finally {
    await target?.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {});
    await admin.end();
  }
});

test("production bootstrap creates closed roles, seeds identity, and is idempotent", async () => {
  const suffix = randomBytes(6).toString("hex");
  const input = {
    schemaVersion: "ipo_one_production_bootstrap.v1",
    gatewayRole: "ipo_one_gateway_test",
    authenticationRole: "ipo_one_authentication_test",
    tenant: {
      tenantId: `tenant_bootstrap_${suffix}`,
      organizationRef: `urn:ipo.one:organization:bootstrap-${suffix}`,
      displayName: `Bootstrap ${suffix}`,
      pilotJurisdiction: "PRIVATE_NO_FUNDS",
      retentionOwnerRef: `urn:ipo.one:retention:bootstrap-${suffix}`
    },
    systemActor: {
      actorId: `actor_system_${suffix}`,
      clientId: `client_system_${suffix}`
    },
    policyVersion: "security_001.v1",
    credentials: [{
      kind: "human_wallet",
      profile: "human_borrower",
      actorId: `actor_borrower_${suffix}`,
      clientId: "ipo_one_wallet",
      issuer: "https://ipo.one",
      externalSubject: "eip155:84532:0x1111111111111111111111111111111111111111"
    }, {
      kind: "human_wallet",
      profile: "principal_controller",
      actorId: `actor_principal_${suffix}`,
      clientId: "ipo_one_wallet",
      issuer: "https://ipo.one",
      externalSubject: "eip155:84532:0x2222222222222222222222222222222222222222"
    }, {
      kind: "agent_mtls",
      profile: "agent_runtime",
      actorId: `actor_agent_${suffix}`,
      clientId: `client_agent_${suffix}`,
      issuer: "https://workload.ipo.one",
      externalSubject: `agent-runtime-${suffix}`,
      controllerActorId: `actor_principal_${suffix}`,
      senderThumbprint: "m".repeat(43)
    }]
  };
  const parameters = {
    adminConnectionString: process.env.DATABASE_URL,
    config: assertProductionBootstrapConfig(input),
    gatewayPassword: randomBytes(32).toString("base64url"),
    authenticationPassword: randomBytes(32).toString("base64url"),
    referenceHashKey: randomBytes(32)
  };

  const first = await bootstrapProductionDatabase(parameters);
  assert.equal(first.insertedCredentials, 3);
  assert.equal(first.credentialCount, 3);

  const second = await bootstrapProductionDatabase(parameters);
  assert.equal(second.insertedCredentials, 0);
  assert.equal(second.tenantId, input.tenant.tenantId);

  await assert.rejects(
    () => bootstrapProductionDatabase({
      ...parameters,
      config: assertProductionBootstrapConfig({
        ...input,
        tenant: { ...input.tenant, displayName: "Drifted Tenant" }
      })
    }),
    (error) => error.code === "invalid_production_bootstrap"
  );
});
