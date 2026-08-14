import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  unlink,
  writeFile
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLocalStack } from "../packages/deployment-topology/src/index.js";
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
const AGENT_WORKFLOW_DIRECTORY = resolve(
  ROOT,
  ".ipo-one/local-stack/agent-workflows"
);
const PRODUCER_SCRIPT =
  "apps/private-pilot/src/m1-b-human-capital-partner-acceptance-cli.js";
const SOURCE_PATHS = Object.freeze([
  "apps/private-pilot/src/m1-b-acceptance-postgres.js",
  "apps/private-pilot/src/m1-b-human-capital-partner-acceptance.js",
  "apps/private-pilot/src/m1-b-human-capital-partner-producer.js",
  PRODUCER_SCRIPT,
  "scripts/local-human-capital-partner-acceptance.mjs"
]);
const SHA = /^[0-9a-f]{40}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const MAX_CHILD_OUTPUT_BYTES = 8 * 1024 * 1024;

function fail(message) {
  process.stderr.write(`M1-B Human/Capital Partner acceptance: ${message}\n`);
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

export function parseM1BHumanCapitalPartnerAcceptanceArguments(argv, {
  root = ROOT
} = {}) {
  assert.equal(Array.isArray(argv), true);
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const names = new Set([
    "--candidate-release-id",
    "--database-started-at",
    "--pilot-image-id",
    "--output-root"
  ]);
  assert.equal(args.length, names.size * 2);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    assert.equal(names.has(name), true);
    assert.equal(values.has(name), false);
    assert.equal(typeof value === "string" && value.length > 0, true);
    values.set(name, value);
  }
  const candidateReleaseId = values.get("--candidate-release-id");
  const databaseStartedAt = values.get("--database-started-at");
  const pilotImageId = values.get("--pilot-image-id");
  const outputRoot = resolve(root, values.get("--output-root"));
  const allowedOutputParent = resolve(root, "output/playwright");
  const outputRelation = relative(allowedOutputParent, outputRoot);
  assert.match(candidateReleaseId, SHA);
  assert.equal(
    Number.isFinite(Date.parse(databaseStartedAt)) &&
      new Date(databaseStartedAt).toISOString() === databaseStartedAt,
    true
  );
  assert.match(pilotImageId, IMAGE_ID);
  assert.equal(
    outputRelation.length > 0 &&
      outputRelation !== ".." &&
      !outputRelation.startsWith(`..${sep}`) &&
      !resolve(outputRoot).startsWith(`${resolve(root, ".ipo-one")}${sep}`),
    true
  );
  return Object.freeze({
    candidateReleaseId,
    databaseStartedAt,
    pilotImageId,
    outputRoot
  });
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

export async function assertM1BPrivateAcceptanceOutputDirectory(path, {
  root = ROOT
} = {}) {
  const lexicalRoot = resolve(root);
  const lexicalAllowedParent = resolve(root, "output/playwright");
  const lexicalOutput = resolve(path);
  const relation = relative(lexicalAllowedParent, lexicalOutput);
  assert.equal(
    relation.length > 0 &&
      relation !== ".." &&
      !relation.startsWith(`..${sep}`),
    true
  );
  let cursor = lexicalRoot;
  for (const component of relative(lexicalRoot, lexicalOutput).split(sep)) {
    cursor = resolve(cursor, component);
    const metadata = await lstat(cursor);
    assert.equal(metadata.isDirectory(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    if (cursor === lexicalOutput) {
      assert.equal(metadata.mode & 0o777, 0o700);
    }
  }
  const [rootReal, allowedReal, outputReal] = await Promise.all([
    realpath(lexicalRoot),
    realpath(lexicalAllowedParent),
    realpath(lexicalOutput)
  ]);
  assert.equal(allowedReal, resolve(rootReal, "output/playwright"));
  const realRelation = relative(allowedReal, outputReal);
  assert.equal(
    realRelation.length > 0 &&
      realRelation !== ".." &&
      !realRelation.startsWith(`..${sep}`),
    true
  );
  return outputReal;
}

async function assertReviewedDatabaseSecretMountSource() {
  const [directory, secret, compose] = await Promise.all([
    lstat(SECRET_DIRECTORY),
    lstat(PILOT_DATABASE_SECRET_FILE),
    readFile(COMPOSE_FILE, "utf8")
  ]);
  assert.equal(directory.isDirectory(), true);
  assert.equal(directory.isSymbolicLink(), false);
  assert.equal(directory.mode & 0o777, 0o700);
  assert.equal(secret.isFile(), true);
  assert.equal(secret.isSymbolicLink(), false);
  assert.equal(secret.mode & 0o777, 0o644);
  assert.match(
    compose,
    /private-pilot-db-secret:\/run\/secrets\/private-pilot-db-secret:ro/
  );
}

async function writePrivateJsonPairAtomic(entries) {
  const temporaries = [];
  const linked = [];
  try {
    for (const [path, value] of entries) {
      try {
        await lstat(path);
        const error = new Error("acceptance receipt already exists");
        error.code = "EEXIST";
        throw error;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      const temporaryPath =
        `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
      await writeFile(
        temporaryPath,
        `${JSON.stringify(value, null, 2)}\n`,
        { encoding: "utf8", flag: "wx", mode: 0o600 }
      );
      temporaries.push([temporaryPath, path]);
    }
    for (const [temporaryPath, path] of temporaries) {
      await link(temporaryPath, path);
      linked.push(path);
    }
  } catch (error) {
    for (const path of linked) {
      try {
        await unlink(path);
      } catch {
        // This run created the path; best effort restores all-or-none output.
      }
    }
    throw error;
  } finally {
    for (const [temporaryPath] of temporaries) {
      try {
        await unlink(temporaryPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
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
  const result = spawnSync("limactl", [...baseArgs, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024
  });
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
        `the running ${service} does not use the exact tracked-source image; restart once and repeat Agent-after recovery`
      );
    }
  }
}

function serviceIdentity(baseArgs, service) {
  const containerId = compose(baseArgs, ["ps", "--quiet", service], {
    description: `the running ${service} container is unavailable`
  });
  if (!/^[0-9a-f]{12,64}$/.test(containerId)) {
    fail(`the running ${service} container ID is invalid`);
  }
  const imageId = docker(
    ["inspect", containerId, "--format", "{{.Image}}"],
    { description: `the running ${service} image ID is unavailable` }
  );
  const startedAt = docker(
    ["inspect", containerId, "--format", "{{.State.StartedAt}}"],
    { description: `the running ${service} start time is unavailable` }
  );
  assert.equal(Number.isFinite(Date.parse(startedAt)), true);
  return Object.freeze({
    service,
    containerId,
    imageId,
    startedAt: new Date(startedAt).toISOString()
  });
}

function serviceIdentities(baseArgs) {
  return Object.freeze(["postgres", "pilot", "worker"].map((service) =>
    serviceIdentity(baseArgs, service)
  ));
}

export function assertHumanCapitalPartnerServiceContinuity(before, after) {
  assert.deepEqual(after, before);
  return true;
}

async function sourceDigests() {
  return Promise.all(SOURCE_PATHS.map(async (path) => ({
    path,
    sha256: createHash("sha256")
      .update(await readFile(resolve(ROOT, path)))
      .digest("hex")
  })));
}

function producerEnvironmentEntries(environment) {
  const databaseUrl = new URL(environment.databaseUrl);
  assert.equal(databaseUrl.username, "");
  assert.equal(databaseUrl.password, "");
  const entries = [
    ["IPO_ONE_M1_B_RELEASE_SHA", environment.candidateReleaseId],
    [
      "IPO_ONE_M1_B_EXPECTED_DATABASE_STARTED_AT",
      environment.databaseStartedAt
    ],
    ["IPO_ONE_M1_B_TENANT_ID", environment.tenantId],
    ["IPO_ONE_M1_B_HUMAN_ACTOR_ID", environment.humanActorId],
    [
      "IPO_ONE_M1_B_CAPITAL_PARTNER_ACTOR_ID",
      environment.capitalPartnerActorId
    ],
    [
      "IPO_ONE_PILOT_DB_SECRET_FILE",
      "/run/secrets/private-pilot-db-secret"
    ],
    ["DATABASE_URL", databaseUrl.toString()]
  ];
  for (const [name, value] of entries) {
    assert.match(name, /^[A-Z][A-Z0-9_]*$/);
    assert.equal(
      typeof value === "string" &&
        value.length > 0 &&
        !/[\0\r\n]/.test(value),
      true
    );
  }
  assert.equal(new Set(entries.map(([name]) => name)).size, entries.length);
  return entries.map(([name, value]) => `${name}=${value}`);
}

export function assertHumanCapitalPartnerProducerArguments(
  args,
  { baseArgs, environment }
) {
  assert.equal(Array.isArray(args), true);
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
  assert.equal(
    new Set(actualEnvironment.map((entry) => entry.split("=", 1)[0])).size,
    actualEnvironment.length
  );
  assert.deepEqual(actualEnvironment, producerEnvironmentEntries(environment));
  assert.deepEqual(args.slice(cursor), ["pilot", PRODUCER_SCRIPT]);
  return true;
}

export function createHumanCapitalPartnerProducerArguments(baseArgs, environment) {
  const args = [
    ...baseArgs,
    "run",
    "--rm",
    "--no-deps",
    "--no-TTY",
    ...producerEnvironmentEntries(environment).flatMap((value) => [
      "--env",
      value
    ]),
    "pilot",
    PRODUCER_SCRIPT
  ];
  assertHumanCapitalPartnerProducerArguments(args, { baseArgs, environment });
  return Object.freeze(args);
}

function runProducer(baseArgs, environment) {
  const child = spawn(
    "limactl",
    createHumanCapitalPartnerProducerArguments(baseArgs, environment),
    {
      cwd: ROOT,
      stdio: ["inherit", "pipe", "inherit"]
    }
  );
  return collectM1BProducerOutput(child);
}

export function collectM1BProducerOutput(
  child,
  { maximumBytes = MAX_CHILD_OUTPUT_BYTES } = {}
) {
  assert.equal(
    child?.stdout?.on instanceof Function &&
      child?.on instanceof Function &&
      child?.kill instanceof Function &&
      Number.isSafeInteger(maximumBytes) && maximumBytes >= 1,
    true
  );
  return new Promise((resolveRun, rejectRun) => {
    const output = [];
    let outputBytes = 0;
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maximumBytes) {
        child.kill("SIGTERM");
        rejectRun(new Error("acceptance producer output exceeded its bound"));
        return;
      }
      output.push(chunk);
    });
    child.on("error", rejectRun);
    child.on("close", (status) => {
      if (status !== 0) {
        rejectRun(new Error(`acceptance producer exited with status ${status}`));
        return;
      }
      resolveRun(Buffer.concat(output).toString("utf8"));
    });
  });
}

function assertReceiptBundle(bundle, options) {
  assert.equal(
    exactKeys(bundle, [
      "schemaVersion",
      "candidateReleaseId",
      "databaseStartedAt",
      "databasePostmasterStartedAt",
      "human",
      "capitalPartner"
    ]),
    true
  );
  assert.equal(
    bundle.schemaVersion,
    "m1_b_human_capital_partner_acceptance_bundle.v1"
  );
  assert.equal(bundle.candidateReleaseId, options.candidateReleaseId);
  assert.equal(bundle.databaseStartedAt, options.databaseStartedAt);
  assert.equal(bundle.databasePostmasterStartedAt, options.databaseStartedAt);
  const expected = [
    [bundle.human, "m1_b_human_critical_receipt.v1", "human"],
    [
      bundle.capitalPartner,
      "m1_b_capital_partner_critical_receipt.v1",
      "capital_partner"
    ]
  ];
  for (const [receipt, schemaVersion, role] of expected) {
    assert.equal(receipt?.schemaVersion, schemaVersion);
    assert.equal(receipt?.candidateReleaseId, options.candidateReleaseId);
    assert.equal(receipt?.databaseStartedAt, options.databaseStartedAt);
    assert.equal(receipt?.sourceRuntime, "local_exact_commit");
    assert.equal(receipt?.postRestartVerification, true);
    assert.equal(receipt?.role, role);
    assert.equal(receipt?.status, "passed");
    assert.equal(receipt?.durability?.canonicalPersistence, "postgresql");
    assert.equal(receipt?.durability?.fixtureUsed, false);
    assert.equal(receipt?.safety?.sandboxOnly, true);
    assert.equal(receipt?.redaction?.containsSecrets, false);
    assert.equal(receipt?.redaction?.containsRawPii, false);
    assert.equal(receipt?.redaction?.containsSessionMaterial, false);
    assert.equal(receipt?.redaction?.containsRawSignature, false);
    assert.equal(receipt?.redaction?.containsWalletAddress, false);
    assert.equal(receipt?.redaction?.containsDatabaseCredentials, false);
  }
  assert.equal(bundle.human.safety.productionFundsMoved, false);
  assert.equal(bundle.capitalPartner.safety.productionFundsApproved, false);
  assert.equal(bundle.capitalPartner.safety.fundsAuthority, false);
  return true;
}

export async function runLocalHumanCapitalPartnerAcceptance({
  argv = process.argv.slice(2)
} = {}) {
  let options;
  try {
    options = parseM1BHumanCapitalPartnerAcceptanceArguments(argv);
  } catch {
    fail(
      "expected exact --candidate-release-id, --database-started-at, --pilot-image-id, and --output-root arguments"
    );
  }
  try {
    await assertM1BPrivateAcceptanceOutputDirectory(options.outputRoot);
  } catch {
    fail("the existing P0-5 Evidence destination is not a private real directory");
  }
  const releaseIdentity = resolveLocalReleaseIdentity({
    environment: {
      ...process.env,
      IPO_ONE_M1_B_RELEASE_SHA: options.candidateReleaseId
    }
  });
  assertExactLocalReleaseSource(releaseIdentity, { root: ROOT });
  const sourceBefore = await sourceDigests();
  const localReviewPorts = resolveLocalReviewPorts({
    environment: process.env,
    releaseIdentity
  });
  const releaseBuildContext = await prepareLocalReleaseBuildContext(
    releaseIdentity,
    { root: ROOT }
  );
  const localStack = parseLocalStack(await readFile(CONTRACT_FILE, "utf8"));
  const databaseUrl =
    `postgresql://${localStack.database.guestAddress}:` +
    `${localStack.database.guestPort}/${localStack.database.database}`;
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (
    parsedDatabaseUrl.username !== "" ||
    parsedDatabaseUrl.password !== "" ||
    parsedDatabaseUrl.hostname !== localStack.database.guestAddress ||
    Number(parsedDatabaseUrl.port) !== localStack.database.guestPort ||
    parsedDatabaseUrl.pathname !== `/${localStack.database.database}`
  ) {
    fail("the least-authority producer database endpoint is invalid");
  }
  const profile = JSON.parse(await readFile(PROFILE_FILE, "utf8"));
  if (
    profile.schemaVersion !== "private_pilot_tenant_profile.v1" ||
    profile.mode !== "local_no_funds" ||
    typeof profile.tenantId !== "string" ||
    profile.identities?.borrower?.actorId !== "actor_human_borrower_pilot" ||
    profile.identities?.capitalPartner?.actorId !==
      "actor_capital_partner_pilot" ||
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
  const revisionLabel =
    "{{ index .Config.Labels \"org.opencontainers.image.revision\" }}";
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
  if (!IMAGE_ID.test(runtimeImageId) || runtimeImageId !== options.pilotImageId) {
    fail("the rebuilt exact-candidate image ID does not match --pilot-image-id");
  }
  assertRunningServiceImageIds(baseArgs, runtimeImageId);
  const servicesBefore = serviceIdentities(baseArgs);

  const releaseIdentityPath = resolve(
    options.outputRoot,
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
    new Date(afterRestart.databaseStartedAt).toISOString() !==
      options.databaseStartedAt ||
    afterRestart.canonicalLifecycleReadOnly !== true ||
    afterRestart.lifecycleMutationPerformed !== false ||
    afterRestart.sandboxOnly !== true ||
    afterRestart.productionFundsMoved !== false
  ) {
    fail("the exact post-restart Agent marker or --database-started-at is invalid");
  }
  try {
    await assertReviewedDatabaseSecretMountSource();
  } catch {
    fail("the reviewed read-only database secret mount source is invalid");
  }

  let producerOutput;
  try {
    producerOutput = await runProducer(baseArgs, {
      candidateReleaseId: releaseIdentity.revision,
      databaseStartedAt: options.databaseStartedAt,
      tenantId: profile.tenantId,
      humanActorId: profile.identities.borrower.actorId,
      capitalPartnerActorId: profile.identities.capitalPartner.actorId,
      databaseUrl
    });
  } catch (error) {
    fail(error?.message ?? "the Human/Capital Partner producer failed");
  }
  assertRunningServiceImageIds(baseArgs, runtimeImageId);
  try {
    assertHumanCapitalPartnerServiceContinuity(
      servicesBefore,
      serviceIdentities(baseArgs)
    );
  } catch {
    fail("PostgreSQL, Pilot, or Worker restarted during acceptance");
  }
  try {
    assertExactLocalReleaseSource(releaseIdentity, { root: ROOT });
    assert.deepEqual(await sourceDigests(), sourceBefore);
  } catch {
    fail("the exact candidate source changed during acceptance");
  }

  let bundle;
  try {
    bundle = JSON.parse(producerOutput);
    assertReceiptBundle(bundle, options);
  } catch {
    fail("the Human/Capital Partner producer returned an invalid receipt bundle");
  }
  await mkdir(options.outputRoot, { recursive: true, mode: 0o700 });
  const outputMetadata = await lstat(options.outputRoot);
  if (
    !outputMetadata.isDirectory() ||
    outputMetadata.isSymbolicLink()
  ) {
    fail("the P0-5 Evidence destination must be one real directory");
  }
  await chmod(options.outputRoot, 0o700);
  try {
    await assertM1BPrivateAcceptanceOutputDirectory(options.outputRoot);
  } catch {
    fail("the P0-5 Evidence destination or one of its ancestors is not private and real");
  }
  const humanPath = resolve(
    options.outputRoot,
    `${releaseIdentity.revision}.human-critical-receipt.json`
  );
  const capitalPartnerPath = resolve(
    options.outputRoot,
    `${releaseIdentity.revision}.capital-partner-critical-receipt.json`
  );
  try {
    assertHumanCapitalPartnerServiceContinuity(
      servicesBefore,
      serviceIdentities(baseArgs)
    );
  } catch {
    fail("PostgreSQL, Pilot, or Worker changed before Evidence persistence");
  }
  try {
    await writePrivateJsonPairAtomic([
      [humanPath, bundle.human],
      [capitalPartnerPath, bundle.capitalPartner]
    ]);
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail("exact-candidate critical receipts already exist and will not be overwritten");
    }
    fail("critical receipts could not be written atomically");
  }
  const [humanSha256, capitalPartnerSha256] = await Promise.all([
    readFile(humanPath).then((value) => createHash("sha256").update(value).digest("hex")),
    readFile(capitalPartnerPath).then((value) =>
      createHash("sha256").update(value).digest("hex")
    )
  ]);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: bundle.schemaVersion,
    status: "passed",
    candidateReleaseId: bundle.candidateReleaseId,
    databaseStartedAt: bundle.databaseStartedAt,
    runtimeImageId,
    human: { path: humanPath, sha256: humanSha256 },
    capitalPartner: {
      path: capitalPartnerPath,
      sha256: capitalPartnerSha256
    }
  }, null, 2)}\n`);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await runLocalHumanCapitalPartnerAcceptance();
}
