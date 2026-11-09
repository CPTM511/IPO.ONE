-- A compatible disabled application is the rollback for existing F1 facts.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM synthetic_fee_source_corrections)
 OR EXISTS(SELECT 1 FROM credit_outcomes WHERE synthetic_fee_credit_context IS NOT NULL)
 OR EXISTS(SELECT 1 FROM obligations WHERE (synthetic_fees->>'sourceCorrectionCount')::BIGINT>0) THEN
  RAISE EXCEPTION 'B4-F1 source/credit facts exist: retain schema and use a compatible disabled runtime';
 END IF;
END $$;
DROP TABLE synthetic_fee_source_corrections;
DROP TRIGGER credit_outcome_synthetic_fee_context_immutable ON credit_outcomes;
DROP FUNCTION guard_credit_outcome_synthetic_fee_context();
ALTER TABLE credit_outcomes DROP COLUMN synthetic_fee_credit_context;
