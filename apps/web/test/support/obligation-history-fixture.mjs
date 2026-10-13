import { DomainError } from "../../../../packages/domain/src/index.js";

// Synthetic browser metadata only. Real SQL and authorization are covered by
// the gateway PostgreSQL tests; this fixture cannot prove durable recovery.
export function syntheticObligationHistory({ subjectId, obligations, history }) {
  if (history?.subjectId !== subjectId) {
    throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
  }
  const rows = obligations.filter(Boolean).filter(item =>
    (!history.state || item.status === history.state) &&
    (!history.createdFrom || item.createdAt >= history.createdFrom) &&
    (!history.createdBefore || item.createdAt < history.createdBefore)
  ).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.obligationId.localeCompare(left.obligationId));
  const offset = history.cursor ? Number(Buffer.from(history.cursor, "base64url").toString("utf8")) : 0;
  const limit = history.limit ?? 25;
  const items = rows.slice(offset, offset + limit).map(item => ({ obligationId: item.obligationId, state: item.status, createdAt: item.createdAt }));
  const hasMore = offset + limit < rows.length;
  return { subjectId, items, hasMore, nextCursor: hasMore ? Buffer.from(String(offset + limit)).toString("base64url") : null,
    asOf: "2026-10-12T00:00:00.000Z", nonAuthorizing: true, schemaVersion: "owned_obligation_history_page.v1" };
}
