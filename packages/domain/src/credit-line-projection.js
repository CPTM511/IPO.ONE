import {
  CreditLineStatus,
  CreditOfferStatus,
  CreditAuthorityType,
  MandateStatus,
  ObligationExecutionStatus,
  ObligationStatus,
  RiskDecisionStatus
} from "./enums.js";
import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import { SANDBOX_CREDIT_POLICY_HASH, SANDBOX_CREDIT_DECISION_POLICY } from "./credit-decision.js";
import { assertNoRawPiiReference, assertNonEmptyString } from "./validators.js";

export const CREDIT_FACILITY_PROJECTION_SCHEMA_VERSION = "credit_facility_projection.v1";
export const CREDIT_LINE_PROJECTION_SCHEMA_VERSION = "credit_line.v2";

const EXECUTED_OBLIGATION_STATUSES = new Set([
  ObligationStatus.ACTIVE,
  ObligationStatus.PARTIALLY_REPAID,
  ObligationStatus.FULLY_REPAID,
  ObligationStatus.OVERDUE,
  ObligationStatus.DELINQUENT,
  ObligationStatus.DEFAULTED,
  ObligationStatus.RESTRUCTURED,
  ObligationStatus.REPURCHASED,
  ObligationStatus.WRITTEN_OFF,
  ObligationStatus.CLOSED
]);

function invalid(code, message) {
  throw new DomainError(code, message);
}

function minor(name, value, { signed = false } = {}) {
  if (typeof value !== "string" || !(signed ? /^-?[0-9]+$/ : /^[0-9]+$/).test(value)) {
    invalid("credit_line_projection_invalid", `${name} must be canonical integer minor units`);
  }
  return BigInt(value);
}

function assertHash(name, value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/.test(value)) {
    invalid("credit_line_projection_invalid", `${name} must be a lowercase bytes32 value`);
  }
}

function facilityTerms({ offer, intent, decision, acceptance, obligation, authority }) {
  if (
    !intent || intent.schemaVersion !== "credit_intent.v1" ||
    !decision || decision.schemaVersion !== "risk_decision.v3" ||
    !offer || !["credit_offer.v1", "credit_offer.v2"].includes(offer.schemaVersion) ||
    !acceptance || acceptance.schemaVersion !== "credit_offer_acceptance.v1" ||
    !obligation || obligation.schemaVersion !== "obligation.v2" ||
    !authority || authority.schemaVersion !== "mandate.v3"
  ) {
    invalid("credit_facility_unavailable", "exact sandbox Facility provenance is unavailable");
  }
  if (
    decision.status !== RiskDecisionStatus.APPROVED ||
    decision.policyHash !== SANDBOX_CREDIT_POLICY_HASH ||
    decision.modelVersion !== SANDBOX_CREDIT_DECISION_POLICY.modelVersion ||
    offer.status !== CreditOfferStatus.ACCEPTED ||
    authority.status !== MandateStatus.ACTIVE ||
    obligation.authorityType !== CreditAuthorityType.MANDATE ||
    obligation.executionStatus === ObligationExecutionStatus.FAILED ||
    ![ObligationStatus.CREATED, ...EXECUTED_OBLIGATION_STATUSES].includes(obligation.status)
  ) {
    invalid("credit_facility_not_current", "Offer, Policy, Facility, Mandate, or Obligation is not current");
  }
  if (
    intent.status !== "decided" ||
    intent.subjectId !== obligation.subjectId ||
    intent.principalId !== obligation.principalId ||
    intent.authorityRef !== authority.mandateId ||
    intent.assetId !== obligation.assetId ||
    decision.creditIntentId !== intent.creditIntentId ||
    decision.subjectId !== intent.subjectId ||
    decision.principalId !== intent.principalId ||
    decision.authorityRef !== authority.mandateId ||
    decision.assetId !== intent.assetId ||
    offer.creditIntentId !== intent.creditIntentId ||
    offer.riskDecisionId !== decision.riskDecisionId ||
    offer.subjectId !== intent.subjectId ||
    offer.assetId !== intent.assetId ||
    acceptance.creditOfferId !== offer.creditOfferId ||
    acceptance.creditOfferHash !== offer.creditOfferHash ||
    acceptance.termsHash !== offer.termsHash ||
    acceptance.creditIntentId !== intent.creditIntentId ||
    acceptance.riskDecisionId !== decision.riskDecisionId ||
    acceptance.subjectId !== intent.subjectId ||
    acceptance.principalId !== intent.principalId ||
    acceptance.authorityRef !== authority.mandateId ||
    obligation.creditIntentId !== intent.creditIntentId ||
    obligation.riskDecisionId !== decision.riskDecisionId ||
    obligation.creditOfferId !== offer.creditOfferId ||
    obligation.creditOfferAcceptanceId !== acceptance.creditOfferAcceptanceId ||
    obligation.authorityRef !== authority.mandateId ||
    obligation.originalPrincipalMinor !== offer.approvedPrincipalMinor ||
    obligation.assetId !== offer.assetId ||
    authority.subjectId !== obligation.subjectId ||
    authority.principalId !== obligation.principalId ||
    !authority.assetIds.includes(obligation.assetId)
  ) {
    invalid("credit_facility_provenance_mismatch", "sandbox Facility provenance is inconsistent");
  }
  if (
    offer.schemaVersion === "credit_offer.v2" &&
    offer.permittedPurposeCode !== intent.purposeCode
  ) {
    invalid("credit_facility_scope_mismatch", "Facility purpose does not match the Credit Intent");
  }
  if (
    offer.sandboxOnly !== true || offer.productionFundsApproved !== false ||
    acceptance.sandboxOnly !== true || acceptance.productionAuthority !== false ||
    decision.sandboxOnly !== true || decision.productionAuthority !== false ||
    intent.sandboxOnly !== true || intent.productionFundsRequested !== false ||
    obligation.sandboxOnly !== true || obligation.productionFundsMoved !== false ||
    authority.sandboxOnly !== true || authority.productionAuthority !== false
  ) {
    invalid("credit_facility_production_authority_forbidden", "Facility provenance must remain no-funds sandbox only");
  }
  if (
    !Array.isArray(authority.allowedProviderIds) ||
    authority.allowedProviderIds.length < 1 || authority.allowedProviderIds.length > 32 ||
    new Set(authority.allowedProviderIds).size !== authority.allowedProviderIds.length ||
    authority.allowedProviderIds.some((providerId) => (
      typeof providerId !== "string" || providerId.length < 1
    ))
  ) {
    invalid("credit_facility_scope_mismatch", "Facility requires an explicit allowlisted Provider scope");
  }
  for (const [name, value] of Object.entries({
    creditIntentHash: intent.creditIntentHash,
    decisionHash: decision.decisionHash,
    creditOfferHash: offer.creditOfferHash,
    termsHash: offer.termsHash,
    acceptanceHash: acceptance.acceptanceHash,
    authorityTermsHash: authority.termsHash
  })) assertHash(name, value);

  const offerLimit = offer.schemaVersion === "credit_offer.v2"
    ? minor("facilityLimitMinor", offer.facilityLimitMinor)
    : minor("approvedPrincipalMinor", offer.approvedPrincipalMinor);
  const perDrawCap = offer.schemaVersion === "credit_offer.v2"
    ? minor("perDrawCapMinor", offer.perDrawCapMinor)
    : minor("approvedPrincipalMinor", offer.approvedPrincipalMinor);
  const policyLimit = minor("policyMaximumPrincipalMinor", SANDBOX_CREDIT_DECISION_POLICY.maximumPrincipalMinor);
  const decisionLimit = minor("decisionLimitMinor", decision.limitMinor);
  const mandateLimit = minor("mandateAggregateLimitMinor", authority.aggregateLimitMinor);
  const limitMinor = [offerLimit, decisionLimit, mandateLimit, policyLimit]
    .reduce((lowest, value) => value < lowest ? value : lowest);
  if (
    limitMinor <= 0n || perDrawCap <= 0n ||
    minor("approvedPrincipalMinor", offer.approvedPrincipalMinor) > perDrawCap ||
    perDrawCap > offerLimit
  ) {
    invalid("credit_facility_limit_invalid", "Facility limits are inconsistent");
  }
  const facilityCore = {
    subjectId: obligation.subjectId,
    principalId: obligation.principalId,
    mandateId: authority.mandateId,
    authorityTermsHash: authority.termsHash,
    creditIntentId: intent.creditIntentId,
    creditIntentHash: intent.creditIntentHash,
    riskDecisionId: decision.riskDecisionId,
    decisionHash: decision.decisionHash,
    policyHash: decision.policyHash,
    creditOfferId: offer.creditOfferId,
    creditOfferHash: offer.creditOfferHash,
    termsHash: offer.termsHash,
    acceptanceId: acceptance.creditOfferAcceptanceId,
    acceptanceHash: acceptance.acceptanceHash,
    obligationId: obligation.obligationId,
    assetId: obligation.assetId,
    purposeCode: intent.purposeCode,
    allowedProviderIds: [...authority.allowedProviderIds],
    facilityLimitMinor: limitMinor.toString(),
    perDrawCapMinor: perDrawCap.toString(),
    sandboxOnly: true,
    productionAuthority: false
  };
  assertNoRawPiiReference(facilityCore, "creditFacilityProjection");
  const facilityHash = hashId("credit_facility_projection", facilityCore);
  return Object.freeze({
    facilityId: `credit_facility_${facilityHash.slice(2)}`,
    facilityHash,
    ...facilityCore,
    schemaVersion: CREDIT_FACILITY_PROJECTION_SCHEMA_VERSION
  });
}

function projectionCore(value) {
  const { projectionHash: _projectionHash, ...core } = value;
  return core;
}

export function createAgentCreditExposureHash({ subjectId, assetId, obligations }) {
  assertNonEmptyString("subjectId", subjectId);
  assertNonEmptyString("assetId", assetId);
  if (!Array.isArray(obligations)) {
    invalid("credit_line_projection_invalid", "Agent exposure obligations must be an array");
  }
  const normalized = obligations.map((item) => {
    assertNonEmptyString("obligationId", item?.obligationId);
    return {
      obligationId: item.obligationId,
      outstandingPrincipalMinor: minor(
        "outstandingPrincipalMinor",
        item.outstandingPrincipalMinor
      ).toString()
    };
  }).sort((left, right) => left.obligationId.localeCompare(right.obligationId));
  if (new Set(normalized.map(({ obligationId }) => obligationId)).size !== normalized.length) {
    invalid("credit_line_projection_invalid", "Agent exposure contains duplicate Obligations");
  }
  return hashId("agent_credit_exposure", { subjectId, assetId, obligations: normalized });
}

export function verifyCreditLineProjection(value) {
  if (!value || value.schemaVersion !== CREDIT_LINE_PROJECTION_SCHEMA_VERSION) {
    invalid("credit_line_projection_stale", "canonical CreditLine projection v2 is unavailable");
  }
  assertHash("projectionHash", value.projectionHash);
  if (hashId("credit_line_projection", projectionCore(value)) !== value.projectionHash) {
    invalid("credit_line_projection_stale", "CreditLine projection hash is inconsistent");
  }
  if (
    value.sandboxOnly !== true || value.productionAuthority !== false ||
    !Object.values(CreditLineStatus).includes(value.status) ||
    minor("utilizedMinor", value.utilizedMinor) > minor("limitMinor", value.limitMinor)
  ) {
    invalid("credit_line_projection_stale", "CreditLine projection invariants are inconsistent");
  }
  return true;
}

export function deriveAgentCreditLineProjection({
  intent,
  decision,
  offer,
  acceptance,
  obligation,
  authority,
  currentProjection,
  exposure,
  principalDeltaMinor,
  now = new Date()
}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    invalid("credit_line_projection_invalid", "trusted projection time is invalid");
  }
  assertNonEmptyString("principalDeltaMinor", principalDeltaMinor);
  const facility = facilityTerms({ offer, intent, decision, acceptance, obligation, authority });
  if (
    !exposure || exposure.schemaVersion !== "agent_credit_exposure.v1" ||
    exposure.subjectId !== obligation.subjectId || exposure.assetId !== obligation.assetId ||
    !Array.isArray(exposure.obligations)
  ) {
    invalid("credit_line_projection_stale", "canonical Agent Obligation exposure is unavailable");
  }
  const expectedExposureHash = createAgentCreditExposureHash(exposure);
  if (exposure.exposureHash !== expectedExposureHash) {
    invalid("credit_line_projection_stale", "Agent Obligation exposure hash is inconsistent");
  }
  const existingExposure = minor("outstandingPrincipalMinor", exposure.outstandingPrincipalMinor);
  const committedLimit = minor("committedLimitMinor", exposure.committedLimitMinor);
  if (
    exposure.obligations.reduce(
      (total, item) => total + minor("outstandingPrincipalMinor", item.outstandingPrincipalMinor),
      0n
    ) !== existingExposure
  ) {
    invalid("credit_line_projection_stale", "Agent Obligation exposure total is inconsistent");
  }
  const delta = minor("principalDeltaMinor", principalDeltaMinor, { signed: true });
  const nextExposure = existingExposure + delta;
  const facilityLimit = minor("facilityLimitMinor", facility.facilityLimitMinor);
  const perDrawCap = minor("perDrawCapMinor", facility.perDrawCapMinor);
  const existingObligation = exposure.obligations.find(
    (item) => item.obligationId === obligation.obligationId
  );
  if (
    delta > perDrawCap || delta > facilityLimit || nextExposure < 0n ||
    (delta > 0n && existingObligation) || (delta < 0n && !existingObligation)
  ) {
    invalid("sandbox_capacity_exhausted", "derived Agent CreditLine capacity is unavailable");
  }

  const nextObligations = exposure.obligations
    .filter((item) => item.obligationId !== obligation.obligationId)
    .map((item) => ({
      obligationId: item.obligationId,
      outstandingPrincipalMinor: item.outstandingPrincipalMinor
    }));
  const nextObligationOutstanding = minor(
    "obligationOutstandingPrincipalMinor",
    existingObligation?.outstandingPrincipalMinor ?? "0"
  ) + delta;
  if (nextObligationOutstanding < 0n) {
    invalid("sandbox_capacity_exhausted", "repayment exceeds the canonical Obligation exposure");
  }
  nextObligations.push({
    obligationId: obligation.obligationId,
    outstandingPrincipalMinor: nextObligationOutstanding.toString()
  });
  const nextCommittedLimit = committedLimit + (delta > 0n ? facilityLimit : 0n);
  if (nextExposure > nextCommittedLimit) {
    invalid("credit_line_projection_stale", "derived utilization exceeds committed Facility capacity");
  }
  const nextExposureHash = createAgentCreditExposureHash({
    subjectId: obligation.subjectId,
    assetId: obligation.assetId,
    obligations: nextObligations
  });

  if (currentProjection) {
    verifyCreditLineProjection(currentProjection);
    if (
      currentProjection.subjectId !== facility.subjectId ||
      currentProjection.principalId !== facility.principalId ||
      currentProjection.assetId !== facility.assetId ||
      currentProjection.exposureHash !== exposure.exposureHash ||
      currentProjection.limitMinor !== committedLimit.toString() ||
      currentProjection.utilizedMinor !== existingExposure.toString() ||
      currentProjection.status !== CreditLineStatus.APPROVED
    ) {
      invalid("credit_line_projection_stale", "CreditLine projection disagrees with current authority or Obligation exposure");
    }
  } else if (existingExposure !== 0n || committedLimit !== 0n || exposure.obligations.length !== 0) {
    invalid("credit_line_projection_stale", "Obligation exposure exists without a canonical CreditLine projection");
  }

  const createdAt = currentProjection?.createdAt ?? now.toISOString();
  const valueWithoutHash = {
    creditLineId: currentProjection?.creditLineId ?? `credit_line_${hashId("shared_sandbox_credit_line", {
      subjectId: facility.subjectId,
      assetId: facility.assetId
    }).slice(2)}`,
    subjectId: facility.subjectId,
    principalId: facility.principalId,
    assetId: facility.assetId,
    exposureHash: nextExposureHash,
    validatedMandateId: facility.mandateId,
    validatedAuthorityTermsHash: facility.authorityTermsHash,
    validatedFacilityId: facility.facilityId,
    validatedFacilityHash: facility.facilityHash,
    creditIntentId: facility.creditIntentId,
    creditIntentHash: facility.creditIntentHash,
    riskDecisionId: facility.riskDecisionId,
    decisionHash: facility.decisionHash,
    policyHash: facility.policyHash,
    creditOfferId: facility.creditOfferId,
    creditOfferHash: facility.creditOfferHash,
    termsHash: facility.termsHash,
    acceptanceId: facility.acceptanceId,
    acceptanceHash: facility.acceptanceHash,
    obligationId: facility.obligationId,
    purposeCode: facility.purposeCode,
    allowedProviderIds: [...facility.allowedProviderIds],
    limitMinor: nextCommittedLimit.toString(),
    utilizedMinor: nextExposure.toString(),
    status: CreditLineStatus.APPROVED,
    riskSnapshotId: facility.riskDecisionId,
    sandboxOnly: true,
    productionAuthority: false,
    createdAt,
    updatedAt: now.toISOString(),
    schemaVersion: CREDIT_LINE_PROJECTION_SCHEMA_VERSION
  };
  const value = Object.freeze({
    ...valueWithoutHash,
    projectionHash: hashId("credit_line_projection", valueWithoutHash)
  });
  return Object.freeze({
    value,
    facility,
    previousUtilizedMinor: existingExposure.toString(),
    utilizedMinor: nextExposure.toString()
  });
}

export function replayAgentCreditLineProjection(events) {
  if (!Array.isArray(events)) {
    invalid("credit_line_replay_invalid", "CreditLine replay requires an ordered event array");
  }
  let current;
  for (const event of events) {
    if (!event || !["credit_line_utilized", "credit_line_released"].includes(event.eventType)) continue;
    const next = event.payload?.creditLineProjection;
    verifyCreditLineProjection(next);
    if (
      event.payload.previousUtilizedMinor !== (current?.utilizedMinor ?? "0") ||
      event.payload.utilizedMinor !== next.utilizedMinor ||
      (current && current.creditLineId !== next.creditLineId)
    ) {
      invalid("credit_line_replay_invalid", "CreditLine event sequence does not reconcile");
    }
    current = Object.freeze(structuredClone(next));
  }
  if (!current) invalid("credit_line_replay_invalid", "CreditLine replay contains no projection event");
  return current;
}
