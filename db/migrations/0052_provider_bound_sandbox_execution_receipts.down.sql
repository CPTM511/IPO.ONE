ALTER TABLE sandbox_execution_receipts
  DROP CONSTRAINT sandbox_execution_receipts_provider_target_check,
  DROP COLUMN purpose_code,
  DROP COLUMN provider_category,
  DROP COLUMN provider_id;
