import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = join(process.cwd(), "db", "migrations");
const files = await readdir(directory);
const upFiles = files.filter((file) => file.endsWith(".up.sql")).sort();
const failures = [];
const combinedUp = [];

if (upFiles.length === 0) failures.push("no up migrations found");

for (const upFile of upFiles) {
  const migrationName = upFile.slice(0, -".up.sql".length);
  const downFile = `${migrationName}.down.sql`;
  if (!files.includes(downFile)) {
    failures.push(`${upFile} has no matching ${downFile}`);
    continue;
  }
  const [up, down] = await Promise.all([
    readFile(join(directory, upFile), "utf8"),
    readFile(join(directory, downFile), "utf8")
  ]);
  combinedUp.push(up);

  for (const table of [...up.matchAll(/CREATE TABLE ([a-z_]+)/g)].map((match) => match[1])) {
    if (!down.includes(`DROP TABLE IF EXISTS ${table};`)) {
      failures.push(`${downFile} does not drop table ${table}`);
    }
  }
  for (const type of [...up.matchAll(/CREATE TYPE ([a-z_]+)/g)].map((match) => match[1])) {
    if (!down.includes(`DROP TYPE IF EXISTS ${type};`)) {
      failures.push(`${downFile} does not drop type ${type}`);
    }
  }
  for (const fn of [...up.matchAll(/CREATE FUNCTION ([a-z_]+)/g)].map((match) => match[1])) {
    if (!down.includes(`DROP FUNCTION IF EXISTS ${fn}();`)) {
      failures.push(`${downFile} does not drop function ${fn}`);
    }
  }
  for (const match of up.matchAll(/CREATE (?:UNIQUE )?INDEX ([a-z_]+)[\s\S]*? ON ([a-z_]+)/g)) {
    const [, index, table] = match;
    if (!down.includes(`DROP INDEX IF EXISTS ${index};`) && !down.includes(`DROP TABLE IF EXISTS ${table};`)) {
      failures.push(`${downFile} does not drop index ${index} or its table ${table}`);
    }
  }
}

const up = combinedUp.join("\n");
for (const required of [
  "CREATE TABLE mandates",
  "CREATE TABLE ledger_accounts",
  "CREATE TABLE ledger_transactions",
  "CREATE TABLE ledger_entries",
  "CREATE TABLE evidence_envelopes",
  "CREATE TABLE plugin_manifests",
  "CREATE TABLE rail_adapters",
  "CREATE TABLE transfer_intents",
  "CREATE TABLE transfer_quotes",
  "CREATE TABLE settlement_receipts",
  "CREATE TABLE aggregate_stream_heads",
  "CREATE TABLE domain_events",
  "CREATE TABLE command_idempotency",
  "CREATE TABLE outbox_messages",
  "CREATE TABLE inbox_messages",
  "CREATE TABLE command_events",
  "CREATE TABLE projection_registry",
  "CREATE TABLE projection_snapshots",
  "CREATE TABLE risk_decisions",
  "CREATE TABLE reconciliation_runs",
  "CREATE TABLE reconciliation_discrepancies",
  "CREATE TABLE projection_replay_jobs",
  "CREATE TABLE approval_proposals",
  "CREATE TABLE approval_decisions",
  "CREATE TABLE approval_executions",
  "CREATE TABLE break_glass_incidents",
  "CREATE TABLE break_glass_custodian_decisions",
  "CREATE TABLE break_glass_reviews",
  "CREATE TABLE abuse_rate_buckets",
  "CREATE TABLE abuse_capacity_buckets",
  "CREATE TABLE abuse_admissions",
  "CREATE TABLE abuse_command_charges",
  "DEFERRABLE INITIALLY DEFERRED",
  "ledger_transactions_immutable",
  "ledger_entries_immutable",
  "transfer_quotes_immutable",
  "settlement_receipts_immutable",
  "settlement_receipt_quote_guard",
  "domain_events_immutable",
  "outbox_payload_immutable",
  "inbox_identity_immutable",
  "command_events_immutable",
  "projection_snapshots_immutable",
  "approval_decisions_immutable",
  "approval_executions_immutable",
  "approval_proposals_transition_guard",
  "approval_proposals_delete_guard",
  "break_glass_incidents_transition_guard",
  "break_glass_incidents_delete_guard",
  "abuse_admissions_transition_guard",
  "abuse_command_charges_transition_guard",
  "CHECK (policy_version = 'abuse_001.v1')",
  "CHECK (key_hash ~ '^0x[0-9a-f]{64}$')",
  "maximum_session_ms BETWEEN 60000 AND 1800000",
  "expires_at <= activated_at + maximum_session_ms * INTERVAL '1 millisecond'",
  "production_funds_moved BOOLEAN NOT NULL CHECK (production_funds_moved = FALSE)",
  "CHECK (debit_total_minor = credit_total_minor)"
]) {
  if (!up.includes(required)) failures.push(`migration set is missing: ${required}`);
}

if (/\b(UUID|BYTEA)\b/.test(up)) {
  failures.push("baseline IDs and demo hashes must use runtime-compatible TEXT storage");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Migration checks passed (${upFiles.length} ordered up/down pairs).`);
