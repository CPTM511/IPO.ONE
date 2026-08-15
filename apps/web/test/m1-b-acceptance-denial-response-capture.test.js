import assert from "node:assert/strict";
import test from "node:test";
import {
  createM1BAcceptanceDenialResponseCapture,
  deriveM1BAcceptanceDenialIdempotencyKey,
  isExactM1BAcceptanceExpectedDenialTransport
} from "../src/m1-b-acceptance-denial-response-capture.js";

const NOW = new Date("2026-08-15T01:00:00.000Z");
const CHALLENGE =
  "m1_b_denial_response_01234567-89ab-4def-8123-456789abcdef";
const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const HASH_C = `0x${"c".repeat(64)}`;
const HASH_D = `0x${"d".repeat(64)}`;

function runtime(overrides = {}) {
  return {
    connected: true,
    authenticationMethod: "siwe",
    authenticationProfile: "local_no_funds",
    workspaceKind: "human_borrower",
    hostWorkspaceName: "borrower",
    walletAuthorityAvailable: true,
    ...overrides
  };
}

function armToken(overrides = {}) {
  return JSON.stringify({
    schemaVersion: "m1_b_acceptance_denial_response_arm.v1",
    challenge: CHALLENGE,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
    flow: "capital_partner",
    sequence: 4,
    actorRole: "human",
    operationId: "pilotAcceptCreditOffer",
    responseSchemaVersion: "problem_details.v1",
    expectedStatus: "declined",
    resourceId: "credit_offer_declined_candidate",
    expectedOfferHash: HASH_A,
    expectedTermsHash: HASH_B,
    disclosureRef: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
    requestId: "request-m1b-denial-visible-0001",
    correlationId: "correlation-m1b-denial-visible-0001",
    ...overrides
  });
}

function result(attempt, overrides = {}) {
  const actionConfirmation = {
    actionType: "accept_offer",
    resourceId: attempt.resourceId,
    resourceHash: attempt.expectedOfferHash,
    payloadHash: HASH_C,
    requestId: attempt.requestId,
    requestNonce: "human_action_confirmation_01234567-89ab-4def-8123-456789abcdef",
    requestedAt: "2026-08-15T01:00:01.000Z",
    confirmedAt: "2026-08-15T01:00:02.000Z",
    expiresAt: "2026-08-15T01:05:01.000Z",
    confirmationMethod: "wallet_personal_sign",
    confirmationHash: HASH_D,
    messageHash: HASH_B,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: "economic_action_confirmation_result.v1"
  };
  return {
    requestProjection: {
      operationId: attempt.operationId,
      resource: {
        resourceType: "credit_offer",
        resourceId: attempt.resourceId
      },
      payload: {
        expectedOfferHash: attempt.expectedOfferHash,
        expectedTermsHash: attempt.expectedTermsHash,
        acknowledgementHash: HASH_C,
        actionConfirmation
      },
      requestId: attempt.requestId,
      correlationId: attempt.correlationId,
      idempotencyKey: attempt.idempotencyKey,
      schemaVersion: "tenant_protocol_request.v1"
    },
    response: {
      status: 404,
      code: "authorization_denied",
      requestId: attempt.requestId,
      schemaVersion: "problem_details.v1"
    },
    ...overrides
  };
}

function capture(runtimeState = runtime(), options = {}) {
  return createM1BAcceptanceDenialResponseCapture({
    location: { protocol: "http:", hostname: "127.0.0.1" },
    getRuntimeState: () => runtimeState,
    now: () => NOW,
    ...options
  });
}

test("visible denial capture binds one challenge to the redacted tenantApi request projection and exact problem response", () => {
  const controller = capture();
  controller.arm(armToken());
  const attempt = controller.begin();
  assert.deepEqual(attempt, {
    operationId: "pilotAcceptCreditOffer",
    resourceId: "credit_offer_declined_candidate",
    expectedOfferHash: HASH_A,
    expectedTermsHash: HASH_B,
    disclosureRef: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
    requestId: "request-m1b-denial-visible-0001",
    correlationId: "correlation-m1b-denial-visible-0001",
    idempotencyKey:
      "idempotency_m1b_cp_denial_01234567-89ab-4def-8123-456789abcdef"
  });
  assert.equal(controller.complete(result(attempt)), true);
  const copied = controller.consume();
  assert.equal(copied.schemaVersion, "m1_b_acceptance_operator_response.v1");
  assert.equal(copied.armChallenge, CHALLENGE);
  assert.equal(copied.response.code, "authorization_denied");
  assert.equal(
    copied.requestProjection.payload.actionConfirmation.rawSignaturePersisted,
    false
  );
  const serialized = JSON.stringify(copied);
  assert.doesNotMatch(serialized, /csrf|cookie|requestHeaders|rawSignature"/i);
  assert.throws(
    () => controller.consume(),
    (error) => error.code === "m1_b_denial_unavailable"
  );
  assert.throws(
    () => controller.arm(armToken()),
    (error) => error.code === "m1_b_denial_challenge_reused"
  );
});

test("denial capture rejects token, role, request, response, and challenge mismatches fail-closed", () => {
  assert.throws(
    () => capture().arm(armToken({ browserExpression: "forbidden" })),
    (error) => error.code === "m1_b_denial_arm_invalid"
  );
  assert.throws(
    () => capture(runtime({ hostWorkspaceName: "capitalPartner" })).arm(armToken()),
    (error) => error.code === "m1_b_denial_runtime_mismatch"
  );
  const requestMismatch = capture();
  requestMismatch.arm(armToken());
  const attempt = requestMismatch.begin();
  const mismatched = result(attempt);
  mismatched.requestProjection.idempotencyKey = "idempotency_mismatch_0001";
  assert.equal(requestMismatch.complete(mismatched), false);
  assert.equal(requestMismatch.snapshot().phase, "failed");

  const responseMismatch = capture();
  responseMismatch.arm(armToken({
    challenge: "m1_b_denial_response_11234567-89ab-4def-8123-456789abcdef"
  }));
  const secondAttempt = responseMismatch.begin();
  assert.equal(responseMismatch.complete(result(secondAttempt, {
    response: {
      status: 200,
      code: "unexpected_allow",
      requestId: secondAttempt.requestId,
      schemaVersion: "problem_details.v1"
    }
  })), false);
  assert.equal(responseMismatch.snapshot().phase, "failed");
});

test("denial arm and ready copy windows expire independently", () => {
  let clock = new Date(NOW);
  const expiredArm = capture(runtime(), { now: () => clock });
  expiredArm.arm(armToken());
  clock = new Date(NOW.getTime() + 15 * 60_000 + 1);
  assert.throws(
    () => expiredArm.begin(),
    (error) => error.code === "m1_b_denial_unavailable"
  );
  assert.equal(expiredArm.snapshot().statusCode, "arm_expired");

  clock = new Date(NOW);
  const expiredCopy = capture(runtime(), { now: () => clock });
  expiredCopy.arm(armToken({
    challenge: "m1_b_denial_response_21234567-89ab-4def-8123-456789abcdef"
  }));
  const attempt = expiredCopy.begin();
  assert.equal(expiredCopy.complete(result(attempt)), true);
  clock = new Date(NOW.getTime() + 2 * 60_000 + 1);
  assert.throws(
    () => expiredCopy.consume(),
    (error) => error.code === "m1_b_denial_unavailable"
  );
  assert.equal(expiredCopy.snapshot().statusCode, "copy_window_expired");
});

test("CLI and web derive the same denial idempotency identifier without accepting it in the arm token", () => {
  const token = JSON.parse(armToken());
  assert.equal(Object.hasOwn(token, "idempotencyKey"), false);
  assert.equal(
    deriveM1BAcceptanceDenialIdempotencyKey(token.challenge),
    "idempotency_m1b_cp_denial_01234567-89ab-4def-8123-456789abcdef"
  );
});

test("expected denial transport requires a real exact x-request-id echo, never the fallback request ID", () => {
  const requestId = "request-m1b-denial-visible-0001";
  const response = {
    status: 404,
    code: "authorization_denied",
    requestId,
    schemaVersion: "problem_details.v1"
  };
  assert.equal(isExactM1BAcceptanceExpectedDenialTransport({
    requestId,
    responseStatus: 404,
    responseRequestIdHeader: requestId,
    response
  }), true);
  assert.equal(isExactM1BAcceptanceExpectedDenialTransport({
    requestId,
    responseStatus: 404,
    responseRequestIdHeader: null,
    response
  }), false);
  assert.equal(isExactM1BAcceptanceExpectedDenialTransport({
    requestId,
    responseStatus: 404,
    responseRequestIdHeader: "request-m1b-denial-wrong-0001",
    response
  }), false);
});
