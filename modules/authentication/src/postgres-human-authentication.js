import { randomBytes } from "node:crypto";
import { createSiweMessage } from "viem/siwe";
import { getAddress } from "viem";
import { createOperationalId, hashId } from "../../../packages/domain/src/index.js";
import { createAuthenticationContext } from "./authentication-context.js";
import { createAuthenticationEvent } from "./authentication-event-store.js";
import {
  ActorType,
  AuthenticationEventType,
  ClientAuthenticationMethod,
  CredentialStatus,
  SenderConstraintMethod
} from "./constants.js";
import {
  assertBoundedString,
  assertExactObjectKeys,
  assertSafeIdentifier,
  assertStringList,
  authenticationError,
  constantTimeEqual,
  randomOpaqueValue,
  sha256Base64Url
} from "./security-utils.js";
import {
  assertWalletSessionInvalidationIdempotencyKey,
  assertWalletSessionInvalidationReason,
  walletSessionInvalidationResult
} from "./wallet-session-invalidation.js";

const HUMAN_ACTOR_TYPES = new Set([
  ActorType.HUMAN,
  ActorType.RISK_OPERATOR,
  ActorType.OPERATIONS_OPERATOR,
  ActorType.AUDITOR
]);
const HUMAN_AUTHENTICATION_METHODS = new Set([
  ClientAuthenticationMethod.OIDC_PKCE_BFF,
  ClientAuthenticationMethod.SIWE
]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const APPROVED_CHAIN_IDS = new Set([84532, 1952]);
const SELECTABLE_HUMAN_ROLES = new Set(["human_borrower", "principal_controller"]);
const PUBLIC_BETA_ROLE_PROFILE_KEYS = new Set([
  "human_borrower",
  "principal_controller"
]);
const TRANSACTION_COOKIE_NAME = "__Host-ipo_one_login";
const SESSION_COOKIE_NAME = "__Host-ipo_one_session";
const TENANT_ROW_POLICY = "(tenant_id = current_app_tenant_id())";
const ACTOR_SELECT_POLICY =
  "(EXISTS ( SELECT 1 FROM memberships m WHERE ((m.actor_id = actors.id) AND " +
  "(m.tenant_id = current_app_tenant_id()) AND (m.status = 'active'::membership_status) AND " +
  "(m.valid_from <= clock_timestamp()) AND ((m.expires_at IS NULL) OR " +
  "(m.expires_at > clock_timestamp())))))";
const ACTOR_LOCK_POLICY =
  "(EXISTS ( SELECT 1 FROM memberships membership_row WHERE " +
  "((membership_row.actor_id = actors.id) AND " +
  "(membership_row.tenant_id = current_app_tenant_id()) AND " +
  "(membership_row.status = 'active'::membership_status) AND " +
  "(membership_row.valid_from <= clock_timestamp()) AND " +
  "((membership_row.expires_at IS NULL) OR " +
  "(membership_row.expires_at > clock_timestamp())))))";

function authenticationRlsPolicies() {
  const policies = new Map([
    ["tenants\0tenant_self_select", ["SELECT", "(id = current_app_tenant_id())", null]],
    ["tenants\0tenant_self_update", [
      "UPDATE",
      "(id = current_app_tenant_id())",
      "(id = current_app_tenant_id())"
    ]],
    ["actors\0actor_membership_select", ["SELECT", ACTOR_SELECT_POLICY, null]],
    ["actors\0actor_authorization_lock_update", ["UPDATE", ACTOR_LOCK_POLICY, ACTOR_LOCK_POLICY]],
    ["memberships\0tenant_isolation_memberships", ["ALL", TENANT_ROW_POLICY, TENANT_ROW_POLICY]]
  ]);
  for (const table of [
    "authentication_credentials",
    "authentication_role_enrollments",
    "authentication_oidc_transactions",
    "authentication_wallet_transactions",
    "authentication_sessions",
    "authentication_session_invalidations",
    "authentication_replay_entries",
    "authentication_events"
  ]) {
    policies.set(`${table}\0tenant_isolation_${table}`, ["ALL", TENANT_ROW_POLICY, TENANT_ROW_POLICY]);
  }
  return policies;
}

function assertRepository(repository, expectedTenantId) {
  if (
    !repository ||
    typeof repository.withTenantRead !== "function" ||
    typeof repository.withTenantWrite !== "function" ||
    repository.tenantContext?.tenantId !== expectedTenantId
  ) {
    throw authenticationError(
      "invalid_authentication_configuration",
      "PostgreSQL authentication requires a Tenant transaction repository"
    );
  }
  return repository;
}

export async function assertPostgresAuthenticationRole(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw authenticationError(
      "invalid_authentication_configuration",
      "PostgreSQL authentication role verification requires a queryable"
    );
  }
  const roleResult = await queryable.query(`
    SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
           r.rolcreaterole, r.rolreplication, r.rolinherit, r.rolcanlogin,
           session_user = current_user AS is_session_role,
           EXISTS (
             SELECT 1 FROM pg_catalog.pg_auth_members membership WHERE membership.member = r.oid
           ) AS has_role_membership,
           EXISTS (
             SELECT 1
               FROM pg_catalog.pg_class c
               JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public'
                AND c.relkind IN ('r', 'p')
                AND c.relrowsecurity
                AND c.relowner = r.oid
           ) AS owns_rls_table
      FROM pg_catalog.pg_roles r
     WHERE r.rolname = current_user
  `);
  const role = roleResult.rows[0];
  if (
    !role ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    role.rolinherit ||
    !role.rolcanlogin ||
    !role.is_session_role ||
    role.has_role_membership ||
    role.owns_rls_table
  ) {
    throw authenticationError(
      "unsafe_postgres_authentication_role",
      "authentication role must be non-owner and hold no database bypass privilege"
    );
  }

  const namespacePrivileges = await queryable.query(`
    SELECT
      has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
      has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
      has_database_privilege(current_user, current_database(), 'CREATE') AS database_create
  `);
  const namespace = namespacePrivileges.rows[0];
  if (!namespace?.schema_usage || namespace.schema_create || namespace.database_create) {
    throw authenticationError(
      "unsafe_postgres_authentication_role",
      "authentication role namespace privileges do not match the closed boundary"
    );
  }

  const searchPath = await queryable.query("SELECT current_schemas(false)::text[] AS schemas");
  if (
    !Array.isArray(searchPath.rows[0]?.schemas) ||
    searchPath.rows[0].schemas.length !== 1 ||
    searchPath.rows[0].schemas[0] !== "public"
  ) {
    throw authenticationError(
      "unsafe_postgres_authentication_role",
      "authentication role search path does not match the closed boundary"
    );
  }

  const expected = Object.freeze({
    tenants: [true, false, false, false, false, false, false],
    actors: [true, false, false, false, false, false, false],
    memberships: [true, false, false, false, false, false, false],
    authentication_credentials: [true, true, true, false, false, false, false],
    authentication_role_enrollments: [true, true, true, false, false, false, false],
    authentication_oidc_transactions: [true, true, false, true, false, false, false],
    authentication_wallet_transactions: [true, true, false, true, false, false, false],
    authentication_sessions: [true, true, true, false, false, false, false],
    authentication_session_invalidations: [true, true, false, false, false, false, false],
    authentication_replay_entries: [true, true, false, true, false, false, false],
    authentication_events: [true, true, false, false, false, false, false]
  });
  for (const [table, privileges] of Object.entries(expected)) {
    const result = await queryable.query(
      `SELECT
         has_table_privilege(current_user, $1, 'SELECT') AS can_select,
         has_table_privilege(current_user, $1, 'INSERT') AS can_insert,
         has_table_privilege(current_user, $1, 'UPDATE') AS can_update,
         has_table_privilege(current_user, $1, 'DELETE') AS can_delete,
         has_table_privilege(current_user, $1, 'TRUNCATE') AS can_truncate,
         has_table_privilege(current_user, $1, 'REFERENCES') AS can_reference,
         has_table_privilege(current_user, $1, 'TRIGGER') AS can_trigger`,
      [`public.${table}`]
    );
    const actual = Object.values(result.rows[0]);
    if (
      actual.length !== privileges.length ||
      actual.some((value, index) => value !== privileges[index])
    ) {
      throw authenticationError(
        "unsafe_postgres_authentication_role",
        "authentication role privileges do not match the closed allowlist"
      );
    }
  }
  const columnPrivileges = await queryable.query(
    `SELECT c.relname AS table_name, a.attname AS column_name,
            has_column_privilege(current_user, c.oid, a.attnum, 'SELECT') AS can_select,
            has_column_privilege(current_user, c.oid, a.attnum, 'INSERT') AS can_insert,
            has_column_privilege(current_user, c.oid, a.attnum, 'UPDATE') AS can_update,
            has_column_privilege(current_user, c.oid, a.attnum, 'REFERENCES') AS can_reference
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND c.relname = ANY($1::text[])
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum`,
    [Object.keys(expected)]
  );
  if (columnPrivileges.rowCount === 0) {
    throw authenticationError(
      "unsafe_postgres_authentication_role",
      "authentication role column privileges do not match the closed allowlist"
    );
  }
  for (const row of columnPrivileges.rows) {
    const tablePrivileges = expected[row.table_name];
    const boundedLock = row.column_name === "id" && (
      row.table_name === "actors" ||
      row.table_name === "memberships" ||
      row.table_name === "authentication_role_enrollments"
    );
    if (
      !tablePrivileges ||
      row.can_select !== tablePrivileges[0] ||
      row.can_insert !== tablePrivileges[1] ||
      row.can_update !== (tablePrivileges[2] || boundedLock) ||
      row.can_reference !== tablePrivileges[5]
    ) {
      throw authenticationError(
        "unsafe_postgres_authentication_role",
        "authentication role column privileges do not match the closed allowlist"
      );
    }
  }
  const unexpectedPrivileges = await queryable.query(
    `SELECT c.relname AS table_name
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND NOT (c.relname = ANY($1::text[]))
        AND (
          has_table_privilege(current_user, c.oid, 'SELECT')
          OR has_table_privilege(current_user, c.oid, 'INSERT')
          OR has_table_privilege(current_user, c.oid, 'UPDATE')
          OR has_table_privilege(current_user, c.oid, 'DELETE')
          OR has_table_privilege(current_user, c.oid, 'TRUNCATE')
          OR has_table_privilege(current_user, c.oid, 'REFERENCES')
          OR has_table_privilege(current_user, c.oid, 'TRIGGER')
          OR has_any_column_privilege(current_user, c.oid, 'SELECT')
          OR has_any_column_privilege(current_user, c.oid, 'INSERT')
          OR has_any_column_privilege(current_user, c.oid, 'UPDATE')
          OR has_any_column_privilege(current_user, c.oid, 'REFERENCES')
        )
      ORDER BY c.relname`,
    [Object.keys(expected)]
  );
  if (unexpectedPrivileges.rowCount !== 0) {
    throw authenticationError(
      "unsafe_postgres_authentication_role",
      "authentication role must not access tables outside the authentication boundary"
    );
  }

  const rlsTables = await queryable.query(
    `SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND c.relname = ANY($1::text[])
      ORDER BY c.relname`,
    [Object.keys(expected)]
  );
  if (
    rlsTables.rowCount !== Object.keys(expected).length ||
    rlsTables.rows.some((row) => row.relrowsecurity !== true || row.relforcerowsecurity !== true)
  ) {
    throw authenticationError(
      "unsafe_postgres_authentication_role",
      "authentication tables must enforce the reviewed RLS boundary"
    );
  }
  const expectedPolicies = authenticationRlsPolicies();
  const rlsPolicies = await queryable.query(
    `SELECT tablename AS table_name, policyname AS policy_name,
            permissive, roles::text[] AS roles, cmd,
            regexp_replace(qual, '\\s+', ' ', 'g') AS qual,
            regexp_replace(with_check, '\\s+', ' ', 'g') AS with_check
       FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = ANY($1::text[])
      ORDER BY tablename, policyname`,
    [Object.keys(expected)]
  );
  if (rlsPolicies.rowCount !== expectedPolicies.size) {
    throw authenticationError(
      "unsafe_postgres_authentication_role",
      "authentication RLS policies do not match the reviewed closed set"
    );
  }
  for (const row of rlsPolicies.rows) {
    const policy = expectedPolicies.get(`${row.table_name}\0${row.policy_name}`);
    if (
      !policy ||
      row.permissive !== "PERMISSIVE" ||
      !Array.isArray(row.roles) ||
      row.roles.length !== 1 ||
      row.roles[0] !== "public" ||
      row.cmd !== policy[0] ||
      row.qual !== policy[1] ||
      row.with_check !== policy[2]
    ) {
      throw authenticationError(
        "unsafe_postgres_authentication_role",
        "authentication RLS policies do not match the reviewed closed set"
      );
    }
  }
  return Object.freeze({
    roleName: role.rolname,
    superuser: false,
    bypassRls: false,
    ownsRlsTable: false,
    boundary: "authentication_only"
  });
}

function tenantId(value) {
  return assertSafeIdentifier("tenantId", value);
}

function assertTenant(expected, actual) {
  const checked = tenantId(actual);
  if (checked !== expected) {
    throw authenticationError("authentication_binding_rejected", "authentication Tenant binding is invalid");
  }
  return checked;
}

function exactHttpsOrigin(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_input", `${name} is invalid`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw authenticationError("invalid_authentication_input", `${name} is invalid`);
  }
  return parsed.origin;
}

function exactRedirectUri(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("oidc_redirect_rejected", "OIDC redirect URI is invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search.length > 2_048
  ) {
    throw authenticationError("oidc_redirect_rejected", "OIDC redirect URI is invalid");
  }
  return parsed.href;
}

function exactWalletUrl(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  return parsed;
}

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function safeVersion(value, name = "version") {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw authenticationError("authentication_store_corrupt", `${name} is invalid`);
  }
  return normalized;
}

function safeNonnegativeInteger(value, name) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw authenticationError("authentication_store_corrupt", `${name} is invalid`);
  }
  return normalized;
}

function jsonList(value, name, options = {}) {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw authenticationError("authentication_store_corrupt", `${name} is invalid`);
    }
  }
  try {
    return assertStringList(name, parsed, options);
  } catch {
    throw authenticationError("authentication_store_corrupt", `${name} is invalid`);
  }
}

function positiveDuration(name, value, maximum) {
  if (!Number.isSafeInteger(value) || value < 60_000 || value > maximum) {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  return value;
}

function cookie(value, expiresAt) {
  return Object.freeze({
    name: SESSION_COOKIE_NAME,
    value,
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    domain: undefined,
    expiresAt
  });
}

function transactionCookie(value, expiresAt) {
  return Object.freeze({
    name: TRANSACTION_COOKIE_NAME,
    value,
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    domain: undefined,
    expiresAt
  });
}

async function appendEvent(client, input) {
  const event = createAuthenticationEvent(input);
  await client.query(
    `INSERT INTO authentication_events(
       id, tenant_id, event_type, actor_id, credential_id,
       reason_code, occurred_at, payload, schema_version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      event.eventId,
      event.tenantId,
      event.eventType,
      event.actorId,
      event.credentialId,
      event.reasonCode,
      event.occurredAt,
      JSON.stringify(event.payload),
      event.schemaVersion
    ]
  );
  return event;
}

function normalizeAddress(value) {
  try {
    return getAddress(assertBoundedString("wallet address", value, {
      minimum: 42,
      maximum: 42,
      pattern: /^0x[0-9a-fA-F]{40}$/
    }));
  } catch {
    throw authenticationError("invalid_authentication_input", "wallet address is invalid");
  }
}

function normalizeChainId(value) {
  if (!Number.isSafeInteger(value) || !APPROVED_CHAIN_IDS.has(value)) {
    throw authenticationError("wallet_chain_rejected", "wallet chain is not approved");
  }
  return value;
}

function selectableHumanRole(value) {
  const role = assertBoundedString("requestedRole", value, {
    maximum: 64,
    pattern: /^[a-z][a-z0-9_]+$/
  });
  if (!SELECTABLE_HUMAN_ROLES.has(role)) {
    throw authenticationError(
      "authentication_role_rejected",
      "selected Human workspace is not available"
    );
  }
  return role;
}

export class PostgresLoginTransactionStore {
  constructor({
    eventRepository,
    tenantId: configuredTenantId,
    referenceHasher,
    secretBox,
    ttlMs = 5 * 60_000,
    maximumTransactions = 1_000
  }) {
    this.tenantId = tenantId(configuredTenantId);
    this.repository = assertRepository(eventRepository, this.tenantId);
    if (!referenceHasher?.hash || !secretBox?.seal || !secretBox?.open) {
      throw authenticationError("invalid_authentication_configuration", "OIDC transaction protection is required");
    }
    this.referenceHasher = referenceHasher;
    this.secretBox = secretBox;
    this.ttlMs = positiveDuration("login transaction lifetime", ttlMs, 10 * 60_000);
    if (!Number.isSafeInteger(maximumTransactions) || maximumTransactions < 1 || maximumTransactions > 10_000) {
      throw authenticationError("invalid_authentication_configuration", "login transaction capacity is invalid");
    }
    this.maximumTransactions = maximumTransactions;
  }

  async create({ redirectUri, providerId = "oidc", now = new Date() }) {
    const checkedRedirect = exactRedirectUri(redirectUri);
    const checkedProvider = assertSafeIdentifier("providerId", providerId);
    const handle = randomOpaqueValue();
    const state = randomOpaqueValue();
    const nonce = randomOpaqueValue();
    const codeVerifier = randomOpaqueValue(48);
    const expiresAt = new Date(now.getTime() + this.ttlMs).toISOString();
    await this.repository.withTenantWrite(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('authentication_oidc_capacity'), hashtext($1))",
        [this.tenantId]
      );
      await client.query(
        "DELETE FROM authentication_oidc_transactions WHERE tenant_id = $1 AND expires_at <= $2",
        [this.tenantId, now]
      );
      const count = await client.query(
        "SELECT count(*)::int AS count FROM authentication_oidc_transactions WHERE tenant_id = $1",
        [this.tenantId]
      );
      if (count.rows[0].count >= this.maximumTransactions) {
        throw authenticationError("oidc_transaction_capacity_exceeded", "login transaction capacity is exhausted");
      }
      await client.query(
         `INSERT INTO authentication_oidc_transactions(
           tenant_id, handle_ref_hash, state_ref_hash, provider_id, redirect_uri,
           nonce_ciphertext, code_verifier_ciphertext, expires_at, created_at,
           reference_hash_key_version, schema_version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   'authentication_oidc_transaction.v1')`,
        [
          this.tenantId,
          this.referenceHasher.hash("oidc.transaction", handle),
          this.referenceHasher.hash("oidc.state", state),
          checkedProvider,
          checkedRedirect,
          this.secretBox.seal("oidc.nonce", nonce),
          this.secretBox.seal("oidc.code_verifier", codeVerifier),
          expiresAt,
          now,
          this.referenceHasher.keyVersion
        ]
      );
    });
    return Object.freeze({
      handle,
      state,
      nonce,
      codeChallenge: sha256Base64Url(codeVerifier),
      expiresAt,
      cookie: transactionCookie(handle, expiresAt)
    });
  }

  async consume({ handle, state, redirectUri, providerId = "oidc", now = new Date() }) {
    const handleRefHash = this.referenceHasher.hash(
      "oidc.transaction",
      assertBoundedString("transaction handle", handle, { minimum: 32, maximum: 128 })
    );
    let suppliedState;
    let checkedRedirect;
    let checkedProvider;
    try {
      suppliedState = this.referenceHasher.hash(
        "oidc.state",
        assertBoundedString("state", state, { minimum: 32, maximum: 128 })
      );
      checkedRedirect = exactRedirectUri(redirectUri);
      checkedProvider = assertSafeIdentifier("providerId", providerId);
    } catch {
      throw authenticationError("oidc_transaction_rejected", "login transaction validation failed");
    }
    const row = await this.repository.withTenantWrite(async (client) => {
      const result = await client.query(
        `DELETE FROM authentication_oidc_transactions
          WHERE tenant_id = $1
            AND handle_ref_hash = $2
            AND state_ref_hash = $3
            AND provider_id = $4
            AND redirect_uri = $5
            AND expires_at > $6
        RETURNING *`,
        [this.tenantId, handleRefHash, suppliedState, checkedProvider, checkedRedirect, now]
      );
      return result.rows[0];
    });
    if (!row) {
      throw authenticationError("oidc_transaction_rejected", "login transaction validation failed");
    }
    try {
      return Object.freeze({
        providerId: row.provider_id,
        redirectUri: row.redirect_uri,
        nonce: this.secretBox.open("oidc.nonce", row.nonce_ciphertext),
        codeVerifier: this.secretBox.open("oidc.code_verifier", row.code_verifier_ciphertext),
        expiresAt: timestamp(row.expires_at)
      });
    } catch {
      throw authenticationError("oidc_transaction_rejected", "login transaction validation failed");
    }
  }
}

export class PostgresWalletLoginTransactionStore {
  constructor({
    eventRepository,
    tenantId: configuredTenantId,
    referenceHasher,
    secretBox,
    domain,
    uri,
    statement = "Sign in to the IPO.ONE no-funds credit workspace.",
    ttlMs = 5 * 60_000,
    maximumTransactions = 1_000
  }) {
    this.tenantId = tenantId(configuredTenantId);
    this.repository = assertRepository(eventRepository, this.tenantId);
    if (!referenceHasher?.hash || !secretBox?.seal || !secretBox?.open) {
      throw authenticationError("invalid_authentication_configuration", "wallet transaction protection is required");
    }
    const parsedUri = exactWalletUrl("wallet login URI", uri);
    if (parsedUri.host !== domain || parsedUri.origin !== `https://${domain}`) {
      throw authenticationError("invalid_authentication_configuration", "wallet login origin is invalid");
    }
    this.referenceHasher = referenceHasher;
    this.secretBox = secretBox;
    this.domain = domain;
    this.uri = parsedUri.href;
    this.statement = assertBoundedString("wallet login statement", statement, { maximum: 256 });
    this.ttlMs = positiveDuration("wallet login lifetime", ttlMs, 10 * 60_000);
    if (!Number.isSafeInteger(maximumTransactions) || maximumTransactions < 1 || maximumTransactions > 10_000) {
      throw authenticationError("invalid_authentication_configuration", "wallet login capacity is invalid");
    }
    this.maximumTransactions = maximumTransactions;
  }

  async create({ address, chainId, requestedRole, now = new Date() }) {
    const checkedAddress = normalizeAddress(address);
    const checkedChainId = normalizeChainId(chainId);
    const checkedRole = selectableHumanRole(requestedRole);
    const handle = randomOpaqueValue();
    const nonce = randomBytes(16).toString("hex");
    const expirationTime = new Date(now.getTime() + this.ttlMs);
    const message = createSiweMessage({
      address: checkedAddress,
      chainId: checkedChainId,
      domain: this.domain,
      expirationTime,
      issuedAt: now,
      nonce,
      statement: `${this.statement} Selected workspace: ${checkedRole === "human_borrower" ? "Human Borrower" : "Principal Controller"}.`,
      uri: this.uri,
      version: "1"
    });
    await this.repository.withTenantWrite(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('authentication_wallet_capacity'), hashtext($1))",
        [this.tenantId]
      );
      await client.query(
        "DELETE FROM authentication_wallet_transactions WHERE tenant_id = $1 AND expires_at <= $2",
        [this.tenantId, now]
      );
      const count = await client.query(
        "SELECT count(*)::int AS count FROM authentication_wallet_transactions WHERE tenant_id = $1",
        [this.tenantId]
      );
      if (count.rows[0].count >= this.maximumTransactions) {
        throw authenticationError("wallet_transaction_capacity_exceeded", "wallet login capacity is exhausted");
      }
      await client.query(
         `INSERT INTO authentication_wallet_transactions(
           tenant_id, handle_ref_hash, address_ref_hash, address_ciphertext,
           chain_id, requested_role, message_ciphertext, expires_at, created_at,
           reference_hash_key_version, schema_version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   'authentication_wallet_transaction.v1')`,
        [
          this.tenantId,
          this.referenceHasher.hash("siwe.transaction", handle),
          this.referenceHasher.hash("siwe.address", checkedAddress.toLowerCase()),
          this.secretBox.seal("siwe.address", checkedAddress),
          checkedChainId,
          checkedRole,
          this.secretBox.seal("siwe.message", message),
          expirationTime,
          now,
          this.referenceHasher.keyVersion
        ]
      );
    });
    return Object.freeze({
      handle,
      address: checkedAddress,
      chainId: checkedChainId,
      requestedRole: checkedRole,
      message,
      expiresAt: expirationTime.toISOString()
    });
  }

  async consume({ handle, now = new Date() }) {
    const handleRefHash = this.referenceHasher.hash(
      "siwe.transaction",
      assertBoundedString("wallet transaction handle", handle, { minimum: 32, maximum: 128 })
    );
    const row = await this.repository.withTenantWrite(async (client) => {
      const result = await client.query(
        `DELETE FROM authentication_wallet_transactions
          WHERE tenant_id = $1 AND handle_ref_hash = $2
        RETURNING *`,
        [this.tenantId, handleRefHash]
      );
      return result.rows[0];
    });
    if (!row || new Date(row.expires_at) <= now) {
      throw authenticationError("wallet_transaction_rejected", "wallet login transaction is not active");
    }
    try {
      const address = this.secretBox.open("siwe.address", row.address_ciphertext);
      if (!constantTimeEqual(
        row.address_ref_hash,
        this.referenceHasher.hash("siwe.address", address.toLowerCase())
      )) {
        throw new Error("wallet transaction binding mismatch");
      }
      return Object.freeze({
        address: normalizeAddress(address),
        chainId: normalizeChainId(Number(row.chain_id)),
        requestedRole: selectableHumanRole(row.requested_role),
        message: this.secretBox.open("siwe.message", row.message_ciphertext),
        expiresAt: timestamp(row.expires_at)
      });
    } catch {
      throw authenticationError("wallet_transaction_rejected", "wallet login transaction is invalid");
    }
  }
}

function senderConstraint(value) {
  assertExactObjectKeys("senderConstraint", value, { required: ["method", "thumbprint"] });
  if (value.method !== SenderConstraintMethod.HOST_SESSION) {
    throw authenticationError("invalid_authentication_input", "Human sender constraint is invalid");
  }
  return Object.freeze({
    method: value.method,
    thumbprint: assertBoundedString("sender thumbprint", value.thumbprint, {
      minimum: 43,
      maximum: 128,
      pattern: /^[A-Za-z0-9_-]+$/
    })
  });
}

function credentialFromRow(row) {
  if (!row) return undefined;
  return Object.freeze({
    credentialId: row.id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    actorType: row.actor_type,
    issuer: row.issuer,
    subjectRefHash: row.subject_ref_hash,
    referenceHashKeyVersion: row.reference_hash_key_version ?? "v1",
    clientId: row.client_id,
    clientAuthenticationMethod: row.client_authentication_method,
    senderConstraint: Object.freeze({
      method: row.sender_constraint_method,
      thumbprint: row.sender_constraint_ref_hash,
      referenceProtected: true
    }),
    roles: jsonList(row.roles, "credential roles", { maximumItems: 16 }),
    allowedCapabilities: jsonList(row.allowed_capabilities, "credential capabilities"),
    policyVersion: row.policy_version,
    status: row.status,
    version: safeVersion(row.version, "credential version"),
    expiresAt: row.expires_at ? timestamp(row.expires_at) : undefined,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  });
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function publicBetaRoleProfiles(value) {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== PUBLIC_BETA_ROLE_PROFILE_KEYS.size ||
    Object.keys(value).some((key) => !PUBLIC_BETA_ROLE_PROFILE_KEYS.has(key))
  ) {
    throw authenticationError(
      "invalid_authentication_configuration",
      "public Beta wallet role profiles are invalid"
    );
  }
  return Object.freeze(Object.fromEntries(
    [...PUBLIC_BETA_ROLE_PROFILE_KEYS].map((roleBundle) => [
      roleBundle,
      assertStringList(
        `${roleBundle} public Beta capabilities`,
        value[roleBundle],
        { allowEmpty: false }
      )
    ])
  ));
}

export class PostgresCredentialRegistry {
  constructor({
    eventRepository,
    tenantId: configuredTenantId,
    referenceHasher,
    systemActorId,
    publicBetaWalletRoleProfiles,
    maximumCredentials = 10_000
  }) {
    this.tenantId = tenantId(configuredTenantId);
    this.repository = assertRepository(eventRepository, this.tenantId);
    if (!referenceHasher?.hash) {
      throw authenticationError("invalid_authentication_configuration", "credential reference protection is required");
    }
    if (!Number.isSafeInteger(maximumCredentials) || maximumCredentials < 1 || maximumCredentials > 100_000) {
      throw authenticationError("invalid_authentication_configuration", "credential capacity is invalid");
    }
    this.referenceHasher = referenceHasher;
    this.systemActorId = assertSafeIdentifier("systemActorId", systemActorId);
    this.publicBetaWalletRoleProfiles = publicBetaRoleProfiles(
      publicBetaWalletRoleProfiles
    );
    this.maximumCredentials = maximumCredentials;
  }

  async provisionVerifiedPublicBetaHumanSubject({
    issuer,
    tenantId: requestedTenantId,
    externalSubject,
    clientId,
    now = new Date()
  }) {
    if (!this.publicBetaWalletRoleProfiles) {
      throw authenticationError(
        "authentication_credential_rejected",
        "credential is not active"
      );
    }
    assertTenant(this.tenantId, requestedTenantId);
    const normalizedIssuer = exactHttpsOrigin("issuer", issuer);
    const normalizedClientId = assertSafeIdentifier("clientId", clientId);
    const normalizedSubject = assertBoundedString(
      "externalSubject",
      externalSubject,
      {
        maximum: 512,
        pattern: /^eip155:(?:84532|1952):0x[0-9a-f]{40}$/
      }
    );
    const subjectRefHash = this.referenceHasher.hash(
      "subject",
      `${normalizedIssuer}\0${normalizedSubject}`
    );
    const stableIdentityHash = hashId("public_beta_wallet_identity", {
      tenantId: this.tenantId,
      issuer: normalizedIssuer,
      clientId: normalizedClientId,
      subjectRefHash
    });
    const actorId = `actor_public_beta_${stableIdentityHash.slice(2, 34)}`;
    const membershipId = `membership_${actorId}`;
    const actorHash = hashId("public_beta_actor", actorId);
    const membershipHash = hashId(
      "public_beta_membership",
      `${this.tenantId}:${actorId}`
    );
    const senderConstraintRefHash = this.referenceHasher.hash(
      "sender.constraint",
      `public-beta-host-session\0${actorId}`
    );
    const credentialId = createOperationalId("credential");
    const humanEnrollmentId = createOperationalId("role_enrollment");
    const principalEnrollmentId = createOperationalId("role_enrollment");
    const roles = this.publicBetaWalletRoleProfiles;

    return this.repository.withTenantWrite(async (client) => {
      const result = await client.query(
        `SELECT provision_public_beta_human_wallet_identity(
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18
         ) AS credential_id`,
        [
          this.tenantId,
          this.systemActorId,
          actorId,
          actorHash,
          membershipId,
          membershipHash,
          credentialId,
          humanEnrollmentId,
          principalEnrollmentId,
          normalizedIssuer,
          subjectRefHash,
          this.referenceHasher.keyVersion,
          normalizedClientId,
          senderConstraintRefHash,
          this.repository.tenantContext.policyVersion,
          JSON.stringify(roles.human_borrower),
          JSON.stringify(roles.principal_controller),
          now
        ]
      );
      if (result.rowCount !== 1 || typeof result.rows[0]?.credential_id !== "string") {
        throw authenticationError(
          "authentication_credential_rejected",
          "credential is not active"
        );
      }
      return this.#activeInTransaction(
        client,
        result.rows[0].credential_id,
        now
      );
    });
  }

  async register(input) {
    assertExactObjectKeys("credential registration", input, {
      required: [
        "tenantId",
        "actorId",
        "actorType",
        "issuer",
        "externalSubject",
        "clientId",
        "clientAuthenticationMethod",
        "senderConstraint",
        "roles",
        "allowedCapabilities",
        "policyVersion",
        "performedByActorId",
        "reasonCode"
      ],
      optional: ["expiresAt", "now"]
    });
    assertTenant(this.tenantId, input.tenantId);
    const actorId = assertSafeIdentifier("actorId", input.actorId);
    if (!HUMAN_ACTOR_TYPES.has(input.actorType) || !HUMAN_AUTHENTICATION_METHODS.has(input.clientAuthenticationMethod)) {
      throw authenticationError("invalid_authentication_input", "Human credential profile is invalid");
    }
    const issuer = exactHttpsOrigin("issuer", input.issuer);
    const externalSubject = assertBoundedString("externalSubject", input.externalSubject, { maximum: 512 });
    const clientId = assertSafeIdentifier("clientId", input.clientId);
    const constraint = senderConstraint(input.senderConstraint);
    const roles = assertStringList("roles", input.roles, { maximumItems: 16 });
    const allowedCapabilities = assertStringList("allowedCapabilities", input.allowedCapabilities);
    const policyVersion = assertSafeIdentifier("policyVersion", input.policyVersion);
    const performedByActorId = assertSafeIdentifier("performedByActorId", input.performedByActorId);
    const reasonCode = assertBoundedString("reasonCode", input.reasonCode, {
      maximum: 96,
      pattern: /^[a-z][a-z0-9_]+$/
    });
    const now = input.now ?? new Date();
    const expiresAt = input.expiresAt === undefined ? undefined : new Date(input.expiresAt);
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)) {
      throw authenticationError("invalid_authentication_input", "credential expiration is invalid");
    }
    const credentialId = createOperationalId("credential");
    const subjectRefHash = this.referenceHasher.hash("subject", `${issuer}\0${externalSubject}`);
    const senderConstraintRefHash = this.referenceHasher.hash("sender.constraint", constraint.thumbprint);

    try {
      const row = await this.repository.withTenantWrite(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('authentication_credential_capacity'), hashtext($1))",
          [this.tenantId]
        );
        const membership = await client.query(
          `SELECT a.actor_type, a.status AS actor_status,
                  m.status AS membership_status, m.role_bundle,
                  m.capabilities, m.client_ids, m.policy_version
             FROM actors a
             JOIN memberships m ON m.actor_id = a.id
            WHERE a.id = $1 AND m.tenant_id = $2
            FOR SHARE OF a, m`,
          [actorId, this.tenantId]
        );
        const binding = membership.rows[0];
        const membershipCapabilities = binding
          ? jsonList(binding.capabilities, "membership capabilities")
          : [];
        const membershipClientIds = binding
          ? jsonList(binding.client_ids, "membership client IDs", { maximumItems: 16 })
          : [];
        if (
          membership.rowCount !== 1 ||
          binding.actor_status !== "active" ||
          binding.membership_status !== "active" ||
          binding.actor_type !== input.actorType ||
          binding.policy_version !== policyVersion ||
          !membershipClientIds.includes(clientId) ||
          !sameValues(roles, [binding.role_bundle]) ||
          allowedCapabilities.some((capability) => !membershipCapabilities.includes(capability))
        ) {
          throw authenticationError("authentication_actor_rejected", "credential Actor binding is not active");
        }
        const count = await client.query(
          "SELECT count(*)::int AS count FROM authentication_credentials WHERE tenant_id = $1",
          [this.tenantId]
        );
        if (count.rows[0].count >= this.maximumCredentials) {
          throw authenticationError("authentication_credential_capacity_exceeded", "credential capacity is exhausted");
        }
        const inserted = await client.query(
          `INSERT INTO authentication_credentials(
             id, tenant_id, actor_id, actor_type, issuer, subject_ref_hash,
             client_id, client_authentication_method, sender_constraint_method,
             sender_constraint_ref_hash, roles, allowed_capabilities,
             policy_version, status, version, expires_at, created_at,
             updated_at, schema_version, reference_hash_key_version
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9,
             $10, $11::jsonb, $12::jsonb,
             $13, 'active', 1, $14, $15,
             $15, 'authentication_credential.v1', $16
           ) RETURNING *`,
          [
            credentialId,
            this.tenantId,
            actorId,
            input.actorType,
            issuer,
            subjectRefHash,
            clientId,
            input.clientAuthenticationMethod,
            constraint.method,
            senderConstraintRefHash,
            JSON.stringify(roles),
            JSON.stringify(allowedCapabilities),
            policyVersion,
            expiresAt ?? null,
            now,
            this.referenceHasher.keyVersion
          ]
        );
        await appendEvent(client, {
          eventType: AuthenticationEventType.CREDENTIAL_REGISTERED,
          tenantId: this.tenantId,
          actorId: performedByActorId,
          credentialId,
          reasonCode,
          occurredAt: now,
          payload: {
            actorType: input.actorType,
            clientAuthenticationMethod: input.clientAuthenticationMethod,
            senderConstraintMethod: constraint.method,
            referenceHashKeyVersion: this.referenceHasher.keyVersion,
            version: 1
          }
        });
        return inserted.rows[0];
      });
      return credentialFromRow(row);
    } catch (error) {
      if (error?.code === "23505") {
        throw authenticationError("authentication_credential_conflict", "credential binding already exists");
      }
      throw error;
    }
  }

  async findBySubject({ issuer, tenantId: requestedTenantId, externalSubject, clientId, now = new Date() }) {
    assertTenant(this.tenantId, requestedTenantId);
    const normalizedIssuer = exactHttpsOrigin("issuer", issuer);
    const normalizedClientId = assertSafeIdentifier("clientId", clientId);
    const subjectRefHash = this.referenceHasher.hash(
      "subject",
      `${normalizedIssuer}\0${assertBoundedString("externalSubject", externalSubject, { maximum: 512 })}`
    );
    return this.repository.withTenantWrite(async (client) => {
      const result = await client.query(
        `SELECT id
           FROM authentication_credentials
          WHERE tenant_id = $1 AND issuer = $2 AND client_id = $3 AND subject_ref_hash = $4`,
        [this.tenantId, normalizedIssuer, normalizedClientId, subjectRefHash]
      );
      return this.#activeInTransaction(client, result.rows[0]?.id, now);
    });
  }

  async findOrRebindVerifiedHumanSubject({
    issuer,
    tenantId: requestedTenantId,
    externalSubject,
    clientId,
    now = new Date()
  }) {
    assertTenant(this.tenantId, requestedTenantId);
    const normalizedIssuer = exactHttpsOrigin("issuer", issuer);
    const normalizedClientId = assertSafeIdentifier("clientId", clientId);
    const normalizedSubject = assertBoundedString(
      "externalSubject",
      externalSubject,
      { maximum: 512 }
    );
    const lookupHashes = typeof this.referenceHasher.lookupHashes === "function"
      ? this.referenceHasher.lookupHashes(
          "subject",
          `${normalizedIssuer}\0${normalizedSubject}`
        )
      : Object.freeze([Object.freeze({
          keyVersion: this.referenceHasher.keyVersion ?? "v1",
          referenceHash: this.referenceHasher.hash(
            "subject",
            `${normalizedIssuer}\0${normalizedSubject}`
          )
        })]);
    const primary = lookupHashes[0];
    const legacy = lookupHashes[1];

    return this.repository.withTenantWrite(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('authentication_reference_rebind'), hashtext($1 || ':' || $2 || ':' || $3))",
        [this.tenantId, normalizedIssuer, normalizedClientId]
      );
      const selected = await client.query(
        `SELECT *
           FROM authentication_credentials
          WHERE tenant_id = $1
            AND issuer = $2
            AND client_id = $3
            AND (
              (reference_hash_key_version = $4 AND subject_ref_hash = $5)
              OR ($6::text IS NOT NULL AND
                  reference_hash_key_version = $6 AND subject_ref_hash = $7)
            )
          ORDER BY reference_hash_key_version DESC, id
          FOR UPDATE`,
        [
          this.tenantId,
          normalizedIssuer,
          normalizedClientId,
          primary.keyVersion,
          primary.referenceHash,
          legacy?.keyVersion ?? null,
          legacy?.referenceHash ?? primary.referenceHash
        ]
      );
      const primaryRows = selected.rows.filter((row) =>
        row.reference_hash_key_version === primary.keyVersion &&
        row.subject_ref_hash === primary.referenceHash
      );
      const legacyRows = legacy === undefined
        ? []
        : selected.rows.filter((row) =>
            row.reference_hash_key_version === legacy.keyVersion &&
            row.subject_ref_hash === legacy.referenceHash
          );
      if (primaryRows.length > 1 || legacyRows.length > 1) {
        throw authenticationError(
          "authentication_reference_binding_ambiguous",
          "credential reference binding is ambiguous"
        );
      }
      const primaryRow = primaryRows[0];
      const legacyRow = legacyRows[0];
      if (primaryRow) {
        if (legacyRow?.status === CredentialStatus.ACTIVE) {
          throw authenticationError(
            "authentication_reference_binding_ambiguous",
            "credential reference binding is ambiguous"
          );
        }
        return this.#activeInTransaction(client, primaryRow.id, now);
      }
      if (
        this.referenceHasher.mode !== "overlap_v2_write_v1_lookup" ||
        primary.keyVersion !== "v2" ||
        legacy?.keyVersion !== "v1" ||
        !legacyRow
      ) {
        throw authenticationError(
          "authentication_credential_rejected",
          "credential is not active"
        );
      }
      const current = await this.#activeInTransaction(client, legacyRow.id, now);
      if (
        !HUMAN_ACTOR_TYPES.has(current.actorType) ||
        !HUMAN_AUTHENTICATION_METHODS.has(current.clientAuthenticationMethod) ||
        current.senderConstraint.method !== SenderConstraintMethod.HOST_SESSION ||
        current.referenceHashKeyVersion !== "v1"
      ) {
        throw authenticationError(
          "authentication_binding_rejected",
          "verified Subject is not bound to a rebindable Human credential"
        );
      }
      const enrollments = await client.query(
        `SELECT *
           FROM authentication_role_enrollments
          WHERE tenant_id = $1 AND credential_id = $2 AND status = 'active'
          ORDER BY role_bundle, id
          FOR UPDATE`,
        [this.tenantId, current.credentialId]
      );
      if (
        current.roles.some((role) => SELECTABLE_HUMAN_ROLES.has(role)) &&
        enrollments.rowCount === 0
      ) {
        throw authenticationError(
          "authentication_role_rejected",
          "verified Human credential has no active role enrollment"
        );
      }
      const credentialId = createOperationalId("credential");
      const senderConstraintRefHash = this.referenceHasher.hash(
        "sender.constraint",
        `verified-human-rebind\0${current.credentialId}\0${credentialId}`
      );
      const inserted = await client.query(
        `INSERT INTO authentication_credentials(
           id, tenant_id, actor_id, actor_type, issuer, subject_ref_hash,
           client_id, client_authentication_method, sender_constraint_method,
           sender_constraint_ref_hash, roles, allowed_capabilities,
           policy_version, status, version, expires_at, created_at, updated_at,
           schema_version, reference_hash_key_version
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9,
           $10, $11::jsonb, $12::jsonb,
           $13, 'active', 1, $14, $15, $15,
           'authentication_credential.v1', 'v2'
         ) RETURNING *`,
        [
          credentialId,
          this.tenantId,
          current.actorId,
          current.actorType,
          current.issuer,
          primary.referenceHash,
          current.clientId,
          current.clientAuthenticationMethod,
          current.senderConstraint.method,
          senderConstraintRefHash,
          JSON.stringify(current.roles),
          JSON.stringify(current.allowedCapabilities),
          current.policyVersion,
          current.expiresAt ?? null,
          now
        ]
      );
      for (const enrollment of enrollments.rows) {
        await client.query(
          `INSERT INTO authentication_role_enrollments(
             id, tenant_id, actor_id, credential_id, role_bundle, capabilities,
             client_ids, policy_version, status, valid_from, expires_at,
             version, created_at, updated_at, schema_version
           ) VALUES (
             $1, $2, $3, $4, $5, $6::jsonb,
             $7::jsonb, $8, 'active', $9, $10,
             1, $11, $11, 'authentication_role_enrollment.v1'
           )`,
          [
            createOperationalId("role_enrollment"),
            this.tenantId,
            current.actorId,
            credentialId,
            enrollment.role_bundle,
            JSON.stringify(enrollment.capabilities),
            JSON.stringify(enrollment.client_ids),
            enrollment.policy_version,
            enrollment.valid_from,
            enrollment.expires_at,
            now
          ]
        );
      }
      await client.query(
        `UPDATE authentication_role_enrollments
            SET status = 'revoked', version = version + 1, updated_at = $3
          WHERE tenant_id = $1 AND credential_id = $2 AND status = 'active'`,
        [this.tenantId, current.credentialId, now]
      );
      const revokedSessions = await client.query(
        `UPDATE authentication_sessions
            SET status = 'revoked', revoked_at = $3,
                end_reason_code = 'reference_hash_key_rotation'
          WHERE tenant_id = $1 AND credential_id = $2 AND status = 'active'
        RETURNING *`,
        [this.tenantId, current.credentialId, now]
      );
      for (const sessionRow of revokedSessions.rows) {
        const session = sessionFromRow(sessionRow);
        await appendEvent(client, {
          eventType: AuthenticationEventType.SESSION_REVOKED,
          tenantId: this.tenantId,
          actorId: current.actorId,
          credentialId: current.credentialId,
          reasonCode: "reference_hash_key_rotation",
          occurredAt: now,
          payload: {
            sessionRefHash: session.sessionRefHash,
            rotation: session.rotation,
            referenceHashKeyVersion: session.referenceHashKeyVersion
          }
        });
      }
      await client.query(
        `UPDATE authentication_credentials
            SET status = 'revoked', updated_at = $3
          WHERE tenant_id = $1 AND id = $2`,
        [this.tenantId, current.credentialId, now]
      );
      await appendEvent(client, {
        eventType: AuthenticationEventType.CREDENTIAL_REVOKED,
        tenantId: this.tenantId,
        actorId: current.actorId,
        credentialId: current.credentialId,
        reasonCode: "reference_hash_key_rotation",
        occurredAt: now,
        payload: { status: CredentialStatus.REVOKED }
      });
      await appendEvent(client, {
        eventType: AuthenticationEventType.CREDENTIAL_REGISTERED,
        tenantId: this.tenantId,
        actorId: current.actorId,
        credentialId,
        reasonCode: "verified_reference_hash_rebind",
        occurredAt: now,
        payload: {
          actorType: current.actorType,
          clientAuthenticationMethod: current.clientAuthenticationMethod,
          senderConstraintMethod: current.senderConstraint.method,
          referenceHashKeyVersion: "v2",
          version: 1
        }
      });
      await appendEvent(client, {
        eventType: AuthenticationEventType.CREDENTIAL_REFERENCE_REBOUND,
        tenantId: this.tenantId,
        actorId: current.actorId,
        credentialId,
        reasonCode: "verified_reference_hash_rebind",
        occurredAt: now,
        payload: {
          oldCredentialId: current.credentialId,
          newCredentialId: credentialId,
          oldReferenceHashKeyVersion: "v1",
          newReferenceHashKeyVersion: "v2"
        }
      });
      return credentialFromRow(inserted.rows[0]);
    });
  }

  async resolveHumanRole({ credentialId, roleBundle, clientId, now = new Date() }) {
    const checkedCredentialId = assertSafeIdentifier("credentialId", credentialId);
    const checkedRole = selectableHumanRole(roleBundle);
    const checkedClientId = assertSafeIdentifier("clientId", clientId);
    return this.repository.withTenantWrite(async (client) => {
      const credential = await this.#activeInTransaction(client, checkedCredentialId, now);
      const result = await client.query(
        `SELECT e.*
           FROM authentication_role_enrollments AS e
           JOIN actors AS a ON a.id = e.actor_id
          WHERE e.tenant_id = $1
            AND e.credential_id = $2
            AND e.actor_id = $3
            AND e.role_bundle = $4
            AND e.status = 'active'
            AND e.valid_from <= $5
            AND (e.expires_at IS NULL OR e.expires_at > $5)
            AND e.policy_version = $6
            AND e.client_ids ? $7
            AND a.actor_type = 'human'
            AND a.status = 'active'
          FOR SHARE OF e, a`,
        [
          this.tenantId,
          checkedCredentialId,
          credential.actorId,
          checkedRole,
          now,
          credential.policyVersion,
          checkedClientId
        ]
      );
      if (result.rowCount !== 1) {
        throw authenticationError(
          "authentication_role_rejected",
          "selected Human workspace is not enrolled"
        );
      }
      const row = result.rows[0];
      return Object.freeze({
        enrollmentId: row.id,
        roleBundle: row.role_bundle,
        capabilities: jsonList(row.capabilities, "role enrollment capabilities"),
        version: safeVersion(row.version, "role enrollment version")
      });
    });
  }

  async get(credentialId) {
    const checkedId = assertSafeIdentifier("credentialId", credentialId);
    const row = await this.repository.withTenantRead(async (client) => {
      const result = await client.query(
        "SELECT * FROM authentication_credentials WHERE tenant_id = $1 AND id = $2",
        [this.tenantId, checkedId]
      );
      return result.rows[0];
    });
    if (!row) throw authenticationError("authentication_credential_rejected", "credential is not active");
    return credentialFromRow(row);
  }

  async assertActive(credentialId, now = new Date()) {
    const checkedId = assertSafeIdentifier("credentialId", credentialId);
    return this.repository.withTenantWrite((client) => this.#activeInTransaction(client, checkedId, now));
  }

  async rotate({ credentialId, senderConstraint: nextConstraint, performedByActorId, reasonCode, now = new Date() }) {
    const checkedId = assertSafeIdentifier("credentialId", credentialId);
    const constraint = senderConstraint(nextConstraint);
    const actorId = assertSafeIdentifier("performedByActorId", performedByActorId);
    const reason = assertBoundedString("reasonCode", reasonCode, {
      maximum: 96,
      pattern: /^[a-z][a-z0-9_]+$/
    });
    const row = await this.repository.withTenantWrite(async (client) => {
      const current = await this.#activeInTransaction(client, checkedId, now);
      if (current.referenceHashKeyVersion !== this.referenceHasher.keyVersion) {
        throw authenticationError(
          "authentication_credential_rebind_required",
          "credential reference binding requires a verified key rebind"
        );
      }
      const result = await client.query(
        `UPDATE authentication_credentials
            SET sender_constraint_ref_hash = $3,
                version = version + 1,
                updated_at = $4
          WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
        [
          this.tenantId,
          checkedId,
          this.referenceHasher.hash("sender.constraint", constraint.thumbprint),
          now
        ]
      );
      const updated = credentialFromRow(result.rows[0]);
      await appendEvent(client, {
        eventType: AuthenticationEventType.CREDENTIAL_ROTATED,
        tenantId: this.tenantId,
        actorId,
        credentialId: checkedId,
        reasonCode: reason,
        occurredAt: now,
        payload: {
          senderConstraintMethod: current.senderConstraint.method,
          referenceHashKeyVersion: current.referenceHashKeyVersion,
          version: updated.version
        }
      });
      return result.rows[0];
    });
    return credentialFromRow(row);
  }

  async suspend(input) {
    return this.#setStatus(input, CredentialStatus.SUSPENDED, AuthenticationEventType.CREDENTIAL_SUSPENDED);
  }

  async revoke(input) {
    return this.#setStatus(input, CredentialStatus.REVOKED, AuthenticationEventType.CREDENTIAL_REVOKED);
  }

  async deprovision({ credentialId, performedByActorId, reasonCode, now = new Date() }) {
    const checkedId = assertSafeIdentifier("credentialId", credentialId);
    const actorId = assertSafeIdentifier("performedByActorId", performedByActorId);
    const reason = assertBoundedString("reasonCode", reasonCode, {
      maximum: 96,
      pattern: /^[a-z][a-z0-9_]+$/
    });
    return this.repository.withTenantWrite(async (client) => {
      const selected = await client.query(
        `SELECT * FROM authentication_credentials
          WHERE tenant_id = $1 AND id = $2
          FOR UPDATE`,
        [this.tenantId, checkedId]
      );
      let credentialRow = selected.rows[0];
      if (!credentialRow) {
        throw authenticationError("authentication_credential_rejected", "credential is not active");
      }
      if (
        credentialRow.status === CredentialStatus.ACTIVE ||
        credentialRow.status === CredentialStatus.SUSPENDED
      ) {
        const updated = await client.query(
          `UPDATE authentication_credentials
              SET status = 'revoked', updated_at = $3
            WHERE tenant_id = $1 AND id = $2
          RETURNING *`,
          [this.tenantId, checkedId, now]
        );
        credentialRow = updated.rows[0];
        await appendEvent(client, {
          eventType: AuthenticationEventType.CREDENTIAL_REVOKED,
          tenantId: this.tenantId,
          actorId,
          credentialId: checkedId,
          reasonCode: reason,
          occurredAt: now,
          payload: { status: CredentialStatus.REVOKED }
        });
      }
      const sessions = await client.query(
        `UPDATE authentication_sessions
            SET status = 'revoked', revoked_at = $3, end_reason_code = $4
          WHERE tenant_id = $1 AND credential_id = $2 AND status = 'active'
        RETURNING *`,
        [this.tenantId, checkedId, now, reason]
      );
      for (const row of sessions.rows) {
        const session = sessionFromRow(row);
        await appendEvent(client, {
          eventType: AuthenticationEventType.SESSION_REVOKED,
          tenantId: this.tenantId,
          actorId: session.actorId,
          credentialId: checkedId,
          reasonCode: reason,
          occurredAt: now,
          payload: {
            sessionRefHash: session.sessionRefHash,
            rotation: session.rotation
          }
        });
      }
      return Object.freeze({
        credential: credentialFromRow(credentialRow),
        revokedSessions: sessions.rowCount
      });
    });
  }

  async #setStatus({ credentialId, performedByActorId, reasonCode, now = new Date() }, status, eventType) {
    const checkedId = assertSafeIdentifier("credentialId", credentialId);
    const actorId = assertSafeIdentifier("performedByActorId", performedByActorId);
    const reason = assertBoundedString("reasonCode", reasonCode, {
      maximum: 96,
      pattern: /^[a-z][a-z0-9_]+$/
    });
    const row = await this.repository.withTenantWrite(async (client) => {
      const currentResult = await client.query(
        `SELECT * FROM authentication_credentials
          WHERE tenant_id = $1 AND id = $2
          FOR UPDATE`,
        [this.tenantId, checkedId]
      );
      const current = currentResult.rows[0];
      if (!current || current.status === CredentialStatus.REVOKED) {
        throw authenticationError("authentication_credential_rejected", "credential is not active");
      }
      if (current.status === status) return current;
      const canTransition =
        current.status === CredentialStatus.ACTIVE ||
        (current.status === CredentialStatus.SUSPENDED && status === CredentialStatus.REVOKED);
      if (!canTransition) {
        throw authenticationError("authentication_credential_rejected", "credential is not active");
      }
      const updated = await client.query(
        `UPDATE authentication_credentials
            SET status = $3, updated_at = $4
          WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
        [this.tenantId, checkedId, status, now]
      );
      await appendEvent(client, {
        eventType,
        tenantId: this.tenantId,
        actorId,
        credentialId: checkedId,
        reasonCode: reason,
        occurredAt: now,
        payload: { status }
      });
      return updated.rows[0];
    });
    return credentialFromRow(row);
  }

  async #activeInTransaction(client, credentialId, now) {
    if (!credentialId) {
      throw authenticationError("authentication_credential_rejected", "credential is not active");
    }
    const result = await client.query(
      `SELECT c.*,
              t.status AS bound_tenant_status,
              a.status AS bound_actor_status,
              a.actor_type AS bound_actor_type,
              m.status AS bound_membership_status,
              m.role_bundle AS bound_role_bundle,
              m.capabilities AS bound_capabilities,
              m.client_ids AS bound_client_ids,
              m.policy_version AS bound_policy_version
         FROM authentication_credentials c
         JOIN tenants t ON t.id = c.tenant_id
         JOIN actors a ON a.id = c.actor_id
         JOIN memberships m ON m.tenant_id = c.tenant_id AND m.actor_id = c.actor_id
        WHERE c.tenant_id = $1 AND c.id = $2
        FOR UPDATE OF c`,
      [this.tenantId, credentialId]
    );
    let row = result.rows[0];
    if (row?.status === CredentialStatus.ACTIVE && row.expires_at && new Date(row.expires_at) <= now) {
      const systemActor = await client.query(
        `SELECT 1
           FROM actors a
           JOIN memberships m ON m.actor_id = a.id
          WHERE a.id = $1 AND a.actor_type = 'system_worker' AND a.status = 'active'
            AND m.tenant_id = $2 AND m.status = 'active'
            AND m.role_bundle = 'system_worker' AND m.policy_version = $3`,
        [this.systemActorId, this.tenantId, row.bound_policy_version]
      );
      if (systemActor.rowCount !== 1) {
        throw authenticationError(
          "invalid_authentication_configuration",
          "authentication system Actor is not active"
        );
      }
      const expired = await client.query(
        `UPDATE authentication_credentials
            SET status = 'expired', updated_at = $3
          WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
        [this.tenantId, credentialId, now]
      );
      row = expired.rows[0];
      await appendEvent(client, {
        eventType: AuthenticationEventType.CREDENTIAL_EXPIRED,
        tenantId: this.tenantId,
        actorId: this.systemActorId,
        credentialId,
        reasonCode: "credential_expired",
        occurredAt: now,
        payload: { status: CredentialStatus.EXPIRED }
      });
    }
    if (!row || row.status !== CredentialStatus.ACTIVE || row.bound_tenant_status !== "active") {
      throw authenticationError("authentication_credential_rejected", "credential is not active");
    }
    const credential = credentialFromRow(row);
    const membershipCapabilities = jsonList(row.bound_capabilities, "membership capabilities");
    const membershipClientIds = jsonList(row.bound_client_ids, "membership client IDs", { maximumItems: 16 });
    if (
      row.bound_actor_status !== "active" ||
      row.bound_membership_status !== "active" ||
      row.bound_actor_type !== credential.actorType ||
      row.bound_policy_version !== credential.policyVersion ||
      !membershipClientIds.includes(credential.clientId) ||
      !sameValues(credential.roles, [row.bound_role_bundle]) ||
      credential.allowedCapabilities.some((capability) => !membershipCapabilities.includes(capability))
    ) {
      throw authenticationError("authentication_credential_rejected", "credential is not active");
    }
    return credential;
  }
}

function sessionFromRow(row) {
  if (!row) return undefined;
  return Object.freeze({
    sessionRefHash: row.session_ref_hash,
    csrfRefHash: row.csrf_ref_hash,
    referenceHashKeyVersion: row.reference_hash_key_version ?? "v1",
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    actorType: row.actor_type,
    clientId: row.client_id,
    authenticationMethod: row.authentication_method,
    credentialId: row.credential_id,
    credentialVersion: safeVersion(row.credential_version, "session credential version"),
    policyVersion: row.policy_version,
    capabilities: jsonList(row.allowed_capabilities, "session capabilities"),
    roles: jsonList(row.roles, "session roles", { maximumItems: 16 }),
    tokenJtiHash: row.token_jti_ref_hash,
    authTime: timestamp(row.auth_time),
    acr: row.acr,
    amr: jsonList(row.amr, "session authentication methods", {
      maximumItems: 8,
      allowEmpty: false,
      itemPattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
    }),
    createdAt: timestamp(row.created_at),
    lastSeenAt: timestamp(row.last_seen_at),
    idleExpiresAt: timestamp(row.idle_expires_at),
    absoluteExpiresAt: timestamp(row.absolute_expires_at),
    status: row.status,
    rotation: safeNonnegativeInteger(row.rotation, "session rotation"),
    revokedAt: row.revoked_at ? timestamp(row.revoked_at) : undefined,
    rotatedAt: row.rotated_at ? timestamp(row.rotated_at) : undefined,
    expiredAt: row.expired_at ? timestamp(row.expired_at) : undefined,
    endReasonCode: row.end_reason_code ?? undefined,
    schemaVersion: row.schema_version
  });
}

export class PostgresHumanSessionStore {
  constructor({
    eventRepository,
    tenantId: configuredTenantId,
    referenceHasher,
    origin,
    idleTimeoutMs = 30 * 60_000,
    absoluteTimeoutMs = 8 * 60 * 60_000,
    maximumSessions = 10_000
  }) {
    this.tenantId = tenantId(configuredTenantId);
    this.repository = assertRepository(eventRepository, this.tenantId);
    if (!referenceHasher?.hash) {
      throw authenticationError("invalid_authentication_configuration", "session reference protection is required");
    }
    this.referenceHasher = referenceHasher;
    this.origin = exactHttpsOrigin("session origin", origin);
    this.idleTimeoutMs = positiveDuration("idleTimeoutMs", idleTimeoutMs, 2 * 60 * 60_000);
    this.absoluteTimeoutMs = positiveDuration("absoluteTimeoutMs", absoluteTimeoutMs, 24 * 60 * 60_000);
    if (this.idleTimeoutMs > this.absoluteTimeoutMs) {
      throw authenticationError("invalid_authentication_configuration", "session inactivity exceeds absolute lifetime");
    }
    if (!Number.isSafeInteger(maximumSessions) || maximumSessions < 1 || maximumSessions > 100_000) {
      throw authenticationError("invalid_authentication_configuration", "session capacity is invalid");
    }
    this.maximumSessions = maximumSessions;
  }

  async create(input) {
    const now = input.now ?? new Date();
    assertTenant(this.tenantId, input.tenantId);
    const normalized = this.#normalizeSessionInput(input);
    const handle = randomOpaqueValue();
    const csrfToken = randomOpaqueValue();
    const sessionRefHash = this.referenceHasher.hash("session.handle", handle);
    const csrfRefHash = this.referenceHasher.hash("session.csrf", csrfToken);
    const absoluteExpiresAt = new Date(now.getTime() + this.absoluteTimeoutMs).toISOString();
    const idleExpiresAt = new Date(Math.min(
      now.getTime() + this.idleTimeoutMs,
      new Date(absoluteExpiresAt).getTime()
    )).toISOString();
    const row = await this.repository.withTenantWrite(async (client) => {
      await this.#assertCredentialBinding(client, normalized, now);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('authentication_session_capacity'), hashtext($1))",
        [this.tenantId]
      );
      const expired = await client.query(
        `WITH candidates AS (
           SELECT tenant_id, session_ref_hash
             FROM authentication_sessions
            WHERE tenant_id = $1
              AND status = 'active'
              AND (idle_expires_at <= $2 OR absolute_expires_at <= $2)
            ORDER BY idle_expires_at, absolute_expires_at, session_ref_hash
            LIMIT 256
            FOR UPDATE
         )
         UPDATE authentication_sessions AS sessions
            SET status = 'expired', expired_at = $2,
                end_reason_code = 'session_expired'
           FROM candidates
          WHERE sessions.tenant_id = candidates.tenant_id
            AND sessions.session_ref_hash = candidates.session_ref_hash
        RETURNING sessions.*`,
        [this.tenantId, now]
      );
      for (const expiredRow of expired.rows) {
        await this.#sessionEvent(
          client,
          AuthenticationEventType.SESSION_EXPIRED,
          sessionFromRow(expiredRow),
          "session_expired",
          now
        );
      }
      const count = await client.query(
        `SELECT count(*)::int AS count
           FROM authentication_sessions
          WHERE tenant_id = $1 AND status = 'active'
            AND idle_expires_at > $2 AND absolute_expires_at > $2`,
        [this.tenantId, now]
      );
      if (count.rows[0].count >= this.maximumSessions) {
        throw authenticationError("authentication_session_capacity_exceeded", "session capacity is exhausted");
      }
      const inserted = await client.query(
        `INSERT INTO authentication_sessions(
           tenant_id, session_ref_hash, csrf_ref_hash, actor_id, actor_type,
           client_id, authentication_method, credential_id, credential_version,
           sender_constraint_method, policy_version, roles, allowed_capabilities,
           token_jti_ref_hash, auth_time, acr, amr, created_at, last_seen_at,
           idle_expires_at, absolute_expires_at, status, rotation, revoked_at,
           rotated_at, expired_at, end_reason_code, schema_version,
           reference_hash_key_version
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9,
           'host_session', $10, $11::jsonb, $12::jsonb,
           $13, $14, $15, $16::jsonb, $17, $17,
           $18, $19, 'active', 0, NULL,
           NULL, NULL, NULL, 'authentication_session.v1', $20
         ) RETURNING *`,
        [
          this.tenantId,
          sessionRefHash,
          csrfRefHash,
          normalized.actorId,
          normalized.actorType,
          normalized.clientId,
          normalized.authenticationMethod,
          normalized.credentialId,
          normalized.credentialVersion,
          normalized.policyVersion,
          JSON.stringify(normalized.roles),
          JSON.stringify(normalized.capabilities),
          normalized.tokenJtiHash,
          normalized.authTime,
          normalized.acr,
          JSON.stringify(normalized.amr),
          now,
          idleExpiresAt,
          absoluteExpiresAt,
          this.referenceHasher.keyVersion
        ]
      );
      await appendEvent(client, {
        eventType: AuthenticationEventType.SESSION_CREATED,
        tenantId: this.tenantId,
        actorId: normalized.actorId,
        credentialId: normalized.credentialId,
        reasonCode: "human_login",
          occurredAt: now,
          payload: {
            sessionRefHash,
            rotation: 0,
            referenceHashKeyVersion: this.referenceHasher.keyVersion
          }
      });
      if (SELECTABLE_HUMAN_ROLES.has(normalized.roles[0])) {
        await appendEvent(client, {
          eventType: AuthenticationEventType.ROLE_SELECTED,
          tenantId: this.tenantId,
          actorId: normalized.actorId,
          credentialId: normalized.credentialId,
          reasonCode: "human_role_selected",
          occurredAt: now,
          payload: {
            roleBundle: normalized.roles[0],
            sessionRefHash,
            referenceHashKeyVersion: this.referenceHasher.keyVersion
          }
        });
      }
      return inserted.rows[0];
    });
    return this.#issued(sessionFromRow(row), handle, csrfToken);
  }

  async authenticate({ sessionHandle, requestMethod, requestOrigin, csrfToken, now = new Date() }) {
    const method = assertBoundedString("requestMethod", requestMethod, {
      maximum: 16,
      pattern: /^[A-Za-z]+$/
    }).toUpperCase();
    let suppliedCsrfRefHash;
    if (!SAFE_METHODS.has(method)) {
      if (requestOrigin !== this.origin) {
        throw authenticationError("csrf_origin_rejected", "request origin is not allowed");
      }
      suppliedCsrfRefHash = this.referenceHasher.hash(
        "session.csrf",
        assertBoundedString("csrfToken", csrfToken, { minimum: 32, maximum: 128 })
      );
    }
    const sessionRefHash = this.referenceHasher.hash(
      "session.handle",
      assertBoundedString("sessionHandle", sessionHandle, { minimum: 32, maximum: 128 })
    );
    const result = await this.repository.withTenantWrite(async (client) => {
      const selected = await client.query(
        `SELECT s.*,
                t.status AS bound_tenant_status,
                c.status AS bound_credential_status,
                c.version AS bound_credential_version,
                c.expires_at AS bound_credential_expires_at,
                c.roles AS bound_credential_roles,
                c.allowed_capabilities AS bound_credential_capabilities,
                a.status AS bound_actor_status,
                m.status AS bound_membership_status,
                m.policy_version AS bound_policy_version,
                m.client_ids AS bound_client_ids,
                m.role_bundle AS bound_role_bundle,
                m.capabilities AS bound_membership_capabilities,
                e.status AS bound_enrollment_status,
                e.role_bundle AS bound_enrollment_role,
                e.capabilities AS bound_enrollment_capabilities,
                e.client_ids AS bound_enrollment_client_ids,
                e.policy_version AS bound_enrollment_policy_version,
                e.valid_from AS bound_enrollment_valid_from,
                e.expires_at AS bound_enrollment_expires_at
           FROM authentication_sessions s
           LEFT JOIN tenants t ON t.id = s.tenant_id
           LEFT JOIN authentication_credentials c
             ON c.tenant_id = s.tenant_id AND c.id = s.credential_id
           LEFT JOIN actors a ON a.id = s.actor_id
           LEFT JOIN memberships m
             ON m.tenant_id = s.tenant_id AND m.actor_id = s.actor_id
           LEFT JOIN authentication_role_enrollments e
             ON e.tenant_id = s.tenant_id
            AND e.credential_id = s.credential_id
            AND e.actor_id = s.actor_id
            AND e.role_bundle = s.roles->>0
          WHERE s.tenant_id = $1 AND s.session_ref_hash = $2
          FOR UPDATE OF s`,
        [this.tenantId, sessionRefHash]
      );
      const row = selected.rows[0];
      if (!row || row.status !== "active") return { rejected: true };
      const effectiveNow = new Date(Math.max(
        now.getTime(),
        new Date(row.last_seen_at).getTime()
      ));
      const expired = new Date(row.absolute_expires_at) <= effectiveNow ||
        new Date(row.idle_expires_at) <= effectiveNow;
      if (expired) {
        const updated = await client.query(
          `UPDATE authentication_sessions
              SET status = 'expired', expired_at = $3, end_reason_code = 'session_expired'
            WHERE tenant_id = $1 AND session_ref_hash = $2
          RETURNING *`,
          [this.tenantId, sessionRefHash, effectiveNow]
        );
        const session = sessionFromRow(updated.rows[0]);
        await this.#sessionEvent(
          client,
          AuthenticationEventType.SESSION_EXPIRED,
          session,
          "session_expired",
          effectiveNow
        );
        return { rejected: true };
      }
      const clientIds = row.bound_client_ids
        ? jsonList(row.bound_client_ids, "membership client IDs", { maximumItems: 16 })
        : [];
      const credentialRoles = row.bound_credential_roles
        ? jsonList(row.bound_credential_roles, "credential roles", { maximumItems: 16 })
        : [];
      const credentialCapabilities = row.bound_credential_capabilities
        ? jsonList(row.bound_credential_capabilities, "credential capabilities")
        : [];
      const membershipCapabilities = row.bound_membership_capabilities
        ? jsonList(row.bound_membership_capabilities, "membership capabilities")
        : [];
      const enrollmentCapabilities = row.bound_enrollment_capabilities
        ? jsonList(row.bound_enrollment_capabilities, "role enrollment capabilities")
        : [];
      const enrollmentClientIds = row.bound_enrollment_client_ids
        ? jsonList(row.bound_enrollment_client_ids, "role enrollment client IDs", {
            maximumItems: 16
          })
        : [];
      const session = sessionFromRow(row);
      const selectedEnrollmentRequired = SELECTABLE_HUMAN_ROLES.has(session.roles[0]);
      const credentialExpired = row.bound_credential_expires_at &&
        new Date(row.bound_credential_expires_at) <= effectiveNow;
      if (
        row.bound_tenant_status !== "active" ||
        row.bound_credential_status !== CredentialStatus.ACTIVE ||
        safeVersion(row.bound_credential_version, "credential version") !== safeVersion(row.credential_version) ||
        credentialExpired ||
        row.bound_actor_status !== "active" ||
        row.bound_membership_status !== "active" ||
        row.bound_policy_version !== row.policy_version ||
        !clientIds.includes(row.client_id) ||
        !sameValues(credentialRoles, [row.bound_role_bundle]) ||
        credentialCapabilities.some((capability) => !membershipCapabilities.includes(capability)) ||
        session.roles.length !== 1 ||
        (selectedEnrollmentRequired
          ? row.bound_enrollment_status !== "active" ||
            row.bound_enrollment_role !== session.roles[0] ||
            row.bound_enrollment_policy_version !== session.policyVersion ||
            new Date(row.bound_enrollment_valid_from) > effectiveNow ||
            (row.bound_enrollment_expires_at &&
              new Date(row.bound_enrollment_expires_at) <= effectiveNow) ||
            !enrollmentClientIds.includes(session.clientId) ||
            !sameValues(session.capabilities, enrollmentCapabilities)
          : !sameValues(session.roles, credentialRoles) ||
            !sameValues(session.capabilities, credentialCapabilities))
      ) {
        const updated = await client.query(
          `UPDATE authentication_sessions
              SET status = 'revoked', revoked_at = $3,
                  end_reason_code = 'credential_no_longer_active'
            WHERE tenant_id = $1 AND session_ref_hash = $2
          RETURNING *`,
          [this.tenantId, sessionRefHash, effectiveNow]
        );
        const session = sessionFromRow(updated.rows[0]);
        await this.#sessionEvent(
          client,
          AuthenticationEventType.SESSION_REVOKED,
          session,
          "credential_no_longer_active",
          effectiveNow
        );
        return { rejected: true };
      }
      if (suppliedCsrfRefHash && !constantTimeEqual(suppliedCsrfRefHash, row.csrf_ref_hash)) {
        throw authenticationError("csrf_token_rejected", "CSRF token is invalid");
      }
      const nextIdleExpiresAt = new Date(Math.min(
        effectiveNow.getTime() + this.idleTimeoutMs,
        new Date(row.absolute_expires_at).getTime()
      ));
      const updated = await client.query(
        `UPDATE authentication_sessions
            SET last_seen_at = $3, idle_expires_at = $4
          WHERE tenant_id = $1 AND session_ref_hash = $2
        RETURNING *`,
        [this.tenantId, sessionRefHash, effectiveNow, nextIdleExpiresAt]
      );
      return { session: sessionFromRow(updated.rows[0]) };
    });
    if (!result.session) {
      throw authenticationError("authentication_session_rejected", "session is not active");
    }
    return this.#context(result.session, new Date(result.session.lastSeenAt));
  }

  async rotate({ sessionHandle, reasonCode = "session_rotation", now = new Date() }) {
    const currentRefHash = this.referenceHasher.hash(
      "session.handle",
      assertBoundedString("sessionHandle", sessionHandle, { minimum: 32, maximum: 128 })
    );
    const reason = assertBoundedString("reasonCode", reasonCode, {
      maximum: 96,
      pattern: /^[a-z][a-z0-9_]+$/
    });
    const handle = randomOpaqueValue();
    const csrfToken = randomOpaqueValue();
    const nextRefHash = this.referenceHasher.hash("session.handle", handle);
    const nextCsrfRefHash = this.referenceHasher.hash("session.csrf", csrfToken);
    const row = await this.repository.withTenantWrite(async (client) => {
      const selected = await client.query(
        `SELECT * FROM authentication_sessions
          WHERE tenant_id = $1 AND session_ref_hash = $2 AND status = 'active'
          FOR UPDATE`,
        [this.tenantId, currentRefHash]
      );
      const current = sessionFromRow(selected.rows[0]);
      if (!current || new Date(current.absoluteExpiresAt) <= now ||
          new Date(current.idleExpiresAt) <= now) {
        throw authenticationError("authentication_session_rejected", "session is not active");
      }
      await this.#assertCredentialBinding(client, current, now);
      const nextIdleExpiresAt = new Date(Math.min(
        now.getTime() + this.idleTimeoutMs,
        new Date(current.absoluteExpiresAt).getTime()
      ));
      await client.query(
        `UPDATE authentication_sessions
            SET status = 'rotated', rotated_at = $3, end_reason_code = $4
          WHERE tenant_id = $1 AND session_ref_hash = $2`,
        [this.tenantId, currentRefHash, now, reason]
      );
      const inserted = await client.query(
        `INSERT INTO authentication_sessions(
           tenant_id, session_ref_hash, csrf_ref_hash, actor_id, actor_type,
           client_id, authentication_method, credential_id, credential_version,
           sender_constraint_method, policy_version, roles, allowed_capabilities,
           token_jti_ref_hash, auth_time, acr, amr, created_at, last_seen_at,
           idle_expires_at, absolute_expires_at, status, rotation, revoked_at,
           rotated_at, expired_at, end_reason_code, schema_version,
           reference_hash_key_version
         ) SELECT
           tenant_id, $3, $4, actor_id, actor_type,
           client_id, authentication_method, credential_id, credential_version,
           sender_constraint_method, policy_version, roles, allowed_capabilities,
           token_jti_ref_hash, auth_time, acr, amr, created_at, $5,
           $6, absolute_expires_at, 'active', rotation + 1, NULL,
           NULL, NULL, NULL, schema_version, reference_hash_key_version
         FROM authentication_sessions
         WHERE tenant_id = $1 AND session_ref_hash = $2
         RETURNING *`,
        [this.tenantId, currentRefHash, nextRefHash, nextCsrfRefHash, now, nextIdleExpiresAt]
      );
      const next = sessionFromRow(inserted.rows[0]);
      await this.#sessionEvent(client, AuthenticationEventType.SESSION_ROTATED, next, reason, now);
      return inserted.rows[0];
    });
    return this.#issued(sessionFromRow(row), handle, csrfToken);
  }

  async revoke({ sessionHandle, reasonCode = "human_logout", now = new Date() }) {
    const sessionRefHash = this.referenceHasher.hash(
      "session.handle",
      assertBoundedString("sessionHandle", sessionHandle, { minimum: 32, maximum: 128 })
    );
    const reason = assertBoundedString("reasonCode", reasonCode, {
      maximum: 96,
      pattern: /^[a-z][a-z0-9_]+$/
    });
    return this.repository.withTenantWrite(async (client) => {
      const result = await client.query(
        `UPDATE authentication_sessions
            SET status = 'revoked', revoked_at = $3, end_reason_code = $4
          WHERE tenant_id = $1 AND session_ref_hash = $2 AND status = 'active'
        RETURNING *`,
        [this.tenantId, sessionRefHash, now, reason]
      );
      if (result.rowCount === 0) return false;
      await this.#sessionEvent(
        client,
        AuthenticationEventType.SESSION_REVOKED,
        sessionFromRow(result.rows[0]),
        reason,
        now
      );
      return true;
    });
  }

  async invalidate({
    sessionHandle,
    requestOrigin,
    csrfToken,
    idempotencyKey,
    reasonCode,
    now = new Date()
  }) {
    if (requestOrigin !== this.origin) {
      throw authenticationError("csrf_origin_rejected", "request origin is not allowed");
    }
    const reason = assertWalletSessionInvalidationReason(reasonCode);
    const idempotencyRefHash = this.referenceHasher.hash(
      "session.invalidation.idempotency",
      assertWalletSessionInvalidationIdempotencyKey(idempotencyKey)
    );
    const csrfRefHash = this.referenceHasher.hash(
      "session.csrf",
      assertBoundedString("csrfToken", csrfToken, { minimum: 32, maximum: 128 })
    );
    const suppliedSessionRefHash = sessionHandle === undefined
      ? undefined
      : this.referenceHasher.hash(
          "session.handle",
          assertBoundedString("sessionHandle", sessionHandle, { minimum: 32, maximum: 128 })
        );

    const result = await this.repository.withTenantWrite(async (client) => {
      const replayByIdempotency = async () => {
        const replay = await client.query(
          `SELECT i.reason_code, i.session_ref_hash, s.csrf_ref_hash, s.status
             FROM authentication_session_invalidations i
            JOIN authentication_sessions s
               ON s.tenant_id = i.tenant_id
              AND s.session_ref_hash = i.session_ref_hash
            WHERE i.tenant_id = $1 AND i.idempotency_ref_hash = $2
            FOR UPDATE OF s`,
          [this.tenantId, idempotencyRefHash]
        );
        const row = replay.rows[0];
        if (!row) return false;
        if (
          row.reason_code !== reason ||
          row.status !== "revoked" ||
          (suppliedSessionRefHash !== undefined &&
            suppliedSessionRefHash !== row.session_ref_hash) ||
          !constantTimeEqual(csrfRefHash, row.csrf_ref_hash)
        ) {
          throw authenticationError(
            "authentication_session_rejected",
            "session is not active"
          );
        }
        return true;
      };

      if (await replayByIdempotency()) return walletSessionInvalidationResult();
      if (suppliedSessionRefHash === undefined) {
        throw authenticationError("authentication_session_rejected", "session is not active");
      }

      const selected = await client.query(
        `SELECT *
           FROM authentication_sessions
          WHERE tenant_id = $1 AND session_ref_hash = $2
          FOR UPDATE`,
        [this.tenantId, suppliedSessionRefHash]
      );
      const current = selected.rows[0];
      if (!current || current.status !== "active") {
        if (await replayByIdempotency()) return walletSessionInvalidationResult();
        throw authenticationError("authentication_session_rejected", "session is not active");
      }
      if (
        new Date(current.absolute_expires_at) <= now ||
        new Date(current.idle_expires_at) <= now
      ) {
        throw authenticationError("authentication_session_rejected", "session is not active");
      }
      if (!constantTimeEqual(csrfRefHash, current.csrf_ref_hash)) {
        throw authenticationError("csrf_token_rejected", "CSRF token is invalid");
      }

      const revoked = await client.query(
        `UPDATE authentication_sessions
            SET status = 'revoked', revoked_at = $3, end_reason_code = $4
          WHERE tenant_id = $1 AND session_ref_hash = $2 AND status = 'active'
        RETURNING *`,
        [this.tenantId, suppliedSessionRefHash, now, reason]
      );
      if (revoked.rowCount !== 1) {
        throw authenticationError("authentication_session_rejected", "session is not active");
      }
      await client.query(
         `INSERT INTO authentication_session_invalidations(
           tenant_id, idempotency_ref_hash, session_ref_hash, reason_code,
           occurred_at, reference_hash_key_version, schema_version
         ) VALUES ($1, $2, $3, $4, $5, $6, 'wallet_session_invalidation.v1')`,
        [
          this.tenantId,
          idempotencyRefHash,
          suppliedSessionRefHash,
          reason,
          now,
          this.referenceHasher.keyVersion
        ]
      );
      const session = sessionFromRow(revoked.rows[0]);
      await this.#sessionEvent(
        client,
        AuthenticationEventType.SESSION_REVOKED,
        session,
        reason,
        now
      );
      return walletSessionInvalidationResult();
    });
    return result;
  }

  async revokeByCredential({ credentialId, reasonCode = "credential_revoked", now = new Date() }) {
    const checkedId = assertSafeIdentifier("credentialId", credentialId);
    const reason = assertBoundedString("reasonCode", reasonCode, {
      maximum: 96,
      pattern: /^[a-z][a-z0-9_]+$/
    });
    return this.repository.withTenantWrite(async (client) => {
      const result = await client.query(
        `UPDATE authentication_sessions
            SET status = 'revoked', revoked_at = $3, end_reason_code = $4
          WHERE tenant_id = $1 AND credential_id = $2 AND status = 'active'
        RETURNING *`,
        [this.tenantId, checkedId, now, reason]
      );
      for (const row of result.rows) {
        await this.#sessionEvent(
          client,
          AuthenticationEventType.SESSION_REVOKED,
          sessionFromRow(row),
          reason,
          now
        );
      }
      return result.rowCount;
    });
  }

  #normalizeSessionInput(input) {
    const authenticationMethod = input.authenticationMethod ?? ClientAuthenticationMethod.OIDC_PKCE_BFF;
    if (!HUMAN_AUTHENTICATION_METHODS.has(authenticationMethod)) {
      throw authenticationError("invalid_authentication_input", "Human authentication method is invalid");
    }
    if (!HUMAN_ACTOR_TYPES.has(input.actorType)) {
      throw authenticationError("invalid_authentication_input", "Human Actor type is invalid");
    }
    const credentialVersion = safeVersion(input.credentialVersion, "credentialVersion");
    const authTime = new Date(input.authTime);
    if (!Number.isFinite(authTime.getTime())) {
      throw authenticationError("invalid_authentication_input", "authentication time is invalid");
    }
    const roles = assertStringList("roles", input.roles ?? [], {
      maximumItems: 1,
      allowEmpty: false
    });
    return Object.freeze({
      tenantId: this.tenantId,
      actorId: assertSafeIdentifier("actorId", input.actorId),
      actorType: input.actorType,
      clientId: assertSafeIdentifier("clientId", input.clientId),
      authenticationMethod,
      credentialId: assertSafeIdentifier("credentialId", input.credentialId),
      credentialVersion,
      policyVersion: assertSafeIdentifier("policyVersion", input.policyVersion),
      capabilities: assertStringList("capabilities", input.capabilities ?? []),
      roles,
      tokenJtiHash: assertBoundedString("tokenJtiHash", input.tokenJtiHash, {
        minimum: 32,
        maximum: 128,
        pattern: /^[A-Za-z0-9_-]+$/
      }),
      authTime: authTime.toISOString(),
      acr: assertBoundedString("acr", input.acr, { maximum: 128 }),
      amr: assertStringList("amr", input.amr ?? [], {
        maximumItems: 8,
        allowEmpty: false,
        itemPattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
      })
    });
  }

  async #assertCredentialBinding(client, session, now) {
    const result = await client.query(
      `SELECT c.*, t.status AS bound_tenant_status, a.status AS bound_actor_status,
              m.status AS bound_membership_status,
              m.policy_version AS bound_policy_version,
              m.client_ids AS bound_client_ids,
              m.role_bundle AS bound_role_bundle,
              m.capabilities AS bound_membership_capabilities,
              e.status AS bound_enrollment_status,
              e.role_bundle AS bound_enrollment_role,
              e.capabilities AS bound_enrollment_capabilities,
              e.client_ids AS bound_enrollment_client_ids,
              e.policy_version AS bound_enrollment_policy_version,
              e.valid_from AS bound_enrollment_valid_from,
              e.expires_at AS bound_enrollment_expires_at
         FROM authentication_credentials c
         JOIN tenants t ON t.id = c.tenant_id
         JOIN actors a ON a.id = c.actor_id
         JOIN memberships m ON m.tenant_id = c.tenant_id AND m.actor_id = c.actor_id
         LEFT JOIN authentication_role_enrollments e
           ON e.tenant_id = c.tenant_id
          AND e.credential_id = c.id
          AND e.actor_id = c.actor_id
          AND e.role_bundle = $3
        WHERE c.tenant_id = $1 AND c.id = $2
        FOR SHARE OF c, a, m`,
      [this.tenantId, session.credentialId, session.roles[0]]
    );
    const row = result.rows[0];
    const clientIds = row
      ? jsonList(row.bound_client_ids, "membership client IDs", { maximumItems: 16 })
      : [];
    const credential = credentialFromRow(row);
    const membershipCapabilities = row
      ? jsonList(row.bound_membership_capabilities, "membership capabilities")
      : [];
    const enrollmentCapabilities = row?.bound_enrollment_capabilities
      ? jsonList(row.bound_enrollment_capabilities, "role enrollment capabilities")
      : [];
    const enrollmentClientIds = row?.bound_enrollment_client_ids
      ? jsonList(row.bound_enrollment_client_ids, "role enrollment client IDs", {
          maximumItems: 16
        })
      : [];
    const selectedEnrollmentRequired = SELECTABLE_HUMAN_ROLES.has(session.roles[0]);
    if (
      !row ||
      row.bound_tenant_status !== "active" ||
      row.status !== CredentialStatus.ACTIVE ||
      (row.expires_at && new Date(row.expires_at) <= now) ||
      safeVersion(row.version, "credential version") !== session.credentialVersion ||
      row.actor_id !== session.actorId ||
      row.actor_type !== session.actorType ||
      row.client_id !== session.clientId ||
      row.client_authentication_method !== session.authenticationMethod ||
      row.policy_version !== session.policyVersion ||
      row.bound_actor_status !== "active" ||
      row.bound_membership_status !== "active" ||
      row.bound_policy_version !== session.policyVersion ||
      !clientIds.includes(session.clientId) ||
      !sameValues(credential.roles, [row.bound_role_bundle]) ||
      credential.allowedCapabilities.some((capability) => !membershipCapabilities.includes(capability)) ||
      session.roles.length !== 1 ||
      (selectedEnrollmentRequired
        ? row.bound_enrollment_status !== "active" ||
          row.bound_enrollment_role !== session.roles[0] ||
          row.bound_enrollment_policy_version !== session.policyVersion ||
          new Date(row.bound_enrollment_valid_from) > now ||
          (row.bound_enrollment_expires_at && new Date(row.bound_enrollment_expires_at) <= now) ||
          !enrollmentClientIds.includes(session.clientId) ||
          !sameValues(session.capabilities, enrollmentCapabilities)
        : !sameValues(session.roles, credential.roles) ||
          !sameValues(session.capabilities, credential.allowedCapabilities))
    ) {
      throw authenticationError("authentication_session_rejected", "session credential is not active");
    }
  }

  #context(session, now) {
    return createAuthenticationContext({
      tenantId: session.tenantId,
      actorId: session.actorId,
      actorType: session.actorType,
      clientId: session.clientId,
      credentialId: session.credentialId,
      credentialVersion: session.credentialVersion,
      policyVersion: session.policyVersion,
      capabilities: session.capabilities,
      roles: session.roles,
      tokenJtiHash: session.tokenJtiHash,
      authenticationMethod: session.authenticationMethod,
      senderConstraintMethod: SenderConstraintMethod.HOST_SESSION,
      authenticatedAt: now,
      authTime: session.authTime,
      acr: session.acr,
      amr: session.amr
    });
  }

  #issued(session, handle, csrfToken) {
    return Object.freeze({
      cookie: cookie(handle, session.absoluteExpiresAt),
      csrfToken,
      session: this.#context(session, new Date(session.lastSeenAt)),
      idleTimeoutMs: this.idleTimeoutMs,
      absoluteExpiresAt: session.absoluteExpiresAt
    });
  }

  async #sessionEvent(client, eventType, session, reasonCode, now) {
    return appendEvent(client, {
      eventType,
      tenantId: session.tenantId,
      actorId: session.actorId,
      credentialId: session.credentialId,
      reasonCode,
      occurredAt: now,
      payload: {
        sessionRefHash: session.sessionRefHash,
        rotation: session.rotation,
        referenceHashKeyVersion: session.referenceHashKeyVersion
      }
    });
  }
}

export class PostgresReferenceHashRotationService {
  constructor({ eventRepository, tenantId: configuredTenantId, referenceHasher, systemActorId }) {
    this.tenantId = tenantId(configuredTenantId);
    this.repository = assertRepository(eventRepository, this.tenantId);
    if (
      !referenceHasher ||
      typeof referenceHasher.hash !== "function" ||
      !new Set(["single_v1", "overlap_v2_write_v1_lookup", "single_v2"]).has(referenceHasher.mode)
    ) {
      throw authenticationError(
        "invalid_authentication_configuration",
        "reference-hash rotation requires an explicit keyring mode"
      );
    }
    this.referenceHasher = referenceHasher;
    this.systemActorId = assertSafeIdentifier("systemActorId", systemActorId);
  }

  async inventory({ now = new Date() } = {}) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw authenticationError("invalid_authentication_input", "inventory time is invalid");
    }
    const result = await this.repository.withTenantRead((client) => client.query(
      `SELECT
         (SELECT count(*)::int FROM authentication_credentials
           WHERE tenant_id = $1 AND reference_hash_key_version = 'v1'
             AND status = 'active' AND (expires_at IS NULL OR expires_at > $2)) AS active_v1_credentials,
         (SELECT count(*)::int FROM authentication_role_enrollments e
           JOIN authentication_credentials c
             ON c.tenant_id = e.tenant_id AND c.id = e.credential_id
          WHERE e.tenant_id = $1 AND c.reference_hash_key_version = 'v1'
            AND e.status = 'active' AND e.valid_from <= $2
            AND (e.expires_at IS NULL OR e.expires_at > $2)) AS active_v1_role_enrollments,
         (SELECT count(*)::int FROM authentication_sessions
           WHERE tenant_id = $1 AND reference_hash_key_version = 'v1'
             AND status = 'active' AND absolute_expires_at > $2) AS active_v1_sessions,
         (SELECT count(*)::int FROM authentication_oidc_transactions
           WHERE tenant_id = $1 AND reference_hash_key_version = 'v1'
             AND expires_at > $2) AS pending_v1_oidc_transactions,
         (SELECT count(*)::int FROM authentication_wallet_transactions
           WHERE tenant_id = $1 AND reference_hash_key_version = 'v1'
             AND expires_at > $2) AS pending_v1_wallet_transactions,
         (SELECT count(*)::int FROM authentication_replay_entries
           WHERE tenant_id = $1 AND reference_hash_key_version = 'v1'
             AND expires_at > $2) AS live_v1_replay_entries,
         (SELECT count(*)::int FROM authentication_credentials
           WHERE tenant_id = $1 AND reference_hash_key_version = 'v2'
             AND status = 'active' AND (expires_at IS NULL OR expires_at > $2)) AS active_v2_credentials,
         (SELECT count(*)::int FROM authentication_sessions
           WHERE tenant_id = $1 AND reference_hash_key_version = 'v2'
             AND status = 'active' AND absolute_expires_at > $2) AS active_v2_sessions`,
      [this.tenantId, now]
    ));
    const row = result.rows[0];
    return Object.freeze({
      schemaVersion: "authentication_reference_hash_inventory.v1",
      tenantId: this.tenantId,
      observedAt: now.toISOString(),
      activeV1Credentials: row.active_v1_credentials,
      activeV1RoleEnrollments: row.active_v1_role_enrollments,
      activeV1Sessions: row.active_v1_sessions,
      pendingV1OidcTransactions: row.pending_v1_oidc_transactions,
      pendingV1WalletTransactions: row.pending_v1_wallet_transactions,
      liveV1ReplayEntries: row.live_v1_replay_entries,
      activeV2Credentials: row.active_v2_credentials,
      activeV2Sessions: row.active_v2_sessions,
      secretMaterialIncluded: false
    });
  }

  async retireLegacySessionsAndChallenges({ now = new Date() } = {}) {
    if (this.referenceHasher.mode !== "overlap_v2_write_v1_lookup") {
      throw authenticationError(
        "authentication_reference_rotation_rejected",
        "legacy runtime artifacts may be retired only in overlap mode"
      );
    }
    const retired = await this.repository.withTenantWrite(async (client) => {
      const sessions = await client.query(
        `UPDATE authentication_sessions
            SET status = 'revoked', revoked_at = $2,
                end_reason_code = 'reference_hash_key_rotation'
          WHERE tenant_id = $1 AND reference_hash_key_version = 'v1'
            AND status = 'active'
        RETURNING *`,
        [this.tenantId, now]
      );
      for (const row of sessions.rows) {
        const session = sessionFromRow(row);
        await appendEvent(client, {
          eventType: AuthenticationEventType.SESSION_REVOKED,
          tenantId: this.tenantId,
          actorId: this.systemActorId,
          credentialId: session.credentialId,
          reasonCode: "reference_hash_key_rotation",
          occurredAt: now,
          payload: {
            sessionRefHash: session.sessionRefHash,
            rotation: session.rotation,
            referenceHashKeyVersion: session.referenceHashKeyVersion
          }
        });
      }
      const oidc = await client.query(
        `DELETE FROM authentication_oidc_transactions
          WHERE tenant_id = $1 AND reference_hash_key_version = 'v1'`,
        [this.tenantId]
      );
      const wallet = await client.query(
        `DELETE FROM authentication_wallet_transactions
          WHERE tenant_id = $1 AND reference_hash_key_version = 'v1'`,
        [this.tenantId]
      );
      return Object.freeze({
        revokedSessions: sessions.rowCount,
        deletedOidcTransactions: oidc.rowCount,
        deletedWalletTransactions: wallet.rowCount
      });
    });
    return Object.freeze({
      schemaVersion: "authentication_reference_hash_retirement.v1",
      tenantId: this.tenantId,
      retiredAt: now.toISOString(),
      ...retired,
      secretMaterialIncluded: false
    });
  }

  async assertCutoverReady({ now = new Date() } = {}) {
    const inventory = await this.inventory({ now });
    const blockers = Object.freeze({
      activeV1Credentials: inventory.activeV1Credentials,
      activeV1RoleEnrollments: inventory.activeV1RoleEnrollments,
      activeV1Sessions: inventory.activeV1Sessions,
      pendingV1OidcTransactions: inventory.pendingV1OidcTransactions,
      pendingV1WalletTransactions: inventory.pendingV1WalletTransactions,
      liveV1ReplayEntries: inventory.liveV1ReplayEntries
    });
    if (Object.values(blockers).some((count) => count !== 0)) {
      throw authenticationError(
        "authentication_reference_cutover_blocked",
        `active legacy reference-hash dependencies block cutover (${Object.values(blockers).reduce((sum, count) => sum + count, 0)})`
      );
    }
    return inventory;
  }

  async recordCutover({ credentialId, now = new Date() }) {
    if (this.referenceHasher.mode !== "single_v2" || this.referenceHasher.keyVersion !== "v2") {
      throw authenticationError(
        "authentication_reference_rotation_rejected",
        "reference-hash cutover Evidence requires single-v2 mode"
      );
    }
    const checkedCredentialId = assertSafeIdentifier("credentialId", credentialId);
    await this.assertCutoverReady({ now });
    return this.repository.withTenantWrite(async (client) => {
      const credential = await client.query(
        `SELECT id FROM authentication_credentials
          WHERE tenant_id = $1 AND id = $2 AND reference_hash_key_version = 'v2'
            AND status = 'active' AND (expires_at IS NULL OR expires_at > $3)
          FOR SHARE`,
        [this.tenantId, checkedCredentialId, now]
      );
      if (credential.rowCount !== 1) {
        throw authenticationError(
          "authentication_reference_cutover_blocked",
          "cutover Evidence credential is not an active v2 credential"
        );
      }
      return appendEvent(client, {
        eventType: AuthenticationEventType.REFERENCE_HASH_CUTOVER,
        tenantId: this.tenantId,
        actorId: this.systemActorId,
        credentialId: checkedCredentialId,
        reasonCode: "reference_hash_v2_cutover",
        occurredAt: now,
        payload: {
          fromKeyVersion: "v1",
          toKeyVersion: "v2",
          mode: "single_v2"
        }
      });
    });
  }
}

export class PostgresAuthenticationEventStore {
  constructor({ eventRepository, tenantId: configuredTenantId }) {
    this.tenantId = tenantId(configuredTenantId);
    this.repository = assertRepository(eventRepository, this.tenantId);
  }

  async list(filter = {}) {
    assertExactObjectKeys("authentication event filter", filter, {
      optional: ["eventType", "actorId", "credentialId"]
    });
    const clauses = ["tenant_id = $1"];
    const values = [this.tenantId];
    for (const [field, column] of [
      ["eventType", "event_type"],
      ["actorId", "actor_id"],
      ["credentialId", "credential_id"]
    ]) {
      if (filter[field] === undefined) continue;
      values.push(assertSafeIdentifier(field, filter[field]));
      clauses.push(`${column} = $${values.length}`);
    }
    const rows = await this.repository.withTenantRead((client) => client.query(
      `SELECT * FROM authentication_events
        WHERE ${clauses.join(" AND ")}
        ORDER BY occurred_at, id
        LIMIT 1001`,
      values
    ));
    if (rows.rowCount > 1_000) {
      throw authenticationError("authentication_event_capacity_exceeded", "authentication event result is too large");
    }
    return rows.rows.map((row) => Object.freeze({
      eventId: row.id,
      eventType: row.event_type,
      tenantId: row.tenant_id,
      actorId: row.actor_id,
      credentialId: row.credential_id,
      reasonCode: row.reason_code,
      occurredAt: timestamp(row.occurred_at),
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      schemaVersion: row.schema_version
    }));
  }
}

export { APPROVED_CHAIN_IDS as POSTGRES_APPROVED_CHAIN_IDS, SESSION_COOKIE_NAME as POSTGRES_SESSION_COOKIE_NAME };
