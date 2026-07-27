const ENTRY_MODES = new Set(["human", "agent"]);
const LIFECYCLE_LABELS = Object.freeze({
  awaiting_contributions: "Awaiting synthetic contributions",
  awaiting_subject_collateral: "Awaiting Subject synthetic collateral",
  awaiting_provider_funding: "Awaiting Provider synthetic funding",
  ready_for_activation: "Ready for exact activation",
  active: "Active synthetic Facility",
  flattened: "Protectively flattened"
});
const RISK_LABELS = Object.freeze({
  NORMAL: "Normal",
  WARNING: "Warning",
  REDUCE_ONLY: "Reduce only",
  FLATTEN: "Flattened",
  SETTLEMENT: "Deterministically settled"
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function safeFacility(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.schemaVersion === "trading_facility.v1" &&
    value.assetId === "urn:ipo-one:sandbox-asset:usd-cent" &&
    LIFECYCLE_LABELS[value.lifecycleStatus] !== undefined &&
    RISK_LABELS[value.riskState] !== undefined &&
    value.linkedCanonicalObligation === true &&
    value.secondLedgerCreated === false &&
    value.callerEquityAccepted === false &&
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
    value.productionFundsMoved === false
  );
}

function safeOrder(order, facility) {
  return (
    order &&
    typeof order === "object" &&
    !Array.isArray(order) &&
    order.schemaVersion === "trading_order_intent.v1" &&
    order.facilityId === facility.tradingFacilityId &&
    ["open", "canceled", "flattened"].includes(order.status) &&
    ["long", "short"].includes(order.direction) &&
    order.serverRiskEvaluated === true &&
    order.rawVenueActionAccepted === false &&
    order.sandboxOnly === true &&
    order.syntheticOnly === true &&
    order.nonRedeemable === true &&
    order.withdrawable === false &&
    order.transferable === false &&
    order.externalSystemQueried === false &&
    order.externalOrderSubmitted === false &&
    order.productionAuthority === false &&
    order.fundsAuthority === false &&
    order.realFunding === false &&
    order.productionFundsMoved === false
  );
}

export function createTradingCapitalFacilityPresentation({
  entryMode,
  facility,
  orderIntents
}) {
  if (
    !ENTRY_MODES.has(entryMode) ||
    !safeFacility(facility) ||
    !Array.isArray(orderIntents) ||
    orderIntents.length > 20 ||
    orderIntents.some((order) => !safeOrder(order, facility)) ||
    orderIntents.filter(({ status }) => status === "open").length !==
      facility.openOrderCount
  ) {
    return null;
  }
  const newRiskAvailable =
    facility.lifecycleStatus === "active" &&
    ["NORMAL", "WARNING"].includes(facility.riskState);
  return deepFreeze({
    entryMode,
    entryLabel: entryMode === "human" ? "Human" : "Agent",
    facilityId: facility.tradingFacilityId,
    canonicalObligationId: facility.obligationId,
    linkedCanonicalObligation: true,
    secondLedgerCreated: false,
    lifecycleStatus: facility.lifecycleStatus,
    lifecycleLabel: LIFECYCLE_LABELS[facility.lifecycleStatus],
    riskState: facility.riskState,
    riskLabel: RISK_LABELS[facility.riskState],
    riskReasonCodes: [...facility.riskReasonCodes],
    capitalLabel: "Synthetic non-redeemable capital",
    assetId: facility.assetId,
    syntheticCapitalMinor: facility.syntheticCapitalMinor,
    syntheticExposureMinor: facility.syntheticExposureMinor,
    syntheticEquityMinor: facility.syntheticEquityMinor,
    openOrderCount: facility.openOrderCount,
    newRiskAvailable,
    cancelOpenIntentAvailable: facility.openOrderCount > 0,
    protectivePauseAvailable:
      facility.lifecycleStatus === "active" &&
      !["FLATTEN", "SETTLEMENT"].includes(facility.riskState),
    protectiveFlattenAvailable:
      facility.lifecycleStatus === "active" &&
      !["FLATTEN", "SETTLEMENT"].includes(facility.riskState),
    settlementAvailable:
      facility.lifecycleStatus === "flattened" &&
      facility.riskState === "FLATTEN" &&
      facility.syntheticExposureMinor === "0" &&
      facility.openOrderCount === 0,
    withdrawalAvailable: false,
    transferAvailable: false,
    externalExecutionAvailable: false,
    productionFundsAvailable: false,
    orderIntents: orderIntents.map((order) => ({
      tradingOrderIntentId: order.tradingOrderIntentId,
      direction: order.direction,
      syntheticNotionalMinor: order.syntheticNotionalMinor,
      status: order.status,
      serverRiskEvaluated: true,
      externalOrderSubmitted: false,
      nonRedeemable: true
    })),
    sandboxOnly: true,
    syntheticOnly: true,
    nonRedeemable: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "trading_capital_facility_presentation.v1"
  });
}
