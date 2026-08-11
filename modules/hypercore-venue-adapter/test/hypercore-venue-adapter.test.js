import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  HyperliquidTestnetExecutionGateway,
  InMemoryHyperliquidExecutionRepository,
  SimulatedHyperliquidExchangeTransport,
  SimulatedIsolatedHyperliquidSigner
} from "../../hyperliquid-execution/src/index.js";
import {
  HYPERCORE_ACCOUNT_BINDING_SCHEMA_VERSION,
  HYPERCORE_API_WALLET_DELEGATE_SCHEMA_VERSION,
  HypercoreDelegateStatus,
  HypercoreExecutionActionKind,
  HypercoreSigningScheme,
  InMemoryHypercoreDelegateRepository,
  VENUE_EXECUTION_PROVIDER_OPERATIONS,
  VenueExecutionProviderRegistry,
  assertHypercoreInfoQueryIdentity,
  assertVenueExecutionProvider,
  compileHypercoreExecutionAction,
  createHypercoreAccountBinding,
  createHypercoreDelegateTombstone,
  createHypercoreExecutionEvidence,
  createHypercoreSigningRequest,
  createLocalHypercoreVenueProvider,
  createVenueExecutionProviderRequest,
  describeHypercoreDelegateBoundary,
  describeHypercoreSigningBoundary,
  describeHypercoreVenueAdapterBoundary,
  describeVenueExecutionProviderBoundary,
  invokeVenueExecutionProvider,
  verifyHypercoreAccountBinding,
  verifyHypercoreDelegate,
  verifyHypercoreDelegateTombstone,
  verifyHypercoreExecutionEvidence,
  verifyHypercorePreparedAction,
  verifyHypercoreSigningRequest,
  verifyVenueExecutionProviderCapabilities,
  verifyVenueExecutionProviderDescriptor,
  verifyVenueExecutionProviderResult
} from "../src/index.js";

const NOW = new Date("2026-08-08T08:00:00.000Z");
const MASTER = "0x1111111111111111111111111111111111111111";
const SUBACCOUNT = "0x2222222222222222222222222222222222222222";
const DELEGATE_1 = "0x3333333333333333333333333333333333333333";
const DELEGATE_2 = "0x4444444444444444444444444444444444444444";
const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;

async function schemaValidator(name) {
  const schema = JSON.parse(
    await readFile(
      new URL(`../../../schemas/v2/${name}.schema.json`, import.meta.url),
      "utf8"
    )
  );
  return new Ajv2020({ allErrors: true, strict: true })
    .addFormat("date-time", {
      type: "string",
      validate(value) {
        return (
          typeof value === "string" &&
          /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
          Number.isFinite(new Date(value).getTime())
        );
      }
    })
    .compile(schema);
}

function h(scope, value = true) {
  return hashId(`hyperliquid002_test_${scope}`, { value });
}

function binding(role = "subaccount") {
  return createHypercoreAccountBinding({
    facilityId: "trading_facility_hyperliquid002",
    facilityHash: h("facility"),
    accountRole: role,
    masterAccountAddress: MASTER,
    subaccountAddress: role === "subaccount" ? SUBACCOUNT : null,
    bindingProofHash: h("binding_proof"),
    bindingVersion: 3
  });
}

function delegateInput(apiWalletAddress = DELEGATE_1, now = NOW) {
  return {
    binding: binding(),
    apiWalletAddress,
    signerReferenceHash: h("isolated_signer", apiWalletAddress),
    delegateName: "ipo-one-hyperliquid002-testnet",
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    now
  };
}

function actionInput(actionKind, action) {
  return {
    actionKind,
    action,
    sourceActionHash: h("source_action", actionKind),
    policyDecisionHash: h("policy", actionKind),
    riskSnapshotHash: h("risk", actionKind),
    accountBindingHash: binding().accountBindingHash,
    delegateHash: h("delegate", actionKind)
  };
}

const ORDER = Object.freeze({
  assetIndex: 1,
  side: "buy",
  limitPx: "2500.25",
  size: "0.01",
  reduceOnly: false,
  timeInForce: "Gtc",
  cloid: "0x11111111111111111111111111111111"
});

test("master/subaccount binding remains separate from API-wallet signing identity", () => {
  const value = binding();
  assert.equal(value.schemaVersion, HYPERCORE_ACCOUNT_BINDING_SCHEMA_VERSION);
  assert.equal(value.accountRole, "subaccount");
  assert.equal(value.canonicalAccountAddressHash, value.subaccountAddressHash);
  assert.equal(value.queryAddressHash, value.subaccountAddressHash);
  assert.equal(value.signerAddressIsAccountIdentity, false);
  assert.equal(value.apiWalletAddressAcceptedForInfo, false);
  assert.equal(verifyHypercoreAccountBinding(value), true);
  assert.equal(
    assertHypercoreInfoQueryIdentity({
      binding: value,
      queryAddress: SUBACCOUNT,
      apiWalletAddress: DELEGATE_1
    }),
    true
  );
  assert.throws(
    () =>
      assertHypercoreInfoQueryIdentity({
        binding: value,
        queryAddress: DELEGATE_1,
        apiWalletAddress: DELEGATE_1
      }),
    { code: "hypercore_info_query_identity_denied" }
  );
  assert.throws(
    () =>
      createHypercoreAccountBinding({
        facilityId: "trading_facility_hyperliquid002",
        facilityHash: h("facility"),
        accountRole: "subaccount",
        masterAccountAddress: MASTER,
        subaccountAddress: MASTER,
        bindingProofHash: h("binding_proof"),
        bindingVersion: 3
      }),
    { code: "invalid_hypercore_account_binding" }
  );
});

test("delegate lifecycle is hash-only, distinct, terminal and never reusable", async () => {
  const repository = new InMemoryHypercoreDelegateRepository();
  const prepared = await repository.prepare(delegateInput());
  assert.equal(prepared.schemaVersion, HYPERCORE_API_WALLET_DELEGATE_SCHEMA_VERSION);
  assert.equal(prepared.status, HypercoreDelegateStatus.PREPARED);
  assert.equal(prepared.rawAddressPersisted, false);
  assert.equal(prepared.rawKeyAccepted, false);
  assert.equal(prepared.externalApprovalPerformed, false);
  assert.equal(verifyHypercoreDelegate(prepared), true);

  const active = await repository.simulateActivation({
    delegateId: prepared.delegateId,
    expectedDelegateHash: prepared.delegateHash,
    now: new Date(NOW.getTime() + 1_000)
  });
  assert.equal(active.status, HypercoreDelegateStatus.SIMULATED_ACTIVE);
  assert.equal(active.externalApprovalPerformed, false);
  assert.equal(active.venueRegistrationVerified, false);
  assert.equal(
    verifyHypercoreDelegate(active, {
      now: new Date(NOW.getTime() + 2_000),
      requireUsable: true
    }),
    true
  );

  const terminated = await repository.terminate({
    delegateId: active.delegateId,
    expectedDelegateHash: active.delegateHash,
    status: HypercoreDelegateStatus.REVOKED,
    reason: "operator_request",
    now: new Date(NOW.getTime() + 3_000)
  });
  assert.equal(terminated.status, HypercoreDelegateStatus.REVOKED);
  assert.equal(repository.hasTombstone(terminated.apiWalletAddressHash), true);
  const tombstone = createHypercoreDelegateTombstone({ delegate: terminated });
  assert.equal(verifyHypercoreDelegateTombstone(tombstone), true);
  assert.throws(
    () =>
      verifyHypercoreDelegate(terminated, {
        now: new Date(NOW.getTime() + 4_000),
        requireUsable: true
      }),
    { code: "hypercore_delegate_unusable" }
  );
  await assert.rejects(repository.prepare(delegateInput()), {
    code: "hypercore_delegate_address_reuse_denied"
  });

  const restarted = new InMemoryHypercoreDelegateRepository(repository.exportSnapshot());
  await assert.rejects(restarted.prepare(delegateInput()), {
    code: "hypercore_delegate_address_reuse_denied"
  });
});

test("rotation retires the old delegate and requires a fresh never-used address", async () => {
  const repository = new InMemoryHypercoreDelegateRepository();
  const prepared = await repository.prepare(delegateInput());
  const rotated = await repository.rotate({
    delegateId: prepared.delegateId,
    expectedDelegateHash: prepared.delegateHash,
    reason: "scheduled_rotation",
    replacement: delegateInput(DELEGATE_2, new Date(NOW.getTime() + 1_000))
  });
  assert.equal(rotated.retired.status, HypercoreDelegateStatus.RETIRED);
  assert.equal(rotated.replacement.status, HypercoreDelegateStatus.PREPARED);
  assert.notEqual(
    rotated.retired.apiWalletAddressHash,
    rotated.replacement.apiWalletAddressHash
  );
  await assert.rejects(
    repository.rotate({
      delegateId: rotated.replacement.delegateId,
      expectedDelegateHash: rotated.replacement.delegateHash,
      reason: "unsafe_reuse_attempt",
      replacement: delegateInput(DELEGATE_1, new Date(NOW.getTime() + 2_000))
    }),
    { code: "hypercore_delegate_rotation_denied" }
  );
});

test("exact HyperCore action compiler covers only the five approved action classes", () => {
  const cases = [
    [HypercoreExecutionActionKind.ORDER, ORDER, "order"],
    [
      HypercoreExecutionActionKind.REDUCE_ONLY_ORDER,
      { ...ORDER, side: "sell", reduceOnly: true },
      "order"
    ],
    [
      HypercoreExecutionActionKind.CANCEL,
      { assetIndex: 1, orderId: 123 },
      "cancel"
    ],
    [
      HypercoreExecutionActionKind.CANCEL_BY_CLOID,
      { assetIndex: 1, cloid: ORDER.cloid },
      "cancelByCloid"
    ],
    [
      HypercoreExecutionActionKind.MODIFY,
      { orderId: 123, replacement: { ...ORDER, side: "sell", reduceOnly: true } },
      "batchModify"
    ]
  ];
  for (const [kind, action, type] of cases) {
    const prepared = compileHypercoreExecutionAction(actionInput(kind, action));
    assert.equal(prepared.hyperliquidAction.type, type);
    assert.equal(prepared.signingScheme, HypercoreSigningScheme.L1_ACTION);
    assert.equal(prepared.externalSubmissionAllowed, false);
    assert.equal(verifyHypercorePreparedAction(prepared), true);
  }

  const order = compileHypercoreExecutionAction(
    actionInput(HypercoreExecutionActionKind.ORDER, ORDER)
  ).hyperliquidAction.orders[0];
  assert.deepEqual(Object.keys(order), ["a", "b", "p", "s", "r", "t", "c"]);
  assert.deepEqual(Object.keys(order.t.limit), ["tif"]);

  for (const kind of [
    "withdraw3",
    "usdSend",
    "vaultTransfer",
    "approveAgent",
    "updateLeverage",
    "unknownFutureAction"
  ]) {
    assert.throws(
      () => compileHypercoreExecutionAction(actionInput(kind, {})),
      { code: "hypercore_action_denied" }
    );
  }
  assert.throws(
    () =>
      compileHypercoreExecutionAction(
        actionInput(HypercoreExecutionActionKind.ORDER, {
          ...ORDER,
          rawAction: { type: "withdraw3" }
        })
      ),
    { code: "invalid_hypercore_action" }
  );
  assert.throws(
    () =>
      compileHypercoreExecutionAction(
        actionInput(HypercoreExecutionActionKind.REDUCE_ONLY_ORDER, ORDER)
      ),
    { code: "hypercore_reduce_only_proof_mismatch" }
  );
});

test("the two signing schemes are explicit, offline and non-interchangeable", () => {
  const nowMs = NOW.getTime();
  const common = {
    actionHash: h("signing_action"),
    signerReferenceHash: h("signer"),
    canonicalAccountAddressHash: binding().canonicalAccountAddressHash,
    vaultAddressHash: binding().subaccountAddressHash,
    nonce: nowMs,
    expiresAfter: nowMs + 30_000,
    now: NOW
  };
  const l1 = createHypercoreSigningRequest({
    ...common,
    scheme: HypercoreSigningScheme.L1_ACTION,
    purpose: "venue_execution"
  });
  const user = createHypercoreSigningRequest({
    ...common,
    scheme: HypercoreSigningScheme.USER_SIGNED_ACTION,
    purpose: "delegate_lifecycle_projection"
  });
  assert.equal(l1.digestDomain, "hyperliquid_l1_action_phantom_agent");
  assert.equal(user.digestDomain, "hyperliquid_user_signed_action_eip712");
  assert.equal(l1.officialDigestComputed, false);
  assert.equal(l1.signingAllowed, false);
  assert.equal(user.signingAllowed, false);
  assert.equal(verifyHypercoreSigningRequest(l1), true);
  assert.equal(verifyHypercoreSigningRequest(user), true);
  assert.throws(
    () =>
      createHypercoreSigningRequest({
        ...common,
        scheme: HypercoreSigningScheme.L1_ACTION,
        purpose: "delegate_lifecycle_projection"
      }),
    { code: "hypercore_signing_scheme_mismatch" }
  );
  assert.throws(
    () =>
      createHypercoreSigningRequest({
        ...common,
        scheme: HypercoreSigningScheme.L1_ACTION,
        purpose: "venue_execution",
        nonce: nowMs - 2 * 24 * 60 * 60 * 1000 - 1
      }),
    { code: "hypercore_nonce_out_of_window" }
  );
});

test("Venue SPI is exact, capability-bound and refuses activation/submission locally", async () => {
  const provider = createLocalHypercoreVenueProvider({ contextEpoch: 7, now: NOW });
  assert.equal(assertVenueExecutionProvider(provider), true);
  assert.equal(verifyVenueExecutionProviderDescriptor(provider.descriptor), true);
  const registry = new VenueExecutionProviderRegistry([provider]);
  assert.deepEqual(provider.descriptor.supportedOperations, VENUE_EXECUTION_PROVIDER_OPERATIONS);

  const discoveryRequest = createVenueExecutionProviderRequest({
    descriptor: provider.descriptor,
    operationId: "venueDiscoverCapabilities",
    payload: { environment: "hyperliquid_testnet", contextEpoch: 7 },
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    now: NOW
  });
  const discovery = await invokeVenueExecutionProvider({
    registry,
    request: discoveryRequest,
    now: NOW
  });
  assert.equal(discovery.status, "succeeded");
  assert.equal(discovery.externalCallPerformed, false);
  assert.equal(discovery.capabilities.externalSubmissionAllowed, false);
  assert.equal(
    verifyVenueExecutionProviderCapabilities(discovery.capabilities, {
      descriptor: provider.descriptor,
      now: NOW
    }),
    true
  );
  assert.equal(
    verifyVenueExecutionProviderResult(discovery, {
      request: discoveryRequest,
      now: NOW
    }),
    true
  );

  assert.throws(
    () =>
      createVenueExecutionProviderRequest({
        descriptor: provider.descriptor,
        capabilities: discovery.capabilities,
        operationId: "venueSubmitExecution",
        payload: { executionId: "execution_hyperliquid002", preparedExecutionHash: h("prepared") },
        expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
        now: NOW
      }),
    { code: "venue_execution_capability_unavailable" }
  );
  assert.throws(
    () =>
      createVenueExecutionProviderRequest({
        descriptor: provider.descriptor,
        capabilities: discovery.capabilities,
        operationId: "venueReadBinding",
        payload: {
          facilityId: "trading_facility_hyperliquid002",
          accountBindingHash: h("account_binding")
        },
        expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
        now: new Date(NOW.getTime() + 6 * 60 * 1000)
      }),
    { code: "stale_venue_execution_capabilities" }
  );
});

test("conformance fixture and boundary evidence stay closed and no-funds", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("./fixtures/hypercore-venue-conformance.v1.json", import.meta.url),
      "utf8"
    )
  );
  assert.deepEqual(fixture.operations, VENUE_EXECUTION_PROVIDER_OPERATIONS);
  assert.deepEqual(fixture.signingSchemes.sort(), ["l1_action", "user_signed_action"]);
  assert.equal(fixture.deniedActionClasses.includes("withdraw3"), true);
  assert.equal(fixture.deniedActionClasses.includes("approveAgent"), true);
  for (const boundary of [
    describeVenueExecutionProviderBoundary(),
    describeHypercoreDelegateBoundary(),
    describeHypercoreSigningBoundary(),
    describeHypercoreVenueAdapterBoundary()
  ]) {
    assert.equal(boundary.mainnetAuthority, false);
    assert.equal(boundary.productionAuthority, false);
    assert.equal(boundary.fundsAuthority, false);
  }
});

test("new HyperCore projection records validate against closed JSON Schemas", async () => {
  const accountBinding = binding();
  const delegate = await new InMemoryHypercoreDelegateRepository().prepare(
    delegateInput()
  );
  const terminated = await new InMemoryHypercoreDelegateRepository({
    records: [delegate],
    tombstones: []
  }).terminate({
    delegateId: delegate.delegateId,
    expectedDelegateHash: delegate.delegateHash,
    status: HypercoreDelegateStatus.REVOKED,
    reason: "operator_request",
    now: new Date(NOW.getTime() + 1_000)
  });
  const tombstone = createHypercoreDelegateTombstone({ delegate: terminated });
  const preparedAction = compileHypercoreExecutionAction(
    actionInput(HypercoreExecutionActionKind.ORDER, ORDER)
  );
  const signingRequest = createHypercoreSigningRequest({
    scheme: HypercoreSigningScheme.L1_ACTION,
    purpose: "venue_execution",
    actionHash: preparedAction.preparedActionHash,
    signerReferenceHash: delegate.signerReferenceHash,
    canonicalAccountAddressHash: accountBinding.canonicalAccountAddressHash,
    vaultAddressHash: accountBinding.subaccountAddressHash,
    nonce: NOW.getTime(),
    expiresAfter: NOW.getTime() + 30_000,
    now: NOW
  });
  const fixtures = [
    ["hypercore-account-binding", accountBinding],
    ["hypercore-api-wallet-delegate", delegate],
    ["hypercore-delegate-tombstone", tombstone],
    ["hypercore-prepared-action", preparedAction],
    ["hypercore-signing-request", signingRequest]
  ];
  for (const [name, value] of fixtures) {
    const validate = await schemaValidator(name);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
});

test("existing execution receipt composes into fresh hash-only HyperCore Evidence", async () => {
  const accountBinding = binding();
  const delegateRepository = new InMemoryHypercoreDelegateRepository();
  const preparedDelegate = await delegateRepository.prepare(delegateInput());
  const delegate = await delegateRepository.simulateActivation({
    delegateId: preparedDelegate.delegateId,
    expectedDelegateHash: preparedDelegate.delegateHash,
    now: new Date(NOW.getTime() + 1_000)
  });
  let clockValue = NOW.getTime() + 2_000;
  const gateway = new HyperliquidTestnetExecutionGateway({
    repository: new InMemoryHyperliquidExecutionRepository(),
    bindingResolver: {
      async resolve({ facilityId, facilityHash }) {
        return {
          facilityId,
          facilityHash,
          accountBindingHash: accountBinding.accountBindingHash,
          signerReferenceHash: delegate.signerReferenceHash,
          simulationOnly: true,
          liveSignerAvailable: false,
          apiWalletApproved: false,
          keyExportable: false
        };
      }
    },
    policyEvaluator: {
      async evaluate(input) {
        return {
          approved: true,
          policyDecisionHash: h("execution_policy"),
          actionKind: input.actionKind,
          serverReduceOnlyProven: false,
          killSwitchOpen: true,
          simulationOnly: true
        };
      }
    },
    signer: new SimulatedIsolatedHyperliquidSigner(),
    transport: new SimulatedHyperliquidExchangeTransport(),
    clock: () => clockValue++
  });
  const execution = await gateway.execute({
    facilityId: accountBinding.facilityId,
    facilityHash: accountBinding.facilityHash,
    facilityVersion: 4,
    orderIntentId: "trading_order_intent_hyperliquid002",
    orderIntentHash: h("order_intent"),
    orderIntentVersion: 2,
    idempotencyKey: "hyperliquid002-execution-idempotency",
    action: {
      kind: "order",
      assetIndex: 1,
      side: "buy",
      limitPx: "2500.25",
      size: "0.01",
      timeInForce: "Gtc"
    }
  });
  const observedAt = new Date(clockValue + 1_000);
  const evidence = createHypercoreExecutionEvidence({
    binding: accountBinding,
    delegate,
    accountSnapshotHash: h("account_snapshot"),
    riskSnapshotHash: h("risk_snapshot"),
    riskObservedAt: new Date(observedAt.getTime() - 1_000),
    riskExpiresAt: new Date(observedAt.getTime() + 10_000),
    executionRecord: execution,
    reconciliationRecordHash: h("reconciliation"),
    reconciliationStatus: "pending",
    observedAt
  });
  assert.equal(execution.nonceState, "CONFIRMED");
  assert.equal(evidence.externalOrderSubmitted, false);
  assert.equal(evidence.canonicalLedgerMutationAllowed, false);
  assert.equal(evidence.accountIdentityIsSigner, false);
  assert.equal(verifyHypercoreExecutionEvidence(evidence), true);
  const validate = await schemaValidator("hypercore-execution-evidence");
  assert.equal(validate(evidence), true, JSON.stringify(validate.errors));

  assert.throws(
    () =>
      createHypercoreExecutionEvidence({
        binding: accountBinding,
        delegate,
        accountSnapshotHash: h("account_snapshot"),
        riskSnapshotHash: h("risk_snapshot"),
        riskObservedAt: new Date(observedAt.getTime() - 31_000),
        riskExpiresAt: new Date(observedAt.getTime() + 10_000),
        executionRecord: execution,
        reconciliationRecordHash: h("reconciliation"),
        reconciliationStatus: "pending",
        observedAt
      }),
    { code: "hypercore_prepared_work_quarantined" }
  );
});
