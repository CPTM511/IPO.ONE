import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Pool } = pg;
const MIGRATION_LOCK_NAMESPACE = "ipo.one";
const MIGRATION_LOCK_NAME = "schema_migrations";

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

export async function readMigrationSet(directory = join(process.cwd(), "db", "migrations")) {
  const files = await readdir(directory);
  const names = files
    .filter((file) => file.endsWith(".up.sql"))
    .map((file) => file.slice(0, -".up.sql".length))
    .sort();
  const migrations = [];
  for (const name of names) {
    const upPath = join(directory, `${name}.up.sql`);
    const downPath = join(directory, `${name}.down.sql`);
    const [up, down] = await Promise.all([readFile(upPath, "utf8"), readFile(downPath, "utf8")]);
    migrations.push({ name, up, down, checksum: checksum(`${up}\0${down}`) });
  }
  return migrations;
}

function assertMigrationHistory(migrations, appliedRows) {
  if (appliedRows.length > migrations.length) {
    throw new Error("database contains migrations unknown to this build");
  }
  for (let index = 0; index < appliedRows.length; index += 1) {
    const expected = migrations[index];
    const actual = appliedRows[index];
    if (!expected || actual.name !== expected.name) {
      throw new Error("migration history is not a contiguous prefix of this build");
    }
    if (actual.checksum !== expected.checksum) {
      throw new Error(`migration checksum mismatch: ${actual.name}`);
    }
  }
}

async function ensureMetadata(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    )
  `);
}

async function withMigrationLock(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1), hashtext($2))", [
      MIGRATION_LOCK_NAMESPACE,
      MIGRATION_LOCK_NAME
    ]);
    await ensureMetadata(client);
    return await operation(client);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1), hashtext($2))", [
        MIGRATION_LOCK_NAMESPACE,
        MIGRATION_LOCK_NAME
      ]);
    } finally {
      client.release();
    }
  }
}

export async function migrateUp({ pool, directory } = {}) {
  if (!pool) throw new Error("migrateUp requires a PostgreSQL pool");
  const migrations = await readMigrationSet(directory);
  return withMigrationLock(pool, async (client) => {
    const appliedRows = await client.query("SELECT name, checksum FROM schema_migrations ORDER BY name");
    assertMigrationHistory(migrations, appliedRows.rows);
    const applied = new Map(appliedRows.rows.map((row) => [row.name, row.checksum]));
    const completed = [];
    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.name);
      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(`migration checksum mismatch: ${migration.name}`);
        }
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(migration.up);
        await client.query("INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)", [
          migration.name,
          migration.checksum
        ]);
        await client.query("COMMIT");
        completed.push(migration.name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return completed;
  });
}

export async function migrateDown({ pool, directory, steps = 1 } = {}) {
  if (!pool) throw new Error("migrateDown requires a PostgreSQL pool");
  if (!Number.isSafeInteger(steps) || steps < 1) throw new Error("steps must be a positive safe integer");
  const migrations = await readMigrationSet(directory);
  const byName = new Map(migrations.map((migration) => [migration.name, migration]));
  return withMigrationLock(pool, async (client) => {
    const appliedRows = await client.query("SELECT name, checksum FROM schema_migrations ORDER BY name");
    assertMigrationHistory(migrations, appliedRows.rows);
    const selectedRows = appliedRows.rows.slice(-steps).reverse();
    const completed = [];
    for (const row of selectedRows) {
      const migration = byName.get(row.name);
      if (!migration) throw new Error(`down migration file not found: ${row.name}`);
      if (migration.checksum !== row.checksum) throw new Error(`migration checksum mismatch: ${row.name}`);
      await client.query("BEGIN");
      try {
        await client.query(migration.down);
        await client.query("DELETE FROM schema_migrations WHERE name = $1", [migration.name]);
        await client.query("COMMIT");
        completed.push(migration.name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return completed;
  });
}

export async function migrationStatus({ pool, directory } = {}) {
  if (!pool) throw new Error("migrationStatus requires a PostgreSQL pool");
  const migrations = await readMigrationSet(directory);
  return withMigrationLock(pool, async (client) => {
    const appliedRows = await client.query("SELECT name, checksum, applied_at FROM schema_migrations ORDER BY name");
    assertMigrationHistory(migrations, appliedRows.rows);
    const applied = new Map(appliedRows.rows.map((row) => [row.name, row]));
    return migrations.map((migration) => ({
      name: migration.name,
      checksum: migration.checksum,
      applied: applied.has(migration.name),
      appliedAt: applied.get(migration.name)?.applied_at?.toISOString()
    }));
  });
}

async function runCli() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const command = process.argv[2] ?? "up";
  const pool = new Pool({ connectionString, max: 1, application_name: "ipo-one-migrations" });
  try {
    if (command === "up") {
      console.log(JSON.stringify({ applied: await migrateUp({ pool }) }, null, 2));
    } else if (command === "down") {
      const steps = Number(process.argv[3] ?? 1);
      console.log(JSON.stringify({ rolledBack: await migrateDown({ pool, steps }) }, null, 2));
    } else if (command === "reset") {
      const status = await migrationStatus({ pool });
      const appliedCount = status.filter((migration) => migration.applied).length;
      const rolledBack = appliedCount > 0 ? await migrateDown({ pool, steps: appliedCount }) : [];
      console.log(JSON.stringify({ rolledBack }, null, 2));
    } else if (command === "status") {
      console.log(JSON.stringify(await migrationStatus({ pool }), null, 2));
    } else {
      throw new Error(`unknown migration command: ${command}`);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
