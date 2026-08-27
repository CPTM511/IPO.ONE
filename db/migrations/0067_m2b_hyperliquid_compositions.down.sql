DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM agent_hyperliquid_compositions)
     OR EXISTS (SELECT 1 FROM agent_hyperliquid_composition_transitions) THEN
    RAISE EXCEPTION '0067 down migration is destructive after M2B composition Evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tenant_context_guard_agent_hyperliquid_composition_transitions
  ON agent_hyperliquid_composition_transitions;
DROP TRIGGER IF EXISTS tenant_context_guard_agent_hyperliquid_compositions
  ON agent_hyperliquid_compositions;
DROP POLICY IF EXISTS tenant_isolation_agent_hyperliquid_composition_transitions
  ON agent_hyperliquid_composition_transitions;
DROP POLICY IF EXISTS tenant_isolation_agent_hyperliquid_compositions
  ON agent_hyperliquid_compositions;
ALTER TABLE agent_hyperliquid_composition_transitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_hyperliquid_compositions DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS agent_hyperliquid_composition_transitions_immutable_guard
  ON agent_hyperliquid_composition_transitions;
DROP TRIGGER IF EXISTS agent_hyperliquid_compositions_immutable_guard
  ON agent_hyperliquid_compositions;
DROP TABLE IF EXISTS agent_hyperliquid_composition_transitions;
DROP TABLE IF EXISTS agent_hyperliquid_compositions;
DROP FUNCTION IF EXISTS guard_immutable_agent_hyperliquid_composition();
