import { timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE_NAME } from "../../../modules/authentication/src/index.js";
import { ApiBoundaryError } from "../../../packages/api-contract/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import {
  HUMAN_ACCESS_ROUTES,
  readHumanAccessCookie
} from "../../tenant-api/src/index.js";

const SUPPORTED_CHAINS = Object.freeze(["eip155:84532", "eip155:1952"]);
const SESSION_HANDLE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function sameLocalSecret(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes);
}

function localAuthenticationHeaders(requestId, bodyLength, setCookie) {
  return {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "content-length": bodyLength,
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    ...(setCookie === undefined ? {} : { "set-cookie": setCookie }),
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": requestId
  };
}

export function createLocalAuthenticationOptions({
  sessionHandle,
  csrfToken,
  origin
}) {
  if (!SESSION_HANDLE_PATTERN.test(sessionHandle ?? "")) {
    throw new DomainError(
      "invalid_private_pilot_session",
      "Private pilot authentication options require a valid local session"
    );
  }
  return async function serveLocalAuthenticationOptions({
    request,
    response,
    url,
    requestId
  }) {
    if (
      !new Set([HUMAN_ACCESS_ROUTES.options, HUMAN_ACCESS_ROUTES.logout])
        .has(url.pathname)
    ) return false;
    if (url.search !== "") {
      throw new ApiBoundaryError(
        "authentication_input_rejected",
        "authentication query is invalid"
      );
    }

    if (url.pathname === HUMAN_ACCESS_ROUTES.logout) {
      if (request.method !== "POST") {
        throw new ApiBoundaryError(
          "method_not_allowed",
          "Only POST is available",
          { status: 405, headers: { allow: "POST" } }
        );
      }
      const presentedSession = readHumanAccessCookie(
        request.headers.cookie,
        SESSION_COOKIE_NAME
      );
      if (!sameLocalSecret(presentedSession, sessionHandle)) {
        throw new DomainError(
          "authentication_required",
          "Private pilot session is not active"
        );
      }
      if (
        !sameLocalSecret(request.headers["x-csrf-token"], csrfToken) ||
        request.headers.origin !== origin
      ) {
        throw new DomainError(
          "csrf_token_rejected",
          "Private pilot request origin or CSRF token is invalid"
        );
      }
      const body = JSON.stringify({
        schemaVersion: "ipo_one_logout_result.v1",
        status: "logged_out"
      });
      response.writeHead(200, localAuthenticationHeaders(
        requestId,
        Buffer.byteLength(body),
        `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
      ));
      response.end(body);
      return true;
    }

    if (!new Set(["GET", "HEAD"]).has(request.method)) {
      throw new ApiBoundaryError(
        "method_not_allowed",
        "Only GET and HEAD are available",
        { status: 405, headers: { allow: "GET, HEAD" } }
      );
    }
    const body = JSON.stringify({
      schemaVersion: "ipo_one_authentication_options.v1",
      profile: "local_no_funds",
      enabled: false,
      sessionActive: sameLocalSecret(
        readHumanAccessCookie(request.headers.cookie, SESSION_COOKIE_NAME),
        sessionHandle
      ),
      oidcProviders: [],
      walletAuthentication: false,
      supportedChains: SUPPORTED_CHAINS,
      boundary:
        "Local synthetic authentication proves presence; policy and Mandates separately decide authority."
    });
    response.writeHead(
      200,
      localAuthenticationHeaders(requestId, Buffer.byteLength(body))
    );
    response.end(request.method === "HEAD" ? undefined : body);
    return true;
  };
}
