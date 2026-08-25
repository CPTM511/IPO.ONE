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
  assert.equal(presentation.workspaceState, "Synthetic state loaded");
  assert.equal(
    presentation.market,
    "USDC / WETH · Base Sepolia test Pool deployed · local synthetic projection"
  );
  assert.equal(
    presentation.submission,
    "Unavailable in this local synthetic view · no chain transaction will be submitted"
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
  assert.match(presentation.market, /Base Sepolia test Pool deployed/);
  assert.match(presentation.market, /local indexer state unavailable/);
  assert.equal(presentation.workspaceState, "Awaiting indexed state");
});
