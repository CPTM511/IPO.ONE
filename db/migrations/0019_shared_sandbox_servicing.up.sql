-- PostgreSQL does not allow a newly added enum value to be used before the
-- transaction commits. Migrations are atomic in this repository, so rebuild
-- the enum in-place instead of using ALTER TYPE ... ADD VALUE.
-- Drop the status-bearing v2 check first: PostgreSQL otherwise retains enum-
-- typed constants inside the constraint while the column is temporarily text.
ALTER TABLE obligations DROP CONSTRAINT obligations_v2_shape_check;
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
  'written_off',
  'delinquent'
);
ALTER TABLE obligations
  ALTER COLUMN status TYPE obligation_status USING status::obligation_status;

ALTER TABLE obligation_installments
  DROP CONSTRAINT obligation_installments_tenant_sequence_key,
  ADD COLUMN schedule_sequence INTEGER NOT NULL DEFAULT 1
    CHECK (schedule_sequence BETWEEN 1 AND 100),
  ADD CONSTRAINT obligation_installments_tenant_schedule_sequence_key
    UNIQUE (tenant_id, obligation_id, schedule_sequence, installment_number);

ALTER TABLE obligations
  ADD COLUMN servicing_classification TEXT,
  ADD COLUMN days_past_due INTEGER,
  ADD COLUMN oldest_unpaid_installment_id TEXT,
  ADD COLUMN servicing_effective_at TIMESTAMPTZ,
  ADD COLUMN servicing_reason_code TEXT,
  ADD COLUMN servicing_policy_version TEXT,
  ADD COLUMN schedule_sequence INTEGER,
  ADD COLUMN servicing_owner_code TEXT,
  ADD COLUMN resolution_type TEXT,
  ADD COLUMN resolution_reason_code TEXT,
  ADD COLUMN resolution_at TIMESTAMPTZ,
  ADD COLUMN written_off_principal_minor NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN written_off_interest_minor NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN written_off_fees_minor NUMERIC(78,0) NOT NULL DEFAULT 0;

UPDATE obligations
SET servicing_classification = 'current',
    days_past_due = 0,
    oldest_unpaid_installment_id = (
      SELECT i.id
      FROM obligation_installments i
      WHERE i.obligation_id = obligations.id
        AND (
          i.scheduled_principal_minor + i.scheduled_interest_minor + i.scheduled_fee_minor
          > i.paid_principal_minor + i.paid_interest_minor + i.paid_fee_minor
        )
      ORDER BY i.installment_number
      LIMIT 1
    ),
    servicing_effective_at = COALESCE(executed_at, accepted_at, created_at),
    servicing_reason_code = 'servicing_baseline',
    servicing_policy_version = 'sandbox-servicing-policy.v1',
    schedule_sequence = 1,
    servicing_owner_code = 'sandbox_platform'
WHERE schema_version = 'obligation.v2';

ALTER TABLE obligations
  ADD CONSTRAINT obligations_servicing_classification_check CHECK (
    servicing_classification IS NULL OR servicing_classification IN (
      'current', 'grace_period', 'dpd_1_30', 'dpd_31_60', 'dpd_61_89',
      'defaulted', 'cured', 'restructured', 'repurchased', 'written_off'
    )
  ),
  ADD CONSTRAINT obligations_servicing_owner_check CHECK (
    servicing_owner_code IS NULL OR servicing_owner_code IN ('sandbox_platform', 'sandbox_originator')
  ),
  ADD CONSTRAINT obligations_resolution_type_check CHECK (
    resolution_type IS NULL OR resolution_type IN ('restructure', 'repurchase', 'write_off')
  ),
  ADD CONSTRAINT obligations_servicing_amounts_check CHECK (
    written_off_principal_minor >= 0
    AND written_off_interest_minor >= 0
    AND written_off_fees_minor >= 0
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
      AND schedule_sequence BETWEEN 1 AND 100
      AND schedule_hash ~ '^0x[0-9a-f]{64}$'
      AND sandbox_only = TRUE
      AND production_funds_moved = FALSE
      AND withdrawable = FALSE
      AND interest_accrual_remainder >= 0
      AND interest_accrual_remainder < 3650000
      AND accepted_at IS NOT NULL
      AND spend_policy_id IS NULL
      AND cashflow_route_id IS NULL
      AND servicing_classification IS NOT NULL
      AND days_past_due >= 0
      AND servicing_effective_at IS NOT NULL
      AND servicing_reason_code IS NOT NULL
      AND servicing_policy_version = 'sandbox-servicing-policy.v1'
      AND servicing_owner_code IN ('sandbox_platform', 'sandbox_originator')
      AND (
        (resolution_type IS NULL AND resolution_reason_code IS NULL AND resolution_at IS NULL)
        OR (resolution_type IS NOT NULL AND resolution_reason_code IS NOT NULL AND resolution_at IS NOT NULL)
      )
      AND (
        status = 'written_off'
        OR (
          written_off_principal_minor = 0
          AND written_off_interest_minor = 0
          AND written_off_fees_minor = 0
        )
      )
      AND (
        (status = 'created' AND servicing_classification = 'current' AND days_past_due = 0)
        OR (status IN ('active', 'partially_repaid', 'fully_repaid')
            AND servicing_classification IN ('current', 'cured'))
        OR (status = 'delinquent'
            AND servicing_classification IN ('grace_period', 'dpd_1_30', 'dpd_31_60', 'dpd_61_89'))
        OR (status = 'defaulted' AND servicing_classification = 'defaulted' AND days_past_due >= 90)
        OR (status = 'restructured' AND servicing_classification = 'restructured'
            AND resolution_type = 'restructure')
        OR (status = 'repurchased' AND servicing_classification = 'repurchased'
            AND resolution_type = 'repurchase')
        OR (status = 'written_off' AND servicing_classification = 'written_off'
            AND resolution_type = 'write_off'
            AND written_off_principal_minor + written_off_interest_minor + written_off_fees_minor > 0)
      )
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
          AND status IN (
            'active', 'partially_repaid', 'fully_repaid', 'delinquent',
            'defaulted', 'restructured', 'repurchased', 'written_off'
          )
          AND sandbox_execution_receipt_id IS NOT NULL
          AND executed_at IS NOT NULL
          AND last_accrued_at IS NOT NULL
          AND last_accrued_at >= executed_at
        )
      )
    )
  );

CREATE TABLE sandbox_servicing_actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  servicing_action_hash TEXT NOT NULL CHECK (servicing_action_hash ~ '^0x[0-9a-f]{64}$'),
  obligation_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (
    action_type IN ('advance', 'cure', 'restructure', 'repurchase', 'write_off')
  ),
  previous_status TEXT NOT NULL,
  next_status TEXT NOT NULL,
  previous_classification TEXT NOT NULL,
  next_classification TEXT NOT NULL,
  days_past_due INTEGER NOT NULL CHECK (days_past_due >= 0),
  oldest_unpaid_installment_id TEXT,
  reason_code TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('system_worker', 'repayment', 'dual_control')),
  actor_hash TEXT NOT NULL CHECK (actor_hash ~ '^0x[0-9a-f]{64}$'),
  policy_version TEXT NOT NULL CHECK (policy_version = 'sandbox-servicing-policy.v1'),
  schedule_sequence_before INTEGER NOT NULL CHECK (schedule_sequence_before BETWEEN 1 AND 100),
  schedule_sequence_after INTEGER NOT NULL CHECK (schedule_sequence_after BETWEEN 1 AND 100),
  schedule_hash_before TEXT NOT NULL CHECK (schedule_hash_before ~ '^0x[0-9a-f]{64}$'),
  schedule_hash_after TEXT NOT NULL CHECK (schedule_hash_after ~ '^0x[0-9a-f]{64}$'),
  balances_before JSONB NOT NULL CHECK (jsonb_typeof(balances_before) = 'object'),
  balances_after JSONB NOT NULL CHECK (jsonb_typeof(balances_after) = 'object'),
  previous_schedule JSONB,
  approval_proposal_id TEXT,
  approval_execution_id TEXT,
  effective_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'sandbox_servicing_action.v1'),
  CONSTRAINT sandbox_servicing_actions_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT sandbox_servicing_actions_tenant_hash_key UNIQUE (tenant_id, servicing_action_hash),
  CONSTRAINT sandbox_servicing_actions_tenant_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  CONSTRAINT sandbox_servicing_actions_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT sandbox_servicing_actions_tenant_approval_proposal_fk
    FOREIGN KEY (tenant_id, approval_proposal_id)
    REFERENCES approval_proposals(tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT sandbox_servicing_actions_tenant_approval_execution_fk
    FOREIGN KEY (tenant_id, approval_execution_id)
    REFERENCES approval_executions(tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT sandbox_servicing_actions_approval_shape_check CHECK (
    (source = 'dual_control' AND approval_proposal_id IS NOT NULL AND approval_execution_id IS NOT NULL)
    OR (source <> 'dual_control' AND approval_proposal_id IS NULL AND approval_execution_id IS NULL)
  )
);

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

CREATE OR REPLACE FUNCTION guard_obligation_installment_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'obligation installments cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.obligation_id, NEW.installment_number,
    NEW.due_at, NEW.scheduled_principal_minor, NEW.schedule_version,
    NEW.schedule_sequence, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.obligation_id, OLD.installment_number,
    OLD.due_at, OLD.scheduled_principal_minor, OLD.schedule_version,
    OLD.schedule_sequence, OLD.schema_version
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

CREATE FUNCTION guard_sandbox_servicing_action_projection()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'sandbox servicing actions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sandbox_servicing_actions_projection_guard
BEFORE UPDATE OR DELETE ON sandbox_servicing_actions
FOR EACH ROW EXECUTE FUNCTION guard_sandbox_servicing_action_projection();

ALTER TABLE sandbox_servicing_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sandbox_servicing_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sandbox_servicing_actions ON sandbox_servicing_actions
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_sandbox_servicing_actions
BEFORE INSERT OR UPDATE OR DELETE ON sandbox_servicing_actions
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX sandbox_servicing_actions_tenant_obligation_effective_idx
  ON sandbox_servicing_actions(tenant_id, obligation_id, effective_at DESC, id);
CREATE INDEX obligations_tenant_servicing_classification_idx
  ON obligations(tenant_id, servicing_classification, days_past_due DESC)
  WHERE schema_version = 'obligation.v2';
