import {
  DomainError,
  createCreditEvent,
  createEvidenceEnvelope,
  hashId
} from "../../../packages/domain/src/index.js";

export const HYPERLIQUID_TESTNET_RECONCILIATION_SCHEMA_VERSION =
  "hyperliquid_testnet_simulated_reconciliation.v1";

export const HyperliquidReconciliationStatus = Object.freeze({
  PENDING: "PENDING",
  PARTIAL: "PARTIAL",
  UNKNOWN: "UNKNOWN",
  RECONCILED: "RECONCILED",
  REJECTED: "REJECTED",
  INCIDENT: "INCIDENT",
  SAFE_STOPPED: "SAFE_STOPPED"
});

export const HyperliquidReconciledOrderState = Object.freeze({
  PENDING: "PENDING",
  OPEN: "OPEN",
  PARTIALLY_FILLED: "PARTIALLY_FILLED",
  FILLED: "FILLED",
  CANCELED: "CANCELED",
  REJECTED: "REJECTED",
  UNKNOWN: "UNKNOWN",
  INCIDENT: "INCIDENT",
  SAFE_STOPPED: "SAFE_STOPPED"
});

export const HyperliquidVenueOrderStatus = Object.freeze({
  OPEN: "OPEN",
  PARTIALLY_FILLED: "PARTIALLY_FILLED",
  FILLED: "FILLED",
  CANCELED: "CANCELED",
  REJECTED: "REJECTED",
  NOT_FOUND: "NOT_FOUND",
  UNKNOWN: "UNKNOWN"
});

export const HyperliquidReconciliationObservationKind = Object.freeze({
  NORMALIZED_STATE: "NORMALIZED_STATE",
  ADAPTER_OUTAGE: "ADAPTER_OUTAGE",
  POLL_BUDGET_EXHAUSTED: "POLL_BUDGET_EXHAUSTED",
  KERNEL_CONTRADICTION: "KERNEL_CONTRADICTION"
});

const ACTION_KINDS = new Set([
  "order",
  "reduceOnlyOrder",
  "cancel",
  "cancelByCloid",
  "modify"
]);
const EXECUTION_NONCE_STATES = new Set([
  "SUBMITTED",
  "CONFIRMED",
  "REJECTED",
  "UNKNOWN"
]);
const RISK_STATES = Object.freeze([
  "NORMAL",
  "WARNING",
  "REDUCE_ONLY",
  "FLATTEN",
  "SETTLEMENT"
]);
const RISK_STATE_SET = new Set(RISK_STATES);
const VENUE_STATUSES = new Set(Object.values(HyperliquidVenueOrderStatus));
const OBSERVATION_KINDS = new Set(
  Object.values(HyperliquidReconciliationObservationKind)
);
const TERMINAL_STATUSES = new Set([
  HyperliquidReconciliationStatus.RECONCILED,
  HyperliquidReconciliationStatus.REJECTED,
  HyperliquidReconciliationStatus.INCIDENT,
  HyperliquidReconciliationStatus.SAFE_STOPPED
]);
const HASH = /^0x[0-9a-f]{64}$/;
const CLOID = /^0x[0-9a-f]{32}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SAFE_CODE = /^[a-z0-9][a-z0-9_]{0,95}$/;
const NON_NEGATIVE_MINOR = /^(?:0|[1-9][0-9]{0,77})$/;
const NON_NEGATIVE_DECIMAL =
  /^(?:0|0\.[0-9]{1,18}|[1-9][0-9]{0,30}(?:\.[0-9]{1,18})?)$/;
const MAXIMUM_OBSERVATIONS = 1_000_000;
const RECONCILIATION_OUTBOX_TOPIC =
  "ipo.one.trading-testnet-reconciliation.v1";
const RECONCILIATION_INBOX_CONSUMER =
  "ipo.one.hyperliquid-testnet-reconciliation.v1";
const RECORD_KEYS = Object.freeze([
  "reconciliationId",
  "reconciliationHash",
  "requestHash",
  "idempotencyKeyHash",
  "executionId",
  "executionHash",
  "executionNonceState",
  "nonce",
  "actionKind",
  "actionHash",
  "cloid",
  "facilityId",
  "facilityHash",
  "facilityStateHash",
  "facilityVersion",
  "orderIntentId",
  "orderIntentHash",
  "orderIntentStateHash",
  "orderIntentVersion",
  "subjectId",
  "obligationId",
  "accountBindingHash",
  "signerReferenceHash",
  "requestedSize",
  "requestedNotionalMinor",
  "canonicalLedgerStateHash",
  "ledgerTransactionCount",
  "riskSnapshotHash",
  "effectiveRiskState",
  "initialKernelSnapshotHash",
  "latestKernelSnapshotHash",
  "authorizationDecisionHash",
  "admissionDecisionHash",
  "authorizedActorHash",
  "status",
  "outcome",
  "reconciledOrderState",
  "cumulativeFilledSize",
  "cumulativeFillNotionalMinor",
  "latestEconomicDeltaNotionalMinor",
  "processedObservationCount",
  "latestSourceEvidenceHash",
  "adapterFailureCount",
  "pollAttemptCount",
  "circuitBreakerOpen",
  "manualSafeStop",
  "newRiskBlocked",
  "reconciled",
  "incidentReasonCodes",
  "resultHash",
  "version",
  "createdAt",
  "updatedAt",
  "resolvedAt",
  "environment",
  "simulationOnly",
  "protectedTestnetE2EOnly",
  "externalSystemQueried",
  "externalOrderSubmitted",
  "liveTransportApproved",
  "liveSignerApproved",
  "apiWalletApproved",
  "canonicalLedger",
  "ledgerPostingRequired",
  "ledgerMutationCreated",
  "ledgerPostingAuthority",
  "secondLedgerCreated",
  "facilityMutationCreated",
  "facilityMutationAuthority",
  "riskRecoveryAuthority",
  "withdrawalAuthority",
  "transferAuthority",
  "accountAdministrationAuthority",
  "mainnetAuthority",
  "productionAuthority",
  "fundsAuthority",
  "rawResponsePersisted",
  "reusableSignaturePersisted",
  "piiIncluded",
  "secretsIncluded",
  "schemaVersion"
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(
  value,
  required,
  optional = [],
  code = "invalid_hyperliquid_reconciliation_input"
) {
  if (!plainObject(value)) fail(code, "input must be a plain object");
  const admitted = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !admitted.has(key))
  ) {
    fail(code, "input has an open or incomplete shape");
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hyperliquid_reconciliation_input", `${name} is invalid`);
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hyperliquid_reconciliation_input", `${name} is invalid`);
  }
  return value;
}

function cloid(name, value) {
  if (value !== null && (typeof value !== "string" || !CLOID.test(value))) {
    fail("invalid_hyperliquid_reconciliation_input", `${name} is invalid`);
  }
  return value;
}

function safeCode(name, value) {
  if (typeof value !== "string" || !SAFE_CODE.test(value)) {
    fail("invalid_hyperliquid_reconciliation_input", `${name} is invalid`);
  }
  return value;
}

function positiveInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(
      "invalid_hyperliquid_reconciliation_input",
      `${name} must be a positive safe integer`
    );
  }
  return value;
}

function nonNegativeInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(
      "invalid_hyperliquid_reconciliation_input",
      `${name} must be a non-negative safe integer`
    );
  }
  return value;
}

function minor(name, value) {
  if (typeof value !== "string" || !NON_NEGATIVE_MINOR.test(value)) {
    fail(
      "invalid_hyperliquid_reconciliation_input",
      `${name} must be a non-negative minor-unit string`
    );
  }
  return value;
}

function decimal(name, value) {
  if (typeof value !== "string" || !NON_NEGATIVE_DECIMAL.test(value)) {
    fail(
      "invalid_hyperliquid_reconciliation_input",
      `${name} must be a bounded non-negative decimal string`
    );
  }
  return value;
}

function timestamp(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    fail("invalid_hyperliquid_reconciliation_input", `${name} is invalid`);
  }
  return value;
}

function clockMs(clock) {
  const value = clock();
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(
      "invalid_hyperliquid_reconciliation_clock",
      "clock returned an invalid time"
    );
  }
  return value;
}

function iso(value) {
  return new Date(value).toISOString();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function decimalAtoms(value) {
  decimal("decimal", value);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(18, "0")}`);
}

function riskRank(value) {
  const rank = RISK_STATES.indexOf(value);
  if (rank < 0) {
    fail(
      "invalid_hyperliquid_reconciliation_snapshot",
      "risk state is unsupported"
    );
  }
  return rank;
}

function deterministicReconciliationId(requestHash) {
  hash("requestHash", requestHash);
  return `trading_reconciliation_${requestHash.slice(2, 34)}`;
}

function deterministicObservationId(sourceEvidenceHash) {
  hash("sourceEvidenceHash", sourceEvidenceHash);
  return `trading_venue_observation_${sourceEvidenceHash.slice(2, 34)}`;
}

function baseSafety() {
  return {
    environment: "hyperliquid_testnet",
    simulationOnly: true,
    protectedTestnetE2EOnly: true,
    externalSystemQueried: false,
    externalOrderSubmitted: false,
    liveTransportApproved: false,
    liveSignerApproved: false,
    apiWalletApproved: false,
    canonicalLedger: true,
    ledgerPostingRequired: false,
    ledgerMutationCreated: false,
    ledgerPostingAuthority: false,
    secondLedgerCreated: false,
    facilityMutationCreated: false,
    facilityMutationAuthority: false,
    riskRecoveryAuthority: false,
    withdrawalAuthority: false,
    transferAuthority: false,
    accountAdministrationAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    rawResponsePersisted: false,
    reusableSignaturePersisted: false,
    piiIncluded: false,
    secretsIncluded: false,
    schemaVersion: HYPERLIQUID_TESTNET_RECONCILIATION_SCHEMA_VERSION
  };
}

function assertSafety(value) {
  const expected = baseSafety();
  for (const [key, required] of Object.entries(expected)) {
    if (value[key] !== required) {
      fail(
        "invalid_hyperliquid_reconciliation_record",
        "reconciliation safety boundary changed"
      );
    }
  }
}

function assertRequest(value) {
  exactKeys(value, ["executionId", "executionHash", "idempotencyKey"]);
  identifier("executionId", value.executionId);
  hash("executionHash", value.executionHash);
  if (
    typeof value.idempotencyKey !== "string" ||
    value.idempotencyKey.length < 8 ||
    value.idempotencyKey.length > 256
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_input",
      "idempotencyKey must be bounded"
    );
  }
  return value;
}

function assertKernelSnapshot(value, expected = null) {
  exactKeys(
    value,
    [
      "executionId",
      "executionHash",
      "executionNonceState",
      "nonce",
      "actionKind",
      "actionHash",
      "cloid",
      "facilityId",
      "facilityHash",
      "facilityStateHash",
      "facilityVersion",
      "orderIntentId",
      "orderIntentHash",
      "orderIntentStateHash",
      "orderIntentVersion",
      "subjectId",
      "obligationId",
      "accountBindingHash",
      "signerReferenceHash",
      "requestedSize",
      "requestedNotionalMinor",
      "canonicalLedgerStateHash",
      "ledgerTransactionCount",
      "riskSnapshotHash",
      "riskState",
      "simulationOnly",
      "externalOrderSubmitted",
      "canonicalLedger",
      "secondLedgerCreated",
      "capturedAt",
      "schemaVersion"
    ],
    [],
    "invalid_hyperliquid_reconciliation_snapshot"
  );
  identifier("executionId", value.executionId);
  hash("executionHash", value.executionHash);
  if (!EXECUTION_NONCE_STATES.has(value.executionNonceState)) {
    fail(
      "invalid_hyperliquid_reconciliation_snapshot",
      "execution nonce state cannot enter reconciliation"
    );
  }
  positiveInteger("nonce", value.nonce);
  if (!ACTION_KINDS.has(value.actionKind)) {
    fail(
      "invalid_hyperliquid_reconciliation_snapshot",
      "action kind is unsupported"
    );
  }
  hash("actionHash", value.actionHash);
  cloid("cloid", value.cloid);
  identifier("facilityId", value.facilityId);
  hash("facilityHash", value.facilityHash);
  hash("facilityStateHash", value.facilityStateHash);
  positiveInteger("facilityVersion", value.facilityVersion);
  identifier("orderIntentId", value.orderIntentId);
  hash("orderIntentHash", value.orderIntentHash);
  hash("orderIntentStateHash", value.orderIntentStateHash);
  positiveInteger("orderIntentVersion", value.orderIntentVersion);
  identifier("subjectId", value.subjectId);
  identifier("obligationId", value.obligationId);
  hash("accountBindingHash", value.accountBindingHash);
  hash("signerReferenceHash", value.signerReferenceHash);
  decimal("requestedSize", value.requestedSize);
  minor("requestedNotionalMinor", value.requestedNotionalMinor);
  hash("canonicalLedgerStateHash", value.canonicalLedgerStateHash);
  nonNegativeInteger("ledgerTransactionCount", value.ledgerTransactionCount);
  hash("riskSnapshotHash", value.riskSnapshotHash);
  if (!RISK_STATE_SET.has(value.riskState)) {
    fail(
      "invalid_hyperliquid_reconciliation_snapshot",
      "risk state is unsupported"
    );
  }
  timestamp("capturedAt", value.capturedAt);
  if (
    value.simulationOnly !== true ||
    value.externalOrderSubmitted !== false ||
    value.canonicalLedger !== true ||
    value.secondLedgerCreated !== false ||
    value.schemaVersion !==
      "hyperliquid_testnet_reconciliation_kernel_snapshot.v1"
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_snapshot",
      "only a canonical no-live-write kernel snapshot is admitted"
    );
  }
  if (
    ["cancel", "cancelByCloid"].includes(value.actionKind) &&
    (value.requestedSize !== "0" || value.requestedNotionalMinor !== "0")
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_snapshot",
      "cancel reconciliation cannot invent fill authority"
    );
  }
  if (
    !["cancel", "cancelByCloid"].includes(value.actionKind) &&
    (decimalAtoms(value.requestedSize) === 0n ||
      BigInt(value.requestedNotionalMinor) === 0n)
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_snapshot",
      "order reconciliation requires bounded server-owned request economics"
    );
  }
  if (
    expected &&
    (value.executionId !== expected.executionId ||
      value.executionHash !== expected.executionHash)
  ) {
    fail(
      "hyperliquid_reconciliation_snapshot_binding_mismatch",
      "snapshot is bound to another execution"
    );
  }
  return deepFreeze(structuredClone(value));
}

function kernelSnapshotHash(value) {
  return hashId(
    "hyperliquid_testnet_reconciliation_kernel_snapshot",
    assertKernelSnapshot(value)
  );
}

function assertGuardDecision(value) {
  exactKeys(
    value,
    [
      "approved",
      "authorizationDecisionHash",
      "admissionDecisionHash",
      "authorizedActorHash",
      "actorId",
      "tenantContextResolved",
      "clientIdentityAccepted",
      "simulationOnly",
      "productionAuthority",
      "fundsAuthority",
      "schemaVersion"
    ],
    [],
    "invalid_hyperliquid_reconciliation_guard"
  );
  if (
    value.approved !== true ||
    value.tenantContextResolved !== true ||
    value.clientIdentityAccepted !== false ||
    value.simulationOnly !== true ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    value.schemaVersion !==
      "hyperliquid_testnet_simulated_reconciliation_guard.v1"
  ) {
    fail(
      "hyperliquid_reconciliation_guard_denied",
      "authorization or admission denied reconciliation"
    );
  }
  hash("authorizationDecisionHash", value.authorizationDecisionHash);
  hash("admissionDecisionHash", value.admissionDecisionHash);
  hash("authorizedActorHash", value.authorizedActorHash);
  identifier("actorId", value.actorId);
  return deepFreeze(structuredClone(value));
}

export function createSimulatedHyperliquidVenueObservation(
  input,
  { clock = Date.now } = {}
) {
  exactKeys(
    input,
    [
      "executionHash",
      "facilityHash",
      "actionHash",
      "cloid",
      "kind",
      "venueStatus",
      "cumulativeFilledSize",
      "cumulativeFillNotionalMinor",
      "venueOrderReferenceHash",
      "orderStateHash",
      "positionStateHash",
      "accountStateHash",
      "freshness",
      "complete",
      "reasonCode"
    ],
    [],
    "invalid_hyperliquid_reconciliation_observation"
  );
  hash("executionHash", input.executionHash);
  hash("facilityHash", input.facilityHash);
  hash("actionHash", input.actionHash);
  cloid("cloid", input.cloid);
  if (!OBSERVATION_KINDS.has(input.kind)) {
    fail(
      "invalid_hyperliquid_reconciliation_observation",
      "observation kind is unsupported"
    );
  }
  if (!VENUE_STATUSES.has(input.venueStatus)) {
    fail(
      "invalid_hyperliquid_reconciliation_observation",
      "venue order status is unsupported"
    );
  }
  decimal("cumulativeFilledSize", input.cumulativeFilledSize);
  minor(
    "cumulativeFillNotionalMinor",
    input.cumulativeFillNotionalMinor
  );
  if (input.venueOrderReferenceHash !== null) {
    hash("venueOrderReferenceHash", input.venueOrderReferenceHash);
  }
  hash("orderStateHash", input.orderStateHash);
  hash("positionStateHash", input.positionStateHash);
  hash("accountStateHash", input.accountStateHash);
  if (!["FRESH", "STALE", "UNKNOWN"].includes(input.freshness)) {
    fail(
      "invalid_hyperliquid_reconciliation_observation",
      "observation freshness is unsupported"
    );
  }
  if (typeof input.complete !== "boolean") {
    fail(
      "invalid_hyperliquid_reconciliation_observation",
      "observation completeness must be boolean"
    );
  }
  safeCode("reasonCode", input.reasonCode);
  if (
    input.kind !==
      HyperliquidReconciliationObservationKind.NORMALIZED_STATE &&
    (input.venueStatus !== HyperliquidVenueOrderStatus.UNKNOWN ||
      input.freshness !== "UNKNOWN" ||
      input.complete !== false)
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_observation",
      "system failure observation cannot claim venue truth"
    );
  }
  const observedAt = iso(clockMs(clock));
  const core = {
    ...structuredClone(input),
    observedAt,
    simulationOnly: true,
    externalSystemQueried: false,
    rawResponseIncluded: false,
    secretsIncluded: false,
    schemaVersion: "hyperliquid_testnet_simulated_venue_observation.v1"
  };
  const sourceEvidenceHash = hashId(
    "hyperliquid_testnet_simulated_venue_source_evidence",
    core
  );
  return deepFreeze({
    observationId: deterministicObservationId(sourceEvidenceHash),
    sourceEvidenceHash,
    ...core
  });
}

function assertObservation(value, expected = null) {
  exactKeys(
    value,
    [
      "observationId",
      "sourceEvidenceHash",
      "executionHash",
      "facilityHash",
      "actionHash",
      "cloid",
      "kind",
      "venueStatus",
      "cumulativeFilledSize",
      "cumulativeFillNotionalMinor",
      "venueOrderReferenceHash",
      "orderStateHash",
      "positionStateHash",
      "accountStateHash",
      "freshness",
      "complete",
      "reasonCode",
      "observedAt",
      "simulationOnly",
      "externalSystemQueried",
      "rawResponseIncluded",
      "secretsIncluded",
      "schemaVersion"
    ],
    [],
    "invalid_hyperliquid_reconciliation_observation"
  );
  identifier("observationId", value.observationId);
  hash("sourceEvidenceHash", value.sourceEvidenceHash);
  if (
    value.observationId !==
    deterministicObservationId(value.sourceEvidenceHash)
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_observation",
      "observation identity is not source deterministic"
    );
  }
  const recreatedCore = {
    executionHash: value.executionHash,
    facilityHash: value.facilityHash,
    actionHash: value.actionHash,
    cloid: value.cloid,
    kind: value.kind,
    venueStatus: value.venueStatus,
    cumulativeFilledSize: value.cumulativeFilledSize,
    cumulativeFillNotionalMinor: value.cumulativeFillNotionalMinor,
    venueOrderReferenceHash: value.venueOrderReferenceHash,
    orderStateHash: value.orderStateHash,
    positionStateHash: value.positionStateHash,
    accountStateHash: value.accountStateHash,
    freshness: value.freshness,
    complete: value.complete,
    reasonCode: value.reasonCode,
    observedAt: value.observedAt,
    simulationOnly: value.simulationOnly,
    externalSystemQueried: value.externalSystemQueried,
    rawResponseIncluded: value.rawResponseIncluded,
    secretsIncluded: value.secretsIncluded,
    schemaVersion: value.schemaVersion
  };
  if (
    value.sourceEvidenceHash !==
    hashId(
      "hyperliquid_testnet_simulated_venue_source_evidence",
      recreatedCore
    )
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_observation",
      "observation source Evidence hash is invalid"
    );
  }
  hash("executionHash", value.executionHash);
  hash("facilityHash", value.facilityHash);
  hash("actionHash", value.actionHash);
  cloid("cloid", value.cloid);
  if (
    !OBSERVATION_KINDS.has(value.kind) ||
    !VENUE_STATUSES.has(value.venueStatus)
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_observation",
      "observation classification is unsupported"
    );
  }
  decimal("cumulativeFilledSize", value.cumulativeFilledSize);
  minor(
    "cumulativeFillNotionalMinor",
    value.cumulativeFillNotionalMinor
  );
  if (value.venueOrderReferenceHash !== null) {
    hash("venueOrderReferenceHash", value.venueOrderReferenceHash);
  }
  hash("orderStateHash", value.orderStateHash);
  hash("positionStateHash", value.positionStateHash);
  hash("accountStateHash", value.accountStateHash);
  if (
    !["FRESH", "STALE", "UNKNOWN"].includes(value.freshness) ||
    typeof value.complete !== "boolean"
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_observation",
      "observation freshness or completeness is invalid"
    );
  }
  safeCode("reasonCode", value.reasonCode);
  timestamp("observedAt", value.observedAt);
  if (
    value.simulationOnly !== true ||
    value.externalSystemQueried !== false ||
    value.rawResponseIncluded !== false ||
    value.secretsIncluded !== false ||
    value.schemaVersion !==
      "hyperliquid_testnet_simulated_venue_observation.v1"
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_observation",
      "observation left the protected simulation boundary"
    );
  }
  if (
    expected &&
    (value.executionHash !== expected.executionHash ||
      value.facilityHash !== expected.facilityHash ||
      value.actionHash !== expected.actionHash ||
      value.cloid !== expected.cloid)
  ) {
    fail(
      "hyperliquid_reconciliation_observation_binding_mismatch",
      "observation is bound to another command"
    );
  }
  return deepFreeze(structuredClone(value));
}

function assertRecord(record) {
  exactKeys(
    record,
    RECORD_KEYS,
    [],
    "invalid_hyperliquid_reconciliation_record"
  );
  identifier("reconciliationId", record.reconciliationId);
  for (const name of [
    "reconciliationHash",
    "requestHash",
    "idempotencyKeyHash",
    "executionHash",
    "actionHash",
    "facilityHash",
    "facilityStateHash",
    "orderIntentHash",
    "orderIntentStateHash",
    "accountBindingHash",
    "signerReferenceHash",
    "canonicalLedgerStateHash",
    "riskSnapshotHash",
    "initialKernelSnapshotHash",
    "latestKernelSnapshotHash",
    "authorizationDecisionHash",
    "admissionDecisionHash",
    "authorizedActorHash"
  ]) {
    hash(name, record[name]);
  }
  for (const name of [
    "executionId",
    "facilityId",
    "orderIntentId",
    "subjectId",
    "obligationId"
  ]) {
    identifier(name, record[name]);
  }
  if (
    !EXECUTION_NONCE_STATES.has(record.executionNonceState) ||
    !ACTION_KINDS.has(record.actionKind) ||
    !RISK_STATE_SET.has(record.effectiveRiskState) ||
    !Object.values(HyperliquidReconciliationStatus).includes(record.status) ||
    !Object.values(HyperliquidReconciledOrderState).includes(
      record.reconciledOrderState
    )
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_record",
      "record state is unsupported"
    );
  }
  positiveInteger("nonce", record.nonce);
  cloid("cloid", record.cloid);
  positiveInteger("facilityVersion", record.facilityVersion);
  positiveInteger("orderIntentVersion", record.orderIntentVersion);
  decimal("requestedSize", record.requestedSize);
  minor("requestedNotionalMinor", record.requestedNotionalMinor);
  nonNegativeInteger("ledgerTransactionCount", record.ledgerTransactionCount);
  decimal("cumulativeFilledSize", record.cumulativeFilledSize);
  minor(
    "cumulativeFillNotionalMinor",
    record.cumulativeFillNotionalMinor
  );
  minor(
    "latestEconomicDeltaNotionalMinor",
    record.latestEconomicDeltaNotionalMinor
  );
  for (const name of [
    "processedObservationCount",
    "adapterFailureCount",
    "pollAttemptCount"
  ]) {
    const value = nonNegativeInteger(name, record[name]);
    if (value > MAXIMUM_OBSERVATIONS) {
      fail(
        "invalid_hyperliquid_reconciliation_record",
        `${name} exceeds the closed bound`
      );
    }
  }
  positiveInteger("version", record.version);
  if (record.latestSourceEvidenceHash !== null) {
    hash("latestSourceEvidenceHash", record.latestSourceEvidenceHash);
  }
  if (record.resultHash !== null) hash("resultHash", record.resultHash);
  timestamp("createdAt", record.createdAt);
  timestamp("updatedAt", record.updatedAt);
  if (record.resolvedAt !== null) timestamp("resolvedAt", record.resolvedAt);
  if (
    !Array.isArray(record.incidentReasonCodes) ||
    record.incidentReasonCodes.length > 16 ||
    new Set(record.incidentReasonCodes).size !==
      record.incidentReasonCodes.length
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_record",
      "incident reason codes are invalid"
    );
  }
  for (const code of record.incidentReasonCodes) safeCode("reasonCode", code);
  for (const name of [
    "circuitBreakerOpen",
    "manualSafeStop",
    "newRiskBlocked",
    "reconciled"
  ]) {
    if (typeof record[name] !== "boolean") {
      fail(
        "invalid_hyperliquid_reconciliation_record",
        `${name} must be boolean`
      );
    }
  }
  if (
    TERMINAL_STATUSES.has(record.status) !==
      (record.resultHash !== null && record.resolvedAt !== null) ||
    (record.status === HyperliquidReconciliationStatus.UNKNOWN &&
      (record.outcome !== "unknown" ||
        record.reconciled !== false ||
        record.newRiskBlocked !== true)) ||
    (record.status === HyperliquidReconciliationStatus.PENDING &&
      (record.version !== 1 ||
        record.outcome !== null ||
        record.reconciledOrderState !==
          HyperliquidReconciledOrderState.PENDING ||
        record.processedObservationCount !== 0 ||
        record.latestSourceEvidenceHash !== null)) ||
    (record.status === HyperliquidReconciliationStatus.SAFE_STOPPED &&
      (record.manualSafeStop !== true ||
        record.circuitBreakerOpen !== true ||
        record.outcome !== "safe_stopped"))
  ) {
    fail(
      "invalid_hyperliquid_reconciliation_record",
      "record state evidence is inconsistent"
    );
  }
  assertSafety(record);
  return record;
}

function createDraft(input, snapshot, guard) {
  const idempotencyKeyHash = hashId(
    "hyperliquid_testnet_reconciliation_idempotency",
    { idempotencyKey: input.idempotencyKey }
  );
  const requestCore = {
    executionId: input.executionId,
    executionHash: input.executionHash,
    facilityId: snapshot.facilityId,
    facilityHash: snapshot.facilityHash,
    orderIntentId: snapshot.orderIntentId,
    orderIntentHash: snapshot.orderIntentHash,
    actionHash: snapshot.actionHash,
    nonce: snapshot.nonce,
    kernelSnapshotHash: kernelSnapshotHash(snapshot),
    authorizationDecisionHash: guard.authorizationDecisionHash,
    admissionDecisionHash: guard.admissionDecisionHash,
    idempotencyKeyHash
  };
  const requestHash = hashId(
    "hyperliquid_testnet_reconciliation_request",
    requestCore
  );
  return deepFreeze({
    reconciliationId: deterministicReconciliationId(requestHash),
    requestHash,
    idempotencyKeyHash,
    snapshot,
    guard
  });
}

export function createPendingHyperliquidReconciliationRecord(
  draft,
  { nowMs }
) {
  positiveInteger("nowMs", nowMs);
  const createdAt = iso(nowMs);
  const snapshot = assertKernelSnapshot(draft.snapshot);
  const immutable = {
    reconciliationId: draft.reconciliationId,
    requestHash: draft.requestHash,
    executionHash: snapshot.executionHash,
    facilityHash: snapshot.facilityHash,
    orderIntentHash: snapshot.orderIntentHash,
    actionHash: snapshot.actionHash,
    nonce: snapshot.nonce
  };
  const initialKernelSnapshotHash = kernelSnapshotHash(snapshot);
  const record = {
    reconciliationId: draft.reconciliationId,
    reconciliationHash: hashId(
      "hyperliquid_testnet_reconciliation",
      immutable
    ),
    requestHash: draft.requestHash,
    idempotencyKeyHash: draft.idempotencyKeyHash,
    executionId: snapshot.executionId,
    executionHash: snapshot.executionHash,
    executionNonceState: snapshot.executionNonceState,
    nonce: snapshot.nonce,
    actionKind: snapshot.actionKind,
    actionHash: snapshot.actionHash,
    cloid: snapshot.cloid,
    facilityId: snapshot.facilityId,
    facilityHash: snapshot.facilityHash,
    facilityStateHash: snapshot.facilityStateHash,
    facilityVersion: snapshot.facilityVersion,
    orderIntentId: snapshot.orderIntentId,
    orderIntentHash: snapshot.orderIntentHash,
    orderIntentStateHash: snapshot.orderIntentStateHash,
    orderIntentVersion: snapshot.orderIntentVersion,
    subjectId: snapshot.subjectId,
    obligationId: snapshot.obligationId,
    accountBindingHash: snapshot.accountBindingHash,
    signerReferenceHash: snapshot.signerReferenceHash,
    requestedSize: snapshot.requestedSize,
    requestedNotionalMinor: snapshot.requestedNotionalMinor,
    canonicalLedgerStateHash: snapshot.canonicalLedgerStateHash,
    ledgerTransactionCount: snapshot.ledgerTransactionCount,
    riskSnapshotHash: snapshot.riskSnapshotHash,
    effectiveRiskState: snapshot.riskState,
    initialKernelSnapshotHash,
    latestKernelSnapshotHash: initialKernelSnapshotHash,
    authorizationDecisionHash: draft.guard.authorizationDecisionHash,
    admissionDecisionHash: draft.guard.admissionDecisionHash,
    authorizedActorHash: draft.guard.authorizedActorHash,
    status: HyperliquidReconciliationStatus.PENDING,
    outcome: null,
    reconciledOrderState: HyperliquidReconciledOrderState.PENDING,
    cumulativeFilledSize: "0",
    cumulativeFillNotionalMinor: "0",
    latestEconomicDeltaNotionalMinor: "0",
    processedObservationCount: 0,
    latestSourceEvidenceHash: null,
    adapterFailureCount: 0,
    pollAttemptCount: 0,
    circuitBreakerOpen: false,
    manualSafeStop: false,
    newRiskBlocked: true,
    reconciled: false,
    incidentReasonCodes: [],
    resultHash: null,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
    ...baseSafety()
  };
  assertRecord(record);
  return deepFreeze(record);
}

function kernelContradiction(record, snapshot) {
  if (
    snapshot.executionId !== record.executionId ||
    snapshot.executionHash !== record.executionHash ||
    snapshot.nonce !== record.nonce ||
    snapshot.actionKind !== record.actionKind ||
    snapshot.actionHash !== record.actionHash ||
    snapshot.cloid !== record.cloid ||
    snapshot.facilityId !== record.facilityId ||
    snapshot.facilityHash !== record.facilityHash ||
    snapshot.facilityStateHash !== record.facilityStateHash ||
    snapshot.facilityVersion !== record.facilityVersion ||
    snapshot.orderIntentId !== record.orderIntentId ||
    snapshot.orderIntentHash !== record.orderIntentHash ||
    snapshot.orderIntentStateHash !== record.orderIntentStateHash ||
    snapshot.orderIntentVersion !== record.orderIntentVersion ||
    snapshot.subjectId !== record.subjectId ||
    snapshot.obligationId !== record.obligationId ||
    snapshot.accountBindingHash !== record.accountBindingHash ||
    snapshot.signerReferenceHash !== record.signerReferenceHash ||
    snapshot.requestedSize !== record.requestedSize ||
    snapshot.requestedNotionalMinor !== record.requestedNotionalMinor
  ) {
    return "kernel_binding_changed";
  }
  if (
    snapshot.canonicalLedgerStateHash !== record.canonicalLedgerStateHash ||
    snapshot.ledgerTransactionCount !== record.ledgerTransactionCount
  ) {
    return "canonical_ledger_changed";
  }
  if (riskRank(snapshot.riskState) < riskRank(record.effectiveRiskState)) {
    return "risk_state_became_less_restrictive";
  }
  return null;
}

function derivedState(record, observation, circuitBreakerFailureThreshold) {
  const currentSize = decimalAtoms(record.cumulativeFilledSize);
  const observedSize = decimalAtoms(observation.cumulativeFilledSize);
  const requestedSize = decimalAtoms(record.requestedSize);
  const currentNotional = BigInt(record.cumulativeFillNotionalMinor);
  const observedNotional = BigInt(
    observation.cumulativeFillNotionalMinor
  );
  const requestedNotional = BigInt(record.requestedNotionalMinor);
  const cancelAction = ["cancel", "cancelByCloid"].includes(record.actionKind);
  let incidentReason = null;
  if (
    observation.executionHash !== record.executionHash ||
    observation.facilityHash !== record.facilityHash ||
    observation.actionHash !== record.actionHash ||
    observation.cloid !== record.cloid
  ) {
    incidentReason = "venue_observation_binding_changed";
  } else if (
    observedSize < currentSize ||
    observedNotional < currentNotional
  ) {
    incidentReason = "cumulative_fill_regressed";
  } else if (
    observedSize > requestedSize ||
    observedNotional > requestedNotional
  ) {
    incidentReason = "cumulative_fill_exceeded_request";
  } else if (
    cancelAction &&
    (observedSize !== 0n || observedNotional !== 0n)
  ) {
    incidentReason = "cancel_observation_invented_fill";
  } else if (
    (observedSize === currentSize) !==
    (observedNotional === currentNotional)
  ) {
    incidentReason = "fill_cursor_dimensions_diverged";
  }

  const adapterFailure =
    observation.kind ===
    HyperliquidReconciliationObservationKind.ADAPTER_OUTAGE;
  const nextFailureCount = adapterFailure
    ? record.adapterFailureCount + 1
    : observation.kind ===
        HyperliquidReconciliationObservationKind.NORMALIZED_STATE &&
      observation.freshness === "FRESH" &&
      observation.complete === true
      ? 0
      : record.adapterFailureCount;
  let status;
  let outcome;
  let orderState;
  let reconciled = false;
  let newRiskBlocked = true;
  let circuitBreakerOpen =
    record.circuitBreakerOpen ||
    nextFailureCount >= circuitBreakerFailureThreshold;

  if (incidentReason !== null) {
    status = HyperliquidReconciliationStatus.INCIDENT;
    outcome = "incident";
    orderState = HyperliquidReconciledOrderState.INCIDENT;
    circuitBreakerOpen = true;
  } else if (
    observation.kind !==
      HyperliquidReconciliationObservationKind.NORMALIZED_STATE ||
    observation.freshness !== "FRESH" ||
    observation.complete !== true ||
    [
      HyperliquidVenueOrderStatus.NOT_FOUND,
      HyperliquidVenueOrderStatus.UNKNOWN
    ].includes(observation.venueStatus)
  ) {
    status = HyperliquidReconciliationStatus.UNKNOWN;
    outcome = "unknown";
    orderState = HyperliquidReconciledOrderState.UNKNOWN;
  } else {
    switch (observation.venueStatus) {
      case HyperliquidVenueOrderStatus.OPEN:
        status = HyperliquidReconciliationStatus.PARTIAL;
        outcome = "partial";
        orderState =
          observedSize === 0n
            ? HyperliquidReconciledOrderState.OPEN
            : HyperliquidReconciledOrderState.PARTIALLY_FILLED;
        break;
      case HyperliquidVenueOrderStatus.PARTIALLY_FILLED:
        if (
          observedSize === 0n ||
          observedSize >= requestedSize ||
          observedNotional === 0n
        ) {
          incidentReason = "invalid_partial_fill";
          status = HyperliquidReconciliationStatus.INCIDENT;
          outcome = "incident";
          orderState = HyperliquidReconciledOrderState.INCIDENT;
          circuitBreakerOpen = true;
        } else {
          status = HyperliquidReconciliationStatus.PARTIAL;
          outcome = "partial";
          orderState =
            HyperliquidReconciledOrderState.PARTIALLY_FILLED;
        }
        break;
      case HyperliquidVenueOrderStatus.FILLED:
        if (
          cancelAction ||
          observedSize !== requestedSize ||
          observedNotional === 0n
        ) {
          incidentReason = "invalid_terminal_fill";
          status = HyperliquidReconciliationStatus.INCIDENT;
          outcome = "incident";
          orderState = HyperliquidReconciledOrderState.INCIDENT;
          circuitBreakerOpen = true;
        } else {
          status = HyperliquidReconciliationStatus.RECONCILED;
          outcome = "confirmed";
          orderState = HyperliquidReconciledOrderState.FILLED;
          reconciled = true;
          newRiskBlocked =
            riskRank(record.effectiveRiskState) >=
            riskRank("REDUCE_ONLY");
        }
        break;
      case HyperliquidVenueOrderStatus.CANCELED:
        status = HyperliquidReconciliationStatus.RECONCILED;
        outcome = "canceled";
        orderState = HyperliquidReconciledOrderState.CANCELED;
        reconciled = true;
        newRiskBlocked =
          riskRank(record.effectiveRiskState) >= riskRank("REDUCE_ONLY");
        break;
      case HyperliquidVenueOrderStatus.REJECTED:
        if (observedSize !== 0n || observedNotional !== 0n) {
          incidentReason = "rejected_order_has_fill";
          status = HyperliquidReconciliationStatus.INCIDENT;
          outcome = "incident";
          orderState = HyperliquidReconciledOrderState.INCIDENT;
          circuitBreakerOpen = true;
        } else {
          status = HyperliquidReconciliationStatus.REJECTED;
          outcome = "rejected";
          orderState = HyperliquidReconciledOrderState.REJECTED;
          reconciled = true;
          newRiskBlocked =
            riskRank(record.effectiveRiskState) >=
            riskRank("REDUCE_ONLY");
        }
        break;
      default:
        fail(
          "invalid_hyperliquid_reconciliation_observation",
          "venue order status is unsupported"
        );
    }
  }
  return {
    status,
    outcome,
    orderState,
    reconciled,
    newRiskBlocked,
    circuitBreakerOpen,
    nextFailureCount,
    incidentReason,
    economicDeltaNotionalMinor: (
      observedNotional - currentNotional
    ).toString()
  };
}

export function transitionHyperliquidReconciliationRecord(
  record,
  {
    observation,
    kernelSnapshot,
    circuitBreakerFailureThreshold,
    nowMs
  }
) {
  assertRecord(record);
  if (TERMINAL_STATUSES.has(record.status)) {
    fail(
      "hyperliquid_reconciliation_terminal",
      "terminal reconciliation cannot be mutated"
    );
  }
  positiveInteger(
    "circuitBreakerFailureThreshold",
    circuitBreakerFailureThreshold
  );
  positiveInteger("nowMs", nowMs);
  const normalizedObservation = assertObservation(observation);
  const snapshot = assertKernelSnapshot(kernelSnapshot, record);
  const contradiction = kernelContradiction(record, snapshot);
  const derived = derivedState(
    record,
    normalizedObservation,
    circuitBreakerFailureThreshold
  );
  const incidentReason = contradiction ?? derived.incidentReason;
  const status =
    incidentReason === null
      ? derived.status
      : HyperliquidReconciliationStatus.INCIDENT;
  const outcome = incidentReason === null ? derived.outcome : "incident";
  const orderState =
    incidentReason === null
      ? derived.orderState
      : HyperliquidReconciledOrderState.INCIDENT;
  const resolved = TERMINAL_STATUSES.has(status);
  const updatedAt = iso(nowMs);
  const incidentReasonCodes = [
    ...new Set([
      ...record.incidentReasonCodes,
      ...(incidentReason ? [incidentReason] : [])
    ])
  ];
  const next = {
    ...structuredClone(record),
    riskSnapshotHash:
      contradiction === null
        ? snapshot.riskSnapshotHash
        : record.riskSnapshotHash,
    effectiveRiskState:
      contradiction === null
        ? snapshot.riskState
        : record.effectiveRiskState,
    latestKernelSnapshotHash:
      contradiction === null
        ? kernelSnapshotHash(snapshot)
        : record.latestKernelSnapshotHash,
    status,
    outcome,
    reconciledOrderState: orderState,
    cumulativeFilledSize:
      incidentReason === null
        ? normalizedObservation.cumulativeFilledSize
        : record.cumulativeFilledSize,
    cumulativeFillNotionalMinor:
      incidentReason === null
        ? normalizedObservation.cumulativeFillNotionalMinor
        : record.cumulativeFillNotionalMinor,
    latestEconomicDeltaNotionalMinor:
      incidentReason === null
        ? derived.economicDeltaNotionalMinor
        : "0",
    processedObservationCount: record.processedObservationCount + 1,
    latestSourceEvidenceHash:
      normalizedObservation.sourceEvidenceHash,
    adapterFailureCount: derived.nextFailureCount,
    pollAttemptCount: record.pollAttemptCount + 1,
    circuitBreakerOpen:
      incidentReason !== null ? true : derived.circuitBreakerOpen,
    newRiskBlocked:
      incidentReason !== null
        ? true
        : derived.newRiskBlocked ||
          riskRank(snapshot.riskState) >= riskRank("REDUCE_ONLY"),
    reconciled: incidentReason === null ? derived.reconciled : false,
    incidentReasonCodes,
    resultHash: resolved
      ? hashId("hyperliquid_testnet_reconciliation_result", {
          reconciliationHash: record.reconciliationHash,
          status,
          outcome,
          sourceEvidenceHash:
            normalizedObservation.sourceEvidenceHash,
          cumulativeFilledSize:
            normalizedObservation.cumulativeFilledSize,
          cumulativeFillNotionalMinor:
            normalizedObservation.cumulativeFillNotionalMinor,
          ledgerStateHash: record.canonicalLedgerStateHash,
          facilityStateHash: record.facilityStateHash,
          riskSnapshotHash: snapshot.riskSnapshotHash,
          nonce: record.nonce,
          incidentReason
        })
      : null,
    version: record.version + 1,
    updatedAt,
    resolvedAt: resolved ? updatedAt : null
  };
  assertRecord(next);
  return deepFreeze(next);
}

export function safeStopHyperliquidReconciliationRecord(
  record,
  { reasonCode, nowMs }
) {
  assertRecord(record);
  if (TERMINAL_STATUSES.has(record.status)) return record;
  safeCode("reasonCode", reasonCode);
  positiveInteger("nowMs", nowMs);
  const updatedAt = iso(nowMs);
  const next = {
    ...structuredClone(record),
    status: HyperliquidReconciliationStatus.SAFE_STOPPED,
    outcome: "safe_stopped",
    reconciledOrderState:
      HyperliquidReconciledOrderState.SAFE_STOPPED,
    latestEconomicDeltaNotionalMinor: "0",
    circuitBreakerOpen: true,
    manualSafeStop: true,
    newRiskBlocked: true,
    reconciled: false,
    incidentReasonCodes: [
      ...new Set([...record.incidentReasonCodes, reasonCode])
    ],
    resultHash: hashId(
      "hyperliquid_testnet_reconciliation_safe_stop",
      {
        reconciliationHash: record.reconciliationHash,
        reasonCode,
        version: record.version + 1,
        ledgerStateHash: record.canonicalLedgerStateHash,
        facilityStateHash: record.facilityStateHash
      }
    ),
    version: record.version + 1,
    updatedAt,
    resolvedAt: updatedAt
  };
  assertRecord(next);
  return deepFreeze(next);
}

function eventFor(record, {
  eventType,
  actorId,
  reasonCode,
  nowMs
}) {
  const payload = {
    reconciliationId: record.reconciliationId,
    reconciliationHash: record.reconciliationHash,
    executionHash: record.executionHash,
    facilityHash: record.facilityHash,
    orderIntentHash: record.orderIntentHash,
    status: record.status,
    outcome: record.outcome,
    reconciledOrderState: record.reconciledOrderState,
    recordVersion: record.version,
    cumulativeFilledSize: record.cumulativeFilledSize,
    cumulativeFillNotionalMinor:
      record.cumulativeFillNotionalMinor,
    economicDeltaNotionalMinor:
      record.latestEconomicDeltaNotionalMinor,
    latestSourceEvidenceHash: record.latestSourceEvidenceHash,
    canonicalLedgerStateHash: record.canonicalLedgerStateHash,
    facilityStateHash: record.facilityStateHash,
    riskSnapshotHash: record.riskSnapshotHash,
    nonce: record.nonce,
    executionNonceState: record.executionNonceState,
    circuitBreakerOpen: record.circuitBreakerOpen,
    manualSafeStop: record.manualSafeStop,
    newRiskBlocked: record.newRiskBlocked,
    reconciled: record.reconciled,
    ledgerMutationCreated: false,
    facilityMutationCreated: false,
    secondLedgerCreated: false,
    simulationOnly: true,
    externalSystemQueried: false,
    externalOrderSubmitted: false,
    productionAuthority: false,
    fundsAuthority: false,
    secretsIncluded: false,
    reasonCode,
    actorId
  };
  return createCreditEvent({
    eventType,
    subjectId: record.subjectId,
    obligationId: record.obligationId,
    payload,
    now: new Date(nowMs)
  });
}

function inMemoryEvidence(event, record, aggregateVersion, nowMs) {
  return createEvidenceEnvelope({
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateType: "trading_execution_reconciliation",
    aggregateId: record.reconciliationId,
    aggregateVersion,
    subjectId: record.subjectId,
    obligationId: record.obligationId,
    correlationId: record.reconciliationId,
    idempotencyKey: `${record.idempotencyKeyHash}:${aggregateVersion}`,
    actorRef: event.payload.actorId,
    sourceSystem: "ipo.one.tc303.simulation",
    sourceFinality: event.finalityStatus,
    payload: event.payload,
    occurredAt: event.occurredAt,
    recordedAt: iso(nowMs)
  });
}

export class InMemoryHyperliquidReconciliationRepository {
  #records = new Map();
  #idempotency = new Map();
  #safeStops = new Map();
  #events = new Map();
  #evidences = new Map();
  #outbox = new Map();
  #inbox = new Map();
  #queue = Promise.resolve();

  constructor(snapshot) {
    if (snapshot === undefined) return;
    exactKeys(
      snapshot,
      [
        "records",
        "idempotency",
        "safeStops",
        "events",
        "evidences",
        "outbox",
        "inbox"
      ],
      [],
      "invalid_hyperliquid_reconciliation_snapshot"
    );
    for (const record of snapshot.records) {
      assertRecord(record);
      this.#records.set(
        record.reconciliationId,
        deepFreeze(structuredClone(record))
      );
    }
    this.#idempotency = new Map(structuredClone(snapshot.idempotency));
    this.#safeStops = new Map(structuredClone(snapshot.safeStops));
    this.#events = new Map(structuredClone(snapshot.events));
    this.#evidences = new Map(structuredClone(snapshot.evidences));
    this.#outbox = new Map(structuredClone(snapshot.outbox));
    this.#inbox = new Map(structuredClone(snapshot.inbox));
  }

  #exclusive(operation) {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => {});
    return next;
  }

  #append(record, event, nowMs) {
    const events = this.#events.get(record.reconciliationId) ?? [];
    const evidence = inMemoryEvidence(
      event,
      record,
      record.version,
      nowMs
    );
    events.push(structuredClone(event));
    this.#events.set(record.reconciliationId, events);
    this.#evidences.set(record.reconciliationId, [
      ...(this.#evidences.get(record.reconciliationId) ?? []),
      structuredClone(evidence)
    ]);
    this.#outbox.set(event.eventId, {
      outboxMessageId: `outbox_${event.eventId}`,
      topic: RECONCILIATION_OUTBOX_TOPIC,
      messageKey: record.reconciliationId,
      payloadHash: hashId("outbox_payload", { event, evidence }),
      published: false,
      attempts: 0
    });
  }

  async start(draft, { nowMs }) {
    return this.#exclusive(async () => {
      const existingId = this.#idempotency.get(draft.idempotencyKeyHash);
      if (existingId) {
        const existing = this.#records.get(existingId);
        if (existing.requestHash !== draft.requestHash) {
          fail(
            "hyperliquid_reconciliation_idempotency_conflict",
            "idempotency key is bound to another reconciliation"
          );
        }
        return { record: existing, replayed: true };
      }
      const record = createPendingHyperliquidReconciliationRecord(draft, {
        nowMs
      });
      const event = eventFor(record, {
        eventType: "trading_testnet_reconciliation_started",
        actorId: draft.guard.actorId,
        reasonCode: "reconciliation_started",
        nowMs
      });
      this.#records.set(record.reconciliationId, record);
      this.#idempotency.set(
        record.idempotencyKeyHash,
        record.reconciliationId
      );
      this.#append(record, event, nowMs);
      return { record, replayed: false };
    });
  }

  async consumeObservation({
    reconciliationId,
    observation,
    kernelSnapshot,
    circuitBreakerFailureThreshold,
    actorId,
    nowMs
  }) {
    return this.#exclusive(async () => {
      const normalized = assertObservation(observation);
      const payloadHash = hashId("inbox_payload", normalized);
      const inboxKey = `${RECONCILIATION_INBOX_CONSUMER}\0${normalized.observationId}`;
      const existingInbox = this.#inbox.get(inboxKey);
      if (existingInbox) {
        if (existingInbox.payloadHash !== payloadHash) {
          fail(
            "hyperliquid_reconciliation_inbox_conflict",
            "observation identity was reused with another payload"
          );
        }
        return {
          record: this.#records.get(reconciliationId),
          replayed: true
        };
      }
      const current = this.#records.get(reconciliationId);
      if (!current) {
        fail(
          "hyperliquid_reconciliation_unavailable",
          "reconciliation record is unavailable"
        );
      }
      if (TERMINAL_STATUSES.has(current.status)) {
        this.#inbox.set(inboxKey, {
          payloadHash,
          status: "completed",
          terminalIgnored: true
        });
        return { record: current, replayed: true };
      }
      const next = transitionHyperliquidReconciliationRecord(current, {
        observation: normalized,
        kernelSnapshot,
        circuitBreakerFailureThreshold,
        nowMs
      });
      const event = eventFor(next, {
        eventType: TERMINAL_STATUSES.has(next.status)
          ? "trading_testnet_reconciliation_resolved"
          : "trading_testnet_reconciliation_observed",
        actorId,
        reasonCode: normalized.reasonCode,
        nowMs
      });
      this.#records.set(reconciliationId, next);
      this.#append(next, event, nowMs);
      this.#inbox.set(inboxKey, {
        payloadHash,
        status: "completed",
        terminalIgnored: false
      });
      return { record: next, replayed: false };
    });
  }

  async safeStop({
    reconciliationId,
    idempotencyKeyHash,
    commandHash,
    reasonCode,
    actorId,
    nowMs
  }) {
    return this.#exclusive(async () => {
      const existing = this.#safeStops.get(idempotencyKeyHash);
      if (existing) {
        if (existing.commandHash !== commandHash) {
          fail(
            "hyperliquid_reconciliation_idempotency_conflict",
            "safe-stop idempotency key is bound to another command"
          );
        }
        return {
          record: this.#records.get(existing.reconciliationId),
          replayed: true
        };
      }
      const current = this.#records.get(reconciliationId);
      if (!current) {
        fail(
          "hyperliquid_reconciliation_unavailable",
          "reconciliation record is unavailable"
        );
      }
      const next = safeStopHyperliquidReconciliationRecord(current, {
        reasonCode,
        nowMs
      });
      if (next !== current) {
        const event = eventFor(next, {
          eventType: "trading_testnet_reconciliation_safe_stopped",
          actorId,
          reasonCode,
          nowMs
        });
        this.#records.set(reconciliationId, next);
        this.#append(next, event, nowMs);
      }
      this.#safeStops.set(idempotencyKeyHash, {
        reconciliationId,
        commandHash
      });
      return { record: next, replayed: false };
    });
  }

  async findById(reconciliationId) {
    identifier("reconciliationId", reconciliationId);
    return this.#records.get(reconciliationId);
  }

  async history(reconciliationId) {
    identifier("reconciliationId", reconciliationId);
    return structuredClone(this.#events.get(reconciliationId) ?? []);
  }

  exportSnapshot() {
    return deepFreeze({
      records: [...this.#records.values()].map((value) =>
        structuredClone(value)
      ),
      idempotency: [...this.#idempotency.entries()],
      safeStops: [...this.#safeStops.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ]),
      events: [...this.#events.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ]),
      evidences: [...this.#evidences.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ]),
      outbox: [...this.#outbox.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ]),
      inbox: [...this.#inbox.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ])
    });
  }
}

export class SimulatedHyperliquidReconciliationCommandGuard {
  constructor(options = {}) {
    exactKeys(
      options,
      [],
      [],
      "invalid_hyperliquid_reconciliation_guard_configuration"
    );
    this.profile = deepFreeze({
      serverOwned: true,
      tenantContextResolved: true,
      simulationOnly: true,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion:
        "hyperliquid_testnet_simulated_reconciliation_guard_profile.v1"
    });
  }

  async authorize({ operation, requestHash, facilityId }) {
    if (!["reconcile", "safe_stop"].includes(operation)) {
      fail(
        "hyperliquid_reconciliation_guard_denied",
        "operation is outside the internal reconciliation allowlist"
      );
    }
    hash("requestHash", requestHash);
    identifier("facilityId", facilityId);
    const actorId = "system:tc303-simulated-reconciliation";
    return deepFreeze({
      approved: true,
      authorizationDecisionHash: hashId(
        "hyperliquid_testnet_simulated_reconciliation_authorization",
        { operation, requestHash, facilityId, actorId }
      ),
      admissionDecisionHash: hashId(
        "hyperliquid_testnet_simulated_reconciliation_admission",
        {
          operation,
          requestHash,
          facilityId,
          bounded: true,
          simulationOnly: true
        }
      ),
      authorizedActorHash: hashId("actor", actorId),
      actorId,
      tenantContextResolved: true,
      clientIdentityAccepted: false,
      simulationOnly: true,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion:
        "hyperliquid_testnet_simulated_reconciliation_guard.v1"
    });
  }
}

export class SimulatedHyperliquidReconciliationKernelResolver {
  #snapshots;
  #calls = 0;

  constructor({ snapshots, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !Array.isArray(snapshots) ||
      snapshots.length < 1 ||
      snapshots.length > 32
    ) {
      fail(
        "invalid_hyperliquid_reconciliation_kernel_resolver",
        "one through 32 closed snapshots are required"
      );
    }
    this.#snapshots = snapshots.map((value) =>
      assertKernelSnapshot(value)
    );
    this.profile = deepFreeze({
      serverOwned: true,
      simulationOnly: true,
      ledgerPostingAuthority: false,
      facilityMutationAuthority: false,
      networkAvailable: false,
      schemaVersion:
        "hyperliquid_testnet_simulated_kernel_resolver_profile.v1"
    });
  }

  async resolve({ executionId, executionHash }) {
    identifier("executionId", executionId);
    hash("executionHash", executionHash);
    const index = Math.min(this.#calls, this.#snapshots.length - 1);
    this.#calls += 1;
    return this.#snapshots[index];
  }

  get callCount() {
    return this.#calls;
  }
}

export class ScriptedHyperliquidVenueObservationAdapter {
  #steps;
  #calls = 0;

  constructor({ steps, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !Array.isArray(steps) ||
      steps.length < 1 ||
      steps.length > 32
    ) {
      fail(
        "invalid_hyperliquid_reconciliation_adapter",
        "one through 32 bounded simulation steps are required"
      );
    }
    this.#steps = steps.map((step) => {
      if (plainObject(step) && Object.keys(step).length === 1 &&
          Object.hasOwn(step, "errorCode")) {
        return { errorCode: safeCode("errorCode", step.errorCode) };
      }
      return assertObservation(step);
    });
    this.profile = deepFreeze({
      sourceFixed: true,
      simulationOnly: true,
      networkAvailable: false,
      liveTransportApproved: false,
      rawResponseAvailable: false,
      secretsAvailable: false,
      schemaVersion:
        "hyperliquid_testnet_scripted_observation_adapter.v1"
    });
  }

  async observe({ reconciliationId, executionHash, attempt }) {
    identifier("reconciliationId", reconciliationId);
    hash("executionHash", executionHash);
    positiveInteger("attempt", attempt);
    const index = Math.min(this.#calls, this.#steps.length - 1);
    this.#calls += 1;
    const step = this.#steps[index];
    if (Object.hasOwn(step, "errorCode")) {
      fail(step.errorCode, "simulated normalized adapter failure");
    }
    return step;
  }

  get callCount() {
    return this.#calls;
  }
}

function systemObservation(record, kind, reasonCode, nowMs) {
  return createSimulatedHyperliquidVenueObservation(
    {
      executionHash: record.executionHash,
      facilityHash: record.facilityHash,
      actionHash: record.actionHash,
      cloid: record.cloid,
      kind,
      venueStatus: HyperliquidVenueOrderStatus.UNKNOWN,
      cumulativeFilledSize: record.cumulativeFilledSize,
      cumulativeFillNotionalMinor:
        record.cumulativeFillNotionalMinor,
      venueOrderReferenceHash: null,
      orderStateHash: hashId(
        "hyperliquid_reconciliation_unknown_order_state",
        {
          reconciliationHash: record.reconciliationHash,
          recordVersion: record.version,
          kind,
          reasonCode
        }
      ),
      positionStateHash: hashId(
        "hyperliquid_reconciliation_unknown_position_state",
        {
          reconciliationHash: record.reconciliationHash,
          recordVersion: record.version,
          kind,
          reasonCode
        }
      ),
      accountStateHash: hashId(
        "hyperliquid_reconciliation_unknown_account_state",
        {
          reconciliationHash: record.reconciliationHash,
          recordVersion: record.version,
          kind,
          reasonCode
        }
      ),
      freshness: "UNKNOWN",
      complete: false,
      reasonCode
    },
    { clock: () => nowMs }
  );
}

export class HyperliquidTestnetReconciliationService {
  #repository;
  #commandGuard;
  #kernelResolver;
  #observationAdapter;
  #maxPollAttempts;
  #circuitBreakerFailureThreshold;
  #clock;

  constructor({
    repository,
    commandGuard,
    kernelResolver,
    observationAdapter,
    maxPollAttempts = 3,
    circuitBreakerFailureThreshold = 2,
    clock = Date.now,
    ...unknown
  } = {}) {
    if (Object.keys(unknown).length !== 0) {
      fail(
        "invalid_hyperliquid_reconciliation_configuration",
        "service configuration has an open shape"
      );
    }
    if (
      !repository ||
      typeof repository.start !== "function" ||
      typeof repository.consumeObservation !== "function" ||
      typeof repository.safeStop !== "function" ||
      typeof repository.findById !== "function" ||
      !commandGuard ||
      typeof commandGuard.authorize !== "function" ||
      commandGuard.profile?.serverOwned !== true ||
      commandGuard.profile?.tenantContextResolved !== true ||
      commandGuard.profile?.simulationOnly !== true ||
      !kernelResolver ||
      typeof kernelResolver.resolve !== "function" ||
      kernelResolver.profile?.serverOwned !== true ||
      kernelResolver.profile?.simulationOnly !== true ||
      kernelResolver.profile?.networkAvailable !== false ||
      kernelResolver.profile?.ledgerPostingAuthority !== false ||
      kernelResolver.profile?.facilityMutationAuthority !== false ||
      !observationAdapter ||
      typeof observationAdapter.observe !== "function" ||
      observationAdapter.profile?.sourceFixed !== true ||
      observationAdapter.profile?.simulationOnly !== true ||
      observationAdapter.profile?.networkAvailable !== false ||
      observationAdapter.profile?.liveTransportApproved !== false ||
      typeof clock !== "function"
    ) {
      fail(
        "hyperliquid_reconciliation_runtime_unavailable",
        "only the complete protected offline reconciliation composition is approved"
      );
    }
    if (
      !Number.isSafeInteger(maxPollAttempts) ||
      maxPollAttempts < 1 ||
      maxPollAttempts > 5 ||
      !Number.isSafeInteger(circuitBreakerFailureThreshold) ||
      circuitBreakerFailureThreshold < 1 ||
      circuitBreakerFailureThreshold > 5
    ) {
      fail(
        "invalid_hyperliquid_reconciliation_poll_policy",
        "poll and circuit-breaker bounds are outside the closed Testnet fixture"
      );
    }
    this.#repository = repository;
    this.#commandGuard = commandGuard;
    this.#kernelResolver = kernelResolver;
    this.#observationAdapter = observationAdapter;
    this.#maxPollAttempts = maxPollAttempts;
    this.#circuitBreakerFailureThreshold =
      circuitBreakerFailureThreshold;
    this.#clock = clock;
  }

  async reconcile(rawInput) {
    const input = assertRequest(rawInput);
    const firstSnapshot = assertKernelSnapshot(
      await this.#kernelResolver.resolve({
        executionId: input.executionId,
        executionHash: input.executionHash
      }),
      input
    );
    const preGuardRequestHash = hashId(
      "hyperliquid_testnet_reconciliation_pre_guard_request",
      {
        executionId: input.executionId,
        executionHash: input.executionHash,
        facilityId: firstSnapshot.facilityId,
        facilityHash: firstSnapshot.facilityHash,
        actionHash: firstSnapshot.actionHash,
        nonce: firstSnapshot.nonce
      }
    );
    const guard = assertGuardDecision(
      await this.#commandGuard.authorize({
        operation: "reconcile",
        requestHash: preGuardRequestHash,
        facilityId: firstSnapshot.facilityId
      })
    );
    const draft = createDraft(input, firstSnapshot, guard);
    const started = await this.#repository.start(draft, {
      nowMs: clockMs(this.#clock)
    });
    let record = started.record;
    assertRecord(record);
    if (
      TERMINAL_STATUSES.has(record.status) ||
      record.circuitBreakerOpen
    ) {
      return record;
    }

    for (let attempt = 1; attempt <= this.#maxPollAttempts; attempt += 1) {
      let observation;
      try {
        observation = assertObservation(
          await this.#observationAdapter.observe({
            reconciliationId: record.reconciliationId,
            executionHash: record.executionHash,
            attempt
          })
        );
      } catch {
        observation = systemObservation(
          record,
          HyperliquidReconciliationObservationKind.ADAPTER_OUTAGE,
          "adapter_outage",
          clockMs(this.#clock)
        );
      }
      const currentSnapshot = assertKernelSnapshot(
        await this.#kernelResolver.resolve({
          executionId: record.executionId,
          executionHash: record.executionHash
        }),
        record
      );
      const consumed = await this.#repository.consumeObservation({
        reconciliationId: record.reconciliationId,
        observation,
        kernelSnapshot: currentSnapshot,
        circuitBreakerFailureThreshold:
          this.#circuitBreakerFailureThreshold,
        actorId: guard.actorId,
        nowMs: clockMs(this.#clock)
      });
      record = consumed.record;
      assertRecord(record);
      if (
        TERMINAL_STATUSES.has(record.status) ||
        record.circuitBreakerOpen
      ) {
        return record;
      }
    }

    const exhausted = systemObservation(
      record,
      HyperliquidReconciliationObservationKind.POLL_BUDGET_EXHAUSTED,
      "poll_budget_exhausted",
      clockMs(this.#clock)
    );
    const currentSnapshot = assertKernelSnapshot(
      await this.#kernelResolver.resolve({
        executionId: record.executionId,
        executionHash: record.executionHash
      }),
      record
    );
    return (
      await this.#repository.consumeObservation({
        reconciliationId: record.reconciliationId,
        observation: exhausted,
        kernelSnapshot: currentSnapshot,
        circuitBreakerFailureThreshold:
          this.#circuitBreakerFailureThreshold,
        actorId: guard.actorId,
        nowMs: clockMs(this.#clock)
      })
    ).record;
  }

  async safeStop({
    reconciliationId,
    idempotencyKey,
    reasonCode
  }) {
    identifier("reconciliationId", reconciliationId);
    safeCode("reasonCode", reasonCode);
    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 256
    ) {
      fail(
        "invalid_hyperliquid_reconciliation_input",
        "idempotencyKey must be bounded"
      );
    }
    const record = await this.#repository.findById(reconciliationId);
    if (!record) {
      fail(
        "hyperliquid_reconciliation_unavailable",
        "reconciliation record is unavailable"
      );
    }
    const requestHash = hashId(
      "hyperliquid_testnet_reconciliation_safe_stop_request",
      {
        reconciliationHash: record.reconciliationHash,
        reasonCode
      }
    );
    const guard = assertGuardDecision(
      await this.#commandGuard.authorize({
        operation: "safe_stop",
        requestHash,
        facilityId: record.facilityId
      })
    );
    const idempotencyKeyHash = hashId(
      "hyperliquid_testnet_reconciliation_safe_stop_idempotency",
      { idempotencyKey }
    );
    const commandHash = hashId(
      "hyperliquid_testnet_reconciliation_safe_stop_command",
      {
        reconciliationHash: record.reconciliationHash,
        requestHash,
        authorizationDecisionHash: guard.authorizationDecisionHash,
        admissionDecisionHash: guard.admissionDecisionHash,
        reasonCode
      }
    );
    return (
      await this.#repository.safeStop({
        reconciliationId,
        idempotencyKeyHash,
        commandHash,
        reasonCode,
        actorId: guard.actorId,
        nowMs: clockMs(this.#clock)
      })
    ).record;
  }
}

function recordSqlValues(record) {
  return [
    record.reconciliationId,
    record.reconciliationHash,
    record.requestHash,
    record.idempotencyKeyHash,
    record.executionId,
    record.executionHash,
    record.facilityId,
    record.facilityHash,
    record.orderIntentId,
    record.orderIntentHash,
    record.canonicalLedgerStateHash,
    record.riskSnapshotHash,
    record.authorizationDecisionHash,
    record.admissionDecisionHash,
    record.nonce,
    record.executionNonceState,
    record.actionKind,
    record.actionHash,
    record.cloid,
    record.status,
    record.reconciledOrderState,
    record.cumulativeFilledSize,
    record.cumulativeFillNotionalMinor,
    record.processedObservationCount,
    record.latestSourceEvidenceHash,
    record.adapterFailureCount,
    record.pollAttemptCount,
    record.circuitBreakerOpen,
    record.manualSafeStop,
    record.newRiskBlocked,
    record.reconciled,
    record.resultHash,
    record.version,
    JSON.stringify(record),
    record.createdAt,
    record.updatedAt,
    record.resolvedAt,
    record.simulationOnly,
    record.externalSystemQueried,
    record.externalOrderSubmitted,
    record.ledgerMutationCreated,
    record.secondLedgerCreated,
    record.facilityMutationCreated,
    record.mainnetAuthority,
    record.productionAuthority,
    record.fundsAuthority,
    record.secretsIncluded,
    record.schemaVersion
  ];
}

function updateSqlValues(record) {
  return [
    record.reconciliationId,
    record.status,
    record.reconciledOrderState,
    record.cumulativeFilledSize,
    record.cumulativeFillNotionalMinor,
    record.processedObservationCount,
    record.latestSourceEvidenceHash,
    record.adapterFailureCount,
    record.pollAttemptCount,
    record.circuitBreakerOpen,
    record.manualSafeStop,
    record.newRiskBlocked,
    record.reconciled,
    record.resultHash,
    record.version,
    JSON.stringify(record),
    record.updatedAt,
    record.resolvedAt,
    record.riskSnapshotHash
  ];
}

export class PostgresHyperliquidReconciliationRepository {
  #eventRepository;

  constructor({ eventRepository, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !eventRepository ||
      typeof eventRepository.appendCommand !== "function" ||
      typeof eventRepository.appendCommandBatchInTransaction !==
        "function" ||
      typeof eventRepository.processInbox !== "function" ||
      typeof eventRepository.withTenantRead !== "function"
    ) {
      fail(
        "invalid_hyperliquid_reconciliation_repository",
        "the Tenant-scoped PostgreSQL Event Repository is required"
      );
    }
    this.#eventRepository = eventRepository;
  }

  async start(draft, { nowMs }) {
    const record = createPendingHyperliquidReconciliationRecord(draft, {
      nowMs
    });
    const event = eventFor(record, {
      eventType: "trading_testnet_reconciliation_started",
      actorId: draft.guard.actorId,
      reasonCode: "reconciliation_started",
      nowMs
    });
    const committed = await this.#eventRepository.appendCommand({
      aggregateType: "trading_execution_reconciliation",
      aggregateId: record.reconciliationId,
      expectedVersion: 0,
      idempotencyKey: `tc303:start:${record.idempotencyKeyHash}`,
      commandHash: record.requestHash,
      event,
      outboxTopic: RECONCILIATION_OUTBOX_TOPIC,
      response: record,
      applyProjection: async ({ client }) => {
        await client.query(
          `INSERT INTO trading_testnet_reconciliation_runs (
             id, reconciliation_hash, request_hash, idempotency_key_hash,
             execution_id, execution_hash, facility_id, facility_hash,
             order_intent_id, order_intent_hash, canonical_ledger_state_hash,
             risk_snapshot_hash, authorization_decision_hash,
             admission_decision_hash, nonce, execution_nonce_state,
             action_kind, action_hash, cloid, status, reconciled_order_state,
             cumulative_filled_size, cumulative_fill_notional_minor,
             processed_observation_count, latest_source_evidence_hash,
             adapter_failure_count, poll_attempt_count, circuit_breaker_open,
             manual_safe_stop, new_risk_blocked, reconciled, result_hash,
             version, record, created_at, updated_at, resolved_at,
             simulation_only, external_system_queried,
             external_order_submitted, ledger_mutation_created,
             second_ledger_created, facility_mutation_created,
             mainnet_authority, production_authority, funds_authority,
             secrets_included, schema_version
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
             $31, $32, $33, $34::JSONB, $35, $36, $37, $38, $39, $40,
             $41, $42, $43, $44, $45, $46, $47, $48
           )`,
          recordSqlValues(record)
        );
      }
    });
    if (committed.replayed) {
      const current = await this.findById(record.reconciliationId);
      if (!current || current.requestHash !== record.requestHash) {
        fail(
          "hyperliquid_reconciliation_idempotency_conflict",
          "replayed start command is not bound to the durable reconciliation"
        );
      }
      return { record: current, replayed: true };
    }
    const stored = assertRecord(committed.response);
    return { record: deepFreeze(stored), replayed: false };
  }

  async consumeObservation({
    reconciliationId,
    observation,
    kernelSnapshot,
    circuitBreakerFailureThreshold,
    actorId,
    nowMs
  }) {
    identifier("reconciliationId", reconciliationId);
    identifier("actorId", actorId);
    const normalized = assertObservation(observation);
    const payloadHash = hashId("inbox_payload", normalized);
    const processed = await this.#eventRepository.processInbox({
      consumerName: RECONCILIATION_INBOX_CONSUMER,
      eventId: normalized.observationId,
      payload: normalized,
      payloadHash,
      handler: async ({ client }) => {
        const result = await client.query(
          `SELECT record
             FROM trading_testnet_reconciliation_runs
            WHERE id = $1
            FOR UPDATE`,
          [reconciliationId]
        );
        if (result.rowCount !== 1) {
          fail(
            "hyperliquid_reconciliation_unavailable",
            "reconciliation record is unavailable"
          );
        }
        const current = assertRecord(result.rows[0].record);
        if (TERMINAL_STATUSES.has(current.status)) return current;
        const next = transitionHyperliquidReconciliationRecord(current, {
          observation: normalized,
          kernelSnapshot,
          circuitBreakerFailureThreshold,
          nowMs
        });
        const event = eventFor(next, {
          eventType: TERMINAL_STATUSES.has(next.status)
            ? "trading_testnet_reconciliation_resolved"
            : "trading_testnet_reconciliation_observed",
          actorId,
          reasonCode: normalized.reasonCode,
          nowMs
        });
        const committed =
          await this.#eventRepository.appendCommandBatchInTransaction(
            client,
            {
              aggregateType: "trading_execution_reconciliation",
              aggregateId: reconciliationId,
              idempotencyKey: `tc303:observation:${normalized.observationId}`,
              commandHash: payloadHash,
              events: [
                {
                  aggregateType:
                    "trading_execution_reconciliation",
                  aggregateId: reconciliationId,
                  expectedVersion: current.version,
                  event,
                  outboxTopic: RECONCILIATION_OUTBOX_TOPIC
                }
              ],
              response: next,
              applyProjection: async () => {
                const update = await client.query(
                  `UPDATE trading_testnet_reconciliation_runs
                      SET status = $2,
                          reconciled_order_state = $3,
                          cumulative_filled_size = $4,
                          cumulative_fill_notional_minor = $5,
                          processed_observation_count = $6,
                          latest_source_evidence_hash = $7,
                          adapter_failure_count = $8,
                          poll_attempt_count = $9,
                          circuit_breaker_open = $10,
                          manual_safe_stop = $11,
                          new_risk_blocked = $12,
                          reconciled = $13,
                          result_hash = $14,
                          version = $15,
                          record = $16::JSONB,
                          updated_at = $17,
                          resolved_at = $18,
                          risk_snapshot_hash = $19
                    WHERE id = $1
                      AND version = $20`,
                  [...updateSqlValues(next), current.version]
                );
                if (update.rowCount !== 1) {
                  fail(
                    "hyperliquid_reconciliation_concurrency_conflict",
                    "reconciliation projection lost its version lock"
                  );
                }
              }
            }
          );
        return committed.response;
      }
    });
    return {
      record: deepFreeze(assertRecord(processed.result)),
      replayed: processed.replayed
    };
  }

  async safeStop({
    reconciliationId,
    idempotencyKeyHash,
    commandHash,
    reasonCode,
    actorId,
    nowMs
  }) {
    identifier("reconciliationId", reconciliationId);
    hash("idempotencyKeyHash", idempotencyKeyHash);
    hash("commandHash", commandHash);
    safeCode("reasonCode", reasonCode);
    identifier("actorId", actorId);
    const current = await this.findById(reconciliationId);
    if (!current) {
      fail(
        "hyperliquid_reconciliation_unavailable",
        "reconciliation record is unavailable"
      );
    }
    if (TERMINAL_STATUSES.has(current.status)) {
      return { record: current, replayed: true };
    }
    const next = safeStopHyperliquidReconciliationRecord(current, {
      reasonCode,
      nowMs
    });
    const event = eventFor(next, {
      eventType: "trading_testnet_reconciliation_safe_stopped",
      actorId,
      reasonCode,
      nowMs
    });
    const committed = await this.#eventRepository.appendCommand({
      aggregateType: "trading_execution_reconciliation",
      aggregateId: reconciliationId,
      expectedVersion: current.version,
      idempotencyKey: `tc303:safe-stop:${idempotencyKeyHash}`,
      commandHash,
      event,
      outboxTopic: RECONCILIATION_OUTBOX_TOPIC,
      response: next,
      applyProjection: async ({ client }) => {
        const update = await client.query(
          `UPDATE trading_testnet_reconciliation_runs
              SET status = $2,
                  reconciled_order_state = $3,
                  cumulative_filled_size = $4,
                  cumulative_fill_notional_minor = $5,
                  processed_observation_count = $6,
                  latest_source_evidence_hash = $7,
                  adapter_failure_count = $8,
                  poll_attempt_count = $9,
                  circuit_breaker_open = $10,
                  manual_safe_stop = $11,
                  new_risk_blocked = $12,
                  reconciled = $13,
                  result_hash = $14,
                  version = $15,
                  record = $16::JSONB,
                  updated_at = $17,
                  resolved_at = $18,
                  risk_snapshot_hash = $19
            WHERE id = $1
              AND version = $20`,
          [...updateSqlValues(next), current.version]
        );
        if (update.rowCount !== 1) {
          fail(
            "hyperliquid_reconciliation_concurrency_conflict",
            "safe-stop projection lost its version lock"
          );
        }
      }
    });
    return {
      record: deepFreeze(assertRecord(committed.response)),
      replayed: committed.replayed
    };
  }

  async findById(reconciliationId) {
    identifier("reconciliationId", reconciliationId);
    return this.#eventRepository.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT record
           FROM trading_testnet_reconciliation_runs
          WHERE id = $1`,
        [reconciliationId]
      );
      return result.rowCount === 1
        ? deepFreeze(assertRecord(structuredClone(result.rows[0].record)))
        : undefined;
    });
  }

  async history(reconciliationId) {
    identifier("reconciliationId", reconciliationId);
    return this.#eventRepository.listEvents({
      aggregateType: "trading_execution_reconciliation",
      aggregateId: reconciliationId
    });
  }
}
