CREATE TABLE execution_account_binding_challenges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  subject_id TEXT NOT NULL,
  subject_hash TEXT NOT NULL CHECK (subject_hash ~ '^0x[0-9a-f]{64}$'),
  tenant_hash TEXT NOT NULL CHECK (tenant_hash ~ '^0x[0-9a-f]{64}$'),
  controller_actor_hash TEXT NOT NULL CHECK (controller_actor_hash ~ '^0x[0-9a-f]{64}$'),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'agent')),
  chain_id TEXT NOT NULL CHECK (chain_id IN ('eip155:84532', 'eip155:1952')),
  account_hash TEXT NOT NULL CHECK (account_hash ~ '^0x[0-9a-f]{64}$'),
  purpose TEXT NOT NULL CHECK (purpose = 'execution'),
  nonce TEXT NOT NULL CHECK (nonce ~ '^0x[0-9a-f]{64}$'),
  typed_data_hash TEXT NOT NULL CHECK (typed_data_hash ~ '^0x[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'consumed', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  protocol_version TEXT NOT NULL CHECK (protocol_version = '1.2'),
  schema_version TEXT NOT NULL CHECK (schema_version = 'execution_account_binding_challenge.v1'),
  CONSTRAINT execution_account_binding_challenges_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT execution_account_binding_challenges_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT execution_account_binding_challenges_validity_check CHECK (
    expires_at > issued_at AND expires_at <= issued_at + INTERVAL '10 minutes'
  ),
  CONSTRAINT execution_account_binding_challenges_state_check CHECK (
    (status = 'pending' AND consumed_at IS NULL)
    OR (status = 'consumed' AND consumed_at IS NOT NULL AND consumed_at >= issued_at AND consumed_at < expires_at)
    OR (status = 'expired' AND consumed_at IS NULL)
  )
);

CREATE UNIQUE INDEX execution_account_binding_one_pending_subject_idx
  ON execution_account_binding_challenges(tenant_id, subject_id)
  WHERE status = 'pending';
CREATE UNIQUE INDEX execution_account_binding_typed_data_hash_idx
  ON execution_account_binding_challenges(tenant_id, typed_data_hash);

CREATE TABLE execution_account_binding_proof_attempts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  challenge_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  account_hash TEXT NOT NULL CHECK (account_hash ~ '^0x[0-9a-f]{64}$'),
  chain_id TEXT NOT NULL CHECK (chain_id IN ('eip155:84532', 'eip155:1952')),
  proof_hash TEXT NOT NULL CHECK (proof_hash ~ '^0x[0-9a-f]{64}$'),
  verification_method TEXT NOT NULL CHECK (verification_method IN (
    'eip712_eoa_v1', 'eip1271_eip712_v1', 'eip6492_eip712_v1'
  )),
  outcome TEXT NOT NULL CHECK (outcome = 'verified'),
  attempted_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'execution_account_binding_proof_attempt.v1'),
  CONSTRAINT execution_account_binding_proof_attempts_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT execution_account_binding_proof_attempts_challenge_key UNIQUE (tenant_id, challenge_id),
  CONSTRAINT execution_account_binding_proof_attempts_challenge_fk
    FOREIGN KEY (tenant_id, challenge_id)
    REFERENCES execution_account_binding_challenges(tenant_id, id),
  CONSTRAINT execution_account_binding_proof_attempts_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id)
);

ALTER TABLE account_bindings
  ADD COLUMN execution_challenge_id TEXT,
  ADD COLUMN controller_actor_hash TEXT,
  ADD COLUMN binding_kind TEXT NOT NULL DEFAULT 'legacy'
    CHECK (binding_kind IN ('legacy', 'agent_onboarding', 'execution'));

-- This is an owner-run, transaction-local migration backfill across every
-- existing Tenant. account_bindings is FORCE RLS, so the table owner must
-- temporarily regain owner visibility and suspend only the two pre-existing
-- per-row verification guards while adding this non-identity label. ALTER
-- TABLE holds an exclusive lock, and any failure rolls every change back.
ALTER TABLE account_bindings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE account_bindings DISABLE TRIGGER tenant_context_guard_account_bindings;
ALTER TABLE account_bindings DISABLE TRIGGER verified_agent_account_binding_guard;
UPDATE account_bindings
   SET binding_kind = 'agent_onboarding'
 WHERE schema_version = 'account_binding.v2';
ALTER TABLE account_bindings ENABLE TRIGGER verified_agent_account_binding_guard;
ALTER TABLE account_bindings ENABLE TRIGGER tenant_context_guard_account_bindings;
ALTER TABLE account_bindings FORCE ROW LEVEL SECURITY;

ALTER TABLE account_bindings
  ADD CONSTRAINT account_bindings_execution_challenge_fk
    FOREIGN KEY (tenant_id, execution_challenge_id)
    REFERENCES execution_account_binding_challenges(tenant_id, id),
  ADD CONSTRAINT account_bindings_execution_challenge_key
    UNIQUE (tenant_id, execution_challenge_id),
  ADD CONSTRAINT account_bindings_v3_shape_check CHECK (
    schema_version <> 'account_binding.v3'
    OR (
      binding_kind = 'execution'
      AND challenge_id IS NULL
      AND execution_challenge_id IS NOT NULL
      AND controller_actor_hash ~ '^0x[0-9a-f]{64}$'
      AND proof_hash ~ '^0x[0-9a-f]{64}$'
      AND signature_hash = proof_hash
      AND nonce ~ '^0x[0-9a-f]{64}$'
      AND purpose = 'execution'
      AND protocol_version = '1.2'
      AND verification_method IN (
        'eip712_eoa_v1', 'eip1271_eip712_v1', 'eip6492_eip712_v1'
      )
      AND status IN ('active', 'revoked')
    )
  );

CREATE FUNCTION guard_execution_account_binding_challenge()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'execution AccountBinding challenges cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.subject_id, NEW.subject_hash, NEW.tenant_hash,
    NEW.controller_actor_hash, NEW.actor_type, NEW.chain_id, NEW.account_hash,
    NEW.purpose, NEW.nonce, NEW.typed_data_hash, NEW.issued_at, NEW.expires_at,
    NEW.protocol_version, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.subject_id, OLD.subject_hash, OLD.tenant_hash,
    OLD.controller_actor_hash, OLD.actor_type, OLD.chain_id, OLD.account_hash,
    OLD.purpose, OLD.nonce, OLD.typed_data_hash, OLD.issued_at, OLD.expires_at,
    OLD.protocol_version, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'execution AccountBinding challenge identity is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'pending' AND NEW.status IN ('consumed', 'expired')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid execution AccountBinding challenge transition';
  END IF;
  IF OLD.status <> 'pending' AND ROW(NEW.status, NEW.consumed_at) IS DISTINCT FROM ROW(OLD.status, OLD.consumed_at) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal execution AccountBinding challenge is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_execution_account_binding_proof_attempt()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'execution AccountBinding proof attempts are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_verified_execution_account_binding()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.schema_version = 'account_binding.v3' AND NOT EXISTS (
    SELECT 1
      FROM execution_account_binding_challenges challenge
      JOIN execution_account_binding_proof_attempts attempt
        ON attempt.tenant_id = challenge.tenant_id
       AND attempt.challenge_id = challenge.id
     WHERE challenge.tenant_id = NEW.tenant_id
       AND challenge.id = NEW.execution_challenge_id
       AND challenge.subject_id = NEW.subject_id
       AND challenge.controller_actor_hash = NEW.controller_actor_hash
       AND challenge.account_hash = NEW.account_hash
       AND challenge.chain_id = NEW.chain_id
       AND challenge.purpose = NEW.purpose
       AND challenge.status = 'consumed'
       AND attempt.subject_id = NEW.subject_id
       AND attempt.account_hash = NEW.account_hash
       AND attempt.chain_id = NEW.chain_id
       AND attempt.proof_hash = NEW.proof_hash
       AND attempt.outcome = 'verified'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'execution AccountBinding requires one consumed verified challenge';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.schema_version = 'account_binding.v3' THEN
    IF ROW(
      NEW.tenant_id, NEW.id, NEW.subject_id, NEW.account_hash, NEW.chain_id,
      NEW.account_ref, NEW.signature_hash, NEW.nonce, NEW.purpose,
      NEW.verification_method, NEW.bound_at, NEW.schema_version,
      NEW.execution_challenge_id, NEW.controller_actor_hash, NEW.binding_kind,
      NEW.proof_hash, NEW.protocol_version
    ) IS DISTINCT FROM ROW(
      OLD.tenant_id, OLD.id, OLD.subject_id, OLD.account_hash, OLD.chain_id,
      OLD.account_ref, OLD.signature_hash, OLD.nonce, OLD.purpose,
      OLD.verification_method, OLD.bound_at, OLD.schema_version,
      OLD.execution_challenge_id, OLD.controller_actor_hash, OLD.binding_kind,
      OLD.proof_hash, OLD.protocol_version
    ) OR NOT (
      NEW.status = OLD.status OR (OLD.status = 'active' AND NEW.status = 'revoked')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'execution AccountBinding identity or transition is invalid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_account_binding_challenges_guard
BEFORE UPDATE OR DELETE ON execution_account_binding_challenges
FOR EACH ROW EXECUTE FUNCTION guard_execution_account_binding_challenge();
CREATE TRIGGER execution_account_binding_proof_attempts_guard
BEFORE UPDATE OR DELETE ON execution_account_binding_proof_attempts
FOR EACH ROW EXECUTE FUNCTION guard_execution_account_binding_proof_attempt();
CREATE TRIGGER verified_execution_account_binding_guard
BEFORE INSERT OR UPDATE ON account_bindings
FOR EACH ROW EXECUTE FUNCTION guard_verified_execution_account_binding();

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'execution_account_binding_challenges',
    'execution_account_binding_proof_attempts'
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

CREATE INDEX execution_account_binding_challenges_subject_idx
  ON execution_account_binding_challenges(tenant_id, subject_id, issued_at DESC);
CREATE INDEX execution_account_binding_proof_attempts_subject_idx
  ON execution_account_binding_proof_attempts(tenant_id, subject_id, attempted_at DESC);
CREATE INDEX account_bindings_execution_subject_idx
  ON account_bindings(tenant_id, subject_id, binding_kind, status, bound_at DESC);
