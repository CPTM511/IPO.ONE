import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS,
  M1_B_RISK_MFA_OPERATION_IDS,
  M1_B_RISK_MFA_PROTECTED_STATE_TABLES
} from "../../../packages/release-governance/src/m1-b-acceptance-evidence.js";
import { createTenantSecurityContext } from "../../../modules/persistence/src/index.js";
import {
  M1BAcceptancePostgresError,
  readExistingM1BAcceptanceDatabaseRoleSecret
} from "../src/m1-b-acceptance-postgres.js";
import {
  M1BRiskMfaBoundaryAcceptanceError,
  captureM1BRiskProtectedState,
  createM1BRiskBoundaryResponseArm,
  deriveM1BRiskBoundaryFreezeIdempotencyKey,
  hashM1BRiskProtectedStateSnapshots,
  loadM1BRiskAcceptanceBaseline,
  readM1BRiskLiveObservation,
  runM1BRiskMfaAuthorizationRegression,
  waitForM1BRiskBoundaryObservation
} from "../src/m1-b-risk-mfa-boundary-acceptance.js";
import {
  assertRiskProducerArguments,
  assertRiskProducerSourceDigestsUnchanged,
  createRiskProducerArguments,
  resolveRiskRuntimeImageIdentity
} from "../../../scripts/local-risk-mfa-boundary-acceptance.mjs";

const REGRESSION_SOURCE_PATHS = Object.freeze([
  "apps/private-pilot/src/m1-b-risk-mfa-boundary-acceptance.js",
  "apps/private-pilot/src/m1-b-acceptance-postgres.js",
  "scripts/local-risk-mfa-boundary-acceptance.mjs",
  "scripts/m1-b-agent-phase-receipt.mjs",
  "modules/authorization/src/authorization-policy.js",
  "modules/authorization/src/authorization-service.js",
  "modules/authorization/test/authorization-service.test.js"
]);

async function regressionSourceFiles() {
  return Promise.all(REGRESSION_SOURCE_PATHS.map(async (path) => ({
    path,
    sha256: createHash("sha256")
      .update(await readFile(new URL(`../../../${path}`, import.meta.url)))
      .digest("hex")
  })));
}

function tenantContext() {
  return createTenantSecurityContext({
    tenantId: "tenant_local_private_pilot",
    actorId: "actor_risk_operations_pilot",
    policyVersion: "security_001.v1",
    source: "local_test"
  });
}

function protectedIdentityBoundary() {
  return {
    protectedActorTypes: ["auditor", "operations_operator", "risk_operator"],
    activeMembershipCountsByActorType: {
      auditor: 0,
      operations_operator: 0,
      risk_operator: 1
    },
    activeCredentialCount: 1,
    activeAuthenticationMethods: ["siwe"],
    nonSiweActiveCredentialCount: 0,
    reviewedActiveIdentitySetVerified: true
  };
}

function protectedMembershipRow(actorType = "risk_operator") {
  return {
    actor_id: actorType === "risk_operator"
      ? "actor_risk_operations_pilot"
      : `actor_${actorType}_unexpected`,
    actor_type: actorType,
    role_bundle: actorType,
    capabilities: ["risk.read.tenant", "risk.freeze"],
    client_ids: [actorType === "risk_operator"
      ? "client_risk_operations_pilot"
      : `client_${actorType}_unexpected`],
    policy_version: "security_001.v1"
  };
}

function protectedCredentialRow(method = "siwe") {
  return {
    actor_id: "actor_risk_operations_pilot",
    actor_type: "risk_operator",
    client_id: "client_risk_operations_pilot",
    method,
    roles: ["risk_operator"],
    allowed_capabilities: ["risk.read.tenant", "risk.freeze"],
    policy_version: "security_001.v1"
  };
}

function fakePool(responder) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (
        sql.startsWith("BEGIN") ||
        sql === "COMMIT" ||
        sql === "ROLLBACK" ||
        sql.includes("set_config('app.tenant_id'")
      ) return { rowCount: 0, rows: [] };
      return responder(sql, params);
    },
    release() {}
  };
  return {
    calls,
    async connect() {
      return client;
    }
  };
}

function protectedSnapshots(overrides = {}) {
  return M1_B_RISK_MFA_PROTECTED_STATE_TABLES.map((tableName) => ({
    tableName,
    rowCount: overrides[tableName]?.rowCount ?? 1,
    canonicalRows: overrides[tableName]?.canonicalRows ??
      `[{"table":"${tableName}","version":1}]`
  }));
}

test("Risk MFA producer executes the exact-source exhaustive AuthorizationService regression", async () => {
  const regression = await runM1BRiskMfaAuthorizationRegression({
    testOutputSha256: "a".repeat(64),
    sourceFiles: await regressionSourceFiles()
  });
  assert.equal(regression.provenance, "exact_source_authorization_service");
  assert.deepEqual(regression.operationIds, M1_B_RISK_MFA_OPERATION_IDS);
  assert.equal(regression.denials.length, 21);
  assert.equal(regression.allowCount, 0);
  assert.equal(regression.passed, true);
  assert.match(regression.resultSha256, /^[0-9a-f]{64}$/);
  assert.equal(regression.sourceFiles.length, 7);
  assert.equal(regression.denials.every((denial) =>
    denial.authorizationDecision === "deny" &&
    denial.reasonCode === "actor_capability_rejected" &&
    denial.additionalEffectCount === 0
  ), true);
});

test("protected-state hash covers the exact catalog and changes on tamper", () => {
  const baseline = protectedSnapshots();
  const beforeHash = hashM1BRiskProtectedStateSnapshots(baseline);
  assert.match(beforeHash, /^0x[0-9a-f]{64}$/);
  const tampered = protectedSnapshots({
    subjects: { canonicalRows: '[{"id":"subject_tampered"}]' }
  });
  assert.notEqual(hashM1BRiskProtectedStateSnapshots(tampered), beforeHash);
  assert.throws(
    () => hashM1BRiskProtectedStateSnapshots(baseline.slice(1)),
    (error) => error instanceof M1BRiskMfaBoundaryAcceptanceError &&
      error.code === "risk_protected_state_catalog_invalid"
  );
  const reordered = [...baseline];
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.throws(
    () => hashM1BRiskProtectedStateSnapshots(reordered),
    (error) => error instanceof M1BRiskMfaBoundaryAcceptanceError &&
      error.code === "risk_protected_state_snapshot_invalid"
  );
});

test("live observation polling completes, times out, and propagates producer crashes", async () => {
  let attempts = 0;
  const completed = await waitForM1BRiskBoundaryObservation({
    timeoutMs: 10,
    pollIntervalMs: 1,
    readObservation: async () => {
      attempts += 1;
      return attempts === 2 ? { complete: true, marker: "observed" } : { complete: false };
    },
    sleep: async () => {}
  });
  assert.equal(completed.marker, "observed");

  let clock = 0;
  await assert.rejects(
    waitForM1BRiskBoundaryObservation({
      timeoutMs: 5,
      pollIntervalMs: 2,
      readObservation: async () => ({ complete: false }),
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      }
    }),
    (error) => error instanceof M1BRiskMfaBoundaryAcceptanceError &&
      error.code === "risk_boundary_observation_timeout"
  );

  await assert.rejects(
    waitForM1BRiskBoundaryObservation({
      timeoutMs: 5,
      pollIntervalMs: 1,
      readObservation: async () => {
        throw new Error("database connection terminated");
      },
      sleep: async () => {}
    }),
    /database connection terminated/
  );
});

test("Risk ceremony emits one closed arm token for the exact visible two-probe boundary", () => {
  const uuids = [
    "01234567-89ab-4def-8123-456789abcdef",
    "11234567-89ab-4def-8123-456789abcdef",
    "21234567-89ab-4def-8123-456789abcdef",
    "31234567-89ab-4def-8123-456789abcdef",
    "41234567-89ab-4def-8123-456789abcdef"
  ];
  const { requestPlan, armToken } = createM1BRiskBoundaryResponseArm({
    subjectId: "subject_00000000-0000-4000-8000-000000000001",
    now: new Date("2026-08-15T01:00:00.000Z"),
    createUuid: () => uuids.shift()
  });
  assert.equal(armToken.schemaVersion, "m1_b_risk_boundary_response_arm.v1");
  assert.equal(armToken.issuedAt, "2026-08-15T01:00:00.000Z");
  assert.equal(armToken.expiresAt, "2026-08-15T01:15:00.000Z");
  assert.deepEqual(armToken.operationIds, [
    "pilotReadTenantRiskPortfolioReference",
    "pilotFreezeSubject"
  ]);
  assert.equal(requestPlan.read.operationId, armToken.operationIds[0]);
  assert.equal(requestPlan.freeze.operationId, armToken.operationIds[1]);
  assert.equal(requestPlan.freeze.resource.resourceId, armToken.subjectId);
  assert.equal(requestPlan.freeze.reasonCode, armToken.reasonCode);
  assert.equal(requestPlan.read.requestId, armToken.readRequestId);
  assert.equal(requestPlan.freeze.requestId, armToken.freezeRequestId);
  assert.equal(
    requestPlan.freeze.idempotencyKey,
    "idempotency_m1b_risk_freeze_01234567-89ab-4def-8123-456789abcdef"
  );
  assert.equal(Object.hasOwn(armToken, "idempotencyKey"), false);
  const serialized = JSON.stringify(armToken);
  assert.doesNotMatch(
    serialized,
    /document\.cookie|csrf|session_ref_hash|signature|private.?key|\beval\b/i
  );
  assert.equal(
    deriveM1BRiskBoundaryFreezeIdempotencyKey(armToken.challenge),
    requestPlan.freeze.idempotencyKey
  );
  assert.throws(
    () => deriveM1BRiskBoundaryFreezeIdempotencyKey("m1_b_risk_boundary_wrong"),
    (error) => error instanceof M1BRiskMfaBoundaryAcceptanceError &&
      error.code === "risk_boundary_challenge_invalid"
  );
});

test("database secret reader accepts only 0600 or the exact read-only 0644 compatibility mount", async () => {
  const path = "/run/secrets/private-pilot-db-secret";
  const metadata = (mode) => ({
    mode,
    isFile: () => true,
    isSymbolicLink: () => false
  });
  const secret = "s".repeat(43);
  assert.equal(
    await readExistingM1BAcceptanceDatabaseRoleSecret(path, {
      lstatFile: async () => metadata(0o100600),
      readText: async () => secret,
      readMountInfo: async () => {
        throw new Error("not needed for 0600");
      }
    }),
    secret
  );
  assert.equal(
    await readExistingM1BAcceptanceDatabaseRoleSecret(path, {
      lstatFile: async () => metadata(0o100644),
      readText: async () => secret,
      readMountInfo: async () =>
        "91 42 0:77 / /run/secrets/private-pilot-db-secret ro,nosuid,nodev - virtiofs host rw"
    }),
    secret
  );
  await assert.rejects(
    readExistingM1BAcceptanceDatabaseRoleSecret(path, {
      lstatFile: async () => metadata(0o100644),
      readText: async () => secret,
      readMountInfo: async () =>
        "91 42 0:77 / /run/secrets/private-pilot-db-secret rw,nosuid,nodev - virtiofs host rw"
    }),
    (error) => error instanceof M1BAcceptancePostgresError &&
      error.code === "acceptance_database_secret_invalid"
  );
});

test("baseline and protected-state reads set exact tenant context and reject trivial state", async () => {
  const expectedStart = "2026-08-14T01:00:00.000Z";
  const responder = (sql, params) => {
    if (sql.includes("pg_postmaster_start_time")) {
      return {
        rowCount: 1,
        rows: [{
          database_started_at: expectedStart,
          observed_at: "2026-08-14T01:02:00.000Z"
        }]
      };
    }
    if (sql.includes("FROM memberships m")) {
      assert.deepEqual(params[1], [
        "auditor",
        "operations_operator",
        "risk_operator"
      ]);
      return { rowCount: 1, rows: [protectedMembershipRow()] };
    }
    if (sql.includes("FROM authentication_credentials")) {
      return { rowCount: 1, rows: [protectedCredentialRow()] };
    }
    if (sql.includes("FROM authorization_resources")) {
      return {
        rowCount: 2,
        rows: [
          { resource_type: "risk_portfolio", resource_id: params[1] },
          { resource_type: "subject", resource_id: params[2] }
        ]
      };
    }
    if (sql.includes("FROM subjects")) {
      return {
        rowCount: 1,
        rows: [{ id: params[0], subject_type: "agent", status: "active" }]
      };
    }
    if (sql.includes("FROM outbox_messages")) {
      return { rowCount: 1, rows: [{ count: 0 }] };
    }
    const tableName = sql.match(/FROM "([a-z0-9_]+)" AS source_row/)?.[1];
    if (tableName) {
      return {
        rowCount: 1,
        rows: [{
          row_count: Math.max(
            1,
            M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS[tableName] ?? 0
          ),
          canonical_rows: `[{"table":"${tableName}"}]`
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const pool = fakePool(responder);
  const context = tenantContext();
  const baseline = await loadM1BRiskAcceptanceBaseline(pool, {
    expectedDatabaseStartedAt: expectedStart,
    tenantId: "tenant_local_private_pilot",
    riskPortfolioId: "risk_portfolio_local_private_pilot",
    subjectId: "subject_00000000-0000-4000-8000-000000000001",
    tenantContext: context
  });
  assert.equal(baseline.tenantId, "tenant_local_private_pilot");
  assert.deepEqual(pool.calls[1].params, [
    "tenant_local_private_pilot",
    "actor_risk_operations_pilot",
    "security_001.v1"
  ]);
  const snapshot = await captureM1BRiskProtectedState(pool, context);
  assert.match(snapshot.hash, /^0x[0-9a-f]{64}$/);
  assert.equal(
    pool.calls.filter(({ sql }) =>
      sql.includes("set_config('app.tenant_id'")
    ).length,
    2
  );

  const trivialPool = fakePool((sql) => {
    const tableName = sql.match(/FROM "([a-z0-9_]+)" AS source_row/)?.[1];
    if (!tableName) throw new Error(`Unexpected SQL: ${sql}`);
    return {
      rowCount: 1,
      rows: [{
        row_count: tableName === "subjects" ? 0 : 1,
        canonical_rows: "[]"
      }]
    };
  });
  await assert.rejects(
    captureM1BRiskProtectedState(trivialPool, context),
    (error) => error instanceof M1BRiskMfaBoundaryAcceptanceError &&
      error.code === "risk_protected_state_trivial"
  );
});

function liveRequestPlan() {
  return {
    read: {
      operationId: "pilotReadTenantRiskPortfolioReference",
      payload: {},
      requestId: "request_m1_b_risk_read_00000000-0000-4000-8000-000000000001",
      correlationId: "correlation_m1_b_risk_00000000-0000-4000-8000-000000000001",
      schemaVersion: "tenant_protocol_request.v1"
    },
    freeze: {
      operationId: "pilotFreezeSubject",
      payload: {},
      resource: {
        resourceType: "subject",
        resourceId: "subject_00000000-0000-4000-8000-000000000001"
      },
      reasonCode: "security_incident",
      idempotencyKey: "idempotency_m1_b_risk_00000000-0000-4000-8000-000000000001",
      requestId: "request_m1_b_risk_freeze_00000000-0000-4000-8000-000000000001",
      correlationId: "correlation_m1_b_risk_00000000-0000-4000-8000-000000000002",
      schemaVersion: "tenant_protocol_request.v1"
    }
  };
}

function liveObservationPool({
  correlationTamper = false,
  tokenTamper = false,
  omitFreezeCapability = false,
  extraAuditor = false,
  nonSiweCredential = false,
  staleAuthTime = false
} = {}) {
  const tokenHash = "t".repeat(43);
  const capabilities = omitFreezeCapability
    ? ["risk.read.tenant"]
    : ["risk.read.tenant", "risk.freeze"];
  const plan = liveRequestPlan();
  return fakePool((sql) => {
    if (sql.includes("FROM authentication_sessions s")) {
      return {
        rowCount: 1,
        rows: [{
          actor_id: "actor_risk_operations_pilot",
          actor_type: "risk_operator",
          client_id: "client_risk_operations_pilot",
          session_credential_version: 1,
          authentication_method: "siwe",
          sender_constraint_method: "host_session",
          policy_version: "security_001.v1",
          roles: ["risk_operator"],
          session_capabilities: capabilities,
          token_jti_ref_hash: tokenHash,
          auth_time: staleAuthTime
            ? "2026-08-14T01:01:00.000Z"
            : "2026-08-14T01:03:00.000Z",
          acr: "urn:ipo.one:acr:wallet",
          amr: ["wallet", "siwe", "eip191_eoa_v1"],
          created_at: "2026-08-14T01:03:00.000Z",
          credential_actor_id: "actor_risk_operations_pilot",
          credential_actor_type: "risk_operator",
          credential_client_id: "client_risk_operations_pilot",
          credential_method: "siwe",
          credential_sender_constraint_method: "host_session",
          credential_roles: ["risk_operator"],
          credential_capabilities: capabilities,
          credential_policy_version: "security_001.v1",
          credential_status: "active",
          credential_version: 1,
          actor_status: "active",
          role_bundle: "risk_operator",
          membership_capabilities: capabilities,
          membership_client_ids: ["client_risk_operations_pilot"],
          membership_policy_version: "security_001.v1",
          membership_status: "active",
          tenant_status: "active"
        }]
      };
    }
    if (sql.includes("FROM memberships m")) {
      const rows = extraAuditor
        ? [protectedMembershipRow(), protectedMembershipRow("auditor")]
        : [protectedMembershipRow()];
      return { rowCount: rows.length, rows };
    }
    if (sql.includes("FROM authentication_credentials")) {
      return {
        rowCount: 1,
        rows: [protectedCredentialRow(nonSiweCredential ? "oidc_pkce_bff" : "siwe")]
      };
    }
    if (sql.includes("FROM authorization_audit_events")) {
      return {
        rowCount: 2,
        rows: [
          {
            id: "authorization_event_00000000-0000-4000-8000-000000000001",
            occurred_at: "2026-08-14T01:04:00.000Z",
            request_id: plan.read.requestId,
            correlation_id: correlationTamper ? "correlation_wrong" : plan.read.correlationId,
            actor_id: "actor_risk_operations_pilot",
            actor_type: "risk_operator",
            token_jti_hash: tokenTamper ? "x".repeat(43) : tokenHash,
            operation_id: plan.read.operationId,
            action: "risk.read.tenant",
            resource_type: "workspace",
            resource_id: "resource_pending",
            authorization_decision: "deny",
            reason_code: "actor_capability_rejected",
            policy_version: "security_001.v1"
          },
          {
            id: "authorization_event_00000000-0000-4000-8000-000000000002",
            occurred_at: "2026-08-14T01:04:01.000Z",
            request_id: plan.freeze.requestId,
            correlation_id: plan.freeze.correlationId,
            actor_id: "actor_risk_operations_pilot",
            actor_type: "risk_operator",
            token_jti_hash: tokenHash,
            operation_id: plan.freeze.operationId,
            action: "risk.freeze",
            resource_type: "subject",
            resource_id: plan.freeze.resource.resourceId,
            authorization_decision: "deny",
            reason_code: "actor_capability_rejected",
            policy_version: "security_001.v1"
          }
        ]
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
}

test("live Risk observation isolates MFA denial and binds audit to session without emitting token material", async () => {
  const baseline = {
    tenantId: "tenant_local_private_pilot",
    actorId: "actor_risk_operations_pilot",
    subjectId: "subject_00000000-0000-4000-8000-000000000001",
    observedAt: "2026-08-14T01:02:00.000Z",
    protectedIdentityBoundary: protectedIdentityBoundary()
  };
  const observed = await readM1BRiskLiveObservation(
    liveObservationPool(),
    tenantContext(),
    baseline,
    liveRequestPlan()
  );
  assert.equal(observed.complete, true);
  assert.deepEqual(observed.mfaDenialAttribution.requiredCapabilities, [
    "risk.read.tenant",
    "risk.freeze"
  ]);
  assert.equal(observed.mfaDenialAttribution.auditCorrelationBindingVerified, true);
  assert.equal(observed.mfaDenialAttribution.auditSessionTokenBindingVerified, true);
  assert.deepEqual(observed.credentialBoundary, protectedIdentityBoundary());
  assert.equal(observed.session.authTime, "2026-08-14T01:03:00.000Z");
  assert.equal(observed.checks[0].resourceType, "workspace");
  assert.equal(observed.checks[0].resourceId, "resource_pending");
  assert.doesNotMatch(JSON.stringify(observed), /token_jti|session_ref|csrf/i);

  for (const options of [
    { correlationTamper: true },
    { tokenTamper: true },
    { omitFreezeCapability: true },
    { extraAuditor: true },
    { nonSiweCredential: true },
    { staleAuthTime: true }
  ]) {
    await assert.rejects(
      readM1BRiskLiveObservation(
        liveObservationPool(options),
        tenantContext(),
        baseline,
        liveRequestPlan()
      ),
      (error) => error instanceof M1BRiskMfaBoundaryAcceptanceError &&
        new Set([
          "risk_boundary_live_audit_invalid",
          "risk_boundary_session_assurance_invalid",
          "risk_boundary_privileged_identity_set_invalid",
          "risk_boundary_weak_credential_available"
        ]).has(error.code)
    );
  }
});

test("producer and wrapper source statically exclude authentication handles and unsafe writes", async () => {
  const [producer, wrapper, acceptancePostgres] = await Promise.all([
    readFile(new URL("../src/m1-b-risk-mfa-boundary-acceptance.js", import.meta.url), "utf8"),
    readFile(new URL("../../../scripts/local-risk-mfa-boundary-acceptance.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/m1-b-acceptance-postgres.js", import.meta.url), "utf8")
  ]);
  assert.match(acceptancePostgres, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(acceptancePostgres, /setTenantTransactionContext/);
  assert.match(acceptancePostgres, /exactReadOnlyMount/);
  assert.match(acceptancePostgres, /assertTenantDatabaseRole/);
  assert.match(producer, /withM1BAcceptanceTenantRead as withTenantRead/);
  assert.match(producer, /createM1BAcceptanceAppPool/);
  assert.doesNotMatch(producer, /\bpool\.query\s*\(/);
  assert.doesNotMatch(
    producer,
    /\b(session_ref_hash|csrf_ref_hash|address_ciphertext|message_ciphertext|signature_hash)\b/i
  );
  assert.match(producer, /audit\.token_jti_hash === session\.token_jti_ref_hash/);
  assert.match(producer, /audit\.correlation_id === request\.correlationId/);
  assert.doesNotMatch(producer, /loadOrCreatePrivatePilotDatabaseSecret/);
  assert.match(wrapper, /spawnSync\(\s*process\.execPath/);
  assert.match(wrapper, /org\.opencontainers\.image\.revision/);
  assert.doesNotMatch(wrapper, /compose\(baseArgs, \["build", "pilot"\]/);
  assert.match(wrapper, /resolveRiskRuntimeImageIdentity/);
  assert.match(wrapper, /taggedImageId/);
  assert.match(wrapper, /validateM1BAgentPhaseReceipt/);
  assert.match(wrapper, /after-restart\.phase-receipt\.v2\.json/);
  assert.match(wrapper, /runningRiskRuntimeImageIdentity/g);
  assert.match(wrapper, /after-restart\.acceptance\.json/);
  assert.match(wrapper, /IPO_ONE_M1_B_AUTH_SOURCE_DIGESTS_JSON/);
  assert.match(wrapper, /\["DATABASE_URL", producerDatabaseUrl\.toString\(\)\]/);
  assert.match(wrapper, /parsedProducerDatabaseUrl\.username !== ""/);
  assert.match(wrapper, /parsedProducerDatabaseUrl\.password !== ""/);
  assert.doesNotMatch(wrapper, /DATABASE_URL=[^\n]*ipo_one_owner/);
  assert.match(wrapper, /flag: "wx", mode: 0o600/);
  assert.match(wrapper, /await link\(temporaryPath, path\)/);
  assert.match(wrapper, /will not be overwritten/);
});

test("Risk wrapper binds the mutable tag and both services to Agent-after", () => {
  const releaseSha = "a".repeat(40);
  const imageId = `sha256:${"b".repeat(64)}`;
  const pilotContainer = "c".repeat(64);
  const workerContainer = "d".repeat(64);
  const resolveIdentity = ({
    workerImageId = imageId,
    tagImageId = imageId,
    revision = releaseSha
  } = {}) => resolveRiskRuntimeImageIdentity({
    candidateReleaseId: releaseSha,
    expectedImageId: imageId,
    containerIdForService: (service) =>
      service === "pilot" ? pilotContainer : workerContainer,
    imageIdForContainer: (containerId) =>
      containerId === workerContainer ? workerImageId : imageId,
    taggedImageId: () => tagImageId,
    revisionForImage: () => revision
  });
  assert.deepEqual(resolveIdentity(), { imageId, revision: releaseSha });
  assert.throws(() => resolveIdentity({
    workerImageId: `sha256:${"e".repeat(64)}`
  }));
  assert.throws(() => resolveIdentity({
    tagImageId: `sha256:${"f".repeat(64)}`
  }));
  assert.throws(() => resolveIdentity({ revision: "0".repeat(40) }));
});

test("Risk wrapper constructs exact secret-free Compose producer argv", () => {
  const baseArgs = [
    "shell",
    "--workdir",
    "/tracked/repository",
    "ipo-one-local",
    "docker",
    "compose",
    "--file",
    "/tracked/repository/deploy/local/compose.yaml"
  ];
  const environment = {
    releaseSha: "a".repeat(40),
    databaseStartedAt: "2026-08-14T01:00:00.000Z",
    tenantId: "tenant_private_pilot",
    riskPortfolioId: "risk_portfolio_private_pilot",
    subjectId: "subject_00000000-0000-4000-8000-000000000001",
    testOutputSha256: "b".repeat(64),
    sourceFiles: REGRESSION_SOURCE_PATHS.map((path) => ({
      path,
      sha256: "c".repeat(64)
    })),
    runtimeImageId: `sha256:${"d".repeat(64)}`,
    releaseIdentityArtifactSha256: "e".repeat(64),
    databaseUrl: "postgresql://127.0.0.2:55432/ipo_one_private_pilot"
  };
  const args = createRiskProducerArguments(baseArgs, environment);
  assert.equal(assertRiskProducerArguments(args, { baseArgs, environment }), true);
  const runIndex = args.indexOf("run", baseArgs.length);
  assert.equal(runIndex, baseArgs.length);
  assert.deepEqual(args.slice(-2), [
    "pilot",
    "apps/private-pilot/src/m1-b-risk-mfa-boundary-acceptance.js"
  ]);
  const environmentPairs = [];
  for (let index = runIndex + 4; args[index] === "--env"; index += 2) {
    environmentPairs.push(args[index + 1]);
  }
  assert.deepEqual(
    environmentPairs.map((value) => value.slice(0, value.indexOf("="))),
    [
      "IPO_ONE_M1_B_RELEASE_SHA",
      "IPO_ONE_M1_B_EXPECTED_DATABASE_STARTED_AT",
      "IPO_ONE_M1_B_TENANT_ID",
      "IPO_ONE_M1_B_RISK_PORTFOLIO_ID",
      "IPO_ONE_M1_B_RISK_SUBJECT_ID",
      "IPO_ONE_M1_B_AUTH_TEST_OUTPUT_SHA256",
      "IPO_ONE_M1_B_AUTH_SOURCE_DIGESTS_JSON",
      "IPO_ONE_M1_B_RUNTIME_IMAGE_ID",
      "IPO_ONE_M1_B_RELEASE_IDENTITY_SHA256",
      "DATABASE_URL"
    ]
  );
  assert.equal(
    environmentPairs.some((value) =>
      /(IPO_ONE_LOCAL_POSTGRES_PASSWORD|ipo_one_owner|agent-key|authentication-(server|invitation))/i
        .test(value)
    ),
    false
  );

  const timedArgs = createRiskProducerArguments(baseArgs, {
    ...environment,
    timeoutMs: "30000"
  });
  assert.equal(
    timedArgs.at(-3),
    "IPO_ONE_M1_B_RISK_BOUNDARY_TIMEOUT_MS=30000"
  );

  const duplicated = [...args];
  duplicated.splice(-2, 0, "--env", environmentPairs[0]);
  assert.throws(() =>
    assertRiskProducerArguments(duplicated, { baseArgs, environment })
  );
  const missingValue = [...args];
  const firstEnvironmentIndex = missingValue.indexOf("--env", runIndex + 4);
  missingValue.splice(firstEnvironmentIndex + 1, 1);
  assert.throws(() =>
    assertRiskProducerArguments(missingValue, { baseArgs, environment })
  );
  assert.throws(() =>
    createRiskProducerArguments(baseArgs, {
      ...environment,
      databaseUrl:
        "postgresql://ipo_one_owner:owner-secret@127.0.0.2:55432/ipo_one_private_pilot"
    })
  );
  assert.throws(() =>
    createRiskProducerArguments(baseArgs, { ...environment, tenantId: "" })
  );
});

test("Risk wrapper fails closed when a bound source digest changes during collection", () => {
  const before = REGRESSION_SOURCE_PATHS.map((path) => ({
    path,
    sha256: "a".repeat(64)
  }));
  assert.equal(
    assertRiskProducerSourceDigestsUnchanged(
      before,
      before.map((entry) => ({ ...entry }))
    ),
    true
  );
  const after = before.map((entry) => ({ ...entry }));
  after[0].sha256 = "b".repeat(64);
  assert.throws(() =>
    assertRiskProducerSourceDigestsUnchanged(before, after)
  );
});
