import {
  CreditEventType,
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  DelegatedWalletGrantStatus,
  PendingExposureStatus,
  createAgenticExecutionEvent,
  verifyDelegatedWalletGrant,
  verifyExecutionTargetPolicy
} from "./agentic-execution-grant.js";

const AGGREGATE_TYPE = "delegated_wallet_grant";
const OUTBOX_TOPIC = "ipo.one.agentic-execution-grants.v1";

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function requiredString(name, value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) {
    fail("invalid_agentic_execution_repository_input", `${name} is required`);
  }
  return value;
}

function nowDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_agentic_execution_repository_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function json(value) {
  return JSON.stringify(value);
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

function commandContext(input, operation) {
  const idempotencyKey = requiredString("idempotencyKey", input.idempotencyKey);
  const correlationId = requiredString("correlationId", input.correlationId);
  const actorId = requiredString("actorId", input.actorId);
  const now = nowDate(input.now ?? new Date());
  return {
    idempotencyKey,
    correlationId,
    actorId,
    now,
    commandHash: hashId(`agentic_execution_${operation}_command`, input.commandPayload)
  };
}

function nextExposureGrant(grant, delta, updatedAt) {
  const next = structuredClone(grant);
  const amount = BigInt(delta);
  const pending = BigInt(grant.pendingExposureMinor) + amount;
  if (pending < 0n || pending > BigInt(grant.aggregateLimitMinor)) {
    fail("agentic_execution_aggregate_limit_exceeded", "pending exposure exceeds grant bounds");
  }
  next.pendingExposureMinor = pending.toString();
  next.version = grant.version + 1;
  next.updatedAt = updatedAt;
  verifyDelegatedWalletGrant(next);
  return next;
}

function grantInsertValues(grant) {
  return [
    grant.grantId, grant.grantHash, grant.subjectId, grant.principalId,
    grant.accountBindingId, grant.executionDomain, grant.adapterId, grant.mandateId,
    grant.mandateHash, grant.spendPolicyId, grant.spendPolicyHash, grant.creditLineId,
    grant.creditLineHash, grant.obligationId, grant.obligationHash,
    grant.authorizationDecisionId, grant.authorizationHash, grant.sessionSignerRefHash,
    grant.providerId, json(grant.chainIds), json(grant.assetIds), grant.perTxLimitMinor,
    grant.rolling24hLimitMinor, grant.aggregateLimitMinor, grant.obligationLimitMinor,
    grant.pendingExposureMinor, grant.validFrom, grant.expiresAt, grant.sessionEpoch,
    grant.nonce, grant.externalPermissionRefHash, grant.externalPolicyHash, grant.status,
    json(grant), grant.version, grant.sandboxOnly, grant.transactionsAllowed,
    grant.productionAuthority, grant.fundsAuthority, grant.createdAt, grant.updatedAt,
    grant.schemaVersion
  ];
}

async function insertTargetPolicy(client, policy) {
  const result = await client.query(
    `INSERT INTO execution_target_policies (
       id, policy_hash, provider_id, chain_id, target_address, code_hash,
       proxy_implementation_hash, allowed_function_selectors, valid_from,
       expires_at, policy, version, sandbox_only, transactions_allowed,
       production_authority, funds_authority, created_at, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9, $10, $11::JSONB, $12,
       $13, $14, $15, $16, $17, $18
     ) ON CONFLICT (tenant_id, id) DO NOTHING
     RETURNING policy_hash`,
    [
      policy.targetPolicyId, policy.policyHash, policy.providerId, policy.chainId,
      policy.targetAddress, policy.codeHash, policy.proxyImplementationHash,
      json(policy.allowedFunctionSelectors), policy.validFrom, policy.expiresAt,
      json(policy), policy.version, policy.sandboxOnly, policy.transactionsAllowed,
      policy.productionAuthority, policy.fundsAuthority, policy.createdAt,
      policy.schemaVersion
    ]
  );
  if (result.rowCount === 0) {
    const existing = await client.query(
      "SELECT policy_hash FROM execution_target_policies WHERE id = $1",
      [policy.targetPolicyId]
    );
    if (existing.rowCount !== 1 || existing.rows[0].policy_hash !== policy.policyHash) {
      fail("agentic_execution_target_policy_conflict", "target policy identity conflicts with durable state");
    }
  }
}

async function insertTransition(client, grant, transition, eventId) {
  const record = transitionRecord({ grant, transition, eventId });
  await client.query(
    `INSERT INTO delegated_wallet_grant_transitions (
       id, grant_id, transition_hash, event_id, previous_status, next_status,
       reason_code, authorization_decision_id, authorization_hash, occurred_at,
       transition, schema_version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB, $12)`,
    [
      record.transitionId, record.grantId, record.transitionHash, record.eventId,
      record.previousStatus, record.nextStatus, record.reasonCode,
      record.authorizationDecisionId, record.authorizationHash, record.occurredAt,
      json(record), record.schemaVersion
    ]
  );
}

function eventFor({ eventType, grant, payload, context }) {
  return createAgenticExecutionEvent({
    eventType,
    grant,
    payload,
    correlationId: context.correlationId,
    actorId: context.actorId,
    now: context.now
  });
}

export class PostgresAgenticExecutionRepository {
  #eventRepository;

  constructor({ eventRepository, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !eventRepository ||
      typeof eventRepository.appendCommand !== "function" ||
      typeof eventRepository.withTenantRead !== "function"
    ) {
      fail(
        "invalid_agentic_execution_repository",
        "a Tenant-scoped PostgreSQL Event Repository is required"
      );
    }
    this.#eventRepository = eventRepository;
  }

  async create({ grant, targetPolicies, idempotencyKey, correlationId, actorId, now = new Date() }) {
    verifyDelegatedWalletGrant(grant);
    if (grant.status !== DelegatedWalletGrantStatus.PREPARED) {
      fail("agentic_execution_grant_invalid", "only a prepared grant can be created");
    }
    if (!Array.isArray(targetPolicies) || targetPolicies.length !== grant.allowedTargetPolicyIds.length) {
      fail("agentic_execution_target_policy_invalid", "the exact grant target set is required");
    }
    for (const policy of targetPolicies) verifyExecutionTargetPolicy(policy, { now });
    const durableIds = [...targetPolicies.map(({ targetPolicyId }) => targetPolicyId)].sort();
    if (json(durableIds) !== json(grant.allowedTargetPolicyIds)) {
      fail("agentic_execution_target_scope_mismatch", "target policy set differs from the grant");
    }
    const context = commandContext({
      idempotencyKey, correlationId, actorId, now,
      commandPayload: { grantHash: grant.grantHash, targetPolicyHashes: targetPolicies.map(({ policyHash }) => policyHash) }
    }, "create_grant");
    const event = eventFor({
      eventType: CreditEventType.DELEGATED_WALLET_GRANT_PREPARED,
      grant,
      payload: { intentVersion: grant.version, status: grant.status, adapterId: grant.adapterId },
      context
    });
    const initialTransition = {
      previousStatus: null,
      nextStatus: grant.status,
      reasonCode: "canonical_authority_projected",
      authorizationDecisionId: grant.authorizationDecisionId,
      authorizationHash: grant.authorizationHash,
      occurredAt: grant.createdAt
    };
    const committed = await this.#eventRepository.appendCommand({
      aggregateType: AGGREGATE_TYPE,
      aggregateId: grant.grantId,
      expectedVersion: 0,
      idempotencyKey: context.idempotencyKey,
      commandHash: context.commandHash,
      event,
      outboxTopic: OUTBOX_TOPIC,
      response: grant,
      applyProjection: async ({ client, committed: [recorded] }) => {
        for (const policy of targetPolicies) await insertTargetPolicy(client, policy);
        await client.query(
          `INSERT INTO delegated_wallet_grants (
             id, grant_hash, subject_id, principal_id, account_binding_id,
             execution_domain, adapter_id, mandate_id, mandate_hash,
             spend_policy_id, spend_policy_hash, credit_line_id, credit_line_hash,
             obligation_id, obligation_hash, authorization_decision_id,
             authorization_hash, session_signer_ref_hash, provider_id, chain_ids,
             asset_ids, per_tx_limit_minor, rolling_24h_limit_minor,
             aggregate_limit_minor, obligation_limit_minor, pending_exposure_minor,
             valid_from, expires_at, session_epoch, nonce,
             external_permission_ref_hash, external_policy_hash, status,
             grant_record, version, sandbox_only, transactions_allowed,
             production_authority, funds_authority, created_at, updated_at,
             schema_version
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::JSONB,
             $21::JSONB, $22, $23, $24, $25, $26, $27, $28, $29, $30,
             $31, $32, $33, $34::JSONB, $35, $36, $37, $38, $39, $40,
             $41, $42
           )`,
          grantInsertValues(grant)
        );
        for (const policy of targetPolicies) {
          await client.query(
            `INSERT INTO delegated_wallet_grant_target_policies (
               grant_id, target_policy_id, created_at
             ) VALUES ($1, $2, $3)`,
            [grant.grantId, policy.targetPolicyId, grant.createdAt]
          );
        }
        await insertTransition(client, grant, initialTransition, recorded.event.eventId);
      }
    });
    return committed;
  }

  async activate({ currentGrant, activation, idempotencyKey, correlationId, actorId, now = new Date() }) {
    verifyDelegatedWalletGrant(currentGrant);
    verifyDelegatedWalletGrant(activation?.value);
    const next = activation.value;
    if (
      currentGrant.grantId !== next.grantId ||
      currentGrant.status !== DelegatedWalletGrantStatus.PREPARED ||
      next.status !== DelegatedWalletGrantStatus.ACTIVE ||
      next.version !== currentGrant.version + 1
    ) {
      fail("agentic_execution_grant_not_activatable", "activation transition is inconsistent");
    }
    const context = commandContext({
      idempotencyKey, correlationId, actorId, now,
      commandPayload: { grantId: next.grantId, version: next.version, externalPolicyHash: next.externalPolicyHash }
    }, "activate_grant");
    const event = eventFor({
      eventType: CreditEventType.DELEGATED_WALLET_GRANT_ACTIVATED,
      grant: next,
      payload: { intentVersion: next.version, status: next.status, externalPolicyHash: next.externalPolicyHash },
      context
    });
    return this.#eventRepository.appendCommand({
      aggregateType: AGGREGATE_TYPE,
      aggregateId: next.grantId,
      expectedVersion: currentGrant.version,
      idempotencyKey: context.idempotencyKey,
      commandHash: context.commandHash,
      event,
      outboxTopic: OUTBOX_TOPIC,
      response: next,
      applyProjection: async ({ client, committed: [recorded] }) => {
        const result = await client.query(
          `UPDATE delegated_wallet_grants
              SET external_permission_ref_hash = $1, external_policy_hash = $2,
                  status = $3, grant_record = $4::JSONB, version = $5, updated_at = $6
            WHERE id = $7 AND version = $8 AND status = 'prepared'`,
          [
            next.externalPermissionRefHash, next.externalPolicyHash, next.status,
            json(next), next.version, next.updatedAt, next.grantId, currentGrant.version
          ]
        );
        if (result.rowCount !== 1) {
          fail("agentic_execution_concurrency_conflict", "grant activation lost its version lock");
        }
        await insertTransition(client, next, activation.transition, recorded.event.eventId);
      }
    });
  }

  async revoke({ currentGrant, revocation, idempotencyKey, correlationId, actorId, now = new Date() }) {
    verifyDelegatedWalletGrant(currentGrant);
    verifyDelegatedWalletGrant(revocation?.value);
    const next = revocation.value;
    if (
      currentGrant.grantId !== next.grantId ||
      next.status !== DelegatedWalletGrantStatus.REVOKED ||
      next.pendingExposureMinor !== "0" ||
      next.version !== currentGrant.version + 1
    ) {
      fail("agentic_execution_grant_terminal", "revocation transition is inconsistent");
    }
    const context = commandContext({
      idempotencyKey, correlationId, actorId, now,
      commandPayload: { grantId: next.grantId, version: next.version, reasonCode: revocation.transition.reasonCode }
    }, "revoke_grant");
    const event = eventFor({
      eventType: CreditEventType.DELEGATED_WALLET_GRANT_REVOKED,
      grant: next,
      payload: {
        intentVersion: next.version,
        status: next.status,
        reasonCode: revocation.transition.reasonCode,
        releasedPendingExposureMinor: revocation.transition.releasedPendingExposureMinor
      },
      context
    });
    return this.#eventRepository.appendCommand({
      aggregateType: AGGREGATE_TYPE,
      aggregateId: next.grantId,
      expectedVersion: currentGrant.version,
      idempotencyKey: context.idempotencyKey,
      commandHash: context.commandHash,
      event,
      outboxTopic: OUTBOX_TOPIC,
      response: next,
      applyProjection: async ({ client, committed: [recorded] }) => {
        const locked = await client.query(
          "SELECT version, pending_exposure_minor FROM delegated_wallet_grants WHERE id = $1 FOR UPDATE",
          [next.grantId]
        );
        if (
          locked.rowCount !== 1 ||
          Number(locked.rows[0].version) !== currentGrant.version ||
          String(locked.rows[0].pending_exposure_minor) !== currentGrant.pendingExposureMinor
        ) {
          fail("agentic_execution_concurrency_conflict", "grant revocation observed stale exposure");
        }
        await client.query(
          `UPDATE delegated_wallet_pending_exposures
              SET status = 'released', released_at = $2,
                  release_reason_code = 'grant_revoked', release_event_id = $3,
                  reservation = jsonb_set(
                    jsonb_set(
                      jsonb_set(reservation, '{status}', '"released"'::JSONB),
                      '{releasedAt}', to_jsonb($2::TEXT)
                    ),
                    '{releaseReasonCode}', '"grant_revoked"'::JSONB
                  )
            WHERE grant_id = $1 AND status = 'reserved'`,
          [next.grantId, next.updatedAt, recorded.event.eventId]
        );
        const result = await client.query(
          `UPDATE delegated_wallet_grants
              SET status = $1, pending_exposure_minor = 0, grant_record = $2::JSONB,
                  version = $3, updated_at = $4
            WHERE id = $5 AND version = $6 AND status IN ('prepared', 'active')`,
          [next.status, json(next), next.version, next.updatedAt, next.grantId, currentGrant.version]
        );
        if (result.rowCount !== 1) {
          fail("agentic_execution_concurrency_conflict", "grant revocation lost its version lock");
        }
        await insertTransition(client, next, revocation.transition, recorded.event.eventId);
      }
    });
  }

  async reserve({ grant, reservation, idempotencyKey, correlationId, actorId, now = new Date() }) {
    verifyDelegatedWalletGrant(grant, { now, requireUsable: true });
    if (
      !reservation || reservation.status !== PendingExposureStatus.RESERVED ||
      reservation.grantId !== grant.grantId || reservation.obligationId !== grant.obligationId
    ) {
      fail("agentic_execution_reservation_invalid", "reservation is not bound to the exact grant");
    }
    const next = nextExposureGrant(grant, reservation.amountMinor, reservation.reservedAt);
    const context = commandContext({
      idempotencyKey, correlationId, actorId, now,
      commandPayload: { reservationHash: reservation.reservationHash, grantId: grant.grantId, version: next.version }
    }, "reserve_pending_exposure");
    const event = eventFor({
      eventType: CreditEventType.DELEGATED_WALLET_PENDING_EXPOSURE_RESERVED,
      grant: next,
      payload: {
        intentVersion: next.version,
        reservationId: reservation.reservationId,
        reservationHash: reservation.reservationHash,
        amountMinor: reservation.amountMinor,
        pendingExposureMinor: next.pendingExposureMinor
      },
      context
    });
    return this.#eventRepository.appendCommand({
      aggregateType: AGGREGATE_TYPE,
      aggregateId: grant.grantId,
      expectedVersion: grant.version,
      idempotencyKey: context.idempotencyKey,
      commandHash: context.commandHash,
      event,
      outboxTopic: OUTBOX_TOPIC,
      response: { grant: next, reservation },
      applyProjection: async ({ client, committed: [recorded] }) => {
        const locked = await client.query(
          `SELECT g.*, a.status AS account_binding_status, c.status AS credit_line_status,
                  m.status AS mandate_status, p.expires_at AS target_expires_at
             FROM delegated_wallet_grants g
             JOIN account_bindings a ON a.tenant_id = g.tenant_id AND a.id = g.account_binding_id
             JOIN credit_lines c ON c.tenant_id = g.tenant_id AND c.id = g.credit_line_id
             JOIN mandates m ON m.tenant_id = g.tenant_id AND m.id = g.mandate_id
             JOIN execution_target_policies p ON p.tenant_id = g.tenant_id AND p.id = $2
            WHERE g.id = $1
            FOR UPDATE OF g`,
          [grant.grantId, reservation.targetPolicyId]
        );
        const row = locked.rows[0];
        if (
          locked.rowCount !== 1 || Number(row.version) !== grant.version ||
          row.status !== 'active' || row.grant_hash !== grant.grantHash ||
          Number(row.session_epoch) !== reservation.sessionEpoch ||
          row.account_binding_status !== 'active' || row.credit_line_status !== 'approved' ||
          row.mandate_status !== 'active' || new Date(row.expires_at) <= context.now ||
          new Date(row.target_expires_at) <= context.now
        ) {
          fail("agentic_execution_context_stale", "durable grant authority changed before reservation");
        }
        const exposure = await client.query(
          `SELECT
             COALESCE(SUM(amount_minor) FILTER (
               WHERE grant_id = $1 AND status = 'reserved' AND reserved_at >= $3::TIMESTAMPTZ - INTERVAL '24 hours'
             ), 0)::TEXT AS rolling_minor,
             COALESCE(SUM(amount_minor) FILTER (
               WHERE obligation_id = $2 AND status = 'reserved'
             ), 0)::TEXT AS obligation_minor
             FROM delegated_wallet_pending_exposures
            WHERE (grant_id = $1 OR obligation_id = $2)`,
          [grant.grantId, grant.obligationId, context.now.toISOString()]
        );
        const amount = BigInt(reservation.amountMinor);
        if (
          amount > BigInt(row.per_tx_limit_minor) ||
          BigInt(exposure.rows[0].rolling_minor) + amount > BigInt(row.rolling_24h_limit_minor) ||
          BigInt(row.pending_exposure_minor) + amount > BigInt(row.aggregate_limit_minor) ||
          BigInt(exposure.rows[0].obligation_minor) + amount > BigInt(row.obligation_limit_minor)
        ) {
          fail("agentic_execution_exposure_limit_exceeded", "atomic pending exposure limit was exceeded");
        }
        await client.query(
          `INSERT INTO delegated_wallet_pending_exposures (
             id, reservation_hash, grant_id, target_policy_id, obligation_id,
             event_id, asset_id, amount_minor, session_epoch, idempotency_key_hash,
             reserved_at, expires_at, status, released_at, release_reason_code,
             reservation, sandbox_only, transactions_allowed, production_authority,
             funds_authority, schema_version
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16::JSONB, $17, $18, $19, $20, $21
           )`,
          [
            reservation.reservationId, reservation.reservationHash, reservation.grantId,
            reservation.targetPolicyId, reservation.obligationId, recorded.event.eventId,
            reservation.assetId, reservation.amountMinor, reservation.sessionEpoch,
            reservation.idempotencyKeyHash, reservation.reservedAt, reservation.expiresAt,
            reservation.status, reservation.releasedAt, reservation.releaseReasonCode,
            json(reservation), reservation.sandboxOnly, reservation.transactionsAllowed,
            reservation.productionAuthority, reservation.fundsAuthority, reservation.schemaVersion
          ]
        );
        const update = await client.query(
          `UPDATE delegated_wallet_grants
              SET pending_exposure_minor = $1, grant_record = $2::JSONB,
                  version = $3, updated_at = $4
            WHERE id = $5 AND version = $6 AND status = 'active'`,
          [next.pendingExposureMinor, json(next), next.version, next.updatedAt, next.grantId, grant.version]
        );
        if (update.rowCount !== 1) {
          fail("agentic_execution_concurrency_conflict", "pending exposure lost its version lock");
        }
      }
    });
  }

  async release({ grant, reservation, releasedReservation, idempotencyKey, correlationId, actorId, now = new Date() }) {
    verifyDelegatedWalletGrant(grant);
    if (
      !reservation || reservation.status !== PendingExposureStatus.RESERVED ||
      !releasedReservation || releasedReservation.reservationId !== reservation.reservationId ||
      releasedReservation.status === PendingExposureStatus.RESERVED
    ) {
      fail("agentic_execution_reservation_not_releasable", "reservation release is inconsistent");
    }
    const next = nextExposureGrant(grant, `-${reservation.amountMinor}`, releasedReservation.releasedAt);
    const context = commandContext({
      idempotencyKey, correlationId, actorId, now,
      commandPayload: { reservationHash: reservation.reservationHash, status: releasedReservation.status, version: next.version }
    }, "release_pending_exposure");
    const event = eventFor({
      eventType: CreditEventType.DELEGATED_WALLET_PENDING_EXPOSURE_RELEASED,
      grant: next,
      payload: {
        intentVersion: next.version,
        reservationId: reservation.reservationId,
        status: releasedReservation.status,
        reasonCode: releasedReservation.releaseReasonCode,
        amountMinor: reservation.amountMinor,
        pendingExposureMinor: next.pendingExposureMinor
      },
      context
    });
    return this.#eventRepository.appendCommand({
      aggregateType: AGGREGATE_TYPE,
      aggregateId: grant.grantId,
      expectedVersion: grant.version,
      idempotencyKey: context.idempotencyKey,
      commandHash: context.commandHash,
      event,
      outboxTopic: OUTBOX_TOPIC,
      response: { grant: next, reservation: releasedReservation },
      applyProjection: async ({ client, committed: [recorded] }) => {
        const locked = await client.query(
          `SELECT g.version, g.pending_exposure_minor, r.status AS reservation_status,
                  r.amount_minor, r.reservation_hash
             FROM delegated_wallet_grants g
             JOIN delegated_wallet_pending_exposures r
               ON r.tenant_id = g.tenant_id AND r.grant_id = g.id
            WHERE g.id = $1 AND r.id = $2
            FOR UPDATE OF g, r`,
          [grant.grantId, reservation.reservationId]
        );
        const row = locked.rows[0];
        if (
          locked.rowCount !== 1 || Number(row.version) !== grant.version ||
          row.reservation_status !== 'reserved' ||
          row.reservation_hash !== reservation.reservationHash ||
          String(row.amount_minor) !== reservation.amountMinor ||
          String(row.pending_exposure_minor) !== grant.pendingExposureMinor
        ) {
          fail("agentic_execution_concurrency_conflict", "reservation release observed stale state");
        }
        await client.query(
          `UPDATE delegated_wallet_pending_exposures
              SET status = $1, released_at = $2, release_reason_code = $3,
                  release_event_id = $4, reservation = $5::JSONB
            WHERE id = $6 AND status = 'reserved'`,
          [
            releasedReservation.status, releasedReservation.releasedAt,
            releasedReservation.releaseReasonCode, recorded.event.eventId,
            json(releasedReservation), reservation.reservationId
          ]
        );
        const update = await client.query(
          `UPDATE delegated_wallet_grants
              SET pending_exposure_minor = $1, grant_record = $2::JSONB,
                  version = $3, updated_at = $4
            WHERE id = $5 AND version = $6`,
          [next.pendingExposureMinor, json(next), next.version, next.updatedAt, next.grantId, grant.version]
        );
        if (update.rowCount !== 1) {
          fail("agentic_execution_concurrency_conflict", "reservation release lost its version lock");
        }
      }
    });
  }

  async findById(grantId) {
    requiredString("grantId", grantId);
    return this.#eventRepository.withTenantRead(async (client) => {
      const grantResult = await client.query(
        "SELECT grant_record FROM delegated_wallet_grants WHERE id = $1",
        [grantId]
      );
      if (grantResult.rowCount === 0) return undefined;
      const policyResult = await client.query(
        `SELECT p.policy
           FROM delegated_wallet_grant_target_policies gp
           JOIN execution_target_policies p
             ON p.tenant_id = gp.tenant_id AND p.id = gp.target_policy_id
          WHERE gp.grant_id = $1
          ORDER BY p.id`,
        [grantId]
      );
      return {
        grant: grantResult.rows[0].grant_record,
        targetPolicies: policyResult.rows.map(({ policy }) => policy)
      };
    });
  }
}
