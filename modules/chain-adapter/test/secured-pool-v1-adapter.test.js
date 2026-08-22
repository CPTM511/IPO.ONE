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
  SECURED_POOL_V1_ABI_VERSION,
  SECURED_POOL_V1_EVENT_ABI,
  SECURED_POOL_V1_EVENT_TOPICS,
  createSecuredPoolV1Adapter
} from "../src/index.js";

const CHAIN_ID = "eip155:84532";
const CONTRACT = "0x1111111111111111111111111111111111111111";
const MARKET = keccak256(stringToHex("ipo.one:m2:test-market"));
const ACCOUNT = "0x2222222222222222222222222222222222222222";
const PAYER = "0x3333333333333333333333333333333333333333";
const ASSET = "0x4444444444444444444444444444444444444444";
const COLLATERAL = "0x5555555555555555555555555555555555555555";
const ORACLE = "0x6666666666666666666666666666666666666666";
const SOURCE = keccak256(stringToHex("ipo.one:oracle:fixture"));

const adapter = createSecuredPoolV1Adapter({
  chainId: CHAIN_ID,
  contractAddress: CONTRACT,
  marketId: MARKET
});

const EVENT_ARGS = Object.freeze({
  MarketInitialized: {
    marketId: MARKET,
    chainId: 84532n,
    debtAsset: ASSET,
    collateralAsset: COLLATERAL,
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
    observedAt: 1_785_000_000n
  },
  OracleDeviationHaltChanged: {
    marketId: MARKET,
    halted: true,
    previousPriceUsdWad: 2_000n * 10n ** 18n,
    candidatePriceUsdWad: 1_500n * 10n ** 18n,
    actor: ACCOUNT
  },
  InterestAccrued: {
    marketId: MARKET,
    fromTimestamp: 1_785_000_000n,
    toTimestamp: 1_785_604_800n,
    chunks: 1n,
    interestAssets: 777n,
    reserveAssets: 77n
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
    cashAfter: 7_000n
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
    cashAfter: 7_500n
  },
  PositionLiquidated: {
    marketId: MARKET,
    borrower: ACCOUNT,
    liquidator: PAYER,
    repaidAssets: 500n,
    collateralSeizedAssets: 1n,
    badDebtRecognizedAssets: 100n
  },
  BadDebtRecovered: {
    marketId: MARKET,
    account: ACCOUNT,
    payer: PAYER,
    recoveredAssets: 50n,
    accountBadDebtAfter: 50n,
    marketBadDebtAfter: 50n
  },
  NewRiskPauseChanged: { marketId: MARKET, paused: true, actor: ACCOUNT }
});

function encodedEvent(eventName, args = EVENT_ARGS[eventName]) {
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

function log(eventName = "AssetsSupplied", overrides = {}) {
  return {
    chainId: CHAIN_ID,
    contractAddress: CONTRACT,
    transactionHash: hashId("m2a005_tx", eventName),
    transactionIndex: 0,
    logIndex: 0,
    blockNumber: "100",
    blockHash: hashId("m2a005_block", "100"),
    blockTimestamp: "1787385600",
    confirmations: 1,
    ...encodedEvent(eventName),
    observedAt: "2026-08-22T08:00:00.000Z",
    ...overrides
  };
}

test("the closed ABI admits and normalizes every Pool V1 event exactly once", () => {
  assert.equal(Object.keys(SECURED_POOL_V1_EVENT_TOPICS).length, 13);
  for (const eventName of Object.keys(EVENT_ARGS)) {
    const normalized = adapter.normalizeLog(log(eventName));
    assert.equal(normalized.eventName, eventName);
    assert.equal(normalized.args.marketId, MARKET);
    assert.equal(normalized.abiVersion, SECURED_POOL_V1_ABI_VERSION);
    assert.equal(normalized.observationStatus, "included");
    assert.equal(normalized.readOnly, true);
    assert.equal(normalized.syntheticOnly, true);
    assert.equal(normalized.productionFundsMoved, false);
    assert.equal(JSON.stringify(normalized).includes("topics"), false);
    assert.equal(JSON.stringify(normalized).includes("data"), false);
  }
});

test("tuple identity is stable while block/finality observations remain distinct", () => {
  const included = adapter.normalizeLog(log());
  const safe = adapter.normalizeLog(log("AssetsSupplied", { confirmations: 2 }));
  const finalized = adapter.normalizeLog(log("AssetsSupplied", { confirmations: 4 }));
  assert.equal(included.eventKey, safe.eventKey);
  assert.equal(safe.eventKey, finalized.eventKey);
  assert.notEqual(included.observationHash, safe.observationHash);
  assert.notEqual(safe.observationHash, finalized.observationHash);
  assert.deepEqual(
    [included.observationStatus, safe.observationStatus, finalized.observationStatus],
    ["included", "safe", "finalized"]
  );
});

test("wrong chain, emitter, market, unknown topic, malformed data and open provider fields fail closed", () => {
  assert.throws(() => adapter.normalizeLog(log("AssetsSupplied", { chainId: "eip155:1952" })), /pool_chain_mismatch/);
  assert.throws(
    () => adapter.normalizeLog(log("AssetsSupplied", { contractAddress: ACCOUNT })),
    /pool_emitter_mismatch/
  );
  assert.throws(
    () => adapter.normalizeLog(log("AssetsSupplied", encodedEvent("AssetsSupplied", {
      ...EVENT_ARGS.AssetsSupplied,
      marketId: hashId("other_market", "one")
    }))),
    /pool_market_mismatch/
  );
  assert.throws(
    () => adapter.normalizeLog(log("AssetsSupplied", { topics: [hashId("unknown_topic", "one")] })),
    /unknown_or_malformed_pool_event/
  );
  assert.throws(() => adapter.normalizeLog(log("AssetsSupplied", { data: "0x01" })), /unknown_or_malformed_pool_event/);
  assert.throws(
    () => adapter.normalizeLog({ ...log(), providerUrl: "https://not-admitted.invalid" }),
    /pool_log_not_closed/
  );
  assert.throws(() => adapter.normalizeLog(log("AssetsSupplied", { confirmations: 0 })), /pool_log_not_included/);
});

test("only non-final observations can receive an additive block-replacement invalidation", () => {
  const included = adapter.normalizeLog(log());
  const invalidated = adapter.createInvalidation(included, {
    canonicalBlockHash: hashId("m2a005_block", "replacement"),
    observedAt: "2026-08-22T08:01:00.000Z"
  });
  assert.equal(invalidated.eventKey, included.eventKey);
  assert.equal(invalidated.observationStatus, "invalidated");
  assert.equal(invalidated.priorObservationHash, included.observationHash);
  assert.notEqual(invalidated.observationHash, included.observationHash);
  const finalized = adapter.normalizeLog(log("AssetsSupplied", { confirmations: 4 }));
  assert.throws(
    () => adapter.createInvalidation(finalized, {
      canonicalBlockHash: hashId("m2a005_block", "late-replacement"),
      observedAt: "2026-08-22T08:01:00.000Z"
    }),
    /finalized_pool_event_cannot_reorg/
  );
});
