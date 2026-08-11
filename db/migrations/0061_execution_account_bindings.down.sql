ALTER TABLE account_bindings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE execution_account_binding_challenges NO FORCE ROW LEVEL SECURITY;
ALTER TABLE execution_account_binding_proof_attempts NO FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM account_bindings WHERE schema_version = 'account_binding.v3')
     OR EXISTS (SELECT 1 FROM execution_account_binding_challenges)
     OR EXISTS (SELECT 1 FROM execution_account_binding_proof_attempts) THEN
    RAISE EXCEPTION 'cannot roll back execution AccountBinding migration while durable v3 Evidence exists';
  END IF;
END;
$$;

ALTER TABLE account_bindings FORCE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS account_bindings_execution_subject_idx;
DROP INDEX IF EXISTS execution_account_binding_proof_attempts_subject_idx;
DROP INDEX IF EXISTS execution_account_binding_challenges_subject_idx;
DROP TRIGGER IF EXISTS verified_execution_account_binding_guard ON account_bindings;
DROP TRIGGER IF EXISTS execution_account_binding_proof_attempts_guard ON execution_account_binding_proof_attempts;
DROP TRIGGER IF EXISTS execution_account_binding_challenges_guard ON execution_account_binding_challenges;
DROP FUNCTION IF EXISTS guard_verified_execution_account_binding();
DROP FUNCTION IF EXISTS guard_execution_account_binding_proof_attempt();
DROP FUNCTION IF EXISTS guard_execution_account_binding_challenge();

ALTER TABLE account_bindings
  DROP CONSTRAINT IF EXISTS account_bindings_v3_shape_check,
  DROP CONSTRAINT IF EXISTS account_bindings_execution_challenge_key,
  DROP CONSTRAINT IF EXISTS account_bindings_execution_challenge_fk,
  DROP COLUMN IF EXISTS binding_kind,
  DROP COLUMN IF EXISTS controller_actor_hash,
  DROP COLUMN IF EXISTS execution_challenge_id;

DROP TABLE IF EXISTS execution_account_binding_proof_attempts;
DROP TABLE IF EXISTS execution_account_binding_challenges;
