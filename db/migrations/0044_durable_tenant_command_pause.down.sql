DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenant_command_pauses) THEN
    RAISE EXCEPTION
      'cannot roll back durable Tenant command pauses while records exist';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tenant_context_guard_tenant_command_pauses
  ON tenant_command_pauses;
DROP POLICY IF EXISTS tenant_isolation_tenant_command_pauses
  ON tenant_command_pauses;
ALTER TABLE tenant_command_pauses DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS tenant_command_pauses_immutable_guard
  ON tenant_command_pauses;
DROP TABLE IF EXISTS tenant_command_pauses;
