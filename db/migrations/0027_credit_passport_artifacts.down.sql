DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM credit_passport_artifacts) THEN
    RAISE EXCEPTION 'cannot roll back Credit Passport artifacts while records exist';
  END IF;
END;
$$;

DELETE FROM abuse_capacity_buckets
 WHERE kind = 'credit_passport_artifacts';

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates', 'credit_intents', 'credit_decisions',
    'open_obligations', 'providers', 'credentials', 'access_grants',
    'pilot_feedback_records'
  ));

DROP INDEX IF EXISTS credit_passport_artifacts_tenant_verifier_idx;
DROP INDEX IF EXISTS credit_passport_artifacts_tenant_subject_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_credit_passport_artifacts ON credit_passport_artifacts;
DROP POLICY IF EXISTS tenant_isolation_credit_passport_artifacts ON credit_passport_artifacts;
ALTER TABLE credit_passport_artifacts DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS credit_passport_artifacts_projection_guard ON credit_passport_artifacts;
DROP TABLE IF EXISTS credit_passport_artifacts;
DROP FUNCTION IF EXISTS guard_credit_passport_artifact_projection();

ALTER TABLE risk_decisions
  DROP CONSTRAINT risk_decisions_tenant_id_id_decision_hash_key;

ALTER TABLE authorization_resource_bindings
  DROP CONSTRAINT authorization_resource_bindings_relationship_check,
  ADD CONSTRAINT authorization_resource_bindings_relationship_check
    CHECK (relationship IN ('owner', 'controller', 'subject'));

CREATE OR REPLACE FUNCTION protect_authorization_resource_transition()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('authorization_resource:' || OLD.resource_type),
    hashtext(OLD.resource_id)
  );
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'authorization resource deletion is prohibited; close it instead';
  END IF;
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.resource_type IS DISTINCT FROM NEW.resource_type
     OR OLD.resource_id IS DISTINCT FROM NEW.resource_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'authorization resource immutable fields cannot change';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'authorization resource version must increment exactly once';
  END IF;
  IF OLD.status = 'closed' OR
     (OLD.status = 'frozen' AND NEW.status NOT IN ('active', 'closed')) OR
     (OLD.status = 'active' AND NEW.status NOT IN ('frozen', 'closed')) THEN
    RAISE EXCEPTION 'authorization resource transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
