DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trading_testnet_settlement_runs) THEN
    RAISE EXCEPTION
      'cannot roll back Trading Testnet settlement while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS trading_testnet_settlement_runs_tenant_subject_idx;
DROP INDEX IF EXISTS trading_testnet_settlement_runs_tenant_state_idx;

DROP TRIGGER IF EXISTS
  tenant_context_guard_trading_testnet_settlement_runs
  ON trading_testnet_settlement_runs;
DROP POLICY IF EXISTS
  tenant_isolation_trading_testnet_settlement_runs
  ON trading_testnet_settlement_runs;
ALTER TABLE trading_testnet_settlement_runs DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS
  trading_testnet_settlement_runs_transition_guard
  ON trading_testnet_settlement_runs;
DROP TABLE IF EXISTS trading_testnet_settlement_runs;
DROP FUNCTION IF EXISTS guard_trading_testnet_settlement_run();
