import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CreditAuthorityType,
  CreditIntentStatus,
  CreditOfferStatus,
  DomainError,
  RepaymentFrequency,
  RiskDecisionStatus,
  SANDBOX_CREDIT_POLICY_HASH,
  annualRateBpsForTerm,
  createDeterministicCreditDecisionOutcome,
  createEvidenceDerivedCreditDecisionOutcome,
  createCreditIntent,
  createCreditOffer,
  expectedInstallmentCount
} from "../src/index.js";

const NOW = new Date("2026-07-14T00:00:00.000Z");

function agentIntent(overrides = {}) {
  return createCreditIntent({
    subjectId: "subject_agent_1",
    principalId: "principal_1",
    authorityType: CreditAuthorityType.MANDATE,
    authorityRef: "mandate_1",
    assetId: "sandbox:USD",
    requestedPrincipalMinor: "300000",
    purposeCode: "provider_working_capital",
    requestedTermDays: 90,
    repaymentFrequency: RepaymentFrequency.MONTHLY,
    installmentCount: 3,
    now: NOW,
    ...overrides
  });
}

function offer(overrides = {}) {
  return createCreditOffer({
    creditIntentId: "credit_intent_1",
    subjectId: "subject_agent_1",
    riskDecisionId: "risk_decision_1",
    assetId: "sandbox:USD",
    approvedPrincipalMinor: "250000",
    annualRateBps: 1_800,
    originationFeeMinor: "2500",
    repaymentFrequency: RepaymentFrequency.MONTHLY,
    installmentCount: 3,
    firstPaymentAt: "2026-08-14T00:00:00.000Z",
    maturityAt: "2026-10-14T00:00:00.000Z",
    validUntil: "2026-07-15T00:00:00.000Z",
    reasonCodes: ["sandbox_policy_approved", "capacity_available"],
    disclosureRef: "terms://credit/sandbox-v1",
    now: NOW,
    ...overrides
  });
}

function evidenceSource(role, suffix) {
  return {
    role,
    entityType: role === "authority" ? "mandate" : role,
    entityIdHash: `0x${suffix.repeat(64)}`,
    entityHash: `0x${suffix.repeat(64)}`,
    aggregateVersion: 1,
    eventId: `credit_event_${role}_${suffix}`,
    evidenceHash: `0x${suffix.repeat(64)}`,
    sourceFinality: "finalized"
  };
}

function evidenceContext(authorityType) {
  const isHuman = authorityType === CreditAuthorityType.CONSENT;
  return {
    eligibilityFacts: {
      subjectEligible: true,
      subjectSuspended: false,
      principalEligible: true,
      authorityCurrent: true,
      identityEvidenceCurrent: isHuman ? true : null,
      principalBindingCurrent: isHuman ? null : true
    },
    sourceEvidence: [
      evidenceSource("credit_intent", "1"),
      evidenceSource("subject", "2"),
      evidenceSource("principal", "3"),
      {
        ...evidenceSource("authority", "4"),
        entityType: isHuman ? "consent_record" : "mandate"
      },
      ...(isHuman ? [evidenceSource("human_identity_reference", "5")] : [])
    ],
    riskState: {
      adverseObligationCount: 0,
      frozenCreditLineCount: 0,
      liveStateVersion: 1,
      queryVersion: "credit-application-risk-state.v1",
      stateHash: `0x${"6".repeat(64)}`
    }
  };
}

test("Human and Agent Credit Intents share one closed canonical shape", () => {
  const agent = agentIntent();
  const human = agentIntent({
    subjectId: "subject_human_1",
    authorityType: CreditAuthorityType.CONSENT,
    authorityRef: "consent_1",
    purposeCode: "income_smoothing"
  });

  assert.deepEqual(Object.keys(human).sort(), Object.keys(agent).sort());
  assert.equal(agent.status, CreditIntentStatus.SUBMITTED);
  assert.equal(human.status, CreditIntentStatus.SUBMITTED);
  assert.equal(agent.sandboxOnly, true);
  assert.equal(human.productionFundsRequested, false);
  assert.match(agent.creditIntentHash, /^0x[a-f0-9]{64}$/);
});

test("Credit Intent and Offer hashes survive JSON transport semantics", () => {
  const intent = agentIntent();
  const creditOffer = offer({ creditIntentId: intent.creditIntentId });
  const transportedIntent = JSON.parse(JSON.stringify(intent));
  const transportedOffer = JSON.parse(JSON.stringify(creditOffer));

  const replayedIntent = createCreditIntent({
    ...transportedIntent,
    now: NOW
  });
  const replayedOffer = createCreditOffer({
    ...transportedOffer,
    now: NOW
  });

  assert.equal(replayedIntent.creditIntentHash, intent.creditIntentHash);
  assert.equal(replayedOffer.creditOfferHash, creditOffer.creditOfferHash);
  assert.equal(replayedOffer.termsHash, creditOffer.termsHash);
  assert.equal(creditOffer.status, CreditOfferStatus.OFFERED);
});

test("credit contracts fail closed for unsafe amounts, terms, schedules, and reasons", () => {
  assert.throws(() => agentIntent({ requestedPrincipalMinor: "0" }), DomainError);
  assert.throws(() => agentIntent({ authorityType: "caller_claimed" }), DomainError);
  assert.throws(() => agentIntent({ purposeCode: "Free form purpose" }), DomainError);
  assert.throws(() => offer({ originationFeeMinor: "250001" }), /invalid_credit_fee/);
  assert.throws(() => offer({ annualRateBps: 100_001 }), /invalid_credit_term/);
  assert.throws(
    () => offer({ maturityAt: "2026-08-01T00:00:00.000Z" }),
    /invalid_credit_schedule/
  );
  assert.throws(
    () => offer({ reasonCodes: ["capacity_available", "capacity_available"] }),
    /duplicate_credit_reason_code/
  );
});

test("runtime credit contracts stay aligned with their closed schema surfaces", async () => {
  const cases = [
    ["credit-intent.schema.json", agentIntent()],
    ["credit-offer.schema.json", offer()]
  ];

  for (const [file, value] of cases) {
    const schema = JSON.parse(await readFile(new URL(`../../../schemas/v2/${file}`, import.meta.url), "utf8"));
    const serialized = JSON.parse(JSON.stringify(value));
    const unknownKeys = Object.keys(serialized).filter((key) => !Object.hasOwn(schema.properties, key));
    const missingKeys = schema.required.filter((key) => !Object.hasOwn(serialized, key));
    assert.deepEqual(unknownKeys, [], `${file} does not declare all runtime fields`);
    assert.deepEqual(missingKeys, [], `${file} requires fields missing from runtime output`);
    assert.equal(serialized.schemaVersion, schema.properties.schemaVersion.const);
  }
});

test("sandbox Decision and Offer policy is deterministic and closed", () => {
  const intent = agentIntent({
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "250000",
    requestedTermDays: 60,
    repaymentFrequency: RepaymentFrequency.MONTHLY,
    installmentCount: 2
  });
  const first = createDeterministicCreditDecisionOutcome({ intent, now: NOW });
  const second = createDeterministicCreditDecisionOutcome({ intent, now: NOW });

  assert.deepEqual(second, first);
  assert.equal(first.decision.status, RiskDecisionStatus.APPROVED);
  assert.equal(first.decision.schemaVersion, "risk_decision.v2");
  assert.equal(first.offer.annualRateBps, 900);
  assert.equal(first.offer.originationFeeMinor, "0");
  assert.equal(first.offer.validUntil, "2026-07-15T00:00:00.000Z");
  assert.equal(first.offer.firstPaymentAt, "2026-08-13T00:00:00.000Z");
  assert.equal(first.offer.maturityAt, "2026-09-12T00:00:00.000Z");
  assert.equal(first.offer.productionFundsApproved, false);
});

test("sandbox policy rejects unsupported, oversized, and inconsistent requests without an Offer", () => {
  const unsupported = createDeterministicCreditDecisionOutcome({ intent: agentIntent(), now: NOW });
  assert.equal(unsupported.decision.status, RiskDecisionStatus.REJECTED);
  assert.deepEqual(unsupported.decision.reasons, [{ code: "unsupported_sandbox_asset" }]);
  assert.equal(unsupported.offer, undefined);

  const overCap = createDeterministicCreditDecisionOutcome({
    intent: agentIntent({
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      requestedPrincipalMinor: "500001"
    }),
    now: NOW
  });
  assert.deepEqual(overCap.decision.reasons, [{ code: "sandbox_cap_exceeded" }]);

  const schedule = createDeterministicCreditDecisionOutcome({
    intent: agentIntent({
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      requestedTermDays: 60,
      installmentCount: 3
    }),
    now: NOW
  });
  assert.deepEqual(schedule.decision.reasons, [{ code: "invalid_requested_schedule" }]);
});

test("rate and installment tables match credit-application-rules.v1", () => {
  assert.deepEqual([1, 30, 31, 90, 91, 180, 181, 366].map(annualRateBpsForTerm), [
    600, 600, 900, 900, 1200, 1200, 1500, 1500
  ]);
  assert.equal(expectedInstallmentCount(RepaymentFrequency.WEEKLY, 60), 9);
  assert.equal(expectedInstallmentCount(RepaymentFrequency.BIWEEKLY, 60), 5);
  assert.equal(expectedInstallmentCount(RepaymentFrequency.MONTHLY, 60), 2);
  assert.equal(expectedInstallmentCount(RepaymentFrequency.END_OF_TERM, 60), 1);
});

test("evidence-derived Human and Agent Decisions freeze one policy and point-in-time passport", () => {
  const agent = createEvidenceDerivedCreditDecisionOutcome({
    intent: agentIntent({
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      requestedPrincipalMinor: "12000",
      requestedTermDays: 60,
      installmentCount: 2
    }),
    ...evidenceContext(CreditAuthorityType.MANDATE),
    now: NOW
  });
  const humanIntent = agentIntent({
    subjectId: "subject_human_evidence",
    principalId: "principal_human_evidence",
    authorityType: CreditAuthorityType.CONSENT,
    authorityRef: "consent_human_evidence",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "12000",
    requestedTermDays: 60,
    installmentCount: 2
  });
  const human = createEvidenceDerivedCreditDecisionOutcome({
    intent: humanIntent,
    ...evidenceContext(CreditAuthorityType.CONSENT),
    now: NOW
  });

  for (const outcome of [agent, human]) {
    assert.equal(outcome.decision.schemaVersion, "risk_decision.v3");
    assert.equal(outcome.decision.policyHash, SANDBOX_CREDIT_POLICY_HASH);
    assert.equal(
      outcome.decision.riskFeatureSnapshot.featureSetVersion,
      "credit-application-evidence-features.v1"
    );
    assert.equal(outcome.decision.riskFeatureSnapshot.features.allRequiredFeaturesSatisfied, true);
    assert.equal(outcome.decision.decisionPassport.nonAuthorizing, true);
    assert.equal(Object.isFrozen(outcome.decision.riskFeatureSnapshot), true);
    assert.equal(Object.isFrozen(outcome.decision.decisionPassport.reasonLineage), true);
    assert.equal(outcome.decision.decisionPassport.decisionHash, outcome.decision.decisionHash);
    assert.equal(outcome.offer.annualRateBps, 900);
    assert.equal(outcome.offer.originationFeeMinor, "0");
  }
  assert.equal(human.decision.policyHash, agent.decision.policyHash);
  assert.deepEqual(
    {
      principal: human.offer.approvedPrincipalMinor,
      rate: human.offer.annualRateBps,
      fee: human.offer.originationFeeMinor,
      installments: human.offer.installmentCount
    },
    {
      principal: agent.offer.approvedPrincipalMinor,
      rate: agent.offer.annualRateBps,
      fee: agent.offer.originationFeeMinor,
      installments: agent.offer.installmentCount
    }
  );
});

test("evidence-derived Decision fails closed on missing positive lineage and open feature input", () => {
  const intent = agentIntent({
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "12000",
    requestedTermDays: 60,
    installmentCount: 2
  });
  const context = evidenceContext(CreditAuthorityType.MANDATE);
  assert.throws(
    () => createEvidenceDerivedCreditDecisionOutcome({
      intent,
      ...context,
      sourceEvidence: context.sourceEvidence.filter(({ role }) => role !== "authority"),
      now: NOW
    }),
    (error) => error.code === "invalid_risk_evidence"
  );
  assert.throws(
    () => createEvidenceDerivedCreditDecisionOutcome({
      intent,
      ...context,
      eligibilityFacts: { ...context.eligibilityFacts, callerScore: 900 },
      now: NOW
    }),
    (error) => error.code === "invalid_risk_evidence"
  );
});
