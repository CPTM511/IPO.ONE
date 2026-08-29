-- PILOT-008B deployment repair: additive migrations must preserve the
-- least-privilege runtime role posture without requiring credential rotation.
-- Copy only the CRUD privileges already reviewed for the analogous
-- pilot_feedback_records table, and never grant a privilege to a new role.

DO $$
DECLARE
  runtime_grant RECORD;
BEGIN
  FOR runtime_grant IN
    SELECT grantee, privilege_type
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'pilot_feedback_records'
       AND grantee <> current_user
       AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  LOOP
    EXECUTE format(
      'GRANT %s ON TABLE pilot_cases TO %I',
      runtime_grant.privilege_type,
      runtime_grant.grantee
    );
  END LOOP;
END;
$$;
