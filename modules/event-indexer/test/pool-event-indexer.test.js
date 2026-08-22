import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  keccak256,
  stringToHex
} from "viem";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  SECURED_POOL_V1_EVENT_ABI,
  createSecuredPoolV1Adapter
} from "../../chain-adapter/src/index.js";
import {
  InMemoryPoolObservationStore,
  PoolEventIndexer
} from "../src/index.js";

const CHAIN_ID = "eip155:84532";
const CONTRACT = "0x1111111111111111111111111111111111111111";
const MARKET = keccak256(stringToHex("ipo.one:m2:indexer-market"));
const ACCOUNT = "0x2222222222222222222222222222222222222222";
const PAYER = "0x3333333333333333333333333333333333333333";
const DEBT_ASSET = "0x4444444444444444444444444444444444444444";
const COLLATERAL_ASSET = "0x5555555555555555555555555555555555555555";
const ORACLE = "0x6666666666666666666666666666666666666666";
const SOURCE = keccak256(stringToHex("ipo.one:m2:indexer-oracle"));
const adapter = createSecuredPoolV1Adapter({ chainId: CHAIN_ID, contractAddress: CONTRACT, marketId: MARKET });

const FIXTURES = Object.freeze({
  MarketInitialized: {
    marketId: MARKET,
    chainId: 84532n,
    debtAsset: DEBT_ASSET,
    collateralAsset: COLLATERAL_ASSET,
    priceOracle: ORACLE,
    oracleSourceId: SOURCE,
    marketDebtCapAssets: 1_000_000n,
    borrowerDebtCapAssets: 100_000n,
    loanToValueBps: 7_000,
    liquidationThresholdBps: 8_000,
    pauseGuardian: ACCOUNT,
    recoveryAuthority: PAYER
  },
  OracleObservationAccepted: {
    marketId: MARKET,
    sourceId: SOURCE,
    roundId: 7n,
    priceUsdWad: 2_000n * 10n ** 18n,
    observedAt: 1_787_385_600n
  },
  OracleDeviationHaltChanged: {
    marketId: MARKET,
    halted: true,
    previousPriceUsdWad: 2_000n * 10n ** 18n,
    candidatePriceUsdWad: 1_500n * 10n ** 18n,
    actor: ACCOUNT
  },
  AssetsSupplied: {
    marketId: MARKET,
    account: ACCOUNT,
    assets: 10_000n,
    shares: 10_000n,
    cashAfter: 10_000n,
    totalSupplySharesAfter: 10_000n
  },
  AssetsWithdrawn: {
    marketId: MARKET,
    account: ACCOUNT,
    assets: 1_000n,
    shares: 1_000n,
    cashAfter: 9_000n,
    totalSupplySharesAfter: 9_000n
  },
  CollateralAdded: { marketId: MARKET, account: ACCOUNT, assets: 5n, collateralAfter: 5n },
  CollateralReleased: { marketId: MARKET, account: ACCOUNT, assets: 1n, collateralAfter: 4n },
  AssetsBorrowed: {
    marketId: MARKET,
    account: ACCOUNT,
    assets: 2_000n,
    debtShares: 2_000n,
    debtAfter: 2_000n,
    cashAfter: 8_000n
  },
  InterestAccrued: {
    marketId: MARKET,
    fromTimestamp: 1_787_385_600n,
    toTimestamp: 1_787_990_400n,
    chunks: 1n,
    interestAssets: 777n,
    reserveAssets: 77n
  },
  AssetsRepaid: {
    marketId: MARKET,
    account: ACCOUNT,
    payer: PAYER,
    assetsTransferred: 500n,
    debtReducedAssets: 499n,
    debtSharesBurned: 499n,
    reserveDustAssets: 1n,
    debtAfter: 1_501n,
    cashAfter: 8_500n
  },
  PositionLiquidated: {
    marketId: MARKET,
    borrower: ACCOUNT,
    liquidator: PAYER,
    repaidAssets: 500n,
    collateralSeizedAssets: 3n,
    badDebtRecognizedAssets: 1_501n
  },
  BadDebtRecovered: {
    marketId: MARKET,
    account: ACCOUNT,
    payer: PAYER,
    recoveredAssets: 100n,
    accountBadDebtAfter: 1_401n,
    marketBadDebtAfter: 1_401n
  },
  NewRiskPauseChanged: { marketId: MARKET, paused: true, actor: ACCOUNT }
});

function encodedEvent(eventName, args = FIXTURES[eventName]) {
  const item = getAbiItem({ abi: SECURED_POOL_V1_EVENT_ABI, name: eventName });
  const indexed = Object.fromEntries(
    item.inputs.filter(({ indexed: isIndexed }) => isIndexed).map(({ name }) => [name, args[name]])
  );
  const dataInputs = item.inputs.filter(({ indexed: isIndexed }) => !isIndexed);
  return {
    topics: encodeEventTopics({ abi: SECURED_POOL_V1_EVENT_ABI, eventName, args: indexed }),
    data: encodeAbiParameters(dataInputs, dataInputs.map(({ name }) => args[name]))
  };
}

function log(eventName, {
  blockNumber = 100,
  transactionIndex = 0,
  logIndex = 0,
  confirmations = 4,
  transactionTag = eventName,
  blockTag = String(blockNumber),
  args = FIXTURES[eventName]
} = {}) {
  return {
    chainId: CHAIN_ID,
    contractAddress: CONTRACT,
    transactionHash: hashId("m2a005_indexer_tx", transactionTag),
    transactionIndex,
    logIndex,
    blockNumber: String(blockNumber),
    blockHash: hashId("m2a005_indexer_block", blockTag),
    blockTimestamp: String(1_787_385_600 + blockNumber),
    confirmations,
    ...encodedEvent(eventName, args),
    observedAt: new Date(Date.UTC(2026, 7, 22, 8, 0, blockNumber % 60)).toISOString()
  };
}

function directRead(providerSlot, snapshot, overrides = {}) {
  return {
    providerSlot,
    chainId: CHAIN_ID,
    contractAddress: CONTRACT,
    marketId: MARKET,
    blockNumber: "900",
    blockHash: hashId("m2a005_direct_block", "900"),
    state: snapshot.state,
    complete: true,
    observedAt: "2026-08-22T09:00:00.000Z",
    readOnly: true,
    rawProviderPayloadPersisted: false,
    schemaVersion: "pool_direct_state_snapshot.v1",
    ...overrides
  };
}

async function buildProjectedIndexer() {
  const store = new InMemoryPoolObservationStore();
  const indexer = new PoolEventIndexer({
    adapter,
    store,
    clock: () => new Date("2026-08-22T09:01:00.000Z")
  });
  const events = [
    ["MarketInitialized", 100, 0],
    ["OracleObservationAccepted", 100, 1],
    ["AssetsSupplied", 101, 0],
    ["CollateralAdded", 102, 0],
    ["AssetsBorrowed", 103, 0],
    ["InterestAccrued", 104, 0],
    ["AssetsRepaid", 105, 0]
  ];
  for (const [eventName, blockNumber, logIndex] of events) {
    await indexer.ingest(log(eventName, { blockNumber, logIndex }));
  }
  return { store, indexer };
}

test("finalized Pool V1 events project once in canonical chain order and restore exactly", async () => {
  const { store, indexer } = await buildProjectedIndexer();
  const snapshot = indexer.snapshot();
  assert.equal(snapshot.finalizedEventCount, 7);
  assert.equal(snapshot.state.cashAssets, "8500");
  assert.equal(snapshot.state.grossDebtAssets, "2278");
  assert.equal(snapshot.state.reservesAssets, "78");
  assert.equal(snapshot.state.totalSupplyShares, "10000");
  assert.equal(snapshot.state.totalDebtShares, "1501");
  assert.equal(snapshot.state.accounts[0].debtShares, "1501");
  assert.equal(snapshot.state.accounts[0].collateralAssets, "5");
  assert.equal((await store.listOutbox()).length, 7);

  const duplicate = await indexer.ingest(log("AssetsRepaid", { blockNumber: 105 }));
  assert.equal(duplicate.disposition, "duplicate");
  const laterDelivery = log("AssetsRepaid", { blockNumber: 105 });
  laterDelivery.observedAt = "2026-08-22T08:59:00.000Z";
  assert.equal((await indexer.ingest(laterDelivery)).disposition, "duplicate");
  assert.equal((await store.listOutbox()).length, 7);

  const restarted = new PoolEventIndexer({ adapter, store });
  const restored = await restarted.restore();
  assert.equal(restored.snapshotHash, snapshot.snapshotHash);
  assert.equal(restored.stateHash, snapshot.stateHash);
});

test("safe observations may arrive out of order and finality still maps each tuple once", async () => {
  const store = new InMemoryPoolObservationStore();
  const indexer = new PoolEventIndexer({ adapter, store });
  await indexer.ingest(log("NewRiskPauseChanged", { blockNumber: 302, confirmations: 2 }));
  await indexer.ingest(log("OracleObservationAccepted", { blockNumber: 301, confirmations: 2 }));
  await indexer.ingest(log("OracleObservationAccepted", { blockNumber: 301, confirmations: 4 }));
  await indexer.ingest(log("NewRiskPauseChanged", { blockNumber: 302, confirmations: 4 }));
  assert.equal(indexer.snapshot().finalizedEventCount, 2);
  assert.equal(indexer.snapshot().state.newRiskPaused, true);
  assert.equal(indexer.snapshot().state.acceptedOracleRoundId, "7");
  assert.equal((await store.listOutbox()).length, 2);
});

test("all 13 admitted Pool V1 events have deterministic projection rules", async () => {
  const store = new InMemoryPoolObservationStore();
  const indexer = new PoolEventIndexer({ adapter, store });
  const ordered = [
    "MarketInitialized",
    "OracleObservationAccepted",
    "OracleDeviationHaltChanged",
    "AssetsSupplied",
    "AssetsWithdrawn",
    "CollateralAdded",
    "CollateralReleased",
    "AssetsBorrowed",
    "InterestAccrued",
    "AssetsRepaid",
    "PositionLiquidated",
    "BadDebtRecovered",
    "NewRiskPauseChanged"
  ];
  for (const [index, eventName] of ordered.entries()) {
    await indexer.ingest(log(eventName, { blockNumber: 400 + index }));
  }
  const state = indexer.snapshot().state;
  assert.equal(indexer.snapshot().finalizedEventCount, 13);
  assert.equal(state.initialized, true);
  assert.equal(state.acceptedOracleRoundId, "7");
  assert.equal(state.oracleDeviationHalted, true);
  assert.equal(state.newRiskPaused, true);
  assert.equal(state.totalSupplyShares, "9000");
  assert.equal(state.totalDebtShares, "0");
  assert.equal(state.badDebtAssets, "1401");
  assert.equal(state.cashAssets, "8600");
  assert.equal(state.grossDebtAssets, "2178");
  assert.equal(state.accounts[0].supplyShares, "9000");
  assert.equal(state.accounts[0].collateralAssets, "1");
  assert.equal(state.accounts[0].badDebtAssets, "1401");
  assert.equal((await store.listOutbox()).length, 13);
});

test("non-final block replacement invalidates additively while finalized replacement fails closed", async () => {
  const store = new InMemoryPoolObservationStore();
  const indexer = new PoolEventIndexer({ adapter, store });
  await indexer.ingest(log("AssetsSupplied", { blockNumber: 200, confirmations: 1, transactionTag: "orphan" }));
  const reorg = await indexer.observeCanonicalBlock({
    blockNumber: "200",
    blockHash: hashId("m2a005_indexer_block", "replacement"),
    observedAt: "2026-08-22T08:05:00.000Z"
  });
  assert.equal(reorg.invalidations.length, 1);
  assert.equal(reorg.invalidations[0].observationStatus, "invalidated");
  assert.equal((await store.listObservations()).length, 2);
  await indexer.ingest(log("AssetsSupplied", {
    blockNumber: 200,
    confirmations: 4,
    transactionTag: "replacement",
    blockTag: "replacement"
  }));
  assert.equal(indexer.snapshot().state.cashAssets, "10000");
  await assert.rejects(
    () => indexer.observeCanonicalBlock({
      blockNumber: "200",
      blockHash: hashId("m2a005_indexer_block", "late-replacement"),
      observedAt: "2026-08-22T08:06:00.000Z"
    }),
    /finalized_pool_event_cannot_reorg/
  );
});

test("two agreeing reads reconcile; disagreement freezes new risk but preserves protective work", async () => {
  const { store, indexer } = await buildProjectedIndexer();
  const snapshot = indexer.snapshot();
  const passing = await indexer.reconcile({
    directReads: [directRead("primary", snapshot), directRead("secondary", snapshot)]
  });
  assert.equal(passing.run.consistent, true);
  assert.equal(indexer.riskControl().newRiskFrozen, false);

  const driftedState = structuredClone(snapshot.state);
  driftedState.cashAssets = "8501";
  const mismatch = await indexer.reconcile({
    directReads: [
      directRead("primary", snapshot),
      directRead("secondary", snapshot, { state: driftedState })
    ]
  });
  assert.equal(mismatch.run.reasonCode, "provider_disagreement");
  assert.equal(indexer.riskControl().newRiskFrozen, true);
  assert.equal(indexer.operationAllowed("borrow"), false);
  assert.equal(indexer.operationAllowed("supply"), false);
  assert.equal(indexer.operationAllowed("repay"), true);
  assert.equal(indexer.operationAllowed("add_collateral"), true);
  assert.equal(indexer.operationAllowed("liquidate"), true);
  assert.equal((await store.listRiskTransitions()).length, 1);

  const projectionMismatch = await indexer.reconcile({
    directReads: [
      directRead("primary", snapshot, { state: driftedState }),
      directRead("secondary", snapshot, { state: driftedState })
    ]
  });
  assert.equal(projectionMismatch.run.reasonCode, "projection_mismatch");

  const zero = await indexer.reconcile({
    directReads: [directRead("primary", snapshot), directRead("secondary", snapshot)]
  });
  assert.equal(zero.run.consistent, true);
  assert.equal(indexer.riskControl().newRiskFrozen, true);
  const recovered = await indexer.approveRecovery({
    reconciliationId: zero.run.reconciliationId,
    approvalHash: hashId("m2a005_recovery_approval", "one"),
    approvedByHash: hashId("m2a005_recovery_reviewer", "one")
  });
  assert.equal(recovered.riskControl.newRiskFrozen, false);
  assert.equal(indexer.operationAllowed("borrow"), true);
});

test("incomplete reads freeze and recovery without the latest zero-discrepancy run fails closed", async () => {
  const { indexer } = await buildProjectedIndexer();
  const snapshot = indexer.snapshot();
  const openState = structuredClone(snapshot.state);
  openState.configuration.providerPayload = { rpcUrl: "https://not-admitted.invalid" };
  await assert.rejects(
    () => indexer.reconcile({
      directReads: [
        directRead("primary", snapshot, { state: openState }),
        directRead("secondary", snapshot, { state: openState })
      ]
    }),
    /direct-read market configuration is not closed/
  );
  const incomplete = await indexer.reconcile({
    directReads: [
      directRead("primary", snapshot),
      directRead("secondary", snapshot, { complete: false, state: undefined })
    ]
  });
  assert.equal(incomplete.run.reasonCode, "provider_read_incomplete");
  assert.equal(indexer.riskControl().newRiskFrozen, true);
  await assert.rejects(
    () => indexer.approveRecovery({
      reconciliationId: incomplete.run.reconciliationId,
      approvalHash: hashId("m2a005_bad_recovery", "approval"),
      approvedByHash: hashId("m2a005_bad_recovery", "reviewer")
    }),
    /pool_recovery_reconciliation_required/
  );
});
