import assert from "node:assert/strict";
import test from "node:test";
import {
  M1BExpiredOfferPreparationError,
  M1_B_EXPIRED_OFFER_PREPARATION_LIMITS,
  createM1BExpiredOfferPreparation
} from "../src/m1-b-expired-offer-preparation.js";

const SERVER_NOW = "2026-08-15T01:00:00.000Z";
const UUID = "01234567-89ab-4def-8123-456789abcdef";

function armedState(overrides = {}) {
  return {
    phase: "armed",
    statusCode: "waiting_for_operation",
    runtimeAvailable: true,
    flow: "expired_offer_setup",
    sequence: 2,
    operationId: "pilotAuthorCapitalPartnerOffer",
    readOnly: false,
    armEpoch: 7,
    ...overrides
  };
}

function response(overrides = {}) {
  const headers = new Map([
    ["date", SERVER_NOW],
    ["x-request-id", `m1b_expired_health_${UUID}`],
    ["cache-control", "no-store"]
  ]);
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => headers.get(name) ?? null },
    async json() {
      return {
        status: "ready",
        transport: "authenticated_http_loopback",
        public: false,
        schemaVersion: "tenant_transport_health.v1"
      };
    },
    ...overrides
  };
}

function fixture(overrides = {}) {
  let state = armedState();
  let passportId = "passport_expired_offer_c";
  let currentTime = Date.parse(SERVER_NOW);
  const validUntilControl = { value: "", step: "60" };
  const requests = [];
  const controller = createM1BExpiredOfferPreparation({
    location: { protocol: "http:", hostname: "127.0.0.1" },
    async fetchHealth(path, options) {
      requests.push({ path, options });
      return response();
    },
    getCaptureState: () => state,
    getSelectedPassportId: () => passportId,
    validUntilControl,
    now: () => new Date(currentTime),
    randomUUID: () => UUID,
    ...overrides
  });
  return {
    controller,
    requests,
    validUntilControl,
    advance(ms) { currentTime += ms; },
    setState(value) { state = value; },
    setPassportId(value) { passportId = value; }
  };
}

test("prepares exactly 105 seconds from validated loopback server time and consumes once", async () => {
  const value = fixture();
  const prepared = await value.controller.prepare();
  assert.deepEqual(prepared, {
    passportId: "passport_expired_offer_c",
    validUntil: "2026-08-15T01:01:45.000Z",
    validityMs: 105_000,
    fundsAuthority: false
  });
  assert.equal(value.validUntilControl.step, "1");
  assert.match(value.validUntilControl.value, /^2026-08-15T\d{2}:01:45$/);
  assert.deepEqual(value.requests[0], {
    path: "/tenant/v1/healthz",
    options: {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: {
        accept: "application/json",
        "x-request-id": `m1b_expired_health_${UUID}`
      }
    }
  });
  value.advance(5_000);
  assert.equal(value.controller.consumeForSubmission().validityRemainingMs, 100_000);
  assert.throws(
    () => value.controller.consumeForSubmission(),
    (error) => error.code === "m1_b_expired_preparation_stale"
  );
});

test("requires the exact armed author epoch, selected Passport, and unchanged control", async () => {
  for (const state of [
    armedState({ phase: "idle" }),
    armedState({ flow: "capital_partner" }),
    armedState({ sequence: 1 }),
    armedState({ operationId: "pilotReadCapitalPartnerPassportInbox" }),
    armedState({ armEpoch: null })
  ]) {
    const value = fixture();
    value.setState(state);
    await assert.rejects(
      value.controller.prepare(),
      (error) => error instanceof M1BExpiredOfferPreparationError &&
        error.code === "m1_b_expired_preparation_not_armed"
    );
  }
  const changed = fixture();
  await changed.controller.prepare();
  changed.setPassportId("passport_other");
  assert.throws(
    () => changed.controller.consumeForSubmission(),
    (error) => error.code === "m1_b_expired_preparation_stale"
  );
  const edited = fixture();
  await edited.controller.prepare();
  edited.validUntilControl.value = "2026-08-15T01:03:00";
  assert.throws(
    () => edited.controller.consumeForSubmission(),
    (error) => error.code === "m1_b_expired_preparation_stale"
  );
});

test("fails closed on invalid health identity, stale submission, or non-loopback origin", async () => {
  const badHealth = fixture({
    async fetchHealth() {
      return response({ status: 201 });
    }
  });
  await assert.rejects(
    badHealth.controller.prepare(),
    (error) => error.code === "m1_b_expired_preparation_health_invalid"
  );
  const stale = fixture();
  await stale.controller.prepare();
  stale.advance(16_000);
  assert.throws(
    () => stale.controller.consumeForSubmission(),
    (error) => error.code === "m1_b_expired_preparation_stale"
  );
  assert.throws(
    () => createM1BExpiredOfferPreparation({
      location: { protocol: "https:", hostname: "example.test" },
      fetchHealth: async () => response(),
      getCaptureState: armedState,
      getSelectedPassportId: () => "passport_expired_offer_c",
      validUntilControl: { value: "", step: "60" }
    }),
    (error) => error.code === "m1_b_expired_preparation_unavailable"
  );
  assert.deepEqual(M1_B_EXPIRED_OFFER_PREPARATION_LIMITS, {
    validityMs: 105_000,
    minimumSubmissionRemainingMs: 90_000,
    maximumSubmissionRemainingMs: 120_000
  });
});
