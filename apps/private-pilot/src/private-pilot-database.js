import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCapitalPartnerProfile,
  createOperationalId,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  assertTenantDatabaseRole,
  createPostgresPool,
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod,
  assertPostgresAuthenticationRole,
  createReferenceHasher
} from "../../../modules/authentication/src/index.js";
import {
  AUTHORIZATION_POLICY_VERSION,
  ROLE_BUNDLE_CAPABILITIES,
  RoleBundle
} from "../../../modules/authorization/src/index.js";
import { migrateUp } from "../../../scripts/migrate.mjs";
import { assertPrivatePilotProfile } from "./private-pilot-profile.js";
import {
  bootstrapLocalCreditRegistryObservation
} from "./credit-registry-observation-bootstrap.js";

const APP_ROLE = "ipo_one_private_pilot_app";
const AUTHENTICATION_ROLE = "ipo_one_private_pilot_auth";
const LOCAL_AUTHENTICATION_SYSTEM_ACTOR_ID =
  "actor_local_authentication_system";
const LOCAL_AUTHENTICATION_SYSTEM_CLIENT_ID =
  "client_local_authentication_system";
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
       agent_account_challenges, agent_account_proof_attempts,
       execution_account_binding_challenges, execution_account_binding_proof_attempts,
       account_bindings,
       consent_records, human_identity_references, credit_intents,
       risk_decisions, credit_offers, credit_offer_acceptances,
       workspace_continuation_receipts,
       obligations, obligation_installments, sandbox_execution_receipts,
       sandbox_servicing_actions, provider_intent_deliveries,
       provider_intent_acknowledgements, provider_callback_inbox,
       credit_lines, lockboxes, ledger_accounts, ledger_transactions, ledger_entries,
       execution_target_policies, delegated_wallet_grants,
       delegated_wallet_grant_target_policies, delegated_wallet_grant_transitions,
       delegated_wallet_pending_exposures, wallet_prepared_executions,
       wallet_simulation_reports, wallet_transaction_preflight_receipts,
       repayment_events, aggregate_stream_heads, domain_events, credit_events,
       pilot_feedback_records, credit_passport_artifacts, credit_outcomes,
       tenant_command_pauses,
       official_report_artifacts,
       evidence_envelopes, outbox_messages,
       evidence_chain_anchors, evidence_chain_anchor_observations,
       command_idempotency,
       command_events, projection_registry, projection_snapshots,
       reconciliation_runs, reconciliation_discrepancies
     TO ${APP_ROLE}`
  );
}

async function provisionAuthenticationRole(ownerPool, password) {
  const quotedPassword = (
    await ownerPool.query("SELECT quote_literal($1) AS value", [password])
  ).rows[0].value;
  const quotedRole = `"${AUTHENTICATION_ROLE}"`;
  const role = await ownerPool.query(
    `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit,
            rolreplication, rolbypassrls
       FROM pg_roles
      WHERE rolname = $1`,
    [AUTHENTICATION_ROLE]
  );
  if (role.rowCount === 0) {
    await ownerPool.query(
      `CREATE ROLE ${quotedRole} LOGIN PASSWORD ${quotedPassword}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
    await ownerPool.query(
      `ALTER ROLE ${quotedRole} SET search_path TO public`
    );
  } else {
    const current = role.rows[0];
    if (
      !current.rolcanlogin ||
      current.rolsuper ||
      current.rolcreatedb ||
      current.rolcreaterole ||
      current.rolinherit ||
      current.rolreplication ||
      current.rolbypassrls
    ) {
      throw new Error("local authentication database role is unsafe");
    }
    await ownerPool.query(
      `ALTER ROLE ${quotedRole} WITH LOGIN PASSWORD ${quotedPassword}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    );
    await ownerPool.query(
      `ALTER ROLE ${quotedRole} SET search_path TO public`
    );
  }
  const database = (
    await ownerPool.query(
      "SELECT quote_ident(current_database()) AS value"
    )
  ).rows[0].value;
  await ownerPool.query(`REVOKE CREATE ON DATABASE ${database} FROM ${quotedRole}`);
  await ownerPool.query(`REVOKE CREATE ON SCHEMA public FROM ${quotedRole}`);
  await ownerPool.query(
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${quotedRole}`
  );
  await ownerPool.query(
    `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${quotedRole}`
  );
  await ownerPool.query(`GRANT CONNECT ON DATABASE ${database} TO ${quotedRole}`);
  await ownerPool.query(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`);
  await ownerPool.query(
    `GRANT SELECT ON
       tenants, actors, memberships, authentication_credentials,
       authentication_oidc_transactions, authentication_wallet_transactions,
       authentication_sessions, authentication_session_invalidations,
       authentication_replay_entries, authentication_events
     TO ${quotedRole}`
  );
  await ownerPool.query(
    `GRANT INSERT, UPDATE ON authentication_credentials TO ${quotedRole}`
  );
  await ownerPool.query(
    `GRANT INSERT, DELETE ON
       authentication_oidc_transactions, authentication_wallet_transactions
     TO ${quotedRole}`
  );
  await ownerPool.query(
    `GRANT INSERT, UPDATE ON authentication_sessions TO ${quotedRole}`
  );
  await ownerPool.query(
    `GRANT INSERT ON authentication_session_invalidations TO ${quotedRole}`
  );
  await ownerPool.query(
    `GRANT INSERT, DELETE ON authentication_replay_entries TO ${quotedRole}`
  );
  await ownerPool.query(
    `GRANT INSERT ON authentication_events TO ${quotedRole}`
  );
  await ownerPool.query(
    `GRANT UPDATE (id) ON actors, memberships TO ${quotedRole}`
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
  // Restart-safe Evidence hashes the membership version, so an identical seed
  // must be a true no-op. Mutable authority drift versions the row; immutable
  // controller or status drift still reaches the database trigger and fails closed.
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
       version = memberships.version + 1
     WHERE memberships.capabilities IS DISTINCT FROM EXCLUDED.capabilities
        OR memberships.client_ids IS DISTINCT FROM EXCLUDED.client_ids
        OR memberships.policy_version IS DISTINCT FROM EXCLUDED.policy_version
        OR memberships.controller_actor_id IS DISTINCT FROM EXCLUDED.controller_actor_id
        OR memberships.status IS DISTINCT FROM EXCLUDED.status`,
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

async function seedAuthenticationSystemIdentity(ownerPool, profile, now) {
  await seedIdentity(ownerPool, {
    actorId: LOCAL_AUTHENTICATION_SYSTEM_ACTOR_ID,
    actorType: ActorType.SYSTEM_WORKER,
    roleBundle: RoleBundle.SYSTEM_WORKER,
    capabilities: ROLE_BUNDLE_CAPABILITIES[RoleBundle.SYSTEM_WORKER],
    clientId: LOCAL_AUTHENTICATION_SYSTEM_CLIENT_ID,
    membershipId:
      `membership_${LOCAL_AUTHENTICATION_SYSTEM_ACTOR_ID}`
  }, profile, now);
}

async function seedAuthenticationCredential(client, {
  tenantId,
  actor,
  issuer,
  externalSubject,
  clientAuthenticationMethod,
  senderConstraintMethod,
  senderThumbprint,
  referenceHasher,
  expiresAt,
  invitationLabel,
  now
}) {
  const subjectRefHash = referenceHasher.hash(
    "subject",
    `${issuer}\0${externalSubject}`
  );
  const senderConstraintRefHash = referenceHasher.hash(
    "sender.constraint",
    senderThumbprint
  );
  const retired = await client.query(
    `UPDATE authentication_credentials
        SET status = 'revoked', updated_at = $1
      WHERE tenant_id = $2
        AND issuer = $3
        AND actor_id = $4
        AND client_id <> $5
        AND status = 'active'
      RETURNING id`,
    [now, tenantId, issuer, actor.actorId, actor.clientId]
  );
  for (const row of retired.rows) {
    await client.query(
      `INSERT INTO authentication_events(
         id, tenant_id, event_type, actor_id, credential_id, reason_code,
         occurred_at, payload, schema_version
       ) VALUES (
         $1, $2, 'credential_revoked', $3, $4,
         'local_pilot_capability_generation_rotated', $5, $6::jsonb,
         'authentication_event.v1'
       )`,
      [
        createOperationalId("auth_event"),
        tenantId,
        LOCAL_AUTHENTICATION_SYSTEM_ACTOR_ID,
        row.id,
        now,
        JSON.stringify({ status: "revoked" })
      ]
    );
  }
  const existing = await client.query(
    `SELECT *
       FROM authentication_credentials
      WHERE tenant_id = $1
        AND issuer = $2
        AND client_id = $3
        AND subject_ref_hash = $4`,
    [tenantId, issuer, actor.clientId, subjectRefHash]
  );
  if (existing.rowCount === 1) {
    const stored = existing.rows[0];
    if (
      stored.actor_id !== actor.actorId ||
      stored.actor_type !== actor.actorType ||
      stored.client_authentication_method !== clientAuthenticationMethod ||
      stored.sender_constraint_method !== senderConstraintMethod ||
      stored.sender_constraint_ref_hash !== senderConstraintRefHash ||
      stored.policy_version !== AUTHORIZATION_POLICY_VERSION ||
      JSON.stringify(stored.roles) !== JSON.stringify([actor.roleBundle]) ||
      JSON.stringify(stored.allowed_capabilities) !==
        JSON.stringify(actor.capabilities) ||
      new Date(stored.expires_at).toISOString() !== expiresAt
    ) {
      throw new Error(
        `existing local authentication Credential does not match ${actor.actorId}`
      );
    }
    return stored;
  }
  const credentialId = createOperationalId("credential");
  const inserted = await client.query(
    `INSERT INTO authentication_credentials(
       id, tenant_id, actor_id, actor_type, issuer, subject_ref_hash,
       client_id, client_authentication_method, sender_constraint_method,
       sender_constraint_ref_hash, roles, allowed_capabilities,
       policy_version, status, version, expires_at, created_at, updated_at,
       schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9,
       $10, $11::jsonb, $12::jsonb,
       $13, 'active', 1, $14, $15, $15,
       'authentication_credential.v1'
     ) RETURNING *`,
    [
      credentialId,
      tenantId,
      actor.actorId,
      actor.actorType,
      issuer,
      subjectRefHash,
      actor.clientId,
      clientAuthenticationMethod,
      senderConstraintMethod,
      senderConstraintRefHash,
      JSON.stringify([actor.roleBundle]),
      JSON.stringify(actor.capabilities),
      AUTHORIZATION_POLICY_VERSION,
      expiresAt,
      now
    ]
  );
  await client.query(
    `INSERT INTO authentication_events(
       id, tenant_id, event_type, actor_id, credential_id, reason_code,
       occurred_at, payload, schema_version
     ) VALUES (
       $1, $2, 'credential_registered', $3, $4,
       'local_pilot_invitation_provisioned', $5, $6::jsonb,
       'authentication_event.v1'
     )`,
    [
      createOperationalId("auth_event"),
      tenantId,
      LOCAL_AUTHENTICATION_SYSTEM_ACTOR_ID,
      credentialId,
      now,
      JSON.stringify({
        actorType: actor.actorType,
        clientAuthenticationMethod,
        invitationRefHash: referenceHasher.hash(
          "pilot.invitation",
          `${tenantId}\0${invitationLabel}`
        ),
        senderConstraintMethod,
        version: 1
      })
    ]
  );
  return inserted.rows[0];
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

async function seedCapitalPartnerProfile(ownerPool, identity, profile, now) {
  const context = createTenantSecurityContext({
    tenantId: profile.tenantId,
    actorId: identity.actorId,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  const capitalPartnerId = `capital_partner_${hashId(
    "capital_partner_identity",
    `${profile.tenantId}:${identity.actorId}`
  ).slice(2)}`;
  const capitalPartner = createCapitalPartnerProfile({
    capitalPartnerId,
    organizationRef: "urn:ipo.one:synthetic-capital-partner:alpha",
    displayName: "IPO.ONE Pilot Capital Partner",
    operatorActorId: identity.actorId,
    tenantId: profile.tenantId,
    now
  });
  await withTenantTransaction(ownerPool, context, async (client) => {
    await client.query(
      `INSERT INTO capital_partner_profiles(
         id, profile_hash, organization_ref, display_name, operator_actor_id,
         status, invitation_only, same_tenant_only, sandbox_only,
         production_funds_authority, created_at, updated_at, schema_version
       ) VALUES (
         $1,$2,$3,$4,$5,'active',TRUE,TRUE,TRUE,FALSE,$6,$6,
         'capital_partner_profile.v1'
       ) ON CONFLICT (id) DO NOTHING`,
      [
        capitalPartner.capitalPartnerId,
        capitalPartner.profileHash,
        capitalPartner.organizationRef,
        capitalPartner.displayName,
        capitalPartner.operatorActorId,
        now
      ]
    );
    await client.query(
      `INSERT INTO authorization_resources(
         tenant_id, resource_type, resource_id, status, version,
         created_at, updated_at, schema_version
       ) VALUES (
         $1,'capital_partner_profile',$2,'active',1,$3,$3,
         'authorization_resource.v1'
       ) ON CONFLICT (tenant_id, resource_type, resource_id) DO NOTHING`,
      [profile.tenantId, capitalPartner.capitalPartnerId, now]
    );
    await client.query(
      `INSERT INTO authorization_resource_bindings(
         tenant_id, resource_type, resource_id, actor_id, relationship,
         status, version, created_at, updated_at, schema_version
       ) VALUES (
         $1,'capital_partner_profile',$2,$3,'owner','active',1,$4,$4,
         'authorization_resource_binding.v1'
       ) ON CONFLICT (tenant_id, resource_type, resource_id, actor_id) DO NOTHING`,
      [profile.tenantId, capitalPartner.capitalPartnerId, identity.actorId, now]
    );
  });
}

export async function provisionPrivatePilotDatabase({
  ownerConnectionString,
  identities,
  password,
  profile,
  creditRegistryObservationArtifactPath
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
    await seedCapitalPartnerProfile(
      ownerPool,
      identities.capitalPartner,
      checkedProfile,
      now
    );
    await seedRiskResources(ownerPool, identities.risk, checkedProfile, now);
    if (creditRegistryObservationArtifactPath) {
      const riskContext = createTenantSecurityContext({
        tenantId: checkedProfile.tenantId,
        actorId: identities.risk.actorId,
        policyVersion: "security_001.v1",
        source: "local_test"
      });
      await bootstrapLocalCreditRegistryObservation({
        artifactPath: creditRegistryObservationArtifactPath,
        pool: ownerPool,
        tenantContext: riskContext
      });
    }
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

export async function provisionPrivatePilotAuthentication({
  ownerConnectionString,
  identities,
  profile,
  basePort,
  serverMaterial,
  invitation
}) {
  const checkedProfile = assertPrivatePilotProfile(profile);
  if (
    !Number.isSafeInteger(basePort) ||
    basePort < 1_024 ||
    basePort > 65_533 ||
    !serverMaterial?.authenticationRolePassword ||
    !serverMaterial?.referenceHashKey ||
    !serverMaterial?.encryptionKey ||
    !invitation?.walletAddress ||
    !invitation?.credentialExpiresAt ||
    !invitation?.agentThumbprint
  ) {
    throw new Error("local durable authentication configuration is invalid");
  }
  const referenceHashKey = Buffer.from(
    serverMaterial.referenceHashKey,
    "base64url"
  );
  const encryptionKey = Buffer.from(
    serverMaterial.encryptionKey,
    "base64url"
  );
  const referenceHasher = createReferenceHasher(referenceHashKey);
  const ownerPool = createPostgresPool({
    connectionString: ownerConnectionString,
    max: 4,
    applicationName: "ipo-one-private-pilot-authentication-owner"
  });
  try {
    await migrateUp({ pool: ownerPool });
    const now = new Date();
    await seedTenant(ownerPool, checkedProfile, now);
    for (const identity of Object.values(identities)) {
      await seedIdentity(ownerPool, identity, checkedProfile, now);
    }
    await seedAuthenticationSystemIdentity(ownerPool, checkedProfile, now);
    const context = createTenantSecurityContext({
      tenantId: checkedProfile.tenantId,
      actorId: LOCAL_AUTHENTICATION_SYSTEM_ACTOR_ID,
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      source: "system_worker"
    });
    await withTenantTransaction(ownerPool, context, async (client) => {
      for (const [index, name] of [
        "borrower",
        "controller",
        "risk",
        "capitalPartner"
      ].entries()) {
        const actor = identities[name];
        const issuer = `https://127.0.0.1:${basePort + index}`;
        await seedAuthenticationCredential(client, {
          tenantId: checkedProfile.tenantId,
          actor,
          issuer,
          externalSubject:
            `eip155:84532:${invitation.walletAddress.toLowerCase()}`,
          clientAuthenticationMethod: ClientAuthenticationMethod.SIWE,
          senderConstraintMethod: SenderConstraintMethod.HOST_SESSION,
          senderThumbprint: referenceHasher.hash(
            "local.host-session",
            `${actor.actorId}\0${issuer}`
          ),
          referenceHasher,
          expiresAt: invitation.credentialExpiresAt,
          invitationLabel: `local-${name}-wallet-v1`,
          now
        });
      }
      await seedAuthenticationCredential(client, {
        tenantId: checkedProfile.tenantId,
        actor: identities.agent,
        issuer: "https://workload.local.ipo.one",
        externalSubject: "urn:ipo.one:local-agent:pilot-alpha",
        clientAuthenticationMethod:
          ClientAuthenticationMethod.PRIVATE_KEY_JWT,
        senderConstraintMethod: SenderConstraintMethod.DPOP,
        senderThumbprint: invitation.agentThumbprint,
        referenceHasher,
        expiresAt: invitation.credentialExpiresAt,
        invitationLabel: "local-agent-runtime-v1",
        now
      });
    });
    await provisionAuthenticationRole(
      ownerPool,
      serverMaterial.authenticationRolePassword
    );
  } finally {
    await ownerPool.end();
  }

  const authenticationUrl = new URL(ownerConnectionString);
  authenticationUrl.username = AUTHENTICATION_ROLE;
  authenticationUrl.password = serverMaterial.authenticationRolePassword;
  const pool = createPostgresPool({
    connectionString: authenticationUrl.toString(),
    max: 12,
    applicationName: "ipo-one-private-pilot-authentication"
  });
  try {
    await assertPostgresAuthenticationRole(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }
  return Object.freeze({
    pool,
    referenceHashKey,
    encryptionKey,
    systemActorId: LOCAL_AUTHENTICATION_SYSTEM_ACTOR_ID,
    authenticationRole: AUTHENTICATION_ROLE
  });
}
