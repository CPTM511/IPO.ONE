import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  HypercoreDelegateStatus,
  verifyHypercoreAccountBinding,
  verifyHypercoreDelegate
} from "./hypercore-delegate.js";

export const HYPERCORE_EXECUTION_EVIDENCE_SCHEMA_VERSION =
  "hypercore_execution_evidence.v1";

const HASH = /^0x[0-9a-f]{64}$/;
const EXECUTION_STATES = new Set(["CONFIRMED", "REJECTED", "UNKNOWN"]);
const RECONCILIATION_STATUSES = new Set([
  "pending",
  "reconciled",
  "quarantined",
  "safe_stop"
]);
const MAX_RISK_FRESHNESS_MS = 30_000;

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function exactShape(name, value, required) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    fail("invalid_hypercore_execution_evidence", `${name} has an invalid shape`);
  }
}

function bytes32(name, value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hypercore_execution_evidence", `${name} must be lowercase bytes32`);
  }
  return value;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_hypercore_execution_evidence", `${name} must be a trusted Date`);
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  if (typeof value !== "string") {
    fail("invalid_hypercore_execution_evidence", `${name} must be ISO time`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("invalid_hypercore_execution_evidence", `${name} must be canonical ISO time`);
  }
  return parsed;
}

function freeze(value) {
  if (Array.isArray(value)) for (const item of value) freeze(item);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
  }
  return Object.freeze(value);
}

function executionEvidenceCore(value) {
  const core = structuredClone(value);
  delete core.evidenceHash;
  return core;
}

export function createHypercoreExecutionEvidence(input) {
  exactShape("HyperCore execution Evidence input", input, [
    "binding",
    "delegate",
    "accountSnapshotHash",
    "riskSnapshotHash",
    "riskObservedAt",
    "riskExpiresAt",
    "executionRecord",
    "reconciliationRecordHash",
    "reconciliationStatus",
    "observedAt"
  ]);
  verifyHypercoreAccountBinding(input.binding);
  verifyHypercoreDelegate(input.delegate);
  const observedAt = trustedDate("observedAt", input.observedAt);
  const riskObservedAt = trustedDate("riskObservedAt", input.riskObservedAt);
  const riskExpiresAt = trustedDate("riskExpiresAt", input.riskExpiresAt);
  for (const key of [
    "accountSnapshotHash",
    "riskSnapshotHash",
    "reconciliationRecordHash"
  ]) bytes32(key, input[key]);
  const record = input.executionRecord;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    fail("invalid_hypercore_execution_evidence", "execution record is required");
  }
  for (const key of [
    "executionHash",
    "requestHash",
    "facilityHash",
    "orderIntentHash",
    "accountBindingHash",
    "signerReferenceHash",
    "policyDecisionHash",
    "actionHash",
    "resultHash"
  ]) bytes32(key, record[key]);
  if (
    riskObservedAt > observedAt ||
    riskExpiresAt <= observedAt ||
    riskExpiresAt <= riskObservedAt ||
    observedAt.getTime() - riskObservedAt.getTime() > MAX_RISK_FRESHNESS_MS
  ) {
    fail(
      "hypercore_prepared_work_quarantined",
      "stale risk or account state invalidates prepared work"
    );
  }
  if (
    input.delegate.status !== HypercoreDelegateStatus.SIMULATED_ACTIVE ||
    new Date(input.delegate.expiresAt) <= observedAt ||
    input.delegate.accountBindingHash !== input.binding.accountBindingHash ||
    input.delegate.facilityHash !== input.binding.facilityHash ||
    record.facilityId !== input.binding.facilityId ||
    record.facilityHash !== input.binding.facilityHash ||
    record.accountBindingHash !== input.binding.accountBindingHash ||
    record.signerReferenceHash !== input.delegate.signerReferenceHash
  ) {
    fail(
      "hypercore_prepared_work_quarantined",
      "binding or delegate drift invalidates prepared work"
    );
  }
  if (
    !EXECUTION_STATES.has(record.nonceState) ||
    !Number.isSafeInteger(record.nonce) ||
    record.nonce < 1 ||
    record.simulationOnly !== true ||
    record.externalSystemQueried !== false ||
    record.externalOrderSubmitted !== false ||
    record.rawActionAccepted !== false ||
    record.rawResponsePersisted !== false ||
    record.reusableSignaturePersisted !== false ||
    record.withdrawalAuthority !== false ||
    record.transferAuthority !== false ||
    record.accountAdministrationAuthority !== false ||
    record.mainnetAuthority !== false ||
    record.productionAuthority !== false ||
    record.fundsAuthority !== false ||
    !RECONCILIATION_STATUSES.has(input.reconciliationStatus)
  ) {
    fail(
      "invalid_hypercore_execution_evidence",
      "execution or reconciliation safety state is unavailable"
    );
  }
  if (
    record.nonceState === "UNKNOWN" &&
    !new Set(["pending", "quarantined", "safe_stop"]).has(
      input.reconciliationStatus
    )
  ) {
    fail(
      "invalid_hypercore_execution_evidence",
      "UNKNOWN execution cannot be declared reconciled without exact venue proof"
    );
  }
  const value = {
    facilityId: input.binding.facilityId,
    facilityHash: input.binding.facilityHash,
    orderIntentId: record.orderIntentId,
    orderIntentHash: record.orderIntentHash,
    accountBindingHash: input.binding.accountBindingHash,
    canonicalAccountAddressHash: input.binding.canonicalAccountAddressHash,
    queryAddressHash: input.binding.queryAddressHash,
    delegateId: input.delegate.delegateId,
    delegateHash: input.delegate.delegateHash,
    apiWalletAddressHash: input.delegate.apiWalletAddressHash,
    signerReferenceHash: input.delegate.signerReferenceHash,
    accountSnapshotHash: input.accountSnapshotHash,
    riskSnapshotHash: input.riskSnapshotHash,
    policyDecisionHash: record.policyDecisionHash,
    executionId: record.executionId,
    executionHash: record.executionHash,
    requestHash: record.requestHash,
    actionKind: record.actionKind,
    actionHash: record.actionHash,
    nonce: record.nonce,
    nonceState: record.nonceState,
    resultHash: record.resultHash,
    reconciliationRecordHash: input.reconciliationRecordHash,
    reconciliationStatus: input.reconciliationStatus,
    riskObservedAt: riskObservedAt.toISOString(),
    riskExpiresAt: riskExpiresAt.toISOString(),
    observedAt: observedAt.toISOString(),
    accountIdentityIsSigner: false,
    infoQueryUsedSignerAddress: false,
    externalSystemQueried: false,
    externalOrderSubmitted: false,
    adapterAcknowledgementIsCanonicalTruth: false,
    canonicalLedgerMutationAllowed: false,
    canonicalSettlementConfirmed: false,
    resubmissionAllowed: false,
    rawProviderResponseRetained: false,
    rawSignatureRetained: false,
    secretsIncluded: false,
    withdrawalAuthority: false,
    transferAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: HYPERCORE_EXECUTION_EVIDENCE_SCHEMA_VERSION
  };
  return freeze({
    evidenceHash: hashId("hypercore_execution_evidence", value),
    ...value
  });
}

export function verifyHypercoreExecutionEvidence(value) {
  const required = [
    "evidenceHash", "facilityId", "facilityHash", "orderIntentId", "orderIntentHash",
    "accountBindingHash", "canonicalAccountAddressHash", "queryAddressHash", "delegateId",
    "delegateHash", "apiWalletAddressHash", "signerReferenceHash", "accountSnapshotHash",
    "riskSnapshotHash", "policyDecisionHash", "executionId", "executionHash", "requestHash",
    "actionKind", "actionHash", "nonce", "nonceState", "resultHash",
    "reconciliationRecordHash", "reconciliationStatus", "riskObservedAt", "riskExpiresAt",
    "observedAt", "accountIdentityIsSigner", "infoQueryUsedSignerAddress",
    "externalSystemQueried", "externalOrderSubmitted", "adapterAcknowledgementIsCanonicalTruth",
    "canonicalLedgerMutationAllowed", "canonicalSettlementConfirmed", "resubmissionAllowed",
    "rawProviderResponseRetained", "rawSignatureRetained", "secretsIncluded",
    "withdrawalAuthority", "transferAuthority", "mainnetAuthority", "productionAuthority",
    "fundsAuthority", "schemaVersion"
  ];
  exactShape("HyperCore execution Evidence", value, required);
  for (const key of required.filter((key) => key.endsWith("Hash"))) {
    bytes32(key, value[key]);
  }
  timestamp("riskObservedAt", value.riskObservedAt);
  timestamp("riskExpiresAt", value.riskExpiresAt);
  timestamp("observedAt", value.observedAt);
  if (
    value.schemaVersion !== HYPERCORE_EXECUTION_EVIDENCE_SCHEMA_VERSION ||
    !EXECUTION_STATES.has(value.nonceState) ||
    !RECONCILIATION_STATUSES.has(value.reconciliationStatus) ||
    !Number.isSafeInteger(value.nonce) ||
    value.nonce < 1 ||
    value.accountIdentityIsSigner !== false ||
    value.infoQueryUsedSignerAddress !== false ||
    value.externalSystemQueried !== false ||
    value.externalOrderSubmitted !== false ||
    value.adapterAcknowledgementIsCanonicalTruth !== false ||
    value.canonicalLedgerMutationAllowed !== false ||
    value.canonicalSettlementConfirmed !== false ||
    value.resubmissionAllowed !== false ||
    value.rawProviderResponseRetained !== false ||
    value.rawSignatureRetained !== false ||
    value.secretsIncluded !== false ||
    value.withdrawalAuthority !== false ||
    value.transferAuthority !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    value.accountBindingHash === value.delegateHash ||
    value.canonicalAccountAddressHash === value.apiWalletAddressHash ||
    value.canonicalAccountAddressHash !== value.queryAddressHash ||
    value.evidenceHash !==
      hashId("hypercore_execution_evidence", executionEvidenceCore(value))
  ) {
    fail(
      "invalid_hypercore_execution_evidence",
      "execution Evidence is inconsistent"
    );
  }
  return true;
}
