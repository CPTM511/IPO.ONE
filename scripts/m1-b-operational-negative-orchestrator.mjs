import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS,
  createM1BOperationalExactSourceNegativeProof,
  createM1BOperationalExactSourceRunFromTap
} from "../apps/private-pilot/src/m1-b-operational-negative-acceptance.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIMA_INSTANCE = "ipo-one-local";
const MAX_TAP_BYTES = 4 * 1024 * 1024;
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const CONTAINER_ID = /^[0-9a-f]{12,64}$/;
const POSTGRES_IMAGE =
  "postgres@sha256:4f736ae292687621d4dbe0d499ffd024a36bd2ee7d8ca6f2ccd4c800f047b394";
const POSTGRES_DATABASE = "ipo_one_m1b_negative_test";
const POSTGRES_OWNER = "ipo_one_m1b_negative_owner";
const NEGATIVE_TEST_FILE =
  "apps/private-pilot/test/m1-b-operational-negative-acceptance.test.js";
const SOURCE_MOUNT_DIRECTORIES = Object.freeze([
  "apps/private-pilot/test",
  "apps/web/test",
  "modules/authorization/test/support",
  "modules/tenant-command-gateway/test-postgres"
]);

export class M1BOperationalNegativeOrchestrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BOperationalNegativeOrchestrationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BOperationalNegativeOrchestrationError(code, message);
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function manifestHash(value) {
  return `0x${sha256(canonicalJson(value))}`;
}

function canonicalIso(value, code = "operational_negative_orchestration_invalid") {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) fail(code, "Negative orchestration timestamp is invalid.");
  return value;
}

function defaultDockerExecutor(args, { allowFailure = false, maxBuffer = MAX_TAP_BYTES } = {}) {
  const result = spawnSync(
    "limactl",
    ["shell", "--workdir", ROOT, LIMA_INSTANCE, "docker", ...args],
    {
      cwd: ROOT,
      encoding: null,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer
    }
  );
  const normalized = Object.freeze({
    status: result.status ?? 1,
    signal: result.signal ?? null,
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0),
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0),
    error: result.error ?? null
  });
  if (!allowFailure && (
    normalized.error || normalized.signal || normalized.status !== 0
  )) fail(
    "operational_negative_docker_failed",
    "An isolated Docker Evidence step failed; command output is intentionally not copied into Evidence."
  );
  return normalized;
}

async function dockerCall(executor, args, options) {
  const result = await executor(args, options);
  if (
    !result ||
    !Number.isSafeInteger(result.status) ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr)
  ) fail("operational_negative_docker_invalid", "Docker executor returned an invalid result.");
  if (!options?.allowFailure && (
    result.error || result.signal || result.status !== 0
  )) fail(
    "operational_negative_docker_failed",
    "An isolated Docker Evidence step failed; command output is intentionally not copied into Evidence."
  );
  return result;
}

async function dockerText(executor, args, options = {}) {
  const result = await dockerCall(executor, args, options);
  const text = result.stdout.toString("utf8").trim();
  if (text.includes("\uFFFD")) {
    fail("operational_negative_docker_invalid", "Docker returned invalid UTF-8.");
  }
  return Object.freeze({ ...result, text });
}

function assertCandidateContext({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId
}) {
  if (
    !SHA.test(candidateReleaseId ?? "") ||
    !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "")
  ) fail("operational_negative_candidate_invalid", "Exact candidate SHA, tree, and OCI image are required.");
}

async function exactSourceRoot(candidateReleaseId, requested, root = ROOT) {
  const expected = resolve(
    root,
    ".ipo-one/local-stack/exact-source",
    candidateReleaseId
  );
  if (resolve(requested) !== expected) {
    fail("operational_negative_source_root_invalid", "Exact candidate archive path is not canonical.");
  }
  const metadata = await lstat(expected);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail("operational_negative_source_root_invalid", "Exact candidate archive must be one real directory.");
  }
  const [rootReal, sourceReal] = await Promise.all([realpath(root), realpath(expected)]);
  const allowed = resolve(rootReal, ".ipo-one/local-stack/exact-source");
  const relation = relative(allowed, sourceReal);
  if (
    relation !== candidateReleaseId ||
    relation.startsWith("..") ||
    isAbsolute(relation)
  ) fail("operational_negative_source_root_invalid", "Exact candidate archive resolves outside its allowed root.");
  return sourceReal;
}

async function exactSourceFiles(definition, sourceRoot) {
  const files = [];
  for (const path of definition.sourcePaths) {
    if (
      typeof path !== "string" ||
      path === "" ||
      isAbsolute(path) ||
      path.split(sep).includes("..")
    ) fail("operational_negative_source_invalid", "Closed source path is invalid.");
    const target = resolve(sourceRoot, path);
    const metadata = await lstat(target);
    const targetReal = await realpath(target);
    const relation = relative(sourceRoot, targetReal);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      relation.startsWith("..") ||
      isAbsolute(relation)
    ) fail("operational_negative_source_invalid", "Closed source path is not a contained regular file.");
    files.push(Object.freeze({ path, sha256: sha256(await readFile(targetReal)) }));
  }
  return Object.freeze(files);
}

async function exactSourceMounts(sourceRoot) {
  const mounts = [];
  for (const directory of SOURCE_MOUNT_DIRECTORIES) {
    const source = resolve(sourceRoot, directory);
    const metadata = await lstat(source);
    const sourceReal = await realpath(source);
    const relation = relative(sourceRoot, sourceReal);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      relation !== directory ||
      relation.startsWith("..") ||
      isAbsolute(relation)
    ) fail("operational_negative_source_invalid", "Exact test source mount is invalid.");
    mounts.push(Object.freeze({ source: sourceReal, target: `/app/${directory}` }));
  }
  return Object.freeze(mounts);
}

function sourceMountArguments(mounts) {
  return mounts.flatMap(({ source, target }) => [
    "--mount",
    `type=bind,src=${source},dst=${target},readonly`
  ]);
}

export function createM1BExactCandidateNegativeRunnerArguments({
  name,
  runtimeImageId,
  definition,
  network,
  sourceMounts,
  environmentFile = null,
  databaseSecretFile = null
}) {
  if (
    !/^[a-z0-9][a-z0-9_.-]{7,127}$/.test(name ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    !definition ||
    definition.sourceMode === "live_post_restart" ||
    !new Set(["none", "host"]).has(network) &&
      !/^[a-z0-9][a-z0-9_.-]{7,127}$/.test(network ?? "") ||
    !Array.isArray(sourceMounts) ||
    sourceMounts.length !== SOURCE_MOUNT_DIRECTORIES.length
  ) fail("operational_negative_runner_arguments_invalid", "Exact candidate runner arguments are invalid.");
  const args = [
    "create",
    "--name",
    name,
    "--network",
    network,
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=64m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    ...sourceMountArguments(sourceMounts)
  ];
  if (environmentFile !== null) {
    if (typeof environmentFile !== "string" || !isAbsolute(environmentFile)) {
      fail("operational_negative_runner_arguments_invalid", "Runner environment file is invalid.");
    }
    args.push("--env-file", environmentFile);
  }
  if (databaseSecretFile !== null) {
    if (typeof databaseSecretFile !== "string" || !isAbsolute(databaseSecretFile)) {
      fail("operational_negative_runner_arguments_invalid", "Runner database secret path is invalid.");
    }
    args.push(
      "--mount",
      `type=bind,src=${databaseSecretFile},dst=/run/secrets/private-pilot-db-secret,readonly`
    );
  }
  args.push(
    "--entrypoint",
    "/nodejs/bin/node",
    runtimeImageId,
    "--test",
    "--test-reporter=tap",
    "--test-name-pattern",
    definition.subtestName,
    NEGATIVE_TEST_FILE
  );
  return Object.freeze(args);
}

export function createM1BDisposablePostgresArguments({
  name,
  network,
  volume,
  environmentFile
}) {
  for (const value of [name, network, volume]) {
    if (!/^[a-z0-9][a-z0-9_.-]{7,127}$/.test(value ?? "")) {
      fail("operational_negative_postgres_arguments_invalid", "Disposable PostgreSQL resource name is invalid.");
    }
  }
  if (typeof environmentFile !== "string" || !isAbsolute(environmentFile)) {
    fail("operational_negative_postgres_arguments_invalid", "Disposable PostgreSQL environment path is invalid.");
  }
  return Object.freeze([
    "create",
    "--name",
    name,
    "--network",
    network,
    "--network-alias",
    "m1b-negative-postgres",
    "--mount",
    `type=volume,src=${volume},dst=/var/lib/postgresql/data`,
    "--env-file",
    environmentFile,
    "--security-opt",
    "no-new-privileges:true",
    "--health-cmd",
    `pg_isready -U ${POSTGRES_OWNER} -d ${POSTGRES_DATABASE}`,
    "--health-interval",
    "1s",
    "--health-timeout",
    "2s",
    "--health-retries",
    "60",
    POSTGRES_IMAGE
  ]);
}

function resourceNames(candidateReleaseId, nonce) {
  const prefix = `ipo-one-m1b-neg-${candidateReleaseId.slice(0, 12)}-${nonce}`;
  return Object.freeze({
    network: `${prefix}-network`,
    volume: `${prefix}-volume`,
    postgres: `${prefix}-postgres`
  });
}

async function writePrivateEnvironment(path, lines) {
  if (lines.some((line) => typeof line !== "string" || line.includes("\n"))) {
    fail("operational_negative_environment_invalid", "Private environment input is invalid.");
  }
  await writeFile(path, `${lines.join("\n")}\n`, { flag: "wx", mode: 0o600 });
  await chmod(path, 0o600);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
    fail("operational_negative_environment_invalid", "Private environment file is unsafe.");
  }
}

async function assertDockerAbsent(executor, kind, name) {
  const result = await dockerCall(executor, [kind, "inspect", name], {
    allowFailure: true,
    maxBuffer: 64 * 1024
  });
  if (result.status === 0) {
    fail("operational_negative_cleanup_failed", `Disposable ${kind} was not removed.`);
  }
}

async function waitForPostgres(executor, name, { delay = (ms) => new Promise(
  (resolveDelay) => setTimeout(resolveDelay, ms)
) } = {}) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await dockerText(
      executor,
      ["inspect", name, "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}"],
      { allowFailure: true, maxBuffer: 64 * 1024 }
    );
    if (result.status === 0 && result.text === "healthy") return true;
    if (result.status === 0 && result.text === "unhealthy") {
      fail("operational_negative_postgres_unhealthy", "Disposable PostgreSQL became unhealthy.");
    }
    await delay(500);
  }
  fail("operational_negative_postgres_timeout", "Disposable PostgreSQL did not become healthy.");
}

async function runCreatedRunner({
  executor,
  args,
  name,
  runtimeImageId
}) {
  let created = false;
  try {
    const creation = await dockerText(executor, args, { maxBuffer: 64 * 1024 });
    if (!CONTAINER_ID.test(creation.text)) {
      fail("operational_negative_runner_identity_invalid", "Exact candidate runner ID is invalid.");
    }
    created = true;
    const inspectedImage = await dockerText(
      executor,
      ["inspect", name, "--format", "{{.Image}}"],
      { maxBuffer: 64 * 1024 }
    );
    if (inspectedImage.text !== runtimeImageId) {
      fail("operational_negative_runner_identity_invalid", "Negative runner did not use the exact candidate image ID.");
    }
    const started = await dockerCall(executor, ["start", "--attach", name], {
      maxBuffer: MAX_TAP_BYTES
    });
    const exitCode = await dockerText(
      executor,
      ["inspect", name, "--format", "{{.State.ExitCode}}"],
      { maxBuffer: 64 * 1024 }
    );
    if (exitCode.text !== "0" || started.stdout.length < 1 || started.stdout.length > MAX_TAP_BYTES) {
      fail("operational_negative_runner_failed", "Exact candidate negative runner did not return bounded successful TAP.");
    }
    return Object.freeze({
      containerId: creation.text,
      tapBytes: started.stdout,
      exitCode: 0
    });
  } finally {
    if (created) {
      await dockerCall(executor, ["rm", "--force", name], {
        allowFailure: true,
        maxBuffer: 64 * 1024
      });
      await assertDockerAbsent(executor, "container", name);
    }
  }
}

async function runExactCase({
  executor,
  definition,
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  sourceRoot,
  mounts,
  name,
  network,
  environmentFile,
  databaseSecretFile = null
}) {
  const sourceFilesBefore = await exactSourceFiles(definition, sourceRoot);
  const runner = await runCreatedRunner({
    executor,
    name,
    runtimeImageId,
    args: createM1BExactCandidateNegativeRunnerArguments({
      name,
      runtimeImageId,
      definition,
      network,
      sourceMounts: mounts,
      environmentFile,
      databaseSecretFile
    })
  });
  const sourceFilesAfter = await exactSourceFiles(definition, sourceRoot);
  if (canonicalJson(sourceFilesAfter) !== canonicalJson(sourceFilesBefore)) {
    fail("operational_negative_source_drift", "Exact candidate archive changed during negative execution.");
  }
  const exactRun = await createM1BOperationalExactSourceRunFromTap({
    definition,
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    tapBytes: runner.tapBytes,
    exitCode: runner.exitCode,
    sourceFiles: sourceFilesBefore
  });
  const proof = createM1BOperationalExactSourceNegativeProof(exactRun);
  return Object.freeze({
    proof,
    tapBytes: runner.tapBytes,
    tapSha256: sha256(runner.tapBytes),
    runnerContainerIdHash: manifestHash(runner.containerId),
    sourceFiles: sourceFilesBefore
  });
}

async function validateDatabaseSecret(path) {
  const metadata = await lstat(path);
  const parent = await lstat(dirname(path));
  if (
    !metadata.isFile() || metadata.isSymbolicLink() ||
    (metadata.mode & 0o777) !== 0o644 ||
    !parent.isDirectory() || parent.isSymbolicLink() ||
    (parent.mode & 0o777) !== 0o700
  ) fail("operational_negative_database_secret_invalid", "Existing app-role secret mount is unsafe.");
  return path;
}

export async function runM1BOperationalExactSourceNegativeSuite({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  exactSourceDirectory,
  outputRoot,
  retainedRuntime,
  databaseSecretFile,
  dockerExecutor = defaultDockerExecutor,
  exactCaseRunner = runExactCase,
  nonce = randomBytes(8).toString("hex"),
  disposablePassword = randomBytes(32).toString("base64url"),
  root = ROOT,
  delay
}) {
  assertCandidateContext({ candidateReleaseId, sourceTreeHash, runtimeImageId });
  if (
    !/^[0-9a-f]{16}$/.test(nonce) ||
    !/^[A-Za-z0-9_-]{32,64}$/.test(disposablePassword) ||
    typeof outputRoot !== "string" ||
    !isAbsolute(outputRoot) ||
    typeof exactCaseRunner !== "function"
  ) fail("operational_negative_orchestration_invalid", "Negative orchestration inputs are invalid.");
  const sourceRoot = await exactSourceRoot(candidateReleaseId, exactSourceDirectory, root);
  const mounts = await exactSourceMounts(sourceRoot);
  const image = await dockerText(
    dockerExecutor,
    ["image", "inspect", runtimeImageId, "--format", "{{.Id}}"],
    { maxBuffer: 64 * 1024 }
  );
  if (image.text !== runtimeImageId) {
    fail("operational_negative_runner_identity_invalid", "Exact candidate OCI image is unavailable.");
  }
  const postgresImage = await dockerText(
    dockerExecutor,
    ["image", "inspect", POSTGRES_IMAGE, "--format", "{{.Id}}"],
    { maxBuffer: 64 * 1024 }
  );
  if (!IMAGE_ID.test(postgresImage.text)) {
    fail("operational_negative_postgres_identity_invalid", "Pinned disposable PostgreSQL image is unavailable.");
  }

  const secretParent = resolve(root, ".ipo-one/local-stack");
  await mkdir(secretParent, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(resolve(secretParent, "m1-b-negative-"));
  await chmod(temporary, 0o700);
  const resources = resourceNames(candidateReleaseId, nonce);
  const postgresEnvironment = resolve(temporary, "postgres.env");
  const runnerEnvironment = resolve(temporary, "runner.env");
  const results = [];
  let networkCreated = false;
  let volumeCreated = false;
  let postgresCreated = false;
  let postgresContainerId = null;
  let networkId = null;
  let databaseStartedAt = null;
  let operationError = null;
  let cleanupError = null;
  try {
    await writePrivateEnvironment(postgresEnvironment, [
      `POSTGRES_DB=${POSTGRES_DATABASE}`,
      "POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust",
      `POSTGRES_PASSWORD=${disposablePassword}`,
      `POSTGRES_USER=${POSTGRES_OWNER}`
    ]);
    const network = await dockerText(dockerExecutor, [
      "network", "create", "--driver", "bridge",
      "--label", `ipo.one.candidate=${candidateReleaseId}`,
      "--label", "ipo.one.evidence=m1-b-operational-negative",
      resources.network
    ], { maxBuffer: 64 * 1024 });
    if (!/^[0-9a-f]{12,64}$/.test(network.text)) {
      fail("operational_negative_network_invalid", "Disposable network ID is invalid.");
    }
    networkCreated = true;
    networkId = network.text;
    const volume = await dockerText(dockerExecutor, [
      "volume", "create",
      "--label", `ipo.one.candidate=${candidateReleaseId}`,
      "--label", "ipo.one.evidence=m1-b-operational-negative",
      resources.volume
    ], { maxBuffer: 64 * 1024 });
    if (volume.text !== resources.volume) {
      fail("operational_negative_volume_invalid", "Disposable volume identity is invalid.");
    }
    volumeCreated = true;
    const postgres = await dockerText(
      dockerExecutor,
      createM1BDisposablePostgresArguments({
        name: resources.postgres,
        network: resources.network,
        volume: resources.volume,
        environmentFile: postgresEnvironment
      }),
      { maxBuffer: 64 * 1024 }
    );
    if (!CONTAINER_ID.test(postgres.text)) {
      fail("operational_negative_postgres_identity_invalid", "Disposable PostgreSQL container ID is invalid.");
    }
    postgresCreated = true;
    postgresContainerId = postgres.text;
    await rm(postgresEnvironment, { force: true });
    await dockerCall(dockerExecutor, ["start", resources.postgres], { maxBuffer: 64 * 1024 });
    await waitForPostgres(dockerExecutor, resources.postgres, { delay });
    const started = await dockerText(dockerExecutor, [
      "exec", resources.postgres, "psql", "-U", POSTGRES_OWNER,
      "-d", POSTGRES_DATABASE, "-Atc", "SELECT pg_postmaster_start_time()"
    ], { maxBuffer: 64 * 1024 });
    databaseStartedAt = new Date(started.text).toISOString();
    canonicalIso(databaseStartedAt);

    const disposableUrl = new URL(
      `postgresql://${POSTGRES_OWNER}@m1b-negative-postgres:5432/${POSTGRES_DATABASE}`
    );
    disposableUrl.password = disposablePassword;
    await writePrivateEnvironment(runnerEnvironment, [
      `DATABASE_URL=${disposableUrl.toString()}`,
      "NODE_ENV=test"
    ]);
    const disposableDefinitions = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
      ({ sourceMode }) => sourceMode === "exact_source_disposable_postgres"
    );
    if (disposableDefinitions.length !== 10) {
      fail("operational_negative_registry_invalid", "Disposable PostgreSQL case registry must contain exactly ten cases.");
    }
    for (const [index, definition] of disposableDefinitions.entries()) {
      results.push(await exactCaseRunner({
        executor: dockerExecutor,
        definition,
        candidateReleaseId,
        sourceTreeHash,
        runtimeImageId,
        sourceRoot,
        mounts,
        name: `${resources.postgres}-case-${index + 1}`,
        network: resources.network,
        environmentFile: runnerEnvironment
      }));
    }
    await rm(runnerEnvironment, { force: true });

    const uiDefinition = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.find(
      ({ sourceMode }) => sourceMode === "exact_source_ui_binding"
    );
    if (!uiDefinition) {
      fail("operational_negative_registry_invalid", "Changed-version UI binding case is missing.");
    }
    results.push(await exactCaseRunner({
      executor: dockerExecutor,
      definition: uiDefinition,
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      sourceRoot,
      mounts,
      name: `${resources.postgres}-ui`,
      network: "none",
      environmentFile: null
    }));

    if (
      !retainedRuntime ||
      typeof retainedRuntime.origin !== "string" ||
      !retainedRuntime.origin.startsWith("http://127.0.0.1:") ||
      typeof retainedRuntime.databaseStartedAt !== "string" ||
      typeof retainedRuntime.databaseUrl !== "string"
    ) fail("operational_negative_retained_runtime_invalid", "Signed-out retained runtime binding is invalid.");
    canonicalIso(retainedRuntime.databaseStartedAt);
    const retainedDatabase = new URL(retainedRuntime.databaseUrl);
    if (
      !new Set(["postgres:", "postgresql:"]).has(retainedDatabase.protocol) ||
      retainedDatabase.username !== "" ||
      retainedDatabase.password !== ""
    ) fail("operational_negative_retained_runtime_invalid", "Retained database URL must be credential-free.");
    await validateDatabaseSecret(databaseSecretFile);
    await writePrivateEnvironment(runnerEnvironment, [
      `DATABASE_URL=${retainedDatabase.toString()}`,
      `IPO_ONE_M1_B_DATABASE_STARTED_AT=${retainedRuntime.databaseStartedAt}`,
      `IPO_ONE_M1_B_NEGATIVE_ORIGIN=${retainedRuntime.origin}`,
      `IPO_ONE_M1_B_PILOT_IMAGE_ID=${runtimeImageId}`,
      `IPO_ONE_M1_B_RELEASE_SHA=${candidateReleaseId}`,
      `IPO_ONE_M1_B_SOURCE_TREE_HASH=${sourceTreeHash}`,
      "IPO_ONE_PILOT_DB_SECRET_FILE=/run/secrets/private-pilot-db-secret",
      "NODE_ENV=test"
    ]);
    const transportDefinition = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.find(
      ({ sourceMode }) => sourceMode === "exact_source_transport"
    );
    if (!transportDefinition) {
      fail("operational_negative_registry_invalid", "Signed-out transport case is missing.");
    }
    results.push(await exactCaseRunner({
      executor: dockerExecutor,
      definition: transportDefinition,
      candidateReleaseId,
      sourceTreeHash,
      runtimeImageId,
      sourceRoot,
      mounts,
      name: `${resources.postgres}-transport`,
      network: "host",
      environmentFile: runnerEnvironment,
      databaseSecretFile
    }));
    await rm(runnerEnvironment, { force: true });
  } catch (error) {
    operationError = error;
  } finally {
    const cleanupFailures = [];
    for (const environmentPath of [postgresEnvironment, runnerEnvironment]) {
      try {
        await rm(environmentPath, { force: true });
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    if (postgresCreated) {
      try {
        await dockerCall(dockerExecutor, ["rm", "--force", resources.postgres], {
          allowFailure: true,
          maxBuffer: 64 * 1024
        });
        await assertDockerAbsent(dockerExecutor, "container", resources.postgres);
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    if (volumeCreated) {
      try {
        await dockerCall(dockerExecutor, ["volume", "rm", resources.volume], {
          maxBuffer: 64 * 1024
        });
        await assertDockerAbsent(dockerExecutor, "volume", resources.volume);
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    if (networkCreated) {
      try {
        await dockerCall(dockerExecutor, ["network", "rm", resources.network], {
          maxBuffer: 64 * 1024
        });
        await assertDockerAbsent(dockerExecutor, "network", resources.network);
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    try {
      await rm(temporary, { recursive: true, force: true });
    } catch (error) {
      cleanupFailures.push(error);
    }
    cleanupError = cleanupFailures[0] ?? null;
  }
  if (cleanupError) throw cleanupError;
  if (operationError) throw operationError;
  if (results.length !== 12) {
    fail("operational_negative_exact_source_incomplete", "Exact-source orchestration did not produce twelve cases.");
  }
  const capturedAt = new Date().toISOString();
  const caseArtifacts = Object.freeze(results.map(({ proof, tapBytes, tapSha256, runnerContainerIdHash }) => {
    const filename = `${candidateReleaseId}.negative.${proof.group}.${proof.id}.tap`;
    return Object.freeze({
      proof,
      tapArtifact: Object.freeze({
        id: `negative_tap_${proof.group}_${proof.id}`.replace(/[^a-z0-9_]/g, "_"),
        kind: "tap_log",
        relativePath: relative(root, resolve(outputRoot, filename)),
        sha256: tapSha256,
        bytes: tapBytes
      }),
      runnerContainerIdHash
    });
  }));
  const manifest = Object.freeze({
    schemaVersion: "m1_b_negative_exact_source_execution_manifest.v2",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    capturedAt,
    postgres: Object.freeze({
      imageReference: POSTGRES_IMAGE,
      imageId: postgresImage.text,
      containerIdHash: manifestHash(postgresContainerId),
      networkIdHash: manifestHash(networkId),
      volumeNameHash: manifestHash(resources.volume),
      databaseName: POSTGRES_DATABASE,
      databaseStartedAt,
      publishedPortCount: 0,
      retainedRuntimeAttached: false,
      internallyGeneratedCredentialsRemoved: true,
      containerRemoved: true,
      volumeRemoved: true,
      networkRemoved: true
    }),
    exactCandidateRunner: Object.freeze({
      imageId: runtimeImageId,
      readOnlyRootFilesystem: true,
      capDropAll: true,
      noNewPrivileges: true,
      exactArchiveReadOnlyMounts: SOURCE_MOUNT_DIRECTORIES,
      rawTapPersistedPerCase: true
    }),
    cases: caseArtifacts.map(({ proof, tapArtifact, runnerContainerIdHash }) => Object.freeze({
      group: proof.group,
      id: proof.id,
      sourceMode: proof.sourceMode,
      caseDefinitionHash: proof.caseDefinitionHash,
      runnerContainerIdHash,
      tapArtifact: Object.freeze({
        id: tapArtifact.id,
        sha256: tapArtifact.sha256
      })
    })),
    caseCount: caseArtifacts.length,
    productionFundsMoved: false,
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    })
  });
  return Object.freeze({
    proofs: Object.freeze(caseArtifacts.map(({ proof }) => proof)),
    tapArtifacts: Object.freeze(caseArtifacts.map(({ tapArtifact }) => tapArtifact)),
    manifest
  });
}
