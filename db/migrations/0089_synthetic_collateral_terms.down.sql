-- Never discard or make unreadable an accepted synthetic collateral contract.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM credit_offers WHERE terms_version = 'credit_terms.synthetic_secured.v1') OR
     EXISTS (SELECT 1 FROM obligations WHERE synthetic_collateral IS NOT NULL) THEN
    RAISE EXCEPTION 'B3 terms exist: retain the additive schema and use the compatible rollback runtime';
  END IF;
END $$;
ALTER TABLE credit_offers
  DROP CONSTRAINT credit_offers_terms_version_check,
  DROP CONSTRAINT credit_offers_v2_shape_check,
  ADD CONSTRAINT credit_offers_terms_version_check CHECK (terms_version IN ('credit_terms.v1', 'credit_terms.v2')),
  ADD CONSTRAINT credit_offers_v2_shape_check CHECK (
    (
      schema_version = 'credit_offer.v1'
      AND terms_version = 'credit_terms.v1'
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

DROP TRIGGER synthetic_collateral_transition_guard ON obligations;
DROP FUNCTION IF EXISTS enforce_synthetic_collateral_transition();
ALTER TABLE obligations DROP CONSTRAINT obligations_synthetic_collateral_shape, DROP COLUMN synthetic_collateral;
