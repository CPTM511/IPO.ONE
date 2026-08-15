export const M1_B_ACCEPTANCE_NORMAL_RESPONSE_ARM_SCHEMA_VERSION =
  "m1_b_acceptance_normal_response_arm.v1";
export const M1_B_ACCEPTANCE_NORMAL_RESPONSE_CLOCK_DOMAIN =
  "lima_exact_pilot_vm_system_clock";

const OPERATOR_RESPONSE_SCHEMA_VERSION =
  "m1_b_acceptance_operator_response.v1";
const TENANT_RESULT_SCHEMA_VERSION = "tenant_protocol_result.v1";
const ARM_TTL_MS = 15 * 60_000;
const READY_TTL_MS = 2 * 60_000;
const MAX_ARM_TOKEN_BYTES = 4 * 1024;
const MAX_OPERATOR_RESPONSE_BYTES = 256 * 1024;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const CHALLENGE =
  /^m1_b_normal_response_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const DEFINITIONS = Object.freeze([
  ["human", 1, "human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2", true, []],
  ["human", 2, "human", "pilotAcceptCreditOffer", "tenant_credit_offer_accepted.v1", false, ["pilotReadWorkspaceResume"]],
  ["human", 3, "human", "pilotExecuteSandboxObligation", "tenant_sandbox_obligation_executed.v1", false, []],
  ["human", 4, "human", "pilotPostSandboxRepayment", "tenant_sandbox_repayment_posted.v1", false, []],
  ["human", 5, "human", "pilotReadOwnObligationEvidence", "tenant_owned_obligation_evidence_view.v1", true, []],
  ["capital_partner", 1, "capital_partner", "pilotReadCapitalPartnerSelf", "tenant_capital_partner_self_view.v1", true, []],
  ["capital_partner", 2, "capital_partner", "pilotReadCapitalPartnerPassportInbox", "tenant_capital_partner_passport_inbox_view.v1", true, ["pilotReadCapitalPartnerSelf"]],
  ["capital_partner", 3, "capital_partner", "pilotAuthorCapitalPartnerOffer", "tenant_capital_partner_offer_authored.v1", false, ["pilotReadCapitalPartnerPassportInbox"]],
  ["capital_partner", 5, "human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2", true, []],
  ["capital_partner", 6, "capital_partner", "pilotReadCapitalPartnerPassportInbox", "tenant_capital_partner_passport_inbox_view.v1", true, ["pilotReadCapitalPartnerSelf"]],
  ["capital_partner", 7, "capital_partner", "pilotAuthorCapitalPartnerOffer", "tenant_capital_partner_offer_authored.v1", false, ["pilotReadCapitalPartnerPassportInbox"]],
  ["capital_partner", 8, "capital_partner", "pilotTransitionCapitalPartnerOffer", "tenant_capital_partner_offer_transitioned.v1", false, []],
  ["capital_partner", 10, "human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2", true, []],
  ["expired_offer_setup", 1, "capital_partner", "pilotReadCapitalPartnerPassportInbox", "tenant_capital_partner_passport_inbox_view.v1", true, ["pilotReadCapitalPartnerSelf"]],
  ["expired_offer_setup", 2, "capital_partner", "pilotAuthorCapitalPartnerOffer", "tenant_capital_partner_offer_authored.v1", false, ["pilotReadCapitalPartnerPassportInbox"]]
].map(([
  flow, sequence, actorRole, operationId, responseSchemaVersion, readOnly,
  permittedPreflightOperationIds
]) => Object.freeze({
  flow,
  sequence,
  actorRole,
  operationId,
  responseSchemaVersion,
  readOnly,
  permittedPreflightOperationIds: Object.freeze(permittedPreflightOperationIds)
})));

export const M1_B_ACCEPTANCE_NORMAL_RESPONSE_DEFINITIONS = DEFINITIONS;

const ARM_KEYS = Object.freeze([
  "schemaVersion",
  "challenge",
  "clockDomain",
  "issuedAt",
  "expiresAt",
  "flow",
  "sequence",
  "actorRole",
  "operationId",
  "responseSchemaVersion"
]);
const TENANT_RESULT_KEYS = Object.freeze([
  "operationId",
  "replayed",
  "response",
  "schemaVersion"
]);
const RUNTIME_KEYS = Object.freeze([
  "connected",
  "authenticationMethod",
  "authenticationProfile",
  "workspaceKind",
  "hostWorkspaceName",
  "walletAuthorityAvailable"
]);
const SAFE_FALSE_CAPTURE_KEYS = new Set([
  "rawsignaturepersisted",
  "walletaddressincluded",
  "sessionmaterialincluded"
]);
const FORBIDDEN_CAPTURE_KEY_FRAGMENT = Object.freeze([
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
  "actionconfirmation",
  "idempotency",
  "selectedclaims",
  "disclosures",
  "issuer",
  "rawpii"
]);
const FORBIDDEN_CAPTURE_VALUE = Object.freeze([
  /^0x[0-9a-f]{40}$/i,
  /^0x[0-9a-f]{130}$/i,
  /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/,
  /-----BEGIN [A-Z0-9 ]+-----/,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/\S+/i,
  /(?:^|;\s*)(?:session|auth|token|csrf|jwt|cookie)[A-Za-z0-9_.-]*=[^;\s]+/i,
  /^(?:bearer|basic)\s+\S+/i
]);

export class M1BAcceptanceNormalResponseCaptureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BAcceptanceNormalResponseCaptureError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BAcceptanceNormalResponseCaptureError(code, message);
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

function iso(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? parsed.toISOString()
    : null;
}

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inspectSafeResponse(value, depth = 0) {
  if (depth > 12) fail("m1_b_capture_response_unsafe", "Response is too deep.");
  if (typeof value === "string") {
    if (FORBIDDEN_CAPTURE_VALUE.some((pattern) => pattern.test(value))) {
      fail("m1_b_capture_response_unsafe", "Response contains forbidden material.");
    }
    return;
  }
  if (value === null || ["number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    if (value.length > 256) {
      fail("m1_b_capture_response_unsafe", "Response contains too many entries.");
    }
    value.forEach((entry) => inspectSafeResponse(entry, depth + 1));
    return;
  }
  if (!plainObject(value) || Object.keys(value).length > 128) {
    fail("m1_b_capture_response_unsafe", "Response is not bounded plain JSON.");
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    const safeFalse = SAFE_FALSE_CAPTURE_KEYS.has(normalized) && entry === false;
    if (
      !safeFalse &&
      FORBIDDEN_CAPTURE_KEY_FRAGMENT.some((fragment) => normalized.includes(fragment))
    ) {
      fail("m1_b_capture_response_unsafe", `Response field ${key} is forbidden.`);
    }
    inspectSafeResponse(entry, depth + 1);
  }
}

function definitionFor(token) {
  return DEFINITIONS.find((definition) =>
    definition.flow === token.flow &&
    definition.sequence === token.sequence &&
    definition.actorRole === token.actorRole &&
    definition.operationId === token.operationId &&
    definition.responseSchemaVersion === token.responseSchemaVersion
  );
}

function parseArmToken(serialized, now) {
  if (
    typeof serialized !== "string" || serialized.length === 0 ||
    new TextEncoder().encode(serialized).byteLength > MAX_ARM_TOKEN_BYTES
  ) fail("m1_b_capture_arm_invalid", "Arm token is missing or oversized.");
  let token;
  try {
    token = JSON.parse(serialized);
  } catch {
    fail("m1_b_capture_arm_invalid", "Arm token is not closed JSON.");
  }
  const issuedAt = iso(token?.issuedAt);
  const expiresAt = iso(token?.expiresAt);
  const definition = definitionFor(token ?? {});
  if (
    !exactKeys(token, ARM_KEYS) ||
    token.schemaVersion !== M1_B_ACCEPTANCE_NORMAL_RESPONSE_ARM_SCHEMA_VERSION ||
    !CHALLENGE.test(token.challenge ?? "") ||
    token.clockDomain !== M1_B_ACCEPTANCE_NORMAL_RESPONSE_CLOCK_DOMAIN ||
    !issuedAt || !expiresAt ||
    Date.parse(expiresAt) - Date.parse(issuedAt) !== ARM_TTL_MS ||
    Date.parse(issuedAt) > now.getTime() + 5_000 ||
    Date.parse(expiresAt) <= now.getTime() ||
    !definition
  ) fail("m1_b_capture_arm_invalid", "Arm token is invalid, expired, or unsupported.");
  return Object.freeze({ token: Object.freeze(structuredClone(token)), definition });
}

function expectedRuntime(actorRole) {
  return actorRole === "human"
    ? Object.freeze({ workspaceKind: "human_borrower", hostWorkspaceName: "borrower" })
    : Object.freeze({ workspaceKind: "capital_partner", hostWorkspaceName: "capitalPartner" });
}

function validRuntime(runtime, actorRole) {
  const expected = expectedRuntime(actorRole);
  return exactKeys(runtime, RUNTIME_KEYS) &&
    runtime.connected === true &&
    runtime.authenticationMethod === "siwe" &&
    runtime.authenticationProfile === "local_no_funds" &&
    runtime.workspaceKind === expected.workspaceKind &&
    runtime.hostWorkspaceName === expected.hostWorkspaceName &&
    runtime.walletAuthorityAvailable === true;
}

function loopback(location) {
  return location?.protocol === "http:" &&
    new Set(["127.0.0.1", "localhost"]).has(location?.hostname);
}

export function createM1BAcceptanceNormalResponseCapture({
  location,
  getRuntimeState,
  now = () => new Date()
}) {
  if (!loopback(location) || typeof getRuntimeState !== "function" || typeof now !== "function") {
    fail("m1_b_capture_unavailable", "Normal-response capture is unavailable.");
  }
  const usedChallenges = new Map();
  const listeners = new Set();
  let phase = "idle";
  let statusCode = "arm_required";
  let active = null;
  let ready = null;
  let armEpoch = 0;

  const snapshot = () => Object.freeze({
    phase,
    statusCode,
    runtimeAvailable: ["human", "capital_partner"].some((role) =>
      validRuntime(getRuntimeState(), role)
    ),
    flow: active?.token.flow ?? ready?.definition.flow ?? null,
    sequence: active?.token.sequence ?? ready?.definition.sequence ?? null,
    operationId: active?.definition.operationId ?? ready?.definition.operationId ?? null,
    readOnly: active?.definition.readOnly ?? ready?.definition.readOnly ?? false,
    armEpoch: active?.armEpoch ?? ready?.armEpoch ?? armEpoch
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
  const retainUsedChallenge = (challenge, expiresAt) => {
    const currentTime = now().getTime();
    for (const [usedChallenge, usedUntil] of usedChallenges) {
      if (usedUntil <= currentTime) usedChallenges.delete(usedChallenge);
    }
    if (usedChallenges.size >= 64) {
      fail(
        "m1_b_capture_challenge_capacity",
        "Too many live arm challenges; wait for the oldest token to expire."
      );
    }
    usedChallenges.set(challenge, Date.parse(expiresAt));
  };
  const activeExpired = () => Boolean(
    active && Date.parse(active.token.expiresAt) <= now().getTime()
  );
  const readyExpired = () => Boolean(
    ready && ready.copyExpiresAt <= now().getTime()
  );

  return Object.freeze({
    subscribe(listener) {
      if (typeof listener !== "function") fail("m1_b_capture_listener_invalid", "Listener is invalid.");
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    snapshot,
    refreshRuntime() {
      const runtimeAvailable = ["human", "capital_partner"].some((role) =>
        validRuntime(getRuntimeState(), role)
      );
      const actorRole = active?.definition.actorRole ?? ready?.definition.actorRole;
      if (activeExpired()) return invalidate("arm_expired");
      if (readyExpired()) return invalidate("copy_window_expired");
      if (actorRole && !validRuntime(getRuntimeState(), actorRole)) {
        return invalidate("runtime_changed");
      }
      if (!runtimeAvailable && (active || ready)) return invalidate("runtime_changed");
      return notify();
    },
    arm(serialized) {
      if (ready) fail("m1_b_capture_observation_pending", "Copy the pending response first.");
      if (active) {
        invalidate("rearm_rejected");
        fail(
          "m1_b_capture_rearm_rejected",
          "An armed capture must fail closed before another token can be armed."
        );
      }
      const parsed = parseArmToken(serialized, now());
      if (!validRuntime(getRuntimeState(), parsed.definition.actorRole)) {
        fail("m1_b_capture_runtime_mismatch", "Arm token does not match this authenticated workspace.");
      }
      if (usedChallenges.has(parsed.token.challenge)) {
        fail("m1_b_capture_challenge_reused", "Arm challenge was already used.");
      }
      retainUsedChallenge(parsed.token.challenge, parsed.token.expiresAt);
      armEpoch += 1;
      active = {
        token: parsed.token,
        definition: parsed.definition,
        armEpoch,
        remainingPreflights: [...parsed.definition.permittedPreflightOperationIds],
        inFlight: null
      };
      ready = null;
      phase = "armed";
      statusCode = "waiting_for_normal_ui_action";
      return notify();
    },
    acquireRequestPermit(operationId) {
      if (!active || ready) return null;
      if (activeExpired()) {
        invalidate("arm_expired");
        return null;
      }
      if (!validRuntime(getRuntimeState(), active.definition.actorRole)) {
        invalidate("runtime_changed");
        return null;
      }
      if (active.inFlight) {
        invalidate("concurrent_request_started");
        return null;
      }
      const preflightOperationId = active.remainingPreflights[0];
      const kind = operationId === preflightOperationId
        ? "preflight"
        : operationId === active.definition.operationId
          ? "target"
          : null;
      if (!kind) {
        invalidate("unexpected_operation_started");
        return null;
      }
      const permit = Object.freeze({});
      active.inFlight = Object.freeze({
        permit,
        operationId,
        kind,
        armEpoch: active.armEpoch
      });
      statusCode = kind === "target"
        ? "target_request_in_flight"
        : "preflight_request_in_flight";
      notify();
      return permit;
    },
    observeTenantApiResult({
      requestedOperationId,
      requestPermit,
      requestId,
      responseRequestIdHeader,
      correlationId,
      result
    }) {
      if (!active || ready) return false;
      if (activeExpired()) {
        invalidate("arm_expired");
        return false;
      }
      if (!validRuntime(getRuntimeState(), active.definition.actorRole)) {
        invalidate("runtime_changed");
        return false;
      }
      const inFlight = active.inFlight;
      if (
        !inFlight || requestPermit !== inFlight.permit ||
        requestedOperationId !== inFlight.operationId ||
        inFlight.armEpoch !== active.armEpoch
      ) {
        invalidate("request_permit_invalid");
        return false;
      }
      if (
        !REQUEST_IDENTIFIER.test(requestedOperationId ?? "") ||
        !REQUEST_IDENTIFIER.test(requestId ?? "") ||
        responseRequestIdHeader !== requestId ||
        !REQUEST_IDENTIFIER.test(correlationId ?? "") ||
        !exactKeys(result, TENANT_RESULT_KEYS) ||
        result.schemaVersion !== TENANT_RESULT_SCHEMA_VERSION ||
        result.operationId !== requestedOperationId ||
        result.replayed !== false ||
        !plainObject(result.response)
      ) {
        invalidate("tenant_result_invalid");
        return false;
      }
      const definition = active.definition;
      if (inFlight.kind === "preflight") {
        if (active.remainingPreflights[0] === requestedOperationId) {
          active.remainingPreflights.shift();
          active.inFlight = null;
          statusCode = "preflight_observed";
          notify();
          return false;
        }
        invalidate("unexpected_operation_observed");
        return false;
      }
      try {
        if (result.response.schemaVersion !== definition.responseSchemaVersion) {
          fail("m1_b_capture_response_invalid", "Response schema does not match the arm token.");
        }
        inspectSafeResponse(result.response);
        const envelope = {
          schemaVersion: OPERATOR_RESPONSE_SCHEMA_VERSION,
          flow: active.token.flow,
          sequence: active.token.sequence,
          requestId,
          correlationId,
          armChallenge: active.token.challenge,
          armIssuedAt: active.token.issuedAt,
          armClockDomain: active.token.clockDomain,
          response: structuredClone(result.response)
        };
        if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MAX_OPERATOR_RESPONSE_BYTES) {
          fail("m1_b_capture_response_unsafe", "Response exceeds the bounded capture size.");
        }
        ready = {
          definition,
          armEpoch: active.armEpoch,
          envelope: Object.freeze(envelope),
          copyExpiresAt: now().getTime() + READY_TTL_MS
        };
        active = null;
        phase = "ready";
        statusCode = "safe_response_ready";
        notify();
        return true;
      } catch {
        invalidate("response_rejected");
        return false;
      }
    },
    noteRejectedOperation({ requestedOperationId, requestPermit } = {}) {
      if (!active || ready) return false;
      const inFlight = active.inFlight;
      if (
        !inFlight || requestPermit !== inFlight.permit ||
        requestedOperationId !== inFlight.operationId ||
        inFlight.armEpoch !== active.armEpoch
      ) {
        invalidate("request_permit_invalid");
        return true;
      }
      invalidate(
        inFlight.kind === "target"
          ? "target_operation_rejected"
          : "preflight_operation_rejected"
      );
      return true;
    },
    armedReadOperation() {
      if (activeExpired()) {
        invalidate("arm_expired");
        return null;
      }
      return active?.definition.readOnly === true && !active.inFlight
        ? active.definition.operationId
        : null;
    },
    invalidate,
    consume() {
      if (readyExpired()) {
        invalidate("copy_window_expired");
        fail("m1_b_capture_response_unavailable", "Safe response copy window expired.");
      }
      if (!ready || !validRuntime(getRuntimeState(), ready.definition.actorRole)) {
        if (ready) invalidate("runtime_changed");
        fail("m1_b_capture_response_unavailable", "No safe response is ready.");
      }
      const value = structuredClone(ready.envelope);
      ready = null;
      active = null;
      phase = "consumed";
      statusCode = "response_removed_after_copy";
      notify();
      return Object.freeze(value);
    }
  });
}
