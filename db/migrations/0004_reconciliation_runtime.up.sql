CREATE TYPE reconciliation_run_status AS ENUM ('running', 'passed', 'failed');
CREATE TYPE reconciliation_discrepancy_status AS ENUM ('open', 'resolved');
CREATE TYPE projection_replay_status AS ENUM ('planned', 'awaiting_approval', 'completed', 'failed');

CREATE TABLE reconciliation_runs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  initiated_by TEXT NOT NULL,
  release TEXT NOT NULL,
  status reconciliation_run_status NOT NULL,
  check_count INTEGER NOT NULL CHECK (check_count >= 0),
  discrepancy_count INTEGER NOT NULL CHECK (discrepancy_count >= 0),
  critical_count INTEGER NOT NULL CHECK (critical_count >= 0),
  summary JSONB NOT NULL,
  evidence_event_id TEXT UNIQUE REFERENCES domain_events(id),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  CHECK (status = 'running' OR completed_at IS NOT NULL),
  CHECK (critical_count <= discrepancy_count)
);

CREATE TABLE reconciliation_discrepancies (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES reconciliation_runs(id),
  check_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  expected_hash TEXT,
  actual_hash TEXT,
  details JSONB NOT NULL,
  evidence_event_id TEXT UNIQUE NOT NULL REFERENCES domain_events(id),
  status reconciliation_discrepancy_status NOT NULL DEFAULT 'open',
  detected_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolution_event_id TEXT REFERENCES domain_events(id),
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);

CREATE TABLE projection_replay_jobs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  request_hash TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  status projection_replay_status NOT NULL,
  source_snapshot_id TEXT REFERENCES projection_snapshots(id),
  source_hash TEXT,
  observed_hash TEXT,
  repair_event_id TEXT REFERENCES domain_events(id),
  result JSONB NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  CHECK (dry_run OR status <> 'planned')
);

CREATE INDEX reconciliation_runs_completed_idx ON reconciliation_runs(completed_at DESC, id DESC);
CREATE INDEX reconciliation_discrepancies_open_idx
  ON reconciliation_discrepancies(status, severity, detected_at, id);
CREATE INDEX projection_replay_jobs_entity_idx
  ON projection_replay_jobs(entity_type, entity_id, requested_at DESC, id DESC);
