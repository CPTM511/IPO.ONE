DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM live_chain_observations) THEN
    RAISE EXCEPTION 'cannot roll back live chain observation storage while evidence exists';
  END IF;
END $$;

DROP INDEX IF EXISTS live_chain_outbox_tenant_pending_idx;
DROP INDEX IF EXISTS live_chain_observations_tenant_chain_recorded_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_live_chain_outbox_messages ON live_chain_outbox_messages;
DROP TRIGGER IF EXISTS tenant_context_guard_live_chain_indexer_snapshots ON live_chain_indexer_snapshots;
DROP TRIGGER IF EXISTS tenant_context_guard_live_chain_observations ON live_chain_observations;
DROP TRIGGER IF EXISTS live_chain_outbox_messages_delete_guard ON live_chain_outbox_messages;
DROP TRIGGER IF EXISTS live_chain_outbox_messages_transition_guard ON live_chain_outbox_messages;
DROP TRIGGER IF EXISTS live_chain_indexer_snapshots_immutable ON live_chain_indexer_snapshots;
DROP TRIGGER IF EXISTS live_chain_observations_immutable ON live_chain_observations;
DROP FUNCTION IF EXISTS protect_live_chain_outbox_transition();
DROP TABLE IF EXISTS live_chain_outbox_messages;
DROP TABLE IF EXISTS live_chain_indexer_snapshots;
DROP TABLE IF EXISTS live_chain_observations;
