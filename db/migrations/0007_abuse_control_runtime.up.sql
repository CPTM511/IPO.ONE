CREATE TABLE abuse_rate_buckets (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key_hash TEXT NOT NULL CHECK (key_hash ~ '^0x[0-9a-f]{64}$'),
  dimension TEXT NOT NULL CHECK (dimension IN (
    'actor', 'client', 'tenant', 'operation', 'service', 'network', 'account', 'upstream_cost'
  )),
  quota_class TEXT NOT NULL CHECK (quota_class IN (
    'discovery', 'read', 'mutation', 'economic', 'credential',
    'privileged', 'batch', 'worker'
  )),
  window_started_at TIMESTAMPTZ NOT NULL,
  window_ms INTEGER NOT NULL CHECK (window_ms BETWEEN 1000 AND 600000),
  used_count BIGINT NOT NULL CHECK (used_count BETWEEN 0 AND 25000),
  limit_count BIGINT NOT NULL CHECK (limit_count BETWEEN 1 AND 25000),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL CHECK (version >= 1),
  schema_version TEXT NOT NULL CHECK (schema_version = 'abuse_rate_bucket.v1'),
  PRIMARY KEY (tenant_id, key_hash),
  CHECK (used_count <= limit_count),
  CHECK (expires_at = window_started_at + window_ms * INTERVAL '1 millisecond'),
  CHECK (updated_at >= window_started_at)
);

CREATE TABLE abuse_capacity_buckets (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key_hash TEXT NOT NULL CHECK (key_hash ~ '^0x[0-9a-f]{64}$'),
  kind TEXT NOT NULL CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'open_obligations', 'providers', 'credentials', 'access_grants'
  )),
  used_count BIGINT NOT NULL CHECK (used_count BETWEEN 0 AND 10000),
  limit_count BIGINT NOT NULL CHECK (limit_count BETWEEN 1 AND 10000),
  updated_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL CHECK (version >= 1),
  schema_version TEXT NOT NULL CHECK (schema_version = 'abuse_capacity_bucket.v1'),
  PRIMARY KEY (tenant_id, key_hash),
  CHECK (used_count <= limit_count)
);

CREATE TABLE abuse_admissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  actor_ref_hash TEXT NOT NULL CHECK (actor_ref_hash ~ '^0x[0-9a-f]{64}$'),
  client_ref_hash TEXT NOT NULL CHECK (client_ref_hash ~ '^0x[0-9a-f]{64}$'),
  operation_id TEXT NOT NULL,
  quota_class TEXT NOT NULL CHECK (quota_class IN (
    'read', 'mutation', 'economic', 'privileged', 'batch', 'worker'
  )),
  command_ref_hash TEXT CHECK (command_ref_hash ~ '^0x[0-9a-f]{64}$'),
  state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'expired')),
  outcome TEXT CHECK (outcome IN ('succeeded', 'failed', 'expired')),
  replayed BOOLEAN NOT NULL,
  rate_reservations JSONB NOT NULL CHECK (
    jsonb_typeof(rate_reservations) = 'array'
    AND jsonb_array_length(rate_reservations) BETWEEN 1 AND 16
  ),
  capacity_reservations JSONB NOT NULL CHECK (
    jsonb_typeof(capacity_reservations) = 'array'
    AND jsonb_array_length(capacity_reservations) BETWEEN 1 AND 16
  ),
  policy_version TEXT NOT NULL CHECK (policy_version = 'abuse_001.v1'),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  version BIGINT NOT NULL CHECK (version >= 1),
  schema_version TEXT NOT NULL CHECK (schema_version = 'abuse_admission_record.v1'),
  UNIQUE (tenant_id, id),
  CHECK (expires_at > issued_at),
  CHECK (expires_at <= issued_at + INTERVAL '60 seconds'),
  CHECK ((state = 'pending') = (outcome IS NULL AND completed_at IS NULL)),
  CHECK ((state <> 'pending') = (outcome IS NOT NULL AND completed_at IS NOT NULL))
);

CREATE TABLE abuse_command_charges (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  command_ref_hash TEXT NOT NULL CHECK (command_ref_hash ~ '^0x[0-9a-f]{64}$'),
  operation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  active_admission_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL CHECK (version >= 1),
  schema_version TEXT NOT NULL CHECK (schema_version = 'abuse_command_charge.v1'),
  PRIMARY KEY (tenant_id, command_ref_hash),
  FOREIGN KEY (tenant_id, active_admission_id)
    REFERENCES abuse_admissions(tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX abuse_rate_buckets_expiry_idx
  ON abuse_rate_buckets(tenant_id, expires_at);
CREATE INDEX abuse_admissions_expiry_idx
  ON abuse_admissions(tenant_id, state, expires_at);
CREATE INDEX abuse_command_charges_expiry_idx
  ON abuse_command_charges(tenant_id, status, expires_at);

CREATE FUNCTION protect_abuse_admission_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.actor_ref_hash IS DISTINCT FROM NEW.actor_ref_hash
     OR OLD.client_ref_hash IS DISTINCT FROM NEW.client_ref_hash
     OR OLD.operation_id IS DISTINCT FROM NEW.operation_id
     OR OLD.quota_class IS DISTINCT FROM NEW.quota_class
     OR OLD.command_ref_hash IS DISTINCT FROM NEW.command_ref_hash
     OR OLD.replayed IS DISTINCT FROM NEW.replayed
     OR OLD.rate_reservations IS DISTINCT FROM NEW.rate_reservations
     OR OLD.capacity_reservations IS DISTINCT FROM NEW.capacity_reservations
     OR OLD.policy_version IS DISTINCT FROM NEW.policy_version
     OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'abuse admission immutable fields cannot change';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'abuse admission version must increment exactly once';
  END IF;
  IF OLD.state <> 'pending' OR NEW.state NOT IN ('completed', 'expired') THEN
    RAISE EXCEPTION 'abuse admission transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_abuse_command_charge_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.command_ref_hash IS DISTINCT FROM NEW.command_ref_hash
     OR OLD.operation_id IS DISTINCT FROM NEW.operation_id
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'abuse command charge immutable fields cannot change';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'abuse command charge version must increment exactly once';
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('succeeded', 'failed'))
    OR (OLD.status = 'failed' AND NEW.status = 'pending')
  ) THEN
    RAISE EXCEPTION 'abuse command charge transition is invalid';
  END IF;
  IF OLD.status <> 'failed' AND OLD.active_admission_id IS DISTINCT FROM NEW.active_admission_id THEN
    RAISE EXCEPTION 'active admission can change only when retrying a failed charge';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER abuse_admissions_transition_guard
BEFORE UPDATE ON abuse_admissions
FOR EACH ROW EXECUTE FUNCTION protect_abuse_admission_transition();

CREATE TRIGGER abuse_command_charges_transition_guard
BEFORE UPDATE ON abuse_command_charges
FOR EACH ROW EXECUTE FUNCTION protect_abuse_command_charge_transition();

DO $$
DECLARE
  table_name TEXT;
  abuse_tables CONSTANT TEXT[] := ARRAY[
    'abuse_rate_buckets', 'abuse_capacity_buckets',
    'abuse_admissions', 'abuse_command_charges'
  ];
BEGIN
  FOREACH table_name IN ARRAY abuse_tables LOOP
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
