import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  cleanupProductionContainerSmoke,
  prepareProductionContainerSmoke,
  redactProductionContainerSmokeLogs
} from "../../../scripts/prepare-production-container-smoke.mjs";

function outputStream() {
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  return {
    stream,
    value: () => Buffer.concat(chunks).toString("utf8")
  };
}

test("production container smoke rejects directories outside its dedicated boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-smoke-test-"));
  const previousCi = process.env.CI;
  const previousRunnerTemp = process.env.RUNNER_TEMP;
  try {
    delete process.env.CI;
    process.env.RUNNER_TEMP = root;
    await assert.rejects(
      () => prepareProductionContainerSmoke({
        directory: root,
        release: "a".repeat(40)
      }),
      (error) => error?.code === "invalid_production_container_smoke"
    );
    process.env.CI = "true";
    process.env.RUNNER_TEMP = root;
    await assert.rejects(
      () => cleanupProductionContainerSmoke({ directory: "/" }),
      (error) => error?.code === "invalid_production_container_smoke"
    );
  } finally {
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
    if (previousRunnerTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = previousRunnerTemp;
    await rm(root, { recursive: true, force: true });
  }
});

test("production container smoke rejects non-loopback and non-test database sources before connecting", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-production-container-smoke-source-"));
  const previous = {
    CI: process.env.CI,
    DATABASE_URL: process.env.DATABASE_URL,
    RUNNER_TEMP: process.env.RUNNER_TEMP
  };
  process.env.CI = "true";
  process.env.RUNNER_TEMP = root;
  try {
    for (const source of [
      "postgresql://postgres:postgres@db.example.invalid:5432/ipo_one_test",
      "postgresql://postgres:postgres@127.0.0.1:5432/ipo_one_production"
    ]) {
      process.env.DATABASE_URL = source;
      const suffix = source.includes("example") ? "remote" : "production";
      await assert.rejects(
        () => prepareProductionContainerSmoke({
          directory: join(root, `ipo-one-production-container-smoke-${suffix}`),
          release: "a".repeat(40)
        }),
        (error) => (
          error?.code === "invalid_production_container_smoke" &&
          error?.message === "DATABASE_URL must target a loopback CI test database"
        )
      );
    }
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("production container smoke log redaction removes every registered secret and database credential", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-production-container-smoke-test-"));
  const directory = join(root, "ipo-one-production-container-smoke-unit");
  await mkdir(directory, { mode: 0o700 });
  const secret = "super-secret-production-container-value";
  const databaseUrl = "postgresql://gateway:database-secret@host.docker.internal:5432/ipo_one_container_smoke_test_123456789abc";
  await writeFile(
    join(directory, "redaction-values"),
    `${secret}\n${databaseUrl}\ndatabase-secret\n`,
    { mode: 0o600 }
  );
  const input = PassThrough.from([
    `startup secret=${secret} url=${databaseUrl}\n`,
    "fallback=postgresql://other:another-secret@example.invalid/database\n"
  ]);
  const output = outputStream();
  const previousCi = process.env.CI;
  const previousRunnerTemp = process.env.RUNNER_TEMP;
  try {
    process.env.CI = "true";
    process.env.RUNNER_TEMP = root;
    await redactProductionContainerSmokeLogs({
      directory,
      input,
      output: output.stream
    });
    const redacted = output.value();
    assert.equal(redacted.includes(secret), false);
    assert.equal(redacted.includes("database-secret"), false);
    assert.equal(redacted.includes("another-secret"), false);
    assert.equal(redacted.includes("gateway:"), false);
    assert.ok(redacted.includes("[REDACTED]"));
  } finally {
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
    if (previousRunnerTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = previousRunnerTemp;
    output.stream.end();
    await rm(root, { recursive: true, force: true });
  }
});
