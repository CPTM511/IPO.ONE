import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  HypercoreExecutionActionKind,
  HypercoreStableExecutionService,
  HypercoreTestnetExchangeTransport,
  IsolatedHypercoreTypedDataSigner,
  approveHypercoreStableExecutionIntent,
  abortHypercoreStableExecutionSigning,
  beginHypercoreJitSigning,
  claimHypercoreStableExecutionIntent,
  compileHypercoreExecutionAction,
  createHypercoreJitActionAuthorization,
  createHypercoreJitExchangeEnvelope,
  createHypercoreJitVenuePreflightReceipt,
  createHypercoreL1SigningRequest,
  createHypercoreStableExecutionIntent,
  createHypercoreStableFounderApproval,
  createHypercoreStablePolicyConstraint,
  resolveHypercoreStableExecutionIntent,
  recoverHypercoreStableExecutionUnknown,
  verifyHypercoreStableExecutionIntent
} from "../src/index.js";

const START = new Date("2026-08-10T10:00:00.000Z");
const API_WALLET = privateKeyToAccount(
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
);

function h(scope) {
  return hashId("hypercore_039_test", { scope });
}

function stableFixture() {
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
  const action = {
    type: "order",
    orders: [{
      a: 3,
      b: true,
      p: "62500",
      s: "0.00016",
      r: false,
      t: { limit: { tif: "Alo" } },
      c: "0x00000000000000000000000000000039"
    }],
    grouping: "na"
  };
  const intent = createHypercoreStableExecutionIntent({
    facilityId: "trading_facility_hypercore_039",
    facilityHash: h("facility"),
    accountBindingId: "hypercore_account_binding_039",
    accountBindingHash: h("binding"),
    canonicalAccountAddressHash: h("account"),
    handoffId: "hypercore_signer_handoff_039",
    handoffHash: h("handoff"),
    delegateId: "hypercore_delegate_039",
    delegateHash: h("delegate"),
    apiWalletAddressHash: h("api_wallet"),
    signerReferenceHash: h("signer"),
    policyConstraint: policy,
    hyperliquidAction: action,
    idempotencyKey: "hypercore-039-stable-intent",
    nonce: START.getTime(),
    preparedAt: START,
    approvalExpiresAt: new Date(START.getTime() + 15 * 60_000)
  });
  const approval = createHypercoreStableFounderApproval({
    intent,
    actorId: "actor_ipo_one_founder",
    confirmationNonceHash: h("confirmation"),
    approvedAt: new Date(START.getTime() + 60_000),
    expiresAt: new Date(START.getTime() + 10 * 60_000)
  });
  return {
    policy,
    action,
    intent,
    approval,
    approved: approveHypercoreStableExecutionIntent({ intent, approval })
  };
}

function observation(overrides = {}) {
  return {
    masterRole: "user",
    apiWalletRole: "agent",
    accountValue: "999",
    withdrawable: "999",
    positionCount: 0,
    openOrderCount: 0,
    aggregateExposureUsd: "0",
    positionNotionalUsd: "0",
    unknownOutcomeCount: 0,
    reconciliationStatus: "RECONCILED",
    paused: false,
    masterRoleHash: h("master_role"),
    apiWalletRoleHash: h("api_role"),
    accountStateHash: h("account_state"),
    ordersHash: h("orders"),
    metadataHash: h("metadata"),
    metadataObservedAt: "2026-08-10T10:00:58.000Z",
    market: "BTC",
    assetIndex: 3,
    sizeDecimals: 5,
    priceDecimals: 1,
    mid: "65124",
    bestBid: "65113",
    bestAsk: "65135",
    metaResponseHash: h("meta"),
    midsResponseHash: h("mids"),
    bookResponseHash: h("book"),
    ...overrides
  };
}

async function executableFixture() {
  const context = stableFixture();
  const now = new Date(START.getTime() + 61_000);
  const receipt = createHypercoreJitVenuePreflightReceipt({
    intent: context.approved,
    approval: context.approval,
    observation: observation(),
    now
  });
  const preparedAction = compileHypercoreExecutionAction({
    actionKind: HypercoreExecutionActionKind.ORDER,
    action: {
      assetIndex: 3,
      side: "buy",
      limitPx: "62500",
      size: "0.00016",
      reduceOnly: false,
      timeInForce: "Alo",
      cloid: context.action.orders[0].c
    },
    sourceActionHash: h("source"),
    policyDecisionHash: context.policy.policyConstraintHash,
    riskSnapshotHash: receipt.riskSnapshotHash,
    accountBindingHash: context.intent.accountBindingHash,
    delegateHash: context.intent.delegateHash
  });
  const signingRequest = createHypercoreL1SigningRequest({
    preparedAction,
    signerReferenceHash: context.intent.signerReferenceHash,
    canonicalAccountAddressHash: context.intent.canonicalAccountAddressHash,
    vaultAddress: null,
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
  const authorization = createHypercoreJitActionAuthorization({
    intent: signing,
    approval: context.approval,
    receipt,
    preparedAction,
    signingRequest,
    now
  });
  const signer = new IsolatedHypercoreTypedDataSigner({
    signerId: "hypercore_039_test_signer",
    expectedSignerAddress: API_WALLET.address.toLowerCase(),
    signTypedData: (typedData) => API_WALLET.signTypedData(typedData)
  });
  const signed = await signer.sign(signingRequest);
  const envelope = createHypercoreJitExchangeEnvelope({
    intent: signing,
    authorization,
    signingRequest,
    signed,
    now
  });
  return {
    ...context,
    now,
    receipt,
    preparedAction,
    signingRequest,
    signing,
    authorization,
    signed,
    signer,
    envelope
  };
}

class InMemoryStableRepository {
  constructor(context) {
    this.intent = context.approved;
    this.approval = context.approval;
    this.receipt = context.receipt;
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

function confirmedTransport(context, onSubmit = () => {}) {
  return new HypercoreTestnetExchangeTransport({
    clock: () => new Date(context.now.getTime() + 2_000),
    fetchImpl: async () => {
      onSubmit();
      return {
        status: 200,
        headers: { get: () => null },
        async text() {
          return JSON.stringify({
            status: "ok",
            response: { type: "order", data: { statuses: [{ resting: { oid: 39 } }] } }
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

test("ADR-039 stable intent remains unchanged while JIT risk observations refresh", () => {
  const context = stableFixture();
  const first = createHypercoreJitVenuePreflightReceipt({
    intent: context.approved,
    approval: context.approval,
    observation: observation(),
    now: new Date(START.getTime() + 61_000)
  });
  const second = createHypercoreJitVenuePreflightReceipt({
    intent: context.approved,
    approval: context.approval,
    observation: observation({
      accountStateHash: h("account_state_refresh"),
      metadataHash: h("metadata_refresh"),
      metadataObservedAt: "2026-08-10T10:01:02.000Z"
    }),
    now: new Date(START.getTime() + 63_000)
  });
  assert.equal(first.intentHash, context.intent.intentHash);
  assert.equal(second.intentHash, context.intent.intentHash);
  assert.notEqual(first.receiptHash, second.receiptHash);
  assert.equal(verifyHypercoreStableExecutionIntent(context.intent), true);
});

test("ADR-039 denies stale or riskier JIT observations without signing", () => {
  const context = stableFixture();
  assert.throws(() => createHypercoreJitVenuePreflightReceipt({
    intent: context.approved,
    approval: context.approval,
    observation: observation({ openOrderCount: 1 }),
    now: new Date(START.getTime() + 61_000)
  }), { code: "hypercore_jit_preflight_denied" });
  assert.throws(() => createHypercoreJitVenuePreflightReceipt({
    intent: context.approved,
    approval: context.approval,
    observation: observation({ metadataObservedAt: "2026-08-10T09:55:00.000Z" }),
    now: new Date(START.getTime() + 61_000)
  }), { code: "hypercore_jit_preflight_denied" });
  assert.throws(() => createHypercoreJitVenuePreflightReceipt({
    intent: context.approved,
    approval: context.approval,
    observation: observation({ bestBid: "62000", bestAsk: "62010" }),
    now: new Date(START.getTime() + 61_000)
  }), { code: "hypercore_jit_preflight_denied" });
  assert.throws(() => createHypercoreJitVenuePreflightReceipt({
    intent: context.approved,
    approval: context.approval,
    observation: observation({ bestBid: "100000", bestAsk: "100010" }),
    now: new Date(START.getTime() + 61_000)
  }), { code: "hypercore_jit_preflight_denied" });
});

test("ADR-039 exact approval cannot move to another payload, account or signer", () => {
  const context = stableFixture();
  for (const [field, value] of [
    ["payloadHash", h("other_payload")],
    ["accountBindingHash", h("other_account")],
    ["delegateHash", h("other_signer")]
  ]) {
    const drifted = structuredClone(context.intent);
    drifted[field] = value;
    assert.throws(() => approveHypercoreStableExecutionIntent({
      intent: drifted,
      approval: context.approval
    }));
  }
});

test("ADR-039 composes one durable claim and confirmed Testnet result", async () => {
  const context = await executableFixture();
  const claimed = claimHypercoreStableExecutionIntent({
    intent: context.signing,
    authorization: context.authorization,
    envelope: context.envelope,
    claimHash: h("claim"),
    now: new Date(context.now.getTime() + 1_000)
  });
  assert.equal(claimed.state, "SUBMITTING");
  assert.equal(claimed.externalSubmissionAttempted, true);
  const transport = new HypercoreTestnetExchangeTransport({
    clock: () => new Date(context.now.getTime() + 2_000),
    fetchImpl: async () => ({
      status: 200,
      headers: { get: () => null },
      async text() {
        return JSON.stringify({
          status: "ok",
          response: { type: "order", data: { statuses: [{ resting: { oid: 39 } }] } }
        });
      }
    })
  });
  const result = await transport.submit(context.envelope);
  const resolved = resolveHypercoreStableExecutionIntent({
    intent: claimed,
    result,
    now: new Date(context.now.getTime() + 3_000)
  });
  assert.equal(resolved.state, "SUBMITTED");
  assert.equal(resolved.retryAllowed, false);
});

test("ADR-039 ambiguous transport resolves UNKNOWN and cannot be claimed twice", async () => {
  const context = await executableFixture();
  const claimed = claimHypercoreStableExecutionIntent({
    intent: context.signing,
    authorization: context.authorization,
    envelope: context.envelope,
    claimHash: h("unknown_claim"),
    now: new Date(context.now.getTime() + 1_000)
  });
  const transport = new HypercoreTestnetExchangeTransport({
    clock: () => new Date(context.now.getTime() + 2_000),
    fetchImpl: async () => {
      throw new Error("lost response");
    }
  });
  const result = await transport.submit(context.envelope);
  const unknown = resolveHypercoreStableExecutionIntent({
    intent: claimed,
    result,
    now: new Date(context.now.getTime() + 3_000)
  });
  assert.equal(unknown.state, "UNKNOWN");
  assert.equal(unknown.retryAllowed, false);
  assert.throws(() => claimHypercoreStableExecutionIntent({
    intent: unknown,
    authorization: context.authorization,
    envelope: context.envelope,
    claimHash: h("replay_claim"),
    now: new Date(context.now.getTime() + 4_000)
  }), { code: "hypercore_jit_claim_denied" });
});

test("ADR-039 two workers converge on one durable signing and submission claim", async () => {
  const context = await executableFixture();
  const repository = new InMemoryStableRepository(context);
  let submits = 0;
  let ticks = 0;
  const clock = () => new Date(context.now.getTime() + ticks++ * 100);
  const services = [1, 2].map(() => new HypercoreStableExecutionService({
    repository,
    signer: context.signer,
    transport: confirmedTransport(context, () => { submits += 1; }),
    clock
  }));
  const outcomes = await Promise.allSettled(
    services.map((service) => service.submitExact(serviceInput(context)))
  );
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(submits, 1);
  assert.equal(repository.intent.state, "SUBMITTED");
});

test("ADR-039 crash after durable claim stays non-retryable and recovers UNKNOWN", async () => {
  const context = await executableFixture();
  const repository = new InMemoryStableRepository(context);
  let ticks = 0;
  const service = new HypercoreStableExecutionService({
    repository,
    signer: context.signer,
    transport: confirmedTransport(context),
    clock: () => new Date(context.now.getTime() + ticks++ * 100),
    faultInjector: ({ stage }) => {
      if (stage === "after_submission_claim_before_transport") {
        throw new Error("simulated process crash");
      }
    }
  });
  await assert.rejects(() => service.submitExact(serviceInput(context)), /simulated process crash/);
  assert.equal(repository.intent.state, "SUBMITTING");
  assert.equal(repository.intent.retryAllowed, false);
  await repository.recoverUnknown({
    intentId: repository.intent.intentId,
    reasonHash: h("restart_unknown"),
    now: new Date(context.now.getTime() + 3_000)
  });
  assert.equal(repository.intent.state, "UNKNOWN");
});

test("ADR-039 lost result persistence becomes UNKNOWN without a second submission", async () => {
  const context = await executableFixture();
  const repository = new InMemoryStableRepository(context);
  let submits = 0;
  let ticks = 0;
  const service = new HypercoreStableExecutionService({
    repository,
    signer: context.signer,
    transport: confirmedTransport(context, () => { submits += 1; }),
    clock: () => new Date(context.now.getTime() + ticks++ * 100),
    faultInjector: ({ stage }) => {
      if (stage === "after_transport_before_result_persistence") {
        throw new Error("simulated result persistence loss");
      }
    }
  });
  const result = await service.submitExact(serviceInput(context));
  assert.equal(result.state, "UNKNOWN");
  assert.equal(submits, 1);
  assert.equal(result.retryAllowed, false);
});
