ALTER TABLE abuse_admissions
  DROP CONSTRAINT abuse_admissions_quota_class_check,
  ADD CONSTRAINT abuse_admissions_quota_class_check CHECK (quota_class IN (
    'read', 'mutation', 'economic', 'credential', 'privileged', 'batch', 'worker'
  ));

CREATE TABLE agent_account_challenges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  subject_id TEXT NOT NULL,
  subject_hash TEXT NOT NULL CHECK (subject_hash ~ '^0x[0-9a-f]{64}$'),
  tenant_hash TEXT NOT NULL CHECK (tenant_hash ~ '^0x[0-9a-f]{64}$'),
  controller_actor_hash TEXT NOT NULL CHECK (controller_actor_hash ~ '^0x[0-9a-f]{64}$'),
  agent_actor_hash TEXT NOT NULL CHECK (agent_actor_hash ~ '^0x[0-9a-f]{64}$'),
  chain_id TEXT NOT NULL CHECK (chain_id IN ('eip155:84532', 'eip155:1952')),
  account_hash TEXT NOT NULL CHECK (account_hash ~ '^0x[0-9a-f]{64}$'),
  purpose TEXT NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9_]{0,31}$'),
  nonce TEXT NOT NULL CHECK (nonce ~ '^0x[0-9a-f]{64}$'),
  typed_data_hash TEXT NOT NULL CHECK (typed_data_hash ~ '^0x[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'consumed', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  protocol_version TEXT NOT NULL CHECK (protocol_version = '1.1'),
  schema_version TEXT NOT NULL CHECK (schema_version = 'agent_account_challenge.v1'),
  CONSTRAINT agent_account_challenges_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT agent_account_challenges_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id),
  CONSTRAINT agent_account_challenges_validity_check CHECK (
    expires_at > issued_at
    AND expires_at <= issued_at + INTERVAL '10 minutes'
  ),
  CONSTRAINT agent_account_challenges_state_check CHECK (
    (status = 'pending' AND consumed_at IS NULL)
    OR (status = 'consumed' AND consumed_at IS NOT NULL AND consumed_at >= issued_at AND consumed_at < expires_at)
    OR (status = 'expired' AND consumed_at IS NULL)
  )
);

CREATE UNIQUE INDEX agent_account_challenges_one_pending_subject_idx
  ON agent_account_challenges(tenant_id, subject_id)
  WHERE status = 'pending';
CREATE UNIQUE INDEX agent_account_challenges_typed_data_hash_idx
  ON agent_account_challenges(tenant_id, typed_data_hash);

CREATE TABLE agent_account_proof_attempts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  challenge_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  account_hash TEXT NOT NULL CHECK (account_hash ~ '^0x[0-9a-f]{64}$'),
  chain_id TEXT NOT NULL CHECK (chain_id IN ('eip155:84532', 'eip155:1952')),
  proof_hash TEXT NOT NULL CHECK (proof_hash ~ '^0x[0-9a-f]{64}$'),
  verification_method TEXT NOT NULL CHECK (verification_method = 'eip712_eoa_v1'),
  outcome TEXT NOT NULL CHECK (outcome = 'verified'),
  attempted_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'agent_account_proof_attempt.v1'),
  CONSTRAINT agent_account_proof_attempts_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT agent_account_proof_attempts_challenge_key UNIQUE (tenant_id, challenge_id),
  CONSTRAINT agent_account_proof_attempts_tenant_challenge_fk
    FOREIGN KEY (tenant_id, challenge_id) REFERENCES agent_account_challenges(tenant_id, id),
  CONSTRAINT agent_account_proof_attempts_tenant_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id)
);

ALTER TABLE account_bindings
  ADD COLUMN challenge_id TEXT,
  ADD COLUMN proof_hash TEXT,
  ADD COLUMN protocol_version TEXT;

ALTER TABLE account_bindings
  ADD CONSTRAINT account_bindings_tenant_challenge_fk
    FOREIGN KEY (tenant_id, challenge_id)
    REFERENCES agent_account_challenges(tenant_id, id),
  ADD CONSTRAINT account_bindings_tenant_challenge_key UNIQUE (tenant_id, challenge_id),
  ADD CONSTRAINT account_bindings_v2_shape_check CHECK (
    schema_version <> 'account_binding.v2'
    OR (
      challenge_id IS NOT NULL
      AND proof_hash ~ '^0x[0-9a-f]{64}$'
      AND signature_hash = proof_hash
      AND nonce ~ '^0x[0-9a-f]{64}$'
      AND protocol_version = '1.1'
      AND verification_method = 'eip712_eoa_v1'
      AND status = 'active'
    )
  );

CREATE FUNCTION guard_agent_account_challenge_projection()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Agent account challenges cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.subject_id, NEW.subject_hash, NEW.tenant_hash,
    NEW.controller_actor_hash, NEW.agent_actor_hash, NEW.chain_id,
    NEW.account_hash, NEW.purpose, NEW.nonce, NEW.typed_data_hash,
    NEW.issued_at, NEW.expires_at, NEW.protocol_version, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.subject_id, OLD.subject_hash, OLD.tenant_hash,
    OLD.controller_actor_hash, OLD.agent_actor_hash, OLD.chain_id,
    OLD.account_hash, OLD.purpose, OLD.nonce, OLD.typed_data_hash,
    OLD.issued_at, OLD.expires_at, OLD.protocol_version, OLD.schema_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Agent account challenge identity is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'pending' AND NEW.status IN ('consumed', 'expired')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid Agent account challenge transition';
  END IF;
  IF OLD.status <> 'pending' AND ROW(NEW.status, NEW.consumed_at) IS DISTINCT FROM ROW(OLD.status, OLD.consumed_at) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal Agent account challenge is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_agent_account_proof_attempt_projection()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Agent account proof attempts are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_verified_agent_account_binding()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.schema_version = 'account_binding.v2' AND NOT EXISTS (
    SELECT 1
      FROM agent_account_challenges challenge
      JOIN agent_account_proof_attempts attempt
        ON attempt.tenant_id = challenge.tenant_id
       AND attempt.challenge_id = challenge.id
     WHERE challenge.tenant_id = NEW.tenant_id
       AND challenge.id = NEW.challenge_id
       AND challenge.subject_id = NEW.subject_id
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
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Account binding requires one consumed verified challenge';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_agent_subject_account_activation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.subject_type = 'agent' AND OLD.status = 'pending' AND NEW.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM account_bindings binding
     WHERE binding.tenant_id = NEW.tenant_id
       AND binding.subject_id = NEW.id
       AND binding.status = 'active'
       AND binding.schema_version = 'account_binding.v2'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Agent activation requires a verified AccountBinding';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_account_challenges_projection_guard
BEFORE UPDATE OR DELETE ON agent_account_challenges
FOR EACH ROW EXECUTE FUNCTION guard_agent_account_challenge_projection();
CREATE TRIGGER agent_account_proof_attempts_projection_guard
BEFORE UPDATE OR DELETE ON agent_account_proof_attempts
FOR EACH ROW EXECUTE FUNCTION guard_agent_account_proof_attempt_projection();
CREATE TRIGGER verified_agent_account_binding_guard
BEFORE INSERT OR UPDATE ON account_bindings
FOR EACH ROW EXECUTE FUNCTION guard_verified_agent_account_binding();
CREATE TRIGGER agent_subject_account_activation_guard
BEFORE UPDATE ON subjects
FOR EACH ROW EXECUTE FUNCTION guard_agent_subject_account_activation();

ALTER TABLE agent_account_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_account_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agent_account_challenges ON agent_account_challenges
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_agent_account_challenges
BEFORE INSERT OR UPDATE OR DELETE ON agent_account_challenges
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

ALTER TABLE agent_account_proof_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_account_proof_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agent_account_proof_attempts ON agent_account_proof_attempts
  USING (tenant_id = current_app_tenant_id())
  WITH CHECK (tenant_id = current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_agent_account_proof_attempts
BEFORE INSERT OR UPDATE OR DELETE ON agent_account_proof_attempts
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();

CREATE INDEX agent_account_challenges_tenant_subject_issued_idx
  ON agent_account_challenges(tenant_id, subject_id, issued_at DESC);
CREATE INDEX agent_account_proof_attempts_tenant_subject_attempted_idx
  ON agent_account_proof_attempts(tenant_id, subject_id, attempted_at DESC);
