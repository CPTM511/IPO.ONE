export const M1_B_ACCEPTANCE_DENIAL_RESPONSE_ARM_SCHEMA_VERSION =
  "m1_b_acceptance_denial_response_arm.v1";

const OPERATOR_RESPONSE_SCHEMA_VERSION =
  "m1_b_acceptance_operator_response.v1";
const ARM_TTL_MS = 15 * 60_000;
const READY_TTL_MS = 2 * 60_000;
const MAX_ARM_TOKEN_BYTES = 8 * 1024;
const MAX_OPERATOR_RESPONSE_BYTES = 256 * 1024;
const HASH = /^0x[0-9a-f]{64}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const RESOURCE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{1,255}$/;
const CHALLENGE =
  /^m1_b_denial_response_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ARM_KEYS = Object.freeze([
  "schemaVersion",
  "challenge",
  "issuedAt",
  "expiresAt",
  "flow",
  "sequence",
  "actorRole",
  "operationId",
  "responseSchemaVersion",
  "expectedStatus",
  "resourceId",
  "expectedOfferHash",
  "expectedTermsHash",
  "disclosureRef",
  "requestId",
  "correlationId"
]);
const RUNTIME_KEYS = Object.freeze([
  "connected",
  "authenticationMethod",
  "authenticationProfile",
  "workspaceKind",
  "hostWorkspaceName",
  "walletAuthorityAvailable"
]);
const REQUEST_KEYS = Object.freeze([
  "operationId",
  "resource",
  "payload",
  "requestId",
  "correlationId",
  "idempotencyKey",
  "schemaVersion"
]);
const CONFIRMATION_KEYS = Object.freeze([
  "actionType",
  "resourceId",
  "resourceHash",
  "payloadHash",
  "requestId",
  "requestNonce",
  "requestedAt",
  "confirmedAt",
  "expiresAt",
  "confirmationMethod",
  "confirmationHash",
  "messageHash",
  "rawSignaturePersisted",
  "blockchainTransactionSubmitted",
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

export class M1BAcceptanceDenialResponseCaptureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BAcceptanceDenialResponseCaptureError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BAcceptanceDenialResponseCaptureError(code, message);
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

function validReference(value) {
  return RESOURCE_IDENTIFIER.test(value ?? "") && value.length >= 8 &&
    value.length <= 512 && !/^data:/i.test(value);
}

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inspectProblemResponse(value, depth = 0) {
  if (depth > 8) fail("m1_b_denial_response_unsafe", "Denial response is too deep.");
  if (typeof value === "string") {
    if (FORBIDDEN_RESPONSE_VALUE.some((pattern) => pattern.test(value))) {
      fail("m1_b_denial_response_unsafe", "Denial response contains forbidden material.");
    }
    return;
  }
  if (value === null || ["number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    if (value.length > 64) fail("m1_b_denial_response_unsafe", "Denial response is too large.");
    value.forEach((entry) => inspectProblemResponse(entry, depth + 1));
    return;
  }
  if (!plainObject(value) || Object.keys(value).length > 64) {
    fail("m1_b_denial_response_unsafe", "Denial response is not bounded plain JSON.");
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (FORBIDDEN_RESPONSE_KEY_FRAGMENT.some((fragment) => normalized.includes(fragment))) {
      fail("m1_b_denial_response_unsafe", `Denial response field ${key} is forbidden.`);
    }
    inspectProblemResponse(entry, depth + 1);
  }
}

function expectedStatus(sequence) {
  return sequence === 4 ? "declined" : sequence === 9 ? "withdrawn" : null;
}

export function deriveM1BAcceptanceDenialIdempotencyKey(challenge) {
  if (!CHALLENGE.test(challenge ?? "")) {
    fail("m1_b_denial_arm_invalid", "Denial challenge is invalid.");
  }
  return challenge.replace(
    "m1_b_denial_response_",
    "idempotency_m1b_cp_denial_"
  );
}

export function isExactM1BAcceptanceExpectedDenialTransport({
  requestId,
  responseStatus,
  responseRequestIdHeader,
  response
}) {
  return REQUEST_IDENTIFIER.test(requestId ?? "") &&
    responseStatus === 404 &&
    responseRequestIdHeader === requestId &&
    plainObject(response) &&
    response.status === 404 &&
    response.code === "authorization_denied" &&
    response.requestId === requestId &&
    response.schemaVersion === "problem_details.v1";
}

function parseArmToken(serialized, now) {
  if (
    typeof serialized !== "string" || serialized.length === 0 ||
    new TextEncoder().encode(serialized).byteLength > MAX_ARM_TOKEN_BYTES
  ) fail("m1_b_denial_arm_invalid", "Denial arm token is missing or oversized.");
  let token;
  try {
    token = JSON.parse(serialized);
  } catch {
    fail("m1_b_denial_arm_invalid", "Denial arm token is not closed JSON.");
  }
  const issuedAt = canonicalIso(token?.issuedAt);
  const expiresAt = canonicalIso(token?.expiresAt);
  if (
    !exactKeys(token, ARM_KEYS) ||
    token.schemaVersion !== M1_B_ACCEPTANCE_DENIAL_RESPONSE_ARM_SCHEMA_VERSION ||
    !CHALLENGE.test(token.challenge ?? "") ||
    !issuedAt || !expiresAt ||
    Date.parse(expiresAt) - Date.parse(issuedAt) !== ARM_TTL_MS ||
    Date.parse(issuedAt) > now.getTime() + 5_000 ||
    Date.parse(expiresAt) <= now.getTime() ||
    token.flow !== "capital_partner" ||
    !new Set([4, 9]).has(token.sequence) ||
    token.actorRole !== "human" ||
    token.operationId !== "pilotAcceptCreditOffer" ||
    token.responseSchemaVersion !== "problem_details.v1" ||
    token.expectedStatus !== expectedStatus(token.sequence) ||
    !RESOURCE_IDENTIFIER.test(token.resourceId ?? "") ||
    !HASH.test(token.expectedOfferHash ?? "") ||
    !HASH.test(token.expectedTermsHash ?? "") ||
    !validReference(token.disclosureRef) ||
    !REQUEST_IDENTIFIER.test(token.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(token.correlationId ?? "")
  ) fail("m1_b_denial_arm_invalid", "Denial arm token is invalid, expired, or unsupported.");
  return Object.freeze(structuredClone(token));
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
    runtime.workspaceKind === "human_borrower" &&
    runtime.hostWorkspaceName === "borrower" &&
    runtime.walletAuthorityAvailable === true;
}

function validConfirmation(value, token) {
  return exactKeys(value, CONFIRMATION_KEYS) &&
    value.actionType === "accept_offer" &&
    value.resourceId === token.resourceId &&
    value.resourceHash === token.expectedOfferHash &&
    HASH.test(value.payloadHash ?? "") &&
    value.requestId === token.requestId &&
    /^human_action_confirmation_[0-9a-f-]{36}$/.test(value.requestNonce ?? "") &&
    canonicalIso(value.requestedAt) && canonicalIso(value.confirmedAt) &&
    canonicalIso(value.expiresAt) &&
    value.confirmationMethod === "wallet_personal_sign" &&
    HASH.test(value.confirmationHash ?? "") && HASH.test(value.messageHash ?? "") &&
    value.rawSignaturePersisted === false &&
    value.blockchainTransactionSubmitted === false &&
    value.schemaVersion === "economic_action_confirmation_result.v1";
}

function validRequestProjection(value, token) {
  return exactKeys(value, REQUEST_KEYS) &&
    value.operationId === token.operationId &&
    exactKeys(value.resource, ["resourceType", "resourceId"]) &&
    value.resource.resourceType === "credit_offer" &&
    value.resource.resourceId === token.resourceId &&
    exactKeys(value.payload, [
      "expectedOfferHash",
      "expectedTermsHash",
      "acknowledgementHash",
      "actionConfirmation"
    ]) &&
    value.payload.expectedOfferHash === token.expectedOfferHash &&
    value.payload.expectedTermsHash === token.expectedTermsHash &&
    HASH.test(value.payload.acknowledgementHash ?? "") &&
    validConfirmation(value.payload.actionConfirmation, token) &&
    value.requestId === token.requestId &&
    value.correlationId === token.correlationId &&
    value.idempotencyKey === deriveM1BAcceptanceDenialIdempotencyKey(token.challenge) &&
    value.schemaVersion === "tenant_protocol_request.v1";
}

export function createM1BAcceptanceDenialResponseCapture({
  location,
  getRuntimeState,
  now = () => new Date()
}) {
  if (!loopback(location) || typeof getRuntimeState !== "function" || typeof now !== "function") {
    fail("m1_b_denial_capture_unavailable", "Denial response capture is unavailable.");
  }
  const usedChallenges = new Map();
  const listeners = new Set();
  let phase = "idle";
  let statusCode = "arm_required";
  let active = null;
  let ready = null;

  const snapshot = () => Object.freeze({
    phase,
    statusCode,
    runtimeAvailable: validRuntime(getRuntimeState()),
    sequence: active?.sequence ?? ready?.sequence ?? null
  });
  const notify = () => {
    const value = snapshot();
    listeners.forEach((listener) => listener(value));
    return value;
  };
  const invalidate = (code) => {
    active = null;
    ready = null;
    phase = "failed";
    statusCode = code;
    return notify();
  };
  const activeExpired = () => Boolean(
    active && Date.parse(active.expiresAt) <= now().getTime()
  );
  const readyExpired = () => Boolean(
    ready && ready.copyExpiresAt <= now().getTime()
  );
  const retainChallenge = (token) => {
    const currentTime = now().getTime();
    for (const [challenge, usedUntil] of usedChallenges) {
      if (usedUntil <= currentTime) usedChallenges.delete(challenge);
    }
    if (usedChallenges.has(token.challenge)) {
      fail("m1_b_denial_challenge_reused", "Denial arm challenge was already used.");
    }
    if (usedChallenges.size >= 16) {
      fail("m1_b_denial_challenge_capacity", "Too many live denial challenges.");
    }
    usedChallenges.set(token.challenge, Date.parse(token.expiresAt));
  };

  return Object.freeze({
    subscribe(listener) {
      if (typeof listener !== "function") fail("m1_b_denial_listener_invalid", "Listener is invalid.");
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    snapshot,
    refreshRuntime() {
      if (activeExpired()) return invalidate("arm_expired");
      if (readyExpired()) return invalidate("copy_window_expired");
      if ((active || ready) && !validRuntime(getRuntimeState())) {
        return invalidate("runtime_changed");
      }
      return notify();
    },
    arm(serialized) {
      const token = parseArmToken(serialized, now());
      if (ready) fail("m1_b_denial_observation_pending", "Copy the pending denial first.");
      if (!validRuntime(getRuntimeState())) {
        fail("m1_b_denial_runtime_mismatch", "Denial token requires the invited Human workspace.");
      }
      retainChallenge(token);
      active = token;
      ready = null;
      phase = "armed";
      statusCode = "waiting_for_visible_denial_action";
      return notify();
    },
    begin() {
      if (activeExpired()) {
        invalidate("arm_expired");
        fail("m1_b_denial_unavailable", "Denial arm token expired.");
      }
      if (!active || phase !== "armed" || !validRuntime(getRuntimeState())) {
        if (active) invalidate("runtime_changed");
        fail("m1_b_denial_unavailable", "No valid denial response is armed.");
      }
      const token = active;
      phase = "running";
      statusCode = "wallet_confirmation_required";
      notify();
      return Object.freeze({
        operationId: token.operationId,
        resourceId: token.resourceId,
        expectedOfferHash: token.expectedOfferHash,
        expectedTermsHash: token.expectedTermsHash,
        disclosureRef: token.disclosureRef,
        requestId: token.requestId,
        correlationId: token.correlationId,
        idempotencyKey: deriveM1BAcceptanceDenialIdempotencyKey(token.challenge)
      });
    },
    complete({ requestProjection, response } = {}) {
      if (activeExpired()) {
        invalidate("arm_expired");
        return false;
      }
      const token = active;
      if (!token || phase !== "running" || !validRuntime(getRuntimeState())) {
        invalidate("runtime_changed");
        return false;
      }
      try {
        if (!validRequestProjection(requestProjection, token)) {
          fail("m1_b_denial_request_invalid", "Denied request projection is invalid.");
        }
        if (
          !plainObject(response) || response.schemaVersion !== "problem_details.v1" ||
          response.status !== 404 || response.code !== "authorization_denied" ||
          response.requestId !== token.requestId
        ) fail("m1_b_denial_response_invalid", "Denial response is not the exact fail-closed result.");
        inspectProblemResponse(response);
        const envelope = {
          schemaVersion: OPERATOR_RESPONSE_SCHEMA_VERSION,
          flow: token.flow,
          sequence: token.sequence,
          requestId: token.requestId,
          correlationId: token.correlationId,
          armChallenge: token.challenge,
          requestProjection: structuredClone(requestProjection),
          response: structuredClone(response)
        };
        if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MAX_OPERATOR_RESPONSE_BYTES) {
          fail("m1_b_denial_response_unsafe", "Denial response exceeds the capture limit.");
        }
        ready = {
          sequence: token.sequence,
          envelope: Object.freeze(envelope),
          copyExpiresAt: now().getTime() + READY_TTL_MS
        };
        active = null;
        phase = "ready";
        statusCode = "safe_denial_ready";
        notify();
        return true;
      } catch {
        invalidate("denial_rejected");
        return false;
      }
    },
    invalidate,
    consume() {
      if (readyExpired()) {
        invalidate("copy_window_expired");
        fail("m1_b_denial_unavailable", "Denial response copy window expired.");
      }
      if (!ready || !validRuntime(getRuntimeState())) {
        if (ready) invalidate("runtime_changed");
        fail("m1_b_denial_unavailable", "No safe denial response is ready.");
      }
      const value = structuredClone(ready.envelope);
      ready = null;
      active = null;
      phase = "consumed";
      statusCode = "denial_removed_after_copy";
      notify();
      return Object.freeze(value);
    }
  });
}
