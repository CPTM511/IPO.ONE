import { DomainError, FinalityStatus, createEvidenceEnvelope } from "../../../packages/domain/src/index.js";

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function aggregateForCreditEvent(event) {
  const candidates = [
    ["transfer_intent", event.payload?.transferIntentId],
    ["mandate", event.payload?.mandateId],
    ["plugin", event.payload?.pluginId],
    ["obligation", event.obligationId],
    ["lockbox", event.payload?.lockboxId],
    ["credit_line", event.payload?.creditLineId],
    ["spend_request", event.payload?.spendRequestId],
    ["ledger_transaction", event.payload?.ledgerTransactionId],
    ["subject", event.subjectId]
  ];
  const selected = candidates.find(([, id]) => typeof id === "string" && id.length > 0);
  return selected ? { aggregateType: selected[0], aggregateId: selected[1] } : { aggregateType: "protocol", aggregateId: event.eventType };
}

function matchesFilter(event, filter) {
  return Object.entries(filter).every(([key, value]) => value === undefined || event[key] === value);
}

export class EventStore {
  #creditEvents = [];
  #auditEvents = [];
  #seenCreditIds = new Set();
  #seenAuditIds = new Set();
  #evidenceEnvelopes = [];
  #aggregateVersions = new Map();

  appendCreditEvent(event) {
    if (this.#seenCreditIds.has(event.eventId)) {
      throw new DomainError("duplicate_credit_event", "credit event ids are append-only and unique", {
        eventId: event.eventId
      });
    }
    const { aggregateType, aggregateId } = aggregateForCreditEvent(event);
    const envelope = this.#buildEvidence({
      eventId: event.eventId,
      eventType: event.eventType,
      aggregateType,
      aggregateId,
      subjectId: event.subjectId,
      obligationId: event.obligationId,
      causationId: event.payload?.causationId,
      correlationId: event.payload?.correlationId ?? event.subjectId,
      idempotencyKey: event.payload?.idempotencyKey,
      actorRef: event.payload?.actorId ?? "system:ipo.one.demo",
      sourceFinality: event.finalityStatus,
      payload: event.payload ?? {},
      occurredAt: event.occurredAt
    });
    this.#seenCreditIds.add(event.eventId);
    this.#creditEvents.push(deepFreeze(clone(event)));
    this.#evidenceEnvelopes.push(deepFreeze(envelope));
    return event;
  }

  appendAuditEvent(event) {
    if (this.#seenAuditIds.has(event.auditEventId)) {
      throw new DomainError("duplicate_audit_event", "audit event ids are append-only and unique", {
        auditEventId: event.auditEventId
      });
    }
    const envelope = this.#buildEvidence({
      eventId: event.auditEventId,
      eventType: event.actionType,
      aggregateType: event.targetType,
      aggregateId: event.targetId,
      subjectId: event.payload?.subjectId,
      correlationId: event.payload?.subjectId,
      actorRef: event.actorId,
      sourceFinality: FinalityStatus.FINALIZED,
      payload: { reason: event.reason, ...event.payload },
      occurredAt: event.occurredAt
    });
    this.#seenAuditIds.add(event.auditEventId);
    this.#auditEvents.push(deepFreeze(clone(event)));
    this.#evidenceEnvelopes.push(deepFreeze(envelope));
    return event;
  }

  listCreditEvents(filter = {}) {
    return this.#creditEvents.filter((event) => matchesFilter(event, filter)).map(clone);
  }

  listAuditEvents(filter = {}) {
    return this.#auditEvents.filter((event) => matchesFilter(event, filter)).map(clone);
  }

  listEvidenceEnvelopes(filter = {}) {
    return this.#evidenceEnvelopes.filter((envelope) => matchesFilter(envelope, filter)).map(clone);
  }

  timeline(subjectId) {
    const credit = this.listCreditEvents({ subjectId }).map((event) => ({ kind: "credit", ...event }));
    const audit = this.listAuditEvents().filter((event) => event.payload?.subjectId === subjectId || event.targetId === subjectId);
    return [...credit, ...audit.map((event) => ({ kind: "audit", ...event }))].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt)
    );
  }

  #buildEvidence(input) {
    const aggregateKey = `${input.aggregateType}\0${input.aggregateId}`;
    const aggregateVersion = (this.#aggregateVersions.get(aggregateKey) ?? 0) + 1;
    const envelope = createEvidenceEnvelope({
      ...input,
      aggregateVersion,
      sourceSystem: "ipo.one.demo",
      recordedAt: new Date().toISOString()
    });
    this.#aggregateVersions.set(aggregateKey, aggregateVersion);
    return envelope;
  }
}
