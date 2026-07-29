import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  assertTenantSecurityContext,
  setTenantTransactionContext
} from "../../persistence/src/postgres-tenant-context.js";

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ACCOUNT = /^eip155:84532:0x[0-9a-fA-F]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/;
const CONFIRMATION_MODES = new Set([
  "wallet_transaction",
  "account_relayer",
  "agent_transaction",
  "system_attestor"
]);
const OBSERVATION_STATUSES = new Set([
  "unknown",
  "included",
  "safe",
  "finalized",
  "reorged",
  "failed"
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function clone(value) {
  return structuredClone(value);
}

function hash(name, value) {
  if (!HASH.test(value ?? "")) fail("invalid_evidence_anchor_store", `${name} is invalid`);
  return value;
}

function identifier(name, value) {
  if (!ID.test(value ?? "")) fail("invalid_evidence_anchor_store", `${name} is invalid`);
  return value;
}

function dateTime(name, value) {
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) {
    fail("invalid_evidence_anchor_store", `${name} is invalid`);
  }
  return new Date(milliseconds).toISOString();
}

function address(name, value) {
  if (!ADDRESS.test(value ?? "")) fail("invalid_evidence_anchor_store", `${name} is invalid`);
  return value;
}

function account(value) {
  if (!ACCOUNT.test(value ?? "")) {
    fail("invalid_evidence_anchor_store", "attestorAccountId is invalid");
  }
  return value;
}

function integer(name, value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail("invalid_evidence_anchor_store", `${name} is invalid`);
  }
  return value;
}

function mapAnchor(row) {
  if (!row) return undefined;
  return Object.freeze({
    anchorId: row.id,
    evidenceEventId: row.evidence_event_id,
    evidenceHash: row.evidence_hash,
    eventType: row.event_type,
    eventTypeHash: row.event_type_hash,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: Number(row.aggregate_version),
    aggregateRefHash: row.aggregate_ref_hash,
    actionDigest: row.action_digest,
    chainId: row.chain_id,
    contractAddress: row.contract_address ?? undefined,
    attestorAccountId: row.attestor_account_id ?? undefined,
    confirmationMode: row.confirmation_mode,
    status: row.status,
    batchId: row.batch_id ?? undefined,
    batchDigest: row.batch_digest ?? undefined,
    batchOrdinal: row.batch_ordinal ?? undefined,
    batchSize: row.batch_size ?? undefined,
    attestorNonce:
      row.attestor_nonce === null || row.attestor_nonce === undefined
        ? undefined
        : Number(row.attestor_nonce),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : undefined,
    preparedTransaction: row.prepared_transaction
      ? clone(row.prepared_transaction)
      : undefined,
    transactionHash: row.transaction_hash ?? undefined,
    blockNumber:
      row.block_number === null || row.block_number === undefined
        ? undefined
        : String(row.block_number),
    blockHash: row.block_hash ?? undefined,
    logIndex: row.log_index ?? undefined,
    confirmations: Number(row.confirmations),
    attemptCount: Number(row.attempt_count),
    lastErrorCode: row.last_error_code ?? undefined,
    requestedAt: new Date(row.requested_at).toISOString(),
    preparedAt: row.prepared_at ? new Date(row.prepared_at).toISOString() : undefined,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : undefined,
    anchoredAt: row.anchored_at ? new Date(row.anchored_at).toISOString() : undefined,
    finalizedAt: row.finalized_at ? new Date(row.finalized_at).toISOString() : undefined,
    lastObservedAt:
      row.last_observed_at ? new Date(row.last_observed_at).toISOString() : undefined,
    sandboxOnly: row.sandbox_only,
    productionFundsMoved: row.production_funds_moved,
    schemaVersion: row.schema_version
  });
}

export class PostgresEvidenceAnchorStore {
  constructor({ pool, tenantContext, clock = () => new Date() } = {}) {
    if (!pool || typeof pool.connect !== "function") {
      fail("postgres_pool_required", "Evidence anchor store requires a pg-compatible pool");
    }
    if (typeof clock !== "function") {
      fail("invalid_evidence_anchor_store", "clock must be a function");
    }
    this.pool = pool;
    this.tenantContext = assertTenantSecurityContext(tenantContext);
    this.clock = clock;
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
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listPending({ limit = 16 } = {}) {
    integer("limit", limit, { minimum: 1, maximum: 16 });
    return this.#transaction(async (client) => {
      const first = await client.query(
        `SELECT action_digest
           FROM evidence_chain_anchors
          WHERE (
                  status = 'pending'
                  OR (status = 'failed' AND transaction_hash IS NULL)
                  OR status = 'reorged'
                )
            AND attempt_count < 10
          ORDER BY requested_at, evidence_hash
          LIMIT 1`
      );
      if (first.rowCount === 0) return [];
      const result = await client.query(
        `SELECT a.*, e.aggregate_type, e.aggregate_id, e.aggregate_version
           FROM evidence_chain_anchors a
           JOIN evidence_envelopes e
             ON e.tenant_id = a.tenant_id
            AND e.id = a.evidence_event_id
          WHERE a.action_digest = $1
            AND (
                  a.status = 'pending'
                  OR (a.status = 'failed' AND a.transaction_hash IS NULL)
                  OR a.status = 'reorged'
                )
            AND a.attempt_count < 10
          ORDER BY a.requested_at, a.evidence_hash
          LIMIT $2
          FOR UPDATE OF a SKIP LOCKED`,
        [first.rows[0].action_digest, limit]
      );
      return result.rows.map(mapAnchor);
    });
  }

  async listPrepared({ limit = 16 } = {}) {
    integer("limit", limit, { minimum: 1, maximum: 16 });
    return this.#transaction(async (client) => {
      const first = await client.query(
        `SELECT batch_id
           FROM evidence_chain_anchors
          WHERE status = 'prepared'
          ORDER BY prepared_at, evidence_hash
          LIMIT 1`
      );
      if (first.rowCount === 0) return [];
      const result = await client.query(
        `SELECT a.*, e.aggregate_type, e.aggregate_id, e.aggregate_version
           FROM evidence_chain_anchors a
           JOIN evidence_envelopes e
             ON e.tenant_id = a.tenant_id
            AND e.id = a.evidence_event_id
          WHERE a.batch_id = $1
            AND a.status = 'prepared'
          ORDER BY a.batch_ordinal, a.evidence_hash
          LIMIT $2`,
        [first.rows[0].batch_id, limit]
      );
      return result.rows.map(mapAnchor);
    });
  }

  async listObservable({ limit = 16 } = {}) {
    integer("limit", limit, { minimum: 1, maximum: 16 });
    return this.#transaction(async (client) => {
      const first = await client.query(
        `SELECT transaction_hash
           FROM evidence_chain_anchors
          WHERE status IN ('broadcast', 'unknown', 'included', 'safe')
          ORDER BY
            CASE
              WHEN status IN ('broadcast', 'unknown') THEN 0
              ELSE 1
            END,
            submitted_at,
            evidence_hash
          LIMIT 1`
      );
      if (first.rowCount === 0) return [];
      const result = await client.query(
        `SELECT a.*, e.aggregate_type, e.aggregate_id, e.aggregate_version
           FROM evidence_chain_anchors a
           JOIN evidence_envelopes e
             ON e.tenant_id = a.tenant_id
            AND e.id = a.evidence_event_id
          WHERE a.transaction_hash = $1
            AND a.status IN ('broadcast', 'unknown', 'included', 'safe')
          ORDER BY a.batch_ordinal, a.evidence_hash
          LIMIT $2`,
        [first.rows[0].transaction_hash, limit]
      );
      return result.rows.map(mapAnchor);
    });
  }

  async prepareBatch({
    evidenceHashes,
    contractAddress,
    attestorAccountId,
    confirmationMode,
    batchId,
    batchDigest,
    attestorNonce,
    expiresAt,
    preparedTransaction,
    preparedAt = this.clock().toISOString()
  }) {
    if (
      !Array.isArray(evidenceHashes) ||
      evidenceHashes.length < 1 ||
      evidenceHashes.length > 16 ||
      new Set(evidenceHashes).size !== evidenceHashes.length
    ) {
      fail("invalid_evidence_anchor_store", "evidenceHashes must contain 1 through 16 unique hashes");
    }
    evidenceHashes.forEach((value) => hash("evidenceHash", value));
    const checkedContract = address("contractAddress", contractAddress);
    const checkedAccount = account(attestorAccountId);
    if (!CONFIRMATION_MODES.has(confirmationMode)) {
      fail("invalid_evidence_anchor_store", "confirmationMode is invalid");
    }
    const checkedBatchId = identifier("batchId", batchId);
    const checkedBatchDigest = hash("batchDigest", batchDigest);
    const checkedNonce = integer("attestorNonce", attestorNonce);
    const checkedExpiresAt = dateTime("expiresAt", expiresAt);
    const checkedPreparedAt = dateTime("preparedAt", preparedAt);
    if (
      !preparedTransaction ||
      typeof preparedTransaction !== "object" ||
      Array.isArray(preparedTransaction) ||
      preparedTransaction.chainId !== "eip155:84532" ||
      preparedTransaction.to?.toLowerCase() !== checkedContract.toLowerCase() ||
      preparedTransaction.from?.toLowerCase() !== checkedAccount.split(":").at(-1).toLowerCase() ||
      preparedTransaction.value !== "0x0" ||
      preparedTransaction.batchDigest !== checkedBatchDigest ||
      JSON.stringify(preparedTransaction.evidenceHashes) !== JSON.stringify(evidenceHashes) ||
      !/^0x[0-9a-f]+$/.test(preparedTransaction.data ?? "")
    ) {
      fail("invalid_evidence_anchor_store", "preparedTransaction is invalid");
    }
    return this.#transaction(async (client) => {
      const rows = await client.query(
        `SELECT evidence_hash, status, contract_address, attestor_account_id,
                confirmation_mode, batch_id, batch_digest, attestor_nonce,
                transaction_hash
           FROM evidence_chain_anchors
          WHERE evidence_hash = ANY($1::text[])
          ORDER BY evidence_hash
          FOR UPDATE`,
        [evidenceHashes]
      );
      if (
        rows.rowCount !== evidenceHashes.length ||
        rows.rows.some((row) =>
          row.status !== "pending" &&
          row.status !== "reorged" &&
          !(row.status === "failed" && row.transaction_hash === null)
        ) ||
        rows.rows.some((row) =>
          row.status !== "reorged" &&
          (
          (row.contract_address !== null &&
            row.contract_address.toLowerCase() !== checkedContract.toLowerCase()) ||
          (row.attestor_account_id !== null &&
            row.attestor_account_id.toLowerCase() !== checkedAccount.toLowerCase()) ||
          (row.confirmation_mode !== "unassigned" &&
            row.confirmation_mode !== confirmationMode) ||
          (row.batch_id !== null && row.batch_id !== checkedBatchId) ||
          (row.batch_digest !== null && row.batch_digest !== checkedBatchDigest) ||
          (row.attestor_nonce !== null && Number(row.attestor_nonce) !== checkedNonce)
          )
        )
      ) {
        fail("evidence_anchor_state_conflict", "Evidence anchor batch is not preparable");
      }
      const updated = await client.query(
        `WITH requested(evidence_hash, batch_ordinal) AS (
           SELECT value, ordinality - 1
             FROM unnest($1::text[]) WITH ORDINALITY AS input(value, ordinality)
         )
         UPDATE evidence_chain_anchors AS anchor
            SET contract_address = $2,
                attestor_account_id = $3,
                confirmation_mode = $4,
                status = 'prepared',
                batch_id = $5,
                batch_digest = $6,
                batch_ordinal = requested.batch_ordinal,
                batch_size = $7,
                attestor_nonce = $8,
                expires_at = $9,
                prepared_transaction = $10::jsonb,
                transaction_hash = NULL,
                block_number = NULL,
                block_hash = NULL,
                log_index = NULL,
                confirmations = 0,
                submitted_at = NULL,
                anchored_at = NULL,
                finalized_at = NULL,
                last_observed_at = NULL,
                attempt_count = attempt_count + 1,
                last_error_code = NULL,
                prepared_at = $11
           FROM requested
          WHERE anchor.evidence_hash = requested.evidence_hash
          RETURNING anchor.evidence_hash`,
        [
          evidenceHashes,
          checkedContract,
          checkedAccount,
          confirmationMode,
          checkedBatchId,
          checkedBatchDigest,
          evidenceHashes.length,
          String(checkedNonce),
          checkedExpiresAt,
          JSON.stringify(preparedTransaction),
          checkedPreparedAt
        ]
      );
      if (updated.rowCount !== evidenceHashes.length) {
        fail("evidence_anchor_state_conflict", "Evidence anchor batch changed during preparation");
      }
      return Object.freeze({
        batchId: checkedBatchId,
        batchDigest: checkedBatchDigest,
        evidenceHashes: Object.freeze([...evidenceHashes]),
        status: "prepared",
        schemaVersion: "evidence_anchor_batch_prepared.v1"
      });
    });
  }

  async markSubmitted({
    batchId,
    transactionHash,
    outcome = "broadcast",
    submittedAt = this.clock().toISOString()
  }) {
    const checkedBatchId = identifier("batchId", batchId);
    const checkedTransactionHash = hash("transactionHash", transactionHash);
    if (!new Set(["broadcast", "unknown"]).has(outcome)) {
      fail("invalid_evidence_anchor_store", "submission outcome is invalid");
    }
    const checkedSubmittedAt = dateTime("submittedAt", submittedAt);
    return this.#transaction(async (client) => {
      const result = await client.query(
        `UPDATE evidence_chain_anchors
            SET status = $2,
                transaction_hash = $3,
                submitted_at = $4,
                last_error_code = NULL
          WHERE batch_id = $1
            AND status = 'prepared'
          RETURNING evidence_hash`,
        [
          checkedBatchId,
          outcome,
          checkedTransactionHash,
          checkedSubmittedAt
        ]
      );
      if (result.rowCount < 1 || result.rowCount > 16) {
        fail("evidence_anchor_state_conflict", "prepared Evidence batch is unavailable");
      }
      return Object.freeze({
        batchId: checkedBatchId,
        transactionHash: checkedTransactionHash,
        evidenceHashes: Object.freeze(
          result.rows.map(({ evidence_hash }) => evidence_hash).sort()
        ),
        status: outcome,
        schemaVersion: "evidence_anchor_batch_submitted.v1"
      });
    });
  }

  async markPreparationFailed({
    batchId,
    reasonCode = "prepared_transaction_expired"
  }) {
    const checkedBatchId = identifier("batchId", batchId);
    const checkedReason = identifier("reasonCode", reasonCode);
    return this.#transaction(async (client) => {
      const result = await client.query(
        `UPDATE evidence_chain_anchors
            SET status = 'failed',
                last_error_code = $2
          WHERE batch_id = $1
            AND status = 'prepared'
            AND transaction_hash IS NULL
          RETURNING evidence_hash`,
        [checkedBatchId, checkedReason]
      );
      if (result.rowCount < 1 || result.rowCount > 16) {
        fail("evidence_anchor_state_conflict", "prepared Evidence batch is unavailable");
      }
      return Object.freeze({
        batchId: checkedBatchId,
        evidenceHashes: Object.freeze(
          result.rows.map(({ evidence_hash }) => evidence_hash).sort()
        ),
        status: "failed",
        schemaVersion: "evidence_anchor_preparation_failed.v1"
      });
    });
  }

  async recordObservation(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      fail("invalid_evidence_anchor_observation", "Evidence anchor observation is invalid");
    }
    const evidenceHash = hash("evidenceHash", input.evidenceHash);
    const transactionHash = hash("transactionHash", input.transactionHash);
    const finalityProofHash = hash("finalityProofHash", input.finalityProofHash);
    const contractAddress = address("contractAddress", input.contractAddress);
    if (!OBSERVATION_STATUSES.has(input.status)) {
      fail("invalid_evidence_anchor_observation", "Evidence anchor status is invalid");
    }
    if (!new Set(["primary", "secondary"]).has(input.providerSlot)) {
      fail("invalid_evidence_anchor_observation", "Evidence anchor provider is invalid");
    }
    const confirmations = integer("confirmations", input.confirmations, {
      maximum: 1_000_000
    });
    const observedAt = dateTime("observedAt", input.observedAt);
    const blockNumber = input.blockNumber === undefined
      ? undefined
      : String(BigInt(input.blockNumber));
    const blockHash = input.blockHash === undefined
      ? undefined
      : hash("blockHash", input.blockHash);
    const logIndex = input.logIndex === undefined
      ? undefined
      : integer("logIndex", input.logIndex, { maximum: 65535 });
    const anchoredAt = input.anchoredAt === undefined
      ? undefined
      : dateTime("anchoredAt", input.anchoredAt);
    const chainLocated = new Set(["included", "safe", "finalized", "reorged"])
      .has(input.status);
    if (
      chainLocated &&
      (blockNumber === undefined ||
        blockHash === undefined ||
        logIndex === undefined ||
        anchoredAt === undefined)
    ) {
      fail("invalid_evidence_anchor_observation", "located Evidence anchor is incomplete");
    }
    if (
      input.chainId !== "eip155:84532" ||
      input.rawProviderPayloadPersisted !== false ||
      input.sandboxOnly !== true ||
      input.productionFundsMoved !== false
    ) {
      fail("invalid_evidence_anchor_observation", "Evidence anchor safety flags are invalid");
    }
    return this.#transaction(async (client) => {
      const current = await client.query(
        `SELECT id, status, contract_address, transaction_hash
           FROM evidence_chain_anchors
          WHERE evidence_hash = $1
          FOR UPDATE`,
        [evidenceHash]
      );
      if (
        current.rowCount !== 1 ||
        current.rows[0].contract_address?.toLowerCase() !== contractAddress.toLowerCase() ||
        current.rows[0].transaction_hash !== transactionHash
      ) {
        fail("evidence_anchor_binding_mismatch", "Evidence anchor observation binding is invalid");
      }
      const anchorId = current.rows[0].id;
      const observationId = hashId("evidence_chain_anchor_observation", {
        finalityProofHash
      });
      const inserted = await client.query(
        `INSERT INTO evidence_chain_anchor_observations(
           id, anchor_id, evidence_hash, chain_id, contract_address,
           transaction_hash, status, block_number, block_hash, log_index,
           confirmations, finality_proof_hash, observed_at, provider_slot,
           raw_provider_payload_persisted, sandbox_only,
           production_funds_moved, schema_version
         ) VALUES (
           $1, $2, $3, 'eip155:84532', $4,
           $5, $6, $7, $8, $9,
           $10, $11, $12, $13,
           FALSE, TRUE,
           FALSE, 'evidence_chain_anchor_observation.v1'
         )
         ON CONFLICT (tenant_id, finality_proof_hash) DO NOTHING
         RETURNING id`,
        [
          observationId,
          anchorId,
          evidenceHash,
          contractAddress,
          transactionHash,
          input.status,
          blockNumber,
          blockHash,
          logIndex,
          confirmations,
          finalityProofHash,
          observedAt,
          input.providerSlot
        ]
      );
      if (inserted.rowCount === 0) {
        return Object.freeze({
          anchorId,
          evidenceHash,
          replayed: true,
          schemaVersion: "evidence_anchor_observation_recorded.v1"
        });
      }
      const finalizedAt = input.status === "finalized" ? observedAt : null;
      await client.query(
        `UPDATE evidence_chain_anchors
            SET status = $2,
                block_number = COALESCE($3, block_number),
                block_hash = COALESCE($4, block_hash),
                log_index = COALESCE($5, log_index),
                confirmations = $6,
                anchored_at = COALESCE($7, anchored_at),
                finalized_at = $8,
                last_observed_at = $9,
                last_error_code = CASE
                  WHEN $2 = 'failed' THEN 'chain_observation_failed'
                  WHEN $2 = 'reorged' THEN 'chain_reorg_detected'
                  ELSE NULL
                END
          WHERE id = $1`,
        [
          anchorId,
          input.status,
          blockNumber,
          blockHash,
          logIndex,
          confirmations,
          anchoredAt,
          finalizedAt,
          observedAt
        ]
      );
      return Object.freeze({
        anchorId,
        evidenceHash,
        replayed: false,
        status: input.status,
        finalityProofHash,
        schemaVersion: "evidence_anchor_observation_recorded.v1"
      });
    });
  }

  async listByEvidenceHashes(evidenceHashes) {
    if (
      !Array.isArray(evidenceHashes) ||
      evidenceHashes.length < 1 ||
      evidenceHashes.length > 100 ||
      new Set(evidenceHashes).size !== evidenceHashes.length
    ) {
      fail("invalid_evidence_anchor_store", "Evidence hash query is invalid");
    }
    evidenceHashes.forEach((value) => hash("evidenceHash", value));
    return this.#transaction(async (client) => {
      const result = await client.query(
        `SELECT a.*, e.aggregate_type, e.aggregate_id, e.aggregate_version
           FROM evidence_chain_anchors a
           JOIN evidence_envelopes e
             ON e.tenant_id = a.tenant_id
            AND e.id = a.evidence_event_id
          WHERE a.evidence_hash = ANY($1::text[])
          ORDER BY a.requested_at, a.evidence_hash`,
        [evidenceHashes]
      );
      return result.rows.map(mapAnchor);
    });
  }

  async coverageSummary() {
    return this.#transaction(async (client) => {
      const result = await client.query(
        `SELECT
           (SELECT count(*) FROM evidence_envelopes) AS evidence_count,
           count(*) AS anchor_count,
           count(*) FILTER (WHERE status = 'finalized') AS finalized_count,
           count(*) FILTER (
             WHERE status NOT IN ('finalized', 'reconciled')
           ) AS open_count
         FROM evidence_chain_anchors`
      );
      const row = result.rows[0];
      const summary = {
        evidenceCount: Number(row.evidence_count),
        anchorCount: Number(row.anchor_count),
        finalizedCount: Number(row.finalized_count),
        openCount: Number(row.open_count)
      };
      return Object.freeze({
        ...summary,
        complete:
          summary.evidenceCount === summary.anchorCount &&
          summary.anchorCount === summary.finalizedCount,
        schemaVersion: "evidence_anchor_coverage_summary.v1"
      });
    });
  }
}
