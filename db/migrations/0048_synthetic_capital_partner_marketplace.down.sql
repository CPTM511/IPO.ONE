DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM credit_offers WHERE schema_version = 'credit_offer.v2'
  ) THEN
    RAISE EXCEPTION 'cannot roll back Capital Partner marketplace while v2 Offers exist';
  END IF;
  IF EXISTS (SELECT 1 FROM capital_partner_profiles) THEN
    RAISE EXCEPTION 'cannot roll back Capital Partner marketplace while profiles exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS credit_offers_tenant_capital_partner_status_idx;

ALTER TABLE credit_offers
  DROP CONSTRAINT credit_offers_close_state_check,
  DROP CONSTRAINT credit_offers_superseding_offer_fk,
  DROP CONSTRAINT credit_offers_v2_passport_fk,
  DROP CONSTRAINT credit_offers_v2_operator_fk,
  DROP CONSTRAINT credit_offers_v2_capital_partner_fk,
  DROP CONSTRAINT credit_offers_v2_shape_check,
  DROP CONSTRAINT credit_offers_terms_version_check,
  DROP CONSTRAINT credit_offers_status_check,
  DROP CONSTRAINT credit_offers_schema_version_check,
  DROP COLUMN closed_at,
  DROP COLUMN superseding_offer_id,
  DROP COLUMN undrawn_revocation_rule,
  DROP COLUMN conditions,
  DROP COLUMN permitted_purpose_code,
  DROP COLUMN per_draw_cap_minor,
  DROP COLUMN facility_limit_minor,
  DROP COLUMN underwriting_snapshot_hash,
  DROP COLUMN passport_verification_hash,
  DROP COLUMN credit_passport_artifact_version,
  DROP COLUMN credit_passport_artifact_hash,
  DROP COLUMN credit_passport_artifact_id,
  DROP COLUMN capital_partner_operator_id,
  DROP COLUMN capital_partner_id,
  ADD CONSTRAINT credit_offers_terms_version_check
    CHECK (terms_version = 'credit_terms.v1'),
  ADD CONSTRAINT credit_offers_status_check
    CHECK (status IN ('offered', 'accepted', 'declined', 'expired', 'superseded')),
  ADD CONSTRAINT credit_offers_schema_version_check
    CHECK (schema_version = 'credit_offer.v1');

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
    NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.offer_hash, OLD.terms_hash, OLD.credit_intent_id,
    OLD.subject_id, OLD.risk_decision_id, OLD.asset_id,
    OLD.approved_principal_minor, OLD.annual_rate_bps,
    OLD.origination_fee_minor, OLD.repayment_frequency,
    OLD.installment_count, OLD.first_payment_at, OLD.maturity_at,
    OLD.disclosure_ref, OLD.terms_version, OLD.valid_until, OLD.reason_codes,
    OLD.sandbox_only, OLD.production_funds_approved, OLD.created_at,
    OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'credit offer identity and terms are immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'offered'
    AND NEW.status IN ('accepted', 'declined', 'expired', 'superseded')
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

DROP INDEX IF EXISTS capital_partner_profiles_tenant_operator_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_capital_partner_profiles ON capital_partner_profiles;
DROP POLICY IF EXISTS tenant_isolation_capital_partner_profiles ON capital_partner_profiles;
ALTER TABLE capital_partner_profiles DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS capital_partner_profiles_immutable_guard ON capital_partner_profiles;
DROP TABLE IF EXISTS capital_partner_profiles;
DROP FUNCTION IF EXISTS guard_capital_partner_profile();
