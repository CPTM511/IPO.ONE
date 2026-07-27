import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import {
  ObligationExecutionStatus,
  ObligationStatus,
  activateTradingFacility,
  contributeTradingSubjectCollateral,
  createTradingFacility,
  flattenTradingFacility,
  hashId,
  recordTradingProviderFunding
} from "../../../packages/domain/src/index.js";
import {
  HYPERLIQUID_TESTNET_SETTLEMENT_SCHEMA_VERSION,
  HyperliquidTestnetFinalityStatus,
  HyperliquidTestnetReconciliationStatus,
  HyperliquidTestnetSettlementService,
  HyperliquidTestnetSettlementStatus,
  InMemoryHyperliquidSettlementRepository,
  ScriptedHyperliquidFeePolicyAdapter,
  ScriptedHyperliquidFinalityObservationAdapter,
  SimulatedHyperliquidSettlementCommandGuard,
  SimulatedHyperliquidSettlementKernelResolver,
  calculateTestnetSettlementWaterfall,
  createSimulatedTestnetFeePolicy,
  createSimulatedTestnetFinalityObservation
} from "../src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const schema = JSON.parse(
  await readFile(
    new URL(
      "../../../schemas/v2/hyperliquid-testnet-settlement-record.schema.json",
      import.meta.url
    ),
    "utf8"
  )
);
const validate = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false
})
  .addFormat("date-time", {
    type: "string",
    validate(value) {
      return (
        typeof value === "string" &&
        /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
        Number.isFinite(new Date(value).getTime())
      );
    }
  })
  .compile(schema);

const NOW = new Date("2026-07-25T16:00:00.000Z").getTime();

function facilityFixture(templateType = "hybrid") {
  const subjectActorId = "actor_tc402_agent_subject";
  const providerActorId = "actor_tc402_provider";
  const terms = {
    templateType,
    termsHash: hashId("tc402_terms", { templateType }),
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    syntheticPrincipalMinor: "1000000",
    durationDays: 90,
    fixedReturnBps:
      templateType === "performance_participation" ? 0
        : templateType === "credit" ? 500 : 250,
    performanceParticipationBps:
      templateType === "credit" ? 0
        : templateType === "performance_participation" ? 1500 : 750
  };
  const proposal = {
    tradingMatchProposalId: `trading_match_proposal_tc402_${templateType}`,
    proposalHash: hashId("tc402_proposal", { templateType }),
    subjectId: "subject_tc402_agent",
    principalId: "principal_tc402",
    providerId: "provider_tc402",
    subjectActorHash: hashId("actor", subjectActorId),
    providerActorHash: hashId("actor", providerActorId),
    status: "bilaterally_accepted",
    version: 3,
    providerAcceptance: {
      acceptedByActorHash: hashId("actor", providerActorId)
    },
    subjectAcceptance: {
      acceptedByActorHash: hashId("actor", subjectActorId)
    },
    immutableTerms: true,
    bilateralAcceptanceRequired: true,
    sandboxOnly: true,
    syntheticOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    realFunding: false,
    realPricing: false,
    expiresAt: new Date(NOW + 7 * 86_400_000).toISOString(),
    terms,
    schemaVersion: "trading_match_proposal.v1"
  };
  const obligation = {
    obligationId: "obligation_tc402",
    obligationHash: hashId("tc402_obligation", { version: 1 }),
    subjectId: proposal.subjectId,
    principalId: proposal.principalId,
    assetId: terms.assetId,
    originalPrincipalMinor: terms.syntheticPrincipalMinor,
    outstandingPrincipalMinor: terms.syntheticPrincipalMinor,
    totalRepaidMinor: "0",
    maturityAt: new Date(NOW + 90 * 86_400_000).toISOString(),
    executionStatus: ObligationExecutionStatus.EXECUTED,
    status: ObligationStatus.ACTIVE,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: "obligation.v2"
  };
  const created = createTradingFacility({
    matchProposal: proposal,
    obligation,
    createdByActorId: subjectActorId,
    now: new Date(NOW - 300_000)
  });
  const subject = contributeTradingSubjectCollateral(created, {
    contributedByActorId: subjectActorId,
    amountMinor: "100000",
    expectedStateHash: created.stateHash,
    expectedVersion: created.version,
    now: new Date(NOW - 290_000)
  });
  const ready = recordTradingProviderFunding(subject, {
    fundedByActorId: providerActorId,
    amountMinor: "1000000",
    expectedStateHash: subject.stateHash,
    expectedVersion: subject.version,
    now: new Date(NOW - 280_000)
  });
  const active = activateTradingFacility(ready, {
    matchProposal: proposal,
    obligation,
    activatedByActorId: subjectActorId,
    expectedStateHash: ready.stateHash,
    expectedVersion: ready.version,
    now: new Date(NOW - 270_000)
  });
  const flattened = flattenTradingFacility(active, [], {
    flattenedByActorId: "system_tc402_risk_guardian",
    reasonCode: "testnet_close",
    expectedStateHash: active.stateHash,
    expectedVersion: active.version,
    now: new Date(NOW - 60_000)
  }).facility;
  return {
    facility: flattened,
    proposal,
    obligation,
    terms,
    subjectActorId
  };
}

function feePolicy(overrides = {}) {
  return createSimulatedTestnetFeePolicy({
    policyId: "tc402_test_fee_policy_v1",
    approvalEvidenceHash: hashId("tc402_fee_policy_decision", {
      scope: "simulation_only"
    }),
    approvedByActorHash: hashId("actor", "IPO.ONE Founder"),
    ipoOneFeeBps: 200,
    validFrom: new Date(NOW - 60_000).toISOString(),
    validUntil: new Date(NOW + 86_400_000).toISOString(),
    ...overrides
  }, { clock: () => NOW });
}

function kernelSnapshot(templateType = "hybrid", overrides = {}) {
  const resources = facilityFixture(templateType);
  const facility = resources.facility;
  return {
    ...resources,
    facilityId: facility.tradingFacilityId,
    facilityHash: facility.facilityHash,
    facilityStateHash: facility.stateHash,
    facilityVersion: facility.version,
    facilityLifecycleStatus: facility.lifecycleStatus,
    facilityRiskState: "FLATTEN",
    openOrderCount: 0,
    exposureMinor: "0",
    newRiskAdmissionOpen: false,
    closeAdmissionFrozen: true,
    fundingId: "hyperliquid_testnet_facility_funding_tc402",
    fundingHash: hashId("tc402_funding", { facilityId: facility.tradingFacilityId }),
    fundingStatus: "ACTIVE",
    closeRequestId: "trading_facility_close_request_tc402",
    closeRequestHash: hashId("tc402_close_request", {
      facilityId: facility.tradingFacilityId
    }),
    closeRequestStatus: "requested",
    obligationId: obligationId(resources),
    obligationHash: resources.obligation.obligationHash,
    obligationExecutionStatus: "executed",
    obligationWithdrawable: false,
    subjectId: facility.subjectId,
    assetId: facility.assetId,
    templateType,
    termsHash: facility.termsHash,
    fixedReturnBps: resources.terms.fixedReturnBps,
    performanceParticipationBps:
      resources.terms.performanceParticipationBps,
    durationDays: resources.terms.durationDays,
    subjectContributionMinor: "100000",
    providerContributionMinor: "1000000",
    finalReconciliationHash: hashId("tc402_final_reconciliation", {
      facilityId: facility.tradingFacilityId
    }),
    reconciliationStatus: "RECONCILED",
    unknownExecutionCount: 0,
    canonicalLedgerStateHash: hashId("tc402_ledger_snapshot", {
      facilityId: facility.tradingFacilityId
    }),
    ledgerTransactionCount: 9,
    canonicalFacility: true,
    canonicalObligation: true,
    canonicalLedger: true,
    secondFacilityCreated: false,
    secondObligationCreated: false,
    secondLedgerCreated: false,
    simulationOnly: true,
    externalSystemQueried: false,
    liveAccountsApproved: false,
    capturedAt: new Date(NOW).toISOString(),
    schemaVersion: "hyperliquid_testnet_settlement_kernel_snapshot.v1",
    ...overrides
  };
}

function obligationId(resources) {
  return resources.obligation.obligationId;
}

function placeholderObservation(snapshot) {
  return createSimulatedTestnetFinalityObservation({
    settlementHash: hashId("placeholder_settlement", { id: 1 }),
    facilityHash: snapshot.facilityHash,
    fundingHash: snapshot.fundingHash,
    assetId: snapshot.assetId,
    sourceEvidenceHash: hashId("placeholder_evidence", { id: 1 }),
    finalityStatus: HyperliquidTestnetFinalityStatus.UNKNOWN,
    reconciliationStatus: HyperliquidTestnetReconciliationStatus.UNKNOWN,
    openOrderCount: 0,
    exposureMinor: "0",
    unknownExecutionCount: 1,
    positionsFinal: false,
    unrealizedPnlMinor: "0",
    realizedPnlMinor: "0",
    venueCostMinor: "0",
    closingCostMinor: "0",
    finalEquityMinor: "0",
    complete: false,
    economicValuesAuthoritative: false,
    reasonCode: "placeholder"
  }, { clock: () => NOW });
}

function service({
  repository,
  snapshot,
  observations = [placeholderObservation(snapshot)],
  policy = feePolicy(),
  clock = () => NOW
}) {
  return new HyperliquidTestnetSettlementService({
    repository,
    commandGuard: new SimulatedHyperliquidSettlementCommandGuard(),
    kernelResolver: new SimulatedHyperliquidSettlementKernelResolver({
      snapshots: [snapshot]
    }),
    observationAdapter:
      new ScriptedHyperliquidFinalityObservationAdapter({ observations }),
    feePolicyAdapter:
      new ScriptedHyperliquidFeePolicyAdapter({ policy }),
    clock
  });
}

async function prepared(templateType = "hybrid") {
  const repository = new InMemoryHyperliquidSettlementRepository();
  const snapshot = kernelSnapshot(templateType);
  const result = await service({ repository, snapshot }).prepare({
    facilityId: snapshot.facilityId,
    facilityHash: snapshot.facilityHash,
    idempotencyKey: `tc402-prepare-${templateType}`
  });
  assert.equal(result.record.status, "AWAITING_FINALITY");
  assert.equal(validate(result.record), true, JSON.stringify(validate.errors));
  return { repository, snapshot, record: result.record };
}

function finalObservation(record, snapshot, {
  realizedPnlMinor = "120000",
  venueCostMinor = "15000",
  closingCostMinor = "5000",
  finalEquityMinor = "1200000",
  finalityStatus = "FINAL",
  reconciliationStatus = "RECONCILED",
  openOrderCount = 0,
  exposureMinor = "0",
  unknownExecutionCount = 0,
  positionsFinal = true,
  unrealizedPnlMinor = "0",
  complete = true,
  economicValuesAuthoritative = true,
  unique = "final",
  observedAtMs = NOW
} = {}) {
  return createSimulatedTestnetFinalityObservation({
    settlementHash: record.settlementHash,
    facilityHash: snapshot.facilityHash,
    fundingHash: snapshot.fundingHash,
    assetId: snapshot.assetId,
    sourceEvidenceHash: hashId("tc402_finality_evidence", { unique }),
    finalityStatus,
    reconciliationStatus,
    openOrderCount,
    exposureMinor,
    unknownExecutionCount,
    positionsFinal,
    unrealizedPnlMinor,
    realizedPnlMinor,
    venueCostMinor,
    closingCostMinor,
    finalEquityMinor,
    complete,
    economicValuesAuthoritative,
    reasonCode: unique
  }, { clock: () => observedAtMs });
}

test("TC-402 waterfall conserves profit, loss, partial recovery, and zero income", () => {
  const vectors = [
    {
      name: "hybrid_profit",
      input: {
        templateType: "hybrid",
        providerContributionMinor: "1000000",
        subjectContributionMinor: "100000",
        finalEquityMinor: "1200000",
        realizedPnlMinor: "120000",
        venueCostMinor: "15000",
        closingCostMinor: "5000",
        fixedReturnBps: 250,
        performanceParticipationBps: 750,
        durationDays: 90,
        ipoOneFeeBps: 200
      },
      expected: {
        providerPrincipalReturnMinor: "1000000",
        subjectContributionReturnMinor: "100000",
        realizedFinancialIncomeMinor: "100000",
        providerFixedReturnGrossMinor: "6164",
        providerPerformanceParticipationGrossMinor: "7037",
        ipoOneFeeMinor: "264",
        providerNetIncomeMinor: "12937",
        subjectProfitMinor: "86799",
        totalAllocatedMinor: "1200000"
      }
    },
    {
      name: "subject_first_loss",
      input: {
        templateType: "credit",
        providerContributionMinor: "1000000",
        subjectContributionMinor: "100000",
        finalEquityMinor: "950000",
        realizedPnlMinor: "-150000",
        venueCostMinor: "0",
        closingCostMinor: "0",
        fixedReturnBps: 500,
        performanceParticipationBps: 0,
        durationDays: 90,
        ipoOneFeeBps: 200
      },
      expected: {
        providerPrincipalReturnMinor: "950000",
        providerPrincipalShortfallMinor: "50000",
        subjectContributionReturnMinor: "0",
        subjectFirstLossMinor: "100000",
        realizedFinancialIncomeMinor: "0",
        ipoOneFeeMinor: "0",
        totalAllocatedMinor: "950000"
      }
    },
    {
      name: "partial_provider_recovery",
      input: {
        templateType: "performance_participation",
        providerContributionMinor: "1000000",
        subjectContributionMinor: "100000",
        finalEquityMinor: "500000",
        realizedPnlMinor: "-600000",
        venueCostMinor: "0",
        closingCostMinor: "0",
        fixedReturnBps: 0,
        performanceParticipationBps: 1500,
        durationDays: 90,
        ipoOneFeeBps: 200
      },
      expected: {
        providerPrincipalReturnMinor: "500000",
        providerPrincipalShortfallMinor: "500000",
        subjectFirstLossMinor: "100000",
        ipoOneFeeMinor: "0",
        totalAllocatedMinor: "500000"
      }
    },
    {
      name: "zero_income",
      input: {
        templateType: "hybrid",
        providerContributionMinor: "1000000",
        subjectContributionMinor: "100000",
        finalEquityMinor: "1100000",
        realizedPnlMinor: "20000",
        venueCostMinor: "15000",
        closingCostMinor: "5000",
        fixedReturnBps: 250,
        performanceParticipationBps: 750,
        durationDays: 90,
        ipoOneFeeBps: 200
      },
      expected: {
        providerPrincipalReturnMinor: "1000000",
        subjectContributionReturnMinor: "100000",
        realizedFinancialIncomeMinor: "0",
        providerNetIncomeMinor: "0",
        subjectProfitMinor: "0",
        ipoOneFeeMinor: "0",
        totalAllocatedMinor: "1100000"
      }
    }
  ];
  for (const vector of vectors) {
    const actual = calculateTestnetSettlementWaterfall(vector.input);
    for (const [key, value] of Object.entries(vector.expected)) {
      assert.equal(actual[key], value, `${vector.name}.${key}`);
    }
    assert.equal(actual.principalFeeApplied, false);
    assert.equal(actual.unrealizedPnlFeeApplied, false);
    assert.equal(actual.providerPrincipalGuaranteed, false);
    assert.equal(actual.waterfallBalanced, true);
  }
});

test("TC-402 fixed, performance, and hybrid templates use exact floor arithmetic", () => {
  const base = {
    providerContributionMinor: "999999",
    subjectContributionMinor: "1",
    finalEquityMinor: "1001001",
    realizedPnlMinor: "1001",
    venueCostMinor: "0",
    closingCostMinor: "0",
    durationDays: 1,
    ipoOneFeeBps: 333
  };
  const credit = calculateTestnetSettlementWaterfall({
    ...base,
    templateType: "credit",
    fixedReturnBps: 500,
    performanceParticipationBps: 0
  });
  const performance = calculateTestnetSettlementWaterfall({
    ...base,
    templateType: "performance_participation",
    fixedReturnBps: 0,
    performanceParticipationBps: 1500
  });
  const hybrid = calculateTestnetSettlementWaterfall({
    ...base,
    templateType: "hybrid",
    fixedReturnBps: 250,
    performanceParticipationBps: 750
  });
  assert.equal(credit.fixedReturnTargetMinor, "136");
  assert.equal(credit.providerPerformanceParticipationGrossMinor, "0");
  assert.equal(performance.providerFixedReturnGrossMinor, "0");
  assert.equal(performance.providerPerformanceParticipationGrossMinor, "150");
  assert.equal(hybrid.fixedReturnTargetMinor, "68");
  assert.equal(hybrid.providerPerformanceParticipationGrossMinor, "69");
  for (const item of [credit, performance, hybrid]) {
    assert.equal(item.totalAllocatedMinor, base.finalEquityMinor);
    assert.equal(
      BigInt(item.ipoOneFeeBasisMinor) <=
        BigInt(item.realizedFinancialIncomeMinor),
      true
    );
  }
});

test("TC-402 rejects non-conservation, template drift, and fee on principal", () => {
  const base = {
    templateType: "hybrid",
    providerContributionMinor: "1000000",
    subjectContributionMinor: "100000",
    finalEquityMinor: "1200000",
    realizedPnlMinor: "120000",
    venueCostMinor: "15000",
    closingCostMinor: "5000",
    fixedReturnBps: 250,
    performanceParticipationBps: 750,
    durationDays: 90,
    ipoOneFeeBps: 200
  };
  assert.throws(
    () => calculateTestnetSettlementWaterfall({
      ...base,
      finalEquityMinor: "1200001"
    }),
    /reconcile/
  );
  assert.throws(
    () => calculateTestnetSettlementWaterfall({
      ...base,
      templateType: "credit"
    }),
    /template economics/
  );
  const zeroIncome = calculateTestnetSettlementWaterfall({
    ...base,
    finalEquityMinor: "1100000",
    realizedPnlMinor: "0",
    venueCostMinor: "0",
    closingCostMinor: "0"
  });
  assert.equal(zeroIncome.ipoOneFeeBasisMinor, "0");
  assert.equal(zeroIncome.ipoOneFeeMinor, "0");
});

test("TC-402 final reconciliation posts one balanced canonical Ledger transaction", async () => {
  const { repository, snapshot, record } = await prepared("hybrid");
  const observation = finalObservation(record, snapshot);
  const activeService = service({
    repository,
    snapshot,
    observations: [observation]
  });
  const ready = await activeService.reconcileFinality({
    settlementId: record.settlementId
  });
  assert.equal(ready.record.status, "READY_TO_SETTLE");
  const settled = await activeService.settle({
    settlementId: record.settlementId,
    idempotencyKey: "tc402-settle-hybrid"
  });
  assert.equal(
    settled.record.status,
    "SETTLED",
    JSON.stringify(settled.record.incidentReasonCodes)
  );
  assert.equal(settled.facility.riskState, "SETTLEMENT");
  assert.equal(
    settled.ledger.transaction.debitTotalMinor,
    settled.ledger.transaction.creditTotalMinor
  );
  assert.equal(
    settled.ledger.transaction.entries.some(
      (entry) =>
        settled.ledger.accounts.trading_provider_contributed_capital
          .ledgerAccountId === entry.ledgerAccountId &&
        entry.direction === "credit"
    ),
    true
  );
  assert.equal(
    settled.ledger.transaction.metadata.payoutExecuted,
    false
  );
  assert.equal(validate(settled.record), true, JSON.stringify(validate.errors));
  const replay = await activeService.settle({
    settlementId: record.settlementId,
    idempotencyKey: "tc402-settle-hybrid"
  });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.record, settled.record);
  assert.deepEqual(replay.ledger, settled.ledger);
});

test("TC-402 UNKNOWN, stale, incomplete, and open exposure never release settlement", async () => {
  const cases = [
    {
      unique: "unknown",
      finalityStatus: "UNKNOWN",
      reconciliationStatus: "UNKNOWN",
      economicValuesAuthoritative: false
    },
    {
      unique: "stale",
      observedAtMs: NOW - 300_001
    },
    {
      unique: "future",
      observedAtMs: NOW + 1
    },
    { unique: "orders", openOrderCount: 1 },
    { unique: "exposure", exposureMinor: "1" },
    { unique: "unknown_execution", unknownExecutionCount: 1 },
    { unique: "positions", positionsFinal: false },
    { unique: "unrealized", unrealizedPnlMinor: "1" },
    { unique: "incomplete", complete: false }
  ];
  for (const mutation of cases) {
    const { repository, snapshot, record } = await prepared("hybrid");
    const observation = finalObservation(record, snapshot, mutation);
    const guarded = service({
      repository,
      snapshot,
      observations: [observation]
    });
    const pending = await guarded.reconcileFinality({
      settlementId: record.settlementId
    });
    assert.equal(
      pending.record.status,
      "AWAITING_FINALITY",
      mutation.unique
    );
    await assert.rejects(
      () => guarded.settle({
        settlementId: record.settlementId,
        idempotencyKey: `tc402-forbidden-${mutation.unique}`
      }),
      /incomplete/
    );
    assert.equal(pending.record.ledgerTransactionId, null);
  }
});

test("TC-402 kernel or observation drift becomes an immutable incident", async () => {
  const { repository, snapshot, record } = await prepared("hybrid");
  const observation = finalObservation(record, snapshot, {
    unique: "binding_drift"
  });
  const drifted = service({
    repository,
    snapshot: {
      ...snapshot,
      finalReconciliationHash: hashId("drifted_reconciliation", { id: 1 })
    },
    observations: [observation]
  });
  const result = await drifted.reconcileFinality({
    settlementId: record.settlementId
  });
  assert.equal(result.record.status, "INCIDENT");
  assert.deepEqual(result.record.incidentReasonCodes, [
    "kernel_binding_drift"
  ]);
  assert.equal(result.record.ledgerTransactionId, null);
});

test("TC-402 Performance Evidence is issued, revoked, and superseded append-only", async () => {
  const { repository, snapshot, record } = await prepared("performance_participation");
  const observation = finalObservation(record, snapshot, {
    unique: "proof_chain"
  });
  const runtime = service({
    repository,
    snapshot,
    observations: [observation]
  });
  await runtime.reconcileFinality({ settlementId: record.settlementId });
  await runtime.settle({
    settlementId: record.settlementId,
    idempotencyKey: "tc402-proof-settle"
  });
  const issued = await runtime.issuePerformanceEvidence({
    settlementId: record.settlementId,
    idempotencyKey: "tc402-proof-v1"
  });
  assert.equal(issued.record.status, "EVIDENCE_ACTIVE");
  assert.equal(issued.record.performanceEvidenceVersion, 1);
  assert.equal(issued.record.currentPerformanceEvidence.status, "active");
  assert.equal(
    new Date(
      issued.record.currentPerformanceEvidence.expiresAt
    ).getTime() -
      new Date(
        issued.record.currentPerformanceEvidence.issuedAt
      ).getTime(),
    7 * 24 * 60 * 60 * 1000
  );
  const firstHash =
    issued.record.currentPerformanceEvidence.performanceEvidenceHash;
  const revoked = await runtime.revokePerformanceEvidence({
    settlementId: record.settlementId,
    idempotencyKey: "tc402-proof-revoke",
    reasonCode: "source_evidence_invalidated"
  });
  assert.equal(revoked.record.status, "EVIDENCE_REVOKED");
  assert.equal(revoked.record.performanceEvidenceVersion, 2);
  assert.equal(
    revoked.record.currentPerformanceEvidence.previousEvidenceHash,
    firstHash
  );
  const reissued = await runtime.issuePerformanceEvidence({
    settlementId: record.settlementId,
    idempotencyKey: "tc402-proof-v3"
  });
  assert.equal(reissued.record.status, "EVIDENCE_ACTIVE");
  assert.equal(reissued.record.performanceEvidenceVersion, 3);
  assert.equal(
    reissued.record.currentPerformanceEvidence.previousEvidenceHash,
    revoked.record.currentPerformanceEvidence.performanceEvidenceHash
  );
  assert.equal(
    reissued.record.currentPerformanceEvidence.claims.principalGuaranteed,
    false
  );
  assert.equal(
    reissued.record.currentPerformanceEvidence.rawHistoryIncluded,
    false
  );
  assert.equal(validate(reissued.record), true, JSON.stringify(validate.errors));
  assert.equal(repository.eventCount, 6);
});

test("TC-402 closed adapters expose no live, signing, payout, or raw-address path", async () => {
  const source = await readFile(
    new URL("../src/index.js", import.meta.url),
    "utf8"
  );
  for (const forbidden of [
    "fetch(",
    "withdraw3",
    "usdSend",
    "spotSend",
    "sendAsset",
    "vaultTransfer",
    "approveAgent",
    "approveBuilderFee",
    "privateKey",
    "seedPhrase",
    "mnemonic"
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(/\b0x[0-9a-fA-F]{40}\b/.test(source), false);
  assert.equal(source.includes("productionPricingApproved: false"), true);
  assert.equal(source.includes("principalFeeAllowed: false"), true);
  assert.equal(source.includes("unrealizedPnlFeeAllowed: false"), true);
  assert.equal(source.includes("payoutExecuted: false"), true);
  assert.equal(source.includes("HYPERLIQUID_TESTNET_SETTLEMENT_SCHEMA_VERSION"), true);
  assert.equal(HYPERLIQUID_TESTNET_SETTLEMENT_SCHEMA_VERSION,
    "hyperliquid_testnet_simulated_settlement.v1");
  const snapshot = kernelSnapshot();
  assert.throws(
    () =>
      new HyperliquidTestnetSettlementService({
        repository: new InMemoryHyperliquidSettlementRepository(),
        commandGuard: {
          async authorize() {
            return { approved: true };
          }
        },
        kernelResolver:
          new SimulatedHyperliquidSettlementKernelResolver({
            snapshots: [snapshot]
          }),
        observationAdapter:
          new ScriptedHyperliquidFinalityObservationAdapter({
            observations: [placeholderObservation(snapshot)]
          }),
        feePolicyAdapter:
          new ScriptedHyperliquidFeePolicyAdapter({
            policy: feePolicy()
          }),
        clock: () => NOW
      }),
    /closed settlement dependencies/
  );
});
