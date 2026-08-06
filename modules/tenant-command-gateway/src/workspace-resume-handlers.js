import { DomainError } from "../../../packages/domain/src/index.js";
import { RoleBundle } from "../../authorization/src/index.js";

const RESOURCE_TYPES = Object.freeze([
  "subject",
  "consent",
  "credit_intent",
  "mandate",
  "obligation"
]);
const RELATIONSHIPS = new Set(["owner", "controller", "subject"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const PAGE_SIZE = 32;
const CONTROLLED_AGENT_LIMIT = 8;

function assertEmptyPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 0) {
    throw new DomainError("invalid_tenant_command_payload", "Workspace recovery payload must be empty");
  }
}

function workspaceKind(authenticationContext) {
  const kinds = [
    authenticationContext.roles.includes(RoleBundle.HUMAN_BORROWER) && "human_borrower",
    authenticationContext.roles.includes(RoleBundle.PRINCIPAL_CONTROLLER) && "principal_controller",
    authenticationContext.roles.includes(RoleBundle.AGENT_RUNTIME) && "agent_runtime"
  ].filter(Boolean);
  if (kinds.length !== 1) {
    throw new DomainError(
      "workspace_recovery_unavailable",
      "Workspace recovery is unavailable for this authenticated role"
    );
  }
  return kinds[0];
}

function normalizeRow(row) {
  if (
    !row || typeof row !== "object" ||
    !RESOURCE_TYPES.includes(row.resource_type) ||
    typeof row.resource_id !== "string" || !IDENTIFIER.test(row.resource_id) ||
    !RELATIONSHIPS.has(row.relationship)
  ) {
    throw new DomainError("workspace_recovery_unavailable", "Workspace recovery state is invalid");
  }
  return Object.freeze({
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    relationship: row.relationship
  });
}

async function controlledAgentActorIds({ client, authenticationContext, kind, now }) {
  if (kind !== "principal_controller") return [];
  const result = await client.query(
    `SELECT m.actor_id
       FROM memberships AS m
       JOIN actors AS a ON a.id = m.actor_id
      WHERE m.tenant_id = $1
        AND m.controller_actor_id = $2
        AND m.status = 'active'
        AND a.status = 'active'
        AND a.actor_type = 'agent'
        AND m.valid_from <= $3
        AND (m.expires_at IS NULL OR m.expires_at > $3)
      ORDER BY m.actor_id ASC
      LIMIT $4`,
    [
      authenticationContext.tenantId,
      authenticationContext.actorId,
      now,
      CONTROLLED_AGENT_LIMIT + 1
    ]
  );
  if (result.rows.length > CONTROLLED_AGENT_LIMIT) {
    throw new DomainError(
      "workspace_recovery_unavailable",
      "Controlled Agent recovery exceeds the bounded workspace limit"
    );
  }
  const actorIds = result.rows.map((row) => row?.actor_id);
  if (
    actorIds.some((actorId) => typeof actorId !== "string" || !IDENTIFIER.test(actorId)) ||
    new Set(actorIds).size !== actorIds.length
  ) {
    throw new DomainError(
      "workspace_recovery_unavailable",
      "Controlled Agent recovery state is invalid"
    );
  }
  return actorIds;
}

async function continuationReceiptsForWorkspace({
  client,
  coreRepository,
  authenticationContext,
  kind,
  controlledAgents,
  now
}) {
  const actorIds = kind === "agent_runtime"
    ? [authenticationContext.actorId]
    : kind === "principal_controller"
      ? controlledAgents
      : [];
  const receipts = [];
  for (const actorId of actorIds) {
    receipts.push(...await coreRepository.listActiveWorkspaceContinuationReceiptsInTransaction(
      client,
      { actorId, now, limit: 16 }
    ));
  }
  return receipts
    .sort((left, right) => (
      left.expiresAt.localeCompare(right.expiresAt) ||
      left.continuationReceiptId.localeCompare(right.continuationReceiptId)
    ))
    .slice(0, 16);
}

export function readWorkspaceResumeQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadWorkspaceResume",
    kind: "query",
    async execute({ client, coreRepository, payload, authenticationContext, now }) {
      assertEmptyPayload(payload);
      const kind = workspaceKind(authenticationContext);
      const result = await client.query(
        `SELECT b.resource_type, b.resource_id, b.relationship
           FROM authorization_resource_bindings AS b
           JOIN authorization_resources AS r
             ON r.tenant_id = b.tenant_id
            AND r.resource_type = b.resource_type
            AND r.resource_id = b.resource_id
          WHERE b.tenant_id = $1
            AND b.actor_id = $2
            AND b.status = 'active'
            AND r.status = 'active'
            AND b.resource_type = ANY($3::text[])
          ORDER BY
            ROW_NUMBER() OVER (
              PARTITION BY b.resource_type
              ORDER BY b.updated_at DESC, b.resource_id ASC
            ) ASC,
            b.updated_at DESC,
            b.resource_type ASC,
            b.resource_id ASC
          LIMIT $4`,
        [
          authenticationContext.tenantId,
          authenticationContext.actorId,
          RESOURCE_TYPES,
          PAGE_SIZE + 1
        ]
      );
      const rows = result.rows.map(normalizeRow);
      const controlledAgents = await controlledAgentActorIds({
        client,
        authenticationContext,
        kind,
        now
      });
      const continuationReceipts = await continuationReceiptsForWorkspace({
        client,
        coreRepository,
        authenticationContext,
        kind,
        controlledAgents,
        now
      });
      return {
        workspaceKind: kind,
        resources: rows.slice(0, PAGE_SIZE),
        ...(kind === "principal_controller"
          ? { controlledAgentActorIds: controlledAgents }
          : {}),
        continuationReceipts: continuationReceipts.map((receipt) => ({
          continuationReceiptId: receipt.continuationReceiptId,
          receiptHash: receipt.receiptHash,
          subjectId: receipt.subjectId,
          mandateId: receipt.mandateId,
          creditOfferId: receipt.creditOfferId,
          creditOfferHash: receipt.creditOfferHash,
          offerAggregateVersion: receipt.offerAggregateVersion,
          expiresAt: receipt.expiresAt,
          receipt: receipt.receiptPayload,
          serverTruth: true,
          schemaVersion: "workspace_continuation_receipt_view.v1"
        })),
        hasMore: rows.length > PAGE_SIZE,
        serverTruth: true,
        schemaVersion: "tenant_workspace_resume_view.v1"
      };
    }
  });
}

export function createWorkspaceResumeHandlers() {
  return Object.freeze([readWorkspaceResumeQueryHandler()]);
}
