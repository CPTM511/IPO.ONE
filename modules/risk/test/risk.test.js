import assert from "node:assert/strict";
import test from "node:test";
import { LockboxStatus, PrincipalStatus } from "../../../packages/domain/src/index.js";
import { EventStore } from "../../event-audit/src/index.js";
import { RiskService } from "../src/index.js";

test("risk service approves deterministic explainable limit", () => {
  const service = new RiskService({ eventStore: new EventStore(), globalSubjectCapMinor: "1000" });
  const result = service.requestCreditLine({
    subjectId: "subject_1",
    assetId: "usdc",
    inputs: {
      lockboxStatus: LockboxStatus.ACTIVE,
      principalStatus: PrincipalStatus.ACTIVE,
      allowlistedProviderCount: 1,
      capturedRevenue30dMinor: "1000",
      capturedRevenue7dMinor: "400",
      existingOutstandingMinor: "0",
      perChainCapRemainingMinor: "1000",
      providerCapRemainingMinor: "1000"
    }
  });

  assert.equal(result.decision.status, "approved");
  assert.equal(result.creditLine.limitMinor, "300");
});

test("risk service freezes when overdue exists", () => {
  const service = new RiskService({ eventStore: new EventStore() });
  const result = service.requestCreditLine({
    subjectId: "subject_1",
    assetId: "usdc",
    inputs: {
      lockboxStatus: LockboxStatus.ACTIVE,
      principalStatus: PrincipalStatus.ACTIVE,
      allowlistedProviderCount: 1,
      capturedRevenue30dMinor: "1000",
      capturedRevenue7dMinor: "400",
      overdueCount: 1
    }
  });

  assert.equal(result.decision.status, "frozen");
  assert.equal(result.decision.action, "freeze_lockbox");
  assert.equal(result.creditLine, undefined);
});
