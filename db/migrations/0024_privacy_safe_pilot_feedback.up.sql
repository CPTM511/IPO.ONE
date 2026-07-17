ALTER TABLE subjects
  ADD CONSTRAINT subjects_tenant_id_subject_type_key
    UNIQUE (tenant_id, id, subject_type);

CREATE TABLE pilot_feedback_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  feedback_hash TEXT NOT NULL CHECK (feedback_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  entry_mode subject_type NOT NULL CHECK (entry_mode IN ('human', 'agent')),
  surface TEXT NOT NULL CHECK (surface IN (
    'human_portfolio', 'human_application', 'human_offer', 'human_payments',
    'agent_protocol', 'agent_sdk', 'agent_mcp', 'evidence', 'servicing'
  )),
  lifecycle_stage TEXT NOT NULL CHECK (lifecycle_stage IN (
    'onboarding', 'application', 'offer', 'obligation', 'execution',
    'repayment', 'servicing', 'evidence'
  )),
  sentiment TEXT NOT NULL CHECK (sentiment IN (
    'blocked', 'difficult', 'neutral', 'easy', 'valuable'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'incomplete', 'completed', 'needs_support'
  )),
  blocker_code TEXT NOT NULL CHECK (blocker_code IN (
    'none', 'unclear_copy', 'missing_capability', 'authentication',
    'authority_setup', 'identity_proof', 'credit_terms', 'execution',
    'repayment', 'servicing', 'evidence', 'integration', 'other_no_text'
  )),
  recorded_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'pilot_feedback_record.v1'),
  CONSTRAINT pilot_feedback_records_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT pilot_feedback_records_tenant_hash_key UNIQUE (tenant_id, feedback_hash),
  CONSTRAINT pilot_feedback_records_subject_mode_fk
    FOREIGN KEY (tenant_id, subject_id, entry_mode)
    REFERENCES subjects(tenant_id, id, subject_type),
  CONSTRAINT pilot_feedback_records_surface_mode_check CHECK (
    (entry_mode = 'human' AND surface NOT IN ('agent_protocol', 'agent_sdk', 'agent_mcp'))
    OR
    (entry_mode = 'agent' AND surface NOT IN (
      'human_portfolio', 'human_application', 'human_offer', 'human_payments'
    ))
  ),
  CONSTRAINT pilot_feedback_records_blocker_outcome_check CHECK (
    (outcome = 'completed' AND blocker_code = 'none')
    OR
    (outcome <> 'completed')
  )
);

CREATE FUNCTION guard_pilot_feedback_record_projection()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'Pilot feedback records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pilot_feedback_records_projection_guard
BEFORE UPDATE OR DELETE ON pilot_feedback_records
FOR EACH ROW EXECUTE FUNCTION guard_pilot_feedback_record_projection();

ALTER TABLE pilot_feedback_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_feedback_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pilot_feedback_records ON pilot_feedback_records
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_pilot_feedback_records
BEFORE INSERT OR UPDATE OR DELETE ON pilot_feedback_records
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX pilot_feedback_records_tenant_recorded_idx
  ON pilot_feedback_records(tenant_id, recorded_at DESC, id);
CREATE INDEX pilot_feedback_records_tenant_summary_idx
  ON pilot_feedback_records(
    tenant_id, entry_mode, sentiment, outcome, blocker_code, recorded_at DESC
  );

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates', 'credit_intents', 'credit_decisions',
    'open_obligations', 'providers', 'credentials', 'access_grants',
    'pilot_feedback_records'
  ));
