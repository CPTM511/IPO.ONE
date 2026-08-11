import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  PinnedJwksResolver,
  createOidcCodeExchangeAdapter,
  createReferenceHasher,
  createTrustedMtlsSenderEvidence,
  loadAuthenticationRuntimeConfig
} from "../../../modules/authentication/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  EvmAccountProofAdapter,
  EvmWalletSignatureVerifier,
  X_LAYER_TESTNET_PROFILE
} from "../../../modules/chain-adapter/src/index.js";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import {
  abuseHash,
  createTrustedNetworkContext
} from "../../../modules/abuse-control/src/index.js";
import { createPostgresPool } from "../../../modules/persistence/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

const PROVIDER_KEYS = new Set([
  "allowedAlgorithms",
  "authorizationEndpoint",
  "clientAuthenticationMethod",
  "clientCredentialRef",
  "clientId",
  "configurationRef",
  "idTokenProfile",
  "issuer",
  "jwksUri",
  "providerId",
  "tokenEndpoint"
]);
const WORKLOAD_V1_KEYS = new Set(["allowedAlgorithms", "audience", "issuer", "jwksUri"]);
const WORKLOAD_V2_KEYS = new Set(["allowedAlgorithms", "audience", "issuer", "publicJwks"]);
const ROOT_KEYS = new Set(["oidcProviders", "schemaVersion", "wallet", "workload"]);
const WALLET_KEYS = new Set(["clientId", "enabled", "issuer"]);
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const EVM_ACCOUNT = /^0x[a-fA-F0-9]{40}$/;
const VERCEL_SECRET_REFERENCE = /^vercel:\/\/environment\/production\/([A-Z][A-Z0-9_]{2,127})@sha256:([0-9a-f]{64})$/;
const VERCEL_PRIMARY_CUSTOM_DOMAIN = "ipo.one";
const VERCEL_PRIMARY_CUSTOM_DOMAIN_ACK =
  "FOUNDER_AUTHORIZED_IPO_ONE_PRODUCTION_DOMAIN";

function configError(message = "Production environment configuration is invalid") {
  return new DomainError("invalid_production_environment", message);
}

function required(environment, name, pattern, maximum = 16_384) {
  const value = environment[name];
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    !pattern.test(value)
  ) throw configError(`${name} is required and must match the reviewed production format`);
  return value;
}

function exactObject(name, value, keys, requiredKeys = [...keys]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.values(Object.getOwnPropertyDescriptors(value)).some((descriptor) => descriptor.get || descriptor.set) ||
    Object.keys(value).some((key) => !keys.has(key)) ||
    requiredKeys.some((key) => !Object.hasOwn(value, key))
  ) throw configError(`${name} is invalid`);
  return value;
}

async function readBounded(path, maximum) {
  const bytes = await readFile(path);
  if (bytes.length < 1 || bytes.length > maximum || bytes.includes(0)) {
    throw configError("Production configuration or secret file is invalid");
  }
  return bytes.toString("utf8").trim();
}

function inlineSecret(environment, name, maximum) {
  const value = required(environment, name, /^[^\0\r\n]+$/u, maximum);
  return value.trim();
}

function assertVercelSecretReference(environment, referenceName, valueName, value) {
  const reference = required(
    environment,
    referenceName,
    /^vercel:\/\/environment\/production\/.+$/u,
    256
  );
  const match = VERCEL_SECRET_REFERENCE.exec(reference);
  const digest = createHash("sha256").update(value).digest("hex");
  if (!match || match[1] !== valueName || match[2] !== digest) {
    throw configError(`${referenceName} does not bind the exact Vercel secret version`);
  }
}

async function readDeploymentSecret(environment, {
  fileName,
  valueName,
  referenceName,
  maximum,
  vercelSandbox
}) {
  if (vercelSandbox) {
    if (environment[fileName] !== undefined) {
      throw configError(`${fileName} is not allowed in the Vercel Sandbox`);
    }
    const value = inlineSecret(environment, valueName, maximum);
    assertVercelSecretReference(environment, referenceName, valueName, value);
    return value;
  }
  if (environment[valueName] !== undefined) {
    throw configError(`${valueName} is only allowed in the Vercel Sandbox`);
  }
  const path = required(environment, fileName, /^\/.{1,4094}$/u, 4_096);
  return readBounded(path, maximum);
}

async function readKey(environment, {
  fileName,
  valueName,
  referenceName,
  vercelSandbox
}) {
  const encoded = await readDeploymentSecret(environment, {
    fileName,
    valueName,
    referenceName,
    maximum: 256,
    vercelSandbox
  });
  if (!BASE64URL.test(encoded)) throw configError(`${valueName} does not contain a base64url key`);
  const key = Buffer.from(encoded, "base64url");
  if (key.length < 32 || key.length > 64 || key.toString("base64url") !== encoded) {
    throw configError(`${valueName} does not contain a 32-64 byte key`);
  }
  return key;
}

async function fetchBoundedJson(url, signal) {
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal
    });
  } catch {
    throw configError("Approved JWKS endpoint is unavailable");
  }
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || type !== "application/json" || declared > 64 * 1024) {
    throw configError("Approved JWKS endpoint returned an invalid response");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1 || bytes.length > 64 * 1024) {
    throw configError("Approved JWKS endpoint returned an invalid response");
  }
  return parseStrictJson(bytes.toString("utf8"), {
    maximumBytes: 64 * 1024,
    maximumDepth: 6,
    maximumKeys: 256
  });
}

function exactHttpsUrl(name, value, { originOnly = false } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw configError(`${name} is invalid`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (originOnly && (parsed.pathname !== "/" || parsed.search))
  ) throw configError(`${name} is invalid`);
  return parsed;
}

function algorithms(value) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 4 ||
    new Set(value).size !== value.length ||
    value.some((algorithm) => !new Set(["ES256", "PS256", "RS256", "EdDSA"]).has(algorithm))
  ) throw configError("Signing algorithms are invalid");
  return Object.freeze([...value]);
}

function inlinePublicJwks(value) {
  const jwks = exactObject("workload public JWKS", value, new Set(["keys"]));
  if (!Array.isArray(jwks.keys) || jwks.keys.length < 1 || jwks.keys.length > 8) {
    throw configError("workload public JWKS is invalid");
  }
  const privateFields = new Set(["d", "p", "q", "dp", "dq", "qi", "oth", "k"]);
  for (const key of jwks.keys) {
    if (
      !key || typeof key !== "object" || Array.isArray(key) ||
      Object.values(Object.getOwnPropertyDescriptors(key)).some((descriptor) => descriptor.get || descriptor.set) ||
      Object.keys(key).some((field) => privateFields.has(field))
    ) throw configError("workload public JWKS contains invalid or private key material");
  }
  return Object.freeze({ keys: Object.freeze(jwks.keys.map((key) => Object.freeze({ ...key }))) });
}

function constantTimeMatch(actual, expected) {
  if (typeof actual !== "string") return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function oneHeader(request, name, maximum = 4_096) {
  const value = request.headers[name];
  if (Array.isArray(value) || typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw configError("Trusted edge headers are invalid");
  }
  return value;
}

function safeVercelEdgeHeader(value, maximum) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    !/[\r\n\0]/u.test(value)
  );
}

function assertVercelPublicOrigin(environment, browserOrigin) {
  const projectUrlMatches =
    browserOrigin.host === environment.VERCEL_PROJECT_PRODUCTION_URL;
  const customDomain = environment.IPO_ONE_VERCEL_CUSTOM_DOMAIN;
  const customDomainAck = environment.IPO_ONE_VERCEL_CUSTOM_DOMAIN_ACK;
  const customConfigurationPresent =
    customDomain !== undefined || customDomainAck !== undefined;

  if (environment.IPO_ONE_VERCEL_PROJECT_ROLE === "risk") {
    if (!projectUrlMatches || customConfigurationPresent) {
      throw configError(
        "Risk must use the Vercel production project URL without a custom domain"
      );
    }
    return;
  }
  if (projectUrlMatches && !customConfigurationPresent) return;
  if (
    browserOrigin.host !== VERCEL_PRIMARY_CUSTOM_DOMAIN ||
    customDomain !== VERCEL_PRIMARY_CUSTOM_DOMAIN ||
    customDomainAck !== VERCEL_PRIMARY_CUSTOM_DOMAIN_ACK
  ) {
    throw configError(
      "Primary custom origin requires the exact Founder-authorized ipo.one domain"
    );
  }
}

function verifyVercelEdgeRequest(request, environment) {
  const vercelId = request.headers["x-vercel-id"];
  const deploymentUrl = request.headers["x-vercel-deployment-url"];
  const vercelIdValid = safeVercelEdgeHeader(vercelId, 1_024);
  const deploymentUrlValid = safeVercelEdgeHeader(deploymentUrl, 255);
  const deploymentUrlMatches = (
    deploymentUrlValid &&
    deploymentUrl === environment.VERCEL_URL
  );
  if (!vercelIdValid || !deploymentUrlMatches) {
    process.stderr.write(`${JSON.stringify({
      event: "vercel_edge_request_rejected",
      deploymentUrlMatches,
      deploymentUrlPresent: deploymentUrl !== undefined,
      releaseId: environment.IPO_ONE_RELEASE_ID ?? "unknown",
      vercelIdPresent: vercelId !== undefined,
      vercelIdValid
    })}\n`);
    return false;
  }
  return true;
}

async function loadProviderConfig(environment, publicOrigin, { vercelSandbox }) {
  const source = await readDeploymentSecret(environment, {
    fileName: "IPO_ONE_IDENTITY_CONFIG_FILE",
    valueName: "IPO_ONE_IDENTITY_CONFIG_JSON",
    referenceName: "IPO_ONE_IDP_CONFIGURATION_REF",
    maximum: 64 * 1024,
    vercelSandbox
  });
  const config = parseStrictJson(source, {
    maximumBytes: 64 * 1024,
    maximumDepth: 8,
    maximumKeys: 256
  });
  exactObject("identity config", config, ROOT_KEYS);
  if (!new Set([
    "ipo_one_production_identity_config.v1",
    "ipo_one_production_identity_config.v2"
  ]).has(config.schemaVersion)) {
    throw configError("identity config schemaVersion is invalid");
  }
  if (!Array.isArray(config.oidcProviders) || config.oidcProviders.length > 8) {
    throw configError("at most eight OIDC providers are allowed");
  }
  const oidcClientSecret = config.oidcProviders.length === 0
    ? undefined
    : await readDeploymentSecret(environment, {
        fileName: "IPO_ONE_OIDC_CLIENT_SECRET_FILE",
        valueName: "IPO_ONE_OIDC_CLIENT_SECRET",
        referenceName: "IPO_ONE_OIDC_CLIENT_CREDENTIAL_REF",
        maximum: 1_024,
        vercelSandbox
      });
  if (oidcClientSecret !== undefined && oidcClientSecret.length < 8) {
    throw configError("OIDC client secret is invalid");
  }
  const providers = config.oidcProviders.map((value) => {
    const provider = exactObject("OIDC provider", value, PROVIDER_KEYS);
    const allowedAlgorithms = algorithms(provider.allowedAlgorithms);
    const issuer = exactHttpsUrl("OIDC issuer", provider.issuer, { originOnly: true }).origin;
    const jwksUri = exactHttpsUrl("OIDC JWKS URI", provider.jwksUri).href;
    const resolver = new PinnedJwksResolver({
      issuer,
      allowedAlgorithms,
      fetchJwks: ({ signal }) => fetchBoundedJson(jwksUri, signal)
    });
    return Object.freeze({
      providerId: provider.providerId,
      issuer,
      authorizationEndpoint: exactHttpsUrl("OIDC authorization endpoint", provider.authorizationEndpoint).href,
      clientId: provider.clientId,
      configurationRef: provider.configurationRef,
      clientCredentialRef: provider.clientCredentialRef,
      redirectUri: `${publicOrigin.origin}/auth/v1/callback?provider=${encodeURIComponent(provider.providerId)}`,
      resolver,
      providerAdapter: createOidcCodeExchangeAdapter({
        tokenEndpoint: exactHttpsUrl("OIDC token endpoint", provider.tokenEndpoint).href,
        clientAuthenticationMethod: provider.clientAuthenticationMethod,
        clientSecretProvider: async () => oidcClientSecret
      }),
      idTokenProfile: provider.idTokenProfile,
      allowedAlgorithms
    });
  });
  if (new Set(providers.map(({ providerId }) => providerId)).size !== providers.length) {
    throw configError("OIDC provider IDs must be unique");
  }

  const inlineWorkloadKeys = config.schemaVersion === "ipo_one_production_identity_config.v2";
  if (vercelSandbox !== inlineWorkloadKeys) {
    throw configError("Vercel Sandbox requires identity config v2 with inline public workload keys");
  }
  const workload = inlineWorkloadKeys
    ? exactObject("workload identity", config.workload, WORKLOAD_V2_KEYS)
    : exactObject("workload identity", config.workload, WORKLOAD_V1_KEYS);
  const workloadAlgorithms = algorithms(workload.allowedAlgorithms);
  const workloadIssuer = exactHttpsUrl("workload issuer", workload.issuer, { originOnly: true }).origin;
  const workloadJwks = inlineWorkloadKeys
    ? inlinePublicJwks(workload.publicJwks)
    : undefined;
  const workloadJwksUri = inlineWorkloadKeys
    ? undefined
    : exactHttpsUrl("workload JWKS URI", workload.jwksUri).href;
  const machineResolver = new PinnedJwksResolver({
    issuer: workloadIssuer,
    allowedAlgorithms: workloadAlgorithms,
    fetchJwks: inlineWorkloadKeys
      ? async () => workloadJwks
      : ({ signal }) => fetchBoundedJson(workloadJwksUri, signal)
  });

  const walletConfig = exactObject("wallet identity", config.wallet, WALLET_KEYS);
  const walletSignatureVerifier = new EvmWalletSignatureVerifier();
  const wallet = walletConfig.enabled === true
    ? Object.freeze({
        issuer: exactHttpsUrl("wallet issuer", walletConfig.issuer, { originOnly: true }).origin,
        clientId: walletConfig.clientId,
        domain: publicOrigin.host,
        uri: publicOrigin.origin,
        signatureVerifier: Object.freeze({
          verify: (input) => walletSignatureVerifier.verifyMessage(input)
        })
      })
    : undefined;
  if (walletConfig.enabled !== true && walletConfig.enabled !== false) {
    throw configError("wallet enabled flag is invalid");
  }
  if (providers.length === 0 && walletConfig.enabled !== true) {
    throw configError("at least one reviewed Human login provider is required");
  }
  return Object.freeze({
    providers: Object.freeze(providers),
    wallet,
    walletSignatureVerifier,
    machineIssuer: workloadIssuer,
    machineAudience: workload.audience,
    machineResolver
  });
}

export async function loadProductionClosedPilotEnvironment(environment = process.env) {
  if (environment.NODE_ENV !== "production") {
    throw configError("NODE_ENV must be production");
  }
  const vercelSandbox = environment.IPO_ONE_DEPLOYMENT_PROFILE === "vercel_sandbox";
  if (
    environment.IPO_ONE_DEPLOYMENT_PROFILE !== undefined && !vercelSandbox
  ) throw configError("IPO_ONE_DEPLOYMENT_PROFILE is invalid");
  if (vercelSandbox && (
    environment.VERCEL !== "1" ||
    environment.VERCEL_ENV !== "production" ||
    environment.VERCEL_TARGET_ENV !== "production" ||
    environment.IPO_ONE_DEPLOYMENT_MODE !== "vercel_sandbox" ||
    !new Set(["primary", "risk"]).has(environment.IPO_ONE_VERCEL_PROJECT_ROLE) ||
    environment.IPO_ONE_NO_REAL_FUNDS_ACK !== "I_UNDERSTAND_DEPLOYABLE_SANDBOX_NO_REAL_FUNDS"
  )) {
    throw configError("Vercel Sandbox deployment authority is invalid");
  }
  if (
    vercelSandbox &&
    process.env.IPO_ONE_BUNDLED_RELEASE_ID !== undefined &&
    environment.IPO_ONE_RELEASE_ID !== process.env.IPO_ONE_BUNDLED_RELEASE_ID
  ) {
    throw configError("IPO_ONE_RELEASE_ID does not match the bundled source commit");
  }
  const agentAccountAddress = vercelSandbox &&
    environment.IPO_ONE_VERCEL_PROJECT_ROLE === "primary"
    ? required(
        environment,
        "IPO_ONE_SANDBOX_AGENT_ACCOUNT_ADDRESS",
        EVM_ACCOUNT,
        42
      )
    : undefined;
  if (
    vercelSandbox &&
    environment.IPO_ONE_VERCEL_PROJECT_ROLE === "risk" &&
    environment.IPO_ONE_SANDBOX_AGENT_ACCOUNT_ADDRESS !== undefined
  ) {
    throw configError(
      "IPO_ONE_SANDBOX_AGENT_ACCOUNT_ADDRESS is not allowed on the Risk project"
    );
  }
  const runtimeConfig = loadAuthenticationRuntimeConfig(environment);
  if (runtimeConfig.mode !== "closed_pilot" || runtimeConfig.deploymentGateSatisfied !== true) {
    throw configError("closed-pilot authentication approval is required");
  }
  const browserOrigin = exactHttpsUrl(
    "IPO_ONE_PUBLIC_ORIGIN",
    required(environment, "IPO_ONE_PUBLIC_ORIGIN", /^https:\/\/.+$/u, 2_048),
    { originOnly: true }
  );
  if (vercelSandbox) assertVercelPublicOrigin(environment, browserOrigin);
  const referenceHashKey = await readKey(environment, {
    fileName: "IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE",
    valueName: "IPO_ONE_AUTH_REFERENCE_HASH_KEY",
    referenceName: "IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF",
    vercelSandbox
  });
  const encryptionKey = await readKey(environment, {
    fileName: "IPO_ONE_AUTH_ENCRYPTION_KEY_FILE",
    valueName: "IPO_ONE_AUTH_ENCRYPTION_KEY",
    referenceName: "IPO_ONE_AUTH_ENCRYPTION_KEY_REF",
    vercelSandbox
  });
  const edgeAssertionKey = vercelSandbox
    ? undefined
    : await readKey(environment, {
        fileName: "IPO_ONE_EDGE_ASSERTION_KEY_FILE",
        valueName: "IPO_ONE_EDGE_ASSERTION_KEY",
        referenceName: "IPO_ONE_EDGE_ASSERTION_KEY_REF",
        vercelSandbox
      });
  const identity = await loadProviderConfig(environment, browserOrigin, { vercelSandbox });
  const proofAdapters = Object.freeze([
    BASE_SEPOLIA_PROFILE,
    X_LAYER_TESTNET_PROFILE
  ].map((profile) => new EvmAccountProofAdapter({
    profile,
    signatureVerifier: identity.walletSignatureVerifier
  })));
  const referenceHasher = createReferenceHasher(referenceHashKey);
  const port = Number(environment.PORT ?? 8080);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) throw configError("PORT is invalid");
  const gatewayPool = createPostgresPool({
    connectionString: required(environment, "IPO_ONE_GATEWAY_DATABASE_URL", /^postgres(?:ql)?:\/\/.+$/u),
    max: vercelSandbox ? 1 : 16,
    idleTimeoutMillis: vercelSandbox ? 5_000 : 30_000,
    allowExitOnIdle: vercelSandbox,
    applicationName: vercelSandbox ? "ipo-one-vercel-gateway" : "ipo-one-production-gateway"
  });
  const authenticationPool = createPostgresPool({
    connectionString: required(environment, "IPO_ONE_AUTH_DATABASE_URL", /^postgres(?:ql)?:\/\/.+$/u),
    max: vercelSandbox ? 1 : 8,
    idleTimeoutMillis: vercelSandbox ? 5_000 : 30_000,
    allowExitOnIdle: vercelSandbox,
    applicationName: vercelSandbox
      ? "ipo-one-vercel-authentication"
      : "ipo-one-production-authentication"
  });
  const edgeAssertion = edgeAssertionKey?.toString("base64url");

  return Object.freeze({
    gatewayPool,
    authenticationPool,
    ...(agentAccountAddress === undefined ? {} : { agentAccountAddress }),
    browserOrigin: browserOrigin.origin,
    tenantId: required(environment, "IPO_ONE_TENANT_ID", /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u, 128),
    systemActorId: required(environment, "IPO_ONE_SYSTEM_ACTOR_ID", /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u, 128),
    policyVersion: required(environment, "IPO_ONE_POLICY_VERSION", /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/u, 256),
    releaseId: required(environment, "IPO_ONE_RELEASE_ID", /^[0-9a-f]{40}$/u, 40),
    deploymentRole: vercelSandbox ? environment.IPO_ONE_VERCEL_PROJECT_ROLE : "container",
    port,
    runtimeConfig,
    referenceHashKey,
    referenceHashKeyRef: runtimeConfig.referenceHashKeyRef,
    encryptionKey,
    encryptionKeyRef: runtimeConfig.encryptionKeyRef,
    oidcProviders: identity.providers,
    proofAdapters,
    ...(identity.wallet === undefined ? {} : { wallet: identity.wallet }),
    machineIssuer: identity.machineIssuer,
    machineAudience: identity.machineAudience,
    machineResolver: identity.machineResolver,
    verifyEdgeRequest(request) {
      if (vercelSandbox) {
        return verifyVercelEdgeRequest(request, environment);
      }
      return constantTimeMatch(request.headers["x-ipo-one-edge-assertion"], edgeAssertion);
    },
    getTrustedMtlsEvidence(request) {
      if (vercelSandbox) {
        if (request.headers["x-ipo-one-client-cert-sha256"] !== undefined) {
          throw configError("Vercel Sandbox rejects untrusted client certificate headers");
        }
        return undefined;
      }
      const authorization = request.headers.authorization;
      if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return undefined;
      return createTrustedMtlsSenderEvidence({
        certificateThumbprint: oneHeader(request, "x-ipo-one-client-cert-sha256", 128),
        source: "trusted_mtls_terminator"
      });
    },
    createNetworkContext({ request }) {
      const forwardedFor = oneHeader(request, "x-forwarded-for", 2_048);
      return createTrustedNetworkContext({
        networkRefHash: abuseHash(
          "verified_proxy_network",
          referenceHasher.hash("network.forwarded", forwardedFor)
        ),
        source: "verified_proxy"
      });
    }
  });
}
