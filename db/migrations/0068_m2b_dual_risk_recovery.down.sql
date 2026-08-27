DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM agent_dual_risk_incidents)
     OR EXISTS (SELECT 1 FROM agent_dual_risk_incident_transitions) THEN
    RAISE EXCEPTION '0068 down migration is destructive after dual-risk recovery Evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tenant_context_guard_agent_dual_risk_incident_transitions
  ON agent_dual_risk_incident_transitions;
DROP TRIGGER IF EXISTS tenant_context_guard_agent_dual_risk_incidents
  ON agent_dual_risk_incidents;
DROP POLICY IF EXISTS tenant_isolation_agent_dual_risk_incident_transitions
  ON agent_dual_risk_incident_transitions;
DROP POLICY IF EXISTS tenant_isolation_agent_dual_risk_incidents
  ON agent_dual_risk_incidents;
ALTER TABLE agent_dual_risk_incident_transitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_dual_risk_incidents DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS agent_dual_risk_incident_transitions_immutable_guard
  ON agent_dual_risk_incident_transitions;
DROP TRIGGER IF EXISTS agent_dual_risk_incidents_immutable_guard
  ON agent_dual_risk_incidents;
DROP TABLE IF EXISTS agent_dual_risk_incident_transitions;
DROP TABLE IF EXISTS agent_dual_risk_incidents;
DROP FUNCTION IF EXISTS guard_immutable_agent_dual_risk_incident();
