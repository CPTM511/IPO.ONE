CREATE TABLE hypercore_stable_execution_intents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  intent_hash TEXT NOT NULL CHECK (intent_hash ~ '^0x[0-9a-f]{64}$'),
  economic_action_hash TEXT NOT NULL CHECK (economic_action_hash ~ '^0x[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL CHECK (idempotency_key_hash ~ '^0x[0-9a-f]{64}$'),
  handoff_id TEXT NOT NULL,
  signer_reference_hash TEXT NOT NULL CHECK (signer_reference_hash ~ '^0x[0-9a-f]{64}$'),
  nonce BIGINT NOT NULL CHECK (nonce > 0),
  intent JSONB NOT NULL CHECK (
    jsonb_typeof(intent) = 'object'
    AND intent->>'intentId' = id
    AND intent->>'intentHash' = intent_hash
    AND intent->>'economicActionHash' = economic_action_hash
    AND intent->>'idempotencyKeyHash' = idempotency_key_hash
    AND intent->>'handoffId' = handoff_id
    AND intent->>'signerReferenceHash' = signer_reference_hash
    AND (intent->>'nonce')::BIGINT = nonce
    AND intent::TEXT !~* '"(privateKey|seedPhrase|credential|rawSignature|secret)"'
  ),
  state TEXT NOT NULL CHECK (state IN (
    'PREPARED', 'APPROVED', 'SIGNING', 'SUBMITTING', 'SUBMITTED', 'REJECTED',
    'UNKNOWN', 'RECONCILED', 'CLOSED', 'ABORTED'
  )),
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 7),
  founder_approval_id TEXT,
  founder_approval_hash TEXT CHECK (
    founder_approval_hash IS NULL OR founder_approval_hash ~ '^0x[0-9a-f]{64}$'
  ),
  preflight_receipt_id TEXT,
  preflight_receipt_hash TEXT CHECK (
    preflight_receipt_hash IS NULL OR preflight_receipt_hash ~ '^0x[0-9a-f]{64}$'
  ),
  action_authorization_hash TEXT CHECK (
    action_authorization_hash IS NULL OR action_authorization_hash ~ '^0x[0-9a-f]{64}$'
  ),
  request_body_hash TEXT CHECK (
    request_body_hash IS NULL OR request_body_hash ~ '^0x[0-9a-f]{64}$'
  ),
  signature_hash TEXT CHECK (
    signature_hash IS NULL OR signature_hash ~ '^0x[0-9a-f]{64}$'
  ),
  claim_hash TEXT CHECK (claim_hash IS NULL OR claim_hash ~ '^0x[0-9a-f]{64}$'),
  disposition TEXT CHECK (
    disposition IS NULL OR disposition IN ('confirmed', 'rejected', 'unknown')
  ),
  response_hash TEXT CHECK (
    response_hash IS NULL OR response_hash ~ '^0x[0-9a-f]{64}$'
  ),
  prepared_at TIMESTAMPTZ NOT NULL,
  approval_expires_at TIMESTAMPTZ NOT NULL CHECK (approval_expires_at > prepared_at),
  approved_at TIMESTAMPTZ,
  signing_started_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  external_submission_attempted BOOLEAN NOT NULL,
  retry_allowed BOOLEAN NOT NULL CHECK (retry_allowed = FALSE),
  raw_action_persisted BOOLEAN NOT NULL CHECK (raw_action_persisted = FALSE),
  raw_response_persisted BOOLEAN NOT NULL CHECK (raw_response_persisted = FALSE),
  raw_key_persisted BOOLEAN NOT NULL CHECK (raw_key_persisted = FALSE),
  raw_signature_persisted BOOLEAN NOT NULL CHECK (raw_signature_persisted = FALSE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  real_funds_authority BOOLEAN NOT NULL CHECK (real_funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_stable_execution_intent.v2'),
  CONSTRAINT hypercore_stable_execution_intents_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_stable_execution_intents_tenant_hash_key UNIQUE (tenant_id, intent_hash),
  CONSTRAINT hypercore_stable_execution_intents_tenant_economic_key UNIQUE (tenant_id, economic_action_hash),
  CONSTRAINT hypercore_stable_execution_intents_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key_hash),
  CONSTRAINT hypercore_stable_execution_intents_tenant_nonce_key UNIQUE (tenant_id, signer_reference_hash, nonce),
  CONSTRAINT hypercore_stable_execution_intents_handoff_fk
    FOREIGN KEY (tenant_id, handoff_id)
    REFERENCES hypercore_testnet_signer_handoffs(tenant_id, id),
  CONSTRAINT hypercore_stable_execution_intents_lifecycle_check CHECK (
    (state = 'PREPARED' AND version = 1 AND founder_approval_hash IS NULL
      AND preflight_receipt_hash IS NULL AND action_authorization_hash IS NULL
      AND external_submission_attempted = FALSE)
    OR (state = 'APPROVED' AND version = 2 AND founder_approval_hash IS NOT NULL
      AND preflight_receipt_hash IS NULL AND action_authorization_hash IS NULL
      AND external_submission_attempted = FALSE)
    OR (state = 'SIGNING' AND version = 3 AND founder_approval_hash IS NOT NULL
      AND preflight_receipt_hash IS NOT NULL AND action_authorization_hash IS NULL
      AND signing_started_at IS NOT NULL AND external_submission_attempted = FALSE)
    OR (state = 'SUBMITTING' AND version = 4 AND action_authorization_hash IS NOT NULL
      AND request_body_hash IS NOT NULL AND signature_hash IS NOT NULL
      AND claim_hash IS NOT NULL AND claimed_at IS NOT NULL
      AND external_submission_attempted = TRUE)
    OR (state IN ('SUBMITTED', 'REJECTED', 'UNKNOWN') AND version = 5
      AND action_authorization_hash IS NOT NULL AND response_hash IS NOT NULL
      AND resolved_at IS NOT NULL AND external_submission_attempted = TRUE)
    OR (state = 'RECONCILED' AND version = 6 AND reconciled_at IS NOT NULL
      AND external_submission_attempted = TRUE)
    OR (state = 'CLOSED' AND version = 7 AND reconciled_at IS NOT NULL
      AND closed_at IS NOT NULL AND external_submission_attempted = TRUE)
    OR (state = 'ABORTED' AND version BETWEEN 3 AND 7
      AND external_submission_attempted = FALSE)
  )
);

CREATE TABLE hypercore_stable_founder_approvals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  approval_hash TEXT NOT NULL CHECK (approval_hash ~ '^0x[0-9a-f]{64}$'),
  intent_id TEXT NOT NULL,
  intent_hash TEXT NOT NULL CHECK (intent_hash ~ '^0x[0-9a-f]{64}$'),
  confirmation_nonce_hash TEXT NOT NULL CHECK (confirmation_nonce_hash ~ '^0x[0-9a-f]{64}$'),
  approval JSONB NOT NULL CHECK (
    jsonb_typeof(approval) = 'object'
    AND approval->>'approvalId' = id
    AND approval->>'approvalHash' = approval_hash
    AND approval->>'intentId' = intent_id
    AND approval->>'intentHash' = intent_hash
    AND approval->>'confirmationNonceHash' = confirmation_nonce_hash
    AND approval::TEXT !~* '"(privateKey|seedPhrase|credential|rawSignature|secret)"'
  ),
  status TEXT NOT NULL CHECK (status IN ('APPROVED', 'CONSUMED')),
  approved_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > approved_at),
  consumed_at TIMESTAMPTZ,
  version BIGINT NOT NULL CHECK (version IN (1, 2)),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_stable_founder_approval.v2'),
  CONSTRAINT hypercore_stable_founder_approvals_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_stable_founder_approvals_tenant_hash_key UNIQUE (tenant_id, approval_hash),
  CONSTRAINT hypercore_stable_founder_approvals_tenant_intent_key UNIQUE (tenant_id, intent_id),
  CONSTRAINT hypercore_stable_founder_approvals_tenant_nonce_key UNIQUE (tenant_id, confirmation_nonce_hash),
  CONSTRAINT hypercore_stable_founder_approvals_intent_fk
    FOREIGN KEY (tenant_id, intent_id)
    REFERENCES hypercore_stable_execution_intents(tenant_id, id),
  CONSTRAINT hypercore_stable_founder_approvals_state_check CHECK (
    (status = 'APPROVED' AND version = 1 AND consumed_at IS NULL)
    OR (status = 'CONSUMED' AND version = 2 AND consumed_at IS NOT NULL)
  )
);

ALTER TABLE hypercore_stable_execution_intents
  ADD CONSTRAINT hypercore_stable_execution_intents_approval_fk
  FOREIGN KEY (tenant_id, founder_approval_id)
  REFERENCES hypercore_stable_founder_approvals(tenant_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE hypercore_jit_venue_preflight_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  receipt_hash TEXT NOT NULL CHECK (receipt_hash ~ '^0x[0-9a-f]{64}$'),
  intent_id TEXT NOT NULL,
  intent_hash TEXT NOT NULL CHECK (intent_hash ~ '^0x[0-9a-f]{64}$'),
  approval_hash TEXT NOT NULL CHECK (approval_hash ~ '^0x[0-9a-f]{64}$'),
  risk_snapshot_hash TEXT NOT NULL CHECK (risk_snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  metadata_hash TEXT NOT NULL CHECK (metadata_hash ~ '^0x[0-9a-f]{64}$'),
  receipt JSONB NOT NULL CHECK (
    jsonb_typeof(receipt) = 'object'
    AND receipt->>'receiptId' = id
    AND receipt->>'receiptHash' = receipt_hash
    AND receipt->>'intentId' = intent_id
    AND receipt->>'intentHash' = intent_hash
    AND receipt->>'approvalHash' = approval_hash
    AND receipt->>'riskSnapshotHash' = risk_snapshot_hash
    AND receipt->>'metadataHash' = metadata_hash
    AND receipt::TEXT !~* '"(privateKey|seedPhrase|credential|rawSignature|secret)"'
  ),
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (
    expires_at = observed_at + INTERVAL '10 seconds'
  ),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_jit_venue_preflight_receipt.v2'),
  CONSTRAINT hypercore_jit_venue_preflight_receipts_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_jit_venue_preflight_receipts_tenant_hash_key UNIQUE (tenant_id, receipt_hash),
  CONSTRAINT hypercore_jit_venue_preflight_receipts_tenant_intent_key UNIQUE (tenant_id, intent_id),
  CONSTRAINT hypercore_jit_venue_preflight_receipts_intent_fk
    FOREIGN KEY (tenant_id, intent_id)
    REFERENCES hypercore_stable_execution_intents(tenant_id, id)
);

ALTER TABLE hypercore_stable_execution_intents
  ADD CONSTRAINT hypercore_stable_execution_intents_preflight_fk
  FOREIGN KEY (tenant_id, preflight_receipt_id)
  REFERENCES hypercore_jit_venue_preflight_receipts(tenant_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE hypercore_stable_execution_transitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  intent_id TEXT NOT NULL,
  intent_hash TEXT NOT NULL CHECK (intent_hash ~ '^0x[0-9a-f]{64}$'),
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 10),
  previous_state TEXT,
  next_state TEXT NOT NULL CHECK (next_state IN (
    'PREPARED', 'APPROVED', 'SIGNING', 'SUBMITTING', 'SUBMITTED', 'REJECTED',
    'UNKNOWN', 'RECONCILED', 'CLOSED', 'ABORTED'
  )),
  transition_hash TEXT NOT NULL CHECK (transition_hash ~ '^0x[0-9a-f]{64}$'),
  result_hash TEXT CHECK (result_hash IS NULL OR result_hash ~ '^0x[0-9a-f]{64}$'),
  changed_at TIMESTAMPTZ NOT NULL,
  retry_allowed BOOLEAN NOT NULL CHECK (retry_allowed = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_stable_execution_transition.v2'),
  CONSTRAINT hypercore_stable_execution_transitions_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_stable_execution_transitions_tenant_sequence_key UNIQUE (tenant_id, intent_id, sequence),
  CONSTRAINT hypercore_stable_execution_transitions_tenant_hash_key UNIQUE (tenant_id, transition_hash),
  CONSTRAINT hypercore_stable_execution_transitions_intent_fk
    FOREIGN KEY (tenant_id, intent_id)
    REFERENCES hypercore_stable_execution_intents(tenant_id, id)
);

CREATE FUNCTION guard_hypercore_stable_execution_intent()
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

CREATE FUNCTION guard_hypercore_stable_founder_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status <> 'APPROVED' OR NEW.status <> 'CONSUMED'
     OR OLD.version <> 1 OR NEW.version <> 2 OR ROW(
       NEW.tenant_id, NEW.id, NEW.approval_hash, NEW.intent_id, NEW.intent_hash,
       NEW.confirmation_nonce_hash, NEW.approved_at, NEW.expires_at, NEW.schema_version
     ) IS DISTINCT FROM ROW(
       OLD.tenant_id, OLD.id, OLD.approval_hash, OLD.intent_id, OLD.intent_hash,
       OLD.confirmation_nonce_hash, OLD.approved_at, OLD.expires_at, OLD.schema_version
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stable Founder approval transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_immutable_hypercore_jit_evidence()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HyperCore JIT Evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hypercore_stable_execution_intents_transition_guard
BEFORE UPDATE OR DELETE ON hypercore_stable_execution_intents
FOR EACH ROW EXECUTE FUNCTION guard_hypercore_stable_execution_intent();
CREATE TRIGGER hypercore_stable_founder_approvals_transition_guard
BEFORE UPDATE OR DELETE ON hypercore_stable_founder_approvals
FOR EACH ROW EXECUTE FUNCTION guard_hypercore_stable_founder_approval();
CREATE TRIGGER hypercore_jit_venue_preflight_receipts_immutable_guard
BEFORE UPDATE OR DELETE ON hypercore_jit_venue_preflight_receipts
FOR EACH ROW EXECUTE FUNCTION guard_immutable_hypercore_jit_evidence();
CREATE TRIGGER hypercore_stable_execution_transitions_immutable_guard
BEFORE UPDATE OR DELETE ON hypercore_stable_execution_transitions
FOR EACH ROW EXECUTE FUNCTION guard_immutable_hypercore_jit_evidence();

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hypercore_stable_execution_intents',
    'hypercore_stable_founder_approvals',
    'hypercore_jit_venue_preflight_receipts',
    'hypercore_stable_execution_transitions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_app_tenant_id()) WITH CHECK (tenant_id = current_app_tenant_id())',
      'tenant_isolation_' || table_name,
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context()',
      'tenant_context_guard_' || table_name,
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX hypercore_stable_execution_intents_tenant_state_idx
  ON hypercore_stable_execution_intents(tenant_id, state, prepared_at, id);
CREATE UNIQUE INDEX hypercore_stable_execution_intents_tenant_claim_key
  ON hypercore_stable_execution_intents(tenant_id, claim_hash)
  WHERE claim_hash IS NOT NULL;
CREATE INDEX hypercore_stable_execution_transitions_tenant_intent_idx
  ON hypercore_stable_execution_transitions(tenant_id, intent_id, sequence);
