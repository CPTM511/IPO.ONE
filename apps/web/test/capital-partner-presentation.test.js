import test from "node:test";
import assert from "node:assert/strict";
import {
  createCapitalPartnerPresentation,
  formatUsdMinor
} from "../src/capital-partner-presentation.js";

test("Capital Partner presentation formats canonical server amounts", () => {
  assert.equal(formatUsdMinor("12000"), "$120.00");
  const result = createCapitalPartnerPresentation({
    capitalPartnerId: "capital_partner_test",
    authoredOfferCount: 1,
    committedMinor: "12000",
    outstandingMinor: "7000",
    repaidMinor: "5000",
    offers: [{}],
    facilities: [{
      facilityId: "facility_test",
      obligationId: "obligation_test",
      status: "active",
      servicingClassification: "current",
      daysPastDue: 0,
      outstandingMinor: "7000",
      repaidMinor: "5000",
      evidenceCoverage: { anchoredEventCount: 4, pendingEventCount: 1, exceptionEventCount: 0, status: "pending" }
    }],
    asOf: "2026-07-30T00:00:00.000Z",
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "capital_partner_portfolio.v1"
  });
  assert.equal(result.committedLabel, "$120.00");
  assert.equal(result.facilities[0].evidenceLabel, "4 anchored / 1 pending");
  assert.equal(result.evidenceStateLabel, "Chain anchoring pending or unavailable");
});

test("Capital Partner presentation rejects production authority", () => {
  assert.throws(() => createCapitalPartnerPresentation({
    schemaVersion: "capital_partner_portfolio.v1",
    sandboxOnly: false,
    productionFundsMoved: true,
    offers: [],
    facilities: []
  }));
});


test("canonical domain portfolio summaries render without full Facility tags and preserve unknown anchoring", async () => {
  const { createCapitalPartnerPortfolio } = await import("../../../packages/domain/src/capital-partner-marketplace.js");
  const facility = {
    schemaVersion: "facility_view.v1", capitalPartnerId: "capital_partner_test", facilityId: "facility_test",
    creditOfferId: "offer_test", obligationId: "obligation_test", subjectId: "subject_test", assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    facilityLimitMinor: "10000", availableMinor: "7000", utilizedMinor: "3000", outstandingMinor: "0", repaidMinor: "3000",
    status: "fully_repaid", servicingClassification: "current", daysPastDue: 0, nextPayment: null,
    evidenceCoverage: { requiredEventCount: 10, anchoredEventCount: 0, pendingEventCount: 10, exceptionEventCount: 0, status: "pending" }
  };
  const portfolio = createCapitalPartnerPortfolio({ capitalPartnerId: facility.capitalPartnerId, offers: [], facilities: [facility], asOf: new Date("2026-09-07T00:00:00Z") });
  assert.equal(portfolio.facilities[0].schemaVersion, undefined);
  const view = createCapitalPartnerPresentation(portfolio);
  assert.equal(view.facilities[0].outstandingLabel, "$0.00");
  assert.equal(view.facilities[0].repaidLabel, "$30.00");
  assert.equal(view.facilities[0].evidenceLabel, "0 anchored / 10 pending");
  const unknown = structuredClone(portfolio); delete unknown.facilities[0].evidenceCoverage;
  assert.equal(createCapitalPartnerPresentation(unknown).facilities[0].evidenceLabel, "Chain anchoring unavailable");
  assert.notEqual(createCapitalPartnerPresentation(unknown).evidenceStateLabel, "Chain anchoring complete");
});
