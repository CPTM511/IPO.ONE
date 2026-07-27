import { createServicingCasePresentation } from "./servicing-case-presentation.js";

export const OBLIGATION_PORTFOLIO_PRESENTATION_VERSION =
  "obligation_portfolio_presentation.v1";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const MINOR = /^(?:0|[1-9][0-9]{0,30})$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const ENTRY_MODES = new Set(["human", "agent"]);
const RELATIONSHIPS = new Set(["owner", "controller"]);
const FINALITIES = new Set([
  "pending",
  "confirmed",
  "finalized",
  "reorged",
  "invalidated"
]);
const CORRECTION_EVENTS = new Set(["projection_repaired"]);
const RESOLUTION_EVENTS = new Set([
  "obligation_restructured",
  "obligation_repurchased",
  "obligation_written_off"
]);

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function closedRecord(value, required, optional = []) {
  if (!plainRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") &&
      !descriptor.get && !descriptor.set;
  });
}

function validTimestamp(value) {
  if (typeof value !== "string" || !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function minor(value) {
  if (typeof value !== "string" || !MINOR.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function normalizeEvidenceItem(item, obligationId) {
  if (
    !closedRecord(item, [
      "evidenceId",
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
    ]) ||
    !IDENTIFIER.test(item.evidenceId ?? "") ||
    !IDENTIFIER.test(item.eventType ?? "") ||
    !IDENTIFIER.test(item.aggregateType ?? "") ||
    !IDENTIFIER.test(item.aggregateId ?? "") ||
    item.obligationId !== obligationId ||
    !HASH.test(item.evidenceHash ?? "") ||
    !HASH.test(item.payloadHash ?? "") ||
    !Number.isSafeInteger(item.aggregateVersion) ||
    item.aggregateVersion < 1 ||
    !FINALITIES.has(item.sourceFinality) ||
    !validTimestamp(item.occurredAt) ||
    !validTimestamp(item.recordedAt) ||
    new Date(item.recordedAt).getTime() < new Date(item.occurredAt).getTime() ||
    item.schemaVersion !== "obligation_evidence_summary.v1"
  ) return null;

  const historyKind = CORRECTION_EVENTS.has(item.eventType)
    ? "explicit_correction"
    : RESOLUTION_EVENTS.has(item.eventType)
      ? "explicit_resolution"
      : new Set(["reorged", "invalidated"]).has(item.sourceFinality)
        ? "invalidated_observation"
        : "append_only_event";
  return {
    evidenceId: item.evidenceId,
    evidenceHash: item.evidenceHash,
    payloadHash: item.payloadHash,
    eventType: item.eventType,
    aggregateType: item.aggregateType,
    aggregateId: item.aggregateId,
    aggregateVersion: item.aggregateVersion,
    sourceFinality: item.sourceFinality,
    occurredAt: item.occurredAt,
    recordedAt: item.recordedAt,
    historyKind,
    appendOnly: true,
    schemaVersion: "obligation_history_item.v1"
  };
}

function normalizeEvidence(evidence, obligationId, viewAsOf) {
  if (evidence === null) {
    return {
      queried: false,
      items: [],
      loadedObligationAggregateVersion: null,
      hasMore: false,
      asOf: null
    };
  }
  if (
    !closedRecord(
      evidence,
      ["obligationId", "asOf", "items", "hasMore", "schemaVersion"],
      ["nextCursor"]
    ) ||
    evidence.obligationId !== obligationId ||
    evidence.schemaVersion !== "tenant_owned_obligation_evidence_view.v1" ||
    !validTimestamp(evidence.asOf) ||
    new Date(evidence.asOf).getTime() < new Date(viewAsOf).getTime() ||
    typeof evidence.hasMore !== "boolean" ||
    !Array.isArray(evidence.items) ||
    evidence.items.length > 50 ||
    (evidence.hasMore && (
      typeof evidence.nextCursor !== "string" ||
      !/^[A-Za-z0-9_-]{1,512}$/.test(evidence.nextCursor)
    )) ||
    (!evidence.hasMore && evidence.nextCursor !== undefined)
  ) return null;

  const items = [];
  const ids = new Set();
  for (const item of evidence.items) {
    const normalized = normalizeEvidenceItem(item, obligationId);
    if (!normalized || ids.has(normalized.evidenceId)) return null;
    ids.add(normalized.evidenceId);
    items.push(normalized);
  }
  const obligationVersions = items
    .filter((item) => (
      item.aggregateType === "obligation" &&
      item.aggregateId === obligationId
    ))
    .map(({ aggregateVersion }) => aggregateVersion);
  return {
    queried: true,
    items,
    loadedObligationAggregateVersion: obligationVersions.length > 0
      ? Math.max(...obligationVersions)
      : null,
    hasMore: evidence.hasMore,
    asOf: evidence.asOf
  };
}

function scheduleRows(obligation, servicing) {
  return obligation.installments.map((row, index) => {
    const scheduled = [
      minor(row.scheduledPrincipalMinor),
      minor(row.scheduledInterestMinor),
      minor(row.scheduledFeeMinor)
    ];
    const paid = [
      minor(row.paidPrincipalMinor),
      minor(row.paidInterestMinor),
      minor(row.paidFeeMinor)
    ];
    if ([...scheduled, ...paid].some((value) => value === null)) return null;
    const scheduledTotal = scheduled.reduce((sum, value) => sum + value, 0n);
    const paidTotal = paid.reduce((sum, value) => sum + value, 0n);
    const servicingRow = servicing.installments[index];
    if (
      servicingRow?.installmentId !== row.installmentId ||
      BigInt(servicingRow.outstandingMinor) !== scheduledTotal - paidTotal
    ) return null;
    return {
      installmentId: row.installmentId,
      installmentNumber: row.installmentNumber,
      dueAt: row.dueAt,
      status: row.status,
      scheduledMinor: String(scheduledTotal),
      paidMinor: String(paidTotal),
      outstandingMinor: servicingRow.outstandingMinor,
      scheduleSequence: row.scheduleSequence,
      schemaVersion: "obligation_schedule_row_presentation.v1"
    };
  });
}

export function createObligationPortfolioPresentation(input) {
  if (
    !closedRecord(input, ["view", "relationship", "entryMode", "evidence"]) ||
    !RELATIONSHIPS.has(input.relationship) ||
    !ENTRY_MODES.has(input.entryMode)
  ) return null;
  const view = input.view;
  if (
    !closedRecord(
      view,
      [
        "obligation",
        "asOf",
        "sandboxOnly",
        "productionFundsMoved",
        "withdrawable",
        "schemaVersion"
      ],
      ["latestServicingAction"]
    ) ||
    view.schemaVersion !== "tenant_owned_obligation_view.v1" ||
    view.sandboxOnly !== true ||
    view.productionFundsMoved !== false ||
    view.withdrawable !== false ||
    !validTimestamp(view.asOf)
  ) return null;
  const obligation = view.obligation;
  const servicing = createServicingCasePresentation(
    obligation,
    view.latestServicingAction
  );
  if (!servicing) return null;
  const evidence = normalizeEvidence(input.evidence, obligation.obligationId, view.asOf);
  if (!evidence) return null;
  const schedule = scheduleRows(obligation, servicing);
  if (schedule.some((row) => row === null)) return null;
  const originalPrincipal = minor(obligation.originalPrincipalMinor);
  const outstandingPrincipal = minor(obligation.outstandingPrincipalMinor);
  const outstandingInterest = minor(obligation.outstandingInterestMinor);
  const outstandingFees = minor(obligation.outstandingFeesMinor);
  const totalRepaid = minor(obligation.totalRepaidMinor);
  const writtenOffPrincipal = minor(obligation.writtenOffPrincipalMinor);
  const writtenOffInterest = minor(obligation.writtenOffInterestMinor);
  const writtenOffFees = minor(obligation.writtenOffFeesMinor);
  if ([
    originalPrincipal,
    outstandingPrincipal,
    outstandingInterest,
    outstandingFees,
    totalRepaid,
    writtenOffPrincipal,
    writtenOffInterest,
    writtenOffFees
  ].some((value) => value === null)) return null;
  if (
    outstandingPrincipal + totalRepaid + writtenOffPrincipal > originalPrincipal ||
    String(outstandingPrincipal + outstandingInterest + outstandingFees) !==
      servicing.outstandingMinor
  ) return null;
  const executed = obligation.executionStatus === "executed";
  if (
    executed !== Boolean(
      obligation.sandboxExecutionReceiptId &&
      IDENTIFIER.test(obligation.sandboxExecutionReceiptId)
    )
  ) return null;
  const authorityLabel = obligation.authorityType === "consent"
    ? "Human Consent"
    : obligation.authorityType === "mandate"
      ? "Agent Mandate"
      : null;
  if (!authorityLabel || !IDENTIFIER.test(obligation.authorityId ?? "")) return null;

  return deepFreeze({
    obligationId: obligation.obligationId,
    relationship: input.relationship,
    entryMode: input.entryMode,
    kernel: "obligation.v2",
    authority: {
      type: obligation.authorityType,
      id: obligation.authorityId,
      label: authorityLabel,
      presentationOnly: true,
      schemaVersion: "obligation_authority_presentation.v1"
    },
    lifecycle: {
      status: servicing.lifecycleStatus,
      servicingClassification: servicing.classification,
      daysPastDue: servicing.daysPastDue,
      reasonCode: obligation.servicingReasonCode,
      effectiveAt: servicing.servicingEffectiveAt,
      latestAction: servicing.latestAction,
      schemaVersion: "obligation_lifecycle_presentation.v1"
    },
    amounts: {
      assetId: obligation.assetId,
      originalPrincipalMinor: obligation.originalPrincipalMinor,
      outstandingPrincipalMinor: obligation.outstandingPrincipalMinor,
      outstandingInterestMinor: obligation.outstandingInterestMinor,
      outstandingFeesMinor: obligation.outstandingFeesMinor,
      outstandingTotalMinor: servicing.outstandingMinor,
      pastDueMinor: servicing.pastDueMinor,
      totalRepaidMinor: obligation.totalRepaidMinor,
      writtenOffPrincipalMinor: obligation.writtenOffPrincipalMinor,
      writtenOffInterestMinor: obligation.writtenOffInterestMinor,
      writtenOffFeesMinor: obligation.writtenOffFeesMinor,
      reconciledFromCanonicalSchedule: true,
      schemaVersion: "obligation_amounts_presentation.v1"
    },
    terms: {
      annualRateBps: obligation.annualRateBps,
      repaymentFrequency: obligation.repaymentFrequency,
      installmentCount: obligation.installmentCount,
      firstPaymentAt: obligation.firstPaymentAt,
      maturityAt: obligation.maturityAt,
      schemaVersion: "obligation_terms_presentation.v1"
    },
    executionRail: {
      status: obligation.executionStatus,
      profile: executed ? "signed_local_sandbox" : "not_executed",
      label: executed ? "Signed local sandbox rail" : "Not executed",
      receiptReferenceId: executed ? obligation.sandboxExecutionReceiptId : null,
      executedAt: executed ? obligation.executedAt : null,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "obligation_execution_rail_presentation.v1"
    },
    stateVersion: {
      obligationSchemaVersion: obligation.schemaVersion,
      obligationHash: obligation.obligationHash,
      scheduleVersion: obligation.scheduleVersion,
      scheduleSequence: obligation.scheduleSequence,
      scheduleHash: obligation.scheduleHash,
      loadedEvidenceAggregateVersion: evidence.loadedObligationAggregateVersion,
      updatedAt: obligation.updatedAt,
      trustedAsOf: view.asOf,
      schemaVersion: "obligation_state_version_presentation.v1"
    },
    schedule,
    history: {
      queried: evidence.queried,
      items: evidence.items,
      hasMore: evidence.hasMore,
      asOf: evidence.asOf,
      appendOnly: true,
      correctionsAreExplicit: true,
      schemaVersion: "obligation_history_presentation.v1"
    },
    serverAuthoritative: true,
    browserLedger: false,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: OBLIGATION_PORTFOLIO_PRESENTATION_VERSION
  });
}
