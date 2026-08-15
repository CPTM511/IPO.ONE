import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  ProviderDeliveryStatus,
  acknowledgeProviderIntent,
  completeProviderSandboxCallback,
  createProviderIntentDelivery,
  createProviderIntentView,
  createSignedProviderSandboxCallback,
  verifyProviderSandboxCallback
} from "../src/index.js";

const NOW = new Date("2026-07-17T06:00:00.000Z");
const keys = generateKeyPairSync("ed25519");

function delivery() {
  return createProviderIntentDelivery({
    deliveryId: "provider_delivery_fixture_001",
    transferIntent: {
      transferIntentId: "transfer_intent_fixture_001",
      transferIntentHash: `0x${"11".repeat(32)}`,
      providerId: "provider_fixture_001",
      purposeCode: "compute_services",
      sourceAssetId: "urn:ipo-one:sandbox-asset:usd-cent",
      sourceAmountMinor: "12000",
      destinationAssetId: "urn:ipo-one:sandbox-asset:usd-cent"
    },
    providerActorId: "actor_provider_fixture_001",
    issuedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 300_000)
  });
}

function callback(acknowledged) {
  return createSignedProviderSandboxCallback({
    callbackId: "provider_callback_fixture_001",
    transferIntentId: acknowledged.transferIntentId,
    providerId: acknowledged.providerId,
    deliveryHash: acknowledged.deliveryHash,
    outcome: "accepted",
    reasonCode: "provider_accepted",
    providerEventRefHash: `0x${"22".repeat(32)}`,
    nonce: "provider_callback_nonce_fixture_001",
    issuedAt: new Date(NOW.getTime() + 1_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 240_000).toISOString(),
    keyId: "provider_callback_key_fixture_001"
  }, { privateKey: keys.privateKey });
}

test("Provider intent view is redacted and acknowledgement cannot change economics", () => {
  const created = delivery();
  const view = createProviderIntentView(created);
  assert.equal(view.sourceAmountMinor, "12000");
  assert.equal(view.productionFundsMoved, false);
  assert.equal(Object.hasOwn(view, "sourceAccountRefHash"), false);
  assert.equal(Object.hasOwn(view, "destinationAccountRefHash"), false);

  const acknowledged = acknowledgeProviderIntent(created, {
    providerActorId: created.providerActorId,
    deliveryHash: created.deliveryHash,
    acknowledgementId: "provider_ack_fixture_001",
    now: new Date(NOW.getTime() + 500)
  });
  assert.equal(acknowledged.delivery.status, ProviderDeliveryStatus.ACKNOWLEDGED);
  assert.equal(acknowledged.acknowledgement.transferIntentId, created.transferIntentId);
  assert.equal(acknowledged.acknowledgement.withdrawable, false);
});

test("signed Provider callback verifies exact binding and completes one non-funds result", async () => {
  const acknowledged = acknowledgeProviderIntent(delivery(), {
    providerActorId: "actor_provider_fixture_001",
    deliveryHash: delivery().deliveryHash,
    acknowledgementId: "provider_ack_fixture_001",
    now: new Date(NOW.getTime() + 500)
  }).delivery;
  const signed = callback(acknowledged);
  const verified = await verifyProviderSandboxCallback(signed, {
    keyResolver: async (keyId) => keyId === signed.keyId ? keys.publicKey : undefined,
    expectedProviderId: acknowledged.providerId,
    expectedTransferIntentId: acknowledged.transferIntentId,
    expectedDeliveryHash: acknowledged.deliveryHash,
    now: new Date(NOW.getTime() + 2_000)
  });
  const completed = completeProviderSandboxCallback(acknowledged, verified, {
    now: new Date(NOW.getTime() + 3_000)
  });
  assert.equal(completed.delivery.status, ProviderDeliveryStatus.CALLBACK_COMPLETED);
  assert.equal(completed.result.outcome, "accepted");
  assert.equal(completed.result.productionFundsMoved, false);
  assert.equal(Object.hasOwn(completed.result, "signature"), false);
  assert.equal(Object.hasOwn(completed.result, "nonce"), false);
});

test("callback mutation, wrong binding, stale time, and unknown key fail closed", async () => {
  const created = delivery();
  const acknowledged = acknowledgeProviderIntent(created, {
    providerActorId: created.providerActorId,
    deliveryHash: created.deliveryHash,
    acknowledgementId: "provider_ack_fixture_001",
    now: new Date(NOW.getTime() + 500)
  }).delivery;
  const signed = callback(acknowledged);
  const base = {
    expectedProviderId: acknowledged.providerId,
    expectedTransferIntentId: acknowledged.transferIntentId,
    expectedDeliveryHash: acknowledged.deliveryHash,
    now: new Date(NOW.getTime() + 2_000)
  };
  await assert.rejects(
    () => verifyProviderSandboxCallback({ ...signed, providerEventRefHash: `0x${"43".repeat(32)}` }, {
      ...base,
      keyResolver: async () => keys.publicKey
    }),
    (error) => error.code === "provider_callback_integrity_rejected"
  );
  await assert.rejects(
    () => verifyProviderSandboxCallback(signed, {
      ...base,
      expectedProviderId: "provider_other",
      keyResolver: async () => keys.publicKey
    }),
    (error) => error.code === "provider_callback_binding_rejected"
  );
  await assert.rejects(
    () => verifyProviderSandboxCallback(signed, {
      ...base,
      now: new Date(NOW.getTime() + 300_000),
      keyResolver: async () => keys.publicKey
    }),
    (error) => error.code === "provider_callback_expired"
  );
  await assert.rejects(
    () => verifyProviderSandboxCallback(signed, { ...base, keyResolver: async () => undefined }),
    (error) => error.code === "provider_callback_signature_rejected"
  );
});
