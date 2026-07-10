import assert from "node:assert/strict";
import test from "node:test";
import { runOverdueDefaultRepresentation, runRejectedSpendPath, runVerticalSlice } from "../src/index.js";

test("MVP vertical slice runs agent identity through repayment and admin audit", () => {
  const { summary } = runVerticalSlice();

  assert.equal(summary.subject.subjectType, "agent");
  assert.equal(summary.spendRequest.status, "settled");
  assert.equal(summary.obligation.status, "fully_repaid");
  assert.equal(summary.obligation.outstandingPrincipalMinor, "0");
  assert.equal(summary.creditLine.utilizedMinor, "0");
  assert.equal(summary.paymentInstruction.productionFundsMoved, false);
  assert.equal(BigInt(summary.adminExposure.outstandingMinor), 0n);
  assert.ok(summary.adminTimeline.length >= 10);
});

test("failed spend path rejects non-allowlisted provider", () => {
  const result = runRejectedSpendPath();

  assert.equal(result.rejected.status, "rejected");
  assert.equal(result.rejected.rejectionReason, "provider_not_allowlisted");
  assert.ok(result.happyPathEventCount > 0);
});

test("overdue and default states are represented with audit timeline", () => {
  const result = runOverdueDefaultRepresentation();

  assert.equal(result.overdue.status, "overdue");
  assert.equal(result.defaulted.status, "defaulted");
  assert.equal(result.timeline.some((event) => event.eventType === "default_recorded"), true);
});
