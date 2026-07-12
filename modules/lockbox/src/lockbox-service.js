import {
  CreditEventType,
  LedgerAccountType,
  LedgerEntryDirection,
  LedgerNormalSide,
  LockboxStatus,
  LockboxTransitions,
  assertCAIP10,
  assertNonEmptyString,
  assertPositiveMinorUnits,
  assertTransition,
  chainIdFromCAIP10,
  createCreditEvent,
  createLockbox,
  createOperationalId
} from "../../../packages/domain/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

export class LockboxService {
  constructor({ eventStore, ledgerService }) {
    this.eventStore = eventStore;
    this.ledgerService = ledgerService;
    this.lockboxes = new Map();
  }

  createLockbox({ subjectId, assetId, accountId }) {
    assertCAIP10(accountId);
    const lockbox = createLockbox({
      subjectId,
      chainId: chainIdFromCAIP10(accountId),
      assetId,
      accountId
    });
    if (!this.ledgerService) {
      throw new DomainError("ledger_unavailable", "lockbox creation requires the ledger service");
    }
    const assetAccount = this.ledgerService.openAccount({
      ownerType: "lockbox",
      ownerId: lockbox.lockboxId,
      assetId,
      accountType: LedgerAccountType.LOCKBOX_ASSET,
      normalSide: LedgerNormalSide.DEBIT,
      subjectId
    });
    const revenueAccount = this.ledgerService.openAccount({
      ownerType: "system",
      ownerId: "external_revenue",
      assetId,
      accountType: LedgerAccountType.EXTERNAL_REVENUE,
      normalSide: LedgerNormalSide.CREDIT
    });
    const repaymentAccount = this.ledgerService.openAccount({
      ownerType: "system",
      ownerId: "repayment_clearing",
      assetId,
      accountType: LedgerAccountType.REPAYMENT_CLEARING,
      normalSide: LedgerNormalSide.DEBIT
    });
    lockbox.ledgerAccountId = assetAccount.ledgerAccountId;
    lockbox.revenueLedgerAccountId = revenueAccount.ledgerAccountId;
    lockbox.repaymentLedgerAccountId = repaymentAccount.ledgerAccountId;
    this.lockboxes.set(lockbox.lockboxId, lockbox);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.LOCKBOX_CREATED,
        subjectId,
        chainId: lockbox.chainId,
        payload: {
          lockboxId: lockbox.lockboxId,
          lockboxHash: lockbox.lockboxHash,
          assetId,
          accountRef: accountId,
          ledgerAccountId: lockbox.ledgerAccountId
        }
      })
    );
    return structuredClone(lockbox);
  }

  activateLockbox(lockboxId) {
    return this.#setStatus(lockboxId, LockboxStatus.ACTIVE, "activate");
  }

  freezeLockbox(lockboxId, reason) {
    return this.#setStatus(lockboxId, LockboxStatus.FROZEN, reason);
  }

  closeLockbox(lockboxId, reason) {
    return this.#setStatus(lockboxId, LockboxStatus.CLOSED, reason);
  }

  captureRevenue({
    lockboxId,
    amountMinor,
    source = "provider_sandbox",
    idempotencyKey = createOperationalId("revenue_capture")
  }) {
    const lockbox = this.#requireLockbox(lockboxId);
    if (lockbox.status !== LockboxStatus.ACTIVE) {
      throw new DomainError("lockbox_not_active", "revenue capture requires active lockbox", { lockboxId });
    }
    const amount = assertPositiveMinorUnits(amountMinor);
    assertNonEmptyString("source", source);
    const posting = this.ledgerService.postTransaction({
      idempotencyKey,
      transactionType: "lockbox_revenue_capture",
      assetId: lockbox.assetId,
      referenceType: "lockbox",
      referenceId: lockboxId,
      subjectId: lockbox.subjectId,
      metadata: { source },
      entries: [
        {
          ledgerAccountId: lockbox.ledgerAccountId,
          direction: LedgerEntryDirection.DEBIT,
          amountMinor: amount.toString()
        },
        {
          ledgerAccountId: lockbox.revenueLedgerAccountId,
          direction: LedgerEntryDirection.CREDIT,
          amountMinor: amount.toString()
        }
      ]
    });
    this.#syncFromLedger(lockbox);
    lockbox.updatedAt = new Date().toISOString();
    if (!posting.replayed) {
      this.eventStore.appendCreditEvent(
        createCreditEvent({
          eventType: CreditEventType.REVENUE_CAPTURED,
          subjectId: lockbox.subjectId,
          chainId: lockbox.chainId,
          payload: {
            lockboxId,
            amountMinor: amount.toString(),
            assetId: lockbox.assetId,
            source,
            ledgerTransactionId: posting.transaction.ledgerTransactionId
          }
        })
      );
    }
    return structuredClone(lockbox);
  }

  reduceBalance({
    lockboxId,
    amountMinor,
    reason = "repayment",
    idempotencyKey = createOperationalId("lockbox_debit")
  }) {
    const lockbox = this.#requireLockbox(lockboxId);
    if (lockbox.status === LockboxStatus.CLOSED) {
      throw new DomainError("lockbox_closed", "closed lockbox balance cannot change", { lockboxId });
    }
    const amount = assertPositiveMinorUnits(amountMinor);
    assertNonEmptyString("reason", reason);
    this.#syncFromLedger(lockbox);
    if (BigInt(lockbox.balanceMinor) < amount) {
      throw new DomainError("lockbox_insufficient_balance", "lockbox balance is insufficient", { lockboxId });
    }
    const posting = this.ledgerService.postTransaction({
      idempotencyKey,
      transactionType: "lockbox_repayment_debit",
      assetId: lockbox.assetId,
      referenceType: "lockbox",
      referenceId: lockboxId,
      subjectId: lockbox.subjectId,
      metadata: { reason },
      entries: [
        {
          ledgerAccountId: lockbox.repaymentLedgerAccountId,
          direction: LedgerEntryDirection.DEBIT,
          amountMinor: amount.toString()
        },
        {
          ledgerAccountId: lockbox.ledgerAccountId,
          direction: LedgerEntryDirection.CREDIT,
          amountMinor: amount.toString()
        }
      ]
    });
    this.#syncFromLedger(lockbox);
    lockbox.updatedAt = new Date().toISOString();
    if (!posting.replayed) {
      this.eventStore.appendCreditEvent(
        createCreditEvent({
          eventType: CreditEventType.LOCKBOX_BALANCE_DEBITED,
          subjectId: lockbox.subjectId,
          chainId: lockbox.chainId,
          payload: {
            lockboxId,
            assetId: lockbox.assetId,
            amountMinor: amount.toString(),
            balanceMinor: lockbox.balanceMinor,
            reason,
            ledgerTransactionId: posting.transaction.ledgerTransactionId
          }
        })
      );
    }
    return structuredClone(lockbox);
  }

  getLockbox(lockboxId) {
    const lockbox = this.#requireLockbox(lockboxId);
    this.#syncFromLedger(lockbox);
    return structuredClone(lockbox);
  }

  listLockboxes() {
    return [...this.lockboxes.values()].map((lockbox) => {
      this.#syncFromLedger(lockbox);
      return structuredClone(lockbox);
    });
  }

  #setStatus(lockboxId, nextStatus, reason) {
    const lockbox = this.#requireLockbox(lockboxId);
    assertTransition("lockbox", LockboxTransitions, lockbox.status, nextStatus);
    const previousStatus = lockbox.status;
    lockbox.status = nextStatus;
    lockbox.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.LOCKBOX_STATUS_CHANGED,
        subjectId: lockbox.subjectId,
        payload: { lockboxId, previousStatus, newStatus: nextStatus, reason }
      })
    );
    return structuredClone(lockbox);
  }

  #requireLockbox(lockboxId) {
    const lockbox = this.lockboxes.get(lockboxId);
    if (!lockbox) throw new DomainError("lockbox_not_found", "lockbox not found", { lockboxId });
    return lockbox;
  }

  #syncFromLedger(lockbox) {
    lockbox.balanceMinor = this.ledgerService.getAccountBalance(lockbox.ledgerAccountId);
    lockbox.capturedRevenueMinor = this.ledgerService.getAccountTurnover(
      lockbox.ledgerAccountId,
      LedgerEntryDirection.DEBIT
    );
  }
}
