import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  ActorType,
  ClientAuthenticationMethod,
  HumanOidcBff,
  InMemoryActorDirectory,
  InMemoryAuthenticationEventStore,
  InMemoryCredentialRegistry,
  InMemoryHumanSessionStore,
  InMemoryLoginTransactionStore,
  PinnedJwksResolver,
  SenderConstraintMethod,
  assertRecentPhishingResistantAuthentication,
  createReferenceHasher
} from "../src/index.js";
import { LocalTestIssuer } from "./support/local-test-issuer.js";

const NOW = new Date("2026-07-13T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const ISSUER = "https://issuer.local.test";
const CLIENT_ID = "ipo_one_human_console";
const REDIRECT_URI = "https://ipo.one/auth/callback";
const ORIGIN = "https://ipo.one";

async function createFixture({
  idleTimeoutMs = 30 * 60_000,
  absoluteTimeoutMs = 8 * 60 * 60_000,
  exchangeTimeoutMs = 5_000,
  hangExchange = false
} = {}) {
  const issuer = await LocalTestIssuer.create({ issuer: ISSUER });
  const referenceHasher = createReferenceHasher(randomBytes(32));
  const eventStore = new InMemoryAuthenticationEventStore();
  const actorDirectory = new InMemoryActorDirectory();
  actorDirectory.register({ actorId: "actor_human_alpha", actorType: ActorType.HUMAN });
  const credentialRegistry = new InMemoryCredentialRegistry({
    referenceHasher,
    eventStore,
    actorDirectory
  });
  const credential = credentialRegistry.register({
    tenantId: "tenant_alpha",
    actorId: "actor_human_alpha",
    actorType: ActorType.HUMAN,
    issuer: ISSUER,
    externalSubject: "human-operator-alpha",
    clientId: CLIENT_ID,
    clientAuthenticationMethod: ClientAuthenticationMethod.OIDC_PKCE_BFF,
    senderConstraint: {
      method: SenderConstraintMethod.HOST_SESSION,
      thumbprint: "h".repeat(43)
    },
    roles: ["tenant_owner"],
    allowedCapabilities: ["subject.read", "integration.manage"],
    policyVersion: "security_001.v1",
    performedByActorId: "actor_security_admin",
    reasonCode: "local_test_registration",
    now: NOW
  });
  const resolver = new PinnedJwksResolver({
    issuer: ISSUER,
    allowedAlgorithms: ["ES256"],
    fetchJwks: async () => issuer.jwks()
  });
  const transactionStore = new InMemoryLoginTransactionStore({ referenceHasher });
  const sessionStore = new InMemoryHumanSessionStore({
    referenceHasher,
    credentialRegistry,
    eventStore,
    origin: ORIGIN,
    idleTimeoutMs,
    absoluteTimeoutMs
  });
  let tokenResponse;
  const exchanges = [];
  const providerAdapter = {
    async exchangeAuthorizationCode(input) {
      exchanges.push({
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        verifierLength: input.codeVerifier.length
      });
      if (hangExchange) return new Promise(() => {});
      return tokenResponse;
    }
  };
  const bff = new HumanOidcBff({
    issuer: ISSUER,
    authorizationEndpoint: `${ISSUER}/authorize`,
    clientId: CLIENT_ID,
    redirectUris: [REDIRECT_URI],
    resolver,
    providerAdapter,
    transactionStore,
    sessionStore,
    credentialRegistry,
    referenceHasher,
    exchangeTimeoutMs
  });

  async function beginAndIssue({
    now = NOW,
    nonce,
    authTime = Math.floor(now.getTime() / 1_000),
    amr = ["webauthn"],
    extraClaims = {},
    responseExtras = {}
  } = {}) {
    const login = bff.beginLogin({ redirectUri: REDIRECT_URI, now });
    const authorizationUrl = new URL(login.authorizationUrl);
    const state = authorizationUrl.searchParams.get("state");
    const expectedNonce = authorizationUrl.searchParams.get("nonce");
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    const idToken = await issuer.sign({
      audience: CLIENT_ID,
      subject: "human-operator-alpha",
      jti: `human-id-token-${nowSeconds}`,
      issuedAt: nowSeconds,
      notBefore: nowSeconds,
      expiresAt: nowSeconds + 600,
      typ: "JWT",
      claims: {
        nonce: nonce ?? expectedNonce,
        tenant_id: "tenant_alpha",
        actor_type: ActorType.HUMAN,
        client_id: CLIENT_ID,
        roles: ["external_super_admin_is_ignored"],
        capabilities: ["external.capability.is_ignored"],
        policy_version: "security_001.v1",
        auth_time: authTime,
        acr: "urn:ipo.one:acr:phishing-resistant",
        amr,
        ...extraClaims
      }
    });
    tokenResponse = { idToken, ...responseExtras };
    return {
      login,
      state,
      complete: () => bff.completeLogin({
        transactionHandle: login.transactionCookie.value,
        state,
        code: "one-time-authorization-code",
        redirectUri: REDIRECT_URI,
        now
      }),
      idToken
    };
  }

  return {
    beginAndIssue,
    bff,
    actorDirectory,
    credential,
    credentialRegistry,
    eventStore,
    exchanges
  };
}

test("Human OIDC BFF uses PKCE and issues only a rotated host session plus CSRF token", async () => {
  const fixture = await createFixture();
  const flow = await fixture.beginAndIssue();
  const authorizationUrl = new URL(flow.login.authorizationUrl);
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorizationUrl.searchParams.get("scope"), "openid");
  assert.equal(authorizationUrl.searchParams.has("code_verifier"), false);

  const issued = await flow.complete();
  assert.equal(issued.cookie.name, "__Host-ipo_one_session");
  assert.equal(issued.cookie.secure, true);
  assert.equal(issued.cookie.httpOnly, true);
  assert.equal(issued.cookie.sameSite, "Strict");
  assert.equal(issued.cookie.path, "/");
  assert.equal(issued.cookie.domain, undefined);
  assert.equal(issued.clearTransactionCookie.name, "__Host-ipo_one_login");
  assert.equal(issued.clearTransactionCookie.maxAge, 0);
  assert.notEqual(issued.cookie.value, flow.login.transactionCookie.value);
  assert.equal(issued.session.authorizationDecision, "not_evaluated");
  assert.deepEqual(issued.session.roles, ["tenant_owner"]);
  assert.deepEqual(issued.session.capabilities, ["subject.read", "integration.manage"]);
  assert.equal(fixture.exchanges[0].verifierLength >= 43, true);

  const serializedEvents = JSON.stringify(fixture.eventStore.list());
  assert.equal(serializedEvents.includes(flow.idToken), false);
  assert.equal(serializedEvents.includes("one-time-authorization-code"), false);
  assert.equal(serializedEvents.includes(issued.cookie.value), false);
});

test("Human session enforces origin and CSRF on mutations, rotates, logs out, and rejects fixation", async () => {
  const fixture = await createFixture();
  const issued = await (await fixture.beginAndIssue()).complete();
  const readContext = fixture.bff.authenticateSession({
    sessionHandle: issued.cookie.value,
    requestMethod: "GET",
    now: NOW
  });
  assert.equal(readContext.actorId, "actor_human_alpha");
  assert.throws(
    () => fixture.bff.authenticateSession({
      sessionHandle: issued.cookie.value,
      requestMethod: "POST",
      requestOrigin: "https://evil.example",
      csrfToken: issued.csrfToken,
      now: NOW
    }),
    (error) => error.code === "csrf_origin_rejected"
  );
  assert.throws(
    () => fixture.bff.authenticateSession({
      sessionHandle: issued.cookie.value,
      requestMethod: "POST",
      requestOrigin: ORIGIN,
      csrfToken: "x".repeat(43),
      now: NOW
    }),
    (error) => error.code === "csrf_token_rejected"
  );
  assert.equal(fixture.bff.authenticateSession({
    sessionHandle: issued.cookie.value,
    requestMethod: "POST",
    requestOrigin: ORIGIN,
    csrfToken: issued.csrfToken,
    now: NOW
  }).tenantId, "tenant_alpha");

  const rotated = fixture.bff.rotateSession({
    sessionHandle: issued.cookie.value,
    now: new Date(NOW.getTime() + 1_000)
  });
  assert.notEqual(rotated.cookie.value, issued.cookie.value);
  assert.notEqual(rotated.csrfToken, issued.csrfToken);
  assert.throws(
    () => fixture.bff.authenticateSession({
      sessionHandle: issued.cookie.value,
      requestMethod: "GET",
      now: new Date(NOW.getTime() + 1_000)
    }),
    (error) => error.code === "authentication_session_rejected"
  );
  const logout = fixture.bff.logout({ sessionHandle: rotated.cookie.value, now: NOW });
  assert.equal(logout.revoked, true);
  assert.equal(logout.clearSessionCookie.name, "__Host-ipo_one_session");
  assert.equal(logout.clearSessionCookie.maxAge, 0);
  assert.equal(fixture.bff.logout({ sessionHandle: rotated.cookie.value, now: NOW }).revoked, false);
});

test("Human sessions fail closed immediately after credential rotation", async () => {
  const fixture = await createFixture();
  const issued = await (await fixture.beginAndIssue()).complete();
  fixture.credentialRegistry.rotate({
    credentialId: fixture.credential.credentialId,
    senderConstraint: {
      method: SenderConstraintMethod.HOST_SESSION,
      thumbprint: "r".repeat(43)
    },
    performedByActorId: "actor_security_admin",
    reasonCode: "credential_key_rotation",
    now: new Date(NOW.getTime() + 1_000)
  });
  assert.throws(
    () => fixture.bff.authenticateSession({
      sessionHandle: issued.cookie.value,
      requestMethod: "GET",
      now: new Date(NOW.getTime() + 2_000)
    }),
    (error) => error.code === "authentication_session_rejected"
  );
});

test("login transactions are one-time and reject state, redirect, nonce, and token response confusion", async () => {
  const fixture = await createFixture();
  const wrongStateFlow = await fixture.beginAndIssue();
  await assert.rejects(
    () => fixture.bff.completeLogin({
      transactionHandle: wrongStateFlow.login.transactionCookie.value,
      state: "w".repeat(43),
      code: "one-time-authorization-code",
      redirectUri: REDIRECT_URI,
      now: NOW
    }),
    (error) => error.code === "oidc_transaction_rejected"
  );
  await assert.rejects(() => wrongStateFlow.complete(), (error) => error.code === "oidc_transaction_rejected");

  const wrongNonceFlow = await fixture.beginAndIssue({ nonce: "n".repeat(43) });
  await assert.rejects(() => wrongNonceFlow.complete(), (error) => error.code === "oidc_nonce_rejected");

  const confusedResponse = await fixture.beginAndIssue({ responseExtras: { refreshToken: "must-not-be-stored" } });
  await assert.rejects(
    () => confusedResponse.complete(),
    (error) => error.code === "oidc_token_response_rejected"
  );
  assert.throws(
    () => fixture.bff.beginLogin({ redirectUri: "https://evil.example/callback", now: NOW }),
    (error) => error.code === "oidc_redirect_rejected"
  );
});

test("OIDC authorization code exchange has a bounded wait", async () => {
  const fixture = await createFixture({ exchangeTimeoutMs: 100, hangExchange: true });
  const flow = await fixture.beginAndIssue();
  await assert.rejects(
    () => flow.complete(),
    (error) => error.code === "oidc_code_exchange_rejected"
  );
});

test("sessions enforce inactivity, absolute expiry, credential revocation, and deprovisioning", async () => {
  const idleFixture = await createFixture({ idleTimeoutMs: 60_000, absoluteTimeoutMs: 120_000 });
  const idleSession = await (await idleFixture.beginAndIssue()).complete();
  assert.throws(
    () => idleFixture.bff.authenticateSession({
      sessionHandle: idleSession.cookie.value,
      requestMethod: "GET",
      now: new Date(NOW.getTime() + 60_000)
    }),
    (error) => error.code === "authentication_session_rejected"
  );
  assert.equal(idleFixture.eventStore.list().at(-1).eventType, "session_expired");

  const absoluteFixture = await createFixture({
    idleTimeoutMs: 120_000,
    absoluteTimeoutMs: 120_000
  });
  const absoluteSession = await (await absoluteFixture.beginAndIssue()).complete();
  absoluteFixture.bff.authenticateSession({
    sessionHandle: absoluteSession.cookie.value,
    requestMethod: "GET",
    now: new Date(NOW.getTime() + 60_000)
  });
  assert.throws(
    () => absoluteFixture.bff.authenticateSession({
      sessionHandle: absoluteSession.cookie.value,
      requestMethod: "GET",
      now: new Date(NOW.getTime() + 120_000)
    }),
    (error) => error.code === "authentication_session_rejected"
  );

  const revokeFixture = await createFixture();
  const active = await (await revokeFixture.beginAndIssue()).complete();
  const result = revokeFixture.bff.deprovisionCredential({
    credentialId: revokeFixture.credential.credentialId,
    performedByActorId: "actor_security_admin",
    reasonCode: "operator_deprovisioned",
    now: NOW
  });
  assert.equal(result.revokedSessions, 1);
  assert.throws(
    () => revokeFixture.bff.authenticateSession({
      sessionHandle: active.cookie.value,
      requestMethod: "GET",
      now: NOW
    }),
    (error) => error.code === "authentication_session_rejected"
  );
});

test("privileged authentication requires recent phishing-resistant MFA", async () => {
  const fixture = await createFixture();
  const recent = await (await fixture.beginAndIssue()).complete();
  assert.equal(
    assertRecentPhishingResistantAuthentication(recent.session, { now: NOW }),
    recent.session
  );

  const staleFixture = await createFixture();
  const stale = await (await staleFixture.beginAndIssue({ authTime: NOW_SECONDS - 901 })).complete();
  assert.throws(
    () => assertRecentPhishingResistantAuthentication(stale.session, { now: NOW }),
    (error) => error.code === "recent_phishing_resistant_authentication_required"
  );

  const weakFixture = await createFixture();
  const weak = await (await weakFixture.beginAndIssue({ amr: ["pwd", "otp"] })).complete();
  assert.throws(
    () => assertRecentPhishingResistantAuthentication(weak.session, { now: NOW }),
    (error) => error.code === "recent_phishing_resistant_authentication_required"
  );
});
