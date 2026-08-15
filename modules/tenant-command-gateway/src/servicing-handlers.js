import {
  CreditEventType,
  DomainError,
  LedgerAccountStatus,
  LedgerAccountType,
  advanceSandboxServicing,
  createCreditEvent,
  createOperationalId,
  createSandboxLedgerAccounts,
  createSandboxWriteOffTransaction,
  hashId,
  repurchaseSandboxObligation,
  restructureSandboxObligation,
  writeOffSandboxObligation
} from "../../../packages/domain/src/index.js";
import {
  ApprovalProjectionType,
  ApprovalProposalStatus,
  createApprovalExecution,
  transitionApprovalProposal
} from "../../approval/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  summarizeServicingAction,
  summarizeSharedObligation
} from "./credit-acceptance-handlers.js";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const RESOLUTION_REASON_CODES = Object.freeze({
  pilotRestructureSandboxObligation: "sandbox_hardship_restructure",
  pilotRepurchaseSandboxObligation: "sandbox_contractual_repurchase",
  pilotWriteOffSandboxObligation: "sandbox_uncollectible_writeoff"
});

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function assertExactObject(payload, keys) {
  if (
    !payload || typeof payload !== "object" || Array.isArray(payload) ||
    Object.keys(payload).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(payload, key))
  ) {
    throw new DomainError("invalid_tenant_command_payload", "sandbox servicing payload is invalid");
  }
}

function normalizeAdvancePayload(payload) {
  assertExactObject(payload, []);
  return {};
}

function normalizeResolutionPayload(operationId, payload) {
  const keys = operationId === "pilotRestructureSandboxObligation"
    ? ["expectedServicingStateHash", "additionalTermDays"]
    : operationId === "pilotRepurchaseSandboxObligation"
      ? ["expectedServicingStateHash", "servicingOwnerCode"]
      : ["expectedServicingStateHash"];
  assertExactObject(payload, keys);
  if (typeof payload.expectedServicingStateHash !== "string" ||
      !HASH_PATTERN.test(payload.expectedServicingStateHash)) {
    throw new DomainError("invalid_tenant_command_payload", "expected servicing state hash is invalid");
  }
  if (
    operationId === "pilotRestructureSandboxObligation" &&
    (!Number.isSafeInteger(payload.additionalTermDays) ||
      payload.additionalTermDays < 1 || payload.additionalTermDays > 90)
  ) {
    throw new DomainError("invalid_tenant_command_payload", "restructure term is invalid");
  }
  if (
    operationId === "pilotRepurchaseSandboxObligation" &&
    !["sandbox_platform", "sandbox_originator"].includes(payload.servicingOwnerCode)
  ) {
    throw new DomainError("invalid_tenant_command_payload", "servicing owner is invalid");
  }
  return structuredClone(payload);
}

function servicingStateHash(obligation) {
  return hashId("sandbox_servicing_state", obligation);
}

async function loadObligation({ client, coreRepository, authorizationDecision }) {
  if (authorizationDecision.resourceType !== "obligation") unavailable();
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.OBLIGATION,
    authorizationDecision.resourceId,
    { lock: true }
  );
  const obligation = state?.value;
  if (
    !obligation || obligation.obligationId !== authorizationDecision.resourceId ||
    obligation.schemaVersion !== "obligation.v2" || obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false || obligation.executionStatus !== "executed"
  ) unavailable();
  return { state, obligation };
}

function servicingEvent({ eventType, action, actorId, requestId, correlationId, now }) {
  return createCreditEvent({
    eventType,
    subjectId: action.subjectId,
    obligationId: action.obligationId,
    payload: {
      servicingActionId: action.servicingActionId,
      servicingActionHash: action.servicingActionHash,
      actionType: action.actionType,
      previousStatus: action.previousStatus,
      nextStatus: action.nextStatus,
      previousClassification: action.previousClassification,
      nextClassification: action.nextClassification,
      daysPastDue: action.daysPastDue,
      oldestUnpaidInstallmentId: action.oldestUnpaidInstallmentId,
      scheduleSequenceBefore: action.scheduleSequenceBefore,
      scheduleSequenceAfter: action.scheduleSequenceAfter,
      balancesBefore: action.balancesBefore,
      balancesAfter: action.balancesAfter,
      reasonCode: action.reasonCode,
      policyVersion: action.policyVersion,
      actorId,
      causationId: requestId,
      correlationId,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    now
  });
}

function servicingResponseSchemaVersion(operationId) {
  return {
    workerAdvanceSandboxServicing: "tenant_sandbox_servicing_advanced.v1",
    pilotRestructureSandboxObligation: "tenant_sandbox_obligation_restructured.v1",
    pilotRepurchaseSandboxObligation: "tenant_sandbox_obligation_repurchased.v1",
    pilotWriteOffSandboxObligation: "tenant_sandbox_obligation_written_off.v1"
  }[operationId];
}

function summarizeServicingResult(obligation, action, operationId, extra = {}) {
  return {
    obligation: summarizeSharedObligation(obligation),
    servicingStateHash: servicingStateHash(obligation),
    ...(action ? { servicingAction: summarizeServicingAction(action) } : {}),
    ...extra,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: servicingResponseSchemaVersion(operationId)
  };
}

export function advanceSandboxServicingCommandHandler() {
  return Object.freeze({
    operationId: "workerAdvanceSandboxServicing",
    kind: "command",
    async plan({
      client,
      coreRepository,
      payload,
      authenticationContext,
      authorizationDecision,
      now,
      requestId,
      correlationId
    }) {
      normalizeAdvancePayload(payload);
      const { state, obligation } = await loadObligation({
        client,
        coreRepository,
        authorizationDecision
      });
      const result = advanceSandboxServicing(obligation, {
        actorId: authenticationContext.actorId,
        now
      });
      if (!result.changed) {
        const checkedEvent = createCreditEvent({
          eventType: "servicing_checked",
          subjectId: obligation.subjectId,
          obligationId: obligation.obligationId,
          payload: {
            obligationId: obligation.obligationId,
            servicingStateHash: servicingStateHash(obligation),
            daysPastDue: obligation.daysPastDue,
            servicingClassification: obligation.servicingClassification,
            actorId: authenticationContext.actorId,
            causationId: requestId,
            correlationId,
            policyVersion: obligation.servicingPolicyVersion,
            changed: false,
            sandboxOnly: true
          },
          now
        });
        return {
          aggregateType: "obligation",
          aggregateId: obligation.obligationId,
          events: [{
            aggregateType: "obligation",
            aggregateId: obligation.obligationId,
            expectedVersion: state.aggregateVersion,
            event: checkedEvent
          }],
          writes: [{
            type: CoreProjectionType.OBLIGATION,
            value: obligation,
            eventId: checkedEvent.eventId
          }],
          response: {
            ...summarizeServicingResult(obligation, undefined, "workerAdvanceSandboxServicing"),
            changed: false
          }
        };
      }
      const event = servicingEvent({
        eventType: CreditEventType.SERVICING_ADVANCED,
        action: result.servicingAction,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "obligation",
        aggregateId: obligation.obligationId,
        events: [{
          aggregateType: "obligation",
          aggregateId: obligation.obligationId,
          expectedVersion: state.aggregateVersion,
          event
        }],
        writes: [
          { type: CoreProjectionType.OBLIGATION, value: result.obligation, eventId: event.eventId },
          {
            type: CoreProjectionType.SANDBOX_SERVICING_ACTION,
            value: result.servicingAction,
            eventId: event.eventId
          }
        ],
        response: {
          ...summarizeServicingResult(
            result.obligation,
            result.servicingAction,
            "workerAdvanceSandboxServicing"
          ),
          changed: true
        }
      };
    }
  });
}

async function assertWriteOffAccounts({ client, coreRepository, obligation }) {
  const accounts = createSandboxLedgerAccounts(obligation, {
    now: new Date(obligation.executedAt)
  });
  for (const accountType of [
    LedgerAccountType.PRINCIPAL_RECEIVABLE,
    LedgerAccountType.INTEREST_RECEIVABLE,
    LedgerAccountType.FEE_RECEIVABLE,
    LedgerAccountType.WRITE_OFF_LOSS
  ]) {
    const expected = accounts[accountType];
    const state = await coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.LEDGER_ACCOUNT,
      expected.ledgerAccountId,
      { lock: true }
    );
    if (!state || state.value.status !== LedgerAccountStatus.ACTIVE ||
        state.value.ledgerAccountHash !== expected.ledgerAccountHash) {
      throw new DomainError("sandbox_ledger_unavailable", "sandbox write-off accounts are unavailable");
    }
  }
}

async function loadApprovalProposal({ client, coreRepository, authorizationDecision }) {
  const proposalState = await coreRepository.getProjectionStateInTransaction(
    client,
    ApprovalProjectionType.APPROVAL_PROPOSAL,
    authorizationDecision.approvalProposalId,
    { lock: true }
  );
  const proposal = proposalState?.value;
  if (
    !proposal || proposal.status !== ApprovalProposalStatus.APPROVED ||
    proposal.version !== authorizationDecision.approvalProposalVersion
  ) {
    throw new DomainError("approved_execution_rejected", "approved servicing execution is unavailable");
  }
  return { proposalState, proposal };
}

function resolutionEventType(operationId) {
  return {
    pilotRestructureSandboxObligation: CreditEventType.OBLIGATION_RESTRUCTURED,
    pilotRepurchaseSandboxObligation: CreditEventType.OBLIGATION_REPURCHASED,
    pilotWriteOffSandboxObligation: CreditEventType.OBLIGATION_WRITTEN_OFF
  }[operationId];
}

function applyResolution(operationId, obligation, input, context) {
  if (operationId === "pilotRestructureSandboxObligation") {
    return restructureSandboxObligation(obligation, {
      additionalTermDays: input.additionalTermDays,
      ...context
    });
  }
  if (operationId === "pilotRepurchaseSandboxObligation") {
    return repurchaseSandboxObligation(obligation, {
      servicingOwnerCode: input.servicingOwnerCode,
      ...context
    });
  }
  return writeOffSandboxObligation(obligation, context);
}

export function sandboxServicingResolutionCommandHandler(operationId) {
  if (!Object.hasOwn(RESOLUTION_REASON_CODES, operationId)) {
    throw new DomainError("invalid_servicing_operation", "servicing operation is invalid");
  }
  return Object.freeze({
    operationId,
    kind: "command",
    async plan({
      client,
      coreRepository,
      payload,
      reasonCode,
      authenticationContext,
      authorizationDecision,
      now,
      requestId,
      correlationId
    }) {
      const input = normalizeResolutionPayload(operationId, payload);
      const requiredReasonCode = RESOLUTION_REASON_CODES[operationId];
      if (reasonCode !== requiredReasonCode) {
        throw new DomainError("servicing_reason_mismatch", "servicing reason is not permitted");
      }
      // Keep both row-locking reads ordered on the transaction client. A single
      // PostgreSQL client cannot safely multiplex concurrent queries, and a
      // stable lock order avoids resolution/approval deadlocks under replay.
      const { state, obligation } = await loadObligation({
        client,
        coreRepository,
        authorizationDecision
      });
      const { proposalState, proposal } = await loadApprovalProposal({
        client,
        coreRepository,
        authorizationDecision
      });
      if (input.expectedServicingStateHash !== servicingStateHash(obligation)) {
        throw new DomainError("stale_servicing_state", "servicing state changed after proposal preparation");
      }
      if (operationId === "pilotWriteOffSandboxObligation") {
        await assertWriteOffAccounts({ client, coreRepository, obligation });
      }

      const approvalExecutionId = createOperationalId("approval_execution");
      const resolution = applyResolution(operationId, obligation, input, {
        reasonCode: requiredReasonCode,
        actorId: authenticationContext.actorId,
        approvalProposalId: proposal.approvalProposalId,
        approvalExecutionId,
        now
      });
      const businessEvent = servicingEvent({
        eventType: resolutionEventType(operationId),
        action: resolution.servicingAction,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      let writeOffTransaction;
      let ledgerEvent;
      if (operationId === "pilotWriteOffSandboxObligation") {
        writeOffTransaction = createSandboxWriteOffTransaction(obligation, {
          servicingActionId: resolution.servicingAction.servicingActionId,
          now
        });
        ledgerEvent = createCreditEvent({
          eventType: CreditEventType.LEDGER_TRANSACTION_POSTED,
          subjectId: obligation.subjectId,
          obligationId: obligation.obligationId,
          payload: {
            ledgerTransactionId: writeOffTransaction.ledgerTransactionId,
            transactionHash: writeOffTransaction.transactionHash,
            transactionType: writeOffTransaction.transactionType,
            debitTotalMinor: writeOffTransaction.debitTotalMinor,
            creditTotalMinor: writeOffTransaction.creditTotalMinor,
            entryCount: writeOffTransaction.entryCount,
            actorId: authenticationContext.actorId,
            causationId: requestId,
            correlationId,
            sandboxOnly: true,
            productionFundsMoved: false
          },
          now
        });
      }
      const businessResponse = summarizeServicingResult(
        resolution.obligation,
        resolution.servicingAction,
        operationId,
        writeOffTransaction ? { writeOffLedgerTransactionId: writeOffTransaction.ledgerTransactionId } : {}
      );
      const businessEventIds = [businessEvent.eventId, ledgerEvent?.eventId].filter(Boolean);
      const execution = createApprovalExecution({
        proposal,
        authorizationDecision,
        approvalExecutionId,
        idempotencyKeyHash: authorizationDecision.idempotencyKeyHash,
        businessEventIds,
        resultHash: hashId("approved_command_result", businessResponse),
        now
      });
      const updatedProposal = transitionApprovalProposal(proposal, {
        status: ApprovalProposalStatus.EXECUTED,
        executionId: approvalExecutionId,
        now
      });
      const executionEvent = createCreditEvent({
        eventType: "approval_execution_recorded",
        payload: {
          approvalExecutionId,
          approvalProposalId: proposal.approvalProposalId,
          executionHash: execution.executionHash,
          businessEventIds,
          resultHash: execution.resultHash,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      const proposalEvent = createCreditEvent({
        eventType: "approval_proposal_executed",
        payload: {
          approvalProposalId: proposal.approvalProposalId,
          approvalExecutionId,
          commandHash: proposal.commandHash,
          version: updatedProposal.version,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      const obligationEvents = [businessEvent, ledgerEvent].filter(Boolean);
      return {
        aggregateType: "obligation",
        aggregateId: obligation.obligationId,
        events: [
          ...obligationEvents.map((event, index) => ({
            aggregateType: "obligation",
            aggregateId: obligation.obligationId,
            expectedVersion: state.aggregateVersion + index,
            event
          })),
          {
            aggregateType: ApprovalProjectionType.APPROVAL_EXECUTION,
            aggregateId: approvalExecutionId,
            expectedVersion: 0,
            event: executionEvent
          },
          {
            aggregateType: ApprovalProjectionType.APPROVAL_PROPOSAL,
            aggregateId: proposal.approvalProposalId,
            expectedVersion: proposalState.aggregateVersion,
            event: proposalEvent
          }
        ],
        writes: [
          {
            type: CoreProjectionType.OBLIGATION,
            value: resolution.obligation,
            eventId: businessEvent.eventId
          },
          {
            type: CoreProjectionType.SANDBOX_SERVICING_ACTION,
            value: resolution.servicingAction,
            eventId: businessEvent.eventId
          },
          ...(writeOffTransaction ? [{
            type: CoreProjectionType.LEDGER_TRANSACTION,
            value: writeOffTransaction,
            eventId: ledgerEvent.eventId
          }] : []),
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
        response: {
          ...businessResponse,
          approvalExecutionId: execution.approvalExecutionId,
          approvalExecutionHash: execution.executionHash
        }
      };
    }
  });
}

export function createSandboxServicingHandlers() {
  return Object.freeze([
    advanceSandboxServicingCommandHandler(),
    sandboxServicingResolutionCommandHandler("pilotRestructureSandboxObligation"),
    sandboxServicingResolutionCommandHandler("pilotRepurchaseSandboxObligation"),
    sandboxServicingResolutionCommandHandler("pilotWriteOffSandboxObligation")
  ]);
}
