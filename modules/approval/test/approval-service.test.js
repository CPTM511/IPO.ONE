import assert from "node:assert/strict";
import test from "node:test";
import { ActorType } from "../../authentication/src/index.js";
import {
  PilotCapability,
  RoleBundle
} from "../../authorization/src/index.js";
import {
  FIXED_NOW,
  authorizationRequest,
  createAuthorizationHarness
} from "../../authorization/test/support/authorization-fixture.js";
import {
  ApprovalDecisionValue,
  ApprovalProposalStatus,
  ApprovalService,
  InMemoryApprovalRepository
} from "../src/index.js";

function setup() {
  let approvalService;
  const harness = createAuthorizationHarness({
    approvalVerifier: {
      assertApproved(input) {
        return approvalService.assertApproved(input);
      }
    }
  });
  const repository = new InMemoryApprovalRepository();
  approvalService = new ApprovalService({
    repository,
    policyRegistry: harness.policyRegistry,
    directory: harness.directory,
    credentialRegistry: harness.credentialRegistry,
    referenceHasher: harness.referenceHasher,
    clock: () => FIXED_NOW
  });
  const commandActor = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_risk_command",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [
      PilotCapability.RISK_LIMIT_INCREASE,
      PilotCapability.APPROVAL_PROPOSE,
      PilotCapability.APPROVAL_DECIDE,
      PilotCapability.APPROVAL_CANCEL
    ]
  });
  const riskApprover = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_risk_approver",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [PilotCapability.APPROVAL_DECIDE]
  });
  const operationsApprover = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_operations_approver",
    actorType: ActorType.OPERATIONS_OPERATOR,
    roleBundle: RoleBundle.OPERATIONS_OPERATOR,
    capabilities: [PilotCapability.APPROVAL_DECIDE]
  });
  const secondRiskApprover = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_risk_approver_two",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [PilotCapability.APPROVAL_DECIDE]
  });
  harness.directory.registerResource({
    tenantId: "tenant_alpha",
    resourceType: "credit_line",
    resourceId: "credit_line_alpha",
    now: FIXED_NOW
  });
  harness.livePolicyAdapter.register({
    tenantId: "tenant_alpha",
    operationId: "pilotIncreaseCreditLimit",
    resourceType: "credit_line",
    resourceId: "credit_line_alpha",
    checks: ["risk", "cap", "credit_line_state", "stop_loss"],
    allowed: true
  });
  const commandRequest = authorizationRequest(
    commandActor.authenticationContext,
    "pilotIncreaseCreditLimit",
    {
      resource: { resourceType: "credit_line", resourceId: "credit_line_alpha" },
      reasonCode: "approved_exposure_change",
      idempotencyKey: "increase-credit-limit-command-0001"
    }
  );
  return {
    approvalService,
    commandActor,
    commandRequest,
    harness,
    operationsApprover,
    repository,
    riskApprover,
    secondRiskApprover
  };
}

async function approvedProposal(state) {
  const preparation = await state.harness.service.prepareApproval(state.commandRequest);
  const proposed = await state.approvalService.propose({
    approvalPreparation: preparation,
    authenticationContext: state.commandActor.authenticationContext,
    idempotencyKey: "approval-proposal-command-0001",
    expiresAt: new Date(FIXED_NOW.getTime() + 30 * 60_000),
    now: FIXED_NOW
  });
  const first = await state.approvalService.decide({
    approvalProposalId: proposed.proposal.approvalProposalId,
    expectedVersion: 1,
    decision: ApprovalDecisionValue.APPROVE,
    reasonCode: "approval_confirmed",
    authenticationContext: state.riskApprover.authenticationContext,
    idempotencyKey: "approval-risk-decision-0001",
    now: FIXED_NOW
  });
  const second = await state.approvalService.decide({
    approvalProposalId: proposed.proposal.approvalProposalId,
    expectedVersion: first.proposal.version,
    decision: ApprovalDecisionValue.APPROVE,
    reasonCode: "approval_confirmed",
    authenticationContext: state.operationsApprover.authenticationContext,
    idempotencyKey: "approval-operations-decision-0001",
    now: FIXED_NOW
  });
  return second;
}

test("server-prepared proposals require two roles and authorize the exact command", async () => {
  const state = setup();
  const preparation = await state.harness.service.prepareApproval(state.commandRequest);
  assert.equal(preparation.operationId, "pilotIncreaseCreditLimit");
  assert.equal(state.harness.auditStore.list().at(-1).reasonCode, "approval_required");

  const proposed = await state.approvalService.propose({
    approvalPreparation: preparation,
    authenticationContext: state.commandActor.authenticationContext,
    idempotencyKey: "approval-proposal-command-0001",
    expiresAt: new Date(FIXED_NOW.getTime() + 30 * 60_000),
    now: FIXED_NOW
  });
  assert.equal(proposed.proposal.status, ApprovalProposalStatus.PENDING);
  const replay = await state.approvalService.propose({
    approvalPreparation: preparation,
    authenticationContext: state.commandActor.authenticationContext,
    idempotencyKey: "approval-proposal-command-0001",
    expiresAt: new Date(FIXED_NOW.getTime() + 30 * 60_000),
    now: FIXED_NOW
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.proposal.approvalProposalId, proposed.proposal.approvalProposalId);

  await assert.rejects(
    () => state.approvalService.decide({
      approvalProposalId: proposed.proposal.approvalProposalId,
      expectedVersion: 1,
      decision: ApprovalDecisionValue.APPROVE,
      reasonCode: "approval_confirmed",
      authenticationContext: state.commandActor.authenticationContext,
      idempotencyKey: "approval-self-decision-0001",
      now: FIXED_NOW
    }),
    (error) => error.code === "approval_separation_rejected"
  );
  const first = await state.approvalService.decide({
    approvalProposalId: proposed.proposal.approvalProposalId,
    expectedVersion: 1,
    decision: ApprovalDecisionValue.APPROVE,
    reasonCode: "approval_confirmed",
    authenticationContext: state.riskApprover.authenticationContext,
    idempotencyKey: "approval-risk-decision-0001",
    now: FIXED_NOW
  });
  assert.equal(first.proposal.status, ApprovalProposalStatus.PENDING);
  await assert.rejects(
    () => state.approvalService.decide({
      approvalProposalId: proposed.proposal.approvalProposalId,
      expectedVersion: first.proposal.version,
      decision: ApprovalDecisionValue.APPROVE,
      reasonCode: "approval_confirmed",
      authenticationContext: state.secondRiskApprover.authenticationContext,
      idempotencyKey: "approval-duplicate-role-decision-0001",
      now: FIXED_NOW
    }),
    (error) => error.code === "approval_separation_rejected"
  );
  const second = await state.approvalService.decide({
    approvalProposalId: proposed.proposal.approvalProposalId,
    expectedVersion: first.proposal.version,
    decision: ApprovalDecisionValue.APPROVE,
    reasonCode: "approval_confirmed",
    authenticationContext: state.operationsApprover.authenticationContext,
    idempotencyKey: "approval-operations-decision-0001",
    now: FIXED_NOW
  });
  assert.equal(second.proposal.status, ApprovalProposalStatus.APPROVED);
  assert.equal(second.decisions.length, 2);

  const decision = await state.harness.service.authorize({
    ...state.commandRequest,
    approvalArtifact: {
      proposalId: second.proposal.approvalProposalId,
      proposalVersion: second.proposal.version
    }
  });
  assert.equal(decision.approvalProposalId, second.proposal.approvalProposalId);
  assert.equal(decision.approvalIds.length, 2);
  const allowAudit = state.harness.auditStore.list().at(-1);
  assert.equal(allowAudit.approvalProposalId, second.proposal.approvalProposalId);
  assert.equal(allowAudit.approvalProposalVersion, second.proposal.version);
  const revalidated = await state.harness.service.revalidate({
    decision,
    authenticationContext: state.commandActor.authenticationContext,
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  assert.equal(revalidated.revalidationCount, 1);
});

test("server-derived approval expiry is stable across a delayed idempotent retry", async () => {
  const state = setup();
  const preparation = await state.harness.service.prepareApproval(state.commandRequest);
  const first = await state.approvalService.propose({
    approvalPreparation: preparation,
    authenticationContext: state.commandActor.authenticationContext,
    idempotencyKey: "approval-default-expiry-retry-0001",
    now: FIXED_NOW
  });
  const retry = await state.approvalService.propose({
    approvalPreparation: preparation,
    authenticationContext: state.commandActor.authenticationContext,
    idempotencyKey: "approval-default-expiry-retry-0001",
    now: new Date(FIXED_NOW.getTime() + 31_000)
  });
  assert.equal(retry.replayed, true);
  assert.equal(retry.proposal.approvalProposalId, first.proposal.approvalProposalId);
  assert.equal(retry.proposal.expiresAt, first.proposal.expiresAt);
});

test("approved execution must reuse the exact authorized command idempotency key", async () => {
  const state = setup();
  const approved = await approvedProposal(state);
  const decision = await state.harness.service.authorize({
    ...state.commandRequest,
    approvalArtifact: {
      proposalId: approved.proposal.approvalProposalId,
      proposalVersion: approved.proposal.version
    }
  });
  const revalidated = await state.harness.service.revalidate({
    decision,
    authenticationContext: state.commandActor.authenticationContext,
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  await assert.rejects(
    () => state.approvalService.executeApprovedCommand({
      authorizationDecision: revalidated,
      idempotencyKey: "different-approved-execution-key",
      buildApprovedMutation() {
        throw new Error("mismatched execution must not build a mutation");
      },
      now: new Date(FIXED_NOW.getTime() + 2_000)
    }),
    (error) => error.code === "approved_execution_idempotency_mismatch"
  );
});

test("rejection, cancellation, membership change, stale MFA, and command changes fail closed", async () => {
  const rejectedState = setup();
  const preparation = await rejectedState.harness.service.prepareApproval(rejectedState.commandRequest);
  const proposed = await rejectedState.approvalService.propose({
    approvalPreparation: preparation,
    authenticationContext: rejectedState.commandActor.authenticationContext,
    idempotencyKey: "approval-proposal-reject-0001",
    now: FIXED_NOW
  });
  const rejected = await rejectedState.approvalService.decide({
    approvalProposalId: proposed.proposal.approvalProposalId,
    expectedVersion: 1,
    decision: ApprovalDecisionValue.REJECT,
    reasonCode: "approval_rejected",
    authenticationContext: rejectedState.operationsApprover.authenticationContext,
    idempotencyKey: "approval-reject-decision-0001",
    now: FIXED_NOW
  });
  assert.equal(rejected.proposal.status, ApprovalProposalStatus.REJECTED);

  const canceledState = setup();
  const canceledPreparation = await canceledState.harness.service.prepareApproval(canceledState.commandRequest);
  const cancelProposal = await canceledState.approvalService.propose({
    approvalPreparation: canceledPreparation,
    authenticationContext: canceledState.commandActor.authenticationContext,
    idempotencyKey: "approval-proposal-cancel-0001",
    now: FIXED_NOW
  });
  const canceled = await canceledState.approvalService.cancel({
    approvalProposalId: cancelProposal.proposal.approvalProposalId,
    expectedVersion: 1,
    reasonCode: "proposal_canceled",
    authenticationContext: canceledState.commandActor.authenticationContext,
    idempotencyKey: "approval-cancel-command-0001",
    now: FIXED_NOW
  });
  assert.equal(canceled.proposal.status, ApprovalProposalStatus.CANCELED);

  const revokedState = setup();
  const approved = await approvedProposal(revokedState);
  revokedState.harness.directory.setMembershipStatus({
    membershipId: revokedState.riskApprover.membership.membershipId,
    expectedVersion: revokedState.riskApprover.membership.version,
    status: "revoked",
    reasonCode: "credential_compromise",
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  await assert.rejects(
    () => revokedState.harness.service.authorize({
      ...revokedState.commandRequest,
      now: new Date(FIXED_NOW.getTime() + 2_000),
      approvalArtifact: {
        proposalId: approved.proposal.approvalProposalId,
        proposalVersion: approved.proposal.version
      }
    }),
    (error) => error.code === "authorization_denied"
  );

  const staleState = setup();
  const staleApproved = await approvedProposal(staleState);
  await assert.rejects(
    () => staleState.approvalService.assertApproved({
      approvalArtifact: {
        proposalId: staleApproved.proposal.approvalProposalId,
        proposalVersion: staleApproved.proposal.version
      },
      tenantId: "tenant_alpha",
      actorId: "actor_risk_command",
      operationId: "pilotIncreaseCreditLimit",
      action: "risk.limit.increase",
      resourceType: "credit_line",
      resourceId: "credit_line_alpha",
      resourceVersion: 1,
      reasonCode: "approved_exposure_change",
      commandHash: staleApproved.proposal.commandHash,
      policyVersion: staleApproved.proposal.policyVersion,
      now: new Date(FIXED_NOW.getTime() + 15 * 60_000 + 1_000)
    }),
    (error) => error.code === "approval_revalidation_failed"
  );
  await assert.rejects(
    () => staleState.approvalService.assertApproved({
      approvalArtifact: {
        proposalId: staleApproved.proposal.approvalProposalId,
        proposalVersion: staleApproved.proposal.version
      },
      tenantId: "tenant_alpha",
      actorId: "actor_risk_command",
      operationId: "pilotIncreaseCreditLimit",
      action: "risk.limit.increase",
      resourceType: "credit_line",
      resourceId: "credit_line_alpha",
      resourceVersion: 2,
      reasonCode: "approved_exposure_change",
      commandHash: staleApproved.proposal.commandHash,
      policyVersion: staleApproved.proposal.policyVersion,
      now: FIXED_NOW
    }),
    (error) => error.code === "approval_verification_failed"
  );
});
