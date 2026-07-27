CREATE TABLE trading_execution_nonce_heads (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  signer_reference_hash TEXT NOT NULL
    CHECK (signer_reference_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  account_binding_hash TEXT NOT NULL
    CHECK (account_binding_hash ~ '^0x[0-9a-f]{64}$'),
  last_nonce BIGINT NOT NULL CHECK (last_nonce > 0),
  version BIGINT NOT NULL CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL,
  simulation_only BOOLEAN NOT NULL CHECK (simulation_only = TRUE),
  live_signer_available BOOLEAN NOT NULL CHECK (live_signer_available = FALSE),
  api_wallet_approved BOOLEAN NOT NULL CHECK (api_wallet_approved = FALSE),
  key_exportable BOOLEAN NOT NULL CHECK (key_exportable = FALSE),
  schema_version TEXT NOT NULL
    CHECK (schema_version = 'trading_execution_nonce_head.v1'),
  PRIMARY KEY (tenant_id, signer_reference_hash),
  CONSTRAINT trading_execution_nonce_heads_tenant_facility_key
    UNIQUE (tenant_id, facility_id),
  CONSTRAINT trading_execution_nonce_heads_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id)
);

CREATE TABLE trading_testnet_execution_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  execution_hash TEXT NOT NULL CHECK (execution_hash ~ '^0x[0-9a-f]{64}$'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^0x[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL
    CHECK (idempotency_key_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  order_intent_id TEXT NOT NULL,
  order_intent_hash TEXT NOT NULL
    CHECK (order_intent_hash ~ '^0x[0-9a-f]{64}$'),
  account_binding_hash TEXT NOT NULL
    CHECK (account_binding_hash ~ '^0x[0-9a-f]{64}$'),
  signer_reference_hash TEXT NOT NULL
    CHECK (signer_reference_hash ~ '^0x[0-9a-f]{64}$'),
  policy_decision_hash TEXT NOT NULL
    CHECK (policy_decision_hash ~ '^0x[0-9a-f]{64}$'),
  action_kind TEXT NOT NULL CHECK (
    action_kind IN ('order', 'reduceOnlyOrder', 'cancel', 'cancelByCloid', 'modify')
  ),
  action_hash TEXT NOT NULL CHECK (action_hash ~ '^0x[0-9a-f]{64}$'),
  cloid TEXT CHECK (cloid IS NULL OR cloid ~ '^0x[0-9a-f]{32}$'),
  nonce BIGINT NOT NULL CHECK (nonce > 0),
  nonce_state TEXT NOT NULL CHECK (
    nonce_state IN ('RESERVED', 'SUBMITTED', 'CONFIRMED', 'REJECTED', 'UNKNOWN')
  ),
  outcome TEXT CHECK (
    outcome IS NULL
    OR outcome IN (
      'simulated_confirmed',
      'simulated_rejected',
      'simulated_unknown'
    )
  ),
  result_hash TEXT CHECK (result_hash IS NULL OR result_hash ~ '^0x[0-9a-f]{64}$'),
  record JSONB NOT NULL,
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL,
  reserved_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  simulation_only BOOLEAN NOT NULL CHECK (simulation_only = TRUE),
  external_system_queried BOOLEAN NOT NULL
    CHECK (external_system_queried = FALSE),
  external_order_submitted BOOLEAN NOT NULL
    CHECK (external_order_submitted = FALSE),
  signer_isolated BOOLEAN NOT NULL CHECK (signer_isolated = TRUE),
  key_exportable BOOLEAN NOT NULL CHECK (key_exportable = FALSE),
  raw_action_accepted BOOLEAN NOT NULL CHECK (raw_action_accepted = FALSE),
  raw_response_persisted BOOLEAN NOT NULL
    CHECK (raw_response_persisted = FALSE),
  reusable_signature_persisted BOOLEAN NOT NULL
    CHECK (reusable_signature_persisted = FALSE),
  withdrawal_authority BOOLEAN NOT NULL CHECK (withdrawal_authority = FALSE),
  transfer_authority BOOLEAN NOT NULL CHECK (transfer_authority = FALSE),
  account_administration_authority BOOLEAN NOT NULL
    CHECK (account_administration_authority = FALSE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'hyperliquid_testnet_simulated_execution_record.v1'
  ),
  CONSTRAINT trading_testnet_execution_records_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT trading_testnet_execution_records_tenant_execution_hash_key
    UNIQUE (tenant_id, execution_hash),
  CONSTRAINT trading_testnet_execution_records_tenant_request_hash_key
    UNIQUE (tenant_id, request_hash),
  CONSTRAINT trading_testnet_execution_records_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key_hash),
  CONSTRAINT trading_testnet_execution_records_signer_nonce_key
    UNIQUE (tenant_id, signer_reference_hash, nonce),
  CONSTRAINT trading_testnet_execution_records_facility_fk
    FOREIGN KEY (tenant_id, facility_id)
    REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT trading_testnet_execution_records_order_intent_fk
    FOREIGN KEY (tenant_id, order_intent_id)
    REFERENCES trading_order_intents(tenant_id, id),
  CONSTRAINT trading_testnet_execution_records_nonce_head_fk
    FOREIGN KEY (tenant_id, signer_reference_hash)
    REFERENCES trading_execution_nonce_heads(tenant_id, signer_reference_hash),
  CONSTRAINT trading_testnet_execution_records_state_check CHECK (
    (
      nonce_state = 'RESERVED'
      AND version = 1
      AND outcome IS NULL
      AND result_hash IS NULL
      AND submitted_at IS NULL
      AND resolved_at IS NULL
    )
    OR (
      nonce_state = 'SUBMITTED'
      AND version = 2
      AND outcome IS NULL
      AND result_hash IS NULL
      AND submitted_at IS NOT NULL
      AND resolved_at IS NULL
    )
    OR (
      nonce_state IN ('CONFIRMED', 'UNKNOWN')
      AND version = 3
      AND outcome IS NOT NULL
      AND result_hash IS NOT NULL
      AND submitted_at IS NOT NULL
      AND resolved_at IS NOT NULL
    )
    OR (
      nonce_state = 'REJECTED'
      AND version IN (2, 3)
      AND outcome = 'simulated_rejected'
      AND result_hash IS NOT NULL
      AND resolved_at IS NOT NULL
      AND (
        (version = 2 AND submitted_at IS NULL)
        OR (version = 3 AND submitted_at IS NOT NULL)
      )
    )
  ),
  CONSTRAINT trading_testnet_execution_records_identity_check CHECK (
    record->>'executionId' = id
    AND record->>'executionHash' = execution_hash
    AND record->>'requestHash' = request_hash
    AND record->>'idempotencyKeyHash' = idempotency_key_hash
    AND record->>'facilityId' = facility_id
    AND record->>'facilityHash' = facility_hash
    AND record->>'orderIntentId' = order_intent_id
    AND record->>'orderIntentHash' = order_intent_hash
    AND record->>'accountBindingHash' = account_binding_hash
    AND record->>'signerReferenceHash' = signer_reference_hash
    AND record->>'policyDecisionHash' = policy_decision_hash
    AND record->>'actionKind' = action_kind
    AND record->>'actionHash' = action_hash
    AND record->>'nonce' = nonce::TEXT
    AND record->>'nonceState' = nonce_state
    AND record->>'schemaVersion' = schema_version
    AND (record->>'simulationOnly')::BOOLEAN = simulation_only
    AND (record->>'externalSystemQueried')::BOOLEAN = external_system_queried
    AND (record->>'externalOrderSubmitted')::BOOLEAN = external_order_submitted
    AND (record->>'signerIsolated')::BOOLEAN = signer_isolated
    AND (record->>'keyExportable')::BOOLEAN = key_exportable
    AND (record->>'rawActionAccepted')::BOOLEAN = raw_action_accepted
    AND (record->>'rawResponsePersisted')::BOOLEAN = raw_response_persisted
    AND (record->>'reusableSignaturePersisted')::BOOLEAN =
      reusable_signature_persisted
    AND (record->>'withdrawalAuthority')::BOOLEAN = withdrawal_authority
    AND (record->>'transferAuthority')::BOOLEAN = transfer_authority
    AND (record->>'accountAdministrationAuthority')::BOOLEAN =
      account_administration_authority
    AND (record->>'mainnetAuthority')::BOOLEAN = mainnet_authority
    AND (record->>'productionAuthority')::BOOLEAN = production_authority
    AND (record->>'fundsAuthority')::BOOLEAN = funds_authority
    AND (record->>'secretsIncluded')::BOOLEAN = secrets_included
  )
);

CREATE TABLE trading_testnet_execution_transitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  execution_id TEXT NOT NULL,
  execution_hash TEXT NOT NULL CHECK (execution_hash ~ '^0x[0-9a-f]{64}$'),
  transition_hash TEXT NOT NULL CHECK (transition_hash ~ '^0x[0-9a-f]{64}$'),
  previous_state TEXT CHECK (
    previous_state IS NULL
    OR previous_state IN ('RESERVED', 'SUBMITTED')
  ),
  next_state TEXT NOT NULL CHECK (
    next_state IN ('RESERVED', 'SUBMITTED', 'CONFIRMED', 'REJECTED', 'UNKNOWN')
  ),
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 3),
  result_hash TEXT CHECK (result_hash IS NULL OR result_hash ~ '^0x[0-9a-f]{64}$'),
  changed_at TIMESTAMPTZ NOT NULL,
  transition JSONB NOT NULL,
  simulation_only BOOLEAN NOT NULL CHECK (simulation_only = TRUE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL
    CHECK (schema_version = 'trading_testnet_execution_transition.v1'),
  CONSTRAINT trading_testnet_execution_transitions_tenant_id_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT trading_testnet_execution_transitions_tenant_hash_key
    UNIQUE (tenant_id, transition_hash),
  CONSTRAINT trading_testnet_execution_transitions_state_key
    UNIQUE (tenant_id, execution_id, next_state),
  CONSTRAINT trading_testnet_execution_transitions_sequence_key
    UNIQUE (tenant_id, execution_id, sequence),
  CONSTRAINT trading_testnet_execution_transitions_execution_fk
    FOREIGN KEY (tenant_id, execution_id)
    REFERENCES trading_testnet_execution_records(tenant_id, id),
  CONSTRAINT trading_testnet_execution_transitions_identity_check CHECK (
    transition->>'transitionId' = id
    AND transition->>'executionId' = execution_id
    AND transition->>'executionHash' = execution_hash
    AND transition->>'transitionHash' = transition_hash
    AND (transition->>'sequence')::INTEGER = sequence
    AND transition->>'nextState' = next_state
    AND transition->>'schemaVersion' = schema_version
    AND (transition->>'simulationOnly')::BOOLEAN = simulation_only
    AND (transition->>'secretsIncluded')::BOOLEAN = secrets_included
  )
);

CREATE FUNCTION guard_trading_execution_nonce_head()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading execution nonce heads cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.signer_reference_hash <> OLD.signer_reference_hash OR
    NEW.facility_id <> OLD.facility_id OR
    NEW.account_binding_hash <> OLD.account_binding_hash OR
    NEW.simulation_only <> OLD.simulation_only OR
    NEW.live_signer_available <> OLD.live_signer_available OR
    NEW.api_wallet_approved <> OLD.api_wallet_approved OR
    NEW.key_exportable <> OLD.key_exportable OR
    NEW.schema_version <> OLD.schema_version OR
    NEW.last_nonce <= OLD.last_nonce OR
    NEW.version <> OLD.version + 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading execution nonce head transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_execution_nonce_heads_transition_guard
BEFORE UPDATE OR DELETE ON trading_execution_nonce_heads
FOR EACH ROW EXECUTE FUNCTION guard_trading_execution_nonce_head();

CREATE FUNCTION guard_trading_testnet_execution_record()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading Testnet execution records cannot be deleted';
  END IF;
  IF
    NEW.tenant_id <> OLD.tenant_id OR
    NEW.id <> OLD.id OR
    NEW.execution_hash <> OLD.execution_hash OR
    NEW.request_hash <> OLD.request_hash OR
    NEW.idempotency_key_hash <> OLD.idempotency_key_hash OR
    NEW.facility_id <> OLD.facility_id OR
    NEW.facility_hash <> OLD.facility_hash OR
    NEW.order_intent_id <> OLD.order_intent_id OR
    NEW.order_intent_hash <> OLD.order_intent_hash OR
    NEW.account_binding_hash <> OLD.account_binding_hash OR
    NEW.signer_reference_hash <> OLD.signer_reference_hash OR
    NEW.policy_decision_hash <> OLD.policy_decision_hash OR
    NEW.action_kind <> OLD.action_kind OR
    NEW.action_hash <> OLD.action_hash OR
    NEW.cloid IS DISTINCT FROM OLD.cloid OR
    NEW.nonce <> OLD.nonce OR
    NEW.created_at <> OLD.created_at OR
    NEW.reserved_at <> OLD.reserved_at OR
    NEW.simulation_only <> OLD.simulation_only OR
    NEW.external_system_queried <> OLD.external_system_queried OR
    NEW.external_order_submitted <> OLD.external_order_submitted OR
    NEW.signer_isolated <> OLD.signer_isolated OR
    NEW.key_exportable <> OLD.key_exportable OR
    NEW.raw_action_accepted <> OLD.raw_action_accepted OR
    NEW.raw_response_persisted <> OLD.raw_response_persisted OR
    NEW.reusable_signature_persisted <> OLD.reusable_signature_persisted OR
    NEW.withdrawal_authority <> OLD.withdrawal_authority OR
    NEW.transfer_authority <> OLD.transfer_authority OR
    NEW.account_administration_authority <>
      OLD.account_administration_authority OR
    NEW.mainnet_authority <> OLD.mainnet_authority OR
    NEW.production_authority <> OLD.production_authority OR
    NEW.funds_authority <> OLD.funds_authority OR
    NEW.secrets_included <> OLD.secrets_included OR
    NEW.schema_version <> OLD.schema_version OR
    NEW.version <> OLD.version + 1 OR
    NOT (
      (OLD.nonce_state = 'RESERVED' AND NEW.nonce_state IN ('SUBMITTED', 'REJECTED'))
      OR (
        OLD.nonce_state = 'SUBMITTED'
        AND NEW.nonce_state IN ('CONFIRMED', 'REJECTED', 'UNKNOWN')
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'trading Testnet execution transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_testnet_execution_records_transition_guard
BEFORE UPDATE OR DELETE ON trading_testnet_execution_records
FOR EACH ROW EXECUTE FUNCTION guard_trading_testnet_execution_record();

CREATE FUNCTION guard_immutable_trading_testnet_execution_transition()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'trading Testnet execution transitions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_testnet_execution_transitions_immutable_guard
BEFORE UPDATE OR DELETE ON trading_testnet_execution_transitions
FOR EACH ROW
EXECUTE FUNCTION guard_immutable_trading_testnet_execution_transition();

ALTER TABLE trading_execution_nonce_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_execution_nonce_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_execution_nonce_heads
  ON trading_execution_nonce_heads
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_execution_nonce_heads
BEFORE INSERT OR UPDATE OR DELETE ON trading_execution_nonce_heads
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE trading_testnet_execution_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_testnet_execution_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_testnet_execution_records
  ON trading_testnet_execution_records
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_testnet_execution_records
BEFORE INSERT OR UPDATE OR DELETE ON trading_testnet_execution_records
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE trading_testnet_execution_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_testnet_execution_transitions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trading_testnet_execution_transitions
  ON trading_testnet_execution_transitions
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_trading_testnet_execution_transitions
BEFORE INSERT OR UPDATE OR DELETE ON trading_testnet_execution_transitions
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX trading_testnet_execution_records_tenant_facility_state_idx
  ON trading_testnet_execution_records(
    tenant_id,
    facility_id,
    nonce_state,
    created_at,
    id
  );
CREATE INDEX trading_testnet_execution_records_tenant_order_idx
  ON trading_testnet_execution_records(
    tenant_id,
    order_intent_id,
    created_at,
    id
  );
CREATE INDEX trading_testnet_execution_transitions_tenant_execution_idx
  ON trading_testnet_execution_transitions(
    tenant_id,
    execution_id,
    sequence
  );
