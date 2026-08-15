import assert from "node:assert/strict";
import test from "node:test";
import {
  createTradingCapitalFacilityPresentation
} from "../src/trading-capital-facility-presentation.js";

function facility() {
  return {
    tradingFacilityId: "trading_facility_tc103",
    obligationId: "obligation_tc103",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    lifecycleStatus: "active",
    riskState: "WARNING",
    riskReasonCodes: ["synthetic_exposure_elevated"],
    syntheticCapitalMinor: "1100000",
    syntheticExposureMinor: "600000",
    syntheticEquityMinor: "500000",
    openOrderCount: 1,
    linkedCanonicalObligation: true,
    secondLedgerCreated: false,
    callerEquityAccepted: false,
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
    schemaVersion: "trading_facility.v1"
  };
}

function orderIntent() {
  return {
    tradingOrderIntentId: "trading_order_intent_tc103",
    facilityId: "trading_facility_tc103",
    direction: "long",
    syntheticNotionalMinor: "600000",
    status: "open",
    serverRiskEvaluated: true,
    rawVenueActionAccepted: false,
    sandboxOnly: true,
    syntheticOnly: true,
    nonRedeemable: true,
    withdrawable: false,
    transferable: false,
    externalSystemQueried: false,
    externalOrderSubmitted: false,
    productionAuthority: false,
    fundsAuthority: false,
    realFunding: false,
    productionFundsMoved: false,
    schemaVersion: "trading_order_intent.v1"
  };
}

test("TC-103 Human and Agent present one shared synthetic Facility contract", () => {
  const human = createTradingCapitalFacilityPresentation({
    entryMode: "human",
    facility: facility(),
    orderIntents: [orderIntent()]
  });
  const agent = createTradingCapitalFacilityPresentation({
    entryMode: "agent",
    facility: facility(),
    orderIntents: [orderIntent()]
  });
  assert.equal(Object.isFrozen(human), true);
  const normalize = ({ entryMode, entryLabel, ...shared }) => shared;
  assert.deepEqual(normalize(human), normalize(agent));
  assert.equal(human.capitalLabel, "Synthetic non-redeemable capital");
  assert.equal(human.newRiskAvailable, true);
  assert.equal(human.settlementAvailable, false);
  assert.equal(human.withdrawalAvailable, false);
  assert.equal(human.externalExecutionAvailable, false);
});

test("TC-103 presentation fails closed on funds, venue, and order drift", () => {
  for (const mutate of [
    (input) => { input.facility.nonRedeemable = false; },
    (input) => { input.facility.withdrawable = true; },
    (input) => { input.facility.externalOrderSubmitted = true; },
    (input) => { input.facility.secondLedgerCreated = true; },
    (input) => { input.orderIntents[0].externalOrderSubmitted = true; },
    (input) => { input.orderIntents[0].facilityId = "other_facility"; },
    (input) => { input.facility.openOrderCount = 0; }
  ]) {
    const input = {
      entryMode: "human",
      facility: facility(),
      orderIntents: [orderIntent()]
    };
    mutate(input);
    assert.equal(createTradingCapitalFacilityPresentation(input), null);
  }
});

test("TC-103 REDUCE_ONLY presentation cannot advertise new risk", () => {
  const current = facility();
  current.riskState = "REDUCE_ONLY";
  const view = createTradingCapitalFacilityPresentation({
    entryMode: "agent",
    facility: current,
    orderIntents: [orderIntent()]
  });
  assert.equal(view.newRiskAvailable, false);
  assert.equal(view.cancelOpenIntentAvailable, true);
  assert.equal(view.protectiveFlattenAvailable, true);
});
