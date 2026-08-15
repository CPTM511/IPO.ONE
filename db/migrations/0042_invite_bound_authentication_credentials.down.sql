DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM authentication_events
     WHERE event_type = 'credential_registered'
       AND payload ? 'invitationRefHash'
  ) THEN
    RAISE EXCEPTION
      'cannot roll back invite-bound authentication after an invitation credential is registered';
  END IF;
END;
$$;

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
