ALTER TABLE subjects
  ADD CONSTRAINT subjects_tenant_id_primary_principal_type_key
    UNIQUE (tenant_id, id, primary_principal_id, subject_type);

CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  consent_hash TEXT NOT NULL CHECK (consent_hash ~ '^0x[0-9a-f]{64}$'),
  terms_hash TEXT NOT NULL CHECK (terms_hash ~ '^0x[0-9a-f]{64}$'),
  data_usage_hash TEXT NOT NULL CHECK (data_usage_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  subject_type subject_type NOT NULL DEFAULT 'human' CHECK (subject_type = 'human'),
  purposes JSONB NOT NULL CHECK (
    jsonb_typeof(purposes) = 'array'
    AND jsonb_array_length(purposes) BETWEEN 1 AND 16
    AND purposes ? 'credit_application'
  ),
  allowed_asset_ids JSONB NOT NULL CHECK (
    jsonb_typeof(allowed_asset_ids) = 'array'
    AND jsonb_array_length(allowed_asset_ids) BETWEEN 1 AND 16
  ),
  allowed_credit_purpose_codes JSONB NOT NULL CHECK (
    jsonb_typeof(allowed_credit_purpose_codes) = 'array'
    AND jsonb_array_length(allowed_credit_purpose_codes) BETWEEN 1 AND 16
  ),
  allowed_repayment_frequencies JSONB NOT NULL CHECK (
    jsonb_typeof(allowed_repayment_frequencies) = 'array'
    AND jsonb_array_length(allowed_repayment_frequencies) BETWEEN 1 AND 16
    AND allowed_repayment_frequencies <@ '["weekly", "biweekly", "monthly", "end_of_term"]'::jsonb
  ),
  max_requested_principal_minor NUMERIC(78,0) NOT NULL CHECK (max_requested_principal_minor > 0),
  max_requested_term_days INTEGER NOT NULL CHECK (max_requested_term_days BETWEEN 1 AND 3660),
  max_installment_count INTEGER NOT NULL CHECK (max_installment_count BETWEEN 1 AND 520),
  terms_ref TEXT NOT NULL CHECK (length(terms_ref) BETWEEN 1 AND 2048),
  terms_version TEXT NOT NULL CHECK (terms_version ~ '^[a-z][a-z0-9_.-]{0,95}\.v[1-9][0-9]*$'),
  data_usage_ref TEXT NOT NULL CHECK (length(data_usage_ref) BETWEEN 1 AND 2048),
  data_usage_version TEXT NOT NULL CHECK (data_usage_version ~ '^[a-z][a-z0-9_.-]{0,95}\.v[1-9][0-9]*$'),
  disclosure_ref TEXT NOT NULL CHECK (length(disclosure_ref) BETWEEN 1 AND 2048),
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
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
  schema_version TEXT NOT NULL CHECK (schema_version = 'consent_record.v1'),
  CONSTRAINT consent_records_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT consent_records_tenant_consent_hash_key UNIQUE (tenant_id, consent_hash),
  CONSTRAINT consent_records_human_subject_principal_fk
    FOREIGN KEY (tenant_id, subject_id, principal_id, subject_type)
    REFERENCES subjects(tenant_id, id, primary_principal_id, subject_type),
  CONSTRAINT consent_records_validity_window CHECK (
    valid_from >= created_at
    AND expires_at > valid_from
    AND expires_at <= valid_from + INTERVAL '366 days'
  ),
  CONSTRAINT consent_records_state_metadata CHECK (
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
  CONSTRAINT consent_records_updated_at_valid CHECK (
    updated_at >= created_at
    AND (revoked_at IS NULL OR updated_at >= revoked_at)
    AND (expired_at IS NULL OR updated_at >= expired_at)
  )
);

CREATE FUNCTION guard_consent_record_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Consent projections cannot be deleted';
  END IF;

  IF ROW(
    NEW.tenant_id, NEW.consent_hash, NEW.terms_hash, NEW.data_usage_hash,
    NEW.subject_id, NEW.principal_id, NEW.subject_type, NEW.purposes,
    NEW.allowed_asset_ids, NEW.allowed_credit_purpose_codes,
    NEW.allowed_repayment_frequencies, NEW.max_requested_principal_minor,
    NEW.max_requested_term_days, NEW.max_installment_count, NEW.terms_ref,
    NEW.terms_version, NEW.data_usage_ref, NEW.data_usage_version,
    NEW.disclosure_ref, NEW.valid_from, NEW.expires_at, NEW.sandbox_only,
    NEW.production_authority, NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.consent_hash, OLD.terms_hash, OLD.data_usage_hash,
    OLD.subject_id, OLD.principal_id, OLD.subject_type, OLD.purposes,
    OLD.allowed_asset_ids, OLD.allowed_credit_purpose_codes,
    OLD.allowed_repayment_frequencies, OLD.max_requested_principal_minor,
    OLD.max_requested_term_days, OLD.max_installment_count, OLD.terms_ref,
    OLD.terms_version, OLD.data_usage_ref, OLD.data_usage_version,
    OLD.disclosure_ref, OLD.valid_from, OLD.expires_at, OLD.sandbox_only,
    OLD.production_authority, OLD.created_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Consent identity, scope, terms, and validity are immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'active'
    AND NEW.status IN ('revoked', 'expired')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid Consent status transition';
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
      MESSAGE = 'terminal Consent state and Evidence are immutable';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Consent updated_at cannot move backwards';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consent_records_projection_guard
BEFORE UPDATE OR DELETE ON consent_records
FOR EACH ROW EXECUTE FUNCTION guard_consent_record_projection();

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_consent_records ON consent_records
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_consent_records
BEFORE INSERT OR UPDATE OR DELETE ON consent_records
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX consent_records_tenant_subject_created_idx
  ON consent_records(tenant_id, subject_id, created_at DESC);
CREATE INDEX consent_records_tenant_subject_status_expiry_idx
  ON consent_records(tenant_id, subject_id, status, expires_at DESC);
