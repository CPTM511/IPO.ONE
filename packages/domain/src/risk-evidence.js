import { CreditAuthorityType, RepaymentFrequency } from "./enums.js";
import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import { assertNoRawPiiReference } from "./validators.js";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const FEATURE_SET_VERSION = "credit-application-evidence-features.v1";
const RISK_STATE_QUERY_VERSION = "credit-application-risk-state.v1";
const SOURCE_ROLES = Object.freeze([
  "credit_intent",
  "subject",
  "principal",
  "authority",
  "human_identity_reference"
]);
const SOURCE_ROLE_SET = new Set(SOURCE_ROLES);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const CREDIT_APPLICATION_FEATURE_SET_VERSION = FEATURE_SET_VERSION;
export const CREDIT_APPLICATION_RISK_STATE_QUERY_VERSION = RISK_STATE_QUERY_VERSION;

export const CREDIT_REASON_LINEAGE = Object.freeze({
  authority_scope_current: Object.freeze({
    featureKeys: Object.freeze(["authorityCurrent"]),
    sourceRoles: Object.freeze(["authority"])
  }),
  principal_and_subject_eligible: Object.freeze({
    featureKeys: Object.freeze(["subjectEligible", "principalEligible"]),
    sourceRoles: Object.freeze(["subject", "principal"])
  }),
  identity_evidence_current: Object.freeze({
    featureKeys: Object.freeze(["identityEvidenceCurrent"]),
    sourceRoles: Object.freeze(["authority", "human_identity_reference"])
  }),
  principal_binding_current: Object.freeze({
    featureKeys: Object.freeze(["principalBindingCurrent"]),
    sourceRoles: Object.freeze(["subject", "principal", "authority"])
  }),
  no_adverse_obligation: Object.freeze({
    featureKeys: Object.freeze(["adverseObligationCount", "frozenCreditLineCount"]),
    sourceRoles: Object.freeze(["risk_state_attestation"])
  }),
  within_sandbox_policy_cap: Object.freeze({
    featureKeys: Object.freeze([
      "assetSupported",
      "principalWithinCap",
      "termWithinCap",
      "scheduleValid"
    ]),
    sourceRoles: Object.freeze(["credit_intent"])
  }),
  sandbox_rules_v1_approved: Object.freeze({
    featureKeys: Object.freeze(["allRequiredFeaturesSatisfied"]),
    sourceRoles: Object.freeze(["credit_intent", "risk_state_attestation"])
  }),
  application_not_eligible: Object.freeze({
    featureKeys: Object.freeze(["subjectEligible", "principalEligible"]),
    sourceRoles: Object.freeze(["subject", "principal"])
  }),
  authority_not_current: Object.freeze({
    featureKeys: Object.freeze(["authorityCurrent"]),
    sourceRoles: Object.freeze(["authority"])
  }),
  identity_evidence_not_current: Object.freeze({
    featureKeys: Object.freeze(["identityEvidenceCurrent"]),
    sourceRoles: Object.freeze(["authority", "human_identity_reference"])
  }),
  adverse_obligation_open: Object.freeze({
    featureKeys: Object.freeze(["adverseObligationCount"]),
    sourceRoles: Object.freeze(["risk_state_attestation"])
  }),
  credit_state_frozen: Object.freeze({
    featureKeys: Object.freeze(["subjectSuspended", "frozenCreditLineCount"]),
    sourceRoles: Object.freeze(["subject", "risk_state_attestation"])
  }),
  sandbox_cap_exceeded: Object.freeze({
    featureKeys: Object.freeze(["principalWithinCap", "termWithinCap"]),
    sourceRoles: Object.freeze(["credit_intent"])
  }),
  unsupported_sandbox_asset: Object.freeze({
    featureKeys: Object.freeze(["assetSupported"]),
    sourceRoles: Object.freeze(["credit_intent"])
  }),
  invalid_requested_schedule: Object.freeze({
    featureKeys: Object.freeze(["scheduleValid"]),
    sourceRoles: Object.freeze(["credit_intent"])
  })
});

function invalidEvidence(message) {
  throw new DomainError("invalid_risk_evidence", message);
}

function assertHash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    invalidEvidence(`${name} must be a lowercase bytes32 value`);
  }
  return value;
}

function assertBoolean(name, value) {
  if (typeof value !== "boolean") invalidEvidence(`${name} must be a boolean`);
  return value;
}

function assertCount(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    invalidEvidence(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function assertExactKeys(name, value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidEvidence(`${name} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    invalidEvidence(`${name} has an unsupported shape`);
  }
}

function normalizeSourceEvidence(sourceEvidence) {
  if (!Array.isArray(sourceEvidence) || sourceEvidence.length < 1 || sourceEvidence.length > 5) {
    invalidEvidence("sourceEvidence must contain between one and five entries");
  }
  const normalized = sourceEvidence.map((source, index) => {
    assertExactKeys(`sourceEvidence[${index}]`, source, [
      "role",
      "entityType",
      "entityIdHash",
      "entityHash",
      "aggregateVersion",
      "eventId",
      "evidenceHash",
      "sourceFinality"
    ]);
    if (!SOURCE_ROLE_SET.has(source.role)) invalidEvidence("source evidence role is unsupported");
    if (
      typeof source.entityType !== "string" || source.entityType.length < 1 || source.entityType.length > 64 ||
      typeof source.eventId !== "string" || source.eventId.length < 1 || source.eventId.length > 256
    ) invalidEvidence("source evidence identity is invalid");
    if (!Number.isSafeInteger(source.aggregateVersion) || source.aggregateVersion < 1) {
      invalidEvidence("source evidence aggregateVersion is invalid");
    }
    if (source.sourceFinality !== "finalized") {
      invalidEvidence("source evidence must be finalized");
    }
    return Object.freeze({
      role: source.role,
      entityType: source.entityType,
      entityIdHash: assertHash("entityIdHash", source.entityIdHash),
      entityHash: assertHash("entityHash", source.entityHash),
      aggregateVersion: source.aggregateVersion,
      eventId: source.eventId,
      evidenceHash: assertHash("evidenceHash", source.evidenceHash),
      sourceFinality: source.sourceFinality
    });
  }).sort((left, right) => SOURCE_ROLES.indexOf(left.role) - SOURCE_ROLES.indexOf(right.role));
  if (new Set(normalized.map(({ role }) => role)).size !== normalized.length) {
    invalidEvidence("source evidence roles must be unique");
  }
  if (normalized[0]?.role !== "credit_intent") {
    invalidEvidence("credit_intent source Evidence is required");
  }
  return Object.freeze(normalized);
}

function requireSource(sourceRoles, role, condition) {
  if (condition && !sourceRoles.has(role)) {
    invalidEvidence(`${role} source Evidence is required for a positive feature`);
  }
}

export function createCreditApplicationRiskFeatureSnapshot({
  intent,
  eligibilityFacts,
  sourceEvidence,
  riskState,
  policy,
  policyHash,
  now
}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    invalidEvidence("trusted feature snapshot time is invalid");
  }
  assertExactKeys("eligibilityFacts", eligibilityFacts, [
    "subjectEligible",
    "subjectSuspended",
    "principalEligible",
    "authorityCurrent",
    "identityEvidenceCurrent",
    "principalBindingCurrent"
  ]);
  assertExactKeys("riskState", riskState, [
    "adverseObligationCount",
    "frozenCreditLineCount",
    "liveStateVersion",
    "queryVersion",
    "stateHash"
  ]);
  if (riskState.queryVersion !== RISK_STATE_QUERY_VERSION) {
    invalidEvidence("risk-state query version is unsupported");
  }
  const sources = normalizeSourceEvidence(sourceEvidence);
  const sourceRoles = new Set(sources.map(({ role }) => role));
  const isHuman = intent.authorityType === CreditAuthorityType.CONSENT;
  const isAgent = intent.authorityType === CreditAuthorityType.MANDATE;
  if (!isHuman && !isAgent) invalidEvidence("credit authority type is unsupported");

  const subjectEligible = assertBoolean("subjectEligible", eligibilityFacts.subjectEligible);
  const subjectSuspended = assertBoolean("subjectSuspended", eligibilityFacts.subjectSuspended);
  const principalEligible = assertBoolean("principalEligible", eligibilityFacts.principalEligible);
  const authorityCurrent = assertBoolean("authorityCurrent", eligibilityFacts.authorityCurrent);
  const identityEvidenceCurrent = eligibilityFacts.identityEvidenceCurrent;
  const principalBindingCurrent = eligibilityFacts.principalBindingCurrent;
  if (isHuman && typeof identityEvidenceCurrent !== "boolean") {
    invalidEvidence("Human feature snapshot requires identityEvidenceCurrent");
  }
  if (!isHuman && identityEvidenceCurrent !== null) {
    invalidEvidence("Agent feature snapshot cannot assert Human identity Evidence");
  }
  if (isAgent && typeof principalBindingCurrent !== "boolean") {
    invalidEvidence("Agent feature snapshot requires principalBindingCurrent");
  }
  if (!isAgent && principalBindingCurrent !== null) {
    invalidEvidence("Human feature snapshot cannot assert Agent principal binding");
  }
  requireSource(sourceRoles, "subject", subjectEligible || subjectSuspended || principalBindingCurrent === true);
  requireSource(sourceRoles, "principal", principalEligible || principalBindingCurrent === true);
  requireSource(sourceRoles, "authority", authorityCurrent || identityEvidenceCurrent === true || principalBindingCurrent === true);
  requireSource(sourceRoles, "human_identity_reference", identityEvidenceCurrent === true);

  const adverseObligationCount = assertCount("adverseObligationCount", riskState.adverseObligationCount);
  const frozenCreditLineCount = assertCount("frozenCreditLineCount", riskState.frozenCreditLineCount);
  const liveStateVersion = assertCount("liveStateVersion", riskState.liveStateVersion);
  if (liveStateVersion < 1) invalidEvidence("liveStateVersion must be positive");
  assertHash("riskState.stateHash", riskState.stateHash);
  assertHash("policyHash", policyHash);

  let scheduleValid = false;
  try {
    const intervalDays = Object.freeze({
      [RepaymentFrequency.WEEKLY]: 7,
      [RepaymentFrequency.BIWEEKLY]: 14,
      [RepaymentFrequency.MONTHLY]: 30
    });
    const expectedCount = intent.repaymentFrequency === RepaymentFrequency.END_OF_TERM
      ? 1
      : Math.ceil(intent.requestedTermDays / intervalDays[intent.repaymentFrequency]);
    scheduleValid = Number.isSafeInteger(expectedCount) && expectedCount === intent.installmentCount;
  } catch {
    scheduleValid = false;
  }
  const features = Object.freeze({
    assetSupported: intent.assetId === policy.assetId,
    principalWithinCap: BigInt(intent.requestedPrincipalMinor) <= BigInt(policy.maximumPrincipalMinor),
    termWithinCap: Number.isSafeInteger(intent.requestedTermDays) &&
      intent.requestedTermDays >= 1 && intent.requestedTermDays <= policy.maximumTermDays,
    scheduleValid,
    subjectEligible,
    subjectSuspended,
    principalEligible,
    authorityCurrent,
    identityEvidenceCurrent,
    principalBindingCurrent,
    adverseObligationCount,
    frozenCreditLineCount,
    allRequiredFeaturesSatisfied: subjectEligible && principalEligible && authorityCurrent &&
      (isHuman ? identityEvidenceCurrent === true : principalBindingCurrent === true) &&
      adverseObligationCount === 0 && frozenCreditLineCount === 0 &&
      intent.assetId === policy.assetId &&
      BigInt(intent.requestedPrincipalMinor) <= BigInt(policy.maximumPrincipalMinor) &&
      Number.isSafeInteger(intent.requestedTermDays) && intent.requestedTermDays >= 1 &&
      intent.requestedTermDays <= policy.maximumTermDays && scheduleValid
  });
  const core = {
    creditIntentIdHash: hashId("risk_feature_credit_intent", { creditIntentId: intent.creditIntentId }),
    authorityType: intent.authorityType,
    assetId: intent.assetId,
    requestedPrincipalMinor: intent.requestedPrincipalMinor,
    requestedTermDays: intent.requestedTermDays,
    repaymentFrequency: intent.repaymentFrequency,
    installmentCount: intent.installmentCount,
    featureSetVersion: FEATURE_SET_VERSION,
    policyVersion: policy.modelVersion,
    policyHash,
    features,
    sourceEvidence: sources,
    riskStateAttestation: {
      queryVersion: riskState.queryVersion,
      stateHash: riskState.stateHash,
      liveStateVersion,
      adverseObligationCount,
      frozenCreditLineCount
    },
    asOf: now.toISOString(),
    sandboxOnly: true,
    productionAuthority: false
  };
  assertNoRawPiiReference(core, "riskFeatureSnapshot");
  const featureSnapshotHash = hashId("risk_feature_snapshot", core);
  return deepFreeze({
    riskFeatureSnapshotId: `risk_feature_snapshot_${featureSnapshotHash.slice(2)}`,
    featureSnapshotHash,
    ...core,
    schemaVersion: "risk_feature_snapshot.v1"
  });
}

export function createRiskDecisionPassport({ decision, riskFeatureSnapshot, policyHash }) {
  if (!decision || typeof decision !== "object" || !Array.isArray(decision.reasons)) {
    invalidEvidence("Decision is required for a passport");
  }
  if (
    riskFeatureSnapshot?.schemaVersion !== "risk_feature_snapshot.v1" ||
    riskFeatureSnapshot.policyHash !== policyHash ||
    riskFeatureSnapshot.policyVersion !== decision.modelVersion
  ) invalidEvidence("Decision passport provenance is inconsistent");
  const reasonLineage = decision.reasons.map(({ code }) => {
    const lineage = CREDIT_REASON_LINEAGE[code];
    if (!lineage) invalidEvidence("Decision reason has no closed lineage");
    return Object.freeze({
      reasonCode: code,
      featureKeys: [...lineage.featureKeys],
      sourceRoles: [...lineage.sourceRoles]
    });
  });
  const core = {
    riskDecisionId: decision.riskDecisionId,
    decisionHash: decision.decisionHash,
    riskFeatureSnapshotId: riskFeatureSnapshot.riskFeatureSnapshotId,
    featureSnapshotHash: riskFeatureSnapshot.featureSnapshotHash,
    featureSetVersion: riskFeatureSnapshot.featureSetVersion,
    policyVersion: decision.modelVersion,
    policyHash,
    reasonLineage,
    asOf: riskFeatureSnapshot.asOf,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionAuthority: false
  };
  const decisionPassportHash = hashId("risk_decision_passport", core);
  return deepFreeze({
    riskDecisionPassportId: `risk_decision_passport_${decisionPassportHash.slice(2)}`,
    decisionPassportHash,
    ...core,
    schemaVersion: "risk_decision_passport.v1"
  });
}
