import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  cleanupProductionContainerSmoke,
  prepareProductionContainerSmoke,
  productionContainerSmokeRuntimeEnvironment,
  redactProductionContainerSmokeLogs
} from "../../../scripts/prepare-production-container-smoke.mjs";
import { loadProductionClosedPilotEnvironment } from "../src/production-environment.js";
import { hashId } from "../../../packages/domain/src/index.js";

async function runtimeFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-container-profile-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const environment = {
    ...productionContainerSmokeRuntimeEnvironment({
      release: "a".repeat(40),
      tenantId: "tenant_container_smoke_test",
      systemActorId: "actor_container_smoke_test",
      policyVersion: "security_001.v1",
      immutableSecretRoot: "projects/ipo-one-ci/secrets",
      gatewayUrl: "postgresql://gateway:ci-only@127.0.0.1:5432/ipo_one_test",
      authenticationUrl: "postgresql://authentication:ci-only@127.0.0.1:5432/ipo_one_test"
    })
  };
  const nextKey = randomBytes(32).toString("base64url");
  const bootstrapKey = randomBytes(32).toString("base64url");
  const bootstrapKeyFile = join(directory, "reference-key");
  const meteredPair = generateKeyPairSync("ed25519");
  const meteredPublicKey = meteredPair.publicKey.export({ format: "der", type: "spki" })
    .toString("base64url");
  const meteredPrivateKey = meteredPair.privateKey.export({ format: "der", type: "pkcs8" })
    .toString("base64url");
  await writeFile(bootstrapKeyFile, bootstrapKey, { mode: 0o600 });
  for (const name of [
    "IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_FILE",
    "IPO_ONE_AUTH_ENCRYPTION_KEY_FILE",
    "IPO_ONE_EDGE_ASSERTION_KEY_FILE",
    "IPO_ONE_IDENTITY_CONFIG_FILE",
    "IPO_ONE_HOSTED_METERED_PROVIDER_KEY_FILE"
  ]) {
    // Only translate the container mount into this test's temporary directory.
    assert.ok(environment[name].startsWith("/run/ipo-one-smoke/"));
    const path = join(directory, environment[name].slice("/run/ipo-one-smoke/".length));
    const value = name === "IPO_ONE_IDENTITY_CONFIG_FILE"
      ? JSON.stringify({
          schemaVersion: "ipo_one_production_identity_config.v1",
          oidcProviders: [],
          wallet: { enabled: true, issuer: "https://ipo.one", clientId: "ipo_one_ci_wallet_test" },
          workload: {
            issuer: "https://workload.ipo.one",
            audience: "https://ipo.one",
            jwksUri: "https://workload.ipo.one/.well-known/jwks.json",
            allowedAlgorithms: ["ES256"]
          }
        })
      : name === "IPO_ONE_HOSTED_METERED_PROVIDER_KEY_FILE"
        ? JSON.stringify({
            schemaVersion: "ipo_one_hosted_synthetic_metered_provider_key.v1",
            providerKeyId: `hosted_metered_${hashId("hosted_metered_provider_key", meteredPublicKey).slice(2, 34)}`,
            publicKeyDer: meteredPublicKey,
            privateKeyDer: meteredPrivateKey
          })
      : name === "IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_FILE"
        ? nextKey
        : randomBytes(32).toString("base64url");
    await writeFile(path, value, { mode: 0o600 });
    environment[name] = path;
  }
  return { directory, environment, nextKey, bootstrapKey, bootstrapKeyFile };
}

test("container smoke configuration loads the current public Beta production boundary", async (t) => {
  const fixture = await runtimeFixture(t);
  const configuration = await loadProductionClosedPilotEnvironment(fixture.environment);
  t.after(async () => Promise.allSettled([
    configuration.gatewayPool.end(), configuration.authenticationPool.end()
  ]));
  assert.equal(fixture.environment.NODE_ENV, "production");
  assert.equal(fixture.environment.IPO_ONE_DEPLOYMENT_MODE, "closed_pilot");
  assert.equal(configuration.deploymentRole, "container");
  assert.equal(configuration.runtimeConfig.mode, "public_beta");
  assert.equal(configuration.runtimeConfig.publicBetaSelfService, true);
  assert.equal(configuration.runtimeConfig.deploymentGateSatisfied, true);
  assert.equal(configuration.referenceHashMode, "single_v2");
  assert.equal(configuration.referenceHashKey.toString("base64url"), fixture.nextKey);
  assert.notEqual(fixture.nextKey, fixture.bootstrapKey);
  assert.equal(configuration.referenceHashKeyRef,
    "projects/ipo-one-ci/secrets/auth-next-reference-key/versions/1");
  assert.equal(configuration.legacyReferenceHashKey, undefined);
  assert.notEqual(configuration.gatewayPool, configuration.authenticationPool);
  assert.equal(configuration.gatewayPool.options.connectionString,
    fixture.environment.IPO_ONE_GATEWAY_DATABASE_URL);
  assert.equal(configuration.authenticationPool.options.connectionString,
    fixture.environment.IPO_ONE_AUTH_DATABASE_URL);
  assert.equal(configuration.oidcProviders.length, 0);
  assert.ok(configuration.meteredUsageProvider);
  for (const suffix of ["REF", "FILE", "KEY"]) {
    const name = suffix === "KEY"
      ? "IPO_ONE_AUTH_REFERENCE_HASH_KEY"
      : `IPO_ONE_AUTH_REFERENCE_HASH_KEY_${suffix}`;
    assert.equal(Object.hasOwn(fixture.environment, name), false);
  }
});

test("container smoke production loader retains approval, mode and key rejection gates", async (t) => {
  const { environment, directory, bootstrapKey, bootstrapKeyFile } = await runtimeFixture(t);
  const invalidKey = join(directory, "invalid-next-key");
  await writeFile(invalidKey, "invalid*key", { mode: 0o600 });
  const shortKey = join(directory, "short-next-key");
  await writeFile(shortKey, Buffer.alloc(16).toString("base64url"), { mode: 0o600 });
  const authenticationGate = "authentication_deployment_gate_closed";
  const productionGate = "invalid_production_environment";
  const cases = [
    ["missing approval", { IPO_ONE_IDP_DEPLOYMENT_APPROVAL: undefined }, authenticationGate],
    ["pending approval", { IPO_ONE_IDP_DEPLOYMENT_APPROVAL: "PENDING" }, authenticationGate],
    ["invalid approval SHA", { IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA: "not-a-commit" }, authenticationGate],
    ...["IPO_ONE_IDP_CONFIGURATION_REF", "IPO_ONE_AUTH_ENCRYPTION_KEY_REF",
      "IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_REF"].flatMap((name) => [
      [`missing ${name}`, { [name]: undefined }, authenticationGate],
      [`mutable ${name}`, { [name]: "projects/ipo-one-ci/secrets/example/versions/latest" }, authenticationGate]
    ]),
    ["closed pilot", { IPO_ONE_AUTHENTICATION_MODE: "closed_pilot" }, productionGate],
    ["disabled authentication", { IPO_ONE_AUTHENTICATION_MODE: "disabled" }, productionGate],
    ["local test in production", { IPO_ONE_AUTHENTICATION_MODE: "local_test" }, authenticationGate],
    ["single-v1", { IPO_ONE_AUTH_REFERENCE_HASH_MODE: "single_v1" }, authenticationGate],
    ["overlap rotation", { IPO_ONE_AUTH_REFERENCE_HASH_MODE: "overlap_v2_write_v1_lookup" }, authenticationGate],
    ["legacy reference", { IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF:
      "projects/ipo-one-ci/secrets/legacy/versions/1" }, authenticationGate],
    ["legacy file", { IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE: bootstrapKeyFile }, productionGate],
    ["legacy inline key", { IPO_ONE_AUTH_REFERENCE_HASH_KEY: bootstrapKey }, productionGate],
    ["missing NEXT file", { IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_FILE: undefined }, productionGate],
    ["invalid NEXT key encoding", { IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_FILE: invalidKey }, productionGate],
    ["short NEXT key", { IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_FILE: shortKey }, productionGate],
    ["missing NEXT file on disk", { IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_FILE:
      join(directory, "missing-next-key") }, "ENOENT"],
    ["missing synthetic metered key", { IPO_ONE_HOSTED_METERED_PROVIDER_KEY_FILE: undefined }, productionGate]
  ];
  for (const [name, mutation, code] of cases) {
    await t.test(name, async () => {
      const candidate = { ...environment, ...mutation };
      for (const key of Object.keys(mutation)) {
        if (mutation[key] === undefined) delete candidate[key];
      }
      await assert.rejects(
        () => loadProductionClosedPilotEnvironment(candidate),
        (error) => error?.code === code
      );
    });
  }
});

function outputStream() {
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  return {
    stream,
    value: () => Buffer.concat(chunks).toString("utf8")
  };
}

test("production container smoke role credentials are fixed non-secret CI fixtures", async () => {
  const source = await readFile(
    new URL("../../../scripts/prepare-production-container-smoke.mjs", import.meta.url),
    "utf8"
  );
  const gateway = source.match(
    /const CI_ONLY_NON_SECRET_GATEWAY_PASSWORD = "([^"]+)";/
  )?.[1];
  const authentication = source.match(
    /const CI_ONLY_NON_SECRET_AUTHENTICATION_PASSWORD = "([^"]+)";/
  )?.[1];

  for (const value of [gateway, authentication]) {
    assert.equal(typeof value, "string");
    assert.ok(value.length >= 32 && value.length <= 128);
    assert.doesNotMatch(value, /[\0\r\n]/);
  }
  assert.notEqual(gateway, authentication);
  assert.match(source, /environment\.CI !== "true"/);
  assert.match(source, /DATABASE_URL must target a loopback CI test database/);
  assert.match(source, /const gatewayPassword = CI_ONLY_NON_SECRET_GATEWAY_PASSWORD;/);
  assert.match(source, /const authenticationPassword = CI_ONLY_NON_SECRET_AUTHENTICATION_PASSWORD;/);
  assert.doesNotMatch(source, /const (?:gatewayPassword|authenticationPassword) = randomBytes\(/);
  assert.doesNotMatch(source, /log_min_error_statement/);
});

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
  const nextKey = randomBytes(32).toString("base64url");
  const bootstrapKey = randomBytes(32).toString("base64url");
  const meteredPrivateKey = generateKeyPairSync("ed25519").privateKey
    .export({ format: "der", type: "pkcs8" }).toString("base64url");
  const databaseUrl = "postgresql://gateway:database-secret@host.docker.internal:5432/ipo_one_container_smoke_test_123456789abc";
  await writeFile(
    join(directory, "redaction-values"),
    `${secret}\n${nextKey}\n${bootstrapKey}\n${meteredPrivateKey}\n${databaseUrl}\ndatabase-secret\n`,
    { mode: 0o600 }
  );
  const input = PassThrough.from([
    `startup secret=${secret} url=${databaseUrl}\n`,
    `reference-v2=${nextKey} bootstrap-v1=${bootstrapKey}\n`,
    `metered-private-key=${meteredPrivateKey}\n`,
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
    assert.equal(redacted.includes(nextKey), false);
    assert.equal(redacted.includes(bootstrapKey), false);
    assert.equal(redacted.includes(meteredPrivateKey), false);
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
