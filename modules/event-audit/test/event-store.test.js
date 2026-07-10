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
  assert.throws(() => store.appendCreditEvent(event), /duplicate_credit_event/);
});
