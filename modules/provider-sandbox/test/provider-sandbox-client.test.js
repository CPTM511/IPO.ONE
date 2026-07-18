import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createProviderIntentDelivery, createProviderIntentView } from "../../../packages/domain/src/index.js";
import {
  FixedLoopbackProviderClient,
  createSignedProviderDeliveryEnvelope,
  verifyProviderDeliveryEnvelope
} from "../src/index.js";

const NOW = new Date("2026-07-17T08:00:00.000Z");

function delivery() {
  return createProviderIntentView(createProviderIntentDelivery({
    deliveryId: "provider_delivery_client_001",
    transferIntent: {
      transferIntentId: "transfer_intent_client_001",
      transferIntentHash: `0x${"11".repeat(32)}`,
      providerId: "provider_client_001",
      purposeCode: "compute_services",
      sourceAssetId: "urn:ipo-one:sandbox-asset:usd-cent",
      sourceAmountMinor: "12000",
      destinationAssetId: "urn:ipo-one:sandbox-asset:usd-cent"
    },
    providerActorId: "actor_provider_client_001",
    issuedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 300_000)
  }));
}

test("delivery envelope is Ed25519-bound to the fixed method, path, key, and intent view", async () => {
  const keys = generateKeyPairSync("ed25519");
  const envelope = createSignedProviderDeliveryEnvelope(delivery(), {
    privateKey: keys.privateKey,
    keyId: "provider_delivery_key_client_001"
  });
  await verifyProviderDeliveryEnvelope(envelope, {
    keyResolver: async () => keys.publicKey
  });
  await assert.rejects(
    () => verifyProviderDeliveryEnvelope({
      ...envelope,
      delivery: { ...envelope.delivery, sourceAmountMinor: "12001" }
    }, { keyResolver: async () => keys.publicKey }),
    (error) => error.code === "provider_delivery_integrity_rejected"
  );
});

test("loopback client bounds retries and opens its circuit without accepting a dynamic URL", async () => {
  const keys = generateKeyPairSync("ed25519");
  let calls = 0;
  const client = new FixedLoopbackProviderClient({
    port: 54_321,
    deliverySigningPrivateKey: keys.privateKey,
    deliveryKeyId: "provider_delivery_key_client_001",
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, "http://127.0.0.1:54321/v1/provider-sandbox/deliver");
      assert.equal(options.redirect, "error");
      throw new Error("simulated_transport_failure");
    },
    timeoutMs: 50,
    maxAttempts: 2,
    failureThreshold: 1,
    cooldownMs: 1_000,
    clock: () => NOW.getTime()
  });
  await assert.rejects(
    () => client.deliver(delivery()),
    (error) => error.code === "provider_sandbox_transport_unavailable"
  );
  assert.equal(calls, 2);
  assert.equal(client.circuitState, "open");
  await assert.rejects(
    () => client.deliver(delivery()),
    (error) => error.code === "provider_sandbox_circuit_open"
  );
  assert.equal(calls, 2);
});
