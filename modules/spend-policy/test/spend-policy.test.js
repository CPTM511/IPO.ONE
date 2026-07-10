import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../../event-audit/src/index.js";
import { SpendPolicyService } from "../src/index.js";

test("spend policy approves allowlisted provider and rejects unknown recipient", () => {
  const service = new SpendPolicyService({ eventStore: new EventStore() });
  const provider = service.allowProvider({
    name: "Model Provider",
    settlementAccountId: "eip155:8453:0x3333333333333333333333333333333333333333"
  });
  const policy = service.createSpendPolicy({
    subjectId: "subject_1",
    providerId: provider.providerId,
    assetId: "eip155:8453/erc20:usdc",
    perTxLimitMinor: "100",
    dailyLimitMinor: "200",
    obligationCapMinor: "100"
  });

  const approved = service.requestSpend({
    subjectId: "subject_1",
    providerId: provider.providerId,
    spendPolicyId: policy.spendPolicyId,
    assetId: "eip155:8453/erc20:usdc",
    amountMinor: "50",
    purposeCode: "model_api",
    creditAvailableMinor: "100"
  });
  const rejected = service.requestSpend({
    subjectId: "subject_1",
    providerId: "provider_unknown",
    spendPolicyId: policy.spendPolicyId,
    assetId: "eip155:8453/erc20:usdc",
    amountMinor: "50",
    purposeCode: "model_api",
    creditAvailableMinor: "100"
  });

  assert.equal(approved.status, "approved");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.rejectionReason, "provider_not_allowlisted");
});
