import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { replayChainObservations } from "../../chain-adapter/src/index.js";
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

function validateRecord(record) {
  if (
    !record || typeof record !== "object" || Array.isArray(record) ||
    record.proof?.schemaVersion !== "chain_finality_proof.v1" ||
    record.evidence?.schemaVersion !== "evidence_event.v2" ||
    record.snapshot?.schemaVersion !== "chain_indexer_snapshot.v1" ||
    !record.observation || typeof record.observation !== "object" ||
    record.evidence.evidenceHash !== record.evidence.evidenceHash?.toLowerCase() ||
    record.snapshot.chainId !== record.proof.chainId
  ) fail("invalid_live_chain_record", "live chain record is invalid");
}

export class InMemoryChainObservationStore {
  #records = [];
  #proofHashes = new Set();

  async append(record) {
    validateRecord(record);
    if (this.#proofHashes.has(record.proof.finalityProofHash)) return { replayed: true };
    this.#proofHashes.add(record.proof.finalityProofHash);
    this.#records.push(clone(record));
    return { replayed: false };
  }

  async listReplayInputs(chainId) {
    return this.#records.filter(({ proof }) => proof.chainId === chainId).map(({ observation }) => clone(observation));
  }

  async latestSnapshot(chainId) {
    return clone(this.#records.filter(({ proof }) => proof.chainId === chainId).at(-1)?.snapshot);
  }

  async listPendingOutbox(chainId) {
    return this.#records.filter(({ proof }) => proof.chainId === chainId).map(({ proof, evidence }) => ({
      outboxMessageId: hashId("live_chain_outbox", proof.finalityProofHash),
      finalityProofHash: proof.finalityProofHash,
      evidenceHash: evidence.evidenceHash,
      status: "pending"
    }));
  }
}

export class PostgresChainObservationStore {
  constructor({ pool, tenantContext, clock = () => new Date() } = {}) {
    if (!pool || typeof pool.connect !== "function") fail("postgres_pool_required", "chain store requires a pg-compatible pool");
    this.pool = pool;
    this.tenantContext = assertTenantSecurityContext(tenantContext);
    this.clock = clock;
  }

  async #transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setTenantTransactionContext(client, this.tenantContext);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async append(record) {
    validateRecord(record);
    const observationId = hashId("live_chain_observation", record.proof.finalityProofHash);
    const outboxMessageId = hashId("live_chain_outbox", record.proof.finalityProofHash);
    return this.#transaction(async (client) => {
      const existing = await client.query(
        "SELECT id FROM live_chain_observations WHERE finality_proof_hash = $1",
        [record.proof.finalityProofHash]
      );
      if (existing.rowCount > 0) return { replayed: true };
      const next = await client.query(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM live_chain_indexer_snapshots WHERE chain_id = $1",
        [record.proof.chainId]
      );
      const sequence = Number(next.rows[0].sequence);
      await client.query(
        `INSERT INTO live_chain_observations (
           id, chain_id, event_key, finality_proof_hash, evidence_hash,
           observation_input, finality_proof, evidence_envelope, recorded_at,
           sandbox_only, production_funds_moved, schema_version
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,TRUE,FALSE,'live_chain_observation.v1')`,
        [
          observationId,
          record.proof.chainId,
          record.proof.eventKey,
          record.proof.finalityProofHash,
          record.evidence.evidenceHash,
          JSON.stringify(record.observation),
          JSON.stringify(record.proof),
          JSON.stringify(record.evidence),
          this.clock().toISOString()
        ]
      );
      await client.query(
        `INSERT INTO live_chain_indexer_snapshots (
           id, chain_id, sequence, snapshot_hash, snapshot, recorded_at, schema_version
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,'live_chain_indexer_snapshot.v1')`,
        [
          hashId("live_chain_snapshot", { chainId: record.proof.chainId, sequence }),
          record.proof.chainId,
          sequence,
          record.snapshot.snapshotHash,
          JSON.stringify(record.snapshot),
          this.clock().toISOString()
        ]
      );
      const outboxPayload = {
        chainId: record.proof.chainId,
        finalityProofHash: record.proof.finalityProofHash,
        evidenceHash: record.evidence.evidenceHash,
        obligationHash: hashId("testnet_obligation_reference", { obligationId: record.proof.obligationId }),
        paymentHash: hashId("testnet_payment_reference", { paymentId: record.proof.paymentId }),
        sandboxOnly: true,
        productionFundsMoved: false,
        schemaVersion: "live_chain_evidence_outbox.v1"
      };
      await client.query(
        `INSERT INTO live_chain_outbox_messages (
           id, observation_id, chain_id, payload_hash, payload, status,
           attempt_count, available_at, created_at, schema_version
         ) VALUES ($1,$2,$3,$4,$5::jsonb,'pending',0,$6,$6,'live_chain_outbox_message.v1')`,
        [
          outboxMessageId,
          observationId,
          record.proof.chainId,
          hashId("live_chain_outbox_payload", outboxPayload),
          JSON.stringify(outboxPayload),
          this.clock().toISOString()
        ]
      );
      return { replayed: false, observationId, outboxMessageId, sequence };
    });
  }

  async listReplayInputs(chainId) {
    return this.#transaction(async (client) => {
      const result = await client.query(
        "SELECT observation_input FROM live_chain_observations WHERE chain_id = $1 ORDER BY recorded_at, id",
        [chainId]
      );
      return result.rows.map(({ observation_input }) => clone(observation_input));
    });
  }

  async latestSnapshot(chainId) {
    return this.#transaction(async (client) => {
      const result = await client.query(
        "SELECT snapshot FROM live_chain_indexer_snapshots WHERE chain_id = $1 ORDER BY sequence DESC LIMIT 1",
        [chainId]
      );
      return clone(result.rows[0]?.snapshot);
    });
  }

  async listPendingOutbox(chainId, limit = 25) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail("invalid_outbox_limit", "outbox limit is invalid");
    return this.#transaction(async (client) => {
      const result = await client.query(
        `SELECT id, payload_hash, payload, attempt_count, available_at
           FROM live_chain_outbox_messages
          WHERE chain_id = $1 AND status = 'pending' AND available_at <= clock_timestamp()
          ORDER BY created_at, id LIMIT $2`,
        [chainId, limit]
      );
      return result.rows.map((row) => ({
        outboxMessageId: row.id,
        payloadHash: row.payload_hash,
        payload: clone(row.payload),
        attemptCount: row.attempt_count,
        availableAt: new Date(row.available_at).toISOString()
      }));
    });
  }

  async reconcile({ chainId, adapter }) {
    const observations = await this.listReplayInputs(chainId);
    const expected = await this.latestSnapshot(chainId);
    const actual = replayChainObservations({ adapter, observations }).snapshot();
    return Object.freeze({
      chainId,
      observationCount: observations.length,
      expectedSnapshotHash: expected?.snapshotHash,
      actualSnapshotHash: actual.snapshotHash,
      consistent: expected?.snapshotHash === actual.snapshotHash,
      checkedAt: this.clock().toISOString(),
      schemaVersion: "live_chain_reconciliation.v1"
    });
  }
}
