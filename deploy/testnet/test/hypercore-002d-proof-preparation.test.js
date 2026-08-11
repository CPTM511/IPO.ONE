import assert from "node:assert/strict";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  createHypercoreStableExecutionIntent,
  createHypercoreStablePolicyConstraint
} from "../../../modules/hypercore-venue-adapter/src/index.js";
import {
  collectHypercore002dCancelReadiness,
  selectExactTenUsdBtcAlo
} from "../prepare-hypercore-002d-proof.mjs";

function h(scope) {
  return hashId("hypercore_002d_cancel_readiness_test", { scope });
}

function submittedParent() {
  const preparedAt = new Date("2026-08-10T13:00:00.000Z");
  const policy = createHypercoreStablePolicyConstraint({
    policyId: "hypercore_testnet_btc_proof_002d_stable",
    policyVersion: "adr_039.v2",
    facilityHash: h("facility"),
    accountBindingHash: h("binding"),
    delegateHash: h("delegate"),
    signerReferenceHash: h("signer"),
    executionOwnerActorId: "actor_hypercore_execution_owner",
    riskOwnerActorId: "actor_hypercore_risk_owner",
    incidentOwnerActorId: "actor_ipo_one_founder"
  });
  const prepared = createHypercoreStableExecutionIntent({
    facilityId: "trading_facility_002d_cancel_readiness",
    facilityHash: h("facility"),
    accountBindingId: "hypercore_account_binding_002d_cancel_readiness",
    accountBindingHash: h("binding"),
    canonicalAccountAddressHash: h("account"),
    handoffId: "hypercore_handoff_002d_cancel_readiness",
    handoffHash: h("handoff"),
    delegateId: "hypercore_delegate_002d_cancel_readiness",
    delegateHash: h("delegate"),
    apiWalletAddressHash: h("api_wallet"),
    signerReferenceHash: h("signer"),
    policyConstraint: policy,
    hyperliquidAction: {
      type: "order",
      orders: [{
        a: 3,
        b: true,
        p: "62500",
        s: "0.00016",
        r: false,
        t: { limit: { tif: "Alo" } },
        c: "0x3ec931145cbe6e36213621b50521a704"
      }],
      grouping: "na"
    },
    idempotencyKey: "hypercore-002d-cancel-readiness",
    nonce: preparedAt.getTime(),
    preparedAt,
    approvalExpiresAt: new Date(preparedAt.getTime() + 30 * 60_000)
  });
  return Object.freeze({
    ...structuredClone(prepared),
    state: "SUBMITTED",
    version: 5,
    founderApprovalId: "hypercore_approval_002d_cancel_readiness",
    founderApprovalHash: h("approval"),
    humanConfirmationHash: h("confirmation"),
    preflightReceiptId: "hypercore_preflight_002d_cancel_readiness",
    preflightReceiptHash: h("preflight"),
    riskSnapshotHash: h("risk"),
    metadataHash: h("metadata"),
    signingRequestHash: h("signing"),
    actionAuthorizationHash: h("authorization"),
    requestBodyHash: h("request"),
    signatureHash: h("signature"),
    claimHash: h("claim"),
    disposition: "confirmed",
    responseHash: h("response"),
    approvedAt: "2026-08-10T13:00:01.000Z",
    signingStartedAt: "2026-08-10T13:00:02.000Z",
    claimedAt: "2026-08-10T13:00:03.000Z",
    resolvedAt: "2026-08-10T13:00:04.000Z",
    externalSubmissionAttempted: true
  });
}

function jsonResponse(value) {
  return {
    ok: true,
    async text() { return JSON.stringify(value); }
  };
}

function cancelFetch({ extraOrder = false } = {}) {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.type === "userRole") {
      return jsonResponse({ role: body.user === "0xapi" ? "agent" : "user" });
    }
    if (body.type === "clearinghouseState") {
      return jsonResponse({
        marginSummary: { accountValue: "999.0" },
        withdrawable: "998.5",
        assetPositions: []
      });
    }
    const order = {
      coin: "BTC",
      side: "B",
      limitPx: "62500.0",
      sz: "0.00016",
      oid: 57670774189,
      cloid: "0x3ec931145cbe6e36213621b50521a704"
    };
    if (body.type === "openOrders") {
      return jsonResponse(extraOrder ? [order, { ...order, oid: 57670774190 }] : [order]);
    }
    if (body.type === "orderStatus") {
      return jsonResponse({ status: "order", order: { order: { ...order, reduceOnly: false } } });
    }
    if (body.type === "meta") {
      const universe = Array.from({ length: 4 }, () => ({}));
      universe[3] = { name: "BTC", szDecimals: 5 };
      return jsonResponse({ universe });
    }
    throw new Error(`unexpected request ${body.type}`);
  };
}

function notional(action) {
  return Number(action.limitPx) * Number(action.size);
}

test("002D selects an exact-$10 ALO outside the live spread", () => {
  const action = selectExactTenUsdBtcAlo({
    mid: "118000",
    bestBid: "117999",
    bestAsk: "118001"
  });
  assert.equal(action.side, "sell");
  assert.equal(action.limitPx, "125000");
  assert.equal(action.size, "0.00008");
  assert.equal(action.timeInForce, "Alo");
  assert.equal(action.expectedFillNotionalUsd, "0");
  assert.equal(notional(action), 10);
});

test("002D selects the safe side from current book state", () => {
  const action = selectExactTenUsdBtcAlo({
    mid: "130000",
    bestBid: "129999",
    bestAsk: "130001"
  });
  assert.equal(action.side, "buy");
  assert.equal(Number(action.limitPx) < 129999, true);
  assert.equal(notional(action), 10);
});

test("002D tolerates non-atomic allMids drift outside a valid book", () => {
  const action = selectExactTenUsdBtcAlo({
    mid: "130010",
    bestBid: "129999",
    bestAsk: "130001"
  });
  assert.equal(action.side, "buy");
  assert.equal(Number(action.limitPx) < 129999, true);
  assert.equal(notional(action), 10);
});

test("002D fails closed on a crossed or malformed book", () => {
  assert.throws(
    () => selectExactTenUsdBtcAlo({
      mid: "118000",
      bestBid: "118100",
      bestAsk: "118050"
    }),
    /crossed or inconsistent/
  );
});

test("002D cancel readiness independently binds the exact resting parent order", async () => {
  const parentIntent = submittedParent();
  const readiness = await collectHypercore002dCancelReadiness({
    fetchImpl: cancelFetch(),
    masterAddress: "0xmaster",
    apiWalletAddress: "0xapi",
    parentIntent,
    now: new Date("2026-08-10T13:01:00.000Z")
  });
  assert.equal(readiness.targetOrder.parentIntentHash, parentIntent.intentHash);
  assert.equal(readiness.targetOrder.venueOrderId, 57670774189);
  assert.equal(readiness.jitObservation.openOrderCount, 1);
  assert.equal(readiness.jitObservation.positionCount, 0);
  const jsonbOrderedTarget = Object.fromEntries(
    Object.entries(readiness.targetOrder).sort(([left], [right]) => left.localeCompare(right))
  );
  const revalidated = await collectHypercore002dCancelReadiness({
    fetchImpl: cancelFetch(),
    masterAddress: "0xmaster",
    apiWalletAddress: "0xapi",
    parentIntent,
    expectedTarget: jsonbOrderedTarget,
    now: new Date("2026-08-10T13:01:01.000Z")
  });
  assert.equal(revalidated.targetOrder.targetOrderHash, readiness.targetOrder.targetOrderHash);
});

test("002D cancel readiness denies additional open orders", async () => {
  await assert.rejects(() => collectHypercore002dCancelReadiness({
    fetchImpl: cancelFetch({ extraOrder: true }),
    masterAddress: "0xmaster",
    apiWalletAddress: "0xapi",
    parentIntent: submittedParent(),
    now: new Date("2026-08-10T13:01:00.000Z")
  }), /requires zero positions and one open order/);
});
