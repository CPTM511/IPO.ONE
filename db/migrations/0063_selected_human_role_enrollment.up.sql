-- IDENTITY-ACCEPTANCE-UNBLOCK-001: one canonical Human identity may hold
-- multiple reviewed roles, while each session selects exactly one role.

CREATE TABLE authentication_role_enrollments (
  id TEXT PRIMARY KEY CHECK (id ~ '^role_enrollment_[0-9a-f-]{36}$'),
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  credential_id TEXT NOT NULL,
  role_bundle TEXT NOT NULL CHECK (
    role_bundle IN ('human_borrower', 'principal_controller')
  ),
  capabilities JSONB NOT NULL CHECK (
    authentication_string_list_is_valid(capabilities, 64)
  ),
  client_ids JSONB NOT NULL CHECK (
    authentication_string_list_is_valid(client_ids, 16)
  ),
  policy_version TEXT NOT NULL CHECK (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$'
  ),
  status membership_status NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'authentication_role_enrollment.v1'
  ),
  CONSTRAINT authentication_role_enrollments_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT authentication_role_enrollments_credential_fk
    FOREIGN KEY (tenant_id, credential_id)
    REFERENCES authentication_credentials(tenant_id, id),
  CONSTRAINT authentication_role_enrollments_actor_fk
    FOREIGN KEY (tenant_id, actor_id) REFERENCES memberships(tenant_id, actor_id),
  CONSTRAINT authentication_role_enrollments_unique_role
    UNIQUE (tenant_id, credential_id, role_bundle),
  CONSTRAINT authentication_role_enrollments_time_check CHECK (
    expires_at IS NULL OR expires_at > valid_from
  ),
  CONSTRAINT authentication_role_enrollments_updated_check CHECK (
    updated_at >= created_at
  )
);

ALTER TABLE authentication_role_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE authentication_role_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_authentication_role_enrollments
  ON authentication_role_enrollments
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());

CREATE INDEX authentication_role_enrollments_actor_idx
  ON authentication_role_enrollments(tenant_id, actor_id, role_bundle, status);

CREATE FUNCTION authentication_session_role_binding_is_valid(
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
    WHEN roles_value->>0 IN ('human_borrower', 'principal_controller') THEN EXISTS (
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

CREATE OR REPLACE FUNCTION guard_authentication_session_projection()
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
         NEW.authentication_method, NEW.policy_version
       ) IS DISTINCT FROM ROW(
         credential.version, credential.actor_id, credential.actor_type, credential.client_id,
         credential.client_authentication_method, credential.policy_version
       )
       OR NOT authentication_session_role_binding_is_valid(
         NEW.tenant_id, NEW.credential_id, NEW.actor_id, NEW.roles,
         NEW.allowed_capabilities, NEW.client_id, NEW.policy_version, NEW.created_at
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
       OR (credential.expires_at IS NOT NULL AND credential.expires_at <= NEW.last_seen_at)
       OR NOT authentication_session_role_binding_is_valid(
         NEW.tenant_id, NEW.credential_id, NEW.actor_id, NEW.roles,
         NEW.allowed_capabilities, NEW.client_id, NEW.policy_version, NEW.last_seen_at
       ) THEN
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

INSERT INTO authentication_role_enrollments(
  id, tenant_id, actor_id, credential_id, role_bundle, capabilities,
  client_ids, policy_version, status, valid_from, expires_at, version,
  created_at, updated_at, schema_version
)
SELECT
  'role_enrollment_' || substring(c.id from 12),
  c.tenant_id,
  c.actor_id,
  c.id,
  c.roles->>0,
  c.allowed_capabilities,
  jsonb_build_array(c.client_id),
  c.policy_version,
  'active'::membership_status,
  c.created_at,
  c.expires_at,
  1,
  c.created_at,
  c.updated_at,
  'authentication_role_enrollment.v1'
FROM authentication_credentials AS c
WHERE c.actor_type = 'human'
  AND c.client_authentication_method IN ('oidc_pkce_bff', 'siwe')
  AND jsonb_array_length(c.roles) = 1
  AND c.roles->>0 IN ('human_borrower', 'principal_controller');

CREATE TRIGGER tenant_context_guard_authentication_role_enrollments
BEFORE INSERT OR UPDATE OR DELETE ON authentication_role_enrollments
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE authentication_wallet_transactions
  ADD COLUMN requested_role TEXT;

ALTER TABLE authentication_wallet_transactions
  ADD CONSTRAINT authentication_wallet_transactions_requested_role_check CHECK (
    requested_role IS NULL OR
    requested_role IN ('human_borrower', 'principal_controller')
  );

ALTER TABLE authentication_events
  DROP CONSTRAINT authentication_events_event_type_check;
ALTER TABLE authentication_events
  ADD CONSTRAINT authentication_events_event_type_check CHECK (event_type IN (
    'credential_registered', 'credential_rotated', 'credential_suspended',
    'credential_revoked', 'credential_expired', 'session_created',
    'session_rotated', 'session_revoked', 'session_expired',
    'role_enrolled', 'role_selected'
  ));

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
      RETURN object_key_count IN (4, 5)
        AND payload_value ?& ARRAY[
          'actorType', 'clientAuthenticationMethod', 'senderConstraintMethod', 'version'
        ]
        AND (
          object_key_count = 4 OR (
            payload_value ? 'invitationRefHash'
            AND payload_value->>'invitationRefHash' ~ '^[A-Za-z0-9_-]{43}$'
          )
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
      RETURN object_key_count = 2
        AND payload_value ?& ARRAY['senderConstraintMethod', 'version']
        AND payload_value->>'senderConstraintMethod' IN ('dpop', 'host_session', 'mtls')
        AND jsonb_typeof(payload_value->'version') = 'number'
        AND (payload_value->>'version') ~ '^[1-9][0-9]*$';
    WHEN 'credential_suspended', 'credential_revoked', 'credential_expired' THEN
      RETURN object_key_count = 1
        AND payload_value ? 'status'
        AND payload_value->>'status' IN ('suspended', 'revoked', 'expired');
    WHEN 'session_created', 'session_rotated', 'session_revoked', 'session_expired' THEN
      RETURN object_key_count = 2
        AND payload_value ?& ARRAY['sessionRefHash', 'rotation']
        AND payload_value->>'sessionRefHash' ~ '^[A-Za-z0-9_-]{43}$'
        AND jsonb_typeof(payload_value->'rotation') = 'number'
        AND (payload_value->>'rotation') ~ '^[0-9]+$';
    WHEN 'role_enrolled' THEN
      RETURN object_key_count = 3
        AND payload_value ?& ARRAY['roleBundle', 'enrollmentId', 'version']
        AND payload_value->>'roleBundle' IN ('human_borrower', 'principal_controller')
        AND payload_value->>'enrollmentId' ~ '^role_enrollment_[0-9a-f-]{36}$'
        AND jsonb_typeof(payload_value->'version') = 'number'
        AND (payload_value->>'version') ~ '^[1-9][0-9]*$';
    WHEN 'role_selected' THEN
      RETURN object_key_count = 2
        AND payload_value ?& ARRAY['roleBundle', 'sessionRefHash']
        AND payload_value->>'roleBundle' IN ('human_borrower', 'principal_controller')
        AND payload_value->>'sessionRefHash' ~ '^[A-Za-z0-9_-]{43}$';
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;
