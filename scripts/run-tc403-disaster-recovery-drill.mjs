import { spawnSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";
import pg from "pg";
import { hashId } from "../packages/domain/src/index.js";
import {
  compareHyperliquidRestoreManifests,
  createHyperliquidRestoreManifest
} from "../modules/hyperliquid-operability/src/index.js";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
const approval = process.env.IPO_ONE_TC403_DRILL_APPROVAL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}
if (approval !== "TC-403") {
  throw new Error("IPO_ONE_TC403_DRILL_APPROVAL=TC-403 is required");
}

const sourceUrl = new URL(connectionString);
const sourceDatabase = sourceUrl.pathname.replace(/^\//, "");
if (
  !["127.0.0.1", "localhost", "::1"].includes(sourceUrl.hostname) ||
  !/(^|[_-])test($|[_-])/.test(sourceDatabase)
) {
  throw new Error(
    "TC-403 disaster-recovery drill requires a localhost database whose name contains 'test'"
  );
}

const TABLE_GROUPS = Object.freeze({
  facility: [
    "trading_facilities",
    "trading_facility_close_requests"
  ],
  ledger: [
    "ledger_accounts",
    "ledger_transactions",
    "ledger_entries"
  ],
  evidence: [
    "domain_events",
    "evidence_envelopes",
    "projection_snapshots"
  ],
  execution: [
    "trading_execution_nonce_heads",
    "trading_testnet_execution_records",
    "trading_testnet_execution_transitions"
  ],
  risk: [
    "trading_testnet_protective_controls",
    "trading_testnet_protective_transitions"
  ],
  reconciliation: ["trading_testnet_reconciliation_runs"],
  funding: ["trading_testnet_facility_funding_controls"],
  settlement: ["trading_testnet_settlement_runs"]
});

function pgEnvironment(url) {
  const environment = {
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGDATABASE: url.pathname.replace(/^\//, "")
  };
  const password = decodeURIComponent(url.password);
  if (password) environment.PGPASSWORD = password;
  return environment;
}

const TRUSTED_POSTGRES_PREFIXES = Object.freeze([
  "/opt/homebrew/Cellar/postgresql@17/",
  "/usr/local/Cellar/postgresql@17/",
  "/usr/lib/postgresql/17/"
]);

function trustedPostgresBinary(name, configuredPath) {
  const candidate = configuredPath || `/opt/homebrew/bin/${name}`;
  const resolved = realpathSync(candidate);
  const metadata = statSync(resolved);
  if (
    basename(resolved) !== name ||
    !TRUSTED_POSTGRES_PREFIXES.some((prefix) => resolved.startsWith(prefix)) ||
    !metadata.isFile() ||
    (metadata.mode & 0o022) !== 0
  ) {
    throw new Error(`${name} must resolve to a non-writable PostgreSQL 17 binary`);
  }
  return resolved;
}

function runPostgresBinary(command, args, url) {
  const result = spawnSync(command, args, {
    env: pgEnvironment(url),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown error")
      .trim()
      .slice(0, 2_000);
    throw new Error(`${command} failed: ${detail}`);
  }
}

function quotedIdentifier(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error("generated restore database name is invalid");
  }
  return `"${value}"`;
}

async function tableSnapshot(client, table) {
  const result = await client.query(
    `SELECT count(*)::int AS row_count,
            coalesce(
              jsonb_agg(
                to_jsonb(source_row)
                ORDER BY to_jsonb(source_row)::text
              ),
              '[]'::jsonb
            ) AS rows
       FROM ${table} AS source_row`
  );
  return {
    rowCount: result.rows[0].row_count,
    fingerprint: hashId(`tc_403_restore_table.${table}`, {
      rows: result.rows[0].rows
    })
  };
}

async function databaseManifest(url) {
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const groups = {};
    const counts = {};
    for (const [group, tables] of Object.entries(TABLE_GROUPS)) {
      const snapshots = [];
      for (const table of tables) {
        const snapshot = await tableSnapshot(client, table);
        snapshots.push({ table, ...snapshot });
        counts[table] = snapshot.rowCount;
      }
      groups[group] = hashId(`tc_403_restore_group.${group}`, snapshots);
    }
    const databaseFingerprint = hashId("tc_403_restore_database", {
      groups,
      counts
    });
    return createHyperliquidRestoreManifest({
      databaseFingerprint,
      facilityFingerprint: groups.facility,
      ledgerFingerprint: groups.ledger,
      evidenceFingerprint: groups.evidence,
      executionFingerprint: groups.execution,
      riskFingerprint: groups.risk,
      reconciliationFingerprint: groups.reconciliation,
      fundingFingerprint: groups.funding,
      settlementFingerprint: groups.settlement,
      facilityCount: counts.trading_facilities,
      ledgerTransactionCount: counts.ledger_transactions,
      ledgerEntryCount: counts.ledger_entries,
      evidenceCount: counts.evidence_envelopes,
      settlementCount: counts.trading_testnet_settlement_runs,
      capturedAt: new Date().toISOString()
    });
  } finally {
    await client.end();
  }
}

function restoreDatabaseName(source) {
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const prefix = `${source.slice(0, 36)}_tc403_restore_`;
  return `${prefix}${suffix}`.slice(0, 63);
}

const startedAt = Date.now();
const workingDirectory = await mkdtemp(
  join(tmpdir(), "ipo-one-tc403-dr-")
);
await chmod(workingDirectory, 0o700);
const backupPath = join(workingDirectory, "facility.backup");
const pgDumpBinary = trustedPostgresBinary(
  "pg_dump",
  process.env.PG_DUMP_BIN
);
const pgRestoreBinary = trustedPostgresBinary(
  "pg_restore",
  process.env.PG_RESTORE_BIN
);
const restoreDatabase = restoreDatabaseName(sourceDatabase);
const restoreUrl = new URL(sourceUrl.toString());
restoreUrl.pathname = `/${restoreDatabase}`;
const adminUrl = new URL(sourceUrl.toString());
adminUrl.pathname = "/postgres";
let restoreDatabaseCreated = false;

try {
  const sourceManifest = await databaseManifest(sourceUrl);
  runPostgresBinary(
    pgDumpBinary,
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--file=${backupPath}`
    ],
    sourceUrl
  );
  await chmod(backupPath, 0o600);

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quotedIdentifier(restoreDatabase)}`);
    restoreDatabaseCreated = true;
  } finally {
    await admin.end();
  }

  runPostgresBinary(
    pgRestoreBinary,
    [
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      `--dbname=${restoreDatabase}`,
      backupPath
    ],
    restoreUrl
  );
  const restoredManifest = await databaseManifest(restoreUrl);
  const comparison = compareHyperliquidRestoreManifests(
    sourceManifest,
    restoredManifest,
    {
      durationMs: Date.now() - startedAt,
      completedAt: new Date().toISOString()
    }
  );
  if (!comparison.exactMatch) {
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `${JSON.stringify({
        ...comparison,
        sourceDatabase: "localhost_test_database",
        restoreDatabase: "ephemeral_local_test_database",
        sourceCounts: {
          facility: sourceManifest.facilityCount,
          ledgerTransactions: sourceManifest.ledgerTransactionCount,
          ledgerEntries: sourceManifest.ledgerEntryCount,
          evidence: sourceManifest.evidenceCount,
          settlements: sourceManifest.settlementCount
        },
        backupMode: "0600",
        backupArtifactRetained: false,
        restoreDatabaseRetained: false,
        sourceDatabaseMutated: false,
        externalSystemQueried: false,
        exchangeWriteSubmitted: false,
        credentialOperationPerformed: false,
        productionFundsMoved: false,
        schemaVersion: "hyperliquid_testnet_local_dr_exercise.v1"
      }, null, 2)}\n`
    );
  }
} finally {
  if (restoreDatabaseCreated) {
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    try {
      await admin.query(
        `DROP DATABASE IF EXISTS ${quotedIdentifier(restoreDatabase)} WITH (FORCE)`
      );
    } finally {
      await admin.end();
    }
  }
  await rm(workingDirectory, { recursive: true, force: true });
}
