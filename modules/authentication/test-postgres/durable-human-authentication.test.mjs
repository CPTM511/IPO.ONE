import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import { createPostgresHumanAccessComposition } from "../../../apps/tenant-api/src/index.js";
import { migrateUp } from "../../../scripts/migrate.mjs";
import {
  ActorType,
  CSRF_BOOTSTRAP_COOKIE_NAME,
  ClientAuthenticationMethod,
  PostgresAuthenticationEventStore,
  PostgresCredentialRegistry,
  PostgresHumanSessionStore,
  PostgresLoginTransactionStore,
  PostgresWalletLoginTransactionStore,
  SenderConstraintMethod,
  assertPostgresAuthenticationRole,
  createAuthenticationSecretBox,
  createReferenceHasher,
  loadAuthenticationRuntimeConfig,
  sha256Base64Url
} from "../src/index.js";
import {
  PostgresEventRepository,
  assertTenantDatabaseRole,
  createPostgresPool,
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../persistence/src/index.js";

const CONNECTION_STRING = process.env.DATABASE_URL;
const RUN_ID = randomBytes(6).toString("hex");
const TENANT_ID = `tenant_auth_${RUN_ID}`;
const OTHER_TENANT_ID = `tenant_auth_other_${RUN_ID}`;
const HUMAN_ACTOR_ID = `actor_auth_human_${RUN_ID}`;
const SYSTEM_ACTOR_ID = `actor_auth_system_${RUN_ID}`;
const OTHER_SYSTEM_ACTOR_ID = `actor_auth_other_${RUN_ID}`;
const OIDC_CLIENT_ID = `client_auth_oidc_${RUN_ID}`;
const WALLET_CLIENT_ID = `client_auth_wallet_${RUN_ID}`;
const APP_ROLE = `ipo_auth_${RUN_ID}`;
const NOW = new Date("2026-07-17T12:00:00.000Z");
const ORIGIN = "https://ipo.one";
const ISSUER = "https://accounts.example.com";
const REDIRECT_URI = "https://ipo.one/auth/v1/callback?provider=google";

async function withTenantTransaction(pool, context, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantTransactionContext(client, context);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function seedTenant(pool, id) {
  await pool.query(
    `INSERT INTO tenants(
       id, tenant_hash, organization_ref, display_name, status,
       pilot_jurisdiction, legal_retention_owner_ref, created_at,
       updated_at, schema_version
     ) VALUES ($1, $2, $3, $4, 'active', 'TEST', $5, $6, $6, 'tenant.v1')`,
    [
      id,
      hashId("auth_test_tenant", id),
      `urn:ipo.one:test:${id}`,
      `Authentication Test ${id}`,
      `urn:ipo.one:test:retention:${id}`,
      NOW
    ]
  );
}

async function seedIdentity(pool, {
  tenantId,
  actorId,
  actorType,
  roleBundle,
  capabilities,
  clientIds
}) {
  await pool.query(
    `INSERT INTO actors(
       id, actor_hash, actor_type, status, created_at, updated_at, schema_version
     ) VALUES ($1, $2, $3, 'active', $4, $4, 'actor.v1')`,
    [actorId, hashId("auth_test_actor", actorId), actorType, NOW]
  );
  const context = createTenantSecurityContext({
    tenantId,
    actorId,
    policyVersion: "security_001.v1",
    source: "local_test"
  });
  await withTenantTransaction(pool, context, (client) => client.query(
    `INSERT INTO memberships(
       id, membership_hash, tenant_id, actor_id, role_bundle, capabilities,
       client_ids, policy_version, controller_actor_id, status, valid_from,
       expires_at, created_at, updated_at, version, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6::jsonb,
       $7::jsonb, 'security_001.v1', NULL, 'active', $8,
       NULL, $8, $8, 1, 'membership.v1'
     )`,
    [
      `membership_${actorId}`,
      hashId("auth_test_membership", `${tenantId}:${actorId}`),
      tenantId,
      actorId,
      roleBundle,
      JSON.stringify(capabilities),
      JSON.stringify(clientIds),
      NOW
    ]
  ));
}

async function createApplicationPool(ownerPool) {
  const password = randomBytes(24).toString("base64url");
  const quotedPassword = (await ownerPool.query("SELECT quote_literal($1) AS value", [password])).rows[0].value;
  await ownerPool.query(
    `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD ${quotedPassword}
     NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
  );
  await ownerPool.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
  await ownerPool.query(
    `GRANT SELECT ON
       tenants, actors, memberships,
       authentication_credentials,
       authentication_oidc_transactions,
       authentication_wallet_transactions,
       authentication_sessions,
       authentication_events
     TO ${APP_ROLE}`
  );
  await ownerPool.query(`GRANT INSERT, UPDATE ON authentication_credentials TO ${APP_ROLE}`);
  await ownerPool.query(
    `GRANT INSERT, DELETE ON
       authentication_oidc_transactions,
       authentication_wallet_transactions
     TO ${APP_ROLE}`
  );
  await ownerPool.query(`GRANT INSERT, UPDATE ON authentication_sessions TO ${APP_ROLE}`);
  await ownerPool.query(`GRANT INSERT ON authentication_events TO ${APP_ROLE}`);
  await ownerPool.query(`GRANT UPDATE (id) ON actors, memberships TO ${APP_ROLE}`);
  const connection = new URL(CONNECTION_STRING);
  connection.username = APP_ROLE;
  connection.password = password;
  return createPostgresPool({
    connectionString: connection.toString(),
    max: 8,
    applicationName: "ipo-one-durable-human-authentication-test"
  });
}

function sessionInput(credential, now = NOW) {
  return {
    tenantId: TENANT_ID,
    actorId: credential.actorId,
    actorType: credential.actorType,
    clientId: credential.clientId,
    authenticationMethod: credential.clientAuthenticationMethod,
    credentialId: credential.credentialId,
    credentialVersion: credential.version,
    policyVersion: credential.policyVersion,
    capabilities: credential.allowedCapabilities,
    roles: credential.roles,
    tokenJtiHash: "j".repeat(43),
    authTime: now,
    acr: "urn:ipo.one:acr:phishing-resistant",
    amr: ["WebAuthn"],
    now
  };
}

async function insertRawSession(repository, {
  credential,
  sessionRefHash,
  csrfRefHash,
  authTime = NOW,
  createdAt = NOW,
  lastSeenAt = createdAt,
  idleExpiresAt = new Date(createdAt.getTime() + 60 * 60_000),
  absoluteExpiresAt = new Date(createdAt.getTime() + 2 * 60 * 60_000),
  amr = ["WebAuthn"],
  rotation = 0
}) {
  return repository.withTenantWrite((client) => client.query(
    `INSERT INTO authentication_sessions(
       tenant_id, session_ref_hash, csrf_ref_hash, actor_id, actor_type,
       client_id, authentication_method, credential_id, credential_version,
       sender_constraint_method, policy_version, roles, allowed_capabilities,
       token_jti_ref_hash, auth_time, acr, amr, created_at, last_seen_at,
       idle_expires_at, absolute_expires_at, status, rotation, revoked_at,
       rotated_at, expired_at, end_reason_code, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9,
       'host_session', $10, $11::jsonb, $12::jsonb,
       $13, $14, $15, $16::jsonb, $17, $18,
       $19, $20, 'active', $21, NULL,
       NULL, NULL, NULL, 'authentication_session.v1'
     )`,
    [
      TENANT_ID,
      sessionRefHash,
      csrfRefHash,
      credential.actorId,
      credential.actorType,
      credential.clientId,
      credential.clientAuthenticationMethod,
      credential.credentialId,
      credential.version,
      credential.policyVersion,
      JSON.stringify(credential.roles),
      JSON.stringify(credential.allowedCapabilities),
      "j".repeat(43),
      authTime,
      "urn:ipo.one:acr:phishing-resistant",
      JSON.stringify(amr),
      createdAt,
      lastSeenAt,
      idleExpiresAt,
      absoluteExpiresAt,
      rotation
    ]
  ));
}

test("durable Human authentication is restart-safe, one-use, hash-only, and Tenant-isolated", {
  timeout: 90_000
}, async (t) => {
  assert.ok(CONNECTION_STRING, "DATABASE_URL must be provided by scripts/run-postgres-tests.mjs");
  const ownerPool = createPostgresPool({
    connectionString: CONNECTION_STRING,
    max: 4,
    applicationName: "ipo-one-durable-human-authentication-owner"
  });
  let appPool;
  try {
    await migrateUp({ pool: ownerPool });
    await seedTenant(ownerPool, TENANT_ID);
    await seedTenant(ownerPool, OTHER_TENANT_ID);
    await seedIdentity(ownerPool, {
      tenantId: TENANT_ID,
      actorId: HUMAN_ACTOR_ID,
      actorType: ActorType.HUMAN,
      roleBundle: "human_borrower",
      capabilities: ["subject.read", "integration.manage"],
      clientIds: [OIDC_CLIENT_ID, WALLET_CLIENT_ID]
    });
    await seedIdentity(ownerPool, {
      tenantId: TENANT_ID,
      actorId: SYSTEM_ACTOR_ID,
      actorType: ActorType.SYSTEM_WORKER,
      roleBundle: "system_worker",
      capabilities: ["subject.read"],
      clientIds: [`client_auth_system_${RUN_ID}`]
    });
    await seedIdentity(ownerPool, {
      tenantId: OTHER_TENANT_ID,
      actorId: OTHER_SYSTEM_ACTOR_ID,
      actorType: ActorType.SYSTEM_WORKER,
      roleBundle: "system_worker",
      capabilities: ["subject.read"],
      clientIds: [`client_auth_other_${RUN_ID}`]
    });
    appPool = await createApplicationPool(ownerPool);
    await assertTenantDatabaseRole(appPool);
    assert.equal((await assertPostgresAuthenticationRole(appPool)).boundary, "authentication_only");
    await ownerPool.query("ALTER TABLE authentication_sessions DISABLE ROW LEVEL SECURITY");
    try {
      await assert.rejects(
        () => assertPostgresAuthenticationRole(appPool),
        (error) => error.code === "unsafe_postgres_authentication_role"
      );
    } finally {
      await ownerPool.query("ALTER TABLE authentication_sessions ENABLE ROW LEVEL SECURITY");
    }
    await ownerPool.query(
      "CREATE POLICY authentication_test_bypass ON authentication_sessions FOR SELECT USING (true)"
    );
    try {
      await assert.rejects(
        () => assertPostgresAuthenticationRole(appPool),
        (error) => error.code === "unsafe_postgres_authentication_role"
      );
    } finally {
      await ownerPool.query("DROP POLICY authentication_test_bypass ON authentication_sessions");
    }
    await ownerPool.query(`GRANT TRUNCATE ON authentication_sessions TO ${APP_ROLE}`);
    await assert.rejects(
      () => assertPostgresAuthenticationRole(appPool),
      (error) => error.code === "unsafe_postgres_authentication_role"
    );
    await ownerPool.query(`REVOKE TRUNCATE ON authentication_sessions FROM ${APP_ROLE}`);
    await ownerPool.query(`GRANT UPDATE (status) ON tenants TO ${APP_ROLE}`);
    await assert.rejects(
      () => assertPostgresAuthenticationRole(appPool),
      (error) => error.code === "unsafe_postgres_authentication_role"
    );
    await ownerPool.query(`REVOKE UPDATE (status) ON tenants FROM ${APP_ROLE}`);
    assert.equal((await assertPostgresAuthenticationRole(appPool)).boundary, "authentication_only");
    await assert.rejects(
      () => appPool.query("SELECT count(*) FROM obligations"),
      (error) => error.code === "42501"
    );

    const context = createTenantSecurityContext({
      tenantId: TENANT_ID,
      actorId: SYSTEM_ACTOR_ID,
      policyVersion: "security_001.v1",
      source: "local_test"
    });
    const otherContext = createTenantSecurityContext({
      tenantId: OTHER_TENANT_ID,
      actorId: OTHER_SYSTEM_ACTOR_ID,
      policyVersion: "security_001.v1",
      source: "local_test"
    });
    const repository = new PostgresEventRepository({ pool: appPool, tenantContext: context });
    const otherRepository = new PostgresEventRepository({ pool: appPool, tenantContext: otherContext });
    const referenceKey = randomBytes(32);
    const encryptionKey = randomBytes(32);
    const referenceHasher = createReferenceHasher(referenceKey);
    const secretBox = createAuthenticationSecretBox(encryptionKey);
    const runtimeConfig = loadAuthenticationRuntimeConfig({
      IPO_ONE_AUTHENTICATION_MODE: "closed_pilot",
      IPO_ONE_IDP_DEPLOYMENT_APPROVAL: "APPROVED",
      IPO_ONE_IDP_VENDOR_ID: "synthetic_test_idp",
      IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA: "a".repeat(40),
      IPO_ONE_IDP_CONFIGURATION_REF: "projects/ipo-one-pilot/secrets/google-oidc-config/versions/1",
      IPO_ONE_OIDC_CLIENT_CREDENTIAL_REF: "projects/ipo-one-pilot/secrets/google-oidc-client/versions/2",
      IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF: "projects/ipo-one-pilot/secrets/auth-reference-key/versions/3",
      IPO_ONE_AUTH_ENCRYPTION_KEY_REF: "projects/ipo-one-pilot/secrets/auth-encryption-key/versions/4"
    });
    const composition = await createPostgresHumanAccessComposition({
      pool: appPool,
      runtimeConfig,
      tenantId: TENANT_ID,
      systemActorId: SYSTEM_ACTOR_ID,
      policyVersion: "security_001.v1",
      browserOrigin: ORIGIN,
      clock: () => new Date(NOW.getTime() + 13_500),
      referenceHashKey: referenceKey,
      referenceHashKeyRef: "projects/ipo-one-pilot/secrets/auth-reference-key/versions/3",
      encryptionKey,
      encryptionKeyRef: "projects/ipo-one-pilot/secrets/auth-encryption-key/versions/4",
      oidcProviders: [{
        providerId: "google",
        issuer: ISSUER,
        authorizationEndpoint: `${ISSUER}/authorize`,
        clientId: OIDC_CLIENT_ID,
        redirectUri: REDIRECT_URI,
        idTokenProfile: "standard_oidc",
        allowedAlgorithms: ["ES256"],
        configurationRef: "projects/ipo-one-pilot/secrets/google-oidc-config/versions/1",
        clientCredentialRef: "projects/ipo-one-pilot/secrets/google-oidc-client/versions/2",
        resolver: {
          issuer: ISSUER,
          allowedAlgorithms: ["ES256"],
          keyResolver: async () => undefined
        },
        providerAdapter: {
          exchangeAuthorizationCode: async () => ({ idToken: "not-used-in-composition-test" })
        }
      }],
      wallet: {
        issuer: ORIGIN,
        clientId: WALLET_CLIENT_ID,
        domain: "ipo.one",
        uri: "https://ipo.one/auth/wallet",
        signatureVerifier: { verify: async () => false }
      }
    });
    assert.equal(composition.deploymentBoundary.databaseBoundary, "authentication_only");
    assert.equal(composition.deploymentBoundary.credentialProvisioning, "pre_provisioned_only");
    assert.equal(composition.deploymentBoundary.realFundsEnabled, false);
    assert.equal(typeof composition.serveAuthentication, "function");
    const registry = new PostgresCredentialRegistry({
      eventRepository: repository,
      tenantId: TENANT_ID,
      referenceHasher,
      systemActorId: SYSTEM_ACTOR_ID
    });
    const oidcCredential = await registry.register({
      tenantId: TENANT_ID,
      actorId: HUMAN_ACTOR_ID,
      actorType: ActorType.HUMAN,
      issuer: ISSUER,
      externalSubject: `provider-subject-${RUN_ID}`,
      clientId: OIDC_CLIENT_ID,
      clientAuthenticationMethod: ClientAuthenticationMethod.OIDC_PKCE_BFF,
      senderConstraint: {
        method: SenderConstraintMethod.HOST_SESSION,
        thumbprint: "o".repeat(43)
      },
      roles: ["human_borrower"],
      allowedCapabilities: ["subject.read", "integration.manage"],
      policyVersion: "security_001.v1",
      performedByActorId: SYSTEM_ACTOR_ID,
      reasonCode: "oidc_credential_provisioned",
      now: NOW
    });
    const walletCredential = await registry.register({
      tenantId: TENANT_ID,
      actorId: HUMAN_ACTOR_ID,
      actorType: ActorType.HUMAN,
      issuer: ORIGIN,
      externalSubject: "eip155:84532:0x1111111111111111111111111111111111111111",
      clientId: WALLET_CLIENT_ID,
      clientAuthenticationMethod: ClientAuthenticationMethod.SIWE,
      senderConstraint: {
        method: SenderConstraintMethod.HOST_SESSION,
        thumbprint: "w".repeat(43)
      },
      roles: ["human_borrower"],
      allowedCapabilities: ["subject.read", "integration.manage"],
      policyVersion: "security_001.v1",
      performedByActorId: SYSTEM_ACTOR_ID,
      reasonCode: "wallet_credential_provisioned",
      now: NOW
    });

    await t.test("database validation rejects typed-list and session-lifetime corruption", async () => {
      const validation = await repository.withTenantRead((client) => client.query(
        `SELECT
           authentication_string_list_is_valid('["subject.read"]'::jsonb, 64) AS string_list_valid,
           authentication_string_list_is_valid('[true]'::jsonb, 64) AS boolean_list_valid,
           authentication_amr_list_is_valid('["WebAuthn"]'::jsonb) AS amr_valid,
           authentication_amr_list_is_valid('[]'::jsonb) AS empty_amr_valid,
           authentication_amr_list_is_valid('[true]'::jsonb) AS boolean_amr_valid`
      ));
      assert.deepEqual(validation.rows[0], {
        string_list_valid: true,
        boolean_list_valid: false,
        amr_valid: true,
        empty_amr_valid: false,
        boolean_amr_valid: false
      });

      let sequence = 0;
      const invalidSession = (overrides) => {
        sequence += 1;
        return insertRawSession(repository, {
          credential: walletCredential,
          sessionRefHash: referenceHasher.hash("session.handle", `invalid-session-${RUN_ID}-${sequence}`),
          csrfRefHash: referenceHasher.hash("session.csrf", `invalid-csrf-${RUN_ID}-${sequence}`),
          ...overrides
        });
      };
      await assert.rejects(
        () => invalidSession({ authTime: new Date(NOW.getTime() + 61_000) }),
        (error) => error.code === "23514" && error.constraint === "authentication_sessions_time_check"
      );
      await assert.rejects(
        () => invalidSession({
          idleExpiresAt: new Date(NOW.getTime() + 2 * 60 * 60_000 + 1),
          absoluteExpiresAt: new Date(NOW.getTime() + 3 * 60 * 60_000)
        }),
        (error) => error.code === "23514" && error.constraint === "authentication_sessions_time_check"
      );
      await assert.rejects(
        () => invalidSession({
          absoluteExpiresAt: new Date(NOW.getTime() + 24 * 60 * 60_000 + 1)
        }),
        (error) => error.code === "23514" && error.constraint === "authentication_sessions_time_check"
      );

      await assert.rejects(
        () => insertRawSession(repository, {
          credential: walletCredential,
          sessionRefHash: referenceHasher.hash("session.handle", randomBytes(32).toString("base64url")),
          csrfRefHash: referenceHasher.hash("session.csrf", randomBytes(32).toString("base64url")),
          rotation: "9007199254740992"
        }),
        (error) => error.code === "23514" && error.constraint === "authentication_sessions_rotation_check"
      );
    });

    await t.test("OIDC and SIWE transactions are encrypted, atomic, and one-use", async () => {
      const oidcStore = new PostgresLoginTransactionStore({
        eventRepository: repository,
        tenantId: TENANT_ID,
        referenceHasher,
        secretBox
      });
      const first = await oidcStore.create({
        redirectUri: REDIRECT_URI,
        providerId: "google",
        now: NOW
      });
      const rawOidc = await repository.withTenantRead((client) => client.query(
        "SELECT * FROM authentication_oidc_transactions WHERE tenant_id = $1",
        [TENANT_ID]
      ));
      const serializedOidc = JSON.stringify(rawOidc.rows);
      assert.equal(serializedOidc.includes(first.handle), false);
      assert.equal(serializedOidc.includes(first.state), false);
      assert.equal(serializedOidc.includes(first.nonce), false);
      await assert.rejects(
        () => oidcStore.consume({
          handle: first.handle,
          state: first.state,
          redirectUri: REDIRECT_URI,
          providerId: "email",
          now: NOW
        }),
        (error) => error.code === "oidc_transaction_rejected"
      );
      const recoveredProviderAttempt = await oidcStore.consume({
          handle: first.handle,
          state: first.state,
          redirectUri: REDIRECT_URI,
          providerId: "google",
          now: NOW
        });
      assert.equal(recoveredProviderAttempt.providerId, "google");
      await assert.rejects(
        () => oidcStore.consume({
          handle: first.handle,
          state: first.state,
          redirectUri: REDIRECT_URI,
          providerId: "google",
          now: NOW
        }),
        (error) => error.code === "oidc_transaction_rejected"
      );

      const malformedAttempt = await oidcStore.create({
        redirectUri: REDIRECT_URI,
        providerId: "google",
        now: NOW
      });
      await assert.rejects(
        () => oidcStore.consume({
          handle: malformedAttempt.handle,
          state: "invalid",
          redirectUri: REDIRECT_URI,
          providerId: "google",
          now: NOW
        }),
        (error) => error.code === "oidc_transaction_rejected"
      );
      const recoveredMalformedAttempt = await oidcStore.consume({
          handle: malformedAttempt.handle,
          state: malformedAttempt.state,
          redirectUri: REDIRECT_URI,
          providerId: "google",
          now: NOW
        });
      assert.equal(recoveredMalformedAttempt.providerId, "google");
      await assert.rejects(
        () => oidcStore.consume({
          handle: malformedAttempt.handle,
          state: malformedAttempt.state,
          redirectUri: REDIRECT_URI,
          providerId: "google",
          now: NOW
        }),
        (error) => error.code === "oidc_transaction_rejected"
      );

      const concurrent = await oidcStore.create({
        redirectUri: REDIRECT_URI,
        providerId: "google",
        now: NOW
      });
      const attempts = await Promise.allSettled([
        oidcStore.consume({
          handle: concurrent.handle,
          state: concurrent.state,
          redirectUri: REDIRECT_URI,
          providerId: "google",
          now: NOW
        }),
        oidcStore.consume({
          handle: concurrent.handle,
          state: concurrent.state,
          redirectUri: REDIRECT_URI,
          providerId: "google",
          now: NOW
        })
      ]);
      assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
      const consumed = attempts.find(({ status }) => status === "fulfilled").value;
      assert.equal(sha256Base64Url(consumed.codeVerifier), concurrent.codeChallenge);
      assert.equal(consumed.nonce, concurrent.nonce);

      const walletStore = new PostgresWalletLoginTransactionStore({
        eventRepository: repository,
        tenantId: TENANT_ID,
        referenceHasher,
        secretBox,
        domain: "ipo.one",
        uri: "https://ipo.one/auth/wallet"
      });
      const wallet = await walletStore.create({
        address: "0x1111111111111111111111111111111111111111",
        chainId: 84532,
        now: NOW
      });
      const rawWallet = await repository.withTenantRead((client) => client.query(
        "SELECT * FROM authentication_wallet_transactions WHERE tenant_id = $1",
        [TENANT_ID]
      ));
      const serializedWallet = JSON.stringify(rawWallet.rows);
      assert.equal(serializedWallet.includes(wallet.handle), false);
      assert.equal(serializedWallet.includes(wallet.address), false);
      assert.equal(serializedWallet.includes(wallet.message), false);
      const recovered = await walletStore.consume({ handle: wallet.handle, now: NOW });
      assert.equal(recovered.address, wallet.address);
      assert.equal(recovered.message, wallet.message);
      await assert.rejects(
        () => walletStore.consume({ handle: wallet.handle, now: NOW }),
        (error) => error.code === "wallet_transaction_rejected"
      );
    });

    await t.test("sessions survive restart, rotate atomically, and revoke immediately", async () => {
      const createStore = () => new PostgresHumanSessionStore({
        eventRepository: repository,
        tenantId: TENANT_ID,
        referenceHasher: createReferenceHasher(referenceKey),
        origin: ORIGIN,
        idleTimeoutMs: 60_000,
        absoluteTimeoutMs: 120_000
      });
      const firstStore = createStore();
      const issued = await firstStore.create(sessionInput(oidcCredential));
      const rawSessions = await repository.withTenantRead((client) => client.query(
        "SELECT * FROM authentication_sessions WHERE tenant_id = $1",
        [TENANT_ID]
      ));
      const serialized = JSON.stringify(rawSessions.rows);
      assert.equal(serialized.includes(issued.cookie.value), false);
      assert.equal(serialized.includes(issued.csrfToken), false);

      const restarted = createStore();
      const contextAfterRestart = await restarted.authenticate({
        sessionHandle: issued.cookie.value,
        requestMethod: "POST",
        requestOrigin: ORIGIN,
        csrfToken: issued.csrfToken,
        now: new Date(NOW.getTime() + 1_000)
      });
      assert.equal(contextAfterRestart.actorId, HUMAN_ACTOR_ID);
      await assert.rejects(
        () => restarted.authenticate({
          sessionHandle: issued.cookie.value,
          requestMethod: "POST",
          requestOrigin: "https://evil.example",
          csrfToken: issued.csrfToken,
          now: new Date(NOW.getTime() + 2_000)
        }),
        (error) => error.code === "csrf_origin_rejected"
      );
      const rotated = await restarted.rotate({
        sessionHandle: issued.cookie.value,
        now: new Date(NOW.getTime() + 2_000)
      });
      await assert.rejects(
        () => restarted.authenticate({
          sessionHandle: issued.cookie.value,
          requestMethod: "GET",
          now: new Date(NOW.getTime() + 3_000)
        }),
        (error) => error.code === "authentication_session_rejected"
      );
      assert.equal((await restarted.authenticate({
        sessionHandle: rotated.cookie.value,
        requestMethod: "GET",
        now: new Date(NOW.getTime() + 3_000)
      })).tenantId, TENANT_ID);
      assert.equal(await restarted.revoke({
        sessionHandle: rotated.cookie.value,
        now: new Date(NOW.getTime() + 4_000)
      }), true);
      assert.equal(await restarted.revoke({
        sessionHandle: rotated.cookie.value,
        now: new Date(NOW.getTime() + 5_000)
      }), false);

      const stale = await restarted.create(sessionInput(oidcCredential, new Date(NOW.getTime() + 6_000)));
      await registry.rotate({
        credentialId: oidcCredential.credentialId,
        senderConstraint: {
          method: SenderConstraintMethod.HOST_SESSION,
          thumbprint: "r".repeat(43)
        },
        performedByActorId: SYSTEM_ACTOR_ID,
        reasonCode: "credential_key_rotation",
        now: new Date(NOW.getTime() + 7_000)
      });
      await assert.rejects(
        () => restarted.authenticate({
          sessionHandle: stale.cookie.value,
          requestMethod: "GET",
          now: new Date(NOW.getTime() + 8_000)
        }),
        (error) => error.code === "authentication_session_rejected"
      );
    });

    await t.test("membership downgrade and Tenant isolation fail closed without secret leakage", async () => {
      const walletSessionStore = new PostgresHumanSessionStore({
        eventRepository: repository,
        tenantId: TENANT_ID,
        referenceHasher,
        origin: ORIGIN
      });
      const issued = await walletSessionStore.create(sessionInput(walletCredential));
      await withTenantTransaction(ownerPool, context, (client) => client.query(
        `UPDATE memberships
            SET capabilities = '["subject.read"]'::jsonb,
                version = version + 1,
                updated_at = $3
          WHERE tenant_id = $1 AND actor_id = $2`,
        [TENANT_ID, HUMAN_ACTOR_ID, new Date(NOW.getTime() + 10_000)]
      ));
      await assert.rejects(
        () => walletSessionStore.authenticate({
          sessionHandle: issued.cookie.value,
          requestMethod: "GET",
          now: new Date(NOW.getTime() + 11_000)
        }),
        (error) => error.code === "authentication_session_rejected"
      );

      const otherEvents = new PostgresAuthenticationEventStore({
        eventRepository: otherRepository,
        tenantId: OTHER_TENANT_ID
      });
      assert.deepEqual(await otherEvents.list(), []);
      assert.throws(
        () => new PostgresAuthenticationEventStore({
          eventRepository: otherRepository,
          tenantId: TENANT_ID
        }),
        (error) => error.code === "invalid_authentication_configuration"
      );
      const events = await new PostgresAuthenticationEventStore({
        eventRepository: repository,
        tenantId: TENANT_ID
      }).list();
      assert.equal(events.length >= 7, true);
      const serializedEvents = JSON.stringify(events);
      assert.equal(serializedEvents.includes(issued.cookie.value), false);
      assert.equal(serializedEvents.includes(`provider-subject-${RUN_ID}`), false);
      const credentials = await repository.withTenantRead((client) => client.query(
        "SELECT * FROM authentication_credentials WHERE tenant_id = $1",
        [TENANT_ID]
      ));
      assert.equal(JSON.stringify(credentials.rows).includes(`provider-subject-${RUN_ID}`), false);

      await withTenantTransaction(ownerPool, context, (client) => client.query(
        `UPDATE memberships
            SET capabilities = '["subject.read", "integration.manage"]'::jsonb,
                version = version + 1,
                updated_at = $3
          WHERE tenant_id = $1 AND actor_id = $2`,
        [TENANT_ID, HUMAN_ACTOR_ID, new Date(NOW.getTime() + 12_000)]
      ));
      const tenantBoundSession = await walletSessionStore.create(
        sessionInput(walletCredential, new Date(NOW.getTime() + 12_100))
      );
      await ownerPool.query("UPDATE tenants SET status = 'suspended' WHERE id = $1", [TENANT_ID]);
      await assert.rejects(
        () => composition.authenticationEvents.list(),
        (error) => error.code === "authentication_deployment_gate_closed"
      );
      await assert.rejects(
        () => walletSessionStore.authenticate({
          sessionHandle: tenantBoundSession.cookie.value,
          requestMethod: "GET",
          now: new Date(NOW.getTime() + 12_200)
        }),
        (error) => error.code === "authentication_session_rejected"
      );
      await ownerPool.query("UPDATE tenants SET status = 'active' WHERE id = $1", [TENANT_ID]);
      const activeBeforeDeprovision = await walletSessionStore.create(
        sessionInput(walletCredential, new Date(NOW.getTime() + 13_000))
      );
      assert.equal(await composition.csrfTokenProvider({
        request: {
          headers: {
            cookie: `${activeBeforeDeprovision.cookie.name}=${activeBeforeDeprovision.cookie.value}; ` +
              `${CSRF_BOOTSTRAP_COOKIE_NAME}=${activeBeforeDeprovision.csrfToken}`
          }
        }
      }), activeBeforeDeprovision.csrfToken);
      const deprovisioned = await composition.humanSessionBff.deprovisionCredential({
        credentialId: walletCredential.credentialId,
        performedByActorId: SYSTEM_ACTOR_ID,
        reasonCode: "credential_deprovisioned",
        now: new Date(NOW.getTime() + 14_000)
      });
      assert.equal(deprovisioned.credential.status, "revoked");
      assert.equal(deprovisioned.revokedSessions, 1);
      await assert.rejects(
        () => walletSessionStore.authenticate({
          sessionHandle: activeBeforeDeprovision.cookie.value,
          requestMethod: "GET",
          now: new Date(NOW.getTime() + 15_000)
        }),
        (error) => error.code === "authentication_session_rejected"
      );
    });
  } finally {
    if (appPool) await appPool.end();
    try {
      const authenticationTables = await ownerPool.query(
        "SELECT to_regclass('public.authentication_credentials') AS credentials"
      );
      if (authenticationTables.rows[0].credentials) {
        await ownerPool.query(
          `TRUNCATE TABLE
             authentication_events,
             authentication_sessions,
             authentication_oidc_transactions,
             authentication_wallet_transactions,
             authentication_credentials
           CASCADE`
        );
      }
      const role = await ownerPool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
      if (role.rowCount === 1) {
        await ownerPool.query(`DROP OWNED BY ${APP_ROLE}`);
        await ownerPool.query(`DROP ROLE ${APP_ROLE}`);
      }
    } finally {
      await ownerPool.end();
    }
  }
});
