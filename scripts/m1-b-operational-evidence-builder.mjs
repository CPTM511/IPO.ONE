import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLocalStack } from "../packages/deployment-topology/src/index.js";
import { assertTenantProtocolRequest } from
  "../packages/api-contract/src/tenant-protocol.js";
import {
  verifyM1BAcceptanceEvidence
} from "../packages/release-governance/src/m1-b-acceptance-evidence.js";
import {
  M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS,
  M1_B_OPERATIONAL_NEGATIVE_CASES,
  assertCompleteM1BOperationalNegativeProofSet,
  assertM1BOperationalProtectedStateManifestPair,
  assertM1BOperationalNegativeProofIdentifiersUnique,
  deriveM1BReplacedStaleOfferNegativeProofFromCritical,
  getM1BOperationalNegativeCaseDefinition,
  pendingM1BOperationalLiveNegativeCases
} from "../apps/private-pilot/src/m1-b-operational-negative-acceptance.js";
import {
  runM1BOperationalExactSourceNegativeSuite
} from "./m1-b-operational-negative-orchestrator.mjs";
import {
  assertExactLocalReleaseSource,
  prepareLocalReleaseBuildContext,
  resolveLocalReleaseIdentity,
  resolveLocalReviewPorts
} from "./local-release-identity.mjs";
import {
  validateM1BAgentForeignOfferSetupReceipt,
  validateM1BAgentPhaseReceipt
} from "./m1-b-agent-phase-receipt.mjs";
import {
  DEFAULT_PRIVATE_PILOT_PROFILE
} from "../apps/private-pilot/src/private-pilot-profile.js";
import {
  createM1BExpiredOfferCriticalBinding,
  validateM1BExpiredOfferSetupReceipt
} from "../apps/private-pilot/src/m1-b-expired-offer-setup.js";
import {
  readM1BExpiredOfferSetupCliContext
} from "../apps/private-pilot/src/m1-b-expired-offer-setup-cli.js";
import {
  M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES,
  createM1BOperationalBrowserExpression,
  createM1BOperationalBrowserMeasurementPrompts,
  deriveM1BOperationalBrowserRow,
  parseM1BOperationalBrowserMeasurementResponseLine,
  validateM1BOperationalBrowserMeasurementPrompt,
  validateM1BOperationalBrowserPng
} from "../apps/private-pilot/src/m1-b-operational-browser-measurement.js";
import {
  M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_SCHEMA_VERSION,
  parseM1BOperationalBrowserReadContext,
  validateM1BOperationalBrowserAppRoleRead
} from "../apps/private-pilot/src/m1-b-operational-runtime-read.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTANCE = "ipo-one-local";
const COMPOSE_FILE = resolve(ROOT, "deploy/local/compose.yaml");
const ENV_FILE = resolve(ROOT, ".ipo-one/local-stack/stack.env");
const CONTRACT_FILE = resolve(ROOT, "deploy/local/stack.v1.json");
const SECRET_DIRECTORY = resolve(ROOT, ".ipo-one/local-stack");
const DATABASE_SECRET_FILE = resolve(SECRET_DIRECTORY, "private-pilot-db-secret");
const AGENT_DIRECTORY = resolve(SECRET_DIRECTORY, "agent-workflows");
const RESTART_OBSERVATION_DIRECTORY = resolve(
  SECRET_DIRECTORY,
  "m1-b-restart-observations"
);
const RUNTIME_READER = "apps/private-pilot/src/m1-b-operational-runtime-read.js";
const RUNTIME_READER_COMPOSE_PROJECT = "ipo-one-m1-b-evidence-reader";
const RUNTIME_READER_COMPOSE_SERVICE = "runtime-reader";
const LIVE_NEGATIVE_CLI =
  "apps/private-pilot/src/m1-b-operational-live-negative-cli.js";
const EXPIRED_OFFER_SETUP_CLI =
  "apps/private-pilot/src/m1-b-expired-offer-setup-cli.js";
const MAX_NDJSON_BYTES = 4 * 1024 * 1024;
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/%-]{1,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const EXPIRED_OFFER_SETUP_HUMAN_OPERATIONS = Object.freeze([
  "pilotCreateConsent",
  "pilotReadHumanSelf",
  "pilotRequestCredit",
  "pilotReadCreditApplication",
  "pilotEvaluateCreditApplication",
  "pilotCreateCreditPassportArtifact"
]);
const EXPIRED_OFFER_SETUP_CAPITAL_PARTNER_OPERATIONS = Object.freeze([
  "pilotReadCapitalPartnerPassportInbox",
  "pilotAuthorCapitalPartnerOffer"
]);

export const M1_B_OPERATIONAL_ROLES = Object.freeze([
  "human",
  "principal_agent",
  "capital_partner"
]);
export const M1_B_OPERATIONAL_BROWSER_CHECKS = Object.freeze([
  "desktop",
  "mobile",
  "reload",
  "fresh_browser_context",
  "back_forward",
  "sign_out_relogin",
  "negative_authorization",
  "restart_recovery"
]);
export const M1_B_OPERATIONAL_BROWSER_AUTHENTICATION_MODES = Object.freeze({
  human: "human_invited_wallet_siwe",
  principal_agent: "principal_wallet_siwe",
  capital_partner: "capital_partner_invited_wallet_siwe"
});
export const M1_B_OPERATIONAL_BROWSER_ASSERTIONS = Object.freeze({
  desktop: Object.freeze([
    "runtime_captured_workspace_projection_reconciled",
    "primary_action_visible",
    "desktop_layout_has_no_horizontal_overflow"
  ]),
  mobile: Object.freeze([
    "runtime_captured_workspace_projection_reconciled",
    "primary_action_visible",
    "mobile_layout_has_no_horizontal_overflow"
  ]),
  reload: Object.freeze([
    "runtime_captured_workspace_recovered_after_reload",
    "private_query_succeeds_after_reload",
    "expected_primary_action_visible_and_enabled"
  ]),
  fresh_browser_context: Object.freeze([
    "fresh_context_requires_wallet_siwe",
    "signed_out_context_hides_private_surface",
    "runtime_captured_workspace_recovered_after_fresh_authentication"
  ]),
  back_forward: Object.freeze([
    "history_navigation_preserves_runtime_captured_projection",
    "history_navigation_uses_read_only_private_query",
    "expected_primary_action_visible_and_enabled"
  ]),
  sign_out_relogin: Object.freeze([
    "private_state_hidden_after_sign_out",
    "relogin_requires_wallet_siwe",
    "runtime_captured_workspace_recovered_after_relogin"
  ]),
  negative_authorization: Object.freeze([
    "closed_negative_receipt_linked",
    "private_workspace_remains_queryable",
    "negative_case_zero_effect_proof_linked"
  ]),
  restart_recovery: Object.freeze([
    "sole_restart_and_runtime_projection_reconciled",
    "private_query_succeeds_after_sole_restart",
    "expected_primary_action_visible_and_enabled"
  ])
});
export const M1_B_OPERATIONAL_JOURNEY_STEPS = Object.freeze({
  human: Object.freeze([
    "sign_in",
    "subject_consent",
    "credit_request",
    "decision_offer",
    "reload_relogin",
    "offer_recovery",
    "acceptance",
    "obligation",
    "controlled_sandbox_execution",
    "repayment",
    "evidence"
  ]),
  principal_agent: Object.freeze([
    "principal_sign_in",
    "agent_subject",
    "account_proof",
    "mandate",
    "agent_application",
    "offer",
    "acceptance",
    "mcp_execution",
    "repayment",
    "evidence",
    "restart_recovery"
  ]),
  capital_partner: Object.freeze([
    "partner_sign_in",
    "passport_review",
    "author_offer",
    "replace_offer",
    "withdraw_offer",
    "borrower_recovers_current_offer"
  ])
});
export const M1_B_OPERATIONAL_UI_CHECKPOINT_BROWSER_BINDINGS = Object.freeze({
  human: Object.freeze({
    sign_in: "fresh_browser_context",
    reload_relogin: "sign_out_relogin"
  }),
  principal_agent: Object.freeze({
    principal_sign_in: "fresh_browser_context",
    account_proof: "desktop"
  }),
  capital_partner: Object.freeze({
    partner_sign_in: "fresh_browser_context"
  })
});
export const M1_B_OPERATIONAL_JOURNEY_TRANSPORTS = Object.freeze({
  human: Object.freeze(Object.fromEntries(
    M1_B_OPERATIONAL_JOURNEY_STEPS.human.map((step) => [step, "human_web"])
  )),
  principal_agent: Object.freeze({
    principal_sign_in: "human_web",
    agent_subject: "human_web",
    account_proof: "human_web",
    mandate: "human_web",
    agent_application: "agent_mcp",
    offer: "agent_mcp",
    acceptance: "agent_mcp",
    mcp_execution: "agent_mcp",
    repayment: "agent_mcp",
    evidence: "agent_mcp",
    restart_recovery: "agent_mcp"
  }),
  capital_partner: Object.freeze(Object.fromEntries(
    M1_B_OPERATIONAL_JOURNEY_STEPS.capital_partner.map((step) => [step, "human_web"])
  ))
});
export {
  M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS,
  M1_B_OPERATIONAL_NEGATIVE_CASES
};

const FORBIDDEN_KEY = Object.freeze([
  "authorization",
  "cookie",
  "csrf",
  "session",
  "token",
  "jwt",
  "signature",
  "walletaddress",
  "accountaddress",
  "privatekey",
  "seedphrase",
  "mnemonic",
  "databaseurl",
  "connectionstring",
  "password",
  "secret",
  "apikey",
  "requestheader",
  "requestbody",
  "selectedclaims",
  "disclosures",
  "issuer",
  "rawpii",
  "displayname",
  "email",
  "phone"
]);
const FORBIDDEN_VALUE = Object.freeze([
  /^0x[0-9a-f]{40}$/i,
  /^0x[0-9a-f]{130}$/i,
  /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/,
  /-----BEGIN [A-Z0-9 ]+-----/,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/\S+/i,
  /(?:^|;\s*)(?:session|auth|token|csrf|jwt|cookie)[A-Za-z0-9_.-]*=[^;\s]+/i,
  /^(?:bearer|basic)\s+\S+/i
]);
const SAFE_FALSE_KEYS = new Set([
  "sessionMaterialCaptured"
]);

export class M1BOperationalEvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BOperationalEvidenceError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BOperationalEvidenceError(code, message);
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

function iso(value, code = "operational_timestamp_invalid") {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) fail(code, "Operational Evidence requires canonical UTC timestamps.");
  return value;
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

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function safeKey(key) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return !FORBIDDEN_KEY.some((fragment) => normalized.includes(fragment));
}

export function assertM1BOperationalSafeValue(value, path = "observation") {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return true;
  }
  if (typeof value === "string") {
    if (value.length > 2_048 || FORBIDDEN_VALUE.some((pattern) => pattern.test(value))) {
      fail("operational_observation_sensitive", `${path} contains forbidden material.`);
    }
    return true;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) fail("operational_observation_oversized", `${path} is too large.`);
    value.forEach((entry, index) => assertM1BOperationalSafeValue(entry, `${path}[${index}]`));
    return true;
  }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("operational_observation_invalid", `${path} is not plain JSON.`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (!safeKey(key)) {
      if (SAFE_FALSE_KEYS.has(key) && entry === false) continue;
      fail("operational_observation_sensitive", `${path}.${key} is forbidden.`);
    }
    assertM1BOperationalSafeValue(entry, `${path}.${key}`);
  }
  return true;
}

function validateBrowserObservation(value) {
  if (!exactKeys(value, [
    "type",
    "role",
    "check",
    "capturedAt",
    "origin",
    "driver",
    "authentication",
    "diagnostics",
    "assertions",
    "negativeCase",
    "visualArtifact"
  ]) || value.type !== "browser_row") {
    fail("operational_browser_observation_invalid", "Browser observation shape is invalid.");
  }
  if (
    !M1_B_OPERATIONAL_ROLES.includes(value.role) ||
    !M1_B_OPERATIONAL_BROWSER_CHECKS.includes(value.check) ||
    !new Set(["playwright_cli", "chrome_control"]).has(value.driver) ||
    !exactKeys(value.authentication, [
      "mode",
      "bypassUsed",
      "sessionMaterialCaptured"
    ]) ||
    value.authentication.mode !== M1_B_OPERATIONAL_BROWSER_AUTHENTICATION_MODES[value.role] ||
    value.authentication.bypassUsed !== false ||
    value.authentication.sessionMaterialCaptured !== false ||
    !exactKeys(value.diagnostics, [
      "consoleErrorCount",
      "failedNetworkRequestCount",
      "observationMethod"
    ]) ||
    value.diagnostics.consoleErrorCount !== 0 ||
    value.diagnostics.failedNetworkRequestCount !== 0 ||
    !new Set([
      "playwright_console_and_network",
      "chrome_console_and_network"
    ]).has(value.diagnostics.observationMethod) ||
    (value.driver === "playwright_cli" &&
      value.diagnostics.observationMethod !== "playwright_console_and_network") ||
    (value.driver === "chrome_control" &&
      value.diagnostics.observationMethod !== "chrome_console_and_network") ||
    !Array.isArray(value.assertions) ||
    value.assertions.length !== M1_B_OPERATIONAL_BROWSER_ASSERTIONS[value.check]?.length ||
    value.assertions.some((assertion, index) =>
      !exactKeys(assertion, ["id", "passed"]) ||
      assertion.id !== M1_B_OPERATIONAL_BROWSER_ASSERTIONS[value.check][index] ||
      assertion.passed !== true
    ) ||
    (value.check === "negative_authorization"
      ? !exactKeys(value.negativeCase, ["group", "id"]) ||
        !negativeDefinition(value.negativeCase.group, value.negativeCase.id) ||
        (value.role === "human" && value.negativeCase.group !== "human") ||
        (value.role === "principal_agent" && value.negativeCase.group !== "agent") ||
        (value.role === "capital_partner" &&
          `${value.negativeCase.group}:${value.negativeCase.id}` !==
            "authorization:cross_role_private_read")
      : value.negativeCase !== null) ||
    !exactKeys(value.visualArtifact, ["kind", "relativePath"]) ||
    value.visualArtifact.kind !== "screenshot"
  ) fail("operational_browser_observation_invalid", "Browser role, check, driver, or visual proof is invalid.");
  iso(value.capturedAt);
  let origin;
  try {
    origin = new URL(value.origin);
  } catch {
    fail("operational_browser_observation_invalid", "Browser origin is invalid.");
  }
  if (
    origin.protocol !== "http:" ||
    origin.hostname !== "127.0.0.1" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== ""
  ) fail("operational_browser_observation_invalid", "Browser origin must be exact local loopback.");
  return Object.freeze(value);
}

export function parseM1BOperationalObservations(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_NDJSON_BYTES) {
    fail("operational_observation_oversized", "Operational NDJSON exceeds 4 MiB.");
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length > 128) {
    fail("operational_observation_oversized", "Operational NDJSON has too many lines.");
  }
  const browserRows = [];
  for (const [index, line] of lines.entries()) {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      fail("operational_observation_invalid", `Operational NDJSON line ${index + 1} is invalid.`);
    }
    assertM1BOperationalSafeValue(value, `line[${index}]`);
    if (new Set(["browser_row", "browser_measurement_row"]).has(value.type)) {
      fail(
        "operational_browser_self_attestation_forbidden",
        "Browser rows are produced from builder challenges, measured responses, PostgreSQL audit readback, and PNG files; operator row claims are forbidden."
      );
    }
    else if (value.type === "journey_step") {
      fail(
        "operational_journey_self_attestation_forbidden",
        "Journey steps are derived from critical/MCP receipts and measured browser rows; operator timestamps are forbidden."
      );
    }
    else if (value.type === "negative_case") {
      fail(
        "operational_negative_self_attestation_forbidden",
        "Negative cases require a tracked live pre/post producer and cannot be supplied as operator NDJSON."
      );
    } else {
      fail("operational_observation_invalid", `Operational NDJSON line ${index + 1} has an unknown type.`);
    }
  }
  return Object.freeze({ browserRows });
}

export async function collectM1BOperationalBrowserMeasurements({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  portBase,
  outputRoot,
  exchange,
  reconcileAuthenticatedRead,
  clock = () => new Date().toISOString()
}) {
  if (
    typeof exchange !== "function" ||
    typeof reconcileAuthenticatedRead !== "function"
  ) fail(
    "operational_browser_measurement_invalid",
    "Measured browser exchange and app-role reconciliation are required."
  );
  const outputRootRelativePath = relative(ROOT, outputRoot);
  const prompts = createM1BOperationalBrowserMeasurementPrompts({
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    portBase,
    outputRootRelativePath,
    roles: M1_B_OPERATIONAL_ROLES,
    checks: M1_B_OPERATIONAL_BROWSER_CHECKS
  });
  const grouped = new Map();
  const promptIds = new Set();
  const readRequestIds = new Set();
  let previousCapturedAt = databaseStartedAt;
  for (const prompt of prompts) {
    const promptIssuedAt = iso(
      clock(),
      "operational_browser_measurement_chronology_invalid"
    );
    if (Date.parse(promptIssuedAt) < Date.parse(previousCapturedAt)) fail(
      "operational_browser_measurement_chronology_invalid",
      "Browser prompt time moved backwards."
    );
    const line = await exchange(prompt);
    const response = parseM1BOperationalBrowserMeasurementResponseLine(
      typeof line === "string" ? line : JSON.stringify(line),
      prompt
    );
    const responseCapturedAt = iso(
      clock(),
      "operational_browser_measurement_chronology_invalid"
    );
    if (
      Date.parse(responseCapturedAt) < Date.parse(promptIssuedAt) ||
      promptIds.has(prompt.promptId) ||
      (prompt.readRequest !== null &&
        readRequestIds.has(prompt.readRequest.requestId))
    ) fail(
      "operational_browser_measurement_chronology_invalid",
      "Browser prompt/response chronology or identifiers are invalid."
    );
    promptIds.add(prompt.promptId);
    if (prompt.readRequest !== null) readRequestIds.add(prompt.readRequest.requestId);
    const browserReadContext = prompt.readRequest === null
      ? null
      : Object.freeze({
          schemaVersion: M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_SCHEMA_VERSION,
          candidateReleaseId,
          runtimeImageId,
          expectedDatabaseStartedAt: databaseStartedAt,
          promptIssuedAt,
          role: prompt.role,
          operationId: prompt.readRequest.operationId,
          requestId: prompt.readRequest.requestId,
          correlationId: prompt.readRequest.correlationId
        });
    const authorizationObservation = browserReadContext === null
      ? null
      : validateM1BOperationalBrowserAppRoleRead(
          await reconcileAuthenticatedRead(browserReadContext),
          browserReadContext
        );
    if (prompt.readRequest !== null && !authorizationObservation) fail(
      "operational_browser_measurement_audit_missing",
      "Authenticated browser read has no immediate app-role reconciliation."
    );
    const key = `${prompt.role}:${prompt.check}`;
    const values = grouped.get(key) ?? [];
    values.push(Object.freeze({
      prompt,
      promptIssuedAt,
      response,
      responseCapturedAt,
      authorizationObservation
    }));
    grouped.set(key, values);
    previousCapturedAt = responseCapturedAt;
  }
  const rows = [];
  for (const role of M1_B_OPERATIONAL_ROLES) {
    for (const check of M1_B_OPERATIONAL_BROWSER_CHECKS) {
      const entries = grouped.get(`${role}:${check}`) ?? [];
      const row = deriveM1BOperationalBrowserRow({
        prompts: entries.map(({ prompt }) => prompt),
        responses: entries.map(({ response }) => response),
        capturedAt: entries.at(-1)?.responseCapturedAt
      });
      const measuredRow = Object.freeze({
        ...row,
        phaseEvidence: Object.freeze(entries.map((entry) => Object.freeze({
          prompt: validateM1BOperationalBrowserMeasurementPrompt(Object.freeze({
            schemaVersion: entry.prompt.schemaVersion,
            kind: entry.prompt.kind,
            promptId: entry.prompt.promptId,
            candidateReleaseId: entry.prompt.candidateReleaseId,
            sourceTreeHash: entry.prompt.sourceTreeHash,
            runtimeImageId: entry.prompt.runtimeImageId,
            databaseStartedAt: entry.prompt.databaseStartedAt,
            role: entry.prompt.role,
            check: entry.prompt.check,
            phase: entry.prompt.phase,
            origin: entry.prompt.origin,
            expected: entry.prompt.expected,
            readRequest: entry.prompt.readRequest,
            capture: entry.prompt.capture,
            browserExpressionHash: manifestHash(
              createM1BOperationalBrowserExpression(entry.prompt)
            )
          })),
          promptIssuedAt: entry.promptIssuedAt,
          response: entry.response,
          responseCapturedAt: entry.responseCapturedAt,
          authorizationObservation: entry.authorizationObservation
        })))
      });
      validateMeasuredBrowserObservation(measuredRow, {
        candidateReleaseId,
        sourceTreeHash,
        runtimeImageId,
        databaseStartedAt
      });
      rows.push(measuredRow);
    }
  }
  if (rows.length !== 24 || grouped.size !== 24) fail(
    "operational_browser_measurement_invalid",
    "The exact 24-row measured browser matrix is incomplete."
  );
  return Object.freeze({ browserRows: Object.freeze(rows) });
}

export function missingM1BDerivedNegativeCases(proofs) {
  const observed = new Set((proofs ?? []).map(({ group, id }) => `${group}:${id}`));
  return M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS
    .filter(({ group, id }) => !observed.has(`${group}:${id}`))
    .map(({ sourceMode, group, id }) => `${sourceMode}:${group}:${id}`);
}

export function assertCompleteM1BDerivedNegativeProofs(proofs) {
  const missing = missingM1BDerivedNegativeCases(proofs);
  if (missing.length > 0) {
    fail(
      "operational_negative_live_producer_missing",
      `Live pre/post negative proof is missing for: ${missing.join(", ")}.`
    );
  }
  return true;
}

function negativeDefinition(group, id) {
  try {
    return getM1BOperationalNegativeCaseDefinition(group, id);
  } catch {
    return null;
  }
}

const M1_B_OPERATIONAL_NEGATIVE_PROOF_KEYS = Object.freeze([
  "proofKind", "group", "id", "sourceMode", "caseDefinitionHash",
  "candidateReleaseId", "sourceTreeHash", "runtimeImageId", "capturedAt",
  "requestId", "correlationId", "outwardStatus", "outwardCode",
  "outwardResponseHash", "authorizationAuditEventId", "authorizationDecision",
  "authorizationReasonCode", "protectedStateBeforeHash",
  "protectedStateAfterHash", "databaseProof", "additionalEffectCount",
  "nonEnumerating", "duplicateSemantics", "regressionAssertions",
  "sourceEvidence", "producerVerified"
]);

export async function validateM1BOperationalNegativeProof(proof, {
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  availableArtifacts
}) {
  if (!proof || !exactKeys(proof, M1_B_OPERATIONAL_NEGATIVE_PROOF_KEYS)) {
    fail("operational_negative_proof_invalid", "Derived negative proof shape is invalid.");
  }
  const definition = negativeDefinition(proof.group, proof.id);
  if (
    !definition ||
    proof.sourceMode !== definition.sourceMode ||
    proof.caseDefinitionHash !== definition.caseDefinitionHash ||
    proof.candidateReleaseId !== candidateReleaseId ||
    proof.sourceTreeHash !== sourceTreeHash ||
    proof.runtimeImageId !== runtimeImageId ||
    !exactKeys(proof.sourceEvidence, [
      "operationId",
      "subtestName",
      "supportingArtifacts",
      "testCommand",
      "tapSha256",
      "exitCode",
      "tapParser",
      "sourceFiles"
    ]) ||
    !Array.isArray(proof.sourceEvidence.sourceFiles) ||
    !Array.isArray(proof.sourceEvidence.supportingArtifacts) ||
    proof.sourceEvidence.operationId !== definition.operationId ||
    proof.sourceEvidence.subtestName !== definition.subtestName ||
    proof.sourceEvidence.testCommand !== definition.testCommand
  ) fail("operational_negative_proof_invalid", "Negative proof provenance is not exact.");
  const exactSource = proof.sourceMode !== "live_post_restart";
  if (proof.sourceMode === "live_post_restart") {
    const contract = {
      "human:expired_offer": {
        required: ["human_critical", "expired_offer_setup"], optional: []
      },
      "human:replaced_stale_offer": {
        required: ["capital_partner_critical"], optional: []
      },
      "human:unauthorized_subject": {
        required: ["human_critical", "agent_foreign_offer_setup"],
        optional: ["agent_before"]
      },
      "authorization:cross_role_private_read": {
        required: ["capital_partner_critical", "human_critical"], optional: []
      }
    }[`${proof.group}:${proof.id}`];
    const ids = new Set();
    const allowedIds = new Set([...(contract?.required ?? []), ...(contract?.optional ?? [])]);
    for (const artifact of proof.sourceEvidence.supportingArtifacts) {
      const available = availableArtifacts.find(({ id }) => id === artifact?.id);
      if (
        !exactKeys(artifact, ["id", "sha256"]) ||
        !available || artifact.sha256 !== available.sha256 ||
        !allowedIds.has(artifact.id) || ids.has(artifact.id)
      ) fail("operational_negative_proof_invalid", "Live negative supporting artifact set is invalid.");
      ids.add(artifact.id);
    }
    if (
      !contract ||
      contract.required.some((id) => !ids.has(id)) ||
      ids.size !== proof.sourceEvidence.supportingArtifacts.length ||
      proof.sourceEvidence.tapSha256 !== null ||
      proof.sourceEvidence.exitCode !== null ||
      proof.sourceEvidence.tapParser !== null ||
      proof.sourceEvidence.sourceFiles.length !== 0 ||
      proof.databaseProof !== "main_post_restart_application_role" ||
      proof.proofKind !== "runtime_observation" ||
      proof.regressionAssertions !== null
    ) fail("operational_negative_proof_invalid", "Live negative proof is not bound to its exact critical/setup receipts.");
  } else {
    if (
      proof.sourceEvidence.supportingArtifacts.length !== 0 ||
      !SHA256.test(proof.sourceEvidence.tapSha256 ?? "") ||
      proof.sourceEvidence.exitCode !== 0 ||
      proof.sourceEvidence.tapParser !== "node_test_tap_v13" ||
      proof.sourceEvidence.sourceFiles.length !== definition.sourcePaths.length
    ) fail("operational_negative_proof_invalid", "Exact-source negative proof is missing its TAP/source binding.");
    const sourcePaths = new Set();
    for (const [index, sourceFile] of proof.sourceEvidence.sourceFiles.entries()) {
      if (
        !exactKeys(sourceFile, ["path", "sha256"]) ||
        typeof sourceFile.path !== "string" ||
        sourceFile.path === "" ||
        sourceFile.path !== definition.sourcePaths[index] ||
        isAbsolute(sourceFile.path) ||
        sourceFile.path.split(sep).includes("..") ||
        sourcePaths.has(sourceFile.path) ||
        !SHA256.test(sourceFile.sha256)
      ) fail("operational_negative_proof_invalid", "Exact-source negative proof source list is invalid.");
      let bytes;
      try {
        bytes = await readFile(resolve(ROOT, sourceFile.path));
      } catch {
        fail("operational_negative_proof_invalid", "Exact-source negative proof source file is missing.");
      }
      if (sha256(bytes) !== sourceFile.sha256) {
        fail("operational_negative_proof_invalid", "Exact-source negative proof source digest is untrusted.");
      }
      sourcePaths.add(sourceFile.path);
    }
    if (
      proof.proofKind !== (proof.sourceMode === "exact_source_transport"
        ? "runtime_observation"
        : proof.sourceMode === "exact_source_disposable_postgres"
          ? "exact_source_postgres_observation"
          : "exact_source_regression_assertion")
    ) fail("operational_negative_proof_invalid", "Exact-source proof kind is invalid.");
  }
  if (
    !REQUEST_IDENTIFIER.test(proof.requestId) ||
    !REQUEST_IDENTIFIER.test(proof.correlationId) ||
    !IDENTIFIER.test(proof.authorizationReasonCode) ||
    proof.additionalEffectCount !== 0 ||
    proof.producerVerified !== true
  ) fail("operational_negative_proof_invalid", "Derived negative proof is not fail-closed.");
  iso(proof.capturedAt);
  const duplicate = proof.group === "human" && proof.id === "duplicate_acceptance";
  const transport = proof.sourceMode === "exact_source_transport";
  const regression = proof.sourceMode === "exact_source_disposable_postgres" ||
    proof.sourceMode === "exact_source_ui_binding";
  if (regression) {
    const assertions = proof.regressionAssertions;
    if (
      !assertions ||
      !exactKeys(assertions, [
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
      assertions.schemaVersion !== "m1_b_negative_regression_assertions.v2" ||
      !Number.isSafeInteger(assertions.assertedOutwardStatus) ||
      assertions.assertedOutwardStatus < 200 ||
      assertions.assertedOutwardStatus > 499 ||
      !IDENTIFIER.test(assertions.assertedOutwardCode) ||
      assertions.protectedStateEqualityAsserted !== true ||
      assertions.additionalEffectCountAsserted !== 0 ||
      assertions.responseBytesCaptured !== false ||
      assertions.databaseSnapshotHashesCaptured !==
        (proof.sourceMode === "exact_source_disposable_postgres") ||
      assertions.actualDatabaseReadback !==
        (proof.sourceMode === "exact_source_disposable_postgres") ||
      (assertions.actualDatabaseReadback === true
        ? !assertions.databaseReadback ||
          !exactKeys(assertions.databaseReadback, [
            "schemaVersion",
            "outwardResponseHash",
            "authorizationAuditRows",
            "authorizationAuditEvents",
            "authorizationAuditSetHash",
            "protectedStateBefore",
            "protectedStateAfter",
            "protectedStateBeforeHash",
            "protectedStateAfterHash"
          ]) ||
          assertions.databaseReadback.schemaVersion !==
            "m1_b_negative_database_readback.v2" ||
          !Number.isSafeInteger(assertions.databaseReadback.authorizationAuditRows) ||
          !Array.isArray(assertions.databaseReadback.authorizationAuditEvents) ||
          assertions.databaseReadback.authorizationAuditEvents.length !==
            assertions.databaseReadback.authorizationAuditRows ||
          !/^0x[0-9a-f]{64}$/.test(
            assertions.databaseReadback.authorizationAuditSetHash ?? ""
          ) ||
          assertions.databaseReadback.authorizationAuditSetHash !==
            manifestHash(assertions.databaseReadback.authorizationAuditEvents) ||
          assertions.databaseReadback.outwardResponseHash !== proof.outwardResponseHash ||
          assertions.databaseReadback.protectedStateBeforeHash !==
            proof.protectedStateBeforeHash ||
          assertions.databaseReadback.protectedStateAfterHash !==
            proof.protectedStateAfterHash
        : assertions.databaseReadback !== null) ||
      !/^0x[0-9a-f]{64}$/.test(assertions.sourceAssertionHash) ||
      assertions.compositeConfirmationRegression !== false ||
      (proof.sourceMode === "exact_source_disposable_postgres"
        ? !Number.isSafeInteger(proof.outwardStatus) ||
          proof.outwardStatus < 200 || proof.outwardStatus > 499 ||
          !IDENTIFIER.test(proof.outwardCode) ||
          !/^0x[0-9a-f]{64}$/.test(proof.outwardResponseHash) ||
          !/^0x[0-9a-f]{64}$/.test(proof.protectedStateBeforeHash) ||
          proof.protectedStateBeforeHash !== proof.protectedStateAfterHash ||
          proof.databaseProof !== "disposable_postgres_owner_readback"
        : proof.outwardStatus !== null ||
          proof.outwardCode !== null ||
          proof.outwardResponseHash !== null ||
          proof.protectedStateBeforeHash !== null ||
          proof.protectedStateAfterHash !== null ||
          proof.databaseProof !== "exact_source_ui_binding_regression")
    ) fail("operational_negative_proof_invalid", "Exact-source regression proof is not content-bound.");
    if (proof.sourceMode === "exact_source_disposable_postgres") {
      assertM1BOperationalProtectedStateManifestPair(
        assertions.databaseReadback
      );
    }
    if (duplicate) {
      if (
        assertions.assertedOutwardStatus !== 200 ||
        proof.authorizationAuditEventId !== null ||
        proof.authorizationDecision !== "idempotent_replay" ||
        proof.duplicateSemantics !== "exact_replay_status_200_no_second_effects" ||
        proof.nonEnumerating !== false
      ) fail("operational_negative_proof_invalid", "Duplicate acceptance is not an exact 200 replay with zero second effects.");
    } else if (
      assertions.assertedOutwardStatus < 400 ||
      assertions.assertedOutwardStatus > 499 ||
      proof.duplicateSemantics !== null ||
      proof.nonEnumerating !== true ||
      !new Set(["deny", "domain_rejected", "ui_preflight_rejected"])
        .has(proof.authorizationDecision) ||
      (proof.authorizationDecision === "deny"
        ? !IDENTIFIER.test(proof.authorizationAuditEventId)
        : proof.authorizationAuditEventId !== null)
    ) fail("operational_negative_proof_invalid", "Exact-source rejection semantics are invalid.");
  } else if (duplicate) {
    fail("operational_negative_proof_invalid", "Duplicate acceptance must not replay live wallet material.");
  } else if (transport) {
    if (
      proof.outwardStatus < 400 || proof.outwardStatus > 499 ||
      !IDENTIFIER.test(proof.outwardCode) ||
      !/^0x[0-9a-f]{64}$/.test(proof.outwardResponseHash) ||
      proof.authorizationAuditEventId !== null ||
      proof.authorizationDecision !== "transport_rejected" ||
      proof.protectedStateBeforeHash !== null ||
      proof.protectedStateAfterHash !== null ||
      proof.databaseProof !== "not_applicable_transport_boundary" ||
      proof.duplicateSemantics !== null ||
      proof.nonEnumerating !== true ||
      proof.regressionAssertions !== null
    ) fail("operational_negative_proof_invalid", "Signed-out transport proof falsely claims a tenant audit or database readback.");
  } else if (
    proof.outwardStatus < 400 || proof.outwardStatus > 499 ||
    !IDENTIFIER.test(proof.outwardCode) ||
    !/^0x[0-9a-f]{64}$/.test(proof.outwardResponseHash) ||
    !IDENTIFIER.test(proof.authorizationAuditEventId) ||
    proof.authorizationDecision !== "deny" ||
    proof.protectedStateBeforeHash !== proof.protectedStateAfterHash ||
    !/^0x[0-9a-f]{64}$/.test(proof.protectedStateBeforeHash) ||
    proof.duplicateSemantics !== null ||
    proof.nonEnumerating !== true
  ) fail("operational_negative_proof_invalid", "Negative proof does not show denial and equal protected state.");
  if (!exactSource && Date.parse(proof.capturedAt) < Date.parse(databaseStartedAt)) {
    fail("operational_negative_proof_invalid", "Live negative proof predates the exact post-restart database.");
  }
  return proof;
}

function negativeProofFromCaseReceipt(receipt) {
  return Object.freeze(Object.fromEntries(
    M1_B_OPERATIONAL_NEGATIVE_PROOF_KEYS.map((key) => [key, receipt[key]])
  ));
}

function negativeReceiptArtifactLink(value, nullable = false) {
  if (nullable && value === null) return null;
  if (
    !exactKeys(value, ["id", "sha256"]) ||
    !IDENTIFIER.test(value.id ?? "") ||
    !SHA256.test(value.sha256 ?? "")
  ) fail(
    "operational_negative_receipt_invalid",
    "Negative receipt artifact link is invalid."
  );
  return Object.freeze({ id: value.id, sha256: value.sha256 });
}

export function createM1BOperationalNegativeCaseReceipt({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  proof,
  sourceProofArtifact,
  liveAttemptArtifact = null,
  exactSourceExecutionArtifact = null,
  tapArtifact = null
}) {
  const definition = negativeDefinition(proof?.group, proof?.id);
  const sourceProof = negativeReceiptArtifactLink(sourceProofArtifact);
  const liveAttempt = negativeReceiptArtifactLink(liveAttemptArtifact, true);
  const exactExecution = negativeReceiptArtifactLink(
    exactSourceExecutionArtifact,
    true
  );
  const tap = negativeReceiptArtifactLink(tapArtifact, true);
  const live = proof?.sourceMode === "live_post_restart";
  const criticalDerived = live && proof.group === "human" &&
    proof.id === "replaced_stale_offer";
  if (
    !definition || !exactKeys(proof, M1_B_OPERATIONAL_NEGATIVE_PROOF_KEYS) ||
    proof.candidateReleaseId !== candidateReleaseId ||
    proof.sourceTreeHash !== sourceTreeHash ||
    proof.runtimeImageId !== runtimeImageId ||
    !SHA.test(candidateReleaseId ?? "") || !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    !iso(databaseStartedAt, "operational_negative_receipt_invalid") ||
    (live && criticalDerived && liveAttempt !== null) ||
    (live && !criticalDerived && liveAttempt === null) ||
    (live && (exactExecution !== null || tap !== null)) ||
    (!live && (liveAttempt !== null || exactExecution === null || tap === null)) ||
    (!live && proof.sourceEvidence.tapSha256 !== tap?.sha256)
  ) fail(
    "operational_negative_receipt_invalid",
    "Negative case receipt provenance is invalid."
  );
  return Object.freeze({
    schemaVersion: "m1_b_negative_case_receipt.v2",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    retainedRuntimeDatabaseStartedAt: databaseStartedAt,
    sourceRuntime: "local_exact_commit",
    status: proof.group === "human" && proof.id === "duplicate_acceptance"
      ? "passed_exact_replay"
      : "passed_fail_closed",
    ...proof,
    sourceProofArtifact: sourceProof,
    liveAttemptArtifact: liveAttempt,
    exactSourceExecutionArtifact: exactExecution,
    tapArtifact: tap,
    productionFundsMoved: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    })
  });
}

export async function validateM1BOperationalNegativeCaseReceipt(receipt, {
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  availableArtifacts
}) {
  const expectedKeys = [...new Set([
    "schemaVersion", "candidateReleaseId", "sourceTreeHash", "runtimeImageId",
    "retainedRuntimeDatabaseStartedAt", "sourceRuntime", "status",
    ...M1_B_OPERATIONAL_NEGATIVE_PROOF_KEYS,
    "sourceProofArtifact", "liveAttemptArtifact",
    "exactSourceExecutionArtifact", "tapArtifact", "productionFundsMoved",
    "redaction"
  ])];
  if (
    !exactKeys(receipt, expectedKeys) ||
    receipt.schemaVersion !== "m1_b_negative_case_receipt.v2" ||
    receipt.retainedRuntimeDatabaseStartedAt !== databaseStartedAt ||
    receipt.sourceRuntime !== "local_exact_commit" ||
    receipt.productionFundsMoved !== false ||
    !exactKeys(receipt.redaction, [
      "containsSecrets", "containsRawPii", "containsSessionMaterial"
    ]) || Object.values(receipt.redaction).some((value) => value !== false)
  ) fail(
    "operational_negative_receipt_invalid",
    "Negative case receipt shape is invalid."
  );
  const proof = await validateM1BOperationalNegativeProof(
    negativeProofFromCaseReceipt(receipt),
    {
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      availableArtifacts
    }
  );
  for (const link of [
    receipt.sourceProofArtifact,
    receipt.liveAttemptArtifact,
    receipt.exactSourceExecutionArtifact,
    receipt.tapArtifact
  ].filter(Boolean)) {
    const artifact = availableArtifacts.find(({ id }) => id === link.id);
    if (!artifact || artifact.sha256 !== link.sha256) fail(
      "operational_negative_receipt_invalid",
      "Negative receipt points to an unavailable artifact."
    );
  }
  const expected = createM1BOperationalNegativeCaseReceipt({
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    proof,
    sourceProofArtifact: receipt.sourceProofArtifact,
    liveAttemptArtifact: receipt.liveAttemptArtifact,
    exactSourceExecutionArtifact: receipt.exactSourceExecutionArtifact,
    tapArtifact: receipt.tapArtifact
  });
  if (canonicalJson(receipt) !== canonicalJson(expected)) fail(
    "operational_negative_receipt_invalid",
    "Negative case receipt does not reconstruct."
  );
  return receipt;
}

function negativeCaseManifestEntry(receipt, artifact) {
  if (
    !exactKeys(artifact, ["id", "kind", "relativePath", "sha256"]) ||
    artifact.id !== artifactId("negative", receipt.group, receipt.id) ||
    artifact.kind !== "negative_receipt" ||
    artifact.sha256 !== sha256(jsonBytes(receipt))
  ) fail(
    "operational_negative_manifest_invalid",
    "Negative case artifact does not bind its receipt bytes."
  );
  return Object.freeze({
    group: receipt.group,
    id: receipt.id,
    sourceMode: receipt.sourceMode,
    caseDefinitionHash: receipt.caseDefinitionHash,
    status: receipt.status,
    capturedAt: receipt.capturedAt,
    requestId: receipt.requestId,
    correlationId: receipt.correlationId,
    outwardStatus: receipt.outwardStatus,
    outwardCode: receipt.outwardCode,
    outwardResponseHash: receipt.outwardResponseHash,
    authorizationAuditEventId: receipt.authorizationAuditEventId,
    authorizationDecision: receipt.authorizationDecision,
    authorizationReasonCode: receipt.authorizationReasonCode,
    protectedStateBeforeHash: receipt.protectedStateBeforeHash,
    protectedStateAfterHash: receipt.protectedStateAfterHash,
    additionalEffectCount: receipt.additionalEffectCount,
    nonEnumerating: receipt.nonEnumerating,
    duplicateSemantics: receipt.duplicateSemantics,
    sourceProofArtifact: receipt.sourceProofArtifact,
    liveAttemptArtifact: receipt.liveAttemptArtifact,
    exactSourceExecutionArtifact: receipt.exactSourceExecutionArtifact,
    tapArtifact: receipt.tapArtifact,
    producerVerified: receipt.producerVerified,
    productionFundsMoved: receipt.productionFundsMoved,
    artifactId: artifact.id,
    artifactSha256: artifact.sha256
  });
}

export function createM1BOperationalNegativeCaseManifest({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  releaseIdentityArtifact,
  exactSourceExecutionArtifact,
  caseReceipts
}) {
  const release = negativeReceiptArtifactLink(releaseIdentityArtifact);
  const exactExecution = negativeReceiptArtifactLink(
    exactSourceExecutionArtifact
  );
  const byKey = new Map();
  for (const entry of caseReceipts ?? []) {
    if (!exactKeys(entry, ["receipt", "artifact"])) fail(
      "operational_negative_manifest_invalid",
      "Negative manifest case input is invalid."
    );
    const key = `${entry.receipt?.group}:${entry.receipt?.id}`;
    if (byKey.has(key)) fail(
      "operational_negative_manifest_invalid",
      "Negative manifest case is duplicated."
    );
    byKey.set(key, negativeCaseManifestEntry(entry.receipt, entry.artifact));
  }
  const orderedKeys = Object.entries(M1_B_OPERATIONAL_NEGATIVE_CASES)
    .flatMap(([group, ids]) => ids.map((id) => `${group}:${id}`));
  if (byKey.size !== 16 || orderedKeys.some((key) => !byKey.has(key))) fail(
    "operational_negative_manifest_invalid",
    "Negative manifest is not the exact 16-case set."
  );
  const cases = Object.freeze(orderedKeys.map((key) => byKey.get(key)));
  return Object.freeze({
    schemaVersion: "m1_b_negative_case_manifest.v2",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    sourceRuntime: "local_exact_commit",
    status: "passed_fail_closed",
    releaseIdentityArtifact: release,
    exactSourceExecutionArtifact: exactExecution,
    cases,
    caseCount: cases.length,
    fixtureUsed: false,
    productionFundsMoved: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    })
  });
}

export async function validateM1BOperationalNegativeCaseManifest(manifest, {
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  availableArtifacts,
  caseReceipts
}) {
  if (
    manifest?.candidateReleaseId !== candidateReleaseId ||
    manifest?.sourceTreeHash !== sourceTreeHash ||
    manifest?.runtimeImageId !== runtimeImageId ||
    manifest?.databaseStartedAt !== databaseStartedAt ||
    !Array.isArray(availableArtifacts) ||
    !Array.isArray(caseReceipts) || caseReceipts.length !== 16
  ) fail(
    "operational_negative_manifest_invalid",
    "Negative manifest context or receipts are incomplete."
  );
  for (const link of [
    manifest.releaseIdentityArtifact,
    manifest.exactSourceExecutionArtifact
  ]) {
    const artifact = availableArtifacts.find(({ id }) => id === link?.id);
    if (!artifact || artifact.sha256 !== link.sha256) fail(
      "operational_negative_manifest_invalid",
      "Negative manifest points to an unavailable release or execution artifact."
    );
  }
  for (const { receipt } of caseReceipts) {
    await validateM1BOperationalNegativeCaseReceipt(receipt, {
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      availableArtifacts
    });
  }
  const expected = createM1BOperationalNegativeCaseManifest({
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    releaseIdentityArtifact: manifest.releaseIdentityArtifact,
    exactSourceExecutionArtifact: manifest.exactSourceExecutionArtifact,
    caseReceipts
  });
  if (canonicalJson(manifest) !== canonicalJson(expected)) fail(
    "operational_negative_manifest_invalid",
    "Negative case manifest does not reconstruct."
  );
  return manifest;
}

function artifactId(prefix, role, suffix) {
  return [prefix, role, suffix].filter(Boolean).join("_").replace(/[^a-z0-9_]/g, "_");
}

function browserPhaseArtifactToken(phase) {
  const token = {
    authenticated: "auth",
    signed_out: "signedout",
    before_sign_out: "before"
  }[phase];
  if (!token) fail(
    "operational_browser_measurement_invalid",
    "Browser measurement phase has no closed artifact token."
  );
  return token;
}

function criticalForRole(criticalArtifacts, role) {
  const id = role === "human"
    ? "human_critical"
    : role === "capital_partner"
      ? "capital_partner_critical"
      : "agent_after";
  const artifact = criticalArtifacts.find((entry) => entry.id === id);
  if (!artifact) fail("operational_critical_artifact_missing", `Critical artifact ${id} is missing.`);
  return artifact;
}

function validateCriticalArtifacts(
  criticalArtifacts,
  { riskRequired = true } = {}
) {
  const expected = {
    release_identity: "release_identity",
    agent_before: "runtime_receipt",
    agent_after: "runtime_receipt",
    human_critical: "postgres_receipt",
    capital_partner_critical: "postgres_receipt"
  };
  if (riskRequired) expected.risk_critical = "negative_receipt";
  if (
    !Array.isArray(criticalArtifacts) ||
    criticalArtifacts.length !== Object.keys(expected).length
  ) {
    fail(
      "operational_critical_artifact_invalid",
      `The exact ${riskRequired ? "six" : "five pre-Risk"} critical artifacts are required.`
    );
  }
  const ids = new Set();
  for (const artifact of criticalArtifacts) {
    if (
      !exactKeys(artifact, ["id", "kind", "relativePath", "sha256"]) ||
      expected[artifact.id] !== artifact.kind ||
      ids.has(artifact.id) ||
      typeof artifact.relativePath !== "string" ||
      artifact.relativePath === "" ||
      isAbsolute(artifact.relativePath) ||
      artifact.relativePath.split(sep).includes("..") ||
      !SHA256.test(artifact.sha256)
    ) fail("operational_critical_artifact_invalid", "Critical artifact reference is invalid.");
    ids.add(artifact.id);
  }
  if (Object.keys(expected).some((id) => !ids.has(id))) {
    fail("operational_critical_artifact_invalid", "Critical artifact set is incomplete.");
  }
  return criticalArtifacts;
}

function expectedLocalOrigin(role, portBase) {
  const offset = role === "human" ? 0 : role === "principal_agent" ? 1 : 3;
  return `http://127.0.0.1:${portBase + offset}/`;
}

export function validateM1BOperationalBrowserRuntimeObservation(value, {
  candidateReleaseId,
  role,
  check,
  origin,
  databaseStartedAt,
  runtimeImageId
}) {
  if (!exactKeys(value, [
    "schemaVersion",
    "candidateReleaseId",
    "role",
    "check",
    "databaseStartedAt",
    "runtimeImageId",
    "request",
    "response"
  ]) ||
    value.schemaVersion !== "m1_b_browser_runtime_observation.v2" ||
    value.candidateReleaseId !== candidateReleaseId ||
    value.role !== role ||
    value.check !== check ||
    value.databaseStartedAt !== databaseStartedAt ||
    value.runtimeImageId !== runtimeImageId ||
    !exactKeys(value.request, [
      "method",
      "url",
      "requestId",
      "credentials",
      "cookieHeaderSent",
      "authorizationHeaderSent",
      "requestedAt"
    ]) ||
    value.request.method !== "GET" ||
    value.request.url !== new URL("tenant/v1/healthz", origin).toString() ||
    !REQUEST_IDENTIFIER.test(value.request.requestId) ||
    value.request.credentials !== "omit" ||
    value.request.cookieHeaderSent !== false ||
    value.request.authorizationHeaderSent !== false ||
    !exactKeys(value.response, [
      "status",
      "requestId",
      "contentType",
      "cacheControl",
      "contentLength",
      "respondedAt",
      "body",
      "bodyText",
      "bodySha256",
      "bodyProjectionHash"
    ]) ||
    value.response.status !== 200 ||
    value.response.requestId !== value.request.requestId ||
    value.response.contentType !== "application/json; charset=utf-8" ||
    value.response.cacheControl !== "no-store" ||
    !Number.isSafeInteger(value.response.contentLength) ||
    value.response.contentLength < 1 ||
    !SHA256.test(value.response.bodySha256 ?? "") ||
    !/^0x[0-9a-f]{64}$/.test(value.response.bodyProjectionHash ?? "") ||
    !exactKeys(value.response.body, [
      "status",
      "transport",
      "public",
      "schemaVersion"
    ]) ||
    value.response.body.status !== "ready" ||
    value.response.body.transport !== "authenticated_http_loopback" ||
    value.response.body.public !== false ||
    value.response.body.schemaVersion !== "tenant_transport_health.v1" ||
    value.response.bodyText !== JSON.stringify(value.response.body) ||
    value.response.contentLength !== Buffer.byteLength(value.response.bodyText) ||
    value.response.bodySha256 !== sha256(value.response.bodyText) ||
    value.response.bodyProjectionHash !== manifestHash(value.response.body)) {
    fail(
      "operational_browser_runtime_invalid",
      `${role}:${check} does not bind a unique credential-omitted retained-role health response.`
    );
  }
  iso(value.request.requestedAt, "operational_browser_runtime_invalid");
  iso(value.response.respondedAt, "operational_browser_runtime_invalid");
  if (
    Date.parse(value.response.respondedAt) < Date.parse(value.request.requestedAt) ||
    Date.parse(value.request.requestedAt) < Date.parse(databaseStartedAt)
  ) fail("operational_browser_runtime_invalid", `${role}:${check} readiness timing is invalid.`);
  return Object.freeze(value);
}

export async function collectM1BBrowserRuntimeObservation({
  candidateReleaseId,
  role,
  check,
  origin,
  databaseStartedAt,
  runtimeImageId
}, {
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  requestIdFactory = () => `m1b_ready_${randomBytes(12).toString("hex")}`
} = {}) {
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !M1_B_OPERATIONAL_ROLES.includes(role) ||
    !M1_B_OPERATIONAL_BROWSER_CHECKS.includes(check) ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    typeof fetchImpl !== "function"
  ) fail("operational_browser_runtime_invalid", "Browser runtime request context is invalid.");
  iso(databaseStartedAt, "operational_browser_runtime_invalid");
  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    fail("operational_browser_runtime_invalid", "Browser runtime origin is invalid.");
  }
  const roleOffset = role === "human" ? 0 : role === "principal_agent" ? 1 : 3;
  const basePort = Number(originUrl.port) - roleOffset;
  if (
    !Number.isSafeInteger(basePort) ||
    basePort < 1_024 ||
    basePort > 65_532 ||
    origin !== expectedLocalOrigin(role, basePort)
  ) fail("operational_browser_runtime_invalid", "Browser runtime origin is not exact local loopback.");
  const requestId = requestIdFactory();
  if (!REQUEST_IDENTIFIER.test(requestId ?? "")) {
    fail("operational_browser_runtime_invalid", "Browser runtime request ID is invalid.");
  }
  const url = new URL("tenant/v1/healthz", origin).toString();
  const requestedAt = now();
  iso(requestedAt, "operational_browser_runtime_invalid");
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(5_000),
      headers: Object.freeze({
        accept: "application/json",
        "x-request-id": requestId
      })
    });
  } catch {
    fail("operational_browser_runtime_invalid", `${role}:${check} readiness request failed.`);
  }
  const respondedAt = now();
  let bodyText;
  try {
    bodyText = await response.text();
  } catch {
    fail("operational_browser_runtime_invalid", `${role}:${check} readiness body is unreadable.`);
  }
  if (Buffer.byteLength(bodyText) > 16 * 1024) {
    fail("operational_browser_runtime_invalid", `${role}:${check} readiness body is oversized.`);
  }
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    fail("operational_browser_runtime_invalid", `${role}:${check} readiness body is invalid JSON.`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  const observation = Object.freeze({
    schemaVersion: "m1_b_browser_runtime_observation.v2",
    candidateReleaseId,
    role,
    check,
    databaseStartedAt,
    runtimeImageId,
    request: Object.freeze({
      method: "GET",
      url,
      requestId,
      credentials: "omit",
      cookieHeaderSent: false,
      authorizationHeaderSent: false,
      requestedAt
    }),
    response: Object.freeze({
      status: response.status,
      requestId: response.headers.get("x-request-id"),
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
      contentLength,
      respondedAt,
      body,
      bodyText,
      bodySha256: sha256(bodyText),
      bodyProjectionHash: manifestHash(body)
    })
  });
  if (contentLength !== Buffer.byteLength(bodyText)) {
    fail("operational_browser_runtime_invalid", `${role}:${check} readiness length is invalid.`);
  }
  return validateM1BOperationalBrowserRuntimeObservation(observation, {
    candidateReleaseId,
    role,
    check,
    origin,
    databaseStartedAt,
    runtimeImageId
  });
}

function exactObservationSets(observations, context) {
  const browserKeys = new Set();
  const browserDrivers = new Set();
  for (const input of observations.browserRows) {
    const row = validateMeasuredBrowserObservation(input, context);
    const key = `${row.role}:${row.check}`;
    if (browserKeys.has(key)) fail("operational_browser_observation_duplicate", `Duplicate browser row ${key}.`);
    browserKeys.add(key);
    browserDrivers.add(row.driver);
  }
  const expectedBrowser = M1_B_OPERATIONAL_ROLES.flatMap((role) =>
    M1_B_OPERATIONAL_BROWSER_CHECKS.map((check) => `${role}:${check}`)
  );
  const missingBrowser = expectedBrowser.filter((key) => !browserKeys.has(key));
  if (missingBrowser.length > 0 || browserKeys.size !== expectedBrowser.length) {
    fail("operational_browser_observation_incomplete", `Browser observations are missing: ${missingBrowser.join(", ")}.`);
  }
  if (browserDrivers.size !== 1) {
    fail(
      "operational_browser_observation_invalid",
      "The exact browser matrix must use one measured real-browser driver."
    );
  }
}

function validateMeasuredBrowserObservation(row, context) {
  if (!exactKeys(row, [
    "type", "role", "check", "capturedAt", "origin", "driver", "phases",
    "measurementManifestHash", "negativeCase", "visualArtifacts",
    "phaseEvidence"
  ]) || row.type !== "browser_measurement_row" ||
    !M1_B_OPERATIONAL_ROLES.includes(row.role) ||
    !M1_B_OPERATIONAL_BROWSER_CHECKS.includes(row.check) ||
    row.driver !== "chrome_control" || !Array.isArray(row.phaseEvidence) ||
    row.phaseEvidence.length !==
      M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[row.check].length
  ) fail(
    "operational_browser_measurement_invalid",
    "Measured browser row shape is invalid."
  );
  const prompts = [];
  const responses = [];
  let previous = null;
  let signedOutCapturedAt = null;
  for (const [index, evidence] of row.phaseEvidence.entries()) {
    if (!exactKeys(evidence, [
      "prompt", "promptIssuedAt", "response", "responseCapturedAt",
      "authorizationObservation"
    ])) fail(
      "operational_browser_measurement_invalid",
      "Measured browser phase Evidence is invalid."
    );
    const prompt = evidence.prompt;
    validateM1BOperationalBrowserMeasurementPrompt(prompt);
    createM1BOperationalBrowserExpression(prompt);
    const response = parseM1BOperationalBrowserMeasurementResponseLine(
      JSON.stringify(evidence.response),
      prompt
    );
    iso(evidence.promptIssuedAt, "operational_browser_measurement_invalid");
    iso(evidence.responseCapturedAt, "operational_browser_measurement_invalid");
    if (
      prompt.candidateReleaseId !== context.candidateReleaseId ||
      prompt.sourceTreeHash !== context.sourceTreeHash ||
      prompt.runtimeImageId !== context.runtimeImageId ||
      prompt.databaseStartedAt !== context.databaseStartedAt ||
      prompt.role !== row.role || prompt.check !== row.check ||
      prompt.phase !== M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[row.check][index] ||
      Date.parse(evidence.responseCapturedAt) < Date.parse(evidence.promptIssuedAt) ||
      (previous !== null && Date.parse(evidence.promptIssuedAt) < previous) ||
      (prompt.readRequest === null) !==
        (evidence.authorizationObservation === null)
    ) fail(
      "operational_browser_measurement_invalid",
      "Measured browser phase order, timing, or audit binding is invalid."
    );
    if (prompt.phase === "signed_out") {
      signedOutCapturedAt = evidence.responseCapturedAt;
    }
    if (prompt.readRequest !== null) {
      const appRoleRead = validateM1BOperationalBrowserAppRoleRead(
        evidence.authorizationObservation,
        Object.freeze({
          schemaVersion: M1_B_OPERATIONAL_BROWSER_READ_CONTEXT_SCHEMA_VERSION,
          candidateReleaseId: prompt.candidateReleaseId,
          runtimeImageId: prompt.runtimeImageId,
          expectedDatabaseStartedAt: prompt.databaseStartedAt,
          promptIssuedAt: evidence.promptIssuedAt,
          role: prompt.role,
          operationId: prompt.readRequest.operationId,
          requestId: prompt.readRequest.requestId,
          correlationId: prompt.readRequest.correlationId
        })
      );
      if (
        appRoleRead.authorizationAuditEvents.some(({ occurredAt }) =>
          Date.parse(occurredAt) > Date.parse(evidence.responseCapturedAt)
        ) ||
        Date.parse(evidence.responseCapturedAt) >
          Date.parse(appRoleRead.databaseObservedAt) ||
        signedOutCapturedAt !== null &&
        Date.parse(appRoleRead.authenticationAssurance.authTime) <=
          Date.parse(signedOutCapturedAt)
      ) fail(
        "operational_browser_measurement_invalid",
        "Post-sign-out authentication does not prove a fresh SIWE ceremony."
      );
    }
    previous = Date.parse(evidence.responseCapturedAt);
    prompts.push(prompt);
    responses.push(response);
  }
  const reconstructed = deriveM1BOperationalBrowserRow({
    prompts,
    responses,
    capturedAt: row.capturedAt
  });
  const projected = Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "phaseEvidence")
  );
  if (
    row.capturedAt !== row.phaseEvidence.at(-1)?.responseCapturedAt ||
    canonicalJson(projected) !== canonicalJson(reconstructed)
  ) fail(
    "operational_browser_measurement_invalid",
    "Measured browser row does not reconstruct from its closed phases."
  );
  return row;
}

function validateRestartContext(restart) {
  if (!exactKeys(restart, [
    "capturedAt",
    "beforeDatabaseStartedAt",
    "afterDatabaseStartedAt",
    "eventWindow",
    "engine",
    "volume",
    "services"
  ]) || !Array.isArray(restart.services) || restart.services.length !== 3) {
    fail("operational_restart_invalid", "Restart context shape is invalid.");
  }
  iso(restart.capturedAt);
  iso(restart.beforeDatabaseStartedAt);
  iso(restart.afterDatabaseStartedAt);
  if (!exactKeys(restart.eventWindow, ["engineBeforeAt", "engineAfterAt"])) {
    fail("operational_restart_invalid", "Restart Engine event window is invalid.");
  }
  iso(restart.eventWindow.engineBeforeAt);
  iso(restart.eventWindow.engineAfterAt);
  if (
    Date.parse(restart.afterDatabaseStartedAt) <= Date.parse(restart.beforeDatabaseStartedAt) ||
    Date.parse(restart.eventWindow.engineAfterAt) <= Date.parse(restart.eventWindow.engineBeforeAt) ||
    restart.eventWindow.engineAfterAt !== restart.capturedAt ||
    !exactKeys(restart.engine, [
      "engineIdHash",
      "serverVersion",
      "securityOptionsHash",
      "rootless"
    ]) ||
    !/^0x[0-9a-f]{64}$/.test(restart.engine.engineIdHash) ||
    !IDENTIFIER.test(restart.engine.serverVersion) ||
    !/^0x[0-9a-f]{64}$/.test(restart.engine.securityOptionsHash) ||
    restart.engine.rootless !== true ||
    !exactKeys(restart.volume, [
      "name",
      "driver",
      "createdAt",
      "scope",
      "labelsHash",
      "optionsHash",
      "destination",
      "readWrite",
      "metadataHash",
      "createDestroyEventCount"
    ]) ||
    !IDENTIFIER.test(restart.volume.name) ||
    !IDENTIFIER.test(restart.volume.driver) ||
    !Number.isFinite(Date.parse(restart.volume.createdAt)) ||
    !IDENTIFIER.test(restart.volume.scope) ||
    !/^0x[0-9a-f]{64}$/.test(restart.volume.labelsHash) ||
    !/^0x[0-9a-f]{64}$/.test(restart.volume.optionsHash) ||
    restart.volume.destination !== "/var/lib/postgresql/data" ||
    restart.volume.readWrite !== true ||
    !/^0x[0-9a-f]{64}$/.test(restart.volume.metadataHash) ||
    restart.volume.createDestroyEventCount !== 0
  ) fail("operational_restart_invalid", "Restart database or volume binding is invalid.");
  const observed = new Set();
  for (const service of restart.services) {
    if (!exactKeys(service, ["service", "before", "after", "events"]) ||
      !new Set(["postgres", "pilot", "worker"]).has(service.service) ||
      observed.has(service.service) ||
      !exactKeys(service.events, [
        "start",
        "stop",
        "kill",
        "die",
        "restart",
        "create",
        "destroy"
      ]) ||
      service.events.start !== 1 ||
      service.events.die !== 1 ||
      service.events.create !== 0 ||
      service.events.destroy !== 0 ||
      !["stop", "kill", "restart"].every(
        (event) => Number.isSafeInteger(service.events[event]) && service.events[event] >= 0
      )) {
      fail("operational_restart_invalid", "Restart service event binding is invalid.");
    }
    observed.add(service.service);
    for (const identity of [service.before, service.after]) {
      if (!exactKeys(identity, ["containerId", "imageId", "startedAt", "configHash"]) ||
        !/^[0-9a-f]{12,64}$/.test(identity.containerId) ||
        !IMAGE_ID.test(identity.imageId) ||
        !/^0x[0-9a-f]{64}$/.test(identity.configHash)) {
        fail("operational_restart_invalid", "Restart service identity is invalid.");
      }
      iso(identity.startedAt);
    }
    const identityDrift = [
      ["containerId", service.before.containerId !== service.after.containerId],
      ["imageId", service.before.imageId !== service.after.imageId],
      ["configHash", service.before.configHash !== service.after.configHash],
      [
        "startedAt",
        Date.parse(service.after.startedAt) <= Date.parse(service.before.startedAt)
      ]
    ].filter(([, changed]) => changed).map(([field]) => field);
    if (identityDrift.length > 0) fail(
      "operational_restart_invalid",
      `Each existing service must restart exactly once without recreation or configuration drift; ${service.service} changed ${identityDrift.join(", ")}.`
    );
  }
  const serviceByName = Object.fromEntries(
    restart.services.map((service) => [service.service, service])
  );
  for (const [phase, databaseStartedAt] of [
    ["before", restart.beforeDatabaseStartedAt],
    ["after", restart.afterDatabaseStartedAt]
  ]) {
    const postgresStartedAt = Date.parse(serviceByName.postgres[phase].startedAt);
    const pilotStartedAt = Date.parse(serviceByName.pilot[phase].startedAt);
    const workerStartedAt = Date.parse(serviceByName.worker[phase].startedAt);
    const postmasterStartedAt = Date.parse(databaseStartedAt);
    if (
      postgresStartedAt > postmasterStartedAt ||
      postmasterStartedAt >= pilotStartedAt ||
      pilotStartedAt >= workerStartedAt
    ) fail("operational_restart_invalid", "PostgreSQL, Pilot, and Worker startup chronology is invalid.");
  }
  return restart;
}

function criticalReference(criticalArtifacts, id) {
  const artifact = criticalArtifacts.find((entry) => entry.id === id);
  if (!artifact) {
    fail("operational_journey_binding_invalid", `Journey source artifact ${id} is missing.`);
  }
  return artifact;
}

function requireJourneyProjection(value, role, step, sourcePointer) {
  if (
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
  ) fail(
    "operational_journey_binding_invalid",
    `${role}:${step} is missing ${sourcePointer}.`
  );
  return value;
}

function findHumanOperation(document, operationId) {
  return document.operations?.find((entry) => entry.operationId === operationId);
}

function firstProofTime(value) {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    for (const key of ["occurredAt", "completedAt", "capturedAt", "verificationCapturedAt"]) {
      const timestamp = candidate?.[key];
      if (typeof timestamp === "string" && Number.isFinite(Date.parse(timestamp))) {
        return new Date(timestamp).toISOString();
      }
    }
  }
  return null;
}

function journeyBinding({
  role,
  step,
  bindingKind,
  executionPhase,
  sourceReceiptKind,
  sourceArtifact,
  sourcePointer,
  projection,
  operationId = null,
  requestId = null,
  correlationId = null,
  responseSchemaVersion = null,
  performedAt = firstProofTime(projection),
  additionalSources = []
}) {
  const sourceInputs = [{ sourceArtifact, sourcePointer, projection }, ...additionalSources];
  if (
    !Array.isArray(additionalSources) ||
    sourceInputs.length < 1 || sourceInputs.length > 2 ||
    sourceInputs.some((entry) =>
      !entry?.sourceArtifact ||
      !IDENTIFIER.test(entry.sourceArtifact.id ?? "") ||
      !IDENTIFIER.test(entry.sourceArtifact.kind ?? "") ||
      !SHA256.test(entry.sourceArtifact.sha256 ?? "") ||
      typeof entry.sourcePointer !== "string" ||
      !entry.sourcePointer.startsWith("/")
    ) ||
    new Set(sourceInputs.map(({ sourceArtifact: artifact }) => artifact.id)).size !==
      sourceInputs.length
  ) fail("operational_journey_binding_invalid", `${role}:${step} source set is invalid.`);
  for (const entry of sourceInputs) {
    requireJourneyProjection(entry.projection, role, step, entry.sourcePointer);
  }
  for (const [name, value] of Object.entries({
    operationId,
    requestId,
    correlationId,
    responseSchemaVersion
  })) {
    if (value !== null && !IDENTIFIER.test(value)) {
      fail("operational_journey_binding_invalid", `${role}:${step} has an invalid ${name}.`);
    }
  }
  if (performedAt !== null) iso(performedAt, "operational_journey_binding_invalid");
  const sourceBindings = Object.freeze(sourceInputs.map((entry) => Object.freeze({
    sourceArtifact: Object.freeze({
      id: entry.sourceArtifact.id,
      kind: entry.sourceArtifact.kind,
      sha256: entry.sourceArtifact.sha256
    }),
    sourcePointer: entry.sourcePointer,
    sourceProjection: entry.projection,
    sourceProjectionHash: manifestHash(entry.projection)
  })));
  return Object.freeze({
    bindingKind,
    executionPhase,
    sourceReceiptKind,
    sourceBindings,
    combinedSourceProjectionHash: manifestHash(sourceBindings),
    operationId,
    requestId,
    correlationId,
    responseSchemaVersion,
    performedAt
  });
}

export function createM1BOperationalJourneyBindings({
  criticalDocuments,
  criticalArtifacts,
  supportingArtifacts = []
}) {
  if (!criticalDocuments || typeof criticalDocuments !== "object") {
    fail("operational_journey_binding_invalid", "Critical journey documents are missing.");
  }
  const human = criticalDocuments.human_critical;
  const capitalPartner = criticalDocuments.capital_partner_critical;
  const agentBefore = criticalDocuments.agent_before;
  const agentAfter = criticalDocuments.agent_after;
  const source = {
    human: criticalReference(criticalArtifacts, "human_critical"),
    capitalPartner: criticalReference(criticalArtifacts, "capital_partner_critical"),
    agentBefore: criticalReference(criticalArtifacts, "agent_before"),
    agentAfter: criticalReference(criticalArtifacts, "agent_after"),
    agentApplicationMcp: criticalReference(
      supportingArtifacts,
      "agent_application_mcp"
    ),
    agentRuntimeMcp: criticalReference(supportingArtifacts, "agent_runtime_mcp")
  };
  const humanOrigin = human?.originLineage?.commandReceipts;
  const humanOperations = Object.freeze({
    recovery: findHumanOperation(human, "pilotReadWorkspaceResume"),
    acceptance: findHumanOperation(human, "pilotAcceptCreditOffer"),
    execution: findHumanOperation(human, "pilotExecuteSandboxObligation"),
    repayment: findHumanOperation(human, "pilotPostSandboxRepayment"),
    evidence: findHumanOperation(human, "pilotReadOwnObligationEvidence")
  });
  if (!Array.isArray(humanOrigin) || humanOrigin.length !== 4) {
    fail("operational_journey_binding_invalid", "Human retained origin command lineage is incomplete.");
  }
  const humanDefinition = {
    sign_in: [
      "observed_ui_checkpoint",
      "post_restart",
      "human_critical_receipt",
      "/authentication",
      { authentication: human?.authentication, actorScope: human?.actorScope },
      {}
    ],
    subject_consent: [
      "durable_operation",
      "retained_lineage_revalidated_post_restart",
      "human_critical_receipt",
      "/originLineage/commandReceipts/0..1",
      humanOrigin.slice(0, 2),
      {}
    ],
    credit_request: [
      "durable_operation",
      "retained_lineage_revalidated_post_restart",
      "human_critical_receipt",
      "/originLineage/commandReceipts/2",
      humanOrigin[2],
      { operationId: "pilotRequestCredit" }
    ],
    decision_offer: [
      "durable_operation",
      "retained_lineage_revalidated_post_restart",
      "human_critical_receipt",
      "/originLineage/commandReceipts/3",
      { commandReceipt: humanOrigin[3], offer: human?.recovery?.offerProjectionProof },
      { operationId: "pilotEvaluateCreditApplication" }
    ],
    reload_relogin: [
      "observed_ui_checkpoint",
      "post_restart",
      "human_critical_receipt",
      "/authentication+/recovery",
      { authentication: human?.authentication, recovery: human?.recovery },
      {}
    ],
    offer_recovery: [
      "durable_operation",
      "post_restart",
      "human_critical_receipt",
      "/recovery",
      human?.recovery,
      {
        operationId: human?.recovery?.operationId,
        requestId: human?.recovery?.requestId,
        correlationId: human?.recovery?.correlationId,
        responseSchemaVersion: human?.recovery?.responseSchemaVersion
      }
    ],
    acceptance: [
      "durable_operation",
      "post_restart",
      "human_critical_receipt",
      "/operations/pilotAcceptCreditOffer",
      humanOperations.acceptance,
      humanOperations.acceptance ?? {}
    ],
    obligation: [
      "durable_state_projection",
      "post_restart",
      "human_critical_receipt",
      "/operations/pilotAcceptCreditOffer+/durability/economicReadBack",
      {
        acceptance: humanOperations.acceptance,
        obligationId: human?.linkage?.obligationId,
        economicReadBack: human?.durability?.economicReadBack
      },
      humanOperations.acceptance ?? {}
    ],
    controlled_sandbox_execution: [
      "durable_operation",
      "post_restart",
      "human_critical_receipt",
      "/operations/pilotExecuteSandboxObligation",
      humanOperations.execution,
      humanOperations.execution ?? {}
    ],
    repayment: [
      "durable_operation",
      "post_restart",
      "human_critical_receipt",
      "/operations/pilotPostSandboxRepayment+/durability/economicReadBack",
      {
        operation: humanOperations.repayment,
        economicReadBack: human?.durability?.economicReadBack
      },
      humanOperations.repayment ?? {}
    ],
    evidence: [
      "durable_operation",
      "post_restart",
      "human_critical_receipt",
      "/operations/pilotReadOwnObligationEvidence+/durability/evidenceCompleteness",
      {
        operation: humanOperations.evidence,
        evidenceCompleteness: human?.durability?.evidenceCompleteness
      },
      humanOperations.evidence ?? {}
    ]
  };

  const capitalCommands = capitalPartner?.durability?.commandReceipts ?? [];
  const authorCommands = capitalCommands.filter(
    (entry) => entry.operationId === "pilotAuthorCapitalPartnerOffer"
  );
  const withdrawCommand = capitalCommands.find(
    (entry) => entry.operationId === "pilotTransitionCapitalPartnerOffer"
  );
  const capitalDefinition = {
    partner_sign_in: [
      "observed_ui_checkpoint",
      "post_restart",
      "capital_partner_critical_receipt",
      "/authentication/capitalPartner+/profile/selfQueryProof",
      {
        authentication: capitalPartner?.authentication?.capitalPartner,
        selfQueryProof: capitalPartner?.profile?.selfQueryProof
      },
      {}
    ],
    passport_review: [
      "durable_state_projection",
      "post_restart",
      "capital_partner_critical_receipt",
      "/currentLineage/passport+/withdrawalLineage/passport",
      [capitalPartner?.currentLineage?.passport, capitalPartner?.withdrawalLineage?.passport],
      {}
    ],
    author_offer: [
      "durable_operation",
      "post_restart",
      "capital_partner_critical_receipt",
      "/durability/commandReceipts/pilotAuthorCapitalPartnerOffer",
      {
        commands: authorCommands,
        offers: [
          capitalPartner?.currentLineage?.authoredOffer,
          capitalPartner?.withdrawalLineage?.authoredOffer
        ]
      },
      { operationId: "pilotAuthorCapitalPartnerOffer" }
    ],
    replace_offer: [
      "durable_state_projection",
      "post_restart",
      "capital_partner_critical_receipt",
      "/currentLineage/replacement+/withdrawalLineage/replacement",
      [capitalPartner?.currentLineage?.replacement, capitalPartner?.withdrawalLineage?.replacement],
      { operationId: "pilotAuthorCapitalPartnerOffer" }
    ],
    withdraw_offer: [
      "durable_operation",
      "post_restart",
      "capital_partner_critical_receipt",
      "/withdrawalLineage/withdrawal",
      {
        withdrawal: capitalPartner?.withdrawalLineage?.withdrawal,
        commandReceipt: withdrawCommand
      },
      {
        operationId: "pilotTransitionCapitalPartnerOffer",
        requestId: capitalPartner?.withdrawalLineage?.withdrawal?.requestId,
        correlationId: capitalPartner?.withdrawalLineage?.withdrawal?.correlationId,
        responseSchemaVersion: capitalPartner?.withdrawalLineage?.withdrawal?.responseSchemaVersion
      }
    ],
    borrower_recovers_current_offer: [
      "durable_operation",
      "post_restart",
      "capital_partner_critical_receipt",
      "/currentLineage/borrowerRecovery+/withdrawalLineage/borrowerRecovery",
      [
        capitalPartner?.currentLineage?.borrowerRecovery,
        capitalPartner?.withdrawalLineage?.borrowerRecovery
      ],
      {}
    ]
  };

  const workflow = agentBefore?.lifecycle?.workflowReceipt;
  const mcp = agentBefore?.lifecycle?.mcpReceipt;
  const mcpStep = (operationId) => mcp?.steps?.find(
    (entry) => entry.operationId === operationId
  );
  const agentOperationMetadata = (operationId) => {
    const step = mcpStep(operationId);
    return {
      operationId,
      requestId: step?.requestId ?? null,
      correlationId: workflow?.correlationId ?? null,
      responseSchemaVersion: step?.responseSchemaVersion ?? null
    };
  };
  const agentDefinition = {
    principal_sign_in: [
      "observed_ui_checkpoint",
      "pre_restart",
      "agent_before_acceptance",
      "/candidateReleaseId+/accountHash",
      {
        candidateReleaseId: agentBefore?.candidateReleaseId,
        candidateMarker: agentBefore?.candidateMarker,
        accountHash: agentBefore?.accountHash
      },
      {}
    ],
    agent_subject: [
      "durable_state_projection",
      "pre_restart",
      "agent_before_acceptance",
      "/subjectId+/applicationHandoff/subjectId",
      {
        subjectId: agentBefore?.subjectId,
        handoffSubjectId: agentBefore?.applicationHandoff?.subjectId
      },
      {}
    ],
    account_proof: [
      "observed_ui_checkpoint",
      "pre_restart",
      "agent_before_acceptance",
      "/accountHash",
      { accountHash: agentBefore?.accountHash },
      {}
    ],
    mandate: [
      "durable_state_projection",
      "pre_restart",
      "agent_before_acceptance",
      "/mandateId+/applicationHandoff+/runtimeHandoff",
      {
        mandateId: agentBefore?.mandateId,
        applicationHandoff: agentBefore?.applicationHandoff,
        runtimeHandoff: agentBefore?.runtimeHandoff
      },
      {}
    ],
    agent_application: [
      "durable_operation",
      "pre_restart",
      "agent_application_mcp_receipt",
      "/steps",
      agentBefore?.offerReceipt?.steps,
      {}
    ],
    offer: [
      "durable_state_projection",
      "pre_restart",
      "agent_application_mcp_receipt",
      "/decision+/offer",
      {
        decision: agentBefore?.offerReceipt?.decision,
        offer: agentBefore?.offerReceipt?.offer
      },
      {}
    ],
    acceptance: [
      "durable_operation",
      "pre_restart",
      "agent_runtime_mcp_receipt",
      "/steps/pilotAcceptCreditOffer",
      mcpStep("pilotAcceptCreditOffer"),
      {
        ...agentOperationMetadata("pilotAcceptCreditOffer"),
        additionalSources: [{
          sourceArtifact: source.agentBefore,
          sourcePointer: "/lifecycle/workflowReceipt/acceptance",
          projection: workflow?.acceptance
        }]
      }
    ],
    mcp_execution: [
      "durable_operation",
      "pre_restart",
      "agent_runtime_mcp_receipt",
      "/steps/pilotExecuteSandboxObligation",
      mcpStep("pilotExecuteSandboxObligation"),
      {
        ...agentOperationMetadata("pilotExecuteSandboxObligation"),
        additionalSources: [{
          sourceArtifact: source.agentBefore,
          sourcePointer: "/lifecycle/workflowReceipt/executionReceipt",
          projection: workflow?.executionReceipt
        }]
      }
    ],
    repayment: [
      "durable_operation",
      "pre_restart",
      "agent_runtime_mcp_receipt",
      "/steps/pilotPostSandboxRepayment",
      mcpStep("pilotPostSandboxRepayment"),
      {
        ...agentOperationMetadata("pilotPostSandboxRepayment"),
        additionalSources: [{
          sourceArtifact: source.agentBefore,
          sourcePointer: "/lifecycle/workflowReceipt/repayment",
          projection: workflow?.repayment
        }]
      }
    ],
    evidence: [
      "durable_operation",
      "pre_restart",
      "agent_runtime_mcp_receipt",
      "/steps/pilotReadOwnObligationEvidence",
      mcpStep("pilotReadOwnObligationEvidence"),
      {
        ...agentOperationMetadata("pilotReadOwnObligationEvidence"),
        additionalSources: [{
          sourceArtifact: source.agentBefore,
          sourcePointer: "/lifecycle/evidence",
          projection: agentBefore?.lifecycle?.evidence
        }]
      }
    ],
    restart_recovery: [
      "restart_recovery",
      "post_restart_recovery",
      "agent_after_recovery_receipt",
      "/recoveryReceipt+/canonicalRecovery",
      {
        recoveryReceipt: agentAfter?.recoveryReceipt,
        canonicalRecovery: agentAfter?.canonicalRecovery,
        lifecycleMutationPerformed: agentAfter?.lifecycleMutationPerformed
      },
      {}
    ]
  };

  const byRole = {
    human: [humanDefinition, source.human],
    principal_agent: [agentDefinition, null],
    capital_partner: [capitalDefinition, source.capitalPartner]
  };
  return Object.freeze(Object.fromEntries(
    M1_B_OPERATIONAL_ROLES.map((role) => {
      const [definition, defaultArtifact] = byRole[role];
      return [role, Object.freeze(Object.fromEntries(
        M1_B_OPERATIONAL_JOURNEY_STEPS[role].map((step) => {
          const [
            bindingKind,
            executionPhase,
            sourceReceiptKind,
            sourcePointer,
            projection,
            metadata
          ] = definition[step];
          const sourceArtifact = role !== "principal_agent"
            ? defaultArtifact
            : step === "restart_recovery"
              ? source.agentAfter
              : sourceReceiptKind === "agent_application_mcp_receipt"
                ? source.agentApplicationMcp
                : sourceReceiptKind === "agent_runtime_mcp_receipt"
                  ? source.agentRuntimeMcp
                  : source.agentBefore;
          return [step, journeyBinding({
            role,
            step,
            bindingKind,
            executionPhase,
            sourceReceiptKind,
            sourceArtifact,
            sourcePointer,
            projection,
            ...metadata
          })];
        })
      ))];
    })
  ));
}

function journeyBrowserAuditMap(browserAuditRecords) {
  if (!Array.isArray(browserAuditRecords) || browserAuditRecords.length !== 24) {
    fail(
      "operational_journey_binding_invalid",
      "Journey reconstruction requires the exact 24 measured browser audits."
    );
  }
  const records = new Map();
  for (const entry of browserAuditRecords) {
    if (
      !exactKeys(entry, ["artifact", "document"]) ||
      !exactKeys(entry.artifact, ["id", "kind", "relativePath", "sha256"]) ||
      entry.artifact.kind !== "browser_audit" ||
      entry.document?.schemaVersion !== "m1_b_browser_row_audit.v2" ||
      !M1_B_OPERATIONAL_ROLES.includes(entry.document.role) ||
      !M1_B_OPERATIONAL_BROWSER_CHECKS.includes(entry.document.check) ||
      entry.artifact.id !== artifactId(
        "browser",
        entry.document.role,
        `${entry.document.check}_audit`
      ) ||
      entry.artifact.sha256 !== sha256(jsonBytes(entry.document))
    ) fail(
      "operational_journey_binding_invalid",
      "Journey browser audit reference does not bind the measured audit bytes."
    );
    const key = `${entry.document.role}:${entry.document.check}`;
    if (records.has(key)) fail(
      "operational_journey_binding_invalid",
      "Journey browser audit set contains a duplicate row."
    );
    records.set(key, entry);
  }
  if (M1_B_OPERATIONAL_ROLES.some((role) =>
    M1_B_OPERATIONAL_BROWSER_CHECKS.some((check) => !records.has(`${role}:${check}`))
  )) fail(
    "operational_journey_binding_invalid",
    "Journey browser audit set is incomplete."
  );
  return records;
}

export function createM1BOperationalJourneyReceipts({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  criticalDocuments,
  criticalArtifacts,
  supportingArtifacts = [],
  browserAuditRecords,
  restart,
  restartArtifact,
  releaseIdentityArtifact,
  reconciledAt
}) {
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    restart?.afterDatabaseStartedAt !== databaseStartedAt ||
    !exactKeys(releaseIdentityArtifact, ["id", "kind", "relativePath", "sha256"]) ||
    releaseIdentityArtifact.id !== "release_identity" ||
    releaseIdentityArtifact.kind !== "release_identity" ||
    !SHA256.test(releaseIdentityArtifact.sha256 ?? "") ||
    !exactKeys(restartArtifact, ["id", "kind", "relativePath", "sha256"]) ||
    restartArtifact.id !== "operational_restart" ||
    restartArtifact.kind !== "restart_log" ||
    !SHA256.test(restartArtifact.sha256 ?? "")
  ) fail(
    "operational_journey_binding_invalid",
    "Journey candidate, release, or restart context is invalid."
  );
  iso(databaseStartedAt, "operational_journey_binding_invalid");
  iso(reconciledAt, "operational_journey_binding_invalid");
  validateRestartContext(restart);
  const browserRecords = journeyBrowserAuditMap(browserAuditRecords);
  const latestBrowserTime = Math.max(...[...browserRecords.values()].map(
    ({ document }) => Date.parse(document.capturedAt)
  ));
  if (
    !Number.isFinite(latestBrowserTime) ||
    Date.parse(reconciledAt) < latestBrowserTime
  ) fail(
    "operational_journey_binding_invalid",
    "Journey reconciliation must follow the exact measured browser matrix."
  );
  const journeyBindings = createM1BOperationalJourneyBindings({
    criticalDocuments,
    criticalArtifacts,
    supportingArtifacts
  });
  const durableSourceObservedAt = (role, binding) => {
    const value = role === "human"
      ? criticalDocuments.human_critical?.capturedAt
      : role === "capital_partner"
        ? criticalDocuments.capital_partner_critical?.capturedAt
        : binding.executionPhase === "post_restart_recovery"
          ? criticalDocuments.agent_after?.recoveryReceipt?.capturedAt ??
            criticalDocuments.agent_after?.capturedAt ??
            restart.eventWindow.engineAfterAt
          : restart.eventWindow.engineBeforeAt;
    return iso(value, "operational_journey_binding_invalid");
  };
  let derivedJourneyStepCount = 0;
  const receipts = Object.fromEntries(M1_B_OPERATIONAL_ROLES.map((role) => {
    const expected = M1_B_OPERATIONAL_JOURNEY_STEPS[role];
    const roleCriticalArtifacts = role === "principal_agent"
      ? [
          criticalReference(criticalArtifacts, "agent_before"),
          criticalReference(criticalArtifacts, "agent_after"),
          criticalReference(supportingArtifacts, "agent_application_mcp"),
          criticalReference(supportingArtifacts, "agent_runtime_mcp")
        ]
      : [criticalForRole(criticalArtifacts, role)];
    let previousStepHash = null;
    const steps = expected.map((id, index) => {
      const binding = journeyBindings[role][id];
      const checkpointCheck =
        M1_B_OPERATIONAL_UI_CHECKPOINT_BROWSER_BINDINGS[role]?.[id] ?? null;
      const checkpoint = checkpointCheck === null
        ? null
        : browserRecords.get(`${role}:${checkpointCheck}`) ?? null;
      if (
        (binding.bindingKind === "observed_ui_checkpoint") !==
          (checkpoint !== null)
      ) fail(
        "operational_journey_binding_invalid",
        `${role}:${id} does not bind the exact measured browser checkpoint.`
      );
      const sourceObservedAt = checkpoint === null
        ? durableSourceObservedAt(role, binding)
        : checkpoint.document.capturedAt;
      const performedAt = binding.performedAt;
      if (
        (performedAt !== null && Date.parse(performedAt) > Date.parse(sourceObservedAt)) ||
        Date.parse(sourceObservedAt) > Date.parse(reconciledAt)
      ) fail(
        "operational_journey_binding_invalid",
        `${role}:${id} has source or reconciliation chronology drift.`
      );
      const core = {
        index: index + 1,
        id,
        transport: M1_B_OPERATIONAL_JOURNEY_TRANSPORTS[role][id],
        sourceOrder: index + 1,
        performedAt,
        sourceObservedAt,
        reconciledAt,
        uiCheckpointArtifact: checkpoint === null
          ? null
          : Object.freeze({
              id: checkpoint.artifact.id,
              sha256: checkpoint.artifact.sha256,
              check: checkpointCheck
            }),
        postRestartReconciliationOnly:
          role === "principal_agent" && id !== "restart_recovery",
        binding,
        previousStepHash,
        canonicalPersistence: "postgresql",
        fixtureUsed: false,
        productionFundsMoved: false
      };
      const stepHash = manifestHash(core);
      previousStepHash = stepHash;
      derivedJourneyStepCount += 1;
      return Object.freeze({ ...core, stepHash });
    });
    return [role, Object.freeze({
      schemaVersion: "m1_b_journey_receipt.v2",
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      sourceRuntime: "local_exact_commit",
      role,
      status: "passed",
      derivation: Object.freeze({
        operatorJourneyInputAccepted: false,
        sourceOrderDerived: true,
        reconciledAt,
        uiCheckpointCount: steps.filter(
          ({ uiCheckpointArtifact }) => uiCheckpointArtifact !== null
        ).length
      }),
      releaseIdentityArtifact: Object.freeze({
        id: releaseIdentityArtifact.id,
        sha256: releaseIdentityArtifact.sha256
      }),
      criticalArtifacts: roleCriticalArtifacts.map(({ id, kind, sha256: digest }) =>
        Object.freeze({ id, kind, sha256: digest })
      ),
      ...(role === "principal_agent"
        ? { restartArtifact: Object.freeze({
            id: restartArtifact.id,
            sha256: restartArtifact.sha256
          }) }
        : {}),
      steps,
      finalStepHash: previousStepHash,
      canonicalPersistence: "postgresql",
      fixtureUsed: false,
      productionFundsMoved: false,
      redaction: Object.freeze({
        containsSecrets: false,
        containsRawPii: false,
        containsSessionMaterial: false
      })
    })];
  }));
  if (derivedJourneyStepCount !== 28) fail(
    "operational_journey_binding_invalid",
    "The exact 28-step journey set was not derived from durable and measured sources."
  );
  return Object.freeze(receipts);
}

export function validateM1BOperationalJourneyReceipts(receipts, context) {
  if (!exactKeys(receipts, M1_B_OPERATIONAL_ROLES)) fail(
    "operational_journey_binding_invalid",
    "Journey receipt role set is not exact."
  );
  const expected = createM1BOperationalJourneyReceipts(context);
  if (canonicalJson(receipts) !== canonicalJson(expected)) fail(
    "operational_journey_binding_invalid",
    "Journey receipts do not reconstruct from their critical and browser sources."
  );
  return receipts;
}

async function containedArtifact(relativePath, outputRoot) {
  if (typeof relativePath !== "string" || relativePath.includes("..") || isAbsolute(relativePath)) {
    fail("operational_visual_artifact_invalid", "Visual artifact path is invalid.");
  }
  const path = resolve(ROOT, relativePath);
  const sourceMetadata = await lstat(path);
  if (!sourceMetadata.isFile() || sourceMetadata.isSymbolicLink()) {
    fail("operational_visual_artifact_invalid", "Visual artifact must be one regular non-symlink file.");
  }
  const [outputReal, pathReal] = await Promise.all([
    realpath(outputRoot),
    realpath(path)
  ]);
  const relation = relative(outputReal, pathReal);
  if (
    relation === "" || relation.startsWith("..") || isAbsolute(relation)
  ) fail("operational_visual_artifact_invalid", "Visual artifact is outside the private output root.");
  const metadata = await stat(pathReal);
  if (
    metadata.size < 1 || metadata.size > 64 * 1024 * 1024 ||
    (metadata.mode & 0o777) !== 0o600
  ) {
    fail(
      "operational_visual_artifact_invalid",
      "Visual artifact is not one private 0600 bounded regular file."
    );
  }
  const bytes = await readFile(pathReal);
  return Object.freeze({
    relativePath: relative(ROOT, pathReal),
    sha256: sha256(bytes),
    bytes
  });
}

function browserReceiptLink(value, expectedId = null) {
  if (
    !value || typeof value !== "object" ||
    !IDENTIFIER.test(value.id ?? "") ||
    (expectedId !== null && value.id !== expectedId) ||
    !SHA256.test(value.sha256 ?? "")
  ) fail(
    "operational_browser_document_invalid",
    "Browser Evidence artifact link is invalid."
  );
  return Object.freeze({ id: value.id, sha256: value.sha256 });
}

function browserAssertionEvidenceHash({
  check,
  assertionId,
  measurementManifestHash,
  negativeCaseArtifact,
  restartArtifact
}) {
  if (check === "negative_authorization" &&
    assertionId !== "private_workspace_remains_queryable") {
    return `0x${negativeCaseArtifact.sha256}`;
  }
  if (check === "restart_recovery" &&
    assertionId === "sole_restart_and_runtime_projection_reconciled") {
    return `0x${restartArtifact.sha256}`;
  }
  return measurementManifestHash;
}

export function createM1BOperationalBrowserRowDocuments({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  row,
  releaseIdentityArtifact,
  criticalArtifact,
  restartArtifact = null,
  negativeCaseArtifact = null,
  visualArtifacts,
  readinessObservation,
  outputRootRelativePath
}) {
  validateMeasuredBrowserObservation(row, {
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt
  });
  const releaseIdentity = browserReceiptLink(
    releaseIdentityArtifact,
    "release_identity"
  );
  const expectedCritical = {
    human: ["human_critical", "postgres_receipt"],
    principal_agent: ["agent_after", "runtime_receipt"],
    capital_partner: ["capital_partner_critical", "postgres_receipt"]
  }[row.role];
  if (
    !criticalArtifact ||
    criticalArtifact.id !== expectedCritical?.[0] ||
    criticalArtifact.kind !== expectedCritical?.[1] ||
    !SHA256.test(criticalArtifact.sha256 ?? "")
  ) fail(
    "operational_browser_document_invalid",
    "Browser row is bound to the wrong role critical artifact."
  );
  const critical = Object.freeze({
    id: criticalArtifact.id,
    kind: criticalArtifact.kind,
    sha256: criticalArtifact.sha256
  });
  const restart = restartArtifact === null
    ? null
    : browserReceiptLink(restartArtifact, "operational_restart");
  if (
    typeof outputRootRelativePath !== "string" ||
    !/^output\/playwright\/[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(
      outputRootRelativePath
    ) || !Array.isArray(visualArtifacts) ||
    visualArtifacts.length !== row.phaseEvidence.length
  ) fail(
    "operational_browser_document_invalid",
    "Browser Evidence output or visual set is invalid."
  );
  const visuals = Object.freeze(visualArtifacts.map((visual, index) => {
    const phase = row.phaseEvidence[index].prompt.phase;
    const expectedId = artifactId(
      "browser",
      row.role,
      `${row.check}_${browserPhaseArtifactToken(phase)}_shot`
    );
    const expectedPath =
      `${outputRootRelativePath}/${candidateReleaseId}.browser.` +
      `${row.role}.${row.check}.${phase}.png`;
    if (
      !exactKeys(visual, [
        "phase", "id", "kind", "relativePath", "sha256", "challengeHash",
        "png"
      ]) || visual.phase !== phase || visual.id !== expectedId ||
      visual.kind !== "screenshot" || visual.relativePath !== expectedPath ||
      !SHA256.test(visual.sha256 ?? "") ||
      visual.challengeHash !==
        row.phaseEvidence[index].prompt.capture.challengeHash ||
      !exactKeys(visual.png, ["width", "height", "idatCount"]) ||
      !Number.isSafeInteger(visual.png.width) ||
      !Number.isSafeInteger(visual.png.height) ||
      !Number.isSafeInteger(visual.png.idatCount) || visual.png.idatCount < 1
    ) fail(
      "operational_browser_document_invalid",
      "Browser visual does not bind its exact measured phase."
    );
    return Object.freeze(visual);
  }));
  const expectedNegative = row.negativeCase === null
    ? null
    : Object.freeze({
        id: artifactId("negative", row.negativeCase.group, row.negativeCase.id),
        kind: "negative_receipt",
        sha256: negativeCaseArtifact?.sha256,
        caseDefinitionHash: negativeDefinition(
          row.negativeCase.group,
          row.negativeCase.id
        )?.caseDefinitionHash
      });
  if (
    canonicalJson(negativeCaseArtifact) !== canonicalJson(expectedNegative) ||
    (row.check === "restart_recovery") !== (restart !== null)
  ) fail(
    "operational_browser_document_invalid",
    "Browser negative or restart linkage is invalid."
  );
  const readiness = validateM1BOperationalBrowserRuntimeObservation(
    readinessObservation,
    {
      candidateReleaseId,
      role: row.role,
      check: row.check,
      origin: row.origin,
      databaseStartedAt,
      runtimeImageId
    }
  );
  if (Date.parse(readiness.request.requestedAt) < Date.parse(row.capturedAt)) {
    fail(
      "operational_browser_document_invalid",
      "Browser readiness reconciliation predates its measured row."
    );
  }
  const measurementPhases = Object.freeze(row.phaseEvidence.map(
    (entry, index) => Object.freeze({
      phase: entry.prompt.phase,
      prompt: entry.prompt,
      promptIssuedAt: entry.promptIssuedAt,
      response: entry.response,
      responseCapturedAt: entry.responseCapturedAt,
      authorizationObservation: entry.authorizationObservation,
      visualArtifact: visuals[index]
    })
  ));
  const diagnostics = Object.freeze({
    driver: row.driver,
    phaseCount: measurementPhases.length,
    consoleErrorCount: measurementPhases.reduce(
      (sum, { response }) => sum + response.browserControl.consoleErrorCount,
      0
    ),
    failedNetworkRequestCount: measurementPhases.reduce(
      (sum, { response }) =>
        sum + response.browserControl.failedNetworkRequestCount,
      0
    ),
    observationMethod: "controlled_chrome_prompt_response"
  });
  if (
    diagnostics.consoleErrorCount !== 0 ||
    diagnostics.failedNetworkRequestCount !== 0
  ) fail(
    "operational_browser_document_invalid",
    "Browser diagnostics are not clean."
  );
  const queryReconciliation = Object.freeze({
    runtimeCapturedProjection: true,
    exactRequestTwoAuditReconciled: measurementPhases
      .filter(({ prompt }) => prompt.readRequest !== null)
      .every(({ authorizationObservation }) =>
        authorizationObservation.authorizationAttemptCount === 1 &&
        authorizationObservation.authorizationAuditEventCount === 2 &&
        authorizationObservation.authorizationBinding
          .exactTwoAllowAuditSetBound === true
      ),
    durableQueryResponseTableAvailable: false,
    countsAndPresenceFlagsCanonical: false,
    canonicalJourneyTruthSource: "parsed_critical_receipt"
  });
  if (queryReconciliation.exactRequestTwoAuditReconciled !== true) fail(
    "operational_browser_document_invalid",
    "Browser private reads are not reconciled to their exact audit sets."
  );
  const assertions = Object.freeze(
    M1_B_OPERATIONAL_BROWSER_ASSERTIONS[row.check].map((id) => Object.freeze({
      id,
      passed: true,
      evidenceHash: browserAssertionEvidenceHash({
        check: row.check,
        assertionId: id,
        measurementManifestHash: row.measurementManifestHash,
        negativeCaseArtifact,
        restartArtifact: restart
      })
    }))
  );
  const browserObservationHash = manifestHash({
    role: row.role,
    check: row.check,
    capturedAt: row.capturedAt,
    driver: row.driver,
    measurementManifestHash: row.measurementManifestHash,
    measurementPhases,
    diagnostics,
    queryReconciliation,
    assertions,
    visualArtifacts: visuals,
    negativeCaseArtifact,
    restartArtifact: restart
  });
  const runtimeId = artifactId("browser", row.role, `${row.check}_runtime`);
  const auditId = artifactId("browser", row.role, `${row.check}_audit`);
  const runtimeDocument = Object.freeze({
    schemaVersion: "m1_b_browser_row_runtime_receipt.v2",
    artifactId: runtimeId,
    browserAuditArtifactId: auditId,
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    sourceRuntime: "local_exact_commit",
    role: row.role,
    check: row.check,
    status: "passed",
    observedAt: row.capturedAt,
    canonicalPersistence: "postgresql",
    releaseIdentityArtifact: releaseIdentity,
    criticalArtifact: critical,
    measurementManifestHash: row.measurementManifestHash,
    measurementPhases,
    diagnostics,
    queryReconciliation,
    assertions,
    visualArtifacts: visuals,
    negativeCaseArtifact,
    ...(restart === null ? {} : { restartArtifact: restart }),
    browserObservationHash,
    readinessObservation: readiness,
    fixtureUsed: false,
    browserStorageAuthority: false,
    productionFundsMoved: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    })
  });
  const runtimeRelativePath =
    `${outputRootRelativePath}/${candidateReleaseId}.browser.${row.role}.` +
    `${row.check}.runtime.json`;
  const runtimeArtifact = Object.freeze({
    id: runtimeId,
    kind: "runtime_receipt",
    relativePath: runtimeRelativePath,
    sha256: sha256(jsonBytes(runtimeDocument))
  });
  const auditDocument = Object.freeze({
    schemaVersion: "m1_b_browser_row_audit.v2",
    artifactId: auditId,
    candidateReleaseId,
    sourceTreeHash,
    sourceRuntime: "local_exact_commit",
    role: row.role,
    check: row.check,
    status: "passed",
    driver: row.driver,
    realBrowser: true,
    origin: row.origin,
    capturedAt: row.capturedAt,
    runtimeImageId,
    databaseStartedAt,
    releaseIdentityArtifact: releaseIdentity,
    authentication: measurementPhases.at(-1).response.measurement.authentication,
    browserStorageAuthority: false,
    diagnostics,
    queryReconciliation,
    assertions,
    browserObservationHash,
    measurementManifestHash: row.measurementManifestHash,
    measurementPhases,
    visualArtifacts: visuals,
    negativeCaseArtifact,
    ...(restart === null ? {} : { restartArtifact: restart }),
    runtimeArtifact: Object.freeze({
      id: runtimeArtifact.id,
      sha256: runtimeArtifact.sha256
    }),
    fixtureUsed: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    })
  });
  const auditArtifact = Object.freeze({
    id: auditId,
    kind: "browser_audit",
    relativePath:
      `${outputRootRelativePath}/${candidateReleaseId}.browser.${row.role}.` +
      `${row.check}.audit.json`,
    sha256: sha256(jsonBytes(auditDocument))
  });
  return Object.freeze({
    runtimeDocument,
    runtimeArtifact,
    auditDocument,
    auditArtifact,
    visualArtifacts: visuals
  });
}

export function validateM1BOperationalBrowserRowDocuments(value, context) {
  if (!exactKeys(value, [
    "runtimeDocument", "runtimeArtifact", "auditDocument", "auditArtifact",
    "visualArtifacts"
  ])) fail(
    "operational_browser_document_invalid",
    "Browser document envelope is invalid."
  );
  const reconstructed = createM1BOperationalBrowserRowDocuments(context);
  if (canonicalJson(value) !== canonicalJson(reconstructed)) fail(
    "operational_browser_document_invalid",
    "Browser runtime and audit documents do not reconstruct."
  );
  return value;
}

function validateNegativeExecutionEvidence({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  outputRoot,
  derivedNegativeProofs,
  negativeExecutionManifest,
  negativeTapArtifacts
}) {
  const exactProofs = derivedNegativeProofs.filter(
    ({ sourceMode }) => sourceMode !== "live_post_restart"
  );
  if (
    exactProofs.length !== 12 ||
    !Array.isArray(negativeTapArtifacts) ||
    negativeTapArtifacts.length !== 12 ||
    !negativeExecutionManifest ||
    negativeExecutionManifest.schemaVersion !==
      "m1_b_negative_exact_source_execution_manifest.v2" ||
    negativeExecutionManifest.candidateReleaseId !== candidateReleaseId ||
    negativeExecutionManifest.sourceTreeHash !== sourceTreeHash ||
    negativeExecutionManifest.runtimeImageId !== runtimeImageId ||
    negativeExecutionManifest.caseCount !== 12 ||
    !Array.isArray(negativeExecutionManifest.cases) ||
    negativeExecutionManifest.cases.length !== 12 ||
    negativeExecutionManifest.postgres?.publishedPortCount !== 0 ||
    negativeExecutionManifest.postgres?.retainedRuntimeAttached !== false ||
    negativeExecutionManifest.postgres?.internallyGeneratedCredentialsRemoved !== true ||
    negativeExecutionManifest.postgres?.containerRemoved !== true ||
    negativeExecutionManifest.postgres?.volumeRemoved !== true ||
    negativeExecutionManifest.postgres?.networkRemoved !== true ||
    negativeExecutionManifest.exactCandidateRunner?.imageId !== runtimeImageId ||
    negativeExecutionManifest.exactCandidateRunner?.readOnlyRootFilesystem !== true ||
    negativeExecutionManifest.exactCandidateRunner?.capDropAll !== true ||
    negativeExecutionManifest.exactCandidateRunner?.noNewPrivileges !== true ||
    negativeExecutionManifest.exactCandidateRunner?.rawTapPersistedPerCase !== true ||
    negativeExecutionManifest.productionFundsMoved !== false ||
    negativeExecutionManifest.redaction?.containsSecrets !== false ||
    negativeExecutionManifest.redaction?.containsRawPii !== false ||
    negativeExecutionManifest.redaction?.containsSessionMaterial !== false
  ) fail("operational_negative_execution_invalid", "Exact-source execution manifest is incomplete.");
  iso(
    negativeExecutionManifest.capturedAt,
    "operational_negative_execution_invalid"
  );
  const taps = new Map();
  for (const tap of negativeTapArtifacts) {
    if (
      !exactKeys(tap, ["id", "kind", "relativePath", "sha256", "bytes"]) ||
      tap.kind !== "tap_log" ||
      !IDENTIFIER.test(tap.id ?? "") ||
      taps.has(tap.id) ||
      typeof tap.relativePath !== "string" ||
      isAbsolute(tap.relativePath) ||
      tap.relativePath.split(sep).includes("..") ||
      dirname(resolve(ROOT, tap.relativePath)) !== resolve(outputRoot) ||
      !SHA256.test(tap.sha256 ?? "") ||
      !Buffer.isBuffer(tap.bytes) ||
      tap.bytes.length < 1 ||
      tap.bytes.length > 4 * 1024 * 1024 ||
      sha256(tap.bytes) !== tap.sha256
    ) fail("operational_negative_execution_invalid", "Raw exact-source TAP artifact is invalid.");
    taps.set(tap.id, tap);
  }
  const observed = new Set();
  for (const entry of negativeExecutionManifest.cases) {
    const key = `${entry?.group}:${entry?.id}`;
    const proof = exactProofs.find(
      ({ group, id }) => group === entry?.group && id === entry?.id
    );
    const tap = taps.get(entry?.tapArtifact?.id);
    if (
      !proof ||
      observed.has(key) ||
      entry.sourceMode !== proof.sourceMode ||
      entry.caseDefinitionHash !== proof.caseDefinitionHash ||
      !/^0x[0-9a-f]{64}$/.test(entry.runnerContainerIdHash ?? "") ||
      !tap ||
      entry.tapArtifact.sha256 !== tap.sha256 ||
      proof.sourceEvidence.tapSha256 !== tap.sha256
    ) fail("operational_negative_execution_invalid", "Exact-source case/TAP cross-link is invalid.");
    observed.add(key);
  }
  if (observed.size !== 12) {
    fail("operational_negative_execution_invalid", "Exact-source case set is incomplete.");
  }
  return Object.freeze({ exactProofs, taps });
}

export function createM1BOperationalNegativeRunDocuments({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  retainedPrimaryOrigin,
  outputRoot,
  startedAt,
  completedAt,
  restartArtifact,
  prerequisiteArtifacts,
  suite
}) {
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    typeof outputRoot !== "string" ||
    !isAbsolute(outputRoot) ||
    !suite ||
    !Array.isArray(suite.proofs) ||
    !Array.isArray(suite.tapArtifacts)
  ) fail(
    "operational_negative_run_invalid",
    "The exact-candidate negative-run context is invalid."
  );
  iso(databaseStartedAt, "operational_negative_run_invalid");
  iso(startedAt, "operational_negative_run_invalid");
  iso(completedAt, "operational_negative_run_invalid");
  iso(suite.manifest?.capturedAt, "operational_negative_run_invalid");
  let primaryOrigin;
  try {
    primaryOrigin = new URL(retainedPrimaryOrigin);
  } catch {
    fail("operational_negative_run_invalid", "Retained Primary origin is invalid.");
  }
  if (
    primaryOrigin.protocol !== "http:" ||
    primaryOrigin.hostname !== "127.0.0.1" ||
    primaryOrigin.pathname !== "/" ||
    primaryOrigin.search !== "" ||
    primaryOrigin.hash !== "" ||
    retainedPrimaryOrigin !== primaryOrigin.toString() ||
    Date.parse(startedAt) < Date.parse(databaseStartedAt) ||
    Date.parse(completedAt) <= Date.parse(startedAt) ||
    Date.parse(suite.manifest.capturedAt) < Date.parse(startedAt) ||
    Date.parse(suite.manifest.capturedAt) > Date.parse(completedAt)
  ) fail(
    "operational_negative_run_invalid",
    "Negative-run origin or producer-owned chronology is invalid."
  );
  const expectedPrerequisites = [
    ["operational_restart", "restart_log"],
    ["agent_after", "runtime_receipt"],
    ["agent_after_phase", "runtime_receipt"],
    ["human_critical", "postgres_receipt"],
    ["capital_partner_critical", "postgres_receipt"]
  ];
  if (
    !exactKeys(restartArtifact, ["id", "kind", "relativePath", "sha256"]) ||
    !Array.isArray(prerequisiteArtifacts) ||
    prerequisiteArtifacts.length !== 4
  ) fail(
    "operational_negative_run_prerequisite_invalid",
    "The sealed pre-Risk prerequisite references are incomplete."
  );
  const prerequisites = [restartArtifact, ...prerequisiteArtifacts];
  for (const [index, artifact] of prerequisites.entries()) {
    const [id, kind] = expectedPrerequisites[index];
    if (
      !exactKeys(artifact, ["id", "kind", "relativePath", "sha256"]) ||
      artifact.id !== id ||
      artifact.kind !== kind ||
      typeof artifact.relativePath !== "string" ||
      artifact.relativePath === "" ||
      isAbsolute(artifact.relativePath) ||
      artifact.relativePath.split(sep).includes("..") ||
      !SHA256.test(artifact.sha256 ?? "")
    ) fail(
      "operational_negative_run_prerequisite_invalid",
      "A sealed pre-Risk prerequisite reference is invalid."
    );
  }
  const negativeExecution = validateNegativeExecutionEvidence({
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    outputRoot,
    derivedNegativeProofs: suite.proofs,
    negativeExecutionManifest: suite.manifest,
    negativeTapArtifacts: suite.tapArtifacts
  });
  const definitions = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode }) => sourceMode !== "live_post_restart"
  );
  if (definitions.length !== 12) {
    fail("operational_negative_run_invalid", "The exact-source registry is not the closed twelve-case set.");
  }
  const documents = [];
  const cases = [];
  for (const definition of definitions) {
    const proof = negativeExecution.exactProofs.find(
      ({ group, id }) => group === definition.group && id === definition.id
    );
    const executionCase = suite.manifest.cases.find(
      ({ group, id }) => group === definition.group && id === definition.id
    );
    const tap = negativeExecution.taps.get(executionCase?.tapArtifact?.id);
    if (
      !proof ||
      !executionCase ||
      !tap ||
      proof.caseDefinitionHash !== definition.caseDefinitionHash ||
      Date.parse(proof.capturedAt ?? "") < Date.parse(startedAt) ||
      Date.parse(proof.capturedAt ?? "") > Date.parse(completedAt)
    ) fail(
      "operational_negative_run_invalid",
      "A compact exact-source proof is missing or outside the negative-run chronology."
    );
    const proofId = artifactId(
      "negative_source_proof",
      definition.group,
      definition.id
    );
    const proofRelativePath = relative(
      ROOT,
      resolve(
        outputRoot,
        `${candidateReleaseId}.negative-source-proof.${definition.group}.${definition.id}.json`
      )
    );
    const proofBytes = jsonBytes(proof);
    documents.push(Object.freeze({
      id: proofId,
      kind: "negative_source_proof",
      relativePath: proofRelativePath,
      document: proof,
      bytes: proofBytes
    }));
    documents.push(Object.freeze({
      id: tap.id,
      kind: tap.kind,
      relativePath: tap.relativePath,
      document: null,
      bytes: tap.bytes
    }));
    cases.push(Object.freeze({
      group: definition.group,
      id: definition.id,
      sourceMode: definition.sourceMode,
      caseDefinitionHash: definition.caseDefinitionHash,
      capturedAt: proof.capturedAt,
      proofArtifact: Object.freeze({
        id: proofId,
        kind: "negative_source_proof",
        relativePath: proofRelativePath,
        sha256: sha256(proofBytes)
      }),
      tapArtifact: Object.freeze({
        id: tap.id,
        kind: tap.kind,
        relativePath: tap.relativePath,
        sha256: tap.sha256
      })
    }));
  }
  const executionRelativePath = relative(
    ROOT,
    resolve(outputRoot, `${candidateReleaseId}.negative-exact-source-execution.json`)
  );
  const executionBytes = jsonBytes(suite.manifest);
  const executionArtifact = Object.freeze({
    id: "operational_negative_exact_source_execution",
    kind: "runtime_receipt",
    relativePath: executionRelativePath,
    sha256: sha256(executionBytes)
  });
  documents.push(Object.freeze({
    id: executionArtifact.id,
    kind: executionArtifact.kind,
    relativePath: executionArtifact.relativePath,
    document: suite.manifest,
    bytes: executionBytes
  }));
  const receipt = Object.freeze({
    schemaVersion: "m1_b_operational_exact_source_negative_run_receipt.v2",
    status: "exact_source_negative_run_passed",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    sourceRuntime: "local_exact_commit",
    databaseStartedAt,
    retainedPrimaryOrigin,
    startedAt,
    completedAt,
    producerOwnedClock: true,
    prerequisites: Object.freeze(prerequisites.map((artifact) => Object.freeze({
      id: artifact.id,
      kind: artifact.kind,
      relativePath: artifact.relativePath,
      sha256: artifact.sha256
    }))),
    exactSourceExecutionArtifact: executionArtifact,
    cases: Object.freeze(cases),
    exactSourceCaseCount: cases.length,
    boundArtifactCount: documents.length,
    sealedFileCount: documents.length + 1,
    fixtureUsed: false,
    productionFundsMoved: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    })
  });
  const receiptRelativePath = relative(
    ROOT,
    resolve(outputRoot, `${candidateReleaseId}.exact-source-negative-run.json`)
  );
  const receiptBytes = jsonBytes(receipt);
  documents.push(Object.freeze({
    id: "operational_negative_run",
    kind: "negative_receipt",
    relativePath: receiptRelativePath,
    document: receipt,
    bytes: receiptBytes
  }));
  if (
    documents.length !== 26 ||
    new Set(documents.map(({ id }) => id)).size !== 26 ||
    new Set(documents.map(({ relativePath }) => relativePath)).size !== 26
  ) fail(
    "operational_negative_run_invalid",
    "The negative run must seal exactly twelve proofs, twelve TAP logs, one manifest, and one receipt."
  );
  return Object.freeze({
    documents: Object.freeze(documents),
    receipt,
    receiptArtifact: Object.freeze({
      id: "operational_negative_run",
      kind: "negative_receipt",
      relativePath: receiptRelativePath,
      sha256: sha256(receiptBytes)
    })
  });
}

export async function createM1BOperationalEvidenceDocuments({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  portBase,
  outputRoot,
  observations,
  criticalArtifacts,
  criticalDocuments,
  supportingArtifacts,
  restart,
  restartArtifact,
  restartPendingArtifact,
  derivedNegativeProofs,
  negativeExecutionManifest,
  negativeTapArtifacts,
  negativeSourceArtifacts,
  liveNegativeArtifacts = [],
  operationalSupportingArtifacts = [],
  collectionStartedAt,
  browserRuntimeCollector = collectM1BBrowserRuntimeObservation,
  clock = () => new Date().toISOString()
}) {
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    !Number.isSafeInteger(portBase) || portBase < 1_024 || portBase > 65_532 ||
    !exactKeys(restartArtifact, ["id", "kind", "relativePath", "sha256"]) ||
    restartArtifact.id !== "operational_restart" ||
    restartArtifact.kind !== "restart_log" ||
    typeof restartArtifact.relativePath !== "string" ||
    isAbsolute(restartArtifact.relativePath) ||
    restartArtifact.relativePath.split(sep).includes("..") ||
    !SHA256.test(restartArtifact.sha256) ||
    !exactKeys(restartPendingArtifact, ["id", "kind", "relativePath", "sha256"]) ||
    restartPendingArtifact.id !== "operational_restart_pending" ||
    restartPendingArtifact.kind !== "restart_log" ||
    typeof restartPendingArtifact.relativePath !== "string" ||
    isAbsolute(restartPendingArtifact.relativePath) ||
    restartPendingArtifact.relativePath.split(sep).includes("..") ||
    !SHA256.test(restartPendingArtifact.sha256)
  ) fail("operational_context_invalid", "Operational candidate, image, port, or critical artifacts are invalid.");
  iso(databaseStartedAt);
  iso(collectionStartedAt, "operational_pre_risk_chronology_invalid");
  exactObservationSets(observations, {
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt
  });
  validateCriticalArtifacts(criticalArtifacts, { riskRequired: false });
  validateRestartContext(restart);
  if (restart.afterDatabaseStartedAt !== databaseStartedAt) {
    fail("operational_restart_invalid", "Restart and exact runtime PostgreSQL starts do not match.");
  }
  assertCompleteM1BDerivedNegativeProofs(derivedNegativeProofs);
  assertCompleteM1BOperationalNegativeProofSet(derivedNegativeProofs);
  const negativeExecution = validateNegativeExecutionEvidence({
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    outputRoot,
    derivedNegativeProofs,
    negativeExecutionManifest,
    negativeTapArtifacts
  });
  const documents = [];
  const artifacts = [];
  const releaseIdentityArtifact = criticalArtifacts.find(
    ({ id }) => id === "release_identity"
  );
  const addDocument = (id, kind, relativePath, document) => {
    const bytes = jsonBytes(document);
    if (
      artifacts.some((entry) => entry.id === id) ||
      artifacts.some((entry) => entry.relativePath === relativePath)
    ) fail(
      "operational_artifact_binding_invalid",
      "An operational document ID or path is duplicated."
    );
    documents.push({ id, kind, relativePath, document, bytes });
    artifacts.push({ id, kind, relativePath, sha256: sha256(bytes) });
    return artifacts.at(-1);
  };

  for (const reference of [
    restartPendingArtifact,
    restartArtifact,
    ...criticalArtifacts,
    ...supportingArtifacts
  ]) {
    if (
      !exactKeys(reference, ["id", "kind", "relativePath", "sha256"]) ||
      artifacts.some(({ id }) => id === reference.id) ||
      artifacts.some(({ relativePath }) => relativePath === reference.relativePath)
    ) fail(
      "operational_artifact_binding_invalid",
      "A critical, supporting, or restart artifact is invalid or duplicated."
    );
    artifacts.push(Object.freeze({ ...reference }));
  }

  if (
    !Array.isArray(negativeSourceArtifacts) ||
    negativeSourceArtifacts.length !== 26 ||
    new Set(negativeSourceArtifacts.map(({ id }) => id)).size !== 26
  ) fail(
    "operational_negative_execution_invalid",
    "The sealed negative-run receipt, source proofs, TAP logs, and execution manifest are required."
  );
  for (const reference of negativeSourceArtifacts) {
    if (
      !exactKeys(reference, ["id", "kind", "relativePath", "sha256"]) ||
      !new Set([
        "negative_source_proof",
        "tap_log",
        "runtime_receipt",
        "negative_receipt"
      ]).has(reference.kind) ||
      !SHA256.test(reference.sha256 ?? "") ||
      artifacts.some(({ id }) => id === reference.id) ||
      artifacts.some(({ relativePath }) => relativePath === reference.relativePath)
    ) fail(
      "operational_negative_execution_invalid",
      "A sealed negative-run artifact reference is invalid."
    );
    artifacts.push(Object.freeze({ ...reference }));
  }
  for (const reference of liveNegativeArtifacts) {
    if (
      !exactKeys(reference, ["id", "kind", "relativePath", "sha256"]) ||
      !new Set(["negative_source_proof", "negative_receipt"]).has(reference.kind) ||
      !SHA256.test(reference.sha256 ?? "") ||
      artifacts.some(({ id }) => id === reference.id) ||
      artifacts.some(({ relativePath }) => relativePath === reference.relativePath)
    ) fail(
      "operational_negative_proof_invalid",
      "A sealed live-negative attempt or source-proof reference is invalid."
    );
    artifacts.push(Object.freeze({ ...reference }));
  }
  if (
    !Array.isArray(operationalSupportingArtifacts) ||
    operationalSupportingArtifacts.length !== 1 ||
    operationalSupportingArtifacts[0]?.id !== "expired_offer_setup" ||
    operationalSupportingArtifacts[0]?.kind !== "postgres_receipt"
  ) fail(
    "operational_live_negative_artifact_missing",
    "The exact expired-Offer setup receipt is required as one operational supporting artifact."
  );
  for (const reference of operationalSupportingArtifacts) {
    if (
      !exactKeys(reference, ["id", "kind", "relativePath", "sha256"]) ||
      !SHA256.test(reference.sha256 ?? "") ||
      artifacts.some(({ id }) => id === reference.id) ||
      artifacts.some(({ relativePath }) => relativePath === reference.relativePath)
    ) fail(
      "operational_live_negative_artifact_missing",
      "The expired-Offer setup artifact reference is invalid or duplicated."
    );
    artifacts.push(Object.freeze({ ...reference }));
  }
  const negativeExecutionArtifact = negativeSourceArtifacts.find(
    ({ id }) => id === "operational_negative_exact_source_execution"
  );
  if (
    negativeExecutionArtifact?.kind !== "runtime_receipt" ||
    negativeExecutionArtifact.sha256 !== sha256(jsonBytes(negativeExecutionManifest)) ||
    negativeTapArtifacts.some((tap) => {
      const reference = negativeSourceArtifacts.find(({ id }) => id === tap.id);
      return reference?.kind !== "tap_log" || reference.sha256 !== tap.sha256;
    })
  ) fail(
    "operational_negative_execution_invalid",
    "The sealed negative-run files do not match the parsed execution/TAP Evidence."
  );
  const negativeCaseReceiptEntries = [];
  for (const [group, ids] of Object.entries(M1_B_OPERATIONAL_NEGATIVE_CASES)) {
    for (const id of ids) {
      const proof = await validateM1BOperationalNegativeProof(
        derivedNegativeProofs.find(
          (entry) => entry.group === group && entry.id === id
        ),
        {
          candidateReleaseId,
          sourceTreeHash,
          runtimeImageId,
          databaseStartedAt,
          availableArtifacts: artifacts
        }
      );
      const exactExecutionCase = negativeExecutionManifest.cases.find(
        (entry) => entry.group === group && entry.id === id
      ) ?? null;
      const exactTap = exactExecutionCase === null
        ? null
        : negativeExecution.taps.get(exactExecutionCase.tapArtifact.id);
      const criticalDerivedLive =
        proof.sourceMode === "live_post_restart" && group === "human" &&
        id === "replaced_stale_offer";
      const sourceProofArtifact = criticalDerivedLive
        ? criticalReference(criticalArtifacts, "capital_partner_critical")
        : proof.sourceMode === "live_post_restart"
          ? liveNegativeArtifacts.find(
            ({ id: artifact }) => artifact === artifactId(
              "negative_live_source_proof",
              group,
              id
            )
          )
          : negativeSourceArtifacts.find(
            ({ id: artifact }) => artifact === artifactId(
              "negative_source_proof",
              group,
              id
            )
          );
      const liveAttemptArtifact =
        proof.sourceMode === "live_post_restart" && !criticalDerivedLive
          ? liveNegativeArtifacts.find(
            ({ id: artifact }) => artifact === artifactId(
              "negative_live_attempt",
              group,
              id
            )
          )
          : null;
      if (
        !sourceProofArtifact ||
        (proof.sourceMode === "live_post_restart" &&
          !criticalDerivedLive && !liveAttemptArtifact)
      ) fail(
        "operational_negative_proof_invalid",
        "A negative case is missing its sealed source proof or live attempt receipt."
      );
      const receipt = createM1BOperationalNegativeCaseReceipt({
        candidateReleaseId,
        sourceTreeHash,
        runtimeImageId,
        databaseStartedAt,
        proof,
        sourceProofArtifact,
        liveAttemptArtifact,
        exactSourceExecutionArtifact: exactExecutionCase === null
          ? null
          : negativeExecutionArtifact,
        tapArtifact: exactTap
      });
      const artifact = addDocument(
        artifactId("negative", group, id),
        "negative_receipt",
        relative(
          ROOT,
          resolve(outputRoot, `${candidateReleaseId}.negative.${group}.${id}.json`)
        ),
        receipt
      );
      negativeCaseReceiptEntries.push(Object.freeze({ receipt, artifact }));
    }
  }
  const criticalEvidenceCompletedAt = Math.max(
    Date.parse(criticalDocuments.human_critical?.capturedAt ?? ""),
    Date.parse(criticalDocuments.capital_partner_critical?.capturedAt ?? ""),
    Date.parse(criticalDocuments.agent_after?.recoveryReceipt?.capturedAt ??
      criticalDocuments.agent_after?.capturedAt ?? databaseStartedAt)
  );
  const negativeEvidenceCompletedAt = Math.max(
    Date.parse(negativeExecutionManifest.capturedAt ?? ""),
    ...derivedNegativeProofs.map(({ capturedAt }) => Date.parse(capturedAt ?? ""))
  );
  if (
    !Number.isFinite(criticalEvidenceCompletedAt) ||
    !Number.isFinite(negativeEvidenceCompletedAt) ||
    criticalEvidenceCompletedAt >= Date.parse(collectionStartedAt) ||
    negativeEvidenceCompletedAt >= Date.parse(collectionStartedAt)
  ) fail(
    "operational_pre_risk_chronology_invalid",
    "Critical and negative proof collection must complete before browser/journey reconciliation starts."
  );

  const visualPaths = new Set();
  const visualDigests = new Set();
  const readinessRequestIds = new Set();
  const browserAuditRecords = new Map();
  for (const row of observations.browserRows) {
    if (row.origin !== expectedLocalOrigin(row.role, portBase)) {
      fail("operational_browser_observation_invalid", `${row.role}:${row.check} has the wrong origin.`);
    }
    if (Date.parse(row.capturedAt) < Date.parse(collectionStartedAt)) {
      fail("operational_browser_observation_invalid", `${row.role}:${row.check} predates pre-Risk collection.`);
    }
    const critical = criticalForRole(criticalArtifacts, row.role);
    const runtimeId = artifactId("browser", row.role, `${row.check}_runtime`);
    const auditId = artifactId("browser", row.role, `${row.check}_audit`);
    const visuals = [];
    for (const [index, declared] of row.visualArtifacts.entries()) {
      const phaseEvidence = row.phaseEvidence[index];
      if (
        declared.phase !== phaseEvidence?.prompt?.phase ||
        declared.relativePath !== phaseEvidence.prompt.capture.relativePath ||
        declared.challengeHash !== phaseEvidence.prompt.capture.challengeHash
      ) fail(
        "operational_visual_artifact_invalid",
        `${row.role}:${row.check} visual does not bind its measured phase.`
      );
      const visualSource = await containedArtifact(
        declared.relativePath,
        outputRoot
      );
      if (
        visualPaths.has(visualSource.relativePath) ||
        visualDigests.has(visualSource.sha256)
      ) fail(
        "operational_visual_artifact_reused",
        `${row.role}:${row.check}:${declared.phase} reuses visual proof.`
      );
      const png = validateM1BOperationalBrowserPng(
        visualSource.bytes,
        phaseEvidence.response.measurement.viewport
      );
      visualPaths.add(visualSource.relativePath);
      visualDigests.add(visualSource.sha256);
      const visualId = artifactId(
        "browser",
        row.role,
        `${row.check}_${browserPhaseArtifactToken(declared.phase)}_shot`
      );
      const visualPath = relative(
        ROOT,
        resolve(
          outputRoot,
          `${candidateReleaseId}.browser.${row.role}.${row.check}.${declared.phase}.png`
        )
      );
      const visual = Object.freeze({
        phase: declared.phase,
        id: visualId,
        kind: "screenshot",
        relativePath: visualPath,
        sha256: visualSource.sha256,
        challengeHash: declared.challengeHash,
        png: Object.freeze({
          width: png.width,
          height: png.height,
          idatCount: png.idatCount
        })
      });
      documents.push(Object.freeze({
        id: visual.id,
        kind: visual.kind,
        relativePath: visual.relativePath,
        document: null,
        bytes: visualSource.bytes
      }));
      artifacts.push(Object.freeze({
        id: visual.id,
        kind: visual.kind,
        relativePath: visual.relativePath,
        sha256: visual.sha256
      }));
      visuals.push(visual);
    }
    const negativeCaseEntry = row.negativeCase === null
      ? null
      : negativeCaseReceiptEntries.find(({ receipt }) =>
        receipt.group === row.negativeCase.group &&
        receipt.id === row.negativeCase.id
      );
    if (row.negativeCase !== null && !negativeCaseEntry) fail(
      "operational_browser_measurement_invalid",
      `${row.role}:${row.check} has no exact negative receipt.`
    );
    const negativeCaseArtifact = negativeCaseEntry === null
      ? null
      : Object.freeze({
          id: negativeCaseEntry.artifact.id,
          kind: negativeCaseEntry.artifact.kind,
          sha256: negativeCaseEntry.artifact.sha256,
          caseDefinitionHash: negativeCaseEntry.receipt.caseDefinitionHash
        });
    const readinessObservation = validateM1BOperationalBrowserRuntimeObservation(
      await browserRuntimeCollector({
        candidateReleaseId,
        role: row.role,
        check: row.check,
        origin: row.origin,
        databaseStartedAt,
        runtimeImageId
      }),
      {
        candidateReleaseId,
        role: row.role,
        check: row.check,
        origin: row.origin,
        databaseStartedAt,
        runtimeImageId
      }
    );
    if (readinessRequestIds.has(readinessObservation.request.requestId)) {
      fail(
        "operational_browser_runtime_invalid",
        `${row.role}:${row.check} reuses a readiness request ID.`
      );
    }
    if (
      Date.parse(readinessObservation.request.requestedAt) <
        Date.parse(row.capturedAt)
    ) fail(
      "operational_browser_runtime_invalid",
      `${row.role}:${row.check} runtime reconciliation predates its browser observation.`
    );
    readinessRequestIds.add(readinessObservation.request.requestId);
    const browserDocuments = createM1BOperationalBrowserRowDocuments({
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      row,
      releaseIdentityArtifact,
      criticalArtifact: critical,
      restartArtifact: row.check === "restart_recovery"
        ? restartArtifact
        : null,
      negativeCaseArtifact,
      visualArtifacts: visuals,
      readinessObservation,
      outputRootRelativePath: relative(ROOT, outputRoot)
    });
    const runtimeArtifact = addDocument(
      runtimeId,
      "runtime_receipt",
      browserDocuments.runtimeArtifact.relativePath,
      browserDocuments.runtimeDocument
    );
    const auditArtifact = addDocument(
      auditId,
      "browser_audit",
      browserDocuments.auditArtifact.relativePath,
      browserDocuments.auditDocument
    );
    if (
      runtimeArtifact.sha256 !== browserDocuments.runtimeArtifact.sha256 ||
      auditArtifact.sha256 !== browserDocuments.auditArtifact.sha256
    ) fail(
      "operational_browser_document_invalid",
      "Browser document bytes drifted after pure reconstruction."
    );
    browserAuditRecords.set(
      `${row.role}:${row.check}`,
      Object.freeze({
        artifact: auditArtifact,
        document: browserDocuments.auditDocument
      })
    );
  }

  const journeyReconciledAt = clock();
  iso(journeyReconciledAt, "operational_journey_binding_invalid");
  const journeyReceipts = createM1BOperationalJourneyReceipts({
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    criticalDocuments,
    criticalArtifacts,
    supportingArtifacts,
    browserAuditRecords: [...browserAuditRecords.values()],
    restart,
    restartArtifact,
    releaseIdentityArtifact,
    reconciledAt: journeyReconciledAt
  });
  for (const role of M1_B_OPERATIONAL_ROLES) {
    addDocument(
      artifactId("journey", role, "receipt"),
      "runtime_receipt",
      relative(ROOT, resolve(outputRoot, `${candidateReleaseId}.journey.${role}.json`)),
      journeyReceipts[role]
    );
  }

  addDocument(
    "operational_negative_cases",
    "negative_receipt",
    relative(ROOT, resolve(outputRoot, `${candidateReleaseId}.negative-cases.json`)),
    createM1BOperationalNegativeCaseManifest({
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      releaseIdentityArtifact: {
        id: releaseIdentityArtifact.id,
        sha256: releaseIdentityArtifact.sha256
      },
      exactSourceExecutionArtifact: {
        id: negativeExecutionArtifact.id,
        sha256: negativeExecutionArtifact.sha256
      },
      caseReceipts: negativeCaseReceiptEntries
    })
  );
  const completedAt = clock();
  iso(completedAt, "operational_pre_risk_chronology_invalid");
  const observedTimes = [
    ...observations.browserRows.map(({ capturedAt }) => Date.parse(capturedAt)),
    Date.parse(journeyReconciledAt),
    ...documents
      .filter(({ document }) => document?.schemaVersion ===
        "m1_b_browser_row_runtime_receipt.v2")
      .flatMap(({ document }) => [
        Date.parse(document.readinessObservation.request.requestedAt),
        Date.parse(document.readinessObservation.response.respondedAt)
      ])
  ];
  if (
    Date.parse(completedAt) <= Date.parse(collectionStartedAt) ||
    observedTimes.some((value) => !Number.isFinite(value)) ||
    Math.max(...observedTimes) > Date.parse(completedAt)
  ) fail(
    "operational_pre_risk_chronology_invalid",
    "Pre-Risk browser and journey Evidence falls outside the producer-owned collection window."
  );
  const restartLinkageArtifact = addDocument(
    "operational_restart_linkage",
    "restart_log",
    relative(
      ROOT,
      resolve(outputRoot, `${candidateReleaseId}.operational-restart-linkage.v2.json`)
    ),
    createM1BOperationalRestartLinkageDocument({
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      restart,
      restartPendingArtifact,
      restartArtifact,
      supportingArtifacts
    })
  );
  const boundArtifacts = Object.freeze(artifacts.map((entry) => Object.freeze({
    id: entry.id,
    kind: entry.kind,
    relativePath: entry.relativePath,
    sha256: entry.sha256
  })));
  const preRiskReceiptArtifact = addDocument(
    "operational_pre_risk_collection",
    "runtime_receipt",
    relative(
      ROOT,
      resolve(outputRoot, `${candidateReleaseId}.operational-pre-risk-collection.v2.json`)
    ),
    createM1BOperationalPreRiskCollectionReceipt({
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      startedAt: collectionStartedAt,
      completedAt,
      restartLinkageArtifact,
      browserRowCount: observations.browserRows.length,
      journeyStepCount: derivedJourneyStepCount,
      negativeCaseCount: negativeCases.length,
      boundArtifacts
    })
  );
  return Object.freeze({
    documents,
    artifacts,
    completedAt,
    restartLinkageArtifact,
    preRiskReceiptArtifact,
    negativeCases
  });
}

export async function writeM1BOperationalDocumentsAtomic(documents) {
  const temporaries = [];
  const linked = [];
  try {
    for (const entry of documents) {
      if (
        !exactKeys(entry, ["id", "kind", "relativePath", "document", "bytes"]) ||
        typeof entry.relativePath !== "string" ||
        isAbsolute(entry.relativePath) ||
        entry.relativePath.split(sep).includes("..") ||
        !(
          typeof entry.bytes === "string" &&
          entry.document !== null &&
          entry.bytes === jsonBytes(entry.document)
        ) && !(
          Buffer.isBuffer(entry.bytes) &&
          entry.document === null &&
          new Set(["tap_log", "screenshot"]).has(entry.kind) &&
          entry.bytes.length >= 1 &&
          entry.bytes.length <= (entry.kind === "tap_log"
            ? 4 * 1024 * 1024
            : 64 * 1024 * 1024)
        )
      ) fail("operational_output_invalid", "Operational artifact output is invalid.");
      const target = resolve(ROOT, entry.relativePath);
      const [allowedReal, parentReal] = await Promise.all([
        realpath(resolve(ROOT, "output/playwright")),
        realpath(dirname(target))
      ]);
      const relation = relative(allowedReal, parentReal);
      if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) {
        fail("operational_output_invalid", "Operational artifact output resolves outside its private candidate directory.");
      }
      try {
        await lstat(target);
        const error = new Error("operational artifact exists");
        error.code = "EEXIST";
        throw error;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      const temporary = `${target}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
      await writeFile(temporary, entry.bytes, { flag: "wx", mode: 0o600 });
      await chmod(temporary, 0o600);
      temporaries.push([temporary, target]);
    }
    for (const [temporary, target] of temporaries) {
      await link(temporary, target);
      linked.push(target);
    }
  } catch (error) {
    await Promise.all(linked.map((path) => unlink(path).catch(() => {})));
    throw error;
  } finally {
    await Promise.all(temporaries.map(([path]) => unlink(path).catch(() => {})));
  }
  return true;
}

function run(command, args, description, maxBuffer = 64 * 1024 * 1024) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer
  });
  if (result.error || result.status !== 0) {
    fail("operational_runtime_query_failed", `${description}: ${result.stderr?.trim() ?? "failed"}`);
  }
  return result.stdout.trim();
}

function baseLimaArguments(releaseIdentity, localReviewPorts, releaseBuildContext) {
  return [
    "shell",
    "--workdir",
    ROOT,
    INSTANCE,
    "env",
    `IPO_ONE_M1_B_RELEASE_SHA=${releaseIdentity.revision}`,
    `IPO_ONE_M1_B_PORT_BASE=${localReviewPorts.basePort}`,
    `IPO_ONE_M1_B_BUILD_CONTEXT=${releaseBuildContext}`,
    "docker",
    "compose",
    "--project-name",
    INSTANCE,
    "--env-file",
    ENV_FILE,
    "--file",
    COMPOSE_FILE
  ];
}

function compose(baseArgs, args, description) {
  return run("limactl", [...baseArgs, ...args], description);
}

function docker(args, description) {
  return run(
    "limactl",
    ["shell", "--workdir", ROOT, INSTANCE, "docker", ...args],
    description
  );
}

export function createM1BOperationalLiveNegativeRunnerArguments({
  runtimeImageId,
  databaseUrl,
  databaseSecretFile = DATABASE_SECRET_FILE,
  context
}) {
  if (
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    databaseSecretFile !== DATABASE_SECRET_FILE ||
    !context ||
    typeof context !== "object"
  ) fail(
    "operational_live_negative_runner_invalid",
    "The exact-image live-negative runner context is invalid."
  );
  let endpoint;
  try {
    endpoint = new URL(databaseUrl);
  } catch {
    fail(
      "operational_live_negative_runner_invalid",
      "The live-negative database endpoint is invalid."
    );
  }
  if (
    !new Set(["postgres:", "postgresql:"]).has(endpoint.protocol) ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.hostname === "" ||
    endpoint.pathname.length <= 1
  ) fail(
    "operational_live_negative_runner_invalid",
    "The live-negative database endpoint must be credential-free."
  );
  const encodedContext = Buffer.from(JSON.stringify(context)).toString("base64url");
  if (encodedContext.length > Math.ceil(128 * 1024 * 4 / 3)) {
    fail(
      "operational_live_negative_runner_invalid",
      "The live-negative context exceeds the closed bound."
    );
  }
  return Object.freeze([
    "shell",
    "--workdir",
    ROOT,
    INSTANCE,
    "docker",
    "run",
    "--rm",
    "-i",
    "--network",
    "host",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=16m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--mount",
    `type=bind,src=${databaseSecretFile},dst=/run/secrets/private-pilot-db-secret,readonly`,
    "--env",
    `DATABASE_URL=${endpoint.toString()}`,
    "--entrypoint",
    "/nodejs/bin/node",
    runtimeImageId,
    LIVE_NEGATIVE_CLI,
    "--context",
    encodedContext
  ]);
}

export function createM1BExpiredOfferSetupRunnerArguments({
  runtimeImageId,
  databaseUrl,
  databaseSecretFile = DATABASE_SECRET_FILE,
  context
}) {
  if (
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    databaseSecretFile !== DATABASE_SECRET_FILE ||
    !context || typeof context !== "object"
  ) fail(
    "operational_expired_offer_runner_invalid",
    "The exact-image expired-Offer runner context is invalid."
  );
  let endpoint;
  try {
    endpoint = new URL(databaseUrl);
  } catch {
    fail(
      "operational_expired_offer_runner_invalid",
      "The expired-Offer database endpoint is invalid."
    );
  }
  if (
    !new Set(["postgres:", "postgresql:"]).has(endpoint.protocol) ||
    endpoint.username !== "" || endpoint.password !== "" ||
    endpoint.hostname === "" || endpoint.pathname.length <= 1
  ) fail(
    "operational_expired_offer_runner_invalid",
    "The expired-Offer database endpoint must be credential-free."
  );
  const encodedContext = Buffer.from(JSON.stringify(context)).toString("base64url");
  readM1BExpiredOfferSetupCliContext(encodedContext);
  return Object.freeze([
    "shell",
    "--workdir",
    ROOT,
    INSTANCE,
    "docker",
    "run",
    "--rm",
    "-i",
    "--network",
    "host",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=16m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--mount",
    `type=bind,src=${databaseSecretFile},dst=/run/secrets/private-pilot-db-secret,readonly`,
    "--env",
    `DATABASE_URL=${endpoint.toString()}`,
    "--env",
    "IPO_ONE_PILOT_DB_SECRET_FILE=/run/secrets/private-pilot-db-secret",
    "--entrypoint",
    "/nodejs/bin/node",
    runtimeImageId,
    EXPIRED_OFFER_SETUP_CLI,
    "--context",
    encodedContext
  ]);
}

export function collectM1BExpiredOfferSetupOutput(
  child,
  { maximumBytes = MAX_NDJSON_BYTES } = {}
) {
  if (
    !child?.stdout || typeof child.stdout.on !== "function" ||
    typeof child.once !== "function" || typeof child.kill !== "function" ||
    !Number.isSafeInteger(maximumBytes) || maximumBytes < 1
  ) fail(
    "operational_expired_offer_runner_invalid",
    "The expired-Offer child process collector is invalid."
  );
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    };
    child.stdout.on("data", (chunk) => {
      total += chunk.length;
      if (total > maximumBytes) {
        child.kill("SIGKILL");
        rejectOnce(new M1BOperationalEvidenceError(
          "operational_expired_offer_output_oversized",
          "The exact-image expired-Offer result exceeds its closed bound."
        ));
        return;
      }
      chunks.push(chunk);
    });
    child.once("error", (error) => rejectOnce(error));
    child.once("close", (code, signal) => {
      if (settled) return;
      if (code !== 0 || signal !== null) {
        rejectOnce(new M1BOperationalEvidenceError(
          "operational_expired_offer_runner_failed",
          "The exact-image expired-Offer producer failed closed."
        ));
        return;
      }
      let value;
      try {
        value = JSON.parse(Buffer.concat(chunks));
      } catch {
        rejectOnce(new M1BOperationalEvidenceError(
          "operational_expired_offer_output_invalid",
          "The exact-image expired-Offer producer returned invalid JSON."
        ));
        return;
      }
      settled = true;
      resolvePromise(value);
    });
  });
}

async function runInteractiveExpiredOfferSetup(arguments_) {
  const child = spawn("limactl", arguments_, {
    cwd: ROOT,
    stdio: ["inherit", "pipe", "inherit"]
  });
  return collectM1BExpiredOfferSetupOutput(child);
}

async function runInteractiveLiveNegative(arguments_) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("limactl", arguments_, {
      cwd: ROOT,
      stdio: ["inherit", "pipe", "inherit"]
    });
    const chunks = [];
    let total = 0;
    child.stdout.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_NDJSON_BYTES) {
        child.kill("SIGKILL");
        rejectPromise(new M1BOperationalEvidenceError(
          "operational_live_negative_output_oversized",
          "The exact-image live-negative result exceeds 4 MiB."
        ));
        return;
      }
      chunks.push(chunk);
    });
    child.once("error", (error) => rejectPromise(error));
    child.once("close", (code, signal) => {
      if (code !== 0 || signal !== null) {
        rejectPromise(new M1BOperationalEvidenceError(
          "operational_live_negative_runner_failed",
          "The exact-image live-negative producer failed closed."
        ));
        return;
      }
      let value;
      try {
        value = JSON.parse(Buffer.concat(chunks));
      } catch {
        rejectPromise(new M1BOperationalEvidenceError(
          "operational_live_negative_output_invalid",
          "The exact-image live-negative producer returned invalid JSON."
        ));
        return;
      }
      resolvePromise(value);
    });
  });
}

export function canonicalizeM1BServiceMountSummary(value) {
  if (typeof value !== "string") {
    fail("operational_runtime_identity_invalid", "Service mount summary is invalid.");
  }
  const mounts = value.split(";").filter(Boolean).map((entry) => {
    const fields = entry.split("|");
    if (
      fields.length !== 4 ||
      !IDENTIFIER.test(fields[0] ?? "") ||
      fields[1] !== "" && !IDENTIFIER.test(fields[1]) ||
      !/^\/[A-Za-z0-9._/@%:+-]+(?:\/[A-Za-z0-9._/@%:+-]+)*$/.test(fields[2] ?? "") ||
      !new Set(["true", "false"]).has(fields[3])
    ) fail(
      "operational_runtime_identity_invalid",
      "Service mount summary is invalid."
    );
    return Object.freeze({
      type: fields[0],
      name: fields[1],
      destination: fields[2],
      readWrite: fields[3] === "true"
    });
  });
  return Object.freeze(mounts.sort((left, right) => {
    const leftKey = canonicalJson(left);
    const rightKey = canonicalJson(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  }));
}

function serviceIdentity(baseArgs, service) {
  const containerId = compose(baseArgs, ["ps", "--quiet", service], `${service} container unavailable`);
  if (!/^[0-9a-f]{12,64}$/.test(containerId)) {
    fail("operational_runtime_identity_invalid", `${service} container ID is invalid.`);
  }
  const imageId = docker(["inspect", containerId, "--format", "{{.Image}}"], `${service} image unavailable`);
  const startedAt = docker(
    ["inspect", containerId, "--format", "{{.State.StartedAt}}"],
    `${service} start time unavailable`
  );
  const safeConfigurationText = docker(
    [
      "inspect",
      containerId,
      "--format",
      "{\"readOnlyRootfs\":{{json .HostConfig.ReadonlyRootfs}},\"networkMode\":{{json .HostConfig.NetworkMode}},\"capDrop\":{{json .HostConfig.CapDrop}},\"securityOpt\":{{json .HostConfig.SecurityOpt}},\"restartPolicy\":{{json .HostConfig.RestartPolicy.Name}},\"entrypoint\":{{json .Config.Entrypoint}},\"cmd\":{{json .Config.Cmd}}}"
    ],
    `${service} safe runtime configuration unavailable`
  );
  let safeConfiguration;
  try {
    safeConfiguration = JSON.parse(safeConfigurationText);
  } catch {
    fail("operational_runtime_identity_invalid", `${service} safe runtime configuration is invalid.`);
  }
  let composeLabels;
  let portBindings;
  try {
    composeLabels = JSON.parse(docker(
      [
        "inspect",
        containerId,
        "--format",
        "{\"project\":{{json (index .Config.Labels \"com.docker.compose.project\")}},\"service\":{{json (index .Config.Labels \"com.docker.compose.service\")}},\"configHash\":{{json (index .Config.Labels \"com.docker.compose.config-hash\")}},\"imageRevision\":{{json (index .Config.Labels \"org.opencontainers.image.revision\")}}}"
      ],
      `${service} Compose identity unavailable`
    ));
    portBindings = JSON.parse(docker(
      ["inspect", containerId, "--format", "{{json .HostConfig.PortBindings}}"],
      `${service} port binding summary unavailable`
    ) || "null");
  } catch {
    fail("operational_runtime_identity_invalid", `${service} Compose or port binding summary is invalid.`);
  }
  if (
    composeLabels.project !== INSTANCE ||
    composeLabels.service !== service ||
    typeof composeLabels.configHash !== "string" ||
    composeLabels.configHash === ""
  ) fail("operational_runtime_identity_invalid", `${service} does not bind the reviewed Compose project/configuration.`);
  const mountSummary = canonicalizeM1BServiceMountSummary(docker(
    [
      "inspect",
      containerId,
      "--format",
      "{{range .Mounts}}{{printf \"%s|%s|%s|%t;\" .Type .Name .Destination .RW}}{{end}}"
    ],
    `${service} mount summary unavailable`
  ));
  return Object.freeze({
    containerId,
    imageId,
    startedAt: new Date(startedAt).toISOString(),
    configHash: manifestHash({
      runtime: safeConfiguration,
      composeLabels,
      mountSummary,
      portBindings
    })
  });
}

export function createM1BOperationalRuntimeReaderArguments({
  runtimeImageId,
  candidateReleaseId,
  databaseUrl,
  databaseSecretFile = DATABASE_SECRET_FILE,
  browserReadContext = null
}) {
  if (
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    !SHA.test(candidateReleaseId ?? "") ||
    typeof databaseUrl !== "string"
  ) fail("operational_runtime_query_failed", "Runtime reader arguments are invalid.");
  let endpoint;
  try {
    endpoint = new URL(databaseUrl);
  } catch {
    fail("operational_runtime_query_failed", "Runtime reader database URL is invalid.");
  }
  if (
    !new Set(["postgres:", "postgresql:"]).has(endpoint.protocol) ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.hostname === "" ||
    endpoint.pathname.length <= 1 ||
    databaseSecretFile !== DATABASE_SECRET_FILE
  ) fail("operational_runtime_query_failed", "Runtime reader database endpoint is not credential-free or the secret source is not exact.");
  const context = browserReadContext === null
    ? null
    : parseM1BOperationalBrowserReadContext(browserReadContext);
  if (
    context !== null &&
    (context.candidateReleaseId !== candidateReleaseId ||
      context.runtimeImageId !== runtimeImageId)
  ) fail(
    "operational_runtime_query_failed",
    "Browser app-role read context does not match the exact runtime."
  );
  return Object.freeze([
    "run",
    "--rm",
    "--network",
    "host",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=16m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--label",
    `com.docker.compose.project=${RUNTIME_READER_COMPOSE_PROJECT}`,
    "--label",
    `com.docker.compose.service=${RUNTIME_READER_COMPOSE_SERVICE}`,
    "--label",
    `ipo.one.candidate=${candidateReleaseId}`,
    "--label",
    "ipo.one.evidence=m1-b-operational-runtime-read",
    "--mount",
    `type=bind,src=${databaseSecretFile},dst=/run/secrets/private-pilot-db-secret,readonly`,
    "--env",
    `DATABASE_URL=${endpoint.toString()}`,
    "--env",
    `IPO_ONE_M1_B_RELEASE_SHA=${candidateReleaseId}`,
    ...(context === null ? [] : [
      "--env",
      `IPO_ONE_M1_B_RUNTIME_IMAGE_ID=${runtimeImageId}`,
      "--env",
      `IPO_ONE_M1_B_EXPECTED_DATABASE_STARTED_AT=${context.expectedDatabaseStartedAt}`
    ]),
    "--env",
    "IPO_ONE_PILOT_DB_SECRET_FILE=/run/secrets/private-pilot-db-secret",
    "--entrypoint",
    "/nodejs/bin/node",
    runtimeImageId,
    RUNTIME_READER,
    ...(context === null ? [] : [
      "--browser-read-context-json",
      JSON.stringify(context)
    ])
  ]);
}

async function runtimeDatabaseRead(runtimeImageId, candidateReleaseId, localStack) {
  const [directory, secret] = await Promise.all([
    lstat(SECRET_DIRECTORY),
    lstat(DATABASE_SECRET_FILE)
  ]);
  if (
    !directory.isDirectory() || directory.isSymbolicLink() ||
    (directory.mode & 0o777) !== 0o700 ||
    !secret.isFile() || secret.isSymbolicLink() ||
    (secret.mode & 0o777) !== 0o644
  ) fail("operational_database_secret_invalid", "Existing database role secret mount is unsafe.");
  const databaseUrl =
    `postgresql://${localStack.database.guestAddress}:` +
    `${localStack.database.guestPort}/${localStack.database.database}`;
  const output = docker(
    createM1BOperationalRuntimeReaderArguments({
      runtimeImageId,
      candidateReleaseId,
      databaseUrl
    }),
    "least-authority PostgreSQL runtime read failed"
  );
  let value;
  try {
    value = JSON.parse(output);
  } catch {
    fail("operational_runtime_query_failed", "PostgreSQL runtime read returned invalid JSON.");
  }
  if (
    value.schemaVersion !== "m1_b_operational_runtime_read.v1" ||
    value.candidateReleaseId !== candidateReleaseId ||
    value.databaseRole !== "ipo_one_private_pilot_app" ||
    value.readOnlyEvidenceRole !== true ||
    value.credentialsIncluded !== false
  ) fail("operational_runtime_query_failed", "PostgreSQL runtime read is not least-authority Evidence.");
  return value;
}

function runtimeBrowserAppRoleRead({
  runtimeImageId,
  candidateReleaseId,
  localStack,
  context
}) {
  const browserReadContext = parseM1BOperationalBrowserReadContext(context);
  const databaseUrl =
    `postgresql://${localStack.database.guestAddress}:` +
    `${localStack.database.guestPort}/${localStack.database.database}`;
  const valueText = docker(
    createM1BOperationalRuntimeReaderArguments({
      runtimeImageId,
      candidateReleaseId,
      databaseUrl,
      browserReadContext
    }),
    "least-authority browser read reconciliation failed"
  );
  let value;
  try {
    value = JSON.parse(valueText);
  } catch {
    fail(
      "operational_browser_measurement_audit_invalid",
      "Browser app-role reconciliation returned invalid JSON."
    );
  }
  try {
    return validateM1BOperationalBrowserAppRoleRead(value, browserReadContext);
  } catch {
    fail(
      "operational_browser_measurement_audit_invalid",
      "Browser app-role reconciliation does not bind the measured query."
    );
  }
}

function postgresVolume(postgresIdentity) {
  const mountsText = docker(
    ["inspect", postgresIdentity.containerId, "--format", "{{json .Mounts}}"],
    "PostgreSQL volume identity unavailable"
  );
  let mounts;
  try {
    mounts = JSON.parse(mountsText);
  } catch {
    fail("operational_restart_invalid", "PostgreSQL mounts are invalid.");
  }
  const volume = mounts.find((entry) =>
    entry.Type === "volume" && entry.Destination === "/var/lib/postgresql/data"
  );
  if (
    !volume ||
    !IDENTIFIER.test(volume.Name ?? "") ||
    !IDENTIFIER.test(volume.Driver ?? "local")
  ) {
    fail("operational_restart_invalid", "PostgreSQL retained volume is missing.");
  }
  const metadataText = docker(
    [
      "volume",
      "inspect",
      volume.Name,
      "--format",
      "{\"name\":{{json .Name}},\"driver\":{{json .Driver}},\"createdAt\":{{json .CreatedAt}},\"scope\":{{json .Scope}},\"labels\":{{json .Labels}},\"options\":{{json .Options}}}"
    ],
    "PostgreSQL volume metadata unavailable"
  );
  let metadata;
  try {
    metadata = JSON.parse(metadataText);
  } catch {
    fail("operational_restart_invalid", "PostgreSQL volume metadata is invalid.");
  }
  if (
    metadata.name !== volume.Name ||
    !IDENTIFIER.test(metadata.driver ?? "") ||
    !IDENTIFIER.test(metadata.scope ?? "") ||
    typeof metadata.createdAt !== "string" ||
    !Number.isFinite(Date.parse(metadata.createdAt)) ||
    typeof volume.Destination !== "string" ||
    volume.Destination !== "/var/lib/postgresql/data" ||
    typeof volume.RW !== "boolean"
  ) fail("operational_restart_invalid", "PostgreSQL volume metadata is incomplete.");
  const receipt = Object.freeze({
    name: metadata.name,
    driver: metadata.driver,
    createdAt: new Date(metadata.createdAt).toISOString(),
    scope: metadata.scope,
    labelsHash: manifestHash(metadata.labels ?? {}),
    optionsHash: manifestHash(metadata.options ?? {}),
    destination: volume.Destination,
    readWrite: volume.RW
  });
  return Object.freeze({
    name: metadata.name,
    receipt: Object.freeze({
      ...receipt,
      metadataHash: manifestHash(receipt)
    })
  });
}

function engineBinding() {
  const text = docker(
    [
      "info",
      "--format",
      "{\"id\":{{json .ID}},\"serverVersion\":{{json .ServerVersion}},\"securityOptions\":{{json .SecurityOptions}},\"systemTime\":{{json .SystemTime}}}"
    ],
    "Docker Engine identity unavailable"
  );
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("operational_restart_invalid", "Docker Engine identity is invalid.");
  }
  if (
    typeof value.id !== "string" ||
    value.id.length < 8 ||
    !IDENTIFIER.test(value.serverVersion ?? "") ||
    !Array.isArray(value.securityOptions) ||
    !value.securityOptions.some((entry) => /rootless/i.test(entry)) ||
    typeof value.systemTime !== "string" ||
    !Number.isFinite(Date.parse(value.systemTime))
  ) fail("operational_restart_invalid", "Docker Engine is not the reviewed rootless runtime.");
  return Object.freeze({
    observedAt: new Date(value.systemTime).toISOString(),
    receipt: Object.freeze({
      engineIdHash: manifestHash(value.id),
      serverVersion: value.serverVersion,
      securityOptionsHash: manifestHash(value.securityOptions),
      rootless: true
    })
  });
}

async function runtimeSnapshot({ baseArgs, runtimeImageId, candidateReleaseId, localStack }) {
  const services = Object.freeze(Object.fromEntries(
    ["postgres", "pilot", "worker"].map((service) => [service, serviceIdentity(baseArgs, service)])
  ));
  if (
    services.pilot.imageId !== runtimeImageId ||
    services.worker.imageId !== runtimeImageId
  ) fail("operational_runtime_identity_invalid", "Pilot or Worker image does not match exact candidate image.");
  const database = await runtimeDatabaseRead(runtimeImageId, candidateReleaseId, localStack);
  const volume = postgresVolume(services.postgres);
  const engine = engineBinding();
  return Object.freeze({
    capturedAt: engine.observedAt,
    databaseStartedAt: database.databaseStartedAt,
    engine,
    volume,
    services
  });
}

function restartEventLines(before, after) {
  const containerText = docker([
    "events",
    "--since",
    before.capturedAt,
    "--until",
    after.capturedAt,
    "--filter",
    "type=container",
    "--filter",
    `label=com.docker.compose.project=${INSTANCE}`,
    ...["start", "stop", "kill", "die", "restart", "create", "destroy"].flatMap(
      (event) => ["--filter", `event=${event}`]
    ),
    "--format",
    '{"action":{{json .Action}},"containerId":{{json .Actor.ID}},"project":{{json (index .Actor.Attributes "com.docker.compose.project")}},"service":{{json (index .Actor.Attributes "com.docker.compose.service")}},"timeNano":{{json (printf "%d" .TimeNano)}}}'
  ], "Docker container restart event history unavailable");
  const volumeText = docker([
    "events",
    "--since",
    before.capturedAt,
    "--until",
    after.capturedAt,
    "--filter",
    "type=volume",
    "--filter",
    `volume=${before.volume.name}`,
    "--filter",
    "event=create",
    "--filter",
    "event=destroy",
    "--format",
    '{"action":{{json .Action}},"volumeName":{{json .Actor.ID}},"timeNano":{{json (printf "%d" .TimeNano)}}}'
  ], "Docker volume event history unavailable");
  return Object.freeze({
    containerLines: containerText.split(/\r?\n/).filter(Boolean),
    volumeLines: volumeText.split(/\r?\n/).filter(Boolean)
  });
}

export function createM1BRestartObservation({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  pendingSha256,
  before,
  after,
  eventLines
}) {
  const observation = Object.freeze({
    schemaVersion: "m1_b_operational_restart_observation.v1",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    sourceRuntime: "local_exact_commit",
    pendingSha256,
    capturedAt: after?.capturedAt,
    after,
    eventLines,
    containsSecrets: false,
    containsRawPii: false,
    containsSessionMaterial: false
  });
  return validateM1BRestartObservation(observation, {
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    pendingSha256,
    before
  });
}

function validateM1BOperationalRuntimeSnapshot(snapshot, runtimeImageId) {
  if (
    !exactKeys(snapshot, [
      "capturedAt",
      "databaseStartedAt",
      "engine",
      "volume",
      "services"
    ]) ||
    !exactKeys(snapshot.engine, ["observedAt", "receipt"]) ||
    snapshot.engine.observedAt !== snapshot.capturedAt ||
    !exactKeys(snapshot.engine.receipt, [
      "engineIdHash",
      "serverVersion",
      "securityOptionsHash",
      "rootless"
    ]) ||
    !/^0x[0-9a-f]{64}$/.test(snapshot.engine.receipt.engineIdHash ?? "") ||
    !IDENTIFIER.test(snapshot.engine.receipt.serverVersion ?? "") ||
    !/^0x[0-9a-f]{64}$/.test(
      snapshot.engine.receipt.securityOptionsHash ?? ""
    ) ||
    snapshot.engine.receipt.rootless !== true ||
    !exactKeys(snapshot.volume, ["name", "receipt"]) ||
    !IDENTIFIER.test(snapshot.volume.name ?? "") ||
    !exactKeys(snapshot.volume.receipt, [
      "name",
      "driver",
      "createdAt",
      "scope",
      "labelsHash",
      "optionsHash",
      "destination",
      "readWrite",
      "metadataHash"
    ]) ||
    snapshot.volume.receipt.name !== snapshot.volume.name ||
    !IDENTIFIER.test(snapshot.volume.receipt.driver ?? "") ||
    !IDENTIFIER.test(snapshot.volume.receipt.scope ?? "") ||
    !/^0x[0-9a-f]{64}$/.test(snapshot.volume.receipt.labelsHash ?? "") ||
    !/^0x[0-9a-f]{64}$/.test(snapshot.volume.receipt.optionsHash ?? "") ||
    snapshot.volume.receipt.destination !== "/var/lib/postgresql/data" ||
    snapshot.volume.receipt.readWrite !== true ||
    !/^0x[0-9a-f]{64}$/.test(snapshot.volume.receipt.metadataHash ?? "") ||
    !exactKeys(snapshot.services, ["postgres", "pilot", "worker"])
  ) fail(
    "operational_restart_invalid",
    "The sealed restart runtime snapshot is invalid."
  );
  for (const timestamp of [
    snapshot.capturedAt,
    snapshot.databaseStartedAt,
    snapshot.volume.receipt.createdAt
  ]) iso(timestamp);
  for (const [service, identity] of Object.entries(snapshot.services)) {
    if (
      !exactKeys(identity, ["containerId", "imageId", "startedAt", "configHash"]) ||
      !/^[0-9a-f]{12,64}$/.test(identity.containerId ?? "") ||
      !IMAGE_ID.test(identity.imageId ?? "") ||
      !/^0x[0-9a-f]{64}$/.test(identity.configHash ?? "") ||
      (service === "pilot" || service === "worker") &&
        identity.imageId !== runtimeImageId
    ) fail(
      "operational_restart_invalid",
      "The sealed restart service identity is invalid."
    );
    iso(identity.startedAt);
  }
  return snapshot;
}

function projectM1BOperationalRuntimeSnapshot(snapshot) {
  return {
    capturedAt: snapshot?.capturedAt,
    databaseStartedAt: snapshot?.databaseStartedAt,
    engine: snapshot?.engine,
    volume: snapshot?.volume,
    services: snapshot?.services
  };
}

function assertCompleteM1BRestartEventSummary(summary) {
  if (
    summary.volumeCreateDestroyCount !== 0 ||
    !exactKeys(summary.services, ["postgres", "pilot", "worker"]) ||
    Object.values(summary.services).some((events) =>
      events.start !== 1 || events.die !== 1 ||
      events.create !== 0 || events.destroy !== 0
    )
  ) fail(
    "operational_restart_invalid",
    "The first completion attempt does not contain the exact restart lifecycle events."
  );
  return summary;
}

export function validateM1BRestartObservation(observation, {
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  pendingSha256,
  before
}) {
  if (
    !exactKeys(observation, [
      "schemaVersion",
      "candidateReleaseId",
      "sourceTreeHash",
      "runtimeImageId",
      "sourceRuntime",
      "pendingSha256",
      "capturedAt",
      "after",
      "eventLines",
      "containsSecrets",
      "containsRawPii",
      "containsSessionMaterial"
    ]) ||
    observation.schemaVersion !== "m1_b_operational_restart_observation.v1" ||
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    !SHA256.test(pendingSha256 ?? "") ||
    observation.candidateReleaseId !== candidateReleaseId ||
    observation.sourceTreeHash !== sourceTreeHash ||
    observation.runtimeImageId !== runtimeImageId ||
    observation.sourceRuntime !== "local_exact_commit" ||
    observation.pendingSha256 !== pendingSha256 ||
    observation.capturedAt !== observation.after?.capturedAt ||
    !exactKeys(observation.eventLines, ["containerLines", "volumeLines"]) ||
    !Array.isArray(observation.eventLines.containerLines) ||
    !Array.isArray(observation.eventLines.volumeLines) ||
    [...observation.eventLines.containerLines, ...observation.eventLines.volumeLines]
      .some((line) => typeof line !== "string" || line.length === 0 || line.length > 64 * 1024) ||
    Buffer.byteLength(JSON.stringify(observation.eventLines)) > 4 * 1024 * 1024 ||
    observation.containsSecrets !== false ||
    observation.containsRawPii !== false ||
    observation.containsSessionMaterial !== false
  ) fail(
    "operational_restart_invalid",
    "The sealed restart observation does not match the exact candidate and pending journal."
  );
  iso(observation.capturedAt);
  const beforeSnapshot = projectM1BOperationalRuntimeSnapshot(before);
  validateM1BOperationalRuntimeSnapshot(beforeSnapshot, runtimeImageId);
  validateM1BOperationalRuntimeSnapshot(observation.after, runtimeImageId);
  assertCompleteM1BRestartEventSummary(
    createM1BRestartEventSummary(
      beforeSnapshot,
      observation.after,
      observation.eventLines
    )
  );
  return observation;
}

export function assertM1BRestartObservationRuntimeStable(observedAfter, current) {
  const runtimeImageId = observedAfter?.services?.pilot?.imageId;
  validateM1BOperationalRuntimeSnapshot(observedAfter, runtimeImageId);
  validateM1BOperationalRuntimeSnapshot(current, runtimeImageId);
  if (
    observedAfter.databaseStartedAt !== current.databaseStartedAt ||
    canonicalJson(observedAfter.engine?.receipt) !== canonicalJson(current.engine?.receipt) ||
    canonicalJson(observedAfter.volume) !== canonicalJson(current.volume) ||
    canonicalJson(observedAfter.services) !== canonicalJson(current.services)
  ) fail(
    "operational_restart_invalid",
    "Runtime drifted after the sealed sole-restart observation."
  );
  return true;
}

export function createM1BRestartEventSummary(before, after, eventLines) {
  const eventNames = ["start", "stop", "kill", "die", "restart", "create", "destroy"];
  const beforeNano = BigInt(Date.parse(before.capturedAt)) * 1_000_000n;
  const afterNano = (BigInt(Date.parse(after.capturedAt)) + 1n) * 1_000_000n - 1n;
  const serviceByContainer = new Map(
    Object.entries(before.services).map(([service, identity]) => [identity.containerId, service])
  );
  const counts = Object.fromEntries(
    ["postgres", "pilot", "worker"].map((service) => [
      service,
      Object.fromEntries(eventNames.map((event) => [event, 0]))
    ])
  );
  for (const line of eventLines.containerLines ?? []) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      fail("operational_restart_invalid", "Docker restart event history is invalid.");
    }
    if (
      !exactKeys(event, ["action", "containerId", "project", "service", "timeNano"]) ||
      event.project !== INSTANCE ||
      !/^[0-9a-f]{12,64}$/.test(event.containerId ?? "") ||
      !IDENTIFIER.test(event.service ?? "") ||
      !eventNames.includes(event.action) ||
      !/^[0-9]{16,20}$/.test(event.timeNano ?? "") ||
      BigInt(event.timeNano) < beforeNano ||
      BigInt(event.timeNano) > afterNano
    ) fail(
      "operational_restart_invalid",
      "Docker restart event history is not one closed safe projection."
    );
    const action = event.action;
    const containerId = event.containerId;
    const service = event.service;
    if (!Object.hasOwn(counts, service)) {
      fail("operational_restart_invalid", "An unexpected project container lifecycle event occurred during restart.");
    }
    if (serviceByContainer.get(containerId) !== service) {
      fail("operational_restart_invalid", `${service} restart events do not bind the captured container.`);
    }
    counts[service][action] += 1;
  }
  let volumeCreateDestroyCount = 0;
  for (const line of eventLines.volumeLines ?? []) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
        fail("operational_restart_invalid", "Docker volume event history is invalid.");
    }
    if (
      !exactKeys(event, ["action", "volumeName", "timeNano"]) ||
      event.volumeName !== before.volume.name ||
      !new Set(["create", "destroy"]).has(event.action) ||
      !/^[0-9]{16,20}$/.test(event.timeNano ?? "") ||
      BigInt(event.timeNano) < beforeNano ||
      BigInt(event.timeNano) > afterNano
    ) fail(
      "operational_restart_invalid",
      "Docker volume event history is not one closed safe projection."
    );
    const action = event.action;
    if (new Set(["create", "destroy"]).has(action)) {
      volumeCreateDestroyCount += 1;
    }
  }
  if (volumeCreateDestroyCount !== 0) {
    fail("operational_restart_invalid", "The retained PostgreSQL volume was created or destroyed during restart.");
  }
  return Object.freeze({ services: counts, volumeCreateDestroyCount });
}

export function createM1BRestartContext(before, after, eventSummary) {
  if (
    canonicalJson(before.engine.receipt) !== canonicalJson(after.engine.receipt) ||
    canonicalJson(before.volume.receipt) !== canonicalJson(after.volume.receipt) ||
    before.volume.name !== after.volume.name ||
    Date.parse(after.databaseStartedAt) <= Date.parse(before.databaseStartedAt)
  ) fail("operational_restart_invalid", "PostgreSQL volume was not retained across restart.");
  const services = ["postgres", "pilot", "worker"].map((service) => ({
    service,
    before: before.services[service],
    after: after.services[service],
    events: eventSummary.services[service]
  }));
  return validateRestartContext({
    capturedAt: after.capturedAt,
    beforeDatabaseStartedAt: before.databaseStartedAt,
    afterDatabaseStartedAt: after.databaseStartedAt,
    eventWindow: Object.freeze({
      engineBeforeAt: before.capturedAt,
      engineAfterAt: after.capturedAt
    }),
    engine: after.engine.receipt,
    volume: {
      ...after.volume.receipt,
      createDestroyEventCount: eventSummary.volumeCreateDestroyCount
    },
    services
  });
}

function restartReceiptDocument({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  pendingSha256,
  agentBeforeSha256,
  agentBeforePhaseReceipt,
  agentForeignOfferSetupArtifact,
  restart
}) {
  validateRestartContext(restart);
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    !SHA256.test(pendingSha256 ?? "") ||
    !SHA256.test(agentBeforeSha256 ?? "") ||
    !exactKeys(agentBeforePhaseReceipt, ["sha256", "completedAt"]) ||
    !SHA256.test(agentBeforePhaseReceipt.sha256 ?? "") ||
    !Number.isFinite(Date.parse(agentBeforePhaseReceipt.completedAt ?? "")) ||
    !exactKeys(agentForeignOfferSetupArtifact, ["id", "sha256", "completedAt"]) ||
    agentForeignOfferSetupArtifact.id !== "agent_foreign_offer_setup" ||
    !SHA256.test(agentForeignOfferSetupArtifact.sha256 ?? "") ||
    !Number.isFinite(Date.parse(agentForeignOfferSetupArtifact.completedAt ?? "")) ||
    Date.parse(agentBeforePhaseReceipt.completedAt) >=
      Date.parse(restart.eventWindow.engineBeforeAt)
  ) fail("operational_restart_invalid", "Restart receipt provenance is invalid.");
  return Object.freeze({
    schemaVersion: "m1_b_restart_receipt.v2",
    status: "passed",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    sourceRuntime: "local_exact_commit",
    pendingJournalSha256: pendingSha256,
    agentBeforeSha256,
    agentBeforePhaseReceipt,
    agentForeignOfferSetupArtifact,
    restartCount: 1,
    capturedAt: restart.capturedAt,
    beforeDatabaseStartedAt: restart.beforeDatabaseStartedAt,
    afterDatabaseStartedAt: restart.afterDatabaseStartedAt,
    eventWindow: restart.eventWindow,
    engine: restart.engine,
    volume: restart.volume,
    services: restart.services,
    fixtureUsed: false,
    productionFundsMoved: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false,
      containsEnvironment: false,
      containsVolumeSourceOrMountpoint: false
    })
  });
}

function restartContextFromReceipt(receipt) {
  if (
    receipt?.schemaVersion !== "m1_b_restart_receipt.v2" ||
    receipt.status !== "passed" ||
    receipt.restartCount !== 1
  ) fail("operational_restart_invalid", "Completed restart receipt is invalid.");
  return validateRestartContext({
    capturedAt: receipt.capturedAt,
    beforeDatabaseStartedAt: receipt.beforeDatabaseStartedAt,
    afterDatabaseStartedAt: receipt.afterDatabaseStartedAt,
    eventWindow: receipt.eventWindow,
    engine: receipt.engine,
    volume: receipt.volume,
    services: receipt.services
  });
}

export function assertM1BOperationalRuntimeMatchesRestart(receipt, snapshot) {
  const restart = restartContextFromReceipt(receipt);
  const restartVolumeReceipt = Object.fromEntries(
    Object.entries(restart.volume).filter(
      ([key]) => key !== "createDestroyEventCount"
    )
  );
  const afterServices = Object.fromEntries(
    restart.services.map(({ service, after }) => [service, after])
  );
  if (
    snapshot.databaseStartedAt !== restart.afterDatabaseStartedAt ||
    canonicalJson(snapshot.engine.receipt) !== canonicalJson(restart.engine) ||
    canonicalJson(snapshot.volume.receipt) !== canonicalJson(restartVolumeReceipt) ||
    snapshot.volume.name !== restart.volume.name ||
    ["postgres", "pilot", "worker"].some(
      (service) => canonicalJson(snapshot.services[service]) !== canonicalJson(afterServices[service])
    )
  ) fail("operational_restart_invalid", "Runtime drifted after the sole completed restart.");
  return true;
}

async function privateJson(path, description) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail("operational_critical_artifact_missing", `${description} is missing.`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
    fail("operational_critical_artifact_invalid", `${description} must be one regular 0600 file.`);
  }
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail("operational_critical_artifact_invalid", `${description} is not valid JSON.`);
  }
}

async function privateJsonIfPresent(path, description) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  return privateJson(path, description);
}

async function readBoundOperationalArtifact(reference, {
  outputRoot,
  expectedKind,
  parseJson = true,
  description
}) {
  if (
    !exactKeys(reference, ["id", "kind", "relativePath", "sha256"]) ||
    reference.kind !== expectedKind ||
    !IDENTIFIER.test(reference.id ?? "") ||
    typeof reference.relativePath !== "string" ||
    isAbsolute(reference.relativePath) ||
    reference.relativePath.split(sep).includes("..") ||
    !SHA256.test(reference.sha256 ?? "")
  ) fail(
    "operational_artifact_binding_invalid",
    `${description} reference is invalid.`
  );
  const path = resolve(ROOT, reference.relativePath);
  const [outputReal, parentReal] = await Promise.all([
    realpath(outputRoot),
    realpath(dirname(path))
  ]);
  const relation = relative(outputReal, parentReal);
  if (relation.startsWith("..") || isAbsolute(relation)) {
    fail(
      "operational_artifact_binding_invalid",
      `${description} is outside the private candidate directory.`
    );
  }
  const metadata = await lstat(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o777) !== 0o600
  ) fail(
    "operational_artifact_binding_invalid",
    `${description} must be one regular non-symlink 0600 file.`
  );
  const bytes = await readFile(path);
  if (sha256(bytes) !== reference.sha256) {
    fail(
      "operational_artifact_binding_invalid",
      `${description} bytes do not match the sealed digest.`
    );
  }
  let document = null;
  if (parseJson) {
    try {
      document = JSON.parse(bytes);
    } catch {
      fail(
        "operational_artifact_binding_invalid",
        `${description} is not valid JSON.`
      );
    }
  }
  return Object.freeze({ reference: Object.freeze({ ...reference }), path, bytes, document });
}

export async function readM1BOperationalNegativeRunEvidence({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  outputRoot
}) {
  const receiptPath = resolve(
    outputRoot,
    `${candidateReleaseId}.exact-source-negative-run.json`
  );
  const receipt = await privateJson(
    receiptPath,
    "exact-source negative-run receipt"
  );
  if (
    receipt.schemaVersion !==
      "m1_b_operational_exact_source_negative_run_receipt.v2" ||
    receipt.status !== "exact_source_negative_run_passed" ||
    receipt.candidateReleaseId !== candidateReleaseId ||
    receipt.sourceTreeHash !== sourceTreeHash ||
    receipt.runtimeImageId !== runtimeImageId ||
    receipt.databaseStartedAt !== databaseStartedAt ||
    receipt.sourceRuntime !== "local_exact_commit" ||
    receipt.exactSourceCaseCount !== 12 ||
    receipt.boundArtifactCount !== 25 ||
    receipt.sealedFileCount !== 26 ||
    !Array.isArray(receipt.cases) ||
    receipt.cases.length !== 12 ||
    receipt.fixtureUsed !== false ||
    receipt.productionFundsMoved !== false
  ) fail(
    "operational_negative_run_invalid",
    "The sealed exact-source negative run does not match the candidate."
  );
  iso(receipt.startedAt, "operational_negative_run_invalid");
  iso(receipt.completedAt, "operational_negative_run_invalid");
  if (
    Date.parse(receipt.startedAt) < Date.parse(databaseStartedAt) ||
    Date.parse(receipt.completedAt) <= Date.parse(receipt.startedAt)
  ) fail(
    "operational_negative_run_invalid",
    "The sealed exact-source negative-run chronology is invalid."
  );
  const expectedDefinitions = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode }) => sourceMode !== "live_post_restart"
  );
  const proofs = [];
  const tapArtifacts = [];
  const artifactReferences = [];
  for (const [index, definition] of expectedDefinitions.entries()) {
    const entry = receipt.cases[index];
    if (
      !exactKeys(entry, [
        "group",
        "id",
        "sourceMode",
        "caseDefinitionHash",
        "capturedAt",
        "proofArtifact",
        "tapArtifact"
      ]) ||
      entry.group !== definition.group ||
      entry.id !== definition.id ||
      entry.sourceMode !== definition.sourceMode ||
      entry.caseDefinitionHash !== definition.caseDefinitionHash
    ) fail(
      "operational_negative_run_invalid",
      "The sealed exact-source case order or definition is invalid."
    );
    iso(entry.capturedAt, "operational_negative_run_invalid");
    const [proofFile, tapFile] = await Promise.all([
      readBoundOperationalArtifact(entry.proofArtifact, {
        outputRoot,
        expectedKind: "negative_source_proof",
        parseJson: true,
        description: `${definition.group}:${definition.id} source proof`
      }),
      readBoundOperationalArtifact(entry.tapArtifact, {
        outputRoot,
        expectedKind: "tap_log",
        parseJson: false,
        description: `${definition.group}:${definition.id} TAP log`
      })
    ]);
    const proof = await validateM1BOperationalNegativeProof(proofFile.document, {
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      availableArtifacts: []
    });
    if (
      proof.capturedAt !== entry.capturedAt ||
      proof.sourceEvidence.tapSha256 !== entry.tapArtifact.sha256
    ) fail(
      "operational_negative_run_invalid",
      "The sealed compact proof does not match its receipt/TAP binding."
    );
    proofs.push(proof);
    tapArtifacts.push(Object.freeze({
      ...entry.tapArtifact,
      bytes: tapFile.bytes
    }));
    artifactReferences.push(entry.proofArtifact, entry.tapArtifact);
  }
  const executionFile = await readBoundOperationalArtifact(
    receipt.exactSourceExecutionArtifact,
    {
      outputRoot,
      expectedKind: "runtime_receipt",
      parseJson: true,
      description: "exact-source negative execution manifest"
    }
  );
  validateNegativeExecutionEvidence({
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    outputRoot,
    derivedNegativeProofs: proofs,
    negativeExecutionManifest: executionFile.document,
    negativeTapArtifacts: tapArtifacts
  });
  const receiptReference = Object.freeze({
    id: "operational_negative_run",
    kind: "negative_receipt",
    relativePath: relative(ROOT, receiptPath),
    sha256: sha256(await readFile(receiptPath))
  });
  return Object.freeze({
    receipt,
    receiptReference,
    proofs: Object.freeze(proofs),
    tapArtifacts: Object.freeze(tapArtifacts),
    executionManifest: executionFile.document,
    executionReference: receipt.exactSourceExecutionArtifact,
    artifactReferences: Object.freeze([
      ...artifactReferences,
      receipt.exactSourceExecutionArtifact,
      receiptReference
    ])
  });
}

export function createM1BOperationalRestartLinkageDocument({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  restart,
  restartPendingArtifact,
  restartArtifact,
  supportingArtifacts
}) {
  validateRestartContext(restart);
  const expectedReference = (reference, id, kind) => (
    exactKeys(reference, ["id", "kind", "relativePath", "sha256"]) &&
    reference.id === id &&
    reference.kind === kind &&
    typeof reference.relativePath === "string" &&
    reference.relativePath !== "" &&
    !isAbsolute(reference.relativePath) &&
    !reference.relativePath.split(sep).includes("..") &&
    SHA256.test(reference.sha256 ?? "")
  );
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    restart.afterDatabaseStartedAt !== databaseStartedAt ||
    !expectedReference(
      restartPendingArtifact,
      "operational_restart_pending",
      "restart_log"
    ) ||
    !expectedReference(restartArtifact, "operational_restart", "restart_log")
  ) fail(
    "operational_restart_linkage_invalid",
    "The restart linkage candidate or journal references are invalid."
  );
  const beforePhase = criticalReference(supportingArtifacts, "agent_before_phase");
  const afterPhase = criticalReference(supportingArtifacts, "agent_after_phase");
  const foreignSetup = criticalReference(
    supportingArtifacts,
    "agent_foreign_offer_setup"
  );
  for (const [reference, id, kind] of [
    [beforePhase, "agent_before_phase", "runtime_receipt"],
    [afterPhase, "agent_after_phase", "runtime_receipt"],
    [foreignSetup, "agent_foreign_offer_setup", "postgres_receipt"]
  ]) {
    if (!expectedReference(reference, id, kind)) fail(
      "operational_restart_linkage_invalid",
      `Restart linkage artifact ${id} is invalid.`
    );
  }
  return Object.freeze({
    schemaVersion: "m1_b_operational_restart_linkage.v2",
    status: "passed",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    sourceRuntime: "local_exact_commit",
    databaseStartedAt,
    pendingJournalArtifact: Object.freeze({
      id: restartPendingArtifact.id,
      sha256: restartPendingArtifact.sha256
    }),
    completedRestartArtifact: Object.freeze({
      id: restartArtifact.id,
      sha256: restartArtifact.sha256
    }),
    agentBeforePhaseArtifact: Object.freeze({
      id: beforePhase.id,
      sha256: beforePhase.sha256
    }),
    agentAfterPhaseArtifact: Object.freeze({
      id: afterPhase.id,
      sha256: afterPhase.sha256
    }),
    agentForeignOfferSetupArtifact: Object.freeze({
      id: foreignSetup.id,
      sha256: foreignSetup.sha256
    }),
    restartCount: 1,
    eventWindow: restart.eventWindow,
    beforeDatabaseStartedAt: restart.beforeDatabaseStartedAt,
    afterDatabaseStartedAt: restart.afterDatabaseStartedAt,
    capturedAt: restart.capturedAt,
    fixtureUsed: false,
    productionFundsMoved: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    })
  });
}

export function assertM1BOperationalPreRiskArtifactSet({
  candidateReleaseId,
  boundArtifacts
}) {
  if (!SHA.test(candidateReleaseId ?? "") || !Array.isArray(boundArtifacts)) {
    fail(
      "operational_pre_risk_artifact_set_invalid",
      "The exact candidate pre-Risk artifact set is missing."
    );
  }
  const byId = new Map();
  for (const artifact of boundArtifacts) {
    if (
      !exactKeys(artifact, ["id", "kind", "relativePath", "sha256"]) ||
      byId.has(artifact.id) ||
      !SHA256.test(artifact.sha256 ?? "")
    ) fail(
      "operational_pre_risk_artifact_set_invalid",
      "A pre-Risk artifact reference is malformed or duplicated."
    );
    byId.set(artifact.id, artifact);
  }
  const pending = byId.get("operational_restart_pending");
  const pendingName = `${candidateReleaseId}.operational-restart.pending.json`;
  const outputPrefix = dirname(pending?.relativePath ?? "");
  const outputParts = outputPrefix.split(sep);
  if (
    pending?.kind !== "restart_log" ||
    pending.relativePath !== relative(
      ROOT,
      resolve(ROOT, outputPrefix, pendingName)
    ) ||
    outputParts.length !== 3 ||
    outputParts[0] !== "output" ||
    outputParts[1] !== "playwright" ||
    !IDENTIFIER.test(outputParts[2] ?? "")
  ) fail(
    "operational_pre_risk_artifact_set_invalid",
    "The pre-Risk output root is not one candidate-bound private Playwright child."
  );
  const agentDirectory = relative(ROOT, AGENT_DIRECTORY);
  const application = byId.get("agent_application_mcp");
  const applicationPrefix = `${agentDirectory}${sep}`;
  const applicationName = application?.relativePath?.startsWith(applicationPrefix)
    ? application.relativePath.slice(applicationPrefix.length)
    : "";
  const workflowMatch = applicationName.match(new RegExp(
    `^m1-b-${candidateReleaseId}\\.before_restart\\.([0-9a-f]{24})\\.offer-receipt\\.json$`
  ));
  if (!workflowMatch) fail(
    "operational_pre_risk_artifact_set_invalid",
    "The Agent application receipt does not expose the exact candidate workflow key."
  );
  const workflowKey = workflowMatch[1];
  const expected = new Map();
  const outputPath = (name) => relative(
    ROOT,
    resolve(ROOT, outputPrefix, name)
  );
  const agentPath = (name) => relative(ROOT, resolve(AGENT_DIRECTORY, name));
  const add = (id, kind, relativePath) => {
    if (expected.has(id)) fail(
      "operational_pre_risk_artifact_set_invalid",
      `The expected pre-Risk artifact ID ${id} is duplicated.`
    );
    expected.set(id, Object.freeze({ id, kind, relativePath }));
  };
  add(
    "operational_restart_pending",
    "restart_log",
    outputPath(pendingName)
  );
  add(
    "operational_restart",
    "restart_log",
    outputPath(`${candidateReleaseId}.operational-restart.json`)
  );
  add(
    "release_identity",
    "release_identity",
    outputPath(`${candidateReleaseId}.local-release-identity.json`)
  );
  add(
    "agent_before",
    "runtime_receipt",
    agentPath(`${candidateReleaseId}.before-restart.acceptance.json`)
  );
  add(
    "agent_after",
    "runtime_receipt",
    agentPath(`${candidateReleaseId}.after-restart.acceptance.json`)
  );
  add(
    "human_critical",
    "postgres_receipt",
    outputPath(`${candidateReleaseId}.human-critical-receipt.json`)
  );
  add(
    "capital_partner_critical",
    "postgres_receipt",
    outputPath(`${candidateReleaseId}.capital-partner-critical-receipt.json`)
  );
  add(
    "agent_application_mcp",
    "agent_mcp_receipt",
    agentPath(
      `m1-b-${candidateReleaseId}.before_restart.${workflowKey}.offer-receipt.json`
    )
  );
  add(
    "agent_runtime_mcp",
    "agent_mcp_receipt",
    agentPath(
      `m1-b-${candidateReleaseId}.before_restart.${workflowKey}.mcp-receipt.json`
    )
  );
  add(
    "agent_foreign_offer_setup",
    "postgres_receipt",
    agentPath(`${candidateReleaseId}.agent-foreign-offer-setup.receipt.v1.json`)
  );
  add(
    "agent_before_phase",
    "runtime_receipt",
    agentPath(`${candidateReleaseId}.before-restart.phase-receipt.v2.json`)
  );
  add(
    "agent_after_phase",
    "runtime_receipt",
    agentPath(`${candidateReleaseId}.after-restart.phase-receipt.v2.json`)
  );
  add(
    "agent_recovery_receipt",
    "runtime_receipt",
    agentPath(
      `m1-b-${candidateReleaseId}.after_restart.${workflowKey}.recovery-receipt.json`
    )
  );
  for (const definition of M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode }) => sourceMode !== "live_post_restart"
  )) {
    add(
      artifactId("negative_source_proof", definition.group, definition.id),
      "negative_source_proof",
      outputPath(
        `${candidateReleaseId}.negative-source-proof.${definition.group}.${definition.id}.json`
      )
    );
    add(
      artifactId("negative_tap", definition.group, definition.id),
      "tap_log",
      outputPath(
        `${candidateReleaseId}.negative.${definition.group}.${definition.id}.tap`
      )
    );
  }
  add(
    "operational_negative_exact_source_execution",
    "runtime_receipt",
    outputPath(`${candidateReleaseId}.negative-exact-source-execution.json`)
  );
  add(
    "operational_negative_run",
    "negative_receipt",
    outputPath(`${candidateReleaseId}.exact-source-negative-run.json`)
  );
  for (const definition of M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode, id }) =>
      sourceMode === "live_post_restart" && id !== "replaced_stale_offer"
  )) {
    add(
      artifactId("negative_live_attempt", definition.group, definition.id),
      "negative_receipt",
      outputPath(
        `${candidateReleaseId}.negative-live-attempt.${definition.group}.${definition.id}.json`
      )
    );
    add(
      artifactId(
        "negative_live_source_proof",
        definition.group,
        definition.id
      ),
      "negative_source_proof",
      outputPath(
        `${candidateReleaseId}.negative-live-source-proof.${definition.group}.${definition.id}.json`
      )
    );
  }
  add(
    "expired_offer_setup",
    "postgres_receipt",
    outputPath(`${candidateReleaseId}.expired-offer-setup.receipt.v1.json`)
  );
  for (const role of M1_B_OPERATIONAL_ROLES) {
    for (const check of M1_B_OPERATIONAL_BROWSER_CHECKS) {
      const prefix = `browser_${role}_${check}`;
      for (const phase of M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[check]) {
        add(
          `${prefix}_${browserPhaseArtifactToken(phase)}_shot`,
          "screenshot",
          outputPath(`${candidateReleaseId}.browser.${role}.${check}.${phase}.png`)
        );
      }
      add(
        `${prefix}_runtime`,
        "runtime_receipt",
        outputPath(`${candidateReleaseId}.browser.${role}.${check}.runtime.json`)
      );
      add(
        `${prefix}_audit`,
        "browser_audit",
        outputPath(`${candidateReleaseId}.browser.${role}.${check}.audit.json`)
      );
    }
    add(
      artifactId("journey", role, "receipt"),
      "runtime_receipt",
      outputPath(`${candidateReleaseId}.journey.${role}.json`)
    );
  }
  for (const definition of M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS) {
    add(
      artifactId("negative", definition.group, definition.id),
      "negative_receipt",
      outputPath(
        `${candidateReleaseId}.negative.${definition.group}.${definition.id}.json`
      )
    );
  }
  add(
    "operational_negative_cases",
    "negative_receipt",
    outputPath(`${candidateReleaseId}.negative-cases.json`)
  );
  add(
    "operational_restart_linkage",
    "restart_log",
    outputPath(`${candidateReleaseId}.operational-restart-linkage.v2.json`)
  );
  if (expected.size !== 148 || byId.size !== expected.size) fail(
    "operational_pre_risk_artifact_set_invalid",
    "The pre-Risk collection is not the exact 148-artifact closed set."
  );
  for (const [id, contract] of expected) {
    const artifact = byId.get(id);
    if (
      artifact?.kind !== contract.kind ||
      artifact.relativePath !== contract.relativePath
    ) fail(
      "operational_pre_risk_artifact_set_invalid",
      `Pre-Risk artifact ${id} has the wrong kind or candidate-derived path.`
    );
  }
  return Object.freeze({
    outputPrefix,
    workflowKey,
    expected: Object.freeze([...expected.values()])
  });
}

export function createM1BOperationalPreRiskCollectionReceipt({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  startedAt,
  completedAt,
  restartLinkageArtifact,
  boundArtifacts,
  browserRowCount,
  journeyStepCount,
  negativeCaseCount
}) {
  iso(databaseStartedAt, "operational_pre_risk_receipt_invalid");
  iso(startedAt, "operational_pre_risk_receipt_invalid");
  iso(completedAt, "operational_pre_risk_receipt_invalid");
  const ids = new Set();
  const paths = new Set();
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    Date.parse(startedAt) < Date.parse(databaseStartedAt) ||
    Date.parse(completedAt) <= Date.parse(startedAt) ||
    browserRowCount !== 24 ||
    journeyStepCount !== 28 ||
    negativeCaseCount !== 16 ||
    !exactKeys(restartLinkageArtifact, [
      "id",
      "kind",
      "relativePath",
      "sha256"
    ]) ||
    restartLinkageArtifact.id !== "operational_restart_linkage" ||
    restartLinkageArtifact.kind !== "restart_log" ||
    !Array.isArray(boundArtifacts) ||
    boundArtifacts.length !== 148
  ) fail(
    "operational_pre_risk_receipt_invalid",
    "The pre-Risk collection identity, counts, or chronology is invalid."
  );
  for (const artifact of boundArtifacts) {
    if (
      !exactKeys(artifact, ["id", "kind", "relativePath", "sha256"]) ||
      !IDENTIFIER.test(artifact.id ?? "") ||
      !IDENTIFIER.test(artifact.kind ?? "") ||
      typeof artifact.relativePath !== "string" ||
      artifact.relativePath === "" ||
      isAbsolute(artifact.relativePath) ||
      artifact.relativePath.split(sep).includes("..") ||
      !SHA256.test(artifact.sha256 ?? "") ||
      ids.has(artifact.id) ||
      paths.has(artifact.relativePath) ||
      artifact.id === "risk_critical"
    ) fail(
      "operational_pre_risk_receipt_invalid",
      "A pre-Risk bound artifact is invalid, duplicated, or prematurely includes Risk."
    );
    ids.add(artifact.id);
    paths.add(artifact.relativePath);
  }
  assertM1BOperationalPreRiskArtifactSet({
    candidateReleaseId,
    boundArtifacts
  });
  if (
    !ids.has(restartLinkageArtifact.id) ||
    boundArtifacts.find(({ id }) => id === restartLinkageArtifact.id)?.sha256 !==
      restartLinkageArtifact.sha256
  ) fail(
    "operational_pre_risk_receipt_invalid",
    "The pre-Risk artifact set is missing a required restart, negative, setup, or journey binding."
  );
  return Object.freeze({
    schemaVersion: "m1_b_operational_pre_risk_collection_receipt.v2",
    status: "pre_risk_operational_evidence_passed",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    sourceRuntime: "local_exact_commit",
    databaseStartedAt,
    startedAt,
    completedAt,
    restartLinkageArtifact: Object.freeze({
      id: restartLinkageArtifact.id,
      sha256: restartLinkageArtifact.sha256
    }),
    browserRowCount,
    journeyStepCount,
    negativeCaseCount,
    boundArtifactCount: boundArtifacts.length,
    boundArtifacts: Object.freeze(boundArtifacts.map((artifact) =>
      Object.freeze({ ...artifact })
    )),
    riskEvidenceCollected: false,
    fixtureUsed: false,
    productionFundsMoved: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    })
  });
}

export function assertM1BCanonicalOperationalArtifactSet({
  candidateReleaseId,
  references
}) {
  if (!Array.isArray(references) || references.length !== 151) fail(
    "operational_canonical_artifact_set_invalid",
    "Canonical Evidence must contain the exact 151-artifact closed set."
  );
  const finalIds = new Set([
    "operational_pre_risk_collection",
    "risk_critical",
    "operational_closure"
  ]);
  const preRisk = references.filter(({ id }) => !finalIds.has(id));
  const contract = assertM1BOperationalPreRiskArtifactSet({
    candidateReleaseId,
    boundArtifacts: preRisk
  });
  const byId = new Map(references.map((reference) => [reference.id, reference]));
  if (byId.size !== references.length) fail(
    "operational_canonical_artifact_set_invalid",
    "Canonical Evidence contains a duplicated artifact ID."
  );
  const outputPath = (name) => relative(
    ROOT,
    resolve(ROOT, contract.outputPrefix, name)
  );
  for (const [id, kind, relativePath] of [
    [
      "operational_pre_risk_collection",
      "runtime_receipt",
      outputPath(`${candidateReleaseId}.operational-pre-risk-collection.v2.json`)
    ],
    [
      "risk_critical",
      "negative_receipt",
      outputPath(`${candidateReleaseId}.risk-mfa-boundary.json`)
    ],
    [
      "operational_closure",
      "runtime_receipt",
      outputPath(`${candidateReleaseId}.operational-closure.v2.json`)
    ]
  ]) {
    const reference = byId.get(id);
    if (
      !exactKeys(reference, ["id", "kind", "relativePath", "sha256"]) ||
      reference.kind !== kind ||
      reference.relativePath !== relativePath ||
      !SHA256.test(reference.sha256 ?? "")
    ) fail(
      "operational_canonical_artifact_set_invalid",
      `Canonical final artifact ${id} has the wrong kind or candidate-derived path.`
    );
  }
  return true;
}

async function readSealedOperationalArtifact(reference, {
  outputRoot,
  parseJson = true,
  description = reference?.id ?? "operational artifact"
}) {
  if (
    !exactKeys(reference, ["id", "kind", "relativePath", "sha256"]) ||
    !IDENTIFIER.test(reference.id ?? "") ||
    !IDENTIFIER.test(reference.kind ?? "") ||
    typeof reference.relativePath !== "string" ||
    reference.relativePath === "" ||
    isAbsolute(reference.relativePath) ||
    reference.relativePath.split(sep).includes("..") ||
    !SHA256.test(reference.sha256 ?? "")
  ) fail(
    "operational_artifact_binding_invalid",
    `${description} reference is invalid.`
  );
  const path = resolve(ROOT, reference.relativePath);
  const [rootReal, outputReal, agentReal, pathReal] = await Promise.all([
    realpath(ROOT),
    realpath(outputRoot),
    realpath(AGENT_DIRECTORY),
    realpath(path)
  ]);
  const containedBy = (parent) => {
    const relation = relative(parent, pathReal);
    return relation !== "" && !relation.startsWith("..") && !isAbsolute(relation);
  };
  if (
    !containedBy(rootReal) ||
    (!containedBy(outputReal) && !containedBy(agentReal))
  ) fail(
    "operational_artifact_binding_invalid",
    `${description} resolves outside the private candidate or Agent evidence roots.`
  );
  const metadata = await lstat(pathReal);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o777) !== 0o600
  ) fail(
    "operational_artifact_binding_invalid",
    `${description} must be one regular non-symlink 0600 file.`
  );
  const bytes = await readFile(pathReal);
  if (sha256(bytes) !== reference.sha256) fail(
    "operational_artifact_binding_invalid",
    `${description} bytes do not match the sealed digest.`
  );
  let document = null;
  if (parseJson) {
    try {
      document = JSON.parse(bytes);
    } catch {
      fail(
        "operational_artifact_binding_invalid",
        `${description} is not valid JSON.`
      );
    }
  }
  return Object.freeze({
    reference: Object.freeze({ ...reference }),
    path: pathReal,
    bytes,
    document
  });
}

export async function readM1BOperationalPreRiskCollectionEvidence({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  outputRoot
}) {
  const receiptPath = resolve(
    outputRoot,
    `${candidateReleaseId}.operational-pre-risk-collection.v2.json`
  );
  const receipt = await privateJson(
    receiptPath,
    "pre-Risk operational collection receipt"
  );
  if (
    receipt?.schemaVersion !==
      "m1_b_operational_pre_risk_collection_receipt.v2" ||
    receipt.status !== "pre_risk_operational_evidence_passed" ||
    receipt.candidateReleaseId !== candidateReleaseId ||
    receipt.sourceTreeHash !== sourceTreeHash ||
    receipt.runtimeImageId !== runtimeImageId ||
    receipt.databaseStartedAt !== databaseStartedAt
  ) fail(
    "operational_pre_risk_receipt_invalid",
    "The pre-Risk collection receipt does not match the exact retained candidate."
  );
  const restartLinkageReference = receipt.boundArtifacts?.find(
    ({ id }) => id === "operational_restart_linkage"
  );
  const reconstructed = createM1BOperationalPreRiskCollectionReceipt({
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
    restartLinkageArtifact: restartLinkageReference,
    boundArtifacts: receipt.boundArtifacts,
    browserRowCount: receipt.browserRowCount,
    journeyStepCount: receipt.journeyStepCount,
    negativeCaseCount: receipt.negativeCaseCount
  });
  if (canonicalJson(reconstructed) !== canonicalJson(receipt)) fail(
    "operational_pre_risk_receipt_invalid",
    "The pre-Risk collection receipt contains unrecognized or recomputation-unsafe fields."
  );
  const files = new Map();
  for (const reference of receipt.boundArtifacts) {
    const file = await readSealedOperationalArtifact(reference, {
      outputRoot,
      parseJson: !new Set(["screenshot", "tap_log"]).has(reference.kind),
      description: `pre-Risk artifact ${reference.id}`
    });
    files.set(reference.id, file);
  }
  const restartLinkage = files.get("operational_restart_linkage")?.document;
  if (
    restartLinkage?.schemaVersion !== "m1_b_operational_restart_linkage.v2" ||
    restartLinkage.candidateReleaseId !== candidateReleaseId ||
    restartLinkage.sourceTreeHash !== sourceTreeHash ||
    restartLinkage.runtimeImageId !== runtimeImageId ||
    restartLinkage.databaseStartedAt !== databaseStartedAt
  ) fail(
    "operational_restart_linkage_invalid",
    "The pre-Risk collection does not contain its exact restart linkage."
  );
  const receiptBytes = await readFile(receiptPath);
  return Object.freeze({
    receipt,
    receiptReference: Object.freeze({
      id: "operational_pre_risk_collection",
      kind: "runtime_receipt",
      relativePath: relative(ROOT, receiptPath),
      sha256: sha256(receiptBytes)
    }),
    files,
    artifactReferences: Object.freeze(receipt.boundArtifacts)
  });
}

export function createM1BOperationalClosureDocument({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  preRiskReceiptArtifact,
  preRiskCompletedAt,
  riskArtifact,
  riskCapturedAt,
  completedAt
}) {
  for (const timestamp of [
    databaseStartedAt,
    preRiskCompletedAt,
    riskCapturedAt,
    completedAt
  ]) iso(timestamp, "operational_closure_invalid");
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    !exactKeys(preRiskReceiptArtifact, ["id", "kind", "relativePath", "sha256"]) ||
    preRiskReceiptArtifact.id !== "operational_pre_risk_collection" ||
    preRiskReceiptArtifact.kind !== "runtime_receipt" ||
    !exactKeys(riskArtifact, ["id", "kind", "relativePath", "sha256"]) ||
    riskArtifact.id !== "risk_critical" ||
    riskArtifact.kind !== "negative_receipt" ||
    Date.parse(preRiskCompletedAt) >= Date.parse(riskCapturedAt) ||
    Date.parse(riskCapturedAt) >= Date.parse(completedAt)
  ) fail(
    "operational_closure_invalid",
    "Operational closure does not prove pre-Risk collection, Risk-last ordering, and final completion."
  );
  return Object.freeze({
    schemaVersion: "m1_b_operational_closure.v2",
    status: "passed",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    sourceRuntime: "local_exact_commit",
    databaseStartedAt,
    preRiskReceiptArtifact: Object.freeze({
      id: preRiskReceiptArtifact.id,
      sha256: preRiskReceiptArtifact.sha256
    }),
    riskArtifact: Object.freeze({
      id: riskArtifact.id,
      sha256: riskArtifact.sha256
    }),
    preRiskCompletedAt,
    riskCapturedAt,
    completedAt,
    riskCollectedLast: true,
    deploymentStatus: "deployment_pending",
    productionHostingClaim: false,
    productionFundsMoved: false,
    deploymentAuthorized: false,
    fixtureUsed: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    })
  });
}

function canonicalEvidenceArtifact(reference) {
  return Object.freeze({
    id: reference.id,
    kind: reference.kind,
    relativePath: reference.relativePath,
    sha256: reference.sha256,
    sourceRuntime: "local_exact_commit",
    redacted: true,
    containsSecrets: false,
    containsRawPii: false,
    containsSessionMaterial: false,
    fixtureGenerated: false
  });
}

export function createM1BCanonicalOperationalAcceptanceEvidence({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  portBase,
  capturedAt,
  criticalDocuments,
  preRiskEvidence,
  riskArtifact,
  closureArtifact
}) {
  iso(capturedAt, "operational_canonical_evidence_invalid");
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    !Number.isSafeInteger(portBase) || portBase < 1_024 || portBase > 65_532 ||
    !preRiskEvidence?.receipt ||
    !(preRiskEvidence.files instanceof Map) ||
    !criticalDocuments?.risk_critical
  ) fail(
    "operational_canonical_evidence_invalid",
    "Canonical Evidence is missing the exact candidate, critical, or pre-Risk inputs."
  );
  const references = [
    ...preRiskEvidence.artifactReferences,
    preRiskEvidence.receiptReference,
    riskArtifact,
    closureArtifact
  ];
  assertM1BCanonicalOperationalArtifactSet({
    candidateReleaseId,
    references
  });
  if (
    new Set(references.map(({ relativePath }) => relativePath)).size !==
      references.length
  ) fail(
    "operational_canonical_evidence_invalid",
    "Canonical Evidence artifact paths must remain unique."
  );
  const byId = new Map(references.map((reference) => [reference.id, reference]));
  const document = (id, schemaVersion) => {
    const value = preRiskEvidence.files.get(id)?.document;
    if (!value || value.schemaVersion !== schemaVersion) fail(
      "operational_canonical_evidence_invalid",
      `Canonical Evidence is missing ${id} (${schemaVersion}).`
    );
    return value;
  };
  const agentBefore = criticalDocuments.agent_before;
  const agentAfter = criticalDocuments.agent_after;
  const human = criticalDocuments.human_critical;
  const capitalPartner = criticalDocuments.capital_partner_critical;
  const risk = criticalDocuments.risk_critical;
  const restartLinkage = document(
    "operational_restart_linkage",
    "m1_b_operational_restart_linkage.v2"
  );
  const browserDrivers = new Set();
  const localMatrix = [];
  for (const role of M1_B_OPERATIONAL_ROLES) {
    for (const check of M1_B_OPERATIONAL_BROWSER_CHECKS) {
      const auditId = artifactId("browser", role, `${check}_audit`);
      const runtimeId = artifactId("browser", role, `${check}_runtime`);
      const screenshotIds = M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[check]
        .map((phase) => artifactId(
          "browser",
          role,
          `${check}_${browserPhaseArtifactToken(phase)}_shot`
        ));
      const audit = document(auditId, "m1_b_browser_row_audit.v2");
      const runtime = document(runtimeId, "m1_b_browser_row_runtime_receipt.v2");
      if (
        audit.role !== role || audit.check !== check ||
        runtime.role !== role || runtime.check !== check ||
        audit.runtimeArtifact?.id !== runtimeId ||
        runtime.browserAuditArtifactId !== auditId ||
        canonicalJson(audit.visualArtifacts?.map(({ id }) => id)) !==
          canonicalJson(screenshotIds) ||
        canonicalJson(runtime.visualArtifacts?.map(({ id }) => id)) !==
          canonicalJson(screenshotIds)
      ) fail(
        "operational_canonical_evidence_invalid",
        `Browser row ${role}:${check} is not reciprocally artifact-bound.`
      );
      browserDrivers.add(audit.driver);
      const artifactIds = [auditId, ...screenshotIds, runtimeId];
      if (audit.negativeCaseArtifact !== null) {
        artifactIds.push(audit.negativeCaseArtifact.id);
      }
      localMatrix.push(Object.freeze({
        role,
        check,
        status: "passed",
        artifactIds: Object.freeze(artifactIds)
      }));
    }
  }
  if (browserDrivers.size !== 1) fail(
    "operational_canonical_evidence_invalid",
    "The canonical browser matrix must use one measured real-browser driver."
  );
  const journeys = Object.freeze(Object.fromEntries(
    M1_B_OPERATIONAL_ROLES.map((role) => {
      const receiptId = artifactId("journey", role, "receipt");
      const receipt = document(receiptId, "m1_b_journey_receipt.v2");
      if (receipt.role !== role || receipt.steps.length !==
        M1_B_OPERATIONAL_JOURNEY_STEPS[role].length) fail(
        "operational_canonical_evidence_invalid",
        `Journey receipt ${role} is incomplete.`
      );
      return [role, Object.freeze(receipt.steps.map((step, index) => {
        if (step.id !== M1_B_OPERATIONAL_JOURNEY_STEPS[role][index]) fail(
          "operational_canonical_evidence_invalid",
          `Journey receipt ${role}:${step.id} is out of order.`
        );
        const artifactIds = [
          receiptId,
          ...step.binding.sourceBindings.map(({ sourceArtifact }) =>
            sourceArtifact.id
          )
        ];
        return Object.freeze({
          id: step.id,
          status: "passed",
          transport: step.transport,
          canonicalPersistence: "postgresql",
          fixtureUsed: false,
          artifactIds: Object.freeze([...new Set(artifactIds)])
        });
      }))];
    })
  ));
  const negativeCases = Object.freeze(Object.fromEntries(
    Object.entries(M1_B_OPERATIONAL_NEGATIVE_CASES).map(([group, ids]) => [
      group,
      Object.freeze(ids.map((id) => {
        const artifact = artifactId("negative", group, id);
        const receipt = document(artifact, "m1_b_negative_case_receipt.v2");
        const artifactIds = [artifact, receipt.sourceProofArtifact.id];
        for (const binding of [
          receipt.liveAttemptArtifact,
          receipt.exactSourceExecutionArtifact,
          receipt.tapArtifact
        ]) {
          if (binding !== null) artifactIds.push(binding.id);
        }
        return Object.freeze({
          id,
          status: receipt.status,
          additionalEffectCount: 0,
          nonEnumerating: receipt.nonEnumerating,
          artifactIds: Object.freeze([...new Set(artifactIds)])
        });
      }))
    ])
  ));
  const readCheck = risk.liveRuntimeObservation?.checks?.find(
    ({ kind }) => kind === "query"
  );
  const mutationCheck = risk.liveRuntimeObservation?.checks?.find(
    ({ kind }) => kind === "command"
  );
  if (!readCheck || !mutationCheck) fail(
    "operational_canonical_evidence_invalid",
    "Risk boundary is missing the exact protected read and mutation observations."
  );
  const currentOffer = capitalPartner.currentLineage;
  const withdrawalOffer = capitalPartner.withdrawalLineage;
  const evidence = Object.freeze({
    schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v2",
    status: "passed",
    capturedAt,
    source: Object.freeze({
      commitSha: candidateReleaseId,
      treeSha: sourceTreeHash,
      sourceMaterialization: "tracked_git_archive",
      untrackedInputIncluded: false,
      trackedWorktreeClean: true,
      headMatchesCommit: true
    }),
    runtime: Object.freeze({
      canonicalProductTruth: "tenant_protocol_gateway_shared_kernel_postgresql",
      local: Object.freeze({
        status: "passed",
        releaseId: candidateReleaseId,
        imageRevision: candidateReleaseId,
        pilotRevision: candidateReleaseId,
        workerRevision: candidateReleaseId,
        portBase,
        postgresBacked: true,
        fixtureHost: false,
        releaseIdentityArtifactId: "release_identity",
        beforeRestartAcceptance: "passed",
        afterRestartAcceptance: "passed",
        agentAcceptance: Object.freeze({
          schemaVersion: "local_agent_release_acceptance_linkage.v1",
          status: "passed",
          candidateReleaseId,
          candidateMarker: agentBefore.candidateMarker,
          accountHash: agentBefore.accountHash,
          subjectId: agentBefore.subjectId,
          mandateId: agentBefore.mandateId,
          creditIntentId: agentBefore.creditIntentId,
          creditOfferId: agentBefore.creditOfferId,
          obligationId: agentBefore.obligationId,
          facilityId: agentAfter.facilityId,
          creditLineId: agentAfter.creditLineId,
          beforeRestart: Object.freeze({
            acceptanceMode: "before_restart_executed",
            databaseStartedAt: restartLinkage.beforeDatabaseStartedAt,
            acceptanceArtifactId: "agent_before",
            applicationMcpArtifactId: "agent_application_mcp",
            runtimeMcpArtifactId: "agent_runtime_mcp"
          }),
          afterRestart: Object.freeze({
            acceptanceMode: "after_restart_recovered",
            databaseStartedAt: restartLinkage.afterDatabaseStartedAt,
            acceptanceArtifactId: "agent_after",
            recoveryReceiptArtifactId: "agent_recovery_receipt"
          })
        }),
        humanAcceptance: Object.freeze({
          schemaVersion: "local_human_release_acceptance_linkage.v1",
          status: "passed",
          candidateReleaseId,
          databaseStartedAt: human.databaseStartedAt,
          subjectId: human.linkage.subjectId,
          consentId: human.linkage.consentId,
          creditIntentId: human.linkage.creditIntentId,
          riskDecisionId: human.linkage.riskDecisionId,
          creditOfferId: human.linkage.creditOfferId,
          creditOfferHash: human.linkage.creditOfferHash,
          termsHash: human.linkage.termsHash,
          offerAggregateVersion: human.linkage.offerAggregateVersion,
          creditOfferAcceptanceId: human.linkage.creditOfferAcceptanceId,
          obligationId: human.linkage.obligationId,
          repaymentId: human.linkage.repaymentId,
          artifactId: "human_critical"
        }),
        capitalPartnerAcceptance: Object.freeze({
          schemaVersion: "local_capital_partner_release_acceptance_linkage.v1",
          status: "passed",
          candidateReleaseId,
          databaseStartedAt: capitalPartner.databaseStartedAt,
          capitalPartnerId: capitalPartner.profile.capitalPartnerId,
          currentLineage: Object.freeze({
            creditIntentId: currentOffer.authoredOffer.creditIntentId,
            creditPassportArtifactId:
              currentOffer.authoredOffer.creditPassportArtifactId,
            preliminaryOfferId: currentOffer.preliminaryOffer.creditOfferId,
            currentOfferId: currentOffer.authoredOffer.creditOfferId,
            currentOfferHash: currentOffer.authoredOffer.creditOfferHash,
            currentTermsHash: currentOffer.authoredOffer.termsHash,
            currentOfferAggregateVersion: currentOffer.authoredOffer.aggregateVersion
          }),
          withdrawalLineage: Object.freeze({
            creditIntentId: withdrawalOffer.authoredOffer.creditIntentId,
            creditPassportArtifactId:
              withdrawalOffer.authoredOffer.creditPassportArtifactId,
            withdrawnOfferId: withdrawalOffer.authoredOffer.creditOfferId
          }),
          artifactId: "capital_partner_critical"
        }),
        origins: Object.freeze({
          human: expectedLocalOrigin("human", portBase),
          principal_agent: expectedLocalOrigin("principal_agent", portBase),
          capital_partner: expectedLocalOrigin("capital_partner", portBase),
          risk_operations: `http://127.0.0.1:${portBase + 2}/`
        })
      }),
      hosted: Object.freeze({
        status: "deployment_pending",
        releaseId: null,
        productProfile: "deployable_sandbox_vertical_slice",
        postgresBacked: false,
        fixtureHost: false,
        surfaces: Object.freeze([])
      })
    }),
    browser: Object.freeze({
      driver: [...browserDrivers][0],
      realBrowser: true,
      humanRoleAuthentication: "operator_confirmed_invited_wallet_siwe",
      authenticationBypassUsed: false,
      browserStorageAuthority: false,
      consoleErrors: 0,
      networkErrors: 0,
      localMatrix: Object.freeze(localMatrix),
      hostedMatrix: Object.freeze([])
    }),
    journeys,
    negativeCases,
    riskBoundary: Object.freeze({
      schemaVersion: "m1_b_risk_boundary_linkage.v1",
      status: "passed_fail_closed",
      releaseLevel: "L1_PUBLIC_SANDBOX",
      candidateReleaseId,
      surfaceDisposition: "private_unavailable",
      hostedSurfaceDeployed: false,
      strongMfaTopologyComposed: false,
      siweOnlySessionObserved:
        risk.liveRuntimeObservation.session?.method === "siwe",
      requiresRecentMfaPolicyPreserved:
        risk.policy.requiresRecentMfaActorTypesPreserved,
      weakAuthFallbackAvailable:
        risk.exposure.nonSiweActiveRiskCredentialCount !== 0,
      weakAuthFallbackUsed: false,
      protectedReadDecision: readCheck.authorizationDecision,
      protectedMutationDecision: mutationCheck.authorizationDecision,
      denialReasonCode: readCheck.reasonCode,
      privilegedMutationCount: risk.protectedState.privilegedMutationCount,
      postRestartFailClosed: risk.postRestartVerification,
      deferredGate: "M1_C_L2_CLOSED_NO_FUNDS",
      artifactId: "risk_critical"
    }),
    restart: Object.freeze({
      databaseRetained: true,
      pilotRestarted: true,
      workerRestarted: true,
      humanRecovered: true,
      agentRecovered: true,
      capitalPartnerRecovered: true,
      riskFailClosedAfterRestart: true,
      outboxDuplicateEffects: 0,
      artifactIds: Object.freeze([
        "operational_restart_pending",
        "operational_restart",
        "operational_restart_linkage",
        "agent_before_phase",
        "agent_after_phase",
        "agent_before",
        "agent_after",
        "agent_recovery_receipt",
        artifactId("browser", "human", "restart_recovery_runtime"),
        artifactId("browser", "principal_agent", "restart_recovery_runtime"),
        artifactId("browser", "capital_partner", "restart_recovery_runtime"),
        "risk_critical"
      ])
    }),
    authority: Object.freeze({
      realFundsEnabled: false,
      externalFundsMovementEnabled: false,
      productionSignerAuthorityEnabled: false,
      arbitraryWithdrawalEnabled: false,
      venueWriteAuthorityEnabled: false,
      realHumanLendingEnabled: false,
      mainnetEnabled: false,
      protocolFeesEnabled: false,
      browserCredentialCaptureEnabled: false
    }),
    artifacts: Object.freeze(references.map(canonicalEvidenceArtifact))
  });
  if (
    !byId.has("agent_recovery_receipt") ||
    !byId.has("operational_pre_risk_collection") ||
    !byId.has("risk_critical") ||
    !byId.has("operational_closure")
  ) fail(
    "operational_canonical_evidence_invalid",
    "Canonical Evidence is missing its recovery, pre-Risk, Risk, or closure artifact."
  );
  return evidence;
}

export async function validateM1BOperationalLiveAttemptReceipt(
  attemptReceipt,
  {
    context,
    negativeProof,
    availableArtifacts
  }
) {
  const attemptKeys = [
    "schemaVersion", "fixtureUsed", "productionEvidenceEligible",
    "candidateReleaseId", "sourceTreeHash", "runtimeImageId", "group", "id",
    "databaseStartedAt", "capturedAt", "supportingArtifacts",
    "requestProjection", "requestProjectionHash", "outwardResponse",
    "outwardResponseHash", "authorizationAudit", "protectedStateCatalogVersion",
    "protectedStateBeforeHash", "protectedStateAfterHash", "baselineEffects",
    "finalEffects", "baselineCapturedAt", "auditOccurredAt", "outwardCapturedAt",
    "verificationCapturedAt", "negativeProofHash"
  ];
  const caseContract = {
    "human:expired_offer": {
      operationId: "pilotAcceptCreditOffer",
      resourceType: "credit_offer",
      reasonCode: "live_policy_rejected",
      protectedStateCatalogVersion: "m1_b_operational_offer_protected_state.v2"
    },
    "human:unauthorized_subject": {
      operationId: "pilotAcceptCreditOffer",
      resourceType: "credit_offer",
      reasonCode: "resource_access_denied",
      protectedStateCatalogVersion: "m1_b_operational_offer_protected_state.v2"
    },
    "authorization:cross_role_private_read": {
      operationId: "pilotReadOwnObligation",
      resourceType: "obligation",
      reasonCode: "actor_capability_rejected",
      protectedStateCatalogVersion:
        "m1_b_operational_obligation_protected_state.v2"
    }
  }[`${context?.group}:${context?.id}`];
  if (
    !caseContract ||
    !exactKeys(attemptReceipt, attemptKeys) ||
    attemptReceipt.schemaVersion !== "m1_b_operational_live_attempt_receipt.v2" ||
    attemptReceipt.fixtureUsed !== false ||
    attemptReceipt.productionEvidenceEligible !== true ||
    attemptReceipt.candidateReleaseId !== context.candidateReleaseId ||
    attemptReceipt.sourceTreeHash !== context.sourceTreeHash ||
    attemptReceipt.runtimeImageId !== context.runtimeImageId ||
    attemptReceipt.group !== context.group ||
    attemptReceipt.id !== context.id ||
    attemptReceipt.databaseStartedAt !== context.databaseStartedAt ||
    canonicalJson(attemptReceipt.supportingArtifacts) !==
      canonicalJson(context.supportingArtifacts) ||
    attemptReceipt.negativeProofHash !== manifestHash(negativeProof)
  ) fail(
    "operational_live_negative_output_invalid",
    "The exact-image live-negative attempt/proof envelope is invalid."
  );
  const proof = await validateM1BOperationalNegativeProof(negativeProof, {
    candidateReleaseId: context.candidateReleaseId,
    sourceTreeHash: context.sourceTreeHash,
    runtimeImageId: context.runtimeImageId,
    databaseStartedAt: context.databaseStartedAt,
    availableArtifacts
  });
  const request = attemptReceipt.requestProjection;
  const response = attemptReceipt.outwardResponse;
  const audit = attemptReceipt.authorizationAudit;
  const effectKeys = [
    "repositoryIdempotencyKeyHash", "commandIdempotencyCount",
    "commandEventCount", "executionCount", "businessEventCount"
  ];
  try {
    assertTenantProtocolRequest(request);
  } catch {
    fail(
      "operational_live_negative_output_invalid",
      "The live attempt request projection violates the exact protocol contract."
    );
  }
  const query = caseContract.operationId === "pilotReadOwnObligation";
  const times = [
    attemptReceipt.databaseStartedAt,
    attemptReceipt.baselineCapturedAt,
    attemptReceipt.auditOccurredAt,
    attemptReceipt.outwardCapturedAt,
    attemptReceipt.verificationCapturedAt
  ].map((value) => Date.parse(iso(value, "operational_live_negative_output_invalid")));
  if (
    !exactKeys(response, ["status", "code", "requestId", "schemaVersion"]) ||
    response.schemaVersion !== "problem_details.v1" ||
    response.status !== 404 ||
    response.code !== "authorization_denied" ||
    response.requestId !== request.requestId ||
    !exactKeys(audit, [
      "eventId", "requestId", "correlationId", "operationId",
      "authorizationDecision", "reasonCode", "occurredAt"
    ]) ||
    !IDENTIFIER.test(audit.eventId ?? "") ||
    audit.requestId !== request.requestId ||
    audit.correlationId !== request.correlationId ||
    audit.operationId !== caseContract.operationId ||
    audit.authorizationDecision !== "deny" ||
    audit.reasonCode !== caseContract.reasonCode ||
    audit.occurredAt !== attemptReceipt.auditOccurredAt ||
    request.operationId !== caseContract.operationId ||
    request.resource?.resourceType !== caseContract.resourceType ||
    (context.resourceType !== undefined &&
      request.resource.resourceType !== context.resourceType) ||
    (context.resourceId !== undefined && request.resource.resourceId !== context.resourceId) ||
    request.requestId !== proof.requestId ||
    request.correlationId !== proof.correlationId ||
    attemptReceipt.requestProjectionHash !== manifestHash(request) ||
    attemptReceipt.outwardResponseHash !== manifestHash(response) ||
    attemptReceipt.outwardResponseHash !== proof.outwardResponseHash ||
    response.status !== proof.outwardStatus ||
    response.code !== proof.outwardCode ||
    audit.eventId !== proof.authorizationAuditEventId ||
    audit.authorizationDecision !== proof.authorizationDecision ||
    audit.reasonCode !== proof.authorizationReasonCode ||
    attemptReceipt.protectedStateBeforeHash !== proof.protectedStateBeforeHash ||
    attemptReceipt.protectedStateAfterHash !== proof.protectedStateAfterHash ||
    attemptReceipt.protectedStateBeforeHash !== attemptReceipt.protectedStateAfterHash ||
    !/^0x[0-9a-f]{64}$/.test(attemptReceipt.protectedStateBeforeHash ?? "") ||
    attemptReceipt.protectedStateCatalogVersion !==
      caseContract.protectedStateCatalogVersion ||
    !exactKeys(attemptReceipt.baselineEffects, effectKeys) ||
    !exactKeys(attemptReceipt.finalEffects, effectKeys) ||
    canonicalJson(attemptReceipt.baselineEffects) !==
      canonicalJson(attemptReceipt.finalEffects) ||
    effectKeys.filter((key) => key.endsWith("Count")).some((key) =>
      attemptReceipt.baselineEffects[key] !== 0
    ) ||
    (query
      ? attemptReceipt.baselineEffects.repositoryIdempotencyKeyHash !== null
      : !/^0x[0-9a-f]{64}$/.test(
          attemptReceipt.baselineEffects.repositoryIdempotencyKeyHash ?? ""
        )) ||
    proof.sourceEvidence.operationId !== caseContract.operationId ||
    canonicalJson(proof.sourceEvidence.supportingArtifacts) !==
      canonicalJson(attemptReceipt.supportingArtifacts) ||
    proof.capturedAt !== attemptReceipt.capturedAt ||
    proof.capturedAt !== attemptReceipt.verificationCapturedAt ||
    proof.additionalEffectCount !== 0 ||
    times.some((value) => !Number.isFinite(value)) ||
    times.some((value, index) => index > 0 && value < times[index - 1])
  ) fail(
    "operational_live_negative_output_invalid",
    "The live attempt does not reconstruct one exact request, denial audit, and zero-effect boundary."
  );
  return attemptReceipt;
}

export async function createM1BOperationalLiveNegativeDocuments({
  result,
  context,
  outputRoot,
  availableArtifacts
}) {
  if (
    !exactKeys(result, [
      "schemaVersion",
      "status",
      "attemptReceipt",
      "negativeProof"
    ]) ||
    result.schemaVersion !== "m1_b_operational_live_negative_cli_result.v1" ||
    result.status !== "live_negative_captured" ||
    !result.attemptReceipt || !result.negativeProof
  ) fail(
    "operational_live_negative_output_invalid",
    "The exact-image live-negative attempt/proof envelope is invalid."
  );
  await validateM1BOperationalLiveAttemptReceipt(result.attemptReceipt, {
    context,
    negativeProof: result.negativeProof,
    availableArtifacts
  });
  const proof = result.negativeProof;
  const attemptId = artifactId(
    "negative_live_attempt",
    context.group,
    context.id
  );
  const proofId = artifactId(
    "negative_live_source_proof",
    context.group,
    context.id
  );
  const attemptRelativePath = relative(
    ROOT,
    resolve(
      outputRoot,
      `${context.candidateReleaseId}.negative-live-attempt.${context.group}.${context.id}.json`
    )
  );
  const proofRelativePath = relative(
    ROOT,
    resolve(
      outputRoot,
      `${context.candidateReleaseId}.negative-live-source-proof.${context.group}.${context.id}.json`
    )
  );
  const attemptBytes = jsonBytes(result.attemptReceipt);
  const proofBytes = jsonBytes(proof);
  const documents = Object.freeze([
    Object.freeze({
      id: attemptId,
      kind: "negative_receipt",
      relativePath: attemptRelativePath,
      document: result.attemptReceipt,
      bytes: attemptBytes
    }),
    Object.freeze({
      id: proofId,
      kind: "negative_source_proof",
      relativePath: proofRelativePath,
      document: proof,
      bytes: proofBytes
    })
  ]);
  return Object.freeze({
    documents,
    proof,
    references: Object.freeze(documents.map((entry) => Object.freeze({
      id: entry.id,
      kind: entry.kind,
      relativePath: entry.relativePath,
      sha256: sha256(entry.bytes)
    })))
  });
}

async function readM1BAgentPhaseReceipt(path, {
  candidateReleaseId,
  runtimeImageId,
  acceptancePhase,
  databaseStartedAt,
  acceptancePath
}) {
  const document = validateM1BAgentPhaseReceipt(
    await privateJson(path, `Agent ${acceptancePhase} phase receipt`),
    { candidateReleaseId, runtimeImageId, acceptancePhase, databaseStartedAt }
  );
  const bindings = [document.acceptanceArtifact, ...document.extractedArtifacts];
  if (
    acceptancePath !== undefined &&
    resolve(ROOT, document.acceptanceArtifact.relativePath) !== resolve(acceptancePath)
  ) fail(
    "operational_agent_phase_invalid",
    `Agent ${acceptancePhase} phase receipt points to the wrong acceptance artifact.`
  );
  for (const binding of bindings) {
    const artifactPath = resolve(ROOT, binding.relativePath);
    const relation = relative(ROOT, artifactPath);
    if (
      relation === "" || relation.startsWith("..") || isAbsolute(relation) ||
      sha256(await readFile(artifactPath)) !== binding.sha256
    ) fail(
      "operational_agent_phase_invalid",
      `Agent ${acceptancePhase} phase artifact ${binding.id} is not digest-bound.`
    );
  }
  return Object.freeze({
    path,
    document,
    sha256: sha256(await readFile(path))
  });
}

export function validateM1BAgentAcceptanceChronology({
  beforePhase,
  restart,
  afterPhase,
  humanCapturedAt,
  capitalPartnerCapturedAt,
  riskCapturedAt
}) {
  const times = Object.fromEntries(Object.entries({
    beforeCompletedAt: beforePhase?.completedAt,
    restartBeganAt: restart?.eventWindow?.engineBeforeAt,
    restartCompletedAt: restart?.eventWindow?.engineAfterAt,
    afterStartedAt: afterPhase?.startedAt,
    afterCompletedAt: afterPhase?.completedAt,
    humanCapturedAt,
    capitalPartnerCapturedAt,
    riskCapturedAt
  }).map(([key, value]) => [key, Date.parse(value ?? "")]));
  const humanCapitalFirst = Math.min(times.humanCapturedAt, times.capitalPartnerCapturedAt);
  const humanCapitalLast = Math.max(times.humanCapturedAt, times.capitalPartnerCapturedAt);
  if (
    Object.values(times).some((value) => !Number.isFinite(value)) ||
    times.beforeCompletedAt >= times.restartBeganAt ||
    times.restartBeganAt >= times.restartCompletedAt ||
    times.restartCompletedAt >= times.afterStartedAt ||
    times.afterStartedAt >= times.afterCompletedAt ||
    times.afterCompletedAt >= humanCapitalFirst ||
    humanCapitalLast >= times.riskCapturedAt
  ) fail(
    "operational_agent_phase_invalid",
    "Agent, restart, Human/Capital Partner, and Risk chronology is invalid."
  );
  return Object.freeze(times);
}

async function criticalArtifacts(
  candidateReleaseId,
  databaseStartedAt,
  runtimeImageId,
  restart,
  outputRoot
) {
  const paths = Object.freeze({
    release_identity: resolve(outputRoot, `${candidateReleaseId}.local-release-identity.json`),
    agent_before: resolve(AGENT_DIRECTORY, `${candidateReleaseId}.before-restart.acceptance.json`),
    agent_after: resolve(AGENT_DIRECTORY, `${candidateReleaseId}.after-restart.acceptance.json`),
    human_critical: resolve(outputRoot, `${candidateReleaseId}.human-critical-receipt.json`),
    capital_partner_critical: resolve(outputRoot, `${candidateReleaseId}.capital-partner-critical-receipt.json`),
    risk_critical: resolve(outputRoot, `${candidateReleaseId}.risk-mfa-boundary.json`)
  });
  const documents = Object.fromEntries(await Promise.all(
    Object.entries(paths).map(async ([id, path]) => [id, await privateJson(path, id)])
  ));
  const phasePaths = Object.freeze({
    agent_before_phase: resolve(
      AGENT_DIRECTORY,
      `${candidateReleaseId}.before-restart.phase-receipt.v2.json`
    ),
    agent_after_phase: resolve(
      AGENT_DIRECTORY,
      `${candidateReleaseId}.after-restart.phase-receipt.v2.json`
    )
  });
  const [beforePhase, afterPhase] = await Promise.all([
    readM1BAgentPhaseReceipt(phasePaths.agent_before_phase, {
      candidateReleaseId,
      runtimeImageId,
      acceptancePhase: "before_restart",
      databaseStartedAt: restart.beforeDatabaseStartedAt,
      acceptancePath: paths.agent_before
    }),
    readM1BAgentPhaseReceipt(phasePaths.agent_after_phase, {
      candidateReleaseId,
      runtimeImageId,
      acceptancePhase: "after_restart",
      databaseStartedAt,
      acceptancePath: paths.agent_after
    })
  ]);
  if (
    documents.release_identity.releaseId !== candidateReleaseId ||
    documents.agent_before.candidateReleaseId !== candidateReleaseId ||
    documents.agent_before.acceptancePhase !== "before_restart" ||
    documents.agent_after.candidateReleaseId !== candidateReleaseId ||
    documents.agent_after.acceptancePhase !== "after_restart" ||
    documents.agent_after.databaseStartedAt !== databaseStartedAt ||
    documents.human_critical.candidateReleaseId !== candidateReleaseId ||
    documents.human_critical.databaseStartedAt !== databaseStartedAt ||
    documents.capital_partner_critical.candidateReleaseId !== candidateReleaseId ||
    documents.capital_partner_critical.databaseStartedAt !== databaseStartedAt ||
    documents.risk_critical.candidateReleaseId !== candidateReleaseId ||
    documents.risk_critical.databaseStartedAt !== databaseStartedAt
  ) fail("operational_critical_artifact_invalid", "Critical artifacts do not bind the exact candidate restart.");
  if (
    beforePhase.document.acceptanceArtifact.sha256 !== sha256(await readFile(paths.agent_before)) ||
    afterPhase.document.acceptanceArtifact.sha256 !== sha256(await readFile(paths.agent_after))
  ) fail("operational_agent_phase_invalid", "Agent phase receipt acceptance digest is invalid.");
  validateM1BAgentAcceptanceChronology({
    beforePhase: beforePhase.document,
    restart,
    afterPhase: afterPhase.document,
    humanCapturedAt: documents.human_critical.capturedAt,
    capitalPartnerCapturedAt: documents.capital_partner_critical.capturedAt,
    riskCapturedAt: documents.risk_critical.capturedAt
  });
  if (!IDENTIFIER.test(documents.agent_before.mandateId ?? "")) {
    fail("operational_critical_artifact_invalid", "Agent workflow key cannot be derived.");
  }
  const workflowKey = sha256(documents.agent_before.mandateId).slice(0, 24);
  const agentPrefix = `m1-b-${candidateReleaseId}.before_restart.${workflowKey}`;
  const supportingPaths = Object.freeze({
    agent_application_mcp: resolve(
      AGENT_DIRECTORY,
      `${agentPrefix}.offer-receipt.json`
    ),
    agent_runtime_mcp: resolve(
      AGENT_DIRECTORY,
      `${agentPrefix}.mcp-receipt.json`
    ),
    agent_foreign_offer_setup: resolve(
      AGENT_DIRECTORY,
      `${candidateReleaseId}.agent-foreign-offer-setup.receipt.v1.json`
    )
  });
  const supportingDocuments = Object.fromEntries(await Promise.all(
    Object.entries(supportingPaths).map(async ([id, path]) => [id, await privateJson(path, id)])
  ));
  supportingDocuments.agent_foreign_offer_setup =
    validateM1BAgentForeignOfferSetupReceipt(
      supportingDocuments.agent_foreign_offer_setup,
      { candidateReleaseId, runtimeImageId }
    );
  const foreignSetup = supportingDocuments.agent_foreign_offer_setup;
  const recoveryReceiptBinding = afterPhase.document.extractedArtifacts.find(
    ({ id }) => id === "recovery_receipt"
  );
  if (!recoveryReceiptBinding) fail(
    "operational_agent_phase_invalid",
    "Agent after-restart phase is missing the recovery receipt binding."
  );
  const foreignSetupArtifact = Object.freeze({
    id: "agent_foreign_offer_setup",
    relativePath: relative(ROOT, supportingPaths.agent_foreign_offer_setup),
    sha256: sha256(await readFile(supportingPaths.agent_foreign_offer_setup)),
    completedAt: foreignSetup.createdBeforeRestartAt
  });
  const postRestartForeign = documents.agent_after.foreignOfferSetupReconciliation;
  if (
    canonicalJson(supportingDocuments.agent_application_mcp) !==
      canonicalJson(documents.agent_before.offerReceipt) ||
    canonicalJson(supportingDocuments.agent_runtime_mcp) !==
      canonicalJson(documents.agent_before.lifecycle?.mcpReceipt) ||
    foreignSetup.databaseStartedAt !== restart.beforeDatabaseStartedAt ||
    canonicalJson(documents.agent_before.foreignOfferSetupArtifact) !==
      canonicalJson(foreignSetupArtifact) ||
    canonicalJson(documents.agent_after.foreignOfferSetupArtifact) !==
      canonicalJson(foreignSetupArtifact) ||
    canonicalJson(beforePhase.document.foreignOfferSetupArtifact) !==
      canonicalJson(foreignSetupArtifact) ||
    canonicalJson(afterPhase.document.foreignOfferSetupArtifact) !==
      canonicalJson(foreignSetupArtifact) ||
    postRestartForeign?.schemaVersion !==
      "m1_b_agent_foreign_offer_reconciliation.v1" ||
    postRestartForeign.databaseStartedAt !== databaseStartedAt ||
    canonicalJson(postRestartForeign.references) !==
      canonicalJson(foreignSetup.references) ||
    canonicalJson(postRestartForeign.ownershipProof) !==
      canonicalJson(foreignSetup.ownershipProof) ||
    canonicalJson(postRestartForeign.offer) !== canonicalJson(foreignSetup.offer) ||
    canonicalJson(postRestartForeign.lifecycleAbsence) !==
      canonicalJson(foreignSetup.lifecycleAbsence)
  ) fail(
    "operational_critical_artifact_invalid",
    "Supporting Agent MCP or foreign offered-v1 receipt does not match retained restart truth."
  );
  const kind = {
    release_identity: "release_identity",
    agent_before: "runtime_receipt",
    agent_after: "runtime_receipt",
    human_critical: "postgres_receipt",
    capital_partner_critical: "postgres_receipt",
    risk_critical: "negative_receipt"
  };
  return {
    references: await Promise.all(Object.entries(paths).map(async ([id, path]) => ({
      id,
      kind: kind[id],
      relativePath: relative(ROOT, path),
      sha256: sha256(await readFile(path))
    }))),
    supportingReferences: [
      ...await Promise.all(
      [...Object.entries(supportingPaths), ...Object.entries(phasePaths)].map(async ([id, path]) => ({
        id,
        kind: id === "agent_foreign_offer_setup"
          ? "postgres_receipt"
          : id.endsWith("_phase")
            ? "runtime_receipt"
            : "agent_mcp_receipt",
        relativePath: relative(ROOT, path),
        sha256: sha256(await readFile(path))
      }))),
      Object.freeze({
        id: "agent_recovery_receipt",
        kind: "runtime_receipt",
        relativePath: recoveryReceiptBinding.relativePath,
        sha256: recoveryReceiptBinding.sha256
      })
    ],
    documents,
    supportingDocuments: Object.freeze({
      ...supportingDocuments,
      agent_before_phase: beforePhase.document,
      agent_after_phase: afterPhase.document
    }),
    phaseReceipts: Object.freeze({ before: beforePhase, after: afterPhase }),
    paths
  };
}

export function validateM1BOperationalPreRiskChronology({
  restart,
  afterPhase,
  humanCapturedAt,
  capitalPartnerCapturedAt
}) {
  const times = Object.fromEntries(Object.entries({
    restartCompletedAt: restart?.eventWindow?.engineAfterAt,
    afterStartedAt: afterPhase?.startedAt,
    afterCompletedAt: afterPhase?.completedAt,
    humanCapturedAt,
    capitalPartnerCapturedAt
  }).map(([key, value]) => [key, Date.parse(value ?? "")]));
  const firstHumanCapital = Math.min(
    times.humanCapturedAt,
    times.capitalPartnerCapturedAt
  );
  if (
    Object.values(times).some((value) => !Number.isFinite(value)) ||
    times.restartCompletedAt >= times.afterStartedAt ||
    times.afterStartedAt >= times.afterCompletedAt ||
    times.afterCompletedAt >= firstHumanCapital
  ) fail(
    "operational_negative_run_order_invalid",
    "The pre-Risk negative run requires completed restart, Agent-after, and Human/Capital Partner critical Evidence in order."
  );
  return Object.freeze(times);
}

async function assertM1BOperationalArtifactAbsent(path, description) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  fail(
    "operational_negative_run_order_invalid",
    `${description} already exists; the exact-source negative run must complete before Risk Evidence.`
  );
}

function expiredOfferSetupPaths(outputRoot, candidateReleaseId) {
  return Object.freeze({
    latch: resolve(
      outputRoot,
      `${candidateReleaseId}.expired-offer-setup.safety-latch.v1.json`
    ),
    receipt: resolve(
      outputRoot,
      `${candidateReleaseId}.expired-offer-setup.receipt.v1.json`
    )
  });
}

export function createM1BExpiredOfferSetupSafetyLatch({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  armedAt,
  capitalPartnerCriticalArtifact,
  capitalPartnerCriticalCapturedAt,
  receiptRelativePath
}) {
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    !SHA256.test(capitalPartnerCriticalArtifact?.sha256 ?? "") ||
    capitalPartnerCriticalArtifact?.id !== "capital_partner_critical" ||
    typeof receiptRelativePath !== "string" ||
    isAbsolute(receiptRelativePath) ||
    receiptRelativePath.split(sep).includes("..")
  ) fail(
    "operational_expired_offer_latch_invalid",
    "The expired-Offer safety latch identity is invalid."
  );
  iso(databaseStartedAt, "operational_expired_offer_latch_invalid");
  iso(capitalPartnerCriticalCapturedAt, "operational_expired_offer_latch_invalid");
  iso(armedAt, "operational_expired_offer_latch_invalid");
  if (
    Date.parse(databaseStartedAt) >= Date.parse(capitalPartnerCriticalCapturedAt) ||
    Date.parse(capitalPartnerCriticalCapturedAt) >= Date.parse(armedAt)
  ) fail(
    "operational_expired_offer_latch_invalid",
    "The expired-Offer safety latch chronology is invalid."
  );
  const document = Object.freeze({
    schemaVersion: "m1_b_expired_offer_setup_safety_latch.v1",
    status: "armed_non_retryable",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    armedAt,
    criticalArtifact: Object.freeze({
      id: capitalPartnerCriticalArtifact.id,
      sha256: capitalPartnerCriticalArtifact.sha256,
      capturedAt: capitalPartnerCriticalCapturedAt
    }),
    receiptTarget: Object.freeze({
      id: "expired_offer_setup",
      kind: "postgres_receipt",
      relativePath: receiptRelativePath
    }),
    operationIntent: Object.freeze({
      humanPreparationOperations: EXPIRED_OFFER_SETUP_HUMAN_OPERATIONS,
      capitalPartnerOperations:
        EXPIRED_OFFER_SETUP_CAPITAL_PARTNER_OPERATIONS,
      sandboxOnly: true,
      productionFundsAuthority: false
    }),
    retryPolicy: "candidate_recut_if_receipt_not_sealed",
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false,
      containsRawSignature: false,
      containsWalletAddress: false,
      containsDatabaseCredentials: false
    })
  });
  return document;
}

export function validateM1BExpiredOfferSetupSafetyLatch(document, {
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  capitalPartnerCriticalArtifact,
  capitalPartnerCriticalCapturedAt,
  receiptRelativePath
}) {
  const expected = createM1BExpiredOfferSetupSafetyLatch({
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    armedAt: document?.armedAt,
    capitalPartnerCriticalArtifact,
    capitalPartnerCriticalCapturedAt,
    receiptRelativePath
  });
  if (canonicalJson(document) !== canonicalJson(expected)) fail(
    "operational_expired_offer_latch_invalid",
    "The expired-Offer safety latch changed or targets another receipt."
  );
  return document;
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function readM1BExpiredOfferSetupState({
  paths,
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  capitalPartnerCriticalArtifact,
  capitalPartnerCriticalCapturedAt
}) {
  const [latchExists, receiptExists] = await Promise.all([
    pathExists(paths.latch),
    pathExists(paths.receipt)
  ]);
  if (!latchExists && !receiptExists) {
    return Object.freeze({ status: "absent" });
  }
  if (latchExists !== receiptExists) fail(
    "operational_expired_offer_candidate_recut_required",
    latchExists
      ? "Expired-Offer setup was armed but its receipt was not sealed; recut the candidate without retrying."
      : "Expired-Offer setup receipt has no immutable safety latch; recut the candidate."
  );
  const receiptRelativePath = relative(ROOT, paths.receipt);
  const latch = validateM1BExpiredOfferSetupSafetyLatch(
    await privateJson(paths.latch, "expired-Offer safety latch"),
    {
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      capitalPartnerCriticalArtifact,
      capitalPartnerCriticalCapturedAt,
      receiptRelativePath
    }
  );
  const receipt = validateM1BExpiredOfferSetupReceipt(
    await privateJson(paths.receipt, "expired Offer setup receipt"),
    {
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      capitalPartnerCriticalArtifact,
      expectedFixtureUsed: false
    }
  );
  if (Date.parse(latch.armedAt) >= Date.parse(receipt.startedAt)) fail(
    "operational_expired_offer_latch_invalid",
    "The expired-Offer receipt does not follow its immutable safety latch."
  );
  return Object.freeze({ status: "sealed", latch, receipt });
}

async function preRiskCriticalArtifacts({
  candidateReleaseId,
  databaseStartedAt,
  runtimeImageId,
  restart,
  outputRoot
}) {
  const paths = Object.freeze({
    agent_after: resolve(
      AGENT_DIRECTORY,
      `${candidateReleaseId}.after-restart.acceptance.json`
    ),
    agent_after_phase: resolve(
      AGENT_DIRECTORY,
      `${candidateReleaseId}.after-restart.phase-receipt.v2.json`
    ),
    human_critical: resolve(
      outputRoot,
      `${candidateReleaseId}.human-critical-receipt.json`
    ),
    capital_partner_critical: resolve(
      outputRoot,
      `${candidateReleaseId}.capital-partner-critical-receipt.json`
    ),
    risk_critical: resolve(
      outputRoot,
      `${candidateReleaseId}.risk-mfa-boundary.json`
    )
  });
  await assertM1BOperationalArtifactAbsent(paths.risk_critical, "Risk boundary receipt");
  const [agentAfter, afterPhase, human, capitalPartner] = await Promise.all([
    privateJson(paths.agent_after, "Agent after-restart acceptance"),
    readM1BAgentPhaseReceipt(paths.agent_after_phase, {
      candidateReleaseId,
      runtimeImageId,
      acceptancePhase: "after_restart",
      databaseStartedAt,
      acceptancePath: paths.agent_after
    }),
    privateJson(paths.human_critical, "Human critical receipt"),
    privateJson(paths.capital_partner_critical, "Capital Partner critical receipt")
  ]);
  if (
    agentAfter.schemaVersion !== "local_agent_reference_acceptance.v1" ||
    agentAfter.status !== "passed" ||
    agentAfter.candidateReleaseId !== candidateReleaseId ||
    agentAfter.acceptancePhase !== "after_restart" ||
    agentAfter.acceptanceMode !== "after_restart_recovered" ||
    agentAfter.databaseStartedAt !== databaseStartedAt ||
    agentAfter.productionFundsMoved !== false ||
    afterPhase.document.acceptanceArtifact.sha256 !==
      sha256(await readFile(paths.agent_after))
  ) fail(
    "operational_negative_run_prerequisite_invalid",
    "Agent after-restart Evidence does not bind the exact retained candidate."
  );
  for (const [document, schemaVersion, role] of [
    [human, "m1_b_human_critical_receipt.v1", "human"],
    [capitalPartner, "m1_b_capital_partner_critical_receipt.v1", "capital_partner"]
  ]) {
    if (
      document.schemaVersion !== schemaVersion ||
      document.status !== "passed" ||
      document.role !== role ||
      document.candidateReleaseId !== candidateReleaseId ||
      document.sourceRuntime !== "local_exact_commit" ||
      document.databaseStartedAt !== databaseStartedAt ||
      document.postRestartVerification !== true ||
      Date.parse(document.capturedAt ?? "") <= Date.parse(databaseStartedAt)
    ) fail(
      "operational_negative_run_prerequisite_invalid",
      `${role} critical Evidence does not bind the exact post-restart candidate.`
    );
  }
  validateM1BOperationalPreRiskChronology({
    restart,
    afterPhase: afterPhase.document,
    humanCapturedAt: human.capturedAt,
    capitalPartnerCapturedAt: capitalPartner.capturedAt
  });
  const reference = async (id, kind, path) => Object.freeze({
    id,
    kind,
    relativePath: relative(ROOT, path),
    sha256: sha256(await readFile(path))
  });
  return Object.freeze({
    paths,
    documents: Object.freeze({
      agent_after: agentAfter,
      agent_after_phase: afterPhase.document,
      human_critical: human,
      capital_partner_critical: capitalPartner
    }),
    references: Object.freeze(await Promise.all([
      reference("agent_after", "runtime_receipt", paths.agent_after),
      reference("agent_after_phase", "runtime_receipt", paths.agent_after_phase),
      reference("human_critical", "postgres_receipt", paths.human_critical),
      reference(
        "capital_partner_critical",
        "postgres_receipt",
        paths.capital_partner_critical
      )
    ]))
  });
}

async function operationalPreRiskCriticalArtifacts({
  candidateReleaseId,
  sourceTreeHash,
  databaseStartedAt,
  runtimeImageId,
  restart,
  outputRoot
}) {
  const base = await preRiskCriticalArtifacts({
    candidateReleaseId,
    databaseStartedAt,
    runtimeImageId,
    restart,
    outputRoot
  });
  const paths = {
    release_identity: resolve(
      outputRoot,
      `${candidateReleaseId}.local-release-identity.json`
    ),
    agent_before: resolve(
      AGENT_DIRECTORY,
      `${candidateReleaseId}.before-restart.acceptance.json`
    ),
    agent_before_phase: resolve(
      AGENT_DIRECTORY,
      `${candidateReleaseId}.before-restart.phase-receipt.v2.json`
    ),
    agent_after_phase: base.paths.agent_after_phase,
    agent_foreign_offer_setup: resolve(
      AGENT_DIRECTORY,
      `${candidateReleaseId}.agent-foreign-offer-setup.receipt.v1.json`
    )
  };
  const [releaseIdentity, agentBefore, beforePhase, foreignSetup] =
    await Promise.all([
      privateJson(paths.release_identity, "release identity"),
      privateJson(paths.agent_before, "Agent before-restart acceptance"),
      readM1BAgentPhaseReceipt(paths.agent_before_phase, {
        candidateReleaseId,
        runtimeImageId,
        acceptancePhase: "before_restart",
        databaseStartedAt: restart.beforeDatabaseStartedAt,
        acceptancePath: paths.agent_before
      }),
      privateJson(
        paths.agent_foreign_offer_setup,
        "Agent foreign offered-v1 setup receipt"
      )
    ]);
  const validatedForeign = validateM1BAgentForeignOfferSetupReceipt(
    foreignSetup,
    { candidateReleaseId, sourceTreeHash, runtimeImageId }
  );
  if (
    releaseIdentity.releaseId !== candidateReleaseId ||
    agentBefore.candidateReleaseId !== candidateReleaseId ||
    agentBefore.acceptancePhase !== "before_restart" ||
    agentBefore.databaseStartedAt !== restart.beforeDatabaseStartedAt ||
    canonicalJson(agentBefore.foreignOfferSetupArtifact) !== canonicalJson({
      id: "agent_foreign_offer_setup",
      relativePath: relative(ROOT, paths.agent_foreign_offer_setup),
      sha256: sha256(await readFile(paths.agent_foreign_offer_setup)),
      completedAt: validatedForeign.createdBeforeRestartAt
    }) ||
    base.documents.agent_after.foreignOfferSetupReconciliation?.databaseStartedAt !==
      databaseStartedAt ||
    canonicalJson(
      base.documents.agent_after.foreignOfferSetupReconciliation?.references
    ) !== canonicalJson(validatedForeign.references)
  ) fail(
    "operational_critical_artifact_invalid",
    "Pre-Risk release/Agent foreign setup does not bind the exact restart."
  );
  if (!IDENTIFIER.test(agentBefore.mandateId ?? "")) {
    fail(
      "operational_critical_artifact_invalid",
      "Agent workflow key cannot be derived."
    );
  }
  const workflowKey = sha256(agentBefore.mandateId).slice(0, 24);
  const prefix = `m1-b-${candidateReleaseId}.before_restart.${workflowKey}`;
  paths.agent_application_mcp = resolve(
    AGENT_DIRECTORY,
    `${prefix}.offer-receipt.json`
  );
  paths.agent_runtime_mcp = resolve(
    AGENT_DIRECTORY,
    `${prefix}.mcp-receipt.json`
  );
  const [agentApplicationMcp, agentRuntimeMcp] = await Promise.all([
    privateJson(paths.agent_application_mcp, "Agent application MCP receipt"),
    privateJson(paths.agent_runtime_mcp, "Agent runtime MCP receipt")
  ]);
  if (
    canonicalJson(agentApplicationMcp) !== canonicalJson(agentBefore.offerReceipt) ||
    canonicalJson(agentRuntimeMcp) !== canonicalJson(agentBefore.lifecycle?.mcpReceipt)
  ) fail(
    "operational_critical_artifact_invalid",
    "Pre-Risk extracted Agent MCP receipts do not match Agent-before truth."
  );
  const reference = async (id, kind, path) => Object.freeze({
    id,
    kind,
    relativePath: relative(ROOT, path),
    sha256: sha256(await readFile(path))
  });
  const references = Object.freeze([
    await reference("release_identity", "release_identity", paths.release_identity),
    await reference("agent_before", "runtime_receipt", paths.agent_before),
    ...base.references.filter(({ id }) => id !== "agent_after_phase")
  ]);
  const supportingReferences = Object.freeze([
    await reference(
      "agent_application_mcp",
      "agent_mcp_receipt",
      paths.agent_application_mcp
    ),
    await reference(
      "agent_runtime_mcp",
      "agent_mcp_receipt",
      paths.agent_runtime_mcp
    ),
    await reference(
      "agent_foreign_offer_setup",
      "postgres_receipt",
      paths.agent_foreign_offer_setup
    ),
    await reference("agent_before_phase", "runtime_receipt", paths.agent_before_phase),
    await reference("agent_after_phase", "runtime_receipt", paths.agent_after_phase),
    (() => {
      const recovery = base.documents.agent_after_phase.extractedArtifacts.find(
        ({ id }) => id === "recovery_receipt"
      );
      if (!recovery) fail(
        "operational_agent_phase_invalid",
        "Agent after-restart phase is missing the recovery receipt binding."
      );
      return Object.freeze({
        id: "agent_recovery_receipt",
        kind: "runtime_receipt",
        relativePath: recovery.relativePath,
        sha256: recovery.sha256
      });
    })()
  ]);
  validateCriticalArtifacts(references, { riskRequired: false });
  return {
    paths: Object.freeze(paths),
    references,
    supportingReferences,
    documents: Object.freeze({
      release_identity: releaseIdentity,
      agent_before: agentBefore,
      agent_after: base.documents.agent_after,
      human_critical: base.documents.human_critical,
      capital_partner_critical: base.documents.capital_partner_critical
    }),
    supportingDocuments: Object.freeze({
      agent_application_mcp: agentApplicationMcp,
      agent_runtime_mcp: agentRuntimeMcp,
      agent_foreign_offer_setup: validatedForeign,
      agent_before_phase: beforePhase.document,
      agent_after_phase: base.documents.agent_after_phase
    }),
    phaseReceipts: Object.freeze({
      before: beforePhase,
      after: Object.freeze({ document: base.documents.agent_after_phase })
    })
  };
}

async function liveNegativeCaseContext({
  caseDefinition,
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  outputRoot,
  critical
}) {
  const extraReferences = new Map();
  const reference = (id) => {
    const artifact = critical.references.find((entry) => entry.id === id) ??
      critical.supportingReferences?.find((entry) => entry.id === id) ??
      extraReferences.get(id);
    if (!artifact) {
      fail(
        "operational_live_negative_artifact_missing",
        `Live negative supporting artifact ${id} is missing.`
      );
    }
    return Object.freeze({ id: artifact.id, sha256: artifact.sha256 });
  };
  const common = {
    schemaVersion: "m1_b_operational_live_negative_cli_context.v1",
    group: caseDefinition.group,
    id: caseDefinition.id,
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    tenantId: DEFAULT_PRIVATE_PILOT_PROFILE.tenantId,
    databaseStartedAt
  };
  if (
    caseDefinition.group === "human" &&
    caseDefinition.id === "unauthorized_subject"
  ) {
    const setupPath = resolve(
      AGENT_DIRECTORY,
      `${candidateReleaseId}.agent-foreign-offer-setup.receipt.v1.json`
    );
    const setup = validateM1BAgentForeignOfferSetupReceipt(
      await privateJson(setupPath, "Agent foreign offered-v1 setup receipt"),
      { candidateReleaseId, sourceTreeHash, runtimeImageId }
    );
    const setupReference = Object.freeze({
      id: "agent_foreign_offer_setup",
      kind: "postgres_receipt",
      relativePath: relative(ROOT, setupPath),
      sha256: sha256(await readFile(setupPath))
    });
    if (
      setup.databaseStartedAt === databaseStartedAt ||
      Date.parse(setup.offer.validUntil) <= Date.now()
    ) fail(
      "operational_live_negative_target_invalid",
      "The foreign Agent Offer must be a retained, unexpired, pre-restart offered-v1 target."
    );
    extraReferences.set(setupReference.id, setupReference);
    return Object.freeze({
      ...common,
      supportingArtifacts: Object.freeze([
        reference("human_critical"),
        reference("agent_foreign_offer_setup")
      ]),
      actorId: DEFAULT_PRIVATE_PILOT_PROFILE.identities.borrower.actorId,
      authentication: critical.documents.human_critical.authentication,
      resourceType: "credit_offer",
      resourceId: setup.references.creditOfferId
    });
  }
  if (
    caseDefinition.group === "authorization" &&
    caseDefinition.id === "cross_role_private_read"
  ) {
    return Object.freeze({
      ...common,
      supportingArtifacts: Object.freeze([
        reference("capital_partner_critical"),
        reference("human_critical")
      ]),
      actorId: DEFAULT_PRIVATE_PILOT_PROFILE.identities.capitalPartner.actorId,
      authentication:
        critical.documents.capital_partner_critical.authentication.capitalPartner,
      resourceType: "obligation",
      resourceId: critical.documents.human_critical.linkage.obligationId
    });
  }
  if (
    caseDefinition.group === "human" &&
    caseDefinition.id === "expired_offer"
  ) {
    const setupPaths = expiredOfferSetupPaths(outputRoot, candidateReleaseId);
    const capitalPartnerArtifact = critical.references.find(
      ({ id }) => id === "capital_partner_critical"
    );
    if (!capitalPartnerArtifact) fail(
      "operational_live_negative_target_invalid",
      "The Capital Partner critical receipt is unavailable for expired Offer setup."
    );
    const setupState = await readM1BExpiredOfferSetupState({
      paths: setupPaths,
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      capitalPartnerCriticalArtifact: {
        id: capitalPartnerArtifact.id,
        sha256: capitalPartnerArtifact.sha256
      },
      capitalPartnerCriticalCapturedAt:
        critical.documents.capital_partner_critical.capturedAt
    });
    if (setupState.status !== "sealed") fail(
      "operational_live_negative_target_invalid",
      "The expired Offer setup is not sealed against its immutable safety latch."
    );
    const setup = setupState.receipt;
    const setupReference = Object.freeze({
      id: "expired_offer_setup",
      kind: "postgres_receipt",
      relativePath: relative(ROOT, setupPaths.receipt),
      sha256: sha256(await readFile(setupPaths.receipt))
    });
    extraReferences.set(setupReference.id, setupReference);
    return Object.freeze({
      ...common,
      supportingArtifacts: Object.freeze([
        reference("human_critical"),
        reference("expired_offer_setup")
      ]),
      actorId: DEFAULT_PRIVATE_PILOT_PROFILE.identities.borrower.actorId,
      authentication: critical.documents.human_critical.authentication,
      resourceType: "credit_offer",
      resourceId: setup.offer.creditOfferId
    });
  }
  fail(
    "operational_live_negative_case_invalid",
    "Only the three production live-negative cases may use the exact-image runner."
  );
}

async function supportingArtifactReferencesForLiveContext({
  context,
  critical,
  outputRoot
}) {
  const available = [
    ...critical.references,
    ...critical.supportingReferences
  ];
  if (
    context.supportingArtifacts.some(({ id }) => id === "expired_offer_setup")
  ) {
    const path = resolve(
      outputRoot,
      `${context.candidateReleaseId}.expired-offer-setup.receipt.v1.json`
    );
    available.push(Object.freeze({
      id: "expired_offer_setup",
      kind: "postgres_receipt",
      relativePath: relative(ROOT, path),
      sha256: sha256(await readFile(path))
    }));
  }
  const selected = context.supportingArtifacts.map((binding) => {
    const matches = available.filter(({ id, sha256: digest }) =>
      id === binding.id && digest === binding.sha256
    );
    if (matches.length !== 1) fail(
      "operational_live_negative_artifact_missing",
      `Live supporting artifact ${binding.id} is not uniquely digest-bound.`
    );
    return matches[0];
  });
  return Object.freeze({
    all: Object.freeze(available),
    selected: Object.freeze(selected)
  });
}

async function readM1BOperationalLiveNegativeEvidence({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  outputRoot,
  critical
}) {
  const proofs = [];
  const references = [];
  const operationalSupportingReferences = new Map();
  const definitions = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode, id }) =>
      sourceMode === "live_post_restart" && id !== "replaced_stale_offer"
  );
  if (definitions.length !== 3) fail(
    "operational_live_negative_case_invalid",
    "The retained-runtime interactive set is not the closed three-case set."
  );
  for (const definition of definitions) {
    const context = await liveNegativeCaseContext({
      caseDefinition: definition,
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      databaseStartedAt,
      outputRoot,
      critical
    });
    const attemptPath = resolve(
      outputRoot,
      `${candidateReleaseId}.negative-live-attempt.${definition.group}.${definition.id}.json`
    );
    const proofPath = resolve(
      outputRoot,
      `${candidateReleaseId}.negative-live-source-proof.${definition.group}.${definition.id}.json`
    );
    const [attemptReceipt, negativeProof] = await Promise.all([
      privateJson(attemptPath, `${definition.group}:${definition.id} live attempt`),
      privateJson(proofPath, `${definition.group}:${definition.id} live source proof`)
    ]);
    const available = await supportingArtifactReferencesForLiveContext({
      context,
      critical,
      outputRoot
    });
    for (const artifact of available.selected) {
      if (
        artifact.id === "expired_offer_setup"
      ) operationalSupportingReferences.set(artifact.id, artifact);
    }
    const reconstructed = await createM1BOperationalLiveNegativeDocuments({
      result: Object.freeze({
        schemaVersion: "m1_b_operational_live_negative_cli_result.v1",
        status: "live_negative_captured",
        attemptReceipt,
        negativeProof
      }),
      context,
      outputRoot,
      availableArtifacts: available.all
    });
    for (const reference of reconstructed.references) {
      const expectedPath = reference.id.includes("attempt")
        ? attemptPath
        : proofPath;
      if (
        resolve(ROOT, reference.relativePath) !== expectedPath ||
        reference.sha256 !== sha256(await readFile(expectedPath))
      ) fail(
        "operational_live_negative_output_invalid",
        "A sealed live-negative file changed after its exact-image capture."
      );
      references.push(reference);
    }
    proofs.push(reconstructed.proof);
  }
  return Object.freeze({
    proofs: Object.freeze(proofs),
    references: Object.freeze(references),
    operationalSupportingReferences: Object.freeze(
      [...operationalSupportingReferences.values()]
    )
  });
}

function deriveAvailableNegativeProofs(critical, {
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt
}) {
  const artifact = critical.references.find(
    ({ id }) => id === "capital_partner_critical"
  );
  return [deriveM1BReplacedStaleOfferNegativeProofFromCritical({
    criticalDocument: critical.documents.capital_partner_critical,
    criticalArtifact: Object.freeze({ id: artifact.id, sha256: artifact.sha256 }),
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt
  })];
}

export function parseM1BOperationalEvidenceArguments(argv, { root = ROOT } = {}) {
  if (!Array.isArray(argv)) {
    fail("operational_arguments_invalid", "Operational arguments are invalid.");
  }
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const mode = args[0];
  if (!new Set([
    "restart-begin",
    "restart-complete",
    "restart-complete-only",
    "expired-offer-setup",
    "negative-run",
    "live-negative",
    "collect-pre-risk",
    "finalize"
  ]).has(mode)) {
    fail(
      "operational_arguments_invalid",
      "Mode must be restart-begin, restart-complete, restart-complete-only, expired-offer-setup, negative-run, live-negative, collect-pre-risk, or finalize."
    );
  }
  const names = new Set([
    "--candidate-release-id",
    "--pilot-image-id",
    "--output-root",
    ...(mode === "live-negative" ? ["--negative-case"] : [])
  ]);
  if (args.length !== 1 + names.size * 2) {
    fail("operational_arguments_invalid", "Exact candidate, image, and output arguments are required.");
  }
  const values = new Map();
  for (let index = 1; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!names.has(name) || values.has(name) || typeof value !== "string" || value === "") {
      fail("operational_arguments_invalid", "Operational arguments are invalid.");
    }
    values.set(name, value);
  }
  const candidateReleaseId = values.get("--candidate-release-id");
  const pilotImageId = values.get("--pilot-image-id");
  const outputRoot = resolve(root, values.get("--output-root"));
  const negativeCaseValue = values.get("--negative-case") ?? null;
  const liveCase = negativeCaseValue === null
    ? null
    : M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.find(
        ({ group, id, sourceMode }) =>
          sourceMode === "live_post_restart" &&
          `${group}:${id}` === negativeCaseValue &&
          id !== "replaced_stale_offer"
      ) ?? null;
  const allowed = resolve(root, "output/playwright");
  const relation = relative(allowed, outputRoot);
  if (
    !SHA.test(candidateReleaseId) || !IMAGE_ID.test(pilotImageId) ||
    (mode === "live-negative" && liveCase === null) ||
    relation === "" || relation.startsWith("..") || isAbsolute(relation)
  ) fail("operational_arguments_invalid", "Operational output must be a candidate-bound private Playwright directory.");
  return Object.freeze({
    mode,
    candidateReleaseId,
    pilotImageId,
    outputRoot,
    negativeCase: liveCase === null
      ? null
      : Object.freeze({ group: liveCase.group, id: liveCase.id })
  });
}

async function assertPrivateOutputRoot(outputRoot) {
  const metadata = await lstat(outputRoot);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o700) {
    fail("operational_output_invalid", "Operational output root must be one existing real 0700 directory.");
  }
  const [rootReal, outputReal] = await Promise.all([realpath(ROOT), realpath(outputRoot)]);
  const allowedReal = resolve(rootReal, "output/playwright");
  const relation = relative(allowedReal, outputReal);
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) {
    fail("operational_output_invalid", "Operational output root resolves outside output/playwright.");
  }
}

export async function ensureM1BOperationalOutputDirectory(
  outputRoot,
  { root = ROOT } = {}
) {
  const rootPath = resolve(root);
  const outputParent = resolve(rootPath, "output");
  const playwrightParent = resolve(outputParent, "playwright");
  if (dirname(resolve(outputRoot)) !== playwrightParent) {
    fail("operational_output_invalid", "Operational output must be one direct private Playwright child.");
  }
  for (const [path, description] of [
    [rootPath, "repository root"],
    [outputParent, "output parent"],
    [playwrightParent, "Playwright parent"]
  ]) {
    let metadata;
    try {
      metadata = await lstat(path);
    } catch {
      fail("operational_output_invalid", `${description} is missing.`);
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      fail("operational_output_invalid", `${description} must be a real directory.`);
    }
  }
  const [rootReal, outputReal, playwrightReal] = await Promise.all([
    realpath(rootPath),
    realpath(outputParent),
    realpath(playwrightParent)
  ]);
  if (
    outputReal !== resolve(rootReal, "output") ||
    playwrightReal !== resolve(rootReal, "output/playwright")
  ) fail("operational_output_invalid", "Operational output ancestors resolve through a symlink.");
  const target = resolve(outputRoot);
  try {
    await mkdir(target, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const metadata = await lstat(target);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    await realpath(target) !== resolve(playwrightReal, target.slice(playwrightParent.length + 1))
  ) fail("operational_output_invalid", "Operational output leaf must be a real contained directory.");
  await chmod(target, 0o700);
  await assertPrivateOutputRoot(target);
  return target;
}

async function stdinText() {
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    total += chunk.length;
    if (total > MAX_NDJSON_BYTES) {
      fail("operational_observation_oversized", "Operational NDJSON exceeds 4 MiB.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function collectInteractiveBrowserMeasurements({
  runtime,
  databaseStartedAt,
  outputRoot
}) {
  const readline = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const lines = readline[Symbol.asyncIterator]();
  try {
    return await collectM1BOperationalBrowserMeasurements({
      candidateReleaseId: runtime.releaseIdentity.releaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt,
      portBase: runtime.ports.basePort,
      outputRoot,
      exchange: async (prompt) => {
        process.stdout.write(`${JSON.stringify(prompt)}\n`);
        const next = await lines.next();
        if (next.done || typeof next.value !== "string") fail(
          "operational_browser_measurement_incomplete",
          `Browser measurement response is missing for ${prompt.role}:${prompt.check}:${prompt.phase}.`
        );
        return next.value;
      },
      reconcileAuthenticatedRead: async (context) =>
        runtimeBrowserAppRoleRead({
          runtimeImageId: runtime.runtimeImageId,
          candidateReleaseId: runtime.releaseIdentity.releaseId,
          localStack: runtime.stack,
          context
        })
    });
  } finally {
    readline.close();
  }
}

async function operationalRuntime(options) {
  const releaseIdentity = resolveLocalReleaseIdentity({
    environment: {
      ...process.env,
      IPO_ONE_M1_B_RELEASE_SHA: options.candidateReleaseId
    }
  });
  assertExactLocalReleaseSource(releaseIdentity, { root: ROOT });
  const ports = resolveLocalReviewPorts({ environment: process.env, releaseIdentity });
  const buildContext = await prepareLocalReleaseBuildContext(releaseIdentity, { root: ROOT });
  const stack = parseLocalStack(await readFile(CONTRACT_FILE, "utf8"));
  const baseArgs = baseLimaArguments(releaseIdentity, ports, buildContext);
  const imageRevision = docker(
    ["image", "inspect", stack.pilot.image, "--format", "{{ index .Config.Labels \"org.opencontainers.image.revision\" }}"],
    "candidate image revision unavailable"
  );
  const imageId = docker(["image", "inspect", stack.pilot.image, "--format", "{{.Id}}"], "candidate image unavailable");
  if (imageRevision !== options.candidateReleaseId || imageId !== options.pilotImageId) {
    fail("operational_runtime_identity_invalid", "Candidate OCI image does not match exact source identity.");
  }
  const sourceTreeHash = run(
    "git",
    ["rev-parse", `${options.candidateReleaseId}^{tree}`],
    "candidate source tree unavailable"
  );
  if (!SHA.test(sourceTreeHash)) {
    fail("operational_runtime_identity_invalid", "Candidate source tree is invalid.");
  }
  return {
    releaseIdentity,
    sourceTreeHash,
    buildContext,
    ports,
    stack,
    baseArgs,
    runtimeImageId: imageId
  };
}

async function writeCheckpoint(path, document) {
  const bytes = jsonBytes(document);
  await writeM1BOperationalDocumentsAtomic([{
    id: "operational_restart_before",
    kind: "runtime_receipt",
    relativePath: relative(ROOT, path),
    document,
    bytes
  }]);
}

export async function writeM1BPrivateRuntimeDocumentExclusive(
  path,
  document,
  { secretDirectory = SECRET_DIRECTORY } = {}
) {
  const directory = dirname(path);
  const secretMetadata = await lstat(secretDirectory);
  if (
    !secretMetadata.isDirectory() || secretMetadata.isSymbolicLink() ||
    (secretMetadata.mode & 0o777) !== 0o700
  ) fail(
    "operational_restart_invalid",
    "The private local runtime directory is invalid."
  );
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const [secretReal, directoryReal, directoryMetadata] = await Promise.all([
    realpath(secretDirectory),
    realpath(directory),
    lstat(directory)
  ]);
  const relation = relative(secretReal, directoryReal);
  if (
    relation.startsWith("..") || isAbsolute(relation) ||
    !directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink() ||
    (directoryMetadata.mode & 0o777) !== 0o700
  ) fail(
    "operational_restart_invalid",
    "The private restart observation directory is invalid."
  );
  const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, jsonBytes(document), { flag: "wx", mode: 0o600 });
    const temporaryMetadata = await lstat(temporary);
    if (
      !temporaryMetadata.isFile() || temporaryMetadata.isSymbolicLink() ||
      (temporaryMetadata.mode & 0o777) !== 0o600
    ) fail(
      "operational_restart_invalid",
      "The private restart observation temporary file is invalid."
    );
    await link(temporary, path);
    const targetMetadata = await lstat(path);
    if (
      !targetMetadata.isFile() || targetMetadata.isSymbolicLink() ||
      (targetMetadata.mode & 0o777) !== 0o600
    ) fail(
      "operational_restart_invalid",
      "The private restart observation is not one exclusive 0600 file."
    );
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function runM1BOperationalEvidenceBuilder({
  argv = process.argv.slice(2)
} = {}) {
  const options = parseM1BOperationalEvidenceArguments(argv);
  await assertPrivateOutputRoot(options.outputRoot);
  const runtime = await operationalRuntime(options);
  const pendingPath = resolve(
    options.outputRoot,
    `${options.candidateReleaseId}.operational-restart.pending.json`
  );
  const completedPath = resolve(
    options.outputRoot,
    `${options.candidateReleaseId}.operational-restart.json`
  );
  if (options.mode === "restart-begin") {
    const snapshot = await runtimeSnapshot({
      baseArgs: runtime.baseArgs,
      runtimeImageId: runtime.runtimeImageId,
      candidateReleaseId: options.candidateReleaseId,
      localStack: runtime.stack
    });
    const beforeMarker = await privateJson(
      resolve(AGENT_DIRECTORY, `${options.candidateReleaseId}.before-restart.acceptance.json`),
      "Agent before-restart marker"
    );
    const beforePhase = await readM1BAgentPhaseReceipt(
      resolve(
        AGENT_DIRECTORY,
        `${options.candidateReleaseId}.before-restart.phase-receipt.v2.json`
      ),
      {
        candidateReleaseId: options.candidateReleaseId,
        runtimeImageId: runtime.runtimeImageId,
        acceptancePhase: "before_restart",
        databaseStartedAt: snapshot.databaseStartedAt,
        acceptancePath: resolve(
          AGENT_DIRECTORY,
          `${options.candidateReleaseId}.before-restart.acceptance.json`
        )
      }
    );
    const foreignOfferSetupPath = resolve(
      AGENT_DIRECTORY,
      `${options.candidateReleaseId}.agent-foreign-offer-setup.receipt.v1.json`
    );
    const foreignOfferSetup = validateM1BAgentForeignOfferSetupReceipt(
      await privateJson(
        foreignOfferSetupPath,
        "Agent foreign offered-v1 setup receipt"
      ),
      {
        candidateReleaseId: options.candidateReleaseId,
        sourceTreeHash: runtime.sourceTreeHash,
        runtimeImageId: runtime.runtimeImageId
      }
    );
    const foreignOfferSetupArtifact = Object.freeze({
      id: "agent_foreign_offer_setup",
      sha256: sha256(await readFile(foreignOfferSetupPath)),
      completedAt: foreignOfferSetup.createdBeforeRestartAt
    });
    if (
      beforeMarker.candidateReleaseId !== options.candidateReleaseId ||
      beforeMarker.acceptancePhase !== "before_restart" ||
      beforeMarker.databaseStartedAt !== snapshot.databaseStartedAt ||
      foreignOfferSetup.databaseStartedAt !== snapshot.databaseStartedAt ||
      canonicalJson(beforeMarker.foreignOfferSetupArtifact) !==
        canonicalJson({
          ...foreignOfferSetupArtifact,
          relativePath: relative(ROOT, foreignOfferSetupPath)
        }) ||
      canonicalJson(beforePhase.document.foreignOfferSetupArtifact) !==
        canonicalJson({
          ...foreignOfferSetupArtifact,
          relativePath: relative(ROOT, foreignOfferSetupPath)
        })
    ) fail("operational_restart_invalid", "Agent before-restart marker does not match runtime.");
    if (
      beforePhase.document.acceptanceArtifact.sha256 !== sha256(await readFile(
        resolve(AGENT_DIRECTORY, `${options.candidateReleaseId}.before-restart.acceptance.json`)
      )) ||
      Date.parse(beforePhase.document.completedAt) >= Date.parse(snapshot.capturedAt)
    ) fail("operational_restart_invalid", "Agent before-restart phase was not sealed before the restart journal.");
    const document = Object.freeze({
      schemaVersion: "m1_b_operational_restart_pending.v2",
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      sourceRuntime: "local_exact_commit",
      ...snapshot,
      agentBeforeSha256: sha256(await readFile(
        resolve(AGENT_DIRECTORY, `${options.candidateReleaseId}.before-restart.acceptance.json`)
      )),
      agentBeforePhaseReceipt: Object.freeze({
        sha256: beforePhase.sha256,
        completedAt: beforePhase.document.completedAt
      }),
      agentForeignOfferSetupArtifact: foreignOfferSetupArtifact,
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    });
    assertExactLocalReleaseSource(runtime.releaseIdentity, { root: ROOT });
    await writeCheckpoint(pendingPath, document);
    return Object.freeze({ status: "restart_journal_pending", pendingPath });
  }
  const before = await privateJson(pendingPath, "operational restart pending journal");
  if (
    before.schemaVersion !== "m1_b_operational_restart_pending.v2" ||
    before.candidateReleaseId !== options.candidateReleaseId ||
    before.sourceTreeHash !== runtime.sourceTreeHash ||
    before.runtimeImageId !== runtime.runtimeImageId
  ) fail("operational_restart_invalid", "Pending restart journal does not match candidate.");
  if (new Set(["restart-complete", "restart-complete-only"]).has(options.mode)) {
    const foreignOfferSetupPath = resolve(
      AGENT_DIRECTORY,
      `${options.candidateReleaseId}.agent-foreign-offer-setup.receipt.v1.json`
    );
    const foreignOfferSetup = validateM1BAgentForeignOfferSetupReceipt(
      await privateJson(
        foreignOfferSetupPath,
        "Agent foreign offered-v1 setup receipt"
      ),
      {
        candidateReleaseId: options.candidateReleaseId,
        sourceTreeHash: runtime.sourceTreeHash,
        runtimeImageId: runtime.runtimeImageId
      }
    );
    if (
      before.agentForeignOfferSetupArtifact?.id !== "agent_foreign_offer_setup" ||
      before.agentForeignOfferSetupArtifact.sha256 !==
        sha256(await readFile(foreignOfferSetupPath)) ||
      before.agentForeignOfferSetupArtifact.completedAt !==
        foreignOfferSetup.createdBeforeRestartAt
    ) fail(
      "operational_restart_invalid",
      "Foreign Agent offered-v1 setup changed across the exact restart."
    );
    const pendingSha256 = sha256(await readFile(pendingPath));
    const observationPath = resolve(
      RESTART_OBSERVATION_DIRECTORY,
      `${options.candidateReleaseId}.restart-observation.v1.json`
    );
    const storedObservation = await privateJsonIfPresent(
      observationPath,
      "sealed restart observation"
    );
    let observation = null;
    if (storedObservation !== null) {
      observation = validateM1BRestartObservation(
        storedObservation,
        {
          candidateReleaseId: options.candidateReleaseId,
          sourceTreeHash: runtime.sourceTreeHash,
          runtimeImageId: runtime.runtimeImageId,
          pendingSha256,
          before
        }
      );
      const current = await runtimeSnapshot({
        baseArgs: runtime.baseArgs,
        runtimeImageId: runtime.runtimeImageId,
        candidateReleaseId: options.candidateReleaseId,
        localStack: runtime.stack
      });
      assertM1BRestartObservationRuntimeStable(observation.after, current);
    } else {
      if (options.mode === "restart-complete-only") fail(
        "operational_restart_invalid",
        "Completion-only requires the sealed first-attempt restart observation."
      );
      const after = await runtimeSnapshot({
        baseArgs: runtime.baseArgs,
        runtimeImageId: runtime.runtimeImageId,
        candidateReleaseId: options.candidateReleaseId,
        localStack: runtime.stack
      });
      observation = createM1BRestartObservation({
        candidateReleaseId: options.candidateReleaseId,
        sourceTreeHash: runtime.sourceTreeHash,
        runtimeImageId: runtime.runtimeImageId,
        pendingSha256,
        before,
        after,
        eventLines: restartEventLines(before, after)
      });
      await writeM1BPrivateRuntimeDocumentExclusive(observationPath, observation);
    }
    const after = observation.after;
    const restartEvents = createM1BRestartEventSummary(
      before,
      after,
      observation.eventLines
    );
    const restart = createM1BRestartContext(before, after, restartEvents);
    const document = restartReceiptDocument({
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      pendingSha256,
      agentBeforeSha256: before.agentBeforeSha256,
      agentBeforePhaseReceipt: before.agentBeforePhaseReceipt,
      agentForeignOfferSetupArtifact: before.agentForeignOfferSetupArtifact,
      restart
    });
    assertExactLocalReleaseSource(runtime.releaseIdentity, { root: ROOT });
    await writeM1BOperationalDocumentsAtomic([{
      id: "operational_restart",
      kind: "restart_log",
      relativePath: relative(ROOT, completedPath),
      document,
      bytes: jsonBytes(document)
    }]);
    return Object.freeze({
      status: "restart_receipt_completed",
      completedPath,
      databaseStartedAt: after.databaseStartedAt
    });
  }
  const completed = await privateJson(completedPath, "completed operational restart receipt");
  if (
    completed.candidateReleaseId !== options.candidateReleaseId ||
    completed.sourceTreeHash !== runtime.sourceTreeHash ||
    completed.runtimeImageId !== runtime.runtimeImageId ||
    completed.pendingJournalSha256 !== sha256(await readFile(pendingPath)) ||
    canonicalJson(completed.agentForeignOfferSetupArtifact) !==
      canonicalJson(before.agentForeignOfferSetupArtifact) ||
    completed.agentForeignOfferSetupArtifact?.sha256 !== sha256(await readFile(
      resolve(
        AGENT_DIRECTORY,
        `${options.candidateReleaseId}.agent-foreign-offer-setup.receipt.v1.json`
      )
    ))
  ) fail("operational_restart_invalid", "Completed restart receipt does not match candidate or pending journal.");
  const after = await runtimeSnapshot({
    baseArgs: runtime.baseArgs,
    runtimeImageId: runtime.runtimeImageId,
    candidateReleaseId: options.candidateReleaseId,
    localStack: runtime.stack
  });
  assertM1BOperationalRuntimeMatchesRestart(completed, after);
  const completedRestart = restartContextFromReceipt(completed);
  const restartArtifact = Object.freeze({
    id: "operational_restart",
    kind: "restart_log",
    relativePath: relative(ROOT, completedPath),
    sha256: sha256(await readFile(completedPath))
  });
  if (options.mode === "expired-offer-setup") {
    const setupPaths = expiredOfferSetupPaths(
      options.outputRoot,
      options.candidateReleaseId
    );
    const critical = await operationalPreRiskCriticalArtifacts({
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      databaseStartedAt: after.databaseStartedAt,
      runtimeImageId: runtime.runtimeImageId,
      restart: completedRestart,
      outputRoot: options.outputRoot
    });
    const capitalPartnerArtifact = critical.references.find(
      ({ id }) => id === "capital_partner_critical"
    );
    if (!capitalPartnerArtifact) fail(
      "operational_expired_offer_context_invalid",
      "The Capital Partner critical artifact is missing."
    );
    const capitalPartnerCriticalBinding =
      createM1BExpiredOfferCriticalBinding(
        critical.documents.capital_partner_critical,
        {
          artifactId: capitalPartnerArtifact.id,
          sha256: capitalPartnerArtifact.sha256
        }
      );
    const priorState = await readM1BExpiredOfferSetupState({
      paths: setupPaths,
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt: after.databaseStartedAt,
      capitalPartnerCriticalArtifact: {
        id: capitalPartnerArtifact.id,
        sha256: capitalPartnerArtifact.sha256
      },
      capitalPartnerCriticalCapturedAt:
        critical.documents.capital_partner_critical.capturedAt
    });
    if (priorState.status === "sealed") {
      const bytes = await readFile(setupPaths.receipt);
      return Object.freeze({
        status: "expired_offer_setup_already_sealed",
        candidateReleaseId: options.candidateReleaseId,
        databaseStartedAt: after.databaseStartedAt,
        capturedAt: priorState.receipt.capturedAt,
        artifact: Object.freeze({
          id: "expired_offer_setup",
          kind: "postgres_receipt",
          relativePath: relative(ROOT, setupPaths.receipt),
          sha256: sha256(bytes)
        })
      });
    }
    const latch = createM1BExpiredOfferSetupSafetyLatch({
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt: after.databaseStartedAt,
      armedAt: new Date().toISOString(),
      capitalPartnerCriticalArtifact: {
        id: capitalPartnerArtifact.id,
        sha256: capitalPartnerArtifact.sha256
      },
      capitalPartnerCriticalCapturedAt:
        critical.documents.capital_partner_critical.capturedAt,
      receiptRelativePath: relative(ROOT, setupPaths.receipt)
    });
    await writeM1BOperationalDocumentsAtomic([Object.freeze({
      id: "expired_offer_setup_safety_latch",
      kind: "runtime_guard",
      relativePath: relative(ROOT, setupPaths.latch),
      document: latch,
      bytes: jsonBytes(latch)
    })]);
    const context = Object.freeze({
      schemaVersion: "m1_b_expired_offer_setup_cli_context.v1",
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt: after.databaseStartedAt,
      tenantId: DEFAULT_PRIVATE_PILOT_PROFILE.tenantId,
      humanActorId:
        DEFAULT_PRIVATE_PILOT_PROFILE.identities.borrower.actorId,
      capitalPartnerActorId:
        DEFAULT_PRIVATE_PILOT_PROFILE.identities.capitalPartner.actorId,
      capitalPartnerOrigin: expectedLocalOrigin(
        "capital_partner",
        runtime.ports.basePort
      ),
      capitalPartnerCriticalBinding
    });
    const databaseUrl =
      `postgresql://${runtime.stack.database.guestAddress}:` +
      `${runtime.stack.database.guestPort}/${runtime.stack.database.database}`;
    const arguments_ = createM1BExpiredOfferSetupRunnerArguments({
      runtimeImageId: runtime.runtimeImageId,
      databaseUrl,
      context
    });
    const receipt = await runInteractiveExpiredOfferSetup(arguments_);
    validateM1BExpiredOfferSetupReceipt(receipt, {
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt: after.databaseStartedAt,
      capitalPartnerCriticalArtifact: {
        id: capitalPartnerArtifact.id,
        sha256: capitalPartnerArtifact.sha256
      },
      expectedFixtureUsed: false
    });
    const stableRuntime = await operationalRuntime(options);
    const stable = await runtimeSnapshot({
      baseArgs: stableRuntime.baseArgs,
      runtimeImageId: stableRuntime.runtimeImageId,
      candidateReleaseId: options.candidateReleaseId,
      localStack: stableRuntime.stack
    });
    assertM1BOperationalRuntimeMatchesRestart(completed, stable);
    assertExactLocalReleaseSource(stableRuntime.releaseIdentity, { root: ROOT });
    if (
      capitalPartnerArtifact.sha256 !== sha256(await readFile(
        critical.paths.capital_partner_critical
      ))
    ) fail(
      "operational_expired_offer_context_invalid",
      "The Capital Partner critical artifact changed during expired-Offer setup."
    );
    await assertM1BOperationalArtifactAbsent(
      critical.paths.risk_critical,
      "Risk boundary receipt"
    );
    const bytes = jsonBytes(receipt);
    const artifact = Object.freeze({
      id: "expired_offer_setup",
      kind: "postgres_receipt",
      relativePath: relative(ROOT, setupPaths.receipt),
      sha256: sha256(bytes)
    });
    await writeM1BOperationalDocumentsAtomic([Object.freeze({
      id: artifact.id,
      kind: artifact.kind,
      relativePath: artifact.relativePath,
      document: receipt,
      bytes
    })]);
    const sealedState = await readM1BExpiredOfferSetupState({
      paths: setupPaths,
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt: after.databaseStartedAt,
      capitalPartnerCriticalArtifact: {
        id: capitalPartnerArtifact.id,
        sha256: capitalPartnerArtifact.sha256
      },
      capitalPartnerCriticalCapturedAt:
        critical.documents.capital_partner_critical.capturedAt
    });
    if (sealedState.status !== "sealed") fail(
      "operational_expired_offer_latch_invalid",
      "The expired-Offer receipt did not seal against its safety latch."
    );
    return Object.freeze({
      status: "expired_offer_setup_written",
      candidateReleaseId: options.candidateReleaseId,
      databaseStartedAt: after.databaseStartedAt,
      capturedAt: receipt.capturedAt,
      artifact
    });
  }
  if (options.mode === "negative-run") {
    const preRisk = await preRiskCriticalArtifacts({
      candidateReleaseId: options.candidateReleaseId,
      databaseStartedAt: after.databaseStartedAt,
      runtimeImageId: runtime.runtimeImageId,
      restart: completedRestart,
      outputRoot: options.outputRoot
    });
    const startedAt = new Date().toISOString();
    iso(startedAt, "operational_negative_run_invalid");
    if (
      Date.parse(startedAt) <= Math.max(
        Date.parse(preRisk.documents.human_critical.capturedAt),
        Date.parse(preRisk.documents.capital_partner_critical.capturedAt),
        Date.parse(preRisk.documents.agent_after_phase.completedAt)
      )
    ) fail(
      "operational_negative_run_order_invalid",
      "Exact-source negative execution must start after the retained post-restart critical Evidence."
    );
    const retainedDatabaseUrl =
      `postgresql://${runtime.stack.database.guestAddress}:` +
      `${runtime.stack.database.guestPort}/${runtime.stack.database.database}`;
    const retainedPrimaryOrigin = expectedLocalOrigin(
      "human",
      runtime.ports.basePort
    );
    const suite = await runM1BOperationalExactSourceNegativeSuite({
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      exactSourceDirectory: runtime.buildContext,
      outputRoot: options.outputRoot,
      retainedRuntime: Object.freeze({
        origin: retainedPrimaryOrigin,
        databaseStartedAt: after.databaseStartedAt,
        databaseUrl: retainedDatabaseUrl
      }),
      databaseSecretFile: DATABASE_SECRET_FILE
    });
    const completedAt = new Date().toISOString();
    iso(completedAt, "operational_negative_run_invalid");
    if (Date.parse(completedAt) <= Date.parse(startedAt)) {
      fail(
        "operational_negative_run_invalid",
        "Exact-source negative execution completion time is invalid."
      );
    }
    const validatedProofs = [];
    for (const proof of suite?.proofs ?? []) {
      validatedProofs.push(await validateM1BOperationalNegativeProof(proof, {
        candidateReleaseId: options.candidateReleaseId,
        sourceTreeHash: runtime.sourceTreeHash,
        runtimeImageId: runtime.runtimeImageId,
        databaseStartedAt: after.databaseStartedAt,
        availableArtifacts: []
      }));
    }
    if (
      validatedProofs.length !== 12 ||
      assertM1BOperationalNegativeProofIdentifiersUnique(validatedProofs) !== true
    ) fail(
      "operational_negative_run_invalid",
      "Exact-source negative execution did not produce the unique closed twelve-case subset."
    );
    const stableRuntime = await operationalRuntime(options);
    if (
      stableRuntime.sourceTreeHash !== runtime.sourceTreeHash ||
      stableRuntime.runtimeImageId !== runtime.runtimeImageId ||
      stableRuntime.buildContext !== runtime.buildContext ||
      stableRuntime.ports.basePort !== runtime.ports.basePort
    ) fail(
      "operational_runtime_identity_invalid",
      "Exact candidate runtime or source identity drifted during negative execution."
    );
    const stable = await runtimeSnapshot({
      baseArgs: stableRuntime.baseArgs,
      runtimeImageId: stableRuntime.runtimeImageId,
      candidateReleaseId: options.candidateReleaseId,
      localStack: stableRuntime.stack
    });
    assertM1BOperationalRuntimeMatchesRestart(completed, stable);
    const result = createM1BOperationalNegativeRunDocuments({
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt: after.databaseStartedAt,
      retainedPrimaryOrigin,
      outputRoot: options.outputRoot,
      startedAt,
      completedAt,
      restartArtifact,
      prerequisiteArtifacts: preRisk.references,
      suite: Object.freeze({ ...suite, proofs: Object.freeze(validatedProofs) })
    });
    assertM1BOperationalRuntimeMatchesRestart(completed, stable);
    assertExactLocalReleaseSource(stableRuntime.releaseIdentity, { root: ROOT });
    await assertM1BOperationalArtifactAbsent(
      preRisk.paths.risk_critical,
      "Risk boundary receipt"
    );
    await writeM1BOperationalDocumentsAtomic(result.documents);
    return Object.freeze({
      status: "exact_source_negative_run_written",
      candidateReleaseId: options.candidateReleaseId,
      databaseStartedAt: after.databaseStartedAt,
      startedAt,
      completedAt,
      receiptArtifact: result.receiptArtifact,
      exactSourceCaseCount: result.receipt.exactSourceCaseCount
    });
  }
  if (options.mode === "live-negative") {
    const critical = await operationalPreRiskCriticalArtifacts({
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      databaseStartedAt: after.databaseStartedAt,
      runtimeImageId: runtime.runtimeImageId,
      restart: completedRestart,
      outputRoot: options.outputRoot
    });
    const caseDefinition = getM1BOperationalNegativeCaseDefinition(
      options.negativeCase.group,
      options.negativeCase.id
    );
    const context = await liveNegativeCaseContext({
      caseDefinition,
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt: after.databaseStartedAt,
      outputRoot: options.outputRoot,
      critical
    });
    const databaseUrl =
      `postgresql://${runtime.stack.database.guestAddress}:` +
      `${runtime.stack.database.guestPort}/${runtime.stack.database.database}`;
    const runnerArguments = createM1BOperationalLiveNegativeRunnerArguments({
      runtimeImageId: runtime.runtimeImageId,
      databaseUrl,
      context
    });
    const liveResult = await runInteractiveLiveNegative(runnerArguments);
    const available = await supportingArtifactReferencesForLiveContext({
      context,
      critical,
      outputRoot: options.outputRoot
    });
    const documents = await createM1BOperationalLiveNegativeDocuments({
      result: liveResult,
      context,
      outputRoot: options.outputRoot,
      availableArtifacts: available.all
    });
    const stableRuntime = await operationalRuntime(options);
    const stable = await runtimeSnapshot({
      baseArgs: stableRuntime.baseArgs,
      runtimeImageId: stableRuntime.runtimeImageId,
      candidateReleaseId: options.candidateReleaseId,
      localStack: stableRuntime.stack
    });
    assertM1BOperationalRuntimeMatchesRestart(completed, stable);
    assertExactLocalReleaseSource(stableRuntime.releaseIdentity, { root: ROOT });
    await assertM1BOperationalArtifactAbsent(
      resolve(
        options.outputRoot,
        `${options.candidateReleaseId}.risk-mfa-boundary.json`
      ),
      "Risk boundary receipt"
    );
    await writeM1BOperationalDocumentsAtomic(documents.documents);
    return Object.freeze({
      status: "live_negative_written",
      candidateReleaseId: options.candidateReleaseId,
      databaseStartedAt: after.databaseStartedAt,
      group: caseDefinition.group,
      id: caseDefinition.id,
      references: documents.references
    });
  }
  if (options.mode === "collect-pre-risk") {
    const critical = await operationalPreRiskCriticalArtifacts({
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      databaseStartedAt: after.databaseStartedAt,
      runtimeImageId: runtime.runtimeImageId,
      restart: completedRestart,
      outputRoot: options.outputRoot
    });
    const negativeRun = await readM1BOperationalNegativeRunEvidence({
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt: after.databaseStartedAt,
      outputRoot: options.outputRoot
    });
    const live = await readM1BOperationalLiveNegativeEvidence({
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt: after.databaseStartedAt,
      outputRoot: options.outputRoot,
      critical
    });
    const derivedNegativeProofs = Object.freeze([
      ...negativeRun.proofs,
      ...live.proofs,
      ...deriveAvailableNegativeProofs(critical, {
        candidateReleaseId: options.candidateReleaseId,
        sourceTreeHash: runtime.sourceTreeHash,
        runtimeImageId: runtime.runtimeImageId,
        databaseStartedAt: after.databaseStartedAt
      })
    ]);
    assertCompleteM1BDerivedNegativeProofs(derivedNegativeProofs);
    assertCompleteM1BOperationalNegativeProofSet(derivedNegativeProofs);
    assertM1BOperationalNegativeProofIdentifiersUnique(derivedNegativeProofs);
    await assertM1BOperationalArtifactAbsent(
      critical.paths.risk_critical,
      "Risk boundary receipt"
    );
    const collectionStartedAt = new Date().toISOString();
    const observations = await collectInteractiveBrowserMeasurements({
      runtime,
      databaseStartedAt: after.databaseStartedAt,
      outputRoot: options.outputRoot
    });
    const restartPendingArtifact = Object.freeze({
      id: "operational_restart_pending",
      kind: "restart_log",
      relativePath: relative(ROOT, pendingPath),
      sha256: sha256(await readFile(pendingPath))
    });
    const result = await createM1BOperationalEvidenceDocuments({
      candidateReleaseId: options.candidateReleaseId,
      sourceTreeHash: runtime.sourceTreeHash,
      runtimeImageId: runtime.runtimeImageId,
      databaseStartedAt: after.databaseStartedAt,
      portBase: runtime.ports.basePort,
      outputRoot: options.outputRoot,
      observations,
      criticalArtifacts: critical.references,
      criticalDocuments: critical.documents,
      supportingArtifacts: critical.supportingReferences,
      restart: completedRestart,
      restartArtifact,
      restartPendingArtifact,
      derivedNegativeProofs,
      negativeExecutionManifest: negativeRun.executionManifest,
      negativeTapArtifacts: negativeRun.tapArtifacts,
      negativeSourceArtifacts: negativeRun.artifactReferences,
      liveNegativeArtifacts: live.references,
      operationalSupportingArtifacts: live.operationalSupportingReferences,
      collectionStartedAt
    });
    const stableRuntime = await operationalRuntime(options);
    const stable = await runtimeSnapshot({
      baseArgs: stableRuntime.baseArgs,
      runtimeImageId: stableRuntime.runtimeImageId,
      candidateReleaseId: options.candidateReleaseId,
      localStack: stableRuntime.stack
    });
    assertM1BOperationalRuntimeMatchesRestart(completed, stable);
    assertExactLocalReleaseSource(stableRuntime.releaseIdentity, { root: ROOT });
    await assertM1BOperationalArtifactAbsent(
      critical.paths.risk_critical,
      "Risk boundary receipt"
    );
    await writeM1BOperationalDocumentsAtomic(result.documents);
    return Object.freeze({
      status: "pre_risk_operational_evidence_written",
      candidateReleaseId: options.candidateReleaseId,
      databaseStartedAt: after.databaseStartedAt,
      startedAt: collectionStartedAt,
      completedAt: result.completedAt,
      preRiskReceiptArtifact: result.preRiskReceiptArtifact,
      artifactCount: result.artifacts.length
    });
  }
  const critical = await criticalArtifacts(
    options.candidateReleaseId,
    after.databaseStartedAt,
    runtime.runtimeImageId,
    completedRestart,
    options.outputRoot
  );
  const preRisk = await readM1BOperationalPreRiskCollectionEvidence({
    candidateReleaseId: options.candidateReleaseId,
    sourceTreeHash: runtime.sourceTreeHash,
    runtimeImageId: runtime.runtimeImageId,
    databaseStartedAt: after.databaseStartedAt,
    outputRoot: options.outputRoot
  });
  for (const reference of [
    ...critical.references.filter(({ id }) => id !== "risk_critical"),
    ...critical.supportingReferences
  ]) {
    const preRiskReference = preRisk.artifactReferences.find(
      ({ id }) => id === reference.id
    );
    if (
      !preRiskReference ||
      canonicalJson(preRiskReference) !== canonicalJson(reference)
    ) fail(
      "operational_closure_invalid",
      `Pre-Risk artifact ${reference.id} changed before final closure.`
    );
  }
  const riskArtifact = critical.references.find(({ id }) => id === "risk_critical");
  const riskCapturedAt = critical.documents.risk_critical.capturedAt;
  if (
    Date.parse(preRisk.receipt.completedAt) >= Date.parse(riskCapturedAt)
  ) fail(
    "operational_closure_invalid",
    "Risk Evidence must be captured strictly after every pre-Risk operational artifact."
  );
  const completedAt = new Date().toISOString();
  const closure = createM1BOperationalClosureDocument({
    candidateReleaseId: options.candidateReleaseId,
    sourceTreeHash: runtime.sourceTreeHash,
    runtimeImageId: runtime.runtimeImageId,
    databaseStartedAt: after.databaseStartedAt,
    preRiskReceiptArtifact: preRisk.receiptReference,
    preRiskCompletedAt: preRisk.receipt.completedAt,
    riskArtifact,
    riskCapturedAt,
    completedAt
  });
  const closureRelativePath = relative(
    ROOT,
    resolve(
      options.outputRoot,
      `${options.candidateReleaseId}.operational-closure.v2.json`
    )
  );
  const closureBytes = jsonBytes(closure);
  const closureArtifact = Object.freeze({
    id: "operational_closure",
    kind: "runtime_receipt",
    relativePath: closureRelativePath,
    sha256: sha256(closureBytes)
  });
  const evidence = createM1BCanonicalOperationalAcceptanceEvidence({
    candidateReleaseId: options.candidateReleaseId,
    sourceTreeHash: runtime.sourceTreeHash,
    runtimeImageId: runtime.runtimeImageId,
    portBase: runtime.ports.basePort,
    capturedAt: completedAt,
    criticalDocuments: critical.documents,
    preRiskEvidence: preRisk,
    riskArtifact,
    closureArtifact
  });
  verifyM1BAcceptanceEvidence(evidence, {
    expectedCommitSha: options.candidateReleaseId
  });
  const evidenceRelativePath = relative(
    ROOT,
    resolve(
      options.outputRoot,
      `${options.candidateReleaseId}.m1-b-p0-5-acceptance-evidence.v2.json`
    )
  );
  const stableRuntime = await operationalRuntime(options);
  const stable = await runtimeSnapshot({
    baseArgs: stableRuntime.baseArgs,
    runtimeImageId: stableRuntime.runtimeImageId,
    candidateReleaseId: options.candidateReleaseId,
    localStack: stableRuntime.stack
  });
  assertM1BOperationalRuntimeMatchesRestart(completed, stable);
  assertExactLocalReleaseSource(stableRuntime.releaseIdentity, { root: ROOT });
  await writeM1BOperationalDocumentsAtomic([
    Object.freeze({
      id: closureArtifact.id,
      kind: closureArtifact.kind,
      relativePath: closureArtifact.relativePath,
      document: closure,
      bytes: closureBytes
    }),
    Object.freeze({
      id: "m1_b_p0_5_acceptance_evidence_v2",
      kind: "runtime_receipt",
      relativePath: evidenceRelativePath,
      document: evidence,
      bytes: jsonBytes(evidence)
    })
  ]);
  return Object.freeze({
    status: "operational_closure_written",
    candidateReleaseId: options.candidateReleaseId,
    databaseStartedAt: after.databaseStartedAt,
    completedAt,
    evidencePath: evidenceRelativePath,
    evidenceArtifactCount: evidence.artifacts.length
  });
}

async function main() {
  try {
    process.stdout.write(`${JSON.stringify(await runM1BOperationalEvidenceBuilder(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `M1-B operational Evidence: ${error?.code ?? "operational_failure"}: ${error?.message ?? "failed"}\n`
    );
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
