CREATE TABLE trading_facilities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  state_hash TEXT NOT NULL CHECK (state_hash ~ '^0x[0-9a-f]{64}$'),
  match_proposal_id TEXT NOT NULL,
  proposal_hash TEXT NOT NULL CHECK (proposal_hash ~ '^0x[0-9a-f]{64}$'),
  obligation_id TEXT NOT NULL,
  obligation_hash TEXT NOT NULL CHECK (obligation_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  asset_id TEXT NOT NULL CHECK (asset_id = 'urn:ipo-one:sandbox-asset:usd-cent'),
  lifecycle_status TEXT NOT NULL CHECK (
    lifecycle_status IN (
      'awaiting_contributions',
      'awaiting_subject_collateral',
      'awaiting_provider_funding',
      'ready_for_activation',
      'active',
      'flattened'
    )
  ),
  risk_state TEXT NOT NULL CHECK (
    risk_state IN ('NORMAL', 'WARNING', 'REDUCE_ONLY', 'FLATTEN', 'SETTLEMENT')
  ),
  subject_collateral_minor NUMERIC(78, 0) NOT NULL
    CHECK (subject_collateral_minor >= 0),
  provider_funding_minor NUMERIC(78, 0) NOT NULL
    CHECK (provider_funding_minor >= 0),
  synthetic_capital_minor NUMERIC(78, 0) NOT NULL
    CHECK (synthetic_capital_minor >= 0),
  synthetic_exposure_minor NUMERIC(78, 0) NOT NULL
    CHECK (
      synthetic_exposure_minor >= 0
      AND synthetic_exposure_minor <= synthetic_capital_minor
    ),
  synthetic_equity_minor NUMERIC(78, 0) NOT NULL
    CHECK (
      synthetic_equity_minor >= 0
      AND synthetic_equity_minor =
        synthetic_capital_minor - synthetic_exposure_minor
    ),
  open_order_count INTEGER NOT NULL CHECK (open_order_count BETWEEN 0 AND 20),
  version BIGINT NOT NULL CHECK (version >= 1),
  facility JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  activation_deadline_at TIMESTAMPTZ NOT NULL,
  maturity_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  non_redeemable BOOLEAN NOT NULL CHECK (non_redeemable = TRUE),
  withdrawable BOOLEAN NOT NULL CHECK (withdrawable = FALSE),
  transferable BOOLEAN NOT NULL CHECK (transferable = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'trading_facility.v1'),
  CONSTRAINT trading_facilities_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT trading_facilities_tenant_hash_key UNIQUE (tenant_id, facility_hash),
  CONSTRAINT trading_facilities_tenant_proposal_key
    UNIQUE (tenant_id, match_proposal_id),
  CONSTRAINT trading_facilities_tenant_obligation_key
    UNIQUE (tenant_id, obligation_id),
  CONSTRAINT trading_facilities_proposal_fk
    FOREIGN KEY (tenant_id, match_proposal_id)
    REFERENCES trading_match_proposals(tenant_id, id),
  CONSTRAINT trading_facilities_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id)
    REFERENCES obligations(tenant_id, id),
  CONSTRAINT trading_facilities_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT trading_facilities_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT trading_facilities_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id),
  CONSTRAINT trading_facilities_identity_check CHECK (
    facility->>'tradingFacilityId' = id
    AND facility->>'facilityHash' = facility_hash
    AND facility->>'stateHash' = state_hash
    AND facility->>'matchProposalId' = match_proposal_id
    AND facility->>'proposalHash' = proposal_hash
    AND facility->>'obligationId' = obligation_id
    AND facility->>'obligationHash' = obligation_hash
    AND facility->>'subjectId' = subject_id
    AND facility->>'principalId' = principal_id
    AND facility->>'providerId' = provider_id
    AND facility->>'assetId' = asset_id
    AND facility->>'lifecycleStatus' = lifecycle_status
    AND facility->>'riskState' = risk_state
    AND facility->>'subjectCollateralMinor' = subject_collateral_minor::TEXT
    AND facility->>'providerFundingMinor' = provider_funding_minor::TEXT
    AND facility->>'syntheticCapitalMinor' = synthetic_capital_minor::TEXT
    AND facility->>'syntheticExposureMinor' = synthetic_exposure_minor::TEXT
    AND facility->>'syntheticEquityMinor' = synthetic_equity_minor::TEXT
    AND (facility->>'openOrderCount')::INTEGER = open_order_count
    AND (facility->>'version')::BIGINT = version
    AND facility->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_facilities_safety_check CHECK (
    facility @> jsonb_build_object(
      'callerEquityAccepted', false,
      'externalOrderSubmitted', false,
      'externalSystemQueried', false,
      'fundsAuthority', false,
      'linkedCanonicalObligation', true,
      'nonRedeemable', true,
      'piiIncluded', false,
      'productionAuthority', false,
      'productionFundsMoved', false,
      'realCollateral', false,
      'realEquity', false,
      'realFunding', false,
      'realPricing', false,
      'sandboxOnly', true,
      'secondLedgerCreated', false,
      'secretsIncluded', false,
      'syntheticOnly', true,
      'transferable', false,
      'withdrawable', false
    )
  )
);

CREATE TABLE trading_order_intents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  order_intent_hash TEXT NOT NULL CHECK (order_intent_hash ~ '^0x[0-9a-f]{64}$'),
  order_state_hash TEXT NOT NULL CHECK (order_state_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  synthetic_notional_minor NUMERIC(78, 0) NOT NULL
    CHECK (synthetic_notional_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('open', 'canceled', 'flattened')),
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 2),
  order_intent JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  non_redeemable BOOLEAN NOT NULL CHECK (non_redeemable = TRUE),
  withdrawable BOOLEAN NOT NULL CHECK (withdrawable = FALSE),
  transferable BOOLEAN NOT NULL CHECK (transferable = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'trading_order_intent.v1'),
  CONSTRAINT trading_order_intents_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT trading_order_intents_tenant_hash_key
    UNIQUE (tenant_id, order_intent_hash),
  CONSTRAINT trading_order_intents_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT trading_order_intents_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT trading_order_intents_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT trading_order_intents_identity_check CHECK (
    order_intent->>'tradingOrderIntentId' = id
    AND order_intent->>'orderIntentHash' = order_intent_hash
    AND order_intent->>'orderStateHash' = order_state_hash
    AND order_intent->>'facilityId' = facility_id
    AND order_intent->>'facilityHash' = facility_hash
    AND order_intent->>'subjectId' = subject_id
    AND order_intent->>'principalId' = principal_id
    AND order_intent->>'direction' = direction
    AND order_intent->>'syntheticNotionalMinor' = synthetic_notional_minor::TEXT
    AND order_intent->>'status' = status
    AND (order_intent->>'version')::BIGINT = version
    AND order_intent->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_order_intents_state_check CHECK (
    (status = 'open' AND version = 1
      AND order_intent->'canceledAt' = 'null'::JSONB
      AND order_intent->'flattenedAt' = 'null'::JSONB)
    OR (status = 'canceled' AND version = 2
      AND order_intent->'canceledAt' <> 'null'::JSONB
      AND order_intent->'flattenedAt' = 'null'::JSONB)
    OR (status = 'flattened' AND version = 2
      AND order_intent->'canceledAt' = 'null'::JSONB
      AND order_intent->'flattenedAt' <> 'null'::JSONB)
  ),
  CONSTRAINT trading_order_intents_safety_check CHECK (
    order_intent @> jsonb_build_object(
      'externalOrderSubmitted', false,
      'externalSystemQueried', false,
      'fundsAuthority', false,
      'nonRedeemable', true,
      'piiIncluded', false,
      'productionAuthority', false,
      'productionFundsMoved', false,
      'rawVenueActionAccepted', false,
      'realCollateral', false,
      'realEquity', false,
      'realFunding', false,
      'realPricing', false,
      'sandboxOnly', true,
      'secretsIncluded', false,
      'serverRiskEvaluated', true,
      'syntheticOnly', true,
      'transferable', false,
      'withdrawable', false
    )
  )
);

CREATE TABLE trading_facility_risk_evaluations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  evaluation_hash TEXT NOT NULL CHECK (evaluation_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  facility_version_before BIGINT NOT NULL CHECK (facility_version_before >= 1),
  previous_risk_state TEXT NOT NULL CHECK (
    previous_risk_state IN ('NORMAL', 'WARNING', 'REDUCE_ONLY', 'FLATTEN', 'SETTLEMENT')
  ),
  evaluated_risk_state TEXT NOT NULL CHECK (
    evaluated_risk_state IN ('NORMAL', 'WARNING', 'REDUCE_ONLY', 'FLATTEN', 'SETTLEMENT')
  ),
  freshness TEXT NOT NULL CHECK (freshness IN ('fresh', 'stale', 'unknown')),
  evaluation JSONB NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  non_redeemable BOOLEAN NOT NULL CHECK (non_redeemable = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL
    CHECK (schema_version = 'trading_facility_risk_evaluation.v1'),
  CONSTRAINT trading_facility_risk_evaluations_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT trading_facility_risk_evaluations_tenant_hash_key
    UNIQUE (tenant_id, evaluation_hash),
  CONSTRAINT trading_facility_risk_evaluations_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT trading_facility_risk_evaluations_identity_check CHECK (
    evaluation->>'tradingFacilityRiskEvaluationId' = id
    AND evaluation->>'evaluationHash' = evaluation_hash
    AND evaluation->>'facilityId' = facility_id
    AND evaluation->>'facilityHash' = facility_hash
    AND (evaluation->>'facilityVersionBefore')::BIGINT = facility_version_before
    AND evaluation->>'previousRiskState' = previous_risk_state
    AND evaluation->>'evaluatedRiskState' = evaluated_risk_state
    AND evaluation->>'freshness' = freshness
    AND evaluation->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_facility_risk_evaluations_safety_check CHECK (
    evaluation @> jsonb_build_object(
      'authorizing', false,
      'automaticRecovery', false,
      'callerEquityAccepted', false,
      'externalOrderSubmitted', false,
      'externalSystemQueried', false,
      'fundsAuthority', false,
      'monotonicProtection', true,
      'nonRedeemable', true,
      'piiIncluded', false,
      'productionAuthority', false,
      'productionFundsMoved', false,
      'realCollateral', false,
      'realEquity', false,
      'realFunding', false,
      'realPricing', false,
      'sandboxOnly', true,
      'secretsIncluded', false,
      'syntheticOnly', true,
      'transferable', false,
      'withdrawable', false
    )
  )
);

CREATE FUNCTION trading_risk_state_rank(value TEXT)
RETURNS INTEGER AS $$
  SELECT CASE value
    WHEN 'NORMAL' THEN 0
    WHEN 'WARNING' THEN 1
    WHEN 'REDUCE_ONLY' THEN 2
    WHEN 'FLATTEN' THEN 3
    WHEN 'SETTLEMENT' THEN 4
    ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE STRICT;

CREATE FUNCTION guard_trading_facility_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading facilities cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.id <> OLD.id OR
    NEW.facility_hash <> OLD.facility_hash OR
    NEW.match_proposal_id <> OLD.match_proposal_id OR
    NEW.proposal_hash <> OLD.proposal_hash OR
    NEW.obligation_id <> OLD.obligation_id OR
    NEW.obligation_hash <> OLD.obligation_hash OR
    NEW.subject_id <> OLD.subject_id OR
    NEW.principal_id <> OLD.principal_id OR
    NEW.provider_id <> OLD.provider_id OR
    NEW.asset_id <> OLD.asset_id OR
    NEW.created_at <> OLD.created_at OR
    NEW.activation_deadline_at <> OLD.activation_deadline_at OR
    NEW.maturity_at <> OLD.maturity_at OR
    NEW.sandbox_only <> OLD.sandbox_only OR
    NEW.synthetic_only <> OLD.synthetic_only OR
    NEW.non_redeemable <> OLD.non_redeemable OR
    NEW.withdrawable <> OLD.withdrawable OR
    NEW.transferable <> OLD.transferable OR
    NEW.production_authority <> OLD.production_authority OR
    NEW.funds_authority <> OLD.funds_authority OR
    NEW.schema_version <> OLD.schema_version OR
    NEW.version <> OLD.version + 1 OR
    trading_risk_state_rank(NEW.risk_state) <
      trading_risk_state_rank(OLD.risk_state) OR
    NOT (
      NEW.lifecycle_status = OLD.lifecycle_status
      OR (
        OLD.lifecycle_status = 'awaiting_contributions'
        AND NEW.lifecycle_status IN (
          'awaiting_subject_collateral',
          'awaiting_provider_funding'
        )
      )
      OR (
        OLD.lifecycle_status IN (
          'awaiting_subject_collateral',
          'awaiting_provider_funding'
        )
        AND NEW.lifecycle_status = 'ready_for_activation'
      )
      OR (
        OLD.lifecycle_status = 'ready_for_activation'
        AND NEW.lifecycle_status = 'active'
      )
      OR (
        OLD.lifecycle_status = 'active'
        AND NEW.lifecycle_status = 'flattened'
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading facility transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_facilities_transition_guard
BEFORE UPDATE OR DELETE ON trading_facilities
FOR EACH ROW EXECUTE FUNCTION guard_trading_facility_transition();

CREATE FUNCTION guard_trading_order_intent_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading order intents cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.id <> OLD.id OR
    NEW.order_intent_hash <> OLD.order_intent_hash OR
    NEW.facility_id <> OLD.facility_id OR
    NEW.facility_hash <> OLD.facility_hash OR
    NEW.subject_id <> OLD.subject_id OR
    NEW.principal_id <> OLD.principal_id OR
    NEW.direction <> OLD.direction OR
    NEW.synthetic_notional_minor <> OLD.synthetic_notional_minor OR
    NEW.created_at <> OLD.created_at OR
    NEW.sandbox_only <> OLD.sandbox_only OR
    NEW.synthetic_only <> OLD.synthetic_only OR
    NEW.non_redeemable <> OLD.non_redeemable OR
    NEW.withdrawable <> OLD.withdrawable OR
    NEW.transferable <> OLD.transferable OR
    NEW.production_authority <> OLD.production_authority OR
    NEW.funds_authority <> OLD.funds_authority OR
    NEW.schema_version <> OLD.schema_version OR
    OLD.status <> 'open' OR
    NEW.status NOT IN ('canceled', 'flattened') OR
    NEW.version <> 2
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading order intent transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_order_intents_transition_guard
BEFORE UPDATE OR DELETE ON trading_order_intents
FOR EACH ROW EXECUTE FUNCTION guard_trading_order_intent_transition();

CREATE FUNCTION guard_immutable_trading_facility_risk_evaluation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'trading facility risk evaluations are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_facility_risk_evaluations_immutable_guard
BEFORE UPDATE OR DELETE ON trading_facility_risk_evaluations
FOR EACH ROW
EXECUTE FUNCTION guard_immutable_trading_facility_risk_evaluation();

ALTER TABLE trading_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_facilities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_facilities ON trading_facilities
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_facilities
BEFORE INSERT OR UPDATE OR DELETE ON trading_facilities
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE trading_order_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_order_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_order_intents ON trading_order_intents
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_order_intents
BEFORE INSERT OR UPDATE OR DELETE ON trading_order_intents
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE trading_facility_risk_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_facility_risk_evaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_facility_risk_evaluations
  ON trading_facility_risk_evaluations
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_facility_risk_evaluations
BEFORE INSERT OR UPDATE OR DELETE ON trading_facility_risk_evaluations
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX trading_facilities_tenant_state_idx
  ON trading_facilities(
    tenant_id,
    lifecycle_status,
    risk_state,
    updated_at,
    id
  );
CREATE INDEX trading_order_intents_tenant_facility_state_idx
  ON trading_order_intents(tenant_id, facility_id, status, created_at, id);
CREATE INDEX trading_facility_risk_evaluations_tenant_facility_idx
  ON trading_facility_risk_evaluations(
    tenant_id,
    facility_id,
    evaluated_at,
    id
  );
