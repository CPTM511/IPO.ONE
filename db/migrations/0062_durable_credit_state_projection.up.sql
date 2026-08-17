-- CREDIT-STATE-001: deterministic, outcome-derived, non-authorizing state.

CREATE TABLE credit_state_projections (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  projection_hash TEXT NOT NULL CHECK (projection_hash ~ '^0x[0-9a-f]{64}$'),
  projection_version INTEGER NOT NULL CHECK (projection_version > 0),
  projected_outcome_count INTEGER NOT NULL CHECK (projected_outcome_count > 0),
  latest_outcome_hash TEXT NOT NULL CHECK (latest_outcome_hash ~ '^0x[0-9a-f]{64}$'),
  latest_outcome_finalized_at TIMESTAMPTZ NOT NULL,
  projection JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'credit_state_projection.v1'),
  PRIMARY KEY (tenant_id, subject_id),
  CONSTRAINT credit_state_projections_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT credit_state_projections_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT credit_state_projection_identity_check CHECK (
    projection->>'subjectId' = subject_id
    AND projection->>'principalId' = principal_id
    AND projection->>'creditStateHash' = projection_hash
    AND (projection->>'projectionVersion')::INTEGER = projection_version
    AND (projection->'metrics'->>'completedCycleCount')::INTEGER = projected_outcome_count
    AND projection->'latestOutcome'->>'outcomeHash' = latest_outcome_hash
    AND (projection->'latestOutcome'->>'outcomeFinalizedAt')::TIMESTAMPTZ = latest_outcome_finalized_at
    AND (projection->>'updatedAt')::TIMESTAMPTZ = updated_at
    AND projection->>'schemaVersion' = schema_version
  ),
  CONSTRAINT credit_state_projection_safety_check CHECK (
    projection @> jsonb_build_object(
      'authorizing', false,
      'automaticLimitChange', false,
      'fundsAuthority', false,
      'piiIncluded', false,
      'productionAuthority', false,
      'productionFundsMoved', false,
      'rawTransactionDataIncluded', false,
      'sandboxOnly', true,
      'scoreAuthoritative', false
    )
  )
);

ALTER TABLE credit_state_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_state_projections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_credit_state_projections
  ON credit_state_projections
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_credit_state_projections
BEFORE INSERT OR UPDATE OR DELETE ON credit_state_projections
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX credit_state_projections_tenant_latest_idx
  ON credit_state_projections(
    tenant_id,
    latest_outcome_finalized_at DESC,
    subject_id
  );
