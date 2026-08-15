export const M1_B_RISK_BOUNDARY_RESPONSE_ARM_SCHEMA_VERSION =
  "m1_b_risk_boundary_response_arm.v1";

const ARM_TTL_MS = 15 * 60_000;
const MAX_ARM_TOKEN_BYTES = 8 * 1024;
const MAX_PROBLEM_RESPONSE_BYTES = 64 * 1024;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const RESOURCE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{1,255}$/;
const READ_REQUEST_ID =
  /^request_m1_b_risk_read_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FREEZE_REQUEST_ID =
  /^request_m1_b_risk_freeze_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CORRELATION_ID =
  /^correlation_m1_b_risk_boundary_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CHALLENGE =
  /^m1_b_risk_boundary_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION_IDS = Object.freeze([
  "pilotReadTenantRiskPortfolioReference",
  "pilotFreezeSubject"
]);
const ARM_KEYS = Object.freeze([
  "schemaVersion",
  "challenge",
  "issuedAt",
  "expiresAt",
  "flow",
  "actorRole",
  "authenticationMethod",
  "authenticationProfile",
  "hostWorkspaceName",
  "responseSchemaVersion",
  "operationIds",
  "subjectId",
  "reasonCode",
  "readRequestId",
  "readCorrelationId",
  "freezeRequestId",
  "freezeCorrelationId"
]);
const RUNTIME_KEYS = Object.freeze([
  "connected",
  "authenticationMethod",
  "authenticationProfile",
  "hostWorkspaceName"
]);
const READ_REQUEST_KEYS = Object.freeze([
  "operationId",
  "payload",
  "requestId",
  "correlationId",
  "schemaVersion"
]);
const FREEZE_REQUEST_KEYS = Object.freeze([
  "operationId",
  "payload",
  "resource",
  "reasonCode",
  "idempotencyKey",
  "requestId",
  "correlationId",
  "schemaVersion"
]);
const PROBE_RESULT_KEYS = Object.freeze([
  "requestProjection",
  "responseStatus",
  "responseRequestIdHeader",
  "response"
]);
const PROBLEM_KEYS = Object.freeze([
  "type",
  "title",
  "status",
  "detail",
  "instance",
  "code",
  "requestId",
  "schemaVersion"
]);
const FORBIDDEN_RESPONSE_KEY_FRAGMENT = Object.freeze([
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
  "password",
  "secret",
  "apikey",
  "requestheader",
  "requestbody",
  "rawpii"
]);
const FORBIDDEN_RESPONSE_VALUE = Object.freeze([
  /^0x[0-9a-f]{40}$/i,
  /^0x[0-9a-f]{130}$/i,
  /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/,
  /-----BEGIN [A-Z0-9 ]+-----/,
  /(?:^|;\s*)(?:session|auth|token|csrf|jwt|cookie)[A-Za-z0-9_.-]*=[^;\s]+/i,
  /^(?:bearer|basic)\s+\S+/i
]);

export class M1BRiskBoundaryResponseCaptureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BRiskBoundaryResponseCaptureError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BRiskBoundaryResponseCaptureError(code, message);
}

function plainObject(value) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}

function exactKeys(value, keys) {
  return plainObject(value) && Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function canonicalIso(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? parsed.toISOString()
    : null;
}

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inspectProblemResponse(value, depth = 0) {
  if (depth > 8) {
    fail("m1_b_risk_boundary_response_unsafe", "Risk denial response is too deep.");
  }
  if (typeof value === "string") {
    if (FORBIDDEN_RESPONSE_VALUE.some((pattern) => pattern.test(value))) {
      fail(
        "m1_b_risk_boundary_response_unsafe",
        "Risk denial response contains forbidden material."
      );
    }
    return;
  }
  if (value === null || ["number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    if (value.length > 64) {
      fail("m1_b_risk_boundary_response_unsafe", "Risk denial response is too large.");
    }
    value.forEach((entry) => inspectProblemResponse(entry, depth + 1));
    return;
  }
  if (!plainObject(value) || Object.keys(value).length > 64) {
    fail(
      "m1_b_risk_boundary_response_unsafe",
      "Risk denial response is not bounded plain JSON."
    );
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (FORBIDDEN_RESPONSE_KEY_FRAGMENT.some((fragment) => normalized.includes(fragment))) {
      fail(
        "m1_b_risk_boundary_response_unsafe",
        `Risk denial response field ${key} is forbidden.`
      );
    }
    inspectProblemResponse(entry, depth + 1);
  }
}

function loopback(location) {
  return location?.protocol === "http:" &&
    new Set(["127.0.0.1", "localhost"]).has(location?.hostname);
}

function validRuntime(runtime) {
  return exactKeys(runtime, RUNTIME_KEYS) &&
    runtime.connected === true &&
    runtime.authenticationMethod === "siwe" &&
    runtime.authenticationProfile === "local_no_funds" &&
    runtime.hostWorkspaceName === "risk";
}

function sameOperationIds(value) {
  return Array.isArray(value) && value.length === OPERATION_IDS.length &&
    value.every((operationId, index) => operationId === OPERATION_IDS[index]);
}

export function deriveM1BRiskBoundaryFreezeIdempotencyKey(challenge) {
  if (!CHALLENGE.test(challenge ?? "")) {
    fail("m1_b_risk_boundary_arm_invalid", "Risk boundary challenge is invalid.");
  }
  return challenge.replace(
    "m1_b_risk_boundary_",
    "idempotency_m1b_risk_freeze_"
  );
}

function parseArmToken(serialized, now) {
  if (
    typeof serialized !== "string" || serialized.length === 0 ||
    new TextEncoder().encode(serialized).byteLength > MAX_ARM_TOKEN_BYTES
  ) {
    fail("m1_b_risk_boundary_arm_invalid", "Risk boundary arm is missing or oversized.");
  }
  let token;
  try {
    token = JSON.parse(serialized);
  } catch {
    fail("m1_b_risk_boundary_arm_invalid", "Risk boundary arm is not closed JSON.");
  }
  const issuedAt = canonicalIso(token?.issuedAt);
  const expiresAt = canonicalIso(token?.expiresAt);
  if (
    !exactKeys(token, ARM_KEYS) ||
    token.schemaVersion !== M1_B_RISK_BOUNDARY_RESPONSE_ARM_SCHEMA_VERSION ||
    !CHALLENGE.test(token.challenge ?? "") ||
    !issuedAt || !expiresAt ||
    Date.parse(expiresAt) - Date.parse(issuedAt) !== ARM_TTL_MS ||
    Date.parse(issuedAt) > now.getTime() + 5_000 ||
    Date.parse(expiresAt) <= now.getTime() ||
    token.flow !== "risk_mfa_boundary" ||
    token.actorRole !== "risk_operations" ||
    token.authenticationMethod !== "siwe" ||
    token.authenticationProfile !== "local_no_funds" ||
    token.hostWorkspaceName !== "risk" ||
    token.responseSchemaVersion !== "problem_details.v1" ||
    !sameOperationIds(token.operationIds) ||
    !RESOURCE_IDENTIFIER.test(token.subjectId ?? "") ||
    token.reasonCode !== "security_incident" ||
    !READ_REQUEST_ID.test(token.readRequestId ?? "") ||
    !CORRELATION_ID.test(token.readCorrelationId ?? "") ||
    !FREEZE_REQUEST_ID.test(token.freezeRequestId ?? "") ||
    !CORRELATION_ID.test(token.freezeCorrelationId ?? "") ||
    token.readRequestId === token.freezeRequestId ||
    token.readCorrelationId === token.freezeCorrelationId
  ) {
    fail("m1_b_risk_boundary_arm_invalid", "Risk boundary arm is invalid or expired.");
  }
  return Object.freeze(structuredClone(token));
}

function validReadRequest(value, token) {
  return exactKeys(value, READ_REQUEST_KEYS) &&
    value.operationId === OPERATION_IDS[0] &&
    exactKeys(value.payload, []) &&
    value.requestId === token.readRequestId &&
    value.correlationId === token.readCorrelationId &&
    value.schemaVersion === "tenant_protocol_request.v1";
}

function validFreezeRequest(value, token) {
  return exactKeys(value, FREEZE_REQUEST_KEYS) &&
    value.operationId === OPERATION_IDS[1] &&
    exactKeys(value.payload, []) &&
    exactKeys(value.resource, ["resourceType", "resourceId"]) &&
    value.resource.resourceType === "subject" &&
    value.resource.resourceId === token.subjectId &&
    value.reasonCode === token.reasonCode &&
    value.idempotencyKey ===
      deriveM1BRiskBoundaryFreezeIdempotencyKey(token.challenge) &&
    value.requestId === token.freezeRequestId &&
    value.correlationId === token.freezeCorrelationId &&
    value.schemaVersion === "tenant_protocol_request.v1";
}

export function isExactM1BRiskBoundaryDeniedTransport({
  requestId,
  responseStatus,
  responseRequestIdHeader,
  response
}) {
  return REQUEST_IDENTIFIER.test(requestId ?? "") &&
    responseStatus === 404 &&
    responseRequestIdHeader === requestId &&
    exactKeys(response, PROBLEM_KEYS) &&
    response.type === "urn:ipo-one:problem:authorization_denied" &&
    typeof response.title === "string" &&
    response.title.length >= 1 && response.title.length <= 128 &&
    response.status === 404 &&
    typeof response.detail === "string" &&
    response.detail.length >= 1 && response.detail.length <= 1_024 &&
    response.instance === `urn:ipo-one:request:${requestId}` &&
    response.code === "authorization_denied" &&
    response.requestId === requestId &&
    response.schemaVersion === "problem_details.v1";
}

function validProbe(value, token, kind) {
  if (!exactKeys(value, PROBE_RESULT_KEYS)) return false;
  const requestValid = kind === "read"
    ? validReadRequest(value.requestProjection, token)
    : validFreezeRequest(value.requestProjection, token);
  if (
    !requestValid ||
    !isExactM1BRiskBoundaryDeniedTransport({
      requestId: value.requestProjection.requestId,
      responseStatus: value.responseStatus,
      responseRequestIdHeader: value.responseRequestIdHeader,
      response: value.response
    })
  ) return false;
  inspectProblemResponse(value.response);
  return new TextEncoder().encode(JSON.stringify(value.response)).byteLength <=
    MAX_PROBLEM_RESPONSE_BYTES;
}

function attemptForToken(token) {
  return Object.freeze({
    read: Object.freeze({
      operationId: OPERATION_IDS[0],
      payload: Object.freeze({}),
      requestId: token.readRequestId,
      correlationId: token.readCorrelationId,
      schemaVersion: "tenant_protocol_request.v1"
    }),
    freeze: Object.freeze({
      operationId: OPERATION_IDS[1],
      payload: Object.freeze({}),
      resource: Object.freeze({
        resourceType: "subject",
        resourceId: token.subjectId
      }),
      reasonCode: token.reasonCode,
      idempotencyKey:
        deriveM1BRiskBoundaryFreezeIdempotencyKey(token.challenge),
      requestId: token.freezeRequestId,
      correlationId: token.freezeCorrelationId,
      schemaVersion: "tenant_protocol_request.v1"
    })
  });
}

export function createM1BRiskBoundaryResponseCapture({
  location,
  getRuntimeState,
  now = () => new Date()
}) {
  if (!loopback(location) || typeof getRuntimeState !== "function" || typeof now !== "function") {
    fail("m1_b_risk_boundary_unavailable", "Risk boundary capture is unavailable.");
  }
  const usedChallenges = new Map();
  const listeners = new Set();
  let phase = "idle";
  let statusCode = "arm_required";
  let active = null;

  const snapshot = () => Object.freeze({
    phase,
    statusCode,
    runtimeAvailable: validRuntime(getRuntimeState()),
    operationCount: OPERATION_IDS.length
  });
  const notify = () => {
    const value = snapshot();
    listeners.forEach((listener) => listener(value));
    return value;
  };
  const invalidate = (code) => {
    active = null;
    phase = "failed";
    statusCode = code;
    return notify();
  };
  const activeExpired = () => Boolean(
    active && Date.parse(active.expiresAt) <= now().getTime()
  );
  const retainChallenge = (token) => {
    const currentTime = now().getTime();
    for (const [challenge, usedUntil] of usedChallenges) {
      if (usedUntil <= currentTime) usedChallenges.delete(challenge);
    }
    if (usedChallenges.has(token.challenge)) {
      fail(
        "m1_b_risk_boundary_challenge_reused",
        "Risk boundary arm challenge was already used."
      );
    }
    if (usedChallenges.size >= 16) {
      fail(
        "m1_b_risk_boundary_challenge_capacity",
        "Too many live Risk boundary challenges."
      );
    }
    usedChallenges.set(token.challenge, Date.parse(token.expiresAt));
  };

  return Object.freeze({
    subscribe(listener) {
      if (typeof listener !== "function") {
        fail("m1_b_risk_boundary_listener_invalid", "Risk boundary listener is invalid.");
      }
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    snapshot,
    refreshRuntime() {
      if (activeExpired()) return invalidate("arm_expired");
      if (active && !validRuntime(getRuntimeState())) {
        return invalidate("runtime_changed");
      }
      return notify();
    },
    arm(serialized) {
      const token = parseArmToken(serialized, now());
      if (phase === "armed" || phase === "running") {
        fail("m1_b_risk_boundary_busy", "A Risk boundary arm is already active.");
      }
      if (!validRuntime(getRuntimeState())) {
        fail(
          "m1_b_risk_boundary_runtime_mismatch",
          "Risk boundary arm requires the fresh Risk SIWE workspace."
        );
      }
      retainChallenge(token);
      active = token;
      phase = "armed";
      statusCode = "waiting_for_visible_probe_action";
      return notify();
    },
    begin() {
      if (activeExpired()) {
        invalidate("arm_expired");
        fail("m1_b_risk_boundary_unavailable", "Risk boundary arm expired.");
      }
      if (!active || phase !== "armed" || !validRuntime(getRuntimeState())) {
        if (active) invalidate("runtime_changed");
        fail("m1_b_risk_boundary_unavailable", "No valid Risk boundary arm is ready.");
      }
      phase = "running";
      statusCode = "two_fail_closed_probes_running";
      notify();
      return attemptForToken(active);
    },
    complete(result) {
      if (!active || phase !== "running") return false;
      if (activeExpired()) {
        invalidate("arm_expired");
        return false;
      }
      if (!validRuntime(getRuntimeState())) {
        invalidate("runtime_changed");
        return false;
      }
      const token = active;
      try {
        if (
          !exactKeys(result, ["read", "freeze"]) ||
          !validProbe(result.read, token, "read") ||
          !validProbe(result.freeze, token, "freeze")
        ) {
          fail(
            "m1_b_risk_boundary_result_invalid",
            "Risk boundary result is not the exact two-denial observation."
          );
        }
        active = null;
        phase = "consumed";
        statusCode = "two_denials_observed_and_discarded";
        notify();
        return true;
      } catch {
        invalidate("probe_result_rejected");
        return false;
      }
    },
    invalidate
  });
}
