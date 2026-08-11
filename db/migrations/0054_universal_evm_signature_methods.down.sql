DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM agent_account_proof_attempts
     WHERE verification_method <> 'eip712_eoa_v1'
  ) OR EXISTS (
    SELECT 1
      FROM account_bindings
     WHERE schema_version = 'account_binding.v2'
       AND verification_method <> 'eip712_eoa_v1'
  ) THEN
    RAISE EXCEPTION 'cannot roll back universal EVM signatures while non-EOA Agent proofs exist';
  END IF;
END;
$$;

ALTER TABLE account_bindings
  DROP CONSTRAINT account_bindings_v2_shape_check,
  ADD CONSTRAINT account_bindings_v2_shape_check CHECK (
    schema_version <> 'account_binding.v2'
    OR (
      challenge_id IS NOT NULL
      AND proof_hash ~ '^0x[0-9a-f]{64}$'
      AND signature_hash = proof_hash
      AND nonce ~ '^0x[0-9a-f]{64}$'
      AND protocol_version = '1.1'
      AND verification_method = 'eip712_eoa_v1'
      AND status = 'active'
    )
  );

ALTER TABLE agent_account_proof_attempts
  DROP CONSTRAINT agent_account_proof_attempts_verification_method_check,
  ADD CONSTRAINT agent_account_proof_attempts_verification_method_check
    CHECK (verification_method = 'eip712_eoa_v1');
