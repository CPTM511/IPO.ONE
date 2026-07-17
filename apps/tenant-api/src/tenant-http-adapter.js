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

export const TENANT_HTTP_HOST = "127.0.0.1";
export const TENANT_HTTP_ROUTES = Object.freeze({
  operations: "/tenant/v1/operations",
  catalog: "/tenant/v1/catalog",
  health: "/tenant/v1/healthz"
});

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CONCURRENCY = 32;
const REQUEST_TIMEOUT_MS = 30_000;

function assertConfig({ host, trustProxy, environment, credentialSource }) {
  if (
    host !== TENANT_HTTP_HOST ||
    trustProxy !== false ||
    environment === "production" ||
    !new Set(["test", "development"]).has(environment) ||
    credentialSource !== "local_test"
  ) {
    throw new DomainError(
      "unsafe_tenant_transport_config",
      "Authenticated Tenant HTTP is restricted to the loopback test profile"
    );
  }
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

function json(response, status, value, requestId) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId
  });
  response.end(body);
}

function requestUrl(request, port) {
  const host = request.headers.host;
  const expected = `${TENANT_HTTP_HOST}:${port}`;
  if (host !== expected || typeof request.url !== "string" || !request.url.startsWith("/")) {
    throw new ApiBoundaryError("misdirected_request", "Tenant request target is not the loopback listener");
  }
  return `http://${expected}${request.url}`;
}

export function createTenantHttpServer({
  gateway,
  resolveAuthenticationContext,
  createNetworkContext,
  host = TENANT_HTTP_HOST,
  port = 0,
  trustProxy = false,
  environment = "test",
  credentialSource = "local_test",
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  maximumConcurrency = MAX_CONCURRENCY,
  serveWebAsset
}) {
  assertConfig({ host, trustProxy, environment, credentialSource });
  if (
    !gateway?.execute ||
    typeof resolveAuthenticationContext !== "function" ||
    typeof createNetworkContext !== "function" ||
    !Number.isSafeInteger(port) || port < 0 || port > 65_535 ||
    !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > REQUEST_TIMEOUT_MS ||
    !Number.isSafeInteger(maximumConcurrency) || maximumConcurrency < 1 || maximumConcurrency > MAX_CONCURRENCY ||
    (serveWebAsset !== undefined && typeof serveWebAsset !== "function")
  ) {
    throw new DomainError("invalid_tenant_transport_config", "Tenant HTTP adapter configuration is invalid");
  }
  let active = 0;
  let listeningPort;
  const server = createServer(async (request, response) => {
    const requestId = createRequestId(request.headers);
    if (active >= maximumConcurrency) {
      const error = new ApiBoundaryError("server_busy", "Tenant listener is at its concurrency limit");
      return json(response, error.status, createProblemDetails(error, { requestId }), requestId);
    }
    active += 1;
    response.setTimeout(requestTimeoutMs, () => response.destroy());
    try {
      const url = new URL(requestUrl(request, listeningPort));
      if (request.method === "GET" && url.pathname === TENANT_HTTP_ROUTES.health) {
        return json(response, 200, {
          status: "ready",
          transport: "authenticated_http_loopback",
          public: false,
          schemaVersion: "tenant_transport_health.v1"
        }, requestId);
      }
      if (request.method === "GET" && url.pathname === TENANT_HTTP_ROUTES.catalog) {
        await resolveAuthenticationContext({
          request,
          requestUrl: url.toString()
        });
        return json(response, 200, TENANT_PROTOCOL_CATALOG, requestId);
      }
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        serveWebAsset &&
        await serveWebAsset({ request, response, pathname: url.pathname, requestId })
      ) {
        return;
      }
      if (request.method !== "POST" || url.pathname !== TENANT_HTTP_ROUTES.operations) {
        throw new ApiBoundaryError("not_found", "Tenant route is not available");
      }
      const protocolRequest = await readBody(request);
      assertTenantProtocolRequest(protocolRequest);
      const [authenticationContext, networkContext] = await Promise.all([
        resolveAuthenticationContext({ request, requestUrl: url.toString() }),
        createNetworkContext({ request })
      ]);
      const result = await gateway.execute({
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
  });

  return Object.freeze({
    server,
    async listen() {
      if (server.listening) throw new DomainError("tenant_transport_already_started", "Tenant HTTP listener is already active");
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === "string" || address.address !== host) {
        await new Promise((resolve) => server.close(resolve));
        throw new DomainError("unsafe_tenant_transport_bind", "Tenant HTTP listener did not bind to loopback");
      }
      listeningPort = address.port;
      return Object.freeze({ host, port: listeningPort });
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
}
