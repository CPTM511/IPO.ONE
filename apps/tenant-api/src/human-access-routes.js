import {
  SESSION_COOKIE_NAME,
  TRANSACTION_COOKIE_NAME,
  assertBoundedString,
  assertSafeIdentifier
} from "../../../modules/authentication/src/index.js";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import { ApiBoundaryError } from "../../../packages/api-contract/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

export const HUMAN_ACCESS_ROUTES = Object.freeze({
  options: "/auth/v1/options",
  login: "/auth/v1/login",
  callback: "/auth/v1/callback",
  walletChallenge: "/auth/v1/wallet/challenge",
  walletVerify: "/auth/v1/wallet/verify",
  logout: "/auth/v1/logout"
});

const CONFIG_KEYS = new Set([
  "browserOrigin",
  "clock",
  "humanSessionBff",
  "oidcProviders",
  "postLoginPath",
  "profile",
  "walletBff"
]);
const PROVIDER_CONFIG_KEYS = new Set(["bff", "redirectUri"]);
const MAX_AUTH_BODY_BYTES = 8 * 1024;
const SUPPORTED_CHAINS = Object.freeze(["eip155:84532", "eip155:1952"]);

function assertPlainObject(name, value, allowedKeys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new DomainError("invalid_human_access_config", `${name} is invalid`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set) ||
    Object.keys(descriptors).some((key) => !allowedKeys.has(key))
  ) {
    throw new DomainError("invalid_human_access_config", `${name} is invalid`);
  }
}

function exactBrowserOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new DomainError("invalid_human_access_config", "browserOrigin is invalid");
  }
  const loopbackDevelopment =
    parsed.protocol === "http:" &&
    parsed.hostname === "127.0.0.1" &&
    parsed.port !== "";
  if (
    (parsed.protocol !== "https:" && !loopbackDevelopment) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new DomainError("invalid_human_access_config", "browserOrigin is invalid");
  }
  return parsed.origin;
}

function exactRedirectUri(value, providerId) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new DomainError("invalid_human_access_config", "OIDC redirect URI is invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.pathname !== HUMAN_ACCESS_ROUTES.callback ||
    parsed.searchParams.size !== 1 ||
    parsed.searchParams.getAll("provider").length !== 1 ||
    parsed.searchParams.get("provider") !== providerId
  ) {
    throw new DomainError("invalid_human_access_config", "OIDC redirect URI is invalid");
  }
  return parsed.href;
}

function exactPostLoginPath(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\r\n\\]/.test(value)
  ) {
    throw new DomainError("invalid_human_access_config", "post-login path is invalid");
  }
  return value;
}

function parseCookies(header) {
  if (header === undefined) return new Map();
  if (typeof header !== "string" || header.length > 8_192 || /[\r\n\0]/.test(header)) {
    throw new ApiBoundaryError("authentication_input_rejected", "Cookie header is invalid");
  }
  const cookies = new Map();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (
      !/^[A-Za-z0-9_.-]{1,128}$/.test(name) ||
      value.length > 4_096 ||
      cookies.has(name)
    ) {
      throw new ApiBoundaryError("authentication_input_rejected", "Cookie header is invalid");
    }
    cookies.set(name, value);
  }
  return cookies;
}

function oneHeader(headers, name, { required = false, maximum = 2_048 } = {}) {
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
    throw new ApiBoundaryError("authentication_input_rejected", `${name} header is invalid`);
  }
  return value;
}

function requireOrigin(request, browserOrigin) {
  if (oneHeader(request.headers, "origin", { required: true }) !== browserOrigin) {
    throw new ApiBoundaryError("csrf_origin_rejected", "request origin is not allowed", {
      status: 403
    });
  }
}

function exactQuery(url, requiredKeys) {
  const allowed = new Set(requiredKeys);
  if (
    url.search.length > 8_192 ||
    [...url.searchParams.keys()].some((key) => !allowed.has(key)) ||
    requiredKeys.some((key) => url.searchParams.getAll(key).length !== 1)
  ) {
    throw new ApiBoundaryError("authentication_input_rejected", "authentication query is invalid");
  }
  return Object.fromEntries(requiredKeys.map((key) => [
    key,
    assertBoundedString(key, url.searchParams.get(key), { maximum: 4_096 })
  ]));
}

async function readStrictBody(request, requiredKeys) {
  const contentType = oneHeader(request.headers, "content-type", { required: true, maximum: 256 });
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ApiBoundaryError("unsupported_media_type", "application/json is required");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_AUTH_BODY_BYTES) {
      throw new ApiBoundaryError("payload_too_large", "authentication request exceeds 8 KiB");
    }
    chunks.push(chunk);
  }
  if (bytes === 0) {
    throw new ApiBoundaryError("invalid_json_body", "authentication request body is required");
  }
  let value;
  try {
    value = parseStrictJson(Buffer.concat(chunks).toString("utf8"), {
      maximumBytes: MAX_AUTH_BODY_BYTES,
      maximumDepth: 3,
      maximumKeys: 8
    });
  } catch {
    throw new ApiBoundaryError("invalid_json_body", "authentication request body is invalid");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== requiredKeys.length ||
    requiredKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new ApiBoundaryError("invalid_json_body", "authentication request body is invalid");
  }
  return value;
}

function serializeCookie(cookie) {
  if (
    !cookie ||
    typeof cookie !== "object" ||
    Array.isArray(cookie) ||
    !new Set([SESSION_COOKIE_NAME, TRANSACTION_COOKIE_NAME]).has(cookie.name) ||
    typeof cookie.value !== "string" ||
    cookie.value.length > 4_096 ||
    /[;\r\n\0]/.test(cookie.value) ||
    cookie.path !== "/" ||
    cookie.domain !== undefined ||
    cookie.secure !== true ||
    cookie.httpOnly !== true ||
    (
      (cookie.name === SESSION_COOKIE_NAME && cookie.sameSite !== "Strict") ||
      (cookie.name === TRANSACTION_COOKIE_NAME && cookie.sameSite !== "Lax")
    )
  ) {
    throw new DomainError("invalid_authentication_cookie", "authentication cookie is invalid");
  }
  const parts = [
    `${cookie.name}=${cookie.value}`,
    "Path=/",
    "Secure",
    "HttpOnly",
    `SameSite=${cookie.sameSite}`
  ];
  if (cookie.maxAge !== undefined) {
    if (!Number.isSafeInteger(cookie.maxAge) || cookie.maxAge < 0 || cookie.maxAge > 86_400) {
      throw new DomainError("invalid_authentication_cookie", "authentication cookie is invalid");
    }
    parts.push(`Max-Age=${cookie.maxAge}`);
  }
  if (cookie.expiresAt !== undefined) {
    const expiresAt = new Date(cookie.expiresAt);
    if (!Number.isFinite(expiresAt.getTime())) {
      throw new DomainError("invalid_authentication_cookie", "authentication cookie is invalid");
    }
    parts.push(`Expires=${expiresAt.toUTCString()}`);
  }
  return parts.join("; ");
}

function responseHeaders(requestId, extra = {}) {
  return {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": requestId,
    ...extra
  };
}

function sendJson(response, status, value, requestId, extraHeaders = {}, headOnly = false) {
  const body = JSON.stringify(value);
  response.writeHead(status, responseHeaders(requestId, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    ...extraHeaders
  }));
  response.end(headOnly ? undefined : body);
}

function redirect(response, location, requestId, cookies = []) {
  if (
    typeof location !== "string" ||
    location.length < 1 ||
    location.length > 4_096 ||
    /[\r\n\0]/.test(location)
  ) {
    throw new DomainError("invalid_authentication_redirect", "authentication redirect is invalid");
  }
  response.writeHead(303, responseHeaders(requestId, {
    location,
    "content-length": "0",
    ...(cookies.length === 0 ? {} : { "set-cookie": cookies.map(serializeCookie) })
  }));
  response.end();
}

function normalizeProviders(input) {
  assertPlainObject("oidcProviders", input, new Set(Object.keys(input)));
  const entries = Object.entries(input);
  if (entries.length > 8) {
    throw new DomainError("invalid_human_access_config", "oidcProviders is invalid");
  }
  return new Map(entries.map(([providerId, config]) => {
    const checkedProviderId = assertSafeIdentifier("providerId", providerId);
    assertPlainObject("OIDC provider", config, PROVIDER_CONFIG_KEYS);
    if (
      !config.bff?.beginLogin ||
      !config.bff?.completeLogin ||
      config.bff.providerId !== checkedProviderId
    ) {
      throw new DomainError("invalid_human_access_config", "OIDC provider is invalid");
    }
    return [checkedProviderId, Object.freeze({
      bff: config.bff,
      redirectUri: exactRedirectUri(config.redirectUri, checkedProviderId)
    })];
  }));
}

export function createHumanAccessRouteHandler(input) {
  assertPlainObject("Human access configuration", input, CONFIG_KEYS);
  const {
    humanSessionBff,
    oidcProviders = {},
    walletBff,
    clock = () => new Date(),
    profile = "closed_non_funds_pilot",
    postLoginPath = "/#human"
  } = input;
  const browserOrigin = exactBrowserOrigin(input.browserOrigin);
  const providers = normalizeProviders(oidcProviders);
  if (
    !humanSessionBff?.authenticateSession ||
    !humanSessionBff?.logout ||
    (walletBff !== undefined && (!walletBff?.beginLogin || !walletBff?.completeLogin)) ||
    typeof clock !== "function"
  ) {
    throw new DomainError("invalid_human_access_config", "Human access adapters are required");
  }
  const checkedProfile = assertSafeIdentifier("profile", profile);
  const successPath = exactPostLoginPath(postLoginPath);

  async function sessionActive(request, now) {
    const sessionHandle = parseCookies(request.headers.cookie).get(SESSION_COOKIE_NAME);
    if (!sessionHandle) return false;
    try {
      await humanSessionBff.authenticateSession({
        sessionHandle,
        requestMethod: "GET",
        requestOrigin: undefined,
        csrfToken: undefined,
        now
      });
      return true;
    } catch {
      return false;
    }
  }

  return async function serveHumanAccess({ request, response, url, requestId }) {
    if (!url.pathname.startsWith("/auth/v1/")) return false;
    const now = clock();

    if (url.pathname === HUMAN_ACCESS_ROUTES.options) {
      if (!new Set(["GET", "HEAD"]).has(request.method)) {
        throw new ApiBoundaryError("method_not_allowed", "Only GET and HEAD are available", {
          status: 405,
          headers: { allow: "GET, HEAD" }
        });
      }
      if (url.search !== "") {
        throw new ApiBoundaryError("authentication_input_rejected", "authentication query is invalid");
      }
      sendJson(response, 200, {
        schemaVersion: "ipo_one_authentication_options.v1",
        profile: checkedProfile,
        enabled: providers.size > 0 || walletBff !== undefined,
        sessionActive: await sessionActive(request, now),
        oidcProviders: [...providers.keys()],
        walletAuthentication: walletBff !== undefined,
        supportedChains: SUPPORTED_CHAINS,
        boundary: "Authentication proves presence; internal policy and Mandates separately decide authority."
      }, requestId, {}, request.method === "HEAD");
      return true;
    }

    if (request.method === "GET" && url.pathname === HUMAN_ACCESS_ROUTES.login) {
      const { provider } = exactQuery(url, ["provider"]);
      const config = providers.get(provider);
      if (!config) {
        throw new ApiBoundaryError("authentication_provider_rejected", "authentication provider is not available");
      }
      const login = config.bff.beginLogin({ redirectUri: config.redirectUri, now });
      redirect(response, login.authorizationUrl, requestId, [login.transactionCookie]);
      return true;
    }

    if (request.method === "GET" && url.pathname === HUMAN_ACCESS_ROUTES.callback) {
      const { provider, code, state } = exactQuery(url, ["provider", "code", "state"]);
      const config = providers.get(provider);
      if (!config) {
        throw new ApiBoundaryError("authentication_provider_rejected", "authentication provider is not available");
      }
      const transactionHandle = parseCookies(request.headers.cookie).get(TRANSACTION_COOKIE_NAME);
      if (!transactionHandle) {
        throw new ApiBoundaryError("oidc_transaction_rejected", "login transaction is not active");
      }
      const issued = await config.bff.completeLogin({
        transactionHandle,
        state,
        code,
        redirectUri: config.redirectUri,
        now
      });
      redirect(response, successPath, requestId, [issued.cookie, issued.clearTransactionCookie]);
      return true;
    }

    if (request.method === "POST" && url.pathname === HUMAN_ACCESS_ROUTES.walletChallenge) {
      if (!walletBff) {
        throw new ApiBoundaryError("authentication_provider_rejected", "wallet authentication is not available");
      }
      requireOrigin(request, browserOrigin);
      const body = await readStrictBody(request, ["address", "chainId"]);
      const challenge = await walletBff.beginLogin({
        address: body.address,
        chainId: body.chainId,
        now
      });
      sendJson(response, 201, {
        schemaVersion: "ipo_one_wallet_challenge.v1",
        handle: challenge.handle,
        message: challenge.message,
        expiresAt: challenge.expiresAt
      }, requestId);
      return true;
    }

    if (request.method === "POST" && url.pathname === HUMAN_ACCESS_ROUTES.walletVerify) {
      if (!walletBff) {
        throw new ApiBoundaryError("authentication_provider_rejected", "wallet authentication is not available");
      }
      requireOrigin(request, browserOrigin);
      const body = await readStrictBody(request, ["transactionHandle", "signature"]);
      const issued = await walletBff.completeLogin({
        transactionHandle: body.transactionHandle,
        signature: body.signature,
        now
      });
      sendJson(response, 200, {
        schemaVersion: "ipo_one_authentication_result.v1",
        status: "authenticated",
        authenticationMethod: "siwe"
      }, requestId, { "set-cookie": serializeCookie(issued.cookie) });
      return true;
    }

    if (request.method === "POST" && url.pathname === HUMAN_ACCESS_ROUTES.logout) {
      requireOrigin(request, browserOrigin);
      if (url.search !== "") {
        throw new ApiBoundaryError("authentication_input_rejected", "authentication query is invalid");
      }
      const cookies = parseCookies(request.headers.cookie);
      const sessionHandle = cookies.get(SESSION_COOKIE_NAME);
      if (!sessionHandle) {
        throw new ApiBoundaryError("authentication_required", "Human session is required");
      }
      await humanSessionBff.authenticateSession({
        sessionHandle,
        requestMethod: "POST",
        requestOrigin: oneHeader(request.headers, "origin", { required: true }),
        csrfToken: oneHeader(request.headers, "x-csrf-token", { required: true, maximum: 256 }),
        now
      });
      const result = humanSessionBff.logout({ sessionHandle, now });
      sendJson(response, 200, {
        schemaVersion: "ipo_one_logout_result.v1",
        status: result.revoked ? "logged_out" : "already_inactive"
      }, requestId, { "set-cookie": serializeCookie(result.clearSessionCookie) });
      return true;
    }

    throw new ApiBoundaryError("not_found", "authentication route is not available");
  };
}
