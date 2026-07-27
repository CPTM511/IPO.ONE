CREATE TABLE trading_facility_close_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  facility_state_hash TEXT NOT NULL CHECK (facility_state_hash ~ '^0x[0-9a-f]{64}$'),
  facility_version BIGINT NOT NULL CHECK (facility_version >= 1),
  obligation_id TEXT NOT NULL,
  obligation_hash TEXT NOT NULL CHECK (obligation_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'requested'),
  close_request JSONB NOT NULL CHECK (jsonb_typeof(close_request) = 'object'),
  requested_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  non_redeemable BOOLEAN NOT NULL CHECK (non_redeemable = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL
    CHECK (schema_version = 'trading_facility_close_request.v1'),
  CONSTRAINT trading_facility_close_requests_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT trading_facility_close_requests_tenant_hash_key
    UNIQUE (tenant_id, request_hash),
  CONSTRAINT trading_facility_close_requests_tenant_facility_key
    UNIQUE (tenant_id, facility_id),
  CONSTRAINT trading_facility_close_requests_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT trading_facility_close_requests_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id)
    REFERENCES obligations(tenant_id, id),
  CONSTRAINT trading_facility_close_requests_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT trading_facility_close_requests_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT trading_facility_close_requests_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id),
  CONSTRAINT trading_facility_close_requests_identity_check CHECK (
    close_request->>'tradingFacilityCloseRequestId' = id
    AND close_request->>'requestHash' = request_hash
    AND close_request->>'facilityId' = facility_id
    AND close_request->>'facilityHash' = facility_hash
    AND close_request->>'facilityStateHash' = facility_state_hash
    AND (close_request->>'facilityVersion')::BIGINT = facility_version
    AND close_request->>'obligationId' = obligation_id
    AND close_request->>'obligationHash' = obligation_hash
    AND close_request->>'subjectId' = subject_id
    AND close_request->>'principalId' = principal_id
    AND close_request->>'providerId' = provider_id
    AND close_request->>'status' = status
    AND close_request->>'requestedAt' = to_char(
      requested_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
    AND close_request->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_facility_close_requests_safety_check CHECK (
    close_request @> jsonb_build_object(
      'immutable', true,
      'sandboxOnly', true,
      'syntheticOnly', true,
      'nonRedeemable', true,
      'withdrawable', false,
      'transferable', false,
      'externalSystemQueried', false,
      'externalOrderSubmitted', false,
      'productionAuthority', false,
      'fundsAuthority', false,
      'realCollateral', false,
      'realFunding', false,
      'realEquity', false,
      'realPricing', false,
      'productionFundsMoved', false,
      'piiIncluded', false,
      'secretsIncluded', false
    )
  )
);

CREATE TABLE trading_settlements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  settlement_hash TEXT NOT NULL CHECK (settlement_hash ~ '^0x[0-9a-f]{64}$'),
  close_request_id TEXT NOT NULL,
  close_request_hash TEXT NOT NULL CHECK (close_request_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  obligation_id TEXT NOT NULL,
  obligation_hash TEXT NOT NULL CHECK (obligation_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  final_synthetic_equity_minor NUMERIC(78,0) NOT NULL
    CHECK (final_synthetic_equity_minor >= 0),
  total_allocated_minor NUMERIC(78,0) NOT NULL
    CHECK (total_allocated_minor >= 0),
  status TEXT NOT NULL CHECK (status = 'finalized'),
  settlement JSONB NOT NULL CHECK (jsonb_typeof(settlement) = 'object'),
  settled_at TIMESTAMPTZ NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  non_redeemable BOOLEAN NOT NULL CHECK (non_redeemable = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'trading_settlement.v1'),
  CONSTRAINT trading_settlements_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT trading_settlements_tenant_hash_key
    UNIQUE (tenant_id, settlement_hash),
  CONSTRAINT trading_settlements_tenant_close_request_key
    UNIQUE (tenant_id, close_request_id),
  CONSTRAINT trading_settlements_tenant_facility_key
    UNIQUE (tenant_id, facility_id),
  CONSTRAINT trading_settlements_close_request_fk
    FOREIGN KEY (tenant_id, close_request_id)
    REFERENCES trading_facility_close_requests(tenant_id, id),
  CONSTRAINT trading_settlements_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT trading_settlements_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id)
    REFERENCES obligations(tenant_id, id),
  CONSTRAINT trading_settlements_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT trading_settlements_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT trading_settlements_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id),
  CONSTRAINT trading_settlements_conservation_check
    CHECK (final_synthetic_equity_minor = total_allocated_minor),
  CONSTRAINT trading_settlements_identity_check CHECK (
    settlement->>'tradingSettlementId' = id
    AND settlement->>'settlementHash' = settlement_hash
    AND settlement->>'closeRequestId' = close_request_id
    AND settlement->>'closeRequestHash' = close_request_hash
    AND settlement->>'facilityId' = facility_id
    AND settlement->>'facilityHash' = facility_hash
    AND settlement->>'obligationId' = obligation_id
    AND settlement->>'obligationHash' = obligation_hash
    AND settlement->>'subjectId' = subject_id
    AND settlement->>'principalId' = principal_id
    AND settlement->>'providerId' = provider_id
    AND settlement->>'assetId' = asset_id
    AND (settlement->>'finalSyntheticEquityMinor')::NUMERIC =
      final_synthetic_equity_minor
    AND (settlement->>'totalAllocatedMinor')::NUMERIC = total_allocated_minor
    AND settlement->>'status' = status
    AND settlement->>'settledAt' = to_char(
      settled_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
    AND settlement->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_settlements_safety_check CHECK (
    settlement @> jsonb_build_object(
      'waterfallBalanced', true,
      'zeroExposureVerified', true,
      'canonicalObligationUnchanged', true,
      'canonicalLedgerMutationCreated', false,
      'secondLedgerCreated', false,
      'officialSettlement', false,
      'realizedPnlMinor', '0',
      'venueCostMinor', '0',
      'closingCostMinor', '0',
      'fixedReturnMinor', '0',
      'performanceParticipationMinor', '0',
      'ipoOneFeeMinor', '0',
      'sandboxOnly', true,
      'syntheticOnly', true,
      'nonRedeemable', true,
      'withdrawable', false,
      'transferable', false,
      'externalSystemQueried', false,
      'externalOrderSubmitted', false,
      'productionAuthority', false,
      'fundsAuthority', false,
      'productionFundsMoved', false,
      'piiIncluded', false,
      'secretsIncluded', false
    )
  )
);

CREATE TABLE trading_performance_proofs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  proof_hash TEXT NOT NULL CHECK (proof_hash ~ '^0x[0-9a-f]{64}$'),
  settlement_id TEXT NOT NULL,
  settlement_hash TEXT NOT NULL CHECK (settlement_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  obligation_id TEXT NOT NULL,
  obligation_hash TEXT NOT NULL CHECK (obligation_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  claim_set_hash TEXT NOT NULL CHECK (claim_set_hash ~ '^0x[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status = 'active'),
  proof JSONB NOT NULL CHECK (jsonb_typeof(proof) = 'object'),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > issued_at),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  synthetic_only BOOLEAN NOT NULL CHECK (synthetic_only = TRUE),
  non_redeemable BOOLEAN NOT NULL CHECK (non_redeemable = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL
    CHECK (schema_version = 'trading_performance_proof.v1'),
  CONSTRAINT trading_performance_proofs_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT trading_performance_proofs_tenant_hash_key
    UNIQUE (tenant_id, proof_hash),
  CONSTRAINT trading_performance_proofs_tenant_settlement_key
    UNIQUE (tenant_id, settlement_id),
  CONSTRAINT trading_performance_proofs_settlement_fk
    FOREIGN KEY (tenant_id, settlement_id)
    REFERENCES trading_settlements(tenant_id, id),
  CONSTRAINT trading_performance_proofs_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT trading_performance_proofs_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id)
    REFERENCES obligations(tenant_id, id),
  CONSTRAINT trading_performance_proofs_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT trading_performance_proofs_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT trading_performance_proofs_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id),
  CONSTRAINT trading_performance_proofs_identity_check CHECK (
    proof->>'tradingPerformanceProofId' = id
    AND proof->>'proofHash' = proof_hash
    AND proof->>'settlementId' = settlement_id
    AND proof->>'settlementHash' = settlement_hash
    AND proof->>'facilityId' = facility_id
    AND proof->>'facilityHash' = facility_hash
    AND proof->>'obligationId' = obligation_id
    AND proof->>'obligationHash' = obligation_hash
    AND proof->>'subjectId' = subject_id
    AND proof->>'principalId' = principal_id
    AND proof->>'providerId' = provider_id
    AND proof->>'claimSetHash' = claim_set_hash
    AND proof->>'status' = status
    AND proof->>'issuedAt' = to_char(
      issued_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
    AND proof->>'expiresAt' = to_char(
      expires_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
    AND proof->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_performance_proofs_safety_check CHECK (
    proof @> jsonb_build_object(
      'revocable', true,
      'revoked', false,
      'externalVerificationAvailable', false,
      'officialReport', false,
      'universalScore', false,
      'strategyDataIncluded', false,
      'rawHistoryIncluded', false,
      'sandboxOnly', true,
      'syntheticOnly', true,
      'nonRedeemable', true,
      'withdrawable', false,
      'transferable', false,
      'productionAuthority', false,
      'fundsAuthority', false,
      'productionFundsMoved', false,
      'piiIncluded', false,
      'secretsIncluded', false
    )
  )
);

CREATE INDEX trading_facility_close_requests_tenant_requested_idx
  ON trading_facility_close_requests(tenant_id, requested_at, id);
CREATE INDEX trading_settlements_tenant_settled_idx
  ON trading_settlements(tenant_id, settled_at, id);
CREATE INDEX trading_performance_proofs_tenant_expires_idx
  ON trading_performance_proofs(tenant_id, expires_at, id);

CREATE FUNCTION guard_immutable_trading_settlement_projection()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'trading settlement projections are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_facility_close_requests_immutable_guard
BEFORE UPDATE OR DELETE ON trading_facility_close_requests
FOR EACH ROW EXECUTE FUNCTION guard_immutable_trading_settlement_projection();

CREATE TRIGGER trading_settlements_immutable_guard
BEFORE UPDATE OR DELETE ON trading_settlements
FOR EACH ROW EXECUTE FUNCTION guard_immutable_trading_settlement_projection();

CREATE TRIGGER trading_performance_proofs_immutable_guard
BEFORE UPDATE OR DELETE ON trading_performance_proofs
FOR EACH ROW EXECUTE FUNCTION guard_immutable_trading_settlement_projection();

ALTER TABLE trading_facility_close_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_facility_close_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_facility_close_requests
  ON trading_facility_close_requests
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_facility_close_requests
BEFORE INSERT OR UPDATE OR DELETE ON trading_facility_close_requests
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE trading_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_settlements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_settlements ON trading_settlements
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_settlements
BEFORE INSERT OR UPDATE OR DELETE ON trading_settlements
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE trading_performance_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_performance_proofs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_performance_proofs
  ON trading_performance_proofs
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_performance_proofs
BEFORE INSERT OR UPDATE OR DELETE ON trading_performance_proofs
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();
