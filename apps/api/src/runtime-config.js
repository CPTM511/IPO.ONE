const NODE_ENVIRONMENTS = new Set(["development", "test", "production"]);
const DEPLOYMENT_MODES = new Set(["local_sandbox", "public_sandbox"]);
const PUBLIC_SANDBOX_ACKNOWLEDGEMENT = "I_UNDERSTAND_NO_REAL_FUNDS";
const SAFE_RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function configurationError(message) {
  const error = new Error(message);
  error.name = "RuntimeConfigurationError";
  return error;
}

function boundedInteger(name, value, { minimum, maximum }) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw configurationError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return parsed;
}

function strictBoolean(name, value, fallback = false) {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw configurationError(`${name} must be true or false`);
}

function normalizedHostname(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 253) return undefined;
  if (/[/\\?#\s]/.test(value) || value.endsWith(":")) return undefined;
  try {
    const parsed = new URL(`http://${value}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return undefined;
    }
    const hostname = parsed.hostname.toLowerCase();
    return hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  } catch {
    return undefined;
  }
}

function publicOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw configurationError("IPO_ONE_PUBLIC_ORIGIN must be an absolute HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw configurationError("IPO_ONE_PUBLIC_ORIGIN must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw configurationError("IPO_ONE_PUBLIC_ORIGIN must contain only scheme and authority");
  }
  return parsed.origin;
}

function securityContact(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw configurationError("IPO_ONE_SECURITY_CONTACT must be an absolute HTTPS URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw configurationError("IPO_ONE_SECURITY_CONTACT must be a credential-free HTTPS URL");
  }
  return parsed.href;
}

function allowedHosts(value, originHostname, production) {
  const configured = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const hosts = new Set(production ? [] : ["127.0.0.1", "localhost", "::1"]);
  for (const entry of configured) {
    if (entry === "*" || entry.includes("/")) {
      throw configurationError("IPO_ONE_ALLOWED_HOSTS must contain explicit hostnames, never wildcards or paths");
    }
    const normalized = normalizedHostname(entry);
    if (!normalized) throw configurationError("IPO_ONE_ALLOWED_HOSTS contains an invalid host");
    hosts.add(normalized);
  }
  hosts.add(originHostname);
  return Object.freeze([...hosts].sort());
}

export function loadRuntimeConfig(environment = process.env) {
  const nodeEnvironment = environment.NODE_ENV ?? "development";
  if (!NODE_ENVIRONMENTS.has(nodeEnvironment)) {
    throw configurationError("NODE_ENV must be development, test, or production");
  }
  const production = nodeEnvironment === "production";
  const deploymentMode = environment.IPO_ONE_DEPLOYMENT_MODE ?? (production ? undefined : "local_sandbox");
  if (!DEPLOYMENT_MODES.has(deploymentMode)) {
    throw configurationError("IPO_ONE_DEPLOYMENT_MODE must be local_sandbox or public_sandbox");
  }

  const port = boundedInteger("PORT", environment.PORT ?? 3000, { minimum: 1, maximum: 65535 });
  const host = environment.HOST ?? (production ? "0.0.0.0" : "127.0.0.1");
  const origin = publicOrigin(
    environment.IPO_ONE_PUBLIC_ORIGIN ?? `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`
  );
  const originHostname = new URL(origin).hostname.toLowerCase();
  const trustProxy = strictBoolean("IPO_ONE_TRUST_PROXY", environment.IPO_ONE_TRUST_PROXY, false);
  const hstsMaxAge = boundedInteger("IPO_ONE_HSTS_MAX_AGE", environment.IPO_ONE_HSTS_MAX_AGE ?? 0, {
    minimum: 0,
    maximum: 63_072_000
  });
  const release = environment.IPO_ONE_RELEASE_SHA ?? environment.K_REVISION ?? "local";
  if (!SAFE_RELEASE_PATTERN.test(release)) {
    throw configurationError("IPO_ONE_RELEASE_SHA must be a bounded safe release identifier");
  }
  const contact = securityContact(
    environment.IPO_ONE_SECURITY_CONTACT ?? "https://github.com/CPTM511/IPO.ONE/security"
  );
  const hosts = allowedHosts(environment.IPO_ONE_ALLOWED_HOSTS, originHostname, production);

  if (production) {
    if (deploymentMode !== "public_sandbox") {
      throw configurationError("production currently supports only the explicitly bounded public_sandbox mode");
    }
    if (environment.IPO_ONE_PUBLIC_SANDBOX_ACK !== PUBLIC_SANDBOX_ACKNOWLEDGEMENT) {
      throw configurationError("production public sandbox acknowledgement is missing");
    }
    if (new URL(origin).protocol !== "https:") {
      throw configurationError("production IPO_ONE_PUBLIC_ORIGIN must use HTTPS");
    }
    if (host !== "0.0.0.0") {
      throw configurationError("production HOST must be 0.0.0.0 for the managed container ingress contract");
    }
    if (!trustProxy) {
      throw configurationError("production requires IPO_ONE_TRUST_PROXY=true behind the approved HTTPS load balancer");
    }
    if (hstsMaxAge < 86_400) {
      throw configurationError("production requires IPO_ONE_HSTS_MAX_AGE of at least 86400 seconds");
    }
  }

  return Object.freeze({
    allowedHosts: hosts,
    deploymentMode,
    hstsMaxAge,
    host,
    nodeEnvironment,
    port,
    production,
    publicOrigin: origin,
    release,
    securityContact: contact,
    trustProxy
  });
}

export function requestHostname(hostHeader) {
  if (Array.isArray(hostHeader)) return undefined;
  return normalizedHostname(hostHeader);
}

export function requestUsesHttps(headers, config) {
  if (!config.trustProxy) return false;
  const supplied = Array.isArray(headers["x-forwarded-proto"])
    ? headers["x-forwarded-proto"][0]
    : headers["x-forwarded-proto"];
  if (typeof supplied !== "string") return false;
  const values = supplied.split(",").map((value) => value.trim().toLowerCase());
  return values.length > 0 && values.every((value) => value === "https");
}

export function isAllowedRequestHost(hostHeader, config, { operational = false } = {}) {
  const hostname = requestHostname(hostHeader);
  if (!hostname) return false;
  if (operational && new Set(["127.0.0.1", "localhost", "::1"]).has(hostname)) return true;
  return config.allowedHosts.includes(hostname);
}

export { PUBLIC_SANDBOX_ACKNOWLEDGEMENT };
