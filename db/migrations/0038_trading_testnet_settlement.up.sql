CREATE TABLE trading_testnet_settlement_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id()
    REFERENCES tenants(id),
  settlement_hash TEXT NOT NULL CHECK (
    settlement_hash ~ '^0x[0-9a-f]{64}$'
  ),
  state_hash TEXT NOT NULL CHECK (state_hash ~ '^0x[0-9a-f]{64}$'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^0x[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL CHECK (
    idempotency_key_hash ~ '^0x[0-9a-f]{64}$'
  ),
  authorization_decision_hash TEXT NOT NULL CHECK (
    authorization_decision_hash ~ '^0x[0-9a-f]{64}$'
  ),
  admission_decision_hash TEXT NOT NULL CHECK (
    admission_decision_hash ~ '^0x[0-9a-f]{64}$'
  ),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  facility_state_hash_before TEXT NOT NULL CHECK (
    facility_state_hash_before ~ '^0x[0-9a-f]{64}$'
  ),
  facility_version_before BIGINT NOT NULL CHECK (
    facility_version_before BETWEEN 1 AND 1000000
  ),
  funding_id TEXT NOT NULL,
  funding_hash TEXT NOT NULL CHECK (funding_hash ~ '^0x[0-9a-f]{64}$'),
  close_request_id TEXT NOT NULL,
  close_request_hash TEXT NOT NULL CHECK (
    close_request_hash ~ '^0x[0-9a-f]{64}$'
  ),
  obligation_id TEXT NOT NULL,
  obligation_hash TEXT NOT NULL CHECK (
    obligation_hash ~ '^0x[0-9a-f]{64}$'
  ),
  subject_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (
    template_type IN ('credit', 'performance_participation', 'hybrid')
  ),
  terms_hash TEXT NOT NULL CHECK (terms_hash ~ '^0x[0-9a-f]{64}$'),
  fixed_return_bps INTEGER NOT NULL CHECK (
    fixed_return_bps BETWEEN 0 AND 10000
  ),
  performance_participation_bps INTEGER NOT NULL CHECK (
    performance_participation_bps BETWEEN 0 AND 10000
  ),
  duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 3650),
  subject_contribution_minor NUMERIC(78, 0) NOT NULL CHECK (
    subject_contribution_minor > 0
  ),
  provider_contribution_minor NUMERIC(78, 0) NOT NULL CHECK (
    provider_contribution_minor > 0
  ),
  final_reconciliation_hash TEXT NOT NULL CHECK (
    final_reconciliation_hash ~ '^0x[0-9a-f]{64}$'
  ),
  fee_policy_id TEXT NOT NULL,
  fee_policy_hash TEXT NOT NULL CHECK (
    fee_policy_hash ~ '^0x[0-9a-f]{64}$'
  ),
  fee_approval_evidence_hash TEXT NOT NULL CHECK (
    fee_approval_evidence_hash ~ '^0x[0-9a-f]{64}$'
  ),
  ipo_one_fee_bps INTEGER NOT NULL CHECK (
    ipo_one_fee_bps BETWEEN 0 AND 10000
  ),
  canonical_ledger_state_hash_before TEXT NOT NULL CHECK (
    canonical_ledger_state_hash_before ~ '^0x[0-9a-f]{64}$'
  ),
  ledger_transaction_count_before BIGINT NOT NULL CHECK (
    ledger_transaction_count_before >= 0
  ),
  processed_observation_count INTEGER NOT NULL CHECK (
    processed_observation_count BETWEEN 0 AND 1000000
  ),
  final_observation_hash TEXT CHECK (
    final_observation_hash IS NULL
    OR final_observation_hash ~ '^0x[0-9a-f]{64}$'
  ),
  final_source_evidence_hash TEXT CHECK (
    final_source_evidence_hash IS NULL
    OR final_source_evidence_hash ~ '^0x[0-9a-f]{64}$'
  ),
  realized_pnl_minor NUMERIC(78, 0),
  venue_cost_minor NUMERIC(78, 0) CHECK (
    venue_cost_minor IS NULL OR venue_cost_minor >= 0
  ),
  closing_cost_minor NUMERIC(78, 0) CHECK (
    closing_cost_minor IS NULL OR closing_cost_minor >= 0
  ),
  final_equity_minor NUMERIC(78, 0) CHECK (
    final_equity_minor IS NULL OR final_equity_minor >= 0
  ),
  ledger_transaction_id TEXT,
  ledger_transaction_hash TEXT CHECK (
    ledger_transaction_hash IS NULL
    OR ledger_transaction_hash ~ '^0x[0-9a-f]{64}$'
  ),
  facility_state_hash_after TEXT CHECK (
    facility_state_hash_after IS NULL
    OR facility_state_hash_after ~ '^0x[0-9a-f]{64}$'
  ),
  facility_version_after BIGINT CHECK (
    facility_version_after IS NULL
    OR facility_version_after BETWEEN 2 AND 1000001
  ),
  performance_evidence_hash TEXT CHECK (
    performance_evidence_hash IS NULL
    OR performance_evidence_hash ~ '^0x[0-9a-f]{64}$'
  ),
  performance_evidence_version INTEGER NOT NULL CHECK (
    performance_evidence_version BETWEEN 0 AND 100
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'AWAITING_FINALITY',
      'READY_TO_SETTLE',
      'SETTLED',
      'EVIDENCE_ACTIVE',
      'EVIDENCE_REVOKED',
      'INCIDENT'
    )
  ),
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 1000000),
  record JSONB NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  simulation_only BOOLEAN NOT NULL CHECK (simulation_only = TRUE),
  payout_executed BOOLEAN NOT NULL CHECK (payout_executed = FALSE),
  canonical_ledger_transaction_created BOOLEAN NOT NULL,
  second_facility_created BOOLEAN NOT NULL CHECK (
    second_facility_created = FALSE
  ),
  second_obligation_created BOOLEAN NOT NULL CHECK (
    second_obligation_created = FALSE
  ),
  second_ledger_created BOOLEAN NOT NULL CHECK (
    second_ledger_created = FALSE
  ),
  principal_guarantee_created BOOLEAN NOT NULL CHECK (
    principal_guarantee_created = FALSE
  ),
  synthetic_receivable_created BOOLEAN NOT NULL CHECK (
    synthetic_receivable_created = FALSE
  ),
  dynamic_repricing_applied BOOLEAN NOT NULL CHECK (
    dynamic_repricing_applied = FALSE
  ),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (
    production_authority = FALSE
  ),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'hyperliquid_testnet_simulated_settlement.v1'
  ),
  CONSTRAINT trading_testnet_settlement_runs_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT trading_testnet_settlement_runs_tenant_hash_key
    UNIQUE (tenant_id, settlement_hash),
  CONSTRAINT trading_testnet_settlement_runs_tenant_request_key
    UNIQUE (tenant_id, request_hash),
  CONSTRAINT trading_testnet_settlement_runs_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key_hash),
  CONSTRAINT trading_testnet_settlement_runs_facility_key
    UNIQUE (tenant_id, facility_id),
  CONSTRAINT trading_testnet_settlement_runs_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT trading_testnet_settlement_runs_funding_fk
    FOREIGN KEY (tenant_id, funding_id)
    REFERENCES trading_testnet_facility_funding_controls(tenant_id, id),
  CONSTRAINT trading_testnet_settlement_runs_close_request_fk
    FOREIGN KEY (tenant_id, close_request_id)
    REFERENCES trading_facility_close_requests(tenant_id, id),
  CONSTRAINT trading_testnet_settlement_runs_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id)
    REFERENCES obligations(tenant_id, id),
  CONSTRAINT trading_testnet_settlement_runs_subject_fk
    FOREIGN KEY (tenant_id, subject_id)
    REFERENCES subjects(tenant_id, id),
  CONSTRAINT trading_testnet_settlement_runs_ledger_transaction_fk
    FOREIGN KEY (tenant_id, ledger_transaction_id)
    REFERENCES ledger_transactions(tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT trading_testnet_settlement_runs_template_check CHECK (
    (template_type = 'credit' AND performance_participation_bps = 0)
    OR (
      template_type = 'performance_participation'
      AND fixed_return_bps = 0
    )
    OR template_type = 'hybrid'
  ),
  CONSTRAINT trading_testnet_settlement_runs_economics_check CHECK (
    (
      realized_pnl_minor IS NULL
      AND venue_cost_minor IS NULL
      AND closing_cost_minor IS NULL
      AND final_equity_minor IS NULL
    )
    OR (
      realized_pnl_minor IS NOT NULL
      AND venue_cost_minor IS NOT NULL
      AND closing_cost_minor IS NOT NULL
      AND final_equity_minor IS NOT NULL
      AND final_equity_minor =
        subject_contribution_minor + provider_contribution_minor
        + realized_pnl_minor - venue_cost_minor - closing_cost_minor
    )
  ),
  CONSTRAINT trading_testnet_settlement_runs_state_check CHECK (
    (
      status = 'AWAITING_FINALITY'
      AND final_observation_hash IS NULL
      AND ledger_transaction_id IS NULL
      AND settled_at IS NULL
      AND canonical_ledger_transaction_created = FALSE
    )
    OR (
      status = 'READY_TO_SETTLE'
      AND final_observation_hash IS NOT NULL
      AND final_source_evidence_hash IS NOT NULL
      AND final_equity_minor IS NOT NULL
      AND ledger_transaction_id IS NULL
      AND settled_at IS NULL
      AND canonical_ledger_transaction_created = FALSE
    )
    OR (
      status IN ('SETTLED', 'EVIDENCE_ACTIVE', 'EVIDENCE_REVOKED')
      AND final_observation_hash IS NOT NULL
      AND final_source_evidence_hash IS NOT NULL
      AND final_equity_minor IS NOT NULL
      AND ledger_transaction_id IS NOT NULL
      AND ledger_transaction_hash IS NOT NULL
      AND facility_state_hash_after IS NOT NULL
      AND facility_version_after IS NOT NULL
      AND settled_at IS NOT NULL
      AND canonical_ledger_transaction_created = TRUE
    )
    OR status = 'INCIDENT'
  ),
  CONSTRAINT trading_testnet_settlement_runs_evidence_check CHECK (
    (
      status IN (
        'AWAITING_FINALITY',
        'READY_TO_SETTLE',
        'SETTLED',
        'INCIDENT'
      )
      AND performance_evidence_hash IS NULL
      AND performance_evidence_version = 0
    )
    OR (
      status IN ('EVIDENCE_ACTIVE', 'EVIDENCE_REVOKED')
      AND performance_evidence_hash IS NOT NULL
      AND performance_evidence_version >= 1
    )
  ),
  CONSTRAINT trading_testnet_settlement_runs_identity_check CHECK (
    record->>'settlementId' = id
    AND record->>'settlementHash' = settlement_hash
    AND record->>'stateHash' = state_hash
    AND record->>'requestHash' = request_hash
    AND record->>'idempotencyKeyHash' = idempotency_key_hash
    AND record->>'authorizationDecisionHash' = authorization_decision_hash
    AND record->>'admissionDecisionHash' = admission_decision_hash
    AND record->>'facilityId' = facility_id
    AND record->>'facilityHash' = facility_hash
    AND record->>'facilityStateHashBefore' = facility_state_hash_before
    AND (record->>'facilityVersionBefore')::BIGINT =
      facility_version_before
    AND record->>'fundingId' = funding_id
    AND record->>'fundingHash' = funding_hash
    AND record->>'closeRequestId' = close_request_id
    AND record->>'closeRequestHash' = close_request_hash
    AND record->>'obligationId' = obligation_id
    AND record->>'obligationHash' = obligation_hash
    AND record->>'subjectId' = subject_id
    AND record->>'assetId' = asset_id
    AND record->>'templateType' = template_type
    AND record->>'termsHash' = terms_hash
    AND (record->>'fixedReturnBps')::INTEGER = fixed_return_bps
    AND (record->>'performanceParticipationBps')::INTEGER =
      performance_participation_bps
    AND (record->>'durationDays')::INTEGER = duration_days
    AND record->>'subjectContributionMinor' =
      subject_contribution_minor::TEXT
    AND record->>'providerContributionMinor' =
      provider_contribution_minor::TEXT
    AND record->>'finalReconciliationHash' = final_reconciliation_hash
    AND record->>'feePolicyId' = fee_policy_id
    AND record->>'feePolicyHash' = fee_policy_hash
    AND record->>'feeApprovalEvidenceHash' = fee_approval_evidence_hash
    AND (record->>'ipoOneFeeBps')::INTEGER = ipo_one_fee_bps
    AND record->>'canonicalLedgerStateHashBefore' =
      canonical_ledger_state_hash_before
    AND (record->>'ledgerTransactionCountBefore')::BIGINT =
      ledger_transaction_count_before
    AND (record->>'processedObservationCount')::INTEGER =
      processed_observation_count
    AND (record->>'finalObservationHash') IS NOT DISTINCT FROM
      final_observation_hash
    AND (record->>'finalSourceEvidenceHash') IS NOT DISTINCT FROM
      final_source_evidence_hash
    AND (record->>'realizedPnlMinor') IS NOT DISTINCT FROM
      realized_pnl_minor::TEXT
    AND (record->>'venueCostMinor') IS NOT DISTINCT FROM
      venue_cost_minor::TEXT
    AND (record->>'closingCostMinor') IS NOT DISTINCT FROM
      closing_cost_minor::TEXT
    AND (record->>'finalEquityMinor') IS NOT DISTINCT FROM
      final_equity_minor::TEXT
    AND (record->>'ledgerTransactionId') IS NOT DISTINCT FROM
      ledger_transaction_id
    AND (record->>'ledgerTransactionHash') IS NOT DISTINCT FROM
      ledger_transaction_hash
    AND (record->>'facilityStateHashAfter') IS NOT DISTINCT FROM
      facility_state_hash_after
    AND (record->>'facilityVersionAfter')::BIGINT IS NOT DISTINCT FROM
      facility_version_after
    AND (record->'currentPerformanceEvidence'->>
      'performanceEvidenceHash') IS NOT DISTINCT FROM
      performance_evidence_hash
    AND (record->>'performanceEvidenceVersion')::INTEGER =
      performance_evidence_version
    AND record->>'status' = status
    AND (record->>'version')::BIGINT = version
    AND record->>'createdAt' = to_char(
      created_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
    AND record->>'updatedAt' = to_char(
      updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
    AND (record->>'settledAt') IS NOT DISTINCT FROM
      CASE WHEN settled_at IS NULL THEN NULL ELSE to_char(
        settled_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ) END
    AND (record->>'simulationOnly')::BOOLEAN = simulation_only
    AND (record->>'payoutExecuted')::BOOLEAN = payout_executed
    AND (record->>'canonicalLedgerTransactionCreated')::BOOLEAN =
      canonical_ledger_transaction_created
    AND (record->>'secondFacilityCreated')::BOOLEAN =
      second_facility_created
    AND (record->>'secondObligationCreated')::BOOLEAN =
      second_obligation_created
    AND (record->>'secondLedgerCreated')::BOOLEAN =
      second_ledger_created
    AND (record->>'principalGuaranteeCreated')::BOOLEAN =
      principal_guarantee_created
    AND (record->>'syntheticReceivableCreated')::BOOLEAN =
      synthetic_receivable_created
    AND (record->>'dynamicRepricingApplied')::BOOLEAN =
      dynamic_repricing_applied
    AND (record->>'mainnetAuthority')::BOOLEAN = mainnet_authority
    AND (record->>'productionAuthority')::BOOLEAN =
      production_authority
    AND (record->>'fundsAuthority')::BOOLEAN = funds_authority
    AND (record->>'secretsIncluded')::BOOLEAN = secrets_included
    AND record->>'schemaVersion' = schema_version
  ),
  CONSTRAINT trading_testnet_settlement_runs_safety_check CHECK (
    record @> jsonb_build_object(
      'economicTermsImmutable', true,
      'feePolicyVersioned', true,
      'finalReconciliationRequired', true,
      'noPayoutBeforeFinality', true,
      'performanceEvidenceRevocable', true,
      'environment', 'hyperliquid_testnet',
      'testnetOnly', true,
      'simulationOnly', true,
      'protectedTestnetE2EOnly', true,
      'nonRedeemable', true,
      'payoutExecuted', false,
      'withdrawalExecuted', false,
      'transferExecuted', false,
      'externalSystemQueried', false,
      'externalCloseSubmitted', false,
      'liveTransportApproved', false,
      'liveAccountsApproved', false,
      'apiWalletApproved', false,
      'rawAddressPersisted', false,
      'rawResponsePersisted', false,
      'reusableSignaturePersisted', false,
      'canonicalFacility', true,
      'canonicalObligation', true,
      'canonicalLedger', true,
      'secondFacilityCreated', false,
      'secondObligationCreated', false,
      'secondLedgerCreated', false,
      'principalGuaranteeCreated', false,
      'syntheticReceivableCreated', false,
      'dynamicRepricingApplied', false,
      'mainnetAuthority', false,
      'productionAuthority', false,
      'fundsAuthority', false,
      'realFunds', false,
      'productionFundsMoved', false,
      'piiIncluded', false,
      'secretsIncluded', false
    )
  )
);

CREATE FUNCTION guard_trading_testnet_settlement_run()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Trading Testnet settlement runs cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id
    OR NEW.id <> OLD.id
    OR NEW.settlement_hash <> OLD.settlement_hash
    OR NEW.request_hash <> OLD.request_hash
    OR NEW.idempotency_key_hash <> OLD.idempotency_key_hash
    OR NEW.authorization_decision_hash <> OLD.authorization_decision_hash
    OR NEW.admission_decision_hash <> OLD.admission_decision_hash
    OR NEW.facility_id <> OLD.facility_id
    OR NEW.facility_hash <> OLD.facility_hash
    OR NEW.facility_state_hash_before <> OLD.facility_state_hash_before
    OR NEW.facility_version_before <> OLD.facility_version_before
    OR NEW.funding_id <> OLD.funding_id
    OR NEW.funding_hash <> OLD.funding_hash
    OR NEW.close_request_id <> OLD.close_request_id
    OR NEW.close_request_hash <> OLD.close_request_hash
    OR NEW.obligation_id <> OLD.obligation_id
    OR NEW.obligation_hash <> OLD.obligation_hash
    OR NEW.subject_id <> OLD.subject_id
    OR NEW.asset_id <> OLD.asset_id
    OR NEW.template_type <> OLD.template_type
    OR NEW.terms_hash <> OLD.terms_hash
    OR NEW.fixed_return_bps <> OLD.fixed_return_bps
    OR NEW.performance_participation_bps <>
      OLD.performance_participation_bps
    OR NEW.duration_days <> OLD.duration_days
    OR NEW.subject_contribution_minor <> OLD.subject_contribution_minor
    OR NEW.provider_contribution_minor <> OLD.provider_contribution_minor
    OR NEW.final_reconciliation_hash <> OLD.final_reconciliation_hash
    OR NEW.fee_policy_id <> OLD.fee_policy_id
    OR NEW.fee_policy_hash <> OLD.fee_policy_hash
    OR NEW.fee_approval_evidence_hash <> OLD.fee_approval_evidence_hash
    OR NEW.ipo_one_fee_bps <> OLD.ipo_one_fee_bps
    OR NEW.canonical_ledger_state_hash_before <>
      OLD.canonical_ledger_state_hash_before
    OR NEW.ledger_transaction_count_before <>
      OLD.ledger_transaction_count_before
    OR NEW.created_at <> OLD.created_at
    OR NEW.simulation_only <> OLD.simulation_only
    OR NEW.payout_executed <> OLD.payout_executed
    OR NEW.second_facility_created <> OLD.second_facility_created
    OR NEW.second_obligation_created <> OLD.second_obligation_created
    OR NEW.second_ledger_created <> OLD.second_ledger_created
    OR NEW.principal_guarantee_created <> OLD.principal_guarantee_created
    OR NEW.synthetic_receivable_created <> OLD.synthetic_receivable_created
    OR NEW.dynamic_repricing_applied <> OLD.dynamic_repricing_applied
    OR NEW.mainnet_authority <> OLD.mainnet_authority
    OR NEW.production_authority <> OLD.production_authority
    OR NEW.funds_authority <> OLD.funds_authority
    OR NEW.secrets_included <> OLD.secrets_included
    OR NEW.schema_version <> OLD.schema_version
    OR NEW.version <> OLD.version + 1
    OR NEW.processed_observation_count < OLD.processed_observation_count
    OR NEW.performance_evidence_version <
      OLD.performance_evidence_version
    OR OLD.status = 'INCIDENT'
    OR NOT (
      NEW.status = OLD.status
      OR (
        OLD.status = 'AWAITING_FINALITY'
        AND NEW.status IN ('READY_TO_SETTLE', 'INCIDENT')
      )
      OR (
        OLD.status = 'READY_TO_SETTLE'
        AND NEW.status IN ('SETTLED', 'INCIDENT')
      )
      OR (
        OLD.status = 'SETTLED'
        AND NEW.status = 'EVIDENCE_ACTIVE'
      )
      OR (
        OLD.status = 'EVIDENCE_ACTIVE'
        AND NEW.status IN ('EVIDENCE_ACTIVE', 'EVIDENCE_REVOKED')
      )
      OR (
        OLD.status = 'EVIDENCE_REVOKED'
        AND NEW.status = 'EVIDENCE_ACTIVE'
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Trading Testnet settlement transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_testnet_settlement_runs_transition_guard
BEFORE UPDATE OR DELETE ON trading_testnet_settlement_runs
FOR EACH ROW EXECUTE FUNCTION guard_trading_testnet_settlement_run();

ALTER TABLE trading_testnet_settlement_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_testnet_settlement_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_testnet_settlement_runs
  ON trading_testnet_settlement_runs
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_testnet_settlement_runs
BEFORE INSERT OR UPDATE OR DELETE ON trading_testnet_settlement_runs
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX trading_testnet_settlement_runs_tenant_state_idx
  ON trading_testnet_settlement_runs(
    tenant_id,
    status,
    updated_at,
    id
  );
CREATE INDEX trading_testnet_settlement_runs_tenant_subject_idx
  ON trading_testnet_settlement_runs(
    tenant_id,
    subject_id,
    status,
    updated_at,
    id
  );
