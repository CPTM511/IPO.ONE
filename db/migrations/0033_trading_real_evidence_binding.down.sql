DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM trading_credit_profiles
    WHERE schema_version = 'trading_credit_profile.v2'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'cannot remove real Trading Evidence schema while v2 profiles exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS trading_credit_profiles_tenant_subaccount_hash_idx;
DROP INDEX IF EXISTS trading_credit_profiles_tenant_binding_epoch_idx;

ALTER TABLE trading_credit_profiles
  DROP CONSTRAINT trading_credit_profiles_version_check,
  DROP CONSTRAINT trading_credit_profiles_schema_version_check,
  DROP CONSTRAINT trading_credit_profiles_schema_mode_check,
  DROP CONSTRAINT trading_credit_profiles_stage_version_check,
  DROP CONSTRAINT trading_credit_profiles_profile_safety_check;

ALTER TABLE trading_credit_profiles
  ADD CONSTRAINT trading_credit_profiles_version_check
    CHECK (version BETWEEN 1 AND 3),
  ADD CONSTRAINT trading_credit_profiles_synthetic_only_check
    CHECK (synthetic_only = TRUE),
  ADD CONSTRAINT trading_credit_profiles_external_system_queried_check
    CHECK (external_system_queried = FALSE),
  ADD CONSTRAINT trading_credit_profiles_schema_version_check
    CHECK (schema_version = 'trading_credit_profile.v1'),
  ADD CONSTRAINT trading_credit_profiles_stage_version_check
    CHECK (
      (stage = 'challenge_pending' AND version = 1)
      OR (stage = 'history_imported' AND version = 2)
      OR (stage = 'finalized' AND version = 3)
    ),
  ADD CONSTRAINT trading_credit_profiles_profile_safety_check
    CHECK (
      profile @> jsonb_build_object(
        'creditApproval', false,
        'externalSystemQueried', false,
        'fundsAuthority', false,
        'piiIncluded', false,
        'productionAuthority', false,
        'rawStrategyIncluded', false,
        'rawTransactionsIncluded', false,
        'sandboxOnly', true,
        'secretsIncluded', false,
        'syntheticOnly', true,
        'universalScoreAvailable', false
      )
    );

CREATE OR REPLACE FUNCTION guard_trading_credit_profile_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading credit profiles cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.id <> OLD.id OR
    NEW.subject_id <> OLD.subject_id OR
    NEW.principal_id <> OLD.principal_id OR
    NEW.subject_type <> OLD.subject_type OR
    NEW.operator_type <> OLD.operator_type OR
    NEW.account_reference_hash <> OLD.account_reference_hash OR
    NEW.requested_by_actor_hash <> OLD.requested_by_actor_hash OR
    NEW.created_at <> OLD.created_at OR
    NEW.sandbox_only <> OLD.sandbox_only OR
    NEW.synthetic_only <> OLD.synthetic_only OR
    NEW.production_authority <> OLD.production_authority OR
    NEW.funds_authority <> OLD.funds_authority OR
    NEW.credit_approval <> OLD.credit_approval OR
    NEW.universal_score_available <> OLD.universal_score_available OR
    NEW.external_system_queried <> OLD.external_system_queried OR
    NEW.raw_strategy_included <> OLD.raw_strategy_included OR
    NEW.raw_transactions_included <> OLD.raw_transactions_included OR
    NEW.pii_included <> OLD.pii_included OR
    NEW.secrets_included <> OLD.secrets_included OR
    NEW.schema_version <> OLD.schema_version OR
    NEW.version <> OLD.version + 1 OR
    NOT (
      (OLD.stage = 'challenge_pending' AND NEW.stage = 'history_imported')
      OR (OLD.stage = 'history_imported' AND NEW.stage = 'finalized')
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading credit profile transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
