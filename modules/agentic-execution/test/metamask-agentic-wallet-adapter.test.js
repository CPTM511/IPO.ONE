import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  AgenticWalletProviderRegistry,
  assertAgenticWalletProvider,
  compareMetaMaskAdvancedPermissionResponse,
  createAgenticWalletProviderRequest,
  createDisabledMetaMaskAgenticWalletProvider,
  createMetaMaskAgentWalletSecurityReceipt,
  createMetaMaskCapabilityObservation,
  describeMetaMaskAgenticWalletBoundary,
  invokeAgenticWalletProvider,
  normalizeMetaMaskAgenticWalletCapabilities,
  prepareMetaMaskAdvancedPermissionProjection,
  verifyMetaMaskAdvancedPermissionProjection,
  verifyMetaMaskAgentWalletSecurityReceipt,
  verifyMetaMaskCapabilityObservation
} from "../src/index.js";

const NOW = new Date("2026-08-07T10:00:00.000Z");
const CHAIN_ID = "eip155:84532";
const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;

function h(scope, value = true) {
  return hashId(`metamask_agent_001_test_${scope}`, { value });
}

function supportedMethods(status = "supported") {
  return {
    wallet_getSupportedExecutionPermissions: status,
    wallet_requestExecutionPermissions: status,
    wallet_getGrantedExecutionPermissions: status,
    wallet_revokeExecutionPermission: status
  };
}

function state({ methodStatus = "supported" } = {}) {
  const provider = createDisabledMetaMaskAgenticWalletProvider({ chainId: CHAIN_ID, contextEpoch: 11, now: NOW });
  const descriptor = provider.descriptor;
  const observation = createMetaMaskCapabilityObservation({
    descriptor,
    chainId: CHAIN_ID,
    contextEpoch: 11,
    rpcMethodSupport: supportedMethods(methodStatus),
    permissionTypes: [
      { type: "erc20-token-periodic", chainIds: ["0x14a34"], ruleTypes: ["expiry"] },
      { type: "ipo-one-exact-call-v1", chainIds: ["0x14a34"], ruleTypes: ["expiry"] }
    ],
    agentWalletSecurity: {
      simulation: methodStatus,
      threatScanning: methodStatus,
      asyncApproval: methodStatus
    },
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  const capabilities = normalizeMetaMaskAgenticWalletCapabilities({ descriptor, observation, now: NOW });
  const core = {
    grantId: "delegated_wallet_grant_metamask001",
    grantHash: h("grant"),
    adapterId: "metamask_agent_wallet_reference",
    providerId: "provider_metamask001",
    descriptorHash: descriptor.descriptorHash,
    capabilitiesHash: capabilities.capabilitiesHash,
    sessionEpoch: 11,
    chainIds: [CHAIN_ID],
    assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
    targetPolicies: [{
      targetPolicyId: "target_policy_metamask001",
      policyHash: h("target_policy"),
      chainId: CHAIN_ID,
      targetAddress: "0x1111111111111111111111111111111111111111",
      codeHash: h("code"),
      proxyImplementationHash: null,
      allowedFunctionSelectors: ["0x12345678"],
      maxNativeValueMinor: "0",
      maxTokenAllowanceMinor: "0",
      approvalMode: "none",
      withdrawalAllowed: false,
      transferAllowed: false
    }],
    perTxLimitMinor: "4000",
    rolling24hLimitMinor: "9000",
    aggregateLimitMinor: "12000",
    obligationLimitMinor: "7000",
    validFrom: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 180_000).toISOString(),
    status: "prepared",
    externalPermissionRefHash: null,
    activationAllowed: false,
    externalProvisioningPerformed: false,
    withdrawalAllowed: false,
    transferAllowed: false,
    transactionsAllowed: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "external_wallet_permission_projection.v1"
  };
  const permissionProjectionHash = hashId("external_wallet_permission_projection", core);
  const permissionProjection = Object.freeze({
    permissionProjectionId: `external_wallet_permission_${permissionProjectionHash.slice(2)}`,
    permissionProjectionHash,
    ...core
  });
  return { provider, descriptor, observation, capabilities, permissionProjection };
}

function prepare(current, requestedPermissionType = "ipo-one-exact-call-v1") {
  return prepareMetaMaskAdvancedPermissionProjection({
    descriptor: current.descriptor,
    capabilities: current.capabilities,
    observation: current.observation,
    permissionProjection: current.permissionProjection,
    requestedPermissionType,
    accountRefHash: h("account"),
    sessionAccountRefHash: h("session_account"),
    now: NOW
  });
}

function exactResponse(projection) {
  return {
    chainIdHex: projection.chainIdHex,
    permissionType: projection.requestedPermissionType,
    permissionDataHash: projection.permissionDataHash,
    accountRefHash: projection.accountRefHash,
    sessionAccountRefHash: projection.sessionAccountRefHash,
    expiryTimestamp: projection.expiryTimestamp,
    isAdjustmentAllowed: false,
    externalPermissionRefHash: h("external_permission"),
    dependenciesHash: h("dependencies")
  };
}

function security(current, overrides = {}, now = NOW) {
  return createMetaMaskAgentWalletSecurityReceipt({
    descriptor: current.descriptor,
    capabilities: current.capabilities,
    observation: current.observation,
    preparedExecutionHash: h("prepared_execution"),
    preflightHash: h("preflight"),
    simulationStatus: "passed",
    threatStatus: "safe",
    approvalStatus: "approved",
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    now,
    ...overrides
  });
}

test("METAMASK-AGENT-001 capability observation is exact, short-lived, and non-authorizing", () => {
  const current = state();
  assert.equal(verifyMetaMaskCapabilityObservation(current.observation, {
    descriptor: current.descriptor, now: NOW
  }), true);
  assert.equal(current.observation.chainIdHex, "0x14a34");
  assert.equal(current.observation.externalCallPerformed, false);
  assert.equal(current.capabilities.permissionModel, "erc7715");
  assert.equal(current.capabilities.operationSupport.walletSubmitExecution, "unsupported");
  assert.equal(current.capabilities.authorizationGranted, false);
  const xLayerProvider = createDisabledMetaMaskAgenticWalletProvider({
    chainId: "eip155:1952", contextEpoch: 1, now: NOW
  });
  const xLayer = createMetaMaskCapabilityObservation({
    descriptor: xLayerProvider.descriptor,
    chainId: "eip155:1952",
    contextEpoch: 1,
    rpcMethodSupport: supportedMethods("unknown"),
    permissionTypes: [],
    agentWalletSecurity: { simulation: "unknown", threatScanning: "unknown", asyncApproval: "unknown" },
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  assert.equal(xLayer.chainIdHex, "0x7a0");
  assert.throws(
    () => createMetaMaskCapabilityObservation({
      descriptor: current.descriptor,
      chainId: "eip155:1",
      contextEpoch: 11,
      rpcMethodSupport: supportedMethods(),
      permissionTypes: [],
      agentWalletSecurity: { simulation: "supported", threatScanning: "supported", asyncApproval: "supported" },
      observedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
    }),
    { code: "invalid_metamask_capability_observation" }
  );
});

test("METAMASK-AGENT-001 unknown capability remains non-permissive", () => {
  const current = state({ methodStatus: "unknown" });
  assert.equal(current.capabilities.operationSupport.walletPrepareGrant, "unknown");
  assert.equal(current.capabilities.executionTransport, "unknown");
  assert.equal(current.capabilities.providerSimulation, "unknown");
  assert.throws(
    () => verifyMetaMaskCapabilityObservation(current.observation, {
      descriptor: current.descriptor,
      now: new Date(NOW.getTime() + 300_000)
    }),
    { code: "stale_metamask_capability_observation" }
  );
});

test("METAMASK-AGENT-001 current allowance-style Advanced Permissions are denied by canonical policy", () => {
  const projection = prepare(state(), "erc20-token-periodic");
  assert.equal(projection.decision, "DENY");
  assert.deepEqual(projection.reasonCodes, ["canonical_policy_forbids_allowance_permission"]);
  assert.equal(projection.isAdjustmentAllowed, false);
  assert.equal(projection.providerProvisioningReady, false);
  assert.equal(projection.externalCallAllowed, false);
});

test("METAMASK-AGENT-001 local exact-call fixture prepares only a non-executable STEP_UP projection", () => {
  const projection = prepare(state());
  assert.equal(verifyMetaMaskAdvancedPermissionProjection(projection, { now: NOW }), true);
  assert.equal(projection.decision, "STEP_UP");
  assert.equal(projection.chainIdHex, "0x14a34");
  assert.equal(projection.isAdjustmentAllowed, false);
  assert.equal(projection.activationAllowed, false);
  assert.equal(projection.externalProvisioningPerformed, false);
  assert.equal(projection.transactionsAllowed, false);
});

test("METAMASK-AGENT-001 exact response remains STEP_UP while any changed authority is quarantined", () => {
  const projection = prepare(state());
  const exact = compareMetaMaskAdvancedPermissionResponse({
    preparedProjection: projection, response: exactResponse(projection), now: NOW
  });
  assert.equal(exact.decision, "STEP_UP");
  assert.equal(exact.activationAllowed, false);
  const widened = compareMetaMaskAdvancedPermissionResponse({
    preparedProjection: projection,
    response: { ...exactResponse(projection), isAdjustmentAllowed: true },
    now: NOW
  });
  assert.equal(widened.decision, "QUARANTINE");
  assert.deepEqual(widened.reasonCodes, ["provider_response_widened_or_changed"]);
  const denied = prepare(state(), "erc20-token-periodic");
  const unexpected = compareMetaMaskAdvancedPermissionResponse({
    preparedProjection: denied, response: exactResponse(denied), now: NOW
  });
  assert.equal(unexpected.decision, "QUARANTINE");
  assert.deepEqual(unexpected.reasonCodes, ["response_for_denied_permission"]);
});

test("METAMASK-AGENT-001 security normalization covers ALLOW, STEP_UP, DENY, and QUARANTINE", () => {
  const current = state();
  const allow = security(current);
  assert.equal(verifyMetaMaskAgentWalletSecurityReceipt(allow, { now: NOW }), true);
  assert.equal(allow.decision, "ALLOW");
  assert.equal(security(current, { approvalStatus: "awaiting_mfa" }).decision, "STEP_UP");
  assert.equal(security(current, { simulationStatus: "failed" }).decision, "DENY");
  assert.equal(security(current, { threatStatus: "malicious" }).decision, "QUARANTINE");
  assert.throws(
    () => security(current, {}, new Date(NOW.getTime() + 60_000)),
    { code: "stale_metamask_security_receipt" }
  );
  assert.equal(allow.submissionAllowed, false);
});

test("METAMASK-AGENT-001 closed contracts reject raw Provider escape hatches", () => {
  const current = state();
  assert.throws(
    () => createMetaMaskCapabilityObservation({
      descriptor: current.descriptor,
      chainId: CHAIN_ID,
      contextEpoch: 11,
      rpcMethodSupport: { ...supportedMethods(), eth_sendTransaction: "supported" },
      permissionTypes: [],
      agentWalletSecurity: { simulation: "supported", threatScanning: "supported", asyncApproval: "supported" },
      observedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
    }),
    { code: "invalid_metamask_agentic_wallet_input" }
  );
  assert.throws(
    () => compareMetaMaskAdvancedPermissionResponse({
      preparedProjection: prepare(current),
      response: { ...exactResponse(prepare(current)), rawProviderResponse: { context: "0x01" } },
      now: NOW
    }),
    { code: "invalid_metamask_agentic_wallet_input" }
  );
});

test("METAMASK-AGENT-001 reference Provider satisfies the SPI but registry blocks every external call", async () => {
  const current = state();
  assert.equal(assertAgenticWalletProvider(current.provider), true);
  const registry = new AgenticWalletProviderRegistry([current.provider]);
  const request = createAgenticWalletProviderRequest({
    descriptor: current.descriptor,
    operationId: "walletDiscoverCapabilities",
    payload: { chainId: CHAIN_ID, accountRefHash: h("discover_account"), contextEpoch: 11 },
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    now: NOW
  });
  await assert.rejects(
    invokeAgenticWalletProvider({ registry, request, now: NOW }),
    { code: "agentic_wallet_provider_disabled_l0_local_no_funds" }
  );
  const result = await current.provider.discoverCapabilities(request);
  assert.equal(result.status, "unavailable");
  assert.equal(result.externalCallPerformed, false);
});

test("METAMASK-AGENT-001 all four new runtime artifacts satisfy closed JSON Schemas", async () => {
  const names = [
    "metamask-agentic-wallet-capability-observation",
    "metamask-advanced-permission-projection",
    "metamask-advanced-permission-response-comparison",
    "metamask-agent-wallet-security-receipt"
  ];
  const schemas = Object.fromEntries(await Promise.all(names.map(async (name) => [
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
  const validators = Object.fromEntries(names.map((name) => [name, ajv.compile(schemas[name])]));
  const current = state();
  const projection = prepare(current);
  const comparison = compareMetaMaskAdvancedPermissionResponse({
    preparedProjection: projection, response: exactResponse(projection), now: NOW
  });
  const fixtures = {
    "metamask-agentic-wallet-capability-observation": current.observation,
    "metamask-advanced-permission-projection": projection,
    "metamask-advanced-permission-response-comparison": comparison,
    "metamask-agent-wallet-security-receipt": security(current)
  };
  for (const name of names) {
    assert.equal(validators[name](fixtures[name]), true, JSON.stringify(validators[name].errors));
  }
});

test("METAMASK-AGENT-001 boundary grants no wallet, CLI, signature, transaction, production, or funds authority", () => {
  assert.deepEqual(describeMetaMaskAgenticWalletBoundary(), {
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    adapterId: "metamask_agent_wallet_reference",
    capabilitySource: "local_synthetic_fixture",
    walletRpcEnabled: false,
    agentWalletCliEnabled: false,
    providerPermissionProvisioningEnabled: false,
    permissionContextRedemptionEnabled: false,
    signatureEnabled: false,
    transactionSubmissionEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
});
