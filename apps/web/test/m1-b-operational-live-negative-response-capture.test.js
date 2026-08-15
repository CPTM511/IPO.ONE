import assert from "node:assert/strict";
import test from "node:test";
import {
  M1BOperationalLiveNegativeCaptureError,
  M1_B_OPERATIONAL_LIVE_NEGATIVE_ARM_SCHEMA_VERSION,
  createM1BOperationalLiveNegativeResponseCapture,
  deriveM1BOperationalLiveNegativeIdempotencyKey,
  isExactM1BOperationalLiveNegativeProblem
} from "../src/m1-b-operational-live-negative-response-capture.js";

const NOW = new Date("2026-08-15T01:00:00.000Z");
const CHALLENGE =
  "m1_b_live_negative_response_01234567-89ab-4def-8123-456789abcdef";
const OFFER_HASH = `0x${"a".repeat(64)}`;
const TERMS_HASH = `0x${"b".repeat(64)}`;

function runtime(role = "human", overrides = {}) {
  return {
    connected: true,
    authenticationMethod: "siwe",
    authenticationProfile: "local_no_funds",
    workspaceKind: role === "human" ? "human_borrower" : "capital_partner",
    hostWorkspaceName: role === "human" ? "borrower" : "capitalPartner",
    walletAuthorityAvailable: true,
    ...overrides
  };
}

function arm(overrides = {}) {
  return JSON.stringify({
    schemaVersion: M1_B_OPERATIONAL_LIVE_NEGATIVE_ARM_SCHEMA_VERSION,
    challenge: CHALLENGE,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
    flow: "operational_live_negative",
    group: "human",
    id: "unauthorized_subject",
    actorRole: "human",
    operationId: "pilotAcceptCreditOffer",
    responseSchemaVersion: "problem_details.v1",
    expectedStatus: 404,
    resourceType: "credit_offer",
    resourceId: "credit_offer_agent_foreign",
    expectedOfferHash: OFFER_HASH,
    expectedTermsHash: TERMS_HASH,
    disclosureRef: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
    requestId: "request_m1b_unauthorized_0001",
    correlationId: "correlation_m1b_unauthorized_0001",
    ...overrides
  });
}

function problem(requestId = "request_m1b_unauthorized_0001", overrides = {}) {
  return {
    schemaVersion: "problem_details.v1",
    type: "urn:ipo.one:problem:authorization_denied",
    title: "Not available",
    status: 404,
    code: "authorization_denied",
    detail: "The requested operation is not available.",
    requestId,
    ...overrides
  };
}

function confirmation(requestId, resourceId) {
  return {
    actionType: "accept_offer",
    resourceId,
    resourceHash: OFFER_HASH,
    payloadHash: `0x${"c".repeat(64)}`,
    requestId,
    requestNonce: "human_action_confirmation_01234567-89ab-4def-8123-456789abcdef",
    requestedAt: "2026-08-15T01:00:00.100Z",
    confirmedAt: "2026-08-15T01:00:00.500Z",
    expiresAt: "2026-08-15T01:05:00.100Z",
    confirmationMethod: "wallet_personal_sign",
    confirmationHash: `0x${"d".repeat(64)}`,
    messageHash: `0x${"e".repeat(64)}`,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: "economic_action_confirmation_result.v1"
  };
}

function offerRequest(attempt) {
  return {
    operationId: attempt.operationId,
    resource: {
      resourceType: attempt.resourceType,
      resourceId: attempt.resourceId
    },
    payload: {
      expectedOfferHash: OFFER_HASH,
      expectedTermsHash: TERMS_HASH,
      acknowledgementHash: `0x${"f".repeat(64)}`,
      actionConfirmation: confirmation(attempt.requestId, attempt.resourceId)
    },
    requestId: attempt.requestId,
    correlationId: attempt.correlationId,
    idempotencyKey: attempt.idempotencyKey,
    schemaVersion: "tenant_protocol_request.v1"
  };
}

function controller(runtimeState = runtime(), now = () => NOW) {
  return createM1BOperationalLiveNegativeResponseCapture({
    location: { protocol: "http:", hostname: "127.0.0.1" },
    getRuntimeState: () => runtimeState,
    now
  });
}

test("captures one exact offer denial with challenge-derived idempotency and removes it after copy", () => {
  const capture = controller();
  capture.arm(arm());
  const attempt = capture.begin();
  assert.deepEqual(attempt, {
    kind: "offer_denial",
    operationId: "pilotAcceptCreditOffer",
    resourceType: "credit_offer",
    resourceId: "credit_offer_agent_foreign",
    expectedOfferHash: OFFER_HASH,
    expectedTermsHash: TERMS_HASH,
    disclosureRef: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
    requestId: "request_m1b_unauthorized_0001",
    correlationId: "correlation_m1b_unauthorized_0001",
    idempotencyKey: deriveM1BOperationalLiveNegativeIdempotencyKey(CHALLENGE)
  });
  assert.equal(capture.complete({
    requestProjection: offerRequest(attempt),
    response: problem()
  }), true);
  const value = capture.consume();
  assert.equal(value.schemaVersion, "m1_b_operational_live_negative_response.v2");
  assert.equal(value.armChallenge, CHALLENGE);
  assert.equal(value.response.code, "authorization_denied");
  assert.throws(
    () => capture.consume(),
    (error) => error.code === "m1_b_live_negative_unavailable"
  );
  assert.throws(
    () => capture.arm(arm()),
    (error) => error.code === "m1_b_live_negative_challenge_reused"
  );
});

test("runs the fixed cross-role private read without idempotency or wallet material", () => {
  const capture = controller(runtime("capital_partner"));
  capture.arm(arm({
    group: "authorization",
    id: "cross_role_private_read",
    actorRole: "capital_partner",
    operationId: "pilotReadOwnObligation",
    resourceType: "obligation",
    resourceId: "obligation_human_critical",
    expectedOfferHash: null,
    expectedTermsHash: null,
    disclosureRef: null,
    requestId: "request_m1b_cross_role_0001",
    correlationId: "correlation_m1b_cross_role_0001"
  }));
  const attempt = capture.begin();
  assert.equal(attempt.kind, "cross_role_read_denial");
  assert.equal(attempt.idempotencyKey, null);
  const requestProjection = {
    operationId: "pilotReadOwnObligation",
    resource: {
      resourceType: "obligation",
      resourceId: "obligation_human_critical"
    },
    payload: {},
    requestId: attempt.requestId,
    correlationId: attempt.correlationId,
    schemaVersion: "tenant_protocol_request.v1"
  };
  assert.equal(capture.complete({
    requestProjection,
    response: problem(attempt.requestId)
  }), true);
  const copied = capture.consume();
  assert.equal(Object.hasOwn(copied.requestProjection, "idempotencyKey"), false);
  assert.equal(JSON.stringify(copied).includes("actionConfirmation"), false);
});

test("arm parsing is closed, expiring, exact-case, role-bound, and loopback-only", () => {
  for (const token of [
    arm({ extra: true }),
    arm({ expiresAt: NOW.toISOString() }),
    arm({ actorRole: "capital_partner" }),
    arm({ id: "unknown_case" }),
    arm({ expectedOfferHash: null }),
    arm({ challenge: "predictable" })
  ]) {
    assert.throws(
      () => controller().arm(token),
      (error) => error instanceof M1BOperationalLiveNegativeCaptureError &&
        error.code === "m1_b_live_negative_arm_invalid"
    );
  }
  assert.throws(
    () => controller(runtime("capital_partner")).arm(arm()),
    (error) => error.code === "m1_b_live_negative_runtime_mismatch"
  );
  assert.throws(
    () => createM1BOperationalLiveNegativeResponseCapture({
      location: { protocol: "https:", hostname: "example.test" },
      getRuntimeState: () => runtime()
    }),
    (error) => error.code === "m1_b_live_negative_unavailable"
  );
});

test("mismatched request, unsafe response, runtime change, and elapsed copy window fail closed", () => {
  const mismatched = controller();
  mismatched.arm(arm());
  const attempt = mismatched.begin();
  assert.equal(mismatched.complete({
    requestProjection: {
      ...offerRequest(attempt),
      idempotencyKey: "idempotency_wrong_0001"
    },
    response: problem()
  }), false);
  assert.equal(mismatched.snapshot().phase, "failed");

  const unsafe = controller();
  unsafe.arm(arm());
  const unsafeAttempt = unsafe.begin();
  assert.equal(unsafe.complete({
    requestProjection: offerRequest(unsafeAttempt),
    response: problem(undefined, { sessionToken: "forbidden" })
  }), false);

  const changedRuntime = runtime();
  const changed = controller(changedRuntime);
  changed.arm(arm());
  changedRuntime.workspaceKind = "capital_partner";
  changed.refreshRuntime();
  assert.equal(changed.snapshot().statusCode, "runtime_changed");

  let currentTime = NOW.getTime();
  const expiredCopy = controller(runtime(), () => new Date(currentTime));
  expiredCopy.arm(arm());
  const copyAttempt = expiredCopy.begin();
  assert.equal(expiredCopy.complete({
    requestProjection: offerRequest(copyAttempt),
    response: problem()
  }), true);
  currentTime += 120_001;
  assert.throws(
    () => expiredCopy.consume(),
    (error) => error.code === "m1_b_live_negative_unavailable"
  );
});

test("expected-problem transport helper accepts only exact request-correlated 404 truth", () => {
  const context = {
    requestId: "request_m1b_transport_0001",
    responseStatus: 404,
    responseRequestIdHeader: "request_m1b_transport_0001",
    response: problem("request_m1b_transport_0001")
  };
  assert.equal(isExactM1BOperationalLiveNegativeProblem(context), true);
  assert.equal(isExactM1BOperationalLiveNegativeProblem({
    ...context,
    responseStatus: 403
  }), false);
  assert.equal(isExactM1BOperationalLiveNegativeProblem({
    ...context,
    responseRequestIdHeader: null
  }), false);
});
