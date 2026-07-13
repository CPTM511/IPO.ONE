import { DomainError } from "../../../packages/domain/src/index.js";

const trustedContexts = new WeakSet();
const CONTEXT_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const ALLOWED_CONTEXT_SOURCES = new Set([
  "verified_authentication",
  "system_worker",
  "local_test"
]);

function assertContextValue(name, value) {
  if (typeof value !== "string" || !CONTEXT_VALUE_PATTERN.test(value)) {
    throw new DomainError(
      "invalid_tenant_security_context",
      `${name} must be a bounded server identifier`,
      { name }
    );
  }
}

export function createTenantSecurityContext({ tenantId, actorId, policyVersion, source }) {
  assertContextValue("tenantId", tenantId);
  assertContextValue("actorId", actorId);
  assertContextValue("policyVersion", policyVersion);
  if (!ALLOWED_CONTEXT_SOURCES.has(source)) {
    throw new DomainError(
      "invalid_tenant_security_context",
      "source must identify a trusted server context boundary",
      { source }
    );
  }
  const context = Object.freeze({ tenantId, actorId, policyVersion, source });
  trustedContexts.add(context);
  return context;
}

export function assertTenantSecurityContext(context) {
  if (!context || typeof context !== "object" || !trustedContexts.has(context)) {
    throw new DomainError(
      "tenant_security_context_required",
      "a server-created Tenant Security Context is required"
    );
  }
  return context;
}

export async function setTenantTransactionContext(client, context) {
  if (!client || typeof client.query !== "function") {
    throw new DomainError("postgres_client_required", "a PostgreSQL transaction client is required");
  }
  const trusted = assertTenantSecurityContext(context);
  await client.query(
    `SELECT
       set_config('app.tenant_id', $1, true),
       set_config('app.actor_id', $2, true),
       set_config('app.policy_version', $3, true)`,
    [trusted.tenantId, trusted.actorId, trusted.policyVersion]
  );
}

export async function assertTenantDatabaseRole(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new DomainError("postgres_client_required", "a PostgreSQL queryable is required");
  }
  const result = await queryable.query(`
    SELECT
      r.rolname,
      r.rolsuper,
      r.rolbypassrls,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      EXISTS (
        SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p')
           AND c.relrowsecurity
           AND c.relowner = r.oid
      ) AS owns_rls_table
    FROM pg_roles r
    WHERE r.rolname = current_user
  `);
  const role = result.rows[0];
  if (
    !role ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    role.owns_rls_table
  ) {
    throw new DomainError(
      "unsafe_postgres_tenant_role",
      "tenant application role must be non-owner and hold no database bypass privilege"
    );
  }
  return {
    roleName: role.rolname,
    superuser: false,
    bypassRls: false,
    ownsRlsTable: false
  };
}
