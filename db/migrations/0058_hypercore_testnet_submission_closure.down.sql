DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM hypercore_testnet_submission_transitions)
     OR EXISTS (SELECT 1 FROM hypercore_testnet_founder_approvals)
     OR EXISTS (SELECT 1 FROM hypercore_testnet_submission_attempts)
     OR EXISTS (SELECT 1 FROM hypercore_testnet_nonce_heads)
     OR EXISTS (SELECT 1 FROM hypercore_testnet_signer_handoffs) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'cannot remove durable HyperCore Testnet submission truth';
  END IF;
END;
$$;

DROP TABLE IF EXISTS hypercore_testnet_submission_transitions;
ALTER TABLE hypercore_testnet_submission_attempts
  DROP CONSTRAINT IF EXISTS hypercore_testnet_submission_attempts_approval_fk;
DROP TABLE IF EXISTS hypercore_testnet_founder_approvals;
DROP TABLE IF EXISTS hypercore_testnet_submission_attempts;
DROP TABLE IF EXISTS hypercore_testnet_nonce_heads;
DROP TABLE IF EXISTS hypercore_testnet_signer_handoffs;

DROP FUNCTION IF EXISTS guard_immutable_hypercore_testnet_submission_transition();
DROP FUNCTION IF EXISTS guard_hypercore_testnet_submission_attempt();
DROP FUNCTION IF EXISTS guard_hypercore_testnet_founder_approval();
DROP FUNCTION IF EXISTS guard_hypercore_testnet_nonce_head();
DROP FUNCTION IF EXISTS assert_hypercore_testnet_retired_handoff_tombstone();
DROP FUNCTION IF EXISTS guard_hypercore_testnet_signer_handoff();
