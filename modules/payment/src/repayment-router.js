import { CreditEventType, createCreditEvent } from "../../../packages/domain/src/index.js";

export class RepaymentRouter {
  constructor({ eventStore, obligationService, lockboxService, riskService }) {
    this.eventStore = eventStore;
    this.obligationService = obligationService;
    this.lockboxService = lockboxService;
    this.riskService = riskService;
  }

  applyLockboxRevenue({ lockboxId, obligationIds, creditLineId, amountMinor }) {
    let remaining = BigInt(amountMinor);
    const repayments = [];

    for (const obligationId of obligationIds) {
      if (remaining <= 0n) break;
      const obligation = this.obligationService.getObligation(obligationId);
      if (!["active", "partially_repaid", "overdue"].includes(obligation.status)) continue;

      const before = remaining;
      const result = this.obligationService.applyRepayment({
        obligationId,
        amountMinor: remaining.toString()
      });
      const applied = before - BigInt(result.surplusMinor);
      if (applied > 0n) {
        this.lockboxService.reduceBalance({ lockboxId, amountMinor: applied.toString() });
        if (creditLineId) this.riskService.releaseUtilization({ creditLineId, amountMinor: applied.toString() });
        repayments.push(result.repayment);
      }
      remaining = BigInt(result.surplusMinor);
    }

    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.REPAYMENT_CAPTURED,
        subjectId: repayments[0]?.subjectId,
        payload: {
          lockboxId,
          appliedCount: repayments.length,
          inputAmountMinor: amountMinor,
          surplusMinor: remaining.toString()
        }
      })
    );

    return { repayments, surplusMinor: remaining.toString() };
  }
}
