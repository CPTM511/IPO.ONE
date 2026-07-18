import { createOperationalId, hashId } from "../../../packages/domain/src/index.js";
import { RoleBundle } from "../../authorization/src/index.js";
import {
  APPROVAL_DECISION_SCHEMA_VERSION,
  APPROVAL_EXECUTION_SCHEMA_VERSION,
  APPROVAL_POLICY_VERSION,
  APPROVAL_PROPOSAL_SCHEMA_VERSION,
  ApprovalDecisionValue,
  ApprovalProposalStatus
} from "./approval-constants.js";
import {
  assertApprovalHash,
  assertApprovalIdentifier,
  assertApprovalList,
  assertApprovalReason,
  assertApprovalReferenceHash,
  assertApprovalTimestamp,
  assertApprovalVersion,
  assertNoSensitiveApprovalFields,
  approvalError,
  cloneApproval,
  deepFreezeApproval
} from "./approval-utils.js";

const STATUSES = new Set(Object.values(ApprovalProposalStatus));
const DECISIONS = new Set(Object.values(ApprovalDecisionValue));
const REQUIRED_APPROVER_ROLES = Object.freeze([
  RoleBundle.RISK_OPERATOR,
  RoleBundle.OPERATIONS_OPERATOR
]);

export function createApprovalProposal({
  preparation,
  proposerContext,
  proposerMembership,
  requiredApproverRoleBundles,
  expiresAt,
  now
}) {
  const createdAt = assertApprovalTimestamp("now", now);
  const expiry = assertApprovalTimestamp("expiresAt", expiresAt);
  const approvalProposalId = createOperationalId("approval_proposal");
  const approverRoles = assertApprovalList(
    "requiredApproverRoleBundles",
    requiredApproverRoleBundles,
    { minimumItems: 2, maximumItems: 2 }
  );
  if (approverRoles.some((role, index) => role !== REQUIRED_APPROVER_ROLES[index])) {
    throw approvalError("invalid_approval_roles", "approval role requirements are invalid");
  }
  const immutable = {
    approvalProposalId,
    tenantId: assertApprovalIdentifier("tenantId", preparation.tenantId),
    operationId: assertApprovalIdentifier("operationId", preparation.operationId),
    action: assertApprovalIdentifier("action", preparation.action),
    resourceType: assertApprovalIdentifier("resourceType", preparation.resourceType),
    resourceId: assertApprovalIdentifier("resourceId", preparation.resourceId),
    commandActorId: assertApprovalIdentifier("commandActorId", preparation.commandActorId),
    commandActorType: assertApprovalIdentifier("commandActorType", preparation.commandActorType),
    commandClientId: assertApprovalIdentifier("commandClientId", preparation.commandClientId),
    commandHash: assertApprovalHash("commandHash", preparation.commandHash),
    idempotencyKeyHash: assertApprovalReferenceHash(
      "idempotencyKeyHash",
      preparation.idempotencyKeyHash
    ),
    resourceVersion: assertApprovalVersion("resourceVersion", preparation.resourceVersion),
    liveStateVersion: assertApprovalVersion("liveStateVersion", preparation.liveStateVersion),
    reasonCode: assertApprovalReason("reasonCode", preparation.reasonCode),
    policyVersion: assertApprovalIdentifier("policyVersion", preparation.policyVersion),
    approvalPolicyVersion: APPROVAL_POLICY_VERSION,
    proposerActorId: assertApprovalIdentifier("proposerActorId", proposerContext.actorId),
    proposerClientId: assertApprovalIdentifier("proposerClientId", proposerContext.clientId),
    proposerMembershipId: assertApprovalIdentifier(
      "proposerMembershipId",
      proposerMembership.membershipId
    ),
    proposerMembershipVersion: assertApprovalVersion(
      "proposerMembershipVersion",
      proposerMembership.version,
      { minimum: 1 }
    ),
    requiredApproverRoleBundles: approverRoles,
    requiredApprovalCount: 2,
    expiresAt: expiry.toISOString(),
    createdAt: createdAt.toISOString(),
    schemaVersion: APPROVAL_PROPOSAL_SCHEMA_VERSION
  };
  const proposal = {
    ...immutable,
    proposalHash: hashId("approval_proposal", immutable),
    status: ApprovalProposalStatus.PENDING,
    version: 1,
    updatedAt: createdAt.toISOString()
  };
  assertNoSensitiveApprovalFields(proposal);
  return deepFreezeApproval(proposal);
}

export function transitionApprovalProposal(
  current,
  { status, now, supersededByProposalId, executionId }
) {
  if (!STATUSES.has(status)) {
    throw approvalError("invalid_approval_transition", "approval proposal status is invalid");
  }
  const allowed = new Map([
    [ApprovalProposalStatus.PENDING, new Set([
      ApprovalProposalStatus.APPROVED,
      ApprovalProposalStatus.REJECTED,
      ApprovalProposalStatus.CANCELED,
      ApprovalProposalStatus.EXPIRED,
      ApprovalProposalStatus.SUPERSEDED
    ])],
    [ApprovalProposalStatus.APPROVED, new Set([
      ApprovalProposalStatus.EXECUTED,
      ApprovalProposalStatus.CANCELED,
      ApprovalProposalStatus.EXPIRED,
      ApprovalProposalStatus.SUPERSEDED
    ])]
  ]);
  if (!allowed.get(current.status)?.has(status)) {
    throw approvalError("invalid_approval_transition", "approval proposal transition is invalid");
  }
  const occurredAt = assertApprovalTimestamp("now", now).toISOString();
  let transitionFields;
  if (status === ApprovalProposalStatus.SUPERSEDED) {
    transitionFields = {
      supersededAt: occurredAt,
      supersededByProposalId: assertApprovalIdentifier(
        "supersededByProposalId",
        supersededByProposalId
      )
    };
  } else if (status === ApprovalProposalStatus.EXECUTED) {
    transitionFields = {
      executedAt: occurredAt,
      executionId: assertApprovalIdentifier("executionId", executionId)
    };
  } else {
    transitionFields = {
      [ApprovalProposalStatus.APPROVED]: { approvedAt: occurredAt },
      [ApprovalProposalStatus.REJECTED]: { rejectedAt: occurredAt },
      [ApprovalProposalStatus.CANCELED]: { canceledAt: occurredAt },
      [ApprovalProposalStatus.EXPIRED]: { expiredAt: occurredAt }
    }[status];
  }
  return deepFreezeApproval({
    ...cloneApproval(current),
    ...transitionFields,
    status,
    version: current.version + 1,
    updatedAt: occurredAt
  });
}

export function createApprovalDecision({ proposal, context, membership, decision, reasonCode, now }) {
  if (!DECISIONS.has(decision)) {
    throw approvalError("invalid_approval_decision", "approval decision is invalid");
  }
  if (
    context.tenantId !== proposal.tenantId ||
    membership.tenantId !== proposal.tenantId ||
    membership.actorId !== context.actorId ||
    membership.actorType !== context.actorType ||
    membership.roleBundle !== context.actorType ||
    membership.policyVersion !== proposal.policyVersion ||
    !membership.clientIds.includes(context.clientId) ||
    !proposal.requiredApproverRoleBundles.includes(membership.roleBundle) ||
    [proposal.proposerActorId, proposal.commandActorId].includes(context.actorId)
  ) {
    throw approvalError("approval_separation_rejected", "approval separation of duties failed");
  }
  if (
    (decision === ApprovalDecisionValue.APPROVE && reasonCode !== "approval_confirmed") ||
    (decision === ApprovalDecisionValue.REJECT && reasonCode !== "approval_rejected")
  ) {
    throw approvalError("invalid_approval_reason", "decision reason does not match the decision");
  }
  const createdAt = assertApprovalTimestamp("now", now).toISOString();
  const approvalDecisionId = createOperationalId("approval_decision");
  const immutable = {
    approvalDecisionId,
    tenantId: proposal.tenantId,
    approvalProposalId: proposal.approvalProposalId,
    proposalVersion: proposal.version,
    proposalHash: proposal.proposalHash,
    commandHash: proposal.commandHash,
    policyVersion: proposal.policyVersion,
    decision,
    reasonCode: assertApprovalReason("reasonCode", reasonCode),
    approverActorId: assertApprovalIdentifier("approverActorId", context.actorId),
    approverActorType: assertApprovalIdentifier("approverActorType", context.actorType),
    approverClientId: assertApprovalIdentifier("approverClientId", context.clientId),
    approverCredentialId: assertApprovalIdentifier("approverCredentialId", context.credentialId),
    approverCredentialVersion: assertApprovalVersion(
      "approverCredentialVersion",
      context.credentialVersion,
      { minimum: 1 }
    ),
    approverMembershipId: assertApprovalIdentifier(
      "approverMembershipId",
      membership.membershipId
    ),
    approverMembershipVersion: assertApprovalVersion(
      "approverMembershipVersion",
      membership.version,
      { minimum: 1 }
    ),
    approverRoleBundle: assertApprovalIdentifier("approverRoleBundle", membership.roleBundle),
    authTime: assertApprovalTimestamp("authTime", context.authTime).toISOString(),
    authenticationMethods: assertApprovalList(
      "authenticationMethods",
      context.amr,
      { minimumItems: 1, maximumItems: 8 }
    ),
    tokenJtiHash: assertApprovalReferenceHash("tokenJtiHash", context.tokenJtiHash),
    createdAt,
    schemaVersion: APPROVAL_DECISION_SCHEMA_VERSION
  };
  const result = {
    ...immutable,
    decisionHash: hashId("approval_decision", immutable),
    version: 1
  };
  assertNoSensitiveApprovalFields(result);
  return deepFreezeApproval(result);
}

export function createApprovalExecution({
  proposal,
  authorizationDecision,
  approvalExecutionId: requestedApprovalExecutionId,
  idempotencyKeyHash,
  businessEventIds,
  resultHash,
  now
}) {
  if (
    authorizationDecision.approvalProposalId !== proposal.approvalProposalId ||
    authorizationDecision.approvalProposalVersion !== proposal.version ||
    authorizationDecision.commandHash !== proposal.commandHash ||
    authorizationDecision.tenantId !== proposal.tenantId ||
    authorizationDecision.actorId !== proposal.commandActorId
  ) {
    throw approvalError("approved_execution_rejected", "execution authority does not match proposal");
  }
  const approvalExecutionId = requestedApprovalExecutionId === undefined
    ? createOperationalId("approval_execution")
    : assertApprovalIdentifier("approvalExecutionId", requestedApprovalExecutionId);
  const immutable = {
    approvalExecutionId,
    tenantId: proposal.tenantId,
    approvalProposalId: proposal.approvalProposalId,
    proposalVersion: proposal.version,
    proposalHash: proposal.proposalHash,
    commandHash: proposal.commandHash,
    authorizationDecisionId: assertApprovalIdentifier(
      "authorizationDecisionId",
      authorizationDecision.decisionId
    ),
    executedByActorId: assertApprovalIdentifier(
      "executedByActorId",
      authorizationDecision.actorId
    ),
    idempotencyKeyHash: assertApprovalReferenceHash("idempotencyKeyHash", idempotencyKeyHash),
    approvalDecisionIds: assertApprovalList(
      "approvalDecisionIds",
      authorizationDecision.approvalIds,
      { minimumItems: 2, maximumItems: 2 }
    ),
    businessEventIds: assertApprovalList(
      "businessEventIds",
      businessEventIds,
      { minimumItems: 1, maximumItems: 128 }
    ),
    resultHash: assertApprovalHash("resultHash", resultHash),
    executedAt: assertApprovalTimestamp("now", now).toISOString(),
    schemaVersion: APPROVAL_EXECUTION_SCHEMA_VERSION,
    version: 1
  };
  const execution = {
    ...immutable,
    executionHash: hashId("approval_execution", immutable)
  };
  assertNoSensitiveApprovalFields(execution);
  return deepFreezeApproval(execution);
}
