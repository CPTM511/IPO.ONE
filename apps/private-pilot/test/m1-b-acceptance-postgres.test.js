import assert from "node:assert/strict";
import test from "node:test";
import { createTenantSecurityContext } from "../../../modules/persistence/src/index.js";
import {
  M1_B_ACCEPTANCE_APP_ROLE,
  M1_B_ACCEPTANCE_SECRET_MOUNT,
  M1BAcceptancePostgresError,
  createM1BAcceptanceAppPool,
  readExistingM1BAcceptanceDatabaseRoleSecret,
  withM1BAcceptanceTenantRead
} from "../src/m1-b-acceptance-postgres.js";

const SECRET = "s".repeat(43);

function metadata({ mode = 0o100600, file = true, symlink = false } = {}) {
  return {
    mode,
    isFile: () => file,
    isSymbolicLink: () => symlink
  };
}

test("acceptance database secret reader requires the exact existing read-only mount", async () => {
  assert.equal(
    await readExistingM1BAcceptanceDatabaseRoleSecret(
      M1_B_ACCEPTANCE_SECRET_MOUNT,
      {
        lstatFile: async () => metadata(),
        readText: async () => `${SECRET}\n`
      }
    ),
    SECRET
  );
  assert.equal(
    await readExistingM1BAcceptanceDatabaseRoleSecret(
      M1_B_ACCEPTANCE_SECRET_MOUNT,
      {
        lstatFile: async () => metadata({ mode: 0o100644 }),
        readText: async () => SECRET,
        readMountInfo: async () =>
          `1 0 0:1 / ${M1_B_ACCEPTANCE_SECRET_MOUNT} ro - ext4 none ro\n`
      }
    ),
    SECRET
  );
  await assert.rejects(
    readExistingM1BAcceptanceDatabaseRoleSecret("/tmp/copied-secret", {
      lstatFile: async () => metadata(),
      readText: async () => SECRET
    }),
    (error) => error instanceof M1BAcceptancePostgresError &&
      error.code === "acceptance_database_secret_invalid"
  );
  await assert.rejects(
    readExistingM1BAcceptanceDatabaseRoleSecret(
      M1_B_ACCEPTANCE_SECRET_MOUNT,
      {
        lstatFile: async () => metadata({ mode: 0o100644 }),
        readText: async () => SECRET,
        readMountInfo: async () =>
          `1 0 0:1 / ${M1_B_ACCEPTANCE_SECRET_MOUNT} rw - ext4 none rw\n`
      }
    ),
    (error) => error instanceof M1BAcceptancePostgresError &&
      error.code === "acceptance_database_secret_invalid"
  );
});

test("acceptance pool derives only the existing non-owner app role", async () => {
  let poolOptions;
  let asserted;
  const pool = { end: async () => {} };
  const result = await createM1BAcceptanceAppPool({
    databaseUrl: "postgresql://owner:owner-secret@postgres:5432/ipo_one",
    secretPath: M1_B_ACCEPTANCE_SECRET_MOUNT,
    readSecret: async () => SECRET,
    createPool(options) {
      poolOptions = options;
      return pool;
    },
    assertRole: async (candidate) => {
      asserted = candidate;
      return { roleName: M1_B_ACCEPTANCE_APP_ROLE };
    }
  });
  const parsed = new URL(poolOptions.connectionString);
  assert.equal(parsed.username, M1_B_ACCEPTANCE_APP_ROLE);
  assert.equal(parsed.password, SECRET);
  assert.equal(poolOptions.allowExitOnIdle, true);
  assert.equal(asserted, pool);
  assert.equal(result, pool);
});

test("acceptance tenant reads are repeatable, read-only, and transaction-scoped", async () => {
  const queries = [];
  let released = false;
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql === "SELECT 42 AS value") return { rows: [{ value: 42 }] };
      return { rows: [] };
    },
    release() {
      released = true;
    }
  };
  const pool = { connect: async () => client };
  const context = createTenantSecurityContext({
    tenantId: "tenant_acceptance_test",
    actorId: "actor_acceptance_test",
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  const value = await withM1BAcceptanceTenantRead(
    pool,
    context,
    async (queryable) => (await queryable.query("SELECT 42 AS value")).rows[0].value
  );
  assert.equal(value, 42);
  assert.equal(
    queries[0].sql,
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
  );
  assert.match(queries[1].sql, /set_config\('app\.tenant_id'/);
  assert.deepEqual(queries[1].values, [
    "tenant_acceptance_test",
    "actor_acceptance_test",
    "security_001.v1"
  ]);
  assert.equal(queries.at(-1).sql, "COMMIT");
  assert.equal(released, true);
});
