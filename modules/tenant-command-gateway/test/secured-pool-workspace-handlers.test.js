import assert from "node:assert/strict";
import test from "node:test";
import {
  readOwnSecuredPoolQueryHandler,
  readSecuredPoolRiskQueryHandler,
  reviewSecuredPoolActionQueryHandler
} from "../src/secured-pool-workspace-handlers.js";

const now = new Date("2026-08-23T00:00:00.000Z");
const emptyPoolClient = {
  async query(sql) {
    assert.match(sql, /pool_chain_finalized_effects/);
    return { rows: [], rowCount: 0 };
  }
};
const coreRepository = {
  async listExecutionAccountBindingsForSubjectInTransaction() {
    return [];
  }
};

test("own Secured Pool workspace is server-derived and truthfully unavailable before deployment", async () => {
  const response = await readOwnSecuredPoolQueryHandler().execute({
    client: emptyPoolClient,
    coreRepository,
    resource: { resourceType: "subject", resourceId: "subject_pool_fixture" },
    payload: {},
    now
  });
  assert.equal(response.market.status, "not_indexed");
  assert.equal(response.market.deployment.state, "unavailable");
  assert.equal(response.market.rpc.state, "unavailable");
  assert.equal(response.market.indexer.state, "unavailable");
  assert.equal(response.accountBindingAvailable, false);
  assert.equal(response.submission.state, "unavailable");
  assert.equal(response.submission.transactionHash, null);
  assert.equal(response.productionFundsMoved, false);
});

test("own Secured Pool workspace identifies the deployed test Pool without inventing indexer state", async () => {
  const response = await readOwnSecuredPoolQueryHandler({
    deploymentProfile: {
      chainId: "eip155:84532",
      poolContract: "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da",
      deploymentApprovalRef: "M2A-008-DEPLOY-20260824-004",
      realValueClassification: "test_assets_only"
    }
  }).execute({
    client: emptyPoolClient,
    coreRepository,
    resource: { resourceType: "subject", resourceId: "subject_pool_fixture" },
    payload: {},
    now
  });
  assert.equal(response.market.status, "deployed_not_indexed");
  assert.equal(response.market.deployment.state, "configured");
  assert.equal(response.market.rpc.state, "unavailable");
  assert.equal(response.market.indexer.state, "unavailable");
  assert.equal(response.market.contractAddress, "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da");
  assert.equal(response.market.accounting, null);
  assert.equal(response.market.readOnly, true);
  assert.equal(response.submission.reasonCode, "pool_submission_unavailable");
});

test("exact Pool action review fails closed before any submission path", async () => {
  const response = await reviewSecuredPoolActionQueryHandler().execute({
    client: emptyPoolClient,
    coreRepository,
    resource: { resourceType: "subject", resourceId: "subject_pool_fixture" },
    payload: { actionType: "borrow", amountAssets: "1000000" },
    now
  });
  assert.equal(response.reviewState, "blocked_before_submission");
  assert.equal(response.submittable, false);
  assert.equal(response.transactionState, "not_submitted");
  assert.equal(response.blockerReasonCodes.includes("pool_account_binding_unavailable"), true);
  assert.equal(response.blockerReasonCodes.includes("pool_submission_unavailable"), true);
  assert.match(response.reviewHash, /^0x[0-9a-f]{64}$/);
});

test("Risk/Ops Pool view is aggregate, read-only, and contains no account address", async () => {
  const response = await readSecuredPoolRiskQueryHandler().execute({
    client: emptyPoolClient,
    authorizationDecision: {
      resourceType: "risk_portfolio",
      resourceId: "risk_portfolio_fixture"
    },
    payload: {},
    now
  });
  assert.equal(response.positionCount, null);
  assert.equal(response.liquidatablePositionCount, null);
  assert.equal(response.discrepancyCount, null);
  assert.equal(response.controls.freezeNewRisk, true);
  assert.equal(response.controls.liquidationSubmissionAvailable, false);
  assert.equal(JSON.stringify(response).includes("0x1111111111111111111111111111111111111111"), false);
});

test("authorized AccountBinding receives exact live position while public and private axes stay separate", async () => {
  const boundRepository = {
    async listExecutionAccountBindingsForSubjectInTransaction(_client, subjectId) {
      assert.equal(subjectId, "subject_pool_fixture");
      return [{
        status: "active",
        chainId: "eip155:84532",
        accountIdRef: "eip155:84532:0x9999999999999999999999999999999999999999"
      }];
    }
  };
  const readAdapter = {
    async readSnapshot({ account }) {
      assert.equal(account, "0x9999999999999999999999999999999999999999");
      return {
        deployment: {
          state: "verified",
          chainId: "eip155:84532",
          contractAddress: "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da",
          bytecodeHash: `0x${"1".repeat(64)}`,
          configurationHash: `0x${"2".repeat(64)}`,
          deploymentApprovalRef: "M2A-008-DEPLOY-20260824-004",
          testAssetsOnly: true
        },
        rpc: {
          state: "available",
          providerSlot: "primary",
          blockNumber: "46000000",
          blockTimestamp: "2026-08-26T23:59:00.000Z",
          observedAt: "2026-08-27T00:00:00.000Z"
        },
        state: {
          chainId: "eip155:84532",
          contractAddress: "0x3fb68c0776d610a57ed94c012afa81b7c3c632da",
          marketId: `0x${"3".repeat(64)}`,
          configuration: {
            debtAsset: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
            collateralAsset: "0x4200000000000000000000000000000000000006",
            liquidationThresholdBps: "8000"
          },
          cashAssets: "0",
          grossDebtAssets: "0",
          reservesAssets: "0",
          badDebtAssets: "0",
          totalSupplyShares: "0",
          totalDebtShares: "0",
          acceptedPriceUsdWad: "2500000000000000000000",
          acceptedOracleObservedAt: "1787788770",
          acceptedOracleRoundId: "1",
          oracleDeviationHalted: false,
          newRiskPaused: false
        },
        position: {
          supplyShares: "0",
          collateralAssets: "0",
          debtShares: "0",
          debtAssets: "0",
          badDebtAssets: "0",
          supplyClaimAssets: "0",
          totalOutstandingDebtAssets: "0"
        }
      };
    }
  };
  const response = await readOwnSecuredPoolQueryHandler({
    deploymentProfile: {
      chainId: "eip155:84532",
      poolContract: "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da",
      deploymentApprovalRef: "M2A-008-DEPLOY-20260824-004",
      realValueClassification: "test_assets_only"
    },
    readAdapter
  }).execute({
    client: emptyPoolClient,
    coreRepository: boundRepository,
    resource: { resourceType: "subject", resourceId: "subject_pool_fixture" },
    payload: {},
    now
  });
  assert.equal(response.market.status, "live_testnet_read_only");
  assert.equal(response.market.deployment.state, "verified");
  assert.equal(response.market.rpc.state, "available");
  assert.equal(response.market.indexer.state, "unavailable");
  assert.equal(response.market.reconciliation.state, "unavailable");
  assert.equal(response.accountBindingAvailable, true);
  assert.equal(response.position.supplyShares, "0");
  assert.equal(response.position.source, "base_sepolia_safe_block");
  assert.equal(response.submission.state, "unavailable");
  assert.equal(JSON.stringify(response).includes("0x9999999999999999999999999999999999999999"), false);
});

test("Pool action review rejects hidden submission fields", async () => {
  await assert.rejects(
    () => reviewSecuredPoolActionQueryHandler().execute({
      client: emptyPoolClient,
      coreRepository,
      resource: { resourceType: "subject", resourceId: "subject_pool_fixture" },
      payload: { actionType: "borrow", amountAssets: "1000000", submit: true },
      now
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});
