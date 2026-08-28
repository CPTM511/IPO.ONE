import assert from "node:assert/strict";
import test from "node:test";
import { createSecuredPoolPresentation } from "../src/secured-pool-presentation.js";

test("Secured Pool presentation distinguishes indexed state from deployment authority", () => {
  const presentation = createSecuredPoolPresentation({
    workspace: {
      market: {
        status: "local_synthetic_indexed",
        debtAsset: "USDC",
        collateralAsset: "WETH",
        accounting: { cashAssets: "9000000" }
      },
      position: null,
      submission: { state: "unavailable" }
    }
  });
  assert.equal(presentation.workspaceState, "Local projection loaded");
  assert.equal(
    presentation.market,
    "test USDC / WETH · Unavailable"
  );
  assert.equal(
    presentation.submission,
    "Unavailable · no chain transaction will be submitted"
  );
});

test("Secured Pool review keeps blockers and exact amount visible", () => {
  const presentation = createSecuredPoolPresentation({
    review: {
      actionType: "borrow",
      amountAssets: "1000000",
      reviewState: "blocked_before_submission",
      blockerReasonCodes: ["pool_oracle_stale", "pool_submission_unavailable"]
    }
  });
  assert.equal(presentation.reviewAction, "Borrow");
  assert.equal(presentation.reviewAmount, "1000000");
  assert.match(presentation.reviewBlockers, /pool_submission_unavailable/);
});

test("Secured Pool presentation shows a deployed test Pool without inventing indexed state", () => {
  const presentation = createSecuredPoolPresentation({
    workspace: {
      market: {
        status: "deployed_not_indexed",
        contractAddress: "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da",
        accounting: null
      },
      position: null,
      submission: { state: "unavailable" }
    }
  });
  assert.match(presentation.market, /0x3FB68c/);
  assert.match(presentation.market, /exact deployment known/);
  assert.equal(presentation.workspaceState, "Deployment known · state unavailable");
});

test("Secured Pool presentation keeps authoritative zero distinct from unavailable", () => {
  const current = createSecuredPoolPresentation({
    workspace: {
      market: {
        status: "live_testnet_read_only",
        contractAddress: "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da",
        accounting: {
          cashAssets: "0",
          grossDebtAssets: "0",
          utilizationBps: "0",
          lpClaimAssets: "0"
        },
        deployment: { state: "verified", chainId: "eip155:84532" },
        rpc: { state: "available", providerSlot: "primary", blockNumber: "46000000" },
        indexer: { state: "unavailable", reasonCode: "pool_indexer_state_unavailable" },
        reconciliation: { state: "unavailable", reasonCode: "reconciliation_unavailable" }
      },
      accountBindingAvailable: false,
      position: null,
      submission: { state: "unavailable" }
    }
  });
  assert.equal(current.liquidity, "0");
  assert.equal(current.grossDebt, "0");
  assert.equal(current.utilization, "0 bps");
  assert.equal(current.position, "Unavailable");
  assert.equal(current.deploymentState, "Exact deployment verified");
  assert.equal(current.rpcState, "Connected");
  assert.equal(current.indexerState, "Unavailable");
});

test("Secured Pool public market remains visible without a private workspace", () => {
  const presentation = createSecuredPoolPresentation({
    marketSnapshot: {
      market: {
        status: "live_testnet_read_only",
        contractAddress: "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da",
        accounting: {
          cashAssets: "0",
          grossDebtAssets: "0",
          utilizationBps: "0",
          lpClaimAssets: "0"
        },
        deployment: { state: "verified", chainId: "eip155:84532" },
        rpc: { state: "available", providerSlot: "primary", blockNumber: "46000001" },
        indexer: { state: "unavailable", reasonCode: "pool_indexer_state_unavailable" },
        reconciliation: { state: "unavailable", reasonCode: "reconciliation_unavailable" }
      },
      submission: { state: "unavailable" }
    }
  });
  assert.equal(presentation.workspaceState, "Live read-only state");
  assert.equal(presentation.deploymentState, "Exact deployment verified");
  assert.equal(presentation.positionState, "No authorized AccountBinding");
  assert.equal(
    presentation.submission,
    "Unavailable · no chain transaction will be submitted"
  );
});
