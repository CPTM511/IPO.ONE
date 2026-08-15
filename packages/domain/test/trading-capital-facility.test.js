import assert from "node:assert/strict";
import test from "node:test";
import {
  ObligationExecutionStatus,
  ObligationStatus,
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  TRADING_FACILITY_SYNTHETIC_ASSET_ID,
  TradingCapitalTemplateType,
  TradingFacilityLifecycleStatus,
  TradingFacilityRiskState,
  TradingOrderDirection,
  TradingOrderIntentStatus,
  TradingStrategyClass,
  acceptTradingMatchAsProvider,
  acceptTradingMatchAsSubject,
  activateTradingFacility,
  cancelTradingOrderIntent,
  contributeTradingSubjectCollateral,
  createTradingAccountBindingChallenge,
  createTradingCapitalRequest,
  createTradingFacility,
  createTradingMatchProposal,
  createTradingProviderMandate,
  evaluateTradingFacilityRisk,
  finalizeTradingEvidenceSnapshot,
  flattenTradingFacility,
  importSyntheticTradingHistory,
  pauseTradingFacilityNewRisk,
  recordTradingProviderFunding,
  requestTradingFacilityClose,
  runTradingSettlement,
  issueTradingPerformanceProof,
  submitTradingOrderIntent
} from "../src/index.js";

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const HASH_C = `0x${"c".repeat(64)}`;
const HASH_D = `0x${"d".repeat(64)}`;
const T0 = new Date("2026-07-25T06:00:00.000Z");

function acceptedProposal() {
  const challenge = createTradingAccountBindingChallenge({
    tenantId: "tenant_tc103",
    subject: {
      subjectId: "subject_tc103",
      subjectType: SubjectType.AGENT,
      primaryPrincipalId: "principal_tc103",
      status: SubjectStatus.ACTIVE
    },
    principal: {
      principalId: "principal_tc103",
      status: PrincipalStatus.ACTIVE
    },
    requestedByActorId: "actor_subject",
    challengeNonce: HASH_A,
    now: T0
  });
  const imported = importSyntheticTradingHistory({
    profile: challenge,
    requestedByActorId: "actor_subject",
    challengeEventId: "event_challenge",
    challengeEvidenceHash: HASH_B,
    now: new Date(T0.getTime() + 60_000)
  });
  const profile = finalizeTradingEvidenceSnapshot({
    profile: imported,
    sourceProjectionHash: HASH_C,
    historyImportEventId: "event_import",
    historyImportEvidenceHash: HASH_D,
    sourceFinality: "finalized",
    now: new Date(T0.getTime() + 120_000)
  });
  const request = createTradingCapitalRequest({
    tradingCreditProfile: profile,
    requestedByActorId: "actor_subject",
    templateType: TradingCapitalTemplateType.HYBRID,
    strategyClass: TradingStrategyClass.MARKET_NEUTRAL,
    assetId: TRADING_FACILITY_SYNTHETIC_ASSET_ID,
    requestedAmountMinor: "1000000",
    durationDays: 90,
    now: new Date(T0.getTime() + 180_000)
  });
  const mandate = createTradingProviderMandate({
    provider: {
      providerId: "provider_tc103",
      providerHash: HASH_B,
      status: "allowlisted",
      schemaVersion: "provider.v1"
    },
    providerActorId: "actor_provider",
    supportedTemplateTypes: [TradingCapitalTemplateType.HYBRID],
    allowedSubjectTypes: [SubjectType.AGENT],
    allowedStrategyClasses: [TradingStrategyClass.MARKET_NEUTRAL],
    assetId: TRADING_FACILITY_SYNTHETIC_ASSET_ID,
    minAmountMinor: "1000000",
    maxAmountMinor: "1000000",
    minDurationDays: 90,
    maxDurationDays: 90,
    now: new Date(T0.getTime() + 240_000)
  });
  const proposed = createTradingMatchProposal({
    capitalRequest: request,
    providerMandate: mandate,
    requestedRequestHash: request.requestHash,
    requestedMandateHash: mandate.mandateHash,
    now: new Date(T0.getTime() + 300_000)
  });
  const providerAccepted = acceptTradingMatchAsProvider({
    proposal: proposed,
    capitalRequest: request,
    providerMandate: mandate,
    acceptedByActorId: "actor_provider",
    acceptedProposalHash: proposed.proposalHash,
    acceptedTermsHash: proposed.terms.termsHash,
    now: new Date(T0.getTime() + 360_000)
  });
  return acceptTradingMatchAsSubject({
    proposal: providerAccepted,
    capitalRequest: request,
    providerMandate: mandate,
    acceptedByActorId: "actor_subject",
    acceptedProposalHash: proposed.proposalHash,
    acceptedTermsHash: proposed.terms.termsHash,
    now: new Date(T0.getTime() + 420_000)
  });
}

function obligation(proposal, overrides = {}) {
  return {
    obligationId: "obligation_tc103",
    obligationHash: HASH_C,
    subjectId: proposal.subjectId,
    principalId: proposal.principalId,
    assetId: proposal.terms.assetId,
    originalPrincipalMinor: proposal.terms.syntheticPrincipalMinor,
    outstandingPrincipalMinor: proposal.terms.syntheticPrincipalMinor,
    totalRepaidMinor: "0",
    maturityAt: new Date(T0.getTime() + 90 * 86_400_000).toISOString(),
    executionStatus: ObligationExecutionStatus.EXECUTED,
    status: ObligationStatus.ACTIVE,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: "obligation.v2",
    ...overrides
  };
}

function createdFacility() {
  const proposal = acceptedProposal();
  const canonicalObligation = obligation(proposal);
  const facility = createTradingFacility({
    matchProposal: proposal,
    obligation: canonicalObligation,
    createdByActorId: "actor_subject",
    now: new Date(T0.getTime() + 480_000)
  });
  return { proposal, canonicalObligation, facility };
}

function activeFacility() {
  const fixture = createdFacility();
  const collateral = contributeTradingSubjectCollateral(fixture.facility, {
    contributedByActorId: "actor_subject",
    amountMinor: fixture.facility.requiredSubjectCollateralMinor,
    expectedStateHash: fixture.facility.stateHash,
    expectedVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 540_000)
  });
  const funded = recordTradingProviderFunding(collateral, {
    fundedByActorId: "actor_provider",
    amountMinor: collateral.requiredProviderFundingMinor,
    expectedStateHash: collateral.stateHash,
    expectedVersion: collateral.version,
    now: new Date(T0.getTime() + 600_000)
  });
  const active = activateTradingFacility(funded, {
    matchProposal: fixture.proposal,
    obligation: fixture.canonicalObligation,
    activatedByActorId: "actor_subject",
    expectedStateHash: funded.stateHash,
    expectedVersion: funded.version,
    now: new Date(T0.getTime() + 660_000)
  });
  return { ...fixture, facility: active };
}

function flattenedFacility() {
  const fixture = activeFacility();
  const flattened = flattenTradingFacility(fixture.facility, [], {
    flattenedByActorId: "actor_risk",
    reasonCode: "operator_request",
    expectedStateHash: fixture.facility.stateHash,
    expectedVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 720_000)
  });
  return { ...fixture, facility: flattened.facility };
}

test("TC-103 links one synthetic Facility to the canonical Obligation", () => {
  const { facility } = createdFacility();
  assert.equal(
    facility.lifecycleStatus,
    TradingFacilityLifecycleStatus.AWAITING_CONTRIBUTIONS
  );
  assert.equal(facility.linkedCanonicalObligation, true);
  assert.equal(facility.secondLedgerCreated, false);
  assert.equal(facility.requiredSubjectCollateralMinor, "100000");
  assert.equal(facility.requiredProviderFundingMinor, "1000000");
  assert.equal(facility.nonRedeemable, true);
  assert.equal(facility.withdrawable, false);
  assert.equal(facility.transferable, false);
  assert.equal(facility.realCollateral, false);
  assert.equal(facility.realFunding, false);
  assert.equal(facility.fundsAuthority, false);
});

test("TC-103 contribution and funding commute before exact activation", () => {
  for (const subjectFirst of [true, false]) {
    const fixture = createdFacility();
    const subject = (current, offset) =>
      contributeTradingSubjectCollateral(current, {
        contributedByActorId: "actor_subject",
        amountMinor: current.requiredSubjectCollateralMinor,
        expectedStateHash: current.stateHash,
        expectedVersion: current.version,
        now: new Date(T0.getTime() + offset)
      });
    const provider = (current, offset) =>
      recordTradingProviderFunding(current, {
        fundedByActorId: "actor_provider",
        amountMinor: current.requiredProviderFundingMinor,
        expectedStateHash: current.stateHash,
        expectedVersion: current.version,
        now: new Date(T0.getTime() + offset)
      });
    const first = subjectFirst
      ? subject(fixture.facility, 540_000)
      : provider(fixture.facility, 540_000);
    const ready = subjectFirst
      ? provider(first, 600_000)
      : subject(first, 600_000);
    assert.equal(
      ready.lifecycleStatus,
      TradingFacilityLifecycleStatus.READY_FOR_ACTIVATION
    );
    assert.equal(ready.syntheticCapitalMinor, "1100000");
    const active = activateTradingFacility(ready, {
      matchProposal: fixture.proposal,
      obligation: fixture.canonicalObligation,
      activatedByActorId: "actor_subject",
      expectedStateHash: ready.stateHash,
      expectedVersion: ready.version,
      now: new Date(T0.getTime() + 660_000)
    });
    assert.equal(active.lifecycleStatus, TradingFacilityLifecycleStatus.ACTIVE);
    assert.equal(active.riskState, TradingFacilityRiskState.NORMAL);
    assert.equal(active.syntheticEquityMinor, "1100000");
  }
});

test("TC-103 refuses activation without an executed non-withdrawable Obligation", () => {
  const fixture = createdFacility();
  const collateral = contributeTradingSubjectCollateral(fixture.facility, {
    contributedByActorId: "actor_subject",
    amountMinor: fixture.facility.requiredSubjectCollateralMinor,
    expectedStateHash: fixture.facility.stateHash,
    expectedVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 540_000)
  });
  const ready = recordTradingProviderFunding(collateral, {
    fundedByActorId: "actor_provider",
    amountMinor: collateral.requiredProviderFundingMinor,
    expectedStateHash: collateral.stateHash,
    expectedVersion: collateral.version,
    now: new Date(T0.getTime() + 600_000)
  });
  assert.throws(
    () =>
      activateTradingFacility(ready, {
        matchProposal: fixture.proposal,
        obligation: obligation(fixture.proposal, {
          executionStatus: ObligationExecutionStatus.PENDING,
          status: ObligationStatus.CREATED,
          withdrawable: undefined
        }),
        activatedByActorId: "actor_subject",
        expectedStateHash: ready.stateHash,
        expectedVersion: ready.version,
        now: new Date(T0.getTime() + 660_000)
      }),
    /unavailable|active/
  );
});

test("TC-103 synthetic Order Intent cancellation reconciles exposure and equity", () => {
  const fixture = activeFacility();
  const submitted = submitTradingOrderIntent(fixture.facility, {
    submittedByActorId: "actor_subject",
    direction: TradingOrderDirection.LONG,
    syntheticNotionalMinor: "500000",
    expectedStateHash: fixture.facility.stateHash,
    expectedVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 720_000)
  });
  assert.equal(submitted.orderIntent.status, TradingOrderIntentStatus.OPEN);
  assert.equal(submitted.facility.syntheticExposureMinor, "500000");
  assert.equal(submitted.facility.syntheticEquityMinor, "600000");
  assert.equal(submitted.orderIntent.externalOrderSubmitted, false);
  const canceled = cancelTradingOrderIntent(
    submitted.facility,
    submitted.orderIntent,
    {
      canceledByActorId: "actor_subject",
      expectedFacilityStateHash: submitted.facility.stateHash,
      expectedFacilityVersion: submitted.facility.version,
      expectedOrderIntentHash: submitted.orderIntent.orderIntentHash,
      expectedOrderVersion: submitted.orderIntent.version,
      now: new Date(T0.getTime() + 780_000)
    }
  );
  assert.equal(canceled.orderIntent.status, TradingOrderIntentStatus.CANCELED);
  assert.equal(canceled.facility.syntheticExposureMinor, "0");
  assert.equal(canceled.facility.syntheticEquityMinor, "1100000");
  assert.equal(canceled.facility.openOrderCount, 0);
});

test("TC-103 shadow risk transitions are deterministic and monotonic", () => {
  const fixture = activeFacility();
  const elevated = submitTradingOrderIntent(fixture.facility, {
    submittedByActorId: "actor_subject",
    direction: TradingOrderDirection.SHORT,
    syntheticNotionalMinor: "600000",
    expectedStateHash: fixture.facility.stateHash,
    expectedVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 720_000)
  });
  const warning = evaluateTradingFacilityRisk(elevated.facility, {
    evaluatedByActorId: "actor_risk",
    expectedStateHash: elevated.facility.stateHash,
    expectedVersion: elevated.facility.version,
    now: new Date(T0.getTime() + 721_000)
  });
  assert.equal(warning.facility.riskState, TradingFacilityRiskState.WARNING);
  assert.deepEqual(warning.riskEvaluation.reasonCodes, [
    "synthetic_exposure_elevated"
  ]);
  assert.equal(warning.riskEvaluation.authorizing, false);
  const canceled = cancelTradingOrderIntent(
    warning.facility,
    elevated.orderIntent,
    {
      canceledByActorId: "actor_subject",
      expectedFacilityStateHash: warning.facility.stateHash,
      expectedFacilityVersion: warning.facility.version,
      expectedOrderIntentHash: elevated.orderIntent.orderIntentHash,
      expectedOrderVersion: elevated.orderIntent.version,
      now: new Date(T0.getTime() + 722_000)
    }
  );
  const noAutomaticRecovery = evaluateTradingFacilityRisk(
    canceled.facility,
    {
      evaluatedByActorId: "actor_risk",
      expectedStateHash: canceled.facility.stateHash,
      expectedVersion: canceled.facility.version,
      now: new Date(T0.getTime() + 723_000)
    }
  );
  assert.equal(
    noAutomaticRecovery.facility.riskState,
    TradingFacilityRiskState.WARNING
  );
  assert.equal(noAutomaticRecovery.riskEvaluation.automaticRecovery, false);
});

test("TC-103 stale risk data fails closed to REDUCE_ONLY", () => {
  const fixture = activeFacility();
  const evaluated = evaluateTradingFacilityRisk(fixture.facility, {
    evaluatedByActorId: "actor_risk",
    expectedStateHash: fixture.facility.stateHash,
    expectedVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 1_020_001)
  });
  assert.equal(
    evaluated.facility.riskState,
    TradingFacilityRiskState.REDUCE_ONLY
  );
  assert.equal(evaluated.riskEvaluation.freshness, "stale");
  assert.throws(
    () =>
      submitTradingOrderIntent(evaluated.facility, {
        submittedByActorId: "actor_subject",
        direction: TradingOrderDirection.LONG,
        syntheticNotionalMinor: "1",
        expectedStateHash: evaluated.facility.stateHash,
        expectedVersion: evaluated.facility.version,
        now: new Date(T0.getTime() + 1_020_002)
      }),
    /does not admit/
  );
});

test("TC-103 protective pause and flatten cannot transfer or withdraw", () => {
  const fixture = activeFacility();
  const submitted = submitTradingOrderIntent(fixture.facility, {
    submittedByActorId: "actor_subject",
    direction: TradingOrderDirection.LONG,
    syntheticNotionalMinor: "1000000",
    expectedStateHash: fixture.facility.stateHash,
    expectedVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 720_000)
  });
  const paused = pauseTradingFacilityNewRisk(submitted.facility, {
    pausedByActorId: "actor_risk",
    reasonCode: "risk_limit_breach",
    expectedStateHash: submitted.facility.stateHash,
    expectedVersion: submitted.facility.version,
    now: new Date(T0.getTime() + 721_000)
  });
  assert.equal(paused.riskState, TradingFacilityRiskState.REDUCE_ONLY);
  const flattened = flattenTradingFacility(
    paused,
    [submitted.orderIntent],
    {
      flattenedByActorId: "actor_risk",
      reasonCode: "risk_limit_breach",
      expectedStateHash: paused.stateHash,
      expectedVersion: paused.version,
      now: new Date(T0.getTime() + 722_000)
    }
  );
  assert.equal(
    flattened.facility.lifecycleStatus,
    TradingFacilityLifecycleStatus.FLATTENED
  );
  assert.equal(flattened.facility.riskState, TradingFacilityRiskState.FLATTEN);
  assert.equal(flattened.facility.syntheticExposureMinor, "0");
  assert.equal(
    flattened.orderIntents[0].status,
    TradingOrderIntentStatus.FLATTENED
  );
  for (const value of [flattened.facility, ...flattened.orderIntents]) {
    assert.equal(value.withdrawable, false);
    assert.equal(value.transferable, false);
    assert.equal(value.externalOrderSubmitted, false);
    assert.equal(value.productionFundsMoved, false);
    assert.equal(value.fundsAuthority, false);
  }
  assert.throws(
    () =>
      evaluateTradingFacilityRisk(flattened.facility, {
        evaluatedByActorId: "actor_risk",
        expectedStateHash: flattened.facility.stateHash,
        expectedVersion: flattened.facility.version,
        equityMinor: "999999999",
        now: new Date(T0.getTime() + 723_000)
      }),
    /open shape/
  );
});

test("TC-104 close and settlement conserve every synthetic minor unit", () => {
  const fixture = flattenedFacility();
  const closeRequest = requestTradingFacilityClose({
    facility: fixture.facility,
    requestedByActorId: "actor_subject",
    expectedStateHash: fixture.facility.stateHash,
    expectedVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 780_000)
  });
  const result = runTradingSettlement({
    facility: fixture.facility,
    closeRequest,
    obligation: fixture.canonicalObligation,
    settledByActorId: "actor_settlement_worker",
    expectedCloseRequestHash: closeRequest.requestHash,
    expectedFacilityStateHash: fixture.facility.stateHash,
    expectedFacilityVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 840_000)
  });
  assert.equal(result.facility.riskState, TradingFacilityRiskState.SETTLEMENT);
  assert.equal(result.settlement.finalSyntheticEquityMinor, "1100000");
  assert.equal(result.settlement.subjectReturnMinor, "100000");
  assert.equal(result.settlement.providerPrincipalReturnMinor, "1000000");
  assert.equal(result.settlement.totalAllocatedMinor, "1100000");
  assert.equal(result.settlement.realizedPnlMinor, "0");
  assert.equal(result.settlement.ipoOneFeeMinor, "0");
  assert.equal(result.settlement.waterfallBalanced, true);
  assert.equal(result.settlement.canonicalLedgerMutationCreated, false);
  assert.equal(result.settlement.secondLedgerCreated, false);
  assert.equal(result.settlement.nonRedeemable, true);
  assert.equal(result.settlement.productionFundsMoved, false);
});

test("TC-104 settlement refuses drift, open exposure, and caller-supplied economics", () => {
  const active = activeFacility();
  assert.throws(
    () =>
      requestTradingFacilityClose({
        facility: active.facility,
        requestedByActorId: "actor_subject",
        expectedStateHash: active.facility.stateHash,
        expectedVersion: active.facility.version,
        now: new Date(T0.getTime() + 780_000)
      }),
    /cannot accept/
  );
  const fixture = flattenedFacility();
  const closeRequest = requestTradingFacilityClose({
    facility: fixture.facility,
    requestedByActorId: "actor_subject",
    expectedStateHash: fixture.facility.stateHash,
    expectedVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 780_000)
  });
  assert.throws(
    () =>
      runTradingSettlement({
        facility: fixture.facility,
        closeRequest,
        obligation: fixture.canonicalObligation,
        settledByActorId: "actor_settlement_worker",
        expectedCloseRequestHash: closeRequest.requestHash,
        expectedFacilityStateHash: fixture.facility.stateHash,
        expectedFacilityVersion: fixture.facility.version,
        realizedPnlMinor: "1",
        now: new Date(T0.getTime() + 840_000)
      }),
    /open shape/
  );
  assert.throws(
    () =>
      runTradingSettlement({
        facility: fixture.facility,
        closeRequest,
        obligation: fixture.canonicalObligation,
        settledByActorId: "actor_settlement_worker",
        expectedCloseRequestHash: HASH_A,
        expectedFacilityStateHash: fixture.facility.stateHash,
        expectedFacilityVersion: fixture.facility.version,
        now: new Date(T0.getTime() + 840_000)
      }),
    /changed/
  );
});

test("TC-104 Performance Proof is bounded, privacy-safe, and non-authorizing", () => {
  const fixture = flattenedFacility();
  const closeRequest = requestTradingFacilityClose({
    facility: fixture.facility,
    requestedByActorId: "actor_subject",
    expectedStateHash: fixture.facility.stateHash,
    expectedVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 780_000)
  });
  const result = runTradingSettlement({
    facility: fixture.facility,
    closeRequest,
    obligation: fixture.canonicalObligation,
    settledByActorId: "actor_settlement_worker",
    expectedCloseRequestHash: closeRequest.requestHash,
    expectedFacilityStateHash: fixture.facility.stateHash,
    expectedFacilityVersion: fixture.facility.version,
    now: new Date(T0.getTime() + 840_000)
  });
  const proof = issueTradingPerformanceProof({
    settlement: result.settlement,
    facility: result.facility,
    obligation: fixture.canonicalObligation,
    issuedByActorId: "actor_provider",
    now: new Date(T0.getTime() + 900_000)
  });
  assert.equal(proof.claims.realProfitClaimed, false);
  assert.equal(proof.officialReport, false);
  assert.equal(proof.externalVerificationAvailable, false);
  assert.equal(proof.universalScore, false);
  assert.equal(proof.strategyDataIncluded, false);
  assert.equal(proof.rawHistoryIncluded, false);
  assert.equal(proof.revocable, true);
  assert.equal(proof.fundsAuthority, false);
  assert.equal(
    new Date(proof.expiresAt).getTime() - new Date(proof.issuedAt).getTime(),
    7 * 24 * 60 * 60 * 1000
  );
});
