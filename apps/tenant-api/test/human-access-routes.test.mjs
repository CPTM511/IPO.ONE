import assert from "node:assert/strict";
import test from "node:test";
import {
  CSRF_BOOTSTRAP_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  TRANSACTION_COOKIE_NAME,
  expiredCsrfBootstrapCookie,
  expiredSessionCookie,
  expiredTransactionCookie,
  loadAuthenticationRuntimeConfig
} from "../../../modules/authentication/src/index.js";
import {
  HUMAN_ACCESS_ROUTES,
  createHumanAccessRouteHandler,
  createPostgresHumanAccessComposition,
  createTenantHttpServer
} from "../src/index.js";

const NOW = new Date("2026-07-17T16:00:00.000Z");
const BROWSER_ORIGIN = "https://pilot.ipo.one";
const GOOGLE_REDIRECT = `${BROWSER_ORIGIN}${HUMAN_ACCESS_ROUTES.callback}?provider=google`;

function activeSessionCookie(value = "session-active-handle-00000000000000000000001") {
  return Object.freeze({
    name: SESSION_COOKIE_NAME,
    value,
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    domain: undefined,
    expiresAt: "2026-07-18T00:00:00.000Z"
  });
}

function loginCookie(value = "login-transaction-handle-00000000000000000001") {
  return Object.freeze({
    name: TRANSACTION_COOKIE_NAME,
    value,
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    domain: undefined,
    expiresAt: "2026-07-17T16:05:00.000Z"
  });
}

function createAccessFixture() {
  const calls = [];
  const sessions = new Set(["session-active-handle-00000000000000000000001"]);
  const humanSessionBff = {
    authenticateSession(input) {
      calls.push({ method: "authenticateSession", input: structuredClone(input) });
      if (!sessions.has(input.sessionHandle)) throw Object.assign(new Error("inactive"), { code: "authentication_session_rejected" });
      if (input.requestMethod === "POST" && (
        input.requestOrigin !== BROWSER_ORIGIN ||
        input.csrfToken !== "csrf-token-00000000000000000000000000000000001"
      )) {
        throw Object.assign(new Error("CSRF rejected"), { code: "csrf_token_rejected", name: "DomainError" });
      }
      return Object.freeze({ actorId: "actor_human_access_test" });
    },
    logout({ sessionHandle }) {
      const revoked = sessions.delete(sessionHandle);
      return Object.freeze({
        revoked,
        clearSessionCookie: expiredSessionCookie(),
        clearCsrfBootstrapCookie: expiredCsrfBootstrapCookie()
      });
    }
  };
  const oidcBff = {
    providerId: "google",
    beginLogin(input) {
      calls.push({ method: "beginOidc", input: structuredClone(input) });
      return Object.freeze({
        authorizationUrl: "https://accounts.example.test/authorize?state=opaque",
        transactionCookie: loginCookie(),
        expiresAt: "2026-07-17T16:05:00.000Z"
      });
    },
    async completeLogin(input) {
      calls.push({ method: "completeOidc", input: structuredClone(input) });
      return Object.freeze({
        cookie: activeSessionCookie("session-from-oidc-000000000000000000000000001"),
        clearTransactionCookie: expiredTransactionCookie(),
        csrfToken: "c".repeat(43)
      });
    }
  };
  const walletBff = {
    beginLogin(input) {
      calls.push({ method: "beginWallet", input: structuredClone(input) });
      return Object.freeze({
        handle: "wallet-login-handle-000000000000000000000000001",
        address: input.address,
        chainId: input.chainId,
        message: "pilot.ipo.one wants you to sign in with your Ethereum account:\n0x1111111111111111111111111111111111111111",
        expiresAt: "2026-07-17T16:05:00.000Z"
      });
    },
    async completeLogin(input) {
      calls.push({ method: "completeWallet", input: structuredClone(input) });
      return Object.freeze({
        cookie: activeSessionCookie("session-from-wallet-0000000000000000000000001"),
        csrfToken: "c".repeat(43)
      });
    }
  };
  const serveAuthentication = createHumanAccessRouteHandler({
    browserOrigin: BROWSER_ORIGIN,
    humanSessionBff,
    oidcProviders: {
      google: { bff: oidcBff, redirectUri: GOOGLE_REDIRECT }
    },
    walletBff,
    clock: () => NOW
  });
  return { calls, humanSessionBff, oidcBff, serveAuthentication, walletBff };
}

async function start(fixture) {
  const listener = createTenantHttpServer({
    gateway: { async execute() { throw new Error("not used"); } },
    resolveAuthenticationContext: async () => { throw new Error("not used"); },
    createNetworkContext: async () => ({ source: "local_test" }),
    serveAuthentication: fixture.serveAuthentication
  });
  const address = await listener.listen();
  return {
    listener,
    baseUrl: `http://${address.host}:${address.port}`
  };
}

test("Human access HTTP composes truthful discovery, OIDC, SIWE, and logout", async () => {
  const fixture = createAccessFixture();
  const { listener, baseUrl } = await start(fixture);
  try {
    const options = await fetch(`${baseUrl}${HUMAN_ACCESS_ROUTES.options}`);
    assert.equal(options.status, 200);
    assert.equal(options.headers.get("cache-control"), "no-store");
    assert.match(options.headers.get("content-security-policy"), /default-src 'none'/);
    assert.deepEqual(await options.json(), {
      schemaVersion: "ipo_one_authentication_options.v1",
      profile: "closed_non_funds_pilot",
      enabled: true,
      sessionActive: false,
      oidcProviders: ["google"],
      walletAuthentication: true,
      supportedChains: ["eip155:84532", "eip155:1952"],
      boundary: "Authentication proves presence; internal policy and Mandates separately decide authority."
    });

    const activeOptions = await fetch(`${baseUrl}${HUMAN_ACCESS_ROUTES.options}`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=session-active-handle-00000000000000000000001` }
    });
    assert.equal((await activeOptions.json()).sessionActive, true);

    const login = await fetch(`${baseUrl}${HUMAN_ACCESS_ROUTES.login}?provider=google`, {
      redirect: "manual"
    });
    assert.equal(login.status, 303);
    assert.equal(login.headers.get("location"), "https://accounts.example.test/authorize?state=opaque");
    assert.match(login.headers.get("set-cookie"), /^__Host-ipo_one_login=/);
    assert.match(login.headers.get("set-cookie"), /Secure; HttpOnly; SameSite=Lax/);

    const callback = await fetch(
      `${baseUrl}${HUMAN_ACCESS_ROUTES.callback}?provider=google&code=authorization-code&state=opaque-state`,
      {
        redirect: "manual",
        headers: { cookie: `${TRANSACTION_COOKIE_NAME}=login-transaction-handle-00000000000000000001` }
      }
    );
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/#human");
    const callbackCookies = callback.headers.getSetCookie();
    assert.equal(callbackCookies.length, 3);
    assert.match(callbackCookies[0], /^__Host-ipo_one_session=/);
    assert.match(callbackCookies[1], new RegExp(`^${CSRF_BOOTSTRAP_COOKIE_NAME}=${"c".repeat(43)}`));
    assert.match(callbackCookies[1], /Secure; HttpOnly; SameSite=Strict/);
    assert.match(callbackCookies[2], /^__Host-ipo_one_login=;/);

    const challenge = await fetch(`${baseUrl}${HUMAN_ACCESS_ROUTES.walletChallenge}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BROWSER_ORIGIN },
      body: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
        chainId: 84532
      })
    });
    assert.equal(challenge.status, 201);
    const challengeBody = await challenge.json();
    assert.equal(challengeBody.schemaVersion, "ipo_one_wallet_challenge.v1");
    assert.equal(Object.hasOwn(challengeBody, "address"), false);
    assert.equal(Object.hasOwn(challengeBody, "chainId"), false);

    const verify = await fetch(`${baseUrl}${HUMAN_ACCESS_ROUTES.walletVerify}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BROWSER_ORIGIN },
      body: JSON.stringify({
        transactionHandle: challengeBody.handle,
        signature: `0x${"a".repeat(130)}`
      })
    });
    assert.equal(verify.status, 200);
    const verifyCookies = verify.headers.getSetCookie();
    assert.equal(verifyCookies.length, 2);
    assert.match(verifyCookies[0], /^__Host-ipo_one_session=/);
    assert.match(verifyCookies[1], new RegExp(`^${CSRF_BOOTSTRAP_COOKIE_NAME}=`));
    const verifyText = await verify.text();
    assert.equal(verifyText.includes("signature"), false);
    assert.equal(verifyText.includes("must-never"), false);
    assert.deepEqual(JSON.parse(verifyText), {
      schemaVersion: "ipo_one_authentication_result.v1",
      status: "authenticated",
      authenticationMethod: "siwe"
    });

    const logout = await fetch(`${baseUrl}${HUMAN_ACCESS_ROUTES.logout}`, {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-active-handle-00000000000000000000001`,
        origin: BROWSER_ORIGIN,
        "x-csrf-token": "csrf-token-00000000000000000000000000000000001"
      }
    });
    assert.equal(logout.status, 200);
    const logoutCookies = logout.headers.getSetCookie();
    assert.equal(logoutCookies.length, 2);
    assert.match(logoutCookies[0], /^__Host-ipo_one_session=;/);
    assert.match(logoutCookies[1], new RegExp(`^${CSRF_BOOTSTRAP_COOKIE_NAME}=;`));
    assert.equal((await logout.json()).status, "logged_out");

    const oidcCall = fixture.calls.find((call) => call.method === "completeOidc");
    assert.equal(oidcCall.input.redirectUri, GOOGLE_REDIRECT);
    assert.equal(oidcCall.input.transactionHandle, "login-transaction-handle-00000000000000000001");
    assert.equal(fixture.calls.some((call) => Object.hasOwn(call.input, "tenantId")), false);
  } finally {
    await listener.close();
  }
});

test("Human access HTTP rejects provider confusion, cross-origin wallet calls, and open JSON", async () => {
  const fixture = createAccessFixture();
  const { listener, baseUrl } = await start(fixture);
  try {
    const unknownProvider = await fetch(`${baseUrl}${HUMAN_ACCESS_ROUTES.login}?provider=microsoft`, {
      redirect: "manual"
    });
    assert.equal(unknownProvider.status, 400);
    assert.equal((await unknownProvider.json()).code, "authentication_provider_rejected");

    const crossOrigin = await fetch(`${baseUrl}${HUMAN_ACCESS_ROUTES.walletChallenge}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
        chainId: 84532
      })
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await crossOrigin.json()).code, "csrf_origin_rejected");

    const openBody = await fetch(`${baseUrl}${HUMAN_ACCESS_ROUTES.walletChallenge}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BROWSER_ORIGIN },
      body: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
        chainId: 84532,
        tenantId: "tenant_attacker"
      })
    });
    assert.equal(openBody.status, 400);
    assert.equal((await openBody.json()).code, "invalid_json_body");
    assert.equal(fixture.calls.some((call) => call.method === "beginWallet"), false);

    const duplicateJson = await fetch(`${baseUrl}${HUMAN_ACCESS_ROUTES.walletChallenge}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BROWSER_ORIGIN },
      body: '{"address":"0x1111111111111111111111111111111111111111","chainId":84532,"chainId":1952}'
    });
    assert.equal(duplicateJson.status, 400);
    assert.equal((await duplicateJson.json()).code, "invalid_json_body");
    assert.equal(fixture.calls.some((call) => call.method === "beginWallet"), false);

    const duplicateProvider = await fetch(
      `${baseUrl}${HUMAN_ACCESS_ROUTES.login}?provider=google&provider=email`,
      { redirect: "manual" }
    );
    assert.equal(duplicateProvider.status, 400);
    assert.equal((await duplicateProvider.json()).code, "authentication_input_rejected");
  } finally {
    await listener.close();
  }
});

test("Tenant HTTP rejects an unreviewed Human access adapter type", () => {
  assert.throws(
    () => createTenantHttpServer({
      gateway: { async execute() {} },
      resolveAuthenticationContext: async () => ({}),
      createNetworkContext: async () => ({}),
      serveAuthentication: "caller-route"
    }),
    (error) => error.code === "invalid_tenant_transport_config"
  );
});

test("PostgreSQL Human access composition closes unversioned secrets and empty provider sets", async () => {
  const runtimeConfig = loadAuthenticationRuntimeConfig({
    IPO_ONE_AUTHENTICATION_MODE: "closed_pilot",
    IPO_ONE_IDP_DEPLOYMENT_APPROVAL: "APPROVED",
    IPO_ONE_IDP_VENDOR_ID: "synthetic_test_idp",
    IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA: "a".repeat(40),
    IPO_ONE_IDP_CONFIGURATION_REF: "projects/ipo-one-pilot/secrets/idp-issuer/versions/1",
    IPO_ONE_OIDC_CLIENT_CREDENTIAL_REF: "projects/ipo-one-pilot/secrets/oidc-client/versions/2",
    IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF: "projects/ipo-one-pilot/secrets/auth-reference-key/versions/3",
    IPO_ONE_AUTH_ENCRYPTION_KEY_REF: "projects/ipo-one-pilot/secrets/auth-encryption-key/versions/4"
  });
  const base = {
    pool: { query: async () => { throw new Error("database must not be reached"); } },
    runtimeConfig,
    tenantId: "tenant_pilot",
    systemActorId: "actor_system_worker",
    policyVersion: "security_001.v1",
    browserOrigin: BROWSER_ORIGIN,
    referenceHashKey: Buffer.alloc(32, 1),
    referenceHashKeyRef: "projects/ipo-one-pilot/secrets/auth-reference-key/versions/3",
    encryptionKey: Buffer.alloc(32, 2),
    encryptionKeyRef: "projects/ipo-one-pilot/secrets/auth-encryption-key/versions/4",
    oidcProviders: []
  };
  await assert.rejects(
    () => createPostgresHumanAccessComposition({
      ...base,
      referenceHashKeyRef: "projects/ipo-one-pilot/secrets/auth-reference-key/versions/latest"
    }),
    (error) => error.code === "authentication_deployment_gate_closed"
  );
  await assert.rejects(
    () => createPostgresHumanAccessComposition(base),
    (error) => error.code === "authentication_deployment_gate_closed"
  );
  await assert.rejects(
    () => createPostgresHumanAccessComposition({
      ...base,
      runtimeConfig: {
        enabled: true,
        mode: "closed_pilot",
        deploymentGateSatisfied: true
      }
    }),
    (error) => error.code === "authentication_deployment_gate_closed"
  );
});
