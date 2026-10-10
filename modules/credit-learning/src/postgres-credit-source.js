// Shared by materialization and owned-state reads. Keep the fixed aliases o/d
// in both queries so eligibility cannot drift between producer and consumer.
export const TERMINAL_CREDIT_SOURCE_SQL = `o.schema_version = 'obligation.v2'
          AND o.status IN ('fully_repaid', 'written_off')
          AND o.execution_status = 'executed'
          AND o.sandbox_only = TRUE
          AND o.production_funds_moved = FALSE
          AND d.schema_version = 'risk_decision.v3'
          AND d.status = 'approved'
          AND d.sandbox_only = TRUE
          AND d.production_authority = FALSE`;

export async function boundCreditStatementTime(client) {
  // Transaction-local, including read-only transactions; preserve stricter caps.
  await client.query(`SELECT set_config('statement_timeout',
    LEAST(COALESCE(NULLIF(setting::int, 0), 5000), 5000)::text, true)
    FROM pg_settings WHERE name = 'statement_timeout'`);
}
