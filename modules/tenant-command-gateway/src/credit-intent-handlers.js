import {
  CreditAuthorityType,
  CreditEventType,
  DomainError,
  MandateCapability,
  MandateStatus,
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  assertConsentAuthorizesCreditIntent,
  assertNoRawPiiReference,
  createCreditEvent,
  createCreditIntent
} from "../../../packages/domain/src/index.js";
import { ResourceKind } from "../../abuse-control/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const ALLOWED_PAYLOAD_KEYS = new Set([
  "authorityId",
  "assetId",
  "requestedPrincipalMinor",
  "purposeCode",
  "requestedTermDays",
  "repaymentFrequency",
  "installmentCount"
]);
const ELIGIBLE_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]*$/;

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function normalizeCreditIntentPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== ALLOWED_PAYLOAD_KEYS.size ||
    Object.keys(payload).some((key) => !ALLOWED_PAYLOAD_KEYS.has(key))
  ) {
    throw new DomainError("invalid_tenant_command_payload", "Credit Intent payload is invalid");
  }
  for (const name of ["authorityId", "assetId", "purposeCode", "repaymentFrequency"]) {
    if (
      typeof payload[name] !== "string" ||
      payload[name].length < 1 ||
      payload[name].length > 256 ||
      !IDENTIFIER_PATTERN.test(payload[name])
    ) {
      throw new DomainError("invalid_tenant_command_payload", `Credit Intent ${name} is invalid`);
    }
  }
  const normalized = structuredClone(payload);
  assertNoRawPiiReference(normalized, "creditIntentRequest");
  return normalized;
}

export function summarizeCreditIntent(intent) {
  return {
    creditIntentId: intent.creditIntentId,
    creditIntentHash: intent.creditIntentHash,
    subjectId: intent.subjectId,
    authorityType: intent.authorityType,
    authorityId: intent.authorityRef,
    assetId: intent.assetId,
    requestedPrincipalMinor: intent.requestedPrincipalMinor,
    purposeCode: intent.purposeCode,
    requestedTermDays: intent.requestedTermDays,
    repaymentFrequency: intent.repaymentFrequency,
    installmentCount: intent.installmentCount,
    sandboxOnly: intent.sandboxOnly,
    productionFundsRequested: intent.productionFundsRequested,
    status: intent.status,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt
  };
}

export function assertMandateAuthorizesCreditIntent(mandate, intent, now) {
  if (
    !mandate ||
    mandate.mandateId !== intent.authorityRef ||
    mandate.subjectId !== intent.subjectId ||
    mandate.principalId !== intent.principalId ||
    mandate.status !== MandateStatus.DRAFT
  ) {
    throw new DomainError("mandate_authority_mismatch", "Credit Intent does not match a draft Mandate");
  }
  if (new Date(mandate.validFrom) > now || new Date(mandate.expiresAt) <= now) {
    throw new DomainError("mandate_not_current", "draft Mandate is outside its validity window");
  }
  if (
    !mandate.capabilities.includes(MandateCapability.REQUEST_CREDIT) ||
    !mandate.assetIds.includes(intent.assetId)
  ) {
    throw new DomainError("mandate_scope_mismatch", "Credit Intent is outside the draft Mandate scope");
  }
  const requested = BigInt(intent.requestedPrincipalMinor);
  const aggregateRemaining = BigInt(mandate.aggregateLimitMinor) - BigInt(mandate.utilizedMinor);
  if (requested > BigInt(mandate.perActionLimitMinor) || requested > aggregateRemaining) {
    throw new DomainError("mandate_limit_exceeded", "Credit Intent exceeds the draft Mandate limits");
  }
  return true;
}

export async function resolveCreditIntentAuthority({
  client,
  coreRepository,
  resourceId,
  actorType,
  payload,
  now
}) {
  const input = normalizeCreditIntentPayload(payload);
  if (!new Set([ActorType.HUMAN, ActorType.AGENT]).has(actorType)) unavailable();
  const subjectState = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.SUBJECT,
    resourceId,
    { lock: true }
  );
  const subject = subjectState?.value;
  const expectedSubjectType = actorType === ActorType.HUMAN ? SubjectType.HUMAN : SubjectType.AGENT;
  if (
    !subject ||
    subject.subjectId !== resourceId ||
    subject.subjectType !== expectedSubjectType ||
    !ELIGIBLE_SUBJECT_STATUSES.has(subject.status) ||
    (actorType === ActorType.HUMAN && subject.prototypeOnly !== true)
  ) {
    unavailable();
  }
  const principalState = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.PRINCIPAL,
    subject.primaryPrincipalId,
    { lock: true }
  );
  const principal = principalState?.value;
  if (
    !principal ||
    principal.principalId !== subject.primaryPrincipalId ||
    principal.status !== PrincipalStatus.ACTIVE
  ) {
    throw new DomainError("principal_not_active", "Credit Intent requires an active Principal");
  }
  const authorityType = actorType === ActorType.HUMAN
    ? CreditAuthorityType.CONSENT
    : CreditAuthorityType.MANDATE;
  const authorityProjectionType = actorType === ActorType.HUMAN
    ? CoreProjectionType.CONSENT_RECORD
    : CoreProjectionType.MANDATE;
  const authorityState = await coreRepository.getProjectionStateInTransaction(
    client,
    authorityProjectionType,
    input.authorityId,
    { lock: true }
  );
  if (!authorityState) unavailable();
  const intent = createCreditIntent({
    subjectId: subject.subjectId,
    principalId: principal.principalId,
    authorityType,
    authorityRef: input.authorityId,
    assetId: input.assetId,
    requestedPrincipalMinor: input.requestedPrincipalMinor,
    purposeCode: input.purposeCode,
    requestedTermDays: input.requestedTermDays,
    repaymentFrequency: input.repaymentFrequency,
    installmentCount: input.installmentCount,
    now
  });
  if (actorType === ActorType.HUMAN) {
    assertConsentAuthorizesCreditIntent(authorityState.value, intent, { now });
  } else {
    assertMandateAuthorizesCreditIntent(authorityState.value, intent, now);
  }
  const riskState = await coreRepository.getCreditApplicationRiskStateInTransaction(
    client,
    subject.subjectId,
    intent.assetId
  );
  if (riskState.adverseObligationCount > 0 || riskState.frozenCreditLineCount > 0) {
    throw new DomainError("credit_risk_state_rejected", "current risk state does not allow a new Credit Intent");
  }
  const liveStateVersion =
    subjectState.aggregateVersion +
    principalState.aggregateVersion +
    authorityState.aggregateVersion +
    riskState.liveStateVersion;
  if (!Number.isSafeInteger(liveStateVersion) || liveStateVersion < 1) {
    throw new DomainError("credit_live_state_unavailable", "Credit Intent live state version is invalid");
  }
  return { intent, liveStateVersion };
}

async function loadCreditIntentResourceBaselines({ client, coreRepository }) {
  return {
    [ResourceKind.CREDIT_INTENTS]: await coreRepository.countCreditIntentsForCapacityInTransaction(client)
  };
}

export function requestCreditIntentCommandHandler() {
  return Object.freeze({
    operationId: "pilotRequestCredit",
    kind: "command",
    resourceDeltas() {
      return { [ResourceKind.CREDIT_INTENTS]: 1 };
    },
    loadResourceBaselines: loadCreditIntentResourceBaselines,
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
      if (authorizationDecision.resourceType !== "subject") unavailable();
      const { intent } = await resolveCreditIntentAuthority({
        client,
        coreRepository,
        resourceId: authorizationDecision.resourceId,
        actorType: authenticationContext.actorType,
        payload,
        now
      });
      const existing = await coreRepository.findCreditIntentByHashInTransaction(
        client,
        intent.creditIntentHash
      );
      if (existing) {
        throw new DomainError("credit_intent_already_exists", "An equivalent Credit Intent already exists");
      }
      const resourceBaselines = await loadCreditIntentResourceBaselines({ client, coreRepository });
      const event = createCreditEvent({
        eventType: CreditEventType.CREDIT_INTENT_CREATED,
        subjectId: intent.subjectId,
        payload: {
          creditIntentId: intent.creditIntentId,
          creditIntentHash: intent.creditIntentHash,
          authorityType: intent.authorityType,
          authorityRef: intent.authorityRef,
          assetId: intent.assetId,
          requestedPrincipalMinor: intent.requestedPrincipalMinor,
          purposeCode: intent.purposeCode,
          status: intent.status,
          sandboxOnly: true,
          productionFundsRequested: false,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "credit_intent",
        aggregateId: intent.creditIntentId,
        events: [{
          aggregateType: "credit_intent",
          aggregateId: intent.creditIntentId,
          expectedVersion: 0,
          event
        }],
        writes: [{ type: CoreProjectionType.CREDIT_INTENT, value: intent, eventId: event.eventId }],
        response: {
          creditIntent: summarizeCreditIntent(intent),
          schemaVersion: "tenant_credit_intent_created.v1"
        },
        resourceBaselines,
        authorizationResource: {
          resourceType: "credit_intent",
          resourceId: intent.creditIntentId,
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

export function readCreditApplicationQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadCreditApplication",
    kind: "query",
    async execute({ client, coreRepository, resource, payload }) {
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.keys(payload).length !== 0 ||
        resource?.resourceType !== "credit_intent"
      ) {
        unavailable();
      }
      const intent = await coreRepository.getProjectionInTransaction(
        client,
        CoreProjectionType.CREDIT_INTENT,
        resource.resourceId,
        { lock: false }
      );
      if (
        !intent ||
        intent.creditIntentId !== resource.resourceId ||
        intent.sandboxOnly !== true ||
        intent.productionFundsRequested !== false
      ) {
        unavailable();
      }
      const decision = await coreRepository.findRiskDecisionByCreditIntentInTransaction(
        client,
        intent.creditIntentId,
        { lock: false }
      );
      const offer = await coreRepository.findCreditOfferByIntentInTransaction(
        client,
        intent.creditIntentId,
        { lock: false }
      );
      if (
        (intent.status === "submitted" && (decision || offer)) ||
        (intent.status === "decided" && !decision) ||
        (offer && offer.riskDecisionId !== decision?.riskDecisionId)
      ) {
        throw new DomainError("projection_integrity_mismatch", "Credit application projections are inconsistent");
      }
      const { summarizeCreditDecision, summarizeCreditOffer } = await import("./credit-decision-handlers.js");
      return {
        creditIntent: summarizeCreditIntent(intent),
        decision: summarizeCreditDecision(decision),
        offer: summarizeCreditOffer(offer),
        schemaVersion: "tenant_credit_application_view.v1"
      };
    }
  });
}

export function createCreditIntentHandlers() {
  return Object.freeze([
    requestCreditIntentCommandHandler(),
    readCreditApplicationQueryHandler()
  ]);
}
