import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import {
  ObligationExecutionStatus,
  ObligationStatus
} from "./enums.js";
import { assertNoRawPiiReference } from "./validators.js";
import {
  TRADING_MATCH_PROPOSAL_SCHEMA_VERSION,
  TradingMatchProposalStatus
} from "./trading-capital-matching.js";

export const TRADING_FACILITY_SCHEMA_VERSION = "trading_facility.v1";
export const TRADING_ORDER_INTENT_SCHEMA_VERSION = "trading_order_intent.v1";
export const TRADING_FACILITY_RISK_EVALUATION_SCHEMA_VERSION =
  "trading_facility_risk_evaluation.v1";
export const TRADING_FACILITY_POLICY_VERSION =
  "trading_no_funds_facility_policy.v1";
export const TRADING_SHADOW_RISK_POLICY_VERSION =
  "trading_shadow_risk_policy.v1";
export const TRADING_FACILITY_SYNTHETIC_ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";

export const TradingFacilityLifecycleStatus = Object.freeze({
  AWAITING_CONTRIBUTIONS: "awaiting_contributions",
  AWAITING_SUBJECT_COLLATERAL: "awaiting_subject_collateral",
  AWAITING_PROVIDER_FUNDING: "awaiting_provider_funding",
  READY_FOR_ACTIVATION: "ready_for_activation",
  ACTIVE: "active",
  FLATTENED: "flattened"
});

export const TradingFacilityRiskState = Object.freeze({
  NORMAL: "NORMAL",
  WARNING: "WARNING",
  REDUCE_ONLY: "REDUCE_ONLY",
  FLATTEN: "FLATTEN",
  SETTLEMENT: "SETTLEMENT"
});

export const TradingOrderIntentStatus = Object.freeze({
  OPEN: "open",
  CANCELED: "canceled",
  FLATTENED: "flattened"
});

export const TradingOrderDirection = Object.freeze({
  LONG: "long",
  SHORT: "short"
});

const FACILITY_LIFECYCLE_STATUSES = new Set(
  Object.values(TradingFacilityLifecycleStatus)
);
const FACILITY_RISK_STATES = new Set(Object.values(TradingFacilityRiskState));
const ORDER_STATUSES = new Set(Object.values(TradingOrderIntentStatus));
const ORDER_DIRECTIONS = new Set(Object.values(TradingOrderDirection));
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const POSITIVE_MINOR_PATTERN = /^[1-9][0-9]{0,77}$/;
const RISK_STATE_ORDER = Object.freeze([
  TradingFacilityRiskState.NORMAL,
  TradingFacilityRiskState.WARNING,
  TradingFacilityRiskState.REDUCE_ONLY,
  TradingFacilityRiskState.FLATTEN,
  TradingFacilityRiskState.SETTLEMENT
]);
const LOCAL_OBSERVATION_MAX_AGE_MS = 5 * 60 * 1000;
const SUBJECT_COLLATERAL_BPS = 1_000n;
const BPS_DENOMINATOR = 10_000n;
const MAX_OPEN_ORDERS = 20;

function invalid(message) {
  throw new DomainError("invalid_trading_facility", message);
}

function unavailable(message = "Trading Facility is unavailable") {
  throw new DomainError("trading_facility_unavailable", message);
}

function clone(value) {
  return structuredClone(value);
}

function plainObject(name, value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid(`${name} must be a plain object`);
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function positiveMinor(name, value) {
  if (typeof value !== "string" || !POSITIVE_MINOR_PATTERN.test(value)) {
    invalid(`${name} must be a positive decimal minor-unit string`);
  }
  return value;
}

function nonNegativeMinor(name, value) {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9][0-9]{0,77})$/.test(value)
  ) {
    invalid(`${name} must be a non-negative decimal minor-unit string`);
  }
  return value;
}

function date(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function exactVersion(name, actual, expected) {
  if (!Number.isSafeInteger(expected) || expected < 1 || actual !== expected) {
    unavailable(`${name} version changed`);
  }
}

function commonSafety() {
  return {
    sandboxOnly: true,
    syntheticOnly: true,
    nonRedeemable: true,
    withdrawable: false,
    transferable: false,
    externalSystemQueried: false,
    externalOrderSubmitted: false,
    productionAuthority: false,
    fundsAuthority: false,
    realCollateral: false,
    realFunding: false,
    realEquity: false,
    realPricing: false,
    productionFundsMoved: false,
    piiIncluded: false,
    secretsIncluded: false
  };
}

function assertCommonSafety(value) {
  if (
    value.sandboxOnly !== true ||
    value.syntheticOnly !== true ||
    value.nonRedeemable !== true ||
    value.withdrawable !== false ||
    value.transferable !== false ||
    value.externalSystemQueried !== false ||
    value.externalOrderSubmitted !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    value.realCollateral !== false ||
    value.realFunding !== false ||
    value.realEquity !== false ||
    value.realPricing !== false ||
    value.productionFundsMoved !== false ||
    value.piiIncluded !== false ||
    value.secretsIncluded !== false
  ) {
    invalid("Trading Facility safety boundary is invalid");
  }
}

function riskStateRank(value) {
  const rank = RISK_STATE_ORDER.indexOf(value);
  if (rank < 0) invalid("riskState is unsupported");
  return rank;
}

function mostRestrictiveRiskState(left, right) {
  return riskStateRank(left) >= riskStateRank(right) ? left : right;
}

function facilityLifecycle({
  subjectCollateralRecorded,
  providerFundingRecorded
}) {
  if (subjectCollateralRecorded && providerFundingRecorded) {
    return TradingFacilityLifecycleStatus.READY_FOR_ACTIVATION;
  }
  if (subjectCollateralRecorded) {
    return TradingFacilityLifecycleStatus.AWAITING_PROVIDER_FUNDING;
  }
  if (providerFundingRecorded) {
    return TradingFacilityLifecycleStatus.AWAITING_SUBJECT_COLLATERAL;
  }
  return TradingFacilityLifecycleStatus.AWAITING_CONTRIBUTIONS;
}

function facilityCore(facility) {
  return {
    matchProposalId: facility.matchProposalId,
    proposalHash: facility.proposalHash,
    obligationId: facility.obligationId,
    obligationHash: facility.obligationHash,
    subjectId: facility.subjectId,
    principalId: facility.principalId,
    providerId: facility.providerId,
    subjectActorHash: facility.subjectActorHash,
    providerActorHash: facility.providerActorHash,
    templateType: facility.templateType,
    termsHash: facility.termsHash,
    assetId: facility.assetId,
    syntheticPrincipalMinor: facility.syntheticPrincipalMinor,
    requiredSubjectCollateralMinor:
      facility.requiredSubjectCollateralMinor,
    requiredProviderFundingMinor: facility.requiredProviderFundingMinor,
    activationDeadlineAt: facility.activationDeadlineAt,
    maturityAt: facility.maturityAt,
    facilityPolicyVersion: facility.facilityPolicyVersion
  };
}

function facilityStateCore(facility) {
  return {
    tradingFacilityId: facility.tradingFacilityId,
    facilityHash: facility.facilityHash,
    lifecycleStatus: facility.lifecycleStatus,
    riskState: facility.riskState,
    riskReasonCodes: facility.riskReasonCodes,
    subjectCollateralMinor: facility.subjectCollateralMinor,
    providerFundingMinor: facility.providerFundingMinor,
    syntheticCapitalMinor: facility.syntheticCapitalMinor,
    syntheticExposureMinor: facility.syntheticExposureMinor,
    syntheticEquityMinor: facility.syntheticEquityMinor,
    openOrderCount: facility.openOrderCount,
    subjectCollateralRecorded: facility.subjectCollateralRecorded,
    providerFundingRecorded: facility.providerFundingRecorded,
    latestRiskEvaluationId: facility.latestRiskEvaluationId,
    latestRiskEvaluationHash: facility.latestRiskEvaluationHash,
    riskObservationHash: facility.riskObservation?.observationHash,
    version: facility.version,
    activatedAt: facility.activatedAt,
    flattenedAt: facility.flattenedAt,
    updatedAt: facility.updatedAt
  };
}

function withFacilityStateHash(facility) {
  const next = clone(facility);
  next.stateHash = hashId("trading_facility_state", facilityStateCore(next));
  return next;
}

function riskObservation({
  facilityId,
  facilityVersion,
  syntheticCapitalMinor,
  syntheticExposureMinor,
  syntheticEquityMinor,
  openOrderCount,
  observedAt
}) {
  const core = {
    facilityId,
    facilityVersion,
    syntheticCapitalMinor,
    syntheticExposureMinor,
    syntheticEquityMinor,
    openOrderCount,
    observedAt,
    source: "local_synthetic_facility",
    complete: true,
    reconciled: true,
    callerEquityAccepted: false
  };
  return {
    observationHash: hashId("trading_facility_risk_observation", core),
    ...core,
    schemaVersion: "trading_facility_risk_observation.v1"
  };
}

function refreshRiskObservation(facility, now) {
  return {
    ...facility,
    riskObservation: riskObservation({
      facilityId: facility.tradingFacilityId,
      facilityVersion: facility.version,
      syntheticCapitalMinor: facility.syntheticCapitalMinor,
      syntheticExposureMinor: facility.syntheticExposureMinor,
      syntheticEquityMinor: facility.syntheticEquityMinor,
      openOrderCount: facility.openOrderCount,
      observedAt: now.toISOString()
    })
  };
}

function assertBilateralProposal(proposal, now, { enforceDeadline = true } = {}) {
  plainObject("matchProposal", proposal);
  if (
    proposal.schemaVersion !== TRADING_MATCH_PROPOSAL_SCHEMA_VERSION ||
    proposal.status !== TradingMatchProposalStatus.BILATERALLY_ACCEPTED ||
    proposal.version !== 3 ||
    proposal.providerAcceptance === null ||
    proposal.subjectAcceptance === null ||
    proposal.immutableTerms !== true ||
    proposal.bilateralAcceptanceRequired !== true ||
    proposal.sandboxOnly !== true ||
    proposal.syntheticOnly !== true ||
    proposal.productionAuthority !== false ||
    proposal.fundsAuthority !== false ||
    proposal.realFunding !== false ||
    proposal.realPricing !== false
  ) {
    unavailable("A bilaterally accepted no-funds Match Proposal is required");
  }
  hash("proposalHash", proposal.proposalHash);
  hash("termsHash", proposal.terms?.termsHash);
  if (
    enforceDeadline &&
    new Date(date("expiresAt", proposal.expiresAt)) <= now
  ) {
    unavailable("Match Proposal activation window expired");
  }
  return proposal;
}

function assertCanonicalObligation(
  obligation,
  proposal,
  { requireExecuted = false } = {}
) {
  plainObject("obligation", obligation);
  if (
    obligation.schemaVersion !== "obligation.v2" ||
    obligation.subjectId !== proposal.subjectId ||
    obligation.principalId !== proposal.principalId ||
    obligation.assetId !== proposal.terms.assetId ||
    obligation.originalPrincipalMinor !==
      proposal.terms.syntheticPrincipalMinor ||
    obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false
  ) {
    unavailable("Canonical Obligation does not match the accepted proposal");
  }
  identifier("obligationId", obligation.obligationId);
  hash("obligationHash", obligation.obligationHash);
  date("maturityAt", obligation.maturityAt);
  if (requireExecuted) {
    if (
      obligation.executionStatus !== ObligationExecutionStatus.EXECUTED ||
      obligation.status !== ObligationStatus.ACTIVE ||
      obligation.withdrawable !== false ||
      obligation.totalRepaidMinor !== "0" ||
      obligation.outstandingPrincipalMinor !==
        obligation.originalPrincipalMinor
    ) {
      unavailable(
        "Canonical Obligation must be active, unrepaid, and non-withdrawable"
      );
    }
  }
  return obligation;
}

function assertFacility(facility) {
  plainObject("facility", facility);
  if (
    facility.schemaVersion !== TRADING_FACILITY_SCHEMA_VERSION ||
    !FACILITY_LIFECYCLE_STATUSES.has(facility.lifecycleStatus) ||
    !FACILITY_RISK_STATES.has(facility.riskState) ||
    !Number.isSafeInteger(facility.version) ||
    facility.version < 1 ||
    !Number.isSafeInteger(facility.openOrderCount) ||
    facility.openOrderCount < 0 ||
    facility.openOrderCount > MAX_OPEN_ORDERS ||
    facility.linkedCanonicalObligation !== true ||
    facility.secondLedgerCreated !== false ||
    facility.callerEquityAccepted !== false
  ) {
    unavailable();
  }
  identifier("tradingFacilityId", facility.tradingFacilityId);
  hash("facilityHash", facility.facilityHash);
  hash("stateHash", facility.stateHash);
  nonNegativeMinor(
    "subjectCollateralMinor",
    facility.subjectCollateralMinor
  );
  nonNegativeMinor("providerFundingMinor", facility.providerFundingMinor);
  nonNegativeMinor("syntheticCapitalMinor", facility.syntheticCapitalMinor);
  nonNegativeMinor("syntheticExposureMinor", facility.syntheticExposureMinor);
  nonNegativeMinor("syntheticEquityMinor", facility.syntheticEquityMinor);
  assertCommonSafety(facility);
  if (hashId("trading_facility", facilityCore(facility)) !== facility.facilityHash) {
    unavailable("Facility immutable binding changed");
  }
  if (
    hashId("trading_facility_state", facilityStateCore(facility)) !==
    facility.stateHash
  ) {
    unavailable("Facility state hash changed");
  }
  const observation = facility.riskObservation;
  plainObject("riskObservation", observation);
  const observationCore = {
    facilityId: observation.facilityId,
    facilityVersion: observation.facilityVersion,
    syntheticCapitalMinor: observation.syntheticCapitalMinor,
    syntheticExposureMinor: observation.syntheticExposureMinor,
    syntheticEquityMinor: observation.syntheticEquityMinor,
    openOrderCount: observation.openOrderCount,
    observedAt: observation.observedAt,
    source: observation.source,
    complete: observation.complete,
    reconciled: observation.reconciled,
    callerEquityAccepted: observation.callerEquityAccepted
  };
  if (
    observation.schemaVersion !== "trading_facility_risk_observation.v1" ||
    observation.facilityId !== facility.tradingFacilityId ||
    observation.facilityVersion !== facility.version ||
    observation.syntheticCapitalMinor !== facility.syntheticCapitalMinor ||
    observation.syntheticExposureMinor !== facility.syntheticExposureMinor ||
    observation.syntheticEquityMinor !== facility.syntheticEquityMinor ||
    observation.openOrderCount !== facility.openOrderCount ||
    observation.source !== "local_synthetic_facility" ||
    observation.complete !== true ||
    observation.reconciled !== true ||
    observation.callerEquityAccepted !== false ||
    hashId("trading_facility_risk_observation", observationCore) !==
      observation.observationHash
  ) {
    unavailable("Facility risk observation is incomplete");
  }
  return facility;
}

function assertExpectedFacility(facility, expectedStateHash, expectedVersion) {
  const current = assertFacility(facility);
  hash("expectedStateHash", expectedStateHash);
  exactVersion("Facility", current.version, expectedVersion);
  if (current.stateHash !== expectedStateHash) {
    unavailable("Facility state changed");
  }
  return current;
}

function assertFacilityDeadline(facility, now, { activation = false } = {}) {
  const deadline = activation
    ? facility.activationDeadlineAt
    : facility.maturityAt;
  if (new Date(date("facilityDeadline", deadline)) <= now) {
    unavailable("Facility deadline elapsed");
  }
}

function updateFacilityState(facility, changes, now, { refresh = true } = {}) {
  let next = {
    ...clone(facility),
    ...changes,
    version: facility.version + 1,
    updatedAt: now.toISOString()
  };
  if (refresh) next = refreshRiskObservation(next, now);
  next = withFacilityStateHash(next);
  assertNoRawPiiReference(next, "tradingFacility");
  assertFacility(next);
  return next;
}

function assertOrderIntent(orderIntent) {
  plainObject("orderIntent", orderIntent);
  if (
    orderIntent.schemaVersion !== TRADING_ORDER_INTENT_SCHEMA_VERSION ||
    !ORDER_STATUSES.has(orderIntent.status) ||
    !ORDER_DIRECTIONS.has(orderIntent.direction) ||
    !Number.isSafeInteger(orderIntent.version) ||
    orderIntent.version < 1 ||
    orderIntent.serverRiskEvaluated !== true ||
    orderIntent.rawVenueActionAccepted !== false
  ) {
    unavailable("Order Intent is unavailable");
  }
  identifier("tradingOrderIntentId", orderIntent.tradingOrderIntentId);
  hash("orderIntentHash", orderIntent.orderIntentHash);
  hash("orderStateHash", orderIntent.orderStateHash);
  positiveMinor(
    "syntheticNotionalMinor",
    orderIntent.syntheticNotionalMinor
  );
  assertCommonSafety(orderIntent);
  const immutableCore = {
    facilityId: orderIntent.facilityId,
    facilityHash: orderIntent.facilityHash,
    subjectId: orderIntent.subjectId,
    principalId: orderIntent.principalId,
    submittedByActorHash: orderIntent.submittedByActorHash,
    direction: orderIntent.direction,
    syntheticNotionalMinor: orderIntent.syntheticNotionalMinor,
    createdAt: orderIntent.createdAt,
    orderPolicyVersion: orderIntent.orderPolicyVersion
  };
  const stateCore = {
    tradingOrderIntentId: orderIntent.tradingOrderIntentId,
    orderIntentHash: orderIntent.orderIntentHash,
    status: orderIntent.status,
    version: orderIntent.version,
    cancelReasonCode: orderIntent.cancelReasonCode,
    canceledAt: orderIntent.canceledAt,
    flattenedAt: orderIntent.flattenedAt,
    updatedAt: orderIntent.updatedAt
  };
  if (
    hashId("trading_order_intent", immutableCore) !==
      orderIntent.orderIntentHash ||
    hashId("trading_order_intent_state", stateCore) !==
      orderIntent.orderStateHash
  ) {
    unavailable("Order Intent binding changed");
  }
  return orderIntent;
}

function updateOrderState(orderIntent, changes, now) {
  const next = {
    ...clone(orderIntent),
    ...changes,
    version: orderIntent.version + 1,
    updatedAt: now.toISOString()
  };
  next.orderStateHash = hashId("trading_order_intent_state", {
    tradingOrderIntentId: next.tradingOrderIntentId,
    orderIntentHash: next.orderIntentHash,
    status: next.status,
    version: next.version,
    cancelReasonCode: next.cancelReasonCode,
    canceledAt: next.canceledAt,
    flattenedAt: next.flattenedAt,
    updatedAt: next.updatedAt
  });
  assertNoRawPiiReference(next, "tradingOrderIntent");
  assertOrderIntent(next);
  return next;
}

function actorHash(actorId) {
  identifier("actorId", actorId);
  return hashId("actor", actorId);
}

export function createTradingFacility({
  matchProposal,
  obligation,
  createdByActorId,
  now = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Facility creation input has an open shape");
  }
  const proposal = assertBilateralProposal(matchProposal, now);
  const canonicalObligation = assertCanonicalObligation(obligation, proposal);
  const creatorHash = actorHash(createdByActorId);
  if (creatorHash !== proposal.subjectActorHash) unavailable();
  const principal = BigInt(
    positiveMinor(
      "syntheticPrincipalMinor",
      proposal.terms.syntheticPrincipalMinor
    )
  );
  const requiredSubjectCollateral =
    (principal * SUBJECT_COLLATERAL_BPS) / BPS_DENOMINATOR;
  const requiredSubjectCollateralMinor =
    (requiredSubjectCollateral > 0n ? requiredSubjectCollateral : 1n).toString();
  const createdAt = now.toISOString();
  const facility = {
    tradingFacilityId: createOperationalId("trading_facility"),
    matchProposalId: proposal.tradingMatchProposalId,
    proposalHash: proposal.proposalHash,
    proposalVersion: proposal.version,
    obligationId: canonicalObligation.obligationId,
    obligationHash: canonicalObligation.obligationHash,
    subjectId: proposal.subjectId,
    principalId: proposal.principalId,
    providerId: proposal.providerId,
    subjectActorHash: proposal.subjectActorHash,
    providerActorHash: proposal.providerActorHash,
    templateType: proposal.terms.templateType,
    termsHash: proposal.terms.termsHash,
    assetId: proposal.terms.assetId,
    syntheticPrincipalMinor: proposal.terms.syntheticPrincipalMinor,
    requiredSubjectCollateralMinor,
    requiredProviderFundingMinor: proposal.terms.syntheticPrincipalMinor,
    subjectCollateralMinor: "0",
    providerFundingMinor: "0",
    syntheticCapitalMinor: "0",
    syntheticExposureMinor: "0",
    syntheticEquityMinor: "0",
    openOrderCount: 0,
    subjectCollateralRecorded: false,
    providerFundingRecorded: false,
    lifecycleStatus:
      TradingFacilityLifecycleStatus.AWAITING_CONTRIBUTIONS,
    riskState: TradingFacilityRiskState.NORMAL,
    riskReasonCodes: ["synthetic_facility_created"],
    latestRiskEvaluationId: null,
    latestRiskEvaluationHash: null,
    activationDeadlineAt: proposal.expiresAt,
    maturityAt: canonicalObligation.maturityAt,
    activatedAt: null,
    flattenedAt: null,
    linkedCanonicalObligation: true,
    secondLedgerCreated: false,
    callerEquityAccepted: false,
    createdByActorHash: creatorHash,
    createdAt,
    updatedAt: createdAt,
    version: 1,
    facilityPolicyVersion: TRADING_FACILITY_POLICY_VERSION,
    riskPolicyVersion: TRADING_SHADOW_RISK_POLICY_VERSION,
    ...commonSafety(),
    schemaVersion: TRADING_FACILITY_SCHEMA_VERSION
  };
  facility.facilityHash = hashId("trading_facility", facilityCore(facility));
  let completed = refreshRiskObservation(facility, now);
  completed = withFacilityStateHash(completed);
  assertNoRawPiiReference(completed, "tradingFacility");
  assertFacility(completed);
  return completed;
}

export function contributeTradingSubjectCollateral(
  facility,
  {
    contributedByActorId,
    amountMinor,
    expectedStateHash,
    expectedVersion,
    now = new Date(),
    ...unknown
  }
) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Subject collateral input has an open shape");
  }
  const current = assertExpectedFacility(
    facility,
    expectedStateHash,
    expectedVersion
  );
  assertFacilityDeadline(current, now, { activation: true });
  if (
    actorHash(contributedByActorId) !== current.subjectActorHash ||
    current.subjectCollateralRecorded ||
    current.lifecycleStatus === TradingFacilityLifecycleStatus.ACTIVE ||
    current.lifecycleStatus === TradingFacilityLifecycleStatus.FLATTENED
  ) {
    unavailable();
  }
  if (
    positiveMinor("amountMinor", amountMinor) !==
    current.requiredSubjectCollateralMinor
  ) {
    unavailable("Subject collateral must match the exact synthetic requirement");
  }
  const providerFundingRecorded = current.providerFundingRecorded;
  const syntheticCapitalMinor = (
    BigInt(amountMinor) + BigInt(current.providerFundingMinor)
  ).toString();
  return updateFacilityState(
    current,
    {
      subjectCollateralMinor: amountMinor,
      subjectCollateralRecorded: true,
      syntheticCapitalMinor,
      syntheticEquityMinor: syntheticCapitalMinor,
      lifecycleStatus: facilityLifecycle({
        subjectCollateralRecorded: true,
        providerFundingRecorded
      }),
      riskReasonCodes: ["synthetic_subject_collateral_recorded"]
    },
    now
  );
}

export function recordTradingProviderFunding(
  facility,
  {
    fundedByActorId,
    amountMinor,
    expectedStateHash,
    expectedVersion,
    now = new Date(),
    ...unknown
  }
) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Provider funding input has an open shape");
  }
  const current = assertExpectedFacility(
    facility,
    expectedStateHash,
    expectedVersion
  );
  assertFacilityDeadline(current, now, { activation: true });
  if (
    actorHash(fundedByActorId) !== current.providerActorHash ||
    current.providerFundingRecorded ||
    current.lifecycleStatus === TradingFacilityLifecycleStatus.ACTIVE ||
    current.lifecycleStatus === TradingFacilityLifecycleStatus.FLATTENED
  ) {
    unavailable();
  }
  if (
    positiveMinor("amountMinor", amountMinor) !==
    current.requiredProviderFundingMinor
  ) {
    unavailable("Provider funding must match the exact synthetic requirement");
  }
  const subjectCollateralRecorded = current.subjectCollateralRecorded;
  const syntheticCapitalMinor = (
    BigInt(amountMinor) + BigInt(current.subjectCollateralMinor)
  ).toString();
  return updateFacilityState(
    current,
    {
      providerFundingMinor: amountMinor,
      providerFundingRecorded: true,
      syntheticCapitalMinor,
      syntheticEquityMinor: syntheticCapitalMinor,
      lifecycleStatus: facilityLifecycle({
        subjectCollateralRecorded,
        providerFundingRecorded: true
      }),
      riskReasonCodes: ["synthetic_provider_funding_recorded"]
    },
    now
  );
}

export function activateTradingFacility(
  facility,
  {
    matchProposal,
    obligation,
    activatedByActorId,
    expectedStateHash,
    expectedVersion,
    now = new Date(),
    ...unknown
  }
) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Facility activation input has an open shape");
  }
  const current = assertExpectedFacility(
    facility,
    expectedStateHash,
    expectedVersion
  );
  assertFacilityDeadline(current, now, { activation: true });
  const proposal = assertBilateralProposal(matchProposal, now, {
    enforceDeadline: false
  });
  const canonicalObligation = assertCanonicalObligation(obligation, proposal, {
    requireExecuted: true
  });
  if (
    current.lifecycleStatus !==
      TradingFacilityLifecycleStatus.READY_FOR_ACTIVATION ||
    current.subjectCollateralMinor !==
      current.requiredSubjectCollateralMinor ||
    current.providerFundingMinor !== current.requiredProviderFundingMinor ||
    current.matchProposalId !== proposal.tradingMatchProposalId ||
    current.proposalHash !== proposal.proposalHash ||
    current.obligationId !== canonicalObligation.obligationId ||
    current.obligationHash !== canonicalObligation.obligationHash ||
    actorHash(activatedByActorId) !== current.subjectActorHash
  ) {
    unavailable("Facility activation prerequisites are not current");
  }
  return updateFacilityState(
    current,
    {
      lifecycleStatus: TradingFacilityLifecycleStatus.ACTIVE,
      riskState: TradingFacilityRiskState.NORMAL,
      riskReasonCodes: ["synthetic_facility_activated"],
      activatedAt: now.toISOString()
    },
    now
  );
}

export function submitTradingOrderIntent(
  facility,
  {
    submittedByActorId,
    direction,
    syntheticNotionalMinor,
    expectedStateHash,
    expectedVersion,
    now = new Date(),
    ...unknown
  }
) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Order Intent input has an open shape");
  }
  const current = assertExpectedFacility(
    facility,
    expectedStateHash,
    expectedVersion
  );
  assertFacilityDeadline(current, now);
  if (
    current.lifecycleStatus !== TradingFacilityLifecycleStatus.ACTIVE ||
    ![
      TradingFacilityRiskState.NORMAL,
      TradingFacilityRiskState.WARNING
    ].includes(current.riskState) ||
    actorHash(submittedByActorId) !== current.subjectActorHash ||
    current.openOrderCount >= MAX_OPEN_ORDERS
  ) {
    unavailable("Facility does not admit new synthetic risk");
  }
  if (!ORDER_DIRECTIONS.has(direction)) invalid("direction is unsupported");
  const notional = BigInt(
    positiveMinor("syntheticNotionalMinor", syntheticNotionalMinor)
  );
  const equity = BigInt(current.syntheticEquityMinor);
  if (notional > equity) unavailable("Synthetic notional exceeds Facility equity");
  const createdAt = now.toISOString();
  const immutableCore = {
    facilityId: current.tradingFacilityId,
    facilityHash: current.facilityHash,
    subjectId: current.subjectId,
    principalId: current.principalId,
    submittedByActorHash: actorHash(submittedByActorId),
    direction,
    syntheticNotionalMinor,
    createdAt,
    orderPolicyVersion: TRADING_FACILITY_POLICY_VERSION
  };
  const orderIntent = {
    tradingOrderIntentId: createOperationalId("trading_order_intent"),
    orderIntentHash: hashId("trading_order_intent", immutableCore),
    ...immutableCore,
    status: TradingOrderIntentStatus.OPEN,
    cancelReasonCode: null,
    canceledAt: null,
    flattenedAt: null,
    version: 1,
    updatedAt: createdAt,
    serverRiskEvaluated: true,
    rawVenueActionAccepted: false,
    ...commonSafety(),
    schemaVersion: TRADING_ORDER_INTENT_SCHEMA_VERSION
  };
  orderIntent.orderStateHash = hashId("trading_order_intent_state", {
    tradingOrderIntentId: orderIntent.tradingOrderIntentId,
    orderIntentHash: orderIntent.orderIntentHash,
    status: orderIntent.status,
    version: orderIntent.version,
    cancelReasonCode: orderIntent.cancelReasonCode,
    canceledAt: orderIntent.canceledAt,
    flattenedAt: orderIntent.flattenedAt,
    updatedAt: orderIntent.updatedAt
  });
  assertNoRawPiiReference(orderIntent, "tradingOrderIntent");
  assertOrderIntent(orderIntent);
  const syntheticExposureMinor = (
    BigInt(current.syntheticExposureMinor) + notional
  ).toString();
  const syntheticEquityMinor = (
    BigInt(current.syntheticCapitalMinor) - BigInt(syntheticExposureMinor)
  ).toString();
  const updatedFacility = updateFacilityState(
    current,
    {
      syntheticExposureMinor,
      syntheticEquityMinor,
      openOrderCount: current.openOrderCount + 1,
      riskReasonCodes: ["synthetic_order_intent_open"]
    },
    now
  );
  return {
    facility: updatedFacility,
    orderIntent
  };
}

export function cancelTradingOrderIntent(
  facility,
  orderIntent,
  {
    canceledByActorId,
    expectedFacilityStateHash,
    expectedFacilityVersion,
    expectedOrderIntentHash,
    expectedOrderVersion,
    now = new Date(),
    ...unknown
  }
) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Order cancellation input has an open shape");
  }
  const currentFacility = assertExpectedFacility(
    facility,
    expectedFacilityStateHash,
    expectedFacilityVersion
  );
  const currentOrder = assertOrderIntent(orderIntent);
  hash("expectedOrderIntentHash", expectedOrderIntentHash);
  exactVersion("Order Intent", currentOrder.version, expectedOrderVersion);
  if (
    expectedOrderIntentHash !== currentOrder.orderIntentHash ||
    currentOrder.status !== TradingOrderIntentStatus.OPEN ||
    currentOrder.facilityId !== currentFacility.tradingFacilityId ||
    actorHash(canceledByActorId) !== currentFacility.subjectActorHash
  ) {
    unavailable();
  }
  const syntheticExposureMinor = (
    BigInt(currentFacility.syntheticExposureMinor) -
    BigInt(currentOrder.syntheticNotionalMinor)
  ).toString();
  if (BigInt(syntheticExposureMinor) < 0n) {
    unavailable("Order exposure exceeds Facility exposure");
  }
  const updatedOrder = updateOrderState(
    currentOrder,
    {
      status: TradingOrderIntentStatus.CANCELED,
      cancelReasonCode: "subject_canceled_synthetic_intent",
      canceledAt: now.toISOString()
    },
    now
  );
  const updatedFacility = updateFacilityState(
    currentFacility,
    {
      syntheticExposureMinor,
      syntheticEquityMinor: (
        BigInt(currentFacility.syntheticCapitalMinor) -
        BigInt(syntheticExposureMinor)
      ).toString(),
      openOrderCount: currentFacility.openOrderCount - 1,
      riskReasonCodes: ["synthetic_order_intent_canceled"]
    },
    now
  );
  return {
    facility: updatedFacility,
    orderIntent: updatedOrder
  };
}

function riskTarget(facility, now) {
  const observedAt = new Date(date(
    "riskObservation.observedAt",
    facility.riskObservation.observedAt
  ));
  if (
    now < observedAt ||
    now.getTime() - observedAt.getTime() > LOCAL_OBSERVATION_MAX_AGE_MS
  ) {
    return {
      targetState: TradingFacilityRiskState.REDUCE_ONLY,
      freshness: "stale",
      reasonCodes: ["risk_observation_stale"]
    };
  }
  const capital = BigInt(facility.syntheticCapitalMinor);
  const exposure = BigInt(facility.syntheticExposureMinor);
  if (capital <= 0n) {
    return {
      targetState: TradingFacilityRiskState.REDUCE_ONLY,
      freshness: "unknown",
      reasonCodes: ["synthetic_capital_unavailable"]
    };
  }
  const utilizationBps = Number(
    (exposure * BPS_DENOMINATOR) / capital
  );
  if (utilizationBps >= 10_000) {
    return {
      targetState: TradingFacilityRiskState.FLATTEN,
      freshness: "fresh",
      reasonCodes: ["synthetic_exposure_at_cap"]
    };
  }
  if (utilizationBps > 7_500) {
    return {
      targetState: TradingFacilityRiskState.REDUCE_ONLY,
      freshness: "fresh",
      reasonCodes: ["synthetic_exposure_high"]
    };
  }
  if (utilizationBps > 5_000) {
    return {
      targetState: TradingFacilityRiskState.WARNING,
      freshness: "fresh",
      reasonCodes: ["synthetic_exposure_elevated"]
    };
  }
  return {
    targetState: TradingFacilityRiskState.NORMAL,
    freshness: "fresh",
    reasonCodes: ["synthetic_exposure_within_envelope"]
  };
}

export function evaluateTradingFacilityRisk(
  facility,
  {
    evaluatedByActorId,
    expectedStateHash,
    expectedVersion,
    now = new Date(),
    ...unknown
  }
) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Risk evaluation input has an open shape");
  }
  const current = assertExpectedFacility(
    facility,
    expectedStateHash,
    expectedVersion
  );
  if (
    current.lifecycleStatus !== TradingFacilityLifecycleStatus.ACTIVE
  ) {
    unavailable("Only an active Facility can be risk-evaluated");
  }
  const evaluatorActorHash = actorHash(evaluatedByActorId);
  const target = riskTarget(current, now);
  const nextRiskState = mostRestrictiveRiskState(
    current.riskState,
    target.targetState
  );
  const utilizationBps =
    BigInt(current.syntheticCapitalMinor) === 0n
      ? 0
      : Number(
          (BigInt(current.syntheticExposureMinor) * BPS_DENOMINATOR) /
          BigInt(current.syntheticCapitalMinor)
        );
  const core = {
    facilityId: current.tradingFacilityId,
    facilityHash: current.facilityHash,
    facilityVersionBefore: current.version,
    facilityStateHashBefore: current.stateHash,
    observationHash: current.riskObservation.observationHash,
    previousRiskState: current.riskState,
    evaluatedRiskState: nextRiskState,
    freshness: target.freshness,
    reasonCodes: target.reasonCodes,
    syntheticCapitalMinor: current.syntheticCapitalMinor,
    syntheticExposureMinor: current.syntheticExposureMinor,
    syntheticEquityMinor: current.syntheticEquityMinor,
    utilizationBps,
    evaluatorActorHash,
    evaluatedAt: now.toISOString(),
    riskPolicyVersion: TRADING_SHADOW_RISK_POLICY_VERSION
  };
  const evaluation = {
    tradingFacilityRiskEvaluationId: createOperationalId(
      "trading_facility_risk_evaluation"
    ),
    evaluationHash: hashId("trading_facility_risk_evaluation", core),
    ...core,
    monotonicProtection: true,
    authorizing: false,
    callerEquityAccepted: false,
    automaticRecovery: false,
    ...commonSafety(),
    schemaVersion: TRADING_FACILITY_RISK_EVALUATION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(evaluation, "tradingFacilityRiskEvaluation");
  const updatedFacility = updateFacilityState(
    current,
    {
      riskState: nextRiskState,
      riskReasonCodes: target.reasonCodes,
      latestRiskEvaluationId:
        evaluation.tradingFacilityRiskEvaluationId,
      latestRiskEvaluationHash: evaluation.evaluationHash
    },
    now
  );
  return {
    facility: updatedFacility,
    riskEvaluation: evaluation
  };
}

export function pauseTradingFacilityNewRisk(
  facility,
  {
    pausedByActorId,
    reasonCode,
    expectedStateHash,
    expectedVersion,
    now = new Date(),
    ...unknown
  }
) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Protective pause input has an open shape");
  }
  const current = assertExpectedFacility(
    facility,
    expectedStateHash,
    expectedVersion
  );
  identifier("reasonCode", reasonCode);
  actorHash(pausedByActorId);
  if (
    current.lifecycleStatus !== TradingFacilityLifecycleStatus.ACTIVE ||
    [
      TradingFacilityRiskState.FLATTEN,
      TradingFacilityRiskState.SETTLEMENT
    ].includes(current.riskState)
  ) {
    unavailable();
  }
  return updateFacilityState(
    current,
    {
      riskState: mostRestrictiveRiskState(
        current.riskState,
        TradingFacilityRiskState.REDUCE_ONLY
      ),
      riskReasonCodes: [`protective_pause:${reasonCode}`]
    },
    now
  );
}

export function flattenTradingFacility(
  facility,
  openOrderIntents,
  {
    flattenedByActorId,
    reasonCode,
    expectedStateHash,
    expectedVersion,
    now = new Date(),
    ...unknown
  }
) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Protective flatten input has an open shape");
  }
  const current = assertExpectedFacility(
    facility,
    expectedStateHash,
    expectedVersion
  );
  identifier("reasonCode", reasonCode);
  actorHash(flattenedByActorId);
  if (
    current.lifecycleStatus !== TradingFacilityLifecycleStatus.ACTIVE ||
    [
      TradingFacilityRiskState.FLATTEN,
      TradingFacilityRiskState.SETTLEMENT
    ].includes(current.riskState) ||
    !Array.isArray(openOrderIntents) ||
    openOrderIntents.length !== current.openOrderCount ||
    openOrderIntents.length > MAX_OPEN_ORDERS
  ) {
    unavailable();
  }
  const seen = new Set();
  let totalOpenExposure = 0n;
  const flattenedOrders = openOrderIntents.map((orderIntent) => {
    const order = assertOrderIntent(orderIntent);
    if (
      order.facilityId !== current.tradingFacilityId ||
      order.status !== TradingOrderIntentStatus.OPEN ||
      seen.has(order.tradingOrderIntentId)
    ) {
      unavailable("Open Order Intent set is inconsistent");
    }
    seen.add(order.tradingOrderIntentId);
    totalOpenExposure += BigInt(order.syntheticNotionalMinor);
    return updateOrderState(
      order,
      {
        status: TradingOrderIntentStatus.FLATTENED,
        cancelReasonCode: `protective_flatten:${reasonCode}`,
        flattenedAt: now.toISOString()
      },
      now
    );
  });
  if (totalOpenExposure !== BigInt(current.syntheticExposureMinor)) {
    unavailable("Open Order Intent exposure does not reconcile");
  }
  const updatedFacility = updateFacilityState(
    current,
    {
      lifecycleStatus: TradingFacilityLifecycleStatus.FLATTENED,
      riskState: TradingFacilityRiskState.FLATTEN,
      riskReasonCodes: [`protective_flatten:${reasonCode}`],
      syntheticExposureMinor: "0",
      syntheticEquityMinor: current.syntheticCapitalMinor,
      openOrderCount: 0,
      flattenedAt: now.toISOString()
    },
    now
  );
  return {
    facility: updatedFacility,
    orderIntents: flattenedOrders
  };
}

export function settleTradingFacility(
  facility,
  {
    settledByActorId,
    expectedStateHash,
    expectedVersion,
    now = new Date(),
    ...unknown
  }
) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Facility settlement input has an open shape");
  }
  const current = assertExpectedFacility(
    facility,
    expectedStateHash,
    expectedVersion
  );
  actorHash(settledByActorId);
  if (
    current.lifecycleStatus !== TradingFacilityLifecycleStatus.FLATTENED ||
    current.riskState !== TradingFacilityRiskState.FLATTEN ||
    current.openOrderCount !== 0 ||
    current.syntheticExposureMinor !== "0" ||
    current.syntheticEquityMinor !== current.syntheticCapitalMinor ||
    !current.subjectCollateralRecorded ||
    !current.providerFundingRecorded ||
    BigInt(current.subjectCollateralMinor) +
      BigInt(current.providerFundingMinor) !==
      BigInt(current.syntheticCapitalMinor)
  ) {
    unavailable("Facility is not ready for deterministic settlement");
  }
  return updateFacilityState(
    current,
    {
      riskState: TradingFacilityRiskState.SETTLEMENT,
      riskReasonCodes: ["synthetic_settlement_finalized"]
    },
    now
  );
}

export function tradingFacilityView(facility) {
  return clone(assertFacility(facility));
}

export function tradingOrderIntentView(orderIntent) {
  return clone(assertOrderIntent(orderIntent));
}

export function tradingFacilityRiskEvaluationView(riskEvaluation) {
  plainObject("riskEvaluation", riskEvaluation);
  if (
    riskEvaluation.schemaVersion !==
      TRADING_FACILITY_RISK_EVALUATION_SCHEMA_VERSION ||
    riskEvaluation.monotonicProtection !== true ||
    riskEvaluation.authorizing !== false ||
    riskEvaluation.callerEquityAccepted !== false ||
    riskEvaluation.automaticRecovery !== false
  ) {
    unavailable("Risk evaluation is unavailable");
  }
  hash("evaluationHash", riskEvaluation.evaluationHash);
  assertCommonSafety(riskEvaluation);
  return clone(riskEvaluation);
}
