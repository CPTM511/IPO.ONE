import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  unlink,
  writeFile
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLocalStack } from "../packages/deployment-topology/src/index.js";
import {
  M1_B_RISK_MFA_LIVE_OPERATION_IDS,
  M1_B_RISK_MFA_OPERATION_IDS,
  M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS,
  M1_B_RISK_MFA_PROTECTED_STATE_TABLES
} from "../packages/release-governance/src/m1-b-acceptance-evidence.js";
import {
  assertExactLocalReleaseSource,
  prepareLocalReleaseBuildContext,
  resolveLocalReviewPorts,
  resolveLocalReleaseIdentity
} from "./local-release-identity.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTANCE = "ipo-one-local";
const COMPOSE_FILE = resolve(ROOT, "deploy/local/compose.yaml");
const ENV_FILE = resolve(ROOT, ".ipo-one/local-stack/stack.env");
const CONTRACT_FILE = resolve(ROOT, "deploy/local/stack.v1.json");
const PROFILE_FILE = resolve(ROOT, "deploy/local/private-pilot-profile.v1.json");
const SECRET_DIRECTORY = resolve(ROOT, ".ipo-one/local-stack");
const PILOT_DATABASE_SECRET_FILE = resolve(
  SECRET_DIRECTORY,
  "private-pilot-db-secret"
);
const OUTPUT_DIRECTORY = resolve(ROOT, "output/playwright/m1-b-p0-5");
const AGENT_WORKFLOW_DIRECTORY = resolve(
  ROOT,
  ".ipo-one/local-stack/agent-workflows"
);
const REGRESSION_TEST_NAME =
  "SIWE-only Risk and Operations sessions fail closed for every recent-MFA policy";
const REGRESSION_TEST_PATH =
  "modules/authorization/test/authorization-service.test.js";
const REGRESSION_SOURCE_PATHS = Object.freeze([
  "apps/private-pilot/src/m1-b-risk-mfa-boundary-acceptance.js",
  "apps/private-pilot/src/m1-b-acceptance-postgres.js",
  "scripts/local-risk-mfa-boundary-acceptance.mjs",
  "modules/authorization/src/authorization-policy.js",
  "modules/authorization/src/authorization-service.js",
  REGRESSION_TEST_PATH
]);
const MAX_CHILD_OUTPUT_BYTES = 4 * 1024 * 1024;
const PRODUCER_SCRIPT =
  "apps/private-pilot/src/m1-b-risk-mfa-boundary-acceptance.js";

function fail(message) {
  process.stderr.write(`M1-B Risk MFA boundary acceptance: ${message}\n`);
  process.exit(1);
}

function exactKeys(value, keys) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
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
    metadata.isSymbolicLink() ||
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

async function assertReviewedDatabaseSecretMountSource() {
  const [directory, secret] = await Promise.all([
    lstat(SECRET_DIRECTORY),
    lstat(PILOT_DATABASE_SECRET_FILE)
  ]);
  assert.equal(directory.isDirectory(), true);
  assert.equal(directory.isSymbolicLink(), false);
  assert.equal(directory.mode & 0o777, 0o700);
  assert.equal(secret.isFile(), true);
  assert.equal(secret.isSymbolicLink(), false);
  assert.equal(secret.mode & 0o777, 0o644);
  const compose = await readFile(COMPOSE_FILE, "utf8");
  assert.match(
    compose,
    /private-pilot-db-secret:\/run\/secrets\/private-pilot-db-secret:ro/
  );
}

async function writePrivateJsonAtomic(path, value) {
  const temporaryPath = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(value, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 }
    );
    await link(temporaryPath, path);
  } finally {
    try {
      await unlink(temporaryPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function baseLimaArguments(releaseIdentity, localReviewPorts, releaseBuildContext) {
  return [
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
    COMPOSE_FILE
  ];
}

function docker(args, { description }) {
  const result = spawnSync(
    "limactl",
    ["shell", "--workdir", ROOT, INSTANCE, "docker", ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: MAX_CHILD_OUTPUT_BYTES
    }
  );
  if (result.error || result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    fail(description);
  }
  return result.stdout.trim();
}

function compose(baseArgs, args, { description }) {
  const result = spawnSync(
    "limactl",
    [...baseArgs, ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024
    }
  );
  if (result.error || result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(description);
  }
  return result.stdout.trim();
}

function assertRunningServiceImageIds(baseArgs, runtimeImageId) {
  for (const service of ["pilot", "worker"]) {
    const containerId = compose(baseArgs, ["ps", "--quiet", service], {
      description: `the running ${service} container is unavailable`
    });
    if (!/^[0-9a-f]{12,64}$/.test(containerId)) {
      fail(`the running ${service} container ID is invalid`);
    }
    const containerImageId = docker(
      ["inspect", containerId, "--format", "{{.Image}}"],
      { description: `the running ${service} image ID is unavailable` }
    );
    if (containerImageId !== runtimeImageId) {
      fail(
        `the running ${service} does not use the rebuilt tracked-source image; restart the exact stack and repeat recovery first`
      );
    }
  }
}

function runRegressionTest() {
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-name-pattern",
      REGRESSION_TEST_NAME,
      REGRESSION_TEST_PATH
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: MAX_CHILD_OUTPUT_BYTES
    }
  );
  if (result.error || result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail("the exact-source 21-operation AuthorizationService regression failed");
  }
  return createHash("sha256").update(result.stdout).digest("hex");
}

async function regressionSourceDigests() {
  return Promise.all(REGRESSION_SOURCE_PATHS.map(async (path) => ({
    path,
    sha256: createHash("sha256")
      .update(await readFile(resolve(ROOT, path)))
      .digest("hex")
  })));
}

function riskProducerEnvironmentEntries(environment) {
  assert.equal(Array.isArray(environment.sourceFiles), true);
  assert.equal(environment.sourceFiles.length > 0, true);
  const producerDatabaseUrl = new URL(environment.databaseUrl);
  assert.equal(producerDatabaseUrl.username, "");
  assert.equal(producerDatabaseUrl.password, "");
  const entries = [
    ["IPO_ONE_M1_B_RELEASE_SHA", environment.releaseSha],
    [
      "IPO_ONE_M1_B_EXPECTED_DATABASE_STARTED_AT",
      environment.databaseStartedAt
    ],
    ["IPO_ONE_M1_B_TENANT_ID", environment.tenantId],
    ["IPO_ONE_M1_B_RISK_PORTFOLIO_ID", environment.riskPortfolioId],
    ["IPO_ONE_M1_B_RISK_SUBJECT_ID", environment.subjectId],
    ["IPO_ONE_M1_B_AUTH_TEST_OUTPUT_SHA256", environment.testOutputSha256],
    [
      "IPO_ONE_M1_B_AUTH_SOURCE_DIGESTS_JSON",
      JSON.stringify(environment.sourceFiles)
    ],
    ["IPO_ONE_M1_B_RUNTIME_IMAGE_ID", environment.runtimeImageId],
    [
      "IPO_ONE_M1_B_RELEASE_IDENTITY_SHA256",
      environment.releaseIdentityArtifactSha256
    ],
    ["DATABASE_URL", producerDatabaseUrl.toString()],
    ...(environment.timeoutMs === undefined
      ? []
      : [["IPO_ONE_M1_B_RISK_BOUNDARY_TIMEOUT_MS", environment.timeoutMs]])
  ];
  for (const [name, value] of entries) {
    assert.match(name, /^[A-Z][A-Z0-9_]*$/);
    assert.equal(
      (typeof value === "string" || Number.isSafeInteger(value)) &&
        String(value).length > 0 &&
        !/[\0\r\n]/.test(String(value)),
      true
    );
  }
  assert.equal(new Set(entries.map(([name]) => name)).size, entries.length);
  return entries.map(([name, value]) => `${name}=${value}`);
}

export function assertRiskProducerArguments(args, { baseArgs, environment }) {
  assert.equal(Array.isArray(args), true);
  assert.equal(Array.isArray(baseArgs), true);
  assert.deepEqual(args.slice(0, baseArgs.length), baseArgs);
  let cursor = baseArgs.length;
  assert.deepEqual(args.slice(cursor, cursor + 4), [
    "run",
    "--rm",
    "--no-deps",
    "--no-TTY"
  ]);
  cursor += 4;
  const actualEnvironment = [];
  while (args[cursor] === "--env") {
    const value = args[cursor + 1];
    assert.equal(
      typeof value === "string" && /^[A-Z][A-Z0-9_]*=.+$/.test(value),
      true
    );
    actualEnvironment.push(value);
    cursor += 2;
  }
  const actualNames = actualEnvironment.map(
    (value) => value.slice(0, value.indexOf("="))
  );
  assert.equal(new Set(actualNames).size, actualNames.length);
  assert.deepEqual(actualEnvironment, riskProducerEnvironmentEntries(environment));
  assert.deepEqual(args.slice(cursor), ["pilot", PRODUCER_SCRIPT]);
  return true;
}

export function createRiskProducerArguments(baseArgs, environment) {
  const args = [
    ...baseArgs,
    "run",
    "--rm",
    "--no-deps",
    "--no-TTY",
    ...riskProducerEnvironmentEntries(environment).flatMap((value) => [
      "--env",
      value
    ]),
    "pilot",
    PRODUCER_SCRIPT
  ];
  assertRiskProducerArguments(args, { baseArgs, environment });
  return Object.freeze(args);
}

export function assertRiskProducerSourceDigestsUnchanged(before, after) {
  assert.deepEqual(after, before);
  return true;
}

function runProducer(baseArgs, environment) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      "limactl",
      createRiskProducerArguments(baseArgs, environment),
      {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "inherit"]
      }
    );
    const output = [];
    let outputBytes = 0;
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_CHILD_OUTPUT_BYTES) {
        child.kill("SIGTERM");
        rejectRun(new Error("Risk producer output exceeded 4 MiB"));
        return;
      }
      output.push(chunk);
    });
    child.on("error", rejectRun);
    child.on("close", (status) => {
      if (status !== 0) {
        rejectRun(new Error(`Risk producer exited with status ${status}`));
        return;
      }
      resolveRun(Buffer.concat(output).toString("utf8"));
    });
  });
}

function assertReceipt(
  receipt,
  releaseSha,
  databaseStartedAt,
  sourceFiles,
  runtimeImageId,
  releaseIdentityArtifactSha256
) {
  assert.equal(
    exactKeys(receipt, [
      "schemaVersion",
      "candidateReleaseId",
      "sourceRuntime",
      "capturedAt",
      "databaseStartedAt",
      "postRestartVerification",
      "runtimeBinding",
      "role",
      "status",
      "releaseLevel",
      "policy",
      "authorizationRegression",
      "liveRuntimeObservation",
      "protectedState",
      "exposure",
      "authority",
      "redaction"
    ]),
    true
  );
  assert.equal(receipt.schemaVersion, "m1_b_risk_mfa_boundary_receipt.v2");
  assert.equal(receipt.candidateReleaseId, releaseSha);
  assert.equal(receipt.databaseStartedAt, databaseStartedAt);
  assert.equal(receipt.sourceRuntime, "local_exact_commit");
  assert.equal(receipt.status, "passed_fail_closed");
  assert.deepEqual(receipt.runtimeBinding, {
    buildSource: "tracked_git_archive",
    imageId: runtimeImageId,
    longLivedPilotImageMatch: true,
    longLivedWorkerImageMatch: true,
    releaseIdentityArtifactSha256
  });
  assert.deepEqual(
    receipt.policy.protectedOperationIds,
    M1_B_RISK_MFA_OPERATION_IDS
  );
  assert.deepEqual(
    receipt.authorizationRegression.operationIds,
    M1_B_RISK_MFA_OPERATION_IDS
  );
  assert.deepEqual(receipt.authorizationRegression.sourceFiles, sourceFiles);
  assert.deepEqual(
    receipt.liveRuntimeObservation.operationIds,
    M1_B_RISK_MFA_LIVE_OPERATION_IDS
  );
  const observationStartedAt = Date.parse(
    receipt.liveRuntimeObservation.observationStartedAt ?? ""
  );
  const sessionAuthTime = Date.parse(
    receipt.liveRuntimeObservation.session?.authTime ?? ""
  );
  const sessionCreatedAt = Date.parse(
    receipt.liveRuntimeObservation.session?.createdAt ?? ""
  );
  assert.equal(
    Number.isFinite(observationStartedAt) &&
      observationStartedAt > Date.parse(databaseStartedAt) &&
      Number.isFinite(sessionAuthTime) &&
      sessionAuthTime >= observationStartedAt &&
      Number.isFinite(sessionCreatedAt) &&
      sessionAuthTime <= sessionCreatedAt,
    true
  );
  assert.deepEqual(receipt.liveRuntimeObservation.mfaDenialAttribution, {
    requiredCapabilities: ["risk.read.tenant", "risk.freeze"],
    roleBindingVerified: true,
    policyBindingVerified: true,
    clientBindingVerified: true,
    sessionCredentialMembershipCapabilitiesVerified: true,
    auditCorrelationBindingVerified: true,
    auditSessionTokenBindingVerified: true
  });
  const credentialBoundary = receipt.liveRuntimeObservation.credentialBoundary;
  assert.equal(
    exactKeys(credentialBoundary, [
      "protectedActorTypes",
      "activeMembershipCountsByActorType",
      "activeCredentialCount",
      "activeAuthenticationMethods",
      "nonSiweActiveCredentialCount",
      "reviewedActiveIdentitySetVerified"
    ]),
    true
  );
  assert.deepEqual(credentialBoundary.protectedActorTypes, [
    "auditor",
    "operations_operator",
    "risk_operator"
  ]);
  assert.deepEqual(credentialBoundary.activeMembershipCountsByActorType, {
    auditor: 0,
    operations_operator: 0,
    risk_operator: 1
  });
  assert.equal(
    Number.isSafeInteger(credentialBoundary.activeCredentialCount) &&
      credentialBoundary.activeCredentialCount >= 1,
    true
  );
  assert.deepEqual(credentialBoundary.activeAuthenticationMethods, ["siwe"]);
  assert.equal(credentialBoundary.nonSiweActiveCredentialCount, 0);
  assert.equal(credentialBoundary.reviewedActiveIdentitySetVerified, true);
  assert.deepEqual(
    receipt.protectedState.tableNames,
    M1_B_RISK_MFA_PROTECTED_STATE_TABLES
  );
  assert.deepEqual(
    receipt.protectedState.minimumRowCounts,
    M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS
  );
  for (const [tableName, minimum] of Object.entries(
    M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS
  )) {
    assert.ok(receipt.protectedState.observedRowCounts[tableName] >= minimum);
  }
  assert.equal(receipt.protectedState.beforeHash, receipt.protectedState.afterHash);
  assert.equal(receipt.protectedState.privilegedMutationCount, 0);
  assert.equal(receipt.protectedState.additionalEconomicEffectCount, 0);
  assert.deepEqual(receipt.exposure, {
    evidenceScope: "local_private_pilot_exact_commit",
    activeRiskAuthenticationMethods: ["siwe"],
    nonSiweActiveRiskCredentialCount: 0,
    hostedRiskSurfaceEvaluated: false
  });
  assert.deepEqual(receipt.redaction, {
    containsSecrets: false,
    containsRawPii: false,
    containsSessionMaterial: false
  });
}

export async function runLocalRiskMfaBoundaryAcceptance() {
const releaseIdentity = resolveLocalReleaseIdentity();
if (!releaseIdentity.exactCandidate) {
  fail("IPO_ONE_M1_B_RELEASE_SHA must name the clean exact candidate");
}
assertExactLocalReleaseSource(releaseIdentity, { root: ROOT });
const localReviewPorts = resolveLocalReviewPorts({ releaseIdentity });
const releaseBuildContext = await prepareLocalReleaseBuildContext(
  releaseIdentity,
  { root: ROOT }
);
const localStack = parseLocalStack(await readFile(CONTRACT_FILE, "utf8"));
const producerDatabaseUrl =
  `postgresql://${localStack.database.guestAddress}:` +
  `${localStack.database.guestPort}/${localStack.database.database}`;
const parsedProducerDatabaseUrl = new URL(producerDatabaseUrl);
if (
  parsedProducerDatabaseUrl.username !== "" ||
  parsedProducerDatabaseUrl.password !== "" ||
  parsedProducerDatabaseUrl.hostname !== localStack.database.guestAddress ||
  Number(parsedProducerDatabaseUrl.port) !== localStack.database.guestPort ||
  parsedProducerDatabaseUrl.pathname !== `/${localStack.database.database}`
) {
  fail("the least-authority producer database endpoint is invalid");
}
const profile = JSON.parse(await readFile(PROFILE_FILE, "utf8"));
if (
  profile.schemaVersion !== "private_pilot_tenant_profile.v1" ||
  profile.mode !== "local_no_funds" ||
  typeof profile.tenantId !== "string" ||
  typeof profile.riskPortfolioId !== "string" ||
  profile.identities?.risk?.actorId !== "actor_risk_operations_pilot" ||
  profile.syntheticDataOnly !== true ||
  profile.realFundsEnabled !== false ||
  profile.remoteAccessEnabled !== false
) {
  fail("the reviewed local private-pilot profile is invalid");
}
const baseArgs = baseLimaArguments(
  releaseIdentity,
  localReviewPorts,
  releaseBuildContext
);

compose(baseArgs, ["build", "pilot"], {
  description: "the exact tracked-source Pilot image rebuild failed"
});

const revisionLabel = "{{ index .Config.Labels \"org.opencontainers.image.revision\" }}";
const imageRevision = docker(
  ["image", "inspect", localStack.pilot.image, "--format", revisionLabel],
  { description: "the exact-candidate OCI image is unavailable" }
);
if (imageRevision !== releaseIdentity.revision) {
  fail("the local OCI image revision does not match the requested candidate");
}
const runtimeImageId = docker(
  ["image", "inspect", localStack.pilot.image, "--format", "{{.Id}}"],
  { description: "the rebuilt exact-candidate image ID is unavailable" }
);
if (!/^sha256:[0-9a-f]{64}$/.test(runtimeImageId)) {
  fail("the rebuilt exact-candidate image ID is invalid");
}
assertRunningServiceImageIds(baseArgs, runtimeImageId);

const releaseIdentityPath = resolve(
  OUTPUT_DIRECTORY,
  `${releaseIdentity.revision}.local-release-identity.json`
);
const localRuntimeIdentity = await readPrivateJson(
  releaseIdentityPath,
  "the exact local runtime identity"
);
if (
  localRuntimeIdentity.schemaVersion !== "m1_b_local_release_identity.v1" ||
  localRuntimeIdentity.releaseId !== releaseIdentity.revision ||
  localRuntimeIdentity.imageRevision !== releaseIdentity.revision ||
  localRuntimeIdentity.pilotRevision !== releaseIdentity.revision ||
  localRuntimeIdentity.workerRevision !== releaseIdentity.revision ||
  localRuntimeIdentity.postgresBacked !== true ||
  localRuntimeIdentity.fixtureHost !== false
) {
  fail("the exact local runtime identity is invalid");
}
const releaseIdentityArtifactSha256 = createHash("sha256")
  .update(await readFile(releaseIdentityPath))
  .digest("hex");

const afterRestartPath = resolve(
  AGENT_WORKFLOW_DIRECTORY,
  `${releaseIdentity.revision}.after-restart.acceptance.json`
);
const afterRestart = await readPrivateJson(
  afterRestartPath,
  "the exact post-restart Agent acceptance marker"
);
if (
  afterRestart.schemaVersion !== "local_agent_reference_acceptance.v1" ||
  afterRestart.status !== "passed" ||
  afterRestart.acceptanceMode !== "after_restart_recovered" ||
  afterRestart.acceptancePhase !== "after_restart" ||
  afterRestart.candidateReleaseId !== releaseIdentity.revision ||
  typeof afterRestart.subjectId !== "string" ||
  !/^subject_[0-9a-f-]{36}$/.test(afterRestart.subjectId) ||
  !Number.isFinite(Date.parse(afterRestart.databaseStartedAt ?? "")) ||
  afterRestart.canonicalLifecycleReadOnly !== true ||
  afterRestart.lifecycleMutationPerformed !== false ||
  afterRestart.sandboxOnly !== true ||
  afterRestart.productionFundsMoved !== false
) {
  fail("the post-restart Agent acceptance marker is invalid");
}

const testOutputSha256 = runRegressionTest();
const sourceFiles = await regressionSourceDigests();
try {
  await assertReviewedDatabaseSecretMountSource();
} catch {
  fail("the reviewed read-only database secret mount source is invalid");
}
let producerOutput;
try {
  producerOutput = await runProducer(baseArgs, {
    releaseSha: releaseIdentity.revision,
    databaseStartedAt: new Date(afterRestart.databaseStartedAt).toISOString(),
    tenantId: profile.tenantId,
    riskPortfolioId: profile.riskPortfolioId,
    subjectId: afterRestart.subjectId,
    testOutputSha256,
    sourceFiles,
    runtimeImageId,
    releaseIdentityArtifactSha256,
    databaseUrl: producerDatabaseUrl,
    timeoutMs: process.env.IPO_ONE_M1_B_RISK_BOUNDARY_TIMEOUT_MS
  });
} catch (error) {
  fail(error?.message ?? "the Risk boundary producer failed");
}
assertRunningServiceImageIds(baseArgs, runtimeImageId);
try {
  assertExactLocalReleaseSource(releaseIdentity, { root: ROOT });
  assertRiskProducerSourceDigestsUnchanged(
    sourceFiles,
    await regressionSourceDigests()
  );
} catch {
  fail("the exact candidate source changed while Risk Evidence was collected");
}

let receipt;
try {
  receipt = JSON.parse(producerOutput);
  assertReceipt(
    receipt,
    releaseIdentity.revision,
    new Date(afterRestart.databaseStartedAt).toISOString(),
    sourceFiles,
    runtimeImageId,
    releaseIdentityArtifactSha256
  );
} catch {
  fail("the Risk boundary producer returned an invalid receipt");
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true, mode: 0o700 });
const outputMetadata = await lstat(OUTPUT_DIRECTORY);
if (!outputMetadata.isDirectory() || outputMetadata.isSymbolicLink()) {
  fail("the P0-5 Evidence destination must be one real directory");
}
await chmod(OUTPUT_DIRECTORY, 0o700);
const receiptPath = resolve(
  OUTPUT_DIRECTORY,
  `${releaseIdentity.revision}.risk-mfa-boundary.json`
);
try {
  await writePrivateJsonAtomic(receiptPath, receipt);
} catch (error) {
  if (error?.code === "EEXIST") {
    fail("the exact-candidate Risk receipt already exists; it will not be overwritten");
  }
  fail("the exact-candidate Risk receipt could not be written atomically");
}
const receiptSha256 = createHash("sha256")
  .update(await readFile(receiptPath))
  .digest("hex");
process.stdout.write(`${JSON.stringify({
  schemaVersion: receipt.schemaVersion,
  status: receipt.status,
  candidateReleaseId: receipt.candidateReleaseId,
  databaseStartedAt: receipt.databaseStartedAt,
  exhaustiveRegressionDenialCount: receipt.authorizationRegression.denials.length,
  liveRuntimeDenialCount: receipt.liveRuntimeObservation.checks.length,
  privilegedMutationCount: receipt.protectedState.privilegedMutationCount,
  receiptPath,
  receiptSha256
}, null, 2)}\n`);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await runLocalRiskMfaBoundaryAcceptance();
}
