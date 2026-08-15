ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates', 'credit_intents',
    'open_obligations', 'providers', 'credentials', 'access_grants'
  ));

DROP TRIGGER IF EXISTS risk_decisions_projection_guard ON risk_decisions;
DROP FUNCTION IF EXISTS guard_risk_decision_projection();
DROP INDEX IF EXISTS risk_decisions_tenant_credit_intent_key;

ALTER TABLE risk_decisions
  DROP CONSTRAINT IF EXISTS risk_decisions_tenant_principal_fk,
  DROP CONSTRAINT IF EXISTS risk_decisions_tenant_consent_fk,
  DROP CONSTRAINT IF EXISTS risk_decisions_tenant_application_subject_asset_fk,
  DROP CONSTRAINT IF EXISTS risk_decisions_tenant_id_decision_hash_key,
  DROP CONSTRAINT IF EXISTS risk_decisions_v2_application_shape_check,
  DROP CONSTRAINT IF EXISTS risk_decisions_production_authority_check,
  DROP CONSTRAINT IF EXISTS risk_decisions_sandbox_only_check,
  DROP CONSTRAINT IF EXISTS risk_decisions_exact_authority_check,
  DROP CONSTRAINT IF EXISTS risk_decisions_authority_type_check,
  DROP CONSTRAINT IF EXISTS risk_decisions_schema_version_check;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM risk_decisions WHERE schema_version = 'risk_decision.v2') THEN
    RAISE EXCEPTION 'cannot roll back shared credit decisions while v2 rows exist';
  END IF;
END;
$$;

ALTER TABLE risk_decisions
  DROP COLUMN production_authority,
  DROP COLUMN sandbox_only,
  DROP COLUMN consent_id,
  DROP COLUMN authority_ref,
  DROP COLUMN authority_type,
  DROP COLUMN principal_id,
  DROP COLUMN credit_intent_id,
  DROP COLUMN decision_hash,
  ALTER COLUMN mandate_id SET NOT NULL,
  ADD CONSTRAINT risk_decisions_schema_version_check
    CHECK (schema_version = 'risk_decision.v1');
