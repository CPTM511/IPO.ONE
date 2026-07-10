import {
  CreditEventType,
  SettlementStatus,
  SettlementTransitions,
  assertPositiveMinorUnits,
  assertTransition,
  createCreditEvent,
  createSettlement
} from "../../../packages/domain/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

export class SettlementService {
  constructor({ eventStore }) {
    this.eventStore = eventStore;
    this.settlements = new Map();
  }

  recordSettlement(input) {
    assertPositiveMinorUnits(input.amountMinor);
    const settlement = createSettlement(input);
    this.settlements.set(settlement.settlementId, settlement);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.SETTLEMENT_RECORDED,
        payload: settlement
      })
    );
    return structuredClone(settlement);
  }

  settle(settlementId) {
    return this.#setStatus(settlementId, SettlementStatus.SETTLED, "settled");
  }

  fail(settlementId, reason) {
    return this.#setStatus(settlementId, SettlementStatus.FAILED, reason);
  }

  getSettlement(settlementId) {
    return structuredClone(this.#requireSettlement(settlementId));
  }

  #setStatus(settlementId, nextStatus, reason) {
    const settlement = this.#requireSettlement(settlementId);
    assertTransition("settlement", SettlementTransitions, settlement.status, nextStatus);
    const previousStatus = settlement.status;
    settlement.status = nextStatus;
    settlement.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: nextStatus === SettlementStatus.SETTLED ? CreditEventType.SETTLEMENT_COMPLETED : CreditEventType.SETTLEMENT_RECORDED,
        payload: { settlementId, previousStatus, newStatus: nextStatus, reason }
      })
    );
    return structuredClone(settlement);
  }

  #requireSettlement(settlementId) {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) throw new DomainError("settlement_not_found", "settlement not found", { settlementId });
    return settlement;
  }
}
