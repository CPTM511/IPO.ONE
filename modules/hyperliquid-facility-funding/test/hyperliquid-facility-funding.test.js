import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import {
  ObligationExecutionStatus,
  ObligationStatus,
  TRADING_FACILITY_POLICY_VERSION,
  TRADING_FACILITY_SCHEMA_VERSION,
  TradingCapitalTemplateType,
  TradingFacilityLifecycleStatus,
  activateTradingFacility,
  contributeTradingSubjectCollateral,
  createTradingFacility,
  hashId,
  recordTradingProviderFunding
} from "../../../packages/domain/src/index.js";
import {
  HyperliquidTestnetContributionReceiptKind,
  HyperliquidTestnetContributionRole,
  HyperliquidTestnetFacilityFundingService,
  HyperliquidTestnetFacilityFundingStatus,
  InMemoryHyperliquidFacilityFundingRepository,
  ScriptedHyperliquidContributionReceiptAdapter,
  SimulatedHyperliquidFacilityFundingCommandGuard,
  SimulatedHyperliquidFacilityFundingKernelResolver,
  createSimulatedTestnetContributionReceipt
} from "../src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const schema = JSON.parse(
  await readFile(
    new URL(
      "../../../schemas/v2/hyperliquid-testnet-facility-funding-record.schema.json",
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

const NOW = new Date("2026-07-25T10:00:00.000Z").getTime();
const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;

function fixture() {
  const subjectActorId = "actor_tc401_agent_subject";
  const providerActorId = "actor_tc401_provider";
  const proposal = {
    tradingMatchProposalId: "trading_match_proposal_tc401",
    proposalHash: hashId("tc401_proposal", { version: 1 }),
    subjectId: "subject_tc401_agent",
    principalId: "principal_tc401",
    providerId: "provider_tc401",
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
    terms: {
      templateType: TradingCapitalTemplateType.HYBRID,
      termsHash: hashId("tc401_terms", { version: 1 }),
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      syntheticPrincipalMinor: "1000000"
    },
    schemaVersion: "trading_match_proposal.v1"
  };
  const obligation = {
    obligationId: "obligation_tc401",
    obligationHash: hashId("tc401_obligation", { version: 1 }),
    subjectId: proposal.subjectId,
    principalId: proposal.principalId,
    assetId: proposal.terms.assetId,
    originalPrincipalMinor: proposal.terms.syntheticPrincipalMinor,
    outstandingPrincipalMinor: proposal.terms.syntheticPrincipalMinor,
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
    now: new Date(NOW - 180_000)
  });
  const subject = contributeTradingSubjectCollateral(created, {
    contributedByActorId: subjectActorId,
    amountMinor: created.requiredSubjectCollateralMinor,
    expectedStateHash: created.stateHash,
    expectedVersion: created.version,
    now: new Date(NOW - 120_000)
  });
  const ready = recordTradingProviderFunding(subject, {
    fundedByActorId: providerActorId,
    amountMinor: subject.requiredProviderFundingMinor,
    expectedStateHash: subject.stateHash,
    expectedVersion: subject.version,
    now: new Date(NOW - 60_000)
  });
  assert.equal(
    ready.lifecycleStatus,
    TradingFacilityLifecycleStatus.READY_FOR_ACTIVATION
  );
  assert.equal(ready.schemaVersion, TRADING_FACILITY_SCHEMA_VERSION);
  assert.equal(ready.facilityPolicyVersion, TRADING_FACILITY_POLICY_VERSION);
  return {
    facility: ready,
    matchProposal: proposal,
    obligation,
    subjectActorId
  };
}

function kernelSnapshot(overrides = {}) {
  const resources = fixture();
  const facility = resources.facility;
  return {
    ...resources,
    facilityId: facility.tradingFacilityId,
    facilityHash: facility.facilityHash,
    facilityStateHash: facility.stateHash,
    facilityVersion: facility.version,
    facilityLifecycleStatus: facility.lifecycleStatus,
    obligationId: facility.obligationId,
    subjectId: facility.subjectId,
    bilateralTermsHash: facility.termsHash,
    assetId: facility.assetId,
    requiredSubjectContributionMinor:
      facility.requiredSubjectCollateralMinor,
    requiredProviderContributionMinor:
      facility.requiredProviderFundingMinor,
    maximumFacilityCapMinor: "1100000",
    facilityDestinationHash: hashId(
      "tc401_segregated_facility_destination",
      { facilityId: facility.tradingFacilityId }
    ),
    accountBindingHash: hashId("tc401_account_binding", {
      facilityId: facility.tradingFacilityId
    }),
    masterAccountHash: hashId("tc401_master_account", {
      facilityId: facility.tradingFacilityId
    }),
    withdrawalAuthorityHash: hashId("tc401_withdrawal_authority", {
      facilityId: facility.tradingFacilityId
    }),
    executionSignerReferenceHash: hashId(
      "tc401_execution_signer_reference",
      { facilityId: facility.tradingFacilityId }
    ),
    canonicalLedgerStateHash: hashId("tc401_canonical_ledger", {
      facilityId: facility.tradingFacilityId
    }),
    ledgerTransactionCount: 1,
    riskSnapshotHash: hashId("tc401_fresh_normal_risk", {
      facilityId: facility.tradingFacilityId
    }),
    riskState: "NORMAL",
    riskFreshness: "FRESH",
    riskObservedAt: new Date(NOW - 1_000).toISOString(),
    riskMaximumAgeMs: 60_000,
    simulationOnly: true,
    canonicalFacility: true,
    secondFacilityCreated: false,
    canonicalLedger: true,
    secondLedgerCreated: false,
    liveAccountsApproved: false,
    capturedAt: new Date(NOW).toISOString(),
    schemaVersion:
      "hyperliquid_testnet_facility_funding_kernel_snapshot.v1",
    ...overrides
  };
}

function receipt(record, role, {
  kind =
    HyperliquidTestnetContributionReceiptKind.FINALIZED_CONTRIBUTION,
  relatedReceiptHash = null,
  assetId = record.assetId,
  amountMinor = role ===
    HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS
    ? record.requiredSubjectContributionMinor
    : record.requiredProviderContributionMinor,
  destinationHash = record.facilityDestinationHash,
  unique = "default",
  clock = NOW + 1_000
} = {}) {
  return createSimulatedTestnetContributionReceipt(
    {
      fundingHash: record.fundingHash,
      facilityHash: record.facilityHash,
      contributorRole: role,
      kind,
      assetId,
      amountMinor,
      destinationHash,
      transactionReferenceHash: hashId("tc401_transaction", {
        role,
        kind,
        unique
      }),
      blockReferenceHash: hashId("tc401_block", {
        role,
        kind,
        unique
      }),
      relatedReceiptHash,
      freshness: "FRESH",
      complete: true,
      finalized:
        kind ===
        HyperliquidTestnetContributionReceiptKind.FINALIZED_CONTRIBUTION
    },
    { clock: () => clock }
  );
}

function placeholderReceipt(snapshot) {
  return createSimulatedTestnetContributionReceipt(
    {
      fundingHash: HASH_A,
      facilityHash: snapshot.facilityHash,
      contributorRole:
        HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS,
      kind:
        HyperliquidTestnetContributionReceiptKind.FINALIZED_CONTRIBUTION,
      assetId: snapshot.assetId,
      amountMinor: snapshot.requiredSubjectContributionMinor,
      destinationHash: snapshot.facilityDestinationHash,
      transactionReferenceHash: HASH_A,
      blockReferenceHash: HASH_B,
      relatedReceiptHash: null,
      freshness: "FRESH",
      complete: true,
      finalized: true
    },
    { clock: () => NOW }
  );
}

function service({
  repository,
  snapshot,
  receipts = [placeholderReceipt(snapshot)],
  now = NOW + 10_000
}) {
  return new HyperliquidTestnetFacilityFundingService({
    repository,
    commandGuard:
      new SimulatedHyperliquidFacilityFundingCommandGuard(),
    kernelResolver:
      new SimulatedHyperliquidFacilityFundingKernelResolver({
        snapshots: [snapshot]
      }),
    receiptAdapter:
      new ScriptedHyperliquidContributionReceiptAdapter({ receipts }),
    clock: () => now
  });
}

async function prepare(repository, snapshot, suffix = "default") {
  return service({ repository, snapshot }).prepare({
    facilityId: snapshot.facilityId,
    facilityHash: snapshot.facilityHash,
    idempotencyKey: `tc401-prepare-${suffix}`
  });
}

async function readyFunding({
  repository = new InMemoryHyperliquidFacilityFundingRepository(),
  snapshot = kernelSnapshot(),
  order = [
    HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS,
    HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL
  ],
  suffix = "ready"
} = {}) {
  const record = await prepare(repository, snapshot, suffix);
  const receipts = order.map((role, index) =>
    receipt(record, role, { unique: `${suffix}-${index}` })
  );
  const worker = service({ repository, snapshot, receipts });
  let current = record;
  for (const ignored of receipts) {
    current = await worker.reconcileNext({ fundingId: record.fundingId });
  }
  assert.equal(
    current.status,
    HyperliquidTestnetFacilityFundingStatus.READY
  );
  return { repository, snapshot, record: current, receipts };
}

test("TC-401 exact Provider/Agent contributions activate one canonical Facility", async () => {
  const repository = new InMemoryHyperliquidFacilityFundingRepository();
  const snapshot = kernelSnapshot();
  const prepared = await prepare(repository, snapshot, "e2e");
  const provider = receipt(
    prepared,
    HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL,
    { unique: "provider-first" }
  );
  const subject = receipt(
    prepared,
    HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS,
    { unique: "subject-second" }
  );
  const worker = service({
    repository,
    snapshot,
    receipts: [provider, subject]
  });
  const providerOnly = await worker.reconcileNext({
    fundingId: prepared.fundingId
  });
  assert.equal(
    providerOnly.status,
    HyperliquidTestnetFacilityFundingStatus.AWAITING_SUBJECT
  );
  const ready = await worker.reconcileNext({
    fundingId: prepared.fundingId
  });
  assert.equal(ready.reconciledTotalMinor, "1100000");
  assert.equal(ready.directFacilityDestination, true);
  assert.equal(ready.traderWalletPassThrough, false);
  assert.equal(ready.traderWithdrawalAuthority, false);
  const activated = await service({
    repository,
    snapshot,
    now: NOW + 20_000
  }).activate({
    fundingId: prepared.fundingId,
    idempotencyKey: "tc401-activate-e2e"
  });
  assert.equal(
    activated.record.status,
    HyperliquidTestnetFacilityFundingStatus.ACTIVE
  );
  assert.equal(activated.facility.lifecycleStatus, "active");
  assert.equal(activated.record.canonicalFacilityMutationCreated, true);
  assert.equal(activated.record.secondFacilityCreated, false);
  assert.equal(activated.record.ledgerMutationCreated, false);
  assert.equal(activated.record.secondLedgerCreated, false);
  assert.equal(validate(activated.record), true, JSON.stringify(validate.errors));
  assert.equal(
    (await repository.history(prepared.fundingId)).length,
    4
  );
  const replay = await service({
    repository,
    snapshot,
    now: NOW + 21_000
  }).activate({
    fundingId: prepared.fundingId,
    idempotencyKey: "tc401-activate-e2e"
  });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.record, activated.record);
  assert.deepEqual(replay.facility, activated.facility);
});

test("TC-401 contribution order commutes and duplicate receipt delivery is economic no-op", async () => {
  const first = await readyFunding({
    order: [
      HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS,
      HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL
    ],
    suffix: "subject-first"
  });
  const second = await readyFunding({
    order: [
      HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL,
      HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS
    ],
    suffix: "provider-first"
  });
  assert.equal(first.record.reconciledTotalMinor, "1100000");
  assert.equal(second.record.reconciledTotalMinor, "1100000");

  const repository = new InMemoryHyperliquidFacilityFundingRepository();
  const snapshot = kernelSnapshot();
  const prepared = await prepare(repository, snapshot, "duplicate");
  const subject = receipt(
    prepared,
    HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS,
    { unique: "duplicate" }
  );
  const worker = service({
    repository,
    snapshot,
    receipts: [subject, subject]
  });
  const firstDelivery = await worker.reconcileNext({
    fundingId: prepared.fundingId
  });
  const duplicateDelivery = await worker.reconcileNext({
    fundingId: prepared.fundingId
  });
  assert.deepEqual(duplicateDelivery, firstDelivery);
  assert.equal(duplicateDelivery.processedReceiptCount, 1);
  assert.equal(
    (await repository.history(prepared.fundingId)).length,
    2
  );
});

test("TC-401 wrong destination, asset, and amount become terminal incidents", async (t) => {
  for (const [name, override, reason] of [
    [
      "destination",
      { destinationHash: hashId("tc401_wrong_destination", { test: 1 }) },
      "wrong_destination"
    ],
    [
      "asset",
      { assetId: "urn:ipo-one:sandbox-asset:eur-cent" },
      "wrong_asset"
    ],
    [
      "amount",
      { amountMinor: "999999" },
      "wrong_amount"
    ]
  ]) {
    await t.test(name, async () => {
      const repository =
        new InMemoryHyperliquidFacilityFundingRepository();
      const snapshot = kernelSnapshot();
      const prepared = await prepare(repository, snapshot, `wrong-${name}`);
      const invalid = receipt(
        prepared,
        HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL,
        { ...override, unique: `wrong-${name}` }
      );
      const result = await service({
        repository,
        snapshot,
        receipts: [invalid]
      }).reconcileNext({ fundingId: prepared.fundingId });
      assert.equal(
        result.status,
        HyperliquidTestnetFacilityFundingStatus.INCIDENT
      );
      assert.deepEqual(result.incidentReasonCodes, [reason]);
      assert.equal(result.resultHash.startsWith("0x"), true);
      assert.equal(validate(result), true, JSON.stringify(validate.errors));
    });
  }
});

test("TC-401 reorg invalidation survives restart and requires replacement Evidence", async () => {
  const repository = new InMemoryHyperliquidFacilityFundingRepository();
  const snapshot = kernelSnapshot();
  const prepared = await prepare(repository, snapshot, "reorg");
  const subject = receipt(
    prepared,
    HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS,
    { unique: "reorg-subject" }
  );
  const provider = receipt(
    prepared,
    HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL,
    { unique: "reorg-provider" }
  );
  const initialWorker = service({
    repository,
    snapshot,
    receipts: [subject, provider]
  });
  await initialWorker.reconcileNext({ fundingId: prepared.fundingId });
  const ready = await initialWorker.reconcileNext({
    fundingId: prepared.fundingId
  });
  const invalidation = receipt(
    ready,
    HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL,
    {
      kind:
        HyperliquidTestnetContributionReceiptKind.REORG_INVALIDATION,
      relatedReceiptHash: provider.receiptHash,
      unique: "reorg-invalidation",
      clock: NOW + 2_000
    }
  );
  const afterReorg = await service({
    repository,
    snapshot,
    receipts: [invalidation]
  }).reconcileNext({ fundingId: prepared.fundingId });
  assert.equal(
    afterReorg.status,
    HyperliquidTestnetFacilityFundingStatus.AWAITING_PROVIDER
  );
  assert.equal(afterReorg.providerReceiptHash, null);
  assert.equal(afterReorg.reconciledTotalMinor, "100000");

  const restarted =
    new InMemoryHyperliquidFacilityFundingRepository(
      repository.exportSnapshot()
    );
  const replacement = receipt(
    afterReorg,
    HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL,
    { unique: "reorg-provider-replacement", clock: NOW + 3_000 }
  );
  const recovered = await service({
    repository: restarted,
    snapshot,
    receipts: [replacement]
  }).reconcileNext({ fundingId: prepared.fundingId });
  assert.equal(
    recovered.status,
    HyperliquidTestnetFacilityFundingStatus.READY
  );
  assert.notEqual(recovered.providerReceiptHash, provider.receiptHash);
  const activated = await service({
    repository: restarted,
    snapshot,
    now: NOW + 20_000
  }).activate({
    fundingId: prepared.fundingId,
    idempotencyKey: "tc401-activate-after-reorg"
  });
  assert.equal(activated.record.status, "ACTIVE");
  assert.equal(
    (await restarted.history(prepared.fundingId)).length,
    6
  );
});

test("TC-401 activation requires both contributions and fresh NORMAL risk", async () => {
  const repository = new InMemoryHyperliquidFacilityFundingRepository();
  const snapshot = kernelSnapshot();
  const prepared = await prepare(repository, snapshot, "not-ready");
  const subject = receipt(
    prepared,
    HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS,
    { unique: "not-ready" }
  );
  await service({
    repository,
    snapshot,
    receipts: [subject]
  }).reconcileNext({ fundingId: prepared.fundingId });
  await assert.rejects(
    () => service({ repository, snapshot }).activate({
      fundingId: prepared.fundingId,
      idempotencyKey: "tc401-activate-not-ready"
    }),
    /both exact finalized contributions/
  );

  const ready = await readyFunding({ suffix: "stale-risk" });
  const staleSnapshot = {
    ...ready.snapshot,
    riskObservedAt: new Date(NOW - 120_000).toISOString()
  };
  await assert.rejects(
    () => service({
      repository: ready.repository,
      snapshot: staleSnapshot,
      now: NOW + 10_000
    }).activate({
      fundingId: ready.record.fundingId,
      idempotencyKey: "tc401-activate-stale-risk"
    }),
    /fresh server-owned NORMAL risk/
  );
});

test("TC-401 Ledger or kernel drift creates immutable incident and never activates", async () => {
  const ready = await readyFunding({ suffix: "ledger-drift" });
  const drifted = {
    ...ready.snapshot,
    canonicalLedgerStateHash: hashId("tc401_drifted_ledger", {
      facilityId: ready.snapshot.facilityId
    }),
    capturedAt: new Date(NOW + 2_000).toISOString()
  };
  const result = await service({
    repository: ready.repository,
    snapshot: drifted,
    now: NOW + 10_000
  }).activate({
    fundingId: ready.record.fundingId,
    idempotencyKey: "tc401-activate-ledger-drift"
  });
  assert.equal(result.record.status, "INCIDENT");
  assert.deepEqual(result.record.incidentReasonCodes, [
    "canonical_ledger_changed"
  ]);
  assert.equal(result.record.canonicalFacilityMutationCreated, false);
  assert.equal(result.facility, undefined);
  assert.equal(validate(result.record), true, JSON.stringify(validate.errors));
});

test("TC-401 cap overflow and authority collisions fail before a funding intent exists", () => {
  const overCap = kernelSnapshot({ maximumFacilityCapMinor: "1099999" });
  assert.throws(
    () =>
      new SimulatedHyperliquidFacilityFundingKernelResolver({
        snapshots: [overCap]
      }),
    /exceed.*Facility cap/
  );
  const base = kernelSnapshot();
  const collision = {
    ...base,
    executionSignerReferenceHash: base.withdrawalAuthorityHash
  };
  assert.throws(
    () =>
      new SimulatedHyperliquidFacilityFundingKernelResolver({
        snapshots: [collision]
      }),
    /must remain separated/
  );
});

test("TC-401 runtime is closed, network-disabled, address-free, and rejects open receipts", () => {
  const snapshot = kernelSnapshot();
  const repository = new InMemoryHyperliquidFacilityFundingRepository();
  assert.throws(
    () =>
      new HyperliquidTestnetFacilityFundingService({
        repository,
        commandGuard:
          new SimulatedHyperliquidFacilityFundingCommandGuard(),
        kernelResolver:
          new SimulatedHyperliquidFacilityFundingKernelResolver({
            snapshots: [snapshot]
          }),
        receiptAdapter: {
          profile: {
            sourceFixed: true,
            simulationOnly: false,
            networkAvailable: true,
            liveTransportApproved: true,
            contributionSubmissionAvailable: true
          },
          async observe() {
            throw new Error("must never be called");
          }
        }
      }),
    /protected offline funding composition/
  );
  assert.throws(
    () =>
      createSimulatedTestnetContributionReceipt({
        fundingHash: HASH_A,
        facilityHash: snapshot.facilityHash,
        contributorRole:
          HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS,
        kind:
          HyperliquidTestnetContributionReceiptKind.FINALIZED_CONTRIBUTION,
        assetId: snapshot.assetId,
        amountMinor: snapshot.requiredSubjectContributionMinor,
        destinationHash: snapshot.facilityDestinationHash,
        transactionReferenceHash: HASH_A,
        blockReferenceHash: HASH_B,
        relatedReceiptHash: null,
        freshness: "FRESH",
        complete: true,
        finalized: true,
        rawAddress: "0x8c2cbe747578c03c385dfd4d2e45774e5541217e"
      }),
    /open or incomplete shape/
  );
  assert.doesNotMatch(
    JSON.stringify(placeholderReceipt(snapshot)),
    /0x8c2cbe747578c03c385dfd4d2e45774e5541217e|"(?:privateKey|rawAddress|signature)":/i
  );
});
