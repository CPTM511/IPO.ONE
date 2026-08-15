CREATE TRIGGER tenant_context_guard_workspace_continuation_receipts
BEFORE INSERT OR UPDATE OR DELETE ON workspace_continuation_receipts
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();
