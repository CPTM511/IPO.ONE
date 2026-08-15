CREATE TABLE hypercore_account_bindings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  account_binding_hash TEXT NOT NULL CHECK (account_binding_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  environment TEXT NOT NULL CHECK (environment = 'hyperliquid_testnet'),
  account_role TEXT NOT NULL CHECK (account_role IN ('master', 'subaccount')),
  master_account_address_hash TEXT NOT NULL CHECK (master_account_address_hash ~ '^0x[0-9a-f]{64}$'),
  subaccount_address_hash TEXT CHECK (
    subaccount_address_hash IS NULL
    OR subaccount_address_hash ~ '^0x[0-9a-f]{64}$'
  ),
  canonical_account_address_hash TEXT NOT NULL CHECK (canonical_account_address_hash ~ '^0x[0-9a-f]{64}$'),
  query_address_hash TEXT NOT NULL CHECK (query_address_hash ~ '^0x[0-9a-f]{64}$'),
  binding_proof_hash TEXT NOT NULL CHECK (binding_proof_hash ~ '^0x[0-9a-f]{64}$'),
  binding_version BIGINT NOT NULL CHECK (binding_version >= 1),
  status TEXT NOT NULL CHECK (status = 'active'),
  binding JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  signer_address_is_account_identity BOOLEAN NOT NULL CHECK (signer_address_is_account_identity = FALSE),
  api_wallet_address_accepted_for_info BOOLEAN NOT NULL CHECK (api_wallet_address_accepted_for_info = FALSE),
  external_binding_performed BOOLEAN NOT NULL CHECK (external_binding_performed = FALSE),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  testnet_only BOOLEAN NOT NULL CHECK (testnet_only = TRUE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_account_binding.v1'),
  CONSTRAINT hypercore_account_bindings_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_account_bindings_tenant_hash_key UNIQUE (tenant_id, account_binding_hash),
  CONSTRAINT hypercore_account_bindings_tenant_facility_version_key
    UNIQUE (tenant_id, facility_id, binding_version),
  CONSTRAINT hypercore_account_bindings_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT hypercore_account_bindings_role_check CHECK (
    (account_role = 'master' AND subaccount_address_hash IS NULL
      AND canonical_account_address_hash = master_account_address_hash)
    OR
    (account_role = 'subaccount' AND subaccount_address_hash IS NOT NULL
      AND subaccount_address_hash <> master_account_address_hash
      AND canonical_account_address_hash = subaccount_address_hash)
  ),
  CONSTRAINT hypercore_account_bindings_query_identity_check
    CHECK (query_address_hash = canonical_account_address_hash),
  CONSTRAINT hypercore_account_bindings_record_check CHECK (
    binding->>'accountBindingId' = id
    AND binding->>'accountBindingHash' = account_binding_hash
    AND binding->>'facilityId' = facility_id
    AND binding->>'facilityHash' = facility_hash
    AND binding->>'environment' = environment
    AND binding->>'accountRole' = account_role
    AND binding->>'masterAccountAddressHash' = master_account_address_hash
    AND binding->'subaccountAddressHash' = CASE
      WHEN subaccount_address_hash IS NULL THEN 'null'::jsonb
      ELSE to_jsonb(subaccount_address_hash)
    END
    AND binding->>'canonicalAccountAddressHash' = canonical_account_address_hash
    AND binding->>'queryAddressHash' = query_address_hash
    AND binding->>'bindingProofHash' = binding_proof_hash
    AND (binding->>'bindingVersion')::BIGINT = binding_version
    AND binding->>'status' = status
    AND (binding->>'signerAddressIsAccountIdentity')::BOOLEAN = signer_address_is_account_identity
    AND (binding->>'apiWalletAddressAcceptedForInfo')::BOOLEAN = api_wallet_address_accepted_for_info
    AND (binding->>'externalBindingPerformed')::BOOLEAN = external_binding_performed
    AND (binding->>'sandboxOnly')::BOOLEAN = sandbox_only
    AND (binding->>'testnetOnly')::BOOLEAN = testnet_only
    AND (binding->>'mainnetAuthority')::BOOLEAN = mainnet_authority
    AND (binding->>'productionAuthority')::BOOLEAN = production_authority
    AND (binding->>'fundsAuthority')::BOOLEAN = funds_authority
    AND (binding->>'secretsIncluded')::BOOLEAN = secrets_included
    AND binding->>'schemaVersion' = schema_version
  )
);

CREATE TABLE hypercore_api_wallet_delegates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  delegate_hash TEXT NOT NULL CHECK (delegate_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  facility_hash TEXT NOT NULL CHECK (facility_hash ~ '^0x[0-9a-f]{64}$'),
  environment TEXT NOT NULL CHECK (environment = 'hyperliquid_testnet'),
  account_binding_id TEXT NOT NULL,
  account_binding_hash TEXT NOT NULL CHECK (account_binding_hash ~ '^0x[0-9a-f]{64}$'),
  canonical_account_address_hash TEXT NOT NULL CHECK (canonical_account_address_hash ~ '^0x[0-9a-f]{64}$'),
  api_wallet_address_hash TEXT NOT NULL CHECK (api_wallet_address_hash ~ '^0x[0-9a-f]{64}$'),
  signer_reference_hash TEXT NOT NULL CHECK (signer_reference_hash ~ '^0x[0-9a-f]{64}$'),
  delegate_name_hash TEXT NOT NULL CHECK (delegate_name_hash ~ '^0x[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (
    status IN ('PREPARED', 'SIMULATED_ACTIVE', 'REVOKED', 'EXPIRED', 'COMPROMISED', 'RETIRED')
  ),
  prepared_at TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > prepared_at),
  terminal_reason TEXT,
  lifecycle_version BIGINT NOT NULL CHECK (lifecycle_version >= 1),
  delegate JSONB NOT NULL,
  external_approval_performed BOOLEAN NOT NULL CHECK (external_approval_performed = FALSE),
  venue_registration_verified BOOLEAN NOT NULL CHECK (venue_registration_verified = FALSE),
  raw_address_persisted BOOLEAN NOT NULL CHECK (raw_address_persisted = FALSE),
  raw_key_accepted BOOLEAN NOT NULL CHECK (raw_key_accepted = FALSE),
  raw_key_persisted BOOLEAN NOT NULL CHECK (raw_key_persisted = FALSE),
  reusable_signature_persisted BOOLEAN NOT NULL CHECK (reusable_signature_persisted = FALSE),
  withdrawal_authority BOOLEAN NOT NULL CHECK (withdrawal_authority = FALSE),
  transfer_authority BOOLEAN NOT NULL CHECK (transfer_authority = FALSE),
  account_administration_authority BOOLEAN NOT NULL CHECK (account_administration_authority = FALSE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_api_wallet_delegate.v1'),
  CONSTRAINT hypercore_api_wallet_delegates_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_api_wallet_delegates_tenant_hash_key UNIQUE (tenant_id, delegate_hash),
  CONSTRAINT hypercore_api_wallet_delegates_tenant_address_key UNIQUE (tenant_id, api_wallet_address_hash),
  CONSTRAINT hypercore_api_wallet_delegates_binding_fk
    FOREIGN KEY (tenant_id, account_binding_id)
    REFERENCES hypercore_account_bindings(tenant_id, id),
  CONSTRAINT hypercore_api_wallet_delegates_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT hypercore_api_wallet_delegates_lifecycle_check CHECK (
    (status = 'PREPARED' AND activated_at IS NULL AND terminal_at IS NULL AND terminal_reason IS NULL)
    OR
    (status = 'SIMULATED_ACTIVE' AND activated_at IS NOT NULL AND terminal_at IS NULL AND terminal_reason IS NULL)
    OR
    (status IN ('REVOKED', 'EXPIRED', 'COMPROMISED', 'RETIRED')
      AND terminal_at IS NOT NULL AND terminal_reason IS NOT NULL)
  ),
  CONSTRAINT hypercore_api_wallet_delegates_time_check CHECK (
    (activated_at IS NULL OR (activated_at >= prepared_at AND activated_at < expires_at))
    AND (terminal_at IS NULL OR terminal_at >= prepared_at)
    AND (terminal_at IS NULL OR activated_at IS NULL OR terminal_at >= activated_at)
  ),
  CONSTRAINT hypercore_api_wallet_delegates_record_check CHECK (
    delegate->>'delegateId' = id
    AND delegate->>'delegateHash' = delegate_hash
    AND delegate->>'facilityId' = facility_id
    AND delegate->>'facilityHash' = facility_hash
    AND delegate->>'environment' = environment
    AND delegate->>'accountBindingId' = account_binding_id
    AND delegate->>'accountBindingHash' = account_binding_hash
    AND delegate->>'canonicalAccountAddressHash' = canonical_account_address_hash
    AND delegate->>'apiWalletAddressHash' = api_wallet_address_hash
    AND delegate->>'signerReferenceHash' = signer_reference_hash
    AND delegate->>'delegateNameHash' = delegate_name_hash
    AND delegate->>'status' = status
    AND (delegate->>'preparedAt')::TIMESTAMPTZ = prepared_at
    AND (delegate->'activatedAt' = 'null'::jsonb OR (delegate->>'activatedAt')::TIMESTAMPTZ = activated_at)
    AND (delegate->'terminalAt' = 'null'::jsonb OR (delegate->>'terminalAt')::TIMESTAMPTZ = terminal_at)
    AND (delegate->>'expiresAt')::TIMESTAMPTZ = expires_at
    AND (delegate->'terminalReason' = 'null'::jsonb OR delegate->>'terminalReason' = terminal_reason)
    AND (delegate->>'lifecycleVersion')::BIGINT = lifecycle_version
    AND (delegate->>'externalApprovalPerformed')::BOOLEAN = external_approval_performed
    AND (delegate->>'venueRegistrationVerified')::BOOLEAN = venue_registration_verified
    AND (delegate->>'rawAddressPersisted')::BOOLEAN = raw_address_persisted
    AND (delegate->>'rawKeyAccepted')::BOOLEAN = raw_key_accepted
    AND (delegate->>'rawKeyPersisted')::BOOLEAN = raw_key_persisted
    AND (delegate->>'reusableSignaturePersisted')::BOOLEAN = reusable_signature_persisted
    AND (delegate->>'withdrawalAuthority')::BOOLEAN = withdrawal_authority
    AND (delegate->>'transferAuthority')::BOOLEAN = transfer_authority
    AND (delegate->>'accountAdministrationAuthority')::BOOLEAN = account_administration_authority
    AND (delegate->>'mainnetAuthority')::BOOLEAN = mainnet_authority
    AND (delegate->>'productionAuthority')::BOOLEAN = production_authority
    AND (delegate->>'fundsAuthority')::BOOLEAN = funds_authority
    AND (delegate->>'secretsIncluded')::BOOLEAN = secrets_included
    AND delegate->>'schemaVersion' = schema_version
  )
);

CREATE TABLE hypercore_delegate_tombstones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  tombstone_hash TEXT NOT NULL CHECK (tombstone_hash ~ '^0x[0-9a-f]{64}$'),
  delegate_id TEXT NOT NULL,
  delegate_hash TEXT NOT NULL CHECK (delegate_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  account_binding_id TEXT NOT NULL,
  api_wallet_address_hash TEXT NOT NULL CHECK (api_wallet_address_hash ~ '^0x[0-9a-f]{64}$'),
  terminal_status TEXT NOT NULL CHECK (terminal_status IN ('REVOKED', 'EXPIRED', 'COMPROMISED', 'RETIRED')),
  terminal_reason TEXT NOT NULL,
  terminal_at TIMESTAMPTZ NOT NULL,
  tombstone JSONB NOT NULL,
  address_reuse_allowed BOOLEAN NOT NULL CHECK (address_reuse_allowed = FALSE),
  raw_address_persisted BOOLEAN NOT NULL CHECK (raw_address_persisted = FALSE),
  raw_key_persisted BOOLEAN NOT NULL CHECK (raw_key_persisted = FALSE),
  reusable_signature_persisted BOOLEAN NOT NULL CHECK (reusable_signature_persisted = FALSE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_delegate_tombstone.v1'),
  CONSTRAINT hypercore_delegate_tombstones_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_delegate_tombstones_tenant_hash_key UNIQUE (tenant_id, tombstone_hash),
  CONSTRAINT hypercore_delegate_tombstones_tenant_address_key UNIQUE (tenant_id, api_wallet_address_hash),
  CONSTRAINT hypercore_delegate_tombstones_delegate_fk
    FOREIGN KEY (tenant_id, delegate_id)
    REFERENCES hypercore_api_wallet_delegates(tenant_id, id),
  CONSTRAINT hypercore_delegate_tombstones_binding_fk
    FOREIGN KEY (tenant_id, account_binding_id)
    REFERENCES hypercore_account_bindings(tenant_id, id),
  CONSTRAINT hypercore_delegate_tombstones_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT hypercore_delegate_tombstones_record_check CHECK (
    tombstone->>'tombstoneId' = id
    AND tombstone->>'tombstoneHash' = tombstone_hash
    AND tombstone->>'delegateId' = delegate_id
    AND tombstone->>'delegateHash' = delegate_hash
    AND tombstone->>'facilityId' = facility_id
    AND tombstone->>'accountBindingId' = account_binding_id
    AND tombstone->>'apiWalletAddressHash' = api_wallet_address_hash
    AND tombstone->>'terminalStatus' = terminal_status
    AND tombstone->>'terminalReason' = terminal_reason
    AND (tombstone->>'terminalAt')::TIMESTAMPTZ = terminal_at
    AND (tombstone->>'addressReuseAllowed')::BOOLEAN = address_reuse_allowed
    AND (tombstone->>'rawAddressPersisted')::BOOLEAN = raw_address_persisted
    AND (tombstone->>'rawKeyPersisted')::BOOLEAN = raw_key_persisted
    AND (tombstone->>'reusableSignaturePersisted')::BOOLEAN = reusable_signature_persisted
    AND (tombstone->>'mainnetAuthority')::BOOLEAN = mainnet_authority
    AND (tombstone->>'productionAuthority')::BOOLEAN = production_authority
    AND (tombstone->>'fundsAuthority')::BOOLEAN = funds_authority
    AND (tombstone->>'secretsIncluded')::BOOLEAN = secrets_included
    AND tombstone->>'schemaVersion' = schema_version
  )
);

CREATE FUNCTION guard_immutable_hypercore_account_binding()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514',
    MESSAGE = 'HyperCore account bindings are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_hypercore_delegate_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'HyperCore delegates cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.facility_id, NEW.facility_hash,
    NEW.environment, NEW.account_binding_id, NEW.account_binding_hash,
    NEW.canonical_account_address_hash, NEW.api_wallet_address_hash,
    NEW.signer_reference_hash, NEW.delegate_name_hash, NEW.prepared_at,
    NEW.expires_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.facility_id, OLD.facility_hash,
    OLD.environment, OLD.account_binding_id, OLD.account_binding_hash,
    OLD.canonical_account_address_hash, OLD.api_wallet_address_hash,
    OLD.signer_reference_hash, OLD.delegate_name_hash, OLD.prepared_at,
    OLD.expires_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'HyperCore delegate identity is immutable';
  END IF;
  IF OLD.status IN ('REVOKED', 'EXPIRED', 'COMPROMISED', 'RETIRED')
     OR NEW.lifecycle_version <> OLD.lifecycle_version + 1
     OR NOT (
       (OLD.status = 'PREPARED' AND NEW.status IN (
         'SIMULATED_ACTIVE', 'REVOKED', 'EXPIRED', 'COMPROMISED', 'RETIRED'
       ))
       OR
       (OLD.status = 'SIMULATED_ACTIVE' AND NEW.status IN (
         'REVOKED', 'EXPIRED', 'COMPROMISED', 'RETIRED'
       ))
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'HyperCore delegate lifecycle transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_immutable_hypercore_delegate_tombstone()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514',
    MESSAGE = 'HyperCore delegate tombstones are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION assert_hypercore_terminal_delegate_has_tombstone()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('REVOKED', 'EXPIRED', 'COMPROMISED', 'RETIRED')
     AND NOT EXISTS (
       SELECT 1 FROM hypercore_delegate_tombstones t
        WHERE t.tenant_id = NEW.tenant_id
          AND t.delegate_id = NEW.id
          AND t.delegate_hash = NEW.delegate_hash
          AND t.api_wallet_address_hash = NEW.api_wallet_address_hash
          AND t.terminal_status = NEW.status
          AND t.terminal_reason = NEW.terminal_reason
          AND t.terminal_at = NEW.terminal_at
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'terminal HyperCore delegate requires an exact tombstone';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION assert_hypercore_tombstone_matches_delegate()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hypercore_api_wallet_delegates d
     WHERE d.tenant_id = NEW.tenant_id
       AND d.id = NEW.delegate_id
       AND d.delegate_hash = NEW.delegate_hash
       AND d.facility_id = NEW.facility_id
       AND d.account_binding_id = NEW.account_binding_id
       AND d.api_wallet_address_hash = NEW.api_wallet_address_hash
       AND d.status = NEW.terminal_status
       AND d.terminal_reason = NEW.terminal_reason
       AND d.terminal_at = NEW.terminal_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'HyperCore tombstone does not match a terminal delegate';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hypercore_account_bindings_immutable_guard
BEFORE UPDATE OR DELETE ON hypercore_account_bindings
FOR EACH ROW EXECUTE FUNCTION guard_immutable_hypercore_account_binding();

CREATE TRIGGER hypercore_api_wallet_delegates_lifecycle_guard
BEFORE UPDATE OR DELETE ON hypercore_api_wallet_delegates
FOR EACH ROW EXECUTE FUNCTION guard_hypercore_delegate_lifecycle();

CREATE TRIGGER hypercore_delegate_tombstones_immutable_guard
BEFORE UPDATE OR DELETE ON hypercore_delegate_tombstones
FOR EACH ROW EXECUTE FUNCTION guard_immutable_hypercore_delegate_tombstone();

CREATE CONSTRAINT TRIGGER hypercore_terminal_delegate_tombstone_guard
AFTER INSERT OR UPDATE ON hypercore_api_wallet_delegates
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_hypercore_terminal_delegate_has_tombstone();

CREATE CONSTRAINT TRIGGER hypercore_tombstone_delegate_guard
AFTER INSERT ON hypercore_delegate_tombstones
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_hypercore_tombstone_matches_delegate();

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hypercore_account_bindings',
    'hypercore_api_wallet_delegates',
    'hypercore_delegate_tombstones'
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

CREATE INDEX hypercore_account_bindings_tenant_facility_idx
  ON hypercore_account_bindings(tenant_id, facility_id, binding_version DESC);
CREATE INDEX hypercore_api_wallet_delegates_tenant_binding_status_idx
  ON hypercore_api_wallet_delegates(tenant_id, account_binding_id, status, prepared_at DESC);
CREATE INDEX hypercore_api_wallet_delegates_tenant_facility_status_idx
  ON hypercore_api_wallet_delegates(tenant_id, facility_id, status, prepared_at DESC);
