import {
  DomainError,
  ProviderDeliveryStatus,
  acknowledgeProviderIntent,
  completeProviderSandboxCallback,
  createCreditEvent,
  createProviderIntentView,
  hashId,
  verifyProviderSandboxCallback
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function emptyPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 0) {
    throw new DomainError("invalid_tenant_command_payload", "Provider intent query payload must be empty");
  }
}

function acknowledgementPayload(payload) {
  if (
    !payload || typeof payload !== "object" || Array.isArray(payload) ||
    Object.keys(payload).length !== 1 ||
    typeof payload.deliveryHash !== "string" ||
    !/^0x[0-9a-f]{64}$/.test(payload.deliveryHash)
  ) {
    throw new DomainError("invalid_tenant_command_payload", "Provider acknowledgement payload is invalid");
  }
  return payload.deliveryHash;
}

async function loadDelivery({ client, coreRepository, authorizationDecision, authenticationContext, now, lock }) {
  if (
    authorizationDecision?.resourceType !== "transfer_intent" ||
    authenticationContext?.actorType !== ActorType.PROVIDER
  ) unavailable();
  const delivery = await coreRepository.getProviderIntentDeliveryByIntentInTransaction(
    client,
    authorizationDecision.resourceId,
    { lock }
  );
  if (
    !delivery || delivery.transferIntentId !== authorizationDecision.resourceId ||
    delivery.providerActorId !== authenticationContext.actorId ||
    delivery.sandboxOnly !== true || delivery.productionFundsMoved !== false ||
    delivery.withdrawable !== false || now < new Date(delivery.issuedAt) ||
    now >= new Date(delivery.expiresAt)
  ) unavailable();
  return delivery;
}

export function readProviderIntentQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadProviderIntent",
    kind: "query",
    async execute(context) {
      emptyPayload(context.payload);
      const delivery = await loadDelivery({ ...context, lock: false });
      return createProviderIntentView(delivery);
    }
  });
}

export function acknowledgeProviderIntentCommandHandler() {
  return Object.freeze({
    operationId: "pilotAcknowledgeProviderIntent",
    kind: "command",
    async plan(context) {
      const deliveryHash = acknowledgementPayload(context.payload);
      const delivery = await loadDelivery({ ...context, lock: true });
      if (delivery.status !== ProviderDeliveryStatus.PENDING) {
        throw new DomainError("provider_intent_already_acknowledged", "Provider intent is no longer pending acknowledgement");
      }
      const transition = acknowledgeProviderIntent(delivery, {
        providerActorId: context.authenticationContext.actorId,
        deliveryHash,
        now: context.now
      });
      const event = createCreditEvent({
        eventType: "provider_intent_acknowledged",
        payload: {
          deliveryId: delivery.deliveryId,
          deliveryHash: delivery.deliveryHash,
          transferIntentId: delivery.transferIntentId,
          providerId: delivery.providerId,
          acknowledgementId: transition.acknowledgement.acknowledgementId,
          actorId: context.authenticationContext.actorId,
          causationId: context.requestId,
          correlationId: context.correlationId,
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false
        },
        now: context.now
      });
      return {
        aggregateType: "provider_delivery",
        aggregateId: delivery.deliveryId,
        events: [{
          aggregateType: "provider_delivery",
          aggregateId: delivery.deliveryId,
          expectedVersion: delivery.aggregateVersion,
          event
        }],
        writes: [
          { type: CoreProjectionType.PROVIDER_INTENT_DELIVERY, value: transition.delivery, eventId: event.eventId },
          {
            type: CoreProjectionType.PROVIDER_INTENT_ACKNOWLEDGEMENT,
            value: transition.acknowledgement,
            eventId: event.eventId
          }
        ],
        response: transition.acknowledgement
      };
    }
  });
}

export function processProviderCallbackInboxCommandHandler({
  providerCallbackKeyResolver = async () => undefined,
  preflightClock = () => new Date()
} = {}) {
  if (typeof providerCallbackKeyResolver !== "function" || typeof preflightClock !== "function") {
    throw new DomainError("invalid_provider_callback_handler", "Provider callback verifier dependencies are invalid");
  }
  async function verifyCallback(payload, resource, now, expected = payload) {
    if (
      !resource || resource.resourceType !== "inbox_message" ||
      resource.resourceId !== payload?.callbackId
    ) unavailable();
    return verifyProviderSandboxCallback(payload, {
      keyResolver: providerCallbackKeyResolver,
      now,
      expectedProviderId: expected.providerId,
      expectedTransferIntentId: expected.transferIntentId,
      expectedDeliveryHash: expected.deliveryHash
    });
  }
  return Object.freeze({
    operationId: "workerProcessInbox",
    kind: "command",
    async preflight({ payload, resource }) {
      await verifyCallback(payload, resource, preflightClock());
    },
    async plan(context) {
      if (context.authenticationContext?.actorType !== ActorType.SYSTEM_WORKER) unavailable();
      const delivery = await context.coreRepository.getProviderIntentDeliveryByIntentInTransaction(
        context.client,
        context.payload?.transferIntentId,
        { lock: true }
      );
      if (!delivery || delivery.status !== ProviderDeliveryStatus.ACKNOWLEDGED) unavailable();
      const callback = await verifyCallback(context.payload, {
        resourceType: context.authorizationDecision?.resourceType,
        resourceId: context.authorizationDecision?.resourceId
      }, context.now, delivery);
      const byId = await context.coreRepository.getProviderCallbackInboxByIdInTransaction(
        context.client,
        callback.callbackId,
        { lock: true }
      );
      const nonceHash = hashId("provider_sandbox_callback_nonce", callback.nonce);
      const byNonce = await context.coreRepository.findProviderCallbackInboxByNonceInTransaction(
        context.client,
        nonceHash,
        { lock: true }
      );
      if (byId || byNonce) {
        throw new DomainError("provider_callback_replay_conflict", "Provider callback identity was already consumed");
      }
      const transition = completeProviderSandboxCallback(delivery, callback, { now: context.now });
      const event = createCreditEvent({
        eventType: "provider_sandbox_callback_processed",
        payload: {
          callbackId: callback.callbackId,
          deliveryId: delivery.deliveryId,
          deliveryHash: delivery.deliveryHash,
          transferIntentId: delivery.transferIntentId,
          providerId: delivery.providerId,
          payloadHash: callback.payloadHash,
          nonceHash: transition.result.nonceHash,
          keyId: callback.keyId,
          outcome: callback.outcome,
          reasonCode: callback.reasonCode,
          actorId: context.authenticationContext.actorId,
          causationId: context.requestId,
          correlationId: context.correlationId,
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false
        },
        now: context.now
      });
      return {
        aggregateType: "provider_delivery",
        aggregateId: delivery.deliveryId,
        events: [{
          aggregateType: "provider_delivery",
          aggregateId: delivery.deliveryId,
          expectedVersion: delivery.aggregateVersion,
          event
        }],
        writes: [
          { type: CoreProjectionType.PROVIDER_INTENT_DELIVERY, value: transition.delivery, eventId: event.eventId },
          { type: CoreProjectionType.PROVIDER_CALLBACK_INBOX, value: transition.result, eventId: event.eventId }
        ],
        response: transition.result
      };
    }
  });
}

export function createProviderHandlers(options) {
  return Object.freeze([
    readProviderIntentQueryHandler(),
    acknowledgeProviderIntentCommandHandler(),
    processProviderCallbackInboxCommandHandler(options)
  ]);
}
