// WEB-027 isolated local candidate. Never stops or changes the review runtime.
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, chmod, copyFile, cp, realpath, symlink } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readMigrationSet, migrationChecksumMatches } from "./migrate.mjs";

const root = process.cwd();
const main = "/Users/cptmao/Documents/IPO.ONE";
const state = resolve(main, ".ipo-one/web027-runtime");
const profile = process.argv[3] ?? "candidate";
assert.ok(["candidate", "proof"].includes(profile));
const out = resolve(root, "output/playwright/web-027", profile === "proof" ? "proof" : "");
const pg = "ipo-one-web026-test-postgres-v2";
const database = "ipo_one_web027_" + profile;
const sourceRuntime = "ipo-one-web026h-copy";
const candidate = "ipo-one-web027-" + profile;
const basePort = profile === "proof" ? 8945 : 8935;
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
  const path = resolve(state, profile + "-" + name);
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
  assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", "apps", "modules", "packages", "db", "deploy", "schemas", "api", "security", "product", "package.json", "pnpm-lock.yaml"]), "", "Commit candidate source before building");
  const context = resolve(state, "build-" + sha);
  await mkdir(context, { recursive: true });
  const changed = run("git", ["diff", "--name-only", "0211f75", sha, "--", "apps", "modules", "packages", "db", "deploy", "schemas", "api", "security", "product"]).split("\n").filter(Boolean);
  const runtimeFiles = changed.filter(path => !path.includes("/test/") && !path.includes("/test-postgres/"));
  for (const path of runtimeFiles) {
    await mkdir(dirname(resolve(context, path)), { recursive: true });
    await copyFile(resolve(root, path), resolve(context, path));
  }
  // Copy only the approved pure-JS verifier closure, preserving package isolation and resolution.
  // Existing base dependencies remain untouched. No registry access or install scripts during build.
  const dependencyRoot = resolve(context, "passkey-dependencies");
  const seen = new Map();
  async function copyDependency(packagePath) {
    const source = await realpath(packagePath);
    if (seen.has(source)) return seen.get(source);
    const pkg = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
    assert.ok(!pkg.scripts?.install && !pkg.scripts?.preinstall && !pkg.scripts?.postinstall, "Reviewed verifier closure must not execute install scripts");
    const id = pkg.name.replaceAll("/", "+") + "@" + pkg.version;
    const destination = resolve(dependencyRoot, id); seen.set(source, id);
    await cp(source, destination, { recursive: true, filter: path => !path.slice(source.length).split("/").includes("node_modules") });
    const require = createRequire(resolve(source, "package.json"));
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      let dependency;
      for (const lookup of require.resolve.paths(name)) {
        try { dependency = await realpath(resolve(lookup, name)); break; } catch { /* next standard Node resolution path */ }
      }
      assert.ok(dependency, `Missing locked dependency ${name}`);
      const target = resolve(dependencyRoot, await copyDependency(dependency));
      const link = resolve(destination, "node_modules", name);
      await mkdir(dirname(link), { recursive: true });
      await symlink(relative(dirname(link), target), link);
    }
    return id;
  }
  const installed = JSON.parse(await readFile("node_modules/@simplewebauthn/server/package.json", "utf8"));
  assert.equal(installed.version, "14.0.1");
  const verifier = await copyDependency(resolve(root, "node_modules/@simplewebauthn/server"));
  const top = resolve(context, "passkey-entry/@simplewebauthn"); await mkdir(top, { recursive: true });
  await symlink("../.web027-passkey/" + verifier, resolve(top, "server"));
  // At /app/node_modules/@simplewebauthn/server the sibling is one level above @simplewebauthn.
  await copyFile(resolve(root, "package.json"), resolve(context, "package.json"));
  await copyFile(resolve(root, "pnpm-lock.yaml"), resolve(context, "pnpm-lock.yaml"));
  await writeFile(resolve(context, "Dockerfile"), [
    "FROM ipo-one-web026h:0211f75",
    `LABEL org.opencontainers.image.revision="${sha}"`,
    "COPY --chown=65532:65532 passkey-dependencies /app/node_modules/.web027-passkey",
    "COPY --chown=65532:65532 passkey-entry /app/node_modules",
    "COPY --chown=65532:65532 package.json pnpm-lock.yaml /app/",
    ...runtimeFiles.map(path => `COPY --chown=65532:65532 ${path} /app/${path}`)
  ].join("\n") + "\n");
  docker(["build", "--pull=false", "-t", image, context]);
  await report("candidate-build", { source: sha, image, imageId: inspect(image).Id, runtimeFiles, dependencyChanges: { package: "@simplewebauthn/server@14.0.1", lockedClosure: [...seen.values()], lockSha256: createHash("sha256").update(await readFile("pnpm-lock.yaml")).digest("hex") } });
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
  await report("candidate-runtime", { source: sha, image, candidate, database, ports: [0,1,2,3].map(i=>basePort+i), sourceDatabaseUnchanged: true, founderRuntimeUnchanged: true, restoredDumpSha256: createHash("sha256").update(dump).digest("hex"), existingMainMigrationsApplied: pending.map(m => m.name), mode: "local_no_funds", browserVerification: "pending" });
} else if (action === "upgrade") {
  const previous = inspect(candidate);
  const previousReport = JSON.parse(await readFile(resolve(out, "candidate-runtime.json"), "utf8"));
  assert.notEqual(previousReport.source, sha, "Candidate already runs this source");
  const env = envMap(previous);
  assert.equal(new URL(env.DATABASE_URL).pathname, "/" + database);
  assert.equal(env.IPO_ONE_PILOT_PORT, String(basePort));
  const backup = candidate + "-" + previousReport.source.slice(0,12);
  assert.equal(docker(["ps", "-a", "--filter", `name=^/${backup}$`, "--format", "{{.Names}}"]), "");
  await secret("before-upgrade-" + sha + ".dump", docker(["exec", pg, "pg_dump", "-U", "ipo_one_owner", "-d", database, "-Fc"], { binary: true }));
  const migrationSet = await readMigrationSet(resolve(root, "db/migrations"));
  const appliedRows = sql("SELECT name,checksum FROM schema_migrations ORDER BY name").split("\n").map(row => row.split("|"));
  appliedRows.forEach(([name, recordedChecksum], i) => assert.ok(name === migrationSet[i].name && migrationChecksumMatches({name,recordedChecksum,releaseChecksum:migrationSet[i].checksum})));
  const pendingNames = migrationSet.slice(appliedRows.length).map(m => m.name);
  assert.ok(pendingNames.every(name => ["0076_invited_wallet_role_enrollment","0077_local_ordinary_wallet_access","0078_local_principal_agent_runtime","0079_local_human_sandbox_activation","0080_local_risk_passkeys","0081_local_passkey_bounds","0082_local_special_role_enrollment","0083_local_operations_reviewer_origin","0084_verified_ordinary_wallet_expiry_recovery"].includes(name)), "Only reviewed WEB-027 access and ordinary-wallet recovery migrations may activate");
  env.IPO_ONE_LOCAL_ACCESS_REPAIR = "web027j_v1";
  if (profile === "candidate") {
    const manifest = JSON.parse(await readFile("docs/design/web-027/m-activation-manifest.json"));
    assert.equal(manifest.database,database);assert.equal(manifest.entries.length,3);
    env.IPO_ONE_LOCAL_SPECIAL_ROLES = "web027m_v1";
    env.IPO_ONE_LOCAL_OPERATIONS_REVIEWER = "web027n_v1";
    env.IPO_ONE_LOCAL_OPERATIONS_REVIEWER_INVITATION_FILE = "/run/secrets/web027n-invitation-binding.json";
    env.IPO_ONE_LOCAL_SPECIAL_ROLE_INVITATIONS_FILE = "/run/secrets/web027m-invitation-bindings.json";
  }
  env.IPO_ONE_M1_B_RELEASE_SHA = sha;
  const envFile = await secret("candidate.env", Object.entries(env).map(([k,v])=>k+"="+v).join("\n")+"\n");
  const args = ["create", "--name", candidate, "--network", "host", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=64m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--restart", "unless-stopped", "--env-file", envFile];
  for (const mount of previous.Mounts.filter(m=>m.Destination.startsWith("/run/secrets/"))) args.push("--mount", `type=bind,source=${mount.Source},target=${mount.Destination},readonly`);
  if (profile === "candidate" && !previous.Mounts.some(m=>m.Destination === "/run/secrets/web027m-invitation-bindings.json")) args.push("--mount", `type=bind,source=${state}/web027m-invitation-bindings.json,target=/run/secrets/web027m-invitation-bindings.json,readonly`);
  if (profile === "candidate" && !previous.Mounts.some(m=>m.Destination === "/run/secrets/web027n-invitation-binding.json")) args.push("--mount", `type=bind,source=${state}/web027n-invitation-binding.json,target=/run/secrets/web027n-invitation-binding.json,readonly`);
  args.push(image,"apps/private-pilot/src/start.js");
  // Only this isolated candidate is stopped. Keep the former image/container.
  docker(["stop",candidate]); docker(["rename",candidate,backup]);
  try { docker(args); docker(["start",candidate]); }
  catch(error) {
    if (docker(["ps","-a","--filter",`name=^/${candidate}$`,"--format","{{.Names}}"])) docker(["rm","-f",candidate]);
    docker(["rename",backup,candidate]); docker(["start",candidate]); throw error;
  }
  await report("candidate-runtime", { ...previousReport, source: sha, image, previousSource: previousReport.source, previousContainer: backup, databasePreserved: true, reviewedMigrations: pendingNames, localAccessRepair: "web027j_v1", ...(profile === "candidate" ? {localSpecialRoles:"web027m_v1",additionalOrigins:["http://localhost:8939","http://localhost:8940","http://localhost:8941","http://localhost:8942"]} : {}), browserVerification: "pending" });
} else if (action === "worker" || action === "worker-upgrade") {
  const name = "ipo-one-web027-" + profile + "-worker";
  if (action === "worker-upgrade") {
    const previousWorker = inspect(name);
    const previousSha = previousWorker.Config.Labels?.["org.opencontainers.image.revision"] ?? previousWorker.Image.slice(7,19);
    const backup = name + "-" + previousSha.slice(0,12);
    assert.equal(docker(["ps","-a","--filter",`name=^/${backup}$`,"--format","{{.Names}}"]), "");
    docker(["stop",name]); docker(["rename",name,backup]);
  }
  assert.equal(docker(["ps","-a","--filter",`name=^/${name}$`,"--format","{{.Names}}"]), "");
  const env = envMap(inspect(candidate));
  assert.equal(new URL(env.DATABASE_URL).pathname,"/"+database);
  assert.ok(!env.IPO_ONE_EVIDENCE_ATTESTOR_KEY_FILE && !env.IPO_ONE_EVIDENCE_ANCHOR_CONTRACT_ADDRESS, "No chain signer or anchor activation");
  env.IPO_ONE_LOCAL_WORKER_ACK="I_UNDERSTAND_SYNTHETIC_OUTBOX_ONLY";
  env.IPO_ONE_LOCAL_WORKER_ID="ipo_one_web027_"+profile+"_worker";
  const envFile=await secret("worker.env",Object.entries(env).map(([k,v])=>k+"="+v).join("\n")+"\n");
  const args=["create","--name",name,"--network","host","--read-only","--tmpfs","/tmp:rw,noexec,nosuid,nodev,size=64m","--cap-drop","ALL","--security-opt","no-new-privileges:true","--restart","unless-stopped","--env-file",envFile];
  for (const m of inspect(candidate).Mounts.filter(m=>m.Destination.startsWith("/run/secrets/"))) args.push("--mount",`type=bind,source=${m.Source},target=${m.Destination},readonly`);
  args.push(image,"apps/private-pilot/src/local-worker.js"); docker(args);docker(["start",name]);
  await report("candidate-worker",{source:sha,image,name,database,mode:"synthetic_outbox_only",chainSigner:false});
} else throw Error("Expected build, create, upgrade or worker. This script cannot deploy production.");
