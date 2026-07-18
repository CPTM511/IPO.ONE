import { DomainError } from "../../../packages/domain/src/index.js";
import { assertAuthenticationContext } from "../../authentication/src/index.js";
import { assertAuthorizationDecision } from "../../authorization/src/index.js";

const trustedContexts = new WeakSet();
const CONTEXT_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const ALLOWED_CONTEXT_SOURCES = new Set([
  "verified_authentication",
  "verified_authorization",
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

export function createTenantSecurityContext({
  tenantId,
  actorId,
  policyVersion,
  source,
  authenticationContext,
  authorizationDecision,
  now
}) {
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
  if (source === "verified_authentication" || source === "verified_authorization") {
    const trusted = assertAuthenticationContext(authenticationContext);
    if (
      trusted.tenantId !== tenantId ||
      trusted.actorId !== actorId ||
      trusted.policyVersion !== policyVersion
    ) {
      throw new DomainError(
        "tenant_authentication_context_mismatch",
        "Tenant Security Context must match the verified Authentication Context"
      );
    }
    if (source === "verified_authorization") {
      const authorization = assertAuthorizationDecision(authorizationDecision, { now: now ?? new Date() });
      if (
        authorization.revalidationCount < 1 ||
        authorization.tenantId !== trusted.tenantId ||
        authorization.actorId !== trusted.actorId ||
        authorization.actorType !== trusted.actorType ||
        authorization.clientId !== trusted.clientId ||
        authorization.credentialId !== trusted.credentialId ||
        authorization.policyVersion !== trusted.policyVersion ||
        authorization.tokenJtiHash !== trusted.tokenJtiHash
      ) {
        throw new DomainError(
          "tenant_authorization_context_mismatch",
          "Tenant command context must match a revalidated Authorization Decision"
        );
      }
    } else if (authorizationDecision !== undefined) {
      throw new DomainError(
        "invalid_tenant_security_context",
        "authorizationDecision requires verified authorization"
      );
    }
  } else if (authenticationContext !== undefined || authorizationDecision !== undefined) {
    throw new DomainError(
      "invalid_tenant_security_context",
      "authenticationContext is only valid for verified authentication"
    );
  }
  const context = Object.freeze({
    tenantId,
    actorId,
    policyVersion,
    source,
    ...(source === "verified_authorization"
      ? {
          authorizationDecisionId: authorizationDecision.decisionId,
          operationId: authorizationDecision.operationId
        }
      : {})
  });
  trustedContexts.add(context);
  return context;
}

export function createTenantSecurityContextFromAuthentication(authenticationContext) {
  const trusted = assertAuthenticationContext(authenticationContext);
  return createTenantSecurityContext({
    tenantId: trusted.tenantId,
    actorId: trusted.actorId,
    policyVersion: trusted.policyVersion,
    source: "verified_authentication",
    authenticationContext: trusted
  });
}

export function createTenantSecurityContextFromAuthorization({
  authenticationContext,
  authorizationDecision,
  now = new Date()
}) {
  const authentication = assertAuthenticationContext(authenticationContext);
  const authorization = assertAuthorizationDecision(authorizationDecision);
  return createTenantSecurityContext({
    tenantId: authentication.tenantId,
    actorId: authentication.actorId,
    policyVersion: authentication.policyVersion,
    source: "verified_authorization",
    authenticationContext: authentication,
    authorizationDecision: authorization,
    now
  });
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
       set_config('app.policy_version', $3, true),
       set_config('search_path', 'pg_catalog, public, pg_temp', true)`,
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
