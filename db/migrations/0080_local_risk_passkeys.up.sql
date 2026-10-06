-- WEB-027K2: durable authentication evidence only. No grants to product roles.
CREATE TABLE authentication_passkeys (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  id TEXT NOT NULL CHECK (id ~ '^passkey_[0-9a-f-]{36}$'),
  actor_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  credential_version BIGINT NOT NULL CHECK (credential_version > 0),
  rp_id TEXT NOT NULL CHECK (rp_id = 'localhost'),
  credential_key TEXT NOT NULL CHECK (credential_key ~ '^[A-Za-z0-9_-]{16,1400}$'),
  public_key TEXT NOT NULL CHECK (public_key ~ '^[A-Za-z0-9_-]{22,5462}$'),
  user_handle TEXT NOT NULL CHECK (user_handle ~ '^[A-Za-z0-9_-]{43}$'),
  counter BIGINT NOT NULL CHECK (counter BETWEEN 0 AND 4294967295),
  transports JSONB NOT NULL CHECK (jsonb_typeof(transports) = 'array' AND jsonb_array_length(transports) <= 8),
  created_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ CHECK (revoked_at >= created_at),
  schema_version TEXT NOT NULL DEFAULT 'authentication_passkey.v1' CHECK (schema_version = 'authentication_passkey.v1'),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,credential_key),
  FOREIGN KEY (tenant_id,actor_id) REFERENCES memberships(tenant_id,actor_id),
  FOREIGN KEY (tenant_id,credential_id) REFERENCES authentication_credentials(tenant_id,id)
);
CREATE INDEX authentication_passkeys_actor_idx ON authentication_passkeys(tenant_id,actor_id);
CREATE TABLE authentication_passkey_challenges (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  id TEXT NOT NULL CHECK (id ~ '^passkey_challenge_[0-9a-f-]{36}$'),
  session_ref_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register','verify')),
  challenge TEXT NOT NULL CHECK (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  origin TEXT NOT NULL CHECK (origin IN ('http://localhost:8937','http://localhost:8947')),
  rp_id TEXT NOT NULL CHECK (rp_id = 'localhost'),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes'),
  used_at TIMESTAMPTZ CHECK (used_at >= created_at),
  schema_version TEXT NOT NULL DEFAULT 'authentication_passkey_challenge.v1' CHECK (schema_version = 'authentication_passkey_challenge.v1'),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,challenge),
  FOREIGN KEY (tenant_id,session_ref_hash) REFERENCES authentication_sessions(tenant_id,session_ref_hash)
);
CREATE INDEX authentication_passkey_challenges_session_idx ON authentication_passkey_challenges(tenant_id,session_ref_hash,created_at);
CREATE TABLE authentication_passkey_evidence (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  challenge_id TEXT NOT NULL,
  session_ref_hash TEXT NOT NULL,
  passkey_id TEXT NOT NULL,
  credential_version BIGINT NOT NULL CHECK (credential_version > 0),
  verified_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at = verified_at + interval '15 minutes'),
  schema_version TEXT NOT NULL DEFAULT 'authentication_passkey_evidence.v1' CHECK (schema_version = 'authentication_passkey_evidence.v1'),
  PRIMARY KEY (tenant_id,challenge_id),
  FOREIGN KEY (tenant_id,challenge_id) REFERENCES authentication_passkey_challenges(tenant_id,id),
  FOREIGN KEY (tenant_id,session_ref_hash) REFERENCES authentication_sessions(tenant_id,session_ref_hash),
  FOREIGN KEY (tenant_id,passkey_id) REFERENCES authentication_passkeys(tenant_id,id)
);
CREATE INDEX authentication_passkey_evidence_session_idx ON authentication_passkey_evidence(tenant_id,session_ref_hash,verified_at);
CREATE TABLE authentication_passkey_audit (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  id TEXT NOT NULL CHECK (id ~ '^passkey_audit_[0-9a-f-]{36}$'),
  session_ref_hash TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('challenge_created','ceremony_rejected','registered','verified','revoked','cancelled')),
  reference_id TEXT NOT NULL CHECK (reference_id ~ '^passkey(_challenge)?_[0-9a-f-]{36}$'),
  occurred_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'authentication_passkey_audit.v1' CHECK (schema_version = 'authentication_passkey_audit.v1'),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,session_ref_hash) REFERENCES authentication_sessions(tenant_id,session_ref_hash)
);
CREATE FUNCTION guard_authentication_passkey_projection() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Passkey history cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME IN ('authentication_passkey_evidence','authentication_passkey_audit') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Passkey evidence is immutable';
    ELSIF TG_TABLE_NAME = 'authentication_passkey_challenges' THEN
      IF OLD.used_at IS NOT NULL OR NEW.used_at IS NULL OR
         (to_jsonb(NEW)-'used_at') IS DISTINCT FROM (to_jsonb(OLD)-'used_at') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Passkey challenge consumption is terminal';
      END IF;
    ELSIF TG_TABLE_NAME = 'authentication_passkeys' THEN
      IF OLD.revoked_at IS NOT NULL OR NEW.counter < OLD.counter OR
         (to_jsonb(NEW)-'counter'-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'counter'-'revoked_at') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Passkey ownership is immutable and revocation terminal';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ DECLARE relation TEXT; BEGIN
  FOREACH relation IN ARRAY ARRAY['authentication_passkeys','authentication_passkey_challenges','authentication_passkey_evidence','authentication_passkey_audit'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_isolation_%I ON %I USING (tenant_id = current_app_tenant_id()) WITH CHECK (tenant_id = current_app_tenant_id())', relation, relation);
    EXECUTE format('CREATE TRIGGER tenant_context_guard_%I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context()', relation, relation);
    EXECUTE format('CREATE TRIGGER passkey_projection_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_authentication_passkey_projection()', relation);
  END LOOP;
END $$;
