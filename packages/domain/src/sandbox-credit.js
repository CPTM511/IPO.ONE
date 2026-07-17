import {
  ConsentPurpose,
  ConsentStatus,
  CreditAuthorityType,
  LedgerAccountStatus,
  LedgerAccountType,
  LedgerEntryDirection,
  LedgerNormalSide,
  MandateCapability,
  MandateStatus,
  ObligationExecutionStatus,
  ObligationStatus,
  SandboxRepaymentSource,
  enumValues
} from "./enums.js";
import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import {
  createLedgerEntry,
  createLedgerTransaction
} from "./models.js";
import {
  assertEnumValue,
  assertNoRawPiiReference,
  assertNonEmptyString,
  assertPositiveMinorUnits
} from "./validators.js";
import { applySandboxServicingAfterRepayment } from "./sandbox-servicing.js";

const DAY_MS = 86_400_000;
const ACTUAL_365_DENOMINATOR = 3_650_000n;

const ACCOUNT_SPECS = Object.freeze([
  [LedgerAccountType.SANDBOX_FUNDING_SOURCE, LedgerNormalSide.CREDIT],
  [LedgerAccountType.PRINCIPAL_RECEIVABLE, LedgerNormalSide.DEBIT],
  [LedgerAccountType.INTEREST_RECEIVABLE, LedgerNormalSide.DEBIT],
  [LedgerAccountType.FEE_RECEIVABLE, LedgerNormalSide.DEBIT],
  [LedgerAccountType.SYNTHETIC_INTEREST_INCOME, LedgerNormalSide.CREDIT],
  [LedgerAccountType.SYNTHETIC_FEE_INCOME, LedgerNormalSide.CREDIT],
  [LedgerAccountType.REPAYMENT_CLEARING, LedgerNormalSide.DEBIT],
  [LedgerAccountType.WRITE_OFF_LOSS, LedgerNormalSide.DEBIT]
]);

function immutable(value) {
  return Object.freeze(structuredClone(value));
}

function min(left, right) {
  return left < right ? left : right;
}

function assertSharedObligation(obligation) {
  if (
    !obligation || obligation.schemaVersion !== "obligation.v2" ||
    obligation.sandboxOnly !== true || obligation.productionFundsMoved !== false ||
    !enumValues(CreditAuthorityType).includes(obligation.authorityType)
  ) {
    throw new DomainError("obligation_not_executable", "shared sandbox Obligation is unavailable");
  }
  assertNoRawPiiReference(obligation, "sandboxCredit.obligation");
  return obligation;
}

function assertCurrentAuthority(authority, obligation, { capability, now }) {
  if (obligation.authorityType === CreditAuthorityType.CONSENT) {
    if (
      !authority || authority.schemaVersion !== "consent_record.v1" ||
      authority.consentId !== obligation.authorityRef ||
      authority.subjectId !== obligation.subjectId ||
      authority.principalId !== obligation.principalId ||
      authority.status !== ConsentStatus.ACTIVE ||
      authority.sandboxOnly !== true || authority.productionAuthority !== false ||
      now < new Date(authority.validFrom) || now >= new Date(authority.expiresAt) ||
      !authority.purposes.includes(ConsentPurpose.CREDIT_OFFER_ACCEPTANCE) ||
      !authority.purposes.includes(ConsentPurpose.OBLIGATION_SERVICING) ||
      !authority.allowedAssetIds.includes(obligation.assetId)
    ) {
      throw new DomainError("authority_not_current", "Consent does not authorize sandbox execution or servicing");
    }
    return true;
  }
  if (
    !authority || authority.mandateId !== obligation.authorityRef ||
    authority.subjectId !== obligation.subjectId ||
    authority.principalId !== obligation.principalId ||
    authority.status !== MandateStatus.ACTIVE ||
    authority.sandboxOnly !== true || authority.productionAuthority !== false ||
    now < new Date(authority.validFrom) || now >= new Date(authority.expiresAt) ||
    !authority.assetIds.includes(obligation.assetId) ||
    !authority.capabilities.includes(capability)
  ) {
    throw new DomainError("authority_not_current", "Mandate does not authorize the sandbox operation");
  }
  return true;
}

export function assertAuthorityAuthorizesSandboxExecution(authority, obligation, { now = new Date() } = {}) {
  assertSharedObligation(obligation);
  return assertCurrentAuthority(authority, obligation, {
    capability: MandateCapability.EXECUTE_SANDBOX_CREDIT,
    now
  });
}

export function assertAuthorityAuthorizesSandboxRepayment(authority, obligation, { now = new Date() } = {}) {
  assertSharedObligation(obligation);
  return assertCurrentAuthority(authority, obligation, {
    capability: MandateCapability.ROUTE_REPAYMENT,
    now
  });
}

function createDerivedAccount(obligation, accountType, normalSide, now) {
  const natural = {
    ownerType: "obligation",
    ownerId: obligation.obligationId,
    assetId: obligation.assetId,
    accountType
  };
  const digest = hashId("sandbox_ledger_account", natural);
  return immutable({
    ledgerAccountId: `ledger_account_${digest.slice(2)}`,
    ledgerAccountHash: hashId("ledger_account", natural),
    ...natural,
    normalSide,
    status: LedgerAccountStatus.ACTIVE,
    openedAt: now.toISOString(),
    schemaVersion: "ledger_account.v1"
  });
}

export function createSandboxLedgerAccounts(obligation, { now = new Date() } = {}) {
  assertSharedObligation(obligation);
  const accounts = ACCOUNT_SPECS.map(([accountType, normalSide]) =>
    createDerivedAccount(obligation, accountType, normalSide, now)
  );
  return Object.freeze(Object.fromEntries(accounts.map((account) => [account.accountType, account])));
}

function createBalancedTransaction({
  idempotencyKey,
  transactionType,
  obligation,
  referenceType,
  referenceId,
  metadata,
  entryInputs,
  now
}) {
  const normalizedEntries = entryInputs.map((entry, sequence) => ({
    ledgerAccountId: entry.ledgerAccountId,
    direction: entry.direction,
    amountMinor: assertPositiveMinorUnits(entry.amountMinor, "ledger amount").toString(),
    sequence
  }));
  const debits = normalizedEntries
    .filter(({ direction }) => direction === LedgerEntryDirection.DEBIT)
    .reduce((sum, { amountMinor }) => sum + BigInt(amountMinor), 0n);
  const credits = normalizedEntries
    .filter(({ direction }) => direction === LedgerEntryDirection.CREDIT)
    .reduce((sum, { amountMinor }) => sum + BigInt(amountMinor), 0n);
  if (debits === 0n || debits !== credits) {
    throw new DomainError("unbalanced_ledger_transaction", "sandbox accounting transaction must balance");
  }
  const transaction = createLedgerTransaction({
    idempotencyKey,
    transactionType,
    assetId: obligation.assetId,
    referenceType,
    referenceId,
    metadata,
    normalizedEntries,
    debitTotalMinor: debits.toString(),
    creditTotalMinor: credits.toString(),
    now
  });
  const entries = normalizedEntries.map((entry) => createLedgerEntry({
    ledgerTransactionId: transaction.ledgerTransactionId,
    ...entry,
    now
  }));
  return immutable({ ...transaction, entries });
}

export function createSandboxExecutionReceipt({
  obligation,
  adapterReceipt,
  now = new Date()
}) {
  assertSharedObligation(obligation);
  if (
    !adapterReceipt || typeof adapterReceipt !== "object" || Array.isArray(adapterReceipt) ||
    adapterReceipt.obligationId !== obligation.obligationId ||
    adapterReceipt.assetId !== obligation.assetId ||
    adapterReceipt.amountMinor !== obligation.originalPrincipalMinor ||
    adapterReceipt.sandboxOnly !== true || adapterReceipt.productionFundsMoved !== false ||
    adapterReceipt.withdrawable !== false
  ) {
    throw new DomainError("sandbox_rail_unavailable", "sandbox rail receipt does not match the Obligation");
  }
  for (const key of ["adapterId", "adapterVersion", "adapterKeyId", "messageHash", "signature"]) {
    assertNonEmptyString(key, adapterReceipt[key]);
  }
  if (!Number.isFinite(new Date(adapterReceipt.issuedAt).getTime())) {
    throw new DomainError("sandbox_rail_unavailable", "sandbox rail receipt timestamp is invalid");
  }
  const core = {
    obligationId: obligation.obligationId,
    subjectId: obligation.subjectId,
    assetId: obligation.assetId,
    amountMinor: obligation.originalPrincipalMinor,
    adapterId: adapterReceipt.adapterId,
    adapterVersion: adapterReceipt.adapterVersion,
    adapterKeyId: adapterReceipt.adapterKeyId,
    adapterMessageHash: adapterReceipt.messageHash,
    adapterSignature: adapterReceipt.signature,
    adapterIssuedAt: adapterReceipt.issuedAt,
    executedAt: now.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false
  };
  assertNoRawPiiReference(core, "sandboxExecutionReceipt");
  const receiptHash = hashId("sandbox_execution_receipt", core);
  return immutable({
    sandboxExecutionReceiptId: `sandbox_execution_receipt_${receiptHash.slice(2)}`,
    receiptHash,
    ...core,
    schemaVersion: "sandbox_execution_receipt.v1"
  });
}

export function executeSandboxObligation(obligation, {
  adapterReceipt,
  now = new Date()
}) {
  assertSharedObligation(obligation);
  if (
    obligation.status !== ObligationStatus.CREATED ||
    obligation.executionStatus !== ObligationExecutionStatus.PENDING
  ) {
    throw new DomainError("obligation_not_executable", "Obligation is not pending sandbox execution");
  }
  const receipt = createSandboxExecutionReceipt({ obligation, adapterReceipt, now });
  const accounts = createSandboxLedgerAccounts(obligation, { now });
  const ledgerTransaction = createBalancedTransaction({
    idempotencyKey: hashId("sandbox_execution_ledger_idempotency", {
      obligationId: obligation.obligationId,
      receiptHash: receipt.receiptHash
    }),
    transactionType: "sandbox_credit_execution",
    obligation,
    referenceType: "sandbox_execution_receipt",
    referenceId: receipt.sandboxExecutionReceiptId,
    metadata: {
      obligationId: obligation.obligationId,
      receiptHash: receipt.receiptHash,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false
    },
    entryInputs: [
      {
        ledgerAccountId: accounts[LedgerAccountType.PRINCIPAL_RECEIVABLE].ledgerAccountId,
        direction: LedgerEntryDirection.DEBIT,
        amountMinor: obligation.originalPrincipalMinor
      },
      {
        ledgerAccountId: accounts[LedgerAccountType.SANDBOX_FUNDING_SOURCE].ledgerAccountId,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: obligation.originalPrincipalMinor
      }
    ],
    now
  });
  const executed = immutable({
    ...obligation,
    executionStatus: ObligationExecutionStatus.EXECUTED,
    sandboxExecutionReceiptId: receipt.sandboxExecutionReceiptId,
    executedAt: now.toISOString(),
    lastAccruedAt: now.toISOString(),
    interestAccrualRemainder: "0",
    withdrawable: false,
    status: ObligationStatus.ACTIVE,
    updatedAt: now.toISOString()
  });
  return immutable({ obligation: executed, receipt, accounts, ledgerTransaction });
}

export function accrueSimpleInterest(obligation, { now = new Date() } = {}) {
  assertSharedObligation(obligation);
  if (obligation.executionStatus !== ObligationExecutionStatus.EXECUTED || !obligation.lastAccruedAt) {
    throw new DomainError("obligation_not_repayable", "Obligation has not been executed");
  }
  const start = new Date(obligation.lastAccruedAt);
  if (!Number.isFinite(start.getTime()) || now < start) {
    throw new DomainError("invalid_accrual_time", "interest accrual time cannot move backwards");
  }
  const elapsedDays = Math.floor((now.getTime() - start.getTime()) / DAY_MS);
  const previousRemainder = BigInt(obligation.interestAccrualRemainder ?? "0");
  if (previousRemainder < 0n || previousRemainder >= ACTUAL_365_DENOMINATOR) {
    throw new DomainError("invalid_interest_remainder", "interest accrual remainder is invalid");
  }
  const numerator = previousRemainder +
    BigInt(obligation.outstandingPrincipalMinor) * BigInt(obligation.annualRateBps) * BigInt(elapsedDays);
  const accruedInterest = numerator / ACTUAL_365_DENOMINATOR;
  const remainder = numerator % ACTUAL_365_DENOMINATOR;
  const installments = obligation.installments.map((row) => ({ ...row }));
  if (accruedInterest > 0n) {
    const target = installments.find((row) => row.status !== "paid") ?? installments.at(-1);
    target.scheduledInterestMinor = (
      BigInt(target.scheduledInterestMinor) + accruedInterest
    ).toString();
  }
  const lastAccruedAt = new Date(start.getTime() + elapsedDays * DAY_MS).toISOString();
  return immutable({
    obligation: {
      ...obligation,
      accruedInterestMinor: (
        BigInt(obligation.accruedInterestMinor) + accruedInterest
      ).toString(),
      outstandingInterestMinor: (
        BigInt(obligation.outstandingInterestMinor) + accruedInterest
      ).toString(),
      interestAccrualRemainder: remainder.toString(),
      lastAccruedAt,
      installments,
      updatedAt: now.toISOString()
    },
    elapsedDays,
    accruedInterestMinor: accruedInterest.toString(),
    numeratorRemainder: remainder.toString()
  });
}

function allocateAcrossInstallments(installments, component, amount) {
  let remaining = amount;
  const scheduledKey = `scheduled${component}Minor`;
  const paidKey = `paid${component}Minor`;
  for (const row of installments) {
    if (remaining === 0n) break;
    const available = BigInt(row[scheduledKey]) - BigInt(row[paidKey]);
    const applied = min(remaining, available);
    row[paidKey] = (BigInt(row[paidKey]) + applied).toString();
    remaining -= applied;
  }
  if (remaining !== 0n) {
    throw new DomainError("schedule_allocation_mismatch", "repayment cannot reconcile to the installment schedule");
  }
}

function updateInstallmentStatuses(installments) {
  for (const row of installments) {
    const scheduled = BigInt(row.scheduledPrincipalMinor) +
      BigInt(row.scheduledInterestMinor) + BigInt(row.scheduledFeeMinor);
    const paid = BigInt(row.paidPrincipalMinor) +
      BigInt(row.paidInterestMinor) + BigInt(row.paidFeeMinor);
    row.status = paid === 0n ? "scheduled" : paid === scheduled ? "paid" : "partial";
  }
}

export function postSandboxRepayment(obligation, {
  amountMinor,
  sourceCode,
  actorId,
  now = new Date()
}) {
  assertSharedObligation(obligation);
  if (
    obligation.executionStatus !== ObligationExecutionStatus.EXECUTED ||
    ![
      ObligationStatus.ACTIVE,
      ObligationStatus.PARTIALLY_REPAID,
      ObligationStatus.OVERDUE,
      ObligationStatus.DELINQUENT,
      ObligationStatus.DEFAULTED,
      ObligationStatus.RESTRUCTURED,
      ObligationStatus.REPURCHASED
    ].includes(obligation.status)
  ) {
    throw new DomainError("obligation_not_repayable", "Obligation is not in a repayable state");
  }
  const requested = BigInt(assertPositiveMinorUnits(amountMinor, "amountMinor"));
  assertEnumValue("sourceCode", sourceCode, enumValues(SandboxRepaymentSource));
  assertNonEmptyString("actorId", actorId);
  const accrual = accrueSimpleInterest(obligation, { now });
  const current = accrual.obligation;
  let remaining = requested;
  const fee = min(remaining, BigInt(current.outstandingFeesMinor));
  remaining -= fee;
  const interest = min(remaining, BigInt(current.outstandingInterestMinor));
  remaining -= interest;
  const principal = min(remaining, BigInt(current.outstandingPrincipalMinor));
  remaining -= principal;
  const applied = fee + interest + principal;
  if (applied === 0n) {
    throw new DomainError("obligation_not_repayable", "Obligation has no repayable balance");
  }
  const installments = current.installments.map((row) => ({ ...row }));
  allocateAcrossInstallments(installments, "Fee", fee);
  allocateAcrossInstallments(installments, "Interest", interest);
  allocateAcrossInstallments(installments, "Principal", principal);
  updateInstallmentStatuses(installments);
  const outstandingPrincipal = BigInt(current.outstandingPrincipalMinor) - principal;
  const outstandingInterest = BigInt(current.outstandingInterestMinor) - interest;
  const outstandingFees = BigInt(current.outstandingFeesMinor) - fee;
  const totalOutstanding = outstandingPrincipal + outstandingInterest + outstandingFees;
  const status = totalOutstanding === 0n
    ? ObligationStatus.FULLY_REPAID
    : ObligationStatus.PARTIALLY_REPAID;
  const repaymentCore = {
    obligationId: current.obligationId,
    subjectId: current.subjectId,
    assetId: current.assetId,
    requestedMinor: requested.toString(),
    appliedMinor: applied.toString(),
    appliedFeeMinor: fee.toString(),
    appliedInterestMinor: interest.toString(),
    appliedPrincipalMinor: principal.toString(),
    surplusMinor: remaining.toString(),
    remainingPrincipalMinor: outstandingPrincipal.toString(),
    remainingInterestMinor: outstandingInterest.toString(),
    remainingFeesMinor: outstandingFees.toString(),
    sourceCode,
    actorHash: hashId("actor", actorId),
    accruedInterestMinor: accrual.accruedInterestMinor,
    accrualDays: accrual.elapsedDays,
    occurredAt: now.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false
  };
  const repaymentHash = hashId("sandbox_repayment", repaymentCore);
  const repayment = immutable({
    repaymentId: `repayment_${repaymentHash.slice(2)}`,
    repaymentHash,
    ...repaymentCore,
    schemaVersion: "repayment.v2"
  });
  const accounts = createSandboxLedgerAccounts(current, { now: new Date(current.executedAt) });
  const entryInputs = [{
    ledgerAccountId: accounts[LedgerAccountType.REPAYMENT_CLEARING].ledgerAccountId,
    direction: LedgerEntryDirection.DEBIT,
    amountMinor: applied.toString()
  }];
  if (fee > 0n) entryInputs.push({
    ledgerAccountId: accounts[LedgerAccountType.FEE_RECEIVABLE].ledgerAccountId,
    direction: LedgerEntryDirection.CREDIT,
    amountMinor: fee.toString()
  });
  if (interest > 0n) entryInputs.push({
    ledgerAccountId: accounts[LedgerAccountType.INTEREST_RECEIVABLE].ledgerAccountId,
    direction: LedgerEntryDirection.CREDIT,
    amountMinor: interest.toString()
  });
  if (principal > 0n) entryInputs.push({
    ledgerAccountId: accounts[LedgerAccountType.PRINCIPAL_RECEIVABLE].ledgerAccountId,
    direction: LedgerEntryDirection.CREDIT,
    amountMinor: principal.toString()
  });
  const ledgerTransaction = createBalancedTransaction({
    idempotencyKey: hashId("sandbox_repayment_ledger_idempotency", {
      repaymentId: repayment.repaymentId,
      repaymentHash
    }),
    transactionType: "sandbox_repayment",
    obligation: current,
    referenceType: "repayment",
    referenceId: repayment.repaymentId,
    metadata: {
      repaymentHash,
      sourceCode,
      appliedFeeMinor: fee.toString(),
      appliedInterestMinor: interest.toString(),
      appliedPrincipalMinor: principal.toString(),
      surplusMinor: remaining.toString(),
      sandboxOnly: true,
      productionFundsMoved: false
    },
    entryInputs,
    now
  });
  const interestTransaction = BigInt(accrual.accruedInterestMinor) === 0n
    ? undefined
    : createBalancedTransaction({
        idempotencyKey: hashId("sandbox_interest_ledger_idempotency", {
          obligationId: current.obligationId,
          lastAccruedAt: current.lastAccruedAt,
          accruedInterestMinor: accrual.accruedInterestMinor
        }),
        transactionType: "sandbox_interest_accrual",
        obligation: current,
        referenceType: "obligation",
        referenceId: current.obligationId,
        metadata: {
          elapsedDays: accrual.elapsedDays,
          numeratorRemainder: accrual.numeratorRemainder,
          sandboxOnly: true
        },
        entryInputs: [
          {
            ledgerAccountId: accounts[LedgerAccountType.INTEREST_RECEIVABLE].ledgerAccountId,
            direction: LedgerEntryDirection.DEBIT,
            amountMinor: accrual.accruedInterestMinor
          },
          {
            ledgerAccountId: accounts[LedgerAccountType.SYNTHETIC_INTEREST_INCOME].ledgerAccountId,
            direction: LedgerEntryDirection.CREDIT,
            amountMinor: accrual.accruedInterestMinor
          }
        ],
        now
      });
  const updatedObligation = immutable({
    ...current,
    outstandingPrincipalMinor: outstandingPrincipal.toString(),
    outstandingInterestMinor: outstandingInterest.toString(),
    outstandingFeesMinor: outstandingFees.toString(),
    totalRepaidMinor: (BigInt(current.totalRepaidMinor) + applied).toString(),
    installments,
    status,
    updatedAt: now.toISOString()
  });
  const servicing = applySandboxServicingAfterRepayment(obligation, updatedObligation, {
    actorId,
    now
  });
  return immutable({
    obligation: servicing.obligation,
    repayment: {
      ...repayment,
      ledgerTransactionId: ledgerTransaction.ledgerTransactionId,
      ...(interestTransaction ? { interestLedgerTransactionId: interestTransaction.ledgerTransactionId } : {})
    },
    ledgerTransaction,
    ...(interestTransaction ? { interestTransaction } : {}),
    ...(servicing.servicingAction ? { servicingAction: servicing.servicingAction } : {}),
    ...(servicing.cured ? { cured: true } : {})
  });
}

export function createSandboxWriteOffTransaction(obligation, {
  servicingActionId,
  now = new Date()
}) {
  assertSharedObligation(obligation);
  assertNonEmptyString("servicingActionId", servicingActionId);
  const accounts = createSandboxLedgerAccounts(obligation, { now: new Date(obligation.executedAt) });
  const principal = BigInt(obligation.outstandingPrincipalMinor);
  const interest = BigInt(obligation.outstandingInterestMinor);
  const fees = BigInt(obligation.outstandingFeesMinor);
  const total = principal + interest + fees;
  if (total === 0n) {
    throw new DomainError("servicing_resolution_unavailable", "Obligation has no balance to write off");
  }
  const entryInputs = [{
    ledgerAccountId: accounts[LedgerAccountType.WRITE_OFF_LOSS].ledgerAccountId,
    direction: LedgerEntryDirection.DEBIT,
    amountMinor: total.toString()
  }];
  if (principal > 0n) entryInputs.push({
    ledgerAccountId: accounts[LedgerAccountType.PRINCIPAL_RECEIVABLE].ledgerAccountId,
    direction: LedgerEntryDirection.CREDIT,
    amountMinor: principal.toString()
  });
  if (interest > 0n) entryInputs.push({
    ledgerAccountId: accounts[LedgerAccountType.INTEREST_RECEIVABLE].ledgerAccountId,
    direction: LedgerEntryDirection.CREDIT,
    amountMinor: interest.toString()
  });
  if (fees > 0n) entryInputs.push({
    ledgerAccountId: accounts[LedgerAccountType.FEE_RECEIVABLE].ledgerAccountId,
    direction: LedgerEntryDirection.CREDIT,
    amountMinor: fees.toString()
  });
  return createBalancedTransaction({
    idempotencyKey: hashId("sandbox_write_off_ledger_idempotency", {
      obligationId: obligation.obligationId,
      servicingActionId
    }),
    transactionType: "sandbox_write_off",
    obligation,
    referenceType: "sandbox_servicing_action",
    referenceId: servicingActionId,
    metadata: {
      obligationId: obligation.obligationId,
      writtenOffPrincipalMinor: principal.toString(),
      writtenOffInterestMinor: interest.toString(),
      writtenOffFeesMinor: fees.toString(),
      sandboxOnly: true,
      productionFundsMoved: false
    },
    entryInputs,
    now
  });
}

export const SANDBOX_INTEREST_DENOMINATOR = ACTUAL_365_DENOMINATOR.toString();
