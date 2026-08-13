import {
  mkdir,
  realpath,
  writeFile
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
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
const OUTPUT_DIRECTORY = resolve(
  ROOT,
  ".ipo-one/local-stack/agent-workflows"
);
const CONTAINER_AGENT_KEY = "/run/secrets/agent-key.v1.json";
const releaseSha = process.env.IPO_ONE_M1_B_RELEASE_SHA ?? "";
const reviewPortBase = process.env.IPO_ONE_M1_B_PORT_BASE ?? "";
const releaseBuildContext = /^[0-9a-f]{40}$/.test(releaseSha)
  ? resolve(ROOT, ".ipo-one/local-stack/exact-source", releaseSha)
  : ROOT;

await mkdir(OUTPUT_DIRECTORY, { recursive: true, mode: 0o700 });
const agentKeyPath = await realpath(AGENT_KEY_FILE);
const result = spawnSync(
  "limactl",
  [
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
    `${agentKeyPath}:${CONTAINER_AGENT_KEY}:ro`,
    "pilot",
    "apps/private-pilot/src/agent-reference-acceptance.js"
  ],
  {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024
  }
);

if (result.error) {
  process.stderr.write("LOCAL-STACK-001 Agent acceptance: limactl is unavailable\n");
  process.exit(1);
}
if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  process.stderr.write(
    `LOCAL-STACK-001 Agent acceptance exited with status ${result.status}\n`
  );
  process.exit(1);
}
let acceptance;
try {
  acceptance = JSON.parse(result.stdout);
} catch {
  process.stderr.write(
    "LOCAL-STACK-001 Agent acceptance returned an invalid result\n"
  );
  process.exit(1);
}
const acceptancePath = resolve(
  OUTPUT_DIRECTORY,
  "latest-reference-acceptance.json"
);
const workflowKey = createHash("sha256")
  .update(acceptance.mandateId)
  .digest("hex")
  .slice(0, 24);
const extractedArtifacts = {
  applicationHandoffPath: resolve(
    OUTPUT_DIRECTORY,
    `${workflowKey}.application-handoff.json`
  ),
  offerReceiptPath: resolve(
    OUTPUT_DIRECTORY,
    `${workflowKey}.offer-receipt.json`
  ),
  runtimeHandoffPath: resolve(
    OUTPUT_DIRECTORY,
    `${workflowKey}.runtime-handoff.json`
  ),
  lifecycleResultPath: resolve(
    OUTPUT_DIRECTORY,
    `${workflowKey}.lifecycle-result.json`
  )
};
await writeFile(
  acceptancePath,
  `${JSON.stringify(acceptance, null, 2)}\n`,
  { mode: 0o600 }
);
for (const [path, value] of [
  [extractedArtifacts.applicationHandoffPath, acceptance.applicationHandoff],
  [extractedArtifacts.offerReceiptPath, acceptance.offerReceipt],
  [extractedArtifacts.runtimeHandoffPath, acceptance.runtimeHandoff],
  [extractedArtifacts.lifecycleResultPath, acceptance.lifecycle]
]) {
  await writeFile(
    path,
    `${JSON.stringify(value, null, 2)}\n`,
    { mode: 0o600 }
  );
}
process.stdout.write(`${JSON.stringify({
  schemaVersion: acceptance.schemaVersion,
  status: acceptance.status,
  subjectId: acceptance.subjectId,
  mandateId: acceptance.mandateId,
  obligationId: acceptance.obligationId,
  evidenceEventCount: acceptance.evidenceEventCount,
  acceptancePath,
  artifacts: extractedArtifacts,
  sandboxOnly: acceptance.sandboxOnly,
  productionFundsMoved: acceptance.productionFundsMoved
}, null, 2)}\n`);
