-- Revert only privileges inherited by the 0071 repair. Table ownership and
-- owner privileges are unchanged; 0070 owns the pilot_cases table lifecycle.

DO $$
DECLARE
  runtime_grant RECORD;
BEGIN
  FOR runtime_grant IN
    SELECT DISTINCT grantee
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'pilot_cases'
       AND grantee <> current_user
       AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  LOOP
    EXECUTE format(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE pilot_cases FROM %I',
      runtime_grant.grantee
    );
  END LOOP;
END;
$$;
