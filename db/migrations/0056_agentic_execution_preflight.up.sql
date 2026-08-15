CREATE TABLE wallet_prepared_executions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  prepared_execution_hash TEXT NOT NULL CHECK (prepared_execution_hash ~ '^0x[0-9a-f]{64}$'),
  transfer_intent_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  target_policy_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  authorization_hash TEXT NOT NULL CHECK (authorization_hash ~ '^0x[0-9a-f]{64}$'),
  exact_payload_hash TEXT NOT NULL CHECK (exact_payload_hash ~ '^0x[0-9a-f]{64}$'),
  chain_id TEXT NOT NULL CHECK (chain_id IN ('eip155:84532', 'eip155:1952')),
  target_address TEXT NOT NULL CHECK (target_address ~ '^0x[0-9a-f]{40}$'),
  function_selector TEXT NOT NULL CHECK (function_selector ~ '^0x[0-9a-f]{8}$'),
  event_id TEXT NOT NULL,
  prepared_execution JSONB NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > valid_from),
  transactions_allowed BOOLEAN NOT NULL CHECK (transactions_allowed = FALSE),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'prepared_execution.v1'),
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT wallet_prepared_executions_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT wallet_prepared_executions_tenant_hash_key UNIQUE (tenant_id, prepared_execution_hash),
  CONSTRAINT wallet_prepared_executions_tenant_payload_key UNIQUE (tenant_id, exact_payload_hash),
  CONSTRAINT wallet_prepared_executions_grant_fk
    FOREIGN KEY (tenant_id, grant_id) REFERENCES delegated_wallet_grants(tenant_id, id),
  CONSTRAINT wallet_prepared_executions_policy_fk
    FOREIGN KEY (tenant_id, target_policy_id) REFERENCES execution_target_policies(tenant_id, id),
  CONSTRAINT wallet_prepared_executions_reservation_fk
    FOREIGN KEY (tenant_id, reservation_id) REFERENCES delegated_wallet_pending_exposures(tenant_id, id),
  CONSTRAINT wallet_prepared_executions_event_fk
    FOREIGN KEY (tenant_id, event_id) REFERENCES domain_events(tenant_id, id),
  CONSTRAINT wallet_prepared_executions_record_check CHECK (
    prepared_execution->>'executionId' = id
    AND prepared_execution->>'preparedExecutionHash' = prepared_execution_hash
    AND prepared_execution->>'transferIntentId' = transfer_intent_id
    AND prepared_execution->>'grantId' = grant_id
    AND prepared_execution->>'targetPolicyId' = target_policy_id
    AND prepared_execution->>'reservationId' = reservation_id
    AND prepared_execution->>'authorizationHash' = authorization_hash
    AND prepared_execution->'payload'->>'exactPayloadHash' = exact_payload_hash
    AND prepared_execution->'payload'->>'chainId' = chain_id
    AND prepared_execution->'payload'->>'targetAddress' = target_address
    AND prepared_execution->'payload'->>'functionSelector' = function_selector
    AND (prepared_execution->>'transactionsAllowed')::BOOLEAN = transactions_allowed
    AND (prepared_execution->>'sandboxOnly')::BOOLEAN = sandbox_only
    AND (prepared_execution->>'productionAuthority')::BOOLEAN = production_authority
    AND (prepared_execution->>'fundsAuthority')::BOOLEAN = funds_authority
    AND prepared_execution->>'schemaVersion' = schema_version
  )
);

CREATE TABLE wallet_simulation_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  simulation_hash TEXT NOT NULL CHECK (simulation_hash ~ '^0x[0-9a-f]{64}$'),
  execution_id TEXT NOT NULL,
  exact_payload_hash TEXT NOT NULL CHECK (exact_payload_hash ~ '^0x[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'reverted', 'unavailable')),
  chain_id TEXT NOT NULL CHECK (chain_id IN ('eip155:84532', 'eip155:1952')),
  block_number NUMERIC(20,0) NOT NULL CHECK (block_number >= 0),
  block_hash TEXT NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  observed_code_hash TEXT NOT NULL CHECK (observed_code_hash ~ '^0x[0-9a-f]{64}$'),
  observed_proxy_implementation_hash TEXT CHECK (
    observed_proxy_implementation_hash IS NULL
    OR observed_proxy_implementation_hash ~ '^0x[0-9a-f]{64}$'
  ),
  simulated_effects_hash TEXT NOT NULL CHECK (simulated_effects_hash ~ '^0x[0-9a-f]{64}$'),
  report JSONB NOT NULL,
  simulated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > simulated_at),
  external_call_performed BOOLEAN NOT NULL CHECK (external_call_performed = FALSE),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'simulation_report.v1'),
  CONSTRAINT wallet_simulation_reports_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT wallet_simulation_reports_tenant_hash_key UNIQUE (tenant_id, simulation_hash),
  CONSTRAINT wallet_simulation_reports_execution_fk
    FOREIGN KEY (tenant_id, execution_id) REFERENCES wallet_prepared_executions(tenant_id, id),
  CONSTRAINT wallet_simulation_reports_record_check CHECK (
    report->>'simulationReportId' = id
    AND report->>'simulationHash' = simulation_hash
    AND report->>'executionId' = execution_id
    AND report->>'exactPayloadHash' = exact_payload_hash
    AND report->>'status' = status
    AND report->>'chainId' = chain_id
    AND (report->>'blockNumber')::NUMERIC = block_number
    AND report->>'blockHash' = block_hash
    AND report->>'observedCodeHash' = observed_code_hash
    AND report->'simulatedEffects'->>'effectsHash' = simulated_effects_hash
    AND (report->>'externalCallPerformed')::BOOLEAN = external_call_performed
    AND (report->>'sandboxOnly')::BOOLEAN = sandbox_only
    AND (report->>'productionAuthority')::BOOLEAN = production_authority
    AND (report->>'fundsAuthority')::BOOLEAN = funds_authority
    AND report->>'schemaVersion' = schema_version
  )
);

CREATE TABLE wallet_transaction_preflight_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  preflight_hash TEXT NOT NULL CHECK (preflight_hash ~ '^0x[0-9a-f]{64}$'),
  execution_id TEXT NOT NULL,
  simulation_report_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  reservation_hash TEXT NOT NULL CHECK (reservation_hash ~ '^0x[0-9a-f]{64}$'),
  exact_payload_hash TEXT NOT NULL CHECK (exact_payload_hash ~ '^0x[0-9a-f]{64}$'),
  decision TEXT NOT NULL CHECK (decision IN ('ALLOW', 'STEP_UP', 'DENY', 'QUARANTINE')),
  reason_codes JSONB NOT NULL CHECK (
    jsonb_typeof(reason_codes) = 'array'
    AND jsonb_array_length(reason_codes) BETWEEN 1 AND 32
  ),
  event_id TEXT NOT NULL,
  receipt JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at),
  transactions_allowed BOOLEAN NOT NULL CHECK (transactions_allowed = FALSE),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_authority BOOLEAN NOT NULL CHECK (production_authority = FALSE),
  funds_authority BOOLEAN NOT NULL CHECK (funds_authority = FALSE),
  schema_version TEXT NOT NULL CHECK (schema_version = 'transaction_preflight_receipt.v1'),
  CONSTRAINT wallet_transaction_preflight_receipts_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT wallet_transaction_preflight_receipts_tenant_hash_key UNIQUE (tenant_id, preflight_hash),
  CONSTRAINT wallet_transaction_preflight_receipts_execution_hash_key
    UNIQUE (tenant_id, execution_id, preflight_hash),
  CONSTRAINT wallet_transaction_preflight_receipts_execution_fk
    FOREIGN KEY (tenant_id, execution_id) REFERENCES wallet_prepared_executions(tenant_id, id),
  CONSTRAINT wallet_transaction_preflight_receipts_simulation_fk
    FOREIGN KEY (tenant_id, simulation_report_id) REFERENCES wallet_simulation_reports(tenant_id, id),
  CONSTRAINT wallet_transaction_preflight_receipts_grant_fk
    FOREIGN KEY (tenant_id, grant_id) REFERENCES delegated_wallet_grants(tenant_id, id),
  CONSTRAINT wallet_transaction_preflight_receipts_event_fk
    FOREIGN KEY (tenant_id, event_id) REFERENCES domain_events(tenant_id, id),
  CONSTRAINT wallet_transaction_preflight_receipts_record_check CHECK (
    receipt->>'preflightReceiptId' = id
    AND receipt->>'preflightHash' = preflight_hash
    AND receipt->>'executionId' = execution_id
    AND receipt->'simulationSnapshot'->>'simulationReportId' = simulation_report_id
    AND receipt->>'grantId' = grant_id
    AND receipt->>'reservationHash' = reservation_hash
    AND receipt->>'exactPayloadHash' = exact_payload_hash
    AND receipt->>'decision' = decision
    AND receipt->'reasonCodes' = reason_codes
    AND (receipt->>'transactionsAllowed')::BOOLEAN = transactions_allowed
    AND (receipt->>'sandboxOnly')::BOOLEAN = sandbox_only
    AND (receipt->>'productionAuthority')::BOOLEAN = production_authority
    AND (receipt->>'fundsAuthority')::BOOLEAN = funds_authority
    AND receipt->>'schemaVersion' = schema_version
  )
);

CREATE FUNCTION guard_immutable_wallet_preflight_record()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'wallet preflight records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_prepared_executions_immutable_guard
BEFORE UPDATE OR DELETE ON wallet_prepared_executions
FOR EACH ROW EXECUTE FUNCTION guard_immutable_wallet_preflight_record();
CREATE TRIGGER wallet_simulation_reports_immutable_guard
BEFORE UPDATE OR DELETE ON wallet_simulation_reports
FOR EACH ROW EXECUTE FUNCTION guard_immutable_wallet_preflight_record();
CREATE TRIGGER wallet_transaction_preflight_receipts_immutable_guard
BEFORE UPDATE OR DELETE ON wallet_transaction_preflight_receipts
FOR EACH ROW EXECUTE FUNCTION guard_immutable_wallet_preflight_record();

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'wallet_prepared_executions',
    'wallet_simulation_reports',
    'wallet_transaction_preflight_receipts'
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

CREATE INDEX wallet_prepared_executions_tenant_grant_created_idx
  ON wallet_prepared_executions(tenant_id, grant_id, created_at, id);
CREATE INDEX wallet_prepared_executions_tenant_intent_created_idx
  ON wallet_prepared_executions(tenant_id, transfer_intent_id, created_at, id);
CREATE INDEX wallet_simulation_reports_tenant_execution_created_idx
  ON wallet_simulation_reports(tenant_id, execution_id, simulated_at, id);
CREATE INDEX wallet_transaction_preflight_receipts_tenant_execution_created_idx
  ON wallet_transaction_preflight_receipts(tenant_id, execution_id, created_at, id);
