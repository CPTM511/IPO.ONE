import assert from "node:assert/strict";
import test from "node:test";
import {
  SANDBOX_CREDIT_DECISION_POLICY,
  SANDBOX_CREDIT_POLICY_HASH,
  createAgentCreditExposureHash,
  deriveAgentCreditLineProjection,
  hashId
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { PilotCapability, RoleBundle } from "../../authorization/src/index.js";
import {
  FIXED_NOW,
  authorizationRequest,
  createAuthorizationHarness
} from "../../authorization/test/support/authorization-fixture.js";
import {
  ExecutionDecision,
  activateDelegatedWalletGrant,
  assertWalletSubmissionDisabled,
  constructPreparedExecution,
  createExecutionTargetPolicy,
  createPendingExposureReservation,
  createSimulationReport,
  describeAgenticExecutionPreflightBoundary,
  evaluateTransactionPreflight,
  prepareDelegatedWalletGrant,
  revokeDelegatedWalletGrant,
  runPreparedExecutionSimulation,
  verifyPreparedExecution,
  verifySimulationReport,
  verifyTransactionPreflightReceipt
} from "../src/index.js";

const TENANT_ID = "tenant_exec002_local";
const ACTOR_ID = "actor_exec002_controller";
const SUBJECT_ID = "subject_exec002_local";
const PRINCIPAL_ID = "principal_exec002_local";
const PROVIDER_ID = "provider_exec002_sandbox";
const ASSET_ID = SANDBOX_CREDIT_DECISION_POLICY.assetId;
const TARGET = "0x1111111111111111111111111111111111111111";
const SELECTOR = "0x12345678";

function h(scope) {
  return hashId(`exec002_test_${scope}`, { fixture: true });
}

function canonicalAuthority(now) {
  const mandate = {
    mandateId: "mandate_exec002_local",
    mandateHash: h("mandate"),
    termsHash: h("mandate_terms"),
    subjectId: SUBJECT_ID,
    principalId: PRINCIPAL_ID,
    capabilities: ["provider_spend"],
    allowedProviderIds: [PROVIDER_ID],
    allowedCategories: ["provider_inventory"],
    assetIds: [ASSET_ID],
    perActionLimitMinor: "70000",
    aggregateLimitMinor: "150000",
    status: "active",
    validFrom: new Date(now.getTime() - 60_000).toISOString(),
    expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "mandate.v3"
  };
  const spendPolicy = {
    spendPolicyId: "spend_policy_exec002_local",
    spendPolicyHash: h("spend_policy"),
    subjectId: SUBJECT_ID,
    providerId: PROVIDER_ID,
    category: "provider_inventory",
    assetId: ASSET_ID,
    perTxLimitMinor: "60000",
    dailyLimitMinor: "90000",
    obligationCapMinor: "80000",
    status: "active",
    schemaVersion: "spend_policy.v1"
  };
  const intent = {
    creditIntentId: "credit_intent_exec002_local", creditIntentHash: h("intent"),
    subjectId: SUBJECT_ID, principalId: PRINCIPAL_ID, authorityType: "mandate",
    authorityRef: mandate.mandateId, assetId: ASSET_ID,
    requestedPrincipalMinor: "100000", purposeCode: "provider_inventory",
    requestedTermDays: 30, repaymentFrequency: "end_of_term", installmentCount: 1,
    sandboxOnly: true, productionFundsRequested: false, status: "decided",
    schemaVersion: "credit_intent.v1"
  };
  const decision = {
    riskDecisionId: "risk_decision_exec002_local", decisionHash: h("decision"),
    creditIntentId: intent.creditIntentId, subjectId: SUBJECT_ID,
    principalId: PRINCIPAL_ID, authorityType: "mandate", authorityRef: mandate.mandateId,
    mandateId: mandate.mandateId, assetId: ASSET_ID, status: "approved",
    modelVersion: SANDBOX_CREDIT_DECISION_POLICY.modelVersion, limitMinor: "100000",
    utilizationMinor: "0", policyHash: SANDBOX_CREDIT_POLICY_HASH,
    sandboxOnly: true, productionAuthority: false, schemaVersion: "risk_decision.v3"
  };
  const offer = {
    creditOfferId: "credit_offer_exec002_local", creditOfferHash: h("offer"),
    termsHash: h("offer_terms"), creditIntentId: intent.creditIntentId,
    subjectId: SUBJECT_ID, riskDecisionId: decision.riskDecisionId, assetId: ASSET_ID,
    approvedPrincipalMinor: "100000", status: "accepted", sandboxOnly: true,
    productionFundsApproved: false, schemaVersion: "credit_offer.v1"
  };
  const acceptance = {
    creditOfferAcceptanceId: "credit_offer_acceptance_exec002_local",
    acceptanceHash: h("acceptance"), creditOfferId: offer.creditOfferId,
    creditOfferHash: offer.creditOfferHash, termsHash: offer.termsHash,
    creditIntentId: intent.creditIntentId, riskDecisionId: decision.riskDecisionId,
    subjectId: SUBJECT_ID, principalId: PRINCIPAL_ID, authorityType: "mandate",
    authorityRef: mandate.mandateId, mandateId: mandate.mandateId, sandboxOnly: true,
    productionAuthority: false, schemaVersion: "credit_offer_acceptance.v1"
  };
  const obligation = {
    obligationId: "obligation_exec002_local", obligationHash: h("obligation"),
    subjectId: SUBJECT_ID, principalId: PRINCIPAL_ID,
    creditIntentId: intent.creditIntentId, riskDecisionId: decision.riskDecisionId,
    creditOfferId: offer.creditOfferId,
    creditOfferAcceptanceId: acceptance.creditOfferAcceptanceId,
    authorityType: "mandate", authorityRef: mandate.mandateId, mandateId: mandate.mandateId,
    assetId: ASSET_ID, originalPrincipalMinor: "100000",
    outstandingPrincipalMinor: "100000", status: "active", executionStatus: "executed",
    sandboxOnly: true, productionFundsMoved: false, schemaVersion: "obligation.v2"
  };
  const exposure = {
    subjectId: SUBJECT_ID, assetId: ASSET_ID, outstandingPrincipalMinor: "0",
    committedLimitMinor: "0",
    exposureHash: createAgentCreditExposureHash({ subjectId: SUBJECT_ID, assetId: ASSET_ID, obligations: [] }),
    obligations: [], schemaVersion: "agent_credit_exposure.v1"
  };
  const creditLine = deriveAgentCreditLineProjection({
    intent, decision, offer, acceptance,
    obligation: { ...obligation, status: "created", executionStatus: "pending" },
    authority: mandate, exposure, principalDeltaMinor: "100000", now
  }).value;
  return {
    mandate, spendPolicy, creditLine, obligation,
    accountBinding: {
      accountBindingId: "account_binding_exec002_local", accountHash: h("account"),
      subjectId: SUBJECT_ID, chainId: "eip155:84532", status: "active",
      schemaVersion: "account_binding.v2"
    }
  };
}

async function authorizedDecision(harness, identity, operationId, resource, idempotencyKey, now, overrides = {}) {
  if (!await harness.directory.resolveResource(resource)) {
    harness.directory.registerResource({
      tenantId: TENANT_ID,
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
      ownerActorId: ACTOR_ID,
      now
    });
  }
  const checks = harness.policyRegistry.getAuthenticated(operationId).liveChecks;
  harness.livePolicyAdapter.register({
    tenantId: TENANT_ID, operationId, resourceType: resource.resourceType,
    resourceId: resource.resourceId, checks, allowed: true
  });
  const decision = await harness.service.authorize(authorizationRequest(
    identity.authenticationContext,
    operationId,
    { resource, idempotencyKey, now, ...overrides }
  ));
  return harness.service.revalidate({
    decision,
    authenticationContext: identity.authenticationContext,
    now: new Date(now.getTime() + 1_000)
  });
}

async function fixture({ allowedSelectors = [SELECTOR], calldata = SELECTOR, expectedEffects, stepUpRequired = false } = {}) {
  const harness = createAuthorizationHarness();
  const identity = harness.addIdentity({
    tenantId: TENANT_ID, actorId: ACTOR_ID, actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.PRINCIPAL_CONTROLLER,
    capabilities: [
      PilotCapability.WALLET_GRANT_PREPARE_OWNED,
      PilotCapability.WALLET_GRANT_ACTIVATE_OWNED,
      PilotCapability.WALLET_GRANT_READ_OWNED,
      PilotCapability.WALLET_GRANT_REVOKE_OWNED,
      PilotCapability.WALLET_EXECUTION_PREPARE_OWNED,
      PilotCapability.WALLET_EXECUTION_APPROVE_OWNED,
      PilotCapability.WALLET_EXECUTION_SUBMIT_OWNED,
      PilotCapability.WALLET_EXECUTION_READ_OWNED
    ],
    now: FIXED_NOW
  });
  const now = new Date(FIXED_NOW.getTime() + 2_000);
  const authority = canonicalAuthority(now);
  const targetPolicy = createExecutionTargetPolicy({
    providerId: PROVIDER_ID, chainId: "eip155:84532", targetAddress: TARGET,
    codeHash: h("target_code"), allowedFunctionSelectors: allowedSelectors,
    validFrom: new Date(now.getTime() - 1_000).toISOString(),
    expiresAt: new Date(now.getTime() + 1_800_000).toISOString(), now
  });
  const prepareGrantDecision = await authorizedDecision(
    harness, identity, "walletPrepareGrant",
    { resourceType: "subject", resourceId: SUBJECT_ID },
    "exec002-prepare-grant-0001", now
  );
  const preparedGrant = prepareDelegatedWalletGrant({
    authorizationDecision: prepareGrantDecision, ...authority, targetPolicies: [targetPolicy],
    requestedExpiresAt: new Date(now.getTime() + 900_000).toISOString(),
    sessionEpoch: 11, nonce: "exec002-grant-nonce-0001", now: new Date(now.getTime() + 1_000)
  });
  const activationDecision = await authorizedDecision(
    harness, identity, "walletActivateGrant",
    { resourceType: "delegated_wallet_grant", resourceId: preparedGrant.grantId },
    "exec002-activate-grant-0001", new Date(now.getTime() + 2_000)
  );
  const grant = activateDelegatedWalletGrant({
    grant: preparedGrant, authorizationDecision: activationDecision,
    externalPermissionProjection: {
      adapterId: preparedGrant.adapterId, chainIds: preparedGrant.chainIds,
      assetIds: preparedGrant.assetIds, targetPolicyIds: preparedGrant.allowedTargetPolicyIds,
      perTxLimitMinor: preparedGrant.perTxLimitMinor,
      rolling24hLimitMinor: preparedGrant.rolling24hLimitMinor,
      aggregateLimitMinor: preparedGrant.aggregateLimitMinor,
      obligationLimitMinor: preparedGrant.obligationLimitMinor,
      expiresAt: preparedGrant.expiresAt, sessionEpoch: preparedGrant.sessionEpoch,
      sandboxOnly: true, transactionsAllowed: false, productionAuthority: false,
      fundsAuthority: false
    },
    now: new Date(now.getTime() + 3_000)
  }).value;
  const reservation = createPendingExposureReservation({
    grant, targetPolicy, amountMinor: "5000", sessionEpoch: grant.sessionEpoch,
    idempotencyKey: "exec002-reservation-0001",
    expiresAt: new Date(now.getTime() + 180_000).toISOString(),
    now: new Date(now.getTime() + 4_000)
  });
  const prepareExecutionDecision = await authorizedDecision(
    harness, identity, "walletPrepareExecution",
    { resourceType: "delegated_wallet_grant", resourceId: grant.grantId },
    "exec002-prepare-execution-0001", new Date(now.getTime() + 5_000)
  );
  const effects = expectedEffects ?? {
    nativeDeltaMinor: "0",
    assetDeltas: [{ assetId: ASSET_ID, accountRefHash: h("effect_account"), deltaMinor: "-5000" }],
    allowanceDeltas: [], withdrawal: false, transfer: false
  };
  const preparedExecution = constructPreparedExecution({
    grant, targetPolicy, reservation, authorizationDecision: prepareExecutionDecision,
    transferIntentId: "transfer_intent_exec002_local",
    resolvedAction: {
      chainId: "eip155:84532", accountRefHash: h("execution_account"),
      targetAddress: TARGET, calldata, nativeValueMinor: "0"
    },
    expectedEffects: effects, stepUpRequired,
    expiresAt: new Date(now.getTime() + 150_000).toISOString(),
    now: new Date(now.getTime() + 6_000)
  });
  const simulationReport = createSimulationReport({
    preparedExecution, simulatorId: "local_deterministic_evm",
    simulatorVersion: "exec002.v1",
    result: {
      status: "succeeded", chainId: "eip155:84532", blockNumber: "123456",
      blockHash: h("block"), observedCodeHash: targetPolicy.codeHash,
      observedProxyImplementationHash: targetPolicy.proxyImplementationHash,
      effects, threatCheckStatus: "passed", revertReasonHash: null
    },
    expiresAt: new Date(now.getTime() + 120_000).toISOString(),
    now: new Date(now.getTime() + 7_000)
  });
  return { harness, identity, now, targetPolicy, grant, reservation, preparedExecution, simulationReport };
}

function evaluate(state, overrides = {}) {
  return evaluateTransactionPreflight({
    preparedExecution: state.preparedExecution,
    currentGrant: state.grant,
    targetPolicy: state.targetPolicy,
    reservation: state.reservation,
    simulationReport: state.simulationReport,
    currentChainId: "eip155:84532",
    currentSessionEpoch: state.grant.sessionEpoch,
    now: new Date(state.now.getTime() + 8_000),
    ...overrides
  });
}

test("EXEC-002 constructs and verifies one exact local payload and ALLOW receipt", async () => {
  const state = await fixture();
  assert.equal(verifyPreparedExecution(state.preparedExecution, { now: new Date(state.now.getTime() + 8_000) }), true);
  assert.equal(verifySimulationReport(state.simulationReport, { now: new Date(state.now.getTime() + 8_000) }), true);
  const receipt = evaluate(state);
  assert.equal(receipt.decision, ExecutionDecision.ALLOW);
  assert.deepEqual(receipt.reasonCodes, ["preflight_passed"]);
  assert.equal(verifyTransactionPreflightReceipt(receipt, { now: new Date(state.now.getTime() + 9_000) }), true);
  assert.equal(state.preparedExecution.payload.functionSelector, SELECTOR);
  assert.equal(state.preparedExecution.transactionsAllowed, false);
  assert.deepEqual(describeAgenticExecutionPreflightBoundary().decisions, ["ALLOW", "STEP_UP", "DENY", "QUARANTINE"]);
});

test("EXEC-002 simulation port receives only the exact prepared execution", async () => {
  const state = await fixture();
  const calls = [];
  const report = await runPreparedExecutionSimulation({
    port: {
      async simulate(input) {
        calls.push(input);
        return {
          simulatorId: "local_deterministic_evm",
          simulatorVersion: "exec002.v1",
          result: {
            status: "succeeded",
            chainId: "eip155:84532",
            blockNumber: "123456",
            blockHash: h("block"),
            observedCodeHash: state.targetPolicy.codeHash,
            observedProxyImplementationHash: state.targetPolicy.proxyImplementationHash,
            effects: {
              nativeDeltaMinor: state.preparedExecution.expectedEffects.nativeDeltaMinor,
              assetDeltas: state.preparedExecution.expectedEffects.assetDeltas,
              allowanceDeltas: state.preparedExecution.expectedEffects.allowanceDeltas,
              withdrawal: false,
              transfer: false
            },
            threatCheckStatus: "passed",
            revertReasonHash: null
          }
        };
      }
    },
    preparedExecution: state.preparedExecution,
    expiresAt: new Date(state.now.getTime() + 120_000).toISOString(),
    now: new Date(state.now.getTime() + 7_000)
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]), ["preparedExecution"]);
  assert.equal(calls[0].preparedExecution.preparedExecutionHash, state.preparedExecution.preparedExecutionHash);
  assert.equal(report.externalCallPerformed, false);
});

test("EXEC-002 denies wrong chain and unknown selector", async () => {
  const wrongChain = await fixture();
  assert.equal(evaluate(wrongChain, { currentChainId: "eip155:1952" }).decision, ExecutionDecision.DENY);
  assert.ok(evaluate(wrongChain, { currentChainId: "eip155:1952" }).reasonCodes.includes("wrong_chain"));
  const unknownSelector = await fixture({ allowedSelectors: ["0xaaaaaaaa"] });
  const receipt = evaluate(unknownSelector);
  assert.equal(receipt.decision, ExecutionDecision.DENY);
  assert.ok(receipt.reasonCodes.includes("unknown_selector"));
});

test("EXEC-002 denies an unlimited ERC-20 approval under approvalMode none", async () => {
  const spenderSlot = `${"0".repeat(24)}2222222222222222222222222222222222222222`;
  const amountSlot = "f".repeat(64);
  const effects = {
    nativeDeltaMinor: "0", assetDeltas: [],
    allowanceDeltas: [{
      assetId: ASSET_ID, spenderAddress: "0x2222222222222222222222222222222222222222",
      previousAllowanceMinor: "0", nextAllowanceMinor: ((2n ** 256n) - 1n).toString()
    }], withdrawal: false, transfer: false
  };
  const state = await fixture({
    allowedSelectors: ["0x095ea7b3"], calldata: `0x095ea7b3${spenderSlot}${amountSlot}`, expectedEffects: effects
  });
  const receipt = evaluate(state);
  assert.equal(receipt.decision, ExecutionDecision.DENY);
  assert.ok(receipt.reasonCodes.includes("unlimited_approval_denied"));
});

test("EXEC-002 quarantines code, proxy and simulated-effect drift", async () => {
  const state = await fixture();
  const codeDriftSimulation = createSimulationReport({
    preparedExecution: state.preparedExecution, simulatorId: "local_deterministic_evm",
    simulatorVersion: "exec002.v1",
    result: {
      status: "succeeded", chainId: "eip155:84532", blockNumber: "123457",
      blockHash: h("block_drift"), observedCodeHash: h("changed_code"),
      observedProxyImplementationHash: h("unexpected_proxy"),
      effects: {
        nativeDeltaMinor: "0", assetDeltas: [], allowanceDeltas: [],
        withdrawal: false, transfer: false
      },
      threatCheckStatus: "passed", revertReasonHash: null
    },
    expiresAt: new Date(state.now.getTime() + 120_000).toISOString(),
    now: new Date(state.now.getTime() + 7_500)
  });
  const receipt = evaluate(state, { simulationReport: codeDriftSimulation });
  assert.equal(receipt.decision, ExecutionDecision.QUARANTINE);
  assert.ok(receipt.reasonCodes.includes("code_hash_changed"));
  assert.ok(receipt.reasonCodes.includes("proxy_implementation_changed"));
  assert.ok(receipt.reasonCodes.includes("simulated_effects_diverged"));
});

test("EXEC-002 returns STEP_UP only inside hard policy bounds", async () => {
  const state = await fixture({ stepUpRequired: true });
  const receipt = evaluate(state);
  assert.equal(receipt.decision, ExecutionDecision.STEP_UP);
  assert.deepEqual(receipt.reasonCodes, ["exact_human_approval_required"]);
});

test("EXEC-002 denies a revoked grant", async () => {
  const state = await fixture();
  const revokeDecision = await authorizedDecision(
    state.harness, state.identity, "walletRevokeGrant",
    { resourceType: "delegated_wallet_grant", resourceId: state.grant.grantId },
    "exec002-revoke-grant-0001", new Date(state.now.getTime() + 8_000),
    { reasonCode: "operator_request" }
  );
  const revoked = revokeDelegatedWalletGrant({
    grant: state.grant, authorizationDecision: revokeDecision,
    reasonCode: "operator_request", now: new Date(state.now.getTime() + 9_000)
  }).value;
  const receipt = evaluate(state, { currentGrant: revoked, now: new Date(state.now.getTime() + 10_000) });
  assert.equal(receipt.decision, ExecutionDecision.DENY);
  assert.ok(receipt.reasonCodes.includes("grant_not_active"));
});

test("EXEC-002 stale receipt cannot submit and fresh ALLOW remains locally disabled", async () => {
  const state = await fixture();
  const receipt = evaluate(state);
  assert.throws(
    () => assertWalletSubmissionDisabled({
      preparedExecution: state.preparedExecution, preflightReceipt: receipt,
      currentGrant: state.grant, targetPolicy: state.targetPolicy,
      reservation: state.reservation, currentChainId: "eip155:84532",
      currentSessionEpoch: state.grant.sessionEpoch,
      now: new Date(receipt.expiresAt)
    }),
    { code: "stale_transaction_preflight" }
  );
  assert.throws(
    () => assertWalletSubmissionDisabled({
      preparedExecution: state.preparedExecution, preflightReceipt: receipt,
      currentGrant: state.grant, targetPolicy: state.targetPolicy,
      reservation: state.reservation, currentChainId: "eip155:84532",
      currentSessionEpoch: state.grant.sessionEpoch,
      now: new Date(state.now.getTime() + 9_000)
    }),
    { code: "execution_submission_disabled_l0_local_no_funds" }
  );
});

test("EXEC-002 stale simulation is invalidated before a decision can be issued", async () => {
  const state = await fixture();
  assert.throws(
    () => evaluate(state, { now: new Date(state.simulationReport.expiresAt) }),
    { code: "stale_agentic_execution_simulation" }
  );
});
