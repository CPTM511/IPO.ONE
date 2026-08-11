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
  DelegatedWalletGrantStatus,
  activateDelegatedWalletGrant,
  createExecutionTargetPolicy,
  createPendingExposureReservation,
  describeAgenticExecutionGrantBoundary,
  prepareDelegatedWalletGrant,
  releasePendingExposureReservation,
  revokeDelegatedWalletGrant,
  verifyDelegatedWalletGrant,
  verifyExecutionTargetPolicy
} from "../src/index.js";

const TENANT_ID = "tenant_agentic_execution_local";
const ACTOR_ID = "actor_principal_controller_local";
const SUBJECT_ID = "subject_agentic_execution_local";
const PRINCIPAL_ID = "principal_agentic_execution_local";
const PROVIDER_ID = "provider_sandbox_inventory";
const ASSET_ID = SANDBOX_CREDIT_DECISION_POLICY.assetId;

function h(scope) {
  return hashId(`agentic_execution_test_${scope}`, { fixture: true });
}

function canonicalAuthority(now) {
  const mandate = {
    mandateId: "mandate_agentic_execution_local",
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
    spendPolicyId: "spend_policy_agentic_execution_local",
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
    creditIntentId: "credit_intent_agentic_execution_local",
    creditIntentHash: h("intent"),
    subjectId: SUBJECT_ID,
    principalId: PRINCIPAL_ID,
    authorityType: "mandate",
    authorityRef: mandate.mandateId,
    assetId: ASSET_ID,
    requestedPrincipalMinor: "100000",
    purposeCode: "provider_inventory",
    requestedTermDays: 30,
    repaymentFrequency: "end_of_term",
    installmentCount: 1,
    sandboxOnly: true,
    productionFundsRequested: false,
    status: "decided",
    schemaVersion: "credit_intent.v1"
  };
  const decision = {
    riskDecisionId: "risk_decision_agentic_execution_local",
    decisionHash: h("decision"),
    creditIntentId: intent.creditIntentId,
    subjectId: SUBJECT_ID,
    principalId: PRINCIPAL_ID,
    authorityType: "mandate",
    authorityRef: mandate.mandateId,
    mandateId: mandate.mandateId,
    assetId: ASSET_ID,
    status: "approved",
    modelVersion: SANDBOX_CREDIT_DECISION_POLICY.modelVersion,
    limitMinor: "100000",
    utilizationMinor: "0",
    policyHash: SANDBOX_CREDIT_POLICY_HASH,
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "risk_decision.v3"
  };
  const offer = {
    creditOfferId: "credit_offer_agentic_execution_local",
    creditOfferHash: h("offer"),
    termsHash: h("offer_terms"),
    creditIntentId: intent.creditIntentId,
    subjectId: SUBJECT_ID,
    riskDecisionId: decision.riskDecisionId,
    assetId: ASSET_ID,
    approvedPrincipalMinor: "100000",
    status: "accepted",
    sandboxOnly: true,
    productionFundsApproved: false,
    schemaVersion: "credit_offer.v1"
  };
  const acceptance = {
    creditOfferAcceptanceId: "credit_offer_acceptance_agentic_execution_local",
    acceptanceHash: h("acceptance"),
    creditOfferId: offer.creditOfferId,
    creditOfferHash: offer.creditOfferHash,
    termsHash: offer.termsHash,
    creditIntentId: intent.creditIntentId,
    riskDecisionId: decision.riskDecisionId,
    subjectId: SUBJECT_ID,
    principalId: PRINCIPAL_ID,
    authorityType: "mandate",
    authorityRef: mandate.mandateId,
    mandateId: mandate.mandateId,
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "credit_offer_acceptance.v1"
  };
  const obligation = {
    obligationId: "obligation_agentic_execution_local",
    obligationHash: h("obligation"),
    subjectId: SUBJECT_ID,
    principalId: PRINCIPAL_ID,
    creditIntentId: intent.creditIntentId,
    riskDecisionId: decision.riskDecisionId,
    creditOfferId: offer.creditOfferId,
    creditOfferAcceptanceId: acceptance.creditOfferAcceptanceId,
    authorityType: "mandate",
    authorityRef: mandate.mandateId,
    mandateId: mandate.mandateId,
    assetId: ASSET_ID,
    originalPrincipalMinor: "100000",
    outstandingPrincipalMinor: "100000",
    status: "active",
    executionStatus: "executed",
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "obligation.v2"
  };
  const exposure = {
    subjectId: SUBJECT_ID,
    assetId: ASSET_ID,
    outstandingPrincipalMinor: "0",
    committedLimitMinor: "0",
    exposureHash: createAgentCreditExposureHash({
      subjectId: SUBJECT_ID,
      assetId: ASSET_ID,
      obligations: []
    }),
    obligations: [],
    schemaVersion: "agent_credit_exposure.v1"
  };
  const creditLine = deriveAgentCreditLineProjection({
    intent,
    decision,
    offer,
    acceptance,
    obligation: { ...obligation, status: "created", executionStatus: "pending" },
    authority: mandate,
    exposure,
    principalDeltaMinor: "100000",
    now
  }).value;
  return {
    mandate,
    spendPolicy,
    creditLine,
    obligation,
    accountBinding: {
      accountBindingId: "account_binding_agentic_execution_local",
      accountHash: h("account"),
      subjectId: SUBJECT_ID,
      chainId: "eip155:84532",
      status: "active",
      schemaVersion: "account_binding.v2"
    }
  };
}

async function authorizedDecision(
  harness,
  identity,
  operationId,
  resource,
  idempotencyKey,
  now,
  overrides = {}
) {
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
    tenantId: TENANT_ID,
    operationId,
    resourceType: resource.resourceType,
    resourceId: resource.resourceId,
    checks,
    allowed: true
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

async function grantFixture() {
  const harness = createAuthorizationHarness();
  const identity = harness.addIdentity({
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.PRINCIPAL_CONTROLLER,
    capabilities: [
      PilotCapability.WALLET_GRANT_PREPARE_OWNED,
      PilotCapability.WALLET_GRANT_ACTIVATE_OWNED,
      PilotCapability.WALLET_GRANT_READ_OWNED,
      PilotCapability.WALLET_GRANT_REVOKE_OWNED
    ],
    now: FIXED_NOW
  });
  const now = new Date(FIXED_NOW.getTime() + 2_000);
  const authority = canonicalAuthority(now);
  const targetPolicy = createExecutionTargetPolicy({
    providerId: PROVIDER_ID,
    chainId: "eip155:84532",
    targetAddress: "0x1111111111111111111111111111111111111111",
    codeHash: h("target_code"),
    allowedFunctionSelectors: ["0x12345678"],
    validFrom: new Date(now.getTime() - 1_000).toISOString(),
    expiresAt: new Date(now.getTime() + 1_800_000).toISOString(),
    now
  });
  const prepareDecision = await authorizedDecision(
    harness,
    identity,
    "walletPrepareGrant",
    { resourceType: "subject", resourceId: SUBJECT_ID },
    "wallet-grant-prepare-local-0001",
    now
  );
  const prepared = prepareDelegatedWalletGrant({
    authorizationDecision: prepareDecision,
    ...authority,
    targetPolicies: [targetPolicy],
    requestedExpiresAt: new Date(now.getTime() + 900_000).toISOString(),
    sessionEpoch: 7,
    nonce: "wallet-grant-nonce-0001",
    now: new Date(now.getTime() + 1_000)
  });
  const activationDecision = await authorizedDecision(
    harness,
    identity,
    "walletActivateGrant",
    { resourceType: "delegated_wallet_grant", resourceId: prepared.grantId },
    "wallet-grant-activate-local-0001",
    new Date(now.getTime() + 2_000)
  );
  const activation = activateDelegatedWalletGrant({
    grant: prepared,
    authorizationDecision: activationDecision,
    externalPermissionProjection: {
      adapterId: prepared.adapterId,
      chainIds: prepared.chainIds,
      assetIds: prepared.assetIds,
      targetPolicyIds: prepared.allowedTargetPolicyIds,
      perTxLimitMinor: prepared.perTxLimitMinor,
      rolling24hLimitMinor: prepared.rolling24hLimitMinor,
      aggregateLimitMinor: prepared.aggregateLimitMinor,
      obligationLimitMinor: prepared.obligationLimitMinor,
      expiresAt: prepared.expiresAt,
      sessionEpoch: prepared.sessionEpoch,
      sandboxOnly: true,
      transactionsAllowed: false,
      productionAuthority: false,
      fundsAuthority: false
    },
    now: new Date(now.getTime() + 3_000)
  });
  return {
    harness,
    identity,
    now,
    authority,
    targetPolicy,
    prepared,
    activationDecision,
    activation
  };
}

test("EXEC-001 derives an exact local no-funds grant from canonical authority", async () => {
  const state = await grantFixture();
  assert.equal(verifyExecutionTargetPolicy(state.targetPolicy, { now: state.now }), true);
  assert.equal(state.prepared.status, DelegatedWalletGrantStatus.PREPARED);
  assert.equal(state.prepared.perTxLimitMinor, "60000");
  assert.equal(state.prepared.rolling24hLimitMinor, "90000");
  assert.equal(state.prepared.aggregateLimitMinor, "100000");
  assert.equal(state.prepared.obligationLimitMinor, "80000");
  assert.equal(state.activation.value.status, DelegatedWalletGrantStatus.ACTIVE);
  assert.equal(state.activation.value.transactionsAllowed, false);
  assert.equal(state.activation.value.productionAuthority, false);
  assert.equal(state.activation.value.fundsAuthority, false);
  assert.equal(verifyDelegatedWalletGrant(state.activation.value, {
    now: new Date(state.now.getTime() + 4_000),
    requireUsable: true
  }), true);
  assert.deepEqual(describeAgenticExecutionGrantBoundary(), {
    schemaVersion: "agentic_execution_grant_boundary.v1",
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    enabledChains: ["eip155:84532", "eip155:1952"],
    enabledAdapters: ["local_sandbox"],
    mutationRoles: ["principal_controller"],
    agentMutationAllowed: false,
    externalPermissionProvisioning: false,
    exactPayloadAvailable: false,
    simulationAvailable: false,
    transactionsAllowed: false,
    productionAuthority: false,
    fundsAuthority: false
  });
});

test("EXEC-001 rejects permission widening, session drift, and terminal reuse", async () => {
  const state = await grantFixture();
  const active = state.activation.value;
  assert.throws(
    () => activateDelegatedWalletGrant({
      grant: state.prepared,
      authorizationDecision: state.activationDecision,
      externalPermissionProjection: {
        adapterId: state.prepared.adapterId,
        chainIds: state.prepared.chainIds,
        assetIds: state.prepared.assetIds,
        targetPolicyIds: state.prepared.allowedTargetPolicyIds,
        perTxLimitMinor: (BigInt(state.prepared.perTxLimitMinor) + 1n).toString(),
        rolling24hLimitMinor: state.prepared.rolling24hLimitMinor,
        aggregateLimitMinor: state.prepared.aggregateLimitMinor,
        obligationLimitMinor: state.prepared.obligationLimitMinor,
        expiresAt: state.prepared.expiresAt,
        sessionEpoch: state.prepared.sessionEpoch,
        sandboxOnly: true,
        transactionsAllowed: false,
        productionAuthority: false,
        fundsAuthority: false
      },
      now: new Date(state.now.getTime() + 3_000)
    }),
    { code: "agentic_execution_external_permission_widened" }
  );
  assert.throws(
    () => createPendingExposureReservation({
      grant: active,
      targetPolicy: state.targetPolicy,
      amountMinor: "1",
      sessionEpoch: active.sessionEpoch + 1,
      idempotencyKey: "pending-exposure-session-drift-0001",
      expiresAt: new Date(state.now.getTime() + 60_000).toISOString(),
      now: new Date(state.now.getTime() + 4_000)
    }),
    { code: "agentic_execution_context_stale" }
  );
  const revokeDecision = await authorizedDecision(
    state.harness,
    state.identity,
    "walletRevokeGrant",
    { resourceType: "delegated_wallet_grant", resourceId: active.grantId },
    "wallet-grant-revoke-local-0001",
    new Date(state.now.getTime() + 4_000),
    { reasonCode: "operator_request" }
  );
  const revoked = revokeDelegatedWalletGrant({
    grant: active,
    authorizationDecision: revokeDecision,
    reasonCode: "operator_request",
    now: new Date(state.now.getTime() + 5_000)
  });
  assert.equal(revoked.value.status, DelegatedWalletGrantStatus.REVOKED);
  assert.equal(revoked.value.pendingExposureMinor, "0");
  assert.throws(
    () => revokeDelegatedWalletGrant({
      grant: revoked.value,
      authorizationDecision: revokeDecision,
      reasonCode: "operator_request",
      now: new Date(state.now.getTime() + 6_000)
    }),
    { code: "agentic_execution_grant_terminal" }
  );
});

test("EXEC-001 creates short-lived pending exposure without transaction authority", async () => {
  const state = await grantFixture();
  const active = state.activation.value;
  const reserved = createPendingExposureReservation({
    grant: active,
    targetPolicy: state.targetPolicy,
    amountMinor: "5000",
    sessionEpoch: active.sessionEpoch,
    idempotencyKey: "pending-exposure-local-0001",
    expiresAt: new Date(state.now.getTime() + 120_000).toISOString(),
    now: new Date(state.now.getTime() + 4_000)
  });
  assert.equal(reserved.status, "reserved");
  assert.equal(reserved.transactionsAllowed, false);
  const released = releasePendingExposureReservation(reserved, {
    reasonCode: "cancelled_before_submission",
    now: new Date(state.now.getTime() + 5_000)
  });
  assert.equal(released.status, "released");
  assert.equal(released.releaseReasonCode, "cancelled_before_submission");
});
