-- M3 / REQ-EXEC-005: immutable no-funds metered usage and admission receipts.

CREATE TABLE metered_usage_evidence (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^0x[0-9a-f]{64}$'),
  provider_event_id TEXT NOT NULL,
  nonce_hash TEXT NOT NULL CHECK (nonce_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  mandate_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  authorization_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  resource_class TEXT NOT NULL,
  measurement_unit TEXT NOT NULL,
  quantity NUMERIC(78,0) NOT NULL CHECK (quantity > 0),
  price_schedule_hash TEXT NOT NULL CHECK (price_schedule_hash ~ '^0x[0-9a-f]{64}$'),
  unit_price_minor NUMERIC(78,0) NOT NULL CHECK (unit_price_minor > 0),
  charge_minor NUMERIC(78,0) NOT NULL CHECK (charge_minor = quantity * unit_price_minor),
  asset_id TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  window_ended_at TIMESTAMPTZ NOT NULL CHECK (window_ended_at > window_started_at),
  observed_at TIMESTAMPTZ NOT NULL CHECK (observed_at >= window_ended_at),
  provider_key_id TEXT NOT NULL,
  provider_payload_hash TEXT NOT NULL CHECK (provider_payload_hash ~ '^0x[0-9a-f]{64}$'),
  record JSONB NOT NULL CHECK (record->>'schemaVersion' = 'metered_usage_evidence.v1'),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT metered_usage_evidence_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT metered_usage_evidence_tenant_hash_key UNIQUE (tenant_id, evidence_hash),
  CONSTRAINT metered_usage_evidence_provider_event_key UNIQUE (tenant_id, provider_id, provider_event_id),
  CONSTRAINT metered_usage_evidence_nonce_key UNIQUE (tenant_id, provider_id, nonce_hash)
);

CREATE TABLE metered_usage_admissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  admission_hash TEXT NOT NULL CHECK (admission_hash ~ '^0x[0-9a-f]{64}$'),
  usage_evidence_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_hash TEXT NOT NULL CHECK (policy_hash ~ '^0x[0-9a-f]{64}$'),
  obligation_id TEXT NOT NULL,
  charge_minor NUMERIC(78,0) NOT NULL CHECK (charge_minor > 0),
  window_charge_before_minor NUMERIC(78,0) NOT NULL CHECK (window_charge_before_minor >= 0),
  window_charge_after_minor NUMERIC(78,0) NOT NULL CHECK (
    window_charge_after_minor = window_charge_before_minor + charge_minor
  ),
  record JSONB NOT NULL CHECK (record->>'schemaVersion' = 'metered_usage_admission.v1'),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  admitted_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT metered_usage_admissions_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT metered_usage_admissions_tenant_hash_key UNIQUE (tenant_id, admission_hash),
  CONSTRAINT metered_usage_admissions_evidence_key UNIQUE (tenant_id, usage_evidence_id),
  CONSTRAINT metered_usage_admissions_evidence_fk
    FOREIGN KEY (tenant_id, usage_evidence_id)
    REFERENCES metered_usage_evidence(tenant_id, id)
);

CREATE FUNCTION metered_usage_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Metered usage records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER metered_usage_evidence_immutable
BEFORE UPDATE OR DELETE ON metered_usage_evidence
FOR EACH ROW EXECUTE FUNCTION metered_usage_immutable_guard();

CREATE TRIGGER metered_usage_admissions_immutable
BEFORE UPDATE OR DELETE ON metered_usage_admissions
FOR EACH ROW EXECUTE FUNCTION metered_usage_immutable_guard();

ALTER TABLE metered_usage_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE metered_usage_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_metered_usage_evidence ON metered_usage_evidence
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_metered_usage_evidence
BEFORE INSERT OR UPDATE OR DELETE ON metered_usage_evidence
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE metered_usage_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE metered_usage_admissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_metered_usage_admissions ON metered_usage_admissions
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_metered_usage_admissions
BEFORE INSERT OR UPDATE OR DELETE ON metered_usage_admissions
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX metered_usage_evidence_obligation_idx
  ON metered_usage_evidence(tenant_id, obligation_id, observed_at DESC, id);
CREATE INDEX metered_usage_admissions_obligation_idx
  ON metered_usage_admissions(tenant_id, obligation_id, admitted_at DESC, id);
