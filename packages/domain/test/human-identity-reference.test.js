import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ConsentPurpose,
  DomainError,
  HumanIdentityAssurance,
  HumanIdentityReferenceStatus,
  HumanIdentityReferenceType,
  RepaymentFrequency,
  assertHumanIdentityReferenceUsable,
  createConsentRecord,
  createHumanIdentityReference,
  expireHumanIdentityReference,
  revokeConsentRecord,
  revokeHumanIdentityReference
} from "../src/index.js";

const NOW = new Date("2026-07-15T00:00:00.000Z");

function consent(overrides = {}) {
  return createConsentRecord({
    subjectId: "subject_human_1",
    principalId: "principal_human_1",
    purposes: [
      ConsentPurpose.CREDIT_APPLICATION,
      ConsentPurpose.CREDIT_DECISION,
      ConsentPurpose.IDENTITY_REFERENCE_USE
    ],
    allowedAssetIds: ["asset:demo-usd"],
    allowedCreditPurposeCodes: ["human_sandbox_credit"],
    allowedRepaymentFrequencies: [RepaymentFrequency.MONTHLY],
    maxRequestedPrincipalMinor: "100000",
    maxRequestedTermDays: 90,
    maxInstallmentCount: 3,
    termsRef: "urn:ipo.one:sandbox:consent-terms:v1",
    termsVersion: "credit_consent_terms.v1",
    dataUsageRef: "urn:ipo.one:sandbox:data-usage:v1",
    dataUsageVersion: "credit_data_usage.v1",
    disclosureRef: "urn:ipo.one:sandbox:human-disclosure:v1",
    validFrom: NOW.toISOString(),
    expiresAt: "2026-10-15T00:00:00.000Z",
    now: NOW,
    ...overrides
  });
}

function identityReference(authority, overrides = {}) {
  return createHumanIdentityReference({
    subjectId: authority.subjectId,
    principalId: authority.principalId,
    consent: authority,
    referenceType: HumanIdentityReferenceType.VERIFIABLE_CREDENTIAL_REFERENCE,
    providerRef: "urn:ipo.one:mock:identity-provider:v1",
    providerVersion: "mock_identity_provider.v1",
    referenceRef: "urn:ipo.one:mock:identity-evidence:human-1:v1",
    assuranceLevel: HumanIdentityAssurance.SYNTHETIC_PROVIDER_ASSERTED,
    purposeCodes: [ConsentPurpose.IDENTITY_REFERENCE_USE, ConsentPurpose.CREDIT_DECISION],
    validFrom: NOW.toISOString(),
    expiresAt: "2026-09-15T00:00:00.000Z",
    now: NOW,
    ...overrides
  });
}

test("synthetic Human identity reference requires exact live Consent", () => {
  const authority = consent();
  const reference = identityReference(authority);

  assert.equal(assertHumanIdentityReferenceUsable(reference, authority, {
    subjectId: authority.subjectId,
    principalId: authority.principalId,
    purposeCode: ConsentPurpose.CREDIT_DECISION,
    now: NOW
  }), true);
  assert.equal(reference.status, HumanIdentityReferenceStatus.ACTIVE);
  assert.equal(reference.syntheticOnly, true);
  assert.equal(reference.productionVerified, false);
  assert.match(reference.identityReferenceHash, /^0x[a-f0-9]{64}$/);
  assert.match(reference.referenceEvidenceHash, /^0x[a-f0-9]{64}$/);
});

test("identity reference hashes survive JSON transport and expose no claims", () => {
  const authority = consent();
  const original = identityReference(authority);
  const replayed = identityReference(JSON.parse(JSON.stringify(authority)));

  assert.equal(replayed.identityReferenceHash, original.identityReferenceHash);
  assert.equal(replayed.referenceEvidenceHash, original.referenceEvidenceHash);
  assert.equal(Object.hasOwn(original, "claims"), false);
  assert.equal(Object.hasOwn(original, "document"), false);
});

test("identity references reject unsafe references, raw data, unversioned providers, and overlong validity", () => {
  const authority = consent();
  assert.throws(
    () => identityReference(authority, { providerRef: "https://user:password@example.com/provider" }),
    /unsafe_identity_reference/
  );
  assert.throws(
    () => identityReference(authority, { referenceRef: "https://example.com/evidence?token=secret" }),
    /unsafe_identity_reference/
  );
  assert.throws(
    () => identityReference(authority, { providerVersion: "latest" }),
    /invalid_identity_reference_version/
  );
  assert.throws(
    () => identityReference(authority, { expiresAt: "2026-11-15T00:00:00.000Z" }),
    /identity_reference_exceeds_consent/
  );
  assert.throws(
    () => createHumanIdentityReference({ ...identityReference(authority), consent: authority, passportNumber: "NOPE" }),
    /raw_pii_prohibited/
  );
});

test("identity reference revocation and expiry are terminal and preserve immutable hashes", () => {
  const authority = consent();
  const reference = identityReference(authority);
  const revoked = revokeHumanIdentityReference(reference, {
    reasonCode: "provider_withdrawal",
    evidenceRef: "urn:ipo.one:evidence:identity-reference-revocation:1",
    now: new Date("2026-07-16T00:00:00.000Z")
  });
  assert.equal(revoked.status, HumanIdentityReferenceStatus.REVOKED);
  assert.equal(revoked.identityReferenceHash, reference.identityReferenceHash);
  assert.equal(revokeHumanIdentityReference(revoked, {
    reasonCode: "ignored_replay",
    evidenceRef: "urn:ipo.one:evidence:identity-reference-revocation:2",
    now: new Date("2026-07-17T00:00:00.000Z")
  }).revocationReasonCode, "provider_withdrawal");

  assert.throws(
    () => expireHumanIdentityReference(reference, { now: new Date("2026-07-16T00:00:00.000Z") }),
    /identity_reference_not_expired/
  );
  const expired = expireHumanIdentityReference(reference, { now: new Date(reference.expiresAt) });
  assert.equal(expired.status, HumanIdentityReferenceStatus.EXPIRED);
  assert.equal(expired.identityReferenceHash, reference.identityReferenceHash);
});

test("identity reference use fails for mismatched, future, expired, revoked, or production-capable Evidence", () => {
  const authority = consent();
  const reference = identityReference(authority);
  const inputs = [
    { reference, consent: authority, subjectId: "subject_other", principalId: authority.principalId },
    { reference, consent: authority, subjectId: authority.subjectId, principalId: "principal_other" },
    { reference: { ...reference, productionVerified: true }, consent: authority, subjectId: authority.subjectId, principalId: authority.principalId },
    {
      reference: revokeHumanIdentityReference(reference, {
        reasonCode: "provider_withdrawal",
        evidenceRef: "urn:ipo.one:evidence:identity-reference-revocation:1",
        now: new Date("2026-07-16T00:00:00.000Z")
      }),
      consent: authority,
      subjectId: authority.subjectId,
      principalId: authority.principalId
    },
    { reference, consent: consent(), subjectId: authority.subjectId, principalId: authority.principalId },
    {
      reference,
      consent: revokeConsentRecord(authority, {
        reasonCode: "human_withdrawal",
        evidenceRef: "urn:ipo.one:evidence:consent-revocation:1",
        now: new Date("2026-07-16T00:00:00.000Z")
      }),
      subjectId: authority.subjectId,
      principalId: authority.principalId
    }
  ];
  for (const input of inputs) {
    assert.throws(() => assertHumanIdentityReferenceUsable(input.reference, input.consent, {
      subjectId: input.subjectId,
      principalId: input.principalId,
      purposeCode: ConsentPurpose.CREDIT_DECISION,
      now: NOW
    }), DomainError);
  }
  assert.throws(() => assertHumanIdentityReferenceUsable(reference, authority, {
    subjectId: authority.subjectId,
    principalId: authority.principalId,
    purposeCode: ConsentPurpose.CREDIT_DECISION,
    now: new Date(reference.expiresAt)
  }), /identity_reference_expired/);
});

test("runtime Human identity-reference fields stay aligned with the closed schema", async () => {
  const schema = JSON.parse(
    await readFile(new URL("../../../schemas/v2/human-identity-reference.schema.json", import.meta.url), "utf8")
  );
  const authority = consent();
  const active = identityReference(authority);
  const values = [
    active,
    revokeHumanIdentityReference(active, {
      reasonCode: "provider_withdrawal",
      evidenceRef: "urn:ipo.one:evidence:identity-reference-revocation:1",
      now: new Date("2026-07-16T00:00:00.000Z")
    }),
    expireHumanIdentityReference(active, { now: new Date(active.expiresAt) })
  ];
  for (const value of values) {
    const serialized = JSON.parse(JSON.stringify(value));
    assert.deepEqual(Object.keys(serialized).filter((key) => !Object.hasOwn(schema.properties, key)), []);
    assert.deepEqual(schema.required.filter((key) => !Object.hasOwn(serialized, key)), []);
    assert.equal(serialized.schemaVersion, schema.properties.schemaVersion.const);
  }
});
