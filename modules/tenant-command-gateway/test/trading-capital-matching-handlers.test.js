import assert from "node:assert/strict";
import test from "node:test";
import {
  createTradingAccountBindingChallenge,
  finalizeTradingEvidenceSnapshot,
  importSyntheticTradingHistory
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  acceptTradingMatchAsProviderHandler,
  acceptTradingMatchAsSubjectHandler,
  createTradingCapitalRequestHandler,
  createTradingMatchProposalHandler,
  createTradingProviderMandateHandler,
  listCompatibleTradingMandatesHandler
} from "../src/index.js";

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const HASH_C = `0x${"c".repeat(64)}`;
const T0 = new Date("2026-07-25T04:00:00.000Z");
const SUBJECT_ACTOR = {
  actorId: "actor_subject_tc102",
  actorType: "human",
  relationship: "owner"
};
const PROVIDER_ACTOR = {
  actorId: "actor_provider_tc102",
  actorType: "provider",
  relationship: "owner"
};

function finalizedProfile() {
  const challenge = createTradingAccountBindingChallenge({
    tenantId: "tenant_tc102",
    subject: {
      subjectId: "subject_tc102",
      subjectType: "human",
      primaryPrincipalId: "principal_tc102",
      status: "active"
    },
    principal: {
      principalId: "principal_tc102",
      status: "active"
    },
    requestedByActorId: SUBJECT_ACTOR.actorId,
    challengeNonce: HASH_A,
    now: T0
  });
  const imported = importSyntheticTradingHistory({
    profile: challenge,
    requestedByActorId: SUBJECT_ACTOR.actorId,
    challengeEventId: "event_tc102_challenge",
    challengeEvidenceHash: HASH_B,
    now: new Date(T0.getTime() + 60_000)
  });
  return finalizeTradingEvidenceSnapshot({
    profile: imported,
    sourceProjectionHash: HASH_C,
    historyImportEventId: "event_tc102_import",
    historyImportEvidenceHash: HASH_A,
    sourceFinality: "finalized",
    now: new Date(T0.getTime() + 120_000)
  });
}

function harness() {
  const profile = finalizedProfile();
  const provider = {
    providerId: "provider_tc102",
    providerHash: HASH_B,
    status: "allowlisted",
    schemaVersion: "provider.v1"
  };
  const states = new Map([
    [
      `${CoreProjectionType.TRADING_CREDIT_PROFILE}:${profile.tradingCreditProfileId}`,
      { value: profile, aggregateVersion: 3 }
    ],
    [
      `${CoreProjectionType.PROVIDER}:${provider.providerId}`,
      { value: provider, aggregateVersion: 1 }
    ]
  ]);
  const bindings = new Map([
    [
      `trading_credit_profile:${profile.tradingCreditProfileId}`,
      [SUBJECT_ACTOR]
    ],
    [`provider:${provider.providerId}`, [PROVIDER_ACTOR]]
  ]);
  const coreRepository = {
    async getProjectionStateInTransaction(_client, type, id) {
      return states.get(`${type}:${id}`);
    },
    async listTradingProviderMandatesInTransaction() {
      return [...states.values()]
        .map(({ value }) => value)
        .filter(({ schemaVersion }) => schemaVersion === "trading_provider_mandate.v1");
    }
  };
  const directory = {
    async listActiveResourceBindings({ resourceType, resourceId }) {
      return bindings.get(`${resourceType}:${resourceId}`) ?? [];
    }
  };
  function applyPlan(plan, bindingsForResource = plan.authorizationResource?.actorBindings) {
    for (const write of plan.writes) {
      const prior = states.get(`${write.type}:${
        write.value.tradingCapitalRequestId ??
        write.value.tradingProviderMandateId ??
        write.value.tradingMatchProposalId
      }`);
      const id =
        write.value.tradingCapitalRequestId ??
        write.value.tradingProviderMandateId ??
        write.value.tradingMatchProposalId;
      states.set(`${write.type}:${id}`, {
        value: structuredClone(write.value),
        aggregateVersion: (prior?.aggregateVersion ?? 0) + 1
      });
    }
    if (plan.authorizationResource) {
      bindings.set(
        `${plan.authorizationResource.resourceType}:${plan.authorizationResource.resourceId}`,
        structuredClone(bindingsForResource)
      );
    }
  }
  return {
    client: {},
    coreRepository,
    directory,
    profile,
    provider,
    states,
    bindings,
    applyPlan
  };
}

function commandInput({
  harness,
  actor,
  resourceType,
  resourceId,
  payload,
  now,
  resourceVersion = 1
}) {
  return {
    client: harness.client,
    coreRepository: harness.coreRepository,
    directory: harness.directory,
    authenticationContext: {
      tenantId: "tenant_tc102",
      actorId: actor.actorId,
      actorType: actor.actorType
    },
    authorizationDecision: {
      resourceType,
      resourceId,
      resourceVersion
    },
    payload,
    now,
    requestId: `request_${resourceId}_${now.getTime()}`,
    correlationId: "correlation_tc102"
  };
}

test("TC-102 handlers create, filter, propose, and bilaterally accept exact no-funds terms", async () => {
  const runtime = harness();
  const requestPlan = await createTradingCapitalRequestHandler().plan(commandInput({
    harness: runtime,
    actor: SUBJECT_ACTOR,
    resourceType: "trading_credit_profile",
    resourceId: runtime.profile.tradingCreditProfileId,
    payload: {
      templateType: "hybrid",
      strategyClass: "market_neutral",
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      requestedAmountMinor: "1000000",
      durationDays: 90
    },
    now: new Date(T0.getTime() + 180_000)
  }));
  runtime.applyPlan(requestPlan);
  const capitalRequest = requestPlan.response.capitalRequest;
  assert.equal(capitalRequest.riskClassCallerSupplied, false);
  assert.equal(capitalRequest.fundsAuthority, false);

  const mandatePlan = await createTradingProviderMandateHandler().plan(commandInput({
    harness: runtime,
    actor: PROVIDER_ACTOR,
    resourceType: "provider",
    resourceId: runtime.provider.providerId,
    payload: {
      supportedTemplateTypes: ["credit", "hybrid"],
      allowedSubjectTypes: ["human", "agent"],
      allowedStrategyClasses: ["market_neutral", "directional"],
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      minAmountMinor: "500000",
      maxAmountMinor: "2000000",
      minDurationDays: 30,
      maxDurationDays: 180
    },
    now: new Date(T0.getTime() + 240_000)
  }));
  runtime.applyPlan(mandatePlan);
  const providerMandate = mandatePlan.response.providerMandate;
  assert.equal(providerMandate.selfDeclaredRiskClassAccepted, false);

  const compatible = await listCompatibleTradingMandatesHandler().execute({
    client: runtime.client,
    coreRepository: runtime.coreRepository,
    directory: runtime.directory,
    authenticationContext: {
      tenantId: "tenant_tc102",
      actorId: SUBJECT_ACTOR.actorId,
      actorType: SUBJECT_ACTOR.actorType
    },
    resource: {
      resourceType: "trading_capital_request",
      resourceId: capitalRequest.tradingCapitalRequestId
    },
    payload: {},
    now: new Date(T0.getTime() + 300_000)
  });
  assert.equal(compatible.compatibleMandateCount, 1);
  assert.equal(compatible.hardFiltersAppliedBeforeRanking, true);

  const proposalPlan = await createTradingMatchProposalHandler().plan(commandInput({
    harness: runtime,
    actor: SUBJECT_ACTOR,
    resourceType: "trading_capital_request",
    resourceId: capitalRequest.tradingCapitalRequestId,
    payload: {
      providerMandateId: providerMandate.tradingProviderMandateId,
      requestHash: capitalRequest.requestHash,
      mandateHash: providerMandate.mandateHash
    },
    now: new Date(T0.getTime() + 300_000)
  }));
  runtime.applyPlan(proposalPlan);
  const proposal = proposalPlan.response.matchProposal;
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.autoAccepted, false);
  assert.equal(
    runtime.bindings.get(`trading_match_proposal:${proposal.tradingMatchProposalId}`).length,
    2
  );

  const providerAcceptance = await acceptTradingMatchAsProviderHandler().plan(commandInput({
    harness: runtime,
    actor: PROVIDER_ACTOR,
    resourceType: "trading_match_proposal",
    resourceId: proposal.tradingMatchProposalId,
    resourceVersion: 1,
    payload: {
      proposalHash: proposal.proposalHash,
      termsHash: proposal.termsHash
    },
    now: new Date(T0.getTime() + 360_000)
  }));
  runtime.applyPlan(providerAcceptance);
  assert.equal(providerAcceptance.response.matchProposal.status, "provider_accepted");

  const subjectAcceptance = await acceptTradingMatchAsSubjectHandler().plan(commandInput({
    harness: runtime,
    actor: SUBJECT_ACTOR,
    resourceType: "trading_match_proposal",
    resourceId: proposal.tradingMatchProposalId,
    resourceVersion: 2,
    payload: {
      proposalHash: proposal.proposalHash,
      termsHash: proposal.termsHash
    },
    now: new Date(T0.getTime() + 420_000)
  }));
  assert.equal(subjectAcceptance.response.matchProposal.status, "bilaterally_accepted");
  assert.equal(subjectAcceptance.response.matchProposal.version, 3);
  assert.equal(subjectAcceptance.response.matchProposal.providerAcceptance.exactTerms, true);
  assert.equal(subjectAcceptance.response.matchProposal.subjectAcceptance.exactTerms, true);
  assert.equal(subjectAcceptance.response.matchProposal.fundsAuthority, false);
});

test("TC-102 handlers fail closed on caller risk input, stale hashes, and wrong actors", async () => {
  assert.throws(
    () => createTradingCapitalRequestHandler().preflight({
      payload: {
        templateType: "credit",
        strategyClass: "market_neutral",
        assetId: "urn:ipo-one:sandbox-asset:usd-cent",
        requestedAmountMinor: "1000000",
        durationDays: 90,
        riskClass: "prime"
      }
    }),
    /not available/
  );
  const runtime = harness();
  await assert.rejects(
    () => createTradingProviderMandateHandler().plan(commandInput({
      harness: runtime,
      actor: SUBJECT_ACTOR,
      resourceType: "provider",
      resourceId: runtime.provider.providerId,
      payload: {
        supportedTemplateTypes: ["credit"],
        allowedSubjectTypes: ["human"],
        allowedStrategyClasses: ["market_neutral"],
        assetId: "urn:ipo-one:sandbox-asset:usd-cent",
        minAmountMinor: "1",
        maxAmountMinor: "2",
        minDurationDays: 7,
        maxDurationDays: 8
      },
      now: T0
    })),
    /not available/
  );
});
