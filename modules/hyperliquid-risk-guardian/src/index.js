import {
  DomainError,
  TradingFacilityRiskState,
  createOperationalId,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  HyperliquidExecutionActionKind
} from "../../hyperliquid-execution/src/index.js";

export const HYPERLIQUID_TESTNET_RISK_POLICY_VERSION =
  "hyperliquid_testnet_risk_simulation_fixture.v1";
export const HYPERLIQUID_TESTNET_RISK_SNAPSHOT_SCHEMA_VERSION =
  "hyperliquid_testnet_simulated_risk_snapshot.v1";
export const HYPERLIQUID_TESTNET_VENUE_STATE_SCHEMA_VERSION =
  "hyperliquid_testnet_simulated_venue_state.v1";
export const HYPERLIQUID_TESTNET_PROTECTIVE_CONTROL_SCHEMA_VERSION =
  "hyperliquid_testnet_simulated_protective_control.v1";

export const HyperliquidRiskFreshness = Object.freeze({
  FRESH: "FRESH",
  STALE: "STALE",
  UNKNOWN: "UNKNOWN"
});

export const HyperliquidExternalWriteState = Object.freeze({
  RECONCILED: "RECONCILED",
  UNKNOWN: "UNKNOWN"
});

export const HyperliquidProtectiveControlStatus = Object.freeze({
  PLANNED: "PLANNED",
  EXECUTING: "EXECUTING",
  VERIFIED: "VERIFIED",
  INCOMPLETE: "INCOMPLETE",
  UNKNOWN: "UNKNOWN"
});

export const HyperliquidProtectiveActionKind = Object.freeze({
  WARNING_NOTIFICATION: "warningNotification",
  CANCEL: "cancel",
  REDUCE_ONLY_CLOSE: "reduceOnlyClose"
});

const HASH = /^0x[0-9a-f]{64}$/;
const CLOID = /^0x[0-9a-f]{32}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DECIMAL =
  /^(?:0\.(?:0*[1-9][0-9]*|[0-9]*[1-9]0*)|[1-9][0-9]{0,30}(?:\.[0-9]{1,18})?)$/;
const REASON_CODE = /^[a-z0-9][a-z0-9:_-]{0,127}$/;
const RISK_STATES = new Set(Object.values(TradingFacilityRiskState));
const FRESHNESS = new Set(Object.values(HyperliquidRiskFreshness));
const EXTERNAL_WRITE_STATES = new Set(
  Object.values(HyperliquidExternalWriteState)
);
const CONTROL_STATUSES = new Set(
  Object.values(HyperliquidProtectiveControlStatus)
);
const TERMINAL_CONTROL_STATUSES = new Set([
  HyperliquidProtectiveControlStatus.VERIFIED,
  HyperliquidProtectiveControlStatus.INCOMPLETE,
  HyperliquidProtectiveControlStatus.UNKNOWN
]);
const RISK_STATE_ORDER = Object.freeze([
  TradingFacilityRiskState.NORMAL,
  TradingFacilityRiskState.WARNING,
  TradingFacilityRiskState.REDUCE_ONLY,
  TradingFacilityRiskState.FLATTEN,
  TradingFacilityRiskState.SETTLEMENT
]);
const MAX_OPEN_ORDERS = 50;
const MAX_POSITIONS = 20;
const MAX_PROTECTIVE_ACTIONS = MAX_OPEN_ORDERS + MAX_POSITIONS + 1;
const MAX_SIMULATION_FIXTURE_AGE_MS = 10 * 60 * 1000;

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
  keys,
  code = "invalid_hyperliquid_risk_guardian_input"
) {
  if (!plainObject(value)) fail(code, "input must be a plain object");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index])
  ) {
    fail(code, "input has an open or incomplete shape");
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hyperliquid_risk_guardian_input", `${name} is invalid`);
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hyperliquid_risk_guardian_input", `${name} is invalid`);
  }
  return value;
}

function positiveInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(
      "invalid_hyperliquid_risk_guardian_input",
      `${name} must be a positive safe integer`
    );
  }
  return value;
}

function nonNegativeInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(
      "invalid_hyperliquid_risk_guardian_input",
      `${name} must be a non-negative safe integer`
    );
  }
  return value;
}

function decimal(name, value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    fail(
      "invalid_hyperliquid_risk_guardian_input",
      `${name} must be a bounded positive decimal string`
    );
  }
  return value;
}

function timestamp(clock) {
  const value = clock();
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(
      "invalid_hyperliquid_risk_guardian_clock",
      "clock returned an invalid time"
    );
  }
  return value;
}

function iso(value) {
  return new Date(value).toISOString();
}

function date(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    fail(
      "invalid_hyperliquid_risk_guardian_input",
      `${name} is invalid`
    );
  }
  return new Date(value).getTime();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function riskState(value) {
  if (!RISK_STATES.has(value)) {
    fail(
      "invalid_hyperliquid_risk_guardian_input",
      "risk state is unsupported"
    );
  }
  return value;
}

function mostRestrictive(left, right) {
  return RISK_STATE_ORDER.indexOf(left) >= RISK_STATE_ORDER.indexOf(right)
    ? left
    : right;
}

function commonSafety() {
  return {
    environment: "hyperliquid_testnet",
    simulationOnly: true,
    simulationFixtureOnly: true,
    productionPolicyApproved: false,
    externalSystemQueried: false,
    externalOrderSubmitted: false,
    liveTransportApproved: false,
    liveSignerApproved: false,
    apiWalletApproved: false,
    withdrawalAuthority: false,
    transferAuthority: false,
    accountAdministrationAuthority: false,
    strategyAuthority: false,
    economicRepricingAuthority: false,
    automaticRecovery: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    piiIncluded: false,
    secretsIncluded: false
  };
}

function assertSafety(value) {
  const expected = commonSafety();
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) {
      fail(
        "hyperliquid_risk_guardian_boundary_violation",
        `${key} violated the simulation-only safety boundary`
      );
    }
  }
}

function normalizeReasonCodes(value) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 5 ||
    new Set(value).size !== value.length ||
    value.some((reason) => typeof reason !== "string" || !REASON_CODE.test(reason))
  ) {
    fail(
      "invalid_hyperliquid_risk_guardian_input",
      "reasonCodes must be a closed unique set"
    );
  }
  return [...value];
}

function normalizeOpenOrder(value) {
  exactKeys(
    value,
    ["assetIndex", "orderId", "cloid", "riskIncreasing"],
    "invalid_hyperliquid_venue_state"
  );
  nonNegativeInteger("assetIndex", value.assetIndex);
  positiveInteger("orderId", value.orderId);
  if (value.cloid !== null && (typeof value.cloid !== "string" || !CLOID.test(value.cloid))) {
    fail("invalid_hyperliquid_venue_state", "cloid is invalid");
  }
  if (typeof value.riskIncreasing !== "boolean") {
    fail(
      "invalid_hyperliquid_venue_state",
      "riskIncreasing must be a server boolean"
    );
  }
  return {
    assetIndex: value.assetIndex,
    orderId: value.orderId,
    cloid: value.cloid,
    riskIncreasing: value.riskIncreasing
  };
}

function normalizePosition(value) {
  exactKeys(
    value,
    ["assetIndex", "side", "size", "protectiveLimitPx"],
    "invalid_hyperliquid_venue_state"
  );
  nonNegativeInteger("assetIndex", value.assetIndex);
  if (!["long", "short"].includes(value.side)) {
    fail("invalid_hyperliquid_venue_state", "position side is unsupported");
  }
  return {
    assetIndex: value.assetIndex,
    side: value.side,
    size: decimal("size", value.size),
    protectiveLimitPx: decimal(
      "protectiveLimitPx",
      value.protectiveLimitPx
    )
  };
}

export function createHyperliquidTestnetVenueState(
  {
    facilityId,
    facilityHash,
    sourceInfoSnapshotHash,
    observedAtMs,
    maximumAgeMs,
    openOrders,
    positions,
    simulationFixtureOnly,
    productionPolicyApproved,
    ...unknown
  },
  { clock = Date.now, ...clockUnknown } = {}
) {
  if (Object.keys(unknown).length !== 0 || Object.keys(clockUnknown).length !== 0) {
    fail("invalid_hyperliquid_venue_state", "venue state input has an open shape");
  }
  identifier("facilityId", facilityId);
  hash("facilityHash", facilityHash);
  hash("sourceInfoSnapshotHash", sourceInfoSnapshotHash);
  positiveInteger("observedAtMs", observedAtMs);
  positiveInteger("maximumAgeMs", maximumAgeMs);
  if (maximumAgeMs > MAX_SIMULATION_FIXTURE_AGE_MS) {
    fail(
      "invalid_hyperliquid_venue_state",
      "simulation fixture age exceeds the closed test bound"
    );
  }
  if (
    simulationFixtureOnly !== true ||
    productionPolicyApproved !== false
  ) {
    fail(
      "hyperliquid_risk_policy_unapproved",
      "only an explicitly non-production simulation fixture is accepted"
    );
  }
  if (
    !Array.isArray(openOrders) ||
    openOrders.length > MAX_OPEN_ORDERS ||
    !Array.isArray(positions) ||
    positions.length > MAX_POSITIONS
  ) {
    fail(
      "invalid_hyperliquid_venue_state",
      "venue state exceeds the closed protective bound"
    );
  }
  const normalizedOrders = openOrders.map(normalizeOpenOrder);
  const normalizedPositions = positions.map(normalizePosition);
  if (
    new Set(normalizedOrders.map(({ orderId }) => orderId)).size !==
      normalizedOrders.length ||
    new Set(normalizedPositions.map(({ assetIndex }) => assetIndex)).size !==
      normalizedPositions.length
  ) {
    fail(
      "invalid_hyperliquid_venue_state",
      "venue state contains duplicate order or position identities"
    );
  }
  const serverReceivedAtMs = timestamp(clock);
  const freshness =
    observedAtMs > serverReceivedAtMs
      ? HyperliquidRiskFreshness.UNKNOWN
      : serverReceivedAtMs - observedAtMs > maximumAgeMs
        ? HyperliquidRiskFreshness.STALE
        : HyperliquidRiskFreshness.FRESH;
  const core = {
    facilityId,
    facilityHash,
    sourceInfoSnapshotHash,
    observedAt: iso(observedAtMs),
    serverReceivedAt: iso(serverReceivedAtMs),
    maximumAgeMs,
    freshness,
    openOrders: normalizedOrders,
    positions: normalizedPositions
  };
  return deepFreeze({
    venueStateHash: hashId("hyperliquid_testnet_venue_state", core),
    ...core,
    ...commonSafety(),
    schemaVersion: HYPERLIQUID_TESTNET_VENUE_STATE_SCHEMA_VERSION
  });
}

function assertVenueState(value) {
  if (
    !plainObject(value) ||
    value.schemaVersion !== HYPERLIQUID_TESTNET_VENUE_STATE_SCHEMA_VERSION ||
    !FRESHNESS.has(value.freshness) ||
    !Array.isArray(value.openOrders) ||
    !Array.isArray(value.positions)
  ) {
    fail("invalid_hyperliquid_venue_state", "venue state is unavailable");
  }
  hash("venueStateHash", value.venueStateHash);
  hash("facilityHash", value.facilityHash);
  hash("sourceInfoSnapshotHash", value.sourceInfoSnapshotHash);
  identifier("facilityId", value.facilityId);
  positiveInteger("maximumAgeMs", value.maximumAgeMs);
  const observedAtMs = date("observedAt", value.observedAt);
  const serverReceivedAtMs = date(
    "serverReceivedAt",
    value.serverReceivedAt
  );
  const expectedFreshness =
    observedAtMs > serverReceivedAtMs
      ? HyperliquidRiskFreshness.UNKNOWN
      : serverReceivedAtMs - observedAtMs > value.maximumAgeMs
        ? HyperliquidRiskFreshness.STALE
        : HyperliquidRiskFreshness.FRESH;
  const normalizedOrders = value.openOrders.map(normalizeOpenOrder);
  const normalizedPositions = value.positions.map(normalizePosition);
  const expectedHash = hashId("hyperliquid_testnet_venue_state", {
    facilityId: value.facilityId,
    facilityHash: value.facilityHash,
    sourceInfoSnapshotHash: value.sourceInfoSnapshotHash,
    observedAt: value.observedAt,
    serverReceivedAt: value.serverReceivedAt,
    maximumAgeMs: value.maximumAgeMs,
    freshness: value.freshness,
    openOrders: normalizedOrders,
    positions: normalizedPositions
  });
  if (
    value.freshness !== expectedFreshness ||
    value.venueStateHash !== expectedHash
  ) {
    fail("invalid_hyperliquid_venue_state", "venue state hash is invalid");
  }
  assertSafety(value);
  return value;
}

export function createHyperliquidTestnetRiskSnapshot(
  {
    facilityId,
    facilityHash,
    facilityVersion,
    venueState,
    evaluatedRiskState,
    riskPolicyVersion,
    riskPolicyHash,
    reasonCodes,
    riskIncreasingKillSwitchOpen,
    externalWriteState,
    simulationFixtureOnly,
    productionPolicyApproved,
    ...unknown
  },
  { clock = Date.now, ...clockUnknown } = {}
) {
  if (Object.keys(unknown).length !== 0 || Object.keys(clockUnknown).length !== 0) {
    fail(
      "invalid_hyperliquid_risk_snapshot",
      "risk snapshot input has an open shape"
    );
  }
  const venue = assertVenueState(venueState);
  identifier("facilityId", facilityId);
  hash("facilityHash", facilityHash);
  positiveInteger("facilityVersion", facilityVersion);
  if (
    venue.facilityId !== facilityId ||
    venue.facilityHash !== facilityHash
  ) {
    fail(
      "hyperliquid_risk_snapshot_binding_mismatch",
      "venue state is bound to another Facility"
    );
  }
  riskState(evaluatedRiskState);
  if (riskPolicyVersion !== HYPERLIQUID_TESTNET_RISK_POLICY_VERSION) {
    fail(
      "hyperliquid_risk_policy_unapproved",
      "risk policy version is not the closed simulation fixture"
    );
  }
  hash("riskPolicyHash", riskPolicyHash);
  const normalizedReasons = normalizeReasonCodes(reasonCodes);
  if (
    typeof riskIncreasingKillSwitchOpen !== "boolean" ||
    !EXTERNAL_WRITE_STATES.has(externalWriteState) ||
    simulationFixtureOnly !== true ||
    productionPolicyApproved !== false
  ) {
    fail(
      "hyperliquid_risk_policy_unapproved",
      "risk snapshot attempted to cross the simulation policy boundary"
    );
  }
  let effectiveRiskState = evaluatedRiskState;
  const restrictiveReasons = [...normalizedReasons];
  if (venue.freshness !== HyperliquidRiskFreshness.FRESH) {
    effectiveRiskState = mostRestrictive(
      effectiveRiskState,
      TradingFacilityRiskState.REDUCE_ONLY
    );
    restrictiveReasons.push(
      venue.freshness === HyperliquidRiskFreshness.STALE
        ? "venue_snapshot_stale"
        : "venue_snapshot_unknown"
    );
  }
  if (!riskIncreasingKillSwitchOpen) {
    effectiveRiskState = mostRestrictive(
      effectiveRiskState,
      TradingFacilityRiskState.REDUCE_ONLY
    );
    restrictiveReasons.push("risk_increasing_kill_switch_closed");
  }
  if (externalWriteState === HyperliquidExternalWriteState.UNKNOWN) {
    effectiveRiskState = mostRestrictive(
      effectiveRiskState,
      TradingFacilityRiskState.REDUCE_ONLY
    );
    restrictiveReasons.push("external_write_outcome_unknown");
  }
  const uniqueReasons = [...new Set(restrictiveReasons)];
  const evaluatedAtMs = timestamp(clock);
  if (evaluatedAtMs < date("venueState.serverReceivedAt", venue.serverReceivedAt)) {
    fail(
      "invalid_hyperliquid_risk_guardian_clock",
      "risk evaluation clock moved behind the venue receipt"
    );
  }
  const core = {
    facilityId,
    facilityHash,
    facilityVersion,
    venueStateHash: venue.venueStateHash,
    sourceInfoSnapshotHash: venue.sourceInfoSnapshotHash,
    venueObservedAt: venue.observedAt,
    venueMaximumAgeMs: venue.maximumAgeMs,
    freshness: venue.freshness,
    evaluatedRiskState,
    effectiveRiskState,
    reasonCodes: uniqueReasons,
    riskIncreasingKillSwitchOpen,
    externalWriteState,
    riskPolicyVersion,
    riskPolicyHash,
    serverEvaluatedAt: iso(evaluatedAtMs)
  };
  return deepFreeze({
    riskSnapshotHash: hashId("hyperliquid_testnet_risk_snapshot", core),
    ...core,
    monotonicProtection: true,
    authorizingProductionRisk: false,
    callerTimeAccepted: false,
    ...commonSafety(),
    schemaVersion: HYPERLIQUID_TESTNET_RISK_SNAPSHOT_SCHEMA_VERSION
  });
}

function assertRiskSnapshot(value) {
  if (
    !plainObject(value) ||
    value.schemaVersion !== HYPERLIQUID_TESTNET_RISK_SNAPSHOT_SCHEMA_VERSION ||
    value.riskPolicyVersion !== HYPERLIQUID_TESTNET_RISK_POLICY_VERSION ||
    value.monotonicProtection !== true ||
    value.authorizingProductionRisk !== false ||
    value.callerTimeAccepted !== false ||
    !FRESHNESS.has(value.freshness) ||
    !EXTERNAL_WRITE_STATES.has(value.externalWriteState)
  ) {
    fail("invalid_hyperliquid_risk_snapshot", "risk snapshot is unavailable");
  }
  hash("riskSnapshotHash", value.riskSnapshotHash);
  hash("venueStateHash", value.venueStateHash);
  hash("sourceInfoSnapshotHash", value.sourceInfoSnapshotHash);
  hash("riskPolicyHash", value.riskPolicyHash);
  identifier("facilityId", value.facilityId);
  hash("facilityHash", value.facilityHash);
  positiveInteger("facilityVersion", value.facilityVersion);
  date("venueObservedAt", value.venueObservedAt);
  positiveInteger("venueMaximumAgeMs", value.venueMaximumAgeMs);
  riskState(value.evaluatedRiskState);
  riskState(value.effectiveRiskState);
  normalizeReasonCodes(value.reasonCodes);
  date("serverEvaluatedAt", value.serverEvaluatedAt);
  let requiredEffectiveState = value.evaluatedRiskState;
  const requiredReasons = [];
  if (value.freshness !== HyperliquidRiskFreshness.FRESH) {
    requiredEffectiveState = mostRestrictive(
      requiredEffectiveState,
      TradingFacilityRiskState.REDUCE_ONLY
    );
    requiredReasons.push(
      value.freshness === HyperliquidRiskFreshness.STALE
        ? "venue_snapshot_stale"
        : "venue_snapshot_unknown"
    );
  }
  if (!value.riskIncreasingKillSwitchOpen) {
    requiredEffectiveState = mostRestrictive(
      requiredEffectiveState,
      TradingFacilityRiskState.REDUCE_ONLY
    );
    requiredReasons.push("risk_increasing_kill_switch_closed");
  }
  if (value.externalWriteState === HyperliquidExternalWriteState.UNKNOWN) {
    requiredEffectiveState = mostRestrictive(
      requiredEffectiveState,
      TradingFacilityRiskState.REDUCE_ONLY
    );
    requiredReasons.push("external_write_outcome_unknown");
  }
  if (
    typeof value.riskIncreasingKillSwitchOpen !== "boolean" ||
    value.effectiveRiskState !== requiredEffectiveState ||
    requiredReasons.some((reason) => !value.reasonCodes.includes(reason)) ||
    value.riskSnapshotHash !==
      hashId("hyperliquid_testnet_risk_snapshot", {
        facilityId: value.facilityId,
        facilityHash: value.facilityHash,
        facilityVersion: value.facilityVersion,
        venueStateHash: value.venueStateHash,
        sourceInfoSnapshotHash: value.sourceInfoSnapshotHash,
        venueObservedAt: value.venueObservedAt,
        venueMaximumAgeMs: value.venueMaximumAgeMs,
        freshness: value.freshness,
        evaluatedRiskState: value.evaluatedRiskState,
        effectiveRiskState: value.effectiveRiskState,
        reasonCodes: value.reasonCodes,
        riskIncreasingKillSwitchOpen:
          value.riskIncreasingKillSwitchOpen,
        externalWriteState: value.externalWriteState,
        riskPolicyVersion: value.riskPolicyVersion,
        riskPolicyHash: value.riskPolicyHash,
        serverEvaluatedAt: value.serverEvaluatedAt
      })
  ) {
    fail("invalid_hyperliquid_risk_snapshot", "risk snapshot hash is invalid");
  }
  assertSafety(value);
  return value;
}

function isServerProvenReducing(actionKind, action) {
  return (
    actionKind === HyperliquidExecutionActionKind.REDUCE_ONLY_ORDER ||
    (
      actionKind === HyperliquidExecutionActionKind.MODIFY &&
      action?.replacement?.reduceOnly === true
    )
  );
}

export function evaluateHyperliquidExecutionRiskAdmission({
  riskSnapshot,
  actionKind,
  action,
  serverNowMs = undefined,
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    fail(
      "invalid_hyperliquid_risk_admission",
      "risk admission input has an open shape"
    );
  }
  const snapshot = assertRiskSnapshot(riskSnapshot);
  const evaluatedAtMs =
    serverNowMs === undefined
      ? date("serverEvaluatedAt", snapshot.serverEvaluatedAt)
      : positiveInteger("serverNowMs", serverNowMs);
  const venueObservedAtMs = date(
    "venueObservedAt",
    snapshot.venueObservedAt
  );
  if (!plainObject(action)) {
    fail(
      "invalid_hyperliquid_risk_admission",
      "normalized execution action is required"
    );
  }
  if (!Object.values(HyperliquidExecutionActionKind).includes(actionKind)) {
    fail(
      "invalid_hyperliquid_risk_admission",
      "execution action kind is unsupported"
    );
  }
  const cancel = [
    HyperliquidExecutionActionKind.CANCEL,
    HyperliquidExecutionActionKind.CANCEL_BY_CLOID
  ].includes(actionKind);
  const reducing = isServerProvenReducing(actionKind, action);
  const currentFreshness =
    evaluatedAtMs < venueObservedAtMs
      ? HyperliquidRiskFreshness.UNKNOWN
      : evaluatedAtMs - venueObservedAtMs > snapshot.venueMaximumAgeMs
        ? HyperliquidRiskFreshness.STALE
        : snapshot.freshness;
  const state =
    currentFreshness === HyperliquidRiskFreshness.FRESH
      ? snapshot.effectiveRiskState
      : mostRestrictive(
          snapshot.effectiveRiskState,
          TradingFacilityRiskState.REDUCE_ONLY
        );
  let approved = false;
  let reasonCode = "risk_action_denied";

  if (state === TradingFacilityRiskState.SETTLEMENT) {
    reasonCode = "settlement_trading_closed";
  } else if (state === TradingFacilityRiskState.FLATTEN) {
    approved = cancel ||
      actionKind === HyperliquidExecutionActionKind.REDUCE_ONLY_ORDER;
    reasonCode = approved
      ? "flatten_protective_action"
      : "flatten_blocks_non_protective_action";
  } else if (state === TradingFacilityRiskState.REDUCE_ONLY) {
    approved = cancel || reducing;
    reasonCode = approved
      ? "reduce_only_protective_action"
      : "reduce_only_blocks_risk_increase";
  } else {
    approved = true;
    reasonCode =
      state === TradingFacilityRiskState.WARNING
        ? "warning_bounded_existing_policy"
        : "normal_bounded_existing_policy";
  }
  return deepFreeze({
    approved,
    reasonCode,
    actionKind,
    serverReduceOnlyProven: reducing,
    effectiveRiskState: state,
    riskSnapshotHash: snapshot.riskSnapshotHash,
    policyDecisionHash: hashId("hyperliquid_risk_admission", {
      riskSnapshotHash: snapshot.riskSnapshotHash,
      actionKind,
      actionHash: hashId("hyperliquid_execution_action", action),
      serverEvaluatedAt: iso(evaluatedAtMs),
      currentFreshness,
      approved,
      reasonCode
    }),
    simulationOnly: true
  });
}

export function createHyperliquidRiskGuardianPolicyEvaluator({
  snapshotProvider,
  clock = Date.now,
  ...unknown
} = {}) {
  if (
    Object.keys(unknown).length !== 0 ||
      !snapshotProvider ||
      typeof snapshotProvider.getRiskSnapshot !== "function" ||
      typeof clock !== "function"
  ) {
    fail(
      "invalid_hyperliquid_risk_guardian_configuration",
      "a closed server risk snapshot provider is required"
    );
  }
  return deepFreeze({
    async evaluate(input) {
      exactKeys(
        input,
        [
          "facilityId",
          "facilityHash",
          "facilityVersion",
          "orderIntentId",
          "orderIntentHash",
          "orderIntentVersion",
          "actionKind",
          "actionHash",
          "action",
          "simulationOnly"
        ],
        "invalid_hyperliquid_risk_admission"
      );
      if (input.simulationOnly !== true) {
        fail(
          "hyperliquid_risk_guardian_boundary_violation",
          "live execution policy evaluation is unavailable"
        );
      }
      const snapshot = assertRiskSnapshot(
        await snapshotProvider.getRiskSnapshot({
          facilityId: input.facilityId,
          facilityHash: input.facilityHash,
          facilityVersion: input.facilityVersion
        })
      );
      if (
        snapshot.facilityId !== input.facilityId ||
        snapshot.facilityHash !== input.facilityHash ||
        snapshot.facilityVersion !== input.facilityVersion
      ) {
        fail(
          "hyperliquid_risk_snapshot_binding_mismatch",
          "risk snapshot changed or is bound to another Facility version"
        );
      }
      const admission = evaluateHyperliquidExecutionRiskAdmission({
        riskSnapshot: snapshot,
        actionKind: input.actionKind,
        action: input.action,
        serverNowMs: timestamp(clock)
      });
      return {
        approved: admission.approved,
        policyDecisionHash: admission.policyDecisionHash,
        actionKind: admission.actionKind,
        serverReduceOnlyProven: admission.serverReduceOnlyProven,
        killSwitchOpen: admission.approved,
        simulationOnly: true
      };
    }
  });
}

function actionEvidence(requestHash, ordinal, action) {
  const actionId = `protective_action_${hashId("hyperliquid_protective_action_id", {
    requestHash,
    ordinal
  }).slice(2, 26)}`;
  const core = { actionId, ordinal, ...action };
  return deepFreeze({
    ...core,
    actionHash: hashId("hyperliquid_protective_action", core),
    simulationOnly: true,
    withdrawalAuthority: false,
    transferAuthority: false,
    strategyAuthority: false,
    schemaVersion: "hyperliquid_testnet_protective_action.v1"
  });
}

function assertProtectiveAction(value, requestHash, expectedOrdinal) {
  if (
    !plainObject(value) ||
    value.ordinal !== expectedOrdinal ||
    !Object.values(HyperliquidProtectiveActionKind).includes(value.kind)
  ) {
    fail(
      "invalid_hyperliquid_protective_action",
      "protective action is unavailable"
    );
  }
  let keys;
  if (value.kind === HyperliquidProtectiveActionKind.WARNING_NOTIFICATION) {
    keys = [
      "actionId",
      "ordinal",
      "kind",
      "reasonCodes",
      "actionHash",
      "simulationOnly",
      "withdrawalAuthority",
      "transferAuthority",
      "strategyAuthority",
      "schemaVersion"
    ];
    normalizeReasonCodes(value.reasonCodes);
  } else if (value.kind === HyperliquidProtectiveActionKind.CANCEL) {
    keys = [
      "actionId",
      "ordinal",
      "kind",
      "assetIndex",
      "orderId",
      "cloid",
      "actionHash",
      "simulationOnly",
      "withdrawalAuthority",
      "transferAuthority",
      "strategyAuthority",
      "schemaVersion"
    ];
    nonNegativeInteger("assetIndex", value.assetIndex);
    positiveInteger("orderId", value.orderId);
    if (
      value.cloid !== null &&
      (typeof value.cloid !== "string" || !CLOID.test(value.cloid))
    ) {
      fail("invalid_hyperliquid_protective_action", "cloid is invalid");
    }
  } else {
    keys = [
      "actionId",
      "ordinal",
      "kind",
      "assetIndex",
      "side",
      "size",
      "limitPx",
      "timeInForce",
      "reduceOnly",
      "actionHash",
      "simulationOnly",
      "withdrawalAuthority",
      "transferAuthority",
      "strategyAuthority",
      "schemaVersion"
    ];
    nonNegativeInteger("assetIndex", value.assetIndex);
    if (
      !["buy", "sell"].includes(value.side) ||
      value.timeInForce !== "Ioc" ||
      value.reduceOnly !== true
    ) {
      fail(
        "invalid_hyperliquid_protective_action",
        "position close is not server-proven reduce-only"
      );
    }
    decimal("size", value.size);
    decimal("limitPx", value.limitPx);
  }
  exactKeys(value, keys, "invalid_hyperliquid_protective_action");
  identifier("actionId", value.actionId);
  hash("actionHash", value.actionHash);
  if (
    value.simulationOnly !== true ||
    value.withdrawalAuthority !== false ||
    value.transferAuthority !== false ||
    value.strategyAuthority !== false ||
    value.schemaVersion !== "hyperliquid_testnet_protective_action.v1"
  ) {
    fail(
      "hyperliquid_risk_guardian_boundary_violation",
      "protective action crossed its narrow authority boundary"
    );
  }
  const {
    actionHash,
    simulationOnly,
    withdrawalAuthority,
    transferAuthority,
    strategyAuthority,
    schemaVersion,
    ...core
  } = value;
  const expectedId = `protective_action_${hashId(
    "hyperliquid_protective_action_id",
    { requestHash, ordinal: expectedOrdinal }
  ).slice(2, 26)}`;
  if (
    value.actionId !== expectedId ||
    actionHash !== hashId("hyperliquid_protective_action", core)
  ) {
    fail(
      "invalid_hyperliquid_protective_action",
      "protective action evidence hash is invalid"
    );
  }
  return value;
}

export function createHyperliquidProtectiveControlDraft({
  riskSnapshot,
  venueState,
  idempotencyKey,
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    fail(
      "invalid_hyperliquid_protective_control",
      "protective control input has an open shape"
    );
  }
  const risk = assertRiskSnapshot(riskSnapshot);
  const venue = assertVenueState(venueState);
  if (
    risk.facilityId !== venue.facilityId ||
    risk.facilityHash !== venue.facilityHash ||
    risk.venueStateHash !== venue.venueStateHash
  ) {
    fail(
      "hyperliquid_risk_snapshot_binding_mismatch",
      "protective control inputs do not share one venue snapshot"
    );
  }
  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 256
  ) {
    fail(
      "invalid_hyperliquid_protective_control",
      "idempotencyKey must be bounded"
    );
  }
  const idempotencyKeyHash = hashId(
    "hyperliquid_protective_control_idempotency",
    { idempotencyKey }
  );
  const requestCore = {
    facilityId: risk.facilityId,
    facilityHash: risk.facilityHash,
    facilityVersion: risk.facilityVersion,
    riskSnapshotHash: risk.riskSnapshotHash,
    beforeVenueStateHash: venue.venueStateHash,
    targetRiskState: risk.effectiveRiskState,
    idempotencyKeyHash
  };
  const requestHash = hashId(
    "hyperliquid_protective_control_request",
    requestCore
  );
  const rawActions = plannedRawActions(risk, venue);
  if (rawActions.length > MAX_PROTECTIVE_ACTIONS) {
    fail(
      "hyperliquid_protective_action_bound_exceeded",
      "protective plan exceeded the closed action bound"
    );
  }
  const actions = rawActions.map((action, index) =>
    actionEvidence(requestHash, index + 1, action)
  );
  return deepFreeze({
    ...requestCore,
    requestHash,
    riskSnapshot: risk,
    beforeVenueState: venue,
    actions,
    ...commonSafety(),
    schemaVersion: "hyperliquid_testnet_protective_control_draft.v1"
  });
}

function plannedRawActions(risk, venue) {
  const rawActions = [];
  if (risk.effectiveRiskState === TradingFacilityRiskState.WARNING) {
    rawActions.push({
      kind: HyperliquidProtectiveActionKind.WARNING_NOTIFICATION,
      reasonCodes: [...risk.reasonCodes]
    });
  } else if (
    risk.effectiveRiskState === TradingFacilityRiskState.REDUCE_ONLY
  ) {
    for (const order of venue.openOrders) {
      if (
        order.riskIncreasing ||
        venue.freshness !== HyperliquidRiskFreshness.FRESH
      ) {
        rawActions.push({
          kind: HyperliquidProtectiveActionKind.CANCEL,
          assetIndex: order.assetIndex,
          orderId: order.orderId,
          cloid: order.cloid
        });
      }
    }
  } else if (risk.effectiveRiskState === TradingFacilityRiskState.FLATTEN) {
    for (const order of venue.openOrders) {
      rawActions.push({
        kind: HyperliquidProtectiveActionKind.CANCEL,
        assetIndex: order.assetIndex,
        orderId: order.orderId,
        cloid: order.cloid
      });
    }
    for (const position of venue.positions) {
      rawActions.push({
        kind: HyperliquidProtectiveActionKind.REDUCE_ONLY_CLOSE,
        assetIndex: position.assetIndex,
        side: position.side === "long" ? "sell" : "buy",
        size: position.size,
        limitPx: position.protectiveLimitPx,
        timeInForce: "Ioc",
        reduceOnly: true
      });
    }
  }
  return rawActions;
}

function createPlannedControlRecord(draft, nowMs) {
  const controlId = createOperationalId("trading_protective_control");
  const immutable = {
    controlId,
    requestHash: draft.requestHash,
    facilityId: draft.facilityId,
    facilityHash: draft.facilityHash,
    riskSnapshotHash: draft.riskSnapshotHash,
    beforeVenueStateHash: draft.beforeVenueStateHash,
    targetRiskState: draft.targetRiskState
  };
  const createdAt = iso(nowMs);
  const record = deepFreeze({
    controlId,
    controlHash: hashId("hyperliquid_protective_control", immutable),
    requestHash: draft.requestHash,
    idempotencyKeyHash: draft.idempotencyKeyHash,
    facilityId: draft.facilityId,
    facilityHash: draft.facilityHash,
    facilityVersion: draft.facilityVersion,
    riskSnapshotHash: draft.riskSnapshotHash,
    beforeVenueStateHash: draft.beforeVenueStateHash,
    targetRiskState: draft.targetRiskState,
    riskSnapshot: draft.riskSnapshot,
    beforeVenueState: draft.beforeVenueState,
    actions: draft.actions,
    actionResults: [],
    verification: null,
    status: HyperliquidProtectiveControlStatus.PLANNED,
    resultHash: null,
    version: 1,
    createdAt,
    startedAt: null,
    resolvedAt: null,
    updatedAt: createdAt,
    ...commonSafety(),
    schemaVersion: HYPERLIQUID_TESTNET_PROTECTIVE_CONTROL_SCHEMA_VERSION
  });
  assertProtectiveControlRecord(record);
  return record;
}

function actionResult(action, value) {
  exactKeys(
    value,
    [
      "actionId",
      "actionHash",
      "disposition",
      "responseHash",
      "simulationOnly",
      "externalSystemQueried",
      "externalOrderSubmitted"
    ],
    "invalid_hyperliquid_protective_action_result"
  );
  if (
    value.actionId !== action.actionId ||
    value.actionHash !== action.actionHash ||
    !["confirmed", "rejected", "unknown"].includes(value.disposition) ||
    value.simulationOnly !== true ||
    value.externalSystemQueried !== false ||
    value.externalOrderSubmitted !== false
  ) {
    fail(
      "invalid_hyperliquid_protective_action_result",
      "protective executor crossed its narrow simulation boundary"
    );
  }
  hash("responseHash", value.responseHash);
  const core = {
    actionId: value.actionId,
    actionHash: value.actionHash,
    disposition: value.disposition,
    responseHash: value.responseHash
  };
  return deepFreeze({
    ...core,
    actionResultHash: hashId("hyperliquid_protective_action_result", core),
    simulationOnly: true,
    externalSystemQueried: false,
    externalOrderSubmitted: false,
    schemaVersion: "hyperliquid_testnet_protective_action_result.v1"
  });
}

function createVerification(
  record,
  afterVenueState,
  nowMs,
  { forcedUnknown = false, forcedIncomplete = false } = {}
) {
  const after = afterVenueState ? assertVenueState(afterVenueState) : null;
  if (
    after &&
    (
      after.facilityId !== record.facilityId ||
      after.facilityHash !== record.facilityHash
    )
  ) {
    fail(
      "hyperliquid_risk_snapshot_binding_mismatch",
      "post-action venue state is bound to another Facility"
    );
  }
  const riskIncreasingOpenOrderCount =
    after?.openOrders.filter(({ riskIncreasing }) => riskIncreasing).length ??
    null;
  const openOrderCount = after?.openOrders.length ?? null;
  const positionCount = after?.positions.length ?? null;
  let outcome = "INCOMPLETE";
  if (forcedUnknown || !after || after.freshness !== HyperliquidRiskFreshness.FRESH) {
    outcome = "UNKNOWN";
  } else if (forcedIncomplete) {
    outcome = "INCOMPLETE";
  } else if (
    record.targetRiskState === TradingFacilityRiskState.FLATTEN
  ) {
    outcome =
      openOrderCount === 0 && positionCount === 0
        ? "VERIFIED"
        : "INCOMPLETE";
  } else if (
    record.targetRiskState === TradingFacilityRiskState.REDUCE_ONLY
  ) {
    outcome =
      riskIncreasingOpenOrderCount === 0 ? "VERIFIED" : "INCOMPLETE";
  } else {
    outcome = "VERIFIED";
  }
  const core = {
    controlHash: record.controlHash,
    targetRiskState: record.targetRiskState,
    beforeVenueStateHash: record.beforeVenueStateHash,
    afterVenueStateHash: after?.venueStateHash ?? null,
    riskIncreasingOpenOrderCount,
    openOrderCount,
    positionCount,
    outcome,
    verifiedAt: iso(nowMs)
  };
  return deepFreeze({
    ...core,
    verificationHash: hashId(
      "hyperliquid_protective_control_verification",
      core
    ),
    simulationOnly: true,
    externalSystemQueried: false,
    automaticRecovery: false,
    schemaVersion: "hyperliquid_testnet_protective_verification.v1"
  });
}

function assertProtectiveActionResultRecord(value, action) {
  exactKeys(
    value,
    [
      "actionId",
      "actionHash",
      "disposition",
      "responseHash",
      "actionResultHash",
      "simulationOnly",
      "externalSystemQueried",
      "externalOrderSubmitted",
      "schemaVersion"
    ],
    "invalid_hyperliquid_protective_action_result"
  );
  if (
    value.actionId !== action.actionId ||
    value.actionHash !== action.actionHash ||
    !["confirmed", "rejected", "unknown"].includes(value.disposition) ||
    value.simulationOnly !== true ||
    value.externalSystemQueried !== false ||
    value.externalOrderSubmitted !== false ||
    value.schemaVersion !==
      "hyperliquid_testnet_protective_action_result.v1"
  ) {
    fail(
      "invalid_hyperliquid_protective_action_result",
      "protective action result is inconsistent"
    );
  }
  hash("responseHash", value.responseHash);
  hash("actionResultHash", value.actionResultHash);
  const core = {
    actionId: value.actionId,
    actionHash: value.actionHash,
    disposition: value.disposition,
    responseHash: value.responseHash
  };
  if (
    value.actionResultHash !==
      hashId("hyperliquid_protective_action_result", core)
  ) {
    fail(
      "invalid_hyperliquid_protective_action_result",
      "protective action result hash is invalid"
    );
  }
  return value;
}

function assertProtectiveVerification(value, record) {
  exactKeys(
    value,
    [
      "controlHash",
      "targetRiskState",
      "beforeVenueStateHash",
      "afterVenueStateHash",
      "riskIncreasingOpenOrderCount",
      "openOrderCount",
      "positionCount",
      "outcome",
      "verifiedAt",
      "verificationHash",
      "simulationOnly",
      "externalSystemQueried",
      "automaticRecovery",
      "schemaVersion"
    ],
    "invalid_hyperliquid_protective_verification"
  );
  if (
    value.controlHash !== record.controlHash ||
    value.targetRiskState !== record.targetRiskState ||
    value.beforeVenueStateHash !== record.beforeVenueStateHash ||
    !TERMINAL_CONTROL_STATUSES.has(value.outcome) ||
    value.simulationOnly !== true ||
    value.externalSystemQueried !== false ||
    value.automaticRecovery !== false ||
    value.schemaVersion !==
      "hyperliquid_testnet_protective_verification.v1"
  ) {
    fail(
      "invalid_hyperliquid_protective_verification",
      "protective verification is inconsistent"
    );
  }
  if (value.afterVenueStateHash !== null) {
    hash("afterVenueStateHash", value.afterVenueStateHash);
  }
  for (const name of [
    "riskIncreasingOpenOrderCount",
    "openOrderCount",
    "positionCount"
  ]) {
    if (value[name] !== null) nonNegativeInteger(name, value[name]);
  }
  date("verifiedAt", value.verifiedAt);
  hash("verificationHash", value.verificationHash);
  const core = {
    controlHash: value.controlHash,
    targetRiskState: value.targetRiskState,
    beforeVenueStateHash: value.beforeVenueStateHash,
    afterVenueStateHash: value.afterVenueStateHash,
    riskIncreasingOpenOrderCount: value.riskIncreasingOpenOrderCount,
    openOrderCount: value.openOrderCount,
    positionCount: value.positionCount,
    outcome: value.outcome,
    verifiedAt: value.verifiedAt
  };
  if (
    value.verificationHash !==
      hashId("hyperliquid_protective_control_verification", core)
  ) {
    fail(
      "invalid_hyperliquid_protective_verification",
      "protective verification hash is invalid"
    );
  }
  return value;
}

function assertProtectiveControlRecord(record) {
  exactKeys(
    record,
    [
      "controlId",
      "controlHash",
      "requestHash",
      "idempotencyKeyHash",
      "facilityId",
      "facilityHash",
      "facilityVersion",
      "riskSnapshotHash",
      "beforeVenueStateHash",
      "targetRiskState",
      "riskSnapshot",
      "beforeVenueState",
      "actions",
      "actionResults",
      "verification",
      "status",
      "resultHash",
      "version",
      "createdAt",
      "startedAt",
      "resolvedAt",
      "updatedAt",
      "environment",
      "simulationOnly",
      "simulationFixtureOnly",
      "productionPolicyApproved",
      "externalSystemQueried",
      "externalOrderSubmitted",
      "liveTransportApproved",
      "liveSignerApproved",
      "apiWalletApproved",
      "withdrawalAuthority",
      "transferAuthority",
      "accountAdministrationAuthority",
      "strategyAuthority",
      "economicRepricingAuthority",
      "automaticRecovery",
      "mainnetAuthority",
      "productionAuthority",
      "fundsAuthority",
      "piiIncluded",
      "secretsIncluded",
      "schemaVersion"
    ],
    "invalid_hyperliquid_protective_control_record"
  );
  if (
    record.schemaVersion !==
      HYPERLIQUID_TESTNET_PROTECTIVE_CONTROL_SCHEMA_VERSION ||
    !CONTROL_STATUSES.has(record.status) ||
    !Array.isArray(record.actions) ||
    record.actions.length > MAX_PROTECTIVE_ACTIONS ||
    !Array.isArray(record.actionResults)
  ) {
    fail(
      "invalid_hyperliquid_protective_control_record",
      "protective control record is unavailable"
    );
  }
  identifier("controlId", record.controlId);
  identifier("facilityId", record.facilityId);
  hash("controlHash", record.controlHash);
  hash("requestHash", record.requestHash);
  hash("idempotencyKeyHash", record.idempotencyKeyHash);
  hash("facilityHash", record.facilityHash);
  hash("riskSnapshotHash", record.riskSnapshotHash);
  hash("beforeVenueStateHash", record.beforeVenueStateHash);
  positiveInteger("facilityVersion", record.facilityVersion);
  positiveInteger("version", record.version);
  riskState(record.targetRiskState);
  const risk = assertRiskSnapshot(record.riskSnapshot);
  const venue = assertVenueState(record.beforeVenueState);
  const requestCore = {
    facilityId: record.facilityId,
    facilityHash: record.facilityHash,
    facilityVersion: record.facilityVersion,
    riskSnapshotHash: record.riskSnapshotHash,
    beforeVenueStateHash: record.beforeVenueStateHash,
    targetRiskState: record.targetRiskState,
    idempotencyKeyHash: record.idempotencyKeyHash
  };
  if (
    risk.riskSnapshotHash !== record.riskSnapshotHash ||
    venue.venueStateHash !== record.beforeVenueStateHash ||
    risk.venueStateHash !== venue.venueStateHash ||
    risk.facilityId !== record.facilityId ||
    risk.facilityHash !== record.facilityHash ||
    risk.facilityVersion !== record.facilityVersion ||
    risk.effectiveRiskState !== record.targetRiskState ||
    record.requestHash !==
      hashId("hyperliquid_protective_control_request", requestCore) ||
    record.controlHash !==
      hashId("hyperliquid_protective_control", {
        controlId: record.controlId,
        requestHash: record.requestHash,
        facilityId: record.facilityId,
        facilityHash: record.facilityHash,
        riskSnapshotHash: record.riskSnapshotHash,
        beforeVenueStateHash: record.beforeVenueStateHash,
        targetRiskState: record.targetRiskState
      })
  ) {
    fail(
      "invalid_hyperliquid_protective_control_record",
      "protective control binding hash is invalid"
    );
  }
  const expectedActions = plannedRawActions(risk, venue).map(
    (action, index) =>
      actionEvidence(record.requestHash, index + 1, action)
  );
  record.actions.forEach((action, index) =>
    assertProtectiveAction(action, record.requestHash, index + 1)
  );
  if (
    hashId("hyperliquid_protective_action_plan", record.actions) !==
      hashId("hyperliquid_protective_action_plan", expectedActions)
  ) {
    fail(
      "invalid_hyperliquid_protective_control_record",
      "protective control action plan is inconsistent"
    );
  }
  date("createdAt", record.createdAt);
  date("updatedAt", record.updatedAt);
  assertSafety(record);
  if (record.status === HyperliquidProtectiveControlStatus.PLANNED) {
    if (
      record.version !== 1 ||
      record.startedAt !== null ||
      record.resolvedAt !== null ||
      record.resultHash !== null ||
      record.verification !== null ||
      record.actionResults.length !== 0
    ) {
      fail(
        "invalid_hyperliquid_protective_control_record",
        "planned protective control state is invalid"
      );
    }
  } else if (record.status === HyperliquidProtectiveControlStatus.EXECUTING) {
    if (
      record.version !== 2 ||
      record.startedAt === null ||
      record.resolvedAt !== null ||
      record.resultHash !== null ||
      record.verification !== null ||
      record.actionResults.length !== 0
    ) {
      fail(
        "invalid_hyperliquid_protective_control_record",
        "executing protective control state is invalid"
      );
    }
    date("startedAt", record.startedAt);
  } else {
    if (
      record.version !== 3 ||
      record.startedAt === null ||
      record.resolvedAt === null ||
      record.actionResults.length !== record.actions.length
    ) {
      fail(
        "invalid_hyperliquid_protective_control_record",
        "terminal protective control state is invalid"
      );
    }
    date("startedAt", record.startedAt);
    date("resolvedAt", record.resolvedAt);
    record.actionResults.forEach((result, index) =>
      assertProtectiveActionResultRecord(result, record.actions[index])
    );
    assertProtectiveVerification(record.verification, record);
    hash("resultHash", record.resultHash);
    if (
      record.verification.outcome !== record.status ||
      record.resultHash !==
        hashId("hyperliquid_protective_control_result", {
          controlHash: record.controlHash,
          status: record.status,
          actionResultHashes: record.actionResults.map(
            ({ actionResultHash }) => actionResultHash
          ),
          verificationHash: record.verification.verificationHash
        })
    ) {
      fail(
        "invalid_hyperliquid_protective_control_record",
        "terminal protective control result hash is invalid"
      );
    }
  }
  return record;
}

export function transitionHyperliquidProtectiveControl(
  record,
  {
    nextStatus,
    actionResults = [],
    verification = null,
    nowMs,
    ...unknown
  }
) {
  assertProtectiveControlRecord(record);
  if (
    Object.keys(unknown).length !== 0 ||
    !CONTROL_STATUSES.has(nextStatus)
  ) {
    fail(
      "invalid_hyperliquid_protective_control_transition",
      "protective control transition is invalid"
    );
  }
  positiveInteger("nowMs", nowMs);
  const previousStatus = record.status;
  const legal =
    (
      previousStatus === HyperliquidProtectiveControlStatus.PLANNED &&
      nextStatus === HyperliquidProtectiveControlStatus.EXECUTING
    ) ||
    (
      previousStatus === HyperliquidProtectiveControlStatus.EXECUTING &&
      TERMINAL_CONTROL_STATUSES.has(nextStatus)
    );
  if (!legal) {
    fail(
      "hyperliquid_protective_control_transition_denied",
      "protective control transition is terminal or out of order"
    );
  }
  if (nextStatus === HyperliquidProtectiveControlStatus.EXECUTING) {
    if (actionResults.length !== 0 || verification !== null) {
      fail(
        "invalid_hyperliquid_protective_control_transition",
        "executing control cannot contain terminal evidence"
      );
    }
  } else if (
    !Array.isArray(actionResults) ||
    actionResults.length !== record.actions.length ||
    !plainObject(verification) ||
    verification.outcome !== nextStatus
  ) {
    fail(
      "invalid_hyperliquid_protective_control_transition",
      "terminal control evidence is incomplete or inconsistent"
    );
  }
  const changedAt = iso(nowMs);
  const resultHash = TERMINAL_CONTROL_STATUSES.has(nextStatus)
    ? hashId("hyperliquid_protective_control_result", {
        controlHash: record.controlHash,
        status: nextStatus,
        actionResultHashes: actionResults.map(
          ({ actionResultHash }) => actionResultHash
        ),
        verificationHash: verification.verificationHash
      })
    : null;
  const next = deepFreeze({
    ...structuredClone(record),
    actionResults: structuredClone(actionResults),
    verification: verification ? structuredClone(verification) : null,
    status: nextStatus,
    resultHash,
    version: record.version + 1,
    startedAt:
      nextStatus === HyperliquidProtectiveControlStatus.EXECUTING
        ? changedAt
        : record.startedAt,
    resolvedAt: TERMINAL_CONTROL_STATUSES.has(nextStatus) ? changedAt : null,
    updatedAt: changedAt
  });
  assertProtectiveControlRecord(next);
  return next;
}

function transitionEvidence(record, previousStatus) {
  const transitionId = createOperationalId(
    "trading_protective_control_transition"
  );
  const core = {
    transitionId,
    controlId: record.controlId,
    controlHash: record.controlHash,
    sequence: record.version,
    previousStatus,
    nextStatus: record.status,
    resultHash: record.resultHash,
    changedAt: record.updatedAt
  };
  return deepFreeze({
    ...core,
    transitionHash: hashId(
      "hyperliquid_protective_control_transition",
      core
    ),
    simulationOnly: true,
    secretsIncluded: false,
    schemaVersion: "trading_testnet_protective_control_transition.v1"
  });
}

function assertTransitionEvidence(value, record = null) {
  exactKeys(
    value,
    [
      "transitionId",
      "controlId",
      "controlHash",
      "sequence",
      "previousStatus",
      "nextStatus",
      "resultHash",
      "changedAt",
      "transitionHash",
      "simulationOnly",
      "secretsIncluded",
      "schemaVersion"
    ],
    "invalid_hyperliquid_protective_control_transition_evidence"
  );
  identifier("transitionId", value.transitionId);
  identifier("controlId", value.controlId);
  hash("controlHash", value.controlHash);
  hash("transitionHash", value.transitionHash);
  positiveInteger("sequence", value.sequence);
  date("changedAt", value.changedAt);
  if (
    !CONTROL_STATUSES.has(value.nextStatus) ||
    (
      value.previousStatus !== null &&
      ![
        HyperliquidProtectiveControlStatus.PLANNED,
        HyperliquidProtectiveControlStatus.EXECUTING
      ].includes(value.previousStatus)
    ) ||
    (
      value.resultHash !== null &&
      (typeof value.resultHash !== "string" || !HASH.test(value.resultHash))
    ) ||
    value.simulationOnly !== true ||
    value.secretsIncluded !== false ||
    value.schemaVersion !==
      "trading_testnet_protective_control_transition.v1" ||
    !(
      (
        value.sequence === 1 &&
        value.previousStatus === null &&
        value.nextStatus === HyperliquidProtectiveControlStatus.PLANNED &&
        value.resultHash === null
      ) ||
      (
        value.sequence === 2 &&
        value.previousStatus ===
          HyperliquidProtectiveControlStatus.PLANNED &&
        value.nextStatus ===
          HyperliquidProtectiveControlStatus.EXECUTING &&
        value.resultHash === null
      ) ||
      (
        value.sequence === 3 &&
        value.previousStatus ===
          HyperliquidProtectiveControlStatus.EXECUTING &&
        TERMINAL_CONTROL_STATUSES.has(value.nextStatus) &&
        value.resultHash !== null
      )
    )
  ) {
    fail(
      "invalid_hyperliquid_protective_control_transition_evidence",
      "protective transition evidence is inconsistent"
    );
  }
  const core = {
    transitionId: value.transitionId,
    controlId: value.controlId,
    controlHash: value.controlHash,
    sequence: value.sequence,
    previousStatus: value.previousStatus,
    nextStatus: value.nextStatus,
    resultHash: value.resultHash,
    changedAt: value.changedAt
  };
  if (
    value.transitionHash !==
      hashId("hyperliquid_protective_control_transition", core) ||
    (
      record &&
      (
        value.controlId !== record.controlId ||
        value.controlHash !== record.controlHash ||
        value.sequence > record.version
      )
    )
  ) {
    fail(
      "invalid_hyperliquid_protective_control_transition_evidence",
      "protective transition evidence hash is invalid"
    );
  }
  return value;
}

export class InMemoryHyperliquidRiskGuardianRepository {
  #records = new Map();
  #idempotency = new Map();
  #transitions = new Map();
  #queue = Promise.resolve();

  constructor(snapshot) {
    if (snapshot === undefined) return;
    exactKeys(
      snapshot,
      ["records", "transitions"],
      "invalid_hyperliquid_risk_guardian_repository_snapshot"
    );
    for (const record of snapshot.records) {
      const checked = deepFreeze(structuredClone(record));
      assertProtectiveControlRecord(checked);
      this.#records.set(checked.controlId, checked);
      this.#idempotency.set(checked.idempotencyKeyHash, checked.controlId);
    }
    for (const [controlId, transitions] of snapshot.transitions) {
      const record = this.#records.get(controlId);
      if (
        !record ||
        !Array.isArray(transitions) ||
        transitions.length !== record.version
      ) {
        fail(
          "invalid_hyperliquid_risk_guardian_repository_snapshot",
          "protective transition history is incomplete"
        );
      }
      transitions.forEach((transition) =>
        assertTransitionEvidence(transition, record)
      );
      this.#transitions.set(controlId, structuredClone(transitions));
    }
  }

  #exclusive(operation) {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => {});
    return next;
  }

  async reserve(draft, { nowMs }) {
    return this.#exclusive(async () => {
      const existingId = this.#idempotency.get(draft.idempotencyKeyHash);
      if (existingId) {
        const existing = this.#records.get(existingId);
        if (existing.requestHash !== draft.requestHash) {
          fail(
            "hyperliquid_protective_control_idempotency_conflict",
            "idempotency key is bound to another protective request"
          );
        }
        return { record: existing, replayed: true };
      }
      const record = createPlannedControlRecord(draft, nowMs);
      this.#records.set(record.controlId, record);
      this.#idempotency.set(record.idempotencyKeyHash, record.controlId);
      this.#transitions.set(record.controlId, [
        transitionEvidence(record, null)
      ]);
      return { record, replayed: false };
    });
  }

  async transition({
    controlId,
    expectedStatus,
    nextStatus,
    actionResults,
    verification,
    nowMs
  }) {
    return this.#exclusive(async () => {
      const current = this.#records.get(controlId);
      if (!current || current.status !== expectedStatus) {
        fail(
          "hyperliquid_protective_control_concurrency_conflict",
          "protective control changed or is unavailable"
        );
      }
      const next = transitionHyperliquidProtectiveControl(current, {
        nextStatus,
        actionResults,
        verification,
        nowMs
      });
      this.#records.set(controlId, next);
      this.#transitions
        .get(controlId)
        .push(transitionEvidence(next, current.status));
      return next;
    });
  }

  async findByIdempotencyHash(idempotencyKeyHash) {
    const controlId = this.#idempotency.get(
      hash("idempotencyKeyHash", idempotencyKeyHash)
    );
    const record = controlId ? this.#records.get(controlId) : undefined;
    if (record) assertProtectiveControlRecord(record);
    return record;
  }

  async transitionHistory(controlId) {
    identifier("controlId", controlId);
    const transitions = this.#transitions.get(controlId) ?? [];
    const record = this.#records.get(controlId);
    transitions.forEach((transition) =>
      assertTransitionEvidence(transition, record)
    );
    return structuredClone(transitions);
  }

  exportSnapshot() {
    return deepFreeze({
      records: [...this.#records.values()].map((record) =>
        structuredClone(record)
      ),
      transitions: [...this.#transitions.entries()].map(
        ([controlId, transitions]) => [
          controlId,
          structuredClone(transitions)
        ]
      )
    });
  }
}

export class SimulatedHyperliquidProtectiveExecutor {
  #venue;
  #clock;
  #dispositions;
  #throwAtOrdinal;
  #executionCount = 0;

  constructor({
    venueState,
    clock = Date.now,
    dispositions = [],
    throwAtOrdinal = null,
    ...unknown
  } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !Array.isArray(dispositions) ||
      dispositions.some(
        (value) => !["confirmed", "rejected", "unknown"].includes(value)
      ) ||
      (
        throwAtOrdinal !== null &&
        (!Number.isSafeInteger(throwAtOrdinal) || throwAtOrdinal < 1)
      ) ||
      typeof clock !== "function"
    ) {
      fail(
        "invalid_hyperliquid_protective_executor_configuration",
        "protective executor configuration is invalid"
      );
    }
    this.#venue = structuredClone(assertVenueState(venueState));
    this.#clock = clock;
    this.#dispositions = [...dispositions];
    this.#throwAtOrdinal = throwAtOrdinal;
    this.profile = deepFreeze({
      mode: "narrow_protective_simulation",
      allowedActionKinds: Object.values(HyperliquidProtectiveActionKind),
      arbitraryOrderMethodAvailable: false,
      withdrawalMethodAvailable: false,
      transferMethodAvailable: false,
      accountAdministrationMethodAvailable: false,
      strategyMethodAvailable: false,
      simulationOnly: true,
      networkAvailable: false,
      liveSignerAvailable: false,
      apiWalletApproved: false,
      keyExportable: false,
      schemaVersion: "hyperliquid_testnet_protective_executor_profile.v1"
    });
  }

  async execute(action) {
    this.#executionCount += 1;
    const ordinal = this.#executionCount;
    if (this.#throwAtOrdinal === ordinal) {
      throw new Error("simulated protective executor interruption");
    }
    if (
      !plainObject(action) ||
      !Object.values(HyperliquidProtectiveActionKind).includes(action.kind)
    ) {
      fail(
        "hyperliquid_protective_action_denied",
        "executor accepts only the narrow protective allowlist"
      );
    }
    if (
      action.kind === HyperliquidProtectiveActionKind.REDUCE_ONLY_CLOSE &&
      action.reduceOnly !== true
    ) {
      fail(
        "hyperliquid_protective_action_denied",
        "position close must be server-proven reduce-only"
      );
    }
    const disposition = this.#dispositions[ordinal - 1] ?? "confirmed";
    if (disposition === "confirmed") {
      if (action.kind === HyperliquidProtectiveActionKind.CANCEL) {
        this.#venue.openOrders = this.#venue.openOrders.filter(
          ({ orderId }) => orderId !== action.orderId
        );
      } else if (
        action.kind === HyperliquidProtectiveActionKind.REDUCE_ONLY_CLOSE
      ) {
        this.#venue.positions = this.#venue.positions.filter(
          ({ assetIndex }) => assetIndex !== action.assetIndex
        );
      }
    }
    return deepFreeze({
      actionId: action.actionId,
      actionHash: action.actionHash,
      disposition,
      responseHash: hashId("hyperliquid_simulated_protective_response", {
        actionHash: action.actionHash,
        ordinal,
        disposition
      }),
      simulationOnly: true,
      externalSystemQueried: false,
      externalOrderSubmitted: false
    });
  }

  async snapshot() {
    const nowMs = timestamp(this.#clock);
    return createHyperliquidTestnetVenueState(
      {
        facilityId: this.#venue.facilityId,
        facilityHash: this.#venue.facilityHash,
        sourceInfoSnapshotHash: hashId(
          "hyperliquid_simulated_post_action_info",
          {
            beforeVenueStateHash: this.#venue.venueStateHash,
            openOrders: this.#venue.openOrders,
            positions: this.#venue.positions,
            executionCount: this.#executionCount
          }
        ),
        observedAtMs: nowMs,
        maximumAgeMs: this.#venue.maximumAgeMs,
        openOrders: this.#venue.openOrders,
        positions: this.#venue.positions,
        simulationFixtureOnly: true,
        productionPolicyApproved: false
      },
      { clock: this.#clock }
    );
  }

  get executionCount() {
    return this.#executionCount;
  }
}

export class HyperliquidTestnetRiskGuardian {
  #repository;
  #executor;
  #clock;
  #inflight = new Map();

  constructor({
    repository,
    executor,
    clock = Date.now,
    ...unknown
  } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !repository ||
      typeof repository.reserve !== "function" ||
      typeof repository.transition !== "function" ||
      typeof repository.findByIdempotencyHash !== "function" ||
      !executor ||
      typeof executor.execute !== "function" ||
      typeof executor.snapshot !== "function" ||
      executor.profile?.mode !== "narrow_protective_simulation" ||
      executor.profile?.simulationOnly !== true ||
      executor.profile?.networkAvailable !== false ||
      executor.profile?.liveSignerAvailable !== false ||
      executor.profile?.apiWalletApproved !== false ||
      executor.profile?.arbitraryOrderMethodAvailable !== false ||
      executor.profile?.withdrawalMethodAvailable !== false ||
      executor.profile?.transferMethodAvailable !== false ||
      typeof clock !== "function"
    ) {
      fail(
        "hyperliquid_risk_guardian_runtime_unavailable",
        "only the complete narrow offline Risk Guardian is approved"
      );
    }
    this.#repository = repository;
    this.#executor = executor;
    this.#clock = clock;
  }

  async enforce(input) {
    const draft = createHyperliquidProtectiveControlDraft(input);
    const existing = this.#inflight.get(draft.idempotencyKeyHash);
    if (existing) {
      if (existing.requestHash !== draft.requestHash) {
        fail(
          "hyperliquid_protective_control_idempotency_conflict",
          "idempotency key is bound to another protective request"
        );
      }
      return existing.promise;
    }
    const operation = this.#enforceDraft(draft).finally(() => {
      this.#inflight.delete(draft.idempotencyKeyHash);
    });
    this.#inflight.set(draft.idempotencyKeyHash, {
      requestHash: draft.requestHash,
      promise: operation
    });
    return operation;
  }

  async #enforceDraft(draft) {
    const reservation = await this.#repository.reserve(draft, {
      nowMs: timestamp(this.#clock)
    });
    if (
      reservation.replayed &&
      reservation.record.status !==
        HyperliquidProtectiveControlStatus.PLANNED
    ) {
      return reservation.record;
    }
    const executing = await this.#repository.transition({
      controlId: reservation.record.controlId,
      expectedStatus: HyperliquidProtectiveControlStatus.PLANNED,
      nextStatus: HyperliquidProtectiveControlStatus.EXECUTING,
      actionResults: [],
      verification: null,
      nowMs: timestamp(this.#clock)
    });
    const results = [];
    let forcedUnknown = false;
    for (const action of executing.actions) {
      try {
        const result = actionResult(
          action,
          await this.#executor.execute(action)
        );
        results.push(result);
        if (result.disposition === "unknown") forcedUnknown = true;
      } catch {
        forcedUnknown = true;
        results.push(
          actionResult(action, {
            actionId: action.actionId,
            actionHash: action.actionHash,
            disposition: "unknown",
            responseHash: hashId(
              "hyperliquid_simulated_protective_interruption",
              { actionHash: action.actionHash }
            ),
            simulationOnly: true,
            externalSystemQueried: false,
            externalOrderSubmitted: false
          })
        );
      }
    }
    let afterVenueState = null;
    try {
      afterVenueState = await this.#executor.snapshot();
    } catch {
      forcedUnknown = true;
    }
    if (
      results.some(({ disposition }) => disposition === "unknown")
    ) {
      forcedUnknown = true;
    }
    const verification = createVerification(
      executing,
      afterVenueState,
      timestamp(this.#clock),
      {
        forcedUnknown,
        forcedIncomplete: results.some(
          ({ disposition }) => disposition === "rejected"
        )
      }
    );
    const nextStatus = verification.outcome;
    return this.#repository.transition({
      controlId: executing.controlId,
      expectedStatus: HyperliquidProtectiveControlStatus.EXECUTING,
      nextStatus,
      actionResults: results,
      verification,
      nowMs: timestamp(this.#clock)
    });
  }
}

function controlSqlValues(record) {
  return [
    record.controlId,
    record.controlHash,
    record.requestHash,
    record.idempotencyKeyHash,
    record.facilityId,
    record.facilityHash,
    record.riskSnapshotHash,
    record.beforeVenueStateHash,
    record.targetRiskState,
    record.status,
    record.resultHash,
    JSON.stringify(record),
    record.version,
    record.createdAt,
    record.startedAt,
    record.resolvedAt,
    record.updatedAt,
    record.simulationOnly,
    record.simulationFixtureOnly,
    record.externalSystemQueried,
    record.externalOrderSubmitted,
    record.liveTransportApproved,
    record.liveSignerApproved,
    record.apiWalletApproved,
    record.withdrawalAuthority,
    record.transferAuthority,
    record.accountAdministrationAuthority,
    record.strategyAuthority,
    record.economicRepricingAuthority,
    record.automaticRecovery,
    record.mainnetAuthority,
    record.productionAuthority,
    record.fundsAuthority,
    record.secretsIncluded,
    record.schemaVersion
  ];
}

async function insertControlTransition(client, record, previousStatus) {
  const transition = transitionEvidence(record, previousStatus);
  await client.query(
    `INSERT INTO trading_testnet_protective_transitions (
       id,
       control_id,
       control_hash,
       transition_hash,
       sequence,
       previous_status,
       next_status,
       result_hash,
       changed_at,
       transition,
       simulation_only,
       secrets_included,
       schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, $11, $12, $13
     )`,
    [
      transition.transitionId,
      transition.controlId,
      transition.controlHash,
      transition.transitionHash,
      transition.sequence,
      transition.previousStatus,
      transition.nextStatus,
      transition.resultHash,
      transition.changedAt,
      JSON.stringify(transition),
      transition.simulationOnly,
      transition.secretsIncluded,
      transition.schemaVersion
    ]
  );
}

export class PostgresHyperliquidRiskGuardianRepository {
  #eventRepository;

  constructor({ eventRepository, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !eventRepository ||
      typeof eventRepository.withTenantWrite !== "function" ||
      typeof eventRepository.withTenantRead !== "function"
    ) {
      fail(
        "invalid_hyperliquid_risk_guardian_repository",
        "a tenant-scoped PostgreSQL Event Repository is required"
      );
    }
    this.#eventRepository = eventRepository;
  }

  async #withWrite(operation) {
    for (let attempt = 0; attempt <= 5; attempt += 1) {
      try {
        return await this.#eventRepository.withTenantWrite(operation);
      } catch (error) {
        if (!["40001", "40P01"].includes(error.code) || attempt === 5) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 5 * (attempt + 1))
        );
      }
    }
    fail(
      "hyperliquid_risk_guardian_transaction_retry_exhausted",
      "protective control transaction retry budget was exhausted"
    );
  }

  async reserve(draft, { nowMs }) {
    return this.#withWrite(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [draft.idempotencyKeyHash]
      );
      const existing = await client.query(
        `SELECT request_hash, record
           FROM trading_testnet_protective_controls
          WHERE idempotency_key_hash = $1
          FOR UPDATE`,
        [draft.idempotencyKeyHash]
      );
      if (existing.rowCount === 1) {
        if (existing.rows[0].request_hash !== draft.requestHash) {
          fail(
            "hyperliquid_protective_control_idempotency_conflict",
            "idempotency key is bound to another protective request"
          );
        }
        const record = deepFreeze(structuredClone(existing.rows[0].record));
        assertProtectiveControlRecord(record);
        return {
          record,
          replayed: true
        };
      }
      const record = createPlannedControlRecord(draft, nowMs);
      await client.query(
        `INSERT INTO trading_testnet_protective_controls (
           id,
           control_hash,
           request_hash,
           idempotency_key_hash,
           facility_id,
           facility_hash,
           risk_snapshot_hash,
           before_venue_state_hash,
           target_risk_state,
           status,
           result_hash,
           record,
           version,
           created_at,
           started_at,
           resolved_at,
           updated_at,
           simulation_only,
           simulation_fixture_only,
           external_system_queried,
           external_order_submitted,
           live_transport_approved,
           live_signer_approved,
           api_wallet_approved,
           withdrawal_authority,
           transfer_authority,
           account_administration_authority,
           strategy_authority,
           economic_repricing_authority,
           automatic_recovery,
           mainnet_authority,
           production_authority,
           funds_authority,
           secrets_included,
           schema_version
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12::JSONB, $13, $14, $15, $16, $17, $18, $19, $20,
           $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
           $31, $32, $33, $34, $35
         )`,
        controlSqlValues(record)
      );
      await insertControlTransition(client, record, null);
      return { record, replayed: false };
    });
  }

  async transition({
    controlId,
    expectedStatus,
    nextStatus,
    actionResults,
    verification,
    nowMs
  }) {
    return this.#withWrite(async (client) => {
      const result = await client.query(
        `SELECT record
           FROM trading_testnet_protective_controls
          WHERE id = $1
          FOR UPDATE`,
        [controlId]
      );
      if (
        result.rowCount !== 1 ||
        result.rows[0].record.status !== expectedStatus
      ) {
        fail(
          "hyperliquid_protective_control_concurrency_conflict",
          "protective control changed or is unavailable"
        );
      }
      const current = result.rows[0].record;
      assertProtectiveControlRecord(current);
      const next = transitionHyperliquidProtectiveControl(current, {
        nextStatus,
        actionResults,
        verification,
        nowMs
      });
      await client.query(
        `UPDATE trading_testnet_protective_controls
            SET status = $2,
                result_hash = $3,
                record = $4::JSONB,
                version = $5,
                started_at = $6,
                resolved_at = $7,
                updated_at = $8
          WHERE id = $1`,
        [
          next.controlId,
          next.status,
          next.resultHash,
          JSON.stringify(next),
          next.version,
          next.startedAt,
          next.resolvedAt,
          next.updatedAt
        ]
      );
      await insertControlTransition(client, next, current.status);
      return next;
    });
  }

  async findByIdempotencyHash(idempotencyKeyHash) {
    hash("idempotencyKeyHash", idempotencyKeyHash);
    return this.#eventRepository.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT record
           FROM trading_testnet_protective_controls
          WHERE idempotency_key_hash = $1`,
        [idempotencyKeyHash]
      );
      if (result.rowCount !== 1) return undefined;
      const record = deepFreeze(structuredClone(result.rows[0].record));
      assertProtectiveControlRecord(record);
      return record;
    });
  }

  async transitionHistory(controlId) {
    identifier("controlId", controlId);
    return this.#eventRepository.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT transition
           FROM trading_testnet_protective_transitions
          WHERE control_id = $1
          ORDER BY sequence`,
        [controlId]
      );
      return result.rows.map(({ transition }) => {
        assertTransitionEvidence(transition);
        return structuredClone(transition);
      });
    });
  }
}
