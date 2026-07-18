import {
  ActorType,
  CSRF_BOOTSTRAP_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  HumanOidcBff,
  HumanSessionBff,
  HumanWalletBff,
  PostgresAuthenticationEventStore,
  PostgresCredentialRegistry,
  PostgresHumanSessionStore,
  PostgresLoginTransactionStore,
  PostgresWalletLoginTransactionStore,
  assertAuthenticationRuntimeConfig,
  assertPostgresAuthenticationRole,
  assertSafeIdentifier,
  authenticationError,
  createAuthenticationSecretBox,
  createReferenceHasher
} from "../../../modules/authentication/src/index.js";
import {
  PostgresEventRepository,
  createTenantSecurityContext
} from "../../../modules/persistence/src/index.js";
import {
  createHumanAccessRouteHandler,
  readHumanAccessCookie
} from "./human-access-routes.js";

const IMMUTABLE_SECRET_REF =
  /^projects\/[a-z][a-z0-9-]{4,61}\/secrets\/[A-Za-z0-9_-]{1,255}\/versions\/[1-9][0-9]*$/;
const ROOT_KEYS = new Set([
  "browserOrigin",
  "clock",
  "encryptionKey",
  "encryptionKeyRef",
  "idleTimeoutMs",
  "maximumSessions",
  "oidcProviders",
  "policyVersion",
  "pool",
  "postLoginPath",
  "profile",
  "referenceHashKey",
  "referenceHashKeyRef",
  "runtimeConfig",
  "sessionAbsoluteTimeoutMs",
  "systemActorId",
  "tenantId",
  "wallet"
]);
const OIDC_KEYS = new Set([
  "allowedAlgorithms",
  "authorizationEndpoint",
  "clientCredentialRef",
  "clientId",
  "configurationRef",
  "idTokenProfile",
  "issuer",
  "providerAdapter",
  "providerId",
  "redirectUri",
  "resolver"
]);
const WALLET_KEYS = new Set([
  "clientId",
  "domain",
  "issuer",
  "signatureVerifier",
  "uri"
]);

function closedObject(name, value, allowed, required = []) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set) ||
    Object.keys(descriptors).some((key) => !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  return value;
}

function immutableSecretRef(name, value) {
  if (typeof value !== "string" || !IMMUTABLE_SECRET_REF.test(value)) {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      `${name} must be an immutable secret-manager version reference`
    );
  }
  return value;
}

function exactBrowserOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_configuration", "browserOrigin is invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw authenticationError("invalid_authentication_configuration", "browserOrigin is invalid");
  }
  return parsed.origin;
}

function normalizeOidcProviders(value) {
  if (!Array.isArray(value) || value.length > 8) {
    throw authenticationError("invalid_authentication_configuration", "OIDC providers are invalid");
  }
  const providers = value.map((provider) => closedObject(
    "OIDC provider",
    provider,
    OIDC_KEYS,
    [
      "allowedAlgorithms",
      "authorizationEndpoint",
      "clientCredentialRef",
      "clientId",
      "configurationRef",
      "idTokenProfile",
      "issuer",
      "providerAdapter",
      "providerId",
      "redirectUri",
      "resolver"
    ]
  ));
  const providerIds = providers.map((provider) => assertSafeIdentifier("providerId", provider.providerId));
  if (new Set(providerIds).size !== providerIds.length) {
    throw authenticationError("invalid_authentication_configuration", "OIDC provider IDs must be unique");
  }
  return providers;
}

async function assertSystemIdentityInClient(client, { tenantId, systemActorId, policyVersion }) {
  const result = await client.query(
    `SELECT t.status AS tenant_status,
            a.status AS actor_status,
            a.actor_type,
            m.status AS membership_status,
            m.role_bundle,
            m.policy_version
       FROM tenants t
       JOIN actors a ON a.id = $2
      JOIN memberships m ON m.tenant_id = t.id AND m.actor_id = a.id
      WHERE t.id = $1`,
    [tenantId, systemActorId]
  );
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    row.tenant_status !== "active" ||
    row.actor_status !== "active" ||
    row.actor_type !== ActorType.SYSTEM_WORKER ||
    row.membership_status !== "active" ||
    row.role_bundle !== "system_worker" ||
    row.policy_version !== policyVersion
  ) {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "authentication system identity is not active and exactly Tenant-bound"
    );
  }
}

async function assertSystemIdentity(repository, boundary) {
  return repository.withTenantRead((client) => assertSystemIdentityInClient(client, boundary));
}

function revalidatingAuthenticationRepository(repository, boundary) {
  return Object.freeze({
    tenantContext: repository.tenantContext,
    withTenantRead(operation) {
      return repository.withTenantRead(async (client) => {
        await assertSystemIdentityInClient(client, boundary);
        return operation(client);
      });
    },
    withTenantWrite(operation) {
      return repository.withTenantWrite(async (client) => {
        await assertSystemIdentityInClient(client, boundary);
        return operation(client);
      });
    }
  });
}

export async function createPostgresHumanAccessComposition(input) {
  closedObject("PostgreSQL Human access composition", input, ROOT_KEYS, [
    "browserOrigin",
    "encryptionKey",
    "encryptionKeyRef",
    "oidcProviders",
    "policyVersion",
    "pool",
    "referenceHashKey",
    "referenceHashKeyRef",
    "runtimeConfig",
    "systemActorId",
    "tenantId"
  ]);
  const runtimeConfig = assertAuthenticationRuntimeConfig(input.runtimeConfig);
  if (
    runtimeConfig.mode !== "closed_pilot" ||
    runtimeConfig.enabled !== true ||
    runtimeConfig.deploymentGateSatisfied !== true
  ) {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "PostgreSQL Human access requires the approved closed-pilot runtime"
    );
  }
  const tenantId = assertSafeIdentifier("tenantId", input.tenantId);
  const systemActorId = assertSafeIdentifier("systemActorId", input.systemActorId);
  const policyVersion = assertSafeIdentifier("policyVersion", input.policyVersion);
  const browserOrigin = exactBrowserOrigin(input.browserOrigin);
  const referenceHashKeyRef = immutableSecretRef("referenceHashKeyRef", input.referenceHashKeyRef);
  const encryptionKeyRef = immutableSecretRef("encryptionKeyRef", input.encryptionKeyRef);
  if (
    runtimeConfig.referenceHashKeyRef !== referenceHashKeyRef ||
    runtimeConfig.encryptionKeyRef !== encryptionKeyRef
  ) {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "authentication key references do not match the approved runtime"
    );
  }
  const providers = normalizeOidcProviders(input.oidcProviders);
  const wallet = input.wallet === undefined
    ? undefined
    : closedObject("wallet authentication", input.wallet, WALLET_KEYS, [...WALLET_KEYS]);
  if (providers.length === 0 && wallet === undefined) {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "closed Human access requires at least one reviewed login provider"
    );
  }

  const roleBoundary = await assertPostgresAuthenticationRole(input.pool);
  const tenantContext = createTenantSecurityContext({
    tenantId,
    actorId: systemActorId,
    policyVersion,
    source: "system_worker"
  });
  const baseEventRepository = new PostgresEventRepository({
    pool: input.pool,
    tenantContext,
    sourceSystem: "ipo.one.authentication"
  });
  const systemBoundary = Object.freeze({ tenantId, systemActorId, policyVersion });
  await assertSystemIdentity(baseEventRepository, systemBoundary);
  const eventRepository = revalidatingAuthenticationRepository(baseEventRepository, systemBoundary);

  const referenceHasher = createReferenceHasher(input.referenceHashKey);
  const secretBox = createAuthenticationSecretBox(input.encryptionKey);
  const credentialRegistry = new PostgresCredentialRegistry({
    eventRepository,
    tenantId,
    referenceHasher,
    systemActorId
  });
  const sessionStore = new PostgresHumanSessionStore({
    eventRepository,
    tenantId,
    referenceHasher,
    origin: browserOrigin,
    ...(input.idleTimeoutMs === undefined ? {} : { idleTimeoutMs: input.idleTimeoutMs }),
    ...(input.sessionAbsoluteTimeoutMs === undefined
      ? {}
      : { absoluteTimeoutMs: input.sessionAbsoluteTimeoutMs }),
    ...(input.maximumSessions === undefined ? {} : { maximumSessions: input.maximumSessions })
  });
  const humanSessionBff = new HumanSessionBff({ sessionStore, credentialRegistry });
  const oidcProviders = {};
  for (const provider of providers) {
    immutableSecretRef("OIDC configurationRef", provider.configurationRef);
    immutableSecretRef("OIDC clientCredentialRef", provider.clientCredentialRef);
    if (
      provider.configurationRef !== runtimeConfig.idpConfigurationRef ||
      provider.clientCredentialRef !== runtimeConfig.oidcClientCredentialRef
    ) {
      throw authenticationError(
        "authentication_deployment_gate_closed",
        "OIDC provider references do not match the approved runtime"
      );
    }
    const transactionStore = new PostgresLoginTransactionStore({
      eventRepository,
      tenantId,
      referenceHasher,
      secretBox
    });
    const bff = new HumanOidcBff({
      issuer: provider.issuer,
      authorizationEndpoint: provider.authorizationEndpoint,
      clientId: provider.clientId,
      redirectUris: [provider.redirectUri],
      resolver: provider.resolver,
      providerAdapter: provider.providerAdapter,
      transactionStore,
      sessionStore,
      credentialRegistry,
      referenceHasher,
      providerId: provider.providerId,
      idTokenProfile: provider.idTokenProfile,
      tenantId,
      allowedAlgorithms: provider.allowedAlgorithms
    });
    oidcProviders[provider.providerId] = Object.freeze({ bff, redirectUri: provider.redirectUri });
  }

  let walletBff;
  if (wallet) {
    const walletStore = new PostgresWalletLoginTransactionStore({
      eventRepository,
      tenantId,
      referenceHasher,
      secretBox,
      domain: wallet.domain,
      uri: wallet.uri
    });
    walletBff = new HumanWalletBff({
      issuer: wallet.issuer,
      tenantId,
      clientId: wallet.clientId,
      transactionStore: walletStore,
      sessionStore,
      credentialRegistry,
      referenceHasher,
      signatureVerifier: wallet.signatureVerifier
    });
  }

  const serveAuthentication = createHumanAccessRouteHandler({
    browserOrigin,
    humanSessionBff,
    oidcProviders,
    walletBff,
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    ...(input.profile === undefined ? {} : { profile: input.profile }),
    ...(input.postLoginPath === undefined ? {} : { postLoginPath: input.postLoginPath })
  });
  const clock = input.clock ?? (() => new Date());
  const csrfTokenProvider = async ({ request }) => {
    const sessionHandle = readHumanAccessCookie(request?.headers?.cookie, SESSION_COOKIE_NAME);
    const csrfToken = readHumanAccessCookie(request?.headers?.cookie, CSRF_BOOTSTRAP_COOKIE_NAME);
    if (!sessionHandle || !csrfToken) return undefined;
    await humanSessionBff.authenticateSession({
      sessionHandle,
      requestMethod: "POST",
      requestOrigin: browserOrigin,
      csrfToken,
      now: clock()
    });
    return csrfToken;
  };

  return Object.freeze({
    serveAuthentication,
    csrfTokenProvider,
    humanSessionBff,
    credentialRegistry,
    authenticationEvents: new PostgresAuthenticationEventStore({ eventRepository, tenantId }),
    deploymentBoundary: Object.freeze({
      tenantId,
      systemActorId,
      policyVersion,
      databaseRole: roleBoundary.roleName,
      databaseBoundary: roleBoundary.boundary,
      idpVendorId: runtimeConfig.vendorId,
      idpApprovalSha: runtimeConfig.approvalSha,
      referenceHashKeyRef,
      encryptionKeyRef,
      credentialProvisioning: "pre_provisioned_only",
      authority: "authentication_only",
      realFundsEnabled: false
    })
  });
}
