DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM authentication_session_invalidations) THEN
    RAISE EXCEPTION 'cannot roll back wallet session invalidation while durable records exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS authentication_session_invalidations_session_idx;

DROP TRIGGER IF EXISTS tenant_context_guard_authentication_session_invalidations
  ON authentication_session_invalidations;
DROP POLICY IF EXISTS tenant_isolation_authentication_session_invalidations
  ON authentication_session_invalidations;
ALTER TABLE authentication_session_invalidations DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS authentication_session_invalidations_projection_guard
  ON authentication_session_invalidations;
DROP FUNCTION IF EXISTS guard_authentication_session_invalidation();

DROP TABLE IF EXISTS authentication_session_invalidations;
