import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  AgenticWalletProviderRegistry,
  assertAgenticWalletProvider,
  compareSafeAccountConfiguration,
  constructExactEvmPayload,
  createAgenticWalletProviderRequest,
  createDisabledSafeAgenticWalletProvider,
  createSafeCapabilityObservation,
  describeSafeAgenticWalletBoundary,
  invokeAgenticWalletProvider,
  normalizeExecutionEffects,
  normalizeSafeAgenticWalletCapabilities,
  prepareSafeTransactionProjection,
  verifySafeAccountConfigurationComparison,
  verifySafeCapabilityObservation,
  verifySafeTransactionProjection
} from "../src/index.js";

const NOW = new Date("2026-08-10T15:00:00.000Z");
const CHAIN_ID = "eip155:84532";
const ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";
const TARGET = "0x1111111111111111111111111111111111111111";
const SELECTOR = "0x12345678";
const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;

function h(scope, value = true) {
  return hashId(`safe_agent_001_test_${scope}`, { value });
}

function preparedExecution() {
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
    subjectId: "subject_safe_agent_001",
    principalId: "principal_safe_agent_001",
    accountBindingId: "account_binding_safe_agent_001",
    obligationId: "obligation_safe_agent_001",
    transferIntentId: "transfer_intent_safe_agent_001",
    grantId: "delegated_wallet_grant_safe_agent_001",
    grantHash: h("grant"),
    targetPolicyId: "execution_target_policy_safe_agent_001",
    targetPolicyHash: h("target_policy"),
    authorizationDecisionId: "authorization_safe_agent_001",
    authorizationHash: h("authorization"),
    reservationId: "reservation_safe_agent_001",
    reservationHash: h("reservation"),
    sessionEpoch: 9,
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
    allowanceDeltaHash: h("allowances"),
    assetDeltaHash: h("assets"),
    riskChecksHash: h("risk"),
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

function configuration({ moduleCount = 0, owner = "owners", nonce = "4" } = {}) {
  return {
    implementationCodeHash: h("implementation"),
    singletonHash: h("singleton"),
    ownerSetHash: h(owner),
    threshold: 2,
    safeNonce: nonce,
    enabledModulesHash: h("modules", moduleCount),
    moduleCount,
    guardHash: h("guard"),
    fallbackHandlerHash: h("fallback")
  };
}

function state({ status = "supported", moduleCount = 0, decision = "ALLOW" } = {}) {
  const provider = createDisabledSafeAgenticWalletProvider({
    chainId: CHAIN_ID, contextEpoch: 9, now: NOW
  });
  const descriptor = provider.descriptor;
  const observation = createSafeCapabilityObservation({
    descriptor,
    chainId: CHAIN_ID,
    contextEpoch: 9,
    safeVersion: "1.4.1",
    interfaceSupport: {
      eip1271: status,
      eip712: status,
      safeTransaction: status,
      transactionService: status
    },
    accountConfiguration: configuration({ moduleCount }),
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  const capabilities = normalizeSafeAgenticWalletCapabilities({ descriptor, observation, now: NOW });
  const execution = preparedExecution();
  const receipt = preflightReceipt(execution, decision);
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
  return { provider, descriptor, observation, capabilities, execution, receipt, providerRequest };
}

function projection(current, operation = "CALL") {
  return prepareSafeTransactionProjection({
    descriptor: current.descriptor,
    capabilities: current.capabilities,
    observation: current.observation,
    providerRequest: current.providerRequest,
    operation,
    now: NOW
  });
}

test("SAFE-AGENT-001 observation is short-lived, hash-only, and limited to reviewed chains", () => {
  const current = state();
  assert.equal(verifySafeCapabilityObservation(current.observation, {
    descriptor: current.descriptor, now: NOW
  }), true);
  assert.equal(current.observation.onchainConfigurationVerified, false);
  assert.equal(current.observation.externalCallPerformed, false);
  assert.equal(current.capabilities.permissionModel, "vendor_native");
  assert.equal(current.capabilities.operationSupport.walletPrepareExecution, "supported");
  assert.equal(current.capabilities.operationSupport.walletSubmitExecution, "unsupported");
  assert.throws(
    () => createSafeCapabilityObservation({
      descriptor: current.descriptor,
      chainId: "eip155:1",
      contextEpoch: 9,
      safeVersion: "1.4.1",
      interfaceSupport: current.observation.interfaceSupport,
      accountConfiguration: configuration(),
      observedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
    }),
    { code: "invalid_safe_capability_observation" }
  );
});

test("SAFE-AGENT-001 fixture matrix fails closed for modules, unknown capability, and delegatecall", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/safe-agentic-wallet-conformance.v1.json", import.meta.url), "utf8"
  ));
  assert.deepEqual(fixture.chainIds, ["eip155:84532", "eip155:1952"]);
  for (const testCase of fixture.cases) {
    const current = state({
      status: testCase.requiredCapabilityStatus,
      moduleCount: testCase.moduleCount,
      decision: testCase.preflightDecision
    });
    if (testCase.requiredCapabilityStatus !== "supported") {
      assert.equal(current.providerRequest, null);
      assert.equal(current.capabilities.operationSupport.walletPrepareExecution,
        testCase.requiredCapabilityStatus);
      continue;
    }
    const result = projection(current, testCase.operation);
    assert.equal(result.decision, testCase.expectedDecision, testCase.caseId);
    assert.deepEqual(result.reasonCodes, [testCase.expectedReasonCode], testCase.caseId);
    assert.equal(result.submissionAllowed, false);
  }
});

test("SAFE-AGENT-001 clean supported CALL requires threshold STEP_UP and never computes an official hash", () => {
  const result = projection(state());
  assert.equal(verifySafeTransactionProjection(result, { now: NOW }), true);
  assert.equal(result.decision, "STEP_UP");
  assert.equal(result.officialSafeTxHashComputed, false);
  assert.equal(result.safeSignaturesCollected, false);
  assert.equal(result.moduleExecutionAllowed, false);
  assert.equal(result.delegateCallAllowed, false);
  assert.equal(result.transactionServiceUsed, false);
  assert.equal(result.rawCalldataRetained, false);
  assert.equal(result.externalCallAllowed, false);
});

test("SAFE-AGENT-001 verifier rejects a rehashed decision/reason mismatch", () => {
  const prepared = structuredClone(projection(state()));
  delete prepared.safeTransactionProjectionId;
  delete prepared.safeTransactionProjectionHash;
  prepared.decision = "DENY";
  const projectionHash = hashId("safe_transaction_projection", prepared);
  assert.throws(
    () => verifySafeTransactionProjection({
      safeTransactionProjectionId: `safe_transaction_projection_${projectionHash.slice(2)}`,
      safeTransactionProjectionHash: projectionHash,
      ...prepared
    }, { now: NOW }),
    { code: "invalid_safe_transaction_projection" }
  );
});

test("SAFE-AGENT-001 account configuration drift is quarantined", () => {
  const current = state();
  const prepared = projection(current);
  const exact = compareSafeAccountConfiguration({
    descriptor: current.descriptor,
    preparedProjection: prepared,
    currentObservation: current.observation,
    now: NOW
  });
  assert.equal(verifySafeAccountConfigurationComparison(exact, { now: NOW }), true);
  assert.equal(exact.configurationMatches, true);
  assert.equal(exact.decision, "STEP_UP");
  const driftedObservation = createSafeCapabilityObservation({
    descriptor: current.descriptor,
    chainId: CHAIN_ID,
    contextEpoch: 9,
    safeVersion: "1.4.1",
    interfaceSupport: current.observation.interfaceSupport,
    accountConfiguration: configuration({ owner: "changed_owners" }),
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  const drifted = compareSafeAccountConfiguration({
    descriptor: current.descriptor,
    preparedProjection: prepared,
    currentObservation: driftedObservation,
    now: NOW
  });
  assert.equal(drifted.configurationMatches, false);
  assert.equal(drifted.decision, "QUARANTINE");
  assert.deepEqual(drifted.reasonCodes, ["safe_account_configuration_drift"]);
});

test("SAFE-AGENT-001 stale observations and closed shapes fail before projection", () => {
  const current = state();
  assert.throws(
    () => verifySafeCapabilityObservation(current.observation, {
      descriptor: current.descriptor,
      now: new Date(NOW.getTime() + 300_000)
    }),
    { code: "stale_safe_capability_observation" }
  );
  assert.throws(
    () => createSafeCapabilityObservation({
      descriptor: current.descriptor,
      chainId: CHAIN_ID,
      contextEpoch: 9,
      safeVersion: "1.4.1",
      interfaceSupport: { ...current.observation.interfaceSupport, rawRpcMethod: "supported" },
      accountConfiguration: configuration(),
      observedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
    }),
    { code: "invalid_safe_agentic_wallet_input" }
  );
});

test("SAFE-AGENT-001 reference Provider satisfies the SPI while registry blocks external calls", async () => {
  const current = state();
  assert.equal(assertAgenticWalletProvider(current.provider), true);
  const registry = new AgenticWalletProviderRegistry([current.provider]);
  const discoverRequest = createAgenticWalletProviderRequest({
    descriptor: current.descriptor,
    operationId: "walletDiscoverCapabilities",
    payload: { chainId: CHAIN_ID, accountRefHash: h("discover_account"), contextEpoch: 9 },
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    now: NOW
  });
  await assert.rejects(
    invokeAgenticWalletProvider({ registry, request: discoverRequest, now: NOW }),
    { code: "agentic_wallet_provider_disabled_l0_local_no_funds" }
  );
  const direct = await current.provider.discoverCapabilities(discoverRequest);
  assert.equal(direct.status, "unavailable");
  assert.equal(direct.externalCallPerformed, false);
});

test("SAFE-AGENT-001 runtime artifacts satisfy all closed JSON Schemas", async () => {
  const names = [
    "safe-agentic-wallet-capability-observation",
    "safe-transaction-projection",
    "safe-account-configuration-comparison"
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
  const prepared = projection(current);
  const comparison = compareSafeAccountConfiguration({
    descriptor: current.descriptor,
    preparedProjection: prepared,
    currentObservation: current.observation,
    now: NOW
  });
  const values = {
    "safe-agentic-wallet-capability-observation": current.observation,
    "safe-transaction-projection": prepared,
    "safe-account-configuration-comparison": comparison
  };
  for (const name of names) {
    assert.equal(validators[name](values[name]), true, JSON.stringify(validators[name].errors));
  }
});

test("SAFE-AGENT-001 boundary grants no module, signature, submission, production, or funds authority", () => {
  assert.deepEqual(describeSafeAgenticWalletBoundary(), {
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    adapterId: "safe_institutional_wallet_reference",
    capabilitySource: "local_synthetic_fixture",
    onchainConfigurationReadEnabled: false,
    transactionServiceEnabled: false,
    moduleExecutionEnabled: false,
    delegateCallEnabled: false,
    signatureCollectionEnabled: false,
    transactionSubmissionEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
});
