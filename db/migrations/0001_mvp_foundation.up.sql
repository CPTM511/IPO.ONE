CREATE TYPE subject_type AS ENUM ('agent', 'human', 'org', 'originator');
CREATE TYPE subject_status AS ENUM ('pending', 'active', 'suspended', 'closed');
CREATE TYPE lockbox_status AS ENUM ('created', 'active', 'frozen', 'closed');
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

CREATE TABLE subjects (
  id UUID PRIMARY KEY,
  subject_hash BYTEA UNIQUE NOT NULL,
  subject_type subject_type NOT NULL,
  status subject_status NOT NULL,
  display_name TEXT NOT NULL,
  metadata_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE principals (
  id UUID PRIMARY KEY,
  principal_hash BYTEA UNIQUE NOT NULL,
  principal_type TEXT NOT NULL,
  jurisdiction TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE account_bindings (
  id UUID PRIMARY KEY,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  account_hash BYTEA NOT NULL,
  chain_id TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  signature_hash BYTEA NOT NULL,
  nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  UNIQUE(subject_id, account_hash)
);

CREATE TABLE lockboxes (
  id UUID PRIMARY KEY,
  lockbox_hash BYTEA UNIQUE NOT NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  chain_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  status lockbox_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE providers (
  id UUID PRIMARY KEY,
  provider_hash BYTEA UNIQUE NOT NULL,
  name TEXT NOT NULL,
  settlement_account_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_tier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE spend_policies (
  id UUID PRIMARY KEY,
  policy_hash BYTEA UNIQUE NOT NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  provider_id UUID NOT NULL REFERENCES providers(id),
  asset_id TEXT NOT NULL,
  per_tx_limit_minor NUMERIC(78,0) NOT NULL,
  daily_limit_minor NUMERIC(78,0) NOT NULL,
  obligation_cap_minor NUMERIC(78,0) NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE obligations (
  id UUID PRIMARY KEY,
  obligation_hash BYTEA UNIQUE NOT NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  principal_id UUID NOT NULL REFERENCES principals(id),
  asset_id TEXT NOT NULL,
  amount_minor NUMERIC(78,0) NOT NULL,
  outstanding_minor NUMERIC(78,0) NOT NULL,
  spend_policy_id UUID NOT NULL REFERENCES spend_policies(id),
  cashflow_route_id TEXT NOT NULL,
  status obligation_status NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE credit_lines (
  id UUID PRIMARY KEY,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  asset_id TEXT NOT NULL,
  limit_minor NUMERIC(78,0) NOT NULL,
  utilized_minor NUMERIC(78,0) NOT NULL,
  status TEXT NOT NULL,
  risk_snapshot_id UUID,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE repayment_events (
  id UUID PRIMARY KEY,
  obligation_id UUID NOT NULL REFERENCES obligations(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  amount_minor NUMERIC(78,0) NOT NULL,
  asset_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE credit_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  subject_id UUID,
  obligation_id UUID,
  payload_hash BYTEA NOT NULL,
  payload_ref TEXT,
  finality_status TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE admin_actions (
  id UUID PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE credit_profiles (
  id UUID PRIMARY KEY,
  subject_id UUID NOT NULL REFERENCES subjects(id),
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
  id UUID PRIMARY KEY,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  signal_type TEXT NOT NULL,
  score_delta INTEGER NOT NULL,
  previous_score INTEGER NOT NULL,
  new_score INTEGER NOT NULL,
  reason_code TEXT NOT NULL,
  related_event_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE behavioral_metrics (
  id UUID PRIMARY KEY,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  metric_type TEXT NOT NULL,
  value INTEGER NOT NULL,
  unit TEXT NOT NULL,
  cycle_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE credit_learning_events (
  id UUID PRIMARY KEY,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  cycle_type TEXT NOT NULL,
  score INTEGER NOT NULL,
  risk_tier TEXT NOT NULL,
  reason_codes JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);
