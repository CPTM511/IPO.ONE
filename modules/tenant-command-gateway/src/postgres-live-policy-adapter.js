import {
  ConsentStatus,
  DomainError,
  MandateCapability,
  MandateStatus,
  PrincipalStatus,
  ProviderStatus,
  SpendPolicyStatus,
  SubjectStatus,
  SubjectType,
  hashId
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import { resolveCreditIntentAuthority } from "./credit-intent-handlers.js";

const ALLOWED_DRAFT_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);
const FREEZABLE_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);
const HUMAN_CONSENT_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);
const POOL_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);

function hasExactChecks(policy, checks) {
  return (
    policy.liveChecks.length === checks.length &&
    checks.every((check, index) => policy.liveChecks[index] === check)
  );
}

async function poolLiveStateVersion(client) {
  const result = await client.query(
    `SELECT (
       1 +
       COALESCE((SELECT MAX(finalized_sequence) FROM pool_chain_finalized_effects), 0) +
       COALESCE((SELECT COUNT(*) FROM pool_reconciliation_runs), 0) +
       COALESCE((SELECT MAX(version) FROM pool_risk_controls), 0)
     )::text AS live_state_version`
  );
  const value = Number(result.rows[0]?.live_state_version);
  if (result.rowCount !== 1 || !Number.isSafeInteger(value) || value < 1) {
    throw new DomainError("authorization_live_policy_rejected", "live Pool state is unavailable");
  }
  return value;
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
        [
          "pilotAcceptCreditOffer",
          "pilotPersistAgentContinuationReceipt"
        ].includes(handler.operationId) &&
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
        handler.operationId === "pilotCreateCreditPassportArtifact" &&
        hasExactChecks(policy, ["credit_passport_source_state"]) &&
        resource?.resourceType === "subject" &&
        typeof payload?.creditIntentId === "string"
      ) {
        const subjectState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.SUBJECT,
          resource.resourceId,
          { lock: true }
        );
        const decision = await coreRepository.findRiskDecisionByCreditIntentInTransaction(
          client,
          payload.creditIntentId,
          { lock: true }
        );
        if (
          !subjectState ||
          !decision ||
          decision.subjectId !== resource.resourceId ||
          decision.schemaVersion !== "risk_decision.v3" ||
          decision.sandboxOnly !== true ||
          decision.productionAuthority !== false ||
          decision.decisionPassport?.schemaVersion !== "risk_decision_passport.v1"
        ) {
          throw new DomainError(
            "authorization_live_policy_rejected",
            "live Credit Passport source state rejected the operation"
          );
        }
        return Object.freeze({
          liveStateVersion: subjectState.aggregateVersion + 1,
          evaluatedChecks: Object.freeze(["credit_passport_source_state"])
        });
      }

      if (
        handler.operationId === "pilotAuthorCapitalPartnerOffer" &&
        hasExactChecks(policy, [
          "credit_passport_verification_state",
          "credit_intent_state",
          "capital_partner_profile_state",
          "pause"
        ]) &&
        resource?.resourceType === "credit_passport_artifact" &&
        typeof payload?.creditIntentId === "string"
      ) {
        const passportState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.CREDIT_PASSPORT_ARTIFACT,
          resource.resourceId,
          { lock: true }
        );
        const intentState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.CREDIT_INTENT,
          payload.creditIntentId,
          { lock: true }
        );
        const profile =
          await coreRepository.getCapitalPartnerProfileByOperatorInTransaction(
            client,
            authenticationContext.actorId,
            { lock: false }
          );
        if (
          !passportState ||
          passportState.value.schemaVersion !== "credit_passport_artifact.v1" ||
          passportState.value.status !== "active" ||
          resource.status !== "active" ||
          now >= new Date(passportState.value.expiresAt) ||
          passportState.value.sandboxOnly !== true ||
          passportState.value.productionAuthority !== false ||
          !intentState ||
          intentState.value.creditIntentId !== payload.creditIntentId ||
          intentState.value.subjectId !== passportState.value.subjectId ||
          intentState.value.status !== "decided" ||
          intentState.value.sandboxOnly !== true ||
          intentState.value.productionFundsRequested !== false ||
          !profile ||
          profile.operatorActorId !== authenticationContext.actorId ||
          profile.status !== "active" ||
          profile.invitationOnly !== true ||
          profile.sameTenantOnly !== true ||
          profile.sandboxOnly !== true ||
          profile.productionFundsAuthority !== false
        ) {
          throw new DomainError(
            "authorization_live_policy_rejected",
            "live Capital Partner authoring state rejected the operation"
          );
        }
        const liveStateVersion =
          passportState.aggregateVersion + intentState.aggregateVersion + 1;
        if (!Number.isSafeInteger(liveStateVersion)) {
          throw new DomainError(
            "authorization_live_policy_rejected",
            "live Capital Partner authoring version is unavailable"
          );
        }
        return Object.freeze({
          liveStateVersion,
          evaluatedChecks: Object.freeze([
            "credit_passport_verification_state",
            "credit_intent_state",
            "capital_partner_profile_state",
            "pause"
          ])
        });
      }

      if (
        handler.operationId === "pilotTransitionCapitalPartnerOffer" &&
        hasExactChecks(policy, [
          "credit_offer_state",
          "capital_partner_profile_state",
          "pause"
        ]) &&
        resource?.resourceType === "credit_offer"
      ) {
        const offerState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.CREDIT_OFFER,
          resource.resourceId,
          { lock: true }
        );
        const profile =
          await coreRepository.getCapitalPartnerProfileByOperatorInTransaction(
            client,
            authenticationContext.actorId,
            { lock: false }
          );
        if (
          !offerState ||
          offerState.value.schemaVersion !== "credit_offer.v2" ||
          offerState.value.status !== "offered" ||
          offerState.value.capitalPartnerOperatorId !== authenticationContext.actorId ||
          offerState.value.sandboxOnly !== true ||
          offerState.value.productionFundsApproved !== false ||
          resource.status !== "active" ||
          !profile ||
          profile.capitalPartnerId !== offerState.value.capitalPartnerId ||
          profile.operatorActorId !== authenticationContext.actorId ||
          profile.status !== "active" ||
          profile.sandboxOnly !== true ||
          profile.productionFundsAuthority !== false
        ) {
          throw new DomainError(
            "authorization_live_policy_rejected",
            "live Capital Partner Offer state rejected the operation"
          );
        }
        return Object.freeze({
          liveStateVersion: offerState.aggregateVersion + 1,
          evaluatedChecks: Object.freeze([
            "credit_offer_state",
            "capital_partner_profile_state",
            "pause"
          ])
        });
      }

      if (
        handler.operationId === "pilotVerifyCreditPassportArtifact" &&
        hasExactChecks(policy, ["credit_passport_verification_state"]) &&
        resource?.resourceType === "credit_passport_artifact"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.CREDIT_PASSPORT_ARTIFACT,
          resource.resourceId,
          { lock: false }
        );
        if (
          !state ||
          state.value.schemaVersion !== "credit_passport_artifact.v1" ||
          state.value.status !== "active" ||
          resource.status !== "active" ||
          state.value.sandboxOnly !== true ||
          state.value.productionAuthority !== false
        ) {
          throw new DomainError(
            "authorization_live_policy_rejected",
            "live Credit Passport verification state rejected the operation"
          );
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["credit_passport_verification_state"])
        });
      }

      if (
        handler.operationId === "pilotRevokeCreditPassportArtifact" &&
        hasExactChecks(policy, ["credit_passport_revocation_state"]) &&
        resource?.resourceType === "credit_passport_artifact"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.CREDIT_PASSPORT_ARTIFACT,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state ||
          state.value.schemaVersion !== "credit_passport_artifact.v1" ||
          state.value.status !== "active" ||
          state.value.sandboxOnly !== true ||
          state.value.productionAuthority !== false
        ) {
          throw new DomainError(
            "authorization_live_policy_rejected",
            "live Credit Passport revocation state rejected the operation"
          );
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["credit_passport_revocation_state"])
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
        ["pilotReadOwnSecuredPool", "pilotReviewSecuredPoolAction"].includes(handler.operationId) &&
        resource?.resourceType === "subject" &&
        (
          hasExactChecks(policy, ["pool_binding", "pool_reconciliation"]) ||
          hasExactChecks(policy, ["pool_binding", "pool_oracle", "pool_reconciliation", "pool_risk_control"])
        )
      ) {
        const subjectState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.SUBJECT,
          resource.resourceId,
          { lock: false }
        );
        if (!subjectState || !POOL_SUBJECT_STATUSES.has(subjectState.value.status)) {
          throw new DomainError("authorization_live_policy_rejected", "live Pool Subject state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: subjectState.aggregateVersion + await poolLiveStateVersion(client),
          evaluatedChecks: Object.freeze([...policy.liveChecks])
        });
      }

      if (
        handler.operationId === "pilotReadSecuredPoolRisk" &&
        hasExactChecks(policy, ["pool_reconciliation", "pool_risk_control"]) &&
        resource?.resourceType === "risk_portfolio"
      ) {
        return Object.freeze({
          liveStateVersion: await poolLiveStateVersion(client),
          evaluatedChecks: Object.freeze([...policy.liveChecks])
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
        handler.operationId === "workerAdmitMeteredUsage" &&
        hasExactChecks(policy, ["mandate", "spend_policy", "risk", "cap", "freeze", "inbox_replay"]) &&
        resource?.resourceType === "obligation"
      ) {
        const evidence = payload?.evidence;
        if (
          !evidence || typeof evidence !== "object" || Array.isArray(evidence) ||
          evidence.obligationId !== resource.resourceId ||
          evidence.tenantId !== authenticationContext.tenantId ||
          typeof evidence.nonce !== "string" || evidence.nonce.length === 0 ||
          typeof payload?.expectedPolicyHash !== "string" ||
          !/^0x[0-9a-f]{64}$/.test(payload.expectedPolicyHash)
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Metered Usage scope is unavailable");
        }
        const obligationState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.OBLIGATION,
          resource.resourceId,
          { lock: true }
        );
        const mandateState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.MANDATE,
          evidence.mandateId,
          { lock: true }
        );
        const providerState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.PROVIDER,
          evidence.providerId,
          { lock: true }
        );
        const spendPolicy = await coreRepository.findActiveSpendPolicyForMeteredUsageInTransaction(
          client,
          {
            subjectId: evidence.subjectId,
            providerId: evidence.providerId,
            assetId: evidence.assetId
          },
          { lock: true }
        );
        const spendPolicyState = spendPolicy
          ? await coreRepository.getProjectionStateInTransaction(
              client,
              CoreProjectionType.SPEND_POLICY,
              spendPolicy.spendPolicyId,
              { lock: true }
            )
          : undefined;
        const lockbox = await coreRepository.findAgentLockboxByObligationInTransaction(
          client,
          resource.resourceId,
          { lock: true }
        );
        const duplicates = await coreRepository.findMeteredUsageEvidenceIdentityInTransaction(
          client,
          {
            usageEvidenceId: evidence.usageEvidenceId,
            providerId: evidence.providerId,
            providerEventId: evidence.providerEventId,
            nonceHash: hashId("metered_usage_nonce", evidence.nonce)
          },
          { lock: true }
        );
        const obligation = obligationState?.value;
        const mandate = mandateState?.value;
        const provider = providerState?.value;
        if (
          !obligation || obligation.schemaVersion !== "obligation.v2" ||
          obligation.obligationId !== evidence.obligationId ||
          obligation.subjectId !== evidence.subjectId ||
          obligation.principalId !== evidence.principalId ||
          obligation.mandateId !== evidence.mandateId ||
          obligation.creditOfferAcceptanceId !== evidence.authorizationId ||
          obligation.assetId !== evidence.assetId || obligation.status !== "active" ||
          obligation.executionStatus !== "executed" || obligation.sandboxOnly !== true ||
          obligation.productionFundsMoved !== false || obligation.withdrawable !== false ||
          !mandate || mandate.status !== MandateStatus.ACTIVE ||
          mandate.subjectId !== evidence.subjectId || mandate.principalId !== evidence.principalId ||
          mandate.sandboxOnly !== true || mandate.productionAuthority !== false ||
          !mandate.capabilities.includes(MandateCapability.PROVIDER_SPEND) ||
          !mandate.allowedProviderIds.includes(evidence.providerId) ||
          !mandate.assetIds.includes(evidence.assetId) ||
          new Date(mandate.validFrom) > now || new Date(mandate.expiresAt) <= now ||
          BigInt(evidence.chargeMinor) > BigInt(mandate.perActionLimitMinor) ||
          BigInt(mandate.utilizedMinor) + BigInt(evidence.chargeMinor) > BigInt(mandate.aggregateLimitMinor) ||
          !provider || provider.status !== ProviderStatus.ALLOWLISTED ||
          !spendPolicyState || spendPolicyState.value.status !== SpendPolicyStatus.ACTIVE ||
          spendPolicyState.value.subjectId !== evidence.subjectId ||
          spendPolicyState.value.providerId !== evidence.providerId ||
          spendPolicyState.value.assetId !== evidence.assetId ||
          BigInt(evidence.chargeMinor) > BigInt(spendPolicyState.value.perTxLimitMinor) ||
          BigInt(evidence.chargeMinor) > BigInt(spendPolicyState.value.obligationCapMinor) ||
          (spendPolicyState.value.dailySpentDate === now.toISOString().slice(0, 10) &&
            BigInt(spendPolicyState.value.dailySpentMinor) + BigInt(evidence.chargeMinor) >
              BigInt(spendPolicyState.value.dailyLimitMinor)) ||
          !lockbox || lockbox.status !== "active" ||
          lockbox.obligationId !== evidence.obligationId ||
          lockbox.subjectId !== evidence.subjectId || lockbox.principalId !== evidence.principalId ||
          lockbox.mandateId !== evidence.mandateId || lockbox.creditLineId !== evidence.facilityId ||
          lockbox.assetId !== evidence.assetId || !lockbox.allowedProviderIds.includes(evidence.providerId) ||
          lockbox.sandboxOnly !== true || lockbox.productionFundsMoved !== false ||
          lockbox.withdrawable !== false || duplicates.length !== 0
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Metered Usage state rejected admission");
        }
        const liveStateVersion = obligationState.aggregateVersion + mandateState.aggregateVersion +
          providerState.aggregateVersion + spendPolicyState.aggregateVersion;
        if (!Number.isSafeInteger(liveStateVersion) || liveStateVersion < 1) {
          throw new DomainError("authorization_live_policy_rejected", "live Metered Usage version is unavailable");
        }
        return Object.freeze({
          liveStateVersion,
          evaluatedChecks: Object.freeze([...policy.liveChecks])
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
