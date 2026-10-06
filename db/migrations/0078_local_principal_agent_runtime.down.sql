DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM local_principal_agent_runtimes) THEN
    RAISE EXCEPTION 'Local Agent runtime history exists; use compatible runtime rollback';
  END IF;
END $$;
DROP TABLE IF EXISTS local_principal_agent_runtimes;
DROP FUNCTION IF EXISTS guard_local_principal_agent_runtime();
