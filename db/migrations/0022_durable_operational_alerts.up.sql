CREATE TYPE operational_alert_status AS ENUM ('open', 'acknowledged', 'resolved');
CREATE TYPE operational_synthetic_status AS ENUM ('passed', 'failed');

CREATE TABLE operational_alerts (
  id TEXT NOT NULL CHECK (id ~ '^operational_alert_[0-9a-f]{64}$'),
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  alert_fingerprint TEXT NOT NULL CHECK (alert_fingerprint ~ '^0x[0-9a-f]{64}$'),
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'data_integrity_incident', 'chain_finality_incident', 'break_glass_incident',
    'admission_control_incident', 'lifecycle_availability_incident',
    'servicing_default_case', 'servicing_writeoff_review'
  )),
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'reconciliation_failed', 'chain_payment_invalidated', 'break_glass_activated',
    'admission_control_unavailable', 'synthetic_lifecycle_failed',
    'servicing_defaulted', 'servicing_written_off'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  route TEXT NOT NULL CHECK (route IN ('page', 'operations_queue', 'risk_queue')),
  owner_role TEXT NOT NULL CHECK (length(owner_role) BETWEEN 2 AND 96),
  readiness_effect TEXT NOT NULL CHECK (readiness_effect IN ('fail_closed', 'review_required', 'observe')),
  runbook_ref TEXT NOT NULL CHECK (runbook_ref ~ '^OPS-RUNBOOK-[A-Z0-9-]{3,80}$'),
  action_codes JSONB NOT NULL CHECK (
    jsonb_typeof(action_codes) = 'array'
    AND jsonb_array_length(action_codes) BETWEEN 1 AND 8
  ),
  scope_ref_hash TEXT NOT NULL CHECK (scope_ref_hash ~ '^0x[0-9a-f]{64}$'),
  occurrence_count BIGINT NOT NULL CHECK (occurrence_count BETWEEN 1 AND 9223372036854775807),
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  evidence_ref_hashes JSONB NOT NULL CHECK (
    jsonb_typeof(evidence_ref_hashes) = 'array'
    AND jsonb_array_length(evidence_ref_hashes) BETWEEN 1 AND 32
  ),
  evidence_truncated BOOLEAN NOT NULL,
  status operational_alert_status NOT NULL DEFAULT 'open',
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_ref_hash TEXT CHECK (
    acknowledged_by_ref_hash IS NULL OR acknowledged_by_ref_hash ~ '^0x[0-9a-f]{64}$'
  ),
  resolved_at TIMESTAMPTZ,
  resolved_by_ref_hash TEXT CHECK (
    resolved_by_ref_hash IS NULL OR resolved_by_ref_hash ~ '^0x[0-9a-f]{64}$'
  ),
  resolution_code TEXT CHECK (
    resolution_code IS NULL OR resolution_code ~ '^[a-z][a-z0-9_]{1,95}$'
  ),
  delivery_status TEXT NOT NULL CHECK (delivery_status = 'unconfigured'),
  requires_named_owner BOOLEAN NOT NULL CHECK (requires_named_owner = TRUE),
  automatic_action_taken BOOLEAN NOT NULL CHECK (automatic_action_taken = FALSE),
  production_release_authority BOOLEAN NOT NULL CHECK (production_release_authority = FALSE),
  environment TEXT NOT NULL CHECK (environment = 'closed-pilot'),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  policy_version TEXT NOT NULL CHECK (policy_version = 'ops_001b.v1'),
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 9223372036854775807),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'operational_alert_state.v1'),
  CONSTRAINT operational_alerts_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT operational_alerts_tenant_fingerprint_key UNIQUE (tenant_id, alert_fingerprint),
  CONSTRAINT operational_alerts_time_check CHECK (last_observed_at >= first_observed_at),
  CONSTRAINT operational_alerts_lifecycle_check CHECK (
    (status = 'open' AND acknowledged_at IS NULL AND acknowledged_by_ref_hash IS NULL
      AND resolved_at IS NULL AND resolved_by_ref_hash IS NULL AND resolution_code IS NULL)
    OR (status = 'acknowledged' AND acknowledged_at IS NOT NULL AND acknowledged_by_ref_hash IS NOT NULL
      AND resolved_at IS NULL AND resolved_by_ref_hash IS NULL AND resolution_code IS NULL)
    OR (status = 'resolved' AND acknowledged_at IS NOT NULL AND acknowledged_by_ref_hash IS NOT NULL
      AND resolved_at IS NOT NULL AND resolved_by_ref_hash IS NOT NULL AND resolution_code IS NOT NULL
      AND resolved_at >= acknowledged_at)
  )
);

CREATE TABLE operational_alert_occurrences (
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  source_ref_hash TEXT NOT NULL CHECK (source_ref_hash ~ '^0x[0-9a-f]{64}$'),
  alert_id TEXT NOT NULL,
  source_system TEXT NOT NULL CHECK (source_system IN (
    'ipo.one.credit-events.v1', 'ipo.one.evidence.v2',
    'ipo.one.abuse-telemetry.v1', 'ipo.one.synthetic-monitor.v1'
  )),
  source_event_type TEXT NOT NULL CHECK (source_event_type ~ '^[a-z][a-z0-9_.-]+$'),
  observed_at TIMESTAMPTZ NOT NULL,
  evidence_event_id TEXT NOT NULL,
  policy_version TEXT NOT NULL CHECK (policy_version = 'ops_001b.v1'),
  schema_version TEXT NOT NULL CHECK (schema_version = 'operational_alert_occurrence.v1'),
  CONSTRAINT operational_alert_occurrences_pkey PRIMARY KEY (tenant_id, source_ref_hash),
  CONSTRAINT operational_alert_occurrences_alert_fk
    FOREIGN KEY (tenant_id, alert_id) REFERENCES operational_alerts(tenant_id, id),
  CONSTRAINT operational_alert_occurrences_event_fk
    FOREIGN KEY (tenant_id, evidence_event_id) REFERENCES domain_events(tenant_id, id)
);

CREATE TABLE operational_synthetic_runs (
  id TEXT NOT NULL CHECK (id ~ '^synthetic_run_[0-9a-f]{64}$'),
  tenant_id TEXT NOT NULL DEFAULT current_app_tenant_id() REFERENCES tenants(id),
  tenant_ref_hash TEXT NOT NULL CHECK (tenant_ref_hash ~ '^0x[0-9a-f]{64}$'),
  check_id_hash TEXT NOT NULL CHECK (check_id_hash ~ '^0x[0-9a-f]{64}$'),
  release TEXT NOT NULL CHECK (release ~ '^[0-9a-f]{40}$'),
  status operational_synthetic_status NOT NULL,
  completed_stages JSONB NOT NULL CHECK (
    jsonb_typeof(completed_stages) = 'array' AND jsonb_array_length(completed_stages) <= 8
  ),
  evidence_refs JSONB NOT NULL CHECK (
    jsonb_typeof(evidence_refs) = 'array' AND jsonb_array_length(evidence_refs) <= 8
  ),
  reconciliation_summary_hash TEXT CHECK (
    reconciliation_summary_hash IS NULL OR reconciliation_summary_hash ~ '^0x[0-9a-f]{64}$'
  ),
  failure_stage TEXT CHECK (failure_stage IS NULL OR failure_stage IN (
    'human_offer', 'agent_offer', 'offer_parity', 'human_obligation',
    'agent_obligation', 'receipt_linkage', 'obligation_parity', 'reconciliation'
  )),
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code ~ '^[a-z][a-z0-9_]{1,95}$'),
  result_hash TEXT NOT NULL CHECK (result_hash ~ '^0x[0-9a-f]{64}$'),
  evidence_event_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  non_authorizing BOOLEAN NOT NULL CHECK (non_authorizing = TRUE),
  sandbox_only BOOLEAN NOT NULL CHECK (sandbox_only = TRUE),
  production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE),
  credentials_included BOOLEAN NOT NULL CHECK (credentials_included = FALSE),
  public_endpoint_enabled BOOLEAN NOT NULL CHECK (public_endpoint_enabled = FALSE),
  notification_delivered BOOLEAN NOT NULL CHECK (notification_delivered = FALSE),
  policy_version TEXT NOT NULL CHECK (policy_version = 'ops_001c.v1'),
  schema_version TEXT NOT NULL CHECK (schema_version = 'dual_native_lifecycle_synthetic_result.v1'),
  CONSTRAINT operational_synthetic_runs_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT operational_synthetic_runs_result_key UNIQUE (tenant_id, result_hash),
  CONSTRAINT operational_synthetic_runs_event_fk
    FOREIGN KEY (tenant_id, evidence_event_id) REFERENCES domain_events(tenant_id, id),
  CONSTRAINT operational_synthetic_runs_time_check CHECK (completed_at >= started_at),
  CONSTRAINT operational_synthetic_runs_outcome_check CHECK (
    (status = 'passed' AND reconciliation_summary_hash IS NOT NULL
      AND failure_stage IS NULL AND failure_code IS NULL)
    OR (status = 'failed' AND reconciliation_summary_hash IS NULL
      AND failure_stage IS NOT NULL AND failure_code IS NOT NULL)
  )
);

CREATE FUNCTION protect_operational_alert_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.alert_fingerprint, NEW.alert_type, NEW.signal_type,
    NEW.severity, NEW.route, NEW.owner_role, NEW.readiness_effect, NEW.runbook_ref,
    NEW.action_codes, NEW.scope_ref_hash, NEW.delivery_status,
    NEW.requires_named_owner, NEW.automatic_action_taken,
    NEW.production_release_authority, NEW.environment, NEW.sandbox_only,
    NEW.production_funds_moved, NEW.policy_version, NEW.created_at, NEW.schema_version
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.alert_fingerprint, OLD.alert_type, OLD.signal_type,
    OLD.severity, OLD.route, OLD.owner_role, OLD.readiness_effect, OLD.runbook_ref,
    OLD.action_codes, OLD.scope_ref_hash, OLD.delivery_status,
    OLD.requires_named_owner, OLD.automatic_action_taken,
    OLD.production_release_authority, OLD.environment, OLD.sandbox_only,
    OLD.production_funds_moved, OLD.policy_version, OLD.created_at, OLD.schema_version
  ) THEN
    RAISE EXCEPTION 'operational alert identity and safety policy are immutable';
  END IF;
  IF NEW.version <> OLD.version + 1
     OR NEW.occurrence_count < OLD.occurrence_count
     OR NEW.first_observed_at > OLD.first_observed_at
     OR NEW.last_observed_at < OLD.last_observed_at
     OR (OLD.evidence_truncated AND NOT NEW.evidence_truncated)
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'operational alert observation transition is invalid';
  END IF;
  IF NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'open' AND NEW.status = 'acknowledged')
    OR (OLD.status = 'open' AND NEW.status = 'resolved')
    OR (OLD.status = 'acknowledged' AND NEW.status = 'resolved')
  ) THEN
    RAISE EXCEPTION 'operational alert lifecycle transition is invalid';
  END IF;
  IF OLD.acknowledged_at IS NOT NULL AND (
    NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
    OR NEW.acknowledged_by_ref_hash IS DISTINCT FROM OLD.acknowledged_by_ref_hash
  ) THEN
    RAISE EXCEPTION 'operational alert acknowledgement is immutable';
  END IF;
  IF OLD.resolved_at IS NOT NULL AND (
    NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
    OR NEW.resolved_by_ref_hash IS DISTINCT FROM OLD.resolved_by_ref_hash
    OR NEW.resolution_code IS DISTINCT FROM OLD.resolution_code
  ) THEN
    RAISE EXCEPTION 'operational alert resolution is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operational_alerts_transition_guard
BEFORE UPDATE ON operational_alerts
FOR EACH ROW EXECUTE FUNCTION protect_operational_alert_transition();

CREATE TRIGGER operational_alerts_delete_guard
BEFORE DELETE ON operational_alerts
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER operational_alert_occurrences_immutable
BEFORE UPDATE OR DELETE ON operational_alert_occurrences
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER operational_synthetic_runs_immutable
BEFORE UPDATE OR DELETE ON operational_synthetic_runs
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE INDEX operational_alerts_tenant_route_status_idx
  ON operational_alerts (tenant_id, status, route, severity, last_observed_at DESC, id);
CREATE INDEX operational_alert_occurrences_tenant_observed_idx
  ON operational_alert_occurrences (tenant_id, alert_id, observed_at DESC, source_ref_hash);
CREATE INDEX operational_synthetic_runs_tenant_completed_idx
  ON operational_synthetic_runs (tenant_id, check_id_hash, completed_at DESC, id);

DO $$
DECLARE
  table_name TEXT;
  operational_tables CONSTANT TEXT[] := ARRAY[
    'operational_alerts', 'operational_alert_occurrences', 'operational_synthetic_runs'
  ];
BEGIN
  FOREACH table_name IN ARRAY operational_tables LOOP
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
