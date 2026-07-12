import assert from "node:assert/strict";
import test from "node:test";
import { LockboxStatus, PrincipalStatus } from "../../../packages/domain/src/index.js";
import { EventStore } from "../../event-audit/src/index.js";
import { RiskService } from "../src/index.js";

const authorizationService = { assertAuthorized: () => ({ status: "active" }) };

function createRiskService(options = {}) {
  return new RiskService({ eventStore: new EventStore(), authorizationService, ...options });
}

test("risk service approves deterministic explainable limit", () => {
  const service = createRiskService({ globalSubjectCapMinor: "1000" });
  const result = service.requestCreditLine({
    subjectId: "subject_1",
    mandateId: "mandate_1",
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
  assert.equal(result.creditLine.mandateId, "mandate_1");
});

test("risk service freezes when overdue exists", () => {
  const service = createRiskService();
  const result = service.requestCreditLine({
    subjectId: "subject_1",
    mandateId: "mandate_1",
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

test("risk service reuses one line per subject and asset and rejects invalid utilization amounts", () => {
  const service = createRiskService({ globalSubjectCapMinor: "1000" });
  const request = {
    subjectId: "subject_1",
    mandateId: "mandate_1",
    assetId: "usdc",
    inputs: {
      lockboxStatus: LockboxStatus.ACTIVE,
      principalStatus: PrincipalStatus.ACTIVE,
      allowlistedProviderCount: 1,
      capturedRevenue30dMinor: "1000",
      capturedRevenue7dMinor: "400",
      existingOutstandingMinor: "0"
    }
  };

  const first = service.requestCreditLine(request).creditLine;
  const secondResult = service.requestCreditLine(request);
  const second = secondResult.creditLine;

  assert.equal(first.creditLineId, second.creditLineId);
  assert.equal(secondResult.decision.limitMinor, first.limitMinor);
  assert.equal(service.listCreditLines({ subjectId: "subject_1" }).length, 1);
  assert.throws(
    () => service.reserveUtilization({ creditLineId: first.creditLineId, amountMinor: "-1" }),
    /invalid_minor_units/
  );
  service.reserveUtilization({ creditLineId: first.creditLineId, amountMinor: "10" });
  assert.throws(
    () => service.releaseUtilization({ creditLineId: first.creditLineId, amountMinor: "11" }),
    /release_exceeds_utilization/
  );
});

test("risk service fails closed when current mandate authorization is unavailable", () => {
  const service = new RiskService({ eventStore: new EventStore(), globalSubjectCapMinor: "1000" });
  const result = service.requestCreditLine({
    subjectId: "subject_1",
    mandateId: "mandate_1",
    assetId: "usdc",
    inputs: {
      lockboxStatus: LockboxStatus.ACTIVE,
      principalStatus: PrincipalStatus.ACTIVE,
      allowlistedProviderCount: 1,
      capturedRevenue30dMinor: "1000",
      capturedRevenue7dMinor: "400"
    }
  });

  assert.equal(result.creditLine, undefined);
  assert.equal(result.decision.status, "rejected");
  assert.ok(result.decision.reasons.some((reason) => reason.code === "authorization_unavailable"));
});
