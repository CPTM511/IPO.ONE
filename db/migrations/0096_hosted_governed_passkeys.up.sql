-- B4-H: governed canonical HTTPS adapter over the same durable authentication kernel.
-- No Actor, membership, enrollment or credential is created.
CREATE TABLE IF NOT EXISTS authentication_passkeys (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  id TEXT NOT NULL CHECK (id ~ '^passkey_[0-9a-f-]{36}$'),
  actor_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  credential_version BIGINT NOT NULL CHECK (credential_version > 0),
  rp_id TEXT NOT NULL CHECK (rp_id = 'localhost'),
  credential_key TEXT NOT NULL CHECK (char_length(credential_key) BETWEEN 16 AND 1400 AND credential_key ~ '^[A-Za-z0-9_-]+$'),
  public_key TEXT NOT NULL CHECK (char_length(public_key) BETWEEN 22 AND 5462 AND public_key ~ '^[A-Za-z0-9_-]+$'),
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
CREATE INDEX IF NOT EXISTS authentication_passkeys_actor_idx ON authentication_passkeys(tenant_id,actor_id);
CREATE TABLE IF NOT EXISTS authentication_passkey_challenges (
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
CREATE INDEX IF NOT EXISTS authentication_passkey_challenges_session_idx ON authentication_passkey_challenges(tenant_id,session_ref_hash,created_at);
CREATE TABLE IF NOT EXISTS authentication_passkey_evidence (
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
CREATE INDEX IF NOT EXISTS authentication_passkey_evidence_session_idx ON authentication_passkey_evidence(tenant_id,session_ref_hash,verified_at);
CREATE TABLE IF NOT EXISTS authentication_passkey_audit (
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
CREATE OR REPLACE FUNCTION guard_authentication_passkey_projection() RETURNS TRIGGER AS $$
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
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=relation AND policyname='tenant_isolation_'||relation) THEN
    EXECUTE format('CREATE POLICY tenant_isolation_%I ON %I USING (tenant_id = current_app_tenant_id()) WITH CHECK (tenant_id = current_app_tenant_id())', relation, relation);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=relation::regclass AND tgname='tenant_context_guard_'||relation) THEN
    EXECUTE format('CREATE TRIGGER tenant_context_guard_%I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context()', relation, relation);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=relation::regclass AND tgname='passkey_projection_guard') THEN
    EXECUTE format('CREATE TRIGGER passkey_projection_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_authentication_passkey_projection()', relation);
    END IF;
  END LOOP;
END $$;

ALTER TABLE authentication_passkeys DROP CONSTRAINT authentication_passkeys_rp_id_check;
ALTER TABLE authentication_passkeys ADD CONSTRAINT authentication_passkeys_rp_id_check CHECK(rp_id IN ('localhost','ipo.one'));
ALTER TABLE authentication_passkey_challenges DROP CONSTRAINT authentication_passkey_challenges_rp_id_check;
ALTER TABLE authentication_passkey_challenges ADD CONSTRAINT authentication_passkey_challenges_rp_id_check CHECK(rp_id IN ('localhost','ipo.one'));
-- Preserve exactly the previously applied local-origin expression; append one
-- canonical pair, never an arbitrary HTTPS hostname or localhost credential reuse.
DO $$ DECLARE old_check TEXT; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_check FROM pg_constraint
 WHERE conrelid='authentication_passkey_challenges'::regclass AND conname='authentication_passkey_challenges_origin_check';
 ALTER TABLE authentication_passkey_challenges DROP CONSTRAINT authentication_passkey_challenges_origin_check;
 EXECUTE 'ALTER TABLE authentication_passkey_challenges ADD CONSTRAINT authentication_passkey_challenges_origin_check CHECK (('||old_check||') OR origin=''https://ipo.one'')';
END $$;
ALTER TABLE authentication_passkey_challenges ADD CONSTRAINT authentication_passkey_challenges_origin_rp_pair CHECK (
 (rp_id='ipo.one' AND origin='https://ipo.one') OR (rp_id='localhost' AND origin<>'https://ipo.one')
);
-- Governed Human role structure only; no memberships or credentials are granted.
ALTER TABLE authentication_role_enrollments DROP CONSTRAINT authentication_role_enrollments_role_bundle_check;
ALTER TABLE authentication_role_enrollments ADD CONSTRAINT authentication_role_enrollments_role_bundle_check CHECK (role_bundle IN ('human_borrower', 'principal_controller', 'capital_partner_operator', 'risk_operator', 'operations_operator', 'auditor'));
ALTER TABLE authentication_wallet_transactions DROP CONSTRAINT authentication_wallet_transactions_requested_role_check;
ALTER TABLE authentication_wallet_transactions ADD CONSTRAINT authentication_wallet_transactions_requested_role_check CHECK (requested_role IS NULL OR requested_role IN ('human_borrower', 'principal_controller', 'capital_partner_operator', 'risk_operator', 'operations_operator', 'auditor'));

CREATE OR REPLACE FUNCTION authentication_session_role_binding_is_valid(
  tenant_id_value TEXT,
  credential_id_value TEXT,
  actor_id_value TEXT,
  roles_value JSONB,
  capabilities_value JSONB,
  client_id_value TEXT,
  policy_version_value TEXT,
  at_value TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN jsonb_typeof(roles_value) <> 'array'
      OR jsonb_array_length(roles_value) <> 1 THEN FALSE
    WHEN roles_value->>0 IN ('human_borrower', 'principal_controller', 'capital_partner_operator', 'risk_operator', 'operations_operator', 'auditor') THEN EXISTS (
      SELECT 1
        FROM authentication_role_enrollments AS e
       WHERE e.tenant_id = tenant_id_value
         AND e.credential_id = credential_id_value
         AND e.actor_id = actor_id_value
         AND e.role_bundle = roles_value->>0
         AND e.capabilities = capabilities_value
         AND e.client_ids ? client_id_value
         AND e.policy_version = policy_version_value
         AND e.status = 'active'
         AND e.valid_from <= at_value
         AND (e.expires_at IS NULL OR e.expires_at > at_value)
    )
    ELSE EXISTS (
      SELECT 1
        FROM authentication_credentials AS c
       WHERE c.tenant_id = tenant_id_value
         AND c.id = credential_id_value
         AND c.roles = roles_value
         AND c.allowed_capabilities = capabilities_value
    )
  END;
$$ LANGUAGE sql STABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION authentication_event_payload_is_valid(
  event_type_value TEXT,
  payload_value JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
  object_key_count INTEGER;
BEGIN
  IF jsonb_typeof(payload_value) <> 'object' THEN
    RETURN FALSE;
  END IF;
  SELECT count(*) INTO object_key_count FROM jsonb_object_keys(payload_value);
  CASE event_type_value
    WHEN 'credential_registered' THEN
      RETURN object_key_count BETWEEN 4 AND 6
        AND payload_value ?& ARRAY[
          'actorType', 'clientAuthenticationMethod', 'senderConstraintMethod', 'version'
        ]
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_object_keys(payload_value) AS keys(key)
          WHERE key NOT IN (
            'actorType', 'clientAuthenticationMethod', 'senderConstraintMethod',
            'version', 'invitationRefHash', 'referenceHashKeyVersion'
          )
        )
        AND (
          NOT payload_value ? 'invitationRefHash'
          OR payload_value->>'invitationRefHash' ~ '^[A-Za-z0-9_-]{43}$'
        )
        AND (
          NOT payload_value ? 'referenceHashKeyVersion'
          OR payload_value->>'referenceHashKeyVersion' IN ('v1', 'v2')
        )
        AND payload_value->>'actorType' IN (
          'human', 'agent', 'provider', 'risk_operator', 'operations_operator',
          'auditor', 'system_worker'
        )
        AND payload_value->>'clientAuthenticationMethod' IN (
          'oidc_pkce_bff', 'siwe', 'private_key_jwt', 'mtls'
        )
        AND payload_value->>'senderConstraintMethod' IN ('dpop', 'host_session', 'mtls')
        AND jsonb_typeof(payload_value->'version') = 'number'
        AND (payload_value->>'version') ~ '^[1-9][0-9]*$';
    WHEN 'credential_rotated' THEN
      RETURN object_key_count IN (2, 3)
        AND payload_value ?& ARRAY['senderConstraintMethod', 'version']
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_object_keys(payload_value) AS keys(key)
          WHERE key NOT IN ('senderConstraintMethod', 'version', 'referenceHashKeyVersion')
        )
        AND (
          NOT payload_value ? 'referenceHashKeyVersion'
          OR payload_value->>'referenceHashKeyVersion' IN ('v1', 'v2')
        )
        AND payload_value->>'senderConstraintMethod' IN ('dpop', 'host_session', 'mtls')
        AND jsonb_typeof(payload_value->'version') = 'number'
        AND (payload_value->>'version') ~ '^[1-9][0-9]*$';
    WHEN 'credential_suspended', 'credential_revoked', 'credential_expired' THEN
      RETURN object_key_count = 1
        AND payload_value ? 'status'
        AND payload_value->>'status' IN ('suspended', 'revoked', 'expired');
    WHEN 'credential_reference_rebound' THEN
      RETURN object_key_count = 4
        AND payload_value ?& ARRAY[
          'oldCredentialId', 'newCredentialId',
          'oldReferenceHashKeyVersion', 'newReferenceHashKeyVersion'
        ]
        AND payload_value->>'oldCredentialId' ~ '^credential_[0-9a-f-]{36}$'
        AND payload_value->>'newCredentialId' ~ '^credential_[0-9a-f-]{36}$'
        AND payload_value->>'oldReferenceHashKeyVersion' = 'v1'
        AND payload_value->>'newReferenceHashKeyVersion' = 'v2';
    WHEN 'session_created', 'session_rotated', 'session_revoked', 'session_expired' THEN
      RETURN object_key_count IN (2, 3)
        AND payload_value ?& ARRAY['sessionRefHash', 'rotation']
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_object_keys(payload_value) AS keys(key)
          WHERE key NOT IN ('sessionRefHash', 'rotation', 'referenceHashKeyVersion')
        )
        AND (
          NOT payload_value ? 'referenceHashKeyVersion'
          OR payload_value->>'referenceHashKeyVersion' IN ('v1', 'v2')
        )
        AND payload_value->>'sessionRefHash' ~ '^[A-Za-z0-9_-]{43}$'
        AND jsonb_typeof(payload_value->'rotation') = 'number'
        AND (payload_value->>'rotation') ~ '^[0-9]+$';
    WHEN 'role_enrolled' THEN
      RETURN object_key_count = 3
        AND payload_value ?& ARRAY['roleBundle', 'enrollmentId', 'version']
        AND payload_value->>'roleBundle' IN ('human_borrower', 'principal_controller', 'capital_partner_operator', 'risk_operator', 'operations_operator', 'auditor')
        AND payload_value->>'enrollmentId' ~ '^role_enrollment_[0-9a-f-]{36}$'
        AND jsonb_typeof(payload_value->'version') = 'number'
        AND (payload_value->>'version') ~ '^[1-9][0-9]*$';
    WHEN 'role_selected' THEN
      RETURN object_key_count IN (2, 3)
        AND payload_value ?& ARRAY['roleBundle', 'sessionRefHash']
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_object_keys(payload_value) AS keys(key)
          WHERE key NOT IN ('roleBundle', 'sessionRefHash', 'referenceHashKeyVersion')
        )
        AND (
          NOT payload_value ? 'referenceHashKeyVersion'
          OR payload_value->>'referenceHashKeyVersion' IN ('v1', 'v2')
        )
        AND payload_value->>'roleBundle' IN ('human_borrower', 'principal_controller', 'capital_partner_operator', 'risk_operator', 'operations_operator', 'auditor')
        AND payload_value->>'sessionRefHash' ~ '^[A-Za-z0-9_-]{43}$';
    WHEN 'reference_hash_cutover' THEN
      RETURN object_key_count = 3
        AND payload_value ?& ARRAY['fromKeyVersion', 'toKeyVersion', 'mode']
        AND payload_value->>'fromKeyVersion' = 'v1'
        AND payload_value->>'toKeyVersion' = 'v2'
        AND payload_value->>'mode' = 'single_v2';
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;



DO $$ DECLARE auth_role RECORD; BEGIN
 FOR auth_role IN SELECT DISTINCT g.grantee FROM information_schema.role_table_grants g
 JOIN pg_roles r ON r.rolname=g.grantee
 WHERE g.table_schema='public' AND g.table_name='authentication_sessions' AND g.privilege_type='INSERT'
 AND g.grantee<>current_user AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit
 AND NOT has_table_privilege(r.oid,'obligations','INSERT')
 LOOP
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON authentication_passkeys, authentication_passkey_challenges TO %I',auth_role.grantee);
  EXECUTE format('GRANT SELECT, INSERT ON authentication_passkey_evidence, authentication_passkey_audit TO %I',auth_role.grantee);
 END LOOP;
END $$;
