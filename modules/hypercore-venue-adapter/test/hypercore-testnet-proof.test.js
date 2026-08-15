import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  HYPERCORE_TESTNET_PROOF_PROFILE,
  HypercoreExecutionActionKind,
  HypercoreTestnetExchangeTransport,
  IsolatedHypercoreTypedDataSigner,
  authorizeHypercoreTestnetAction,
  compileHypercoreExecutionAction,
  createHypercoreApproveAgentSigningRequest,
  createHypercoreL1SigningRequest,
  createHypercoreTestnetExchangeEnvelope,
  createHypercoreTestnetProofPolicy,
  verifyHypercoreTestnetProofPolicy
} from "../src/index.js";

const NOW = new Date("2026-08-08T10:00:00.000Z");
const ACCOUNT = privateKeyToAccount(
  "0x0123456789012345678901234567890123456789012345678901234567890123"
);
const VAULT = "0x1719884eb866cb12b2287399b15f7db5e7d775ea";

function h(scope) {
  return hashId("hypercore_002c_proof_test", { scope });
}

function policy(overrides = {}) {
  return createHypercoreTestnetProofPolicy({
    policyId: "hypercore_testnet_btc_proof_002c",
    accountBindingHash: h("binding"),
    delegateHash: h("delegate"),
    signerReferenceHash: h("signer"),
    metadataHash: h("metadata"),
    assetIndex: 3,
    sizeDecimals: 5,
    priceDecimals: 1,
    metadataObservedAt: "2026-08-08T09:59:30.000Z",
    executionOwnerActorId: "actor_hypercore_execution_owner",
    riskOwnerActorId: "actor_hypercore_risk_owner",
    incidentOwnerActorId: "actor_ipo_one_founder",
    approvedAt: "2026-08-08T09:59:40.000Z",
    expiresAt: "2026-08-08T11:00:00.000Z",
    ...overrides
  });
}

function risk(overrides = {}) {
  const core = {
    accountBindingHash: h("binding"),
    metadataHash: h("metadata"),
    metadataObservedAt: "2026-08-08T09:59:30.000Z",
    observedAt: "2026-08-08T09:59:59.000Z",
    status: "FRESH",
    openOrdersCount: 0,
    aggregateExposureUsd: "0",
    positionNotionalUsd: "0",
    unknownOutcomeCount: 0,
    reconciliationStatus: "RECONCILED",
    paused: false,
    ...overrides
  };
  return {
    riskSnapshotHash: hashId("hypercore_testnet_risk_snapshot", core),
    ...core
  };
}

function prepared(riskSnapshot, overrides = {}) {
  const actionKind =
    overrides.actionKind ?? HypercoreExecutionActionKind.ORDER;
  const action = actionKind === HypercoreExecutionActionKind.SCHEDULE_CANCEL
    ? { ...(overrides.action ?? {}) }
    : {
        assetIndex: 3,
        side: "buy",
        limitPx: "50000",
        size: "0.0002",
        reduceOnly: false,
        timeInForce: "Alo",
        cloid: "0x00000000000000000000000000000001",
        ...(overrides.action ?? {})
      };
  return compileHypercoreExecutionAction({
    actionKind,
    action,
    sourceActionHash: h("source"),
    policyDecisionHash: h("upstream_policy"),
    riskSnapshotHash: riskSnapshot.riskSnapshotHash,
    accountBindingHash: overrides.accountBindingHash ?? h("binding"),
    delegateHash: overrides.delegateHash ?? h("delegate")
  });
}

function proofState(overrides = {}) {
  return {
    proofId: "hypercore_testnet_proof_run_002c",
    startedAt: "2026-08-08T09:59:50.000Z",
    submissionCount: 0,
    openOrderCount: 0,
    aggregateExposureUsd: "0",
    ...overrides
  };
}

function confirmation(preparedAction, proofPolicy, overrides = {}) {
  const core = {
    actorId: "actor_ipo_one_founder",
    preparedActionHash: preparedAction.preparedActionHash,
    policyHash: proofPolicy.policyHash,
    accountBindingHash: proofPolicy.accountBindingHash,
    delegateHash: proofPolicy.delegateHash,
    approvedAt: "2026-08-08T09:59:58.000Z",
    expiresAt: "2026-08-08T10:01:00.000Z",
    oneUse: true,
    consumed: false,
    ...overrides
  };
  return {
    confirmationHash: hashId("hypercore_testnet_human_confirmation", core),
    ...core
  };
}

function authorize({
  proofPolicy = policy(),
  riskSnapshot = risk(),
  preparedAction,
  state = proofState(),
  human
} = {}) {
  const action = preparedAction ?? prepared(riskSnapshot);
  return {
    proofPolicy,
    riskSnapshot,
    preparedAction: action,
    state,
    human: human ?? confirmation(action, proofPolicy),
    authorization: authorizeHypercoreTestnetAction({
      policy: proofPolicy,
      preparedAction: action,
      riskSnapshot,
      proofState: state,
      humanConfirmation: human ?? confirmation(action, proofPolicy),
      now: NOW
    })
  };
}

async function signedEnvelope(context = authorize()) {
  const signingRequest = createHypercoreL1SigningRequest({
    preparedAction: context.preparedAction,
    signerReferenceHash: context.proofPolicy.signerReferenceHash,
    canonicalAccountAddressHash: h("canonical_account"),
    vaultAddress: VAULT,
    nonce: NOW.getTime(),
    expiresAfter: NOW.getTime() + 30_000
  });
  const signer = new IsolatedHypercoreTypedDataSigner({
    signerId: "isolated_hypercore_002c_test_signer",
    expectedSignerAddress: ACCOUNT.address.toLowerCase(),
    signTypedData: (typedData) => ACCOUNT.signTypedData(typedData)
  });
  const signed = await signer.sign(signingRequest);
  return {
    ...context,
    signingRequest,
    signed,
    envelope: createHypercoreTestnetExchangeEnvelope({
      authorization: context.authorization,
      signingRequest,
      signed,
      vaultAddress: VAULT,
      now: NOW
    })
  };
}

test("proof policy fixes Testnet origin, BTC candidate and exact hard caps", () => {
  const value = policy();
  assert.equal(verifyHypercoreTestnetProofPolicy(value), true);
  assert.equal(value.environment, "hyperliquid_testnet");
  assert.equal(value.origin, "https://api.hyperliquid-testnet.xyz");
  assert.equal(value.market, "BTC");
  assert.equal(value.maxOrderNotionalUsd, "10");
  assert.equal(value.maxOpenOrders, 1);
  assert.equal(value.maxSubmissions, 3);
  assert.equal(value.openingTimeInForce, "Alo");
  assert.equal(value.withdrawalAuthority, false);
  assert.equal(value.realFundsAuthority, false);
  assert.deepEqual(HYPERCORE_TESTNET_PROOF_PROFILE.allowedActionKinds, [
    "order",
    "reduceOnlyOrder",
    "cancel",
    "cancelByCloid",
    "modify",
    "scheduleCancel"
  ]);
});

test("fresh exact ALO order receives one short-lived single-use authorization", () => {
  const context = authorize();
  assert.equal(context.authorization.decision, "ALLOW");
  assert.equal(context.authorization.submissionOrdinal, 1);
  assert.equal(context.authorization.singleUse, true);
  assert.equal(context.authorization.externalTestnetSubmissionAllowed, true);
  assert.equal(context.authorization.effectiveUntil, "2026-08-08T10:00:30.000Z");
  assert.equal(context.authorization.realFundsAuthority, false);
});

test("scheduleCancel is bounded to five seconds through the proof window", () => {
  const freshRisk = risk();
  const approved = prepared(freshRisk, {
    actionKind: HypercoreExecutionActionKind.SCHEDULE_CANCEL,
    action: { time: NOW.getTime() + 5_000 }
  });
  assert.equal(authorize({ riskSnapshot: freshRisk, preparedAction: approved })
    .authorization.decision, "ALLOW");

  for (const time of [
    NOW.getTime() + 4_999,
    NOW.getTime() + HYPERCORE_TESTNET_PROOF_PROFILE.proofWindowMs + 1
  ]) {
    const action = prepared(freshRisk, {
      actionKind: HypercoreExecutionActionKind.SCHEDULE_CANCEL,
      action: { time }
    });
    assert.throws(
      () => authorize({ riskSnapshot: freshRisk, preparedAction: action }),
      { code: "hypercore_testnet_schedule_cancel_denied" }
    );
  }
});

test("malicious or excessive opening orders fail before signing", () => {
  const proofPolicy = policy();
  const freshRisk = risk();
  for (const action of [
    { timeInForce: "Gtc" },
    { size: "0.00021" },
    { assetIndex: 2 }
  ]) {
    const preparedAction = prepared(freshRisk, { action });
    assert.throws(
      () => authorizeHypercoreTestnetAction({
        policy: proofPolicy,
        preparedAction,
        riskSnapshot: freshRisk,
        proofState: proofState(),
        humanConfirmation: confirmation(preparedAction, proofPolicy),
        now: NOW
      }),
      (error) => [
        "hypercore_testnet_opening_order_denied",
        "hypercore_testnet_risk_limit_denied"
      ].includes(error.code)
    );
  }
});

test("stale metadata, UNKNOWN, pause, exhausted count and confirmation drift deny", () => {
  const proofPolicy = policy();
  const cases = [
    risk({ metadataObservedAt: "2026-08-08T09:54:59.000Z" }),
    risk({ unknownOutcomeCount: 1 }),
    risk({ paused: true })
  ];
  for (const riskSnapshot of cases) {
    const preparedAction = prepared(riskSnapshot);
    assert.throws(() => authorizeHypercoreTestnetAction({
      policy: proofPolicy,
      preparedAction,
      riskSnapshot,
      proofState: proofState(),
      humanConfirmation: confirmation(preparedAction, proofPolicy),
      now: NOW
    }));
  }
  const freshRisk = risk();
  const action = prepared(freshRisk);
  assert.throws(() => authorizeHypercoreTestnetAction({
    policy: proofPolicy,
    preparedAction: action,
    riskSnapshot: freshRisk,
    proofState: proofState({ submissionCount: 3 }),
    humanConfirmation: confirmation(action, proofPolicy),
    now: NOW
  }), { code: "hypercore_testnet_preflight_denied" });
  const drifted = confirmation(action, proofPolicy);
  drifted.confirmationHash = h("forged_confirmation");
  assert.throws(() => authorizeHypercoreTestnetAction({
    policy: proofPolicy,
    preparedAction: action,
    riskSnapshot: freshRisk,
    proofState: proofState(),
    humanConfirmation: drifted,
    now: NOW
  }), { code: "invalid_hypercore_testnet_human_confirmation" });
});

test("Exchange transport sends one exact body and persists only response hashes", async () => {
  const context = await signedEnvelope();
  const calls = [];
  const transport = new HypercoreTestnetExchangeTransport({
    clock: () => NOW,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        status: 200,
        headers: { get: () => "88" },
        async text() {
          return JSON.stringify({
            status: "ok",
            response: { type: "order", data: { statuses: [{ resting: { oid: 7 } }] } }
          });
        }
      };
    }
  });
  const result = await transport.submit(context.envelope);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.hyperliquid-testnet.xyz/exchange");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.redirect, "error");
  assert.deepEqual(JSON.parse(calls[0].options.body), context.envelope.body);
  assert.equal(result.disposition, "confirmed");
  assert.equal(result.unexpectedFillObserved, false);
  assert.equal(result.reconciliationRequired, true);
  assert.equal(result.retryAllowed, false);
  assert.equal(result.rawResponsePersisted, false);
  assert.equal(Object.hasOwn(result, "response"), false);
  await assert.rejects(() => transport.submit(context.envelope), {
    code: "hypercore_testnet_submission_denied"
  });
});

test("scheduleCancel uses the same isolated exact-body transport", async () => {
  const freshRisk = risk();
  const action = prepared(freshRisk, {
    actionKind: HypercoreExecutionActionKind.SCHEDULE_CANCEL,
    action: { time: NOW.getTime() + 10_000 }
  });
  const context = await signedEnvelope(authorize({
    riskSnapshot: freshRisk,
    preparedAction: action
  }));
  let calls = 0;
  const transport = new HypercoreTestnetExchangeTransport({
    clock: () => NOW,
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(JSON.parse(options.body).action.type, "scheduleCancel");
      return {
        status: 200,
        headers: { get: () => null },
        async text() {
          return JSON.stringify({ status: "ok", response: { type: "default" } });
        }
      };
    }
  });
  const result = await transport.submit(context.envelope);
  assert.equal(calls, 1);
  assert.equal(result.disposition, "confirmed");
  assert.equal(result.unexpectedFillObserved, false);
  assert.equal(result.rawResponsePersisted, false);
});

test("a filled ALO response is explicit and forces reconciliation", async () => {
  const context = await signedEnvelope();
  const transport = new HypercoreTestnetExchangeTransport({
    clock: () => NOW,
    fetchImpl: async () => ({
      status: 200,
      headers: { get: () => null },
      async text() {
        return JSON.stringify({
          status: "ok",
          response: {
            type: "order",
            data: { statuses: [{ filled: { totalSz: "0.0002", avgPx: "50000", oid: 8 } }] }
          }
        });
      }
    })
  });
  const result = await transport.submit(context.envelope);
  assert.equal(result.disposition, "confirmed");
  assert.equal(result.unexpectedFillObserved, true);
  assert.equal(result.reconciliationRequired, true);
  assert.equal(result.retryAllowed, false);
});

test("timeout is UNKNOWN, never retried and blocks a second submission", async () => {
  const context = await signedEnvelope();
  let calls = 0;
  const transport = new HypercoreTestnetExchangeTransport({
    clock: () => NOW,
    fetchImpl: async () => {
      calls += 1;
      const error = new Error("deadline");
      error.name = "TimeoutError";
      throw error;
    }
  });
  const result = await transport.submit(context.envelope);
  assert.equal(calls, 1);
  assert.equal(result.disposition, "unknown");
  assert.equal(result.retryAllowed, false);
  assert.equal(result.reconciliationRequired, true);
  await assert.rejects(() => transport.submit(context.envelope), {
    code: "hypercore_testnet_submission_denied"
  });
  assert.equal(calls, 1);
});

test("user-signed provisioning request cannot enter the Exchange execution transport", async () => {
  const context = authorize();
  const request = createHypercoreApproveAgentSigningRequest({
    agentAddress: ACCOUNT.address.toLowerCase(),
    agentName: "ipo1-proof-002c",
    nonce: NOW.getTime(),
    signerReferenceHash: context.proofPolicy.signerReferenceHash,
    canonicalAccountAddressHash: h("canonical_account")
  });
  const signer = new IsolatedHypercoreTypedDataSigner({
    signerId: "provisioning_test_signer",
    expectedSignerAddress: ACCOUNT.address.toLowerCase(),
    signTypedData: (typedData) => ACCOUNT.signTypedData(typedData)
  });
  const signed = await signer.sign(request);
  assert.throws(() => createHypercoreTestnetExchangeEnvelope({
    authorization: context.authorization,
    signingRequest: request,
    signed,
    now: NOW
  }), { code: "invalid_hypercore_testnet_exchange_envelope" });
});

test("wrong Testnet vault binding is rejected before transport", async () => {
  const context = await signedEnvelope();
  assert.throws(() => createHypercoreTestnetExchangeEnvelope({
    authorization: context.authorization,
    signingRequest: context.signingRequest,
    signed: context.signed,
    vaultAddress: "0x1111111111111111111111111111111111111111",
    now: NOW
  }), { code: "invalid_hypercore_testnet_exchange_envelope" });
});
