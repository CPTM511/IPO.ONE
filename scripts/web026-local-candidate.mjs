// Reversible local presentation overlay. No credentials are printed or persisted.
// The original backend, PostgreSQL, auth material and worker configuration remain.
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const main = "/Users/cptmao/Documents/IPO.ONE";
const original = "ipo-one-pilot008a-review";
const candidate = "ipo-one-web026-review";
const backendSource = "/Users/cptmao/Documents/IPO.ONE-phase3-remaining-alignment";
const backendRevision = "4bdbabb7ac3782ce80e4c4b7df4f8f8abc5d8d90";
const evidencePath = resolve(main, "output/playwright/web-026-runtime/review.json");

function run(command, args, { input, cwd = root, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { input, cwd, encoding: "utf8", maxBuffer: 30_000_000 });
  if (result.status !== 0 && !allowFailure) {
    // Subprocess arguments/environment can contain existing authentication data.
    // Do not echo command output or attach an Error containing those arguments.
    throw new Error(`Local candidate operation failed (${command}, exit ${result.status ?? "unavailable"}).`);
  }
  return result.status === 0 ? result.stdout.trim() : null;
}
function docker(args, options) {
  return run("limactl", ["shell", "--workdir", main, "ipo-one-local", "docker", ...args], options);
}
function inspect(name) {
  return JSON.parse(docker(["inspect", name]))[0];
}
async function healthy() {
  for (const port of [8895, 8896, 8897, 8898]) {
    const response = await fetch(`http://127.0.0.1:${port}/tenant/v1/healthz`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return false;
  }
  const options = await (await fetch("http://127.0.0.1:8895/auth/v1/options", { signal: AbortSignal.timeout(2000) })).json();
  return options.profile === "local_no_funds" && options.walletAuthentication === true;
}
async function prepare() {
  const revision = run("git", ["rev-parse", "HEAD"]);
  if (run("git", ["status", "--porcelain=v1", "--untracked-files=no"]) !== "") throw new Error("Commit tracked candidate changes before preparing exact UI resources.");
  if (run("git", ["rev-parse", "HEAD"], { cwd: backendSource }) !== backendRevision || run("git", ["status", "--porcelain=v1", "--untracked-files=no"], { cwd: backendSource }) !== "") throw new Error("Existing backend source changed; review its compatibility first.");
  const base = inspect(original);
  if (!base.State.Running || base.HostConfig.NetworkMode !== "host") throw new Error("Expected local baseline is not running.");
  if (!base.Config.Env.includes("IPO_ONE_PILOT_PORT=8895")) throw new Error("Unexpected local port binding.");
  if (base.Config.Env.some(value => /[\r\n]/.test(value))) throw new Error("Environment cannot be transferred safely through stdin.");
  if (!base.Mounts.some(m => m.Source === backendSource && m.Destination === "/app")) throw new Error("Unexpected backend mount.");
  if (docker(["inspect", candidate], { allowFailure: true })) throw new Error("Candidate already exists; inspect it before changing it.");
  const assets = resolve(main, "output/playwright/web-026-runtime", revision);
  await mkdir(assets, { recursive: true });
  const archive = spawnSync("git", ["archive", "--format=tar", revision, "apps/web/src", "apps/tenant-api/src/tenant-web-assets.js"], { cwd: root, maxBuffer: 30_000_000 });
  if (archive.status !== 0) throw new Error("Tracked UI archive failed.");
  run("tar", ["-xf", "-", "-C", assets], { input: archive.stdout });
  const args = ["create", "--name", candidate, "--network", "host", "--restart", "unless-stopped", "--env-file", "/dev/stdin", "--workdir", base.Config.WorkingDir, "--user", base.Config.User,
    "--label", `ipo.one.ui.revision=${revision}`, "--label", `ipo.one.backend.source=${backendRevision}`,
    "--label", "ipo.one.review=WEB-026-local-no-funds"];
  if (base.HostConfig.ReadonlyRootfs) args.push("--read-only");
  for (const cap of base.HostConfig.CapDrop ?? []) args.push("--cap-drop", cap);
  for (const opt of base.HostConfig.SecurityOpt ?? []) args.push("--security-opt", opt);
  for (const m of base.Mounts) {
    if (m.Type !== "bind") throw new Error("Unexpected mount type; no automatic storage changes permitted.");
    args.push("--mount", `type=bind,source=${m.Source},target=${m.Destination}${m.RW ? "" : ",readonly"}`);
  }
  args.push("--mount", `type=bind,source=${assets}/apps/web/src,target=/app/apps/web/src,readonly`);
  args.push("--mount", `type=bind,source=${assets}/apps/tenant-api/src/tenant-web-assets.js,target=/app/apps/tenant-api/src/tenant-web-assets.js,readonly`);
  args.push("--health-cmd", '/nodejs/bin/node -e "Promise.all([8895,8896,8897,8898].map(p=>fetch(\'http://127.0.0.1:\'+p+\'/tenant/v1/healthz\').then(r=>{if(!r.ok)throw Error()}))).catch(()=>process.exit(1))"', "--health-interval", "10s", "--health-timeout", "4s", "--health-start-period", "30s", "--health-retries", "3");
  if (base.Config.Entrypoint?.length !== 1) throw new Error("Unexpected entrypoint.");
  args.push("--entrypoint", base.Config.Entrypoint[0], base.Image, ...base.Config.Cmd);
  docker(args, { input: base.Config.Env.join("\n") + "\n" });
  const evidence = { schemaVersion: "web026_local_ui_review.v1", uiSource: revision, backendSource: backendRevision, backendImage: base.Image, original, candidate, assets, status: "prepared_not_started", baseHealth: base.State.Health?.Status ?? "unknown", endpoints: [8895,8896,8897,8898].map(p => `http://127.0.0.1:${p}/`), credentialsChanged: false, databaseReset: false, cloudDeployment: false };
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence));
}
async function start() {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const next = inspect(candidate);
  if (next.Config.Labels["ipo.one.ui.revision"] !== evidence.uiSource) throw new Error("Candidate identity does not match prepared resources.");
  docker(["stop", "--time", "15", original]);
  try {
    docker(["start", candidate]);
    const deadline = Date.now() + 45_000;
    let ready = false;
    while (Date.now() < deadline) {
      try { ready = await healthy(); } catch { /* startup only */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Candidate readiness failed.");
    evidence.status = "local_ui_connected_authentication_not_yet_verified";
    evidence.startedAt = new Date().toISOString();
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
    console.log("Local UI candidate reachable at http://127.0.0.1:8895/; original container retained for rollback.");
  } catch (error) {
    docker(["stop", "--time", "10", candidate], { allowFailure: true });
    docker(["start", original]);
    throw error;
  }
}
const command = process.argv[2] ?? "status";
try {
  if (command === "prepare") await prepare();
  else if (command === "start") await start();
  else if (command === "rollback") {
    docker(["stop", "--time", "15", candidate]); docker(["start", original]);
    console.log("Previous local UI/runtime restored; PostgreSQL and authentication material retained.");
  } else if (command === "status") {
    console.log(docker(["ps", "-a", "--filter", "name=ipo-one-", "--format", "{{.Names}} {{.Status}}"]));
  } else throw new Error("Use prepare, start, status or rollback.");
} catch (error) { console.error(error.message); process.exitCode = 1; }
