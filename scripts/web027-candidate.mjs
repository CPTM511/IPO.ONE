// WEB-027 isolated local candidate. Never stops or changes the review runtime.
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, chmod, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readMigrationSet, migrationChecksumMatches } from "./migrate.mjs";

const root = process.cwd();
const main = "/Users/cptmao/Documents/IPO.ONE";
const state = resolve(main, ".ipo-one/web027-runtime");
const out = resolve(root, "output/playwright/web-027");
const pg = "ipo-one-web026-test-postgres-v2";
const database = "ipo_one_web027_candidate";
const sourceRuntime = "ipo-one-web026h-copy";
const candidate = "ipo-one-web027-candidate";
const basePort = 8935;
function run(bin, args, { input, binary = false } = {}) {
  const result = spawnSync(bin, args, { cwd: root, input, encoding: binary ? undefined : "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw Error(`${bin} ${args[0]} failed; protected output withheld`);
  return binary ? result.stdout : result.stdout.trim();
}
const docker = (args, options) => run("limactl", ["shell", "--workdir", main, "ipo-one-local", "docker", ...args], options);
const inspect = name => JSON.parse(docker(["inspect", name]))[0];
const envMap = d => Object.fromEntries(d.Config.Env.map(row => { const i = row.indexOf("="); return [row.slice(0, i), row.slice(i + 1)]; }));
const sql = (query, db = database) => docker(["exec", pg, "psql", "-U", "ipo_one_owner", "-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-c", query]);
async function secret(name, data) {
  const path = resolve(state, name);
  await writeFile(path, data, { mode: 0o600 }); await chmod(path, 0o600); return path;
}
async function report(name, value) {
  await writeFile(resolve(out, name + ".json"), JSON.stringify(value, null, 2) + "\n");
  console.log(JSON.stringify(value));
}
await mkdir(state, { recursive: true, mode: 0o700 });
await mkdir(out, { recursive: true });
const sha = run("git", ["rev-parse", "HEAD"]);
const image = "ipo-one-web027:" + sha.slice(0, 12);
const action = process.argv[2];

if (action === "build") {
  assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", "apps", "modules", "packages", "db", "deploy"]), "", "Commit candidate source before building");
  const context = resolve(state, "build-" + sha);
  await mkdir(context, { recursive: true });
  const changed = run("git", ["diff", "--name-only", "0211f75", sha, "--", "apps", "modules", "packages", "db"]).split("\n").filter(Boolean);
  const runtimeFiles = changed.filter(path => !path.includes("/test/") && !path.includes("/test-postgres/"));
  for (const path of runtimeFiles) {
    await mkdir(dirname(resolve(context, path)), { recursive: true });
    await copyFile(resolve(root, path), resolve(context, path));
  }
  await writeFile(resolve(context, "Dockerfile"), [
    "FROM ipo-one-web026h:0211f75",
    `LABEL org.opencontainers.image.revision="${sha}"`,
    ...runtimeFiles.map(path => `COPY --chown=65532:65532 ${path} /app/${path}`)
  ].join("\n") + "\n");
  docker(["build", "--pull=false", "-t", image, context]);
  await report("candidate-build", { source: sha, image, imageId: inspect(image).Id, runtimeFiles, dependencyChanges: false });
} else if (action === "create") {
  const source = inspect(sourceRuntime);
  const env = envMap(source);
  const sourceUrl = new URL(env.DATABASE_URL);
  assert.equal(sourceUrl.port, "55435", "Only clone the isolated QA database");
  const sourceDb = sourceUrl.pathname.slice(1);
  assert.equal(sourceDb, "ipo_one_pilot008a_review_20260829a");
  assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname='${database}'`, sourceDb), "0", "Do not overwrite a candidate database");
  assert.equal(docker(["ps", "-a", "--filter", `name=^/${candidate}$`, "--format", "{{.Names}}"]), "", "Candidate already exists");
  const dump = docker(["exec", pg, "pg_dump", "-U", "ipo_one_owner", "-d", sourceDb, "-Fc"], { binary: true });
  await secret("isolated-source.dump", dump);
  docker(["exec", pg, "createdb", "-U", "ipo_one_owner", database]);
  docker(["exec", "-i", pg, "pg_restore", "-U", "ipo_one_owner", "-d", database, "--exit-on-error"], { input: dump });
  const migrations = await readMigrationSet(resolve(root, "db/migrations"));
  const rows = sql("SELECT name,checksum FROM schema_migrations ORDER BY name").split("\n").map(row => row.split("|"));
  rows.forEach(([name, recordedChecksum], i) => assert.ok(name === migrations[i].name && migrationChecksumMatches({ name, recordedChecksum, releaseChecksum: migrations[i].checksum })));
  const pending = migrations.slice(rows.length);
  assert.deepEqual(pending.map(m => m.name.slice(0, 4)), ["0074", "0075"]);
  const migrationSql = "BEGIN;\n" + pending.map(m => `${m.up}\nINSERT INTO schema_migrations(name,checksum) VALUES ('${m.name}','${m.checksum}');`).join("\n") + "\nCOMMIT;";
  docker(["exec", "-i", pg, "psql", "-U", "ipo_one_owner", "-d", database, "-v", "ON_ERROR_STOP=1"], { input: migrationSql });
  sourceUrl.pathname = "/" + database;
  env.DATABASE_URL = sourceUrl.href;
  env.IPO_ONE_PILOT_PORT = String(basePort);
  env.IPO_ONE_M1_B_RELEASE_SHA = sha;
  const envFile = await secret("candidate.env", Object.entries(env).map(([key, value]) => key + "=" + value).join("\n") + "\n");
  const args = ["create", "--name", candidate, "--network", "host", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=64m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--restart", "unless-stopped", "--env-file", envFile];
  for (const mount of source.Mounts.filter(m => m.Destination.startsWith("/run/secrets/"))) args.push("--mount", `type=bind,source=${mount.Source},target=${mount.Destination},readonly`);
  args.push(image, "apps/private-pilot/src/start.js");
  docker(args); docker(["start", candidate]);
  await report("candidate-runtime", { source: sha, image, candidate, database, ports: [8935,8936,8937,8938], sourceDatabaseUnchanged: true, founderRuntimeUnchanged: true, restoredDumpSha256: createHash("sha256").update(dump).digest("hex"), existingMainMigrationsApplied: pending.map(m => m.name), mode: "local_no_funds", browserVerification: "pending" });
} else throw Error("Expected build or create. This script cannot cut over or deploy production.");
