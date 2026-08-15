-- AUTHN-004: durable, tenant-isolated Human authentication truth.
--
-- Opaque browser/OIDC/SIWE values are never persisted in plaintext. Reference
-- hashes use the keyed AUTHN hasher (base64url SHA-256, 43 characters); the
-- two transaction secret pairs are encrypted envelopes required only to finish
-- the one-use exchange/verification.

CREATE FUNCTION authentication_string_list_is_valid(value JSONB, maximum_items INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  item TEXT;
BEGIN
  IF jsonb_typeof(value) <> 'array' THEN
    RETURN FALSE;
  END IF;

  IF jsonb_array_length(value) > maximum_items THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(value) AS entries(entry_value)
     WHERE jsonb_typeof(entries.entry_value) <> 'string'
  ) THEN
    RETURN FALSE;
  END IF;

  FOR item IN SELECT jsonb_array_elements_text(value) LOOP
    IF length(item) < 2
       OR length(item) > 128
       OR item !~ '^[a-z][a-z0-9_.:-]{1,127}$' THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements_text(value) AS entries(entry_value)
     GROUP BY entries.entry_value
    HAVING count(*) > 1
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

CREATE FUNCTION authentication_event_payload_is_valid(
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

  SELECT count(*) INTO object_key_count
    FROM jsonb_object_keys(payload_value);

  CASE event_type_value
    WHEN 'credential_registered' THEN
      RETURN object_key_count = 4
        AND payload_value ?& ARRAY[
          'actorType', 'clientAuthenticationMethod', 'senderConstraintMethod', 'version'
        ]
        AND payload_value ->> 'actorType' IN (
          'human', 'agent', 'provider', 'risk_operator', 'operations_operator', 'auditor', 'system_worker'
        )
        AND payload_value ->> 'clientAuthenticationMethod' IN (
          'oidc_pkce_bff', 'siwe', 'private_key_jwt', 'mtls'
        )
        AND payload_value ->> 'senderConstraintMethod' IN ('dpop', 'host_session', 'mtls')
        AND jsonb_typeof(payload_value -> 'version') = 'number'
        AND (payload_value ->> 'version') ~ '^[1-9][0-9]*$';
    WHEN 'credential_rotated' THEN
      RETURN object_key_count = 2
        AND payload_value ?& ARRAY['senderConstraintMethod', 'version']
        AND payload_value ->> 'senderConstraintMethod' IN ('dpop', 'host_session', 'mtls')
        AND jsonb_typeof(payload_value -> 'version') = 'number'
        AND (payload_value ->> 'version') ~ '^[1-9][0-9]*$';
    WHEN 'credential_suspended', 'credential_revoked', 'credential_expired' THEN
      RETURN object_key_count = 1
        AND payload_value ? 'status'
        AND payload_value ->> 'status' IN ('suspended', 'revoked', 'expired');
    WHEN 'session_created', 'session_rotated', 'session_revoked', 'session_expired' THEN
      RETURN object_key_count = 2
        AND payload_value ?& ARRAY['sessionRefHash', 'rotation']
        AND payload_value ->> 'sessionRefHash' ~ '^[A-Za-z0-9_-]{43}$'
        AND jsonb_typeof(payload_value -> 'rotation') = 'number'
        AND (payload_value ->> 'rotation') ~ '^[0-9]+$';
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

CREATE FUNCTION authentication_amr_list_is_valid(value JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  item TEXT;
BEGIN
  IF jsonb_typeof(value) <> 'array' THEN
    RETURN FALSE;
  END IF;

  IF jsonb_array_length(value) NOT BETWEEN 1 AND 8 THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(value) AS entries(entry_value)
     WHERE jsonb_typeof(entries.entry_value) <> 'string'
  ) THEN
    RETURN FALSE;
  END IF;

  FOR item IN SELECT jsonb_array_elements_text(value) LOOP
    IF length(item) < 2
       OR length(item) > 128
       OR item !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$' THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements_text(value) AS entries(entry_value)
     GROUP BY entries.entry_value
    HAVING count(*) > 1
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

CREATE TABLE authentication_credentials (
  id TEXT PRIMARY KEY CHECK (id ~ '^credential_[0-9a-f-]{36}$'),
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  actor_type actor_type NOT NULL,
  issuer TEXT NOT NULL CHECK (
    issuer ~ '^https://[^/?#[:space:]]+(?::[0-9]{1,5})?$'
  ),
  subject_ref_hash TEXT NOT NULL CHECK (subject_ref_hash ~ '^[A-Za-z0-9_-]{43}$'),
  client_id TEXT NOT NULL CHECK (client_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$'),
  client_authentication_method TEXT NOT NULL CHECK (
    client_authentication_method IN ('oidc_pkce_bff', 'siwe', 'private_key_jwt', 'mtls')
  ),
  sender_constraint_method TEXT NOT NULL CHECK (
    sender_constraint_method IN ('dpop', 'host_session', 'mtls')
  ),
  sender_constraint_ref_hash TEXT NOT NULL CHECK (
    sender_constraint_ref_hash ~ '^[A-Za-z0-9_-]{43}$'
  ),
  roles JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (authentication_string_list_is_valid(roles, 16)),
  allowed_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
    authentication_string_list_is_valid(allowed_capabilities, 64)
  ),
  policy_version TEXT NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$'),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'authentication_credential.v1'),
  CONSTRAINT authentication_credentials_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT authentication_credentials_tenant_actor_fk FOREIGN KEY (tenant_id, actor_id)
    REFERENCES memberships(tenant_id, actor_id),
  CONSTRAINT authentication_credentials_subject_binding_key UNIQUE (
    tenant_id, issuer, client_id, subject_ref_hash
  ),
  CONSTRAINT authentication_credentials_profile_check CHECK (
    (
      actor_type IN ('human', 'risk_operator', 'operations_operator', 'auditor')
      AND client_authentication_method IN ('oidc_pkce_bff', 'siwe')
      AND sender_constraint_method = 'host_session'
    )
    OR
    (
      actor_type NOT IN ('human', 'risk_operator', 'operations_operator', 'auditor')
      AND client_authentication_method IN ('private_key_jwt', 'mtls')
      AND sender_constraint_method IN ('dpop', 'mtls')
    )
  ),
  CONSTRAINT authentication_credentials_expiry_check CHECK (
    expires_at IS NULL OR expires_at > created_at
  ),
  CONSTRAINT authentication_credentials_updated_check CHECK (updated_at >= created_at)
);

CREATE TABLE authentication_oidc_transactions (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  handle_ref_hash TEXT NOT NULL CHECK (handle_ref_hash ~ '^[A-Za-z0-9_-]{43}$'),
  state_ref_hash TEXT NOT NULL CHECK (state_ref_hash ~ '^[A-Za-z0-9_-]{43}$'),
  provider_id TEXT NOT NULL CHECK (provider_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$'),
  redirect_uri TEXT NOT NULL CHECK (
    redirect_uri ~ '^https://[^/?#[:space:]]+(?::[0-9]{1,5})?/[^?#[:space:]]*(\?provider=[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255})?$'
  ),
  nonce_ciphertext TEXT NOT NULL CHECK (
    length(nonce_ciphertext) BETWEEN 40 AND 24000
    AND nonce_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
  ),
  code_verifier_ciphertext TEXT NOT NULL CHECK (
    length(code_verifier_ciphertext) BETWEEN 40 AND 24000
    AND code_verifier_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'authentication_oidc_transaction.v1'),
  CONSTRAINT authentication_oidc_transactions_pkey PRIMARY KEY (tenant_id, handle_ref_hash),
  CONSTRAINT authentication_oidc_transactions_state_key UNIQUE (tenant_id, state_ref_hash),
  CONSTRAINT authentication_oidc_transactions_expiry_check CHECK (
    expires_at > created_at AND expires_at <= created_at + INTERVAL '10 minutes'
  )
);

CREATE TABLE authentication_wallet_transactions (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  handle_ref_hash TEXT NOT NULL CHECK (handle_ref_hash ~ '^[A-Za-z0-9_-]{43}$'),
  address_ref_hash TEXT NOT NULL CHECK (address_ref_hash ~ '^[A-Za-z0-9_-]{43}$'),
  address_ciphertext TEXT NOT NULL CHECK (
    length(address_ciphertext) BETWEEN 40 AND 24000
    AND address_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
  ),
  chain_id INTEGER NOT NULL CHECK (chain_id IN (84532, 1952)),
  message_ciphertext TEXT NOT NULL CHECK (
    length(message_ciphertext) BETWEEN 40 AND 24000
    AND message_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'authentication_wallet_transaction.v1'),
  CONSTRAINT authentication_wallet_transactions_pkey PRIMARY KEY (tenant_id, handle_ref_hash),
  CONSTRAINT authentication_wallet_transactions_expiry_check CHECK (
    expires_at > created_at AND expires_at <= created_at + INTERVAL '10 minutes'
  )
);

CREATE TABLE authentication_sessions (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  session_ref_hash TEXT NOT NULL CHECK (session_ref_hash ~ '^[A-Za-z0-9_-]{43}$'),
  csrf_ref_hash TEXT NOT NULL CHECK (csrf_ref_hash ~ '^[A-Za-z0-9_-]{43}$'),
  credential_id TEXT NOT NULL,
  credential_version BIGINT NOT NULL CHECK (credential_version BETWEEN 1 AND 9007199254740991),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  actor_type actor_type NOT NULL,
  client_id TEXT NOT NULL CHECK (client_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$'),
  authentication_method TEXT NOT NULL CHECK (authentication_method IN ('oidc_pkce_bff', 'siwe')),
  sender_constraint_method TEXT NOT NULL CHECK (sender_constraint_method = 'host_session'),
  policy_version TEXT NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$'),
  roles JSONB NOT NULL CHECK (authentication_string_list_is_valid(roles, 16)),
  allowed_capabilities JSONB NOT NULL CHECK (authentication_string_list_is_valid(allowed_capabilities, 64)),
  token_jti_ref_hash TEXT NOT NULL CHECK (token_jti_ref_hash ~ '^[A-Za-z0-9_-]{43}$'),
  auth_time TIMESTAMPTZ NOT NULL,
  acr TEXT NOT NULL CHECK (length(acr) BETWEEN 2 AND 256),
  amr JSONB NOT NULL CHECK (authentication_amr_list_is_valid(amr)),
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'rotated', 'revoked', 'expired')),
  rotation BIGINT NOT NULL CHECK (rotation BETWEEN 0 AND 9007199254740991),
  revoked_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  end_reason_code TEXT CHECK (end_reason_code IS NULL OR end_reason_code ~ '^[a-z][a-z0-9_]{1,95}$'),
  schema_version TEXT NOT NULL CHECK (schema_version = 'authentication_session.v1'),
  CONSTRAINT authentication_sessions_pkey PRIMARY KEY (tenant_id, session_ref_hash),
  CONSTRAINT authentication_sessions_credential_fk FOREIGN KEY (tenant_id, credential_id)
    REFERENCES authentication_credentials(tenant_id, id),
  CONSTRAINT authentication_sessions_tenant_actor_fk FOREIGN KEY (tenant_id, actor_id)
    REFERENCES memberships(tenant_id, actor_id),
  CONSTRAINT authentication_sessions_time_check CHECK (
    created_at <= last_seen_at
    AND last_seen_at < idle_expires_at
    AND idle_expires_at <= last_seen_at + INTERVAL '2 hours'
    AND idle_expires_at <= absolute_expires_at
    AND absolute_expires_at <= created_at + INTERVAL '24 hours'
    AND auth_time <= absolute_expires_at
    AND auth_time <= created_at + INTERVAL '60 seconds'
  ),
  CONSTRAINT authentication_sessions_terminal_check CHECK (
    (status = 'active' AND revoked_at IS NULL AND rotated_at IS NULL AND expired_at IS NULL AND end_reason_code IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL AND rotated_at IS NULL AND expired_at IS NULL AND end_reason_code IS NOT NULL)
    OR (status = 'rotated' AND revoked_at IS NULL AND rotated_at IS NOT NULL AND expired_at IS NULL AND end_reason_code IS NOT NULL)
    OR (status = 'expired' AND revoked_at IS NULL AND rotated_at IS NULL AND expired_at IS NOT NULL AND end_reason_code IS NOT NULL)
  )
);

CREATE TABLE authentication_events (
  id TEXT PRIMARY KEY CHECK (id ~ '^auth_event_[0-9a-f-]{36}$'),
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'credential_registered', 'credential_rotated', 'credential_suspended',
    'credential_revoked', 'credential_expired', 'session_created',
    'session_rotated', 'session_revoked', 'session_expired'
  )),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  credential_id TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,95}$'),
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL CHECK (authentication_event_payload_is_valid(event_type, payload)),
  schema_version TEXT NOT NULL CHECK (schema_version = 'authentication_event.v1'),
  CONSTRAINT authentication_events_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT authentication_events_tenant_actor_fk FOREIGN KEY (tenant_id, actor_id)
    REFERENCES memberships(tenant_id, actor_id),
  CONSTRAINT authentication_events_credential_fk FOREIGN KEY (tenant_id, credential_id)
    REFERENCES authentication_credentials(tenant_id, id)
);

CREATE FUNCTION guard_authentication_credential_projection()
RETURNS TRIGGER AS $$
DECLARE
  matching_actor actors%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication credentials cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO matching_actor FROM actors WHERE id = NEW.actor_id;
    IF NOT FOUND OR matching_actor.actor_type <> NEW.actor_type OR matching_actor.status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication credential requires an active matching actor';
    END IF;
    IF NEW.status <> 'active' OR NEW.version <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication credential must begin active at version one';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(
    NEW.tenant_id, NEW.actor_id, NEW.actor_type, NEW.issuer, NEW.subject_ref_hash,
    NEW.client_id, NEW.client_authentication_method, NEW.roles, NEW.allowed_capabilities,
    NEW.policy_version, NEW.expires_at, NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.actor_id, OLD.actor_type, OLD.issuer, OLD.subject_ref_hash,
    OLD.client_id, OLD.client_authentication_method, OLD.roles, OLD.allowed_capabilities,
    OLD.policy_version, OLD.expires_at, OLD.created_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication credential binding is immutable';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication credential updated_at cannot move backwards';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'active' AND NEW.status IN ('suspended', 'revoked', 'expired'))
      OR (OLD.status = 'suspended' AND NEW.status = 'revoked')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid authentication credential status transition';
    END IF;
    IF NEW.version <> OLD.version OR NEW.sender_constraint_method <> OLD.sender_constraint_method
       OR NEW.sender_constraint_ref_hash <> OLD.sender_constraint_ref_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Credential status transition cannot rotate a credential';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.version = OLD.version THEN
    IF NEW.sender_constraint_method IS DISTINCT FROM OLD.sender_constraint_method
       OR NEW.sender_constraint_ref_hash IS DISTINCT FROM OLD.sender_constraint_ref_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Credential sender constraint requires a versioned rotation';
    END IF;
  ELSIF NEW.version = OLD.version + 1 AND OLD.status = 'active' AND NEW.status = 'active' THEN
    IF ROW(NEW.sender_constraint_method, NEW.sender_constraint_ref_hash)
       IS NOT DISTINCT FROM ROW(OLD.sender_constraint_method, OLD.sender_constraint_ref_hash) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Credential rotation requires a new sender constraint';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid authentication credential version transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_authentication_session_projection()
RETURNS TRIGGER AS $$
DECLARE
  credential authentication_credentials%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication sessions require a guarded terminal transition';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO credential
      FROM authentication_credentials
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.credential_id;
    IF NOT FOUND
       OR credential.status <> 'active'
       OR (credential.expires_at IS NOT NULL AND credential.expires_at <= NEW.created_at)
       OR ROW(
         NEW.credential_version, NEW.actor_id, NEW.actor_type, NEW.client_id,
         NEW.authentication_method, NEW.policy_version, NEW.roles, NEW.allowed_capabilities
       ) IS DISTINCT FROM ROW(
         credential.version, credential.actor_id, credential.actor_type, credential.client_id,
         credential.client_authentication_method, credential.policy_version,
         credential.roles, credential.allowed_capabilities
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication session requires a current active credential binding';
    END IF;
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication session must begin active';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(
    NEW.tenant_id, NEW.session_ref_hash, NEW.csrf_ref_hash, NEW.credential_id,
    NEW.credential_version, NEW.actor_id, NEW.actor_type, NEW.client_id,
    NEW.authentication_method, NEW.sender_constraint_method, NEW.policy_version,
    NEW.roles, NEW.allowed_capabilities, NEW.token_jti_ref_hash, NEW.auth_time,
    NEW.acr, NEW.amr, NEW.created_at, NEW.absolute_expires_at, NEW.rotation,
    NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.session_ref_hash, OLD.csrf_ref_hash, OLD.credential_id,
    OLD.credential_version, OLD.actor_id, OLD.actor_type, OLD.client_id,
    OLD.authentication_method, OLD.sender_constraint_method, OLD.policy_version,
    OLD.roles, OLD.allowed_capabilities, OLD.token_jti_ref_hash, OLD.auth_time,
    OLD.acr, OLD.amr, OLD.created_at, OLD.absolute_expires_at, OLD.rotation,
    OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication session binding is immutable';
  END IF;

  IF OLD.status <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Terminal authentication session is immutable';
  END IF;

  IF NEW.status = 'active' THEN
    IF NEW.revoked_at IS NOT NULL OR NEW.rotated_at IS NOT NULL OR NEW.expired_at IS NOT NULL
       OR NEW.end_reason_code IS NOT NULL
       OR NEW.last_seen_at < OLD.last_seen_at
       OR NEW.idle_expires_at < NEW.last_seen_at
       OR NEW.idle_expires_at > NEW.absolute_expires_at THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid active authentication session refresh';
    END IF;
    SELECT * INTO credential
      FROM authentication_credentials
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.credential_id;
    IF NOT FOUND
       OR credential.status <> 'active'
       OR credential.version <> NEW.credential_version
       OR (credential.expires_at IS NOT NULL AND credential.expires_at <= NEW.last_seen_at) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication session refresh requires a current active credential';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.last_seen_at <> OLD.last_seen_at OR NEW.idle_expires_at <> OLD.idle_expires_at
     OR NOT (
       (NEW.status = 'revoked' AND NEW.revoked_at IS NOT NULL)
       OR (NEW.status = 'rotated' AND NEW.rotated_at IS NOT NULL)
       OR (NEW.status = 'expired' AND NEW.expired_at IS NOT NULL)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid authentication session terminal transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_authentication_event_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication events are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER authentication_credentials_projection_guard
BEFORE INSERT OR UPDATE OR DELETE ON authentication_credentials
FOR EACH ROW EXECUTE FUNCTION guard_authentication_credential_projection();
CREATE TRIGGER authentication_sessions_projection_guard
BEFORE INSERT OR UPDATE OR DELETE ON authentication_sessions
FOR EACH ROW EXECUTE FUNCTION guard_authentication_session_projection();
CREATE TRIGGER authentication_events_projection_guard
BEFORE INSERT OR UPDATE OR DELETE ON authentication_events
FOR EACH ROW EXECUTE FUNCTION guard_authentication_event_projection();

DO $$
DECLARE
  table_name TEXT;
  tenant_tables CONSTANT TEXT[] := ARRAY[
    'authentication_credentials', 'authentication_oidc_transactions',
    'authentication_wallet_transactions', 'authentication_sessions',
    'authentication_events'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_app_tenant_id()) WITH CHECK (tenant_id = current_app_tenant_id())',
      'tenant_isolation_' || table_name,
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context()',
      'tenant_context_guard_' || table_name,
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX authentication_credentials_tenant_actor_idx
  ON authentication_credentials(tenant_id, actor_id, status, updated_at DESC);
CREATE INDEX authentication_credentials_tenant_client_idx
  ON authentication_credentials(tenant_id, issuer, client_id, status);
CREATE INDEX authentication_oidc_transactions_expiry_idx
  ON authentication_oidc_transactions(tenant_id, expires_at, handle_ref_hash);
CREATE INDEX authentication_wallet_transactions_expiry_idx
  ON authentication_wallet_transactions(tenant_id, expires_at, handle_ref_hash);
CREATE INDEX authentication_wallet_transactions_address_idx
  ON authentication_wallet_transactions(tenant_id, address_ref_hash, expires_at);
CREATE INDEX authentication_sessions_credential_idx
  ON authentication_sessions(tenant_id, credential_id, status, last_seen_at DESC);
CREATE INDEX authentication_sessions_expiry_idx
  ON authentication_sessions(tenant_id, status, idle_expires_at, absolute_expires_at);
CREATE INDEX authentication_events_tenant_occurred_idx
  ON authentication_events(tenant_id, occurred_at DESC, id);
CREATE INDEX authentication_events_credential_idx
  ON authentication_events(tenant_id, credential_id, occurred_at DESC);
