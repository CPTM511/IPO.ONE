import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  verifyHypercoreOfficialSigningRequest
} from "./hypercore-official-signing.js";
import {
  verifyHypercorePreparedAction
} from "./hypercore-action.js";
import {
  HYPERCORE_TESTNET_PROOF_PROFILE,
  verifyHypercoreTestnetExchangeEnvelope,
  verifyHypercoreTestnetExchangeResult
} from "./hypercore-testnet-proof.js";
import {
  HYPERCORE_CANCEL_JIT_PREFLIGHT_SCHEMA_VERSION,
  HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION,
  verifyHypercoreCancelJitVenuePreflightReceipt,
  verifyHypercoreStableCancelExecutionIntent
} from "./hypercore-cancel-closure.js";

export const HYPERCORE_STABLE_POLICY_SCHEMA_VERSION =
  "hypercore_stable_policy_constraint.v2";
export const HYPERCORE_STABLE_INTENT_SCHEMA_VERSION =
  "hypercore_stable_execution_intent.v2";
export const HYPERCORE_STABLE_APPROVAL_SCHEMA_VERSION =
  "hypercore_stable_founder_approval.v2";
export const HYPERCORE_JIT_PREFLIGHT_SCHEMA_VERSION =
  "hypercore_jit_venue_preflight_receipt.v2";
export const HYPERCORE_JIT_AUTHORIZATION_SCHEMA_VERSION =
  "hypercore_jit_action_authorization.v2";

export const HypercoreStableIntentState = Object.freeze({
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
const DECIMAL = /^(?:0|0\.[0-9]{1,18}|[1-9][0-9]{0,30}(?:\.[0-9]{1,18})?)$/;
const CLOID = /^0x[0-9a-f]{32}$/;

function fail(code, message) {
  throw new DomainError(code, message);
}

function plain(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exact(name, value, fields) {
  if (
    !plain(value) ||
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  ) fail("invalid_hypercore_jit_input", `${name} has an invalid closed shape`);
}

function bytes32(name, value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hypercore_jit_input", `${name} must be lowercase bytes32`);
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hypercore_jit_input", `${name} is invalid`);
  }
  return value;
}

function integer(name, value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail("invalid_hypercore_jit_input", `${name} must be a safe integer`);
  }
  return value;
}

function decimal(name, value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    fail("invalid_hypercore_jit_input", `${name} must be canonical decimal`);
  }
  return value;
}

function timestamp(name, value) {
  if (typeof value !== "string") {
    fail("invalid_hypercore_jit_input", `${name} must be canonical ISO time`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("invalid_hypercore_jit_input", `${name} must be canonical ISO time`);
  }
  return parsed;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_hypercore_jit_input", `${name} must be a trusted Date`);
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

function decimal18(value) {
  decimal("decimal", value);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

function stableAction(value) {
  exact("stable HyperCore action", value, ["type", "orders", "grouping"]);
  if (value.type !== "order" || value.grouping !== "na" || value.orders.length !== 1) {
    fail("hypercore_stable_action_denied", "exactly one order is required");
  }
  const order = value.orders[0];
  exact("stable HyperCore order", order, ["a", "b", "p", "s", "r", "t", "c"]);
  exact("stable HyperCore order type", order.t, ["limit"]);
  exact("stable HyperCore limit", order.t.limit, ["tif"]);
  if (
    order.a !== HYPERCORE_TESTNET_PROOF_PROFILE.assetIndex ||
    typeof order.b !== "boolean" ||
    order.r !== false ||
    order.t.limit.tif !== HYPERCORE_TESTNET_PROOF_PROFILE.openingTimeInForce ||
    !CLOID.test(order.c ?? "")
  ) fail("hypercore_stable_action_denied", "action is outside the exact BTC ALO scope");
  if (
    decimal18(order.p) * decimal18(order.s) !== 10n * 10n ** 36n
  ) fail("hypercore_stable_action_denied", "order notional must equal 10 Testnet USDC");
  return value;
}

function stablePolicyCore(value) {
  const { policyConstraintHash: _ignored, ...core } = value;
  return core;
}

export function createHypercoreStablePolicyConstraint({
  policyId,
  policyVersion,
  facilityHash,
  accountBindingHash,
  delegateHash,
  signerReferenceHash,
  executionOwnerActorId,
  riskOwnerActorId,
  incidentOwnerActorId
}) {
  for (const [name, value] of Object.entries({
    policyId,
    policyVersion,
    executionOwnerActorId,
    riskOwnerActorId,
    incidentOwnerActorId
  })) identifier(name, value);
  for (const [name, value] of Object.entries({
    facilityHash,
    accountBindingHash,
    delegateHash,
    signerReferenceHash
  })) bytes32(name, value);
  if (executionOwnerActorId === riskOwnerActorId) {
    fail("hypercore_stable_owner_separation_denied", "execution and risk owners must differ");
  }
  const core = {
    policyId,
    policyVersion,
    facilityHash,
    accountBindingHash,
    delegateHash,
    signerReferenceHash,
    environment: "hyperliquid_testnet",
    market: "BTC",
    productClass: "perpetual",
    assetIndex: 3,
    sizeDecimals: 5,
    priceDecimals: 1,
    maxOrderNotionalUsd: "10",
    maxAggregateProofExposureUsd: "10",
    maxOpenOrders: 1,
    maxSubmissions: 1,
    openingTimeInForce: "Alo",
    minimumPostOnlyDistanceBps: 50,
    maximumPostOnlyDistanceBps: 3_500,
    maxRiskAgeMs: 10_000,
    maxMetadataAgeMs: 5 * 60 * 1000,
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
    schemaVersion: HYPERCORE_STABLE_POLICY_SCHEMA_VERSION
  };
  return cloneFreeze({
    policyConstraintHash: hashId("hypercore_stable_policy_constraint", core),
    ...core
  });
}

export function verifyHypercoreStablePolicyConstraint(value) {
  exact("stable policy constraint", value, [
    "policyConstraintHash", "policyId", "policyVersion", "facilityHash",
    "accountBindingHash", "delegateHash", "signerReferenceHash", "environment",
    "market", "productClass", "assetIndex", "sizeDecimals", "priceDecimals",
    "maxOrderNotionalUsd", "maxAggregateProofExposureUsd", "maxOpenOrders",
    "maxSubmissions", "openingTimeInForce", "minimumPostOnlyDistanceBps",
    "maximumPostOnlyDistanceBps", "maxRiskAgeMs", "maxMetadataAgeMs",
    "requestExpiryMs", "executionOwnerActorId", "riskOwnerActorId",
    "incidentOwnerActorId", "withdrawalAuthority", "transferAuthority",
    "leverageChangeAuthority", "accountAdministrationAuthority",
    "mainnetAuthority", "productionAuthority", "realFundsAuthority", "schemaVersion"
  ]);
  bytes32("policyConstraintHash", value.policyConstraintHash);
  if (
    value.environment !== "hyperliquid_testnet" || value.market !== "BTC" ||
    value.productClass !== "perpetual" || value.assetIndex !== 3 ||
    value.sizeDecimals !== 5 || value.priceDecimals !== 1 ||
    value.maxOrderNotionalUsd !== "10" ||
    value.maxAggregateProofExposureUsd !== "10" || value.maxOpenOrders !== 1 ||
    value.maxSubmissions !== 1 || value.openingTimeInForce !== "Alo" ||
    value.minimumPostOnlyDistanceBps !== 50 ||
    value.maximumPostOnlyDistanceBps !== 3_500 ||
    value.maxRiskAgeMs !== 10_000 || value.maxMetadataAgeMs !== 300_000 ||
    value.requestExpiryMs !== 30_000 || value.withdrawalAuthority !== false ||
    value.transferAuthority !== false || value.leverageChangeAuthority !== false ||
    value.accountAdministrationAuthority !== false || value.mainnetAuthority !== false ||
    value.productionAuthority !== false || value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_STABLE_POLICY_SCHEMA_VERSION ||
    hashId("hypercore_stable_policy_constraint", stablePolicyCore(value)) !==
      value.policyConstraintHash
  ) fail("invalid_hypercore_stable_policy", "stable policy constraint drifted");
  return true;
}

function intentStableIdentity(value) {
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
    policyConstraintHash: value.policyConstraintHash,
    payloadHash: value.payloadHash,
    actionKind: value.actionKind,
    hyperliquidAction: value.hyperliquidAction,
    nonce: value.nonce,
    preparedAt: value.preparedAt,
    approvalExpiresAt: value.approvalExpiresAt,
    exactExecutionOnly: true,
    oneUse: true,
    schemaVersion: HYPERCORE_STABLE_INTENT_SCHEMA_VERSION
  };
}

export function createHypercoreStableExecutionIntent({
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
  policyConstraint,
  hyperliquidAction,
  idempotencyKey,
  nonce,
  preparedAt,
  approvalExpiresAt
}) {
  for (const [name, value] of Object.entries({
    facilityId, accountBindingId, handoffId, delegateId
  })) identifier(name, value);
  for (const [name, value] of Object.entries({
    facilityHash, accountBindingHash, canonicalAccountAddressHash, handoffHash,
    delegateHash, apiWalletAddressHash, signerReferenceHash
  })) bytes32(name, value);
  verifyHypercoreStablePolicyConstraint(policyConstraint);
  stableAction(hyperliquidAction);
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
    fail("invalid_hypercore_jit_input", "idempotencyKey is invalid");
  }
  integer("nonce", nonce, 1);
  const prepared = trustedDate("preparedAt", preparedAt);
  const approvalExpiry = trustedDate("approvalExpiresAt", approvalExpiresAt);
  if (
    approvalExpiry <= prepared || approvalExpiry.getTime() - prepared.getTime() > 30 * 60 * 1000 ||
    policyConstraint.facilityHash !== facilityHash ||
    policyConstraint.accountBindingHash !== accountBindingHash ||
    policyConstraint.delegateHash !== delegateHash ||
    policyConstraint.signerReferenceHash !== signerReferenceHash
  ) fail("invalid_hypercore_stable_intent", "stable intent timing or binding drifted");
  const payloadHash = hashId("hypercore_stable_execution_payload", hyperliquidAction);
  const economicActionHash = hashId("hypercore_stable_economic_action", {
    facilityHash,
    accountBindingHash,
    delegateHash,
    policyConstraintHash: policyConstraint.policyConstraintHash,
    payloadHash
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
    policyConstraintHash: policyConstraint.policyConstraintHash,
    payloadHash,
    actionKind: "order",
    hyperliquidAction: structuredClone(hyperliquidAction),
    nonce,
    preparedAt: prepared.toISOString(),
    approvalExpiresAt: approvalExpiry.toISOString(),
    state: HypercoreStableIntentState.PREPARED,
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
    schemaVersion: HYPERCORE_STABLE_INTENT_SCHEMA_VERSION
  };
  const intentHash = hashId("hypercore_stable_execution_intent", intentStableIdentity(value));
  return cloneFreeze({
    intentId: `hypercore_stable_intent_${intentHash.slice(2)}`,
    intentHash,
    ...value
  });
}

const INTENT_FIELDS = [
  "intentId", "intentHash", "economicActionHash", "idempotencyKeyHash",
  "facilityId", "facilityHash", "accountBindingId", "accountBindingHash",
  "canonicalAccountAddressHash", "handoffId", "handoffHash", "delegateId",
  "delegateHash", "apiWalletAddressHash", "signerReferenceHash",
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

export function verifyHypercoreStableExecutionIntent(value) {
  if (value?.schemaVersion === HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION) {
    return verifyHypercoreStableCancelExecutionIntent(value);
  }
  exact("stable execution intent", value, INTENT_FIELDS);
  for (const key of [
    "intentHash", "economicActionHash", "idempotencyKeyHash", "facilityHash",
    "accountBindingHash", "canonicalAccountAddressHash", "handoffHash",
    "delegateHash", "apiWalletAddressHash", "signerReferenceHash",
    "policyConstraintHash", "payloadHash"
  ]) bytes32(key, value[key]);
  for (const key of [
    "founderApprovalHash", "humanConfirmationHash", "preflightReceiptHash",
    "riskSnapshotHash", "metadataHash", "signingRequestHash",
    "actionAuthorizationHash", "requestBodyHash", "signatureHash", "claimHash",
    "responseHash", "reconciliationHash", "venueOrderStateHash",
    "venueAccountStateHash", "ledgerStateHash", "obligationEvidenceHash",
    "signerRetirementHash"
  ]) bytes32(key, value[key], { nullable: true });
  stableAction(value.hyperliquidAction);
  integer("nonce", value.nonce, 1);
  const preparedAt = timestamp("preparedAt", value.preparedAt);
  const approvalExpiresAt = timestamp("approvalExpiresAt", value.approvalExpiresAt);
  const lifecycleTimes = [
    "approvedAt", "signingStartedAt", "claimedAt", "resolvedAt", "reconciledAt", "closedAt"
  ].map((key) => value[key] === null ? null : timestamp(key, value[key]));
  const nullableIdentifiers = ["founderApprovalId", "preflightReceiptId"];
  for (const key of nullableIdentifiers) if (value[key] !== null) identifier(key, value[key]);
  const hasApproval = value.founderApprovalId !== null &&
    value.founderApprovalHash !== null && value.humanConfirmationHash !== null;
  const hasPreflight = value.preflightReceiptId !== null &&
    value.preflightReceiptHash !== null && value.riskSnapshotHash !== null &&
    value.metadataHash !== null && value.signingRequestHash !== null;
  const hasClaim = value.actionAuthorizationHash !== null &&
    value.requestBodyHash !== null && value.signatureHash !== null && value.claimHash !== null;
  const hasResult = value.disposition !== null && value.responseHash !== null;
  const stateValid = (
    (value.state === "PREPARED" && value.version === 1 && !hasApproval && !hasPreflight && !hasClaim && !hasResult) ||
    (value.state === "APPROVED" && value.version === 2 && hasApproval && !hasPreflight && !hasClaim && !hasResult) ||
    (value.state === "SIGNING" && value.version === 3 && hasApproval && hasPreflight && !hasClaim && !hasResult) ||
    (value.state === "SUBMITTING" && value.version === 4 && hasApproval && hasPreflight && hasClaim && !hasResult && value.externalSubmissionAttempted === true) ||
    (["SUBMITTED", "REJECTED", "UNKNOWN"].includes(value.state) && value.version === 5 && hasApproval && hasPreflight && hasClaim && hasResult && value.externalSubmissionAttempted === true) ||
    (value.state === "RECONCILED" && value.version === 6 && hasResult && value.reconciliationHash !== null) ||
    (value.state === "CLOSED" && value.version === 7 && hasResult && value.reconciliationHash !== null && value.signerRetirementHash !== null) ||
    (value.state === "ABORTED" && value.version >= 3 && value.externalSubmissionAttempted === false)
  );
  if (
    approvalExpiresAt <= preparedAt ||
    lifecycleTimes.some((time) => time !== null && time < preparedAt) ||
    !stateValid ||
    value.intentId !== `hypercore_stable_intent_${value.intentHash.slice(2)}` ||
    hashId("hypercore_stable_execution_intent", intentStableIdentity(value)) !== value.intentHash ||
    hashId("hypercore_stable_execution_payload", value.hyperliquidAction) !== value.payloadHash ||
    value.actionKind !== "order" || value.retryAllowed !== false ||
    value.rawActionPersisted !== false || value.rawResponsePersisted !== false ||
    value.rawKeyPersisted !== false || value.rawSignaturePersisted !== false ||
    value.exactExecutionOnly !== true || value.oneUse !== true ||
    value.mainnetAuthority !== false || value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_STABLE_INTENT_SCHEMA_VERSION
  ) fail("invalid_hypercore_stable_intent", "stable execution intent drifted");
  return true;
}

function approvalIdentity(value) {
  const { approvalId: _id, approvalHash: _hash, status: _status,
    consumedAt: _consumed, version: _version, ...identity } = value;
  return identity;
}

export function createHypercoreStableFounderApproval({
  intent,
  actorId,
  confirmationNonceHash,
  approvedAt,
  expiresAt
}) {
  verifyHypercoreStableExecutionIntent(intent);
  identifier("actorId", actorId);
  bytes32("confirmationNonceHash", confirmationNonceHash);
  const approved = trustedDate("approvedAt", approvedAt);
  const expires = trustedDate("expiresAt", expiresAt);
  if (
    intent.state !== "PREPARED" || approved < new Date(intent.preparedAt) ||
    expires <= approved || expires > new Date(intent.approvalExpiresAt)
  ) fail("hypercore_stable_approval_denied", "stable approval timing is invalid");
  const humanConfirmationHash = hashId("hypercore_stable_human_confirmation", {
    actorId,
    intentHash: intent.intentHash,
    payloadHash: intent.payloadHash,
    accountBindingHash: intent.accountBindingHash,
    delegateHash: intent.delegateHash,
    policyConstraintHash: intent.policyConstraintHash,
    approvedAt: approved.toISOString(),
    expiresAt: expires.toISOString(),
    oneUse: true
  });
  const value = {
    intentId: intent.intentId,
    intentHash: intent.intentHash,
    economicActionHash: intent.economicActionHash,
    payloadHash: intent.payloadHash,
    actorId,
    confirmationNonceHash,
    humanConfirmationHash,
    accountBindingHash: intent.accountBindingHash,
    canonicalAccountAddressHash: intent.canonicalAccountAddressHash,
    handoffHash: intent.handoffHash,
    delegateHash: intent.delegateHash,
    apiWalletAddressHash: intent.apiWalletAddressHash,
    signerReferenceHash: intent.signerReferenceHash,
    policyConstraintHash: intent.policyConstraintHash,
    nonce: intent.nonce,
    approvedAt: approved.toISOString(),
    expiresAt: expires.toISOString(),
    status: "APPROVED",
    consumedAt: null,
    version: 1,
    exactExecutionOnly: true,
    oneUse: true,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_STABLE_APPROVAL_SCHEMA_VERSION
  };
  const approvalHash = hashId("hypercore_stable_founder_approval", approvalIdentity(value));
  return cloneFreeze({
    approvalId: `hypercore_stable_approval_${approvalHash.slice(2)}`,
    approvalHash,
    ...value
  });
}

export function verifyHypercoreStableFounderApproval(value) {
  exact("stable Founder approval", value, [
    "approvalId", "approvalHash", "intentId", "intentHash", "economicActionHash",
    "payloadHash", "actorId", "confirmationNonceHash", "humanConfirmationHash",
    "accountBindingHash", "canonicalAccountAddressHash", "handoffHash",
    "delegateHash", "apiWalletAddressHash", "signerReferenceHash",
    "policyConstraintHash", "nonce", "approvedAt", "expiresAt", "status",
    "consumedAt", "version", "exactExecutionOnly", "oneUse", "mainnetAuthority",
    "productionAuthority", "realFundsAuthority", "schemaVersion"
  ]);
  for (const key of [
    "approvalHash", "intentHash", "economicActionHash", "payloadHash",
    "confirmationNonceHash", "humanConfirmationHash", "accountBindingHash",
    "canonicalAccountAddressHash", "handoffHash", "delegateHash",
    "apiWalletAddressHash", "signerReferenceHash", "policyConstraintHash"
  ]) bytes32(key, value[key]);
  const approved = timestamp("approvedAt", value.approvedAt);
  const expires = timestamp("expiresAt", value.expiresAt);
  const consumed = value.consumedAt === null ? null : timestamp("consumedAt", value.consumedAt);
  const lifecycle =
    (value.status === "APPROVED" && value.version === 1 && consumed === null) ||
    (value.status === "CONSUMED" && value.version === 2 && consumed !== null);
  if (
    expires <= approved || !lifecycle || value.exactExecutionOnly !== true ||
    value.oneUse !== true || value.mainnetAuthority !== false ||
    value.productionAuthority !== false || value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_STABLE_APPROVAL_SCHEMA_VERSION ||
    value.approvalId !== `hypercore_stable_approval_${value.approvalHash.slice(2)}` ||
    hashId("hypercore_stable_founder_approval", approvalIdentity(value)) !== value.approvalHash
  ) fail("invalid_hypercore_stable_approval", "stable approval drifted");
  return true;
}

export function approveHypercoreStableExecutionIntent({ intent, approval }) {
  verifyHypercoreStableExecutionIntent(intent);
  verifyHypercoreStableFounderApproval(approval);
  if (
    intent.state !== "PREPARED" || approval.intentHash !== intent.intentHash ||
    approval.payloadHash !== intent.payloadHash ||
    approval.accountBindingHash !== intent.accountBindingHash ||
    approval.delegateHash !== intent.delegateHash ||
    approval.policyConstraintHash !== intent.policyConstraintHash
  ) fail("hypercore_stable_approval_binding_denied", "stable approval binding drifted");
  return cloneFreeze({
    ...structuredClone(intent),
    state: "APPROVED",
    version: 2,
    founderApprovalId: approval.approvalId,
    founderApprovalHash: approval.approvalHash,
    humanConfirmationHash: approval.humanConfirmationHash,
    approvedAt: approval.approvedAt
  });
}

export function createHypercoreJitVenuePreflightReceipt({
  intent,
  approval,
  observation,
  now
}) {
  verifyHypercoreStableExecutionIntent(intent);
  verifyHypercoreStableFounderApproval(approval);
  exact("JIT venue observation", observation, [
    "masterRole", "apiWalletRole", "accountValue", "withdrawable",
    "positionCount", "openOrderCount", "aggregateExposureUsd",
    "positionNotionalUsd", "unknownOutcomeCount", "reconciliationStatus",
    "paused", "masterRoleHash", "apiWalletRoleHash", "accountStateHash",
    "ordersHash", "metadataHash", "metadataObservedAt", "market", "assetIndex",
    "sizeDecimals", "priceDecimals", "mid", "bestBid", "bestAsk",
    "metaResponseHash", "midsResponseHash", "bookResponseHash"
  ]);
  const observed = trustedDate("now", now);
  const metadataObserved = timestamp("metadataObservedAt", observation.metadataObservedAt);
  for (const key of [
    "masterRoleHash", "apiWalletRoleHash", "accountStateHash", "ordersHash",
    "metadataHash", "metaResponseHash", "midsResponseHash", "bookResponseHash"
  ]) bytes32(key, observation[key]);
  for (const key of [
    "accountValue", "withdrawable", "aggregateExposureUsd", "positionNotionalUsd",
    "mid", "bestBid", "bestAsk"
  ]) decimal(key, observation[key]);
  const metadataAge = observed.getTime() - metadataObserved.getTime();
  const order = intent.hyperliquidAction.orders[0];
  const orderPrice = Number(order.p);
  const bestBid = Number(observation.bestBid);
  const bestAsk = Number(observation.bestAsk);
  const bookMid = (bestBid + bestAsk) / 2;
  const postOnlyDistanceBps = order.b
    ? Math.floor(((bestBid - orderPrice) / bookMid) * 10_000)
    : Math.floor(((orderPrice - bestAsk) / bookMid) * 10_000);
  if (
    intent.state !== "APPROVED" || approval.status !== "APPROVED" ||
    approval.intentHash !== intent.intentHash || observed >= new Date(approval.expiresAt) ||
    metadataAge < 0 || metadataAge > 5 * 60 * 1000 ||
    observation.masterRole !== "user" || observation.apiWalletRole !== "agent" ||
    decimal18(observation.accountValue) < 10n * 10n ** 18n ||
    decimal18(observation.withdrawable) < 10n * 10n ** 18n ||
    observation.positionCount !== 0 || observation.openOrderCount !== 0 ||
    decimal18(observation.aggregateExposureUsd) !== 0n ||
    decimal18(observation.positionNotionalUsd) !== 0n ||
    observation.unknownOutcomeCount !== 0 ||
    observation.reconciliationStatus !== "RECONCILED" || observation.paused !== false ||
    observation.market !== "BTC" || observation.assetIndex !== 3 ||
    observation.sizeDecimals !== 5 || observation.priceDecimals !== 1 ||
    !Number.isFinite(orderPrice) || !Number.isFinite(bestBid) ||
    !Number.isFinite(bestAsk) || bestBid >= bestAsk ||
    (order.b ? orderPrice >= bestBid : orderPrice <= bestAsk) ||
    postOnlyDistanceBps < 50 || postOnlyDistanceBps > 3_500
  ) fail("hypercore_jit_preflight_denied", "live venue state is stale, unsafe or drifted");
  const riskSnapshot = {
    accountBindingHash: intent.accountBindingHash,
    metadataHash: observation.metadataHash,
    metadataObservedAt: observation.metadataObservedAt,
    observedAt: observed.toISOString(),
    status: "FRESH",
    openOrdersCount: observation.openOrderCount,
    aggregateExposureUsd: observation.aggregateExposureUsd,
    positionNotionalUsd: observation.positionNotionalUsd,
    unknownOutcomeCount: observation.unknownOutcomeCount,
    reconciliationStatus: observation.reconciliationStatus,
    paused: observation.paused
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
    metadataHash: observation.metadataHash,
    riskSnapshotHash: riskSnapshot.riskSnapshotHash,
    riskSnapshot,
    observation: structuredClone(observation),
    postOnlyDistanceBps,
    observedAt: observed.toISOString(),
    expiresAt: new Date(observed.getTime() + 10_000).toISOString(),
    exactPayloadUnchanged: true,
    strictlyNoRiskIncrease: true,
    rawAddressPersisted: false,
    rawResponsePersisted: false,
    rawSignaturePersisted: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_JIT_PREFLIGHT_SCHEMA_VERSION
  };
  const receiptHash = hashId("hypercore_jit_venue_preflight_receipt", core);
  return cloneFreeze({
    receiptId: `hypercore_jit_preflight_${receiptHash.slice(2)}`,
    receiptHash,
    ...core
  });
}

export function verifyHypercoreJitVenuePreflightReceipt(value) {
  if (value?.schemaVersion === HYPERCORE_CANCEL_JIT_PREFLIGHT_SCHEMA_VERSION) {
    return verifyHypercoreCancelJitVenuePreflightReceipt(value);
  }
  exact("JIT venue preflight receipt", value, [
    "receiptId", "receiptHash", "intentId", "intentHash", "approvalHash",
    "payloadHash", "accountBindingHash", "delegateHash", "signerReferenceHash",
    "metadataHash", "riskSnapshotHash", "riskSnapshot", "observation",
    "postOnlyDistanceBps",
    "observedAt", "expiresAt", "exactPayloadUnchanged", "strictlyNoRiskIncrease",
    "rawAddressPersisted", "rawResponsePersisted", "rawSignaturePersisted",
    "mainnetAuthority", "productionAuthority", "realFundsAuthority", "schemaVersion"
  ]);
  for (const key of [
    "receiptHash", "intentHash", "approvalHash", "payloadHash",
    "accountBindingHash", "delegateHash", "signerReferenceHash", "metadataHash",
    "riskSnapshotHash"
  ]) bytes32(key, value[key]);
  const observed = timestamp("observedAt", value.observedAt);
  const expires = timestamp("expiresAt", value.expiresAt);
  const { receiptId: _id, receiptHash: _hash, ...core } = value;
  if (
    expires.getTime() - observed.getTime() !== 10_000 ||
    !Number.isSafeInteger(value.postOnlyDistanceBps) ||
    value.postOnlyDistanceBps < 50 || value.postOnlyDistanceBps > 3_500 ||
    value.riskSnapshot.riskSnapshotHash !== value.riskSnapshotHash ||
    value.exactPayloadUnchanged !== true || value.strictlyNoRiskIncrease !== true ||
    value.rawAddressPersisted !== false || value.rawResponsePersisted !== false ||
    value.rawSignaturePersisted !== false || value.mainnetAuthority !== false ||
    value.productionAuthority !== false || value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_JIT_PREFLIGHT_SCHEMA_VERSION ||
    value.receiptId !== `hypercore_jit_preflight_${value.receiptHash.slice(2)}` ||
    hashId("hypercore_jit_venue_preflight_receipt", core) !== value.receiptHash
  ) fail("invalid_hypercore_jit_preflight", "JIT preflight receipt drifted");
  return true;
}

export function beginHypercoreJitSigning({
  intent,
  approval,
  receipt,
  signingRequest,
  now
}) {
  verifyHypercoreStableExecutionIntent(intent);
  verifyHypercoreStableFounderApproval(approval);
  verifyHypercoreJitVenuePreflightReceipt(receipt);
  verifyHypercoreOfficialSigningRequest(signingRequest);
  const started = trustedDate("now", now);
  if (
    intent.state !== "APPROVED" || approval.intentHash !== intent.intentHash ||
    receipt.intentHash !== intent.intentHash || receipt.approvalHash !== approval.approvalHash ||
    receipt.payloadHash !== intent.payloadHash || started >= new Date(receipt.expiresAt) ||
    started >= new Date(approval.expiresAt) ||
    signingRequest.signerReferenceHash !== intent.signerReferenceHash ||
    signingRequest.canonicalAccountAddressHash !== intent.canonicalAccountAddressHash ||
    signingRequest.nonce !== intent.nonce ||
    hashId("hypercore_stable_execution_payload", signingRequest.action) !== intent.payloadHash
  ) fail("hypercore_jit_signing_denied", "signing claim is stale or drifted");
  return cloneFreeze({
    ...structuredClone(intent),
    state: "SIGNING",
    version: 3,
    preflightReceiptId: receipt.receiptId,
    preflightReceiptHash: receipt.receiptHash,
    riskSnapshotHash: receipt.riskSnapshotHash,
    metadataHash: receipt.metadataHash,
    signingRequestHash: signingRequest.signingRequestHash,
    signingStartedAt: started.toISOString()
  });
}

export function createHypercoreJitActionAuthorization({
  intent,
  approval,
  receipt,
  preparedAction,
  signingRequest,
  now
}) {
  verifyHypercoreStableExecutionIntent(intent);
  verifyHypercoreStableFounderApproval(approval);
  verifyHypercoreJitVenuePreflightReceipt(receipt);
  verifyHypercorePreparedAction(preparedAction);
  verifyHypercoreOfficialSigningRequest(signingRequest);
  const authorized = trustedDate("now", now);
  if (
    intent.state !== "SIGNING" || authorized >= new Date(receipt.expiresAt) ||
    authorized >= new Date(approval.expiresAt) ||
    approval.intentHash !== intent.intentHash || receipt.intentHash !== intent.intentHash ||
    preparedAction.riskSnapshotHash !== receipt.riskSnapshotHash ||
    preparedAction.accountBindingHash !== intent.accountBindingHash ||
    preparedAction.delegateHash !== intent.delegateHash ||
    hashId("hypercore_stable_execution_payload", preparedAction.hyperliquidAction) !== intent.payloadHash ||
    signingRequest.preparedActionHash !== preparedAction.preparedActionHash ||
    signingRequest.signingRequestHash !== intent.signingRequestHash
  ) fail("hypercore_jit_authorization_denied", "JIT authorization is stale or drifted");
  const core = {
    decision: "ALLOW",
    intentId: intent.intentId,
    intentHash: intent.intentHash,
    founderApprovalHash: approval.approvalHash,
    preflightReceiptHash: receipt.receiptHash,
    riskSnapshotHash: receipt.riskSnapshotHash,
    metadataHash: receipt.metadataHash,
    payloadHash: intent.payloadHash,
    preparedActionHash: preparedAction.preparedActionHash,
    signingRequestHash: signingRequest.signingRequestHash,
    accountBindingHash: intent.accountBindingHash,
    delegateHash: intent.delegateHash,
    signerReferenceHash: intent.signerReferenceHash,
    nonce: intent.nonce,
    effectiveUntil: new Date(Math.min(
      authorized.getTime() + 30_000,
      new Date(receipt.expiresAt).getTime(),
      new Date(approval.expiresAt).getTime()
    )).toISOString(),
    singleUse: true,
    externalTestnetSubmissionAllowed: true,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_JIT_AUTHORIZATION_SCHEMA_VERSION
  };
  return cloneFreeze({
    authorizationHash: hashId("hypercore_jit_action_authorization", core),
    ...core
  });
}

export function verifyHypercoreJitActionAuthorization(value) {
  exact("JIT action authorization", value, [
    "authorizationHash", "decision", "intentId", "intentHash",
    "founderApprovalHash", "preflightReceiptHash", "riskSnapshotHash",
    "metadataHash", "payloadHash", "preparedActionHash", "signingRequestHash",
    "accountBindingHash", "delegateHash", "signerReferenceHash", "nonce",
    "effectiveUntil", "singleUse", "externalTestnetSubmissionAllowed",
    "mainnetAuthority", "productionAuthority", "realFundsAuthority", "schemaVersion"
  ]);
  const { authorizationHash, ...core } = value;
  if (
    value.decision !== "ALLOW" || value.singleUse !== true ||
    value.externalTestnetSubmissionAllowed !== true ||
    value.mainnetAuthority !== false || value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_JIT_AUTHORIZATION_SCHEMA_VERSION ||
    hashId("hypercore_jit_action_authorization", core) !== authorizationHash
  ) fail("invalid_hypercore_jit_authorization", "JIT authorization drifted");
  return true;
}

export function createHypercoreJitExchangeEnvelope({
  intent,
  authorization,
  signingRequest,
  signed,
  now
}) {
  verifyHypercoreStableExecutionIntent(intent);
  verifyHypercoreJitActionAuthorization(authorization);
  verifyHypercoreOfficialSigningRequest(signingRequest);
  const current = trustedDate("now", now);
  if (
    intent.state !== "SIGNING" || current >= new Date(authorization.effectiveUntil) ||
    authorization.intentHash !== intent.intentHash ||
    authorization.signingRequestHash !== signingRequest.signingRequestHash ||
    signed?.signingRequestHash !== signingRequest.signingRequestHash ||
    signed?.signatureHash === undefined ||
    hashId("hypercore_stable_execution_payload", signingRequest.action) !== intent.payloadHash
  ) fail("hypercore_jit_exchange_envelope_denied", "signed envelope binding drifted");
  const body = {
    action: signingRequest.action,
    nonce: signingRequest.nonce,
    signature: signed.signature,
    vaultAddress: null,
    expiresAfter: signingRequest.expiresAfter
  };
  const envelope = cloneFreeze({
    authorizationHash: authorization.authorizationHash,
    signingRequestHash: signingRequest.signingRequestHash,
    signatureHash: signed.signatureHash,
    body,
    requestBodyHash: hashId("hypercore_testnet_exchange_body", body),
    endpoint: HYPERCORE_TESTNET_PROOF_PROFILE.endpoint,
    method: "POST",
    redirect: "error",
    retryAllowed: false,
    rawResponsePersisted: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: "hypercore_testnet_exchange_envelope.v1"
  });
  verifyHypercoreTestnetExchangeEnvelope(envelope);
  return envelope;
}

export function claimHypercoreStableExecutionIntent({
  intent,
  authorization,
  envelope,
  claimHash,
  now
}) {
  verifyHypercoreStableExecutionIntent(intent);
  verifyHypercoreJitActionAuthorization(authorization);
  verifyHypercoreTestnetExchangeEnvelope(envelope);
  bytes32("claimHash", claimHash);
  const claimed = trustedDate("now", now);
  if (
    intent.state !== "SIGNING" || authorization.intentHash !== intent.intentHash ||
    authorization.preflightReceiptHash !== intent.preflightReceiptHash ||
    envelope.authorizationHash !== authorization.authorizationHash ||
    claimed >= new Date(authorization.effectiveUntil)
  ) fail("hypercore_jit_claim_denied", "durable JIT claim is stale or drifted");
  return cloneFreeze({
    ...structuredClone(intent),
    state: "SUBMITTING",
    version: 4,
    actionAuthorizationHash: authorization.authorizationHash,
    requestBodyHash: envelope.requestBodyHash,
    signatureHash: envelope.signatureHash,
    claimHash,
    claimedAt: claimed.toISOString(),
    externalSubmissionAttempted: true
  });
}

export function resolveHypercoreStableExecutionIntent({ intent, result, now }) {
  verifyHypercoreStableExecutionIntent(intent);
  verifyHypercoreTestnetExchangeResult(result);
  const resolved = trustedDate("now", now);
  const state = {
    confirmed: "SUBMITTED",
    rejected: "REJECTED",
    unknown: "UNKNOWN"
  }[result.disposition];
  if (
    intent.state !== "SUBMITTING" ||
    result.authorizationHash !== intent.actionAuthorizationHash ||
    result.requestBodyHash !== intent.requestBodyHash ||
    result.signatureHash !== intent.signatureHash
  ) fail("hypercore_jit_result_denied", "exchange result binding drifted");
  return cloneFreeze({
    ...structuredClone(intent),
    state,
    version: 5,
    disposition: result.disposition,
    responseHash: result.responseHash,
    resolvedAt: resolved.toISOString()
  });
}

export function reconcileHypercoreStableExecutionIntent({
  intent,
  reconciliationHash,
  venueOrderStateHash,
  venueAccountStateHash,
  ledgerStateHash,
  obligationEvidenceHash,
  now
}) {
  verifyHypercoreStableExecutionIntent(intent);
  for (const [name, value] of Object.entries({
    reconciliationHash,
    venueOrderStateHash,
    venueAccountStateHash,
    ledgerStateHash,
    obligationEvidenceHash
  })) bytes32(name, value);
  if (![
    HypercoreStableIntentState.SUBMITTED,
    HypercoreStableIntentState.REJECTED,
    HypercoreStableIntentState.UNKNOWN
  ].includes(intent.state)) {
    fail("hypercore_stable_reconciliation_denied", "transport truth is not terminal");
  }
  return cloneFreeze({
    ...structuredClone(intent),
    state: HypercoreStableIntentState.RECONCILED,
    version: 6,
    reconciliationHash,
    venueOrderStateHash,
    venueAccountStateHash,
    ledgerStateHash,
    obligationEvidenceHash,
    reconciledAt: trustedDate("now", now).toISOString()
  });
}

export function closeHypercoreStableExecutionIntent({
  intent,
  signerRetirementHash,
  now
}) {
  verifyHypercoreStableExecutionIntent(intent);
  bytes32("signerRetirementHash", signerRetirementHash);
  if (intent.state !== HypercoreStableIntentState.RECONCILED) {
    fail("hypercore_stable_close_denied", "reconciled intent is required");
  }
  return cloneFreeze({
    ...structuredClone(intent),
    state: HypercoreStableIntentState.CLOSED,
    version: 7,
    signerRetirementHash,
    closedAt: trustedDate("now", now).toISOString()
  });
}

export function abortHypercoreStableExecutionSigning({ intent, reasonHash, now }) {
  verifyHypercoreStableExecutionIntent(intent);
  bytes32("reasonHash", reasonHash);
  const aborted = trustedDate("now", now);
  if (intent.state !== "SIGNING" || intent.externalSubmissionAttempted !== false) {
    fail("hypercore_jit_abort_denied", "only an unsubmitted signing claim may abort");
  }
  return cloneFreeze({
    ...structuredClone(intent),
    state: "ABORTED",
    version: intent.version + 1,
    disposition: null,
    responseHash: reasonHash,
    resolvedAt: aborted.toISOString()
  });
}

export function recoverHypercoreStableExecutionUnknown({ intent, reasonHash, now }) {
  verifyHypercoreStableExecutionIntent(intent);
  bytes32("reasonHash", reasonHash);
  const observed = trustedDate("now", now);
  if (intent.state !== "SUBMITTING" || intent.externalSubmissionAttempted !== true) {
    fail("hypercore_jit_unknown_recovery_denied", "only a claimed submission may become UNKNOWN");
  }
  return cloneFreeze({
    ...structuredClone(intent),
    state: "UNKNOWN",
    version: 5,
    disposition: "unknown",
    responseHash: reasonHash,
    resolvedAt: observed.toISOString()
  });
}
