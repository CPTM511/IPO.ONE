import { lstat, readFile } from "node:fs/promises";
import {
  assertTenantDatabaseRole,
  createPostgresPool,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";

export const M1_B_ACCEPTANCE_APP_ROLE = "ipo_one_private_pilot_app";
export const M1_B_ACCEPTANCE_SECRET_MOUNT =
  "/run/secrets/private-pilot-db-secret";

export class M1BAcceptancePostgresError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BAcceptancePostgresError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BAcceptancePostgresError(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function mountPath(value) {
  return value
    .replaceAll("\\040", " ")
    .replaceAll("\\011", "\t")
    .replaceAll("\\012", "\n")
    .replaceAll("\\134", "\\");
}

function exactReadOnlyMount(mountInfo, expectedPath) {
  return mountInfo.split("\n").some((line) => {
    const separator = line.indexOf(" - ");
    const mountFields = separator === -1 ? line : line.slice(0, separator);
    const fields = mountFields.split(" ");
    return fields.length >= 6 &&
      mountPath(fields[4]) === expectedPath &&
      fields[5].split(",").includes("ro");
  });
}

export async function readExistingM1BAcceptanceDatabaseRoleSecret(
  path,
  {
    lstatFile = lstat,
    readText = (target) => readFile(target, "utf8"),
    readMountInfo = () => readFile("/proc/self/mountinfo", "utf8")
  } = {}
) {
  assert(
    path === M1_B_ACCEPTANCE_SECRET_MOUNT,
    "acceptance_database_secret_invalid",
    "The exact existing private-pilot database role secret mount is required"
  );
  let metadata;
  try {
    metadata = await lstatFile(path);
  } catch {
    fail(
      "acceptance_database_secret_missing",
      "The existing mounted database role secret is required"
    );
  }
  const permissions = metadata.mode & 0o777;
  let mountedReadOnly = false;
  if (permissions === 0o644) {
    let mountInfo;
    try {
      mountInfo = await readMountInfo();
    } catch {
      fail(
        "acceptance_database_secret_invalid",
        "The reviewed 0644 compatibility mount must be independently proven read-only"
      );
    }
    mountedReadOnly = exactReadOnlyMount(mountInfo, path);
  }
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (permissions === 0o600 || (permissions === 0o644 && mountedReadOnly)),
    "acceptance_database_secret_invalid",
    "The mounted database role secret must be one regular 0600 file or the exact reviewed read-only 0644 compatibility mount"
  );
  const value = (await readText(path)).trim();
  assert(
    /^[A-Za-z0-9_-]{32,128}$/.test(value),
    "acceptance_database_secret_invalid",
    "The mounted database role secret is invalid"
  );
  return value;
}

export async function createM1BAcceptanceAppPool({
  databaseUrl,
  secretPath,
  applicationName = "ipo-one-m1-b-acceptance",
  max = 2,
  readSecret = readExistingM1BAcceptanceDatabaseRoleSecret,
  createPool = createPostgresPool,
  assertRole = assertTenantDatabaseRole
}) {
  assert(
    typeof databaseUrl === "string" && databaseUrl.length <= 8_192,
    "acceptance_database_url_invalid",
    "The private-pilot database URL is invalid"
  );
  assert(
    typeof applicationName === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(applicationName),
    "acceptance_database_application_invalid",
    "The acceptance database application name is invalid"
  );
  assert(
    Number.isSafeInteger(max) && max >= 1 && max <= 4,
    "acceptance_database_pool_invalid",
    "The acceptance database pool size is invalid"
  );
  const password = await readSecret(secretPath);
  let applicationUrl;
  try {
    applicationUrl = new URL(databaseUrl);
  } catch {
    fail(
      "acceptance_database_url_invalid",
      "The private-pilot database URL is invalid"
    );
  }
  assert(
    new Set(["postgres:", "postgresql:"]).has(applicationUrl.protocol) &&
      applicationUrl.hostname.length > 0 &&
      applicationUrl.pathname.length > 1,
    "acceptance_database_url_invalid",
    "The private-pilot database URL is invalid"
  );
  applicationUrl.username = M1_B_ACCEPTANCE_APP_ROLE;
  applicationUrl.password = password;
  const pool = createPool({
    connectionString: applicationUrl.toString(),
    max,
    applicationName,
    allowExitOnIdle: true
  });
  try {
    await assertRole(pool);
  } catch (error) {
    try {
      await pool.end();
    } catch {
      // Preserve the role assertion failure.
    }
    throw error;
  }
  return pool;
}

export async function withM1BAcceptanceTenantRead(
  pool,
  tenantContext,
  operation
) {
  assert(
    pool && typeof pool.connect === "function",
    "acceptance_database_pool_invalid",
    "An app-role PostgreSQL pool is required"
  );
  assert(
    typeof operation === "function",
    "acceptance_database_operation_invalid",
    "A tenant-scoped read operation is required"
  );
  const client = await pool.connect();
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );
    await setTenantTransactionContext(client, tenantContext);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the tenant-scoped read failure.
    }
    throw error;
  } finally {
    client.release();
  }
}
