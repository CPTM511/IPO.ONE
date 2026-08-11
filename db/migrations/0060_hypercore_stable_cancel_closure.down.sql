DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM hypercore_stable_execution_intents
    WHERE schema_version = 'hypercore_stable_cancel_intent.v1'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'cannot remove stable HyperCore cancel closure Evidence';
  END IF;
END;
$$;

DROP INDEX IF EXISTS hypercore_stable_cancel_intents_parent_attempted_key;

ALTER TABLE hypercore_stable_execution_intents
  DROP CONSTRAINT IF EXISTS hypercore_stable_execution_intents_parent_fk,
  DROP CONSTRAINT IF EXISTS hypercore_stable_execution_intents_action_kind_check,
  DROP CONSTRAINT IF EXISTS hypercore_stable_execution_intents_schema_version_check;
ALTER TABLE hypercore_stable_execution_intents
  DROP COLUMN IF EXISTS target_venue_order_id,
  DROP COLUMN IF EXISTS target_client_order_id,
  DROP COLUMN IF EXISTS target_order_hash,
  DROP COLUMN IF EXISTS parent_intent_hash,
  DROP COLUMN IF EXISTS parent_intent_id,
  DROP COLUMN IF EXISTS action_kind;
ALTER TABLE hypercore_stable_execution_intents
  ADD CONSTRAINT hypercore_stable_execution_intents_schema_version_check CHECK (
    schema_version = 'hypercore_stable_execution_intent.v2'
  );

ALTER TABLE hypercore_jit_venue_preflight_receipts
  DROP CONSTRAINT IF EXISTS hypercore_jit_venue_preflight_receipts_schema_version_check;
ALTER TABLE hypercore_jit_venue_preflight_receipts
  ADD CONSTRAINT hypercore_jit_venue_preflight_receipts_schema_version_check CHECK (
    schema_version = 'hypercore_jit_venue_preflight_receipt.v2'
  );

CREATE OR REPLACE FUNCTION guard_hypercore_stable_execution_intent()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stable HyperCore intents cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.intent_hash, NEW.economic_action_hash,
    NEW.idempotency_key_hash, NEW.handoff_id, NEW.signer_reference_hash,
    NEW.nonce, NEW.prepared_at, NEW.approval_expires_at, NEW.schema_version,
    NEW.intent->'hyperliquidAction', NEW.intent->>'payloadHash',
    NEW.intent->>'accountBindingHash', NEW.intent->>'delegateHash',
    NEW.intent->>'policyConstraintHash'
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.intent_hash, OLD.economic_action_hash,
    OLD.idempotency_key_hash, OLD.handoff_id, OLD.signer_reference_hash,
    OLD.nonce, OLD.prepared_at, OLD.approval_expires_at, OLD.schema_version,
    OLD.intent->'hyperliquidAction', OLD.intent->>'payloadHash',
    OLD.intent->>'accountBindingHash', OLD.intent->>'delegateHash',
    OLD.intent->>'policyConstraintHash'
  ) OR NEW.version <> OLD.version + 1 OR NOT (
    (OLD.state = 'PREPARED' AND NEW.state = 'APPROVED') OR
    (OLD.state = 'APPROVED' AND NEW.state = 'SIGNING') OR
    (OLD.state = 'SIGNING' AND NEW.state IN ('SUBMITTING', 'ABORTED')) OR
    (OLD.state = 'SUBMITTING' AND NEW.state IN ('SUBMITTED', 'REJECTED', 'UNKNOWN')) OR
    (OLD.state IN ('SUBMITTED', 'REJECTED', 'UNKNOWN') AND NEW.state = 'RECONCILED') OR
    (OLD.state = 'RECONCILED' AND NEW.state = 'CLOSED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stable HyperCore intent transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
