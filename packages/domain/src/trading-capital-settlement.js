import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import { assertNoRawPiiReference } from "./validators.js";
import {
  TRADING_FACILITY_SCHEMA_VERSION,
  TradingFacilityLifecycleStatus,
  TradingFacilityRiskState,
  settleTradingFacility,
  tradingFacilityView
} from "./trading-capital-facility.js";

export const TRADING_FACILITY_CLOSE_REQUEST_SCHEMA_VERSION =
  "trading_facility_close_request.v1";
export const TRADING_SETTLEMENT_SCHEMA_VERSION = "trading_settlement.v1";
export const TRADING_PERFORMANCE_PROOF_SCHEMA_VERSION =
  "trading_performance_proof.v1";
export const TRADING_SETTLEMENT_POLICY_VERSION =
  "trading_no_funds_conservation_settlement_policy.v1";
export const TRADING_PERFORMANCE_PROOF_POLICY_VERSION =
  "trading_performance_proof_policy.v1";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const PROOF_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function invalid(message) {
  throw new DomainError("invalid_trading_settlement", message);
}

function unavailable(message = "Trading settlement is unavailable") {
  throw new DomainError("trading_settlement_unavailable", message);
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

function timestamp(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function actorHash(actorId) {
  return hashId("actor", identifier("actorId", actorId));
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
    unavailable("Trading settlement safety boundary changed");
  }
}

function closeRequestCore(value) {
  return {
    facilityId: value.facilityId,
    facilityHash: value.facilityHash,
    facilityStateHash: value.facilityStateHash,
    facilityVersion: value.facilityVersion,
    obligationId: value.obligationId,
    obligationHash: value.obligationHash,
    subjectId: value.subjectId,
    principalId: value.principalId,
    providerId: value.providerId,
    subjectActorHash: value.subjectActorHash,
    providerActorHash: value.providerActorHash,
    requestedByActorHash: value.requestedByActorHash,
    reasonCode: value.reasonCode,
    requestedAt: value.requestedAt,
    closePolicyVersion: value.closePolicyVersion
  };
}

function assertCloseRequest(value) {
  plainObject("closeRequest", value);
  if (
    value.schemaVersion !== TRADING_FACILITY_CLOSE_REQUEST_SCHEMA_VERSION ||
    value.status !== "requested" ||
    value.version !== 1 ||
    value.reasonCode !== "operator_request" ||
    value.immutable !== true
  ) {
    unavailable("Facility close request is unavailable");
  }
  identifier("tradingFacilityCloseRequestId", value.tradingFacilityCloseRequestId);
  hash("requestHash", value.requestHash);
  timestamp("requestedAt", value.requestedAt);
  assertCommonSafety(value);
  if (
    hashId("trading_facility_close_request", closeRequestCore(value)) !==
    value.requestHash
  ) {
    unavailable("Facility close request binding changed");
  }
  return value;
}

function settlementCore(value) {
  return {
    closeRequestId: value.closeRequestId,
    closeRequestHash: value.closeRequestHash,
    facilityId: value.facilityId,
    facilityHash: value.facilityHash,
    facilityStateHashBefore: value.facilityStateHashBefore,
    facilityVersionBefore: value.facilityVersionBefore,
    facilityStateHashAfter: value.facilityStateHashAfter,
    facilityVersionAfter: value.facilityVersionAfter,
    obligationId: value.obligationId,
    obligationHash: value.obligationHash,
    subjectId: value.subjectId,
    principalId: value.principalId,
    providerId: value.providerId,
    assetId: value.assetId,
    finalSyntheticEquityMinor: value.finalSyntheticEquityMinor,
    subjectContributionMinor: value.subjectContributionMinor,
    providerContributionMinor: value.providerContributionMinor,
    subjectReturnMinor: value.subjectReturnMinor,
    providerPrincipalReturnMinor: value.providerPrincipalReturnMinor,
    realizedPnlMinor: value.realizedPnlMinor,
    venueCostMinor: value.venueCostMinor,
    closingCostMinor: value.closingCostMinor,
    fixedReturnMinor: value.fixedReturnMinor,
    performanceParticipationMinor: value.performanceParticipationMinor,
    ipoOneFeeMinor: value.ipoOneFeeMinor,
    totalAllocatedMinor: value.totalAllocatedMinor,
    settledByActorHash: value.settledByActorHash,
    settledAt: value.settledAt,
    settlementPolicyVersion: value.settlementPolicyVersion
  };
}

function assertSettlement(value) {
  plainObject("settlement", value);
  if (
    value.schemaVersion !== TRADING_SETTLEMENT_SCHEMA_VERSION ||
    value.status !== "finalized" ||
    value.version !== 1 ||
    value.waterfallBalanced !== true ||
    value.zeroExposureVerified !== true ||
    value.canonicalObligationUnchanged !== true ||
    value.canonicalLedgerMutationCreated !== false ||
    value.secondLedgerCreated !== false ||
    value.officialSettlement !== false ||
    value.realizedPnlMinor !== "0" ||
    value.venueCostMinor !== "0" ||
    value.closingCostMinor !== "0" ||
    value.fixedReturnMinor !== "0" ||
    value.performanceParticipationMinor !== "0" ||
    value.ipoOneFeeMinor !== "0" ||
    BigInt(value.subjectReturnMinor) +
      BigInt(value.providerPrincipalReturnMinor) !==
      BigInt(value.totalAllocatedMinor) ||
    value.totalAllocatedMinor !== value.finalSyntheticEquityMinor ||
    value.subjectReturnMinor !== value.subjectContributionMinor ||
    value.providerPrincipalReturnMinor !== value.providerContributionMinor
  ) {
    unavailable("Settlement conservation proof is unavailable");
  }
  identifier("tradingSettlementId", value.tradingSettlementId);
  hash("settlementHash", value.settlementHash);
  timestamp("settledAt", value.settledAt);
  assertCommonSafety(value);
  if (hashId("trading_settlement", settlementCore(value)) !== value.settlementHash) {
    unavailable("Settlement binding changed");
  }
  return value;
}

function performanceProofCore(value) {
  return {
    settlementId: value.settlementId,
    settlementHash: value.settlementHash,
    facilityId: value.facilityId,
    facilityHash: value.facilityHash,
    obligationId: value.obligationId,
    obligationHash: value.obligationHash,
    subjectId: value.subjectId,
    principalId: value.principalId,
    providerId: value.providerId,
    claimSetHash: value.claimSetHash,
    issuedByActorHash: value.issuedByActorHash,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    proofVersion: value.proofVersion,
    proofPolicyVersion: value.proofPolicyVersion
  };
}

function assertPerformanceProof(value) {
  plainObject("performanceProof", value);
  if (
    value.schemaVersion !== TRADING_PERFORMANCE_PROOF_SCHEMA_VERSION ||
    value.status !== "active" ||
    value.proofVersion !== 1 ||
    value.revocable !== true ||
    value.revoked !== false ||
    value.externalVerificationAvailable !== false ||
    value.officialReport !== false ||
    value.universalScore !== false ||
    value.strategyDataIncluded !== false ||
    value.rawHistoryIncluded !== false ||
    value.claims?.facilityFinalized !== true ||
    value.claims?.zeroExposure !== true ||
    value.claims?.contributionConservation !== true ||
    value.claims?.canonicalObligationLinked !== true ||
    value.claims?.realProfitClaimed !== false
  ) {
    unavailable("Performance Proof is unavailable");
  }
  identifier("tradingPerformanceProofId", value.tradingPerformanceProofId);
  hash("proofHash", value.proofHash);
  hash("claimSetHash", value.claimSetHash);
  timestamp("issuedAt", value.issuedAt);
  timestamp("expiresAt", value.expiresAt);
  assertCommonSafety(value);
  if (
    hashId("trading_performance_proof_claims", value.claims) !==
      value.claimSetHash ||
    hashId("trading_performance_proof", performanceProofCore(value)) !==
      value.proofHash
  ) {
    unavailable("Performance Proof binding changed");
  }
  return value;
}

function assertCanonicalObligation(obligation, facility) {
  plainObject("obligation", obligation);
  if (
    obligation.schemaVersion !== "obligation.v2" ||
    obligation.obligationId !== facility.obligationId ||
    obligation.obligationHash !== facility.obligationHash ||
    obligation.subjectId !== facility.subjectId ||
    obligation.principalId !== facility.principalId ||
    obligation.assetId !== facility.assetId ||
    obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false
  ) {
    unavailable("Canonical Obligation binding changed");
  }
  return obligation;
}

export function requestTradingFacilityClose({
  facility,
  requestedByActorId,
  expectedStateHash,
  expectedVersion,
  now = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Facility close request input has an open shape");
  }
  const current = tradingFacilityView(facility);
  hash("expectedStateHash", expectedStateHash);
  if (
    current.schemaVersion !== TRADING_FACILITY_SCHEMA_VERSION ||
    current.stateHash !== expectedStateHash ||
    current.version !== expectedVersion ||
    current.lifecycleStatus !== TradingFacilityLifecycleStatus.FLATTENED ||
    current.riskState !== TradingFacilityRiskState.FLATTEN ||
    current.openOrderCount !== 0 ||
    current.syntheticExposureMinor !== "0" ||
    current.syntheticEquityMinor !== current.syntheticCapitalMinor ||
    actorHash(requestedByActorId) !== current.subjectActorHash
  ) {
    unavailable("Facility cannot accept a close request");
  }
  const requestedAt = now.toISOString();
  const request = {
    tradingFacilityCloseRequestId: createOperationalId(
      "trading_facility_close_request"
    ),
    facilityId: current.tradingFacilityId,
    facilityHash: current.facilityHash,
    facilityStateHash: current.stateHash,
    facilityVersion: current.version,
    obligationId: current.obligationId,
    obligationHash: current.obligationHash,
    subjectId: current.subjectId,
    principalId: current.principalId,
    providerId: current.providerId,
    subjectActorHash: current.subjectActorHash,
    providerActorHash: current.providerActorHash,
    requestedByActorHash: actorHash(requestedByActorId),
    reasonCode: "operator_request",
    status: "requested",
    immutable: true,
    requestedAt,
    version: 1,
    closePolicyVersion: TRADING_SETTLEMENT_POLICY_VERSION,
    ...commonSafety(),
    schemaVersion: TRADING_FACILITY_CLOSE_REQUEST_SCHEMA_VERSION
  };
  request.requestHash = hashId(
    "trading_facility_close_request",
    closeRequestCore(request)
  );
  assertNoRawPiiReference(request, "tradingFacilityCloseRequest");
  assertCloseRequest(request);
  return request;
}

export function runTradingSettlement({
  facility,
  closeRequest,
  obligation,
  settledByActorId,
  expectedCloseRequestHash,
  expectedFacilityStateHash,
  expectedFacilityVersion,
  now = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Settlement run input has an open shape");
  }
  const current = tradingFacilityView(facility);
  const request = assertCloseRequest(closeRequest);
  const canonicalObligation = assertCanonicalObligation(obligation, current);
  hash("expectedCloseRequestHash", expectedCloseRequestHash);
  if (
    request.requestHash !== expectedCloseRequestHash ||
    request.facilityId !== current.tradingFacilityId ||
    request.facilityHash !== current.facilityHash ||
    request.facilityStateHash !== current.stateHash ||
    request.facilityVersion !== current.version ||
    request.obligationId !== canonicalObligation.obligationId
  ) {
    unavailable("Close request or Facility changed before settlement");
  }
  const nextFacility = settleTradingFacility(current, {
    settledByActorId,
    expectedStateHash: expectedFacilityStateHash,
    expectedVersion: expectedFacilityVersion,
    now
  });
  const finalSyntheticEquityMinor = current.syntheticEquityMinor;
  const subjectReturnMinor = current.subjectCollateralMinor;
  const providerPrincipalReturnMinor = current.providerFundingMinor;
  const totalAllocatedMinor = (
    BigInt(subjectReturnMinor) + BigInt(providerPrincipalReturnMinor)
  ).toString();
  if (
    totalAllocatedMinor !== finalSyntheticEquityMinor ||
    finalSyntheticEquityMinor !== current.syntheticCapitalMinor
  ) {
    unavailable("Synthetic settlement does not conserve Facility equity");
  }
  const settledAt = now.toISOString();
  const settlement = {
    tradingSettlementId: createOperationalId("trading_settlement"),
    closeRequestId: request.tradingFacilityCloseRequestId,
    closeRequestHash: request.requestHash,
    facilityId: current.tradingFacilityId,
    facilityHash: current.facilityHash,
    facilityStateHashBefore: current.stateHash,
    facilityVersionBefore: current.version,
    facilityStateHashAfter: nextFacility.stateHash,
    facilityVersionAfter: nextFacility.version,
    obligationId: current.obligationId,
    obligationHash: current.obligationHash,
    subjectId: current.subjectId,
    principalId: current.principalId,
    providerId: current.providerId,
    assetId: current.assetId,
    finalSyntheticEquityMinor,
    subjectContributionMinor: current.subjectCollateralMinor,
    providerContributionMinor: current.providerFundingMinor,
    subjectReturnMinor,
    providerPrincipalReturnMinor,
    realizedPnlMinor: "0",
    venueCostMinor: "0",
    closingCostMinor: "0",
    fixedReturnMinor: "0",
    performanceParticipationMinor: "0",
    ipoOneFeeMinor: "0",
    totalAllocatedMinor,
    waterfallBalanced: true,
    zeroExposureVerified: true,
    canonicalObligationUnchanged: true,
    canonicalLedgerMutationCreated: false,
    secondLedgerCreated: false,
    officialSettlement: false,
    status: "finalized",
    version: 1,
    settledByActorHash: actorHash(settledByActorId),
    settledAt,
    settlementPolicyVersion: TRADING_SETTLEMENT_POLICY_VERSION,
    ...commonSafety(),
    schemaVersion: TRADING_SETTLEMENT_SCHEMA_VERSION
  };
  settlement.settlementHash = hashId(
    "trading_settlement",
    settlementCore(settlement)
  );
  assertNoRawPiiReference(settlement, "tradingSettlement");
  assertSettlement(settlement);
  return { facility: nextFacility, settlement };
}

export function issueTradingPerformanceProof({
  settlement,
  facility,
  obligation,
  issuedByActorId,
  now = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Performance Proof input has an open shape");
  }
  const finalized = assertSettlement(settlement);
  const current = tradingFacilityView(facility);
  const canonicalObligation = assertCanonicalObligation(obligation, current);
  const issuerHash = actorHash(issuedByActorId);
  if (
    finalized.facilityId !== current.tradingFacilityId ||
    finalized.facilityHash !== current.facilityHash ||
    finalized.facilityStateHashAfter !== current.stateHash ||
    current.riskState !== TradingFacilityRiskState.SETTLEMENT ||
    finalized.obligationId !== canonicalObligation.obligationId ||
    ![current.subjectActorHash, current.providerActorHash].includes(issuerHash)
  ) {
    unavailable("Performance Proof bindings are unavailable");
  }
  const claims = {
    facilityFinalized: true,
    zeroExposure: true,
    contributionConservation: true,
    canonicalObligationLinked: true,
    realProfitClaimed: false,
    finalSyntheticEquityMinor: finalized.finalSyntheticEquityMinor,
    subjectReturnMinor: finalized.subjectReturnMinor,
    providerPrincipalReturnMinor: finalized.providerPrincipalReturnMinor,
    realizedPnlMinor: "0",
    ipoOneFeeMinor: "0"
  };
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PROOF_LIFETIME_MS).toISOString();
  const proof = {
    tradingPerformanceProofId: createOperationalId(
      "trading_performance_proof"
    ),
    settlementId: finalized.tradingSettlementId,
    settlementHash: finalized.settlementHash,
    facilityId: current.tradingFacilityId,
    facilityHash: current.facilityHash,
    obligationId: canonicalObligation.obligationId,
    obligationHash: canonicalObligation.obligationHash,
    subjectId: current.subjectId,
    principalId: current.principalId,
    providerId: current.providerId,
    claims,
    claimSetHash: hashId("trading_performance_proof_claims", claims),
    status: "active",
    proofVersion: 1,
    revocable: true,
    revoked: false,
    externalVerificationAvailable: false,
    officialReport: false,
    universalScore: false,
    strategyDataIncluded: false,
    rawHistoryIncluded: false,
    issuedByActorHash: issuerHash,
    issuedAt,
    expiresAt,
    proofPolicyVersion: TRADING_PERFORMANCE_PROOF_POLICY_VERSION,
    ...commonSafety(),
    schemaVersion: TRADING_PERFORMANCE_PROOF_SCHEMA_VERSION
  };
  proof.proofHash = hashId(
    "trading_performance_proof",
    performanceProofCore(proof)
  );
  assertNoRawPiiReference(proof, "tradingPerformanceProof");
  assertPerformanceProof(proof);
  return proof;
}

export function tradingFacilityCloseRequestView(value) {
  return clone(assertCloseRequest(value));
}

export function tradingSettlementView(value) {
  return clone(assertSettlement(value));
}

export function tradingPerformanceProofView(value) {
  return clone(assertPerformanceProof(value));
}

export function createTradingFacilityEvidenceView({
  facility,
  closeRequest = null,
  settlement = null,
  performanceProof = null,
  evidenceItems,
  asOf,
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    invalid("Facility Evidence input has an open shape");
  }
  const current = tradingFacilityView(facility);
  const close = closeRequest === null ? null : assertCloseRequest(closeRequest);
  const finalized = settlement === null ? null : assertSettlement(settlement);
  const proof =
    performanceProof === null ? null : assertPerformanceProof(performanceProof);
  timestamp("asOf", asOf);
  if (
    !Array.isArray(evidenceItems) ||
    evidenceItems.length > 50 ||
    evidenceItems.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        typeof item.evidenceId !== "string" ||
        !HASH_PATTERN.test(item.evidenceHash) ||
        item.obligationId !== current.obligationId
    ) ||
    (close !== null && close.facilityId !== current.tradingFacilityId) ||
    (finalized !== null && finalized.facilityId !== current.tradingFacilityId) ||
    (proof !== null && proof.facilityId !== current.tradingFacilityId)
  ) {
    unavailable("Facility Evidence is inconsistent");
  }
  return Object.freeze({
    facility: tradingFacilityView(current),
    closeRequest: close === null ? null : tradingFacilityCloseRequestView(close),
    settlement: finalized === null ? null : tradingSettlementView(finalized),
    performanceProof:
      proof === null ? null : tradingPerformanceProofView(proof),
    items: clone(evidenceItems),
    page: {
      count: evidenceItems.length,
      limit: 50,
      truncated: false
    },
    asOf,
    strategyDataIncluded: false,
    rawHistoryIncluded: false,
    piiIncluded: false,
    sandboxOnly: true,
    syntheticOnly: true,
    nonRedeemable: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "trading_facility_evidence.v1"
  });
}
