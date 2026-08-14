import { randomBytes, createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseLocalStack } from "../packages/deployment-topology/src/index.js";
import {
  assertExactLocalReleaseSource,
  prepareLocalReleaseBuildContext,
  resolveLocalReviewPorts,
  resolveLocalReleaseIdentity
} from "./local-release-identity.mjs";
import {
  assertM1BAgentPhaseTargetAbsent,
  createM1BAgentForeignOfferSetupReceipt,
  createM1BAgentPhaseReceipt,
  m1BAgentPhaseJsonBytes,
  validateM1BAgentForeignOfferSetupReceipt,
  writeM1BAgentPhaseArtifactSetNonOverwriting
} from "./m1-b-agent-phase-receipt.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTANCE = "ipo-one-local";
const COMPOSE_FILE = resolve(ROOT, "deploy/local/compose.yaml");
const ENV_FILE = resolve(ROOT, ".ipo-one/local-stack/stack.env");
const CONTRACT_FILE = resolve(ROOT, "deploy/local/stack.v1.json");
const AGENT_KEY_FILE = resolve(
  ROOT,
  ".ipo-one/local-stack/agent-key.v1.json"
);
const OUTPUT_DIRECTORY = resolve(
  ROOT,
  ".ipo-one/local-stack/agent-workflows"
);
const CONTAINER_AGENT_KEY = "/run/secrets/agent-key.v1.json";
const acceptancePhase = process.env.IPO_ONE_M1_B_ACCEPTANCE_PHASE ?? "";
const releaseIdentity = resolveLocalReleaseIdentity();
const exactRelease = releaseIdentity.exactCandidate;
const releaseSha = exactRelease ? releaseIdentity.revision : "";
const localReviewPorts = resolveLocalReviewPorts({ releaseIdentity });
const candidateMarker = exactRelease ? `m1b.agent.${releaseSha}` : undefined;
const candidatePrefix = exactRelease ? `m1-b-${releaseSha}` : undefined;
const exactIdentifiers = [
  "subjectId",
  "mandateId",
  "creditIntentId",
  "creditOfferId",
  "obligationId",
  "facilityId",
  "creditLineId"
];
let phaseStartedAt;
let sourceTreeHash;

function fail(message) {
  process.stderr.write(`LOCAL-STACK-001 Agent acceptance: ${message}\n`);
  process.exit(1);
}

function validMcpReceipt(receipt, obligationId) {
  const operations = [
    ["pilotAcceptCreditOffer", "ipo_one_accept_credit_offer"],
    ["pilotExecuteSandboxObligation", "ipo_one_execute_sandbox_obligation"],
    ["pilotPostSandboxRepayment", "ipo_one_post_sandbox_repayment"],
    ["pilotReadOwnObligationEvidence", "ipo_one_read_obligation_evidence"]
  ];
  return (
    receipt?.schemaVersion === "local_agent_mcp_transport_receipt.v1" &&
    receipt.status === "evidence_read" &&
    receipt.transportProfile === "mcp_stdio_local" &&
    receipt.registryVersion === "agent_mcp_registry.v2" &&
    receipt.obligationId === obligationId &&
    receipt.providerTarget?.providerId === "provider_gateway_compute" &&
    receipt.providerTarget?.providerCategory === "compute" &&
    receipt.sandboxOnly === true &&
    receipt.productionFundsMoved === false &&
    receipt.withdrawable === false &&
    receipt.fundsAuthority === false &&
    receipt.credentialsIncluded === false &&
    receipt.remoteMcpEnabled === false &&
    Array.isArray(receipt.steps) &&
    receipt.steps.length === operations.length &&
    receipt.steps.every((step, index) => (
      step?.sequence === index + 1 &&
      step.operationId === operations[index][0] &&
      step.tool === operations[index][1] &&
      typeof step.requestId === "string" &&
      step.requestId.length > 0 &&
      typeof step.replayed === "boolean" &&
      typeof step.responseSchemaVersion === "string" &&
      step.responseSchemaVersion.length > 0
    ))
  );
}

function containsObjectKey(value, key) {
  if (!value || typeof value !== "object") return false;
  if (Object.hasOwn(value, key)) return true;
  return Object.values(value).some((nested) => containsObjectKey(nested, key));
}

if (
  (exactRelease && !new Set(["before_restart", "after_restart"]).has(acceptancePhase)) ||
  (!exactRelease && acceptancePhase !== "")
) {
  fail("exact acceptance requires before_restart or after_restart");
}

assertExactLocalReleaseSource(releaseIdentity, { root: ROOT });
const releaseBuildContext = await prepareLocalReleaseBuildContext(
  releaseIdentity,
  { root: ROOT }
);
const localStack = parseLocalStack(await readFile(CONTRACT_FILE, "utf8"));

await mkdir(OUTPUT_DIRECTORY, { recursive: true, mode: 0o700 });
const outputMetadata = await lstat(OUTPUT_DIRECTORY);
if (!outputMetadata.isDirectory()) {
  fail("the private workflow artifact destination must be a real directory");
}
await chmod(OUTPUT_DIRECTORY, 0o700);

async function writePrivateJsonAtomic(path, value) {
  if (value === undefined) {
    fail(`refused to write an undefined artifact at ${path}`);
  }
  const temporaryPath = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(value, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 }
    );
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } catch (error) {
    try {
      const temporary = await lstat(temporaryPath);
      if (temporary.isFile()) {
        await unlink(temporaryPath);
      }
    } catch {
      // Preserve the original artifact-write failure.
    }
    throw error;
  }
}

async function readPrivateJson(path, description) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail(`${description} is missing`);
  }
  if (
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600
  ) {
    fail(`${description} must be one regular 0600 file`);
  }
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(`${description} is not valid JSON`);
  }
}

function limaDocker(args, { description, capture = true } = {}) {
  const result = spawnSync(
    "limactl",
    ["shell", "--workdir", ROOT, INSTANCE, "docker", ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      maxBuffer: 4 * 1024 * 1024
    }
  );
  if (result.error) fail("limactl is unavailable");
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    fail(description ?? "local Docker command failed");
  }
  return capture ? result.stdout.trim() : "";
}

function git(args, description) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    fail(description);
  }
  return result.stdout.trim();
}

let exactImageId;
if (exactRelease) {
  sourceTreeHash = git(
    ["rev-parse", `${releaseSha}^{tree}`],
    "the exact candidate source tree is unavailable"
  );
  if (!/^[0-9a-f]{40}$/.test(sourceTreeHash)) {
    fail("the exact candidate source tree hash is invalid");
  }
  const revisionLabel = "{{ index .Config.Labels \"org.opencontainers.image.revision\" }}";
  const imageRevision = limaDocker(
    ["image", "inspect", localStack.pilot.image, "--format", revisionLabel],
    { description: "the exact-candidate OCI image is unavailable" }
  );
  if (imageRevision !== releaseSha) {
    fail(
      `OCI image revision ${imageRevision || "missing"} does not match ${releaseSha}`
    );
  }
  exactImageId = limaDocker(
    ["image", "inspect", localStack.pilot.image, "--format", "{{.Id}}"],
    { description: "the exact-candidate OCI image ID is unavailable" }
  );
  if (!/^sha256:[0-9a-f]{64}$/.test(exactImageId)) {
    fail("the exact-candidate OCI image ID is invalid");
  }
}

const beforeMarkerPath = exactRelease
  ? resolve(OUTPUT_DIRECTORY, `${releaseSha}.before-restart.acceptance.json`)
  : undefined;
const phaseReceiptPath = exactRelease
  ? resolve(
      OUTPUT_DIRECTORY,
      `${releaseSha}.${acceptancePhase.replace("_", "-")}.phase-receipt.v2.json`
    )
  : undefined;
const foreignOfferSetupPath = exactRelease
  ? resolve(
      OUTPUT_DIRECTORY,
      `${releaseSha}.agent-foreign-offer-setup.receipt.v1.json`
    )
  : undefined;
const beforeMarker = exactRelease && acceptancePhase === "after_restart"
  ? await readPrivateJson(beforeMarkerPath, "the exact pre-restart marker")
  : undefined;
const sealedForeignOfferSetup = exactRelease && acceptancePhase === "after_restart"
  ? await readPrivateJson(
      foreignOfferSetupPath,
      "the exact pre-restart foreign Agent Offer setup receipt"
    )
  : undefined;

if (
  beforeMarker &&
  (
    beforeMarker.schemaVersion !== "local_agent_reference_acceptance.v1" ||
    beforeMarker.status !== "passed" ||
    beforeMarker.acceptanceMode !== "before_restart_executed" ||
    beforeMarker.candidateReleaseId !== releaseSha ||
    beforeMarker.acceptancePhase !== "before_restart" ||
    beforeMarker.candidateMarker !== candidateMarker ||
    beforeMarker.sandboxOnly !== true ||
    beforeMarker.productionFundsMoved !== false ||
    beforeMarker.foreignOfferSetupArtifact?.id !== "agent_foreign_offer_setup" ||
    beforeMarker.foreignOfferSetupArtifact?.relativePath !==
      relative(ROOT, foreignOfferSetupPath) ||
    !validMcpReceipt(
      beforeMarker.lifecycle?.mcpReceipt,
      beforeMarker.obligationId
    )
  )
) {
  fail("the pre-restart marker is not bound to the requested candidate");
}

if (sealedForeignOfferSetup) {
  validateM1BAgentForeignOfferSetupReceipt(sealedForeignOfferSetup, {
    candidateReleaseId: releaseSha,
    sourceTreeHash,
    runtimeImageId: exactImageId
  });
  const sealedBytes = m1BAgentPhaseJsonBytes(sealedForeignOfferSetup);
  const sealedSha256 = createHash("sha256").update(sealedBytes).digest("hex");
  if (
    beforeMarker.foreignOfferSetupArtifact.sha256 !== sealedSha256 ||
    beforeMarker.foreignOfferSetupArtifact.completedAt !==
      sealedForeignOfferSetup.createdBeforeRestartAt
  ) {
    fail("the foreign Agent Offer setup binding changed after sealing");
  }
}

const agentKeyPath = await realpath(AGENT_KEY_FILE);
const containerEnvironment = exactRelease
  ? [
      "--env",
      `IPO_ONE_M1_B_RELEASE_SHA=${releaseSha}`,
      "--env",
      `IPO_ONE_M1_B_ACCEPTANCE_PHASE=${acceptancePhase}`,
      "--env",
      `IPO_ONE_PILOT_PORT=${localReviewPorts.basePort}`
    ]
  : [];
if (phaseReceiptPath) await assertM1BAgentPhaseTargetAbsent(phaseReceiptPath);
if (exactRelease && acceptancePhase === "before_restart") {
  await assertM1BAgentPhaseTargetAbsent(foreignOfferSetupPath);
}
phaseStartedAt = exactRelease ? new Date().toISOString() : undefined;
const result = spawnSync(
  "limactl",
  [
    "shell",
    "--workdir",
    ROOT,
    INSTANCE,
    "env",
    `IPO_ONE_M1_B_RELEASE_SHA=${releaseSha}`,
    `IPO_ONE_M1_B_ACCEPTANCE_PHASE=${acceptancePhase}`,
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
    "run",
    "--rm",
    "--no-deps",
    ...containerEnvironment,
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

if (result.error) fail("limactl is unavailable");
if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  fail(`container exited with status ${result.status}`);
}

let acceptance;
try {
  acceptance = JSON.parse(result.stdout);
} catch {
  fail("container returned an invalid result");
}

const developerModes = new Set([
  "developer_executed",
  "developer_recovered"
]);
const expectedMode = acceptancePhase === "before_restart"
  ? "before_restart_executed"
  : "after_restart_recovered";
if (
  acceptance?.schemaVersion !== "local_agent_reference_acceptance.v1" ||
  acceptance?.status !== "passed" ||
  acceptance?.sandboxOnly !== true ||
  acceptance?.productionFundsMoved !== false ||
  (
    exactRelease
      ? (
          acceptance.acceptanceMode !== expectedMode ||
          acceptance.candidateReleaseId !== releaseSha ||
          acceptance.acceptancePhase !== acceptancePhase ||
          acceptance.candidateMarker !== candidateMarker
        )
      : !developerModes.has(acceptance.acceptanceMode)
  )
) {
  fail("result is not bound to the requested phase and release");
}

if (exactRelease) {
  for (const name of exactIdentifiers) {
    if (typeof acceptance[name] !== "string" || acceptance[name].length < 1) {
      fail(`exact acceptance is missing ${name}`);
    }
  }
  if (!/^0x[0-9a-f]{64}$/.test(acceptance.accountHash ?? "")) {
    fail("exact acceptance is missing the normalized candidate account hash");
  }
  if (!Number.isFinite(Date.parse(acceptance.databaseStartedAt ?? ""))) {
    fail("exact acceptance is missing pg_postmaster_start_time");
  }
}

let foreignOfferSetupReceipt;
let foreignOfferSetupArtifact;
if (exactRelease && acceptancePhase === "before_restart") {
  const setup = acceptance.foreignOfferSetup;
  if (!setup || setup.createdBeforeRestartAt !== setup.observedAt) {
    fail("pre-restart output is missing its producer-observed foreign Agent Offer setup");
  }
  foreignOfferSetupReceipt = createM1BAgentForeignOfferSetupReceipt({
    candidateReleaseId: releaseSha,
    sourceTreeHash,
    runtimeImageId: exactImageId,
    databaseStartedAt: setup.databaseStartedAt,
    createdBeforeRestartAt: setup.createdBeforeRestartAt,
    applicationMcp: setup.applicationMcp,
    references: setup.references,
    ownershipProof: setup.ownershipProof,
    offer: setup.offer,
    lifecycleAbsence: setup.lifecycleAbsence
  });
  const setupBytes = m1BAgentPhaseJsonBytes(foreignOfferSetupReceipt);
  foreignOfferSetupArtifact = Object.freeze({
    id: "agent_foreign_offer_setup",
    relativePath: relative(ROOT, foreignOfferSetupPath),
    sha256: createHash("sha256").update(setupBytes).digest("hex"),
    completedAt: foreignOfferSetupReceipt.createdBeforeRestartAt
  });
  const { foreignOfferSetup: _setup, ...acceptanceProjection } = acceptance;
  acceptance = {
    ...acceptanceProjection,
    foreignOfferSetupArtifact
  };
}
if (exactRelease && acceptancePhase === "after_restart") {
  foreignOfferSetupReceipt = sealedForeignOfferSetup;
  foreignOfferSetupArtifact = beforeMarker.foreignOfferSetupArtifact;
  const reconciliation = acceptance.foreignOfferSetupReconciliation;
  if (
    reconciliation?.schemaVersion !==
      "m1_b_agent_foreign_offer_reconciliation.v1" ||
    reconciliation.databaseStartedAt !== acceptance.databaseStartedAt ||
    Date.parse(reconciliation.databaseStartedAt) <=
      Date.parse(foreignOfferSetupReceipt.databaseStartedAt) ||
    JSON.stringify(reconciliation.references) !==
      JSON.stringify(foreignOfferSetupReceipt.references) ||
    JSON.stringify(reconciliation.ownershipProof) !==
      JSON.stringify(foreignOfferSetupReceipt.ownershipProof) ||
    JSON.stringify(reconciliation.offer) !==
      JSON.stringify(foreignOfferSetupReceipt.offer) ||
    JSON.stringify(reconciliation.lifecycleAbsence) !==
      JSON.stringify(foreignOfferSetupReceipt.lifecycleAbsence) ||
    reconciliation.canonicalLifecycleReadOnly !== true ||
    reconciliation.lifecycleMutationPerformed !== false ||
    reconciliation.sandboxOnly !== true ||
    reconciliation.productionFundsMoved !== false ||
    Object.hasOwn(reconciliation, "applicationMcp")
  ) {
    fail("post-restart foreign Agent Offer reconciliation changed sealed truth");
  }
  acceptance = {
    ...acceptance,
    foreignOfferSetupArtifact
  };
}

const mcpReceipt = acceptance.lifecycle?.mcpReceipt;
if (exactRelease && acceptancePhase === "before_restart") {
  if (!validMcpReceipt(mcpReceipt, acceptance.obligationId)) {
    fail("pre-restart execution is missing its complete redacted MCP receipt");
  }
}
if (exactRelease && acceptancePhase === "after_restart") {
  if (
    containsObjectKey(acceptance, "mcpReceipt") ||
    acceptance.recoveryReceipt?.status !== "recovered" ||
    acceptance.recoveryReceipt?.canonicalLifecycleReadOnly !== true ||
    acceptance.recoveryReceipt?.lifecycleMutationPerformed !== false ||
    acceptance.recoveryReceipt?.serverTruth !== true ||
    acceptance.recoveryReceipt?.sandboxOnly !== true ||
    acceptance.recoveryReceipt?.productionFundsMoved !== false ||
    Object.hasOwn(acceptance, "lifecycle") ||
    acceptance.canonicalLifecycleReadOnly !== true ||
    acceptance.lifecycleMutationPerformed !== false ||
    acceptance.foreignOfferSetupArtifact?.sha256 !==
      beforeMarker.foreignOfferSetupArtifact.sha256
  ) {
    fail(
      "post-restart recovery must prove lifecycle reads without claiming MCP execution"
    );
  }
  for (const name of [...exactIdentifiers, "accountHash", "candidateMarker"]) {
    if (acceptance[name] !== beforeMarker[name]) {
      fail(`post-restart recovery changed candidate linkage field ${name}`);
    }
  }
  for (const name of exactIdentifiers) {
    if (acceptance.recoveryReceipt[name] !== acceptance[name]) {
      fail(`post-restart recovery receipt changed lifecycle field ${name}`);
    }
  }
  const beforeDatabaseStartedAt = Date.parse(beforeMarker.databaseStartedAt ?? "");
  const afterDatabaseStartedAt = Date.parse(acceptance.databaseStartedAt);
  if (
    !Number.isFinite(beforeDatabaseStartedAt) ||
    afterDatabaseStartedAt <= beforeDatabaseStartedAt
  ) {
    fail("post-restart recovery did not observe a later PostgreSQL start time");
  }
}

const workflowKey = createHash("sha256")
  .update(acceptance.mandateId)
  .digest("hex")
  .slice(0, 24);
const artifactPrefix = exactRelease
  ? `${candidatePrefix}.${acceptancePhase}.${workflowKey}`
  : workflowKey;
const acceptancePath = exactRelease
  ? resolve(
      OUTPUT_DIRECTORY,
      `${releaseSha}.${acceptancePhase.replace("_", "-")}.acceptance.json`
    )
  : resolve(OUTPUT_DIRECTORY, "latest-reference-acceptance.json");
const artifactEntries = [
  ["applicationHandoffPath", "application-handoff", acceptance.applicationHandoff],
  ["offerReceiptPath", "offer-receipt", acceptance.offerReceipt],
  ["runtimeHandoffPath", "runtime-handoff", acceptance.runtimeHandoff]
];
if (acceptance.lifecycle !== undefined) {
  artifactEntries.push([
    "lifecycleResultPath",
    "lifecycle-result",
    acceptance.lifecycle
  ]);
}
if (acceptance.canonicalRecovery !== undefined) {
  artifactEntries.push([
    "canonicalRecoveryPath",
    "canonical-recovery",
    acceptance.canonicalRecovery
  ]);
}
if (mcpReceipt !== undefined) {
  artifactEntries.push(["mcpReceiptPath", "mcp-receipt", mcpReceipt]);
}
if (acceptance.recoveryReceipt !== undefined) {
  artifactEntries.push([
    "recoveryReceiptPath",
    "recovery-receipt",
    acceptance.recoveryReceipt
  ]);
}
const extractedArtifacts = {};
const sealedArtifacts = [];
for (const [property, suffix, value] of artifactEntries) {
  if (value === undefined) continue;
  const path = resolve(OUTPUT_DIRECTORY, `${artifactPrefix}.${suffix}.json`);
  extractedArtifacts[property] = path;
  sealedArtifacts.push({ property, suffix, path, value });
}
if (exactRelease && acceptancePhase === "before_restart") {
  extractedArtifacts.foreignOfferSetupPath = foreignOfferSetupPath;
  sealedArtifacts.push({
    property: "foreignOfferSetupPath",
    suffix: "agent-foreign-offer-setup",
    path: foreignOfferSetupPath,
    value: foreignOfferSetupReceipt
  });
}

if (exactRelease) {
  const completedAt = new Date().toISOString();
  if (
    !Number.isFinite(Date.parse(phaseStartedAt)) ||
    Date.parse(completedAt) <= Date.parse(phaseStartedAt)
  ) {
    fail("the Agent phase completion clock is invalid");
  }
  const acceptanceBytes = m1BAgentPhaseJsonBytes(acceptance);
  const extractedArtifactBindings = sealedArtifacts.map(
    ({ suffix, path, value }) => {
      const bytes = m1BAgentPhaseJsonBytes(value);
      return Object.freeze({
        id: suffix.replaceAll("-", "_"),
        relativePath: relative(ROOT, path),
        sha256: createHash("sha256").update(bytes).digest("hex")
      });
    }
  );
  const phaseReceipt = createM1BAgentPhaseReceipt({
    candidateReleaseId: releaseSha,
    acceptancePhase,
    acceptanceMode: acceptance.acceptanceMode,
    runtimeImageId: exactImageId,
    databaseStartedAt: acceptance.databaseStartedAt,
    startedAt: phaseStartedAt,
    completedAt,
    acceptanceArtifact: Object.freeze({
      id: acceptancePhase === "before_restart" ? "agent_before" : "agent_after",
      relativePath: relative(ROOT, acceptancePath),
      sha256: createHash("sha256").update(acceptanceBytes).digest("hex")
    }),
    foreignOfferSetupArtifact,
    extractedArtifacts: Object.freeze(extractedArtifactBindings)
  });
  await writeM1BAgentPhaseArtifactSetNonOverwriting([
    { path: acceptancePath, bytes: acceptanceBytes },
    ...sealedArtifacts.map(({ path, value }) => ({
      path,
      bytes: m1BAgentPhaseJsonBytes(value)
    })),
    { path: phaseReceiptPath, bytes: m1BAgentPhaseJsonBytes(phaseReceipt) }
  ]);
} else {
  await writePrivateJsonAtomic(acceptancePath, acceptance);
  for (const { path, value } of sealedArtifacts) {
    await writePrivateJsonAtomic(path, value);
  }
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: acceptance.schemaVersion,
  status: acceptance.status,
  acceptanceMode: acceptance.acceptanceMode,
  ...(exactRelease
    ? {
        candidateReleaseId: acceptance.candidateReleaseId,
        acceptancePhase: acceptance.acceptancePhase,
        candidateMarker: acceptance.candidateMarker,
        accountHash: acceptance.accountHash,
        databaseStartedAt: acceptance.databaseStartedAt,
        facilityId: acceptance.facilityId,
        creditLineId: acceptance.creditLineId,
        beforeMarkerPath
      }
    : {}),
  subjectId: acceptance.subjectId,
  mandateId: acceptance.mandateId,
  creditIntentId: acceptance.creditIntentId,
  creditOfferId: acceptance.creditOfferId,
  obligationId: acceptance.obligationId,
  evidenceEventCount: acceptance.evidenceEventCount,
  acceptancePath,
  ...(phaseReceiptPath ? { phaseReceiptPath } : {}),
  artifacts: extractedArtifacts,
  sandboxOnly: acceptance.sandboxOnly,
  productionFundsMoved: acceptance.productionFundsMoved
}, null, 2)}\n`);
