ALTER TABLE obligations
  DROP CONSTRAINT obligations_v2_shape_check,
  DROP CONSTRAINT obligations_amounts_valid,
  ADD COLUMN sandbox_execution_receipt_id TEXT,
  ADD COLUMN executed_at TIMESTAMPTZ,
  ADD COLUMN last_accrued_at TIMESTAMPTZ,
  ADD COLUMN interest_accrual_remainder NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN withdrawable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE sandbox_execution_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  receipt_hash TEXT NOT NULL CHECK (receipt_hash ~ '^0x[0-9a-f]{64}$'),
  obligation_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  amount_minor NUMERIC(78,0) NOT NULL CHECK (amount_minor > 0),
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  adapter_key_id TEXT NOT NULL CHECK (adapter_key_id ~ '^0x[0-9a-f]{64}$'),
  adapter_message_hash TEXT NOT NULL CHECK (adapter_message_hash ~ '^0x[0-9a-f]{64}$'),
  adapter_signature TEXT NOT NULL CHECK (length(adapter_signature) BETWEEN 40 AND 512),
  adapter_issued_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  withdrawable BOOLEAN NOT NULL CHECK (withdrawable = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'sandbox_execution_receipt.v1'),
  CONSTRAINT sandbox_execution_receipts_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT sandbox_execution_receipts_tenant_hash_key UNIQUE (tenant_id, receipt_hash),
  CONSTRAINT sandbox_execution_receipts_tenant_obligation_key UNIQUE (tenant_id, obligation_id),
  CONSTRAINT sandbox_execution_receipts_tenant_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  CONSTRAINT sandbox_execution_receipts_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id)
);

ALTER TABLE obligations
  ADD CONSTRAINT obligations_tenant_execution_receipt_fk
    FOREIGN KEY (tenant_id, sandbox_execution_receipt_id)
    REFERENCES sandbox_execution_receipts(tenant_id, id),
  ADD CONSTRAINT obligations_amounts_valid CHECK (
    amount_minor > 0
    AND outstanding_minor >= 0
    AND outstanding_minor <= amount_minor
    AND accrued_fees_minor >= 0
    AND repaid_amount_minor >= 0
    AND repayment_priority > 0
    AND amount_minor = outstanding_minor + repaid_amount_minor
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

ALTER TABLE repayment_events
  ADD COLUMN repayment_hash TEXT,
  ADD COLUMN requested_minor NUMERIC(78,0),
  ADD COLUMN applied_minor NUMERIC(78,0),
  ADD COLUMN applied_fee_minor NUMERIC(78,0),
  ADD COLUMN applied_interest_minor NUMERIC(78,0),
  ADD COLUMN applied_principal_minor NUMERIC(78,0),
  ADD COLUMN surplus_minor NUMERIC(78,0),
  ADD COLUMN remaining_principal_minor NUMERIC(78,0),
  ADD COLUMN remaining_interest_minor NUMERIC(78,0),
  ADD COLUMN remaining_fees_minor NUMERIC(78,0),
  ADD COLUMN source_code TEXT,
  ADD COLUMN actor_hash TEXT,
  ADD COLUMN accrued_interest_minor NUMERIC(78,0),
  ADD COLUMN accrual_days INTEGER,
  ADD COLUMN ledger_transaction_id TEXT,
  ADD COLUMN interest_ledger_transaction_id TEXT,
  ADD COLUMN sandbox_only BOOLEAN,
  ADD COLUMN production_funds_moved BOOLEAN,
  ADD CONSTRAINT repayment_events_schema_version_check
    CHECK (schema_version IN ('repayment.v1', 'repayment.v2')),
  ADD CONSTRAINT repayment_events_v2_shape_check CHECK (
    schema_version <> 'repayment.v2'
    OR (
      repayment_hash ~ '^0x[0-9a-f]{64}$'
      AND requested_minor > 0
      AND applied_minor > 0
      AND amount_minor = applied_minor
      AND applied_fee_minor >= 0
      AND applied_interest_minor >= 0
      AND applied_principal_minor >= 0
      AND applied_minor = applied_fee_minor + applied_interest_minor + applied_principal_minor
      AND surplus_minor >= 0
      AND requested_minor = applied_minor + surplus_minor
      AND remaining_minor = remaining_principal_minor + remaining_interest_minor + remaining_fees_minor
      AND remaining_principal_minor >= 0
      AND remaining_interest_minor >= 0
      AND remaining_fees_minor >= 0
      AND source_code IN ('synthetic_wallet', 'synthetic_bank', 'synthetic_revenue')
      AND actor_hash ~ '^0x[0-9a-f]{64}$'
      AND accrued_interest_minor >= 0
      AND accrual_days BETWEEN 0 AND 36600
      AND ledger_transaction_id IS NOT NULL
      AND sandbox_only = TRUE
      AND production_funds_moved = FALSE
    )
  ),
  ADD CONSTRAINT repayment_events_tenant_ledger_transaction_fk
    FOREIGN KEY (tenant_id, ledger_transaction_id)
    REFERENCES ledger_transactions(tenant_id, id),
  ADD CONSTRAINT repayment_events_tenant_interest_transaction_fk
    FOREIGN KEY (tenant_id, interest_ledger_transaction_id)
    REFERENCES ledger_transactions(tenant_id, id);

ALTER TABLE obligation_installments
  DROP CONSTRAINT obligation_installments_status_check,
  DROP CONSTRAINT obligation_installments_payment_bounds_check,
  ADD CONSTRAINT obligation_installments_status_check
    CHECK (status IN ('scheduled', 'partial', 'paid')),
  ADD CONSTRAINT obligation_installments_payment_bounds_check CHECK (
    paid_principal_minor <= scheduled_principal_minor
    AND paid_interest_minor <= scheduled_interest_minor
    AND paid_fee_minor <= scheduled_fee_minor
    AND (
      status <> 'paid'
      OR (
        paid_principal_minor = scheduled_principal_minor
        AND paid_interest_minor = scheduled_interest_minor
        AND paid_fee_minor = scheduled_fee_minor
      )
    )
  );

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

CREATE FUNCTION guard_sandbox_execution_receipt_projection()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'sandbox execution receipts are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sandbox_execution_receipts_projection_guard
BEFORE UPDATE OR DELETE ON sandbox_execution_receipts
FOR EACH ROW EXECUTE FUNCTION guard_sandbox_execution_receipt_projection();

ALTER TABLE sandbox_execution_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sandbox_execution_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sandbox_execution_receipts ON sandbox_execution_receipts
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_sandbox_execution_receipts
BEFORE INSERT OR UPDATE OR DELETE ON sandbox_execution_receipts
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX sandbox_execution_receipts_tenant_subject_executed_idx
  ON sandbox_execution_receipts(tenant_id, subject_id, executed_at DESC);
CREATE INDEX repayment_events_tenant_obligation_occurred_second_idx
  ON repayment_events(tenant_id, obligation_id, occurred_at DESC)
  WHERE schema_version = 'repayment.v2';
