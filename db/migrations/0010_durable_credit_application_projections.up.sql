ALTER TABLE subjects
  ADD CONSTRAINT subjects_tenant_id_primary_principal_key
    UNIQUE (tenant_id, id, primary_principal_id);

ALTER TABLE risk_decisions
  ADD CONSTRAINT risk_decisions_tenant_id_subject_asset_key
    UNIQUE (tenant_id, id, subject_id, asset_id);

CREATE TABLE credit_intents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  intent_hash TEXT NOT NULL CHECK (intent_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  authority_type TEXT NOT NULL CHECK (authority_type IN ('consent', 'mandate')),
  authority_ref TEXT NOT NULL CHECK (length(authority_ref) BETWEEN 1 AND 2048),
  asset_id TEXT NOT NULL CHECK (length(asset_id) BETWEEN 1 AND 2048),
  requested_principal_minor NUMERIC(78,0) NOT NULL CHECK (requested_principal_minor > 0),
  purpose_code TEXT NOT NULL CHECK (purpose_code ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  requested_term_days INTEGER NOT NULL CHECK (requested_term_days BETWEEN 1 AND 3660),
  repayment_frequency TEXT NOT NULL CHECK (
    repayment_frequency IN ('weekly', 'biweekly', 'monthly', 'end_of_term')
  ),
  installment_count INTEGER NOT NULL CHECK (installment_count BETWEEN 1 AND 520),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_requested BOOLEAN NOT NULL CHECK (production_funds_requested = FALSE),
  status TEXT NOT NULL CHECK (status IN ('submitted', 'decided', 'withdrawn', 'expired')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL CHECK (updated_at >= created_at),
  schema_version TEXT NOT NULL CHECK (schema_version = 'credit_intent.v1'),
  CONSTRAINT credit_intents_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT credit_intents_tenant_intent_hash_key UNIQUE (tenant_id, intent_hash),
  CONSTRAINT credit_intents_tenant_id_subject_asset_key
    UNIQUE (tenant_id, id, subject_id, asset_id),
  CONSTRAINT credit_intents_tenant_subject_principal_fk
    FOREIGN KEY (tenant_id, subject_id, principal_id)
    REFERENCES subjects(tenant_id, id, primary_principal_id)
);

CREATE TABLE credit_offers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  offer_hash TEXT NOT NULL CHECK (offer_hash ~ '^0x[0-9a-f]{64}$'),
  terms_hash TEXT NOT NULL CHECK (terms_hash ~ '^0x[0-9a-f]{64}$'),
  credit_intent_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  risk_decision_id TEXT NOT NULL,
  asset_id TEXT NOT NULL CHECK (length(asset_id) BETWEEN 1 AND 2048),
  approved_principal_minor NUMERIC(78,0) NOT NULL CHECK (approved_principal_minor > 0),
  annual_rate_bps INTEGER NOT NULL CHECK (annual_rate_bps BETWEEN 0 AND 100000),
  origination_fee_minor NUMERIC(78,0) NOT NULL CHECK (
    origination_fee_minor >= 0 AND origination_fee_minor <= approved_principal_minor
  ),
  repayment_frequency TEXT NOT NULL CHECK (
    repayment_frequency IN ('weekly', 'biweekly', 'monthly', 'end_of_term')
  ),
  installment_count INTEGER NOT NULL CHECK (installment_count BETWEEN 1 AND 520),
  first_payment_at TIMESTAMPTZ NOT NULL,
  maturity_at TIMESTAMPTZ NOT NULL,
  disclosure_ref TEXT NOT NULL CHECK (length(disclosure_ref) BETWEEN 1 AND 2048),
  terms_version TEXT NOT NULL CHECK (terms_version = 'credit_terms.v1'),
  valid_until TIMESTAMPTZ NOT NULL,
  reason_codes JSONB NOT NULL CHECK (
    jsonb_typeof(reason_codes) = 'array'
    AND jsonb_array_length(reason_codes) BETWEEN 1 AND 16
  ),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_approved BOOLEAN NOT NULL CHECK (production_funds_approved = FALSE),
  status TEXT NOT NULL CHECK (status IN ('offered', 'accepted', 'declined', 'expired', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL CHECK (updated_at >= created_at),
  schema_version TEXT NOT NULL CHECK (schema_version = 'credit_offer.v1'),
  CONSTRAINT credit_offers_schedule_valid CHECK (
    first_payment_at > created_at
    AND maturity_at >= first_payment_at
    AND valid_until > created_at
  ),
  CONSTRAINT credit_offers_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT credit_offers_tenant_offer_hash_key UNIQUE (tenant_id, offer_hash),
  CONSTRAINT credit_offers_tenant_intent_subject_asset_fk
    FOREIGN KEY (tenant_id, credit_intent_id, subject_id, asset_id)
    REFERENCES credit_intents(tenant_id, id, subject_id, asset_id),
  CONSTRAINT credit_offers_tenant_risk_subject_asset_fk
    FOREIGN KEY (tenant_id, risk_decision_id, subject_id, asset_id)
    REFERENCES risk_decisions(tenant_id, id, subject_id, asset_id)
);

CREATE FUNCTION guard_credit_intent_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'credit intent projections cannot be deleted';
  END IF;

  IF ROW(
    NEW.tenant_id, NEW.intent_hash, NEW.subject_id, NEW.principal_id,
    NEW.authority_type, NEW.authority_ref, NEW.asset_id,
    NEW.requested_principal_minor, NEW.purpose_code, NEW.requested_term_days,
    NEW.repayment_frequency, NEW.installment_count, NEW.sandbox_only,
    NEW.production_funds_requested, NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.intent_hash, OLD.subject_id, OLD.principal_id,
    OLD.authority_type, OLD.authority_ref, OLD.asset_id,
    OLD.requested_principal_minor, OLD.purpose_code, OLD.requested_term_days,
    OLD.repayment_frequency, OLD.installment_count, OLD.sandbox_only,
    OLD.production_funds_requested, OLD.created_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'credit intent identity and terms are immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'submitted'
    AND NEW.status IN ('decided', 'withdrawn', 'expired')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid credit intent status transition';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'credit intent updated_at cannot move backwards';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_credit_offer_projection()
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

CREATE TRIGGER credit_intents_projection_guard
BEFORE UPDATE OR DELETE ON credit_intents
FOR EACH ROW EXECUTE FUNCTION guard_credit_intent_projection();

CREATE TRIGGER credit_offers_projection_guard
BEFORE UPDATE OR DELETE ON credit_offers
FOR EACH ROW EXECUTE FUNCTION guard_credit_offer_projection();

ALTER TABLE credit_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_credit_intents ON credit_intents
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_credit_intents
BEFORE INSERT OR UPDATE OR DELETE ON credit_intents
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE credit_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_offers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_credit_offers ON credit_offers
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_credit_offers
BEFORE INSERT OR UPDATE OR DELETE ON credit_offers
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX credit_intents_tenant_subject_created_idx
  ON credit_intents(tenant_id, subject_id, created_at DESC);
CREATE INDEX credit_intents_tenant_status_created_idx
  ON credit_intents(tenant_id, status, created_at DESC);
CREATE INDEX credit_offers_tenant_intent_created_idx
  ON credit_offers(tenant_id, credit_intent_id, created_at DESC);
CREATE INDEX credit_offers_tenant_subject_status_idx
  ON credit_offers(tenant_id, subject_id, status, created_at DESC);
