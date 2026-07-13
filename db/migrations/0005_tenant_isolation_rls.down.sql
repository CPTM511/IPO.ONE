DROP INDEX IF EXISTS access_grants_grantee_idx;
DROP INDEX IF EXISTS access_grants_owner_resource_idx;
DROP INDEX IF EXISTS memberships_tenant_actor_status_idx;

DROP TRIGGER IF EXISTS tenant_context_guard_access_grants ON access_grants;
DROP POLICY IF EXISTS access_grants_owner_delete ON access_grants;
DROP POLICY IF EXISTS access_grants_owner_update ON access_grants;
DROP POLICY IF EXISTS access_grants_owner_insert ON access_grants;
DROP POLICY IF EXISTS access_grants_participant_select ON access_grants;
ALTER TABLE access_grants DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS actor_membership_select ON actors;
ALTER TABLE actors DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self_update ON tenants;
DROP POLICY IF EXISTS tenant_self_select ON tenants;
ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
  tenant_tables CONSTANT TEXT[] := ARRAY[
    'memberships', 'subjects', 'principals', 'mandates',
    'mandate_reservations', 'mandate_releases', 'account_bindings',
    'ledger_accounts', 'ledger_transactions', 'ledger_entries', 'lockboxes',
    'providers', 'spend_policies', 'spend_requests', 'transfer_intents',
    'transfer_quotes', 'settlement_receipts', 'obligations', 'credit_lines',
    'repayment_events', 'credit_events', 'evidence_envelopes', 'admin_actions',
    'credit_profiles', 'reputation_signals', 'behavioral_metrics',
    'credit_learning_events', 'aggregate_stream_heads', 'domain_events',
    'command_idempotency', 'outbox_messages', 'inbox_messages', 'risk_decisions',
    'command_events', 'projection_registry', 'projection_snapshots',
    'reconciliation_runs', 'reconciliation_discrepancies',
    'projection_replay_jobs'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'tenant_context_guard_' || table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation_' || table_name, table_name);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END;
$$;

ALTER TABLE projection_replay_jobs
  DROP CONSTRAINT IF EXISTS projection_replay_jobs_tenant_repair_event_fk,
  DROP CONSTRAINT IF EXISTS projection_replay_jobs_tenant_snapshot_fk;
ALTER TABLE reconciliation_discrepancies
  DROP CONSTRAINT IF EXISTS reconciliation_discrepancies_tenant_resolution_fk,
  DROP CONSTRAINT IF EXISTS reconciliation_discrepancies_tenant_evidence_fk,
  DROP CONSTRAINT IF EXISTS reconciliation_discrepancies_tenant_run_fk;
ALTER TABLE projection_snapshots
  DROP CONSTRAINT IF EXISTS projection_snapshots_tenant_event_fk;
ALTER TABLE reconciliation_runs
  DROP CONSTRAINT IF EXISTS reconciliation_runs_tenant_evidence_fk;
ALTER TABLE projection_registry
  DROP CONSTRAINT IF EXISTS projection_registry_tenant_event_fk;
ALTER TABLE command_events
  DROP CONSTRAINT IF EXISTS command_events_tenant_event_fk,
  DROP CONSTRAINT IF EXISTS command_events_tenant_command_fk;
ALTER TABLE outbox_messages
  DROP CONSTRAINT IF EXISTS outbox_messages_tenant_event_fk;
ALTER TABLE command_idempotency
  DROP CONSTRAINT IF EXISTS command_idempotency_tenant_event_fk;
ALTER TABLE risk_decisions
  DROP CONSTRAINT IF EXISTS risk_decisions_tenant_mandate_fk,
  DROP CONSTRAINT IF EXISTS risk_decisions_tenant_subject_fk;
ALTER TABLE credit_learning_events
  DROP CONSTRAINT IF EXISTS credit_learning_events_tenant_subject_fk;
ALTER TABLE behavioral_metrics
  DROP CONSTRAINT IF EXISTS behavioral_metrics_tenant_subject_fk;
ALTER TABLE reputation_signals
  DROP CONSTRAINT IF EXISTS reputation_signals_tenant_subject_fk;
ALTER TABLE credit_profiles
  DROP CONSTRAINT IF EXISTS credit_profiles_tenant_subject_fk;
ALTER TABLE repayment_events
  DROP CONSTRAINT IF EXISTS repayment_events_tenant_subject_fk,
  DROP CONSTRAINT IF EXISTS repayment_events_tenant_obligation_fk;
ALTER TABLE credit_lines
  DROP CONSTRAINT IF EXISTS credit_lines_tenant_mandate_fk,
  DROP CONSTRAINT IF EXISTS credit_lines_tenant_subject_fk;
ALTER TABLE obligations
  DROP CONSTRAINT IF EXISTS obligations_tenant_policy_fk,
  DROP CONSTRAINT IF EXISTS obligations_tenant_mandate_fk,
  DROP CONSTRAINT IF EXISTS obligations_tenant_principal_fk,
  DROP CONSTRAINT IF EXISTS obligations_tenant_subject_fk;
ALTER TABLE settlement_receipts
  DROP CONSTRAINT IF EXISTS settlement_receipts_tenant_quote_fk,
  DROP CONSTRAINT IF EXISTS settlement_receipts_tenant_intent_fk;
ALTER TABLE transfer_quotes
  DROP CONSTRAINT IF EXISTS transfer_quotes_tenant_intent_fk;
ALTER TABLE transfer_intents
  DROP CONSTRAINT IF EXISTS transfer_intents_tenant_provider_fk,
  DROP CONSTRAINT IF EXISTS transfer_intents_tenant_policy_decision_fk,
  DROP CONSTRAINT IF EXISTS transfer_intents_tenant_mandate_fk,
  DROP CONSTRAINT IF EXISTS transfer_intents_tenant_subject_fk;
ALTER TABLE spend_requests
  DROP CONSTRAINT IF EXISTS spend_requests_tenant_policy_fk,
  DROP CONSTRAINT IF EXISTS spend_requests_tenant_provider_fk,
  DROP CONSTRAINT IF EXISTS spend_requests_tenant_mandate_fk,
  DROP CONSTRAINT IF EXISTS spend_requests_tenant_subject_fk;
ALTER TABLE spend_policies
  DROP CONSTRAINT IF EXISTS spend_policies_tenant_provider_fk,
  DROP CONSTRAINT IF EXISTS spend_policies_tenant_subject_fk;
ALTER TABLE lockboxes
  DROP CONSTRAINT IF EXISTS lockboxes_tenant_repayment_account_fk,
  DROP CONSTRAINT IF EXISTS lockboxes_tenant_revenue_account_fk,
  DROP CONSTRAINT IF EXISTS lockboxes_tenant_account_fk,
  DROP CONSTRAINT IF EXISTS lockboxes_tenant_subject_fk;
ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_tenant_account_fk,
  DROP CONSTRAINT IF EXISTS ledger_entries_tenant_transaction_fk;
ALTER TABLE account_bindings
  DROP CONSTRAINT IF EXISTS account_bindings_tenant_subject_fk;
ALTER TABLE mandate_releases
  DROP CONSTRAINT IF EXISTS mandate_releases_tenant_reservation_fk,
  DROP CONSTRAINT IF EXISTS mandate_releases_tenant_mandate_fk;
ALTER TABLE mandate_reservations
  DROP CONSTRAINT IF EXISTS mandate_reservations_tenant_subject_fk,
  DROP CONSTRAINT IF EXISTS mandate_reservations_tenant_mandate_fk;
ALTER TABLE mandates
  DROP CONSTRAINT IF EXISTS mandates_tenant_subject_fk,
  DROP CONSTRAINT IF EXISTS mandates_tenant_principal_fk;
ALTER TABLE subjects
  DROP CONSTRAINT IF EXISTS subjects_tenant_principal_fk;

-- Restore the pre-tenant runtime identities before removing tenant ownership.
-- This intentionally fails closed if multi-tenant data now contains keys that
-- cannot be represented by the old global constraints.
ALTER TABLE command_events
  DROP CONSTRAINT IF EXISTS command_events_pkey;
ALTER TABLE command_idempotency
  DROP CONSTRAINT IF EXISTS command_idempotency_pkey,
  ADD CONSTRAINT command_idempotency_pkey PRIMARY KEY (idempotency_key);
ALTER TABLE command_events
  ADD CONSTRAINT command_events_pkey PRIMARY KEY (idempotency_key, sequence),
  ADD CONSTRAINT command_events_idempotency_key_fkey
    FOREIGN KEY (idempotency_key)
    REFERENCES command_idempotency(idempotency_key);
ALTER TABLE aggregate_stream_heads
  DROP CONSTRAINT IF EXISTS aggregate_stream_heads_pkey,
  ADD CONSTRAINT aggregate_stream_heads_pkey
    PRIMARY KEY (aggregate_type, aggregate_id);
ALTER TABLE inbox_messages
  DROP CONSTRAINT IF EXISTS inbox_messages_pkey,
  ADD CONSTRAINT inbox_messages_pkey PRIMARY KEY (consumer_name, event_id);
ALTER TABLE projection_registry
  DROP CONSTRAINT IF EXISTS projection_registry_pkey,
  ADD CONSTRAINT projection_registry_pkey PRIMARY KEY (entity_type, entity_id);

ALTER TABLE domain_events
  DROP CONSTRAINT IF EXISTS domain_events_tenant_aggregate_version_key,
  ADD CONSTRAINT domain_events_aggregate_type_aggregate_id_aggregate_version_key
    UNIQUE (aggregate_type, aggregate_id, aggregate_version);
ALTER TABLE evidence_envelopes
  DROP CONSTRAINT IF EXISTS evidence_envelopes_tenant_aggregate_version_key,
  DROP CONSTRAINT IF EXISTS evidence_envelopes_tenant_source_idempotency_key,
  ADD CONSTRAINT evidence_envelopes_aggregate_type_aggregate_id_aggregate_ve_key
    UNIQUE (aggregate_type, aggregate_id, aggregate_version),
  ADD CONSTRAINT evidence_envelopes_source_system_idempotency_key_key
    UNIQUE (source_system, idempotency_key);
ALTER TABLE ledger_transactions
  DROP CONSTRAINT IF EXISTS ledger_transactions_tenant_idempotency_key,
  ADD CONSTRAINT ledger_transactions_idempotency_key_key
    UNIQUE (idempotency_key);
ALTER TABLE transfer_intents
  DROP CONSTRAINT IF EXISTS transfer_intents_tenant_idempotency_key,
  ADD CONSTRAINT transfer_intents_idempotency_key_key
    UNIQUE (idempotency_key);
ALTER TABLE transfer_quotes
  DROP CONSTRAINT IF EXISTS transfer_quotes_tenant_idempotency_key,
  ADD CONSTRAINT transfer_quotes_idempotency_key_key
    UNIQUE (idempotency_key);
ALTER TABLE settlement_receipts
  DROP CONSTRAINT IF EXISTS settlement_receipts_tenant_idempotency_key,
  ADD CONSTRAINT settlement_receipts_idempotency_key_key
    UNIQUE (idempotency_key);
ALTER TABLE projection_replay_jobs
  DROP CONSTRAINT IF EXISTS projection_replay_jobs_tenant_idempotency_key,
  ADD CONSTRAINT projection_replay_jobs_idempotency_key_key
    UNIQUE (idempotency_key);

DO $$
DECLARE
  table_name TEXT;
  tables_with_id CONSTANT TEXT[] := ARRAY[
    'subjects', 'principals', 'mandates', 'mandate_reservations',
    'mandate_releases', 'account_bindings', 'ledger_accounts',
    'ledger_transactions', 'ledger_entries', 'lockboxes', 'providers',
    'spend_policies', 'spend_requests', 'transfer_intents', 'transfer_quotes',
    'settlement_receipts', 'obligations', 'credit_lines', 'repayment_events',
    'credit_events', 'evidence_envelopes', 'admin_actions', 'credit_profiles',
    'reputation_signals', 'behavioral_metrics', 'credit_learning_events',
    'domain_events', 'outbox_messages', 'risk_decisions',
    'projection_snapshots', 'reconciliation_runs',
    'reconciliation_discrepancies', 'projection_replay_jobs'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_with_id LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', table_name, table_name || '_tenant_id_id_key');
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', table_name, table_name || '_tenant_fk');
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS tenant_id', table_name);
  END LOOP;
END;
$$;

ALTER TABLE projection_registry
  DROP CONSTRAINT IF EXISTS projection_registry_tenant_fk,
  DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE command_events
  DROP CONSTRAINT IF EXISTS command_events_tenant_fk,
  DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE inbox_messages
  DROP CONSTRAINT IF EXISTS inbox_messages_tenant_fk,
  DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE command_idempotency
  DROP CONSTRAINT IF EXISTS command_idempotency_tenant_fk,
  DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE aggregate_stream_heads
  DROP CONSTRAINT IF EXISTS aggregate_stream_heads_tenant_fk,
  DROP COLUMN IF EXISTS tenant_id;

DROP FUNCTION IF EXISTS enforce_tenant_context();
DROP FUNCTION IF EXISTS current_app_policy_version();
DROP FUNCTION IF EXISTS current_app_actor_id();
DROP FUNCTION IF EXISTS current_app_tenant_id();

DROP TABLE IF EXISTS access_grants;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS actors;
DROP TABLE IF EXISTS tenants;

DROP TYPE IF EXISTS access_grant_status;
DROP TYPE IF EXISTS membership_status;
DROP TYPE IF EXISTS actor_status;
DROP TYPE IF EXISTS actor_type;
DROP TYPE IF EXISTS tenant_status;
