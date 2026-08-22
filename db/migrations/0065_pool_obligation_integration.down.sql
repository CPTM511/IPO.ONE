DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pool_obligation_bindings)
     OR EXISTS (SELECT 1 FROM pool_obligation_effect_receipts)
     OR EXISTS (SELECT 1 FROM pool_execution_receipts)
     OR EXISTS (SELECT 1 FROM pool_obligation_projections) THEN
    RAISE EXCEPTION 'cannot roll back Pool Obligation integration while Evidence exists';
  END IF;
END;
$$;

ALTER TABLE obligations
  DROP CONSTRAINT obligations_v2_shape_check,
  DROP CONSTRAINT obligations_pool_execution_receipt_fk,
  DROP CONSTRAINT obligations_pool_binding_fk;

DROP INDEX IF EXISTS pool_obligation_effect_receipts_replay_idx;
DROP TRIGGER IF EXISTS pool_obligation_effect_receipts_immutable ON pool_obligation_effect_receipts;
DROP TRIGGER IF EXISTS pool_execution_receipts_immutable ON pool_execution_receipts;
DROP TRIGGER IF EXISTS pool_obligation_projections_guard ON pool_obligation_projections;
DROP TRIGGER IF EXISTS pool_obligation_bindings_guard ON pool_obligation_bindings;
DROP FUNCTION IF EXISTS reject_pool_obligation_append_only_mutation();
DROP FUNCTION IF EXISTS guard_pool_obligation_projection();
DROP FUNCTION IF EXISTS guard_pool_obligation_binding();
DROP TABLE IF EXISTS pool_obligation_effect_receipts;
DROP TABLE IF EXISTS pool_execution_receipts;
DROP TABLE IF EXISTS pool_obligation_projections;
DROP TABLE IF EXISTS pool_obligation_bindings;

ALTER TABLE obligations
  DROP COLUMN pool_execution_receipt_id,
  DROP COLUMN pool_obligation_binding_id;

-- Restore the pre-0065 constraint exactly through the tested 0019 migration.
ALTER TABLE obligations
  ADD CONSTRAINT obligations_v2_shape_check CHECK (
    schema_version <> 'obligation.v2'
    OR (
      credit_intent_id IS NOT NULL AND risk_decision_id IS NOT NULL
      AND credit_offer_id IS NOT NULL AND acceptance_id IS NOT NULL
      AND authority_type IN ('consent', 'mandate') AND authority_ref IS NOT NULL
      AND num_nonnulls(consent_id, mandate_id) = 1
      AND (authority_type <> 'consent' OR (consent_id IS NOT NULL AND authority_ref = consent_id))
      AND (authority_type <> 'mandate' OR (mandate_id IS NOT NULL AND authority_ref = mandate_id))
      AND annual_rate_bps BETWEEN 0 AND 100000 AND origination_fee_minor = 0
      AND accrued_interest_minor >= outstanding_interest_minor AND outstanding_interest_minor >= 0
      AND accrued_fees_minor >= outstanding_fees_minor AND outstanding_fees_minor >= 0
      AND total_repaid_minor >= repaid_amount_minor
      AND repayment_frequency IN ('weekly', 'biweekly', 'monthly', 'end_of_term')
      AND installment_count BETWEEN 1 AND 520 AND first_payment_at IS NOT NULL
      AND maturity_at = due_at AND maturity_at >= first_payment_at
      AND schedule_version = 'obligation_schedule.v1' AND schedule_sequence BETWEEN 1 AND 100
      AND schedule_hash ~ '^0x[0-9a-f]{64}$'
      AND sandbox_only = TRUE AND production_funds_moved = FALSE AND withdrawable = FALSE
      AND interest_accrual_remainder >= 0 AND interest_accrual_remainder < 3650000
      AND accepted_at IS NOT NULL AND spend_policy_id IS NULL AND cashflow_route_id IS NULL
      AND servicing_classification IS NOT NULL AND days_past_due >= 0
      AND servicing_effective_at IS NOT NULL AND servicing_reason_code IS NOT NULL
      AND servicing_policy_version = 'sandbox-servicing-policy.v1'
      AND servicing_owner_code IN ('sandbox_platform', 'sandbox_originator')
      AND ((resolution_type IS NULL AND resolution_reason_code IS NULL AND resolution_at IS NULL)
        OR (resolution_type IS NOT NULL AND resolution_reason_code IS NOT NULL AND resolution_at IS NOT NULL))
      AND (status = 'written_off' OR (
        written_off_principal_minor = 0 AND written_off_interest_minor = 0 AND written_off_fees_minor = 0
      ))
      AND (
        (status = 'created' AND servicing_classification = 'current' AND days_past_due = 0)
        OR (status IN ('active', 'partially_repaid', 'fully_repaid') AND servicing_classification IN ('current', 'cured'))
        OR (status = 'delinquent' AND servicing_classification IN ('grace_period', 'dpd_1_30', 'dpd_31_60', 'dpd_61_89'))
        OR (status = 'defaulted' AND servicing_classification = 'defaulted' AND days_past_due >= 90)
        OR (status = 'restructured' AND servicing_classification = 'restructured' AND resolution_type = 'restructure')
        OR (status = 'repurchased' AND servicing_classification = 'repurchased' AND resolution_type = 'repurchase')
        OR (status = 'written_off' AND servicing_classification = 'written_off'
          AND resolution_type = 'write_off'
          AND written_off_principal_minor + written_off_interest_minor + written_off_fees_minor > 0)
      )
      AND (
        (execution_status = 'pending' AND status = 'created'
          AND sandbox_execution_receipt_id IS NULL AND executed_at IS NULL
          AND last_accrued_at IS NULL AND interest_accrual_remainder = 0)
        OR (execution_status = 'executed'
          AND status IN ('active', 'partially_repaid', 'fully_repaid', 'delinquent', 'defaulted', 'restructured', 'repurchased', 'written_off')
          AND sandbox_execution_receipt_id IS NOT NULL
          AND executed_at IS NOT NULL AND last_accrued_at IS NOT NULL AND last_accrued_at >= executed_at)
      )
    )
  );

-- The 0065 guard is backward-compatible when the new columns are absent only
-- after this exact function is restored.
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
  IF ROW(NEW.tenant_id, NEW.obligation_hash, NEW.subject_id, NEW.principal_id,
    NEW.credit_intent_id, NEW.risk_decision_id, NEW.credit_offer_id, NEW.acceptance_id,
    NEW.authority_type, NEW.authority_ref, NEW.consent_id, NEW.mandate_id, NEW.asset_id,
    NEW.amount_minor, NEW.annual_rate_bps, NEW.origination_fee_minor, NEW.repayment_frequency,
    NEW.schedule_version, NEW.accepted_at, NEW.sandbox_only, NEW.production_funds_moved, NEW.schema_version)
  IS DISTINCT FROM ROW(OLD.tenant_id, OLD.obligation_hash, OLD.subject_id, OLD.principal_id,
    OLD.credit_intent_id, OLD.risk_decision_id, OLD.credit_offer_id, OLD.acceptance_id,
    OLD.authority_type, OLD.authority_ref, OLD.consent_id, OLD.mandate_id, OLD.asset_id,
    OLD.amount_minor, OLD.annual_rate_bps, OLD.origination_fee_minor, OLD.repayment_frequency,
    OLD.schedule_version, OLD.accepted_at, OLD.sandbox_only, OLD.production_funds_moved, OLD.schema_version) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'shared obligation provenance and accepted economics are immutable';
  END IF;
  IF ROW(NEW.installment_count, NEW.first_payment_at, NEW.maturity_at, NEW.schedule_hash, NEW.schedule_sequence)
     IS DISTINCT FROM ROW(OLD.installment_count, OLD.first_payment_at, OLD.maturity_at, OLD.schedule_hash, OLD.schedule_sequence)
     AND NOT (NEW.status = 'restructured' AND NEW.servicing_classification = 'restructured'
       AND NEW.resolution_type = 'restructure' AND NEW.schedule_sequence = OLD.schedule_sequence + 1) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'shared obligation schedule can change only through restructure';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
