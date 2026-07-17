DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM risk_decisions WHERE schema_version = 'risk_decision.v3') THEN
    RAISE EXCEPTION 'cannot roll back evidence-derived risk decisions while v3 rows exist';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS risk_decisions_projection_guard ON risk_decisions;
DROP INDEX IF EXISTS risk_decisions_tenant_decision_passport_hash_key;
DROP INDEX IF EXISTS risk_decisions_tenant_feature_snapshot_hash_key;

ALTER TABLE risk_decisions
  DROP CONSTRAINT risk_decisions_v3_evidence_shape_check,
  DROP CONSTRAINT risk_decisions_application_shape_check,
  DROP CONSTRAINT risk_decisions_schema_version_check,
  DROP COLUMN decision_passport,
  DROP COLUMN decision_passport_hash,
  DROP COLUMN decision_passport_id,
  DROP COLUMN risk_feature_snapshot,
  DROP COLUMN feature_snapshot_hash,
  DROP COLUMN risk_feature_snapshot_id,
  DROP COLUMN policy_hash,
  ADD CONSTRAINT risk_decisions_schema_version_check
    CHECK (schema_version IN ('risk_decision.v1', 'risk_decision.v2')),
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
  );

CREATE TRIGGER risk_decisions_projection_guard
BEFORE UPDATE OR DELETE ON risk_decisions
FOR EACH ROW EXECUTE FUNCTION guard_risk_decision_projection();
