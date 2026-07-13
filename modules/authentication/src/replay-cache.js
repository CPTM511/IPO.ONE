import {
  assertBoundedString,
  authenticationError,
  epochSeconds
} from "./security-utils.js";

export class InMemoryReplayCache {
  #entries = new Map();

  constructor({ referenceHasher, maximumEntries = 50_000 }) {
    if (!referenceHasher || typeof referenceHasher.hash !== "function") {
      throw authenticationError("invalid_authentication_configuration", "referenceHasher is required");
    }
    if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1 || maximumEntries > 1_000_000) {
      throw authenticationError("invalid_authentication_configuration", "maximumEntries is invalid");
    }
    this.referenceHasher = referenceHasher;
    this.maximumEntries = maximumEntries;
  }

  consume({ namespace, value, expiresAt, now = new Date() }) {
    assertBoundedString("replay namespace", namespace, {
      maximum: 64,
      pattern: /^[a-z][a-z0-9_.-]+$/
    });
    assertBoundedString("replay value", value, { maximum: 512 });
    const expiration = Number(expiresAt);
    const current = epochSeconds(now);
    if (!Number.isSafeInteger(expiration) || expiration <= current || expiration - current > 86_400) {
      throw authenticationError("invalid_replay_window", "replay window is invalid");
    }
    this.#prune(current);
    const reference = this.referenceHasher.hash(`replay.${namespace}`, value);
    if (this.#entries.has(reference)) {
      throw authenticationError("authentication_replay_rejected", "authentication proof was already used");
    }
    if (this.#entries.size >= this.maximumEntries) {
      throw authenticationError("authentication_replay_capacity_exceeded", "replay protection capacity is exhausted");
    }
    this.#entries.set(reference, expiration);
    return reference;
  }

  #prune(current) {
    for (const [reference, expiration] of this.#entries) {
      if (expiration <= current) this.#entries.delete(reference);
    }
  }
}
