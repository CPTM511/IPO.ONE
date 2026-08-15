import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  createProviderIntentDelivery,
  createSignedProviderSandboxCallback
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  acknowledgeProviderIntentCommandHandler,
  processProviderCallbackInboxCommandHandler,
  readProviderIntentQueryHandler
} from "../src/index.js";

const NOW = new Date("2026-07-17T08:00:00.000Z");
const PROVIDER_ACTOR_ID = "actor_provider_gateway_001";
const WORKER_ACTOR_ID = "actor_worker_gateway_001";
const keys = generateKeyPairSync("ed25519");

function pendingDelivery() {
  return createProviderIntentDelivery({
    deliveryId: "provider_delivery_gateway_001",
    transferIntent: {
      transferIntentId: "transfer_intent_gateway_001",
      transferIntentHash: `0x${"31".repeat(32)}`,
      providerId: "provider_gateway_001",
      purposeCode: "compute_services",
      sourceAssetId: "urn:ipo-one:sandbox-asset:usd-cent",
      sourceAmountMinor: "12000",
      destinationAssetId: "urn:ipo-one:sandbox-asset:usd-cent"
    },
    providerActorId: PROVIDER_ACTOR_ID,
    issuedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 300_000)
  });
}

function repository(delivery, { byId, byNonce } = {}) {
  return {
    async getProviderIntentDeliveryByIntentInTransaction(_client, transferIntentId) {
      return transferIntentId === delivery.transferIntentId ? structuredClone(delivery) : undefined;
    },
    async getProviderCallbackInboxByIdInTransaction() {
      return byId;
    },
    async findProviderCallbackInboxByNonceInTransaction() {
      return byNonce;
    }
  };
}

function providerContext(delivery, payload = {}) {
  return {
    client: {},
    coreRepository: repository(delivery),
    authenticationContext: { actorId: PROVIDER_ACTOR_ID, actorType: ActorType.PROVIDER },
    authorizationDecision: { resourceType: "transfer_intent", resourceId: delivery.transferIntentId },
    payload,
    now: new Date(NOW.getTime() + 1_000),
    requestId: "request-provider-gateway-0001",
    correlationId: "correlation-provider-gateway-0001"
  };
}

function signedCallback(delivery) {
  return createSignedProviderSandboxCallback({
    callbackId: "provider_callback_gateway_001",
    transferIntentId: delivery.transferIntentId,
    providerId: delivery.providerId,
    deliveryHash: delivery.deliveryHash,
    outcome: "accepted",
    reasonCode: "provider_accepted",
    providerEventRefHash: `0x${"42".repeat(32)}`,
    nonce: "provider_callback_nonce_gateway_001",
    issuedAt: new Date(NOW.getTime() + 2_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 240_000).toISOString(),
    keyId: "provider_callback_key_gateway_001"
  }, { privateKey: keys.privateKey });
}

test("Provider read and acknowledgement stay bound to one redacted assigned intent", async () => {
  const delivery = pendingDelivery();
  const view = await readProviderIntentQueryHandler().execute(providerContext(delivery));
  assert.equal(view.transferIntentId, delivery.transferIntentId);
  assert.equal(Object.hasOwn(view, "providerActorId"), false);
  assert.equal(Object.hasOwn(view, "destinationAccountRefHash"), false);

  const plan = await acknowledgeProviderIntentCommandHandler().plan(
    providerContext(delivery, { deliveryHash: delivery.deliveryHash })
  );
  assert.equal(plan.events[0].expectedVersion, 1);
  assert.equal(plan.response.providerId, delivery.providerId);
  assert.equal(plan.response.productionFundsMoved, false);
  assert.deepEqual(plan.writes.map(({ type }) => type), [
    CoreProjectionType.PROVIDER_INTENT_DELIVERY,
    CoreProjectionType.PROVIDER_INTENT_ACKNOWLEDGEMENT
  ]);
  assert.equal(Object.hasOwn(plan.events[0].event.payload, "signature"), false);
});

test("signed callback preflight precedes durable planning and writes one inbox result", async () => {
  const delivery = pendingDelivery();
  const acknowledged = (await acknowledgeProviderIntentCommandHandler().plan(
    providerContext(delivery, { deliveryHash: delivery.deliveryHash })
  )).writes[0].value;
  const callback = signedCallback(acknowledged);
  const handler = processProviderCallbackInboxCommandHandler({
    providerCallbackKeyResolver: async (keyId) => keyId === callback.keyId ? keys.publicKey : undefined,
    preflightClock: () => new Date(NOW.getTime() + 3_000)
  });
  await handler.preflight({
    payload: callback,
    resource: { resourceType: "inbox_message", resourceId: callback.callbackId }
  });
  const plan = await handler.plan({
    client: {},
    coreRepository: repository(acknowledged),
    authenticationContext: { actorId: WORKER_ACTOR_ID, actorType: ActorType.SYSTEM_WORKER },
    authorizationDecision: { resourceType: "inbox_message", resourceId: callback.callbackId },
    payload: callback,
    now: new Date(NOW.getTime() + 4_000),
    requestId: "request-provider-worker-0001",
    correlationId: "correlation-provider-worker-0001"
  });
  assert.equal(plan.events[0].expectedVersion, 2);
  assert.equal(plan.response.callbackId, callback.callbackId);
  assert.equal(plan.response.productionFundsMoved, false);
  assert.deepEqual(plan.writes.map(({ type }) => type), [
    CoreProjectionType.PROVIDER_INTENT_DELIVERY,
    CoreProjectionType.PROVIDER_CALLBACK_INBOX
  ]);
  assert.equal(Object.hasOwn(plan.response, "signature"), false);
  assert.equal(Object.hasOwn(plan.response, "nonce"), false);
  assert.equal(Object.hasOwn(plan.events[0].event.payload, "signature"), false);
});

test("cross-Provider access, signature drift, nonce replay, and terminal delivery fail closed", async () => {
  const delivery = pendingDelivery();
  await assert.rejects(
    () => readProviderIntentQueryHandler().execute({
      ...providerContext(delivery),
      authenticationContext: { actorId: "actor_provider_other", actorType: ActorType.PROVIDER }
    }),
    (error) => error.code === "tenant_resource_unavailable"
  );

  const acknowledged = (await acknowledgeProviderIntentCommandHandler().plan(
    providerContext(delivery, { deliveryHash: delivery.deliveryHash })
  )).writes[0].value;
  const callback = signedCallback(acknowledged);
  const handler = processProviderCallbackInboxCommandHandler({
    providerCallbackKeyResolver: async () => keys.publicKey,
    preflightClock: () => new Date(NOW.getTime() + 3_000)
  });
  await assert.rejects(
    () => handler.preflight({
      payload: { ...callback, providerEventRefHash: `0x${"43".repeat(32)}` },
      resource: { resourceType: "inbox_message", resourceId: callback.callbackId }
    }),
    (error) => error.code === "provider_callback_integrity_rejected"
  );
  await assert.rejects(
    () => handler.plan({
      client: {},
      coreRepository: repository(acknowledged, { byNonce: { callbackId: "existing" } }),
      authenticationContext: { actorId: WORKER_ACTOR_ID, actorType: ActorType.SYSTEM_WORKER },
      authorizationDecision: { resourceType: "inbox_message", resourceId: callback.callbackId },
      payload: callback,
      now: new Date(NOW.getTime() + 4_000),
      requestId: "request-provider-worker-0002",
      correlationId: "correlation-provider-worker-0002"
    }),
    (error) => error.code === "provider_callback_replay_conflict"
  );
});
