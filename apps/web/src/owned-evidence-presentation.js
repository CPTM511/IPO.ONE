const EVIDENCE_INTEGRITY_FIELDS = Object.freeze([
  "evidenceHash",
  "eventType",
  "aggregateType",
  "aggregateId",
  "aggregateVersion",
  "obligationId",
  "sourceFinality",
  "payloadHash",
  "occurredAt",
  "recordedAt",
  "schemaVersion"
]);

function sameEvidenceSummary(left, right) {
  return EVIDENCE_INTEGRITY_FIELDS.every((field) => left[field] === right[field]);
}

export function mergeBoundedOwnedEvidenceItems({
  existingItems = [],
  incomingItems = [],
  limit
}) {
  if (
    !Array.isArray(existingItems) ||
    !Array.isArray(incomingItems) ||
    !Number.isSafeInteger(limit) ||
    limit < 1
  ) {
    throw new TypeError("Owned Evidence presentation input is invalid.");
  }

  const merged = [];
  const byEvidenceId = new Map();
  for (const item of [...existingItems, ...incomingItems]) {
    if (!item || typeof item.evidenceId !== "string" || item.evidenceId.length === 0) {
      throw new TypeError("Owned Evidence item identity is invalid.");
    }
    const prior = byEvidenceId.get(item.evidenceId);
    if (prior) {
      if (!sameEvidenceSummary(prior, item)) {
        throw new Error("Owned Evidence page drifted for an existing event.");
      }
      continue;
    }
    byEvidenceId.set(item.evidenceId, item);
    merged.push(item);
  }

  return {
    items: merged.slice(-limit),
    truncated: merged.length > limit
  };
}

export function createBoundedOwnedEvidenceProjection({
  append = false,
  currentItems = [],
  limit,
  obligationId,
  response,
  sourceLabel = "Owner/controller-authorized",
  wasCapped = false
}) {
  if (
    response?.obligationId !== obligationId ||
    typeof response.asOf !== "string" ||
    !Array.isArray(response.items) ||
    response.items.some((item) => item?.obligationId !== obligationId) ||
    typeof response.hasMore !== "boolean" ||
    (response.hasMore
      ? typeof response.nextCursor !== "string" || response.nextCursor.length === 0
      : response.nextCursor !== undefined)
  ) {
    throw new Error("The owned Evidence response did not match the requested Obligation.");
  }
  const merged = mergeBoundedOwnedEvidenceItems({
    existingItems: append ? currentItems : [],
    incomingItems: response.items,
    limit
  });
  const hasMore = response.hasMore;
  const capped = (append && wasCapped) || merged.truncated;
  const helper = hasMore
    ? `Bounded partial timeline: ${merged.items.length} ${sourceLabel} Evidence events are visible. The absolute latest event is not yet proven; Load more continues the read-only cursor and never retries a lifecycle action.`
    : capped
      ? `Latest ${merged.items.length} ${sourceLabel} Evidence events are visible. Earlier events remain outside the ${limit}-event browser cap; canonical chronology is unchanged.`
      : `${merged.items.length} ${sourceLabel} Evidence event${merged.items.length === 1 ? "" : "s"} loaded from the complete bounded server timeline. Latest events are shown first; digests are not blockchain transactions.`;
  return {
    items: merged.items,
    obligationId,
    nextCursor: hasMore ? response.nextCursor : null,
    hasMore,
    capped,
    asOf: response.asOf,
    helper
  };
}

export function newestOwnedEvidenceFirst(items) {
  if (!Array.isArray(items)) {
    throw new TypeError("Owned Evidence items must be an array.");
  }
  return [...items].reverse();
}

export function ownedEvidenceVerificationState({
  busy,
  error,
  expectedMarker,
  hasMore,
  itemCount,
  queried,
  resourceMatches
}) {
  if (
    typeof busy !== "boolean" ||
    typeof error !== "boolean" ||
    typeof expectedMarker !== "boolean" ||
    typeof hasMore !== "boolean" ||
    !Number.isSafeInteger(itemCount) ||
    itemCount < 0 ||
    typeof queried !== "boolean" ||
    typeof resourceMatches !== "boolean"
  ) {
    throw new TypeError("Owned Evidence verification state is invalid.");
  }
  if (!resourceMatches) return "not_loaded";
  if (busy) return "loading";
  if (error || expectedMarker && !hasMore) return "delayed";
  if (!queried) return "not_loaded";
  if (hasMore) return "partial";
  return itemCount > 0 ? "latest_proven" : "delayed";
}

export function retainMatchingEvidenceAnchors(anchorItems, evidenceItems) {
  if (!Array.isArray(anchorItems) || !Array.isArray(evidenceItems)) {
    throw new TypeError("Evidence anchor projection input is invalid.");
  }
  const hashes = new Set(evidenceItems.map(({ evidenceHash }) => evidenceHash));
  return anchorItems.filter(({ evidenceHash }) => hashes.has(evidenceHash));
}

export function hasOwnedEvidenceMarker(items, marker) {
  if (
    !Array.isArray(items) ||
    typeof marker?.eventType !== "string" ||
    typeof marker.obligationId !== "string" ||
    typeof marker.occurredAt !== "string"
  ) return false;
  return items.some((item) => (
    item.eventType === marker.eventType &&
    item.obligationId === marker.obligationId &&
    item.occurredAt === marker.occurredAt &&
    Number.isSafeInteger(item.aggregateVersion) &&
    item.aggregateVersion > 0
  ));
}
