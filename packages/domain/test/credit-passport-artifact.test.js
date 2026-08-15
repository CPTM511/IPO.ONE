import assert from "node:assert/strict";
import test from "node:test";
import {
  CreditAuthorityType,
  CreditPassportClaim,
  CreditPassportVerificationStatus,
  RepaymentFrequency,
  createCreditIntent,
  createCreditPassportArtifact,
  createEvidenceDerivedCreditDecisionOutcome,
  revokeCreditPassportArtifact,
  verifyCreditPassportArtifact
} from "../src/index.js";

const NOW = new Date("2026-07-24T10:00:00.000Z");
const CONTROLLER_HASH = `0x${"a".repeat(64)}`;
const VERIFIER_HASH = `0x${"b".repeat(64)}`;

function evidenceSource(role, suffix, authorityType) {
  return {
    role,
    entityType:
      role === "authority"
        ? authorityType === CreditAuthorityType.CONSENT
          ? "consent_record"
          : "mandate"
        : role,
    entityIdHash: `0x${suffix.repeat(64)}`,
    entityHash: `0x${suffix.repeat(64)}`,
    aggregateVersion: 1,
    eventId: `credit_event_${role}_${suffix}`,
    evidenceHash: `0x${suffix.repeat(64)}`,
    sourceFinality: "finalized"
  };
}

function decisionFor(authorityType) {
  const human = authorityType === CreditAuthorityType.CONSENT;
  const intent = createCreditIntent({
    subjectId: human ? "subject_human_passport" : "subject_agent_passport",
    principalId: "principal_passport",
    authorityType,
    authorityRef: human ? "consent_passport" : "mandate_passport",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "12000",
    purposeCode: human ? "income_smoothing" : "provider_working_capital",
    requestedTermDays: 60,
    repaymentFrequency: RepaymentFrequency.MONTHLY,
    installmentCount: 2,
    now: NOW
  });
  const sourceEvidence = [
    evidenceSource("credit_intent", "1", authorityType),
    evidenceSource("subject", "2", authorityType),
    evidenceSource("principal", "3", authorityType),
    evidenceSource("authority", "4", authorityType),
    ...(human ? [evidenceSource("human_identity_reference", "5", authorityType)] : [])
  ];
  return createEvidenceDerivedCreditDecisionOutcome({
    intent,
    eligibilityFacts: {
      subjectEligible: true,
      subjectSuspended: false,
      principalEligible: true,
      authorityCurrent: true,
      identityEvidenceCurrent: human ? true : null,
      principalBindingCurrent: human ? null : true
    },
    sourceEvidence,
    riskState: {
      adverseObligationCount: 0,
      frozenCreditLineCount: 0,
      liveStateVersion: 1,
      queryVersion: "credit-application-risk-state.v1",
      stateHash: `0x${"6".repeat(64)}`
    },
    now: NOW
  }).decision;
}

function issue(decision, overrides = {}) {
  return createCreditPassportArtifact({
    creditPassportArtifactId: "credit_passport_artifact_test",
    decision,
    controllerActorRefHash: CONTROLLER_HASH,
    verifierActorRefHash: VERIFIER_HASH,
    claimSelectors: [
      CreditPassportClaim.DECISION_OUTCOME,
      CreditPassportClaim.FACTOR_AUTHORITY
    ],
    lifetimeSeconds: 900,
    now: NOW,
    ...overrides
  });
}

test("Credit Passport discloses only selected, evidenced claims with mandatory safety flags", () => {
  const artifact = issue(decisionFor(CreditAuthorityType.CONSENT));

  assert.deepEqual(artifact.selectedClaims, [
    CreditPassportClaim.DECISION_OUTCOME,
    CreditPassportClaim.FACTOR_AUTHORITY
  ]);
  assert.deepEqual(
    artifact.disclosures.map(({ claim }) => claim),
    artifact.selectedClaims
  );
  assert.ok(artifact.disclosures.every(({ evidenceLineage }) => evidenceLineage.length > 0));
  assert.equal(artifact.expiresAt, "2026-07-24T10:15:00.000Z");
  assert.equal(artifact.pointInTime, true);
  assert.equal(artifact.nonAuthorizing, true);
  assert.equal(artifact.productionAuthority, false);
  assert.equal(artifact.piiIncluded, false);
  assert.equal(artifact.rawTransactionDataIncluded, false);
  assert.equal(artifact.scoreAuthoritative, false);
  assert.equal(Object.hasOwn(artifact, "score"), false);
  assert.equal(JSON.stringify(artifact).includes("walletAddress"), false);
});

test("Human Consent and Agent Mandate artifacts use the same closed Evidence semantics", () => {
  const human = issue(decisionFor(CreditAuthorityType.CONSENT));
  const agent = issue(decisionFor(CreditAuthorityType.MANDATE), {
    creditPassportArtifactId: "credit_passport_artifact_agent"
  });

  assert.deepEqual(Object.keys(agent).sort(), Object.keys(human).sort());
  assert.deepEqual(agent.selectedClaims, human.selectedClaims);
  assert.ok(agent.disclosures.every(({ evidenceLineage }) => evidenceLineage.length > 0));
  assert.equal(human.authorityType, CreditAuthorityType.CONSENT);
  assert.equal(agent.authorityType, CreditAuthorityType.MANDATE);
});

test("replacement supersedes the prior exact hash and version", () => {
  const decision = decisionFor(CreditAuthorityType.CONSENT);
  const first = issue(decision);
  const replacement = issue(decision, {
    previousArtifact: first,
    claimSelectors: [CreditPassportClaim.SOURCE_EVIDENCE_LINEAGE],
    now: new Date("2026-07-24T10:01:00.000Z")
  });
  const verification = verifyCreditPassportArtifact({
    artifact: replacement,
    presentedArtifactHash: first.artifactHash,
    presentedVersion: first.version,
    sourceDecision: decision,
    now: new Date("2026-07-24T10:02:00.000Z")
  });

  assert.equal(replacement.version, 2);
  assert.equal(replacement.supersedesArtifactHash, first.artifactHash);
  assert.equal(replacement.supersedesVersion, 1);
  assert.equal(verification.verified, false);
  assert.equal(verification.status, CreditPassportVerificationStatus.SUPERSEDED);
});

test("trusted-time expiry and terminal revocation fail verification closed", () => {
  const decision = decisionFor(CreditAuthorityType.CONSENT);
  const artifact = issue(decision);
  const before = verifyCreditPassportArtifact({
    artifact,
    presentedArtifactHash: artifact.artifactHash,
    presentedVersion: artifact.version,
    sourceDecision: decision,
    now: new Date("2026-07-24T10:14:59.999Z")
  });
  const expired = verifyCreditPassportArtifact({
    artifact,
    presentedArtifactHash: artifact.artifactHash,
    presentedVersion: artifact.version,
    sourceDecision: decision,
    now: new Date(artifact.expiresAt)
  });
  const revokedArtifact = revokeCreditPassportArtifact({
    artifact,
    reasonCode: "owner_withdrawal",
    now: new Date("2026-07-24T10:05:00.000Z")
  });
  const revoked = verifyCreditPassportArtifact({
    artifact: revokedArtifact,
    presentedArtifactHash: revokedArtifact.artifactHash,
    presentedVersion: revokedArtifact.version,
    sourceDecision: decision,
    now: new Date("2026-07-24T10:06:00.000Z")
  });

  assert.equal(before.verified, true);
  assert.equal(expired.status, CreditPassportVerificationStatus.EXPIRED);
  assert.equal(expired.verified, false);
  assert.equal(revoked.status, CreditPassportVerificationStatus.REVOKED);
  assert.equal(revoked.verified, false);
  assert.throws(
    () =>
      revokeCreditPassportArtifact({
        artifact: revokedArtifact,
        reasonCode: "owner_withdrawal",
        now: new Date("2026-07-24T10:07:00.000Z")
      }),
    /invalid_credit_passport_artifact/
  );
});

test("unknown or duplicated disclosure selectors fail closed", () => {
  const decision = decisionFor(CreditAuthorityType.CONSENT);
  assert.throws(
    () => issue(decision, { claimSelectors: ["credit_score"] }),
    /invalid_credit_passport_artifact/
  );
  assert.throws(
    () =>
      issue(decision, {
        claimSelectors: [
          CreditPassportClaim.DECISION_OUTCOME,
          CreditPassportClaim.DECISION_OUTCOME
        ]
      }),
    /invalid_credit_passport_artifact/
  );
});
