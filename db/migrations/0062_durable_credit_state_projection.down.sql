DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM credit_state_projections) THEN
    RAISE EXCEPTION 'cannot roll back durable Credit State while projections exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS credit_state_projections_tenant_latest_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_credit_state_projections
  ON credit_state_projections;
DROP POLICY IF EXISTS tenant_isolation_credit_state_projections
  ON credit_state_projections;
ALTER TABLE credit_state_projections DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS credit_state_projections;
