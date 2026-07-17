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

function assertEmptyPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 0) {
    throw new DomainError("invalid_tenant_command_payload", "Workspace recovery payload must be empty");
  }
}

function workspaceKind(authenticationContext) {
  const kinds = [
    authenticationContext.roles.includes(RoleBundle.HUMAN_BORROWER) && "human_borrower",
    authenticationContext.roles.includes(RoleBundle.PRINCIPAL_CONTROLLER) && "principal_controller"
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

export function readWorkspaceResumeQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadWorkspaceResume",
    kind: "query",
    async execute({ client, payload, authenticationContext }) {
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
          ORDER BY b.updated_at DESC, b.resource_type ASC, b.resource_id ASC
          LIMIT $4`,
        [
          authenticationContext.tenantId,
          authenticationContext.actorId,
          RESOURCE_TYPES,
          PAGE_SIZE + 1
        ]
      );
      const rows = result.rows.map(normalizeRow);
      return {
        workspaceKind: kind,
        resources: rows.slice(0, PAGE_SIZE),
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
