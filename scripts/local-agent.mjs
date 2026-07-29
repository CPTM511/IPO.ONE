import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTANCE = "ipo-one-local";
const COMPOSE_FILE = resolve(ROOT, "deploy/local/compose.yaml");
const ENV_FILE = resolve(ROOT, ".ipo-one/local-stack/stack.env");
const AGENT_KEY_FILE = resolve(
  ROOT,
  ".ipo-one/local-stack/agent-key.v1.json"
);
const CONTAINER_INPUT = "/run/input/ipo-one-agent-input.json";
const CONTAINER_AGENT_KEY = "/run/secrets/agent-key.v1.json";
const ACTIONS = Object.freeze({
  prove: "apps/private-pilot/src/agent-account-proof.js",
  run: "apps/private-pilot/src/agent-stdio.js"
});

function fail(message) {
  process.stderr.write(`LOCAL-STACK-001 Agent runner: ${message}\n`);
  process.exit(1);
}

const [action, ...rawArguments] = process.argv.slice(2);
const argumentsWithoutSeparator =
  rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;

if (
  !Object.hasOwn(ACTIONS, action) ||
  argumentsWithoutSeparator.length !== 1
) {
  fail(
    "usage: node scripts/local-agent.mjs " +
      "prove|run <repository-local-agent-json>"
  );
}

const requestedPath = resolve(ROOT, argumentsWithoutSeparator[0]);
const inputPath = await realpath(requestedPath).catch(() =>
  fail("input file does not exist")
);
const relativePath = relative(ROOT, inputPath);
if (
  relativePath.length === 0 ||
  relativePath.startsWith("..") ||
  isAbsolute(relativePath)
) {
  fail("input must resolve to a file inside the IPO.ONE repository");
}
const input = await stat(inputPath);
if (!input.isFile() || input.size < 2 || input.size > 256 * 1024) {
  fail("input must be a regular JSON file between 2 bytes and 256 KiB");
}
const agentKeyPath = await realpath(AGENT_KEY_FILE).catch(() =>
  fail("durable local Agent key is not initialized")
);
const agentKey = await stat(agentKeyPath);
if (!agentKey.isFile() || agentKey.size < 2 || agentKey.size > 16 * 1024) {
  fail("durable local Agent key file is invalid");
}

const result = spawnSync(
  "limactl",
  [
    "shell",
    "--workdir",
    ROOT,
    INSTANCE,
    "docker",
    "compose",
    "--project-name",
    "ipo-one-local",
    "--env-file",
    ENV_FILE,
    "--file",
    COMPOSE_FILE,
    "run",
    "--rm",
    "--no-deps",
    "--volume",
    `${inputPath}:${CONTAINER_INPUT}:ro`,
    "--volume",
    `${agentKeyPath}:${CONTAINER_AGENT_KEY}:ro`,
    "pilot",
    ACTIONS[action],
    CONTAINER_INPUT
  ],
  {
    cwd: ROOT,
    stdio: "inherit"
  }
);

if (result.error) fail("limactl is unavailable");
if (result.status !== 0) {
  fail(`isolated Agent ${action} command exited with status ${result.status}`);
}
