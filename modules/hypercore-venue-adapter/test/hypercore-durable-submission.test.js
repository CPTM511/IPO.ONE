import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  HypercoreExecutionActionKind,
  HypercoreDurableTestnetExecutionService,
  HypercoreTestnetExchangeTransport,
  IsolatedHypercoreTypedDataSigner,
  approveHypercoreTestnetSubmissionAttempt,
  authorizeHypercoreTestnetAction,
  claimHypercoreTestnetSubmissionAttempt,
  closeHypercoreTestnetSubmissionAttempt,
  compileHypercoreExecutionAction,
  createHypercoreAccountBinding,
  createHypercoreL1SigningRequest,
  createHypercoreTestnetExchangeEnvelope,
  createHypercoreTestnetFounderApproval,
  createHypercoreTestnetProofPolicy,
  createHypercoreTestnetSignerHandoff,
  createHypercoreTestnetSubmissionAttempt,
  createPreparedHypercoreDelegate,
  founderApprovalHumanConfirmation,
  reconcileHypercoreTestnetSubmissionAttempt,
  recoverHypercoreTestnetSubmissionUnknown,
  resolveHypercoreTestnetSubmissionAttempt,
  retireHypercoreTestnetSignerHandoff,
  verifyHypercoreTestnetSubmissionAttempt
} from "../src/index.js";

const NOW = new Date("2026-08-08T10:00:00.000Z");
const API_WALLET = privateKeyToAccount(
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
);
const MASTER = "0x1111111111111111111111111111111111111111";
const SUBACCOUNT = "0x2222222222222222222222222222222222222222";
const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;

async function schemaValidator(name, references = []) {
  const schema = JSON.parse(await readFile(
    new URL(`../../../schemas/v2/${name}.schema.json`, import.meta.url),
    "utf8"
  ));
  const ajv = new Ajv2020({ allErrors: true, strict: true }).addFormat(
    "date-time",
    {
      type: "string",
      validate: (value) =>
        typeof value === "string" &&
        Number.isFinite(new Date(value).getTime())
    }
  );
  for (const reference of references) {
    ajv.addSchema(JSON.parse(await readFile(
      new URL(`../../../schemas/v2/${reference}.schema.json`, import.meta.url),
      "utf8"
    )));
  }
  return ajv.compile(schema);
}

function h(scope) {
  return hashId("hypercore_002d_unit", { scope });
}

function fixture() {
  const binding = createHypercoreAccountBinding({
    facilityId: "trading_facility_hypercore_002d",
    facilityHash: h("facility"),
    accountRole: "subaccount",
    masterAccountAddress: MASTER,
    subaccountAddress: SUBACCOUNT,
    bindingProofHash: h("binding_proof"),
    bindingVersion: 1
  });
  const delegate = createPreparedHypercoreDelegate({
    binding,
    apiWalletAddress: API_WALLET.address.toLowerCase(),
    signerReferenceHash: h("signer_reference"),
    delegateName: "ipo-one-hypercore-002d",
    expiresAt: new Date("2026-08-08T11:00:00.000Z"),
    now: NOW
  });
  const handoff = createHypercoreTestnetSignerHandoff({
    binding,
    delegate,
    registrationEvidenceHash: h("registration"),
    verifiedAt: NOW,
    expiresAt: new Date("2026-08-08T10:30:00.000Z")
  });
  const riskSnapshot = {
    accountBindingHash: binding.accountBindingHash,
    metadataHash: h("metadata"),
    metadataObservedAt: "2026-08-08T09:59:30.000Z",
    observedAt: "2026-08-08T09:59:59.000Z",
    status: "FRESH",
    openOrdersCount: 0,
    aggregateExposureUsd: "0",
    positionNotionalUsd: "0",
    unknownOutcomeCount: 0,
    reconciliationStatus: "RECONCILED",
    paused: false
  };
  riskSnapshot.riskSnapshotHash = hashId(
    "hypercore_testnet_risk_snapshot",
    riskSnapshot
  );
  const policy = createHypercoreTestnetProofPolicy({
    policyId: "hypercore_testnet_btc_proof_002d",
    accountBindingHash: binding.accountBindingHash,
    delegateHash: delegate.delegateHash,
    signerReferenceHash: delegate.signerReferenceHash,
    metadataHash: riskSnapshot.metadataHash,
    assetIndex: 3,
    sizeDecimals: 5,
    priceDecimals: 1,
    metadataObservedAt: riskSnapshot.metadataObservedAt,
    executionOwnerActorId: "actor_hypercore_execution_owner",
    riskOwnerActorId: "actor_hypercore_risk_owner",
    incidentOwnerActorId: "actor_ipo_one_founder",
    approvedAt: "2026-08-08T09:59:40.000Z",
    expiresAt: "2026-08-08T11:00:00.000Z"
  });
  const preparedAction = compileHypercoreExecutionAction({
    actionKind: HypercoreExecutionActionKind.ORDER,
    action: {
      assetIndex: 3,
      side: "buy",
      limitPx: "50000",
      size: "0.0002",
      reduceOnly: false,
      timeInForce: "Alo",
      cloid: "0x00000000000000000000000000000001"
    },
    sourceActionHash: h("source"),
    policyDecisionHash: h("upstream_policy"),
    riskSnapshotHash: riskSnapshot.riskSnapshotHash,
    accountBindingHash: binding.accountBindingHash,
    delegateHash: delegate.delegateHash
  });
  const attempt = createHypercoreTestnetSubmissionAttempt({
    binding,
    handoff,
    policy,
    preparedAction,
    idempotencyKey: "hypercore-002d-unit-attempt",
    nonce: NOW.getTime(),
    now: NOW,
    expiresAt: new Date("2026-08-08T10:15:00.000Z")
  });
  const approval = createHypercoreTestnetFounderApproval({
    attempt,
    actorId: "actor_ipo_one_founder",
    confirmationNonceHash: h("confirmation_nonce"),
    approvedAt: new Date("2026-08-08T10:00:01.000Z"),
    expiresAt: new Date("2026-08-08T10:05:00.000Z")
  });
  const approved = approveHypercoreTestnetSubmissionAttempt({ attempt, approval });
  const authorization = authorizeHypercoreTestnetAction({
    policy,
    preparedAction,
    riskSnapshot,
    proofState: {
      proofId: "hypercore_testnet_proof_run_002d",
      startedAt: "2026-08-08T09:59:50.000Z",
      submissionCount: 0,
      openOrderCount: 0,
      aggregateExposureUsd: "0"
    },
    humanConfirmation: founderApprovalHumanConfirmation(approval),
    now: new Date("2026-08-08T10:00:02.000Z")
  });
  return {
    binding,
    delegate,
    handoff,
    riskSnapshot,
    policy,
    preparedAction,
    attempt,
    approval,
    approved,
    authorization
  };
}

async function signedEnvelope(context) {
  const request = createHypercoreL1SigningRequest({
    preparedAction: context.preparedAction,
    signerReferenceHash: context.handoff.signerReferenceHash,
    canonicalAccountAddressHash: context.binding.canonicalAccountAddressHash,
    vaultAddress: SUBACCOUNT,
    nonce: context.attempt.nonce,
    expiresAfter: new Date(context.authorization.effectiveUntil).getTime()
  });
  const signer = new IsolatedHypercoreTypedDataSigner({
    signerId: "hypercore_002d_unit_signer",
    expectedSignerAddress: API_WALLET.address.toLowerCase(),
    signTypedData: (typedData) => API_WALLET.signTypedData(typedData)
  });
  const signed = await signer.sign(request);
  return {
    signed,
    envelope: createHypercoreTestnetExchangeEnvelope({
      authorization: context.authorization,
      signingRequest: request,
      signed,
      vaultAddress: SUBACCOUNT,
      now: new Date("2026-08-08T10:00:02.000Z")
    })
  };
}

class InMemory002dSubmissionRepository {
  constructor(context) {
    this.attempt = context.approved;
    this.approval = context.approval;
  }

  async find(executionId) {
    return this.attempt.executionId === executionId ? this.attempt : undefined;
  }

  async claim(input) {
    this.attempt = claimHypercoreTestnetSubmissionAttempt({
      attempt: this.attempt,
      approval: this.approval,
      ...input
    });
    return this.attempt;
  }

  async resolve(input) {
    this.attempt = resolveHypercoreTestnetSubmissionAttempt({
      attempt: this.attempt,
      ...input
    });
    return this.attempt;
  }

  async recoverUnknown(input) {
    this.attempt = recoverHypercoreTestnetSubmissionUnknown({
      attempt: this.attempt,
      ...input
    });
    return this.attempt;
  }
}

function executionTransport({ fetchImpl }) {
  return new HypercoreTestnetExchangeTransport({
    clock: () => new Date("2026-08-08T10:00:03.000Z"),
    fetchImpl
  });
}

test("002D binds one exact Founder approval through reconciliation and signer closure", async () => {
  const context = fixture();
  const { signed, envelope } = await signedEnvelope(context);
  const claimed = claimHypercoreTestnetSubmissionAttempt({
    attempt: context.approved,
    approval: context.approval,
    authorization: context.authorization,
    requestBodyHash: envelope.requestBodyHash,
    signatureHash: signed.signatureHash,
    claimHash: h("claim"),
    now: new Date("2026-08-08T10:00:03.000Z")
  });
  assert.equal(claimed.state, "SUBMITTING");
  assert.equal(claimed.externalSubmissionAttempted, true);
  assert.equal(claimed.retryAllowed, false);

  const transport = new HypercoreTestnetExchangeTransport({
    clock: () => new Date("2026-08-08T10:00:03.000Z"),
    fetchImpl: async () => ({
      status: 200,
      headers: { get: () => null },
      async text() {
        return JSON.stringify({
          status: "ok",
          response: { type: "order", data: { statuses: [{ resting: { oid: 7 } }] } }
        });
      }
    })
  });
  const result = await transport.submit(envelope);
  const submitted = resolveHypercoreTestnetSubmissionAttempt({
    attempt: claimed,
    result,
    now: new Date("2026-08-08T10:00:04.000Z")
  });
  const reconciled = reconcileHypercoreTestnetSubmissionAttempt({
    attempt: submitted,
    reconciliationHash: h("reconciliation"),
    venueOrderStateHash: h("order_state"),
    venueAccountStateHash: h("account_state"),
    ledgerStateHash: h("ledger_state"),
    obligationEvidenceHash: h("obligation_evidence"),
    now: new Date("2026-08-08T10:00:05.000Z")
  });
  const retired = retireHypercoreTestnetSignerHandoff({
    handoff: context.handoff,
    retirementEvidenceHash: h("retirement"),
    now: new Date("2026-08-08T10:00:06.000Z")
  });
  const closed = closeHypercoreTestnetSubmissionAttempt({
    attempt: reconciled,
    handoff: retired,
    now: new Date("2026-08-08T10:00:07.000Z")
  });
  assert.equal(verifyHypercoreTestnetSubmissionAttempt(closed), true);
  assert.equal(closed.state, "CLOSED");
  assert.equal(closed.signerRetirementHash, h("retirement"));
  assert.equal(closed.rawSignaturePersisted, false);
  assert.equal(closed.realFundsAuthority, false);
});

test("002D crash after claim becomes UNKNOWN and can never be claimed again", async () => {
  const context = fixture();
  const { signed, envelope } = await signedEnvelope(context);
  const claimed = claimHypercoreTestnetSubmissionAttempt({
    attempt: context.approved,
    approval: context.approval,
    authorization: context.authorization,
    requestBodyHash: envelope.requestBodyHash,
    signatureHash: signed.signatureHash,
    claimHash: h("unknown_claim"),
    now: new Date("2026-08-08T10:00:03.000Z")
  });
  const unknown = recoverHypercoreTestnetSubmissionUnknown({
    attempt: claimed,
    reasonHash: h("lost_response"),
    now: new Date("2026-08-08T10:00:04.000Z")
  });
  assert.equal(unknown.state, "UNKNOWN");
  assert.equal(unknown.retryAllowed, false);
  assert.throws(
    () => claimHypercoreTestnetSubmissionAttempt({
      attempt: unknown,
      approval: context.approval,
      authorization: context.authorization,
      requestBodyHash: envelope.requestBodyHash,
      signatureHash: signed.signatureHash,
      claimHash: h("second_claim"),
      now: new Date("2026-08-08T10:00:05.000Z")
    }),
    { code: "hypercore_testnet_submission_claim_denied" }
  );
});

test("002D stale approval and changed account, signer or action fail closed", () => {
  const context = fixture();
  assert.throws(
    () => claimHypercoreTestnetSubmissionAttempt({
      attempt: context.approved,
      approval: context.approval,
      authorization: context.authorization,
      requestBodyHash: h("body"),
      signatureHash: h("signature"),
      claimHash: h("stale_claim"),
      now: new Date("2026-08-08T10:05:00.000Z")
    }),
    { code: "hypercore_testnet_submission_claim_denied" }
  );

  for (const [field, value] of [
    ["accountBindingHash", h("wrong_account")],
    ["signerReferenceHash", h("wrong_signer")],
    ["preparedActionHash", h("wrong_action")]
  ]) {
    const drifted = structuredClone(context.approval);
    drifted[field] = value;
    assert.throws(
      () => approveHypercoreTestnetSubmissionAttempt({
        attempt: context.attempt,
        approval: drifted
      }),
      { code: "invalid_hypercore_testnet_founder_approval" }
    );
  }

  const retired = retireHypercoreTestnetSignerHandoff({
    handoff: context.handoff,
    retirementEvidenceHash: h("retired_early"),
    now: new Date("2026-08-08T10:00:01.000Z")
  });
  assert.throws(
    () => createHypercoreTestnetSubmissionAttempt({
      binding: context.binding,
      handoff: retired,
      policy: context.policy,
      preparedAction: context.preparedAction,
      idempotencyKey: "retired-handoff-attempt",
      nonce: NOW.getTime() + 1,
      now: new Date("2026-08-08T10:00:02.000Z"),
      expiresAt: new Date("2026-08-08T10:10:00.000Z")
    }),
    { code: "hypercore_testnet_submission_preparation_denied" }
  );
});

test("002D durable handoff, approval, attempt and transition match closed schemas", async () => {
  const context = fixture();
  const fixtures = [
    ["hypercore-testnet-signer-handoff", context.handoff, []],
    ["hypercore-testnet-founder-approval", context.approval, []],
    [
      "hypercore-testnet-submission-attempt",
      context.approved,
      ["hypercore-prepared-action"]
    ],
    [
      "hypercore-testnet-submission-transition",
      {
        sequence: 1,
        previousState: null,
        nextState: "PREPARED",
        transitionHash: h("schema_transition"),
        resultHash: null,
        changedAt: context.attempt.preparedAt,
        retryAllowed: false,
        secretsIncluded: false,
        schemaVersion: "hypercore_testnet_submission_transition.v1"
      },
      []
    ]
  ];
  for (const [name, value, references] of fixtures) {
    const validate = await schemaValidator(name, references);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
});

test("002D execution service never performs network I/O before durable claim", async () => {
  const context = fixture();
  const { envelope } = await signedEnvelope(context);
  const repository = new InMemory002dSubmissionRepository(context);
  let transportCalls = 0;
  const service = new HypercoreDurableTestnetExecutionService({
    repository,
    transport: executionTransport({
      fetchImpl: async () => {
        transportCalls += 1;
        throw new Error("unreachable");
      }
    }),
    clock: () => new Date("2026-08-08T10:00:03.000Z"),
    faultInjector: ({ stage }) => {
      if (stage === "before_claim") throw new Error("process_crash");
    }
  });
  await assert.rejects(() => service.submitExact({
    executionId: context.attempt.executionId,
    authorization: context.authorization,
    envelope: { ...envelope, requestBodyHash: h("drifted_exchange_body") }
  }), { code: "invalid_hypercore_testnet_exchange_envelope" });
  assert.equal(repository.attempt.state, "APPROVED");
  await assert.rejects(() => service.submitExact({
    executionId: context.attempt.executionId,
    authorization: context.authorization,
    envelope
  }), /process_crash/);
  assert.equal(repository.attempt.state, "APPROVED");
  assert.equal(transportCalls, 0);
});

test("002D crash after claim but before transport recovers UNKNOWN without retry", async () => {
  const context = fixture();
  const { envelope } = await signedEnvelope(context);
  const repository = new InMemory002dSubmissionRepository(context);
  let transportCalls = 0;
  const transport = executionTransport({
    fetchImpl: async () => {
      transportCalls += 1;
      throw new Error("unreachable");
    }
  });
  const service = new HypercoreDurableTestnetExecutionService({
    repository,
    transport,
    clock: () => new Date("2026-08-08T10:00:03.000Z"),
    faultInjector: ({ stage }) => {
      if (stage === "after_claim_before_transport") {
        throw new Error("process_crash");
      }
    }
  });
  await assert.rejects(() => service.submitExact({
    executionId: context.attempt.executionId,
    authorization: context.authorization,
    envelope
  }), /process_crash/);
  assert.equal(repository.attempt.state, "SUBMITTING");
  assert.equal(transportCalls, 0);

  const restarted = new HypercoreDurableTestnetExecutionService({
    repository,
    transport,
    clock: () => new Date("2026-08-08T10:00:04.000Z")
  });
  const unknown = await restarted.recoverInFlight({
    executionId: context.attempt.executionId,
    reasonCode: "PROCESS_RESTART"
  });
  assert.equal(unknown.state, "UNKNOWN");
  assert.equal(unknown.retryAllowed, false);
  await assert.rejects(() => restarted.submitExact({
    executionId: context.attempt.executionId,
    authorization: context.authorization,
    envelope
  }), { code: "hypercore_durable_execution_binding_denied" });
  assert.equal(transportCalls, 0);
});

test("002D timeout or lost response is durably UNKNOWN and never retried", async () => {
  const context = fixture();
  const { envelope } = await signedEnvelope(context);
  const repository = new InMemory002dSubmissionRepository(context);
  let transportCalls = 0;
  const service = new HypercoreDurableTestnetExecutionService({
    repository,
    transport: executionTransport({
      fetchImpl: async () => {
        transportCalls += 1;
        const error = new Error("deadline");
        error.name = "TimeoutError";
        throw error;
      }
    }),
    clock: () => new Date("2026-08-08T10:00:03.000Z")
  });
  const unknown = await service.submitExact({
    executionId: context.attempt.executionId,
    authorization: context.authorization,
    envelope
  });
  assert.equal(unknown.state, "UNKNOWN");
  assert.equal(unknown.retryAllowed, false);
  assert.equal(transportCalls, 1);
  await assert.rejects(() => service.submitExact({
    executionId: context.attempt.executionId,
    authorization: context.authorization,
    envelope
  }), { code: "hypercore_durable_execution_binding_denied" });
  assert.equal(transportCalls, 1);
});

test("002D crash after remote acceptance before result persistence recovers UNKNOWN", async () => {
  const context = fixture();
  const { envelope } = await signedEnvelope(context);
  const repository = new InMemory002dSubmissionRepository(context);
  let transportCalls = 0;
  const transport = executionTransport({
    fetchImpl: async () => {
      transportCalls += 1;
      return {
        status: 200,
        headers: { get: () => null },
        async text() {
          return JSON.stringify({
            status: "ok",
            response: {
              type: "order",
              data: { statuses: [{ resting: { oid: 7 } }] }
            }
          });
        }
      };
    }
  });
  const service = new HypercoreDurableTestnetExecutionService({
    repository,
    transport,
    clock: () => new Date("2026-08-08T10:00:03.000Z"),
    faultInjector: ({ stage }) => {
      if (stage === "after_transport_before_result_persistence") {
        throw new Error("process_crash");
      }
    }
  });
  await assert.rejects(() => service.submitExact({
    executionId: context.attempt.executionId,
    authorization: context.authorization,
    envelope
  }), /process_crash/);
  assert.equal(transportCalls, 1);
  assert.equal(repository.attempt.state, "SUBMITTING");

  const restarted = new HypercoreDurableTestnetExecutionService({
    repository,
    transport,
    clock: () => new Date("2026-08-08T10:00:04.000Z")
  });
  const unknown = await restarted.recoverInFlight({
    executionId: context.attempt.executionId,
    reasonCode: "RESULT_PERSISTENCE_FAILURE"
  });
  assert.equal(unknown.state, "UNKNOWN");
  assert.equal(unknown.retryAllowed, false);
  assert.equal(transportCalls, 1);
});
