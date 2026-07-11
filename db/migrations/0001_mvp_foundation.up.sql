CREATE TYPE subject_type AS ENUM ('agent', 'human', 'org', 'originator');
CREATE TYPE subject_status AS ENUM ('pending', 'active', 'suspended', 'closed');
CREATE TYPE lockbox_status AS ENUM ('created', 'active', 'frozen', 'closed');
CREATE TYPE mandate_status AS ENUM ('draft', 'active', 'suspended', 'revoked', 'expired');
CREATE TYPE ledger_account_status AS ENUM ('active', 'frozen', 'closed');
CREATE TYPE ledger_entry_direction AS ENUM ('debit', 'credit');
CREATE TYPE plugin_status AS ENUM ('pending', 'active', 'suspended', 'revoked');
CREATE TYPE obligation_status AS ENUM (
  'created',
  'active',
  'partially_repaid',
  'fully_repaid',
  'overdue',
  'defaulted',
  'closed',
  'kyc_pending',
  'approved_by_originator',
  'grace_period',
  'dpd_1_30',
  'dpd_31_60',
  'dpd_61_90',
  'restructured',
  'repurchased',
  'written_off'
);
CREATE TYPE spend_request_status AS ENUM ('requested', 'approved', 'rejected', 'settled', 'failed');
CREATE TYPE rail_kind AS ENUM ('web2', 'web3', 'hybrid');
CREATE TYPE transfer_direction AS ENUM ('on_ramp', 'off_ramp', 'native');
CREATE TYPE transfer_intent_status AS ENUM (
  'created',
  'quoted',
  'authorized',
  'submitted',
  'pending',
  'settled',
  'failed',
  'reversed',
  'expired'
);
CREATE TYPE settlement_outcome AS ENUM ('succeeded', 'failed', 'reversed');
CREATE TYPE settlement_finality AS ENUM ('pending', 'confirmed', 'finalized');

CREATE TABLE subjects (
  id TEXT PRIMARY KEY,
  subject_hash TEXT UNIQUE NOT NULL,
  subject_type subject_type NOT NULL,
  status subject_status NOT NULL,
  display_name TEXT NOT NULL,
  metadata_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE principals (
  id TEXT PRIMARY KEY,
  principal_hash TEXT UNIQUE NOT NULL,
  principal_type TEXT NOT NULL,
  jurisdiction TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE mandates (
  id TEXT PRIMARY KEY,
  mandate_hash TEXT UNIQUE NOT NULL,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  capabilities JSONB NOT NULL,
  allowed_provider_ids JSONB NOT NULL,
  allowed_categories JSONB NOT NULL,
  asset_ids JSONB NOT NULL,
  per_action_limit_minor NUMERIC(78,0) NOT NULL CHECK (per_action_limit_minor > 0),
  aggregate_limit_minor NUMERIC(78,0) NOT NULL CHECK (aggregate_limit_minor > 0),
  utilized_minor NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (utilized_minor >= 0),
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  nonce TEXT NOT NULL,
  terms_ref TEXT NOT NULL,
  status mandate_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(principal_id, nonce),
  CHECK (expires_at > valid_from),
  CHECK (per_action_limit_minor <= aggregate_limit_minor),
  CHECK (utilized_minor <= aggregate_limit_minor)
);

CREATE TABLE mandate_reservations (
  id TEXT PRIMARY KEY,
  reservation_hash TEXT UNIQUE NOT NULL,
  mandate_id TEXT NOT NULL REFERENCES mandates(id),
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  capability TEXT NOT NULL,
  provider_id TEXT,
  category TEXT,
  asset_id TEXT NOT NULL,
  amount_minor NUMERIC(78,0) NOT NULL CHECK (amount_minor > 0),
  released_minor NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (released_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (released_minor <= amount_minor)
);

CREATE TABLE account_bindings (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  account_hash TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  signature_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  UNIQUE(subject_id, account_hash)
);

CREATE TABLE plugin_manifests (
  id TEXT PRIMARY KEY,
  manifest_hash TEXT UNIQUE NOT NULL,
  plugin_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  publisher_id TEXT NOT NULL,
  plugin_type TEXT NOT NULL,
  capabilities JSONB NOT NULL,
  supported_schema_versions JSONB NOT NULL,
  jurisdictions JSONB NOT NULL,
  data_classes JSONB NOT NULL,
  required_inputs JSONB NOT NULL,
  produced_attestation_types JSONB NOT NULL,
  endpoint TEXT NOT NULL,
  auth_method TEXT NOT NULL,
  failure_policy TEXT NOT NULL CHECK (failure_policy IN ('fail_closed', 'queue_for_review', 'deny_and_alert')),
  sandbox_only BOOLEAN NOT NULL,
  service_version TEXT NOT NULL,
  terms_ref TEXT NOT NULL,
  status plugin_status NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(publisher_id, plugin_key, service_version)
);

CREATE TABLE rail_adapters (
  id TEXT PRIMARY KEY,
  descriptor_hash TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  rail_kind rail_kind NOT NULL,
  directions JSONB NOT NULL,
  source_assets JSONB NOT NULL,
  destination_assets JSONB NOT NULL,
  finality_model TEXT NOT NULL CHECK (finality_model IN ('instant', 'async', 'chain')),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  adapter_version TEXT NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'rail_descriptor.v2'),
  UNIQUE(id, adapter_version)
);

CREATE TABLE ledger_accounts (
  id TEXT PRIMARY KEY,
  account_hash TEXT UNIQUE NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  account_type TEXT NOT NULL,
  normal_side ledger_entry_direction NOT NULL,
  status ledger_account_status NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  UNIQUE(owner_type, owner_id, asset_id, account_type)
);

CREATE TABLE ledger_transactions (
  id TEXT PRIMARY KEY,
  transaction_hash TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  transaction_type TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  metadata JSONB NOT NULL,
  metadata_hash TEXT NOT NULL,
  debit_total_minor NUMERIC(78,0) NOT NULL CHECK (debit_total_minor > 0),
  credit_total_minor NUMERIC(78,0) NOT NULL CHECK (credit_total_minor > 0),
  entry_count INTEGER NOT NULL CHECK (entry_count >= 2),
  posted_at TIMESTAMPTZ NOT NULL,
  CHECK (debit_total_minor = credit_total_minor)
);

CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id),
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  direction ledger_entry_direction NOT NULL,
  amount_minor NUMERIC(78,0) NOT NULL CHECK (amount_minor > 0),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  posted_at TIMESTAMPTZ NOT NULL,
  UNIQUE(transaction_id, account_id),
  UNIQUE(transaction_id, sequence)
);

CREATE TABLE lockboxes (
  id TEXT PRIMARY KEY,
  lockbox_hash TEXT UNIQUE NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  chain_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  ledger_account_id TEXT UNIQUE NOT NULL REFERENCES ledger_accounts(id),
  revenue_ledger_account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  repayment_ledger_account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  status lockbox_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  provider_hash TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  settlement_account_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_tier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE spend_policies (
  id TEXT PRIMARY KEY,
  policy_hash TEXT UNIQUE NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  asset_id TEXT NOT NULL,
  per_tx_limit_minor NUMERIC(78,0) NOT NULL,
  daily_limit_minor NUMERIC(78,0) NOT NULL,
  obligation_cap_minor NUMERIC(78,0) NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE spend_requests (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  mandate_id TEXT NOT NULL REFERENCES mandates(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  spend_policy_id TEXT NOT NULL REFERENCES spend_policies(id),
  asset_id TEXT NOT NULL,
  amount_minor NUMERIC(78,0) NOT NULL CHECK (amount_minor > 0),
  purpose_code TEXT NOT NULL,
  status spend_request_status NOT NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE transfer_intents (
  id TEXT PRIMARY KEY,
  transfer_intent_hash TEXT UNIQUE NOT NULL,
  request_hash TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  mandate_id TEXT NOT NULL REFERENCES mandates(id),
  policy_decision_ref TEXT NOT NULL REFERENCES spend_requests(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  purpose_code TEXT NOT NULL,
  rail_id TEXT NOT NULL REFERENCES rail_adapters(id),
  direction transfer_direction NOT NULL,
  source_asset_id TEXT NOT NULL,
  source_amount_minor NUMERIC(78,0) NOT NULL CHECK (source_amount_minor > 0),
  source_scale INTEGER NOT NULL CHECK (source_scale BETWEEN 0 AND 30),
  destination_asset_id TEXT NOT NULL,
  destination_scale INTEGER NOT NULL CHECK (destination_scale BETWEEN 0 AND 30),
  source_account_ref_hash TEXT NOT NULL,
  destination_account_ref_hash TEXT NOT NULL,
  status transfer_intent_status NOT NULL,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version > 0),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'transfer_intent.v2')
);

CREATE TABLE transfer_quotes (
  id TEXT PRIMARY KEY,
  transfer_quote_hash TEXT UNIQUE NOT NULL,
  transfer_intent_id TEXT NOT NULL REFERENCES transfer_intents(id),
  rail_id TEXT NOT NULL REFERENCES rail_adapters(id),
  source_asset_id TEXT NOT NULL,
  source_amount_minor NUMERIC(78,0) NOT NULL CHECK (source_amount_minor > 0),
  source_scale INTEGER NOT NULL CHECK (source_scale BETWEEN 0 AND 30),
  fee_asset_id TEXT NOT NULL,
  fee_amount_minor NUMERIC(78,0) NOT NULL CHECK (fee_amount_minor >= 0),
  fee_scale INTEGER NOT NULL CHECK (fee_scale BETWEEN 0 AND 30),
  destination_asset_id TEXT NOT NULL,
  destination_amount_minor NUMERIC(78,0) NOT NULL CHECK (destination_amount_minor > 0),
  destination_scale INTEGER NOT NULL CHECK (destination_scale BETWEEN 0 AND 30),
  rate_source_units NUMERIC(78,0) NOT NULL CHECK (rate_source_units > 0),
  rate_destination_units NUMERIC(78,0) NOT NULL CHECK (rate_destination_units > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'transfer_quote.v2'),
  CHECK (fee_asset_id = source_asset_id),
  CHECK (fee_scale = source_scale),
  CHECK (fee_amount_minor < source_amount_minor),
  CHECK (
    (source_amount_minor - fee_amount_minor) * rate_destination_units =
    destination_amount_minor * rate_source_units
  ),
  CHECK (expires_at > created_at)
);

CREATE TABLE settlement_receipts (
  id TEXT PRIMARY KEY,
  settlement_receipt_hash TEXT UNIQUE NOT NULL,
  transfer_intent_id TEXT NOT NULL REFERENCES transfer_intents(id),
  transfer_quote_id TEXT NOT NULL REFERENCES transfer_quotes(id),
  rail_id TEXT NOT NULL REFERENCES rail_adapters(id),
  rail_reference_hash TEXT NOT NULL,
  provider_event_id_hash TEXT UNIQUE NOT NULL,
  outcome settlement_outcome NOT NULL,
  finality settlement_finality NOT NULL,
  source_asset_id TEXT NOT NULL,
  source_amount_minor NUMERIC(78,0) NOT NULL CHECK (source_amount_minor >= 0),
  source_scale INTEGER NOT NULL CHECK (source_scale BETWEEN 0 AND 30),
  fee_asset_id TEXT NOT NULL,
  fee_amount_minor NUMERIC(78,0) NOT NULL CHECK (fee_amount_minor >= 0),
  fee_scale INTEGER NOT NULL CHECK (fee_scale BETWEEN 0 AND 30),
  destination_asset_id TEXT NOT NULL,
  destination_amount_minor NUMERIC(78,0) NOT NULL CHECK (destination_amount_minor >= 0),
  destination_scale INTEGER NOT NULL CHECK (destination_scale BETWEEN 0 AND 30),
  idempotency_key TEXT UNIQUE NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'settlement_receipt.v2'),
  CHECK (
    (outcome = 'failed' AND finality = 'finalized' AND source_amount_minor = 0 AND fee_amount_minor = 0 AND destination_amount_minor = 0)
    OR
    (outcome <> 'failed' AND source_amount_minor > 0 AND destination_amount_minor > 0)
  ),
  CHECK (outcome <> 'reversed' OR finality = 'finalized')
);

CREATE TABLE obligations (
  id TEXT PRIMARY KEY,
  obligation_hash TEXT UNIQUE NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  principal_id TEXT NOT NULL REFERENCES principals(id),
  mandate_id TEXT NOT NULL REFERENCES mandates(id),
  asset_id TEXT NOT NULL,
  amount_minor NUMERIC(78,0) NOT NULL,
  outstanding_minor NUMERIC(78,0) NOT NULL,
  spend_policy_id TEXT NOT NULL REFERENCES spend_policies(id),
  cashflow_route_id TEXT NOT NULL,
  status obligation_status NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE credit_lines (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  mandate_id TEXT NOT NULL REFERENCES mandates(id),
  asset_id TEXT NOT NULL,
  limit_minor NUMERIC(78,0) NOT NULL,
  utilized_minor NUMERIC(78,0) NOT NULL,
  status TEXT NOT NULL,
  risk_snapshot_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE repayment_events (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL REFERENCES obligations(id),
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  amount_minor NUMERIC(78,0) NOT NULL,
  asset_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE credit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  subject_id TEXT,
  obligation_id TEXT,
  payload_hash TEXT NOT NULL,
  payload_ref TEXT,
  finality_status TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE evidence_envelopes (
  id TEXT PRIMARY KEY,
  evidence_hash TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version > 0),
  subject_id TEXT,
  obligation_id TEXT,
  causation_id TEXT,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_ref TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_finality TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_ref TEXT,
  payload JSONB NOT NULL,
  attestation_refs JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'evidence_event.v2'),
  UNIQUE(aggregate_type, aggregate_id, aggregate_version),
  UNIQUE(source_system, idempotency_key)
);

CREATE TABLE admin_actions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE credit_profiles (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  current_score INTEGER NOT NULL,
  risk_tier TEXT NOT NULL,
  current_credit_limit_minor NUMERIC(78,0) NOT NULL,
  recommended_next_credit_limit_minor NUMERIC(78,0) NOT NULL,
  current_demo_interest_rate_bps INTEGER,
  recommended_demo_interest_rate_bps INTEGER,
  repayment_performance_bps INTEGER NOT NULL,
  utilization_behavior_bps INTEGER NOT NULL,
  revenue_consistency_bps INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE reputation_signals (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  signal_type TEXT NOT NULL,
  score_delta INTEGER NOT NULL,
  previous_score INTEGER NOT NULL,
  new_score INTEGER NOT NULL,
  reason_code TEXT NOT NULL,
  related_event_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE behavioral_metrics (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  metric_type TEXT NOT NULL,
  value INTEGER NOT NULL,
  unit TEXT NOT NULL,
  cycle_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE credit_learning_events (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  cycle_type TEXT NOT NULL,
  score INTEGER NOT NULL,
  risk_tier TEXT NOT NULL,
  reason_codes JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE FUNCTION enforce_balanced_ledger_transaction()
RETURNS TRIGGER AS $$
DECLARE
  declared_entry_count INTEGER;
  declared_debit_total NUMERIC(78,0);
  declared_credit_total NUMERIC(78,0);
  actual_entry_count INTEGER;
  actual_debit_total NUMERIC(78,0);
  actual_credit_total NUMERIC(78,0);
  mismatched_asset_count INTEGER;
BEGIN
  SELECT entry_count, debit_total_minor, credit_total_minor
    INTO declared_entry_count, declared_debit_total, declared_credit_total
    FROM ledger_transactions
   WHERE id = NEW.transaction_id;

  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN le.direction = 'debit' THEN le.amount_minor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN le.direction = 'credit' THEN le.amount_minor ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE la.asset_id <> lt.asset_id)
    INTO actual_entry_count, actual_debit_total, actual_credit_total, mismatched_asset_count
    FROM ledger_entries le
    JOIN ledger_accounts la ON la.id = le.account_id
    JOIN ledger_transactions lt ON lt.id = le.transaction_id
   WHERE le.transaction_id = NEW.transaction_id;

  IF actual_entry_count <> declared_entry_count
     OR actual_entry_count < 2
     OR actual_debit_total <> actual_credit_total
     OR actual_debit_total <> declared_debit_total
     OR actual_credit_total <> declared_credit_total
     OR mismatched_asset_count > 0 THEN
    RAISE EXCEPTION 'unbalanced or invalid ledger transaction %', NEW.transaction_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_transaction_balance_guard
AFTER INSERT ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_balanced_ledger_transaction();

CREATE FUNCTION reject_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'append-only rows cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE FUNCTION enforce_settlement_receipt_quote()
RETURNS TRIGGER AS $$
DECLARE
  quote_row transfer_quotes%ROWTYPE;
BEGIN
  SELECT * INTO quote_row FROM transfer_quotes WHERE id = NEW.transfer_quote_id;

  IF quote_row.transfer_intent_id <> NEW.transfer_intent_id
     OR quote_row.rail_id <> NEW.rail_id THEN
    RAISE EXCEPTION 'settlement receipt references a mismatched intent, quote, or rail';
  END IF;

  IF NEW.outcome <> 'failed' AND (
    quote_row.source_asset_id <> NEW.source_asset_id
    OR quote_row.source_amount_minor <> NEW.source_amount_minor
    OR quote_row.source_scale <> NEW.source_scale
    OR quote_row.fee_asset_id <> NEW.fee_asset_id
    OR quote_row.fee_amount_minor <> NEW.fee_amount_minor
    OR quote_row.fee_scale <> NEW.fee_scale
    OR quote_row.destination_asset_id <> NEW.destination_asset_id
    OR quote_row.destination_amount_minor <> NEW.destination_amount_minor
    OR quote_row.destination_scale <> NEW.destination_scale
  ) THEN
    RAISE EXCEPTION 'settlement receipt amounts do not match accepted quote %', NEW.transfer_quote_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settlement_receipt_quote_guard
BEFORE INSERT ON settlement_receipts
FOR EACH ROW EXECUTE FUNCTION enforce_settlement_receipt_quote();

CREATE TRIGGER transfer_quotes_immutable
BEFORE UPDATE OR DELETE ON transfer_quotes
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER settlement_receipts_immutable
BEFORE UPDATE OR DELETE ON settlement_receipts
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE INDEX evidence_envelopes_aggregate_idx
  ON evidence_envelopes(aggregate_type, aggregate_id, aggregate_version);
CREATE INDEX ledger_entries_account_idx ON ledger_entries(account_id, posted_at);
CREATE INDEX mandates_subject_status_idx ON mandates(subject_id, status);
CREATE INDEX transfer_intents_subject_status_idx ON transfer_intents(subject_id, status);
CREATE INDEX transfer_intents_policy_decision_idx ON transfer_intents(policy_decision_ref);
CREATE INDEX settlement_receipts_intent_idx ON settlement_receipts(transfer_intent_id, occurred_at);
