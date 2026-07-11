import assert from "node:assert/strict";
import test from "node:test";
import { createAuditEvent, createCreditEvent } from "../../../packages/domain/src/index.js";
import { EventStore } from "../src/index.js";

test("event store is append-only and filters timelines", () => {
  const store = new EventStore();
  const event = createCreditEvent({
    eventType: "subject_created",
    subjectId: "subject_1",
    payload: { subjectId: "subject_1" }
  });

  store.appendCreditEvent(event);
  store.appendAuditEvent(
    createAuditEvent({
      actorId: "admin",
      actionType: "review",
      targetType: "subject",
      targetId: "subject_1",
      reason: "test",
      payload: { subjectId: "subject_1" }
    })
  );

  assert.equal(store.listCreditEvents({ subjectId: "subject_1" }).length, 1);
  assert.equal(store.timeline("subject_1").length, 2);
  const evidence = store.listEvidenceEnvelopes({ aggregateType: "subject", aggregateId: "subject_1" });
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].schemaVersion, "evidence_event.v2");
  assert.equal(evidence[0].aggregateVersion, 1);
  assert.equal(evidence[1].aggregateVersion, 2);
  assert.equal(evidence[0].payloadHash.length, 66);
  assert.throws(() => store.appendCreditEvent(event), /duplicate_credit_event/);
});

test("evidence envelopes increment aggregate versions and isolate stored payloads", () => {
  const store = new EventStore();
  const first = createCreditEvent({ eventType: "subject_created", subjectId: "subject_1", payload: { status: "pending" } });
  const second = createCreditEvent({ eventType: "subject_status_changed", subjectId: "subject_1", payload: { status: "active" } });
  store.appendCreditEvent(first);
  store.appendCreditEvent(second);

  const listed = store.listEvidenceEnvelopes({ aggregateType: "subject", aggregateId: "subject_1" });
  listed[0].payload.status = "tampered";

  assert.deepEqual(listed.map((item) => item.aggregateVersion), [1, 2]);
  assert.equal(store.listEvidenceEnvelopes({ aggregateType: "subject" })[0].payload.status, "pending");
});
