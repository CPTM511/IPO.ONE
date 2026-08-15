DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trading_testnet_reconciliation_runs)
  THEN
    RAISE EXCEPTION
      'cannot roll back Trading Testnet reconciliation while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS
  trading_testnet_reconciliation_runs_tenant_circuit_idx;
DROP INDEX IF EXISTS
  trading_testnet_reconciliation_runs_tenant_facility_state_idx;

DROP TRIGGER IF EXISTS
  tenant_context_guard_trading_testnet_reconciliation_runs
  ON trading_testnet_reconciliation_runs;
DROP POLICY IF EXISTS
  tenant_isolation_trading_testnet_reconciliation_runs
  ON trading_testnet_reconciliation_runs;
ALTER TABLE trading_testnet_reconciliation_runs
  DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS
  trading_testnet_reconciliation_runs_transition_guard
  ON trading_testnet_reconciliation_runs;

DROP TABLE IF EXISTS trading_testnet_reconciliation_runs;

DROP FUNCTION IF EXISTS guard_trading_testnet_reconciliation_run();
