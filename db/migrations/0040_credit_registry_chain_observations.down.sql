DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM credit_registry_chain_observations) THEN
    RAISE EXCEPTION
      'cannot roll back credit Registry observations while Evidence exists';
  END IF;
END;
$$;

DROP INDEX IF EXISTS credit_registry_chain_outbox_pending_idx;
DROP INDEX IF EXISTS credit_registry_chain_observations_lookup_idx;
DROP TRIGGER IF EXISTS
  tenant_context_guard_credit_registry_chain_outbox_messages
  ON credit_registry_chain_outbox_messages;
DROP TRIGGER IF EXISTS
  tenant_context_guard_credit_registry_chain_observations
  ON credit_registry_chain_observations;
DROP TRIGGER IF EXISTS credit_registry_chain_outbox_delete_guard
  ON credit_registry_chain_outbox_messages;
DROP TRIGGER IF EXISTS credit_registry_chain_outbox_transition_guard
  ON credit_registry_chain_outbox_messages;
DROP TRIGGER IF EXISTS credit_registry_chain_observations_immutable
  ON credit_registry_chain_observations;
DROP FUNCTION IF EXISTS protect_credit_registry_chain_outbox_transition();
DROP TABLE IF EXISTS credit_registry_chain_outbox_messages;
DROP TABLE IF EXISTS credit_registry_chain_observations;
