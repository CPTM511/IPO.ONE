DROP TRIGGER IF EXISTS credit_events_immutable ON credit_events;
DROP TRIGGER IF EXISTS evidence_envelopes_immutable ON evidence_envelopes;

DROP TABLE IF EXISTS inbox_messages;
DROP TABLE IF EXISTS outbox_messages;
DROP TABLE IF EXISTS command_idempotency;
DROP TABLE IF EXISTS domain_events;
DROP TABLE IF EXISTS aggregate_stream_heads;

DROP FUNCTION IF EXISTS protect_inbox_identity();
DROP FUNCTION IF EXISTS protect_outbox_payload();
DROP FUNCTION IF EXISTS protect_command_identity();

DROP TYPE IF EXISTS inbox_processing_status;
DROP TYPE IF EXISTS command_execution_status;
