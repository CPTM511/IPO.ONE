-- B4-H: existing governed Gateway identity only. No Actor or capability grant.
-- Approval decisions/executions remain append-only; proposal provenance stays
-- immutable and only its existing guarded transition columns may be updated.
DO $$ DECLARE runtime_role RECORD; BEGIN
 FOR runtime_role IN SELECT DISTINCT g.grantee FROM information_schema.role_table_grants g
 JOIN pg_roles r ON r.rolname=g.grantee
 WHERE g.table_schema='public' AND g.table_name='obligations' AND g.privilege_type='INSERT'
 AND g.grantee<>current_user AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit
 LOOP
  EXECUTE format('GRANT SELECT, INSERT ON approval_proposals, approval_decisions, approval_executions TO %I',runtime_role.grantee);
  EXECUTE format('GRANT UPDATE (status, version, approved_at, rejected_at, canceled_at, expired_at, superseded_at, superseded_by_proposal_id, executed_at, execution_id, updated_at) ON approval_proposals TO %I',runtime_role.grantee);
 END LOOP;
END $$;
