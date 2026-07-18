ALTER TABLE mandates
  ADD COLUMN terms_hash TEXT,
  ADD COLUMN sandbox_only BOOLEAN NOT NULL DEFAULT TRUE CHECK (sandbox_only = TRUE),
  ADD COLUMN production_authority BOOLEAN NOT NULL DEFAULT FALSE CHECK (production_authority = FALSE),
  ADD COLUMN activation_acknowledgement JSONB;

ALTER TABLE mandates
  ADD CONSTRAINT mandates_v3_shape_check CHECK (
    schema_version <> 'mandate.v3'
    OR (
      terms_hash ~ '^0x[0-9a-f]{64}$'
      AND (
        (status IN ('draft', 'revoked', 'expired') AND activation_acknowledgement IS NULL)
        OR (
          status IN ('active', 'suspended', 'revoked', 'expired')
          AND jsonb_typeof(activation_acknowledgement) = 'object'
          AND activation_acknowledgement->>'expectedMandateHash' = mandate_hash
          AND activation_acknowledgement->>'acknowledgedTermsHash' = terms_hash
          AND activation_acknowledgement->>'acknowledgementCode' = 'principal_authorizes_sandbox_credit_v1'
          AND activation_acknowledgement->>'evidenceHash' ~ '^0x[0-9a-f]{64}$'
        )
      )
    )
  );

CREATE FUNCTION guard_sandbox_mandate_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF ROW(
    NEW.tenant_id, NEW.mandate_hash, NEW.terms_hash, NEW.principal_id,
    NEW.subject_id, NEW.capabilities, NEW.allowed_provider_ids,
    NEW.allowed_categories, NEW.asset_ids, NEW.per_action_limit_minor,
    NEW.aggregate_limit_minor, NEW.valid_from, NEW.expires_at, NEW.nonce,
    NEW.terms_ref, NEW.sandbox_only, NEW.production_authority,
    NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.mandate_hash, OLD.terms_hash, OLD.principal_id,
    OLD.subject_id, OLD.capabilities, OLD.allowed_provider_ids,
    OLD.allowed_categories, OLD.asset_ids, OLD.per_action_limit_minor,
    OLD.aggregate_limit_minor, OLD.valid_from, OLD.expires_at, OLD.nonce,
    OLD.terms_ref, OLD.sandbox_only, OLD.production_authority,
    OLD.created_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Mandate identity, scope, and terms are immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status IN ('active', 'revoked', 'expired'))
    OR (OLD.status = 'active' AND NEW.status IN ('suspended', 'revoked', 'expired'))
    OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'revoked', 'expired'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid Mandate status transition';
  END IF;

  IF OLD.activation_acknowledgement IS NOT NULL
     AND NEW.activation_acknowledgement IS DISTINCT FROM OLD.activation_acknowledgement THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Mandate activation acknowledgement is immutable';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Mandate updated_at cannot move backwards';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sandbox_mandates_projection_guard
BEFORE UPDATE OR DELETE ON mandates
FOR EACH ROW EXECUTE FUNCTION guard_sandbox_mandate_projection();
