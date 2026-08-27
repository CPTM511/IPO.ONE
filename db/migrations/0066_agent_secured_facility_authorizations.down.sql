DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM agent_secured_facility_authorizations) THEN
    RAISE EXCEPTION '0066 down migration is destructive after authorization Evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tenant_context_guard_agent_secured_facility_authorizations
  ON agent_secured_facility_authorizations;
DROP POLICY IF EXISTS tenant_isolation_agent_secured_facility_authorizations
  ON agent_secured_facility_authorizations;
ALTER TABLE agent_secured_facility_authorizations DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS agent_secured_facility_authorizations_guard
  ON agent_secured_facility_authorizations;
DROP FUNCTION IF EXISTS guard_agent_secured_facility_authorization();
DROP TABLE IF EXISTS agent_secured_facility_authorizations;
