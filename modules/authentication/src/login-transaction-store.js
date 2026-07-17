import {
  sha256Base64Url,
  assertBoundedString,
  assertSafeIdentifier,
  authenticationError,
  constantTimeEqual,
  randomOpaqueValue
} from "./security-utils.js";

const TRANSACTION_COOKIE_NAME = "__Host-ipo_one_login";

function exactRedirectUri(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("oidc_redirect_rejected", "OIDC redirect URI is invalid");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw authenticationError("oidc_redirect_rejected", "OIDC redirect URI is invalid");
  }
  return parsed.href;
}

export class InMemoryLoginTransactionStore {
  #transactions = new Map();

  constructor({ referenceHasher, ttlMs = 5 * 60_000, maximumTransactions = 1_000 }) {
    if (!referenceHasher?.hash) {
      throw authenticationError("invalid_authentication_configuration", "referenceHasher is required");
    }
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 10 * 60_000) {
      throw authenticationError("invalid_authentication_configuration", "login transaction lifetime is invalid");
    }
    if (!Number.isSafeInteger(maximumTransactions) || maximumTransactions < 1 || maximumTransactions > 10_000) {
      throw authenticationError("invalid_authentication_configuration", "login transaction capacity is invalid");
    }
    this.referenceHasher = referenceHasher;
    this.ttlMs = ttlMs;
    this.maximumTransactions = maximumTransactions;
  }

  create({ redirectUri, providerId = "oidc", now = new Date() }) {
    this.#prune(now);
    if (this.#transactions.size >= this.maximumTransactions) {
      throw authenticationError("oidc_transaction_capacity_exceeded", "login transaction capacity is exhausted");
    }
    const handle = randomOpaqueValue();
    const state = randomOpaqueValue();
    const nonce = randomOpaqueValue();
    const codeVerifier = randomOpaqueValue(48);
    const reference = this.referenceHasher.hash("oidc.transaction", handle);
    this.#transactions.set(reference, {
      providerId: assertSafeIdentifier("providerId", providerId),
      stateRefHash: this.referenceHasher.hash("oidc.state", state),
      nonce,
      codeVerifier,
      redirectUri: exactRedirectUri(redirectUri),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString()
    });
    return Object.freeze({
      handle,
      state,
      nonce,
      codeChallenge: sha256Base64Url(codeVerifier),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
      cookie: Object.freeze({
        name: TRANSACTION_COOKIE_NAME,
        value: handle,
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        domain: undefined,
        expiresAt: new Date(now.getTime() + this.ttlMs).toISOString()
      })
    });
  }

  consume({ handle, state, redirectUri, providerId = "oidc", now = new Date() }) {
    const reference = this.referenceHasher.hash(
      "oidc.transaction",
      assertBoundedString("transaction handle", handle, { minimum: 32, maximum: 128 })
    );
    const transaction = this.#transactions.get(reference);
    this.#transactions.delete(reference);
    if (!transaction || new Date(transaction.expiresAt) <= now) {
      throw authenticationError("oidc_transaction_rejected", "login transaction is not active");
    }
    const suppliedState = this.referenceHasher.hash(
      "oidc.state",
      assertBoundedString("state", state, { minimum: 32, maximum: 128 })
    );
    if (
      transaction.providerId !== assertSafeIdentifier("providerId", providerId) ||
      !constantTimeEqual(suppliedState, transaction.stateRefHash) ||
      exactRedirectUri(redirectUri) !== transaction.redirectUri
    ) {
      throw authenticationError("oidc_transaction_rejected", "login transaction validation failed");
    }
    return Object.freeze({ ...transaction });
  }

  #prune(now) {
    for (const [reference, transaction] of this.#transactions) {
      if (new Date(transaction.expiresAt) <= now) this.#transactions.delete(reference);
    }
  }
}

export function expiredTransactionCookie() {
  return Object.freeze({
    name: TRANSACTION_COOKIE_NAME,
    value: "",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    domain: undefined,
    maxAge: 0,
    expiresAt: "1970-01-01T00:00:00.000Z"
  });
}

export { TRANSACTION_COOKIE_NAME };
