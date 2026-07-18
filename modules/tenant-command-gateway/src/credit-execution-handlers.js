import {
  CreditAuthorityType,
  CreditEventType,
  CreditLineStatus,
  DomainError,
  LedgerAccountStatus,
  LedgerAccountType,
  ObligationExecutionStatus,
  ObligationStatus,
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  assertAuthorityAuthorizesSandboxExecution,
  assertAuthorityAuthorizesSandboxRepayment,
  createCreditEvent,
  createSandboxLedgerAccounts,
  executeSandboxObligation,
  hashId,
  postSandboxRepayment
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import { SignedSandboxRailAdapter } from "../../sandbox-rail/src/index.js";
import {
  summarizeServicingAction,
  summarizeSharedObligation
} from "./credit-acceptance-handlers.js";

const LOCAL_SIGNED_SANDBOX_RAIL = new SignedSandboxRailAdapter();
const REPAYMENT_SOURCES = new Set(["synthetic_wallet", "synthetic_bank", "synthetic_revenue"]);

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function normalizeEmptyPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 0) {
    throw new DomainError("invalid_tenant_command_payload", "sandbox execution payload must be empty");
  }
}

function normalizeRepaymentPayload(payload) {
  if (
    !payload || typeof payload !== "object" || Array.isArray(payload) ||
    Object.keys(payload).length !== 2 ||
    !Object.hasOwn(payload, "amountMinor") || !Object.hasOwn(payload, "sourceCode") ||
    typeof payload.amountMinor !== "string" || !/^[1-9][0-9]{0,77}$/.test(payload.amountMinor) ||
    !REPAYMENT_SOURCES.has(payload.sourceCode)
  ) {
    throw new DomainError("repayment_amount_invalid", "sandbox repayment payload is invalid");
  }
  return structuredClone(payload);
}

async function loadObligationContext({
  client,
  coreRepository,
  authorizationDecision,
  authenticationContext,
  now,
  operation
}) {
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
    obligation.productionFundsMoved !== false
  ) unavailable();
  const expectedType = authenticationContext.actorType === ActorType.HUMAN
    ? SubjectType.HUMAN
    : SubjectType.AGENT;
  const subjectState = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.SUBJECT,
    obligation.subjectId,
    { lock: true }
  );
  const principalState = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.PRINCIPAL,
    obligation.principalId,
    { lock: true }
  );
  const subject = subjectState?.value;
  const principal = principalState?.value;
  const allowedSubjectStatuses = expectedType === SubjectType.HUMAN
    ? [SubjectStatus.PENDING, SubjectStatus.ACTIVE]
    : [SubjectStatus.ACTIVE];
  if (
    !subject || subject.subjectType !== expectedType ||
    subject.primaryPrincipalId !== obligation.principalId ||
    !allowedSubjectStatuses.includes(subject.status) ||
    !principal || principal.status !== PrincipalStatus.ACTIVE
  ) {
    throw new DomainError("credit_state_frozen", "Subject or Principal state blocks the sandbox operation");
  }
  const expectedAuthorityType = authenticationContext.actorType === ActorType.HUMAN
    ? CreditAuthorityType.CONSENT
    : CreditAuthorityType.MANDATE;
  if (obligation.authorityType !== expectedAuthorityType) unavailable();
  const authorityState = await coreRepository.getProjectionStateInTransaction(
    client,
    expectedAuthorityType === CreditAuthorityType.CONSENT
      ? CoreProjectionType.CONSENT_RECORD
      : CoreProjectionType.MANDATE,
    obligation.authorityRef,
    { lock: true }
  );
  if (!authorityState) {
    throw new DomainError("authority_not_current", "sandbox operation authority is unavailable");
  }
  if (operation === "execute") {
    assertAuthorityAuthorizesSandboxExecution(authorityState.value, obligation, { now });
  } else {
    assertAuthorityAuthorizesSandboxRepayment(authorityState.value, obligation, { now });
  }
  const risk = await coreRepository.getCreditApplicationRiskStateInTransaction(
    client,
    obligation.subjectId,
    obligation.assetId
  );
  if (risk.frozenCreditLineCount > 0) {
    throw new DomainError("credit_state_frozen", "credit state is frozen");
  }
  return { state, obligation, authority: authorityState.value };
}

function ledgerPostedEvent({ transaction, obligation, requestId, correlationId, actorId, now }) {
  return createCreditEvent({
    eventType: CreditEventType.LEDGER_TRANSACTION_POSTED,
    subjectId: obligation.subjectId,
    obligationId: obligation.obligationId,
    payload: {
      ledgerTransactionId: transaction.ledgerTransactionId,
      transactionHash: transaction.transactionHash,
      transactionType: transaction.transactionType,
      assetId: obligation.assetId,
      debitTotalMinor: transaction.debitTotalMinor,
      creditTotalMinor: transaction.creditTotalMinor,
      entryCount: transaction.entryCount,
      actorId,
      causationId: requestId,
      correlationId,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    now
  });
}

function summarizeExecutionReceipt(receipt) {
  return {
    sandboxExecutionReceiptId: receipt.sandboxExecutionReceiptId,
    receiptHash: receipt.receiptHash,
    obligationId: receipt.obligationId,
    assetId: receipt.assetId,
    amountMinor: receipt.amountMinor,
    adapterId: receipt.adapterId,
    adapterVersion: receipt.adapterVersion,
    adapterKeyId: receipt.adapterKeyId,
    adapterMessageHash: receipt.adapterMessageHash,
    executedAt: receipt.executedAt,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: receipt.schemaVersion
  };
}

async function planAgentCreditLineUtilization({
  client,
  coreRepository,
  obligation,
  authority,
  principalDeltaMinor,
  now
}) {
  const current = await coreRepository.findCreditLineBySubjectAssetInTransaction(
    client,
    obligation.subjectId,
    obligation.assetId
  );
  if (current && current.status !== CreditLineStatus.APPROVED) {
    throw new DomainError("credit_state_frozen", "Agent CreditLine is not approved");
  }
  const previousUtilized = BigInt(current?.utilizedMinor ?? "0");
  const nextUtilized = previousUtilized + BigInt(principalDeltaMinor);
  const authorityLimit = BigInt(authority.aggregateLimitMinor);
  const limit = current ? BigInt(current.limitMinor) : authorityLimit;
  if (nextUtilized < 0n || nextUtilized > limit || nextUtilized > authorityLimit) {
    throw new DomainError("sandbox_capacity_exhausted", "Agent CreditLine utilization is unavailable");
  }
  const creditLineId = current?.creditLineId ?? `credit_line_${hashId("shared_sandbox_credit_line", {
    subjectId: obligation.subjectId,
    assetId: obligation.assetId
  }).slice(2)}`;
  return Object.freeze({
    value: {
      creditLineId,
      subjectId: obligation.subjectId,
      mandateId: authority.mandateId,
      assetId: obligation.assetId,
      limitMinor: limit.toString(),
      utilizedMinor: nextUtilized.toString(),
      status: CreditLineStatus.APPROVED,
      riskSnapshotId: obligation.riskDecisionId,
      createdAt: current?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
      schemaVersion: "credit_line.v1"
    },
    previousUtilizedMinor: previousUtilized.toString(),
    utilizedMinor: nextUtilized.toString()
  });
}

export function executeSandboxObligationCommandHandler({
  sandboxRailAdapter = LOCAL_SIGNED_SANDBOX_RAIL
} = {}) {
  if (
    !sandboxRailAdapter || typeof sandboxRailAdapter.execute !== "function" ||
    typeof sandboxRailAdapter.verify !== "function"
  ) {
    throw new DomainError("sandbox_rail_unavailable", "signed sandbox rail adapter is unavailable");
  }
  return Object.freeze({
    operationId: "pilotExecuteSandboxObligation",
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
      normalizeEmptyPayload(payload);
      const { state, obligation, authority } = await loadObligationContext({
        client,
        coreRepository,
        authorizationDecision,
        authenticationContext,
        now,
        operation: "execute"
      });
      if (
        obligation.status !== ObligationStatus.CREATED ||
        obligation.executionStatus !== ObligationExecutionStatus.PENDING
      ) {
        throw new DomainError("obligation_not_executable", "Obligation is not pending execution");
      }
      if (await coreRepository.findSandboxExecutionReceiptByObligationInTransaction(
        client,
        obligation.obligationId
      )) {
        throw new DomainError("execution_already_exists", "sandbox execution already exists");
      }
      const adapterRequest = {
        obligationId: obligation.obligationId,
        assetId: obligation.assetId,
        amountMinor: obligation.originalPrincipalMinor,
        requestId,
        correlationId,
        issuedAt: now.toISOString()
      };
      const adapterReceipt = await sandboxRailAdapter.execute(adapterRequest);
      sandboxRailAdapter.verify(adapterReceipt, adapterRequest);
      const execution = executeSandboxObligation(obligation, { adapterReceipt, now });
      const creditLine = authenticationContext.actorType === ActorType.AGENT
        ? await planAgentCreditLineUtilization({
            client,
            coreRepository,
            obligation,
            authority,
            principalDeltaMinor: obligation.originalPrincipalMinor,
            now
          })
        : undefined;
      const accountEvent = createCreditEvent({
        eventType: CreditEventType.LEDGER_ACCOUNT_OPENED,
        subjectId: obligation.subjectId,
        obligationId: obligation.obligationId,
        payload: {
          obligationId: obligation.obligationId,
          accountIds: Object.values(execution.accounts).map(({ ledgerAccountId }) => ledgerAccountId),
          accountTypes: Object.keys(execution.accounts),
          assetId: obligation.assetId,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId,
          sandboxOnly: true
        },
        now
      });
      const ledgerEvent = ledgerPostedEvent({
        transaction: execution.ledgerTransaction,
        obligation,
        requestId,
        correlationId,
        actorId: authenticationContext.actorId,
        now
      });
      const executionEvent = createCreditEvent({
        eventType: CreditEventType.OBLIGATION_SANDBOX_EXECUTED,
        subjectId: obligation.subjectId,
        obligationId: obligation.obligationId,
        payload: {
          obligationId: obligation.obligationId,
          sandboxExecutionReceiptId: execution.receipt.sandboxExecutionReceiptId,
          receiptHash: execution.receipt.receiptHash,
          principalLedgerTransactionId: execution.ledgerTransaction.ledgerTransactionId,
          previousStatus: obligation.status,
          nextStatus: execution.obligation.status,
          previousExecutionStatus: obligation.executionStatus,
          nextExecutionStatus: execution.obligation.executionStatus,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId,
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false
        },
        now
      });
      const creditLineEvent = creditLine
        ? createCreditEvent({
            eventType: CreditEventType.CREDIT_LINE_UTILIZED,
            subjectId: obligation.subjectId,
            obligationId: obligation.obligationId,
            payload: {
              creditLineId: creditLine.value.creditLineId,
              obligationId: obligation.obligationId,
              previousUtilizedMinor: creditLine.previousUtilizedMinor,
              utilizedMinor: creditLine.utilizedMinor,
              principalDeltaMinor: obligation.originalPrincipalMinor,
              actorId: authenticationContext.actorId,
              causationId: requestId,
              correlationId,
              sandboxOnly: true
            },
            now
          })
        : undefined;
      const events = [accountEvent, ledgerEvent, creditLineEvent, executionEvent].filter(Boolean);
      return {
        aggregateType: "obligation",
        aggregateId: obligation.obligationId,
        events: events.map((event, index) => ({
          aggregateType: "obligation",
          aggregateId: obligation.obligationId,
          expectedVersion: state.aggregateVersion + index,
          event
        })),
        writes: [
          ...Object.values(execution.accounts).map((value) => ({
            type: CoreProjectionType.LEDGER_ACCOUNT,
            value,
            eventId: accountEvent.eventId
          })),
          {
            type: CoreProjectionType.LEDGER_TRANSACTION,
            value: execution.ledgerTransaction,
            eventId: ledgerEvent.eventId
          },
          {
            type: CoreProjectionType.SANDBOX_EXECUTION_RECEIPT,
            value: execution.receipt,
            eventId: executionEvent.eventId
          },
          {
            type: CoreProjectionType.OBLIGATION,
            value: execution.obligation,
            eventId: executionEvent.eventId
          },
          ...(creditLine ? [{
            type: CoreProjectionType.CREDIT_LINE,
            value: creditLine.value,
            eventId: creditLineEvent.eventId
          }] : [])
        ],
        response: {
          obligation: summarizeSharedObligation(execution.obligation),
          executionReceipt: summarizeExecutionReceipt(execution.receipt),
          principalLedgerTransactionId: execution.ledgerTransaction.ledgerTransactionId,
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false,
          schemaVersion: "tenant_sandbox_obligation_executed.v1"
        }
      };
    }
  });
}

async function assertSandboxAccountsAvailable({ client, coreRepository, obligation }) {
  const accounts = createSandboxLedgerAccounts(obligation, { now: new Date(obligation.executedAt) });
  for (const accountType of Object.values(LedgerAccountType).filter((type) =>
    Object.hasOwn(accounts, type)
  )) {
    const expected = accounts[accountType];
    const state = await coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.LEDGER_ACCOUNT,
      expected.ledgerAccountId,
      { lock: true }
    );
    if (
      !state || state.value.ledgerAccountHash !== expected.ledgerAccountHash ||
      state.value.status !== LedgerAccountStatus.ACTIVE
    ) {
      throw new DomainError("sandbox_rail_unavailable", "sandbox ledger accounts are unavailable");
    }
  }
}

function summarizeRepayment(repayment) {
  return { ...repayment };
}

export function postSandboxRepaymentCommandHandler() {
  return Object.freeze({
    operationId: "pilotPostSandboxRepayment",
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
      const input = normalizeRepaymentPayload(payload);
      const { state, obligation, authority } = await loadObligationContext({
        client,
        coreRepository,
        authorizationDecision,
        authenticationContext,
        now,
        operation: "repay"
      });
      await assertSandboxAccountsAvailable({ client, coreRepository, obligation });
      const result = postSandboxRepayment(obligation, {
        ...input,
        actorId: authenticationContext.actorId,
        now
      });
      const events = [];
      const writes = [];
      const principalReleased = BigInt(result.repayment.appliedPrincipalMinor);
      const creditLine = authenticationContext.actorType === ActorType.AGENT && principalReleased > 0n
        ? await planAgentCreditLineUtilization({
            client,
            coreRepository,
            obligation,
            authority,
            principalDeltaMinor: `-${principalReleased}`,
            now
          })
        : undefined;
      if (result.interestTransaction) {
        const interestEvent = createCreditEvent({
          eventType: CreditEventType.INTEREST_ACCRUED,
          subjectId: obligation.subjectId,
          obligationId: obligation.obligationId,
          payload: {
            obligationId: obligation.obligationId,
            accruedInterestMinor: result.repayment.accruedInterestMinor,
            accrualDays: result.repayment.accrualDays,
            interestLedgerTransactionId: result.interestTransaction.ledgerTransactionId,
            actorId: authenticationContext.actorId,
            causationId: requestId,
            correlationId,
            sandboxOnly: true
          },
          now
        });
        events.push(interestEvent);
        writes.push({
          type: CoreProjectionType.LEDGER_TRANSACTION,
          value: result.interestTransaction,
          eventId: interestEvent.eventId
        });
      }
      const ledgerEvent = ledgerPostedEvent({
        transaction: result.ledgerTransaction,
        obligation,
        requestId,
        correlationId,
        actorId: authenticationContext.actorId,
        now
      });
      const repaymentEvent = createCreditEvent({
        eventType: CreditEventType.REPAYMENT_POSTED,
        subjectId: obligation.subjectId,
        obligationId: obligation.obligationId,
        payload: {
          repaymentId: result.repayment.repaymentId,
          repaymentHash: result.repayment.repaymentHash,
          obligationId: obligation.obligationId,
          requestedMinor: result.repayment.requestedMinor,
          appliedMinor: result.repayment.appliedMinor,
          appliedFeeMinor: result.repayment.appliedFeeMinor,
          appliedInterestMinor: result.repayment.appliedInterestMinor,
          appliedPrincipalMinor: result.repayment.appliedPrincipalMinor,
          surplusMinor: result.repayment.surplusMinor,
          previousStatus: obligation.status,
          nextStatus: result.obligation.status,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId,
          sandboxOnly: true,
          productionFundsMoved: false
        },
        now
      });
      events.push(ledgerEvent, repaymentEvent);
      writes.push(
        {
          type: CoreProjectionType.LEDGER_TRANSACTION,
          value: result.ledgerTransaction,
          eventId: ledgerEvent.eventId
        },
        {
          type: CoreProjectionType.REPAYMENT,
          value: result.repayment,
          eventId: repaymentEvent.eventId
        },
        {
          type: CoreProjectionType.OBLIGATION,
          value: result.obligation,
          eventId: repaymentEvent.eventId
        }
      );
      if (result.servicingAction) {
        const servicingEvent = createCreditEvent({
          eventType: result.cured
            ? CreditEventType.OBLIGATION_CURED
            : CreditEventType.SERVICING_ADVANCED,
          subjectId: obligation.subjectId,
          obligationId: obligation.obligationId,
          payload: {
            servicingActionId: result.servicingAction.servicingActionId,
            servicingActionHash: result.servicingAction.servicingActionHash,
            previousStatus: result.servicingAction.previousStatus,
            nextStatus: result.servicingAction.nextStatus,
            previousClassification: result.servicingAction.previousClassification,
            nextClassification: result.servicingAction.nextClassification,
            daysPastDue: result.servicingAction.daysPastDue,
            reasonCode: result.servicingAction.reasonCode,
            actorId: authenticationContext.actorId,
            causationId: requestId,
            correlationId,
            sandboxOnly: true,
            productionFundsMoved: false
          },
          now
        });
        events.push(servicingEvent);
        writes.push({
          type: CoreProjectionType.SANDBOX_SERVICING_ACTION,
          value: result.servicingAction,
          eventId: servicingEvent.eventId
        });
      }
      if (creditLine) {
        const creditLineEvent = createCreditEvent({
          eventType: CreditEventType.CREDIT_LINE_RELEASED,
          subjectId: obligation.subjectId,
          obligationId: obligation.obligationId,
          payload: {
            creditLineId: creditLine.value.creditLineId,
            obligationId: obligation.obligationId,
            previousUtilizedMinor: creditLine.previousUtilizedMinor,
            utilizedMinor: creditLine.utilizedMinor,
            principalDeltaMinor: result.repayment.appliedPrincipalMinor,
            actorId: authenticationContext.actorId,
            causationId: requestId,
            correlationId,
            sandboxOnly: true
          },
          now
        });
        events.splice(events.length - 1, 0, creditLineEvent);
        writes.push({
          type: CoreProjectionType.CREDIT_LINE,
          value: creditLine.value,
          eventId: creditLineEvent.eventId
        });
      }
      return {
        aggregateType: "obligation",
        aggregateId: obligation.obligationId,
        events: events.map((event, index) => ({
          aggregateType: "obligation",
          aggregateId: obligation.obligationId,
          expectedVersion: state.aggregateVersion + index,
          event
        })),
        writes,
        response: {
          obligation: summarizeSharedObligation(result.obligation),
          repayment: summarizeRepayment(result.repayment),
          ...(result.servicingAction ? {
            servicingAction: summarizeServicingAction(result.servicingAction)
          } : {}),
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false,
          schemaVersion: "tenant_sandbox_repayment_posted.v1"
        }
      };
    }
  });
}

export function createCreditExecutionHandlers(options) {
  return Object.freeze([
    executeSandboxObligationCommandHandler(options),
    postSandboxRepaymentCommandHandler()
  ]);
}
