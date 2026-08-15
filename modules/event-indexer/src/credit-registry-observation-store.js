import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  assertTenantSecurityContext,
  setTenantTransactionContext
} from "../../persistence/src/postgres-tenant-context.js";
import {
  assertCreditRegistryLiveObservation,
  calculateCreditRegistryObservationHash
} from "./live-credit-registry-observer.js";

function fail(code, message) {
  throw new DomainError(code, message);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function outboxPayload(observation) {
  return Object.freeze({
    chainId: observation.chainId,
    authorizationHash: observation.authorizationHash,
    observationHash: observation.observationHash,
    finalityProofHash: observation.finalityProofHash,
    finalCreditStateHash: observation.finalCreditStateHash,
    finalObligationProofHash: observation.finalObligationProofHash,
    finalStatus: observation.finalStatus,
    finalVersion: observation.finalVersion,
    registryPaused: observation.registryPaused,
    authorizationActive: observation.authorizationActive,
    syntheticOnly: true,
    productionFundsMoved: false,
    authorizing: false,
    schemaVersion: "credit_registry_chain_outbox_payload.v1"
  });
}

function reconciliation(observation, clock) {
  const actualObservationHash =
    calculateCreditRegistryObservationHash(observation);
  return Object.freeze({
    chainId: observation.chainId,
    authorizationHash: observation.authorizationHash,
    expectedObservationHash: observation.observationHash,
    actualObservationHash,
    differences:
      actualObservationHash === observation.observationHash
        ? Object.freeze([])
        : Object.freeze(["observationHash"]),
    consistent: actualObservationHash === observation.observationHash,
    checkedAt: clock().toISOString(),
    readOnly: true,
    authorizing: false,
    productionFundsMoved: false,
    schemaVersion: "credit_registry_chain_reconciliation.v1"
  });
}

export class InMemoryCreditRegistryObservationStore {
  #observations = [];
  #observationHashes = new Set();

  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
  }

  async append(observation) {
    assertCreditRegistryLiveObservation(observation);
    if (this.#observationHashes.has(observation.observationHash)) {
      return Object.freeze({ replayed: true });
    }
    const stored = clone(observation);
    this.#observationHashes.add(observation.observationHash);
    this.#observations.push(stored);
    return Object.freeze({
      replayed: false,
      observationId: hashId(
        "credit_registry_chain_observation",
        observation.observationHash
      ),
      outboxMessageId: hashId(
        "credit_registry_chain_outbox",
        observation.observationHash
      )
    });
  }

  async readLatest(authorizationHash) {
    const matching = this.#observations.filter(
      (observation) => observation.authorizationHash === authorizationHash
    );
    return clone(matching.at(-1));
  }

  async listPendingOutbox() {
    return this.#observations.map((observation) => {
      const payload = outboxPayload(observation);
      return Object.freeze({
        outboxMessageId: hashId(
          "credit_registry_chain_outbox",
          observation.observationHash
        ),
        payloadHash: hashId(
          "credit_registry_chain_outbox_payload",
          payload
        ),
        payload: clone(payload),
        status: "pending"
      });
    });
  }

  async reconcile(authorizationHash) {
    const observation = await this.readLatest(authorizationHash);
    if (!observation) {
      fail(
        "credit_registry_observation_not_found",
        "credit Registry observation is unavailable"
      );
    }
    return reconciliation(observation, this.clock);
  }
}

export class PostgresCreditRegistryObservationStore {
  constructor({ pool, tenantContext, clock = () => new Date() } = {}) {
    if (!pool || typeof pool.connect !== "function") {
      fail(
        "postgres_pool_required",
        "credit Registry observation store requires a pg-compatible pool"
      );
    }
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

  async append(observation) {
    assertCreditRegistryLiveObservation(observation);
    const observationId = hashId(
      "credit_registry_chain_observation",
      observation.observationHash
    );
    const outboxMessageId = hashId(
      "credit_registry_chain_outbox",
      observation.observationHash
    );
    const payload = outboxPayload(observation);
    const payloadHash = hashId(
      "credit_registry_chain_outbox_payload",
      payload
    );
    return this.#transaction(async (client) => {
      const existing = await client.query(
        `SELECT id
           FROM credit_registry_chain_observations
          WHERE observation_hash = $1`,
        [observation.observationHash]
      );
      if (existing.rowCount > 0) {
        return Object.freeze({ replayed: true });
      }
      const recordedAt = this.clock().toISOString();
      await client.query(
        `INSERT INTO credit_registry_chain_observations (
           id, chain_id, contract_address, authorization_hash,
           observation_hash, finality_proof_hash, observation,
           safe_block_number, safe_block_hash, recorded_at,
           read_only, synthetic_only, production_funds_moved, schema_version
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,
           TRUE,TRUE,FALSE,'credit_registry_chain_observation.v1'
         )`,
        [
          observationId,
          observation.chainId,
          observation.contractAddress,
          observation.authorizationHash,
          observation.observationHash,
          observation.finalityProofHash,
          JSON.stringify(observation),
          observation.safeBlock.number,
          observation.safeBlock.hash,
          recordedAt
        ]
      );
      await client.query(
        `INSERT INTO credit_registry_chain_outbox_messages (
           id, observation_id, chain_id, payload_hash, payload, status,
           attempt_count, available_at, created_at, schema_version
         ) VALUES (
           $1,$2,$3,$4,$5::jsonb,'pending',0,$6,$6,
           'credit_registry_chain_outbox_message.v1'
         )`,
        [
          outboxMessageId,
          observationId,
          observation.chainId,
          payloadHash,
          JSON.stringify(payload),
          recordedAt
        ]
      );
      return Object.freeze({
        replayed: false,
        observationId,
        outboxMessageId
      });
    });
  }

  async readLatest(authorizationHash) {
    if (typeof authorizationHash !== "string") {
      fail(
        "invalid_credit_registry_authorization_hash",
        "authorization hash is required"
      );
    }
    return this.#transaction(async (client) => {
      const result = await client.query(
        `SELECT observation
           FROM credit_registry_chain_observations
          WHERE authorization_hash = $1
          ORDER BY recorded_at DESC, id DESC
          LIMIT 1`,
        [authorizationHash]
      );
      return clone(result.rows[0]?.observation);
    });
  }

  async listPendingOutbox(limit = 25) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      fail(
        "invalid_credit_registry_outbox_limit",
        "credit Registry outbox limit is invalid"
      );
    }
    return this.#transaction(async (client) => {
      const result = await client.query(
        `SELECT id, payload_hash, payload, attempt_count, available_at
           FROM credit_registry_chain_outbox_messages
          WHERE status = 'pending' AND available_at <= clock_timestamp()
          ORDER BY created_at, id
          LIMIT $1`,
        [limit]
      );
      return result.rows.map((row) => Object.freeze({
        outboxMessageId: row.id,
        payloadHash: row.payload_hash,
        payload: clone(row.payload),
        attemptCount: row.attempt_count,
        availableAt: new Date(row.available_at).toISOString()
      }));
    });
  }

  async reconcile(authorizationHash) {
    const observation = await this.readLatest(authorizationHash);
    if (!observation) {
      fail(
        "credit_registry_observation_not_found",
        "credit Registry observation is unavailable"
      );
    }
    assertCreditRegistryLiveObservation(observation);
    return reconciliation(observation, this.clock);
  }
}
