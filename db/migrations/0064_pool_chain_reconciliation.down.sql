DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pool_chain_observations)
    OR EXISTS (SELECT 1 FROM pool_chain_cursors)
    OR EXISTS (SELECT 1 FROM pool_chain_finalized_effects)
    OR EXISTS (SELECT 1 FROM pool_chain_outbox_messages)
    OR EXISTS (SELECT 1 FROM pool_reconciliation_runs)
    OR EXISTS (SELECT 1 FROM pool_reconciliation_discrepancies)
    OR EXISTS (SELECT 1 FROM pool_reconciliation_evidence)
    OR EXISTS (SELECT 1 FROM pool_risk_controls)
    OR EXISTS (SELECT 1 FROM pool_risk_control_transitions) THEN
    RAISE EXCEPTION 'cannot roll back Pool V1 chain reconciliation while Evidence exists';
  END IF;
END $$;

DROP INDEX IF EXISTS pool_reconciliation_runs_latest_idx;
DROP INDEX IF EXISTS pool_chain_cursors_block_idx;
DROP INDEX IF EXISTS pool_chain_observations_replay_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_pool_risk_control_transitions ON pool_risk_control_transitions;
DROP TRIGGER IF EXISTS tenant_context_guard_pool_risk_controls ON pool_risk_controls;
DROP TRIGGER IF EXISTS tenant_context_guard_pool_reconciliation_evidence ON pool_reconciliation_evidence;
DROP TRIGGER IF EXISTS tenant_context_guard_pool_reconciliation_discrepancies ON pool_reconciliation_discrepancies;
DROP TRIGGER IF EXISTS tenant_context_guard_pool_reconciliation_runs ON pool_reconciliation_runs;
DROP TRIGGER IF EXISTS tenant_context_guard_pool_chain_outbox_messages ON pool_chain_outbox_messages;
DROP TRIGGER IF EXISTS tenant_context_guard_pool_chain_finalized_effects ON pool_chain_finalized_effects;
DROP TRIGGER IF EXISTS tenant_context_guard_pool_chain_cursors ON pool_chain_cursors;
DROP TRIGGER IF EXISTS tenant_context_guard_pool_chain_observations ON pool_chain_observations;
DROP TRIGGER IF EXISTS pool_risk_control_transitions_immutable ON pool_risk_control_transitions;
DROP TRIGGER IF EXISTS pool_risk_controls_immutable ON pool_risk_controls;
DROP TRIGGER IF EXISTS pool_reconciliation_evidence_immutable ON pool_reconciliation_evidence;
DROP TRIGGER IF EXISTS pool_reconciliation_discrepancies_immutable ON pool_reconciliation_discrepancies;
DROP TRIGGER IF EXISTS pool_reconciliation_runs_immutable ON pool_reconciliation_runs;
DROP TRIGGER IF EXISTS pool_chain_outbox_messages_immutable ON pool_chain_outbox_messages;
DROP TRIGGER IF EXISTS pool_chain_finalized_effects_immutable ON pool_chain_finalized_effects;
DROP TRIGGER IF EXISTS pool_chain_cursors_immutable ON pool_chain_cursors;
DROP TRIGGER IF EXISTS pool_chain_observations_immutable ON pool_chain_observations;
DROP TABLE IF EXISTS pool_risk_control_transitions;
DROP TABLE IF EXISTS pool_risk_controls;
DROP TABLE IF EXISTS pool_reconciliation_evidence;
DROP TABLE IF EXISTS pool_reconciliation_discrepancies;
DROP TABLE IF EXISTS pool_reconciliation_runs;
DROP TABLE IF EXISTS pool_chain_outbox_messages;
DROP TABLE IF EXISTS pool_chain_finalized_effects;
DROP TABLE IF EXISTS pool_chain_cursors;
DROP TABLE IF EXISTS pool_chain_observations;
