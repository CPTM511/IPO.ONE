import {
  DomainError,
  createCreditEvent,
  createFinalizedCreditOutcome,
  hashId
} from "../../../packages/domain/src/index.js";

const DEFAULT_LIMIT = 25;

function invalid(code, message) {
  throw new DomainError(code, message);
}

function assertRepository(repository) {
  if (
    !repository ||
    typeof repository.withTenantWrite !== "function" ||
    typeof repository.appendCommandBatchInTransaction !== "function" ||
    !repository.tenantContext?.tenantId ||
    !repository.tenantContext?.actorId
  ) {
    invalid(
      "invalid_credit_outcome_materializer",
      "a Tenant-scoped Event Repository is required"
    );
  }
  return repository;
}

function assertLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    invalid(
      "invalid_credit_outcome_materializer",
      "credit outcome limit must be an integer from 1 through 100"
    );
  }
  return value;
}

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapDecision(row) {
  return {
    riskDecisionId: row.risk_decision_id,
    decisionHash: row.decision_hash,
    subjectId: row.subject_id,
    principalId: row.principal_id,
    assetId: row.asset_id,
    status: row.decision_status,
    policyHash: row.policy_hash,
    featureSnapshotHash: row.feature_snapshot_hash,
    riskFeatureSnapshot: row.risk_feature_snapshot,
    decisionPassport: row.decision_passport,
    sandboxOnly: row.decision_sandbox_only,
    productionAuthority: row.decision_production_authority,
    schemaVersion: row.decision_schema_version
  };
}

function mapObligation(row) {
  return {
    obligationId: row.obligation_id,
    obligationHash: row.obligation_hash,
    riskDecisionId: row.risk_decision_id,
    subjectId: row.subject_id,
    principalId: row.principal_id,
    assetId: row.asset_id,
    originalPrincipalMinor: row.original_principal_minor,
    totalRepaidMinor: row.total_repaid_minor,
    outstandingPrincipalMinor: row.outstanding_principal_minor,
    outstandingInterestMinor: row.outstanding_interest_minor,
    outstandingFeesMinor: row.outstanding_fees_minor,
    writtenOffPrincipalMinor: row.written_off_principal_minor,
    writtenOffInterestMinor: row.written_off_interest_minor,
    writtenOffFeesMinor: row.written_off_fees_minor,
    status: row.obligation_status,
    executionStatus: row.execution_status,
    sandboxOnly: row.obligation_sandbox_only,
    productionFundsMoved: row.obligation_production_funds_moved,
    updatedAt: timestamp(row.obligation_updated_at),
    schemaVersion: row.obligation_schema_version
  };
}

async function loadServicingSummary(client, obligationId, finalizedAt) {
  const result = await client.query(
    `SELECT
       COALESCE(MAX(days_past_due), 0)::int AS max_days_past_due,
       COALESCE(BOOL_OR(action_type = 'restructure'), FALSE) AS restructured,
       COALESCE(BOOL_OR(action_type = 'repurchase'), FALSE) AS repurchased
     FROM sandbox_servicing_actions
     WHERE obligation_id = $1`,
    [obligationId]
  );
  return {
    maxDaysPastDue: result.rows[0].max_days_past_due,
    restructured: result.rows[0].restructured,
    repurchased: result.rows[0].repurchased,
    outcomeFinalizedAt: finalizedAt
  };
}

async function loadSourceEvidenceHashes(client, candidate) {
  const [decisionEvidence, obligationEvidence] = await Promise.all([
    client.query(
      `SELECT evidence_hash
         FROM evidence_envelopes
        WHERE aggregate_type = 'risk_decision' AND aggregate_id = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1`,
      [candidate.risk_decision_id]
    ),
    client.query(
      `SELECT evidence_hash
         FROM evidence_envelopes
        WHERE obligation_id = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT 255`,
      [candidate.obligation_id]
    )
  ]);
  if (decisionEvidence.rowCount !== 1 || obligationEvidence.rowCount < 1) {
    invalid(
      "credit_outcome_evidence_incomplete",
      "terminal credit outcome is missing decision or Obligation Evidence"
    );
  }
  return [
    decisionEvidence.rows[0].evidence_hash,
    ...obligationEvidence.rows.map((row) => row.evidence_hash)
  ].filter((value, index, values) => values.indexOf(value) === index);
}

async function insertOutcome(client, outcome, committed) {
  const source = committed[0];
  await client.query(
    `INSERT INTO credit_outcomes(
       id, outcome_hash, risk_decision_id, decision_hash,
       decision_passport_hash, feature_snapshot_hash, policy_hash,
       decision_feature_snapshot, subject_id, principal_id, asset_id,
       obligation_id, obligation_terminal_hash, outcome_label,
       max_days_past_due, restructured, repurchased,
       original_principal_minor, total_repaid_minor, loss_minor,
       repayment_ratio_bps, source_evidence_hashes,
       outcome_finalized_at, recorded_at, source_event_id,
       outcome_evidence_hash, outcome,
       outcome_finalized, future_feature_substitution_allowed,
       authorizing, funds_authority, economic_state_mutation,
       production_authority, pii_included, raw_transaction_data_included,
       score_authoritative, sandbox_only, production_funds_moved,
       schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
       $22, $23, $24, $25, $26, $27,
       $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39
     )`,
    [
      outcome.creditOutcomeId,
      outcome.outcomeHash,
      outcome.riskDecisionId,
      outcome.decisionHash,
      outcome.decisionPassportHash,
      outcome.featureSnapshotHash,
      outcome.policyHash,
      JSON.stringify(outcome.decisionFeatureSnapshot),
      outcome.subjectId,
      outcome.principalId,
      outcome.assetId,
      outcome.obligationId,
      outcome.obligationTerminalHash,
      outcome.outcomeLabel,
      outcome.maxDaysPastDue,
      outcome.restructured,
      outcome.repurchased,
      outcome.originalPrincipalMinor,
      outcome.totalRepaidMinor,
      outcome.lossMinor,
      outcome.repaymentRatioBps,
      JSON.stringify(outcome.sourceEvidenceHashes),
      outcome.outcomeFinalizedAt,
      outcome.recordedAt,
      source.event.eventId,
      source.evidence.evidenceHash,
      JSON.stringify(outcome),
      outcome.outcomeFinalized,
      outcome.futureFeatureSubstitutionAllowed,
      outcome.authorizing,
      outcome.fundsAuthority,
      outcome.economicStateMutation,
      outcome.productionAuthority,
      outcome.piiIncluded,
      outcome.rawTransactionDataIncluded,
      outcome.scoreAuthoritative,
      outcome.sandboxOnly,
      outcome.productionFundsMoved,
      outcome.schemaVersion
    ]
  );
}

export class PostgresCreditOutcomeMaterializer {
  constructor({ eventRepository, clock = () => new Date() }) {
    this.eventRepository = assertRepository(eventRepository);
    if (typeof clock !== "function") {
      invalid("invalid_credit_outcome_materializer", "clock must be a function");
    }
    this.clock = clock;
  }

  async run({ limit = DEFAULT_LIMIT } = {}) {
    const checkedLimit = assertLimit(limit);
    return this.eventRepository.withTenantWrite(async (client) => {
      const candidates = await client.query(
        `SELECT
           o.id AS obligation_id,
           o.obligation_hash,
           o.risk_decision_id,
           o.subject_id,
           o.principal_id,
           o.asset_id,
           o.amount_minor::text AS original_principal_minor,
           o.total_repaid_minor::text,
           o.outstanding_minor::text AS outstanding_principal_minor,
           o.outstanding_interest_minor::text,
           o.outstanding_fees_minor::text,
           o.written_off_principal_minor::text,
           o.written_off_interest_minor::text,
           o.written_off_fees_minor::text,
           o.status::text AS obligation_status,
           o.execution_status,
           o.sandbox_only AS obligation_sandbox_only,
           o.production_funds_moved AS obligation_production_funds_moved,
           o.updated_at AS obligation_updated_at,
           o.schema_version AS obligation_schema_version,
           d.decision_hash,
           d.status AS decision_status,
           d.policy_hash,
           d.feature_snapshot_hash,
           d.risk_feature_snapshot,
           d.decision_passport,
           d.sandbox_only AS decision_sandbox_only,
           d.production_authority AS decision_production_authority,
           d.schema_version AS decision_schema_version
         FROM obligations o
         JOIN risk_decisions d
           ON d.tenant_id = o.tenant_id AND d.id = o.risk_decision_id
         LEFT JOIN credit_outcomes c
           ON c.tenant_id = o.tenant_id AND c.obligation_id = o.id
        WHERE o.schema_version = 'obligation.v2'
          AND o.status IN ('fully_repaid', 'written_off')
          AND o.execution_status = 'executed'
          AND o.sandbox_only = TRUE
          AND o.production_funds_moved = FALSE
          AND d.schema_version = 'risk_decision.v3'
          AND d.status = 'approved'
          AND d.sandbox_only = TRUE
          AND d.production_authority = FALSE
          AND c.id IS NULL
        ORDER BY o.updated_at, o.id
        LIMIT $1
        FOR UPDATE OF o SKIP LOCKED`,
        [checkedLimit]
      );
      const outcomes = [];
      for (const candidate of candidates.rows) {
        const recordedAt = this.clock().toISOString();
        const sourceEvidenceHashes = await loadSourceEvidenceHashes(client, candidate);
        const servicingSummary = await loadServicingSummary(
          client,
          candidate.obligation_id,
          timestamp(candidate.obligation_updated_at)
        );
        const outcome = createFinalizedCreditOutcome({
          decision: mapDecision(candidate),
          obligation: mapObligation(candidate),
          servicingSummary,
          sourceEvidenceHashes,
          recordedAt
        });
        const event = createCreditEvent({
          eventType: "credit_outcome_finalized",
          subjectId: outcome.subjectId,
          obligationId: outcome.obligationId,
          payload: {
            creditOutcomeId: outcome.creditOutcomeId,
            outcomeHash: outcome.outcomeHash,
            riskDecisionId: outcome.riskDecisionId,
            decisionHash: outcome.decisionHash,
            featureSnapshotHash: outcome.featureSnapshotHash,
            obligationId: outcome.obligationId,
            obligationTerminalHash: outcome.obligationTerminalHash,
            outcomeLabel: outcome.outcomeLabel,
            sourceEvidenceHashes: outcome.sourceEvidenceHashes,
            outcomeFinalizedAt: outcome.outcomeFinalizedAt,
            actorId: this.eventRepository.tenantContext.actorId,
            nonAuthorizing: true,
            fundsAuthority: false,
            economicStateMutation: false,
            productionAuthority: false,
            sandboxOnly: true,
            productionFundsMoved: false
          },
          now: new Date(recordedAt)
        });
        const response = {
          creditOutcomeId: outcome.creditOutcomeId,
          outcomeHash: outcome.outcomeHash,
          obligationId: outcome.obligationId,
          outcomeLabel: outcome.outcomeLabel,
          nonAuthorizing: true,
          productionAuthority: false,
          schemaVersion: "credit_outcome_materialization_result.v1"
        };
        const commandHash = hashId("credit_outcome_materialization_command", {
          obligationId: outcome.obligationId,
          outcomeHash: outcome.outcomeHash
        });
        const committed = await this.eventRepository.appendCommandBatchInTransaction(client, {
          aggregateType: "credit_outcome",
          aggregateId: outcome.creditOutcomeId,
          idempotencyKey: `credit-outcome:${outcome.obligationId}`,
          commandHash,
          events: [{
            aggregateType: "credit_outcome",
            aggregateId: outcome.creditOutcomeId,
            expectedVersion: 0,
            event
          }],
          response,
          applyProjection: ({ client: projectionClient, committed: committedEvents }) =>
            insertOutcome(projectionClient, outcome, committedEvents)
        });
        outcomes.push({ ...committed.response, replayed: committed.replayed });
      }
      return Object.freeze({
        candidateCount: candidates.rowCount,
        materializedCount: outcomes.length,
        outcomes: Object.freeze(outcomes),
        nonAuthorizing: true,
        productionAuthority: false,
        schemaVersion: "credit_outcome_materialization_batch.v1"
      });
    });
  }
}
