DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sandbox_servicing_actions) THEN
    RAISE EXCEPTION 'cannot roll back sandbox servicing while servicing actions exist';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM obligations
    WHERE schema_version = 'obligation.v2'
      AND (
        status = 'delinquent'
        OR servicing_classification IS DISTINCT FROM 'current'
        OR resolution_type IS NOT NULL
        OR schedule_sequence IS DISTINCT FROM 1
        OR written_off_principal_minor <> 0
        OR written_off_interest_minor <> 0
        OR written_off_fees_minor <> 0
      )
  ) THEN
    RAISE EXCEPTION 'cannot roll back sandbox servicing while serviced obligation.v2 rows exist';
  END IF;
  IF EXISTS (SELECT 1 FROM obligation_installments WHERE schedule_sequence <> 1) THEN
    RAISE EXCEPTION 'cannot roll back sandbox servicing while replacement schedules exist';
  END IF;
END $$;

DROP INDEX IF EXISTS obligations_tenant_servicing_classification_idx;
DROP INDEX IF EXISTS sandbox_servicing_actions_tenant_obligation_effective_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_sandbox_servicing_actions ON sandbox_servicing_actions;
DROP TRIGGER IF EXISTS sandbox_servicing_actions_projection_guard ON sandbox_servicing_actions;
DROP FUNCTION IF EXISTS guard_sandbox_servicing_action_projection();
DROP TABLE IF EXISTS sandbox_servicing_actions;

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
    NEW.installment_count, NEW.first_payment_at, NEW.maturity_at,
    NEW.schedule_version, NEW.schedule_hash, NEW.accepted_at,
    NEW.sandbox_only, NEW.production_funds_moved, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.obligation_hash, OLD.subject_id, OLD.principal_id,
    OLD.credit_intent_id, OLD.risk_decision_id, OLD.credit_offer_id,
    OLD.acceptance_id, OLD.authority_type, OLD.authority_ref,
    OLD.consent_id, OLD.mandate_id, OLD.asset_id, OLD.amount_minor,
    OLD.annual_rate_bps, OLD.origination_fee_minor, OLD.repayment_frequency,
    OLD.installment_count, OLD.first_payment_at, OLD.maturity_at,
    OLD.schedule_version, OLD.schedule_hash, OLD.accepted_at,
    OLD.sandbox_only, OLD.production_funds_moved, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'shared obligation provenance and accepted terms are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION guard_obligation_installment_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'obligation installments cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.obligation_id, NEW.installment_number,
    NEW.due_at, NEW.scheduled_principal_minor, NEW.schedule_version,
    NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.obligation_id, OLD.installment_number,
    OLD.due_at, OLD.scheduled_principal_minor, OLD.schedule_version,
    OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'obligation installment identity and principal schedule are immutable';
  END IF;
  IF NEW.scheduled_interest_minor < OLD.scheduled_interest_minor
     OR NEW.scheduled_fee_minor < OLD.scheduled_fee_minor
     OR NEW.paid_principal_minor < OLD.paid_principal_minor
     OR NEW.paid_interest_minor < OLD.paid_interest_minor
     OR NEW.paid_fee_minor < OLD.paid_fee_minor THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'obligation installment balances cannot move backwards';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE obligation_installments
  DROP CONSTRAINT obligation_installments_tenant_schedule_sequence_key,
  DROP COLUMN schedule_sequence,
  ADD CONSTRAINT obligation_installments_tenant_sequence_key
    UNIQUE (tenant_id, obligation_id, installment_number);

ALTER TABLE obligations
  DROP CONSTRAINT obligations_v2_shape_check,
  DROP CONSTRAINT obligations_servicing_classification_check,
  DROP CONSTRAINT obligations_servicing_owner_check,
  DROP CONSTRAINT obligations_resolution_type_check,
  DROP CONSTRAINT obligations_servicing_amounts_check,
  DROP COLUMN servicing_classification,
  DROP COLUMN days_past_due,
  DROP COLUMN oldest_unpaid_installment_id,
  DROP COLUMN servicing_effective_at,
  DROP COLUMN servicing_reason_code,
  DROP COLUMN servicing_policy_version,
  DROP COLUMN schedule_sequence,
  DROP COLUMN servicing_owner_code,
  DROP COLUMN resolution_type,
  DROP COLUMN resolution_reason_code,
  DROP COLUMN resolution_at,
  DROP COLUMN written_off_principal_minor,
  DROP COLUMN written_off_interest_minor,
  DROP COLUMN written_off_fees_minor;

ALTER TABLE obligations ALTER COLUMN status TYPE TEXT USING status::text;
DROP TYPE IF EXISTS obligation_status;
CREATE TYPE obligation_status AS ENUM (
  'created',
  'active',
  'partially_repaid',
  'fully_repaid',
  'overdue',
  'defaulted',
  'closed',
  'kyc_pending',
  'approved_by_originator',
  'grace_period',
  'dpd_1_30',
  'dpd_31_60',
  'dpd_61_90',
  'restructured',
  'repurchased',
  'written_off'
);
ALTER TABLE obligations
  ALTER COLUMN status TYPE obligation_status USING status::obligation_status;

ALTER TABLE obligations
  ADD CONSTRAINT obligations_v2_shape_check CHECK (
    schema_version <> 'obligation.v2'
    OR (
      credit_intent_id IS NOT NULL
      AND risk_decision_id IS NOT NULL
      AND credit_offer_id IS NOT NULL
      AND acceptance_id IS NOT NULL
      AND authority_type IN ('consent', 'mandate')
      AND authority_ref IS NOT NULL
      AND num_nonnulls(consent_id, mandate_id) = 1
      AND (authority_type <> 'consent' OR (consent_id IS NOT NULL AND authority_ref = consent_id))
      AND (authority_type <> 'mandate' OR (mandate_id IS NOT NULL AND authority_ref = mandate_id))
      AND annual_rate_bps BETWEEN 0 AND 100000
      AND origination_fee_minor = 0
      AND accrued_interest_minor >= outstanding_interest_minor
      AND outstanding_interest_minor >= 0
      AND accrued_fees_minor >= outstanding_fees_minor
      AND outstanding_fees_minor >= 0
      AND total_repaid_minor >= repaid_amount_minor
      AND repayment_frequency IN ('weekly', 'biweekly', 'monthly', 'end_of_term')
      AND installment_count BETWEEN 1 AND 520
      AND first_payment_at IS NOT NULL
      AND maturity_at = due_at
      AND maturity_at >= first_payment_at
      AND schedule_version = 'obligation_schedule.v1'
      AND schedule_hash ~ '^0x[0-9a-f]{64}$'
      AND sandbox_only = TRUE
      AND production_funds_moved = FALSE
      AND withdrawable = FALSE
      AND interest_accrual_remainder >= 0
      AND interest_accrual_remainder < 3650000
      AND accepted_at IS NOT NULL
      AND spend_policy_id IS NULL
      AND cashflow_route_id IS NULL
      AND (
        (
          execution_status = 'pending'
          AND status = 'created'
          AND sandbox_execution_receipt_id IS NULL
          AND executed_at IS NULL
          AND last_accrued_at IS NULL
          AND interest_accrual_remainder = 0
        )
        OR (
          execution_status = 'executed'
          AND status IN ('active', 'partially_repaid', 'fully_repaid', 'overdue', 'defaulted')
          AND sandbox_execution_receipt_id IS NOT NULL
          AND executed_at IS NOT NULL
          AND last_accrued_at IS NOT NULL
          AND last_accrued_at >= executed_at
        )
      )
    )
  );
