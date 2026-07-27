import assert from "node:assert/strict";
import test from "node:test";
import {
  TRADING_CAPITAL_OPERATION_IDS,
  TRADING_CAPITAL_VIEW_DEFINITIONS,
  createTradingCapitalProductPresentation
} from "../src/trading-capital-product-presentation.js";

const H1 = `0x${"1".repeat(64)}`;
const H2 = `0x${"2".repeat(64)}`;
const H3 = `0x${"3".repeat(64)}`;
const H4 = `0x${"4".repeat(64)}`;

const safety = {
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

function fixture() {
  const facility = {
    tradingFacilityId: "facility_tc104",
    facilityHash: H1,
    stateHash: H2,
    obligationId: "obligation_tc104",
    subjectId: "subject_tc104",
    principalId: "principal_tc104",
    providerId: "provider_tc104",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    lifecycleStatus: "flattened",
    riskState: "SETTLEMENT",
    syntheticExposureMinor: "0",
    openOrderCount: 0,
    linkedCanonicalObligation: true,
    secondLedgerCreated: false,
    callerEquityAccepted: false,
    version: 8,
    ...safety,
    schemaVersion: "trading_facility.v1"
  };
  const closeRequest = {
    tradingFacilityCloseRequestId: "close_tc104",
    requestHash: H3,
    facilityId: facility.tradingFacilityId,
    facilityHash: facility.facilityHash,
    obligationId: facility.obligationId,
    subjectId: facility.subjectId,
    principalId: facility.principalId,
    providerId: facility.providerId,
    status: "requested",
    reasonCode: "operator_request",
    immutable: true,
    ...safety,
    schemaVersion: "trading_facility_close_request.v1"
  };
  const settlement = {
    tradingSettlementId: "settlement_tc104",
    settlementHash: H4,
    closeRequestId: closeRequest.tradingFacilityCloseRequestId,
    closeRequestHash: closeRequest.requestHash,
    facilityId: facility.tradingFacilityId,
    facilityHash: facility.facilityHash,
    facilityStateHashAfter: facility.stateHash,
    facilityVersionAfter: facility.version,
    obligationId: facility.obligationId,
    subjectContributionMinor: "100",
    providerContributionMinor: "1000",
    subjectReturnMinor: "100",
    providerPrincipalReturnMinor: "1000",
    finalSyntheticEquityMinor: "1100",
    totalAllocatedMinor: "1100",
    realizedPnlMinor: "0",
    venueCostMinor: "0",
    closingCostMinor: "0",
    fixedReturnMinor: "0",
    performanceParticipationMinor: "0",
    ipoOneFeeMinor: "0",
    waterfallBalanced: true,
    zeroExposureVerified: true,
    canonicalObligationUnchanged: true,
    canonicalLedgerMutationCreated: false,
    secondLedgerCreated: false,
    officialSettlement: false,
    status: "finalized",
    ...safety,
    schemaVersion: "trading_settlement.v1"
  };
  const performanceProof = {
    tradingPerformanceProofId: "proof_tc104",
    proofHash: H1,
    claimSetHash: H2,
    settlementId: settlement.tradingSettlementId,
    settlementHash: settlement.settlementHash,
    facilityId: facility.tradingFacilityId,
    facilityHash: facility.facilityHash,
    obligationId: facility.obligationId,
    status: "active",
    revocable: true,
    revoked: false,
    externalVerificationAvailable: false,
    officialReport: false,
    universalScore: false,
    strategyDataIncluded: false,
    rawHistoryIncluded: false,
    claims: {
      facilityFinalized: true,
      zeroExposure: true,
      contributionConservation: true,
      canonicalObligationLinked: true,
      realProfitClaimed: false
    },
    ...safety,
    schemaVersion: "trading_performance_proof.v1"
  };
  const evidence = {
    facility,
    closeRequest,
    settlement,
    performanceProof,
    items: [],
    page: { count: 0, limit: 50, truncated: false },
    strategyDataIncluded: false,
    rawHistoryIncluded: false,
    piiIncluded: false,
    sandboxOnly: true,
    syntheticOnly: true,
    nonRedeemable: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "trading_facility_evidence.v1"
  };
  return { facility, closeRequest, settlement, performanceProof, evidence };
}

test("TC-104 eight views cover the exact 25-operation local catalog", () => {
  assert.equal(TRADING_CAPITAL_VIEW_DEFINITIONS.length, 8);
  assert.equal(TRADING_CAPITAL_OPERATION_IDS.length, 25);
  assert.deepEqual(
    [...new Set(TRADING_CAPITAL_VIEW_DEFINITIONS.flatMap((view) => view.operationIds))]
      .sort(),
    [...TRADING_CAPITAL_OPERATION_IDS].sort()
  );
});

test("TC-104 Human, Agent, and Provider reconcile to one Facility", () => {
  const input = fixture();
  const human = createTradingCapitalProductPresentation({
    entryMode: "human",
    ...input
  });
  const agent = createTradingCapitalProductPresentation({
    entryMode: "agent",
    ...input
  });
  assert.equal(Object.isFrozen(human), true);
  assert.equal(human.operationCount, 25);
  assert.equal(human.views.length, 8);
  assert.equal(human.audiences.human.facilityId, input.facility.tradingFacilityId);
  assert.equal(human.audiences.agent.facilityId, input.facility.tradingFacilityId);
  assert.equal(human.audiences.provider.facilityId, input.facility.tradingFacilityId);
  assert.deepEqual(
    { ...human, entryMode: undefined, entryLabel: undefined },
    { ...agent, entryMode: undefined, entryLabel: undefined }
  );
  assert.equal(human.reconciliation.waterfallBalanced, true);
  assert.equal(human.reconciliation.canonicalLedgerMutationCreated, false);
  assert.equal(human.actions.officialSettlementAvailable, false);
  assert.equal(human.actions.remoteMcpAvailable, false);
});

test("TC-104 presentation fails closed on value, proof, or privacy drift", () => {
  for (const mutate of [
    (input) => { input.settlement.ipoOneFeeMinor = "1"; },
    (input) => { input.settlement.providerPrincipalReturnMinor = "999"; },
    (input) => { input.performanceProof.officialReport = true; },
    (input) => { input.performanceProof.claims.realProfitClaimed = true; },
    (input) => { input.evidence.strategyDataIncluded = true; },
    (input) => { input.evidence.facility = { ...input.facility, stateHash: H3 }; }
  ]) {
    const input = fixture();
    mutate(input);
    assert.equal(
      createTradingCapitalProductPresentation({ entryMode: "human", ...input }),
      null
    );
  }
});
