import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { unlink } from "node:fs/promises";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  destroyHypercoreIsolatedTestnetSigner,
  inspectHypercoreIsolatedTestnetSigner,
  provisionAgentCreditHyperliquidTestnetSigner,
  withHypercoreIsolatedTestnetSigner
} from "../hypercore-isolated-signer.mjs";
import {
  calculateAgentCreditL3Settlement,
  dryRunAgentCreditHyperliquidL3,
  prepareAgentCreditHyperliquidL3,
  revalidateBoundedBtcOpeningAction,
  selectBoundedBtcIocAction
} from "../agent-credit-hyperliquid-l3-live.mjs";

const CANDIDATE = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: process.cwd(),
  encoding: "utf8"
}).trim();
const MASTER = privateKeyToAccount(
  "0x2222222222222222222222222222222222222222222222222222222222222222"
).address.toLowerCase();

function json(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function venueFixture(apiWallet, { registered = false } = {}) {
  return async (url, options) => {
    assert.equal(url, "https://api.hyperliquid-testnet.xyz/info");
    const request = JSON.parse(options.body);
    if (request.type === "userRole") {
      return json({ role: request.user === apiWallet ? (registered ? "agent" : "missing") : "user" });
    }
    if (request.type === "clearinghouseState") {
      return json({
        marginSummary: { accountValue: "100" },
        withdrawable: "100",
        assetPositions: []
      });
    }
    if (request.type === "openOrders" || request.type === "userFillsByTime") return json([]);
    if (request.type === "meta") {
      return json({ universe: [{}, {}, {}, { name: "BTC", szDecimals: 5, maxLeverage: 50 }] });
    }
    if (request.type === "allMids") return json({ BTC: "119000" });
    if (request.type === "l2Book") {
      return json({ levels: [[{ px: "118900" }], [{ px: "119000" }]] });
    }
    throw new Error(`unexpected query ${request.type}`);
  };
}

test("L3 selects the smallest precision-valid BTC quantity above the venue minimum", () => {
  const action = selectBoundedBtcIocAction({
    bestBid: "118900",
    bestAsk: "119000",
    side: "buy",
    sizeDecimals: 5,
    maximumNotionalUsd: "12"
  });
  assert.equal(action.assetIndex, 3);
  assert.equal(action.side, "buy");
  assert.equal(action.reduceOnly, false);
  assert.equal(action.timeInForce, "Ioc");
  assert.equal(action.size, "0.00009");
  assert.equal(action.maximumLimitNotionalUsd, "10.8171");
  assert.ok(Number(action.limitPx) * 0.00008 <= 10);
  assert.ok(Number(action.maximumLimitNotionalUsd) > 10);
  assert.ok(Number(action.maximumLimitNotionalUsd) <= 12);
});

test("L3 rejects a quantity below the venue minimum locally", () => {
  const action = selectBoundedBtcIocAction({
    bestBid: "118900",
    bestAsk: "119000",
    side: "buy",
    sizeDecimals: 5,
    maximumNotionalUsd: "12"
  });
  assert.throws(() => revalidateBoundedBtcOpeningAction({
    action: {
      ...action,
      size: "0.00008",
      maximumLimitNotionalUsd: "9.6152"
    },
    sizeDecimals: 5,
    maximumNotionalUsd: "12"
  }), { code: "agent_credit_l3_venue_minimum_denied" });
});

test("L3 opening quantity respects current BTC size precision", () => {
  const action = selectBoundedBtcIocAction({
    bestBid: "118900",
    bestAsk: "119000",
    side: "buy",
    sizeDecimals: 5,
    maximumNotionalUsd: "12"
  });
  assert.ok((action.size.split(".")[1] ?? "").length <= 5);
  assert.throws(() => revalidateBoundedBtcOpeningAction({
    action: {
      ...action,
      size: "0.000091",
      maximumLimitNotionalUsd: "10.93729"
    },
    sizeDecimals: 5,
    maximumNotionalUsd: "12"
  }), { code: "agent_credit_l3_size_precision_denied" });
});

test("L3 price movement always creates a newly prepared action inside 10-12 USD", () => {
  for (const [bestBid, bestAsk] of [
    ["118900", "119000"],
    ["124900", "125000"],
    ["79990", "80000"]
  ]) {
    const action = selectBoundedBtcIocAction({
      bestBid,
      bestAsk,
      side: "buy",
      sizeDecimals: 5,
      maximumNotionalUsd: "12"
    });
    assert.ok(Number(action.maximumLimitNotionalUsd) > 10);
    assert.ok(Number(action.maximumLimitNotionalUsd) <= 12);
  }
});

test("L3 execution-time revalidation rejects notional drift above 12 USD", () => {
  const action = selectBoundedBtcIocAction({
    bestBid: "118900",
    bestAsk: "119000",
    side: "buy",
    sizeDecimals: 5,
    maximumNotionalUsd: "12"
  });
  assert.throws(() => revalidateBoundedBtcOpeningAction({
    action: {
      ...action,
      size: "0.0001",
      maximumLimitNotionalUsd: "12.019"
    },
    sizeDecimals: 5,
    maximumNotionalUsd: "12"
  }), { code: "agent_credit_l3_notional_limit_denied" });
});

test("L3 closing action is reduce-only and cannot expand the observed size", () => {
  const action = selectBoundedBtcIocAction({
    bestBid: "118900",
    bestAsk: "119000",
    side: "sell",
    closeSize: "0.00008",
    sizeDecimals: 5,
    maximumNotionalUsd: "12"
  });
  assert.equal(action.side, "sell");
  assert.equal(action.size, "0.00008");
  assert.equal(action.reduceOnly, true);
  assert.equal(action.timeInForce, "Ioc");
  assert.ok(Number(action.limitPx) < 118900);
});

test("L3 settlement repays first and preserves a real loss as outstanding debt", () => {
  const loss = calculateAgentCreditL3Settlement([
    { feeUsd: "0.01", closedPnlUsd: "-0.03" }
  ]);
  assert.equal(loss.realizedPnlUsd, "-0.04000000");
  assert.equal(loss.availableMinor, "1196");
  assert.equal(loss.repaymentMinor, "1196");
  assert.equal(loss.outstandingMinor, "4");
  assert.equal(loss.residualMinor, "0");

  const gain = calculateAgentCreditL3Settlement([
    { feeUsd: "0.01", closedPnlUsd: "0.11" }
  ]);
  assert.equal(gain.repaymentMinor, "1200");
  assert.equal(gain.outstandingMinor, "0");
  assert.equal(gain.residualMinor, "10");
});

test("L3 preparation and dry-run bind candidate, runtime, signer and zero-risk baseline", async () => {
  const runId = `agent-credit-exec-001-l3-live-test-${process.pid}-${Date.now()}`;
  const keyPath = `/private/tmp/ipo-one-agent-credit-exec-001/${runId}.key`;
  const preparationFile = `/private/tmp/ipo-one-agent-credit-exec-001/${runId}.json`;
  const now = new Date();
  try {
    await provisionAgentCreditHyperliquidTestnetSigner({
      keyPath,
      runId,
      env: { IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: runId }
    });
    const descriptor = await inspectHypercoreIsolatedTestnetSigner(keyPath);
    const apiWallet = await withHypercoreIsolatedTestnetSigner(
      keyPath,
      ({ transientApiWalletAddress }) => transientApiWalletAddress
    );
    const env = {
      IPO_ONE_HYPERLIQUID_TESTNET_RUN_ID: runId,
      IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: runId,
      IPO_ONE_AGENT_CREDIT_CANDIDATE_COMMIT: CANDIDATE,
      IPO_ONE_EXECUTION_VENUE: "hyperliquid",
      IPO_ONE_EXECUTION_ENVIRONMENT: "testnet",
      IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN: "https://api.hyperliquid-testnet.xyz",
      IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS: MASTER,
      IPO_ONE_HYPERLIQUID_TESTNET_API_WALLET_ADDRESS: apiWallet,
      IPO_ONE_HYPERLIQUID_TESTNET_SIGNER_REFERENCE: descriptor.isolatedSignerReference,
      IPO_ONE_HYPERLIQUID_ACTION: "order"
    };
    const prepared = await prepareAgentCreditHyperliquidL3({
      cwd: process.cwd(),
      runId,
      candidateCommit: CANDIDATE,
      account: MASTER,
      signerKeyPath: keyPath,
      preparationFile,
      fetchImpl: venueFixture(apiWallet),
      now,
      env
    });
    assert.equal(prepared.candidateCommit, CANDIDATE);
    assert.equal(prepared.runId, runId);
    assert.equal(prepared.baseline.positionsCount, 0);
    assert.equal(prepared.baseline.openOrdersCount, 0);
    assert.equal(prepared.maximumNotionalUsd, "12");
    assert.equal(prepared.policyVersion, "agent_credit_hyperliquid_testnet.v2");
    assert.match(prepared.preparationHash, /^0x[0-9a-f]{64}$/);
    const dryRun = await dryRunAgentCreditHyperliquidL3({
      cwd: process.cwd(),
      preparationFile,
      signerKeyPath: keyPath,
      requireRegistered: false,
      fetchImpl: venueFixture(apiWallet),
      env
    });
    assert.equal(dryRun.status, "DRY_RUN_PASS");
    assert.equal(dryRun.checks.reconciliationBaseline, true);
    assert.equal(dryRun.exchangeWritePerformed, false);
  } finally {
    await unlink(preparationFile).catch(() => {});
    await destroyHypercoreIsolatedTestnetSigner(keyPath).catch(() => {});
  }
});
