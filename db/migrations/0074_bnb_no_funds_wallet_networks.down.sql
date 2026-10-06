-- BNB-001: offchain authentication, proofs and synthetic local execution only.
-- No live observation, pool, anchor, transaction or funds constraint changes.
-- Narrowing refuses rollback while BNB rows exist; never delete identity/Evidence.
-- The migration runner wraps this file in one transaction.

ALTER TABLE authentication_wallet_transactions
  DROP CONSTRAINT authentication_wallet_transactions_chain_id_check,
  ADD CONSTRAINT authentication_wallet_transactions_chain_id_check CHECK (chain_id IN (84532, 1952));

ALTER TABLE agent_account_challenges
  DROP CONSTRAINT agent_account_challenges_chain_id_check,
  ADD CONSTRAINT agent_account_challenges_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952'));

ALTER TABLE agent_account_proof_attempts
  DROP CONSTRAINT agent_account_proof_attempts_chain_id_check,
  ADD CONSTRAINT agent_account_proof_attempts_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952'));

ALTER TABLE execution_account_binding_challenges
  DROP CONSTRAINT execution_account_binding_challenges_chain_id_check,
  ADD CONSTRAINT execution_account_binding_challenges_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952'));

ALTER TABLE execution_account_binding_proof_attempts
  DROP CONSTRAINT execution_account_binding_proof_attempts_chain_id_check,
  ADD CONSTRAINT execution_account_binding_proof_attempts_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952'));

ALTER TABLE execution_target_policies
  DROP CONSTRAINT execution_target_policies_chain_id_check,
  ADD CONSTRAINT execution_target_policies_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952'));

ALTER TABLE wallet_prepared_executions
  DROP CONSTRAINT wallet_prepared_executions_chain_id_check,
  ADD CONSTRAINT wallet_prepared_executions_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952'));

ALTER TABLE wallet_simulation_reports
  DROP CONSTRAINT wallet_simulation_reports_chain_id_check,
  ADD CONSTRAINT wallet_simulation_reports_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952'));
