import {
  DEMO_HASH_ALGORITHM,
  DEMO_HASH_DOMAIN,
  hashId
} from "../ids.js";
import {
  TRADING_CREDIT_ASSESSMENT_SCHEMA_VERSION
} from "./contracts.js";
import { assertPolicy } from "./policy.js";
import { fail, hash } from "./shared.js";

export function factorAssessment(
  factorId,
  scoreBps,
  weightBps,
  reasonCodes
) {
  return {
    factorId,
    scoreBps,
    weightBps,
    includedInComposite: scoreBps !== null,
    reasonCodes,
    authorizing: false,
    schemaVersion: "trading_credit_factor_assessment.v1"
  };
}

export function weightedComposite(factors) {
  let weighted = 0n;
  let includedWeight = 0n;
  for (const factor of factors) {
    if (factor.scoreBps === null) continue;
    weighted += BigInt(factor.scoreBps) * BigInt(factor.weightBps);
    includedWeight += BigInt(factor.weightBps);
  }
  return includedWeight === 0n ? null : Number(weighted / includedWeight);
}

export function assessmentSafety(value) {
  if (
    !value ||
    value.schemaVersion !== TRADING_CREDIT_ASSESSMENT_SCHEMA_VERSION ||
    value.shadowOnly !== true ||
    value.authorizing !== false ||
    value.creditApproval !== false ||
    value.fundsAuthority !== false ||
    value.economicStateMutation !== false ||
    value.productionAuthority !== false ||
    value.proofBundle?.hashAlgorithm !== DEMO_HASH_ALGORITHM ||
    value.proofBundle?.hashDomain !== DEMO_HASH_DOMAIN
  ) {
    fail("Trading Credit Assessment safety boundary is invalid");
  }
  hash("assessment.assessmentHash", value.assessmentHash);
  hash("assessment.featureSnapshotHash", value.featureSnapshotHash);
  hash("assessment.proofBundle.evidenceRoot", value.proofBundle.evidenceRoot);
  hash(
    "assessment.proofBundle.creditStateHash",
    value.proofBundle.creditStateHash
  );
  if (
    value.featureSnapshotHash !==
      hashId("trading_credit_feature_snapshot", value.featureSnapshot) ||
    value.proofBundle.featureSnapshotHash !== value.featureSnapshotHash ||
    value.proofBundle.policyHash !== value.policy.policyHash ||
    value.proofBundle.assessmentHash !== value.assessmentHash ||
    value.proofBundle.evidenceRoot !==
      hashId(
        "trading_credit_evidence_root",
        value.proofBundle.sourceEvidenceHashes
      )
  ) {
    fail("Trading Credit Assessment proof bundle is inconsistent");
  }
  assertPolicy(value.policy);
  const factorWeights = {
    evidence_confidence: value.policy.factorWeightsBps.evidenceConfidence,
    alpha_quality: value.policy.factorWeightsBps.alphaQuality,
    risk_reliability: value.policy.factorWeightsBps.riskReliability,
    strategy_capacity: value.policy.factorWeightsBps.strategyCapacity,
    mandate_compliance: value.policy.factorWeightsBps.mandateCompliance,
    repayment_history: value.policy.factorWeightsBps.repaymentHistory
  };
  if (
    !Array.isArray(value.factors) ||
    value.factors.length !== Object.keys(factorWeights).length ||
    new Set(value.factors.map(({ factorId }) => factorId)).size !==
      value.factors.length ||
    value.factors.some(
      (factor) =>
        factor.authorizing !== false ||
        factor.weightBps !== factorWeights[factor.factorId]
    ) ||
    weightedComposite(value.factors) !== value.compositeScoreBps ||
    value.featureSnapshot.compositeScoreBps !== value.compositeScoreBps
  ) {
    fail("Trading Credit Assessment factor explanation is inconsistent");
  }
  const assessmentCore = {
    subjectId: value.subjectId,
    principalId: value.principalId,
    accountReferenceHash: value.accountReferenceHash,
    accountBindingHash: value.accountBindingHash,
    assetId: value.assetId,
    policyHash: value.policy.policyHash,
    evidenceRoot: value.proofBundle.evidenceRoot,
    featureSnapshotHash: value.featureSnapshotHash,
    status: value.status,
    evidenceDeficiencies: value.evidenceDeficiencies,
    eligibilityFailures: value.eligibilityFailures,
    factors: value.factors,
    compositeScoreBps: value.compositeScoreBps,
    capacity: value.capacity,
    evaluatedAt: value.evaluatedAt
  };
  if (
    value.assessmentHash !==
      hashId("trading_credit_assessment", assessmentCore) ||
    value.proofBundle.creditStateHash !==
      hashId("trading_credit_state", {
        assessmentHash: value.assessmentHash,
        status: value.status,
        recommendedLimitMinor: value.capacity.recommendedLimitMinor,
        policyHash: value.policy.policyHash
      })
  ) {
    fail("Trading Credit Assessment hash does not match its content");
  }
  return value;
}
