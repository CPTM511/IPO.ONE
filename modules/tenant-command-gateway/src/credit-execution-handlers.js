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
  createAgentLockboxProjection,
  createCreditEvent,
  createSandboxLedgerAccounts,
  deriveAgentCreditLineProjection,
  executeSandboxObligation,
  hashId,
  postSandboxRepayment,
  updateAgentLockboxAfterRepayment
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import { SignedSandboxRailAdapter } from "../../sandbox-rail/src/index.js";
import {
  summarizeServicingAction,
  summarizeSharedObligation
} from "./credit-acceptance-handlers.js";
import {
  normalizeEconomicActionConfirmation,
  sha256Json,
  summarizeEconomicActionConfirmation
} from "./economic-action-confirmation.js";

const LOCAL_SIGNED_SANDBOX_RAIL = new SignedSandboxRailAdapter();
const REPAYMENT_SOURCES = new Set(["synthetic_wallet", "synthetic_bank", "synthetic_revenue"]);

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function normalizeExecutionPayload(payload) {
  const keys = payload && typeof payload === "object" && !Array.isArray(payload)
    ? Object.keys(payload)
    : [];
  const hasProviderId = Object.hasOwn(payload ?? {}, "providerId");
  const hasProviderCategory = Object.hasOwn(payload ?? {}, "providerCategory");
  if (
    !payload || typeof payload !== "object" || Array.isArray(payload) ||
    ![1, 3].includes(keys.length) ||
    keys.some((key) => !["actionConfirmation", "providerId", "providerCategory"].includes(key)) ||
    !Object.hasOwn(payload, "actionConfirmation") ||
    hasProviderId !== hasProviderCategory ||
    (hasProviderId && (
      typeof payload.providerId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/.test(payload.providerId) ||
      typeof payload.providerCategory !== "string" ||
      !/^[a-z][a-z0-9_.-]{1,95}$/.test(payload.providerCategory)
    ))
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "sandbox execution payload must contain one action confirmation"
    );
  }
  return structuredClone(payload);
}

function normalizeRepaymentPayload(payload) {
  if (
    !payload || typeof payload !== "object" || Array.isArray(payload) ||
    Object.keys(payload).length !== 3 ||
    !Object.hasOwn(payload, "amountMinor") || !Object.hasOwn(payload, "sourceCode") ||
    !Object.hasOwn(payload, "actionConfirmation") ||
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
  const [intentState, decisionState, offerState, acceptanceState] = await Promise.all([
    coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.CREDIT_INTENT,
      obligation.creditIntentId,
      { lock: true }
    ),
    coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.RISK_DECISION,
      obligation.riskDecisionId,
      { lock: true }
    ),
    coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.CREDIT_OFFER,
      obligation.creditOfferId,
      { lock: true }
    ),
    coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.CREDIT_OFFER_ACCEPTANCE,
      obligation.creditOfferAcceptanceId,
      { lock: true }
    )
  ]);
  if (!intentState || !decisionState || !offerState || !acceptanceState) {
    throw new DomainError(
      "credit_facility_unavailable",
      "Offer, Policy, Acceptance, or Facility provenance is unavailable"
    );
  }
  return {
    state,
    obligation,
    authority: authorityState.value,
    intent: intentState.value,
    decision: decisionState.value,
    offer: offerState.value,
    acceptance: acceptanceState.value
  };
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
    ...(receipt.providerId
      ? {
          providerId: receipt.providerId,
          providerCategory: receipt.providerCategory,
          purposeCode: receipt.purposeCode
        }
      : {}),
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

function assertAgentProviderTarget({ input, authority, creditLine }) {
  if (
    !input.providerId || !input.providerCategory ||
    !Array.isArray(authority.allowedProviderIds) ||
    !Array.isArray(authority.allowedCategories) ||
    !Array.isArray(creditLine.facility.allowedProviderIds) ||
    !authority.allowedProviderIds.includes(input.providerId) ||
    !authority.allowedCategories.includes(input.providerCategory) ||
    !creditLine.facility.allowedProviderIds.includes(input.providerId)
  ) {
    throw new DomainError(
      "credit_facility_scope_mismatch",
      "Agent execution target is outside the current Mandate and Facility scope"
    );
  }
}

async function planAgentCreditLineUtilization({
  client,
  coreRepository,
  obligation,
  authority,
  intent,
  decision,
  offer,
  acceptance,
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
  const exposure = await coreRepository.getAgentCreditExposureInTransaction(
    client,
    obligation.subjectId,
    obligation.assetId
  );
  return deriveAgentCreditLineProjection({
    intent,
    decision,
    offer,
    acceptance,
    obligation,
    authority,
    currentProjection: current,
    exposure,
    principalDeltaMinor,
    now
  });
}

async function planAgentLockboxCreation({
  client,
  coreRepository,
  obligation,
  authority,
  creditLine,
  accounts,
  now
}) {
  const intentState = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.CREDIT_INTENT,
    obligation.creditIntentId,
    { lock: true }
  );
  const accountBinding = await coreRepository.findActiveAccountBindingForSubjectInTransaction(
    client,
    obligation.subjectId,
    { lock: true }
  );
  if (!intentState?.value || !accountBinding) {
    throw new DomainError(
      "agent_lockbox_unavailable",
      "Agent Lockbox provenance or verified AccountBinding is unavailable"
    );
  }
  if (await coreRepository.findAgentLockboxByObligationInTransaction(
    client,
    obligation.obligationId
  )) {
    throw new DomainError(
      "agent_lockbox_already_exists",
      "Agent Obligation already has a durable Lockbox projection"
    );
  }
  return createAgentLockboxProjection({
    obligation,
    creditIntent: intentState.value,
    mandate: authority,
    accountBinding,
    creditLine,
    accounts,
    now
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
      const input = normalizeExecutionPayload(payload);
      const {
        state,
        obligation,
        authority,
        intent,
        decision,
        offer,
        acceptance
      } = await loadObligationContext({
        client,
        coreRepository,
        authorizationDecision,
        authenticationContext,
        now,
        operation: "execute"
      });
      const providerTarget = authenticationContext.actorType === ActorType.AGENT
        ? { providerId: input.providerId, providerCategory: input.providerCategory }
        : {};
      const actionConfirmation = normalizeEconomicActionConfirmation(
        input.actionConfirmation,
        {
          operationId: "pilotExecuteSandboxObligation",
          resource: {
            resourceType: "obligation",
            resourceId: obligation.obligationId
          },
          resourceHash: obligation.obligationHash,
          payloadHash: sha256Json({
            obligationHash: obligation.obligationHash,
            amountMinor: obligation.originalPrincipalMinor,
            ...providerTarget,
            sandboxRail: "signed_non_redeemable",
            withdrawable: false,
            productionFundsMoved: false
          }),
          requestId,
          authenticationContext,
          now,
          businessPayload: providerTarget
        }
      );
      const actionConfirmationSummary =
        summarizeEconomicActionConfirmation(actionConfirmation);
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
      const creditLine = authenticationContext.actorType === ActorType.AGENT
        ? await planAgentCreditLineUtilization({
            client,
            coreRepository,
            obligation,
            authority,
            intent,
            decision,
            offer,
            acceptance,
            principalDeltaMinor: obligation.originalPrincipalMinor,
            now
          })
        : undefined;
      if (creditLine) assertAgentProviderTarget({ input, authority, creditLine });
      const adapterRequest = {
        obligationId: obligation.obligationId,
        assetId: obligation.assetId,
        amountMinor: obligation.originalPrincipalMinor,
        ...providerTarget,
        ...(creditLine ? { purposeCode: creditLine.facility.purposeCode } : {}),
        requestId,
        correlationId,
        issuedAt: now.toISOString()
      };
      const adapterReceipt = await sandboxRailAdapter.execute(adapterRequest);
      sandboxRailAdapter.verify(adapterReceipt, adapterRequest);
      const execution = executeSandboxObligation(obligation, { adapterReceipt, now });
      const lockbox = creditLine
        ? await planAgentLockboxCreation({
            client,
            coreRepository,
            obligation: execution.obligation,
            authority,
            creditLine: creditLine.value,
            accounts: execution.accounts,
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
          withdrawable: false,
          actionConfirmation: actionConfirmationSummary
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
              facilityProjection: creditLine.facility,
              creditLineProjection: creditLine.value,
              actorId: authenticationContext.actorId,
              causationId: requestId,
              correlationId,
              sandboxOnly: true
            },
            now
          })
        : undefined;
      const lockboxEvent = lockbox
        ? createCreditEvent({
            eventType: CreditEventType.LOCKBOX_CREATED,
            subjectId: obligation.subjectId,
            obligationId: obligation.obligationId,
            payload: {
              lockboxId: lockbox.lockboxId,
              lockboxHash: lockbox.lockboxHash,
              obligationId: obligation.obligationId,
              principalId: lockbox.principalId,
              mandateId: lockbox.mandateId,
              creditOfferId: lockbox.creditOfferId,
              creditLineId: lockbox.creditLineId,
              accountBindingId: lockbox.accountBindingId,
              chainId: lockbox.chainId,
              assetId: lockbox.assetId,
              purposeCode: lockbox.purposeCode,
              allowedProviderIds: lockbox.allowedProviderIds,
              status: lockbox.status,
              actorId: authenticationContext.actorId,
              causationId: requestId,
              correlationId,
              sandboxOnly: true,
              productionFundsMoved: false,
              withdrawable: false,
              custodyAuthority: false,
              unrestrictedTransfersAllowed: false
            },
            now
          })
        : undefined;
      const events = [
        accountEvent,
        ledgerEvent,
        creditLineEvent,
        lockboxEvent,
        executionEvent
      ].filter(Boolean);
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
          }] : []),
          ...(lockbox ? [{
            type: CoreProjectionType.LOCKBOX,
            value: lockbox,
            eventId: lockboxEvent.eventId
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

function createRevenueCaptureReceipt({ lockbox, repayment, now }) {
  const core = {
    lockboxId: lockbox.lockboxId,
    obligationId: repayment.obligationId,
    subjectId: repayment.subjectId,
    assetId: repayment.assetId,
    providerScopeHash: hashId(
      "lockbox_revenue_provider_scope",
      lockbox.allowedProviderIds
    ),
    capturedMinor: repayment.appliedMinor,
    automaticRepaymentId: repayment.repaymentId,
    ledgerTransactionId: repayment.ledgerTransactionId,
    occurredAt: now.toISOString(),
    cashflowRoute: "automatic_repayment_only",
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false
  };
  const revenueCaptureHash = hashId("lockbox_revenue_capture", core);
  return Object.freeze({
    revenueCaptureId: `revenue_capture_${revenueCaptureHash.slice(2)}`,
    revenueCaptureHash,
    ...core,
    schemaVersion: "lockbox_revenue_capture_receipt.v1"
  });
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
      const {
        state,
        obligation,
        authority,
        intent,
        decision,
        offer,
        acceptance
      } = await loadObligationContext({
        client,
        coreRepository,
        authorizationDecision,
        authenticationContext,
        now,
        operation: "repay"
      });
      const businessPayload = {
        amountMinor: input.amountMinor,
        sourceCode: input.sourceCode
      };
      const actionConfirmation = normalizeEconomicActionConfirmation(
        input.actionConfirmation,
        {
          operationId: "pilotPostSandboxRepayment",
          resource: {
            resourceType: "obligation",
            resourceId: obligation.obligationId
          },
          resourceHash: obligation.obligationHash,
          payloadHash: sha256Json({
            obligationHash: obligation.obligationHash,
            amountMinor: input.amountMinor,
            sourceCode: input.sourceCode,
            waterfall: "fee_interest_principal",
            productionFundsMoved: false
          }),
          requestId,
          authenticationContext,
          now,
          businessPayload
        }
      );
      const actionConfirmationSummary =
        summarizeEconomicActionConfirmation(actionConfirmation);
      await assertSandboxAccountsAvailable({ client, coreRepository, obligation });
      const result = postSandboxRepayment(obligation, {
        amountMinor: input.amountMinor,
        sourceCode: input.sourceCode,
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
            intent,
            decision,
            offer,
            acceptance,
            principalDeltaMinor: `-${principalReleased}`,
            now
          })
        : undefined;
      const currentLockbox = authenticationContext.actorType === ActorType.AGENT
        ? await coreRepository.findAgentLockboxByObligationInTransaction(
            client,
            obligation.obligationId
          )
        : undefined;
      if (authenticationContext.actorType === ActorType.AGENT && !currentLockbox) {
        throw new DomainError(
          "agent_lockbox_unavailable",
          "Agent repayment requires the durable Obligation Lockbox projection"
        );
      }
      const lockbox = currentLockbox
        ? updateAgentLockboxAfterRepayment(currentLockbox, result.obligation, { now })
        : undefined;
      const revenueCapture =
        authenticationContext.actorType === ActorType.AGENT &&
        input.sourceCode === "synthetic_revenue"
          ? createRevenueCaptureReceipt({
              lockbox: currentLockbox,
              repayment: result.repayment,
              now
            })
          : undefined;
      if (revenueCapture) {
        const revenueCaptureEvent = createCreditEvent({
          eventType: CreditEventType.REVENUE_CAPTURED,
          subjectId: obligation.subjectId,
          obligationId: obligation.obligationId,
          payload: {
            ...revenueCapture,
            actorId: authenticationContext.actorId,
            causationId: requestId,
            correlationId
          },
          now
        });
        events.push(revenueCaptureEvent);
      }
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
          productionFundsMoved: false,
          actionConfirmation: actionConfirmationSummary
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
            facilityProjection: creditLine.facility,
            creditLineProjection: creditLine.value,
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
      if (lockbox) {
        const lockboxEvent = createCreditEvent({
          eventType: lockbox.status === currentLockbox.status
            ? CreditEventType.LOCKBOX_BALANCE_DEBITED
            : CreditEventType.LOCKBOX_STATUS_CHANGED,
          subjectId: obligation.subjectId,
          obligationId: obligation.obligationId,
          payload: {
            lockboxId: lockbox.lockboxId,
            obligationId: obligation.obligationId,
            previousStatus: currentLockbox.status,
            nextStatus: lockbox.status,
            previousBalanceMinor: obligation.outstandingPrincipalMinor,
            nextBalanceMinor: result.obligation.outstandingPrincipalMinor,
            repaymentId: result.repayment.repaymentId,
            sourceCode: result.repayment.sourceCode,
            actorId: authenticationContext.actorId,
            causationId: requestId,
            correlationId,
            sandboxOnly: true,
            productionFundsMoved: false,
            withdrawable: false
          },
          now
        });
        events.splice(events.length - 1, 0, lockboxEvent);
        writes.push({
          type: CoreProjectionType.LOCKBOX,
          value: lockbox,
          eventId: lockboxEvent.eventId
        });
      }
      return {
        aggregateType: "obligation",
        aggregateId: obligation.obligationId,
        // The Obligation projection is written from repaymentEvent. Keep that
        // event last in the shared aggregate stream so its projection registry
        // version remains equal to the stream head for the next repayment.
        events: [
          ...events.filter((event) => event !== repaymentEvent),
          repaymentEvent
        ].map((event, index) => ({
          aggregateType: "obligation",
          aggregateId: obligation.obligationId,
          expectedVersion: state.aggregateVersion + index,
          event
        })),
        writes,
        response: {
          obligation: summarizeSharedObligation(result.obligation),
          repayment: summarizeRepayment(result.repayment),
          ...(revenueCapture ? { revenueCapture } : {}),
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
