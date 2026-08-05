DROP INDEX IF EXISTS canonical_credit_lines_tenant_subject_status_idx;
DROP TRIGGER IF EXISTS guard_canonical_credit_line_projection ON credit_lines;
DROP FUNCTION IF EXISTS guard_canonical_credit_line_projection();

ALTER TABLE credit_lines
  DROP CONSTRAINT IF EXISTS credit_lines_v2_tenant_obligation_fk,
  DROP CONSTRAINT IF EXISTS credit_lines_v2_tenant_acceptance_fk,
  DROP CONSTRAINT IF EXISTS credit_lines_v2_tenant_offer_fk,
  DROP CONSTRAINT IF EXISTS credit_lines_v2_tenant_decision_fk,
  DROP CONSTRAINT IF EXISTS credit_lines_v2_tenant_intent_fk,
  DROP CONSTRAINT IF EXISTS credit_lines_v2_tenant_principal_fk,
  DROP CONSTRAINT IF EXISTS credit_lines_v2_shape_check,
  DROP COLUMN IF EXISTS production_authority,
  DROP COLUMN IF EXISTS sandbox_only,
  DROP COLUMN IF EXISTS allowed_provider_ids,
  DROP COLUMN IF EXISTS purpose_code,
  DROP COLUMN IF EXISTS obligation_id,
  DROP COLUMN IF EXISTS acceptance_hash,
  DROP COLUMN IF EXISTS acceptance_id,
  DROP COLUMN IF EXISTS terms_hash,
  DROP COLUMN IF EXISTS credit_offer_hash,
  DROP COLUMN IF EXISTS credit_offer_id,
  DROP COLUMN IF EXISTS policy_hash,
  DROP COLUMN IF EXISTS decision_hash,
  DROP COLUMN IF EXISTS risk_decision_id,
  DROP COLUMN IF EXISTS credit_intent_hash,
  DROP COLUMN IF EXISTS credit_intent_id,
  DROP COLUMN IF EXISTS facility_hash,
  DROP COLUMN IF EXISTS facility_id,
  DROP COLUMN IF EXISTS authority_terms_hash,
  DROP COLUMN IF EXISTS principal_id,
  DROP COLUMN IF EXISTS exposure_hash,
  DROP COLUMN IF EXISTS projection_hash;
