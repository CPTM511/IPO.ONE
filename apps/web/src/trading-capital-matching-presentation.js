const HASH = /^0x[0-9a-f]{64}$/;
const ENTRY_MODES = new Set(["human", "agent"]);
const TEMPLATE_LABELS = Object.freeze({
  credit: "Credit",
  performance_participation: "Performance participation",
  hybrid: "Hybrid"
});
const STRATEGY_LABELS = Object.freeze({
  market_neutral: "Market neutral",
  directional: "Directional",
  liquidity_provision: "Liquidity provision"
});
const STATUS_LABELS = Object.freeze({
  not_proposed: "Not proposed",
  proposed: "Awaiting both parties",
  provider_accepted: "Awaiting Subject",
  subject_accepted: "Awaiting Provider",
  bilaterally_accepted: "Accepted by both parties"
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function safeMatchingObject(value, schemaVersion) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.schemaVersion === schemaVersion &&
    value.sandboxOnly === true &&
    value.productionAuthority === false &&
    value.fundsAuthority === false
  );
}

export function createTradingCapitalMatchingPresentation({
  entryMode,
  capitalRequest,
  compatibleMandates,
  matchProposal = null
}) {
  const expectedOperatorType =
    entryMode === "human" ? "human_trader" : "agent_operator";
  if (
    !ENTRY_MODES.has(entryMode) ||
    !safeMatchingObject(capitalRequest, "trading_capital_request.v1") ||
    capitalRequest.subjectType !== entryMode ||
    capitalRequest.operatorType !== expectedOperatorType ||
    capitalRequest.assetId !== "urn:ipo-one:sandbox-asset:usd-cent" ||
    capitalRequest.status !== "open" ||
    capitalRequest.version !== 1 ||
    capitalRequest.syntheticOnly !== true ||
    capitalRequest.riskClassCallerSupplied !== false ||
    capitalRequest.autoMatch !== false ||
    capitalRequest.autoAccept !== false ||
    capitalRequest.realPricing !== false ||
    capitalRequest.realFunding !== false ||
    !HASH.test(capitalRequest.requestHash) ||
    !TEMPLATE_LABELS[capitalRequest.templateType] ||
    !STRATEGY_LABELS[capitalRequest.strategyClass] ||
    !safeMatchingObject(
      compatibleMandates,
      "trading_compatible_mandate_list.v1"
    ) ||
    compatibleMandates.tradingCapitalRequestId !==
      capitalRequest.tradingCapitalRequestId ||
    compatibleMandates.requestHash !== capitalRequest.requestHash ||
    compatibleMandates.requestVersion !== capitalRequest.version ||
    compatibleMandates.hardFiltersAppliedBeforeRanking !== true ||
    compatibleMandates.rankingAuthorizing !== false ||
    compatibleMandates.providerIdentityEnumerated !== false ||
    compatibleMandates.crossTenantDiscovery !== false ||
    !Array.isArray(compatibleMandates.matches) ||
    compatibleMandates.compatibleMandateCount !==
      compatibleMandates.matches.length ||
    compatibleMandates.matches.some(
      (match, index) =>
        match?.schemaVersion !== "trading_compatible_mandate.v1" ||
        match.rank !== index + 1 ||
        match.autoAccepted !== false ||
        match.fundsAuthority !== false ||
        !HASH.test(match.mandateHash) ||
        !HASH.test(match.compatibilityHash)
    )
  ) {
    return null;
  }

  if (
    matchProposal !== null &&
    (
      !safeMatchingObject(matchProposal, "trading_match_proposal.v1") ||
      matchProposal.syntheticOnly !== true ||
      matchProposal.capitalRequestId !==
        capitalRequest.tradingCapitalRequestId ||
      matchProposal.requestHash !== capitalRequest.requestHash ||
      matchProposal.requestVersion !== capitalRequest.version ||
      matchProposal.subjectType !== entryMode ||
      matchProposal.termsHash !== capitalRequest.termsBlueprint?.termsHash ||
      matchProposal.immutableTerms !== true ||
      matchProposal.autoAccepted !== false ||
      matchProposal.bilateralAcceptanceRequired !== true ||
      matchProposal.requestAndMandateRevalidationRequired !== true ||
      matchProposal.realPricing !== false ||
      matchProposal.realFunding !== false ||
      !STATUS_LABELS[matchProposal.status] ||
      !HASH.test(matchProposal.proposalHash)
    )
  ) {
    return null;
  }

  const status = matchProposal?.status ?? "not_proposed";
  return deepFreeze({
    entryMode,
    entryLabel: entryMode === "human" ? "Human" : "Agent",
    templateType: capitalRequest.templateType,
    templateLabel: TEMPLATE_LABELS[capitalRequest.templateType],
    strategyClass: capitalRequest.strategyClass,
    strategyLabel: STRATEGY_LABELS[capitalRequest.strategyClass],
    assetId: capitalRequest.assetId,
    requestedAmountMinor: capitalRequest.requestedAmountMinor,
    durationDays: capitalRequest.durationDays,
    evidenceEligibilityClass:
      capitalRequest.evidenceEligibility?.eligibilityClass,
    evidenceAuthorizing:
      capitalRequest.evidenceEligibility?.authorizing,
    compatibleMandateCount: compatibleMandates.compatibleMandateCount,
    matchingOrder: "hard_filters_then_deterministic_ranking",
    proposalStatus: status,
    proposalStatusLabel: STATUS_LABELS[status],
    providerAccepted: matchProposal?.providerAcceptance !== null &&
      matchProposal?.providerAcceptance !== undefined,
    subjectAccepted: matchProposal?.subjectAcceptance !== null &&
      matchProposal?.subjectAcceptance !== undefined,
    exactTermsRequired: true,
    autoAccepted: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    realPricing: false,
    realFunding: false,
    schemaVersion: "trading_capital_matching_presentation.v1"
  });
}
