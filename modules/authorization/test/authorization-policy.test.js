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
    PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF
  ]);
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
  const servicingQueue = registry.getAuthenticated("pilotReadServicingQueue");
  assert.equal(servicingQueue.requiredCapability, PilotCapability.SERVICING_QUEUE_READ);
  assert.equal(servicingQueue.resourceType, "servicing_queue");
  assert.equal(servicingQueue.ownershipRule, "tenant");
  assert.deepEqual(servicingQueue.allowedActorTypes, ["risk_operator", "operations_operator"]);
  assert.deepEqual(
    servicingQueue.requiresRecentMfaActorTypes,
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
      PilotCapability.AGENT_ACCOUNT_CHALLENGE_CREATE_OWNED,
      PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
      PilotCapability.INTEGRATION_READ_OWNED,
      PilotCapability.MANDATE_DRAFT_CREATE,
      PilotCapability.MANDATE_DRAFT_REVOKE,
      PilotCapability.MANDATE_ACTIVATE_OWNED,
      PilotCapability.EVIDENCE_READ_OWNED
    ]
  );
  assert.equal(
    ROLE_BUNDLE_CAPABILITIES[RoleBundle.DEVELOPER].includes(PilotCapability.MANDATE_ACTIVATE_OWNED),
    false
  );

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
