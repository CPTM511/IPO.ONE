ALTER TABLE metered_usage_evidence DISABLE ROW LEVEL SECURITY;
ALTER TABLE metered_usage_admissions DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM metered_usage_evidence)
     OR EXISTS (SELECT 1 FROM metered_usage_admissions) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'cannot remove Metered Usage System Worker capability after Metered Usage Evidence exists';
  END IF;
END;
$$;

ALTER TABLE metered_usage_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE metered_usage_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE metered_usage_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE metered_usage_admissions FORCE ROW LEVEL SECURITY;

ALTER TABLE memberships DISABLE TRIGGER tenant_context_guard_memberships;
ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;

UPDATE memberships
   SET capabilities = capabilities - 'worker.metered_usage.admit',
       updated_at = GREATEST(updated_at, clock_timestamp()),
       version = version + 1
 WHERE role_bundle = 'system_worker'
   AND capabilities ? 'worker.metered_usage.admit';

ALTER TABLE memberships ENABLE TRIGGER tenant_context_guard_memberships;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
