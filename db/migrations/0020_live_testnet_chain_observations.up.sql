CREATE TABLE live_chain_observations (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  chain_id TEXT NOT NULL CHECK (chain_id IN ('eip155:84532', 'eip155:1952')),
  event_key TEXT NOT NULL CHECK (event_key ~ '^0x[0-9a-f]{64}$'),
  finality_proof_hash TEXT NOT NULL CHECK (finality_proof_hash ~ '^0x[0-9a-f]{64}$'),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^0x[0-9a-f]{64}$'),
  observation_input JSONB NOT NULL CHECK (jsonb_typeof(observation_input) = 'object'),
  finality_proof JSONB NOT NULL CHECK (jsonb_typeof(finality_proof) = 'object'),
  evidence_envelope JSONB NOT NULL CHECK (jsonb_typeof(evidence_envelope) = 'object'),
  recorded_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'live_chain_observation.v1'),
  CONSTRAINT live_chain_observations_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT live_chain_observations_tenant_proof_key UNIQUE (tenant_id, finality_proof_hash)
);

CREATE TABLE live_chain_indexer_snapshots (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  chain_id TEXT NOT NULL CHECK (chain_id IN ('eip155:84532', 'eip155:1952')),
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 100000),
  snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  recorded_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'live_chain_indexer_snapshot.v1'),
  CONSTRAINT live_chain_indexer_snapshots_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT live_chain_indexer_snapshots_tenant_chain_sequence_key UNIQUE (tenant_id, chain_id, sequence)
);

CREATE TABLE live_chain_outbox_messages (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  observation_id TEXT NOT NULL,
  chain_id TEXT NOT NULL CHECK (chain_id IN ('eip155:84532', 'eip155:1952')),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^0x[0-9a-f]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'dead_letter')),
  attempt_count INTEGER NOT NULL CHECK (attempt_count BETWEEN 0 AND 10),
  available_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  error_hash TEXT CHECK (error_hash IS NULL OR error_hash ~ '^0x[0-9a-f]{64}$'),
  schema_version TEXT NOT NULL CHECK (schema_version = 'live_chain_outbox_message.v1'),
  CONSTRAINT live_chain_outbox_messages_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT live_chain_outbox_messages_tenant_payload_key UNIQUE (tenant_id, payload_hash),
  CONSTRAINT live_chain_outbox_messages_tenant_observation_fk
    FOREIGN KEY (tenant_id, observation_id)
    REFERENCES live_chain_observations(tenant_id, id),
  CONSTRAINT live_chain_outbox_messages_state_check CHECK (
    (status = 'pending' AND published_at IS NULL)
    OR (status = 'published' AND published_at IS NOT NULL AND error_hash IS NULL)
    OR (status = 'dead_letter' AND published_at IS NULL AND error_hash IS NOT NULL)
  )
);

CREATE FUNCTION protect_live_chain_outbox_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(
    NEW.tenant_id, NEW.observation_id, NEW.chain_id, NEW.payload_hash,
    NEW.payload, NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.observation_id, OLD.chain_id, OLD.payload_hash,
    OLD.payload, OLD.created_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION 'live chain outbox identity and payload are immutable';
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('pending', 'published', 'dead_letter'))
    OR (OLD.status IN ('published', 'dead_letter') AND NEW.status = OLD.status)
  ) OR NEW.attempt_count < OLD.attempt_count THEN
    RAISE EXCEPTION 'live chain outbox transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER live_chain_observations_immutable
BEFORE UPDATE OR DELETE ON live_chain_observations
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER live_chain_indexer_snapshots_immutable
BEFORE UPDATE OR DELETE ON live_chain_indexer_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER live_chain_outbox_messages_transition_guard
BEFORE UPDATE ON live_chain_outbox_messages
FOR EACH ROW EXECUTE FUNCTION protect_live_chain_outbox_transition();

CREATE TRIGGER live_chain_outbox_messages_delete_guard
BEFORE DELETE ON live_chain_outbox_messages
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE INDEX live_chain_observations_tenant_chain_recorded_idx
  ON live_chain_observations (tenant_id, chain_id, recorded_at, id);
CREATE INDEX live_chain_outbox_tenant_pending_idx
  ON live_chain_outbox_messages (tenant_id, chain_id, status, available_at, id);

DO $$
DECLARE
  table_name TEXT;
  live_chain_tables CONSTANT TEXT[] := ARRAY[
    'live_chain_observations', 'live_chain_indexer_snapshots',
    'live_chain_outbox_messages'
  ];
BEGIN
  FOREACH table_name IN ARRAY live_chain_tables LOOP
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
