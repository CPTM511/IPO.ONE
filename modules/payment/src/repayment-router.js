import {
  CreditEventType,
  DomainError,
  LockboxStatus,
  assertNonEmptyString,
  assertPositiveMinorUnits,
  createCreditEvent,
  createOperationalId,
  hashId
} from "../../../packages/domain/src/index.js";

export class RepaymentRouter {
  constructor({ eventStore, obligationService, lockboxService, riskService }) {
    this.eventStore = eventStore;
    this.obligationService = obligationService;
    this.lockboxService = lockboxService;
    this.riskService = riskService;
    this.routesByIdempotencyKey = new Map();
  }

  applyLockboxRevenue({
    lockboxId,
    obligationIds,
    creditLineId,
    amountMinor,
    idempotencyKey = createOperationalId("repayment_route")
  }) {
    const amount = assertPositiveMinorUnits(amountMinor);
    assertNonEmptyString("idempotencyKey", idempotencyKey);
    const routeHash = hashId("repayment_route", {
      lockboxId,
      obligationIds,
      creditLineId: creditLineId ?? null,
      amountMinor: amount.toString()
    });
    const existing = this.routesByIdempotencyKey.get(idempotencyKey);
    if (existing) {
      if (existing.routeHash !== routeHash) {
        throw new DomainError("repayment_idempotency_conflict", "repayment idempotency key was reused with different input", {
          idempotencyKey
        });
      }
      return { ...structuredClone(existing.result), replayed: true };
    }
    const lockbox = this.lockboxService.getLockbox(lockboxId);
    if (![LockboxStatus.ACTIVE, LockboxStatus.FROZEN].includes(lockbox.status)) {
      throw new DomainError("lockbox_not_repayable", "lockbox must be active or frozen to route repayments", {
        lockboxId,
        status: lockbox.status
      });
    }
    if (amount > BigInt(lockbox.balanceMinor)) {
      throw new DomainError("lockbox_insufficient_balance", "repayment amount exceeds lockbox balance", {
        lockboxId,
        amountMinor: amount.toString(),
        balanceMinor: lockbox.balanceMinor
      });
    }

    const uniqueObligationIds = [...new Set(obligationIds)];
    if (uniqueObligationIds.length !== obligationIds.length) {
      throw new DomainError("duplicate_obligation", "repayment routing cannot include duplicate obligations", {
        lockboxId
      });
    }

    const candidates = uniqueObligationIds
      .map((obligationId) => this.obligationService.getObligation(obligationId))
      .filter((obligation) => ["active", "partially_repaid", "overdue"].includes(obligation.status));

    for (const obligation of candidates) {
      if (obligation.subjectId !== lockbox.subjectId || obligation.assetId !== lockbox.assetId) {
        throw new DomainError("repayment_scope_mismatch", "lockbox and obligation subject or asset do not match", {
          lockboxId,
          obligationId: obligation.obligationId
        });
      }
    }
    candidates.sort(
      (left, right) =>
        left.repaymentPriority - right.repaymentPriority ||
        left.dueAt.localeCompare(right.dueAt) ||
        left.obligationId.localeCompare(right.obligationId)
    );

    let previewRemaining = amount;
    let totalApplied = 0n;
    for (const obligation of candidates) {
      if (previewRemaining <= 0n) break;
      const applied =
        previewRemaining > BigInt(obligation.outstandingPrincipalMinor)
          ? BigInt(obligation.outstandingPrincipalMinor)
          : previewRemaining;
      previewRemaining -= applied;
      totalApplied += applied;
    }

    if (creditLineId && totalApplied > 0n) {
      const creditLine = this.riskService.getCreditLine(creditLineId);
      if (creditLine.subjectId !== lockbox.subjectId || creditLine.assetId !== lockbox.assetId) {
        throw new DomainError("repayment_credit_line_mismatch", "credit line does not match lockbox subject and asset", {
          lockboxId,
          creditLineId
        });
      }
      if (totalApplied > BigInt(creditLine.utilizedMinor)) {
        throw new DomainError("repayment_exceeds_utilization", "repayment exceeds reserved credit utilization", {
          creditLineId,
          totalAppliedMinor: totalApplied.toString(),
          utilizedMinor: creditLine.utilizedMinor
        });
      }
    }

    let remaining = amount;
    const repayments = [];

    for (const obligation of candidates) {
      if (remaining <= 0n) break;
      const before = remaining;
      const result = this.obligationService.applyRepayment({
        obligationId: obligation.obligationId,
        amountMinor: remaining.toString()
      });
      const applied = before - BigInt(result.surplusMinor);
      if (applied > 0n) {
        repayments.push(result.repayment);
      }
      remaining = BigInt(result.surplusMinor);
    }

    if (totalApplied > 0n) {
      this.lockboxService.reduceBalance({
        lockboxId,
        amountMinor: totalApplied.toString(),
        reason: "obligation_repayment",
        idempotencyKey: `repayment_route:${idempotencyKey}`
      });
      if (creditLineId) {
        this.riskService.releaseUtilization({ creditLineId, amountMinor: totalApplied.toString() });
      }
    }

    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.REPAYMENT_ROUTED,
        subjectId: lockbox.subjectId,
        payload: {
          lockboxId,
          idempotencyKey,
          appliedCount: repayments.length,
          inputAmountMinor: amount.toString(),
          appliedMinor: totalApplied.toString(),
          surplusMinor: remaining.toString()
        }
      })
    );

    const result = {
      repayments,
      appliedMinor: totalApplied.toString(),
      surplusMinor: remaining.toString(),
      idempotencyKey
    };
    this.routesByIdempotencyKey.set(idempotencyKey, { routeHash, result: structuredClone(result) });
    return { ...structuredClone(result), replayed: false };
  }
}
