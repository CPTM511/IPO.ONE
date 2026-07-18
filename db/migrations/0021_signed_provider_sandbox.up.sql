CREATE TYPE provider_delivery_status AS ENUM ('pending', 'acknowledged', 'callback_completed');

CREATE TABLE provider_intent_deliveries (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  delivery_hash TEXT NOT NULL CHECK (delivery_hash ~ '^0x[0-9a-f]{64}$'),
  transfer_intent_id TEXT NOT NULL,
  transfer_intent_hash TEXT NOT NULL CHECK (transfer_intent_hash ~ '^0x[0-9a-f]{64}$'),
  provider_id TEXT NOT NULL,
  provider_actor_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  source_asset_id TEXT NOT NULL,
  source_amount_minor NUMERIC(78,0) NOT NULL CHECK (source_amount_minor > 0),
  destination_asset_id TEXT NOT NULL,
  status provider_delivery_status NOT NULL,
  acknowledgement_id TEXT,
  acknowledged_at TIMESTAMPTZ,
  callback_id TEXT,
  callback_payload_hash TEXT CHECK (callback_payload_hash IS NULL OR callback_payload_hash ~ '^0x[0-9a-f]{64}$'),
  callback_completed_at TIMESTAMPTZ,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version BETWEEN 1 AND 9223372036854775807),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  withdrawable BOOLEAN NOT NULL CHECK (withdrawable = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'provider_intent_delivery.v1'),
  CONSTRAINT provider_intent_deliveries_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT provider_intent_deliveries_tenant_id_hash_key UNIQUE (tenant_id, id, delivery_hash),
  CONSTRAINT provider_intent_deliveries_tenant_intent_key UNIQUE (tenant_id, transfer_intent_id),
  CONSTRAINT provider_intent_deliveries_tenant_hash_key UNIQUE (tenant_id, delivery_hash),
  CONSTRAINT provider_intent_deliveries_window_check CHECK (expires_at > issued_at),
  CONSTRAINT provider_intent_deliveries_state_check CHECK (
    (status = 'pending' AND acknowledgement_id IS NULL AND acknowledged_at IS NULL
      AND callback_id IS NULL AND callback_payload_hash IS NULL AND callback_completed_at IS NULL)
    OR (status = 'acknowledged' AND acknowledgement_id IS NOT NULL AND acknowledged_at IS NOT NULL
      AND callback_id IS NULL AND callback_payload_hash IS NULL AND callback_completed_at IS NULL)
    OR (status = 'callback_completed' AND acknowledgement_id IS NOT NULL AND acknowledged_at IS NOT NULL
      AND callback_id IS NOT NULL AND callback_payload_hash IS NOT NULL AND callback_completed_at IS NOT NULL)
  )
);

CREATE TABLE provider_intent_acknowledgements (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  delivery_id TEXT NOT NULL,
  delivery_hash TEXT NOT NULL CHECK (delivery_hash ~ '^0x[0-9a-f]{64}$'),
  transfer_intent_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  withdrawable BOOLEAN NOT NULL CHECK (withdrawable = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'provider_intent_acknowledgement.v1'),
  CONSTRAINT provider_intent_acknowledgements_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT provider_intent_acknowledgements_tenant_delivery_key UNIQUE (tenant_id, delivery_id),
  CONSTRAINT provider_intent_acknowledgements_delivery_fk
    FOREIGN KEY (tenant_id, delivery_id, delivery_hash)
      REFERENCES provider_intent_deliveries(tenant_id, id, delivery_hash)
);

CREATE TABLE provider_callback_inbox (
  callback_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  transfer_intent_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  delivery_hash TEXT NOT NULL CHECK (delivery_hash ~ '^0x[0-9a-f]{64}$'),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^0x[0-9a-f]{64}$'),
  nonce_hash TEXT NOT NULL CHECK (nonce_hash ~ '^0x[0-9a-f]{64}$'),
  key_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  reason_code TEXT NOT NULL CHECK (reason_code IN ('provider_accepted', 'provider_policy_rejected')),
  provider_event_ref_hash TEXT NOT NULL CHECK (provider_event_ref_hash ~ '^0x[0-9a-f]{64}$'),
  result_json JSONB NOT NULL CHECK (jsonb_typeof(result_json) = 'object'),
  processed_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  withdrawable BOOLEAN NOT NULL CHECK (withdrawable = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'provider_sandbox_callback_result.v1'),
  CONSTRAINT provider_callback_inbox_pkey PRIMARY KEY (tenant_id, callback_id),
  CONSTRAINT provider_callback_inbox_tenant_nonce_key UNIQUE (tenant_id, nonce_hash),
  CONSTRAINT provider_callback_inbox_tenant_payload_key UNIQUE (tenant_id, payload_hash),
  CONSTRAINT provider_callback_inbox_delivery_fk
    FOREIGN KEY (tenant_id, delivery_hash)
      REFERENCES provider_intent_deliveries(tenant_id, delivery_hash),
  CONSTRAINT provider_callback_inbox_outcome_reason_check CHECK (
    (outcome = 'accepted' AND reason_code = 'provider_accepted')
    OR (outcome = 'rejected' AND reason_code = 'provider_policy_rejected')
  ),
  CONSTRAINT provider_callback_inbox_no_raw_secret_check CHECK (
    NOT (result_json ?| ARRAY['nonce', 'signature', 'privateKey', 'credential', 'settlementAccount'])
  )
);

CREATE FUNCTION protect_provider_delivery_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.delivery_hash, NEW.transfer_intent_id,
    NEW.transfer_intent_hash, NEW.provider_id, NEW.provider_actor_id,
    NEW.purpose_code, NEW.source_asset_id, NEW.source_amount_minor,
    NEW.destination_asset_id, NEW.issued_at, NEW.expires_at, NEW.sandbox_only,
    NEW.production_funds_moved, NEW.withdrawable, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.delivery_hash, OLD.transfer_intent_id,
    OLD.transfer_intent_hash, OLD.provider_id, OLD.provider_actor_id,
    OLD.purpose_code, OLD.source_asset_id, OLD.source_amount_minor,
    OLD.destination_asset_id, OLD.issued_at, OLD.expires_at, OLD.sandbox_only,
    OLD.production_funds_moved, OLD.withdrawable, OLD.schema_version
  ) THEN
    RAISE EXCEPTION 'provider delivery identity and economics are immutable';
  END IF;
  IF (
    OLD.status = NEW.status AND (
      NEW.acknowledgement_id IS DISTINCT FROM OLD.acknowledgement_id
      OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
      OR NEW.callback_id IS DISTINCT FROM OLD.callback_id
      OR NEW.callback_payload_hash IS DISTINCT FROM OLD.callback_payload_hash
      OR NEW.callback_completed_at IS DISTINCT FROM OLD.callback_completed_at
      OR NEW.aggregate_version IS DISTINCT FROM OLD.aggregate_version
    )
  ) OR (
    OLD.status = 'pending' AND NEW.status = 'acknowledged' AND (
      NEW.aggregate_version <> OLD.aggregate_version + 1
      OR NEW.acknowledgement_id IS NULL OR NEW.acknowledged_at IS NULL
    )
  ) OR (
    OLD.status = 'acknowledged' AND NEW.status = 'callback_completed' AND (
      NEW.aggregate_version <> OLD.aggregate_version + 1
      OR NEW.acknowledgement_id IS DISTINCT FROM OLD.acknowledgement_id
      OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
      OR NEW.callback_id IS NULL OR NEW.callback_payload_hash IS NULL
      OR NEW.callback_completed_at IS NULL
    )
  ) OR NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'pending' AND NEW.status = 'acknowledged')
    OR (OLD.status = 'acknowledged' AND NEW.status = 'callback_completed')
  ) THEN
    RAISE EXCEPTION 'provider delivery transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER provider_intent_deliveries_transition_guard
BEFORE UPDATE ON provider_intent_deliveries
FOR EACH ROW EXECUTE FUNCTION protect_provider_delivery_transition();

CREATE TRIGGER provider_intent_deliveries_delete_guard
BEFORE DELETE ON provider_intent_deliveries
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER provider_intent_acknowledgements_immutable
BEFORE UPDATE OR DELETE ON provider_intent_acknowledgements
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER provider_callback_inbox_immutable
BEFORE UPDATE OR DELETE ON provider_callback_inbox
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE INDEX provider_intent_deliveries_tenant_status_idx
  ON provider_intent_deliveries (tenant_id, status, expires_at, id);
CREATE INDEX provider_callback_inbox_tenant_intent_idx
  ON provider_callback_inbox (tenant_id, transfer_intent_id, processed_at, callback_id);

DO $$
DECLARE
  table_name TEXT;
  provider_tables CONSTANT TEXT[] := ARRAY[
    'provider_intent_deliveries', 'provider_intent_acknowledgements',
    'provider_callback_inbox'
  ];
BEGIN
  FOREACH table_name IN ARRAY provider_tables LOOP
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
