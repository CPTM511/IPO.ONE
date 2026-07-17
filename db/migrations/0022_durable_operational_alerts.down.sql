DROP INDEX IF EXISTS operational_synthetic_runs_tenant_completed_idx;
DROP INDEX IF EXISTS operational_alert_occurrences_tenant_observed_idx;
DROP INDEX IF EXISTS operational_alerts_tenant_route_status_idx;

DROP TRIGGER IF EXISTS tenant_context_guard_operational_synthetic_runs ON operational_synthetic_runs;
DROP TRIGGER IF EXISTS tenant_context_guard_operational_alert_occurrences ON operational_alert_occurrences;
DROP TRIGGER IF EXISTS tenant_context_guard_operational_alerts ON operational_alerts;
DROP TRIGGER IF EXISTS operational_synthetic_runs_immutable ON operational_synthetic_runs;
DROP TRIGGER IF EXISTS operational_alert_occurrences_immutable ON operational_alert_occurrences;
DROP TRIGGER IF EXISTS operational_alerts_delete_guard ON operational_alerts;
DROP TRIGGER IF EXISTS operational_alerts_transition_guard ON operational_alerts;

DROP FUNCTION IF EXISTS protect_operational_alert_transition();

DROP TABLE IF EXISTS operational_synthetic_runs;
DROP TABLE IF EXISTS operational_alert_occurrences;
DROP TABLE IF EXISTS operational_alerts;

DROP TYPE IF EXISTS operational_synthetic_status;
DROP TYPE IF EXISTS operational_alert_status;
