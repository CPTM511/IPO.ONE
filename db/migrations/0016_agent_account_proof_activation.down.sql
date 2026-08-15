DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM abuse_admissions WHERE quota_class = 'credential') THEN
    RAISE EXCEPTION 'cannot roll back Agent account proof activation while credential admissions exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS agent_account_proof_attempts_tenant_subject_attempted_idx;
DROP INDEX IF EXISTS agent_account_challenges_tenant_subject_issued_idx;

DROP TRIGGER IF EXISTS tenant_context_guard_agent_account_proof_attempts ON agent_account_proof_attempts;
DROP POLICY IF EXISTS tenant_isolation_agent_account_proof_attempts ON agent_account_proof_attempts;
ALTER TABLE agent_account_proof_attempts DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS tenant_context_guard_agent_account_challenges ON agent_account_challenges;
DROP POLICY IF EXISTS tenant_isolation_agent_account_challenges ON agent_account_challenges;
ALTER TABLE agent_account_challenges DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS agent_subject_account_activation_guard ON subjects;
DROP TRIGGER IF EXISTS verified_agent_account_binding_guard ON account_bindings;
DROP TRIGGER IF EXISTS agent_account_proof_attempts_projection_guard ON agent_account_proof_attempts;
DROP TRIGGER IF EXISTS agent_account_challenges_projection_guard ON agent_account_challenges;
DROP FUNCTION IF EXISTS guard_agent_subject_account_activation();
DROP FUNCTION IF EXISTS guard_verified_agent_account_binding();
DROP FUNCTION IF EXISTS guard_agent_account_proof_attempt_projection();
DROP FUNCTION IF EXISTS guard_agent_account_challenge_projection();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM account_bindings WHERE schema_version = 'account_binding.v2') THEN
    RAISE EXCEPTION 'cannot roll back Agent account proof activation while v2 AccountBindings exist';
  END IF;
END;
$$;

ALTER TABLE account_bindings
  DROP CONSTRAINT IF EXISTS account_bindings_v2_shape_check,
  DROP CONSTRAINT IF EXISTS account_bindings_tenant_challenge_key,
  DROP CONSTRAINT IF EXISTS account_bindings_tenant_challenge_fk,
  DROP COLUMN protocol_version,
  DROP COLUMN proof_hash,
  DROP COLUMN challenge_id;

DROP TABLE IF EXISTS agent_account_proof_attempts;
DROP INDEX IF EXISTS agent_account_challenges_typed_data_hash_idx;
DROP INDEX IF EXISTS agent_account_challenges_one_pending_subject_idx;
DROP TABLE IF EXISTS agent_account_challenges;

ALTER TABLE abuse_admissions
  DROP CONSTRAINT abuse_admissions_quota_class_check,
  ADD CONSTRAINT abuse_admissions_quota_class_check CHECK (quota_class IN (
    'read', 'mutation', 'economic', 'privileged', 'batch', 'worker'
  ));
