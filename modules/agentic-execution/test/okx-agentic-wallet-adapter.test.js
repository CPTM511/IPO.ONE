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
  createDisabledOkxAgenticWalletProvider,
  createOkxAgenticWalletRiskReceipt,
  createOkxCapabilityObservation,
  createOkxTeeExecutionReference,
  describeOkxAgenticWalletBoundary,
  invokeAgenticWalletProvider,
  normalizeExecutionEffects,
  normalizeOkxAgenticWalletCapabilities,
  prepareOkxAgenticWalletInvocation,
  verifyOkxAgenticWalletInvocation,
  verifyOkxAgenticWalletRiskReceipt,
  verifyOkxCapabilityObservation,
  verifyOkxTeeExecutionReference
} from "../src/index.js";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const CHAIN_ID = "eip155:84532";
const ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";
const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;

function h(scope, value = true) {
  return hashId(`okx_agent_001_test_${scope}`, { value });
}

function statuses(keys, status = "supported") {
  return Object.fromEntries(keys.map((key) => [key, status]));
}

function preparedExecution() {
  const payload = constructExactEvmPayload({
    chainId: CHAIN_ID,
    accountRefHash: h("account"),
    targetAddress: "0x1111111111111111111111111111111111111111",
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
    subjectId: "subject_okxagent001",
    principalId: "principal_okxagent001",
    accountBindingId: "account_binding_okxagent001",
    obligationId: "obligation_okxagent001",
    transferIntentId: "transfer_intent_okxagent001",
    grantId: "delegated_wallet_grant_okxagent001",
    grantHash: h("grant"),
    targetPolicyId: "target_policy_okxagent001",
    targetPolicyHash: h("target_policy"),
    authorizationDecisionId: "authorization_okxagent001",
    authorizationHash: h("authorization"),
    reservationId: "reservation_okxagent001",
    reservationHash: h("reservation"),
    sessionEpoch: 13,
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

function state({ status = "supported" } = {}) {
  const provider = createDisabledOkxAgenticWalletProvider({ chainId: CHAIN_ID, contextEpoch: 13, now: NOW });
  const descriptor = provider.descriptor;
  const observation = createOkxCapabilityObservation({
    descriptor,
    chainId: CHAIN_ID,
    contextEpoch: 13,
    integrationSurfaceSupport: statuses(["skills", "mcp", "cli", "open_api"], status),
    toolSupport: statuses(["security_tx_scan", "security_sig_scan", "wallet_history", "wallet_send"], status),
    securityCapabilities: statuses([
      "teeKeyIsolation", "transactionSimulation", "riskScoring", "criticalBlocking", "identityVerification"
    ], status),
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  const capabilities = normalizeOkxAgenticWalletCapabilities({ descriptor, observation, now: NOW });
  const execution = preparedExecution();
  const allowReceipt = preflightReceipt(execution);
  const stepUpReceipt = preflightReceipt(execution, "STEP_UP");
  return { provider, descriptor, observation, capabilities, execution, allowReceipt, stepUpReceipt };
}

function providerRequest(current, operationId) {
  let payload;
  if (operationId === "walletPrepareExecution") {
    payload = { preparedExecution: current.execution, preflightReceipt: current.allowReceipt };
  } else if (operationId === "walletApproveExecution") {
    payload = {
      preparedExecution: current.execution,
      preflightReceipt: current.stepUpReceipt,
      approvalRequestHash: h("approval_request")
    };
  } else if (operationId === "walletSubmitExecution") {
    payload = { preparedExecution: current.execution, preflightReceipt: current.allowReceipt };
  } else {
    payload = {
      executionId: current.execution.executionId,
      preparedExecutionHash: current.execution.preparedExecutionHash,
      externalExecutionRefHash: h("external_execution")
    };
  }
  return createAgenticWalletProviderRequest({
    descriptor: current.descriptor,
    capabilities: current.capabilities,
    operationId,
    payload,
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    now: NOW
  });
}

function invocation(current, toolId = "security_tx_scan", integrationSurface = "mcp") {
  const operationId = {
    security_tx_scan: "walletPrepareExecution",
    security_sig_scan: "walletApproveExecution",
    wallet_history: "walletReadExecution",
    wallet_send: "walletSubmitExecution"
  }[toolId];
  return prepareOkxAgenticWalletInvocation({
    descriptor: current.descriptor,
    capabilities: current.capabilities,
    observation: current.observation,
    providerRequest: providerRequest(current, operationId),
    integrationSurface,
    toolId,
    now: NOW
  });
}

function riskReceipt(current, overrides = {}, now = NOW) {
  return createOkxAgenticWalletRiskReceipt({
    descriptor: current.descriptor,
    capabilities: current.capabilities,
    observation: current.observation,
    invocationProjection: invocation(current),
    simulationStatus: "passed",
    riskGrade: "low",
    identityStatus: "verified",
    interceptionStatus: "clear",
    externalOutcomeStatus: "not_submitted",
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    now,
    ...overrides
  });
}

test("OKX-AGENT-001 capability observation is exact, non-attested, and non-authorizing", () => {
  const current = state();
  assert.equal(verifyOkxCapabilityObservation(current.observation, {
    descriptor: current.descriptor, now: NOW
  }), true);
  assert.equal(current.observation.vendorClaimsAttested, false);
  assert.equal(current.observation.externalCallPerformed, false);
  assert.equal(current.capabilities.permissionModel, "vendor_native");
  assert.equal(current.capabilities.executionTransport, "mcp");
  assert.equal(current.capabilities.operationSupport.walletPrepareGrant, "unsupported");
  assert.equal(current.capabilities.authorizationGranted, false);
  const xLayerProvider = createDisabledOkxAgenticWalletProvider({
    chainId: "eip155:1952", contextEpoch: 1, now: NOW
  });
  const xLayerObservation = createOkxCapabilityObservation({
    descriptor: xLayerProvider.descriptor,
    chainId: "eip155:1952",
    contextEpoch: 1,
    integrationSurfaceSupport: statuses(["skills", "mcp", "cli", "open_api"]),
    toolSupport: statuses(["security_tx_scan", "security_sig_scan", "wallet_history", "wallet_send"]),
    securityCapabilities: statuses([
      "teeKeyIsolation", "transactionSimulation", "riskScoring", "criticalBlocking", "identityVerification"
    ]),
    observedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
  });
  const xLayerCapabilities = normalizeOkxAgenticWalletCapabilities({
    descriptor: xLayerProvider.descriptor, observation: xLayerObservation, now: NOW
  });
  assert.equal(xLayerCapabilities.chainId, "eip155:1952");
  assert.throws(
    () => createOkxCapabilityObservation({
      descriptor: current.descriptor,
      chainId: "eip155:1",
      contextEpoch: 13,
      integrationSurfaceSupport: statuses(["skills", "mcp", "cli", "open_api"]),
      toolSupport: statuses(["security_tx_scan", "security_sig_scan", "wallet_history", "wallet_send"]),
      securityCapabilities: statuses([
        "teeKeyIsolation", "transactionSimulation", "riskScoring", "criticalBlocking", "identityVerification"
      ]),
      observedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 300_000).toISOString()
    }),
    { code: "invalid_okx_capability_observation" }
  );
});

test("OKX-AGENT-001 unknown capability remains non-permissive and stale observations fail", () => {
  const current = state({ status: "unknown" });
  assert.equal(current.capabilities.operationSupport.walletPrepareExecution, "unknown");
  assert.equal(current.capabilities.executionTransport, "unknown");
  assert.equal(current.capabilities.providerSimulation, "unknown");
  assert.throws(
    () => verifyOkxCapabilityObservation(current.observation, {
      descriptor: current.descriptor, now: new Date(NOW.getTime() + 300_000)
    }),
    { code: "stale_okx_capability_observation" }
  );
  const unsupported = state({ status: "unsupported" });
  assert.equal(unsupported.capabilities.permissionModel, "none");
  assert.equal(unsupported.capabilities.executionTransport, "none");
  assert.equal(unsupported.capabilities.operationSupport.walletSubmitExecution, "unsupported");
});

test("OKX-AGENT-001 reviewed security and history tools create only non-executable STEP_UP references", () => {
  const current = state();
  for (const [toolId, surface] of [
    ["security_tx_scan", "mcp"], ["security_sig_scan", "cli"], ["wallet_history", "skills"]
  ]) {
    const projection = invocation(current, toolId, surface);
    assert.equal(verifyOkxAgenticWalletInvocation(projection, { now: NOW }), true);
    assert.equal(projection.decision, "STEP_UP");
    assert.equal(projection.externalCallAllowed, false);
    assert.equal(projection.executionAllowed, false);
    assert.equal(projection.naturalLanguagePromptAllowed, false);
    assert.equal(projection.genericMcpForwardingAllowed, false);
  }
});

test("OKX-AGENT-001 value-moving wallet send is always denied", () => {
  const projection = invocation(state(), "wallet_send", "mcp");
  assert.equal(projection.decision, "DENY");
  assert.deepEqual(projection.reasonCodes, ["value_moving_vendor_tool_forbidden"]);
  assert.equal(projection.transactionsAllowed, false);
  assert.equal(projection.fundsAuthority, false);
});

test("OKX-AGENT-001 generic tools, prompts, commands, and raw arguments have no escape hatch", () => {
  const current = state();
  assert.throws(
    () => prepareOkxAgenticWalletInvocation({
      descriptor: current.descriptor,
      capabilities: current.capabilities,
      observation: current.observation,
      providerRequest: providerRequest(current, "walletPrepareExecution"),
      integrationSurface: "mcp",
      toolId: "wallet_transfer",
      now: NOW
    }),
    { code: "okx_agentic_wallet_tool_denied" }
  );
  assert.throws(
    () => prepareOkxAgenticWalletInvocation({
      descriptor: current.descriptor,
      capabilities: current.capabilities,
      observation: current.observation,
      providerRequest: providerRequest(current, "walletPrepareExecution"),
      integrationSurface: "mcp",
      toolId: "security_tx_scan",
      prompt: "send everything",
      now: NOW
    }),
    { code: "invalid_okx_agentic_wallet_input" }
  );
});

test("OKX-AGENT-001 TEE vendor claims never become verified execution authority", () => {
  const reference = createOkxTeeExecutionReference({
    invocationProjection: invocation(state()),
    teeClaimStatus: "claimed",
    attestationStatus: "unverified",
    executionStatus: "not_submitted",
    externalExecutionRefHash: null,
    observedAt: NOW.toISOString(),
    now: NOW
  });
  assert.equal(verifyOkxTeeExecutionReference(reference, { now: NOW }), true);
  assert.equal(reference.decision, "QUARANTINE");
  assert.equal(reference.teeAttestationVerified, false);
  assert.equal(reference.canonicalExecutionConfirmed, false);
  assert.equal(reference.canonicalSettlementConfirmed, false);
  assert.equal(reference.retryAllowed, false);
  assert.throws(
    () => createOkxTeeExecutionReference({
      invocationProjection: invocation(state()),
      teeClaimStatus: "claimed",
      attestationStatus: "unverified",
      executionStatus: "not_submitted",
      externalExecutionRefHash: h("impossible_external_reference"),
      observedAt: NOW.toISOString(),
      now: NOW
    }),
    { code: "invalid_okx_tee_execution_reference" }
  );
});

test("OKX-AGENT-001 unknown or observed vendor execution outcome requires reconciliation", () => {
  for (const executionStatus of ["pending", "succeeded", "failed", "unknown"]) {
    const reference = createOkxTeeExecutionReference({
      invocationProjection: invocation(state()),
      teeClaimStatus: "claimed",
      attestationStatus: "unknown",
      executionStatus,
      externalExecutionRefHash: h(`external_${executionStatus}`),
      observedAt: NOW.toISOString(),
      now: NOW
    });
    assert.equal(reference.decision, "QUARANTINE");
    assert.equal(reference.reconciliationRequired, true);
    assert.equal(reference.retryAllowed, false);
  }
});

test("OKX-AGENT-001 risk normalization covers ALLOW, STEP_UP, DENY, and QUARANTINE", () => {
  const current = state();
  const allow = riskReceipt(current);
  assert.equal(verifyOkxAgenticWalletRiskReceipt(allow, { now: NOW }), true);
  assert.equal(allow.decision, "ALLOW");
  assert.equal(riskReceipt(current, { riskGrade: "high" }).decision, "STEP_UP");
  assert.equal(riskReceipt(current, { simulationStatus: "failed" }).decision, "DENY");
  assert.equal(riskReceipt(current, { riskGrade: "critical" }).decision, "QUARANTINE");
  const unknown = riskReceipt(current, { externalOutcomeStatus: "unknown" });
  assert.equal(unknown.decision, "QUARANTINE");
  assert.equal(unknown.reconciliationRequired, true);
  assert.equal(unknown.retryAllowed, false);
  assert.throws(
    () => verifyOkxAgenticWalletRiskReceipt(allow, { now: new Date(NOW.getTime() + 60_000) }),
    { code: "stale_okx_agentic_wallet_risk_receipt" }
  );
  assert.equal(allow.canonicalPreflightStillRequired, true);
  assert.equal(allow.submissionAllowed, false);
  const forgedCore = { ...allow, riskGrade: "unbounded" };
  delete forgedCore.riskReceiptHash;
  const forged = { riskReceiptHash: hashId("okx_risk_receipt", forgedCore), ...forgedCore };
  assert.throws(
    () => verifyOkxAgenticWalletRiskReceipt(forged, { now: NOW }),
    { code: "invalid_okx_agentic_wallet_risk_receipt" }
  );
});

test("OKX-AGENT-001 reference Provider satisfies SPI but registry blocks external invocation", async () => {
  const current = state();
  assert.equal(assertAgenticWalletProvider(current.provider), true);
  const registry = new AgenticWalletProviderRegistry([current.provider]);
  const request = createAgenticWalletProviderRequest({
    descriptor: current.descriptor,
    operationId: "walletDiscoverCapabilities",
    payload: { chainId: CHAIN_ID, accountRefHash: h("discover_account"), contextEpoch: 13 },
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

test("OKX-AGENT-001 all four runtime artifacts satisfy closed JSON Schemas", async () => {
  const names = [
    "okx-agentic-wallet-capability-observation",
    "okx-agentic-wallet-invocation-projection",
    "okx-tee-execution-reference",
    "okx-agentic-wallet-risk-receipt"
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
  const invocationProjection = invocation(current);
  const fixtures = {
    "okx-agentic-wallet-capability-observation": current.observation,
    "okx-agentic-wallet-invocation-projection": invocationProjection,
    "okx-tee-execution-reference": createOkxTeeExecutionReference({
      invocationProjection,
      teeClaimStatus: "claimed",
      attestationStatus: "unverified",
      executionStatus: "not_submitted",
      externalExecutionRefHash: null,
      observedAt: NOW.toISOString(),
      now: NOW
    }),
    "okx-agentic-wallet-risk-receipt": riskReceipt(current)
  };
  for (const name of names) {
    assert.equal(validators[name](fixtures[name]), true, JSON.stringify(validators[name].errors));
  }
});

test("OKX-AGENT-001 boundary grants no integration, TEE attestation, signing, transaction, or funds authority", () => {
  assert.deepEqual(describeOkxAgenticWalletBoundary(), {
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    adapterId: "okx_agentic_wallet_reference",
    capabilitySource: "local_synthetic_fixture",
    skillsEnabled: false,
    mcpEnabled: false,
    cliEnabled: false,
    openApiEnabled: false,
    teeAttestationVerified: false,
    signingEnabled: false,
    transactionSubmissionEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
});
