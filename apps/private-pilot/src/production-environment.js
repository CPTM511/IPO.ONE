import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyMessage } from "viem";
import {
  PinnedJwksResolver,
  createOidcCodeExchangeAdapter,
  createReferenceHasher,
  createTrustedMtlsSenderEvidence,
  loadAuthenticationRuntimeConfig
} from "../../../modules/authentication/src/index.js";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
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
const WORKLOAD_KEYS = new Set(["allowedAlgorithms", "audience", "issuer", "jwksUri"]);
const ROOT_KEYS = new Set(["oidcProviders", "schemaVersion", "wallet", "workload"]);
const WALLET_KEYS = new Set(["clientId", "enabled", "issuer"]);
const BASE64URL = /^[A-Za-z0-9_-]+$/;

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

async function readKeyFile(environment, name) {
  const path = required(environment, name, /^\/.{1,4094}$/u, 4_096);
  const encoded = await readBounded(path, 256);
  if (!BASE64URL.test(encoded)) throw configError(`${name} does not contain a base64url key`);
  const key = Buffer.from(encoded, "base64url");
  if (key.length < 32 || key.length > 64 || key.toString("base64url") !== encoded) {
    throw configError(`${name} does not contain a 32-64 byte key`);
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

async function loadProviderConfig(environment, publicOrigin) {
  const path = required(environment, "IPO_ONE_IDENTITY_CONFIG_FILE", /^\/.{1,4094}$/u, 4_096);
  const source = await readBounded(path, 64 * 1024);
  const config = parseStrictJson(source, {
    maximumBytes: 64 * 1024,
    maximumDepth: 8,
    maximumKeys: 256
  });
  exactObject("identity config", config, ROOT_KEYS);
  if (config.schemaVersion !== "ipo_one_production_identity_config.v1") {
    throw configError("identity config schemaVersion is invalid");
  }
  if (!Array.isArray(config.oidcProviders) || config.oidcProviders.length > 8) {
    throw configError("at most eight OIDC providers are allowed");
  }
  const oidcClientSecret = config.oidcProviders.length === 0
    ? undefined
    : await readBounded(
        required(environment, "IPO_ONE_OIDC_CLIENT_SECRET_FILE", /^\/.{1,4094}$/u, 4_096),
        1_024
      );
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

  const workload = exactObject("workload identity", config.workload, WORKLOAD_KEYS);
  const workloadAlgorithms = algorithms(workload.allowedAlgorithms);
  const workloadIssuer = exactHttpsUrl("workload issuer", workload.issuer, { originOnly: true }).origin;
  const workloadJwks = exactHttpsUrl("workload JWKS URI", workload.jwksUri).href;
  const machineResolver = new PinnedJwksResolver({
    issuer: workloadIssuer,
    allowedAlgorithms: workloadAlgorithms,
    fetchJwks: ({ signal }) => fetchBoundedJson(workloadJwks, signal)
  });

  const walletConfig = exactObject("wallet identity", config.wallet, WALLET_KEYS);
  const wallet = walletConfig.enabled === true
    ? Object.freeze({
        issuer: exactHttpsUrl("wallet issuer", walletConfig.issuer, { originOnly: true }).origin,
        clientId: walletConfig.clientId,
        domain: publicOrigin.host,
        uri: publicOrigin.origin,
        signatureVerifier: Object.freeze({ verify: (input) => verifyMessage(input) })
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
    machineIssuer: workloadIssuer,
    machineAudience: workload.audience,
    machineResolver
  });
}

export async function loadProductionClosedPilotEnvironment(environment = process.env) {
  if (environment.NODE_ENV !== "production") {
    throw configError("NODE_ENV must be production");
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
  const referenceHashKey = await readKeyFile(environment, "IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE");
  const encryptionKey = await readKeyFile(environment, "IPO_ONE_AUTH_ENCRYPTION_KEY_FILE");
  const edgeAssertionKey = await readKeyFile(environment, "IPO_ONE_EDGE_ASSERTION_KEY_FILE");
  const identity = await loadProviderConfig(environment, browserOrigin);
  const referenceHasher = createReferenceHasher(referenceHashKey);
  const port = Number(environment.PORT ?? 8080);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) throw configError("PORT is invalid");
  const gatewayPool = createPostgresPool({
    connectionString: required(environment, "IPO_ONE_GATEWAY_DATABASE_URL", /^postgres(?:ql)?:\/\/.+$/u),
    max: 16,
    applicationName: "ipo-one-production-gateway"
  });
  const authenticationPool = createPostgresPool({
    connectionString: required(environment, "IPO_ONE_AUTH_DATABASE_URL", /^postgres(?:ql)?:\/\/.+$/u),
    max: 8,
    applicationName: "ipo-one-production-authentication"
  });
  const edgeAssertion = edgeAssertionKey.toString("base64url");

  return Object.freeze({
    gatewayPool,
    authenticationPool,
    browserOrigin: browserOrigin.origin,
    tenantId: required(environment, "IPO_ONE_TENANT_ID", /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u, 128),
    systemActorId: required(environment, "IPO_ONE_SYSTEM_ACTOR_ID", /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u, 128),
    policyVersion: required(environment, "IPO_ONE_POLICY_VERSION", /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/u, 256),
    releaseId: required(environment, "IPO_ONE_RELEASE_ID", /^[0-9a-f]{40}$/u, 40),
    port,
    runtimeConfig,
    referenceHashKey,
    referenceHashKeyRef: runtimeConfig.referenceHashKeyRef,
    encryptionKey,
    encryptionKeyRef: runtimeConfig.encryptionKeyRef,
    oidcProviders: identity.providers,
    ...(identity.wallet === undefined ? {} : { wallet: identity.wallet }),
    machineIssuer: identity.machineIssuer,
    machineAudience: identity.machineAudience,
    machineResolver: identity.machineResolver,
    verifyEdgeRequest(request) {
      return constantTimeMatch(request.headers["x-ipo-one-edge-assertion"], edgeAssertion);
    },
    getTrustedMtlsEvidence(request) {
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
        networkRefHash: referenceHasher.hash("network.forwarded", forwardedFor),
        source: "verified_proxy"
      });
    }
  });
}
