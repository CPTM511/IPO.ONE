import {
  DomainError,
  createCreditEvent,
  createOperationalId,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  assertAgentCreditOfferWorkflowReceipt
} from "../../../packages/api-contract/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  summarizeCreditDecision,
  summarizeCreditOffer
} from "./credit-decision-handlers.js";
import { summarizeCreditIntent } from "./credit-intent-handlers.js";

const MAX_CONTINUATION_MS = 24 * 60 * 60 * 1000;

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function assertExactPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 1 ||
    !Object.hasOwn(payload, "receipt")
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "The exact Agent continuation receipt is required"
    );
  }
  assertAgentCreditOfferWorkflowReceipt(payload.receipt);
  if (payload.receipt.status !== "offer_ready") {
    throw new DomainError(
      "continuation_receipt_not_resumable",
      "Only an unexpired Agent Offer receipt can be persisted"
    );
  }
  return payload.receipt;
}

function exactProjection(receiptValue, projectionValue, name) {
  if (hashId(`continuation_${name}`, receiptValue) !== hashId(`continuation_${name}`, projectionValue)) {
    throw new DomainError(
      "continuation_receipt_projection_mismatch",
      `Agent continuation receipt ${name} does not match current server truth`
    );
  }
}

export function persistAgentContinuationReceiptCommandHandler() {
  return Object.freeze({
    operationId: "pilotPersistAgentContinuationReceipt",
    kind: "command",
    async plan({
      client,
      coreRepository,
      payload,
      authenticationContext,
      authorizationDecision,
      now,
      requestId,
      correlationId
    }) {
      if (authenticationContext.actorType !== ActorType.AGENT) unavailable();
      const receipt = assertExactPayload(payload);
      if (
        authorizationDecision.resourceType !== "credit_offer" ||
        authorizationDecision.resourceId !== receipt.offer.creditOfferId ||
        receipt.subjectId !== receipt.creditIntent.subjectId ||
        receipt.subjectId !== receipt.decision.subjectId ||
        receipt.subjectId !== receipt.offer.subjectId ||
        receipt.mandateId !== receipt.creditIntent.authorityId ||
        receipt.mandateId !== receipt.decision.authorityId ||
        receipt.creditIntent.creditIntentId !== receipt.decision.creditIntentId ||
        receipt.creditIntent.creditIntentId !== receipt.offer.creditIntentId ||
        receipt.decision.riskDecisionId !== receipt.offer.riskDecisionId
      ) unavailable();

      const [offerState, intentState, decisionState, mandateState] = await Promise.all([
        coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.CREDIT_OFFER,
          receipt.offer.creditOfferId,
          { lock: true }
        ),
        coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.CREDIT_INTENT,
          receipt.creditIntent.creditIntentId,
          { lock: true }
        ),
        coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.RISK_DECISION,
          receipt.decision.riskDecisionId,
          { lock: true }
        ),
        coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.MANDATE,
          receipt.mandateId,
          { lock: true }
        )
      ]);
      if (!offerState || !intentState || !decisionState || !mandateState) unavailable();
      const offer = offerState.value;
      const intent = intentState.value;
      const decision = decisionState.value;
      const mandate = mandateState.value;
      if (
        offer.status !== "offered" ||
        intent.status !== "decided" ||
        decision.status !== "approved" ||
        !["draft", "active"].includes(mandate.status) ||
        mandate.subjectId !== receipt.subjectId ||
        new Date(offer.validUntil).getTime() <= now.getTime() ||
        new Date(mandate.expiresAt).getTime() <= now.getTime()
      ) unavailable();
      exactProjection(receipt.creditIntent, summarizeCreditIntent(intent), "credit_intent");
      exactProjection(receipt.decision, summarizeCreditDecision(decision), "decision");
      exactProjection(receipt.offer, summarizeCreditOffer(offer), "offer");

      const existing = await coreRepository.findWorkspaceContinuationReceiptForOfferInTransaction(
        client,
        { actorId: authenticationContext.actorId, creditOfferId: offer.creditOfferId, lock: true }
      );
      if (existing) {
        throw new DomainError(
          "continuation_receipt_already_exists",
          "An immutable continuation receipt already exists for this Actor and Offer"
        );
      }

      const receiptHash = hashId("workspace_continuation_receipt", receipt);
      const continuationReceiptId = createOperationalId("continuation_receipt");
      const expiresAt = new Date(Math.min(
        new Date(offer.validUntil).getTime(),
        new Date(mandate.expiresAt).getTime(),
        now.getTime() + MAX_CONTINUATION_MS
      )).toISOString();
      const continuation = {
        continuationReceiptId,
        receiptHash,
        actorId: authenticationContext.actorId,
        actorType: authenticationContext.actorType,
        subjectId: receipt.subjectId,
        mandateId: receipt.mandateId,
        creditIntentId: intent.creditIntentId,
        riskDecisionId: decision.riskDecisionId,
        creditOfferId: offer.creditOfferId,
        creditOfferHash: offer.creditOfferHash,
        termsHash: offer.termsHash,
        offerSchemaVersion: offer.schemaVersion,
        offerAggregateVersion: offerState.aggregateVersion,
        receiptPayload: receipt,
        status: "active",
        version: 1,
        issuedAt: now.toISOString(),
        expiresAt,
        updatedAt: now.toISOString(),
        schemaVersion: "workspace_continuation_receipt.v1"
      };
      const event = createCreditEvent({
        eventType: "workspace_continuation_receipt_persisted",
        subjectId: receipt.subjectId,
        payload: {
          continuationReceiptId,
          receiptHash,
          actorId: authenticationContext.actorId,
          mandateId: receipt.mandateId,
          creditOfferId: offer.creditOfferId,
          creditOfferHash: offer.creditOfferHash,
          offerAggregateVersion: offerState.aggregateVersion,
          expiresAt,
          nonAuthorizing: true,
          sandboxOnly: true,
          productionAuthority: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "workspace_continuation_receipt",
        aggregateId: continuationReceiptId,
        events: [{
          aggregateType: "workspace_continuation_receipt",
          aggregateId: continuationReceiptId,
          expectedVersion: 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.WORKSPACE_CONTINUATION_RECEIPT,
          value: continuation,
          eventId: event.eventId
        }],
        response: {
          continuationReceiptId,
          receiptHash,
          subjectId: receipt.subjectId,
          mandateId: receipt.mandateId,
          creditOfferId: offer.creditOfferId,
          offerAggregateVersion: offerState.aggregateVersion,
          expiresAt,
          persisted: true,
          nonAuthorizing: true,
          sandboxOnly: true,
          productionAuthority: false,
          schemaVersion: "tenant_agent_continuation_receipt_persisted.v1"
        }
      };
    }
  });
}

export function createWorkspaceContinuationHandlers() {
  return Object.freeze([persistAgentContinuationReceiptCommandHandler()]);
}
