import { DomainError } from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
const EVIDENCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;

function canonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function parsePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new DomainError("invalid_tenant_command_payload", "Evidence query payload is invalid");
  }
  const keys = Object.keys(payload);
  if (keys.some((key) => !["limit", "cursor"].includes(key))) {
    throw new DomainError("invalid_tenant_command_payload", "Evidence query payload is invalid");
  }
  const limit = payload.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new DomainError("invalid_tenant_command_payload", "Evidence query limit must be between 1 and 50");
  }
  if (payload.cursor === undefined) return { limit };
  if (typeof payload.cursor !== "string" || !CURSOR_PATTERN.test(payload.cursor)) {
    throw new DomainError("invalid_tenant_command_payload", "Evidence query cursor is invalid");
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload.cursor, "base64url").toString("utf8"));
  } catch {
    throw new DomainError("invalid_tenant_command_payload", "Evidence query cursor is invalid");
  }
  if (
    !Array.isArray(decoded) || decoded.length !== 2 ||
    !canonicalTimestamp(decoded[0]) ||
    typeof decoded[1] !== "string" || !EVIDENCE_ID_PATTERN.test(decoded[1])
  ) {
    throw new DomainError("invalid_tenant_command_payload", "Evidence query cursor is invalid");
  }
  return { limit, afterRecordedAt: decoded[0], afterEvidenceId: decoded[1] };
}

function createCursor(item) {
  return Buffer.from(JSON.stringify([item.recordedAt, item.evidenceId]), "utf8").toString("base64url");
}

function summarizeEvidence(item) {
  return {
    evidenceId: item.evidenceId,
    evidenceHash: item.evidenceHash,
    eventType: item.eventType,
    aggregateType: item.aggregateType,
    aggregateId: item.aggregateId,
    aggregateVersion: item.aggregateVersion,
    obligationId: item.obligationId,
    sourceFinality: item.sourceFinality,
    payloadHash: item.payloadHash,
    occurredAt: item.occurredAt,
    recordedAt: item.recordedAt,
    schemaVersion: "obligation_evidence_summary.v1"
  };
}

export function readObligationEvidenceQueryHandler({
  operationId = "pilotReadEvidence"
} = {}) {
  if (!new Set(["pilotReadEvidence", "pilotReadOwnObligationEvidence"]).has(operationId)) {
    throw new DomainError("invalid_evidence_query_handler", "Evidence query operation is invalid");
  }
  return Object.freeze({
    operationId,
    kind: "query",
    async execute({ client, coreRepository, authorizationDecision, payload, now }) {
      const page = parsePayload(payload);
      if (
        authorizationDecision?.resourceType !== "evidence" ||
        typeof authorizationDecision.resourceId !== "string" ||
        authorizationDecision.resourceId.length === 0
      ) unavailable();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new DomainError("invalid_tenant_command_clock", "tenant command clock is invalid");
      }
      const obligationId = authorizationDecision.resourceId;
      const obligation = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.OBLIGATION,
        obligationId
      );
      if (!obligation || obligation.value?.obligationId !== obligationId) unavailable();
      const rows = await coreRepository.listObligationEvidenceInTransaction(client, {
        obligationId,
        limit: page.limit + 1,
        ...(page.afterRecordedAt === undefined ? {} : {
          afterRecordedAt: page.afterRecordedAt,
          afterEvidenceId: page.afterEvidenceId
        })
      });
      const hasMore = rows.length > page.limit;
      const items = rows.slice(0, page.limit).map(summarizeEvidence);
      return {
        obligationId,
        asOf: now.toISOString(),
        items,
        hasMore,
        ...(hasMore && items.length > 0 ? { nextCursor: createCursor(items.at(-1)) } : {}),
        schemaVersion: operationId === "pilotReadEvidence"
          ? "tenant_obligation_evidence_view.v1"
          : "tenant_owned_obligation_evidence_view.v1"
      };
    }
  });
}

export function createEvidenceQueryHandlers() {
  return Object.freeze([
    readObligationEvidenceQueryHandler(),
    readObligationEvidenceQueryHandler({ operationId: "pilotReadOwnObligationEvidence" })
  ]);
}
