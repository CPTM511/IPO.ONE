DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM authentication_events
    WHERE event_type IN ('role_enrolled', 'role_selected')
  ) OR EXISTS (
    SELECT 1
      FROM authentication_role_enrollments AS e
      JOIN authentication_credentials AS c
        ON c.tenant_id = e.tenant_id AND c.id = e.credential_id
     WHERE e.role_bundle IS DISTINCT FROM c.roles->>0
  ) THEN
    RAISE EXCEPTION
      'cannot roll back selected Human role enrollment after enrollment or selection evidence exists';
  END IF;
END;
$$;

ALTER TABLE authentication_events
  DROP CONSTRAINT authentication_events_event_type_check;
ALTER TABLE authentication_events
  ADD CONSTRAINT authentication_events_event_type_check CHECK (event_type IN (
    'credential_registered', 'credential_rotated', 'credential_suspended',
    'credential_revoked', 'credential_expired', 'session_created',
    'session_rotated', 'session_revoked', 'session_expired'
  ));

CREATE OR REPLACE FUNCTION authentication_event_payload_is_valid(
  event_type_value TEXT,
  payload_value JSONB
)
RETURNS BOOLEAN AS $$
DECLARE object_key_count INTEGER;
BEGIN
  IF jsonb_typeof(payload_value) <> 'object' THEN RETURN FALSE; END IF;
  SELECT count(*) INTO object_key_count FROM jsonb_object_keys(payload_value);
  CASE event_type_value
    WHEN 'credential_registered' THEN
      RETURN object_key_count IN (4, 5)
        AND payload_value ?& ARRAY['actorType','clientAuthenticationMethod','senderConstraintMethod','version']
        AND (object_key_count = 4 OR (payload_value ? 'invitationRefHash' AND payload_value->>'invitationRefHash' ~ '^[A-Za-z0-9_-]{43}$'))
        AND payload_value->>'actorType' IN ('human','agent','provider','risk_operator','operations_operator','auditor','system_worker')
        AND payload_value->>'clientAuthenticationMethod' IN ('oidc_pkce_bff','siwe','private_key_jwt','mtls')
        AND payload_value->>'senderConstraintMethod' IN ('dpop','host_session','mtls')
        AND jsonb_typeof(payload_value->'version') = 'number'
        AND (payload_value->>'version') ~ '^[1-9][0-9]*$';
    WHEN 'credential_rotated' THEN
      RETURN object_key_count = 2
        AND payload_value ?& ARRAY['senderConstraintMethod','version']
        AND payload_value->>'senderConstraintMethod' IN ('dpop','host_session','mtls')
        AND jsonb_typeof(payload_value->'version') = 'number'
        AND (payload_value->>'version') ~ '^[1-9][0-9]*$';
    WHEN 'credential_suspended','credential_revoked','credential_expired' THEN
      RETURN object_key_count = 1 AND payload_value ? 'status'
        AND payload_value->>'status' IN ('suspended','revoked','expired');
    WHEN 'session_created','session_rotated','session_revoked','session_expired' THEN
      RETURN object_key_count = 2
        AND payload_value ?& ARRAY['sessionRefHash','rotation']
        AND payload_value->>'sessionRefHash' ~ '^[A-Za-z0-9_-]{43}$'
        AND jsonb_typeof(payload_value->'rotation') = 'number'
        AND (payload_value->>'rotation') ~ '^[0-9]+$';
    ELSE RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

ALTER TABLE authentication_wallet_transactions
  DROP CONSTRAINT authentication_wallet_transactions_requested_role_check;
ALTER TABLE authentication_wallet_transactions DROP COLUMN requested_role;

CREATE OR REPLACE FUNCTION guard_authentication_session_projection()
RETURNS TRIGGER AS $$
DECLARE
  credential authentication_credentials%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication sessions require a guarded terminal transition';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO credential FROM authentication_credentials
     WHERE tenant_id = NEW.tenant_id AND id = NEW.credential_id;
    IF NOT FOUND OR credential.status <> 'active'
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
       OR NEW.end_reason_code IS NOT NULL OR NEW.last_seen_at < OLD.last_seen_at
       OR NEW.idle_expires_at < NEW.last_seen_at
       OR NEW.idle_expires_at > NEW.absolute_expires_at THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid active authentication session refresh';
    END IF;
    SELECT * INTO credential FROM authentication_credentials
     WHERE tenant_id = NEW.tenant_id AND id = NEW.credential_id;
    IF NOT FOUND OR credential.status <> 'active'
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

DROP FUNCTION IF EXISTS authentication_session_role_binding_is_valid(
  TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TIMESTAMPTZ
);

DROP INDEX IF EXISTS authentication_role_enrollments_actor_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_authentication_role_enrollments
  ON authentication_role_enrollments;
DROP POLICY IF EXISTS tenant_isolation_authentication_role_enrollments
  ON authentication_role_enrollments;
ALTER TABLE authentication_role_enrollments DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS authentication_role_enrollments;
