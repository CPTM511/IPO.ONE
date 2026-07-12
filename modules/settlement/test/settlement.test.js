import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../../event-audit/src/index.js";
import { PaymentService } from "../../payment/src/index.js";
import { RailService, SandboxRailAdapter } from "../../rail/src/index.js";
import { SettlementService } from "../src/index.js";

async function createSettlementFixture() {
  const spendRequest = {
    spendRequestId: "spend_1",
    subjectId: "subject_1",
    mandateId: "mandate_1",
    providerId: "provider_1",
    assetId: "usdc",
    amountMinor: "20",
    purposeCode: "model_api",
    status: "approved"
  };
  const provider = {
    providerId: "provider_1",
    settlementAccountIdRef: "eip155:8453:0x3333333333333333333333333333333333333333",
    status: "allowlisted"
  };
  const railService = new RailService({
    eventStore: new EventStore(),
    policyDecisionService: {
      getSpendRequest: () => structuredClone(spendRequest),
      getProvider: () => structuredClone(provider)
    },
    authorizationService: { assertAuthorized: () => ({ mandateId: "mandate_1" }) },
    adapters: [new SandboxRailAdapter({ sourceAssets: [{ assetId: "usdc", scale: 2 }] })]
  });
  await new PaymentService({ railService }).prepareProviderPayment({
    spendRequest,
    providerSettlementAccountId: provider.settlementAccountIdRef
  });
  return { railService, service: new SettlementService({ railService }), spendRequest };
}

test("settlement service records and settles provider spend", async () => {
  const { railService, service, spendRequest } = await createSettlementFixture();
  const settlement = await service.recordSettlement({
    spendRequestId: spendRequest.spendRequestId,
    providerId: spendRequest.providerId,
    assetId: spendRequest.assetId,
    amountMinor: spendRequest.amountMinor
  });
  const settled = await service.settle(settlement.settlementId);

  assert.equal(settlement.status, "recorded");
  assert.equal(settled.status, "settled");
  assert.equal(settled.finality, "finalized");
  assert.equal((await railService.getReplayProof(settlement.settlementId)).replayable, true);
  await assert.rejects(() => service.fail(settlement.settlementId, "late failure"), /cannot transition/);
});
