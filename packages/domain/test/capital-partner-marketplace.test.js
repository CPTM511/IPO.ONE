import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CreditAuthorityType,
  CreditOfferStatus,
  ObligationStatus,
  RepaymentFrequency,
  ServicingClassification,
  acceptCreditOffer,
  createCapitalPartnerCreditOffer,
  createCapitalPartnerPortfolio,
  createCapitalPartnerProfile,
  createCreditIntent,
  createFacilityView,
  transitionCapitalPartnerCreditOffer
} from "../src/index.js";

const NOW = new Date("2026-07-30T00:00:00.000Z");
const hash = (value) => `0x${value.repeat(64)}`;

function provenance() {
  const submitted = createCreditIntent({
    subjectId: "subject_human_phase2",
    principalId: "principal_human_phase2",
    authorityType: CreditAuthorityType.CONSENT,
    authorityRef: "consent_phase2",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "10000",
    purposeCode: "working_capital",
    requestedTermDays: 30,
    repaymentFrequency: RepaymentFrequency.END_OF_TERM,
    installmentCount: 1,
    now: NOW
  });
  const creditIntent = { ...submitted, status: "decided", updatedAt: NOW.toISOString() };
  const decision = {
    riskDecisionId: "risk_decision_phase2",
    decisionHash: hash("1"),
    creditIntentId: creditIntent.creditIntentId,
    subjectId: creditIntent.subjectId,
    principalId: creditIntent.principalId,
    status: "approved",
    schemaVersion: "risk_decision.v3"
  };
  const passportArtifact = {
    creditPassportArtifactId: "credit_passport_artifact_phase2",
    artifactHash: hash("2"),
    version: 1,
    subjectId: creditIntent.subjectId,
    sourceRiskDecisionId: decision.riskDecisionId,
    sourceDecisionHash: decision.decisionHash,
    purpose: "private_credit_review",
    status: "active",
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "credit_passport_artifact.v1"
  };
  const passportVerification = {
    verified: true,
    status: "active",
    sourceCurrent: true,
    checkedAt: NOW.toISOString(),
    artifactHash: passportArtifact.artifactHash,
    artifactVersion: 1,
    onlineVerificationRequired: true,
    schemaVersion: "credit_passport_verification.v1"
  };
  return { creditIntent, decision, passportArtifact, passportVerification };
}

function offer(overrides = {}) {
  return createCapitalPartnerCreditOffer({
    ...provenance(),
    creditOfferId: "credit_offer_phase2",
    capitalPartnerId: "capital_partner_alpha",
    capitalPartnerOperatorId: "actor_capital_partner_alpha",
    underwritingSnapshotHash: hash("3"),
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    facilityLimitMinor: "10000",
    approvedPrincipalMinor: "10000",
    perDrawCapMinor: "10000",
    annualRateBps: 900,
    originationFeeMinor: "0",
    repaymentFrequency: RepaymentFrequency.END_OF_TERM,
    installmentCount: 1,
    firstPaymentAt: "2026-08-29T00:00:00.000Z",
    maturityAt: "2026-08-29T00:00:00.000Z",
    permittedPurposeCode: "working_capital",
    validUntil: "2026-07-31T00:00:00.000Z",
    disclosureRef: "terms://capital-partner/phase2",
    now: NOW,
    ...overrides
  });
}

function obligation(creditOffer, overrides = {}) {
  return {
    obligationId: "obligation_phase2",
    creditOfferId: creditOffer.creditOfferId,
    subjectId: creditOffer.subjectId,
    assetId: creditOffer.assetId,
    originalPrincipalMinor: creditOffer.approvedPrincipalMinor,
    outstandingPrincipalMinor: "0",
    totalRepaidMinor: creditOffer.approvedPrincipalMinor,
    status: ObligationStatus.FULLY_REPAID,
    servicingClassification: ServicingClassification.CURRENT,
    daysPastDue: 0,
    scheduleHash: hash("4"),
    installments: [{
      installmentId: "installment_phase2",
      status: "paid",
      dueAt: creditOffer.maturityAt
    }],
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "obligation.v2",
    ...overrides
  };
}

test("Capital Partner v2 Offer binds exact Passport underwriting and remains v1-acceptance compatible", () => {
  const created = offer();
  assert.equal(created.schemaVersion, "credit_offer.v2");
  assert.equal(created.termsVersion, "credit_terms.v2");
  assert.equal(created.status, CreditOfferStatus.OFFERED);
  assert.match(created.passportVerificationHash, /^0x[0-9a-f]{64}$/);

  const accepted = acceptCreditOffer(created, {
    expectedOfferHash: created.creditOfferHash,
    expectedTermsHash: created.termsHash,
    acceptanceId: "acceptance_phase2",
    now: new Date("2026-07-30T01:00:00.000Z")
  });
  assert.equal(accepted.status, CreditOfferStatus.ACCEPTED);
  assert.equal(accepted.schemaVersion, "credit_offer.v2");
});

test("Capital Partner Offer fails closed on stale Passport, scope excess, and unauthorized transition", () => {
  assert.throws(() => offer({
    passportVerification: {
      ...provenance().passportVerification,
      verified: false,
      status: "revoked"
    }
  }), /underwriting_provenance/);
  assert.throws(() => offer({
    facilityLimitMinor: "10001",
    approvedPrincipalMinor: "10001",
    perDrawCapMinor: "10001"
  }), /outside_intent/);
  assert.throws(() => transitionCapitalPartnerCreditOffer({
    offer: offer(),
    nextStatus: CreditOfferStatus.WITHDRAWN,
    capitalPartnerId: "capital_partner_other",
    capitalPartnerOperatorId: "actor_capital_partner_alpha",
    now: new Date("2026-07-30T01:00:00.000Z")
  }), /invalid_capital_partner_marketplace/);
});

test("Facility and portfolio are composed from canonical Offer and Obligation truth", () => {
  const accepted = {
    ...offer(),
    status: CreditOfferStatus.ACCEPTED,
    acceptanceId: "acceptance_phase2",
    acceptedAt: "2026-07-30T01:00:00.000Z",
    updatedAt: "2026-07-30T01:00:00.000Z"
  };
  const facility = createFacilityView({
    offer: accepted,
    obligation: obligation(accepted),
    evidenceCoverage: {
      requiredEventCount: 9,
      anchoredEventCount: 9,
      status: "complete"
    },
    asOf: new Date("2026-08-29T01:00:00.000Z")
  });
  const portfolio = createCapitalPartnerPortfolio({
    capitalPartnerId: accepted.capitalPartnerId,
    offers: [accepted],
    facilities: [facility],
    asOf: new Date("2026-08-29T01:00:00.000Z")
  });
  assert.equal(facility.outstandingMinor, "0");
  assert.equal(portfolio.utilizedMinor, "10000");
  assert.equal(portfolio.repaidMinor, "10000");
  assert.equal(portfolio.completedFacilityCount, 1);
  assert.equal(portfolio.offers[0].creditIntentId, accepted.creditIntentId);
  assert.equal(portfolio.facilities[0].evidenceCoverage.status, "complete");
});

test("Phase 2 domain outputs satisfy their closed schemas", async () => {
  const accepted = {
    ...offer(),
    status: CreditOfferStatus.ACCEPTED,
    acceptanceId: "acceptance_phase2",
    acceptedAt: "2026-07-30T01:00:00.000Z",
    updatedAt: "2026-07-30T01:00:00.000Z"
  };
  const facility = createFacilityView({
    offer: accepted,
    obligation: obligation(accepted),
    asOf: NOW
  });
  const cases = [
    ["capital-partner-profile.schema.json", createCapitalPartnerProfile({
      capitalPartnerId: "capital_partner_alpha",
      organizationRef: "org://capital-partner-alpha",
      displayName: "Capital Partner Alpha",
      operatorActorId: "actor_capital_partner_alpha",
      tenantId: "tenant_local",
      now: NOW
    })],
    ["credit-offer-v2.schema.json", offer()],
    ["facility-view.schema.json", facility],
    ["capital-partner-portfolio.schema.json", createCapitalPartnerPortfolio({
      capitalPartnerId: accepted.capitalPartnerId,
      offers: [accepted],
      facilities: [facility],
      asOf: NOW
    })]
  ];
  for (const [file, value] of cases) {
    const schema = JSON.parse(await readFile(
      new URL(`../../../schemas/v2/${file}`, import.meta.url),
      "utf8"
    ));
    const serialized = JSON.parse(JSON.stringify(value));
    const unknownKeys = Object.keys(serialized)
      .filter((key) => !Object.hasOwn(schema.properties, key));
    const missingKeys = schema.required
      .filter((key) => !Object.hasOwn(serialized, key));
    assert.deepEqual(unknownKeys, [], `${file} does not declare all runtime fields`);
    assert.deepEqual(missingKeys, [], `${file} requires fields missing from runtime output`);
    assert.equal(serialized.schemaVersion, schema.properties.schemaVersion.const);
  }
});
