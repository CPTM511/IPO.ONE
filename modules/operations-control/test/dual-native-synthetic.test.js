import test from "node:test";
import assert from "node:assert/strict";
import agentOfferFixtures from "../../../api/tenant-protocol/conformance/agent-credit-offer-workflow-receipt.v1.fixtures.json" with { type: "json" };
import agentObligationFixtures from "../../../api/tenant-protocol/conformance/agent-sandbox-obligation-workflow-receipt.v1.fixtures.json" with { type: "json" };
import humanOfferFixtures from "../../../api/tenant-protocol/conformance/human-credit-offer-workflow-receipt.v1.fixtures.json" with { type: "json" };
import humanObligationFixtures from "../../../api/tenant-protocol/conformance/human-sandbox-obligation-workflow-receipt.v1.fixtures.json" with { type: "json" };
import { hashId } from "../../../packages/domain/src/index.js";
import {
  DualNativeLifecycleSyntheticRunner,
  DualNativeSyntheticStage,
  OperationalSignalType,
  assertDualNativeLifecycleSyntheticResult,
  createPrivatePilotOperationalSourceBoundary,
  signalFromSyntheticLifecycleResult
} from "../src/index.js";

const RELEASE = "a".repeat(40);
const TENANT_REF_HASH = hashId("test_synthetic_tenant", { tenant: "private-pilot" });
const HUMAN_OBLIGATION = humanObligationFixtures.valid[0];
const AGENT_OBLIGATION = agentObligationFixtures.valid[0];

function linkedOffer(offerFixture, obligation) {
  const receipt = structuredClone(offerFixture);
  receipt.subjectId = obligation.subjectId;
  receipt.creditIntent.creditIntentId = obligation.creditIntentId;
  receipt.offer.creditOfferId = obligation.creditOfferId;
  receipt.offer.creditOfferHash = obligation.acceptance.creditOfferHash;
  receipt.offer.termsHash = obligation.acceptance.termsHash;
  return receipt;
}

const HUMAN_OFFER = linkedOffer(humanOfferFixtures.valid[0], HUMAN_OBLIGATION);
const AGENT_OFFER = linkedOffer(agentOfferFixtures.valid[0], AGENT_OBLIGATION);

function clock(...values) {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}

function reconciliation(overrides = {}) {
  return {
    runId: "reconciliation_run_synthetic_0001",
    scope: "full",
    status: "passed",
    checkCount: 11,
    discrepancyCount: 0,
    criticalCount: 0,
    truncated: false,
    release: RELEASE,
    startedAt: "2026-07-17T09:00:01.000Z",
    completedAt: "2026-07-17T09:00:02.000Z",
    schemaVersion: "reconciliation_summary.v1",
    ...overrides
  };
}

function runner(overrides = {}) {
  return new DualNativeLifecycleSyntheticRunner({
    tenantRefHash: TENANT_REF_HASH,
    clock: clock("2026-07-17T09:00:00.000Z", "2026-07-17T09:00:03.000Z"),
    runHumanOffer: async () => structuredClone(HUMAN_OFFER),
    runAgentOffer: async () => structuredClone(AGENT_OFFER),
    runHumanObligation: async () => structuredClone(HUMAN_OBLIGATION),
    runAgentObligation: async () => structuredClone(AGENT_OBLIGATION),
    runReconciliation: async () => reconciliation(),
    ...overrides
  });
}

test("dual-native synthetic passes only after exact Human, Agent, parity, linkage, and reconciliation evidence", async () => {
  const result = await runner().run({
    checkId: "closed-pilot-dual-native-lifecycle",
    release: RELEASE
  });

  assertDualNativeLifecycleSyntheticResult(result);
  assert.equal(result.status, "passed");
  assert.deepEqual(result.completedStages, Object.values(DualNativeSyntheticStage));
  assert.equal(result.evidenceRefs.length, 8);
  assert.match(result.reconciliationSummaryHash, /^0x[0-9a-f]{64}$/);
  assert.equal(result.notificationDelivered, false);
  assert.equal(signalFromSyntheticLifecycleResult(result, {
    boundary: createPrivatePilotOperationalSourceBoundary()
  }), undefined);
  const serialized = JSON.stringify(result);
  for (const prohibited of [
    HUMAN_OFFER.subjectId,
    AGENT_OFFER.subjectId,
    HUMAN_OBLIGATION.obligation.obligationId,
    AGENT_OBLIGATION.obligation.obligationId,
    "creditIntent",
    "repayment"
  ]) assert.equal(serialized.includes(prohibited), false);
});

test("failed executor returns a redacted stable stage result and an operational signal", async () => {
  const result = await runner({
    runAgentObligation: async () => {
      throw Object.assign(new Error("borrower@example.invalid private failure"), {
        code: "provider_timeout"
      });
    }
  }).run({ checkId: "closed-pilot-dual-native-failure", release: RELEASE });

  assertDualNativeLifecycleSyntheticResult(result);
  assert.equal(result.status, "failed");
  assert.equal(result.failureStage, DualNativeSyntheticStage.AGENT_OBLIGATION);
  assert.equal(result.failureCode, "provider_timeout");
  assert.deepEqual(result.completedStages, [
    DualNativeSyntheticStage.HUMAN_OFFER,
    DualNativeSyntheticStage.AGENT_OFFER,
    DualNativeSyntheticStage.OFFER_PARITY,
    DualNativeSyntheticStage.HUMAN_OBLIGATION
  ]);
  assert.equal(JSON.stringify(result).includes("borrower@example.invalid"), false);
  const signal = signalFromSyntheticLifecycleResult(result, {
    boundary: createPrivatePilotOperationalSourceBoundary()
  });
  assert.equal(signal.signalType, OperationalSignalType.SYNTHETIC_LIFECYCLE_FAILED);
  assert.match(signal.sourceRefHash, /^0x[0-9a-f]{64}$/);
});

test("valid but cross-workflow mismatched receipts fail at the explicit linkage gate", async () => {
  const mismatched = structuredClone(HUMAN_OFFER);
  mismatched.subjectId = "subject_human_other_valid_shape";
  const result = await runner({ runHumanOffer: async () => mismatched }).run({
    checkId: "closed-pilot-linkage-failure",
    release: RELEASE
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failureStage, DualNativeSyntheticStage.RECEIPT_LINKAGE);
  assert.equal(result.failureCode, "synthetic_receipt_linkage_failed");
});

test("reconciliation discrepancy fails the final stage and result mutation is rejected", async () => {
  const result = await runner({
    runReconciliation: async () => reconciliation({
      status: "failed",
      discrepancyCount: 1,
      criticalCount: 1
    })
  }).run({ checkId: "closed-pilot-reconciliation-failure", release: RELEASE });
  assert.equal(result.status, "failed");
  assert.equal(result.failureStage, DualNativeSyntheticStage.RECONCILIATION);
  assert.equal(result.failureCode, "synthetic_reconciliation_failed");
  assert.throws(
    () => assertDualNativeLifecycleSyntheticResult({ ...result, notificationDelivered: true }),
    { name: "DomainError", code: "invalid_dual_native_synthetic_result" }
  );
});

test("runner rejects ambiguous configuration and non-immutable releases", async () => {
  assert.throws(
    () => new DualNativeLifecycleSyntheticRunner({ tenantRefHash: TENANT_REF_HASH }),
    { name: "DomainError", code: "invalid_dual_native_synthetic_config" }
  );
  await assert.rejects(
    () => runner().run({ checkId: "closed-pilot-check", release: "main" }),
    { name: "DomainError", code: "invalid_dual_native_synthetic_input" }
  );
});
