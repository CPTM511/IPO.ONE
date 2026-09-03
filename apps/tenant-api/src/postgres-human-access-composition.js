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
  PostgresReplayCache,
  PostgresWalletLoginTransactionStore,
  assertAuthenticationRuntimeConfig,
  assertPostgresAuthenticationRole,
  assertSafeIdentifier,
  authenticationError,
  createAuthenticationSecretBox,
  createReferenceHashKeyring
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
  /^(?:projects\/[a-z][a-z0-9-]{4,61}\/secrets\/[A-Za-z0-9_-]{1,255}\/versions\/[1-9][0-9]*|vercel:\/\/environment\/production\/[A-Z][A-Z0-9_]{2,127}@sha256:[0-9a-f]{64})$/;
const ROOT_KEYS = new Set([
  "browserOrigin",
  "clock",
  "encryptionKey",
  "encryptionKeyRef",
  "idleTimeoutMs",
  "legacyReferenceHashKey",
  "legacyReferenceHashKeyRef",
  "maximumSessions",
  "oidcProviders",
  "policyVersion",
  "pool",
  "postLoginPath",
  "profile",
  "publicBetaWalletRoleProfiles",
  "referenceHashKey",
  "referenceHashKeyRef",
  "referenceHashMode",
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
      `${name} must be an immutable secret version reference`
    );
  }
  return value;
}

function exactBrowserOrigin(value, { allowLoopback = false } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_configuration", "browserOrigin is invalid");
  }
  const approvedLoopback =
    allowLoopback &&
    parsed.protocol === "http:" &&
    parsed.hostname === "127.0.0.1" &&
    parsed.port !== "";
  if (
    (parsed.protocol !== "https:" && !approvedLoopback) ||
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

function localSessionBff(humanSessionBff, { browserOrigin, sessionOrigin }) {
  const mapOrigin = (input) => ({
    ...input,
    requestOrigin: input?.requestOrigin === browserOrigin
      ? sessionOrigin
      : input?.requestOrigin
  });
  return Object.freeze({
    authenticateSession(input) {
      return humanSessionBff.authenticateSession(mapOrigin(input));
    },
    rotateSession(input) {
      return humanSessionBff.rotateSession(mapOrigin(input));
    },
    logout(input) {
      return humanSessionBff.logout(mapOrigin(input));
    },
    invalidateBrowserSession(input) {
      return humanSessionBff.invalidateBrowserSession(mapOrigin(input));
    },
    deprovisionCredential(input) {
      return humanSessionBff.deprovisionCredential(input);
    }
  });
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
            m.policy_version,
            m.client_ids
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
    row.policy_version !== policyVersion ||
    !Array.isArray(row.client_ids) || row.client_ids.length !== 1
  ) {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "authentication system identity is not active and exactly Tenant-bound"
    );
  }
  return Object.freeze({
    systemClientId: assertSafeIdentifier("systemActorClientId", row.client_ids[0])
  });
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
  const localProfile =
    runtimeConfig.mode === "local_test" &&
    runtimeConfig.enabled === true &&
    runtimeConfig.deploymentGateSatisfied === false &&
    input.profile === "local_no_funds";
  const deployedProtected =
    new Set(["closed_pilot", "public_beta"]).has(runtimeConfig.mode) &&
    runtimeConfig.enabled === true &&
    runtimeConfig.deploymentGateSatisfied === true;
  if (!deployedProtected && !localProfile) {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "PostgreSQL Human access requires the approved closed-pilot or local no-funds runtime"
    );
  }
  if (
    (runtimeConfig.publicBetaSelfService === true) !==
    (input.publicBetaWalletRoleProfiles !== undefined)
  ) {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "public Beta wallet self-service requires the exact ordinary role profiles"
    );
  }
  const tenantId = assertSafeIdentifier("tenantId", input.tenantId);
  const systemActorId = assertSafeIdentifier("systemActorId", input.systemActorId);
  const policyVersion = assertSafeIdentifier("policyVersion", input.policyVersion);
  const browserOrigin = exactBrowserOrigin(input.browserOrigin, {
    allowLoopback: localProfile
  });
  const sessionOrigin = localProfile
    ? `https://${new URL(browserOrigin).host}`
    : browserOrigin;
  let referenceHashKeyRef;
  let legacyReferenceHashKeyRef;
  let encryptionKeyRef;
  const referenceHashMode = deployedProtected
    ? runtimeConfig.referenceHashMode
    : input.referenceHashMode ?? "single_v1";
  if (localProfile) {
    const expectedPrimaryRef = referenceHashMode === "single_v1"
      ? "local-secret://authentication/reference-hash-key"
      : "local-secret://authentication/reference-hash-key-v2";
    const expectedLegacyRef = referenceHashMode === "overlap_v2_write_v1_lookup"
      ? "local-secret://authentication/reference-hash-key-v1"
      : undefined;
    if (
      input.referenceHashKeyRef !== expectedPrimaryRef ||
      input.legacyReferenceHashKeyRef !== expectedLegacyRef ||
      input.encryptionKeyRef !== "local-secret://authentication/encryption-key"
    ) {
      throw authenticationError(
        "authentication_deployment_gate_closed",
        "local authentication requires the reviewed ignored-file key references"
      );
    }
    referenceHashKeyRef = input.referenceHashKeyRef;
    legacyReferenceHashKeyRef = input.legacyReferenceHashKeyRef;
    encryptionKeyRef = input.encryptionKeyRef;
  } else {
    referenceHashKeyRef = immutableSecretRef("referenceHashKeyRef", input.referenceHashKeyRef);
    legacyReferenceHashKeyRef = input.legacyReferenceHashKeyRef === undefined
      ? undefined
      : immutableSecretRef(
          "legacyReferenceHashKeyRef",
          input.legacyReferenceHashKeyRef
        );
    encryptionKeyRef = immutableSecretRef("encryptionKeyRef", input.encryptionKeyRef);
    if (
      runtimeConfig.referenceHashKeyRef !== referenceHashKeyRef ||
      runtimeConfig.legacyReferenceHashKeyRef !== legacyReferenceHashKeyRef ||
      runtimeConfig.encryptionKeyRef !== encryptionKeyRef
    ) {
      throw authenticationError(
        "authentication_deployment_gate_closed",
        "authentication key references do not match the approved runtime"
      );
    }
  }
  const referenceHasher = createReferenceHashKeyring({
    mode: referenceHashMode,
    primary: {
      keyVersion: referenceHashMode === "single_v1" ? "v1" : "v2",
      secret: input.referenceHashKey
    },
    ...(referenceHashMode === "overlap_v2_write_v1_lookup"
      ? {
          legacy: {
            keyVersion: "v1",
            secret: input.legacyReferenceHashKey
          }
        }
      : {})
  });
  const providers = normalizeOidcProviders(input.oidcProviders);
  const wallet = input.wallet === undefined
    ? undefined
    : closedObject("wallet authentication", input.wallet, WALLET_KEYS, [...WALLET_KEYS]);
  if (localProfile && (providers.length !== 0 || wallet === undefined)) {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "local no-funds authentication requires wallet-only login"
    );
  }
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
  const systemIdentity = await assertSystemIdentity(baseEventRepository, systemBoundary);
  const eventRepository = revalidatingAuthenticationRepository(baseEventRepository, systemBoundary);

  const machineReplayCache = new PostgresReplayCache({
    eventRepository,
    tenantId,
    referenceHasher
  });
  const secretBox = createAuthenticationSecretBox(input.encryptionKey);
  const credentialRegistry = new PostgresCredentialRegistry({
    eventRepository,
    tenantId,
    referenceHasher,
    systemActorId,
    ...(runtimeConfig.publicBetaSelfService === true
      ? { publicBetaWalletRoleProfiles: input.publicBetaWalletRoleProfiles }
      : {})
  });
  const sessionStore = new PostgresHumanSessionStore({
    eventRepository,
    tenantId,
    referenceHasher,
    origin: sessionOrigin,
    ...(input.idleTimeoutMs === undefined ? {} : { idleTimeoutMs: input.idleTimeoutMs }),
    ...(input.sessionAbsoluteTimeoutMs === undefined
      ? {}
      : { absoluteTimeoutMs: input.sessionAbsoluteTimeoutMs }),
    ...(input.maximumSessions === undefined ? {} : { maximumSessions: input.maximumSessions })
  });
  const durableHumanSessionBff = new HumanSessionBff({
    sessionStore,
    credentialRegistry
  });
  const humanSessionBff = localProfile
    ? localSessionBff(durableHumanSessionBff, {
        browserOrigin,
        sessionOrigin
      })
    : durableHumanSessionBff;
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
    try {
      await humanSessionBff.authenticateSession({
        sessionHandle,
        requestMethod: "POST",
        requestOrigin: browserOrigin,
        csrfToken,
        now: clock()
      });
    } catch (error) {
      if (error?.code === "authentication_session_rejected") return undefined;
      throw error;
    }
    return csrfToken;
  };

  return Object.freeze({
    serveAuthentication,
    csrfTokenProvider,
    humanSessionBff,
    credentialRegistry,
    systemClientId: systemIdentity.systemClientId,
    machineReplayCache,
    authenticationEvents: new PostgresAuthenticationEventStore({ eventRepository, tenantId }),
    deploymentBoundary: Object.freeze({
      tenantId,
      systemActorId,
      policyVersion,
      databaseRole: roleBoundary.roleName,
      databaseBoundary: roleBoundary.boundary,
      idpVendorId: localProfile ? "local_wallet_only" : runtimeConfig.vendorId,
      idpApprovalSha: localProfile ? undefined : runtimeConfig.approvalSha,
      referenceHashKeyRef,
      encryptionKeyRef,
      credentialProvisioning: runtimeConfig.publicBetaSelfService === true
        ? "verified_wallet_self_service"
        : "pre_provisioned_only",
      authority: "authentication_only",
      realFundsEnabled: false
    })
  });
}
