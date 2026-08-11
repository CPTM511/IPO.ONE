import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  AGENTIC_WALLET_PROVIDER_OPERATIONS,
  AgenticWalletProviderRegistry,
  assertAgenticWalletProvider,
  compileExternalWalletPermissionProjection,
  constructExactEvmPayload,
  createAgenticWalletProviderCapabilities,
  createAgenticWalletProviderDescriptor,
  createAgenticWalletProviderRequest,
  createAgenticWalletProviderResult,
  createDisabledLocalAgenticWalletProvider,
  createExecutionTargetPolicy,
  describeAgenticWalletProviderBoundary,
  invokeAgenticWalletProvider,
  normalizeExecutionEffects,
  runAgenticWalletProviderConformance,
  verifyAgenticWalletProviderCapabilities,
  verifyAgenticWalletProviderDescriptor,
  verifyAgenticWalletProviderRequest,
  verifyAgenticWalletProviderResult,
  verifyExternalWalletPermissionProjection
} from "../src/index.js";

const NOW = new Date("2026-08-07T08:00:00.000Z");
const CHAIN_ID = "eip155:84532";
const ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";
const TARGET = "0x1111111111111111111111111111111111111111";
const SELECTOR = "0x12345678";
const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;

function h(scope, value = true) {
  return hashId(`agentwallet001_test_${scope}`, { value });
}

function activeGrant(targetPolicy) {
  const core = {
    subjectId: "subject_agentwallet001",
    principalId: "principal_agentwallet001",
    accountBindingId: "account_binding_agentwallet001",
    executionDomain: "evm",
    adapterId: "local_sandbox",
    mandateId: "mandate_agentwallet001",
    mandateHash: h("mandate"),
    spendPolicyId: "spend_policy_agentwallet001",
    spendPolicyHash: h("spend_policy"),
    creditLineId: "credit_line_agentwallet001",
    creditLineHash: h("credit_line"),
    obligationId: "obligation_agentwallet001",
    obligationHash: h("obligation"),
    authorizationDecisionId: "authorization_agentwallet001",
    authorizationHash: h("authorization"),
    sessionSignerRefHash: h("session_signer"),
    providerId: "provider_agentwallet001",
    chainIds: [CHAIN_ID],
    assetIds: [ASSET_ID],
    allowedTargetPolicyIds: [targetPolicy.targetPolicyId],
    perTxLimitMinor: "5000",
    rolling24hLimitMinor: "10000",
    aggregateLimitMinor: "15000",
    obligationLimitMinor: "8000",
    validFrom: new Date(NOW.getTime() - 60_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    sessionEpoch: 7,
    nonce: "agentwallet001-grant-nonce",
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    transactionsAllowed: false,
    schemaVersion: "delegated_wallet_grant.v1"
  };
  const grantHash = hashId("delegated_wallet_grant", core);
  return Object.freeze({
    grantId: `delegated_wallet_grant_${grantHash.slice(2)}`,
    grantHash,
    ...core,
    externalPermissionRefHash: h("local_permission"),
    externalPolicyHash: h("local_policy"),
    status: "active",
    pendingExposureMinor: "0",
    version: 2,
    createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    updatedAt: new Date(NOW.getTime() - 30_000).toISOString()
  });
}

function preparedExecution(grant, targetPolicy) {
  const payload = constructExactEvmPayload({
    chainId: CHAIN_ID,
    accountRefHash: h("account"),
    targetAddress: TARGET,
    calldata: SELECTOR,
    nativeValueMinor: "0"
  });
  const expectedEffects = normalizeExecutionEffects({
    nativeDeltaMinor: "0",
    assetDeltas: [{ assetId: ASSET_ID, accountRefHash: h("asset_account"), deltaMinor: "-1000" }],
    allowanceDeltas: [],
    withdrawal: false,
    transfer: false
  });
  const core = {
    subjectId: grant.subjectId,
    principalId: grant.principalId,
    accountBindingId: grant.accountBindingId,
    obligationId: grant.obligationId,
    transferIntentId: "transfer_intent_agentwallet001",
    grantId: grant.grantId,
    grantHash: grant.grantHash,
    targetPolicyId: targetPolicy.targetPolicyId,
    targetPolicyHash: targetPolicy.policyHash,
    authorizationDecisionId: "authorization_execution_agentwallet001",
    authorizationHash: h("execution_authorization"),
    reservationId: "reservation_agentwallet001",
    reservationHash: h("reservation"),
    sessionEpoch: grant.sessionEpoch,
    payload,
    expectedEffects,
    stepUpRequired: false,
    validFrom: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 110_000).toISOString(),
    transactionsAllowed: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "prepared_execution.v1"
  };
  const preparedExecutionHash = hashId("prepared_execution", core);
  return Object.freeze({
    executionId: `wallet_execution_${preparedExecutionHash.slice(2)}`,
    preparedExecutionHash,
    ...core,
    createdAt: NOW.toISOString()
  });
}

function preflightReceipt(execution, grant, decision = "ALLOW") {
  const core = {
    executionId: execution.executionId,
    preparedExecutionHash: execution.preparedExecutionHash,
    authorizationHash: execution.authorizationHash,
    grantId: grant.grantId,
    grantHash: grant.grantHash,
    exactPayloadHash: execution.payload.exactPayloadHash,
    targetSnapshot: { targetPolicyHash: execution.targetPolicyHash },
    simulationSnapshot: { simulationReportHash: h("simulation") },
    expectedEffectsHash: execution.expectedEffects.effectsHash,
    simulatedEffectsHash: execution.expectedEffects.effectsHash,
    allowanceDeltaHash: h("allowances"),
    assetDeltaHash: h("assets"),
    riskChecksHash: h("risk"),
    reservationHash: execution.reservationHash,
    decision,
    reasonCodes: [decision === "STEP_UP" ? "exact_human_approval_required" : "preflight_passed"],
    createdAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 100_000).toISOString(),
    transactionsAllowed: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "transaction_preflight_receipt.v1"
  };
  const preflightHash = hashId("transaction_preflight_receipt", core);
  return Object.freeze({
    preflightReceiptId: `transaction_preflight_receipt_${preflightHash.slice(2)}`,
    preflightHash,
    ...core
  });
}

function support(status = "supported") {
  return Object.fromEntries(AGENTIC_WALLET_PROVIDER_OPERATIONS.map((operationId) => [operationId, status]));
}

function fixture() {
  const descriptor = createAgenticWalletProviderDescriptor({
    adapterId: "local_sandbox",
    providerFamily: "conformance_reference",
    adapterVersion: "1.0.0",
    enabled: true,
    externalCallsEnabled: true
  });
  const capabilities = createAgenticWalletProviderCapabilities({
    descriptor,
    chainId: CHAIN_ID,
    contextEpoch: 7,
    operationSupport: support(),
    permissionModel: "erc7715",
    executionTransport: "wallet_rpc",
    providerSimulation: "supported",
    providerThreatScreening: "supported",
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  const targetPolicy = createExecutionTargetPolicy({
    providerId: "provider_agentwallet001",
    chainId: CHAIN_ID,
    targetAddress: TARGET,
    codeHash: h("target_code"),
    allowedFunctionSelectors: [SELECTOR],
    validFrom: new Date(NOW.getTime() - 60_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    now: NOW
  });
  const grant = activeGrant(targetPolicy);
  const permissionProjection = compileExternalWalletPermissionProjection({
    grant,
    targetPolicies: [targetPolicy],
    descriptor,
    capabilities,
    narrowing: {
      chainIds: grant.chainIds,
      assetIds: grant.assetIds,
      targetPolicyIds: grant.allowedTargetPolicyIds,
      perTxLimitMinor: "4000",
      rolling24hLimitMinor: "9000",
      aggregateLimitMinor: "12000",
      obligationLimitMinor: "7000",
      expiresAt: new Date(NOW.getTime() + 240_000).toISOString()
    },
    now: NOW
  });
  const execution = preparedExecution(grant, targetPolicy);
  const allowReceipt = preflightReceipt(execution, grant);
  const stepUpReceipt = preflightReceipt(execution, grant, "STEP_UP");
  return { descriptor, capabilities, targetPolicy, grant, permissionProjection, execution, allowReceipt, stepUpReceipt };
}

function request(state, operationId, payload, seconds = 60) {
  return createAgenticWalletProviderRequest({
    descriptor: state.descriptor,
    capabilities: operationId === "walletDiscoverCapabilities" ? null : state.capabilities,
    operationId,
    payload,
    expiresAt: new Date(NOW.getTime() + seconds * 1000).toISOString(),
    now: NOW
  });
}

function conformanceRequests(state) {
  const grantPayload = { grant: state.grant, permissionProjection: state.permissionProjection };
  return [
    request(state, "walletDiscoverCapabilities", {
      chainId: CHAIN_ID, accountRefHash: h("discovery_account"), contextEpoch: 7
    }),
    request(state, "walletPrepareGrant", grantPayload),
    request(state, "walletActivateGrant", grantPayload),
    request(state, "walletReadGrant", grantPayload),
    request(state, "walletRevokeGrant", grantPayload),
    request(state, "walletPrepareExecution", {
      preparedExecution: state.execution, preflightReceipt: state.allowReceipt
    }),
    request(state, "walletApproveExecution", {
      preparedExecution: state.execution,
      preflightReceipt: state.stepUpReceipt,
      approvalRequestHash: h("approval_request")
    }),
    request(state, "walletSubmitExecution", {
      preparedExecution: state.execution, preflightReceipt: state.allowReceipt
    }),
    request(state, "walletReadExecution", {
      executionId: state.execution.executionId,
      preparedExecutionHash: state.execution.preparedExecutionHash,
      externalExecutionRefHash: h("external_execution")
    })
  ];
}

function conformanceProvider(state, calls) {
  const handler = async (providerRequest) => {
    calls.push(providerRequest.operationId);
    return createAgenticWalletProviderResult({
      request: providerRequest,
      status: "succeeded",
      reasonCodes: ["conformance_fixture_passed"],
      externalState: "normalized",
      externalCallPerformed: false,
      capabilities: providerRequest.operationId === "walletDiscoverCapabilities" ? state.capabilities : null,
      observedAt: NOW
    });
  };
  return Object.freeze({
    descriptor: state.descriptor,
    discoverCapabilities: handler,
    prepareGrant: handler,
    activateGrant: handler,
    readGrant: handler,
    revokeGrant: handler,
    preflight: handler,
    submit: handler,
    readExecution: handler,
    requestHumanStepUp: handler
  });
}

test("AGENTWALLET-001 descriptor and capabilities are exact, hash-bound, and non-authorizing", () => {
  const state = fixture();
  assert.equal(verifyAgenticWalletProviderDescriptor(state.descriptor), true);
  assert.equal(verifyAgenticWalletProviderCapabilities(state.capabilities, {
    descriptor: state.descriptor, now: NOW
  }), true);
  assert.deepEqual(state.descriptor.supportedOperations, AGENTIC_WALLET_PROVIDER_OPERATIONS);
  assert.equal(state.capabilities.unknownIsNonPermissive, true);
  assert.equal(state.capabilities.authorizationGranted, false);
  assert.equal(state.capabilities.fundsAuthority, false);
  assert.throws(
    () => createAgenticWalletProviderDescriptor({
      adapterId: "bad", providerFamily: "bad", adapterVersion: "1.0.0",
      enabled: false, externalCallsEnabled: true
    }),
    { code: "invalid_agentic_wallet_provider_descriptor" }
  );
  assert.throws(
    () => createAgenticWalletProviderCapabilities({
      descriptor: state.descriptor, chainId: CHAIN_ID, contextEpoch: 7,
      operationSupport: support(), permissionModel: "erc7715",
      executionTransport: "wallet_rpc", providerSimulation: "supported",
      providerThreatScreening: "supported", observedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
      callerPermission: "widen"
    }),
    { code: "invalid_agentic_wallet_provider_input" }
  );
});

test("AGENTWALLET-001 permission projection can narrow but never widen canonical authority", () => {
  const state = fixture();
  assert.equal(verifyExternalWalletPermissionProjection(state.permissionProjection, { now: NOW }), true);
  assert.equal(state.permissionProjection.perTxLimitMinor, "4000");
  assert.equal(state.permissionProjection.activationAllowed, false);
  assert.equal(state.permissionProjection.externalProvisioningPerformed, false);
  const forgedCore = structuredClone(state.permissionProjection);
  delete forgedCore.permissionProjectionId;
  delete forgedCore.permissionProjectionHash;
  forgedCore.transferAllowed = true;
  const forgedHash = hashId("external_wallet_permission_projection", forgedCore);
  const forged = {
    permissionProjectionId: `external_wallet_permission_${forgedHash.slice(2)}`,
    permissionProjectionHash: forgedHash,
    ...forgedCore
  };
  assert.throws(
    () => verifyExternalWalletPermissionProjection(forged, { now: NOW }),
    { code: "invalid_external_wallet_permission_projection" }
  );
  assert.throws(
    () => compileExternalWalletPermissionProjection({
      grant: state.grant,
      targetPolicies: [state.targetPolicy],
      descriptor: state.descriptor,
      capabilities: state.capabilities,
      narrowing: {
        chainIds: state.grant.chainIds, assetIds: state.grant.assetIds,
        targetPolicyIds: state.grant.allowedTargetPolicyIds,
        perTxLimitMinor: "5001", rolling24hLimitMinor: "9000",
        aggregateLimitMinor: "12000", obligationLimitMinor: "7000",
        expiresAt: new Date(NOW.getTime() + 240_000).toISOString()
      },
      now: NOW
    }),
    { code: "agentic_wallet_permission_widened" }
  );
});

test("AGENTWALLET-001 unknown capability and capability drift fail closed", () => {
  const state = fixture();
  const unknown = createAgenticWalletProviderCapabilities({
    descriptor: state.descriptor,
    chainId: CHAIN_ID,
    contextEpoch: 7,
    operationSupport: { ...support(), walletPrepareGrant: "unknown" },
    permissionModel: "unknown",
    executionTransport: "unknown",
    providerSimulation: "unknown",
    providerThreatScreening: "unknown",
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  assert.throws(
    () => createAgenticWalletProviderRequest({
      descriptor: state.descriptor,
      capabilities: unknown,
      operationId: "walletPrepareGrant",
      payload: { grant: state.grant, permissionProjection: state.permissionProjection },
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      now: NOW
    }),
    { code: "agentic_wallet_provider_capability_unavailable" }
  );
  const driftedDescriptor = { ...state.descriptor, providerFamily: "changed" };
  assert.throws(
    () => verifyAgenticWalletProviderCapabilities(state.capabilities, {
      descriptor: driftedDescriptor, now: NOW
    }),
    { code: "invalid_agentic_wallet_provider_descriptor" }
  );
});

test("AGENTWALLET-001 request rejects open shapes, stale context, and alternate execution binding", () => {
  const state = fixture();
  assert.throws(
    () => request(state, "walletDiscoverCapabilities", {
      chainId: CHAIN_ID, accountRefHash: h("account"), contextEpoch: 7,
      rawProviderRequest: { method: "eth_sendTransaction" }
    }),
    { code: "invalid_agentic_wallet_provider_input" }
  );
  const discovery = request(state, "walletDiscoverCapabilities", {
    chainId: CHAIN_ID, accountRefHash: h("account"), contextEpoch: 7
  }, 30);
  assert.throws(
    () => verifyAgenticWalletProviderRequest(discovery, {
      now: new Date(NOW.getTime() + 30_000)
    }),
    { code: "stale_agentic_wallet_provider_request" }
  );
  assert.throws(
    () => request(state, "walletSubmitExecution", {
      preparedExecution: state.execution,
      preflightReceipt: { ...state.allowReceipt, preparedExecutionHash: h("alternate") }
    }),
    { code: "invalid_transaction_preflight_receipt" }
  );
});

test("AGENTWALLET-001 static registry rejects extra SPI, duplicate, unregistered, and disabled adapters", async () => {
  const disabled = createDisabledLocalAgenticWalletProvider({ now: NOW });
  assert.equal(assertAgenticWalletProvider(disabled), true);
  assert.throws(
    () => assertAgenticWalletProvider({ ...disabled, dynamicLoad: async () => {} }),
    { code: "invalid_agentic_wallet_provider_input" }
  );
  assert.throws(
    () => new AgenticWalletProviderRegistry([disabled, disabled]),
    { code: "duplicate_agentic_wallet_provider" }
  );
  const registry = new AgenticWalletProviderRegistry([disabled]);
  assert.equal(registry.listDescriptors().length, 1);
  assert.throws(
    () => registry.requireEnabled("missing_adapter"),
    { code: "agentic_wallet_provider_unregistered" }
  );
  const discovery = createAgenticWalletProviderRequest({
    descriptor: disabled.descriptor,
    operationId: "walletDiscoverCapabilities",
    payload: { chainId: CHAIN_ID, accountRefHash: h("disabled_account"), contextEpoch: 0 },
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    now: NOW
  });
  await assert.rejects(
    invokeAgenticWalletProvider({ registry, request: discovery, now: NOW }),
    { code: "agentic_wallet_provider_disabled_l0_local_no_funds" }
  );
  const result = await disabled.discoverCapabilities(discovery);
  assert.equal(result.status, "unavailable");
  assert.equal(result.externalCallPerformed, false);
  assert.equal(result.capabilities.permissionModel, "none");
});

test("AGENTWALLET-001 conformance covers the exact nine methods without input mutation", async () => {
  const state = fixture();
  const calls = [];
  const provider = conformanceProvider(state, calls);
  const evidence = await runAgenticWalletProviderConformance({
    provider,
    requests: conformanceRequests(state),
    capabilities: state.capabilities,
    now: NOW
  });
  assert.deepEqual([...calls].sort(), [...AGENTIC_WALLET_PROVIDER_OPERATIONS].sort());
  assert.deepEqual(evidence.operationIds, [...AGENTIC_WALLET_PROVIDER_OPERATIONS].sort());
  assert.equal(evidence.externalCallCount, 0);
  assert.equal(evidence.rawProviderResponsesRetained, false);
  assert.equal(evidence.canonicalMutationAllowed, false);
  assert.equal(evidence.fundsAuthority, false);
});

test("AGENTWALLET-001 result cannot invent external calls or bind to another request", () => {
  const state = fixture();
  const first = request(state, "walletReadExecution", {
    executionId: state.execution.executionId,
    preparedExecutionHash: state.execution.preparedExecutionHash,
    externalExecutionRefHash: h("external_one")
  });
  const second = request(state, "walletReadExecution", {
    executionId: state.execution.executionId,
    preparedExecutionHash: state.execution.preparedExecutionHash,
    externalExecutionRefHash: h("external_two")
  });
  const result = createAgenticWalletProviderResult({
    request: first,
    status: "succeeded",
    reasonCodes: ["read_normalized"],
    externalState: "read",
    externalCallPerformed: false,
    observedAt: NOW
  });
  assert.equal(verifyAgenticWalletProviderResult(result, { request: first, now: NOW }), true);
  assert.throws(
    () => verifyAgenticWalletProviderResult(result, { request: second, now: NOW }),
    { code: "agentic_wallet_provider_result_binding_mismatch" }
  );
  const disabled = createDisabledLocalAgenticWalletProvider({ now: NOW });
  const disabledRequest = createAgenticWalletProviderRequest({
    descriptor: disabled.descriptor,
    operationId: "walletDiscoverCapabilities",
    payload: { chainId: CHAIN_ID, accountRefHash: h("disabled"), contextEpoch: 0 },
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    now: NOW
  });
  assert.throws(
    () => createAgenticWalletProviderResult({
      request: disabledRequest,
      status: "unknown",
      reasonCodes: ["provider_outcome_unknown"],
      externalState: "unknown",
      externalReferenceHash: h("external"),
      externalCallPerformed: true,
      capabilities: result.capabilities,
      observedAt: NOW
    }),
    { code: "invalid_agentic_wallet_provider_result" }
  );
});

test("AGENTWALLET-001 boundary grants no vendor, transaction, production, or funds authority", () => {
  assert.deepEqual(describeAgenticWalletProviderBoundary(), {
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    vendorAdaptersImplemented: false,
    externalProviderCallsEnabled: false,
    externalPermissionProvisioningEnabled: false,
    signaturesEnabled: false,
    transactionSubmissionEnabled: false,
    dynamicLoadingEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
});

test("AGENTWALLET-001 runtime objects satisfy all five closed JSON Schemas", async () => {
  const names = [
    "agentic-wallet-provider-descriptor",
    "agentic-wallet-provider-capabilities",
    "external-wallet-permission-projection",
    "agentic-wallet-provider-request",
    "agentic-wallet-provider-result"
  ];
  const dependencyNames = [
    "delegated-wallet-grant",
    "prepared-execution",
    "transaction-preflight-receipt"
  ];
  const schemas = Object.fromEntries(await Promise.all([...names, ...dependencyNames].map(async (name) => [
    name,
    JSON.parse(await readFile(new URL(`../../../schemas/v2/${name}.schema.json`, import.meta.url), "utf8"))
  ])));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat("date-time", {
    type: "string",
    validate(value) {
      const parsed = new Date(value);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
    }
  });
  ajv.addSchema(schemas["agentic-wallet-provider-capabilities"]);
  for (const name of dependencyNames) ajv.addSchema(schemas[name]);
  const validators = Object.fromEntries(names.map((name) => [name, ajv.compile(schemas[name])]));
  const state = fixture();
  const discoveryRequest = conformanceRequests(state)[0];
  const discoveryResult = createAgenticWalletProviderResult({
    request: discoveryRequest,
    status: "succeeded",
    reasonCodes: ["capabilities_discovered"],
    externalState: "normalized",
    externalCallPerformed: false,
    capabilities: state.capabilities,
    observedAt: NOW
  });
  const fixtures = {
    "agentic-wallet-provider-descriptor": state.descriptor,
    "agentic-wallet-provider-capabilities": state.capabilities,
    "external-wallet-permission-projection": state.permissionProjection,
    "agentic-wallet-provider-request": discoveryRequest,
    "agentic-wallet-provider-result": discoveryResult
  };
  for (const name of names) {
    assert.equal(validators[name](fixtures[name]), true, JSON.stringify(validators[name].errors));
  }
});
