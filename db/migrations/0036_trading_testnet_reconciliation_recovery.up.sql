CREATE TABLE trading_testnet_reconciliation_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id()
    REFERENCES tenants(id),
  reconciliation_hash TEXT NOT NULL
    CHECK (reconciliation_hash ~ '^0x[0-9a-f]{64}$'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^0x[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL
    CHECK (idempotency_key_hash ~ '^0x[0-9a-f]{64}$'),
  execution_id TEXT NOT NULL,
  execution_hash TEXT NOT NULL
    CHECK (execution_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  order_intent_id TEXT NOT NULL,
  order_intent_hash TEXT NOT NULL
    CHECK (order_intent_hash ~ '^0x[0-9a-f]{64}$'),
  canonical_ledger_state_hash TEXT NOT NULL
    CHECK (canonical_ledger_state_hash ~ '^0x[0-9a-f]{64}$'),
  risk_snapshot_hash TEXT NOT NULL
    CHECK (risk_snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  authorization_decision_hash TEXT NOT NULL
    CHECK (authorization_decision_hash ~ '^0x[0-9a-f]{64}$'),
  admission_decision_hash TEXT NOT NULL
    CHECK (admission_decision_hash ~ '^0x[0-9a-f]{64}$'),
  nonce BIGINT NOT NULL CHECK (nonce > 0),
  execution_nonce_state TEXT NOT NULL CHECK (
    execution_nonce_state IN ('SUBMITTED', 'CONFIRMED', 'REJECTED', 'UNKNOWN')
  ),
  action_kind TEXT NOT NULL CHECK (
    action_kind IN ('order', 'reduceOnlyOrder', 'cancel', 'cancelByCloid', 'modify')
  ),
  action_hash TEXT NOT NULL CHECK (action_hash ~ '^0x[0-9a-f]{64}$'),
  cloid TEXT CHECK (cloid IS NULL OR cloid ~ '^0x[0-9a-f]{32}$'),
  status TEXT NOT NULL CHECK (
    status IN (
      'PENDING', 'PARTIAL', 'UNKNOWN', 'RECONCILED', 'REJECTED',
      'INCIDENT', 'SAFE_STOPPED'
    )
  ),
  reconciled_order_state TEXT NOT NULL CHECK (
    reconciled_order_state IN (
      'PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED',
      'REJECTED', 'UNKNOWN', 'INCIDENT', 'SAFE_STOPPED'
    )
  ),
  cumulative_filled_size TEXT NOT NULL CHECK (
    cumulative_filled_size ~
      '^(0|0\.[0-9]{1,18}|[1-9][0-9]{0,30}(\.[0-9]{1,18})?)$'
  ),
  cumulative_fill_notional_minor TEXT NOT NULL CHECK (
    cumulative_fill_notional_minor ~ '^(0|[1-9][0-9]{0,77})$'
  ),
  processed_observation_count INTEGER NOT NULL
    CHECK (processed_observation_count BETWEEN 0 AND 1000000),
  latest_source_evidence_hash TEXT CHECK (
    latest_source_evidence_hash IS NULL
    OR latest_source_evidence_hash ~ '^0x[0-9a-f]{64}$'
  ),
  adapter_failure_count INTEGER NOT NULL
    CHECK (adapter_failure_count BETWEEN 0 AND 1000000),
  poll_attempt_count INTEGER NOT NULL
    CHECK (poll_attempt_count BETWEEN 0 AND 1000000),
  circuit_breaker_open BOOLEAN NOT NULL,
  manual_safe_stop BOOLEAN NOT NULL,
  new_risk_blocked BOOLEAN NOT NULL,
  reconciled BOOLEAN NOT NULL,
  result_hash TEXT CHECK (
    result_hash IS NULL OR result_hash ~ '^0x[0-9a-f]{64}$'
  ),
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 1000000),
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  simulation_only BOOLEAN NOT NULL CHECK (simulation_only = TRUE),
  external_system_queried BOOLEAN NOT NULL
    CHECK (external_system_queried = FALSE),
  external_order_submitted BOOLEAN NOT NULL
    CHECK (external_order_submitted = FALSE),
  ledger_mutation_created BOOLEAN NOT NULL
    CHECK (ledger_mutation_created = FALSE),
  second_ledger_created BOOLEAN NOT NULL
    CHECK (second_ledger_created = FALSE),
  facility_mutation_created BOOLEAN NOT NULL
    CHECK (facility_mutation_created = FALSE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'hyperliquid_testnet_simulated_reconciliation.v1'
  ),
  CONSTRAINT trading_testnet_reconciliation_runs_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT trading_testnet_reconciliation_runs_tenant_hash_key
    UNIQUE (tenant_id, reconciliation_hash),
  CONSTRAINT trading_testnet_reconciliation_runs_tenant_request_key
    UNIQUE (tenant_id, request_hash),
  CONSTRAINT trading_testnet_reconciliation_runs_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key_hash),
  CONSTRAINT trading_testnet_reconciliation_runs_execution_key
    UNIQUE (tenant_id, execution_id),
  CONSTRAINT trading_testnet_reconciliation_runs_execution_fk
    FOREIGN KEY (tenant_id, execution_id)
    REFERENCES trading_testnet_execution_records(tenant_id, id),
  CONSTRAINT trading_testnet_reconciliation_runs_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT trading_testnet_reconciliation_runs_order_intent_fk
    FOREIGN KEY (tenant_id, order_intent_id)
    REFERENCES trading_order_intents(tenant_id, id),
  CONSTRAINT trading_testnet_reconciliation_runs_state_check CHECK (
    (
      status = 'PENDING'
      AND version = 1
      AND reconciled_order_state = 'PENDING'
      AND processed_observation_count = 0
      AND latest_source_evidence_hash IS NULL
      AND result_hash IS NULL
      AND resolved_at IS NULL
      AND manual_safe_stop = FALSE
      AND reconciled = FALSE
    )
    OR (
      status IN ('PARTIAL', 'UNKNOWN')
      AND version >= 2
      AND processed_observation_count >= 1
      AND latest_source_evidence_hash IS NOT NULL
      AND result_hash IS NULL
      AND resolved_at IS NULL
      AND manual_safe_stop = FALSE
      AND reconciled = FALSE
    )
    OR (
      status IN ('RECONCILED', 'REJECTED')
      AND version >= 2
      AND processed_observation_count >= 1
      AND latest_source_evidence_hash IS NOT NULL
      AND result_hash IS NOT NULL
      AND resolved_at IS NOT NULL
      AND manual_safe_stop = FALSE
      AND reconciled = TRUE
    )
    OR (
      status = 'INCIDENT'
      AND version >= 2
      AND processed_observation_count >= 1
      AND latest_source_evidence_hash IS NOT NULL
      AND result_hash IS NOT NULL
      AND resolved_at IS NOT NULL
      AND circuit_breaker_open = TRUE
      AND manual_safe_stop = FALSE
      AND new_risk_blocked = TRUE
      AND reconciled = FALSE
    )
    OR (
      status = 'SAFE_STOPPED'
      AND version >= 2
      AND result_hash IS NOT NULL
      AND resolved_at IS NOT NULL
      AND circuit_breaker_open = TRUE
      AND manual_safe_stop = TRUE
      AND new_risk_blocked = TRUE
      AND reconciled = FALSE
    )
  ),
  CONSTRAINT trading_testnet_reconciliation_runs_identity_check CHECK (
    record->>'reconciliationId' = id
    AND record->>'reconciliationHash' = reconciliation_hash
    AND record->>'requestHash' = request_hash
    AND record->>'idempotencyKeyHash' = idempotency_key_hash
    AND record->>'executionId' = execution_id
    AND record->>'executionHash' = execution_hash
    AND record->>'facilityId' = facility_id
    AND record->>'facilityHash' = facility_hash
    AND record->>'orderIntentId' = order_intent_id
    AND record->>'orderIntentHash' = order_intent_hash
    AND record->>'canonicalLedgerStateHash' = canonical_ledger_state_hash
    AND record->>'riskSnapshotHash' = risk_snapshot_hash
    AND record->>'authorizationDecisionHash' = authorization_decision_hash
    AND record->>'admissionDecisionHash' = admission_decision_hash
    AND (record->>'nonce')::BIGINT = nonce
    AND record->>'executionNonceState' = execution_nonce_state
    AND record->>'actionKind' = action_kind
    AND record->>'actionHash' = action_hash
    AND record->>'status' = status
    AND record->>'reconciledOrderState' = reconciled_order_state
    AND record->>'cumulativeFilledSize' = cumulative_filled_size
    AND record->>'cumulativeFillNotionalMinor' =
      cumulative_fill_notional_minor
    AND (record->>'processedObservationCount')::INTEGER =
      processed_observation_count
    AND (record->>'adapterFailureCount')::INTEGER = adapter_failure_count
    AND (record->>'pollAttemptCount')::INTEGER = poll_attempt_count
    AND (record->>'circuitBreakerOpen')::BOOLEAN = circuit_breaker_open
    AND (record->>'manualSafeStop')::BOOLEAN = manual_safe_stop
    AND (record->>'newRiskBlocked')::BOOLEAN = new_risk_blocked
    AND (record->>'reconciled')::BOOLEAN = reconciled
    AND (record->>'version')::BIGINT = version
    AND record->>'schemaVersion' = schema_version
    AND record->>'environment' = 'hyperliquid_testnet'
    AND (record->>'simulationOnly')::BOOLEAN = simulation_only
    AND (record->>'protectedTestnetE2EOnly')::BOOLEAN = TRUE
    AND (record->>'externalSystemQueried')::BOOLEAN =
      external_system_queried
    AND (record->>'externalOrderSubmitted')::BOOLEAN =
      external_order_submitted
    AND (record->>'liveTransportApproved')::BOOLEAN = FALSE
    AND (record->>'liveSignerApproved')::BOOLEAN = FALSE
    AND (record->>'apiWalletApproved')::BOOLEAN = FALSE
    AND (record->>'canonicalLedger')::BOOLEAN = TRUE
    AND (record->>'ledgerPostingRequired')::BOOLEAN = FALSE
    AND (record->>'ledgerMutationCreated')::BOOLEAN =
      ledger_mutation_created
    AND (record->>'ledgerPostingAuthority')::BOOLEAN = FALSE
    AND (record->>'secondLedgerCreated')::BOOLEAN = second_ledger_created
    AND (record->>'facilityMutationCreated')::BOOLEAN =
      facility_mutation_created
    AND (record->>'facilityMutationAuthority')::BOOLEAN = FALSE
    AND (record->>'riskRecoveryAuthority')::BOOLEAN = FALSE
    AND (record->>'withdrawalAuthority')::BOOLEAN = FALSE
    AND (record->>'transferAuthority')::BOOLEAN = FALSE
    AND (record->>'accountAdministrationAuthority')::BOOLEAN = FALSE
    AND (record->>'mainnetAuthority')::BOOLEAN = mainnet_authority
    AND (record->>'productionAuthority')::BOOLEAN = production_authority
    AND (record->>'fundsAuthority')::BOOLEAN = funds_authority
    AND (record->>'rawResponsePersisted')::BOOLEAN = FALSE
    AND (record->>'reusableSignaturePersisted')::BOOLEAN = FALSE
    AND (record->>'piiIncluded')::BOOLEAN = FALSE
    AND (record->>'secretsIncluded')::BOOLEAN = secrets_included
  )
);

CREATE FUNCTION guard_trading_testnet_reconciliation_run()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Trading Testnet reconciliation records cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.id <> OLD.id OR
    NEW.reconciliation_hash <> OLD.reconciliation_hash OR
    NEW.request_hash <> OLD.request_hash OR
    NEW.idempotency_key_hash <> OLD.idempotency_key_hash OR
    NEW.execution_id <> OLD.execution_id OR
    NEW.execution_hash <> OLD.execution_hash OR
    NEW.facility_id <> OLD.facility_id OR
    NEW.facility_hash <> OLD.facility_hash OR
    NEW.order_intent_id <> OLD.order_intent_id OR
    NEW.order_intent_hash <> OLD.order_intent_hash OR
    NEW.canonical_ledger_state_hash <> OLD.canonical_ledger_state_hash OR
    NEW.authorization_decision_hash <> OLD.authorization_decision_hash OR
    NEW.admission_decision_hash <> OLD.admission_decision_hash OR
    NEW.nonce <> OLD.nonce OR
    NEW.execution_nonce_state <> OLD.execution_nonce_state OR
    NEW.action_kind <> OLD.action_kind OR
    NEW.action_hash <> OLD.action_hash OR
    NEW.cloid IS DISTINCT FROM OLD.cloid OR
    NEW.created_at <> OLD.created_at OR
    NEW.simulation_only <> OLD.simulation_only OR
    NEW.external_system_queried <> OLD.external_system_queried OR
    NEW.external_order_submitted <> OLD.external_order_submitted OR
    NEW.ledger_mutation_created <> OLD.ledger_mutation_created OR
    NEW.second_ledger_created <> OLD.second_ledger_created OR
    NEW.facility_mutation_created <> OLD.facility_mutation_created OR
    NEW.mainnet_authority <> OLD.mainnet_authority OR
    NEW.production_authority <> OLD.production_authority OR
    NEW.funds_authority <> OLD.funds_authority OR
    NEW.secrets_included <> OLD.secrets_included OR
    NEW.schema_version <> OLD.schema_version OR
    NEW.version <> OLD.version + 1 OR
    NEW.processed_observation_count < OLD.processed_observation_count OR
    NEW.cumulative_filled_size::NUMERIC <
      OLD.cumulative_filled_size::NUMERIC OR
    NEW.cumulative_fill_notional_minor::NUMERIC <
      OLD.cumulative_fill_notional_minor::NUMERIC OR
    OLD.status NOT IN ('PENDING', 'PARTIAL', 'UNKNOWN') OR
    NEW.status = 'PENDING'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Trading Testnet reconciliation transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_testnet_reconciliation_runs_transition_guard
BEFORE UPDATE OR DELETE ON trading_testnet_reconciliation_runs
FOR EACH ROW EXECUTE FUNCTION guard_trading_testnet_reconciliation_run();

ALTER TABLE trading_testnet_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_testnet_reconciliation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_testnet_reconciliation_runs
  ON trading_testnet_reconciliation_runs
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_testnet_reconciliation_runs
BEFORE INSERT OR UPDATE OR DELETE ON trading_testnet_reconciliation_runs
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX trading_testnet_reconciliation_runs_tenant_facility_state_idx
  ON trading_testnet_reconciliation_runs(
    tenant_id,
    facility_id,
    status,
    updated_at,
    id
  );
CREATE INDEX trading_testnet_reconciliation_runs_tenant_circuit_idx
  ON trading_testnet_reconciliation_runs(
    tenant_id,
    circuit_breaker_open,
    status,
    updated_at,
    id
  );
