import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import {
  AUTHORIZATION_POLICY_VERSION,
  PilotCapability,
  RoleBundle
} from "../../../modules/authorization/src/index.js";
import {
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";
import {
  createM1BAcceptanceAppPool,
  M1_B_ACCEPTANCE_SECRET_MOUNT
} from "./m1-b-acceptance-postgres.js";
import { DEFAULT_PRIVATE_PILOT_PROFILE } from "./private-pilot-profile.js";
import {
  TENANT_PROTOCOL_OPERATIONS
} from "../../../packages/api-contract/src/tenant-protocol.js";

const EXACT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/%-]{1,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const REFERENCE_HASH = /^[A-Za-z0-9_-]{43}$/;
const SAFE_WALLET_VERIFICATION_METHODS = new Set([
  "eip191_eoa_v1",
  "eip1271_eip191_v1",
  "eip6492_eip191_v1"
]);

export const M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_SCHEMA_VERSION =
  "m1_b_operational_browser_read_context.v1";
export const M1_B_OPERATIONAL_BROWSER_APP_ROLE_READ_SCHEMA_VERSION =
  "m1_b_operational_browser_app_role_read.v1";

const BROWSER_CONTEXT_KEYS = Object.freeze([
  "candidateReleaseId",
  "correlationId",
  "expectedDatabaseStartedAt",
  "operationId",
  "promptIssuedAt",
  "requestId",
  "role",
  "runtimeImageId",
  "schemaVersion"
]);
const BROWSER_APP_ROLE_READ_KEYS = Object.freeze([
  "schemaVersion",
  "candidateReleaseId",
  "runtimeImageId",
  "databaseStartedAt",
  "databaseObservedAt",
  "databaseRole",
  "databaseName",
  "role",
  "promptIssuedAt",
  "operationId",
  "responseSchemaVersion",
  "requestId",
  "correlationId",
  "authorizationAuditEvents",
  "authorizationAuditEventCount",
  "authorizationAuditManifestSha256",
  "authorizationAttemptCount",
  "authorizationBinding",
  "authenticationAssurance",
  "runtimeBinding",
  "readOnlyEvidenceRole",
  "databaseInRecovery",
  "credentialsIncluded",
  "sessionMaterialIncluded",
  "actorIdentifiersIncluded",
  "rawPiiIncluded",
  "authorizationEvidenceSource",
  "schemaVersionSource"
]);
const AUTHORIZATION_BINDING_KEYS = Object.freeze([
  "exactRequestAttempt",
  "tenantBound",
  "reviewedActorBound",
  "operationBound",
  "exactTwoAllowAuditSetBound"
]);
const AUTHENTICATION_ASSURANCE_KEYS = Object.freeze([
  "authTime",
  "activeReviewedActorCount",
  "activeSiweSessionCount",
  "activeInvitedWalletCredentialCount",
  "activeMembershipCount",
  "boundClientCount",
  "requiredCapabilityCount",
  "invitedCredentialRegistrationCount",
  "auditSessionBindingVerified",
  "clientBindingVerified",
  "capabilityBindingVerified"
]);
const RUNTIME_BINDING_KEYS = Object.freeze([
  "candidateReleaseUnchanged",
  "runtimeImageUnchanged",
  "databaseStartUnchanged"
]);
const AUTHORIZATION_AUDIT_EVENT_KEYS = Object.freeze([
  "sequence",
  "eventId",
  "decisionId",
  "occurredAt"
]);
export const M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_ENVIRONMENT_VARIABLE =
  "IPO_ONE_M1_B_BROWSER_READ_CONTEXT_JSON";

const ROLE_READS = Object.freeze({
  human: Object.freeze({
    actorId: DEFAULT_PRIVATE_PILOT_PROFILE.identities.borrower.actorId,
    operationId: "pilotReadWorkspaceResume",
    action: "workspace.resume.self",
    resourceType: "workspace",
    roleBundle: RoleBundle.HUMAN_BORROWER,
    requiredCapability: PilotCapability.WORKSPACE_RESUME_SELF,
    responseSchemaVersion: "tenant_workspace_resume_view.v2"
  }),
  principal_agent: Object.freeze({
    actorId: DEFAULT_PRIVATE_PILOT_PROFILE.identities.controller.actorId,
    operationId: "pilotReadWorkspaceResume",
    action: "workspace.resume.self",
    resourceType: "workspace",
    roleBundle: RoleBundle.PRINCIPAL_CONTROLLER,
    requiredCapability: PilotCapability.WORKSPACE_RESUME_SELF,
    responseSchemaVersion: "tenant_workspace_resume_view.v2"
  }),
  capital_partner: Object.freeze({
    actorId: DEFAULT_PRIVATE_PILOT_PROFILE.identities.capitalPartner.actorId,
    operationId: "pilotReadCapitalPartnerSelf",
    action: "capital_partner.portfolio.read.own",
    resourceType: "workspace",
    roleBundle: RoleBundle.CAPITAL_PARTNER_OPERATOR,
    requiredCapability: PilotCapability.CAPITAL_PARTNER_PORTFOLIO_READ_OWN,
    responseSchemaVersion: "tenant_capital_partner_self_view.v1"
  })
});

for (const roleRead of Object.values(ROLE_READS)) {
  const protocolOperation = TENANT_PROTOCOL_OPERATIONS.find(
    ({ operationId }) => operationId === roleRead.operationId
  );
  if (
    protocolOperation?.kind !== "query" ||
    protocolOperation.public !== false ||
    protocolOperation.fundsAuthority !== false ||
    protocolOperation.resourceType !== roleRead.resourceType ||
    protocolOperation.requiredCapability !== roleRead.requiredCapability ||
    protocolOperation.responseSchemaVersion !== roleRead.responseSchemaVersion
  ) {
    throw new Error("operational_browser_read_protocol_drift");
  }
}

function fail(message) {
  process.stderr.write(`M1-B operational runtime read: ${message}\n`);
  process.exit(1);
}

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, keys) {
  return plainObject(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function iso(value, code) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(code);
  return date.toISOString();
}

function canonicalIso(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function sameStringSet(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    [...left].sort().every((entry, index) => entry === [...right].sort()[index]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

export function parseM1BOperationalBrowserReadContext(input) {
  if (input === undefined || input === null || input === "") return null;
  let value = input;
  if (typeof input === "string") {
    try {
      value = parseStrictJson(input, {
        maximumBytes: 4 * 1024,
        maximumDepth: 3,
        maximumKeys: BROWSER_CONTEXT_KEYS.length
      });
    } catch {
      throw new Error("operational_browser_read_context_invalid");
    }
  }
  const role = value?.role;
  const roleRead = ROLE_READS[role];
  if (
    !exactKeys(value, BROWSER_CONTEXT_KEYS) ||
    value.schemaVersion !== M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_SCHEMA_VERSION ||
    !EXACT_SHA.test(value.candidateReleaseId ?? "") ||
    !IMAGE_ID.test(value.runtimeImageId ?? "") ||
    !roleRead ||
    value.operationId !== roleRead.operationId ||
    !REQUEST_IDENTIFIER.test(value.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(value.correlationId ?? "") ||
    value.requestId === value.correlationId
  ) {
    throw new Error("operational_browser_read_context_invalid");
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    candidateReleaseId: value.candidateReleaseId,
    runtimeImageId: value.runtimeImageId,
    expectedDatabaseStartedAt: iso(
      value.expectedDatabaseStartedAt,
      "operational_browser_read_context_invalid"
    ),
    promptIssuedAt: iso(
      value.promptIssuedAt,
      "operational_browser_read_context_invalid"
    ),
    role,
    operationId: value.operationId,
    requestId: value.requestId,
    correlationId: value.correlationId
  });
}

export function parseM1BOperationalRuntimeReadArguments(argv = []) {
  if (!Array.isArray(argv)) {
    throw new Error("operational_browser_read_arguments_invalid");
  }
  if (argv.length === 0) return null;
  if (
    argv.length !== 2 ||
    argv[0] !== "--browser-read-context-json" ||
    typeof argv[1] !== "string"
  ) {
    throw new Error("operational_browser_read_arguments_invalid");
  }
  return parseM1BOperationalBrowserReadContext(argv[1]);
}

function resolveBrowserReadContext(environment, directContext) {
  const environmentContext =
    environment[M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_ENVIRONMENT_VARIABLE];
  if (
    directContext !== undefined &&
    directContext !== null &&
    environmentContext !== undefined &&
    environmentContext !== ""
  ) {
    throw new Error("operational_browser_read_context_ambiguous");
  }
  return parseM1BOperationalBrowserReadContext(
    directContext ?? environmentContext
  );
}

async function readRuntimeIdentity(client, { requireObservedAt = false } = {}) {
  const result = await client.query(
    `SELECT pg_postmaster_start_time() AS database_started_at,
            clock_timestamp() AS database_observed_at,
            current_user AS database_role,
            current_database() AS database_name,
            pg_is_in_recovery() AS in_recovery`
  );
  if (
    result.rowCount !== 1 ||
    result.rows[0].database_role !== "ipo_one_private_pilot_app" ||
    result.rows[0].database_name !== "ipo_one_private_pilot" ||
    result.rows[0].in_recovery !== false ||
    (requireObservedAt && result.rows[0].database_observed_at === undefined)
  ) {
    throw new Error("operational_runtime_database_untrusted");
  }
  return Object.freeze({
    databaseStartedAt: iso(
      result.rows[0].database_started_at,
      "operational_runtime_database_untrusted"
    ),
    databaseObservedAt: iso(
      result.rows[0].database_observed_at ?? result.rows[0].database_started_at,
      "operational_runtime_database_untrusted"
    ),
    databaseRole: result.rows[0].database_role,
    databaseName: result.rows[0].database_name,
    databaseInRecovery: false
  });
}

function browserReadSecurityContext(roleRead) {
  return createTenantSecurityContext({
    tenantId: DEFAULT_PRIVATE_PILOT_PROFILE.tenantId,
    actorId: roleRead.actorId,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    source: "local_test"
  });
}

async function readBrowserPrivateAudit(client, context, identity) {
  const roleRead = ROLE_READS[context.role];
  await setTenantTransactionContext(client, browserReadSecurityContext(roleRead));
  const result = await client.query(
    `SELECT a.id AS audit_event_id, a.occurred_at, a.request_id,
            a.correlation_id, a.actor_type AS audit_actor_type,
            a.client_ref_hash AS audit_client_ref_hash,
            a.token_jti_hash AS audit_token_jti_hash,
            a.operation_id, a.action, a.resource_type, a.resource_id,
            a.authorization_decision, a.authorization_decision_id,
            a.command_payload_hash, a.command_hash,
            a.policy_version AS audit_policy_version, a.reason_code,
            a.membership_id AS audit_membership_id,
            actor.actor_type::text AS actor_type,
            actor.status AS actor_status,
            s.session_ref_hash, s.actor_id AS session_actor_id,
            s.client_id AS session_client_id,
            s.credential_id AS session_credential_id,
            s.credential_version AS session_credential_version,
            s.authentication_method,
            s.sender_constraint_method AS session_sender_constraint_method,
            s.policy_version AS session_policy_version,
            s.roles AS session_roles,
            s.allowed_capabilities AS session_allowed_capabilities,
            s.auth_time, s.acr, s.amr,
            s.created_at AS session_created_at,
            s.last_seen_at AS session_last_seen_at,
            s.idle_expires_at, s.absolute_expires_at,
            s.status AS session_status,
            c.actor_id AS credential_actor_id,
            c.actor_type::text AS credential_actor_type,
            c.client_id AS credential_client_id,
            c.client_authentication_method,
            c.sender_constraint_method AS credential_sender_constraint_method,
            c.policy_version AS credential_policy_version,
            c.roles AS credential_roles,
            c.allowed_capabilities AS credential_allowed_capabilities,
            c.status AS credential_status,
            c.version AS current_credential_version,
            c.created_at AS credential_created_at,
            c.expires_at AS credential_expires_at,
            m.id AS membership_id, m.actor_id AS membership_actor_id,
            m.role_bundle, m.capabilities AS membership_capabilities,
            m.client_ids AS membership_client_ids,
            m.policy_version AS membership_policy_version,
            m.status AS membership_status,
            m.valid_from AS membership_valid_from,
            m.expires_at AS membership_expires_at,
            registration.registration_count,
            registration.invitation_registration_count,
            registration.matching_invitation_registration_count,
            registration.registration_occurred_at,
            count(*) OVER (PARTITION BY a.id) AS session_match_count
       FROM authorization_audit_events a
       JOIN actors actor ON actor.id = a.actor_id
       JOIN authentication_sessions s
         ON s.tenant_id = a.tenant_id AND s.actor_id = a.actor_id
        AND s.token_jti_ref_hash = a.token_jti_hash
       JOIN authentication_credentials c
         ON c.tenant_id = s.tenant_id AND c.id = s.credential_id
        AND c.version = s.credential_version
       JOIN memberships m
         ON m.tenant_id = s.tenant_id AND m.actor_id = s.actor_id
        AND m.id = a.membership_id
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (
                  WHERE e.event_type = 'credential_registered'
                ) AS registration_count,
                count(*) FILTER (
                  WHERE e.event_type = 'credential_registered'
                    AND e.payload ? 'invitationRefHash'
                ) AS invitation_registration_count,
                count(*) FILTER (
                  WHERE e.event_type = 'credential_registered'
                    AND e.payload ? 'invitationRefHash'
                    AND e.payload ->> 'actorType' = c.actor_type::text
                    AND e.payload ->> 'clientAuthenticationMethod' =
                      c.client_authentication_method
                    AND e.payload ->> 'senderConstraintMethod' =
                      c.sender_constraint_method
                    AND e.payload ->> 'version' = c.version::text
                ) AS matching_invitation_registration_count,
                min(e.occurred_at) FILTER (
                  WHERE e.event_type = 'credential_registered'
                ) AS registration_occurred_at
           FROM authentication_events e
          WHERE e.tenant_id = c.tenant_id
            AND e.credential_id = c.id
            AND e.event_type = 'credential_registered'
       ) registration ON TRUE
      WHERE a.tenant_id = $1 AND a.actor_id = $2
        AND a.operation_id = $3 AND a.request_id = $4
        AND a.correlation_id = $5
      ORDER BY a.occurred_at, a.id`,
    [
      DEFAULT_PRIVATE_PILOT_PROFILE.tenantId,
      roleRead.actorId,
      context.operationId,
      context.requestId,
      context.correlationId
    ]
  );
  if (result.rowCount !== 2 || result.rows.length !== 2) {
    throw new Error("operational_browser_read_audit_set_invalid");
  }
  const observedAt = Date.parse(identity.databaseObservedAt);
  const databaseStartedAt = Date.parse(identity.databaseStartedAt);
  const promptIssuedAt = Date.parse(context.promptIssuedAt);
  if (promptIssuedAt < databaseStartedAt || promptIssuedAt > observedAt) {
    throw new Error("operational_browser_read_runtime_binding_invalid");
  }
  const auditEventIds = new Set();
  const decisionIds = new Set();
  const sessionRefs = new Set();
  const credentialIds = new Set();
  const clientIds = new Set();
  const membershipIds = new Set();
  const auditClientRefs = new Set();
  const auditTokenJtiRefs = new Set();
  const resources = new Set();
  const authTimes = new Set();
  const auditEvents = [];
  for (const [index, row] of result.rows.entries()) {
    const occurredAt = iso(
      row.occurred_at,
      "operational_browser_read_audit_set_invalid"
    );
    const authTime = iso(
      row.auth_time,
      "operational_browser_read_authentication_invalid"
    );
    const registrationOccurredAt = iso(
      row.registration_occurred_at,
      "operational_browser_read_authentication_invalid"
    );
    const sessionCreatedAt = iso(
      row.session_created_at,
      "operational_browser_read_authentication_invalid"
    );
    const sessionLastSeenAt = iso(
      row.session_last_seen_at,
      "operational_browser_read_authentication_invalid"
    );
    const idleExpiresAt = iso(
      row.idle_expires_at,
      "operational_browser_read_authentication_invalid"
    );
    const absoluteExpiresAt = iso(
      row.absolute_expires_at,
      "operational_browser_read_authentication_invalid"
    );
    const credentialCreatedAt = iso(
      row.credential_created_at,
      "operational_browser_read_authentication_invalid"
    );
    const membershipValidFrom = iso(
      row.membership_valid_from,
      "operational_browser_read_authentication_invalid"
    );
    const occurred = Date.parse(occurredAt);
    const authenticated = Date.parse(authTime);
    const activeAt = observedAt;
    if (
      !IDENTIFIER.test(row.audit_event_id ?? "") ||
      !IDENTIFIER.test(row.authorization_decision_id ?? "") ||
      row.request_id !== context.requestId ||
      row.correlation_id !== context.correlationId ||
      row.operation_id !== roleRead.operationId ||
      row.action !== roleRead.action ||
      row.resource_type !== roleRead.resourceType ||
      !IDENTIFIER.test(row.resource_id ?? "") ||
      row.audit_actor_type !== "human" ||
      row.actor_type !== "human" ||
      row.actor_status !== "active" ||
      row.authorization_decision !== "allow" ||
      row.command_payload_hash !== null ||
      row.command_hash !== null ||
      row.reason_code !== "authorization_allowed" ||
      row.audit_policy_version !== AUTHORIZATION_POLICY_VERSION ||
      row.audit_membership_id !== row.membership_id ||
      Number(row.session_match_count) !== 1 ||
      !REFERENCE_HASH.test(row.session_ref_hash ?? "") ||
      !REFERENCE_HASH.test(row.audit_client_ref_hash ?? "") ||
      !REFERENCE_HASH.test(row.audit_token_jti_hash ?? "") ||
      !IDENTIFIER.test(row.session_credential_id ?? "") ||
      !IDENTIFIER.test(row.session_client_id ?? "") ||
      !IDENTIFIER.test(row.membership_id ?? "") ||
      row.session_actor_id !== roleRead.actorId ||
      row.credential_actor_id !== roleRead.actorId ||
      row.membership_actor_id !== roleRead.actorId ||
      row.credential_actor_type !== "human" ||
      row.session_client_id !== row.credential_client_id ||
      !Array.isArray(row.membership_client_ids) ||
      row.membership_client_ids.length !== 1 ||
      row.membership_client_ids[0] !== row.session_client_id ||
      row.role_bundle !== roleRead.roleBundle ||
      !sameStringSet(row.session_roles, [roleRead.roleBundle]) ||
      !sameStringSet(row.credential_roles, [roleRead.roleBundle]) ||
      !sameStringSet(
        row.session_allowed_capabilities,
        row.credential_allowed_capabilities
      ) ||
      !Array.isArray(row.membership_capabilities) ||
      !row.session_allowed_capabilities.includes(roleRead.requiredCapability) ||
      !row.credential_allowed_capabilities.includes(roleRead.requiredCapability) ||
      !row.membership_capabilities.includes(roleRead.requiredCapability) ||
      row.credential_allowed_capabilities.some(
        (capability) => !row.membership_capabilities.includes(capability)
      ) ||
      Number(row.session_credential_version) !==
        Number(row.current_credential_version) ||
      row.authentication_method !== "siwe" ||
      row.session_sender_constraint_method !== "host_session" ||
      row.client_authentication_method !== "siwe" ||
      row.credential_sender_constraint_method !== "host_session" ||
      row.session_status !== "active" ||
      row.credential_status !== "active" ||
      row.membership_status !== "active" ||
      row.audit_policy_version !== row.session_policy_version ||
      row.audit_policy_version !== row.credential_policy_version ||
      row.audit_policy_version !== row.membership_policy_version ||
      row.acr !== "urn:ipo.one:acr:wallet" ||
      !Array.isArray(row.amr) ||
      row.amr.length !== 3 ||
      row.amr[0] !== "wallet" ||
      row.amr[1] !== "siwe" ||
      !SAFE_WALLET_VERIFICATION_METHODS.has(row.amr[2]) ||
      Number(row.registration_count) !== 1 ||
      Number(row.invitation_registration_count) !== 1 ||
      Number(row.matching_invitation_registration_count) !== 1 ||
      Date.parse(registrationOccurredAt) > authenticated ||
      authenticated < databaseStartedAt ||
      authenticated > occurred ||
      occurred < promptIssuedAt ||
      Date.parse(sessionCreatedAt) > occurred ||
      Date.parse(sessionLastSeenAt) > activeAt ||
      Date.parse(idleExpiresAt) <= activeAt ||
      Date.parse(absoluteExpiresAt) <= activeAt ||
      Date.parse(credentialCreatedAt) > occurred ||
      (row.credential_expires_at !== null &&
        Date.parse(iso(
          row.credential_expires_at,
          "operational_browser_read_authentication_invalid"
        )) <= activeAt) ||
      Date.parse(membershipValidFrom) > occurred ||
      (row.membership_expires_at !== null &&
        Date.parse(iso(
          row.membership_expires_at,
          "operational_browser_read_authentication_invalid"
        )) <= activeAt) ||
      occurred > observedAt
    ) {
      throw new Error("operational_browser_read_authentication_invalid");
    }
    auditEventIds.add(row.audit_event_id);
    decisionIds.add(row.authorization_decision_id);
    sessionRefs.add(row.session_ref_hash);
    credentialIds.add(row.session_credential_id);
    clientIds.add(row.session_client_id);
    membershipIds.add(row.membership_id);
    auditClientRefs.add(row.audit_client_ref_hash);
    auditTokenJtiRefs.add(row.audit_token_jti_hash);
    resources.add(`${row.resource_type}:${row.resource_id}`);
    authTimes.add(authTime);
    auditEvents.push(Object.freeze({
      sequence: index + 1,
      eventId: row.audit_event_id,
      decisionId: row.authorization_decision_id,
      occurredAt
    }));
  }
  if (
    auditEventIds.size !== 2 ||
    decisionIds.size !== 2 ||
    sessionRefs.size !== 1 ||
    credentialIds.size !== 1 ||
    clientIds.size !== 1 ||
    membershipIds.size !== 1 ||
    auditClientRefs.size !== 1 ||
    auditTokenJtiRefs.size !== 1 ||
    resources.size !== 1 ||
    authTimes.size !== 1 ||
    Date.parse(auditEvents[1].occurredAt) < Date.parse(auditEvents[0].occurredAt)
  ) {
    throw new Error("operational_browser_read_audit_set_invalid");
  }
  return Object.freeze({
    auditEvents: Object.freeze(auditEvents),
    authTime: [...authTimes][0]
  });
}

function createBrowserPrivateReadReceipt(context, identity, browserRead) {
  const roleRead = ROLE_READS[context.role];
  const auditManifest = Object.freeze({
    requestId: context.requestId,
    correlationId: context.correlationId,
    operationId: context.operationId,
    events: browserRead.auditEvents
  });
  return Object.freeze({
    schemaVersion: M1_B_OPERATIONAL_BROWSER_APP_ROLE_READ_SCHEMA_VERSION,
    candidateReleaseId: context.candidateReleaseId,
    runtimeImageId: context.runtimeImageId,
    databaseStartedAt: identity.databaseStartedAt,
    databaseObservedAt: identity.databaseObservedAt,
    databaseRole: identity.databaseRole,
    databaseName: identity.databaseName,
    role: context.role,
    promptIssuedAt: context.promptIssuedAt,
    operationId: context.operationId,
    responseSchemaVersion: roleRead.responseSchemaVersion,
    requestId: context.requestId,
    correlationId: context.correlationId,
    authorizationAuditEvents: browserRead.auditEvents,
    authorizationAuditEventCount: browserRead.auditEvents.length,
    authorizationAuditManifestSha256: sha256(canonicalJson(auditManifest)),
    authorizationAttemptCount: 1,
    authorizationBinding: Object.freeze({
      exactRequestAttempt: true,
      tenantBound: true,
      reviewedActorBound: true,
      operationBound: true,
      exactTwoAllowAuditSetBound: true
    }),
    authenticationAssurance: Object.freeze({
      authTime: browserRead.authTime,
      activeReviewedActorCount: 1,
      activeSiweSessionCount: 1,
      activeInvitedWalletCredentialCount: 1,
      activeMembershipCount: 1,
      boundClientCount: 1,
      requiredCapabilityCount: 1,
      invitedCredentialRegistrationCount: 1,
      auditSessionBindingVerified: true,
      clientBindingVerified: true,
      capabilityBindingVerified: true
    }),
    runtimeBinding: Object.freeze({
      candidateReleaseUnchanged: true,
      runtimeImageUnchanged: true,
      databaseStartUnchanged: true
    }),
    readOnlyEvidenceRole: true,
    databaseInRecovery: false,
    credentialsIncluded: false,
    sessionMaterialIncluded: false,
    actorIdentifiersIncluded: false,
    rawPiiIncluded: false,
    authorizationEvidenceSource: "postgresql_server_truth",
    schemaVersionSource: "reviewed_protocol_registry"
  });
}

export function validateM1BOperationalBrowserAppRoleRead(receipt, context) {
  let expectedContext;
  try {
    expectedContext = parseM1BOperationalBrowserReadContext(context);
  } catch {
    throw new Error("operational_browser_app_role_read_invalid");
  }
  const roleRead = expectedContext && ROLE_READS[expectedContext.role];
  if (
    !roleRead ||
    !exactKeys(receipt, BROWSER_APP_ROLE_READ_KEYS) ||
    receipt.schemaVersion !==
      M1_B_OPERATIONAL_BROWSER_APP_ROLE_READ_SCHEMA_VERSION ||
    receipt.candidateReleaseId !== expectedContext.candidateReleaseId ||
    receipt.runtimeImageId !== expectedContext.runtimeImageId ||
    receipt.databaseStartedAt !== expectedContext.expectedDatabaseStartedAt ||
    !canonicalIso(receipt.databaseStartedAt) ||
    !canonicalIso(receipt.databaseObservedAt) ||
    Date.parse(receipt.databaseObservedAt) <
      Date.parse(receipt.databaseStartedAt) ||
    receipt.databaseRole !== "ipo_one_private_pilot_app" ||
    receipt.databaseName !== "ipo_one_private_pilot" ||
    receipt.role !== expectedContext.role ||
    receipt.promptIssuedAt !== expectedContext.promptIssuedAt ||
    !canonicalIso(receipt.promptIssuedAt) ||
    Date.parse(receipt.promptIssuedAt) <
      Date.parse(receipt.databaseStartedAt) ||
    Date.parse(receipt.promptIssuedAt) >
      Date.parse(receipt.databaseObservedAt) ||
    receipt.operationId !== expectedContext.operationId ||
    receipt.responseSchemaVersion !== roleRead.responseSchemaVersion ||
    receipt.requestId !== expectedContext.requestId ||
    receipt.correlationId !== expectedContext.correlationId ||
    receipt.authorizationAuditEventCount !== 2 ||
    receipt.authorizationAttemptCount !== 1 ||
    !SHA256.test(receipt.authorizationAuditManifestSha256 ?? "") ||
    receipt.readOnlyEvidenceRole !== true ||
    receipt.databaseInRecovery !== false ||
    receipt.credentialsIncluded !== false ||
    receipt.sessionMaterialIncluded !== false ||
    receipt.actorIdentifiersIncluded !== false ||
    receipt.rawPiiIncluded !== false ||
    receipt.authorizationEvidenceSource !== "postgresql_server_truth" ||
    receipt.schemaVersionSource !== "reviewed_protocol_registry"
  ) {
    throw new Error("operational_browser_app_role_read_invalid");
  }

  const auditEvents = receipt.authorizationAuditEvents;
  if (
    !Array.isArray(auditEvents) ||
    auditEvents.length !== 2 ||
    auditEvents.some((event, index) =>
      !exactKeys(event, AUTHORIZATION_AUDIT_EVENT_KEYS) ||
      event.sequence !== index + 1 ||
      !IDENTIFIER.test(event.eventId ?? "") ||
      !IDENTIFIER.test(event.decisionId ?? "") ||
      !canonicalIso(event.occurredAt) ||
      Date.parse(event.occurredAt) < Date.parse(receipt.promptIssuedAt) ||
      Date.parse(event.occurredAt) > Date.parse(receipt.databaseObservedAt)
    ) ||
    new Set(auditEvents.map(({ eventId }) => eventId)).size !== 2 ||
    new Set(auditEvents.map(({ decisionId }) => decisionId)).size !== 2 ||
    Date.parse(auditEvents[1].occurredAt) <
      Date.parse(auditEvents[0].occurredAt)
  ) {
    throw new Error("operational_browser_app_role_read_invalid");
  }

  const authorizationBinding = receipt.authorizationBinding;
  if (
    !exactKeys(authorizationBinding, AUTHORIZATION_BINDING_KEYS) ||
    AUTHORIZATION_BINDING_KEYS.some(
      (key) => authorizationBinding[key] !== true
    )
  ) {
    throw new Error("operational_browser_app_role_read_invalid");
  }

  const assurance = receipt.authenticationAssurance;
  if (
    !exactKeys(assurance, AUTHENTICATION_ASSURANCE_KEYS) ||
    !canonicalIso(assurance.authTime) ||
    Date.parse(assurance.authTime) < Date.parse(receipt.databaseStartedAt) ||
    auditEvents.some(
      ({ occurredAt }) => Date.parse(assurance.authTime) > Date.parse(occurredAt)
    ) ||
    [
      "activeReviewedActorCount",
      "activeSiweSessionCount",
      "activeInvitedWalletCredentialCount",
      "activeMembershipCount",
      "boundClientCount",
      "requiredCapabilityCount",
      "invitedCredentialRegistrationCount"
    ].some((key) => assurance[key] !== 1) ||
    [
      "auditSessionBindingVerified",
      "clientBindingVerified",
      "capabilityBindingVerified"
    ].some((key) => assurance[key] !== true)
  ) {
    throw new Error("operational_browser_app_role_read_invalid");
  }

  const runtimeBinding = receipt.runtimeBinding;
  if (
    !exactKeys(runtimeBinding, RUNTIME_BINDING_KEYS) ||
    RUNTIME_BINDING_KEYS.some((key) => runtimeBinding[key] !== true)
  ) {
    throw new Error("operational_browser_app_role_read_invalid");
  }

  const auditManifest = {
    requestId: receipt.requestId,
    correlationId: receipt.correlationId,
    operationId: receipt.operationId,
    events: auditEvents
  };
  if (
    receipt.authorizationAuditManifestSha256 !==
      sha256(canonicalJson(auditManifest))
  ) {
    throw new Error("operational_browser_app_role_read_invalid");
  }
  return receipt;
}

export async function readM1BOperationalRuntime(options = {}) {
  const {
    environment = process.env,
    createPool = createM1BAcceptanceAppPool,
    browserReadContext: directBrowserReadContext,
    ...forbidden
  } = options;
  const browserReadContext = resolveBrowserReadContext(
    environment,
    directBrowserReadContext
  );
  if (
    browserReadContext &&
    (Object.keys(forbidden).length > 0 ||
      (environment.NODE_ENV === "production" &&
        createPool !== createM1BAcceptanceAppPool))
  ) {
    throw new Error("operational_browser_read_dependency_override_forbidden");
  }
  if (
    environment.IPO_ONE_PILOT_DB_SECRET_FILE !== M1_B_ACCEPTANCE_SECRET_MOUNT ||
    !EXACT_SHA.test(environment.IPO_ONE_M1_B_RELEASE_SHA ?? "")
  ) {
    throw new Error("operational_runtime_identity_unbound");
  }
  if (
    browserReadContext &&
    (browserReadContext.candidateReleaseId !==
      environment.IPO_ONE_M1_B_RELEASE_SHA ||
      browserReadContext.runtimeImageId !==
        environment.IPO_ONE_M1_B_RUNTIME_IMAGE_ID ||
      browserReadContext.expectedDatabaseStartedAt !== iso(
        environment.IPO_ONE_M1_B_EXPECTED_DATABASE_STARTED_AT,
        "operational_browser_read_runtime_binding_invalid"
      ))
  ) {
    throw new Error("operational_browser_read_runtime_binding_invalid");
  }
  let databaseUrl;
  try {
    databaseUrl = new URL(environment.DATABASE_URL);
  } catch {
    throw new Error("operational_runtime_database_url_invalid");
  }
  if (
    !new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol) ||
    databaseUrl.username !== "" ||
    databaseUrl.password !== "" ||
    databaseUrl.hostname === "" ||
    databaseUrl.pathname.length <= 1
  ) {
    throw new Error("operational_runtime_database_url_invalid");
  }
  const pool = await createPool({
    databaseUrl: databaseUrl.toString(),
    secretPath: M1_B_ACCEPTANCE_SECRET_MOUNT,
    applicationName: "ipo-one-m1-b-operational-read",
    max: 1
  });
  let client;
  try {
    client = await pool.connect();
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );
    const initialIdentity = await readRuntimeIdentity(client, {
      requireObservedAt: Boolean(browserReadContext)
    });
    if (!browserReadContext) {
      const receipt = Object.freeze({
        schemaVersion: "m1_b_operational_runtime_read.v1",
        candidateReleaseId: environment.IPO_ONE_M1_B_RELEASE_SHA,
        databaseStartedAt: initialIdentity.databaseStartedAt,
        databaseRole: initialIdentity.databaseRole,
        databaseName: initialIdentity.databaseName,
        readOnlyEvidenceRole: true,
        databaseInRecovery: false,
        credentialsIncluded: false,
        schemaVersionSource: "postgresql_server_truth"
      });
      await client.query("COMMIT");
      return receipt;
    }
    if (
      initialIdentity.databaseStartedAt !==
      browserReadContext.expectedDatabaseStartedAt
    ) {
      throw new Error("operational_browser_read_runtime_binding_invalid");
    }
    const browserRead = await readBrowserPrivateAudit(
      client,
      browserReadContext,
      initialIdentity
    );
    const finalIdentity = await readRuntimeIdentity(client, {
      requireObservedAt: true
    });
    if (
      initialIdentity.databaseStartedAt !== finalIdentity.databaseStartedAt ||
      initialIdentity.databaseRole !== finalIdentity.databaseRole ||
      initialIdentity.databaseName !== finalIdentity.databaseName ||
      Date.parse(finalIdentity.databaseObservedAt) <
        Date.parse(initialIdentity.databaseObservedAt)
    ) {
      throw new Error("operational_browser_read_database_drift");
    }
    const receipt = createBrowserPrivateReadReceipt(
      browserReadContext,
      finalIdentity,
      browserRead
    );
    validateM1BOperationalBrowserAppRoleRead(receipt, browserReadContext);
    await client.query("COMMIT");
    return receipt;
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the exact runtime-read failure.
      }
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

async function main() {
  try {
    const browserReadContext = parseM1BOperationalRuntimeReadArguments(
      process.argv.slice(2)
    );
    process.stdout.write(`${JSON.stringify(await readM1BOperationalRuntime({
      ...(browserReadContext === null ? {} : { browserReadContext })
    }))}\n`);
  } catch (error) {
    fail(error?.message ?? "read failed");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
