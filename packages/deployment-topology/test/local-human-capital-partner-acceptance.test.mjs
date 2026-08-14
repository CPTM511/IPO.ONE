import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  symlink
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  assertHumanCapitalPartnerServiceContinuity,
  assertHumanCapitalPartnerProducerArguments,
  assertM1BPrivateAcceptanceOutputDirectory,
  collectM1BProducerOutput,
  createHumanCapitalPartnerProducerArguments,
  parseM1BHumanCapitalPartnerAcceptanceArguments
} from "../../../scripts/local-human-capital-partner-acceptance.mjs";

const ROOT = resolve(import.meta.dirname, "../../..");
const WRAPPER = resolve(
  ROOT,
  "scripts/local-human-capital-partner-acceptance.mjs"
);
const SHA = "a".repeat(40);
const IMAGE = `sha256:${"b".repeat(64)}`;
const START = "2026-08-14T00:00:00.000Z";

test("wrapper argv binds exact candidate, restart, image, and private output", () => {
  const parsed = parseM1BHumanCapitalPartnerAcceptanceArguments([
    "--candidate-release-id",
    SHA,
    "--database-started-at",
    START,
    "--pilot-image-id",
    IMAGE,
    "--output-root",
    "output/playwright/m1-b-p0-5"
  ], { root: ROOT });
  assert.equal(parsed.candidateReleaseId, SHA);
  assert.equal(parsed.databaseStartedAt, START);
  assert.equal(parsed.pilotImageId, IMAGE);
  assert.equal(parsed.outputRoot, resolve(ROOT, "output/playwright/m1-b-p0-5"));

  for (const bad of [
    [],
    [
      "--candidate-release-id", SHA,
      "--candidate-release-id", SHA,
      "--pilot-image-id", IMAGE,
      "--output-root", "output/playwright/m1-b-p0-5"
    ],
    [
      "--candidate-release-id", SHA,
      "--database-started-at", START,
      "--pilot-image-id", IMAGE,
      "--output-root", "../outside"
    ]
  ]) {
    assert.throws(
      () => parseM1BHumanCapitalPartnerAcceptanceArguments(bad, { root: ROOT })
    );
  }
});

test("producer argv uses exact container, credential-free DB URL, and interactive stdin", () => {
  const baseArgs = ["shell", "ipo-one-local", "docker", "compose"];
  const environment = {
    candidateReleaseId: SHA,
    databaseStartedAt: START,
    tenantId: "tenant_local",
    humanActorId: "actor_human_borrower_pilot",
    capitalPartnerActorId: "actor_capital_partner_pilot",
    databaseUrl: "postgresql://127.0.0.2:55432/ipo_one_private_pilot"
  };
  const args = createHumanCapitalPartnerProducerArguments(baseArgs, environment);
  assert.equal(
    assertHumanCapitalPartnerProducerArguments(args, { baseArgs, environment }),
    true
  );
  assert.deepEqual(args.slice(baseArgs.length, baseArgs.length + 4), [
    "run",
    "--rm",
    "--no-deps",
    "--no-TTY"
  ]);
  assert.equal(args.some((value) => /ipo_one_owner|password|@127/.test(value)), false);
  assert.deepEqual(args.slice(-2), [
    "pilot",
    "apps/private-pilot/src/m1-b-human-capital-partner-acceptance-cli.js"
  ]);
});

test("wrapper rejects same-image container replacement or restart", () => {
  const before = [{
    service: "pilot",
    containerId: "a".repeat(64),
    imageId: IMAGE,
    startedAt: START
  }];
  assert.equal(
    assertHumanCapitalPartnerServiceContinuity(before, structuredClone(before)),
    true
  );
  assert.throws(() => assertHumanCapitalPartnerServiceContinuity(before, [{
    ...before[0],
    containerId: "c".repeat(64),
    startedAt: "2026-08-14T00:05:00.000Z"
  }]));
  assert.throws(() => assertHumanCapitalPartnerServiceContinuity(before, [{
    ...before[0],
    startedAt: "2026-08-14T00:05:00.000Z"
  }]));
});

test("producer stdout preserves exact JSON bytes across multiple chunks", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = () => {};
  const collected = collectM1BProducerOutput(child, { maximumBytes: 64 });
  child.stdout.emit("data", Buffer.from('{"schemaVersion":'));
  child.stdout.emit("data", Buffer.from('"bundle.v1"}'));
  child.emit("close", 0);
  const output = await collected;
  assert.equal(output, '{"schemaVersion":"bundle.v1"}');
  assert.deepEqual(JSON.parse(output), { schemaVersion: "bundle.v1" });
});

test("private receipt output rejects a symlinked ancestor escape", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ipo-one-m1b-output-"));
  await mkdir(resolve(root, "output/playwright/real/m1-b"), { recursive: true });
  await chmod(resolve(root, "output/playwright/real/m1-b"), 0o700);
  assert.equal(
    await assertM1BPrivateAcceptanceOutputDirectory(
      resolve(root, "output/playwright/real/m1-b"),
      { root }
    ),
    await realpath(resolve(root, "output/playwright/real/m1-b"))
  );
  await mkdir(resolve(root, "outside/m1-b"), { recursive: true });
  await chmod(resolve(root, "outside/m1-b"), 0o700);
  await symlink(resolve(root, "outside"), resolve(root, "output/playwright/escape"));
  await assert.rejects(
    assertM1BPrivateAcceptanceOutputDirectory(
      resolve(root, "output/playwright/escape/m1-b"),
      { root }
    )
  );
});

test("wrapper source preserves same-process input and atomic private-only receipts", async () => {
  const source = await readFile(WRAPPER, "utf8");
  assert.match(source, /stdio: \["inherit", "pipe", "inherit"\]/);
  assert.doesNotMatch(source, /raw-response|response-capture\.json|writeFile\([^)]*producerOutput/s);
  assert.match(source, /flag: "wx", mode: 0o600/);
  assert.match(source, /await link\(temporaryPath, path\)/);
  assert.match(source, /human-critical-receipt\.json/);
  assert.match(source, /capital-partner-critical-receipt\.json/);
  assert.match(source, /assertExactLocalReleaseSource/);
  assert.match(source, /after-restart\.acceptance\.json/);
  assert.match(source, /assertRunningServiceImageIds/);
  assert.match(source, /serviceIdentities/);
  assert.match(source, /assertM1BPrivateAcceptanceOutputDirectory/);
  assert.match(source, /PostgreSQL, Pilot, or Worker changed before Evidence persistence/);
});

test("wrapper executable rejects missing argv before any local-stack mutation", () => {
  const result = spawnSync(process.execPath, [WRAPPER], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /expected exact --candidate-release-id/);
});
