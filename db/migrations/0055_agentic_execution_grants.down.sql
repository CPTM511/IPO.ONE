DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM delegated_wallet_pending_exposures WHERE status = 'reserved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55006', MESSAGE = 'cannot remove agentic execution grants with reserved pending exposure';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tenant_context_guard_delegated_wallet_pending_exposures ON delegated_wallet_pending_exposures;
DROP TRIGGER IF EXISTS tenant_context_guard_delegated_wallet_grant_transitions ON delegated_wallet_grant_transitions;
DROP TRIGGER IF EXISTS tenant_context_guard_delegated_wallet_grant_target_policies ON delegated_wallet_grant_target_policies;
DROP TRIGGER IF EXISTS tenant_context_guard_delegated_wallet_grants ON delegated_wallet_grants;
DROP TRIGGER IF EXISTS tenant_context_guard_execution_target_policies ON execution_target_policies;
DROP TRIGGER IF EXISTS delegated_wallet_pending_exposures_transition_guard ON delegated_wallet_pending_exposures;
DROP TRIGGER IF EXISTS delegated_wallet_grants_transition_guard ON delegated_wallet_grants;
DROP TRIGGER IF EXISTS delegated_wallet_grant_transitions_immutable_guard ON delegated_wallet_grant_transitions;
DROP TRIGGER IF EXISTS delegated_wallet_grant_targets_immutable_guard ON delegated_wallet_grant_target_policies;
DROP TRIGGER IF EXISTS execution_target_policies_immutable_guard ON execution_target_policies;

DROP TABLE IF EXISTS delegated_wallet_pending_exposures;
DROP TABLE IF EXISTS delegated_wallet_grant_transitions;
DROP TABLE IF EXISTS delegated_wallet_grant_target_policies;
DROP TABLE IF EXISTS delegated_wallet_grants;
DROP TABLE IF EXISTS execution_target_policies;

DROP FUNCTION IF EXISTS guard_delegated_wallet_pending_exposure();
DROP FUNCTION IF EXISTS guard_delegated_wallet_grant();
DROP FUNCTION IF EXISTS guard_immutable_agentic_execution_record();
