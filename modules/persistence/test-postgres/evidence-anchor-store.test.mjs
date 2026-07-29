import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { PostgresEvidenceAnchorStore } from "../../event-indexer/src/index.js";
import {
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";
import { migrateUp } from "../../../scripts/migrate.mjs";

const { Pool } = pg;
const CONNECTION_STRING = process.env.DATABASE_URL;
const NOW = "2026-07-29T04:00:00.000Z";
const CONTRACT = "0x1111111111111111111111111111111111111111";
const ATTESTOR = "0x2222222222222222222222222222222222222222";

async function withTenant(pool, context, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantTransactionContext(client, context);
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

test("Evidence anchor store is durable, retry-safe, and finality-aware", async () => {
  assert.ok(CONNECTION_STRING);
  const pool = new Pool({ connectionString: CONNECTION_STRING, max: 4 });
  const suffix = randomBytes(5).toString("hex");
  const tenantId = `tenant_evidence_anchor_${suffix}`;
  const actorId = `actor_evidence_anchor_${suffix}`;
  const context = createTenantSecurityContext({
    tenantId,
    actorId,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  const evidenceId = `credit_event_evidence_anchor_${suffix}`;
  const evidenceHash = hashId("evidence_anchor_store_test", suffix);
  const eventTypeHash = hashId("evidence_event_type", {
    eventType: "repayment_posted"
  });
  const aggregateRefHash = hashId("evidence_aggregate_reference", {
    aggregateType: "obligation",
    aggregateId: `obligation_evidence_anchor_${suffix}`,
    aggregateVersion: 1
  });
  const actionDigest = hashId("evidence_anchor_action", { suffix });
  const batchDigest = hashId("evidence_anchor_batch", { suffix });
  const batchId = `evidence_anchor_batch_${suffix}`;
  const transactionHash = hashId("evidence_anchor_transaction_hash", suffix);
  try {
    await migrateUp({ pool });
    await pool.query(
      `INSERT INTO tenants(
         id, tenant_hash, organization_ref, display_name, status,
         pilot_jurisdiction, legal_retention_owner_ref, created_at,
         updated_at, schema_version
       ) VALUES ($1,$2,$3,$4,'active','PRIVATE_NO_FUNDS',$3,$5,$5,'tenant.v1')`,
      [
        tenantId,
        hashId("evidence_anchor_tenant", suffix),
        `urn:ipo.one:test:evidence-anchor:${suffix}`,
        `Evidence Anchor ${suffix}`,
        NOW
      ]
    );
    await pool.query(
      `INSERT INTO actors(
         id, actor_hash, actor_type, status, created_at, updated_at,
         schema_version
       ) VALUES ($1,$2,'system_worker','active',$3,$3,'actor.v1')`,
      [actorId, hashId("evidence_anchor_actor", suffix), NOW]
    );
    await assert.rejects(
      withTenant(pool, context, (client) => client.query(
        `INSERT INTO evidence_envelopes(
           id, evidence_hash, event_type, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, idempotency_key, actor_ref,
           source_system, source_finality, payload_hash, payload,
           attestation_refs, occurred_at, recorded_at, schema_version
         ) VALUES (
           $1,$2,'repayment_posted','obligation',$3,
           1,$4,$5,$6,
           'ipo_one_test','finalized',$7,'{}'::jsonb,
           '[]'::jsonb,$8,$8,'evidence_event.v2'
         )`,
        [
          `credit_event_unanchored_${suffix}`,
          hashId("unanchored_evidence_test", suffix),
          `obligation_unanchored_${suffix}`,
          `correlation_unanchored_${suffix}`,
          `idempotency_unanchored_${suffix}`,
          actorId,
          hashId("unanchored_evidence_payload", suffix),
          NOW
        ]
      )),
      /Durable Evidence requires an exact chain anchor requirement/
    );
    await withTenant(pool, context, async (client) => {
      await client.query(
        `INSERT INTO evidence_envelopes(
           id, evidence_hash, event_type, aggregate_type, aggregate_id,
           aggregate_version, correlation_id, idempotency_key, actor_ref,
           source_system, source_finality, payload_hash, payload,
           attestation_refs, occurred_at, recorded_at, schema_version
         ) VALUES (
           $1,$2,'repayment_posted','obligation',$3,
           1,$4,$5,$6,
           'ipo_one_test','finalized',$7,'{}'::jsonb,
           '[]'::jsonb,$8,$8,'evidence_event.v2'
         )`,
        [
          evidenceId,
          evidenceHash,
          `obligation_evidence_anchor_${suffix}`,
          `correlation_evidence_anchor_${suffix}`,
          `idempotency_evidence_anchor_${suffix}`,
          actorId,
          hashId("evidence_anchor_payload", suffix),
          NOW
        ]
      );
      await client.query(
        `INSERT INTO evidence_chain_anchors(
           id, evidence_event_id, evidence_hash, event_type, event_type_hash,
           aggregate_ref_hash, action_digest, chain_id, confirmation_mode,
           status, requested_at, sandbox_only, production_funds_moved,
           schema_version
         ) VALUES (
           $1,$2,$3,'repayment_posted',$4,
           $5,$6,'eip155:84532','unassigned',
           'pending',$7,TRUE,FALSE,'evidence_chain_anchor.v1'
         )`,
        [
          `evidence_chain_anchor_${suffix}`,
          evidenceId,
          evidenceHash,
          eventTypeHash,
          aggregateRefHash,
          actionDigest,
          NOW
        ]
      );
    });
    const store = new PostgresEvidenceAnchorStore({
      pool,
      tenantContext: context,
      clock: () => new Date(NOW)
    });
    const preparedTransaction = {
      chainId: "eip155:84532",
      from: ATTESTOR,
      to: CONTRACT,
      data: "0x12345678",
      value: "0x0",
      batchDigest,
      evidenceHashes: [evidenceHash]
    };
    await store.prepareBatch({
      evidenceHashes: [evidenceHash],
      contractAddress: CONTRACT,
      attestorAccountId: `eip155:84532:${ATTESTOR}`,
      confirmationMode: "system_attestor",
      batchId,
      batchDigest,
      attestorNonce: 0,
      expiresAt: "2026-07-29T04:10:00.000Z",
      preparedTransaction,
      preparedAt: NOW
    });
    await store.markPreparationFailed({
      batchId,
      reasonCode: "wallet_confirmation_rejected"
    });
    await store.prepareBatch({
      evidenceHashes: [evidenceHash],
      contractAddress: CONTRACT,
      attestorAccountId: `eip155:84532:${ATTESTOR}`,
      confirmationMode: "system_attestor",
      batchId,
      batchDigest,
      attestorNonce: 0,
      expiresAt: "2026-07-29T04:10:00.000Z",
      preparedTransaction,
      preparedAt: NOW
    });
    const submitted = await store.markSubmitted({
      batchId,
      transactionHash,
      submittedAt: NOW
    });
    assert.equal(submitted.status, "broadcast");
    const observation = {
      chainId: "eip155:84532",
      evidenceHash,
      contractAddress: CONTRACT,
      transactionHash,
      status: "finalized",
      blockNumber: "123",
      blockHash: hashId("evidence_anchor_block", suffix),
      logIndex: 0,
      confirmations: 8,
      anchoredAt: NOW,
      observedAt: NOW,
      finalityProofHash: hashId("evidence_anchor_finality", suffix),
      providerSlot: "primary",
      rawProviderPayloadPersisted: false,
      sandboxOnly: true,
      productionFundsMoved: false
    };
    const recorded = await store.recordObservation(observation);
    assert.equal(recorded.replayed, false);
    assert.equal((await store.recordObservation(observation)).replayed, true);
    const firstAnchor = (await store.listByEvidenceHashes([evidenceHash]))[0];
    assert.equal(firstAnchor.status, "finalized");
    const reorged = {
      ...observation,
      status: "reorged",
      confirmations: 0,
      observedAt: "2026-07-29T04:01:00.000Z",
      finalityProofHash: hashId("evidence_anchor_reorg", suffix)
    };
    await store.recordObservation(reorged);
    assert.equal(
      (await store.listByEvidenceHashes([evidenceHash]))[0].status,
      "reorged"
    );
    const retryBatchId = `evidence_anchor_retry_batch_${suffix}`;
    const retryBatchDigest = hashId("evidence_anchor_retry_batch", { suffix });
    const retryTransactionHash =
      hashId("evidence_anchor_retry_transaction_hash", suffix);
    const retryPreparedTransaction = {
      ...preparedTransaction,
      batchDigest: retryBatchDigest
    };
    await store.prepareBatch({
      evidenceHashes: [evidenceHash],
      contractAddress: CONTRACT,
      attestorAccountId: `eip155:84532:${ATTESTOR}`,
      confirmationMode: "system_attestor",
      batchId: retryBatchId,
      batchDigest: retryBatchDigest,
      attestorNonce: 0,
      expiresAt: "2026-07-29T04:12:00.000Z",
      preparedTransaction: retryPreparedTransaction,
      preparedAt: "2026-07-29T04:02:00.000Z"
    });
    await store.markSubmitted({
      batchId: retryBatchId,
      transactionHash: retryTransactionHash,
      submittedAt: "2026-07-29T04:02:00.000Z"
    });
    await store.recordObservation({
      ...observation,
      transactionHash: retryTransactionHash,
      blockNumber: "125",
      blockHash: hashId("evidence_anchor_retry_block", suffix),
      confirmations: 8,
      anchoredAt: "2026-07-29T04:02:30.000Z",
      observedAt: "2026-07-29T04:03:00.000Z",
      finalityProofHash: hashId("evidence_anchor_retry_finality", suffix)
    });
    const anchor = (await store.listByEvidenceHashes([evidenceHash]))[0];
    assert.equal(anchor.status, "finalized");
    assert.equal(anchor.transactionHash, retryTransactionHash);
    assert.equal(anchor.batchOrdinal, 0);
    assert.equal(anchor.batchSize, 1);
    assert.equal(anchor.attemptCount, 3);
    const coverage = await store.coverageSummary();
    assert.equal(coverage.evidenceCount, coverage.anchorCount);
    assert.equal(coverage.finalizedCount >= 1, true);
    assert.equal(
      coverage.openCount,
      coverage.anchorCount - coverage.finalizedCount
    );
    assert.equal(
      coverage.schemaVersion,
      "evidence_anchor_coverage_summary.v1"
    );
  } finally {
    await pool.end();
  }
});
