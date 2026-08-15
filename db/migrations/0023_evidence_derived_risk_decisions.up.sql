DROP TRIGGER IF EXISTS risk_decisions_projection_guard ON risk_decisions;

ALTER TABLE risk_decisions
  DROP CONSTRAINT risk_decisions_schema_version_check,
  DROP CONSTRAINT risk_decisions_v2_application_shape_check,
  ADD COLUMN policy_hash TEXT,
  ADD COLUMN risk_feature_snapshot_id TEXT,
  ADD COLUMN feature_snapshot_hash TEXT,
  ADD COLUMN risk_feature_snapshot JSONB,
  ADD COLUMN decision_passport_id TEXT,
  ADD COLUMN decision_passport_hash TEXT,
  ADD COLUMN decision_passport JSONB,
  ADD CONSTRAINT risk_decisions_schema_version_check
    CHECK (schema_version IN ('risk_decision.v1', 'risk_decision.v2', 'risk_decision.v3')),
  ADD CONSTRAINT risk_decisions_application_shape_check CHECK (
    schema_version NOT IN ('risk_decision.v2', 'risk_decision.v3')
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
  ADD CONSTRAINT risk_decisions_v3_evidence_shape_check CHECK (
    schema_version <> 'risk_decision.v3'
    OR (
      policy_hash ~ '^0x[0-9a-f]{64}$'
      AND risk_feature_snapshot_id ~ '^risk_feature_snapshot_[0-9a-f]{64}$'
      AND feature_snapshot_hash ~ '^0x[0-9a-f]{64}$'
      AND decision_passport_id ~ '^risk_decision_passport_[0-9a-f]{64}$'
      AND decision_passport_hash ~ '^0x[0-9a-f]{64}$'
      AND jsonb_typeof(risk_feature_snapshot) = 'object'
      AND risk_feature_snapshot->>'schemaVersion' = 'risk_feature_snapshot.v1'
      AND risk_feature_snapshot->>'riskFeatureSnapshotId' = risk_feature_snapshot_id
      AND risk_feature_snapshot->>'featureSnapshotHash' = feature_snapshot_hash
      AND risk_feature_snapshot->>'featureSetVersion' = 'credit-application-evidence-features.v1'
      AND risk_feature_snapshot->>'policyVersion' = model_version
      AND risk_feature_snapshot->>'policyHash' = policy_hash
      AND risk_feature_snapshot->>'sandboxOnly' = 'true'
      AND risk_feature_snapshot->>'productionAuthority' = 'false'
      AND jsonb_typeof(risk_feature_snapshot->'features') = 'object'
      AND jsonb_typeof(risk_feature_snapshot->'sourceEvidence') = 'array'
      AND jsonb_array_length(risk_feature_snapshot->'sourceEvidence') BETWEEN 1 AND 5
      AND jsonb_typeof(risk_feature_snapshot->'riskStateAttestation') = 'object'
      AND risk_feature_snapshot->'riskStateAttestation'->>'queryVersion' =
          'credit-application-risk-state.v1'
      AND jsonb_typeof(decision_passport) = 'object'
      AND decision_passport->>'schemaVersion' = 'risk_decision_passport.v1'
      AND decision_passport->>'riskDecisionPassportId' = decision_passport_id
      AND decision_passport->>'decisionPassportHash' = decision_passport_hash
      AND decision_passport->>'riskDecisionId' = id
      AND decision_passport->>'decisionHash' = decision_hash
      AND decision_passport->>'riskFeatureSnapshotId' = risk_feature_snapshot_id
      AND decision_passport->>'featureSnapshotHash' = feature_snapshot_hash
      AND decision_passport->>'featureSetVersion' =
          'credit-application-evidence-features.v1'
      AND decision_passport->>'policyVersion' = model_version
      AND decision_passport->>'policyHash' = policy_hash
      AND decision_passport->>'nonAuthorizing' = 'true'
      AND decision_passport->>'sandboxOnly' = 'true'
      AND decision_passport->>'productionAuthority' = 'false'
      AND jsonb_typeof(decision_passport->'reasonLineage') = 'array'
      AND jsonb_array_length(decision_passport->'reasonLineage') BETWEEN 1 AND 8
    )
  );

CREATE UNIQUE INDEX risk_decisions_tenant_feature_snapshot_hash_key
  ON risk_decisions(tenant_id, feature_snapshot_hash)
  WHERE feature_snapshot_hash IS NOT NULL;

CREATE UNIQUE INDEX risk_decisions_tenant_decision_passport_hash_key
  ON risk_decisions(tenant_id, decision_passport_hash)
  WHERE decision_passport_hash IS NOT NULL;

CREATE TRIGGER risk_decisions_projection_guard
BEFORE UPDATE OR DELETE ON risk_decisions
FOR EACH ROW EXECUTE FUNCTION guard_risk_decision_projection();
