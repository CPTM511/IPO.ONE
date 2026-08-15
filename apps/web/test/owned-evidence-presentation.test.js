import assert from "node:assert/strict";
import test from "node:test";
import {
  createBoundedOwnedEvidenceProjection,
  hasOwnedEvidenceMarker,
  mergeBoundedOwnedEvidenceItems,
  newestOwnedEvidenceFirst,
  ownedEvidenceVerificationState,
  retainMatchingEvidenceAnchors
} from "../src/owned-evidence-presentation.js";

function evidence(version, overrides = {}) {
  return {
    evidenceId: `event_owned_evidence_${version}`,
    evidenceHash: `0x${String(version % 10).repeat(64)}`,
    eventType: `event_${version}`,
    aggregateType: "obligation",
    aggregateId: "obligation_owned_evidence_test",
    aggregateVersion: version,
    obligationId: "obligation_owned_evidence_test",
    sourceFinality: "finalized",
    payloadHash: `0x${String((version + 1) % 10).repeat(64)}`,
    occurredAt: `2026-07-31T00:${String(version).padStart(2, "0")}:00.000Z`,
    recordedAt: `2026-07-31T00:${String(version).padStart(2, "0")}:00.100Z`,
    schemaVersion: "obligation_evidence_summary.v1",
    ...overrides
  };
}

test("latest-first presentation does not mutate canonical chronology", () => {
  const canonical = [evidence(1), evidence(2), evidence(3)];
  const presented = newestOwnedEvidenceFirst(canonical);

  assert.deepEqual(presented.map(({ aggregateVersion }) => aggregateVersion), [3, 2, 1]);
  assert.deepEqual(canonical.map(({ aggregateVersion }) => aggregateVersion), [1, 2, 3]);
});

test("bounded page merge deduplicates an exact cursor boundary", () => {
  const first = [evidence(1), evidence(2)];
  const result = mergeBoundedOwnedEvidenceItems({
    existingItems: first,
    incomingItems: [structuredClone(first[1]), evidence(3)],
    limit: 50
  });

  assert.deepEqual(result.items.map(({ aggregateVersion }) => aggregateVersion), [1, 2, 3]);
  assert.equal(result.truncated, false);
});

test("bounded page merge fails closed on duplicate Evidence drift", () => {
  assert.throws(
    () => mergeBoundedOwnedEvidenceItems({
      existingItems: [evidence(1)],
      incomingItems: [evidence(1, { evidenceHash: `0x${"f".repeat(64)}` })],
      limit: 50
    }),
    /page drifted/
  );
});

test("bounded page merge retains the latest canonical window", () => {
  const result = mergeBoundedOwnedEvidenceItems({
    existingItems: Array.from({ length: 40 }, (_, index) => evidence(index + 1)),
    incomingItems: Array.from({ length: 20 }, (_, index) => evidence(index + 41)),
    limit: 50
  });

  assert.equal(result.items.length, 50);
  assert.equal(result.items[0].aggregateVersion, 11);
  assert.equal(result.items.at(-1).aggregateVersion, 60);
  assert.equal(result.truncated, true);
});

test("bounded page merge rejects an invalid display limit", () => {
  assert.throws(
    () => mergeBoundedOwnedEvidenceItems({ incomingItems: [], limit: 0 }),
    /presentation input is invalid/
  );
});

test("bounded projection reports an incomplete timeline without hiding its cursor", () => {
  const result = createBoundedOwnedEvidenceProjection({
    limit: 50,
    obligationId: "obligation_owned_evidence_test",
    response: {
      obligationId: "obligation_owned_evidence_test",
      asOf: "2026-07-31T01:00:00.000Z",
      items: [evidence(1), evidence(2)],
      hasMore: true,
      nextCursor: "evidence_cursor_page_2"
    }
  });

  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, "evidence_cursor_page_2");
  assert.match(result.helper, /Bounded partial timeline/);
  assert.match(result.helper, /absolute latest event is not yet proven/);
});

test("bounded projection rejects a cross-Obligation Evidence item", () => {
  assert.throws(
    () => createBoundedOwnedEvidenceProjection({
      limit: 50,
      obligationId: "obligation_owned_evidence_test",
      response: {
        obligationId: "obligation_owned_evidence_test",
        asOf: "2026-07-31T01:00:00.000Z",
        items: [evidence(1, { obligationId: "obligation_other" })],
        hasMore: false
      }
    }),
    /did not match the requested Obligation/
  );
});

test("bounded projection fails closed on ambiguous pagination", () => {
  const base = {
    obligationId: "obligation_owned_evidence_test",
    asOf: "2026-07-31T01:00:00.000Z",
    items: [evidence(1)]
  };
  for (const response of [
    base,
    { ...base, hasMore: "false" },
    { ...base, hasMore: true },
    { ...base, hasMore: false, nextCursor: "unexpected_cursor" }
  ]) {
    assert.throws(
      () => createBoundedOwnedEvidenceProjection({
        limit: 50,
        obligationId: base.obligationId,
        response
      }),
      /did not match the requested Obligation/
    );
  }
});

test("expected Evidence marker binds event, Obligation, server time and a valid version", () => {
  const marker = {
    eventType: "repayment_posted",
    obligationId: "obligation_owned_evidence_test",
    occurredAt: evidence(4).occurredAt
  };
  assert.equal(hasOwnedEvidenceMarker([
    evidence(3),
    evidence(4, { eventType: "repayment_posted" })
  ], marker), true);
  assert.equal(hasOwnedEvidenceMarker([
    evidence(4, {
      eventType: "repayment_posted",
      obligationId: "obligation_other"
    })
  ], marker), false);
  assert.equal(hasOwnedEvidenceMarker([
    evidence(4, {
      eventType: "repayment_posted",
      occurredAt: "2026-07-31T00:05:00.000Z"
    })
  ], marker), false);
  assert.equal(hasOwnedEvidenceMarker([
    evidence(4, {
      eventType: "repayment_posted",
      aggregateVersion: 0
    })
  ], marker), false);
});

test("verification state distinguishes partial cursor from delayed proof", () => {
  const base = {
    busy: false,
    error: false,
    expectedMarker: false,
    hasMore: false,
    itemCount: 3,
    queried: true,
    resourceMatches: true
  };
  assert.equal(ownedEvidenceVerificationState(base), "latest_proven");
  assert.equal(ownedEvidenceVerificationState({ ...base, hasMore: true }), "partial");
  assert.equal(ownedEvidenceVerificationState({
    ...base,
    error: true,
    expectedMarker: true,
    itemCount: 0,
    queried: false
  }), "delayed");
  assert.equal(ownedEvidenceVerificationState({ ...base, itemCount: 0 }), "delayed");
  assert.equal(ownedEvidenceVerificationState({
    ...base,
    resourceMatches: false
  }), "not_loaded");
});

test("anchor projection drops hashes evicted by the bounded Evidence cap", () => {
  const uniqueHash = (value) => `0x${value.toString(16).padStart(64, "0")}`;
  const retainedEvidence = Array.from(
    { length: 50 },
    (_, index) => evidence(index + 11, { evidenceHash: uniqueHash(index + 11) })
  );
  const priorAnchors = Array.from({ length: 40 }, (_, index) => ({
    evidenceHash: uniqueHash(index + 1),
    status: "finalized"
  }));
  const retained = retainMatchingEvidenceAnchors(priorAnchors, retainedEvidence);

  assert.equal(retained.length, 30);
  assert.deepEqual(
    retained.map(({ evidenceHash }) => evidenceHash),
    priorAnchors.slice(10).map(({ evidenceHash }) => evidenceHash)
  );
});
