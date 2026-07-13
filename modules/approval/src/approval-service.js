import {
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  PHISHING_RESISTANT_AMR,
  assertAuthenticationContext,
  assertRecentPhishingResistantAuthentication
} from "../../authentication/src/index.js";
import {
  PilotCapability,
  assertApprovalPreparation,
  assertAuthorizationDecision
} from "../../authorization/src/index.js";
import {
  APPROVAL_POLICY_VERSION,
  DEFAULT_APPROVAL_WINDOW_MS,
  MAX_APPROVAL_WINDOW_MS,
  ApprovalDecisionValue,
  ApprovalProjectionType,
  ApprovalProposalStatus
} from "./approval-constants.js";
import {
  createApprovalDecision,
  createApprovalExecution,
  createApprovalProposal,
  transitionApprovalProposal
} from "./approval-models.js";
import { requireDualControlProfile } from "./approval-policy.js";
import {
  approvalError,
  assertApprovalHash,
  assertApprovalIdentifier,
  assertApprovalReason,
  assertApprovalShape,
  assertApprovalTimestamp,
  assertApprovalVersion,
  assertNoSensitiveApprovalFields,
  cloneApproval
} from "./approval-utils.js";

const DECISIONS = new Set(Object.values(ApprovalDecisionValue));
const PHISHING_RESISTANT_METHODS = new Set(PHISHING_RESISTANT_AMR);

function credentialMatchesContext(credential, context) {
  return (
    credential.tenantId === context.tenantId &&
    credential.actorId === context.actorId &&
    credential.actorType === context.actorType &&
    credential.clientId === context.clientId &&
    credential.credentialId === context.credentialId &&
    credential.version === context.credentialVersion &&
    credential.policyVersion === context.policyVersion
  );
}

function createEvent(eventType, payload, now) {
  assertNoSensitiveApprovalFields(payload, "approvalEvent");
  return createCreditEvent({ eventType, payload, now });
}

function proposalResponse(proposal, decisions = []) {
  return {
    proposal: cloneApproval(proposal),
    decisions: decisions.map(cloneApproval),
    schemaVersion: "approval_command_response.v1"
  };
}

export class ApprovalService {
  constructor({
    repository,
    policyRegistry,
    directory,
    credentialRegistry,
    referenceHasher,
    clock = () => new Date()
  }) {
    if (
      !repository?.commitCommand ||
      !repository?.findCommand ||
      !repository?.getApprovalProposal ||
      !repository?.listApprovalDecisions ||
      !policyRegistry?.getAuthenticated ||
      !directory?.requireActiveMembership ||
      !credentialRegistry?.assertActive ||
      !referenceHasher?.hash ||
      typeof clock !== "function"
    ) {
      throw approvalError("invalid_approval_configuration", "approval adapters are required");
    }
    this.repository = repository;
    this.policyRegistry = policyRegistry;
    this.directory = directory;
    this.credentialRegistry = credentialRegistry;
    this.referenceHasher = referenceHasher;
    this.clock = clock;
    Object.freeze(this);
  }

  async propose({
    approvalPreparation,
    authenticationContext,
    idempotencyKey,
    expiresAt,
    now = this.clock()
  }) {
    const currentTime = assertApprovalTimestamp("now", now);
    const preparation = assertApprovalPreparation(approvalPreparation, {
      now: currentTime,
      allowExpired: true
    });
    const context = assertAuthenticationContext(authenticationContext);
    if (context.tenantId !== preparation.tenantId || context.policyVersion !== preparation.policyVersion) {
      throw approvalError("approval_tenant_mismatch", "approval proposal tenant is unavailable");
    }
    const membership = await this.#assertActorAuthority(
      context,
      PilotCapability.APPROVAL_PROPOSE,
      currentTime
    );
    const targetPolicy = this.policyRegistry.getAuthenticated(preparation.operationId);
    const profile = requireDualControlProfile(preparation.operationId);
    if (
      !targetPolicy ||
      targetPolicy.action !== preparation.action ||
      targetPolicy.resourceType !== preparation.resourceType ||
      this.policyRegistry.policyVersion !== preparation.policyVersion ||
      profile.policyVersion !== APPROVAL_POLICY_VERSION
    ) {
      throw approvalError("approval_policy_mismatch", "approval target policy changed");
    }
    const requestedExpiry = expiresAt === undefined
      ? undefined
      : assertApprovalTimestamp("expiresAt", expiresAt);
    const commandKey = assertApprovalIdentifier("idempotencyKey", idempotencyKey);
    const commandHash = hashId("approval_propose_command", {
      tenantId: preparation.tenantId,
      commandHash: preparation.commandHash,
      proposerActorId: context.actorId,
      proposerMembershipVersion: membership.version,
      requiredApproverRoleBundles: profile.requiredApproverRoleBundles,
      expiryPolicy: expiresAt === undefined
        ? { defaultWindowMs: DEFAULT_APPROVAL_WINDOW_MS }
        : { expiresAt: requestedExpiry.toISOString() }
    });
    const replay = await this.repository.findCommand({ idempotencyKey: commandKey, commandHash });
    if (replay) return { ...cloneApproval(replay.response), replayed: true };
    assertApprovalPreparation(approvalPreparation, { now: currentTime });
    const expiry = requestedExpiry ?? new Date(currentTime.getTime() + DEFAULT_APPROVAL_WINDOW_MS);
    if (
      expiry <= currentTime ||
      expiry.getTime() - currentTime.getTime() > MAX_APPROVAL_WINDOW_MS
    ) {
      throw approvalError("invalid_approval_window", "approval window must be at most 30 minutes");
    }
    const proposal = createApprovalProposal({
      preparation,
      proposerContext: context,
      proposerMembership: membership,
      requiredApproverRoleBundles: profile.requiredApproverRoleBundles,
      expiresAt: expiry,
      now: currentTime
    });
    const event = createEvent("approval_proposal_created", {
      approvalProposalId: proposal.approvalProposalId,
      proposalHash: proposal.proposalHash,
      operationId: proposal.operationId,
      action: proposal.action,
      resourceType: proposal.resourceType,
      resourceId: proposal.resourceId,
      commandActorId: proposal.commandActorId,
      commandHash: proposal.commandHash,
      proposerActorId: proposal.proposerActorId,
      requiredApproverRoleBundles: proposal.requiredApproverRoleBundles,
      expiresAt: proposal.expiresAt,
      policyVersion: proposal.policyVersion,
      approvalPolicyVersion: proposal.approvalPolicyVersion
    }, currentTime);
    const response = proposalResponse(proposal);
    const committed = await this.repository.commitCommand({
      aggregateType: ApprovalProjectionType.APPROVAL_PROPOSAL,
      aggregateId: proposal.approvalProposalId,
      idempotencyKey: commandKey,
      commandHash,
      events: [{
        aggregateType: ApprovalProjectionType.APPROVAL_PROPOSAL,
        aggregateId: proposal.approvalProposalId,
        expectedVersion: 0,
        event
      }],
      writes: [{
        type: ApprovalProjectionType.APPROVAL_PROPOSAL,
        value: proposal,
        eventId: event.eventId
      }],
      response
    });
    return { ...cloneApproval(committed.response), replayed: committed.replayed };
  }

  async decide({
    approvalProposalId,
    expectedVersion,
    decision,
    reasonCode,
    authenticationContext,
    idempotencyKey,
    now = this.clock()
  }) {
    if (!DECISIONS.has(decision)) {
      throw approvalError("invalid_approval_decision", "approval decision is invalid");
    }
    const currentTime = assertApprovalTimestamp("now", now);
    const context = assertAuthenticationContext(authenticationContext);
    const membership = await this.#assertActorAuthority(
      context,
      PilotCapability.APPROVAL_DECIDE,
      currentTime
    );
    const proposalId = assertApprovalIdentifier("approvalProposalId", approvalProposalId);
    const version = assertApprovalVersion("expectedVersion", expectedVersion, { minimum: 1 });
    const reason = assertApprovalReason("reasonCode", reasonCode);
    const commandKey = assertApprovalIdentifier("idempotencyKey", idempotencyKey);
    if (
      (decision === ApprovalDecisionValue.APPROVE && reason !== "approval_confirmed") ||
      (decision === ApprovalDecisionValue.REJECT && reason !== "approval_rejected")
    ) {
      throw approvalError("invalid_approval_reason", "decision reason does not match the decision");
    }
    const commandHash = hashId("approval_decide_command", {
      proposalId,
      expectedVersion: version,
      decision,
      reason,
      actorId: context.actorId
    });
    const replay = await this.repository.findCommand({ idempotencyKey: commandKey, commandHash });
    if (replay) return { ...cloneApproval(replay.response), replayed: true };
    const proposal = await this.#requireProposal(proposalId);
    const existingDecisions = await this.repository.listApprovalDecisions(proposalId);
    if (
      proposal.version !== version ||
      proposal.status !== ApprovalProposalStatus.PENDING ||
      proposal.tenantId !== context.tenantId ||
      new Date(proposal.expiresAt) <= currentTime
    ) {
      throw approvalError("approval_proposal_not_pending", "approval proposal is stale or unavailable");
    }
    if (
      proposal.proposerActorId === context.actorId ||
      proposal.commandActorId === context.actorId ||
      !proposal.requiredApproverRoleBundles.includes(membership.roleBundle) ||
      existingDecisions.some(({ approverActorId }) => approverActorId === context.actorId) ||
      existingDecisions.some(({ approverRoleBundle, decision: value }) =>
        value === ApprovalDecisionValue.APPROVE && approverRoleBundle === membership.roleBundle
      )
    ) {
      throw approvalError("approval_separation_rejected", "approval separation of duties failed");
    }
    const approvalDecision = createApprovalDecision({
      proposal,
      context,
      membership,
      decision,
      reasonCode: reason,
      now: currentTime
    });
    const decisions = [...existingDecisions, approvalDecision];
    const approvedRoles = new Set(
      decisions
        .filter(({ decision: value }) => value === ApprovalDecisionValue.APPROVE)
        .map(({ approverRoleBundle }) => approverRoleBundle)
    );
    const nextStatus = decision === ApprovalDecisionValue.REJECT
      ? ApprovalProposalStatus.REJECTED
      : proposal.requiredApproverRoleBundles.every((role) => approvedRoles.has(role))
        ? ApprovalProposalStatus.APPROVED
        : ApprovalProposalStatus.PENDING;
    const updated = nextStatus === ApprovalProposalStatus.PENDING
      ? { ...cloneApproval(proposal), version: proposal.version + 1, updatedAt: currentTime.toISOString() }
      : transitionApprovalProposal(proposal, { status: nextStatus, now: currentTime });
    const decisionEvent = createEvent("approval_decision_recorded", {
      approvalProposalId: proposalId,
      approvalDecisionId: approvalDecision.approvalDecisionId,
      decisionHash: approvalDecision.decisionHash,
      decision,
      approverActorId: approvalDecision.approverActorId,
      approverRoleBundle: approvalDecision.approverRoleBundle,
      proposalVersion: proposal.version,
      commandHash: proposal.commandHash,
      reasonCode: reason
    }, currentTime);
    const proposalEvent = createEvent(
      nextStatus === ApprovalProposalStatus.APPROVED
        ? "approval_proposal_approved"
        : nextStatus === ApprovalProposalStatus.REJECTED
          ? "approval_proposal_rejected"
          : "approval_proposal_progressed",
      {
        approvalProposalId: proposalId,
        proposalHash: proposal.proposalHash,
        status: nextStatus,
        approvalDecisionId: approvalDecision.approvalDecisionId,
        approvedRoleBundles: [...approvedRoles].sort(),
        version: updated.version
      },
      currentTime
    );
    const response = proposalResponse(updated, decisions);
    const committed = await this.repository.commitCommand({
      aggregateType: ApprovalProjectionType.APPROVAL_PROPOSAL,
      aggregateId: proposalId,
      idempotencyKey: commandKey,
      commandHash,
      events: [
        {
          aggregateType: ApprovalProjectionType.APPROVAL_DECISION,
          aggregateId: approvalDecision.approvalDecisionId,
          expectedVersion: 0,
          event: decisionEvent
        },
        {
          aggregateType: ApprovalProjectionType.APPROVAL_PROPOSAL,
          aggregateId: proposalId,
          expectedVersion: proposal.version,
          event: proposalEvent
        }
      ],
      writes: [
        {
          type: ApprovalProjectionType.APPROVAL_DECISION,
          value: approvalDecision,
          eventId: decisionEvent.eventId
        },
        {
          type: ApprovalProjectionType.APPROVAL_PROPOSAL,
          value: updated,
          eventId: proposalEvent.eventId
        }
      ],
      response
    });
    return { ...cloneApproval(committed.response), replayed: committed.replayed };
  }

  async cancel(input) {
    return this.#terminalTransition({
      ...input,
      capability: PilotCapability.APPROVAL_CANCEL,
      status: ApprovalProposalStatus.CANCELED,
      allowedReason: "proposal_canceled"
    });
  }

  async supersede(input) {
    assertApprovalIdentifier("supersededByProposalId", input.supersededByProposalId);
    return this.#terminalTransition({
      ...input,
      capability: PilotCapability.APPROVAL_CANCEL,
      status: ApprovalProposalStatus.SUPERSEDED,
      allowedReason: "proposal_superseded"
    });
  }

  async expire(input) {
    return this.#terminalTransition({
      ...input,
      capability: PilotCapability.APPROVAL_EXPIRE,
      status: ApprovalProposalStatus.EXPIRED,
      allowedReason: "approval_window_elapsed",
      workerOnly: true
    });
  }

  async assertApproved({
    approvalArtifact,
    tenantId,
    actorId,
    operationId,
    action,
    resourceType,
    resourceId,
    resourceVersion,
    reasonCode,
    commandHash,
    policyVersion,
    now = this.clock()
  }) {
    assertApprovalShape("approvalArtifact", approvalArtifact, {
      required: ["proposalId", "proposalVersion"]
    });
    const currentTime = assertApprovalTimestamp("now", now);
    const proposal = await this.#requireProposal(approvalArtifact.proposalId);
    const decisions = await this.repository.listApprovalDecisions(proposal.approvalProposalId);
    if (
      proposal.status !== ApprovalProposalStatus.APPROVED ||
      proposal.version !== approvalArtifact.proposalVersion ||
      proposal.tenantId !== tenantId ||
      proposal.commandActorId !== actorId ||
      proposal.operationId !== operationId ||
      proposal.action !== action ||
      proposal.resourceType !== resourceType ||
      proposal.resourceId !== resourceId ||
      proposal.resourceVersion !== resourceVersion ||
      proposal.reasonCode !== reasonCode ||
      proposal.commandHash !== commandHash ||
      proposal.policyVersion !== policyVersion ||
      proposal.approvalPolicyVersion !== APPROVAL_POLICY_VERSION ||
      new Date(proposal.expiresAt) <= currentTime
    ) {
      throw approvalError("approval_verification_failed", "approved proposal does not match the command");
    }
    const approvals = decisions.filter(({ decision }) => decision === ApprovalDecisionValue.APPROVE);
    if (
      approvals.length !== proposal.requiredApprovalCount ||
      new Set(approvals.map(({ approverActorId }) => approverActorId)).size !== approvals.length ||
      new Set(approvals.map(({ approverRoleBundle }) => approverRoleBundle)).size !== approvals.length ||
      approvals.some(({ approverActorId }) =>
        approverActorId === proposal.proposerActorId || approverActorId === proposal.commandActorId
      ) ||
      !proposal.requiredApproverRoleBundles.every((requiredRole) =>
        approvals.some(({ approverRoleBundle }) => approverRoleBundle === requiredRole)
      )
    ) {
      throw approvalError("approval_verification_failed", "dual-control decision set is invalid");
    }
    for (const approval of approvals) {
      await this.#revalidateRecordedApprover(approval, currentTime);
    }
    return {
      proposalId: proposal.approvalProposalId,
      proposalVersion: proposal.version,
      approvalIds: approvals.map(({ approvalDecisionId }) => approvalDecisionId),
      approverActorIds: approvals.map(({ approverActorId }) => approverActorId),
      commandHash: proposal.commandHash
    };
  }

  async executeApprovedCommand({
    authorizationDecision,
    idempotencyKey,
    buildApprovedMutation,
    now = this.clock()
  }) {
    const currentTime = assertApprovalTimestamp("now", now);
    const decision = assertAuthorizationDecision(authorizationDecision, { now: currentTime });
    if (
      decision.revalidationCount < 1 ||
      !decision.approvalProposalId ||
      !Number.isSafeInteger(decision.approvalProposalVersion) ||
      typeof buildApprovedMutation !== "function"
    ) {
      throw approvalError("approved_execution_rejected", "revalidated approval authority is required");
    }
    const commandKey = assertApprovalIdentifier("idempotencyKey", idempotencyKey);
    if (
      decision.idempotencyKeyHash !==
      this.referenceHasher.hash("authorization.idempotency", commandKey)
    ) {
      throw approvalError(
        "approved_execution_idempotency_mismatch",
        "approved execution must reuse the authorized command idempotency key"
      );
    }
    const idempotencyKeyHash = this.referenceHasher.hash("approval.execution", commandKey);
    const executionCommandHash = hashId("approval_execute_command", {
      approvalProposalId: decision.approvalProposalId,
      approvalProposalVersion: decision.approvalProposalVersion,
      commandHash: decision.commandHash,
      idempotencyKeyHash
    });
    const replay = await this.repository.findCommand({
      idempotencyKey: commandKey,
      commandHash: executionCommandHash
    });
    if (replay) return { ...cloneApproval(replay.response), replayed: true };
    const proposal = await this.#requireProposal(decision.approvalProposalId);
    await this.assertApproved({
      approvalArtifact: {
        proposalId: decision.approvalProposalId,
        proposalVersion: decision.approvalProposalVersion
      },
      tenantId: decision.tenantId,
      actorId: decision.actorId,
      operationId: decision.operationId,
      action: decision.action,
      resourceType: decision.resourceType,
      resourceId: decision.resourceId,
      resourceVersion: decision.resourceVersion,
      reasonCode: proposal.reasonCode,
      commandHash: decision.commandHash,
      policyVersion: decision.policyVersion,
      now: currentTime
    });
    const mutation = await buildApprovedMutation(cloneApproval(proposal));
    if (
      !mutation ||
      !Array.isArray(mutation.events) ||
      mutation.events.length === 0 ||
      !Array.isArray(mutation.writes) ||
      mutation.writes.length === 0
    ) {
      throw approvalError("approved_mutation_invalid", "approved mutation must contain events and writes");
    }
    if (
      mutation.events.some(({ aggregateType }) =>
        aggregateType === ApprovalProjectionType.APPROVAL_PROPOSAL ||
        aggregateType === ApprovalProjectionType.APPROVAL_EXECUTION
      ) ||
      mutation.writes.some(({ type }) =>
        type === ApprovalProjectionType.APPROVAL_PROPOSAL ||
        type === ApprovalProjectionType.APPROVAL_EXECUTION
      )
    ) {
      throw approvalError("approved_mutation_invalid", "business mutation cannot replace approval records");
    }
    const businessEventIds = mutation.events.map(({ event }) =>
      assertApprovalIdentifier("businessEventId", event?.eventId)
    );
    const resultHash = hashId("approved_command_result", mutation.response ?? {});
    const execution = createApprovalExecution({
      proposal,
      authorizationDecision: decision,
      idempotencyKeyHash,
      businessEventIds,
      resultHash,
      now: currentTime
    });
    const updatedProposal = transitionApprovalProposal(proposal, {
      status: ApprovalProposalStatus.EXECUTED,
      executionId: execution.approvalExecutionId,
      now: currentTime
    });
    const executionEvent = createEvent("approval_execution_recorded", {
      approvalExecutionId: execution.approvalExecutionId,
      approvalProposalId: proposal.approvalProposalId,
      executionHash: execution.executionHash,
      authorizationDecisionId: decision.decisionId,
      businessEventIds,
      resultHash
    }, currentTime);
    const proposalEvent = createEvent("approval_proposal_executed", {
      approvalProposalId: proposal.approvalProposalId,
      approvalExecutionId: execution.approvalExecutionId,
      commandHash: proposal.commandHash,
      version: updatedProposal.version
    }, currentTime);
    const response = {
      result: cloneApproval(mutation.response ?? {}),
      approvalExecution: cloneApproval(execution),
      schemaVersion: "approved_execution_response.v1"
    };
    const committed = await this.repository.commitCommand({
      aggregateType: ApprovalProjectionType.APPROVAL_PROPOSAL,
      aggregateId: proposal.approvalProposalId,
      idempotencyKey: commandKey,
      commandHash: executionCommandHash,
      events: [
        {
          aggregateType: ApprovalProjectionType.APPROVAL_EXECUTION,
          aggregateId: execution.approvalExecutionId,
          expectedVersion: 0,
          event: executionEvent
        },
        ...mutation.events,
        {
          aggregateType: ApprovalProjectionType.APPROVAL_PROPOSAL,
          aggregateId: proposal.approvalProposalId,
          expectedVersion: proposal.version,
          event: proposalEvent
        }
      ],
      writes: [
        ...mutation.writes,
        {
          type: ApprovalProjectionType.APPROVAL_EXECUTION,
          value: execution,
          eventId: executionEvent.eventId
        },
        {
          type: ApprovalProjectionType.APPROVAL_PROPOSAL,
          value: updatedProposal,
          eventId: proposalEvent.eventId
        }
      ],
      response
    });
    return { ...cloneApproval(committed.response), replayed: committed.replayed };
  }

  async #terminalTransition({
    approvalProposalId,
    expectedVersion,
    reasonCode,
    supersededByProposalId,
    authenticationContext,
    idempotencyKey,
    now = this.clock(),
    capability,
    status,
    allowedReason,
    workerOnly = false
  }) {
    const currentTime = assertApprovalTimestamp("now", now);
    const context = assertAuthenticationContext(authenticationContext);
    await this.#assertActorAuthority(context, capability, currentTime, { requireHumanMfa: !workerOnly });
    const proposalId = assertApprovalIdentifier("approvalProposalId", approvalProposalId);
    const version = assertApprovalVersion("expectedVersion", expectedVersion, { minimum: 1 });
    const reason = assertApprovalReason("reasonCode", reasonCode);
    const commandKey = assertApprovalIdentifier("idempotencyKey", idempotencyKey);
    if (reason !== allowedReason) {
      throw approvalError("invalid_approval_reason", "approval transition reason is invalid");
    }
    const commandHash = hashId("approval_terminal_command", {
      proposalId,
      expectedVersion: version,
      status,
      reason,
      supersededByProposalId: supersededByProposalId ?? null,
      actorId: context.actorId
    });
    const replay = await this.repository.findCommand({ idempotencyKey: commandKey, commandHash });
    if (replay) return { ...cloneApproval(replay.response), replayed: true };
    const proposal = await this.#requireProposal(proposalId);
    if (
      proposal.version !== version ||
      proposal.tenantId !== context.tenantId ||
      ![ApprovalProposalStatus.PENDING, ApprovalProposalStatus.APPROVED].includes(proposal.status) ||
      (!workerOnly && proposal.proposerActorId !== context.actorId) ||
      (workerOnly && currentTime < new Date(proposal.expiresAt))
    ) {
      throw approvalError("approval_transition_rejected", "approval proposal transition is unavailable");
    }
    const updated = transitionApprovalProposal(proposal, {
      status,
      supersededByProposalId,
      now: currentTime
    });
    const event = createEvent(`approval_proposal_${status}`, {
      approvalProposalId: proposalId,
      proposalHash: proposal.proposalHash,
      status,
      reasonCode: reason,
      performedByActorId: context.actorId,
      supersededByProposalId: supersededByProposalId ?? undefined,
      version: updated.version
    }, currentTime);
    const decisions = await this.repository.listApprovalDecisions(proposalId);
    const response = proposalResponse(updated, decisions);
    const committed = await this.repository.commitCommand({
      aggregateType: ApprovalProjectionType.APPROVAL_PROPOSAL,
      aggregateId: proposalId,
      idempotencyKey: commandKey,
      commandHash,
      events: [{
        aggregateType: ApprovalProjectionType.APPROVAL_PROPOSAL,
        aggregateId: proposalId,
        expectedVersion: proposal.version,
        event
      }],
      writes: [{ type: ApprovalProjectionType.APPROVAL_PROPOSAL, value: updated, eventId: event.eventId }],
      response
    });
    return { ...cloneApproval(committed.response), replayed: committed.replayed };
  }

  async #assertActorAuthority(context, capability, now, { requireHumanMfa = true } = {}) {
    const credential = await this.credentialRegistry.assertActive(context.credentialId, now);
    const membership = await this.directory.requireActiveMembership({
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorType: context.actorType,
      clientId: context.clientId,
      policyVersion: context.policyVersion,
      now
    });
    if (
      !credentialMatchesContext(credential, context) ||
      !context.capabilities.includes(capability) ||
      !credential.allowedCapabilities.includes(capability) ||
      !membership.capabilities.includes(capability) ||
      !context.roles.includes(membership.roleBundle)
    ) {
      throw approvalError("approval_actor_not_authorized", "approval actor authority is unavailable");
    }
    if (requireHumanMfa) assertRecentPhishingResistantAuthentication(context, { now });
    return membership;
  }

  async #revalidateRecordedApprover(decision, now) {
    const credential = await this.credentialRegistry.assertActive(decision.approverCredentialId, now);
    const membership = await this.directory.requireActiveMembership({
      tenantId: decision.tenantId,
      actorId: decision.approverActorId,
      actorType: decision.approverActorType,
      clientId: decision.approverClientId,
      policyVersion: decision.policyVersion,
      now
    });
    const authTime = new Date(decision.authTime);
    const ageMs = now.getTime() - authTime.getTime();
    if (
      credential.credentialId !== decision.approverCredentialId ||
      credential.tenantId !== decision.tenantId ||
      credential.version !== decision.approverCredentialVersion ||
      credential.actorId !== decision.approverActorId ||
      credential.actorType !== decision.approverActorType ||
      credential.clientId !== decision.approverClientId ||
      credential.policyVersion !== decision.policyVersion ||
      !credential.allowedCapabilities.includes(PilotCapability.APPROVAL_DECIDE) ||
      membership.membershipId !== decision.approverMembershipId ||
      membership.tenantId !== decision.tenantId ||
      membership.actorId !== decision.approverActorId ||
      membership.actorType !== decision.approverActorType ||
      membership.version !== decision.approverMembershipVersion ||
      membership.roleBundle !== decision.approverRoleBundle ||
      membership.policyVersion !== decision.policyVersion ||
      !membership.clientIds.includes(decision.approverClientId) ||
      !membership.capabilities.includes(PilotCapability.APPROVAL_DECIDE) ||
      ageMs < -30_000 ||
      ageMs > 15 * 60_000 ||
      !decision.authenticationMethods.some((method) =>
        PHISHING_RESISTANT_METHODS.has(method.toLowerCase())
      )
    ) {
      throw approvalError("approval_revalidation_failed", "approver authority changed or MFA is stale");
    }
  }

  async #requireProposal(proposalId) {
    const proposal = await this.repository.getApprovalProposal(
      assertApprovalIdentifier("approvalProposalId", proposalId)
    );
    if (!proposal) throw approvalError("approval_proposal_not_found", "approval proposal is unavailable");
    assertApprovalHash("proposalHash", proposal.proposalHash);
    return proposal;
  }
}
