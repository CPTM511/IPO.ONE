-- M2B-001: durable L0 Agent/Principal secured-Facility authorization.
-- No nonce, signer, venue call, transaction submission or funds authority.

CREATE TABLE agent_secured_facility_authorizations (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  authorization_hash TEXT NOT NULL CHECK (authorization_hash ~ '^0x[0-9a-f]{64}$'),
  subject_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  mandate_id TEXT NOT NULL,
  mandate_hash TEXT NOT NULL CHECK (mandate_hash ~ '^0x[0-9a-f]{64}$'),
  account_binding_id TEXT NOT NULL,
  account_hash TEXT NOT NULL CHECK (account_hash ~ '^0x[0-9a-f]{64}$'),
  pool_obligation_binding_id TEXT NOT NULL,
  pool_binding_hash TEXT NOT NULL CHECK (pool_binding_hash ~ '^0x[0-9a-f]{64}$'),
  pool_projection_hash TEXT NOT NULL CHECK (pool_projection_hash ~ '^0x[0-9a-f]{64}$'),
  obligation_id TEXT NOT NULL,
  obligation_hash TEXT NOT NULL CHECK (obligation_hash ~ '^0x[0-9a-f]{64}$'),
  trading_facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  facility_state_hash TEXT NOT NULL CHECK (facility_state_hash ~ '^0x[0-9a-f]{64}$'),
  facility_version BIGINT NOT NULL CHECK (facility_version >= 1),
  chain_id TEXT NOT NULL CHECK (chain_id = 'eip155:84532'),
  operation_family TEXT NOT NULL CHECK (operation_family = 'agent_trading_capital_intent.v1'),
  allowed_intent_kinds JSONB NOT NULL CHECK (allowed_intent_kinds = '["open", "close"]'::jsonb),
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > valid_from),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 2),
  revoked_at TIMESTAMPTZ,
  revocation_hash TEXT CHECK (revocation_hash IS NULL OR revocation_hash ~ '^0x[0-9a-f]{64}$'),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  signing_authority BOOLEAN NOT NULL CHECK (signing_authority = FALSE),
  nonce_authority BOOLEAN NOT NULL CHECK (nonce_authority = FALSE),
  network_authority BOOLEAN NOT NULL CHECK (network_authority = FALSE),
  withdrawal_allowed BOOLEAN NOT NULL CHECK (withdrawal_allowed = FALSE),
  transfer_allowed BOOLEAN NOT NULL CHECK (transfer_allowed = FALSE),
  authorization JSONB NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'agent_secured_facility_authorization.v1'),
  CONSTRAINT agent_secured_facility_authorizations_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT agent_secured_facility_authorizations_hash_key UNIQUE (tenant_id, authorization_hash),
  CONSTRAINT agent_secured_facility_authorizations_facility_key UNIQUE (tenant_id, trading_facility_id),
  CONSTRAINT agent_secured_facility_authorizations_obligation_key UNIQUE (tenant_id, obligation_id),
  CONSTRAINT agent_secured_facility_authorizations_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT agent_secured_facility_authorizations_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES principals(tenant_id, id),
  CONSTRAINT agent_secured_facility_authorizations_mandate_fk
    FOREIGN KEY (tenant_id, mandate_id) REFERENCES mandates(tenant_id, id),
  CONSTRAINT agent_secured_facility_authorizations_account_binding_fk
    FOREIGN KEY (tenant_id, account_binding_id) REFERENCES account_bindings(tenant_id, id),
  CONSTRAINT agent_secured_facility_authorizations_pool_binding_fk
    FOREIGN KEY (tenant_id, pool_obligation_binding_id) REFERENCES pool_obligation_bindings(tenant_id, id),
  CONSTRAINT agent_secured_facility_authorizations_obligation_fk
    FOREIGN KEY (tenant_id, obligation_id) REFERENCES obligations(tenant_id, id),
  CONSTRAINT agent_secured_facility_authorizations_facility_fk
    FOREIGN KEY (tenant_id, trading_facility_id) REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT agent_secured_facility_authorizations_state_check CHECK (
    (status = 'active' AND version = 1 AND revoked_at IS NULL AND revocation_hash IS NULL)
    OR (status = 'revoked' AND version = 2 AND revoked_at IS NOT NULL AND revocation_hash IS NOT NULL)
    OR (status = 'expired' AND version = 2 AND revoked_at IS NULL AND revocation_hash IS NOT NULL)
  ),
  CONSTRAINT agent_secured_facility_authorizations_identity_check CHECK (
    authorization->>'agentSecuredFacilityAuthorizationId' = id
    AND authorization->>'authorizationHash' = authorization_hash
    AND authorization->>'subjectId' = subject_id
    AND authorization->>'principalId' = principal_id
    AND authorization->>'mandateId' = mandate_id
    AND authorization->>'accountBindingId' = account_binding_id
    AND authorization->>'poolObligationBindingId' = pool_obligation_binding_id
    AND authorization->>'obligationId' = obligation_id
    AND authorization->>'tradingFacilityId' = trading_facility_id
    AND authorization->>'operationFamily' = operation_family
    AND authorization->'allowedIntentKinds' = allowed_intent_kinds
    AND authorization->>'status' = status
    AND (authorization->>'version')::BIGINT = version
    AND authorization->>'schemaVersion' = schema_version
  )
);

CREATE FUNCTION guard_agent_secured_facility_authorization()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Agent secured Facility authorizations cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.authorization_hash, NEW.subject_id, NEW.principal_id,
    NEW.mandate_id, NEW.mandate_hash, NEW.account_binding_id, NEW.account_hash,
    NEW.pool_obligation_binding_id, NEW.pool_binding_hash, NEW.pool_projection_hash,
    NEW.obligation_id, NEW.obligation_hash, NEW.trading_facility_id, NEW.facility_hash,
    NEW.facility_state_hash, NEW.facility_version, NEW.chain_id, NEW.operation_family,
    NEW.allowed_intent_kinds, NEW.valid_from, NEW.expires_at, NEW.sandbox_only,
    NEW.production_authority, NEW.funds_authority, NEW.signing_authority,
    NEW.nonce_authority, NEW.network_authority, NEW.withdrawal_allowed,
    NEW.transfer_allowed, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.authorization_hash, OLD.subject_id, OLD.principal_id,
    OLD.mandate_id, OLD.mandate_hash, OLD.account_binding_id, OLD.account_hash,
    OLD.pool_obligation_binding_id, OLD.pool_binding_hash, OLD.pool_projection_hash,
    OLD.obligation_id, OLD.obligation_hash, OLD.trading_facility_id, OLD.facility_hash,
    OLD.facility_state_hash, OLD.facility_version, OLD.chain_id, OLD.operation_family,
    OLD.allowed_intent_kinds, OLD.valid_from, OLD.expires_at, OLD.sandbox_only,
    OLD.production_authority, OLD.funds_authority, OLD.signing_authority,
    OLD.nonce_authority, OLD.network_authority, OLD.withdrawal_allowed,
    OLD.transfer_allowed, OLD.schema_version
  ) OR OLD.status <> 'active' OR NEW.status <> 'revoked' OR
    NEW.version <> OLD.version + 1 OR NEW.revoked_at IS NULL OR NEW.revocation_hash IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Agent secured Facility authorization transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_secured_facility_authorizations_guard
BEFORE UPDATE OR DELETE ON agent_secured_facility_authorizations
FOR EACH ROW EXECUTE FUNCTION guard_agent_secured_facility_authorization();

ALTER TABLE agent_secured_facility_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_secured_facility_authorizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agent_secured_facility_authorizations
  ON agent_secured_facility_authorizations
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_agent_secured_facility_authorizations
BEFORE INSERT OR UPDATE OR DELETE ON agent_secured_facility_authorizations
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX agent_secured_facility_authorizations_subject_idx
  ON agent_secured_facility_authorizations(tenant_id, subject_id, status, expires_at);
