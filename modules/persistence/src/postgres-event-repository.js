import {
  DomainError,
  createEvidenceEnvelope,
  hashId
} from "../../../packages/domain/src/index.js";

const RETRYABLE_TRANSACTION_CODES = new Set(["40001", "40P01"]);

function clone(value) {
  return structuredClone(value);
}

function assertString(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new DomainError("invalid_repository_input", `${name} must be a non-empty string`, { name });
  }
}

function toSafeVersion(value, name = "aggregateVersion") {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new DomainError("invalid_aggregate_version", `${name} must be a non-negative safe integer`, {
      [name]: value
    });
  }
  return version;
}

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function json(value) {
  return JSON.stringify(value);
}

function mapEvidenceRow(row) {
  if (!row) return undefined;
  return {
    evidenceId: row.id,
    evidenceHash: row.evidence_hash,
    eventId: row.id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: toSafeVersion(row.aggregate_version),
    subjectId: row.subject_id ?? undefined,
    obligationId: row.obligation_id ?? undefined,
    causationId: row.causation_id ?? undefined,
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    actorRef: row.actor_ref,
    sourceSystem: row.source_system,
    sourceFinality: row.source_finality,
    payloadHash: row.payload_hash,
    payloadRef: row.payload_ref ?? undefined,
    payload: row.payload,
    attestationRefs: row.attestation_refs,
    occurredAt: timestamp(row.occurred_at),
    recordedAt: timestamp(row.recorded_at),
    schemaVersion: row.schema_version
  };
}

function mapOutboxRow(row) {
  return {
    outboxMessageId: row.id,
    eventId: row.event_id,
    topic: row.topic,
    messageKey: row.message_key,
    payload: row.payload,
    payloadHash: row.payload_hash,
    headers: row.headers,
    occurredAt: timestamp(row.occurred_at),
    availableAt: timestamp(row.available_at),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lockedBy: row.locked_by ?? undefined,
    lockedAt: row.locked_at ? timestamp(row.locked_at) : undefined,
    publishedAt: row.published_at ? timestamp(row.published_at) : undefined,
    deadLetteredAt: row.dead_lettered_at ? timestamp(row.dead_lettered_at) : undefined,
    lastError: row.last_error ?? undefined,
    createdAt: timestamp(row.created_at),
    schemaVersion: "outbox_message.v1"
  };
}

function mapInboxRow(row) {
  if (!row) return undefined;
  return {
    consumerName: row.consumer_name,
    eventId: row.event_id,
    payloadHash: row.payload_hash,
    status: row.status,
    attempts: row.attempts,
    result: row.result_json ?? undefined,
    lastError: row.last_error ?? undefined,
    receivedAt: timestamp(row.received_at),
    processedAt: row.processed_at ? timestamp(row.processed_at) : undefined,
    updatedAt: timestamp(row.updated_at),
    schemaVersion: "inbox_message.v1"
  };
}

export class PostgresEventRepository {
  constructor({
    pool,
    sourceSystem = "ipo.one.postgres",
    outboxTopic = "ipo.one.domain-events.v1",
    transactionRetries = 3,
    maxOutboxAttempts = 12,
    clock = () => new Date(),
    faultInjector
  }) {
    if (!pool || typeof pool.connect !== "function" || typeof pool.query !== "function") {
      throw new DomainError("postgres_pool_required", "PostgresEventRepository requires a pg-compatible pool");
    }
    assertString("sourceSystem", sourceSystem);
    assertString("outboxTopic", outboxTopic);
    if (!Number.isSafeInteger(transactionRetries) || transactionRetries < 0 || transactionRetries > 10) {
      throw new DomainError("invalid_transaction_retries", "transactionRetries must be an integer from 0 through 10");
    }
    if (!Number.isSafeInteger(maxOutboxAttempts) || maxOutboxAttempts < 1) {
      throw new DomainError("invalid_outbox_attempts", "maxOutboxAttempts must be a positive safe integer");
    }
    this.pool = pool;
    this.sourceSystem = sourceSystem;
    this.outboxTopic = outboxTopic;
    this.transactionRetries = transactionRetries;
    this.maxOutboxAttempts = maxOutboxAttempts;
    this.clock = clock;
    this.faultInjector = faultInjector;
  }

  async findCommand({ idempotencyKey, commandHash }) {
    assertString("idempotencyKey", idempotencyKey);
    assertString("commandHash", commandHash);
    const result = await this.pool.query(
      `SELECT c.command_hash, c.status, c.event_id, d.event_json
         FROM command_idempotency c
         LEFT JOIN domain_events d ON d.id = c.event_id
        WHERE c.idempotency_key = $1`,
      [idempotencyKey]
    );
    if (result.rowCount === 0) return undefined;
    const row = result.rows[0];
    if (row.command_hash !== commandHash) {
      throw new DomainError("event_idempotency_conflict", "idempotency key was reused with a different command", {
        idempotencyKey
      });
    }
    if (row.status !== "completed" || !row.event_json) {
      throw new DomainError("incomplete_idempotent_command", "idempotent command exists without a completed event", {
        idempotencyKey
      });
    }
    return { event: clone(row.event_json), replayed: true };
  }

  async appendCommand({
    aggregateType,
    aggregateId,
    expectedVersion,
    idempotencyKey,
    commandHash,
    event,
    outboxTopic = this.outboxTopic
  }) {
    for (const [name, value] of Object.entries({ aggregateType, aggregateId, idempotencyKey, commandHash, outboxTopic })) {
      assertString(name, value);
    }
    const normalizedExpectedVersion = toSafeVersion(expectedVersion, "expectedVersion");
    if (!event || typeof event !== "object") {
      throw new DomainError("invalid_domain_event", "event must be an object");
    }
    for (const name of ["eventId", "eventType", "payloadHash", "occurredAt", "schemaVersion"]) {
      assertString(`event.${name}`, event[name]);
    }
    const computedEventPayloadHash = hashId("event_payload", event.payload ?? {});
    if (event.payloadHash !== computedEventPayloadHash) {
      throw new DomainError("invalid_event_payload_hash", "event payload hash does not match its payload", {
        eventId: event.eventId
      });
    }

    return this.#withSerializableTransaction(async (client) => {
      const insertedCommand = await client.query(
        `INSERT INTO command_idempotency(
           idempotency_key, command_hash, aggregate_type, aggregate_id, status
         ) VALUES ($1, $2, $3, $4, 'processing')
         ON CONFLICT DO NOTHING
         RETURNING idempotency_key`,
        [idempotencyKey, commandHash, aggregateType, aggregateId]
      );

      if (insertedCommand.rowCount === 0) {
        const existing = await client.query(
          `SELECT c.command_hash, c.status, c.event_id, d.event_json
             FROM command_idempotency c
             LEFT JOIN domain_events d ON d.id = c.event_id
            WHERE c.idempotency_key = $1
            FOR UPDATE OF c`,
          [idempotencyKey]
        );
        const row = existing.rows[0];
        if (!row || row.command_hash !== commandHash) {
          throw new DomainError("event_idempotency_conflict", "idempotency key was reused with a different command", {
            idempotencyKey
          });
        }
        if (row.status !== "completed" || !row.event_json) {
          throw new DomainError("incomplete_idempotent_command", "idempotent command is not complete", {
            idempotencyKey
          });
        }
        return { event: clone(row.event_json), replayed: true };
      }

      await this.#injectFault("after_command_reserved", { aggregateType, aggregateId, idempotencyKey, client });
      await client.query(
        `INSERT INTO aggregate_stream_heads(aggregate_type, aggregate_id, current_version)
         VALUES ($1, $2, 0)
         ON CONFLICT DO NOTHING`,
        [aggregateType, aggregateId]
      );
      const headResult = await client.query(
        `SELECT current_version
           FROM aggregate_stream_heads
          WHERE aggregate_type = $1 AND aggregate_id = $2
          FOR UPDATE`,
        [aggregateType, aggregateId]
      );
      const actualVersion = toSafeVersion(headResult.rows[0].current_version);
      if (actualVersion !== normalizedExpectedVersion) {
        throw new DomainError("stale_aggregate_version", "aggregate changed since it was read", {
          aggregateType,
          aggregateId,
          expectedVersion: normalizedExpectedVersion,
          actualVersion
        });
      }
      const aggregateVersion = actualVersion + 1;
      if (
        event.payload?.intentVersion !== undefined &&
        toSafeVersion(event.payload.intentVersion, "intentVersion") !== aggregateVersion
      ) {
        throw new DomainError("event_version_mismatch", "event payload version does not match the aggregate stream", {
          aggregateVersion,
          intentVersion: event.payload.intentVersion
        });
      }

      const recordedAt = this.clock().toISOString();
      const evidence = createEvidenceEnvelope({
        eventId: event.eventId,
        eventType: event.eventType,
        aggregateType,
        aggregateId,
        aggregateVersion,
        subjectId: event.subjectId,
        obligationId: event.obligationId,
        causationId: event.payload?.causationId,
        correlationId: event.payload?.correlationId ?? event.subjectId ?? event.eventId,
        idempotencyKey,
        actorRef: event.payload?.actorId ?? "system:ipo.one.postgres",
        sourceSystem: this.sourceSystem,
        sourceFinality: event.finalityStatus,
        payload: event.payload ?? {},
        occurredAt: event.occurredAt,
        recordedAt
      });

      await client.query(
        `INSERT INTO domain_events(
           id, event_type, aggregate_type, aggregate_id, aggregate_version,
           subject_id, obligation_id, source_finality, payload_hash, payload,
           event_json, occurred_at, recorded_at, schema_version
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10,
           $11, $12, $13, $14
         )`,
        [
          event.eventId,
          event.eventType,
          aggregateType,
          aggregateId,
          aggregateVersion,
          event.subjectId ?? null,
          event.obligationId ?? null,
          event.finalityStatus,
          event.payloadHash,
          json(event.payload ?? {}),
          json(event),
          event.occurredAt,
          recordedAt,
          event.schemaVersion
        ]
      );
      await this.#injectFault("after_event_inserted", { aggregateType, aggregateId, idempotencyKey, client });

      await client.query(
        `INSERT INTO credit_events(
           id, event_type, subject_id, obligation_id, payload_hash, payload_ref,
           finality_status, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)`,
        [
          event.eventId,
          event.eventType,
          event.subjectId ?? null,
          event.obligationId ?? null,
          event.payloadHash,
          event.finalityStatus,
          event.occurredAt
        ]
      );
      await client.query(
        `INSERT INTO evidence_envelopes(
           id, evidence_hash, event_type, aggregate_type, aggregate_id,
           aggregate_version, subject_id, obligation_id, causation_id,
           correlation_id, idempotency_key, actor_ref, source_system,
           source_finality, payload_hash, payload_ref, payload,
           attestation_refs, occurred_at, recorded_at, schema_version
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9,
           $10, $11, $12, $13,
           $14, $15, $16, $17,
           $18, $19, $20, $21
         )`,
        [
          evidence.evidenceId,
          evidence.evidenceHash,
          evidence.eventType,
          evidence.aggregateType,
          evidence.aggregateId,
          evidence.aggregateVersion,
          evidence.subjectId ?? null,
          evidence.obligationId ?? null,
          evidence.causationId ?? null,
          evidence.correlationId,
          evidence.idempotencyKey,
          evidence.actorRef,
          evidence.sourceSystem,
          evidence.sourceFinality,
          evidence.payloadHash,
          evidence.payloadRef ?? null,
          json(evidence.payload),
          json(evidence.attestationRefs),
          evidence.occurredAt,
          evidence.recordedAt,
          evidence.schemaVersion
        ]
      );

      const durableEvent = {
        ...event,
        aggregateType,
        aggregateId,
        aggregateVersion
      };
      const outboxPayload = { event: durableEvent, evidence };
      const outboxMessageId = `outbox_${event.eventId}`;
      await client.query(
        `INSERT INTO outbox_messages(
           id, event_id, topic, message_key, payload, payload_hash, headers,
           occurred_at, max_attempts
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          outboxMessageId,
          event.eventId,
          outboxTopic,
          aggregateId,
          json(outboxPayload),
          hashId("outbox_payload", outboxPayload),
          json({ aggregateType, aggregateVersion, schemaVersion: event.schemaVersion }),
          event.occurredAt,
          this.maxOutboxAttempts
        ]
      );
      await this.#injectFault("after_outbox_inserted", { aggregateType, aggregateId, idempotencyKey, client });

      await client.query(
        `UPDATE aggregate_stream_heads
            SET current_version = $3, updated_at = clock_timestamp()
          WHERE aggregate_type = $1 AND aggregate_id = $2`,
        [aggregateType, aggregateId, aggregateVersion]
      );
      await client.query(
        `UPDATE command_idempotency
            SET status = 'completed', event_id = $2, response_json = $3,
                updated_at = clock_timestamp()
          WHERE idempotency_key = $1`,
        [idempotencyKey, event.eventId, json({ eventId: event.eventId, aggregateVersion })]
      );

      return { event: clone(event), evidence: clone(evidence), replayed: false };
    });
  }

  async listEvents({ aggregateType, aggregateId } = {}) {
    const values = [];
    const where = [];
    if (aggregateType !== undefined) {
      assertString("aggregateType", aggregateType);
      values.push(aggregateType);
      where.push(`aggregate_type = $${values.length}`);
    }
    if (aggregateId !== undefined) {
      assertString("aggregateId", aggregateId);
      values.push(aggregateId);
      where.push(`aggregate_id = $${values.length}`);
    }
    const result = await this.pool.query(
      `SELECT event_json
         FROM domain_events
        ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY aggregate_type, aggregate_id, aggregate_version`,
      values
    );
    return result.rows.map((row) => clone(row.event_json));
  }

  async listEvidence({ aggregateType, aggregateId } = {}) {
    const values = [];
    const where = [];
    if (aggregateType !== undefined) {
      assertString("aggregateType", aggregateType);
      values.push(aggregateType);
      where.push(`aggregate_type = $${values.length}`);
    }
    if (aggregateId !== undefined) {
      assertString("aggregateId", aggregateId);
      values.push(aggregateId);
      where.push(`aggregate_id = $${values.length}`);
    }
    const result = await this.pool.query(
      `SELECT *
         FROM evidence_envelopes
        ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY aggregate_type, aggregate_id, aggregate_version`,
      values
    );
    return result.rows.map(mapEvidenceRow);
  }

  async getStreamVersion({ aggregateType, aggregateId }) {
    assertString("aggregateType", aggregateType);
    assertString("aggregateId", aggregateId);
    const result = await this.pool.query(
      `SELECT current_version
         FROM aggregate_stream_heads
        WHERE aggregate_type = $1 AND aggregate_id = $2`,
      [aggregateType, aggregateId]
    );
    return result.rowCount === 0 ? 0 : toSafeVersion(result.rows[0].current_version);
  }

  async claimOutboxBatch({ workerId, limit = 100, leaseMs = 30_000 } = {}) {
    assertString("workerId", workerId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new DomainError("invalid_outbox_limit", "outbox claim limit must be an integer from 1 through 1000");
    }
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) {
      throw new DomainError("invalid_outbox_lease", "outbox leaseMs must be a positive safe integer");
    }
    return this.#withSerializableTransaction(async (client) => {
      await client.query(
        `UPDATE outbox_messages
            SET locked_by = NULL,
                locked_at = NULL,
                dead_lettered_at = clock_timestamp(),
                last_error = COALESCE(last_error, 'delivery lease expired after final attempt')
          WHERE published_at IS NULL
            AND dead_lettered_at IS NULL
            AND attempts >= max_attempts
            AND locked_at < clock_timestamp() - ($1::bigint * interval '1 millisecond')`,
        [leaseMs]
      );
      const result = await client.query(
        `WITH candidates AS (
           SELECT id
             FROM outbox_messages
            WHERE published_at IS NULL
              AND dead_lettered_at IS NULL
              AND available_at <= clock_timestamp()
              AND attempts < max_attempts
              AND (
                locked_at IS NULL
                OR locked_at < clock_timestamp() - ($3::bigint * interval '1 millisecond')
              )
            ORDER BY occurred_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT $2
         )
         UPDATE outbox_messages o
            SET locked_by = $1,
                locked_at = clock_timestamp(),
                attempts = o.attempts + 1
           FROM candidates c
          WHERE o.id = c.id
         RETURNING o.*`,
        [workerId, limit, leaseMs]
      );
      return result.rows.map(mapOutboxRow);
    });
  }

  async markOutboxPublished({ outboxMessageId, workerId }) {
    assertString("outboxMessageId", outboxMessageId);
    assertString("workerId", workerId);
    const result = await this.pool.query(
      `UPDATE outbox_messages
          SET published_at = clock_timestamp(), locked_by = NULL, locked_at = NULL,
              last_error = NULL
        WHERE id = $1
          AND locked_by = $2
          AND published_at IS NULL
          AND dead_lettered_at IS NULL
      RETURNING *`,
      [outboxMessageId, workerId]
    );
    if (result.rowCount !== 1) {
      throw new DomainError("outbox_lease_not_owned", "outbox message is not leased by this worker", {
        outboxMessageId,
        workerId
      });
    }
    return mapOutboxRow(result.rows[0]);
  }

  async markOutboxFailed({ outboxMessageId, workerId, error, retryAt = new Date() }) {
    assertString("outboxMessageId", outboxMessageId);
    assertString("workerId", workerId);
    const message = error instanceof Error ? error.message : String(error);
    const normalizedRetryAt = retryAt instanceof Date ? retryAt.toISOString() : new Date(retryAt).toISOString();
    const result = await this.pool.query(
      `UPDATE outbox_messages
          SET locked_by = NULL,
              locked_at = NULL,
              last_error = $3,
              available_at = CASE WHEN attempts >= max_attempts THEN available_at ELSE $4 END,
              dead_lettered_at = CASE WHEN attempts >= max_attempts THEN clock_timestamp() ELSE NULL END
        WHERE id = $1
          AND locked_by = $2
          AND published_at IS NULL
          AND dead_lettered_at IS NULL
      RETURNING *`,
      [outboxMessageId, workerId, message.slice(0, 2000), normalizedRetryAt]
    );
    if (result.rowCount !== 1) {
      throw new DomainError("outbox_lease_not_owned", "outbox message is not leased by this worker", {
        outboxMessageId,
        workerId
      });
    }
    return mapOutboxRow(result.rows[0]);
  }

  async listOutbox({ includePublished = true, includeDeadLettered = true } = {}) {
    const where = [];
    if (!includePublished) where.push("published_at IS NULL");
    if (!includeDeadLettered) where.push("dead_lettered_at IS NULL");
    const result = await this.pool.query(
      `SELECT * FROM outbox_messages
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY occurred_at, id`
    );
    return result.rows.map(mapOutboxRow);
  }

  async processInbox({ consumerName, eventId, payload, payloadHash, handler }) {
    assertString("consumerName", consumerName);
    assertString("eventId", eventId);
    if (typeof handler !== "function") {
      throw new DomainError("inbox_handler_required", "processInbox requires a transactional handler");
    }
    const computedPayloadHash = hashId("inbox_payload", payload);
    if (payloadHash !== undefined && payloadHash !== computedPayloadHash) {
      throw new DomainError("inbox_payload_hash_mismatch", "provided inbox payload hash is invalid", { eventId });
    }

    return this.#withSerializableTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO inbox_messages(consumer_name, event_id, payload_hash, status, attempts)
         VALUES ($1, $2, $3, 'processing', 1)
         ON CONFLICT DO NOTHING
         RETURNING consumer_name`,
        [consumerName, eventId, computedPayloadHash]
      );
      const existing = await client.query(
        `SELECT *
           FROM inbox_messages
          WHERE consumer_name = $1 AND event_id = $2
          FOR UPDATE`,
        [consumerName, eventId]
      );
      const row = existing.rows[0];
      if (row.payload_hash !== computedPayloadHash) {
        throw new DomainError("inbox_payload_conflict", "inbox event id was reused with a different payload", {
          consumerName,
          eventId
        });
      }
      if (inserted.rowCount === 0 && row.status === "completed") {
        return { result: clone(row.result_json), replayed: true, inbox: mapInboxRow(row) };
      }
      if (inserted.rowCount === 0) {
        await client.query(
          `UPDATE inbox_messages
              SET attempts = attempts + 1, updated_at = clock_timestamp()
            WHERE consumer_name = $1 AND event_id = $2`,
          [consumerName, eventId]
        );
      }

      const handlerResult = await handler({ client, payload: clone(payload), eventId, consumerName });
      if (handlerResult === undefined) {
        throw new DomainError("inbox_result_required", "inbox handler must return a JSON-compatible result");
      }
      const normalizedResult = JSON.parse(JSON.stringify(handlerResult));
      await this.#injectFault("before_inbox_complete", { consumerName, eventId, client });
      const completed = await client.query(
        `UPDATE inbox_messages
            SET status = 'completed', result_json = $3, processed_at = clock_timestamp(),
                updated_at = clock_timestamp(), last_error = NULL
          WHERE consumer_name = $1 AND event_id = $2
        RETURNING *`,
        [consumerName, eventId, json(normalizedResult)]
      );
      return { result: clone(normalizedResult), replayed: false, inbox: mapInboxRow(completed.rows[0]) };
    });
  }

  async getInboxMessage({ consumerName, eventId }) {
    assertString("consumerName", consumerName);
    assertString("eventId", eventId);
    const result = await this.pool.query(
      "SELECT * FROM inbox_messages WHERE consumer_name = $1 AND event_id = $2",
      [consumerName, eventId]
    );
    return result.rowCount === 0 ? undefined : mapInboxRow(result.rows[0]);
  }

  async #withSerializableTransaction(operation) {
    for (let attempt = 0; attempt <= this.transactionRetries; attempt += 1) {
      const client = await this.pool.connect();
      let retry = false;
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original transaction error.
        }
        if (!RETRYABLE_TRANSACTION_CODES.has(error.code) || attempt === this.transactionRetries) throw error;
        retry = true;
      } finally {
        client.release();
      }
      if (retry) await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
    }
    throw new DomainError("transaction_retry_exhausted", "PostgreSQL transaction retry budget was exhausted");
  }

  async #injectFault(stage, context) {
    if (this.faultInjector) await this.faultInjector({ stage, ...context });
  }
}
