ALTER TABLE consent_records
  ADD CONSTRAINT consent_records_tenant_subject_principal_hash_key
    UNIQUE (tenant_id, id, subject_id, principal_id, consent_hash);

CREATE TABLE human_identity_references (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  identity_reference_hash TEXT NOT NULL CHECK (identity_reference_hash ~ '^0x[0-9a-f]{64}$'),
  reference_evidence_hash TEXT NOT NULL CHECK (reference_evidence_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  consent_id TEXT NOT NULL,
  consent_hash TEXT NOT NULL CHECK (consent_hash ~ '^0x[0-9a-f]{64}$'),
  subject_type subject_type NOT NULL DEFAULT 'human' CHECK (subject_type = 'human'),
  reference_type TEXT NOT NULL CHECK (
    reference_type IN ('kyc_reference', 'verifiable_credential_reference')
  ),
  provider_ref TEXT NOT NULL CHECK (length(provider_ref) BETWEEN 1 AND 2048),
  provider_version TEXT NOT NULL CHECK (
    provider_version ~ '^[a-z][a-z0-9_.-]{0,95}\.v[1-9][0-9]*$'
  ),
  reference_ref TEXT NOT NULL CHECK (length(reference_ref) BETWEEN 1 AND 2048),
  assurance_level TEXT NOT NULL CHECK (
    assurance_level IN ('synthetic_self_asserted', 'synthetic_provider_asserted')
  ),
  purpose_codes JSONB NOT NULL CHECK (
    jsonb_typeof(purpose_codes) = 'array'
    AND jsonb_array_length(purpose_codes) BETWEEN 1 AND 8
    AND purpose_codes ? 'identity_reference_use'
    AND purpose_codes <@ '[
      "credit_application",
      "credit_decision",
      "identity_reference_use",
      "obligation_servicing",
      "evidence_sharing"
    ]'::jsonb
  ),
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_verified BOOLEAN NOT NULL CHECK (production_verified = FALSE),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  revoked_at TIMESTAMPTZ,
  revocation_reason_code TEXT CHECK (
    revocation_reason_code IS NULL
    OR revocation_reason_code ~ '^[a-z][a-z0-9_.-]{1,95}$'
  ),
  revocation_evidence_ref TEXT CHECK (
    revocation_evidence_ref IS NULL
    OR length(revocation_evidence_ref) BETWEEN 1 AND 2048
  ),
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'human_identity_reference.v1'),
  CONSTRAINT human_identity_references_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT human_identity_references_tenant_hash_key UNIQUE (tenant_id, identity_reference_hash),
  CONSTRAINT human_identity_references_human_subject_principal_fk
    FOREIGN KEY (tenant_id, subject_id, principal_id, subject_type)
    REFERENCES subjects(tenant_id, id, primary_principal_id, subject_type),
  CONSTRAINT human_identity_references_consent_fk
    FOREIGN KEY (tenant_id, consent_id, subject_id, principal_id, consent_hash)
    REFERENCES consent_records(tenant_id, id, subject_id, principal_id, consent_hash),
  CONSTRAINT human_identity_references_validity_window CHECK (
    valid_from >= created_at
    AND expires_at > valid_from
    AND expires_at <= valid_from + INTERVAL '366 days'
  ),
  CONSTRAINT human_identity_references_state_metadata CHECK (
    (
      status = 'active'
      AND revoked_at IS NULL
      AND revocation_reason_code IS NULL
      AND revocation_evidence_ref IS NULL
      AND expired_at IS NULL
    ) OR (
      status = 'revoked'
      AND revoked_at IS NOT NULL
      AND revoked_at >= created_at
      AND revocation_reason_code IS NOT NULL
      AND revocation_evidence_ref IS NOT NULL
      AND expired_at IS NULL
    ) OR (
      status = 'expired'
      AND expired_at IS NOT NULL
      AND expired_at >= expires_at
      AND revoked_at IS NULL
      AND revocation_reason_code IS NULL
      AND revocation_evidence_ref IS NULL
    )
  ),
  CONSTRAINT human_identity_references_updated_at_valid CHECK (
    updated_at >= created_at
    AND (revoked_at IS NULL OR updated_at >= revoked_at)
    AND (expired_at IS NULL OR updated_at >= expired_at)
  )
);

CREATE FUNCTION guard_human_identity_reference_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Human identity-reference projections cannot be deleted';
  END IF;

  IF ROW(
    NEW.tenant_id, NEW.identity_reference_hash, NEW.reference_evidence_hash,
    NEW.subject_id, NEW.principal_id, NEW.consent_id, NEW.consent_hash,
    NEW.subject_type, NEW.reference_type, NEW.provider_ref,
    NEW.provider_version, NEW.reference_ref, NEW.assurance_level,
    NEW.purpose_codes, NEW.valid_from, NEW.expires_at, NEW.synthetic_only,
    NEW.production_verified, NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.identity_reference_hash, OLD.reference_evidence_hash,
    OLD.subject_id, OLD.principal_id, OLD.consent_id, OLD.consent_hash,
    OLD.subject_type, OLD.reference_type, OLD.provider_ref,
    OLD.provider_version, OLD.reference_ref, OLD.assurance_level,
    OLD.purpose_codes, OLD.valid_from, OLD.expires_at, OLD.synthetic_only,
    OLD.production_verified, OLD.created_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Human identity-reference identity, Evidence, scope, and validity are immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'active'
    AND NEW.status IN ('revoked', 'expired')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid Human identity-reference status transition';
  END IF;

  IF OLD.status IN ('revoked', 'expired') AND ROW(
    NEW.status, NEW.revoked_at, NEW.revocation_reason_code,
    NEW.revocation_evidence_ref, NEW.expired_at, NEW.updated_at
  ) IS DISTINCT FROM ROW(
    OLD.status, OLD.revoked_at, OLD.revocation_reason_code,
    OLD.revocation_evidence_ref, OLD.expired_at, OLD.updated_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'terminal Human identity-reference state and Evidence are immutable';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Human identity-reference updated_at cannot move backwards';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_human_identity_reference_consent()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM consent_records consent
     WHERE consent.tenant_id = NEW.tenant_id
       AND consent.id = NEW.consent_id
       AND consent.subject_id = NEW.subject_id
       AND consent.principal_id = NEW.principal_id
       AND consent.consent_hash = NEW.consent_hash
       AND consent.status = 'active'
       AND consent.sandbox_only = TRUE
       AND consent.production_authority = FALSE
       AND consent.purposes ? 'identity_reference_use'
       AND NEW.purpose_codes <@ consent.purposes
       AND NEW.valid_from >= consent.valid_from
       AND NEW.expires_at <= consent.expires_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Human identity reference requires matching live Consent scope and validity';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER human_identity_references_consent_guard
BEFORE INSERT ON human_identity_references
FOR EACH ROW EXECUTE FUNCTION guard_human_identity_reference_consent();

CREATE TRIGGER human_identity_references_projection_guard
BEFORE UPDATE OR DELETE ON human_identity_references
FOR EACH ROW EXECUTE FUNCTION guard_human_identity_reference_projection();

ALTER TABLE human_identity_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_identity_references FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_human_identity_references ON human_identity_references
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_human_identity_references
BEFORE INSERT OR UPDATE OR DELETE ON human_identity_references
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX human_identity_references_tenant_subject_created_idx
  ON human_identity_references(tenant_id, subject_id, created_at DESC);
CREATE INDEX human_identity_references_tenant_subject_status_expiry_idx
  ON human_identity_references(tenant_id, subject_id, status, expires_at DESC);
CREATE INDEX human_identity_references_tenant_consent_idx
  ON human_identity_references(tenant_id, consent_id, created_at DESC);
