CREATE TABLE trading_testnet_protective_controls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  control_hash TEXT NOT NULL CHECK (control_hash ~ '^0x[0-9a-f]{64}$'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^0x[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL
    CHECK (idempotency_key_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  risk_snapshot_hash TEXT NOT NULL
    CHECK (risk_snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  before_venue_state_hash TEXT NOT NULL
    CHECK (before_venue_state_hash ~ '^0x[0-9a-f]{64}$'),
  target_risk_state TEXT NOT NULL CHECK (
    target_risk_state IN (
      'NORMAL', 'WARNING', 'REDUCE_ONLY', 'FLATTEN', 'SETTLEMENT'
    )
  ),
  status TEXT NOT NULL CHECK (
    status IN ('PLANNED', 'EXECUTING', 'VERIFIED', 'INCOMPLETE', 'UNKNOWN')
  ),
  result_hash TEXT CHECK (
    result_hash IS NULL OR result_hash ~ '^0x[0-9a-f]{64}$'
  ),
  record JSONB NOT NULL,
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  simulation_only BOOLEAN NOT NULL CHECK (simulation_only = TRUE),
  simulation_fixture_only BOOLEAN NOT NULL
    CHECK (simulation_fixture_only = TRUE),
  external_system_queried BOOLEAN NOT NULL
    CHECK (external_system_queried = FALSE),
  external_order_submitted BOOLEAN NOT NULL
    CHECK (external_order_submitted = FALSE),
  live_transport_approved BOOLEAN NOT NULL
    CHECK (live_transport_approved = FALSE),
  live_signer_approved BOOLEAN NOT NULL CHECK (live_signer_approved = FALSE),
  api_wallet_approved BOOLEAN NOT NULL CHECK (api_wallet_approved = FALSE),
  withdrawal_authority BOOLEAN NOT NULL CHECK (withdrawal_authority = FALSE),
  transfer_authority BOOLEAN NOT NULL CHECK (transfer_authority = FALSE),
  account_administration_authority BOOLEAN NOT NULL
    CHECK (account_administration_authority = FALSE),
  strategy_authority BOOLEAN NOT NULL CHECK (strategy_authority = FALSE),
  economic_repricing_authority BOOLEAN NOT NULL
    CHECK (economic_repricing_authority = FALSE),
  automatic_recovery BOOLEAN NOT NULL CHECK (automatic_recovery = FALSE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'hyperliquid_testnet_simulated_protective_control.v1'
  ),
  CONSTRAINT trading_testnet_protective_controls_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT trading_testnet_protective_controls_tenant_hash_key
    UNIQUE (tenant_id, control_hash),
  CONSTRAINT trading_testnet_protective_controls_tenant_request_key
    UNIQUE (tenant_id, request_hash),
  CONSTRAINT trading_testnet_protective_controls_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key_hash),
  CONSTRAINT trading_testnet_protective_controls_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT trading_testnet_protective_controls_state_check CHECK (
    (
      status = 'PLANNED'
      AND version = 1
      AND result_hash IS NULL
      AND started_at IS NULL
      AND resolved_at IS NULL
    )
    OR (
      status = 'EXECUTING'
      AND version = 2
      AND result_hash IS NULL
      AND started_at IS NOT NULL
      AND resolved_at IS NULL
    )
    OR (
      status IN ('VERIFIED', 'INCOMPLETE', 'UNKNOWN')
      AND version = 3
      AND result_hash IS NOT NULL
      AND started_at IS NOT NULL
      AND resolved_at IS NOT NULL
    )
  ),
  CONSTRAINT trading_testnet_protective_controls_identity_check CHECK (
    record->>'controlId' = id
    AND record->>'controlHash' = control_hash
    AND record->>'requestHash' = request_hash
    AND record->>'idempotencyKeyHash' = idempotency_key_hash
    AND record->>'facilityId' = facility_id
    AND record->>'facilityHash' = facility_hash
    AND record->>'riskSnapshotHash' = risk_snapshot_hash
    AND record->>'beforeVenueStateHash' = before_venue_state_hash
    AND record->>'targetRiskState' = target_risk_state
    AND record->>'status' = status
    AND record->>'schemaVersion' = schema_version
    AND (record->>'version')::BIGINT = version
    AND record->>'environment' = 'hyperliquid_testnet'
    AND (record->>'simulationOnly')::BOOLEAN = simulation_only
    AND (record->>'simulationFixtureOnly')::BOOLEAN =
      simulation_fixture_only
    AND (record->>'productionPolicyApproved')::BOOLEAN = FALSE
    AND (record->>'externalSystemQueried')::BOOLEAN =
      external_system_queried
    AND (record->>'externalOrderSubmitted')::BOOLEAN =
      external_order_submitted
    AND (record->>'liveTransportApproved')::BOOLEAN =
      live_transport_approved
    AND (record->>'liveSignerApproved')::BOOLEAN = live_signer_approved
    AND (record->>'apiWalletApproved')::BOOLEAN = api_wallet_approved
    AND (record->>'withdrawalAuthority')::BOOLEAN = withdrawal_authority
    AND (record->>'transferAuthority')::BOOLEAN = transfer_authority
    AND (record->>'accountAdministrationAuthority')::BOOLEAN =
      account_administration_authority
    AND (record->>'strategyAuthority')::BOOLEAN = strategy_authority
    AND (record->>'economicRepricingAuthority')::BOOLEAN =
      economic_repricing_authority
    AND (record->>'automaticRecovery')::BOOLEAN = automatic_recovery
    AND (record->>'mainnetAuthority')::BOOLEAN = mainnet_authority
    AND (record->>'productionAuthority')::BOOLEAN = production_authority
    AND (record->>'fundsAuthority')::BOOLEAN = funds_authority
    AND (record->>'piiIncluded')::BOOLEAN = FALSE
    AND (record->>'secretsIncluded')::BOOLEAN = secrets_included
  )
);

CREATE TABLE trading_testnet_protective_transitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  control_id TEXT NOT NULL,
  control_hash TEXT NOT NULL CHECK (control_hash ~ '^0x[0-9a-f]{64}$'),
  transition_hash TEXT NOT NULL CHECK (transition_hash ~ '^0x[0-9a-f]{64}$'),
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 3),
  previous_status TEXT CHECK (
    previous_status IS NULL OR previous_status IN ('PLANNED', 'EXECUTING')
  ),
  next_status TEXT NOT NULL CHECK (
    next_status IN ('PLANNED', 'EXECUTING', 'VERIFIED', 'INCOMPLETE', 'UNKNOWN')
  ),
  result_hash TEXT CHECK (
    result_hash IS NULL OR result_hash ~ '^0x[0-9a-f]{64}$'
  ),
  changed_at TIMESTAMPTZ NOT NULL,
  transition JSONB NOT NULL,
  simulation_only BOOLEAN NOT NULL CHECK (simulation_only = TRUE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'trading_testnet_protective_control_transition.v1'
  ),
  CONSTRAINT trading_testnet_protective_transitions_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT trading_testnet_protective_transitions_tenant_hash_key
    UNIQUE (tenant_id, transition_hash),
  CONSTRAINT trading_testnet_protective_transitions_state_key
    UNIQUE (tenant_id, control_id, next_status),
  CONSTRAINT trading_testnet_protective_transitions_sequence_key
    UNIQUE (tenant_id, control_id, sequence),
  CONSTRAINT trading_testnet_protective_transitions_control_fk
    FOREIGN KEY (tenant_id, control_id)
    REFERENCES trading_testnet_protective_controls(tenant_id, id),
  CONSTRAINT trading_testnet_protective_transitions_identity_check
    CHECK (
      transition->>'transitionId' = id
      AND transition->>'controlId' = control_id
      AND transition->>'controlHash' = control_hash
      AND transition->>'transitionHash' = transition_hash
      AND (transition->>'sequence')::INTEGER = sequence
      AND transition->>'nextStatus' = next_status
      AND transition->>'schemaVersion' = schema_version
      AND (transition->>'simulationOnly')::BOOLEAN = simulation_only
      AND (transition->>'secretsIncluded')::BOOLEAN = secrets_included
    )
);

CREATE FUNCTION guard_trading_testnet_protective_control()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Trading Testnet protective controls cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.id <> OLD.id OR
    NEW.control_hash <> OLD.control_hash OR
    NEW.request_hash <> OLD.request_hash OR
    NEW.idempotency_key_hash <> OLD.idempotency_key_hash OR
    NEW.facility_id <> OLD.facility_id OR
    NEW.facility_hash <> OLD.facility_hash OR
    NEW.risk_snapshot_hash <> OLD.risk_snapshot_hash OR
    NEW.before_venue_state_hash <> OLD.before_venue_state_hash OR
    NEW.target_risk_state <> OLD.target_risk_state OR
    NEW.created_at <> OLD.created_at OR
    NEW.simulation_only <> OLD.simulation_only OR
    NEW.simulation_fixture_only <> OLD.simulation_fixture_only OR
    NEW.external_system_queried <> OLD.external_system_queried OR
    NEW.external_order_submitted <> OLD.external_order_submitted OR
    NEW.live_transport_approved <> OLD.live_transport_approved OR
    NEW.live_signer_approved <> OLD.live_signer_approved OR
    NEW.api_wallet_approved <> OLD.api_wallet_approved OR
    NEW.withdrawal_authority <> OLD.withdrawal_authority OR
    NEW.transfer_authority <> OLD.transfer_authority OR
    NEW.account_administration_authority <>
      OLD.account_administration_authority OR
    NEW.strategy_authority <> OLD.strategy_authority OR
    NEW.economic_repricing_authority <>
      OLD.economic_repricing_authority OR
    NEW.automatic_recovery <> OLD.automatic_recovery OR
    NEW.mainnet_authority <> OLD.mainnet_authority OR
    NEW.production_authority <> OLD.production_authority OR
    NEW.funds_authority <> OLD.funds_authority OR
    NEW.secrets_included <> OLD.secrets_included OR
    NEW.schema_version <> OLD.schema_version OR
    NEW.version <> OLD.version + 1 OR
    NOT (
      (OLD.status = 'PLANNED' AND NEW.status = 'EXECUTING')
      OR (
        OLD.status = 'EXECUTING'
        AND NEW.status IN ('VERIFIED', 'INCOMPLETE', 'UNKNOWN')
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Trading Testnet protective control transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_testnet_protective_controls_transition_guard
BEFORE UPDATE OR DELETE ON trading_testnet_protective_controls
FOR EACH ROW EXECUTE FUNCTION guard_trading_testnet_protective_control();

CREATE FUNCTION guard_immutable_trading_testnet_protective_transition()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'Trading Testnet protective control transitions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_testnet_protective_transitions_immutable_guard
BEFORE UPDATE OR DELETE ON trading_testnet_protective_transitions
FOR EACH ROW
EXECUTE FUNCTION guard_immutable_trading_testnet_protective_transition();

ALTER TABLE trading_testnet_protective_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_testnet_protective_controls FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_testnet_protective_controls
  ON trading_testnet_protective_controls
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_testnet_protective_controls
BEFORE INSERT OR UPDATE OR DELETE ON trading_testnet_protective_controls
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE trading_testnet_protective_transitions
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_testnet_protective_transitions
  FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_testnet_protective_transitions
  ON trading_testnet_protective_transitions
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER
  tenant_context_guard_trading_testnet_protective_transitions
BEFORE INSERT OR UPDATE OR DELETE
  ON trading_testnet_protective_transitions
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX trading_testnet_protective_controls_tenant_facility_state_idx
  ON trading_testnet_protective_controls(
    tenant_id,
    facility_id,
    target_risk_state,
    status,
    created_at,
    id
  );
CREATE INDEX
  trading_testnet_protective_transitions_tenant_control_idx
  ON trading_testnet_protective_transitions(
    tenant_id,
    control_id,
    sequence
  );
