import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceEnvelope } from "../src/index.js";

test("evidence envelope hashes survive JSON serialization and replay", () => {
  const envelope = createEvidenceEnvelope({
    eventId: "event_1",
    eventType: "subject_created",
    aggregateType: "subject",
    aggregateId: "subject_1",
    aggregateVersion: 1,
    subjectId: "subject_1",
    actorRef: "principal_1",
    sourceSystem: "ipo.one.test",
    payload: { status: "pending", optionalReference: undefined },
    attestationRefs: [],
    occurredAt: "2026-07-10T00:00:00.000Z",
    recordedAt: "2026-07-10T00:00:01.000Z"
  });
  const transported = JSON.parse(JSON.stringify(envelope));
  const replayed = createEvidenceEnvelope(transported);

  assert.equal(replayed.evidenceHash, envelope.evidenceHash);
  assert.equal("obligationId" in transported, false);
  assert.equal("optionalReference" in transported.payload, false);
});

test("evidence envelope rejects raw PII and secret-bearing payloads", () => {
  assert.throws(
    () =>
      createEvidenceEnvelope({
        eventId: "event_1",
        eventType: "identity_checked",
        aggregateType: "subject",
        aggregateId: "subject_1",
        aggregateVersion: 1,
        actorRef: "plugin_1",
        sourceSystem: "ipo.one.test",
        payload: { passportNumber: "raw-value" },
        occurredAt: "2026-07-10T00:00:00.000Z"
      }),
    /raw_pii_prohibited/
  );
});
