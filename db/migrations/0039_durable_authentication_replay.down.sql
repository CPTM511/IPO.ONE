DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM authentication_replay_entries) THEN
    RAISE EXCEPTION
      'cannot roll back durable authentication replay protection while replay entries exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS authentication_replay_entries_expiry_idx;
DROP TRIGGER IF EXISTS tenant_context_guard_authentication_replay_entries
  ON authentication_replay_entries;
DROP POLICY IF EXISTS tenant_isolation_authentication_replay_entries
  ON authentication_replay_entries;
ALTER TABLE authentication_replay_entries DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS authentication_replay_entries_guard
  ON authentication_replay_entries;
DROP FUNCTION IF EXISTS guard_authentication_replay_entry();
DROP TABLE IF EXISTS authentication_replay_entries;
