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

function facilityPresentation(facility) {
  if (
    !facility ||
    facility.schemaVersion !== "facility_view.v1" ||
    facility.sandboxOnly !== true ||
    facility.productionFundsMoved !== false
  ) {
    throw new TypeError("facility must be a no-funds facility_view.v1");
  }
  return Object.freeze({
    facilityId: facility.facilityId,
    obligationId: facility.obligationId,
    status: facility.status,
    servicingClassification: facility.servicingClassification,
    outstandingLabel: formatUsdMinor(facility.outstandingMinor),
    repaidLabel: formatUsdMinor(facility.repaidMinor),
    evidenceLabel:
      `${Number(facility.evidenceCoverage?.finalized ?? 0)} finalized / ` +
      `${Number(facility.evidenceCoverage?.pending ?? 0)} pending`,
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
      ? "No active Facilities"
      : portfolio.facilities.every(
          ({ evidenceCoverage }) => Number(evidenceCoverage?.pending ?? 0) === 0
        )
        ? "Evidence finalized"
        : "Evidence pending",
    facilities: Object.freeze(portfolio.facilities.map(facilityPresentation)),
    asOf: portfolio.asOf
  });
}

export { formatUsdMinor };
