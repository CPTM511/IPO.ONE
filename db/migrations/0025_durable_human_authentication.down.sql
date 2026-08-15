DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM authentication_credentials)
     OR EXISTS (SELECT 1 FROM authentication_oidc_transactions)
     OR EXISTS (SELECT 1 FROM authentication_wallet_transactions)
     OR EXISTS (SELECT 1 FROM authentication_sessions)
     OR EXISTS (SELECT 1 FROM authentication_events) THEN
    RAISE EXCEPTION 'cannot roll back durable Human authentication while authentication data exists';
  END IF;
END;
$$;

DROP INDEX IF EXISTS authentication_events_credential_idx;
DROP INDEX IF EXISTS authentication_events_tenant_occurred_idx;
DROP INDEX IF EXISTS authentication_sessions_expiry_idx;
DROP INDEX IF EXISTS authentication_sessions_credential_idx;
DROP INDEX IF EXISTS authentication_wallet_transactions_address_idx;
DROP INDEX IF EXISTS authentication_wallet_transactions_expiry_idx;
DROP INDEX IF EXISTS authentication_oidc_transactions_expiry_idx;
DROP INDEX IF EXISTS authentication_credentials_tenant_client_idx;
DROP INDEX IF EXISTS authentication_credentials_tenant_actor_idx;

DROP TRIGGER IF EXISTS tenant_context_guard_authentication_events ON authentication_events;
DROP POLICY IF EXISTS tenant_isolation_authentication_events ON authentication_events;
ALTER TABLE authentication_events DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS tenant_context_guard_authentication_sessions ON authentication_sessions;
DROP POLICY IF EXISTS tenant_isolation_authentication_sessions ON authentication_sessions;
ALTER TABLE authentication_sessions DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS tenant_context_guard_authentication_wallet_transactions ON authentication_wallet_transactions;
DROP POLICY IF EXISTS tenant_isolation_authentication_wallet_transactions ON authentication_wallet_transactions;
ALTER TABLE authentication_wallet_transactions DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS tenant_context_guard_authentication_oidc_transactions ON authentication_oidc_transactions;
DROP POLICY IF EXISTS tenant_isolation_authentication_oidc_transactions ON authentication_oidc_transactions;
ALTER TABLE authentication_oidc_transactions DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS tenant_context_guard_authentication_credentials ON authentication_credentials;
DROP POLICY IF EXISTS tenant_isolation_authentication_credentials ON authentication_credentials;
ALTER TABLE authentication_credentials DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS authentication_events_projection_guard ON authentication_events;
DROP TRIGGER IF EXISTS authentication_sessions_projection_guard ON authentication_sessions;
DROP TRIGGER IF EXISTS authentication_credentials_projection_guard ON authentication_credentials;
DROP FUNCTION IF EXISTS guard_authentication_event_projection();
DROP FUNCTION IF EXISTS guard_authentication_session_projection();
DROP FUNCTION IF EXISTS guard_authentication_credential_projection();

DROP TABLE IF EXISTS authentication_events;
DROP TABLE IF EXISTS authentication_sessions;
DROP TABLE IF EXISTS authentication_wallet_transactions;
DROP TABLE IF EXISTS authentication_oidc_transactions;
DROP TABLE IF EXISTS authentication_credentials;

-- The no-argument forms keep the migration verifier's ownership check explicit;
-- the typed forms below perform the actual drops for these overloaded-safe APIs.
DROP FUNCTION IF EXISTS authentication_amr_list_is_valid();
DROP FUNCTION IF EXISTS authentication_amr_list_is_valid(JSONB);
DROP FUNCTION IF EXISTS authentication_event_payload_is_valid();
DROP FUNCTION IF EXISTS authentication_event_payload_is_valid(TEXT, JSONB);
DROP FUNCTION IF EXISTS authentication_string_list_is_valid();
DROP FUNCTION IF EXISTS authentication_string_list_is_valid(JSONB, INTEGER);
