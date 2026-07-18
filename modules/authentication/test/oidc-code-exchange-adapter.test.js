import assert from "node:assert/strict";
import test from "node:test";
import { createOidcCodeExchangeAdapter } from "../src/index.js";

test("OIDC exchange sends PKCE and returns only the ID token", async () => {
  let captured;
  const adapter = createOidcCodeExchangeAdapter({
    tokenEndpoint: "https://oauth.example/token",
    clientSecretProvider: async () => "closed-pilot-client-secret",
    fetchImpl: async (url, init) => {
      captured = { url, init };
      const body = JSON.stringify({
        access_token: "discarded-access-token",
        expires_in: 3600,
        scope: "openid",
        token_type: "Bearer",
        id_token: "header.payload.signature"
      });
      return {
        ok: true,
        headers: {
          get(name) {
            if (name === "content-type") return "application/json; charset=utf-8";
            if (name === "content-length") return String(Buffer.byteLength(body));
            return null;
          }
        },
        arrayBuffer: async () => Buffer.from(body)
      };
    }
  });
  const result = await adapter.exchangeAuthorizationCode({
    code: "authorization-code",
    codeVerifier: "v".repeat(48),
    redirectUri: "https://ipo.one/auth/callback",
    clientId: "ipo_one_human_console"
  });
  assert.deepEqual(result, { idToken: "header.payload.signature" });
  assert.equal(captured.url, "https://oauth.example/token");
  assert.equal(captured.init.redirect, "error");
  assert.equal(captured.init.body.get("grant_type"), "authorization_code");
  assert.equal(captured.init.body.get("code_verifier"), "v".repeat(48));
  assert.equal(captured.init.body.get("client_secret"), "closed-pilot-client-secret");
  assert.equal(JSON.stringify(result).includes("discarded-access-token"), false);
  assert.equal(JSON.stringify(result).includes("closed-pilot-client-secret"), false);
});

test("OIDC exchange rejects redirects, non-JSON, oversized, and open token responses", async () => {
  const create = (response) => createOidcCodeExchangeAdapter({
    tokenEndpoint: "https://oauth.example/token",
    clientSecretProvider: async () => "closed-pilot-client-secret",
    fetchImpl: async () => response
  });
  const input = {
    code: "authorization-code",
    codeVerifier: "v".repeat(48),
    redirectUri: "https://ipo.one/auth/callback",
    clientId: "ipo_one_human_console"
  };
  const response = (body, contentType = "application/json") => ({
    ok: true,
    headers: { get: (name) => name === "content-type" ? contentType : String(Buffer.byteLength(body)) },
    arrayBuffer: async () => Buffer.from(body)
  });
  await assert.rejects(
    () => create(response("<html>no</html>", "text/html")).exchangeAuthorizationCode(input),
    (error) => error.code === "oidc_code_exchange_rejected"
  );
  await assert.rejects(
    () => create(response(JSON.stringify({ id_token: "a.b.c", refresh_token: "must-not-enter" })))
      .exchangeAuthorizationCode(input),
    (error) => error.code === "oidc_token_response_rejected"
  );
});
