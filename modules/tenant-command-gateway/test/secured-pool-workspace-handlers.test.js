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
    throw new Error("must not query bindings without one indexed Pool market");
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
  assert.equal(response.accountBindingAvailable, false);
  assert.equal(response.submission.state, "unavailable");
  assert.equal(response.submission.transactionHash, null);
  assert.equal(response.productionFundsMoved, false);
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
  assert.equal(response.blockerReasonCodes.includes("pool_deployment_unavailable"), true);
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
  assert.equal(response.positionCount, 0);
  assert.equal(response.controls.freezeNewRisk, true);
  assert.equal(response.controls.liquidationSubmissionAvailable, false);
  assert.equal(JSON.stringify(response).includes("0x1111111111111111111111111111111111111111"), false);
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
