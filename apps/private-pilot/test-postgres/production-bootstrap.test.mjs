import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { migrateDown, migrateUp } from "../../../scripts/migrate.mjs";
import {
  assertProductionBootstrapConfig,
  bootstrapProductionDatabase,
  enrollProductionHumanRole,
  provisionProductionGoldenFlowAgent,
  revokeProductionGoldenFlowAgentCredential
} from "../src/production-bootstrap.js";

const { Pool } = pg;
const futureCredentialExpiry = () =>
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();

test("fresh migrations succeed for a non-superuser database owner under forced RLS", async () => {
  const suffix = randomBytes(5).toString("hex");
  const role = `ipo_migration_${suffix}`;
  const gatewayRole = `ipo_gateway_${suffix}`;
  const authenticationRole = `ipo_auth_${suffix}`;
  const database = `ipo_migration_test_${suffix}`;
  const password = randomBytes(24).toString("hex");
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  let target;
  try {
    await admin.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB CREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
    await admin.query(`CREATE DATABASE "${database}" OWNER "${role}"`);
    const targetUrl = new URL(adminUrl);
    targetUrl.username = role;
    targetUrl.password = password;
    targetUrl.pathname = `/${database}`;
    target = new Pool({ connectionString: targetUrl.toString(), max: 1 });
    const applied = await migrateUp({ pool: target });
    assert.equal(
      applied.at(-1),
      "0067_m2b_hyperliquid_compositions"
    );
    assert.ok(applied.includes("0008_durable_tenant_command_gateway"));
    const bootstrap = await bootstrapProductionDatabase({
      adminConnectionString: targetUrl.toString(),
      config: assertProductionBootstrapConfig({
        schemaVersion: "ipo_one_production_bootstrap.v2",
        gatewayRole,
        authenticationRole,
        tenant: {
          tenantId: `tenant_cloud_owner_${suffix}`,
          organizationRef: `urn:ipo.one:organization:cloud-owner-${suffix}`,
          displayName: `Cloud Owner ${suffix}`,
          pilotJurisdiction: "PRIVATE_NO_FUNDS",
          retentionOwnerRef: `urn:ipo.one:retention:cloud-owner-${suffix}`
        },
        systemActor: {
          actorId: `actor_system_${suffix}`,
          clientId: `client_system_${suffix}`
        },
        policyVersion: "security_001.v1",
        credentials: [{
          kind: "human_wallet",
          profile: "human_borrower",
          actorId: `actor_human_${suffix}`,
          clientId: "ipo_one_wallet",
          issuer: "https://ipo.one",
          externalSubject: "eip155:84532:0x1111111111111111111111111111111111111111",
          invitationId: `invite_cloud_owner_${suffix}`,
          expiresAt: futureCredentialExpiry()
        }]
      }),
      gatewayPassword: randomBytes(32).toString("base64url"),
      authenticationPassword: randomBytes(32).toString("base64url"),
      referenceHashKey: randomBytes(32)
    });
    assert.equal(bootstrap.insertedCredentials, 1);
    const rls = await target.query(
      "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ANY($1::text[]) ORDER BY relname",
      [["actors", "tenants"]]
    );
    assert.deepEqual(rls.rows, [
      { relname: "actors", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "tenants", relrowsecurity: true, relforcerowsecurity: true }
    ]);
  } finally {
    await target?.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS "${gatewayRole}"`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS "${authenticationRole}"`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {});
    await admin.end();
  }
});

test("production bootstrap creates closed roles, seeds identity, and is idempotent", async () => {
  const suffix = randomBytes(6).toString("hex");
  const input = {
    schemaVersion: "ipo_one_production_bootstrap.v2",
    gatewayRole: `ipo_gateway_${suffix}`,
    authenticationRole: `ipo_auth_${suffix}`,
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
      externalSubject: "eip155:84532:0x1111111111111111111111111111111111111111",
      invitationId: `invite_borrower_${suffix}`,
      expiresAt: futureCredentialExpiry()
    }, {
      kind: "human_wallet",
      profile: "principal_controller",
      actorId: `actor_principal_${suffix}`,
      clientId: "ipo_one_wallet",
      issuer: "https://ipo.one",
      externalSubject: "eip155:84532:0x2222222222222222222222222222222222222222",
      invitationId: `invite_principal_${suffix}`,
      expiresAt: futureCredentialExpiry()
    }, {
      kind: "agent_dpop",
      profile: "agent_runtime",
      actorId: `actor_agent_${suffix}`,
      clientId: `client_agent_${suffix}`,
      issuer: "https://workload.ipo.one",
      externalSubject: `agent-runtime-${suffix}`,
      controllerActorId: `actor_principal_${suffix}`,
      senderThumbprint: "d".repeat(43),
      invitationId: `invite_agent_${suffix}`,
      expiresAt: futureCredentialExpiry()
    }, {
      kind: "human_wallet",
      profile: "risk_operator",
      actorId: `actor_risk_${suffix}`,
      clientId: "ipo_one_wallet",
      issuer: "https://ipo.one",
      externalSubject: "eip155:84532:0x3333333333333333333333333333333333333333",
      invitationId: `invite_risk_${suffix}`,
      expiresAt: futureCredentialExpiry()
    }]
  };
  const referenceHashKey = randomBytes(32);
  const parameters = {
    adminConnectionString: process.env.DATABASE_URL,
    config: assertProductionBootstrapConfig(input),
    gatewayPassword: randomBytes(32).toString("base64url"),
    authenticationPassword: randomBytes(32).toString("base64url"),
    referenceHashKey
  };

  const first = await bootstrapProductionDatabase(parameters);
  assert.equal(first.schemaVersion, "ipo_one_production_bootstrap_result.v2");
  assert.equal(first.insertedCredentials, 4);
  assert.equal(first.credentialCount, 4);
  assert.equal(first.invitationCount, 4);

  const upgradeDatabase = `ipo_bootstrap_upgrade_${suffix}`;
  const upgradeGatewayRole = `${input.gatewayRole}_upgrade`;
  const upgradeAuthenticationRole = `${input.authenticationRole}_upgrade`;
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const upgradeUrl = new URL(adminUrl);
  upgradeUrl.pathname = `/${upgradeDatabase}`;
  const upgradeAdmin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  let upgradePool;
  try {
    await upgradeAdmin.query(`CREATE DATABASE "${upgradeDatabase}"`);
    upgradePool = new Pool({ connectionString: upgradeUrl.toString(), max: 1 });
    assert.equal(
      (await migrateUp({ pool: upgradePool })).at(-1),
      "0067_m2b_hyperliquid_compositions"
    );
    const upgradeBootstrap = await bootstrapProductionDatabase({
      ...parameters,
      adminConnectionString: upgradeUrl.toString(),
      config: assertProductionBootstrapConfig({
        ...input,
        gatewayRole: upgradeGatewayRole,
        authenticationRole: upgradeAuthenticationRole
      })
    });
    assert.equal(upgradeBootstrap.insertedCredentials, 4);
    assert.deepEqual(await migrateDown({ pool: upgradePool, steps: 5 }), [
      "0067_m2b_hyperliquid_compositions",
      "0066_agent_secured_facility_authorizations",
      "0065_pool_obligation_integration",
      "0064_pool_chain_reconciliation",
      "0063_selected_human_role_enrollment"
    ]);
    assert.deepEqual(await migrateUp({ pool: upgradePool }), [
      "0063_selected_human_role_enrollment",
      "0064_pool_chain_reconciliation",
      "0065_pool_obligation_integration",
      "0066_agent_secured_facility_authorizations",
      "0067_m2b_hyperliquid_compositions"
    ]);
    const backfilled = await upgradePool.query(
      `SELECT count(*)::int AS count
         FROM authentication_role_enrollments
        WHERE tenant_id = $1`,
      [input.tenant.tenantId]
    );
    assert.equal(backfilled.rows[0].count, 2);
  } finally {
    await upgradePool?.end().catch(() => {});
    await upgradeAdmin.query(`DROP DATABASE IF EXISTS "${upgradeDatabase}" WITH (FORCE)`).catch(() => {});
    await upgradeAdmin.query(`DROP ROLE IF EXISTS "${upgradeGatewayRole}"`).catch(() => {});
    await upgradeAdmin.query(`DROP ROLE IF EXISTS "${upgradeAuthenticationRole}"`).catch(() => {});
    await upgradeAdmin.end();
  }

  const second = await bootstrapProductionDatabase(parameters);
  assert.equal(second.insertedCredentials, 0);
  assert.equal(second.tenantId, input.tenant.tenantId);

  const borrowerEnrollment = await enrollProductionHumanRole({
    adminConnectionString: process.env.DATABASE_URL,
    tenantId: input.tenant.tenantId,
    actorId: `actor_principal_${suffix}`,
    roleBundle: "human_borrower",
    performedByActorId: input.systemActor.actorId
  });
  assert.equal(borrowerEnrollment.roleBundle, "human_borrower");
  assert.equal(borrowerEnrollment.replayed, false);
  assert.equal(borrowerEnrollment.credentialsIncluded, false);
  const replayedEnrollment = await enrollProductionHumanRole({
    adminConnectionString: process.env.DATABASE_URL,
    tenantId: input.tenant.tenantId,
    actorId: `actor_principal_${suffix}`,
    roleBundle: "human_borrower",
    performedByActorId: input.systemActor.actorId
  });
  assert.equal(replayedEnrollment.enrollmentId, borrowerEnrollment.enrollmentId);
  assert.equal(replayedEnrollment.replayed, true);

  const reusedInvitationConfig = assertProductionBootstrapConfig({
    ...input,
    credentials: [{
      ...input.credentials[0],
      actorId: `actor_reused_invitation_${suffix}`,
      externalSubject:
        "eip155:84532:0x5555555555555555555555555555555555555555"
    }]
  });
  await assert.rejects(
    () => bootstrapProductionDatabase({
      ...parameters,
      config: reusedInvitationConfig
    }),
    (error) => error?.code === "invalid_production_bootstrap"
  );

  const verificationPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1
  });
  let invitationEvents;
  let provisionedCredentials;
  let roleEnrollmentEvidence;
  try {
    invitationEvents = await verificationPool.query(
      `SELECT payload
         FROM authentication_events
        WHERE tenant_id=$1 AND event_type='credential_registered'
        ORDER BY credential_id`,
      [input.tenant.tenantId]
    );
    provisionedCredentials = await verificationPool.query(
      `SELECT actor_id, actor_type, client_authentication_method,
              sender_constraint_method, allowed_capabilities, expires_at
         FROM authentication_credentials
        WHERE tenant_id=$1
        ORDER BY actor_id`,
      [input.tenant.tenantId]
    );
    roleEnrollmentEvidence = await verificationPool.query(
      `SELECT e.payload
         FROM authentication_events e
        WHERE e.tenant_id=$1 AND e.event_type='role_enrolled'`,
      [input.tenant.tenantId]
    );
  } finally {
    await verificationPool.end();
  }
  assert.equal(invitationEvents.rowCount, 4);
  assert.equal(
    invitationEvents.rows.every(({ payload }) =>
      /^[A-Za-z0-9_-]{43}$/.test(payload.invitationRefHash)),
    true
  );
  assert.equal(JSON.stringify(invitationEvents.rows).includes("invite_"), false);
  assert.equal(JSON.stringify(invitationEvents.rows).includes("0x111111"), false);
  assert.equal(JSON.stringify(invitationEvents.rows).includes("d".repeat(43)), false);
  assert.equal(provisionedCredentials.rowCount, 4);
  assert.equal(roleEnrollmentEvidence.rowCount, 1);
  assert.equal(roleEnrollmentEvidence.rows[0].payload.roleBundle, "human_borrower");
  const agentCredential = provisionedCredentials.rows.find(
    ({ actor_type: actorType }) => actorType === "agent"
  );
  assert.equal(agentCredential.client_authentication_method, "private_key_jwt");
  assert.equal(agentCredential.sender_constraint_method, "dpop");
  const riskCredential = provisionedCredentials.rows.find(
    ({ actor_type: actorType }) => actorType === "risk_operator"
  );
  assert.ok(riskCredential);
  assert.equal(
    riskCredential.allowed_capabilities.includes(
      "credit_registry.evidence.read.tenant"
    ),
    true
  );
  assert.ok(new Date(riskCredential.expires_at) > new Date());

  const goldenFlowInput = {
    adminConnectionString: process.env.DATABASE_URL,
    referenceHashKey,
    tenantId: input.tenant.tenantId,
    controllerActorId: `actor_principal_${suffix}`,
    actorId: `actor_golden_flow_${suffix}`,
    clientId: `client_golden_flow_${suffix}`,
    issuer: "https://workload.ipo.one",
    externalSubject: `golden-flow-agent-${suffix}`,
    invitationId: `invite_golden_flow_${suffix}`,
    senderThumbprint: "g".repeat(43),
    expiresAt: futureCredentialExpiry(),
    performedByActorId: input.systemActor.actorId
  };
  const provisionedAgent = await provisionProductionGoldenFlowAgent(goldenFlowInput);
  assert.equal(provisionedAgent.replayed, false);
  assert.equal(provisionedAgent.privateKeyIncluded, false);
  assert.equal(provisionedAgent.runnerBootstrap.credentials[0].senderThumbprint, "g".repeat(43));
  assert.equal(JSON.stringify(provisionedAgent).includes("invite_golden_flow"), false);
  const replayedAgent = await provisionProductionGoldenFlowAgent(goldenFlowInput);
  assert.equal(replayedAgent.credentialId, provisionedAgent.credentialId);
  assert.equal(replayedAgent.replayed, true);
  const revokedAgent = await revokeProductionGoldenFlowAgentCredential({
    adminConnectionString: process.env.DATABASE_URL,
    tenantId: input.tenant.tenantId,
    actorId: goldenFlowInput.actorId,
    performedByActorId: input.systemActor.actorId
  });
  assert.equal(revokedAgent.status, "revoked");
  assert.equal(revokedAgent.replayed, false);
  const replayedRevocation = await revokeProductionGoldenFlowAgentCredential({
    adminConnectionString: process.env.DATABASE_URL,
    tenantId: input.tenant.tenantId,
    actorId: goldenFlowInput.actorId,
    performedByActorId: input.systemActor.actorId
  });
  assert.equal(replayedRevocation.replayed, true);

  await assert.rejects(
    () => bootstrapProductionDatabase({
      ...parameters,
      config: assertProductionBootstrapConfig({
        ...input,
        credentials: input.credentials.map((credential, index) => index === 0
          ? {
              ...credential,
              expiresAt: new Date(Date.now() - 1_000).toISOString()
            }
          : credential)
      })
    }),
    (error) => error.code === "invalid_production_bootstrap"
  );
  await assert.rejects(
    () => bootstrapProductionDatabase({
      ...parameters,
      config: assertProductionBootstrapConfig({
        ...input,
        credentials: input.credentials.map((credential, index) => index === 0
          ? {
              ...credential,
              expiresAt:
                new Date(Date.now() + 91 * 24 * 60 * 60 * 1_000).toISOString()
            }
          : credential)
      })
    }),
    (error) => error.code === "invalid_production_bootstrap"
  );

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
