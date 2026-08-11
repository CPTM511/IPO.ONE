CREATE TABLE execution_target_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  policy_hash TEXT NOT NULL CHECK (policy_hash ~ '^0x[0-9a-f]{64}$'),
  provider_id TEXT NOT NULL,
  chain_id TEXT NOT NULL CHECK (chain_id IN ('eip155:84532', 'eip155:1952')),
  target_address TEXT NOT NULL CHECK (target_address ~ '^0x[0-9a-f]{40}$'),
  code_hash TEXT NOT NULL CHECK (code_hash ~ '^0x[0-9a-f]{64}$'),
  proxy_implementation_hash TEXT CHECK (
    proxy_implementation_hash IS NULL OR proxy_implementation_hash ~ '^0x[0-9a-f]{64}$'
  ),
  allowed_function_selectors JSONB NOT NULL CHECK (
    jsonb_typeof(allowed_function_selectors) = 'array'
    AND jsonb_array_length(allowed_function_selectors) BETWEEN 1 AND 64
  ),
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > valid_from),
  policy JSONB NOT NULL,
  version BIGINT NOT NULL CHECK (version = 1),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  transactions_allowed BOOLEAN NOT NULL CHECK (transactions_allowed = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  created_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'execution_target_policy.v1'),
  CONSTRAINT execution_target_policies_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT execution_target_policies_tenant_hash_key UNIQUE (tenant_id, policy_hash),
  CONSTRAINT execution_target_policies_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id),
  CONSTRAINT execution_target_policies_identity_check CHECK (
    policy->>'targetPolicyId' = id
    AND policy->>'policyHash' = policy_hash
    AND policy->>'providerId' = provider_id
    AND policy->>'chainId' = chain_id
    AND policy->>'targetAddress' = target_address
    AND policy->>'codeHash' = code_hash
    AND policy->'allowedFunctionSelectors' = allowed_function_selectors
    AND (policy->>'version')::BIGINT = version
    AND (policy->>'sandboxOnly')::BOOLEAN = sandbox_only
    AND (policy->>'transactionsAllowed')::BOOLEAN = transactions_allowed
    AND (policy->>'productionAuthority')::BOOLEAN = production_authority
    AND (policy->>'fundsAuthority')::BOOLEAN = funds_authority
    AND policy->>'schemaVersion' = schema_version
  )
);

CREATE TABLE delegated_wallet_grants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  grant_hash TEXT NOT NULL CHECK (grant_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  account_binding_id TEXT NOT NULL,
  execution_domain TEXT NOT NULL CHECK (execution_domain = 'evm'),
  adapter_id TEXT NOT NULL CHECK (adapter_id = 'local_sandbox'),
  mandate_id TEXT NOT NULL,
  mandate_hash TEXT NOT NULL CHECK (mandate_hash ~ '^0x[0-9a-f]{64}$'),
  spend_policy_id TEXT NOT NULL,
  spend_policy_hash TEXT NOT NULL CHECK (spend_policy_hash ~ '^0x[0-9a-f]{64}$'),
  credit_line_id TEXT NOT NULL,
  credit_line_hash TEXT NOT NULL CHECK (credit_line_hash ~ '^0x[0-9a-f]{64}$'),
  obligation_id TEXT NOT NULL,
  obligation_hash TEXT NOT NULL CHECK (obligation_hash ~ '^0x[0-9a-f]{64}$'),
  authorization_decision_id TEXT NOT NULL,
  authorization_hash TEXT NOT NULL CHECK (authorization_hash ~ '^0x[0-9a-f]{64}$'),
  session_signer_ref_hash TEXT NOT NULL CHECK (session_signer_ref_hash ~ '^0x[0-9a-f]{64}$'),
  provider_id TEXT NOT NULL,
  chain_ids JSONB NOT NULL CHECK (
    jsonb_typeof(chain_ids) = 'array' AND jsonb_array_length(chain_ids) BETWEEN 1 AND 2
  ),
  asset_ids JSONB NOT NULL CHECK (
    jsonb_typeof(asset_ids) = 'array' AND jsonb_array_length(asset_ids) BETWEEN 1 AND 16
  ),
  per_tx_limit_minor NUMERIC(78,0) NOT NULL CHECK (per_tx_limit_minor > 0),
  rolling_24h_limit_minor NUMERIC(78,0) NOT NULL CHECK (rolling_24h_limit_minor > 0),
  aggregate_limit_minor NUMERIC(78,0) NOT NULL CHECK (aggregate_limit_minor > 0),
  obligation_limit_minor NUMERIC(78,0) NOT NULL CHECK (obligation_limit_minor > 0),
  pending_exposure_minor NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (pending_exposure_minor >= 0),
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > valid_from),
  session_epoch BIGINT NOT NULL CHECK (session_epoch >= 0),
  nonce TEXT NOT NULL,
  external_permission_ref_hash TEXT CHECK (
    external_permission_ref_hash IS NULL OR external_permission_ref_hash ~ '^0x[0-9a-f]{64}$'
  ),
  external_policy_hash TEXT CHECK (
    external_policy_hash IS NULL OR external_policy_hash ~ '^0x[0-9a-f]{64}$'
  ),
  status TEXT NOT NULL CHECK (status IN ('prepared', 'active', 'revoked', 'expired', 'quarantined')),
  grant_record JSONB NOT NULL,
  version BIGINT NOT NULL CHECK (version >= 1),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  transactions_allowed BOOLEAN NOT NULL CHECK (transactions_allowed = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'delegated_wallet_grant.v1'),
  CONSTRAINT delegated_wallet_grants_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT delegated_wallet_grants_tenant_hash_key UNIQUE (tenant_id, grant_hash),
  CONSTRAINT delegated_wallet_grants_tenant_nonce_key UNIQUE (tenant_id, principal_id, nonce),
  CONSTRAINT delegated_wallet_grants_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT delegated_wallet_grants_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT delegated_wallet_grants_account_binding_fk
    FOREIGN KEY (tenant_id, account_binding_id) REFERENCES account_bindings(tenant_id, id),
  CONSTRAINT delegated_wallet_grants_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id),
  CONSTRAINT delegated_wallet_grants_spend_policy_fk
    FOREIGN KEY (tenant_id, spend_policy_id) REFERENCES spend_policies(tenant_id, id),
  CONSTRAINT delegated_wallet_grants_credit_line_fk
    FOREIGN KEY (tenant_id, credit_line_id) REFERENCES credit_lines(tenant_id, id),
  CONSTRAINT delegated_wallet_grants_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  CONSTRAINT delegated_wallet_grants_provider_fk
    FOREIGN KEY (tenant_id, provider_id) REFERENCES providers(tenant_id, id),
  CONSTRAINT delegated_wallet_grants_limits_check CHECK (
    per_tx_limit_minor <= rolling_24h_limit_minor
    AND rolling_24h_limit_minor <= aggregate_limit_minor
    AND pending_exposure_minor <= aggregate_limit_minor
    AND (status NOT IN ('revoked', 'expired', 'quarantined') OR pending_exposure_minor = 0)
  ),
  CONSTRAINT delegated_wallet_grants_status_projection_check CHECK (
    (status = 'prepared' AND external_permission_ref_hash IS NULL AND external_policy_hash IS NULL)
    OR (status <> 'prepared' AND (
      status <> 'active' OR (external_permission_ref_hash IS NOT NULL AND external_policy_hash IS NOT NULL)
    ))
  ),
  CONSTRAINT delegated_wallet_grants_record_check CHECK (
    grant_record->>'grantId' = id
    AND grant_record->>'grantHash' = grant_hash
    AND grant_record->>'subjectId' = subject_id
    AND grant_record->>'principalId' = principal_id
    AND grant_record->>'accountBindingId' = account_binding_id
    AND grant_record->>'mandateId' = mandate_id
    AND grant_record->>'spendPolicyId' = spend_policy_id
    AND grant_record->>'creditLineId' = credit_line_id
    AND grant_record->>'obligationId' = obligation_id
    AND grant_record->>'providerId' = provider_id
    AND (grant_record->>'sessionEpoch')::BIGINT = session_epoch
    AND grant_record->>'status' = status
    AND (grant_record->>'pendingExposureMinor')::NUMERIC = pending_exposure_minor
    AND (grant_record->>'version')::BIGINT = version
    AND (grant_record->>'sandboxOnly')::BOOLEAN = sandbox_only
    AND (grant_record->>'transactionsAllowed')::BOOLEAN = transactions_allowed
    AND (grant_record->>'productionAuthority')::BOOLEAN = production_authority
    AND (grant_record->>'fundsAuthority')::BOOLEAN = funds_authority
    AND grant_record->>'schemaVersion' = schema_version
  )
);

CREATE TABLE delegated_wallet_grant_target_policies (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  grant_id TEXT NOT NULL,
  target_policy_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, grant_id, target_policy_id),
  CONSTRAINT delegated_wallet_grant_targets_grant_fk
    FOREIGN KEY (tenant_id, grant_id) REFERENCES delegated_wallet_grants(tenant_id, id),
  CONSTRAINT delegated_wallet_grant_targets_policy_fk
    FOREIGN KEY (tenant_id, target_policy_id) REFERENCES execution_target_policies(tenant_id, id)
);

CREATE TABLE delegated_wallet_grant_transitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  grant_id TEXT NOT NULL,
  transition_hash TEXT NOT NULL CHECK (transition_hash ~ '^0x[0-9a-f]{64}$'),
  event_id TEXT NOT NULL,
  previous_status TEXT CHECK (
    previous_status IS NULL
    OR previous_status IN ('prepared', 'active', 'revoked', 'expired', 'quarantined')
  ),
  next_status TEXT NOT NULL CHECK (next_status IN ('prepared', 'active', 'revoked', 'expired', 'quarantined')),
  reason_code TEXT NOT NULL,
  authorization_decision_id TEXT NOT NULL,
  authorization_hash TEXT NOT NULL CHECK (authorization_hash ~ '^0x[0-9a-f]{64}$'),
  occurred_at TIMESTAMPTZ NOT NULL,
  transition JSONB NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'delegated_wallet_grant_transition.v1'),
  CONSTRAINT delegated_wallet_grant_transitions_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT delegated_wallet_grant_transitions_tenant_hash_key UNIQUE (tenant_id, transition_hash),
  CONSTRAINT delegated_wallet_grant_transitions_version_key UNIQUE (tenant_id, grant_id, next_status, occurred_at),
  CONSTRAINT delegated_wallet_grant_transitions_grant_fk
    FOREIGN KEY (tenant_id, grant_id) REFERENCES delegated_wallet_grants(tenant_id, id),
  CONSTRAINT delegated_wallet_grant_transitions_event_fk
    FOREIGN KEY (tenant_id, event_id) REFERENCES domain_events(tenant_id, id)
);

CREATE TABLE delegated_wallet_pending_exposures (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  reservation_hash TEXT NOT NULL CHECK (reservation_hash ~ '^0x[0-9a-f]{64}$'),
  grant_id TEXT NOT NULL,
  target_policy_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  release_event_id TEXT,
  asset_id TEXT NOT NULL,
  amount_minor NUMERIC(78,0) NOT NULL CHECK (amount_minor > 0),
  session_epoch BIGINT NOT NULL CHECK (session_epoch >= 0),
  idempotency_key_hash TEXT NOT NULL CHECK (idempotency_key_hash ~ '^0x[0-9a-f]{64}$'),
  reserved_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > reserved_at),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'released', 'expired', 'quarantined')),
  released_at TIMESTAMPTZ,
  release_reason_code TEXT,
  reservation JSONB NOT NULL,
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  transactions_allowed BOOLEAN NOT NULL CHECK (transactions_allowed = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'pending_exposure_reservation.v1'),
  CONSTRAINT delegated_wallet_pending_exposures_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT delegated_wallet_pending_exposures_tenant_hash_key UNIQUE (tenant_id, reservation_hash),
  CONSTRAINT delegated_wallet_pending_exposures_idempotency_key UNIQUE (tenant_id, idempotency_key_hash),
  CONSTRAINT delegated_wallet_pending_exposures_grant_fk
    FOREIGN KEY (tenant_id, grant_id) REFERENCES delegated_wallet_grants(tenant_id, id),
  CONSTRAINT delegated_wallet_pending_exposures_policy_fk
    FOREIGN KEY (tenant_id, target_policy_id) REFERENCES execution_target_policies(tenant_id, id),
  CONSTRAINT delegated_wallet_pending_exposures_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  CONSTRAINT delegated_wallet_pending_exposures_event_fk
    FOREIGN KEY (tenant_id, event_id) REFERENCES domain_events(tenant_id, id),
  CONSTRAINT delegated_wallet_pending_exposures_release_event_fk
    FOREIGN KEY (tenant_id, release_event_id) REFERENCES domain_events(tenant_id, id),
  CONSTRAINT delegated_wallet_pending_exposures_state_check CHECK (
    (
      status = 'reserved'
      AND released_at IS NULL
      AND release_reason_code IS NULL
      AND release_event_id IS NULL
    )
    OR (
      status <> 'reserved'
      AND released_at IS NOT NULL
      AND release_reason_code IS NOT NULL
      AND release_event_id IS NOT NULL
    )
  ),
  CONSTRAINT delegated_wallet_pending_exposures_record_check CHECK (
    reservation->>'reservationId' = id
    AND reservation->>'reservationHash' = reservation_hash
    AND reservation->>'grantId' = grant_id
    AND reservation->>'targetPolicyId' = target_policy_id
    AND reservation->>'obligationId' = obligation_id
    AND reservation->>'assetId' = asset_id
    AND (reservation->>'amountMinor')::NUMERIC = amount_minor
    AND (reservation->>'sessionEpoch')::BIGINT = session_epoch
    AND reservation->>'status' = status
    AND (reservation->>'sandboxOnly')::BOOLEAN = sandbox_only
    AND (reservation->>'transactionsAllowed')::BOOLEAN = transactions_allowed
    AND (reservation->>'productionAuthority')::BOOLEAN = production_authority
    AND (reservation->>'fundsAuthority')::BOOLEAN = funds_authority
    AND reservation->>'schemaVersion' = schema_version
  )
);

CREATE FUNCTION guard_immutable_agentic_execution_record()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'agentic execution record is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_delegated_wallet_grant()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'delegated wallet grants cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.grant_hash, NEW.subject_id, NEW.principal_id,
    NEW.account_binding_id, NEW.execution_domain, NEW.adapter_id, NEW.mandate_id,
    NEW.mandate_hash, NEW.spend_policy_id, NEW.spend_policy_hash, NEW.credit_line_id,
    NEW.credit_line_hash, NEW.obligation_id, NEW.obligation_hash,
    NEW.authorization_decision_id, NEW.authorization_hash, NEW.session_signer_ref_hash,
    NEW.provider_id, NEW.chain_ids, NEW.asset_ids, NEW.per_tx_limit_minor,
    NEW.rolling_24h_limit_minor, NEW.aggregate_limit_minor, NEW.obligation_limit_minor,
    NEW.valid_from, NEW.expires_at, NEW.session_epoch, NEW.nonce, NEW.sandbox_only,
    NEW.transactions_allowed, NEW.production_authority, NEW.funds_authority,
    NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.grant_hash, OLD.subject_id, OLD.principal_id,
    OLD.account_binding_id, OLD.execution_domain, OLD.adapter_id, OLD.mandate_id,
    OLD.mandate_hash, OLD.spend_policy_id, OLD.spend_policy_hash, OLD.credit_line_id,
    OLD.credit_line_hash, OLD.obligation_id, OLD.obligation_hash,
    OLD.authorization_decision_id, OLD.authorization_hash, OLD.session_signer_ref_hash,
    OLD.provider_id, OLD.chain_ids, OLD.asset_ids, OLD.per_tx_limit_minor,
    OLD.rolling_24h_limit_minor, OLD.aggregate_limit_minor, OLD.obligation_limit_minor,
    OLD.valid_from, OLD.expires_at, OLD.session_epoch, OLD.nonce, OLD.sandbox_only,
    OLD.transactions_allowed, OLD.production_authority, OLD.funds_authority,
    OLD.created_at, OLD.schema_version
  ) OR NEW.version <> OLD.version + 1 OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'delegated wallet grant identity or version is invalid';
  END IF;
  IF OLD.status IN ('revoked', 'expired', 'quarantined') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal delegated wallet grant is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'prepared' AND NEW.status IN ('active', 'revoked', 'expired', 'quarantined')
    OR OLD.status = 'active' AND NEW.status IN ('revoked', 'expired', 'quarantined')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'delegated wallet grant status transition is invalid';
  END IF;
  IF NEW.status = OLD.status AND ROW(
    NEW.external_permission_ref_hash, NEW.external_policy_hash
  ) IS DISTINCT FROM ROW(
    OLD.external_permission_ref_hash, OLD.external_policy_hash
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'delegated wallet permission hashes cannot change in place';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_delegated_wallet_pending_exposure()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'pending exposure records cannot be deleted';
  END IF;
  IF OLD.status <> 'reserved' OR NEW.status NOT IN ('released', 'expired', 'quarantined') OR ROW(
    NEW.tenant_id, NEW.id, NEW.reservation_hash, NEW.grant_id, NEW.target_policy_id,
    NEW.obligation_id, NEW.event_id, NEW.asset_id, NEW.amount_minor, NEW.session_epoch,
    NEW.idempotency_key_hash, NEW.reserved_at, NEW.expires_at, NEW.sandbox_only,
    NEW.transactions_allowed, NEW.production_authority, NEW.funds_authority, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.reservation_hash, OLD.grant_id, OLD.target_policy_id,
    OLD.obligation_id, OLD.event_id, OLD.asset_id, OLD.amount_minor, OLD.session_epoch,
    OLD.idempotency_key_hash, OLD.reserved_at, OLD.expires_at, OLD.sandbox_only,
    OLD.transactions_allowed, OLD.production_authority, OLD.funds_authority, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'pending exposure transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_target_policies_immutable_guard
BEFORE UPDATE OR DELETE ON execution_target_policies
FOR EACH ROW EXECUTE FUNCTION guard_immutable_agentic_execution_record();
CREATE TRIGGER delegated_wallet_grant_targets_immutable_guard
BEFORE UPDATE OR DELETE ON delegated_wallet_grant_target_policies
FOR EACH ROW EXECUTE FUNCTION guard_immutable_agentic_execution_record();
CREATE TRIGGER delegated_wallet_grant_transitions_immutable_guard
BEFORE UPDATE OR DELETE ON delegated_wallet_grant_transitions
FOR EACH ROW EXECUTE FUNCTION guard_immutable_agentic_execution_record();
CREATE TRIGGER delegated_wallet_grants_transition_guard
BEFORE UPDATE OR DELETE ON delegated_wallet_grants
FOR EACH ROW EXECUTE FUNCTION guard_delegated_wallet_grant();
CREATE TRIGGER delegated_wallet_pending_exposures_transition_guard
BEFORE UPDATE OR DELETE ON delegated_wallet_pending_exposures
FOR EACH ROW EXECUTE FUNCTION guard_delegated_wallet_pending_exposure();

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'execution_target_policies',
    'delegated_wallet_grants',
    'delegated_wallet_grant_target_policies',
    'delegated_wallet_grant_transitions',
    'delegated_wallet_pending_exposures'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_app_tenant_id()) WITH CHECK (tenant_id = current_app_tenant_id())',
      'tenant_isolation_' || table_name,
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context()',
      'tenant_context_guard_' || table_name,
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX execution_target_policies_tenant_provider_chain_idx
  ON execution_target_policies(tenant_id, provider_id, chain_id, expires_at, id);
CREATE INDEX delegated_wallet_grants_tenant_subject_status_idx
  ON delegated_wallet_grants(tenant_id, subject_id, status, expires_at, id);
CREATE INDEX delegated_wallet_pending_exposures_tenant_grant_status_idx
  ON delegated_wallet_pending_exposures(tenant_id, grant_id, status, reserved_at, expires_at, id);
CREATE INDEX delegated_wallet_pending_exposures_tenant_obligation_status_idx
  ON delegated_wallet_pending_exposures(tenant_id, obligation_id, status, reserved_at, id);
