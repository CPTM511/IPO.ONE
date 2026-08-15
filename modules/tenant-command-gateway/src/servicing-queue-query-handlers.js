import { DomainError } from "../../../packages/domain/src/index.js";

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,768}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const CLASSIFICATIONS = Object.freeze([
  "defaulted",
  "dpd_61_89",
  "dpd_31_60",
  "dpd_1_30",
  "grace_period"
]);
const CLASSIFICATION_SET = new Set(CLASSIFICATIONS);
const REVIEW_BY_CLASSIFICATION = Object.freeze({
  defaulted: Object.freeze({ priority: "critical", reviewCode: "default_resolution_review" }),
  dpd_61_89: Object.freeze({ priority: "high", reviewCode: "pre_default_review" }),
  dpd_31_60: Object.freeze({ priority: "elevated", reviewCode: "late_stage_review" }),
  dpd_1_30: Object.freeze({ priority: "watch", reviewCode: "early_delinquency_review" }),
  grace_period: Object.freeze({ priority: "monitor", reviewCode: "grace_monitor" })
});

function canonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function invalidPayload() {
  throw new DomainError(
    "invalid_tenant_command_payload",
    "Servicing queue query payload is invalid"
  );
}

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function filterKey(classifications) {
  return classifications.join(".");
}

function parsePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) invalidPayload();
  if (Object.keys(payload).some((key) => !["classifications", "limit", "cursor"].includes(key))) {
    invalidPayload();
  }

  const limit = payload.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) invalidPayload();

  let classifications = CLASSIFICATIONS;
  if (payload.classifications !== undefined) {
    if (
      !Array.isArray(payload.classifications) ||
      payload.classifications.length < 1 ||
      payload.classifications.length > CLASSIFICATIONS.length ||
      new Set(payload.classifications).size !== payload.classifications.length ||
      payload.classifications.some((value) => !CLASSIFICATION_SET.has(value))
    ) invalidPayload();
    const requested = new Set(payload.classifications);
    classifications = CLASSIFICATIONS.filter((value) => requested.has(value));
  }

  const page = { classifications, limit };
  if (payload.cursor === undefined) return page;
  if (typeof payload.cursor !== "string" || !CURSOR_PATTERN.test(payload.cursor)) invalidPayload();

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload.cursor, "base64url").toString("utf8"));
  } catch {
    invalidPayload();
  }
  if (
    !Array.isArray(decoded) ||
    decoded.length !== 6 ||
    decoded[0] !== "sq1" ||
    !Number.isSafeInteger(decoded[1]) ||
    decoded[1] < 1 ||
    decoded[1] > CLASSIFICATIONS.length ||
    !Number.isSafeInteger(decoded[2]) ||
    decoded[2] < 0 ||
    !canonicalTimestamp(decoded[3]) ||
    typeof decoded[4] !== "string" ||
    !IDENTIFIER_PATTERN.test(decoded[4]) ||
    decoded[5] !== filterKey(classifications)
  ) invalidPayload();

  return {
    ...page,
    afterPriorityRank: decoded[1],
    afterDaysPastDue: decoded[2],
    afterOldestDueAt: decoded[3],
    afterObligationId: decoded[4]
  };
}

function createCursor(item, classifications) {
  return Buffer.from(JSON.stringify([
    "sq1",
    item.priorityRank,
    item.daysPastDue,
    item.oldestDueAt,
    item.obligationId,
    filterKey(classifications)
  ]), "utf8").toString("base64url");
}

function summarizeCase(item) {
  const review = REVIEW_BY_CLASSIFICATION[item.servicingClassification];
  if (!review) {
    throw new DomainError(
      "projection_integrity_mismatch",
      "Servicing queue classification is inconsistent"
    );
  }
  return {
    obligationId: item.obligationId,
    subjectId: item.subjectId,
    assetId: item.assetId,
    status: item.status,
    servicingClassification: item.servicingClassification,
    daysPastDue: item.daysPastDue,
    priority: review.priority,
    reviewCode: review.reviewCode,
    outstandingPrincipalMinor: item.outstandingPrincipalMinor,
    outstandingInterestMinor: item.outstandingInterestMinor,
    outstandingFeesMinor: item.outstandingFeesMinor,
    outstandingTotalMinor: item.outstandingTotalMinor,
    pastDuePrincipalMinor: item.pastDuePrincipalMinor,
    pastDueInterestMinor: item.pastDueInterestMinor,
    pastDueFeesMinor: item.pastDueFeesMinor,
    pastDueTotalMinor: item.pastDueTotalMinor,
    oldestUnpaidInstallmentId: item.oldestUnpaidInstallmentId,
    oldestDueAt: item.oldestDueAt,
    servicingEffectiveAt: item.servicingEffectiveAt,
    scheduleSequence: item.scheduleSequence,
    servicingOwnerCode: item.servicingOwnerCode,
    ...(item.latestServicingAction ? { latestServicingAction: item.latestServicingAction } : {}),
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: "servicing_queue_case.v1"
  };
}

export function readServicingQueueQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadServicingQueue",
    kind: "query",
    async execute({ client, coreRepository, authorizationDecision, payload, now }) {
      const page = parsePayload(payload);
      if (
        authorizationDecision?.resourceType !== "servicing_queue" ||
        typeof authorizationDecision.resourceId !== "string" ||
        authorizationDecision.resourceId.length === 0
      ) unavailable();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new DomainError("invalid_tenant_command_clock", "tenant command clock is invalid");
      }

      const rows = await coreRepository.getServicingOperationsQueueInTransaction(client, {
        classifications: page.classifications,
        limit: page.limit + 1,
        ...(page.afterPriorityRank === undefined ? {} : {
          afterPriorityRank: page.afterPriorityRank,
          afterDaysPastDue: page.afterDaysPastDue,
          afterOldestDueAt: page.afterOldestDueAt,
          afterObligationId: page.afterObligationId
        })
      });
      const hasMore = rows.length > page.limit;
      const visibleRows = rows.slice(0, page.limit);
      const cases = visibleRows.map(summarizeCase);
      return {
        queueId: authorizationDecision.resourceId,
        asOf: now.toISOString(),
        filters: { classifications: page.classifications },
        cases,
        page: {
          limit: page.limit,
          hasMore,
          ...(hasMore && visibleRows.length > 0
            ? { nextCursor: createCursor(visibleRows.at(-1), page.classifications) }
            : {})
        },
        safety: {
          readOnly: true,
          piiIncluded: false,
          dispositionAuthority: false,
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false
        },
        schemaVersion: "tenant_servicing_queue_view.v1"
      };
    }
  });
}

export function createServicingQueueQueryHandlers() {
  return Object.freeze([readServicingQueueQueryHandler()]);
}
