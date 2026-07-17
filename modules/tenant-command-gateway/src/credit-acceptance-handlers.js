import {
  ConsentPurpose,
  CreditAuthorityType,
  CreditEventType,
  CreditIntentStatus,
  CreditOfferStatus,
  DomainError,
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  acceptCreditOffer,
  assertConsentAuthorizesCreditOfferAcceptance,
  assertHumanIdentityReferenceUsable,
  assertMandateAuthorizesCreditOfferAcceptance,
  createAcceptedOfferObligation,
  createCreditEvent,
  createCreditOfferAcceptance
} from "../../../packages/domain/src/index.js";
import { ResourceKind } from "../../abuse-control/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function normalizePayload(payload) {
  const keys = ["expectedOfferHash", "expectedTermsHash", "acknowledgementHash"];
  if (
    !payload || typeof payload !== "object" || Array.isArray(payload) ||
    Object.keys(payload).length !== keys.length || keys.some((key) => !Object.hasOwn(payload, key)) ||
    keys.some((key) => typeof payload[key] !== "string" || !HASH_PATTERN.test(payload[key]))
  ) {
    throw new DomainError("invalid_tenant_command_payload", "Offer acceptance payload is invalid");
  }
  return structuredClone(payload);
}

async function assertHumanIdentityEvidence({ client, coreRepository, intent, consent, now }) {
  const references = await coreRepository.listHumanIdentityReferencesForSubjectInTransaction(
    client,
    intent.subjectId,
    { limit: 50 }
  );
  if (references.hasMore) {
    throw new DomainError("identity_evidence_not_current", "current identity Evidence is unavailable");
  }
  const usable = [];
  for (const reference of references.items) {
    if (reference.consentId !== consent.consentId) continue;
    try {
      assertHumanIdentityReferenceUsable(reference, consent, {
        subjectId: intent.subjectId,
        principalId: intent.principalId,
        purposeCode: ConsentPurpose.CREDIT_OFFER_ACCEPTANCE,
        now
      });
      usable.push(reference);
    } catch {
      // Non-current or differently scoped references are intentionally ignored.
    }
  }
  if (usable.length !== 1) {
    throw new DomainError("identity_evidence_not_current", "exactly one current synthetic identity reference is required");
  }
}

function summarizeAcceptance(acceptance) {
  return {
    creditOfferAcceptanceId: acceptance.creditOfferAcceptanceId,
    acceptanceHash: acceptance.acceptanceHash,
    creditOfferId: acceptance.creditOfferId,
    creditOfferHash: acceptance.creditOfferHash,
    termsHash: acceptance.termsHash,
    creditIntentId: acceptance.creditIntentId,
    riskDecisionId: acceptance.riskDecisionId,
    subjectId: acceptance.subjectId,
    principalId: acceptance.principalId,
    authorityType: acceptance.authorityType,
    authorityId: acceptance.authorityRef,
    acknowledgementHash: acceptance.acknowledgementHash,
    acceptedAt: acceptance.acceptedAt,
    sandboxOnly: true,
    productionAuthority: false
  };
}

async function evidenceActorBindings({
  authenticationContext,
  directory,
  subjectId,
  now
}) {
  const owner = {
    actorId: authenticationContext.actorId,
    actorType: authenticationContext.actorType,
    relationship: "owner"
  };
  if (authenticationContext.actorType !== ActorType.AGENT) return [owner];
  const bindings = await directory.listActiveResourceBindings({
    resourceType: "subject",
    resourceId: subjectId,
    now
  });
  const subjectBinding = bindings.find((binding) => (
    binding.actorId === authenticationContext.actorId &&
    binding.actorType === ActorType.AGENT &&
    binding.relationship === "subject"
  ));
  const controller = bindings.find((binding) => (
    binding.actorId === subjectBinding?.controllerActorId &&
    binding.actorType === ActorType.HUMAN &&
    binding.relationship === "controller"
  ));
  if (!subjectBinding?.controllerActorId || !controller) unavailable();
  return [owner, {
    actorId: controller.actorId,
    actorType: controller.actorType,
    relationship: "controller"
  }];
}

export function summarizeSharedObligation(obligation) {
  return {
    obligationId: obligation.obligationId,
    obligationHash: obligation.obligationHash,
    subjectId: obligation.subjectId,
    principalId: obligation.principalId,
    creditIntentId: obligation.creditIntentId,
    riskDecisionId: obligation.riskDecisionId,
    creditOfferId: obligation.creditOfferId,
    creditOfferAcceptanceId: obligation.creditOfferAcceptanceId,
    authorityType: obligation.authorityType,
    authorityId: obligation.authorityRef,
    assetId: obligation.assetId,
    originalPrincipalMinor: obligation.originalPrincipalMinor,
    outstandingPrincipalMinor: obligation.outstandingPrincipalMinor,
    annualRateBps: obligation.annualRateBps,
    originationFeeMinor: obligation.originationFeeMinor,
    accruedInterestMinor: obligation.accruedInterestMinor,
    outstandingInterestMinor: obligation.outstandingInterestMinor,
    accruedFeesMinor: obligation.accruedFeesMinor,
    outstandingFeesMinor: obligation.outstandingFeesMinor,
    totalRepaidMinor: obligation.totalRepaidMinor,
    repaymentFrequency: obligation.repaymentFrequency,
    installmentCount: obligation.installmentCount,
    firstPaymentAt: obligation.firstPaymentAt,
    maturityAt: obligation.maturityAt,
    scheduleVersion: obligation.scheduleVersion,
    scheduleHash: obligation.scheduleHash,
    scheduleSequence: obligation.scheduleSequence,
    installments: obligation.installments.map((row) => ({ ...row })),
    executionStatus: obligation.executionStatus,
    ...(obligation.sandboxExecutionReceiptId
      ? { sandboxExecutionReceiptId: obligation.sandboxExecutionReceiptId }
      : {}),
    ...(obligation.executedAt ? { executedAt: obligation.executedAt } : {}),
    ...(obligation.lastAccruedAt ? { lastAccruedAt: obligation.lastAccruedAt } : {}),
    ...(obligation.interestAccrualRemainder !== undefined
      ? { interestAccrualRemainder: obligation.interestAccrualRemainder }
      : {}),
    ...(obligation.withdrawable !== undefined ? { withdrawable: obligation.withdrawable } : {}),
    sandboxOnly: true,
    productionFundsMoved: false,
    status: obligation.status,
    servicingClassification: obligation.servicingClassification,
    daysPastDue: obligation.daysPastDue,
    oldestUnpaidInstallmentId: obligation.oldestUnpaidInstallmentId,
    servicingEffectiveAt: obligation.servicingEffectiveAt,
    servicingReasonCode: obligation.servicingReasonCode,
    servicingPolicyVersion: obligation.servicingPolicyVersion,
    servicingOwnerCode: obligation.servicingOwnerCode,
    ...(obligation.resolutionType ? {
      resolutionType: obligation.resolutionType,
      resolutionReasonCode: obligation.resolutionReasonCode,
      resolutionAt: obligation.resolutionAt
    } : {}),
    writtenOffPrincipalMinor: obligation.writtenOffPrincipalMinor,
    writtenOffInterestMinor: obligation.writtenOffInterestMinor,
    writtenOffFeesMinor: obligation.writtenOffFeesMinor,
    acceptedAt: obligation.acceptedAt,
    createdAt: obligation.createdAt,
    updatedAt: obligation.updatedAt,
    schemaVersion: obligation.schemaVersion
  };
}

export function summarizeServicingAction(action) {
  return {
    servicingActionId: action.servicingActionId,
    servicingActionHash: action.servicingActionHash,
    obligationId: action.obligationId,
    subjectId: action.subjectId,
    actionType: action.actionType,
    previousStatus: action.previousStatus,
    nextStatus: action.nextStatus,
    previousClassification: action.previousClassification,
    nextClassification: action.nextClassification,
    daysPastDue: action.daysPastDue,
    oldestUnpaidInstallmentId: action.oldestUnpaidInstallmentId,
    reasonCode: action.reasonCode,
    source: action.source,
    policyVersion: action.policyVersion,
    scheduleSequenceBefore: action.scheduleSequenceBefore,
    scheduleSequenceAfter: action.scheduleSequenceAfter,
    balancesBefore: action.balancesBefore,
    balancesAfter: action.balancesAfter,
    ...(action.approvalProposalId ? { approvalProposalId: action.approvalProposalId } : {}),
    ...(action.approvalExecutionId ? { approvalExecutionId: action.approvalExecutionId } : {}),
    effectiveAt: action.effectiveAt,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: action.schemaVersion
  };
}

async function loadAcceptanceResourceBaselines({ client, coreRepository }) {
  return {
    [ResourceKind.OPEN_OBLIGATIONS]:
      await coreRepository.countOpenObligationsForCapacityInTransaction(client)
  };
}

export function acceptCreditOfferCommandHandler() {
  return Object.freeze({
    operationId: "pilotAcceptCreditOffer",
    kind: "command",
    resourceDeltas() {
      return { [ResourceKind.OPEN_OBLIGATIONS]: 1 };
    },
    loadResourceBaselines: loadAcceptanceResourceBaselines,
    async plan({
      client,
      coreRepository,
      directory,
      payload,
      authenticationContext,
      authorizationDecision,
      now,
      requestId,
      correlationId
    }) {
      const input = normalizePayload(payload);
      if (authorizationDecision.resourceType !== "credit_offer") unavailable();
      const offerState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.CREDIT_OFFER,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const offer = offerState?.value;
      if (!offer || offer.creditOfferId !== authorizationDecision.resourceId) unavailable();
      if (offer.status !== CreditOfferStatus.OFFERED) {
        throw new DomainError("offer_not_available", "Offer is no longer available");
      }
      if (now >= new Date(offer.validUntil)) {
        throw new DomainError("offer_expired", "Offer has expired");
      }
      if (offer.creditOfferHash !== input.expectedOfferHash || offer.termsHash !== input.expectedTermsHash) {
        throw new DomainError("offer_terms_mismatch", "Offer or terms hash is stale");
      }

      const intentState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.CREDIT_INTENT,
        offer.creditIntentId,
        { lock: true }
      );
      const decisionState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.RISK_DECISION,
        offer.riskDecisionId,
        { lock: true }
      );
      const intent = intentState?.value;
      const decision = decisionState?.value;
      if (
        !intent || intent.status !== CreditIntentStatus.DECIDED ||
        !decision || decision.status !== "approved" ||
        decision.creditIntentId !== intent.creditIntentId
      ) {
        throw new DomainError("offer_not_available", "Offer decision provenance is not current");
      }

      const subjectState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        intent.subjectId,
        { lock: true }
      );
      const principalState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.PRINCIPAL,
        intent.principalId,
        { lock: true }
      );
      const subject = subjectState?.value;
      const principal = principalState?.value;
      const expectedSubjectType = authenticationContext.actorType === ActorType.HUMAN
        ? SubjectType.HUMAN
        : SubjectType.AGENT;
      const eligibleStatus = authenticationContext.actorType === ActorType.HUMAN
        ? [SubjectStatus.PENDING, SubjectStatus.ACTIVE]
        : [SubjectStatus.ACTIVE];
      if (
        !subject || subject.subjectType !== expectedSubjectType ||
        subject.primaryPrincipalId !== intent.principalId ||
        !eligibleStatus.includes(subject.status) ||
        !principal || principal.status !== PrincipalStatus.ACTIVE
      ) {
        throw new DomainError("credit_state_frozen", "Subject or Principal state does not allow acceptance");
      }

      const expectedAuthorityType = authenticationContext.actorType === ActorType.HUMAN
        ? CreditAuthorityType.CONSENT
        : CreditAuthorityType.MANDATE;
      if (intent.authorityType !== expectedAuthorityType) unavailable();
      const authorityState = await coreRepository.getProjectionStateInTransaction(
        client,
        expectedAuthorityType === CreditAuthorityType.CONSENT
          ? CoreProjectionType.CONSENT_RECORD
          : CoreProjectionType.MANDATE,
        intent.authorityRef,
        { lock: true }
      );
      if (!authorityState) throw new DomainError("authority_not_current", "acceptance authority is unavailable");
      if (expectedAuthorityType === CreditAuthorityType.CONSENT) {
        assertConsentAuthorizesCreditOfferAcceptance(authorityState.value, { offer, intent, now });
        await assertHumanIdentityEvidence({
          client,
          coreRepository,
          intent,
          consent: authorityState.value,
          now
        });
      } else {
        assertMandateAuthorizesCreditOfferAcceptance(authorityState.value, { offer, intent, now });
      }

      const riskState = await coreRepository.getCreditApplicationRiskStateInTransaction(
        client,
        intent.subjectId,
        intent.assetId
      );
      if (riskState.frozenCreditLineCount > 0) {
        throw new DomainError("credit_state_frozen", "credit state is frozen");
      }
      if (riskState.adverseObligationCount > 0) {
        throw new DomainError("adverse_obligation_open", "an adverse Obligation is already open");
      }
      if (await coreRepository.findCreditOfferAcceptanceByOfferInTransaction(client, offer.creditOfferId)) {
        throw new DomainError("offer_not_available", "Offer already has an Acceptance");
      }
      if (await coreRepository.findObligationByCreditOfferInTransaction(client, offer.creditOfferId)) {
        throw new DomainError("offer_not_available", "Offer already has an Obligation");
      }

      const acceptance = createCreditOfferAcceptance({
        offer,
        intent,
        decision,
        authorityType: intent.authorityType,
        authorityRef: intent.authorityRef,
        acknowledgementHash: input.acknowledgementHash,
        acceptedByActorId: authenticationContext.actorId,
        now
      });
      const acceptedOffer = acceptCreditOffer(offer, {
        expectedOfferHash: input.expectedOfferHash,
        expectedTermsHash: input.expectedTermsHash,
        acceptanceId: acceptance.creditOfferAcceptanceId,
        now
      });
      const obligation = createAcceptedOfferObligation({ offer, intent, decision, acceptance, now });
      const acceptanceEvent = createCreditEvent({
        eventType: CreditEventType.CREDIT_OFFER_ACCEPTANCE_RECORDED,
        subjectId: intent.subjectId,
        obligationId: obligation.obligationId,
        payload: {
          creditOfferAcceptanceId: acceptance.creditOfferAcceptanceId,
          acceptanceHash: acceptance.acceptanceHash,
          creditOfferId: offer.creditOfferId,
          creditOfferHash: offer.creditOfferHash,
          termsHash: offer.termsHash,
          acknowledgementHash: acceptance.acknowledgementHash,
          authorityType: acceptance.authorityType,
          authorityRef: acceptance.authorityRef,
          actorHash: acceptance.acceptedByActorHash,
          sandboxOnly: true,
          productionAuthority: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      const offerEvent = createCreditEvent({
        eventType: CreditEventType.CREDIT_OFFER_ACCEPTED,
        subjectId: intent.subjectId,
        obligationId: obligation.obligationId,
        payload: {
          creditOfferId: offer.creditOfferId,
          creditOfferAcceptanceId: acceptance.creditOfferAcceptanceId,
          previousStatus: offer.status,
          nextStatus: acceptedOffer.status,
          actorHash: acceptance.acceptedByActorHash,
          causationId: requestId,
          correlationId
        },
        now
      });
      const obligationEvent = createCreditEvent({
        eventType: CreditEventType.OBLIGATION_CREATED,
        subjectId: intent.subjectId,
        obligationId: obligation.obligationId,
        payload: {
          obligationId: obligation.obligationId,
          obligationHash: obligation.obligationHash,
          creditIntentId: intent.creditIntentId,
          riskDecisionId: decision.riskDecisionId,
          creditOfferId: offer.creditOfferId,
          creditOfferAcceptanceId: acceptance.creditOfferAcceptanceId,
          authorityType: obligation.authorityType,
          authorityRef: obligation.authorityRef,
          assetId: obligation.assetId,
          originalPrincipalMinor: obligation.originalPrincipalMinor,
          scheduleHash: obligation.scheduleHash,
          executionStatus: obligation.executionStatus,
          sandboxOnly: true,
          productionFundsMoved: false,
          actorHash: acceptance.acceptedByActorHash,
          causationId: requestId,
          correlationId
        },
        now
      });
      const resourceBaselines = await loadAcceptanceResourceBaselines({ client, coreRepository });
      const evidenceBindings = await evidenceActorBindings({
        authenticationContext,
        directory,
        subjectId: intent.subjectId,
        now
      });
      return {
        aggregateType: "credit_offer",
        aggregateId: offer.creditOfferId,
        events: [
          {
            aggregateType: "credit_offer_acceptance",
            aggregateId: acceptance.creditOfferAcceptanceId,
            expectedVersion: 0,
            event: acceptanceEvent
          },
          {
            aggregateType: "credit_offer",
            aggregateId: offer.creditOfferId,
            expectedVersion: offerState.aggregateVersion,
            event: offerEvent
          },
          {
            aggregateType: "obligation",
            aggregateId: obligation.obligationId,
            expectedVersion: 0,
            event: obligationEvent
          }
        ],
        writes: [
          {
            type: CoreProjectionType.CREDIT_OFFER_ACCEPTANCE,
            value: acceptance,
            eventId: acceptanceEvent.eventId
          },
          { type: CoreProjectionType.CREDIT_OFFER, value: acceptedOffer, eventId: offerEvent.eventId },
          { type: CoreProjectionType.OBLIGATION, value: obligation, eventId: obligationEvent.eventId }
        ],
        response: {
          acceptance: summarizeAcceptance(acceptance),
          obligation: summarizeSharedObligation(obligation),
          offerStatus: acceptedOffer.status,
          executionCreated: false,
          fundsAuthority: false,
          schemaVersion: "tenant_credit_offer_accepted.v1"
        },
        resourceBaselines,
        authorizationResource: {
          resourceType: "obligation",
          resourceId: obligation.obligationId,
          actorBindings: [{
            actorId: authenticationContext.actorId,
            actorType: authenticationContext.actorType,
            relationship: "owner"
          }]
        },
        additionalAuthorizationResources: [{
          resourceType: "evidence",
          resourceId: obligation.obligationId,
          actorBindings: evidenceBindings
        }]
      };
    }
  });
}

export function createCreditAcceptanceHandlers() {
  return Object.freeze([acceptCreditOfferCommandHandler()]);
}
