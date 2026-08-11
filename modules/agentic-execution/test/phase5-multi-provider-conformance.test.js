import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  AgenticWalletProviderRegistry,
  assertAgenticWalletProvider,
  constructExactEvmPayload,
  createAgenticWalletProviderRequest,
  createBaseAccountCapabilityObservation,
  createCircleCapabilityObservation,
  createDisabledBaseAccountAgenticWalletProvider,
  createDisabledCircleAgenticWalletProvider,
  createDisabledMetaMaskAgenticWalletProvider,
  createDisabledOkxAgenticWalletProvider,
  createDisabledSafeAgenticWalletProvider,
  createPhase5MultiProviderConformanceEvidence,
  describeBaseAccountAgenticWalletBoundary,
  describeCircleAgenticWalletBoundary,
  describePhase5ConformanceBoundary,
  normalizeBaseAccountAgenticWalletCapabilities,
  normalizeCircleAgenticWalletCapabilities,
  normalizeExecutionEffects,
  prepareBaseSpendPermissionProjection,
  prepareCircleManagedExecutionProjection,
  verifyBaseAccountCapabilityObservation,
  verifyBaseSpendPermissionProjection,
  verifyCircleCapabilityObservation,
  verifyCircleManagedExecutionProjection,
  verifyPhase5MultiProviderConformanceEvidence
} from "../src/index.js";

const NOW = new Date("2026-08-10T17:00:00.000Z");
const CHAIN_ID = "eip155:84532";
const ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";
const TARGET = "0x1111111111111111111111111111111111111111";
const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;

function h(scope, value = true) {
  return hashId(`aecl_phase5_test_${scope}`, { value });
}

function statusMap(keys, status) {
  return Object.fromEntries(keys.map((key) => [key, status]));
}

function preparedExecution() {
  const payload = constructExactEvmPayload({
    chainId: CHAIN_ID,
    accountRefHash: h("account"),
    targetAddress: TARGET,
    calldata: "0x12345678",
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
    subjectId: "subject_aecl_phase5",
    principalId: "principal_aecl_phase5",
    accountBindingId: "account_binding_aecl_phase5",
    obligationId: "obligation_aecl_phase5",
    transferIntentId: "transfer_intent_aecl_phase5",
    grantId: "delegated_wallet_grant_aecl_phase5",
    grantHash: h("execution_grant"),
    targetPolicyId: "execution_target_policy_aecl_phase5",
    targetPolicyHash: h("execution_target_policy"),
    authorizationDecisionId: "authorization_aecl_phase5",
    authorizationHash: h("authorization"),
    reservationId: "reservation_aecl_phase5",
    reservationHash: h("reservation"),
    sessionEpoch: 21,
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

function preflightReceipt(execution, decision = "ALLOW") {
  const core = {
    executionId: execution.executionId,
    preparedExecutionHash: execution.preparedExecutionHash,
    authorizationHash: execution.authorizationHash,
    grantId: execution.grantId,
    grantHash: execution.grantHash,
    exactPayloadHash: execution.payload.exactPayloadHash,
    targetSnapshot: { targetPolicyHash: execution.targetPolicyHash },
    simulationSnapshot: { simulationReportHash: h("simulation") },
    expectedEffectsHash: execution.expectedEffects.effectsHash,
    simulatedEffectsHash: execution.expectedEffects.effectsHash,
    allowanceDeltaHash: h("allowance_delta"),
    assetDeltaHash: h("asset_delta"),
    riskChecksHash: h("risk_checks"),
    reservationHash: execution.reservationHash,
    decision,
    reasonCodes: [decision === "ALLOW" ? "preflight_passed" : "canonical_policy_denied"],
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

function circleState({ status = "supported", preflightDecision = "ALLOW" } = {}) {
  const provider = createDisabledCircleAgenticWalletProvider({ chainId: CHAIN_ID, contextEpoch: 21, now: NOW });
  const descriptor = provider.descriptor;
  const observation = createCircleCapabilityObservation({
    descriptor,
    chainId: CHAIN_ID,
    contextEpoch: 21,
    accountType: "sca",
    managedSupport: statusMap([
      "developerControlledWallet", "mpcKeyManagement", "signingApi", "managedBroadcast",
      "transactionStatus", "credentialIsolation"
    ], status),
    custodyConfigurationHash: h("circle_custody_configuration"),
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  const capabilities = normalizeCircleAgenticWalletCapabilities({ descriptor, observation, now: NOW });
  const execution = preparedExecution();
  const receipt = preflightReceipt(execution, preflightDecision);
  const providerRequest = capabilities.operationSupport.walletPrepareExecution === "supported"
    ? createAgenticWalletProviderRequest({
      descriptor,
      capabilities,
      operationId: "walletPrepareExecution",
      payload: { preparedExecution: execution, preflightReceipt: receipt },
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      now: NOW
    })
    : null;
  return { provider, descriptor, observation, capabilities, providerRequest };
}

function activeBaseGrant(descriptor) {
  const core = {
    subjectId: "subject_aecl_phase5",
    principalId: "principal_aecl_phase5",
    accountBindingId: "account_binding_aecl_phase5",
    executionDomain: "evm",
    adapterId: "local_sandbox",
    mandateId: "mandate_aecl_phase5",
    mandateHash: h("mandate"),
    spendPolicyId: "spend_policy_aecl_phase5",
    spendPolicyHash: h("spend_policy"),
    creditLineId: "credit_line_aecl_phase5",
    creditLineHash: h("credit_line"),
    obligationId: "obligation_aecl_phase5",
    obligationHash: h("obligation"),
    authorizationDecisionId: "authorization_aecl_phase5",
    authorizationHash: h("grant_authorization"),
    sessionSignerRefHash: h("session_signer"),
    providerId: "provider_aecl_phase5",
    chainIds: [CHAIN_ID],
    assetIds: [ASSET_ID],
    allowedTargetPolicyIds: ["target_policy_aecl_phase5"],
    perTxLimitMinor: "4000",
    rolling24hLimitMinor: "9000",
    aggregateLimitMinor: "12000",
    obligationLimitMinor: "7000",
    validFrom: new Date(NOW.getTime() - 60_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    sessionEpoch: 21,
    nonce: "aecl-phase5-grant-nonce",
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
    externalPermissionRefHash: h("external_permission"),
    externalPolicyHash: h("external_policy"),
    status: "active",
    pendingExposureMinor: "0",
    version: 2,
    createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    updatedAt: new Date(NOW.getTime() - 30_000).toISOString()
  });
}

function basePermissionProjection(descriptor, capabilities, grant) {
  const core = {
    grantId: grant.grantId,
    grantHash: grant.grantHash,
    adapterId: descriptor.adapterId,
    providerId: grant.providerId,
    descriptorHash: descriptor.descriptorHash,
    capabilitiesHash: capabilities.capabilitiesHash,
    sessionEpoch: grant.sessionEpoch,
    chainIds: [CHAIN_ID],
    assetIds: [ASSET_ID],
    targetPolicies: [{
      targetPolicyId: "target_policy_aecl_phase5",
      policyHash: h("base_target_policy"),
      chainId: CHAIN_ID,
      targetAddress: TARGET,
      codeHash: h("target_code"),
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
  return Object.freeze({
    permissionProjectionId: `external_wallet_permission_${permissionProjectionHash.slice(2)}`,
    permissionProjectionHash,
    ...core
  });
}

function baseState({ status = "supported" } = {}) {
  const provider = createDisabledBaseAccountAgenticWalletProvider({ chainId: CHAIN_ID, contextEpoch: 21, now: NOW });
  const descriptor = provider.descriptor;
  const observation = createBaseAccountCapabilityObservation({
    descriptor,
    chainId: CHAIN_ID,
    contextEpoch: 21,
    accountSupport: statusMap([
      "smartAccount", "spendPermission", "spendPermissionRevoke", "subAccounts",
      "walletSendCalls", "walletGetCallsStatus", "autoSpendPermission"
    ], status),
    accountConfigurationHash: h("base_account_configuration"),
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  const capabilities = normalizeBaseAccountAgenticWalletCapabilities({ descriptor, observation, now: NOW });
  const grant = activeBaseGrant(descriptor);
  const permissionProjection = basePermissionProjection(descriptor, capabilities, grant);
  const providerRequest = capabilities.operationSupport.walletPrepareGrant === "supported"
    ? createAgenticWalletProviderRequest({
      descriptor,
      capabilities,
      operationId: "walletPrepareGrant",
      payload: { grant, permissionProjection },
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      now: NOW
    })
    : null;
  return { provider, descriptor, observation, capabilities, grant, permissionProjection, providerRequest };
}

function requestedBasePermission(current, overrides = {}) {
  const target = current.permissionProjection.targetPolicies[0];
  return {
    chainId: CHAIN_ID,
    assetId: ASSET_ID,
    targetPolicyId: target.targetPolicyId,
    tokenRefHash: hashId("base_spend_permission_asset", { assetId: ASSET_ID }),
    spenderRefHash: hashId("base_spend_permission_target", {
      targetPolicyId: target.targetPolicyId,
      targetAddress: target.targetAddress,
      policyHash: target.policyHash
    }),
    allowanceMinor: "4000",
    periodSeconds: 86_400,
    validFrom: NOW.toISOString(),
    validUntil: new Date(NOW.getTime() + 120_000).toISOString(),
    saltHash: h("base_salt"),
    extraDataHash: hashId("base_spend_permission_extra_data", { empty: true }),
    ...overrides
  };
}

async function disabledCapabilities(provider, contextEpoch = 21) {
  const request = createAgenticWalletProviderRequest({
    descriptor: provider.descriptor,
    operationId: "walletDiscoverCapabilities",
    payload: { chainId: CHAIN_ID, accountRefHash: h(provider.descriptor.adapterId), contextEpoch },
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    now: NOW
  });
  return (await provider.discoverCapabilities(request)).capabilities;
}

test("Phase 5 consolidated fixture names five materially different disabled reference architectures", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/phase5-reference-provider-conformance.v1.json", import.meta.url), "utf8"
  ));
  assert.equal(fixture.deliveryMode, "L0_LOCAL_NO_FUNDS");
  assert.equal(fixture.providerArchitectures.length, 5);
  assert.equal(new Set(fixture.providerArchitectures.map(({ adapterId }) => adapterId)).size, 5);
  assert.equal(fixture.externalCallsAllowed, false);
  assert.equal(fixture.safeTestnetWorkDeferred, true);
});

test("Circle managed MPC reference requires STEP_UP and retains no credential or provider response material", () => {
  const current = circleState();
  assert.equal(verifyCircleCapabilityObservation(current.observation, {
    descriptor: current.descriptor, now: NOW
  }), true);
  const projection = prepareCircleManagedExecutionProjection({
    descriptor: current.descriptor,
    capabilities: current.capabilities,
    observation: current.observation,
    providerRequest: current.providerRequest,
    now: NOW
  });
  assert.equal(verifyCircleManagedExecutionProjection(projection, { now: NOW }), true);
  assert.equal(projection.decision, "STEP_UP");
  assert.equal(projection.credentialMaterialAccepted, false);
  assert.equal(projection.credentialCiphertextAccepted, false);
  assert.equal(projection.rawSignatureRetained, false);
  assert.equal(projection.rawProviderResponseRetained, false);
  assert.equal(projection.externalCallAllowed, false);
  assert.equal(projection.submissionAllowed, false);
});

test("Circle canonical denial and unknown managed capability fail closed", () => {
  const denied = circleState({ preflightDecision: "DENY" });
  const projection = prepareCircleManagedExecutionProjection({
    descriptor: denied.descriptor,
    capabilities: denied.capabilities,
    observation: denied.observation,
    providerRequest: denied.providerRequest,
    now: NOW
  });
  assert.equal(projection.decision, "DENY");
  assert.deepEqual(projection.reasonCodes, ["canonical_preflight_not_permissive"]);
  const unknown = circleState({ status: "unknown" });
  assert.equal(unknown.providerRequest, null);
  assert.equal(unknown.capabilities.operationSupport.walletPrepareExecution, "unknown");
  assert.throws(() => createAgenticWalletProviderRequest({
    descriptor: unknown.descriptor,
    capabilities: unknown.capabilities,
    operationId: "walletPrepareExecution",
    payload: { preparedExecution: preparedExecution(), preflightReceipt: preflightReceipt(preparedExecution()) },
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    now: NOW
  }), { code: "agentic_wallet_provider_capability_unavailable" });

  const allowed = circleState();
  const exact = prepareCircleManagedExecutionProjection({
    descriptor: allowed.descriptor,
    capabilities: allowed.capabilities,
    observation: allowed.observation,
    providerRequest: allowed.providerRequest,
    now: NOW
  });
  const rehashed = structuredClone(exact);
  delete rehashed.circleManagedExecutionProjectionId;
  delete rehashed.circleManagedExecutionProjectionHash;
  rehashed.canonicalPreflightDecision = "DENY";
  const rehashedProjectionHash = hashId("circle_managed_execution_projection", rehashed);
  assert.throws(() => verifyCircleManagedExecutionProjection({
    circleManagedExecutionProjectionId: `circle_managed_execution_${rehashedProjectionHash.slice(2)}`,
    circleManagedExecutionProjectionHash: rehashedProjectionHash,
    ...rehashed
  }, { now: NOW }), { code: "invalid_circle_managed_execution_projection" });
});

test("Base Spend Permission exact scope can only produce STEP_UP with all silent execution paths disabled", () => {
  const current = baseState();
  assert.equal(verifyBaseAccountCapabilityObservation(current.observation, {
    descriptor: current.descriptor, now: NOW
  }), true);
  const projection = prepareBaseSpendPermissionProjection({
    descriptor: current.descriptor,
    capabilities: current.capabilities,
    observation: current.observation,
    providerRequest: current.providerRequest,
    requestedPermission: requestedBasePermission(current),
    now: NOW
  });
  assert.equal(verifyBaseSpendPermissionProjection(projection, { now: NOW }), true);
  assert.equal(projection.decision, "STEP_UP");
  assert.equal(projection.autoSpendPermissionAllowed, false);
  assert.equal(projection.silentSpendAllowed, false);
  assert.equal(projection.subAccountCreationAllowed, false);
  assert.equal(projection.walletSendCallsAllowed, false);
  assert.equal(projection.activationAllowed, false);
});

test("Base amount, period, extra data and wrong-chain requests are denied without widening canonical authority", () => {
  const current = baseState();
  const cases = [
    [{ allowanceMinor: "4001" }, "base_spend_permission_amount_widened"],
    [{ periodSeconds: 604_800 }, "base_spend_permission_time_widened"],
    [{ extraDataHash: h("unexpected_extra_data") }, "base_spend_permission_extra_data_forbidden"]
  ];
  for (const [overrides, expectedReason] of cases) {
    const projection = prepareBaseSpendPermissionProjection({
      descriptor: current.descriptor,
      capabilities: current.capabilities,
      observation: current.observation,
      providerRequest: current.providerRequest,
      requestedPermission: requestedBasePermission(current, overrides),
      now: NOW
    });
    assert.equal(projection.decision, "DENY");
    assert.deepEqual(projection.reasonCodes, [expectedReason]);
  }
  assert.throws(() => createBaseAccountCapabilityObservation({
    descriptor: current.descriptor,
    chainId: "eip155:1952",
    contextEpoch: 21,
    accountSupport: current.observation.accountSupport,
    accountConfigurationHash: h("wrong_chain"),
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  }), { code: "invalid_base_account_capability_observation" });

  const exact = prepareBaseSpendPermissionProjection({
    descriptor: current.descriptor,
    capabilities: current.capabilities,
    observation: current.observation,
    providerRequest: current.providerRequest,
    requestedPermission: requestedBasePermission(current),
    now: NOW
  });
  const rehashed = structuredClone(exact);
  delete rehashed.baseSpendPermissionProjectionId;
  delete rehashed.baseSpendPermissionProjectionHash;
  rehashed.periodSeconds = 604_800;
  const rehashedProjectionHash = hashId("base_spend_permission_projection", rehashed);
  assert.throws(() => verifyBaseSpendPermissionProjection({
    baseSpendPermissionProjectionId: `base_spend_permission_${rehashedProjectionHash.slice(2)}`,
    baseSpendPermissionProjectionHash: rehashedProjectionHash,
    ...rehashed
  }, { now: NOW }), { code: "invalid_base_spend_permission_projection" });
});

test("unsupported Base capability cannot construct an SPI request and stale observations are rejected", () => {
  const unsupported = baseState({ status: "unsupported" });
  assert.equal(unsupported.providerRequest, null);
  assert.equal(unsupported.capabilities.operationSupport.walletPrepareGrant, "unsupported");
  assert.throws(() => verifyBaseAccountCapabilityObservation(unsupported.observation, {
    descriptor: unsupported.descriptor,
    now: new Date(NOW.getTime() + 300_001)
  }), { code: "stale_base_account_capability_observation" });
  assert.throws(() => verifyCircleCapabilityObservation(circleState().observation, {
    descriptor: circleState().descriptor,
    now: new Date(NOW.getTime() + 300_001)
  }));
});

test("Circle and Base reference providers implement the unchanged SPI and remain independently disabled", () => {
  const providers = [circleState().provider, baseState().provider];
  for (const provider of providers) {
    assert.equal(assertAgenticWalletProvider(provider), true);
    assert.equal(provider.descriptor.enabled, false);
    assert.equal(provider.descriptor.externalCallsEnabled, false);
  }
  const registry = new AgenticWalletProviderRegistry(providers);
  assert.throws(() => registry.requireEnabled(providers[0].descriptor.adapterId), {
    code: "agentic_wallet_provider_disabled_l0_local_no_funds"
  });
  assert.deepEqual(describeCircleAgenticWalletBoundary(), {
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    adapterId: "circle_managed_agent_wallet_reference",
    capabilitySource: "local_synthetic_fixture",
    managedWalletApiEnabled: false,
    credentialMaterialAccepted: false,
    mpcSigningEnabled: false,
    custodyActivated: false,
    transactionSubmissionEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
  assert.equal(describeBaseAccountAgenticWalletBoundary().autoSpendPermissionEnabled, false);
});

test("AECL Phase 5 closes five provider architectures on one stable SPI without Kernel changes", async () => {
  const providerInstances = [
    createDisabledMetaMaskAgenticWalletProvider({ chainId: CHAIN_ID, contextEpoch: 21, now: NOW }),
    createDisabledOkxAgenticWalletProvider({ chainId: CHAIN_ID, contextEpoch: 21, now: NOW }),
    createDisabledSafeAgenticWalletProvider({ chainId: CHAIN_ID, contextEpoch: 21, now: NOW }),
    circleState().provider,
    baseState().provider
  ];
  const categories = {
    metamask_agent_wallet_reference: "browser_advanced_permission_wallet",
    okx_agentic_wallet_reference: "wallet_cli_mcp_tee_reference",
    safe_institutional_wallet_reference: "institutional_multisig_smart_account",
    circle_managed_agent_wallet_reference: "managed_mpc_wallet",
    base_account_spend_permission_reference: "native_smart_account_spend_permission"
  };
  const providers = [];
  for (const provider of providerInstances) {
    providers.push({
      descriptor: provider.descriptor,
      capabilities: await disabledCapabilities(provider),
      referenceReceiptHash: h(`reference_receipt_${provider.descriptor.adapterId}`),
      referenceDecision: "QUARANTINE",
      architectureCategory: categories[provider.descriptor.adapterId]
    });
  }
  const evidence = createPhase5MultiProviderConformanceEvidence({
    providers,
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  assert.equal(verifyPhase5MultiProviderConformanceEvidence(evidence, { now: NOW }), true);
  assert.equal(evidence.providerCount, 5);
  assert.equal(evidence.commonSpiOperationCount, 9);
  assert.equal(evidence.commonAeclSemanticsProviderNeutral, true);
  assert.equal(evidence.externalPermissionsNarrowOnly, true);
  assert.equal(evidence.canonicalKernelChanged, false);
  assert.equal(evidence.futureProviderRequiresKernelChange, false);
  assert.equal(evidence.futureProviderPrimaryWork, "adapter_and_conformance");
  assert.equal(evidence.safeTestnetWorkDeferred, true);
  assert.equal(describePhase5ConformanceBoundary().fullProviderTestnetLifecycleRequired, false);

  const circle = circleState();
  const circleProjection = prepareCircleManagedExecutionProjection({
    descriptor: circle.descriptor,
    capabilities: circle.capabilities,
    observation: circle.observation,
    providerRequest: circle.providerRequest,
    now: NOW
  });
  const base = baseState();
  const baseProjection = prepareBaseSpendPermissionProjection({
    descriptor: base.descriptor,
    capabilities: base.capabilities,
    observation: base.observation,
    providerRequest: base.providerRequest,
    requestedPermission: requestedBasePermission(base),
    now: NOW
  });
  const schemaValues = {
    "circle-managed-wallet-capability-observation": circle.observation,
    "circle-managed-execution-projection": circleProjection,
    "base-account-capability-observation": base.observation,
    "base-spend-permission-projection": baseProjection,
    "aecl-phase5-multi-provider-conformance-evidence": evidence
  };
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat("date-time", {
    type: "string",
    validate(value) {
      const parsed = new Date(value);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
    }
  });
  for (const [name, value] of Object.entries(schemaValues)) {
    const schema = JSON.parse(await readFile(
      new URL(`../../../schemas/v2/${name}.schema.json`, import.meta.url), "utf8"
    ));
    const validator = ajv.compile(schema);
    assert.equal(validator(value), true, `${name}: ${JSON.stringify(validator.errors)}`);
  }

  const tampered = structuredClone(evidence);
  delete tampered.conformanceEvidenceId;
  delete tampered.conformanceEvidenceHash;
  tampered.canonicalKernelChanged = true;
  const tamperedHash = hashId("aecl_phase5_multi_provider_conformance_evidence", tampered);
  assert.throws(() => verifyPhase5MultiProviderConformanceEvidence({
    conformanceEvidenceId: `aecl_phase5_conformance_${tamperedHash.slice(2)}`,
    conformanceEvidenceHash: tamperedHash,
    ...tampered
  }, { now: NOW }), { code: "invalid_aecl_phase5_conformance" });
});
