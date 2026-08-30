-- PUBLIC-BETA-001: after a wallet signature has been verified by the
-- application, create only the two ordinary no-funds Human role enrollments.
-- The runtime authentication role cannot insert Actors or Memberships
-- directly; this function is the narrow, audited bridge.

CREATE FUNCTION provision_public_beta_human_wallet_identity(
  tenant_id_value TEXT,
  system_actor_id_value TEXT,
  actor_id_value TEXT,
  actor_hash_value TEXT,
  membership_id_value TEXT,
  membership_hash_value TEXT,
  credential_id_value TEXT,
  human_enrollment_id_value TEXT,
  principal_enrollment_id_value TEXT,
  issuer_value TEXT,
  subject_ref_hash_value TEXT,
  reference_hash_key_version_value TEXT,
  client_id_value TEXT,
  sender_constraint_ref_hash_value TEXT,
  policy_version_value TEXT,
  human_capabilities_value JSONB,
  principal_capabilities_value JSONB,
  occurred_at_value TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_human_capabilities CONSTANT JSONB :=
    '["human_subject.create.self","subject.read.self","workspace.resume.self","consent.create.self","consent.read.self","consent.revoke.self","identity_reference.read.self","credit.request","credit.read.self","credit.evaluate.self","credit.offer.accept.self","credit.execute.sandbox.self","repayment.post.sandbox.self","obligation.read.owned","evidence.read.owned","credit_registry.evidence.read.tenant","credit_passport.create.self","credit_passport.read.self","credit_passport.verify.bound","credit_passport.revoke.self","official_report.create.owned","official_report.read.owned","official_report.retrieve.owned","official_report.revoke.owned","pilot.feedback.submit.self","pilot.case.file.self","pilot.case.read.self"]'::jsonb;
  expected_principal_capabilities CONSTANT JSONB :=
    '["agent.create","agent.manage.owned","workspace.resume.self","agent_account.challenge.create.owned","agent_account.binding.read.self","integration.read.owned","mandate.draft.create","mandate.draft.revoke","mandate.activate.owned","agent.facility_authorization.create.owned","agent.facility_authorization.read.bound","agent.facility_authorization.revoke.owned","obligation.read.owned","evidence.read.owned","credit_registry.evidence.read.tenant","credit_passport.create.self","credit_passport.read.self","credit_passport.verify.bound","credit_passport.revoke.self","official_report.create.owned","official_report.read.owned","official_report.retrieve.owned","official_report.revoke.owned"]'::jsonb;
  existing_credential RECORD;
  stored_actor RECORD;
  stored_membership RECORD;
  stored_enrollment RECORD;
  login_role RECORD;
BEGIN
  SELECT rolsuper, rolbypassrls
    INTO login_role
    FROM pg_roles
   WHERE rolname = session_user;

  IF login_role IS NULL
     OR login_role.rolsuper
     OR login_role.rolbypassrls
     OR NOT has_table_privilege(
       session_user,
       'public.authentication_credentials',
       'INSERT'
     )
     OR has_table_privilege(session_user, 'public.actors', 'INSERT')
     OR has_table_privilege(session_user, 'public.memberships', 'INSERT') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'public Beta wallet provisioning requires the authentication-only runtime role';
  END IF;

  IF current_app_tenant_id() IS DISTINCT FROM tenant_id_value
     OR current_app_actor_id() IS DISTINCT FROM system_actor_id_value
     OR current_app_policy_version() IS DISTINCT FROM policy_version_value
     OR actor_id_value !~ '^actor_public_beta_[0-9a-f]{32}$'
     OR actor_hash_value !~ '^0x[0-9a-f]{64}$'
     OR membership_id_value !~ '^membership_actor_public_beta_[0-9a-f]{32}$'
     OR membership_hash_value !~ '^0x[0-9a-f]{64}$'
     OR credential_id_value !~ '^credential_[0-9a-f-]{36}$'
     OR human_enrollment_id_value !~ '^role_enrollment_[0-9a-f-]{36}$'
     OR principal_enrollment_id_value !~ '^role_enrollment_[0-9a-f-]{36}$'
     OR issuer_value !~ '^https://[^/?#[:space:]]+(?::[0-9]{1,5})?$'
     OR subject_ref_hash_value !~ '^[A-Za-z0-9_-]{43}$'
     OR reference_hash_key_version_value <> 'v2'
     OR client_id_value !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$'
     OR sender_constraint_ref_hash_value !~ '^[A-Za-z0-9_-]{43}$'
     OR policy_version_value !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$'
     OR human_capabilities_value IS DISTINCT FROM expected_human_capabilities
     OR principal_capabilities_value IS DISTINCT FROM expected_principal_capabilities
     OR occurred_at_value IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'public Beta wallet provisioning input is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.tenants AS tenant
      JOIN public.actors AS actor
        ON actor.id = system_actor_id_value
      JOIN public.memberships AS membership
        ON membership.tenant_id = tenant.id
       AND membership.actor_id = actor.id
     WHERE tenant.id = tenant_id_value
       AND tenant.status = 'active'
       AND actor.actor_type = 'system_worker'
       AND actor.status = 'active'
       AND membership.status = 'active'
       AND membership.role_bundle = 'system_worker'
       AND membership.policy_version = policy_version_value
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'public Beta wallet provisioning system boundary is unavailable';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('public_beta_wallet_provision'),
    hashtext(tenant_id_value || ':' || subject_ref_hash_value)
  );

  SELECT *
    INTO existing_credential
    FROM public.authentication_credentials
   WHERE tenant_id = tenant_id_value
     AND issuer = issuer_value
     AND client_id = client_id_value
     AND subject_ref_hash = subject_ref_hash_value
   FOR UPDATE;

  IF existing_credential IS NOT NULL
     AND (
       existing_credential.actor_id IS DISTINCT FROM actor_id_value
       OR existing_credential.actor_type <> 'human'
       OR existing_credential.client_authentication_method <> 'siwe'
       OR existing_credential.sender_constraint_method <> 'host_session'
       OR existing_credential.policy_version IS DISTINCT FROM policy_version_value
       OR existing_credential.reference_hash_key_version <> 'v2'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'public Beta wallet identity conflicts with an existing binding';
  END IF;

  INSERT INTO public.actors(
    id, actor_hash, actor_type, external_subject_hash, status,
    created_at, updated_at, schema_version
  ) VALUES (
    actor_id_value, actor_hash_value, 'human', NULL, 'active',
    occurred_at_value, occurred_at_value, 'actor.v1'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT id, actor_hash, actor_type, status
    INTO stored_actor
    FROM public.actors
   WHERE id = actor_id_value;
  IF stored_actor IS NULL
     OR stored_actor.actor_hash IS DISTINCT FROM actor_hash_value
     OR stored_actor.actor_type <> 'human'
     OR stored_actor.status <> 'active' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'public Beta Actor binding is invalid';
  END IF;

  INSERT INTO public.memberships(
    id, membership_hash, tenant_id, actor_id, role_bundle, capabilities,
    client_ids, policy_version, controller_actor_id, status, valid_from,
    expires_at, created_at, updated_at, version, schema_version
  ) VALUES (
    membership_id_value, membership_hash_value, tenant_id_value,
    actor_id_value, 'human_borrower', human_capabilities_value,
    jsonb_build_array(client_id_value), policy_version_value, NULL, 'active',
    occurred_at_value, NULL, occurred_at_value, occurred_at_value, 1,
    'membership.v1'
  ) ON CONFLICT (tenant_id, actor_id) DO NOTHING;

  SELECT *
    INTO stored_membership
    FROM public.memberships
   WHERE tenant_id = tenant_id_value
     AND actor_id = actor_id_value;
  IF stored_membership IS NULL
     OR stored_membership.id IS DISTINCT FROM membership_id_value
     OR stored_membership.membership_hash IS DISTINCT FROM membership_hash_value
     OR stored_membership.role_bundle <> 'human_borrower'
     OR stored_membership.capabilities IS DISTINCT FROM human_capabilities_value
     OR stored_membership.client_ids IS DISTINCT FROM jsonb_build_array(client_id_value)
     OR stored_membership.policy_version IS DISTINCT FROM policy_version_value
     OR stored_membership.controller_actor_id IS NOT NULL
     OR stored_membership.status <> 'active' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'public Beta Membership binding is invalid';
  END IF;

  IF existing_credential IS NULL THEN
    INSERT INTO public.authentication_credentials(
      id, tenant_id, actor_id, actor_type, issuer, subject_ref_hash,
      client_id, client_authentication_method, sender_constraint_method,
      sender_constraint_ref_hash, roles, allowed_capabilities,
      policy_version, status, version, expires_at, created_at, updated_at,
      schema_version, reference_hash_key_version
    ) VALUES (
      credential_id_value, tenant_id_value, actor_id_value, 'human',
      issuer_value, subject_ref_hash_value, client_id_value, 'siwe',
      'host_session', sender_constraint_ref_hash_value,
      '["human_borrower"]'::jsonb, human_capabilities_value,
      policy_version_value, 'active', 1, NULL, occurred_at_value,
      occurred_at_value, 'authentication_credential.v1', 'v2'
    );

    INSERT INTO public.authentication_events(
      id, tenant_id, event_type, actor_id, credential_id, reason_code,
      occurred_at, payload, schema_version
    ) VALUES (
      'auth_event_' || gen_random_uuid(), tenant_id_value,
      'credential_registered', system_actor_id_value, credential_id_value,
      'public_beta_verified_wallet_self_provisioned', occurred_at_value,
      jsonb_build_object(
        'actorType', 'human',
        'clientAuthenticationMethod', 'siwe',
        'senderConstraintMethod', 'host_session',
        'referenceHashKeyVersion', 'v2',
        'version', 1
      ),
      'authentication_event.v1'
    );
    existing_credential.id := credential_id_value;
  END IF;

  INSERT INTO public.authentication_role_enrollments(
    id, tenant_id, actor_id, credential_id, role_bundle, capabilities,
    client_ids, policy_version, status, valid_from, expires_at, version,
    created_at, updated_at, schema_version
  ) VALUES
  (
    human_enrollment_id_value, tenant_id_value, actor_id_value,
    existing_credential.id, 'human_borrower', human_capabilities_value,
    jsonb_build_array(client_id_value), policy_version_value, 'active',
    occurred_at_value, NULL, 1, occurred_at_value, occurred_at_value,
    'authentication_role_enrollment.v1'
  ),
  (
    principal_enrollment_id_value, tenant_id_value, actor_id_value,
    existing_credential.id, 'principal_controller', principal_capabilities_value,
    jsonb_build_array(client_id_value), policy_version_value, 'active',
    occurred_at_value, NULL, 1, occurred_at_value, occurred_at_value,
    'authentication_role_enrollment.v1'
  )
  ON CONFLICT (tenant_id, credential_id, role_bundle) DO NOTHING;

  FOR stored_enrollment IN
    SELECT role_bundle, capabilities, client_ids, policy_version, status
      FROM public.authentication_role_enrollments
     WHERE tenant_id = tenant_id_value
       AND credential_id = existing_credential.id
       AND role_bundle IN ('human_borrower', 'principal_controller')
     ORDER BY role_bundle
  LOOP
    IF stored_enrollment.status <> 'active'
       OR stored_enrollment.client_ids IS DISTINCT FROM jsonb_build_array(client_id_value)
       OR stored_enrollment.policy_version IS DISTINCT FROM policy_version_value
       OR (
         stored_enrollment.role_bundle = 'human_borrower'
         AND stored_enrollment.capabilities IS DISTINCT FROM human_capabilities_value
       )
       OR (
         stored_enrollment.role_bundle = 'principal_controller'
         AND stored_enrollment.capabilities IS DISTINCT FROM principal_capabilities_value
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'public Beta role enrollment is invalid';
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
      FROM public.authentication_role_enrollments
     WHERE tenant_id = tenant_id_value
       AND credential_id = existing_credential.id
       AND role_bundle IN ('human_borrower', 'principal_controller')
       AND status = 'active'
  ) <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'public Beta ordinary role enrollment is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.authentication_role_enrollments
     WHERE tenant_id = tenant_id_value
       AND credential_id = existing_credential.id
       AND role_bundle NOT IN ('human_borrower', 'principal_controller')
       AND status = 'active'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'public Beta wallet identity cannot hold a privileged role enrollment';
  END IF;

  RETURN existing_credential.id;
END;
$$;

COMMENT ON FUNCTION provision_public_beta_human_wallet_identity(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ
) IS
  'PUBLIC-BETA-001: verified-wallet-only, ordinary-role-only no-funds identity provisioning';
