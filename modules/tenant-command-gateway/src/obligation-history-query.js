import { DomainError, ObligationStatus, hashId } from "../../../packages/domain/src/index.js";
import { boundCreditStatementTime } from "../../credit-learning/src/postgres-credit-source.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const STATES = new Set(Object.values(ObligationStatus));
const RELATIONSHIP = { human_borrower: "owner", principal_controller: "controller", agent_runtime: "subject" };

function invalid() {
  throw new DomainError("invalid_tenant_command_payload", "History query is invalid");
}

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function normalizedTimestamp(value) {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!parts) return null;
  const fraction = (parts[2] ?? "").padEnd(6, "0");
  const local = `${parts[1]}.${fraction.slice(0, 3)}Z`;
  const localDate = new Date(local);
  if (!Number.isFinite(localDate.getTime()) || localDate.toISOString() !== local ||
      (parts[3] !== "Z" && (Number(parts[3].slice(1, 3)) > 23 || Number(parts[3].slice(4)) > 59))) return null;
  const date = new Date(`${parts[1]}.${fraction.slice(0, 3)}${parts[3]}`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().length !== 24) return null;
  return date.toISOString().replace(/\.\d{3}Z$/, `.${fraction}Z`);
}

const timestamp = value => normalizedTimestamp(value) !== null;

export function parseObligationHistory(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some(key => !["subjectId", "limit", "cursor", "state", "createdFrom", "createdBefore"].includes(key)) ||
      typeof payload.subjectId !== "string" || !IDENTIFIER.test(payload.subjectId)) invalid();
  const limit = payload.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      (payload.state !== undefined && !STATES.has(payload.state)) ||
      ["createdFrom", "createdBefore"].some(key => payload[key] !== undefined && !timestamp(payload[key])) ||
      (payload.createdFrom && payload.createdBefore &&
        normalizedTimestamp(payload.createdFrom) >= normalizedTimestamp(payload.createdBefore)) ||
      (payload.cursor !== undefined && (typeof payload.cursor !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/.test(payload.cursor)))) invalid();
  return { ...payload, limit,
    ...(payload.createdFrom === undefined ? {} : { createdFrom: normalizedTimestamp(payload.createdFrom) }),
    ...(payload.createdBefore === undefined ? {} : { createdBefore: normalizedTimestamp(payload.createdBefore) }) };
}

export async function readObligationHistory({ client, directory, authenticationContext, kind, selectedAgentActorId, history, now }) {
  if (!authenticationContext.capabilities?.includes("obligation.read.owned")) unavailable();
  await boundCreditStatementTime(client);
  // Workspace resume authorizes only workspace.resume.self. Recheck the owned
  // read capability against the current, locked membership before listing IDs.
  const membership = await directory.requireActiveMembership({
    tenantId: authenticationContext.tenantId, actorId: authenticationContext.actorId,
    actorType: authenticationContext.actorType, clientId: authenticationContext.clientId,
    policyVersion: authenticationContext.policyVersion, now
  });
  if (!membership.capabilities?.includes("obligation.read.owned")) unavailable();
  const subject = await directory.resolveResource({ resourceType: "subject", resourceId: history.subjectId,
    tenantId: authenticationContext.tenantId, actorId: authenticationContext.actorId });
  if (subject?.status !== "active" || subject.actorAuthorized !== true ||
      subject.bindingRelationship !== RELATIONSHIP[kind]) unavailable();

  // A selected Agent is mandatory for Principal browsing, even when the Actor
  // controls several Subjects. The cursor never grants access to another one.
  if (kind === "principal_controller") {
    if (!IDENTIFIER.test(selectedAgentActorId ?? "")) unavailable();
    const selected = await client.query(
      `SELECT m.actor_id FROM memberships m JOIN actors a ON a.id = m.actor_id
        JOIN authorization_resource_bindings b ON b.tenant_id = m.tenant_id AND b.actor_id = m.actor_id
        JOIN authorization_resources r ON r.tenant_id = b.tenant_id
          AND r.resource_type = b.resource_type AND r.resource_id = b.resource_id
       WHERE m.tenant_id = $1 AND m.actor_id = $2 AND m.controller_actor_id = $3
         AND m.status = 'active' AND a.status = 'active' AND a.actor_type = 'agent'
         AND m.valid_from <= $4 AND (m.expires_at IS NULL OR m.expires_at > $4)
         AND b.resource_type = 'subject' AND b.resource_id = $5
         AND b.relationship = 'subject' AND b.status = 'active' AND r.status = 'active'
       FOR SHARE OF m, a, b, r`,
      [authenticationContext.tenantId, selectedAgentActorId, authenticationContext.actorId, now, history.subjectId]);
    if (selected.rowCount !== 1) unavailable();
  }
  const scope = hashId("obligation_history_scope.v1", {
    tenantId: authenticationContext.tenantId, actorId: authenticationContext.actorId, kind,
    selectedAgentActorId: selectedAgentActorId ?? null, subjectId: history.subjectId,
    state: history.state ?? null, createdFrom: history.createdFrom ?? null, createdBefore: history.createdBefore ?? null
  });
  let after;
  if (history.cursor !== undefined) {
    try { after = JSON.parse(Buffer.from(history.cursor, "base64url").toString("utf8")); } catch { invalid(); }
    if (!Array.isArray(after) || after.length !== 3 || after[0] !== scope ||
        !timestamp(after[1]) || typeof after[2] !== "string" || !IDENTIFIER.test(after[2])) invalid();
  }
  const result = await client.query(
    `SELECT o.id, o.status::text AS state,
            to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
            transaction_timestamp() AS as_of
       FROM obligations o
       JOIN authorization_resource_bindings b ON b.tenant_id = o.tenant_id
         AND b.resource_type = 'obligation' AND b.resource_id = o.id
       JOIN authorization_resources r ON r.tenant_id = b.tenant_id
         AND r.resource_type = b.resource_type AND r.resource_id = b.resource_id
      WHERE o.tenant_id = $1 AND o.subject_id = $2 AND b.actor_id = $3
        AND b.status = 'active' AND r.status = 'active' AND b.relationship = $4
        AND o.schema_version = 'obligation.v2' AND o.sandbox_only = TRUE AND o.production_funds_moved = FALSE
        AND ($5::text IS NULL OR o.status::text = $5)
        AND ($6::timestamptz IS NULL OR o.created_at >= $6)
        AND ($7::timestamptz IS NULL OR o.created_at < $7)
        AND ($8::timestamptz IS NULL OR (o.created_at, o.id) < ($8::timestamptz, $9::text))
      ORDER BY o.created_at DESC, o.id DESC LIMIT $10
      FOR SHARE OF b, r`,
    [authenticationContext.tenantId, history.subjectId, authenticationContext.actorId,
      kind === "principal_controller" ? "controller" : "owner", history.state ?? null,
      history.createdFrom ?? null, history.createdBefore ?? null, after?.[1] ?? null, after?.[2] ?? null, history.limit + 1]);
  const hasMore = result.rows.length > history.limit;
  const items = result.rows.slice(0, history.limit).map(row => {
    if (!IDENTIFIER.test(row.id ?? "") || !STATES.has(row.state) || !timestamp(row.created_at)) unavailable();
    return { obligationId: row.id, state: row.state, createdAt: row.created_at };
  });
  // Preserve PostgreSQL microseconds in the cursor. Rounding to JavaScript
  // milliseconds would skip records with near-identical creation timestamps.
  const last = items.at(-1);
  const asOf = result.rows[0]?.as_of ?? (await client.query("SELECT transaction_timestamp() AS as_of")).rows[0].as_of;
  return { subjectId: history.subjectId, items, hasMore,
    nextCursor: hasMore ? Buffer.from(JSON.stringify([scope, last.createdAt, last.obligationId])).toString("base64url") : null,
    asOf: new Date(asOf).toISOString(), nonAuthorizing: true, schemaVersion: "owned_obligation_history_page.v1" };
}
