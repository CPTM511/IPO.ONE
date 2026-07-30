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
      evidenceCoverage: { finalized: 4, pending: 1 },
      sandboxOnly: true,
      productionFundsMoved: false,
      schemaVersion: "facility_view.v1"
    }],
    asOf: "2026-07-30T00:00:00.000Z",
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "capital_partner_portfolio.v1"
  });
  assert.equal(result.committedLabel, "$120.00");
  assert.equal(result.facilities[0].evidenceLabel, "4 finalized / 1 pending");
  assert.equal(result.evidenceStateLabel, "Evidence pending");
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
