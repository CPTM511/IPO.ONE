import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import { assertNoRawPiiReference } from "./validators.js";

export const CREDIT_PASSPORT_ARTIFACT_SCHEMA_VERSION = "credit_passport_artifact.v1";
export const CREDIT_PASSPORT_ISSUER = Object.freeze({
  type: "ipo_one_tenant_gateway",
  version: "ipo-one-credit-passport-local-no-funds.v1"
});
export const CREDIT_PASSPORT_PURPOSE = "private_credit_review";
export const CREDIT_PASSPORT_DEFAULT_LIFETIME_SECONDS = 15 * 60;
export const CREDIT_PASSPORT_MAX_LIFETIME_SECONDS = 24 * 60 * 60;

export const CreditPassportArtifactStatus = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked"
});

export const CreditPassportVerificationStatus = Object.freeze({
  ACTIVE: "active",
  EXPIRED: "expired",
  REVOKED: "revoked",
  SUPERSEDED: "superseded"
});

export const CreditPassportFactorGrade = Object.freeze({
  VERIFIED: "verified",
  NOT_VERIFIED: "not_verified",
  NOT_APPLICABLE: "not_applicable",
  NOT_DISCLOSED: "not_disclosed"
});

export const CreditPassportClaim = Object.freeze({
  DECISION_OUTCOME: "decision_outcome",
  FACTOR_AUTHORITY: "factor_authority",
  FACTOR_SUBJECT_PRINCIPAL: "factor_subject_principal",
  FACTOR_IDENTITY_OR_PRINCIPAL_BINDING: "factor_identity_or_principal_binding",
  FACTOR_ADVERSE_OBLIGATION: "factor_adverse_obligation",
  FACTOR_SANDBOX_POLICY_FIT: "factor_sandbox_policy_fit",
  CANONICAL_REASON_CODES: "canonical_reason_codes",
  REASON_TO_FEATURE_LINEAGE: "reason_to_feature_lineage",
  SOURCE_EVIDENCE_LINEAGE: "source_evidence_lineage"
});

export const CREDIT_PASSPORT_CLAIM_ALLOWLIST = Object.freeze(
  Object.values(CreditPassportClaim)
);

export const CREDIT_PASSPORT_REVOCATION_REASON_CODES = Object.freeze([
  "owner_withdrawal",
  "verifier_access_no_longer_required",
  "source_disclosure_error",
  "security_concern"
]);

const CLAIM_SET = new Set(CREDIT_PASSPORT_CLAIM_ALLOWLIST);
const REVOCATION_REASON_SET = new Set(CREDIT_PASSPORT_REVOCATION_REASON_CODES);
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;

const FACTOR_RULES = Object.freeze({
  [CreditPassportClaim.FACTOR_AUTHORITY]: Object.freeze({
    positive: Object.freeze(["authority_scope_current"]),
    negative: Object.freeze(["authority_not_current"])
  }),
  [CreditPassportClaim.FACTOR_SUBJECT_PRINCIPAL]: Object.freeze({
    positive: Object.freeze(["principal_and_subject_eligible"]),
    negative: Object.freeze(["application_not_eligible", "credit_state_frozen"])
  }),
  [CreditPassportClaim.FACTOR_IDENTITY_OR_PRINCIPAL_BINDING]: Object.freeze({
    positive: Object.freeze(["identity_evidence_current", "principal_binding_current"]),
    negative: Object.freeze(["identity_evidence_not_current"])
  }),
  [CreditPassportClaim.FACTOR_ADVERSE_OBLIGATION]: Object.freeze({
    positive: Object.freeze(["no_adverse_obligation"]),
    negative: Object.freeze(["adverse_obligation_open", "credit_state_frozen"])
  }),
  [CreditPassportClaim.FACTOR_SANDBOX_POLICY_FIT]: Object.freeze({
    positive: Object.freeze(["within_sandbox_policy_cap", "sandbox_rules_v1_approved"]),
    negative: Object.freeze([
      "sandbox_cap_exceeded",
      "unsupported_sandbox_asset",
      "invalid_requested_schedule"
    ])
  })
});

function invalid(message) {
  throw new DomainError("invalid_credit_passport_artifact", message);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function assertHash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) invalid(`${name} is invalid`);
  return value;
}

function assertDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid(`${name} is invalid`);
  return value;
}

function normalizeClaimSelectors(selectors) {
  if (
    !Array.isArray(selectors) ||
    selectors.length < 1 ||
    selectors.length > CREDIT_PASSPORT_CLAIM_ALLOWLIST.length ||
    selectors.some((claim) => typeof claim !== "string" || !CLAIM_SET.has(claim)) ||
    new Set(selectors).size !== selectors.length
  ) invalid("claim selectors are invalid");
  return Object.freeze(
    [...selectors].sort(
      (left, right) =>
        CREDIT_PASSPORT_CLAIM_ALLOWLIST.indexOf(left) -
        CREDIT_PASSPORT_CLAIM_ALLOWLIST.indexOf(right)
    )
  );
}

function normalizeDecision(decision) {
  if (
    !decision ||
    decision.schemaVersion !== "risk_decision.v3" ||
    decision.sandboxOnly !== true ||
    decision.productionAuthority !== false ||
    !decision.decisionPassport ||
    decision.decisionPassport.schemaVersion !== "risk_decision_passport.v1" ||
    !decision.riskFeatureSnapshot ||
    decision.riskFeatureSnapshot.schemaVersion !== "risk_feature_snapshot.v1" ||
    !Array.isArray(decision.reasons) ||
    decision.reasons.length < 1
  ) invalid("an Evidence-derived sandbox risk decision is required");
  assertHash("decisionHash", decision.decisionHash);
  assertHash("decisionPassportHash", decision.decisionPassport.decisionPassportHash);
  assertHash("featureSnapshotHash", decision.riskFeatureSnapshot.featureSnapshotHash);
  return decision;
}

function allEvidenceLineage(decision) {
  const evidence = decision.riskFeatureSnapshot.sourceEvidence.map((source) => ({
    kind: "evidence",
    role: source.role,
    evidenceHash: source.evidenceHash,
    entityHash: source.entityHash,
    aggregateVersion: source.aggregateVersion,
    sourceFinality: source.sourceFinality
  }));
  evidence.push({
    kind: "risk_state_attestation",
    role: "risk_state_attestation",
    evidenceHash: decision.riskFeatureSnapshot.riskStateAttestation.stateHash,
    entityHash: decision.riskFeatureSnapshot.riskStateAttestation.stateHash,
    aggregateVersion: decision.riskFeatureSnapshot.riskStateAttestation.liveStateVersion,
    sourceFinality: "finalized"
  });
  return evidence;
}

function lineageForRoles(decision, roles) {
  const roleSet = new Set(roles);
  return allEvidenceLineage(decision).filter(({ role }) => roleSet.has(role));
}

function reasonLineage(decision, reasonCodes) {
  const codeSet = new Set(reasonCodes);
  return decision.decisionPassport.reasonLineage
    .filter(({ reasonCode }) => codeSet.has(reasonCode))
    .map((entry) => ({
      reasonCode: entry.reasonCode,
      featureKeys: [...entry.featureKeys],
      sourceRoles: [...entry.sourceRoles]
    }));
}

function factorDisclosure(decision, claim) {
  const rule = FACTOR_RULES[claim];
  const decisionCodes = decision.reasons.map(({ code }) => code);
  const positive = decisionCodes.filter((code) => rule.positive.includes(code));
  const negative = decisionCodes.filter((code) => rule.negative.includes(code));
  const matched = positive.length > 0 ? positive : negative;
  const lineage = reasonLineage(decision, matched);
  const sourceRoles = lineage.flatMap(({ sourceRoles }) => sourceRoles);
  return {
    claim,
    grade:
      positive.length > 0
        ? CreditPassportFactorGrade.VERIFIED
        : negative.length > 0
          ? CreditPassportFactorGrade.NOT_VERIFIED
          : CreditPassportFactorGrade.NOT_DISCLOSED,
    value: null,
    reasonCodes: matched,
    reasonLineage: lineage,
    evidenceLineage:
      matched.length > 0 ? lineageForRoles(decision, sourceRoles) : allEvidenceLineage(decision)
  };
}

function disclosureForClaim(decision, claim) {
  const reasonCodes = decision.reasons.map(({ code }) => code);
  if (FACTOR_RULES[claim]) return factorDisclosure(decision, claim);
  if (claim === CreditPassportClaim.DECISION_OUTCOME) {
    return {
      claim,
      grade: CreditPassportFactorGrade.NOT_APPLICABLE,
      value: decision.status,
      reasonCodes,
      reasonLineage: reasonLineage(decision, reasonCodes),
      evidenceLineage: allEvidenceLineage(decision)
    };
  }
  if (claim === CreditPassportClaim.CANONICAL_REASON_CODES) {
    return {
      claim,
      grade: CreditPassportFactorGrade.NOT_APPLICABLE,
      value: reasonCodes,
      reasonCodes,
      reasonLineage: reasonLineage(decision, reasonCodes),
      evidenceLineage: allEvidenceLineage(decision)
    };
  }
  if (claim === CreditPassportClaim.REASON_TO_FEATURE_LINEAGE) {
    return {
      claim,
      grade: CreditPassportFactorGrade.NOT_APPLICABLE,
      value: reasonLineage(decision, reasonCodes),
      reasonCodes,
      reasonLineage: reasonLineage(decision, reasonCodes),
      evidenceLineage: allEvidenceLineage(decision)
    };
  }
  return {
    claim,
    grade: CreditPassportFactorGrade.NOT_APPLICABLE,
    value: allEvidenceLineage(decision),
    reasonCodes,
    reasonLineage: reasonLineage(decision, reasonCodes),
    evidenceLineage: allEvidenceLineage(decision)
  };
}

export function createCreditPassportArtifact({
  creditPassportArtifactId,
  decision,
  controllerActorRefHash,
  verifierActorRefHash,
  claimSelectors,
  lifetimeSeconds = CREDIT_PASSPORT_DEFAULT_LIFETIME_SECONDS,
  previousArtifact,
  now = new Date()
}) {
  assertDate("now", now);
  const source = normalizeDecision(decision);
  if (
    typeof creditPassportArtifactId !== "string" ||
    creditPassportArtifactId.length < 1 ||
    creditPassportArtifactId.length > 256
  ) invalid("artifact identity is invalid");
  assertHash("controllerActorRefHash", controllerActorRefHash);
  assertHash("verifierActorRefHash", verifierActorRefHash);
  if (
    !Number.isSafeInteger(lifetimeSeconds) ||
    lifetimeSeconds < 60 ||
    lifetimeSeconds > CREDIT_PASSPORT_MAX_LIFETIME_SECONDS
  ) invalid("artifact lifetime is invalid");
  const selectedClaims = normalizeClaimSelectors(claimSelectors);
  const version = previousArtifact === undefined ? 1 : previousArtifact.version + 1;
  if (
    previousArtifact !== undefined &&
    (
      previousArtifact.creditPassportArtifactId !== creditPassportArtifactId ||
      previousArtifact.status !== CreditPassportArtifactStatus.ACTIVE ||
      previousArtifact.verifierActorRefHash !== verifierActorRefHash ||
      previousArtifact.purpose !== CREDIT_PASSPORT_PURPOSE ||
      previousArtifact.sourceRiskDecisionId !== source.riskDecisionId
    )
  ) invalid("artifact replacement does not match the active artifact");
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + lifetimeSeconds * 1000).toISOString();
  const disclosures = selectedClaims.map((claim) => disclosureForClaim(source, claim));
  if (disclosures.some(({ evidenceLineage }) => evidenceLineage.length < 1)) {
    invalid("every disclosed claim requires Evidence lineage");
  }
  const core = {
    creditPassportArtifactId,
    sourceRiskDecisionId: source.riskDecisionId,
    sourceRiskDecisionPassportId: source.decisionPassport.riskDecisionPassportId,
    sourceDecisionHash: source.decisionHash,
    sourceDecisionPassportHash: source.decisionPassport.decisionPassportHash,
    sourceFeatureSnapshotHash: source.riskFeatureSnapshot.featureSnapshotHash,
    subjectId: source.subjectId,
    authorityType: source.authorityType,
    controllerActorRefHash,
    verifierActorRefHash,
    purpose: CREDIT_PASSPORT_PURPOSE,
    selectedClaims,
    disclosures,
    claimManifestHash: hashId("credit_passport_claim_manifest", {
      selectedClaims,
      disclosures
    }),
    issuer: CREDIT_PASSPORT_ISSUER,
    issuedAt,
    expiresAt,
    status: CreditPassportArtifactStatus.ACTIVE,
    version,
    ...(previousArtifact === undefined
      ? {}
      : {
          supersedesArtifactHash: previousArtifact.artifactHash,
          supersedesVersion: previousArtifact.version
        }),
    onlineVerificationRequired: true,
    sameTenantOnly: true,
    pointInTime: true,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionAuthority: false,
    piiIncluded: false,
    rawTransactionDataIncluded: false,
    scoreAuthoritative: false
  };
  assertNoRawPiiReference(core, "creditPassportArtifact");
  return deepFreeze({
    ...core,
    artifactHash: hashId("credit_passport_artifact", core),
    schemaVersion: CREDIT_PASSPORT_ARTIFACT_SCHEMA_VERSION
  });
}

export function revokeCreditPassportArtifact({ artifact, reasonCode, now = new Date() }) {
  assertDate("now", now);
  if (
    artifact?.schemaVersion !== CREDIT_PASSPORT_ARTIFACT_SCHEMA_VERSION ||
    artifact.status !== CreditPassportArtifactStatus.ACTIVE ||
    !REVOCATION_REASON_SET.has(reasonCode)
  ) invalid("active artifact and approved revocation reason are required");
  const core = {
    ...artifact,
    status: CreditPassportArtifactStatus.REVOKED,
    version: artifact.version + 1,
    revokedAt: now.toISOString(),
    revocationReasonCode: reasonCode
  };
  delete core.artifactHash;
  delete core.schemaVersion;
  return deepFreeze({
    ...core,
    artifactHash: hashId("credit_passport_artifact", core),
    schemaVersion: CREDIT_PASSPORT_ARTIFACT_SCHEMA_VERSION
  });
}

export function verifyCreditPassportArtifact({
  artifact,
  presentedArtifactHash,
  presentedVersion,
  sourceDecision,
  now = new Date()
}) {
  assertDate("now", now);
  if (artifact?.schemaVersion !== CREDIT_PASSPORT_ARTIFACT_SCHEMA_VERSION) {
    invalid("artifact is invalid");
  }
  const superseded =
    presentedArtifactHash !== artifact.artifactHash ||
    presentedVersion !== artifact.version;
  const revoked = artifact.status === CreditPassportArtifactStatus.REVOKED;
  const expired = now >= new Date(artifact.expiresAt);
  const sourceCurrent =
    sourceDecision?.schemaVersion === "risk_decision.v3" &&
    sourceDecision.decisionHash === artifact.sourceDecisionHash &&
    sourceDecision.decisionPassport?.decisionPassportHash ===
      artifact.sourceDecisionPassportHash;
  const status = superseded
    ? CreditPassportVerificationStatus.SUPERSEDED
    : revoked
      ? CreditPassportVerificationStatus.REVOKED
      : expired
        ? CreditPassportVerificationStatus.EXPIRED
        : CreditPassportVerificationStatus.ACTIVE;
  return deepFreeze({
    verified: status === CreditPassportVerificationStatus.ACTIVE && sourceCurrent,
    status,
    sourceCurrent,
    checkedAt: now.toISOString(),
    artifactHash: presentedArtifactHash,
    artifactVersion: presentedVersion,
    onlineVerificationRequired: true,
    schemaVersion: "credit_passport_verification.v1"
  });
}
