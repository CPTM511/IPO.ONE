import { DomainError } from "../../../packages/domain/src/index.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;

function assertEmptyPayload(payload, label) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== 0
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      `${label} reference payload must be empty`
    );
  }
}

function unavailable() {
  return new DomainError(
    "workspace_recovery_unavailable",
    "The authenticated workspace cannot be recovered."
  );
}

function isExactReferenceRow(row) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    Object.getPrototypeOf(row) !== Object.prototype
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(row);
  if (
    keys.length !== 2 ||
    !keys.includes("resource_type") ||
    !keys.includes("resource_id")
  ) {
    return false;
  }
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(row, key);
    return descriptor && Object.hasOwn(descriptor, "value");
  });
}

function referenceQueryHandler({ operationId, resourceType, schemaVersion, label }) {
  return Object.freeze({
    operationId,
    kind: "query",
    async execute({ client, payload }) {
      assertEmptyPayload(payload, label);
      const result = await client.query(
        `SELECT resource_type, resource_id
           FROM authorization_resources
          WHERE tenant_id = current_app_tenant_id()
            AND resource_type = $1
            AND status = 'active'
          ORDER BY resource_id ASC
          LIMIT 2`,
        [resourceType]
      );
      if (
        !Array.isArray(result?.rows) ||
        !Number.isSafeInteger(result.rowCount) ||
        result.rowCount < 0 ||
        result.rowCount !== result.rows.length ||
        result.rows.length > 1
      ) {
        throw unavailable();
      }
      const row = result.rows[0];
      if (row === undefined) {
        return {
          resource: null,
          serverTruth: true,
          readOnly: true,
          schemaVersion
        };
      }
      if (
        !isExactReferenceRow(row) ||
        row.resource_type !== resourceType ||
        typeof row.resource_id !== "string" ||
        !IDENTIFIER.test(row.resource_id)
      ) {
        throw unavailable();
      }
      return {
        resource: {
          resourceType,
          resourceId: row.resource_id
        },
        serverTruth: true,
        readOnly: true,
        schemaVersion
      };
    }
  });
}

export function readTenantRiskPortfolioReferenceQueryHandler() {
  return referenceQueryHandler({
    operationId: "pilotReadTenantRiskPortfolioReference",
    resourceType: "risk_portfolio",
    schemaVersion: "tenant_risk_portfolio_reference_view.v1",
    label: "Tenant risk portfolio"
  });
}

export function readServicingQueueReferenceQueryHandler() {
  return referenceQueryHandler({
    operationId: "pilotReadServicingQueueReference",
    resourceType: "servicing_queue",
    schemaVersion: "tenant_servicing_queue_reference_view.v1",
    label: "Servicing queue"
  });
}

export function createRiskWorkspaceReferenceHandlers() {
  return Object.freeze([
    readTenantRiskPortfolioReferenceQueryHandler(),
    readServicingQueueReferenceQueryHandler()
  ]);
}
