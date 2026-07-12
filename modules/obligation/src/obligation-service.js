import {
  CreditEventType,
  ObligationStatus,
  ObligationTransitions,
  assertDueAt,
  assertNonEmptyString,
  assertPositiveMinorUnits,
  assertTransition,
  createCreditEvent,
  createObligation,
  createRepayment
} from "../../../packages/domain/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

export class ObligationService {
  constructor({ eventStore }) {
    this.eventStore = eventStore;
    this.obligations = new Map();
    this.repayments = new Map();
  }

  createObligation(input) {
    assertNonEmptyString("mandateId", input.mandateId);
    assertPositiveMinorUnits(input.amountMinor);
    assertDueAt(input.dueAt);
    const obligation = createObligation(input);
    this.obligations.set(obligation.obligationId, obligation);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.OBLIGATION_CREATED,
        subjectId: obligation.subjectId,
        obligationId: obligation.obligationId,
        payload: {
          obligationId: obligation.obligationId,
          obligationHash: obligation.obligationHash,
          principalId: obligation.principalId,
          mandateId: obligation.mandateId,
          amountMinor: obligation.principalAmountMinor,
          dueAt: obligation.dueAt
        }
      })
    );
    return structuredClone(obligation);
  }

  activateObligation(obligationId) {
    return this.#setStatus(obligationId, ObligationStatus.ACTIVE, "activate");
  }

  applyRepayment({ obligationId, amountMinor }) {
    const obligation = this.#requireObligation(obligationId);
    const amount = assertPositiveMinorUnits(amountMinor);
    if (![ObligationStatus.ACTIVE, ObligationStatus.PARTIALLY_REPAID, ObligationStatus.OVERDUE].includes(obligation.status)) {
      throw new DomainError("obligation_not_repayable", "obligation is not in a repayable state", {
        obligationId,
        status: obligation.status
      });
    }

    const outstanding = BigInt(obligation.outstandingPrincipalMinor);
    const applied = amount > outstanding ? outstanding : amount;
    const remaining = outstanding - applied;
    const previousStatus = obligation.status;
    const nextStatus = remaining === 0n ? ObligationStatus.FULLY_REPAID : ObligationStatus.PARTIALLY_REPAID;

    if (previousStatus !== nextStatus) {
      assertTransition("obligation", ObligationTransitions, previousStatus, nextStatus);
    }

    obligation.outstandingPrincipalMinor = remaining.toString();
    obligation.repaidAmountMinor = (BigInt(obligation.repaidAmountMinor) + applied).toString();
    obligation.status = nextStatus;
    obligation.updatedAt = new Date().toISOString();

    const repayment = createRepayment({
      obligationId,
      subjectId: obligation.subjectId,
      assetId: obligation.assetId,
      amountMinor: applied.toString(),
      remainingMinor: remaining.toString()
    });
    this.repayments.set(repayment.repaymentId, repayment);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.REPAYMENT_CAPTURED,
        subjectId: obligation.subjectId,
        obligationId,
        payload: repayment
      })
    );
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.OBLIGATION_UPDATED,
        subjectId: obligation.subjectId,
        obligationId,
        payload: {
          obligationId,
          outstandingPrincipalMinor: obligation.outstandingPrincipalMinor,
          repaidAmountMinor: obligation.repaidAmountMinor,
          status: obligation.status
        }
      })
    );
    if (previousStatus !== nextStatus) {
      this.#emitStatusChange(obligation, previousStatus, nextStatus, "repayment");
    }
    return {
      obligation: structuredClone(obligation),
      repayment: structuredClone(repayment),
      surplusMinor: (amount - applied).toString()
    };
  }

  markOverdue(obligationId, reason = "due_date_passed") {
    return this.#setStatus(obligationId, ObligationStatus.OVERDUE, reason);
  }

  markDefault(obligationId, { dpd = 90, reasonCode = "default_threshold_reached" } = {}) {
    const obligation = this.#setStatus(obligationId, ObligationStatus.DEFAULTED, reasonCode);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.DEFAULT_RECORDED,
        subjectId: obligation.subjectId,
        obligationId,
        payload: { obligationId, dpd, reasonCode, amountMinor: obligation.outstandingPrincipalMinor }
      })
    );
    return obligation;
  }

  closeObligation(obligationId, reason = "closed") {
    return this.#setStatus(obligationId, ObligationStatus.CLOSED, reason);
  }

  getObligation(obligationId) {
    return structuredClone(this.#requireObligation(obligationId));
  }

  listObligations(filter = {}) {
    return [...this.obligations.values()]
      .filter((obligation) => Object.entries(filter).every(([key, value]) => value === undefined || obligation[key] === value))
      .map((obligation) => structuredClone(obligation));
  }

  listRepayments(filter = {}) {
    return [...this.repayments.values()]
      .filter((repayment) => Object.entries(filter).every(([key, value]) => value === undefined || repayment[key] === value))
      .map((repayment) => structuredClone(repayment));
  }

  #setStatus(obligationId, nextStatus, reason) {
    const obligation = this.#requireObligation(obligationId);
    assertTransition("obligation", ObligationTransitions, obligation.status, nextStatus);
    const previousStatus = obligation.status;
    obligation.status = nextStatus;
    obligation.updatedAt = new Date().toISOString();
    this.#emitStatusChange(obligation, previousStatus, nextStatus, reason);
    return structuredClone(obligation);
  }

  #emitStatusChange(obligation, previousStatus, nextStatus, reason) {
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.OBLIGATION_STATUS_CHANGED,
        subjectId: obligation.subjectId,
        obligationId: obligation.obligationId,
        payload: { obligationId: obligation.obligationId, previousStatus, newStatus: nextStatus, reason }
      })
    );
  }

  #requireObligation(obligationId) {
    const obligation = this.obligations.get(obligationId);
    if (!obligation) throw new DomainError("obligation_not_found", "obligation not found", { obligationId });
    return obligation;
  }
}
