import { DomainError, hashId } from "../../../packages/domain/src/index.js";

export const HYPERCORE_PREPARED_ACTION_SCHEMA_VERSION =
  "hypercore_prepared_action.v1";
export const HYPERCORE_SIGNING_REQUEST_SCHEMA_VERSION =
  "hypercore_signing_request.v1";

export const HypercoreSigningScheme = Object.freeze({
  L1_ACTION: "l1_action",
  USER_SIGNED_ACTION: "user_signed_action"
});

export const HypercoreExecutionActionKind = Object.freeze({
  ORDER: "order",
  REDUCE_ONLY_ORDER: "reduceOnlyOrder",
  CANCEL: "cancel",
  CANCEL_BY_CLOID: "cancelByCloid",
  MODIFY: "modify"
});

const ALLOWED_ACTIONS = new Set(Object.values(HypercoreExecutionActionKind));
const HASH = /^0x[0-9a-f]{64}$/;
const CLOID = /^0x[0-9a-f]{32}$/;
const DECIMAL =
  /^(?:0\.(?:0*[1-9][0-9]*|[0-9]*[1-9]0*)|[1-9][0-9]{0,30}(?:\.[0-9]{1,18})?)$/;
const TIME_IN_FORCE = new Set(["Alo", "Gtc", "Ioc"]);
const DENIED_ACTIONS = new Set([
  "withdraw3",
  "usdSend",
  "spotSend",
  "sendAsset",
  "usdClassTransfer",
  "vaultTransfer",
  "approveAgent",
  "approveBuilderFee",
  "updateLeverage",
  "updateIsolatedMargin",
  "setDisplayName",
  "agentEnable",
  "agentDisable"
]);
const MAXIMUM_ASSET_INDEX = 1_000_000;
const MAXIMUM_NONCE_AGE_MS = 2 * 24 * 60 * 60 * 1000;
const MAXIMUM_NONCE_FUTURE_MS = 24 * 60 * 60 * 1000;

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
    fail("invalid_hypercore_action", `${name} has an invalid closed shape`);
  }
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

function bytes32(name, value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hypercore_action", `${name} must be lowercase bytes32`);
  }
  return value;
}

function asset(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAXIMUM_ASSET_INDEX
  ) {
    fail("hypercore_action_denied", "asset index is outside the closed bound");
  }
  return value;
}

function orderId(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("hypercore_action_denied", "order ID is invalid");
  }
  return value;
}

function decimal(name, value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    fail("hypercore_action_denied", `${name} is not a canonical positive decimal`);
  }
  return value;
}

function cloid(value) {
  if (typeof value !== "string" || !CLOID.test(value)) {
    fail("hypercore_action_denied", "cloid must be lower-case bytes16");
  }
  return value;
}

function tif(value) {
  if (!TIME_IN_FORCE.has(value)) {
    fail("hypercore_action_denied", "time in force is unavailable");
  }
  return value;
}

function side(value) {
  if (value !== "buy" && value !== "sell") {
    fail("hypercore_action_denied", "order side is unavailable");
  }
  return value === "buy";
}

function compileOrder(input, { forceReduceOnly = null } = {}) {
  exactShape("HyperCore order", input, [
    "assetIndex",
    "side",
    "limitPx",
    "size",
    "reduceOnly",
    "timeInForce",
    "cloid"
  ]);
  if (typeof input.reduceOnly !== "boolean") {
    fail("hypercore_action_denied", "reduceOnly must be server-proven boolean");
  }
  if (forceReduceOnly !== null && input.reduceOnly !== forceReduceOnly) {
    fail(
      "hypercore_reduce_only_proof_mismatch",
      "reduceOnly does not match the action class"
    );
  }
  return {
    a: asset(input.assetIndex),
    b: side(input.side),
    p: decimal("limitPx", input.limitPx),
    s: decimal("size", input.size),
    r: input.reduceOnly,
    t: { limit: { tif: tif(input.timeInForce) } },
    c: cloid(input.cloid)
  };
}

function preparedActionCore(value) {
  return {
    actionKind: value.actionKind,
    signingScheme: value.signingScheme,
    hyperliquidAction: value.hyperliquidAction,
    sourceActionHash: value.sourceActionHash,
    policyDecisionHash: value.policyDecisionHash,
    riskSnapshotHash: value.riskSnapshotHash,
    accountBindingHash: value.accountBindingHash,
    delegateHash: value.delegateHash,
    environment: value.environment,
    canonicalFieldOrder: value.canonicalFieldOrder,
    rawActionAccepted: value.rawActionAccepted,
    withdrawalAllowed: value.withdrawalAllowed,
    transferAllowed: value.transferAllowed,
    leverageChangeAllowed: value.leverageChangeAllowed,
    accountModeChangeAllowed: value.accountModeChangeAllowed,
    externalSubmissionAllowed: value.externalSubmissionAllowed,
    mainnetAuthority: value.mainnetAuthority,
    productionAuthority: value.productionAuthority,
    fundsAuthority: value.fundsAuthority,
    schemaVersion: value.schemaVersion
  };
}

export function compileHypercoreExecutionAction(input) {
  exactShape("HyperCore action compilation input", input, [
    "actionKind",
    "action",
    "sourceActionHash",
    "policyDecisionHash",
    "riskSnapshotHash",
    "accountBindingHash",
    "delegateHash"
  ]);
  for (const key of [
    "sourceActionHash",
    "policyDecisionHash",
    "riskSnapshotHash",
    "accountBindingHash",
    "delegateHash"
  ]) bytes32(key, input[key]);
  if (
    DENIED_ACTIONS.has(input.actionKind) ||
    !ALLOWED_ACTIONS.has(input.actionKind)
  ) {
    fail(
      "hypercore_action_denied",
      "only order/cancel/modify and server-proven reduce-only are available"
    );
  }

  let action;
  switch (input.actionKind) {
    case HypercoreExecutionActionKind.ORDER:
      action = {
        type: "order",
        orders: [compileOrder(input.action, { forceReduceOnly: false })],
        grouping: "na"
      };
      break;
    case HypercoreExecutionActionKind.REDUCE_ONLY_ORDER:
      action = {
        type: "order",
        orders: [compileOrder(input.action, { forceReduceOnly: true })],
        grouping: "na"
      };
      break;
    case HypercoreExecutionActionKind.CANCEL:
      exactShape("HyperCore cancel", input.action, ["assetIndex", "orderId"]);
      action = {
        type: "cancel",
        cancels: [{ a: asset(input.action.assetIndex), o: orderId(input.action.orderId) }]
      };
      break;
    case HypercoreExecutionActionKind.CANCEL_BY_CLOID:
      exactShape("HyperCore cancel by cloid", input.action, ["assetIndex", "cloid"]);
      action = {
        type: "cancelByCloid",
        cancels: [{ asset: asset(input.action.assetIndex), cloid: cloid(input.action.cloid) }]
      };
      break;
    case HypercoreExecutionActionKind.MODIFY:
      exactShape("HyperCore modify", input.action, ["orderId", "replacement"]);
      action = {
        type: "batchModify",
        modifies: [
          {
            oid: orderId(input.action.orderId),
            order: compileOrder(input.action.replacement)
          }
        ]
      };
      break;
    default:
      fail("hypercore_action_denied", "action class is unavailable");
  }

  const value = {
    actionKind: input.actionKind,
    signingScheme: HypercoreSigningScheme.L1_ACTION,
    hyperliquidAction: action,
    sourceActionHash: input.sourceActionHash,
    policyDecisionHash: input.policyDecisionHash,
    riskSnapshotHash: input.riskSnapshotHash,
    accountBindingHash: input.accountBindingHash,
    delegateHash: input.delegateHash,
    environment: "hyperliquid_testnet",
    canonicalFieldOrder: true,
    rawActionAccepted: false,
    withdrawalAllowed: false,
    transferAllowed: false,
    leverageChangeAllowed: false,
    accountModeChangeAllowed: false,
    externalSubmissionAllowed: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: HYPERCORE_PREPARED_ACTION_SCHEMA_VERSION
  };
  return cloneFreeze({
    preparedActionHash: hashId("hypercore_prepared_action", value),
    ...value
  });
}

export function verifyHypercorePreparedAction(value) {
  exactShape("HyperCore prepared action", value, [
    "preparedActionHash",
    "actionKind",
    "signingScheme",
    "hyperliquidAction",
    "sourceActionHash",
    "policyDecisionHash",
    "riskSnapshotHash",
    "accountBindingHash",
    "delegateHash",
    "environment",
    "canonicalFieldOrder",
    "rawActionAccepted",
    "withdrawalAllowed",
    "transferAllowed",
    "leverageChangeAllowed",
    "accountModeChangeAllowed",
    "externalSubmissionAllowed",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "schemaVersion"
  ]);
  for (const key of [
    "preparedActionHash",
    "sourceActionHash",
    "policyDecisionHash",
    "riskSnapshotHash",
    "accountBindingHash",
    "delegateHash"
  ]) bytes32(key, value[key]);
  if (
    value.schemaVersion !== HYPERCORE_PREPARED_ACTION_SCHEMA_VERSION ||
    !ALLOWED_ACTIONS.has(value.actionKind) ||
    value.signingScheme !== HypercoreSigningScheme.L1_ACTION ||
    value.environment !== "hyperliquid_testnet" ||
    value.canonicalFieldOrder !== true ||
    value.rawActionAccepted !== false ||
    value.withdrawalAllowed !== false ||
    value.transferAllowed !== false ||
    value.leverageChangeAllowed !== false ||
    value.accountModeChangeAllowed !== false ||
    value.externalSubmissionAllowed !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    hashId("hypercore_prepared_action", preparedActionCore(value)) !==
      value.preparedActionHash
  ) {
    fail("invalid_hypercore_action", "prepared action is inconsistent");
  }
  return true;
}

function signingRequestCore(value) {
  return {
    scheme: value.scheme,
    purpose: value.purpose,
    actionHash: value.actionHash,
    signerReferenceHash: value.signerReferenceHash,
    canonicalAccountAddressHash: value.canonicalAccountAddressHash,
    vaultAddressHash: value.vaultAddressHash,
    nonce: value.nonce,
    expiresAfter: value.expiresAfter,
    environment: value.environment,
    digestDomain: value.digestDomain,
    referenceImplementation: value.referenceImplementation,
    referenceReviewStatus: value.referenceReviewStatus,
    officialDigestComputed: value.officialDigestComputed,
    signingAllowed: value.signingAllowed,
    externalSubmissionAllowed: value.externalSubmissionAllowed,
    rawKeyAccepted: value.rawKeyAccepted,
    rawSignaturePersisted: value.rawSignaturePersisted,
    reusableSignaturePersisted: value.reusableSignaturePersisted,
    mainnetAuthority: value.mainnetAuthority,
    productionAuthority: value.productionAuthority,
    fundsAuthority: value.fundsAuthority,
    schemaVersion: value.schemaVersion
  };
}

export function createHypercoreSigningRequest(input) {
  exactShape("HyperCore signing request input", input, [
    "scheme",
    "purpose",
    "actionHash",
    "signerReferenceHash",
    "canonicalAccountAddressHash",
    "vaultAddressHash",
    "nonce",
    "expiresAfter",
    "now"
  ]);
  if (!Object.values(HypercoreSigningScheme).includes(input.scheme)) {
    fail("hypercore_signing_scheme_denied", "signing scheme is unavailable");
  }
  if (
    (input.scheme === HypercoreSigningScheme.L1_ACTION &&
      input.purpose !== "venue_execution") ||
    (input.scheme === HypercoreSigningScheme.USER_SIGNED_ACTION &&
      input.purpose !== "delegate_lifecycle_projection")
  ) {
    fail(
      "hypercore_signing_scheme_mismatch",
      "signing scheme cannot be interchanged across purposes"
    );
  }
  for (const key of [
    "actionHash",
    "signerReferenceHash",
    "canonicalAccountAddressHash"
  ]) bytes32(key, input[key]);
  bytes32("vaultAddressHash", input.vaultAddressHash, { nullable: true });
  if (
    !Number.isSafeInteger(input.nonce) ||
    input.nonce < 1 ||
    !Number.isSafeInteger(input.expiresAfter) ||
    input.expiresAfter < 1
  ) {
    fail("hypercore_nonce_denied", "nonce or expiry is invalid");
  }
  const now = input.now instanceof Date ? input.now.getTime() : Number.NaN;
  if (
    !Number.isSafeInteger(now) ||
    input.nonce < now - MAXIMUM_NONCE_AGE_MS ||
    input.nonce > now + MAXIMUM_NONCE_FUTURE_MS ||
    input.expiresAfter <= now
  ) {
    fail("hypercore_nonce_out_of_window", "nonce or expiry is outside the fixed window");
  }
  const value = {
    scheme: input.scheme,
    purpose: input.purpose,
    actionHash: input.actionHash,
    signerReferenceHash: input.signerReferenceHash,
    canonicalAccountAddressHash: input.canonicalAccountAddressHash,
    vaultAddressHash: input.vaultAddressHash,
    nonce: input.nonce,
    expiresAfter: input.expiresAfter,
    environment: "hyperliquid_testnet",
    digestDomain:
      input.scheme === HypercoreSigningScheme.L1_ACTION
        ? "hyperliquid_l1_action_phantom_agent"
        : "hyperliquid_user_signed_action_eip712",
    referenceImplementation: "hyperliquid_official_sdk_or_reviewed_reference_required",
    referenceReviewStatus: "contract_reviewed_live_implementation_not_composed",
    officialDigestComputed: false,
    signingAllowed: false,
    externalSubmissionAllowed: false,
    rawKeyAccepted: false,
    rawSignaturePersisted: false,
    reusableSignaturePersisted: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: HYPERCORE_SIGNING_REQUEST_SCHEMA_VERSION
  };
  return cloneFreeze({
    signingRequestHash: hashId("hypercore_signing_request", value),
    ...value
  });
}

export function verifyHypercoreSigningRequest(value) {
  exactShape("HyperCore signing request", value, [
    "signingRequestHash",
    "scheme",
    "purpose",
    "actionHash",
    "signerReferenceHash",
    "canonicalAccountAddressHash",
    "vaultAddressHash",
    "nonce",
    "expiresAfter",
    "environment",
    "digestDomain",
    "referenceImplementation",
    "referenceReviewStatus",
    "officialDigestComputed",
    "signingAllowed",
    "externalSubmissionAllowed",
    "rawKeyAccepted",
    "rawSignaturePersisted",
    "reusableSignaturePersisted",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "schemaVersion"
  ]);
  for (const key of [
    "signingRequestHash",
    "actionHash",
    "signerReferenceHash",
    "canonicalAccountAddressHash"
  ]) bytes32(key, value[key]);
  bytes32("vaultAddressHash", value.vaultAddressHash, { nullable: true });
  const expectedDomain =
    value.scheme === HypercoreSigningScheme.L1_ACTION
      ? "hyperliquid_l1_action_phantom_agent"
      : value.scheme === HypercoreSigningScheme.USER_SIGNED_ACTION
        ? "hyperliquid_user_signed_action_eip712"
        : null;
  if (
    value.schemaVersion !== HYPERCORE_SIGNING_REQUEST_SCHEMA_VERSION ||
    expectedDomain === null ||
    value.digestDomain !== expectedDomain ||
    (value.scheme === HypercoreSigningScheme.L1_ACTION &&
      value.purpose !== "venue_execution") ||
    (value.scheme === HypercoreSigningScheme.USER_SIGNED_ACTION &&
      value.purpose !== "delegate_lifecycle_projection") ||
    !Number.isSafeInteger(value.nonce) ||
    value.nonce < 1 ||
    !Number.isSafeInteger(value.expiresAfter) ||
    value.expiresAfter < 1 ||
    value.environment !== "hyperliquid_testnet" ||
    value.referenceImplementation !==
      "hyperliquid_official_sdk_or_reviewed_reference_required" ||
    value.referenceReviewStatus !==
      "contract_reviewed_live_implementation_not_composed" ||
    value.officialDigestComputed !== false ||
    value.signingAllowed !== false ||
    value.externalSubmissionAllowed !== false ||
    value.rawKeyAccepted !== false ||
    value.rawSignaturePersisted !== false ||
    value.reusableSignaturePersisted !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    hashId("hypercore_signing_request", signingRequestCore(value)) !==
      value.signingRequestHash
  ) {
    fail("invalid_hypercore_signing_request", "signing request is inconsistent");
  }
  return true;
}

export function describeHypercoreSigningBoundary() {
  return Object.freeze({
    supportedSchemes: [
      HypercoreSigningScheme.L1_ACTION,
      HypercoreSigningScheme.USER_SIGNED_ACTION
    ],
    officialLiveImplementationComposed: false,
    signingEnabled: false,
    approveAgentEnabled: false,
    externalSubmissionEnabled: false,
    rawKeyAccepted: false,
    rawSignaturePersisted: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
