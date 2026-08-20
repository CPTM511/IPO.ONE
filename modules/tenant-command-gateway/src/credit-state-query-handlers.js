import { DomainError } from "../../../packages/domain/src/index.js";

function unavailable() {
  throw new DomainError(
    "tenant_resource_unavailable",
    "The requested resource is not available."
  );
}

function assertProjection(projection, subjectId) {
  if (
    !projection ||
    projection.schemaVersion !== "credit_state_projection.v1" ||
    projection.subjectId !== subjectId ||
    projection.authorizing !== false ||
    projection.automaticLimitChange !== false ||
    projection.fundsAuthority !== false ||
    projection.piiIncluded !== false ||
    projection.productionAuthority !== false ||
    projection.productionFundsMoved !== false ||
    projection.rawTransactionDataIncluded !== false ||
    projection.sandboxOnly !== true ||
    projection.scoreAuthoritative !== false ||
    !Array.isArray(projection.trackRecord) ||
    projection.trackRecord.length < 1 ||
    projection.trackRecord.length !==
      projection.metrics?.completedCycleCount
  ) {
    throw new DomainError(
      "projection_integrity_mismatch",
      "Credit State projection does not satisfy its safety contract"
    );
  }
  return projection;
}

export function readOwnCreditStateQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadOwnCreditState",
    kind: "query",
    async execute({ client, resource, payload, now }) {
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.keys(payload).length !== 0 ||
        resource?.resourceType !== "subject" ||
        !(now instanceof Date) ||
        !Number.isFinite(now.getTime())
      ) unavailable();
      const result = await client.query(
        `SELECT projection
           FROM credit_state_projections
          WHERE subject_id = $1
          LIMIT 2`,
        [resource.resourceId]
      );
      if (result.rowCount !== 1) unavailable();
      const projection = assertProjection(
        typeof result.rows[0].projection === "string"
          ? JSON.parse(result.rows[0].projection)
          : result.rows[0].projection,
        resource.resourceId
      );
      return {
        creditState: projection,
        asOf: now.toISOString(),
        schemaVersion: "tenant_owned_credit_state_view.v1"
      };
    }
  });
}

export function createCreditStateQueryHandlers() {
  return Object.freeze([readOwnCreditStateQueryHandler()]);
}
