import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile
} from "node:fs/promises";
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
const releaseSha = process.env.IPO_ONE_M1_B_RELEASE_SHA ?? "";
const reviewPortBase = process.env.IPO_ONE_M1_B_PORT_BASE ?? "";
const releaseBuildContext = /^[0-9a-f]{40}$/.test(releaseSha)
  ? resolve(ROOT, ".ipo-one/local-stack/exact-source", releaseSha)
  : ROOT;
const CONTAINER_INPUT = "/run/input/ipo-one-agent-input.json";
const CONTAINER_OFFER_RECEIPT =
  "/run/input/ipo-one-agent-offer-receipt.json";
const CONTAINER_AGENT_KEY = "/run/secrets/agent-key.v1.json";
const ACTIONS = Object.freeze({
  prove: "apps/private-pilot/src/agent-account-proof.js",
  run: "apps/private-pilot/src/agent-stdio.js",
  application: "apps/private-pilot/src/agent-workflow.js",
  runtime: "apps/private-pilot/src/agent-workflow.js"
});
const WORKFLOW_ACTIONS = new Set(["application", "runtime"]);

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
      "prove|run|application|runtime <repository-local-agent-json>"
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
let workflowReceiptPath;
let workflowOutputPath;
if (WORKFLOW_ACTIONS.has(action)) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(inputPath, "utf8"));
  } catch {
    fail("workflow input must be one valid JSON handoff");
  }
  if (
    typeof manifest?.mandateId !== "string" ||
    manifest.mandateId.length < 1
  ) {
    fail("workflow handoff must contain one Mandate ID");
  }
  const workflowKey = createHash("sha256")
    .update(manifest.mandateId)
    .digest("hex")
    .slice(0, 24);
  const workflowDirectory = resolve(
    ROOT,
    ".ipo-one/local-stack/agent-workflows"
  );
  await mkdir(workflowDirectory, { recursive: true, mode: 0o700 });
  workflowReceiptPath = resolve(
    workflowDirectory,
    `${workflowKey}.offer-receipt.json`
  );
  workflowOutputPath = action === "application"
    ? workflowReceiptPath
    : resolve(
        workflowDirectory,
        `${workflowKey}.lifecycle-result.json`
      );
  if (action === "runtime") {
    const receiptPath = await realpath(workflowReceiptPath).catch(() =>
      fail(
        "no saved Offer receipt matches this Mandate; run the application workflow first"
      )
    );
    const receipt = await stat(receiptPath);
    if (
      !receipt.isFile() ||
      receipt.size < 2 ||
      receipt.size > 512 * 1024
    ) {
      fail("saved Offer receipt is invalid");
    }
    workflowReceiptPath = receiptPath;
  }
}
const agentKeyPath = await realpath(AGENT_KEY_FILE).catch(() =>
  fail("durable local Agent key is not initialized")
);
const agentKey = await stat(agentKeyPath);
if (!agentKey.isFile() || agentKey.size < 2 || agentKey.size > 16 * 1024) {
  fail("durable local Agent key file is invalid");
}

const containerArguments = [
  "shell",
  "--workdir",
  ROOT,
  INSTANCE,
  "env",
  `IPO_ONE_M1_B_RELEASE_SHA=${releaseSha}`,
  `IPO_ONE_M1_B_PORT_BASE=${reviewPortBase}`,
  `IPO_ONE_M1_B_BUILD_CONTEXT=${releaseBuildContext}`,
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
  `${agentKeyPath}:${CONTAINER_AGENT_KEY}:ro`
];
if (action === "runtime") {
  containerArguments.push(
    "--volume",
    `${workflowReceiptPath}:${CONTAINER_OFFER_RECEIPT}:ro`
  );
}
containerArguments.push(
  "pilot",
  ACTIONS[action]
);
if (WORKFLOW_ACTIONS.has(action)) {
  containerArguments.push(action);
}
containerArguments.push(CONTAINER_INPUT);
if (action === "runtime") {
  containerArguments.push(CONTAINER_OFFER_RECEIPT);
}

const result = spawnSync(
  "limactl",
  containerArguments,
  {
    cwd: ROOT,
    ...(WORKFLOW_ACTIONS.has(action)
      ? {
          encoding: "utf8",
          stdio: ["inherit", "pipe", "pipe"],
          maxBuffer: 2 * 1024 * 1024
        }
      : { stdio: "inherit" })
  }
);

if (result.error) fail("limactl is unavailable");
if (result.status !== 0) {
  if (WORKFLOW_ACTIONS.has(action) && result.stderr) {
    process.stderr.write(result.stderr);
  }
  fail(`isolated Agent ${action} command exited with status ${result.status}`);
}
if (WORKFLOW_ACTIONS.has(action)) {
  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch {
    fail("isolated Agent workflow did not return one JSON receipt");
  }
  await writeFile(
    workflowOutputPath,
    `${JSON.stringify(output, null, 2)}\n`,
    { mode: 0o600 }
  );
  process.stdout.write(
    `Agent ${action} workflow complete.\n` +
    `Receipt: ${relative(ROOT, workflowOutputPath)}\n` +
    `Status: ${output.status}\n`
  );
}
