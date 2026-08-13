import { createServer } from "node:http";
import {
  ApiBoundaryError,
  TENANT_PROTOCOL_CATALOG,
  assertTenantProtocolRequest,
  createProblemDetails,
  createRequestId
} from "../../../packages/api-contract/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import { createTenantAuthenticationResolver } from "./tenant-authentication-resolver.js";
import { createTenantWebAssetHandler } from "./tenant-web-assets.js";
import {
  createAgentHttpsOpenApiDocument,
  createTenantOpenApiDocument
} from "./tenant-openapi.js";

export const PRODUCTION_TENANT_ROUTES = Object.freeze({
  agentOpenApi: "/agent-openapi.json",
  deploymentCapability: "/.well-known/ipo-one.json",
  operations: "/tenant/v1/operations",
  catalog: "/tenant/v1/catalog",
  health: "/tenant/v1/healthz",
  live: "/livez",
  ready: "/readyz"
});

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CONCURRENCY = 64;
const REQUEST_TIMEOUT_MS = 30_000;
const CONFIG_KEYS = new Set([
  "clock",
  "createNetworkContext",
  "csrfTokenProvider",
  "gateway",
  "getTrustedMtlsEvidence",
  "humanBff",
  "localAgentAccountProvider",
  "machineAuthenticator",
  "maximumConcurrency",
  "port",
  "publicOrigin",
  "readinessCheck",
  "releaseId",
  "requestTimeoutMs",
  "serveAuthentication",
  "sessionHandleProvider",
  "verifyEdgeRequest",
  "workspaceNameProvider"
]);

function invalidConfig() {
  return new DomainError(
    "invalid_production_tenant_host_config",
    "Production Tenant Host configuration is invalid"
  );
}

function assertClosedConfig(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) throw invalidConfig();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set) ||
    Object.keys(descriptors).some((key) => !CONFIG_KEYS.has(key))
  ) throw invalidConfig();
}

function exactPublicOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw invalidConfig();
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) throw invalidConfig();
  return parsed;
}

function boundedInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function oneHeader(headers, name, { required = false, maximum = 16_384 } = {}) {
  const value = headers[name];
  if (
    (required && value === undefined) ||
    Array.isArray(value) ||
    (value !== undefined && (
      typeof value !== "string" ||
      value.length < 1 ||
      value.length > maximum ||
      /[\r\n\0]/.test(value)
    ))
  ) {
    throw new ApiBoundaryError("misdirected_request", "Request did not arrive through the approved edge");
  }
  return value;
}

async function requestUrl(request, { publicOrigin, verifyEdgeRequest }) {
  if (typeof request.url !== "string" || !request.url.startsWith("/")) {
    throw new ApiBoundaryError("misdirected_request", "Request target is invalid");
  }
  const host = oneHeader(request.headers, "host", { required: true, maximum: 255 });
  const forwardedHost = oneHeader(request.headers, "x-forwarded-host", { maximum: 255 });
  if (
    host !== publicOrigin.host ||
    (forwardedHost !== undefined && forwardedHost !== publicOrigin.host) ||
    oneHeader(request.headers, "x-forwarded-proto", { required: true, maximum: 16 }) !== "https"
  ) {
    throw new ApiBoundaryError("misdirected_request", "Request did not arrive through the approved HTTPS origin");
  }
  if (await verifyEdgeRequest(request) !== true) {
    throw new ApiBoundaryError("misdirected_request", "Request did not arrive through the approved edge");
  }
  return new URL(`${publicOrigin.origin}${request.url}`);
}

async function readBody(request) {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || contentType.split(";", 1)[0].trim() !== "application/json") {
    throw new ApiBoundaryError("unsupported_media_type", "application/json is required");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw new ApiBoundaryError("payload_too_large", "Tenant request exceeds 64 KiB");
    }
    chunks.push(chunk);
  }
  if (bytes === 0) throw new ApiBoundaryError("invalid_json_body", "Tenant request body is required");
  try {
    return parseStrictJson(Buffer.concat(chunks).toString("utf8"), {
      maximumBytes: MAX_BODY_BYTES,
      maximumDepth: 12,
      maximumKeys: 256
    });
  } catch (error) {
    if (error?.name === "DomainError") throw error;
    throw new ApiBoundaryError("invalid_json_body", "Tenant request body is invalid");
  }
}

function securityHeaders(requestId) {
  return {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": requestId
  };
}

function json(response, status, value, requestId, headOnly = false) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    ...securityHeaders(requestId),
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  response.end(headOnly ? undefined : body);
}

function deploymentCapabilityDocument({ publicOrigin, releaseId }) {
  return Object.freeze({
    schemaVersion: "ipo_one_deployment_capability.v1",
    protocol: "IPO.ONE",
    deployment: Object.freeze({
      hostingStatus: "PRODUCTION_HOSTED",
      productProfile: "deployable_sandbox_vertical_slice",
      releaseId
    }),
    interfaces: Object.freeze({
      humanConsole: publicOrigin.origin,
      agentApi: `${publicOrigin.origin}/tenant/v1/operations`,
      openApi: `${publicOrigin.origin}${PRODUCTION_TENANT_ROUTES.agentOpenApi}`
    }),
    realValue: Object.freeze({
      supportStatus: "SUPPORTED_INACTIVE_ZERO_FUNDED",
      activationStatus: "DISABLED",
      realFundsEnabled: false,
      productionFundsMoved: false,
      executionSubmissionEnabled: false,
      humanCashCreditEnabled: false,
      activationRequirements: Object.freeze([
        "approved_provider",
        "approved_chain_and_asset",
        "approved_capital_and_custody",
        "approved_signer_and_mandate",
        "approved_risk_caps_and_loss_bearer",
        "legal_security_operations_and_independent_review",
        "transaction_specific_founder_confirmation"
      ])
    }),
    providers: Object.freeze({
      providerSandbox: "AVAILABLE",
      externalProviderExecution: "DISABLED",
      genericEvmProductionExecution: "BLOCKED_EXTERNAL_DEPENDENCY",
      hyperCoreProductionExecution: "BLOCKED_EXTERNAL_DEPENDENCY",
      unspecifiedProviderExecution: "DISABLED"
    }),
    safety: Object.freeze({
      realFundsEnabled: false,
      externalProviderExecutionEnabled: false,
      productionSignerAuthorityEnabled: false,
      withdrawalAuthorityEnabled: false,
      venueWriteAuthorityEnabled: false,
      syntheticOrRedactedDataOnly: true
    })
  });
}

export function createProductionTenantRequestHandler(input) {
  assertClosedConfig(input);
  const publicOrigin = exactPublicOrigin(input.publicOrigin);
  const port = input.port ?? 8080;
  const requestTimeoutMs = input.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const maximumConcurrency = input.maximumConcurrency ?? MAX_CONCURRENCY;
  if (
    !input.gateway?.execute ||
    !input.humanBff?.authenticateSession ||
    !input.machineAuthenticator?.authenticate ||
    typeof input.createNetworkContext !== "function" ||
    typeof input.csrfTokenProvider !== "function" ||
    (input.localAgentAccountProvider !== undefined &&
      typeof input.localAgentAccountProvider !== "function") ||
    typeof input.readinessCheck !== "function" ||
    typeof input.verifyEdgeRequest !== "function" ||
    (input.serveAuthentication !== undefined && typeof input.serveAuthentication !== "function") ||
    (input.getTrustedMtlsEvidence !== undefined && typeof input.getTrustedMtlsEvidence !== "function") ||
    (input.sessionHandleProvider !== undefined && typeof input.sessionHandleProvider !== "function") ||
    (input.workspaceNameProvider !== undefined && typeof input.workspaceNameProvider !== "function") ||
    !boundedInteger(port, 1_024, 65_535) ||
    !boundedInteger(requestTimeoutMs, 100, REQUEST_TIMEOUT_MS) ||
    !boundedInteger(maximumConcurrency, 1, MAX_CONCURRENCY) ||
    typeof input.releaseId !== "string" ||
    !/^[0-9a-f]{40}$/.test(input.releaseId)
  ) throw invalidConfig();

  const resolveAuthenticationContext = createTenantAuthenticationResolver({
    humanBff: input.humanBff,
    machineAuthenticator: input.machineAuthenticator,
    getTrustedMtlsEvidence: input.getTrustedMtlsEvidence,
    clock: input.clock
  });
  const serveWebAsset = createTenantWebAssetHandler({
    csrfTokenProvider: input.csrfTokenProvider,
    sessionHandleProvider: input.sessionHandleProvider,
    localAgentAccountProvider: input.localAgentAccountProvider,
    workspaceNameProvider: input.workspaceNameProvider
  });
  let active = 0;
  return async function handleProductionTenantRequest(request, response) {
    const requestId = createRequestId(request.headers);
    if (active >= maximumConcurrency) {
      return json(response, 503, createProblemDetails(
        new ApiBoundaryError("server_busy", "Tenant listener is at its concurrency limit"),
        { requestId }
      ), requestId);
    }
    active += 1;
    response.setTimeout(requestTimeoutMs, () => response.destroy());
    try {
      const headOnly = request.method === "HEAD";
      if (
        new Set(["GET", "HEAD"]).has(request.method) &&
        request.url === PRODUCTION_TENANT_ROUTES.live
      ) {
        return json(response, 200, {
          status: "alive",
          releaseId: input.releaseId,
          schemaVersion: "production_liveness.v1"
        }, requestId, headOnly);
      }
      if (
        new Set(["GET", "HEAD"]).has(request.method) &&
        request.url === PRODUCTION_TENANT_ROUTES.ready
      ) {
        let ready = false;
        try {
          ready = await input.readinessCheck() === true;
        } catch {
          ready = false;
        }
        return json(response, ready ? 200 : 503, {
          status: ready ? "ready" : "unavailable",
          releaseId: input.releaseId,
          profile: "closed_non_funds_pilot",
          realFundsEnabled: false,
          schemaVersion: "production_readiness.v1"
        }, requestId, headOnly);
      }
      const url = await requestUrl(request, {
        publicOrigin,
        verifyEdgeRequest: input.verifyEdgeRequest
      });
      if (
        new Set(["GET", "HEAD"]).has(request.method) &&
        url.search === "" &&
        new Set(["/openapi.json", PRODUCTION_TENANT_ROUTES.agentOpenApi]).has(url.pathname)
      ) {
        return json(
          response,
          200,
          url.pathname === PRODUCTION_TENANT_ROUTES.agentOpenApi
            ? createAgentHttpsOpenApiDocument(publicOrigin)
            : createTenantOpenApiDocument(publicOrigin),
          requestId,
          headOnly
        );
      }
      if (
        new Set(["GET", "HEAD"]).has(request.method) &&
        url.search === "" &&
        url.pathname === PRODUCTION_TENANT_ROUTES.deploymentCapability
      ) {
        return json(response, 200, deploymentCapabilityDocument({
          publicOrigin,
          releaseId: input.releaseId
        }), requestId, headOnly);
      }
      if (
        new Set(["GET", "HEAD"]).has(request.method) &&
        url.search === "" &&
        new Set([PRODUCTION_TENANT_ROUTES.ready, PRODUCTION_TENANT_ROUTES.health]).has(url.pathname)
      ) {
        let ready = false;
        try {
          ready = await input.readinessCheck() === true;
        } catch {
          ready = false;
        }
        return json(response, ready ? 200 : 503, {
          status: ready ? "ready" : "unavailable",
          releaseId: input.releaseId,
          profile: "closed_non_funds_pilot",
          realFundsEnabled: false,
          schemaVersion: "production_readiness.v1"
        }, requestId, headOnly);
      }
      if (input.serveAuthentication && await input.serveAuthentication({
        request,
        response,
        url,
        requestId
      })) return;
      if (request.method === "GET" && url.pathname === PRODUCTION_TENANT_ROUTES.catalog) {
        await resolveAuthenticationContext({ request, requestUrl: url.toString() });
        return json(response, 200, TENANT_PROTOCOL_CATALOG, requestId);
      }
      if (
        new Set(["GET", "HEAD"]).has(request.method) &&
        await serveWebAsset({ request, response, pathname: url.pathname, requestId })
      ) return;
      if (request.method !== "POST" || url.pathname !== PRODUCTION_TENANT_ROUTES.operations) {
        throw new ApiBoundaryError("not_found", "Tenant route is not available");
      }
      const protocolRequest = await readBody(request);
      assertTenantProtocolRequest(protocolRequest);
      const [authenticationContext, networkContext] = await Promise.all([
        resolveAuthenticationContext({ request, requestUrl: url.toString() }),
        input.createNetworkContext({ request })
      ]);
      const result = await input.gateway.execute({
        ...protocolRequest,
        authenticationContext,
        networkContext
      });
      return json(response, 200, result, requestId);
    } catch (error) {
      const problem = createProblemDetails(error, { requestId });
      return json(response, problem.status, problem, requestId);
    } finally {
      active -= 1;
    }
  };
}

export function createProductionTenantHost(input) {
  const handleRequest = createProductionTenantRequestHandler(input);
  const port = input.port ?? 8080;
  let listeningPort = port;
  const server = createServer(handleRequest);

  return Object.freeze({
    server,
    handleRequest,
    async listen() {
      if (server.listening) throw new DomainError("tenant_transport_already_started", "Tenant listener is already active");
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "0.0.0.0", () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === "string" || address.address !== "0.0.0.0") {
        await new Promise((resolve) => server.close(resolve));
        throw new DomainError("unsafe_tenant_transport_bind", "Production Tenant listener did not bind to the approved container interface");
      }
      listeningPort = address.port;
      return Object.freeze({ host: address.address, port: listeningPort });
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
}
