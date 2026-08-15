ALTER TABLE human_identity_references
  DROP CONSTRAINT human_identity_references_purpose_codes_check,
  ADD CONSTRAINT human_identity_references_purpose_codes_check CHECK (
    jsonb_typeof(purpose_codes) = 'array'
    AND jsonb_array_length(purpose_codes) BETWEEN 1 AND 8
    AND purpose_codes ? 'identity_reference_use'
    AND purpose_codes <@ '[
      "credit_application",
      "credit_decision",
      "credit_offer_acceptance",
      "identity_reference_use",
      "obligation_servicing",
      "evidence_sharing"
    ]'::jsonb
  );

ALTER TABLE credit_offers
  ADD COLUMN acceptance_id TEXT,
  ADD COLUMN accepted_at TIMESTAMPTZ;

CREATE TABLE credit_offer_acceptances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  acceptance_hash TEXT NOT NULL CHECK (acceptance_hash ~ '^0x[0-9a-f]{64}$'),
  credit_offer_id TEXT NOT NULL,
  credit_offer_hash TEXT NOT NULL CHECK (credit_offer_hash ~ '^0x[0-9a-f]{64}$'),
  terms_hash TEXT NOT NULL CHECK (terms_hash ~ '^0x[0-9a-f]{64}$'),
  credit_intent_id TEXT NOT NULL,
  risk_decision_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authority_type TEXT NOT NULL CHECK (authority_type IN ('consent', 'mandate')),
  authority_ref TEXT NOT NULL,
  consent_id TEXT,
  mandate_id TEXT,
  acknowledgement_hash TEXT NOT NULL CHECK (acknowledgement_hash ~ '^0x[0-9a-f]{64}$'),
  accepted_by_actor_hash TEXT NOT NULL CHECK (accepted_by_actor_hash ~ '^0x[0-9a-f]{64}$'),
  accepted_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'credit_offer_acceptance.v1'),
  CONSTRAINT credit_offer_acceptances_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT credit_offer_acceptances_tenant_hash_key UNIQUE (tenant_id, acceptance_hash),
  CONSTRAINT credit_offer_acceptances_tenant_offer_key UNIQUE (tenant_id, credit_offer_id),
  CONSTRAINT credit_offer_acceptances_exact_authority_check CHECK (
    num_nonnulls(consent_id, mandate_id) = 1
    AND (authority_type <> 'consent' OR (consent_id IS NOT NULL AND authority_ref = consent_id))
    AND (authority_type <> 'mandate' OR (mandate_id IS NOT NULL AND authority_ref = mandate_id))
  ),
  CONSTRAINT credit_offer_acceptances_tenant_offer_fk
    FOREIGN KEY (tenant_id, credit_offer_id) REFERENCES credit_offers(tenant_id, id),
  CONSTRAINT credit_offer_acceptances_tenant_intent_fk
    FOREIGN KEY (tenant_id, credit_intent_id) REFERENCES credit_intents(tenant_id, id),
  CONSTRAINT credit_offer_acceptances_tenant_risk_fk
    FOREIGN KEY (tenant_id, risk_decision_id) REFERENCES risk_decisions(tenant_id, id),
  CONSTRAINT credit_offer_acceptances_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT credit_offer_acceptances_tenant_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT credit_offer_acceptances_tenant_consent_fk
    FOREIGN KEY (tenant_id, consent_id) REFERENCES consent_records(tenant_id, id),
  CONSTRAINT credit_offer_acceptances_tenant_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id)
);

ALTER TABLE credit_offers
  ADD CONSTRAINT credit_offers_tenant_acceptance_fk
    FOREIGN KEY (tenant_id, acceptance_id)
    REFERENCES credit_offer_acceptances(tenant_id, id),
  ADD CONSTRAINT credit_offers_acceptance_state_check CHECK (
    (status = 'accepted' AND acceptance_id IS NOT NULL AND accepted_at IS NOT NULL)
    OR (status <> 'accepted' AND acceptance_id IS NULL AND accepted_at IS NULL)
  );

ALTER TABLE obligations
  ALTER COLUMN mandate_id DROP NOT NULL,
  ALTER COLUMN spend_policy_id DROP NOT NULL,
  ALTER COLUMN cashflow_route_id DROP NOT NULL,
  DROP CONSTRAINT obligations_amounts_valid,
  ADD COLUMN credit_intent_id TEXT,
  ADD COLUMN risk_decision_id TEXT,
  ADD COLUMN credit_offer_id TEXT,
  ADD COLUMN acceptance_id TEXT,
  ADD COLUMN authority_type TEXT,
  ADD COLUMN authority_ref TEXT,
  ADD COLUMN consent_id TEXT,
  ADD COLUMN annual_rate_bps INTEGER,
  ADD COLUMN origination_fee_minor NUMERIC(78,0),
  ADD COLUMN accrued_interest_minor NUMERIC(78,0),
  ADD COLUMN outstanding_interest_minor NUMERIC(78,0),
  ADD COLUMN outstanding_fees_minor NUMERIC(78,0),
  ADD COLUMN total_repaid_minor NUMERIC(78,0),
  ADD COLUMN repayment_frequency TEXT,
  ADD COLUMN installment_count INTEGER,
  ADD COLUMN first_payment_at TIMESTAMPTZ,
  ADD COLUMN maturity_at TIMESTAMPTZ,
  ADD COLUMN schedule_version TEXT,
  ADD COLUMN schedule_hash TEXT,
  ADD COLUMN execution_status TEXT,
  ADD COLUMN sandbox_only BOOLEAN,
  ADD COLUMN production_funds_moved BOOLEAN,
  ADD COLUMN accepted_at TIMESTAMPTZ;

ALTER TABLE obligations
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
  ADD CONSTRAINT obligations_schema_version_check
    CHECK (schema_version IN ('obligation.v1', 'obligation.v2')),
  ADD CONSTRAINT obligations_authority_type_check
    CHECK (authority_type IS NULL OR authority_type IN ('consent', 'mandate')),
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
  ),
  ADD CONSTRAINT obligations_tenant_intent_fk
    FOREIGN KEY (tenant_id, credit_intent_id) REFERENCES credit_intents(tenant_id, id),
  ADD CONSTRAINT obligations_tenant_risk_decision_fk
    FOREIGN KEY (tenant_id, risk_decision_id) REFERENCES risk_decisions(tenant_id, id),
  ADD CONSTRAINT obligations_tenant_credit_offer_fk
    FOREIGN KEY (tenant_id, credit_offer_id) REFERENCES credit_offers(tenant_id, id),
  ADD CONSTRAINT obligations_tenant_acceptance_fk
    FOREIGN KEY (tenant_id, acceptance_id) REFERENCES credit_offer_acceptances(tenant_id, id),
  ADD CONSTRAINT obligations_tenant_consent_fk
    FOREIGN KEY (tenant_id, consent_id) REFERENCES consent_records(tenant_id, id),
  ADD CONSTRAINT obligations_tenant_offer_key UNIQUE (tenant_id, credit_offer_id),
  ADD CONSTRAINT obligations_tenant_acceptance_key UNIQUE (tenant_id, acceptance_id);

CREATE TABLE obligation_installments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  obligation_id TEXT NOT NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number BETWEEN 1 AND 520),
  due_at TIMESTAMPTZ NOT NULL,
  scheduled_principal_minor NUMERIC(78,0) NOT NULL CHECK (scheduled_principal_minor >= 0),
  scheduled_interest_minor NUMERIC(78,0) NOT NULL CHECK (scheduled_interest_minor >= 0),
  scheduled_fee_minor NUMERIC(78,0) NOT NULL CHECK (scheduled_fee_minor >= 0),
  paid_principal_minor NUMERIC(78,0) NOT NULL CHECK (paid_principal_minor >= 0),
  paid_interest_minor NUMERIC(78,0) NOT NULL CHECK (paid_interest_minor >= 0),
  paid_fee_minor NUMERIC(78,0) NOT NULL CHECK (paid_fee_minor >= 0),
  status TEXT NOT NULL CHECK (status = 'scheduled'),
  schedule_version TEXT NOT NULL CHECK (schedule_version = 'obligation_schedule.v1'),
  schema_version TEXT NOT NULL CHECK (schema_version = 'obligation_installment.v1'),
  CONSTRAINT obligation_installments_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT obligation_installments_tenant_sequence_key UNIQUE (tenant_id, obligation_id, installment_number),
  CONSTRAINT obligation_installments_tenant_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  CONSTRAINT obligation_installments_payment_bounds_check CHECK (
    paid_principal_minor <= scheduled_principal_minor
    AND paid_interest_minor <= scheduled_interest_minor
    AND paid_fee_minor <= scheduled_fee_minor
  )
);

CREATE FUNCTION guard_credit_offer_acceptance_projection()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'credit Offer acceptances are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_obligation_installment_projection()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'accepted obligation schedules are immutable before execution';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_shared_obligation_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.schema_version <> 'obligation.v2' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
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

CREATE TRIGGER credit_offer_acceptances_projection_guard
BEFORE UPDATE OR DELETE ON credit_offer_acceptances
FOR EACH ROW EXECUTE FUNCTION guard_credit_offer_acceptance_projection();
CREATE TRIGGER obligation_installments_projection_guard
BEFORE UPDATE OR DELETE ON obligation_installments
FOR EACH ROW EXECUTE FUNCTION guard_obligation_installment_projection();
CREATE TRIGGER shared_obligations_projection_guard
BEFORE UPDATE OR DELETE ON obligations
FOR EACH ROW EXECUTE FUNCTION guard_shared_obligation_projection();

ALTER TABLE credit_offer_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_offer_acceptances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_credit_offer_acceptances ON credit_offer_acceptances
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_credit_offer_acceptances
BEFORE INSERT OR UPDATE OR DELETE ON credit_offer_acceptances
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE obligation_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligation_installments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_obligation_installments ON obligation_installments
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_obligation_installments
BEFORE INSERT OR UPDATE OR DELETE ON obligation_installments
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX credit_offer_acceptances_tenant_subject_accepted_idx
  ON credit_offer_acceptances(tenant_id, subject_id, accepted_at DESC);
CREATE INDEX obligation_installments_tenant_obligation_due_idx
  ON obligation_installments(tenant_id, obligation_id, due_at, installment_number);
