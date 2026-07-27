import assert from "node:assert/strict";
import test from "node:test";
import {
  createTradingAccountBindingChallenge,
  createTradingCapitalRequest,
  finalizeTradingEvidenceSnapshot,
  importSyntheticTradingHistory,
  listCompatibleTradingProviderMandates
} from "../../../packages/domain/src/index.js";
import {
  createTradingCapitalMatchingPresentation
} from "../src/trading-capital-matching-presentation.js";

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const T0 = new Date("2026-07-25T05:00:00.000Z");

function requestFor(entryMode) {
  const actorId = `actor_${entryMode}_tc102`;
  const profile = finalizeTradingEvidenceSnapshot({
    profile: importSyntheticTradingHistory({
      profile: createTradingAccountBindingChallenge({
        tenantId: "tenant_tc102",
        subject: {
          subjectId: `subject_${entryMode}_tc102`,
          subjectType: entryMode,
          primaryPrincipalId: `principal_${entryMode}_tc102`,
          status: "active"
        },
        principal: {
          principalId: `principal_${entryMode}_tc102`,
          status: "active"
        },
        requestedByActorId: actorId,
        challengeNonce: HASH_A,
        now: T0
      }),
      requestedByActorId: actorId,
      challengeEventId: `event_${entryMode}_challenge`,
      challengeEvidenceHash: HASH_B,
      now: new Date(T0.getTime() + 60_000)
    }),
    sourceProjectionHash: HASH_A,
    historyImportEventId: `event_${entryMode}_history`,
    historyImportEvidenceHash: HASH_B,
    sourceFinality: "finalized",
    now: new Date(T0.getTime() + 120_000)
  });
  return createTradingCapitalRequest({
    tradingCreditProfile: profile,
    requestedByActorId: actorId,
    templateType: "hybrid",
    strategyClass: "market_neutral",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedAmountMinor: "1000000",
    durationDays: 90,
    now: new Date(T0.getTime() + 180_000)
  });
}

function presentationFor(entryMode) {
  const capitalRequest = requestFor(entryMode);
  const compatibleMandates = listCompatibleTradingProviderMandates({
    capitalRequest,
    providerMandates: [],
    now: new Date(T0.getTime() + 240_000)
  });
  return createTradingCapitalMatchingPresentation({
    entryMode,
    capitalRequest,
    compatibleMandates
  });
}

test("TC-102 Human and Agent entries present one matching product contract", () => {
  const human = presentationFor("human");
  const agent = presentationFor("agent");
  assert.equal(Object.isFrozen(human), true);
  assert.equal(human.entryLabel, "Human");
  assert.equal(agent.entryLabel, "Agent");
  const normalize = ({ entryMode, entryLabel, ...shared }) => shared;
  assert.deepEqual(normalize(human), normalize(agent));
  assert.equal(human.matchingOrder, "hard_filters_then_deterministic_ranking");
  assert.equal(human.autoAccepted, false);
  assert.equal(human.fundsAuthority, false);
});

test("TC-102 presentation fails closed on ranking, authority, and entry-mode drift", () => {
  const capitalRequest = requestFor("human");
  const compatibleMandates = listCompatibleTradingProviderMandates({
    capitalRequest,
    providerMandates: [],
    now: new Date(T0.getTime() + 240_000)
  });
  for (const mutate of [
    (input) => { input.capitalRequest.productionAuthority = true; },
    (input) => { input.capitalRequest.riskClassCallerSupplied = true; },
    (input) => { input.compatibleMandates.hardFiltersAppliedBeforeRanking = false; },
    (input) => { input.compatibleMandates.rankingAuthorizing = true; },
    (input) => { input.compatibleMandates.providerIdentityEnumerated = true; },
    (input) => { input.entryMode = "agent"; }
  ]) {
    const input = {
      entryMode: "human",
      capitalRequest: structuredClone(capitalRequest),
      compatibleMandates: structuredClone(compatibleMandates)
    };
    mutate(input);
    assert.equal(createTradingCapitalMatchingPresentation(input), null);
  }
});
