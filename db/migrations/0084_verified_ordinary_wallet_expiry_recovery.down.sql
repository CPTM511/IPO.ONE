-- Restore the original immutable-expiry guard. Existing recovery audit/history
-- and recovered sessions are retained; rollback never edits user records.
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
