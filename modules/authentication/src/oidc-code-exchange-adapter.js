import { parseStrictJson } from "./strict-json.js";
import {
  assertBoundedString,
  authenticationError
} from "./security-utils.js";

const TOKEN_RESPONSE_FIELDS = new Set([
  "access_token",
  "expires_in",
  "id_token",
  "scope",
  "token_type"
]);
const CLIENT_AUTHENTICATION_METHODS = new Set(["client_secret_basic", "client_secret_post"]);
const MAX_RESPONSE_BYTES = 32 * 1024;

function exactHttpsEndpoint(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_configuration", "OIDC token endpoint is invalid");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw authenticationError("invalid_authentication_configuration", "OIDC token endpoint is invalid");
  }
  return parsed.href;
}

function basicAuthorization(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64")}`;
}

export function createOidcCodeExchangeAdapter({
  tokenEndpoint,
  clientSecretProvider,
  clientAuthenticationMethod = "client_secret_post",
  fetchImpl = globalThis.fetch,
  timeoutMs = 5_000
}) {
  const endpoint = exactHttpsEndpoint(tokenEndpoint);
  if (
    typeof clientSecretProvider !== "function" ||
    typeof fetchImpl !== "function" ||
    !CLIENT_AUTHENTICATION_METHODS.has(clientAuthenticationMethod) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 10_000
  ) {
    throw authenticationError("invalid_authentication_configuration", "OIDC code exchange configuration is invalid");
  }

  return Object.freeze({
    async exchangeAuthorizationCode(input) {
      const clientId = assertBoundedString("clientId", input.clientId, { maximum: 256 });
      const clientSecret = assertBoundedString(
        "OIDC client credential",
        await clientSecretProvider(),
        { minimum: 8, maximum: 1_024 }
      );
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: assertBoundedString("authorization code", input.code, { maximum: 4_096 }),
        code_verifier: assertBoundedString("code verifier", input.codeVerifier, { minimum: 43, maximum: 128 }),
        redirect_uri: exactHttpsEndpoint(input.redirectUri),
        client_id: clientId
      });
      const headers = {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      };
      if (clientAuthenticationMethod === "client_secret_post") {
        body.set("client_secret", clientSecret);
      } else {
        headers.authorization = basicAuthorization(clientId, clientSecret);
      }

      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers,
          body,
          redirect: "error",
          signal
        });
      } catch {
        throw authenticationError("oidc_code_exchange_rejected", "authorization code exchange failed");
      }
      const contentType = response.headers?.get?.("content-type")?.split(";", 1)[0]?.trim();
      const contentLength = Number(response.headers?.get?.("content-length") ?? 0);
      if (
        !response.ok ||
        contentType !== "application/json" ||
        (contentLength > 0 && contentLength > MAX_RESPONSE_BYTES)
      ) {
        throw authenticationError("oidc_code_exchange_rejected", "authorization code exchange failed");
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_RESPONSE_BYTES) {
        throw authenticationError("oidc_token_response_rejected", "OIDC token response is invalid");
      }
      const payload = parseStrictJson(bytes.toString("utf8"), {
        maximumBytes: MAX_RESPONSE_BYTES,
        maximumDepth: 4,
        maximumKeys: 16
      });
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.keys(payload).some((key) => !TOKEN_RESPONSE_FIELDS.has(key))
      ) {
        throw authenticationError("oidc_token_response_rejected", "OIDC token response is invalid");
      }
      return Object.freeze({
        idToken: assertBoundedString("ID token", payload.id_token, { maximum: 16_384 })
      });
    }
  });
}
