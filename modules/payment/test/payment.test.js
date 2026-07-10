import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../../event-audit/src/index.js";
import { PaymentService, RepaymentRouter } from "../src/index.js";

test("payment service creates instructions without moving production funds", () => {
  const service = new PaymentService({ eventStore: new EventStore() });
  const instruction = service.prepareProviderPayment({
    spendRequest: {
      spendRequestId: "spend_1",
      subjectId: "subject_1",
      providerId: "provider_1",
      assetId: "usdc",
      amountMinor: "25",
      status: "approved"
    },
    providerSettlementAccountId: "eip155:8453:0x3333333333333333333333333333333333333333"
  });

  assert.equal(instruction.status, "prepared");
  assert.equal(instruction.productionFundsMoved, false);
});

test("repayment router allocates revenue through public service interfaces", () => {
  const calls = [];
  const router = new RepaymentRouter({
    eventStore: new EventStore(),
    obligationService: {
      getObligation: () => ({ status: "active" }),
      applyRepayment: ({ amountMinor }) => {
        calls.push(["applyRepayment", amountMinor]);
        return {
          repayment: { repaymentId: "repayment_1", subjectId: "subject_1" },
          surplusMinor: "0"
        };
      }
    },
    lockboxService: {
      reduceBalance: ({ amountMinor }) => calls.push(["reduceBalance", amountMinor])
    },
    riskService: {
      releaseUtilization: ({ amountMinor }) => calls.push(["releaseUtilization", amountMinor])
    }
  });

  const result = router.applyLockboxRevenue({
    lockboxId: "lockbox_1",
    obligationIds: ["obligation_1"],
    creditLineId: "credit_1",
    amountMinor: "20"
  });

  assert.equal(result.surplusMinor, "0");
  assert.deepEqual(calls, [
    ["applyRepayment", "20"],
    ["reduceBalance", "20"],
    ["releaseUtilization", "20"]
  ]);
});
