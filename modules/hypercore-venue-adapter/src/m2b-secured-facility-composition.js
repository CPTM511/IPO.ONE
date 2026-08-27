import {
  AGENT_SECURED_FACILITY_AUTHORIZATION_SCHEMA_VERSION,
  authorizeAgentSecuredFacilityIntent,
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  HYPERCORE_STABLE_INTENT_SCHEMA_VERSION,
  HYPERCORE_STABLE_POLICY_SCHEMA_VERSION,
  verifyHypercoreStableExecutionIntent,
  verifyHypercoreStablePolicyConstraint
} from "./hypercore-jit-execution.js";
import {
  HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION,
  verifyHypercoreStableCancelExecutionIntent
} from "./hypercore-cancel-closure.js";

export const M2B_HYPERLIQUID_COMPOSITION_SCHEMA_VERSION =
  "m2b_hyperliquid_composition.v1";
export const M2B_HYPERLIQUID_LAUNCH_PROFILE =
  "live_testnet_secured_pool_agent_execution";

export const M2BHyperliquidCompositionState = Object.freeze({
  PREPARED: "PREPARED",
  APPROVED: "APPROVED",
  SIGNING: "SIGNING",
  SUBMITTING: "SUBMITTING",
  SUBMITTED: "SUBMITTED",
  REJECTED: "REJECTED",
  UNKNOWN: "UNKNOWN",
  RECONCILED: "RECONCILED",
  CLOSED: "CLOSED",
  ABORTED: "ABORTED"
});

const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{2,255}$/;
const STATES = new Set(Object.values(M2BHyperliquidCompositionState));

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
    fail("invalid_m2b_hyperliquid_composition", `${name} has an invalid closed shape`);
  }
}

function bytes32(name, value, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_m2b_hyperliquid_composition", `${name} must be lowercase bytes32`);
  }
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_m2b_hyperliquid_composition", `${name} is invalid`);
  }
}

function timestamp(name, value) {
  if (typeof value !== "string") {
    fail("invalid_m2b_hyperliquid_composition", `${name} must be canonical ISO time`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("invalid_m2b_hyperliquid_composition", `${name} must be canonical ISO time`);
  }
  return parsed;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_m2b_hyperliquid_composition", `${name} must be a trusted Date`);
  }
  return new Date(value.getTime());
}

function core(value) {
  return {
    agentSecuredFacilityAuthorizationId: value.agentSecuredFacilityAuthorizationId,
    agentSecuredFacilityAuthorizationHash: value.agentSecuredFacilityAuthorizationHash,
    agentSecuredFacilityAuthorizationVersion: value.agentSecuredFacilityAuthorizationVersion,
    subjectId: value.subjectId,
    principalId: value.principalId,
    mandateId: value.mandateId,
    mandateHash: value.mandateHash,
    economicAccountBindingId: value.economicAccountBindingId,
    economicAccountHash: value.economicAccountHash,
    poolObligationBindingId: value.poolObligationBindingId,
    poolBindingHash: value.poolBindingHash,
    poolProjectionHash: value.poolProjectionHash,
    obligationId: value.obligationId,
    obligationHash: value.obligationHash,
    tradingFacilityId: value.tradingFacilityId,
    facilityHash: value.facilityHash,
    facilityStateHash: value.facilityStateHash,
    facilityVersion: value.facilityVersion,
    hypercoreIntentId: value.hypercoreIntentId,
    hypercoreIntentHash: value.hypercoreIntentHash,
    economicActionHash: value.economicActionHash,
    venueAccountBindingId: value.venueAccountBindingId,
    venueAccountBindingHash: value.venueAccountBindingHash,
    delegateHash: value.delegateHash,
    signerReferenceHash: value.signerReferenceHash,
    policyConstraintHash: value.policyConstraintHash,
    payloadHash: value.payloadHash,
    intentKind: "open",
    environment: "hyperliquid_testnet",
    market: "BTC",
    maxOrderNotionalUsd: "10",
    launchProfileId: M2B_HYPERLIQUID_LAUNCH_PROFILE,
    preparedAt: value.preparedAt,
    expiresAt: value.expiresAt,
    exactExecutionOnly: true,
    oneUse: true,
    withdrawalAuthority: false,
    transferAuthority: false,
    leverageChangeAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: M2B_HYPERLIQUID_COMPOSITION_SCHEMA_VERSION
  };
}

const COMPOSITION_FIELDS = [
  "m2bHyperliquidCompositionId", "compositionHash",
  "agentSecuredFacilityAuthorizationId", "agentSecuredFacilityAuthorizationHash",
  "agentSecuredFacilityAuthorizationVersion", "subjectId", "principalId",
  "mandateId", "mandateHash", "economicAccountBindingId", "economicAccountHash",
  "poolObligationBindingId", "poolBindingHash", "poolProjectionHash",
  "obligationId", "obligationHash", "tradingFacilityId", "facilityHash",
  "facilityStateHash", "facilityVersion", "hypercoreIntentId",
  "hypercoreIntentHash", "economicActionHash", "venueAccountBindingId",
  "venueAccountBindingHash", "delegateHash", "signerReferenceHash",
  "policyConstraintHash", "payloadHash", "intentKind", "environment", "market",
  "maxOrderNotionalUsd", "launchProfileId", "preparedAt", "expiresAt", "state",
  "version", "outcomeHash", "observedAt", "externalNonceAllocated",
  "signatureCreated", "networkCalled", "exactExecutionOnly", "oneUse",
  "withdrawalAuthority", "transferAuthority", "leverageChangeAuthority",
  "mainnetAuthority", "productionAuthority", "realFundsAuthority", "schemaVersion"
];

export function createM2BSecuredFacilityComposition({
  authorization,
  currentResourceHashes,
  stableIntent,
  policyConstraint,
  now = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    fail("invalid_m2b_hyperliquid_composition", "composition input is open");
  }
  if (authorization?.schemaVersion !== AGENT_SECURED_FACILITY_AUTHORIZATION_SCHEMA_VERSION) {
    fail("m2b_facility_authorization_denied", "current M2B-001 authorization is required");
  }
  const prepared = trustedDate("now", now);
  authorizeAgentSecuredFacilityIntent(authorization, {
    kind: "open",
    expectedAuthorizationHash: authorization.authorizationHash,
    expectedVersion: authorization.version,
    currentResourceHashes,
    now: prepared
  });
  verifyHypercoreStableExecutionIntent(stableIntent);
  verifyHypercoreStablePolicyConstraint(policyConstraint);
  if (
    stableIntent.schemaVersion !== HYPERCORE_STABLE_INTENT_SCHEMA_VERSION ||
    policyConstraint.schemaVersion !== HYPERCORE_STABLE_POLICY_SCHEMA_VERSION ||
    stableIntent.state !== "PREPARED" || stableIntent.actionKind !== "order" ||
    stableIntent.facilityId !== authorization.tradingFacilityId ||
    stableIntent.facilityHash !== authorization.facilityHash ||
    stableIntent.policyConstraintHash !== policyConstraint.policyConstraintHash ||
    policyConstraint.facilityHash !== authorization.facilityHash ||
    policyConstraint.accountBindingHash !== stableIntent.accountBindingHash ||
    policyConstraint.delegateHash !== stableIntent.delegateHash ||
    policyConstraint.signerReferenceHash !== stableIntent.signerReferenceHash ||
    stableIntent.hyperliquidAction.orders[0].r !== false
  ) {
    fail("m2b_hyperliquid_binding_denied", "stable HyperCore intent is not exactly bound to the secured Facility");
  }
  const expiresAt = new Date(Math.min(
    new Date(authorization.expiresAt).getTime(),
    new Date(stableIntent.approvalExpiresAt).getTime()
  ));
  if (expiresAt <= prepared) {
    fail("m2b_hyperliquid_composition_expired", "composition authority already expired");
  }
  const value = core({
    agentSecuredFacilityAuthorizationId: authorization.agentSecuredFacilityAuthorizationId,
    agentSecuredFacilityAuthorizationHash: authorization.authorizationHash,
    agentSecuredFacilityAuthorizationVersion: authorization.version,
    subjectId: authorization.subjectId,
    principalId: authorization.principalId,
    mandateId: authorization.mandateId,
    mandateHash: authorization.mandateHash,
    economicAccountBindingId: authorization.accountBindingId,
    economicAccountHash: authorization.accountHash,
    poolObligationBindingId: authorization.poolObligationBindingId,
    poolBindingHash: authorization.poolBindingHash,
    poolProjectionHash: authorization.poolProjectionHash,
    obligationId: authorization.obligationId,
    obligationHash: authorization.obligationHash,
    tradingFacilityId: authorization.tradingFacilityId,
    facilityHash: authorization.facilityHash,
    facilityStateHash: authorization.facilityStateHash,
    facilityVersion: authorization.facilityVersion,
    hypercoreIntentId: stableIntent.intentId,
    hypercoreIntentHash: stableIntent.intentHash,
    economicActionHash: stableIntent.economicActionHash,
    venueAccountBindingId: stableIntent.accountBindingId,
    venueAccountBindingHash: stableIntent.accountBindingHash,
    delegateHash: stableIntent.delegateHash,
    signerReferenceHash: stableIntent.signerReferenceHash,
    policyConstraintHash: stableIntent.policyConstraintHash,
    payloadHash: stableIntent.payloadHash,
    preparedAt: prepared.toISOString(),
    expiresAt: expiresAt.toISOString()
  });
  const compositionHash = hashId("m2b_hyperliquid_composition", value);
  return Object.freeze({
    m2bHyperliquidCompositionId: `m2b_hyperliquid_composition_${compositionHash.slice(2)}`,
    compositionHash,
    ...value,
    state: M2BHyperliquidCompositionState.PREPARED,
    version: 1,
    outcomeHash: null,
    observedAt: null,
    externalNonceAllocated: false,
    signatureCreated: false,
    networkCalled: false
  });
}

export function verifyM2BSecuredFacilityComposition(value) {
  exact("M2B Hyperliquid composition", value, COMPOSITION_FIELDS);
  for (const key of [
    "compositionHash", "agentSecuredFacilityAuthorizationHash", "mandateHash",
    "economicAccountHash", "poolBindingHash", "poolProjectionHash",
    "obligationHash", "facilityHash", "facilityStateHash", "hypercoreIntentHash",
    "economicActionHash", "venueAccountBindingHash", "delegateHash",
    "signerReferenceHash", "policyConstraintHash", "payloadHash"
  ]) bytes32(key, value[key]);
  bytes32("outcomeHash", value.outcomeHash, { nullable: true });
  for (const key of [
    "m2bHyperliquidCompositionId", "agentSecuredFacilityAuthorizationId",
    "subjectId", "principalId", "mandateId", "economicAccountBindingId",
    "poolObligationBindingId", "obligationId", "tradingFacilityId",
    "hypercoreIntentId", "venueAccountBindingId"
  ]) identifier(key, value[key]);
  const preparedAt = timestamp("preparedAt", value.preparedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  if (value.observedAt !== null) timestamp("observedAt", value.observedAt);
  if (
    expiresAt <= preparedAt || !STATES.has(value.state) ||
    !Number.isSafeInteger(value.version) || value.version < 1 ||
    value.intentKind !== "open" || value.environment !== "hyperliquid_testnet" ||
    value.market !== "BTC" || value.maxOrderNotionalUsd !== "10" ||
    value.launchProfileId !== M2B_HYPERLIQUID_LAUNCH_PROFILE ||
    value.exactExecutionOnly !== true || value.oneUse !== true ||
    value.withdrawalAuthority !== false || value.transferAuthority !== false ||
    value.leverageChangeAuthority !== false || value.mainnetAuthority !== false ||
    value.productionAuthority !== false || value.realFundsAuthority !== false ||
    value.externalNonceAllocated !== false || value.signatureCreated !== false ||
    value.networkCalled !== false ||
    value.schemaVersion !== M2B_HYPERLIQUID_COMPOSITION_SCHEMA_VERSION ||
    hashId("m2b_hyperliquid_composition", core(value)) !== value.compositionHash
  ) {
    fail("invalid_m2b_hyperliquid_composition", "composition drifted from the exact pre-write boundary");
  }
  return true;
}

export function evaluateM2B002PrewriteReadiness({
  composition,
  authorization,
  currentResourceHashes,
  launchProfile = null,
  accountObservation = null,
  signerHandoff = null,
  runApproval = null,
  now = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    fail("invalid_m2b_hyperliquid_readiness", "readiness input is open");
  }
  verifyM2BSecuredFacilityComposition(composition);
  const current = trustedDate("now", now);
  authorizeAgentSecuredFacilityIntent(authorization, {
    kind: "open",
    expectedAuthorizationHash: composition.agentSecuredFacilityAuthorizationHash,
    expectedVersion: composition.agentSecuredFacilityAuthorizationVersion,
    currentResourceHashes,
    now: current
  });
  if (authorization.agentSecuredFacilityAuthorizationId !==
    composition.agentSecuredFacilityAuthorizationId ||
    new Date(composition.expiresAt) <= current) {
    fail("m2b_hyperliquid_authority_drift", "composition authority is stale or mismatched");
  }
  const blockers = [];
  if (
    launchProfile?.profileId !== M2B_HYPERLIQUID_LAUNCH_PROFILE ||
    launchProfile.releaseEnabled !== true || launchProfile.realFundsEnabled !== false ||
    launchProfile.testAssetsEnabled !== true ||
    launchProfile.agentVenueExecutionEnabled !== true ||
    launchProfile.withdrawalAllowed !== false || launchProfile.transferAllowed !== false ||
    launchProfile.exactProfileHash !== composition.compositionHash
  ) blockers.push("exact_launch_profile_missing_or_disabled");
  if (
    accountObservation?.compositionHash !== composition.compositionHash ||
    accountObservation.reconciliationStatus !== "RECONCILED" ||
    accountObservation.unknownOutcomeCount !== 0 || accountObservation.paused !== false ||
    !HASH.test(accountObservation.observationHash ?? "")
  ) blockers.push("fresh_reconciled_account_observation_missing");
  if (
    signerHandoff?.compositionHash !== composition.compositionHash ||
    signerHandoff.signerReferenceHash !== composition.signerReferenceHash ||
    signerHandoff.fresh !== true || signerHandoff.nonExporting !== true ||
    signerHandoff.reusable !== false || !HASH.test(signerHandoff.handoffHash ?? "")
  ) blockers.push("fresh_non_exporting_signer_handoff_missing");
  if (
    runApproval?.compositionHash !== composition.compositionHash ||
    runApproval.oneUse !== true || runApproval.consumed !== false ||
    runApproval.expiresAt == null || new Date(runApproval.expiresAt) <= current ||
    !HASH.test(runApproval.approvalHash ?? "")
  ) blockers.push("exact_one_use_founder_run_approval_missing");
  return Object.freeze({
    status: blockers.length === 0 ? "READY_FOR_PROTECTED_WRITER" : "BLOCKED_PREWRITE",
    compositionHash: composition.compositionHash,
    blockers: Object.freeze(blockers),
    externalNonceAllocated: false,
    signatureCreated: false,
    networkCalled: false,
    submissionAuthorizedByReceipt: false,
    schemaVersion: "m2b_002_prewrite_readiness.v1"
  });
}

export function createM2BProtectiveCloseReceipt({
  authorization,
  currentResourceHashes,
  parentComposition,
  cancelIntent,
  now = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    fail("invalid_m2b_protective_close", "protective close input is open");
  }
  const checkedAt = trustedDate("now", now);
  verifyM2BSecuredFacilityComposition(parentComposition);
  authorizeAgentSecuredFacilityIntent(authorization, {
    kind: "close",
    expectedAuthorizationHash:
      parentComposition.agentSecuredFacilityAuthorizationHash,
    expectedVersion:
      parentComposition.agentSecuredFacilityAuthorizationVersion,
    currentResourceHashes,
    now: checkedAt
  });
  verifyHypercoreStableCancelExecutionIntent(cancelIntent);
  if (
    cancelIntent.schemaVersion !== HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION ||
    cancelIntent.state !== "PREPARED" || cancelIntent.version !== 1 ||
    cancelIntent.actionKind !== "cancelByCloid" ||
    cancelIntent.facilityId !== parentComposition.tradingFacilityId ||
    cancelIntent.facilityHash !== parentComposition.facilityHash ||
    cancelIntent.parentIntentId !== parentComposition.hypercoreIntentId ||
    cancelIntent.parentIntentHash !== parentComposition.hypercoreIntentHash ||
    cancelIntent.accountBindingId !== parentComposition.venueAccountBindingId ||
    cancelIntent.accountBindingHash !== parentComposition.venueAccountBindingHash ||
    cancelIntent.delegateHash !== parentComposition.delegateHash ||
    cancelIntent.signerReferenceHash !== parentComposition.signerReferenceHash ||
    cancelIntent.targetOrder.parentIntentId !== parentComposition.hypercoreIntentId ||
    cancelIntent.targetOrder.parentIntentHash !== parentComposition.hypercoreIntentHash ||
    cancelIntent.targetOrder.market !== "BTC" ||
    cancelIntent.targetOrder.reduceOnly !== false ||
    new Date(cancelIntent.approvalExpiresAt) <= checkedAt ||
    cancelIntent.externalSubmissionAttempted !== false ||
    cancelIntent.retryAllowed !== false
  ) {
    fail(
      "m2b_protective_close_binding_denied",
      "protective close must cancel only the exact bound opening order"
    );
  }
  const core = {
    agentSecuredFacilityAuthorizationId:
      parentComposition.agentSecuredFacilityAuthorizationId,
    agentSecuredFacilityAuthorizationHash:
      parentComposition.agentSecuredFacilityAuthorizationHash,
    parentCompositionId: parentComposition.m2bHyperliquidCompositionId,
    parentCompositionHash: parentComposition.compositionHash,
    parentIntentId: parentComposition.hypercoreIntentId,
    parentIntentHash: parentComposition.hypercoreIntentHash,
    cancelIntentId: cancelIntent.intentId,
    cancelIntentHash: cancelIntent.intentHash,
    targetOrderHash: cancelIntent.targetOrderHash,
    tradingFacilityId: parentComposition.tradingFacilityId,
    facilityHash: parentComposition.facilityHash,
    actionKind: "cancelByCloid",
    checkedAt: checkedAt.toISOString(),
    externalNonceAllocated: false,
    signatureCreated: false,
    networkCalled: false,
    retryAllowed: false,
    increasesExposure: false,
    withdrawalAuthority: false,
    transferAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: "m2b_hyperliquid_protective_close_receipt.v1"
  };
  const receiptHash = hashId("m2b_hyperliquid_protective_close_receipt", core);
  return Object.freeze({
    protectiveCloseReceiptId:
      `m2b_hyperliquid_protective_close_receipt_${receiptHash.slice(2)}`,
    receiptHash,
    ...core
  });
}
