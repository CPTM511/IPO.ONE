ALTER TABLE sandbox_execution_receipts
  ADD COLUMN provider_id TEXT,
  ADD COLUMN provider_category TEXT,
  ADD COLUMN purpose_code TEXT,
  ADD CONSTRAINT sandbox_execution_receipts_provider_target_check CHECK (
    (provider_id IS NULL AND provider_category IS NULL AND purpose_code IS NULL)
    OR (
      provider_id ~ '^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$'
      AND provider_category ~ '^[a-z][a-z0-9_.-]{1,95}$'
      AND purpose_code ~ '^[a-z][a-z0-9_.-]{1,95}$'
    )
  );
