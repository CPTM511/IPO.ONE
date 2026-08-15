import { DomainError, hashId } from "../../../packages/domain/src/index.js";

export const HYPERCORE_STABLE_CANCEL_POLICY_SCHEMA_VERSION =
  "hypercore_stable_cancel_policy_constraint.v1";
export const HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION =
  "hypercore_stable_cancel_intent.v1";
export const HYPERCORE_CANCEL_JIT_PREFLIGHT_SCHEMA_VERSION =
  "hypercore_cancel_jit_venue_preflight_receipt.v1";
export const HYPERCORE_002D_CANCEL_TARGET_CLOID =
  "0x3ec931145cbe6e36213621b50521a704";

const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{2,255}$/;
const DECIMAL = /^(?:0|0\.[0-9]{1,18}|[1-9][0-9]{0,30}(?:\.[0-9]{1,18})?)$/;

function fail(code, message) {
  throw new DomainError(code, message);
}

function plain(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype);
}

function exact(name, value, fields) {
  if (!plain(value) || Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))) {
    fail("invalid_hypercore_cancel_input", `${name} has an invalid closed shape`);
  }
}

function bytes32(name, value, { nullable = false } = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hypercore_cancel_input", `${name} must be lowercase bytes32`);
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hypercore_cancel_input", `${name} is invalid`);
  }
  return value;
}

function decimal(name, value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    fail("invalid_hypercore_cancel_input", `${name} must be canonical decimal`);
  }
  return value;
}

function decimal18(value) {
  decimal("decimal", value);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

function integer(name, value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail("invalid_hypercore_cancel_input", `${name} must be a safe integer`);
  }
  return value;
}

function timestamp(name, value) {
  if (typeof value !== "string") {
    fail("invalid_hypercore_cancel_input", `${name} must be canonical ISO time`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("invalid_hypercore_cancel_input", `${name} must be canonical ISO time`);
  }
  return parsed;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_hypercore_cancel_input", `${name} must be a trusted Date`);
  }
  return new Date(value.getTime());
}

function freeze(value) {
  if (Array.isArray(value)) for (const item of value) freeze(item);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
  }
  return Object.freeze(value);
}

function cloneFreeze(value) {
  return freeze(structuredClone(value));
}

const TARGET_FIELDS = [
  "targetOrderHash", "parentIntentId", "parentIntentHash", "market",
  "assetIndex", "side", "limitPx", "size", "reduceOnly", "cloid",
  "venueOrderId"
];

function targetCore(value) {
  const { targetOrderHash: _hash, ...core } = value;
  return core;
}

export function createHypercoreStableCancelTarget({
  parentIntentId,
  parentIntentHash,
  market,
  assetIndex,
  side,
  limitPx,
  size,
  reduceOnly,
  cloid,
  venueOrderId
}) {
  identifier("parentIntentId", parentIntentId);
  bytes32("parentIntentHash", parentIntentHash);
  decimal("limitPx", limitPx);
  decimal("size", size);
  integer("venueOrderId", venueOrderId, 1);
  if (market !== "BTC" || assetIndex !== 3 || side !== "buy" ||
    reduceOnly !== false || cloid !== HYPERCORE_002D_CANCEL_TARGET_CLOID ||
    decimal18(limitPx) * decimal18(size) !== 10n * 10n ** 36n) {
    fail("hypercore_cancel_target_denied", "target is not the exact BTC proof order");
  }
  const core = {
    parentIntentId,
    parentIntentHash,
    market,
    assetIndex,
    side,
    limitPx,
    size,
    reduceOnly,
    cloid,
    venueOrderId
  };
  return cloneFreeze({
    targetOrderHash: hashId("hypercore_stable_cancel_target_order", core),
    ...core
  });
}

export function verifyHypercoreStableCancelTarget(value) {
  exact("stable cancel target", value, TARGET_FIELDS);
  bytes32("targetOrderHash", value.targetOrderHash);
  createHypercoreStableCancelTarget(targetCore(value));
  if (hashId("hypercore_stable_cancel_target_order", targetCore(value)) !==
    value.targetOrderHash) {
    fail("invalid_hypercore_cancel_target", "cancel target drifted");
  }
  return true;
}

function policyCore(value) {
  const { policyConstraintHash: _hash, ...core } = value;
  return core;
}

const POLICY_FIELDS = [
  "policyConstraintHash", "policyId", "policyVersion", "facilityHash",
  "accountBindingHash", "delegateHash", "signerReferenceHash",
  "parentIntentHash", "targetOrderHash", "targetClientOrderId", "environment",
  "market", "productClass", "assetIndex", "actionKind", "expectedOpenOrders",
  "maxPositionNotionalUsd", "maxAggregateProofExposureUsd", "maxSubmissions",
  "maxRiskAgeMs", "maxMetadataAgeMs", "requestExpiryMs",
  "executionOwnerActorId", "riskOwnerActorId", "incidentOwnerActorId",
  "withdrawalAuthority", "transferAuthority", "leverageChangeAuthority",
  "accountAdministrationAuthority", "mainnetAuthority", "productionAuthority",
  "realFundsAuthority", "schemaVersion"
];

export function createHypercoreStableCancelPolicyConstraint({
  policyId,
  policyVersion,
  facilityHash,
  accountBindingHash,
  delegateHash,
  signerReferenceHash,
  parentIntentHash,
  targetOrderHash,
  targetClientOrderId,
  executionOwnerActorId,
  riskOwnerActorId,
  incidentOwnerActorId
}) {
  for (const [name, value] of Object.entries({
    policyId, policyVersion, executionOwnerActorId, riskOwnerActorId,
    incidentOwnerActorId
  })) identifier(name, value);
  for (const [name, value] of Object.entries({
    facilityHash, accountBindingHash, delegateHash, signerReferenceHash,
    parentIntentHash, targetOrderHash
  })) bytes32(name, value);
  if (targetClientOrderId !== HYPERCORE_002D_CANCEL_TARGET_CLOID ||
    executionOwnerActorId === riskOwnerActorId) {
    fail("hypercore_cancel_policy_denied", "cancel policy binding is invalid");
  }
  const core = {
    policyId,
    policyVersion,
    facilityHash,
    accountBindingHash,
    delegateHash,
    signerReferenceHash,
    parentIntentHash,
    targetOrderHash,
    targetClientOrderId,
    environment: "hyperliquid_testnet",
    market: "BTC",
    productClass: "perpetual",
    assetIndex: 3,
    actionKind: "cancelByCloid",
    expectedOpenOrders: 1,
    maxPositionNotionalUsd: "0",
    maxAggregateProofExposureUsd: "10",
    maxSubmissions: 1,
    maxRiskAgeMs: 10_000,
    maxMetadataAgeMs: 300_000,
    requestExpiryMs: 30_000,
    executionOwnerActorId,
    riskOwnerActorId,
    incidentOwnerActorId,
    withdrawalAuthority: false,
    transferAuthority: false,
    leverageChangeAuthority: false,
    accountAdministrationAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_STABLE_CANCEL_POLICY_SCHEMA_VERSION
  };
  return cloneFreeze({
    policyConstraintHash: hashId("hypercore_stable_cancel_policy_constraint", core),
    ...core
  });
}

export function verifyHypercoreStableCancelPolicyConstraint(value) {
  exact("stable cancel policy", value, POLICY_FIELDS);
  for (const key of [
    "policyConstraintHash", "facilityHash", "accountBindingHash", "delegateHash",
    "signerReferenceHash", "parentIntentHash", "targetOrderHash"
  ]) bytes32(key, value[key]);
  if (value.targetClientOrderId !== HYPERCORE_002D_CANCEL_TARGET_CLOID ||
    value.environment !== "hyperliquid_testnet" || value.market !== "BTC" ||
    value.productClass !== "perpetual" || value.assetIndex !== 3 ||
    value.actionKind !== "cancelByCloid" || value.expectedOpenOrders !== 1 ||
    value.maxPositionNotionalUsd !== "0" ||
    value.maxAggregateProofExposureUsd !== "10" || value.maxSubmissions !== 1 ||
    value.maxRiskAgeMs !== 10_000 || value.maxMetadataAgeMs !== 300_000 ||
    value.requestExpiryMs !== 30_000 || value.withdrawalAuthority !== false ||
    value.transferAuthority !== false || value.leverageChangeAuthority !== false ||
    value.accountAdministrationAuthority !== false || value.mainnetAuthority !== false ||
    value.productionAuthority !== false || value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_STABLE_CANCEL_POLICY_SCHEMA_VERSION ||
    hashId("hypercore_stable_cancel_policy_constraint", policyCore(value)) !==
      value.policyConstraintHash) {
    fail("invalid_hypercore_cancel_policy", "stable cancel policy drifted");
  }
  return true;
}

function cancelAction(value, targetOrder) {
  exact("stable cancel action", value, ["type", "cancels"]);
  if (value.type !== "cancelByCloid" || !Array.isArray(value.cancels) ||
    value.cancels.length !== 1) {
    fail("hypercore_stable_cancel_action_denied", "exactly one cancelByCloid is required");
  }
  exact("stable cancel entry", value.cancels[0], ["asset", "cloid"]);
  if (value.cancels[0].asset !== 3 || value.cancels[0].cloid !== targetOrder.cloid) {
    fail("hypercore_stable_cancel_action_denied", "cancel payload does not match target");
  }
  return value;
}

const INTENT_FIELDS = [
  "intentId", "intentHash", "economicActionHash", "idempotencyKeyHash",
  "facilityId", "facilityHash", "accountBindingId", "accountBindingHash",
  "canonicalAccountAddressHash", "handoffId", "handoffHash", "delegateId",
  "delegateHash", "apiWalletAddressHash", "signerReferenceHash",
  "parentIntentId", "parentIntentHash", "targetOrderHash", "targetOrder",
  "policyConstraintHash", "payloadHash", "actionKind", "hyperliquidAction",
  "nonce", "preparedAt", "approvalExpiresAt", "state", "version",
  "founderApprovalId", "founderApprovalHash", "humanConfirmationHash",
  "preflightReceiptId", "preflightReceiptHash", "riskSnapshotHash", "metadataHash",
  "signingRequestHash", "actionAuthorizationHash", "requestBodyHash",
  "signatureHash", "claimHash", "disposition", "responseHash",
  "reconciliationHash", "venueOrderStateHash", "venueAccountStateHash",
  "ledgerStateHash", "obligationEvidenceHash", "signerRetirementHash",
  "approvedAt", "signingStartedAt", "claimedAt", "resolvedAt", "reconciledAt",
  "closedAt", "externalSubmissionAttempted", "retryAllowed", "rawActionPersisted",
  "rawResponsePersisted", "rawKeyPersisted", "rawSignaturePersisted",
  "exactExecutionOnly", "oneUse", "mainnetAuthority", "productionAuthority",
  "realFundsAuthority", "schemaVersion"
];

function intentIdentity(value) {
  return {
    economicActionHash: value.economicActionHash,
    idempotencyKeyHash: value.idempotencyKeyHash,
    facilityId: value.facilityId,
    facilityHash: value.facilityHash,
    accountBindingId: value.accountBindingId,
    accountBindingHash: value.accountBindingHash,
    canonicalAccountAddressHash: value.canonicalAccountAddressHash,
    handoffId: value.handoffId,
    handoffHash: value.handoffHash,
    delegateId: value.delegateId,
    delegateHash: value.delegateHash,
    apiWalletAddressHash: value.apiWalletAddressHash,
    signerReferenceHash: value.signerReferenceHash,
    parentIntentId: value.parentIntentId,
    parentIntentHash: value.parentIntentHash,
    targetOrderHash: value.targetOrderHash,
    targetOrder: value.targetOrder,
    policyConstraintHash: value.policyConstraintHash,
    payloadHash: value.payloadHash,
    actionKind: "cancelByCloid",
    hyperliquidAction: value.hyperliquidAction,
    nonce: value.nonce,
    preparedAt: value.preparedAt,
    approvalExpiresAt: value.approvalExpiresAt,
    exactExecutionOnly: true,
    oneUse: true,
    schemaVersion: HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION
  };
}

export function createHypercoreStableCancelExecutionIntent({
  facilityId, facilityHash, accountBindingId, accountBindingHash,
  canonicalAccountAddressHash, handoffId, handoffHash, delegateId, delegateHash,
  apiWalletAddressHash, signerReferenceHash, parentIntentId, parentIntentHash,
  targetOrder, policyConstraint, hyperliquidAction, idempotencyKey, nonce,
  preparedAt, approvalExpiresAt
}) {
  for (const [name, value] of Object.entries({
    facilityId, accountBindingId, handoffId, delegateId, parentIntentId
  })) identifier(name, value);
  for (const [name, value] of Object.entries({
    facilityHash, accountBindingHash, canonicalAccountAddressHash, handoffHash,
    delegateHash, apiWalletAddressHash, signerReferenceHash, parentIntentHash
  })) bytes32(name, value);
  verifyHypercoreStableCancelTarget(targetOrder);
  verifyHypercoreStableCancelPolicyConstraint(policyConstraint);
  cancelAction(hyperliquidAction, targetOrder);
  if (targetOrder.parentIntentId !== parentIntentId ||
    targetOrder.parentIntentHash !== parentIntentHash ||
    policyConstraint.parentIntentHash !== parentIntentHash ||
    policyConstraint.targetOrderHash !== targetOrder.targetOrderHash ||
    policyConstraint.targetClientOrderId !== targetOrder.cloid ||
    policyConstraint.facilityHash !== facilityHash ||
    policyConstraint.accountBindingHash !== accountBindingHash ||
    policyConstraint.delegateHash !== delegateHash ||
    policyConstraint.signerReferenceHash !== signerReferenceHash ||
    typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
    fail("hypercore_stable_cancel_intent_denied", "stable cancel binding drifted");
  }
  integer("nonce", nonce, 1);
  const prepared = trustedDate("preparedAt", preparedAt);
  const expires = trustedDate("approvalExpiresAt", approvalExpiresAt);
  if (expires <= prepared || expires.getTime() - prepared.getTime() > 30 * 60_000) {
    fail("hypercore_stable_cancel_intent_denied", "stable cancel timing is invalid");
  }
  const payloadHash = hashId("hypercore_stable_execution_payload", hyperliquidAction);
  const economicActionHash = hashId("hypercore_stable_cancel_economic_action", {
    facilityHash,
    accountBindingHash,
    delegateHash,
    policyConstraintHash: policyConstraint.policyConstraintHash,
    parentIntentHash,
    targetOrderHash: targetOrder.targetOrderHash,
    payloadHash,
    nonce,
    preparedAt: prepared.toISOString()
  });
  const value = {
    economicActionHash,
    idempotencyKeyHash: hashId("hypercore_stable_intent_idempotency", { idempotencyKey }),
    facilityId,
    facilityHash,
    accountBindingId,
    accountBindingHash,
    canonicalAccountAddressHash,
    handoffId,
    handoffHash,
    delegateId,
    delegateHash,
    apiWalletAddressHash,
    signerReferenceHash,
    parentIntentId,
    parentIntentHash,
    targetOrderHash: targetOrder.targetOrderHash,
    targetOrder: structuredClone(targetOrder),
    policyConstraintHash: policyConstraint.policyConstraintHash,
    payloadHash,
    actionKind: "cancelByCloid",
    hyperliquidAction: structuredClone(hyperliquidAction),
    nonce,
    preparedAt: prepared.toISOString(),
    approvalExpiresAt: expires.toISOString(),
    state: "PREPARED",
    version: 1,
    founderApprovalId: null,
    founderApprovalHash: null,
    humanConfirmationHash: null,
    preflightReceiptId: null,
    preflightReceiptHash: null,
    riskSnapshotHash: null,
    metadataHash: null,
    signingRequestHash: null,
    actionAuthorizationHash: null,
    requestBodyHash: null,
    signatureHash: null,
    claimHash: null,
    disposition: null,
    responseHash: null,
    reconciliationHash: null,
    venueOrderStateHash: null,
    venueAccountStateHash: null,
    ledgerStateHash: null,
    obligationEvidenceHash: null,
    signerRetirementHash: null,
    approvedAt: null,
    signingStartedAt: null,
    claimedAt: null,
    resolvedAt: null,
    reconciledAt: null,
    closedAt: null,
    externalSubmissionAttempted: false,
    retryAllowed: false,
    rawActionPersisted: false,
    rawResponsePersisted: false,
    rawKeyPersisted: false,
    rawSignaturePersisted: false,
    exactExecutionOnly: true,
    oneUse: true,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION
  };
  const intentHash = hashId("hypercore_stable_cancel_intent", intentIdentity(value));
  return cloneFreeze({
    intentId: `hypercore_stable_cancel_intent_${intentHash.slice(2)}`,
    intentHash,
    ...value
  });
}

export function verifyHypercoreStableCancelExecutionIntent(value) {
  exact("stable cancel intent", value, INTENT_FIELDS);
  for (const key of [
    "intentHash", "economicActionHash", "idempotencyKeyHash", "facilityHash",
    "accountBindingHash", "canonicalAccountAddressHash", "handoffHash",
    "delegateHash", "apiWalletAddressHash", "signerReferenceHash",
    "parentIntentHash", "targetOrderHash", "policyConstraintHash", "payloadHash"
  ]) bytes32(key, value[key]);
  for (const key of [
    "founderApprovalHash", "humanConfirmationHash", "preflightReceiptHash",
    "riskSnapshotHash", "metadataHash", "signingRequestHash",
    "actionAuthorizationHash", "requestBodyHash", "signatureHash", "claimHash",
    "responseHash", "reconciliationHash", "venueOrderStateHash",
    "venueAccountStateHash", "ledgerStateHash", "obligationEvidenceHash",
    "signerRetirementHash"
  ]) bytes32(key, value[key], { nullable: true });
  verifyHypercoreStableCancelTarget(value.targetOrder);
  cancelAction(value.hyperliquidAction, value.targetOrder);
  const prepared = timestamp("preparedAt", value.preparedAt);
  const expires = timestamp("approvalExpiresAt", value.approvalExpiresAt);
  const hasApproval = value.founderApprovalId !== null &&
    value.founderApprovalHash !== null && value.humanConfirmationHash !== null;
  const hasPreflight = value.preflightReceiptId !== null &&
    value.preflightReceiptHash !== null && value.riskSnapshotHash !== null &&
    value.metadataHash !== null && value.signingRequestHash !== null;
  const hasClaim = value.actionAuthorizationHash !== null &&
    value.requestBodyHash !== null && value.signatureHash !== null && value.claimHash !== null;
  const hasResult = value.disposition !== null && value.responseHash !== null;
  const lifecycle =
    (value.state === "PREPARED" && value.version === 1 && !hasApproval && !hasPreflight && !hasClaim && !hasResult) ||
    (value.state === "APPROVED" && value.version === 2 && hasApproval && !hasPreflight && !hasClaim && !hasResult) ||
    (value.state === "SIGNING" && value.version === 3 && hasApproval && hasPreflight && !hasClaim && !hasResult) ||
    (value.state === "SUBMITTING" && value.version === 4 && hasApproval && hasPreflight && hasClaim && !hasResult && value.externalSubmissionAttempted === true) ||
    (["SUBMITTED", "REJECTED", "UNKNOWN"].includes(value.state) && value.version === 5 && hasApproval && hasPreflight && hasClaim && hasResult && value.externalSubmissionAttempted === true) ||
    (value.state === "RECONCILED" && value.version === 6 && hasResult && value.reconciliationHash !== null) ||
    (value.state === "CLOSED" && value.version === 7 && hasResult && value.reconciliationHash !== null && value.signerRetirementHash !== null) ||
    (value.state === "ABORTED" && value.version >= 3 && value.externalSubmissionAttempted === false);
  if (expires <= prepared || expires.getTime() - prepared.getTime() > 30 * 60_000 ||
    !lifecycle || value.parentIntentId !== value.targetOrder.parentIntentId ||
    value.parentIntentHash !== value.targetOrder.parentIntentHash ||
    value.targetOrderHash !== value.targetOrder.targetOrderHash ||
    value.actionKind !== "cancelByCloid" || value.retryAllowed !== false ||
    value.rawActionPersisted !== false || value.rawResponsePersisted !== false ||
    value.rawKeyPersisted !== false || value.rawSignaturePersisted !== false ||
    value.exactExecutionOnly !== true || value.oneUse !== true ||
    value.mainnetAuthority !== false || value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION ||
    value.intentId !== `hypercore_stable_cancel_intent_${value.intentHash.slice(2)}` ||
    hashId("hypercore_stable_cancel_intent", intentIdentity(value)) !== value.intentHash ||
    hashId("hypercore_stable_execution_payload", value.hyperliquidAction) !==
      value.payloadHash) {
    fail("invalid_hypercore_stable_cancel_intent", "stable cancel intent drifted");
  }
  return true;
}

const OBSERVATION_FIELDS = [
  "masterRole", "apiWalletRole", "accountValue", "withdrawable",
  "positionCount", "openOrderCount", "aggregateExposureUsd",
  "positionNotionalUsd", "unknownOutcomeCount", "reconciliationStatus",
  "paused", "masterRoleHash", "apiWalletRoleHash", "accountStateHash",
  "ordersHash", "orderStatusHash", "metadataHash", "metadataObservedAt",
  "market", "assetIndex", "sizeDecimals", "priceDecimals",
  "observedTargetOrder", "observedTargetOrderHash", "metaResponseHash",
  "ordersResponseHash", "orderStatusResponseHash"
];

const RECEIPT_FIELDS = [
  "receiptId", "receiptHash", "intentId", "intentHash", "approvalHash",
  "payloadHash", "accountBindingHash", "delegateHash", "signerReferenceHash",
  "parentIntentHash", "targetOrderHash", "metadataHash", "riskSnapshotHash",
  "riskSnapshot", "observation", "observedAt", "expiresAt",
  "exactPayloadUnchanged", "strictlyNoRiskIncrease", "riskReductionOnly",
  "rawAddressPersisted", "rawResponsePersisted", "rawSignaturePersisted",
  "mainnetAuthority", "productionAuthority", "realFundsAuthority", "schemaVersion"
];

function verifyObservation(observation) {
  exact("cancel JIT observation", observation, OBSERVATION_FIELDS);
  for (const key of [
    "masterRoleHash", "apiWalletRoleHash", "accountStateHash", "ordersHash",
    "orderStatusHash", "metadataHash", "observedTargetOrderHash",
    "metaResponseHash", "ordersResponseHash", "orderStatusResponseHash"
  ]) bytes32(key, observation[key]);
  for (const key of [
    "accountValue", "withdrawable", "aggregateExposureUsd", "positionNotionalUsd"
  ]) decimal(key, observation[key]);
  verifyHypercoreStableCancelTarget(observation.observedTargetOrder);
  return true;
}

export function createHypercoreCancelJitVenuePreflightReceipt({
  intent,
  approval,
  observation,
  now
}) {
  verifyHypercoreStableCancelExecutionIntent(intent);
  verifyObservation(observation);
  const observed = trustedDate("now", now);
  const metadataObserved = timestamp("metadataObservedAt", observation.metadataObservedAt);
  const approvalExpires = timestamp("approval.expiresAt", approval?.expiresAt);
  if (intent.state !== "APPROVED" || approval?.status !== "APPROVED" ||
    approval.intentHash !== intent.intentHash || observed >= approvalExpires ||
    observed.getTime() - metadataObserved.getTime() < 0 ||
    observed.getTime() - metadataObserved.getTime() > 300_000 ||
    observation.masterRole !== "user" || observation.apiWalletRole !== "agent" ||
    observation.positionCount !== 0 || observation.openOrderCount !== 1 ||
    decimal18(observation.aggregateExposureUsd) !== 0n ||
    decimal18(observation.positionNotionalUsd) !== 0n ||
    observation.unknownOutcomeCount !== 0 ||
    observation.reconciliationStatus !== "RECONCILED" || observation.paused !== false ||
    observation.market !== "BTC" || observation.assetIndex !== 3 ||
    observation.sizeDecimals !== 5 || observation.priceDecimals !== 1 ||
    observation.observedTargetOrderHash !== intent.targetOrderHash ||
    observation.observedTargetOrder.targetOrderHash !== intent.targetOrderHash) {
    fail("hypercore_cancel_jit_preflight_denied", "cancel target is stale, unsafe or drifted");
  }
  const riskSnapshot = {
    accountBindingHash: intent.accountBindingHash,
    parentIntentHash: intent.parentIntentHash,
    targetOrderHash: intent.targetOrderHash,
    metadataHash: observation.metadataHash,
    metadataObservedAt: observation.metadataObservedAt,
    observedAt: observed.toISOString(),
    status: "FRESH",
    openOrdersCount: 1,
    aggregateExposureUsd: observation.aggregateExposureUsd,
    positionNotionalUsd: observation.positionNotionalUsd,
    unknownOutcomeCount: 0,
    reconciliationStatus: "RECONCILED",
    paused: false,
    riskReductionOnly: true
  };
  riskSnapshot.riskSnapshotHash = hashId("hypercore_testnet_risk_snapshot", riskSnapshot);
  const core = {
    intentId: intent.intentId,
    intentHash: intent.intentHash,
    approvalHash: approval.approvalHash,
    payloadHash: intent.payloadHash,
    accountBindingHash: intent.accountBindingHash,
    delegateHash: intent.delegateHash,
    signerReferenceHash: intent.signerReferenceHash,
    parentIntentHash: intent.parentIntentHash,
    targetOrderHash: intent.targetOrderHash,
    metadataHash: observation.metadataHash,
    riskSnapshotHash: riskSnapshot.riskSnapshotHash,
    riskSnapshot,
    observation: structuredClone(observation),
    observedAt: observed.toISOString(),
    expiresAt: new Date(observed.getTime() + 10_000).toISOString(),
    exactPayloadUnchanged: true,
    strictlyNoRiskIncrease: true,
    riskReductionOnly: true,
    rawAddressPersisted: false,
    rawResponsePersisted: false,
    rawSignaturePersisted: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_CANCEL_JIT_PREFLIGHT_SCHEMA_VERSION
  };
  const receiptHash = hashId("hypercore_cancel_jit_venue_preflight_receipt", core);
  return cloneFreeze({
    receiptId: `hypercore_cancel_jit_preflight_${receiptHash.slice(2)}`,
    receiptHash,
    ...core
  });
}

export function verifyHypercoreCancelJitVenuePreflightReceipt(value) {
  exact("cancel JIT receipt", value, RECEIPT_FIELDS);
  for (const key of [
    "receiptHash", "intentHash", "approvalHash", "payloadHash",
    "accountBindingHash", "delegateHash", "signerReferenceHash",
    "parentIntentHash", "targetOrderHash", "metadataHash", "riskSnapshotHash"
  ]) bytes32(key, value[key]);
  verifyObservation(value.observation);
  const observed = timestamp("observedAt", value.observedAt);
  const expires = timestamp("expiresAt", value.expiresAt);
  const { receiptId: _id, receiptHash: _hash, ...core } = value;
  if (expires.getTime() - observed.getTime() !== 10_000 ||
    value.riskSnapshot.riskSnapshotHash !== value.riskSnapshotHash ||
    value.riskSnapshot.targetOrderHash !== value.targetOrderHash ||
    value.observation.observedTargetOrderHash !== value.targetOrderHash ||
    value.exactPayloadUnchanged !== true || value.strictlyNoRiskIncrease !== true ||
    value.riskReductionOnly !== true || value.rawAddressPersisted !== false ||
    value.rawResponsePersisted !== false || value.rawSignaturePersisted !== false ||
    value.mainnetAuthority !== false || value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_CANCEL_JIT_PREFLIGHT_SCHEMA_VERSION ||
    value.receiptId !== `hypercore_cancel_jit_preflight_${value.receiptHash.slice(2)}` ||
    hashId("hypercore_cancel_jit_venue_preflight_receipt", core) !== value.receiptHash) {
    fail("invalid_hypercore_cancel_jit_preflight", "cancel JIT receipt drifted");
  }
  return true;
}
