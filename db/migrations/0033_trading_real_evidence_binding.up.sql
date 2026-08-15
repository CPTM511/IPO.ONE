ALTER TABLE trading_credit_profiles
  DROP CONSTRAINT trading_credit_profiles_version_check,
  DROP CONSTRAINT trading_credit_profiles_synthetic_only_check,
  DROP CONSTRAINT trading_credit_profiles_external_system_queried_check,
  DROP CONSTRAINT trading_credit_profiles_schema_version_check,
  DROP CONSTRAINT trading_credit_profiles_stage_version_check,
  DROP CONSTRAINT trading_credit_profiles_profile_safety_check;

ALTER TABLE trading_credit_profiles
  ADD CONSTRAINT trading_credit_profiles_version_check
    CHECK (version BETWEEN 1 AND 1000000),
  ADD CONSTRAINT trading_credit_profiles_schema_version_check
    CHECK (
      schema_version IN (
        'trading_credit_profile.v1',
        'trading_credit_profile.v2'
      )
    ),
  ADD CONSTRAINT trading_credit_profiles_schema_mode_check
    CHECK (
      (
        schema_version = 'trading_credit_profile.v1'
        AND synthetic_only = TRUE
        AND external_system_queried = FALSE
      )
      OR (
        schema_version = 'trading_credit_profile.v2'
        AND synthetic_only = FALSE
      )
    ),
  ADD CONSTRAINT trading_credit_profiles_stage_version_check
    CHECK (
      (
        schema_version = 'trading_credit_profile.v1'
        AND (
          (stage = 'challenge_pending' AND version = 1)
          OR (stage = 'history_imported' AND version = 2)
          OR (stage = 'finalized' AND version = 3)
        )
      )
      OR (
        schema_version = 'trading_credit_profile.v2'
        AND version >= 1
      )
    ),
  ADD CONSTRAINT trading_credit_profiles_profile_safety_check
    CHECK (
      profile @> jsonb_build_object(
        'creditApproval', false,
        'fundsAuthority', false,
        'piiIncluded', false,
        'productionAuthority', false,
        'rawStrategyIncluded', false,
        'rawTransactionsIncluded', false,
        'sandboxOnly', true,
        'secretsIncluded', false,
        'universalScoreAvailable', false
      )
      AND (profile->>'syntheticOnly')::BOOLEAN = synthetic_only
      AND (profile->>'externalSystemQueried')::BOOLEAN =
        external_system_queried
      AND (
        schema_version <> 'trading_credit_profile.v2'
        OR profile @> jsonb_build_object(
          'realFunds', false,
          'testnetOnly', true
        )
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
    (OLD.external_system_queried AND NOT NEW.external_system_queried) OR
    NEW.raw_strategy_included <> OLD.raw_strategy_included OR
    NEW.raw_transactions_included <> OLD.raw_transactions_included OR
    NEW.pii_included <> OLD.pii_included OR
    NEW.secrets_included <> OLD.secrets_included OR
    NEW.schema_version <> OLD.schema_version OR
    NEW.version <> OLD.version + 1 OR
    NOT (
      (OLD.stage = 'challenge_pending' AND NEW.stage = 'history_imported')
      OR (OLD.stage = 'history_imported' AND NEW.stage = 'finalized')
      OR (
        OLD.schema_version = 'trading_credit_profile.v2'
        AND OLD.stage = 'finalized'
        AND NEW.stage = 'challenge_pending'
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading credit profile transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX trading_credit_profiles_tenant_binding_epoch_idx
  ON trading_credit_profiles(
    tenant_id,
    ((profile->>'bindingEpoch')::BIGINT),
    updated_at DESC,
    id
  )
  WHERE schema_version = 'trading_credit_profile.v2';

CREATE INDEX trading_credit_profiles_tenant_subaccount_hash_idx
  ON trading_credit_profiles(
    tenant_id,
    ((profile->'bindingChallenge'->>'subaccountAddressHash')),
    id
  )
  WHERE schema_version = 'trading_credit_profile.v2';
