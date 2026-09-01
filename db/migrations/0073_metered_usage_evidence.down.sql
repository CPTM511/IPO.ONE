DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM metered_usage_admissions)
     OR EXISTS (SELECT 1 FROM metered_usage_evidence) THEN
    RAISE EXCEPTION 'cannot roll back metered usage while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS metered_usage_admissions_obligation_idx;
DROP INDEX IF EXISTS metered_usage_evidence_obligation_idx;
DROP POLICY IF EXISTS tenant_isolation_metered_usage_admissions ON metered_usage_admissions;
DROP POLICY IF EXISTS tenant_isolation_metered_usage_evidence ON metered_usage_evidence;
DROP TRIGGER IF EXISTS tenant_context_guard_metered_usage_admissions ON metered_usage_admissions;
DROP TRIGGER IF EXISTS tenant_context_guard_metered_usage_evidence ON metered_usage_evidence;
ALTER TABLE metered_usage_admissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE metered_usage_evidence DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS metered_usage_admissions_immutable ON metered_usage_admissions;
DROP TRIGGER IF EXISTS metered_usage_evidence_immutable ON metered_usage_evidence;
DROP TABLE IF EXISTS metered_usage_admissions;
DROP TABLE IF EXISTS metered_usage_evidence;
DROP FUNCTION IF EXISTS metered_usage_immutable_guard();
