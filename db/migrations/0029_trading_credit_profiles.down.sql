DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trading_credit_profiles) THEN
    RAISE EXCEPTION 'cannot roll back trading credit profiles while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS trading_credit_profiles_tenant_stage_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_trading_credit_profiles
  ON trading_credit_profiles;
DROP POLICY IF EXISTS tenant_isolation_trading_credit_profiles
  ON trading_credit_profiles;
ALTER TABLE trading_credit_profiles DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trading_credit_profiles_projection_guard
  ON trading_credit_profiles;
DROP TABLE IF EXISTS trading_credit_profiles;
DROP FUNCTION IF EXISTS guard_trading_credit_profile_projection();
