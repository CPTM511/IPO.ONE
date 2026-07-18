import {
  ConsentPurpose,
  CreditAuthorityType,
  CreditEventType,
  CreditIntentStatus,
  DomainError,
  PrincipalStatus,
  RiskDecisionStatus,
  SubjectStatus,
  SubjectType,
  assertConsentAuthorizesCreditIntent,
  assertHumanDecisionConsentPurposes,
  assertHumanIdentityReferenceUsable,
  createCreditEvent,
  createEvidenceDerivedCreditDecisionOutcome,
  deriveSandboxCreditPolicyDenial,
  hashId
} from "../../../packages/domain/src/index.js";
import { ResourceKind } from "../../abuse-control/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  assertMandateAuthorizesCreditIntent,
  summarizeCreditIntent
} from "./credit-intent-handlers.js";

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function normalizeEmptyPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 0
  ) {
    throw new DomainError("invalid_tenant_command_payload", "Credit evaluation payload must be empty");
  }
}

export function summarizeCreditDecision(decision) {
  if (!decision) return null;
  return {
    riskDecisionId: decision.riskDecisionId,
    decisionHash: decision.decisionHash,
    creditIntentId: decision.creditIntentId,
    subjectId: decision.subjectId,
    authorityType: decision.authorityType,
    authorityId: decision.authorityRef,
    assetId: decision.assetId,
    status: decision.status,
    policyVersion: decision.modelVersion,
    approvedPrincipalMinor: decision.limitMinor,
    reasonCodes: decision.reasons.map((reason) => reason.code),
    ...(decision.decisionPassport ? {
      decisionPassport: {
        riskDecisionPassportId: decision.decisionPassport.riskDecisionPassportId,
        decisionPassportHash: decision.decisionPassport.decisionPassportHash,
        riskFeatureSnapshotId: decision.decisionPassport.riskFeatureSnapshotId,
        featureSnapshotHash: decision.decisionPassport.featureSnapshotHash,
        featureSetVersion: decision.decisionPassport.featureSetVersion,
        policyVersion: decision.decisionPassport.policyVersion,
        policyHash: decision.decisionPassport.policyHash,
        riskStateHash: decision.riskFeatureSnapshot.riskStateAttestation.stateHash,
        sourceEvidence: decision.riskFeatureSnapshot.sourceEvidence.map((source) => ({
          role: source.role,
          evidenceHash: source.evidenceHash,
          entityHash: source.entityHash,
          aggregateVersion: source.aggregateVersion,
          sourceFinality: source.sourceFinality
        })),
        reasonLineage: decision.decisionPassport.reasonLineage.map((lineage) => ({
          reasonCode: lineage.reasonCode,
          featureKeys: [...lineage.featureKeys],
          sourceRoles: [...lineage.sourceRoles]
        })),
        asOf: decision.decisionPassport.asOf,
        nonAuthorizing: decision.decisionPassport.nonAuthorizing,
        sandboxOnly: decision.decisionPassport.sandboxOnly,
        productionAuthority: decision.decisionPassport.productionAuthority,
        schemaVersion: decision.decisionPassport.schemaVersion
      }
    } : {}),
    sandboxOnly: decision.sandboxOnly,
    productionAuthority: decision.productionAuthority,
    decidedAt: decision.createdAt
  };
}

export function summarizeCreditOffer(offer) {
  if (!offer) return null;
  return {
    creditOfferId: offer.creditOfferId,
    creditOfferHash: offer.creditOfferHash,
    termsHash: offer.termsHash,
    creditIntentId: offer.creditIntentId,
    riskDecisionId: offer.riskDecisionId,
    subjectId: offer.subjectId,
    assetId: offer.assetId,
    approvedPrincipalMinor: offer.approvedPrincipalMinor,
    annualRateBps: offer.annualRateBps,
    originationFeeMinor: offer.originationFeeMinor,
    repaymentFrequency: offer.repaymentFrequency,
    installmentCount: offer.installmentCount,
    firstPaymentAt: offer.firstPaymentAt,
    maturityAt: offer.maturityAt,
    disclosureRef: offer.disclosureRef,
    termsVersion: offer.termsVersion,
    validUntil: offer.validUntil,
    reasonCodes: [...offer.reasonCodes],
    sandboxOnly: offer.sandboxOnly,
    productionFundsApproved: offer.productionFundsApproved,
    status: offer.status,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt
  };
}

function mapAuthorityFailure(actorType, error) {
  if (!(error instanceof DomainError)) throw error;
  if (actorType === ActorType.HUMAN && error.code.startsWith("identity_reference")) {
    return "identity_evidence_not_current";
  }
  return "authority_not_current";
}

function sourceEvidence(role, entityType, entityId, state) {
  if (!state) return undefined;
  return {
    role,
    entityType,
    entityIdHash: hashId("risk_source_entity", { entityType, entityId }),
    entityHash: state.entityHash,
    aggregateVersion: state.aggregateVersion,
    eventId: state.sourceEventId,
    evidenceHash: state.sourceEvidenceHash,
    sourceFinality: state.sourceFinality
  };
}

async function evaluateHumanAuthority({
  client,
  coreRepository,
  intent,
  authority,
  now
}) {
  try {
    assertConsentAuthorizesCreditIntent(authority, intent, { now });
    assertHumanDecisionConsentPurposes(authority);
  } catch (error) {
    return {
      authorityCurrent: false,
      identityEvidenceCurrent: false,
      denialCode: mapAuthorityFailure(ActorType.HUMAN, error)
    };
  }
  const references = await coreRepository.listHumanIdentityReferencesForSubjectInTransaction(
    client,
    intent.subjectId,
    { limit: 50 }
  );
  if (references.hasMore) {
    return {
      authorityCurrent: true,
      identityEvidenceCurrent: false,
      denialCode: "identity_evidence_not_current"
    };
  }
  const usable = [];
  for (const reference of references.items) {
    if (reference.consentId !== authority.consentId) continue;
    try {
      assertHumanIdentityReferenceUsable(reference, authority, {
        subjectId: intent.subjectId,
        principalId: intent.principalId,
        purposeCode: ConsentPurpose.IDENTITY_REFERENCE_USE,
        now
      });
      if (!reference.purposeCodes.includes(ConsentPurpose.CREDIT_DECISION)) continue;
      usable.push(reference);
    } catch {
      // A non-current reference is ignored; exactly one current reference is required below.
    }
  }
  if (usable.length !== 1) {
    return {
      authorityCurrent: true,
      identityEvidenceCurrent: false,
      denialCode: "identity_evidence_not_current"
    };
  }
  const identityReferenceState = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.HUMAN_IDENTITY_REFERENCE,
    usable[0].identityReferenceId,
    { lock: true }
  );
  if (!identityReferenceState || identityReferenceState.value.identityReferenceId !== usable[0].identityReferenceId) {
    return {
      authorityCurrent: true,
      identityEvidenceCurrent: false,
      denialCode: "identity_evidence_not_current"
    };
  }
  try {
    assertHumanIdentityReferenceUsable(identityReferenceState.value, authority, {
      subjectId: intent.subjectId,
      principalId: intent.principalId,
      purposeCode: ConsentPurpose.IDENTITY_REFERENCE_USE,
      now
    });
  } catch {
    return {
      authorityCurrent: true,
      identityEvidenceCurrent: false,
      denialCode: "identity_evidence_not_current"
    };
  }
  if (!identityReferenceState.value.purposeCodes.includes(ConsentPurpose.CREDIT_DECISION)) {
    return {
      authorityCurrent: true,
      identityEvidenceCurrent: false,
      denialCode: "identity_evidence_not_current"
    };
  }
  return {
    authorityCurrent: true,
    identityEvidenceCurrent: true,
    identityReferenceState
  };
}

async function loadDecisionEligibility({
  client,
  coreRepository,
  intentState,
  intent,
  actorType,
  now
}) {
  let denialCode = deriveSandboxCreditPolicyDenial(intent);
  let frozen = false;
  const expectedAuthorityType = actorType === ActorType.HUMAN
    ? CreditAuthorityType.CONSENT
    : CreditAuthorityType.MANDATE;
  if (intent.authorityType !== expectedAuthorityType) unavailable();

  const subjectState = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.SUBJECT,
    intent.subjectId,
    { lock: true }
  );
  const subject = subjectState?.value;
  const expectedSubjectType = actorType === ActorType.HUMAN ? SubjectType.HUMAN : SubjectType.AGENT;
  const subjectBound = Boolean(
    subject &&
    subject.subjectType === expectedSubjectType &&
    subject.primaryPrincipalId === intent.principalId
  );
  const subjectSuspended = subjectBound && subject.status === SubjectStatus.SUSPENDED;
  const subjectEligible = subjectBound && [SubjectStatus.PENDING, SubjectStatus.ACTIVE].includes(subject.status);
  if (!subjectBound) {
    denialCode ??= "application_not_eligible";
  } else if (subjectSuspended) {
    denialCode ??= "credit_state_frozen";
    frozen = true;
  } else if (!subjectEligible) {
    denialCode ??= "application_not_eligible";
  }

  const principalState = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.PRINCIPAL,
    intent.principalId,
    { lock: true }
  );
  const principalEligible = Boolean(principalState && principalState.value.status === PrincipalStatus.ACTIVE);
  if (!principalEligible) {
    denialCode ??= "application_not_eligible";
  }

  const authorityType = actorType === ActorType.HUMAN
    ? CoreProjectionType.CONSENT_RECORD
    : CoreProjectionType.MANDATE;
  const authorityState = await coreRepository.getProjectionStateInTransaction(
    client,
    authorityType,
    intent.authorityRef,
    { lock: true }
  );
  let authorityCurrent = false;
  let identityEvidenceCurrent = actorType === ActorType.HUMAN ? false : null;
  let identityReferenceState;
  if (!authorityState) {
    denialCode ??= "authority_not_current";
  } else if (actorType === ActorType.HUMAN) {
    const authorityResult = await evaluateHumanAuthority({
      client,
      coreRepository,
      intent,
      authority: authorityState.value,
      now
    });
    authorityCurrent = authorityResult.authorityCurrent;
    identityEvidenceCurrent = authorityResult.identityEvidenceCurrent;
    identityReferenceState = authorityResult.identityReferenceState;
    denialCode ??= authorityResult.denialCode;
  } else {
    try {
      assertMandateAuthorizesCreditIntent(authorityState.value, intent, now);
      authorityCurrent = true;
    } catch (error) {
      denialCode ??= mapAuthorityFailure(ActorType.AGENT, error);
    }
  }

  const riskState = await coreRepository.getCreditApplicationRiskStateInTransaction(
    client,
    intent.subjectId,
    intent.assetId
  );
  if (riskState.frozenCreditLineCount > 0) {
    denialCode ??= "credit_state_frozen";
    frozen = true;
  } else if (riskState.adverseObligationCount > 0) {
    denialCode ??= "adverse_obligation_open";
  }
  const principalBindingCurrent = actorType === ActorType.AGENT
    ? subjectBound && principalEligible && authorityCurrent
    : null;
  return {
    denialCode,
    frozen,
    eligibilityFacts: {
      subjectEligible,
      subjectSuspended,
      principalEligible,
      authorityCurrent,
      identityEvidenceCurrent,
      principalBindingCurrent
    },
    sourceEvidence: [
      sourceEvidence("credit_intent", CoreProjectionType.CREDIT_INTENT, intent.creditIntentId, intentState),
      sourceEvidence("subject", CoreProjectionType.SUBJECT, intent.subjectId, subjectState),
      sourceEvidence("principal", CoreProjectionType.PRINCIPAL, intent.principalId, principalState),
      sourceEvidence("authority", authorityType, intent.authorityRef, authorityState),
      sourceEvidence(
        "human_identity_reference",
        CoreProjectionType.HUMAN_IDENTITY_REFERENCE,
        identityReferenceState?.value.identityReferenceId,
        identityReferenceState
      )
    ].filter(Boolean),
    riskState
  };
}

async function loadDecisionResourceBaselines({ client, coreRepository }) {
  return {
    [ResourceKind.CREDIT_DECISIONS]:
      await coreRepository.countCreditDecisionsForCapacityInTransaction(client)
  };
}

export function evaluateCreditApplicationCommandHandler() {
  return Object.freeze({
    operationId: "pilotEvaluateCreditApplication",
    kind: "command",
    resourceDeltas() {
      return { [ResourceKind.CREDIT_DECISIONS]: 1 };
    },
    loadResourceBaselines: loadDecisionResourceBaselines,
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
      normalizeEmptyPayload(payload);
      if (authorizationDecision.resourceType !== "credit_intent") unavailable();
      const intentState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.CREDIT_INTENT,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const intent = intentState?.value;
      if (
        !intent ||
        intent.creditIntentId !== authorizationDecision.resourceId ||
        intent.status !== CreditIntentStatus.SUBMITTED ||
        intent.sandboxOnly !== true ||
        intent.productionFundsRequested !== false
      ) unavailable();

      const existingDecision = await coreRepository.findRiskDecisionByCreditIntentInTransaction(
        client,
        intent.creditIntentId,
        { lock: true }
      );
      if (existingDecision) {
        throw new DomainError("credit_decision_already_exists", "Credit Intent already has a Decision");
      }
      const existingOffer = await coreRepository.findCreditOfferByIntentInTransaction(
        client,
        intent.creditIntentId,
        { lock: true }
      );
      if (existingOffer) {
        throw new DomainError("credit_offer_conflict", "Credit Intent already has an Offer");
      }

      const eligibility = await loadDecisionEligibility({
        client,
        coreRepository,
        intentState,
        intent,
        actorType: authenticationContext.actorType,
        now
      });
      const { decision, offer } = createEvidenceDerivedCreditDecisionOutcome({
        intent,
        denialCode: eligibility.denialCode,
        frozen: eligibility.frozen,
        eligibilityFacts: eligibility.eligibilityFacts,
        sourceEvidence: eligibility.sourceEvidence,
        riskState: eligibility.riskState,
        now
      });
      const decidedIntent = {
        ...intent,
        status: CreditIntentStatus.DECIDED,
        updatedAt: now.toISOString()
      };
      const intentEvent = createCreditEvent({
        eventType: CreditEventType.CREDIT_INTENT_STATUS_CHANGED,
        subjectId: intent.subjectId,
        payload: {
          creditIntentId: intent.creditIntentId,
          previousStatus: intent.status,
          nextStatus: decidedIntent.status,
          riskDecisionId: decision.riskDecisionId,
          decisionStatus: decision.status,
          reasonCodes: decision.reasons.map((reason) => reason.code),
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      const decisionEvent = createCreditEvent({
        eventType: CreditEventType.RISK_DECISION_CREATED,
        subjectId: intent.subjectId,
        payload: {
          riskDecisionId: decision.riskDecisionId,
          decisionHash: decision.decisionHash,
          creditIntentId: intent.creditIntentId,
          authorityType: decision.authorityType,
          authorityRef: decision.authorityRef,
          status: decision.status,
          modelVersion: decision.modelVersion,
          policyHash: decision.policyHash,
          riskFeatureSnapshotId: decision.riskFeatureSnapshotId,
          featureSnapshotHash: decision.featureSnapshotHash,
          riskDecisionPassportId: decision.decisionPassport.riskDecisionPassportId,
          decisionPassportHash: decision.decisionPassport.decisionPassportHash,
          reasonCodes: decision.reasons.map((reason) => reason.code),
          sandboxOnly: true,
          productionAuthority: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      const events = [
        {
          aggregateType: "credit_intent",
          aggregateId: intent.creditIntentId,
          expectedVersion: intentState.aggregateVersion,
          event: intentEvent
        },
        {
          aggregateType: "risk_decision",
          aggregateId: decision.riskDecisionId,
          expectedVersion: 0,
          event: decisionEvent
        }
      ];
      const writes = [
        { type: CoreProjectionType.CREDIT_INTENT, value: decidedIntent, eventId: intentEvent.eventId },
        { type: CoreProjectionType.RISK_DECISION, value: decision, eventId: decisionEvent.eventId }
      ];
      if (offer) {
        const offerEvent = createCreditEvent({
          eventType: CreditEventType.CREDIT_OFFER_CREATED,
          subjectId: intent.subjectId,
          payload: {
            creditOfferId: offer.creditOfferId,
            creditOfferHash: offer.creditOfferHash,
            termsHash: offer.termsHash,
            creditIntentId: intent.creditIntentId,
            riskDecisionId: decision.riskDecisionId,
            status: offer.status,
            validUntil: offer.validUntil,
            sandboxOnly: true,
            productionFundsApproved: false,
            causationId: requestId,
            correlationId
          },
          now
        });
        events.push({
          aggregateType: "credit_offer",
          aggregateId: offer.creditOfferId,
          expectedVersion: 0,
          event: offerEvent
        });
        writes.push({ type: CoreProjectionType.CREDIT_OFFER, value: offer, eventId: offerEvent.eventId });
      }
      const resourceBaselines = await loadDecisionResourceBaselines({ client, coreRepository });
      return {
        aggregateType: "credit_intent",
        aggregateId: intent.creditIntentId,
        events,
        writes,
        response: {
          creditIntent: summarizeCreditIntent(decidedIntent),
          decision: summarizeCreditDecision(decision),
          offer: summarizeCreditOffer(offer),
          schemaVersion: "tenant_credit_application_evaluated.v2"
        },
        resourceBaselines,
        authorizationResource: {
          resourceType: offer ? "credit_offer" : "risk_decision",
          resourceId: offer?.creditOfferId ?? decision.riskDecisionId,
          actorBindings: [{
            actorId: authenticationContext.actorId,
            actorType: authenticationContext.actorType,
            relationship: "owner"
          }]
        }
      };
    }
  });
}

export function createCreditDecisionHandlers() {
  return Object.freeze([evaluateCreditApplicationCommandHandler()]);
}
