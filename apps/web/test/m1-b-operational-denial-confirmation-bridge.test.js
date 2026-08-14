import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_B_OPERATIONAL_DENIAL_CONFIRMATION_BRIDGE,
  createM1BOperationalOfferDenialConfirmationBridge,
  installM1BOperationalOfferDenialConfirmationBridge
} from "../src/m1-b-operational-denial-confirmation-bridge.js";

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const HASH_C = `0x${"c".repeat(64)}`;
const HASH_D = `0x${"d".repeat(64)}`;

function input(overrides = {}) {
  return {
    schemaVersion: "m1_b_operational_offer_denial_confirmation_request.v1",
    operationId: "pilotAcceptCreditOffer",
    resourceId: "credit_offer_stale_candidate",
    expectedOfferHash: HASH_A,
    expectedTermsHash: HASH_B,
    disclosureRef: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
    requestId: "request_m1_b_denial_0001",
    ...overrides
  };
}

function confirmation(overrides = {}) {
  return Object.freeze({
    actionType: "accept_offer",
    resourceId: "credit_offer_stale_candidate",
    resourceHash: HASH_A,
    payloadHash: HASH_C,
    requestId: "request_m1_b_denial_0001",
    requestNonce: "human_action_confirmation_01234567-89ab-4def-8123-456789abcdef",
    requestedAt: "2026-08-15T00:00:00.000Z",
    confirmedAt: "2026-08-15T00:00:01.000Z",
    expiresAt: "2026-08-15T00:05:00.000Z",
    confirmationMethod: "wallet_personal_sign",
    confirmationHash: HASH_D,
    messageHash: HASH_B,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: "economic_action_confirmation_result.v1",
    ...overrides
  });
}

function dependencies(overrides = {}) {
  return {
    location: { protocol: "http:", hostname: "127.0.0.1" },
    getRuntimeState: () => ({
      connected: true,
      authenticationMethod: "siwe",
      authenticationProfile: "local_no_funds",
      workspaceKind: "human_borrower",
      walletAuthorityAvailable: true
    }),
    sha256Hex: async () => HASH_C,
    requestEconomicActionConfirmation: async () => confirmation(),
    ...overrides
  };
}

test("loopback bridge invokes the existing explicit SIWE wallet modal and returns only its redacted confirmation", async () => {
  const calls = [];
  const bridge = createM1BOperationalOfferDenialConfirmationBridge(dependencies({
    requestEconomicActionConfirmation: async (value) => {
      calls.push(value);
      return confirmation();
    }
  }));
  const value = await bridge(input());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    actionType: "accept_offer",
    title: "Confirm fail-closed Offer probe",
    resourceId: "credit_offer_stale_candidate",
    resourceHash: HASH_A,
    payloadHash: HASH_C,
    requestId: "request_m1_b_denial_0001",
    effect: "Attempt this exact unavailable sandbox Offer; the expected result is denial with no economic effect."
  });
  assert.equal(value.confirmationMethod, "wallet_personal_sign");
  assert.equal(value.rawSignaturePersisted, false);
  assert.equal(JSON.stringify(value).includes("signature"), false);
  assert.equal(Object.isFrozen(value), true);
});

test("bridge fails closed outside exact loopback SIWE authority and never calls the modal", async () => {
  assert.throws(
    () => createM1BOperationalOfferDenialConfirmationBridge(dependencies({
      location: { protocol: "https:", hostname: "example.test" }
    })),
    (error) => error.code === "m1_b_operational_denial_bridge_unavailable"
  );
  let called = false;
  const bridge = createM1BOperationalOfferDenialConfirmationBridge(dependencies({
    getRuntimeState: () => ({
      connected: true,
      authenticationMethod: "oidc_pkce_bff",
      authenticationProfile: "local_no_funds",
      workspaceKind: "human_borrower",
      walletAuthorityAvailable: true
    }),
    requestEconomicActionConfirmation: async () => {
      called = true;
      return confirmation();
    }
  }));
  await assert.rejects(
    bridge(input()),
    (error) => error.code === "m1_b_operational_denial_siwe_required"
  );
  assert.equal(called, false);

  const wrongWorkspace = createM1BOperationalOfferDenialConfirmationBridge(
    dependencies({
      getRuntimeState: () => ({
        connected: true,
        authenticationMethod: "siwe",
        authenticationProfile: "local_no_funds",
        workspaceKind: "principal_controller",
        walletAuthorityAvailable: true
      }),
      requestEconomicActionConfirmation: async () => {
        called = true;
        return confirmation();
      }
    })
  );
  await assert.rejects(
    wrongWorkspace(input()),
    (error) => error.code === "m1_b_operational_denial_siwe_required"
  );
  assert.equal(called, false);
});

test("bridge rejects extra input, raw confirmation material, and mismatched exact hashes", async () => {
  const bridge = createM1BOperationalOfferDenialConfirmationBridge(dependencies());
  await assert.rejects(
    bridge(input({ signature: "0xsecret" })),
    (error) => error.code === "m1_b_operational_denial_confirmation_invalid"
  );
  const rawBridge = createM1BOperationalOfferDenialConfirmationBridge(dependencies({
    requestEconomicActionConfirmation: async () => ({
      ...confirmation(),
      rawSignature: "0xsecret"
    })
  }));
  await assert.rejects(
    rawBridge(input()),
    (error) => error.code === "m1_b_operational_denial_confirmation_invalid"
  );
  const mismatchBridge = createM1BOperationalOfferDenialConfirmationBridge(dependencies({
    requestEconomicActionConfirmation: async () => confirmation({ resourceHash: HASH_D })
  }));
  await assert.rejects(
    mismatchBridge(input()),
    (error) => error.code === "m1_b_operational_denial_confirmation_invalid"
  );
});

test("installation is non-enumerable, immutable, and non-overwriting", () => {
  const globalObject = {};
  const bridge = installM1BOperationalOfferDenialConfirmationBridge({
    globalObject,
    ...dependencies()
  });
  assert.equal(globalObject[M1_B_OPERATIONAL_DENIAL_CONFIRMATION_BRIDGE], bridge);
  assert.equal(Object.keys(globalObject).includes(M1_B_OPERATIONAL_DENIAL_CONFIRMATION_BRIDGE), false);
  assert.throws(
    () => installM1BOperationalOfferDenialConfirmationBridge({
      globalObject,
      ...dependencies()
    }),
    (error) => error.code === "m1_b_operational_denial_bridge_unavailable"
  );
});
