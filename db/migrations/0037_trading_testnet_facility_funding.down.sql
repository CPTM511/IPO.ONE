DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM trading_testnet_facility_funding_controls
  )
  THEN
    RAISE EXCEPTION
      'cannot roll back Trading Testnet Facility funding while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS
  trading_testnet_facility_funding_controls_tenant_subject_idx;
DROP INDEX IF EXISTS
  trading_testnet_facility_funding_controls_tenant_state_idx;

DROP TRIGGER IF EXISTS
  tenant_context_guard_trading_testnet_facility_funding_controls
  ON trading_testnet_facility_funding_controls;
DROP POLICY IF EXISTS
  tenant_isolation_trading_testnet_facility_funding_controls
  ON trading_testnet_facility_funding_controls;
ALTER TABLE trading_testnet_facility_funding_controls
  DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS
  trading_testnet_facility_funding_controls_transition_guard
  ON trading_testnet_facility_funding_controls;

DROP TABLE IF EXISTS trading_testnet_facility_funding_controls;

DROP FUNCTION IF EXISTS guard_trading_testnet_facility_funding_control();
