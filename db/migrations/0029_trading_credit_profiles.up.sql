CREATE TABLE trading_credit_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('human', 'agent')),
  operator_type TEXT NOT NULL CHECK (
    (subject_type = 'human' AND operator_type = 'human_trader')
    OR (subject_type = 'agent' AND operator_type = 'agent_operator')
  ),
  account_reference_hash TEXT NOT NULL CHECK (account_reference_hash ~ '^0x[0-9a-f]{64}$'),
  requested_by_actor_hash TEXT NOT NULL CHECK (requested_by_actor_hash ~ '^0x[0-9a-f]{64}$'),
  stage TEXT NOT NULL CHECK (stage IN ('challenge_pending', 'history_imported', 'finalized')),
  profile JSONB NOT NULL,
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  credit_approval BOOLEAN NOT NULL CHECK (credit_approval = FALSE),
  universal_score_available BOOLEAN NOT NULL CHECK (universal_score_available = FALSE),
  external_system_queried BOOLEAN NOT NULL CHECK (external_system_queried = FALSE),
  raw_strategy_included BOOLEAN NOT NULL CHECK (raw_strategy_included = FALSE),
  raw_transactions_included BOOLEAN NOT NULL CHECK (raw_transactions_included = FALSE),
  pii_included BOOLEAN NOT NULL CHECK (pii_included = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'trading_credit_profile.v1'),
  CONSTRAINT trading_credit_profiles_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT trading_credit_profiles_tenant_subject_key UNIQUE (tenant_id, subject_id),
  CONSTRAINT trading_credit_profiles_tenant_account_key UNIQUE (tenant_id, account_reference_hash),
  CONSTRAINT trading_credit_profiles_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT trading_credit_profiles_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT trading_credit_profiles_stage_version_check CHECK (
    (stage = 'challenge_pending' AND version = 1)
    OR (stage = 'history_imported' AND version = 2)
    OR (stage = 'finalized' AND version = 3)
  ),
  CONSTRAINT trading_credit_profiles_profile_identity_check CHECK (
    profile->>'tradingCreditProfileId' = id
    AND profile->>'subjectId' = subject_id
    AND profile->>'principalId' = principal_id
    AND profile->>'subjectType' = subject_type
    AND profile->>'operatorType' = operator_type
    AND profile->>'accountReferenceHash' = account_reference_hash
    AND profile->>'requestedByActorHash' = requested_by_actor_hash
    AND profile->>'stage' = stage
    AND (profile->>'version')::BIGINT = version
    AND profile->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_credit_profiles_profile_safety_check CHECK (
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
  )
);

CREATE FUNCTION guard_trading_credit_profile_projection()
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

CREATE TRIGGER trading_credit_profiles_projection_guard
BEFORE UPDATE OR DELETE ON trading_credit_profiles
FOR EACH ROW EXECUTE FUNCTION guard_trading_credit_profile_projection();

ALTER TABLE trading_credit_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_credit_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_credit_profiles ON trading_credit_profiles
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_credit_profiles
BEFORE INSERT OR UPDATE OR DELETE ON trading_credit_profiles
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX trading_credit_profiles_tenant_stage_idx
  ON trading_credit_profiles(tenant_id, stage, updated_at DESC, id);
