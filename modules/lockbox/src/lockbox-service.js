import {
  CreditEventType,
  LockboxStatus,
  LockboxTransitions,
  assertCAIP10,
  assertPositiveMinorUnits,
  assertTransition,
  chainIdFromCAIP10,
  createCreditEvent,
  createLockbox
} from "../../../packages/domain/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

export class LockboxService {
  constructor({ eventStore }) {
    this.eventStore = eventStore;
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
          accountRef: accountId
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

  captureRevenue({ lockboxId, amountMinor, source = "provider_sandbox" }) {
    const lockbox = this.#requireLockbox(lockboxId);
    if (lockbox.status !== LockboxStatus.ACTIVE) {
      throw new DomainError("lockbox_not_active", "revenue capture requires active lockbox", { lockboxId });
    }
    const amount = assertPositiveMinorUnits(amountMinor);
    lockbox.balanceMinor = (BigInt(lockbox.balanceMinor) + amount).toString();
    lockbox.capturedRevenueMinor = (BigInt(lockbox.capturedRevenueMinor) + amount).toString();
    lockbox.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.REVENUE_CAPTURED,
        subjectId: lockbox.subjectId,
        chainId: lockbox.chainId,
        payload: { lockboxId, amountMinor, assetId: lockbox.assetId, source }
      })
    );
    return structuredClone(lockbox);
  }

  reduceBalance({ lockboxId, amountMinor }) {
    const lockbox = this.#requireLockbox(lockboxId);
    const amount = assertPositiveMinorUnits(amountMinor);
    if (BigInt(lockbox.balanceMinor) < amount) {
      throw new DomainError("lockbox_insufficient_balance", "lockbox balance is insufficient", { lockboxId });
    }
    lockbox.balanceMinor = (BigInt(lockbox.balanceMinor) - amount).toString();
    lockbox.updatedAt = new Date().toISOString();
    return structuredClone(lockbox);
  }

  getLockbox(lockboxId) {
    return structuredClone(this.#requireLockbox(lockboxId));
  }

  listLockboxes() {
    return [...this.lockboxes.values()].map((lockbox) => structuredClone(lockbox));
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
}
