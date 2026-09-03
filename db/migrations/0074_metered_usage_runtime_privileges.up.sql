-- M3 L2 production repair: preserve the existing least-privilege Gateway role
-- after 0073 added immutable Metered Usage tables and activated the hosted
-- synthetic Provider path. Reuse only roles already trusted to insert an
-- Obligation; do not create a role or grant mutation of immutable Evidence.

DO $$
DECLARE
  runtime_role RECORD;
BEGIN
  FOR runtime_role IN
    SELECT DISTINCT grantee
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'obligations'
       AND grantee <> current_user
       AND privilege_type = 'INSERT'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT ON TABLE metered_usage_evidence, metered_usage_admissions TO %I',
      runtime_role.grantee
    );
    EXECUTE format(
      'GRANT INSERT ON TABLE providers, spend_policies, spend_requests, mandate_reservations, mandate_releases TO %I',
      runtime_role.grantee
    );
    EXECUTE format(
      'GRANT UPDATE (status, risk_tier) ON TABLE providers TO %I',
      runtime_role.grantee
    );
    EXECUTE format(
      'GRANT UPDATE (daily_spent_minor, daily_spent_date, status, updated_at) ON TABLE spend_policies TO %I',
      runtime_role.grantee
    );
    EXECUTE format(
      'GRANT UPDATE (status, rejection_reason, updated_at) ON TABLE spend_requests TO %I',
      runtime_role.grantee
    );
    EXECUTE format(
      'GRANT UPDATE (released_minor) ON TABLE mandate_reservations TO %I',
      runtime_role.grantee
    );
  END LOOP;
END;
$$;
