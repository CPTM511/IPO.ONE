import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ApprovalRequirement,
  AuthorizationPolicyRegistry,
  AuthorizationSurface,
  PilotCapability,
  PUBLIC_SANDBOX_OPERATION_POLICIES,
  ROLE_BUNDLE_CAPABILITIES,
  RoleBundle,
  TENANT_OPERATION_POLICIES,
  assertPolicyTransitionDoesNotBroaden
} from "../src/index.js";

test("HYPERLIQUID-002A keeps Venue delegate administration Human-MFA-only", () => {
  const registry = new AuthorizationPolicyRegistry();
  const principal = ROLE_BUNDLE_CAPABILITIES[RoleBundle.PRINCIPAL_CONTROLLER];
  const agent = ROLE_BUNDLE_CAPABILITIES[RoleBundle.AGENT_RUNTIME];
  for (const operationId of [
    "venuePrepareDelegate", "venueActivateDelegate", "venueRevokeDelegate"
  ]) {
    const policy = registry.getAuthenticated(operationId);
    assert.deepEqual(policy.allowedActorTypes, ["human"]);
    assert.deepEqual(policy.requiresRecentMfaActorTypes, ["human"]);
    assert.equal(principal.includes(policy.requiredCapability), true);
    assert.equal(agent.includes(policy.requiredCapability), false);
  }
  for (const operationId of [
    "venueDiscoverCapabilities", "venueReadBinding", "venuePrepareExecution",
    "venueSubmitExecution", "venueReadExecution"
  ]) {
    const policy = registry.getAuthenticated(operationId);
    assert.equal(policy.allowedActorTypes.includes("agent"), true);
    assert.equal(agent.includes(policy.requiredCapability), true);
  }
});

test("Capital Partner operator is a dedicated Human least-privilege role", () => {
  const capabilities = ROLE_BUNDLE_CAPABILITIES[RoleBundle.CAPITAL_PARTNER_OPERATOR];
  assert.deepEqual(capabilities, [
    PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
    PilotCapability.CAPITAL_PARTNER_OFFER_CREATE_OWN,
    PilotCapability.CAPITAL_PARTNER_OFFER_MANAGE_OWN,
    PilotCapability.CAPITAL_PARTNER_PORTFOLIO_READ_OWN,
    PilotCapability.CAPITAL_PARTNER_FACILITY_READ_OWN
  ]);
  for (const forbidden of [
    PilotCapability.CREDIT_REQUEST,
    PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
    PilotCapability.RISK_FREEZE,
    PilotCapability.PROVIDER_INTENT_ACKNOWLEDGE,
    PilotCapability.TENANT_MEMBERSHIP_MANAGE
  ]) {
    assert.equal(capabilities.includes(forbidden), false);
  }
  const registry = new AuthorizationPolicyRegistry();
  assert.equal(
    registry.getAuthenticated("pilotAuthorCapitalPartnerOffer").requiredCapability,
    PilotCapability.CAPITAL_PARTNER_OFFER_CREATE_OWN
  );
  assert.equal(
    registry.getAuthenticated("pilotTransitionCapitalPartnerOffer").ownershipRule,
    "actor"
  );
  assert.equal(
    registry.getAuthenticated("pilotReadCapitalPartnerPortfolio").resourceType,
    "capital_partner_profile"
  );
});

test("the policy registry classifies every OpenAPI operation and keeps the public sandbox separate", async () => {
  const spec = JSON.parse(await readFile("api/openapi/ipo-one.v1.json", "utf8"));
  const documented = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      documented.push({ operationId: operation.operationId, method: method.toUpperCase(), path });
    }
  }
  const registered = PUBLIC_SANDBOX_OPERATION_POLICIES.map((policy) => ({
    operationId: policy.operationId,
    method: policy.transport.method,
    path: policy.transport.path
  }));
  assert.deepEqual(
    registered.sort((left, right) => left.operationId.localeCompare(right.operationId)),
    documented.sort((left, right) => left.operationId.localeCompare(right.operationId))
  );
  assert.equal(PUBLIC_SANDBOX_OPERATION_POLICIES.every(
    (policy) => policy.surface === AuthorizationSurface.PUBLIC_SANDBOX
  ), true);
  const registry = new AuthorizationPolicyRegistry();
  assert.equal(registry.getAuthenticated("createAgent"), undefined);
  assert.equal(registry.getAuthenticated("pilotSubmitSpend").auditRequirement, "allow_and_deny");

  const mutable = structuredClone(TENANT_OPERATION_POLICIES.find(
    (policy) => policy.operationId === "pilotSubmitSpend"
  ));
  const isolatedRegistry = new AuthorizationPolicyRegistry({
    publicOperations: [],
    tenantOperations: [mutable]
  });
  mutable.allowedActorTypes.push("human");
  mutable.liveChecks.length = 0;
  assert.deepEqual(isolatedRegistry.getAuthenticated("pilotSubmitSpend").allowedActorTypes, ["agent"]);
  assert.deepEqual(
    isolatedRegistry.getAuthenticated("pilotSubmitSpend").liveChecks,
    ["mandate", "spend_policy", "risk", "cap", "freeze"]
  );

  const mandateRead = registry.getAuthenticated("pilotReadMandate");
  assert.equal(mandateRead.requiredCapability, PilotCapability.INTEGRATION_READ_OWNED);
  assert.equal(mandateRead.ownershipRule, "actor");
  assert.deepEqual(mandateRead.allowedActorTypes, ["human"]);
  const mandateRevoke = registry.getAuthenticated("pilotRevokeDraftMandate");
  assert.equal(mandateRevoke.requiredCapability, PilotCapability.MANDATE_DRAFT_REVOKE);
  assert.equal(mandateRevoke.ownershipRule, "actor");
  assert.deepEqual(mandateRevoke.liveChecks, ["mandate_state"]);
  assert.deepEqual(mandateRevoke.reasonPolicy.allowedCodes, [
    "credential_compromise",
    "operator_request",
    "security_incident"
  ]);
  assert.equal(
    ROLE_BUNDLE_CAPABILITIES[RoleBundle.DEVELOPER].includes(PilotCapability.MANDATE_DRAFT_REVOKE),
    true
  );

  const humanBorrower = ROLE_BUNDLE_CAPABILITIES[RoleBundle.HUMAN_BORROWER];
  assert.deepEqual(humanBorrower, [
    PilotCapability.HUMAN_SUBJECT_CREATE_SELF,
    PilotCapability.SUBJECT_READ_SELF,
    PilotCapability.WORKSPACE_RESUME_SELF,
    PilotCapability.WALLET_ACCOUNT_BINDING_PREPARE_OWNED,
    PilotCapability.WALLET_ACCOUNT_BINDING_SUBMIT_OWNED,
    PilotCapability.WALLET_ACCOUNT_BINDING_READ_OWNED,
    PilotCapability.WALLET_ACCOUNT_BINDING_REVOKE_OWNED,
    PilotCapability.WALLET_GRANT_PREPARE_OWNED,
    PilotCapability.WALLET_GRANT_ACTIVATE_OWNED,
    PilotCapability.WALLET_GRANT_READ_OWNED,
    PilotCapability.WALLET_GRANT_REVOKE_OWNED,
    PilotCapability.WALLET_CAPABILITIES_DISCOVER,
    PilotCapability.WALLET_EXECUTION_PREPARE_OWNED,
    PilotCapability.WALLET_EXECUTION_APPROVE_OWNED,
    PilotCapability.WALLET_EXECUTION_SUBMIT_OWNED,
    PilotCapability.WALLET_EXECUTION_READ_OWNED,
    PilotCapability.CONSENT_CREATE_SELF,
    PilotCapability.CONSENT_READ_SELF,
    PilotCapability.CONSENT_REVOKE_SELF,
    PilotCapability.IDENTITY_REFERENCE_READ_SELF,
    PilotCapability.CREDIT_REQUEST,
    PilotCapability.CREDIT_READ_SELF,
    PilotCapability.CREDIT_EVALUATE_SELF,
    PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
    PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
    PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
    PilotCapability.OBLIGATION_READ_OWNED,
    PilotCapability.EVIDENCE_READ_OWNED,
    PilotCapability.CREDIT_REGISTRY_EVIDENCE_READ_TENANT,
    PilotCapability.CREDIT_PASSPORT_CREATE_SELF,
    PilotCapability.CREDIT_PASSPORT_READ_SELF,
    PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
    PilotCapability.CREDIT_PASSPORT_REVOKE_SELF,
    PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
    PilotCapability.OFFICIAL_REPORT_READ_OWNED,
    PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
    PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED,
    PilotCapability.TRADING_ACCOUNT_CHALLENGE_CREATE_SELF,
    PilotCapability.TRADING_HISTORY_IMPORT_SELF,
    PilotCapability.TRADING_EVIDENCE_FINALIZE_SELF,
    PilotCapability.TRADING_CREDIT_PROFILE_READ_SELF,
    PilotCapability.TRADING_CAPITAL_REQUEST_CREATE_SELF,
    PilotCapability.TRADING_COMPATIBLE_MANDATE_LIST_SELF,
    PilotCapability.TRADING_MATCH_PROPOSAL_CREATE_SELF,
    PilotCapability.TRADING_MATCH_ACCEPT_SUBJECT,
    PilotCapability.TRADING_FACILITY_CREATE_SELF,
    PilotCapability.TRADING_FACILITY_COLLATERAL_RECORD_SELF,
    PilotCapability.TRADING_FACILITY_ACTIVATE_SELF,
    PilotCapability.TRADING_ORDER_INTENT_SUBMIT_SELF,
    PilotCapability.TRADING_ORDER_INTENT_CANCEL_SELF,
    PilotCapability.TRADING_FACILITY_READ_BOUND,
    PilotCapability.TRADING_FACILITY_CLOSE_REQUEST_SELF,
    PilotCapability.TRADING_SETTLEMENT_READ_BOUND,
    PilotCapability.TRADING_PERFORMANCE_PROOF_ISSUE_BOUND,
    PilotCapability.TRADING_FACILITY_EVIDENCE_READ_BOUND,
    PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF
  ]);
  const tradingPause = registry.getAuthenticated("tradingPauseNewRisk");
  assert.equal(
    tradingPause.approvalRequirement,
    ApprovalRequirement.PROTECTIVE
  );
  assert.deepEqual(tradingPause.allowedActorTypes, [
    "risk_operator",
    "operations_operator"
  ]);
  assert.deepEqual(tradingPause.liveChecks, ["risk", "reconciliation"]);
  const tradingFlatten = registry.getAuthenticated("tradingFlattenFacility");
  assert.equal(
    tradingFlatten.approvalRequirement,
    ApprovalRequirement.PROTECTIVE
  );
  assert.equal(tradingFlatten.ownershipRule, "tenant");
  const verifyPassport = registry.getAuthenticated("pilotVerifyCreditPassportArtifact");
  assert.equal(
    verifyPassport.requiredCapability,
    PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND
  );
  assert.equal(verifyPassport.ownershipRule, "actor");
  assert.deepEqual(verifyPassport.liveChecks, ["credit_passport_verification_state"]);
  const submitFeedback = registry.getAuthenticated("pilotSubmitPilotFeedback");
  assert.equal(submitFeedback.requiredCapability, PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF);
  assert.equal(submitFeedback.ownershipRule, "actor");
  assert.deepEqual(submitFeedback.allowedActorTypes, ["human", "agent"]);
  const readFeedback = registry.getAuthenticated("pilotReadPilotFeedbackSummary");
  assert.equal(readFeedback.requiredCapability, PilotCapability.PILOT_FEEDBACK_READ_TENANT);
  assert.equal(readFeedback.ownershipRule, "tenant");
  assert.deepEqual(
    readFeedback.requiresRecentMfaActorTypes,
    ["risk_operator", "operations_operator", "auditor"]
  );
  const ownedObligation = registry.getAuthenticated("pilotReadOwnObligation");
  assert.equal(ownedObligation.requiredCapability, PilotCapability.OBLIGATION_READ_OWNED);
  assert.equal(ownedObligation.ownershipRule, "actor");
  assert.deepEqual(ownedObligation.allowedActorTypes, ["human", "agent"]);
  const ownedEvidence = registry.getAuthenticated("pilotReadOwnObligationEvidence");
  assert.equal(ownedEvidence.requiredCapability, PilotCapability.EVIDENCE_READ_OWNED);
  assert.equal(ownedEvidence.ownershipRule, "actor");
  assert.deepEqual(ownedEvidence.allowedActorTypes, ["human", "agent"]);
  const registryEvidence = registry.getAuthenticated(
    "pilotReadCreditRegistryEvidence"
  );
  assert.equal(
    registryEvidence.requiredCapability,
    PilotCapability.CREDIT_REGISTRY_EVIDENCE_READ_TENANT
  );
  assert.equal(registryEvidence.ownershipRule, "tenant");
  assert.deepEqual(registryEvidence.allowedActorTypes, [
    "human",
    "agent",
    "risk_operator",
    "operations_operator",
    "auditor"
  ]);
  assert.deepEqual(registryEvidence.requiresRecentMfaActorTypes, [
    "risk_operator",
    "operations_operator",
    "auditor"
  ]);
  const servicingQueue = registry.getAuthenticated("pilotReadServicingQueue");
  assert.equal(servicingQueue.requiredCapability, PilotCapability.SERVICING_QUEUE_READ);
  assert.equal(servicingQueue.resourceType, "servicing_queue");
  assert.equal(servicingQueue.ownershipRule, "tenant");
  assert.deepEqual(servicingQueue.allowedActorTypes, ["risk_operator", "operations_operator"]);
  assert.deepEqual(
    servicingQueue.requiresRecentMfaActorTypes,
    ["risk_operator", "operations_operator"]
  );
  const riskPortfolioReference = registry.getAuthenticated(
    "pilotReadTenantRiskPortfolioReference"
  );
  assert.equal(riskPortfolioReference.requiredCapability, PilotCapability.RISK_READ_TENANT);
  assert.equal(riskPortfolioReference.resourceType, "workspace");
  assert.equal(riskPortfolioReference.ownershipRule, "none");
  assert.equal(riskPortfolioReference.idempotencyRequirement, "prohibited");
  assert.deepEqual(riskPortfolioReference.allowedActorTypes, ["risk_operator", "auditor"]);
  assert.deepEqual(
    riskPortfolioReference.requiresRecentMfaActorTypes,
    ["risk_operator", "auditor"]
  );
  const servicingQueueReference = registry.getAuthenticated(
    "pilotReadServicingQueueReference"
  );
  assert.equal(
    servicingQueueReference.requiredCapability,
    PilotCapability.SERVICING_QUEUE_READ
  );
  assert.equal(servicingQueueReference.resourceType, "workspace");
  assert.equal(servicingQueueReference.ownershipRule, "none");
  assert.equal(servicingQueueReference.idempotencyRequirement, "prohibited");
  assert.deepEqual(
    servicingQueueReference.allowedActorTypes,
    ["risk_operator", "operations_operator"]
  );
  assert.deepEqual(
    servicingQueueReference.requiresRecentMfaActorTypes,
    ["risk_operator", "operations_operator"]
  );
  assert.equal(
    ROLE_BUNDLE_CAPABILITIES[RoleBundle.RISK_OPERATOR].includes(
      PilotCapability.SERVICING_QUEUE_READ
    ),
    true
  );
  assert.equal(
    ROLE_BUNDLE_CAPABILITIES[RoleBundle.OPERATIONS_OPERATOR].includes(
      PilotCapability.SERVICING_QUEUE_READ
    ),
    true
  );
  for (const role of [
    RoleBundle.HUMAN_BORROWER,
    RoleBundle.AGENT_RUNTIME,
    RoleBundle.AUDITOR,
    RoleBundle.PROVIDER_SERVICE,
    RoleBundle.SYSTEM_WORKER
  ]) {
    assert.equal(
      ROLE_BUNDLE_CAPABILITIES[role].includes(PilotCapability.SERVICING_QUEUE_READ),
      false
    );
  }
  assert.equal(
    ROLE_BUNDLE_CAPABILITIES[RoleBundle.AGENT_RUNTIME].includes(PilotCapability.CREDIT_READ_SELF),
    true
  );
  assert.deepEqual(
    ROLE_BUNDLE_CAPABILITIES[RoleBundle.PRINCIPAL_CONTROLLER],
    [
      PilotCapability.AGENT_CREATE,
      PilotCapability.AGENT_MANAGE_OWNED,
      PilotCapability.WORKSPACE_RESUME_SELF,
      PilotCapability.AGENT_ACCOUNT_CHALLENGE_CREATE_OWNED,
      PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
      PilotCapability.INTEGRATION_READ_OWNED,
      PilotCapability.MANDATE_DRAFT_CREATE,
      PilotCapability.MANDATE_DRAFT_REVOKE,
      PilotCapability.MANDATE_ACTIVATE_OWNED,
      PilotCapability.WALLET_GRANT_PREPARE_OWNED,
      PilotCapability.WALLET_ACCOUNT_BINDING_PREPARE_OWNED,
      PilotCapability.WALLET_ACCOUNT_BINDING_SUBMIT_OWNED,
      PilotCapability.WALLET_ACCOUNT_BINDING_READ_OWNED,
      PilotCapability.WALLET_ACCOUNT_BINDING_REVOKE_OWNED,
      PilotCapability.WALLET_GRANT_ACTIVATE_OWNED,
      PilotCapability.WALLET_GRANT_READ_OWNED,
      PilotCapability.WALLET_GRANT_REVOKE_OWNED,
      PilotCapability.WALLET_CAPABILITIES_DISCOVER,
      PilotCapability.WALLET_EXECUTION_PREPARE_OWNED,
      PilotCapability.WALLET_EXECUTION_APPROVE_OWNED,
      PilotCapability.WALLET_EXECUTION_SUBMIT_OWNED,
      PilotCapability.WALLET_EXECUTION_READ_OWNED,
      PilotCapability.VENUE_CAPABILITIES_DISCOVER,
      PilotCapability.VENUE_BINDING_READ_OWNED,
      PilotCapability.VENUE_DELEGATE_PREPARE_OWNED,
      PilotCapability.VENUE_DELEGATE_ACTIVATE_OWNED,
      PilotCapability.VENUE_DELEGATE_REVOKE_OWNED,
      PilotCapability.VENUE_EXECUTION_PREPARE_OWNED,
      PilotCapability.VENUE_EXECUTION_SUBMIT_OWNED,
      PilotCapability.VENUE_EXECUTION_READ_OWNED,
      PilotCapability.OBLIGATION_READ_OWNED,
      PilotCapability.EVIDENCE_READ_OWNED,
      PilotCapability.CREDIT_REGISTRY_EVIDENCE_READ_TENANT,
      PilotCapability.CREDIT_PASSPORT_CREATE_SELF,
      PilotCapability.CREDIT_PASSPORT_READ_SELF,
      PilotCapability.CREDIT_PASSPORT_VERIFY_BOUND,
      PilotCapability.CREDIT_PASSPORT_REVOKE_SELF,
      PilotCapability.OFFICIAL_REPORT_CREATE_OWNED,
      PilotCapability.OFFICIAL_REPORT_READ_OWNED,
      PilotCapability.OFFICIAL_REPORT_RETRIEVE_OWNED,
      PilotCapability.OFFICIAL_REPORT_REVOKE_OWNED,
      PilotCapability.TRADING_ACCOUNT_CHALLENGE_CREATE_SELF,
      PilotCapability.TRADING_HISTORY_IMPORT_SELF,
      PilotCapability.TRADING_EVIDENCE_FINALIZE_SELF,
      PilotCapability.TRADING_CREDIT_PROFILE_READ_SELF,
      PilotCapability.TRADING_CAPITAL_REQUEST_CREATE_SELF,
      PilotCapability.TRADING_COMPATIBLE_MANDATE_LIST_SELF,
      PilotCapability.TRADING_MATCH_PROPOSAL_CREATE_SELF,
      PilotCapability.TRADING_MATCH_ACCEPT_SUBJECT,
      PilotCapability.TRADING_FACILITY_CREATE_SELF,
      PilotCapability.TRADING_FACILITY_COLLATERAL_RECORD_SELF,
      PilotCapability.TRADING_FACILITY_ACTIVATE_SELF,
      PilotCapability.TRADING_ORDER_INTENT_SUBMIT_SELF,
      PilotCapability.TRADING_ORDER_INTENT_CANCEL_SELF,
      PilotCapability.TRADING_FACILITY_READ_BOUND,
      PilotCapability.TRADING_FACILITY_CLOSE_REQUEST_SELF,
      PilotCapability.TRADING_SETTLEMENT_READ_BOUND,
      PilotCapability.TRADING_PERFORMANCE_PROOF_ISSUE_BOUND,
      PilotCapability.TRADING_FACILITY_EVIDENCE_READ_BOUND
    ]
  );
  assert.equal(
    ROLE_BUNDLE_CAPABILITIES[RoleBundle.PRINCIPAL_CONTROLLER].includes(
      PilotCapability.OBLIGATION_READ_OWNED
    ),
    true
  );
  for (const capability of [
    PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
    PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
    PilotCapability.REPAYMENT_POST_SANDBOX_SELF
  ]) {
    assert.equal(
      ROLE_BUNDLE_CAPABILITIES[RoleBundle.PRINCIPAL_CONTROLLER].includes(capability),
      false,
      `Principal Controller must not gain Agent economic mutation capability ${capability}`
    );
  }
  assert.equal(
    ROLE_BUNDLE_CAPABILITIES[RoleBundle.DEVELOPER].includes(PilotCapability.MANDATE_ACTIVATE_OWNED),
    false
  );
  assert.equal(
    ROLE_BUNDLE_CAPABILITIES[RoleBundle.AGENT_RUNTIME].includes(
      PilotCapability.WALLET_GRANT_READ_OWNED
    ),
    true
  );
  for (const role of [
    RoleBundle.AGENT_RUNTIME,
    RoleBundle.DEVELOPER,
    RoleBundle.PROVIDER_SERVICE,
    RoleBundle.TENANT_OWNER,
    RoleBundle.RISK_OPERATOR,
    RoleBundle.OPERATIONS_OPERATOR
  ]) {
    for (const capability of [
      PilotCapability.WALLET_GRANT_PREPARE_OWNED,
      PilotCapability.WALLET_GRANT_ACTIVATE_OWNED,
      PilotCapability.WALLET_GRANT_REVOKE_OWNED
    ]) {
      assert.equal(
        ROLE_BUNDLE_CAPABILITIES[role].includes(capability),
        false,
        `${role} must not gain delegated wallet grant mutation ${capability}`
      );
    }
  }

  const humanOperations = new Map([
    ["pilotCreateHumanSubject", PilotCapability.HUMAN_SUBJECT_CREATE_SELF],
    ["pilotReadHumanSelf", PilotCapability.SUBJECT_READ_SELF],
    ["pilotCreateConsent", PilotCapability.CONSENT_CREATE_SELF],
    ["pilotReadConsent", PilotCapability.CONSENT_READ_SELF],
    ["pilotRevokeConsent", PilotCapability.CONSENT_REVOKE_SELF],
    ["pilotReadIdentityReference", PilotCapability.IDENTITY_REFERENCE_READ_SELF]
  ]);
  for (const [operationId, capability] of humanOperations) {
    const policy = registry.getAuthenticated(operationId);
    assert.deepEqual(policy.allowedActorTypes, ["human"]);
    assert.equal(policy.requiredCapability, capability);
    assert.equal(policy.auditRequirement, "allow_and_deny");
  }
  assert.deepEqual(
    registry.getAuthenticated("pilotRevokeConsent").reasonPolicy.allowedCodes,
    ["human_withdrawal"]
  );
  const requestCredit = registry.getAuthenticated("pilotRequestCredit");
  assert.deepEqual(requestCredit.allowedActorTypes, ["human", "agent"]);
  assert.equal(requestCredit.requiredCapability, PilotCapability.CREDIT_REQUEST);
  assert.equal(requestCredit.ownershipRule, "actor");
  assert.deepEqual(requestCredit.liveChecks, ["credit_authority", "risk", "cap", "freeze"]);
  assert.equal(requestCredit.idempotencyRequirement, "required");
  const evaluateCredit = registry.getAuthenticated("pilotEvaluateCreditApplication");
  assert.deepEqual(evaluateCredit.allowedActorTypes, ["human", "agent"]);
  assert.equal(evaluateCredit.requiredCapability, PilotCapability.CREDIT_EVALUATE_SELF);
  assert.deepEqual(evaluateCredit.liveChecks, ["credit_intent_state"]);
  const acceptOffer = registry.getAuthenticated("pilotAcceptCreditOffer");
  assert.deepEqual(acceptOffer.allowedActorTypes, ["human", "agent"]);
  assert.equal(acceptOffer.requiredCapability, PilotCapability.CREDIT_OFFER_ACCEPT_SELF);
  assert.equal(acceptOffer.resourceType, "credit_offer");
  assert.equal(acceptOffer.ownershipRule, "actor");
  assert.deepEqual(acceptOffer.liveChecks, ["credit_offer_state"]);
  const activateMandate = registry.getAuthenticated("pilotActivateSandboxMandate");
  assert.deepEqual(activateMandate.allowedActorTypes, ["human"]);
  assert.equal(activateMandate.requiredCapability, PilotCapability.MANDATE_ACTIVATE_OWNED);
  assert.deepEqual(activateMandate.liveChecks, ["mandate_activation_state"]);
  const prepareGrant = registry.getAuthenticated("walletPrepareGrant");
  assert.deepEqual(prepareGrant.allowedActorTypes, ["human"]);
  assert.equal(prepareGrant.requiredCapability, PilotCapability.WALLET_GRANT_PREPARE_OWNED);
  assert.equal(prepareGrant.resourceType, "subject");
  assert.equal(prepareGrant.idempotencyRequirement, "required");
  assert.deepEqual(prepareGrant.liveChecks, [
    "subject_state",
    "mandate",
    "spend_policy",
    "credit_line",
    "obligation",
    "account_binding",
    "chain_policy"
  ]);
  const activateGrant = registry.getAuthenticated("walletActivateGrant");
  assert.deepEqual(activateGrant.allowedActorTypes, ["human"]);
  assert.equal(activateGrant.requiredCapability, PilotCapability.WALLET_GRANT_ACTIVATE_OWNED);
  assert.equal(activateGrant.resourceType, "delegated_wallet_grant");
  assert.deepEqual(activateGrant.liveChecks, [
    "grant_state",
    "mandate",
    "spend_policy",
    "credit_line",
    "obligation",
    "account_binding",
    "chain_policy",
    "freeze"
  ]);
  const readGrant = registry.getAuthenticated("walletReadGrant");
  assert.deepEqual(readGrant.allowedActorTypes, ["human", "agent"]);
  assert.equal(readGrant.requiredCapability, PilotCapability.WALLET_GRANT_READ_OWNED);
  assert.equal(readGrant.idempotencyRequirement, "prohibited");
  const revokeGrant = registry.getAuthenticated("walletRevokeGrant");
  assert.deepEqual(revokeGrant.allowedActorTypes, ["human"]);
  assert.equal(revokeGrant.requiredCapability, PilotCapability.WALLET_GRANT_REVOKE_OWNED);
  assert.deepEqual(revokeGrant.reasonPolicy.allowedCodes, [
    "credential_compromise",
    "operator_request",
    "security_incident"
  ]);
  const discoverWallet = registry.getAuthenticated("walletDiscoverCapabilities");
  assert.deepEqual(discoverWallet.allowedActorTypes, ["human", "agent"]);
  assert.equal(discoverWallet.requiredCapability, PilotCapability.WALLET_CAPABILITIES_DISCOVER);
  assert.equal(discoverWallet.ownershipRule, "tenant");
  const prepareExecution = registry.getAuthenticated("walletPrepareExecution");
  assert.deepEqual(prepareExecution.allowedActorTypes, ["human", "agent"]);
  assert.equal(prepareExecution.requiredCapability, PilotCapability.WALLET_EXECUTION_PREPARE_OWNED);
  assert.equal(prepareExecution.resourceType, "delegated_wallet_grant");
  const approveExecution = registry.getAuthenticated("walletApproveExecution");
  assert.deepEqual(approveExecution.allowedActorTypes, ["human"]);
  assert.equal(approveExecution.requiredCapability, PilotCapability.WALLET_EXECUTION_APPROVE_OWNED);
  assert.deepEqual(approveExecution.requiresRecentMfaActorTypes, ["human"]);
  const submitExecution = registry.getAuthenticated("walletSubmitExecution");
  assert.deepEqual(submitExecution.allowedActorTypes, ["human", "agent"]);
  assert.equal(submitExecution.requiredCapability, PilotCapability.WALLET_EXECUTION_SUBMIT_OWNED);
  const readExecution = registry.getAuthenticated("walletReadExecution");
  assert.deepEqual(readExecution.allowedActorTypes, ["human", "agent"]);
  assert.equal(readExecution.requiredCapability, PilotCapability.WALLET_EXECUTION_READ_OWNED);
  const readCredit = registry.getAuthenticated("pilotReadCreditApplication");
  assert.deepEqual(readCredit.allowedActorTypes, ["human", "agent"]);
  assert.equal(readCredit.requiredCapability, PilotCapability.CREDIT_READ_SELF);
  assert.equal(readCredit.resourceType, "credit_intent");
  assert.equal(readCredit.ownershipRule, "actor");
});

test("policy rollback compatibility rejects every permission-broadening dimension", () => {
  const current = TENANT_OPERATION_POLICIES;
  const spend = structuredClone(current.find((policy) => policy.operationId === "pilotSubmitSpend"));
  assert.equal(assertPolicyTransitionDoesNotBroaden(current, [{
    ...spend,
    liveChecks: [...spend.liveChecks, "additional_emergency_guard"]
  }]), true);

  for (const broadened of [
    { ...spend, allowedActorTypes: [...spend.allowedActorTypes, "human"] },
    { ...spend, requiredCapability: "spend.any" },
    { ...spend, ownershipRule: "tenant" },
    { ...spend, liveChecks: spend.liveChecks.filter((check) => check !== "mandate") },
    { ...spend, idempotencyRequirement: "optional" },
    { ...spend, approvalRequirement: "unreviewed" },
    { ...spend, transport: { kind: "worker" } }
  ]) {
    assert.throws(
      () => assertPolicyTransitionDoesNotBroaden(current, [broadened]),
      (error) => error.code === "authorization_policy_broadening_rejected"
    );
  }

  const increase = structuredClone(current.find(
    (policy) => policy.operationId === "pilotIncreaseCreditLimit"
  ));
  assert.equal(increase.approvalRequirement, ApprovalRequirement.DUAL_CONTROL);
  assert.throws(
    () => assertPolicyTransitionDoesNotBroaden(current, [{
      ...increase,
      approvalRequirement: ApprovalRequirement.PROTECTIVE
    }]),
    (error) => error.code === "authorization_policy_broadening_rejected"
  );
  assert.throws(
    () => assertPolicyTransitionDoesNotBroaden(current, [{
      ...spend,
      operationId: "newUnreviewedOperation"
    }]),
    (error) => error.code === "authorization_policy_broadening_rejected"
  );
  assert.throws(
    () => assertPolicyTransitionDoesNotBroaden(current, [spend, structuredClone(spend)]),
    (error) => error.code === "authorization_policy_broadening_rejected"
  );
});
