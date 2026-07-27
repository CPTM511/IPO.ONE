DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trading_testnet_execution_transitions)
     OR EXISTS (SELECT 1 FROM trading_testnet_execution_records)
     OR EXISTS (SELECT 1 FROM trading_execution_nonce_heads)
  THEN
    RAISE EXCEPTION
      'cannot roll back Trading Testnet execution while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS
  trading_testnet_execution_transitions_tenant_execution_idx;
DROP INDEX IF EXISTS trading_testnet_execution_records_tenant_order_idx;
DROP INDEX IF EXISTS
  trading_testnet_execution_records_tenant_facility_state_idx;

DROP TRIGGER IF EXISTS
  tenant_context_guard_trading_testnet_execution_transitions
  ON trading_testnet_execution_transitions;
DROP POLICY IF EXISTS
  tenant_isolation_trading_testnet_execution_transitions
  ON trading_testnet_execution_transitions;
ALTER TABLE trading_testnet_execution_transitions DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_testnet_execution_records
  ON trading_testnet_execution_records;
DROP POLICY IF EXISTS tenant_isolation_trading_testnet_execution_records
  ON trading_testnet_execution_records;
ALTER TABLE trading_testnet_execution_records DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_execution_nonce_heads
  ON trading_execution_nonce_heads;
DROP POLICY IF EXISTS tenant_isolation_trading_execution_nonce_heads
  ON trading_execution_nonce_heads;
ALTER TABLE trading_execution_nonce_heads DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS
  trading_testnet_execution_transitions_immutable_guard
  ON trading_testnet_execution_transitions;
DROP TRIGGER IF EXISTS trading_testnet_execution_records_transition_guard
  ON trading_testnet_execution_records;
DROP TRIGGER IF EXISTS trading_execution_nonce_heads_transition_guard
  ON trading_execution_nonce_heads;

DROP TABLE IF EXISTS trading_testnet_execution_transitions;
DROP TABLE IF EXISTS trading_testnet_execution_records;
DROP TABLE IF EXISTS trading_execution_nonce_heads;

DROP FUNCTION IF EXISTS guard_immutable_trading_testnet_execution_transition();
DROP FUNCTION IF EXISTS guard_trading_testnet_execution_record();
DROP FUNCTION IF EXISTS guard_trading_execution_nonce_head();
