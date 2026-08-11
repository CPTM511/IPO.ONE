ALTER TABLE hypercore_stable_execution_intents
  DROP CONSTRAINT hypercore_stable_execution_intents_schema_version_check;
ALTER TABLE hypercore_stable_execution_intents
  ADD COLUMN action_kind TEXT NOT NULL DEFAULT 'order',
  ADD COLUMN parent_intent_id TEXT,
  ADD COLUMN parent_intent_hash TEXT,
  ADD COLUMN target_order_hash TEXT,
  ADD COLUMN target_client_order_id TEXT,
  ADD COLUMN target_venue_order_id BIGINT;

ALTER TABLE hypercore_stable_execution_intents
  ADD CONSTRAINT hypercore_stable_execution_intents_schema_version_check CHECK (
    schema_version IN (
      'hypercore_stable_execution_intent.v2',
      'hypercore_stable_cancel_intent.v1'
    )
  ),
  ADD CONSTRAINT hypercore_stable_execution_intents_action_kind_check CHECK (
    (schema_version = 'hypercore_stable_execution_intent.v2'
      AND action_kind = 'order'
      AND parent_intent_id IS NULL
      AND parent_intent_hash IS NULL
      AND target_order_hash IS NULL
      AND target_client_order_id IS NULL
      AND target_venue_order_id IS NULL
      AND intent->>'actionKind' = 'order')
    OR
    (schema_version = 'hypercore_stable_cancel_intent.v1'
      AND action_kind = 'cancelByCloid'
      AND parent_intent_id IS NOT NULL
      AND parent_intent_hash ~ '^0x[0-9a-f]{64}$'
      AND target_order_hash ~ '^0x[0-9a-f]{64}$'
      AND target_client_order_id ~ '^0x[0-9a-f]{32}$'
      AND target_venue_order_id > 0
      AND intent->>'actionKind' = 'cancelByCloid'
      AND intent->>'parentIntentId' = parent_intent_id
      AND intent->>'parentIntentHash' = parent_intent_hash
      AND intent->>'targetOrderHash' = target_order_hash
      AND intent->'targetOrder'->>'cloid' = target_client_order_id
      AND (intent->'targetOrder'->>'venueOrderId')::BIGINT = target_venue_order_id)
  ),
  ADD CONSTRAINT hypercore_stable_execution_intents_parent_fk
    FOREIGN KEY (tenant_id, parent_intent_id)
    REFERENCES hypercore_stable_execution_intents(tenant_id, id);

ALTER TABLE hypercore_jit_venue_preflight_receipts
  DROP CONSTRAINT hypercore_jit_venue_preflight_receipts_schema_version_check;
ALTER TABLE hypercore_jit_venue_preflight_receipts
  ADD CONSTRAINT hypercore_jit_venue_preflight_receipts_schema_version_check CHECK (
    schema_version IN (
      'hypercore_jit_venue_preflight_receipt.v2',
      'hypercore_cancel_jit_venue_preflight_receipt.v1'
    )
  );

CREATE UNIQUE INDEX hypercore_stable_cancel_intents_parent_attempted_key
  ON hypercore_stable_execution_intents(tenant_id, parent_intent_id)
  WHERE schema_version = 'hypercore_stable_cancel_intent.v1'
    AND external_submission_attempted = TRUE;

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
    NEW.action_kind, NEW.parent_intent_id, NEW.parent_intent_hash,
    NEW.target_order_hash, NEW.target_client_order_id, NEW.target_venue_order_id,
    NEW.intent->'hyperliquidAction', NEW.intent->>'payloadHash',
    NEW.intent->>'accountBindingHash', NEW.intent->>'delegateHash',
    NEW.intent->>'policyConstraintHash', NEW.intent->'targetOrder'
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.intent_hash, OLD.economic_action_hash,
    OLD.idempotency_key_hash, OLD.handoff_id, OLD.signer_reference_hash,
    OLD.nonce, OLD.prepared_at, OLD.approval_expires_at, OLD.schema_version,
    OLD.action_kind, OLD.parent_intent_id, OLD.parent_intent_hash,
    OLD.target_order_hash, OLD.target_client_order_id, OLD.target_venue_order_id,
    OLD.intent->'hyperliquidAction', OLD.intent->>'payloadHash',
    OLD.intent->>'accountBindingHash', OLD.intent->>'delegateHash',
    OLD.intent->>'policyConstraintHash', OLD.intent->'targetOrder'
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
