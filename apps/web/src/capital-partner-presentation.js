const MINOR_PATTERN = /^(0|[1-9][0-9]*)$/;

function assertMinor(name, value) {
  if (typeof value !== "string" || !MINOR_PATTERN.test(value)) {
    throw new TypeError(`${name} must be canonical minor units`);
  }
  return value;
}

function formatUsdMinor(value) {
  const amount = BigInt(assertMinor("amount", value));
  const whole = amount / 100n;
  const cents = String(amount % 100n).padStart(2, "0");
  return `$${whole.toLocaleString("en-US")}.${cents}`;
}

function evidenceCoverageLabel(coverage) {
  if (!coverage || !Number.isSafeInteger(coverage.anchoredEventCount) ||
    !Number.isSafeInteger(coverage.pendingEventCount) || coverage.anchoredEventCount < 0 || coverage.pendingEventCount < 0) {
    return "Chain anchoring unavailable";
  }
  return `${coverage.anchoredEventCount} anchored / ${coverage.pendingEventCount} pending` +
    (coverage.exceptionEventCount > 0 ? ` / ${coverage.exceptionEventCount} exceptions` : "");
}

function facilityPresentation(facility) {
  if (
    !facility ||
    typeof facility.facilityId !== "string" ||
    typeof facility.obligationId !== "string" ||
    !Number.isSafeInteger(facility.daysPastDue) || facility.daysPastDue < 0 ||
    (facility.sandboxOnly !== undefined && facility.sandboxOnly !== true) ||
    (facility.productionFundsMoved !== undefined && facility.productionFundsMoved !== false)
  ) {
    throw new TypeError("facility must be a canonical summary inside the no-funds portfolio");
  }
  return Object.freeze({
    facilityId: facility.facilityId,
    obligationId: facility.obligationId,
    status: facility.status,
    servicingClassification: facility.servicingClassification,
    outstandingLabel: formatUsdMinor(facility.outstandingMinor),
    repaidLabel: formatUsdMinor(facility.repaidMinor),
    evidenceLabel: evidenceCoverageLabel(facility.evidenceCoverage),
    adverse:
      facility.daysPastDue > 0 ||
      !new Set(["current", "repaid"]).has(facility.servicingClassification)
  });
}

export function createCapitalPartnerPresentation(portfolio) {
  if (
    !portfolio ||
    portfolio.schemaVersion !== "capital_partner_portfolio.v1" ||
    portfolio.sandboxOnly !== true ||
    portfolio.productionFundsMoved !== false ||
    !Array.isArray(portfolio.offers) ||
    !Array.isArray(portfolio.facilities)
  ) {
    throw new TypeError("portfolio must be a no-funds capital_partner_portfolio.v1");
  }
  return Object.freeze({
    capitalPartnerId: portfolio.capitalPartnerId,
    offerCountLabel: String(portfolio.authoredOfferCount),
    committedLabel: formatUsdMinor(portfolio.committedMinor),
    outstandingLabel: formatUsdMinor(portfolio.outstandingMinor),
    repaidLabel: formatUsdMinor(portfolio.repaidMinor),
    evidenceStateLabel: portfolio.facilities.length === 0
      ? "No recorded Facilities"
      : portfolio.facilities.every(({ evidenceCoverage: coverage }) => coverage?.status === "complete" &&
          Number.isSafeInteger(coverage.requiredEventCount) && coverage.requiredEventCount > 0 &&
          coverage.anchoredEventCount === coverage.requiredEventCount && coverage.pendingEventCount === 0 && coverage.exceptionEventCount === 0)
        ? "Chain anchoring complete"
        : "Chain anchoring pending or unavailable",
    facilities: Object.freeze(portfolio.facilities.map(facilityPresentation)),
    asOf: portfolio.asOf
  });
}

export { formatUsdMinor };
