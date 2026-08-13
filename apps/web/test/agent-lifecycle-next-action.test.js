import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveAgentLifecycleNextAction,
  isAgentRuntimeStage,
  selectExactAgentContinuation
} from "../src/agent-lifecycle-next-action.js";

const exactMandate = Object.freeze({
  mandateId: "mandate_agent_recovery_0001",
  subjectId: "subject_agent_recovery_0001"
});

function exactContinuation(overrides = {}) {
  const creditOfferId = "credit_offer_agent_recovery_0001";
  const creditOfferHash = `0x${"a".repeat(64)}`;
  return {
    continuationReceiptId: "continuation_agent_recovery_0001",
    receiptHash: `0x${"b".repeat(64)}`,
    subjectId: exactMandate.subjectId,
    mandateId: exactMandate.mandateId,
    creditOfferId,
    creditOfferHash,
    offerAggregateVersion: 1,
    expiresAt: "2026-08-13T00:00:00.000Z",
    receipt: {
      subjectId: exactMandate.subjectId,
      mandateId: exactMandate.mandateId,
      offer: { creditOfferId, creditOfferHash }
    },
    serverTruth: true,
    schemaVersion: "workspace_continuation_receipt_view.v1",
    ...overrides
  };
}

test("draft lifecycle gates identity, application, and exact activation review", () => {
  assert.equal(deriveAgentLifecycleNextAction({
    applicationEligible: false,
    mandateStatus: "draft"
  }), "identity");
  assert.equal(deriveAgentLifecycleNextAction({
    applicationEligible: true,
    mandateStatus: "draft",
    offerPresent: false
  }), "application");
  assert.equal(deriveAgentLifecycleNextAction({
    applicationEligible: true,
    mandateStatus: "draft",
    offerPresent: true
  }), "principal_activation");
});

test("active lifecycle gives an exact recovered Obligation precedence over a missing Offer", () => {
  assert.equal(deriveAgentLifecycleNextAction({
    executionCompleted: false,
    mandateStatus: "active",
    obligationPresent: true,
    offerPresent: false,
    outstandingMinor: "10000"
  }), "runtime_execute");
  assert.equal(deriveAgentLifecycleNextAction({
    executionCompleted: true,
    mandateStatus: "active",
    obligationPresent: true,
    offerPresent: false,
    outstandingMinor: "10000"
  }), "runtime_repay");
  assert.equal(deriveAgentLifecycleNextAction({
    evidenceLatestProven: false,
    executionCompleted: true,
    mandateStatus: "active",
    obligationPresent: true,
    offerPresent: false,
    outstandingMinor: "0"
  }), "runtime_evidence");
  assert.equal(deriveAgentLifecycleNextAction({
    evidenceLatestProven: true,
    executionCompleted: true,
    mandateStatus: "active",
    obligationPresent: true,
    offerPresent: false,
    outstandingMinor: "0"
  }), "runtime_complete");
});

test("active lifecycle exposes one read-only recovery action instead of a disabled replacement", () => {
  assert.equal(deriveAgentLifecycleNextAction({
    mandateStatus: "active",
    obligationPresent: false,
    offerPresent: false
  }), "active_recovery");
  assert.equal(deriveAgentLifecycleNextAction({
    mandateStatus: "active",
    obligationPresent: false,
    offerPresent: true
  }), "runtime_accept");
});

test("only Obligation-backed stages are classified as runtime lifecycle stages", () => {
  for (const stage of [
    "runtime_execute",
    "runtime_repay",
    "runtime_evidence",
    "runtime_complete"
  ]) assert.equal(isAgentRuntimeStage(stage), true);
  for (const stage of [
    "application",
    "principal_activation",
    "runtime_accept",
    "active_recovery"
  ]) assert.equal(isAgentRuntimeStage(stage), false);
});

test("exact durable continuation accepts its separate server aggregate version", () => {
  const continuation = exactContinuation();
  const recovery = {
    workspaceKind: "principal_controller",
    continuationReceipts: [continuation],
    serverTruth: true
  };
  assert.equal(selectExactAgentContinuation({
    mandate: exactMandate,
    recovery,
    now: new Date("2026-08-12T00:00:00.000Z")
  }), continuation);
  assert.equal(
    Object.hasOwn(continuation.receipt.offer, "aggregateVersion"),
    false
  );
});

test("durable continuation fails closed on duplicate, expiry, version, and binding drift", () => {
  const base = {
    workspaceKind: "principal_controller",
    serverTruth: true
  };
  const select = (continuationReceipts) => selectExactAgentContinuation({
    mandate: exactMandate,
    recovery: { ...base, continuationReceipts },
    now: new Date("2026-08-12T00:00:00.000Z")
  });
  assert.equal(select([]), null);
  assert.equal(select([exactContinuation(), exactContinuation({
    continuationReceiptId: "continuation_agent_recovery_0002"
  })]), null);
  assert.equal(select([exactContinuation({
    expiresAt: "2026-08-12T00:00:00.000Z"
  })]), null);
  assert.equal(select([exactContinuation({ offerAggregateVersion: 0 })]), null);
  assert.equal(select([exactContinuation({ mandateId: "mandate_other" })]), null);
  const receiptMismatch = exactContinuation();
  receiptMismatch.receipt = {
    ...receiptMismatch.receipt,
    offer: {
      ...receiptMismatch.receipt.offer,
      creditOfferHash: `0x${"c".repeat(64)}`
    }
  };
  assert.equal(select([receiptMismatch]), null);
});
