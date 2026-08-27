-- M2B-002: immutable pre-write composition between the current M2B-001
-- authorization and one existing HyperCore stable intent.
-- This migration deliberately grants no signer, nonce or network authority.

CREATE TABLE agent_hyperliquid_compositions (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  composition_hash TEXT NOT NULL CHECK (composition_hash ~ '^0x[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL CHECK (idempotency_key_hash ~ '^0x[0-9a-f]{64}$'),
  agent_secured_facility_authorization_id TEXT NOT NULL,
  agent_secured_facility_authorization_hash TEXT NOT NULL
    CHECK (agent_secured_facility_authorization_hash ~ '^0x[0-9a-f]{64}$'),
  agent_secured_facility_authorization_version BIGINT NOT NULL
    CHECK (agent_secured_facility_authorization_version = 1),
  hypercore_intent_id TEXT NOT NULL,
  hypercore_intent_hash TEXT NOT NULL CHECK (hypercore_intent_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  trading_facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  policy_constraint_hash TEXT NOT NULL CHECK (policy_constraint_hash ~ '^0x[0-9a-f]{64}$'),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^0x[0-9a-f]{64}$'),
  signer_reference_hash TEXT NOT NULL CHECK (signer_reference_hash ~ '^0x[0-9a-f]{64}$'),
  state TEXT NOT NULL CHECK (state = 'PREPARED'),
  version BIGINT NOT NULL CHECK (version = 1),
  prepared_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > prepared_at),
  composition_record JSONB NOT NULL CHECK (
    jsonb_typeof(composition_record) = 'object'
    AND composition_record->>'m2bHyperliquidCompositionId' = id
    AND composition_record->>'compositionHash' = composition_hash
    AND composition_record->>'agentSecuredFacilityAuthorizationId' =
      agent_secured_facility_authorization_id
    AND composition_record->>'agentSecuredFacilityAuthorizationHash' =
      agent_secured_facility_authorization_hash
    AND (composition_record->>'agentSecuredFacilityAuthorizationVersion')::BIGINT =
      agent_secured_facility_authorization_version
    AND composition_record->>'hypercoreIntentId' = hypercore_intent_id
    AND composition_record->>'hypercoreIntentHash' = hypercore_intent_hash
    AND composition_record->>'subjectId' = subject_id
    AND composition_record->>'principalId' = principal_id
    AND composition_record->>'obligationId' = obligation_id
    AND composition_record->>'tradingFacilityId' = trading_facility_id
    AND composition_record->>'facilityHash' = facility_hash
    AND composition_record->>'policyConstraintHash' = policy_constraint_hash
    AND composition_record->>'payloadHash' = payload_hash
    AND composition_record->>'signerReferenceHash' = signer_reference_hash
    AND composition_record->>'state' = state
    AND (composition_record->>'version')::BIGINT = version
    AND composition_record->>'environment' = 'hyperliquid_testnet'
    AND composition_record->>'market' = 'BTC'
    AND composition_record->>'maxOrderNotionalUsd' = '10'
    AND composition_record->>'launchProfileId' =
      'live_testnet_secured_pool_agent_execution'
    AND (composition_record->>'externalNonceAllocated')::BOOLEAN = FALSE
    AND (composition_record->>'signatureCreated')::BOOLEAN = FALSE
    AND (composition_record->>'networkCalled')::BOOLEAN = FALSE
    AND (composition_record->>'withdrawalAuthority')::BOOLEAN = FALSE
    AND (composition_record->>'transferAuthority')::BOOLEAN = FALSE
    AND (composition_record->>'leverageChangeAuthority')::BOOLEAN = FALSE
    AND (composition_record->>'mainnetAuthority')::BOOLEAN = FALSE
    AND (composition_record->>'productionAuthority')::BOOLEAN = FALSE
    AND (composition_record->>'realFundsAuthority')::BOOLEAN = FALSE
    AND composition_record->>'schemaVersion' = 'm2b_hyperliquid_composition.v1'
    AND composition_record::TEXT !~* '"(privateKey|seedPhrase|credential|rawSignature|secret)"'
  ),
  external_nonce_allocated BOOLEAN NOT NULL CHECK (external_nonce_allocated = FALSE),
  signature_created BOOLEAN NOT NULL CHECK (signature_created = FALSE),
  network_called BOOLEAN NOT NULL CHECK (network_called = FALSE),
  retry_allowed BOOLEAN NOT NULL CHECK (retry_allowed = FALSE),
  withdrawal_authority BOOLEAN NOT NULL CHECK (withdrawal_authority = FALSE),
  transfer_authority BOOLEAN NOT NULL CHECK (transfer_authority = FALSE),
  leverage_change_authority BOOLEAN NOT NULL CHECK (leverage_change_authority = FALSE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  real_funds_authority BOOLEAN NOT NULL CHECK (real_funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'm2b_hyperliquid_composition.v1'),
  CONSTRAINT agent_hyperliquid_compositions_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT agent_hyperliquid_compositions_hash_key
    UNIQUE (tenant_id, composition_hash),
  CONSTRAINT agent_hyperliquid_compositions_idempotency_key
    UNIQUE (tenant_id, idempotency_key_hash),
  CONSTRAINT agent_hyperliquid_compositions_authorization_key
    UNIQUE (tenant_id, agent_secured_facility_authorization_id),
  CONSTRAINT agent_hyperliquid_compositions_intent_key
    UNIQUE (tenant_id, hypercore_intent_id),
  CONSTRAINT agent_hyperliquid_compositions_authorization_fk
    FOREIGN KEY (tenant_id, agent_secured_facility_authorization_id)
    REFERENCES agent_secured_facility_authorizations(tenant_id, id),
  CONSTRAINT agent_hyperliquid_compositions_intent_fk
    FOREIGN KEY (tenant_id, hypercore_intent_id)
    REFERENCES hypercore_stable_execution_intents(tenant_id, id),
  CONSTRAINT agent_hyperliquid_compositions_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT agent_hyperliquid_compositions_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT agent_hyperliquid_compositions_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  CONSTRAINT agent_hyperliquid_compositions_facility_fk
    FOREIGN KEY (tenant_id, trading_facility_id)
    REFERENCES trading_facilities(tenant_id, id)
);

CREATE TABLE agent_hyperliquid_composition_transitions (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  composition_id TEXT NOT NULL,
  composition_hash TEXT NOT NULL CHECK (composition_hash ~ '^0x[0-9a-f]{64}$'),
  sequence BIGINT NOT NULL CHECK (sequence = 1),
  previous_state TEXT CHECK (previous_state IS NULL),
  next_state TEXT NOT NULL CHECK (next_state = 'PREPARED'),
  transition_hash TEXT NOT NULL CHECK (transition_hash ~ '^0x[0-9a-f]{64}$'),
  changed_at TIMESTAMPTZ NOT NULL,
  external_nonce_allocated BOOLEAN NOT NULL CHECK (external_nonce_allocated = FALSE),
  signature_created BOOLEAN NOT NULL CHECK (signature_created = FALSE),
  network_called BOOLEAN NOT NULL CHECK (network_called = FALSE),
  retry_allowed BOOLEAN NOT NULL CHECK (retry_allowed = FALSE),
  schema_version TEXT NOT NULL
    CHECK (schema_version = 'm2b_hyperliquid_composition_transition.v1'),
  CONSTRAINT agent_hyperliquid_composition_transitions_pkey
    PRIMARY KEY (tenant_id, id),
  CONSTRAINT agent_hyperliquid_composition_transitions_sequence_key
    UNIQUE (tenant_id, composition_id, sequence),
  CONSTRAINT agent_hyperliquid_composition_transitions_hash_key
    UNIQUE (tenant_id, transition_hash),
  CONSTRAINT agent_hyperliquid_composition_transitions_composition_fk
    FOREIGN KEY (tenant_id, composition_id)
    REFERENCES agent_hyperliquid_compositions(tenant_id, id)
);

CREATE FUNCTION guard_immutable_agent_hyperliquid_composition()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514',
    MESSAGE = 'M2B Hyperliquid pre-write composition Evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_hyperliquid_compositions_immutable_guard
BEFORE UPDATE OR DELETE ON agent_hyperliquid_compositions
FOR EACH ROW EXECUTE FUNCTION guard_immutable_agent_hyperliquid_composition();
CREATE TRIGGER agent_hyperliquid_composition_transitions_immutable_guard
BEFORE UPDATE OR DELETE ON agent_hyperliquid_composition_transitions
FOR EACH ROW EXECUTE FUNCTION guard_immutable_agent_hyperliquid_composition();

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_hyperliquid_compositions',
    'agent_hyperliquid_composition_transitions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_app_tenant_id()) WITH CHECK (tenant_id = current_app_tenant_id())',
      'tenant_isolation_' || table_name,
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context()',
      'tenant_context_guard_' || table_name,
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX agent_hyperliquid_compositions_facility_idx
  ON agent_hyperliquid_compositions(tenant_id, trading_facility_id, prepared_at);
CREATE INDEX agent_hyperliquid_composition_transitions_composition_idx
  ON agent_hyperliquid_composition_transitions(tenant_id, composition_id, sequence);
