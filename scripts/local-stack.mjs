import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseLocalStack } from "../packages/deployment-topology/src/index.js";
import {
  createLocalAuthenticationMaterial,
  loadLocalAgentKeyMaterial,
  loadLocalAuthenticationInvitation,
  loadLocalAuthenticationServerMaterial
} from "../apps/private-pilot/src/local-authentication-material.js";
import {
  loadOrCreateLocalSyntheticMeteredProviderMaterial
} from "../apps/private-pilot/src/local-synthetic-metered-provider.js";
import {
  assertExactLocalReleaseSource,
  prepareLocalReleaseBuildContext,
  resolveLocalReviewPorts,
  resolveLocalReleaseIdentity
} from "./local-release-identity.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTANCE = "ipo-one-local";
const COMPOSE_FILE = resolve(ROOT, "deploy/local/compose.yaml");
const EVIDENCE_ANCHOR_COMPOSE_FILE = resolve(
  ROOT,
  "deploy/local/evidence-anchor.compose.yaml"
);
const CONTRACT_FILE = resolve(ROOT, "deploy/local/stack.v1.json");
const SECRET_DIRECTORY = resolve(ROOT, ".ipo-one/local-stack");
const ENV_FILE = resolve(SECRET_DIRECTORY, "stack.env");
const PILOT_SECRET_FILE = resolve(
  SECRET_DIRECTORY,
  "private-pilot-db-secret"
);
const AUTHENTICATION_SERVER_FILE = resolve(
  SECRET_DIRECTORY,
  "authentication-server.v1.json"
);
const AUTHENTICATION_INVITATION_FILE = resolve(
  SECRET_DIRECTORY,
  "authentication-invitation.v1.json"
);
const AGENT_KEY_FILE = resolve(
  SECRET_DIRECTORY,
  "agent-key.v1.json"
);
const METERED_PROVIDER_KEY_FILE = resolve(
  SECRET_DIRECTORY,
  "metered-provider-key.v1.json"
);
const LIMA_CONFIG = resolve(homedir(), ".lima", INSTANCE, "lima.yaml");
const releaseIdentity = resolveLocalReleaseIdentity();
const localReviewPorts = resolveLocalReviewPorts({ releaseIdentity });
const LOCAL_PORTS = localReviewPorts.ports;
let releaseBuildContext = ROOT;

function fail(message) {
  process.stderr.write(`LOCAL-STACK-001: ${message}\n`);
  process.exit(1);
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.error) fail(`${command} is unavailable`);
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    fail(`${command} exited with status ${result.status}`);
  }
  return capture ? result.stdout.trim() : "";
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function localPilotMarkerAvailable() {
  try {
    const response = await fetch(
      `http://127.0.0.1:${localReviewPorts.basePort}/auth/v1/options`,
      { signal: AbortSignal.timeout(500) }
    );
    if (!response.ok) return false;
    const body = await response.json();
    return (
      body.schemaVersion === "ipo_one_authentication_options.v1" &&
      body.profile === "local_no_funds" &&
      body.enabled === true &&
      body.walletAuthentication === true
    );
  } catch {
    return false;
  }
}

function readLimaInstance() {
  return JSON.parse(
    run("limactl", ["list", INSTANCE, "--json"], { capture: true })
  );
}

function listenerPids(port) {
  const result = spawnSync(
    "/usr/sbin/lsof",
    ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  if (result.error) fail("/usr/sbin/lsof is unavailable");
  if (result.status === 1 && result.stdout.length === 0) return [];
  if (result.status !== 0) fail(`lsof failed while checking port ${port}`);
  const pids = result.stdout.trim().split("\n").filter(Boolean);
  if (pids.some((pid) => !/^[1-9][0-9]{0,9}$/.test(pid))) {
    fail(`lsof returned an invalid listener PID for port ${port}`);
  }
  return [...new Set(pids.map(Number))];
}

function limaHostAgentOwnsProductPorts() {
  const instance = readLimaInstance();
  if (!Number.isInteger(instance.hostAgentPID) || instance.hostAgentPID <= 0) {
    return false;
  }
  return LOCAL_PORTS.every((port) => {
    const pids = listenerPids(port);
    return pids.length === 1 && pids[0] === instance.hostAgentPID;
  });
}

async function ensureLoopbackForwarding() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (
      limaHostAgentOwnsProductPorts() &&
      await localPilotMarkerAvailable()
    ) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  fail(
    "Lima host-agent loopback forwarding failed ownership or IPO.ONE marker checks; " +
      `stop any other process using ports ${LOCAL_PORTS[0]}-${LOCAL_PORTS[3]} and retry`
  );
}

function parseEnvironment(source) {
  const entries = source.trim().split("\n").map((line) => line.split("=", 2));
  if (
    entries.length !== 2 ||
    entries.some(([key, value]) => !key || value === undefined) ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  ) {
    fail("existing local stack environment file is invalid");
  }
  return Object.fromEntries(entries);
}

async function ensureLocalSecrets() {
  await mkdir(SECRET_DIRECTORY, { recursive: true, mode: 0o700 });
  await chmod(SECRET_DIRECTORY, 0o700);

  if (!(await exists(PILOT_SECRET_FILE))) {
    await writeFile(
      PILOT_SECRET_FILE,
      `${randomBytes(32).toString("base64url")}\n`,
      { mode: 0o644, flag: "wx" }
    );
  }
  const pilotSecret = (await readFile(PILOT_SECRET_FILE, "utf8")).trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(pilotSecret)) {
    fail("existing private-pilot database secret is invalid");
  }
  await chmod(PILOT_SECRET_FILE, 0o644);

  if (!(await exists(ENV_FILE))) {
    const password = randomBytes(32).toString("base64url");
    await writeFile(
      ENV_FILE,
      `IPO_ONE_LOCAL_POSTGRES_PASSWORD=${password}\n` +
        `IPO_ONE_LOCAL_SECRET_DIR=${SECRET_DIRECTORY}\n`,
      { mode: 0o600, flag: "wx" }
    );
  }
  const environment = parseEnvironment(await readFile(ENV_FILE, "utf8"));
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(
      environment.IPO_ONE_LOCAL_POSTGRES_PASSWORD ?? ""
    ) ||
    environment.IPO_ONE_LOCAL_SECRET_DIR !== SECRET_DIRECTORY ||
    Object.keys(environment).some(
      (key) =>
        !new Set([
          "IPO_ONE_LOCAL_POSTGRES_PASSWORD",
          "IPO_ONE_LOCAL_SECRET_DIR"
        ]).has(key)
    )
  ) {
    fail("existing local stack environment does not match the closed contract");
  }
  await chmod(ENV_FILE, 0o600);
  await loadOrCreateLocalSyntheticMeteredProviderMaterial(
    METERED_PROVIDER_KEY_FILE
  );
}

async function ensureLocalAuthentication({ invitedWalletAddress, required }) {
  const filesExist = await Promise.all([
    exists(AUTHENTICATION_SERVER_FILE),
    exists(AUTHENTICATION_INVITATION_FILE),
    exists(AGENT_KEY_FILE)
  ]);
  if (filesExist.some(Boolean) && !filesExist.every(Boolean)) {
    fail("local authentication material is incomplete");
  }
  if (!filesExist.every(Boolean)) {
    if (!invitedWalletAddress) {
      if (required) {
        fail(
          "durable authentication is not initialized; run " +
            "pnpm local:auth:init --wallet <Base-Sepolia-wallet>"
        );
      }
      return false;
    }
    const material = await createLocalAuthenticationMaterial({
      invitedWalletAddress
    });
    await Promise.all([
      writeFile(
        AUTHENTICATION_SERVER_FILE,
        `${JSON.stringify(material.server, null, 2)}\n`,
        { mode: 0o600, flag: "wx" }
      ),
      writeFile(
        AUTHENTICATION_INVITATION_FILE,
        `${JSON.stringify(material.invitation, null, 2)}\n`,
        { mode: 0o600, flag: "wx" }
      ),
      writeFile(
        AGENT_KEY_FILE,
        `${JSON.stringify(material.agent, null, 2)}\n`,
        { mode: 0o600, flag: "wx" }
      )
    ]);
  }
  const [server, invitation, agent] = await Promise.all([
    loadLocalAuthenticationServerMaterial(AUTHENTICATION_SERVER_FILE),
    loadLocalAuthenticationInvitation(AUTHENTICATION_INVITATION_FILE),
    loadLocalAgentKeyMaterial(AGENT_KEY_FILE)
  ]);
  if (
    invitation.agentThumbprint !== agent.agentThumbprint ||
    invitation.agentPublicJwk.x !== agent.agentPublicJwk.x ||
    invitation.agentPublicJwk.y !== agent.agentPublicJwk.y
  ) {
    fail("local Agent invitation and private key do not match");
  }
  if (
    invitedWalletAddress &&
    invitation.walletAddress.toLowerCase() !== invitedWalletAddress.toLowerCase()
  ) {
    fail("existing invited wallet does not match the requested wallet");
  }
  if (!server.authenticationRolePassword) {
    fail("local authentication server material is invalid");
  }
  await Promise.all([
    chmod(AUTHENTICATION_SERVER_FILE, 0o600),
    chmod(AUTHENTICATION_INVITATION_FILE, 0o600),
    chmod(AGENT_KEY_FILE, 0o600)
  ]);
  return true;
}

async function ensureLima() {
  run("limactl", ["--version"], { capture: true });
  if (!(await exists(LIMA_CONFIG))) {
    run("limactl", [
      "start",
      "--name",
      INSTANCE,
      "--cpus",
      "4",
      "--memory",
      "6",
      "--disk",
      "40",
      "--timeout",
      "15m",
      "-y",
      "template:docker"
    ]);
  }
  const instance = readLimaInstance();
  if (
    instance.name !== INSTANCE ||
    instance.cpus !== 4 ||
    instance.memory !== 6 * 1024 ** 3 ||
    instance.disk !== 40 * 1024 ** 3
  ) {
    fail("existing Lima instance does not match the reviewed 4 CPU / 6 GiB / 40 GiB shape");
  }
  if (instance.status !== "Running") {
    run("limactl", ["start", "--timeout", "5m", "-y", INSTANCE]);
  }
  const engine = run(
    "limactl",
    ["shell", INSTANCE, "docker", "info", "--format", "{{.SecurityOptions}}"],
    { capture: true }
  );
  if (!engine.includes("rootless")) {
    fail("Lima Docker engine is not rootless");
  }
}

function compose(
  args,
  { evidenceAnchor = false, ...runOptions } = {}
) {
  return run(
    "limactl",
    [
      "shell",
      "--workdir",
      ROOT,
      INSTANCE,
      "env",
      `IPO_ONE_M1_B_RELEASE_SHA=${releaseIdentity.revision}`,
      `IPO_ONE_M1_B_PORT_BASE=${localReviewPorts.basePort}`,
      `IPO_ONE_M1_B_BUILD_CONTEXT=${releaseBuildContext}`,
      "docker",
      "compose",
      "--project-name",
      "ipo-one-local",
      "--env-file",
      ENV_FILE,
      "--file",
      COMPOSE_FILE,
      ...(evidenceAnchor
        ? ["--file", EVIDENCE_ANCHOR_COMPOSE_FILE]
        : []),
      ...args
    ],
    runOptions
  );
}

function evidenceAnchorConfigured() {
  return compose(
    [
      "exec",
      "-T",
      "worker",
      "/nodejs/bin/node",
      "-e",
      "process.stdout.write(process.env.IPO_ONE_EVIDENCE_ANCHOR_CONTRACT_ADDRESS?'enabled':'disabled')"
    ],
    { capture: true }
  ) === "enabled";
}

async function prepare() {
  parseLocalStack(await readFile(CONTRACT_FILE, "utf8"));
  assertExactLocalReleaseSource(releaseIdentity, { root: ROOT });
  releaseBuildContext = await prepareLocalReleaseBuildContext(
    releaseIdentity,
    { root: ROOT }
  );
  await ensureLocalSecrets();
  await ensureLocalAuthentication({ required: true });
  await ensureLima();
  compose(["config", "--quiet"]);
}

const command = process.argv[2];
const extra = process.argv.slice(3).filter((value) => value !== "--");

switch (command) {
  case "init":
    parseLocalStack(await readFile(CONTRACT_FILE, "utf8"));
    await ensureLocalSecrets();
    await ensureLocalAuthentication({ required: false });
    process.stdout.write(
      "LOCAL-STACK-001 secrets initialized under ignored .ipo-one/local-stack.\n"
    );
    break;
  case "auth-init": {
    if (
      extra.length !== 2 ||
      extra[0] !== "--wallet" ||
      !/^0x[0-9a-fA-F]{40}$/.test(extra[1])
    ) {
      fail("auth-init requires --wallet <Base-Sepolia-wallet>");
    }
    parseLocalStack(await readFile(CONTRACT_FILE, "utf8"));
    await ensureLocalSecrets();
    await ensureLocalAuthentication({
      invitedWalletAddress: extra[1],
      required: true
    });
    process.stdout.write(
      "AUTHN-006 durable local wallet and Agent credentials initialized.\n"
    );
    break;
  }
  case "up":
    await prepare();
    compose(["up", "--detach", "--build", "--wait"]);
    await ensureLoopbackForwarding();
    process.stdout.write(
      `IPO.ONE local stack is healthy at 127.0.0.1 ports ${LOCAL_PORTS[0]}-${LOCAL_PORTS[3]}.\n`
    );
    break;
  case "status":
    await prepare();
    compose(["ps"]);
    process.stdout.write(
      "Lima host-agent loopback forwarding ready: " +
        `${limaHostAgentOwnsProductPorts() && await localPilotMarkerAvailable()}\n`
    );
    break;
  case "logs":
    await prepare();
    compose(["logs", "--tail", extra[0] ?? "200"]);
    break;
  case "down":
    await prepare();
    compose(["down", "--remove-orphans"]);
    process.stdout.write(
      "IPO.ONE local containers stopped; PostgreSQL volume retained.\n"
    );
    break;
  case "restart":
    await prepare();
    {
      const preserveEvidenceAnchor = evidenceAnchorConfigured();
      compose(
        ["stop", "worker", "pilot"],
        { evidenceAnchor: preserveEvidenceAnchor }
      );
      compose(["restart", "postgres"]);
      compose(["up", "--detach", "--wait", "postgres"]);
      compose(
        ["up", "--detach", "--wait", "pilot", "worker"],
        { evidenceAnchor: preserveEvidenceAnchor }
      );
    }
    await ensureLoopbackForwarding();
    process.stdout.write(
      "IPO.ONE local database, pilot and worker restarted successfully.\n"
    );
    break;
  case "vm-stop":
    if (await exists(LIMA_CONFIG)) {
      run("limactl", ["stop", INSTANCE]);
    }
    process.stdout.write("IPO.ONE Lima VM stopped; local data retained.\n");
    break;
  case "reset":
    if (extra.length !== 1 || extra[0] !== "--confirm-delete-local-data") {
      fail("reset requires --confirm-delete-local-data");
    }
    await prepare();
    compose(["down", "--volumes", "--remove-orphans"]);
    process.stdout.write(
      "IPO.ONE local containers and PostgreSQL volume removed; generated secrets retained.\n"
    );
    break;
  default:
    fail(
      "usage: node scripts/local-stack.mjs " +
        "init|auth-init --wallet <address>|up|status|logs|down|restart|vm-stop|" +
        "reset --confirm-delete-local-data"
    );
}
