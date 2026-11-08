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

-- The canonical Obligation projection and its snapshot carry the same state.
-- This is not a new collateral ledger, balance or custody system.
ALTER TABLE obligations ADD COLUMN synthetic_collateral JSONB;
ALTER TABLE obligations ADD CONSTRAINT obligations_synthetic_collateral_shape CHECK (
  synthetic_collateral IS NULL OR ((
    schema_version = 'obligation.v2' AND sandbox_only AND NOT production_funds_moved
    AND pool_obligation_binding_id IS NULL
    AND jsonb_typeof(synthetic_collateral) = 'object'
    AND synthetic_collateral->>'syntheticOnly' = 'true'
    AND synthetic_collateral->>'productionFundsMoved' = 'false'
    AND synthetic_collateral->'transactionHash' = 'null'::jsonb
    AND synthetic_collateral->>'finality' = 'not_applicable'
    AND synthetic_collateral#>>'{terms,profile}' = 'm2_synthetic_weth_usd_cent.v1'
    AND synthetic_collateral#>>'{terms,source}' = 'deterministic_synthetic_scenario'
    AND synthetic_collateral#>>'{terms,marketPrice}' = 'false'
    AND synthetic_collateral#>>'{terms,withdrawable}' = 'false'
    AND synthetic_collateral#>>'{terms,debtAssetId}' = asset_id
    AND synthetic_collateral#>>'{terms,principalMinor}' = amount_minor::text
    AND synthetic_collateral#>>'{terms,chainId}' = 'eip155:84532'
    AND synthetic_collateral#>>'{terms,collateralAssetId}' = 'weth'
    AND synthetic_collateral#>>'{terms,termsHash}' ~ '^0x[0-9a-f]{64}$'
    AND (
      (synthetic_collateral->>'state' = 'awaiting_confirmation' AND synthetic_collateral->>'version' = '0'
        AND synthetic_collateral->>'amountAssets' = '0')
      OR (synthetic_collateral->>'state' = 'confirmed' AND synthetic_collateral->>'version' = '1'
        AND synthetic_collateral->>'amountAssets' = synthetic_collateral#>>'{terms,requiredAssets}'
        AND synthetic_collateral->>'confirmationReceiptId' ~ '^0x[0-9a-f]{64}$')
      OR (synthetic_collateral->>'state' = 'released' AND synthetic_collateral->>'version' = '2'
        AND synthetic_collateral->>'amountAssets' = '0'
        AND status IN ('fully_repaid', 'closed') AND outstanding_minor = 0
        AND outstanding_interest_minor = 0 AND outstanding_fees_minor = 0
        AND synthetic_collateral->>'confirmationReceiptId' ~ '^0x[0-9a-f]{64}$'
        AND synthetic_collateral->>'releaseReceiptId' ~ '^0x[0-9a-f]{64}$')
    )
    -- A stale application writer cannot execute an unconfirmed secured case.
    AND (execution_status <> 'executed' OR synthetic_collateral->>'state' IN ('confirmed', 'released'))
  ) IS TRUE)
);
CREATE FUNCTION enforce_synthetic_collateral_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.synthetic_collateral IS NULL THEN
    IF NEW.synthetic_collateral IS NOT NULL THEN
      RAISE EXCEPTION 'Collateral cannot be added to an already accepted unsecured Obligation';
    END IF;
  ELSE
    IF NEW.synthetic_collateral IS NULL OR
      OLD.synthetic_collateral->'terms' IS DISTINCT FROM NEW.synthetic_collateral->'terms' THEN
      RAISE EXCEPTION 'Accepted synthetic collateral terms are immutable';
    END IF;
    IF OLD.synthetic_collateral IS DISTINCT FROM NEW.synthetic_collateral THEN
      IF NOT (
        (OLD.synthetic_collateral->>'state' = 'awaiting_confirmation' AND NEW.synthetic_collateral->>'state' = 'confirmed'
          AND OLD.execution_status = 'pending' AND NEW.execution_status = 'pending' AND OLD.status = 'created' AND NEW.status = 'created')
        OR (OLD.synthetic_collateral->>'state' = 'confirmed' AND NEW.synthetic_collateral->>'state' = 'released'
          AND OLD.status = 'fully_repaid' AND OLD.outstanding_minor = 0
          AND OLD.outstanding_interest_minor = 0 AND OLD.outstanding_fees_minor = 0
          AND OLD.synthetic_collateral->>'confirmationReceiptId' = NEW.synthetic_collateral->>'confirmationReceiptId')
      ) THEN RAISE EXCEPTION 'Synthetic collateral transition is not allowed'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER synthetic_collateral_transition_guard BEFORE UPDATE OF synthetic_collateral ON obligations
FOR EACH ROW EXECUTE FUNCTION enforce_synthetic_collateral_transition();
