import assert from "node:assert/strict";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import {
  AccessGrantCapability,
  MembershipStatus,
  PilotCapability,
  RoleBundle,
  assertAuthorizationDecision
} from "../src/index.js";
import {
  FIXED_NOW,
  authorizationRequest,
  createAuthorizationHarness
} from "./support/authorization-fixture.js";

async function denied(operation) {
  await assert.rejects(
    operation,
    (error) => error.code === "authorization_denied" &&
      error.message === "authorization_denied: The requested operation is not available."
  );
}

test("Human and Agent commands use one branded deny-by-default authorization decision", async () => {
  const harness = createAuthorizationHarness();
  assert.equal(Object.isFrozen(harness.service), true);
  assert.equal(Object.isFrozen(harness.directory), true);
  assert.equal(Object.isFrozen(harness.auditStore), true);
  assert.equal(Object.isFrozen(harness.livePolicyAdapter), true);
  const developer = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_developer_alpha",
    actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.DEVELOPER,
    capabilities: [PilotCapability.AGENT_CREATE]
  });
  const decision = await harness.service.authorize(authorizationRequest(
    developer.authenticationContext,
    "pilotCreateAgentSubject",
    { idempotencyKey: "create-agent-subject-0001" }
  ));
  assert.equal(assertAuthorizationDecision(decision), decision);
  assert.equal(decision.authorizationDecision, "allow");
  assert.equal(decision.revalidationCount, 0);
  assert.equal(decision.resourceVersion, 0);
  assert.equal(decision.schemaVersion, "authorization_decision.v2");
  assert.throws(
    () => assertAuthorizationDecision(structuredClone(decision)),
    (error) => error.code === "authorization_decision_required"
  );
  assert.equal(harness.auditStore.list()[0].authorizationDecision, "allow");
  const revalidated = await harness.service.revalidate({
    decision,
    authenticationContext: developer.authenticationContext,
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  assert.equal(revalidated.revalidationCount, 1);

  await denied(() => harness.service.authorize(authorizationRequest(
    developer.authenticationContext,
    "createAgent",
    { idempotencyKey: "public-route-not-authority-1" }
  )));
  assert.equal(harness.auditStore.list().at(-1).reasonCode, "route_contract_rejected");
});

test("the Human Borrower boundary is Human-only and grants credit only when explicitly issued", async () => {
  const harness = createAuthorizationHarness();
  const borrower = harness.addIdentity({
    tenantId: "tenant_human_pilot",
    actorId: "actor_human_borrower",
    actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.HUMAN_BORROWER,
    capabilities: [PilotCapability.HUMAN_SUBJECT_CREATE_SELF]
  });
  const allowed = await harness.service.authorize(authorizationRequest(
    borrower.authenticationContext,
    "pilotCreateHumanSubject",
    { idempotencyKey: "create-human-subject-0001" }
  ));
  assert.equal(allowed.authorizationDecision, "allow");
  assert.equal(allowed.requiredCapability, PilotCapability.HUMAN_SUBJECT_CREATE_SELF);

  await denied(() => harness.service.authorize(authorizationRequest(
    borrower.authenticationContext,
    "pilotRequestCredit",
    {
      resource: { resourceType: "subject", resourceId: "subject_human_borrower" },
      idempotencyKey: "human-credit-capability-not-issued"
    }
  )));
  assert.equal(harness.auditStore.list().at(-1).reasonCode, "actor_capability_rejected");

  assert.throws(
    () => harness.addIdentity({
      tenantId: "tenant_agent_pilot",
      actorId: "actor_agent_with_human_role",
      actorType: ActorType.AGENT,
      roleBundle: RoleBundle.HUMAN_BORROWER,
      capabilities: [PilotCapability.HUMAN_SUBJECT_CREATE_SELF]
    }),
    (error) => error.code === "invalid_authorization_input"
  );
});

test("horizontal, vertical, and missing-object denials share one non-enumerating contract", async () => {
  const harness = createAuthorizationHarness();
  const alpha = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_agent_alpha",
    actorType: ActorType.AGENT,
    roleBundle: RoleBundle.AGENT_RUNTIME,
    capabilities: [PilotCapability.SPEND_REQUEST]
  });
  const beta = harness.addIdentity({
    tenantId: "tenant_beta",
    actorId: "actor_agent_beta",
    actorType: ActorType.AGENT,
    roleBundle: RoleBundle.AGENT_RUNTIME,
    capabilities: [PilotCapability.SPEND_REQUEST]
  });
  harness.directory.registerResource({
    tenantId: "tenant_alpha",
    resourceType: "subject",
    resourceId: "subject_alpha",
    ownerActorId: "actor_agent_alpha",
    now: FIXED_NOW
  });
  harness.livePolicyAdapter.register({
    tenantId: "tenant_alpha",
    operationId: "pilotSubmitSpend",
    resourceType: "subject",
    resourceId: "subject_alpha",
    checks: ["mandate", "spend_policy", "risk", "cap", "freeze"],
    allowed: true
  });

  const allowed = await harness.service.authorize(authorizationRequest(
    alpha.authenticationContext,
    "pilotSubmitSpend",
    {
      resource: { resourceType: "subject", resourceId: "subject_alpha" },
      idempotencyKey: "spend-command-alpha-0001"
    }
  ));
  assert.equal(allowed.requiredCapability, PilotCapability.SPEND_REQUEST);

  const crossTenant = authorizationRequest(beta.authenticationContext, "pilotSubmitSpend", {
    resource: { resourceType: "subject", resourceId: "subject_alpha" },
    idempotencyKey: "spend-command-beta-00001"
  });
  const missing = authorizationRequest(beta.authenticationContext, "pilotSubmitSpend", {
    resource: { resourceType: "subject", resourceId: "subject_missing" },
    idempotencyKey: "spend-command-beta-00002"
  });
  await denied(() => harness.service.authorize(crossTenant));
  await denied(() => harness.service.authorize(missing));
  const denials = harness.auditStore.list({ authorizationDecision: "deny" });
  assert.deepEqual(denials.slice(-2).map((event) => event.reasonCode), [
    "resource_access_denied",
    "resource_access_denied"
  ]);

  const reader = harness.addIdentity({
    tenantId: "tenant_gamma",
    actorId: "actor_agent_reader",
    actorType: ActorType.AGENT,
    roleBundle: RoleBundle.AGENT_RUNTIME,
    capabilities: [PilotCapability.SUBJECT_READ_SELF]
  });
  await denied(() => harness.service.authorize(authorizationRequest(
    reader.authenticationContext,
    "pilotSubmitSpend",
    {
      resource: { resourceType: "subject", resourceId: "subject_alpha" },
      idempotencyKey: "vertical-denial-command-1"
    }
  )));
  assert.equal(harness.auditStore.list().at(-1).reasonCode, "actor_capability_rejected");
});

test("AccessGrants are exact, purpose-bound, expiring, actor-bound, and revocable", async () => {
  const harness = createAuthorizationHarness();
  const provider = harness.addIdentity({
    tenantId: "tenant_provider",
    actorId: "actor_provider_service",
    actorType: ActorType.PROVIDER,
    roleBundle: RoleBundle.PROVIDER_SERVICE,
    capabilities: [PilotCapability.PROVIDER_INTENT_READ]
  });
  harness.directory.registerResource({
    tenantId: "tenant_originator",
    resourceType: "transfer_intent",
    resourceId: "transfer_intent_001",
    now: FIXED_NOW
  });
  harness.livePolicyAdapter.register({
    tenantId: "tenant_originator",
    operationId: "pilotReadProviderIntent",
    resourceType: "transfer_intent",
    resourceId: "transfer_intent_001",
    checks: ["provider_assignment", "provider_state"],
    allowed: true
  });
  const grant = harness.directory.registerAccessGrant({
    accessGrantId: "access_grant_provider_001",
    tenantId: "tenant_originator",
    granteeTenantId: "tenant_provider",
    granteeActorId: "actor_provider_service",
    capability: AccessGrantCapability.PROVIDER_INTENT_DELIVERY,
    resourceType: "transfer_intent",
    resourceId: "transfer_intent_001",
    purpose: "provider_delivery",
    createdByActorId: "actor_originator_admin",
    policyVersion: "security_001.v1",
    expiresAt: new Date(FIXED_NOW.getTime() + 60 * 60_000),
    now: FIXED_NOW
  });
  const request = authorizationRequest(
    provider.authenticationContext,
    "pilotReadProviderIntent",
    {
      resource: { resourceType: "transfer_intent", resourceId: "transfer_intent_001" },
      purpose: "provider_delivery"
    }
  );
  const decision = await harness.service.authorize(request);
  assert.equal(decision.accessGrantId, grant.accessGrantId);

  const unassignedProvider = harness.addIdentity({
    tenantId: "tenant_provider",
    actorId: "actor_provider_unassigned",
    actorType: ActorType.PROVIDER,
    roleBundle: RoleBundle.PROVIDER_SERVICE,
    capabilities: [PilotCapability.PROVIDER_INTENT_READ]
  });
  await denied(() => harness.service.authorize({
    ...request,
    authenticationContext: unassignedProvider.authenticationContext
  }));
  await denied(() => harness.service.authorize({ ...request, purpose: "portfolio_analysis" }));
  harness.directory.revokeAccessGrant({
    accessGrantId: grant.accessGrantId,
    expectedVersion: grant.version,
    reasonCode: "provider_access_revoked",
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  await denied(() => harness.service.revalidate({
    decision,
    authenticationContext: provider.authenticationContext,
    now: new Date(FIXED_NOW.getTime() + 2_000)
  }));

  harness.directory.registerResource({
    tenantId: "tenant_originator",
    resourceType: "transfer_intent",
    resourceId: "transfer_intent_expiring",
    now: FIXED_NOW
  });
  harness.livePolicyAdapter.register({
    tenantId: "tenant_originator",
    operationId: "pilotReadProviderIntent",
    resourceType: "transfer_intent",
    resourceId: "transfer_intent_expiring",
    checks: ["provider_assignment", "provider_state"],
    allowed: true
  });
  const expiringGrant = harness.directory.registerAccessGrant({
    accessGrantId: "access_grant_provider_expiring",
    tenantId: "tenant_originator",
    granteeTenantId: "tenant_provider",
    granteeActorId: "actor_provider_service",
    capability: AccessGrantCapability.PROVIDER_INTENT_DELIVERY,
    resourceType: "transfer_intent",
    resourceId: "transfer_intent_expiring",
    purpose: "provider_delivery",
    createdByActorId: "actor_originator_admin",
    policyVersion: "security_001.v1",
    expiresAt: new Date(FIXED_NOW.getTime() + 60_000),
    now: FIXED_NOW
  });
  await denied(() => harness.service.authorize(authorizationRequest(
    provider.authenticationContext,
    "pilotReadProviderIntent",
    {
      resource: { resourceType: "transfer_intent", resourceId: "transfer_intent_expiring" },
      purpose: "provider_delivery",
      now: new Date(FIXED_NOW.getTime() + 60_001)
    }
  )));
  assert.equal(
    harness.directory.getAccessGrant(expiringGrant.accessGrantId).status,
    "expired"
  );
  assert.throws(
    () => harness.directory.registerAccessGrant({
      tenantId: "tenant_originator",
      granteeTenantId: "tenant_provider",
      granteeActorId: "actor_provider_service",
      capability: "credit_limit_increase",
      resourceType: "transfer_intent",
      resourceId: "transfer_intent_001",
      purpose: "provider_delivery",
      createdByActorId: "actor_originator_admin",
      policyVersion: "security_001.v1",
      expiresAt: new Date(FIXED_NOW.getTime() + 60 * 60_000),
      now: FIXED_NOW
    }),
    (error) => error.code === "invalid_authorization_input"
  );
});

test("credential rotation, membership revocation, resource changes, and live-state changes fail TOCTOU revalidation", async () => {
  const harness = createAuthorizationHarness();
  const agent = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_agent_alpha",
    actorType: ActorType.AGENT,
    roleBundle: RoleBundle.AGENT_RUNTIME,
    capabilities: [PilotCapability.SUBJECT_READ_SELF]
  });
  const resource = harness.directory.registerResource({
    tenantId: "tenant_alpha",
    resourceType: "subject",
    resourceId: "subject_alpha",
    ownerActorId: "actor_agent_alpha",
    now: FIXED_NOW
  });
  const request = authorizationRequest(agent.authenticationContext, "pilotReadAgentSelf", {
    resource: { resourceType: "subject", resourceId: "subject_alpha" }
  });
  const first = await harness.service.authorize(request);
  harness.directory.setResourceStatus({
    resourceType: "subject",
    resourceId: "subject_alpha",
    expectedVersion: resource.version,
    status: "frozen",
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  await denied(() => harness.service.revalidate({
    decision: first,
    authenticationContext: agent.authenticationContext,
    now: new Date(FIXED_NOW.getTime() + 2_000)
  }));

  const secondHarness = createAuthorizationHarness();
  const secondAgent = secondHarness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_agent_alpha",
    actorType: ActorType.AGENT,
    roleBundle: RoleBundle.AGENT_RUNTIME,
    capabilities: [PilotCapability.SUBJECT_READ_SELF]
  });
  secondHarness.directory.registerResource({
    tenantId: "tenant_alpha",
    resourceType: "subject",
    resourceId: "subject_alpha",
    ownerActorId: "actor_agent_alpha",
    now: FIXED_NOW
  });
  const second = await secondHarness.service.authorize(authorizationRequest(
    secondAgent.authenticationContext,
    "pilotReadAgentSelf",
    { resource: { resourceType: "subject", resourceId: "subject_alpha" } }
  ));
  secondHarness.directory.setMembershipStatus({
    membershipId: secondAgent.membership.membershipId,
    expectedVersion: secondAgent.membership.version,
    status: MembershipStatus.SUSPENDED,
    reasonCode: "security_incident",
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  await denied(() => secondHarness.service.revalidate({
    decision: second,
    authenticationContext: secondAgent.authenticationContext,
    now: new Date(FIXED_NOW.getTime() + 2_000)
  }));

  const thirdHarness = createAuthorizationHarness();
  const thirdAgent = thirdHarness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_agent_alpha",
    actorType: ActorType.AGENT,
    roleBundle: RoleBundle.AGENT_RUNTIME,
    capabilities: [PilotCapability.SUBJECT_READ_SELF]
  });
  thirdHarness.directory.registerResource({
    tenantId: "tenant_alpha",
    resourceType: "subject",
    resourceId: "subject_alpha",
    ownerActorId: "actor_agent_alpha",
    now: FIXED_NOW
  });
  thirdHarness.credentialRegistry.rotate({
    credentialId: thirdAgent.credential.credentialId,
    senderConstraint: { method: "dpop", thumbprint: "n".repeat(43) },
    performedByActorId: "actor_security_admin",
    reasonCode: "credential_key_rotation",
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  await denied(() => thirdHarness.service.authorize(authorizationRequest(
    thirdAgent.authenticationContext,
    "pilotReadAgentSelf",
    { resource: { resourceType: "subject", resourceId: "subject_alpha" } }
  )));
  assert.equal(thirdHarness.auditStore.list().at(-1).reasonCode, "credential_status_rejected");

  const fourthHarness = createAuthorizationHarness();
  const fourthAgent = fourthHarness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_agent_alpha",
    actorType: ActorType.AGENT,
    roleBundle: RoleBundle.AGENT_RUNTIME,
    capabilities: [PilotCapability.SPEND_REQUEST]
  });
  fourthHarness.directory.registerResource({
    tenantId: "tenant_alpha",
    resourceType: "subject",
    resourceId: "subject_alpha",
    ownerActorId: "actor_agent_alpha",
    now: FIXED_NOW
  });
  const live = fourthHarness.livePolicyAdapter.register({
    tenantId: "tenant_alpha",
    operationId: "pilotSubmitSpend",
    resourceType: "subject",
    resourceId: "subject_alpha",
    checks: ["mandate", "spend_policy", "risk", "cap", "freeze"],
    allowed: true
  });
  const fourth = await fourthHarness.service.authorize(authorizationRequest(
    fourthAgent.authenticationContext,
    "pilotSubmitSpend",
    {
      resource: { resourceType: "subject", resourceId: "subject_alpha" },
      idempotencyKey: "spend-live-state-command-1"
    }
  ));
  fourthHarness.livePolicyAdapter.setDecision({
    tenantId: "tenant_alpha",
    operationId: "pilotSubmitSpend",
    resourceType: "subject",
    resourceId: "subject_alpha",
    expectedVersion: live.version,
    allowed: false,
    reasonCode: "risk_limit_breach"
  });
  await denied(() => fourthHarness.service.revalidate({
    decision: fourth,
    authenticationContext: fourthAgent.authenticationContext,
    now: new Date(FIXED_NOW.getTime() + 2_000)
  }));
  assert.equal(fourthHarness.auditStore.list().at(-1).reasonCode, "live_policy_rejected");
});

test("protective actions require reason and idempotency while increases require exact dual control", async () => {
  const approvalVerifier = {
    async assertApproved({ approvalArtifact, commandHash }) {
      assert.equal(Object.isFrozen(approvalArtifact), true);
      return {
        proposalId: approvalArtifact.proposalId,
        proposalVersion: approvalArtifact.proposalVersion,
        approvalIds: ["approval_risk_001", "approval_security_001"],
        approverActorIds: approvalArtifact.proposalId === "approval_proposal_self"
          ? ["actor_risk_alpha", "actor_security_approver"]
          : ["actor_risk_approver", "actor_security_approver"],
        commandHash: approvalArtifact.proposalId === "approval_proposal_wrong_command"
          ? `0x${"0".repeat(64)}`
          : commandHash
      };
    }
  };
  const harness = createAuthorizationHarness({ approvalVerifier });
  const risk = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_risk_alpha",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [PilotCapability.RISK_FREEZE, PilotCapability.RISK_LIMIT_INCREASE]
  });
  harness.directory.registerResource({
    tenantId: "tenant_alpha",
    resourceType: "subject",
    resourceId: "subject_alpha",
    now: FIXED_NOW
  });
  harness.directory.registerResource({
    tenantId: "tenant_alpha",
    resourceType: "credit_line",
    resourceId: "credit_line_alpha",
    now: FIXED_NOW
  });
  harness.livePolicyAdapter.register({
    tenantId: "tenant_alpha",
    operationId: "pilotFreezeSubject",
    resourceType: "subject",
    resourceId: "subject_alpha",
    checks: ["risk", "freeze"],
    allowed: true
  });
  harness.livePolicyAdapter.register({
    tenantId: "tenant_alpha",
    operationId: "pilotIncreaseCreditLimit",
    resourceType: "credit_line",
    resourceId: "credit_line_alpha",
    checks: ["risk", "cap", "credit_line_state", "stop_loss"],
    allowed: true
  });

  const freeze = authorizationRequest(risk.authenticationContext, "pilotFreezeSubject", {
    resource: { resourceType: "subject", resourceId: "subject_alpha" }
  });
  await denied(() => harness.service.authorize(freeze));
  assert.equal(harness.auditStore.list().at(-1).reasonCode, "reason_requirement_rejected");
  await denied(() => harness.service.authorize({ ...freeze, reasonCode: "security_incident" }));
  assert.equal(harness.auditStore.list().at(-1).reasonCode, "idempotency_requirement_rejected");
  const freezeDecision = await harness.service.authorize({
    ...freeze,
    reasonCode: "security_incident",
    idempotencyKey: "freeze-subject-command-0001"
  });
  assert.deepEqual(freezeDecision.approvalIds, []);
  await denied(() => harness.service.authorize({
    ...freeze,
    reasonCode: "security_incident",
    idempotencyKey: "freeze-subject-command-stale-mfa",
    now: new Date(FIXED_NOW.getTime() + 15 * 60_000 + 1_000)
  }));
  assert.equal(harness.auditStore.list().at(-1).reasonCode, "actor_capability_rejected");

  const increase = authorizationRequest(risk.authenticationContext, "pilotIncreaseCreditLimit", {
    resource: { resourceType: "credit_line", resourceId: "credit_line_alpha" },
    reasonCode: "approved_exposure_change",
    idempotencyKey: "increase-credit-command-0001"
  });
  await denied(() => harness.service.authorize(increase));
  await assert.rejects(
    () => harness.service.authorize({
      ...increase,
      approvalArtifact: {
        proposalId: "approval_proposal_zero_version",
        proposalVersion: 0
      }
    }),
    (error) => error.code === "invalid_authorization_decision"
  );
  const approved = await harness.service.authorize({
    ...increase,
    approvalArtifact: {
      proposalId: "approval_proposal_001",
      proposalVersion: 3
    }
  });
  assert.deepEqual(approved.approvalIds, ["approval_risk_001", "approval_security_001"]);
  assert.equal(approved.approvalProposalId, "approval_proposal_001");
  await denied(() => harness.service.authorize({
    ...increase,
    idempotencyKey: "increase-credit-command-self-approval",
    approvalArtifact: {
      proposalId: "approval_proposal_self",
      proposalVersion: 3
    }
  }));
  await denied(() => harness.service.authorize({
    ...increase,
    idempotencyKey: "increase-credit-command-0002",
    approvalArtifact: {
      proposalId: "approval_proposal_wrong_command",
      proposalVersion: 3
    }
  }));
});

test("command payload hash binds authorization and prevents stale approval reuse", async () => {
  let approvedCommandHash;
  const approvalVerifier = {
    async assertApproved({ approvalArtifact }) {
      return {
        proposalId: approvalArtifact.proposalId,
        proposalVersion: approvalArtifact.proposalVersion,
        approvalIds: ["approval_risk_payload", "approval_security_payload"],
        approverActorIds: ["actor_risk_approver", "actor_security_approver"],
        commandHash: approvedCommandHash
      };
    }
  };
  const harness = createAuthorizationHarness({ approvalVerifier });
  const risk = harness.addIdentity({
    tenantId: "tenant_payload_binding",
    actorId: "actor_risk_payload_binding",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [PilotCapability.RISK_LIMIT_INCREASE]
  });
  harness.directory.registerResource({
    tenantId: "tenant_payload_binding",
    resourceType: "credit_line",
    resourceId: "credit_line_payload_binding",
    now: FIXED_NOW
  });
  harness.livePolicyAdapter.register({
    tenantId: "tenant_payload_binding",
    operationId: "pilotIncreaseCreditLimit",
    resourceType: "credit_line",
    resourceId: "credit_line_payload_binding",
    checks: ["risk", "cap", "credit_line_state", "stop_loss"],
    allowed: true
  });
  const firstPayloadHash = hashId("authorization_test_payload", { limitMinor: "10000" });
  const changedPayloadHash = hashId("authorization_test_payload", { limitMinor: "25000" });
  const request = authorizationRequest(risk.authenticationContext, "pilotIncreaseCreditLimit", {
    resource: { resourceType: "credit_line", resourceId: "credit_line_payload_binding" },
    reasonCode: "approved_exposure_change",
    idempotencyKey: "increase-credit-payload-bound-0001",
    commandPayloadHash: firstPayloadHash
  });
  const preparation = await harness.service.prepareApproval(request);
  approvedCommandHash = preparation.commandHash;
  assert.equal(preparation.schemaVersion, "approval_preparation.v2");
  assert.equal(preparation.commandPayloadHash, firstPayloadHash);

  const approvalArtifact = {
    proposalId: "approval_proposal_payload_bound",
    proposalVersion: 1
  };
  const approved = await harness.service.authorize({ ...request, approvalArtifact });
  assert.equal(approved.commandHash, preparation.commandHash);
  assert.equal(approved.commandPayloadHash, firstPayloadHash);

  await denied(() => harness.service.authorize({
    ...request,
    commandPayloadHash: changedPayloadHash,
    approvalArtifact
  }));
  assert.notEqual(
    harness.auditStore.list().at(-1).commandHash,
    preparation.commandHash
  );
});

test("audit exhaustion fails closed and audit records contain no credential material", async () => {
  const harness = createAuthorizationHarness({ maximumAuditEvents: 1 });
  const developer = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_developer_alpha",
    actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.DEVELOPER,
    capabilities: [PilotCapability.AGENT_CREATE]
  });
  const first = authorizationRequest(developer.authenticationContext, "pilotCreateAgentSubject", {
    idempotencyKey: "create-agent-subject-0001"
  });
  await harness.service.authorize(first);
  await assert.rejects(
    () => harness.service.authorize({ ...first, idempotencyKey: "create-agent-subject-0002" }),
    (error) => error.code === "authorization_unavailable"
  );
  const serialized = JSON.stringify(harness.auditStore.list());
  for (const prohibited of ["accessToken", "refreshToken", "cookie", "privateKey", "signature", "rawIp", "kyc"] ) {
    assert.equal(serialized.includes(prohibited), false);
  }
});

test("asynchronous audit rejection fails closed before an allow decision escapes", async () => {
  let attempts = 0;
  const harness = createAuthorizationHarness({
    authorizationAuditStore: {
      async append() {
        attempts += 1;
        throw new Error("durable audit unavailable");
      }
    }
  });
  const developer = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_developer_alpha",
    actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.DEVELOPER,
    capabilities: [PilotCapability.AGENT_CREATE]
  });
  await assert.rejects(
    () => harness.service.authorize(authorizationRequest(
      developer.authenticationContext,
      "pilotCreateAgentSubject",
      { idempotencyKey: "create-agent-with-durable-audit" }
    )),
    (error) => error.code === "authorization_unavailable"
  );
  assert.equal(attempts, 1);
});
