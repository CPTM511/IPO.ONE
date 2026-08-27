-- AUTHN-008: versioned authentication reference hashes and bounded key rotation.
-- Existing hashes remain unchanged and are explicitly labeled v1. No raw
-- Subject, wallet, token, sender, network or secret material is persisted.

ALTER TABLE authentication_credentials
  ADD COLUMN reference_hash_key_version TEXT NOT NULL DEFAULT 'v1'
  CHECK (reference_hash_key_version IN ('v1', 'v2'));
ALTER TABLE authentication_oidc_transactions
  ADD COLUMN reference_hash_key_version TEXT NOT NULL DEFAULT 'v1'
  CHECK (reference_hash_key_version IN ('v1', 'v2'));
ALTER TABLE authentication_wallet_transactions
  ADD COLUMN reference_hash_key_version TEXT NOT NULL DEFAULT 'v1'
  CHECK (reference_hash_key_version IN ('v1', 'v2'));
ALTER TABLE authentication_sessions
  ADD COLUMN reference_hash_key_version TEXT NOT NULL DEFAULT 'v1'
  CHECK (reference_hash_key_version IN ('v1', 'v2'));
ALTER TABLE authentication_session_invalidations
  ADD COLUMN reference_hash_key_version TEXT NOT NULL DEFAULT 'v1'
  CHECK (reference_hash_key_version IN ('v1', 'v2'));
ALTER TABLE authentication_replay_entries
  ADD COLUMN reference_hash_key_version TEXT NOT NULL DEFAULT 'v1'
  CHECK (reference_hash_key_version IN ('v1', 'v2'));

CREATE FUNCTION guard_authentication_reference_hash_key_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference_hash_key_version IS DISTINCT FROM OLD.reference_hash_key_version THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Authentication reference hash key version is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER authentication_credentials_reference_hash_version_guard
BEFORE UPDATE ON authentication_credentials
FOR EACH ROW EXECUTE FUNCTION guard_authentication_reference_hash_key_version();
CREATE TRIGGER authentication_oidc_transactions_reference_hash_version_guard
BEFORE UPDATE ON authentication_oidc_transactions
FOR EACH ROW EXECUTE FUNCTION guard_authentication_reference_hash_key_version();
CREATE TRIGGER authentication_wallet_transactions_reference_hash_version_guard
BEFORE UPDATE ON authentication_wallet_transactions
FOR EACH ROW EXECUTE FUNCTION guard_authentication_reference_hash_key_version();
CREATE TRIGGER authentication_sessions_reference_hash_version_guard
BEFORE UPDATE ON authentication_sessions
FOR EACH ROW EXECUTE FUNCTION guard_authentication_reference_hash_key_version();
CREATE TRIGGER authentication_session_invalidations_reference_hash_version_guard
BEFORE UPDATE ON authentication_session_invalidations
FOR EACH ROW EXECUTE FUNCTION guard_authentication_reference_hash_key_version();
CREATE TRIGGER authentication_replay_entries_reference_hash_version_guard
BEFORE UPDATE ON authentication_replay_entries
FOR EACH ROW EXECUTE FUNCTION guard_authentication_reference_hash_key_version();

CREATE FUNCTION validate_authentication_session_invalidation_key_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM authentication_sessions AS session
     WHERE session.tenant_id = NEW.tenant_id
       AND session.session_ref_hash = NEW.session_ref_hash
       AND session.reference_hash_key_version = NEW.reference_hash_key_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Session invalidation reference-hash key version is not bound to its Session';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER authentication_session_invalidations_reference_hash_binding_guard
BEFORE INSERT ON authentication_session_invalidations
FOR EACH ROW EXECUTE FUNCTION validate_authentication_session_invalidation_key_version();

ALTER TABLE authentication_events
  DROP CONSTRAINT authentication_events_event_type_check;
ALTER TABLE authentication_events
  ADD CONSTRAINT authentication_events_event_type_check CHECK (event_type IN (
    'credential_registered', 'credential_rotated', 'credential_suspended',
    'credential_revoked', 'credential_expired', 'credential_reference_rebound',
    'session_created', 'session_rotated', 'session_revoked', 'session_expired',
    'role_enrolled', 'role_selected', 'reference_hash_cutover'
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
        AND payload_value->>'roleBundle' IN ('human_borrower', 'principal_controller')
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
        AND payload_value->>'roleBundle' IN ('human_borrower', 'principal_controller')
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

CREATE INDEX authentication_credentials_reference_hash_version_idx
  ON authentication_credentials(
    tenant_id, reference_hash_key_version, status, actor_type, updated_at
  );
CREATE INDEX authentication_sessions_reference_hash_version_idx
  ON authentication_sessions(
    tenant_id, reference_hash_key_version, status, absolute_expires_at
  );
CREATE INDEX authentication_wallet_transactions_reference_hash_version_idx
  ON authentication_wallet_transactions(
    tenant_id, reference_hash_key_version, expires_at
  );
CREATE INDEX authentication_oidc_transactions_reference_hash_version_idx
  ON authentication_oidc_transactions(
    tenant_id, reference_hash_key_version, expires_at
  );
CREATE INDEX authentication_replay_entries_reference_hash_version_idx
  ON authentication_replay_entries(
    tenant_id, reference_hash_key_version, expires_at
  );
