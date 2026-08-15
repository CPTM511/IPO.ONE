-- CHAIN-001F: every durable Evidence Envelope receives one Base Sepolia
-- anchoring requirement. Chain observations remain separate from the
-- immutable offchain Evidence content.

CREATE TABLE evidence_chain_anchors (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  evidence_event_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^0x[0-9a-f]{64}$'),
  event_type TEXT NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_]{1,127}$'),
  event_type_hash TEXT NOT NULL CHECK (event_type_hash ~ '^0x[0-9a-f]{64}$'),
  aggregate_ref_hash TEXT NOT NULL CHECK (
    aggregate_ref_hash ~ '^0x[0-9a-f]{64}$'
  ),
  action_digest TEXT NOT NULL CHECK (action_digest ~ '^0x[0-9a-f]{64}$'),
  chain_id TEXT NOT NULL CHECK (chain_id = 'eip155:84532'),
  contract_address TEXT CHECK (
    contract_address IS NULL
    OR contract_address ~ '^0x[0-9a-fA-F]{40}$'
  ),
  attestor_account_id TEXT CHECK (
    attestor_account_id IS NULL
    OR attestor_account_id ~ '^eip155:84532:0x[0-9a-fA-F]{40}$'
  ),
  confirmation_mode TEXT NOT NULL CHECK (
    confirmation_mode IN (
      'unassigned',
      'wallet_transaction',
      'account_relayer',
      'agent_transaction',
      'system_attestor'
    )
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'pending',
      'prepared',
      'broadcast',
      'unknown',
      'included',
      'safe',
      'finalized',
      'reorged',
      'failed',
      'reconciled'
    )
  ),
  batch_id TEXT,
  batch_digest TEXT CHECK (
    batch_digest IS NULL OR batch_digest ~ '^0x[0-9a-f]{64}$'
  ),
  batch_ordinal INTEGER CHECK (
    batch_ordinal IS NULL OR batch_ordinal BETWEEN 0 AND 15
  ),
  batch_size INTEGER CHECK (
    batch_size IS NULL OR batch_size BETWEEN 1 AND 16
  ),
  attestor_nonce NUMERIC(20,0) CHECK (
    attestor_nonce IS NULL
    OR (attestor_nonce >= 0 AND attestor_nonce <= 18446744073709551615)
  ),
  expires_at TIMESTAMPTZ,
  transaction_hash TEXT CHECK (
    transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-f]{64}$'
  ),
  block_number NUMERIC(78,0) CHECK (
    block_number IS NULL OR block_number >= 0
  ),
  block_hash TEXT CHECK (
    block_hash IS NULL OR block_hash ~ '^0x[0-9a-f]{64}$'
  ),
  log_index INTEGER CHECK (log_index IS NULL OR log_index BETWEEN 0 AND 65535),
  confirmations INTEGER NOT NULL DEFAULT 0 CHECK (
    confirmations BETWEEN 0 AND 1000000
  ),
  prepared_transaction JSONB CHECK (
    prepared_transaction IS NULL
    OR jsonb_typeof(prepared_transaction) = 'object'
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (
    attempt_count BETWEEN 0 AND 10
  ),
  last_error_code TEXT CHECK (
    last_error_code IS NULL
    OR last_error_code ~ '^[a-z][a-z0-9_]{2,127}$'
  ),
  requested_at TIMESTAMPTZ NOT NULL,
  prepared_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  anchored_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (
    production_funds_moved = FALSE
  ),
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'evidence_chain_anchor.v1'
  ),
  CONSTRAINT evidence_chain_anchors_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT evidence_chain_anchors_tenant_evidence_key UNIQUE (
    tenant_id, evidence_hash
  ),
  CONSTRAINT evidence_chain_anchors_event_fk
    FOREIGN KEY (tenant_id, evidence_event_id)
    REFERENCES evidence_envelopes(tenant_id, id),
  CONSTRAINT evidence_chain_anchor_state_check CHECK (
    (
      status = 'pending'
      AND contract_address IS NULL
      AND attestor_account_id IS NULL
      AND confirmation_mode = 'unassigned'
      AND batch_id IS NULL
      AND transaction_hash IS NULL
      AND finalized_at IS NULL
    )
    OR (
      status = 'prepared'
      AND contract_address IS NOT NULL
      AND attestor_account_id IS NOT NULL
      AND confirmation_mode <> 'unassigned'
      AND batch_id IS NOT NULL
      AND batch_digest IS NOT NULL
      AND batch_ordinal IS NOT NULL
      AND batch_size IS NOT NULL
      AND batch_ordinal < batch_size
      AND attestor_nonce IS NOT NULL
      AND expires_at IS NOT NULL
      AND prepared_transaction IS NOT NULL
      AND transaction_hash IS NULL
      AND prepared_at IS NOT NULL
    )
    OR (
      status IN ('broadcast', 'unknown')
      AND contract_address IS NOT NULL
      AND attestor_account_id IS NOT NULL
      AND confirmation_mode <> 'unassigned'
      AND batch_id IS NOT NULL
      AND batch_digest IS NOT NULL
      AND batch_ordinal IS NOT NULL
      AND batch_size IS NOT NULL
      AND batch_ordinal < batch_size
      AND transaction_hash IS NOT NULL
      AND submitted_at IS NOT NULL
      AND finalized_at IS NULL
    )
    OR (
      status IN ('included', 'safe', 'finalized', 'reorged', 'reconciled')
      AND contract_address IS NOT NULL
      AND attestor_account_id IS NOT NULL
      AND confirmation_mode <> 'unassigned'
      AND batch_id IS NOT NULL
      AND batch_digest IS NOT NULL
      AND batch_ordinal IS NOT NULL
      AND batch_size IS NOT NULL
      AND batch_ordinal < batch_size
      AND transaction_hash IS NOT NULL
      AND block_number IS NOT NULL
      AND block_hash IS NOT NULL
      AND log_index IS NOT NULL
      AND anchored_at IS NOT NULL
      AND (
        status <> 'finalized'
        OR finalized_at IS NOT NULL
      )
    )
    OR (
      status = 'failed'
      AND last_error_code IS NOT NULL
      AND attempt_count > 0
      AND finalized_at IS NULL
    )
  )
);

CREATE TABLE evidence_chain_anchor_observations (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  anchor_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^0x[0-9a-f]{64}$'),
  chain_id TEXT NOT NULL CHECK (chain_id = 'eip155:84532'),
  contract_address TEXT NOT NULL CHECK (
    contract_address ~ '^0x[0-9a-fA-F]{40}$'
  ),
  transaction_hash TEXT NOT NULL CHECK (
    transaction_hash ~ '^0x[0-9a-f]{64}$'
  ),
  status TEXT NOT NULL CHECK (
    status IN ('unknown', 'included', 'safe', 'finalized', 'reorged', 'failed')
  ),
  block_number NUMERIC(78,0) CHECK (
    block_number IS NULL OR block_number >= 0
  ),
  block_hash TEXT CHECK (
    block_hash IS NULL OR block_hash ~ '^0x[0-9a-f]{64}$'
  ),
  log_index INTEGER CHECK (log_index IS NULL OR log_index BETWEEN 0 AND 65535),
  confirmations INTEGER NOT NULL CHECK (
    confirmations BETWEEN 0 AND 1000000
  ),
  finality_proof_hash TEXT NOT NULL CHECK (
    finality_proof_hash ~ '^0x[0-9a-f]{64}$'
  ),
  observed_at TIMESTAMPTZ NOT NULL,
  provider_slot TEXT NOT NULL CHECK (
    provider_slot IN ('primary', 'secondary')
  ),
  raw_provider_payload_persisted BOOLEAN NOT NULL CHECK (
    raw_provider_payload_persisted = FALSE
  ),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (
    production_funds_moved = FALSE
  ),
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'evidence_chain_anchor_observation.v1'
  ),
  CONSTRAINT evidence_chain_anchor_observations_pkey PRIMARY KEY (
    tenant_id, id
  ),
  CONSTRAINT evidence_chain_anchor_observation_proof_key UNIQUE (
    tenant_id, finality_proof_hash
  ),
  CONSTRAINT evidence_chain_anchor_observation_anchor_fk
    FOREIGN KEY (tenant_id, anchor_id)
    REFERENCES evidence_chain_anchors(tenant_id, id)
);

-- Existing durable Evidence is not grandfathered out of the chain invariant.
-- It receives pending anchor requirements before this migration commits.
INSERT INTO evidence_chain_anchors(
  id, tenant_id, evidence_event_id, evidence_hash, event_type,
  event_type_hash, aggregate_ref_hash, action_digest, chain_id,
  confirmation_mode, status, requested_at, sandbox_only,
  production_funds_moved, schema_version
)
SELECT
  'evidence_chain_anchor_' || substr(evidence_hash, 3),
  tenant_id,
  id,
  evidence_hash,
  event_type,
  '0x' || encode(
    sha256(convert_to(
      'IPO_ONE_EVIDENCE_ANCHOR_BACKFILL_V1:event_type:' || event_type,
      'UTF8'
    )),
    'hex'
  ),
  '0x' || encode(
    sha256(convert_to(
      'IPO_ONE_EVIDENCE_ANCHOR_BACKFILL_V1:aggregate:' ||
      aggregate_type || ':' || aggregate_id || ':' || aggregate_version::TEXT,
      'UTF8'
    )),
    'hex'
  ),
  '0x' || encode(
    sha256(convert_to(
      'IPO_ONE_EVIDENCE_ANCHOR_BACKFILL_V1:action:' ||
      source_system || ':' || idempotency_key || ':' || correlation_id,
      'UTF8'
    )),
    'hex'
  ),
  'eip155:84532',
  'unassigned',
  'pending',
  recorded_at,
  TRUE,
  FALSE,
  'evidence_chain_anchor.v1'
FROM evidence_envelopes
ON CONFLICT (tenant_id, evidence_hash) DO NOTHING;

CREATE FUNCTION protect_evidence_chain_anchor_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(
    NEW.tenant_id,
    NEW.id,
    NEW.evidence_event_id,
    NEW.evidence_hash,
    NEW.event_type,
    NEW.event_type_hash,
    NEW.aggregate_ref_hash,
    NEW.action_digest,
    NEW.chain_id,
    NEW.requested_at,
    NEW.sandbox_only,
    NEW.production_funds_moved,
    NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id,
    OLD.id,
    OLD.evidence_event_id,
    OLD.evidence_hash,
    OLD.event_type,
    OLD.event_type_hash,
    OLD.aggregate_ref_hash,
    OLD.action_digest,
    OLD.chain_id,
    OLD.requested_at,
    OLD.sandbox_only,
    OLD.production_funds_moved,
    OLD.schema_version
  ) THEN
    RAISE EXCEPTION 'Evidence chain anchor identity is immutable';
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('prepared', 'failed'))
    OR (OLD.status = 'prepared' AND NEW.status IN ('broadcast', 'unknown', 'failed'))
    OR (
      OLD.status IN ('broadcast', 'unknown')
      AND NEW.status IN (
        'broadcast', 'unknown', 'included', 'safe', 'finalized', 'reorged', 'failed'
      )
    )
    OR (
      OLD.status = 'included'
      AND NEW.status IN ('included', 'safe', 'finalized', 'reorged')
    )
    OR (
      OLD.status = 'safe'
      AND NEW.status IN ('safe', 'finalized', 'reorged')
    )
    OR (
      OLD.status = 'finalized'
      AND NEW.status IN ('finalized', 'reorged')
    )
    OR (
      OLD.status = 'reorged'
      AND NEW.status IN ('prepared', 'reconciled', 'failed')
    )
    OR (
      OLD.status = 'reconciled'
      AND NEW.status IN ('reconciled', 'finalized', 'failed')
    )
    OR (
      OLD.status = 'failed'
      AND NEW.status IN ('failed', 'prepared')
      AND (
        NEW.status <> 'prepared'
        OR OLD.transaction_hash IS NULL
      )
    )
  ) THEN
    RAISE EXCEPTION 'Evidence chain anchor transition is invalid';
  END IF;

  IF OLD.transaction_hash IS NOT NULL
    AND NOT (OLD.status = 'reorged' AND NEW.status = 'prepared')
    AND (
    NEW.contract_address IS DISTINCT FROM OLD.contract_address
    OR NEW.attestor_account_id IS DISTINCT FROM OLD.attestor_account_id
    OR NEW.confirmation_mode IS DISTINCT FROM OLD.confirmation_mode
    OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
    OR NEW.batch_digest IS DISTINCT FROM OLD.batch_digest
    OR NEW.batch_ordinal IS DISTINCT FROM OLD.batch_ordinal
    OR NEW.batch_size IS DISTINCT FROM OLD.batch_size
    OR NEW.attestor_nonce IS DISTINCT FROM OLD.attestor_nonce
    OR NEW.transaction_hash IS DISTINCT FROM OLD.transaction_hash
    ) THEN
    RAISE EXCEPTION 'Evidence chain anchor binding is immutable once assigned';
  END IF;

  IF NEW.attempt_count < OLD.attempt_count THEN
    RAISE EXCEPTION 'Evidence chain anchor attempt count cannot decrease';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_chain_anchor_transition_guard
BEFORE UPDATE ON evidence_chain_anchors
FOR EACH ROW EXECUTE FUNCTION protect_evidence_chain_anchor_transition();

CREATE TRIGGER evidence_chain_anchor_delete_guard
BEFORE DELETE ON evidence_chain_anchors
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER evidence_chain_anchor_observations_immutable
BEFORE UPDATE OR DELETE ON evidence_chain_anchor_observations
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE INDEX evidence_chain_anchors_pending_idx
  ON evidence_chain_anchors (
    tenant_id, chain_id, status, requested_at, evidence_hash
  );
CREATE INDEX evidence_chain_anchors_transaction_idx
  ON evidence_chain_anchors (
    tenant_id, chain_id, transaction_hash, evidence_hash
  ) WHERE transaction_hash IS NOT NULL;
CREATE INDEX evidence_chain_anchor_observations_anchor_idx
  ON evidence_chain_anchor_observations (
    tenant_id, anchor_id, observed_at, id
  );

DO $$
DECLARE
  table_name TEXT;
  anchor_tables CONSTANT TEXT[] := ARRAY[
    'evidence_chain_anchors',
    'evidence_chain_anchor_observations'
  ];
BEGIN
  FOREACH table_name IN ARRAY anchor_tables LOOP
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
