-- AUTHN-008 rollback is permitted only before any v2 row or rotation Event
-- exists. Once rotation begins, recovery must move forward.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM authentication_credentials WHERE reference_hash_key_version <> 'v1')
     OR EXISTS (SELECT 1 FROM authentication_oidc_transactions WHERE reference_hash_key_version <> 'v1')
     OR EXISTS (SELECT 1 FROM authentication_wallet_transactions WHERE reference_hash_key_version <> 'v1')
     OR EXISTS (SELECT 1 FROM authentication_sessions WHERE reference_hash_key_version <> 'v1')
     OR EXISTS (SELECT 1 FROM authentication_session_invalidations WHERE reference_hash_key_version <> 'v1')
     OR EXISTS (SELECT 1 FROM authentication_replay_entries WHERE reference_hash_key_version <> 'v1')
     OR EXISTS (
       SELECT 1 FROM authentication_events
       WHERE event_type IN ('credential_reference_rebound', 'reference_hash_cutover')
     ) THEN
    RAISE EXCEPTION '0069 down migration is destructive after reference-hash rotation begins';
  END IF;
END;
$$;

DROP INDEX IF EXISTS authentication_replay_entries_reference_hash_version_idx;
DROP INDEX IF EXISTS authentication_oidc_transactions_reference_hash_version_idx;
DROP INDEX IF EXISTS authentication_wallet_transactions_reference_hash_version_idx;
DROP INDEX IF EXISTS authentication_sessions_reference_hash_version_idx;
DROP INDEX IF EXISTS authentication_credentials_reference_hash_version_idx;

DROP TRIGGER IF EXISTS authentication_session_invalidations_reference_hash_binding_guard
  ON authentication_session_invalidations;
DROP FUNCTION IF EXISTS validate_authentication_session_invalidation_key_version();

DROP TRIGGER IF EXISTS authentication_replay_entries_reference_hash_version_guard
  ON authentication_replay_entries;
DROP TRIGGER IF EXISTS authentication_session_invalidations_reference_hash_version_guard
  ON authentication_session_invalidations;
DROP TRIGGER IF EXISTS authentication_sessions_reference_hash_version_guard
  ON authentication_sessions;
DROP TRIGGER IF EXISTS authentication_wallet_transactions_reference_hash_version_guard
  ON authentication_wallet_transactions;
DROP TRIGGER IF EXISTS authentication_oidc_transactions_reference_hash_version_guard
  ON authentication_oidc_transactions;
DROP TRIGGER IF EXISTS authentication_credentials_reference_hash_version_guard
  ON authentication_credentials;
DROP FUNCTION IF EXISTS guard_authentication_reference_hash_key_version();

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

ALTER TABLE authentication_replay_entries DROP COLUMN reference_hash_key_version;
ALTER TABLE authentication_session_invalidations DROP COLUMN reference_hash_key_version;
ALTER TABLE authentication_sessions DROP COLUMN reference_hash_key_version;
ALTER TABLE authentication_wallet_transactions DROP COLUMN reference_hash_key_version;
ALTER TABLE authentication_oidc_transactions DROP COLUMN reference_hash_key_version;
ALTER TABLE authentication_credentials DROP COLUMN reference_hash_key_version;
