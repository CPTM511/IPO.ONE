import {
  assertBoundedString,
  assertSafeIdentifier,
  authenticationError,
  epochSeconds
} from "./security-utils.js";

function replayInput({
  namespace,
  value,
  expiresAt,
  now = new Date()
}) {
  assertBoundedString("replay namespace", namespace, {
    maximum: 64,
    pattern: /^[a-z][a-z0-9_.-]+$/
  });
  assertBoundedString("replay value", value, { maximum: 512 });
  const expiration = Number(expiresAt);
  const current = epochSeconds(now);
  if (
    !Number.isSafeInteger(expiration) ||
    expiration <= current ||
    expiration - current > 86_400
  ) {
    throw authenticationError(
      "invalid_replay_window",
      "replay window is invalid"
    );
  }
  return Object.freeze({
    namespace,
    value,
    expiration,
    current,
    now
  });
}

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

  consume(input) {
    const {
      namespace,
      value,
      expiration,
      current
    } = replayInput(input);
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

export class PostgresReplayCache {
  constructor({
    eventRepository,
    tenantId,
    referenceHasher,
    maximumEntries = 50_000
  }) {
    if (
      !eventRepository ||
      typeof eventRepository.withTenantWrite !== "function" ||
      eventRepository.tenantContext?.tenantId !== tenantId
    ) {
      throw authenticationError(
        "invalid_authentication_configuration",
        "PostgreSQL replay cache requires a Tenant transaction repository"
      );
    }
    if (!referenceHasher || typeof referenceHasher.hash !== "function") {
      throw authenticationError(
        "invalid_authentication_configuration",
        "referenceHasher is required"
      );
    }
    if (
      !Number.isSafeInteger(maximumEntries) ||
      maximumEntries < 1 ||
      maximumEntries > 1_000_000
    ) {
      throw authenticationError(
        "invalid_authentication_configuration",
        "maximumEntries is invalid"
      );
    }
    this.eventRepository = eventRepository;
    this.tenantId = assertSafeIdentifier("tenantId", tenantId);
    this.referenceHasher = referenceHasher;
    this.maximumEntries = maximumEntries;
  }

  async consume(input) {
    const {
      namespace,
      value,
      expiration,
      now
    } = replayInput(input);
    const reference = this.referenceHasher.hash(
      `replay.${namespace}`,
      value
    );
    return this.eventRepository.withTenantWrite(async (client) => {
      await client.query(
        `DELETE FROM authentication_replay_entries
          WHERE tenant_id = $1
            AND expires_at <= $2`,
        [this.tenantId, now]
      );
      const inserted = await client.query(
         `INSERT INTO authentication_replay_entries(
           tenant_id, reference_hash, namespace, expires_at, created_at,
           reference_hash_key_version, schema_version
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           'authentication_replay_entry.v1'
         )
         ON CONFLICT (tenant_id, reference_hash) DO NOTHING
         RETURNING reference_hash`,
        [
          this.tenantId,
          reference,
          namespace,
          new Date(expiration * 1_000),
          now,
          this.referenceHasher.keyVersion
        ]
      );
      if (inserted.rowCount !== 1) {
        throw authenticationError(
          "authentication_replay_rejected",
          "authentication proof was already used"
        );
      }
      const capacity = await client.query(
        `SELECT count(*)::int AS count
           FROM authentication_replay_entries
          WHERE tenant_id = $1`,
        [this.tenantId]
      );
      if (capacity.rows[0]?.count > this.maximumEntries) {
        throw authenticationError(
          "authentication_replay_capacity_exceeded",
          "replay protection capacity is exhausted"
        );
      }
      return reference;
    });
  }
}
