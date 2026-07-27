export const CREDIT_PASSPORT_CLAIMS = Object.freeze([
  Object.freeze({ value: "decision_outcome", label: "Decision outcome" }),
  Object.freeze({ value: "factor_authority", label: "Authority factor" }),
  Object.freeze({ value: "factor_subject_principal", label: "Subject & principal factor" }),
  Object.freeze({
    value: "factor_identity_or_principal_binding",
    label: "Identity / principal binding factor"
  }),
  Object.freeze({ value: "factor_adverse_obligation", label: "Adverse Obligation factor" }),
  Object.freeze({ value: "factor_sandbox_policy_fit", label: "Sandbox policy factor" }),
  Object.freeze({ value: "canonical_reason_codes", label: "Canonical reason codes" }),
  Object.freeze({ value: "reason_to_feature_lineage", label: "Reason-to-feature lineage" }),
  Object.freeze({ value: "source_evidence_lineage", label: "Source Evidence lineage" })
]);

const CLAIM_LABELS = new Map(CREDIT_PASSPORT_CLAIMS.map(({ value, label }) => [value, label]));
const STATUS_LABELS = Object.freeze({
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  superseded: "Superseded"
});
const GRADE_LABELS = Object.freeze({
  verified: "Verified",
  not_verified: "Not verified",
  not_applicable: "Not applicable",
  not_disclosed: "Not disclosed"
});
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const FORBIDDEN_OUTPUT_KEYS = new Set([
  "address",
  "email",
  "name",
  "phone",
  "rawEvent",
  "rawTransaction",
  "signature",
  "walletAddress"
]);

function invalid(message) {
  throw new TypeError(`Unsafe Credit Passport response: ${message}`);
}

function assertNoForbiddenOutput(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_OUTPUT_KEYS.has(key)) invalid(`${key} is not an approved disclosure`);
    assertNoForbiddenOutput(nested);
  }
}

function assertArtifact(artifact) {
  if (
    !artifact ||
    artifact.schemaVersion !== "credit_passport_artifact.v1" ||
    !IDENTIFIER_PATTERN.test(artifact.creditPassportArtifactId ?? "") ||
    !HASH_PATTERN.test(artifact.artifactHash ?? "") ||
    !HASH_PATTERN.test(artifact.sourceDecisionPassportHash ?? "") ||
    artifact.issuer?.type !== "ipo_one_tenant_gateway" ||
    artifact.issuer?.version !== "ipo-one-credit-passport-local-no-funds.v1" ||
    artifact.purpose !== "private_credit_review" ||
    artifact.onlineVerificationRequired !== true ||
    artifact.sameTenantOnly !== true ||
    artifact.pointInTime !== true ||
    artifact.nonAuthorizing !== true ||
    artifact.sandboxOnly !== true ||
    artifact.productionAuthority !== false ||
    artifact.piiIncluded !== false ||
    artifact.rawTransactionDataIncluded !== false ||
    artifact.scoreAuthoritative !== false ||
    !STATUS_LABELS[artifact.effectiveStatus] ||
    !Number.isSafeInteger(artifact.version) ||
    artifact.version < 1 ||
    !Array.isArray(artifact.selectedClaims) ||
    artifact.selectedClaims.length < 1 ||
    !Array.isArray(artifact.disclosures) ||
    artifact.disclosures.length !== artifact.selectedClaims.length
  ) invalid("mandatory safety or identity fields do not match v1");
  const selected = new Set(artifact.selectedClaims);
  if (
    selected.size !== artifact.selectedClaims.length ||
    [...selected].some((claim) => !CLAIM_LABELS.has(claim)) ||
    artifact.disclosures.some(
      (disclosure) =>
        !selected.has(disclosure.claim) ||
        !GRADE_LABELS[disclosure.grade] ||
        !Array.isArray(disclosure.evidenceLineage) ||
        disclosure.evidenceLineage.length < 1
    )
  ) invalid("disclosures exceed the selected, evidenced claim set");
  assertNoForbiddenOutput(artifact);
}

export function createCreditPassportPresentation(artifact) {
  assertArtifact(artifact);
  return Object.freeze({
    artifact,
    statusLabel: STATUS_LABELS[artifact.effectiveStatus],
    statusTone: artifact.effectiveStatus === "active" ? "ready" : "warning",
    artifactLabel: `${artifact.creditPassportArtifactId} · v${artifact.version}`,
    issuerLabel: `${artifact.issuer.type} · ${artifact.issuer.version}`,
    lifetimeLabel: `${new Date(artifact.issuedAt).toLocaleString()} → ${new Date(
      artifact.expiresAt
    ).toLocaleString()}`,
    disclosures: Object.freeze(
      artifact.disclosures.map((disclosure) =>
        Object.freeze({
          ...disclosure,
          claimLabel: CLAIM_LABELS.get(disclosure.claim),
          gradeLabel: GRADE_LABELS[disclosure.grade],
          evidenceCount: disclosure.evidenceLineage.length
        })
      )
    ),
    verificationPayload: Object.freeze({
      artifactHash: artifact.artifactHash,
      artifactVersion: artifact.version,
      purpose: "private_credit_review",
      schemaVersion: "credit_passport_verification_request.v1"
    })
  });
}

export function selectedCreditPassportClaims(form) {
  const values = [...form.querySelectorAll('input[name="creditPassportClaim"]:checked')]
    .map((input) => input.value);
  if (
    values.length < 1 ||
    new Set(values).size !== values.length ||
    values.some((value) => !CLAIM_LABELS.has(value))
  ) {
    throw new TypeError("Choose at least one approved Credit Passport disclosure.");
  }
  return values;
}
