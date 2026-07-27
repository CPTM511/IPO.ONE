DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trading_performance_proofs)
     OR EXISTS (SELECT 1 FROM trading_settlements)
     OR EXISTS (SELECT 1 FROM trading_facility_close_requests)
  THEN
    RAISE EXCEPTION
      'cannot roll back Trading Capital settlement while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS trading_performance_proofs_tenant_expires_idx;
DROP INDEX IF EXISTS trading_settlements_tenant_settled_idx;
DROP INDEX IF EXISTS trading_facility_close_requests_tenant_requested_idx;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_performance_proofs
  ON trading_performance_proofs;
DROP POLICY IF EXISTS tenant_isolation_trading_performance_proofs
  ON trading_performance_proofs;
ALTER TABLE trading_performance_proofs DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_settlements
  ON trading_settlements;
DROP POLICY IF EXISTS tenant_isolation_trading_settlements
  ON trading_settlements;
ALTER TABLE trading_settlements DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_facility_close_requests
  ON trading_facility_close_requests;
DROP POLICY IF EXISTS tenant_isolation_trading_facility_close_requests
  ON trading_facility_close_requests;
ALTER TABLE trading_facility_close_requests DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trading_performance_proofs_immutable_guard
  ON trading_performance_proofs;
DROP TRIGGER IF EXISTS trading_settlements_immutable_guard
  ON trading_settlements;
DROP TRIGGER IF EXISTS trading_facility_close_requests_immutable_guard
  ON trading_facility_close_requests;

DROP TABLE IF EXISTS trading_performance_proofs;
DROP TABLE IF EXISTS trading_settlements;
DROP TABLE IF EXISTS trading_facility_close_requests;

DROP FUNCTION IF EXISTS guard_immutable_trading_settlement_projection();
