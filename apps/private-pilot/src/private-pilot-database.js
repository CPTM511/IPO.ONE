import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  assertTenantDatabaseRole,
  createPostgresPool,
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";
import { migrateUp } from "../../../scripts/migrate.mjs";
import { assertPrivatePilotProfile } from "./private-pilot-profile.js";

const APP_ROLE = "ipo_one_private_pilot_app";
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SECRET_PATH = resolve(MODULE_DIRECTORY, "../../../.ipo-one/private-pilot-db-secret");

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

export async function loadOrCreatePrivatePilotDatabaseSecret(
  path = process.env.IPO_ONE_PILOT_DB_SECRET_FILE || DEFAULT_SECRET_PATH
) {
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (/^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
    throw new Error("Private pilot database secret file is invalid");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const secret = randomBytes(32).toString("base64url");
  await writeFile(path, `${secret}\n`, { mode: 0o600, flag: "wx" });
  return secret;
}

async function provisionApplicationRole(ownerPool, password) {
  const quotedPassword = (await ownerPool.query("SELECT quote_literal($1) AS value", [password])).rows[0].value;
  const role = await ownerPool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
  if (role.rowCount === 0) {
    await ownerPool.query(
      `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD ${quotedPassword}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
  } else {
    await ownerPool.query(
      `ALTER ROLE ${APP_ROLE} WITH LOGIN PASSWORD ${quotedPassword}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
  }
  const database = (await ownerPool.query("SELECT quote_ident(current_database()) AS value")).rows[0].value;
  await ownerPool.query(`GRANT CONNECT ON DATABASE ${database} TO ${APP_ROLE}`);
  await ownerPool.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
  await ownerPool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await ownerPool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
  await ownerPool.query(`GRANT UPDATE (id) ON actors, memberships, access_grants TO ${APP_ROLE}`);
  await ownerPool.query(`GRANT UPDATE (status) ON obligations, credit_lines TO ${APP_ROLE}`);
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
       agent_account_challenges, agent_account_proof_attempts, account_bindings,
       consent_records, human_identity_references, credit_intents,
       risk_decisions, credit_offers, credit_offer_acceptances,
       obligations, obligation_installments, sandbox_execution_receipts,
       sandbox_servicing_actions, provider_intent_deliveries,
       provider_intent_acknowledgements, provider_callback_inbox,
       credit_lines, ledger_accounts, ledger_transactions, ledger_entries,
       repayment_events, aggregate_stream_heads, domain_events, credit_events,
       pilot_feedback_records,
       evidence_envelopes, outbox_messages, command_idempotency,
       command_events, projection_registry, projection_snapshots,
       reconciliation_runs, reconciliation_discrepancies
     TO ${APP_ROLE}`
  );
}

async function seedTenant(ownerPool, profile, now) {
  const tenantHash = hashId("private_pilot_tenant", profile.tenantId);
  await ownerPool.query(
    `INSERT INTO tenants(
       id, tenant_hash, organization_ref, display_name, status,
       pilot_jurisdiction, legal_retention_owner_ref, created_at, updated_at,
       schema_version
     ) VALUES (
       $1, $2, $3, 'IPO.ONE Synthetic No-Funds Tenant', 'active',
       'NOT_APPLICABLE_SYNTHETIC', 'urn:ipo.one:unassigned:local-pilot',
       $4, $4, 'tenant.v1'
     )
     ON CONFLICT (id) DO UPDATE SET
       status = 'active',
       updated_at = EXCLUDED.updated_at`,
    [
      profile.tenantId,
      tenantHash,
      `urn:ipo.one:synthetic-tenant:${tenantHash}`,
      now
    ]
  );
}

async function seedIdentity(ownerPool, identity, profile, now) {
  await ownerPool.query(
    `INSERT INTO actors(
       id, actor_hash, actor_type, status, created_at, updated_at, schema_version
     ) VALUES ($1, $2, $3, 'active', $4, $4, 'actor.v1')
     ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = EXCLUDED.updated_at`,
    [identity.actorId, hashId("private_pilot_actor", identity.actorId), identity.actorType, now]
  );
  const context = createTenantSecurityContext({
    tenantId: profile.tenantId,
    actorId: identity.actorId,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  await withTenantTransaction(ownerPool, context, (client) => client.query(
    `INSERT INTO memberships(
       id, membership_hash, tenant_id, actor_id, role_bundle, capabilities,
       client_ids, policy_version, controller_actor_id, status, valid_from,
       expires_at, created_at, updated_at, version, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'security_001.v1', $8,
       'active', $9, NULL, $9, $9, 1, 'membership.v1'
     )
     ON CONFLICT (tenant_id, actor_id, role_bundle) DO UPDATE SET
       capabilities = EXCLUDED.capabilities,
       client_ids = EXCLUDED.client_ids,
       policy_version = EXCLUDED.policy_version,
       controller_actor_id = EXCLUDED.controller_actor_id,
       status = 'active',
       updated_at = EXCLUDED.updated_at,
       version = memberships.version + 1`,
    [
      identity.membershipId,
      hashId("private_pilot_membership", identity.membershipId),
      profile.tenantId,
      identity.actorId,
      identity.roleBundle,
      JSON.stringify(identity.capabilities),
      JSON.stringify([identity.clientId]),
      identity.controllerActorId ?? null,
      now
    ]
  ));
}

async function seedRiskResources(ownerPool, riskIdentity, profile, now) {
  const context = createTenantSecurityContext({
    tenantId: profile.tenantId,
    actorId: riskIdentity.actorId,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  await withTenantTransaction(ownerPool, context, async (client) => {
    for (const [resourceType, resourceId] of [
      ["risk_portfolio", profile.riskPortfolioId],
      ["servicing_queue", profile.servicingQueueId]
    ]) {
      await client.query(
        `INSERT INTO authorization_resources(
           tenant_id, resource_type, resource_id, status, version,
           created_at, updated_at, schema_version
         ) VALUES ($1, $2, $3, 'active', 1, $4, $4, 'authorization_resource.v1')
         ON CONFLICT (tenant_id, resource_type, resource_id) DO NOTHING`,
        [profile.tenantId, resourceType, resourceId, now]
      );
    }
  });
}

export async function provisionPrivatePilotDatabase({
  ownerConnectionString,
  identities,
  password,
  profile
}) {
  const checkedProfile = assertPrivatePilotProfile(profile);
  const ownerPool = createPostgresPool({
    connectionString: ownerConnectionString,
    max: 4,
    applicationName: "ipo-one-private-pilot-owner"
  });
  try {
    await migrateUp({ pool: ownerPool });
    const now = new Date();
    await seedTenant(ownerPool, checkedProfile, now);
    for (const identity of Object.values(identities)) {
      await seedIdentity(ownerPool, identity, checkedProfile, now);
    }
    await seedRiskResources(ownerPool, identities.risk, checkedProfile, now);
    await provisionApplicationRole(ownerPool, password);
  } finally {
    await ownerPool.end();
  }

  const applicationUrl = new URL(ownerConnectionString);
  applicationUrl.username = APP_ROLE;
  applicationUrl.password = password;
  const applicationPool = createPostgresPool({
    connectionString: applicationUrl.toString(),
    max: 16,
    applicationName: "ipo-one-private-pilot"
  });
  try {
    await assertTenantDatabaseRole(applicationPool);
  } catch (error) {
    await applicationPool.end();
    throw error;
  }
  return applicationPool;
}
