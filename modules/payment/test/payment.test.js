import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../../event-audit/src/index.js";
import { RailService, SandboxRailAdapter } from "../../rail/src/index.js";
import { PaymentService, RepaymentRouter } from "../src/index.js";

function createPaymentFixture() {
  const spendRequest = {
    spendRequestId: "spend_1",
    subjectId: "subject_1",
    mandateId: "mandate_1",
    providerId: "provider_1",
    assetId: "usdc",
    amountMinor: "25",
    purposeCode: "model_api",
    status: "approved"
  };
  const provider = {
    providerId: "provider_1",
    settlementAccountIdRef: "eip155:8453:0x3333333333333333333333333333333333333333",
    status: "allowlisted"
  };
  const eventStore = new EventStore();
  const railService = new RailService({
    eventStore,
    policyDecisionService: {
      getSpendRequest: () => structuredClone(spendRequest),
      getProvider: () => structuredClone(provider)
    },
    authorizationService: { assertAuthorized: () => ({ mandateId: "mandate_1" }) },
    adapters: [new SandboxRailAdapter({ sourceAssets: [{ assetId: "usdc", scale: 2 }] })]
  });
  return { eventStore, provider, service: new PaymentService({ railService }), spendRequest };
}

test("payment service creates instructions without moving production funds", async () => {
  const { eventStore, provider, service, spendRequest } = createPaymentFixture();
  const instruction = await service.prepareProviderPayment({
    spendRequest,
    providerSettlementAccountId: provider.settlementAccountIdRef
  });

  assert.equal(instruction.status, "prepared");
  assert.equal(instruction.productionFundsMoved, false);
  assert.equal(instruction.railTransferStatus, "authorized");
  assert.equal(eventStore.listCreditEvents().filter((event) => event.eventType.startsWith("transfer_")).length, 3);
});

test("payment service rejects a caller-supplied destination before creating a transfer", async () => {
  const { eventStore, service, spendRequest } = createPaymentFixture();
  await assert.rejects(
    () =>
      service.prepareProviderPayment({
        spendRequest,
        providerSettlementAccountId: "eip155:8453:0x9999999999999999999999999999999999999999"
      }),
    /provider_settlement_account_mismatch/
  );
  assert.equal(eventStore.listCreditEvents().length, 0);
});

test("repayment router allocates revenue through public service interfaces", () => {
  const calls = [];
  const router = new RepaymentRouter({
    eventStore: new EventStore(),
    obligationService: {
      getObligation: () => ({
        obligationId: "obligation_1",
        subjectId: "subject_1",
        assetId: "usdc",
        status: "active",
        repaymentPriority: 1,
        dueAt: "2030-01-01T00:00:00.000Z",
        outstandingPrincipalMinor: "20"
      }),
      applyRepayment: ({ amountMinor }) => {
        calls.push(["applyRepayment", amountMinor]);
        return {
          repayment: { repaymentId: "repayment_1", subjectId: "subject_1" },
          surplusMinor: "0"
        };
      }
    },
    lockboxService: {
      getLockbox: () => ({
        lockboxId: "lockbox_1",
        subjectId: "subject_1",
        assetId: "usdc",
        status: "active",
        balanceMinor: "20"
      }),
      reduceBalance: ({ amountMinor }) => calls.push(["reduceBalance", amountMinor])
    },
    riskService: {
      getCreditLine: () => ({
        creditLineId: "credit_1",
        subjectId: "subject_1",
        assetId: "usdc",
        utilizedMinor: "20"
      }),
      releaseUtilization: ({ amountMinor }) => calls.push(["releaseUtilization", amountMinor])
    }
  });

  const result = router.applyLockboxRevenue({
    lockboxId: "lockbox_1",
    obligationIds: ["obligation_1"],
    creditLineId: "credit_1",
    amountMinor: "20",
    idempotencyKey: "route_1"
  });
  const replay = router.applyLockboxRevenue({
    lockboxId: "lockbox_1",
    obligationIds: ["obligation_1"],
    creditLineId: "credit_1",
    amountMinor: "20",
    idempotencyKey: "route_1"
  });

  assert.equal(result.surplusMinor, "0");
  assert.equal(result.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(calls, [
    ["applyRepayment", "20"],
    ["reduceBalance", "20"],
    ["releaseUtilization", "20"]
  ]);
});

test("repayment router preflights lockbox balance before mutating obligations", () => {
  let obligationMutated = false;
  const router = new RepaymentRouter({
    eventStore: new EventStore(),
    obligationService: {
      getObligation: () => ({
        obligationId: "obligation_1",
        subjectId: "subject_1",
        assetId: "usdc",
        status: "active",
        repaymentPriority: 1,
        dueAt: "2030-01-01T00:00:00.000Z",
        outstandingPrincipalMinor: "100"
      }),
      applyRepayment: () => {
        obligationMutated = true;
      }
    },
    lockboxService: {
      getLockbox: () => ({
        lockboxId: "lockbox_1",
        subjectId: "subject_1",
        assetId: "usdc",
        status: "active",
        balanceMinor: "10"
      })
    },
    riskService: {}
  });

  assert.throws(
    () =>
      router.applyLockboxRevenue({
        lockboxId: "lockbox_1",
        obligationIds: ["obligation_1"],
        amountMinor: "20"
      }),
    /lockbox_insufficient_balance/
  );
  assert.equal(obligationMutated, false);
});
