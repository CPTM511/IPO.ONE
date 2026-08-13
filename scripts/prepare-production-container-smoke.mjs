import { randomBytes } from "node:crypto";
import { mkdir, chmod, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const DIRECTORY_PREFIX = "ipo-one-production-container-smoke-";
const MANIFEST_SCHEMA = "ipo.one.production-container-smoke/v1";
const DATABASE_NAME = /^ipo_one_container_smoke_test_[0-9a-f]{12}$/;
const ROLE_NAME = /^ipo_smoke_(?:gateway|auth)_[0-9a-f]{12}$/;
const RELEASE_SHA = /^[0-9a-f]{40}$/;
const SECRET_MOUNT = "/run/ipo-one-smoke";
const MAXIMUM_LOG_BYTES = 1024 * 1024;
// These credentials are deliberately fixed and non-secret. PostgreSQL may log
// role-management statements, so the CI-only smoke fixture must never put
// generated secret material in a CREATE/ALTER ROLE statement. The fixture
// boundary below restricts their use to ephemeral roles in a loopback test DB.
const CI_ONLY_NON_SECRET_GATEWAY_PASSWORD = "ipo-one-ci-only-gateway-password-v1";
const CI_ONLY_NON_SECRET_AUTHENTICATION_PASSWORD = "ipo-one-ci-only-authentication-password-v1";

function smokeError(message) {
  const error = new Error(message);
  error.code = "invalid_production_container_smoke";
  return error;
}

function checkedDirectory(value, environment = process.env) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw smokeError("smoke directory must be an absolute path");
  }
  const directory = resolve(value);
  const runnerTemp = typeof environment.RUNNER_TEMP === "string"
    ? resolve(environment.RUNNER_TEMP)
    : undefined;
  if (
    environment.CI !== "true" ||
    runnerTemp === undefined ||
    basename(directory).length <= DIRECTORY_PREFIX.length ||
    !basename(directory).startsWith(DIRECTORY_PREFIX) ||
    dirname(directory) !== runnerTemp
  ) {
    throw smokeError("smoke directory is outside the dedicated CI boundary");
  }
  return directory;
}

function checkedRelease(value) {
  if (typeof value !== "string" || !RELEASE_SHA.test(value)) {
    throw smokeError("release must be an exact 40-character commit SHA");
  }
  return value;
}

function databaseUrl(value, { database, hostname, username, password, source = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw smokeError("DATABASE_URL is invalid");
  }
  if (
    !new Set(["postgres:", "postgresql:"]).has(url.protocol) ||
    !url.username ||
    !url.password ||
    !url.hostname
  ) {
    throw smokeError("DATABASE_URL is outside the PostgreSQL smoke boundary");
  }
  if (source) {
    const sourceDatabase = url.pathname.replace(/^\//, "");
    if (
      !new Set(["127.0.0.1", "localhost"]).has(url.hostname) ||
      !/(^|[_-])test($|[_-])/.test(sourceDatabase)
    ) {
      throw smokeError("DATABASE_URL must target a loopback CI test database");
    }
  }
  if (database !== undefined) url.pathname = `/${database}`;
  if (hostname !== undefined) url.hostname = hostname;
  if (username !== undefined) url.username = username;
  if (password !== undefined) url.password = password;
  url.search = "";
  url.hash = "";
  return url;
}

function quoteIdentifier(value, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw smokeError("smoke database identifier is invalid");
  }
  return `"${value}"`;
}

async function writePrivate(path, value) {
  await writeFile(path, value, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await chmod(path, 0o600);
}

function environmentFile(entries) {
  return Object.entries(entries).map(([name, value]) => {
    if (
      !/^[A-Z][A-Z0-9_]+$/.test(name) ||
      typeof value !== "string" ||
      value.length < 1 ||
      /[\0\r\n]/.test(value)
    ) {
      throw smokeError("smoke environment entry is invalid");
    }
    return `${name}=${value}`;
  }).join("\n") + "\n";
}

function checkedManifest(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== MANIFEST_SCHEMA ||
    !DATABASE_NAME.test(value.databaseName ?? "") ||
    !ROLE_NAME.test(value.gatewayRole ?? "") ||
    !ROLE_NAME.test(value.authenticationRole ?? "") ||
    value.gatewayRole === value.authenticationRole
  ) {
    throw smokeError("smoke manifest is invalid");
  }
  return value;
}

async function adminPoolFor(database = "postgres") {
  const source = process.env.DATABASE_URL;
  if (typeof source !== "string") throw smokeError("DATABASE_URL is required");
  const checkedSource = databaseUrl(source, { source: true });
  return new Pool({
    connectionString: databaseUrl(checkedSource.toString(), { database }).toString(),
    max: 1,
    application_name: "ipo-one-production-container-smoke"
  });
}

async function dropFixtureDatabaseAndRoles(manifest) {
  const pool = await adminPoolFor();
  try {
    await pool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [manifest.databaseName]
    );
    await pool.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(manifest.databaseName, DATABASE_NAME)}`
    );
    for (const role of [manifest.gatewayRole, manifest.authenticationRole]) {
      await pool.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role, ROLE_NAME)}`);
    }
  } finally {
    await pool.end();
  }
}

export async function prepareProductionContainerSmoke({ directory: value, release: releaseValue }) {
  const directory = checkedDirectory(value);
  const release = checkedRelease(releaseValue);
  const suffix = randomBytes(6).toString("hex");
  const databaseName = `ipo_one_container_smoke_test_${suffix}`;
  const gatewayRole = `ipo_smoke_gateway_${suffix}`;
  const authenticationRole = `ipo_smoke_auth_${suffix}`;
  const secretDirectory = join(directory, "secrets");
  const manifest = Object.freeze({
    schemaVersion: MANIFEST_SCHEMA,
    databaseName,
    gatewayRole,
    authenticationRole
  });
  let databaseCreated = false;

  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  await mkdir(secretDirectory, { mode: 0o700 });
  await chmod(secretDirectory, 0o700);

  try {
    const admin = await adminPoolFor();
    try {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName, DATABASE_NAME)}`);
      databaseCreated = true;
    } finally {
      await admin.end();
    }
    await writePrivate(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    const sourceUrl = databaseUrl(process.env.DATABASE_URL, { source: true, database: databaseName });
    const containerAdminUrl = databaseUrl(sourceUrl.toString(), {
      hostname: "host.docker.internal"
    });
    const gatewayPassword = CI_ONLY_NON_SECRET_GATEWAY_PASSWORD;
    const authenticationPassword = CI_ONLY_NON_SECRET_AUTHENTICATION_PASSWORD;
    const referenceKey = randomBytes(32).toString("base64url");
    const encryptionKey = randomBytes(32).toString("base64url");
    const edgeAssertionKey = randomBytes(32).toString("base64url");
    const gatewayUrl = databaseUrl(sourceUrl.toString(), {
      hostname: "host.docker.internal",
      username: gatewayRole,
      password: gatewayPassword
    }).toString();
    const authenticationUrl = databaseUrl(sourceUrl.toString(), {
      hostname: "host.docker.internal",
      username: authenticationRole,
      password: authenticationPassword
    }).toString();
    if (gatewayUrl === authenticationUrl) {
      throw smokeError("gateway and authentication URLs must remain distinct");
    }
    const clientId = `ipo_one_ci_wallet_${suffix}`;
    const immutableSecretRoot = "projects/ipo-one-ci/secrets";
    const identityConfig = {
      schemaVersion: "ipo_one_production_identity_config.v1",
      oidcProviders: [],
      wallet: {
        enabled: true,
        issuer: "https://ipo.one",
        clientId
      },
      workload: {
        issuer: "https://workload.ipo.one",
        audience: "https://ipo.one",
        jwksUri: "https://workload.ipo.one/.well-known/jwks.json",
        allowedAlgorithms: ["ES256"]
      }
    };
    const bootstrapConfig = {
      schemaVersion: "ipo_one_production_bootstrap.v2",
      gatewayRole,
      authenticationRole,
      tenant: {
        tenantId: `tenant_container_smoke_${suffix}`,
        organizationRef: `urn:ipo.one:organization:container-smoke-${suffix}`,
        displayName: "IPO.ONE isolated production container smoke",
        pilotJurisdiction: "PRIVATE_NO_FUNDS",
        retentionOwnerRef: `urn:ipo.one:retention:container-smoke-${suffix}`
      },
      systemActor: {
        actorId: `actor_container_smoke_system_${suffix}`,
        clientId: `client_container_smoke_system_${suffix}`
      },
      policyVersion: "security_001.v1",
      credentials: [{
        kind: "human_wallet",
        profile: "human_borrower",
        actorId: `actor_container_smoke_borrower_${suffix}`,
        clientId,
        issuer: "https://ipo.one",
        externalSubject: "eip155:84532:0x1111111111111111111111111111111111111111",
        invitationId: `invite_container_smoke_${suffix}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString()
      }]
    };

    await Promise.all([
      writePrivate(join(secretDirectory, "bootstrap-config.json"), `${JSON.stringify(bootstrapConfig)}\n`),
      writePrivate(join(secretDirectory, "identity-config.json"), `${JSON.stringify(identityConfig)}\n`),
      writePrivate(join(secretDirectory, "gateway-password"), `${gatewayPassword}\n`),
      writePrivate(join(secretDirectory, "authentication-password"), `${authenticationPassword}\n`),
      writePrivate(join(secretDirectory, "reference-key"), `${referenceKey}\n`),
      writePrivate(join(secretDirectory, "encryption-key"), `${encryptionKey}\n`),
      writePrivate(join(secretDirectory, "edge-assertion-key"), `${edgeAssertionKey}\n`)
    ]);
    await Promise.all([
      writePrivate(join(directory, "bootstrap.env"), environmentFile({
        NODE_ENV: "production",
        IPO_ONE_ADMIN_DATABASE_URL: containerAdminUrl.toString(),
        IPO_ONE_BOOTSTRAP_CONFIG_FILE: `${SECRET_MOUNT}/bootstrap-config.json`,
        IPO_ONE_GATEWAY_DATABASE_PASSWORD_FILE: `${SECRET_MOUNT}/gateway-password`,
        IPO_ONE_AUTH_DATABASE_PASSWORD_FILE: `${SECRET_MOUNT}/authentication-password`,
        IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE: `${SECRET_MOUNT}/reference-key`
      })),
      writePrivate(join(directory, "runtime.env"), environmentFile({
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "8080",
        IPO_ONE_ALLOWED_HOSTS: "ipo.one,www.ipo.one",
        IPO_ONE_TRUST_PROXY: "true",
        IPO_ONE_DEPLOYMENT_MODE: "closed_pilot",
        IPO_ONE_PUBLIC_ORIGIN: "https://ipo.one",
        IPO_ONE_RELEASE_ID: release,
        IPO_ONE_TENANT_ID: bootstrapConfig.tenant.tenantId,
        IPO_ONE_SYSTEM_ACTOR_ID: bootstrapConfig.systemActor.actorId,
        IPO_ONE_POLICY_VERSION: bootstrapConfig.policyVersion,
        IPO_ONE_AUTHENTICATION_MODE: "closed_pilot",
        IPO_ONE_IDP_DEPLOYMENT_APPROVAL: "APPROVED",
        IPO_ONE_IDP_VENDOR_ID: "wallet_only",
        IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA: release,
        IPO_ONE_IDP_CONFIGURATION_REF: `${immutableSecretRoot}/identity-config/versions/1`,
        IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF: `${immutableSecretRoot}/auth-reference-key/versions/1`,
        IPO_ONE_AUTH_ENCRYPTION_KEY_REF: `${immutableSecretRoot}/auth-encryption-key/versions/1`,
        IPO_ONE_GATEWAY_DATABASE_URL: gatewayUrl,
        IPO_ONE_AUTH_DATABASE_URL: authenticationUrl,
        IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE: `${SECRET_MOUNT}/reference-key`,
        IPO_ONE_AUTH_ENCRYPTION_KEY_FILE: `${SECRET_MOUNT}/encryption-key`,
        IPO_ONE_IDENTITY_CONFIG_FILE: `${SECRET_MOUNT}/identity-config.json`,
        IPO_ONE_EDGE_ASSERTION_KEY_FILE: `${SECRET_MOUNT}/edge-assertion-key`
      })),
      writePrivate(join(directory, "request.curl"), [
        "fail",
        "silent",
        "show-error",
        'header = "Host: ipo.one"',
        'header = "X-Forwarded-Proto: https"',
        'header = "X-Forwarded-For: 127.0.0.1"',
        `header = "X-IPO-One-Edge-Assertion: ${edgeAssertionKey}"`,
        ""
      ].join("\n")),
      writePrivate(join(directory, "redaction-values"), [
        sourceUrl.password,
        containerAdminUrl.toString(),
        gatewayPassword,
        authenticationPassword,
        referenceKey,
        encryptionKey,
        edgeAssertionKey,
        gatewayUrl,
        authenticationUrl,
        ""
      ].join("\n"))
    ]);

    process.stdout.write(`${JSON.stringify({
      event: "production_container_smoke_prepared",
      databaseName,
      gatewayRole,
      authenticationRole,
      manifest: join(directory, "manifest.json")
    })}\n`);
  } catch (error) {
    if (databaseCreated) {
      await dropFixtureDatabaseAndRoles(manifest).catch(() => {});
    }
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function cleanupProductionContainerSmoke({ directory: value }) {
  const directory = checkedDirectory(value);
  let manifest;
  try {
    manifest = checkedManifest(JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") {
      process.stdout.write(`${JSON.stringify({ event: "production_container_smoke_cleanup_not_required" })}\n`);
      return;
    }
    throw error;
  }
  await dropFixtureDatabaseAndRoles(manifest);
  await rm(directory, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({
    event: "production_container_smoke_cleaned",
    databaseName: manifest.databaseName,
    gatewayRole: manifest.gatewayRole,
    authenticationRole: manifest.authenticationRole
  })}\n`);
}

export async function redactProductionContainerSmokeLogs({ directory: value, input = process.stdin, output = process.stdout }) {
  const directory = checkedDirectory(value);
  const redactions = (await readFile(join(directory, "redaction-values"), "utf8"))
    .split("\n")
    .filter((entry) => entry.length >= 8)
    .sort((left, right) => right.length - left.length);
  const chunks = [];
  let length = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > MAXIMUM_LOG_BYTES) {
      output.write('{"event":"production_container_smoke_logs_omitted","reason":"size_limit"}\n');
      return;
    }
    chunks.push(bytes);
  }
  let text = Buffer.concat(chunks).toString("utf8");
  for (const value of redactions) text = text.split(value).join("[REDACTED]");
  text = text.replace(/postgres(?:ql)?:\/\/[^\s"']+@/giu, "postgresql://[REDACTED]@");
  output.write(text);
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw smokeError(`${name} is required`);
  return process.argv[index + 1];
}

async function main() {
  const action = process.argv[2];
  if (action === "prepare") {
    await prepareProductionContainerSmoke({
      directory: option("--directory"),
      release: option("--release")
    });
    return;
  }
  if (action === "cleanup") {
    await cleanupProductionContainerSmoke({ directory: option("--directory") });
    return;
  }
  if (action === "redact") {
    await redactProductionContainerSmokeLogs({ directory: option("--directory") });
    return;
  }
  throw smokeError("action must be prepare, cleanup, or redact");
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      event: "production_container_smoke_failed",
      code: error?.code ?? "production_container_smoke_failed",
      message: error?.message ?? "Production container smoke failed"
    })}\n`);
    process.exitCode = 1;
  });
}
