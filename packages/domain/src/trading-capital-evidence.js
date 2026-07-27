import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import {
  PrincipalStatus,
  SubjectStatus,
  SubjectType
} from "./enums.js";
import { assertNoRawPiiReference } from "./validators.js";

export const TRADING_CREDIT_PROFILE_SCHEMA_VERSION = "trading_credit_profile.v1";
export const TRADING_FACTOR_SCORECARD_POLICY_VERSION =
  "trading_factor_scorecard_policy.v1";
export const TRADING_SYNTHETIC_FIXTURE_VERSION =
  "trading_synthetic_history_fixture.v1";

export const TradingProfileStage = Object.freeze({
  CHALLENGE_PENDING: "challenge_pending",
  HISTORY_IMPORTED: "history_imported",
  FINALIZED: "finalized"
});

export const TradingOperatorType = Object.freeze({
  HUMAN_TRADER: "human_trader",
  AGENT_OPERATOR: "agent_operator"
});

export const TradingFactorId = Object.freeze({
  ALPHA_QUALITY: "alpha_quality",
  RISK_RELIABILITY: "risk_reliability",
  STRATEGY_CAPACITY: "strategy_capacity",
  MANDATE_COMPLIANCE: "mandate_compliance",
  EVIDENCE_CONFIDENCE: "evidence_confidence"
});

const ACTIVE_SUBJECT_STATUSES = new Set([
  SubjectStatus.PENDING,
  SubjectStatus.ACTIVE
]);
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const FIXTURES = Object.freeze({
  [SubjectType.HUMAN]: Object.freeze({
    fixtureId: "tc_synthetic_human_history_v1",
    observationCount: 12,
    positiveObservationCount: 8,
    totalReturnBps: 1240,
    maximumDrawdownBps: 780,
    returnVolatilityBps: 1100,
    liquidationEventCount: 0,
    marginCallEventCount: 0,
    mandateBreachCount: 0,
    marketCount: 2,
    medianDailyNotionalMinor: "12000000",
    worstObservedSlippageBps: 18
  }),
  [SubjectType.AGENT]: Object.freeze({
    fixtureId: "tc_synthetic_agent_history_v1",
    observationCount: 12,
    positiveObservationCount: 9,
    totalReturnBps: 1680,
    maximumDrawdownBps: 960,
    returnVolatilityBps: 1380,
    liquidationEventCount: 0,
    marginCallEventCount: 1,
    mandateBreachCount: 1,
    marketCount: 3,
    medianDailyNotionalMinor: "18000000",
    worstObservedSlippageBps: 24
  })
});

function invalid(message) {
  throw new DomainError("invalid_trading_credit_profile", message);
}

function assertPlainObject(name, value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function assertExactKeys(name, value, keys) {
  assertPlainObject(name, value);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalid(`${name} has an open shape`);
  }
}

function assertDate(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function assertHash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function assertEventId(name, value) {
  if (typeof value !== "string" || !EVENT_ID_PATTERN.test(value)) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function assertCurrentProfile(profile, stage) {
  assertPlainObject("profile", profile);
  if (
    profile.schemaVersion !== TRADING_CREDIT_PROFILE_SCHEMA_VERSION ||
    profile.stage !== stage ||
    profile.sandboxOnly !== true ||
    profile.syntheticOnly !== true ||
    profile.productionAuthority !== false ||
    profile.fundsAuthority !== false ||
    profile.creditApproval !== false ||
    profile.universalScoreAvailable !== false ||
    profile.externalSystemQueried !== false ||
    profile.rawStrategyIncluded !== false ||
    profile.rawTransactionsIncluded !== false ||
    profile.piiIncluded !== false ||
    profile.secretsIncluded !== false
  ) {
    invalid("profile safety or stage is invalid");
  }
  assertHash("accountReferenceHash", profile.accountReferenceHash);
  return profile;
}

function clone(value) {
  return structuredClone(value);
}

function fixtureFor(subjectType) {
  const fixture = FIXTURES[subjectType];
  if (!fixture) invalid("subject type is not eligible for a synthetic trading fixture");
  return fixture;
}

function scorecardFactor(factorId, assessment, reasonCodes, inputMetricIds) {
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

function createFactorScorecard({ profile, historyImport, snapshotHash, now }) {
  const factors = [
    scorecardFactor(
      TradingFactorId.ALPHA_QUALITY,
      "limited",
      ["synthetic_history_only", "external_performance_unverified"],
      ["total_return_bps", "positive_observation_count", "return_volatility_bps"]
    ),
    scorecardFactor(
      TradingFactorId.RISK_RELIABILITY,
      "limited",
      ["synthetic_history_only", "venue_risk_state_unverified"],
      ["maximum_drawdown_bps", "liquidation_event_count", "margin_call_event_count"]
    ),
    scorecardFactor(
      TradingFactorId.STRATEGY_CAPACITY,
      "limited",
      ["synthetic_history_only", "market_impact_unverified"],
      ["market_count", "median_daily_notional_minor", "worst_observed_slippage_bps"]
    ),
    scorecardFactor(
      TradingFactorId.MANDATE_COMPLIANCE,
      "insufficient",
      ["trading_mandate_not_evaluated", "synthetic_history_only"],
      ["mandate_breach_count"]
    ),
    scorecardFactor(
      TradingFactorId.EVIDENCE_CONFIDENCE,
      "insufficient",
      ["external_source_not_queried", "freshness_unknown", "synthetic_fixture_only"],
      ["source_type", "freshness", "source_finality"]
    )
  ];
  const scorecardCore = {
    subjectId: profile.subjectId,
    principalId: profile.principalId,
    historyHash: historyImport.historyHash,
    snapshotHash,
    policyVersion: TRADING_FACTOR_SCORECARD_POLICY_VERSION,
    factors
  };
  return {
    scorecardId: createOperationalId("trading_factor_scorecard"),
    scorecardHash: hashId("trading_factor_scorecard", scorecardCore),
    policyVersion: TRADING_FACTOR_SCORECARD_POLICY_VERSION,
    factors,
    compositeScore: {
      available: false,
      reasonCode: "universal_score_prohibited"
    },
    creditDecision: {
      performed: false,
      reasonCode: "credit_approval_out_of_scope"
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
    generatedAt: now.toISOString(),
    schemaVersion: "trading_factor_scorecard.v1"
  };
}

export function createTradingAccountBindingChallenge({
  tenantId,
  subject,
  principal,
  requestedByActorId,
  challengeNonce,
  now = new Date()
}) {
  if (
    typeof tenantId !== "string" ||
    tenantId.length < 1 ||
    tenantId.length > 256 ||
    typeof requestedByActorId !== "string" ||
    requestedByActorId.length < 1 ||
    requestedByActorId.length > 256 ||
    typeof challengeNonce !== "string" ||
    !/^0x[0-9a-f]{64}$/.test(challengeNonce)
  ) {
    invalid("challenge identity is invalid");
  }
  assertPlainObject("subject", subject);
  assertPlainObject("principal", principal);
  if (
    ![SubjectType.HUMAN, SubjectType.AGENT].includes(subject.subjectType) ||
    !ACTIVE_SUBJECT_STATUSES.has(subject.status) ||
    subject.primaryPrincipalId !== principal.principalId ||
    principal.status !== PrincipalStatus.ACTIVE
  ) {
    invalid("Subject and Principal are not eligible for Trading Capital Evidence");
  }
  const operatorType =
    subject.subjectType === SubjectType.HUMAN
      ? TradingOperatorType.HUMAN_TRADER
      : TradingOperatorType.AGENT_OPERATOR;
  const issuedAt = new Date(now);
  const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
  const challengeId = createOperationalId("trading_account_challenge");
  const accountReferenceHash = hashId("synthetic_trading_account_reference", {
    tenantId,
    subjectId: subject.subjectId,
    principalId: principal.principalId,
    operatorType,
    fixtureVersion: TRADING_SYNTHETIC_FIXTURE_VERSION
  });
  const challengeHash = hashId("trading_account_binding_challenge", {
    challengeId,
    subjectId: subject.subjectId,
    principalId: principal.principalId,
    accountReferenceHash,
    nonceHash: hashId("trading_account_challenge_nonce", challengeNonce),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  });
  const profile = {
    tradingCreditProfileId: createOperationalId("trading_credit_profile"),
    subjectId: subject.subjectId,
    principalId: principal.principalId,
    subjectType: subject.subjectType,
    operatorType,
    requestedByActorHash: hashId("actor", requestedByActorId),
    accountReferenceHash,
    stage: TradingProfileStage.CHALLENGE_PENDING,
    bindingChallenge: {
      challengeId,
      challengeHash,
      nonceHash: hashId("trading_account_challenge_nonce", challengeNonce),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "pending",
      oneUse: true,
      bindingMethod: "synthetic_no_funds_fixture",
      accountOwnershipVerified: false,
      reusableSignatureIncluded: false
    },
    version: 1,
    createdAt: issuedAt.toISOString(),
    updatedAt: issuedAt.toISOString(),
    sandboxOnly: true,
    syntheticOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    creditApproval: false,
    universalScoreAvailable: false,
    externalSystemQueried: false,
    rawStrategyIncluded: false,
    rawTransactionsIncluded: false,
    piiIncluded: false,
    secretsIncluded: false,
    schemaVersion: TRADING_CREDIT_PROFILE_SCHEMA_VERSION
  };
  assertNoRawPiiReference(profile, "tradingCreditProfile");
  return profile;
}

export function importSyntheticTradingHistory({
  profile,
  requestedByActorId,
  challengeEventId,
  challengeEvidenceHash,
  now = new Date()
}) {
  const current = assertCurrentProfile(profile, TradingProfileStage.CHALLENGE_PENDING);
  if (
    current.bindingChallenge.status !== "pending" ||
    new Date(current.bindingChallenge.expiresAt) <= now ||
    current.requestedByActorHash !== hashId("actor", requestedByActorId)
  ) {
    invalid("binding challenge is not current for the requesting Actor");
  }
  assertEventId("challengeEventId", challengeEventId);
  assertHash("challengeEvidenceHash", challengeEvidenceHash);
  const fixture = fixtureFor(current.subjectType);
  const windowEndsAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowStartsAt = new Date(windowEndsAt);
  windowStartsAt.setUTCMonth(windowStartsAt.getUTCMonth() - 12);
  const metrics = {
    observationCount: fixture.observationCount,
    positiveObservationCount: fixture.positiveObservationCount,
    totalReturnBps: fixture.totalReturnBps,
    maximumDrawdownBps: fixture.maximumDrawdownBps,
    returnVolatilityBps: fixture.returnVolatilityBps,
    liquidationEventCount: fixture.liquidationEventCount,
    marginCallEventCount: fixture.marginCallEventCount,
    mandateBreachCount: fixture.mandateBreachCount,
    marketCount: fixture.marketCount,
    medianDailyNotionalMinor: fixture.medianDailyNotionalMinor,
    worstObservedSlippageBps: fixture.worstObservedSlippageBps
  };
  const fixtureHash = hashId("trading_synthetic_fixture", {
    ...fixture,
    fixtureVersion: TRADING_SYNTHETIC_FIXTURE_VERSION
  });
  const historyCore = {
    subjectId: current.subjectId,
    principalId: current.principalId,
    accountReferenceHash: current.accountReferenceHash,
    fixtureId: fixture.fixtureId,
    fixtureVersion: TRADING_SYNTHETIC_FIXTURE_VERSION,
    fixtureHash,
    observationWindow: {
      startsAt: windowStartsAt.toISOString(),
      endsAt: windowEndsAt.toISOString(),
      observationCount: fixture.observationCount
    },
    metrics
  };
  const historyImport = {
    historyImportId: createOperationalId("trading_history_import"),
    historyHash: hashId("trading_history_import", historyCore),
    sourceType: "synthetic_fixture",
    fixtureId: fixture.fixtureId,
    fixtureVersion: TRADING_SYNTHETIC_FIXTURE_VERSION,
    fixtureHash,
    observationWindow: historyCore.observationWindow,
    metrics,
    dataQuality: {
      completeness: "complete",
      confidence: "synthetic_only",
      freshness: "unknown",
      stalenessReason: "external_venue_not_queried",
      sourceFinality: "synthetic_final",
      missingFields: [],
      anomalyCodes: ["synthetic_fixture_not_external_evidence"],
      selfReportedSignalsAccepted: false
    },
    lineage: {
      challengeEventId,
      challengeEvidenceHash
    },
    importedAt: now.toISOString(),
    schemaVersion: "trading_history_import.v1"
  };
  const next = {
    ...clone(current),
    stage: TradingProfileStage.HISTORY_IMPORTED,
    bindingChallenge: {
      ...clone(current.bindingChallenge),
      status: "consumed",
      consumedAt: now.toISOString()
    },
    historyImport,
    version: 2,
    updatedAt: now.toISOString()
  };
  assertNoRawPiiReference(next, "tradingCreditProfile");
  return next;
}

export function finalizeTradingEvidenceSnapshot({
  profile,
  sourceProjectionHash,
  historyImportEventId,
  historyImportEvidenceHash,
  sourceFinality,
  now = new Date()
}) {
  const current = assertCurrentProfile(profile, TradingProfileStage.HISTORY_IMPORTED);
  assertHash("sourceProjectionHash", sourceProjectionHash);
  assertEventId("historyImportEventId", historyImportEventId);
  assertHash("historyImportEvidenceHash", historyImportEvidenceHash);
  if (sourceFinality !== "finalized") {
    invalid("history import Evidence must be finalized before snapshot creation");
  }
  const policyHash = hashId("trading_factor_scorecard_policy", {
    policyVersion: TRADING_FACTOR_SCORECARD_POLICY_VERSION,
    factorIds: Object.values(TradingFactorId),
    numericScoreAvailable: false,
    universalScoreAvailable: false,
    creditApproval: false,
    recommendedLimitAvailable: false,
    pricingAvailable: false
  });
  const snapshotCore = {
    subjectId: current.subjectId,
    principalId: current.principalId,
    accountReferenceHash: current.accountReferenceHash,
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
  const snapshotHash = hashId("trading_evidence_snapshot", snapshotCore);
  const evidenceSnapshot = {
    evidenceSnapshotId: createOperationalId("trading_evidence_snapshot"),
    snapshotHash,
    sourceProjectionHash,
    sourceEventIds: snapshotCore.sourceEventIds,
    sourceEvidenceHashes: snapshotCore.sourceEvidenceHashes,
    sourceFinality: "finalized",
    historyHash: current.historyImport.historyHash,
    policyHash,
    dataQuality: clone(current.historyImport.dataQuality),
    pointInTime: true,
    finalizedAt: now.toISOString(),
    schemaVersion: "trading_evidence_snapshot.v1"
  };
  const factorScorecard = createFactorScorecard({
    profile: current,
    historyImport: current.historyImport,
    snapshotHash,
    now
  });
  const next = {
    ...clone(current),
    stage: TradingProfileStage.FINALIZED,
    evidenceSnapshot,
    factorScorecard,
    version: 3,
    updatedAt: now.toISOString()
  };
  assertNoRawPiiReference(next, "tradingCreditProfile");
  return next;
}

export function tradingCreditProfileView(profile) {
  const current = assertCurrentProfile(profile, profile?.stage);
  if (
    !Object.values(TradingProfileStage).includes(current.stage) ||
    !Number.isSafeInteger(current.version) ||
    current.version < 1 ||
    current.version > 3
  ) {
    invalid("profile version is invalid");
  }
  if (current.stage === TradingProfileStage.FINALIZED) {
    if (
      !current.evidenceSnapshot ||
      !current.factorScorecard ||
      current.factorScorecard.factors.length !== 5 ||
      current.factorScorecard.factors.map(({ factorId }) => factorId).join(",") !==
        Object.values(TradingFactorId).join(",")
    ) {
      invalid("finalized factor scorecard is incomplete");
    }
  }
  return clone(current);
}

