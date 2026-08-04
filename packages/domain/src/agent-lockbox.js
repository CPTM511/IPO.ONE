import {
  AccountBindingStatus,
  CreditLineStatus,
  LockboxStatus,
  MandateCapability,
  MandateStatus,
  ObligationStatus
} from "./enums.js";
import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import {
  assertNoRawPiiReference,
  assertNonEmptyString
} from "./validators.js";

function invalid(message) {
  throw new DomainError("agent_lockbox_invalid", message);
}

function assertStringFields(fields) {
  for (const [name, value] of Object.entries(fields)) {
    assertNonEmptyString(name, value);
  }
}

export function createAgentLockboxProjection({
  obligation,
  creditIntent,
  mandate,
  accountBinding,
  creditLine,
  accounts,
  now = new Date()
}) {
  if (
    !obligation || obligation.schemaVersion !== "obligation.v2" ||
    obligation.mandateId !== obligation.authorityRef ||
    obligation.sandboxOnly !== true || obligation.productionFundsMoved !== false ||
    obligation.status !== ObligationStatus.ACTIVE || obligation.withdrawable !== false
  ) {
    invalid("an executed Agent Obligation is required");
  }
  if (
    !creditIntent || creditIntent.schemaVersion !== "credit_intent.v1" ||
    creditIntent.creditIntentId !== obligation.creditIntentId ||
    creditIntent.subjectId !== obligation.subjectId ||
    creditIntent.principalId !== obligation.principalId ||
    creditIntent.assetId !== obligation.assetId ||
    creditIntent.sandboxOnly !== true || creditIntent.productionFundsRequested !== false
  ) {
    invalid("Credit Intent provenance does not match the Obligation");
  }
  if (
    !mandate || mandate.schemaVersion !== "mandate.v3" ||
    mandate.mandateId !== obligation.mandateId ||
    mandate.subjectId !== obligation.subjectId ||
    mandate.principalId !== obligation.principalId ||
    mandate.status !== MandateStatus.ACTIVE ||
    mandate.sandboxOnly !== true || mandate.productionAuthority !== false ||
    !mandate.assetIds.includes(obligation.assetId) ||
    !mandate.capabilities.includes(MandateCapability.EXECUTE_SANDBOX_CREDIT)
  ) {
    invalid("the current exact Mandate does not authorize the Lockbox");
  }
  if (
    !accountBinding || accountBinding.schemaVersion !== "account_binding.v2" ||
    accountBinding.subjectId !== obligation.subjectId ||
    accountBinding.status !== AccountBindingStatus.ACTIVE
  ) {
    invalid("an active verified Agent AccountBinding is required");
  }
  if (
    !creditLine || creditLine.schemaVersion !== "credit_line.v1" ||
    creditLine.subjectId !== obligation.subjectId ||
    creditLine.mandateId !== mandate.mandateId ||
    creditLine.assetId !== obligation.assetId ||
    creditLine.status !== CreditLineStatus.APPROVED
  ) {
    invalid("the canonical CreditLine capacity projection is required");
  }
  const principalReceivable = accounts?.principal_receivable;
  const repaymentClearing = accounts?.repayment_clearing;
  if (!principalReceivable || !repaymentClearing) {
    invalid("canonical Obligation Ledger accounts are required");
  }
  assertStringFields({
    accountBindingId: accountBinding.accountBindingId,
    accountIdRef: accountBinding.accountIdRef,
    chainId: accountBinding.chainId,
    creditOfferId: obligation.creditOfferId,
    purposeCode: creditIntent.purposeCode,
    ledgerAccountId: principalReceivable.ledgerAccountId,
    repaymentLedgerAccountId: repaymentClearing.ledgerAccountId
  });
  if (!Array.isArray(mandate.allowedProviderIds)) {
    invalid("the Mandate Provider restriction must be an explicit array");
  }

  const createdAt = now.toISOString();
  const identity = {
    subjectId: obligation.subjectId,
    principalId: obligation.principalId,
    mandateId: mandate.mandateId,
    creditIntentId: obligation.creditIntentId,
    creditOfferId: obligation.creditOfferId,
    obligationId: obligation.obligationId,
    creditLineId: creditLine.creditLineId,
    accountBindingId: accountBinding.accountBindingId,
    chainId: accountBinding.chainId,
    assetId: obligation.assetId,
    accountIdRef: accountBinding.accountIdRef,
    purposeCode: creditIntent.purposeCode,
    allowedProviderIds: [...mandate.allowedProviderIds],
    ledgerAccountId: principalReceivable.ledgerAccountId,
    revenueLedgerAccountId: repaymentClearing.ledgerAccountId,
    repaymentLedgerAccountId: repaymentClearing.ledgerAccountId,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    custodyAuthority: false,
    unrestrictedTransfersAllowed: false
  };
  assertNoRawPiiReference(identity, "agentLockbox");
  const lockboxHash = hashId("agent_lockbox_v2", identity);
  return Object.freeze({
    lockboxId: `lockbox_${hashId("agent_lockbox_id", {
      obligationId: obligation.obligationId
    }).slice(2)}`,
    lockboxHash,
    ...identity,
    status: LockboxStatus.ACTIVE,
    balanceMinor: obligation.outstandingPrincipalMinor,
    capturedRevenueMinor: "0",
    createdAt,
    updatedAt: createdAt,
    schemaVersion: "lockbox.v2"
  });
}

export function updateAgentLockboxAfterRepayment(lockbox, obligation, {
  now = new Date()
} = {}) {
  if (
    !lockbox || lockbox.schemaVersion !== "lockbox.v2" ||
    !obligation || obligation.schemaVersion !== "obligation.v2" ||
    lockbox.obligationId !== obligation.obligationId ||
    lockbox.subjectId !== obligation.subjectId ||
    lockbox.principalId !== obligation.principalId ||
    lockbox.assetId !== obligation.assetId ||
    lockbox.sandboxOnly !== true || lockbox.productionFundsMoved !== false ||
    lockbox.withdrawable !== false || lockbox.custodyAuthority !== false ||
    lockbox.unrestrictedTransfersAllowed !== false
  ) {
    invalid("the durable Lockbox does not match the repaid Obligation");
  }
  if (![LockboxStatus.ACTIVE, LockboxStatus.FROZEN].includes(lockbox.status)) {
    invalid("the durable Lockbox is not repayable");
  }
  const nextStatus = obligation.status === ObligationStatus.FULLY_REPAID
    ? LockboxStatus.CLOSED
    : lockbox.status;
  return Object.freeze({
    ...structuredClone(lockbox),
    status: nextStatus,
    balanceMinor: obligation.outstandingPrincipalMinor,
    updatedAt: now.toISOString()
  });
}
