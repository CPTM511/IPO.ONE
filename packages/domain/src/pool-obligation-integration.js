import {
  CreditEventType,
  LedgerAccountType,
  LedgerEntryDirection,
  ObligationExecutionStatus,
  ObligationStatus
} from "./enums.js";
import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import {
  createCreditEvent,
  createLedgerEntry,
  createLedgerTransaction
} from "./models.js";
import { createSandboxLedgerAccounts } from "./sandbox-credit.js";
import { assertNoRawPiiReference } from "./validators.js";

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const CHAIN = /^eip155:[1-9][0-9]*$/;
const POSITION_EVENTS = new Set([
  "CollateralAdded",
  "CollateralReleased",
  "AssetsBorrowed",
  "AssetsRepaid",
  "PositionLiquidated",
  "BadDebtRecovered"
]);

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function canonicalTimestamp(name, value) {
  if (typeof value !== "string" || new Date(value).toISOString() !== value) {
    fail("invalid_pool_obligation_input", `${name} must be a canonical timestamp`);
  }
  return value;
}

function decimal(name, value) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    fail("invalid_pool_obligation_input", `${name} must be unsigned base units`);
  }
  return BigInt(value);
}

function positionAddress(observation) {
  const field = {
    CollateralAdded: "account",
    CollateralReleased: "account",
    AssetsBorrowed: "account",
    AssetsRepaid: "account",
    PositionLiquidated: "borrower",
    BadDebtRecovered: "account"
  }[observation.eventName];
  return field ? observation.args[field] : undefined;
}

function validateDescriptor(descriptor) {
  if (
    !descriptor || typeof descriptor !== "object" ||
    typeof descriptor.chainId !== "string" || !CHAIN.test(descriptor.chainId) ||
    typeof descriptor.contractAddress !== "string" || !ADDRESS.test(descriptor.contractAddress) ||
    typeof descriptor.marketId !== "string" || !HASH.test(descriptor.marketId) ||
    descriptor.abiVersion !== "IpoOneSecuredPoolV1.v1"
  ) fail("invalid_pool_descriptor", "Pool V1 descriptor is invalid");
  return descriptor;
}

function validateSharedParties({
  subject,
  principal,
  accountBinding,
  obligation,
  descriptor,
  existingBinding
}) {
  validateDescriptor(descriptor);
  if (
    !subject || !new Set(["human", "agent"]).has(subject.subjectType) ||
    subject.status !== "active" || subject.primaryPrincipalId !== principal?.principalId ||
    principal.status !== "active"
  ) fail("pool_self_principal_mismatch", "an active self-Principal Subject is required");
  if (
    accountBinding?.schemaVersion !== "account_binding.v3" ||
    accountBinding.status !== "active" || accountBinding.purpose !== "execution" ||
    accountBinding.bindingKind !== "execution" ||
    accountBinding.subjectId !== subject.subjectId ||
    accountBinding.chainId !== descriptor.chainId
  ) fail("pool_account_binding_unavailable", "the exact active execution AccountBinding is required");
  const prefix = `${descriptor.chainId}:`;
  if (
    typeof accountBinding.accountIdRef !== "string" ||
    !accountBinding.accountIdRef.startsWith(prefix) ||
    !ADDRESS.test(accountBinding.accountIdRef.slice(prefix.length))
  ) fail("pool_account_binding_unavailable", "AccountBinding CAIP-10 position is invalid");
  if (
    obligation?.schemaVersion !== "obligation.v2" ||
    obligation.subjectId !== subject.subjectId ||
    obligation.principalId !== principal.principalId ||
    obligation.sandboxOnly !== true || obligation.productionFundsMoved !== false ||
    !new Set(["created", "active", "partially_repaid", "fully_repaid", "written_off"])
      .has(obligation.status)
  ) fail("pool_obligation_unavailable", "the canonical shared Obligation is unavailable");
  if (existingBinding === undefined) {
    if (
      obligation.status !== ObligationStatus.CREATED ||
      obligation.executionStatus !== ObligationExecutionStatus.PENDING ||
      obligation.sandboxExecutionReceiptId || obligation.poolExecutionReceiptId ||
      obligation.poolObligationBindingId
    ) fail("pool_obligation_rail_conflict", "only one unexecuted Obligation can enter the Pool rail");
  } else if (
    existingBinding?.schemaVersion !== "pool_obligation_binding.v1" ||
    obligation.poolObligationBindingId !== existingBinding.poolObligationBindingId ||
    obligation.sandboxExecutionReceiptId ||
    (obligation.executionStatus === ObligationExecutionStatus.EXECUTED && !obligation.poolExecutionReceiptId)
  ) fail("pool_obligation_rail_conflict", "existing Obligation is not exclusively bound to this Pool rail");
}

export function createPoolObligationBinding({
  subject,
  principal,
  accountBinding,
  obligation,
  descriptor,
  existingBinding,
  now = new Date()
}) {
  validateSharedParties({
    subject,
    principal,
    accountBinding,
    obligation,
    descriptor,
    existingBinding
  });
  const boundAt = now.toISOString();
  const account = accountBinding.accountIdRef.slice(`${descriptor.chainId}:`.length);
  const core = {
    subjectId: subject.subjectId,
    principalId: principal.principalId,
    accountBindingId: accountBinding.accountBindingId,
    accountHash: accountBinding.accountHash,
    obligationId: obligation.obligationId,
    obligationHash: obligation.obligationHash,
    chainId: descriptor.chainId,
    contractAddress: descriptor.contractAddress,
    marketId: descriptor.marketId,
    abiVersion: descriptor.abiVersion,
    positionAccountHash: hashId("pool_position_account", {
      chainId: descriptor.chainId,
      account
    }),
    entryMode: subject.subjectType,
    selfPrincipal: true,
    status: "active",
    boundAt,
    syntheticOnly: true,
    productionFundsMoved: false
  };
  assertNoRawPiiReference(core, "poolObligationBinding");
  const bindingHash = hashId("pool_obligation_binding", core);
  return Object.freeze({
    poolObligationBindingId: `pool_obligation_binding_${bindingHash.slice(2)}`,
    bindingHash,
    ...core,
    schemaVersion: "pool_obligation_binding.v1"
  });
}

export function createInitialPoolObligationProjection(binding, { now = new Date() } = {}) {
  if (binding?.schemaVersion !== "pool_obligation_binding.v1") {
    fail("invalid_pool_obligation_binding", "Pool Obligation binding is invalid");
  }
  const core = {
    poolObligationBindingId: binding.poolObligationBindingId,
    obligationId: binding.obligationId,
    subjectId: binding.subjectId,
    principalId: binding.principalId,
    chainId: binding.chainId,
    contractAddress: binding.contractAddress,
    marketId: binding.marketId,
    accountBindingId: binding.accountBindingId,
    projectionVersion: 0,
    finalizedEffectCount: 0,
    sourceFinalizedEventCount: 0,
    collateralAssets: "0",
    debtAssets: "0",
    badDebtAssets: "0",
    totalRepaidAssets: "0",
    lifecycleStatus: "bound",
    lastEventKey: null,
    lastEffectHash: null,
    lastEvidenceHash: null,
    updatedAt: now.toISOString(),
    rebuildableFromFinalizedEffects: true,
    canonicalObligationRemainsAuthoritative: true,
    creditStateAuthorizing: false,
    automaticLimitChange: false,
    syntheticOnly: true,
    productionFundsMoved: false
  };
  return Object.freeze({
    poolObligationProjectionId: `pool_obligation_projection_${binding.bindingHash.slice(2)}`,
    projectionHash: hashId("pool_obligation_projection", core),
    ...core,
    schemaVersion: "pool_obligation_projection.v1"
  });
}

function validateEffect(binding, observation, effect) {
  if (
    observation?.schemaVersion !== "pool_chain_observation.v1" ||
    observation.observationStatus !== "finalized" ||
    observation.syntheticOnly !== true || observation.productionFundsMoved !== false ||
    effect?.schemaVersion !== "pool_finalized_effect.v1" ||
    effect.eventKey !== observation.eventKey ||
    effect.observationHash !== observation.observationHash ||
    effect.eventType !== observation.eventType ||
    effect.projection?.schemaVersion !== "pool_v1_projection_snapshot.v1" ||
    effect.projection.snapshotHash !== effect.projectionHash ||
    effect.projection.stateHash !== effect.stateHash ||
    effect.projection.state.chainId !== binding.chainId ||
    effect.projection.state.contractAddress !== binding.contractAddress ||
    effect.projection.state.marketId !== binding.marketId ||
    observation.chainId !== binding.chainId ||
    observation.contractAddress !== binding.contractAddress ||
    observation.marketId !== binding.marketId
  ) fail("pool_effect_not_finalized", "only the exact finalized Pool V1 effect can enter the kernel");
  if (!POSITION_EVENTS.has(observation.eventName)) {
    fail("pool_effect_not_position_attributable", "Pool event is not attributable to an Obligation position");
  }
  const address = positionAddress(observation);
  if (!ADDRESS.test(address ?? "") || hashId("pool_position_account", {
    chainId: binding.chainId,
    account: address
  }) !== binding.positionAccountHash) {
    fail("pool_position_account_mismatch", "finalized effect belongs to a different position account");
  }
}

function ledgerTransaction({ obligation, accounts, effect, eventName, amount, debit, credit, now, suffix }) {
  if (amount <= 0n) return undefined;
  const normalizedEntries = [
    { ledgerAccountId: accounts[debit].ledgerAccountId, direction: LedgerEntryDirection.DEBIT, amountMinor: amount.toString(), sequence: 0 },
    { ledgerAccountId: accounts[credit].ledgerAccountId, direction: LedgerEntryDirection.CREDIT, amountMinor: amount.toString(), sequence: 1 }
  ];
  const transaction = createLedgerTransaction({
    idempotencyKey: hashId("pool_obligation_ledger_idempotency", { effectHash: effect.effectHash, suffix }),
    transactionType: `pool_${eventName.replace(/[A-Z]/g, (match, offset) => `${offset ? "_" : ""}${match.toLowerCase()}`)}`,
    assetId: obligation.assetId,
    referenceType: "pool_finalized_effect",
    referenceId: effect.effectHash,
    metadata: {
      obligationId: obligation.obligationId,
      effectHash: effect.effectHash,
      finality: "finalized",
      syntheticOnly: true,
      productionFundsMoved: false
    },
    normalizedEntries,
    debitTotalMinor: amount.toString(),
    creditTotalMinor: amount.toString(),
    now
  });
  const ledgerTransactionId = `ledger_transaction_${transaction.transactionHash.slice(2)}`;
  return Object.freeze({
    ...transaction,
    ledgerTransactionId,
    entries: Object.freeze(normalizedEntries.map((entry) => ({
      ...createLedgerEntry({ ledgerTransactionId, ...entry, now }),
      ledgerEntryId: `ledger_entry_${hashId("pool_ledger_entry", {
        transactionHash: transaction.transactionHash,
        sequence: entry.sequence
      }).slice(2)}`
    })))
  });
}

function allocateAcrossInstallments(installments, component, amount) {
  let remaining = amount;
  const scheduledKey = `scheduled${component}Minor`;
  const paidKey = `paid${component}Minor`;
  for (const row of installments) {
    if (remaining === 0n) break;
    const available = BigInt(row[scheduledKey]) - BigInt(row[paidKey]);
    const applied = remaining < available ? remaining : available;
    row[paidKey] = (BigInt(row[paidKey]) + applied).toString();
    remaining -= applied;
  }
  if (remaining !== 0n) {
    fail("pool_schedule_allocation_mismatch", "Pool repayment cannot reconcile to the Obligation schedule");
  }
}

function updateInstallmentsForRepayment(value, { interestAccrued, interestPaid, principalPaid }) {
  const installments = value.installments.map((row) => ({ ...row }));
  if (interestAccrued > 0n) {
    const target = installments.find((row) => row.status !== "paid") ?? installments.at(-1);
    target.scheduledInterestMinor = (
      BigInt(target.scheduledInterestMinor) + interestAccrued
    ).toString();
  }
  allocateAcrossInstallments(installments, "Interest", interestPaid);
  allocateAcrossInstallments(installments, "Principal", principalPaid);
  for (const row of installments) {
    const scheduled = BigInt(row.scheduledPrincipalMinor) +
      BigInt(row.scheduledInterestMinor) + BigInt(row.scheduledFeeMinor);
    const paid = BigInt(row.paidPrincipalMinor) +
      BigInt(row.paidInterestMinor) + BigInt(row.paidFeeMinor);
    row.status = paid === 0n ? "scheduled" : paid === scheduled ? "paid" : "partial";
  }
  return installments;
}

function repaymentAllocation(obligation, observation) {
  const debtAfter = decimal("debtAfter", observation.args.debtAfter);
  const debtReduced = decimal("debtReducedAssets", observation.args.debtReducedAssets);
  const outstandingPrincipal = BigInt(obligation.outstandingPrincipalMinor);
  const outstandingInterest = BigInt(obligation.outstandingInterestMinor);
  const debtBefore = debtAfter + debtReduced;
  const recordedBefore = outstandingPrincipal + outstandingInterest;
  if (debtBefore < recordedBefore) {
    fail("pool_debt_reconciliation_mismatch", "finalized Pool debt is behind the canonical Obligation balance");
  }
  const interestAccrued = debtBefore - recordedBefore;
  const interestBeforePayment = outstandingInterest + interestAccrued;
  const interestPaid = debtReduced < interestBeforePayment ? debtReduced : interestBeforePayment;
  const principalPaid = debtReduced - interestPaid;
  if (principalPaid > outstandingPrincipal) {
    fail("pool_debt_reconciliation_mismatch", "finalized Pool repayment exceeds the canonical Obligation balance");
  }
  const principalAfter = outstandingPrincipal - principalPaid;
  const interestAfter = interestBeforePayment - interestPaid;
  if (principalAfter + interestAfter !== debtAfter) {
    fail("pool_debt_reconciliation_mismatch", "finalized Pool repayment does not reconcile to debtAfter");
  }
  return Object.freeze({
    debtAfter,
    debtReduced,
    interestAccrued,
    interestPaid,
    principalPaid,
    principalAfter,
    interestAfter
  });
}

function updatedObligation(obligation, observation, effect, now) {
  const value = structuredClone(obligation);
  const args = observation.args;
  if (observation.eventName === "AssetsBorrowed") {
    if (
      value.executionStatus !== ObligationExecutionStatus.PENDING ||
      value.status !== ObligationStatus.CREATED ||
      decimal("assets", args.assets) !== BigInt(value.originalPrincipalMinor) ||
      args.debtAfter !== args.assets
    ) fail("pool_borrow_obligation_mismatch", "initial finalized borrow must exactly execute the accepted Obligation");
    const receiptCore = {
      obligationId: value.obligationId,
      effectHash: effect.effectHash,
      eventKey: effect.eventKey,
      observationHash: effect.observationHash,
      amountMinor: args.assets,
      debtAfterMinor: args.debtAfter,
      finalizedAt: observation.observedAt,
      syntheticOnly: true,
      productionFundsMoved: false
    };
    const receiptHash = hashId("pool_obligation_execution_receipt", receiptCore);
    value.poolExecutionReceiptId = `pool_execution_receipt_${receiptHash.slice(2)}`;
    value.executionStatus = ObligationExecutionStatus.EXECUTED;
    value.executedAt = observation.observedAt;
    value.lastAccruedAt = observation.observedAt;
    value.status = ObligationStatus.ACTIVE;
  } else if (observation.eventName === "AssetsRepaid") {
    if (value.executionStatus !== ObligationExecutionStatus.EXECUTED) {
      fail("pool_repayment_before_borrow", "repayment cannot precede finalized Obligation execution");
    }
    const allocation = repaymentAllocation(value, observation);
    value.outstandingPrincipalMinor = allocation.principalAfter.toString();
    value.outstandingInterestMinor = allocation.interestAfter.toString();
    value.accruedInterestMinor = (
      BigInt(value.accruedInterestMinor) + allocation.interestAccrued
    ).toString();
    value.totalRepaidMinor = (BigInt(value.totalRepaidMinor) + allocation.debtReduced).toString();
    value.installments = updateInstallmentsForRepayment(value, allocation);
    value.lastAccruedAt = observation.observedAt;
    value.status = allocation.debtAfter === 0n
      ? ObligationStatus.FULLY_REPAID
      : ObligationStatus.PARTIALLY_REPAID;
  } else if (observation.eventName === "PositionLiquidated") {
    if (value.executionStatus !== ObligationExecutionStatus.EXECUTED) {
      fail("pool_liquidation_before_borrow", "liquidation cannot precede finalized Obligation execution");
    }
    const repaid = decimal("repaidAssets", args.repaidAssets);
    const loss = decimal("badDebtRecognizedAssets", args.badDebtRecognizedAssets);
    value.totalRepaidMinor = (BigInt(value.totalRepaidMinor) + repaid).toString();
    value.outstandingPrincipalMinor = "0";
    value.outstandingInterestMinor = "0";
    value.outstandingFeesMinor = "0";
    if (loss > 0n) {
      const writtenPrincipal = loss > BigInt(value.originalPrincipalMinor)
        ? BigInt(value.originalPrincipalMinor) : loss;
      value.writtenOffPrincipalMinor = writtenPrincipal.toString();
      value.writtenOffInterestMinor = (loss - writtenPrincipal).toString();
      value.status = ObligationStatus.WRITTEN_OFF;
      value.servicingClassification = "written_off";
      value.resolutionType = "write_off";
      value.resolutionReasonCode = "finalized_pool_liquidation_bad_debt";
      value.resolutionAt = observation.observedAt;
    } else {
      value.status = ObligationStatus.FULLY_REPAID;
      value.servicingClassification = "current";
    }
  } else {
    return undefined;
  }
  value.poolObligationBindingId = value.poolObligationBindingId;
  value.updatedAt = observation.observedAt;
  value.servicingEffectiveAt = observation.observedAt;
  value.servicingReasonCode = `finalized_pool_${observation.eventName.replace(/[A-Z]/g, (m, i) => `${i ? "_" : ""}${m.toLowerCase()}`)}`;
  return value;
}

export function createPoolObligationEffectPlan({
  binding,
  obligation,
  observation,
  effect,
  previousProjection,
  now = new Date()
}) {
  if (binding?.schemaVersion !== "pool_obligation_binding.v1" || binding.status !== "active") {
    fail("pool_obligation_binding_inactive", "an active Pool Obligation binding is required");
  }
  if (
    obligation?.obligationId !== binding.obligationId ||
    obligation.subjectId !== binding.subjectId || obligation.principalId !== binding.principalId ||
    previousProjection?.schemaVersion !== "pool_obligation_projection.v1" ||
    previousProjection.poolObligationBindingId !== binding.poolObligationBindingId
  ) fail("pool_obligation_binding_mismatch", "Pool binding, Obligation and projection do not match");
  validateEffect(binding, observation, effect);
  if (
    !Number.isSafeInteger(effect.projection.finalizedEventCount) ||
    effect.projection.finalizedEventCount <= previousProjection.sourceFinalizedEventCount
  ) fail("pool_effect_out_of_order", "finalized Pool effects must enter the Obligation in source order");
  const debtAsset = effect.projection.state.configuration?.debtAsset;
  if (
    typeof debtAsset !== "string" || !ADDRESS.test(debtAsset) ||
    obligation.assetId !== `${binding.chainId}/erc20:${debtAsset}`
  ) fail("pool_debt_asset_mismatch", "Pool debt asset does not match the canonical Obligation asset");
  canonicalTimestamp("observation.observedAt", observation.observedAt);
  const projection = structuredClone(previousProjection);
  const account = effect.projection.state.accounts.find(({ account }) =>
    hashId("pool_position_account", { chainId: binding.chainId, account }) === binding.positionAccountHash);
  if (!account) fail("pool_position_projection_missing", "finalized Pool projection is missing the bound position");
  projection.projectionVersion += 1;
  projection.finalizedEffectCount += 1;
  projection.sourceFinalizedEventCount = effect.projection.finalizedEventCount;
  projection.collateralAssets = account.collateralAssets;
  projection.debtAssets = account.debtAssets;
  projection.badDebtAssets = account.badDebtAssets;
  if (observation.eventName === "AssetsRepaid") {
    projection.totalRepaidAssets = (
      BigInt(projection.totalRepaidAssets) + decimal("debtReducedAssets", observation.args.debtReducedAssets)
    ).toString();
  } else if (observation.eventName === "PositionLiquidated") {
    projection.totalRepaidAssets = (
      BigInt(projection.totalRepaidAssets) + decimal("repaidAssets", observation.args.repaidAssets)
    ).toString();
  } else if (observation.eventName === "BadDebtRecovered") {
    projection.totalRepaidAssets = (
      BigInt(projection.totalRepaidAssets) + decimal("recoveredAssets", observation.args.recoveredAssets)
    ).toString();
  }
  projection.lifecycleStatus = account.badDebtAssets !== "0"
    ? "loss_recorded"
    : account.debtAssets === "0"
      ? (projection.finalizedEffectCount > 1 ? "settled" : "bound")
      : "active";
  projection.lastEventKey = effect.eventKey;
  projection.lastEffectHash = effect.effectHash;
  projection.updatedAt = observation.observedAt;
  projection.projectionHash = hashId("pool_obligation_projection", Object.fromEntries(
    Object.entries(projection).filter(([key]) => key !== "projectionHash")
  ));

  const obligationUpdate = updatedObligation(obligation, observation, effect, now);
  if (obligationUpdate) obligationUpdate.poolObligationBindingId = binding.poolObligationBindingId;
  let executionReceipt;
  if (observation.eventName === "AssetsBorrowed") {
    const executionCore = {
      poolObligationBindingId: binding.poolObligationBindingId,
      obligationId: binding.obligationId,
      effectHash: effect.effectHash,
      eventKey: effect.eventKey,
      observationHash: effect.observationHash,
      amountMinor: observation.args.assets,
      debtAfterMinor: observation.args.debtAfter,
      finalizedAt: observation.observedAt,
      syntheticOnly: true,
      productionFundsMoved: false
    };
    const executionHash = hashId("pool_obligation_execution_receipt", {
      obligationId: binding.obligationId,
      effectHash: effect.effectHash,
      eventKey: effect.eventKey,
      observationHash: effect.observationHash,
      amountMinor: observation.args.assets,
      debtAfterMinor: observation.args.debtAfter,
      finalizedAt: observation.observedAt,
      syntheticOnly: true,
      productionFundsMoved: false
    });
    executionReceipt = Object.freeze({
      poolExecutionReceiptId: `pool_execution_receipt_${executionHash.slice(2)}`,
      receiptHash: executionHash,
      ...executionCore,
      schemaVersion: "pool_execution_receipt.v1"
    });
    if (obligationUpdate.poolExecutionReceiptId !== executionReceipt.poolExecutionReceiptId) {
      fail("pool_execution_receipt_mismatch", "Pool execution receipt identity is inconsistent");
    }
  }
  const accounts = createSandboxLedgerAccounts(obligation, { now });
  const transactions = [];
  if (observation.eventName === "AssetsBorrowed") {
    transactions.push(ledgerTransaction({
      obligation, accounts, effect, eventName: observation.eventName,
      amount: decimal("assets", observation.args.assets),
      debit: LedgerAccountType.PRINCIPAL_RECEIVABLE,
      credit: LedgerAccountType.SANDBOX_FUNDING_SOURCE,
      now, suffix: "borrow"
    }));
  }
  if (observation.eventName === "AssetsRepaid") {
    const allocation = repaymentAllocation(obligation, observation);
    transactions.push(ledgerTransaction({
      obligation, accounts, effect, eventName: "InterestAccrued",
      amount: allocation.interestAccrued,
      debit: LedgerAccountType.INTEREST_RECEIVABLE,
      credit: LedgerAccountType.SYNTHETIC_INTEREST_INCOME,
      now, suffix: "interest_accrual"
    }));
    transactions.push(ledgerTransaction({
      obligation, accounts, effect, eventName: observation.eventName,
      amount: allocation.interestPaid,
      debit: LedgerAccountType.REPAYMENT_CLEARING,
      credit: LedgerAccountType.INTEREST_RECEIVABLE,
      now, suffix: "repay_interest"
    }));
    transactions.push(ledgerTransaction({
      obligation, accounts, effect, eventName: observation.eventName,
      amount: allocation.principalPaid,
      debit: LedgerAccountType.REPAYMENT_CLEARING,
      credit: LedgerAccountType.PRINCIPAL_RECEIVABLE,
      now, suffix: "repay_principal"
    }));
  }
  if (observation.eventName === "PositionLiquidated") {
    transactions.push(ledgerTransaction({
      obligation, accounts, effect, eventName: observation.eventName,
      amount: decimal("repaidAssets", observation.args.repaidAssets),
      debit: LedgerAccountType.REPAYMENT_CLEARING,
      credit: LedgerAccountType.PRINCIPAL_RECEIVABLE,
      now, suffix: "liquidation_repayment"
    }));
    transactions.push(ledgerTransaction({
      obligation, accounts, effect, eventName: observation.eventName,
      amount: decimal("badDebtRecognizedAssets", observation.args.badDebtRecognizedAssets),
      debit: LedgerAccountType.WRITE_OFF_LOSS,
      credit: LedgerAccountType.PRINCIPAL_RECEIVABLE,
      now, suffix: "liquidation_loss"
    }));
  }
  if (observation.eventName === "BadDebtRecovered") {
    transactions.push(ledgerTransaction({
      obligation, accounts, effect, eventName: observation.eventName,
      amount: decimal("recoveredAssets", observation.args.recoveredAssets),
      debit: LedgerAccountType.REPAYMENT_CLEARING,
      credit: LedgerAccountType.WRITE_OFF_LOSS,
      now, suffix: "bad_debt_recovery"
    }));
  }
  const ledgerTransactions = transactions.filter(Boolean);
  const receiptCore = {
    poolObligationBindingId: binding.poolObligationBindingId,
    obligationId: binding.obligationId,
    subjectId: binding.subjectId,
    eventKey: effect.eventKey,
    observationHash: effect.observationHash,
    effectHash: effect.effectHash,
    poolStateHash: effect.stateHash,
    eventType: observation.eventType,
    projectionVersion: projection.projectionVersion,
    sourceFinalizedEventCount: projection.sourceFinalizedEventCount,
    projectionHash: projection.projectionHash,
    ledgerTransactionIds: ledgerTransactions.map(({ ledgerTransactionId }) => ledgerTransactionId),
    finalizedAt: observation.observedAt,
    finality: "finalized",
    syntheticOnly: true,
    productionFundsMoved: false
  };
  const receiptHash = hashId("pool_obligation_effect_receipt", receiptCore);
  const receipt = Object.freeze({
    poolObligationEffectReceiptId: `pool_obligation_effect_receipt_${receiptHash.slice(2)}`,
    receiptHash,
    ...receiptCore,
    creditStateCandidate: obligationUpdate?.status === ObligationStatus.FULLY_REPAID ||
      obligationUpdate?.status === ObligationStatus.WRITTEN_OFF,
    creditStateAuthorizing: false,
    automaticLimitChange: false,
    schemaVersion: "pool_obligation_effect_receipt.v1"
  });
  const event = createCreditEvent({
    eventType: CreditEventType.POOL_OBLIGATION_EFFECT_IMPORTED,
    subjectId: binding.subjectId,
    obligationId: binding.obligationId,
    chainId: observation.chainId,
    txHash: observation.transactionHash,
    blockNumber: observation.blockNumber,
    payload: {
      poolObligationBindingId: binding.poolObligationBindingId,
      effectReceiptId: receipt.poolObligationEffectReceiptId,
      eventKey: effect.eventKey,
      observationHash: effect.observationHash,
      effectHash: effect.effectHash,
      poolStateHash: effect.stateHash,
      eventType: observation.eventType,
      positionAccountHash: binding.positionAccountHash,
      projectionHash: projection.projectionHash,
      ledgerTransactionIds: receipt.ledgerTransactionIds,
      creditStateCandidate: receipt.creditStateCandidate,
      creditStateAuthorizing: false,
      automaticLimitChange: false,
      syntheticOnly: true,
      productionFundsMoved: false
    },
    now: new Date(observation.observedAt)
  });
  assertNoRawPiiReference({ binding, projection, receipt, event }, "poolObligationEffectPlan");
  return Object.freeze({
    projection: Object.freeze(projection),
    receipt,
    executionReceipt,
    event,
    obligation: obligationUpdate ? Object.freeze(obligationUpdate) : undefined,
    accounts,
    ledgerTransactions: Object.freeze(ledgerTransactions)
  });
}
