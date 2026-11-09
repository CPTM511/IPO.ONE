DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM obligations WHERE COALESCE((synthetic_fees->>'principalUnpaidCreditMinor')::NUMERIC,0)>0
 OR COALESCE((synthetic_fees->>'principalWrittenOffCreditMinor')::NUMERIC,0)>0
 OR COALESCE((synthetic_fees->>'principalRefundCreditDueMinor')::NUMERIC,0)>0) THEN
  RAISE EXCEPTION 'Retain principal source credits and actual payment facts; use compatible disabled runtime';
 END IF;
END $$;
ALTER TABLE obligations DROP CONSTRAINT obligations_local_source_credit_balance;
ALTER TABLE obligations DROP CONSTRAINT obligations_amounts_valid;
ALTER TABLE obligations ADD CONSTRAINT obligations_amounts_valid CHECK (
 amount_minor>0 AND outstanding_minor>=0 AND outstanding_minor<=amount_minor
 AND accrued_fees_minor>=0 AND repaid_amount_minor>=0 AND repayment_priority>0
 AND amount_minor=outstanding_minor+repaid_amount_minor
);
