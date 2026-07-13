import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTenantDatabaseRole,
  assertTenantSecurityContext,
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../src/index.js";

const VALID_CONTEXT = {
  tenantId: "tenant_ipo_one_local_pilot",
  actorId: "actor_local_system",
  policyVersion: "security_001.v1",
  source: "local_test"
};

test("Tenant Security Context is closed, bounded, and server-created", () => {
  const context = createTenantSecurityContext(VALID_CONTEXT);
  assert.deepEqual(context, VALID_CONTEXT);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(assertTenantSecurityContext(context), context);

  assert.throws(
    () => assertTenantSecurityContext({ ...VALID_CONTEXT }),
    (error) => error.code === "tenant_security_context_required"
  );
  assert.throws(
    () => createTenantSecurityContext({ ...VALID_CONTEXT, tenantId: "tenant with spaces" }),
    (error) => error.code === "invalid_tenant_security_context"
  );
  assert.throws(
    () => createTenantSecurityContext({ ...VALID_CONTEXT, source: "request_body" }),
    (error) => error.code === "invalid_tenant_security_context"
  );
});

test("transaction context uses parameterized transaction-local settings", async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [], rowCount: 1 };
    }
  };
  const context = createTenantSecurityContext(VALID_CONTEXT);
  await setTenantTransactionContext(client, context);

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /set_config\('app\.tenant_id', \$1, true\)/);
  assert.match(calls[0].text, /set_config\('app\.actor_id', \$2, true\)/);
  assert.match(calls[0].text, /set_config\('app\.policy_version', \$3, true\)/);
  assert.deepEqual(calls[0].values, [
    VALID_CONTEXT.tenantId,
    VALID_CONTEXT.actorId,
    VALID_CONTEXT.policyVersion
  ]);
});

test("tenant role safety rejects ownership and bypass privileges", async () => {
  const safe = await assertTenantDatabaseRole({
    async query() {
      return {
        rows: [{
          rolname: "ipo_one_app_test",
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolreplication: false,
          owns_rls_table: false
        }]
      };
    }
  });
  assert.deepEqual(safe, {
    roleName: "ipo_one_app_test",
    superuser: false,
    bypassRls: false,
    ownsRlsTable: false
  });

  for (const unsafeField of [
    "rolsuper",
    "rolbypassrls",
    "rolcreatedb",
    "rolcreaterole",
    "rolreplication",
    "owns_rls_table"
  ]) {
    await assert.rejects(
      () => assertTenantDatabaseRole({
        async query() {
          return {
            rows: [{
              rolname: "unsafe_role",
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              owns_rls_table: false,
              [unsafeField]: true
            }]
          };
        }
      }),
      (error) => error.code === "unsafe_postgres_tenant_role"
    );
  }
});
