import assert from "node:assert/strict";
import test from "node:test";
import { runOverdueDefaultRepresentation, runRejectedSpendPath, runVerticalSlice } from "../src/index.js";

test("MVP vertical slice runs agent identity through repayment and admin audit", async () => {
  const { summary } = await runVerticalSlice();

  assert.equal(summary.subject.subjectType, "agent");
  assert.equal(summary.mandate.status, "active");
  assert.equal(summary.spendRequest.status, "settled");
  assert.equal(summary.obligation.status, "fully_repaid");
  assert.equal(summary.obligation.mandateId, summary.mandate.mandateId);
  assert.equal(summary.obligation.outstandingPrincipalMinor, "0");
  assert.equal(summary.creditLine.utilizedMinor, "0");
  assert.equal(summary.paymentInstruction.productionFundsMoved, false);
  assert.equal(summary.transferIntent.status, "settled");
  assert.equal(summary.settlementReceipt.finality, "finalized");
  assert.equal(summary.settlementReceipt.productionFundsMoved, false);
  assert.equal(summary.railReplayProof.replayable, true);
  assert.equal(summary.ledger.integrity.balanced, true);
  assert.equal(summary.ledger.transactionCount, 2);
  assert.ok(summary.evidenceEnvelopeCount > summary.adminTimeline.length);
  assert.equal(BigInt(summary.adminExposure.outstandingMinor), 0n);
  assert.ok(summary.adminTimeline.length >= 10);
});

test("failed spend path rejects non-allowlisted provider", async () => {
  const result = await runRejectedSpendPath();

  assert.equal(result.rejected.status, "rejected");
  assert.equal(result.rejected.rejectionReason, "provider_not_allowlisted");
  assert.ok(result.happyPathEventCount > 0);
});

test("overdue and default states are represented with audit timeline", async () => {
  const result = await runOverdueDefaultRepresentation();

  assert.equal(result.overdue.status, "overdue");
  assert.equal(result.defaulted.status, "defaulted");
  assert.equal(result.timeline.some((event) => event.eventType === "default_recorded"), true);
});
