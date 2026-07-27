import assert from "node:assert/strict";
import test from "node:test";
import {
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  TRADING_SYNTHETIC_ASSET_ID,
  TradingCapitalTemplateType,
  TradingMatchProposalStatus,
  TradingStrategyClass,
  acceptTradingMatchAsProvider,
  acceptTradingMatchAsSubject,
  createTradingAccountBindingChallenge,
  createTradingCapitalRequest,
  createTradingMatchProposal,
  createTradingProviderMandate,
  finalizeTradingEvidenceSnapshot,
  importSyntheticTradingHistory,
  listCompatibleTradingProviderMandates
} from "../src/index.js";

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const HASH_C = `0x${"c".repeat(64)}`;
const T0 = new Date("2026-07-25T03:00:00.000Z");

function profile(subjectType = SubjectType.HUMAN, actorId = "actor_subject") {
  const subjectId = `subject_${subjectType}`;
  const principalId = `principal_${subjectType}`;
  const challenge = createTradingAccountBindingChallenge({
    tenantId: "tenant_tc102",
    subject: {
      subjectId,
      subjectType,
      primaryPrincipalId: principalId,
      status: SubjectStatus.ACTIVE
    },
    principal: {
      principalId,
      status: PrincipalStatus.ACTIVE
    },
    requestedByActorId: actorId,
    challengeNonce: HASH_A,
    now: T0
  });
  const imported = importSyntheticTradingHistory({
    profile: challenge,
    requestedByActorId: actorId,
    challengeEventId: "event_challenge",
    challengeEvidenceHash: HASH_B,
    now: new Date(T0.getTime() + 60_000)
  });
  return finalizeTradingEvidenceSnapshot({
    profile: imported,
    sourceProjectionHash: HASH_C,
    historyImportEventId: "event_import",
    historyImportEvidenceHash: HASH_A,
    sourceFinality: "finalized",
    now: new Date(T0.getTime() + 120_000)
  });
}

function request(overrides = {}) {
  return createTradingCapitalRequest({
    tradingCreditProfile: profile(),
    requestedByActorId: "actor_subject",
    templateType: TradingCapitalTemplateType.HYBRID,
    strategyClass: TradingStrategyClass.MARKET_NEUTRAL,
    assetId: TRADING_SYNTHETIC_ASSET_ID,
    requestedAmountMinor: "1000000",
    durationDays: 90,
    now: new Date(T0.getTime() + 180_000),
    ...overrides
  });
}

function provider(mandateIndex = 1, overrides = {}) {
  return createTradingProviderMandate({
    provider: {
      providerId: `provider_${mandateIndex}`,
      providerHash: HASH_B,
      status: "allowlisted",
      schemaVersion: "provider.v1"
    },
    providerActorId: `actor_provider_${mandateIndex}`,
    supportedTemplateTypes: [
      TradingCapitalTemplateType.CREDIT,
      TradingCapitalTemplateType.HYBRID
    ],
    allowedSubjectTypes: [SubjectType.HUMAN, SubjectType.AGENT],
    allowedStrategyClasses: [
      TradingStrategyClass.MARKET_NEUTRAL,
      TradingStrategyClass.DIRECTIONAL
    ],
    assetId: TRADING_SYNTHETIC_ASSET_ID,
    minAmountMinor: "500000",
    maxAmountMinor: "2000000",
    minDurationDays: 30,
    maxDurationDays: 180,
    now: new Date(T0.getTime() + 240_000 + mandateIndex),
    ...overrides
  });
}

test("TC-102 creates closed Human and Agent Capital Requests from finalized Evidence", () => {
  const human = request();
  const agent = request({
    tradingCreditProfile: profile(SubjectType.AGENT, "actor_agent"),
    requestedByActorId: "actor_agent",
    templateType: TradingCapitalTemplateType.PERFORMANCE_PARTICIPATION
  });
  for (const value of [human, agent]) {
    assert.equal(value.evidenceEligibility.eligibilityClass, "synthetic_restricted");
    assert.equal(value.evidenceEligibility.selfDeclaredRiskClassAccepted, false);
    assert.equal(value.evidenceEligibility.authorizing, false);
    assert.equal(value.termsBlueprint.illustrativeOnly, true);
    assert.equal(value.realPricing, false);
    assert.equal(value.realFunding, false);
    assert.equal(value.fundsAuthority, false);
    assert.equal(value.autoMatch, false);
    assert.equal(value.autoAccept, false);
  }
  assert.equal(human.subjectType, "human");
  assert.equal(agent.subjectType, "agent");
  assert.equal(agent.termsBlueprint.performanceParticipationBps, 1500);
});

test("TC-102 hard filters precede deterministic ranking and ignore input order", () => {
  const capitalRequest = request();
  const earliest = provider(1);
  const later = provider(2);
  const incompatible = provider(3, {
    supportedTemplateTypes: [TradingCapitalTemplateType.CREDIT]
  });
  const first = listCompatibleTradingProviderMandates({
    capitalRequest,
    providerMandates: [incompatible, later, earliest],
    now: new Date(T0.getTime() + 300_000)
  });
  const second = listCompatibleTradingProviderMandates({
    capitalRequest,
    providerMandates: [earliest, incompatible, later],
    now: new Date(T0.getTime() + 300_000)
  });
  assert.equal(first.evaluatedCandidateCount, 3);
  assert.equal(first.compatibleMandateCount, 2);
  assert.deepEqual(
    first.matches.map(({ mandateHash }) => mandateHash),
    second.matches.map(({ mandateHash }) => mandateHash)
  );
  assert.equal(first.matches[0].providerMandateId, earliest.tradingProviderMandateId);
  assert.equal(first.matches[0].hardFilterReasonCodes.length, 8);
  assert.equal(first.hardFiltersAppliedBeforeRanking, true);
  assert.equal(first.rankingAuthorizing, false);
  assert.equal(first.providerIdentityEnumerated, false);
  assert.equal(JSON.stringify(first).includes("actor_provider"), false);
});

test("TC-102 matching property rejects every individual hard-filter mismatch", () => {
  const capitalRequest = request();
  const variants = [
    provider(10, { supportedTemplateTypes: [TradingCapitalTemplateType.CREDIT] }),
    provider(11, { minAmountMinor: "1000001" }),
    provider(12, { maxDurationDays: 89 }),
    provider(13, { allowedSubjectTypes: [SubjectType.AGENT] }),
    provider(14, { allowedStrategyClasses: [TradingStrategyClass.DIRECTIONAL] })
  ];
  for (const mandate of variants) {
    const result = listCompatibleTradingProviderMandates({
      capitalRequest,
      providerMandates: [mandate],
      now: new Date(T0.getTime() + 300_000)
    });
    assert.equal(result.compatibleMandateCount, 0);
  }
});

test("TC-102 proposal freezes exact immutable no-funds terms", () => {
  const capitalRequest = request();
  const mandate = provider();
  const proposal = createTradingMatchProposal({
    capitalRequest,
    providerMandate: mandate,
    requestedRequestHash: capitalRequest.requestHash,
    requestedMandateHash: mandate.mandateHash,
    now: new Date(T0.getTime() + 300_000)
  });
  assert.equal(proposal.status, TradingMatchProposalStatus.PROPOSED);
  assert.equal(proposal.immutableTerms, true);
  assert.equal(proposal.bilateralAcceptanceRequired, true);
  assert.equal(proposal.autoAccepted, false);
  assert.equal(proposal.terms.termsHash, capitalRequest.termsBlueprint.termsHash);
  assert.equal(proposal.realPricing, false);
  assert.equal(proposal.fundsAuthority, false);
});

test("TC-102 either acceptance order reaches the same bilateral exact-terms state", () => {
  for (const providerFirst of [true, false]) {
    const capitalRequest = request();
    const mandate = provider();
    const proposal = createTradingMatchProposal({
      capitalRequest,
      providerMandate: mandate,
      requestedRequestHash: capitalRequest.requestHash,
      requestedMandateHash: mandate.mandateHash,
      now: new Date(T0.getTime() + 300_000)
    });
    const acceptProvider = (current, now) => acceptTradingMatchAsProvider({
      proposal: current,
      capitalRequest,
      providerMandate: mandate,
      acceptedByActorId: "actor_provider_1",
      acceptedProposalHash: proposal.proposalHash,
      acceptedTermsHash: proposal.terms.termsHash,
      now
    });
    const acceptSubject = (current, now) => acceptTradingMatchAsSubject({
      proposal: current,
      capitalRequest,
      providerMandate: mandate,
      acceptedByActorId: "actor_subject",
      acceptedProposalHash: proposal.proposalHash,
      acceptedTermsHash: proposal.terms.termsHash,
      now
    });
    const first = providerFirst
      ? acceptProvider(proposal, new Date(T0.getTime() + 360_000))
      : acceptSubject(proposal, new Date(T0.getTime() + 360_000));
    const final = providerFirst
      ? acceptSubject(first, new Date(T0.getTime() + 420_000))
      : acceptProvider(first, new Date(T0.getTime() + 420_000));
    assert.equal(final.status, TradingMatchProposalStatus.BILATERALLY_ACCEPTED);
    assert.equal(final.version, 3);
    assert.equal(final.providerAcceptance.exactTerms, true);
    assert.equal(final.subjectAcceptance.exactTerms, true);
    assert.equal(final.providerAcceptance.termsHash, final.subjectAcceptance.termsHash);
    assert.equal(final.fundsAuthority, false);
  }
});

test("TC-102 rejects forged terms, wrong actors, caller risk class, and changed mandate", () => {
  const capitalRequest = request();
  const mandate = provider();
  const proposal = createTradingMatchProposal({
    capitalRequest,
    providerMandate: mandate,
    requestedRequestHash: capitalRequest.requestHash,
    requestedMandateHash: mandate.mandateHash,
    now: new Date(T0.getTime() + 300_000)
  });
  assert.throws(() => acceptTradingMatchAsProvider({
    proposal,
    capitalRequest,
    providerMandate: mandate,
    acceptedByActorId: "actor_wrong",
    acceptedProposalHash: proposal.proposalHash,
    acceptedTermsHash: proposal.terms.termsHash,
    now: new Date(T0.getTime() + 360_000)
  }), /unavailable/);
  assert.throws(() => acceptTradingMatchAsSubject({
    proposal,
    capitalRequest,
    providerMandate: mandate,
    acceptedByActorId: "actor_subject",
    acceptedProposalHash: proposal.proposalHash,
    acceptedTermsHash: HASH_C,
    now: new Date(T0.getTime() + 360_000)
  }), /exact immutable/);
  assert.throws(() => createTradingMatchProposal({
    capitalRequest,
    providerMandate: { ...mandate, mandateHash: HASH_C },
    requestedRequestHash: capitalRequest.requestHash,
    requestedMandateHash: HASH_C,
    now: new Date(T0.getTime() + 300_000)
  }), /changed|compatible|unavailable/);
  assert.throws(() => createTradingCapitalRequest({
    tradingCreditProfile: profile(),
    requestedByActorId: "actor_subject",
    templateType: TradingCapitalTemplateType.CREDIT,
    strategyClass: TradingStrategyClass.MARKET_NEUTRAL,
    assetId: TRADING_SYNTHETIC_ASSET_ID,
    requestedAmountMinor: "1000000",
    durationDays: 90,
    riskClass: "prime",
    now: T0
  }), /riskClass|open shape|unexpected|argument|invalid/i);

  const afterRequestExpiry = new Date(
    new Date(capitalRequest.expiresAt).getTime() + 1
  );
  assert.equal(
    listCompatibleTradingProviderMandates({
      capitalRequest,
      providerMandates: [mandate],
      now: afterRequestExpiry
    }).compatibleMandateCount,
    0
  );
  assert.throws(() => createTradingMatchProposal({
    capitalRequest,
    providerMandate: mandate,
    requestedRequestHash: capitalRequest.requestHash,
    requestedMandateHash: mandate.mandateHash,
    now: afterRequestExpiry
  }), /expired|unavailable|compatible/i);
  assert.throws(() => acceptTradingMatchAsSubject({
    proposal,
    capitalRequest,
    providerMandate: mandate,
    acceptedByActorId: "actor_subject",
    acceptedProposalHash: proposal.proposalHash,
    acceptedTermsHash: proposal.terms.termsHash,
    now: new Date(new Date(proposal.expiresAt).getTime() + 1)
  }), /expired|unavailable/i);
});
