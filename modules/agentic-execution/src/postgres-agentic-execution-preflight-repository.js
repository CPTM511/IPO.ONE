import {
  CreditEventType,
  DomainError,
  FinalityStatus,
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  ExecutionDecision,
  verifyPreparedExecution,
  verifySimulationReport,
  verifyTransactionPreflightReceipt
} from "./agentic-execution-preflight.js";

const AGGREGATE_TYPE = "wallet_execution";
const OUTBOX_TOPIC = "ipo.one.wallet-execution-preflight.v1";

function fail(code, message) {
  throw new DomainError(code, message);
}

function requiredString(name, value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) {
    fail("invalid_agentic_execution_preflight_repository_input", `${name} is required`);
  }
  return value;
}

function trustedNow(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_agentic_execution_preflight_repository_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function json(value) {
  return JSON.stringify(value);
}

function commandContext({ operation, idempotencyKey, correlationId, actorId, now, payload }) {
  return {
    idempotencyKey: requiredString("idempotencyKey", idempotencyKey),
    correlationId: requiredString("correlationId", correlationId),
    actorId: requiredString("actorId", actorId),
    now: trustedNow(now),
    commandHash: hashId(`wallet_execution_${operation}_command`, payload)
  };
}

function eventFor({ eventType, preparedExecution, payload, context }) {
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
      correlationId: context.correlationId,
      actorId: context.actorId,
      transactionsAllowed: false,
      productionAuthority: false,
      fundsAuthority: false
    },
    now: context.now
  });
}

export class PostgresAgenticExecutionPreflightRepository {
  #eventRepository;

  constructor({ eventRepository, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 || !eventRepository ||
      typeof eventRepository.appendCommand !== "function" ||
      typeof eventRepository.withTenantRead !== "function"
    ) {
      fail(
        "invalid_agentic_execution_preflight_repository",
        "a Tenant-scoped PostgreSQL Event Repository is required"
      );
    }
    this.#eventRepository = eventRepository;
  }

  async recordPrepared({
    preparedExecution,
    idempotencyKey,
    correlationId,
    actorId,
    now = new Date()
  }) {
    verifyPreparedExecution(preparedExecution, { now });
    const context = commandContext({
      operation: "prepare",
      idempotencyKey,
      correlationId,
      actorId,
      now,
      payload: {
        executionId: preparedExecution.executionId,
        preparedExecutionHash: preparedExecution.preparedExecutionHash,
        reservationHash: preparedExecution.reservationHash
      }
    });
    const event = eventFor({
      eventType: CreditEventType.WALLET_EXECUTION_PREPARED,
      preparedExecution,
      payload: {
        transferIntentId: preparedExecution.transferIntentId,
        authorizationHash: preparedExecution.authorizationHash,
        targetPolicyHash: preparedExecution.targetPolicyHash,
        reservationHash: preparedExecution.reservationHash,
        expectedEffectsHash: preparedExecution.expectedEffects.effectsHash,
        expiresAt: preparedExecution.expiresAt
      },
      context
    });
    return this.#eventRepository.appendCommand({
      aggregateType: AGGREGATE_TYPE,
      aggregateId: preparedExecution.executionId,
      expectedVersion: 0,
      idempotencyKey: context.idempotencyKey,
      commandHash: context.commandHash,
      event,
      outboxTopic: OUTBOX_TOPIC,
      response: preparedExecution,
      applyProjection: async ({ client, committed: [recorded] }) => {
        await client.query(
          `INSERT INTO wallet_prepared_executions (
             id, prepared_execution_hash, transfer_intent_id, grant_id, target_policy_id,
             reservation_id, authorization_hash, exact_payload_hash, chain_id,
             target_address, function_selector, event_id, prepared_execution,
             valid_from, expires_at, transactions_allowed, sandbox_only,
             production_authority, funds_authority, schema_version, created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::JSONB,
             $14, $15, $16, $17, $18, $19, $20, $21
           )`,
          [
            preparedExecution.executionId,
            preparedExecution.preparedExecutionHash,
            preparedExecution.transferIntentId,
            preparedExecution.grantId,
            preparedExecution.targetPolicyId,
            preparedExecution.reservationId,
            preparedExecution.authorizationHash,
            preparedExecution.payload.exactPayloadHash,
            preparedExecution.payload.chainId,
            preparedExecution.payload.targetAddress,
            preparedExecution.payload.functionSelector,
            recorded.event.eventId,
            json(preparedExecution),
            preparedExecution.validFrom,
            preparedExecution.expiresAt,
            preparedExecution.transactionsAllowed,
            preparedExecution.sandboxOnly,
            preparedExecution.productionAuthority,
            preparedExecution.fundsAuthority,
            preparedExecution.schemaVersion,
            preparedExecution.createdAt
          ]
        );
      }
    });
  }

  async recordPreflight({
    preparedExecution,
    simulationReport,
    preflightReceipt,
    idempotencyKey,
    correlationId,
    actorId,
    now = new Date()
  }) {
    verifyPreparedExecution(preparedExecution, { now });
    verifySimulationReport(simulationReport, { now });
    verifyTransactionPreflightReceipt(preflightReceipt, { now });
    if (
      simulationReport.executionId !== preparedExecution.executionId ||
      preflightReceipt.executionId !== preparedExecution.executionId ||
      preflightReceipt.simulationSnapshot.simulationReportId !== simulationReport.simulationReportId ||
      preflightReceipt.simulationSnapshot.simulationHash !== simulationReport.simulationHash
    ) {
      fail("agentic_execution_preflight_binding_invalid", "simulation and preflight do not bind the prepared execution");
    }
    const context = commandContext({
      operation: "preflight",
      idempotencyKey,
      correlationId,
      actorId,
      now,
      payload: {
        executionId: preparedExecution.executionId,
        simulationHash: simulationReport.simulationHash,
        preflightHash: preflightReceipt.preflightHash
      }
    });
    const event = eventFor({
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
      context
    });
    const response = { preparedExecution, simulationReport, preflightReceipt };
    return this.#eventRepository.appendCommand({
      aggregateType: AGGREGATE_TYPE,
      aggregateId: preparedExecution.executionId,
      expectedVersion: 1,
      idempotencyKey: context.idempotencyKey,
      commandHash: context.commandHash,
      event,
      outboxTopic: OUTBOX_TOPIC,
      response,
      applyProjection: async ({ client, committed: [recorded] }) => {
        const prepared = await client.query(
          `SELECT prepared_execution_hash, grant_id, exact_payload_hash,
                  expires_at, reservation_id
             FROM wallet_prepared_executions
            WHERE id = $1
            FOR SHARE`,
          [preparedExecution.executionId]
        );
        const row = prepared.rows[0];
        if (
          prepared.rowCount !== 1 ||
          row.prepared_execution_hash !== preparedExecution.preparedExecutionHash ||
          row.grant_id !== preparedExecution.grantId ||
          row.exact_payload_hash !== preparedExecution.payload.exactPayloadHash ||
          new Date(row.expires_at) <= context.now
        ) {
          fail("agentic_execution_context_stale", "prepared execution changed or expired before preflight commit");
        }
        const current = await client.query(
          `SELECT g.status AS grant_status, g.grant_hash, g.session_epoch,
                  r.status AS reservation_status, r.reservation_hash, r.expires_at AS reservation_expires_at
             FROM delegated_wallet_grants g
             JOIN delegated_wallet_pending_exposures r
               ON r.tenant_id = g.tenant_id AND r.grant_id = g.id
            WHERE g.id = $1 AND r.id = $2
            FOR SHARE OF g, r`,
          [preparedExecution.grantId, row.reservation_id]
        );
        const authority = current.rows[0];
        const decisionMayContinue = [
          ExecutionDecision.ALLOW,
          ExecutionDecision.STEP_UP
        ].includes(preflightReceipt.decision);
        if (
          current.rowCount !== 1 ||
          authority.grant_hash !== preparedExecution.grantHash ||
          authority.reservation_hash !== preparedExecution.reservationHash
        ) {
          fail("agentic_execution_context_stale", "grant or pending-exposure identity changed before preflight commit");
        }
        if (
          decisionMayContinue && (
            authority.grant_status !== "active" ||
            Number(authority.session_epoch) !== preparedExecution.sessionEpoch ||
            authority.reservation_status !== "reserved" ||
            new Date(authority.reservation_expires_at) <= context.now
          )
        ) {
          fail(
            "agentic_execution_context_stale",
            "ALLOW or STEP_UP cannot commit against stale grant or pending exposure"
          );
        }
        await client.query(
          `INSERT INTO wallet_simulation_reports (
             id, simulation_hash, execution_id, exact_payload_hash, status,
             chain_id, block_number, block_hash, observed_code_hash,
             observed_proxy_implementation_hash, simulated_effects_hash, report,
             simulated_at, expires_at, external_call_performed, sandbox_only,
             production_authority, funds_authority, schema_version
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::JSONB,
             $13, $14, $15, $16, $17, $18, $19
           )`,
          [
            simulationReport.simulationReportId, simulationReport.simulationHash,
            simulationReport.executionId, simulationReport.exactPayloadHash,
            simulationReport.status, simulationReport.chainId,
            simulationReport.blockNumber, simulationReport.blockHash,
            simulationReport.observedCodeHash,
            simulationReport.observedProxyImplementationHash,
            simulationReport.simulatedEffects.effectsHash, json(simulationReport),
            simulationReport.simulatedAt, simulationReport.expiresAt,
            simulationReport.externalCallPerformed, simulationReport.sandboxOnly,
            simulationReport.productionAuthority, simulationReport.fundsAuthority,
            simulationReport.schemaVersion
          ]
        );
        await client.query(
          `INSERT INTO wallet_transaction_preflight_receipts (
             id, preflight_hash, execution_id, simulation_report_id, grant_id,
             reservation_hash, exact_payload_hash, decision, reason_codes,
             event_id, receipt, created_at, expires_at, transactions_allowed,
             sandbox_only, production_authority, funds_authority, schema_version
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, $10, $11::JSONB,
             $12, $13, $14, $15, $16, $17, $18
           )`,
          [
            preflightReceipt.preflightReceiptId, preflightReceipt.preflightHash,
            preflightReceipt.executionId,
            preflightReceipt.simulationSnapshot.simulationReportId,
            preflightReceipt.grantId, preflightReceipt.reservationHash,
            preflightReceipt.exactPayloadHash, preflightReceipt.decision,
            json(preflightReceipt.reasonCodes), recorded.event.eventId,
            json(preflightReceipt), preflightReceipt.createdAt,
            preflightReceipt.expiresAt, preflightReceipt.transactionsAllowed,
            preflightReceipt.sandboxOnly, preflightReceipt.productionAuthority,
            preflightReceipt.fundsAuthority, preflightReceipt.schemaVersion
          ]
        );
      }
    });
  }

  async findById(executionId) {
    requiredString("executionId", executionId);
    return this.#eventRepository.withTenantRead(async (client) => {
      const prepared = await client.query(
        "SELECT prepared_execution FROM wallet_prepared_executions WHERE id = $1",
        [executionId]
      );
      if (prepared.rowCount === 0) return undefined;
      const reports = await client.query(
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
        preflights: reports.rows.map(({ report, receipt }) => ({
          simulationReport: report,
          preflightReceipt: receipt ?? null
        }))
      };
    });
  }
}
