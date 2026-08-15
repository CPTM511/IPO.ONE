import assert from "node:assert/strict";
import test from "node:test";
import {
  createCreditPassportPresentation,
  selectedCreditPassportClaims
} from "../src/credit-passport-presentation.js";

function artifact(overrides = {}) {
  return {
    creditPassportArtifactId: "credit_passport_artifact_test",
    artifactHash: `0x${"1".repeat(64)}`,
    sourceDecisionPassportHash: `0x${"2".repeat(64)}`,
    purpose: "private_credit_review",
    selectedClaims: ["factor_authority"],
    disclosures: [{
      claim: "factor_authority",
      grade: "verified",
      value: null,
      reasonCodes: ["authority_scope_current"],
      reasonLineage: [],
      evidenceLineage: [{
        kind: "evidence",
        role: "authority",
        evidenceHash: `0x${"3".repeat(64)}`,
        entityHash: `0x${"4".repeat(64)}`,
        aggregateVersion: 1,
        sourceFinality: "finalized"
      }]
    }],
    issuer: {
      type: "ipo_one_tenant_gateway",
      version: "ipo-one-credit-passport-local-no-funds.v1"
    },
    issuedAt: "2026-07-24T10:00:00.000Z",
    expiresAt: "2026-07-24T10:15:00.000Z",
    effectiveStatus: "active",
    version: 1,
    onlineVerificationRequired: true,
    sameTenantOnly: true,
    pointInTime: true,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionAuthority: false,
    piiIncluded: false,
    rawTransactionDataIncluded: false,
    scoreAuthoritative: false,
    schemaVersion: "credit_passport_artifact.v1",
    ...overrides
  };
}

test("presentation accepts only selected, evidenced, mandatory-safe claims", () => {
  const presentation = createCreditPassportPresentation(artifact());
  assert.equal(presentation.statusLabel, "Active");
  assert.equal(presentation.disclosures[0].claimLabel, "Authority factor");
  assert.deepEqual(presentation.verificationPayload, {
    artifactHash: `0x${"1".repeat(64)}`,
    artifactVersion: 1,
    purpose: "private_credit_review",
    schemaVersion: "credit_passport_verification_request.v1"
  });
});

test("presentation rejects mass-assigned unsafe output and safety drift", () => {
  assert.throws(
    () => createCreditPassportPresentation(artifact({ walletAddress: "0xunsafe" })),
    /Unsafe Credit Passport response/
  );
  assert.throws(
    () => createCreditPassportPresentation(artifact({ scoreAuthoritative: true })),
    /Unsafe Credit Passport response/
  );
  assert.throws(
    () =>
      createCreditPassportPresentation(artifact({
        disclosures: [{
          ...artifact().disclosures[0],
          claim: "canonical_reason_codes"
        }]
      })),
    /Unsafe Credit Passport response/
  );
});

test("selector helper admits only checked allowlisted values", () => {
  const form = {
    querySelectorAll() {
      return [
        { value: "decision_outcome" },
        { value: "canonical_reason_codes" }
      ];
    }
  };
  assert.deepEqual(selectedCreditPassportClaims(form), [
    "decision_outcome",
    "canonical_reason_codes"
  ]);
  assert.throws(
    () =>
      selectedCreditPassportClaims({
        querySelectorAll() {
          return [{ value: "credit_score" }];
        }
      }),
    /approved Credit Passport disclosure/
  );
});
