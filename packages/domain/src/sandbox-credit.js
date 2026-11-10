import { syntheticFeeSourcePolicyHash } from "./synthetic-fee-source-policy.js";
import { transitionSyntheticFeeBasis, recordSyntheticBorrowerFeePayment, assertSyntheticFees } from "./synthetic-fees.js";
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
import { assertSyntheticCollateralAllowsExecution } from "./synthetic-collateral.js";
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
  const specs = obligation.syntheticFees ? [...ACCOUNT_SPECS,
    [LedgerAccountType.SYNTHETIC_INSTITUTION_FEE_RECEIVABLE, LedgerNormalSide.DEBIT],
    [LedgerAccountType.SYNTHETIC_INSTITUTION_FEE_INCOME, LedgerNormalSide.CREDIT],
    [LedgerAccountType.SYNTHETIC_BORROWER_FEE_REFUND_PAYABLE, LedgerNormalSide.CREDIT],
    [LedgerAccountType.SYNTHETIC_INSTITUTION_FEE_CREDIT_PAYABLE, LedgerNormalSide.CREDIT]
  ] : ACCOUNT_SPECS;
  if ((obligation.syntheticFees?.sourceCorrectionCount ?? 0)>0) specs.push([LedgerAccountType.SYNTHETIC_BORROWER_REFUND_PAYABLE, LedgerNormalSide.CREDIT]);
  const accounts = specs.map(([accountType, normalSide]) =>
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
  const providerBound = Object.hasOwn(adapterReceipt, "providerId") ||
    Object.hasOwn(adapterReceipt, "providerCategory") ||
    Object.hasOwn(adapterReceipt, "purposeCode");
  if (
    providerBound &&
    (
      typeof adapterReceipt.providerId !== "string" ||
      adapterReceipt.providerId.length === 0 ||
      typeof adapterReceipt.providerCategory !== "string" ||
      adapterReceipt.providerCategory.length === 0 ||
      typeof adapterReceipt.purposeCode !== "string" ||
      adapterReceipt.purposeCode.length === 0
    )
  ) {
    throw new DomainError("sandbox_rail_unavailable", "sandbox Provider target binding is invalid");
  }
  const core = {
    obligationId: obligation.obligationId,
    subjectId: obligation.subjectId,
    assetId: obligation.assetId,
    amountMinor: obligation.originalPrincipalMinor,
    ...(providerBound
      ? {
          providerId: adapterReceipt.providerId,
          providerCategory: adapterReceipt.providerCategory,
          purposeCode: adapterReceipt.purposeCode
        }
      : {}),
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
  if (obligation.poolObligationBindingId) {
    throw new DomainError(
      "obligation_execution_rail_conflict",
      "Pool-bound Obligation cannot execute through the sandbox rail"
    );
  }
  if (
    obligation.status !== ObligationStatus.CREATED ||
    obligation.executionStatus !== ObligationExecutionStatus.PENDING
  ) {
    throw new DomainError("obligation_not_executable", "Obligation is not pending sandbox execution");
  }
  assertSyntheticCollateralAllowsExecution(obligation);
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
  let feeEntry;
  let assessedObligation = obligation;
  if (obligation.syntheticFees) {
    const fee = transitionSyntheticFeeBasis(obligation.syntheticFees, {
      obligationId: obligation.obligationId, kind: "borrower",
      sourceId: receipt.sandboxExecutionReceiptId, sourceHash: receipt.receiptHash,
      baseDeltaMinor: receipt.amountMinor, now
    });
    feeEntry = fee.entry;
    const installments = structuredClone(obligation.installments);
    installments[0].scheduledFeeMinor = fee.entry.feeDeltaMinor;
    assessedObligation = { ...obligation, syntheticFees: fee.state, installments,
      accruedFeesMinor: fee.state.borrowerAssessedMinor, outstandingFeesMinor: fee.state.borrowerAssessedMinor };
  }
  const executed = immutable({
    ...assessedObligation,
    executionStatus: ObligationExecutionStatus.EXECUTED,
    sandboxExecutionReceiptId: receipt.sandboxExecutionReceiptId,
    executedAt: now.toISOString(),
    lastAccruedAt: now.toISOString(),
    interestAccrualRemainder: "0",
    withdrawable: false,
    status: ObligationStatus.ACTIVE,
    updatedAt: now.toISOString()
  });
  return immutable({ obligation: executed, receipt, accounts, ledgerTransaction,
    ...(feeEntry ? { feeEntry, feeTransaction: createSyntheticFeePosting(executed, feeEntry, { now }) } : {}) });
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
  syntheticFeeAssessmentEnabled = false,
  amountMinor,
  sourceCode,
  actorId,
  now = new Date()
}) {
  assertSharedObligation(obligation);
  if (obligation.poolExecutionReceiptId) {
    throw new DomainError(
      "obligation_execution_rail_conflict",
      "Pool-executed Obligation must be repaid through finalized Pool effects"
    );
  }
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
  let fees = current.syntheticFees;
  let feeEntry;
  if (fees) {
    fees = recordSyntheticBorrowerFeePayment(fees, fee.toString());
    if (interest > 0n || (syntheticFeeAssessmentEnabled === true && BigInt(fees.pendingNormalInterestMinor) > 0n)) {
      const assessment = transitionSyntheticFeeBasis(fees, {
        obligationId: current.obligationId, kind: "institution",
        sourceId: repayment.repaymentId, sourceHash: repayment.repaymentHash,
        baseDeltaMinor: interest.toString(), assessmentEnabled: syntheticFeeAssessmentEnabled, now
      });
      fees = assessment.state; feeEntry = assessment.entry;
    }
  }
  const updatedObligation = immutable({
    ...current,
    ...(fees ? { syntheticFees: fees } : {}),
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
    ...(feeEntry ? { feeEntry, feeTransaction: createSyntheticFeePosting(updatedObligation, feeEntry, { now }) } : {}),
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

// Both fee kinds post into the canonical shared Ledger. Institutional charges
// never change borrower balances; paid-fee reversals create a synthetic credit.
export function createSyntheticFeePosting(obligation, entry, { now = new Date(), refundPaidMinor = "0", writtenOffCreditMinor = "0" } = {}) {
  assertSyntheticFees(obligation.syntheticFees);
  const delta = BigInt(entry.feeDeltaMinor);
  if (delta === 0n) return undefined;
  const accounts = createSandboxLedgerAccounts(obligation, { now: new Date(obligation.createdAt) });
  const borrower = entry.kind === "borrower";
  const receivable = borrower ? LedgerAccountType.FEE_RECEIVABLE : LedgerAccountType.SYNTHETIC_INSTITUTION_FEE_RECEIVABLE;
  const income = borrower ? LedgerAccountType.SYNTHETIC_FEE_INCOME : LedgerAccountType.SYNTHETIC_INSTITUTION_FEE_INCOME;
  const payable = borrower ? LedgerAccountType.SYNTHETIC_BORROWER_FEE_REFUND_PAYABLE : LedgerAccountType.SYNTHETIC_INSTITUTION_FEE_CREDIT_PAYABLE;
  const amount = delta < 0n ? -delta : delta;
  const refund = BigInt(refundPaidMinor), writtenOffCredit=BigInt(writtenOffCreditMinor);
  if (writtenOffCredit<0n || refund+writtenOffCredit>amount) throw new DomainError("synthetic_fee_integrity_mismatch", "Written-off fee credits do not reconcile");
  if (refund < 0n || refund > amount || (delta > 0n && refund > 0n)) {
    throw new DomainError("synthetic_fee_integrity_mismatch", "Fee reversal credit does not reconcile");
  }
  const line = (type, direction, value) => ({ ledgerAccountId: accounts[type].ledgerAccountId, direction, amountMinor: value.toString() });
  const entryInputs = delta > 0n
    ? [line(receivable, LedgerEntryDirection.DEBIT, amount), line(income, LedgerEntryDirection.CREDIT, amount)]
    : [line(income, LedgerEntryDirection.DEBIT, amount),
       ...(amount > refund+writtenOffCredit ? [line(receivable, LedgerEntryDirection.CREDIT, amount - refund-writtenOffCredit)] : []),
       ...(writtenOffCredit>0n ? [line(LedgerAccountType.WRITE_OFF_LOSS, LedgerEntryDirection.CREDIT, writtenOffCredit)] : []),
       ...(refund > 0n ? [line(payable, LedgerEntryDirection.CREDIT, refund)] : [])];
  return createBalancedTransaction({
    idempotencyKey: hashId("synthetic_fee_posting", { feeEntryId: entry.feeEntryId }),
    transactionType: delta < 0n ? "synthetic_fee_reversal" : "synthetic_fee_assessment",
    obligation, referenceType: "synthetic_fee_entry", referenceId: entry.feeEntryId,
    metadata: { ...entry, refundPaidMinor, writtenOffCreditMinor, sandboxOnly: true, withdrawable: false },
    entryInputs, now
  });
}

const correctionMinor = (state, key) => BigInt(state[key] ?? "0");
function reduceUnpaidSchedule(installments, component, amount) {
  let remaining=amount;
  for (const row of [...installments].reverse()) {
    const scheduled=`scheduled${component}Minor`,paid=`paid${component}Minor`;
    const available=BigInt(row[scheduled])-BigInt(row[paid]);
    const credit=available<remaining?available:remaining;
    row[scheduled]=(BigInt(row[scheduled])-credit).toString();remaining-=credit;
    if(remaining===0n)break;
  }
  if(remaining!==0n)throw new DomainError("synthetic_fee_integrity_mismatch","The source credit does not reconcile to the unpaid schedule");
  updateInstallmentStatuses(installments);
}
function deriveSyntheticFeeSourceCorrection(obligation, { originalEntry, amountMinor, remainingSourceBaseMinor, now }) {
  assertSharedObligation(obligation);assertSyntheticFees(obligation.syntheticFees);
  if(obligation.executionStatus!==ObligationExecutionStatus.EXECUTED ||
    originalEntry?.obligationId!==obligation.obligationId || BigInt(originalEntry.baseDeltaMinor)<=0n ||
    originalEntry.termsHash!==obligation.syntheticFees.terms.termsHash ||
    !['borrower','institution'].includes(originalEntry.kind)) {
    throw new DomainError("synthetic_fee_source_invalid","An original successful source receipt is required");
  }
  const amount=assertPositiveMinorUnits(amountMinor,"amountMinor");
  const available=assertPositiveMinorUnits(remainingSourceBaseMinor,"remainingSourceBaseMinor");
  if(amount>available || available>BigInt(originalEntry.baseDeltaMinor))throw new DomainError("synthetic_fee_source_exceeded","The correction exceeds the original uncorrected source");
  const isFunding=originalEntry.kind==='borrower';
  const accrual=isFunding && ![ObligationStatus.FULLY_REPAID,ObligationStatus.CLOSED,ObligationStatus.WRITTEN_OFF].includes(obligation.status)
    ? accrueSimpleInterest(obligation,{now})
    : {obligation,elapsedDays:0,accruedInterestMinor:"0",numeratorRemainder:obligation.interestAccrualRemainder??"0"};
  const current=accrual.obligation, fees=current.syntheticFees;
  const reasonCode=isFunding?'funding_correction':'normal_interest_refund';
  const pendingSource=!isFunding && fees.pendingEntryIds.includes(originalEntry.feeEntryId);
  const provisional=transitionSyntheticFeeBasis(fees,{obligationId:obligation.obligationId,kind:originalEntry.kind,
    sourceId:'synthetic_fee_source_preview',sourceHash:hashId('synthetic_fee_source_preview',{source:originalEntry.feeEntryId,amountMinor}),
    baseDeltaMinor:(-amount).toString(),reversesEntryId:originalEntry.feeEntryId,reasonCode,assessmentEnabled:!pendingSource,now});
  const unpaidPrincipal=isFunding && current.status!==ObligationStatus.WRITTEN_OFF?min(amount,BigInt(current.outstandingPrincipalMinor)):0n;
  const writtenPrincipalAvailable=BigInt(current.writtenOffPrincipalMinor??'0')-correctionMinor(fees,'principalWrittenOffCreditMinor');
  if(writtenPrincipalAvailable<0n)throw new DomainError('synthetic_fee_integrity_mismatch','Principal loss credits exceed the written-off history');
  const writtenPrincipal=isFunding?min(amount-unpaidPrincipal,writtenPrincipalAvailable):0n;
  const principalRefund=isFunding?amount-unpaidPrincipal-writtenPrincipal:0n;
  const feeCredit=-BigInt(provisional.entry.feeDeltaMinor);
  const unpaidFee=isFunding && current.status!==ObligationStatus.WRITTEN_OFF?min(feeCredit,BigInt(current.outstandingFeesMinor)):0n;
  const writtenFeeAvailable=BigInt(current.writtenOffFeesMinor??'0')-correctionMinor(fees,'feeWrittenOffCreditMinor');
  if(writtenFeeAvailable<0n)throw new DomainError('synthetic_fee_integrity_mismatch','Fee loss credits exceed the written-off history');
  const writtenFee=isFunding?min(feeCredit-unpaidFee,writtenFeeAvailable):0n;
  const paidFee=isFunding?feeCredit-unpaidFee-writtenFee:0n;
  let installments=structuredClone(current.installments);
  if(unpaidPrincipal>0n)reduceUnpaidSchedule(installments,'Principal',unpaidPrincipal);
  if(unpaidFee>0n)reduceUnpaidSchedule(installments,'Fee',unpaidFee);
  const scheduleChanged=unpaidPrincipal>0n || unpaidFee>0n;
  const scheduleSequence=scheduleChanged?current.scheduleSequence+1:current.scheduleSequence;
  if(scheduleSequence>100)throw new DomainError("synthetic_fee_correction_schedule_limit","The existing schedule revision bound requires further governed review");
  if(scheduleChanged) {
    // Follow existing schedule versioning: preserve old rows, carry only the
    // unpaid amounts into a new sequence, and never copy prior payments twice.
    installments=installments.map(row=>{
      const {installmentId,...old}=row;
      const core={...old,scheduleSequence};
      for(const part of ['Principal','Interest','Fee']){
        core[`scheduled${part}Minor`]=(BigInt(row[`scheduled${part}Minor`])-BigInt(row[`paid${part}Minor`])).toString();
        core[`paid${part}Minor`]='0';
      }
      return {...core,installmentId:`obligation_installment_${hashId('obligation_installment',core).slice(2)}`};
    });
    updateInstallmentStatuses(installments);
  }
  const nextScheduleHash=scheduleChanged?hashId('obligation_schedule',installments):current.scheduleHash;
  const allClear=BigInt(current.outstandingPrincipalMinor)===unpaidPrincipal &&
    BigInt(current.outstandingFeesMinor)===unpaidFee && current.outstandingInterestMinor==='0';
  const effect={
    sourcePolicyHash:syntheticFeeSourcePolicyHash(obligation.syntheticFees.terms.profile),sourceFeeEntryId:originalEntry.feeEntryId,sourceHash:originalEntry.sourceHash,
    kind:originalEntry.kind,amountMinor,reasonCode,
    interestAccruedBeforeCreditMinor:accrual.accruedInterestMinor,
    accrualRemainder:accrual.numeratorRemainder,
    unpaidPrincipalCreditMinor:unpaidPrincipal.toString(),writtenOffPrincipalCreditMinor:writtenPrincipal.toString(),
    principalRefundCreditMinor:principalRefund.toString(),interestRefundCreditMinor:(!isFunding?amount:0n).toString(),
    feeCreditMinor:feeCredit.toString(),unpaidFeeCreditMinor:unpaidFee.toString(),
    writtenOffFeeCreditMinor:writtenFee.toString(),paidFeeCreditMinor:paidFee.toString(),
    nextFundedBaseMinor:provisional.state.fundedBaseMinor,nextNormalInterestBaseMinor:provisional.state.normalInterestBaseMinor,
    nextBorrowerFeeMinor:provisional.state.borrowerAssessedMinor,nextInstitutionFeeMinor:provisional.state.institutionAssessedMinor,
    nextOutstandingPrincipalMinor:(BigInt(current.outstandingPrincipalMinor)-unpaidPrincipal).toString(),
    nextOutstandingInterestMinor:current.outstandingInterestMinor,
    nextOutstandingFeesMinor:(BigInt(current.outstandingFeesMinor)-unpaidFee).toString(),
    scheduleSequenceBefore:current.scheduleSequence,scheduleSequenceAfter:scheduleSequence,
    scheduleHashBefore:current.scheduleHash,scheduleHashAfter:nextScheduleHash,
    nextStatus:allClear && current.status!==ObligationStatus.WRITTEN_OFF?ObligationStatus.FULLY_REPAID:current.status,
    pendingSource,syntheticOnly:true,productionFundsMoved:false,cashRefundRecorded:false
  };
  return {current,accrual,effect,installments,provisional};
}
export function reviewSyntheticFeeSourceCorrection(obligation, input) {
  const derived=deriveSyntheticFeeSourceCorrection(obligation,{...input,now:input.now??new Date()});
  return Object.freeze({sourcePolicyHash:syntheticFeeSourcePolicyHash(obligation.syntheticFees.terms.profile),
    expectedFeeStateHash:hashId('synthetic_fee_correction_state',obligation),
    expectedEffectsHash:hashId('synthetic_fee_correction_effects',derived.effect),
    effects:Object.freeze(derived.effect),syntheticOnly:true,productionFundsMoved:false});
}
export function correctSyntheticFeeSource(obligation, { originalEntry, amountMinor, remainingSourceBaseMinor,
  expectedFeeStateHash,expectedEffectsHash,sourcePolicyHash:acceptedPolicyHash,approvalExecutionId,actorId,now=new Date() }) {
  const derived=deriveSyntheticFeeSourceCorrection(obligation,{originalEntry,amountMinor,remainingSourceBaseMinor,now});
  if(acceptedPolicyHash!==undefined && acceptedPolicyHash!==syntheticFeeSourcePolicyHash(obligation.syntheticFees.terms.profile))throw new DomainError("synthetic_fee_profile_invalid","The source policy does not match the exact accepted loan");
  if(expectedFeeStateHash!==hashId('synthetic_fee_correction_state',obligation) ||
     expectedEffectsHash!==hashId('synthetic_fee_correction_effects',derived.effect)) {
    throw new DomainError('synthetic_fee_correction_stale','The source, accrued interest or reviewed effect changed; review again');
  }
  assertNonEmptyString('approvalExecutionId',approvalExecutionId);assertNonEmptyString('actorId',actorId);
  const {effect,current,accrual,installments}=derived;
  const core={obligationId:obligation.obligationId,sourceFeeEntryId:originalEntry.feeEntryId,
    originalSourceId:originalEntry.sourceId,originalSourceHash:originalEntry.sourceHash,
    amountMinor,kind:originalEntry.kind,reasonCode:effect.reasonCode,
    expectedFeeStateHash,expectedEffectsHash,sourcePolicyHash:syntheticFeeSourcePolicyHash(obligation.syntheticFees.terms.profile),
    approvalExecutionId,actorId,effects:effect,effectiveAt:now.toISOString(),
    refundStatus:'credit_due_only',syntheticOnly:true,productionFundsMoved:false,
    scope:obligation.syntheticFees.terms.scope,profile:obligation.syntheticFees.terms.profile,chainTransactionHash:null,
    schemaVersion:'synthetic_fee_source_correction.v1'};
  const receiptId=hashId('synthetic_fee_source_correction',core);
  const transition=transitionSyntheticFeeBasis(current.syntheticFees,{obligationId:obligation.obligationId,
    kind:originalEntry.kind,sourceId:receiptId,sourceHash:receiptId,baseDeltaMinor:(-BigInt(amountMinor)).toString(),
    reversesEntryId:originalEntry.feeEntryId,reasonCode:effect.reasonCode,assessmentEnabled:!effect.pendingSource,now});
  const fees={...transition.state,
    principalUnpaidCreditMinor:(correctionMinor(current.syntheticFees,'principalUnpaidCreditMinor')+BigInt(effect.unpaidPrincipalCreditMinor)).toString(),
    principalWrittenOffCreditMinor:(correctionMinor(current.syntheticFees,'principalWrittenOffCreditMinor')+BigInt(effect.writtenOffPrincipalCreditMinor)).toString(),
    principalRefundCreditDueMinor:(correctionMinor(current.syntheticFees,'principalRefundCreditDueMinor')+BigInt(effect.principalRefundCreditMinor)).toString(),
    interestRefundCreditDueMinor:(correctionMinor(current.syntheticFees,'interestRefundCreditDueMinor')+BigInt(effect.interestRefundCreditMinor)).toString(),
    feeWrittenOffCreditMinor:(correctionMinor(current.syntheticFees,'feeWrittenOffCreditMinor')+BigInt(effect.writtenOffFeeCreditMinor)).toString(),
    sourceCorrectionCount:(current.syntheticFees.sourceCorrectionCount??0)+1,lastSourceCorrectionReceiptId:receiptId};
  const next={...current,syntheticFees:fees,installments,scheduleSequence:effect.scheduleSequenceAfter,scheduleHash:effect.scheduleHashAfter,
    ...(current.oldestUnpaidInstallmentId && effect.scheduleSequenceAfter!==effect.scheduleSequenceBefore?{oldestUnpaidInstallmentId:installments[current.installments.findIndex(row=>row.installmentId===current.oldestUnpaidInstallmentId)]?.installmentId}:{}),
    outstandingPrincipalMinor:effect.nextOutstandingPrincipalMinor,outstandingFeesMinor:effect.nextOutstandingFeesMinor,
    status:effect.nextStatus,updatedAt:now.toISOString()};
  if(effect.nextStatus===ObligationStatus.FULLY_REPAID && obligation.status!==ObligationStatus.FULLY_REPAID) {
    next.servicingClassification=obligation.daysPastDue>0?'cured':'current';next.daysPastDue=0;
    next.oldestUnpaidInstallmentId=undefined;next.servicingEffectiveAt=now.toISOString();
    next.servicingReasonCode='synthetic_fee_source_correction';
  }
  assertSyntheticFees(fees);
  const accounts=createSandboxLedgerAccounts(next,{now});
  const line=(type,direction,value)=>({ledgerAccountId:accounts[type].ledgerAccountId,direction,amountMinor:value});
  const sourceLines=originalEntry.kind==='borrower'
    ? [line(LedgerAccountType.SANDBOX_FUNDING_SOURCE,LedgerEntryDirection.DEBIT,amountMinor),
       ...(effect.unpaidPrincipalCreditMinor!=='0'?[line(LedgerAccountType.PRINCIPAL_RECEIVABLE,LedgerEntryDirection.CREDIT,effect.unpaidPrincipalCreditMinor)]:[]),
       ...(effect.writtenOffPrincipalCreditMinor!=='0'?[line(LedgerAccountType.WRITE_OFF_LOSS,LedgerEntryDirection.CREDIT,effect.writtenOffPrincipalCreditMinor)]:[]),
       ...(effect.principalRefundCreditMinor!=='0'?[line(LedgerAccountType.SYNTHETIC_BORROWER_REFUND_PAYABLE,LedgerEntryDirection.CREDIT,effect.principalRefundCreditMinor)]:[])]
    : [line(LedgerAccountType.SYNTHETIC_INTEREST_INCOME,LedgerEntryDirection.DEBIT,amountMinor),
       line(LedgerAccountType.SYNTHETIC_BORROWER_REFUND_PAYABLE,LedgerEntryDirection.CREDIT,amountMinor)];
  const sourceTransaction=createBalancedTransaction({idempotencyKey:hashId('synthetic_fee_source_posting',{receiptId}),
    transactionType:originalEntry.kind==='borrower'?'synthetic_funding_credit':'synthetic_interest_credit',
    obligation:next,referenceType:'synthetic_fee_source_correction',referenceId:receiptId,
    metadata:{...core,receiptId,sandboxOnly:true},entryInputs:sourceLines,now});
  const feeTransaction=createSyntheticFeePosting(next,transition.entry,{now,refundPaidMinor:effect.paidFeeCreditMinor,writtenOffCreditMinor:effect.writtenOffFeeCreditMinor});
  const interestTransaction=accrual.accruedInterestMinor==='0'?undefined:createBalancedTransaction({
    idempotencyKey:hashId('sandbox_interest_ledger_idempotency',{obligationId:obligation.obligationId,lastAccruedAt:current.lastAccruedAt,accruedInterestMinor:accrual.accruedInterestMinor}),
    transactionType:'sandbox_interest_accrual',obligation:current,referenceType:'obligation',referenceId:obligation.obligationId,
    metadata:{elapsedDays:accrual.elapsedDays,numeratorRemainder:accrual.numeratorRemainder,sandboxOnly:true},
    entryInputs:[line(LedgerAccountType.INTEREST_RECEIVABLE,LedgerEntryDirection.DEBIT,accrual.accruedInterestMinor),
      line(LedgerAccountType.SYNTHETIC_INTEREST_INCOME,LedgerEntryDirection.CREDIT,accrual.accruedInterestMinor)],now});
  return immutable({obligation:next,accounts,sourceTransaction,feeEntry:transition.entry,
    ...(feeTransaction?{feeTransaction}:{}),...(interestTransaction?{interestTransaction}:{}),
    receipt:{...core,receiptId,receiptHash:receiptId,sourceLedgerTransactionId:sourceTransaction.ledgerTransactionId,
      feeLedgerTransactionId:feeTransaction?.ledgerTransactionId??null,feeEntryId:transition.entry.feeEntryId}});
}
