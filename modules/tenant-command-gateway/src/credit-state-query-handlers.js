import { DomainError } from "../../../packages/domain/src/index.js";
import { TERMINAL_CREDIT_SOURCE_SQL, boundCreditStatementTime } from "../../credit-learning/src/postgres-credit-source.js";

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
      await boundCreditStatementTime(client);
      // Source projections and their events commit atomically. Check source ->
      // immutable outcomes -> Credit State in one snapshot, including outcomes
      // not yet materialized after a failed or skipped worker run. A timestamp
      // high-water mark alone cannot detect backdated terminal sources.
      const result = await client.query(
        `SELECT p.projection, transaction_timestamp() AS as_of,
                s.credit_state_refresh_error IS NULL AND p.projected_outcome_count = (
                  SELECT count(*) FROM credit_outcomes c
                   WHERE c.tenant_id = p.tenant_id AND c.subject_id = p.subject_id
                ) AND NOT EXISTS (
                  SELECT 1 FROM obligations o
                  JOIN risk_decisions d
                    ON d.tenant_id = o.tenant_id AND d.id = o.risk_decision_id
                  LEFT JOIN credit_outcomes c
                    ON c.tenant_id = o.tenant_id AND c.obligation_id = o.id
                   AND c.subject_id = o.subject_id
                   AND c.risk_decision_id = d.id
                   AND c.decision_hash = d.decision_hash
                   AND c.outcome_finalized_at = date_trunc('milliseconds', o.updated_at)
                  WHERE o.tenant_id = p.tenant_id AND o.subject_id = p.subject_id
                    AND ${TERMINAL_CREDIT_SOURCE_SQL}
                    AND c.id IS NULL
                ) AS complete
           FROM credit_state_projections p
           JOIN subjects s ON s.tenant_id = p.tenant_id AND s.id = p.subject_id
          WHERE p.subject_id = $1
          LIMIT 2`,
        [resource.resourceId]
      );
      if (result.rowCount !== 1) unavailable();
      if (result.rows[0].complete !== true) {
        throw new DomainError(
          "credit_state_projection_incomplete",
          "Credit State is awaiting a complete history refresh"
        );
      }
      const projection = assertProjection(
        typeof result.rows[0].projection === "string"
          ? JSON.parse(result.rows[0].projection)
          : result.rows[0].projection,
        resource.resourceId
      );
      return {
        creditState: projection,
        // Use the database transaction boundary, not a wall clock sampled after
        // its repeatable-read snapshot. This is an as-of read, not a live feed.
        asOf: new Date(result.rows[0].as_of).toISOString(),
        schemaVersion: "tenant_owned_credit_state_view.v1"
      };
    }
  });
}

export function createCreditStateQueryHandlers() {
  return Object.freeze([readOwnCreditStateQueryHandler()]);
}
