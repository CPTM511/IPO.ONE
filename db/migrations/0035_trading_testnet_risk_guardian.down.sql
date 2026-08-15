DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trading_testnet_protective_transitions)
     OR EXISTS (SELECT 1 FROM trading_testnet_protective_controls)
  THEN
    RAISE EXCEPTION
      'cannot roll back Trading Testnet Risk Guardian while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS
  trading_testnet_protective_transitions_tenant_control_idx;
DROP INDEX IF EXISTS
  trading_testnet_protective_controls_tenant_facility_state_idx;

DROP TRIGGER IF EXISTS
  tenant_context_guard_trading_testnet_protective_transitions
  ON trading_testnet_protective_transitions;
DROP POLICY IF EXISTS
  tenant_isolation_trading_testnet_protective_transitions
  ON trading_testnet_protective_transitions;
ALTER TABLE trading_testnet_protective_transitions
  DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS
  tenant_context_guard_trading_testnet_protective_controls
  ON trading_testnet_protective_controls;
DROP POLICY IF EXISTS tenant_isolation_trading_testnet_protective_controls
  ON trading_testnet_protective_controls;
ALTER TABLE trading_testnet_protective_controls
  DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS
  trading_testnet_protective_transitions_immutable_guard
  ON trading_testnet_protective_transitions;
DROP TRIGGER IF EXISTS
  trading_testnet_protective_controls_transition_guard
  ON trading_testnet_protective_controls;

DROP TABLE IF EXISTS trading_testnet_protective_transitions;
DROP TABLE IF EXISTS trading_testnet_protective_controls;

DROP FUNCTION IF EXISTS guard_immutable_trading_testnet_protective_transition();
DROP FUNCTION IF EXISTS guard_trading_testnet_protective_control();
