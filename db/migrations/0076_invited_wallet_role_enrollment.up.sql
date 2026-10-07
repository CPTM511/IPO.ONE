-- WEB-027J: selected-role validation; no public registration or automatic grants.
ALTER TABLE authentication_role_enrollments DROP CONSTRAINT authentication_role_enrollments_role_bundle_check;
ALTER TABLE authentication_role_enrollments ADD CONSTRAINT authentication_role_enrollments_role_bundle_check CHECK (role_bundle IN ('human_borrower', 'principal_controller', 'capital_partner_operator', 'risk_operator'));
ALTER TABLE authentication_wallet_transactions DROP CONSTRAINT authentication_wallet_transactions_requested_role_check;
ALTER TABLE authentication_wallet_transactions ADD CONSTRAINT authentication_wallet_transactions_requested_role_check CHECK (requested_role IS NULL OR requested_role IN ('human_borrower', 'principal_controller', 'capital_partner_operator', 'risk_operator'));

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
    WHEN roles_value->>0 IN ('human_borrower', 'principal_controller', 'capital_partner_operator', 'risk_operator') THEN EXISTS (
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
        AND payload_value->>'roleBundle' IN ('human_borrower', 'principal_controller', 'capital_partner_operator', 'risk_operator')
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
        AND payload_value->>'roleBundle' IN ('human_borrower', 'principal_controller', 'capital_partner_operator', 'risk_operator')
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

