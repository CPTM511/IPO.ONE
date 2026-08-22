-- M2A-006: additive, Tenant-isolated Pool V1 to canonical Obligation mapping.
-- Local synthetic no-funds only; no RPC, signer, transaction or deployment.

ALTER TABLE obligations
  DROP CONSTRAINT obligations_v2_shape_check,
  ADD COLUMN pool_obligation_binding_id TEXT,
  ADD COLUMN pool_execution_receipt_id TEXT;

CREATE TABLE pool_obligation_bindings (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  binding_hash TEXT NOT NULL CHECK (binding_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  account_binding_id TEXT NOT NULL,
  account_hash TEXT NOT NULL CHECK (account_hash ~ '^0x[0-9a-f]{64}$'),
  obligation_id TEXT NOT NULL,
  obligation_hash TEXT NOT NULL CHECK (obligation_hash ~ '^0x[0-9a-f]{64}$'),
  chain_id TEXT NOT NULL CHECK (chain_id ~ '^eip155:[1-9][0-9]*$'),
  contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  market_id TEXT NOT NULL CHECK (market_id ~ '^0x[0-9a-f]{64}$'),
  abi_version TEXT NOT NULL CHECK (abi_version = 'IpoOneSecuredPoolV1.v1'),
  position_account_hash TEXT NOT NULL CHECK (position_account_hash ~ '^0x[0-9a-f]{64}$'),
  entry_mode TEXT NOT NULL CHECK (entry_mode IN ('human', 'agent')),
  self_principal BOOLEAN NOT NULL CHECK (self_principal = TRUE),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  bound_at TIMESTAMPTZ NOT NULL,
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_obligation_binding.v1'),
  CONSTRAINT pool_obligation_bindings_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_obligation_bindings_hash_key UNIQUE (tenant_id, binding_hash),
  CONSTRAINT pool_obligation_bindings_position_key UNIQUE (
    tenant_id, chain_id, contract_address, market_id, account_binding_id
  ),
  CONSTRAINT pool_obligation_bindings_obligation_key UNIQUE (tenant_id, obligation_id),
  CONSTRAINT pool_obligation_bindings_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT pool_obligation_bindings_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT pool_obligation_bindings_account_binding_fk
    FOREIGN KEY (tenant_id, account_binding_id) REFERENCES account_bindings(tenant_id, id),
  CONSTRAINT pool_obligation_bindings_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id)
);

CREATE TABLE pool_obligation_projections (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  projection_hash TEXT NOT NULL CHECK (projection_hash ~ '^0x[0-9a-f]{64}$'),
  pool_obligation_binding_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  chain_id TEXT NOT NULL CHECK (chain_id ~ '^eip155:[1-9][0-9]*$'),
  contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  market_id TEXT NOT NULL CHECK (market_id ~ '^0x[0-9a-f]{64}$'),
  account_binding_id TEXT NOT NULL,
  projection_version INTEGER NOT NULL CHECK (projection_version BETWEEN 0 AND 10000000),
  finalized_effect_count INTEGER NOT NULL CHECK (finalized_effect_count = projection_version),
  source_finalized_event_count INTEGER NOT NULL CHECK (source_finalized_event_count >= finalized_effect_count),
  collateral_assets NUMERIC(78,0) NOT NULL CHECK (collateral_assets >= 0),
  debt_assets NUMERIC(78,0) NOT NULL CHECK (debt_assets >= 0),
  bad_debt_assets NUMERIC(78,0) NOT NULL CHECK (bad_debt_assets >= 0),
  total_repaid_assets NUMERIC(78,0) NOT NULL CHECK (total_repaid_assets >= 0),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('bound', 'active', 'settled', 'loss_recorded')),
  last_event_key TEXT CHECK (last_event_key IS NULL OR last_event_key ~ '^0x[0-9a-f]{64}$'),
  last_effect_hash TEXT CHECK (last_effect_hash IS NULL OR last_effect_hash ~ '^0x[0-9a-f]{64}$'),
  last_evidence_hash TEXT CHECK (last_evidence_hash IS NULL OR last_evidence_hash ~ '^0x[0-9a-f]{64}$'),
  projection JSONB NOT NULL CHECK (
    jsonb_typeof(projection) = 'object'
    AND projection->>'schemaVersion' = 'pool_obligation_projection.v1'
    AND projection->>'projectionHash' = projection_hash
    AND (projection->>'projectionVersion')::INTEGER = projection_version
    AND projection @> jsonb_build_object(
      'canonicalObligationRemainsAuthoritative', true,
      'creditStateAuthorizing', false,
      'automaticLimitChange', false,
      'syntheticOnly', true,
      'productionFundsMoved', false
    )
  ),
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_obligation_projection.v1'),
  CONSTRAINT pool_obligation_projections_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_obligation_projections_binding_key UNIQUE (tenant_id, pool_obligation_binding_id),
  CONSTRAINT pool_obligation_projections_obligation_key UNIQUE (tenant_id, obligation_id),
  CONSTRAINT pool_obligation_projections_binding_fk
    FOREIGN KEY (tenant_id, pool_obligation_binding_id)
    REFERENCES pool_obligation_bindings(tenant_id, id),
  CONSTRAINT pool_obligation_projections_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id)
);

CREATE TABLE pool_execution_receipts (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  receipt_hash TEXT NOT NULL CHECK (receipt_hash ~ '^0x[0-9a-f]{64}$'),
  pool_obligation_binding_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  effect_hash TEXT NOT NULL CHECK (effect_hash ~ '^0x[0-9a-f]{64}$'),
  event_key TEXT NOT NULL CHECK (event_key ~ '^0x[0-9a-f]{64}$'),
  observation_hash TEXT NOT NULL CHECK (observation_hash ~ '^0x[0-9a-f]{64}$'),
  amount_minor NUMERIC(78,0) NOT NULL CHECK (amount_minor > 0),
  debt_after_minor NUMERIC(78,0) NOT NULL CHECK (debt_after_minor >= 0),
  finalized_at TIMESTAMPTZ NOT NULL,
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_execution_receipt.v1'),
  CONSTRAINT pool_execution_receipts_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_execution_receipts_hash_key UNIQUE (tenant_id, receipt_hash),
  CONSTRAINT pool_execution_receipts_obligation_key UNIQUE (tenant_id, obligation_id),
  CONSTRAINT pool_execution_receipts_effect_key UNIQUE (tenant_id, effect_hash),
  CONSTRAINT pool_execution_receipts_binding_fk
    FOREIGN KEY (tenant_id, pool_obligation_binding_id)
    REFERENCES pool_obligation_bindings(tenant_id, id),
  CONSTRAINT pool_execution_receipts_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  CONSTRAINT pool_execution_receipts_effect_fk
    FOREIGN KEY (tenant_id, effect_hash)
    REFERENCES pool_chain_finalized_effects(tenant_id, effect_hash)
);

CREATE TABLE pool_obligation_effect_receipts (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  receipt_hash TEXT NOT NULL CHECK (receipt_hash ~ '^0x[0-9a-f]{64}$'),
  pool_obligation_binding_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  event_key TEXT NOT NULL CHECK (event_key ~ '^0x[0-9a-f]{64}$'),
  observation_hash TEXT NOT NULL CHECK (observation_hash ~ '^0x[0-9a-f]{64}$'),
  effect_hash TEXT NOT NULL CHECK (effect_hash ~ '^0x[0-9a-f]{64}$'),
  pool_state_hash TEXT NOT NULL CHECK (pool_state_hash ~ '^0x[0-9a-f]{64}$'),
  event_type TEXT NOT NULL,
  projection_version INTEGER NOT NULL CHECK (projection_version BETWEEN 1 AND 10000000),
  projection_hash TEXT NOT NULL CHECK (projection_hash ~ '^0x[0-9a-f]{64}$'),
  ledger_transaction_ids JSONB NOT NULL CHECK (jsonb_typeof(ledger_transaction_ids) = 'array'),
  domain_event_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^0x[0-9a-f]{64}$'),
  finalized_at TIMESTAMPTZ NOT NULL,
  finality TEXT NOT NULL CHECK (finality = 'finalized'),
  credit_state_candidate BOOLEAN NOT NULL,
  credit_state_authorizing BOOLEAN NOT NULL CHECK (credit_state_authorizing = FALSE),
  automatic_limit_change BOOLEAN NOT NULL CHECK (automatic_limit_change = FALSE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  receipt JSONB NOT NULL CHECK (
    jsonb_typeof(receipt) = 'object'
    AND receipt->>'schemaVersion' = 'pool_obligation_effect_receipt.v1'
    AND receipt->>'receiptHash' = receipt_hash
  ),
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_obligation_effect_receipt.v1'),
  CONSTRAINT pool_obligation_effect_receipts_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_obligation_effect_receipts_hash_key UNIQUE (tenant_id, receipt_hash),
  CONSTRAINT pool_obligation_effect_receipts_effect_key UNIQUE (tenant_id, effect_hash),
  CONSTRAINT pool_obligation_effect_receipts_binding_version_key UNIQUE (
    tenant_id, pool_obligation_binding_id, projection_version
  ),
  CONSTRAINT pool_obligation_effect_receipts_binding_fk
    FOREIGN KEY (tenant_id, pool_obligation_binding_id)
    REFERENCES pool_obligation_bindings(tenant_id, id),
  CONSTRAINT pool_obligation_effect_receipts_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  CONSTRAINT pool_obligation_effect_receipts_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT pool_obligation_effect_receipts_effect_fk
    FOREIGN KEY (tenant_id, effect_hash)
    REFERENCES pool_chain_finalized_effects(tenant_id, effect_hash),
  CONSTRAINT pool_obligation_effect_receipts_event_fk
    FOREIGN KEY (tenant_id, domain_event_id) REFERENCES domain_events(tenant_id, id)
);

ALTER TABLE obligations
  ADD CONSTRAINT obligations_pool_binding_fk
    FOREIGN KEY (tenant_id, pool_obligation_binding_id)
    REFERENCES pool_obligation_bindings(tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT obligations_pool_execution_receipt_fk
    FOREIGN KEY (tenant_id, pool_execution_receipt_id)
    REFERENCES pool_execution_receipts(tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED,
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
          AND sandbox_execution_receipt_id IS NULL AND pool_execution_receipt_id IS NULL
          AND executed_at IS NULL AND last_accrued_at IS NULL AND interest_accrual_remainder = 0)
        OR (execution_status = 'executed'
          AND status IN ('active', 'partially_repaid', 'fully_repaid', 'delinquent', 'defaulted', 'restructured', 'repurchased', 'written_off')
          AND num_nonnulls(sandbox_execution_receipt_id, pool_execution_receipt_id) = 1
          AND (pool_execution_receipt_id IS NULL OR pool_obligation_binding_id IS NOT NULL)
          AND executed_at IS NOT NULL AND last_accrued_at IS NOT NULL AND last_accrued_at >= executed_at)
      )
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
  IF OLD.pool_obligation_binding_id IS NOT NULL
     AND NEW.pool_obligation_binding_id IS DISTINCT FROM OLD.pool_obligation_binding_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pool Obligation binding is immutable once assigned';
  END IF;
  IF OLD.pool_execution_receipt_id IS NOT NULL
     AND NEW.pool_execution_receipt_id IS DISTINCT FROM OLD.pool_execution_receipt_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pool execution receipt is immutable once assigned';
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

CREATE FUNCTION guard_pool_obligation_binding()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pool Obligation bindings cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND (ROW(NEW.id, NEW.tenant_id, NEW.binding_hash, NEW.subject_id,
      NEW.principal_id, NEW.account_binding_id, NEW.account_hash, NEW.obligation_id,
      NEW.obligation_hash, NEW.chain_id, NEW.contract_address, NEW.market_id,
      NEW.abi_version, NEW.position_account_hash, NEW.entry_mode, NEW.self_principal,
      NEW.bound_at, NEW.synthetic_only, NEW.production_funds_moved, NEW.schema_version)
    IS DISTINCT FROM ROW(OLD.id, OLD.tenant_id, OLD.binding_hash, OLD.subject_id,
      OLD.principal_id, OLD.account_binding_id, OLD.account_hash, OLD.obligation_id,
      OLD.obligation_hash, OLD.chain_id, OLD.contract_address, OLD.market_id,
      OLD.abi_version, OLD.position_account_hash, OLD.entry_mode, OLD.self_principal,
      OLD.bound_at, OLD.synthetic_only, OLD.production_funds_moved, OLD.schema_version)
    OR NOT (NEW.status = OLD.status OR (OLD.status = 'active' AND NEW.status = 'disabled'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pool Obligation binding identity or transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_pool_obligation_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pool Obligation projections cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    ROW(NEW.id, NEW.tenant_id, NEW.pool_obligation_binding_id, NEW.obligation_id,
      NEW.subject_id, NEW.principal_id, NEW.chain_id, NEW.contract_address,
      NEW.market_id, NEW.account_binding_id, NEW.schema_version)
    IS DISTINCT FROM ROW(OLD.id, OLD.tenant_id, OLD.pool_obligation_binding_id, OLD.obligation_id,
      OLD.subject_id, OLD.principal_id, OLD.chain_id, OLD.contract_address,
      OLD.market_id, OLD.account_binding_id, OLD.schema_version)
    OR NEW.projection_version <> OLD.projection_version + 1
    OR NEW.finalized_effect_count <> OLD.finalized_effect_count + 1
    OR NEW.source_finalized_event_count <= OLD.source_finalized_event_count
    OR NEW.total_repaid_assets < OLD.total_repaid_assets
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pool Obligation projection transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION reject_pool_obligation_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Pool Obligation receipt is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pool_obligation_bindings_guard
BEFORE UPDATE OR DELETE ON pool_obligation_bindings
FOR EACH ROW EXECUTE FUNCTION guard_pool_obligation_binding();
CREATE TRIGGER pool_obligation_projections_guard
BEFORE UPDATE OR DELETE ON pool_obligation_projections
FOR EACH ROW EXECUTE FUNCTION guard_pool_obligation_projection();
CREATE TRIGGER pool_execution_receipts_immutable
BEFORE UPDATE OR DELETE ON pool_execution_receipts
FOR EACH ROW EXECUTE FUNCTION reject_pool_obligation_append_only_mutation();
CREATE TRIGGER pool_obligation_effect_receipts_immutable
BEFORE UPDATE OR DELETE ON pool_obligation_effect_receipts
FOR EACH ROW EXECUTE FUNCTION reject_pool_obligation_append_only_mutation();

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'pool_obligation_bindings', 'pool_obligation_projections',
    'pool_execution_receipts', 'pool_obligation_effect_receipts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_app_tenant_id()) WITH CHECK (tenant_id = current_app_tenant_id())',
      'tenant_isolation_' || table_name, table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context()',
      'tenant_context_guard_' || table_name, table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX pool_obligation_effect_receipts_replay_idx
  ON pool_obligation_effect_receipts(tenant_id, pool_obligation_binding_id, projection_version);
