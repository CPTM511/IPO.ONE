-- CREDIT-OUTCOME-001: immutable, Evidence-derived no-funds outcome labels.
--
-- These records are model inputs and audit artifacts only. They cannot approve
-- credit, mutate economic state, move funds, or substitute future features
-- into the original decision snapshot.

CREATE TABLE credit_outcomes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  outcome_hash TEXT NOT NULL CHECK (outcome_hash ~ '^0x[0-9a-f]{64}$'),
  risk_decision_id TEXT NOT NULL,
  decision_hash TEXT NOT NULL CHECK (decision_hash ~ '^0x[0-9a-f]{64}$'),
  decision_passport_hash TEXT NOT NULL CHECK (
    decision_passport_hash ~ '^0x[0-9a-f]{64}$'
  ),
  feature_snapshot_hash TEXT NOT NULL CHECK (
    feature_snapshot_hash ~ '^0x[0-9a-f]{64}$'
  ),
  policy_hash TEXT NOT NULL CHECK (policy_hash ~ '^0x[0-9a-f]{64}$'),
  decision_feature_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(decision_feature_snapshot) = 'object'
    AND decision_feature_snapshot->>'schemaVersion' = 'risk_feature_snapshot.v1'
    AND decision_feature_snapshot->>'featureSnapshotHash' = feature_snapshot_hash
    AND decision_feature_snapshot->>'policyHash' = policy_hash
    AND decision_feature_snapshot->>'sandboxOnly' = 'true'
    AND decision_feature_snapshot->>'productionAuthority' = 'false'
  ),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  obligation_terminal_hash TEXT NOT NULL CHECK (
    obligation_terminal_hash ~ '^0x[0-9a-f]{64}$'
  ),
  outcome_label TEXT NOT NULL CHECK (
    outcome_label IN ('on_time_repaid', 'late_or_modified_repaid', 'written_off')
  ),
  max_days_past_due INTEGER NOT NULL CHECK (max_days_past_due >= 0),
  restructured BOOLEAN NOT NULL,
  repurchased BOOLEAN NOT NULL,
  original_principal_minor NUMERIC(78,0) NOT NULL CHECK (
    original_principal_minor > 0
  ),
  total_repaid_minor NUMERIC(78,0) NOT NULL CHECK (total_repaid_minor >= 0),
  loss_minor NUMERIC(78,0) NOT NULL CHECK (loss_minor >= 0),
  repayment_ratio_bps INTEGER NOT NULL CHECK (
    repayment_ratio_bps BETWEEN 0 AND 10000
  ),
  source_evidence_hashes JSONB NOT NULL CHECK (
    jsonb_typeof(source_evidence_hashes) = 'array'
    AND jsonb_array_length(source_evidence_hashes) BETWEEN 2 AND 256
  ),
  outcome_finalized_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL CHECK (recorded_at >= outcome_finalized_at),
  source_event_id TEXT NOT NULL,
  outcome_evidence_hash TEXT NOT NULL CHECK (
    outcome_evidence_hash ~ '^0x[0-9a-f]{64}$'
  ),
  outcome JSONB NOT NULL,
  outcome_finalized BOOLEAN NOT NULL CHECK (outcome_finalized = TRUE),
  future_feature_substitution_allowed BOOLEAN NOT NULL CHECK (
    future_feature_substitution_allowed = FALSE
  ),
  authorizing BOOLEAN NOT NULL CHECK (authorizing = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  economic_state_mutation BOOLEAN NOT NULL CHECK (
    economic_state_mutation = FALSE
  ),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  pii_included BOOLEAN NOT NULL CHECK (pii_included = FALSE),
  raw_transaction_data_included BOOLEAN NOT NULL CHECK (
    raw_transaction_data_included = FALSE
  ),
  score_authoritative BOOLEAN NOT NULL CHECK (score_authoritative = FALSE),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'credit_outcome.v1'),
  CONSTRAINT credit_outcomes_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT credit_outcomes_tenant_hash_key UNIQUE (tenant_id, outcome_hash),
  CONSTRAINT credit_outcomes_tenant_obligation_key UNIQUE (
    tenant_id, obligation_id
  ),
  CONSTRAINT credit_outcomes_risk_decision_fk
    FOREIGN KEY (tenant_id, risk_decision_id)
    REFERENCES risk_decisions(tenant_id, id),
  CONSTRAINT credit_outcomes_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT credit_outcomes_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT credit_outcomes_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  CONSTRAINT credit_outcomes_source_event_fk
    FOREIGN KEY (tenant_id, source_event_id) REFERENCES domain_events(tenant_id, id),
  CONSTRAINT credit_outcomes_outcome_identity_check CHECK (
    outcome->>'creditOutcomeId' = id
    AND outcome->>'outcomeHash' = outcome_hash
    AND outcome->>'riskDecisionId' = risk_decision_id
    AND outcome->>'decisionHash' = decision_hash
    AND outcome->>'decisionPassportHash' = decision_passport_hash
    AND outcome->>'featureSnapshotHash' = feature_snapshot_hash
    AND outcome->>'policyHash' = policy_hash
    AND outcome->>'subjectId' = subject_id
    AND outcome->>'principalId' = principal_id
    AND outcome->>'assetId' = asset_id
    AND outcome->>'obligationId' = obligation_id
    AND outcome->>'obligationTerminalHash' = obligation_terminal_hash
    AND outcome->>'outcomeLabel' = outcome_label
    AND (outcome->>'maxDaysPastDue')::INTEGER = max_days_past_due
    AND (outcome->>'restructured')::BOOLEAN = restructured
    AND (outcome->>'repurchased')::BOOLEAN = repurchased
    AND outcome->>'originalPrincipalMinor' = original_principal_minor::TEXT
    AND outcome->>'totalRepaidMinor' = total_repaid_minor::TEXT
    AND outcome->>'lossMinor' = loss_minor::TEXT
    AND (outcome->>'repaymentRatioBps')::INTEGER = repayment_ratio_bps
    AND outcome->'sourceEvidenceHashes' = source_evidence_hashes
    AND (outcome->>'outcomeFinalizedAt')::TIMESTAMPTZ = outcome_finalized_at
    AND (outcome->>'recordedAt')::TIMESTAMPTZ = recorded_at
    AND outcome->'decisionFeatureSnapshot' = decision_feature_snapshot
    AND outcome->>'schemaVersion' = schema_version
  ),
  CONSTRAINT credit_outcomes_outcome_safety_check CHECK (
    outcome @> jsonb_build_object(
      'authorizing', false,
      'economicStateMutation', false,
      'fundsAuthority', false,
      'futureFeatureSubstitutionAllowed', false,
      'outcomeFinalized', true,
      'piiIncluded', false,
      'productionAuthority', false,
      'productionFundsMoved', false,
      'rawTransactionDataIncluded', false,
      'sandboxOnly', true,
      'scoreAuthoritative', false
    )
  ),
  CONSTRAINT credit_outcomes_label_economics_check CHECK (
    (
      outcome_label = 'written_off'
      AND loss_minor > 0
    )
    OR (
      outcome_label IN ('on_time_repaid', 'late_or_modified_repaid')
      AND loss_minor = 0
      AND repayment_ratio_bps = 10000
    )
  )
);

CREATE TRIGGER credit_outcomes_immutable_guard
BEFORE UPDATE OR DELETE ON credit_outcomes
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

ALTER TABLE credit_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_outcomes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_credit_outcomes ON credit_outcomes
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_credit_outcomes
BEFORE INSERT OR UPDATE OR DELETE ON credit_outcomes
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX credit_outcomes_tenant_subject_finalized_idx
  ON credit_outcomes(tenant_id, subject_id, outcome_finalized_at DESC, id);
