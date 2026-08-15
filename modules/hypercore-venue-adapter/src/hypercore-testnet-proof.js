import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  HypercoreExecutionActionKind,
  verifyHypercorePreparedAction
} from "./hypercore-action.js";
import {
  HYPERCORE_OFFICIAL_SIGNING_REQUEST_SCHEMA_VERSION,
  HYPERCORE_TRANSIENT_SIGNATURE_SCHEMA_VERSION,
  verifyHypercoreOfficialSigningRequest
} from "./hypercore-official-signing.js";

export const HYPERCORE_TESTNET_PROOF_POLICY_SCHEMA_VERSION =
  "hypercore_testnet_proof_policy.v1";
export const HYPERCORE_TESTNET_ACTION_AUTHORIZATION_SCHEMA_VERSION =
  "hypercore_testnet_action_authorization.v1";
export const HYPERCORE_TESTNET_EXCHANGE_RESULT_SCHEMA_VERSION =
  "hypercore_testnet_exchange_result.v1";

export const HYPERCORE_TESTNET_PROOF_PROFILE = Object.freeze({
  environment: "hyperliquid_testnet",
  origin: "https://api.hyperliquid-testnet.xyz",
  path: "/exchange",
  endpoint: "https://api.hyperliquid-testnet.xyz/exchange",
  method: "POST",
  market: "BTC",
  assetIndex: 3,
  sizeDecimals: 5,
  maximumPriceDecimalPlaces: 1,
  maxOrderNotionalUsd: "10",
  maxAggregateProofExposureUsd: "10",
  maxOpenOrders: 1,
  maxSubmissions: 3,
  requestExpiryMs: 30_000,
  proofWindowMs: 15 * 60 * 1000,
  maxMetadataAgeMs: 5 * 60 * 1000,
  maxRiskAgeMs: 10_000,
  expectedFillNotionalUsd: "0",
  openingTimeInForce: "Alo",
  allowedActionKinds: Object.freeze([
    HypercoreExecutionActionKind.ORDER,
    HypercoreExecutionActionKind.REDUCE_ONLY_ORDER,
    HypercoreExecutionActionKind.CANCEL,
    HypercoreExecutionActionKind.CANCEL_BY_CLOID,
    HypercoreExecutionActionKind.MODIFY,
    HypercoreExecutionActionKind.SCHEDULE_CANCEL
  ]),
  mainnetAuthority: false,
  productionAuthority: false,
  realFundsAuthority: false,
  schemaVersion: "hypercore_testnet_proof_profile.v1"
});

const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const DECIMAL = /^(?:0|0\.[0-9]{1,18}|[1-9][0-9]{0,30}(?:\.[0-9]{1,18})?)$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const TERMINAL_RESPONSE_DISPOSITIONS = new Set([
  "confirmed",
  "rejected",
  "unknown"
]);
const EXPLICITLY_DENIED_ACTIONS = new Set([
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
  "noop"
]);

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactShape(name, value, required, optional = []) {
  if (!plainObject(value)) {
    fail("invalid_hypercore_testnet_proof_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.has(key))
  ) {
    fail(
      "invalid_hypercore_testnet_proof_input",
      `${name} has an invalid closed shape`
    );
  }
}

function bytes32(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hypercore_testnet_proof_input", `${name} must be bytes32`);
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hypercore_testnet_proof_input", `${name} is invalid`);
  }
  return value;
}

function integer(name, value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail("invalid_hypercore_testnet_proof_input", `${name} is outside its bound`);
  }
  return value;
}

function decimal(name, value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    fail("invalid_hypercore_testnet_proof_input", `${name} is not canonical`);
  }
  return value;
}

function timestamp(name, value) {
  if (typeof value !== "string") {
    fail("invalid_hypercore_testnet_proof_input", `${name} must be an ISO time`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("invalid_hypercore_testnet_proof_input", `${name} must be canonical`);
  }
  return parsed;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_hypercore_testnet_proof_input", `${name} must be trusted`);
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

function multiplyDecimals(left, right) {
  return decimal18(left) * decimal18(right);
}

function assertAtMost(name, value, maximum) {
  if (decimal18(value) > decimal18(maximum)) {
    fail("hypercore_testnet_risk_limit_denied", `${name} exceeds the proof cap`);
  }
}

function policyCore(value) {
  const { policyHash: _ignored, ...core } = value;
  return core;
}

export function createHypercoreTestnetProofPolicy(input) {
  exactShape("proof policy input", input, [
    "policyId",
    "accountBindingHash",
    "delegateHash",
    "signerReferenceHash",
    "metadataHash",
    "assetIndex",
    "sizeDecimals",
    "priceDecimals",
    "metadataObservedAt",
    "executionOwnerActorId",
    "riskOwnerActorId",
    "incidentOwnerActorId",
    "approvedAt",
    "expiresAt"
  ]);
  for (const key of [
    "accountBindingHash",
    "delegateHash",
    "signerReferenceHash",
    "metadataHash"
  ]) bytes32(key, input[key]);
  for (const key of [
    "policyId",
    "executionOwnerActorId",
    "riskOwnerActorId",
    "incidentOwnerActorId"
  ]) identifier(key, input[key]);
  if (input.executionOwnerActorId === input.riskOwnerActorId) {
    fail(
      "hypercore_testnet_owner_separation_denied",
      "execution and Risk Guardian owners must be separated"
    );
  }
  integer("assetIndex", input.assetIndex, { maximum: 1_000_000 });
  integer("sizeDecimals", input.sizeDecimals, { maximum: 8 });
  integer("priceDecimals", input.priceDecimals, { maximum: 8 });
  if (
    input.assetIndex !== HYPERCORE_TESTNET_PROOF_PROFILE.assetIndex ||
    input.sizeDecimals !== HYPERCORE_TESTNET_PROOF_PROFILE.sizeDecimals ||
    input.priceDecimals !==
      HYPERCORE_TESTNET_PROOF_PROFILE.maximumPriceDecimalPlaces
  ) {
    fail(
      "hypercore_testnet_market_metadata_denied",
      "BTC asset index or decimal rules do not match the reviewed metadata"
    );
  }
  const metadataObservedAt = timestamp(
    "metadataObservedAt",
    input.metadataObservedAt
  );
  const approvedAt = timestamp("approvedAt", input.approvedAt);
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (
    metadataObservedAt > approvedAt ||
    expiresAt <= approvedAt ||
    expiresAt.getTime() - approvedAt.getTime() > 24 * 60 * 60 * 1000
  ) {
    fail(
      "invalid_hypercore_testnet_proof_policy",
      "policy timing is inconsistent or exceeds one day"
    );
  }
  const value = {
    policyId: input.policyId,
    environment: HYPERCORE_TESTNET_PROOF_PROFILE.environment,
    origin: HYPERCORE_TESTNET_PROOF_PROFILE.origin,
    path: HYPERCORE_TESTNET_PROOF_PROFILE.path,
    method: HYPERCORE_TESTNET_PROOF_PROFILE.method,
    accountBindingHash: input.accountBindingHash,
    delegateHash: input.delegateHash,
    signerReferenceHash: input.signerReferenceHash,
    metadataHash: input.metadataHash,
    market: HYPERCORE_TESTNET_PROOF_PROFILE.market,
    productClass: "perpetual",
    assetIndex: input.assetIndex,
    sizeDecimals: input.sizeDecimals,
    priceDecimals: input.priceDecimals,
    metadataObservedAt: input.metadataObservedAt,
    allowedActionKinds: [...HYPERCORE_TESTNET_PROOF_PROFILE.allowedActionKinds],
    openingTimeInForce: HYPERCORE_TESTNET_PROOF_PROFILE.openingTimeInForce,
    maxOrderNotionalUsd: HYPERCORE_TESTNET_PROOF_PROFILE.maxOrderNotionalUsd,
    maxAggregateProofExposureUsd:
      HYPERCORE_TESTNET_PROOF_PROFILE.maxAggregateProofExposureUsd,
    maxOpenOrders: HYPERCORE_TESTNET_PROOF_PROFILE.maxOpenOrders,
    maxSubmissions: HYPERCORE_TESTNET_PROOF_PROFILE.maxSubmissions,
    requestExpiryMs: HYPERCORE_TESTNET_PROOF_PROFILE.requestExpiryMs,
    proofWindowMs: HYPERCORE_TESTNET_PROOF_PROFILE.proofWindowMs,
    expectedFillNotionalUsd:
      HYPERCORE_TESTNET_PROOF_PROFILE.expectedFillNotionalUsd,
    executionOwnerActorId: input.executionOwnerActorId,
    riskOwnerActorId: input.riskOwnerActorId,
    incidentOwnerActorId: input.incidentOwnerActorId,
    approvedAt: input.approvedAt,
    expiresAt: input.expiresAt,
    withdrawalAuthority: false,
    transferAuthority: false,
    leverageChangeAuthority: false,
    accountAdministrationAuthority: false,
    builderFeeAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_TESTNET_PROOF_POLICY_SCHEMA_VERSION
  };
  return cloneFreeze({
    policyHash: hashId("hypercore_testnet_proof_policy", value),
    ...value
  });
}

export function verifyHypercoreTestnetProofPolicy(value) {
  exactShape("proof policy", value, [
    "policyHash",
    "policyId",
    "environment",
    "origin",
    "path",
    "method",
    "accountBindingHash",
    "delegateHash",
    "signerReferenceHash",
    "metadataHash",
    "market",
    "productClass",
    "assetIndex",
    "sizeDecimals",
    "priceDecimals",
    "metadataObservedAt",
    "allowedActionKinds",
    "openingTimeInForce",
    "maxOrderNotionalUsd",
    "maxAggregateProofExposureUsd",
    "maxOpenOrders",
    "maxSubmissions",
    "requestExpiryMs",
    "proofWindowMs",
    "expectedFillNotionalUsd",
    "executionOwnerActorId",
    "riskOwnerActorId",
    "incidentOwnerActorId",
    "approvedAt",
    "expiresAt",
    "withdrawalAuthority",
    "transferAuthority",
    "leverageChangeAuthority",
    "accountAdministrationAuthority",
    "builderFeeAuthority",
    "mainnetAuthority",
    "productionAuthority",
    "realFundsAuthority",
    "schemaVersion"
  ]);
  bytes32("policyHash", value.policyHash);
  if (
    value.environment !== HYPERCORE_TESTNET_PROOF_PROFILE.environment ||
    value.origin !== HYPERCORE_TESTNET_PROOF_PROFILE.origin ||
    value.path !== HYPERCORE_TESTNET_PROOF_PROFILE.path ||
    value.method !== HYPERCORE_TESTNET_PROOF_PROFILE.method ||
    value.market !== HYPERCORE_TESTNET_PROOF_PROFILE.market ||
    value.productClass !== "perpetual" ||
    value.assetIndex !== 3 ||
    value.sizeDecimals !== 5 ||
    value.priceDecimals !== 1 ||
    value.openingTimeInForce !== "Alo" ||
    value.maxOrderNotionalUsd !== "10" ||
    value.maxAggregateProofExposureUsd !== "10" ||
    value.maxOpenOrders !== 1 ||
    value.maxSubmissions !== 3 ||
    value.requestExpiryMs !== 30_000 ||
    value.proofWindowMs !== 15 * 60 * 1000 ||
    value.expectedFillNotionalUsd !== "0" ||
    value.withdrawalAuthority !== false ||
    value.transferAuthority !== false ||
    value.leverageChangeAuthority !== false ||
    value.accountAdministrationAuthority !== false ||
    value.builderFeeAuthority !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_TESTNET_PROOF_POLICY_SCHEMA_VERSION ||
    hashId("hypercore_testnet_proof_policy", policyCore(value)) !== value.policyHash
  ) {
    fail("invalid_hypercore_testnet_proof_policy", "proof policy drifted");
  }
  return true;
}

function assertFresh(now, value, maximumAgeMs, code) {
  const observedAt = timestamp("observedAt", value);
  const age = now.getTime() - observedAt.getTime();
  if (age < 0 || age > maximumAgeMs) {
    fail(code, "required Testnet state is stale or from the future");
  }
}

function assertRiskSnapshotHash(value) {
  const { riskSnapshotHash, ...core } = value;
  if (hashId("hypercore_testnet_risk_snapshot", core) !== riskSnapshotHash) {
    fail("invalid_hypercore_testnet_risk_snapshot", "risk snapshot hash drifted");
  }
}

function assertHumanConfirmationHash(value) {
  const { confirmationHash, ...core } = value;
  if (
    hashId("hypercore_testnet_human_confirmation", core) !==
    confirmationHash
  ) {
    fail(
      "invalid_hypercore_testnet_human_confirmation",
      "human confirmation hash drifted"
    );
  }
}

export function verifyHypercoreTestnetActionAuthorization(value) {
  const { authorizationHash, ...core } = value;
  if (
    hashId("hypercore_testnet_action_authorization", core) !==
    authorizationHash
  ) {
    fail(
      "invalid_hypercore_testnet_action_authorization",
      "action authorization hash drifted"
    );
  }
}

function orderNotional(action) {
  if (!plainObject(action) || !Array.isArray(action.orders) || action.orders.length !== 1) {
    fail("hypercore_testnet_action_denied", "exactly one order is required");
  }
  const order = action.orders[0];
  decimal("order price", order.p);
  decimal("order size", order.s);
  return multiplyDecimals(order.p, order.s);
}

function replacementNotional(action) {
  if (
    !plainObject(action) ||
    !Array.isArray(action.modifies) ||
    action.modifies.length !== 1
  ) {
    fail("hypercore_testnet_action_denied", "exactly one modify is required");
  }
  const order = action.modifies[0].order;
  decimal("replacement price", order.p);
  decimal("replacement size", order.s);
  return multiplyDecimals(order.p, order.s);
}

function assertProofNotional(value) {
  if (value !== 10n * 10n ** 36n) {
    fail(
      "hypercore_testnet_risk_limit_denied",
      "proof order notional must equal the 10 Testnet USDC minimum and cap"
    );
  }
}

function assertActionPolicy(
  preparedAction,
  policy,
  riskSnapshot,
  proofState,
  trustedNow
) {
  if (EXPLICITLY_DENIED_ACTIONS.has(preparedAction.hyperliquidAction.type)) {
    fail("hypercore_testnet_action_denied", "action is explicitly denied");
  }
  if (
    !policy.allowedActionKinds.includes(preparedAction.actionKind) ||
    !HYPERCORE_TESTNET_PROOF_PROFILE.allowedActionKinds.includes(
      preparedAction.actionKind
    )
  ) {
    fail("hypercore_testnet_action_denied", "action kind is unavailable");
  }
  const action = preparedAction.hyperliquidAction;
  switch (preparedAction.actionKind) {
    case HypercoreExecutionActionKind.ORDER: {
      const order = action.orders?.[0];
      if (
        order?.a !== policy.assetIndex ||
        order?.r !== false ||
        order?.t?.limit?.tif !== "Alo" ||
        proofState.openOrderCount !== 0 ||
        riskSnapshot.openOrdersCount !== 0
      ) {
        fail(
          "hypercore_testnet_opening_order_denied",
          "opening proof order must be the one approved ALO order"
        );
      }
      assertProofNotional(orderNotional(action));
      break;
    }
    case HypercoreExecutionActionKind.REDUCE_ONLY_ORDER: {
      const order = action.orders?.[0];
      if (
        order?.a !== policy.assetIndex ||
        order?.r !== true ||
        decimal18(riskSnapshot.positionNotionalUsd) === 0n
      ) {
        fail(
          "hypercore_testnet_reduce_only_denied",
          "reduce-only proof requires a fresh non-zero restrictive position"
        );
      }
      assertProofNotional(orderNotional(action));
      break;
    }
    case HypercoreExecutionActionKind.MODIFY: {
      const order = action.modifies?.[0]?.order;
      if (
        order?.a !== policy.assetIndex ||
        order?.r !== false ||
        order?.t?.limit?.tif !== "Alo" ||
        proofState.openOrderCount !== 1 ||
        riskSnapshot.openOrdersCount !== 1
      ) {
        fail(
          "hypercore_testnet_modify_denied",
          "modify must preserve the exact one-order ALO envelope"
        );
      }
      assertProofNotional(replacementNotional(action));
      break;
    }
    case HypercoreExecutionActionKind.CANCEL:
      if (action.cancels?.[0]?.a !== policy.assetIndex) {
        fail("hypercore_testnet_cancel_denied", "cancel market drifted");
      }
      break;
    case HypercoreExecutionActionKind.CANCEL_BY_CLOID:
      if (action.cancels?.[0]?.asset !== policy.assetIndex) {
        fail("hypercore_testnet_cancel_denied", "cancel market drifted");
      }
      break;
    case HypercoreExecutionActionKind.SCHEDULE_CANCEL:
      if (
        action.type !== "scheduleCancel" ||
        !Number.isSafeInteger(action.time) ||
        action.time < trustedNow.getTime() + 5_000 ||
        action.time > trustedNow.getTime() + policy.proofWindowMs
      ) {
        fail(
          "hypercore_testnet_schedule_cancel_denied",
          "scheduled cancel must remain inside the approved proof window"
        );
      }
      break;
    default:
      fail("hypercore_testnet_action_denied", "action is unavailable");
  }
}

export function authorizeHypercoreTestnetAction({
  policy,
  preparedAction,
  riskSnapshot,
  proofState,
  humanConfirmation,
  now
}) {
  verifyHypercoreTestnetProofPolicy(policy);
  verifyHypercorePreparedAction(preparedAction);
  const trustedNow = trustedDate("now", now);
  exactShape("riskSnapshot", riskSnapshot, [
    "riskSnapshotHash",
    "accountBindingHash",
    "metadataHash",
    "metadataObservedAt",
    "observedAt",
    "status",
    "openOrdersCount",
    "aggregateExposureUsd",
    "positionNotionalUsd",
    "unknownOutcomeCount",
    "reconciliationStatus",
    "paused"
  ]);
  exactShape("proofState", proofState, [
    "proofId",
    "startedAt",
    "submissionCount",
    "openOrderCount",
    "aggregateExposureUsd"
  ]);
  exactShape("humanConfirmation", humanConfirmation, [
    "confirmationHash",
    "actorId",
    "preparedActionHash",
    "policyHash",
    "accountBindingHash",
    "delegateHash",
    "approvedAt",
    "expiresAt",
    "oneUse",
    "consumed"
  ]);
  for (const key of ["riskSnapshotHash", "accountBindingHash", "metadataHash"]) {
    bytes32(key, riskSnapshot[key]);
  }
  for (const key of ["confirmationHash", "preparedActionHash", "policyHash", "accountBindingHash", "delegateHash"]) {
    bytes32(key, humanConfirmation[key]);
  }
  assertRiskSnapshotHash(riskSnapshot);
  assertHumanConfirmationHash(humanConfirmation);
  identifier("proofId", proofState.proofId);
  identifier("actorId", humanConfirmation.actorId);
  assertFresh(
    trustedNow,
    riskSnapshot.observedAt,
    HYPERCORE_TESTNET_PROOF_PROFILE.maxRiskAgeMs,
    "hypercore_testnet_risk_stale"
  );
  assertFresh(
    trustedNow,
    riskSnapshot.metadataObservedAt,
    HYPERCORE_TESTNET_PROOF_PROFILE.maxMetadataAgeMs,
    "hypercore_testnet_metadata_stale"
  );
  const policyExpiresAt = timestamp("policy.expiresAt", policy.expiresAt);
  const proofStartedAt = timestamp("proofState.startedAt", proofState.startedAt);
  const confirmationExpiresAt = timestamp(
    "humanConfirmation.expiresAt",
    humanConfirmation.expiresAt
  );
  timestamp("humanConfirmation.approvedAt", humanConfirmation.approvedAt);
  if (
    trustedNow >= policyExpiresAt ||
    trustedNow.getTime() - proofStartedAt.getTime() < 0 ||
    trustedNow.getTime() - proofStartedAt.getTime() > policy.proofWindowMs ||
    trustedNow >= confirmationExpiresAt
  ) {
    fail("hypercore_testnet_authority_stale", "proof authority expired");
  }
  integer("submissionCount", proofState.submissionCount, {
    maximum: policy.maxSubmissions
  });
  integer("openOrderCount", proofState.openOrderCount, {
    maximum: policy.maxOpenOrders
  });
  integer("openOrdersCount", riskSnapshot.openOrdersCount, {
    maximum: policy.maxOpenOrders
  });
  integer("unknownOutcomeCount", riskSnapshot.unknownOutcomeCount, {
    maximum: Number.MAX_SAFE_INTEGER
  });
  decimal("risk aggregateExposureUsd", riskSnapshot.aggregateExposureUsd);
  decimal("risk positionNotionalUsd", riskSnapshot.positionNotionalUsd);
  decimal("proof aggregateExposureUsd", proofState.aggregateExposureUsd);
  assertAtMost(
    "risk aggregate exposure",
    riskSnapshot.aggregateExposureUsd,
    policy.maxAggregateProofExposureUsd
  );
  assertAtMost(
    "proof aggregate exposure",
    proofState.aggregateExposureUsd,
    policy.maxAggregateProofExposureUsd
  );
  if (
    preparedAction.environment !== policy.environment ||
    preparedAction.accountBindingHash !== policy.accountBindingHash ||
    preparedAction.delegateHash !== policy.delegateHash ||
    preparedAction.riskSnapshotHash !== riskSnapshot.riskSnapshotHash ||
    riskSnapshot.accountBindingHash !== policy.accountBindingHash ||
    riskSnapshot.metadataHash !== policy.metadataHash ||
    riskSnapshot.status !== "FRESH" ||
    riskSnapshot.reconciliationStatus !== "RECONCILED" ||
    riskSnapshot.paused !== false ||
    riskSnapshot.unknownOutcomeCount !== 0 ||
    proofState.submissionCount >= policy.maxSubmissions ||
    humanConfirmation.preparedActionHash !== preparedAction.preparedActionHash ||
    humanConfirmation.policyHash !== policy.policyHash ||
    humanConfirmation.accountBindingHash !== policy.accountBindingHash ||
    humanConfirmation.delegateHash !== policy.delegateHash ||
    humanConfirmation.oneUse !== true ||
    humanConfirmation.consumed !== false
  ) {
    fail(
      "hypercore_testnet_preflight_denied",
      "account, policy, risk, proof or confirmation binding is unavailable"
    );
  }
  assertActionPolicy(
    preparedAction,
    policy,
    riskSnapshot,
    proofState,
    trustedNow
  );
  const effectiveUntil = new Date(Math.min(
    trustedNow.getTime() + policy.requestExpiryMs,
    policyExpiresAt.getTime(),
    confirmationExpiresAt.getTime()
  )).toISOString();
  const core = {
    decision: "ALLOW",
    policyId: policy.policyId,
    policyHash: policy.policyHash,
    preparedActionHash: preparedAction.preparedActionHash,
    riskSnapshotHash: riskSnapshot.riskSnapshotHash,
    humanConfirmationHash: humanConfirmation.confirmationHash,
    proofId: proofState.proofId,
    actionKind: preparedAction.actionKind,
    accountBindingHash: policy.accountBindingHash,
    delegateHash: policy.delegateHash,
    signerReferenceHash: policy.signerReferenceHash,
    submissionOrdinal: proofState.submissionCount + 1,
    effectiveUntil,
    singleUse: true,
    externalTestnetSubmissionAllowed: true,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_TESTNET_ACTION_AUTHORIZATION_SCHEMA_VERSION
  };
  return cloneFreeze({
    authorizationHash: hashId("hypercore_testnet_action_authorization", core),
    ...core
  });
}

function signature(value) {
  exactShape("signature", value, ["r", "s", "v"]);
  if (
    !/^0x[0-9a-f]{64}$/.test(value.r) ||
    !/^0x[0-9a-f]{64}$/.test(value.s) ||
    ![27, 28].includes(value.v)
  ) {
    fail("invalid_hypercore_testnet_signature", "signature is invalid");
  }
  return value;
}

export function createHypercoreTestnetExchangeEnvelope({
  authorization,
  signingRequest,
  signed,
  vaultAddress = null,
  now
}) {
  const trustedNow = trustedDate("now", now);
  verifyHypercoreOfficialSigningRequest(signingRequest);
  exactShape("authorization", authorization, [
    "authorizationHash",
    "decision",
    "policyId",
    "policyHash",
    "preparedActionHash",
    "riskSnapshotHash",
    "humanConfirmationHash",
    "proofId",
    "actionKind",
    "accountBindingHash",
    "delegateHash",
    "signerReferenceHash",
    "submissionOrdinal",
    "effectiveUntil",
    "singleUse",
    "externalTestnetSubmissionAllowed",
    "mainnetAuthority",
    "productionAuthority",
    "realFundsAuthority",
    "schemaVersion"
  ]);
  exactShape("signed result", signed, [
    "signingRequestHash",
    "digestHash",
    "signature",
    "signatureHash",
    "recoveredSignerAddressHash",
    "rawKeyAccepted",
    "rawKeyPersisted",
    "rawSignaturePersisted",
    "reusable",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "schemaVersion"
  ]);
  verifyHypercoreTestnetActionAuthorization(authorization);
  signature(signed.signature);
  if (vaultAddress !== null && !ADDRESS.test(vaultAddress)) {
    fail("invalid_hypercore_testnet_exchange_envelope", "vault address is invalid");
  }
  const effectiveUntil = timestamp(
    "authorization.effectiveUntil",
    authorization.effectiveUntil
  );
  if (
    trustedNow >= effectiveUntil ||
    authorization.decision !== "ALLOW" ||
    authorization.singleUse !== true ||
    authorization.externalTestnetSubmissionAllowed !== true ||
    authorization.signerReferenceHash !== signingRequest.signerReferenceHash ||
    authorization.preparedActionHash !== signingRequest.preparedActionHash ||
    signingRequest.signingRequestHash !== signed.signingRequestHash ||
    signingRequest.digestHash !== signed.digestHash ||
    signingRequest.scheme !== "l1_action" ||
    signingRequest.vaultAddressPresent !== (vaultAddress !== null) ||
    signingRequest.vaultAddressHash !== (vaultAddress === null
      ? null
      : hashId("hypercore_account_address", vaultAddress)) ||
    signed.rawKeyAccepted !== false ||
    signed.rawKeyPersisted !== false ||
    signed.rawSignaturePersisted !== false ||
    signed.reusable !== false ||
    signed.schemaVersion !== HYPERCORE_TRANSIENT_SIGNATURE_SCHEMA_VERSION ||
    signingRequest.schemaVersion !== HYPERCORE_OFFICIAL_SIGNING_REQUEST_SCHEMA_VERSION ||
    authorization.mainnetAuthority !== false ||
    authorization.productionAuthority !== false ||
    authorization.realFundsAuthority !== false
  ) {
    fail(
      "invalid_hypercore_testnet_exchange_envelope",
      "authorization, signing request or signature binding drifted"
    );
  }
  const body = {
    action: signingRequest.action,
    nonce: signingRequest.nonce,
    signature: signed.signature,
    vaultAddress,
    expiresAfter: signingRequest.expiresAfter
  };
  return cloneFreeze({
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
}

export function verifyHypercoreTestnetExchangeEnvelope(envelope) {
  exactShape("exchange envelope", envelope, [
    "authorizationHash",
    "signingRequestHash",
    "signatureHash",
    "body",
    "requestBodyHash",
    "endpoint",
    "method",
    "redirect",
    "retryAllowed",
    "rawResponsePersisted",
    "mainnetAuthority",
    "productionAuthority",
    "realFundsAuthority",
    "schemaVersion"
  ]);
  for (const key of [
    "authorizationHash",
    "signingRequestHash",
    "signatureHash",
    "requestBodyHash"
  ]) bytes32(key, envelope[key]);
  exactShape("exchange body", envelope.body, [
    "action",
    "nonce",
    "signature",
    "vaultAddress",
    "expiresAfter"
  ]);
  signature(envelope.body.signature);
  integer("body.nonce", envelope.body.nonce, { minimum: 1 });
  integer("body.expiresAfter", envelope.body.expiresAfter, { minimum: 1 });
  if (
    !plainObject(envelope.body.action) ||
    !["order", "cancel", "cancelByCloid", "batchModify", "scheduleCancel"].includes(
      envelope.body.action.type
    ) ||
    (envelope.body.vaultAddress !== null &&
      !ADDRESS.test(envelope.body.vaultAddress)) ||
    envelope.requestBodyHash !==
      hashId("hypercore_testnet_exchange_body", envelope.body) ||
    envelope.endpoint !== HYPERCORE_TESTNET_PROOF_PROFILE.endpoint ||
    envelope.method !== "POST" ||
    envelope.redirect !== "error" ||
    envelope.retryAllowed !== false ||
    envelope.rawResponsePersisted !== false ||
    envelope.mainnetAuthority !== false ||
    envelope.productionAuthority !== false ||
    envelope.realFundsAuthority !== false ||
    envelope.schemaVersion !== "hypercore_testnet_exchange_envelope.v1"
  ) {
    fail(
      "invalid_hypercore_testnet_exchange_envelope",
      "Exchange envelope drifted"
    );
  }
  return true;
}

function exchangeResult({
  envelope,
  disposition,
  responseHash,
  statusCode,
  unexpectedFillObserved = false
}) {
  if (!TERMINAL_RESPONSE_DISPOSITIONS.has(disposition)) {
    fail("invalid_hypercore_exchange_result", "disposition is invalid");
  }
  const value = {
    authorizationHash: envelope.authorizationHash,
    signingRequestHash: envelope.signingRequestHash,
    requestBodyHash: envelope.requestBodyHash,
    signatureHash: envelope.signatureHash,
    disposition,
    unexpectedFillObserved,
    responseHash,
    statusCode,
    externalSystemQueried: true,
    externalSubmissionAttempted: true,
    retryAllowed: false,
    rawResponsePersisted: false,
    reconciliationRequired: disposition !== "rejected",
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_TESTNET_EXCHANGE_RESULT_SCHEMA_VERSION
  };
  return cloneFreeze({
    resultHash: hashId("hypercore_testnet_exchange_result", value),
    ...value
  });
}

export function verifyHypercoreTestnetExchangeResult(value) {
  exactShape("exchange result", value, [
    "resultHash",
    "authorizationHash",
    "signingRequestHash",
    "requestBodyHash",
    "signatureHash",
    "disposition",
    "unexpectedFillObserved",
    "responseHash",
    "statusCode",
    "externalSystemQueried",
    "externalSubmissionAttempted",
    "retryAllowed",
    "rawResponsePersisted",
    "reconciliationRequired",
    "mainnetAuthority",
    "productionAuthority",
    "realFundsAuthority",
    "schemaVersion"
  ]);
  const { resultHash, ...core } = value;
  bytes32("resultHash", resultHash);
  for (const key of [
    "authorizationHash",
    "signingRequestHash",
    "requestBodyHash",
    "signatureHash",
    "responseHash"
  ]) bytes32(key, value[key]);
  if (
    !TERMINAL_RESPONSE_DISPOSITIONS.has(value.disposition) ||
    typeof value.unexpectedFillObserved !== "boolean" ||
    (value.statusCode !== null &&
      (!Number.isSafeInteger(value.statusCode) ||
        value.statusCode < 100 ||
        value.statusCode > 599)) ||
    value.externalSystemQueried !== true ||
    value.externalSubmissionAttempted !== true ||
    value.retryAllowed !== false ||
    value.rawResponsePersisted !== false ||
    value.reconciliationRequired !== (value.disposition !== "rejected") ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_TESTNET_EXCHANGE_RESULT_SCHEMA_VERSION ||
    hashId("hypercore_testnet_exchange_result", core) !== resultHash
  ) {
    fail("invalid_hypercore_exchange_result", "exchange result drifted");
  }
  return true;
}

function normalizeExchangeDisposition(parsed, actionType) {
  if (parsed?.status === "err") {
    return { disposition: "rejected", unexpectedFillObserved: false };
  }
  if (parsed?.status !== "ok") {
    return { disposition: "unknown", unexpectedFillObserved: false };
  }
  if (actionType === "scheduleCancel") {
    return parsed?.response?.type === "default"
      ? { disposition: "confirmed", unexpectedFillObserved: false }
      : { disposition: "unknown", unexpectedFillObserved: false };
  }
  const statuses = parsed?.response?.data?.statuses;
  if (!Array.isArray(statuses) || statuses.length !== 1) {
    return { disposition: "unknown", unexpectedFillObserved: false };
  }
  const item = statuses[0];
  if (actionType === "order" || actionType === "batchModify") {
    if (plainObject(item?.resting) && Number.isSafeInteger(item.resting.oid)) {
      return { disposition: "confirmed", unexpectedFillObserved: false };
    }
    if (plainObject(item?.filled)) {
      return { disposition: "confirmed", unexpectedFillObserved: true };
    }
    if (typeof item === "string" || typeof item?.error === "string") {
      return { disposition: "rejected", unexpectedFillObserved: false };
    }
    return { disposition: "unknown", unexpectedFillObserved: false };
  }
  if (actionType === "cancel" || actionType === "cancelByCloid") {
    if (item === "success") {
      return { disposition: "confirmed", unexpectedFillObserved: false };
    }
    if (typeof item === "string" || typeof item?.error === "string") {
      return { disposition: "rejected", unexpectedFillObserved: false };
    }
  }
  return { disposition: "unknown", unexpectedFillObserved: false };
}

export class HypercoreTestnetExchangeTransport {
  #fetch;
  #clock;
  #submitted = new Set();

  constructor({ fetchImpl, clock = () => new Date(), ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      typeof fetchImpl !== "function" ||
      typeof clock !== "function"
    ) {
      fail(
        "invalid_hypercore_exchange_transport_configuration",
        "closed fetch and clock ports are required"
      );
    }
    this.#fetch = fetchImpl;
    this.#clock = clock;
    this.profile = cloneFreeze({
      environment: "hyperliquid_testnet",
      endpoint: HYPERCORE_TESTNET_PROOF_PROFILE.endpoint,
      method: "POST",
      redirect: "error",
      timeoutMs: 5_000,
      maximumResponseBytes: 32 * 1024,
      automaticRetry: false,
      privateKeyAccepted: false,
      rawResponsePersisted: false,
      mainnetAuthority: false,
      productionAuthority: false,
      realFundsAuthority: false,
      schemaVersion: "hypercore_testnet_exchange_transport.v1"
    });
  }

  async submit(envelope) {
    verifyHypercoreTestnetExchangeEnvelope(envelope);
    if (
      this.#submitted.has(envelope.authorizationHash)
    ) {
      fail(
        "hypercore_testnet_submission_denied",
        "envelope is stale, replayed or outside the Testnet transport"
      );
    }
    this.#submitted.add(envelope.authorizationHash);
    const now = trustedDate("clock", this.#clock());
    let response;
    try {
      response = await this.#fetch(this.profile.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(envelope.body),
        redirect: "error",
        signal: AbortSignal.timeout(this.profile.timeoutMs)
      });
    } catch (error) {
      return exchangeResult({
        envelope,
        disposition: "unknown",
        responseHash: hashId("hypercore_testnet_transport_unknown", {
          requestBodyHash: envelope.requestBodyHash,
          errorName: error?.name ?? "Error",
          observedAt: now.toISOString()
        }),
        statusCode: null
      });
    }
    const contentLength = Number(response.headers?.get?.("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > this.profile.maximumResponseBytes) {
      return exchangeResult({
        envelope,
        disposition: "unknown",
        responseHash: hashId("hypercore_testnet_oversized_response", {
          requestBodyHash: envelope.requestBodyHash,
          statusCode: response.status
        }),
        statusCode: response.status
      });
    }
    let text;
    try {
      text = await response.text();
    } catch {
      text = "";
    }
    if (Buffer.byteLength(text) > this.profile.maximumResponseBytes) {
      return exchangeResult({
        envelope,
        disposition: "unknown",
        responseHash: hashId("hypercore_testnet_oversized_response", {
          requestBodyHash: envelope.requestBodyHash,
          statusCode: response.status
        }),
        statusCode: response.status
      });
    }
    const responseHash = hashId("hypercore_testnet_exchange_response", {
      requestBodyHash: envelope.requestBodyHash,
      statusCode: response.status,
      body: text
    });
    if (response.status < 200 || response.status >= 300) {
      return exchangeResult({
        envelope,
        disposition: response.status >= 500 ? "unknown" : "rejected",
        responseHash,
        statusCode: response.status
      });
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return exchangeResult({
        envelope,
        disposition: "unknown",
        responseHash,
        statusCode: response.status
      });
    }
    const normalized = normalizeExchangeDisposition(
      parsed,
      envelope.body.action.type
    );
    return exchangeResult({
      envelope,
      ...normalized,
      responseHash,
      statusCode: response.status
    });
  }
}
