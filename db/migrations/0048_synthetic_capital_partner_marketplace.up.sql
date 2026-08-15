CREATE TABLE capital_partner_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  profile_hash TEXT NOT NULL CHECK (profile_hash ~ '^0x[0-9a-f]{64}$'),
  organization_ref TEXT NOT NULL CHECK (length(organization_ref) BETWEEN 1 AND 256),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 256),
  operator_actor_id TEXT NOT NULL REFERENCES actors(id),
  status TEXT NOT NULL CHECK (status = 'active'),
  invitation_only BOOLEAN NOT NULL CHECK (invitation_only = TRUE),
  same_tenant_only BOOLEAN NOT NULL CHECK (same_tenant_only = TRUE),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_authority BOOLEAN NOT NULL CHECK (production_funds_authority = FALSE),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL CHECK (updated_at >= created_at),
  schema_version TEXT NOT NULL CHECK (schema_version = 'capital_partner_profile.v1'),
  CONSTRAINT capital_partner_profiles_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT capital_partner_profiles_tenant_hash_key UNIQUE (tenant_id, profile_hash),
  CONSTRAINT capital_partner_profiles_tenant_operator_key UNIQUE (tenant_id, operator_actor_id)
);

CREATE FUNCTION guard_capital_partner_profile()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'Capital Partner profiles are bootstrap-owned and immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capital_partner_profiles_immutable_guard
BEFORE UPDATE OR DELETE ON capital_partner_profiles
FOR EACH ROW EXECUTE FUNCTION guard_capital_partner_profile();

ALTER TABLE capital_partner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_partner_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_capital_partner_profiles ON capital_partner_profiles
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_capital_partner_profiles
BEFORE INSERT OR UPDATE OR DELETE ON capital_partner_profiles
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX capital_partner_profiles_tenant_operator_idx
  ON capital_partner_profiles(tenant_id, operator_actor_id, id);

ALTER TABLE credit_offers
  DROP CONSTRAINT credit_offers_terms_version_check,
  DROP CONSTRAINT credit_offers_status_check,
  DROP CONSTRAINT credit_offers_schema_version_check,
  ADD COLUMN capital_partner_id TEXT,
  ADD COLUMN capital_partner_operator_id TEXT,
  ADD COLUMN credit_passport_artifact_id TEXT,
  ADD COLUMN credit_passport_artifact_hash TEXT,
  ADD COLUMN credit_passport_artifact_version BIGINT,
  ADD COLUMN passport_verification_hash TEXT,
  ADD COLUMN underwriting_snapshot_hash TEXT,
  ADD COLUMN facility_limit_minor NUMERIC(78,0),
  ADD COLUMN per_draw_cap_minor NUMERIC(78,0),
  ADD COLUMN permitted_purpose_code TEXT,
  ADD COLUMN conditions JSONB,
  ADD COLUMN undrawn_revocation_rule TEXT,
  ADD COLUMN superseding_offer_id TEXT,
  ADD COLUMN closed_at TIMESTAMPTZ,
  ADD CONSTRAINT credit_offers_terms_version_check
    CHECK (terms_version IN ('credit_terms.v1', 'credit_terms.v2')),
  ADD CONSTRAINT credit_offers_status_check
    CHECK (status IN (
      'offered', 'accepted', 'declined', 'expired', 'withdrawn', 'superseded'
    )),
  ADD CONSTRAINT credit_offers_schema_version_check
    CHECK (schema_version IN ('credit_offer.v1', 'credit_offer.v2')),
  ADD CONSTRAINT credit_offers_v2_shape_check CHECK (
    (
      schema_version = 'credit_offer.v1'
      AND terms_version = 'credit_terms.v1'
      AND num_nonnulls(
        capital_partner_id, capital_partner_operator_id,
        credit_passport_artifact_id, credit_passport_artifact_hash,
        credit_passport_artifact_version, passport_verification_hash,
        underwriting_snapshot_hash, facility_limit_minor, per_draw_cap_minor,
        permitted_purpose_code, conditions, undrawn_revocation_rule
      ) = 0
    )
    OR
    (
      schema_version = 'credit_offer.v2'
      AND terms_version = 'credit_terms.v2'
      AND capital_partner_id IS NOT NULL
      AND capital_partner_operator_id IS NOT NULL
      AND credit_passport_artifact_id IS NOT NULL
      AND credit_passport_artifact_hash ~ '^0x[0-9a-f]{64}$'
      AND credit_passport_artifact_version >= 1
      AND passport_verification_hash ~ '^0x[0-9a-f]{64}$'
      AND underwriting_snapshot_hash ~ '^0x[0-9a-f]{64}$'
      AND facility_limit_minor > 0
      AND approved_principal_minor <= facility_limit_minor
      AND per_draw_cap_minor > 0
      AND per_draw_cap_minor <= facility_limit_minor
      AND approved_principal_minor <= per_draw_cap_minor
      AND permitted_purpose_code ~ '^[a-z][a-z0-9_.-]{1,95}$'
      AND jsonb_typeof(conditions) = 'array'
      AND jsonb_array_length(conditions) BETWEEN 1 AND 12
      AND undrawn_revocation_rule IN (
        'capital_partner_before_acceptance', 'irrevocable_until_expiry'
      )
    )
  ),
  ADD CONSTRAINT credit_offers_v2_capital_partner_fk
    FOREIGN KEY (tenant_id, capital_partner_id)
    REFERENCES capital_partner_profiles(tenant_id, id),
  ADD CONSTRAINT credit_offers_v2_operator_fk
    FOREIGN KEY (capital_partner_operator_id)
    REFERENCES actors(id),
  ADD CONSTRAINT credit_offers_v2_passport_fk
    FOREIGN KEY (tenant_id, credit_passport_artifact_id)
    REFERENCES credit_passport_artifacts(tenant_id, id),
  ADD CONSTRAINT credit_offers_superseding_offer_fk
    FOREIGN KEY (tenant_id, superseding_offer_id)
    REFERENCES credit_offers(tenant_id, id),
  ADD CONSTRAINT credit_offers_close_state_check CHECK (
    (
      schema_version = 'credit_offer.v1'
      AND closed_at IS NULL
      AND superseding_offer_id IS NULL
    )
    OR
    (
      schema_version = 'credit_offer.v2'
      AND status IN ('offered', 'accepted')
      AND closed_at IS NULL
      AND superseding_offer_id IS NULL
    )
    OR
    (
      schema_version = 'credit_offer.v2'
      AND status IN ('declined', 'expired', 'withdrawn')
      AND closed_at IS NOT NULL
      AND superseding_offer_id IS NULL
    )
    OR
    (
      schema_version = 'credit_offer.v2'
      AND status = 'superseded'
      AND closed_at IS NOT NULL
      AND superseding_offer_id IS NOT NULL
      AND superseding_offer_id <> id
    )
  );

CREATE OR REPLACE FUNCTION guard_credit_offer_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'credit offer projections cannot be deleted';
  END IF;

  IF ROW(
    NEW.tenant_id, NEW.offer_hash, NEW.terms_hash, NEW.credit_intent_id,
    NEW.subject_id, NEW.risk_decision_id, NEW.asset_id,
    NEW.approved_principal_minor, NEW.annual_rate_bps,
    NEW.origination_fee_minor, NEW.repayment_frequency,
    NEW.installment_count, NEW.first_payment_at, NEW.maturity_at,
    NEW.disclosure_ref, NEW.terms_version, NEW.valid_until, NEW.reason_codes,
    NEW.sandbox_only, NEW.production_funds_approved, NEW.created_at,
    NEW.schema_version, NEW.capital_partner_id, NEW.capital_partner_operator_id,
    NEW.credit_passport_artifact_id, NEW.credit_passport_artifact_hash,
    NEW.credit_passport_artifact_version, NEW.passport_verification_hash,
    NEW.underwriting_snapshot_hash, NEW.facility_limit_minor,
    NEW.per_draw_cap_minor, NEW.permitted_purpose_code, NEW.conditions,
    NEW.undrawn_revocation_rule
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.offer_hash, OLD.terms_hash, OLD.credit_intent_id,
    OLD.subject_id, OLD.risk_decision_id, OLD.asset_id,
    OLD.approved_principal_minor, OLD.annual_rate_bps,
    OLD.origination_fee_minor, OLD.repayment_frequency,
    OLD.installment_count, OLD.first_payment_at, OLD.maturity_at,
    OLD.disclosure_ref, OLD.terms_version, OLD.valid_until, OLD.reason_codes,
    OLD.sandbox_only, OLD.production_funds_approved, OLD.created_at,
    OLD.schema_version, OLD.capital_partner_id, OLD.capital_partner_operator_id,
    OLD.credit_passport_artifact_id, OLD.credit_passport_artifact_hash,
    OLD.credit_passport_artifact_version, OLD.passport_verification_hash,
    OLD.underwriting_snapshot_hash, OLD.facility_limit_minor,
    OLD.per_draw_cap_minor, OLD.permitted_purpose_code, OLD.conditions,
    OLD.undrawn_revocation_rule
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'credit offer identity and terms are immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'offered'
    AND NEW.status IN (
      'accepted', 'declined', 'expired', 'withdrawn', 'superseded'
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid credit offer status transition';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'credit offer updated_at cannot move backwards';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX credit_offers_tenant_capital_partner_status_idx
  ON credit_offers(tenant_id, capital_partner_id, status, created_at DESC)
  WHERE schema_version = 'credit_offer.v2';
