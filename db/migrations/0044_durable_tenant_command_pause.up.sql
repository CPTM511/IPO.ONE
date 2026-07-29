-- OPS-005: one-way local no-funds Tenant command pause.
--
-- The pause blocks new Tenant commands. Queries and background
-- Evidence/reconciliation jobs remain available. No unpause path is granted.

CREATE TABLE tenant_command_pauses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  pause_hash TEXT NOT NULL CHECK (pause_hash ~ '^0x[0-9a-f]{64}$'),
  tenant_ref_hash TEXT NOT NULL CHECK (tenant_ref_hash ~ '^0x[0-9a-f]{64}$'),
  scope TEXT NOT NULL CHECK (scope = 'all_commands'),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'incident_containment',
      'manual_local_safety_pause',
      'reconciliation_integrity'
    )
  ),
  actor_ref_hash TEXT NOT NULL CHECK (actor_ref_hash ~ '^0x[0-9a-f]{64}$'),
  paused_at TIMESTAMPTZ NOT NULL,
  source_event_id TEXT NOT NULL,
  pause_evidence_hash TEXT NOT NULL CHECK (
    pause_evidence_hash ~ '^0x[0-9a-f]{64}$'
  ),
  queries_allowed BOOLEAN NOT NULL CHECK (queries_allowed = TRUE),
  background_evidence_allowed BOOLEAN NOT NULL CHECK (
    background_evidence_allowed = TRUE
  ),
  command_execution_allowed BOOLEAN NOT NULL CHECK (
    command_execution_allowed = FALSE
  ),
  unpause_available BOOLEAN NOT NULL CHECK (unpause_available = FALSE),
  authorizing BOOLEAN NOT NULL CHECK (authorizing = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  economic_state_mutation BOOLEAN NOT NULL CHECK (
    economic_state_mutation = FALSE
  ),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  pause JSONB NOT NULL,
  schema_version TEXT NOT NULL CHECK (
    schema_version = 'tenant_command_pause.v1'
  ),
  CONSTRAINT tenant_command_pauses_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT tenant_command_pauses_tenant_hash_key UNIQUE (
    tenant_id, pause_hash
  ),
  CONSTRAINT tenant_command_pauses_singleton_key UNIQUE (tenant_id, scope),
  CONSTRAINT tenant_command_pauses_source_event_fk
    FOREIGN KEY (tenant_id, source_event_id) REFERENCES domain_events(tenant_id, id),
  CONSTRAINT tenant_command_pauses_identity_check CHECK (
    id = 'tenant_command_pause_global'
    AND pause->>'tenantCommandPauseId' = id
    AND pause->>'pauseHash' = pause_hash
    AND pause->>'tenantRefHash' = tenant_ref_hash
    AND pause->>'scope' = scope
    AND pause->>'reasonCode' = reason_code
    AND pause->>'actorRefHash' = actor_ref_hash
    AND (pause->>'pausedAt')::TIMESTAMPTZ = paused_at
    AND pause->>'schemaVersion' = schema_version
  ),
  CONSTRAINT tenant_command_pauses_safety_check CHECK (
    pause @> jsonb_build_object(
      'authorizing', false,
      'backgroundEvidenceAllowed', true,
      'commandExecutionAllowed', false,
      'economicStateMutation', false,
      'fundsAuthority', false,
      'productionAuthority', false,
      'queriesAllowed', true,
      'sandboxOnly', true,
      'unpauseAvailable', false
    )
  )
);

CREATE TRIGGER tenant_command_pauses_immutable_guard
BEFORE UPDATE OR DELETE ON tenant_command_pauses
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

ALTER TABLE tenant_command_pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_command_pauses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_command_pauses
  ON tenant_command_pauses
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_tenant_command_pauses
BEFORE INSERT OR UPDATE OR DELETE ON tenant_command_pauses
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();
