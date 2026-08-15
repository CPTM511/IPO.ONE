import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { createPostgresPool } from "../../../modules/persistence/src/index.js";
import {
  assertProductionBootstrapConfig,
  bootstrapProductionDatabase
} from "../src/production-bootstrap.js";
import { runVercelSandboxCronCycle } from "../src/vercel-sandbox-cron.js";

const { Pool } = pg;
const CONNECTION_STRING = process.env.DATABASE_URL;

test(
  "Vercel Cron uses PostgreSQL locking and one durable idempotency bucket across concurrent and restarted invocations",
  { timeout: 30_000 },
  async () => {
    assert.ok(CONNECTION_STRING, "DATABASE_URL is required");
    const suffix = randomBytes(6).toString("hex");
    const gatewayRole = `ipo_vercel_gateway_${suffix}`;
    const authenticationRole = `ipo_vercel_auth_${suffix}`;
    const gatewayPassword = randomBytes(32).toString("base64url");
    const authenticationPassword = randomBytes(32).toString("base64url");
    const referenceHashKey = randomBytes(32);
    const tenantId = `tenant_vercel_${suffix}`;
    const systemActorId = `actor_vercel_system_${suffix}`;
    const policyVersion = "security_001.v1";
    const releaseId = "c".repeat(40);
    const ownerPool = new Pool({ connectionString: CONNECTION_STRING, max: 2 });
    const config = assertProductionBootstrapConfig({
      schemaVersion: "ipo_one_production_bootstrap.v2",
      gatewayRole,
      authenticationRole,
      tenant: {
        tenantId,
        organizationRef: `urn:ipo.one:organization:vercel-${suffix}`,
        displayName: `Vercel Sandbox ${suffix}`,
        pilotJurisdiction: "PRIVATE_NO_FUNDS",
        retentionOwnerRef: `urn:ipo.one:retention:vercel-${suffix}`
      },
      systemActor: {
        actorId: systemActorId,
        clientId: `client_vercel_system_${suffix}`
      },
      policyVersion,
      credentials: [{
        kind: "human_wallet",
        profile: "risk_operator",
        actorId: `actor_vercel_risk_${suffix}`,
        clientId: `client_vercel_wallet_${suffix}`,
        issuer: "https://ipo-one-internal.vercel.app",
        externalSubject: `eip155:84532:0x${"1".repeat(40)}`,
        invitationId: `invite_vercel_risk_${suffix}`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString()
      }]
    });
    let gatewayPool;
    try {
      await bootstrapProductionDatabase({
        adminConnectionString: CONNECTION_STRING,
        config,
        gatewayPassword,
        authenticationPassword,
        referenceHashKey
      });
      const gatewayUrl = new URL(CONNECTION_STRING);
      gatewayUrl.username = gatewayRole;
      gatewayUrl.password = gatewayPassword;
      const environment = {
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_TARGET_ENV: "production",
        IPO_ONE_DEPLOYMENT_PROFILE: "vercel_sandbox",
        IPO_ONE_DEPLOYMENT_MODE: "vercel_sandbox",
        IPO_ONE_VERCEL_PROJECT_ROLE: "primary",
        IPO_ONE_NO_REAL_FUNDS_ACK: "I_UNDERSTAND_DEPLOYABLE_SANDBOX_NO_REAL_FUNDS",
        IPO_ONE_GATEWAY_DATABASE_URL: gatewayUrl.toString(),
        IPO_ONE_TENANT_ID: tenantId,
        IPO_ONE_SYSTEM_ACTOR_ID: systemActorId,
        IPO_ONE_POLICY_VERSION: policyVersion,
        IPO_ONE_RELEASE_ID: releaseId
      };
      gatewayPool = createPostgresPool({
        connectionString: gatewayUrl.toString(),
        max: 1,
        applicationName: "ipo-one-vercel-cron-lock-test"
      });
      const lockClient = await gatewayPool.connect();
      try {
        await lockClient.query(
          "SELECT pg_advisory_lock(hashtext($1), hashtext($2))",
          ["ipo.one", "vercel-sandbox-cron"]
        );
        const skipped = await runVercelSandboxCronCycle({ environment });
        assert.equal(skipped.status, "skipped_concurrent_run");
      } finally {
        await lockClient.query(
          "SELECT pg_advisory_unlock(hashtext($1), hashtext($2))",
          ["ipo.one", "vercel-sandbox-cron"]
        );
        lockClient.release();
      }

      const now = new Date("2026-08-05T00:10:00.000Z");
      const concurrent = await Promise.all([
        runVercelSandboxCronCycle({ environment, now }),
        runVercelSandboxCronCycle({ environment, now })
      ]);
      assert.ok(concurrent.every(({ status }) =>
        new Set(["completed", "skipped_concurrent_run"]).has(status)
      ));
      assert.ok(concurrent.some(({ status }) => status === "completed"));

      const restarted = await runVercelSandboxCronCycle({ environment, now });
      assert.equal(restarted.status, "completed");
      const reconciliation = await ownerPool.query(
        `SELECT count(*)::int AS count
           FROM command_idempotency
          WHERE tenant_id = $1
            AND idempotency_key = $2`,
        [tenantId, `vercel-sandbox-reconciliation-${Math.floor(now.getTime() / 300_000)}`]
      );
      assert.equal(reconciliation.rows[0].count, 1);
      assert.equal(restarted.realFundsEnabled, false);
    } finally {
      await gatewayPool?.end().catch(() => {});
      await ownerPool.query("TRUNCATE TABLE actors, tenants RESTART IDENTITY CASCADE").catch(() => {});
      for (const role of [gatewayRole, authenticationRole]) {
        await ownerPool.query(`DROP OWNED BY ${role}`).catch(() => {});
        await ownerPool.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
      }
      await ownerPool.end();
    }
  }
);
