import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

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

const testFiles = [
  ...readdirSync("modules/persistence/test-postgres")
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => `modules/persistence/test-postgres/${file}`),
  ...readdirSync("modules/tenant-command-gateway/test-postgres")
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => `modules/tenant-command-gateway/test-postgres/${file}`)
].sort();

const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...testFiles],
  { stdio: "inherit", env: process.env }
);

process.exit(result.status ?? 1);
