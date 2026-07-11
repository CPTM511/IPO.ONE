CREATE TYPE command_execution_status AS ENUM ('processing', 'completed');
CREATE TYPE inbox_processing_status AS ENUM ('processing', 'completed');

CREATE TABLE aggregate_stream_heads (
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  current_version BIGINT NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (aggregate_type, aggregate_id)
);

CREATE TABLE domain_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version > 0),
  subject_id TEXT,
  obligation_id TEXT,
  source_finality TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  event_json JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  schema_version TEXT NOT NULL,
  UNIQUE (aggregate_type, aggregate_id, aggregate_version)
);

CREATE TABLE command_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  command_hash TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  status command_execution_status NOT NULL DEFAULT 'processing',
  event_id TEXT REFERENCES domain_events(id),
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (status <> 'completed' OR (event_id IS NOT NULL AND response_json IS NOT NULL))
);

CREATE TABLE outbox_messages (
  id TEXT PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL REFERENCES domain_events(id),
  topic TEXT NOT NULL,
  message_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 12 CHECK (max_attempts > 0),
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK ((locked_by IS NULL) = (locked_at IS NULL)),
  CHECK (published_at IS NULL OR dead_lettered_at IS NULL)
);

CREATE TABLE inbox_messages (
  consumer_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status inbox_processing_status NOT NULL DEFAULT 'processing',
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  result_json JSONB,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (consumer_name, event_id),
  CHECK (status <> 'completed' OR (processed_at IS NOT NULL AND result_json IS NOT NULL))
);

CREATE FUNCTION protect_command_identity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.idempotency_key <> OLD.idempotency_key
     OR NEW.command_hash <> OLD.command_hash
     OR NEW.aggregate_type <> OLD.aggregate_type
     OR NEW.aggregate_id <> OLD.aggregate_id
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'command identity fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_outbox_payload()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.event_id <> OLD.event_id
     OR NEW.topic <> OLD.topic
     OR NEW.message_key <> OLD.message_key
     OR NEW.payload <> OLD.payload
     OR NEW.payload_hash <> OLD.payload_hash
     OR NEW.headers <> OLD.headers
     OR NEW.occurred_at <> OLD.occurred_at
     OR NEW.max_attempts <> OLD.max_attempts
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'outbox message identity and payload are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_inbox_identity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.consumer_name <> OLD.consumer_name
     OR NEW.event_id <> OLD.event_id
     OR NEW.payload_hash <> OLD.payload_hash
     OR NEW.received_at <> OLD.received_at THEN
    RAISE EXCEPTION 'inbox message identity and payload hash are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER domain_events_immutable
BEFORE UPDATE OR DELETE ON domain_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER evidence_envelopes_immutable
BEFORE UPDATE OR DELETE ON evidence_envelopes
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER credit_events_immutable
BEFORE UPDATE OR DELETE ON credit_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER command_identity_immutable
BEFORE UPDATE ON command_idempotency
FOR EACH ROW EXECUTE FUNCTION protect_command_identity();

CREATE TRIGGER outbox_payload_immutable
BEFORE UPDATE ON outbox_messages
FOR EACH ROW EXECUTE FUNCTION protect_outbox_payload();

CREATE TRIGGER inbox_identity_immutable
BEFORE UPDATE ON inbox_messages
FOR EACH ROW EXECUTE FUNCTION protect_inbox_identity();

CREATE INDEX domain_events_aggregate_idx
  ON domain_events(aggregate_type, aggregate_id, aggregate_version);
CREATE INDEX domain_events_subject_idx ON domain_events(subject_id, occurred_at);
CREATE INDEX outbox_messages_claim_idx
  ON outbox_messages(available_at, occurred_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;
CREATE INDEX outbox_messages_lease_idx
  ON outbox_messages(locked_at)
  WHERE locked_at IS NOT NULL AND published_at IS NULL AND dead_lettered_at IS NULL;
CREATE INDEX inbox_messages_status_idx ON inbox_messages(consumer_name, status, updated_at);
