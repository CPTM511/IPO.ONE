import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS
} from "../../../apps/private-pilot/src/m1-b-operational-negative-acceptance.js";
import {
  createM1BDisposablePostgresArguments,
  createM1BExactCandidateNegativeRunnerArguments,
  runM1BOperationalExactSourceNegativeSuite
} from "../../../scripts/m1-b-operational-negative-orchestrator.mjs";

const CANDIDATE = "a".repeat(40);
const TREE = "b".repeat(40);
const IMAGE = `sha256:${"c".repeat(64)}`;

function result(status, stdout = "", stderr = "") {
  return {
    status,
    signal: null,
    error: null,
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(stderr)
  };
}

test("exact candidate runner argv mounts only candidate tests and never embeds database credentials", () => {
  const definition = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.find(
    ({ group, id }) => group === "human" && id === "changed_version"
  );
  const sourceMounts = [
    ["apps/private-pilot/test", "/private/archive/apps/private-pilot/test"],
    ["apps/web/test", "/private/archive/apps/web/test"],
    ["modules/authorization/test/support", "/private/archive/modules/authorization/test/support"],
    ["modules/tenant-command-gateway/test-postgres", "/private/archive/modules/tenant-command-gateway/test-postgres"]
  ].map(([path, source]) => ({ source, target: `/app/${path}` }));
  const args = createM1BExactCandidateNegativeRunnerArguments({
    name: "ipo-one-m1b-negative-runner",
    runtimeImageId: IMAGE,
    definition,
    network: "none",
    sourceMounts,
    environmentFile: "/private/runtime.env"
  });
  assert.deepEqual(args.slice(-5), [
    "--test",
    "--test-reporter=tap",
    "--test-name-pattern",
    definition.subtestName,
    "apps/private-pilot/test/m1-b-operational-negative-acceptance.test.js"
  ]);
  assert.equal(args.includes(IMAGE), true);
  assert.equal(args.includes("--read-only"), true);
  assert.equal(args.includes("--env-file"), true);
  assert.equal(args.includes("--env"), false);
  assert.equal(args.some((value) => /DATABASE_URL|password|cookie|signature/i.test(value)), false);
  assert.equal(args.filter((value) => value === "--mount").length, 4);

  const postgres = createM1BDisposablePostgresArguments({
    name: "ipo-one-m1b-negative-postgres",
    network: "ipo-one-m1b-negative-network",
    volume: "ipo-one-m1b-negative-volume",
    environmentFile: "/private/postgres.env"
  });
  assert.equal(postgres.includes("--publish"), false);
  assert.equal(postgres.includes("-p"), false);
  assert.match(postgres.at(-1), /^postgres@sha256:[0-9a-f]{64}$/);
  assert.equal(postgres.some((value) => /POSTGRES_PASSWORD=/.test(value)), false);
});

test("exact-source suite provisions one isolated PostgreSQL, invokes the closed 10+1+1 partition, and proves teardown", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ipo-one-negative-orchestration-"));
  const source = resolve(root, ".ipo-one/local-stack/exact-source", CANDIDATE);
  const outputRoot = resolve(root, "output/playwright/candidate");
  const secretParent = resolve(root, ".ipo-one/local-stack");
  const databaseSecretFile = resolve(secretParent, "private-pilot-db-secret");
  try {
    await mkdir(outputRoot, { recursive: true, mode: 0o700 });
    await mkdir(secretParent, { recursive: true, mode: 0o700 });
    await chmod(secretParent, 0o700);
    await writeFile(databaseSecretFile, "test-app-role-secret\n", { mode: 0o644 });
    await chmod(databaseSecretFile, 0o644);
    for (const directory of [
      "apps/private-pilot/test",
      "apps/web/test",
      "modules/authorization/test/support",
      "modules/tenant-command-gateway/test-postgres"
    ]) await mkdir(resolve(source, directory), { recursive: true });

    const calls = [];
    const resources = { network: null, volume: null, postgres: null };
    const existing = { network: false, volume: false, postgres: false };
    const dockerExecutor = async (args) => {
      calls.push(args);
      if (args[0] === "image" && args[1] === "inspect") {
        return result(0, args[2] === IMAGE ? `${IMAGE}\n` : `sha256:${"d".repeat(64)}\n`);
      }
      if (args[0] === "network" && args[1] === "create") {
        resources.network = args.at(-1);
        existing.network = true;
        return result(0, `${"e".repeat(64)}\n`);
      }
      if (args[0] === "volume" && args[1] === "create") {
        resources.volume = args.at(-1);
        existing.volume = true;
        return result(0, `${resources.volume}\n`);
      }
      if (args[0] === "create") {
        resources.postgres = args[args.indexOf("--name") + 1];
        existing.postgres = true;
        return result(0, `${"f".repeat(64)}\n`);
      }
      if (args[0] === "start") return result(0, "");
      if (args[0] === "inspect" && args.some((value) => value.includes(".State.Health"))) {
        return result(0, "healthy\n");
      }
      if (args[0] === "exec") {
        return result(0, "2026-08-15 00:00:00+00\n");
      }
      if (args[0] === "rm" && args.includes(resources.postgres)) {
        existing.postgres = false;
        return result(0, `${resources.postgres}\n`);
      }
      if (args[0] === "volume" && args[1] === "rm") {
        existing.volume = false;
        return result(0, `${resources.volume}\n`);
      }
      if (args[0] === "network" && args[1] === "rm") {
        existing.network = false;
        return result(0, `${resources.network}\n`);
      }
      if (args[1] === "inspect" && new Set(["container", "volume", "network"]).has(args[0])) {
        const key = args[0] === "container" ? "postgres" : args[0];
        return existing[key] ? result(0, "{}\n") : result(1, "", "not found");
      }
      throw new Error(`unexpected Docker call: ${args.join(" ")}`);
    };

    const invoked = [];
    const exactCaseRunner = async (context) => {
      invoked.push({
        group: context.definition.group,
        id: context.definition.id,
        sourceMode: context.definition.sourceMode,
        network: context.network
      });
      return {
        proof: {
          group: context.definition.group,
          id: context.definition.id,
          sourceMode: context.definition.sourceMode,
          caseDefinitionHash: context.definition.caseDefinitionHash
        },
        tapBytes: Buffer.from(`TAP for ${context.definition.group}:${context.definition.id}\n`),
        tapSha256: "1".repeat(64),
        runnerContainerIdHash: `0x${"2".repeat(64)}`,
        sourceFiles: []
      };
    };

    const suite = await runM1BOperationalExactSourceNegativeSuite({
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      exactSourceDirectory: source,
      outputRoot,
      retainedRuntime: {
        origin: "http://127.0.0.1:18887/",
        databaseStartedAt: "2026-08-15T00:10:00.000Z",
        databaseUrl: "postgresql://127.0.0.2:55432/ipo_one_private_pilot"
      },
      databaseSecretFile,
      dockerExecutor,
      exactCaseRunner,
      nonce: "0123456789abcdef",
      disposablePassword: "A".repeat(32),
      root
    });
    assert.equal(invoked.length, 12);
    assert.equal(invoked.filter(({ sourceMode }) =>
      sourceMode === "exact_source_disposable_postgres").length, 10);
    assert.equal(invoked.find(({ sourceMode }) =>
      sourceMode === "exact_source_ui_binding").network, "none");
    assert.equal(invoked.find(({ sourceMode }) =>
      sourceMode === "exact_source_transport").network, "host");
    assert.equal(new Set(invoked.filter(({ sourceMode }) =>
      sourceMode === "exact_source_disposable_postgres").map(({ network }) => network)).size, 1);
    assert.equal(suite.proofs.length, 12);
    assert.equal(suite.tapArtifacts.length, 12);
    assert.equal(suite.manifest.postgres.publishedPortCount, 0);
    assert.equal(suite.manifest.postgres.retainedRuntimeAttached, false);
    assert.equal(suite.manifest.postgres.containerRemoved, true);
    assert.equal(suite.manifest.postgres.volumeRemoved, true);
    assert.equal(suite.manifest.postgres.networkRemoved, true);
    assert.equal(existing.postgres, false);
    assert.equal(existing.volume, false);
    assert.equal(existing.network, false);
    const allArguments = calls.flat().join(" ");
    assert.equal(allArguments.includes("A".repeat(32)), false);
    assert.equal(allArguments.includes("ipo_one_private_pilot"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
