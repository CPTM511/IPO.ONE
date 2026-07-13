ALTER TABLE memberships
  ADD COLUMN client_ids JSONB,
  ADD COLUMN policy_version TEXT,
  ADD COLUMN version BIGINT,
  ADD COLUMN controller_actor_id TEXT;

ALTER TABLE memberships DISABLE TRIGGER tenant_context_guard_memberships;

UPDATE memberships
   SET client_ids = CASE
         WHEN id = 'membership_local_system' THEN '["client_local_system"]'::jsonb
         ELSE '[]'::jsonb
       END,
       policy_version = 'security_001.v1',
       version = 1;

ALTER TABLE memberships ENABLE TRIGGER tenant_context_guard_memberships;

ALTER TABLE memberships
  ALTER COLUMN client_ids SET NOT NULL,
  ALTER COLUMN policy_version SET NOT NULL,
  ALTER COLUMN version SET NOT NULL,
  ADD CONSTRAINT memberships_client_ids_check CHECK (
    jsonb_typeof(client_ids) = 'array'
    AND jsonb_array_length(client_ids) BETWEEN 0 AND 16
  ),
  ADD CONSTRAINT memberships_policy_version_check CHECK (char_length(policy_version) BETWEEN 1 AND 128),
  ADD CONSTRAINT memberships_version_check CHECK (version >= 1),
  ADD CONSTRAINT memberships_tenant_actor_key UNIQUE (tenant_id, actor_id);

ALTER TABLE memberships
  ADD CONSTRAINT memberships_controller_not_self_check CHECK (
    controller_actor_id IS NULL OR controller_actor_id <> actor_id
  ),
  ADD CONSTRAINT memberships_controller_fk FOREIGN KEY (tenant_id, controller_actor_id)
    REFERENCES memberships(tenant_id, actor_id);

ALTER TABLE access_grants
  ADD COLUMN policy_version TEXT NOT NULL DEFAULT 'security_001.v1',
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT access_grants_policy_version_check CHECK (char_length(policy_version) BETWEEN 1 AND 128),
  ADD CONSTRAINT access_grants_version_check CHECK (version >= 1);

ALTER TABLE access_grants
  ALTER COLUMN policy_version DROP DEFAULT,
  ALTER COLUMN version DROP DEFAULT;

CREATE TABLE authorization_resources (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  resource_type TEXT NOT NULL CHECK (char_length(resource_type) BETWEEN 1 AND 128),
  resource_id TEXT NOT NULL CHECK (char_length(resource_id) BETWEEN 1 AND 2048),
  status TEXT NOT NULL CHECK (status IN ('active', 'frozen', 'closed')),
  version BIGINT NOT NULL CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'authorization_resource.v1'),
  PRIMARY KEY (tenant_id, resource_type, resource_id),
  CHECK (updated_at >= created_at)
);

CREATE TABLE authorization_resource_bindings (
  tenant_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN ('owner', 'controller', 'subject')),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  version BIGINT NOT NULL CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'authorization_resource_binding.v1'),
  PRIMARY KEY (tenant_id, resource_type, resource_id, actor_id),
  FOREIGN KEY (tenant_id, resource_type, resource_id)
    REFERENCES authorization_resources(tenant_id, resource_type, resource_id),
  FOREIGN KEY (tenant_id, actor_id)
    REFERENCES memberships(tenant_id, actor_id),
  CHECK (updated_at >= created_at)
);

CREATE TABLE authorization_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  occurred_at TIMESTAMPTZ NOT NULL,
  request_id TEXT NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 2048),
  correlation_id TEXT NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 2048),
  actor_id TEXT NOT NULL CHECK (char_length(actor_id) BETWEEN 1 AND 2048),
  actor_type TEXT NOT NULL CHECK (char_length(actor_type) BETWEEN 1 AND 128),
  client_ref_hash TEXT NOT NULL CHECK (client_ref_hash ~ '^[A-Za-z0-9_-]{43}$'),
  token_jti_hash TEXT NOT NULL CHECK (char_length(token_jti_hash) BETWEEN 32 AND 128),
  operation_id TEXT NOT NULL CHECK (char_length(operation_id) BETWEEN 1 AND 128),
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 128),
  resource_type TEXT NOT NULL CHECK (char_length(resource_type) BETWEEN 1 AND 128),
  resource_id TEXT NOT NULL CHECK (char_length(resource_id) BETWEEN 1 AND 2048),
  authorization_decision TEXT NOT NULL CHECK (authorization_decision IN ('allow', 'deny')),
  authorization_decision_id TEXT,
  command_payload_hash TEXT CHECK (command_payload_hash ~ '^0x[0-9a-f]{64}$'),
  command_hash TEXT CHECK (command_hash ~ '^0x[0-9a-f]{64}$'),
  policy_version TEXT NOT NULL CHECK (char_length(policy_version) BETWEEN 1 AND 128),
  reason_code TEXT NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 128),
  approval_ids JSONB NOT NULL CHECK (
    jsonb_typeof(approval_ids) = 'array'
    AND jsonb_array_length(approval_ids) <= 8
  ),
  approval_proposal_id TEXT,
  approval_proposal_version BIGINT,
  membership_id TEXT NOT NULL CHECK (char_length(membership_id) BETWEEN 1 AND 2048),
  access_grant_id TEXT,
  source_network_ref_hash TEXT,
  schema_version TEXT NOT NULL CHECK (schema_version = 'authorization_audit_event.v2'),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, authorization_decision_id),
  CHECK ((command_payload_hash IS NULL) = (command_hash IS NULL)),
  CHECK ((approval_proposal_id IS NULL) = (approval_proposal_version IS NULL)),
  CHECK (approval_proposal_version IS NULL OR approval_proposal_version >= 1),
  CHECK (
    (authorization_decision = 'allow' AND authorization_decision_id IS NOT NULL)
    OR (authorization_decision = 'deny' AND authorization_decision_id IS NULL)
  )
);

CREATE TABLE tenant_command_executions (
  tenant_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation_id TEXT NOT NULL CHECK (char_length(operation_id) BETWEEN 1 AND 128),
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (char_length(actor_type) BETWEEN 1 AND 128),
  client_ref_hash TEXT NOT NULL CHECK (client_ref_hash ~ '^[A-Za-z0-9_-]{43}$'),
  command_payload_hash TEXT NOT NULL CHECK (command_payload_hash ~ '^0x[0-9a-f]{64}$'),
  command_hash TEXT NOT NULL CHECK (command_hash ~ '^0x[0-9a-f]{64}$'),
  authorization_decision_id TEXT NOT NULL,
  admission_id TEXT NOT NULL,
  business_event_id TEXT NOT NULL,
  response_hash TEXT NOT NULL CHECK (response_hash ~ '^0x[0-9a-f]{64}$'),
  completed_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL CHECK (version = 1),
  schema_version TEXT NOT NULL CHECK (schema_version = 'tenant_command_execution.v1'),
  PRIMARY KEY (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, idempotency_key)
    REFERENCES command_idempotency(tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, actor_id)
    REFERENCES memberships(tenant_id, actor_id),
  FOREIGN KEY (tenant_id, authorization_decision_id)
    REFERENCES authorization_audit_events(tenant_id, authorization_decision_id),
  FOREIGN KEY (tenant_id, admission_id)
    REFERENCES abuse_admissions(tenant_id, id),
  FOREIGN KEY (tenant_id, business_event_id)
    REFERENCES domain_events(tenant_id, id)
);

CREATE INDEX authorization_resource_bindings_actor_idx
  ON authorization_resource_bindings(tenant_id, actor_id, status);
CREATE INDEX authorization_audit_events_subject_idx
  ON authorization_audit_events(tenant_id, actor_id, occurred_at DESC);
CREATE INDEX authorization_audit_events_command_idx
  ON authorization_audit_events(tenant_id, command_hash)
  WHERE command_hash IS NOT NULL;
CREATE INDEX tenant_command_executions_actor_idx
  ON tenant_command_executions(tenant_id, actor_id, completed_at DESC);

CREATE FUNCTION protect_membership_authorization_transition()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('authorization_membership:' || OLD.tenant_id),
    hashtext(OLD.actor_id)
  );
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'membership deletion is prohibited; revoke it instead';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.membership_hash IS DISTINCT FROM NEW.membership_hash
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.actor_id IS DISTINCT FROM NEW.actor_id
     OR OLD.controller_actor_id IS DISTINCT FROM NEW.controller_actor_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'membership immutable fields cannot change';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'membership version must increment exactly once';
  END IF;
  IF OLD.status = 'revoked' OR
     (OLD.status = 'suspended' AND NEW.status NOT IN ('suspended', 'revoked')) THEN
    RAISE EXCEPTION 'membership transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_access_grant_authorization_transition()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('authorization_resource:' || OLD.resource_type),
    hashtext(OLD.resource_id)
  );
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AccessGrant deletion is prohibited; revoke or expire it instead';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.access_grant_hash IS DISTINCT FROM NEW.access_grant_hash
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.grantee_tenant_id IS DISTINCT FROM NEW.grantee_tenant_id
     OR OLD.grantee_actor_id IS DISTINCT FROM NEW.grantee_actor_id
     OR OLD.capability IS DISTINCT FROM NEW.capability
     OR OLD.resource_type IS DISTINCT FROM NEW.resource_type
     OR OLD.resource_id IS DISTINCT FROM NEW.resource_id
     OR OLD.purpose IS DISTINCT FROM NEW.purpose
     OR OLD.valid_from IS DISTINCT FROM NEW.valid_from
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
     OR OLD.created_by_actor_id IS DISTINCT FROM NEW.created_by_actor_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'AccessGrant immutable fields cannot change';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'AccessGrant version must increment exactly once';
  END IF;
  IF OLD.status <> 'active' OR NEW.status NOT IN ('revoked', 'expired') THEN
    RAISE EXCEPTION 'AccessGrant transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_authorization_resource_transition()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('authorization_resource:' || OLD.resource_type),
    hashtext(OLD.resource_id)
  );
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'authorization resource deletion is prohibited; close it instead';
  END IF;
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.resource_type IS DISTINCT FROM NEW.resource_type
     OR OLD.resource_id IS DISTINCT FROM NEW.resource_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'authorization resource immutable fields cannot change';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'authorization resource version must increment exactly once';
  END IF;
  IF OLD.status = 'closed' OR
     (OLD.status = 'frozen' AND NEW.status NOT IN ('active', 'closed')) OR
     (OLD.status = 'active' AND NEW.status NOT IN ('frozen', 'closed')) THEN
    RAISE EXCEPTION 'authorization resource transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_authorization_resource_binding_transition()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('authorization_resource:' || OLD.resource_type),
    hashtext(OLD.resource_id)
  );
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'authorization resource binding deletion is prohibited; revoke it instead';
  END IF;
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.resource_type IS DISTINCT FROM NEW.resource_type
     OR OLD.resource_id IS DISTINCT FROM NEW.resource_id
     OR OLD.actor_id IS DISTINCT FROM NEW.actor_id
     OR OLD.relationship IS DISTINCT FROM NEW.relationship
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'authorization resource binding immutable fields cannot change';
  END IF;
  IF NEW.version <> OLD.version + 1 OR OLD.status <> 'active' OR NEW.status <> 'revoked' THEN
    RAISE EXCEPTION 'authorization resource binding transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION lock_actor_authorization_transition()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('authorization_actor'), hashtext(OLD.id));
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Actor deletion is prohibited; change its status instead';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.actor_hash IS DISTINCT FROM NEW.actor_hash
     OR OLD.actor_type IS DISTINCT FROM NEW.actor_type
     OR OLD.external_subject_hash IS DISTINCT FROM NEW.external_subject_hash
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'Actor immutable fields cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memberships_authorization_transition_guard
BEFORE UPDATE OR DELETE ON memberships
FOR EACH ROW EXECUTE FUNCTION protect_membership_authorization_transition();

CREATE TRIGGER actors_authorization_lock
BEFORE UPDATE OR DELETE ON actors
FOR EACH ROW EXECUTE FUNCTION lock_actor_authorization_transition();

CREATE TRIGGER access_grants_authorization_transition_guard
BEFORE UPDATE OR DELETE ON access_grants
FOR EACH ROW EXECUTE FUNCTION protect_access_grant_authorization_transition();

CREATE TRIGGER authorization_resources_transition_guard
BEFORE UPDATE OR DELETE ON authorization_resources
FOR EACH ROW EXECUTE FUNCTION protect_authorization_resource_transition();

CREATE TRIGGER authorization_resource_bindings_transition_guard
BEFORE UPDATE OR DELETE ON authorization_resource_bindings
FOR EACH ROW EXECUTE FUNCTION protect_authorization_resource_binding_transition();

CREATE TRIGGER authorization_audit_events_immutable
BEFORE UPDATE OR DELETE ON authorization_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER tenant_command_executions_immutable
BEFORE UPDATE OR DELETE ON tenant_command_executions
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE POLICY actor_authorization_lock_update ON actors
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
        FROM memberships membership_row
       WHERE membership_row.actor_id = actors.id
         AND membership_row.tenant_id = current_app_tenant_id()
         AND membership_row.status = 'active'
         AND membership_row.valid_from <= clock_timestamp()
         AND (membership_row.expires_at IS NULL OR membership_row.expires_at > clock_timestamp())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM memberships membership_row
       WHERE membership_row.actor_id = actors.id
         AND membership_row.tenant_id = current_app_tenant_id()
         AND membership_row.status = 'active'
         AND membership_row.valid_from <= clock_timestamp()
         AND (membership_row.expires_at IS NULL OR membership_row.expires_at > clock_timestamp())
    )
  );

CREATE POLICY access_grants_participant_lock_update ON access_grants
  FOR UPDATE
  USING (
    grantee_tenant_id = current_app_tenant_id()
    AND grantee_actor_id = current_app_actor_id()
  )
  WITH CHECK (
    grantee_tenant_id = current_app_tenant_id()
    AND grantee_actor_id = current_app_actor_id()
  );

DO $$
DECLARE
  table_name TEXT;
  gateway_tables CONSTANT TEXT[] := ARRAY[
    'authorization_resource_bindings', 'authorization_audit_events',
    'tenant_command_executions'
  ];
BEGIN
  FOREACH table_name IN ARRAY gateway_tables LOOP
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

ALTER TABLE authorization_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_resources FORCE ROW LEVEL SECURITY;
CREATE POLICY authorization_resources_participant_select ON authorization_resources
  FOR SELECT USING (
    tenant_id = current_app_tenant_id()
    OR EXISTS (
      SELECT 1
        FROM access_grants grant_row
       WHERE grant_row.tenant_id = authorization_resources.tenant_id
         AND grant_row.grantee_tenant_id = current_app_tenant_id()
         AND grant_row.grantee_actor_id = current_app_actor_id()
         AND grant_row.resource_type = authorization_resources.resource_type
         AND grant_row.resource_id = authorization_resources.resource_id
         AND grant_row.status = 'active'
         AND grant_row.policy_version = current_app_policy_version()
         AND grant_row.valid_from <= clock_timestamp()
         AND grant_row.expires_at > clock_timestamp()
    )
  );
CREATE POLICY authorization_resources_owner_insert ON authorization_resources
  FOR INSERT WITH CHECK (tenant_id = current_app_tenant_id());
CREATE POLICY authorization_resources_owner_update ON authorization_resources
  FOR UPDATE
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE POLICY authorization_resources_participant_lock_update ON authorization_resources
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
        FROM access_grants grant_row
       WHERE grant_row.tenant_id = authorization_resources.tenant_id
         AND grant_row.grantee_tenant_id = current_app_tenant_id()
         AND grant_row.grantee_actor_id = current_app_actor_id()
         AND grant_row.resource_type = authorization_resources.resource_type
         AND grant_row.resource_id = authorization_resources.resource_id
         AND grant_row.status = 'active'
         AND grant_row.policy_version = current_app_policy_version()
         AND grant_row.valid_from <= clock_timestamp()
         AND grant_row.expires_at > clock_timestamp()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM access_grants grant_row
       WHERE grant_row.tenant_id = authorization_resources.tenant_id
         AND grant_row.grantee_tenant_id = current_app_tenant_id()
         AND grant_row.grantee_actor_id = current_app_actor_id()
         AND grant_row.resource_type = authorization_resources.resource_type
         AND grant_row.resource_id = authorization_resources.resource_id
         AND grant_row.status = 'active'
         AND grant_row.policy_version = current_app_policy_version()
         AND grant_row.valid_from <= clock_timestamp()
         AND grant_row.expires_at > clock_timestamp()
    )
  );
CREATE TRIGGER tenant_context_guard_authorization_resources
BEFORE INSERT OR UPDATE OR DELETE ON authorization_resources
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();
