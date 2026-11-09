DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM synthetic_fee_source_corrections) THEN
 RAISE EXCEPTION 'Retain approved source-credit schedule facts; use compatible disabled runtime';
 END IF;
END $$;
DROP TRIGGER local_source_credit_receipt_required ON obligations;
DROP FUNCTION IF EXISTS enforce_local_source_credit_receipt();
CREATE OR REPLACE FUNCTION guard_shared_obligation_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.schema_version <> 'obligation.v2' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'shared obligations cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.obligation_hash, NEW.subject_id, NEW.principal_id,
    NEW.credit_intent_id, NEW.risk_decision_id, NEW.credit_offer_id,
    NEW.acceptance_id, NEW.authority_type, NEW.authority_ref,
    NEW.consent_id, NEW.mandate_id, NEW.asset_id, NEW.amount_minor,
    NEW.annual_rate_bps, NEW.origination_fee_minor, NEW.repayment_frequency,
    NEW.schedule_version, NEW.accepted_at, NEW.sandbox_only,
    NEW.production_funds_moved, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.obligation_hash, OLD.subject_id, OLD.principal_id,
    OLD.credit_intent_id, OLD.risk_decision_id, OLD.credit_offer_id,
    OLD.acceptance_id, OLD.authority_type, OLD.authority_ref,
    OLD.consent_id, OLD.mandate_id, OLD.asset_id, OLD.amount_minor,
    OLD.annual_rate_bps, OLD.origination_fee_minor, OLD.repayment_frequency,
    OLD.schedule_version, OLD.accepted_at, OLD.sandbox_only,
    OLD.production_funds_moved, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'shared obligation provenance and accepted economics are immutable';
  END IF;
  IF ROW(
    NEW.installment_count, NEW.first_payment_at, NEW.maturity_at,
    NEW.schedule_hash, NEW.schedule_sequence
  ) IS DISTINCT FROM ROW(
    OLD.installment_count, OLD.first_payment_at, OLD.maturity_at,
    OLD.schedule_hash, OLD.schedule_sequence
  ) AND NOT (
    NEW.status = 'restructured'
    AND NEW.servicing_classification = 'restructured'
    AND NEW.resolution_type = 'restructure'
    AND NEW.schedule_sequence = OLD.schedule_sequence + 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'shared obligation schedule can change only through restructure';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
