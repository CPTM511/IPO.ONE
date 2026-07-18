ALTER TABLE risk_decisions
  ALTER COLUMN mandate_id DROP NOT NULL,
  DROP CONSTRAINT risk_decisions_schema_version_check;

ALTER TABLE risk_decisions
  ADD COLUMN decision_hash TEXT,
  ADD COLUMN credit_intent_id TEXT,
  ADD COLUMN principal_id TEXT,
  ADD COLUMN authority_type TEXT,
  ADD COLUMN authority_ref TEXT,
  ADD COLUMN consent_id TEXT,
  ADD COLUMN sandbox_only BOOLEAN,
  ADD COLUMN production_authority BOOLEAN;

UPDATE risk_decisions decision
   SET principal_id = mandate.principal_id,
       authority_type = 'mandate',
       authority_ref = decision.mandate_id,
       sandbox_only = TRUE,
       production_authority = FALSE
  FROM mandates mandate
 WHERE decision.tenant_id = mandate.tenant_id
   AND decision.mandate_id = mandate.id
   AND decision.schema_version = 'risk_decision.v1';

ALTER TABLE risk_decisions
  ALTER COLUMN principal_id SET NOT NULL,
  ALTER COLUMN authority_type SET NOT NULL,
  ALTER COLUMN authority_ref SET NOT NULL,
  ALTER COLUMN sandbox_only SET NOT NULL,
  ALTER COLUMN production_authority SET NOT NULL,
  ADD CONSTRAINT risk_decisions_schema_version_check
    CHECK (schema_version IN ('risk_decision.v1', 'risk_decision.v2')),
  ADD CONSTRAINT risk_decisions_authority_type_check
    CHECK (authority_type IN ('consent', 'mandate')),
  ADD CONSTRAINT risk_decisions_exact_authority_check
    CHECK (
      num_nonnulls(consent_id, mandate_id) = 1
      AND (authority_type <> 'consent' OR (consent_id IS NOT NULL AND authority_ref = consent_id))
      AND (authority_type <> 'mandate' OR (mandate_id IS NOT NULL AND authority_ref = mandate_id))
    ),
  ADD CONSTRAINT risk_decisions_sandbox_only_check CHECK (sandbox_only = TRUE),
  ADD CONSTRAINT risk_decisions_production_authority_check CHECK (production_authority = FALSE),
  ADD CONSTRAINT risk_decisions_v2_application_shape_check CHECK (
    schema_version <> 'risk_decision.v2'
    OR (
      decision_hash ~ '^0x[0-9a-f]{64}$'
      AND credit_intent_id IS NOT NULL
      AND model_version = 'credit-application-rules.v1'
      AND action = 'credit_application_evaluation'
      AND status IN ('approved', 'rejected', 'frozen')
      AND jsonb_typeof(reasons) = 'array'
      AND jsonb_array_length(reasons) BETWEEN 1 AND 8
    )
  ),
  ADD CONSTRAINT risk_decisions_tenant_id_decision_hash_key UNIQUE (tenant_id, decision_hash),
  ADD CONSTRAINT risk_decisions_tenant_application_subject_asset_fk
    FOREIGN KEY (tenant_id, credit_intent_id, subject_id, asset_id)
    REFERENCES credit_intents(tenant_id, id, subject_id, asset_id),
  ADD CONSTRAINT risk_decisions_tenant_consent_fk
    FOREIGN KEY (tenant_id, consent_id)
    REFERENCES consent_records(tenant_id, id),
  ADD CONSTRAINT risk_decisions_tenant_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES principals(tenant_id, id);

CREATE UNIQUE INDEX risk_decisions_tenant_credit_intent_key
  ON risk_decisions(tenant_id, credit_intent_id)
  WHERE credit_intent_id IS NOT NULL;

CREATE FUNCTION guard_risk_decision_projection()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'risk decision projections are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER risk_decisions_projection_guard
BEFORE UPDATE OR DELETE ON risk_decisions
FOR EACH ROW EXECUTE FUNCTION guard_risk_decision_projection();

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates', 'credit_intents', 'credit_decisions',
    'open_obligations', 'providers', 'credentials', 'access_grants'
  ));
