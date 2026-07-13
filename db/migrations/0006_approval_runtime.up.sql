CREATE TYPE approval_proposal_status AS ENUM (
  'pending', 'approved', 'rejected', 'canceled', 'expired', 'superseded', 'executed'
);
CREATE TYPE approval_decision_value AS ENUM ('approve', 'reject');
CREATE TYPE break_glass_incident_status AS ENUM (
  'pending_custodians', 'active', 'expired', 'closed', 'canceled'
);
CREATE TYPE break_glass_review_status AS ENUM (
  'not_required', 'pending', 'completed', 'overdue'
);

CREATE TABLE approval_proposals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  proposal_hash TEXT UNIQUE NOT NULL CHECK (proposal_hash ~ '^0x[0-9a-f]{64}$'),
  operation_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  command_actor_id TEXT NOT NULL REFERENCES actors(id),
  command_actor_type actor_type NOT NULL,
  command_client_id TEXT NOT NULL,
  command_hash TEXT NOT NULL CHECK (command_hash ~ '^0x[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL CHECK (
    idempotency_key_hash ~ '^[A-Za-z0-9_-]{32,128}$'
  ),
  resource_version BIGINT NOT NULL CHECK (resource_version >= 0),
  live_state_version BIGINT NOT NULL CHECK (live_state_version >= 0),
  reason_code TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  approval_policy_version TEXT NOT NULL CHECK (approval_policy_version = 'approval_001.v1'),
  proposer_actor_id TEXT NOT NULL REFERENCES actors(id),
  proposer_client_id TEXT NOT NULL,
  proposer_membership_id TEXT NOT NULL,
  proposer_membership_version BIGINT NOT NULL CHECK (proposer_membership_version >= 1),
  required_approver_role_bundles JSONB NOT NULL CHECK (
    jsonb_typeof(required_approver_role_bundles) = 'array'
    AND jsonb_array_length(required_approver_role_bundles) = 2
    AND required_approver_role_bundles = '["risk_operator", "operations_operator"]'::jsonb
  ),
  required_approval_count INTEGER NOT NULL CHECK (required_approval_count = 2),
  status approval_proposal_status NOT NULL,
  version BIGINT NOT NULL CHECK (version >= 1),
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  superseded_by_proposal_id TEXT,
  executed_at TIMESTAMPTZ,
  execution_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'approval_proposal.v1'),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, proposer_membership_id)
    REFERENCES memberships(tenant_id, id),
  CHECK (expires_at > created_at),
  CHECK (expires_at <= created_at + INTERVAL '30 minutes'),
  CHECK (updated_at >= created_at),
  CHECK (status <> 'approved' OR approved_at IS NOT NULL),
  CHECK (status <> 'rejected' OR rejected_at IS NOT NULL),
  CHECK (status <> 'canceled' OR canceled_at IS NOT NULL),
  CHECK (status <> 'expired' OR expired_at IS NOT NULL),
  CHECK (
    (status = 'superseded') =
    (superseded_at IS NOT NULL AND superseded_by_proposal_id IS NOT NULL)
  ),
  CHECK (
    (status = 'executed') =
    (executed_at IS NOT NULL AND execution_id IS NOT NULL)
  )
);

CREATE TABLE approval_decisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  proposal_id TEXT NOT NULL,
  decision_hash TEXT UNIQUE NOT NULL CHECK (decision_hash ~ '^0x[0-9a-f]{64}$'),
  proposal_version BIGINT NOT NULL CHECK (proposal_version >= 1),
  proposal_hash TEXT NOT NULL CHECK (proposal_hash ~ '^0x[0-9a-f]{64}$'),
  command_hash TEXT NOT NULL CHECK (command_hash ~ '^0x[0-9a-f]{64}$'),
  policy_version TEXT NOT NULL,
  decision approval_decision_value NOT NULL,
  reason_code TEXT NOT NULL,
  approver_actor_id TEXT NOT NULL REFERENCES actors(id),
  approver_actor_type actor_type NOT NULL,
  approver_client_id TEXT NOT NULL,
  approver_credential_id TEXT NOT NULL,
  approver_credential_version BIGINT NOT NULL CHECK (approver_credential_version >= 1),
  approver_membership_id TEXT NOT NULL,
  approver_membership_version BIGINT NOT NULL CHECK (approver_membership_version >= 1),
  approver_role_bundle TEXT NOT NULL CHECK (
    (approver_role_bundle = 'risk_operator' AND approver_actor_type = 'risk_operator')
    OR (
      approver_role_bundle = 'operations_operator'
      AND approver_actor_type = 'operations_operator'
    )
  ),
  auth_time TIMESTAMPTZ NOT NULL,
  authentication_methods JSONB NOT NULL CHECK (
    jsonb_typeof(authentication_methods) = 'array'
    AND jsonb_array_length(authentication_methods) BETWEEN 1 AND 8
    AND authentication_methods ?| ARRAY['hwk', 'webauthn', 'fido']
  ),
  token_jti_hash TEXT NOT NULL CHECK (
    token_jti_hash ~ '^[A-Za-z0-9_-]{32,128}$'
  ),
  version BIGINT NOT NULL CHECK (version = 1),
  created_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'approval_decision.v1'),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, proposal_id, approver_actor_id),
  FOREIGN KEY (tenant_id, proposal_id)
    REFERENCES approval_proposals(tenant_id, id),
  FOREIGN KEY (tenant_id, approver_membership_id)
    REFERENCES memberships(tenant_id, id)
);

CREATE TABLE approval_executions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  proposal_id TEXT NOT NULL,
  execution_hash TEXT UNIQUE NOT NULL CHECK (execution_hash ~ '^0x[0-9a-f]{64}$'),
  proposal_version BIGINT NOT NULL CHECK (proposal_version >= 1),
  proposal_hash TEXT NOT NULL CHECK (proposal_hash ~ '^0x[0-9a-f]{64}$'),
  command_hash TEXT NOT NULL CHECK (command_hash ~ '^0x[0-9a-f]{64}$'),
  authorization_decision_id TEXT NOT NULL,
  executed_by_actor_id TEXT NOT NULL REFERENCES actors(id),
  idempotency_key_hash TEXT NOT NULL CHECK (
    idempotency_key_hash ~ '^[A-Za-z0-9_-]{32,128}$'
  ),
  approval_decision_ids JSONB NOT NULL CHECK (
    jsonb_typeof(approval_decision_ids) = 'array'
    AND jsonb_array_length(approval_decision_ids) = 2
    AND approval_decision_ids->>0 <> approval_decision_ids->>1
  ),
  business_event_ids JSONB NOT NULL CHECK (
    jsonb_typeof(business_event_ids) = 'array'
    AND jsonb_array_length(business_event_ids) BETWEEN 1 AND 128
  ),
  result_hash TEXT NOT NULL CHECK (result_hash ~ '^0x[0-9a-f]{64}$'),
  version BIGINT NOT NULL CHECK (version = 1),
  executed_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'approval_execution.v1'),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, proposal_id),
  FOREIGN KEY (tenant_id, proposal_id)
    REFERENCES approval_proposals(tenant_id, id)
);

CREATE TABLE break_glass_incidents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  incident_hash TEXT UNIQUE NOT NULL CHECK (incident_hash ~ '^0x[0-9a-f]{64}$'),
  reason_code TEXT NOT NULL,
  allowed_actions JSONB NOT NULL CHECK (
    jsonb_typeof(allowed_actions) = 'array'
    AND jsonb_array_length(allowed_actions) BETWEEN 1 AND 8
    AND allowed_actions <@ '[
      "credential.revoke", "provider.pause", "risk.freeze",
      "tenant.command.pause", "worker.delivery.pause"
    ]'::jsonb
  ),
  resource_scopes JSONB NOT NULL CHECK (
    jsonb_typeof(resource_scopes) = 'array'
    AND jsonb_array_length(resource_scopes) BETWEEN 1 AND 16
  ),
  requested_by_actor_id TEXT NOT NULL REFERENCES actors(id),
  requested_by_client_id TEXT NOT NULL,
  custodian_actor_ids JSONB NOT NULL CHECK (
    jsonb_typeof(custodian_actor_ids) = 'array'
    AND jsonb_array_length(custodian_actor_ids) = 2
    AND custodian_actor_ids->>0 <> custodian_actor_ids->>1
  ),
  review_owner_actor_id TEXT NOT NULL REFERENCES actors(id),
  deployment_approval_ref_hash TEXT NOT NULL CHECK (
    deployment_approval_ref_hash ~ '^[A-Za-z0-9_-]{32,128}$'
  ),
  notification_target_ref_hash TEXT NOT NULL CHECK (
    notification_target_ref_hash ~ '^[A-Za-z0-9_-]{32,128}$'
  ),
  maximum_session_ms INTEGER NOT NULL CHECK (
    maximum_session_ms BETWEEN 60000 AND 1800000
  ),
  status break_glass_incident_status NOT NULL,
  review_status break_glass_review_status NOT NULL,
  version BIGINT NOT NULL CHECK (version >= 1),
  activation_deadline TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  review_due_at TIMESTAMPTZ,
  declared_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'break_glass_incident.v1'),
  UNIQUE (tenant_id, id),
  CHECK (activation_deadline > declared_at),
  CHECK (activation_deadline <= declared_at + INTERVAL '10 minutes'),
  CHECK (requested_by_actor_id <> review_owner_actor_id),
  CHECK (NOT (custodian_actor_ids ? requested_by_actor_id)),
  CHECK (NOT (custodian_actor_ids ? review_owner_actor_id)),
  CHECK (updated_at >= declared_at),
  CHECK (
    status NOT IN ('active', 'expired', 'closed') OR
    (activated_at IS NOT NULL AND expires_at IS NOT NULL AND review_due_at IS NOT NULL)
  ),
  CHECK (
    expires_at IS NULL OR
    expires_at <= activated_at + maximum_session_ms * INTERVAL '1 millisecond'
  ),
  CHECK (review_due_at IS NULL OR review_due_at <= expires_at + INTERVAL '24 hours'),
  CHECK (status <> 'expired' OR expired_at IS NOT NULL),
  CHECK (status <> 'closed' OR closed_at IS NOT NULL),
  CHECK (status <> 'canceled' OR canceled_at IS NOT NULL)
);

CREATE TABLE break_glass_custodian_decisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  incident_id TEXT NOT NULL,
  decision_hash TEXT UNIQUE NOT NULL CHECK (decision_hash ~ '^0x[0-9a-f]{64}$'),
  incident_version BIGINT NOT NULL CHECK (incident_version >= 1),
  incident_hash TEXT NOT NULL CHECK (incident_hash ~ '^0x[0-9a-f]{64}$'),
  custodian_actor_id TEXT NOT NULL REFERENCES actors(id),
  custodian_client_id TEXT NOT NULL,
  custodian_credential_id TEXT NOT NULL,
  custodian_credential_version BIGINT NOT NULL CHECK (custodian_credential_version >= 1),
  hardware_key_ref_hash TEXT NOT NULL CHECK (
    hardware_key_ref_hash ~ '^[A-Za-z0-9_-]{32,128}$'
  ),
  auth_time TIMESTAMPTZ NOT NULL,
  authentication_methods JSONB NOT NULL CHECK (
    jsonb_typeof(authentication_methods) = 'array'
    AND jsonb_array_length(authentication_methods) BETWEEN 1 AND 8
    AND authentication_methods ?| ARRAY['hwk', 'webauthn', 'fido']
  ),
  version BIGINT NOT NULL CHECK (version = 1),
  created_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'break_glass_custodian_decision.v1'),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, incident_id, custodian_actor_id),
  FOREIGN KEY (tenant_id, incident_id)
    REFERENCES break_glass_incidents(tenant_id, id)
);

CREATE TABLE break_glass_reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  incident_id TEXT NOT NULL,
  review_hash TEXT UNIQUE NOT NULL CHECK (review_hash ~ '^0x[0-9a-f]{64}$'),
  incident_hash TEXT NOT NULL CHECK (incident_hash ~ '^0x[0-9a-f]{64}$'),
  reviewer_actor_id TEXT NOT NULL REFERENCES actors(id),
  reviewer_client_id TEXT NOT NULL,
  findings_ref_hash TEXT NOT NULL CHECK (
    findings_ref_hash ~ '^[A-Za-z0-9_-]{32,128}$'
  ),
  version BIGINT NOT NULL CHECK (version = 1),
  completed_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'break_glass_review.v1'),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, incident_id),
  FOREIGN KEY (tenant_id, incident_id)
    REFERENCES break_glass_incidents(tenant_id, id)
);

CREATE UNIQUE INDEX approval_decisions_role_separation_idx
  ON approval_decisions(tenant_id, proposal_id, approver_role_bundle)
  WHERE decision = 'approve';
CREATE UNIQUE INDEX approval_proposals_active_command_idx
  ON approval_proposals(tenant_id, command_hash)
  WHERE status IN ('pending', 'approved');
CREATE INDEX approval_proposals_status_expiry_idx
  ON approval_proposals(tenant_id, status, expires_at);
CREATE INDEX approval_decisions_proposal_idx
  ON approval_decisions(tenant_id, proposal_id, created_at, id);
CREATE INDEX break_glass_incidents_status_expiry_idx
  ON break_glass_incidents(tenant_id, status, expires_at);

CREATE FUNCTION protect_approval_proposal_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.proposal_hash IS DISTINCT FROM NEW.proposal_hash
     OR OLD.operation_id IS DISTINCT FROM NEW.operation_id
     OR OLD.action IS DISTINCT FROM NEW.action
     OR OLD.resource_type IS DISTINCT FROM NEW.resource_type
     OR OLD.resource_id IS DISTINCT FROM NEW.resource_id
     OR OLD.command_actor_id IS DISTINCT FROM NEW.command_actor_id
     OR OLD.command_actor_type IS DISTINCT FROM NEW.command_actor_type
     OR OLD.command_client_id IS DISTINCT FROM NEW.command_client_id
     OR OLD.command_hash IS DISTINCT FROM NEW.command_hash
     OR OLD.idempotency_key_hash IS DISTINCT FROM NEW.idempotency_key_hash
     OR OLD.resource_version IS DISTINCT FROM NEW.resource_version
     OR OLD.live_state_version IS DISTINCT FROM NEW.live_state_version
     OR OLD.reason_code IS DISTINCT FROM NEW.reason_code
     OR OLD.policy_version IS DISTINCT FROM NEW.policy_version
     OR OLD.approval_policy_version IS DISTINCT FROM NEW.approval_policy_version
     OR OLD.proposer_actor_id IS DISTINCT FROM NEW.proposer_actor_id
     OR OLD.proposer_client_id IS DISTINCT FROM NEW.proposer_client_id
     OR OLD.proposer_membership_id IS DISTINCT FROM NEW.proposer_membership_id
     OR OLD.proposer_membership_version IS DISTINCT FROM NEW.proposer_membership_version
     OR OLD.required_approver_role_bundles IS DISTINCT FROM NEW.required_approver_role_bundles
     OR OLD.required_approval_count IS DISTINCT FROM NEW.required_approval_count
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'approval proposal immutable fields cannot change';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'approval proposal version must increment exactly once';
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN (
      'pending', 'approved', 'rejected', 'canceled', 'expired', 'superseded'
    ))
    OR (OLD.status = 'approved' AND NEW.status IN (
      'executed', 'canceled', 'expired', 'superseded'
    ))
  ) THEN
    RAISE EXCEPTION 'approval proposal transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_break_glass_incident_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.incident_hash IS DISTINCT FROM NEW.incident_hash
     OR OLD.reason_code IS DISTINCT FROM NEW.reason_code
     OR OLD.allowed_actions IS DISTINCT FROM NEW.allowed_actions
     OR OLD.resource_scopes IS DISTINCT FROM NEW.resource_scopes
     OR OLD.requested_by_actor_id IS DISTINCT FROM NEW.requested_by_actor_id
     OR OLD.requested_by_client_id IS DISTINCT FROM NEW.requested_by_client_id
     OR OLD.custodian_actor_ids IS DISTINCT FROM NEW.custodian_actor_ids
     OR OLD.review_owner_actor_id IS DISTINCT FROM NEW.review_owner_actor_id
     OR OLD.deployment_approval_ref_hash IS DISTINCT FROM NEW.deployment_approval_ref_hash
     OR OLD.notification_target_ref_hash IS DISTINCT FROM NEW.notification_target_ref_hash
     OR OLD.maximum_session_ms IS DISTINCT FROM NEW.maximum_session_ms
     OR OLD.activation_deadline IS DISTINCT FROM NEW.activation_deadline
     OR (OLD.activated_at IS DISTINCT FROM NEW.activated_at AND OLD.activated_at IS NOT NULL)
     OR (OLD.expires_at IS DISTINCT FROM NEW.expires_at AND OLD.expires_at IS NOT NULL)
     OR OLD.declared_at IS DISTINCT FROM NEW.declared_at
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'break-glass incident immutable fields cannot change';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'break-glass incident version must increment exactly once';
  END IF;

  IF NOT (
    (OLD.status = 'pending_custodians' AND NEW.status IN (
      'pending_custodians', 'active', 'canceled'
    ))
    OR (OLD.status = 'active' AND NEW.status IN ('expired', 'closed'))
    OR (OLD.status IN ('expired', 'closed') AND NEW.status = OLD.status
        AND NEW.review_status IN ('completed', 'overdue'))
  ) THEN
    RAISE EXCEPTION 'break-glass incident transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER approval_proposals_transition_guard
BEFORE UPDATE ON approval_proposals
FOR EACH ROW EXECUTE FUNCTION protect_approval_proposal_transition();

CREATE TRIGGER approval_proposals_delete_guard
BEFORE DELETE ON approval_proposals
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER approval_decisions_immutable
BEFORE UPDATE OR DELETE ON approval_decisions
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER approval_executions_immutable
BEFORE UPDATE OR DELETE ON approval_executions
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER break_glass_incidents_transition_guard
BEFORE UPDATE ON break_glass_incidents
FOR EACH ROW EXECUTE FUNCTION protect_break_glass_incident_transition();

CREATE TRIGGER break_glass_incidents_delete_guard
BEFORE DELETE ON break_glass_incidents
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER break_glass_custodian_decisions_immutable
BEFORE UPDATE OR DELETE ON break_glass_custodian_decisions
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER break_glass_reviews_immutable
BEFORE UPDATE OR DELETE ON break_glass_reviews
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

DO $$
DECLARE
  table_name TEXT;
  approval_tables CONSTANT TEXT[] := ARRAY[
    'approval_proposals', 'approval_decisions', 'approval_executions',
    'break_glass_incidents', 'break_glass_custodian_decisions',
    'break_glass_reviews'
  ];
BEGIN
  FOREACH table_name IN ARRAY approval_tables LOOP
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
