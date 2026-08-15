import assert from "node:assert/strict";
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
  selectBoundedBtcIocAction
} from "../agent-credit-hyperliquid-l3-live.mjs";

const CANDIDATE = "ffbcae38fedcb6dbcc4b2da538a2636df0836fde";
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

test("L3 opening action is one bounded BTC IOC below 10 USD", () => {
  const action = selectBoundedBtcIocAction({
    bestBid: "118900",
    bestAsk: "119000",
    side: "buy"
  });
  assert.equal(action.assetIndex, 3);
  assert.equal(action.side, "buy");
  assert.equal(action.reduceOnly, false);
  assert.equal(action.timeInForce, "Ioc");
  assert.ok(Number(action.limitPx) * Number(action.size) <= 10);
  assert.ok(Number(action.limitPx) > 119000);
});

test("L3 closing action is reduce-only and cannot expand the observed size", () => {
  const action = selectBoundedBtcIocAction({
    bestBid: "118900",
    bestAsk: "119000",
    side: "sell",
    closeSize: "0.00008"
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
  assert.equal(loss.availableMinor, "996");
  assert.equal(loss.repaymentMinor, "996");
  assert.equal(loss.outstandingMinor, "4");
  assert.equal(loss.residualMinor, "0");

  const gain = calculateAgentCreditL3Settlement([
    { feeUsd: "0.01", closedPnlUsd: "0.11" }
  ]);
  assert.equal(gain.repaymentMinor, "1000");
  assert.equal(gain.outstandingMinor, "0");
  assert.equal(gain.residualMinor, "10");
});

test("L3 preparation and dry-run bind candidate, runtime, signer and zero-risk baseline", async () => {
  const runId = `agent-credit-exec-001-l3-live-test-${process.pid}-${Date.now()}`;
  const keyPath = `/private/tmp/ipo-one-agent-credit-exec-001/${runId}.key`;
  const preparationFile = `/private/tmp/ipo-one-agent-credit-exec-001/${runId}.json`;
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
      now: new Date("2026-08-15T08:00:00.000Z"),
      env
    });
    assert.equal(prepared.candidateCommit, CANDIDATE);
    assert.equal(prepared.runId, runId);
    assert.equal(prepared.baseline.positionsCount, 0);
    assert.equal(prepared.baseline.openOrdersCount, 0);
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
