DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trading_match_proposals)
     OR EXISTS (SELECT 1 FROM trading_provider_mandates)
     OR EXISTS (SELECT 1 FROM trading_capital_requests)
  THEN
    RAISE EXCEPTION 'cannot roll back Trading Capital matching while records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS trading_match_proposals_tenant_status_idx;
DROP INDEX IF EXISTS trading_provider_mandates_tenant_discovery_idx;
DROP INDEX IF EXISTS trading_capital_requests_tenant_expiry_idx;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_match_proposals
  ON trading_match_proposals;
DROP POLICY IF EXISTS tenant_isolation_trading_match_proposals
  ON trading_match_proposals;
ALTER TABLE trading_match_proposals DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_provider_mandates
  ON trading_provider_mandates;
DROP POLICY IF EXISTS tenant_isolation_trading_provider_mandates
  ON trading_provider_mandates;
ALTER TABLE trading_provider_mandates DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tenant_context_guard_trading_capital_requests
  ON trading_capital_requests;
DROP POLICY IF EXISTS tenant_isolation_trading_capital_requests
  ON trading_capital_requests;
ALTER TABLE trading_capital_requests DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trading_match_proposals_transition_guard
  ON trading_match_proposals;
DROP TRIGGER IF EXISTS trading_provider_mandates_immutable_guard
  ON trading_provider_mandates;
DROP TRIGGER IF EXISTS trading_capital_requests_immutable_guard
  ON trading_capital_requests;

DROP TABLE IF EXISTS trading_match_proposals;
DROP TABLE IF EXISTS trading_provider_mandates;
DROP TABLE IF EXISTS trading_capital_requests;

DROP FUNCTION IF EXISTS guard_trading_match_proposal_transition();
DROP FUNCTION IF EXISTS guard_immutable_trading_provider_mandate();
DROP FUNCTION IF EXISTS guard_immutable_trading_capital_request();
