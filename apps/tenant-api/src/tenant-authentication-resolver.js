import {
  SESSION_COOKIE_NAME,
  assertAuthenticationContext
} from "../../../modules/authentication/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

function parseCookies(header) {
  if (header === undefined) return new Map();
  if (typeof header !== "string" || header.length > 8_192 || /[\r\n\0]/.test(header)) {
    throw new DomainError("authentication_input_rejected", "Cookie header is invalid");
  }
  const cookies = new Map();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(name) || value.length > 4_096 || cookies.has(name)) {
      throw new DomainError("authentication_input_rejected", "Cookie header is invalid");
    }
    cookies.set(name, value);
  }
  return cookies;
}

function oneHeader(headers, name, { maximum = 16_384 } = {}) {
  const value = headers[name];
  if (value === undefined) return undefined;
  if (Array.isArray(value) || typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new DomainError("authentication_input_rejected", `${name} header is invalid`);
  }
  return value;
}

export function createTenantAuthenticationResolver({
  humanBff,
  machineAuthenticator,
  getTrustedMtlsEvidence,
  clock = () => new Date()
}) {
  if (
    !humanBff?.authenticateSession ||
    !machineAuthenticator?.authenticate ||
    (getTrustedMtlsEvidence !== undefined && typeof getTrustedMtlsEvidence !== "function") ||
    typeof clock !== "function"
  ) {
    throw new DomainError("invalid_tenant_transport_config", "Tenant authentication adapters are required");
  }
  return async function resolveAuthenticationContext({ request, requestUrl }) {
    const now = clock();
    const cookies = parseCookies(request.headers.cookie);
    const sessionHandle = cookies.get(SESSION_COOKIE_NAME);
    const authorization = oneHeader(request.headers, "authorization");
    if ((sessionHandle && authorization) || (!sessionHandle && !authorization)) {
      throw new DomainError("authentication_required", "Exactly one approved authentication method is required");
    }
    if (sessionHandle) {
      return assertAuthenticationContext(await humanBff.authenticateSession({
        sessionHandle,
        requestMethod: request.method,
        requestOrigin: oneHeader(request.headers, "origin", { maximum: 2_048 }),
        csrfToken: oneHeader(request.headers, "x-csrf-token", { maximum: 256 }),
        now
      }));
    }
    if (!authorization.startsWith("Bearer ") || authorization.length <= 7) {
      throw new DomainError("authentication_required", "Workload bearer authentication is required");
    }
    const dpopProof = oneHeader(request.headers, "dpop");
    const mtlsEvidence = getTrustedMtlsEvidence?.(request);
    return assertAuthenticationContext(await machineAuthenticator.authenticate({
      accessToken: authorization.slice(7),
      dpopProof,
      mtlsEvidence,
      requestMethod: request.method,
      requestUrl,
      now
    }));
  };
}
