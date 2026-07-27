DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM official_report_artifacts) THEN
    RAISE EXCEPTION 'cannot roll back official report artifacts while records exist';
  END IF;
END;
$$;

DELETE FROM abuse_capacity_buckets
 WHERE kind = 'official_report_artifacts';

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates', 'credit_intents', 'credit_decisions',
    'open_obligations', 'providers', 'credentials', 'access_grants',
    'pilot_feedback_records', 'credit_passport_artifacts'
  ));

DROP INDEX IF EXISTS official_report_artifacts_tenant_expiry_idx;
DROP INDEX IF EXISTS official_report_artifacts_tenant_obligation_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_official_report_artifacts
  ON official_report_artifacts;
DROP POLICY IF EXISTS tenant_isolation_official_report_artifacts
  ON official_report_artifacts;
ALTER TABLE official_report_artifacts DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS official_report_artifacts_projection_guard
  ON official_report_artifacts;
DROP TABLE IF EXISTS official_report_artifacts;
DROP FUNCTION IF EXISTS guard_official_report_artifact_projection();
