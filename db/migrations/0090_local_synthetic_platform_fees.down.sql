-- Never erase accepted economic facts to roll back application code.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM synthetic_fee_entries) OR EXISTS(SELECT 1 FROM synthetic_fee_statements)
 OR EXISTS(SELECT 1 FROM obligations WHERE synthetic_fees IS NOT NULL)
 OR EXISTS(SELECT 1 FROM credit_offers WHERE fee_terms IS NOT NULL) THEN
  RAISE EXCEPTION 'B4 facts exist: retain schema/data and use a compatible disabled runtime';
 END IF;
END $$;
DROP TABLE synthetic_fee_statements, synthetic_fee_entries;
DROP FUNCTION guard_local_synthetic_fee_fact();
DROP TRIGGER local_synthetic_obligation_fee_terms_guard ON obligations;
DROP FUNCTION guard_local_synthetic_obligation_fee_terms();
ALTER TABLE obligations DROP COLUMN synthetic_fees;
DROP TRIGGER local_synthetic_offer_fee_terms_guard ON credit_offers;
DROP FUNCTION guard_local_synthetic_offer_fee_terms();
ALTER TABLE credit_offers DROP COLUMN fee_terms, DROP COLUMN fee_collateral_terms;

-- B3: admit exactly the synthetic secured v1 terms; preserve both existing Offer families.
ALTER TABLE credit_offers
  DROP CONSTRAINT credit_offers_terms_version_check,
  DROP CONSTRAINT credit_offers_v2_shape_check,
  ADD CONSTRAINT credit_offers_terms_version_check CHECK (terms_version IN ('credit_terms.v1', 'credit_terms.v2', 'credit_terms.synthetic_secured.v1')),
  ADD CONSTRAINT credit_offers_v2_shape_check CHECK (
    (
      schema_version = 'credit_offer.v1'
      AND terms_version IN ('credit_terms.v1', 'credit_terms.synthetic_secured.v1')
      AND num_nonnulls(
        capital_partner_id, capital_partner_operator_id,
        credit_passport_artifact_id, credit_passport_artifact_hash,
        credit_passport_artifact_version, passport_verification_hash,
        underwriting_snapshot_hash, facility_limit_minor, per_draw_cap_minor,
        permitted_purpose_code, conditions, undrawn_revocation_rule
      ) = 0
    )
    OR
    (
      schema_version = 'credit_offer.v2'
      AND terms_version = 'credit_terms.v2'
      AND capital_partner_id IS NOT NULL
      AND capital_partner_operator_id IS NOT NULL
      AND credit_passport_artifact_id IS NOT NULL
      AND credit_passport_artifact_hash ~ '^0x[0-9a-f]{64}$'
      AND credit_passport_artifact_version >= 1
      AND passport_verification_hash ~ '^0x[0-9a-f]{64}$'
      AND underwriting_snapshot_hash ~ '^0x[0-9a-f]{64}$'
      AND facility_limit_minor > 0
      AND approved_principal_minor <= facility_limit_minor
      AND per_draw_cap_minor > 0
      AND per_draw_cap_minor <= facility_limit_minor
      AND approved_principal_minor <= per_draw_cap_minor
      AND permitted_purpose_code ~ '^[a-z][a-z0-9_.-]{1,95}$'
      AND jsonb_typeof(conditions) = 'array'
      AND jsonb_array_length(conditions) BETWEEN 1 AND 12
      AND undrawn_revocation_rule IN (
        'capital_partner_before_acceptance', 'irrevocable_until_expiry'
      )
    )
  );

