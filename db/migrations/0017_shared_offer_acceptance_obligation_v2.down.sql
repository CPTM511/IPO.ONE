DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM obligations WHERE schema_version = 'obligation.v2') THEN
    RAISE EXCEPTION 'cannot roll back shared Offer acceptance while obligation.v2 rows exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM human_identity_references
     WHERE purpose_codes ? 'credit_offer_acceptance'
  ) THEN
    RAISE EXCEPTION 'cannot roll back shared Offer acceptance while identity Evidence uses its purpose code';
  END IF;
END $$;

DROP TRIGGER IF EXISTS shared_obligations_projection_guard ON obligations;
DROP TRIGGER IF EXISTS tenant_context_guard_obligation_installments ON obligation_installments;
DROP TRIGGER IF EXISTS obligation_installments_projection_guard ON obligation_installments;
DROP TRIGGER IF EXISTS tenant_context_guard_credit_offer_acceptances ON credit_offer_acceptances;
DROP TRIGGER IF EXISTS credit_offer_acceptances_projection_guard ON credit_offer_acceptances;
DROP FUNCTION IF EXISTS guard_shared_obligation_projection();
DROP FUNCTION IF EXISTS guard_obligation_installment_projection();
DROP FUNCTION IF EXISTS guard_credit_offer_acceptance_projection();

DROP TABLE IF EXISTS obligation_installments;

ALTER TABLE obligations
  DROP CONSTRAINT obligations_tenant_acceptance_key,
  DROP CONSTRAINT obligations_tenant_offer_key,
  DROP CONSTRAINT obligations_tenant_consent_fk,
  DROP CONSTRAINT obligations_tenant_acceptance_fk,
  DROP CONSTRAINT obligations_tenant_credit_offer_fk,
  DROP CONSTRAINT obligations_tenant_risk_decision_fk,
  DROP CONSTRAINT obligations_tenant_intent_fk,
  DROP CONSTRAINT obligations_v2_shape_check,
  DROP CONSTRAINT obligations_authority_type_check,
  DROP CONSTRAINT obligations_schema_version_check,
  DROP CONSTRAINT obligations_amounts_valid,
  DROP COLUMN accepted_at,
  DROP COLUMN production_funds_moved,
  DROP COLUMN sandbox_only,
  DROP COLUMN execution_status,
  DROP COLUMN schedule_hash,
  DROP COLUMN schedule_version,
  DROP COLUMN maturity_at,
  DROP COLUMN first_payment_at,
  DROP COLUMN installment_count,
  DROP COLUMN repayment_frequency,
  DROP COLUMN total_repaid_minor,
  DROP COLUMN outstanding_fees_minor,
  DROP COLUMN outstanding_interest_minor,
  DROP COLUMN accrued_interest_minor,
  DROP COLUMN origination_fee_minor,
  DROP COLUMN annual_rate_bps,
  DROP COLUMN consent_id,
  DROP COLUMN authority_ref,
  DROP COLUMN authority_type,
  DROP COLUMN acceptance_id,
  DROP COLUMN credit_offer_id,
  DROP COLUMN risk_decision_id,
  DROP COLUMN credit_intent_id,
  ADD CONSTRAINT obligations_amounts_valid CHECK (
    amount_minor > 0
    AND outstanding_minor >= 0
    AND outstanding_minor <= amount_minor
    AND accrued_fees_minor >= 0
    AND repaid_amount_minor >= 0
    AND amount_minor = outstanding_minor + repaid_amount_minor
    AND repayment_priority > 0
  ),
  ALTER COLUMN mandate_id SET NOT NULL,
  ALTER COLUMN spend_policy_id SET NOT NULL,
  ALTER COLUMN cashflow_route_id SET NOT NULL;

ALTER TABLE credit_offers
  DROP CONSTRAINT credit_offers_acceptance_state_check,
  DROP CONSTRAINT credit_offers_tenant_acceptance_fk;
DROP TABLE IF EXISTS credit_offer_acceptances;
ALTER TABLE credit_offers
  DROP COLUMN accepted_at,
  DROP COLUMN acceptance_id;

CREATE OR REPLACE FUNCTION guard_credit_offer_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'credit offer projections cannot be deleted';
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
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'credit offer identity and terms are immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'offered' AND NEW.status IN ('accepted', 'declined', 'expired', 'superseded')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid credit offer status transition';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'credit offer updated_at cannot move backwards';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE human_identity_references
  DROP CONSTRAINT human_identity_references_purpose_codes_check,
  ADD CONSTRAINT human_identity_references_purpose_codes_check CHECK (
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
  );
