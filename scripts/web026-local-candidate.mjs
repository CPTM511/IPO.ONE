// Read-only local runtime audit. This command cannot stop/start a container,
// create credentials, run migrations or change authentication/data.
import { spawnSync } from "node:child_process";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const main = "/Users/cptmao/Documents/IPO.ONE";
const backend = "/Users/cptmao/Documents/IPO.ONE-phase3-remaining-alignment";
const original = "ipo-one-pilot008a-review";
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 2_000_000 });
  if (result.status !== 0) throw new Error(`Read-only audit failed (${command}).`);
  return result.stdout.trim();
}
function docker(args) {
  return run("limactl", ["shell", "--workdir", main, "ipo-one-local", "docker", ...args]);
}
const command = process.argv[2] ?? "audit";
try {
  if (command !== "audit") throw new Error("BLOCKED — NOT COMPLETE: only audit is allowed. Backend/identity migrations need a separately reviewed runtime task. No service was changed.");
  const runtime = JSON.parse(docker(["inspect", original, "--format", '{"startedAt":"{{.State.StartedAt}}","running":{{.State.Running}},"image":"{{.Image}}","health":"{{.State.Health.Status}}"}']));
  const backendRevision = run("git", ["rev-parse", "HEAD"], backend);
  const sourceCommittedAt = run("git", ["show", "-s", "--format=%cI", "HEAD"], backend);
  const applied = docker(["exec", "ipo-one-local-postgres-1", "psql", "-U", "ipo_one_owner", "-d", "ipo_one_private_pilot", "-At", "-c", "SELECT name FROM schema_migrations ORDER BY name"]).split("\n");
  const migrations = (await readdir(resolve(backend, "db/migrations"))).filter(name => name.endsWith(".up.sql")).map(name => name.replace(/\.up\.sql$/, "")).sort();
  const pendingMigrations = migrations.filter(name => !applied.includes(name));
  const report = {
    schemaVersion: "web026_local_runtime_audit.v1", observedAt: new Date().toISOString(),
    uiSource: run("git", ["rev-parse", "HEAD"]), backendSource: backendRevision,
    sourceCommittedAt, runtime, sourceNewerThanProcess: Date.parse(sourceCommittedAt) > Date.parse(runtime.startedAt),
    lastAppliedMigration: applied.at(-1), pendingMigrations,
    verdict: "BLOCKED — NOT COMPLETE", serviceChanged: false, databaseChanged: false,
    reason: "The running process predates mounted backend changes. Restart would apply identity/permission and metered-Evidence migrations outside this presentation-only increment. Review WEB-026F first."
  };
  const directory = resolve(main, "output/playwright/web-026-runtime");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} catch (error) { console.error(error.message); process.exitCode = 1; }
