import {
  ActorType,
  ClientAuthenticationMethod,
  PHISHING_RESISTANT_AMR,
  SenderConstraintMethod
} from "./constants.js";
import { assertAuthenticationContext } from "./authentication-context.js";
import { verifyPinnedJwt } from "./jwt-verifier.js";
import { expiredSessionCookie } from "./human-session-store.js";
import { expiredTransactionCookie } from "./login-transaction-store.js";
import {
  assertBoundedString,
  assertNumericDate,
  assertSafeIdentifier,
  assertStringList,
  authenticationError,
  constantTimeEqual,
  epochSeconds
} from "./security-utils.js";

const HUMAN_ACTOR_TYPES = new Set([
  ActorType.HUMAN,
  ActorType.RISK_OPERATOR,
  ActorType.OPERATIONS_OPERATOR,
  ActorType.AUDITOR
]);
const HUMAN_ID_TOKEN_CLAIMS = Object.freeze([
  "iss",
  "sub",
  "aud",
  "exp",
  "iat",
  "nbf",
  "jti",
  "nonce",
  "tenant_id",
  "actor_type",
  "client_id",
  "roles",
  "capabilities",
  "policy_version",
  "auth_time",
  "acr",
  "amr"
]);
const REQUIRED_HUMAN_CLAIMS = Object.freeze([
  "iss",
  "sub",
  "aud",
  "exp",
  "iat",
  "nbf",
  "jti",
  "nonce",
  "tenant_id",
  "actor_type",
  "client_id",
  "policy_version",
  "auth_time",
  "acr",
  "amr"
]);

function exactHttpsEndpoint(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  return parsed.href;
}

export class HumanOidcBff {
  constructor({
    issuer,
    authorizationEndpoint,
    clientId,
    redirectUris,
    resolver,
    providerAdapter,
    transactionStore,
    sessionStore,
    credentialRegistry,
    referenceHasher,
    allowedAlgorithms = ["ES256"],
    maximumIdTokenLifetimeSeconds = 600,
    clockToleranceSeconds = 30,
    exchangeTimeoutMs = 5_000
  }) {
    if (
      !resolver?.keyResolver ||
      typeof providerAdapter?.exchangeAuthorizationCode !== "function" ||
      !transactionStore?.create ||
      !sessionStore?.create ||
      !credentialRegistry?.findBySubject ||
      !referenceHasher?.hash
    ) {
      throw authenticationError("invalid_authentication_configuration", "Human OIDC BFF adapters are required");
    }
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 4) {
      throw authenticationError("invalid_authentication_configuration", "redirectUris is invalid");
    }
    if (
      !Number.isSafeInteger(maximumIdTokenLifetimeSeconds) ||
      maximumIdTokenLifetimeSeconds < 60 ||
      maximumIdTokenLifetimeSeconds > 600
    ) {
      throw authenticationError("invalid_authentication_configuration", "ID token lifetime is invalid");
    }
    if (!Number.isSafeInteger(exchangeTimeoutMs) || exchangeTimeoutMs < 100 || exchangeTimeoutMs > 10_000) {
      throw authenticationError("invalid_authentication_configuration", "OIDC exchange timeout is invalid");
    }
    if (!Number.isSafeInteger(clockToleranceSeconds) || clockToleranceSeconds < 0 || clockToleranceSeconds > 60) {
      throw authenticationError("invalid_authentication_configuration", "OIDC clock tolerance is invalid");
    }
    this.issuer = issuer;
    this.authorizationEndpoint = exactHttpsEndpoint("authorizationEndpoint", authorizationEndpoint);
    this.clientId = assertSafeIdentifier("clientId", clientId);
    this.redirectUris = Object.freeze(redirectUris.map((uri) => exactHttpsEndpoint("redirectUri", uri)));
    if (new Set(this.redirectUris).size !== this.redirectUris.length) {
      throw authenticationError("invalid_authentication_configuration", "redirectUris contains duplicates");
    }
    this.resolver = resolver;
    this.providerAdapter = providerAdapter;
    this.transactionStore = transactionStore;
    this.sessionStore = sessionStore;
    this.credentialRegistry = credentialRegistry;
    this.referenceHasher = referenceHasher;
    this.allowedAlgorithms = Object.freeze([...allowedAlgorithms]);
    if (
      resolver.issuer !== issuer ||
      this.allowedAlgorithms.length === 0 ||
      new Set(this.allowedAlgorithms).size !== this.allowedAlgorithms.length ||
      this.allowedAlgorithms.some((algorithm) => !resolver.allowedAlgorithms.includes(algorithm))
    ) {
      throw authenticationError("invalid_authentication_configuration", "Human issuer or algorithm pin is invalid");
    }
    this.maximumIdTokenLifetimeSeconds = maximumIdTokenLifetimeSeconds;
    this.clockToleranceSeconds = clockToleranceSeconds;
    this.exchangeTimeoutMs = exchangeTimeoutMs;
  }

  beginLogin({ redirectUri, now = new Date() }) {
    const normalizedRedirect = this.#redirectUri(redirectUri);
    const transaction = this.transactionStore.create({ redirectUri: normalizedRedirect, now });
    const authorizationUrl = new URL(this.authorizationEndpoint);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", this.clientId);
    authorizationUrl.searchParams.set("redirect_uri", normalizedRedirect);
    authorizationUrl.searchParams.set("scope", "openid");
    authorizationUrl.searchParams.set("state", transaction.state);
    authorizationUrl.searchParams.set("nonce", transaction.nonce);
    authorizationUrl.searchParams.set("code_challenge", transaction.codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    return Object.freeze({
      authorizationUrl: authorizationUrl.href,
      transactionCookie: transaction.cookie,
      expiresAt: transaction.expiresAt
    });
  }

  async completeLogin({ transactionHandle, state, code, redirectUri, now = new Date() }) {
    const normalizedRedirect = this.#redirectUri(redirectUri);
    const transaction = this.transactionStore.consume({
      handle: transactionHandle,
      state,
      redirectUri: normalizedRedirect,
      now
    });
    const authorizationCode = assertBoundedString("authorization code", code, { maximum: 4_096 });
    let exchange;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.exchangeTimeoutMs);
    try {
      exchange = await Promise.race([
        this.providerAdapter.exchangeAuthorizationCode({
          code: authorizationCode,
          codeVerifier: transaction.codeVerifier,
          redirectUri: normalizedRedirect,
          clientId: this.clientId,
          signal: controller.signal
        }),
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("OIDC exchange timed out")), { once: true });
        })
      ]);
    } catch {
      throw authenticationError("oidc_code_exchange_rejected", "authorization code exchange failed");
    } finally {
      clearTimeout(timeout);
    }
    if (!exchange || typeof exchange !== "object" || Array.isArray(exchange) || Object.keys(exchange).some((key) => key !== "idToken")) {
      throw authenticationError("oidc_token_response_rejected", "OIDC token response is invalid");
    }
    const verified = await verifyPinnedJwt({
      token: exchange.idToken,
      resolver: this.resolver,
      issuer: this.issuer,
      audience: this.clientId,
      allowedAlgorithms: this.allowedAlgorithms,
      expectedType: "JWT",
      allowedClaimFields: HUMAN_ID_TOKEN_CLAIMS,
      requiredClaims: REQUIRED_HUMAN_CLAIMS,
      maximumLifetimeSeconds: this.maximumIdTokenLifetimeSeconds,
      clockToleranceSeconds: this.clockToleranceSeconds,
      now
    });
    const claims = verified.payload;
    if (!constantTimeEqual(claims.nonce, transaction.nonce)) {
      throw authenticationError("oidc_nonce_rejected", "OIDC nonce validation failed");
    }
    const actorType = assertSafeIdentifier("actor_type", claims.actor_type);
    if (!HUMAN_ACTOR_TYPES.has(actorType)) {
      throw authenticationError("authentication_actor_type_rejected", "Human actor type is not allowed");
    }
    const tenantId = assertSafeIdentifier("tenant_id", claims.tenant_id);
    const clientId = assertSafeIdentifier("client_id", claims.client_id);
    const policyVersion = assertSafeIdentifier("policy_version", claims.policy_version);
    if (clientId !== this.clientId) {
      throw authenticationError("authentication_binding_rejected", "ID token is not bound to this client");
    }
    const credential = this.credentialRegistry.findBySubject({
      issuer: claims.iss,
      tenantId,
      externalSubject: assertBoundedString("sub", claims.sub, { maximum: 512 }),
      clientId,
      now
    });
    if (
      credential.tenantId !== tenantId ||
      credential.actorType !== actorType ||
      credential.policyVersion !== policyVersion ||
      credential.clientAuthenticationMethod !== ClientAuthenticationMethod.OIDC_PKCE_BFF ||
      credential.senderConstraint.method !== SenderConstraintMethod.HOST_SESSION
    ) {
      throw authenticationError("authentication_binding_rejected", "ID token is not bound to the active credential");
    }
    if (claims.roles !== undefined) assertStringList("roles", claims.roles, { maximumItems: 16 });
    if (claims.capabilities !== undefined) assertStringList("capabilities", claims.capabilities);
    const authTime = assertNumericDate("auth_time", claims.auth_time);
    if (authTime > epochSeconds(now) + this.clockToleranceSeconds) {
      throw authenticationError("authentication_lifetime_rejected", "authentication time is not allowed");
    }
    const acr = assertBoundedString("acr", claims.acr, { maximum: 128 });
    const amr = assertStringList("amr", claims.amr, {
      maximumItems: 8,
      allowEmpty: false,
      itemPattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
    });
    const issued = this.sessionStore.create({
      tenantId,
      actorId: credential.actorId,
      actorType,
      clientId,
      credentialId: credential.credentialId,
      credentialVersion: credential.version,
      policyVersion,
      capabilities: credential.allowedCapabilities,
      roles: credential.roles,
      tokenJtiHash: this.referenceHasher.hash("token.jti", claims.jti),
      authTime: new Date(authTime * 1_000),
      acr,
      amr,
      now
    });
    return Object.freeze({
      ...issued,
      clearTransactionCookie: expiredTransactionCookie()
    });
  }

  authenticateSession(input) {
    return this.sessionStore.authenticate(input);
  }

  rotateSession(input) {
    return this.sessionStore.rotate(input);
  }

  logout(input) {
    return Object.freeze({
      revoked: this.sessionStore.revoke(input),
      clearSessionCookie: expiredSessionCookie()
    });
  }

  deprovisionCredential({ credentialId, performedByActorId, reasonCode, now = new Date() }) {
    const credential = this.credentialRegistry.revoke({
      credentialId,
      performedByActorId,
      reasonCode,
      now
    });
    const revokedSessions = this.sessionStore.revokeByCredential({ credentialId, reasonCode, now });
    return Object.freeze({ credential, revokedSessions });
  }

  #redirectUri(value) {
    const normalized = exactHttpsEndpoint("redirectUri", value);
    if (!this.redirectUris.includes(normalized)) {
      throw authenticationError("oidc_redirect_rejected", "OIDC redirect URI is not registered");
    }
    return normalized;
  }
}

export function assertRecentPhishingResistantAuthentication(
  context,
  { now = new Date(), maximumAgeSeconds = 15 * 60 } = {}
) {
  const trusted = assertAuthenticationContext(context);
  if (!Number.isSafeInteger(maximumAgeSeconds) || maximumAgeSeconds < 1 || maximumAgeSeconds > 15 * 60) {
    throw authenticationError("invalid_authentication_configuration", "recent authentication age is invalid");
  }
  const authTime = trusted.authTime ? new Date(trusted.authTime) : undefined;
  const age = authTime ? Math.floor((now.getTime() - authTime.getTime()) / 1_000) : Number.POSITIVE_INFINITY;
  if (
    !authTime ||
    !Number.isFinite(authTime.getTime()) ||
    age < -30 ||
    age > maximumAgeSeconds ||
    !trusted.amr.some((method) => PHISHING_RESISTANT_AMR.includes(method.toLowerCase()))
  ) {
    throw authenticationError(
      "recent_phishing_resistant_authentication_required",
      "recent phishing-resistant authentication is required"
    );
  }
  return trusted;
}
