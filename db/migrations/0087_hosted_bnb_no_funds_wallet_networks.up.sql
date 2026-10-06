-- BNB-004: append the offchain BNB identity expansion after the deployed 0084 history.
-- Keep applied 0074 local history immutable; hosted builds exclude that earlier migration.
-- No chain writes, funds, live observers, role grants or local enrollment functions.

ALTER TABLE authentication_wallet_transactions
  DROP CONSTRAINT authentication_wallet_transactions_chain_id_check,
  ADD CONSTRAINT authentication_wallet_transactions_chain_id_check CHECK (chain_id IN (84532, 1952, 97, 56));

ALTER TABLE agent_account_challenges
  DROP CONSTRAINT agent_account_challenges_chain_id_check,
  ADD CONSTRAINT agent_account_challenges_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952', 'eip155:97', 'eip155:56'));

ALTER TABLE agent_account_proof_attempts
  DROP CONSTRAINT agent_account_proof_attempts_chain_id_check,
  ADD CONSTRAINT agent_account_proof_attempts_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952', 'eip155:97', 'eip155:56'));

ALTER TABLE execution_account_binding_challenges
  DROP CONSTRAINT execution_account_binding_challenges_chain_id_check,
  ADD CONSTRAINT execution_account_binding_challenges_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952', 'eip155:97', 'eip155:56'));

ALTER TABLE execution_account_binding_proof_attempts
  DROP CONSTRAINT execution_account_binding_proof_attempts_chain_id_check,
  ADD CONSTRAINT execution_account_binding_proof_attempts_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952', 'eip155:97', 'eip155:56'));

ALTER TABLE execution_target_policies
  DROP CONSTRAINT execution_target_policies_chain_id_check,
  ADD CONSTRAINT execution_target_policies_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952', 'eip155:97', 'eip155:56'));

ALTER TABLE wallet_prepared_executions
  DROP CONSTRAINT wallet_prepared_executions_chain_id_check,
  ADD CONSTRAINT wallet_prepared_executions_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952', 'eip155:97', 'eip155:56'));

ALTER TABLE wallet_simulation_reports
  DROP CONSTRAINT wallet_simulation_reports_chain_id_check,
  ADD CONSTRAINT wallet_simulation_reports_chain_id_check CHECK (chain_id IN ('eip155:84532', 'eip155:1952', 'eip155:97', 'eip155:56'));
