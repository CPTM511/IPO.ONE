import { spawnSync } from "node:child_process";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required for PostgreSQL integration tests.");
  process.exit(1);
}

const databaseName = new URL(connectionString).pathname.replace(/^\//, "");
if (!/(^|[_-])test($|[_-])/.test(databaseName) && process.env.IPO_ONE_ALLOW_DB_RESET !== "true") {
  console.error(
    `Refusing destructive integration tests against database '${databaseName}'. Use a database name containing 'test'.`
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--test", "modules/persistence/test-postgres/postgres-event-runtime.test.mjs"],
  { stdio: "inherit", env: process.env }
);

process.exit(result.status ?? 1);
