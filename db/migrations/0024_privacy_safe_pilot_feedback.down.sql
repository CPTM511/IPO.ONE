DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pilot_feedback_records) THEN
    RAISE EXCEPTION 'cannot roll back privacy-safe pilot feedback while records exist';
  END IF;
END;
$$;

DELETE FROM abuse_capacity_buckets
 WHERE kind = 'pilot_feedback_records';

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates', 'credit_intents', 'credit_decisions',
    'open_obligations', 'providers', 'credentials', 'access_grants'
  ));

DROP INDEX IF EXISTS pilot_feedback_records_tenant_summary_idx;
DROP INDEX IF EXISTS pilot_feedback_records_tenant_recorded_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_pilot_feedback_records ON pilot_feedback_records;
DROP POLICY IF EXISTS tenant_isolation_pilot_feedback_records ON pilot_feedback_records;
ALTER TABLE pilot_feedback_records DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS pilot_feedback_records_projection_guard ON pilot_feedback_records;
DROP TABLE IF EXISTS pilot_feedback_records;
DROP FUNCTION IF EXISTS guard_pilot_feedback_record_projection();
ALTER TABLE subjects
  DROP CONSTRAINT subjects_tenant_id_subject_type_key;
