import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ConsentPurpose,
  ConsentStatus,
  CreditAuthorityType,
  DomainError,
  RepaymentFrequency,
  assertConsentAuthorizesCreditIntent,
  createConsentRecord,
  createCreditIntent,
  expireConsentRecord,
  revokeConsentRecord
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
    allowedRepaymentFrequencies: [RepaymentFrequency.MONTHLY, RepaymentFrequency.END_OF_TERM],
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

function intent(authority, overrides = {}) {
  return createCreditIntent({
    subjectId: authority.subjectId,
    principalId: authority.principalId,
    authorityType: CreditAuthorityType.CONSENT,
    authorityRef: authority.consentId,
    assetId: "asset:demo-usd",
    requestedPrincipalMinor: "75000",
    purposeCode: "human_sandbox_credit",
    requestedTermDays: 60,
    repaymentFrequency: RepaymentFrequency.MONTHLY,
    installmentCount: 2,
    now: NOW,
    ...overrides
  });
}

test("active Human Consent authorizes only one bounded sandbox Credit Intent scope", () => {
  const authority = consent();
  const creditIntent = intent(authority);

  assert.equal(assertConsentAuthorizesCreditIntent(authority, creditIntent, { now: NOW }), true);
  assert.equal(authority.status, ConsentStatus.ACTIVE);
  assert.equal(authority.sandboxOnly, true);
  assert.equal(authority.productionAuthority, false);
  assert.match(authority.consentHash, /^0x[a-f0-9]{64}$/);
  assert.match(authority.termsHash, /^0x[a-f0-9]{64}$/);
  assert.match(authority.dataUsageHash, /^0x[a-f0-9]{64}$/);
});

test("Consent hashes survive JSON transport and references cannot carry credentials", () => {
  const original = consent();
  const replayed = consent(JSON.parse(JSON.stringify(original)));
  assert.equal(replayed.consentHash, original.consentHash);
  assert.equal(replayed.termsHash, original.termsHash);
  assert.equal(replayed.dataUsageHash, original.dataUsageHash);

  assert.throws(
    () => consent({ termsRef: "https://user:password@example.com/terms" }),
    /unsafe_consent_reference/
  );
  assert.throws(
    () => consent({ dataUsageRef: "https://example.com/usage?token=secret" }),
    /unsafe_consent_reference/
  );
  assert.throws(
    () => consent({ disclosureRef: "data:text/plain,unsafe" }),
    /unsafe_consent_reference/
  );
});

test("revocation and expiry are terminal and preserve the immutable authority record", () => {
  const authority = consent();
  const revoked = revokeConsentRecord(authority, {
    reasonCode: "human_withdrawal",
    evidenceRef: "urn:ipo.one:evidence:consent-revocation:1",
    now: new Date("2026-07-16T00:00:00.000Z")
  });
  assert.equal(revoked.status, ConsentStatus.REVOKED);
  assert.equal(revoked.consentHash, authority.consentHash);
  assert.equal(revokeConsentRecord(revoked, {
    reasonCode: "ignored_replay",
    evidenceRef: "urn:ipo.one:evidence:consent-revocation:2",
    now: new Date("2026-07-17T00:00:00.000Z")
  }).revocationReasonCode, "human_withdrawal");
  assert.throws(() => assertConsentAuthorizesCreditIntent(revoked, intent(authority), { now: NOW }), /consent_not_active/);

  assert.throws(
    () => expireConsentRecord(authority, { now: new Date("2026-07-16T00:00:00.000Z") }),
    /consent_not_expired/
  );
  const expired = expireConsentRecord(authority, { now: new Date("2026-10-15T00:00:00.000Z") });
  assert.equal(expired.status, ConsentStatus.EXPIRED);
  assert.equal(expired.consentHash, authority.consentHash);
});

test("Consent rejects authority, scope, amount, term, schedule, time, and production mismatches", () => {
  const authority = consent();
  const cases = [
    intent(authority, { authorityType: CreditAuthorityType.MANDATE }),
    intent(authority, { authorityRef: "consent_other" }),
    intent(authority, { subjectId: "subject_agent_1" }),
    intent(authority, { principalId: "principal_other" }),
    intent(authority, { assetId: "asset:other" }),
    intent(authority, { purposeCode: "other_use" }),
    intent(authority, { repaymentFrequency: RepaymentFrequency.WEEKLY }),
    intent(authority, { requestedPrincipalMinor: "100001" }),
    intent(authority, { requestedTermDays: 91 }),
    intent(authority, { installmentCount: 4 })
  ];
  for (const value of cases) {
    assert.throws(() => assertConsentAuthorizesCreditIntent(authority, value, { now: NOW }), DomainError);
  }

  const future = consent({
    validFrom: "2026-07-16T00:00:00.000Z",
    expiresAt: "2026-08-16T00:00:00.000Z"
  });
  assert.throws(() => assertConsentAuthorizesCreditIntent(future, intent(future), { now: NOW }), /consent_not_yet_valid/);
  assert.throws(
    () => assertConsentAuthorizesCreditIntent(authority, intent(authority), { now: new Date(authority.expiresAt) }),
    /consent_expired/
  );
  assert.throws(
    () => assertConsentAuthorizesCreditIntent(
      { ...authority, productionAuthority: true },
      intent(authority),
      { now: NOW }
    ),
    /production_consent_prohibited/
  );
});

test("Consent creation rejects unbounded, backdated, duplicate, raw-PII, and unsafe contracts", () => {
  assert.throws(() => consent({ purposes: [ConsentPurpose.CREDIT_DECISION] }), /credit_application_consent_required/);
  assert.throws(
    () => consent({ allowedAssetIds: ["asset:demo-usd", "asset:demo-usd"] }),
    /duplicate_consent_scope/
  );
  assert.throws(() => consent({ maxRequestedPrincipalMinor: "0" }), DomainError);
  assert.throws(() => consent({ maxRequestedTermDays: 3_661 }), /invalid_consent_limit/);
  assert.throws(() => consent({ termsVersion: "latest" }), /invalid_consent_version/);
  assert.throws(
    () => consent({ validFrom: "2026-07-14T00:00:00.000Z" }),
    /backdated_consent_prohibited/
  );
  assert.throws(
    () => consent({ expiresAt: "2027-07-17T00:00:00.000Z" }),
    /consent_window_too_long/
  );
  assert.throws(
    () => createConsentRecord({ ...consent(), rawKyc: "prohibited", now: NOW }),
    DomainError
  );
});

test("runtime Consent fields stay aligned with the closed schema surface", async () => {
  const schema = JSON.parse(
    await readFile(new URL("../../../schemas/v2/consent-record.schema.json", import.meta.url), "utf8")
  );
  for (const value of [
    consent(),
    revokeConsentRecord(consent(), {
      reasonCode: "human_withdrawal",
      evidenceRef: "urn:ipo.one:evidence:consent-revocation:1",
      now: new Date("2026-07-16T00:00:00.000Z")
    }),
    expireConsentRecord(consent(), { now: new Date("2026-10-15T00:00:00.000Z") })
  ]) {
    const serialized = JSON.parse(JSON.stringify(value));
    assert.deepEqual(
      Object.keys(serialized).filter((key) => !Object.hasOwn(schema.properties, key)),
      []
    );
    assert.deepEqual(
      schema.required.filter((key) => !Object.hasOwn(serialized, key)),
      []
    );
    assert.equal(serialized.schemaVersion, schema.properties.schemaVersion.const);
  }
});
