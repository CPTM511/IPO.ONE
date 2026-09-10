-- WEB-027: restore expired ordinary pilot access only after fresh SIWE.
-- No data, grants, role capabilities, Agent authority or funds change here.
CREATE OR REPLACE FUNCTION guard_authentication_credential_projection()
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

  -- A freshly verified ordinary wallet may retire only its historical
  -- invitation expiry. Every identity/permission field stays immutable and
  -- the new sender/version invalidates all pre-recovery sessions.
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    IF NOT (
      OLD.actor_type = 'human' AND OLD.client_authentication_method = 'siwe'
      AND OLD.sender_constraint_method = 'host_session'
      AND OLD.reference_hash_key_version = 'v2'
      AND OLD.roles IN ('["human_borrower"]'::jsonb, '["principal_controller"]'::jsonb)
      AND OLD.status IN ('active', 'expired') AND NEW.status = 'active'
      AND OLD.expires_at IS NOT NULL AND OLD.expires_at <= NEW.updated_at
      AND NEW.expires_at IS NULL AND NEW.updated_at >= OLD.updated_at
      AND NEW.version = OLD.version + 1
      AND NEW.sender_constraint_method = OLD.sender_constraint_method
      AND NEW.sender_constraint_ref_hash <> OLD.sender_constraint_ref_hash
      AND ROW(NEW.id, NEW.tenant_id, NEW.actor_id, NEW.actor_type, NEW.issuer,
        NEW.subject_ref_hash, NEW.reference_hash_key_version, NEW.client_id,
        NEW.client_authentication_method, NEW.roles, NEW.allowed_capabilities,
        NEW.policy_version, NEW.created_at, NEW.schema_version)
        IS NOT DISTINCT FROM
        ROW(OLD.id, OLD.tenant_id, OLD.actor_id, OLD.actor_type, OLD.issuer,
        OLD.subject_ref_hash, OLD.reference_hash_key_version, OLD.client_id,
        OLD.client_authentication_method, OLD.roles, OLD.allowed_capabilities,
        OLD.policy_version, OLD.created_at, OLD.schema_version)
      AND EXISTS (
        SELECT 1 FROM tenants t JOIN memberships m ON m.tenant_id=t.id
          JOIN actors a ON a.id=m.actor_id
        WHERE t.id=OLD.tenant_id AND t.status='active' AND a.id=OLD.actor_id
          AND a.actor_type='human' AND a.status='active' AND m.status='active'
          AND m.role_bundle IN ('human_borrower','principal_controller')
          AND OLD.roles=jsonb_build_array(m.role_bundle)
          AND m.valid_from<=NEW.updated_at
          AND (m.expires_at IS NULL OR m.expires_at>NEW.updated_at)
          AND m.policy_version=OLD.policy_version AND m.client_ids ? OLD.client_id
          AND m.capabilities @> OLD.allowed_capabilities
      )
      AND EXISTS (
        SELECT 1 FROM authentication_role_enrollments e
        WHERE e.tenant_id=OLD.tenant_id AND e.credential_id=OLD.id
          AND e.actor_id=OLD.actor_id AND e.status='active'
          AND e.role_bundle IN ('human_borrower','principal_controller')
          AND e.valid_from<=NEW.updated_at
          AND (e.expires_at IS NULL OR e.expires_at>NEW.updated_at OR e.expires_at=OLD.expires_at)
      )
      AND NOT EXISTS (
        SELECT 1 FROM authentication_role_enrollments e
        WHERE e.tenant_id=OLD.tenant_id AND e.credential_id=OLD.id AND e.status='active'
          AND e.role_bundle NOT IN ('human_borrower','principal_controller')
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Authentication credential expiry recovery is not permitted';
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
