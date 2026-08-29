DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pilot_cases) THEN
    RAISE EXCEPTION 'cannot roll back pilot cases while cases exist';
  END IF;
END;
$$;

DELETE FROM abuse_capacity_buckets WHERE kind = 'pilot_cases';

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates', 'credit_intents', 'credit_decisions',
    'open_obligations', 'providers', 'credentials', 'access_grants',
    'pilot_feedback_records', 'credit_passport_artifacts', 'official_report_artifacts'
  ));

DROP INDEX IF EXISTS pilot_cases_tenant_queue_idx;
DROP INDEX IF EXISTS pilot_cases_tenant_subject_updated_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_pilot_cases ON pilot_cases;
DROP POLICY IF EXISTS tenant_isolation_pilot_cases ON pilot_cases;
ALTER TABLE pilot_cases DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS pilot_cases_projection_guard ON pilot_cases;
DROP TABLE IF EXISTS pilot_cases;
DROP FUNCTION IF EXISTS guard_pilot_case_projection();
