DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trading_facility_risk_evaluations)
     OR EXISTS (SELECT 1 FROM trading_order_intents)
     OR EXISTS (SELECT 1 FROM trading_facilities)
  THEN
    RAISE EXCEPTION
      'cannot roll back Trading Capital facilities while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS
  trading_facility_risk_evaluations_tenant_facility_idx;
DROP INDEX IF EXISTS trading_order_intents_tenant_facility_state_idx;
DROP INDEX IF EXISTS trading_facilities_tenant_state_idx;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_facility_risk_evaluations
  ON trading_facility_risk_evaluations;
DROP POLICY IF EXISTS tenant_isolation_trading_facility_risk_evaluations
  ON trading_facility_risk_evaluations;
ALTER TABLE trading_facility_risk_evaluations DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_order_intents
  ON trading_order_intents;
DROP POLICY IF EXISTS tenant_isolation_trading_order_intents
  ON trading_order_intents;
ALTER TABLE trading_order_intents DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_facilities
  ON trading_facilities;
DROP POLICY IF EXISTS tenant_isolation_trading_facilities
  ON trading_facilities;
ALTER TABLE trading_facilities DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trading_facility_risk_evaluations_immutable_guard
  ON trading_facility_risk_evaluations;
DROP TRIGGER IF EXISTS trading_order_intents_transition_guard
  ON trading_order_intents;
DROP TRIGGER IF EXISTS trading_facilities_transition_guard
  ON trading_facilities;

DROP TABLE IF EXISTS trading_facility_risk_evaluations;
DROP TABLE IF EXISTS trading_order_intents;
DROP TABLE IF EXISTS trading_facilities;

DROP FUNCTION IF EXISTS guard_immutable_trading_facility_risk_evaluation();
DROP FUNCTION IF EXISTS guard_trading_order_intent_transition();
DROP FUNCTION IF EXISTS guard_trading_facility_transition();
DROP FUNCTION IF EXISTS trading_risk_state_rank(TEXT);
