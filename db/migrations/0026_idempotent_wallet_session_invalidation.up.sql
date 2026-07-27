-- WALLET-002: durable, retry-safe browser wallet session invalidation.
--
-- One opaque idempotency reference is retained for each explicitly invalidated
-- session. Session/CSRF/idempotency plaintext, wallet addresses, Provider
-- metadata, signatures, and account proofs are never stored here.

CREATE TABLE authentication_session_invalidations (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  idempotency_ref_hash TEXT NOT NULL CHECK (
    idempotency_ref_hash ~ '^[A-Za-z0-9_-]{43}$'
  ),
  session_ref_hash TEXT NOT NULL CHECK (
    session_ref_hash ~ '^[A-Za-z0-9_-]{43}$'
  ),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'human_logout',
      'wallet_account_changed',
      'wallet_chain_changed',
      'wallet_provider_changed',
      'wallet_provider_disconnected'
    )
  ),
  occurred_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'wallet_session_invalidation.v1'
  ),
  CONSTRAINT authentication_session_invalidations_pkey PRIMARY KEY (
    tenant_id, idempotency_ref_hash
  ),
  CONSTRAINT authentication_session_invalidations_session_key UNIQUE (
    tenant_id, session_ref_hash
  ),
  CONSTRAINT authentication_session_invalidations_session_fk FOREIGN KEY (
    tenant_id, session_ref_hash
  ) REFERENCES authentication_sessions(tenant_id, session_ref_hash)
);

CREATE FUNCTION guard_authentication_session_invalidation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Wallet session invalidations are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER authentication_session_invalidations_projection_guard
BEFORE INSERT OR UPDATE OR DELETE ON authentication_session_invalidations
FOR EACH ROW EXECUTE FUNCTION guard_authentication_session_invalidation();

ALTER TABLE authentication_session_invalidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE authentication_session_invalidations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_authentication_session_invalidations
ON authentication_session_invalidations
USING (tenant_id = current_app_tenant_id())
WITH CHECK (tenant_id = current_app_tenant_id());

CREATE TRIGGER tenant_context_guard_authentication_session_invalidations
BEFORE INSERT OR UPDATE OR DELETE ON authentication_session_invalidations
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX authentication_session_invalidations_session_idx
  ON authentication_session_invalidations(tenant_id, session_ref_hash, occurred_at DESC);
