CREATE TABLE trading_capital_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  trading_credit_profile_id TEXT NOT NULL,
  requested_by_actor_hash TEXT NOT NULL CHECK (requested_by_actor_hash ~ '^0x[0-9a-f]{64}$'),
  template_type TEXT NOT NULL CHECK (
    template_type IN ('credit', 'performance_participation', 'hybrid')
  ),
  strategy_class TEXT NOT NULL CHECK (
    strategy_class IN ('market_neutral', 'directional', 'liquidity_provision')
  ),
  asset_id TEXT NOT NULL CHECK (asset_id = 'urn:ipo-one:sandbox-asset:usd-cent'),
  requested_amount_minor NUMERIC(78, 0) NOT NULL CHECK (requested_amount_minor > 0),
  duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 7 AND 365),
  status TEXT NOT NULL CHECK (status = 'open'),
  version BIGINT NOT NULL CHECK (version = 1),
  request JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'trading_capital_request.v1'),
  CONSTRAINT trading_capital_requests_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT trading_capital_requests_tenant_hash_key UNIQUE (tenant_id, request_hash),
  CONSTRAINT trading_capital_requests_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT trading_capital_requests_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT trading_capital_requests_profile_fk
    FOREIGN KEY (tenant_id, trading_credit_profile_id)
    REFERENCES trading_credit_profiles(tenant_id, id),
  CONSTRAINT trading_capital_requests_identity_check CHECK (
    request->>'tradingCapitalRequestId' = id
    AND request->>'requestHash' = request_hash
    AND request->>'subjectId' = subject_id
    AND request->>'principalId' = principal_id
    AND request->>'tradingCreditProfileId' = trading_credit_profile_id
    AND request->>'requestedByActorHash' = requested_by_actor_hash
    AND request->>'templateType' = template_type
    AND request->>'strategyClass' = strategy_class
    AND request->>'assetId' = asset_id
    AND request->>'requestedAmountMinor' = requested_amount_minor::TEXT
    AND (request->>'durationDays')::INTEGER = duration_days
    AND request->>'status' = status
    AND (request->>'version')::BIGINT = version
    AND request->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_capital_requests_safety_check CHECK (
    request @> jsonb_build_object(
      'autoAccept', false,
      'autoMatch', false,
      'externalSystemQueried', false,
      'fundsAuthority', false,
      'piiIncluded', false,
      'productionAuthority', false,
      'realFunding', false,
      'realPricing', false,
      'riskClassCallerSupplied', false,
      'sandboxOnly', true,
      'secretsIncluded', false,
      'syntheticOnly', true
    )
    AND request->'evidenceEligibility' @> jsonb_build_object(
      'authorizing', false,
      'eligibilityClass', 'synthetic_restricted',
      'freshness', 'unknown',
      'selfDeclaredRiskClassAccepted', false
    )
  )
);

CREATE TABLE trading_provider_mandates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  mandate_hash TEXT NOT NULL CHECK (mandate_hash ~ '^0x[0-9a-f]{64}$'),
  provider_id TEXT NOT NULL,
  provider_actor_hash TEXT NOT NULL CHECK (provider_actor_hash ~ '^0x[0-9a-f]{64}$'),
  asset_id TEXT NOT NULL CHECK (asset_id = 'urn:ipo-one:sandbox-asset:usd-cent'),
  min_amount_minor NUMERIC(78, 0) NOT NULL CHECK (min_amount_minor > 0),
  max_amount_minor NUMERIC(78, 0) NOT NULL CHECK (
    max_amount_minor >= min_amount_minor
  ),
  min_duration_days INTEGER NOT NULL CHECK (min_duration_days BETWEEN 7 AND 365),
  max_duration_days INTEGER NOT NULL CHECK (
    max_duration_days BETWEEN min_duration_days AND 365
  ),
  status TEXT NOT NULL CHECK (status = 'open'),
  version BIGINT NOT NULL CHECK (version = 1),
  mandate JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'trading_provider_mandate.v1'),
  CONSTRAINT trading_provider_mandates_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT trading_provider_mandates_tenant_hash_key UNIQUE (tenant_id, mandate_hash),
  CONSTRAINT trading_provider_mandates_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id),
  CONSTRAINT trading_provider_mandates_identity_check CHECK (
    mandate->>'tradingProviderMandateId' = id
    AND mandate->>'mandateHash' = mandate_hash
    AND mandate->>'providerId' = provider_id
    AND mandate->>'providerActorHash' = provider_actor_hash
    AND mandate->>'assetId' = asset_id
    AND mandate->>'minAmountMinor' = min_amount_minor::TEXT
    AND mandate->>'maxAmountMinor' = max_amount_minor::TEXT
    AND (mandate->>'minDurationDays')::INTEGER = min_duration_days
    AND (mandate->>'maxDurationDays')::INTEGER = max_duration_days
    AND mandate->>'status' = status
    AND (mandate->>'version')::BIGINT = version
    AND mandate->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_provider_mandates_safety_check CHECK (
    mandate @> jsonb_build_object(
      'autoAccept', false,
      'evidenceEligibilityClass', 'synthetic_restricted',
      'externalSystemQueried', false,
      'fundsAuthority', false,
      'hardFiltersOnly', true,
      'piiIncluded', false,
      'productionAuthority', false,
      'providerRankingAuthority', false,
      'realFunding', false,
      'realPricing', false,
      'sandboxOnly', true,
      'secretsIncluded', false,
      'selfDeclaredRiskClassAccepted', false,
      'syntheticOnly', true
    )
  )
);

CREATE TABLE trading_match_proposals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  proposal_hash TEXT NOT NULL CHECK (proposal_hash ~ '^0x[0-9a-f]{64}$'),
  capital_request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^0x[0-9a-f]{64}$'),
  request_version BIGINT NOT NULL CHECK (request_version = 1),
  provider_mandate_id TEXT NOT NULL,
  mandate_hash TEXT NOT NULL CHECK (mandate_hash ~ '^0x[0-9a-f]{64}$'),
  mandate_version BIGINT NOT NULL CHECK (mandate_version = 1),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  subject_actor_hash TEXT NOT NULL CHECK (subject_actor_hash ~ '^0x[0-9a-f]{64}$'),
  provider_actor_hash TEXT NOT NULL CHECK (provider_actor_hash ~ '^0x[0-9a-f]{64}$'),
  compatibility_hash TEXT NOT NULL CHECK (compatibility_hash ~ '^0x[0-9a-f]{64}$'),
  terms_hash TEXT NOT NULL CHECK (terms_hash ~ '^0x[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (
    status IN (
      'proposed',
      'provider_accepted',
      'subject_accepted',
      'bilaterally_accepted'
    )
  ),
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 3),
  proposal JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'trading_match_proposal.v1'),
  CONSTRAINT trading_match_proposals_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT trading_match_proposals_tenant_hash_key UNIQUE (tenant_id, proposal_hash),
  CONSTRAINT trading_match_proposals_request_mandate_key
    UNIQUE (tenant_id, capital_request_id, provider_mandate_id),
  CONSTRAINT trading_match_proposals_request_fk
    FOREIGN KEY (tenant_id, capital_request_id)
    REFERENCES trading_capital_requests(tenant_id, id),
  CONSTRAINT trading_match_proposals_mandate_fk
    FOREIGN KEY (tenant_id, provider_mandate_id)
    REFERENCES trading_provider_mandates(tenant_id, id),
  CONSTRAINT trading_match_proposals_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT trading_match_proposals_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT trading_match_proposals_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id),
  CONSTRAINT trading_match_proposals_identity_check CHECK (
    proposal->>'tradingMatchProposalId' = id
    AND proposal->>'proposalHash' = proposal_hash
    AND proposal->>'capitalRequestId' = capital_request_id
    AND proposal->>'requestHash' = request_hash
    AND (proposal->>'requestVersion')::BIGINT = request_version
    AND proposal->>'providerMandateId' = provider_mandate_id
    AND proposal->>'mandateHash' = mandate_hash
    AND (proposal->>'mandateVersion')::BIGINT = mandate_version
    AND proposal->>'subjectId' = subject_id
    AND proposal->>'principalId' = principal_id
    AND proposal->>'providerId' = provider_id
    AND proposal->>'subjectActorHash' = subject_actor_hash
    AND proposal->>'providerActorHash' = provider_actor_hash
    AND proposal->>'compatibilityHash' = compatibility_hash
    AND proposal->>'termsHash' = terms_hash
    AND proposal->'terms'->>'termsHash' = terms_hash
    AND proposal->>'status' = status
    AND (proposal->>'version')::BIGINT = version
    AND proposal->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_match_proposals_state_check CHECK (
    (status = 'proposed' AND version = 1
      AND proposal->'providerAcceptance' = 'null'::JSONB
      AND proposal->'subjectAcceptance' = 'null'::JSONB)
    OR (status = 'provider_accepted' AND version = 2
      AND proposal->'providerAcceptance' <> 'null'::JSONB
      AND proposal->'subjectAcceptance' = 'null'::JSONB)
    OR (status = 'subject_accepted' AND version = 2
      AND proposal->'providerAcceptance' = 'null'::JSONB
      AND proposal->'subjectAcceptance' <> 'null'::JSONB)
    OR (status = 'bilaterally_accepted' AND version = 3
      AND proposal->'providerAcceptance' <> 'null'::JSONB
      AND proposal->'subjectAcceptance' <> 'null'::JSONB)
  ),
  CONSTRAINT trading_match_proposals_safety_check CHECK (
    proposal @> jsonb_build_object(
      'autoAccepted', false,
      'bilateralAcceptanceRequired', true,
      'externalSystemQueried', false,
      'fundsAuthority', false,
      'immutableTerms', true,
      'piiIncluded', false,
      'productionAuthority', false,
      'realFunding', false,
      'realPricing', false,
      'requestAndMandateRevalidationRequired', true,
      'sandboxOnly', true,
      'secretsIncluded', false,
      'syntheticOnly', true
    )
  )
);

CREATE FUNCTION guard_immutable_trading_capital_request()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'trading capital requests are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_capital_requests_immutable_guard
BEFORE UPDATE OR DELETE ON trading_capital_requests
FOR EACH ROW EXECUTE FUNCTION guard_immutable_trading_capital_request();

CREATE FUNCTION guard_immutable_trading_provider_mandate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'trading provider mandates are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_provider_mandates_immutable_guard
BEFORE UPDATE OR DELETE ON trading_provider_mandates
FOR EACH ROW EXECUTE FUNCTION guard_immutable_trading_provider_mandate();

CREATE FUNCTION guard_trading_match_proposal_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading match proposals cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.id <> OLD.id OR
    NEW.proposal_hash <> OLD.proposal_hash OR
    NEW.capital_request_id <> OLD.capital_request_id OR
    NEW.request_hash <> OLD.request_hash OR
    NEW.request_version <> OLD.request_version OR
    NEW.provider_mandate_id <> OLD.provider_mandate_id OR
    NEW.mandate_hash <> OLD.mandate_hash OR
    NEW.mandate_version <> OLD.mandate_version OR
    NEW.subject_id <> OLD.subject_id OR
    NEW.principal_id <> OLD.principal_id OR
    NEW.provider_id <> OLD.provider_id OR
    NEW.subject_actor_hash <> OLD.subject_actor_hash OR
    NEW.provider_actor_hash <> OLD.provider_actor_hash OR
    NEW.compatibility_hash <> OLD.compatibility_hash OR
    NEW.terms_hash <> OLD.terms_hash OR
    NEW.created_at <> OLD.created_at OR
    NEW.expires_at <> OLD.expires_at OR
    NEW.sandbox_only <> OLD.sandbox_only OR
    NEW.synthetic_only <> OLD.synthetic_only OR
    NEW.production_authority <> OLD.production_authority OR
    NEW.funds_authority <> OLD.funds_authority OR
    NEW.schema_version <> OLD.schema_version OR
    NEW.version <> OLD.version + 1 OR
    NOT (
      (OLD.status = 'proposed' AND NEW.status IN ('provider_accepted', 'subject_accepted'))
      OR (
        OLD.status IN ('provider_accepted', 'subject_accepted')
        AND NEW.status = 'bilaterally_accepted'
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading match proposal transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_match_proposals_transition_guard
BEFORE UPDATE OR DELETE ON trading_match_proposals
FOR EACH ROW EXECUTE FUNCTION guard_trading_match_proposal_transition();

ALTER TABLE trading_capital_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_capital_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_capital_requests ON trading_capital_requests
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_capital_requests
BEFORE INSERT OR UPDATE OR DELETE ON trading_capital_requests
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE trading_provider_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_provider_mandates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_provider_mandates ON trading_provider_mandates
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_provider_mandates
BEFORE INSERT OR UPDATE OR DELETE ON trading_provider_mandates
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE trading_match_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_match_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_match_proposals ON trading_match_proposals
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_match_proposals
BEFORE INSERT OR UPDATE OR DELETE ON trading_match_proposals
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX trading_capital_requests_tenant_expiry_idx
  ON trading_capital_requests(tenant_id, expires_at, id);
CREATE INDEX trading_provider_mandates_tenant_discovery_idx
  ON trading_provider_mandates(
    tenant_id,
    status,
    asset_id,
    expires_at,
    created_at,
    mandate_hash,
    id
  );
CREATE INDEX trading_match_proposals_tenant_status_idx
  ON trading_match_proposals(tenant_id, status, expires_at, updated_at, id);
