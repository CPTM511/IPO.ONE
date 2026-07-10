import { DomainError } from "../../../packages/domain/src/index.js";

function clone(value) {
  return structuredClone(value);
}

function matchesFilter(event, filter) {
  return Object.entries(filter).every(([key, value]) => value === undefined || event[key] === value);
}

export class EventStore {
  #creditEvents = [];
  #auditEvents = [];
  #seenCreditIds = new Set();
  #seenAuditIds = new Set();

  appendCreditEvent(event) {
    if (this.#seenCreditIds.has(event.eventId)) {
      throw new DomainError("duplicate_credit_event", "credit event ids are append-only and unique", {
        eventId: event.eventId
      });
    }
    this.#seenCreditIds.add(event.eventId);
    this.#creditEvents.push(Object.freeze(clone(event)));
    return event;
  }

  appendAuditEvent(event) {
    if (this.#seenAuditIds.has(event.auditEventId)) {
      throw new DomainError("duplicate_audit_event", "audit event ids are append-only and unique", {
        auditEventId: event.auditEventId
      });
    }
    this.#seenAuditIds.add(event.auditEventId);
    this.#auditEvents.push(Object.freeze(clone(event)));
    return event;
  }

  listCreditEvents(filter = {}) {
    return this.#creditEvents.filter((event) => matchesFilter(event, filter)).map(clone);
  }

  listAuditEvents(filter = {}) {
    return this.#auditEvents.filter((event) => matchesFilter(event, filter)).map(clone);
  }

  timeline(subjectId) {
    const credit = this.listCreditEvents({ subjectId }).map((event) => ({ kind: "credit", ...event }));
    const audit = this.listAuditEvents().filter((event) => event.payload?.subjectId === subjectId || event.targetId === subjectId);
    return [...credit, ...audit.map((event) => ({ kind: "audit", ...event }))].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt)
    );
  }
}
