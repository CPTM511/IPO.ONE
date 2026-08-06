import { readFile } from "node:fs/promises";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod,
  assertPostgresAuthenticationRole,
  createReferenceHasher
} from "../../../modules/authentication/src/index.js";
import {
  PilotCapability,
  RoleBundle,
  ROLE_BUNDLE_CAPABILITIES
} from "../../../modules/authorization/src/index.js";
import {
  assertTenantDatabaseRole,
  createPostgresPool,
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";
import {
  createCapitalPartnerProfile,
  createOperationalId,
  hashId
} from "../../../packages/domain/src/index.js";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import { migrateUp } from "../../../scripts/migrate.mjs";

const ROLE_NAME = /^[a-z][a-z0-9_]{2,62}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const INVITATION_ID = /^invite_[A-Za-z0-9][A-Za-z0-9._:-]{7,120}$/;
const MAXIMUM_CREDENTIAL_LIFETIME_MS = 90 * 24 * 60 * 60 * 1_000;
const trustedBootstrapConfigs = new WeakSet();

const PROFILES = Object.freeze({
  human_borrower: Object.freeze({
    actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.HUMAN_BORROWER,
    capabilities: Object.freeze([
      PilotCapability.HUMAN_SUBJECT_CREATE_SELF,
      PilotCapability.SUBJECT_READ_SELF,
      PilotCapability.WORKSPACE_RESUME_SELF,
      PilotCapability.CONSENT_CREATE_SELF,
      PilotCapability.CONSENT_READ_SELF,
      PilotCapability.CONSENT_REVOKE_SELF,
      PilotCapability.IDENTITY_REFERENCE_READ_SELF,
      PilotCapability.CREDIT_REQUEST,
      PilotCapability.CREDIT_READ_SELF,
      PilotCapability.CREDIT_EVALUATE_SELF,
      PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
      PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
      PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
      PilotCapability.OBLIGATION_READ_OWNED,
      PilotCapability.EVIDENCE_READ_OWNED,
      PilotCapability.CREDIT_REGISTRY_EVIDENCE_READ_TENANT,
      PilotCapability.CREDIT_PASSPORT_CREATE_SELF,
      PilotCapability.CREDIT_PASSPORT_READ_SELF,
      PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
      PilotCapability.CREDIT_PASSPORT_REVOKE_SELF,
      PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
      PilotCapability.OFFICIAL_REPORT_READ_OWNED,
      PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
      PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED,
      PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF
    ])
  }),
  principal_controller: Object.freeze({
    actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.PRINCIPAL_CONTROLLER,
    capabilities: Object.freeze([
      PilotCapability.AGENT_CREATE,
      PilotCapability.AGENT_MANAGE_OWNED,
      PilotCapability.WORKSPACE_RESUME_SELF,
      PilotCapability.AGENT_ACCOUNT_CHALLENGE_CREATE_OWNED,
      PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
      PilotCapability.INTEGRATION_READ_OWNED,
      PilotCapability.MANDATE_DRAFT_CREATE,
      PilotCapability.MANDATE_DRAFT_REVOKE,
      PilotCapability.MANDATE_ACTIVATE_OWNED,
      PilotCapability.OBLIGATION_READ_OWNED,
      PilotCapability.EVIDENCE_READ_OWNED,
      PilotCapability.CREDIT_REGISTRY_EVIDENCE_READ_TENANT,
      PilotCapability.CREDIT_PASSPORT_CREATE_SELF,
      PilotCapability.CREDIT_PASSPORT_READ_SELF,
      PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
      PilotCapability.CREDIT_PASSPORT_REVOKE_SELF,
      PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
      PilotCapability.OFFICIAL_REPORT_READ_OWNED,
      PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
      PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED
    ])
  }),
  capital_partner_operator: Object.freeze({
    actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.CAPITAL_PARTNER_OPERATOR,
    capabilities: Object.freeze([
      PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
      PilotCapability.CAPITAL_PARTNER_OFFER_CREATE_OWN,
      PilotCapability.CAPITAL_PARTNER_OFFER_MANAGE_OWN,
      PilotCapability.CAPITAL_PARTNER_PORTFOLIO_READ_OWN,
      PilotCapability.CAPITAL_PARTNER_FACILITY_READ_OWN
    ])
  }),
  agent_runtime: Object.freeze({
    actorType: ActorType.AGENT,
    roleBundle: RoleBundle.AGENT_RUNTIME,
    capabilities: Object.freeze([
      PilotCapability.SUBJECT_READ_SELF,
      PilotCapability.WORKSPACE_RESUME_SELF,
      PilotCapability.AGENT_ACCOUNT_PROOF_SUBMIT_SELF,
      PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
      PilotCapability.CREDIT_REQUEST,
      PilotCapability.CREDIT_READ_SELF,
      PilotCapability.CREDIT_EVALUATE_SELF,
      PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
      PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
      PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
      PilotCapability.OBLIGATION_READ_OWNED,
      PilotCapability.EVIDENCE_READ_OWNED,
      PilotCapability.CREDIT_REGISTRY_EVIDENCE_READ_TENANT,
      PilotCapability.CREDIT_PASSPORT_READ_SELF,
      PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
      PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
      PilotCapability.OFFICIAL_REPORT_READ_OWNED,
      PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
      PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED,
      PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF
    ])
  }),
  risk_operator: Object.freeze({
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: Object.freeze([
      PilotCapability.RISK_READ_TENANT,
      PilotCapability.PILOT_HEALTH_READ,
      PilotCapability.PILOT_FEEDBACK_READ_TENANT,
      PilotCapability.SERVICING_QUEUE_READ,
      PilotCapability.RISK_FREEZE,
      PilotCapability.CREDIT_REGISTRY_EVIDENCE_READ_TENANT
    ])
  })
});

export const PRODUCTION_BOOTSTRAP_PROFILES = PROFILES;

const GATEWAY_MUTATION_TABLES = Object.freeze([
  "abuse_rate_buckets", "abuse_capacity_buckets", "abuse_admissions",
  "abuse_command_charges", "principals", "subjects", "mandates",
  "agent_account_challenges", "agent_account_proof_attempts", "account_bindings",
  "consent_records", "human_identity_references", "credit_intents",
  "risk_decisions", "credit_offers", "credit_offer_acceptances",
  "workspace_continuation_receipts",
  "obligations", "obligation_installments", "sandbox_execution_receipts",
  "sandbox_servicing_actions", "provider_intent_deliveries",
  "provider_intent_acknowledgements", "provider_callback_inbox",
  "credit_lines", "lockboxes", "ledger_accounts", "ledger_transactions", "ledger_entries",
  "repayment_events", "aggregate_stream_heads", "domain_events", "credit_events",
  "pilot_feedback_records", "credit_passport_artifacts", "credit_outcomes",
  "tenant_command_pauses",
  "official_report_artifacts", "evidence_envelopes", "outbox_messages",
  "evidence_chain_anchors", "evidence_chain_anchor_observations",
  "command_idempotency", "command_events", "projection_registry",
  "projection_snapshots", "reconciliation_runs", "reconciliation_discrepancies"
]);

function fail(message) {
  const error = new Error(message);
  error.code = "invalid_production_bootstrap";
  return error;
}

function id(name, value, pattern = SAFE_ID) {
  if (typeof value !== "string" || !pattern.test(value)) throw fail(`${name} is invalid`);
  return value;
}

function text(name, value, maximum = 512) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/.test(value)) {
    throw fail(`${name} is invalid`);
  }
  return value;
}

function exactObject(name, value, required, optional = []) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) throw fail(`${name} is invalid`);
  return value;
}

function httpsOrigin(name, value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw fail(`${name} is invalid`); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw fail(`${name} is invalid`);
  }
  return parsed.origin;
}

function canonicalTimestamp(name, value) {
  if (typeof value !== "string") throw fail(`${name} is invalid`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw fail(`${name} is invalid`);
  }
  return value;
}

function normalizeConfig(value) {
  if (value && typeof value === "object" && trustedBootstrapConfigs.has(value)) return value;
  exactObject("bootstrap config", value, [
    "schemaVersion", "gatewayRole", "authenticationRole", "tenant",
    "systemActor", "policyVersion", "credentials"
  ]);
  if (value.schemaVersion !== "ipo_one_production_bootstrap.v2") throw fail("bootstrap schemaVersion is invalid");
  const tenant = exactObject("Tenant", value.tenant, [
    "tenantId", "organizationRef", "displayName", "pilotJurisdiction", "retentionOwnerRef"
  ]);
  const systemActor = exactObject("system Actor", value.systemActor, ["actorId", "clientId"]);
  if (!Array.isArray(value.credentials) || value.credentials.length < 1 || value.credentials.length > 32) {
    throw fail("bootstrap credentials are invalid");
  }
  const credentials = value.credentials.map((entry) => {
    exactObject("credential", entry, [
      "kind", "profile", "actorId", "clientId", "issuer", "externalSubject",
      "invitationId", "expiresAt"
    ], ["controllerActorId", "senderThumbprint"]);
    if (!new Set(["human_wallet", "agent_mtls", "agent_dpop"]).has(entry.kind)) {
      throw fail("credential kind is invalid");
    }
    const agentCredential = new Set(["agent_mtls", "agent_dpop"]).has(entry.kind);
    const profile = PROFILES[entry.profile];
    if (!profile || agentCredential !== (profile.actorType === ActorType.AGENT)) {
      throw fail("credential profile is invalid");
    }
    if (agentCredential) {
      id("controllerActorId", entry.controllerActorId);
      if (typeof entry.senderThumbprint !== "string" || !BASE64URL.test(entry.senderThumbprint) || entry.senderThumbprint.length !== 43) {
        throw fail("Agent sender thumbprint is invalid");
      }
    } else if (entry.controllerActorId !== undefined || entry.senderThumbprint !== undefined) {
      throw fail("Human wallet credential contains Agent-only fields");
    }
    const externalSubject = text("externalSubject", entry.externalSubject);
    if (entry.kind === "human_wallet" && !/^eip155:(?:84532|1952):0x[0-9a-f]{40}$/.test(externalSubject)) {
      throw fail("Human wallet externalSubject must be a canonical approved-chain CAIP-10 account");
    }
    return Object.freeze({
      kind: entry.kind,
      profileName: entry.profile,
      profile,
      actorId: id("actorId", entry.actorId),
      clientId: id("clientId", entry.clientId),
      issuer: httpsOrigin("credential issuer", entry.issuer),
      externalSubject,
      invitationId: id("invitationId", entry.invitationId, INVITATION_ID),
      expiresAt: canonicalTimestamp("credential expiresAt", entry.expiresAt),
      controllerActorId: entry.controllerActorId,
      senderThumbprint: entry.senderThumbprint
    });
  });
  const actorIds = new Set(credentials.map(({ actorId }) => actorId));
  if (actorIds.size !== credentials.length) throw fail("one bootstrap Credential per Actor is required");
  const invitationIds = new Set(credentials.map(({ invitationId }) => invitationId));
  if (invitationIds.size !== credentials.length) throw fail("one unique invitation per Credential is required");
  const subjectBindings = new Set(
    credentials.map(({ issuer, clientId, externalSubject }) =>
      `${issuer}\0${clientId}\0${externalSubject}`)
  );
  if (subjectBindings.size !== credentials.length) {
    throw fail("one unique external subject binding per Credential is required");
  }
  const agentThumbprints = credentials
    .filter(({ kind }) => kind === "agent_mtls" || kind === "agent_dpop")
    .map(({ senderThumbprint }) => senderThumbprint);
  if (new Set(agentThumbprints).size !== agentThumbprints.length) {
    throw fail("one unique sender constraint per Agent is required");
  }
  for (const credential of credentials) {
    if (credential.controllerActorId) {
      const controller = credentials.find(({ actorId }) => actorId === credential.controllerActorId);
      if (!controller || controller.profileName !== "principal_controller") {
        throw fail("Agent controllerActorId must reference a bootstrapped Principal Controller");
      }
    }
  }
  const normalized = Object.freeze({
    gatewayRole: id("gatewayRole", value.gatewayRole, ROLE_NAME),
    authenticationRole: id("authenticationRole", value.authenticationRole, ROLE_NAME),
    tenant: Object.freeze({
      tenantId: id("tenantId", tenant.tenantId),
      organizationRef: text("organizationRef", tenant.organizationRef),
      displayName: text("displayName", tenant.displayName, 160),
      pilotJurisdiction: text("pilotJurisdiction", tenant.pilotJurisdiction, 64),
      retentionOwnerRef: text("retentionOwnerRef", tenant.retentionOwnerRef)
    }),
    systemActor: Object.freeze({
      actorId: id("systemActorId", systemActor.actorId),
      clientId: id("systemActorClientId", systemActor.clientId)
    }),
    policyVersion: id("policyVersion", value.policyVersion),
    credentials: Object.freeze(credentials)
  });
  trustedBootstrapConfigs.add(normalized);
  return normalized;
}

function assertProvisioningWindow(config, now) {
  for (const credential of config.credentials) {
    const expiresAt = new Date(credential.expiresAt);
    const lifetime = expiresAt.getTime() - now.getTime();
    if (lifetime <= 0 || lifetime > MAXIMUM_CREDENTIAL_LIFETIME_MS) {
      throw fail("credential provisioning window is invalid");
    }
  }
}

export function assertProductionBootstrapConfig(value) {
  return normalizeConfig(value);
}

export async function loadProductionBootstrapConfig(path) {
  const bytes = await readFile(path);
  if (bytes.length < 1 || bytes.length > 64 * 1024 || bytes.includes(0)) throw fail("bootstrap config file is invalid");
  return assertProductionBootstrapConfig(parseStrictJson(bytes.toString("utf8"), {
    maximumBytes: 64 * 1024,
    maximumDepth: 8,
    maximumKeys: 512
  }));
}

async function quoteLiteral(pool, value) {
  return (await pool.query("SELECT quote_literal($1) AS value", [value])).rows[0].value;
}

async function configureRole(client, { roleName, password, authenticationOnly }) {
  const role = `"${roleName}"`;
  const passwordLiteral = await quoteLiteral(client, password);
  const exists = await client.query(
    `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls, rolconfig
       FROM pg_roles WHERE rolname = $1`,
    [roleName]
  );
  if (exists.rowCount === 0) {
    await client.query(`CREATE ROLE ${role} LOGIN PASSWORD ${passwordLiteral} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await client.query(`ALTER ROLE ${role} SET search_path TO public`);
  } else {
    const configured = exists.rows[0];
    const settings = configured.rolconfig ?? [];
    if (!configured.rolcanlogin || configured.rolsuper || configured.rolcreatedb || configured.rolcreaterole || configured.rolinherit || configured.rolreplication || configured.rolbypassrls || !settings.includes("search_path=public")) {
      throw fail(`${roleName} does not match the required closed runtime role`);
    }
    const membership = await client.query(
      "SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = $1",
      [roleName]
    );
    if (membership.rowCount > 0) throw fail(`${roleName} cannot inherit another database role`);
  }
  const database = (await client.query("SELECT quote_ident(current_database()) AS value")).rows[0].value;
  await client.query(`REVOKE CREATE ON DATABASE ${database} FROM PUBLIC`);
  await client.query(`REVOKE CREATE ON DATABASE ${database} FROM ${role}`);
  await client.query(`REVOKE CREATE ON SCHEMA public FROM ${role}`);
  await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`);
  await client.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`);
  await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  if (authenticationOnly) {
    await client.query(`GRANT SELECT ON tenants, actors, memberships, authentication_credentials, authentication_oidc_transactions, authentication_wallet_transactions, authentication_sessions, authentication_session_invalidations, authentication_replay_entries, authentication_events TO ${role}`);
    await client.query(`GRANT INSERT, UPDATE ON authentication_credentials TO ${role}`);
    await client.query(`GRANT INSERT, DELETE ON authentication_oidc_transactions, authentication_wallet_transactions TO ${role}`);
    await client.query(`GRANT INSERT, UPDATE ON authentication_sessions TO ${role}`);
    await client.query(`GRANT INSERT ON authentication_session_invalidations TO ${role}`);
    await client.query(`GRANT INSERT, DELETE ON authentication_replay_entries TO ${role}`);
    await client.query(`GRANT INSERT ON authentication_events TO ${role}`);
    await client.query(`GRANT UPDATE (id) ON actors, memberships TO ${role}`);
    return;
  }
  await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await client.query(`GRANT UPDATE (id) ON actors, memberships, access_grants TO ${role}`);
  await client.query(`GRANT UPDATE (status) ON obligations, credit_lines TO ${role}`);
  await client.query(`GRANT INSERT ON authorization_resources, authorization_resource_bindings, authorization_audit_events, tenant_command_executions TO ${role}`);
  await client.query(`GRANT UPDATE (resource_id) ON authorization_resources, authorization_resource_bindings TO ${role}`);
  await client.query(`GRANT UPDATE (status, version, updated_at) ON authorization_resources TO ${role}`);
  await client.query(`GRANT INSERT, UPDATE, DELETE ON ${GATEWAY_MUTATION_TABLES.join(", ")} TO ${role}`);
}

async function seedTenantAndIdentity(client, config, referenceHasher) {
  const now = new Date();
  await client.query(
    `INSERT INTO tenants(id, tenant_hash, organization_ref, display_name, status, pilot_jurisdiction, legal_retention_owner_ref, created_at, updated_at, schema_version)
     VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$7,'tenant.v1') ON CONFLICT (id) DO NOTHING`,
    [config.tenant.tenantId, hashId("production_tenant", config.tenant.tenantId), config.tenant.organizationRef,
      config.tenant.displayName, config.tenant.pilotJurisdiction, config.tenant.retentionOwnerRef, now]
  );
  const tenant = await client.query("SELECT * FROM tenants WHERE id = $1", [config.tenant.tenantId]);
  const row = tenant.rows[0];
  if (!row || row.status !== "active" || row.organization_ref !== config.tenant.organizationRef || row.display_name !== config.tenant.displayName || row.pilot_jurisdiction !== config.tenant.pilotJurisdiction || row.legal_retention_owner_ref !== config.tenant.retentionOwnerRef) {
    throw fail("existing Tenant does not match the controlled bootstrap config");
  }

  const identities = [{
    actorId: config.systemActor.actorId,
    actorType: ActorType.SYSTEM_WORKER,
    roleBundle: RoleBundle.SYSTEM_WORKER,
    capabilities: ROLE_BUNDLE_CAPABILITIES[RoleBundle.SYSTEM_WORKER],
    clientId: config.systemActor.clientId
  }, ...config.credentials.map((credential) => ({
    actorId: credential.actorId,
    actorType: credential.profile.actorType,
    roleBundle: credential.profile.roleBundle,
    capabilities: credential.profile.capabilities,
    clientId: credential.clientId,
    controllerActorId: credential.controllerActorId
  }))];
  for (const identity of identities) {
    await client.query(
      `INSERT INTO actors(id, actor_hash, actor_type, status, created_at, updated_at, schema_version)
       VALUES ($1,$2,$3,'active',$4,$4,'actor.v1') ON CONFLICT (id) DO NOTHING`,
      [identity.actorId, hashId("production_actor", identity.actorId), identity.actorType, now]
    );
    await client.query(
      `INSERT INTO memberships(id, membership_hash, tenant_id, actor_id, role_bundle, capabilities, client_ids, policy_version, controller_actor_id, status, valid_from, expires_at, created_at, updated_at, version, schema_version)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,'active',$10,NULL,$10,$10,1,'membership.v1')
       ON CONFLICT (tenant_id, actor_id, role_bundle) DO NOTHING`,
      [`membership_${identity.actorId}`, hashId("production_membership", `${config.tenant.tenantId}:${identity.actorId}`),
        config.tenant.tenantId, identity.actorId, identity.roleBundle, JSON.stringify(identity.capabilities),
        JSON.stringify([identity.clientId]), config.policyVersion, identity.controllerActorId ?? null, now]
    );
    const binding = await client.query(
      `SELECT a.actor_type, a.status AS actor_status, m.role_bundle, m.capabilities, m.client_ids, m.policy_version, m.controller_actor_id, m.status AS membership_status
         FROM actors a JOIN memberships m ON m.actor_id=a.id AND m.tenant_id=$2 WHERE a.id=$1 AND m.role_bundle=$3`,
      [identity.actorId, config.tenant.tenantId, identity.roleBundle]
    );
    const bound = binding.rows[0];
    if (!bound || bound.actor_type !== identity.actorType || bound.actor_status !== "active" || bound.membership_status !== "active" || bound.policy_version !== config.policyVersion || bound.controller_actor_id !== (identity.controllerActorId ?? null) || JSON.stringify(bound.capabilities) !== JSON.stringify(identity.capabilities) || JSON.stringify(bound.client_ids) !== JSON.stringify([identity.clientId])) {
      throw fail(`existing Actor binding does not match ${identity.actorId}`);
    }
  }

  for (const credential of config.credentials.filter(
    ({ profileName }) => profileName === "capital_partner_operator"
  )) {
    const capitalPartnerId = `capital_partner_${hashId(
      "capital_partner_identity",
      `${config.tenant.tenantId}:${credential.actorId}`
    ).slice(2)}`;
    const existingProfile = await client.query(
      "SELECT * FROM capital_partner_profiles WHERE id = $1",
      [capitalPartnerId]
    );
    if (existingProfile.rowCount === 0) {
      const profile = createCapitalPartnerProfile({
        capitalPartnerId,
        organizationRef: `${config.tenant.organizationRef}/capital-partner/${capitalPartnerId.slice(-12)}`,
        displayName: `Invited Capital Partner ${capitalPartnerId.slice(-8).toUpperCase()}`,
        operatorActorId: credential.actorId,
        tenantId: config.tenant.tenantId,
        now
      });
      await client.query(
        `INSERT INTO capital_partner_profiles(
           id, profile_hash, organization_ref, display_name, operator_actor_id,
           status, invitation_only, same_tenant_only, sandbox_only,
           production_funds_authority, created_at, updated_at, schema_version
         ) VALUES (
           $1,$2,$3,$4,$5,'active',TRUE,TRUE,TRUE,FALSE,$6,$6,
           'capital_partner_profile.v1'
         )`,
        [
          profile.capitalPartnerId,
          profile.profileHash,
          profile.organizationRef,
          profile.displayName,
          profile.operatorActorId,
          now
        ]
      );
      await client.query(
        `INSERT INTO authorization_resources(
           tenant_id, resource_type, resource_id, status, version,
           created_at, updated_at, schema_version
         ) VALUES ($1,'capital_partner_profile',$2,'active',1,$3,$3,'authorization_resource.v1')`,
        [config.tenant.tenantId, capitalPartnerId, now]
      );
      await client.query(
        `INSERT INTO authorization_resource_bindings(
           tenant_id, resource_type, resource_id, actor_id, relationship,
           status, version, created_at, updated_at, schema_version
         ) VALUES (
           $1,'capital_partner_profile',$2,$3,'owner','active',1,$4,$4,
           'authorization_resource_binding.v1'
         )`,
        [config.tenant.tenantId, capitalPartnerId, credential.actorId, now]
      );
    } else {
      const stored = existingProfile.rows[0];
      if (
        stored.tenant_id !== config.tenant.tenantId ||
        stored.operator_actor_id !== credential.actorId ||
        stored.status !== "active" ||
        stored.invitation_only !== true ||
        stored.same_tenant_only !== true ||
        stored.sandbox_only !== true ||
        stored.production_funds_authority !== false ||
        stored.schema_version !== "capital_partner_profile.v1"
      ) {
        throw fail(`existing Capital Partner profile does not match ${credential.actorId}`);
      }
    }
  }

  let insertedCredentials = 0;
  for (const credential of config.credentials) {
    const subjectRefHash = referenceHasher.hash("subject", `${credential.issuer}\0${credential.externalSubject}`);
    const invitationRefHash = referenceHasher.hash(
      "pilot.invitation",
      `${config.tenant.tenantId}\0${credential.invitationId}`
    );
    const agentCredential = credential.kind === "agent_mtls" || credential.kind === "agent_dpop";
    const senderThumbprint = agentCredential
      ? credential.senderThumbprint
      : referenceHasher.hash("bootstrap.host-session", credential.actorId);
    const senderConstraintRefHash = referenceHasher.hash("sender.constraint", senderThumbprint);
    const invitationBinding = await client.query(
      `SELECT credential_id
         FROM authentication_events
        WHERE tenant_id=$1 AND event_type='credential_registered'
          AND payload->>'invitationRefHash'=$2
        ORDER BY occurred_at, id`,
      [config.tenant.tenantId, invitationRefHash]
    );
    if (invitationBinding.rowCount > 1) {
      throw fail("invitation history is not unique");
    }
    if (agentCredential) {
      const clientAuthenticationMethod = credential.kind === "agent_mtls"
        ? ClientAuthenticationMethod.MTLS
        : ClientAuthenticationMethod.PRIVATE_KEY_JWT;
      const senderBinding = await client.query(
        `SELECT actor_id
           FROM authentication_credentials
          WHERE tenant_id=$1 AND client_authentication_method=$2
            AND sender_constraint_ref_hash=$3`,
        [config.tenant.tenantId, clientAuthenticationMethod, senderConstraintRefHash]
      );
      if (
        senderBinding.rowCount > 1 ||
        (
          senderBinding.rowCount === 1 &&
          senderBinding.rows[0].actor_id !== credential.actorId
        )
      ) {
        throw fail("Agent sender constraint is already bound");
      }
    }
    const existing = await client.query(
      "SELECT * FROM authentication_credentials WHERE tenant_id=$1 AND issuer=$2 AND client_id=$3 AND subject_ref_hash=$4",
      [config.tenant.tenantId, credential.issuer, credential.clientId, subjectRefHash]
    );
    if (existing.rowCount === 1) {
      const stored = existing.rows[0];
      const registration = await client.query(
        `SELECT payload
           FROM authentication_events
          WHERE tenant_id=$1 AND credential_id=$2
            AND event_type='credential_registered'
          ORDER BY occurred_at, id`,
        [config.tenant.tenantId, stored.id]
      );
      if (
        stored.actor_id !== credential.actorId ||
        stored.actor_type !== credential.profile.actorType ||
        stored.status !== "active" ||
        stored.policy_version !== config.policyVersion ||
        stored.sender_constraint_ref_hash !== senderConstraintRefHash ||
        stored.client_authentication_method !==
          (credential.kind === "agent_mtls"
            ? ClientAuthenticationMethod.MTLS
            : credential.kind === "agent_dpop"
              ? ClientAuthenticationMethod.PRIVATE_KEY_JWT
              : ClientAuthenticationMethod.SIWE) ||
        new Date(stored.expires_at).toISOString() !== credential.expiresAt ||
        invitationBinding.rowCount !== 1 ||
        invitationBinding.rows[0].credential_id !== stored.id ||
        registration.rowCount !== 1 ||
        registration.rows[0].payload?.invitationRefHash !== invitationRefHash
      ) {
        throw fail(`existing Credential does not match ${credential.actorId}`);
      }
      continue;
    }
    if (invitationBinding.rowCount !== 0) {
      throw fail("invitation is already bound");
    }
    const credentialId = createOperationalId("credential");
    const clientAuthenticationMethod = credential.kind === "agent_mtls"
      ? ClientAuthenticationMethod.MTLS
      : credential.kind === "agent_dpop"
        ? ClientAuthenticationMethod.PRIVATE_KEY_JWT
        : ClientAuthenticationMethod.SIWE;
    const senderConstraintMethod = credential.kind === "agent_mtls"
      ? SenderConstraintMethod.MTLS
      : credential.kind === "agent_dpop"
        ? SenderConstraintMethod.DPOP
        : SenderConstraintMethod.HOST_SESSION;
    await client.query(
      `INSERT INTO authentication_credentials(id,tenant_id,actor_id,actor_type,issuer,subject_ref_hash,client_id,client_authentication_method,sender_constraint_method,sender_constraint_ref_hash,roles,allowed_capabilities,policy_version,status,version,expires_at,created_at,updated_at,schema_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,'active',1,$14,$15,$15,'authentication_credential.v1')`,
      [credentialId, config.tenant.tenantId, credential.actorId, credential.profile.actorType, credential.issuer,
        subjectRefHash, credential.clientId, clientAuthenticationMethod, senderConstraintMethod, senderConstraintRefHash,
        JSON.stringify([credential.profile.roleBundle]), JSON.stringify(credential.profile.capabilities),
        config.policyVersion, credential.expiresAt, now]
    );
    await client.query(
      `INSERT INTO authentication_events(id,tenant_id,event_type,actor_id,credential_id,reason_code,occurred_at,payload,schema_version)
       VALUES ($1,$2,'credential_registered',$3,$4,'closed_pilot_invitation_provisioned',$5,$6::jsonb,'authentication_event.v1')`,
      [createOperationalId("auth_event"), config.tenant.tenantId, config.systemActor.actorId, credentialId, now,
        JSON.stringify({
          actorType: credential.profile.actorType,
          clientAuthenticationMethod,
          invitationRefHash,
          senderConstraintMethod,
          version: 1
        })]
    );
    insertedCredentials += 1;
  }
  return insertedCredentials;
}

async function setBootstrapIdentityRls(client, enabled) {
  for (const table of ["tenants", "actors"]) {
    await client.query(`ALTER TABLE ${table} ${enabled ? "ENABLE" : "DISABLE"} ROW LEVEL SECURITY`);
    if (enabled) await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
  }
}

export async function bootstrapProductionDatabase({
  adminConnectionString,
  config,
  gatewayPassword,
  authenticationPassword,
  referenceHashKey
}) {
  const checked = assertProductionBootstrapConfig(config);
  assertProvisioningWindow(checked, new Date());
  for (const [name, password] of [["gateway password", gatewayPassword], ["authentication password", authenticationPassword]]) {
    if (typeof password !== "string" || password.length < 32 || password.length > 128 || /[\0\r\n]/.test(password)) throw fail(`${name} is invalid`);
  }
  const referenceHasher = createReferenceHasher(referenceHashKey);
  const bootstrapContext = createTenantSecurityContext({
    tenantId: checked.tenant.tenantId,
    actorId: checked.systemActor.actorId,
    policyVersion: checked.policyVersion,
    source: "system_worker"
  });
  const adminPool = createPostgresPool({ connectionString: adminConnectionString, max: 2, applicationName: "ipo-one-production-bootstrap" });
  let insertedCredentials;
  try {
    await migrateUp({ pool: adminPool });
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('ipo.one'), hashtext('production_bootstrap'))");
      await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
      await client.query("REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC");
      await client.query("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC");
      await configureRole(client, { roleName: checked.gatewayRole, password: gatewayPassword, authenticationOnly: false });
      await configureRole(client, { roleName: checked.authenticationRole, password: authenticationPassword, authenticationOnly: true });
      await setTenantTransactionContext(client, bootstrapContext);
      await setBootstrapIdentityRls(client, false);
      insertedCredentials = await seedTenantAndIdentity(client, checked, referenceHasher);
      await setBootstrapIdentityRls(client, true);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await adminPool.end();
  }

  const gatewayUrl = new URL(adminConnectionString);
  gatewayUrl.username = checked.gatewayRole;
  gatewayUrl.password = gatewayPassword;
  const authenticationUrl = new URL(adminConnectionString);
  authenticationUrl.username = checked.authenticationRole;
  authenticationUrl.password = authenticationPassword;
  const gatewayPool = createPostgresPool({ connectionString: gatewayUrl.toString(), max: 1, applicationName: "ipo-one-bootstrap-gateway-check" });
  const authenticationPool = createPostgresPool({ connectionString: authenticationUrl.toString(), max: 1, applicationName: "ipo-one-bootstrap-auth-check" });
  try {
    await Promise.all([
      assertTenantDatabaseRole(gatewayPool),
      assertPostgresAuthenticationRole(authenticationPool)
    ]);
  } finally {
    await Promise.allSettled([gatewayPool.end(), authenticationPool.end()]);
  }
  return Object.freeze({
    schemaVersion: "ipo_one_production_bootstrap_result.v2",
    tenantId: checked.tenant.tenantId,
    gatewayRole: checked.gatewayRole,
    authenticationRole: checked.authenticationRole,
    credentialCount: checked.credentials.length,
    invitationCount: checked.credentials.length,
    insertedCredentials
  });
}
