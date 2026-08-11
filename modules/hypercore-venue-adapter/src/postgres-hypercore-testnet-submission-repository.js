import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  HypercoreTestnetFounderApprovalStatus,
  HypercoreTestnetSignerHandoffStatus,
  approveHypercoreTestnetSubmissionAttempt,
  claimHypercoreTestnetSubmissionAttempt,
  closeHypercoreTestnetSubmissionAttempt,
  createHypercoreTestnetSubmissionAttempt,
  reconcileHypercoreTestnetSubmissionAttempt,
  recoverHypercoreTestnetSubmissionUnknown,
  resolveHypercoreTestnetSubmissionAttempt,
  verifyHypercoreTestnetFounderApproval,
  verifyHypercoreTestnetSignerHandoff,
  verifyHypercoreTestnetSubmissionAttempt
} from "./hypercore-durable-submission.js";
import {
  verifyHypercoreAccountBinding,
  verifyHypercoreDelegate
} from "./hypercore-delegate.js";

const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;

function fail(code, message) {
  throw new DomainError(code, message);
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hypercore_testnet_submission_repository_input", `${name} is invalid`);
  }
  return value;
}

function bytes32(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail(
      "invalid_hypercore_testnet_submission_repository_input",
      `${name} must be bytes32`
    );
  }
  return value;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail(
      "invalid_hypercore_testnet_submission_repository_input",
      `${name} must be trusted`
    );
  }
  return new Date(value.getTime());
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function boolean(value) {
  return value === true;
}

function number(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    fail("invalid_hypercore_testnet_submission_row", "numeric value is unsafe");
  }
  return parsed;
}

function freeze(value) {
  return Object.freeze(structuredClone(value));
}

function mapHandoff(row) {
  if (!row) return undefined;
  return freeze({
    handoffId: row.id,
    handoffHash: row.handoff_hash,
    accountBindingId: row.account_binding_id,
    accountBindingHash: row.account_binding_hash,
    canonicalAccountAddressHash: row.canonical_account_address_hash,
    delegateId: row.delegate_id,
    delegateHash: row.delegate_hash,
    apiWalletAddressHash: row.api_wallet_address_hash,
    signerReferenceHash: row.signer_reference_hash,
    registrationEvidenceHash: row.registration_evidence_hash,
    status: row.status,
    verifiedAt: iso(row.verified_at),
    expiresAt: iso(row.expires_at),
    retiredAt: row.retired_at ? iso(row.retired_at) : null,
    retirementEvidenceHash: row.retirement_evidence_hash,
    version: number(row.version),
    rawAddressPersisted: boolean(row.raw_address_persisted),
    rawKeyAccepted: boolean(row.raw_key_accepted),
    rawKeyPersisted: boolean(row.raw_key_persisted),
    rawSignaturePersisted: boolean(row.raw_signature_persisted),
    mainnetAuthority: boolean(row.mainnet_authority),
    productionAuthority: boolean(row.production_authority),
    realFundsAuthority: boolean(row.real_funds_authority),
    schemaVersion: row.schema_version
  });
}

function mapApproval(row) {
  if (!row) return undefined;
  return freeze({
    approvalId: row.id,
    approvalHash: row.approval_hash,
    executionId: row.execution_id,
    executionHash: row.execution_hash,
    economicActionHash: row.economic_action_hash,
    actorId: row.actor_id,
    confirmationNonceHash: row.confirmation_nonce_hash,
    humanConfirmationHash: row.human_confirmation_hash,
    accountBindingHash: row.account_binding_hash,
    canonicalAccountAddressHash: row.canonical_account_address_hash,
    handoffHash: row.handoff_hash,
    delegateHash: row.delegate_hash,
    apiWalletAddressHash: row.api_wallet_address_hash,
    signerReferenceHash: row.signer_reference_hash,
    preparedActionHash: row.prepared_action_hash,
    policyHash: row.policy_hash,
    metadataHash: row.metadata_hash,
    riskSnapshotHash: row.risk_snapshot_hash,
    actionKind: row.action_kind,
    market: row.market,
    maxOrderNotionalUsd: row.max_order_notional_usd,
    openingTimeInForce: row.opening_time_in_force,
    nonce: number(row.nonce),
    status: row.status,
    approvedAt: iso(row.approved_at),
    expiresAt: iso(row.expires_at),
    consumedAt: row.consumed_at ? iso(row.consumed_at) : null,
    version: number(row.version),
    exactExecutionOnly: boolean(row.exact_execution_only),
    oneUse: boolean(row.one_use),
    mainnetAuthority: boolean(row.mainnet_authority),
    productionAuthority: boolean(row.production_authority),
    realFundsAuthority: boolean(row.real_funds_authority),
    schemaVersion: row.schema_version
  });
}

function mapAttempt(row) {
  if (!row) return undefined;
  return freeze({
    executionId: row.id,
    executionHash: row.execution_hash,
    economicActionHash: row.economic_action_hash,
    idempotencyKeyHash: row.idempotency_key_hash,
    facilityId: row.facility_id,
    accountBindingId: row.account_binding_id,
    accountBindingHash: row.account_binding_hash,
    canonicalAccountAddressHash: row.canonical_account_address_hash,
    handoffId: row.handoff_id,
    handoffHash: row.handoff_hash,
    delegateId: row.delegate_id,
    delegateHash: row.delegate_hash,
    apiWalletAddressHash: row.api_wallet_address_hash,
    signerReferenceHash: row.signer_reference_hash,
    preparedActionHash: row.prepared_action_hash,
    preparedAction: row.prepared_action,
    policyHash: row.policy_hash,
    metadataHash: row.metadata_hash,
    riskSnapshotHash: row.risk_snapshot_hash,
    actionKind: row.action_kind,
    market: row.market,
    maxOrderNotionalUsd: row.max_order_notional_usd,
    openingTimeInForce: row.opening_time_in_force,
    nonce: number(row.nonce),
    founderApprovalId: row.founder_approval_id,
    founderApprovalHash: row.founder_approval_hash,
    humanConfirmationHash: row.human_confirmation_hash,
    actionAuthorizationHash: row.action_authorization_hash,
    requestBodyHash: row.request_body_hash,
    signatureHash: row.signature_hash,
    claimHash: row.claim_hash,
    disposition: row.disposition,
    responseHash: row.response_hash,
    reconciliationHash: row.reconciliation_hash,
    venueOrderStateHash: row.venue_order_state_hash,
    venueAccountStateHash: row.venue_account_state_hash,
    ledgerStateHash: row.ledger_state_hash,
    obligationEvidenceHash: row.obligation_evidence_hash,
    signerRetirementHash: row.signer_retirement_hash,
    state: row.state,
    version: number(row.version),
    preparedAt: iso(row.prepared_at),
    expiresAt: iso(row.expires_at),
    approvedAt: row.approved_at ? iso(row.approved_at) : null,
    claimedAt: row.claimed_at ? iso(row.claimed_at) : null,
    resolvedAt: row.resolved_at ? iso(row.resolved_at) : null,
    reconciledAt: row.reconciled_at ? iso(row.reconciled_at) : null,
    closedAt: row.closed_at ? iso(row.closed_at) : null,
    externalSubmissionAttempted: boolean(row.external_submission_attempted),
    retryAllowed: boolean(row.retry_allowed),
    rawActionEvidencePersisted: boolean(row.raw_action_evidence_persisted),
    rawResponsePersisted: boolean(row.raw_response_persisted),
    rawKeyPersisted: boolean(row.raw_key_persisted),
    rawSignaturePersisted: boolean(row.raw_signature_persisted),
    mainnetAuthority: boolean(row.mainnet_authority),
    productionAuthority: boolean(row.production_authority),
    realFundsAuthority: boolean(row.real_funds_authority),
    schemaVersion: row.schema_version
  });
}

function transitionResultHash(attempt) {
  return attempt.signerRetirementHash ??
    attempt.reconciliationHash ??
    attempt.responseHash ??
    attempt.claimHash ??
    attempt.founderApprovalHash;
}

async function insertTransition(client, attempt, previousState) {
  const core = {
    executionHash: attempt.executionHash,
    sequence: attempt.version,
    previousState,
    nextState: attempt.state,
    resultHash: transitionResultHash(attempt),
    changedAt: attempt.closedAt ?? attempt.reconciledAt ?? attempt.resolvedAt ??
      attempt.claimedAt ?? attempt.approvedAt ?? attempt.preparedAt
  };
  const transitionHash = hashId("hypercore_testnet_submission_transition", core);
  await client.query(
    `INSERT INTO hypercore_testnet_submission_transitions(
       id, execution_id, execution_hash, sequence, previous_state, next_state,
       transition_hash, result_hash, changed_at, retry_allowed,
       secrets_included, schema_version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, FALSE,
       'hypercore_testnet_submission_transition.v1')`,
    [
      `hypercore_testnet_transition_${transitionHash.slice(2)}`,
      attempt.executionId,
      attempt.executionHash,
      attempt.version,
      previousState,
      attempt.state,
      transitionHash,
      core.resultHash,
      core.changedAt
    ]
  );
}

async function persistAttemptTransition(client, current, next) {
  const result = await client.query(
    `UPDATE hypercore_testnet_submission_attempts SET
       founder_approval_id = $2, founder_approval_hash = $3,
       human_confirmation_hash = $4, action_authorization_hash = $5,
       request_body_hash = $6, signature_hash = $7, claim_hash = $8,
       disposition = $9, response_hash = $10, reconciliation_hash = $11,
       venue_order_state_hash = $12, venue_account_state_hash = $13,
       ledger_state_hash = $14, obligation_evidence_hash = $15,
       signer_retirement_hash = $16, state = $17, version = $18,
       approved_at = $19, claimed_at = $20, resolved_at = $21,
       reconciled_at = $22, closed_at = $23,
       external_submission_attempted = $24
     WHERE id = $1 AND state = $25 AND version = $26`,
    [
      next.executionId,
      next.founderApprovalId,
      next.founderApprovalHash,
      next.humanConfirmationHash,
      next.actionAuthorizationHash,
      next.requestBodyHash,
      next.signatureHash,
      next.claimHash,
      next.disposition,
      next.responseHash,
      next.reconciliationHash,
      next.venueOrderStateHash,
      next.venueAccountStateHash,
      next.ledgerStateHash,
      next.obligationEvidenceHash,
      next.signerRetirementHash,
      next.state,
      next.version,
      next.approvedAt,
      next.claimedAt,
      next.resolvedAt,
      next.reconciledAt,
      next.closedAt,
      next.externalSubmissionAttempted,
      current.state,
      current.version
    ]
  );
  if (result.rowCount !== 1) {
    fail("hypercore_testnet_submission_concurrency_conflict", "attempt transition lost its lock");
  }
  await insertTransition(client, next, current.state);
  return next;
}

export class PostgresHypercoreTestnetSubmissionRepository {
  #events;

  constructor({ eventRepository, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !eventRepository ||
      typeof eventRepository.withTenantWrite !== "function" ||
      typeof eventRepository.withTenantRead !== "function"
    ) {
      fail(
        "invalid_hypercore_testnet_submission_repository",
        "a tenant-scoped PostgreSQL Event Repository is required"
      );
    }
    this.#events = eventRepository;
  }

  async recordSignerHandoff(handoff) {
    verifyHypercoreTestnetSignerHandoff(handoff);
    return this.#events.withTenantWrite(async (client) => {
      const existing = await client.query(
        "SELECT * FROM hypercore_testnet_signer_handoffs WHERE id = $1 FOR UPDATE",
        [handoff.handoffId]
      );
      if (existing.rowCount === 1) {
        const current = mapHandoff(existing.rows[0]);
        if (current.handoffHash !== handoff.handoffHash) {
          fail("hypercore_testnet_signer_handoff_conflict", "handoff identity drifted");
        }
        return current;
      }
      await client.query(
        `INSERT INTO hypercore_testnet_signer_handoffs(
           id, handoff_hash, account_binding_id, account_binding_hash,
           canonical_account_address_hash, delegate_id, delegate_hash,
           api_wallet_address_hash, signer_reference_hash,
           registration_evidence_hash, status, verified_at, expires_at,
           retired_at, retirement_evidence_hash, version,
           raw_address_persisted, raw_key_accepted, raw_key_persisted,
           raw_signature_persisted, mainnet_authority, production_authority,
           real_funds_authority, schema_version
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
           $17,$18,$19,$20,$21,$22,$23,$24
         )`,
        [
          handoff.handoffId, handoff.handoffHash, handoff.accountBindingId,
          handoff.accountBindingHash, handoff.canonicalAccountAddressHash,
          handoff.delegateId, handoff.delegateHash, handoff.apiWalletAddressHash,
          handoff.signerReferenceHash, handoff.registrationEvidenceHash,
          handoff.status, handoff.verifiedAt, handoff.expiresAt, handoff.retiredAt,
          handoff.retirementEvidenceHash, handoff.version,
          handoff.rawAddressPersisted, handoff.rawKeyAccepted,
          handoff.rawKeyPersisted, handoff.rawSignaturePersisted,
          handoff.mainnetAuthority, handoff.productionAuthority,
          handoff.realFundsAuthority, handoff.schemaVersion
        ]
      );
      return handoff;
    });
  }

  async prepare({
    binding,
    handoffId,
    policy,
    preparedAction,
    idempotencyKey,
    now = new Date()
  }) {
    verifyHypercoreAccountBinding(binding);
    identifier("handoffId", handoffId);
    if (typeof idempotencyKey !== "string") {
      fail("invalid_hypercore_testnet_submission_repository_input", "idempotencyKey is invalid");
    }
    const idempotencyKeyHash = hashId("hypercore_testnet_submission_idempotency", {
      idempotencyKey
    });
    const trustedNow = trustedDate("now", now);
    return this.#events.withTenantWrite(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`hypercore_testnet_submission:${idempotencyKeyHash}`]
      );
      const replay = await client.query(
        "SELECT * FROM hypercore_testnet_submission_attempts WHERE idempotency_key_hash = $1 FOR UPDATE",
        [idempotencyKeyHash]
      );
      if (replay.rowCount === 1) return { attempt: mapAttempt(replay.rows[0]), replayed: true };

      const handoffResult = await client.query(
        `SELECT h.*, d.delegate, b.binding
           FROM hypercore_testnet_signer_handoffs h
           JOIN hypercore_api_wallet_delegates d
             ON d.tenant_id = h.tenant_id AND d.id = h.delegate_id
           JOIN hypercore_account_bindings b
             ON b.tenant_id = h.tenant_id AND b.id = h.account_binding_id
          WHERE h.id = $1 FOR UPDATE OF h, d, b`,
        [handoffId]
      );
      if (handoffResult.rowCount !== 1) {
        fail("hypercore_testnet_signer_handoff_unavailable", "signer handoff is unavailable");
      }
      const row = handoffResult.rows[0];
      const handoff = mapHandoff(row);
      verifyHypercoreTestnetSignerHandoff(handoff);
      verifyHypercoreDelegate(row.delegate);
      verifyHypercoreAccountBinding(row.binding);
      if (
        handoff.status !== HypercoreTestnetSignerHandoffStatus.VERIFIED ||
        handoff.accountBindingId !== binding.accountBindingId ||
        row.binding.accountBindingHash !== binding.accountBindingHash ||
        row.delegate.delegateHash !== handoff.delegateHash
      ) {
        fail("hypercore_testnet_signer_handoff_unavailable", "signer handoff drifted");
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
          `hypercore_testnet_nonce_${handoff.handoffId}`,
          handoff.handoffId,
          handoff.signerReferenceHash,
          trustedNow.getTime(),
          trustedNow.toISOString()
        ]
      );
      if (head.rowCount !== 1) {
        fail("hypercore_testnet_nonce_binding_conflict", "nonce head binding drifted");
      }
      const attempt = createHypercoreTestnetSubmissionAttempt({
        binding,
        handoff,
        policy,
        preparedAction,
        idempotencyKey,
        nonce: number(head.rows[0].last_nonce),
        now: trustedNow,
        expiresAt: new Date(Math.min(
          trustedNow.getTime() + policy.proofWindowMs,
          new Date(handoff.expiresAt).getTime(),
          new Date(policy.expiresAt).getTime()
        ))
      });
      await client.query(
        `INSERT INTO hypercore_testnet_submission_attempts(
           id, execution_hash, economic_action_hash, idempotency_key_hash,
           facility_id, account_binding_id, account_binding_hash,
           canonical_account_address_hash, handoff_id, handoff_hash,
           delegate_id, delegate_hash, api_wallet_address_hash,
           signer_reference_hash, prepared_action_hash, prepared_action,
           policy_hash, metadata_hash, risk_snapshot_hash, action_kind,
           market, max_order_notional_usd, opening_time_in_force, nonce,
           founder_approval_id, founder_approval_hash, human_confirmation_hash,
           action_authorization_hash, request_body_hash, signature_hash,
           claim_hash, disposition, response_hash, reconciliation_hash,
           venue_order_state_hash, venue_account_state_hash, ledger_state_hash,
           obligation_evidence_hash, signer_retirement_hash, state, version,
           prepared_at, expires_at, approved_at, claimed_at, resolved_at,
           reconciled_at, closed_at, external_submission_attempted,
           retry_allowed, raw_action_evidence_persisted,
           raw_response_persisted, raw_key_persisted, raw_signature_persisted,
           mainnet_authority, production_authority, real_funds_authority,
           schema_version
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::JSONB,
           $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
           $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,
           $49,$50,$51,$52,$53,$54,$55,$56,$57,$58
         )`,
        [
          attempt.executionId, attempt.executionHash, attempt.economicActionHash,
          attempt.idempotencyKeyHash, attempt.facilityId, attempt.accountBindingId,
          attempt.accountBindingHash, attempt.canonicalAccountAddressHash,
          attempt.handoffId, attempt.handoffHash, attempt.delegateId,
          attempt.delegateHash, attempt.apiWalletAddressHash,
          attempt.signerReferenceHash, attempt.preparedActionHash,
          JSON.stringify(attempt.preparedAction), attempt.policyHash,
          attempt.metadataHash, attempt.riskSnapshotHash, attempt.actionKind,
          attempt.market, attempt.maxOrderNotionalUsd, attempt.openingTimeInForce,
          attempt.nonce, attempt.founderApprovalId, attempt.founderApprovalHash,
          attempt.humanConfirmationHash, attempt.actionAuthorizationHash,
          attempt.requestBodyHash, attempt.signatureHash, attempt.claimHash,
          attempt.disposition, attempt.responseHash, attempt.reconciliationHash,
          attempt.venueOrderStateHash, attempt.venueAccountStateHash,
          attempt.ledgerStateHash, attempt.obligationEvidenceHash,
          attempt.signerRetirementHash, attempt.state, attempt.version,
          attempt.preparedAt, attempt.expiresAt, attempt.approvedAt,
          attempt.claimedAt, attempt.resolvedAt, attempt.reconciledAt,
          attempt.closedAt, attempt.externalSubmissionAttempted,
          attempt.retryAllowed, attempt.rawActionEvidencePersisted,
          attempt.rawResponsePersisted, attempt.rawKeyPersisted,
          attempt.rawSignaturePersisted, attempt.mainnetAuthority,
          attempt.productionAuthority, attempt.realFundsAuthority,
          attempt.schemaVersion
        ]
      );
      await insertTransition(client, attempt, null);
      return { attempt, replayed: false };
    });
  }

  async approve({ executionId, approval }) {
    identifier("executionId", executionId);
    verifyHypercoreTestnetFounderApproval(approval);
    return this.#events.withTenantWrite(async (client) => {
      const currentResult = await client.query(
        "SELECT * FROM hypercore_testnet_submission_attempts WHERE id = $1 FOR UPDATE",
        [executionId]
      );
      if (currentResult.rowCount !== 1) fail("hypercore_testnet_execution_unavailable", "attempt missing");
      const current = mapAttempt(currentResult.rows[0]);
      if (current.state === "APPROVED" && current.founderApprovalHash === approval.approvalHash) {
        return current;
      }
      const next = approveHypercoreTestnetSubmissionAttempt({ attempt: current, approval });
      await client.query(
        `INSERT INTO hypercore_testnet_founder_approvals(
           id, approval_hash, execution_id, execution_hash,
           economic_action_hash, actor_id, confirmation_nonce_hash,
           human_confirmation_hash, account_binding_hash,
           canonical_account_address_hash, handoff_hash, delegate_hash,
           api_wallet_address_hash, signer_reference_hash, prepared_action_hash,
           policy_hash, metadata_hash, risk_snapshot_hash, action_kind, market,
           max_order_notional_usd, opening_time_in_force, nonce, status,
           approved_at, expires_at, consumed_at, version, exact_execution_only,
           one_use, mainnet_authority, production_authority,
           real_funds_authority, schema_version
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
           $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
         )`,
        [
          approval.approvalId, approval.approvalHash, approval.executionId,
          approval.executionHash, approval.economicActionHash, approval.actorId,
          approval.confirmationNonceHash, approval.humanConfirmationHash,
          approval.accountBindingHash, approval.canonicalAccountAddressHash,
          approval.handoffHash, approval.delegateHash,
          approval.apiWalletAddressHash, approval.signerReferenceHash,
          approval.preparedActionHash, approval.policyHash, approval.metadataHash,
          approval.riskSnapshotHash, approval.actionKind, approval.market,
          approval.maxOrderNotionalUsd, approval.openingTimeInForce,
          approval.nonce, approval.status, approval.approvedAt, approval.expiresAt,
          approval.consumedAt, approval.version, approval.exactExecutionOnly,
          approval.oneUse, approval.mainnetAuthority,
          approval.productionAuthority, approval.realFundsAuthority,
          approval.schemaVersion
        ]
      );
      return persistAttemptTransition(client, current, next);
    });
  }

  async claim({
    executionId,
    authorization,
    requestBodyHash,
    signatureHash,
    claimHash,
    now = new Date()
  }) {
    identifier("executionId", executionId);
    return this.#events.withTenantWrite(async (client) => {
      const result = await client.query(
        `SELECT a.*, p.id AS p_id, p.approval_hash AS p_approval_hash,
                p.execution_id AS p_execution_id, p.execution_hash AS p_execution_hash,
                p.economic_action_hash AS p_economic_action_hash,
                p.actor_id AS p_actor_id, p.confirmation_nonce_hash AS p_confirmation_nonce_hash,
                p.human_confirmation_hash AS p_human_confirmation_hash,
                p.account_binding_hash AS p_account_binding_hash,
                p.canonical_account_address_hash AS p_canonical_account_address_hash,
                p.handoff_hash AS p_handoff_hash, p.delegate_hash AS p_delegate_hash,
                p.api_wallet_address_hash AS p_api_wallet_address_hash,
                p.signer_reference_hash AS p_signer_reference_hash,
                p.prepared_action_hash AS p_prepared_action_hash,
                p.policy_hash AS p_policy_hash, p.metadata_hash AS p_metadata_hash,
                p.risk_snapshot_hash AS p_risk_snapshot_hash,
                p.action_kind AS p_action_kind, p.market AS p_market,
                p.max_order_notional_usd AS p_max_order_notional_usd,
                p.opening_time_in_force AS p_opening_time_in_force,
                p.nonce AS p_nonce, p.status AS p_status,
                p.approved_at AS p_approved_at, p.expires_at AS p_expires_at,
                p.consumed_at AS p_consumed_at, p.version AS p_version,
                p.exact_execution_only AS p_exact_execution_only,
                p.one_use AS p_one_use, p.mainnet_authority AS p_mainnet_authority,
                p.production_authority AS p_production_authority,
                p.real_funds_authority AS p_real_funds_authority,
                p.schema_version AS p_schema_version,
                h.status AS handoff_status, h.expires_at AS handoff_expires_at
           FROM hypercore_testnet_submission_attempts a
           JOIN hypercore_testnet_founder_approvals p
             ON p.tenant_id = a.tenant_id AND p.id = a.founder_approval_id
           JOIN hypercore_testnet_signer_handoffs h
             ON h.tenant_id = a.tenant_id AND h.id = a.handoff_id
          WHERE a.id = $1 FOR UPDATE OF a, p, h`,
        [executionId]
      );
      if (result.rowCount !== 1) fail("hypercore_testnet_execution_unavailable", "claim binding missing");
      const row = result.rows[0];
      const current = mapAttempt(row);
      const approval = mapApproval({
        id: row.p_id,
        approval_hash: row.p_approval_hash,
        execution_id: row.p_execution_id,
        execution_hash: row.p_execution_hash,
        economic_action_hash: row.p_economic_action_hash,
        actor_id: row.p_actor_id,
        confirmation_nonce_hash: row.p_confirmation_nonce_hash,
        human_confirmation_hash: row.p_human_confirmation_hash,
        account_binding_hash: row.p_account_binding_hash,
        canonical_account_address_hash: row.p_canonical_account_address_hash,
        handoff_hash: row.p_handoff_hash,
        delegate_hash: row.p_delegate_hash,
        api_wallet_address_hash: row.p_api_wallet_address_hash,
        signer_reference_hash: row.p_signer_reference_hash,
        prepared_action_hash: row.p_prepared_action_hash,
        policy_hash: row.p_policy_hash,
        metadata_hash: row.p_metadata_hash,
        risk_snapshot_hash: row.p_risk_snapshot_hash,
        action_kind: row.p_action_kind,
        market: row.p_market,
        max_order_notional_usd: row.p_max_order_notional_usd,
        opening_time_in_force: row.p_opening_time_in_force,
        nonce: row.p_nonce,
        status: row.p_status,
        approved_at: row.p_approved_at,
        expires_at: row.p_expires_at,
        consumed_at: row.p_consumed_at,
        version: row.p_version,
        exact_execution_only: row.p_exact_execution_only,
        one_use: row.p_one_use,
        mainnet_authority: row.p_mainnet_authority,
        production_authority: row.p_production_authority,
        real_funds_authority: row.p_real_funds_authority,
        schema_version: row.p_schema_version
      });
      const claimedAt = trustedDate("now", now);
      if (
        row.handoff_status !== HypercoreTestnetSignerHandoffStatus.VERIFIED ||
        claimedAt >= new Date(row.handoff_expires_at)
      ) {
        fail("hypercore_testnet_signer_handoff_unavailable", "signer is stale or retired");
      }
      const next = claimHypercoreTestnetSubmissionAttempt({
        attempt: current,
        approval,
        authorization,
        requestBodyHash,
        signatureHash,
        claimHash,
        now: claimedAt
      });
      const consumed = await client.query(
        `UPDATE hypercore_testnet_founder_approvals
            SET status = 'CONSUMED', consumed_at = $2, version = 2
          WHERE id = $1 AND status = 'APPROVED' AND version = 1`,
        [approval.approvalId, claimedAt.toISOString()]
      );
      if (consumed.rowCount !== 1) {
        fail("hypercore_testnet_founder_approval_consumed", "approval is unavailable");
      }
      return persistAttemptTransition(client, current, next);
    });
  }

  async resolve({ executionId, result, now = new Date() }) {
    return this.#transition(executionId, (current) =>
      resolveHypercoreTestnetSubmissionAttempt({ attempt: current, result, now })
    );
  }

  async recoverUnknown({ executionId, reasonHash, now = new Date() }) {
    bytes32("reasonHash", reasonHash);
    return this.#transition(executionId, (current) =>
      recoverHypercoreTestnetSubmissionUnknown({ attempt: current, reasonHash, now })
    );
  }

  async reconcile({ executionId, now = new Date(), ...hashes }) {
    return this.#transition(executionId, (current) =>
      reconcileHypercoreTestnetSubmissionAttempt({ attempt: current, now, ...hashes })
    );
  }

  async retireSignerHandoff(handoff) {
    verifyHypercoreTestnetSignerHandoff(handoff);
    if (handoff.status !== HypercoreTestnetSignerHandoffStatus.RETIRED) {
      fail("hypercore_testnet_signer_retirement_denied", "retired handoff required");
    }
    return this.#events.withTenantWrite(async (client) => {
      const currentResult = await client.query(
        "SELECT * FROM hypercore_testnet_signer_handoffs WHERE id = $1 FOR UPDATE",
        [handoff.handoffId]
      );
      if (currentResult.rowCount !== 1) fail("hypercore_testnet_signer_handoff_unavailable", "handoff missing");
      const current = mapHandoff(currentResult.rows[0]);
      if (current.status === HypercoreTestnetSignerHandoffStatus.RETIRED) return current;
      if (
        current.handoffHash === handoff.handoffHash ||
        current.delegateId !== handoff.delegateId ||
        current.signerReferenceHash !== handoff.signerReferenceHash
      ) {
        fail("hypercore_testnet_signer_retirement_denied", "retirement drifted");
      }
      await client.query(
        `UPDATE hypercore_testnet_signer_handoffs SET
           handoff_hash = $2, status = 'RETIRED', retired_at = $3,
           retirement_evidence_hash = $4, version = 2
         WHERE id = $1 AND status = 'VERIFIED' AND version = 1`,
        [
          handoff.handoffId,
          handoff.handoffHash,
          handoff.retiredAt,
          handoff.retirementEvidenceHash
        ]
      );
      return handoff;
    });
  }

  async close({ executionId, now = new Date() }) {
    identifier("executionId", executionId);
    return this.#events.withTenantWrite(async (client) => {
      const result = await client.query(
        `SELECT a.*, h.id AS h_id, h.handoff_hash AS h_handoff_hash,
                h.account_binding_id AS h_account_binding_id,
                h.account_binding_hash AS h_account_binding_hash,
                h.canonical_account_address_hash AS h_canonical_account_address_hash,
                h.delegate_id AS h_delegate_id, h.delegate_hash AS h_delegate_hash,
                h.api_wallet_address_hash AS h_api_wallet_address_hash,
                h.signer_reference_hash AS h_signer_reference_hash,
                h.registration_evidence_hash AS h_registration_evidence_hash,
                h.status AS h_status, h.verified_at AS h_verified_at,
                h.expires_at AS h_expires_at, h.retired_at AS h_retired_at,
                h.retirement_evidence_hash AS h_retirement_evidence_hash,
                h.version AS h_version, h.raw_address_persisted AS h_raw_address_persisted,
                h.raw_key_accepted AS h_raw_key_accepted,
                h.raw_key_persisted AS h_raw_key_persisted,
                h.raw_signature_persisted AS h_raw_signature_persisted,
                h.mainnet_authority AS h_mainnet_authority,
                h.production_authority AS h_production_authority,
                h.real_funds_authority AS h_real_funds_authority,
                h.schema_version AS h_schema_version
           FROM hypercore_testnet_submission_attempts a
           JOIN hypercore_testnet_signer_handoffs h
             ON h.tenant_id = a.tenant_id AND h.id = a.handoff_id
          WHERE a.id = $1 FOR UPDATE OF a, h`,
        [executionId]
      );
      if (result.rowCount !== 1) fail("hypercore_testnet_execution_unavailable", "closure missing");
      const row = result.rows[0];
      const current = mapAttempt(row);
      const handoff = mapHandoff({
        id: row.h_id,
        handoff_hash: row.h_handoff_hash,
        account_binding_id: row.h_account_binding_id,
        account_binding_hash: row.h_account_binding_hash,
        canonical_account_address_hash: row.h_canonical_account_address_hash,
        delegate_id: row.h_delegate_id,
        delegate_hash: row.h_delegate_hash,
        api_wallet_address_hash: row.h_api_wallet_address_hash,
        signer_reference_hash: row.h_signer_reference_hash,
        registration_evidence_hash: row.h_registration_evidence_hash,
        status: row.h_status,
        verified_at: row.h_verified_at,
        expires_at: row.h_expires_at,
        retired_at: row.h_retired_at,
        retirement_evidence_hash: row.h_retirement_evidence_hash,
        version: row.h_version,
        raw_address_persisted: row.h_raw_address_persisted,
        raw_key_accepted: row.h_raw_key_accepted,
        raw_key_persisted: row.h_raw_key_persisted,
        raw_signature_persisted: row.h_raw_signature_persisted,
        mainnet_authority: row.h_mainnet_authority,
        production_authority: row.h_production_authority,
        real_funds_authority: row.h_real_funds_authority,
        schema_version: row.h_schema_version
      });
      return persistAttemptTransition(
        client,
        current,
        closeHypercoreTestnetSubmissionAttempt({ attempt: current, handoff, now })
      );
    });
  }

  async #transition(executionId, transition) {
    identifier("executionId", executionId);
    return this.#events.withTenantWrite(async (client) => {
      const result = await client.query(
        "SELECT * FROM hypercore_testnet_submission_attempts WHERE id = $1 FOR UPDATE",
        [executionId]
      );
      if (result.rowCount !== 1) fail("hypercore_testnet_execution_unavailable", "attempt missing");
      const current = mapAttempt(result.rows[0]);
      return persistAttemptTransition(client, current, transition(current));
    });
  }

  async find(executionId) {
    identifier("executionId", executionId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        "SELECT * FROM hypercore_testnet_submission_attempts WHERE id = $1",
        [executionId]
      );
      return result.rowCount === 1 ? mapAttempt(result.rows[0]) : undefined;
    });
  }

  async findFounderApproval(executionId) {
    identifier("executionId", executionId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        "SELECT * FROM hypercore_testnet_founder_approvals WHERE execution_id = $1",
        [executionId]
      );
      return result.rowCount === 1 ? mapApproval(result.rows[0]) : undefined;
    });
  }

  async findSignerHandoff(handoffId) {
    identifier("handoffId", handoffId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        "SELECT * FROM hypercore_testnet_signer_handoffs WHERE id = $1",
        [handoffId]
      );
      return result.rowCount === 1 ? mapHandoff(result.rows[0]) : undefined;
    });
  }

  async history(executionId) {
    identifier("executionId", executionId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT sequence, previous_state, next_state, transition_hash,
                result_hash, changed_at, retry_allowed, secrets_included,
                schema_version
           FROM hypercore_testnet_submission_transitions
          WHERE execution_id = $1 ORDER BY sequence`,
        [executionId]
      );
      return result.rows.map((row) => ({
        sequence: number(row.sequence),
        previousState: row.previous_state,
        nextState: row.next_state,
        transitionHash: row.transition_hash,
        resultHash: row.result_hash,
        changedAt: iso(row.changed_at),
        retryAllowed: boolean(row.retry_allowed),
        secretsIncluded: boolean(row.secrets_included),
        schemaVersion: row.schema_version
      }));
    });
  }
}
