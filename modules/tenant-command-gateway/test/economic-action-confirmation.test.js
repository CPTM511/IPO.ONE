import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuthenticatedProtocolActionConfirmation,
  normalizeEconomicActionConfirmation,
  sha256Json
} from "../src/index.js";

const RESOURCE = {
  resourceType: "obligation",
  resourceId: "obligation_confirmation_test_0001"
};
const RESOURCE_HASH = `0x${"1".repeat(64)}`;
const REQUEST_ID = "request_confirmation_test_0001";
const NOW = new Date("2026-07-29T04:01:00.000Z");

test("authenticated protocol confirmation is deterministic and bound to the closed request", () => {
  const businessPayload = {
    amountMinor: "1000",
    sourceCode: "synthetic_revenue"
  };
  const confirmation = createAuthenticatedProtocolActionConfirmation({
    operationId: "pilotPostSandboxRepayment",
    payload: businessPayload,
    resource: RESOURCE,
    requestId: REQUEST_ID
  });
  assert.deepEqual(
    createAuthenticatedProtocolActionConfirmation({
      operationId: "pilotPostSandboxRepayment",
      payload: businessPayload,
      resource: RESOURCE,
      requestId: REQUEST_ID
    }),
    confirmation
  );
  assert.deepEqual(
    normalizeEconomicActionConfirmation(confirmation, {
      operationId: "pilotPostSandboxRepayment",
      resource: RESOURCE,
      resourceHash: RESOURCE_HASH,
      payloadHash: `0x${"2".repeat(64)}`,
      requestId: REQUEST_ID,
      authenticationContext: {
        actorType: "agent",
        authenticationMethod: "private_key_jwt"
      },
      now: NOW,
      businessPayload
    }),
    confirmation
  );
  assert.throws(
    () => normalizeEconomicActionConfirmation(confirmation, {
      operationId: "pilotPostSandboxRepayment",
      resource: RESOURCE,
      resourceHash: RESOURCE_HASH,
      payloadHash: `0x${"2".repeat(64)}`,
      requestId: REQUEST_ID,
      authenticationContext: {
        actorType: "human",
        authenticationMethod: "siwe"
      },
      now: NOW,
      businessPayload
    }),
    (error) => error.code === "economic_action_confirmation_invalid"
  );
});

test("wallet confirmation must be fresh and exactly action, resource, payload, and request bound", () => {
  const payloadHash = sha256Json({
    obligationHash: RESOURCE_HASH,
    amountMinor: "1000",
    sourceCode: "synthetic_wallet",
    waterfall: "fee_interest_principal",
    productionFundsMoved: false
  });
  const confirmation = {
    actionType: "post_repayment",
    resourceId: RESOURCE.resourceId,
    resourceHash: RESOURCE_HASH,
    payloadHash,
    requestId: REQUEST_ID,
    requestNonce: "human_action_confirmation_123e4567-e89b-12d3-a456-426614174000",
    requestedAt: "2026-07-29T04:00:00.000Z",
    confirmedAt: "2026-07-29T04:00:30.000Z",
    expiresAt: "2026-07-29T04:05:00.000Z",
    confirmationMethod: "wallet_personal_sign",
    confirmationHash: `0x${"3".repeat(64)}`,
    messageHash: `0x${"4".repeat(64)}`,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: "economic_action_confirmation_result.v1"
  };
  assert.deepEqual(
    normalizeEconomicActionConfirmation(confirmation, {
      operationId: "pilotPostSandboxRepayment",
      resource: RESOURCE,
      resourceHash: RESOURCE_HASH,
      payloadHash,
      requestId: REQUEST_ID,
      authenticationContext: {
        actorType: "human",
        authenticationMethod: "siwe"
      },
      now: NOW,
      businessPayload: {
        amountMinor: "1000",
        sourceCode: "synthetic_wallet"
      }
    }),
    confirmation
  );
  assert.throws(
    () => normalizeEconomicActionConfirmation({
      ...confirmation,
      payloadHash: `0x${"5".repeat(64)}`
    }, {
      operationId: "pilotPostSandboxRepayment",
      resource: RESOURCE,
      resourceHash: RESOURCE_HASH,
      payloadHash,
      requestId: REQUEST_ID,
      authenticationContext: {
        actorType: "human",
        authenticationMethod: "siwe"
      },
      now: NOW,
      businessPayload: {
        amountMinor: "1000",
        sourceCode: "synthetic_wallet"
      }
    }),
    (error) => error.code === "economic_action_confirmation_invalid"
  );
});
