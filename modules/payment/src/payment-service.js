import { DomainError, SpendRequestStatus, createAccountHash, hashId } from "../../../packages/domain/src/index.js";

export class PaymentService {
  constructor({ railService }) {
    if (!railService) throw new DomainError("rail_service_required", "Payment Service requires the Rail Service");
    this.railService = railService;
  }

  async prepareProviderPayment({ spendRequest, providerSettlementAccountId, now = new Date() }) {
    if (spendRequest.status !== SpendRequestStatus.APPROVED) {
      throw new DomainError("spend_request_not_approved", "only approved spend requests can become payment instructions", {
        spendRequestId: spendRequest.spendRequestId
      });
    }
    if (
      createAccountHash(providerSettlementAccountId) !==
      (await this.railService.getProviderSettlementAccountRefHash(spendRequest.spendRequestId))
    ) {
      throw new DomainError(
        "provider_settlement_account_mismatch",
        "payment destination does not match the allowlisted provider account"
      );
    }
    const intentIdempotencyKey = `provider-spend:${spendRequest.spendRequestId}:intent`;
    let intent = await this.railService.createProviderSpendIntent({
      spendRequestId: spendRequest.spendRequestId,
      sourceAccountRefHash: hashId("sandbox_payment_source", {
        subjectId: spendRequest.subjectId,
        spendRequestId: spendRequest.spendRequestId
      }),
      idempotencyKey: intentIdempotencyKey,
      now
    });
    intent = await this.railService.quoteTransfer({
      transferIntentId: intent.transferIntentId,
      idempotencyKey: `provider-spend:${spendRequest.spendRequestId}:quote`,
      expectedVersion: intent.version,
      now
    });
    intent = await this.railService.authorizeTransfer({
      transferIntentId: intent.transferIntentId,
      actorRef: `orchestrator:provider-spend:${spendRequest.subjectId}`,
      idempotencyKey: `provider-spend:${spendRequest.spendRequestId}:authorize`,
      expectedVersion: intent.version,
      now
    });
    return {
      paymentInstructionId: intent.transferIntentId,
      spendRequestId: spendRequest.spendRequestId,
      subjectId: spendRequest.subjectId,
      providerId: spendRequest.providerId,
      providerSettlementAccountIdRef: providerSettlementAccountId,
      providerSettlementAccountRefHash: intent.destinationAccountRefHash,
      assetId: spendRequest.assetId,
      amountMinor: spendRequest.amountMinor,
      instructionHash: intent.transferIntentHash,
      status: "prepared",
      railId: intent.railId,
      railTransferStatus: intent.status,
      productionFundsMoved: false,
      createdAt: intent.createdAt,
      schemaVersion: "payment_instruction.v1",
      protocolSchemaVersion: intent.schemaVersion
    };
  }
}
