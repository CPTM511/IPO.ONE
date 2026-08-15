import {
  CreditEventType,
  DomainError,
  SubjectStatus,
  SubjectType,
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";
import { ResourceKind } from "../../abuse-control/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const FEEDBACK_SCHEMA_VERSION = "pilot_feedback_record.v1";
const PAYLOAD_KEYS = Object.freeze([
  "surface",
  "lifecycleStage",
  "sentiment",
  "outcome",
  "blockerCode",
  "schemaVersion"
]);
const SURFACES = Object.freeze({
  humanPortfolio: "human_portfolio",
  humanApplication: "human_application",
  humanOffer: "human_offer",
  humanPayments: "human_payments",
  agentProtocol: "agent_protocol",
  agentSdk: "agent_sdk",
  agentMcp: "agent_mcp",
  evidence: "evidence",
  servicing: "servicing"
});
const LIFECYCLE_STAGES = Object.freeze({
  onboarding: "onboarding",
  application: "application",
  offer: "offer",
  obligation: "obligation",
  execution: "execution",
  repayment: "repayment",
  servicing: "servicing",
  evidence: "evidence"
});
const SENTIMENTS = Object.freeze({
  blocked: "blocked",
  difficult: "difficult",
  neutral: "neutral",
  easy: "easy",
  valuable: "valuable"
});
const OUTCOMES = Object.freeze({
  incomplete: "incomplete",
  completed: "completed",
  needsSupport: "needs_support"
});
const BLOCKER_CODES = Object.freeze({
  none: "none",
  unclearCopy: "unclear_copy",
  missingCapability: "missing_capability",
  authentication: "authentication",
  authoritySetup: "authority_setup",
  identityProof: "identity_proof",
  creditTerms: "credit_terms",
  execution: "execution",
  repayment: "repayment",
  servicing: "servicing",
  evidence: "evidence",
  integration: "integration",
  otherNoText: "other_no_text"
});
const DIMENSIONS = Object.freeze({
  entryModes: Object.freeze({ human: "human", agent: "agent" }),
  surfaces: SURFACES,
  lifecycleStages: LIFECYCLE_STAGES,
  sentiments: SENTIMENTS,
  outcomes: OUTCOMES,
  blockerCodes: BLOCKER_CODES
});
const ACTIVE_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);
const HUMAN_SURFACES = new Set([
  SURFACES.humanPortfolio,
  SURFACES.humanApplication,
  SURFACES.humanOffer,
  SURFACES.humanPayments,
  SURFACES.evidence,
  SURFACES.servicing
]);
const AGENT_SURFACES = new Set([
  SURFACES.agentProtocol,
  SURFACES.agentSdk,
  SURFACES.agentMcp,
  SURFACES.evidence,
  SURFACES.servicing
]);

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function normalizeFeedbackPayload(payload, actorType) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== PAYLOAD_KEYS.length ||
    Object.keys(payload).some((key) => !PAYLOAD_KEYS.includes(key)) ||
    payload.schemaVersion !== FEEDBACK_SCHEMA_VERSION ||
    !Object.values(SURFACES).includes(payload.surface) ||
    !Object.values(LIFECYCLE_STAGES).includes(payload.lifecycleStage) ||
    !Object.values(SENTIMENTS).includes(payload.sentiment) ||
    !Object.values(OUTCOMES).includes(payload.outcome) ||
    !Object.values(BLOCKER_CODES).includes(payload.blockerCode)
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Pilot feedback must use the closed categorical contract"
    );
  }
  const allowedSurfaces = actorType === ActorType.HUMAN ? HUMAN_SURFACES : AGENT_SURFACES;
  if (!allowedSurfaces.has(payload.surface)) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Pilot feedback surface does not match the authenticated entry mode"
    );
  }
  if (
    (payload.outcome === OUTCOMES.completed && payload.blockerCode !== BLOCKER_CODES.none) ||
    (payload.sentiment === SENTIMENTS.blocked && payload.blockerCode === BLOCKER_CODES.none)
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Pilot feedback outcome and blocker code are inconsistent"
    );
  }
  return Object.freeze(structuredClone(payload));
}

function parseCount(value, field) {
  const canonical = typeof value === "number" ? String(value) : value;
  if (typeof canonical !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(canonical)) {
    throw new DomainError("invalid_pilot_feedback_projection", `${field} is invalid`);
  }
  const parsed = Number(canonical);
  if (!Number.isSafeInteger(parsed)) {
    throw new DomainError("invalid_pilot_feedback_projection", `${field} is outside the safe range`);
  }
  return parsed;
}

function alias(group, key) {
  const snake = (value) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return `${snake(group)}_${snake(key)}`;
}

const SUMMARY_FIELDS = Object.freeze(Object.fromEntries(
  Object.entries(DIMENSIONS).flatMap(([group, codes]) =>
    Object.entries(codes).map(([key, code]) => [alias(group, key), { group, key, code }])
  )
));

const SUMMARY_SQL = `
  SELECT
    COUNT(*)::text AS total_count,
    ${Object.entries(SUMMARY_FIELDS).map(([field, { group, code }]) => {
      const column = group === "entryModes"
        ? "entry_mode"
        : group === "lifecycleStages"
          ? "lifecycle_stage"
          : group === "blockerCodes"
            ? "blocker_code"
            : group.slice(0, -1);
      return `COUNT(*) FILTER (WHERE ${column} = '${code}')::text AS ${field}`;
    }).join(",\n    ")}
  FROM pilot_feedback_records
`;

function normalizeSummary(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DomainError("invalid_pilot_feedback_projection", "Pilot feedback summary is missing");
  }
  const totalCount = parseCount(row.total_count, "total_count");
  const result = Object.fromEntries(Object.keys(DIMENSIONS).map((group) => [group, {}]));
  for (const [field, { group, key }] of Object.entries(SUMMARY_FIELDS)) {
    result[group][`${key}Count`] = parseCount(row[field], field);
  }
  for (const [group, counts] of Object.entries(result)) {
    const sum = Object.values(counts).reduce((total, value) => total + value, 0);
    if (sum !== totalCount) {
      throw new DomainError(
        "invalid_pilot_feedback_projection",
        `Pilot feedback ${group} counts are inconsistent`
      );
    }
  }
  return { totalCount, ...result };
}

async function loadFeedbackResourceBaselines({ client, coreRepository }) {
  return {
    [ResourceKind.PILOT_FEEDBACK_RECORDS]:
      await coreRepository.countPilotFeedbackRecordsForCapacityInTransaction(client)
  };
}

export function submitPilotFeedbackCommandHandler() {
  return Object.freeze({
    operationId: "pilotSubmitPilotFeedback",
    kind: "command",
    resourceDeltas() {
      return { [ResourceKind.PILOT_FEEDBACK_RECORDS]: 1 };
    },
    loadResourceBaselines: loadFeedbackResourceBaselines,
    async plan({
      client,
      coreRepository,
      payload,
      authenticationContext,
      authorizationDecision,
      now,
      requestId,
      correlationId
    }) {
      if (authorizationDecision?.resourceType !== "subject") unavailable();
      const expectedSubjectType = authenticationContext.actorType === ActorType.HUMAN
        ? SubjectType.HUMAN
        : authenticationContext.actorType === ActorType.AGENT
          ? SubjectType.AGENT
          : undefined;
      if (expectedSubjectType === undefined) unavailable();
      const input = normalizeFeedbackPayload(payload, authenticationContext.actorType);
      const subjectState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const subject = subjectState?.value;
      if (
        !subject ||
        subject.subjectId !== authorizationDecision.resourceId ||
        subject.subjectType !== expectedSubjectType ||
        !ACTIVE_SUBJECT_STATUSES.has(subject.status) ||
        (expectedSubjectType === SubjectType.HUMAN && subject.prototypeOnly !== true)
      ) {
        unavailable();
      }

      const recordedAt = now.toISOString();
      const feedbackHash = hashId("pilot_feedback_record", {
        requestId,
        subjectId: subject.subjectId,
        entryMode: expectedSubjectType,
        ...input,
        recordedAt
      });
      const feedbackRecord = Object.freeze({
        pilotFeedbackId: `pilot_feedback_${feedbackHash.slice(2)}`,
        feedbackHash,
        subjectId: subject.subjectId,
        entryMode: expectedSubjectType,
        surface: input.surface,
        lifecycleStage: input.lifecycleStage,
        sentiment: input.sentiment,
        outcome: input.outcome,
        blockerCode: input.blockerCode,
        recordedAt,
        sandboxOnly: true,
        productionAuthority: false,
        schemaVersion: FEEDBACK_SCHEMA_VERSION
      });
      const event = createCreditEvent({
        eventType: CreditEventType.PILOT_FEEDBACK_RECORDED,
        subjectId: subject.subjectId,
        payload: {
          pilotFeedbackId: feedbackRecord.pilotFeedbackId,
          feedbackHash,
          entryMode: feedbackRecord.entryMode,
          surface: feedbackRecord.surface,
          lifecycleStage: feedbackRecord.lifecycleStage,
          sentiment: feedbackRecord.sentiment,
          outcome: feedbackRecord.outcome,
          blockerCode: feedbackRecord.blockerCode,
          sandboxOnly: true,
          productionAuthority: false,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "pilot_feedback",
        aggregateId: feedbackRecord.pilotFeedbackId,
        events: [{
          aggregateType: "pilot_feedback",
          aggregateId: feedbackRecord.pilotFeedbackId,
          expectedVersion: 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.PILOT_FEEDBACK_RECORD,
          value: feedbackRecord,
          eventId: event.eventId
        }],
        resourceBaselines: {
          [ResourceKind.PILOT_FEEDBACK_RECORDS]:
            await coreRepository.countPilotFeedbackRecordsForCapacityInTransaction(client)
        },
        response: {
          entryMode: feedbackRecord.entryMode,
          surface: feedbackRecord.surface,
          lifecycleStage: feedbackRecord.lifecycleStage,
          sentiment: feedbackRecord.sentiment,
          outcome: feedbackRecord.outcome,
          blockerCode: feedbackRecord.blockerCode,
          recordedAt,
          safety: {
            categoricalOnly: true,
            piiIncluded: false,
            thirdPartyAnalytics: false,
            sandboxOnly: true,
            productionAuthority: false
          },
          schemaVersion: "tenant_pilot_feedback_recorded.v1"
        }
      };
    }
  });
}

export function readPilotFeedbackSummaryQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadPilotFeedbackSummary",
    kind: "query",
    async execute({ client, authorizationDecision, payload, now }) {
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.getPrototypeOf(payload) !== Object.prototype ||
        Object.keys(payload).length !== 0
      ) {
        throw new DomainError(
          "invalid_tenant_command_payload",
          "Pilot feedback summary payload must be empty"
        );
      }
      if (
        authorizationDecision?.resourceType !== "risk_portfolio" ||
        typeof authorizationDecision.resourceId !== "string" ||
        authorizationDecision.resourceId.length === 0
      ) {
        unavailable();
      }
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new DomainError("invalid_tenant_command_clock", "tenant command clock is invalid");
      }
      const result = await client.query(SUMMARY_SQL);
      if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
        throw new DomainError("invalid_pilot_feedback_projection", "Pilot feedback summary is invalid");
      }
      return {
        asOf: now.toISOString(),
        ...normalizeSummary(result.rows[0]),
        safety: {
          aggregateOnly: true,
          piiIncluded: false,
          identifiersIncluded: false,
          thirdPartyAnalytics: false,
          sandboxOnly: true,
          productionFundsMoved: false
        },
        schemaVersion: "tenant_pilot_feedback_summary_view.v1"
      };
    }
  });
}

export function createPilotFeedbackHandlers() {
  return Object.freeze([
    submitPilotFeedbackCommandHandler(),
    readPilotFeedbackSummaryQueryHandler()
  ]);
}
