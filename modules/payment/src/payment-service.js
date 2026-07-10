import { randomUUID } from "node:crypto";
import { CreditEventType, SpendRequestStatus, createCreditEvent, hashId } from "../../../packages/domain/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

export class PaymentService {
  constructor({ eventStore }) {
    this.eventStore = eventStore;
    this.instructions = new Map();
  }

  prepareProviderPayment({ spendRequest, providerSettlementAccountId }) {
    if (spendRequest.status !== SpendRequestStatus.APPROVED) {
      throw new DomainError("spend_request_not_approved", "only approved spend requests can become payment instructions", {
        spendRequestId: spendRequest.spendRequestId
      });
    }

    const instruction = {
      paymentInstructionId: `payment_${randomUUID()}`,
      spendRequestId: spendRequest.spendRequestId,
      subjectId: spendRequest.subjectId,
      providerId: spendRequest.providerId,
      providerSettlementAccountIdRef: providerSettlementAccountId,
      assetId: spendRequest.assetId,
      amountMinor: spendRequest.amountMinor,
      instructionHash: hashId("payment_instruction", {
        spendRequestId: spendRequest.spendRequestId,
        providerSettlementAccountId,
        amountMinor: spendRequest.amountMinor
      }),
      status: "prepared",
      productionFundsMoved: false,
      createdAt: new Date().toISOString(),
      schemaVersion: "payment_instruction.v1"
    };
    this.instructions.set(instruction.paymentInstructionId, instruction);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.PAYMENT_INSTRUCTION_CREATED,
        subjectId: instruction.subjectId,
        payload: instruction
      })
    );
    return structuredClone(instruction);
  }
}
