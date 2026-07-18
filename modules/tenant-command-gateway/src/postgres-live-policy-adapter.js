import {
  ConsentStatus,
  DomainError,
  MandateStatus,
  PrincipalStatus,
  SubjectStatus,
  SubjectType
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import { resolveCreditIntentAuthority } from "./credit-intent-handlers.js";

const ALLOWED_DRAFT_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);
const FREEZABLE_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);
const HUMAN_CONSENT_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);

function hasExactChecks(policy, checks) {
  return (
    policy.liveChecks.length === checks.length &&
    checks.every((check, index) => policy.liveChecks[index] === check)
  );
}

export function createPostgresTenantLivePolicyAdapter({ client, coreRepository, handler, payload }) {
  if (!client?.query || !coreRepository?.getProjectionStateInTransaction || !handler?.operationId) {
    throw new DomainError("invalid_tenant_live_policy_adapter", "live policy adapter dependencies are invalid");
  }
  return Object.freeze({
    async evaluate({ policy, resource, authenticationContext, now }) {
      if (policy.operationId !== handler.operationId) {
        throw new DomainError("authorization_live_policy_rejected", "live policy is unavailable");
      }

      if (
        handler.operationId === "pilotAcceptCreditOffer" &&
        hasExactChecks(policy, ["credit_offer_state"]) &&
        resource?.resourceType === "credit_offer"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.CREDIT_OFFER,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state ||
          state.value.status !== "offered" ||
          state.value.sandboxOnly !== true ||
          state.value.productionFundsApproved !== false ||
          now >= new Date(state.value.validUntil)
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Credit Offer state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["credit_offer_state"])
        });
      }

      if (
        handler.operationId === "pilotExecuteSandboxObligation" &&
        hasExactChecks(policy, ["obligation_execution_state"]) &&
        resource?.resourceType === "obligation"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.OBLIGATION,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state || state.value.schemaVersion !== "obligation.v2" ||
          state.value.status !== "created" || state.value.executionStatus !== "pending" ||
          state.value.sandboxOnly !== true || state.value.productionFundsMoved !== false
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Obligation state rejected execution");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["obligation_execution_state"])
        });
      }

      if (
        handler.operationId === "pilotPostSandboxRepayment" &&
        hasExactChecks(policy, ["obligation_repayment_state"]) &&
        resource?.resourceType === "obligation"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.OBLIGATION,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state || state.value.schemaVersion !== "obligation.v2" ||
          state.value.executionStatus !== "executed" ||
          ![
            "active", "partially_repaid", "delinquent", "defaulted",
            "restructured", "repurchased"
          ].includes(state.value.status) ||
          state.value.sandboxOnly !== true || state.value.productionFundsMoved !== false
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Obligation state rejected repayment");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["obligation_repayment_state"])
        });
      }

      if (
        [
          "pilotRestructureSandboxObligation",
          "pilotRepurchaseSandboxObligation",
          "pilotWriteOffSandboxObligation"
        ].includes(handler.operationId) &&
        hasExactChecks(policy, ["servicing_resolution_state"]) &&
        resource?.resourceType === "obligation"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.OBLIGATION,
          resource.resourceId,
          { lock: true }
        );
        const allowed = {
          pilotRestructureSandboxObligation: ["delinquent", "defaulted"],
          pilotRepurchaseSandboxObligation: ["delinquent", "defaulted", "restructured"],
          pilotWriteOffSandboxObligation: ["defaulted", "restructured", "repurchased"]
        }[handler.operationId];
        if (
          !state || state.value.schemaVersion !== "obligation.v2" ||
          state.value.executionStatus !== "executed" || !allowed.includes(state.value.status) ||
          state.value.sandboxOnly !== true || state.value.productionFundsMoved !== false
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live servicing state rejected resolution");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["servicing_resolution_state"])
        });
      }

      if (
        handler.operationId === "workerAdvanceSandboxServicing" &&
        hasExactChecks(policy, ["servicing_clock_state"]) &&
        resource?.resourceType === "obligation"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.OBLIGATION,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state || state.value.schemaVersion !== "obligation.v2" ||
          state.value.executionStatus !== "executed" ||
          ![
            "active", "partially_repaid", "delinquent", "defaulted",
            "restructured", "repurchased"
          ].includes(state.value.status) ||
          state.value.sandboxOnly !== true || state.value.productionFundsMoved !== false
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live servicing state rejected clock advance");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["servicing_clock_state"])
        });
      }

      if (
        handler.operationId === "pilotEvaluateCreditApplication" &&
        hasExactChecks(policy, ["credit_intent_state"]) &&
        resource?.resourceType === "credit_intent"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.CREDIT_INTENT,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state ||
          state.value.status !== "submitted" ||
          state.value.sandboxOnly !== true ||
          state.value.productionFundsRequested !== false
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Credit Intent state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["credit_intent_state"])
        });
      }

      if (
        handler.operationId === "pilotActivateSandboxMandate" &&
        hasExactChecks(policy, ["mandate_activation_state"]) &&
        resource?.resourceType === "mandate"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.MANDATE,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state ||
          state.value.status !== MandateStatus.DRAFT ||
          state.value.sandboxOnly !== true ||
          state.value.productionAuthority !== false
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Mandate state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["mandate_activation_state"])
        });
      }

      if (
        handler.operationId === "pilotRequestCredit" &&
        hasExactChecks(policy, ["credit_authority", "risk", "cap", "freeze"]) &&
        resource?.resourceType === "subject"
      ) {
        const resolved = await resolveCreditIntentAuthority({
          client,
          coreRepository,
          resourceId: resource.resourceId,
          actorType: authenticationContext.actorType,
          payload,
          now
        });
        return Object.freeze({
          liveStateVersion: resolved.liveStateVersion,
          evaluatedChecks: Object.freeze(["credit_authority", "risk", "cap", "freeze"])
        });
      }

      if (
        handler.operationId === "pilotCreateConsent" &&
        hasExactChecks(policy, ["subject_state", "principal_state"]) &&
        resource?.resourceType === "subject"
      ) {
        const subjectState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.SUBJECT,
          resource.resourceId,
          { lock: true }
        );
        const subject = subjectState?.value;
        if (
          !subject ||
          subject.subjectType !== SubjectType.HUMAN ||
          subject.prototypeOnly !== true ||
          !HUMAN_CONSENT_SUBJECT_STATUSES.has(subject.status)
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Subject state rejected the operation");
        }
        const principalState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.PRINCIPAL,
          subject.primaryPrincipalId,
          { lock: true }
        );
        if (!principalState || principalState.value.status !== PrincipalStatus.ACTIVE) {
          throw new DomainError("authorization_live_policy_rejected", "live Principal state rejected the operation");
        }
        const liveStateVersion = subjectState.aggregateVersion + principalState.aggregateVersion;
        if (!Number.isSafeInteger(liveStateVersion)) {
          throw new DomainError("authorization_live_policy_rejected", "live state version is unavailable");
        }
        return Object.freeze({
          liveStateVersion,
          evaluatedChecks: Object.freeze(["subject_state", "principal_state"])
        });
      }

      if (
        handler.operationId === "pilotRevokeConsent" &&
        hasExactChecks(policy, ["consent_state"]) &&
        resource?.resourceType === "consent"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.CONSENT_RECORD,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state ||
          state.value.status !== ConsentStatus.ACTIVE ||
          state.value.sandboxOnly !== true ||
          state.value.productionAuthority !== false
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Consent state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["consent_state"])
        });
      }

      if (
        handler.operationId === "pilotCreateDraftMandate" &&
        hasExactChecks(policy, ["subject_state"]) &&
        resource?.resourceType === "subject"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.SUBJECT,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state ||
          state.value.subjectType !== SubjectType.AGENT ||
          !ALLOWED_DRAFT_SUBJECT_STATUSES.has(state.value.status)
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Subject state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["subject_state"])
        });
      }

      if (
        handler.operationId === "pilotRevokeDraftMandate" &&
        hasExactChecks(policy, ["mandate_state"]) &&
        resource?.resourceType === "mandate"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.MANDATE,
          resource.resourceId,
          { lock: true }
        );
        if (!state || state.value.status !== MandateStatus.DRAFT) {
          throw new DomainError("authorization_live_policy_rejected", "live Mandate state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["mandate_state"])
        });
      }

      if (
        handler.operationId === "pilotFreezeSubject" &&
        hasExactChecks(policy, ["risk", "freeze"]) &&
        resource?.resourceType === "subject"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.SUBJECT,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state ||
          state.value.subjectType !== SubjectType.AGENT ||
          !FREEZABLE_SUBJECT_STATUSES.has(state.value.status)
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Subject state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["risk", "freeze"])
        });
      }

      if (
        handler.operationId === "pilotReadProviderIntent" &&
        hasExactChecks(policy, ["provider_assignment", "provider_state"]) &&
        resource?.resourceType === "transfer_intent"
      ) {
        const delivery = await coreRepository.getProviderIntentDeliveryByIntentInTransaction(
          client,
          resource.resourceId,
          { lock: false }
        );
        if (
          !delivery || delivery.providerActorId !== authenticationContext.actorId ||
          delivery.sandboxOnly !== true || delivery.productionFundsMoved !== false ||
          delivery.withdrawable !== false || now < new Date(delivery.issuedAt) ||
          now >= new Date(delivery.expiresAt)
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Provider delivery rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: delivery.aggregateVersion,
          evaluatedChecks: Object.freeze(["provider_assignment", "provider_state"])
        });
      }

      if (
        handler.operationId === "pilotAcknowledgeProviderIntent" &&
        hasExactChecks(policy, ["provider_assignment", "provider_state", "transfer_intent_state"]) &&
        resource?.resourceType === "transfer_intent"
      ) {
        const delivery = await coreRepository.getProviderIntentDeliveryByIntentInTransaction(
          client,
          resource.resourceId,
          { lock: true }
        );
        if (
          !delivery || delivery.providerActorId !== authenticationContext.actorId ||
          delivery.status !== "pending" || delivery.sandboxOnly !== true ||
          delivery.productionFundsMoved !== false || delivery.withdrawable !== false ||
          now < new Date(delivery.issuedAt) || now >= new Date(delivery.expiresAt)
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Provider delivery rejected acknowledgement");
        }
        return Object.freeze({
          liveStateVersion: delivery.aggregateVersion,
          evaluatedChecks: Object.freeze(["provider_assignment", "provider_state", "transfer_intent_state"])
        });
      }

      if (
        handler.operationId === "workerProcessInbox" &&
        hasExactChecks(policy, ["inbox_replay"]) &&
        resource?.resourceType === "inbox_message" &&
        resource.resourceId === payload?.callbackId
      ) {
        const delivery = await coreRepository.getProviderIntentDeliveryByIntentInTransaction(
          client,
          payload.transferIntentId,
          { lock: true }
        );
        if (
          !delivery || delivery.status !== "acknowledged" ||
          delivery.providerId !== payload.providerId || delivery.deliveryHash !== payload.deliveryHash
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Provider inbox rejected the callback");
        }
        return Object.freeze({
          liveStateVersion: delivery.aggregateVersion,
          evaluatedChecks: Object.freeze(["inbox_replay"])
        });
      }

      throw new DomainError("authorization_live_policy_rejected", "live policy is unavailable");
    }
  });
}
