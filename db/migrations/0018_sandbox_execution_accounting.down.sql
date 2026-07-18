DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM obligations WHERE schema_version = 'obligation.v2' AND execution_status = 'executed') THEN
    RAISE EXCEPTION 'cannot roll back sandbox accounting while executed obligation.v2 rows exist';
  END IF;
  IF EXISTS (SELECT 1 FROM repayment_events WHERE schema_version = 'repayment.v2') THEN
    RAISE EXCEPTION 'cannot roll back sandbox accounting while repayment.v2 rows exist';
  END IF;
END $$;

DROP INDEX IF EXISTS repayment_events_tenant_obligation_occurred_second_idx;
DROP INDEX IF EXISTS sandbox_execution_receipts_tenant_subject_executed_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_sandbox_execution_receipts ON sandbox_execution_receipts;
DROP TRIGGER IF EXISTS sandbox_execution_receipts_projection_guard ON sandbox_execution_receipts;
DROP FUNCTION IF EXISTS guard_sandbox_execution_receipt_projection();

CREATE OR REPLACE FUNCTION guard_obligation_installment_projection()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'accepted obligation schedules are immutable before execution';
END;
$$ LANGUAGE plpgsql;

ALTER TABLE obligation_installments
  DROP CONSTRAINT obligation_installments_payment_bounds_check,
  DROP CONSTRAINT obligation_installments_status_check,
  ADD CONSTRAINT obligation_installments_status_check CHECK (status = 'scheduled'),
  ADD CONSTRAINT obligation_installments_payment_bounds_check CHECK (
    paid_principal_minor <= scheduled_principal_minor
    AND paid_interest_minor <= scheduled_interest_minor
    AND paid_fee_minor <= scheduled_fee_minor
  );

ALTER TABLE repayment_events
  DROP CONSTRAINT repayment_events_tenant_interest_transaction_fk,
  DROP CONSTRAINT repayment_events_tenant_ledger_transaction_fk,
  DROP CONSTRAINT repayment_events_v2_shape_check,
  DROP CONSTRAINT repayment_events_schema_version_check,
  DROP COLUMN production_funds_moved,
  DROP COLUMN sandbox_only,
  DROP COLUMN interest_ledger_transaction_id,
  DROP COLUMN ledger_transaction_id,
  DROP COLUMN accrual_days,
  DROP COLUMN accrued_interest_minor,
  DROP COLUMN actor_hash,
  DROP COLUMN source_code,
  DROP COLUMN remaining_fees_minor,
  DROP COLUMN remaining_interest_minor,
  DROP COLUMN remaining_principal_minor,
  DROP COLUMN surplus_minor,
  DROP COLUMN applied_principal_minor,
  DROP COLUMN applied_interest_minor,
  DROP COLUMN applied_fee_minor,
  DROP COLUMN applied_minor,
  DROP COLUMN requested_minor,
  DROP COLUMN repayment_hash;

ALTER TABLE obligations
  DROP CONSTRAINT obligations_v2_shape_check,
  DROP CONSTRAINT obligations_amounts_valid,
  DROP CONSTRAINT obligations_tenant_execution_receipt_fk;

DROP TABLE IF EXISTS sandbox_execution_receipts;

ALTER TABLE obligations
  DROP COLUMN withdrawable,
  DROP COLUMN interest_accrual_remainder,
  DROP COLUMN last_accrued_at,
  DROP COLUMN executed_at,
  DROP COLUMN sandbox_execution_receipt_id,
  ADD CONSTRAINT obligations_amounts_valid CHECK (
    amount_minor > 0
    AND outstanding_minor >= 0
    AND outstanding_minor <= amount_minor
    AND accrued_fees_minor >= 0
    AND repaid_amount_minor >= 0
    AND repayment_priority > 0
    AND (
      schema_version <> 'obligation.v1'
      OR amount_minor = outstanding_minor + repaid_amount_minor
    )
  ),
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
      AND origination_fee_minor >= 0
      AND accrued_interest_minor >= 0
      AND outstanding_interest_minor >= 0
      AND outstanding_fees_minor >= 0
      AND total_repaid_minor >= 0
      AND repayment_frequency IN ('weekly', 'biweekly', 'monthly', 'end_of_term')
      AND installment_count BETWEEN 1 AND 520
      AND first_payment_at IS NOT NULL
      AND maturity_at = due_at
      AND maturity_at >= first_payment_at
      AND schedule_version = 'obligation_schedule.v1'
      AND schedule_hash ~ '^0x[0-9a-f]{64}$'
      AND execution_status = 'pending'
      AND sandbox_only = TRUE
      AND production_funds_moved = FALSE
      AND status = 'created'
      AND accepted_at IS NOT NULL
      AND spend_policy_id IS NULL
      AND cashflow_route_id IS NULL
    )
  );
