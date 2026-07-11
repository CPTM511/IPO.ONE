import {
  DomainError,
  SettlementFinality,
  SettlementOutcome,
  SettlementStatus,
  assertPositiveMinorUnits,
} from "../../../packages/domain/src/index.js";

export class SettlementService {
  constructor({ railService }) {
    if (!railService) throw new DomainError("rail_service_required", "Settlement Service requires the Rail Service");
    this.railService = railService;
  }

  async recordSettlement(input) {
    assertPositiveMinorUnits(input.amountMinor);
    let intent = await this.railService.findTransferIntentByPolicyDecision(input.spendRequestId);
    if (!intent) {
      throw new DomainError("transfer_intent_not_found", "no transfer intent exists for the spend request", {
        spendRequestId: input.spendRequestId
      });
    }
    if (
      intent.providerId !== input.providerId ||
      intent.sourceMoney.assetId !== input.assetId ||
      intent.sourceMoney.amountMinor !== input.amountMinor
    ) {
      throw new DomainError("settlement_projection_mismatch", "legacy settlement input does not match its transfer intent");
    }
    if (intent.status === "authorized") {
      intent = await this.railService.submitTransfer({
        transferIntentId: intent.transferIntentId,
        idempotencyKey: `provider-spend:${input.spendRequestId}:submit`,
        expectedVersion: intent.version,
        now: input.now ?? new Date()
      });
    } else if (!["submitted", "pending", "settled", "failed", "reversed"].includes(intent.status)) {
      throw new DomainError("transfer_not_submittable", "transfer intent is not authorized for settlement", {
        transferIntentId: intent.transferIntentId,
        status: intent.status
      });
    }
    return this.#project(intent);
  }

  async settle(settlementId) {
    return this.#recordOutcome(settlementId, SettlementOutcome.SUCCEEDED, "settled");
  }

  async fail(settlementId, reason) {
    return this.#recordOutcome(settlementId, SettlementOutcome.FAILED, reason);
  }

  async getSettlement(settlementId) {
    return this.#project(await this.railService.getTransferIntent(settlementId));
  }

  async #recordOutcome(settlementId, outcome, reason) {
    const intent = await this.railService.getTransferIntent(settlementId);
    const updated = await this.railService.simulateSettlement({
      transferIntentId: intent.transferIntentId,
      providerEventId: `${outcome}:${reason}:${intent.transferIntentId}`,
      outcome,
      finality: SettlementFinality.FINALIZED,
      idempotencyKey: `provider-spend:${intent.policyDecisionRef}:receipt:${outcome}`,
      expectedVersion: intent.version
    });
    return this.#project(updated);
  }

  #project(intent) {
    const receipt = intent.settlementReceipts.at(-1);
    const status =
      intent.status === "settled"
        ? SettlementStatus.SETTLED
        : intent.status === "failed"
          ? SettlementStatus.FAILED
          : SettlementStatus.RECORDED;
    return {
      settlementId: intent.transferIntentId,
      spendRequestId: intent.policyDecisionRef,
      providerId: intent.providerId,
      assetId: intent.sourceMoney.assetId,
      amountMinor: intent.sourceMoney.amountMinor,
      status,
      railId: intent.railId,
      railTransferStatus: intent.status,
      settlementReceiptId: receipt?.settlementReceiptId,
      finality: receipt?.finality,
      productionFundsMoved: false,
      createdAt: intent.submission?.submittedAt ?? intent.createdAt,
      updatedAt: intent.updatedAt,
      schemaVersion: "settlement.v1",
      protocolSchemaVersion: receipt?.schemaVersion ?? "settlement_receipt.v2"
    };
  }
}
