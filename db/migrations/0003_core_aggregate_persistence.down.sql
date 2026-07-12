DROP INDEX IF EXISTS obligations_subject_status_idx;
DROP INDEX IF EXISTS credit_lines_subject_status_idx;

DROP TABLE IF EXISTS projection_registry;
DROP TABLE IF EXISTS projection_snapshots;
DROP TABLE IF EXISTS command_events;
DROP TABLE IF EXISTS risk_decisions;
DROP TABLE IF EXISTS mandate_releases;

ALTER TABLE command_idempotency
  DROP COLUMN IF EXISTS response_hash;

ALTER TABLE admin_actions
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS payload,
  DROP COLUMN IF EXISTS payload_hash;

ALTER TABLE repayment_events
  DROP CONSTRAINT IF EXISTS repayment_events_amounts_valid,
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS remaining_minor;

ALTER TABLE credit_lines
  DROP CONSTRAINT IF EXISTS credit_lines_amounts_valid,
  DROP CONSTRAINT IF EXISTS credit_lines_subject_asset_unique,
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE obligations
  DROP CONSTRAINT IF EXISTS obligations_amounts_valid,
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS chain_executions,
  DROP COLUMN IF EXISTS attestation_ids,
  DROP COLUMN IF EXISTS repayment_priority,
  DROP COLUMN IF EXISTS repaid_amount_minor,
  DROP COLUMN IF EXISTS accrued_fees_minor;

ALTER TABLE spend_requests
  DROP COLUMN IF EXISTS schema_version;

ALTER TABLE spend_policies
  DROP CONSTRAINT IF EXISTS spend_policies_amounts_valid,
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS daily_spent_date,
  DROP COLUMN IF EXISTS daily_spent_minor,
  DROP COLUMN IF EXISTS category;

ALTER TABLE providers
  DROP COLUMN IF EXISTS schema_version;

ALTER TABLE lockboxes
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE ledger_entries
  DROP COLUMN IF EXISTS schema_version;

ALTER TABLE ledger_transactions
  DROP COLUMN IF EXISTS schema_version;

ALTER TABLE ledger_accounts
  DROP COLUMN IF EXISTS schema_version;

ALTER TABLE mandates
  DROP COLUMN IF EXISTS schema_version;

ALTER TABLE mandate_reservations
  DROP COLUMN IF EXISTS schema_version;

ALTER TABLE account_bindings
  DROP CONSTRAINT IF EXISTS account_bindings_account_hash_unique,
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS verification_method,
  DROP COLUMN IF EXISTS purpose;

ALTER TABLE subjects
  DROP CONSTRAINT IF EXISTS subjects_primary_principal_required,
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS prototype_only,
  DROP COLUMN IF EXISTS risk_tier,
  DROP COLUMN IF EXISTS primary_principal_id;

ALTER TABLE principals
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS responsibility_scope,
  DROP COLUMN IF EXISTS legal_entity_ref;
