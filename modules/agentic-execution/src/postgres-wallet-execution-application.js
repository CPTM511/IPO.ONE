import {
  CreditEventType,
  DomainError,
  FinalityStatus,
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  activateDelegatedWalletGrant,
  createAgenticExecutionEvent,
  createPendingExposureReservation,
  prepareDelegatedWalletGrant,
  releasePendingExposureReservation,
  revokeDelegatedWalletGrant,
  verifyDelegatedWalletGrant
} from "./agentic-execution-grant.js";
import {
  SimulationStatus,
  assertWalletSubmissionDisabled,
  constructPreparedExecution,
  createSimulationReport,
  evaluateTransactionPreflight
} from "./agentic-execution-preflight.js";
import {
  createLocalTransferIntentTargetPolicy,
  describeTransferIntentExecutionResolver,
  resolveTransferIntentExecution
} from "./transfer-intent-execution-resolver.js";

function fail(code, message) {
  throw new DomainError(code, message);
}

function record(recordType, value) {
  const recordId = {
    target_policy: value.targetPolicyId,
    grant: value.grantId,
    grant_transition: value.transitionId,
    pending_exposure: value.reservationId,
    prepared_execution: value.executionId,
    simulation_report: value.simulationReportId,
    preflight_receipt: value.preflightReceiptId
  }[recordType];
  if (!recordId) fail("invalid_wallet_execution_plan", "agentic execution record identity is unavailable");
  return { type: CoreProjectionType.AGENTIC_EXECUTION_RECORD, value: { recordId, recordType, record: value } };
}

function transitionRecord({ grant, transition, eventId }) {
  const core = {
    grantId: grant.grantId,
    grantHash: grant.grantHash,
    eventId,
    previousStatus: transition.previousStatus,
    nextStatus: transition.nextStatus,
    reasonCode: transition.reasonCode,
    authorizationDecisionId: transition.authorizationDecisionId,
    authorizationHash: transition.authorizationHash,
    occurredAt: transition.occurredAt,
    schemaVersion: "delegated_wallet_grant_transition.v1"
  };
  const transitionHash = hashId("delegated_wallet_grant_transition", core);
  return {
    transitionId: `delegated_wallet_grant_transition_${transitionHash.slice(2)}`,
    transitionHash,
    ...core
  };
}

async function subjectBindings(directory, subjectId, now) {
  const bindings = await directory.listActiveResourceBindings({
    resourceType: "subject",
    resourceId: subjectId,
    now
  });
  const result = bindings
    .filter(({ relationship }) => new Set(["owner", "controller", "subject"]).has(relationship))
    .map(({ actorId, actorType, relationship, controllerActorId }) => ({
      actorId,
      actorType,
      relationship,
      ...(controllerActorId ? { controllerActorId } : {})
    }));
  if (result.length < 1) fail("tenant_resource_unavailable", "Subject authority is unavailable");
  return result;
}

async function exactGrantInputs({ client, coreRepository, subjectId, providerId, accountBindingId, chainId, now }) {
  const matched = await client.query(
    `SELECT m.id AS mandate_id, sp.id AS spend_policy_id,
            c.id AS credit_line_id, o.id AS obligation_id
       FROM mandates m
       JOIN spend_policies sp
         ON sp.tenant_id = m.tenant_id AND sp.subject_id = m.subject_id
        AND sp.provider_id = $2 AND sp.status = 'active'
       JOIN credit_lines c
         ON c.tenant_id = m.tenant_id AND c.subject_id = m.subject_id
        AND c.asset_id = sp.asset_id AND c.status = 'approved'
       JOIN obligations o
         ON o.tenant_id = c.tenant_id AND o.id = c.obligation_id
      WHERE m.subject_id = $1
        AND m.status = 'active'
        AND m.schema_version = 'mandate.v3'
        AND m.valid_from <= $3 AND m.expires_at > $3
        AND m.allowed_provider_ids ? $2
        AND c.allowed_provider_ids ? $2
        AND o.execution_status = 'executed'
        AND o.status IN ('active', 'partially_repaid')
      ORDER BY m.created_at DESC, sp.created_at DESC, c.created_at DESC, o.created_at DESC
      LIMIT 2
      FOR SHARE OF m, sp, c, o`,
    [subjectId, providerId, now]
  );
  if (matched.rowCount !== 1) {
    fail(
      matched.rowCount === 0 ? "wallet_execution_capacity_unavailable" : "wallet_execution_capacity_ambiguous",
      "one exact current Mandate, SpendPolicy, CreditLine and Obligation is required"
    );
  }
  const ids = matched.rows[0];
  const [mandate, spendPolicy, creditLine, obligation, accountBinding] = await Promise.all([
    coreRepository.getProjectionInTransaction(client, CoreProjectionType.MANDATE, ids.mandate_id, { lock: false }),
    coreRepository.getProjectionInTransaction(client, CoreProjectionType.SPEND_POLICY, ids.spend_policy_id, { lock: false }),
    coreRepository.getProjectionInTransaction(client, CoreProjectionType.CREDIT_LINE, ids.credit_line_id, { lock: false }),
    coreRepository.getProjectionInTransaction(client, CoreProjectionType.OBLIGATION, ids.obligation_id, { lock: false }),
    coreRepository.getProjectionInTransaction(client, CoreProjectionType.ACCOUNT_BINDING, accountBindingId, { lock: false })
  ]);
  if (
    !mandate || !spendPolicy || !creditLine || !obligation || !accountBinding ||
    accountBinding.subjectId !== subjectId || accountBinding.chainId !== chainId
  ) fail("wallet_execution_capacity_unavailable", "canonical execution authority is incomplete");
  return { mandate, spendPolicy, creditLine, obligation, accountBinding };
}

async function loadGrant(client, grantId, { lock = false } = {}) {
  const [grantResult, policiesResult] = await Promise.all([
    client.query(
      `SELECT grant_record FROM delegated_wallet_grants WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
      [grantId]
    ),
    client.query(
      `SELECT p.policy
         FROM delegated_wallet_grant_target_policies gp
         JOIN execution_target_policies p
           ON p.tenant_id = gp.tenant_id AND p.id = gp.target_policy_id
        WHERE gp.grant_id = $1
        ORDER BY p.id
        ${lock ? "FOR SHARE OF p" : ""}`,
      [grantId]
    )
  ]);
  if (grantResult.rowCount !== 1 || policiesResult.rowCount < 1) {
    fail("tenant_resource_unavailable", "DelegatedWalletGrant is unavailable");
  }
  return {
    grant: grantResult.rows[0].grant_record,
    targetPolicies: policiesResult.rows.map(({ policy }) => policy)
  };
}

async function loadExecution(client, executionId, { lock = false } = {}) {
  const prepared = await client.query(
    `SELECT prepared_execution FROM wallet_prepared_executions WHERE id = $1 ${lock ? "FOR SHARE" : ""}`,
    [executionId]
  );
  if (prepared.rowCount !== 1) fail("tenant_resource_unavailable", "wallet execution is unavailable");
  const preflights = await client.query(
    `SELECT s.report, p.receipt
       FROM wallet_simulation_reports s
       LEFT JOIN wallet_transaction_preflight_receipts p
         ON p.tenant_id = s.tenant_id AND p.simulation_report_id = s.id
      WHERE s.execution_id = $1
      ORDER BY s.simulated_at, s.id`,
    [executionId]
  );
  return {
    preparedExecution: prepared.rows[0].prepared_execution,
    preflights: preflights.rows.map(({ report, receipt }) => ({
      simulationReport: report,
      preflightReceipt: receipt ?? null
    }))
  };
}

function grantEvent({ eventType, grant, payload, correlationId, actorId, now }) {
  return createAgenticExecutionEvent({
    eventType,
    grant,
    payload,
    correlationId,
    actorId,
    now
  });
}

function nextExposureGrant(grant, reservation) {
  const next = {
    ...structuredClone(grant),
    pendingExposureMinor: (BigInt(grant.pendingExposureMinor) + BigInt(reservation.amountMinor)).toString(),
    version: grant.version + 1,
    updatedAt: reservation.reservedAt
  };
  verifyDelegatedWalletGrant(next);
  return next;
}

function localSimulation(preparedExecution, targetPolicy, expectedEffects, now) {
  const expiresAt = new Date(Math.min(
    new Date(preparedExecution.expiresAt).getTime(),
    now.getTime() + 2 * 60 * 1000
  )).toISOString();
  return createSimulationReport({
    preparedExecution,
    simulatorId: "ipo_one_local_deterministic",
    simulatorVersion: "1.0.0",
    result: {
      status: SimulationStatus.SUCCEEDED,
      chainId: preparedExecution.payload.chainId,
      blockNumber: "0",
      blockHash: hashId("local_simulation_block", {
        chainId: preparedExecution.payload.chainId,
        exactPayloadHash: preparedExecution.payload.exactPayloadHash
      }),
      observedCodeHash: targetPolicy.codeHash,
      observedProxyImplementationHash: targetPolicy.proxyImplementationHash,
      effects: expectedEffects,
      threatCheckStatus: "passed",
      revertReasonHash: null
    },
    expiresAt,
    now
  });
}

function walletEvent({ eventType, preparedExecution, payload, correlationId, actorId, now }) {
  return createCreditEvent({
    eventType,
    subjectId: preparedExecution.subjectId,
    obligationId: preparedExecution.obligationId,
    finalityStatus: FinalityStatus.FINALIZED,
    payload: {
      ...payload,
      executionId: preparedExecution.executionId,
      preparedExecutionHash: preparedExecution.preparedExecutionHash,
      exactPayloadHash: preparedExecution.payload.exactPayloadHash,
      grantId: preparedExecution.grantId,
      grantHash: preparedExecution.grantHash,
      correlationId,
      actorId,
      transactionsAllowed: false,
      productionAuthority: false,
      fundsAuthority: false
    },
    now
  });
}

export function createPostgresWalletExecutionApplication() {
  return Object.freeze({
    async discoverCapabilities() {
      return {
        adapters: [{
          adapterId: "local_sandbox",
          providerFamily: "ipo_one_local",
          enabled: true,
          externalCallsEnabled: false,
          supportedChains: ["eip155:84532", "eip155:1952"],
          transactionsAllowed: false,
          sandboxOnly: true,
          productionAuthority: false,
          fundsAuthority: false
        }],
        resolver: describeTransferIntentExecutionResolver(),
        authenticationSessionChanged: false,
        schemaVersion: "wallet_capability_descriptor_list.v1"
      };
    },

    async prepareGrant(context) {
      const { client, coreRepository, directory, authenticationContext, authorizationDecision, payload, now, correlationId } = context;
      const inputs = await exactGrantInputs({
        client,
        coreRepository,
        subjectId: authorizationDecision.resourceId,
        providerId: payload.providerId,
        accountBindingId: payload.accountBindingId,
        chainId: payload.chainId,
        now
      });
      const targetPolicy = createLocalTransferIntentTargetPolicy({
        providerId: payload.providerId,
        chainId: payload.chainId,
        now
      });
      const grant = prepareDelegatedWalletGrant({
        authorizationDecision,
        ...inputs,
        targetPolicies: [targetPolicy],
        requestedExpiresAt: payload.requestedExpiresAt,
        sessionEpoch: payload.sessionEpoch,
        nonce: payload.nonce,
        now
      });
      const event = grantEvent({
        eventType: CreditEventType.DELEGATED_WALLET_GRANT_PREPARED,
        grant,
        payload: { intentVersion: grant.version, status: grant.status, adapterId: grant.adapterId },
        correlationId,
        actorId: authenticationContext.actorId,
        now
      });
      const transition = transitionRecord({
        grant,
        eventId: event.eventId,
        transition: {
          previousStatus: null,
          nextStatus: grant.status,
          reasonCode: "canonical_authority_projected",
          authorizationDecisionId: grant.authorizationDecisionId,
          authorizationHash: grant.authorizationHash,
          occurredAt: grant.createdAt
        }
      });
      const bindings = await subjectBindings(directory, grant.subjectId, now);
      return {
        aggregateType: "delegated_wallet_grant",
        aggregateId: grant.grantId,
        events: [{
          aggregateType: "delegated_wallet_grant",
          aggregateId: grant.grantId,
          expectedVersion: 0,
          event
        }],
        writes: [
          { ...record("target_policy", targetPolicy), eventId: event.eventId },
          { ...record("grant", grant), eventId: event.eventId },
          { ...record("grant_transition", transition), eventId: event.eventId }
        ],
        response: {
          grant,
          targetPolicies: [targetPolicy],
          authorityCreatedByWallet: false,
          transactionsAllowed: false,
          schemaVersion: "tenant_wallet_grant_prepared.v1"
        },
        authorizationResource: {
          resourceType: "delegated_wallet_grant",
          resourceId: grant.grantId,
          actorBindings: bindings
        }
      };
    },

    async activateGrant(context) {
      const { client, authenticationContext, authorizationDecision, payload, now, correlationId } = context;
      const current = await loadGrant(client, authorizationDecision.resourceId, { lock: true });
      if (current.grant.grantHash !== payload.expectedGrantHash) {
        fail("agentic_execution_context_stale", "expected grant hash differs from current state");
      }
      const externalPermissionProjection = {
        adapterId: current.grant.adapterId,
        chainIds: current.grant.chainIds,
        assetIds: current.grant.assetIds,
        targetPolicyIds: current.grant.allowedTargetPolicyIds,
        perTxLimitMinor: current.grant.perTxLimitMinor,
        rolling24hLimitMinor: current.grant.rolling24hLimitMinor,
        aggregateLimitMinor: current.grant.aggregateLimitMinor,
        obligationLimitMinor: current.grant.obligationLimitMinor,
        expiresAt: current.grant.expiresAt,
        sessionEpoch: current.grant.sessionEpoch,
        sandboxOnly: true,
        transactionsAllowed: false,
        productionAuthority: false,
        fundsAuthority: false
      };
      const activation = activateDelegatedWalletGrant({
        grant: current.grant,
        authorizationDecision,
        externalPermissionProjection,
        now
      });
      const event = grantEvent({
        eventType: CreditEventType.DELEGATED_WALLET_GRANT_ACTIVATED,
        grant: activation.value,
        payload: {
          intentVersion: activation.value.version,
          status: activation.value.status,
          externalPolicyHash: activation.value.externalPolicyHash
        },
        correlationId,
        actorId: authenticationContext.actorId,
        now
      });
      const transition = transitionRecord({ grant: activation.value, transition: activation.transition, eventId: event.eventId });
      return {
        aggregateType: "delegated_wallet_grant",
        aggregateId: activation.value.grantId,
        events: [{
          aggregateType: "delegated_wallet_grant",
          aggregateId: activation.value.grantId,
          expectedVersion: current.grant.version,
          event
        }],
        writes: [
          { ...record("grant", activation.value), eventId: event.eventId },
          { ...record("grant_transition", transition), eventId: event.eventId }
        ],
        response: {
          grant: activation.value,
          externalPermissionProjection,
          externalCallPerformed: false,
          transactionsAllowed: false,
          schemaVersion: "tenant_wallet_grant_activated.v1"
        }
      };
    },

    async readGrant({ client, resourceId }) {
      return {
        ...(await loadGrant(client, resourceId)),
        schemaVersion: "tenant_wallet_grant_view.v1"
      };
    },

    async revokeGrant(context) {
      const { client, authenticationContext, authorizationDecision, reasonCode, now, correlationId } = context;
      const current = await loadGrant(client, authorizationDecision.resourceId, { lock: true });
      const revocation = revokeDelegatedWalletGrant({
        grant: current.grant,
        authorizationDecision,
        reasonCode,
        now
      });
      const reserved = await client.query(
        `SELECT reservation FROM delegated_wallet_pending_exposures
          WHERE grant_id = $1 AND status = 'reserved'
          ORDER BY reserved_at, id
          FOR UPDATE`,
        [current.grant.grantId]
      );
      const releases = reserved.rows.map(({ reservation }) => releasePendingExposureReservation(
        reservation,
        { reasonCode: "grant_revoked", now }
      ));
      const event = grantEvent({
        eventType: CreditEventType.DELEGATED_WALLET_GRANT_REVOKED,
        grant: revocation.value,
        payload: {
          intentVersion: revocation.value.version,
          status: revocation.value.status,
          reasonCode,
          releasedPendingExposureMinor: revocation.transition.releasedPendingExposureMinor
        },
        correlationId,
        actorId: authenticationContext.actorId,
        now
      });
      const transition = transitionRecord({ grant: revocation.value, transition: revocation.transition, eventId: event.eventId });
      return {
        aggregateType: "delegated_wallet_grant",
        aggregateId: revocation.value.grantId,
        events: [{
          aggregateType: "delegated_wallet_grant",
          aggregateId: revocation.value.grantId,
          expectedVersion: current.grant.version,
          event
        }],
        writes: [
          ...releases.map((release) => ({ ...record("pending_exposure", release), eventId: event.eventId })),
          { ...record("grant", revocation.value), eventId: event.eventId },
          { ...record("grant_transition", transition), eventId: event.eventId }
        ],
        response: {
          grant: revocation.value,
          releasedReservationCount: releases.length,
          transactionsAllowed: false,
          schemaVersion: "tenant_wallet_grant_revoked.v1"
        },
        authorizationResourceTransition: {
          resourceType: authorizationDecision.resourceType,
          resourceId: authorizationDecision.resourceId,
          expectedStatus: "active",
          nextStatus: "closed",
          expectedVersion: authorizationDecision.resourceVersion
        }
      };
    },

    async prepareExecution(context) {
      const { client, directory, authenticationContext, authorizationDecision, payload, now, correlationId } = context;
      const current = await loadGrant(client, authorizationDecision.resourceId, { lock: true });
      verifyDelegatedWalletGrant(current.grant, { now, requireUsable: true });
      if (current.targetPolicies.length !== 1) {
        fail("transfer_intent_execution_context_mismatch", "grant target policy resolution is ambiguous");
      }
      const targetPolicy = current.targetPolicies[0];
      const resolution = await resolveTransferIntentExecution({
        client,
        transferIntentId: payload.transferIntentId,
        grant: current.grant,
        targetPolicy,
        now
      });
      const reservationExpiry = new Date(Math.min(
        new Date(current.grant.expiresAt).getTime(),
        now.getTime() + 5 * 60 * 1000
      )).toISOString();
      const reservation = createPendingExposureReservation({
        grant: current.grant,
        targetPolicy,
        amountMinor: resolution.expectedEffects.assetDeltas.find(
          ({ accountRefHash, deltaMinor }) => accountRefHash === resolution.resolvedAction.accountRefHash && deltaMinor.startsWith("-")
        ).deltaMinor.slice(1),
        sessionEpoch: current.grant.sessionEpoch,
        idempotencyKey: `wallet_execution_${hashId("wallet_execution_request", {
          requestId: context.requestId,
          transferIntentId: payload.transferIntentId
        }).slice(2)}`,
        expiresAt: reservationExpiry,
        now
      });
      const preparedExpiry = new Date(Math.min(
        new Date(reservation.expiresAt).getTime(),
        now.getTime() + 5 * 60 * 1000
      )).toISOString();
      const preparedExecution = constructPreparedExecution({
        grant: current.grant,
        targetPolicy,
        reservation,
        authorizationDecision,
        transferIntentId: payload.transferIntentId,
        resolvedAction: resolution.resolvedAction,
        expectedEffects: resolution.expectedEffects,
        expiresAt: preparedExpiry,
        now
      });
      const simulationReport = localSimulation(
        preparedExecution,
        targetPolicy,
        resolution.expectedEffects,
        now
      );
      const preflightReceipt = evaluateTransactionPreflight({
        preparedExecution,
        currentGrant: current.grant,
        targetPolicy,
        reservation,
        simulationReport,
        currentChainId: targetPolicy.chainId,
        currentSessionEpoch: current.grant.sessionEpoch,
        now
      });
      const nextGrant = nextExposureGrant(current.grant, reservation);
      const exposureEvent = grantEvent({
        eventType: CreditEventType.DELEGATED_WALLET_PENDING_EXPOSURE_RESERVED,
        grant: nextGrant,
        payload: {
          intentVersion: nextGrant.version,
          reservationId: reservation.reservationId,
          reservationHash: reservation.reservationHash,
          amountMinor: reservation.amountMinor,
          pendingExposureMinor: nextGrant.pendingExposureMinor,
          transferIntentId: payload.transferIntentId,
          resolutionHash: resolution.resolutionHash
        },
        correlationId,
        actorId: authenticationContext.actorId,
        now
      });
      const preparedEvent = walletEvent({
        eventType: CreditEventType.WALLET_EXECUTION_PREPARED,
        preparedExecution,
        payload: {
          transferIntentId: preparedExecution.transferIntentId,
          authorizationHash: preparedExecution.authorizationHash,
          targetPolicyHash: preparedExecution.targetPolicyHash,
          reservationHash: preparedExecution.reservationHash,
          expectedEffectsHash: preparedExecution.expectedEffects.effectsHash,
          resolutionHash: resolution.resolutionHash,
          expiresAt: preparedExecution.expiresAt
        },
        correlationId,
        actorId: authenticationContext.actorId,
        now
      });
      const preflightEvent = walletEvent({
        eventType: CreditEventType.WALLET_EXECUTION_PREFLIGHTED,
        preparedExecution,
        payload: {
          simulationHash: simulationReport.simulationHash,
          preflightHash: preflightReceipt.preflightHash,
          decision: preflightReceipt.decision,
          reasonCodes: preflightReceipt.reasonCodes,
          expectedEffectsHash: preflightReceipt.expectedEffectsHash,
          simulatedEffectsHash: preflightReceipt.simulatedEffectsHash,
          expiresAt: preflightReceipt.expiresAt
        },
        correlationId,
        actorId: authenticationContext.actorId,
        now
      });
      const bindings = await subjectBindings(directory, current.grant.subjectId, now);
      return {
        aggregateType: "wallet_execution",
        aggregateId: preparedExecution.executionId,
        events: [
          {
            aggregateType: "delegated_wallet_grant",
            aggregateId: current.grant.grantId,
            expectedVersion: current.grant.version,
            event: exposureEvent
          },
          {
            aggregateType: "wallet_execution",
            aggregateId: preparedExecution.executionId,
            expectedVersion: 0,
            event: preparedEvent
          },
          {
            aggregateType: "wallet_execution",
            aggregateId: preparedExecution.executionId,
            expectedVersion: 1,
            event: preflightEvent
          }
        ],
        writes: [
          { ...record("pending_exposure", reservation), eventId: exposureEvent.eventId },
          { ...record("grant", nextGrant), eventId: exposureEvent.eventId },
          { ...record("prepared_execution", preparedExecution), eventId: preparedEvent.eventId },
          { ...record("simulation_report", simulationReport), eventId: preflightEvent.eventId },
          { ...record("preflight_receipt", preflightReceipt), eventId: preflightEvent.eventId }
        ],
        response: {
          preparedExecution,
          simulationReport,
          preflightReceipt,
          resolution: {
            resolutionHash: resolution.resolutionHash,
            resolverId: resolution.resolverId,
            resolverVersion: resolution.resolverVersion,
            browserAuthoredPayload: false
          },
          atomicGatewayCommit: true,
          transactionsAllowed: false,
          schemaVersion: "tenant_wallet_execution_prepared.v1"
        },
        authorizationResource: {
          resourceType: "wallet_execution",
          resourceId: preparedExecution.executionId,
          actorBindings: bindings
        }
      };
    },

    async approveExecution() {
      fail(
        "wallet_execution_step_up_not_required",
        "the current local exact resolver produced no STEP_UP execution"
      );
    },

    async assertSubmissionDisabled({ client, resourceId, payload, now }) {
      const execution = await loadExecution(client, resourceId, { lock: true });
      const latest = execution.preflights.at(-1);
      if (!latest?.preflightReceipt || latest.preflightReceipt.preflightHash !== payload.preflightHash) {
        fail("execution_submission_binding_invalid", "exact preflight receipt is unavailable");
      }
      const current = await loadGrant(client, execution.preparedExecution.grantId, { lock: true });
      const reservation = await client.query(
        "SELECT reservation FROM delegated_wallet_pending_exposures WHERE id = $1 FOR SHARE",
        [execution.preparedExecution.reservationId]
      );
      return assertWalletSubmissionDisabled({
        preparedExecution: execution.preparedExecution,
        preflightReceipt: latest.preflightReceipt,
        currentGrant: current.grant,
        targetPolicy: current.targetPolicies[0],
        reservation: reservation.rows[0]?.reservation,
        currentChainId: execution.preparedExecution.payload.chainId,
        currentSessionEpoch: current.grant.sessionEpoch,
        now
      });
    },

    async readExecution({ client, resourceId }) {
      return {
        ...(await loadExecution(client, resourceId)),
        schemaVersion: "tenant_wallet_execution_view.v1"
      };
    }
  });
}
