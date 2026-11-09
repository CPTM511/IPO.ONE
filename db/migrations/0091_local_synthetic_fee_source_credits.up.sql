-- B4-F1: approved L0 source corrections; old facts and report policy remain immutable.
CREATE TABLE synthetic_fee_source_corrections (
 tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id(), id TEXT NOT NULL,
 obligation_id TEXT NOT NULL, original_fee_entry_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('borrower','institution')),
 amount_minor NUMERIC(78,0) NOT NULL CHECK(amount_minor>0),
 approval_execution_id TEXT NOT NULL,
 source_ledger_transaction_id TEXT NOT NULL,
 fee_ledger_transaction_id TEXT,
 document JSONB NOT NULL, PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,approval_execution_id),
 FOREIGN KEY(tenant_id,obligation_id) REFERENCES obligations(tenant_id,id),
 FOREIGN KEY(tenant_id,original_fee_entry_id) REFERENCES synthetic_fee_entries(tenant_id,id),
 FOREIGN KEY(tenant_id,approval_execution_id) REFERENCES approval_executions(tenant_id,id),
 FOREIGN KEY(tenant_id,source_ledger_transaction_id) REFERENCES ledger_transactions(tenant_id,id),
 FOREIGN KEY(tenant_id,fee_ledger_transaction_id) REFERENCES ledger_transactions(tenant_id,id),
 CHECK((document->>'receiptId'=id AND document->>'receiptHash'=id
  AND document->>'obligationId'=obligation_id AND document->>'sourceFeeEntryId'=original_fee_entry_id
  AND document->>'kind'=kind AND (document->>'amountMinor')::NUMERIC=amount_minor
  AND document->>'approvalExecutionId'=approval_execution_id
  AND document->>'scope'='L0_LOCAL_NO_FUNDS' AND document->>'profile'='synthetic_usd_platform_fee.v1'
  AND document->>'syntheticOnly'='true' AND document->>'productionFundsMoved'='false'
  AND document->>'refundStatus'='credit_due_only'
  AND document->'chainTransactionHash'='null'::jsonb
  AND document->>'sourcePolicyHash'='0xc0d300f7395703cb64ba198d4d6d97d02e3aaaf33c4f10cd59559b8224b4939d') IS TRUE)
);
ALTER TABLE synthetic_fee_source_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_fee_source_corrections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_synthetic_fee_source_corrections ON synthetic_fee_source_corrections
 USING(tenant_id=current_app_tenant_id()) WITH CHECK(tenant_id=current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_synthetic_fee_source_corrections
 BEFORE INSERT OR UPDATE OR DELETE ON synthetic_fee_source_corrections
 FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();
CREATE TRIGGER synthetic_fee_source_corrections_immutable BEFORE UPDATE OR DELETE ON synthetic_fee_source_corrections
 FOR EACH ROW EXECUTE FUNCTION guard_local_synthetic_fee_fact();
CREATE INDEX synthetic_fee_source_corrections_source_idx
 ON synthetic_fee_source_corrections(tenant_id,original_fee_entry_id);

ALTER TABLE credit_outcomes ADD COLUMN synthetic_fee_credit_context JSONB;
ALTER TABLE credit_outcomes ADD CONSTRAINT credit_outcomes_local_synthetic_fee_credit_context CHECK (
 synthetic_fee_credit_context IS NULL OR ((
  synthetic_fee_credit_context->>'schemaVersion'='synthetic_fee_credit_context.v1'
  AND synthetic_fee_credit_context->>'scope'='L0_LOCAL_NO_FUNDS'
  AND synthetic_fee_credit_context->>'syntheticOnly'='true'
  AND synthetic_fee_credit_context->>'productionFundsMoved'='false'
  AND synthetic_fee_credit_context->>'feeStateHash' ~ '^0x[0-9a-f]{64}$'
  AND (synthetic_fee_credit_context->>'effectivePrincipalMinor')::NUMERIC>=0
  AND (synthetic_fee_credit_context->>'netRepaidMinor')::NUMERIC>=0
  AND (synthetic_fee_credit_context->>'netLossMinor')::NUMERIC>=0
 ) IS TRUE)
);
CREATE FUNCTION guard_credit_outcome_synthetic_fee_context() RETURNS TRIGGER AS $$
BEGIN
 IF NEW.synthetic_fee_credit_context IS DISTINCT FROM OLD.synthetic_fee_credit_context THEN
  RAISE EXCEPTION 'Credit Outcome adjustment context is immutable';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER credit_outcome_synthetic_fee_context_immutable BEFORE UPDATE ON credit_outcomes
 FOR EACH ROW EXECUTE FUNCTION guard_credit_outcome_synthetic_fee_context();
