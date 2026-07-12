import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../../event-audit/src/index.js";
import { SpendPolicyService } from "../src/index.js";

const authorizationService = {
  assertAuthorized: () => ({ status: "active" }),
  reserveUtilization: () => ({ replayed: false })
};

function createService(overrides = {}) {
  return new SpendPolicyService({ eventStore: new EventStore(), authorizationService, ...overrides });
}

test("spend policy approves allowlisted provider and rejects unknown recipient", () => {
  const service = createService();
  const provider = service.allowProvider({
    name: "Model Provider",
    settlementAccountId: "eip155:8453:0x3333333333333333333333333333333333333333"
  });
  const policy = service.createSpendPolicy({
    subjectId: "subject_1",
    providerId: provider.providerId,
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    perTxLimitMinor: "100",
    dailyLimitMinor: "200",
    obligationCapMinor: "100"
  });

  const approved = service.requestSpend({
    mandateId: "mandate_1",
    subjectId: "subject_1",
    providerId: provider.providerId,
    spendPolicyId: policy.spendPolicyId,
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    amountMinor: "50",
    purposeCode: "model_api",
    creditAvailableMinor: "100"
  });
  const rejected = service.requestSpend({
    mandateId: "mandate_1",
    subjectId: "subject_1",
    providerId: "provider_unknown",
    spendPolicyId: policy.spendPolicyId,
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    amountMinor: "50",
    purposeCode: "model_api",
    creditAvailableMinor: "100"
  });

  assert.equal(approved.status, "approved");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.rejectionReason, "provider_not_allowlisted");
});

test("spend policy rejects a purpose outside the provider policy", () => {
  const service = createService();
  const provider = service.allowProvider({
    name: "Compute Provider",
    settlementAccountId: "eip155:8453:0x3333333333333333333333333333333333333333"
  });
  const policy = service.createSpendPolicy({
    subjectId: "subject_1",
    providerId: provider.providerId,
    assetId: "usdc",
    perTxLimitMinor: "100",
    dailyLimitMinor: "200",
    obligationCapMinor: "100",
    category: "compute"
  });

  const rejected = service.requestSpend({
    mandateId: "mandate_1",
    subjectId: "subject_1",
    providerId: provider.providerId,
    spendPolicyId: policy.spendPolicyId,
    assetId: "usdc",
    amountMinor: "50",
    purposeCode: "data",
    creditAvailableMinor: "100"
  });

  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.rejectionReason, "purpose_not_allowed");
});

test("spend policy fails closed when mandate authorization is unavailable", () => {
  const service = new SpendPolicyService({ eventStore: new EventStore() });
  const provider = service.allowProvider({
    name: "Compute Provider",
    settlementAccountId: "eip155:8453:0x3333333333333333333333333333333333333333"
  });
  const policy = service.createSpendPolicy({
    subjectId: "subject_1",
    providerId: provider.providerId,
    assetId: "usdc",
    perTxLimitMinor: "100",
    dailyLimitMinor: "200",
    obligationCapMinor: "100",
    category: "compute"
  });

  const rejected = service.requestSpend({
    mandateId: "mandate_1",
    subjectId: "subject_1",
    providerId: provider.providerId,
    spendPolicyId: policy.spendPolicyId,
    assetId: "usdc",
    amountMinor: "50",
    purposeCode: "compute",
    creditAvailableMinor: "100"
  });

  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.rejectionReason, "authorization_unavailable");
});
