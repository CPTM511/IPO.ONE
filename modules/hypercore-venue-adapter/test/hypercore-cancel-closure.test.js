import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  HypercoreExecutionActionKind,
  HypercoreStableExecutionService,
  HypercoreTestnetExchangeTransport,
  IsolatedHypercoreTypedDataSigner,
  abortHypercoreStableExecutionSigning,
  approveHypercoreStableExecutionIntent,
  beginHypercoreJitSigning,
  claimHypercoreStableExecutionIntent,
  closeHypercoreStableExecutionIntent,
  compileHypercoreExecutionAction,
  createHypercoreCancelJitVenuePreflightReceipt,
  createHypercoreL1SigningRequest,
  createHypercoreStableCancelExecutionIntent,
  createHypercoreStableCancelPolicyConstraint,
  createHypercoreStableCancelTarget,
  createHypercoreStableFounderApproval,
  reconcileHypercoreStableExecutionIntent,
  recoverHypercoreStableExecutionUnknown,
  resolveHypercoreStableExecutionIntent,
  verifyHypercoreJitVenuePreflightReceipt,
  verifyHypercoreStableExecutionIntent
} from "../src/index.js";

const START = new Date("2026-08-10T13:00:00.000Z");
const CLOID = "0x3ec931145cbe6e36213621b50521a704";
const API_WALLET = privateKeyToAccount(
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
);

function h(scope) {
  return hashId("hypercore_039_cancel_test", { scope });
}

function target(overrides = {}) {
  return createHypercoreStableCancelTarget({
    parentIntentId: `hypercore_stable_intent_${h("parent").slice(2)}`,
    parentIntentHash: h("parent"),
    market: "BTC",
    assetIndex: 3,
    side: "buy",
    limitPx: "62500",
    size: "0.00016",
    reduceOnly: false,
    cloid: CLOID,
    venueOrderId: 57670774189,
    ...overrides
  });
}

function fixture() {
  const cancelTarget = target();
  const policy = createHypercoreStableCancelPolicyConstraint({
    policyId: "hypercore_testnet_btc_proof_002d_cancel",
    policyVersion: "adr_039_closure.v1",
    facilityHash: h("facility"),
    accountBindingHash: h("binding"),
    delegateHash: h("delegate"),
    signerReferenceHash: h("signer"),
    parentIntentHash: cancelTarget.parentIntentHash,
    targetOrderHash: cancelTarget.targetOrderHash,
    targetClientOrderId: CLOID,
    executionOwnerActorId: "actor_hypercore_execution_owner",
    riskOwnerActorId: "actor_hypercore_risk_owner",
    incidentOwnerActorId: "actor_ipo_one_founder"
  });
  const action = {
    type: "cancelByCloid",
    cancels: [{ asset: 3, cloid: CLOID }]
  };
  const intent = createHypercoreStableCancelExecutionIntent({
    facilityId: "trading_facility_hypercore_039_cancel",
    facilityHash: h("facility"),
    accountBindingId: "hypercore_account_binding_039_cancel",
    accountBindingHash: h("binding"),
    canonicalAccountAddressHash: h("account"),
    handoffId: "hypercore_signer_handoff_039_cancel",
    handoffHash: h("handoff"),
    delegateId: "hypercore_delegate_039_cancel",
    delegateHash: h("delegate"),
    apiWalletAddressHash: h("api_wallet"),
    signerReferenceHash: h("signer"),
    parentIntentId: cancelTarget.parentIntentId,
    parentIntentHash: cancelTarget.parentIntentHash,
    targetOrder: cancelTarget,
    policyConstraint: policy,
    hyperliquidAction: action,
    idempotencyKey: "hypercore-039-cancel-stable-intent",
    nonce: START.getTime(),
    preparedAt: START,
    approvalExpiresAt: new Date(START.getTime() + 30 * 60_000)
  });
  const approval = createHypercoreStableFounderApproval({
    intent,
    actorId: "actor_ipo_one_founder",
    confirmationNonceHash: h("confirmation"),
    approvedAt: new Date(START.getTime() + 60_000),
    expiresAt: new Date(START.getTime() + 10 * 60_000)
  });
  return {
    cancelTarget,
    policy,
    action,
    intent,
    approval,
    approved: approveHypercoreStableExecutionIntent({ intent, approval })
  };
}

function observation(cancelTarget, overrides = {}) {
  return {
    masterRole: "user",
    apiWalletRole: "agent",
    accountValue: "999",
    withdrawable: "998.5",
    positionCount: 0,
    openOrderCount: 1,
    aggregateExposureUsd: "0",
    positionNotionalUsd: "0",
    unknownOutcomeCount: 0,
    reconciliationStatus: "RECONCILED",
    paused: false,
    masterRoleHash: h("master_role"),
    apiWalletRoleHash: h("api_role"),
    accountStateHash: h("account_state"),
    ordersHash: h("orders"),
    orderStatusHash: h("order_status"),
    metadataHash: h("metadata"),
    metadataObservedAt: "2026-08-10T13:00:58.000Z",
    market: "BTC",
    assetIndex: 3,
    sizeDecimals: 5,
    priceDecimals: 1,
    observedTargetOrder: cancelTarget,
    observedTargetOrderHash: cancelTarget.targetOrderHash,
    metaResponseHash: h("meta"),
    ordersResponseHash: h("orders_response"),
    orderStatusResponseHash: h("order_status_response"),
    ...overrides
  };
}

function executableFixture() {
  const context = fixture();
  const now = new Date(START.getTime() + 61_000);
  const receipt = createHypercoreCancelJitVenuePreflightReceipt({
    intent: context.approved,
    approval: context.approval,
    observation: observation(context.cancelTarget),
    now
  });
  const preparedAction = compileHypercoreExecutionAction({
    actionKind: HypercoreExecutionActionKind.CANCEL_BY_CLOID,
    action: { assetIndex: 3, cloid: CLOID },
    sourceActionHash: context.intent.intentHash,
    policyDecisionHash: context.policy.policyConstraintHash,
    riskSnapshotHash: receipt.riskSnapshotHash,
    accountBindingHash: context.intent.accountBindingHash,
    delegateHash: context.intent.delegateHash
  });
  const signingRequest = createHypercoreL1SigningRequest({
    preparedAction,
    signerReferenceHash: context.intent.signerReferenceHash,
    canonicalAccountAddressHash: context.intent.canonicalAccountAddressHash,
    nonce: context.intent.nonce,
    expiresAfter: now.getTime() + 9_000
  });
  const signer = new IsolatedHypercoreTypedDataSigner({
    signerId: "hypercore_039_cancel_test_signer",
    expectedSignerAddress: API_WALLET.address.toLowerCase(),
    signTypedData: (typedData) => API_WALLET.signTypedData(typedData)
  });
  return { ...context, now, receipt, preparedAction, signingRequest, signer };
}

class InMemoryCancelRepository {
  constructor(context) {
    this.intent = context.approved;
  }

  async find(intentId) {
    return this.intent.intentId === intentId ? this.intent : undefined;
  }

  async beginSigning(input) {
    this.intent = beginHypercoreJitSigning({
      intent: this.intent,
      approval: input.approval,
      receipt: input.receipt,
      signingRequest: input.signingRequest,
      now: input.now
    });
    return this.intent;
  }

  async claim(input) {
    this.intent = claimHypercoreStableExecutionIntent({
      intent: this.intent,
      authorization: input.authorization,
      envelope: input.envelope,
      claimHash: input.claimHash,
      now: input.now
    });
    return this.intent;
  }

  async resolve(input) {
    this.intent = resolveHypercoreStableExecutionIntent({
      intent: this.intent,
      result: input.result,
      now: input.now
    });
    return this.intent;
  }

  async abortSigning(input) {
    this.intent = abortHypercoreStableExecutionSigning({
      intent: this.intent,
      reasonHash: input.reasonHash,
      now: input.now
    });
    return this.intent;
  }

  async recoverUnknown(input) {
    this.intent = recoverHypercoreStableExecutionUnknown({
      intent: this.intent,
      reasonHash: input.reasonHash,
      now: input.now
    });
    return this.intent;
  }
}

function cancelTransport(context, onSubmit = () => {}, { loseResponse = false } = {}) {
  return new HypercoreTestnetExchangeTransport({
    clock: () => new Date(context.now.getTime() + 2_000),
    fetchImpl: async () => {
      onSubmit();
      if (loseResponse) throw new Error("lost response");
      return {
        status: 200,
        headers: { get: () => null },
        async text() {
          return JSON.stringify({
            status: "ok",
            response: { type: "cancel", data: { statuses: ["success"] } }
          });
        }
      };
    }
  });
}

function serviceInput(context) {
  return {
    intent: context.approved,
    approval: context.approval,
    receipt: context.receipt,
    preparedAction: context.preparedAction,
    signingRequest: context.signingRequest
  };
}

test("ADR-039 closure binds one exact BTC cancel target and parent order", () => {
  const context = fixture();
  assert.equal(context.intent.actionKind, "cancelByCloid");
  assert.equal(context.intent.parentIntentHash, context.cancelTarget.parentIntentHash);
  assert.equal(context.intent.targetOrderHash, context.cancelTarget.targetOrderHash);
  assert.deepEqual(context.intent.hyperliquidAction, context.action);
  assert.equal(verifyHypercoreStableExecutionIntent(context.intent), true);

  const drifted = structuredClone(context.intent);
  drifted.targetOrder.venueOrderId += 1;
  assert.throws(() => verifyHypercoreStableExecutionIntent(drifted));
});

test("ADR-039 closure JIT is exactly ten seconds and accepts only the bound open order", () => {
  const context = fixture();
  const now = new Date(START.getTime() + 61_000);
  const receipt = createHypercoreCancelJitVenuePreflightReceipt({
    intent: context.approved,
    approval: context.approval,
    observation: observation(context.cancelTarget),
    now
  });
  assert.equal(new Date(receipt.expiresAt).getTime() - now.getTime(), 10_000);
  assert.equal(receipt.targetOrderHash, context.cancelTarget.targetOrderHash);
  assert.equal(receipt.riskReductionOnly, true);
  assert.equal(verifyHypercoreJitVenuePreflightReceipt(receipt), true);
});

test("ADR-039 closure JIT fails closed on missing, changed, additional, stale, positioned or UNKNOWN state", () => {
  const context = fixture();
  const now = new Date(START.getTime() + 61_000);
  const cases = [
    { openOrderCount: 0 },
    { openOrderCount: 2 },
    { positionCount: 1, positionNotionalUsd: "10" },
    { unknownOutcomeCount: 1, reconciliationStatus: "UNKNOWN" },
    { metadataObservedAt: "2026-08-10T12:50:00.000Z" },
    { observedTargetOrderHash: h("other_order") },
    { paused: true }
  ];
  for (const overrides of cases) {
    assert.throws(() => createHypercoreCancelJitVenuePreflightReceipt({
      intent: context.approved,
      approval: context.approval,
      observation: observation(context.cancelTarget, overrides),
      now
    }), { code: "hypercore_cancel_jit_preflight_denied" });
  }
});

test("ADR-039 closure composes the exact cancelByCloid action through the shared signer path", async () => {
  const context = fixture();
  const now = new Date(START.getTime() + 61_000);
  const receipt = createHypercoreCancelJitVenuePreflightReceipt({
    intent: context.approved,
    approval: context.approval,
    observation: observation(context.cancelTarget),
    now
  });
  const preparedAction = compileHypercoreExecutionAction({
    actionKind: HypercoreExecutionActionKind.CANCEL_BY_CLOID,
    action: { assetIndex: 3, cloid: CLOID },
    sourceActionHash: context.intent.intentHash,
    policyDecisionHash: context.policy.policyConstraintHash,
    riskSnapshotHash: receipt.riskSnapshotHash,
    accountBindingHash: context.intent.accountBindingHash,
    delegateHash: context.intent.delegateHash
  });
  const signingRequest = createHypercoreL1SigningRequest({
    preparedAction,
    signerReferenceHash: context.intent.signerReferenceHash,
    canonicalAccountAddressHash: context.intent.canonicalAccountAddressHash,
    nonce: context.intent.nonce,
    expiresAfter: now.getTime() + 9_000
  });
  const signing = beginHypercoreJitSigning({
    intent: context.approved,
    approval: context.approval,
    receipt,
    signingRequest,
    now
  });
  assert.equal(signing.state, "SIGNING");
  assert.deepEqual(signingRequest.action, context.action);
});

test("ADR-039 closure service produces one confirmed cancel and no retry authority", async () => {
  const context = executableFixture();
  const repository = new InMemoryCancelRepository(context);
  let submissions = 0;
  let ticks = 0;
  const service = new HypercoreStableExecutionService({
    repository,
    signer: context.signer,
    transport: cancelTransport(context, () => { submissions += 1; }),
    clock: () => new Date(context.now.getTime() + ticks++ * 100)
  });
  const result = await service.submitExact(serviceInput(context));
  assert.equal(result.state, "SUBMITTED");
  assert.equal(result.disposition, "confirmed");
  assert.equal(result.retryAllowed, false);
  assert.equal(submissions, 1);
});

test("ADR-039 closure lost response becomes UNKNOWN without a second cancel", async () => {
  const context = executableFixture();
  const repository = new InMemoryCancelRepository(context);
  let submissions = 0;
  let ticks = 0;
  const service = new HypercoreStableExecutionService({
    repository,
    signer: context.signer,
    transport: cancelTransport(
      context,
      () => { submissions += 1; },
      { loseResponse: true }
    ),
    clock: () => new Date(context.now.getTime() + ticks++ * 100)
  });
  const result = await service.submitExact(serviceInput(context));
  assert.equal(result.state, "UNKNOWN");
  assert.equal(result.retryAllowed, false);
  assert.equal(submissions, 1);
  await assert.rejects(() => service.submitExact(serviceInput(context)));
  assert.equal(submissions, 1);
});

test("ADR-039 closure concurrent workers converge on one cancel submission", async () => {
  const context = executableFixture();
  const repository = new InMemoryCancelRepository(context);
  let submissions = 0;
  let ticks = 0;
  const services = [1, 2].map(() => new HypercoreStableExecutionService({
    repository,
    signer: context.signer,
    transport: cancelTransport(context, () => { submissions += 1; }),
    clock: () => new Date(context.now.getTime() + ticks++ * 100)
  }));
  const results = await Promise.allSettled(
    services.map((service) => service.submitExact(serviceInput(context)))
  );
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(submissions, 1);
});

test("ADR-039 closure reconciles terminal venue truth before signer-bound close", async () => {
  const context = executableFixture();
  const repository = new InMemoryCancelRepository(context);
  let ticks = 0;
  const service = new HypercoreStableExecutionService({
    repository,
    signer: context.signer,
    transport: cancelTransport(context),
    clock: () => new Date(context.now.getTime() + ticks++ * 100)
  });
  const submitted = await service.submitExact(serviceInput(context));
  const reconciled = reconcileHypercoreStableExecutionIntent({
    intent: submitted,
    reconciliationHash: h("cancel_reconciliation"),
    venueOrderStateHash: h("cancel_terminal_order"),
    venueAccountStateHash: h("cancel_terminal_account"),
    ledgerStateHash: h("cancel_terminal_ledger"),
    obligationEvidenceHash: h("cancel_terminal_obligation"),
    now: new Date(context.now.getTime() + 3_000)
  });
  assert.equal(reconciled.state, "RECONCILED");
  assert.equal(reconciled.version, 6);
  const closed = closeHypercoreStableExecutionIntent({
    intent: reconciled,
    signerRetirementHash: h("cancel_signer_retirement"),
    now: new Date(context.now.getTime() + 4_000)
  });
  assert.equal(closed.state, "CLOSED");
  assert.equal(closed.version, 7);
  assert.equal(closed.signerRetirementHash, h("cancel_signer_retirement"));
  assert.throws(() => closeHypercoreStableExecutionIntent({
    intent: submitted,
    signerRetirementHash: h("cancel_signer_retirement"),
    now: new Date(context.now.getTime() + 4_000)
  }), { code: "hypercore_stable_close_denied" });
});
