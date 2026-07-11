import { DomainError, hashId } from "../../../packages/domain/src/index.js";

const APPEND_QUEUES = new WeakMap();

function clone(value) {
  return structuredClone(value);
}

function assertNonEmptyString(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new DomainError("invalid_repository_input", `${name} must be a non-empty string`, { name });
  }
}

function matchesAggregate(event, aggregateType, aggregateId) {
  return event.payload?.transferIntentId === aggregateId && aggregateType === "transfer_intent";
}

export class EventStoreEventRepository {
  constructor({ eventStore }) {
    if (!eventStore) {
      throw new DomainError("event_store_required", "EventStoreEventRepository requires an EventStore");
    }
    this.eventStore = eventStore;
    if (!APPEND_QUEUES.has(eventStore)) APPEND_QUEUES.set(eventStore, Promise.resolve());
  }

  async findCommand({ idempotencyKey, commandHash }) {
    assertNonEmptyString("idempotencyKey", idempotencyKey);
    assertNonEmptyString("commandHash", commandHash);
    const event = this.eventStore
      .listCreditEvents()
      .find((candidate) => candidate.payload?.idempotencyKey === idempotencyKey);
    if (!event) return undefined;
    if (event.payload.commandHash !== commandHash) {
      throw new DomainError("event_idempotency_conflict", "idempotency key was reused with a different command", {
        idempotencyKey
      });
    }
    return { event: clone(event), replayed: true };
  }

  appendCommand(input) {
    const pending = APPEND_QUEUES.get(this.eventStore).then(() => this.#appendCommand(input));
    APPEND_QUEUES.set(this.eventStore, pending.catch(() => undefined));
    return pending;
  }

  async #appendCommand({ aggregateType, aggregateId, expectedVersion, idempotencyKey, commandHash, event }) {
    for (const [name, value] of Object.entries({ aggregateType, aggregateId, idempotencyKey, commandHash })) {
      assertNonEmptyString(name, value);
    }
    const replay = await this.findCommand({ idempotencyKey, commandHash });
    if (replay) return replay;
    if (event?.payloadHash !== hashId("event_payload", event?.payload ?? {})) {
      throw new DomainError("invalid_event_payload_hash", "event payload hash does not match its payload", {
        eventId: event?.eventId
      });
    }

    const actualVersion = await this.getStreamVersion({ aggregateType, aggregateId });
    if (actualVersion !== expectedVersion) {
      throw new DomainError("stale_aggregate_version", "aggregate changed since it was read", {
        aggregateType,
        aggregateId,
        expectedVersion,
        actualVersion
      });
    }
    this.eventStore.appendCreditEvent(event);
    const evidence = this.eventStore
      .listEvidenceEnvelopes({ aggregateType, aggregateId })
      .find((candidate) => candidate.eventId === event.eventId);
    return { event: clone(event), evidence: clone(evidence), replayed: false };
  }

  async listEvents({ aggregateType, aggregateId } = {}) {
    const events = this.eventStore.listCreditEvents();
    if (aggregateType === undefined && aggregateId === undefined) return events;
    if (aggregateType !== undefined) assertNonEmptyString("aggregateType", aggregateType);
    if (aggregateId !== undefined) assertNonEmptyString("aggregateId", aggregateId);
    return events.filter((event) => {
      if (aggregateType !== undefined && aggregateId !== undefined) {
        return matchesAggregate(event, aggregateType, aggregateId);
      }
      const evidence = this.eventStore
        .listEvidenceEnvelopes({ eventId: event.eventId })
        .find((candidate) =>
          (aggregateType === undefined || candidate.aggregateType === aggregateType) &&
          (aggregateId === undefined || candidate.aggregateId === aggregateId)
        );
      return evidence !== undefined;
    });
  }

  async listEvidence(filter = {}) {
    return this.eventStore.listEvidenceEnvelopes(filter);
  }

  async getStreamVersion({ aggregateType, aggregateId }) {
    return this.eventStore.listEvidenceEnvelopes({ aggregateType, aggregateId }).length;
  }
}
