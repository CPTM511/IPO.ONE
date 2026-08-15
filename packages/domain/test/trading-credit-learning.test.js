import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import test from "node:test";
import * as tradingCreditLearning from "../src/trading-credit-learning.js";
import {
  createTradingCreditAssessment,
  createTradingCreditMvpShadowPolicy,
  createTradingCreditOutcome,
  createTradingCreditPriorOutcomeSummary,
  createTradingCreditProofBinding,
  createTradingCreditSupplementalEvidence,
  evaluateTradingCreditChallenger,
  hashId
} from "../src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false
}).addFormat("date-time", {
  type: "string",
  validate(value) {
    return (
      typeof value === "string" &&
      /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
      Number.isFinite(new Date(value).getTime())
    );
  }
});

async function schemaValidator(file) {
  const schema = JSON.parse(
    await readFile(
      new URL(`../../../schemas/v2/${file}`, import.meta.url),
      "utf8"
    )
  );
  return ajv.compile(schema);
}

const validateSupplement = await schemaValidator(
  "trading-credit-supplemental-evidence.schema.json"
);
const validateAssessment = await schemaValidator(
  "trading-credit-assessment.schema.json"
);
const validateProofBinding = await schemaValidator(
  "trading-credit-proof-binding.schema.json"
);
const validateOutcome = await schemaValidator(
  "trading-credit-outcome.schema.json"
);
const validatePriorOutcomeSummary = await schemaValidator(
  "trading-credit-prior-outcome-summary.schema.json"
);
const validateChallenger = await schemaValidator(
  "trading-credit-challenger-report.schema.json"
);

function assertValid(validate, value) {
  assert.equal(validate(value), true, JSON.stringify(validate.errors, null, 2));
}

const ASSET_ID =
  "eip155:84532/erc20:0x1111111111111111111111111111111111111111";
const hash = (name, index = 0) => hashId(`test_${name}`, { index });

function finalizedProfile({
  freshness = "fresh",
  netPnl = "24.25",
  observedAt = "2026-07-25T00:00:00.000Z"
} = {}) {
  const accountBindingHash = hash("account_binding");
  const historyHash = hash("history");
  const evidenceSnapshotHash = hash("evidence_snapshot");
  return {
    tradingCreditProfileId: "trading_credit_profile_test",
    subjectId: "subject_trading_credit_test",
    principalId: "principal_trading_credit_test",
    subjectType: "agent",
    operatorType: "agent_operator",
    requestedByActorHash: hash("actor"),
    accountReferenceHash: hash("account_reference"),
    bindingEpoch: 1,
    stage: "finalized",
    bindingChallenge: {},
    accountBinding: {
      status: "active",
      accountBindingHash
    },
    historyImport: {
      historyHash,
      dataQuality: { freshness },
      reconciliation: {
        currentObservedAt: observedAt
      }
    },
    evidenceSnapshot: {
      snapshotHash: evidenceSnapshotHash,
      sourceFinality: "finalized",
      authorizing: false
    },
    factorScorecard: {
      schemaVersion: "trading_real_factor_scorecard.v2",
      policyVersion: "trading_real_shadow_risk_policy.v1",
      shadowRisk: {
        schemaVersion: "trading_real_shadow_risk_profile.v1",
        shadowRiskProfileHash: hash("shadow_risk"),
        evidenceSnapshotHash,
        historyHash,
        authorizing: false,
        economicStateMutation: false,
        newRiskAuthority: false,
        fundsAuthority: false,
        features: [
          {
            featureId: "net_realized_pnl",
            state: "observed",
            value: netPnl,
            unit: "venue_quote_asset",
            authorizing: false
          },
          {
            featureId: "positive_realized_fill_rate",
            state: "observed",
            value: "1",
            unit: "ratio",
            authorizing: false
          }
        ]
      }
    },
    evidenceAuthority: {
      active: true,
      authorizing: false
    },
    version: 3,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    sandboxOnly: true,
    syntheticOnly: false,
    testnetOnly: true,
    realFunds: false,
    productionAuthority: false,
    fundsAuthority: false,
    creditApproval: false,
    universalScoreAvailable: false,
    externalSystemQueried: true,
    rawStrategyIncluded: false,
    rawTransactionsIncluded: false,
    piiIncluded: false,
    secretsIncluded: false,
    schemaVersion: "trading_credit_profile.v2"
  };
}

function policy() {
  return createTradingCreditMvpShadowPolicy({
    assetId: ASSET_ID,
    assetDecimals: 6,
    productCapMinor: "1000000000",
    validFrom: "2026-06-01T00:00:00.000Z"
  });
}

function equitySeries({
  endAt = "2026-07-25T00:00:00.000Z"
} = {}) {
  const start = new Date(
    new Date(endAt).getTime() - 29 * 86_400_000
  );
  return Array.from({ length: 30 }, (_, index) => ({
    observedAt: new Date(
      start.getTime() + index * 86_400_000
    ).toISOString(),
    equityMinor: (1_000_000_000n + BigInt(index) * 1_000_000n).toString(),
    netExternalFlowMinor: "0",
    positionNotionalMinor: "500000000",
    evidenceHash: hash("equity_observation", index)
  }));
}

function supplementalEvidence(
  profile,
  {
    observedAt = "2026-07-25T00:00:00.000Z",
    liquidationCount = 0,
    mandateBreachCount = 0,
    integrityChecks = {
      walletCluster: "clear",
      selfTransfer: "clear",
      washTrading: "clear",
      evidenceHash: hash("integrity")
    },
    seriesEndAt = observedAt
  } = {}
) {
  return createTradingCreditSupplementalEvidence({
    accountBindingHash: profile.accountBinding.accountBindingHash,
    historyHash: profile.historyImport.historyHash,
    evidenceSnapshotHash: profile.evidenceSnapshot.snapshotHash,
    assetId: ASSET_ID,
    assetDecimals: 6,
    observedAt,
    sourceEvidenceHashes: [
      hash("equity_manifest"),
      hash("liquidation_manifest"),
      hash("mandate_manifest")
    ],
    equitySeries: equitySeries({ endAt: seriesEndAt }),
    liquidationCount,
    mandateBreachCount,
    integrityChecks,
    repaymentCashflowCapacityMinor: "50000000"
  });
}

function eligibleAssessment() {
  const profile = finalizedProfile();
  return createTradingCreditAssessment({
    profile,
    policy: policy(),
    supplementalEvidence: supplementalEvidence(profile),
    currentOutstandingMinor: "62500",
    evaluatedAt: "2026-07-25T00:30:00.000Z"
  });
}

function obligation(
  assessment,
  {
    index = 0,
    status = "fully_repaid",
    createdAt = "2026-07-25T01:00:00.000Z",
    updatedAt = "2026-08-25T00:00:00.000Z"
  } = {}
) {
  const writtenOff = status === "written_off";
  return {
    obligationId: `obligation_trading_credit_${index}`,
    subjectId: assessment.subjectId,
    principalId: assessment.principalId,
    assetId: assessment.assetId,
    status,
    originalPrincipalMinor: "6000000",
    totalRepaidMinor: writtenOff ? "0" : "6000000",
    outstandingPrincipalMinor: writtenOff ? "6000000" : "0",
    outstandingInterestMinor: "0",
    outstandingFeesMinor: "0",
    ...(writtenOff
      ? {
          writtenOffPrincipalMinor: "6000000",
          writtenOffInterestMinor: "0",
          writtenOffFeesMinor: "0"
        }
      : {}),
    createdAt,
    updatedAt,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "obligation.v2"
  };
}

function outcome(
  assessment,
  {
    index = 0,
    status = "fully_repaid",
    maxDaysPastDue = 0,
    restructured = false,
    repurchased = false
  } = {}
) {
  const writtenOff = status === "written_off";
  return createTradingCreditOutcome({
    assessment,
    obligation: obligation(assessment, { index, status }),
    servicingSummary: {
      maxDaysPastDue,
      restructured,
      repurchased,
      manualInterventionCount:
        restructured || repurchased || writtenOff ? 1 : 0,
      outcomeFinalizedAt: "2026-08-25T00:05:00.000Z",
      evidenceHashes: [hash("servicing", index)],
      schemaVersion: "trading_credit_servicing_summary.v1"
    },
    repaymentEvidenceHashes: writtenOff ? [] : [hash("repayment", index)],
    outcomeEvidenceHash: hash("outcome_evidence", index),
    recordedAt: "2026-08-25T00:10:00.000Z"
  });
}

test("RISK-003A current TC-203 Evidence alone fails closed without a credit limit", () => {
  const result = createTradingCreditAssessment({
    profile: finalizedProfile(),
    policy: policy(),
    evaluatedAt: "2026-07-25T00:30:00.000Z"
  });

  assert.equal(result.status, "insufficient_evidence");
  assert.deepEqual(result.evidenceDeficiencies, [
    "supplemental_evidence_unavailable"
  ]);
  assert.equal(result.capacity.recommendedLimitMinor, "0");
  assert.equal(result.authorizing, false);
  assert.equal(result.fundsAuthority, false);
  assert.equal(result.proofBundle.bytes32Compatible, true);
  assert.equal(result.proofBundle.onchainRecomputationClaimed, false);
  assertValid(validateAssessment, result);
});

test("RISK-003A finalized supplemental Evidence creates a deterministic eligible Shadow Assessment", () => {
  const profile = finalizedProfile();
  const firstPolicy = policy();
  const secondPolicy = policy();
  const firstSupplement = supplementalEvidence(profile);
  const secondSupplement = supplementalEvidence(profile);
  const input = {
    profile,
    policy: firstPolicy,
    supplementalEvidence: firstSupplement,
    currentOutstandingMinor: "62500",
    evaluatedAt: "2026-07-25T00:30:00.000Z"
  };
  const first = createTradingCreditAssessment(input);
  const second = createTradingCreditAssessment({
    ...input,
    policy: secondPolicy,
    supplementalEvidence: secondSupplement
  });

  assert.deepEqual(
    {
      policyHash: firstPolicy.policyHash,
      supplementalEvidenceHash:
        firstSupplement.supplementalEvidenceHash,
      assessmentHash: first.assessmentHash,
      featureSnapshotHash: first.featureSnapshotHash,
      evidenceRoot: first.proofBundle.evidenceRoot,
      creditStateHash: first.proofBundle.creditStateHash,
      compositeScoreBps: first.compositeScoreBps,
      grossLimitMinor: first.capacity.grossLimitMinor,
      recommendedLimitMinor: first.capacity.recommendedLimitMinor
    },
    {
      policyHash:
        "0x691f0bc517ae24299e333c07b8ae1ca9d59fe84a4807c06dc38cbb2f4e64c0bf",
      supplementalEvidenceHash:
        "0x79791d45f8ad69a90095820ec2dc469e07b9b3d8c3403faad8ad67e0a2981ede",
      assessmentHash:
        "0x6793916807bad675046a55b231923d8126680f7f6f6a1054db9a45217de27453",
      featureSnapshotHash:
        "0xfb4e4d7994af47b584007372cfb09bb28d41b3b4987446dc41d16e86a33c9711",
      evidenceRoot:
        "0xcb55c793d4cf9eca810127d6b104111796de6b50058996977c43dd6bb29b97fe",
      creditStateHash:
        "0x4fa49eea6276b2a9b84a1449fb0c5e5c44815d77fa894fdedb7ed598463a85ff",
      compositeScoreBps: 9768,
      grossLimitMinor: "6062500",
      recommendedLimitMinor: "6000000"
    }
  );

  assert.equal(firstPolicy.policyHash, secondPolicy.policyHash);
  assert.equal(
    firstSupplement.supplementalEvidenceHash,
    secondSupplement.supplementalEvidenceHash
  );
  assert.equal(first.assessmentHash, second.assessmentHash);
  assert.equal(first.featureSnapshotHash, second.featureSnapshotHash);
  assert.equal(
    first.proofBundle.creditStateHash,
    second.proofBundle.creditStateHash
  );
  assert.equal(first.status, "eligible_shadow");
  assert.equal(first.capacity.grossLimitMinor, "6062500");
  assert.equal(first.capacity.recommendedLimitMinor, "6000000");
  assert.equal(first.featureSnapshot.maximumDrawdownBps, 0);
  assert.equal(first.featureSnapshot.p95LeverageBps, 4995);
  assert.equal(first.featureSnapshot.futureOutcomeDataIncluded, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.featureSnapshot), true);
  assertValid(validateSupplement, firstSupplement);
  assertValid(validateAssessment, first);
});

test("RISK-003A stale Evidence fails closed and adverse facts are ineligible", () => {
  const profile = finalizedProfile();
  const supplement = supplementalEvidence(profile);
  const stale = createTradingCreditAssessment({
    profile,
    policy: policy(),
    supplementalEvidence: supplement,
    evaluatedAt: "2026-07-27T00:30:00.000Z"
  });
  const adverseSupplement = supplementalEvidence(profile, {
    liquidationCount: 1
  });
  const adverse = createTradingCreditAssessment({
    profile,
    policy: policy(),
    supplementalEvidence: adverseSupplement,
    evaluatedAt: "2026-07-25T00:30:00.000Z"
  });

  assert.equal(stale.status, "insufficient_evidence");
  assert.ok(
    stale.evidenceDeficiencies.includes("supplemental_evidence_stale")
  );
  assert.equal(stale.capacity.recommendedLimitMinor, "0");
  assert.equal(adverse.status, "ineligible_shadow");
  assert.deepEqual(adverse.eligibilityFailures, [
    "liquidation_count_above_shadow_limit"
  ]);
  assert.equal(adverse.capacity.recommendedLimitMinor, "0");
  assertValid(validateAssessment, stale);
  assertValid(validateAssessment, adverse);
});

test("RISK-003A account binding and content hashes reject tampering", () => {
  const profile = finalizedProfile();
  const supplement = supplementalEvidence(profile);
  const wrongBinding = {
    ...supplement,
    accountBindingHash: hash("wrong_binding")
  };
  assert.throws(
    () =>
      createTradingCreditAssessment({
        profile,
        policy: policy(),
        supplementalEvidence: wrongBinding,
        evaluatedAt: "2026-07-25T00:30:00.000Z"
      }),
    /supplemental Evidence binding or safety boundary is invalid/
  );

  const rehashedBindingTamper = {
    ...supplement,
    liquidationCount: 9
  };
  assert.throws(
    () =>
      createTradingCreditAssessment({
        profile,
        policy: policy(),
        supplementalEvidence: rehashedBindingTamper,
        evaluatedAt: "2026-07-25T00:30:00.000Z"
      }),
    /supplemental Evidence hash does not match its content/
  );

  const assessment = eligibleAssessment();
  const tamperedAssessment = structuredClone(assessment);
  tamperedAssessment.capacity.recommendedLimitMinor = "999999999";
  assert.throws(
    () =>
      createTradingCreditProofBinding({
        assessment: tamperedAssessment,
        acceptedOfferHash: hash("offer"),
        providerScopeHash: hash("provider_scope"),
        validUntil: "2026-07-26T00:00:00.000Z"
      }),
    /Assessment hash does not match its content/
  );
});

test("RISK-003A registry proof binding is compatible but deliberately non-publishable", () => {
  const assessment = eligibleAssessment();
  const binding = createTradingCreditProofBinding({
    assessment,
    acceptedOfferHash: hash("offer"),
    providerScopeHash: hash("provider_scope"),
    validUntil: "2026-07-26T00:00:00.000Z"
  });

  assert.equal(
    binding.registryContractSchemaVersion,
    "ipo_one_credit_authorization_registry.v1"
  );
  assert.equal(
    binding.projectionFields.policyHash,
    assessment.policy.policyHash
  );
  assert.equal(
    binding.projectionFields.creditStateHash,
    assessment.proofBundle.creditStateHash
  );
  assert.deepEqual(Object.keys(binding.projectionFields).sort(), [
    "acceptedOfferHash",
    "creditStateHash",
    "obligationProofHash",
    "policyHash",
    "providerScopeHash",
    "subjectAccountHash",
    "validUntil"
  ]);
  assert.deepEqual(binding.missingServerResolvedFields, [
    "authorization_id",
    "account_id"
  ]);
  assert.equal(binding.projectionReady, false);
  assert.equal(binding.publicationAllowed, false);
  assert.equal(binding.requiresExistingApprovalGate, true);
  assert.equal(binding.transactionCalldataIncluded, false);
  assert.equal(binding.authorizing, false);
  assertValid(validateProofBinding, binding);
});

test("RISK-003A repayment outcome preserves the decision-time features and rejects non-terminal labels", () => {
  const assessment = eligibleAssessment();
  const result = outcome(assessment);

  assert.equal(result.outcomeLabel, "on_time_repaid");
  assert.equal(result.defaulted, false);
  assert.equal(result.lossMinor, "0");
  assert.equal(result.featureSnapshotHash, assessment.featureSnapshotHash);
  assert.deepEqual(
    result.decisionFeatureSnapshot,
    assessment.featureSnapshot
  );
  assert.equal(result.futureFeatureSubstitutionAllowed, false);
  assertValid(validateOutcome, result);

  assert.throws(
    () =>
      createTradingCreditOutcome({
        assessment,
        obligation: obligation(assessment, { status: "active" }),
        servicingSummary: {
          maxDaysPastDue: 0,
          restructured: false,
          repurchased: false,
          manualInterventionCount: 0,
          outcomeFinalizedAt: "2026-08-25T00:05:00.000Z",
          evidenceHashes: [hash("servicing_active")],
          schemaVersion: "trading_credit_servicing_summary.v1"
        },
        repaymentEvidenceHashes: [],
        outcomeEvidenceHash: hash("outcome_active"),
        recordedAt: "2026-08-25T00:10:00.000Z"
      }),
    /terminal sandbox Obligation is invalid/
  );
});

test("RISK-003A finalized outcomes become a hash-bound repayment-history input for the next assessment", () => {
  const firstAssessment = eligibleAssessment();
  const firstOutcome = outcome(firstAssessment);
  const summary = createTradingCreditPriorOutcomeSummary({
    outcomes: [firstOutcome],
    assetId: ASSET_ID,
    asOf: "2026-08-25T00:10:00.000Z"
  });
  const refreshedProfile = finalizedProfile({
    observedAt: "2026-08-25T00:15:00.000Z"
  });
  const nextAssessment = createTradingCreditAssessment({
    profile: refreshedProfile,
    policy: policy(),
    supplementalEvidence: supplementalEvidence(refreshedProfile, {
      observedAt: "2026-08-25T00:15:00.000Z"
    }),
    priorOutcomeSummary: summary,
    evaluatedAt: "2026-08-25T00:30:00.000Z"
  });

  assert.equal(summary.completedCount, 1);
  assert.equal(summary.onTimeRepaidCount, 1);
  assert.equal(summary.writtenOffCount, 0);
  assert.equal(summary.totalPrincipalMinor, "6000000");
  assert.equal(summary.totalLossMinor, "0");
  assert.equal(summary.finalizedOutcomesOnly, true);
  assertValid(validatePriorOutcomeSummary, summary);

  assert.equal(nextAssessment.status, "eligible_shadow");
  assert.equal(
    nextAssessment.featureSnapshot.priorCompletedOutcomeCount,
    1
  );
  assert.equal(nextAssessment.featureSnapshot.priorDefaultRateBps, 0);
  assert.equal(
    nextAssessment.factors.find(
      ({ factorId }) => factorId === "repayment_history"
    ).scoreBps,
    10000
  );
  assert.ok(
    nextAssessment.proofBundle.sourceEvidenceHashes.includes(
      summary.summaryHash
    )
  );
  assertValid(validateAssessment, nextAssessment);
});

test("RISK-003A challenger learns conservatively without auto-promotion or loosening", () => {
  const assessment = eligibleAssessment();
  const outcomes = Array.from({ length: 20 }, (_, index) =>
    outcome(assessment, {
      index,
      status: index < 5 ? "written_off" : "fully_repaid"
    })
  );
  const report = evaluateTradingCreditChallenger({
    outcomes,
    policy: assessment.policy,
    candidateVersion: "trading_credit_challenger.v1",
    evaluatedAt: "2026-09-01T00:00:00.000Z"
  });

  assert.equal(report.completedOutcomeCount, 20);
  assert.equal(report.defaultCount, 5);
  assert.equal(report.posteriorDefaultBps, 2000);
  assert.equal(report.recommendation, "tighten_review");
  assert.equal(report.proposedCapacityMultiplierBps, 8000);
  assert.equal(report.promotionAllowed, false);
  assert.equal(report.autoApplied, false);
  assert.equal(report.autoLooseningAllowed, false);
  assert.equal(report.requiresNamedHumanReview, true);
  assertValid(validateChallenger, report);

  const smallSample = evaluateTradingCreditChallenger({
    outcomes: [outcomes.at(-1)],
    policy: assessment.policy,
    candidateVersion: "trading_credit_challenger.small_sample.v1",
    evaluatedAt: "2026-09-01T00:00:00.000Z"
  });
  assert.equal(smallSample.posteriorDefaultBps, 909);
  assert.equal(smallSample.recommendation, "insufficient_sample");
  assert.equal(smallSample.proposedCapacityMultiplierBps, 10000);
  assertValid(validateChallenger, smallSample);
});

test("REFACTOR-001 compatibility facade preserves the exact public surface", () => {
  assert.deepEqual(Object.keys(tradingCreditLearning).sort(), [
    "TRADING_CREDIT_ASSESSMENT_SCHEMA_VERSION",
    "TRADING_CREDIT_CHALLENGER_SCHEMA_VERSION",
    "TRADING_CREDIT_OUTCOME_SCHEMA_VERSION",
    "TRADING_CREDIT_PRIOR_OUTCOME_SUMMARY_SCHEMA_VERSION",
    "TRADING_CREDIT_PROOF_BINDING_SCHEMA_VERSION",
    "TRADING_CREDIT_SHADOW_POLICY_SCHEMA_VERSION",
    "TRADING_CREDIT_SUPPLEMENT_SCHEMA_VERSION",
    "TRADING_CREDIT_ZERO_HASH",
    "createTradingCreditAssessment",
    "createTradingCreditMvpShadowPolicy",
    "createTradingCreditOutcome",
    "createTradingCreditPriorOutcomeSummary",
    "createTradingCreditProofBinding",
    "createTradingCreditSupplementalEvidence",
    "evaluateTradingCreditChallenger"
  ]);
});

test("REFACTOR-001 assessment hot path stays within its regression budget", () => {
  const profile = finalizedProfile();
  const assessmentPolicy = policy();
  const supplement = supplementalEvidence(profile);
  const input = {
    profile,
    policy: assessmentPolicy,
    supplementalEvidence: supplement,
    currentOutstandingMinor: "62500",
    evaluatedAt: "2026-07-25T00:30:00.000Z"
  };

  for (let index = 0; index < 5; index += 1) {
    createTradingCreditAssessment(input);
  }

  const startedAt = performance.now();
  let lastAssessment;
  for (let index = 0; index < 100; index += 1) {
    lastAssessment = createTradingCreditAssessment(input);
  }
  const elapsedMs = performance.now() - startedAt;

  assert.equal(
    lastAssessment.assessmentHash,
    "0x6793916807bad675046a55b231923d8126680f7f6f6a1054db9a45217de27453"
  );
  assert.ok(
    elapsedMs < 2_000,
    `100 deterministic assessments exceeded 2000ms: ${elapsedMs.toFixed(2)}ms`
  );
});
