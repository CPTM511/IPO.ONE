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
  "agent_account_challenges", "agent_account_proof_attempts",
  "execution_account_binding_challenges", "execution_account_binding_proof_attempts",
  "account_bindings",
  "consent_records", "human_identity_references", "credit_intents",
  "risk_decisions", "credit_offers", "credit_offer_acceptances",
  "workspace_continuation_receipts",
  "obligations", "obligation_installments", "sandbox_execution_receipts",
  "sandbox_servicing_actions", "provider_intent_deliveries",
  "provider_intent_acknowledgements", "provider_callback_inbox",
  "credit_lines", "lockboxes", "ledger_accounts", "ledger_transactions", "ledger_entries",
  "execution_target_policies", "delegated_wallet_grants",
  "delegated_wallet_grant_target_policies", "delegated_wallet_grant_transitions",
  "delegated_wallet_pending_exposures", "wallet_prepared_executions",
  "wallet_simulation_reports", "wallet_transaction_preflight_receipts",
  "repayment_events", "aggregate_stream_heads", "domain_events", "credit_events",
  "pilot_feedback_records", "credit_passport_artifacts", "credit_outcomes",
  "credit_state_projections",
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

export async function enrollProductionHumanRole({
  adminConnectionString,
  tenantId,
  actorId,
  roleBundle,
  performedByActorId,
  now = new Date()
}) {
  const checkedTenantId = id("tenantId", tenantId);
  const checkedActorId = id("actorId", actorId);
  const checkedPerformer = id("performedByActorId", performedByActorId);
  const profile = PROFILES[roleBundle];
  if (
    !profile ||
    profile.actorType !== ActorType.HUMAN ||
    !new Set([RoleBundle.HUMAN_BORROWER, RoleBundle.PRINCIPAL_CONTROLLER])
      .has(profile.roleBundle)
  ) {
    throw fail("Human role enrollment profile is invalid");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw fail("Human role enrollment time is invalid");
  }
  const pool = createPostgresPool({
    connectionString: adminConnectionString,
    max: 1,
    applicationName: "ipo-one-human-role-enrollment"
  });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('authentication_role_enrollment'), hashtext($1 || ':' || $2))",
        [checkedTenantId, checkedActorId]
      );
      await setTenantTransactionContext(client, createTenantSecurityContext({
        tenantId: checkedTenantId,
        actorId: checkedPerformer,
        policyVersion: "security_001.v1",
        source: "system_worker"
      }));
      const binding = await client.query(
        `SELECT c.*, a.actor_type, a.status AS actor_status,
                m.role_bundle AS base_role, m.status AS membership_status,
                m.policy_version AS membership_policy_version,
                m.client_ids AS membership_client_ids
           FROM authentication_credentials c
           JOIN actors a ON a.id = c.actor_id
           JOIN memberships m
             ON m.tenant_id = c.tenant_id AND m.actor_id = c.actor_id
          WHERE c.tenant_id = $1
            AND c.actor_id = $2
            AND c.status = 'active'
            AND c.client_authentication_method = 'siwe'
            AND c.sender_constraint_method = 'host_session'
            AND (c.expires_at IS NULL OR c.expires_at > $3)
          FOR UPDATE OF c, a, m`,
        [checkedTenantId, checkedActorId, now]
      );
      if (binding.rowCount !== 1) {
        throw fail("active Human wallet Credential is unavailable");
      }
      const credential = binding.rows[0];
      if (
        credential.actor_type !== ActorType.HUMAN ||
        credential.actor_status !== "active" ||
        credential.membership_status !== "active" ||
        credential.membership_policy_version !== credential.policy_version ||
        ![RoleBundle.HUMAN_BORROWER, RoleBundle.PRINCIPAL_CONTROLLER]
          .includes(credential.base_role) ||
        !Array.isArray(credential.membership_client_ids) ||
        !credential.membership_client_ids.includes(credential.client_id)
      ) {
        throw fail("Human wallet Credential binding is not eligible for role enrollment");
      }
      const existing = await client.query(
        `SELECT * FROM authentication_role_enrollments
          WHERE tenant_id = $1 AND credential_id = $2 AND role_bundle = $3
          FOR UPDATE`,
        [checkedTenantId, credential.id, profile.roleBundle]
      );
      if (existing.rowCount === 1) {
        const row = existing.rows[0];
        if (
          row.actor_id !== checkedActorId ||
          row.status !== "active" ||
          row.policy_version !== credential.policy_version ||
          JSON.stringify(row.capabilities) !== JSON.stringify(profile.capabilities) ||
          JSON.stringify(row.client_ids) !== JSON.stringify([credential.client_id])
        ) {
          throw fail("existing Human role enrollment does not match the reviewed profile");
        }
        await client.query("COMMIT");
        return Object.freeze({
          schemaVersion: "production_human_role_enrollment_result.v1",
          tenantId: checkedTenantId,
          actorId: checkedActorId,
          roleBundle: profile.roleBundle,
          enrollmentId: row.id,
          replayed: true,
          capabilitiesIncluded: false,
          credentialsIncluded: false
        });
      }
      const enrollmentId = createOperationalId("role_enrollment");
      await client.query(
        `INSERT INTO authentication_role_enrollments(
           id, tenant_id, actor_id, credential_id, role_bundle, capabilities,
           client_ids, policy_version, status, valid_from, expires_at, version,
           created_at, updated_at, schema_version
         ) VALUES (
           $1, $2, $3, $4, $5, $6::jsonb,
           $7::jsonb, $8, 'active', $9, $10, 1,
           $9, $9, 'authentication_role_enrollment.v1'
         )`,
        [
          enrollmentId,
          checkedTenantId,
          checkedActorId,
          credential.id,
          profile.roleBundle,
          JSON.stringify(profile.capabilities),
          JSON.stringify([credential.client_id]),
          credential.policy_version,
          now,
          credential.expires_at
        ]
      );
      const eventId = createOperationalId("auth_event");
      await client.query(
        `INSERT INTO authentication_events(
           id, tenant_id, event_type, actor_id, credential_id, reason_code,
           occurred_at, payload, schema_version
         ) VALUES (
           $1, $2, 'role_enrolled', $3, $4,
           'founder_closed_pilot_role_enrollment', $5, $6::jsonb,
           'authentication_event.v1'
         )`,
        [
          eventId,
          checkedTenantId,
          checkedPerformer,
          credential.id,
          now,
          JSON.stringify({
            roleBundle: profile.roleBundle,
            enrollmentId,
            version: 1
          })
        ]
      );
      await client.query("COMMIT");
      return Object.freeze({
        schemaVersion: "production_human_role_enrollment_result.v1",
        tenantId: checkedTenantId,
        actorId: checkedActorId,
        roleBundle: profile.roleBundle,
        enrollmentId,
        eventId,
        replayed: false,
        capabilitiesIncluded: false,
        credentialsIncluded: false
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function goldenFlowAgentBootstrapResult({
  tenantId,
  policyVersion,
  actorId,
  clientId,
  issuer,
  externalSubject,
  senderThumbprint,
  credentialId,
  replayed
}) {
  return Object.freeze({
    schemaVersion: "production_golden_flow_agent_result.v1",
    tenantId,
    actorId,
    credentialId,
    replayed,
    credentialsIncluded: false,
    privateKeyIncluded: false,
    productionFundsAuthority: false,
    runnerBootstrap: Object.freeze({
      schemaVersion: "vercel_golden_flow_agent_bootstrap.v1",
      tenant: Object.freeze({ tenantId }),
      policyVersion,
      credentials: Object.freeze([Object.freeze({
        kind: "agent_dpop",
        profile: "agent_runtime",
        actorId,
        clientId,
        issuer,
        externalSubject,
        senderThumbprint
      })])
    })
  });
}

export async function provisionProductionGoldenFlowAgent({
  adminConnectionString,
  referenceHashKey,
  tenantId,
  controllerActorId,
  actorId,
  clientId,
  issuer,
  externalSubject,
  invitationId,
  senderThumbprint,
  expiresAt,
  performedByActorId,
  policyVersion = "security_001.v1",
  now = new Date()
}) {
  const checkedTenantId = id("tenantId", tenantId);
  const checkedControllerId = id("controllerActorId", controllerActorId);
  const checkedActorId = id("actorId", actorId);
  const checkedClientId = id("clientId", clientId);
  const checkedIssuer = httpsOrigin("credential issuer", issuer);
  const checkedExternalSubject = text("externalSubject", externalSubject);
  const checkedInvitationId = id("invitationId", invitationId, INVITATION_ID);
  const checkedPerformer = id("performedByActorId", performedByActorId);
  const checkedPolicyVersion = id("policyVersion", policyVersion);
  const checkedExpiresAt = canonicalTimestamp("expiresAt", expiresAt);
  if (!BASE64URL.test(senderThumbprint ?? "") || senderThumbprint.length !== 43) {
    throw fail("Agent sender thumbprint is invalid");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw fail("Agent provisioning time is invalid");
  }
  const lifetime = new Date(checkedExpiresAt).getTime() - now.getTime();
  if (lifetime <= 0 || lifetime > MAXIMUM_CREDENTIAL_LIFETIME_MS) {
    throw fail("credential provisioning window is invalid");
  }
  const referenceHasher = createReferenceHasher(referenceHashKey);
  const subjectRefHash = referenceHasher.hash(
    "subject",
    `${checkedIssuer}\0${checkedExternalSubject}`
  );
  const invitationRefHash = referenceHasher.hash(
    "pilot.invitation",
    `${checkedTenantId}\0${checkedInvitationId}`
  );
  const senderConstraintRefHash = referenceHasher.hash(
    "sender.constraint",
    senderThumbprint
  );
  const profile = PROFILES.agent_runtime;
  const pool = createPostgresPool({
    connectionString: adminConnectionString,
    max: 1,
    applicationName: "ipo-one-golden-flow-agent-provisioning"
  });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('golden_flow_agent_provisioning'), hashtext($1 || ':' || $2))",
        [checkedTenantId, checkedActorId]
      );
      await setTenantTransactionContext(client, createTenantSecurityContext({
        tenantId: checkedTenantId,
        actorId: checkedPerformer,
        policyVersion: checkedPolicyVersion,
        source: "system_worker"
      }));
      const authority = await client.query(
        `SELECT t.status AS tenant_status,
                controller.actor_type AS controller_actor_type,
                controller.status AS controller_status,
                controller_membership.status AS controller_membership_status,
                controller_membership.policy_version,
                performer.actor_type AS performer_actor_type,
                performer.status AS performer_status,
                performer_membership.role_bundle AS performer_role,
                performer_membership.status AS performer_membership_status
           FROM tenants t
           JOIN actors controller ON controller.id = $2
           JOIN memberships controller_membership
             ON controller_membership.tenant_id = t.id
            AND controller_membership.actor_id = controller.id
           JOIN actors performer ON performer.id = $3
           JOIN memberships performer_membership
             ON performer_membership.tenant_id = t.id
            AND performer_membership.actor_id = performer.id
          WHERE t.id = $1
            AND controller_membership.role_bundle = 'principal_controller'
            AND performer_membership.role_bundle = 'system_worker'
          FOR SHARE OF t, controller, controller_membership, performer, performer_membership`,
        [checkedTenantId, checkedControllerId, checkedPerformer]
      );
      const bound = authority.rows[0];
      if (
        authority.rowCount !== 1 ||
        bound.tenant_status !== "active" ||
        bound.controller_actor_type !== ActorType.HUMAN ||
        bound.controller_status !== "active" ||
        bound.controller_membership_status !== "active" ||
        bound.policy_version !== checkedPolicyVersion ||
        bound.performer_actor_type !== ActorType.SYSTEM_WORKER ||
        bound.performer_status !== "active" ||
        bound.performer_role !== RoleBundle.SYSTEM_WORKER ||
        bound.performer_membership_status !== "active"
      ) {
        throw fail("Golden Flow Agent provisioning authority is unavailable");
      }
      await client.query(
        `INSERT INTO actors(
           id, actor_hash, actor_type, status, created_at, updated_at, schema_version
         ) VALUES ($1, $2, 'agent', 'active', $3, $3, 'actor.v1')
         ON CONFLICT (id) DO NOTHING`,
        [checkedActorId, hashId("production_actor", checkedActorId), now]
      );
      await client.query(
        `INSERT INTO memberships(
           id, membership_hash, tenant_id, actor_id, role_bundle, capabilities,
           client_ids, policy_version, controller_actor_id, status, valid_from,
           expires_at, created_at, updated_at, version, schema_version
         ) VALUES (
           $1, $2, $3, $4, 'agent_runtime', $5::jsonb,
           $6::jsonb, $7, $8, 'active', $9,
           NULL, $9, $9, 1, 'membership.v1'
         ) ON CONFLICT (tenant_id, actor_id, role_bundle) DO NOTHING`,
        [
          `membership_${checkedActorId}`,
          hashId("production_membership", `${checkedTenantId}:${checkedActorId}`),
          checkedTenantId,
          checkedActorId,
          JSON.stringify(profile.capabilities),
          JSON.stringify([checkedClientId]),
          checkedPolicyVersion,
          checkedControllerId,
          now
        ]
      );
      const identity = await client.query(
        `SELECT a.actor_type, a.status AS actor_status,
                m.role_bundle, m.capabilities, m.client_ids, m.policy_version,
                m.controller_actor_id, m.status AS membership_status
           FROM actors a
           JOIN memberships m ON m.actor_id = a.id AND m.tenant_id = $2
          WHERE a.id = $1 AND m.role_bundle = 'agent_runtime'`,
        [checkedActorId, checkedTenantId]
      );
      const agent = identity.rows[0];
      if (
        identity.rowCount !== 1 ||
        agent.actor_type !== ActorType.AGENT ||
        agent.actor_status !== "active" ||
        agent.membership_status !== "active" ||
        agent.policy_version !== checkedPolicyVersion ||
        agent.controller_actor_id !== checkedControllerId ||
        JSON.stringify(agent.capabilities) !== JSON.stringify(profile.capabilities) ||
        JSON.stringify(agent.client_ids) !== JSON.stringify([checkedClientId])
      ) {
        throw fail("existing Golden Flow Agent identity does not match the reviewed profile");
      }
      const invitation = await client.query(
        `SELECT credential_id
           FROM authentication_events
          WHERE tenant_id = $1
            AND event_type = 'credential_registered'
            AND payload->>'invitationRefHash' = $2
          ORDER BY occurred_at, id`,
        [checkedTenantId, invitationRefHash]
      );
      const sender = await client.query(
        `SELECT actor_id
           FROM authentication_credentials
          WHERE tenant_id = $1
            AND client_authentication_method = 'private_key_jwt'
            AND sender_constraint_ref_hash = $2`,
        [checkedTenantId, senderConstraintRefHash]
      );
      const existing = await client.query(
        `SELECT *
           FROM authentication_credentials
          WHERE tenant_id = $1 AND issuer = $2 AND client_id = $3
            AND subject_ref_hash = $4
          FOR UPDATE`,
        [checkedTenantId, checkedIssuer, checkedClientId, subjectRefHash]
      );
      if (existing.rowCount === 1) {
        const credential = existing.rows[0];
        if (
          credential.actor_id !== checkedActorId ||
          credential.actor_type !== ActorType.AGENT ||
          credential.status !== "active" ||
          credential.client_authentication_method !== ClientAuthenticationMethod.PRIVATE_KEY_JWT ||
          credential.sender_constraint_method !== SenderConstraintMethod.DPOP ||
          credential.sender_constraint_ref_hash !== senderConstraintRefHash ||
          credential.policy_version !== checkedPolicyVersion ||
          new Date(credential.expires_at).toISOString() !== checkedExpiresAt ||
          invitation.rowCount !== 1 ||
          invitation.rows[0].credential_id !== credential.id ||
          sender.rowCount !== 1 ||
          sender.rows[0].actor_id !== checkedActorId
        ) {
          throw fail("existing Golden Flow Agent Credential does not match the reviewed invitation");
        }
        await client.query("COMMIT");
        return goldenFlowAgentBootstrapResult({
          tenantId: checkedTenantId,
          policyVersion: checkedPolicyVersion,
          actorId: checkedActorId,
          clientId: checkedClientId,
          issuer: checkedIssuer,
          externalSubject: checkedExternalSubject,
          senderThumbprint,
          credentialId: credential.id,
          replayed: true
        });
      }
      if (invitation.rowCount !== 0 || sender.rowCount !== 0) {
        throw fail("Golden Flow Agent invitation or sender constraint is already bound");
      }
      const credentialId = createOperationalId("credential");
      await client.query(
        `INSERT INTO authentication_credentials(
           id, tenant_id, actor_id, actor_type, issuer, subject_ref_hash,
           client_id, client_authentication_method, sender_constraint_method,
           sender_constraint_ref_hash, roles, allowed_capabilities,
           policy_version, status, version, expires_at, created_at, updated_at,
           schema_version
         ) VALUES (
           $1, $2, $3, 'agent', $4, $5,
           $6, 'private_key_jwt', 'dpop',
           $7, $8::jsonb, $9::jsonb,
           $10, 'active', 1, $11, $12, $12,
           'authentication_credential.v1'
         )`,
        [
          credentialId,
          checkedTenantId,
          checkedActorId,
          checkedIssuer,
          subjectRefHash,
          checkedClientId,
          senderConstraintRefHash,
          JSON.stringify([profile.roleBundle]),
          JSON.stringify(profile.capabilities),
          checkedPolicyVersion,
          checkedExpiresAt,
          now
        ]
      );
      await client.query(
        `INSERT INTO authentication_events(
           id, tenant_id, event_type, actor_id, credential_id, reason_code,
           occurred_at, payload, schema_version
         ) VALUES (
           $1, $2, 'credential_registered', $3, $4,
           'golden_flow_agent_invitation_provisioned', $5, $6::jsonb,
           'authentication_event.v1'
         )`,
        [
          createOperationalId("auth_event"),
          checkedTenantId,
          checkedPerformer,
          credentialId,
          now,
          JSON.stringify({
            actorType: ActorType.AGENT,
            clientAuthenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
            invitationRefHash,
            senderConstraintMethod: SenderConstraintMethod.DPOP,
            version: 1
          })
        ]
      );
      await client.query("COMMIT");
      return goldenFlowAgentBootstrapResult({
        tenantId: checkedTenantId,
        policyVersion: checkedPolicyVersion,
        actorId: checkedActorId,
        clientId: checkedClientId,
        issuer: checkedIssuer,
        externalSubject: checkedExternalSubject,
        senderThumbprint,
        credentialId,
        replayed: false
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

export async function revokeProductionGoldenFlowAgentCredential({
  adminConnectionString,
  tenantId,
  actorId,
  performedByActorId,
  now = new Date()
}) {
  const checkedTenantId = id("tenantId", tenantId);
  const checkedActorId = id("actorId", actorId);
  const checkedPerformer = id("performedByActorId", performedByActorId);
  const pool = createPostgresPool({
    connectionString: adminConnectionString,
    max: 1,
    applicationName: "ipo-one-golden-flow-agent-revocation"
  });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setTenantTransactionContext(client, createTenantSecurityContext({
        tenantId: checkedTenantId,
        actorId: checkedPerformer,
        policyVersion: "security_001.v1",
        source: "system_worker"
      }));
      const selected = await client.query(
        `SELECT * FROM authentication_credentials
          WHERE tenant_id = $1 AND actor_id = $2 AND actor_type = 'agent'
            AND client_authentication_method = 'private_key_jwt'
          FOR UPDATE`,
        [checkedTenantId, checkedActorId]
      );
      if (selected.rowCount !== 1) {
        throw fail("Golden Flow Agent Credential is unavailable");
      }
      const credential = selected.rows[0];
      if (credential.status === "revoked") {
        await client.query("COMMIT");
        return Object.freeze({
          schemaVersion: "production_golden_flow_agent_revocation.v1",
          tenantId: checkedTenantId,
          actorId: checkedActorId,
          status: "revoked",
          replayed: true,
          privateKeyIncluded: false
        });
      }
      if (credential.status !== "active" && credential.status !== "suspended") {
        throw fail("Golden Flow Agent Credential cannot be revoked from its current state");
      }
      await client.query(
        `UPDATE authentication_credentials
            SET status = 'revoked', updated_at = $3
          WHERE tenant_id = $1 AND id = $2`,
        [checkedTenantId, credential.id, now]
      );
      await client.query(
        `INSERT INTO authentication_events(
           id, tenant_id, event_type, actor_id, credential_id, reason_code,
           occurred_at, payload, schema_version
         ) VALUES (
           $1, $2, 'credential_revoked', $3, $4,
           'golden_flow_agent_acceptance_complete', $5,
           '{"status":"revoked"}'::jsonb, 'authentication_event.v1'
         )`,
        [
          createOperationalId("auth_event"),
          checkedTenantId,
          checkedPerformer,
          credential.id,
          now
        ]
      );
      await client.query("COMMIT");
      return Object.freeze({
        schemaVersion: "production_golden_flow_agent_revocation.v1",
        tenantId: checkedTenantId,
        actorId: checkedActorId,
        status: "revoked",
        replayed: false,
        privateKeyIncluded: false
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
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
    await client.query(`GRANT SELECT ON tenants, actors, memberships, authentication_credentials, authentication_role_enrollments, authentication_oidc_transactions, authentication_wallet_transactions, authentication_sessions, authentication_session_invalidations, authentication_replay_entries, authentication_events TO ${role}`);
    await client.query(`GRANT INSERT, UPDATE ON authentication_credentials TO ${role}`);
    await client.query(`GRANT INSERT, DELETE ON authentication_oidc_transactions, authentication_wallet_transactions TO ${role}`);
    await client.query(`GRANT INSERT, UPDATE ON authentication_sessions TO ${role}`);
    await client.query(`GRANT INSERT ON authentication_session_invalidations TO ${role}`);
    await client.query(`GRANT INSERT, DELETE ON authentication_replay_entries TO ${role}`);
    await client.query(`GRANT INSERT ON authentication_events TO ${role}`);
    await client.query(
      `GRANT UPDATE (id) ON actors, memberships, authentication_role_enrollments TO ${role}`
    );
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
  for (const credential of config.credentials.filter(({ profile }) =>
    profile.roleBundle === "human_borrower" || profile.roleBundle === "principal_controller"
  )) {
    const storedCredential = await client.query(
      `SELECT id, created_at, expires_at, updated_at
         FROM authentication_credentials
        WHERE tenant_id = $1 AND actor_id = $2 AND client_id = $3
          AND status = 'active'`,
      [config.tenant.tenantId, credential.actorId, credential.clientId]
    );
    if (storedCredential.rowCount !== 1) {
      throw fail(`Human Credential is unavailable for ${credential.actorId}`);
    }
    const stored = storedCredential.rows[0];
    await client.query(
      `INSERT INTO authentication_role_enrollments(
         id, tenant_id, actor_id, credential_id, role_bundle, capabilities,
         client_ids, policy_version, status, valid_from, expires_at, version,
         created_at, updated_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb,
         $7::jsonb, $8, 'active', $9, $10, 1,
         $9, $11, 'authentication_role_enrollment.v1'
       ) ON CONFLICT (tenant_id, credential_id, role_bundle) DO NOTHING`,
      [
        createOperationalId("role_enrollment"),
        config.tenant.tenantId,
        credential.actorId,
        stored.id,
        credential.profile.roleBundle,
        JSON.stringify(credential.profile.capabilities),
        JSON.stringify([credential.clientId]),
        config.policyVersion,
        stored.created_at,
        stored.expires_at,
        stored.updated_at
      ]
    );
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
