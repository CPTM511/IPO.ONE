CREATE TABLE credit_registry_chain_observations (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id()
    REFERENCES tenants(id),
  chain_id TEXT NOT NULL CHECK (chain_id = 'eip155:84532'),
  contract_address TEXT NOT NULL CHECK (
    contract_address ~ '^0x[0-9a-fA-F]{40}$'
  ),
  authorization_hash TEXT NOT NULL CHECK (
    authorization_hash ~ '^0x[0-9a-f]{64}$'
  ),
  observation_hash TEXT NOT NULL CHECK (
    observation_hash ~ '^0x[0-9a-f]{64}$'
  ),
  finality_proof_hash TEXT NOT NULL CHECK (
    finality_proof_hash ~ '^0x[0-9a-f]{64}$'
  ),
  observation JSONB NOT NULL CHECK (jsonb_typeof(observation) = 'object'),
  safe_block_number BIGINT NOT NULL CHECK (safe_block_number > 0),
  safe_block_hash TEXT NOT NULL CHECK (
    safe_block_hash ~ '^0x[0-9a-f]{64}$'
  ),
  recorded_at TIMESTAMPTZ NOT NULL,
  read_only BOOLEAN NOT NULL CHECK (read_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (
    production_funds_moved = FALSE
  ),
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'credit_registry_chain_observation.v1'
  ),
  CONSTRAINT credit_registry_chain_observations_pkey
    PRIMARY KEY (tenant_id, id),
  CONSTRAINT credit_registry_chain_observations_tenant_hash_key
    UNIQUE (tenant_id, observation_hash)
);

CREATE TABLE credit_registry_chain_outbox_messages (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id()
    REFERENCES tenants(id),
  observation_id TEXT NOT NULL,
  chain_id TEXT NOT NULL CHECK (chain_id = 'eip155:84532'),
  payload_hash TEXT NOT NULL CHECK (
    payload_hash ~ '^0x[0-9a-f]{64}$'
  ),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'published', 'dead_letter')
  ),
  attempt_count INTEGER NOT NULL CHECK (attempt_count BETWEEN 0 AND 10),
  available_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  error_hash TEXT CHECK (
    error_hash IS NULL OR error_hash ~ '^0x[0-9a-f]{64}$'
  ),
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'credit_registry_chain_outbox_message.v1'
  ),
  CONSTRAINT credit_registry_chain_outbox_messages_pkey
    PRIMARY KEY (tenant_id, id),
  CONSTRAINT credit_registry_chain_outbox_tenant_payload_key
    UNIQUE (tenant_id, payload_hash),
  CONSTRAINT credit_registry_chain_outbox_observation_fk
    FOREIGN KEY (tenant_id, observation_id)
    REFERENCES credit_registry_chain_observations(tenant_id, id),
  CONSTRAINT credit_registry_chain_outbox_state_check CHECK (
    (status = 'pending' AND published_at IS NULL)
    OR (
      status = 'published'
      AND published_at IS NOT NULL
      AND error_hash IS NULL
    )
    OR (
      status = 'dead_letter'
      AND published_at IS NULL
      AND error_hash IS NOT NULL
    )
  )
);

CREATE FUNCTION protect_credit_registry_chain_outbox_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(
    NEW.tenant_id, NEW.observation_id, NEW.chain_id, NEW.payload_hash,
    NEW.payload, NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.observation_id, OLD.chain_id, OLD.payload_hash,
    OLD.payload, OLD.created_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION
      'credit Registry chain outbox identity and payload are immutable';
  END IF;
  IF NOT (
    (
      OLD.status = 'pending'
      AND NEW.status IN ('pending', 'published', 'dead_letter')
    )
    OR (
      OLD.status IN ('published', 'dead_letter')
      AND NEW.status = OLD.status
    )
  ) OR NEW.attempt_count < OLD.attempt_count THEN
    RAISE EXCEPTION 'credit Registry chain outbox transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credit_registry_chain_observations_immutable
BEFORE UPDATE OR DELETE ON credit_registry_chain_observations
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER credit_registry_chain_outbox_transition_guard
BEFORE UPDATE ON credit_registry_chain_outbox_messages
FOR EACH ROW EXECUTE FUNCTION protect_credit_registry_chain_outbox_transition();

CREATE TRIGGER credit_registry_chain_outbox_delete_guard
BEFORE DELETE ON credit_registry_chain_outbox_messages
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE INDEX credit_registry_chain_observations_lookup_idx
  ON credit_registry_chain_observations (
    tenant_id, authorization_hash, recorded_at DESC, id
  );
CREATE INDEX credit_registry_chain_outbox_pending_idx
  ON credit_registry_chain_outbox_messages (
    tenant_id, status, available_at, id
  );

DO $$
DECLARE
  table_name TEXT;
  registry_tables CONSTANT TEXT[] := ARRAY[
    'credit_registry_chain_observations',
    'credit_registry_chain_outbox_messages'
  ];
BEGIN
  FOREACH table_name IN ARRAY registry_tables LOOP
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
