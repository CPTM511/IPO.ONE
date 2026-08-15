ALTER TABLE credit_lines
  ADD COLUMN projection_hash TEXT,
  ADD COLUMN exposure_hash TEXT,
  ADD COLUMN principal_id TEXT,
  ADD COLUMN authority_terms_hash TEXT,
  ADD COLUMN facility_id TEXT,
  ADD COLUMN facility_hash TEXT,
  ADD COLUMN credit_intent_id TEXT,
  ADD COLUMN credit_intent_hash TEXT,
  ADD COLUMN risk_decision_id TEXT,
  ADD COLUMN decision_hash TEXT,
  ADD COLUMN policy_hash TEXT,
  ADD COLUMN credit_offer_id TEXT,
  ADD COLUMN credit_offer_hash TEXT,
  ADD COLUMN terms_hash TEXT,
  ADD COLUMN acceptance_id TEXT,
  ADD COLUMN acceptance_hash TEXT,
  ADD COLUMN obligation_id TEXT,
  ADD COLUMN purpose_code TEXT,
  ADD COLUMN allowed_provider_ids JSONB,
  ADD COLUMN sandbox_only BOOLEAN,
  ADD COLUMN production_authority BOOLEAN,
  ADD CONSTRAINT credit_lines_v2_shape_check CHECK (
    schema_version <> 'credit_line.v2'
    OR (
      projection_hash ~ '^0x[0-9a-f]{64}$'
      AND exposure_hash ~ '^0x[0-9a-f]{64}$'
      AND principal_id IS NOT NULL
      AND authority_terms_hash ~ '^0x[0-9a-f]{64}$'
      AND facility_id IS NOT NULL
      AND facility_hash ~ '^0x[0-9a-f]{64}$'
      AND credit_intent_id IS NOT NULL
      AND credit_intent_hash ~ '^0x[0-9a-f]{64}$'
      AND risk_decision_id IS NOT NULL
      AND risk_snapshot_id = risk_decision_id
      AND decision_hash ~ '^0x[0-9a-f]{64}$'
      AND policy_hash ~ '^0x[0-9a-f]{64}$'
      AND credit_offer_id IS NOT NULL
      AND credit_offer_hash ~ '^0x[0-9a-f]{64}$'
      AND terms_hash ~ '^0x[0-9a-f]{64}$'
      AND acceptance_id IS NOT NULL
      AND acceptance_hash ~ '^0x[0-9a-f]{64}$'
      AND obligation_id IS NOT NULL
      AND purpose_code ~ '^[a-z][a-z0-9_.-]{1,95}$'
      AND jsonb_typeof(allowed_provider_ids) = 'array'
      AND jsonb_array_length(allowed_provider_ids) BETWEEN 1 AND 32
      AND sandbox_only = TRUE
      AND production_authority = FALSE
      AND status IN ('approved', 'frozen', 'closed')
    )
  ),
  ADD CONSTRAINT credit_lines_v2_tenant_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  ADD CONSTRAINT credit_lines_v2_tenant_intent_fk
    FOREIGN KEY (tenant_id, credit_intent_id) REFERENCES credit_intents(tenant_id, id),
  ADD CONSTRAINT credit_lines_v2_tenant_decision_fk
    FOREIGN KEY (tenant_id, risk_decision_id) REFERENCES risk_decisions(tenant_id, id),
  ADD CONSTRAINT credit_lines_v2_tenant_offer_fk
    FOREIGN KEY (tenant_id, credit_offer_id) REFERENCES credit_offers(tenant_id, id),
  ADD CONSTRAINT credit_lines_v2_tenant_acceptance_fk
    FOREIGN KEY (tenant_id, acceptance_id) REFERENCES credit_offer_acceptances(tenant_id, id),
  ADD CONSTRAINT credit_lines_v2_tenant_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id);

CREATE FUNCTION guard_canonical_credit_line_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.schema_version <> 'credit_line.v2' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'canonical CreditLine projections cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.subject_id, NEW.principal_id,
    NEW.asset_id, NEW.sandbox_only, NEW.production_authority,
    NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.subject_id, OLD.principal_id,
    OLD.asset_id, OLD.sandbox_only, OLD.production_authority,
    OLD.created_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'canonical CreditLine identity is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'approved' AND NEW.status IN ('frozen', 'closed')
    OR OLD.status = 'frozen' AND NEW.status IN ('approved', 'closed')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid canonical CreditLine status transition';
  END IF;
  IF OLD.status = 'closed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'closed canonical CreditLine projections are immutable';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'canonical CreditLine update time cannot move backwards';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_canonical_credit_line_projection
BEFORE UPDATE OR DELETE ON credit_lines
FOR EACH ROW EXECUTE FUNCTION guard_canonical_credit_line_projection();

CREATE INDEX canonical_credit_lines_tenant_subject_status_idx
  ON credit_lines(tenant_id, subject_id, asset_id, status, obligation_id)
  WHERE schema_version = 'credit_line.v2';
