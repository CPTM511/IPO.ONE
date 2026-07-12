ALTER TABLE principals
  ADD COLUMN legal_entity_ref TEXT,
  ADD COLUMN responsibility_scope TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'principal.v1';

ALTER TABLE subjects
  ADD COLUMN primary_principal_id TEXT REFERENCES principals(id),
  ADD COLUMN risk_tier TEXT NOT NULL DEFAULT 'unrated',
  ADD COLUMN prototype_only BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'subject.v1',
  ADD CONSTRAINT subjects_primary_principal_required
    CHECK (primary_principal_id IS NOT NULL) NOT VALID;

ALTER TABLE account_bindings
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'primary',
  ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'verified_signature',
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'account_binding.v1',
  ADD CONSTRAINT account_bindings_account_hash_unique UNIQUE(account_hash);

ALTER TABLE mandates
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'mandate.v2';

ALTER TABLE mandate_reservations
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'mandate_reservation.v1';

CREATE TABLE mandate_releases (
  id TEXT PRIMARY KEY,
  release_hash TEXT UNIQUE NOT NULL,
  mandate_id TEXT NOT NULL REFERENCES mandates(id),
  reservation_id TEXT NOT NULL REFERENCES mandate_reservations(id),
  amount_minor NUMERIC(78,0) NOT NULL CHECK (amount_minor > 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'mandate_release.v1')
);

ALTER TABLE ledger_accounts
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'ledger_account.v1';

ALTER TABLE ledger_transactions
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'ledger_transaction.v1';

ALTER TABLE ledger_entries
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'ledger_entry.v1';

ALTER TABLE lockboxes
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'lockbox.v1';

ALTER TABLE providers
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'provider.v1';

ALTER TABLE spend_policies
  ADD COLUMN category TEXT NOT NULL DEFAULT 'model_api',
  ADD COLUMN daily_spent_minor NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN daily_spent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'spend_policy.v1',
  ADD CONSTRAINT spend_policies_amounts_valid CHECK (
    per_tx_limit_minor > 0
    AND daily_limit_minor > 0
    AND obligation_cap_minor > 0
    AND daily_spent_minor >= 0
    AND per_tx_limit_minor <= daily_limit_minor
    AND daily_spent_minor <= daily_limit_minor
  );

ALTER TABLE spend_requests
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'spend_request.v1';

ALTER TABLE obligations
  ADD COLUMN accrued_fees_minor NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN repaid_amount_minor NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN repayment_priority INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN attestation_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN chain_executions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'obligation.v1';

UPDATE obligations
   SET repaid_amount_minor = amount_minor - outstanding_minor
 WHERE outstanding_minor BETWEEN 0 AND amount_minor;

ALTER TABLE obligations
  ADD CONSTRAINT obligations_amounts_valid CHECK (
    amount_minor > 0
    AND outstanding_minor >= 0
    AND outstanding_minor <= amount_minor
    AND accrued_fees_minor >= 0
    AND repaid_amount_minor >= 0
    AND amount_minor = outstanding_minor + repaid_amount_minor
    AND repayment_priority > 0
  );

ALTER TABLE credit_lines
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'credit_line.v1',
  ADD CONSTRAINT credit_lines_subject_asset_unique UNIQUE(subject_id, asset_id),
  ADD CONSTRAINT credit_lines_amounts_valid CHECK (
    limit_minor >= 0
    AND utilized_minor >= 0
    AND utilized_minor <= limit_minor
  );

ALTER TABLE repayment_events
  ADD COLUMN remaining_minor NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'repayment.v1',
  ADD CONSTRAINT repayment_events_amounts_valid CHECK (
    amount_minor > 0 AND remaining_minor >= 0
  );

ALTER TABLE admin_actions
  ADD COLUMN payload_hash TEXT NOT NULL DEFAULT 'legacy:none',
  ADD COLUMN payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'admin_action.v1';

ALTER TABLE command_idempotency
  ADD COLUMN response_hash TEXT NOT NULL DEFAULT 'legacy:unverified';

CREATE TABLE risk_decisions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  mandate_id TEXT NOT NULL REFERENCES mandates(id),
  asset_id TEXT NOT NULL,
  status TEXT NOT NULL,
  model_version TEXT NOT NULL,
  limit_minor NUMERIC(78,0) NOT NULL CHECK (limit_minor >= 0),
  utilization_minor NUMERIC(78,0) NOT NULL CHECK (utilization_minor >= 0),
  action TEXT NOT NULL,
  reasons JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'risk_decision.v1'),
  CHECK (utilization_minor <= limit_minor OR status <> 'approved')
);

CREATE TABLE command_events (
  idempotency_key TEXT NOT NULL REFERENCES command_idempotency(idempotency_key),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  event_id TEXT UNIQUE NOT NULL REFERENCES domain_events(id),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version > 0),
  PRIMARY KEY(idempotency_key, sequence)
);

CREATE TABLE projection_registry (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_hash TEXT NOT NULL,
  root_aggregate_type TEXT NOT NULL,
  root_aggregate_id TEXT NOT NULL,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version > 0),
  last_event_id TEXT NOT NULL REFERENCES domain_events(id),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(entity_type, entity_id)
);

CREATE TABLE projection_snapshots (
  id TEXT PRIMARY KEY,
  write_sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_hash TEXT NOT NULL,
  root_aggregate_type TEXT NOT NULL,
  root_aggregate_id TEXT NOT NULL,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version > 0),
  source_event_id TEXT NOT NULL REFERENCES domain_events(id),
  payload JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  UNIQUE(source_event_id, entity_type, entity_id)
);

INSERT INTO command_events(
  idempotency_key, sequence, event_id, aggregate_type, aggregate_id, aggregate_version
)
SELECT
  c.idempotency_key,
  0,
  d.id,
  d.aggregate_type,
  d.aggregate_id,
  d.aggregate_version
FROM command_idempotency c
JOIN domain_events d ON d.id = c.event_id
WHERE c.status = 'completed'
ON CONFLICT DO NOTHING;

CREATE TRIGGER command_events_immutable
BEFORE UPDATE OR DELETE ON command_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER projection_snapshots_immutable
BEFORE UPDATE OR DELETE ON projection_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE INDEX command_events_event_idx ON command_events(event_id);
CREATE INDEX mandate_releases_reservation_idx ON mandate_releases(reservation_id, created_at);
CREATE INDEX projection_registry_root_idx
  ON projection_registry(root_aggregate_type, root_aggregate_id, aggregate_version);
CREATE INDEX projection_registry_event_idx ON projection_registry(last_event_id);
CREATE INDEX projection_snapshots_entity_idx
  ON projection_snapshots(entity_type, entity_id, write_sequence DESC);
CREATE INDEX obligations_subject_status_idx ON obligations(subject_id, status);
CREATE INDEX credit_lines_subject_status_idx ON credit_lines(subject_id, status);
CREATE INDEX risk_decisions_subject_created_idx ON risk_decisions(subject_id, created_at);
