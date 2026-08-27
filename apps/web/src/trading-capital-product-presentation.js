const HASH = /^0x[0-9a-f]{64}$/;
const ENTRY_MODES = new Set(["human", "agent"]);

export const TRADING_CAPITAL_OPERATION_IDS = Object.freeze([
  "tradingCreateAccountBindingChallenge",
  "tradingImportHyperliquidHistory",
  "tradingFinalizeEvidenceSnapshot",
  "tradingReadCreditProfile",
  "tradingCreateCapitalRequest",
  "tradingCreateProviderMandate",
  "tradingListCompatibleMandates",
  "tradingCreateMatchProposal",
  "tradingAcceptMatchAsProvider",
  "tradingAcceptMatchAsSubject",
  "tradingCreateFacility",
  "tradingContributeSubjectCollateral",
  "tradingRecordProviderFunding",
  "tradingActivateFacility",
  "tradingSubmitOrderIntent",
  "tradingCancelOrderIntent",
  "tradingReadFacilityState",
  "tradingEvaluateRisk",
  "tradingPauseNewRisk",
  "tradingFlattenFacility",
  "tradingRequestClose",
  "tradingRunSettlement",
  "tradingReadSettlement",
  "tradingIssuePerformanceProof",
  "tradingReadFacilityEvidence",
  "agentCreateSecuredFacilityAuthorization",
  "agentReadSecuredFacilityAuthorization",
  "agentRevokeSecuredFacilityAuthorization"
]);

export const TRADING_CAPITAL_VIEW_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "overview",
    label: "Overview",
    operationIds: Object.freeze([
      "tradingReadCreditProfile",
      "tradingReadFacilityState",
      "tradingReadSettlement",
      "tradingReadFacilityEvidence"
    ])
  }),
  Object.freeze({
    id: "profile",
    label: "Profile",
    operationIds: Object.freeze(TRADING_CAPITAL_OPERATION_IDS.slice(0, 4))
  }),
  Object.freeze({
    id: "marketplace",
    label: "Marketplace",
    operationIds: Object.freeze(TRADING_CAPITAL_OPERATION_IDS.slice(4, 10))
  }),
  Object.freeze({
    id: "setup",
    label: "Setup",
    operationIds: Object.freeze(TRADING_CAPITAL_OPERATION_IDS.slice(10, 14))
  }),
  Object.freeze({
    id: "live",
    label: "Live",
    operationIds: Object.freeze(TRADING_CAPITAL_OPERATION_IDS.slice(14, 17))
  }),
  Object.freeze({
    id: "risk",
    label: "Risk",
    operationIds: Object.freeze(TRADING_CAPITAL_OPERATION_IDS.slice(17, 20))
  }),
  Object.freeze({
    id: "settle",
    label: "Settle",
    operationIds: Object.freeze(TRADING_CAPITAL_OPERATION_IDS.slice(20, 23))
  }),
  Object.freeze({
    id: "proof",
    label: "Proof",
    operationIds: Object.freeze(TRADING_CAPITAL_OPERATION_IDS.slice(23, 25))
  }),
  Object.freeze({
    id: "authorization",
    label: "Agent authorization",
    operationIds: Object.freeze(TRADING_CAPITAL_OPERATION_IDS.slice(25, 28))
  })
]);

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

function safeEnvelope(value, schemaVersion) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.schemaVersion === schemaVersion &&
    value.sandboxOnly === true &&
    value.syntheticOnly === true &&
    value.nonRedeemable === true &&
    value.withdrawable === false &&
    value.transferable === false &&
    value.externalSystemQueried === false &&
    value.externalOrderSubmitted === false &&
    value.productionAuthority === false &&
    value.fundsAuthority === false &&
    value.realCollateral === false &&
    value.realFunding === false &&
    value.realEquity === false &&
    value.realPricing === false &&
    value.productionFundsMoved === false &&
    value.piiIncluded === false &&
    value.secretsIncluded === false
  );
}

function safeFacility(value) {
  return (
    safeEnvelope(value, "trading_facility.v1") &&
    HASH.test(value.facilityHash) &&
    HASH.test(value.stateHash) &&
    value.linkedCanonicalObligation === true &&
    value.secondLedgerCreated === false &&
    value.callerEquityAccepted === false &&
    value.assetId === "urn:ipo-one:sandbox-asset:usd-cent" &&
    ["awaiting_contributions", "awaiting_subject_collateral",
      "awaiting_provider_funding", "ready_for_activation", "active",
      "flattened"].includes(value.lifecycleStatus) &&
    ["NORMAL", "WARNING", "REDUCE_ONLY", "FLATTEN", "SETTLEMENT"].includes(
      value.riskState
    )
  );
}

function safeCloseRequest(value, facility) {
  if (value === null) return true;
  return (
    safeEnvelope(value, "trading_facility_close_request.v1") &&
    HASH.test(value.requestHash) &&
    value.facilityId === facility.tradingFacilityId &&
    value.facilityHash === facility.facilityHash &&
    value.obligationId === facility.obligationId &&
    value.subjectId === facility.subjectId &&
    value.principalId === facility.principalId &&
    value.providerId === facility.providerId &&
    value.status === "requested" &&
    value.reasonCode === "operator_request" &&
    value.immutable === true
  );
}

function safeSettlement(value, facility, closeRequest) {
  if (value === null) return true;
  if (!closeRequest) return false;
  const allocation =
    BigInt(value.subjectReturnMinor) +
    BigInt(value.providerPrincipalReturnMinor);
  return (
    safeEnvelope(value, "trading_settlement.v1") &&
    HASH.test(value.settlementHash) &&
    value.closeRequestId === closeRequest.tradingFacilityCloseRequestId &&
    value.closeRequestHash === closeRequest.requestHash &&
    value.facilityId === facility.tradingFacilityId &&
    value.facilityHash === facility.facilityHash &&
    value.facilityStateHashAfter === facility.stateHash &&
    value.facilityVersionAfter === facility.version &&
    value.obligationId === facility.obligationId &&
    value.status === "finalized" &&
    value.waterfallBalanced === true &&
    value.zeroExposureVerified === true &&
    value.canonicalObligationUnchanged === true &&
    value.canonicalLedgerMutationCreated === false &&
    value.secondLedgerCreated === false &&
    value.officialSettlement === false &&
    value.subjectReturnMinor === value.subjectContributionMinor &&
    value.providerPrincipalReturnMinor === value.providerContributionMinor &&
    allocation.toString() === value.totalAllocatedMinor &&
    value.totalAllocatedMinor === value.finalSyntheticEquityMinor &&
    [
      value.realizedPnlMinor,
      value.venueCostMinor,
      value.closingCostMinor,
      value.fixedReturnMinor,
      value.performanceParticipationMinor,
      value.ipoOneFeeMinor
    ].every((minor) => minor === "0")
  );
}

function safeProof(value, facility, settlement) {
  if (value === null) return true;
  return (
    settlement &&
    safeEnvelope(value, "trading_performance_proof.v1") &&
    HASH.test(value.proofHash) &&
    HASH.test(value.claimSetHash) &&
    value.settlementId === settlement.tradingSettlementId &&
    value.settlementHash === settlement.settlementHash &&
    value.facilityId === facility.tradingFacilityId &&
    value.facilityHash === facility.facilityHash &&
    value.obligationId === facility.obligationId &&
    value.status === "active" &&
    value.revocable === true &&
    value.revoked === false &&
    value.externalVerificationAvailable === false &&
    value.officialReport === false &&
    value.universalScore === false &&
    value.strategyDataIncluded === false &&
    value.rawHistoryIncluded === false &&
    value.claims?.facilityFinalized === true &&
    value.claims?.zeroExposure === true &&
    value.claims?.contributionConservation === true &&
    value.claims?.canonicalObligationLinked === true &&
    value.claims?.realProfitClaimed === false
  );
}

function sameOptional(left, right, idKey, hashKey) {
  if (left === null || right === null) return left === right;
  return left[idKey] === right[idKey] && left[hashKey] === right[hashKey];
}

function safeEvidence(value, facility, closeRequest, settlement, proof) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.schemaVersion === "trading_facility_evidence.v1" &&
    value.facility?.tradingFacilityId === facility.tradingFacilityId &&
    value.facility?.stateHash === facility.stateHash &&
    sameOptional(
      value.closeRequest,
      closeRequest,
      "tradingFacilityCloseRequestId",
      "requestHash"
    ) &&
    sameOptional(
      value.settlement,
      settlement,
      "tradingSettlementId",
      "settlementHash"
    ) &&
    sameOptional(
      value.performanceProof,
      proof,
      "tradingPerformanceProofId",
      "proofHash"
    ) &&
    Array.isArray(value.items) &&
    value.items.length <= 50 &&
    value.page?.count === value.items.length &&
    value.page?.limit === 50 &&
    value.page?.truncated === false &&
    value.strategyDataIncluded === false &&
    value.rawHistoryIncluded === false &&
    value.piiIncluded === false &&
    value.sandboxOnly === true &&
    value.syntheticOnly === true &&
    value.nonRedeemable === true &&
    value.productionAuthority === false &&
    value.fundsAuthority === false
  );
}

export function createTradingCapitalProductPresentation({
  entryMode,
  facility,
  closeRequest = null,
  settlement = null,
  performanceProof = null,
  evidence = null
}) {
  try {
    if (
      !ENTRY_MODES.has(entryMode) ||
      !safeFacility(facility) ||
      !safeCloseRequest(closeRequest, facility) ||
      !safeSettlement(settlement, facility, closeRequest) ||
      !safeProof(performanceProof, facility, settlement) ||
      (evidence !== null &&
        !safeEvidence(
          evidence,
          facility,
          closeRequest,
          settlement,
          performanceProof
        ))
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const settled = settlement !== null;
  const proofIssued = performanceProof !== null;
  const closeReady =
    facility.lifecycleStatus === "flattened" &&
    facility.riskState === "FLATTEN" &&
    facility.syntheticExposureMinor === "0" &&
    facility.openOrderCount === 0 &&
    closeRequest === null;

  return freeze({
    entryMode,
    entryLabel: entryMode === "human" ? "Human" : "Agent",
    facilityId: facility.tradingFacilityId,
    obligationId: facility.obligationId,
    providerId: facility.providerId,
    facilityVersion: facility.version,
    facilityStateHash: facility.stateHash,
    lifecycleStatus: facility.lifecycleStatus,
    riskState: facility.riskState,
    closeRequestId:
      closeRequest?.tradingFacilityCloseRequestId ?? null,
    settlementId: settlement?.tradingSettlementId ?? null,
    performanceProofId:
      performanceProof?.tradingPerformanceProofId ?? null,
    actions: {
      requestCloseAvailable: closeReady,
      runSettlementWorkerOnly: closeRequest !== null && !settled,
      readSettlementAvailable: settled,
      issuePerformanceProofAvailable: settled && !proofIssued,
      readFacilityEvidenceAvailable: true,
      withdrawalAvailable: false,
      externalExecutionAvailable: false,
      officialSettlementAvailable: false,
      remoteMcpAvailable: false
    },
    reconciliation: {
      oneFacility: true,
      oneCanonicalObligation: true,
      secondLedgerCreated: false,
      waterfallBalanced: settlement?.waterfallBalanced ?? null,
      canonicalLedgerMutationCreated:
        settlement?.canonicalLedgerMutationCreated ?? null
    },
    audiences: {
      human: { facilityId: facility.tradingFacilityId, boundRead: true },
      agent: { facilityId: facility.tradingFacilityId, boundRead: true },
      provider: { facilityId: facility.tradingFacilityId, boundRead: true }
    },
    views: TRADING_CAPITAL_VIEW_DEFINITIONS.map((view) => ({
      id: view.id,
      label: view.label,
      operationIds: [...view.operationIds],
      dataSource: "authenticated_tenant_protocol",
      syntheticOnly: true
    })),
    operationIds: [...TRADING_CAPITAL_OPERATION_IDS],
    operationCount: TRADING_CAPITAL_OPERATION_IDS.length,
    evidenceLoaded: evidence !== null,
    strategyDataIncluded: false,
    rawHistoryIncluded: false,
    piiIncluded: false,
    sandboxOnly: true,
    syntheticOnly: true,
    nonRedeemable: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "trading_capital_product_presentation.v1"
  });
}
