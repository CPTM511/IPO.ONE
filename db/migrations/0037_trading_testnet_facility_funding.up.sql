CREATE TABLE trading_testnet_facility_funding_controls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id()
    REFERENCES tenants(id),
  funding_hash TEXT NOT NULL CHECK (funding_hash ~ '^0x[0-9a-f]{64}$'),
  state_hash TEXT NOT NULL CHECK (state_hash ~ '^0x[0-9a-f]{64}$'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^0x[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL
    CHECK (idempotency_key_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  facility_state_hash TEXT NOT NULL
    CHECK (facility_state_hash ~ '^0x[0-9a-f]{64}$'),
  facility_version BIGINT NOT NULL CHECK (facility_version >= 1),
  obligation_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  bilateral_terms_hash TEXT NOT NULL
    CHECK (bilateral_terms_hash ~ '^0x[0-9a-f]{64}$'),
  asset_id TEXT NOT NULL,
  required_subject_contribution_minor NUMERIC(78, 0) NOT NULL
    CHECK (required_subject_contribution_minor > 0),
  required_provider_contribution_minor NUMERIC(78, 0) NOT NULL
    CHECK (required_provider_contribution_minor > 0),
  maximum_facility_cap_minor NUMERIC(78, 0) NOT NULL
    CHECK (maximum_facility_cap_minor > 0),
  facility_destination_hash TEXT NOT NULL
    CHECK (facility_destination_hash ~ '^0x[0-9a-f]{64}$'),
  account_binding_hash TEXT NOT NULL
    CHECK (account_binding_hash ~ '^0x[0-9a-f]{64}$'),
  master_account_hash TEXT NOT NULL
    CHECK (master_account_hash ~ '^0x[0-9a-f]{64}$'),
  withdrawal_authority_hash TEXT NOT NULL
    CHECK (withdrawal_authority_hash ~ '^0x[0-9a-f]{64}$'),
  execution_signer_reference_hash TEXT NOT NULL
    CHECK (execution_signer_reference_hash ~ '^0x[0-9a-f]{64}$'),
  subject_contribution_minor NUMERIC(78, 0) NOT NULL
    CHECK (subject_contribution_minor >= 0),
  provider_contribution_minor NUMERIC(78, 0) NOT NULL
    CHECK (provider_contribution_minor >= 0),
  reconciled_total_minor NUMERIC(78, 0) NOT NULL
    CHECK (
      reconciled_total_minor >= 0
      AND reconciled_total_minor =
        subject_contribution_minor + provider_contribution_minor
      AND reconciled_total_minor <= maximum_facility_cap_minor
    ),
  subject_receipt_hash TEXT CHECK (
    subject_receipt_hash IS NULL
    OR subject_receipt_hash ~ '^0x[0-9a-f]{64}$'
  ),
  provider_receipt_hash TEXT CHECK (
    provider_receipt_hash IS NULL
    OR provider_receipt_hash ~ '^0x[0-9a-f]{64}$'
  ),
  subject_contribution_finalized BOOLEAN NOT NULL,
  provider_contribution_finalized BOOLEAN NOT NULL,
  processed_receipt_count INTEGER NOT NULL
    CHECK (processed_receipt_count BETWEEN 0 AND 1000000),
  latest_source_evidence_hash TEXT CHECK (
    latest_source_evidence_hash IS NULL
    OR latest_source_evidence_hash ~ '^0x[0-9a-f]{64}$'
  ),
  canonical_ledger_state_hash TEXT NOT NULL
    CHECK (canonical_ledger_state_hash ~ '^0x[0-9a-f]{64}$'),
  ledger_transaction_count BIGINT NOT NULL
    CHECK (ledger_transaction_count >= 0),
  risk_snapshot_hash TEXT NOT NULL
    CHECK (risk_snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  authorization_decision_hash TEXT NOT NULL
    CHECK (authorization_decision_hash ~ '^0x[0-9a-f]{64}$'),
  admission_decision_hash TEXT NOT NULL
    CHECK (admission_decision_hash ~ '^0x[0-9a-f]{64}$'),
  activated_by_actor_hash TEXT CHECK (
    activated_by_actor_hash IS NULL
    OR activated_by_actor_hash ~ '^0x[0-9a-f]{64}$'
  ),
  activation_evidence_hash TEXT CHECK (
    activation_evidence_hash IS NULL
    OR activation_evidence_hash ~ '^0x[0-9a-f]{64}$'
  ),
  activation_idempotency_key_hash TEXT CHECK (
    activation_idempotency_key_hash IS NULL
    OR activation_idempotency_key_hash ~ '^0x[0-9a-f]{64}$'
  ),
  activation_command_hash TEXT CHECK (
    activation_command_hash IS NULL
    OR activation_command_hash ~ '^0x[0-9a-f]{64}$'
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'AWAITING_CONTRIBUTIONS',
      'AWAITING_SUBJECT',
      'AWAITING_PROVIDER',
      'READY',
      'ACTIVE',
      'INCIDENT'
    )
  ),
  result_hash TEXT CHECK (
    result_hash IS NULL OR result_hash ~ '^0x[0-9a-f]{64}$'
  ),
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 1000000),
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ,
  simulation_only BOOLEAN NOT NULL CHECK (simulation_only = TRUE),
  non_redeemable BOOLEAN NOT NULL CHECK (non_redeemable = TRUE),
  direct_facility_destination BOOLEAN NOT NULL
    CHECK (direct_facility_destination = TRUE),
  trader_wallet_pass_through BOOLEAN NOT NULL
    CHECK (trader_wallet_pass_through = FALSE),
  trader_withdrawal_authority BOOLEAN NOT NULL
    CHECK (trader_withdrawal_authority = FALSE),
  canonical_facility_mutation_created BOOLEAN NOT NULL,
  ledger_mutation_created BOOLEAN NOT NULL
    CHECK (ledger_mutation_created = FALSE),
  second_facility_created BOOLEAN NOT NULL
    CHECK (second_facility_created = FALSE),
  second_ledger_created BOOLEAN NOT NULL
    CHECK (second_ledger_created = FALSE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL
    CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (
    schema_version =
      'hyperliquid_testnet_simulated_facility_funding.v1'
  ),
  CONSTRAINT trading_testnet_facility_funding_controls_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT trading_testnet_facility_funding_controls_tenant_hash_key
    UNIQUE (tenant_id, funding_hash),
  CONSTRAINT trading_testnet_facility_funding_controls_tenant_request_key
    UNIQUE (tenant_id, request_hash),
  CONSTRAINT trading_testnet_facility_funding_controls_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key_hash),
  CONSTRAINT trading_testnet_facility_funding_controls_facility_key
    UNIQUE (tenant_id, facility_id),
  CONSTRAINT trading_testnet_facility_funding_controls_activation_key
    UNIQUE (tenant_id, activation_idempotency_key_hash),
  CONSTRAINT trading_testnet_facility_funding_controls_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT trading_testnet_facility_funding_controls_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id)
    REFERENCES obligations(tenant_id, id),
  CONSTRAINT trading_testnet_facility_funding_controls_subject_fk
    FOREIGN KEY (tenant_id, subject_id)
    REFERENCES subjects(tenant_id, id),
  CONSTRAINT trading_testnet_facility_funding_controls_authority_separation
    CHECK (
      facility_destination_hash <> master_account_hash
      AND facility_destination_hash <> withdrawal_authority_hash
      AND facility_destination_hash <> execution_signer_reference_hash
      AND master_account_hash <> withdrawal_authority_hash
      AND master_account_hash <> execution_signer_reference_hash
      AND withdrawal_authority_hash <> execution_signer_reference_hash
    ),
  CONSTRAINT trading_testnet_facility_funding_controls_balance_check CHECK (
    (
      subject_contribution_finalized = FALSE
      AND subject_receipt_hash IS NULL
      AND subject_contribution_minor = 0
    )
    OR (
      subject_contribution_finalized = TRUE
      AND subject_receipt_hash IS NOT NULL
      AND subject_contribution_minor =
        required_subject_contribution_minor
    )
  ),
  CONSTRAINT trading_testnet_facility_funding_controls_provider_check CHECK (
    (
      provider_contribution_finalized = FALSE
      AND provider_receipt_hash IS NULL
      AND provider_contribution_minor = 0
    )
    OR (
      provider_contribution_finalized = TRUE
      AND provider_receipt_hash IS NOT NULL
      AND provider_contribution_minor =
        required_provider_contribution_minor
    )
  ),
  CONSTRAINT trading_testnet_facility_funding_controls_state_check CHECK (
    (
      status = 'AWAITING_CONTRIBUTIONS'
      AND subject_contribution_finalized = FALSE
      AND provider_contribution_finalized = FALSE
      AND canonical_facility_mutation_created = FALSE
      AND result_hash IS NULL
      AND activated_at IS NULL
    )
    OR (
      status = 'AWAITING_SUBJECT'
      AND subject_contribution_finalized = FALSE
      AND provider_contribution_finalized = TRUE
      AND canonical_facility_mutation_created = FALSE
      AND result_hash IS NULL
      AND activated_at IS NULL
    )
    OR (
      status = 'AWAITING_PROVIDER'
      AND subject_contribution_finalized = TRUE
      AND provider_contribution_finalized = FALSE
      AND canonical_facility_mutation_created = FALSE
      AND result_hash IS NULL
      AND activated_at IS NULL
    )
    OR (
      status = 'READY'
      AND subject_contribution_finalized = TRUE
      AND provider_contribution_finalized = TRUE
      AND canonical_facility_mutation_created = FALSE
      AND result_hash IS NULL
      AND activated_at IS NULL
    )
    OR (
      status = 'ACTIVE'
      AND subject_contribution_finalized = TRUE
      AND provider_contribution_finalized = TRUE
      AND canonical_facility_mutation_created = TRUE
      AND activated_by_actor_hash IS NOT NULL
      AND activation_evidence_hash IS NOT NULL
      AND activation_idempotency_key_hash IS NOT NULL
      AND activation_command_hash IS NOT NULL
      AND result_hash IS NOT NULL
      AND activated_at IS NOT NULL
    )
    OR (
      status = 'INCIDENT'
      AND canonical_facility_mutation_created = FALSE
      AND result_hash IS NOT NULL
      AND activated_at IS NULL
    )
  ),
  CONSTRAINT trading_testnet_facility_funding_controls_identity_check CHECK (
    record->>'fundingId' = id
    AND record->>'fundingHash' = funding_hash
    AND record->>'stateHash' = state_hash
    AND record->>'requestHash' = request_hash
    AND record->>'idempotencyKeyHash' = idempotency_key_hash
    AND record->>'facilityId' = facility_id
    AND record->>'facilityHash' = facility_hash
    AND record->>'facilityStateHash' = facility_state_hash
    AND (record->>'facilityVersion')::BIGINT = facility_version
    AND record->>'facilityLifecycleStatus' = 'ready_for_activation'
    AND record->>'obligationId' = obligation_id
    AND record->>'subjectId' = subject_id
    AND record->>'bilateralTermsHash' = bilateral_terms_hash
    AND record->>'assetId' = asset_id
    AND record->>'requiredSubjectContributionMinor' =
      required_subject_contribution_minor::TEXT
    AND record->>'requiredProviderContributionMinor' =
      required_provider_contribution_minor::TEXT
    AND record->>'maximumFacilityCapMinor' =
      maximum_facility_cap_minor::TEXT
    AND record->>'facilityDestinationHash' = facility_destination_hash
    AND record->>'accountBindingHash' = account_binding_hash
    AND record->>'masterAccountHash' = master_account_hash
    AND record->>'withdrawalAuthorityHash' = withdrawal_authority_hash
    AND record->>'executionSignerReferenceHash' =
      execution_signer_reference_hash
    AND record->>'subjectContributionMinor' =
      subject_contribution_minor::TEXT
    AND record->>'providerContributionMinor' =
      provider_contribution_minor::TEXT
    AND record->>'reconciledTotalMinor' = reconciled_total_minor::TEXT
    AND (record->>'subjectContributionFinalized')::BOOLEAN =
      subject_contribution_finalized
    AND (record->>'providerContributionFinalized')::BOOLEAN =
      provider_contribution_finalized
    AND (record->>'processedReceiptCount')::INTEGER =
      processed_receipt_count
    AND (record->>'subjectReceiptHash') IS NOT DISTINCT FROM
      subject_receipt_hash
    AND (record->>'providerReceiptHash') IS NOT DISTINCT FROM
      provider_receipt_hash
    AND (record->>'latestSourceEvidenceHash') IS NOT DISTINCT FROM
      latest_source_evidence_hash
    AND record->>'canonicalLedgerStateHash' =
      canonical_ledger_state_hash
    AND (record->>'ledgerTransactionCount')::BIGINT =
      ledger_transaction_count
    AND record->>'riskSnapshotHash' = risk_snapshot_hash
    AND record->>'authorizationDecisionHash' =
      authorization_decision_hash
    AND record->>'admissionDecisionHash' = admission_decision_hash
    AND (record->>'activatedByActorHash') IS NOT DISTINCT FROM
      activated_by_actor_hash
    AND (record->>'activationEvidenceHash') IS NOT DISTINCT FROM
      activation_evidence_hash
    AND (record->>'activationIdempotencyKeyHash') IS NOT DISTINCT FROM
      activation_idempotency_key_hash
    AND (record->>'activationCommandHash') IS NOT DISTINCT FROM
      activation_command_hash
    AND record->>'status' = status
    AND (record->>'resultHash') IS NOT DISTINCT FROM result_hash
    AND (record->>'version')::BIGINT = version
    AND record->>'schemaVersion' = schema_version
    AND record->>'environment' = 'hyperliquid_testnet'
    AND (record->>'testnetOnly')::BOOLEAN = TRUE
    AND (record->>'simulationOnly')::BOOLEAN = simulation_only
    AND (record->>'protectedTestnetE2EOnly')::BOOLEAN = TRUE
    AND (record->>'nonRedeemable')::BOOLEAN = non_redeemable
    AND (record->>'directFacilityDestination')::BOOLEAN =
      direct_facility_destination
    AND (record->>'pooledCapital')::BOOLEAN = FALSE
    AND (record->>'traderWalletPassThrough')::BOOLEAN =
      trader_wallet_pass_through
    AND (record->>'traderWithdrawalAuthority')::BOOLEAN =
      trader_withdrawal_authority
    AND (record->>'masterWithdrawalAuthoritySeparated')::BOOLEAN = TRUE
    AND (record->>'executionSignerSeparated')::BOOLEAN = TRUE
    AND (record->>'externalSystemQueried')::BOOLEAN = FALSE
    AND (record->>'externalContributionSubmitted')::BOOLEAN = FALSE
    AND (record->>'liveTransportApproved')::BOOLEAN = FALSE
    AND (record->>'liveAccountsApproved')::BOOLEAN = FALSE
    AND (record->>'apiWalletApproved')::BOOLEAN = FALSE
    AND (record->>'rawAddressPersisted')::BOOLEAN = FALSE
    AND (record->>'rawResponsePersisted')::BOOLEAN = FALSE
    AND (record->>'reusableSignaturePersisted')::BOOLEAN = FALSE
    AND (record->>'canonicalFacility')::BOOLEAN = TRUE
    AND (record->>'secondFacilityCreated')::BOOLEAN =
      second_facility_created
    AND (record->>'canonicalFacilityMutationCreated')::BOOLEAN =
      canonical_facility_mutation_created
    AND (record->>'canonicalLedger')::BOOLEAN = TRUE
    AND (record->>'ledgerMutationCreated')::BOOLEAN =
      ledger_mutation_created
    AND (record->>'secondLedgerCreated')::BOOLEAN =
      second_ledger_created
    AND (record->>'mainnetAuthority')::BOOLEAN = mainnet_authority
    AND (record->>'productionAuthority')::BOOLEAN =
      production_authority
    AND (record->>'fundsAuthority')::BOOLEAN = funds_authority
    AND (record->>'realFunds')::BOOLEAN = FALSE
    AND (record->>'productionFundsMoved')::BOOLEAN = FALSE
    AND (record->>'piiIncluded')::BOOLEAN = FALSE
    AND (record->>'secretsIncluded')::BOOLEAN = secrets_included
  )
);

CREATE FUNCTION guard_trading_testnet_facility_funding_control()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Trading Testnet Facility funding controls cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.id <> OLD.id OR
    NEW.funding_hash <> OLD.funding_hash OR
    NEW.request_hash <> OLD.request_hash OR
    NEW.idempotency_key_hash <> OLD.idempotency_key_hash OR
    NEW.facility_id <> OLD.facility_id OR
    NEW.facility_hash <> OLD.facility_hash OR
    NEW.facility_state_hash <> OLD.facility_state_hash OR
    NEW.facility_version <> OLD.facility_version OR
    NEW.obligation_id <> OLD.obligation_id OR
    NEW.subject_id <> OLD.subject_id OR
    NEW.bilateral_terms_hash <> OLD.bilateral_terms_hash OR
    NEW.asset_id <> OLD.asset_id OR
    NEW.required_subject_contribution_minor <>
      OLD.required_subject_contribution_minor OR
    NEW.required_provider_contribution_minor <>
      OLD.required_provider_contribution_minor OR
    NEW.maximum_facility_cap_minor <> OLD.maximum_facility_cap_minor OR
    NEW.facility_destination_hash <> OLD.facility_destination_hash OR
    NEW.account_binding_hash <> OLD.account_binding_hash OR
    NEW.master_account_hash <> OLD.master_account_hash OR
    NEW.withdrawal_authority_hash <> OLD.withdrawal_authority_hash OR
    NEW.execution_signer_reference_hash <>
      OLD.execution_signer_reference_hash OR
    NEW.canonical_ledger_state_hash <>
      OLD.canonical_ledger_state_hash OR
    NEW.ledger_transaction_count <> OLD.ledger_transaction_count OR
    NEW.authorization_decision_hash <>
      OLD.authorization_decision_hash OR
    NEW.admission_decision_hash <> OLD.admission_decision_hash OR
    NEW.created_at <> OLD.created_at OR
    NEW.simulation_only <> OLD.simulation_only OR
    NEW.non_redeemable <> OLD.non_redeemable OR
    NEW.direct_facility_destination <> OLD.direct_facility_destination OR
    NEW.trader_wallet_pass_through <> OLD.trader_wallet_pass_through OR
    NEW.trader_withdrawal_authority <>
      OLD.trader_withdrawal_authority OR
    NEW.ledger_mutation_created <> OLD.ledger_mutation_created OR
    NEW.second_facility_created <> OLD.second_facility_created OR
    NEW.second_ledger_created <> OLD.second_ledger_created OR
    NEW.mainnet_authority <> OLD.mainnet_authority OR
    NEW.production_authority <> OLD.production_authority OR
    NEW.funds_authority <> OLD.funds_authority OR
    NEW.secrets_included <> OLD.secrets_included OR
    NEW.schema_version <> OLD.schema_version OR
    NEW.version <> OLD.version + 1 OR
    NEW.processed_receipt_count < OLD.processed_receipt_count OR
    OLD.status IN ('ACTIVE', 'INCIDENT') OR
    NOT (
      NEW.status = OLD.status
      OR (
        OLD.status = 'AWAITING_CONTRIBUTIONS'
        AND NEW.status IN (
          'AWAITING_SUBJECT',
          'AWAITING_PROVIDER',
          'INCIDENT'
        )
      )
      OR (
        OLD.status = 'AWAITING_SUBJECT'
        AND NEW.status IN (
          'AWAITING_CONTRIBUTIONS',
          'READY',
          'INCIDENT'
        )
      )
      OR (
        OLD.status = 'AWAITING_PROVIDER'
        AND NEW.status IN (
          'AWAITING_CONTRIBUTIONS',
          'READY',
          'INCIDENT'
        )
      )
      OR (
        OLD.status = 'READY'
        AND NEW.status IN (
          'AWAITING_SUBJECT',
          'AWAITING_PROVIDER',
          'ACTIVE',
          'INCIDENT'
        )
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Trading Testnet Facility funding transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_testnet_facility_funding_controls_transition_guard
BEFORE UPDATE OR DELETE ON trading_testnet_facility_funding_controls
FOR EACH ROW
EXECUTE FUNCTION guard_trading_testnet_facility_funding_control();

ALTER TABLE trading_testnet_facility_funding_controls
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_testnet_facility_funding_controls
  FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_testnet_facility_funding_controls
  ON trading_testnet_facility_funding_controls
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_testnet_facility_funding_controls
BEFORE INSERT OR UPDATE OR DELETE
ON trading_testnet_facility_funding_controls
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX trading_testnet_facility_funding_controls_tenant_state_idx
  ON trading_testnet_facility_funding_controls(
    tenant_id,
    status,
    updated_at,
    id
  );
CREATE INDEX trading_testnet_facility_funding_controls_tenant_subject_idx
  ON trading_testnet_facility_funding_controls(
    tenant_id,
    subject_id,
    status,
    updated_at,
    id
  );
