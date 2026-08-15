import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import {
  PrincipalStatus,
  SubjectStatus,
  SubjectType
} from "./enums.js";
import { assertNoRawPiiReference } from "./validators.js";

export const TRADING_REAL_CREDIT_PROFILE_SCHEMA_VERSION =
  "trading_credit_profile.v2";
export const TRADING_REAL_HISTORY_IMPORT_SCHEMA_VERSION =
  "trading_real_history_import.v1";
export const TRADING_REAL_EVIDENCE_POLICY_VERSION =
  "trading_real_evidence_policy.v1";
export const TRADING_REAL_SHADOW_RISK_POLICY_VERSION =
  "trading_real_shadow_risk_policy.v1";
export const TRADING_REAL_SHADOW_RISK_SCHEMA_VERSION =
  "trading_real_shadow_risk_profile.v1";

const HASH = /^0x[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]{0,77})(?:\.[0-9]{1,18})?$/;
const ACTIVE_SUBJECT_STATUSES = new Set([
  SubjectStatus.PENDING,
  SubjectStatus.ACTIVE
]);
const SCALE = 10n ** 18n;

function fail(message) {
  throw new DomainError("invalid_trading_real_evidence", message);
}

function plainObject(name, value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${name} is invalid`);
  }
  return value;
}

function exactObject(name, value, keys) {
  plainObject(name, value);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${name} has an open shape`);
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail(`${name} is invalid`);
  }
  return value;
}

function safeId(name, value) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail(`${name} is invalid`);
  }
  return value;
}

function timestamp(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    fail(`${name} is invalid`);
  }
  return value;
}

function positiveInteger(name, value, maximum = 1_000_000) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(`${name} is invalid`);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function scaledDecimal(name, value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    fail(`${name} is invalid`);
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const result =
    BigInt(whole) * SCALE +
    BigInt((fraction + "0".repeat(18)).slice(0, 18));
  return negative ? -result : result;
}

function decimalString(value) {
  const negative = value < 0n;
  const unsigned = negative ? -value : value;
  const whole = unsigned / SCALE;
  const fraction = (unsigned % SCALE)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function decimalRatio(numerator, denominator) {
  if (denominator === 0n) return undefined;
  return decimalString((numerator * SCALE) / denominator);
}

function nonNegativeDecimal(name, value) {
  const parsed = scaledDecimal(name, value);
  if (parsed < 0n) fail(`${name} is negative`);
  return parsed;
}

function feature(
  featureId,
  state,
  reasonCodes,
  {
    value,
    unit,
    definitionVersion = `trading_shadow_feature.${featureId}.v1`
  } = {}
) {
  return {
    featureId,
    state,
    ...(value === undefined ? {} : { value }),
    ...(unit === undefined ? {} : { unit }),
    reasonCodes,
    authorizing: false,
    definitionVersion
  };
}

function shadowRiskProfile(profile, evidenceSnapshot, now) {
  const history = profile.historyImport;
  const { metrics, observationWindow, dataQuality } = history;
  const realizedPnl = scaledDecimal(
    "historyImport.metrics.realizedPnl",
    metrics.realizedPnl
  );
  const feesPaid = scaledDecimal(
    "historyImport.metrics.feesPaid",
    metrics.feesPaid
  );
  const tradedNotional = nonNegativeDecimal(
    "historyImport.metrics.tradedNotional",
    metrics.tradedNotional
  );
  const accountValue = scaledDecimal(
    "historyImport.metrics.currentAccountValue",
    metrics.currentAccountValue
  );
  const withdrawable = scaledDecimal(
    "historyImport.metrics.currentWithdrawable",
    metrics.currentWithdrawable
  );
  const netRealizedPnl = realizedPnl - feesPaid;
  const netReturnProxy = decimalRatio(netRealizedPnl, tradedNotional);
  const feeRatio = decimalRatio(feesPaid, tradedNotional);
  const positiveFillRate =
    metrics.uniqueFillCount === 0
      ? undefined
      : decimalRatio(
          BigInt(metrics.positiveRealizedFillCount) * SCALE,
          BigInt(metrics.uniqueFillCount) * SCALE
        );
  const withdrawableRatio =
    accountValue <= 0n
      ? undefined
      : decimalRatio(withdrawable, accountValue);
  const sourceState =
    dataQuality.freshness === "stale" ? "stale" : "observed";
  const sourceStateReasons =
    sourceState === "stale"
      ? ["current_account_snapshot_stale"]
      : ["verified_read_only_evidence"];
  const features = [
    feature(
      "net_realized_pnl",
      "observed",
      ["verified_bounded_fill_history"],
      { value: decimalString(netRealizedPnl), unit: "venue_quote_asset" }
    ),
    feature(
      "net_return_on_traded_notional",
      netReturnProxy === undefined ? "insufficient" : "observed",
      netReturnProxy === undefined
        ? ["zero_traded_notional"]
        : ["descriptive_proxy_not_risk_adjusted_return"],
      netReturnProxy === undefined
        ? {}
        : { value: netReturnProxy, unit: "ratio" }
    ),
    feature(
      "positive_realized_fill_rate",
      positiveFillRate === undefined ? "insufficient" : "observed",
      positiveFillRate === undefined
        ? ["no_verified_fills"]
        : ["fill_level_proxy_not_strategy_win_rate"],
      positiveFillRate === undefined
        ? {}
        : { value: positiveFillRate, unit: "ratio" }
    ),
    feature(
      "fee_to_traded_notional",
      feeRatio === undefined ? "insufficient" : "observed",
      feeRatio === undefined
        ? ["zero_traded_notional"]
        : ["verified_bounded_fill_history"],
      feeRatio === undefined ? {} : { value: feeRatio, unit: "ratio" }
    ),
    feature("market_count", "observed", ["verified_bounded_fill_history"], {
      value: String(metrics.marketCount),
      unit: "count"
    }),
    feature(
      "traded_notional",
      "observed",
      ["verified_bounded_fill_history"],
      { value: metrics.tradedNotional, unit: "venue_quote_asset" }
    ),
    feature(
      "current_withdrawable_ratio",
      withdrawableRatio === undefined ? "insufficient" : sourceState,
      withdrawableRatio === undefined
        ? ["non_positive_account_value"]
        : sourceStateReasons,
      withdrawableRatio === undefined
        ? {}
        : { value: withdrawableRatio, unit: "ratio" }
    ),
    feature(
      "current_position_count",
      sourceState,
      sourceStateReasons,
      {
        value: String(metrics.currentPositionCount),
        unit: "count"
      }
    ),
    feature(
      "current_open_order_count",
      sourceState,
      sourceStateReasons,
      {
        value: String(metrics.currentOpenOrderCount),
        unit: "count"
      }
    ),
    feature("risk_adjusted_return", "insufficient", [
      "return_time_series_unavailable",
      "volatility_window_unavailable"
    ]),
    feature("maximum_drawdown", "insufficient", [
      "equity_time_series_unavailable"
    ]),
    feature("tail_loss", "insufficient", [
      "tail_observation_window_unavailable"
    ]),
    feature("current_leverage", "insufficient", [
      "position_notional_snapshot_not_persisted"
    ]),
    feature("liquidation_discipline", "unknown", [
      "liquidation_history_unavailable"
    ]),
    feature("strategy_capacity", "insufficient", [
      "market_impact_unverified",
      "capacity_policy_not_approved"
    ]),
    feature("regime_stability", "insufficient", [
      "regime_labels_unavailable",
      "out_of_time_window_unavailable"
    ])
  ];
  const observedStartsAt = timestamp(
    "historyImport.observationWindow.startsAt",
    observationWindow.startsAt
  );
  const observedEndsAt = timestamp(
    "historyImport.observationWindow.endsAt",
    observationWindow.endsAt
  );
  const generatedAt = new Date(now).toISOString();
  const core = {
    historyHash: history.historyHash,
    evidenceSnapshotHash: evidenceSnapshot.snapshotHash,
    policyVersion: TRADING_REAL_SHADOW_RISK_POLICY_VERSION,
    observedStartsAt,
    observedEndsAt,
    sourceFreshness: dataQuality.freshness,
    features
  };
  return {
    shadowRiskProfileId: createOperationalId("trading_shadow_risk_profile"),
    shadowRiskProfileHash: hashId("trading_real_shadow_risk_profile", core),
    policyVersion: TRADING_REAL_SHADOW_RISK_POLICY_VERSION,
    featureDefinitionsVersion: "trading_shadow_feature_definitions.v1",
    historyHash: history.historyHash,
    evidenceSnapshotHash: evidenceSnapshot.snapshotHash,
    pointInTime: {
      observedStartsAt,
      observedEndsAt,
      generatedAt,
      sourceFreshness: dataQuality.freshness,
      temporalState:
        dataQuality.freshness === "stale" ? "stale" : "unknown",
      maxAgePolicyApproved: false,
      antiLeakagePassed: true,
      reasonCodes:
        dataQuality.freshness === "stale"
          ? [
              "source_reported_stale",
              "approved_max_age_policy_unavailable"
            ]
          : ["approved_max_age_policy_unavailable"],
      schemaVersion: "trading_shadow_point_in_time.v1"
    },
    features,
    stressWindows: [
      {
        windowId: "observed_history",
        state: "observed",
        startsAt: observedStartsAt,
        endsAt: observedEndsAt,
        reasonCodes: ["bounded_venue_history_only"]
      },
      {
        windowId: "out_of_time",
        state: "insufficient",
        startsAt: null,
        endsAt: null,
        reasonCodes: ["future_outcome_window_unavailable"]
      },
      {
        windowId: "tail_stress",
        state: "insufficient",
        startsAt: null,
        endsAt: null,
        reasonCodes: [
          "equity_time_series_unavailable",
          "approved_stress_definition_unavailable"
        ]
      }
    ],
    driftMonitor: {
      state: "insufficient",
      priorSnapshotAvailable: false,
      approvedBaselineAvailable: false,
      reasonCodes: [
        "prior_point_in_time_snapshot_unavailable",
        "approved_drift_threshold_unavailable"
      ],
      authorizing: false,
      schemaVersion: "trading_shadow_drift_monitor.v1"
    },
    modelOutput: false,
    recommendationOnly: true,
    authorizing: false,
    economicStateMutation: false,
    newRiskAuthority: false,
    fundsAuthority: false,
    schemaVersion: TRADING_REAL_SHADOW_RISK_SCHEMA_VERSION
  };
}

export function compareRealTradingShadowRiskWithFixture({
  observedProfile,
  syntheticFixtureProfile
}) {
  for (const [name, profile] of [
    ["observedProfile", observedProfile],
    ["syntheticFixtureProfile", syntheticFixtureProfile]
  ]) {
    plainObject(name, profile);
    if (
      profile.schemaVersion !== TRADING_REAL_SHADOW_RISK_SCHEMA_VERSION ||
      profile.authorizing !== false ||
      profile.economicStateMutation !== false ||
      !Array.isArray(profile.features)
    ) {
      fail(`${name} is not a non-authorizing Shadow Risk profile`);
    }
  }
  const syntheticById = new Map(
    syntheticFixtureProfile.features.map((item) => [item.featureId, item])
  );
  const comparisons = observedProfile.features.map((observed) => {
    const reference = syntheticById.get(observed.featureId);
    const comparable =
      reference !== undefined &&
      observed.state === "observed" &&
      reference.state === "observed" &&
      observed.value !== undefined &&
      reference.value !== undefined &&
      observed.unit === reference.unit;
    return {
      featureId: observed.featureId,
      observedState: observed.state,
      fixtureState: reference?.state ?? "missing",
      comparable,
      ...(comparable
        ? {
            descriptiveDelta: decimalString(
              scaledDecimal("observed feature value", observed.value) -
                scaledDecimal("fixture feature value", reference.value)
            ),
            unit: observed.unit
          }
        : {}),
      authorizing: false
    };
  });
  return {
    observedProfileHash: hash(
      "observedProfile.shadowRiskProfileHash",
      observedProfile.shadowRiskProfileHash
    ),
    syntheticFixtureProfileHash: hash(
      "syntheticFixtureProfile.shadowRiskProfileHash",
      syntheticFixtureProfile.shadowRiskProfileHash
    ),
    comparisons,
    comparableFeatureCount: comparisons.filter(({ comparable }) => comparable)
      .length,
    decisionPerformed: false,
    thresholdApplied: false,
    authorizing: false,
    schemaVersion: "trading_shadow_risk_fixture_comparison.v1"
  };
}

function commonSafety(profile) {
  if (
    profile.sandboxOnly !== true ||
    profile.syntheticOnly !== false ||
    profile.testnetOnly !== true ||
    profile.realFunds !== false ||
    profile.productionAuthority !== false ||
    profile.fundsAuthority !== false ||
    profile.creditApproval !== false ||
    profile.universalScoreAvailable !== false ||
    profile.rawStrategyIncluded !== false ||
    profile.rawTransactionsIncluded !== false ||
    profile.piiIncluded !== false ||
    profile.secretsIncluded !== false ||
    profile.schemaVersion !== TRADING_REAL_CREDIT_PROFILE_SCHEMA_VERSION
  ) {
    fail("real-read Trading Credit Profile safety boundary is invalid");
  }
  return profile;
}

function currentProfile(profile, stage) {
  plainObject("profile", profile);
  commonSafety(profile);
  if (profile.stage !== stage) fail("profile stage is invalid");
  hash("accountReferenceHash", profile.accountReferenceHash);
  positiveInteger("bindingEpoch", profile.bindingEpoch);
  positiveInteger("version", profile.version);
  return profile;
}

function operatorType(subjectType) {
  if (subjectType === SubjectType.HUMAN) return "human_trader";
  if (subjectType === SubjectType.AGENT) return "agent_operator";
  fail("Subject type is not eligible for real-read Trading Evidence");
}

function challengeFromDescriptor({
  bindingDescriptor,
  tenantHash,
  subjectHash,
  principalHash,
  bindingEpoch
}) {
  exactObject("bindingDescriptor", bindingDescriptor, [
    "challengeHash",
    "challengeId",
    "chainId",
    "environment",
    "expiresAt",
    "infoProfileId",
    "issuedAt",
    "masterAddressHash",
    "nonceHash",
    "subaccountAddressHash",
    "typedDataHash"
  ]);
  if (
    bindingDescriptor.chainId !== "eip155:998" ||
    bindingDescriptor.environment !== "hyperliquid_testnet" ||
    bindingDescriptor.infoProfileId !== "hyperliquid_testnet_info.v1" ||
    bindingDescriptor.masterAddressHash ===
      bindingDescriptor.subaccountAddressHash
  ) {
    fail("binding descriptor environment or account roles are invalid");
  }
  const issuedAt = timestamp("bindingDescriptor.issuedAt", bindingDescriptor.issuedAt);
  const expiresAt = timestamp(
    "bindingDescriptor.expiresAt",
    bindingDescriptor.expiresAt
  );
  if (new Date(expiresAt) <= new Date(issuedAt)) {
    fail("binding challenge expiry must follow issuance");
  }
  return {
    challengeId: safeId("challengeId", bindingDescriptor.challengeId),
    challengeHash: hash("challengeHash", bindingDescriptor.challengeHash),
    nonceHash: hash("nonceHash", bindingDescriptor.nonceHash),
    typedDataHash: hash("typedDataHash", bindingDescriptor.typedDataHash),
    tenantHash: hash("tenantHash", tenantHash),
    subjectHash: hash("subjectHash", subjectHash),
    principalHash: hash("principalHash", principalHash),
    masterAddressHash: hash(
      "masterAddressHash",
      bindingDescriptor.masterAddressHash
    ),
    subaccountAddressHash: hash(
      "subaccountAddressHash",
      bindingDescriptor.subaccountAddressHash
    ),
    chainId: bindingDescriptor.chainId,
    environment: bindingDescriptor.environment,
    infoProfileId: bindingDescriptor.infoProfileId,
    bindingEpoch,
    issuedAt,
    expiresAt,
    status: "pending",
    oneUse: true,
    bindingMethod: "eip712_eoa_master_v1",
    accountOwnershipVerified: false,
    relationshipVerified: false,
    reusableSignatureIncluded: false,
    rawSignaturePersisted: false,
    schemaVersion: "trading_real_binding_challenge.v1"
  };
}

export function createRealTradingAccountBindingChallenge({
  tenantId,
  subject,
  principal,
  requestedByActorId,
  bindingDescriptor,
  existingProfile,
  now = new Date()
}) {
  if (
    typeof tenantId !== "string" ||
    tenantId.length < 1 ||
    tenantId.length > 256 ||
    typeof requestedByActorId !== "string" ||
    requestedByActorId.length < 1 ||
    requestedByActorId.length > 256
  ) {
    fail("challenge identity is invalid");
  }
  plainObject("subject", subject);
  plainObject("principal", principal);
  if (
    ![SubjectType.HUMAN, SubjectType.AGENT].includes(subject.subjectType) ||
    !ACTIVE_SUBJECT_STATUSES.has(subject.status) ||
    subject.primaryPrincipalId !== principal.principalId ||
    principal.status !== PrincipalStatus.ACTIVE
  ) {
    fail("Subject and Principal are not eligible for real-read Trading Evidence");
  }
  const actorHash = hashId("actor", requestedByActorId);
  const tenantHash = hashId("tenant", tenantId);
  const subjectHash = hashId("subject", subject.subjectId);
  const principalHash = hashId("principal", principal.principalId);
  const isRebinding = existingProfile !== undefined;
  if (isRebinding) {
    const current = currentProfile(existingProfile, "finalized");
    if (
      current.subjectId !== subject.subjectId ||
      current.principalId !== principal.principalId ||
      current.requestedByActorHash !== actorHash ||
      current.evidenceAuthority?.active !== true ||
      current.accountBinding?.status !== "active"
    ) {
      fail("existing Trading Evidence is not eligible for rebinding");
    }
  }
  const bindingEpoch = isRebinding ? existingProfile.bindingEpoch + 1 : 1;
  const challenge = challengeFromDescriptor({
    bindingDescriptor,
    tenantHash,
    subjectHash,
    principalHash,
    bindingEpoch
  });
  const createdAt = isRebinding
    ? existingProfile.createdAt
    : new Date(now).toISOString();
  const profileId = isRebinding
    ? existingProfile.tradingCreditProfileId
    : createOperationalId("trading_credit_profile");
  const accountReferenceHash = isRebinding
    ? existingProfile.accountReferenceHash
    : hashId("trading_real_account_reference", {
        tenantHash,
        subjectHash,
        principalHash,
        environment: "hyperliquid_testnet"
      });
  const priorEvidenceInvalidation = isRebinding
    ? {
        bindingEpoch: existingProfile.bindingEpoch,
        accountBindingHash: existingProfile.accountBinding.accountBindingHash,
        evidenceSnapshotHash:
          existingProfile.evidenceSnapshot.snapshotHash,
        invalidatedAt: new Date(now).toISOString(),
        reasonCode: "rebinding_challenge_created",
        active: false,
        schemaVersion: "trading_evidence_invalidation.v1"
      }
    : undefined;
  const profile = {
    tradingCreditProfileId: profileId,
    subjectId: subject.subjectId,
    principalId: principal.principalId,
    subjectType: subject.subjectType,
    operatorType: operatorType(subject.subjectType),
    requestedByActorHash: actorHash,
    accountReferenceHash,
    bindingEpoch,
    stage: "challenge_pending",
    bindingChallenge: challenge,
    evidenceAuthority: {
      bindingEpoch,
      active: false,
      authorizing: false,
      reasonCode: isRebinding
        ? "prior_evidence_invalidated_for_rebinding"
        : "binding_pending",
      schemaVersion: "trading_evidence_authority.v1"
    },
    ...(priorEvidenceInvalidation === undefined
      ? {}
      : { priorEvidenceInvalidation }),
    version: isRebinding ? existingProfile.version + 1 : 1,
    createdAt,
    updatedAt: new Date(now).toISOString(),
    sandboxOnly: true,
    syntheticOnly: false,
    testnetOnly: true,
    realFunds: false,
    productionAuthority: false,
    fundsAuthority: false,
    creditApproval: false,
    universalScoreAvailable: false,
    externalSystemQueried:
      isRebinding && existingProfile.externalSystemQueried === true,
    rawStrategyIncluded: false,
    rawTransactionsIncluded: false,
    piiIncluded: false,
    secretsIncluded: false,
    schemaVersion: TRADING_REAL_CREDIT_PROFILE_SCHEMA_VERSION
  };
  assertNoRawPiiReference(profile, "tradingRealCreditProfile");
  return profile;
}

function assertBindingProof(value, challenge) {
  exactObject("bindingProof", value, [
    "chainId",
    "environment",
    "masterAddressHash",
    "proofHash",
    "rawSignaturePersisted",
    "reusableSignature",
    "schemaVersion",
    "typedDataHash",
    "verificationMethod"
  ]);
  if (
    value.schemaVersion !== "hyperliquid_binding_proof_result.v1" ||
    value.chainId !== challenge.chainId ||
    value.environment !== challenge.environment ||
    value.masterAddressHash !== challenge.masterAddressHash ||
    value.typedDataHash !== challenge.typedDataHash ||
    value.verificationMethod !== "eip712_eoa_master_v1" ||
    value.rawSignaturePersisted !== false ||
    value.reusableSignature !== false
  ) {
    fail("binding proof does not match the durable challenge");
  }
  hash("bindingProof.proofHash", value.proofHash);
  return value;
}

function assertRelationship(value, challenge) {
  plainObject("relationship", value);
  if (
    value.schemaVersion !== "hyperliquid_account_relationship.v1" ||
    value.profileId !== challenge.infoProfileId ||
    value.environment !== "testnet" ||
    value.masterAddressHash !== challenge.masterAddressHash ||
    value.subaccountAddressHash !== challenge.subaccountAddressHash ||
    value.masterRole !== "user" ||
    value.subaccountRole !== "subAccount" ||
    value.relationshipVerified !== true ||
    value.apiWalletAddressAccepted !== false ||
    value.readOnly !== true ||
    value.testnetOnly !== true ||
    value.externalOrderSubmitted !== false ||
    value.signerAvailable !== false ||
    value.credentialsUsed !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false
  ) {
    fail("master/subaccount relationship Evidence is invalid");
  }
  hash("relationship.relationshipHash", value.relationshipHash);
  hash("relationship.sourceResponseHashes.masterUserRole",
    value.sourceResponseHashes?.masterUserRole);
  hash("relationship.sourceResponseHashes.subaccountUserRole",
    value.sourceResponseHashes?.subaccountUserRole);
  hash("relationship.sourceResponseHashes.subAccounts",
    value.sourceResponseHashes?.subAccounts);
  return value;
}

function assertHistory(value, challenge) {
  plainObject("history", value);
  if (
    value.schemaVersion !== "hyperliquid_fill_history.v1" ||
    value.profileId !== challenge.infoProfileId ||
    value.environment !== "testnet" ||
    value.accountAddressHash !== challenge.subaccountAddressHash ||
    value.readOnly !== true ||
    value.testnetOnly !== true ||
    value.externalOrderSubmitted !== false ||
    value.signerAvailable !== false ||
    value.credentialsUsed !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.eventHashes) ||
    value.events.length !== value.eventHashes.length ||
    value.events.length > 10_000 ||
    new Set(value.eventHashes).size !== value.eventHashes.length
  ) {
    fail("Hyperliquid fill-history Evidence is invalid");
  }
  hash("history.historyManifestHash", value.historyManifestHash);
  for (const eventHash of value.eventHashes) hash("history.eventHash", eventHash);
  return value;
}

function assertSnapshot(value, challenge) {
  plainObject("snapshot", value);
  if (
    value.schemaVersion !== "hyperliquid_info_account_snapshot.v1" ||
    value.profileId !== challenge.infoProfileId ||
    value.environment !== "testnet" ||
    value.accountRole !== "subaccount" ||
    value.accountAddressHash !== challenge.subaccountAddressHash ||
    value.verifiedMasterAddressHash !== challenge.masterAddressHash ||
    value.accountRoleVerified !== true ||
    value.readOnly !== true ||
    value.testnetOnly !== true ||
    value.externalOrderSubmitted !== false ||
    value.signerAvailable !== false ||
    value.credentialsUsed !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false
  ) {
    fail("current Hyperliquid account snapshot is invalid");
  }
  hash("snapshot.sourceBundleHash", value.sourceBundleHash);
  hash("snapshot.snapshotHash", value.snapshotHash);
  return value;
}

function aggregateMetrics(events, snapshot) {
  let realizedPnl = 0n;
  let fees = 0n;
  let tradedNotional = 0n;
  let positiveRealizedFillCount = 0;
  const markets = new Set();
  for (const fill of events) {
    plainObject("fill", fill);
    const pnl = scaledDecimal("fill.closedPnl", fill.closedPnl);
    const fee = scaledDecimal("fill.fee", fill.fee);
    const price = scaledDecimal("fill.price", fill.price);
    const size = scaledDecimal("fill.size", fill.size);
    realizedPnl += pnl;
    fees += fee;
    tradedNotional += ((price < 0n ? -price : price) *
      (size < 0n ? -size : size)) / SCALE;
    if (pnl > 0n) positiveRealizedFillCount += 1;
    if (typeof fill.coin !== "string" || fill.coin.length > 64) {
      fail("fill market is invalid");
    }
    markets.add(fill.coin);
  }
  return {
    uniqueFillCount: events.length,
    positiveRealizedFillCount,
    marketCount: markets.size,
    realizedPnl: decimalString(realizedPnl),
    feesPaid: decimalString(fees),
    tradedNotional: decimalString(tradedNotional),
    currentAccountValue: snapshot.equity.accountValue,
    currentWithdrawable: snapshot.equity.withdrawable,
    currentPositionCount: snapshot.counts.positions,
    currentOpenOrderCount: snapshot.counts.openOrders
  };
}

function factor(factorId, assessment, reasonCodes, inputMetricIds) {
  return {
    factorId,
    assessment,
    reasonCodes,
    inputMetricIds,
    numericScoreAvailable: false,
    authorizing: false,
    schemaVersion: "trading_factor_assessment.v1"
  };
}

function realFactorScorecard(profile, evidenceSnapshot, now) {
  const quality = profile.historyImport.dataQuality;
  const shadowRisk = shadowRiskProfile(profile, evidenceSnapshot, now);
  const factors = [
    factor(
      "alpha_quality",
      "limited",
      [
        "bounded_venue_history_only",
        "risk_adjusted_return_unavailable",
        "no_regime_attribution"
      ],
      [
        "net_realized_pnl",
        "net_return_on_traded_notional",
        "positive_realized_fill_rate"
      ]
    ),
    factor(
      "risk_reliability",
      "insufficient",
      [
        "maximum_drawdown_unavailable",
        "tail_loss_unavailable",
        "liquidation_history_unavailable",
        "current_leverage_unavailable"
      ],
      [
        "current_position_count",
        "maximum_drawdown",
        "tail_loss",
        "liquidation_discipline",
        "current_leverage"
      ]
    ),
    factor(
      "strategy_capacity",
      "insufficient",
      [
        "market_impact_unverified",
        "capacity_policy_not_approved",
        "venue_survivorship_limit"
      ],
      ["market_count", "traded_notional", "strategy_capacity"]
    ),
    factor(
      "mandate_compliance",
      "insufficient",
      ["trading_mandate_not_evaluated", "counterparty_lineage_unavailable"],
      ["wallet_cluster_flag", "self_transfer_flag", "wash_trading_flag"]
    ),
    factor(
      "evidence_confidence",
      quality.completeness === "complete" ? "limited" : "insufficient",
      quality.anomalyCodes,
      [
        "pagination_complete",
        "snapshot_freshness",
        "reconciliation_status",
        "drift_monitor"
      ]
    )
  ];
  const core = {
    subjectId: profile.subjectId,
    principalId: profile.principalId,
    historyHash: profile.historyImport.historyHash,
    snapshotHash: evidenceSnapshot.snapshotHash,
    policyVersion: TRADING_REAL_SHADOW_RISK_POLICY_VERSION,
    shadowRiskProfileHash: shadowRisk.shadowRiskProfileHash,
    factors
  };
  return {
    scorecardId: createOperationalId("trading_factor_scorecard"),
    scorecardHash: hashId("trading_real_factor_scorecard", core),
    policyVersion: TRADING_REAL_SHADOW_RISK_POLICY_VERSION,
    factors,
    shadowRisk,
    compositeScore: {
      available: false,
      reasonCode: "universal_score_prohibited"
    },
    creditDecision: {
      performed: false,
      reasonCode: "single_snapshot_capital_decision_prohibited"
    },
    recommendedLimit: {
      available: false,
      reasonCode: "risk_limit_not_approved"
    },
    pricing: {
      available: false,
      reasonCode: "pricing_not_approved"
    },
    newRiskAuthority: false,
    fundsAuthority: false,
    generatedAt: new Date(now).toISOString(),
    schemaVersion: "trading_real_factor_scorecard.v2"
  };
}

export function importRealTradingHistory({
  profile,
  requestedByActorId,
  bindingProof,
  relationship,
  history,
  currentSnapshot,
  challengeEventId,
  challengeEvidenceHash,
  now = new Date()
}) {
  const current = currentProfile(profile, "challenge_pending");
  if (
    current.bindingChallenge.status !== "pending" ||
    new Date(current.bindingChallenge.expiresAt) <= now ||
    current.requestedByActorHash !== hashId("actor", requestedByActorId)
  ) {
    fail("binding challenge is not current for the requesting Actor");
  }
  safeId("challengeEventId", challengeEventId);
  hash("challengeEvidenceHash", challengeEvidenceHash);
  const proof = assertBindingProof(bindingProof, current.bindingChallenge);
  const checkedRelationship = assertRelationship(
    relationship,
    current.bindingChallenge
  );
  const checkedHistory = assertHistory(history, current.bindingChallenge);
  const snapshot = assertSnapshot(currentSnapshot, current.bindingChallenge);
  if (
    new Date(checkedHistory.windowEndsAt) > new Date(snapshot.observedAt) ||
    checkedHistory.events.some(
      ({ timestamp: fillTime }) =>
        new Date(fillTime) > new Date(snapshot.observedAt)
    )
  ) {
    fail("fill history cannot be reconciled to an earlier account snapshot");
  }
  const anomalyCodes = [
    ...checkedHistory.dataGapCodes,
    ...(snapshot.freshness === "fresh"
      ? []
      : ["current_account_snapshot_stale"]),
    "counterparty_addresses_unavailable",
    "funding_and_transfer_history_not_imported",
    "wallet_cluster_analysis_unavailable",
    "self_transfer_analysis_unavailable",
    "wash_trading_analysis_unavailable"
  ];
  const uniqueAnomalyCodes = [...new Set(anomalyCodes)].sort();
  // Venue fills do not include transfer, funding, liquidation, counterparty,
  // or wallet-cluster lineage. A successful bounded read is therefore still
  // partial Evidence and must never be represented as complete.
  const completeness = "partial";
  const dataQuality = {
    completeness,
    confidence: "external_read_only_partial",
    freshness: snapshot.freshness,
    stalenessReason:
      snapshot.freshness === "fresh"
        ? null
        : "current_account_snapshot_stale",
    sourceFinality: "venue_read_only_observation",
    paginationComplete: checkedHistory.paginationComplete,
    paginationStalled: checkedHistory.paginationStalled,
    pageLimitReached: checkedHistory.pageLimitReached,
    sourceRetentionLimitReached:
      checkedHistory.sourceRetentionLimitReached,
    venueMostRecentFillLimit:
      checkedHistory.sourceLimits.venueMostRecentFillLimit,
    missingFields: [
      "counterparty_address",
      "funding_history",
      "transfer_history",
      "liquidation_history"
    ],
    anomalyCodes: uniqueAnomalyCodes,
    walletClusterFlag: "unknown",
    selfTransferFlag: "unknown",
    washTradingFlag: "unknown",
    accountIdentityReconciled: true,
    historyToEquityReconciled: false,
    reconciliationStatus: "partial",
    selfReportedSignalsAccepted: false
  };
  const metrics = aggregateMetrics(checkedHistory.events, snapshot);
  const historyCore = {
    subjectId: current.subjectId,
    principalId: current.principalId,
    bindingEpoch: current.bindingEpoch,
    accountBindingHash: checkedRelationship.relationshipHash,
    accountReferenceHash: current.accountReferenceHash,
    historyManifestHash: checkedHistory.historyManifestHash,
    currentSnapshotHash: snapshot.snapshotHash,
    observationWindow: {
      startsAt: checkedHistory.windowStartsAt,
      endsAt: checkedHistory.windowEndsAt,
      firstFillAt: checkedHistory.events[0]?.timestamp ?? null,
      lastFillAt:
        checkedHistory.events[checkedHistory.events.length - 1]?.timestamp ??
        null
    },
    counts: clone(checkedHistory.counts),
    metrics,
    dataQuality
  };
  const historyImport = {
    historyImportId: createOperationalId("trading_history_import"),
    historyHash: hashId("trading_real_history_import", historyCore),
    sourceType: "hyperliquid_testnet_info",
    environment: "hyperliquid_testnet",
    infoProfileId: "hyperliquid_testnet_info.v1",
    bindingEpoch: current.bindingEpoch,
    historyManifestHash: checkedHistory.historyManifestHash,
    eventManifestHash: hashId(
      "hyperliquid_fill_event_manifest",
      checkedHistory.eventHashes
    ),
    pageResponseHashes: clone(checkedHistory.pageHashes),
    sourceRoleHash: checkedHistory.sourceRoleHash,
    observationWindow: historyCore.observationWindow,
    counts: historyCore.counts,
    metrics,
    dataQuality,
    reconciliation: {
      currentSnapshotHash: snapshot.snapshotHash,
      currentSourceBundleHash: snapshot.sourceBundleHash,
      currentObservedAt: snapshot.observedAt,
      currentVenueTime: snapshot.venueTime,
      currentFreshness: snapshot.freshness,
      accountIdentityReconciled: true,
      historyToEquityReconciled: false,
      status: "partial",
      schemaVersion: "trading_account_reconciliation.v1"
    },
    lineage: {
      challengeEventId,
      challengeEvidenceHash,
      bindingProofHash: proof.proofHash,
      relationshipHash: checkedRelationship.relationshipHash,
      relationshipSourceResponseHashes: clone(
        checkedRelationship.sourceResponseHashes
      )
    },
    importedAt: new Date(now).toISOString(),
    rawEventsPersisted: false,
    rawSignaturePersisted: false,
    schemaVersion: TRADING_REAL_HISTORY_IMPORT_SCHEMA_VERSION
  };
  const accountBindingCore = {
    bindingEpoch: current.bindingEpoch,
    masterAddressHash: current.bindingChallenge.masterAddressHash,
    subaccountAddressHash: current.bindingChallenge.subaccountAddressHash,
    chainId: current.bindingChallenge.chainId,
    environment: current.bindingChallenge.environment,
    infoProfileId: current.bindingChallenge.infoProfileId,
    proofHash: proof.proofHash,
    relationshipHash: checkedRelationship.relationshipHash,
    verifiedAt: new Date(now).toISOString()
  };
  const next = {
    ...clone(current),
    stage: "history_imported",
    bindingChallenge: {
      ...clone(current.bindingChallenge),
      status: "consumed",
      consumedAt: new Date(now).toISOString(),
      accountOwnershipVerified: true,
      relationshipVerified: true
    },
    accountBinding: {
      ...accountBindingCore,
      accountBindingHash: hashId(
        "trading_hyperliquid_account_binding",
        accountBindingCore
      ),
      status: "active",
      readOnly: true,
      apiWallet: false,
      rawAddressesPersisted: false,
      schemaVersion: "trading_hyperliquid_account_binding.v1"
    },
    historyImport,
    evidenceAuthority: {
      bindingEpoch: current.bindingEpoch,
      active: false,
      authorizing: false,
      reasonCode: "evidence_snapshot_not_finalized",
      schemaVersion: "trading_evidence_authority.v1"
    },
    version: current.version + 1,
    updatedAt: new Date(now).toISOString(),
    externalSystemQueried: true
  };
  assertNoRawPiiReference(next, "tradingRealCreditProfile");
  return next;
}

export function finalizeRealTradingEvidenceSnapshot({
  profile,
  sourceProjectionHash,
  historyImportEventId,
  historyImportEvidenceHash,
  sourceFinality,
  now = new Date()
}) {
  const current = currentProfile(profile, "history_imported");
  hash("sourceProjectionHash", sourceProjectionHash);
  safeId("historyImportEventId", historyImportEventId);
  hash("historyImportEvidenceHash", historyImportEvidenceHash);
  if (
    sourceFinality !== "finalized" ||
    current.accountBinding?.status !== "active" ||
    current.historyImport?.bindingEpoch !== current.bindingEpoch
  ) {
    fail("real history import is not eligible for snapshot finalization");
  }
  const generatedAt = new Date(now);
  const latestPermittedInputTime = Math.max(
    new Date(current.historyImport.importedAt).getTime(),
    new Date(current.historyImport.observationWindow.endsAt).getTime(),
    new Date(current.historyImport.reconciliation.currentObservedAt).getTime()
  );
  if (
    !Number.isFinite(generatedAt.getTime()) ||
    generatedAt.getTime() < latestPermittedInputTime
  ) {
    fail("shadow risk generation cannot precede its Evidence");
  }
  const policyHash = hashId("trading_real_evidence_policy", {
    policyVersion: TRADING_REAL_EVIDENCE_POLICY_VERSION,
    singleSnapshotCapitalDecision: false,
    factorScoreAuthorizing: false,
    newRiskAuthority: false
  });
  const snapshotCore = {
    subjectId: current.subjectId,
    principalId: current.principalId,
    bindingEpoch: current.bindingEpoch,
    accountBindingHash: current.accountBinding.accountBindingHash,
    historyHash: current.historyImport.historyHash,
    sourceProjectionHash,
    sourceEventIds: [
      current.historyImport.lineage.challengeEventId,
      historyImportEventId
    ],
    sourceEvidenceHashes: [
      current.historyImport.lineage.challengeEvidenceHash,
      historyImportEvidenceHash
    ],
    policyHash,
    dataQuality: current.historyImport.dataQuality
  };
  const snapshotHash = hashId("trading_real_evidence_snapshot", snapshotCore);
  const evidenceSnapshot = {
    evidenceSnapshotId: createOperationalId("trading_evidence_snapshot"),
    snapshotHash,
    bindingEpoch: current.bindingEpoch,
    accountBindingHash: current.accountBinding.accountBindingHash,
    sourceProjectionHash,
    sourceEventIds: snapshotCore.sourceEventIds,
    sourceEvidenceHashes: snapshotCore.sourceEvidenceHashes,
    sourceFinality: "finalized",
    historyHash: current.historyImport.historyHash,
    policyHash,
    dataQuality: clone(current.historyImport.dataQuality),
    pointInTime: true,
    authorizing: false,
    singleSnapshotCapitalDecision: false,
    finalizedAt: new Date(now).toISOString(),
    schemaVersion: "trading_real_evidence_snapshot.v1"
  };
  const factorScorecard = realFactorScorecard(
    current,
    evidenceSnapshot,
    now
  );
  const next = {
    ...clone(current),
    stage: "finalized",
    evidenceSnapshot,
    factorScorecard,
    evidenceAuthority: {
      bindingEpoch: current.bindingEpoch,
      active: true,
      authorizing: false,
      scope: "read_only_evidence_reference",
      evidenceSnapshotHash: snapshotHash,
      activatedAt: new Date(now).toISOString(),
      reasonCode: "finalized_read_only_evidence",
      schemaVersion: "trading_evidence_authority.v1"
    },
    version: current.version + 1,
    updatedAt: new Date(now).toISOString()
  };
  assertNoRawPiiReference(next, "tradingRealCreditProfile");
  return next;
}

export function realTradingCreditProfileView(profile) {
  const current = currentProfile(profile, profile?.stage);
  if (!["challenge_pending", "history_imported", "finalized"].includes(current.stage)) {
    fail("real-read Trading Credit Profile stage is invalid");
  }
  if (
    current.stage === "challenge_pending" &&
    (current.accountBinding !== undefined ||
      current.historyImport !== undefined ||
      current.evidenceSnapshot !== undefined ||
      current.factorScorecard !== undefined ||
      current.evidenceAuthority.active !== false)
  ) {
    fail("pending binding profile contains active Evidence");
  }
  if (
    current.stage === "history_imported" &&
    (!current.accountBinding ||
      !current.historyImport ||
      current.evidenceSnapshot !== undefined ||
      current.factorScorecard !== undefined ||
      current.evidenceAuthority.active !== false)
  ) {
    fail("history-imported profile is incomplete");
  }
  if (
    current.stage === "finalized" &&
    (!current.accountBinding ||
      !current.historyImport ||
      !current.evidenceSnapshot ||
      !current.factorScorecard ||
      current.evidenceAuthority.active !== true ||
      current.evidenceAuthority.authorizing !== false)
  ) {
    fail("finalized real-read Evidence profile is incomplete");
  }
  if (
    current.stage === "finalized" &&
    current.factorScorecard.schemaVersion ===
      "trading_real_factor_scorecard.v2" &&
    (current.factorScorecard.policyVersion !==
      TRADING_REAL_SHADOW_RISK_POLICY_VERSION ||
      current.factorScorecard.shadowRisk?.schemaVersion !==
        TRADING_REAL_SHADOW_RISK_SCHEMA_VERSION ||
      current.factorScorecard.shadowRisk.authorizing !== false ||
      current.factorScorecard.shadowRisk.economicStateMutation !== false ||
      current.factorScorecard.shadowRisk.newRiskAuthority !== false ||
      current.factorScorecard.shadowRisk.fundsAuthority !== false ||
      current.factorScorecard.shadowRisk.evidenceSnapshotHash !==
        current.evidenceSnapshot.snapshotHash ||
      current.factorScorecard.shadowRisk.historyHash !==
        current.historyImport.historyHash)
  ) {
    fail("finalized Shadow Risk safety boundary is invalid");
  }
  return clone(current);
}
