import assert from "node:assert/strict";
import test from "node:test";
import {
  installM1BAcceptanceDenialResponseCapturePanel
} from "../src/m1-b-acceptance-denial-response-capture-panel.js";

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const HASH_C = `0x${"c".repeat(64)}`;
const HASH_D = `0x${"d".repeat(64)}`;

class FakeElement {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
    this.dataset = {};
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  async dispatch(type) {
    return this.listeners.get(type)?.();
  }
}

function armToken() {
  return JSON.stringify({
    schemaVersion: "m1_b_acceptance_denial_response_arm.v1",
    challenge: "m1_b_denial_response_01234567-89ab-4def-8123-456789abcdef",
    issuedAt: "2026-08-15T01:00:00.000Z",
    expiresAt: "2026-08-15T01:15:00.000Z",
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
    requestId: "request-m1b-denial-panel-0001",
    correlationId: "correlation-m1b-denial-panel-0001"
  });
}

function elements() {
  const ids = [
    "m1BAcceptanceDenialControls",
    "m1BAcceptanceDenialArmToken",
    "m1BAcceptanceDenialArmBtn",
    "m1BAcceptanceRunDenialBtn",
    "m1BAcceptanceCopyDenialBtn",
    "m1BAcceptanceDenialStatus"
  ];
  return Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
}

function denialResult(attempt) {
  return {
    requestProjection: {
      operationId: attempt.operationId,
      resource: { resourceType: "credit_offer", resourceId: attempt.resourceId },
      payload: {
        expectedOfferHash: attempt.expectedOfferHash,
        expectedTermsHash: attempt.expectedTermsHash,
        acknowledgementHash: HASH_C,
        actionConfirmation: {
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
        }
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
    }
  };
}

function install({ clipboard, denialAction = denialResult }) {
  const controls = elements();
  const attempts = [];
  const controller = installM1BAcceptanceDenialResponseCapturePanel({
    document: { getElementById: (id) => controls[id] },
    location: { protocol: "http:", hostname: "127.0.0.1" },
    getRuntimeState: () => ({
      connected: true,
      authenticationMethod: "siwe",
      authenticationProfile: "local_no_funds",
      workspaceKind: "human_borrower",
      hostWorkspaceName: "borrower",
      walletAuthorityAvailable: true
    }),
    async performDenial(attempt) {
      attempts.push(attempt);
      return denialAction(attempt);
    },
    clipboard,
    now: () => new Date("2026-08-15T01:00:00.000Z")
  });
  return { attempts, controller, controls };
}

test("visible denial controls arm without a request, then run and copy exactly once", async () => {
  const copied = [];
  const { attempts, controller, controls } = install({
    clipboard: { async writeText(value) { copied.push(value); } }
  });
  controls.m1BAcceptanceDenialArmToken.value = armToken();
  await controls.m1BAcceptanceDenialArmBtn.dispatch("click");
  assert.deepEqual(attempts, []);
  assert.equal(controls.m1BAcceptanceDenialArmToken.value, "");
  await controls.m1BAcceptanceRunDenialBtn.dispatch("click");
  assert.equal(attempts.length, 1);
  assert.equal(controller.snapshot().phase, "ready");
  assert.doesNotMatch(
    controls.m1BAcceptanceDenialStatus.textContent,
    /request-m1b|correlation-m1b|credit_offer/
  );
  await controls.m1BAcceptanceCopyDenialBtn.dispatch("click");
  assert.equal(copied.length, 1);
  assert.equal(JSON.parse(copied[0]).response.code, "authorization_denied");
  assert.equal(controller.snapshot().phase, "consumed");
});

test("a missing browser Clipboard API does not block install and a failed copy still removes the receipt", async () => {
  const { controller, controls } = install({
    clipboard: undefined
  });
  controls.m1BAcceptanceDenialArmToken.value = armToken();
  await controls.m1BAcceptanceDenialArmBtn.dispatch("click");
  await controls.m1BAcceptanceRunDenialBtn.dispatch("click");
  assert.equal(controller.snapshot().phase, "ready");
  await controls.m1BAcceptanceCopyDenialBtn.dispatch("click");
  assert.equal(controller.snapshot().phase, "consumed");
  assert.equal(controls.m1BAcceptanceCopyDenialBtn.disabled, true);
});

test("wallet cancellation consumes the armed denial without producing a copy", async () => {
  const copied = [];
  const { attempts, controller, controls } = install({
    clipboard: { async writeText(value) { copied.push(value); } },
    async denialAction() {
      throw Object.assign(new Error("Wallet confirmation cancelled."), {
        code: "m1_b_operational_denial_confirmation_cancelled"
      });
    }
  });
  controls.m1BAcceptanceDenialArmToken.value = armToken();
  await controls.m1BAcceptanceDenialArmBtn.dispatch("click");
  await controls.m1BAcceptanceRunDenialBtn.dispatch("click");
  assert.equal(attempts.length, 1);
  assert.equal(controller.snapshot().phase, "failed");
  assert.equal(controls.m1BAcceptanceCopyDenialBtn.disabled, true);
  assert.deepEqual(copied, []);
});
