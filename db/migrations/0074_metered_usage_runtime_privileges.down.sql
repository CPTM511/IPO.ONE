-- Revert only the hosted Metered Usage runtime privileges introduced by 0074.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM metered_usage_admissions)
     OR EXISTS (SELECT 1 FROM metered_usage_evidence) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'cannot roll back Metered Usage runtime privileges while records exist';
  END IF;
END;
$$;

DO $$
DECLARE
  runtime_role RECORD;
BEGIN
  FOR runtime_role IN
    SELECT DISTINCT grantee
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'metered_usage_evidence'
       AND grantee <> current_user
       AND privilege_type = 'INSERT'
  LOOP
    EXECUTE format(
      'REVOKE SELECT, INSERT ON TABLE metered_usage_evidence, metered_usage_admissions FROM %I',
      runtime_role.grantee
    );
    EXECUTE format(
      'REVOKE INSERT ON TABLE providers, spend_policies, spend_requests, mandate_reservations, mandate_releases FROM %I',
      runtime_role.grantee
    );
    EXECUTE format(
      'REVOKE UPDATE (status, risk_tier) ON TABLE providers FROM %I',
      runtime_role.grantee
    );
    EXECUTE format(
      'REVOKE UPDATE (daily_spent_minor, daily_spent_date, status, updated_at) ON TABLE spend_policies FROM %I',
      runtime_role.grantee
    );
    EXECUTE format(
      'REVOKE UPDATE (status, rejection_reason, updated_at) ON TABLE spend_requests FROM %I',
      runtime_role.grantee
    );
    EXECUTE format(
      'REVOKE UPDATE (released_minor) ON TABLE mandate_reservations FROM %I',
      runtime_role.grantee
    );
  END LOOP;
END;
$$;
