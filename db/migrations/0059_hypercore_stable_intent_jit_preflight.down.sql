DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM hypercore_stable_execution_transitions)
     OR EXISTS (SELECT 1 FROM hypercore_jit_venue_preflight_receipts)
     OR EXISTS (SELECT 1 FROM hypercore_stable_founder_approvals)
     OR EXISTS (SELECT 1 FROM hypercore_stable_execution_intents) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'cannot remove stable HyperCore intent or JIT Evidence';
  END IF;
END;
$$;

DROP TABLE IF EXISTS hypercore_stable_execution_transitions;
ALTER TABLE hypercore_stable_execution_intents
  DROP CONSTRAINT IF EXISTS hypercore_stable_execution_intents_preflight_fk;
DROP TABLE IF EXISTS hypercore_jit_venue_preflight_receipts;
ALTER TABLE hypercore_stable_execution_intents
  DROP CONSTRAINT IF EXISTS hypercore_stable_execution_intents_approval_fk;
DROP TABLE IF EXISTS hypercore_stable_founder_approvals;
DROP TABLE IF EXISTS hypercore_stable_execution_intents;
DROP FUNCTION IF EXISTS guard_immutable_hypercore_jit_evidence();
DROP FUNCTION IF EXISTS guard_hypercore_stable_founder_approval();
DROP FUNCTION IF EXISTS guard_hypercore_stable_execution_intent();
