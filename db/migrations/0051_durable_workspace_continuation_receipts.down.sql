DROP POLICY IF EXISTS workspace_continuation_receipts_tenant_isolation
  ON workspace_continuation_receipts;
DROP TRIGGER IF EXISTS guard_workspace_continuation_receipt
  ON workspace_continuation_receipts;
DROP FUNCTION IF EXISTS guard_workspace_continuation_receipt();
DROP TABLE IF EXISTS workspace_continuation_receipts;
