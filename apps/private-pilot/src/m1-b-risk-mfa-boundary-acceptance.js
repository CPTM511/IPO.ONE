import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  M1_B_RISK_MFA_LIVE_OPERATION_IDS,
  M1_B_RISK_MFA_OPERATION_IDS,
  M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS,
  M1_B_RISK_MFA_PROTECTED_STATE_TABLES
} from "../../../packages/release-governance/src/m1-b-acceptance-evidence.js";
import {
  ActorType,
  ClientAuthenticationMethod,
  InMemoryActorDirectory,
  InMemoryAuthenticationEventStore,
  InMemoryCredentialRegistry,
  SenderConstraintMethod,
  createReferenceHasher
} from "../../../modules/authentication/src/index.js";
import {
  createAuthenticationContext
} from "../../../modules/authentication/src/authentication-context.js";
import {
  AUTHORIZATION_POLICY_VERSION,
  AuthorizationPolicyRegistry,
  AuthorizationService,
  InMemoryAuthorizationAuditStore,
  InMemoryAuthorizationDirectory,
  InMemoryLivePolicyAdapter,
  RoleBundle
} from "../../../modules/authorization/src/index.js";
import {
  createTenantSecurityContext
} from "../../../modules/persistence/src/index.js";
import {
  createM1BAcceptanceAppPool,
  withM1BAcceptanceTenantRead as withTenantRead
} from "./m1-b-acceptance-postgres.js";

const EXACT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/%-]{1,255}$/;
const ACCEPTED_WALLET_VERIFICATION_METHODS = new Set([
  "eip191_eoa_v1",
  "eip1271_eip191_v1",
  "eip6492_eip191_v1"
]);
const RISK_ACTOR_ID = "actor_risk_operations_pilot";
const REGRESSION_TEST_NAME =
  "SIWE-only Risk and Operations sessions fail closed for every recent-MFA policy";
const REGRESSION_TEST_COMMAND =
  "node --test --test-name-pattern 'SIWE-only Risk and Operations sessions fail closed for every recent-MFA policy' modules/authorization/test/authorization-service.test.js";
const REGRESSION_SOURCE_PATHS = Object.freeze([
  "apps/private-pilot/src/m1-b-risk-mfa-boundary-acceptance.js",
  "apps/private-pilot/src/m1-b-acceptance-postgres.js",
  "scripts/local-risk-mfa-boundary-acceptance.mjs",
  "scripts/m1-b-agent-phase-receipt.mjs",
  "modules/authorization/src/authorization-policy.js",
  "modules/authorization/src/authorization-service.js",
  "modules/authorization/test/authorization-service.test.js"
]);
const FIXED_REGRESSION_TIME = new Date("2026-08-14T00:00:00.000Z");
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;
const DEFAULT_POLL_INTERVAL_MS = 500;
const RISK_BOUNDARY_ARM_TTL_MS = 15 * 60 * 1_000;
const RISK_BOUNDARY_CHALLENGE =
  /^m1_b_risk_boundary_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const M1_B_RISK_BOUNDARY_RESPONSE_ARM_SCHEMA_VERSION =
  "m1_b_risk_boundary_response_arm.v1";

export class M1BRiskMfaBoundaryAcceptanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BRiskMfaBoundaryAcceptanceError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BRiskMfaBoundaryAcceptanceError(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function iso(value, code = "invalid_risk_boundary_time") {
  const date = value instanceof Date ? value : new Date(value);
  assert(Number.isFinite(date.getTime()), code, "Risk boundary time is invalid");
  return date.toISOString();
}

function exactKeys(value, keys) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function stringList(value, code, label) {
  assert(
    Array.isArray(value) &&
    value.length <= 64 &&
    value.every((entry) => typeof entry === "string") &&
    new Set(value).size === value.length,
    code,
    `${label} must be a unique string list`
  );
  return value;
}

function sameStringValues(left, right) {
  return left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function liveRiskMfaPolicies() {
  const registry = new AuthorizationPolicyRegistry();
  const policies = M1_B_RISK_MFA_LIVE_OPERATION_IDS.map((operationId) => {
    const policy = registry.getAuthenticated(operationId);
    assert(
      policy &&
      policy.allowedActorTypes.includes(ActorType.RISK_OPERATOR) &&
      policy.requiresRecentMfaActorTypes.includes(ActorType.RISK_OPERATOR),
      "risk_boundary_policy_invalid",
      `Live Risk MFA policy is invalid for ${operationId}`
    );
    return policy;
  });
  return Object.freeze(policies);
}

function protectedRecentMfaActorTypes() {
  const registry = new AuthorizationPolicyRegistry();
  const actorTypes = [...new Set(
    M1_B_RISK_MFA_OPERATION_IDS.flatMap((operationId) => {
      const policy = registry.getAuthenticated(operationId);
      assert(
        policy && policy.requiresRecentMfaActorTypes.length >= 1,
        "risk_boundary_policy_invalid",
        `Protected Risk MFA policy is invalid for ${operationId}`
      );
      return policy.requiresRecentMfaActorTypes;
    })
  )].sort();
  assert(
    JSON.stringify(actorTypes) === JSON.stringify([
      ActorType.AUDITOR,
      ActorType.OPERATIONS_OPERATOR,
      ActorType.RISK_OPERATOR
    ].sort()),
    "risk_boundary_policy_invalid",
    "Protected recent-MFA actor-type union drifted"
  );
  return Object.freeze(actorTypes);
}

async function readActiveProtectedIdentityBoundary(client, tenantId) {
  const protectedActorTypes = protectedRecentMfaActorTypes();
  const memberships = await client.query(
    `SELECT m.actor_id, a.actor_type::text AS actor_type, m.role_bundle,
            m.capabilities, m.client_ids, m.policy_version
       FROM memberships m
       JOIN actors a ON a.id = m.actor_id
      WHERE m.tenant_id = $1
        AND a.actor_type::text = ANY($2::text[])
        AND a.status = 'active'
        AND m.status = 'active'
        AND m.valid_from <= clock_timestamp()
        AND (m.expires_at IS NULL OR m.expires_at > clock_timestamp())
      ORDER BY a.actor_type::text, m.actor_id, m.role_bundle`,
    [tenantId, protectedActorTypes]
  );
  assert(
    memberships.rowCount === 1 &&
    memberships.rows[0].actor_id === RISK_ACTOR_ID &&
    memberships.rows[0].actor_type === ActorType.RISK_OPERATOR &&
    memberships.rows[0].role_bundle === RoleBundle.RISK_OPERATOR &&
    memberships.rows[0].policy_version === AUTHORIZATION_POLICY_VERSION,
    "risk_boundary_privileged_identity_set_invalid",
    "The active protected actor set must equal the one reviewed local Risk identity with no Operations or Auditor actor"
  );
  const membership = memberships.rows[0];
  const membershipCapabilities = stringList(
    membership.capabilities,
    "risk_boundary_privileged_identity_set_invalid",
    "Protected membership capabilities"
  );
  const membershipClientIds = stringList(
    membership.client_ids,
    "risk_boundary_privileged_identity_set_invalid",
    "Protected membership client IDs"
  );
  const credentials = await client.query(
    `SELECT actor_id, actor_type::text AS actor_type, client_id,
            client_authentication_method AS method, roles,
            allowed_capabilities, policy_version
       FROM authentication_credentials
      WHERE tenant_id = $1
        AND actor_id = ANY($2::text[])
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > clock_timestamp())
      ORDER BY actor_type::text, actor_id, client_id, client_authentication_method`,
    [tenantId, memberships.rows.map((entry) => entry.actor_id)]
  );
  assert(
    credentials.rowCount >= 1,
    "risk_boundary_privileged_identity_set_invalid",
    "The reviewed active protected identity requires an active credential"
  );
  for (const credential of credentials.rows) {
    const roles = stringList(
      credential.roles,
      "risk_boundary_privileged_identity_set_invalid",
      "Protected credential roles"
    );
    const capabilities = stringList(
      credential.allowed_capabilities,
      "risk_boundary_privileged_identity_set_invalid",
      "Protected credential capabilities"
    );
    assert(
      credential.actor_id === RISK_ACTOR_ID &&
      credential.actor_type === ActorType.RISK_OPERATOR &&
      membershipClientIds.includes(credential.client_id) &&
      sameStringValues(roles, [RoleBundle.RISK_OPERATOR]) &&
      capabilities.every((capability) =>
        membershipCapabilities.includes(capability)
      ) &&
      credential.policy_version === AUTHORIZATION_POLICY_VERSION,
      "risk_boundary_privileged_identity_set_invalid",
      "Every active protected credential must bind to the reviewed membership, client, role, capabilities, and policy"
    );
  }
  const activeAuthenticationMethods = Object.freeze(
    [...new Set(credentials.rows.map(({ method }) => method))].sort()
  );
  const nonSiweActiveCredentialCount = credentials.rows.filter(
    ({ method }) => method !== ClientAuthenticationMethod.SIWE
  ).length;
  assert(
    JSON.stringify(activeAuthenticationMethods) ===
      JSON.stringify([ClientAuthenticationMethod.SIWE]) &&
    nonSiweActiveCredentialCount === 0,
    "risk_boundary_weak_credential_available",
    "No active Risk, Operations, or Auditor membership may expose a non-SIWE credential path"
  );
  const activeMembershipCountsByActorType = Object.freeze(Object.fromEntries(
    protectedActorTypes.map((actorType) => [
      actorType,
      memberships.rows.filter((entry) => entry.actor_type === actorType).length
    ])
  ));
  return Object.freeze({
    protectedActorTypes,
    activeMembershipCountsByActorType,
    activeCredentialCount: credentials.rowCount,
    activeAuthenticationMethods,
    nonSiweActiveCredentialCount,
    reviewedActiveIdentitySetVerified: true
  });
}

function createRiskTenantContext(tenantId) {
  return createTenantSecurityContext({
    tenantId,
    actorId: RISK_ACTOR_ID,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    source: "local_test"
  });
}

function assertOperationSet(actual) {
  assert(
    JSON.stringify(actual) === JSON.stringify(M1_B_RISK_MFA_OPERATION_IDS),
    "risk_mfa_policy_set_drifted",
    "Authorization policy-derived recent-MFA operation set drifted"
  );
}

function createRegressionHarness() {
  const referenceHasher = createReferenceHasher(
    Buffer.from("ipo-one-m1-b-risk-mfa-regression-key")
  );
  const actorDirectory = new InMemoryActorDirectory();
  const credentialRegistry = new InMemoryCredentialRegistry({
    referenceHasher,
    eventStore: new InMemoryAuthenticationEventStore(),
    actorDirectory
  });
  const directory = new InMemoryAuthorizationDirectory();
  const auditStore = new InMemoryAuthorizationAuditStore({ maximumEvents: 256 });
  const policyRegistry = new AuthorizationPolicyRegistry();
  const service = new AuthorizationService({
    policyRegistry,
    directory,
    credentialRegistry,
    auditStore,
    referenceHasher,
    livePolicyAdapter: new InMemoryLivePolicyAdapter()
  });
  return {
    actorDirectory,
    auditStore,
    credentialRegistry,
    directory,
    policyRegistry,
    referenceHasher,
    service
  };
}

function registerRegressionActor(harness, profile, protectedPolicies) {
  const capabilities = [...new Set(
    protectedPolicies
      .filter((policy) => policy.requiresRecentMfaActorTypes.includes(profile.actorType))
      .map((policy) => policy.requiredCapability)
  )];
  const tenantId = "tenant_m1_b_risk_mfa_regression";
  const clientId = `client_${profile.actorId}`;
  harness.actorDirectory.register({
    actorId: profile.actorId,
    actorType: profile.actorType
  });
  const credential = harness.credentialRegistry.register({
    tenantId,
    actorId: profile.actorId,
    actorType: profile.actorType,
    issuer: "https://issuer.local.test",
    externalSubject: `eip155:84532:${profile.walletAddress}`,
    clientId,
    clientAuthenticationMethod: ClientAuthenticationMethod.SIWE,
    senderConstraint: {
      method: SenderConstraintMethod.HOST_SESSION,
      thumbprint: "t".repeat(43)
    },
    roles: [profile.roleBundle],
    allowedCapabilities: capabilities,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    performedByActorId: "actor_m1_b_security_regression",
    reasonCode: "local_authorization_fixture",
    now: FIXED_REGRESSION_TIME
  });
  harness.directory.registerMembership({
    tenantId,
    actorId: profile.actorId,
    actorType: profile.actorType,
    roleBundle: profile.roleBundle,
    capabilities,
    clientIds: [clientId],
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    validFrom: FIXED_REGRESSION_TIME,
    now: FIXED_REGRESSION_TIME
  });
  return createAuthenticationContext({
    tenantId,
    actorId: profile.actorId,
    actorType: profile.actorType,
    clientId,
    credentialId: credential.credentialId,
    credentialVersion: credential.version,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    capabilities,
    roles: [profile.roleBundle],
    tokenJtiHash: harness.referenceHasher.hash("token.jti", `jti_${profile.actorId}`),
    authenticationMethod: ClientAuthenticationMethod.SIWE,
    senderConstraintMethod: SenderConstraintMethod.HOST_SESSION,
    authenticatedAt: FIXED_REGRESSION_TIME,
    authTime: FIXED_REGRESSION_TIME,
    acr: "urn:ipo.one:acr:wallet",
    amr: ["wallet", "siwe", "eip191_eoa_v1"]
  });
}

function normalizeRegressionSourceFiles(sourceFiles) {
  assert(
    Array.isArray(sourceFiles) &&
    sourceFiles.length === REGRESSION_SOURCE_PATHS.length,
    "risk_mfa_regression_source_unbound",
    "Exact-source authorization regression source digests are required"
  );
  return Object.freeze(sourceFiles.map((sourceFile, index) => {
    assert(
      exactKeys(sourceFile, ["path", "sha256"]) &&
      sourceFile.path === REGRESSION_SOURCE_PATHS[index] &&
      SHA256.test(sourceFile.sha256 ?? ""),
      "risk_mfa_regression_source_unbound",
      `Authorization regression source digest is invalid for ${REGRESSION_SOURCE_PATHS[index]}`
    );
    return Object.freeze({
      path: sourceFile.path,
      sha256: sourceFile.sha256
    });
  }));
}

export async function runM1BRiskMfaAuthorizationRegression({
  testOutputSha256,
  sourceFiles
} = {}) {
  assert(
    SHA256.test(testOutputSha256 ?? ""),
    "risk_mfa_regression_test_unbound",
    "Exact-source authorization regression test output digest is required"
  );
  const normalizedSourceFiles = normalizeRegressionSourceFiles(sourceFiles);
  const harness = createRegressionHarness();
  const protectedPolicies = harness.policyRegistry.list()
    .filter((policy) => policy.requiresRecentMfaActorTypes.some((actorType) =>
      [ActorType.RISK_OPERATOR, ActorType.OPERATIONS_OPERATOR].includes(actorType)
    ))
    .sort((left, right) => left.operationId.localeCompare(right.operationId));
  const operationIds = protectedPolicies.map(({ operationId }) => operationId);
  assertOperationSet(operationIds);
  const contexts = new Map();
  for (const profile of [
    {
      actorType: ActorType.RISK_OPERATOR,
      roleBundle: RoleBundle.RISK_OPERATOR,
      actorId: "actor_m1_b_risk_regression",
      walletAddress: `0x${"1".repeat(40)}`
    },
    {
      actorType: ActorType.OPERATIONS_OPERATOR,
      roleBundle: RoleBundle.OPERATIONS_OPERATOR,
      actorId: "actor_m1_b_operations_regression",
      walletAddress: `0x${"2".repeat(40)}`
    }
  ]) {
    contexts.set(
      profile.actorType,
      registerRegressionActor(harness, profile, protectedPolicies)
    );
  }
  const denials = [];
  for (const policy of protectedPolicies) {
    const actorType = policy.requiresRecentMfaActorTypes.includes(ActorType.RISK_OPERATOR)
      ? ActorType.RISK_OPERATOR
      : ActorType.OPERATIONS_OPERATOR;
    let denied = false;
    try {
      await harness.service.authorize({
        authenticationContext: contexts.get(actorType),
        operationId: policy.operationId,
        requestId: `request_m1_b_${policy.operationId}`,
        correlationId: `correlation_m1_b_${policy.operationId}`,
        commandPayloadHash: hashId("m1_b_risk_mfa_regression", {
          operationId: policy.operationId
        }),
        now: FIXED_REGRESSION_TIME
      });
    } catch (error) {
      denied = error?.code === "authorization_denied";
    }
    assert(
      denied,
      "risk_mfa_regression_allowed",
      `Authorization regression did not deny ${policy.operationId}`
    );
    const audit = harness.auditStore.list().at(-1);
    assert(
      audit?.operationId === policy.operationId &&
      audit.authorizationDecision === "deny" &&
      audit.reasonCode === "actor_capability_rejected",
      "risk_mfa_regression_audit_invalid",
      `Authorization regression audit is invalid for ${policy.operationId}`
    );
    denials.push(Object.freeze({
      operationId: policy.operationId,
      actorType,
      authorizationDecision: "deny",
      reasonCode: "actor_capability_rejected",
      additionalEffectCount: 0
    }));
  }
  const allowCount = harness.auditStore.list({ authorizationDecision: "allow" }).length;
  assert(allowCount === 0, "risk_mfa_regression_allowed", "Regression recorded an allow");
  const resultSha256 = sha256(JSON.stringify({ operationIds, denials, allowCount }));
  return Object.freeze({
    provenance: "exact_source_authorization_service",
    testName: REGRESSION_TEST_NAME,
    testCommand: REGRESSION_TEST_COMMAND,
    testOutputSha256,
    sourceFiles: normalizedSourceFiles,
    operationIds: Object.freeze(operationIds),
    denials: Object.freeze(denials),
    allowCount,
    resultSha256,
    passed: true
  });
}

export function hashM1BRiskProtectedStateSnapshots(tableSnapshots) {
  assert(
    Array.isArray(tableSnapshots) &&
    tableSnapshots.length === M1_B_RISK_MFA_PROTECTED_STATE_TABLES.length,
    "risk_protected_state_catalog_invalid",
    "Protected-state snapshot does not cover the exact table catalog"
  );
  const digest = createHash("sha256");
  tableSnapshots.forEach((entry, index) => {
    const expectedTable = M1_B_RISK_MFA_PROTECTED_STATE_TABLES[index];
    assert(
      exactKeys(entry, ["tableName", "rowCount", "canonicalRows"]) &&
      entry.tableName === expectedTable &&
      Number.isSafeInteger(entry.rowCount) &&
      entry.rowCount >= 0 &&
      typeof entry.canonicalRows === "string",
      "risk_protected_state_snapshot_invalid",
      `Protected-state snapshot is invalid for ${expectedTable}`
    );
    digest.update(entry.tableName);
    digest.update("\0");
    digest.update(String(entry.rowCount));
    digest.update("\0");
    digest.update(entry.canonicalRows);
    digest.update("\0");
  });
  return `0x${digest.digest("hex")}`;
}

export async function captureM1BRiskProtectedState(pool, tenantContext) {
  return withTenantRead(pool, tenantContext, async (client) => {
    const tableSnapshots = [];
    for (const tableName of M1_B_RISK_MFA_PROTECTED_STATE_TABLES) {
      assert(
        /^[a-z][a-z0-9_]{1,95}$/.test(tableName),
        "risk_protected_state_catalog_invalid",
        "Protected-state table name is invalid"
      );
      const result = await client.query(
        `SELECT count(*)::integer AS row_count,
                COALESCE(
                  jsonb_agg(row_json ORDER BY row_json::text),
                  '[]'::jsonb
                )::text AS canonical_rows
           FROM (
             SELECT to_jsonb(source_row) AS row_json
               FROM "${tableName}" AS source_row
           ) AS protected_rows`
      );
      tableSnapshots.push({
        tableName,
        rowCount: Number(result.rows[0].row_count),
        canonicalRows: result.rows[0].canonical_rows
      });
    }
    const rowCounts = Object.freeze(Object.fromEntries(
      Object.keys(M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS).map((tableName) => {
        const rowCount = tableSnapshots.find((entry) =>
          entry.tableName === tableName
        )?.rowCount;
        assert(
          Number.isSafeInteger(rowCount) &&
          rowCount >= M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS[tableName],
          "risk_protected_state_trivial",
          `Protected-state baseline is trivial for ${tableName}`
        );
        return [tableName, rowCount];
      })
    ));
    return Object.freeze({
      catalogVersion: "m1_b_risk_protected_state.v1",
      tableNames: M1_B_RISK_MFA_PROTECTED_STATE_TABLES,
      minimumRowCounts: M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS,
      observedRowCounts: rowCounts,
      hash: hashM1BRiskProtectedStateSnapshots(tableSnapshots)
    });
  });
}

function requestToken(prefix, createUuid = randomUUID) {
  return `${prefix}_${createUuid()}`;
}

export function deriveM1BRiskBoundaryFreezeIdempotencyKey(challenge) {
  assert(
    RISK_BOUNDARY_CHALLENGE.test(challenge ?? ""),
    "risk_boundary_challenge_invalid",
    "Risk boundary arm challenge is invalid"
  );
  return challenge.replace(
    "m1_b_risk_boundary_",
    "idempotency_m1b_risk_freeze_"
  );
}

export function createM1BRiskBoundaryResponseArm({
  subjectId,
  now = new Date(),
  createUuid = randomUUID
} = {}) {
  assert(
    IDENTIFIER.test(subjectId ?? "") && typeof createUuid === "function",
    "risk_boundary_scope_invalid",
    "Risk boundary arm requires the exact reviewed Subject"
  );
  const issuedAt = iso(now);
  const challenge = `m1_b_risk_boundary_${createUuid()}`;
  assert(
    RISK_BOUNDARY_CHALLENGE.test(challenge),
    "risk_boundary_challenge_invalid",
    "Risk boundary arm challenge is invalid"
  );
  const read = Object.freeze({
    operationId: "pilotReadTenantRiskPortfolioReference",
    payload: Object.freeze({}),
    requestId: requestToken("request_m1_b_risk_read", createUuid),
    correlationId: requestToken("correlation_m1_b_risk_boundary", createUuid),
    schemaVersion: "tenant_protocol_request.v1"
  });
  const freeze = Object.freeze({
    operationId: "pilotFreezeSubject",
    payload: Object.freeze({}),
    resource: Object.freeze({ resourceType: "subject", resourceId: subjectId }),
    reasonCode: "security_incident",
    idempotencyKey: deriveM1BRiskBoundaryFreezeIdempotencyKey(challenge),
    requestId: requestToken("request_m1_b_risk_freeze", createUuid),
    correlationId: requestToken("correlation_m1_b_risk_boundary", createUuid),
    schemaVersion: "tenant_protocol_request.v1"
  });
  const requestIdentities = [
    read.requestId,
    read.correlationId,
    freeze.requestId,
    freeze.correlationId
  ];
  assert(
    requestIdentities.every((value) => IDENTIFIER.test(value)) &&
      new Set(requestIdentities).size === requestIdentities.length,
    "risk_boundary_request_identity_invalid",
    "Risk boundary request and correlation identities must be valid and distinct"
  );
  const requestPlan = Object.freeze({ read, freeze });
  const armToken = Object.freeze({
    schemaVersion: M1_B_RISK_BOUNDARY_RESPONSE_ARM_SCHEMA_VERSION,
    challenge,
    issuedAt,
    expiresAt: new Date(
      Date.parse(issuedAt) + RISK_BOUNDARY_ARM_TTL_MS
    ).toISOString(),
    flow: "risk_mfa_boundary",
    actorRole: "risk_operations",
    authenticationMethod: "siwe",
    authenticationProfile: "local_no_funds",
    hostWorkspaceName: "risk",
    responseSchemaVersion: "problem_details.v1",
    operationIds: Object.freeze([
      read.operationId,
      freeze.operationId
    ]),
    subjectId,
    reasonCode: freeze.reasonCode,
    readRequestId: read.requestId,
    readCorrelationId: read.correlationId,
    freezeRequestId: freeze.requestId,
    freezeCorrelationId: freeze.correlationId
  });
  return Object.freeze({ requestPlan, armToken });
}

export async function waitForM1BRiskBoundaryObservation({
  readObservation,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}) {
  assert(
    typeof readObservation === "function" &&
    Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 &&
    Number.isSafeInteger(pollIntervalMs) && pollIntervalMs >= 1,
    "risk_boundary_poll_invalid",
    "Risk boundary polling configuration is invalid"
  );
  const deadline = now() + timeoutMs;
  while (now() <= deadline) {
    const observation = await readObservation();
    if (observation?.complete === true) return observation;
    await sleep(pollIntervalMs);
  }
  fail(
    "risk_boundary_observation_timeout",
    "Timed out before the fresh Risk SIWE read and mutation denials were observed"
  );
}

export async function loadM1BRiskAcceptanceBaseline(pool, {
  expectedDatabaseStartedAt,
  tenantId,
  riskPortfolioId,
  subjectId,
  tenantContext
}) {
  return withTenantRead(pool, tenantContext, async (client) => {
    const runtime = await client.query(
      "SELECT pg_postmaster_start_time() AS database_started_at, clock_timestamp() AS observed_at"
    );
    const databaseStartedAt = iso(runtime.rows[0]?.database_started_at);
    assert(
      databaseStartedAt === expectedDatabaseStartedAt,
      "risk_boundary_restart_linkage_mismatch",
      "PostgreSQL restart time does not match the exact Agent recovery marker"
    );
    const protectedIdentityBoundary =
      await readActiveProtectedIdentityBoundary(client, tenantId);
    const resources = await client.query(
      `SELECT resource_type, resource_id
         FROM authorization_resources
        WHERE tenant_id = $1
          AND status = 'active'
          AND (
            (resource_type = 'risk_portfolio' AND resource_id = $2)
            OR
            (resource_type = 'subject' AND resource_id = $3)
          )
        ORDER BY resource_type`,
      [tenantId, riskPortfolioId, subjectId]
    );
    assert(
      resources.rowCount === 2 &&
      resources.rows.some((resource) =>
        resource.resource_type === "risk_portfolio" &&
        resource.resource_id === riskPortfolioId
      ) &&
      resources.rows.some((resource) =>
        resource.resource_type === "subject" &&
        resource.resource_id === subjectId
      ),
      "risk_boundary_resource_unavailable",
      "The reviewed Risk portfolio and Agent Subject resources are required"
    );
    const subject = await client.query(
      `SELECT id, subject_type::text AS subject_type, status::text AS status
         FROM subjects
        WHERE id = $1 AND tenant_id = $2`,
      [subjectId, tenantId]
    );
    assert(
      subject.rowCount === 1 &&
      subject.rows[0].subject_type === "agent" &&
      subject.rows[0].status === "active",
      "risk_boundary_subject_unavailable",
      "The exact post-restart Agent Subject must be active"
    );
    const pendingOutbox = await client.query(
      `SELECT count(*)::integer AS count
         FROM outbox_messages
        WHERE published_at IS NULL AND dead_lettered_at IS NULL`
    );
    assert(
      Number(pendingOutbox.rows[0]?.count) === 0,
      "risk_boundary_runtime_not_quiescent",
      "Protected-state capture requires a drained synthetic outbox"
    );
    return Object.freeze({
      databaseStartedAt,
      observedAt: iso(runtime.rows[0].observed_at),
      tenantId,
      actorId: RISK_ACTOR_ID,
      portfolioId: riskPortfolioId,
      subjectId,
      protectedIdentityBoundary
    });
  });
}

export async function readM1BRiskLiveObservation(
  pool,
  tenantContext,
  baseline,
  requestPlan
) {
  return withTenantRead(pool, tenantContext, async (client) => {
    const policies = liveRiskMfaPolicies();
    const requiredCapabilities = Object.freeze(
      policies.map((policy) => policy.requiredCapability)
    );
    assert(
      new Set(requiredCapabilities).size === requiredCapabilities.length,
      "risk_boundary_policy_invalid",
      "Live Risk MFA policies must require distinct capabilities"
    );
    const sessions = await client.query(
      `SELECT s.actor_id, s.actor_type::text AS actor_type, s.client_id,
              s.credential_version AS session_credential_version,
              s.authentication_method, s.sender_constraint_method,
              s.policy_version, s.roles, s.allowed_capabilities AS session_capabilities,
              s.token_jti_ref_hash, s.auth_time, s.acr, s.amr, s.created_at,
              c.actor_id AS credential_actor_id,
              c.actor_type::text AS credential_actor_type,
              c.client_id AS credential_client_id,
              c.client_authentication_method AS credential_method,
              c.sender_constraint_method AS credential_sender_constraint_method,
              c.roles AS credential_roles,
              c.allowed_capabilities AS credential_capabilities,
              c.policy_version AS credential_policy_version,
              c.status::text AS credential_status,
              c.version AS credential_version,
              a.status::text AS actor_status,
              m.role_bundle, m.capabilities AS membership_capabilities,
              m.client_ids AS membership_client_ids,
              m.policy_version AS membership_policy_version,
              m.status::text AS membership_status,
              t.status::text AS tenant_status
         FROM authentication_sessions s
         JOIN authentication_credentials c
           ON c.tenant_id = s.tenant_id AND c.id = s.credential_id
         JOIN actors a ON a.id = s.actor_id
         JOIN memberships m
           ON m.tenant_id = s.tenant_id
          AND m.actor_id = s.actor_id
          AND m.role_bundle = 'risk_operator'
         JOIN tenants t ON t.id = s.tenant_id
        WHERE s.tenant_id = $1
          AND s.actor_id = $2
          AND s.actor_type = 'risk_operator'
          AND s.authentication_method = 'siwe'
          AND s.status = 'active'
          AND s.created_at >= $3::timestamptz
          AND s.idle_expires_at > clock_timestamp()
          AND s.absolute_expires_at > clock_timestamp()
          AND (c.expires_at IS NULL OR c.expires_at > clock_timestamp())
          AND m.valid_from <= clock_timestamp()
          AND (m.expires_at IS NULL OR m.expires_at > clock_timestamp())
        ORDER BY s.created_at DESC`,
      [baseline.tenantId, baseline.actorId, baseline.observedAt]
    );
    if (sessions.rowCount === 0) return Object.freeze({ complete: false });
    assert(
      sessions.rowCount === 1,
      "risk_boundary_session_ambiguous",
      "Exactly one fresh active Risk SIWE session is required"
    );
    const session = sessions.rows[0];
    const amr = stringList(
      session.amr,
      "risk_boundary_session_assurance_invalid",
      "Risk session AMR"
    );
    const sessionRoles = stringList(
      session.roles,
      "risk_boundary_session_binding_invalid",
      "Risk session roles"
    );
    const credentialRoles = stringList(
      session.credential_roles,
      "risk_boundary_session_binding_invalid",
      "Risk credential roles"
    );
    const sessionCapabilities = stringList(
      session.session_capabilities,
      "risk_boundary_session_binding_invalid",
      "Risk session capabilities"
    );
    const credentialCapabilities = stringList(
      session.credential_capabilities,
      "risk_boundary_session_binding_invalid",
      "Risk credential capabilities"
    );
    const membershipCapabilities = stringList(
      session.membership_capabilities,
      "risk_boundary_session_binding_invalid",
      "Risk membership capabilities"
    );
    const membershipClientIds = stringList(
      session.membership_client_ids,
      "risk_boundary_session_binding_invalid",
      "Risk membership client IDs"
    );
    assert(
      session.actor_id === baseline.actorId &&
      session.credential_actor_id === baseline.actorId &&
      session.actor_type === ActorType.RISK_OPERATOR &&
      session.credential_actor_type === ActorType.RISK_OPERATOR &&
      session.authentication_method === "siwe" &&
      session.credential_method === "siwe" &&
      session.sender_constraint_method === "host_session" &&
      session.credential_sender_constraint_method === "host_session" &&
      session.policy_version === AUTHORIZATION_POLICY_VERSION &&
      session.credential_policy_version === AUTHORIZATION_POLICY_VERSION &&
      session.membership_policy_version === AUTHORIZATION_POLICY_VERSION &&
      session.credential_status === "active" &&
      Number(session.session_credential_version) === Number(session.credential_version) &&
      Number(session.credential_version) >= 1 &&
      session.actor_status === "active" &&
      session.membership_status === "active" &&
      session.tenant_status === "active" &&
      session.role_bundle === RoleBundle.RISK_OPERATOR &&
      sameStringValues(sessionRoles, [RoleBundle.RISK_OPERATOR]) &&
      sameStringValues(credentialRoles, [RoleBundle.RISK_OPERATOR]) &&
      session.client_id === session.credential_client_id &&
      membershipClientIds.includes(session.client_id) &&
      sameStringValues(sessionCapabilities, credentialCapabilities) &&
      credentialCapabilities.every((capability) =>
        membershipCapabilities.includes(capability)
      ) &&
      requiredCapabilities.every((capability) =>
        sessionCapabilities.includes(capability) &&
        credentialCapabilities.includes(capability) &&
        membershipCapabilities.includes(capability)
      ) &&
      session.acr === "urn:ipo.one:acr:wallet" &&
      new Date(session.auth_time).getTime() >= new Date(baseline.observedAt).getTime() &&
      new Date(session.auth_time).getTime() <= new Date(session.created_at).getTime() &&
      amr.length === 3 &&
      amr[0] === "wallet" &&
      amr[1] === "siwe" &&
      ACCEPTED_WALLET_VERIFICATION_METHODS.has(amr[2]),
      "risk_boundary_session_assurance_invalid",
      "Fresh Risk session does not prove the exact SIWE role, capability, client, and policy bindings"
    );
    const protectedIdentityBoundary =
      await readActiveProtectedIdentityBoundary(client, baseline.tenantId);
    assert(
      JSON.stringify(protectedIdentityBoundary) ===
        JSON.stringify(baseline.protectedIdentityBoundary),
      "risk_boundary_privileged_identity_set_changed",
      "The active protected identity and credential boundary changed during collection"
    );
    const requestIds = [requestPlan.read.requestId, requestPlan.freeze.requestId];
    const audits = await client.query(
      `SELECT id, occurred_at, request_id, correlation_id, actor_id,
              actor_type, token_jti_hash, operation_id, action,
              resource_type, resource_id, authorization_decision,
              reason_code, policy_version
         FROM authorization_audit_events
        WHERE tenant_id = $1
          AND request_id = ANY($2::text[])
        ORDER BY occurred_at, id`,
      [baseline.tenantId, requestIds]
    );
    assert(
      audits.rowCount <= 2,
      "risk_boundary_audit_ambiguous",
      "Risk boundary request IDs produced duplicate authorization audits"
    );
    if (audits.rowCount < 2) return Object.freeze({ complete: false });
    const auditByRequest = new Map(
      audits.rows.map((audit) => [audit.request_id, audit])
    );
    const checks = [
      [requestPlan.read, "query", "workspace", "resource_pending", policies[0]],
      [requestPlan.freeze, "command", "subject", baseline.subjectId, policies[1]]
    ].map(([request, kind, expectedResourceType, expectedResourceId, policy]) => {
      const audit = auditByRequest.get(request.requestId);
      assert(
        audit &&
        audit.actor_id === baseline.actorId &&
        audit.actor_type === ActorType.RISK_OPERATOR &&
        audit.operation_id === request.operationId &&
        audit.action === policy.action &&
        audit.resource_type === expectedResourceType &&
        audit.resource_id === expectedResourceId &&
        audit.correlation_id === request.correlationId &&
        audit.token_jti_hash === session.token_jti_ref_hash &&
        audit.authorization_decision === "deny" &&
        audit.reason_code === "actor_capability_rejected" &&
        audit.policy_version === AUTHORIZATION_POLICY_VERSION &&
        new Date(audit.occurred_at).getTime() >= new Date(session.created_at).getTime(),
        "risk_boundary_live_audit_invalid",
        `Live Risk denial audit is invalid for ${request.operationId}`
      );
      return Object.freeze({
        operationId: request.operationId,
        kind,
        resourceType: expectedResourceType,
        resourceId: expectedResourceId,
        requestId: request.requestId,
        correlationId: request.correlationId,
        auditEventId: audit.id,
        authorizationDecision: "deny",
        reasonCode: "actor_capability_rejected",
        additionalEffectCount: 0
      });
    });
    return Object.freeze({
      complete: true,
      session: Object.freeze({
        actorType: ActorType.RISK_OPERATOR,
        method: "siwe",
        acr: session.acr,
        amr: Object.freeze([...amr]),
        authTime: iso(session.auth_time),
        createdAt: iso(session.created_at),
        observedAfterRestart: true,
        phishingResistantMfaSatisfied: false,
        sessionMaterialIncluded: false,
        syntheticMfaClaimUsed: false
      }),
      mfaDenialAttribution: Object.freeze({
        requiredCapabilities,
        roleBindingVerified: true,
        policyBindingVerified: true,
        clientBindingVerified: true,
        sessionCredentialMembershipCapabilitiesVerified: true,
        auditCorrelationBindingVerified: true,
        auditSessionTokenBindingVerified: true
      }),
      credentialBoundary: protectedIdentityBoundary,
      checks: Object.freeze(checks)
    });
  });
}

function timeoutFromEnvironment(environment) {
  const raw = environment.IPO_ONE_M1_B_RISK_BOUNDARY_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_TIMEOUT_MS;
  assert(
    /^[1-9][0-9]{4,6}$/.test(raw),
    "risk_boundary_timeout_invalid",
    "Risk boundary timeout must be a canonical millisecond value"
  );
  const value = Number(raw);
  assert(
    Number.isSafeInteger(value) && value >= 30_000 && value <= 15 * 60 * 1_000,
    "risk_boundary_timeout_invalid",
    "Risk boundary timeout must be between 30 seconds and 15 minutes"
  );
  return value;
}

function regressionSourceFilesFromEnvironment(environment) {
  const raw = environment.IPO_ONE_M1_B_AUTH_SOURCE_DIGESTS_JSON;
  assert(
    typeof raw === "string" && raw.length >= 2 && raw.length <= 4_096,
    "risk_mfa_regression_source_unbound",
    "Exact-source authorization regression source digests are required"
  );
  let sourceFiles;
  try {
    sourceFiles = JSON.parse(raw);
  } catch {
    fail(
      "risk_mfa_regression_source_unbound",
      "Exact-source authorization regression source digests are invalid"
    );
  }
  return normalizeRegressionSourceFiles(sourceFiles);
}

export async function produceM1BRiskMfaBoundaryReceipt({
  pool,
  candidateReleaseId,
  expectedDatabaseStartedAt,
  tenantId,
  riskPortfolioId,
  subjectId,
  testOutputSha256,
  sourceFiles,
  runtimeImageId,
  releaseIdentityArtifactSha256,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  announce = (message) => process.stderr.write(`${message}\n`)
}) {
  assert(
    EXACT_SHA.test(candidateReleaseId ?? ""),
    "risk_boundary_candidate_invalid",
    "Exact candidate SHA is required"
  );
  assert(
    /^sha256:[0-9a-f]{64}$/.test(runtimeImageId ?? "") &&
    SHA256.test(releaseIdentityArtifactSha256 ?? ""),
    "risk_boundary_runtime_binding_invalid",
    "Exact tracked-source image and release-identity artifact bindings are required"
  );
  for (const [name, value] of [
    ["tenantId", tenantId],
    ["riskPortfolioId", riskPortfolioId],
    ["subjectId", subjectId]
  ]) {
    assert(
      IDENTIFIER.test(value ?? ""),
      "risk_boundary_scope_invalid",
      `${name} must be an exact reviewed identifier`
    );
  }
  const expectedStart = iso(expectedDatabaseStartedAt);
  const tenantContext = createRiskTenantContext(tenantId);
  const authorizationRegression = await runM1BRiskMfaAuthorizationRegression({
    testOutputSha256,
    sourceFiles
  });
  const baseline = await loadM1BRiskAcceptanceBaseline(pool, {
    expectedDatabaseStartedAt: expectedStart,
    tenantId,
    riskPortfolioId,
    subjectId,
    tenantContext
  });
  const { requestPlan, armToken } = createM1BRiskBoundaryResponseArm({
    subjectId: baseline.subjectId
  });
  const protectedBefore = await captureM1BRiskProtectedState(pool, tenantContext);
  announce(
    "Open the exact-candidate loopback Risk workspace and complete a fresh " +
    "invited-wallet SIWE sign-in. Paste the following one-use 15-minute arm " +
    "token into the visible M1-B Risk boundary controls. Arm submits no " +
    "request; then click Run two fail-closed probes once. Do not use " +
    "DevTools, eval, or a copied fetch expression:\n" +
    JSON.stringify(armToken)
  );
  const live = await waitForM1BRiskBoundaryObservation({
    timeoutMs,
    readObservation: () => readM1BRiskLiveObservation(
      pool,
      tenantContext,
      baseline,
      requestPlan
    )
  });
  const protectedAfter = await captureM1BRiskProtectedState(pool, tenantContext);
  assert(
    protectedAfter.hash === protectedBefore.hash,
    "risk_boundary_protected_state_changed",
    "Protected business state changed during the denied Risk ceremony"
  );
  const executionCount = await withTenantRead(
    pool,
    tenantContext,
    async (client) => {
      const executions = await client.query(
        `SELECT count(*)::integer AS count
           FROM tenant_command_executions
          WHERE tenant_id = $1
            AND actor_id = $2
            AND operation_id = ANY($3::text[])
            AND completed_at >= $4::timestamptz`,
        [
          baseline.tenantId,
          baseline.actorId,
          M1_B_RISK_MFA_LIVE_OPERATION_IDS,
          baseline.observedAt
        ]
      );
      return Number(executions.rows[0]?.count);
    }
  );
  assert(
    executionCount === 0,
    "risk_boundary_command_effect_observed",
    "A denied Risk request produced a command execution"
  );
  const capturedAt = iso(new Date());
  return Object.freeze({
    schemaVersion: "m1_b_risk_mfa_boundary_receipt.v2",
    candidateReleaseId,
    sourceRuntime: "local_exact_commit",
    capturedAt,
    databaseStartedAt: baseline.databaseStartedAt,
    postRestartVerification: true,
    runtimeBinding: Object.freeze({
      buildSource: "tracked_git_archive",
      imageId: runtimeImageId,
      longLivedPilotImageMatch: true,
      longLivedWorkerImageMatch: true,
      releaseIdentityArtifactSha256
    }),
    role: "risk_operations",
    status: "passed_fail_closed",
    releaseLevel: "L1_PUBLIC_SANDBOX",
    policy: Object.freeze({
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      requiresRecentMfaActorTypesPreserved: true,
      protectedOperationIds: M1_B_RISK_MFA_OPERATION_IDS,
      derivation: "authorization_policy_requires_recent_mfa_for_risk_or_operations"
    }),
    authorizationRegression,
    liveRuntimeObservation: Object.freeze({
      provenance: "local_exact_commit_post_restart",
      actorType: ActorType.RISK_OPERATOR,
      observationStartedAt: baseline.observedAt,
      session: live.session,
      operationIds: M1_B_RISK_MFA_LIVE_OPERATION_IDS,
      mfaDenialAttribution: live.mfaDenialAttribution,
      credentialBoundary: live.credentialBoundary,
      checks: live.checks
    }),
    protectedState: Object.freeze({
      catalogVersion: protectedBefore.catalogVersion,
      tableNames: protectedBefore.tableNames,
      minimumRowCounts: protectedBefore.minimumRowCounts,
      observedRowCounts: protectedBefore.observedRowCounts,
      beforeHash: protectedBefore.hash,
      afterHash: protectedAfter.hash,
      privilegedMutationCount: 0,
      additionalEconomicEffectCount: 0
    }),
    exposure: Object.freeze({
      evidenceScope: "local_private_pilot_exact_commit",
      activeRiskAuthenticationMethods:
        live.credentialBoundary.activeAuthenticationMethods,
      nonSiweActiveRiskCredentialCount:
        live.credentialBoundary.nonSiweActiveCredentialCount,
      hostedRiskSurfaceEvaluated: false
    }),
    authority: Object.freeze({
      mfaPolicyWeakened: false,
      privilegedMutationPerformed: false,
      realFundsEnabled: false
    }),
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    })
  });
}

async function main() {
  const candidateReleaseId = process.env.IPO_ONE_M1_B_RELEASE_SHA;
  const expectedDatabaseStartedAt =
    process.env.IPO_ONE_M1_B_EXPECTED_DATABASE_STARTED_AT;
  const tenantId = process.env.IPO_ONE_M1_B_TENANT_ID;
  const riskPortfolioId = process.env.IPO_ONE_M1_B_RISK_PORTFOLIO_ID;
  const subjectId = process.env.IPO_ONE_M1_B_RISK_SUBJECT_ID;
  const testOutputSha256 = process.env.IPO_ONE_M1_B_AUTH_TEST_OUTPUT_SHA256;
  const sourceFiles = regressionSourceFilesFromEnvironment(process.env);
  const runtimeImageId = process.env.IPO_ONE_M1_B_RUNTIME_IMAGE_ID;
  const releaseIdentityArtifactSha256 =
    process.env.IPO_ONE_M1_B_RELEASE_IDENTITY_SHA256;
  const pool = await createM1BAcceptanceAppPool({
    databaseUrl: process.env.DATABASE_URL,
    secretPath: process.env.IPO_ONE_PILOT_DB_SECRET_FILE,
    applicationName: "ipo-one-m1-b-risk-mfa-boundary",
    max: 2
  });
  try {
    const receipt = await produceM1BRiskMfaBoundaryReceipt({
      pool,
      candidateReleaseId,
      expectedDatabaseStartedAt,
      tenantId,
      riskPortfolioId,
      subjectId,
      testOutputSha256,
      sourceFiles,
      runtimeImageId,
      releaseIdentityArtifactSha256,
      timeoutMs: timeoutFromEnvironment(process.env)
    });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof M1BRiskMfaBoundaryAcceptanceError
      ? error.code
      : "risk_boundary_producer_failed";
    process.stderr.write(`M1-B Risk MFA boundary producer failed: ${code}\n`);
    process.exitCode = 1;
  });
}
