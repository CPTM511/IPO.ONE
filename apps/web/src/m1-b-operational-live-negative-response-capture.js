export const M1_B_OPERATIONAL_LIVE_NEGATIVE_ARM_SCHEMA_VERSION =
  "m1_b_operational_live_negative_arm.v1";

const ARM_TTL_MS = 15 * 60_000;
const READY_TTL_MS = 2 * 60_000;
const MAX_ARM_TOKEN_BYTES = 8 * 1024;
const MAX_OPERATOR_RESPONSE_BYTES = 256 * 1024;
const HASH = /^0x[0-9a-f]{64}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const RESOURCE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{1,255}$/;
const CHALLENGE =
  /^m1_b_live_negative_response_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ARM_KEYS = Object.freeze([
  "schemaVersion", "challenge", "issuedAt", "expiresAt", "flow", "group",
  "id", "actorRole", "operationId", "responseSchemaVersion",
  "expectedStatus", "resourceType", "resourceId", "expectedOfferHash",
  "expectedTermsHash", "disclosureRef", "requestId", "correlationId"
]);
const RUNTIME_KEYS = Object.freeze([
  "connected", "authenticationMethod", "authenticationProfile",
  "workspaceKind", "hostWorkspaceName", "walletAuthorityAvailable"
]);
const OFFER_REQUEST_KEYS = Object.freeze([
  "operationId", "resource", "payload", "requestId", "correlationId",
  "idempotencyKey", "schemaVersion"
]);
const READ_REQUEST_KEYS = Object.freeze([
  "operationId", "resource", "payload", "requestId", "correlationId",
  "schemaVersion"
]);
const CONFIRMATION_KEYS = Object.freeze([
  "actionType", "resourceId", "resourceHash", "payloadHash", "requestId",
  "requestNonce", "requestedAt", "confirmedAt", "expiresAt",
  "confirmationMethod", "confirmationHash", "messageHash",
  "rawSignaturePersisted", "blockchainTransactionSubmitted", "schemaVersion"
]);
const FORBIDDEN_RESPONSE_KEY_FRAGMENT = Object.freeze([
  "authorization", "cookie", "csrf", "session", "token", "jwt",
  "signature", "walletaddress", "accountaddress", "privatekey", "seedphrase",
  "mnemonic", "password", "secret", "apikey", "requestheader", "requestbody",
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

const CASES = Object.freeze({
  "human:expired_offer": Object.freeze({
    actorRole: "human",
    operationId: "pilotAcceptCreditOffer",
    resourceType: "credit_offer",
    offerCommand: true
  }),
  "human:unauthorized_subject": Object.freeze({
    actorRole: "human",
    operationId: "pilotAcceptCreditOffer",
    resourceType: "credit_offer",
    offerCommand: true
  }),
  "authorization:cross_role_private_read": Object.freeze({
    actorRole: "capital_partner",
    operationId: "pilotReadOwnObligation",
    resourceType: "obligation",
    offerCommand: false
  })
});

export class M1BOperationalLiveNegativeCaptureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BOperationalLiveNegativeCaptureError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BOperationalLiveNegativeCaptureError(code, message);
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
  return typeof value === "string" && value.length >= 8 && value.length <= 512 &&
    !/[\u0000-\u001f\u007f]/.test(value) && !/^data:/i.test(value);
}

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inspectProblemResponse(value, depth = 0) {
  if (depth > 8) fail("m1_b_live_negative_unsafe", "Denial response is too deep.");
  if (typeof value === "string") {
    if (FORBIDDEN_RESPONSE_VALUE.some((pattern) => pattern.test(value))) {
      fail("m1_b_live_negative_unsafe", "Denial response contains forbidden material.");
    }
    return;
  }
  if (value === null || ["number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    if (value.length > 64) fail("m1_b_live_negative_unsafe", "Denial response is too large.");
    value.forEach((entry) => inspectProblemResponse(entry, depth + 1));
    return;
  }
  if (!plainObject(value) || Object.keys(value).length > 64) {
    fail("m1_b_live_negative_unsafe", "Denial response is not bounded plain JSON.");
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (FORBIDDEN_RESPONSE_KEY_FRAGMENT.some((fragment) => normalized.includes(fragment))) {
      fail("m1_b_live_negative_unsafe", `Denial response field ${key} is forbidden.`);
    }
    inspectProblemResponse(entry, depth + 1);
  }
}

export function deriveM1BOperationalLiveNegativeIdempotencyKey(challenge) {
  if (!CHALLENGE.test(challenge ?? "")) {
    fail("m1_b_live_negative_arm_invalid", "Live-negative challenge is invalid.");
  }
  return challenge.replace(
    "m1_b_live_negative_response_",
    "idempotency_m1b_live_negative_"
  );
}

function definition(token) {
  return CASES[`${token.group}:${token.id}`];
}

function parseArmToken(serialized, now) {
  if (
    typeof serialized !== "string" || serialized.length === 0 ||
    new TextEncoder().encode(serialized).byteLength > MAX_ARM_TOKEN_BYTES
  ) fail("m1_b_live_negative_arm_invalid", "Live-negative arm is missing or oversized.");
  let token;
  try {
    token = JSON.parse(serialized);
  } catch {
    fail("m1_b_live_negative_arm_invalid", "Live-negative arm is not closed JSON.");
  }
  const issuedAt = canonicalIso(token?.issuedAt);
  const expiresAt = canonicalIso(token?.expiresAt);
  const expected = definition(token ?? {});
  const offerFieldsValid = expected?.offerCommand
    ? HASH.test(token.expectedOfferHash ?? "") &&
      HASH.test(token.expectedTermsHash ?? "") && validReference(token.disclosureRef)
    : token?.expectedOfferHash === null && token?.expectedTermsHash === null &&
      token?.disclosureRef === null;
  if (
    !exactKeys(token, ARM_KEYS) ||
    token.schemaVersion !== M1_B_OPERATIONAL_LIVE_NEGATIVE_ARM_SCHEMA_VERSION ||
    !CHALLENGE.test(token.challenge ?? "") || !issuedAt || !expiresAt ||
    Date.parse(expiresAt) - Date.parse(issuedAt) !== ARM_TTL_MS ||
    Date.parse(issuedAt) > now.getTime() + 5_000 ||
    Date.parse(expiresAt) <= now.getTime() ||
    token.flow !== "operational_live_negative" || !expected ||
    token.actorRole !== expected.actorRole ||
    token.operationId !== expected.operationId ||
    token.responseSchemaVersion !== "problem_details.v1" ||
    token.expectedStatus !== 404 || token.resourceType !== expected.resourceType ||
    !RESOURCE_IDENTIFIER.test(token.resourceId ?? "") || !offerFieldsValid ||
    !REQUEST_IDENTIFIER.test(token.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(token.correlationId ?? "")
  ) fail("m1_b_live_negative_arm_invalid", "Live-negative arm is invalid or expired.");
  return Object.freeze({ token: Object.freeze(structuredClone(token)), expected });
}

function loopback(location) {
  return location?.protocol === "http:" &&
    new Set(["127.0.0.1", "localhost"]).has(location?.hostname);
}

function validRuntime(runtime, actorRole) {
  const expected = actorRole === "human"
    ? { workspaceKind: "human_borrower", hostWorkspaceName: "borrower" }
    : { workspaceKind: "capital_partner", hostWorkspaceName: "capitalPartner" };
  return exactKeys(runtime, RUNTIME_KEYS) && runtime.connected === true &&
    runtime.authenticationMethod === "siwe" &&
    runtime.authenticationProfile === "local_no_funds" &&
    runtime.workspaceKind === expected.workspaceKind &&
    runtime.hostWorkspaceName === expected.hostWorkspaceName &&
    runtime.walletAuthorityAvailable === true;
}

function validConfirmation(value, token) {
  return exactKeys(value, CONFIRMATION_KEYS) && value.actionType === "accept_offer" &&
    value.resourceId === token.resourceId &&
    value.resourceHash === token.expectedOfferHash && HASH.test(value.payloadHash ?? "") &&
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

function validRequestProjection(value, token, expected) {
  if (
    !exactKeys(value, expected.offerCommand ? OFFER_REQUEST_KEYS : READ_REQUEST_KEYS) ||
    value.operationId !== token.operationId ||
    !exactKeys(value.resource, ["resourceType", "resourceId"]) ||
    value.resource.resourceType !== token.resourceType ||
    value.resource.resourceId !== token.resourceId ||
    value.requestId !== token.requestId || value.correlationId !== token.correlationId ||
    value.schemaVersion !== "tenant_protocol_request.v1"
  ) return false;
  if (!expected.offerCommand) return exactKeys(value.payload, []);
  return exactKeys(value.payload, [
    "expectedOfferHash", "expectedTermsHash", "acknowledgementHash",
    "actionConfirmation"
  ]) && value.payload.expectedOfferHash === token.expectedOfferHash &&
    value.payload.expectedTermsHash === token.expectedTermsHash &&
    HASH.test(value.payload.acknowledgementHash ?? "") &&
    validConfirmation(value.payload.actionConfirmation, token) &&
    value.idempotencyKey ===
      deriveM1BOperationalLiveNegativeIdempotencyKey(token.challenge);
}

export function isExactM1BOperationalLiveNegativeProblem({
  requestId,
  responseStatus,
  responseRequestIdHeader,
  response
}) {
  return REQUEST_IDENTIFIER.test(requestId ?? "") && responseStatus === 404 &&
    responseRequestIdHeader === requestId && plainObject(response) &&
    response.status === 404 && response.code === "authorization_denied" &&
    response.requestId === requestId && response.schemaVersion === "problem_details.v1";
}

export function createM1BOperationalLiveNegativeResponseCapture({
  location,
  getRuntimeState,
  now = () => new Date()
}) {
  if (!loopback(location) || typeof getRuntimeState !== "function" || typeof now !== "function") {
    fail("m1_b_live_negative_unavailable", "Live-negative capture is unavailable.");
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
    runtimeAvailable: active || ready
      ? validRuntime(getRuntimeState(), (active?.token ?? ready?.token).actorRole)
      : ["human", "capital_partner"].some((role) => validRuntime(getRuntimeState(), role)),
    group: active?.token.group ?? ready?.token.group ?? null,
    id: active?.token.id ?? ready?.token.id ?? null,
    readOnly: active ? !active.expected.offerCommand : ready ? !ready.expected.offerCommand : false
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
  const expired = () => Boolean(
    active && Date.parse(active.token.expiresAt) <= now().getTime()
  );
  const copyExpired = () => Boolean(ready && ready.copyExpiresAt <= now().getTime());

  return Object.freeze({
    subscribe(listener) {
      if (typeof listener !== "function") fail("m1_b_live_negative_listener_invalid", "Listener is invalid.");
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    snapshot,
    refreshRuntime() {
      if (expired()) return invalidate("arm_expired");
      if (copyExpired()) return invalidate("copy_window_expired");
      const token = active?.token ?? ready?.token;
      if (token && !validRuntime(getRuntimeState(), token.actorRole)) {
        return invalidate("runtime_changed");
      }
      return notify();
    },
    arm(serialized) {
      const parsed = parseArmToken(serialized, now());
      if (ready) fail("m1_b_live_negative_pending", "Copy the pending denial first.");
      if (!validRuntime(getRuntimeState(), parsed.token.actorRole)) {
        fail("m1_b_live_negative_runtime_mismatch", "Arm does not match this workspace.");
      }
      for (const [challenge, usedUntil] of usedChallenges) {
        if (usedUntil <= now().getTime()) usedChallenges.delete(challenge);
      }
      if (usedChallenges.has(parsed.token.challenge)) {
        fail("m1_b_live_negative_challenge_reused", "Challenge was already used.");
      }
      if (usedChallenges.size >= 16) {
        fail("m1_b_live_negative_challenge_capacity", "Too many live challenges.");
      }
      usedChallenges.set(parsed.token.challenge, Date.parse(parsed.token.expiresAt));
      active = parsed;
      ready = null;
      phase = "armed";
      statusCode = "waiting_for_visible_denial";
      return notify();
    },
    begin() {
      if (expired()) {
        invalidate("arm_expired");
        fail("m1_b_live_negative_unavailable", "Live-negative arm expired.");
      }
      if (!active || phase !== "armed" ||
        !validRuntime(getRuntimeState(), active.token.actorRole)) {
        if (active) invalidate("runtime_changed");
        fail("m1_b_live_negative_unavailable", "No exact live denial is armed.");
      }
      const { token, expected } = active;
      phase = "running";
      statusCode = expected.offerCommand
        ? "wallet_confirmation_required"
        : "read_only_denial_running";
      notify();
      return Object.freeze({
        kind: expected.offerCommand ? "offer_denial" : "cross_role_read_denial",
        operationId: token.operationId,
        resourceType: token.resourceType,
        resourceId: token.resourceId,
        expectedOfferHash: token.expectedOfferHash,
        expectedTermsHash: token.expectedTermsHash,
        disclosureRef: token.disclosureRef,
        requestId: token.requestId,
        correlationId: token.correlationId,
        idempotencyKey: expected.offerCommand
          ? deriveM1BOperationalLiveNegativeIdempotencyKey(token.challenge)
          : null
      });
    },
    complete({ requestProjection, response } = {}) {
      const parsed = active;
      if (expired()) {
        invalidate("arm_expired");
        return false;
      }
      if (!parsed || phase !== "running" ||
        !validRuntime(getRuntimeState(), parsed.token.actorRole)) {
        invalidate("runtime_changed");
        return false;
      }
      try {
        if (!validRequestProjection(requestProjection, parsed.token, parsed.expected)) {
          fail("m1_b_live_negative_request_invalid", "Denied request is invalid.");
        }
        if (!isExactM1BOperationalLiveNegativeProblem({
          requestId: parsed.token.requestId,
          responseStatus: response?.status,
          responseRequestIdHeader: response?.requestId,
          response
        })) fail("m1_b_live_negative_response_invalid", "Response is not exact fail-closed truth.");
        inspectProblemResponse(response);
        const envelope = {
          schemaVersion: "m1_b_operational_live_negative_response.v2",
          group: parsed.token.group,
          id: parsed.token.id,
          requestId: parsed.token.requestId,
          correlationId: parsed.token.correlationId,
          armChallenge: parsed.token.challenge,
          requestProjection: structuredClone(requestProjection),
          response: structuredClone(response)
        };
        if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MAX_OPERATOR_RESPONSE_BYTES) {
          fail("m1_b_live_negative_unsafe", "Live-negative response is oversized.");
        }
        ready = {
          token: parsed.token,
          expected: parsed.expected,
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
      if (copyExpired()) {
        invalidate("copy_window_expired");
        fail("m1_b_live_negative_unavailable", "Copy window expired.");
      }
      if (!ready || !validRuntime(getRuntimeState(), ready.token.actorRole)) {
        if (ready) invalidate("runtime_changed");
        fail("m1_b_live_negative_unavailable", "No safe denial is ready.");
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
