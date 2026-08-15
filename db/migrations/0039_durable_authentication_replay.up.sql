-- PREDEPLOY-001: durable, multi-instance DPoP replay protection.
--
-- Only keyed references are persisted. Raw DPoP proofs, public keys, tokens,
-- account identifiers, and JTIs never cross this boundary.

CREATE TABLE authentication_replay_entries (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id()
    REFERENCES tenants(id),
  reference_hash TEXT NOT NULL CHECK (
    reference_hash ~ '^[A-Za-z0-9_-]{43}$'
  ),
  namespace TEXT NOT NULL CHECK (
    namespace ~ '^[a-z][a-z0-9_.-]{0,63}$'
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'authentication_replay_entry.v1'
  ),
  CONSTRAINT authentication_replay_entries_pkey
    PRIMARY KEY (tenant_id, reference_hash),
  CONSTRAINT authentication_replay_entries_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + INTERVAL '24 hours'
  )
);

CREATE FUNCTION guard_authentication_replay_entry()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.expires_at <= clock_timestamp() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'Authentication replay entries are immutable until expiry';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER authentication_replay_entries_guard
BEFORE INSERT OR UPDATE OR DELETE ON authentication_replay_entries
FOR EACH ROW EXECUTE FUNCTION guard_authentication_replay_entry();

ALTER TABLE authentication_replay_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE authentication_replay_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_authentication_replay_entries
  ON authentication_replay_entries
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_authentication_replay_entries
BEFORE INSERT OR UPDATE OR DELETE ON authentication_replay_entries
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX authentication_replay_entries_expiry_idx
  ON authentication_replay_entries(
    tenant_id,
    expires_at,
    reference_hash
  );
