import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import { LedgerAccountStatus, LedgerEntryDirection, LedgerNormalSide, ObligationExecutionStatus, ObligationStatus } from "./enums.js";
import { createLedgerEntry, createLedgerTransaction } from "./models.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const UINT = /^(0|[1-9][0-9]{0,77})$/;
const POSITIVE = /^[1-9][0-9]{0,77}$/;
const SIGNED_NONZERO = /^-?[1-9][0-9]{0,77}$/;

function fail(code, message) {
  throw new DomainError(code, message);
}

function id(name, value) {
  if (typeof value !== "string" || !ID.test(value)) fail("metered_usage_invalid", `${name} is invalid`);
  return value;
}

function digest(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) fail("metered_usage_invalid", `${name} is invalid`);
  return value;
}

function integer(name, value, positive = false) {
  if (typeof value !== "string" || !(positive ? POSITIVE : UINT).test(value)) {
    fail("metered_usage_invalid", `${name} is invalid`);
  }
  return BigInt(value);
}

function signedInteger(name, value) {
  if (typeof value !== "string" || !SIGNED_NONZERO.test(value)) {
    fail("metered_usage_invalid", `${name} is invalid`);
  }
  return BigInt(value);
}

function instant(name, value) {
  const parsed = typeof value === "string" ? new Date(value) : new Date(NaN);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("metered_usage_invalid", `${name} is invalid`);
  }
  return parsed;
}

function corePolicy(input) {
  return {
    policyId: id("policyId", input.policyId),
    tenantId: id("tenantId", input.tenantId),
    subjectId: id("subjectId", input.subjectId),
    principalId: id("principalId", input.principalId),
    mandateId: id("mandateId", input.mandateId),
    facilityId: id("facilityId", input.facilityId),
    authorizationId: id("authorizationId", input.authorizationId),
    obligationId: id("obligationId", input.obligationId),
    providerId: id("providerId", input.providerId),
    resourceClass: id("resourceClass", input.resourceClass),
    measurementUnit: id("measurementUnit", input.measurementUnit),
    priceScheduleHash: digest("priceScheduleHash", input.priceScheduleHash),
    unitPriceMinor: integer("unitPriceMinor", input.unitPriceMinor, true).toString(),
    assetId: id("assetId", input.assetId),
    maxQuantityPerEvent: integer("maxQuantityPerEvent", input.maxQuantityPerEvent, true).toString(),
    maxChargePerEventMinor: integer("maxChargePerEventMinor", input.maxChargePerEventMinor, true).toString(),
    maxChargePerWindowMinor: integer("maxChargePerWindowMinor", input.maxChargePerWindowMinor, true).toString(),
    validFrom: instant("validFrom", input.validFrom).toISOString(),
    expiresAt: instant("expiresAt", input.expiresAt).toISOString(),
    status: input.status ?? "active",
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "metered_usage_policy.v1"
  };
}

export function createMeteredUsagePolicy(input) {
  const policy = corePolicy(input);
  if (policy.status !== "active" && policy.status !== "revoked") fail("metered_usage_invalid", "status is invalid");
  if (instant("expiresAt", policy.expiresAt) <= instant("validFrom", policy.validFrom)) {
    fail("metered_usage_invalid", "policy validity window is invalid");
  }
  return Object.freeze({ ...policy, policyHash: hashId("metered_usage_policy", policy) });
}

function evidenceCore(input) {
  return {
    usageEvidenceId: id("usageEvidenceId", input.usageEvidenceId),
    providerEventId: id("providerEventId", input.providerEventId),
    nonce: id("nonce", input.nonce),
    correctionOfUsageEvidenceId: input.correctionOfUsageEvidenceId === null ||
      input.correctionOfUsageEvidenceId === undefined
      ? null
      : id("correctionOfUsageEvidenceId", input.correctionOfUsageEvidenceId),
    tenantId: id("tenantId", input.tenantId),
    subjectId: id("subjectId", input.subjectId),
    principalId: id("principalId", input.principalId),
    mandateId: id("mandateId", input.mandateId),
    facilityId: id("facilityId", input.facilityId),
    authorizationId: id("authorizationId", input.authorizationId),
    obligationId: id("obligationId", input.obligationId),
    providerId: id("providerId", input.providerId),
    resourceClass: id("resourceClass", input.resourceClass),
    measurementUnit: id("measurementUnit", input.measurementUnit),
    quantity: integer("quantity", input.quantity, true).toString(),
    priceScheduleHash: digest("priceScheduleHash", input.priceScheduleHash),
    unitPriceMinor: integer("unitPriceMinor", input.unitPriceMinor, true).toString(),
    chargeMinor: integer("chargeMinor", input.chargeMinor, true).toString(),
    assetId: id("assetId", input.assetId),
    windowStartedAt: instant("windowStartedAt", input.windowStartedAt).toISOString(),
    windowEndedAt: instant("windowEndedAt", input.windowEndedAt).toISOString(),
    observedAt: instant("observedAt", input.observedAt).toISOString(),
    finality: input.finality,
    reconciliation: input.reconciliation,
    providerKeyId: id("providerKeyId", input.providerKeyId),
    providerPayloadHash: digest("providerPayloadHash", input.providerPayloadHash),
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "metered_usage_evidence.v1"
  };
}

export function createMeteredUsageEvidence(input) {
  const evidence = evidenceCore(input);
  if (evidence.finality !== "pending" && evidence.finality !== "finalized") fail("metered_usage_invalid", "finality is invalid");
  if (!["pending", "reconciled", "disputed"].includes(evidence.reconciliation)) fail("metered_usage_invalid", "reconciliation is invalid");
  if (instant("windowEndedAt", evidence.windowEndedAt) <= instant("windowStartedAt", evidence.windowStartedAt) ||
      instant("observedAt", evidence.observedAt) < instant("windowEndedAt", evidence.windowEndedAt)) {
    fail("metered_usage_invalid", "usage chronology is invalid");
  }
  if (BigInt(evidence.quantity) * BigInt(evidence.unitPriceMinor) !== BigInt(evidence.chargeMinor)) {
    fail("metered_usage_charge_mismatch", "charge does not equal quantity times unit price");
  }
  return Object.freeze({ ...evidence, usageEvidenceHash: hashId("metered_usage_evidence", evidence) });
}

export function admitMeteredUsageEvidence({
  policy,
  evidence,
  priorEvidence,
  priorAdmission,
  windowChargeBeforeMinor,
  admittedAt = evidence?.observedAt
}) {
  const currentPolicy = createMeteredUsagePolicy(policy);
  const currentEvidence = createMeteredUsageEvidence(evidence);
  if (currentPolicy.status !== "active") fail("metered_usage_policy_inactive", "policy is not active");
  const now = instant("admittedAt", admittedAt);
  if (now < instant("validFrom", currentPolicy.validFrom) || now >= instant("expiresAt", currentPolicy.expiresAt)) {
    fail("metered_usage_policy_expired", "policy is outside its validity window");
  }
  for (const key of ["tenantId", "subjectId", "principalId", "mandateId", "facilityId", "authorizationId", "obligationId", "providerId", "resourceClass", "measurementUnit", "priceScheduleHash", "unitPriceMinor", "assetId"]) {
    if (currentPolicy[key] !== currentEvidence[key]) fail("metered_usage_scope_mismatch", `${key} does not match policy`);
  }
  if (currentEvidence.finality !== "finalized" || currentEvidence.reconciliation !== "reconciled") {
    fail("metered_usage_not_reconciled", "usage is not finalized and reconciled");
  }
  const quantity = BigInt(currentEvidence.quantity);
  const charge = BigInt(currentEvidence.chargeMinor);
  const before = integer("windowChargeBeforeMinor", windowChargeBeforeMinor);
  let chargeDelta = charge;
  if (currentEvidence.correctionOfUsageEvidenceId === null) {
    if (priorEvidence !== undefined || priorAdmission !== undefined) {
      fail("metered_usage_correction_invalid", "initial usage cannot bind correction state");
    }
  } else {
    if (!priorEvidence || !priorAdmission) {
      fail("metered_usage_correction_missing", "correction source is unavailable");
    }
    const previousEvidence = createMeteredUsageEvidence(priorEvidence);
    if (
      previousEvidence.usageEvidenceId !== currentEvidence.correctionOfUsageEvidenceId ||
      priorAdmission.usageEvidenceId !== previousEvidence.usageEvidenceId ||
      priorAdmission.obligationId !== currentEvidence.obligationId ||
      priorAdmission.policyId !== currentPolicy.policyId
    ) fail("metered_usage_correction_invalid", "correction source does not match the admitted usage");
    for (const key of [
      "tenantId", "subjectId", "principalId", "mandateId", "facilityId",
      "authorizationId", "obligationId", "providerId", "resourceClass",
      "measurementUnit", "priceScheduleHash", "unitPriceMinor", "assetId",
      "windowStartedAt", "windowEndedAt"
    ]) {
      if (previousEvidence[key] !== currentEvidence[key]) {
        fail("metered_usage_correction_invalid", `${key} cannot change in a correction`);
      }
    }
    chargeDelta = charge - BigInt(previousEvidence.chargeMinor);
    if (chargeDelta === 0n) fail("metered_usage_correction_invalid", "correction delta cannot be zero");
  }
  const after = before + chargeDelta;
  if (
    quantity > BigInt(currentPolicy.maxQuantityPerEvent) ||
    charge > BigInt(currentPolicy.maxChargePerEventMinor) ||
    after < 0n || after > BigInt(currentPolicy.maxChargePerWindowMinor)
  ) {
    fail("metered_usage_cap_exceeded", "usage exceeds an exact policy cap");
  }
  const body = {
    policyId: currentPolicy.policyId,
    policyHash: currentPolicy.policyHash,
    usageEvidenceId: currentEvidence.usageEvidenceId,
    usageEvidenceHash: currentEvidence.usageEvidenceHash,
    correctionOfUsageEvidenceId: currentEvidence.correctionOfUsageEvidenceId,
    obligationId: currentEvidence.obligationId,
    chargeMinor: charge.toString(),
    chargeDeltaMinor: chargeDelta.toString(),
    windowChargeBeforeMinor: before.toString(),
    windowChargeAfterMinor: after.toString(),
    admittedAt: now.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "metered_usage_admission.v1"
  };
  const admissionHash = hashId("metered_usage_admission", body);
  return Object.freeze({
    meteredUsageAdmissionId: `metered_usage_admission_${admissionHash.slice(2)}`,
    ...body,
    admissionHash
  });
}

function meteredLedgerAccount(obligation, accountType, normalSide, now) {
  const natural = {
    ownerType: "obligation",
    ownerId: obligation.obligationId,
    assetId: obligation.assetId,
    accountType
  };
  const accountHash = hashId("ledger_account", natural);
  return Object.freeze({
    ledgerAccountId: `ledger_account_${accountHash.slice(2)}`,
    ledgerAccountHash: accountHash,
    ...natural,
    normalSide,
    status: LedgerAccountStatus.ACTIVE,
    openedAt: now.toISOString(),
    schemaVersion: "ledger_account.v1"
  });
}

export function createMeteredUsageLedgerPosting({ obligation, admission, now = admission?.admittedAt }) {
  const postedAt = instant("postedAt", now);
  if (
    !obligation || obligation.schemaVersion !== "obligation.v2" ||
    obligation.obligationId !== admission?.obligationId ||
    obligation.assetId === undefined || obligation.assetId.length === 0 ||
    obligation.executionStatus !== ObligationExecutionStatus.EXECUTED ||
    obligation.status !== ObligationStatus.ACTIVE ||
    obligation.sandboxOnly !== true || obligation.productionFundsMoved !== false ||
    obligation.withdrawable !== false
  ) fail("metered_usage_obligation_unavailable", "active sandbox Obligation is required");
  const chargeDelta = signedInteger("chargeDeltaMinor", admission.chargeDeltaMinor);
  const absoluteChargeMinor = (chargeDelta < 0n ? -chargeDelta : chargeDelta).toString();
  if (chargeDelta > 0n && chargeDelta > BigInt(obligation.outstandingPrincipalMinor)) {
    fail("metered_usage_credit_exceeded", "charge exceeds the current Obligation balance");
  }
  const expense = meteredLedgerAccount(
    obligation,
    "metered_service_expense",
    LedgerNormalSide.DEBIT,
    postedAt
  );
  const payable = meteredLedgerAccount(
    obligation,
    "synthetic_provider_payable",
    LedgerNormalSide.CREDIT,
    postedAt
  );
  const normalizedEntries = chargeDelta > 0n ? [
    {
      ledgerAccountId: expense.ledgerAccountId,
      direction: LedgerEntryDirection.DEBIT,
      amountMinor: absoluteChargeMinor,
      sequence: 0
    },
    {
      ledgerAccountId: payable.ledgerAccountId,
      direction: LedgerEntryDirection.CREDIT,
      amountMinor: absoluteChargeMinor,
      sequence: 1
    }
  ] : [
    {
      ledgerAccountId: payable.ledgerAccountId,
      direction: LedgerEntryDirection.DEBIT,
      amountMinor: absoluteChargeMinor,
      sequence: 0
    },
    {
      ledgerAccountId: expense.ledgerAccountId,
      direction: LedgerEntryDirection.CREDIT,
      amountMinor: absoluteChargeMinor,
      sequence: 1
    }
  ];
  const transaction = createLedgerTransaction({
    idempotencyKey: hashId("metered_usage_ledger_idempotency", {
      admissionHash: admission.admissionHash
    }),
    transactionType: admission.correctionOfUsageEvidenceId === null
      ? "metered_service_charge"
      : "metered_service_correction",
    assetId: obligation.assetId,
    referenceType: "metered_usage_admission",
    referenceId: admission.meteredUsageAdmissionId,
    metadata: {
      admissionHash: admission.admissionHash,
      usageEvidenceHash: admission.usageEvidenceHash,
      correctionOfUsageEvidenceId: admission.correctionOfUsageEvidenceId,
      chargeDeltaMinor: admission.chargeDeltaMinor,
      obligationId: obligation.obligationId,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    normalizedEntries,
    debitTotalMinor: absoluteChargeMinor,
    creditTotalMinor: absoluteChargeMinor,
    now: postedAt
  });
  const entries = normalizedEntries.map((entry) => createLedgerEntry({
    ledgerTransactionId: transaction.ledgerTransactionId,
    ...entry,
    now: postedAt
  }));
  return Object.freeze({
    accounts: Object.freeze([expense, payable]),
    transaction: Object.freeze({ ...transaction, entries }),
    sandboxOnly: true,
    productionFundsMoved: false
  });
}
