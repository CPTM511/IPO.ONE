-- Preserve actual repayments while explicitly balancing approved source credits.
ALTER TABLE obligations DROP CONSTRAINT obligations_amounts_valid;
ALTER TABLE obligations ADD CONSTRAINT obligations_amounts_valid CHECK (
 amount_minor>0 AND outstanding_minor>=0 AND outstanding_minor<=amount_minor
 AND accrued_fees_minor>=0 AND repaid_amount_minor>=0 AND repayment_priority>0
 AND amount_minor=outstanding_minor+repaid_amount_minor+
   CASE WHEN synthetic_fees IS NOT NULL THEN COALESCE((synthetic_fees->>'principalUnpaidCreditMinor')::NUMERIC,0) ELSE 0 END
);
ALTER TABLE obligations ADD CONSTRAINT obligations_local_source_credit_balance CHECK (
 synthetic_fees IS NULL OR ((
 COALESCE((synthetic_fees->>'principalUnpaidCreditMinor')::NUMERIC,0)>=0
 AND COALESCE((synthetic_fees->>'principalWrittenOffCreditMinor')::NUMERIC,0) BETWEEN 0 AND written_off_principal_minor
 AND COALESCE((synthetic_fees->>'feeWrittenOffCreditMinor')::NUMERIC,0) BETWEEN 0 AND written_off_fees_minor
 AND COALESCE((synthetic_fees->>'principalRefundCreditDueMinor')::NUMERIC,0)>=0
 AND (execution_status<>'executed' OR amount_minor=(synthetic_fees->>'fundedBaseMinor')::NUMERIC
   +COALESCE((synthetic_fees->>'principalUnpaidCreditMinor')::NUMERIC,0)
   +COALESCE((synthetic_fees->>'principalWrittenOffCreditMinor')::NUMERIC,0)
   +COALESCE((synthetic_fees->>'principalRefundCreditDueMinor')::NUMERIC,0))
 ) IS TRUE)
);
