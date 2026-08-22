import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  assertTenantSecurityContext,
  setTenantTransactionContext
} from "../../persistence/src/postgres-tenant-context.js";

function fail(code, message) {
  throw new DomainError(code, message);
}

function clone(value) {
  return structuredClone(value);
}

function validateObservation(observation) {
  if (
    observation?.schemaVersion !== "pool_chain_observation.v1" ||
    typeof observation.observationHash !== "string" ||
    observation.readOnly !== true || observation.syntheticOnly !== true ||
    observation.productionFundsMoved !== false || "topics" in observation || "data" in observation
  ) fail("invalid_pool_observation_record", "only normalized raw-free Pool V1 observations can be persisted");
}

export class PostgresPoolObservationStore {
  constructor({ pool, tenantContext } = {}) {
    if (!pool || typeof pool.connect !== "function") {
      fail("postgres_pool_required", "Pool V1 observation store requires a pg-compatible pool");
    }
    this.pool = pool;
    this.tenantContext = assertTenantSecurityContext(tenantContext);
  }

  async #transaction(operation) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setTenantTransactionContext(client, this.tenantContext);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async commitIngestion(bundle) {
    if (!bundle || !Array.isArray(bundle.observations)) {
      fail("invalid_pool_ingestion_bundle", "Pool V1 ingestion requires an observation bundle");
    }
    bundle.observations.forEach(validateObservation);
    return this.#transaction(async (client) => {
      const binding = bundle.observations[0] ?? bundle.effect?.projection?.state;
      if (!binding) return { replayed: true, observationCount: 0, effectCommitted: false };
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended(current_app_tenant_id() || ':' || $1 || ':' || $2, 0))",
        [binding.contractAddress, binding.marketId]
      );
      const sequenceResult = await client.query(
        `SELECT COALESCE(MAX(ingest_sequence), 0) AS sequence
           FROM pool_chain_observations
          WHERE chain_id = $1 AND contract_address = $2 AND market_id = $3`,
        [binding.chainId, binding.contractAddress, binding.marketId]
      );
      let sequence = Number(sequenceResult.rows[0].sequence);
      let observationCount = 0;
      for (const observation of bundle.observations) {
        const existing = await client.query(
          "SELECT 1 FROM pool_chain_observations WHERE observation_hash = $1",
          [observation.observationHash]
        );
        if (existing.rowCount > 0) continue;
        sequence += 1;
        const inserted = await client.query(
          `INSERT INTO pool_chain_observations (
             id, chain_id, contract_address, market_id, ingest_sequence,
             event_key, event_content_hash, observation_hash, transaction_hash,
             transaction_index, log_index, block_number, block_hash,
             observation_status, normalized_observation, recorded_at, read_only,
             synthetic_only, production_funds_moved, schema_version
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,
             TRUE,TRUE,FALSE,'pool_chain_observation_record.v1'
           ) ON CONFLICT (tenant_id, observation_hash) DO NOTHING RETURNING id`,
          [
            observation.observationId,
            observation.chainId,
            observation.contractAddress,
            observation.marketId,
            sequence,
            observation.eventKey,
            observation.eventContentHash,
            observation.observationHash,
            observation.transactionHash,
            observation.transactionIndex,
            observation.logIndex,
            observation.blockNumber,
            observation.blockHash,
            observation.observationStatus,
            JSON.stringify(observation),
            observation.observedAt
          ]
        );
        observationCount += inserted.rowCount;
      }

      if (bundle.cursor) {
        await client.query(
          `INSERT INTO pool_chain_cursors (
             id, chain_id, contract_address, market_id, cursor_hash,
             block_number, block_hash, event_key, observation_hash, cursor,
             recorded_at, schema_version
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'pool_chain_cursor_record.v1')
           ON CONFLICT (tenant_id, cursor_hash) DO NOTHING`,
          [
            hashId("pool_chain_cursor_record", bundle.cursor.cursorHash),
            bundle.cursor.chainId,
            bundle.cursor.contractAddress,
            bundle.cursor.marketId,
            bundle.cursor.cursorHash,
            bundle.cursor.blockNumber,
            bundle.cursor.blockHash,
            bundle.cursor.eventKey ?? null,
            bundle.cursor.observationHash,
            JSON.stringify(bundle.cursor),
            bundle.cursor.recordedAt
          ]
        );
      }

      let effectCommitted = false;
      if (bundle.effect) {
        const effectId = hashId("pool_finalized_effect_record", bundle.effect.effectHash);
        const insertedEffect = await client.query(
          `INSERT INTO pool_chain_finalized_effects (
             id, chain_id, contract_address, market_id, finalized_sequence,
             event_key, observation_hash, effect_hash, state_hash, projection,
             recorded_at, schema_version
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'pool_finalized_effect_record.v1')
           ON CONFLICT (tenant_id, event_key) DO NOTHING RETURNING id`,
          [
            effectId,
            binding.chainId,
            binding.contractAddress,
            binding.marketId,
            bundle.effect.projection.finalizedEventCount,
            bundle.effect.eventKey,
            bundle.effect.observationHash,
            bundle.effect.effectHash,
            bundle.effect.stateHash,
            JSON.stringify(bundle.effect.projection),
            bundle.effect.recordedAt
          ]
        );
        effectCommitted = insertedEffect.rowCount > 0;
        if (effectCommitted) {
          await client.query(
            `INSERT INTO pool_chain_outbox_messages (
               id, effect_id, chain_id, contract_address, market_id, payload_hash,
               payload, status, created_at, schema_version
             ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'pending',$8,'pool_finalized_outbox_record.v1')`,
            [
              bundle.outbox.outboxMessageId,
              effectId,
              binding.chainId,
              binding.contractAddress,
              binding.marketId,
              bundle.outbox.payloadHash,
              JSON.stringify(bundle.outbox.payload),
              bundle.effect.recordedAt
            ]
          );
        }
      }
      return {
        replayed: observationCount === 0 && !effectCommitted,
        observationCount,
        effectCommitted
      };
    });
  }

  async listObservations({ chainId, contractAddress, marketId } = {}) {
    return this.#transaction(async (client) => {
      const conditions = [];
      const values = [];
      for (const [column, value] of [["chain_id", chainId], ["contract_address", contractAddress], ["market_id", marketId]]) {
        if (value === undefined) continue;
        values.push(value);
        conditions.push(`${column} = $${values.length}`);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await client.query(
        `SELECT normalized_observation FROM pool_chain_observations ${where} ORDER BY ingest_sequence`,
        values
      );
      return result.rows.map(({ normalized_observation }) => clone(normalized_observation));
    });
  }

  async latestProjection({ chainId, contractAddress, marketId } = {}) {
    return this.#transaction(async (client) => {
      const result = await client.query(
        `SELECT projection FROM pool_chain_finalized_effects
          WHERE ($1::text IS NULL OR chain_id = $1)
            AND ($2::text IS NULL OR contract_address = $2)
            AND ($3::text IS NULL OR market_id = $3)
          ORDER BY finalized_sequence DESC LIMIT 1`,
        [chainId ?? null, contractAddress ?? null, marketId ?? null]
      );
      return clone(result.rows[0]?.projection);
    });
  }

  async listOutbox() {
    return this.#transaction(async (client) => {
      const result = await client.query(
        "SELECT id, payload_hash, payload, status FROM pool_chain_outbox_messages ORDER BY created_at, id"
      );
      return result.rows.map((row) => ({
        outboxMessageId: row.id,
        payloadHash: row.payload_hash,
        payload: clone(row.payload),
        status: row.status
      }));
    });
  }

  async appendReconciliation(bundle) {
    if (bundle?.run?.schemaVersion !== "pool_reconciliation.v1" || bundle?.evidence?.schemaVersion !== "pool_reconciliation_evidence.v1") {
      fail("invalid_pool_reconciliation_bundle", "Pool V1 reconciliation bundle is invalid");
    }
    return this.#transaction(async (client) => {
      const run = bundle.run;
      const existingRun = await client.query(
        "SELECT 1 FROM pool_reconciliation_runs WHERE id = $1",
        [run.reconciliationId]
      );
      if (existingRun.rowCount === 0) {
        await client.query(
          `INSERT INTO pool_reconciliation_runs (
             id, chain_id, contract_address, market_id, reconciliation_hash,
             projection_state_hash, consistent, reason_code, direct_reads, run,
             checked_at, synthetic_only, production_funds_moved, schema_version
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,TRUE,FALSE,'pool_reconciliation_run_record.v1')`,
          [
            run.reconciliationId,
            run.chainId,
            run.contractAddress,
            run.marketId,
            run.reconciliationHash,
            run.projectionStateHash,
            run.consistent,
            run.reasonCode,
            JSON.stringify(bundle.reads),
            JSON.stringify(run),
            run.checkedAt
          ]
        );
      }
      if (!run.consistent) {
        const discrepancyHash = hashId("pool_reconciliation_discrepancy", {
          reconciliationId: run.reconciliationId,
          reasonCode: run.reasonCode
        });
        await client.query(
          `INSERT INTO pool_reconciliation_discrepancies (
             id, reconciliation_id, reason_code, discrepancy_hash, recorded_at, schema_version
           ) VALUES ($1,$2,$3,$4,$5,'pool_reconciliation_discrepancy.v1')
           ON CONFLICT (tenant_id, discrepancy_hash) DO NOTHING`,
          [
            hashId("pool_reconciliation_discrepancy_id", discrepancyHash),
            run.reconciliationId,
            run.reasonCode,
            discrepancyHash,
            run.checkedAt
          ]
        );
      }
      await client.query(
        `INSERT INTO pool_reconciliation_evidence (
           id, reconciliation_id, evidence_hash, evidence, recorded_at, schema_version
         ) VALUES ($1,$2,$3,$4::jsonb,$5,'pool_reconciliation_evidence_record.v1')
         ON CONFLICT (tenant_id, evidence_hash) DO NOTHING`,
        [
          bundle.evidence.evidenceId,
          run.reconciliationId,
          bundle.evidence.evidenceHash,
          JSON.stringify(bundle.evidence),
          bundle.evidence.recordedAt
        ]
      );
      for (const control of [bundle.previousRiskControl, bundle.riskControl].filter(Boolean)) {
        await client.query(
          `INSERT INTO pool_risk_controls (
             id, chain_id, contract_address, market_id, version, control_hash,
             new_risk_frozen, reason_code, control, changed_at, schema_version
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'pool_risk_control_record.v1')
           ON CONFLICT (tenant_id, control_hash) DO NOTHING`,
          [
            hashId("pool_risk_control_record", control.controlHash),
            control.chainId,
            control.contractAddress,
            control.marketId,
            control.version,
            control.controlHash,
            control.newRiskFrozen,
            control.reasonCode,
            JSON.stringify(control),
            control.changedAt
          ]
        );
      }
      if (bundle.riskTransition) {
        await client.query(
          `INSERT INTO pool_risk_control_transitions (
             id, previous_control_hash, next_control_hash, reconciliation_id,
             transition, reason_code, transition_record, recorded_at, schema_version
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'pool_risk_transition_record.v1')
           ON CONFLICT (tenant_id, next_control_hash) DO NOTHING`,
          [
            bundle.riskTransition.transitionId,
            bundle.riskTransition.previousControlHash,
            bundle.riskTransition.nextControlHash,
            bundle.riskTransition.reconciliationId,
            bundle.riskTransition.transition,
            bundle.riskTransition.reasonCode,
            JSON.stringify(bundle.riskTransition),
            bundle.riskTransition.recordedAt
          ]
        );
      }
      return { replayed: false };
    });
  }

  async latestReconciliation({ chainId, contractAddress, marketId } = {}) {
    return this.#transaction(async (client) => {
      const result = await client.query(
        `SELECT run FROM pool_reconciliation_runs
          WHERE ($1::text IS NULL OR chain_id = $1)
            AND ($2::text IS NULL OR contract_address = $2)
            AND ($3::text IS NULL OR market_id = $3)
          ORDER BY checked_at DESC, id DESC LIMIT 1`,
        [chainId ?? null, contractAddress ?? null, marketId ?? null]
      );
      return clone(result.rows[0]?.run);
    });
  }

  async latestRiskControl({ chainId, contractAddress, marketId } = {}) {
    return this.#transaction(async (client) => {
      const result = await client.query(
        `SELECT control FROM pool_risk_controls
          WHERE ($1::text IS NULL OR chain_id = $1)
            AND ($2::text IS NULL OR contract_address = $2)
            AND ($3::text IS NULL OR market_id = $3)
          ORDER BY version DESC LIMIT 1`,
        [chainId ?? null, contractAddress ?? null, marketId ?? null]
      );
      return clone(result.rows[0]?.control);
    });
  }

  async listRiskTransitions() {
    return this.#transaction(async (client) => {
      const result = await client.query(
        "SELECT transition_record FROM pool_risk_control_transitions ORDER BY recorded_at, id"
      );
      return result.rows.map(({ transition_record }) => clone(transition_record));
    });
  }
}
