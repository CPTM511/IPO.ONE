import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  M1_B_ACCEPTANCE_SECRET_MOUNT,
  createM1BAcceptanceAppPool,
  withM1BAcceptanceTenantRead
} from "./m1-b-acceptance-postgres.js";
import { createLocalPilotIdentities } from "./local-pilot-identities.js";
import { createTenantSecurityContext } from "../../../modules/persistence/src/index.js";
import {
  TENANT_HTTP_ROUTES
} from "../../../apps/tenant-api/src/index.js";
import {
  captureM1BOperationalLiveDenialBoundary
} from "./m1-b-operational-live-negative-acceptance.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const TEST_FILE =
  "apps/private-pilot/test/m1-b-operational-negative-acceptance.test.js";
const POSTGRES_REGRESSION_FILE =
  "modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs";
const UI_BINDING_REGRESSION_FILE =
  "apps/web/test/request-credit-review-binding.test.js";
const MAX_TAP_BYTES = 4 * 1024 * 1024;
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/%-]{1,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const CASE_DIAGNOSTIC_PREFIX = "M1_B_OPERATIONAL_NEGATIVE_CASE_PROOF_V2=";
const POSTGRES_CASE_DIAGNOSTIC_PREFIX =
  "M1_B_POSTGRES_NEGATIVE_CASE_DIAGNOSTIC_V2=";
const TRUSTED_TAP_CHUNK_PREFIX =
  "M1_B_OPERATIONAL_NEGATIVE_TRUSTED_TAP_CHUNK_V2=";
const TRUSTED_TAP_CHUNK_BYTES = 768;
const trustedTapByObservation = new WeakMap();

const FORBIDDEN_KEYS = Object.freeze([
  "accesstoken",
  "accountaddress",
  "authorizationheader",
  "cookie",
  "credential",
  "csrf",
  "email",
  "jwt",
  "mnemonic",
  "password",
  "phone",
  "privatekey",
  "rawpii",
  "seedphrase",
  "sessionhandle",
  "sessionmaterial",
  "signature",
  "tokenjti",
  "walletaddress"
]);
const FORBIDDEN_VALUES = Object.freeze([
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i,
  /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  /\b0x[0-9a-fA-F]{40}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/
]);

export const M1_B_OPERATIONAL_NEGATIVE_CASES = Object.freeze({
  human: Object.freeze([
    "expired_offer",
    "replaced_stale_offer",
    "duplicate_acceptance",
    "unauthorized_subject",
    "wrong_tenant",
    "changed_version",
    "invalid_acceptance_binding"
  ]),
  agent: Object.freeze([
    "wrong_provider",
    "wrong_provider_category",
    "stale_mandate",
    "revoked_mandate",
    "out_of_scope_facility",
    "replay_invalid_execution"
  ]),
  authorization: Object.freeze([
    "signed_out_private_read",
    "cross_role_private_read",
    "wrong_tenant_private_read"
  ])
});

const DISPOSABLE_POSTGRES_CASES = new Set([
  "human:duplicate_acceptance",
  "human:wrong_tenant",
  "human:invalid_acceptance_binding",
  ...M1_B_OPERATIONAL_NEGATIVE_CASES.agent.map((id) => `agent:${id}`),
  "authorization:wrong_tenant_private_read"
]);

const EXACT_SOURCE_PRODUCT_CASES = Object.freeze({
  "human:changed_version": "exact_source_ui_binding"
});

const POSTGRES_SOURCE_PATHS = Object.freeze([
  "apps/private-pilot/src/m1-b-operational-negative-acceptance.js",
  "modules/tenant-command-gateway/src/tenant-command-gateway.js",
  "modules/tenant-command-gateway/src/tenant-command-clients.js",
  "modules/tenant-command-gateway/src/credit-execution-handlers.js",
  "modules/authorization/src/authorization-policy.js",
  "modules/authorization/src/authorization-service.js",
  POSTGRES_REGRESSION_FILE,
  TEST_FILE
]);
const TRANSPORT_SOURCE_PATHS = Object.freeze([
  "apps/private-pilot/src/m1-b-operational-negative-acceptance.js",
  "apps/tenant-api/src/tenant-authentication-resolver.js",
  "apps/tenant-api/src/tenant-http-adapter.js",
  "apps/tenant-api/src/tenant-pilot-host.js",
  TEST_FILE
]);
const UI_BINDING_SOURCE_PATHS = Object.freeze([
  "apps/private-pilot/src/m1-b-operational-negative-acceptance.js",
  "apps/web/src/request-credit-review-binding.js",
  UI_BINDING_REGRESSION_FILE,
  TEST_FILE
]);

const POSTGRES_REGRESSIONS = Object.freeze({
  "human:duplicate_acceptance": Object.freeze({
    testName: "Human and Agent persist one restart-safe no-funds Credit Intent protocol with retry-safe credit Outcomes",
    requestPrefix: "request-accept-human-credit-",
    correlationPrefix: "correlation-accept-human-credit-",
    outwardStatus: 200,
    outwardCode: "idempotent_replay",
    requiresDenyAudit: false,
    duplicate: true,
    markers: Object.freeze([
      "humanAcceptances.map((result) => result.replayed).sort(), [false, true]",
      "humanAcceptances[0].response, humanAcceptances[1].response",
      "executeConcurrentDuplicate"
    ])
  }),
  "human:wrong_tenant": Object.freeze({
    testName: "Human and Agent persist one restart-safe no-funds Credit Intent protocol with retry-safe credit Outcomes",
    requestPrefix: "request-accept-human-credit-wrong-tenant-",
    correlationPrefix: "correlation-accept-human-credit-wrong-tenant-",
    outwardStatus: 403,
    outwardCode: "authorization_denied",
    requiresDenyAudit: true,
    duplicate: false,
    markers: Object.freeze([
      "request-accept-human-credit-wrong-tenant-${RUN_ID}",
      "wrongTenantCaptured.error.code, \"authorization_denied\"",
      "protectedStateBefore: wrongTenantAcceptanceBefore"
    ])
  }),
  "human:invalid_acceptance_binding": Object.freeze({
    testName: "Phase 2 Capital Partner marketplace closes Human, Agent, stale, and adverse no-funds paths",
    requestPrefix: "request-phase2-stale-hash-",
    correlationPrefix: "correlation-phase2-stale-",
    outwardStatus: 400,
    outwardCode: "offer_terms_mismatch",
    requiresDenyAudit: false,
    duplicate: false,
    markers: Object.freeze([
      "request-phase2-stale-hash-${RUN_ID}",
      "gateway_phase2_stale_offer",
      "invalidBindingCaptured.error.code, \"offer_terms_mismatch\""
    ])
  }),
  "agent:wrong_provider": Object.freeze({
    testName: "Human and Agent persist one restart-safe no-funds Credit Intent protocol with retry-safe credit Outcomes",
    requestPrefix: "request-m1b-agent-wrong-provider-",
    correlationPrefix: "correlation-m1b-agent-wrong-provider-",
    outwardStatus: 403,
    outwardCode: "credit_facility_scope_mismatch",
    requiresDenyAudit: false,
    duplicate: false,
    markers: Object.freeze([
      "provider_not_allowlisted",
      "credit_facility_scope_mismatch",
      "sandbox_execution_receipts"
    ])
  }),
  "agent:wrong_provider_category": Object.freeze({
    testName: "Human and Agent persist one restart-safe no-funds Credit Intent protocol with retry-safe credit Outcomes",
    requestPrefix: "request-m1b-agent-wrong-provider-category-",
    correlationPrefix: "correlation-m1b-agent-wrong-provider-category-",
    outwardStatus: 403,
    outwardCode: "credit_facility_scope_mismatch",
    requiresDenyAudit: false,
    duplicate: false,
    markers: Object.freeze([
      "providerCategory: \"unrestricted\"",
      "credit_facility_scope_mismatch",
      "ledger_transactions"
    ])
  }),
  "agent:stale_mandate": Object.freeze({
    testName: "stale Agent MCP handoffs fail closed on revoked and expired durable Mandates",
    requestPrefix: "request-m1b-agent-stale-mandate-",
    correlationPrefix: "correlation-m1b-agent-stale-mandate-",
    outwardStatus: 403,
    outwardCode: "authority_not_current",
    requiresDenyAudit: false,
    duplicate: false,
    markers: Object.freeze([
      "label: \"expired-authority\"",
      "authority_not_current",
      "denied_command_rows: 0"
    ])
  }),
  "agent:revoked_mandate": Object.freeze({
    testName: "stale Agent MCP handoffs fail closed on revoked and expired durable Mandates",
    requestPrefix: "request-m1b-agent-revoked-mandate-",
    correlationPrefix: "correlation-m1b-agent-revoked-mandate-",
    outwardStatus: 403,
    outwardCode: "authority_not_current",
    requiresDenyAudit: false,
    duplicate: false,
    markers: Object.freeze([
      "label: \"revoked-authority\"",
      "authority_not_current",
      "execution_receipts: before.rows[0].execution_receipts"
    ])
  }),
  "agent:out_of_scope_facility": Object.freeze({
    testName: "Human and Agent persist one restart-safe no-funds Credit Intent protocol with retry-safe credit Outcomes",
    requestPrefix: "request-m1b-agent-out-of-scope-facility-",
    correlationPrefix: "correlation-m1b-agent-out-of-scope-facility-",
    outwardStatus: 403,
    outwardCode: "credit_facility_scope_mismatch",
    requiresDenyAudit: false,
    duplicate: false,
    markers: Object.freeze([
      "provider_outside_derived_facility",
      "credit_facility_scope_mismatch",
      "executions: 0"
    ])
  }),
  "agent:replay_invalid_execution": Object.freeze({
    testName: "Human and Agent persist one restart-safe no-funds Credit Intent protocol with retry-safe credit Outcomes",
    requestPrefix: "request-m1b-agent-replay-invalid-execution-",
    correlationPrefix: "correlation-m1b-agent-replay-invalid-execution-",
    outwardStatus: 409,
    outwardCode: "event_idempotency_conflict",
    requiresDenyAudit: false,
    duplicate: false,
    markers: Object.freeze([
      "provider_replay_drift",
      "event_idempotency_conflict",
      "replayInvalidExecution"
    ])
  }),
  "authorization:wrong_tenant_private_read": Object.freeze({
    testName: "cross-Tenant object reads fail closed and commit only bounded denial audit",
    requestPrefix: "request-cross-tenant-",
    correlationPrefix: "correlation-cross-tenant-",
    outwardStatus: 403,
    outwardCode: "authorization_denied",
    requiresDenyAudit: true,
    duplicate: false,
    markers: Object.freeze([
      "tenantTwoAgent.getSelf",
      "authorization_decision, reason_code",
      "resource_access_denied"
    ])
  })
});

const PRODUCT_REGRESSIONS = Object.freeze({
  "human:changed_version": Object.freeze({
    sourceMode: "exact_source_ui_binding",
    testFile: UI_BINDING_REGRESSION_FILE,
    testName: "recovered Human review fails closed on changed versions, stale replacement, expiry, and invalid binding",
    outwardStatus: 409,
    outwardCode: "stale_request_credit_review",
    authorizationDecision: "ui_preflight_rejected",
    authorizationReasonCode: "offer_version_changed",
    databaseProof: "not_applicable_ui_preflight",
    markers: Object.freeze([
      "changedVersion.offerAggregateVersion = 2",
      "stale_request_credit_review:offer_version_changed",
      "assertRecoveredHumanCreditReviewUnchanged"
    ])
  })
});

export class M1BOperationalNegativeAcceptanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BOperationalNegativeAcceptanceError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BOperationalNegativeAcceptanceError(code, message);
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

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function manifestHash(value) {
  return `0x${sha256(canonicalJson(value))}`;
}

function canonicalIso(value, code = "operational_negative_timestamp_invalid") {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) fail(code, "Operational negative Evidence requires a canonical UTC timestamp.");
  return value;
}

function operationId(group, id) {
  if (group === "human") return "pilotAcceptCreditOffer";
  if (group === "agent") return "pilotExecuteSandboxObligation";
  if (id === "wrong_tenant_private_read") return "pilotReadAgentSelf";
  if (id === "cross_role_private_read") return "pilotReadOwnObligation";
  return "pilotReadWorkspaceResume";
}

function definitionFor(group, id) {
  return M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.find(
    (entry) => entry.group === group && entry.id === id
  );
}

export const M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS = Object.freeze(
  Object.entries(M1_B_OPERATIONAL_NEGATIVE_CASES).flatMap(([group, ids]) =>
    ids.map((id) => {
      const key = `${group}:${id}`;
      const sourceMode = key === "authorization:signed_out_private_read"
        ? "exact_source_transport"
        : EXACT_SOURCE_PRODUCT_CASES[key]
          ? EXACT_SOURCE_PRODUCT_CASES[key]
          : DISPOSABLE_POSTGRES_CASES.has(key)
            ? "exact_source_disposable_postgres"
            : "live_post_restart";
      const subtestName = `M1-B operational negative ${key}`;
      const definition = Object.freeze({
        schemaVersion: "m1_b_negative_case_definition.v2",
        group,
        id,
        sourceMode,
        expectedOutcome: key === "human:duplicate_acceptance"
          ? "exact_replay_status_200_no_second_effects"
          : sourceMode === "exact_source_transport"
            ? "transport_rejected_without_tenant_audit"
            : "denied_with_equal_protected_state",
        operationId: operationId(group, id),
        subtestName,
        testCommand: sourceMode === "live_post_restart"
          ? null
          : `node --test --test-reporter=tap --test-name-pattern ${JSON.stringify(subtestName)} ${TEST_FILE}`,
        sourcePaths: sourceMode === "live_post_restart"
          ? Object.freeze([])
          : sourceMode === "exact_source_transport"
            ? TRANSPORT_SOURCE_PATHS
            : sourceMode === "exact_source_ui_binding"
              ? UI_BINDING_SOURCE_PATHS
              : POSTGRES_SOURCE_PATHS
      });
      return Object.freeze({
        ...definition,
        caseDefinitionHash: manifestHash(definition)
      });
    })
  )
);

export function getM1BOperationalNegativeCaseDefinition(group, id) {
  const definition = definitionFor(group, id);
  if (!definition) {
    fail("operational_negative_case_unknown", "Operational negative case is not in the closed registry.");
  }
  return definition;
}

function safeKey(key) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return !FORBIDDEN_KEYS.some((fragment) => normalized.includes(fragment));
}

export function assertM1BOperationalNegativeSafeValue(value, path = "negative") {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      fail("operational_negative_unsafe_value", `${path} is not a safe integer.`);
    }
    return true;
  }
  if (typeof value === "string") {
    if (
      value.length > 2_048 ||
      FORBIDDEN_VALUES.some((pattern) => pattern.test(value))
    ) fail("operational_negative_sensitive", `${path} contains forbidden material.`);
    return true;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) {
      fail("operational_negative_unsafe_value", `${path} is too large.`);
    }
    value.forEach((entry, index) =>
      assertM1BOperationalNegativeSafeValue(entry, `${path}[${index}]`)
    );
    return true;
  }
  if (
    !value ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length > 128
  ) fail("operational_negative_unsafe_value", `${path} is not bounded plain JSON.`);
  for (const [key, entry] of Object.entries(value)) {
    if (!safeKey(key)) {
      fail("operational_negative_sensitive", `${path}.${key} is forbidden.`);
    }
    assertM1BOperationalNegativeSafeValue(entry, `${path}.${key}`);
  }
  return true;
}

function assertCandidateContext({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId
}) {
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "")
  ) fail("operational_negative_candidate_invalid", "Exact candidate SHA, tree, and image are required.");
}

function parseTapTestLine(line) {
  const match = /^\s*(ok|not ok)\s+\d+\s+-\s+(.+?)(?:\s+#\s+(SKIP|TODO)\b.*)?$/i.exec(line);
  if (!match) return null;
  return Object.freeze({
    result: match[1].toLowerCase() === "ok" ? "passed" : "failed",
    name: match[2].replace(/\\#/g, "#").trim(),
    directive: match[3]?.toLowerCase() ?? null
  });
}

function parseTrustedTapChunks(lines) {
  const encoded = lines
    .map((line) => line.trim().replace(/^#\s?/, ""))
    .filter((line) => line.startsWith(TRUSTED_TAP_CHUNK_PREFIX))
    .map((line) => line.slice(TRUSTED_TAP_CHUNK_PREFIX.length));
  if (encoded.length === 0) return null;
  const chunks = new Map();
  let expectedSha;
  let expectedCount;
  for (const value of encoded) {
    const match = /^([0-9a-f]{64}):(\d+):(\d+):([A-Za-z0-9_-]+)$/.exec(value);
    if (!match) {
      fail("operational_negative_trusted_tap_invalid", "Trusted regression TAP chunk is invalid.");
    }
    const [, tapSha256, indexText, countText, chunkText] = match;
    const index = Number(indexText);
    const count = Number(countText);
    if (
      !Number.isSafeInteger(index) ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > Math.ceil(MAX_TAP_BYTES / TRUSTED_TAP_CHUNK_BYTES) ||
      index < 0 ||
      index >= count ||
      chunks.has(index) ||
      (expectedSha !== undefined && expectedSha !== tapSha256) ||
      (expectedCount !== undefined && expectedCount !== count)
    ) fail("operational_negative_trusted_tap_invalid", "Trusted regression TAP chunks are not one exact ordered artifact.");
    const bytes = Buffer.from(chunkText, "base64url");
    if (
      bytes.length < 1 ||
      bytes.length > TRUSTED_TAP_CHUNK_BYTES ||
      Buffer.from(bytes).toString("base64url") !== chunkText ||
      (index < count - 1 && bytes.length !== TRUSTED_TAP_CHUNK_BYTES)
    ) fail("operational_negative_trusted_tap_invalid", "Trusted regression TAP chunk encoding is invalid.");
    expectedSha = tapSha256;
    expectedCount = count;
    chunks.set(index, bytes);
  }
  if (chunks.size !== expectedCount) {
    fail("operational_negative_trusted_tap_invalid", "Trusted regression TAP artifact is incomplete.");
  }
  const tapBytes = Buffer.concat(
    Array.from({ length: expectedCount }, (_, index) => chunks.get(index))
  );
  if (
    tapBytes.length > MAX_TAP_BYTES ||
    sha256(tapBytes) !== expectedSha
  ) fail("operational_negative_trusted_tap_invalid", "Trusted regression TAP digest is invalid.");
  return Object.freeze({ tapBytes, tapSha256: expectedSha });
}

function parsePostgresCaseDiagnostics(lines) {
  return Object.freeze(lines
    .map((line) => line.trim().replace(/^#\s?/, ""))
    .filter((line) => line.startsWith(POSTGRES_CASE_DIAGNOSTIC_PREFIX))
    .map((line) => {
      const encoded = line.slice(POSTGRES_CASE_DIAGNOSTIC_PREFIX.length);
      if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
        fail("operational_negative_postgres_diagnostic_invalid", "PostgreSQL case diagnostic encoding is invalid.");
      }
      let diagnostic;
      try {
        const decoded = Buffer.from(encoded, "base64url").toString("utf8");
        diagnostic = JSON.parse(decoded);
        if (
          Buffer.from(decoded).toString("base64url") !== encoded ||
          canonicalJson(diagnostic) !== decoded
        ) fail("operational_negative_postgres_diagnostic_invalid", "PostgreSQL case diagnostic is not canonical JSON.");
      } catch {
        fail("operational_negative_postgres_diagnostic_invalid", "PostgreSQL case diagnostic is invalid JSON.");
      }
      assertM1BOperationalNegativeSafeValue(
        diagnostic,
        "postgresCaseDiagnostic"
      );
      return Object.freeze(diagnostic);
    }));
}

export function parseM1BOperationalNodeTestTap(tapBytes, {
  expectedTestName,
  requireDiagnostic = false
} = {}) {
  if (
    !Buffer.isBuffer(tapBytes) ||
    tapBytes.length < 1 ||
    tapBytes.length > MAX_TAP_BYTES ||
    typeof expectedTestName !== "string" ||
    expectedTestName.length < 1
  ) fail("operational_negative_tap_invalid", "Bounded TAP bytes and one exact test name are required.");
  const text = tapBytes.toString("utf8");
  if (text.includes("\uFFFD") || !/^TAP version 13\r?\n/.test(text)) {
    fail("operational_negative_tap_invalid", "Node TAP v13 bytes are invalid.");
  }
  const lines = text.split(/\r?\n/);
  const trustedTap = parseTrustedTapChunks(lines);
  const postgresCaseDiagnostics = parsePostgresCaseDiagnostics(lines);
  const tests = lines.map(parseTapTestLine).filter(Boolean);
  const matches = tests.filter(({ name }) => name === expectedTestName);
  if (
    matches.length !== 1 ||
    matches[0].result !== "passed" ||
    matches[0].directive !== null ||
    !lines.some((line) => /^# fail 0$/.test(line.trim())) ||
    !lines.some((line) => /^# cancelled 0$/.test(line.trim()))
  ) fail("operational_negative_tap_case_not_passed", "The exact named TAP case did not pass once without skip or todo.");

  const encodedDiagnostics = lines
    .map((line) => line.trim().replace(/^#\s?/, ""))
    .filter((line) => line.startsWith(CASE_DIAGNOSTIC_PREFIX))
    .map((line) => line.slice(CASE_DIAGNOSTIC_PREFIX.length));
  if (requireDiagnostic && encodedDiagnostics.length !== 1) {
    fail("operational_negative_tap_diagnostic_invalid", "The exact TAP case proof diagnostic is missing or duplicated.");
  }
  let diagnostic = null;
  if (encodedDiagnostics.length > 0) {
    if (encodedDiagnostics.length !== 1 || !/^[A-Za-z0-9_-]+$/.test(encodedDiagnostics[0])) {
      fail("operational_negative_tap_diagnostic_invalid", "The TAP case proof diagnostic is invalid.");
    }
    try {
      const decoded = Buffer.from(encodedDiagnostics[0], "base64url").toString("utf8");
      diagnostic = JSON.parse(decoded);
      if (
        Buffer.from(decoded).toString("base64url") !== encodedDiagnostics[0] ||
        canonicalJson(diagnostic) !== decoded
      ) fail("operational_negative_tap_diagnostic_invalid", "The TAP case proof diagnostic is not canonical JSON.");
    } catch {
      fail("operational_negative_tap_diagnostic_invalid", "The TAP case proof diagnostic is not canonical JSON.");
    }
    assertM1BOperationalNegativeSafeValue(diagnostic, "tapDiagnostic");
  }
  return Object.freeze({
    parser: "node_test_tap_v13",
    expectedTestName,
    exactPassCount: 1,
    failedCount: 0,
    cancelledCount: 0,
    diagnostic,
    tapSha256: sha256(tapBytes),
    trustedTapBytes: trustedTap?.tapBytes ?? null,
    trustedTapSha256: trustedTap?.tapSha256 ?? null,
    postgresCaseDiagnostics
  });
}

function disposableDatabaseUrl(environment) {
  const value = environment?.DATABASE_URL;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("operational_negative_disposable_database_required", "A disposable PostgreSQL test database is required.");
  }
  const databaseName = parsed.pathname.replace(/^\//, "");
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol) ||
    !/(^|[_-])test($|[_-])/.test(databaseName)
  ) fail("operational_negative_disposable_database_required", "The database name must contain an exact test segment.");
  return value;
}

async function postgresQuery(connectionString, text, values = []) {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString,
    max: 1,
    application_name: "ipo-one-m1-b-negative-source-reader"
  });
  try {
    return await pool.query(text, values);
  } finally {
    await pool.end();
  }
}

async function gatewayRunIds(connectionString) {
  const result = await postgresQuery(
    connectionString,
    "SELECT id FROM tenants WHERE id LIKE 'tenant_gateway_one_%' ORDER BY id"
  );
  return new Set(result.rows.map(({ id }) => id.slice("tenant_gateway_one_".length)));
}

function runCommand(args, { environment, timeout = 180_000 } = {}) {
  const childEnvironment = { ...(environment ?? process.env) };
  for (const name of Object.keys(childEnvironment)) {
    if (name.startsWith("NODE_TEST_")) delete childEnvironment[name];
  }
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: childEnvironment,
    encoding: null,
    timeout,
    maxBuffer: MAX_TAP_BYTES
  });
  if (
    result.error ||
    result.signal ||
    result.status !== 0 ||
    !Buffer.isBuffer(result.stdout) ||
    result.stdout.length > MAX_TAP_BYTES ||
    (Buffer.isBuffer(result.stderr) && result.stderr.length > 0)
  ) fail("operational_negative_exact_source_failed", "The exact-source test process did not exit cleanly with TAP-only output.");
  return Object.freeze({ exitCode: result.status, tapBytes: result.stdout });
}

function sourceAssertionHash({
  definition,
  trustedTapSha256,
  runId,
  markers,
  databaseReadback
}) {
  return manifestHash({
    schemaVersion: "m1_b_negative_source_assertion.v2",
    caseDefinitionHash: definition.caseDefinitionHash,
    trustedTapSha256,
    runId,
    markers,
    databaseReadback,
    protectedStateInvariant: "equal_before_after",
    additionalEffectCount: 0
  });
}

const POSTGRES_PROTECTED_STATE_KEYS = Object.freeze([
  "command_idempotency",
  "command_events",
  "tenant_command_executions",
  "mandates",
  "authorization_resources",
  "authorization_resource_bindings",
  "domain_events",
  "credit_events",
  "evidence_envelopes",
  "projection_registry",
  "projection_snapshots",
  "credit_offers",
  "credit_offer_acceptances",
  "obligations",
  "obligation_installments",
  "ledger_accounts",
  "ledger_transactions",
  "ledger_entries",
  "sandbox_execution_receipts",
  "repayment_events",
  "lockboxes",
  "credit_lines"
]);

function validPostgresProtectedStateManifest(value) {
  return exactKeys(value, POSTGRES_PROTECTED_STATE_KEYS) &&
    POSTGRES_PROTECTED_STATE_KEYS.every((key) =>
      exactKeys(value[key], ["rowCount", "manifestHash"]) &&
      Number.isSafeInteger(value[key].rowCount) &&
      value[key].rowCount >= 0 &&
      HASH.test(value[key].manifestHash ?? "")
    );
}

export function assertM1BOperationalProtectedStateManifestPair({
  protectedStateBefore,
  protectedStateAfter,
  protectedStateBeforeHash,
  protectedStateAfterHash
}) {
  if (
    !validPostgresProtectedStateManifest(protectedStateBefore) ||
    !validPostgresProtectedStateManifest(protectedStateAfter) ||
    canonicalJson(protectedStateBefore) !== canonicalJson(protectedStateAfter) ||
    manifestHash(protectedStateBefore) !== protectedStateBeforeHash ||
    manifestHash(protectedStateAfter) !== protectedStateAfterHash ||
    protectedStateBeforeHash !== protectedStateAfterHash
  ) fail(
    "operational_negative_protected_state_manifest_invalid",
    "Protected PostgreSQL state requires equal safe row manifests, not counts alone."
  );
  return true;
}

function validatePostgresCaseDiagnostic({
  diagnostic,
  definition,
  regression,
  runId
}) {
  if (
    !exactKeys(diagnostic, [
      "schemaVersion",
      "group",
      "id",
      "capturedAt",
      "requestId",
      "correlationId",
      "outwardStatus",
      "outwardCode",
      "outwardBody",
      "outwardResponseHash",
      "authorizationAuditEventId",
      "authorizationDecision",
      "authorizationReasonCode",
      "authorizationAuditRows",
      "authorizationAuditEvents",
      "authorizationAuditSetHash",
      "protectedStateBefore",
      "protectedStateAfter",
      "protectedStateBeforeHash",
      "protectedStateAfterHash",
      "additionalEffectCount",
      "duplicateSemantics",
      "databaseProof"
    ]) ||
    diagnostic.schemaVersion !==
      "m1_b_postgres_negative_case_diagnostic.v2" ||
    diagnostic.group !== definition.group ||
    diagnostic.id !== definition.id ||
    !REQUEST_IDENTIFIER.test(diagnostic.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(diagnostic.correlationId ?? "") ||
    diagnostic.requestId !== `${regression.requestPrefix}${runId}` ||
    diagnostic.correlationId !== `${regression.correlationPrefix}${runId}` ||
    diagnostic.outwardStatus !== regression.outwardStatus ||
    diagnostic.outwardCode !== regression.outwardCode ||
    !exactKeys(diagnostic.outwardBody, diagnostic.outwardStatus === 200
      ? [
          "status",
          "code",
          "requestId",
          "replayed",
          "responseSchemaVersion",
          "responseHash"
        ]
      : ["type", "title", "status", "code", "requestId"]) ||
    diagnostic.outwardBody.status !== diagnostic.outwardStatus ||
    diagnostic.outwardBody.code !== diagnostic.outwardCode ||
    diagnostic.outwardBody.requestId !== diagnostic.requestId ||
    manifestHash(diagnostic.outwardBody) !== diagnostic.outwardResponseHash ||
    !HASH.test(diagnostic.authorizationAuditSetHash ?? "") ||
    !Array.isArray(diagnostic.authorizationAuditEvents) ||
    diagnostic.authorizationAuditRows !==
      diagnostic.authorizationAuditEvents.length ||
    manifestHash(diagnostic.authorizationAuditEvents) !==
      diagnostic.authorizationAuditSetHash ||
    diagnostic.additionalEffectCount !== 0 ||
    diagnostic.databaseProof !== "disposable_postgres_owner_readback"
  ) fail("operational_negative_postgres_diagnostic_invalid", "Case-specific PostgreSQL diagnostic is invalid.");
  assertM1BOperationalProtectedStateManifestPair(diagnostic);
  canonicalIso(diagnostic.capturedAt);
  const events = new Set();
  for (const audit of diagnostic.authorizationAuditEvents) {
    if (
      !exactKeys(audit, [
        "eventId",
        "requestId",
        "correlationId",
        "operationId",
        "authorizationDecision",
        "reasonCode"
      ]) ||
      !IDENTIFIER.test(audit.eventId ?? "") ||
      events.has(audit.eventId) ||
      audit.requestId !== diagnostic.requestId ||
      audit.correlationId !== diagnostic.correlationId ||
      audit.operationId !== definition.operationId ||
      !IDENTIFIER.test(audit.authorizationDecision ?? "") ||
      !IDENTIFIER.test(audit.reasonCode ?? "")
    ) fail("operational_negative_postgres_diagnostic_invalid", "PostgreSQL authorization audit projection is invalid.");
    events.add(audit.eventId);
  }
  if (regression.duplicate) {
    if (
      diagnostic.authorizationAuditRows !== 2 ||
      diagnostic.authorizationAuditEvents.some(
        ({ authorizationDecision }) => authorizationDecision !== "allow"
      ) ||
      diagnostic.authorizationAuditEventId !== null ||
      diagnostic.authorizationDecision !== "idempotent_replay" ||
      diagnostic.authorizationReasonCode !==
        "exact_replay_no_second_effects" ||
      diagnostic.outwardBody.replayed !== true ||
      !HASH.test(diagnostic.outwardBody.responseHash ?? "") ||
      diagnostic.duplicateSemantics !==
        "exact_replay_status_200_no_second_effects"
    ) fail("operational_negative_postgres_diagnostic_invalid", "Duplicate acceptance diagnostic is not one exact no-effect replay.");
  } else if (regression.requiresDenyAudit) {
    if (
      diagnostic.authorizationAuditRows !== 1 ||
      diagnostic.authorizationAuditEvents[0].authorizationDecision !== "deny" ||
      diagnostic.authorizationAuditEventId !==
        diagnostic.authorizationAuditEvents[0].eventId ||
      diagnostic.authorizationDecision !== "deny" ||
      diagnostic.authorizationReasonCode !==
        diagnostic.authorizationAuditEvents[0].reasonCode ||
      diagnostic.duplicateSemantics !== null
    ) fail("operational_negative_postgres_diagnostic_invalid", "Authorization denial diagnostic is incomplete.");
  } else if (
    diagnostic.authorizationAuditRows !== 0 ||
    diagnostic.authorizationAuditEventId !== null ||
    diagnostic.authorizationDecision !== "domain_rejected" ||
    diagnostic.authorizationReasonCode !== diagnostic.outwardCode ||
    diagnostic.duplicateSemantics !== null
  ) fail("operational_negative_postgres_diagnostic_invalid", "Domain rejection diagnostic falsely claims an authorization audit.");
  return diagnostic;
}

function databaseReadbackFromPostgresDiagnostic(diagnostic) {
  return Object.freeze({
    schemaVersion: "m1_b_negative_database_readback.v2",
    outwardResponseHash: diagnostic.outwardResponseHash,
    authorizationAuditRows: diagnostic.authorizationAuditRows,
    authorizationAuditEvents: diagnostic.authorizationAuditEvents,
    authorizationAuditSetHash: diagnostic.authorizationAuditSetHash,
    protectedStateBefore: diagnostic.protectedStateBefore,
    protectedStateAfter: diagnostic.protectedStateAfter,
    protectedStateBeforeHash: diagnostic.protectedStateBeforeHash,
    protectedStateAfterHash: diagnostic.protectedStateAfterHash
  });
}

function postgresObservationFromDiagnostic({
  diagnostic,
  definition,
  regression,
  runId,
  trustedRegression
}) {
  const databaseReadback = databaseReadbackFromPostgresDiagnostic(diagnostic);
  return Object.freeze({
    schemaVersion: "m1_b_negative_source_observation.v2",
    group: definition.group,
    id: definition.id,
    sourceMode: definition.sourceMode,
    capturedAt: diagnostic.capturedAt,
    requestId: diagnostic.requestId,
    correlationId: diagnostic.correlationId,
    outwardStatus: diagnostic.outwardStatus,
    outwardCode: diagnostic.outwardCode,
    outwardBody: diagnostic.outwardBody,
    authorizationAuditEventId: diagnostic.authorizationAuditEventId,
    authorizationDecision: diagnostic.authorizationDecision,
    authorizationReasonCode: diagnostic.authorizationReasonCode,
    protectedStateBeforeHash: diagnostic.protectedStateBeforeHash,
    protectedStateAfterHash: diagnostic.protectedStateAfterHash,
    databaseProof: diagnostic.databaseProof,
    additionalEffectCount: diagnostic.additionalEffectCount,
    nonEnumerating: !regression.duplicate,
    duplicateSemantics: diagnostic.duplicateSemantics,
    producerVerified: true,
    regressionAssertions: Object.freeze({
      schemaVersion: "m1_b_negative_regression_assertions.v2",
      assertedOutwardStatus: diagnostic.outwardStatus,
      assertedOutwardCode: diagnostic.outwardCode,
      protectedStateEqualityAsserted: true,
      additionalEffectCountAsserted: diagnostic.additionalEffectCount,
      responseBytesCaptured: false,
      databaseSnapshotHashesCaptured: true,
      actualDatabaseReadback: true,
      databaseReadback,
      sourceAssertionHash: manifestHash({
        schemaVersion: "m1_b_negative_source_assertion.v2",
        caseDefinitionHash: definition.caseDefinitionHash,
        trustedTapSha256: trustedRegression.tapSha256,
        runId,
        postgresCaseDiagnostic: diagnostic
      }),
      compositeConfirmationRegression: false
    }),
    trustedRegression
  });
}

export async function runM1BTrustedDisposablePostgresNegativeCase({
  group,
  id,
  environment = process.env
}) {
  const definition = getM1BOperationalNegativeCaseDefinition(group, id);
  const regression = POSTGRES_REGRESSIONS[`${group}:${id}`];
  if (definition.sourceMode !== "exact_source_disposable_postgres" || !regression) {
    fail("operational_negative_source_mode_invalid", "Case is not a disposable PostgreSQL negative.");
  }
  const connectionString = disposableDatabaseUrl(environment);
  const [beforeRunIds, regressionSource] = await Promise.all([
    gatewayRunIds(connectionString),
    readFile(resolve(ROOT, POSTGRES_REGRESSION_FILE), "utf8")
  ]);
  if (regression.markers.some((marker) => !regressionSource.includes(marker))) {
    fail("operational_negative_source_marker_missing", "Tracked case-specific PostgreSQL assertions drifted.");
  }
  const command = runCommand([
    "--test",
    "--test-reporter=tap",
    "--test-concurrency=1",
    POSTGRES_REGRESSION_FILE
  ], { environment });
  const parsed = parseM1BOperationalNodeTestTap(command.tapBytes, {
    expectedTestName: regression.testName
  });
  const afterRunIds = await gatewayRunIds(connectionString);
  const newRunIds = [...afterRunIds].filter((runId) => !beforeRunIds.has(runId));
  if (newRunIds.length !== 1 || !/^[0-9a-f]{10}$/.test(newRunIds[0])) {
    fail("operational_negative_postgres_run_ambiguous", "The exact PostgreSQL regression did not create one isolated run.");
  }
  const runId = newRunIds[0];
  const matches = parsed.postgresCaseDiagnostics.filter((diagnostic) =>
    diagnostic?.group === group && diagnostic?.id === id
  );
  if (matches.length !== 1) {
    fail(
      "operational_negative_postgres_diagnostic_invalid",
      "The trusted PostgreSQL TAP must contain exactly one target-operation diagnostic."
    );
  }
  const diagnostic = validatePostgresCaseDiagnostic({
    diagnostic: matches[0],
    definition,
    regression,
    runId
  });
  const trustedRegression = Object.freeze({
    testName: regression.testName,
    tapSha256: parsed.tapSha256,
    parser: parsed.parser,
    exitCode: command.exitCode,
    assertionMarkersHash: manifestHash(regression.markers)
  });
  const observation = postgresObservationFromDiagnostic({
    diagnostic,
    definition,
    regression,
    runId,
    trustedRegression
  });
  trustedTapByObservation.set(observation, command.tapBytes);
  return observation;
}

export async function runM1BTrustedProductRegressionNegativeCase({ group, id }) {
  const definition = getM1BOperationalNegativeCaseDefinition(group, id);
  const regression = PRODUCT_REGRESSIONS[`${group}:${id}`];
  if (!regression || definition.sourceMode !== regression.sourceMode) {
    fail("operational_negative_source_mode_invalid", "Case is not an exact product-boundary regression.");
  }
  const regressionSource = await readFile(resolve(ROOT, regression.testFile), "utf8");
  if (regression.markers.some((marker) => !regressionSource.includes(marker))) {
    fail("operational_negative_source_marker_missing", "Tracked product-boundary assertions drifted.");
  }
  const command = runCommand([
    "--test",
    "--test-reporter=tap",
    "--test-name-pattern",
    regression.testName,
    regression.testFile
  ], { environment: process.env, timeout: 60_000 });
  const parsed = parseM1BOperationalNodeTestTap(command.tapBytes, {
    expectedTestName: regression.testName
  });
  const runId = parsed.tapSha256.slice(0, 16);
  const stateHash = sourceAssertionHash({
    definition,
    trustedTapSha256: parsed.tapSha256,
    runId,
    markers: regression.markers,
    databaseReadback: null
  });
  const observation = Object.freeze({
    schemaVersion: "m1_b_negative_source_observation.v2",
    group,
    id,
    sourceMode: definition.sourceMode,
    capturedAt: new Date().toISOString(),
    requestId: `request_m1b_${id}_${randomUUID()}`,
    correlationId: `correlation_m1b_${id}_${randomUUID()}`,
    outwardStatus: null,
    outwardCode: null,
    outwardBody: null,
    authorizationAuditEventId: null,
    authorizationDecision: regression.authorizationDecision,
    authorizationReasonCode: regression.authorizationReasonCode,
    protectedStateBeforeHash: null,
    protectedStateAfterHash: null,
    databaseProof: "exact_source_ui_binding_regression",
    additionalEffectCount: 0,
    nonEnumerating: true,
    duplicateSemantics: null,
    producerVerified: true,
    regressionAssertions: Object.freeze({
      schemaVersion: "m1_b_negative_regression_assertions.v2",
      assertedOutwardStatus: regression.outwardStatus,
      assertedOutwardCode: regression.outwardCode,
      protectedStateEqualityAsserted: true,
      additionalEffectCountAsserted: 0,
      responseBytesCaptured: false,
      databaseSnapshotHashesCaptured: false,
      actualDatabaseReadback: false,
      databaseReadback: null,
      sourceAssertionHash: stateHash,
      compositeConfirmationRegression: false
    }),
    trustedRegression: Object.freeze({
      testName: regression.testName,
      tapSha256: parsed.tapSha256,
      parser: parsed.parser,
      exitCode: command.exitCode,
      assertionMarkersHash: manifestHash(regression.markers)
    })
  });
  trustedTapByObservation.set(observation, command.tapBytes);
  return observation;
}

async function signedOutDatabaseObservation(pool, context, requestId) {
  const runtime = await pool.query(
    "SELECT pg_postmaster_start_time() AS database_started_at, current_user AS role_name"
  );
  const audit = await withM1BAcceptanceTenantRead(pool, context, (client) =>
    client.query(
      `SELECT count(*)::int AS audit_count
         FROM authorization_audit_events
        WHERE tenant_id = $1 AND request_id = $2`,
      [context.tenantId, requestId]
    )
  );
  return Object.freeze({
    databaseStartedAt: new Date(runtime.rows[0].database_started_at).toISOString(),
    roleName: runtime.rows[0].role_name,
    auditCount: audit.rows[0].audit_count
  });
}

async function exactRuntimeReadiness(origin, requestId) {
  const response = await fetch(new URL(TENANT_HTTP_ROUTES.health, origin), {
    method: "GET",
    redirect: "manual",
    headers: {
      accept: "application/json",
      "x-request-id": requestId
    }
  });
  const body = await response.json();
  if (
    response.status !== 200 ||
    !exactKeys(body, ["status", "transport", "public", "schemaVersion"]) ||
    body.status !== "ready" ||
    body.transport !== "authenticated_http_loopback" ||
    body.public !== false ||
    body.schemaVersion !== "tenant_transport_health.v1" ||
    response.headers.get("x-request-id") !== requestId ||
    response.headers.get("cache-control") !== "no-store"
  ) fail("operational_negative_runtime_identity_invalid", "Loopback Tenant transport health is invalid.");
  assertM1BOperationalNegativeSafeValue(body, "runtimeReadiness");
  return Object.freeze({ body, bodyHash: manifestHash(body) });
}

export async function captureM1BExactRuntimeSignedOutPrivateRead({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  origin,
  databaseUrl,
  secretPath = M1_B_ACCEPTANCE_SECRET_MOUNT
}) {
  assertCandidateContext({ candidateReleaseId, sourceTreeHash, runtimeImageId });
  canonicalIso(databaseStartedAt);
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    fail("operational_negative_runtime_identity_invalid", "Exact loopback origin is invalid.");
  }
  if (
    parsedOrigin.protocol !== "http:" ||
    parsedOrigin.hostname !== "127.0.0.1" ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search !== "" ||
    parsedOrigin.hash !== "" ||
    !parsedOrigin.port ||
    secretPath !== M1_B_ACCEPTANCE_SECRET_MOUNT
  ) fail("operational_negative_runtime_identity_invalid", "Signed-out probe requires the exact in-container loopback and secret mount.");
  const pool = await createM1BAcceptanceAppPool({
    databaseUrl,
    secretPath,
    applicationName: "ipo-one-m1-b-signed-out-negative",
    max: 1
  });
  const identities = createLocalPilotIdentities();
  const borrower = identities.identities.borrower;
  const tenantContext = createTenantSecurityContext({
    tenantId: identities.profile.tenantId,
    actorId: borrower.actorId,
    policyVersion: borrower.createContext().policyVersion,
    source: "local_test"
  });
  const requestId = `request_m1b_signed_out_${randomUUID()}`;
  const correlationId = `correlation_m1b_signed_out_${randomUUID()}`;
  try {
    const readinessBefore = await exactRuntimeReadiness(
      parsedOrigin,
      `request_m1b_transport_health_before_${randomUUID()}`
    );
    const databaseBefore = await signedOutDatabaseObservation(
      pool,
      tenantContext,
      requestId
    );
    if (
      databaseBefore.databaseStartedAt !== databaseStartedAt ||
      databaseBefore.roleName !== "ipo_one_private_pilot_app" ||
      databaseBefore.auditCount !== 0
    ) fail("operational_negative_runtime_database_invalid", "Post-restart app-role baseline is invalid.");
    const response = await fetch(new URL(TENANT_HTTP_ROUTES.operations, parsedOrigin), {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId
      },
      body: JSON.stringify({
        schemaVersion: "tenant_protocol_request.v1",
        operationId: "pilotReadWorkspaceResume",
        payload: {},
        requestId,
        correlationId
      })
    });
    const body = await response.json();
    const databaseAfter = await signedOutDatabaseObservation(
      pool,
      tenantContext,
      requestId
    );
    const readinessAfter = await exactRuntimeReadiness(
      parsedOrigin,
      `request_m1b_transport_health_after_${randomUUID()}`
    );
    if (
      response.status !== 401 ||
      body?.code !== "authentication_required" ||
      body?.status !== 401 ||
      body?.requestId !== requestId ||
      databaseAfter.databaseStartedAt !== databaseStartedAt ||
      databaseAfter.roleName !== databaseBefore.roleName ||
      databaseAfter.auditCount !== 0 ||
      readinessAfter.bodyHash !== readinessBefore.bodyHash
    ) fail("operational_negative_signed_out_transport_invalid", "Signed-out private read did not stop at the transport boundary.");
    assertM1BOperationalNegativeSafeValue(body, "signedOutProblem");
    const capturedAt = new Date().toISOString();
    return Object.freeze({
      schemaVersion: "m1_b_negative_source_observation.v2",
      group: "authorization",
      id: "signed_out_private_read",
      sourceMode: "exact_source_transport",
      capturedAt,
      requestId,
      correlationId,
      outwardStatus: response.status,
      outwardCode: body.code,
      outwardBody: Object.freeze({
        type: body.type,
        title: body.title,
        status: body.status,
        code: body.code,
        requestId: body.requestId
      }),
      authorizationAuditEventId: null,
      authorizationDecision: "transport_rejected",
      authorizationReasonCode: "authentication_required",
      protectedStateBeforeHash: null,
      protectedStateAfterHash: null,
      databaseProof: "not_applicable_transport_boundary",
      additionalEffectCount: 0,
      nonEnumerating: true,
      duplicateSemantics: null,
      producerVerified: true,
      boundary: Object.freeze({
        tenantAuditCreated: false,
        databaseStartedAt,
        databaseRoleName: databaseAfter.roleName,
        readinessBeforeHash: readinessBefore.bodyHash,
        readinessAfterHash: readinessAfter.bodyHash,
        noCookieSent: true,
        noAuthorizationSent: true,
        noCsrfSent: true
      })
    });
  } finally {
    await pool.end();
  }
}

export function encodeM1BOperationalNegativeCaseDiagnostic(observation) {
  validateSourceObservation(observation);
  return `${CASE_DIAGNOSTIC_PREFIX}${Buffer.from(canonicalJson(observation)).toString("base64url")}`;
}

export function encodeM1BOperationalTrustedRegressionTapDiagnostics(
  observation
) {
  validateSourceObservation(observation);
  const tapBytes = trustedTapByObservation.get(observation);
  if (
    !Buffer.isBuffer(tapBytes) ||
    observation.sourceMode === "exact_source_transport" ||
    sha256(tapBytes) !== observation.trustedRegression.tapSha256
  ) fail("operational_negative_trusted_tap_invalid", "Trusted regression TAP bytes are unavailable.");
  const parsed = parseM1BOperationalNodeTestTap(tapBytes, {
    expectedTestName: observation.trustedRegression.testName
  });
  if (parsed.tapSha256 !== observation.trustedRegression.tapSha256) {
    fail("operational_negative_trusted_tap_invalid", "Trusted regression TAP digest changed.");
  }
  const count = Math.ceil(tapBytes.length / TRUSTED_TAP_CHUNK_BYTES);
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const chunk = tapBytes.subarray(
      index * TRUSTED_TAP_CHUNK_BYTES,
      Math.min((index + 1) * TRUSTED_TAP_CHUNK_BYTES, tapBytes.length)
    );
    return `${TRUSTED_TAP_CHUNK_PREFIX}${parsed.tapSha256}:${index}:${count}:${chunk.toString("base64url")}`;
  }));
}

function validRegressionDatabaseReadback(observation) {
  const readback = observation.regressionAssertions?.databaseReadback;
  const postgres = observation.sourceMode === "exact_source_disposable_postgres";
  if (!postgres) {
    return observation.regressionAssertions?.actualDatabaseReadback === false &&
      readback === null;
  }
  const regression = POSTGRES_REGRESSIONS[`${observation.group}:${observation.id}`];
  const expectedAuditRows = regression?.duplicate
    ? 2
    : regression?.requiresDenyAudit
      ? 1
      : 0;
  if (
    observation.regressionAssertions?.actualDatabaseReadback === true &&
    exactKeys(readback, [
      "schemaVersion",
      "outwardResponseHash",
      "authorizationAuditRows",
      "authorizationAuditEvents",
      "authorizationAuditSetHash",
      "protectedStateBefore",
      "protectedStateAfter",
      "protectedStateBeforeHash",
      "protectedStateAfterHash"
    ]) &&
    readback.schemaVersion === "m1_b_negative_database_readback.v2" &&
    readback.outwardResponseHash === manifestHash(observation.outwardBody) &&
    readback.authorizationAuditRows === expectedAuditRows &&
    Array.isArray(readback.authorizationAuditEvents) &&
    readback.authorizationAuditRows === readback.authorizationAuditEvents.length &&
    readback.authorizationAuditSetHash ===
      manifestHash(readback.authorizationAuditEvents) &&
    readback.protectedStateBeforeHash ===
      observation.protectedStateBeforeHash &&
    readback.protectedStateAfterHash === observation.protectedStateAfterHash
  ) {
    try {
      assertM1BOperationalProtectedStateManifestPair(readback);
    } catch {
      return false;
    }
    return regression.duplicate
      ? readback.authorizationAuditEvents.every(
          ({ authorizationDecision }) => authorizationDecision === "allow"
        )
      : regression.requiresDenyAudit
        ? readback.authorizationAuditEvents.length === 1 &&
          readback.authorizationAuditEvents[0].authorizationDecision === "deny"
        : readback.authorizationAuditEvents.length === 0;
  }
  return false;
}

function validateSourceObservation(observation) {
  const transport = observation?.sourceMode === "exact_source_transport";
  const postgres = observation?.sourceMode ===
    "exact_source_disposable_postgres";
  const duplicate = observation?.group === "human" &&
    observation?.id === "duplicate_acceptance";
  const expectedKeys = [
    "schemaVersion", "group", "id", "sourceMode", "capturedAt", "requestId",
    "correlationId", "outwardStatus", "outwardCode", "outwardBody",
    "authorizationAuditEventId", "authorizationDecision", "authorizationReasonCode",
    "protectedStateBeforeHash", "protectedStateAfterHash", "databaseProof",
    "additionalEffectCount", "nonEnumerating", "duplicateSemantics",
    "producerVerified", ...(transport
      ? ["boundary"]
      : ["regressionAssertions", "trustedRegression"])
  ];
  if (
    !exactKeys(observation, expectedKeys) ||
    observation.schemaVersion !== "m1_b_negative_source_observation.v2" ||
    observation.sourceMode !== definitionFor(observation.group, observation.id)?.sourceMode ||
    !REQUEST_IDENTIFIER.test(observation.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(observation.correlationId ?? "") ||
    !IDENTIFIER.test(observation.authorizationDecision ?? "") ||
    !IDENTIFIER.test(observation.authorizationReasonCode ?? "") ||
    observation.additionalEffectCount !== 0 ||
    observation.producerVerified !== true
  ) fail("operational_negative_source_observation_invalid", "Exact-source negative observation is invalid.");
  canonicalIso(observation.capturedAt);
  assertM1BOperationalNegativeSafeValue(observation, "sourceObservation");
  if (transport) {
    if (
      !exactKeys(observation.boundary, [
        "tenantAuditCreated",
        "databaseStartedAt",
        "databaseRoleName",
        "readinessBeforeHash",
        "readinessAfterHash",
        "noCookieSent",
        "noAuthorizationSent",
        "noCsrfSent"
      ]) ||
      observation.outwardStatus < 400 || observation.outwardStatus > 499 ||
      !IDENTIFIER.test(observation.outwardCode ?? "") ||
      observation.authorizationAuditEventId !== null ||
      observation.authorizationDecision !== "transport_rejected" ||
      observation.protectedStateBeforeHash !== null ||
      observation.protectedStateAfterHash !== null ||
      observation.databaseProof !== "not_applicable_transport_boundary" ||
      observation.boundary.tenantAuditCreated !== false ||
      !Number.isFinite(Date.parse(observation.boundary.databaseStartedAt)) ||
      new Date(observation.boundary.databaseStartedAt).toISOString() !==
        observation.boundary.databaseStartedAt ||
      observation.boundary.databaseRoleName !== "ipo_one_private_pilot_app" ||
      !HASH.test(observation.boundary.readinessBeforeHash ?? "") ||
      observation.boundary.readinessBeforeHash !==
        observation.boundary.readinessAfterHash ||
      observation.boundary.noCookieSent !== true ||
      observation.boundary.noAuthorizationSent !== true ||
      observation.boundary.noCsrfSent !== true ||
      observation.nonEnumerating !== true ||
      observation.duplicateSemantics !== null
    ) fail("operational_negative_source_observation_invalid", "Transport observation falsely claims Tenant execution.");
  } else if (
    !new Set(["exact_source_disposable_postgres", "exact_source_ui_binding"])
      .has(observation.sourceMode) ||
    !SHA256.test(observation.trustedRegression.tapSha256 ?? "") ||
    observation.trustedRegression.parser !== "node_test_tap_v13" ||
    observation.trustedRegression.exitCode !== 0 ||
    observation.regressionAssertions.schemaVersion !==
      "m1_b_negative_regression_assertions.v2" ||
    !exactKeys(observation.regressionAssertions, [
      "schemaVersion",
      "assertedOutwardStatus",
      "assertedOutwardCode",
      "protectedStateEqualityAsserted",
      "additionalEffectCountAsserted",
      "responseBytesCaptured",
      "databaseSnapshotHashesCaptured",
      "actualDatabaseReadback",
      "databaseReadback",
      "sourceAssertionHash",
      "compositeConfirmationRegression"
    ]) ||
    !Number.isSafeInteger(observation.regressionAssertions.assertedOutwardStatus) ||
    observation.regressionAssertions.assertedOutwardStatus < 200 ||
    observation.regressionAssertions.assertedOutwardStatus > 499 ||
    !IDENTIFIER.test(observation.regressionAssertions.assertedOutwardCode ?? "") ||
    observation.regressionAssertions.protectedStateEqualityAsserted !== true ||
    observation.regressionAssertions.additionalEffectCountAsserted !== 0 ||
    observation.regressionAssertions.responseBytesCaptured !== false ||
    !validRegressionDatabaseReadback(observation) ||
    !HASH.test(observation.regressionAssertions.sourceAssertionHash ?? "") ||
    observation.nonEnumerating !== !duplicate ||
    observation.duplicateSemantics !== (duplicate
      ? "exact_replay_status_200_no_second_effects"
      : null)
  ) fail("operational_negative_source_observation_invalid", "Exact-source regression assertion proof is invalid.");
  if (!transport && postgres) {
    const regression = POSTGRES_REGRESSIONS[
      `${observation.group}:${observation.id}`
    ];
    if (
      !regression ||
      observation.outwardStatus !== regression.outwardStatus ||
      observation.outwardCode !== regression.outwardCode ||
      observation.outwardBody?.status !== observation.outwardStatus ||
      observation.outwardBody?.code !== observation.outwardCode ||
      observation.outwardBody?.requestId !== observation.requestId ||
      !HASH.test(observation.protectedStateBeforeHash ?? "") ||
      observation.protectedStateBeforeHash !==
        observation.protectedStateAfterHash ||
      observation.databaseProof !== "disposable_postgres_owner_readback" ||
      observation.regressionAssertions.assertedOutwardStatus !==
        observation.outwardStatus ||
      observation.regressionAssertions.assertedOutwardCode !==
        observation.outwardCode ||
      observation.regressionAssertions.databaseSnapshotHashesCaptured !== true
    ) fail("operational_negative_source_observation_invalid", "PostgreSQL observation is not an actual equal-state target-operation readback.");
  } else if (!transport && (
    observation.outwardStatus !== null ||
    observation.outwardCode !== null ||
    observation.outwardBody !== null ||
    observation.protectedStateBeforeHash !== null ||
    observation.protectedStateAfterHash !== null ||
    observation.databaseProof !== "exact_source_ui_binding_regression" ||
    observation.regressionAssertions.databaseSnapshotHashesCaptured !== false
  )) fail("operational_negative_source_observation_invalid", "UI binding regression falsely claims runtime response or database snapshots.");
  return observation;
}

function assertTrustedRegressionTapBinding(parsedOuterTap, observation) {
  const regression = observation.sourceMode !== "exact_source_transport";
  if (!regression) {
    if (
      parsedOuterTap.trustedTapBytes !== null ||
      parsedOuterTap.trustedTapSha256 !== null
    ) fail("operational_negative_trusted_tap_invalid", "Transport proof cannot embed regression TAP.");
    return null;
  }
  if (
    !Buffer.isBuffer(parsedOuterTap.trustedTapBytes) ||
    parsedOuterTap.trustedTapSha256 !== observation.trustedRegression.tapSha256
  ) fail("operational_negative_trusted_tap_invalid", "Exact-source proof is missing captured trusted regression TAP bytes.");
  const parsedRegression = parseM1BOperationalNodeTestTap(
    parsedOuterTap.trustedTapBytes,
    { expectedTestName: observation.trustedRegression.testName }
  );
  if (
    parsedRegression.tapSha256 !== observation.trustedRegression.tapSha256 ||
    parsedRegression.parser !== observation.trustedRegression.parser ||
    observation.trustedRegression.exitCode !== 0
  ) fail("operational_negative_trusted_tap_invalid", "Captured regression TAP does not bind the exact named source case.");
  if (observation.sourceMode === "exact_source_disposable_postgres") {
    const definition = definitionFor(observation.group, observation.id);
    const caseRegression = POSTGRES_REGRESSIONS[
      `${observation.group}:${observation.id}`
    ];
    const runId = observation.requestId.startsWith(caseRegression?.requestPrefix)
      ? observation.requestId.slice(caseRegression.requestPrefix.length)
      : "";
    const matches = parsedRegression.postgresCaseDiagnostics.filter(
      (diagnostic) => diagnostic?.group === observation.group &&
        diagnostic?.id === observation.id
    );
    if (
      !definition ||
      !caseRegression ||
      !/^[0-9a-f]{10}$/.test(runId) ||
      matches.length !== 1
    ) {
      fail("operational_negative_trusted_tap_invalid", "Captured PostgreSQL TAP is missing the exact target-operation diagnostic.");
    }
    const diagnostic = validatePostgresCaseDiagnostic({
      diagnostic: matches[0],
      definition,
      regression: caseRegression,
      runId
    });
    const expectedObservation = postgresObservationFromDiagnostic({
      diagnostic,
      definition,
      regression: caseRegression,
      runId,
      trustedRegression: observation.trustedRegression
    });
    if (canonicalJson(expectedObservation) !== canonicalJson(observation)) {
      fail("operational_negative_trusted_tap_invalid", "PostgreSQL proof is not derived from its captured target-operation diagnostic.");
    }
  }
  return parsedOuterTap.trustedTapBytes;
}

async function sourceFilesFor(definition) {
  return Promise.all(definition.sourcePaths.map(async (path) => Object.freeze({
    path,
    sha256: sha256(await readFile(resolve(ROOT, path)))
  })));
}

function sameSourceFiles(before, after) {
  return before.length === after.length && before.every((entry, index) =>
    entry.path === after[index].path && entry.sha256 === after[index].sha256
  );
}

async function assertExactSourceFiles(definition, sourceFiles) {
  if (
    !Array.isArray(sourceFiles) ||
    sourceFiles.length !== definition.sourcePaths.length
  ) fail("operational_negative_source_files_invalid", "Exact ordered source digests are required.");
  const expected = await sourceFilesFor(definition);
  for (const [index, sourceFile] of sourceFiles.entries()) {
    if (
      !exactKeys(sourceFile, ["path", "sha256"]) ||
      sourceFile.path !== expected[index].path ||
      sourceFile.sha256 !== expected[index].sha256
    ) fail("operational_negative_source_files_invalid", "Exact source digest does not match the candidate tree checkout.");
  }
  return Object.freeze(sourceFiles.map((entry) => Object.freeze({ ...entry })));
}

export async function createM1BOperationalExactSourceRunFromTap({
  definition,
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  tapBytes,
  exitCode,
  sourceFiles
}) {
  assertCandidateContext({ candidateReleaseId, sourceTreeHash, runtimeImageId });
  const authoritative = definitionFor(definition?.group, definition?.id);
  if (
    !authoritative ||
    authoritative.sourceMode === "live_post_restart" ||
    canonicalJson(definition) !== canonicalJson(authoritative) ||
    exitCode !== 0
  ) fail("operational_negative_exact_source_run_invalid", "External exact-source definition or exit status is invalid.");
  const parsed = parseM1BOperationalNodeTestTap(tapBytes, {
    expectedTestName: authoritative.subtestName,
    requireDiagnostic: true
  });
  const observation = validateSourceObservation(parsed.diagnostic);
  if (
    observation.group !== authoritative.group ||
    observation.id !== authoritative.id
  ) fail("operational_negative_tap_diagnostic_invalid", "TAP diagnostic belongs to another negative case.");
  const trustedRegressionTapBytes = assertTrustedRegressionTapBinding(
    parsed,
    observation
  );
  const validatedSourceFiles = await assertExactSourceFiles(
    authoritative,
    sourceFiles
  );
  return Object.freeze({
    schemaVersion: "m1_b_negative_exact_source_run.v2",
    definition: authoritative,
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    capturedAt: observation.capturedAt,
    observation,
    testCommand: authoritative.testCommand,
    tapBytes,
    tapSha256: parsed.tapSha256,
    exitCode,
    tapParser: parsed.parser,
    exactNamedPassCount: parsed.exactPassCount,
    trustedRegressionTapBytes,
    sourceFiles: validatedSourceFiles
  });
}

export async function runM1BOperationalExactSourceNegativeCase({
  group,
  id,
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  environment = process.env
}) {
  assertCandidateContext({ candidateReleaseId, sourceTreeHash, runtimeImageId });
  const definition = getM1BOperationalNegativeCaseDefinition(group, id);
  if (definition.sourceMode === "live_post_restart") {
    fail("operational_negative_source_mode_invalid", "Live cases cannot be produced from TAP.");
  }
  if (definition.sourceMode === "exact_source_disposable_postgres") {
    disposableDatabaseUrl(environment);
  }
  const beforeSources = await sourceFilesFor(definition);
  const command = runCommand([
    "--test",
    "--test-reporter=tap",
    "--test-name-pattern",
    definition.subtestName,
    TEST_FILE
  ], { environment, timeout: 240_000 });
  const parsed = parseM1BOperationalNodeTestTap(command.tapBytes, {
    expectedTestName: definition.subtestName,
    requireDiagnostic: true
  });
  const observation = validateSourceObservation(parsed.diagnostic);
  if (observation.group !== group || observation.id !== id) {
    fail("operational_negative_tap_diagnostic_invalid", "TAP diagnostic belongs to another negative case.");
  }
  const trustedRegressionTapBytes = assertTrustedRegressionTapBinding(
    parsed,
    observation
  );
  const afterSources = await sourceFilesFor(definition);
  if (!sameSourceFiles(beforeSources, afterSources)) {
    fail("operational_negative_source_drift", "Exact-source files changed during the negative run.");
  }
  return Object.freeze({
    schemaVersion: "m1_b_negative_exact_source_run.v2",
    definition,
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    capturedAt: observation.capturedAt,
    observation,
    testCommand: definition.testCommand,
    tapBytes: command.tapBytes,
    tapSha256: parsed.tapSha256,
    exitCode: command.exitCode,
    tapParser: parsed.parser,
    exactNamedPassCount: parsed.exactPassCount,
    trustedRegressionTapBytes,
    sourceFiles: Object.freeze(beforeSources)
  });
}

function proofSourceEvidence(definition, {
  supportingArtifacts = [],
  exactSourceRun = null
} = {}) {
  if (definition.sourceMode === "live_post_restart") {
    return Object.freeze({
      operationId: definition.operationId,
      subtestName: definition.subtestName,
      supportingArtifacts,
      testCommand: null,
      tapSha256: null,
      exitCode: null,
      tapParser: null,
      sourceFiles: Object.freeze([])
    });
  }
  return Object.freeze({
    operationId: definition.operationId,
    subtestName: definition.subtestName,
    supportingArtifacts: Object.freeze([]),
    testCommand: definition.testCommand,
    tapSha256: exactSourceRun.tapSha256,
    exitCode: exactSourceRun.exitCode,
    tapParser: exactSourceRun.tapParser,
    sourceFiles: exactSourceRun.sourceFiles
  });
}

function proofFromObservation(observation, {
  definition,
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  sourceEvidence
}) {
  return Object.freeze({
    proofKind: observation.regressionAssertions
      ? definition.sourceMode === "exact_source_disposable_postgres"
        ? "exact_source_postgres_observation"
        : "exact_source_regression_assertion"
      : "runtime_observation",
    group: definition.group,
    id: definition.id,
    sourceMode: definition.sourceMode,
    caseDefinitionHash: definition.caseDefinitionHash,
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    capturedAt: observation.capturedAt,
    requestId: observation.requestId,
    correlationId: observation.correlationId,
    outwardStatus: observation.outwardStatus,
    outwardCode: observation.outwardCode,
    outwardResponseHash: observation.outwardBody === null
      ? null
      : manifestHash(observation.outwardBody),
    authorizationAuditEventId: observation.authorizationAuditEventId,
    authorizationDecision: observation.authorizationDecision,
    authorizationReasonCode: observation.authorizationReasonCode,
    protectedStateBeforeHash: observation.protectedStateBeforeHash,
    protectedStateAfterHash: observation.protectedStateAfterHash,
    databaseProof: observation.databaseProof,
    additionalEffectCount: observation.additionalEffectCount,
    nonEnumerating: observation.nonEnumerating,
    duplicateSemantics: observation.duplicateSemantics,
    regressionAssertions: observation.regressionAssertions ?? null,
    sourceEvidence,
    producerVerified: true
  });
}

export function createM1BOperationalExactSourceNegativeProof(exactSourceRun) {
  assertCandidateContext(exactSourceRun ?? {});
  const authoritative = definitionFor(
    exactSourceRun?.definition?.group,
    exactSourceRun?.definition?.id
  );
  if (
    exactSourceRun?.schemaVersion !== "m1_b_negative_exact_source_run.v2" ||
    !authoritative ||
    authoritative.sourceMode === "live_post_restart" ||
    canonicalJson(exactSourceRun.definition) !== canonicalJson(authoritative) ||
    !Buffer.isBuffer(exactSourceRun.tapBytes) ||
    sha256(exactSourceRun.tapBytes) !== exactSourceRun.tapSha256 ||
    exactSourceRun.exitCode !== 0 ||
    exactSourceRun.tapParser !== "node_test_tap_v13" ||
    exactSourceRun.testCommand !== authoritative.testCommand ||
    exactSourceRun.exactNamedPassCount !== 1 ||
    exactSourceRun.capturedAt !== exactSourceRun.observation?.capturedAt ||
    !Array.isArray(exactSourceRun.sourceFiles) ||
    exactSourceRun.sourceFiles.length !== authoritative.sourcePaths.length ||
    exactSourceRun.sourceFiles.some((sourceFile, index) =>
      !exactKeys(sourceFile, ["path", "sha256"]) ||
      sourceFile.path !== authoritative.sourcePaths[index] ||
      !SHA256.test(sourceFile.sha256 ?? "")
    )
  ) fail("operational_negative_exact_source_run_invalid", "Exact-source run is invalid.");
  const reparsed = parseM1BOperationalNodeTestTap(exactSourceRun.tapBytes, {
    expectedTestName: authoritative.subtestName,
    requireDiagnostic: true
  });
  const reparsedTrustedTapBytes = assertTrustedRegressionTapBinding(
    reparsed,
    reparsed.diagnostic
  );
  if (
    reparsed.tapSha256 !== exactSourceRun.tapSha256 ||
    canonicalJson(reparsed.diagnostic) !==
      canonicalJson(exactSourceRun.observation) ||
    reparsed.diagnostic.group !== authoritative.group ||
    reparsed.diagnostic.id !== authoritative.id ||
    (reparsedTrustedTapBytes === null
      ? exactSourceRun.trustedRegressionTapBytes !== null
      : !Buffer.isBuffer(exactSourceRun.trustedRegressionTapBytes) ||
        !reparsedTrustedTapBytes.equals(
          exactSourceRun.trustedRegressionTapBytes
        ))
  ) fail("operational_negative_exact_source_run_invalid", "Exact-source TAP diagnostic is not bound to the proof case.");
  const { definition } = exactSourceRun;
  return proofFromObservation(exactSourceRun.observation, {
    definition,
    candidateReleaseId: exactSourceRun.candidateReleaseId,
    sourceTreeHash: exactSourceRun.sourceTreeHash,
    runtimeImageId: exactSourceRun.runtimeImageId,
    sourceEvidence: proofSourceEvidence(definition, { exactSourceRun })
  });
}

const LIVE_SUPPORTING_ARTIFACT_IDS = Object.freeze({
  "human:expired_offer": Object.freeze({
    required: Object.freeze(["human_critical", "expired_offer_setup"]),
    optional: Object.freeze([])
  }),
  "human:replaced_stale_offer": Object.freeze({
    required: Object.freeze(["capital_partner_critical"]),
    optional: Object.freeze([])
  }),
  "human:unauthorized_subject": Object.freeze({
    required: Object.freeze([
      "human_critical",
      "agent_foreign_offer_setup"
    ]),
    optional: Object.freeze(["agent_before"])
  }),
  "authorization:cross_role_private_read": Object.freeze({
    required: Object.freeze(["capital_partner_critical", "human_critical"]),
    optional: Object.freeze([])
  })
});

function validateLiveSupportingArtifacts(definition, supportingArtifacts) {
  const contract = LIVE_SUPPORTING_ARTIFACT_IDS[
    `${definition.group}:${definition.id}`
  ];
  if (
    !contract ||
    !Array.isArray(supportingArtifacts) ||
    supportingArtifacts.length < contract.required.length ||
    supportingArtifacts.length >
      contract.required.length + contract.optional.length
  ) fail("operational_negative_live_artifacts_invalid", "Live negative proof requires its bounded critical receipt set.");
  const ids = new Set();
  const digests = new Set();
  const allowedIds = new Set([...contract.required, ...contract.optional]);
  const validated = supportingArtifacts.map((artifact) => {
    if (
      !exactKeys(artifact, ["id", "sha256"]) ||
      !IDENTIFIER.test(artifact.id ?? "") ||
      !SHA256.test(artifact.sha256 ?? "") ||
      !allowedIds.has(artifact.id) ||
      ids.has(artifact.id) ||
      digests.has(artifact.sha256)
    ) fail("operational_negative_live_artifacts_invalid", "Live critical receipt references must be exact and unique.");
    ids.add(artifact.id);
    digests.add(artifact.sha256);
    return Object.freeze({ ...artifact });
  });
  if (contract.required.some((id) => !ids.has(id))) {
    fail("operational_negative_live_artifacts_invalid", "Live negative proof is missing a required role/setup receipt.");
  }
  assertM1BOperationalNegativeSafeValue(validated, "liveSupportingArtifacts");
  return Object.freeze(validated);
}

function validLiveOutwardBody(body, requestId, status, code) {
  return (
    exactKeys(body, ["status", "code", "requestId", "schemaVersion"]) &&
    body.schemaVersion === "problem_details.v1" ||
    exactKeys(body, ["type", "title", "status", "code", "requestId"])
  ) && body.status === status && body.code === code &&
    body.requestId === requestId;
}

function createM1BOperationalLiveNegativeProofFromObservation({
  group,
  id,
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  supportingArtifacts,
  observation
}) {
  assertCandidateContext({ candidateReleaseId, sourceTreeHash, runtimeImageId });
  const definition = getM1BOperationalNegativeCaseDefinition(group, id);
  if (definition.sourceMode !== "live_post_restart") {
    fail("operational_negative_source_mode_invalid", "Only closed live post-restart cases use the live proof constructor.");
  }
  const artifacts = validateLiveSupportingArtifacts(
    definition,
    supportingArtifacts
  );
  if (!exactKeys(observation, [
    "schemaVersion",
    "group",
    "id",
    "capturedAt",
    "databaseStartedAt",
    "requestId",
    "correlationId",
    "outwardStatus",
    "outwardCode",
    "outwardBody",
    "authorizationAudit",
    "authorizationAuditSetHash",
    "protectedStateCatalogVersion",
    "protectedStateBeforeHash",
    "protectedStateAfterHash",
    "databaseProof",
    "additionalEffectCount",
    "nonEnumerating",
    "duplicateSemantics"
  ])) fail("operational_negative_live_observation_invalid", "Live negative observation is not the closed runtime projection.");
  const audit = observation.authorizationAudit;
  if (
    observation.schemaVersion !== "m1_b_negative_live_observation.v2" ||
    observation.group !== group ||
    observation.id !== id ||
    !REQUEST_IDENTIFIER.test(observation.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(observation.correlationId ?? "") ||
    !Number.isSafeInteger(observation.outwardStatus) ||
    observation.outwardStatus < 400 || observation.outwardStatus > 499 ||
    !IDENTIFIER.test(observation.outwardCode ?? "") ||
    !validLiveOutwardBody(
      observation.outwardBody,
      observation.requestId,
      observation.outwardStatus,
      observation.outwardCode
    ) ||
    !exactKeys(audit, [
      "eventId",
      "requestId",
      "correlationId",
      "operationId",
      "authorizationDecision",
      "reasonCode",
      "occurredAt"
    ]) ||
    !IDENTIFIER.test(audit.eventId ?? "") ||
    audit.requestId !== observation.requestId ||
    audit.correlationId !== observation.correlationId ||
    audit.operationId !== definition.operationId ||
    audit.authorizationDecision !== "deny" ||
    !IDENTIFIER.test(audit.reasonCode ?? "") ||
    observation.authorizationAuditSetHash !== manifestHash([audit]) ||
    !IDENTIFIER.test(observation.protectedStateCatalogVersion ?? "") ||
    !HASH.test(observation.protectedStateBeforeHash ?? "") ||
    observation.protectedStateBeforeHash !==
      observation.protectedStateAfterHash ||
    observation.databaseProof !== "main_post_restart_application_role" ||
    observation.additionalEffectCount !== 0 ||
    observation.nonEnumerating !== true ||
    observation.duplicateSemantics !== null
  ) fail("operational_negative_live_observation_invalid", "Live denial must bind one exact audit, one safe response, and equal protected state.");
  canonicalIso(observation.databaseStartedAt);
  canonicalIso(observation.capturedAt);
  canonicalIso(audit.occurredAt);
  if (
    Date.parse(audit.occurredAt) < Date.parse(observation.databaseStartedAt) ||
    Date.parse(observation.capturedAt) < Date.parse(audit.occurredAt)
  ) fail("operational_negative_live_predates_restart", "Live denial timing does not follow the exact database restart.");
  assertM1BOperationalNegativeSafeValue(observation, "liveObservation");
  return proofFromObservation({
    capturedAt: observation.capturedAt,
    requestId: observation.requestId,
    correlationId: observation.correlationId,
    outwardStatus: observation.outwardStatus,
    outwardCode: observation.outwardCode,
    outwardBody: observation.outwardBody,
    authorizationAuditEventId: audit.eventId,
    authorizationDecision: audit.authorizationDecision,
    authorizationReasonCode: audit.reasonCode,
    protectedStateBeforeHash: observation.protectedStateBeforeHash,
    protectedStateAfterHash: observation.protectedStateAfterHash,
    databaseProof: observation.databaseProof,
    additionalEffectCount: observation.additionalEffectCount,
    nonEnumerating: observation.nonEnumerating,
    duplicateSemantics: observation.duplicateSemantics
  }, {
    definition,
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    sourceEvidence: proofSourceEvidence(definition, {
      supportingArtifacts: artifacts
    })
  });
}

export async function captureM1BOperationalLiveNegativeProof(input) {
  if (
    !input || typeof input !== "object" ||
    Object.hasOwn(input, "observation") ||
    Object.hasOwn(input, "attemptEvidence") ||
    Object.hasOwn(input, "fixtureUsed") ||
    Object.hasOwn(input, "productionEvidenceEligible")
  ) fail(
    "operational_negative_live_capture_invalid",
    "Live negative proof can only be minted by the production database/browser capture."
  );
  const capture = await captureM1BOperationalLiveDenialBoundary(input);
  const negativeProof = createM1BOperationalLiveNegativeProofFromObservation({
    group: input.group,
    id: input.id,
    candidateReleaseId: input.candidateReleaseId,
    sourceTreeHash: input.sourceTreeHash,
    runtimeImageId: input.runtimeImageId,
    supportingArtifacts: input.supportingArtifacts,
    observation: capture.observation
  });
  const attemptReceipt = Object.freeze({
    ...capture.attemptReceipt,
    negativeProofHash: manifestHash(negativeProof)
  });
  return Object.freeze({ attemptReceipt, negativeProof });
}

export function deriveM1BReplacedStaleOfferNegativeProofFromCritical({
  criticalDocument,
  criticalArtifact,
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt
}) {
  assertCandidateContext({ candidateReleaseId, sourceTreeHash, runtimeImageId });
  canonicalIso(databaseStartedAt);
  if (
    criticalDocument?.schemaVersion !== "m1_b_capital_partner_critical_receipt.v1" ||
    criticalDocument.candidateReleaseId !== candidateReleaseId ||
    criticalDocument.databaseStartedAt !== databaseStartedAt ||
    !exactKeys(criticalArtifact, ["id", "sha256"]) ||
    !IDENTIFIER.test(criticalArtifact.id ?? "") ||
    !SHA256.test(criticalArtifact.sha256 ?? "")
  ) fail("operational_negative_critical_invalid", "Capital Partner critical binding is invalid.");
  const denial = criticalDocument.currentLineage?.staleOfferDenial;
  const audit = Object.freeze({
    eventId: denial?.authorizationAudit?.eventId,
    requestId: denial?.requestId,
    correlationId: denial?.correlationId,
    operationId: denial?.authorizationAudit?.operationId,
    authorizationDecision:
      denial?.authorizationAudit?.authorizationDecision ??
        denial?.authorizationAudit?.decision,
    reasonCode: denial?.authorizationAudit?.reasonCode,
    occurredAt: denial?.authorizationAudit?.occurredAt
  });
  return createM1BOperationalLiveNegativeProofFromObservation({
    group: "human",
    id: "replaced_stale_offer",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    supportingArtifacts: [criticalArtifact],
    observation: {
      schemaVersion: "m1_b_negative_live_observation.v2",
      group: "human",
      id: "replaced_stale_offer",
      capturedAt: denial?.verificationCapturedAt,
      databaseStartedAt,
      requestId: denial?.requestId,
      correlationId: denial?.correlationId,
      outwardStatus: denial?.outwardResponse?.responseProjection?.status,
      outwardCode: denial?.outwardResponse?.responseProjection?.code,
      outwardBody: denial?.outwardResponse?.responseProjection,
      authorizationAudit: audit,
      authorizationAuditSetHash: manifestHash([audit]),
      protectedStateCatalogVersion: denial?.protectedStateCatalogVersion,
      protectedStateBeforeHash: denial?.protectedStateBeforeHash,
      protectedStateAfterHash: denial?.protectedStateAfterHash,
      databaseProof: "main_post_restart_application_role",
      additionalEffectCount: denial?.businessMutationCount,
      nonEnumerating: true,
      duplicateSemantics: null
    }
  });
}

export function assertM1BOperationalNegativeProofIdentifiersUnique(proofs) {
  if (!Array.isArray(proofs) || proofs.length > 16) {
    fail("operational_negative_proof_set_invalid", "Operational negative proof list is invalid.");
  }
  const requests = new Set();
  const correlations = new Set();
  const audits = new Set();
  for (const proof of proofs) {
    if (
      !REQUEST_IDENTIFIER.test(proof?.requestId ?? "") ||
      !REQUEST_IDENTIFIER.test(proof?.correlationId ?? "") ||
      requests.has(proof.requestId) ||
      correlations.has(proof.correlationId) ||
      (proof.authorizationAuditEventId !== null &&
        (!IDENTIFIER.test(proof.authorizationAuditEventId ?? "") ||
          audits.has(proof.authorizationAuditEventId)))
    ) fail("operational_negative_identifier_reused", "Negative request, correlation, or audit identifier is reused.");
    requests.add(proof.requestId);
    correlations.add(proof.correlationId);
    if (proof.authorizationAuditEventId !== null) audits.add(proof.authorizationAuditEventId);
  }
  return true;
}

export function assertCompleteM1BOperationalNegativeProofSet(proofs) {
  if (!Array.isArray(proofs) || proofs.length !== 16) {
    fail("operational_negative_proof_set_incomplete", "The exact closed 16-case negative proof set is required.");
  }
  const cases = new Set();
  let candidate;
  for (const proof of proofs) {
    const definition = definitionFor(proof?.group, proof?.id);
    const key = `${proof?.group}:${proof?.id}`;
    if (
      !definition ||
      cases.has(key) ||
      proof.sourceMode !== definition.sourceMode ||
      proof.caseDefinitionHash !== definition.caseDefinitionHash ||
      proof.producerVerified !== true
    ) fail("operational_negative_proof_set_invalid", "Negative proof is duplicated or outside the closed registry.");
    assertCandidateContext(proof);
    const current = canonicalJson({
      candidateReleaseId: proof.candidateReleaseId,
      sourceTreeHash: proof.sourceTreeHash,
      runtimeImageId: proof.runtimeImageId
    });
    candidate ??= current;
    if (current !== candidate) {
      fail("operational_negative_candidate_mismatch", "All 16 negative proofs must bind the same exact candidate.");
    }
    cases.add(key);
  }
  if (M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.some(
    ({ group, id }) => !cases.has(`${group}:${id}`)
  )) fail("operational_negative_proof_set_incomplete", "The exact closed negative case registry is incomplete.");
  assertM1BOperationalNegativeProofIdentifiersUnique(proofs);
  return true;
}

export function pendingM1BOperationalLiveNegativeCases(proofs = []) {
  const observed = new Set(proofs.map(({ group, id }) => `${group}:${id}`));
  return M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS
    .filter(({ sourceMode, group, id }) =>
      sourceMode === "live_post_restart" && !observed.has(`${group}:${id}`)
    )
    .map(({ group, id }) => `${group}:${id}`);
}
