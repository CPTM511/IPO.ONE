CREATE TABLE pool_chain_observations (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  chain_id TEXT NOT NULL CHECK (chain_id ~ '^eip155:[0-9]+$'),
  contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  market_id TEXT NOT NULL CHECK (market_id ~ '^0x[0-9a-f]{64}$'),
  ingest_sequence INTEGER NOT NULL CHECK (ingest_sequence BETWEEN 1 AND 10000000),
  event_key TEXT NOT NULL CHECK (event_key ~ '^0x[0-9a-f]{64}$'),
  event_content_hash TEXT NOT NULL CHECK (event_content_hash ~ '^0x[0-9a-f]{64}$'),
  observation_hash TEXT NOT NULL CHECK (observation_hash ~ '^0x[0-9a-f]{64}$'),
  transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  transaction_index INTEGER NOT NULL CHECK (transaction_index BETWEEN 0 AND 1000000),
  log_index INTEGER NOT NULL CHECK (log_index BETWEEN 0 AND 1000000),
  block_number BIGINT NOT NULL CHECK (block_number >= 0),
  block_hash TEXT NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  observation_status TEXT NOT NULL CHECK (
    observation_status IN ('included', 'safe', 'finalized', 'invalidated')
  ),
  normalized_observation JSONB NOT NULL CHECK (
    jsonb_typeof(normalized_observation) = 'object'
    AND normalized_observation->>'schemaVersion' = 'pool_chain_observation.v1'
    AND NOT normalized_observation ? 'topics'
    AND NOT normalized_observation ? 'data'
  ),
  recorded_at TIMESTAMPTZ NOT NULL,
  read_only BOOLEAN NOT NULL CHECK (read_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_chain_observation_record.v1'),
  CONSTRAINT pool_chain_observations_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_chain_observations_tenant_hash_key UNIQUE (tenant_id, observation_hash),
  CONSTRAINT pool_chain_observations_tenant_sequence_key
    UNIQUE (tenant_id, chain_id, contract_address, market_id, ingest_sequence)
);

CREATE TABLE pool_chain_cursors (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  chain_id TEXT NOT NULL CHECK (chain_id ~ '^eip155:[0-9]+$'),
  contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  market_id TEXT NOT NULL CHECK (market_id ~ '^0x[0-9a-f]{64}$'),
  cursor_hash TEXT NOT NULL CHECK (cursor_hash ~ '^0x[0-9a-f]{64}$'),
  block_number BIGINT NOT NULL CHECK (block_number >= 0),
  block_hash TEXT NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  event_key TEXT CHECK (event_key IS NULL OR event_key ~ '^0x[0-9a-f]{64}$'),
  observation_hash TEXT NOT NULL CHECK (observation_hash ~ '^0x[0-9a-f]{64}$'),
  cursor JSONB NOT NULL CHECK (
    jsonb_typeof(cursor) = 'object'
    AND cursor->>'schemaVersion' = 'pool_chain_cursor.v1'
  ),
  recorded_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_chain_cursor_record.v1'),
  CONSTRAINT pool_chain_cursors_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_chain_cursors_tenant_hash_key UNIQUE (tenant_id, cursor_hash)
);

CREATE TABLE pool_chain_finalized_effects (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  chain_id TEXT NOT NULL CHECK (chain_id ~ '^eip155:[0-9]+$'),
  contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  market_id TEXT NOT NULL CHECK (market_id ~ '^0x[0-9a-f]{64}$'),
  finalized_sequence INTEGER NOT NULL CHECK (finalized_sequence BETWEEN 1 AND 10000000),
  event_key TEXT NOT NULL CHECK (event_key ~ '^0x[0-9a-f]{64}$'),
  observation_hash TEXT NOT NULL CHECK (observation_hash ~ '^0x[0-9a-f]{64}$'),
  effect_hash TEXT NOT NULL CHECK (effect_hash ~ '^0x[0-9a-f]{64}$'),
  state_hash TEXT NOT NULL CHECK (state_hash ~ '^0x[0-9a-f]{64}$'),
  projection JSONB NOT NULL CHECK (
    jsonb_typeof(projection) = 'object'
    AND projection->>'schemaVersion' = 'pool_v1_projection_snapshot.v1'
  ),
  recorded_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_finalized_effect_record.v1'),
  CONSTRAINT pool_chain_finalized_effects_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_chain_finalized_effects_tenant_event_key UNIQUE (tenant_id, event_key),
  CONSTRAINT pool_chain_finalized_effects_tenant_effect_key UNIQUE (tenant_id, effect_hash),
  CONSTRAINT pool_chain_finalized_effects_tenant_sequence_key
    UNIQUE (tenant_id, chain_id, contract_address, market_id, finalized_sequence)
);

CREATE TABLE pool_chain_outbox_messages (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  effect_id TEXT NOT NULL,
  chain_id TEXT NOT NULL CHECK (chain_id ~ '^eip155:[0-9]+$'),
  contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  market_id TEXT NOT NULL CHECK (market_id ~ '^0x[0-9a-f]{64}$'),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^0x[0-9a-f]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL CHECK (status = 'pending'),
  created_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_finalized_outbox_record.v1'),
  CONSTRAINT pool_chain_outbox_messages_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_chain_outbox_messages_tenant_payload_key UNIQUE (tenant_id, payload_hash),
  CONSTRAINT pool_chain_outbox_messages_tenant_effect_fk
    FOREIGN KEY (tenant_id, effect_id)
    REFERENCES pool_chain_finalized_effects(tenant_id, id)
);

CREATE TABLE pool_reconciliation_runs (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  chain_id TEXT NOT NULL CHECK (chain_id ~ '^eip155:[0-9]+$'),
  contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  market_id TEXT NOT NULL CHECK (market_id ~ '^0x[0-9a-f]{64}$'),
  reconciliation_hash TEXT NOT NULL CHECK (reconciliation_hash ~ '^0x[0-9a-f]{64}$'),
  projection_state_hash TEXT NOT NULL CHECK (projection_state_hash ~ '^0x[0-9a-f]{64}$'),
  consistent BOOLEAN NOT NULL,
  reason_code TEXT NOT NULL CHECK (
    reason_code IN ('reconciled', 'provider_read_incomplete', 'provider_disagreement', 'projection_mismatch')
  ),
  direct_reads JSONB NOT NULL CHECK (
    jsonb_typeof(direct_reads) = 'array' AND jsonb_array_length(direct_reads) = 2
  ),
  run JSONB NOT NULL CHECK (
    jsonb_typeof(run) = 'object'
    AND run->>'schemaVersion' = 'pool_reconciliation.v1'
  ),
  checked_at TIMESTAMPTZ NOT NULL,
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_reconciliation_run_record.v1'),
  CONSTRAINT pool_reconciliation_runs_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_reconciliation_runs_tenant_hash_key UNIQUE (tenant_id, reconciliation_hash)
);

CREATE TABLE pool_reconciliation_discrepancies (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  reconciliation_id TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK (
    reason_code IN ('provider_read_incomplete', 'provider_disagreement', 'projection_mismatch')
  ),
  discrepancy_hash TEXT NOT NULL CHECK (discrepancy_hash ~ '^0x[0-9a-f]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_reconciliation_discrepancy.v1'),
  CONSTRAINT pool_reconciliation_discrepancies_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_reconciliation_discrepancies_tenant_hash_key UNIQUE (tenant_id, discrepancy_hash),
  CONSTRAINT pool_reconciliation_discrepancies_tenant_run_fk
    FOREIGN KEY (tenant_id, reconciliation_id)
    REFERENCES pool_reconciliation_runs(tenant_id, id)
);

CREATE TABLE pool_reconciliation_evidence (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  reconciliation_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^0x[0-9a-f]{64}$'),
  evidence JSONB NOT NULL CHECK (
    jsonb_typeof(evidence) = 'object'
    AND evidence->>'schemaVersion' = 'pool_reconciliation_evidence.v1'
  ),
  recorded_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_reconciliation_evidence_record.v1'),
  CONSTRAINT pool_reconciliation_evidence_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_reconciliation_evidence_tenant_hash_key UNIQUE (tenant_id, evidence_hash),
  CONSTRAINT pool_reconciliation_evidence_tenant_run_fk
    FOREIGN KEY (tenant_id, reconciliation_id)
    REFERENCES pool_reconciliation_runs(tenant_id, id)
);

CREATE TABLE pool_risk_controls (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  chain_id TEXT NOT NULL CHECK (chain_id ~ '^eip155:[0-9]+$'),
  contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'),
  market_id TEXT NOT NULL CHECK (market_id ~ '^0x[0-9a-f]{64}$'),
  version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 1000000),
  control_hash TEXT NOT NULL CHECK (control_hash ~ '^0x[0-9a-f]{64}$'),
  new_risk_frozen BOOLEAN NOT NULL,
  reason_code TEXT NOT NULL,
  control JSONB NOT NULL CHECK (
    jsonb_typeof(control) = 'object'
    AND control->>'schemaVersion' = 'pool_risk_control.v1'
  ),
  changed_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_risk_control_record.v1'),
  CONSTRAINT pool_risk_controls_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_risk_controls_tenant_hash_key UNIQUE (tenant_id, control_hash),
  CONSTRAINT pool_risk_controls_tenant_version_key
    UNIQUE (tenant_id, chain_id, contract_address, market_id, version)
);

CREATE TABLE pool_risk_control_transitions (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  previous_control_hash TEXT NOT NULL CHECK (previous_control_hash ~ '^0x[0-9a-f]{64}$'),
  next_control_hash TEXT NOT NULL CHECK (next_control_hash ~ '^0x[0-9a-f]{64}$'),
  reconciliation_id TEXT NOT NULL,
  transition TEXT NOT NULL CHECK (transition IN ('freeze_new_risk', 'resume_new_risk')),
  reason_code TEXT NOT NULL,
  transition_record JSONB NOT NULL CHECK (
    jsonb_typeof(transition_record) = 'object'
    AND transition_record->>'schemaVersion' = 'pool_risk_transition.v1'
  ),
  recorded_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'pool_risk_transition_record.v1'),
  CONSTRAINT pool_risk_control_transitions_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT pool_risk_control_transitions_tenant_next_key UNIQUE (tenant_id, next_control_hash),
  CONSTRAINT pool_risk_control_transitions_tenant_previous_control_fk
    FOREIGN KEY (tenant_id, previous_control_hash)
    REFERENCES pool_risk_controls(tenant_id, control_hash),
  CONSTRAINT pool_risk_control_transitions_tenant_next_control_fk
    FOREIGN KEY (tenant_id, next_control_hash)
    REFERENCES pool_risk_controls(tenant_id, control_hash),
  CONSTRAINT pool_risk_control_transitions_tenant_run_fk
    FOREIGN KEY (tenant_id, reconciliation_id)
    REFERENCES pool_reconciliation_runs(tenant_id, id)
);

CREATE TRIGGER pool_chain_observations_immutable
BEFORE UPDATE OR DELETE ON pool_chain_observations
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER pool_chain_cursors_immutable
BEFORE UPDATE OR DELETE ON pool_chain_cursors
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER pool_chain_finalized_effects_immutable
BEFORE UPDATE OR DELETE ON pool_chain_finalized_effects
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER pool_chain_outbox_messages_immutable
BEFORE UPDATE OR DELETE ON pool_chain_outbox_messages
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER pool_reconciliation_runs_immutable
BEFORE UPDATE OR DELETE ON pool_reconciliation_runs
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER pool_reconciliation_discrepancies_immutable
BEFORE UPDATE OR DELETE ON pool_reconciliation_discrepancies
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER pool_reconciliation_evidence_immutable
BEFORE UPDATE OR DELETE ON pool_reconciliation_evidence
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER pool_risk_controls_immutable
BEFORE UPDATE OR DELETE ON pool_risk_controls
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER pool_risk_control_transitions_immutable
BEFORE UPDATE OR DELETE ON pool_risk_control_transitions
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE INDEX pool_chain_observations_replay_idx
  ON pool_chain_observations (tenant_id, chain_id, contract_address, market_id, ingest_sequence);
CREATE INDEX pool_chain_cursors_block_idx
  ON pool_chain_cursors (tenant_id, chain_id, contract_address, market_id, block_number);
CREATE INDEX pool_reconciliation_runs_latest_idx
  ON pool_reconciliation_runs (tenant_id, chain_id, contract_address, market_id, checked_at, id);

DO $$
DECLARE
  table_name TEXT;
  pool_tables CONSTANT TEXT[] := ARRAY[
    'pool_chain_observations', 'pool_chain_cursors',
    'pool_chain_finalized_effects', 'pool_chain_outbox_messages',
    'pool_reconciliation_runs', 'pool_reconciliation_discrepancies',
    'pool_reconciliation_evidence', 'pool_risk_controls',
    'pool_risk_control_transitions'
  ];
BEGIN
  FOREACH table_name IN ARRAY pool_tables LOOP
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
