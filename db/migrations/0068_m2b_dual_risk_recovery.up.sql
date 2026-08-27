-- M2B-003: immutable dual-risk snapshots and recovery incidents.
-- No signer, nonce, network, production, real-funds or risk-expansion authority.

CREATE TABLE agent_dual_risk_incidents (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  incident_hash TEXT NOT NULL CHECK (incident_hash ~ '^0x[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL CHECK (idempotency_key_hash ~ '^0x[0-9a-f]{64}$'),
  composition_id TEXT NOT NULL,
  composition_hash TEXT NOT NULL CHECK (composition_hash ~ '^0x[0-9a-f]{64}$'),
  snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  trading_facility_id TEXT NOT NULL,
  combined_risk_state TEXT NOT NULL CHECK (
    combined_risk_state IN ('WARNING', 'REDUCE_ONLY', 'FLATTEN', 'SETTLEMENT')
  ),
  state TEXT NOT NULL CHECK (state = 'OPEN'),
  current_stage TEXT NOT NULL CHECK (current_stage IN (
    'FREEZE_NEW_RISK', 'CANCEL', 'REDUCE_OR_FLATTEN', 'RECONCILE',
    'REPAY_OR_LIQUIDATE', 'SETTLEMENT_REVIEW'
  )),
  version BIGINT NOT NULL CHECK (version = 1),
  opened_at TIMESTAMPTZ NOT NULL,
  snapshot_record JSONB NOT NULL CHECK (
    jsonb_typeof(snapshot_record) = 'object'
    AND snapshot_record->>'snapshotHash' = snapshot_hash
    AND snapshot_record->>'compositionId' = composition_id
    AND snapshot_record->>'compositionHash' = composition_hash
    AND snapshot_record->>'combinedRiskState' = combined_risk_state
    AND snapshot_record->>'lossDisposition' =
      'CANONICAL_OBLIGATION_REMAINS_OUTSTANDING'
    AND (snapshot_record->>'protectiveAuthorityCanExpandRisk')::BOOLEAN = FALSE
    AND (snapshot_record->>'externalNonceAllocated')::BOOLEAN = FALSE
    AND (snapshot_record->>'signatureCreated')::BOOLEAN = FALSE
    AND (snapshot_record->>'networkCalled')::BOOLEAN = FALSE
    AND (snapshot_record->>'productionAuthority')::BOOLEAN = FALSE
    AND (snapshot_record->>'realFundsAuthority')::BOOLEAN = FALSE
    AND snapshot_record->>'schemaVersion' = 'm2b_dual_risk_snapshot.v1'
    AND snapshot_record::TEXT !~* '"(privateKey|seedPhrase|credential|rawSignature|secret)"'
  ),
  incident_record JSONB NOT NULL CHECK (
    jsonb_typeof(incident_record) = 'object'
    AND incident_record->>'dualRiskIncidentId' = id
    AND incident_record->>'incidentHash' = incident_hash
    AND incident_record->>'compositionId' = composition_id
    AND incident_record->>'compositionHash' = composition_hash
    AND incident_record->>'snapshotHash' = snapshot_hash
    AND incident_record->>'subjectId' = subject_id
    AND incident_record->>'principalId' = principal_id
    AND incident_record->>'obligationId' = obligation_id
    AND incident_record->>'tradingFacilityId' = trading_facility_id
    AND incident_record->>'combinedRiskState' = combined_risk_state
    AND incident_record->>'lossDisposition' =
      'CANONICAL_OBLIGATION_REMAINS_OUTSTANDING'
    AND incident_record->>'state' = state
    AND incident_record->>'currentStage' = current_stage
    AND (incident_record->>'version')::BIGINT = version
    AND (incident_record->>'protectiveAuthorityCanExpandRisk')::BOOLEAN = FALSE
    AND (incident_record->>'externalNonceAllocated')::BOOLEAN = FALSE
    AND (incident_record->>'signatureCreated')::BOOLEAN = FALSE
    AND (incident_record->>'networkCalled')::BOOLEAN = FALSE
    AND (incident_record->>'productionAuthority')::BOOLEAN = FALSE
    AND (incident_record->>'realFundsAuthority')::BOOLEAN = FALSE
    AND incident_record->>'schemaVersion' = 'm2b_dual_risk_incident.v1'
    AND incident_record::TEXT !~* '"(privateKey|seedPhrase|credential|rawSignature|secret)"'
  ),
  protective_authority_can_expand_risk BOOLEAN NOT NULL
    CHECK (protective_authority_can_expand_risk = FALSE),
  external_write_authorized BOOLEAN NOT NULL CHECK (external_write_authorized = FALSE),
  external_nonce_allocated BOOLEAN NOT NULL CHECK (external_nonce_allocated = FALSE),
  signature_created BOOLEAN NOT NULL CHECK (signature_created = FALSE),
  network_called BOOLEAN NOT NULL CHECK (network_called = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  real_funds_authority BOOLEAN NOT NULL CHECK (real_funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'm2b_dual_risk_incident.v1'),
  CONSTRAINT agent_dual_risk_incidents_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT agent_dual_risk_incidents_hash_key UNIQUE (tenant_id, incident_hash),
  CONSTRAINT agent_dual_risk_incidents_idempotency_key
    UNIQUE (tenant_id, idempotency_key_hash),
  CONSTRAINT agent_dual_risk_incidents_composition_key
    UNIQUE (tenant_id, composition_id),
  CONSTRAINT agent_dual_risk_incidents_composition_fk
    FOREIGN KEY (tenant_id, composition_id)
    REFERENCES agent_hyperliquid_compositions(tenant_id, id)
);

CREATE TABLE agent_dual_risk_incident_transitions (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  incident_id TEXT NOT NULL,
  incident_hash TEXT NOT NULL CHECK (incident_hash ~ '^0x[0-9a-f]{64}$'),
  sequence BIGINT NOT NULL CHECK (sequence = 1),
  previous_state TEXT CHECK (previous_state IS NULL),
  next_state TEXT NOT NULL CHECK (next_state = 'OPEN'),
  current_stage TEXT NOT NULL CHECK (current_stage IN (
    'FREEZE_NEW_RISK', 'CANCEL', 'REDUCE_OR_FLATTEN', 'RECONCILE',
    'REPAY_OR_LIQUIDATE', 'SETTLEMENT_REVIEW'
  )),
  transition_hash TEXT NOT NULL CHECK (transition_hash ~ '^0x[0-9a-f]{64}$'),
  changed_at TIMESTAMPTZ NOT NULL,
  external_write_authorized BOOLEAN NOT NULL CHECK (external_write_authorized = FALSE),
  external_nonce_allocated BOOLEAN NOT NULL CHECK (external_nonce_allocated = FALSE),
  signature_created BOOLEAN NOT NULL CHECK (signature_created = FALSE),
  network_called BOOLEAN NOT NULL CHECK (network_called = FALSE),
  schema_version TEXT NOT NULL
    CHECK (schema_version = 'm2b_dual_risk_incident_transition.v1'),
  CONSTRAINT agent_dual_risk_incident_transitions_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT agent_dual_risk_incident_transitions_sequence_key
    UNIQUE (tenant_id, incident_id, sequence),
  CONSTRAINT agent_dual_risk_incident_transitions_hash_key
    UNIQUE (tenant_id, transition_hash),
  CONSTRAINT agent_dual_risk_incident_transitions_incident_fk
    FOREIGN KEY (tenant_id, incident_id)
    REFERENCES agent_dual_risk_incidents(tenant_id, id)
);

CREATE FUNCTION guard_immutable_agent_dual_risk_incident()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514',
    MESSAGE = 'M2B dual-risk recovery Evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_dual_risk_incidents_immutable_guard
BEFORE UPDATE OR DELETE ON agent_dual_risk_incidents
FOR EACH ROW EXECUTE FUNCTION guard_immutable_agent_dual_risk_incident();
CREATE TRIGGER agent_dual_risk_incident_transitions_immutable_guard
BEFORE UPDATE OR DELETE ON agent_dual_risk_incident_transitions
FOR EACH ROW EXECUTE FUNCTION guard_immutable_agent_dual_risk_incident();

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_dual_risk_incidents',
    'agent_dual_risk_incident_transitions'
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

CREATE INDEX agent_dual_risk_incidents_facility_idx
  ON agent_dual_risk_incidents(tenant_id, trading_facility_id, opened_at);
CREATE INDEX agent_dual_risk_incident_transitions_incident_idx
  ON agent_dual_risk_incident_transitions(tenant_id, incident_id, sequence);
