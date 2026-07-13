CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'closed');
CREATE TYPE actor_type AS ENUM (
  'human',
  'agent',
  'provider',
  'risk_operator',
  'operations_operator',
  'auditor',
  'system_worker'
);
CREATE TYPE actor_status AS ENUM ('active', 'suspended', 'revoked');
CREATE TYPE membership_status AS ENUM ('active', 'suspended', 'revoked');
CREATE TYPE access_grant_status AS ENUM ('active', 'revoked', 'expired');

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  tenant_hash TEXT UNIQUE NOT NULL,
  organization_ref TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  status tenant_status NOT NULL,
  pilot_jurisdiction TEXT NOT NULL,
  legal_retention_owner_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'tenant.v1')
);

CREATE TABLE actors (
  id TEXT PRIMARY KEY,
  actor_hash TEXT UNIQUE NOT NULL,
  actor_type actor_type NOT NULL,
  external_subject_hash TEXT,
  status actor_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'actor.v1')
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  membership_hash TEXT UNIQUE NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  role_bundle TEXT NOT NULL,
  capabilities JSONB NOT NULL,
  status membership_status NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'membership.v1'),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, actor_id, role_bundle),
  CHECK (expires_at IS NULL OR expires_at > valid_from)
);

CREATE TABLE access_grants (
  id TEXT PRIMARY KEY,
  access_grant_hash TEXT UNIQUE NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  grantee_tenant_id TEXT NOT NULL REFERENCES tenants(id),
  grantee_actor_id TEXT REFERENCES actors(id),
  capability TEXT NOT NULL CHECK (
    capability IN (
      'provider_intent_delivery',
      'scoped_audit_read',
      'platform_reconciliation_read'
    )
  ),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status access_grant_status NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by_actor_id TEXT NOT NULL REFERENCES actors(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'access_grant.v1'),
  UNIQUE (tenant_id, id),
  CHECK (tenant_id <> grantee_tenant_id),
  CHECK (expires_at > valid_from),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

INSERT INTO tenants(
  id, tenant_hash, organization_ref, display_name, status,
  pilot_jurisdiction, legal_retention_owner_ref, created_at, updated_at,
  schema_version
) VALUES (
  'tenant_ipo_one_local_pilot',
  'tenant_hash_ipo_one_local_pilot',
  'org:ipo-consulting',
  'IPO.ONE Local Non-Funds Pilot',
  'active',
  'US',
  'org:ipo-consulting',
  TIMESTAMPTZ '2026-07-13T00:00:00.000Z',
  TIMESTAMPTZ '2026-07-13T00:00:00.000Z',
  'tenant.v1'
);

INSERT INTO actors(
  id, actor_hash, actor_type, external_subject_hash, status,
  created_at, updated_at, schema_version
) VALUES (
  'actor_local_system',
  'actor_hash_local_system',
  'system_worker',
  NULL,
  'active',
  TIMESTAMPTZ '2026-07-13T00:00:00.000Z',
  TIMESTAMPTZ '2026-07-13T00:00:00.000Z',
  'actor.v1'
);

INSERT INTO memberships(
  id, membership_hash, tenant_id, actor_id, role_bundle, capabilities,
  status, valid_from, expires_at, created_at, updated_at, schema_version
) VALUES (
  'membership_local_system',
  'membership_hash_local_system',
  'tenant_ipo_one_local_pilot',
  'actor_local_system',
  'system_worker',
  '["local_non_funds_repository"]'::jsonb,
  'active',
  TIMESTAMPTZ '2026-07-13T00:00:00.000Z',
  NULL,
  TIMESTAMPTZ '2026-07-13T00:00:00.000Z',
  TIMESTAMPTZ '2026-07-13T00:00:00.000Z',
  'membership.v1'
);

-- Migration 0003 intentionally left legacy subjects unvalidated while requiring
-- every subsequent write to bind a principal. Backfilling tenant ownership is
-- an UPDATE, so temporarily remove and then restore that same write-time rule.
ALTER TABLE subjects
  DROP CONSTRAINT subjects_primary_principal_required;

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
    EXECUTE format('ALTER TABLE %I ADD COLUMN tenant_id TEXT', table_name);
    EXECUTE format(
      'UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL',
      table_name,
      'tenant_ipo_one_local_pilot'
    );
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', table_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id)',
      table_name,
      table_name || '_tenant_fk'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (tenant_id, id)',
      table_name,
      table_name || '_tenant_id_id_key'
    );
  END LOOP;
END;
$$;

ALTER TABLE subjects
  ADD CONSTRAINT subjects_primary_principal_required
    CHECK (primary_principal_id IS NOT NULL) NOT VALID;

ALTER TABLE aggregate_stream_heads ADD COLUMN tenant_id TEXT;
UPDATE aggregate_stream_heads
   SET tenant_id = 'tenant_ipo_one_local_pilot'
 WHERE tenant_id IS NULL;
ALTER TABLE aggregate_stream_heads
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT aggregate_stream_heads_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id);

ALTER TABLE command_idempotency ADD COLUMN tenant_id TEXT;
UPDATE command_idempotency
   SET tenant_id = 'tenant_ipo_one_local_pilot'
 WHERE tenant_id IS NULL;
ALTER TABLE command_idempotency
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT command_idempotency_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id);

ALTER TABLE inbox_messages ADD COLUMN tenant_id TEXT;
UPDATE inbox_messages
   SET tenant_id = 'tenant_ipo_one_local_pilot'
 WHERE tenant_id IS NULL;
ALTER TABLE inbox_messages
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT inbox_messages_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id);

ALTER TABLE command_events ADD COLUMN tenant_id TEXT;
UPDATE command_events
   SET tenant_id = 'tenant_ipo_one_local_pilot'
 WHERE tenant_id IS NULL;
ALTER TABLE command_events
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT command_events_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id);

ALTER TABLE projection_registry ADD COLUMN tenant_id TEXT;
UPDATE projection_registry
   SET tenant_id = 'tenant_ipo_one_local_pilot'
 WHERE tenant_id IS NULL;
ALTER TABLE projection_registry
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT projection_registry_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- Runtime stream, command, inbox, and projection identities are tenant-scoped.
-- Leaving the pre-tenant primary keys in place would let another tenant's key
-- block a legitimate write even though RLS correctly hides the other row.
ALTER TABLE command_events
  DROP CONSTRAINT command_events_idempotency_key_fkey,
  DROP CONSTRAINT command_events_pkey;
ALTER TABLE command_idempotency
  DROP CONSTRAINT command_idempotency_pkey,
  ADD CONSTRAINT command_idempotency_pkey
    PRIMARY KEY (tenant_id, idempotency_key);
ALTER TABLE command_events
  ADD CONSTRAINT command_events_pkey
    PRIMARY KEY (tenant_id, idempotency_key, sequence);
ALTER TABLE aggregate_stream_heads
  DROP CONSTRAINT aggregate_stream_heads_pkey,
  ADD CONSTRAINT aggregate_stream_heads_pkey
    PRIMARY KEY (tenant_id, aggregate_type, aggregate_id);
ALTER TABLE inbox_messages
  DROP CONSTRAINT inbox_messages_pkey,
  ADD CONSTRAINT inbox_messages_pkey
    PRIMARY KEY (tenant_id, consumer_name, event_id);
ALTER TABLE projection_registry
  DROP CONSTRAINT projection_registry_pkey,
  ADD CONSTRAINT projection_registry_pkey
    PRIMARY KEY (tenant_id, entity_type, entity_id);

ALTER TABLE domain_events
  DROP CONSTRAINT domain_events_aggregate_type_aggregate_id_aggregate_version_key,
  ADD CONSTRAINT domain_events_tenant_aggregate_version_key
    UNIQUE (tenant_id, aggregate_type, aggregate_id, aggregate_version);
ALTER TABLE evidence_envelopes
  DROP CONSTRAINT evidence_envelopes_aggregate_type_aggregate_id_aggregate_ve_key,
  DROP CONSTRAINT evidence_envelopes_source_system_idempotency_key_key,
  ADD CONSTRAINT evidence_envelopes_tenant_aggregate_version_key
    UNIQUE (tenant_id, aggregate_type, aggregate_id, aggregate_version),
  ADD CONSTRAINT evidence_envelopes_tenant_source_idempotency_key
    UNIQUE (tenant_id, source_system, idempotency_key);
ALTER TABLE ledger_transactions
  DROP CONSTRAINT ledger_transactions_idempotency_key_key,
  ADD CONSTRAINT ledger_transactions_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key);
ALTER TABLE transfer_intents
  DROP CONSTRAINT transfer_intents_idempotency_key_key,
  ADD CONSTRAINT transfer_intents_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key);
ALTER TABLE transfer_quotes
  DROP CONSTRAINT transfer_quotes_idempotency_key_key,
  ADD CONSTRAINT transfer_quotes_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key);
ALTER TABLE settlement_receipts
  DROP CONSTRAINT settlement_receipts_idempotency_key_key,
  ADD CONSTRAINT settlement_receipts_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key);
ALTER TABLE projection_replay_jobs
  DROP CONSTRAINT projection_replay_jobs_idempotency_key_key,
  ADD CONSTRAINT projection_replay_jobs_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key);

ALTER TABLE subjects
  ADD CONSTRAINT subjects_tenant_principal_fk
    FOREIGN KEY (tenant_id, primary_principal_id)
    REFERENCES principals(tenant_id, id);
ALTER TABLE mandates
  ADD CONSTRAINT mandates_tenant_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  ADD CONSTRAINT mandates_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id);
ALTER TABLE mandate_reservations
  ADD CONSTRAINT mandate_reservations_tenant_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id),
  ADD CONSTRAINT mandate_reservations_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id);
ALTER TABLE mandate_releases
  ADD CONSTRAINT mandate_releases_tenant_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id),
  ADD CONSTRAINT mandate_releases_tenant_reservation_fk
    FOREIGN KEY (tenant_id, reservation_id)
    REFERENCES mandate_reservations(tenant_id, id);
ALTER TABLE account_bindings
  ADD CONSTRAINT account_bindings_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id);
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_tenant_transaction_fk
    FOREIGN KEY (tenant_id, transaction_id)
    REFERENCES ledger_transactions(tenant_id, id),
  ADD CONSTRAINT ledger_entries_tenant_account_fk
    FOREIGN KEY (tenant_id, account_id) REFERENCES ledger_accounts(tenant_id, id);
ALTER TABLE lockboxes
  ADD CONSTRAINT lockboxes_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  ADD CONSTRAINT lockboxes_tenant_account_fk
    FOREIGN KEY (tenant_id, ledger_account_id)
    REFERENCES ledger_accounts(tenant_id, id),
  ADD CONSTRAINT lockboxes_tenant_revenue_account_fk
    FOREIGN KEY (tenant_id, revenue_ledger_account_id)
    REFERENCES ledger_accounts(tenant_id, id),
  ADD CONSTRAINT lockboxes_tenant_repayment_account_fk
    FOREIGN KEY (tenant_id, repayment_ledger_account_id)
    REFERENCES ledger_accounts(tenant_id, id);
ALTER TABLE spend_policies
  ADD CONSTRAINT spend_policies_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  ADD CONSTRAINT spend_policies_tenant_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id);
ALTER TABLE spend_requests
  ADD CONSTRAINT spend_requests_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  ADD CONSTRAINT spend_requests_tenant_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id),
  ADD CONSTRAINT spend_requests_tenant_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id),
  ADD CONSTRAINT spend_requests_tenant_policy_fk
    FOREIGN KEY (tenant_id, spend_policy_id)
    REFERENCES spend_policies(tenant_id, id);
ALTER TABLE transfer_intents
  ADD CONSTRAINT transfer_intents_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  ADD CONSTRAINT transfer_intents_tenant_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id),
  ADD CONSTRAINT transfer_intents_tenant_policy_decision_fk
    FOREIGN KEY (tenant_id, policy_decision_ref)
    REFERENCES spend_requests(tenant_id, id),
  ADD CONSTRAINT transfer_intents_tenant_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id);
ALTER TABLE transfer_quotes
  ADD CONSTRAINT transfer_quotes_tenant_intent_fk
    FOREIGN KEY (tenant_id, transfer_intent_id)
    REFERENCES transfer_intents(tenant_id, id);
ALTER TABLE settlement_receipts
  ADD CONSTRAINT settlement_receipts_tenant_intent_fk
    FOREIGN KEY (tenant_id, transfer_intent_id)
    REFERENCES transfer_intents(tenant_id, id),
  ADD CONSTRAINT settlement_receipts_tenant_quote_fk
    FOREIGN KEY (tenant_id, transfer_quote_id)
    REFERENCES transfer_quotes(tenant_id, id);
ALTER TABLE obligations
  ADD CONSTRAINT obligations_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  ADD CONSTRAINT obligations_tenant_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  ADD CONSTRAINT obligations_tenant_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id),
  ADD CONSTRAINT obligations_tenant_policy_fk
    FOREIGN KEY (tenant_id, spend_policy_id)
    REFERENCES spend_policies(tenant_id, id);
ALTER TABLE credit_lines
  ADD CONSTRAINT credit_lines_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  ADD CONSTRAINT credit_lines_tenant_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id);
ALTER TABLE repayment_events
  ADD CONSTRAINT repayment_events_tenant_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  ADD CONSTRAINT repayment_events_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id);
ALTER TABLE credit_profiles
  ADD CONSTRAINT credit_profiles_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id);
ALTER TABLE reputation_signals
  ADD CONSTRAINT reputation_signals_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id);
ALTER TABLE behavioral_metrics
  ADD CONSTRAINT behavioral_metrics_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id);
ALTER TABLE credit_learning_events
  ADD CONSTRAINT credit_learning_events_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id);
ALTER TABLE risk_decisions
  ADD CONSTRAINT risk_decisions_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  ADD CONSTRAINT risk_decisions_tenant_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id);
ALTER TABLE command_idempotency
  ADD CONSTRAINT command_idempotency_tenant_event_fk
    FOREIGN KEY (tenant_id, event_id) REFERENCES domain_events(tenant_id, id);
ALTER TABLE outbox_messages
  ADD CONSTRAINT outbox_messages_tenant_event_fk
    FOREIGN KEY (tenant_id, event_id) REFERENCES domain_events(tenant_id, id);
ALTER TABLE command_events
  ADD CONSTRAINT command_events_tenant_command_fk
    FOREIGN KEY (tenant_id, idempotency_key)
    REFERENCES command_idempotency(tenant_id, idempotency_key),
  ADD CONSTRAINT command_events_tenant_event_fk
    FOREIGN KEY (tenant_id, event_id) REFERENCES domain_events(tenant_id, id);
ALTER TABLE projection_registry
  ADD CONSTRAINT projection_registry_tenant_event_fk
    FOREIGN KEY (tenant_id, last_event_id) REFERENCES domain_events(tenant_id, id);
ALTER TABLE projection_snapshots
  ADD CONSTRAINT projection_snapshots_tenant_event_fk
    FOREIGN KEY (tenant_id, source_event_id)
    REFERENCES domain_events(tenant_id, id);
ALTER TABLE reconciliation_runs
  ADD CONSTRAINT reconciliation_runs_tenant_evidence_fk
    FOREIGN KEY (tenant_id, evidence_event_id)
    REFERENCES domain_events(tenant_id, id);
ALTER TABLE reconciliation_discrepancies
  ADD CONSTRAINT reconciliation_discrepancies_tenant_run_fk
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES reconciliation_runs(tenant_id, id),
  ADD CONSTRAINT reconciliation_discrepancies_tenant_evidence_fk
    FOREIGN KEY (tenant_id, evidence_event_id)
    REFERENCES domain_events(tenant_id, id),
  ADD CONSTRAINT reconciliation_discrepancies_tenant_resolution_fk
    FOREIGN KEY (tenant_id, resolution_event_id)
    REFERENCES domain_events(tenant_id, id);
ALTER TABLE projection_replay_jobs
  ADD CONSTRAINT projection_replay_jobs_tenant_snapshot_fk
    FOREIGN KEY (tenant_id, source_snapshot_id)
    REFERENCES projection_snapshots(tenant_id, id),
  ADD CONSTRAINT projection_replay_jobs_tenant_repair_event_fk
    FOREIGN KEY (tenant_id, repair_event_id)
    REFERENCES domain_events(tenant_id, id);

CREATE FUNCTION current_app_tenant_id()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')
$$ LANGUAGE SQL STABLE PARALLEL SAFE;

CREATE FUNCTION current_app_actor_id()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.actor_id', true), '')
$$ LANGUAGE SQL STABLE PARALLEL SAFE;

CREATE FUNCTION current_app_policy_version()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.policy_version', true), '')
$$ LANGUAGE SQL STABLE PARALLEL SAFE;

CREATE FUNCTION enforce_tenant_context()
RETURNS TRIGGER AS $$
DECLARE
  active_tenant_id TEXT := current_app_tenant_id();
BEGIN
  IF active_tenant_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'tenant transaction context is required';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := active_tenant_id;
    ELSIF NEW.tenant_id <> active_tenant_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'tenant write does not match transaction context';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.tenant_id <> active_tenant_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'tenant mutation does not match transaction context';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id <> OLD.tenant_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'tenant ownership is immutable';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

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

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self_select ON tenants
  FOR SELECT USING (id = current_app_tenant_id());
CREATE POLICY tenant_self_update ON tenants
  FOR UPDATE
  USING (id = current_app_tenant_id())
  WITH CHECK (id = current_app_tenant_id());

ALTER TABLE actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE actors FORCE ROW LEVEL SECURITY;
CREATE POLICY actor_membership_select ON actors
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM memberships m
       WHERE m.actor_id = actors.id
         AND m.tenant_id = current_app_tenant_id()
         AND m.status = 'active'
         AND m.valid_from <= clock_timestamp()
         AND (m.expires_at IS NULL OR m.expires_at > clock_timestamp())
    )
  );

ALTER TABLE access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY access_grants_participant_select ON access_grants
  FOR SELECT USING (
    tenant_id = current_app_tenant_id()
    OR grantee_tenant_id = current_app_tenant_id()
  );
CREATE POLICY access_grants_owner_insert ON access_grants
  FOR INSERT WITH CHECK (tenant_id = current_app_tenant_id());
CREATE POLICY access_grants_owner_update ON access_grants
  FOR UPDATE
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE POLICY access_grants_owner_delete ON access_grants
  FOR DELETE USING (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_access_grants
BEFORE INSERT OR UPDATE OR DELETE ON access_grants
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX memberships_tenant_actor_status_idx
  ON memberships(tenant_id, actor_id, status, expires_at);
CREATE INDEX access_grants_owner_resource_idx
  ON access_grants(tenant_id, resource_type, resource_id, status, expires_at);
CREATE INDEX access_grants_grantee_idx
  ON access_grants(grantee_tenant_id, grantee_actor_id, status, expires_at);
