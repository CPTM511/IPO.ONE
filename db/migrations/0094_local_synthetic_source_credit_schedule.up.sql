-- F1 exact schedule adapter; retain all original immutable-economics checks.
CREATE OR REPLACE FUNCTION guard_shared_obligation_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.schema_version <> 'obligation.v2' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'shared obligations cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.obligation_hash, NEW.subject_id, NEW.principal_id,
    NEW.credit_intent_id, NEW.risk_decision_id, NEW.credit_offer_id,
    NEW.acceptance_id, NEW.authority_type, NEW.authority_ref,
    NEW.consent_id, NEW.mandate_id, NEW.asset_id, NEW.amount_minor,
    NEW.annual_rate_bps, NEW.origination_fee_minor, NEW.repayment_frequency,
    NEW.schedule_version, NEW.accepted_at, NEW.sandbox_only,
    NEW.production_funds_moved, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.obligation_hash, OLD.subject_id, OLD.principal_id,
    OLD.credit_intent_id, OLD.risk_decision_id, OLD.credit_offer_id,
    OLD.acceptance_id, OLD.authority_type, OLD.authority_ref,
    OLD.consent_id, OLD.mandate_id, OLD.asset_id, OLD.amount_minor,
    OLD.annual_rate_bps, OLD.origination_fee_minor, OLD.repayment_frequency,
    OLD.schedule_version, OLD.accepted_at, OLD.sandbox_only,
    OLD.production_funds_moved, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'shared obligation provenance and accepted economics are immutable';
  END IF;
  IF ROW(
    NEW.installment_count, NEW.first_payment_at, NEW.maturity_at,
    NEW.schedule_hash, NEW.schedule_sequence
  ) IS DISTINCT FROM ROW(
    OLD.installment_count, OLD.first_payment_at, OLD.maturity_at,
    OLD.schedule_hash, OLD.schedule_sequence
  ) AND NOT (
    NEW.status = 'restructured'
    AND NEW.servicing_classification = 'restructured'
    AND NEW.resolution_type = 'restructure'
    AND NEW.schedule_sequence = OLD.schedule_sequence + 1
  ) AND NOT (
    NEW.synthetic_fees IS NOT NULL AND OLD.synthetic_fees IS NOT NULL
    AND NEW.synthetic_fees->'terms'=OLD.synthetic_fees->'terms'
    AND NEW.schedule_sequence=OLD.schedule_sequence+1
    AND ROW(NEW.installment_count,NEW.first_payment_at,NEW.maturity_at)=ROW(OLD.installment_count,OLD.first_payment_at,OLD.maturity_at)
    AND (NEW.synthetic_fees->>'sourceCorrectionCount')::BIGINT=COALESCE((OLD.synthetic_fees->>'sourceCorrectionCount')::BIGINT,0)+1
    AND NEW.synthetic_fees->>'lastSourceCorrectionReceiptId' ~ '^0x[0-9a-f]{64}$'
    AND ((NEW.synthetic_fees->>'principalUnpaidCreditMinor')::NUMERIC>COALESCE((OLD.synthetic_fees->>'principalUnpaidCreditMinor')::NUMERIC,0)
      OR (NEW.synthetic_fees->>'borrowerAssessedMinor')::NUMERIC<(OLD.synthetic_fees->>'borrowerAssessedMinor')::NUMERIC)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Shared schedule change requires its existing restructure or exact approved local source credit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_local_source_credit_receipt() RETURNS TRIGGER AS $$
DECLARE changed BOOLEAN;
BEGIN
 IF NEW.synthetic_fees IS NULL THEN RETURN NEW; END IF;
 changed := COALESCE((NEW.synthetic_fees->>'sourceCorrectionCount')::BIGINT,0) <> COALESCE((OLD.synthetic_fees->>'sourceCorrectionCount')::BIGINT,0);
 IF changed OR ROW(NEW.synthetic_fees->'principalUnpaidCreditMinor',NEW.synthetic_fees->'principalWrittenOffCreditMinor',NEW.synthetic_fees->'principalRefundCreditDueMinor',NEW.synthetic_fees->'interestRefundCreditDueMinor',NEW.synthetic_fees->'feeWrittenOffCreditMinor',NEW.synthetic_fees->'borrowerRefundDueMinor',NEW.synthetic_fees->'institutionCreditDueMinor') IS DISTINCT FROM
   ROW(OLD.synthetic_fees->'principalUnpaidCreditMinor',OLD.synthetic_fees->'principalWrittenOffCreditMinor',OLD.synthetic_fees->'principalRefundCreditDueMinor',OLD.synthetic_fees->'interestRefundCreditDueMinor',OLD.synthetic_fees->'feeWrittenOffCreditMinor',OLD.synthetic_fees->'borrowerRefundDueMinor',OLD.synthetic_fees->'institutionCreditDueMinor') THEN
  IF (NEW.synthetic_fees->>'sourceCorrectionCount')::BIGINT IS DISTINCT FROM COALESCE((OLD.synthetic_fees->>'sourceCorrectionCount')::BIGINT,0)+1 OR NOT EXISTS (
   SELECT 1 FROM synthetic_fee_source_corrections c
   JOIN approval_executions e ON e.tenant_id=c.tenant_id AND e.id=c.approval_execution_id
   JOIN approval_proposals p ON p.tenant_id=e.tenant_id AND p.id=e.proposal_id
   WHERE c.tenant_id=NEW.tenant_id AND c.obligation_id=NEW.id AND c.id=NEW.synthetic_fees->>'lastSourceCorrectionReceiptId'
    AND p.operation_id='pilotCorrectSyntheticFeeSource' AND p.resource_id=NEW.id AND p.status='executed' AND p.execution_id=e.id
    AND c.document#>>'{effects,nextOutstandingPrincipalMinor}'=NEW.outstanding_minor::TEXT
    AND c.document#>>'{effects,nextOutstandingInterestMinor}'=NEW.outstanding_interest_minor::TEXT
    AND c.document#>>'{effects,nextOutstandingFeesMinor}'=NEW.outstanding_fees_minor::TEXT
    AND c.document#>>'{effects,nextFundedBaseMinor}'=NEW.synthetic_fees->>'fundedBaseMinor'
    AND c.document#>>'{effects,nextBorrowerFeeMinor}'=NEW.synthetic_fees->>'borrowerAssessedMinor'
    AND c.document#>>'{effects,nextInstitutionFeeMinor}'=NEW.synthetic_fees->>'institutionAssessedMinor'
    AND (c.document#>>'{effects,scheduleSequenceAfter}')::INT=NEW.schedule_sequence
    AND c.document#>>'{effects,scheduleHashAfter}'=NEW.schedule_hash
  ) THEN RAISE EXCEPTION 'Source credits require their exact committed approval, receipt, schedule and financial effect'; END IF;
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER local_source_credit_receipt_required AFTER UPDATE ON obligations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_local_source_credit_receipt();
