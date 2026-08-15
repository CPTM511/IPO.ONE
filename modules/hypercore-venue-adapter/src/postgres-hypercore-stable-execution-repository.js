import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  abortHypercoreStableExecutionSigning,
  approveHypercoreStableExecutionIntent,
  beginHypercoreJitSigning,
  claimHypercoreStableExecutionIntent,
  closeHypercoreStableExecutionIntent,
  createHypercoreStableExecutionIntent,
  reconcileHypercoreStableExecutionIntent,
  resolveHypercoreStableExecutionIntent,
  recoverHypercoreStableExecutionUnknown,
  verifyHypercoreJitActionAuthorization,
  verifyHypercoreJitVenuePreflightReceipt,
  verifyHypercoreStableExecutionIntent,
  verifyHypercoreStableFounderApproval
} from "./hypercore-jit-execution.js";
import {
  HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION,
  createHypercoreStableCancelExecutionIntent,
  verifyHypercoreStableCancelTarget
} from "./hypercore-cancel-closure.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{2,255}$/;

function fail(code, message) {
  throw new DomainError(code, message);
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hypercore_stable_repository_input", `${name} is invalid`);
  }
  return value;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_hypercore_stable_repository_input", `${name} must be trusted`);
  }
  return new Date(value.getTime());
}

function json(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function mapIntent(row) {
  if (!row) return undefined;
  const intent = json(row.intent);
  verifyHypercoreStableExecutionIntent(intent);
  return intent;
}

function mapApproval(row) {
  if (!row) return undefined;
  const approval = json(row.approval);
  verifyHypercoreStableFounderApproval(approval);
  return approval;
}

function mapReceipt(row) {
  if (!row) return undefined;
  const receipt = json(row.receipt);
  verifyHypercoreJitVenuePreflightReceipt(receipt);
  return receipt;
}

async function insertTransition(client, next, previous) {
  const sequence = next.version;
  const changedAt = next.closedAt ?? next.reconciledAt ?? next.resolvedAt ??
    next.claimedAt ?? next.signingStartedAt ?? next.approvedAt ?? next.preparedAt;
  const resultHash = next.responseHash ?? next.preflightReceiptHash ??
    next.founderApprovalHash ?? null;
  const core = {
    intentId: next.intentId,
    intentHash: next.intentHash,
    sequence,
    previousState: previous?.state ?? null,
    nextState: next.state,
    resultHash,
    changedAt,
    retryAllowed: false,
    secretsIncluded: false,
    schemaVersion: "hypercore_stable_execution_transition.v2"
  };
  const transitionHash = hashId("hypercore_stable_execution_transition", core);
  await client.query(
    `INSERT INTO hypercore_stable_execution_transitions(
       id, intent_id, intent_hash, sequence, previous_state, next_state,
       transition_hash, result_hash, changed_at, retry_allowed,
       secrets_included, schema_version
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,FALSE,$10)`,
    [
      `hypercore_stable_transition_${transitionHash.slice(2)}`,
      next.intentId,
      next.intentHash,
      sequence,
      previous?.state ?? null,
      next.state,
      transitionHash,
      resultHash,
      changedAt,
      core.schemaVersion
    ]
  );
}

async function persistIntent(client, previous, next) {
  verifyHypercoreStableExecutionIntent(next);
  const result = await client.query(
    `UPDATE hypercore_stable_execution_intents SET
       intent = $2::JSONB, state = $3, version = $4,
       founder_approval_id = $5, founder_approval_hash = $6,
       preflight_receipt_id = $7, preflight_receipt_hash = $8,
       action_authorization_hash = $9, request_body_hash = $10,
       signature_hash = $11, claim_hash = $12, disposition = $13,
       response_hash = $14, approved_at = $15, signing_started_at = $16,
       claimed_at = $17, resolved_at = $18, reconciled_at = $19,
       closed_at = $20, external_submission_attempted = $21
     WHERE id = $1 AND state = $22 AND version = $23
     RETURNING intent`,
    [
      next.intentId,
      JSON.stringify(next),
      next.state,
      next.version,
      next.founderApprovalId,
      next.founderApprovalHash,
      next.preflightReceiptId,
      next.preflightReceiptHash,
      next.actionAuthorizationHash,
      next.requestBodyHash,
      next.signatureHash,
      next.claimHash,
      next.disposition,
      next.responseHash,
      next.approvedAt,
      next.signingStartedAt,
      next.claimedAt,
      next.resolvedAt,
      next.reconciledAt,
      next.closedAt,
      next.externalSubmissionAttempted,
      previous.state,
      previous.version
    ]
  );
  if (result.rowCount !== 1) {
    fail("hypercore_stable_concurrency_denied", "stable intent changed concurrently");
  }
  await insertTransition(client, next, previous);
  return mapIntent(result.rows[0]);
}

export class PostgresHypercoreStableExecutionRepository {
  #events;

  constructor({ eventRepository, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 || !eventRepository ||
      typeof eventRepository.withTenantRead !== "function" ||
      typeof eventRepository.withTenantWrite !== "function"
    ) fail("invalid_hypercore_stable_repository", "Tenant PostgreSQL event repository required");
    this.#events = eventRepository;
  }

  async prepare({ draft, idempotencyKey, now = new Date() }) {
    if (!draft || typeof draft !== "object" || typeof idempotencyKey !== "string") {
      fail("invalid_hypercore_stable_repository_input", "closed stable draft is required");
    }
    const preparedAt = trustedDate("now", now);
    const idempotencyKeyHash = hashId("hypercore_stable_intent_idempotency", {
      idempotencyKey
    });
    return this.#events.withTenantWrite(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`hypercore_stable_intent:${idempotencyKeyHash}`]
      );
      const replay = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE idempotency_key_hash = $1 FOR UPDATE",
        [idempotencyKeyHash]
      );
      if (replay.rowCount === 1) {
        return { intent: mapIntent(replay.rows[0]), replayed: true };
      }
      const handoff = await client.query(
        `SELECT * FROM hypercore_testnet_signer_handoffs
          WHERE id = $1 FOR UPDATE`,
        [draft.handoffId]
      );
      if (
        handoff.rowCount !== 1 || handoff.rows[0].status !== "VERIFIED" ||
        preparedAt >= new Date(handoff.rows[0].expires_at)
      ) fail("hypercore_stable_handoff_denied", "verified signer handoff is unavailable");
      const head = await client.query(
        `INSERT INTO hypercore_testnet_nonce_heads(
           id, handoff_id, signer_reference_hash, last_nonce, version,
           updated_at, schema_version
         ) VALUES ($1,$2,$3,$4,1,$5,'hypercore_testnet_nonce_head.v1')
         ON CONFLICT (tenant_id, handoff_id) DO UPDATE SET
           last_nonce = GREATEST(hypercore_testnet_nonce_heads.last_nonce + 1,
             EXCLUDED.last_nonce),
           version = hypercore_testnet_nonce_heads.version + 1,
           updated_at = EXCLUDED.updated_at
         WHERE hypercore_testnet_nonce_heads.signer_reference_hash = EXCLUDED.signer_reference_hash
         RETURNING last_nonce`,
        [
          `hypercore_testnet_nonce_${draft.handoffId}`,
          draft.handoffId,
          draft.signerReferenceHash,
          preparedAt.getTime(),
          preparedAt.toISOString()
        ]
      );
      if (head.rowCount !== 1) {
        fail("hypercore_stable_nonce_denied", "durable signer nonce binding drifted");
      }
      const intent = createHypercoreStableExecutionIntent({
        ...draft,
        idempotencyKey,
        nonce: Number(head.rows[0].last_nonce),
        preparedAt,
        approvalExpiresAt: new Date(Math.min(
          preparedAt.getTime() + 30 * 60_000,
          new Date(handoff.rows[0].expires_at).getTime()
        ))
      });
      await client.query(
        `INSERT INTO hypercore_stable_execution_intents(
           id, intent_hash, economic_action_hash, idempotency_key_hash,
           handoff_id, signer_reference_hash, nonce, intent, state, version,
           founder_approval_id, founder_approval_hash, preflight_receipt_id,
           preflight_receipt_hash, action_authorization_hash, request_body_hash,
           signature_hash, claim_hash, disposition, response_hash, prepared_at,
           approval_expires_at, approved_at, signing_started_at, claimed_at,
           resolved_at, reconciled_at, closed_at, external_submission_attempted,
           retry_allowed, raw_action_persisted, raw_response_persisted,
           raw_key_persisted, raw_signature_persisted, mainnet_authority,
           production_authority, real_funds_authority, schema_version
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8::JSONB,$9,$10,$11,$12,$13,$14,$15,$16,$17,
           $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,FALSE,FALSE,FALSE,
           FALSE,FALSE,FALSE,FALSE,FALSE,$30
         )`,
        [
          intent.intentId, intent.intentHash, intent.economicActionHash,
          intent.idempotencyKeyHash, intent.handoffId, intent.signerReferenceHash,
          intent.nonce, JSON.stringify(intent), intent.state, intent.version,
          intent.founderApprovalId, intent.founderApprovalHash,
          intent.preflightReceiptId, intent.preflightReceiptHash,
          intent.actionAuthorizationHash, intent.requestBodyHash,
          intent.signatureHash, intent.claimHash, intent.disposition,
          intent.responseHash, intent.preparedAt, intent.approvalExpiresAt,
          intent.approvedAt, intent.signingStartedAt, intent.claimedAt,
          intent.resolvedAt, intent.reconciledAt, intent.closedAt,
          intent.externalSubmissionAttempted, intent.schemaVersion
        ]
      );
      await insertTransition(client, intent, null);
      return { intent, replayed: false };
    });
  }

  async prepareCancel({ draft, idempotencyKey, now = new Date() }) {
    if (!draft || typeof draft !== "object" || typeof idempotencyKey !== "string") {
      fail("invalid_hypercore_stable_repository_input", "closed cancel draft is required");
    }
    verifyHypercoreStableCancelTarget(draft.targetOrder);
    const preparedAt = trustedDate("now", now);
    const idempotencyKeyHash = hashId("hypercore_stable_intent_idempotency", {
      idempotencyKey
    });
    return this.#events.withTenantWrite(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`hypercore_stable_cancel_intent:${idempotencyKeyHash}`]
      );
      const replay = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE idempotency_key_hash = $1 FOR UPDATE",
        [idempotencyKeyHash]
      );
      if (replay.rowCount === 1) {
        const intent = mapIntent(replay.rows[0]);
        if (intent.schemaVersion !== HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION) {
          fail("hypercore_stable_cancel_replay_denied", "idempotency identity belongs to another action");
        }
        return { intent, replayed: true };
      }

      const parentResult = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE id = $1 FOR UPDATE",
        [draft.parentIntentId]
      );
      if (parentResult.rowCount !== 1) {
        fail("hypercore_stable_cancel_parent_denied", "confirmed parent intent is unavailable");
      }
      const parent = mapIntent(parentResult.rows[0]);
      const order = parent.hyperliquidAction?.orders?.[0];
      if (
        parent.schemaVersion !== "hypercore_stable_execution_intent.v2" ||
        parent.intentHash !== draft.parentIntentHash || parent.state !== "SUBMITTED" ||
        parent.disposition !== "confirmed" || parent.externalSubmissionAttempted !== true ||
        parent.retryAllowed !== false || parent.actionKind !== "order" ||
        parent.facilityId !== draft.facilityId || parent.facilityHash !== draft.facilityHash ||
        parent.accountBindingId !== draft.accountBindingId ||
        parent.accountBindingHash !== draft.accountBindingHash ||
        parent.canonicalAccountAddressHash !== draft.canonicalAccountAddressHash ||
        parent.handoffId !== draft.handoffId || parent.handoffHash !== draft.handoffHash ||
        parent.delegateId !== draft.delegateId || parent.delegateHash !== draft.delegateHash ||
        parent.apiWalletAddressHash !== draft.apiWalletAddressHash ||
        parent.signerReferenceHash !== draft.signerReferenceHash ||
        !order || order.a !== 3 || order.b !== true || order.r !== false ||
        Number(order.p) !== Number(draft.targetOrder.limitPx) ||
        Number(order.s) !== Number(draft.targetOrder.size) ||
        order.c !== draft.targetOrder.cloid
      ) fail("hypercore_stable_cancel_parent_denied", "parent order binding drifted");

      const priorAttempt = await client.query(
        `SELECT id FROM hypercore_stable_execution_intents
          WHERE parent_intent_id = $1 AND external_submission_attempted = TRUE
          FOR UPDATE`,
        [parent.intentId]
      );
      if (priorAttempt.rowCount !== 0) {
        fail("hypercore_stable_cancel_already_attempted", "parent already has a cancel submission");
      }
      const handoff = await client.query(
        `SELECT * FROM hypercore_testnet_signer_handoffs
          WHERE id = $1 FOR UPDATE`,
        [draft.handoffId]
      );
      if (handoff.rowCount !== 1 || handoff.rows[0].status !== "VERIFIED" ||
        preparedAt >= new Date(handoff.rows[0].expires_at)) {
        fail("hypercore_stable_handoff_denied", "verified signer handoff is unavailable");
      }
      const head = await client.query(
        `INSERT INTO hypercore_testnet_nonce_heads(
           id, handoff_id, signer_reference_hash, last_nonce, version,
           updated_at, schema_version
         ) VALUES ($1,$2,$3,$4,1,$5,'hypercore_testnet_nonce_head.v1')
         ON CONFLICT (tenant_id, handoff_id) DO UPDATE SET
           last_nonce = GREATEST(hypercore_testnet_nonce_heads.last_nonce + 1,
             EXCLUDED.last_nonce),
           version = hypercore_testnet_nonce_heads.version + 1,
           updated_at = EXCLUDED.updated_at
         WHERE hypercore_testnet_nonce_heads.signer_reference_hash = EXCLUDED.signer_reference_hash
         RETURNING last_nonce`,
        [
          `hypercore_testnet_nonce_${draft.handoffId}`,
          draft.handoffId,
          draft.signerReferenceHash,
          preparedAt.getTime(),
          preparedAt.toISOString()
        ]
      );
      if (head.rowCount !== 1) {
        fail("hypercore_stable_nonce_denied", "durable signer nonce binding drifted");
      }
      const intent = createHypercoreStableCancelExecutionIntent({
        ...draft,
        idempotencyKey,
        nonce: Number(head.rows[0].last_nonce),
        preparedAt,
        approvalExpiresAt: new Date(Math.min(
          preparedAt.getTime() + 30 * 60_000,
          new Date(handoff.rows[0].expires_at).getTime()
        ))
      });
      await client.query(
        `INSERT INTO hypercore_stable_execution_intents(
           id, intent_hash, economic_action_hash, idempotency_key_hash,
           handoff_id, signer_reference_hash, nonce, intent, state, version,
           founder_approval_id, founder_approval_hash, preflight_receipt_id,
           preflight_receipt_hash, action_authorization_hash, request_body_hash,
           signature_hash, claim_hash, disposition, response_hash, prepared_at,
           approval_expires_at, approved_at, signing_started_at, claimed_at,
           resolved_at, reconciled_at, closed_at, external_submission_attempted,
           retry_allowed, raw_action_persisted, raw_response_persisted,
           raw_key_persisted, raw_signature_persisted, mainnet_authority,
           production_authority, real_funds_authority, schema_version,
           action_kind, parent_intent_id, parent_intent_hash, target_order_hash,
           target_client_order_id, target_venue_order_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8::JSONB,$9,$10,$11,$12,$13,$14,$15,$16,$17,
           $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,FALSE,FALSE,FALSE,
           FALSE,FALSE,FALSE,FALSE,FALSE,$30,$31,$32,$33,$34,$35,$36
         )`,
        [
          intent.intentId, intent.intentHash, intent.economicActionHash,
          intent.idempotencyKeyHash, intent.handoffId, intent.signerReferenceHash,
          intent.nonce, JSON.stringify(intent), intent.state, intent.version,
          intent.founderApprovalId, intent.founderApprovalHash,
          intent.preflightReceiptId, intent.preflightReceiptHash,
          intent.actionAuthorizationHash, intent.requestBodyHash,
          intent.signatureHash, intent.claimHash, intent.disposition,
          intent.responseHash, intent.preparedAt, intent.approvalExpiresAt,
          intent.approvedAt, intent.signingStartedAt, intent.claimedAt,
          intent.resolvedAt, intent.reconciledAt, intent.closedAt,
          intent.externalSubmissionAttempted, intent.schemaVersion,
          intent.actionKind, intent.parentIntentId, intent.parentIntentHash,
          intent.targetOrderHash, intent.targetOrder.cloid,
          intent.targetOrder.venueOrderId
        ]
      );
      await insertTransition(client, intent, null);
      return { intent, replayed: false };
    });
  }

  async approve({ intentId, approval }) {
    identifier("intentId", intentId);
    verifyHypercoreStableFounderApproval(approval);
    return this.#events.withTenantWrite(async (client) => {
      const result = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE id = $1 FOR UPDATE",
        [intentId]
      );
      if (result.rowCount !== 1) fail("hypercore_stable_intent_unavailable", "intent missing");
      const current = mapIntent(result.rows[0]);
      const next = approveHypercoreStableExecutionIntent({ intent: current, approval });
      await client.query(
        `INSERT INTO hypercore_stable_founder_approvals(
           id, approval_hash, intent_id, intent_hash, confirmation_nonce_hash,
           approval, status, approved_at, expires_at, consumed_at, version,
           schema_version
         ) VALUES ($1,$2,$3,$4,$5,$6::JSONB,$7,$8,$9,$10,$11,$12)`,
        [
          approval.approvalId, approval.approvalHash, approval.intentId,
          approval.intentHash, approval.confirmationNonceHash,
          JSON.stringify(approval), approval.status, approval.approvedAt,
          approval.expiresAt, approval.consumedAt, approval.version,
          approval.schemaVersion
        ]
      );
      return persistIntent(client, current, next);
    });
  }

  async beginSigning({ intentId, approval, receipt, signingRequest, now = new Date() }) {
    identifier("intentId", intentId);
    return this.#events.withTenantWrite(async (client) => {
      const result = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE id = $1 FOR UPDATE",
        [intentId]
      );
      if (result.rowCount !== 1) fail("hypercore_stable_intent_unavailable", "intent missing");
      const current = mapIntent(result.rows[0]);
      const next = beginHypercoreJitSigning({
        intent: current, approval, receipt, signingRequest, now
      });
      await client.query(
        `INSERT INTO hypercore_jit_venue_preflight_receipts(
           id, receipt_hash, intent_id, intent_hash, approval_hash,
           risk_snapshot_hash, metadata_hash, receipt, observed_at, expires_at,
           schema_version
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::JSONB,$9,$10,$11)`,
        [
          receipt.receiptId, receipt.receiptHash, receipt.intentId,
          receipt.intentHash, receipt.approvalHash, receipt.riskSnapshotHash,
          receipt.metadataHash, JSON.stringify(receipt), receipt.observedAt,
          receipt.expiresAt, receipt.schemaVersion
        ]
      );
      const consumed = {
        ...structuredClone(approval),
        status: "CONSUMED",
        consumedAt: next.signingStartedAt,
        version: 2
      };
      verifyHypercoreStableFounderApproval(consumed);
      const approvalResult = await client.query(
        `UPDATE hypercore_stable_founder_approvals SET
           approval = $2::JSONB, status = 'CONSUMED', consumed_at = $3, version = 2
         WHERE id = $1 AND status = 'APPROVED' AND version = 1`,
        [approval.approvalId, JSON.stringify(consumed), next.signingStartedAt]
      );
      if (approvalResult.rowCount !== 1) {
        fail("hypercore_stable_approval_consumed", "stable approval unavailable");
      }
      return persistIntent(client, current, next);
    });
  }

  async claim({ intentId, authorization, envelope, claimHash, now = new Date() }) {
    identifier("intentId", intentId);
    verifyHypercoreJitActionAuthorization(authorization);
    return this.#events.withTenantWrite(async (client) => {
      const result = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE id = $1 FOR UPDATE",
        [intentId]
      );
      if (result.rowCount !== 1) fail("hypercore_stable_intent_unavailable", "intent missing");
      const current = mapIntent(result.rows[0]);
      const next = claimHypercoreStableExecutionIntent({
        intent: current, authorization, envelope, claimHash, now
      });
      return persistIntent(client, current, next);
    });
  }

  async resolve({ intentId, result, now = new Date() }) {
    identifier("intentId", intentId);
    return this.#events.withTenantWrite(async (client) => {
      const currentResult = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE id = $1 FOR UPDATE",
        [intentId]
      );
      if (currentResult.rowCount !== 1) {
        fail("hypercore_stable_intent_unavailable", "intent missing");
      }
      const current = mapIntent(currentResult.rows[0]);
      return persistIntent(client, current, resolveHypercoreStableExecutionIntent({
        intent: current, result, now
      }));
    });
  }

  async abortSigning({ intentId, reasonHash, now = new Date() }) {
    identifier("intentId", intentId);
    return this.#events.withTenantWrite(async (client) => {
      const result = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE id = $1 FOR UPDATE",
        [intentId]
      );
      if (result.rowCount !== 1) fail("hypercore_stable_intent_unavailable", "intent missing");
      const current = mapIntent(result.rows[0]);
      return persistIntent(client, current, abortHypercoreStableExecutionSigning({
        intent: current, reasonHash, now
      }));
    });
  }

  async recoverUnknown({ intentId, reasonHash, now = new Date() }) {
    identifier("intentId", intentId);
    return this.#events.withTenantWrite(async (client) => {
      const result = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE id = $1 FOR UPDATE",
        [intentId]
      );
      if (result.rowCount !== 1) fail("hypercore_stable_intent_unavailable", "intent missing");
      const current = mapIntent(result.rows[0]);
      return persistIntent(client, current, recoverHypercoreStableExecutionUnknown({
        intent: current, reasonHash, now
      }));
    });
  }

  async reconcile({ intentId, now = new Date(), ...hashes }) {
    identifier("intentId", intentId);
    return this.#events.withTenantWrite(async (client) => {
      const result = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE id = $1 FOR UPDATE",
        [intentId]
      );
      if (result.rowCount !== 1) fail("hypercore_stable_intent_unavailable", "intent missing");
      const current = mapIntent(result.rows[0]);
      return persistIntent(client, current, reconcileHypercoreStableExecutionIntent({
        intent: current,
        now,
        ...hashes
      }));
    });
  }

  async close({ intentId, now = new Date() }) {
    identifier("intentId", intentId);
    return this.#events.withTenantWrite(async (client) => {
      const result = await client.query(
        `SELECT i.intent, h.status AS handoff_status,
                h.retirement_evidence_hash,
                d.status AS delegate_status,
                t.tombstone_hash
           FROM hypercore_stable_execution_intents i
           JOIN hypercore_testnet_signer_handoffs h
             ON h.tenant_id = i.tenant_id AND h.id = i.handoff_id
           JOIN hypercore_api_wallet_delegates d
             ON d.tenant_id = i.tenant_id AND d.id = (i.intent->>'delegateId')
           JOIN hypercore_delegate_tombstones t
             ON t.tenant_id = d.tenant_id AND t.delegate_id = d.id
          WHERE i.id = $1
          FOR UPDATE OF i, h, d, t`,
        [intentId]
      );
      if (result.rowCount !== 1) {
        fail("hypercore_stable_close_denied", "retirement closure is unavailable");
      }
      const row = result.rows[0];
      if (row.handoff_status !== "RETIRED" || row.delegate_status !== "RETIRED" ||
        typeof row.retirement_evidence_hash !== "string" ||
        typeof row.tombstone_hash !== "string") {
        fail("hypercore_stable_close_denied", "retired signer and delegate proof is required");
      }
      const current = mapIntent(row);
      return persistIntent(client, current, closeHypercoreStableExecutionIntent({
        intent: current,
        signerRetirementHash: row.retirement_evidence_hash,
        now
      }));
    });
  }

  async find(intentId) {
    identifier("intentId", intentId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE id = $1",
        [intentId]
      );
      return result.rowCount === 1 ? mapIntent(result.rows[0]) : undefined;
    });
  }

  async findByHash(intentHash) {
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        "SELECT intent FROM hypercore_stable_execution_intents WHERE intent_hash = $1",
        [intentHash]
      );
      return result.rowCount === 1 ? mapIntent(result.rows[0]) : undefined;
    });
  }

  async findApproval(intentId) {
    identifier("intentId", intentId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        "SELECT approval FROM hypercore_stable_founder_approvals WHERE intent_id = $1",
        [intentId]
      );
      return result.rowCount === 1 ? mapApproval(result.rows[0]) : undefined;
    });
  }

  async findPreflight(intentId) {
    identifier("intentId", intentId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        "SELECT receipt FROM hypercore_jit_venue_preflight_receipts WHERE intent_id = $1",
        [intentId]
      );
      return result.rowCount === 1 ? mapReceipt(result.rows[0]) : undefined;
    });
  }
}
