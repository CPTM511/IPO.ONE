CREATE TABLE hypercore_testnet_signer_handoffs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  handoff_hash TEXT NOT NULL CHECK (handoff_hash ~ '^0x[0-9a-f]{64}$'),
  account_binding_id TEXT NOT NULL,
  account_binding_hash TEXT NOT NULL CHECK (account_binding_hash ~ '^0x[0-9a-f]{64}$'),
  canonical_account_address_hash TEXT NOT NULL CHECK (canonical_account_address_hash ~ '^0x[0-9a-f]{64}$'),
  delegate_id TEXT NOT NULL,
  delegate_hash TEXT NOT NULL CHECK (delegate_hash ~ '^0x[0-9a-f]{64}$'),
  api_wallet_address_hash TEXT NOT NULL CHECK (api_wallet_address_hash ~ '^0x[0-9a-f]{64}$'),
  signer_reference_hash TEXT NOT NULL CHECK (signer_reference_hash ~ '^0x[0-9a-f]{64}$'),
  registration_evidence_hash TEXT NOT NULL CHECK (registration_evidence_hash ~ '^0x[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('VERIFIED', 'RETIRED')),
  verified_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > verified_at),
  retired_at TIMESTAMPTZ,
  retirement_evidence_hash TEXT CHECK (
    retirement_evidence_hash IS NULL OR retirement_evidence_hash ~ '^0x[0-9a-f]{64}$'
  ),
  version BIGINT NOT NULL CHECK (version IN (1, 2)),
  raw_address_persisted BOOLEAN NOT NULL CHECK (raw_address_persisted = FALSE),
  raw_key_accepted BOOLEAN NOT NULL CHECK (raw_key_accepted = FALSE),
  raw_key_persisted BOOLEAN NOT NULL CHECK (raw_key_persisted = FALSE),
  raw_signature_persisted BOOLEAN NOT NULL CHECK (raw_signature_persisted = FALSE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  real_funds_authority BOOLEAN NOT NULL CHECK (real_funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_testnet_signer_handoff.v1'),
  CONSTRAINT hypercore_testnet_signer_handoffs_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_testnet_signer_handoffs_tenant_hash_key UNIQUE (tenant_id, handoff_hash),
  CONSTRAINT hypercore_testnet_signer_handoffs_tenant_delegate_key UNIQUE (tenant_id, delegate_id),
  CONSTRAINT hypercore_testnet_signer_handoffs_tenant_address_key UNIQUE (tenant_id, api_wallet_address_hash),
  CONSTRAINT hypercore_testnet_signer_handoffs_tenant_signer_key UNIQUE (tenant_id, signer_reference_hash),
  CONSTRAINT hypercore_testnet_signer_handoffs_binding_fk
    FOREIGN KEY (tenant_id, account_binding_id)
    REFERENCES hypercore_account_bindings(tenant_id, id),
  CONSTRAINT hypercore_testnet_signer_handoffs_delegate_fk
    FOREIGN KEY (tenant_id, delegate_id)
    REFERENCES hypercore_api_wallet_delegates(tenant_id, id),
  CONSTRAINT hypercore_testnet_signer_handoffs_state_check CHECK (
    (status = 'VERIFIED' AND version = 1 AND retired_at IS NULL AND retirement_evidence_hash IS NULL)
    OR
    (status = 'RETIRED' AND version = 2 AND retired_at IS NOT NULL AND retirement_evidence_hash IS NOT NULL)
  )
);

CREATE TABLE hypercore_testnet_nonce_heads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  handoff_id TEXT NOT NULL,
  signer_reference_hash TEXT NOT NULL CHECK (signer_reference_hash ~ '^0x[0-9a-f]{64}$'),
  last_nonce BIGINT NOT NULL CHECK (last_nonce > 0),
  version BIGINT NOT NULL CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_testnet_nonce_head.v1'),
  CONSTRAINT hypercore_testnet_nonce_heads_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_testnet_nonce_heads_tenant_handoff_key UNIQUE (tenant_id, handoff_id),
  CONSTRAINT hypercore_testnet_nonce_heads_tenant_signer_key UNIQUE (tenant_id, signer_reference_hash),
  CONSTRAINT hypercore_testnet_nonce_heads_handoff_fk
    FOREIGN KEY (tenant_id, handoff_id)
    REFERENCES hypercore_testnet_signer_handoffs(tenant_id, id)
);

CREATE TABLE hypercore_testnet_submission_attempts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  execution_hash TEXT NOT NULL CHECK (execution_hash ~ '^0x[0-9a-f]{64}$'),
  economic_action_hash TEXT NOT NULL CHECK (economic_action_hash ~ '^0x[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL CHECK (idempotency_key_hash ~ '^0x[0-9a-f]{64}$'),
  facility_id TEXT NOT NULL,
  account_binding_id TEXT NOT NULL,
  account_binding_hash TEXT NOT NULL CHECK (account_binding_hash ~ '^0x[0-9a-f]{64}$'),
  canonical_account_address_hash TEXT NOT NULL CHECK (canonical_account_address_hash ~ '^0x[0-9a-f]{64}$'),
  handoff_id TEXT NOT NULL,
  handoff_hash TEXT NOT NULL CHECK (handoff_hash ~ '^0x[0-9a-f]{64}$'),
  delegate_id TEXT NOT NULL,
  delegate_hash TEXT NOT NULL CHECK (delegate_hash ~ '^0x[0-9a-f]{64}$'),
  api_wallet_address_hash TEXT NOT NULL CHECK (api_wallet_address_hash ~ '^0x[0-9a-f]{64}$'),
  signer_reference_hash TEXT NOT NULL CHECK (signer_reference_hash ~ '^0x[0-9a-f]{64}$'),
  prepared_action_hash TEXT NOT NULL CHECK (prepared_action_hash ~ '^0x[0-9a-f]{64}$'),
  prepared_action JSONB NOT NULL CHECK (
    jsonb_typeof(prepared_action) = 'object'
    AND prepared_action->>'preparedActionHash' = prepared_action_hash
    AND prepared_action::TEXT !~* '"(privateKey|seedPhrase|credential|rawSignature|secret)"'
  ),
  policy_hash TEXT NOT NULL CHECK (policy_hash ~ '^0x[0-9a-f]{64}$'),
  metadata_hash TEXT NOT NULL CHECK (metadata_hash ~ '^0x[0-9a-f]{64}$'),
  risk_snapshot_hash TEXT NOT NULL CHECK (risk_snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  action_kind TEXT NOT NULL CHECK (
    action_kind IN ('order', 'reduceOnlyOrder', 'cancel', 'cancelByCloid', 'modify')
  ),
  market TEXT NOT NULL CHECK (market = 'BTC'),
  max_order_notional_usd TEXT NOT NULL CHECK (max_order_notional_usd = '10'),
  opening_time_in_force TEXT NOT NULL CHECK (opening_time_in_force = 'Alo'),
  nonce BIGINT NOT NULL CHECK (nonce > 0),
  founder_approval_id TEXT,
  founder_approval_hash TEXT CHECK (
    founder_approval_hash IS NULL OR founder_approval_hash ~ '^0x[0-9a-f]{64}$'
  ),
  human_confirmation_hash TEXT CHECK (
    human_confirmation_hash IS NULL OR human_confirmation_hash ~ '^0x[0-9a-f]{64}$'
  ),
  action_authorization_hash TEXT CHECK (
    action_authorization_hash IS NULL OR action_authorization_hash ~ '^0x[0-9a-f]{64}$'
  ),
  request_body_hash TEXT CHECK (
    request_body_hash IS NULL OR request_body_hash ~ '^0x[0-9a-f]{64}$'
  ),
  signature_hash TEXT CHECK (
    signature_hash IS NULL OR signature_hash ~ '^0x[0-9a-f]{64}$'
  ),
  claim_hash TEXT CHECK (claim_hash IS NULL OR claim_hash ~ '^0x[0-9a-f]{64}$'),
  disposition TEXT CHECK (disposition IS NULL OR disposition IN ('confirmed', 'rejected', 'unknown')),
  response_hash TEXT CHECK (response_hash IS NULL OR response_hash ~ '^0x[0-9a-f]{64}$'),
  reconciliation_hash TEXT CHECK (
    reconciliation_hash IS NULL OR reconciliation_hash ~ '^0x[0-9a-f]{64}$'
  ),
  venue_order_state_hash TEXT CHECK (
    venue_order_state_hash IS NULL OR venue_order_state_hash ~ '^0x[0-9a-f]{64}$'
  ),
  venue_account_state_hash TEXT CHECK (
    venue_account_state_hash IS NULL OR venue_account_state_hash ~ '^0x[0-9a-f]{64}$'
  ),
  ledger_state_hash TEXT CHECK (
    ledger_state_hash IS NULL OR ledger_state_hash ~ '^0x[0-9a-f]{64}$'
  ),
  obligation_evidence_hash TEXT CHECK (
    obligation_evidence_hash IS NULL OR obligation_evidence_hash ~ '^0x[0-9a-f]{64}$'
  ),
  signer_retirement_hash TEXT CHECK (
    signer_retirement_hash IS NULL OR signer_retirement_hash ~ '^0x[0-9a-f]{64}$'
  ),
  state TEXT NOT NULL CHECK (state IN (
    'PREPARED', 'APPROVED', 'SUBMITTING', 'SUBMITTED', 'REJECTED',
    'UNKNOWN', 'RECONCILED', 'CLOSED'
  )),
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 6),
  prepared_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > prepared_at),
  approved_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  external_submission_attempted BOOLEAN NOT NULL,
  retry_allowed BOOLEAN NOT NULL CHECK (retry_allowed = FALSE),
  raw_action_evidence_persisted BOOLEAN NOT NULL CHECK (raw_action_evidence_persisted = FALSE),
  raw_response_persisted BOOLEAN NOT NULL CHECK (raw_response_persisted = FALSE),
  raw_key_persisted BOOLEAN NOT NULL CHECK (raw_key_persisted = FALSE),
  raw_signature_persisted BOOLEAN NOT NULL CHECK (raw_signature_persisted = FALSE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  real_funds_authority BOOLEAN NOT NULL CHECK (real_funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_testnet_submission_attempt.v1'),
  CONSTRAINT hypercore_testnet_submission_attempts_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_testnet_submission_attempts_tenant_hash_key UNIQUE (tenant_id, execution_hash),
  CONSTRAINT hypercore_testnet_submission_attempts_tenant_economic_key UNIQUE (tenant_id, economic_action_hash),
  CONSTRAINT hypercore_testnet_submission_attempts_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key_hash),
  CONSTRAINT hypercore_testnet_submission_attempts_tenant_nonce_key UNIQUE (tenant_id, signer_reference_hash, nonce),
  CONSTRAINT hypercore_testnet_submission_attempts_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES trading_facilities(tenant_id, id),
  CONSTRAINT hypercore_testnet_submission_attempts_binding_fk
    FOREIGN KEY (tenant_id, account_binding_id) REFERENCES hypercore_account_bindings(tenant_id, id),
  CONSTRAINT hypercore_testnet_submission_attempts_handoff_fk
    FOREIGN KEY (tenant_id, handoff_id) REFERENCES hypercore_testnet_signer_handoffs(tenant_id, id),
  CONSTRAINT hypercore_testnet_submission_attempts_delegate_fk
    FOREIGN KEY (tenant_id, delegate_id) REFERENCES hypercore_api_wallet_delegates(tenant_id, id),
  CONSTRAINT hypercore_testnet_submission_attempts_lifecycle_check CHECK (
    (state = 'PREPARED' AND version = 1
      AND founder_approval_id IS NULL AND founder_approval_hash IS NULL
      AND human_confirmation_hash IS NULL AND action_authorization_hash IS NULL
      AND request_body_hash IS NULL AND signature_hash IS NULL AND claim_hash IS NULL
      AND disposition IS NULL AND response_hash IS NULL AND approved_at IS NULL
      AND claimed_at IS NULL AND resolved_at IS NULL AND reconciled_at IS NULL
      AND closed_at IS NULL AND external_submission_attempted = FALSE)
    OR
    (state = 'APPROVED' AND version = 2
      AND founder_approval_id IS NOT NULL AND founder_approval_hash IS NOT NULL
      AND human_confirmation_hash IS NOT NULL AND action_authorization_hash IS NULL
      AND request_body_hash IS NULL AND signature_hash IS NULL AND claim_hash IS NULL
      AND disposition IS NULL AND response_hash IS NULL AND approved_at IS NOT NULL
      AND claimed_at IS NULL AND resolved_at IS NULL AND reconciled_at IS NULL
      AND closed_at IS NULL AND external_submission_attempted = FALSE)
    OR
    (state = 'SUBMITTING' AND version = 3
      AND founder_approval_id IS NOT NULL AND founder_approval_hash IS NOT NULL
      AND human_confirmation_hash IS NOT NULL AND action_authorization_hash IS NOT NULL
      AND request_body_hash IS NOT NULL AND signature_hash IS NOT NULL AND claim_hash IS NOT NULL
      AND disposition IS NULL AND response_hash IS NULL AND approved_at IS NOT NULL
      AND claimed_at IS NOT NULL AND resolved_at IS NULL AND reconciled_at IS NULL
      AND closed_at IS NULL AND external_submission_attempted = TRUE)
    OR
    (state IN ('SUBMITTED', 'REJECTED', 'UNKNOWN') AND version = 4
      AND action_authorization_hash IS NOT NULL AND request_body_hash IS NOT NULL
      AND signature_hash IS NOT NULL AND claim_hash IS NOT NULL
      AND disposition = CASE state
        WHEN 'SUBMITTED' THEN 'confirmed'
        WHEN 'REJECTED' THEN 'rejected'
        ELSE 'unknown' END
      AND response_hash IS NOT NULL AND resolved_at IS NOT NULL
      AND reconciled_at IS NULL AND closed_at IS NULL
      AND external_submission_attempted = TRUE)
    OR
    (state = 'RECONCILED' AND version = 5
      AND disposition IS NOT NULL AND response_hash IS NOT NULL
      AND reconciliation_hash IS NOT NULL AND venue_order_state_hash IS NOT NULL
      AND venue_account_state_hash IS NOT NULL AND ledger_state_hash IS NOT NULL
      AND obligation_evidence_hash IS NOT NULL AND signer_retirement_hash IS NULL
      AND reconciled_at IS NOT NULL AND closed_at IS NULL
      AND external_submission_attempted = TRUE)
    OR
    (state = 'CLOSED' AND version = 6
      AND reconciliation_hash IS NOT NULL AND obligation_evidence_hash IS NOT NULL
      AND signer_retirement_hash IS NOT NULL AND reconciled_at IS NOT NULL
      AND closed_at IS NOT NULL AND external_submission_attempted = TRUE)
  )
);

CREATE TABLE hypercore_testnet_founder_approvals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  approval_hash TEXT NOT NULL CHECK (approval_hash ~ '^0x[0-9a-f]{64}$'),
  execution_id TEXT NOT NULL,
  execution_hash TEXT NOT NULL CHECK (execution_hash ~ '^0x[0-9a-f]{64}$'),
  economic_action_hash TEXT NOT NULL CHECK (economic_action_hash ~ '^0x[0-9a-f]{64}$'),
  actor_id TEXT NOT NULL,
  confirmation_nonce_hash TEXT NOT NULL CHECK (confirmation_nonce_hash ~ '^0x[0-9a-f]{64}$'),
  human_confirmation_hash TEXT NOT NULL CHECK (human_confirmation_hash ~ '^0x[0-9a-f]{64}$'),
  account_binding_hash TEXT NOT NULL CHECK (account_binding_hash ~ '^0x[0-9a-f]{64}$'),
  canonical_account_address_hash TEXT NOT NULL CHECK (canonical_account_address_hash ~ '^0x[0-9a-f]{64}$'),
  handoff_hash TEXT NOT NULL CHECK (handoff_hash ~ '^0x[0-9a-f]{64}$'),
  delegate_hash TEXT NOT NULL CHECK (delegate_hash ~ '^0x[0-9a-f]{64}$'),
  api_wallet_address_hash TEXT NOT NULL CHECK (api_wallet_address_hash ~ '^0x[0-9a-f]{64}$'),
  signer_reference_hash TEXT NOT NULL CHECK (signer_reference_hash ~ '^0x[0-9a-f]{64}$'),
  prepared_action_hash TEXT NOT NULL CHECK (prepared_action_hash ~ '^0x[0-9a-f]{64}$'),
  policy_hash TEXT NOT NULL CHECK (policy_hash ~ '^0x[0-9a-f]{64}$'),
  metadata_hash TEXT NOT NULL CHECK (metadata_hash ~ '^0x[0-9a-f]{64}$'),
  risk_snapshot_hash TEXT NOT NULL CHECK (risk_snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  action_kind TEXT NOT NULL CHECK (action_kind IN ('order', 'reduceOnlyOrder', 'cancel', 'cancelByCloid', 'modify')),
  market TEXT NOT NULL CHECK (market = 'BTC'),
  max_order_notional_usd TEXT NOT NULL CHECK (max_order_notional_usd = '10'),
  opening_time_in_force TEXT NOT NULL CHECK (opening_time_in_force = 'Alo'),
  nonce BIGINT NOT NULL CHECK (nonce > 0),
  status TEXT NOT NULL CHECK (status IN ('APPROVED', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  approved_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > approved_at),
  consumed_at TIMESTAMPTZ,
  version BIGINT NOT NULL CHECK (version IN (1, 2)),
  exact_execution_only BOOLEAN NOT NULL CHECK (exact_execution_only = TRUE),
  one_use BOOLEAN NOT NULL CHECK (one_use = TRUE),
  mainnet_authority BOOLEAN NOT NULL CHECK (mainnet_authority = FALSE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  real_funds_authority BOOLEAN NOT NULL CHECK (real_funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_testnet_founder_approval.v1'),
  CONSTRAINT hypercore_testnet_founder_approvals_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_testnet_founder_approvals_tenant_hash_key UNIQUE (tenant_id, approval_hash),
  CONSTRAINT hypercore_testnet_founder_approvals_tenant_execution_key UNIQUE (tenant_id, execution_id),
  CONSTRAINT hypercore_testnet_founder_approvals_tenant_nonce_key UNIQUE (tenant_id, confirmation_nonce_hash),
  CONSTRAINT hypercore_testnet_founder_approvals_execution_fk
    FOREIGN KEY (tenant_id, execution_id)
    REFERENCES hypercore_testnet_submission_attempts(tenant_id, id),
  CONSTRAINT hypercore_testnet_founder_approvals_state_check CHECK (
    (status = 'APPROVED' AND version = 1 AND consumed_at IS NULL)
    OR
    (status = 'CONSUMED' AND version = 2 AND consumed_at IS NOT NULL)
    OR
    (status IN ('EXPIRED', 'REVOKED') AND version = 2 AND consumed_at IS NULL)
  )
);

ALTER TABLE hypercore_testnet_submission_attempts
  ADD CONSTRAINT hypercore_testnet_submission_attempts_approval_fk
  FOREIGN KEY (tenant_id, founder_approval_id)
  REFERENCES hypercore_testnet_founder_approvals(tenant_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE hypercore_testnet_submission_transitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  execution_id TEXT NOT NULL,
  execution_hash TEXT NOT NULL CHECK (execution_hash ~ '^0x[0-9a-f]{64}$'),
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 8),
  previous_state TEXT,
  next_state TEXT NOT NULL CHECK (next_state IN (
    'PREPARED', 'APPROVED', 'SUBMITTING', 'SUBMITTED', 'REJECTED',
    'UNKNOWN', 'RECONCILED', 'CLOSED'
  )),
  transition_hash TEXT NOT NULL CHECK (transition_hash ~ '^0x[0-9a-f]{64}$'),
  result_hash TEXT CHECK (result_hash IS NULL OR result_hash ~ '^0x[0-9a-f]{64}$'),
  changed_at TIMESTAMPTZ NOT NULL,
  retry_allowed BOOLEAN NOT NULL CHECK (retry_allowed = FALSE),
  secrets_included BOOLEAN NOT NULL CHECK (secrets_included = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'hypercore_testnet_submission_transition.v1'),
  CONSTRAINT hypercore_testnet_submission_transitions_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT hypercore_testnet_submission_transitions_tenant_execution_sequence_key UNIQUE (tenant_id, execution_id, sequence),
  CONSTRAINT hypercore_testnet_submission_transitions_tenant_hash_key UNIQUE (tenant_id, transition_hash),
  CONSTRAINT hypercore_testnet_submission_transitions_execution_fk
    FOREIGN KEY (tenant_id, execution_id)
    REFERENCES hypercore_testnet_submission_attempts(tenant_id, id)
);

CREATE FUNCTION guard_hypercore_testnet_signer_handoff()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HyperCore Testnet signer handoffs cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.account_binding_id, NEW.account_binding_hash,
    NEW.canonical_account_address_hash, NEW.delegate_id, NEW.delegate_hash,
    NEW.api_wallet_address_hash, NEW.signer_reference_hash,
    NEW.registration_evidence_hash, NEW.verified_at, NEW.expires_at,
    NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.account_binding_id, OLD.account_binding_hash,
    OLD.canonical_account_address_hash, OLD.delegate_id, OLD.delegate_hash,
    OLD.api_wallet_address_hash, OLD.signer_reference_hash,
    OLD.registration_evidence_hash, OLD.verified_at, OLD.expires_at,
    OLD.schema_version
  ) OR OLD.status <> 'VERIFIED' OR NEW.status <> 'RETIRED'
     OR NEW.version <> 2 OR OLD.version <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HyperCore Testnet signer handoff transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION assert_hypercore_testnet_retired_handoff_tombstone()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'RETIRED' AND NOT EXISTS (
    SELECT 1 FROM hypercore_delegate_tombstones t
     WHERE t.tenant_id = NEW.tenant_id
       AND t.delegate_id = NEW.delegate_id
       AND t.api_wallet_address_hash = NEW.api_wallet_address_hash
       AND t.terminal_status IN ('REVOKED', 'RETIRED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'retired Testnet signer requires a durable delegate tombstone';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_hypercore_testnet_nonce_head()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' OR ROW(
    NEW.tenant_id, NEW.id, NEW.handoff_id, NEW.signer_reference_hash,
    NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.handoff_id, OLD.signer_reference_hash,
    OLD.schema_version
  ) OR NEW.last_nonce <= OLD.last_nonce OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HyperCore Testnet nonce transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_hypercore_testnet_founder_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Founder Testnet approvals cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.approval_hash, NEW.execution_id,
    NEW.execution_hash, NEW.economic_action_hash, NEW.actor_id,
    NEW.confirmation_nonce_hash, NEW.human_confirmation_hash,
    NEW.account_binding_hash, NEW.canonical_account_address_hash,
    NEW.handoff_hash, NEW.delegate_hash, NEW.api_wallet_address_hash,
    NEW.signer_reference_hash, NEW.prepared_action_hash, NEW.policy_hash,
    NEW.metadata_hash, NEW.risk_snapshot_hash, NEW.action_kind, NEW.market,
    NEW.max_order_notional_usd, NEW.opening_time_in_force, NEW.nonce,
    NEW.approved_at, NEW.expires_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.approval_hash, OLD.execution_id,
    OLD.execution_hash, OLD.economic_action_hash, OLD.actor_id,
    OLD.confirmation_nonce_hash, OLD.human_confirmation_hash,
    OLD.account_binding_hash, OLD.canonical_account_address_hash,
    OLD.handoff_hash, OLD.delegate_hash, OLD.api_wallet_address_hash,
    OLD.signer_reference_hash, OLD.prepared_action_hash, OLD.policy_hash,
    OLD.metadata_hash, OLD.risk_snapshot_hash, OLD.action_kind, OLD.market,
    OLD.max_order_notional_usd, OLD.opening_time_in_force, OLD.nonce,
    OLD.approved_at, OLD.expires_at, OLD.schema_version
  ) OR OLD.status <> 'APPROVED' OR NEW.status NOT IN ('CONSUMED', 'EXPIRED', 'REVOKED')
     OR NEW.version <> 2 OR OLD.version <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Founder Testnet approval transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_hypercore_testnet_submission_attempt()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HyperCore Testnet attempts cannot be deleted';
  END IF;
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.execution_hash, NEW.economic_action_hash,
    NEW.idempotency_key_hash, NEW.facility_id, NEW.account_binding_id,
    NEW.account_binding_hash, NEW.canonical_account_address_hash,
    NEW.handoff_id, NEW.handoff_hash, NEW.delegate_id, NEW.delegate_hash,
    NEW.api_wallet_address_hash, NEW.signer_reference_hash,
    NEW.prepared_action_hash, NEW.prepared_action, NEW.policy_hash,
    NEW.metadata_hash, NEW.risk_snapshot_hash, NEW.action_kind, NEW.market,
    NEW.max_order_notional_usd, NEW.opening_time_in_force, NEW.nonce,
    NEW.prepared_at, NEW.expires_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.execution_hash, OLD.economic_action_hash,
    OLD.idempotency_key_hash, OLD.facility_id, OLD.account_binding_id,
    OLD.account_binding_hash, OLD.canonical_account_address_hash,
    OLD.handoff_id, OLD.handoff_hash, OLD.delegate_id, OLD.delegate_hash,
    OLD.api_wallet_address_hash, OLD.signer_reference_hash,
    OLD.prepared_action_hash, OLD.prepared_action, OLD.policy_hash,
    OLD.metadata_hash, OLD.risk_snapshot_hash, OLD.action_kind, OLD.market,
    OLD.max_order_notional_usd, OLD.opening_time_in_force, OLD.nonce,
    OLD.prepared_at, OLD.expires_at, OLD.schema_version
  ) OR NEW.version <> OLD.version + 1 OR NOT (
    (OLD.state = 'PREPARED' AND NEW.state = 'APPROVED') OR
    (OLD.state = 'APPROVED' AND NEW.state = 'SUBMITTING') OR
    (OLD.state = 'SUBMITTING' AND NEW.state IN ('SUBMITTED', 'REJECTED', 'UNKNOWN')) OR
    (OLD.state IN ('SUBMITTED', 'REJECTED', 'UNKNOWN') AND NEW.state = 'RECONCILED') OR
    (OLD.state = 'RECONCILED' AND NEW.state = 'CLOSED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HyperCore Testnet attempt transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_immutable_hypercore_testnet_submission_transition()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HyperCore Testnet submission transitions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hypercore_testnet_signer_handoffs_transition_guard
BEFORE UPDATE OR DELETE ON hypercore_testnet_signer_handoffs
FOR EACH ROW EXECUTE FUNCTION guard_hypercore_testnet_signer_handoff();
CREATE CONSTRAINT TRIGGER hypercore_testnet_retired_handoff_tombstone_guard
AFTER UPDATE ON hypercore_testnet_signer_handoffs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_hypercore_testnet_retired_handoff_tombstone();
CREATE TRIGGER hypercore_testnet_nonce_heads_transition_guard
BEFORE UPDATE OR DELETE ON hypercore_testnet_nonce_heads
FOR EACH ROW EXECUTE FUNCTION guard_hypercore_testnet_nonce_head();
CREATE TRIGGER hypercore_testnet_founder_approvals_transition_guard
BEFORE UPDATE OR DELETE ON hypercore_testnet_founder_approvals
FOR EACH ROW EXECUTE FUNCTION guard_hypercore_testnet_founder_approval();
CREATE TRIGGER hypercore_testnet_submission_attempts_transition_guard
BEFORE UPDATE OR DELETE ON hypercore_testnet_submission_attempts
FOR EACH ROW EXECUTE FUNCTION guard_hypercore_testnet_submission_attempt();
CREATE TRIGGER hypercore_testnet_submission_transitions_immutable_guard
BEFORE UPDATE OR DELETE ON hypercore_testnet_submission_transitions
FOR EACH ROW EXECUTE FUNCTION guard_immutable_hypercore_testnet_submission_transition();

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hypercore_testnet_signer_handoffs',
    'hypercore_testnet_nonce_heads',
    'hypercore_testnet_submission_attempts',
    'hypercore_testnet_founder_approvals',
    'hypercore_testnet_submission_transitions'
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

CREATE INDEX hypercore_testnet_submission_attempts_tenant_state_idx
  ON hypercore_testnet_submission_attempts(tenant_id, state, prepared_at, id);
CREATE UNIQUE INDEX hypercore_testnet_submission_attempts_tenant_claim_key
  ON hypercore_testnet_submission_attempts(tenant_id, claim_hash)
  WHERE claim_hash IS NOT NULL;
CREATE INDEX hypercore_testnet_submission_attempts_tenant_binding_idx
  ON hypercore_testnet_submission_attempts(tenant_id, account_binding_id, prepared_at, id);
CREATE INDEX hypercore_testnet_submission_transitions_tenant_execution_idx
  ON hypercore_testnet_submission_transitions(tenant_id, execution_id, sequence);
