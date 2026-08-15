DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM credit_outcomes) THEN
    RAISE EXCEPTION 'cannot roll back durable credit outcomes while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS credit_outcomes_tenant_subject_finalized_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_credit_outcomes
  ON credit_outcomes;
DROP POLICY IF EXISTS tenant_isolation_credit_outcomes
  ON credit_outcomes;
ALTER TABLE credit_outcomes DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS credit_outcomes_immutable_guard
  ON credit_outcomes;
DROP TABLE IF EXISTS credit_outcomes;
