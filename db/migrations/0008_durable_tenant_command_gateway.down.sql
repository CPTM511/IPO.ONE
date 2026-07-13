DO $$
DECLARE
  table_name TEXT;
  gateway_tables CONSTANT TEXT[] := ARRAY[
    'authorization_resource_bindings', 'authorization_audit_events',
    'tenant_command_executions'
  ];
BEGIN
  FOREACH table_name IN ARRAY gateway_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'tenant_context_guard_' || table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation_' || table_name, table_name);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS tenant_context_guard_authorization_resources ON authorization_resources;
DROP POLICY IF EXISTS authorization_resources_participant_lock_update ON authorization_resources;
DROP POLICY IF EXISTS authorization_resources_owner_update ON authorization_resources;
DROP POLICY IF EXISTS authorization_resources_owner_insert ON authorization_resources;
DROP POLICY IF EXISTS authorization_resources_participant_select ON authorization_resources;
ALTER TABLE authorization_resources DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_grants_participant_lock_update ON access_grants;
DROP POLICY IF EXISTS actor_authorization_lock_update ON actors;

DROP TABLE IF EXISTS tenant_command_executions;
DROP TABLE IF EXISTS authorization_audit_events;
DROP TABLE IF EXISTS authorization_resource_bindings;
DROP TABLE IF EXISTS authorization_resources;

DROP TRIGGER IF EXISTS access_grants_authorization_transition_guard ON access_grants;
DROP TRIGGER IF EXISTS memberships_authorization_transition_guard ON memberships;
DROP TRIGGER IF EXISTS actors_authorization_lock ON actors;

DROP FUNCTION IF EXISTS lock_actor_authorization_transition();
DROP FUNCTION IF EXISTS protect_authorization_resource_binding_transition();
DROP FUNCTION IF EXISTS protect_authorization_resource_transition();
DROP FUNCTION IF EXISTS protect_access_grant_authorization_transition();
DROP FUNCTION IF EXISTS protect_membership_authorization_transition();

ALTER TABLE access_grants
  DROP CONSTRAINT IF EXISTS access_grants_version_check,
  DROP CONSTRAINT IF EXISTS access_grants_policy_version_check,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS policy_version;

ALTER TABLE memberships
  DROP CONSTRAINT IF EXISTS memberships_controller_fk,
  DROP CONSTRAINT IF EXISTS memberships_controller_not_self_check,
  DROP CONSTRAINT IF EXISTS memberships_tenant_actor_key,
  DROP CONSTRAINT IF EXISTS memberships_version_check,
  DROP CONSTRAINT IF EXISTS memberships_policy_version_check,
  DROP CONSTRAINT IF EXISTS memberships_client_ids_check,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS policy_version,
  DROP COLUMN IF EXISTS client_ids,
  DROP COLUMN IF EXISTS controller_actor_id;
