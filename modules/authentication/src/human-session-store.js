import { AuthenticationEventType } from "./constants.js";
import { createAuthenticationContext } from "./authentication-context.js";
import {
  assertBoundedString,
  assertSafeIdentifier,
  authenticationError,
  constantTimeEqual,
  randomOpaqueValue
} from "./security-utils.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_COOKIE_NAME = "__Host-ipo_one_session";

function exactOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_configuration", "session origin is invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw authenticationError("invalid_authentication_configuration", "session origin is invalid");
  }
  return parsed.origin;
}

function positiveDuration(name, value, maximum) {
  if (!Number.isSafeInteger(value) || value < 60_000 || value > maximum) {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  return value;
}

function cookie(value, expiresAt) {
  return Object.freeze({
    name: SESSION_COOKIE_NAME,
    value,
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    domain: undefined,
    expiresAt
  });
}

export function expiredSessionCookie() {
  return Object.freeze({
    name: SESSION_COOKIE_NAME,
    value: "",
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    domain: undefined,
    maxAge: 0,
    expiresAt: "1970-01-01T00:00:00.000Z"
  });
}

export class InMemoryHumanSessionStore {
  #sessions = new Map();

  constructor({
    referenceHasher,
    credentialRegistry,
    eventStore,
    origin,
    idleTimeoutMs = 30 * 60_000,
    absoluteTimeoutMs = 8 * 60 * 60_000,
    maximumSessions = 10_000
  }) {
    if (!referenceHasher?.hash || !credentialRegistry?.assertActive || !eventStore?.append) {
      throw authenticationError("invalid_authentication_configuration", "session store adapters are required");
    }
    if (!Number.isSafeInteger(maximumSessions) || maximumSessions < 1 || maximumSessions > 100_000) {
      throw authenticationError("invalid_authentication_configuration", "maximumSessions is invalid");
    }
    this.referenceHasher = referenceHasher;
    this.credentialRegistry = credentialRegistry;
    this.eventStore = eventStore;
    this.origin = exactOrigin(origin);
    this.idleTimeoutMs = positiveDuration("idleTimeoutMs", idleTimeoutMs, 2 * 60 * 60_000);
    this.absoluteTimeoutMs = positiveDuration("absoluteTimeoutMs", absoluteTimeoutMs, 24 * 60 * 60_000);
    if (this.idleTimeoutMs > this.absoluteTimeoutMs) {
      throw authenticationError("invalid_authentication_configuration", "session inactivity exceeds absolute lifetime");
    }
    this.maximumSessions = maximumSessions;
  }

  create(input) {
    const now = input.now ?? new Date();
    this.#prune(now);
    if (this.#sessions.size >= this.maximumSessions) {
      throw authenticationError("authentication_session_capacity_exceeded", "session capacity is exhausted");
    }
    const handle = randomOpaqueValue();
    const csrfToken = randomOpaqueValue();
    const sessionRefHash = this.referenceHasher.hash("session.handle", handle);
    const session = {
      sessionRefHash,
      csrfRefHash: this.referenceHasher.hash("session.csrf", csrfToken),
      tenantId: assertSafeIdentifier("tenantId", input.tenantId),
      actorId: assertSafeIdentifier("actorId", input.actorId),
      actorType: assertSafeIdentifier("actorType", input.actorType),
      clientId: assertSafeIdentifier("clientId", input.clientId),
      credentialId: assertSafeIdentifier("credentialId", input.credentialId),
      credentialVersion: input.credentialVersion,
      policyVersion: assertSafeIdentifier("policyVersion", input.policyVersion),
      capabilities: Object.freeze([...(input.capabilities ?? [])]),
      roles: Object.freeze([...(input.roles ?? [])]),
      tokenJtiHash: input.tokenJtiHash,
      authTime: new Date(input.authTime).toISOString(),
      acr: input.acr,
      amr: Object.freeze([...(input.amr ?? [])]),
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      absoluteExpiresAt: new Date(now.getTime() + this.absoluteTimeoutMs).toISOString(),
      status: "active",
      rotation: 0
    };
    if (!Number.isSafeInteger(session.credentialVersion) || session.credentialVersion < 1) {
      throw authenticationError("invalid_authentication_input", "credentialVersion is invalid");
    }
    this.#event(AuthenticationEventType.SESSION_CREATED, session, "human_login", now);
    this.#sessions.set(sessionRefHash, session);
    return this.#issued(session, handle, csrfToken);
  }

  authenticate({ sessionHandle, requestMethod, requestOrigin, csrfToken, now = new Date() }) {
    const session = this.#require(sessionHandle, now);
    const method = assertBoundedString("requestMethod", requestMethod, {
      maximum: 16,
      pattern: /^[A-Za-z]+$/
    }).toUpperCase();
    if (!SAFE_METHODS.has(method)) {
      if (requestOrigin !== this.origin) {
        throw authenticationError("csrf_origin_rejected", "request origin is not allowed");
      }
      const csrfRefHash = this.referenceHasher.hash(
        "session.csrf",
        assertBoundedString("csrfToken", csrfToken, { minimum: 32, maximum: 128 })
      );
      if (!constantTimeEqual(csrfRefHash, session.csrfRefHash)) {
        throw authenticationError("csrf_token_rejected", "CSRF token is invalid");
      }
    }
    const credential = this.credentialRegistry.assertActive(session.credentialId, now);
    if (credential.version !== session.credentialVersion) {
      throw authenticationError("authentication_session_rejected", "session credential version is stale");
    }
    session.lastSeenAt = now.toISOString();
    return this.#context(session, now);
  }

  rotate({ sessionHandle, reasonCode = "session_rotation", now = new Date() }) {
    const current = this.#require(sessionHandle, now);
    const credential = this.credentialRegistry.assertActive(current.credentialId, now);
    if (credential.version !== current.credentialVersion) {
      throw authenticationError("authentication_session_rejected", "session credential version is stale");
    }
    const handle = randomOpaqueValue();
    const csrfToken = randomOpaqueValue();
    const next = {
      ...current,
      sessionRefHash: this.referenceHasher.hash("session.handle", handle),
      csrfRefHash: this.referenceHasher.hash("session.csrf", csrfToken),
      lastSeenAt: now.toISOString(),
      rotation: current.rotation + 1
    };
    this.#event(AuthenticationEventType.SESSION_ROTATED, next, reasonCode, now);
    this.#sessions.delete(current.sessionRefHash);
    this.#sessions.set(next.sessionRefHash, next);
    return this.#issued(next, handle, csrfToken);
  }

  revoke({ sessionHandle, reasonCode = "human_logout", now = new Date() }) {
    const reference = this.referenceHasher.hash(
      "session.handle",
      assertBoundedString("sessionHandle", sessionHandle, { minimum: 32, maximum: 128 })
    );
    const session = this.#sessions.get(reference);
    if (!session) return false;
    this.#sessions.delete(reference);
    this.#event(AuthenticationEventType.SESSION_REVOKED, session, reasonCode, now);
    return true;
  }

  revokeByCredential({ credentialId, reasonCode = "credential_revoked", now = new Date() }) {
    const revoked = [];
    for (const [reference, session] of this.#sessions) {
      if (session.credentialId !== credentialId) continue;
      this.#sessions.delete(reference);
      revoked.push(session);
    }
    for (const session of revoked) {
      this.#event(AuthenticationEventType.SESSION_REVOKED, session, reasonCode, now);
    }
    return revoked.length;
  }

  #require(handle, now) {
    const reference = this.referenceHasher.hash(
      "session.handle",
      assertBoundedString("sessionHandle", handle, { minimum: 32, maximum: 128 })
    );
    const session = this.#sessions.get(reference);
    const expired = session && (
      new Date(session.absoluteExpiresAt) <= now ||
      new Date(session.lastSeenAt).getTime() + this.idleTimeoutMs <= now.getTime()
    );
    if (!session || expired || session.status !== "active") {
      if (session) {
        this.#sessions.delete(reference);
        if (expired) this.#event(AuthenticationEventType.SESSION_EXPIRED, session, "session_expired", now);
      }
      throw authenticationError("authentication_session_rejected", "session is not active");
    }
    return session;
  }

  #context(session, now) {
    return createAuthenticationContext({
      tenantId: session.tenantId,
      actorId: session.actorId,
      actorType: session.actorType,
      clientId: session.clientId,
      credentialId: session.credentialId,
      credentialVersion: session.credentialVersion,
      policyVersion: session.policyVersion,
      capabilities: session.capabilities,
      roles: session.roles,
      tokenJtiHash: session.tokenJtiHash,
      authenticationMethod: "oidc_pkce_bff",
      senderConstraintMethod: "host_session",
      authenticatedAt: now,
      authTime: session.authTime,
      acr: session.acr,
      amr: session.amr
    });
  }

  #issued(session, handle, csrfToken) {
    return Object.freeze({
      cookie: cookie(handle, session.absoluteExpiresAt),
      csrfToken,
      session: this.#context(session, new Date(session.lastSeenAt)),
      idleTimeoutMs: this.idleTimeoutMs,
      absoluteExpiresAt: session.absoluteExpiresAt
    });
  }

  #event(eventType, session, reasonCode, now) {
    this.eventStore.append({
      eventType,
      tenantId: session.tenantId,
      actorId: session.actorId,
      credentialId: session.credentialId,
      reasonCode,
      occurredAt: now.toISOString(),
      payload: {
        sessionRefHash: session.sessionRefHash,
        rotation: session.rotation
      }
    });
  }

  #prune(now) {
    for (const [reference, session] of this.#sessions) {
      if (
        new Date(session.absoluteExpiresAt) <= now ||
        new Date(session.lastSeenAt).getTime() + this.idleTimeoutMs <= now.getTime()
      ) {
        this.#sessions.delete(reference);
        this.#event(AuthenticationEventType.SESSION_EXPIRED, session, "session_expired", now);
      }
    }
  }
}

export { SESSION_COOKIE_NAME };
