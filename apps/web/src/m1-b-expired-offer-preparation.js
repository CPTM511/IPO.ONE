const HEALTH_SCHEMA_VERSION = "tenant_transport_health.v1";
const HEALTH_PATH = "/tenant/v1/healthz";
const VALIDITY_MS = 105_000;
const MIN_SUBMISSION_REMAINING_MS = 90_000;
const MAX_SUBMISSION_REMAINING_MS = 120_000;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{1,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export class M1BExpiredOfferPreparationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BExpiredOfferPreparationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BExpiredOfferPreparationError(code, message);
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

function loopback(location) {
  return location?.protocol === "http:" &&
    new Set(["127.0.0.1", "localhost"]).has(location?.hostname);
}

function exactArmedAuthorState(state) {
  return plainObject(state) && state.phase === "armed" &&
    state.runtimeAvailable === true && state.flow === "expired_offer_setup" &&
    state.sequence === 2 && state.operationId === "pilotAuthorCapitalPartnerOffer" &&
    state.readOnly === false && Number.isSafeInteger(state.armEpoch) &&
    state.armEpoch >= 1;
}

function localDateTimeWithSeconds(timestamp) {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 19);
}

function canonicalHealth(body) {
  return exactKeys(body, ["status", "transport", "public", "schemaVersion"]) &&
    body.status === "ready" &&
    body.transport === "authenticated_http_loopback" &&
    body.public === false && body.schemaVersion === HEALTH_SCHEMA_VERSION;
}

export function createM1BExpiredOfferPreparation({
  location,
  fetchHealth,
  getCaptureState,
  getSelectedPassportId,
  validUntilControl,
  now = () => new Date(),
  randomUUID = () => globalThis.crypto.randomUUID()
}) {
  if (
    !loopback(location) || typeof fetchHealth !== "function" ||
    typeof getCaptureState !== "function" ||
    typeof getSelectedPassportId !== "function" ||
    !validUntilControl || typeof now !== "function" ||
    typeof randomUUID !== "function"
  ) {
    fail(
      "m1_b_expired_preparation_unavailable",
      "Expired-Offer preparation is unavailable."
    );
  }

  let prepared = null;

  const invalidate = () => {
    prepared = null;
  };

  return Object.freeze({
    snapshot() {
      return Object.freeze({
        ready: prepared !== null,
        validUntil: prepared?.validUntil ?? null,
        passportId: prepared?.passportId ?? null
      });
    },
    invalidate,
    async prepare() {
      const captureState = getCaptureState();
      const passportId = getSelectedPassportId();
      if (!exactArmedAuthorState(captureState) || !IDENTIFIER.test(passportId ?? "")) {
        invalidate();
        fail(
          "m1_b_expired_preparation_not_armed",
          "Arm the exact expired-Offer author response and select its Passport first."
        );
      }
      const requestId = `m1b_expired_health_${randomUUID()}`;
      if (!REQUEST_IDENTIFIER.test(requestId)) {
        invalidate();
        fail(
          "m1_b_expired_preparation_request_invalid",
          "Expired-Offer health request identity is invalid."
        );
      }
      let response;
      let body;
      try {
        response = await fetchHealth(HEALTH_PATH, {
          method: "GET",
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          headers: {
            accept: "application/json",
            "x-request-id": requestId
          }
        });
        body = await response.json();
      } catch {
        invalidate();
        fail(
          "m1_b_expired_preparation_health_failed",
          "Loopback server time is unavailable."
        );
      }
      const serverNow = Date.parse(response.headers?.get?.("date") ?? "");
      if (
        response.ok !== true || response.status !== 200 ||
        response.headers?.get?.("x-request-id") !== requestId ||
        response.headers?.get?.("cache-control") !== "no-store" ||
        !Number.isFinite(serverNow) || !canonicalHealth(body)
      ) {
        invalidate();
        fail(
          "m1_b_expired_preparation_health_invalid",
          "Loopback server identity or server time is invalid."
        );
      }
      const validUntil = new Date(serverNow + VALIDITY_MS).toISOString();
      validUntilControl.step = "1";
      validUntilControl.value = localDateTimeWithSeconds(Date.parse(validUntil));
      prepared = Object.freeze({
        armEpoch: captureState.armEpoch,
        passportId,
        preparedAtClientMs: now().getTime(),
        serverNow,
        validUntil,
        controlValue: validUntilControl.value
      });
      return Object.freeze({
        passportId,
        validUntil,
        validityMs: VALIDITY_MS,
        fundsAuthority: false
      });
    },
    consumeForSubmission() {
      const captureState = getCaptureState();
      const passportId = getSelectedPassportId();
      const current = prepared;
      prepared = null;
      if (
        !current || !exactArmedAuthorState(captureState) ||
        captureState.armEpoch !== current.armEpoch ||
        passportId !== current.passportId ||
        validUntilControl.value !== current.controlValue
      ) {
        fail(
          "m1_b_expired_preparation_stale",
          "Expired-Offer preparation changed before submission."
        );
      }
      const estimatedServerNow = current.serverNow +
        Math.max(0, now().getTime() - current.preparedAtClientMs);
      const remainingMs = Date.parse(current.validUntil) - estimatedServerNow;
      if (
        remainingMs < MIN_SUBMISSION_REMAINING_MS ||
        remainingMs > MAX_SUBMISSION_REMAINING_MS
      ) {
        fail(
          "m1_b_expired_preparation_stale",
          "Expired-Offer validity is outside the exact submission window."
        );
      }
      return Object.freeze({
        passportId,
        validUntil: current.validUntil,
        validityRemainingMs: remainingMs,
        fundsAuthority: false
      });
    }
  });
}

export const M1_B_EXPIRED_OFFER_PREPARATION_LIMITS = Object.freeze({
  validityMs: VALIDITY_MS,
  minimumSubmissionRemainingMs: MIN_SUBMISSION_REMAINING_MS,
  maximumSubmissionRemainingMs: MAX_SUBMISSION_REMAINING_MS
});
