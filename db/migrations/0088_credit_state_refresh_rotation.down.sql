DROP INDEX IF EXISTS subjects_tenant_credit_refresh_idx;
ALTER TABLE subjects
  DROP COLUMN credit_state_refresh_error,
  DROP COLUMN credit_state_refreshed_at;
