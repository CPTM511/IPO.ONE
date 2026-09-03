-- M3 L2 production repair: reconcile the explicitly authorized Metered Usage
-- admission capability into System Worker memberships created before M3.

ALTER TABLE memberships DISABLE TRIGGER tenant_context_guard_memberships;
ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;

UPDATE memberships
   SET capabilities = capabilities || '["worker.metered_usage.admit"]'::jsonb,
       updated_at = GREATEST(updated_at, clock_timestamp()),
       version = version + 1
 WHERE role_bundle = 'system_worker'
   AND status = 'active'
   AND NOT capabilities ? 'worker.metered_usage.admit';

ALTER TABLE memberships ENABLE TRIGGER tenant_context_guard_memberships;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
