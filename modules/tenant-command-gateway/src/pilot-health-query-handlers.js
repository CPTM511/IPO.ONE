import { DomainError } from "../../../packages/domain/src/index.js";

const COUNT_FIELDS = Object.freeze([
  "intent_count",
  "human_intent_count",
  "agent_intent_count",
  "offered_intent_count",
  "accepted_intent_count",
  "executed_intent_count",
  "repaid_intent_count",
  "fully_repaid_intent_count",
  "obligation_count",
  "open_position_count",
  "adverse_position_count"
]);

function normalizeEmptyPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== 0
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Pilot health payload must be empty"
    );
  }
}

function parseCount(value, field) {
  const canonical = typeof value === "number" ? String(value) : value;
  if (typeof canonical !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(canonical)) {
    throw new DomainError("invalid_pilot_health_projection", `${field} is invalid`);
  }
  const parsed = Number(canonical);
  if (!Number.isSafeInteger(parsed)) {
    throw new DomainError("invalid_pilot_health_projection", `${field} is outside the safe range`);
  }
  return parsed;
}

function conversionBps(numerator, denominator) {
  return denominator === 0
    ? 0
    : Number((BigInt(numerator) * 10_000n) / BigInt(denominator));
}

function readinessStage({
  intentCount,
  acceptedIntentCount,
  executedIntentCount,
  repaidIntentCount,
  fullyRepaidIntentCount,
  dualNativeObserved
}) {
  if (intentCount === 0) return "empty";
  if (acceptedIntentCount === 0) return "application";
  if (executedIntentCount === 0) return "obligation";
  if (repaidIntentCount === 0) return "execution";
  if (fullyRepaidIntentCount === 0 || !dualNativeObserved) return "repayment";
  return "verified";
}

function normalizeProjection(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DomainError("invalid_pilot_health_projection", "Pilot health projection is missing");
  }
  const counts = Object.fromEntries(
    COUNT_FIELDS.map((field) => [field, parseCount(row[field], field)])
  );
  if (counts.human_intent_count + counts.agent_intent_count !== counts.intent_count) {
    throw new DomainError("invalid_pilot_health_projection", "Entry-mode totals are inconsistent");
  }
  if (
    counts.offered_intent_count > counts.intent_count ||
    counts.accepted_intent_count > counts.offered_intent_count ||
    counts.executed_intent_count > counts.accepted_intent_count ||
    counts.repaid_intent_count > counts.executed_intent_count ||
    counts.fully_repaid_intent_count > counts.repaid_intent_count ||
    counts.open_position_count > counts.obligation_count ||
    counts.adverse_position_count > counts.obligation_count
  ) {
    throw new DomainError("invalid_pilot_health_projection", "Pilot health funnel is inconsistent");
  }
  return counts;
}

export function readPilotHealthQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadPilotHealth",
    kind: "query",
    async execute({ client, authorizationDecision, payload, now }) {
      normalizeEmptyPayload(payload);
      if (
        authorizationDecision?.resourceType !== "risk_portfolio" ||
        typeof authorizationDecision.resourceId !== "string" ||
        authorizationDecision.resourceId.length === 0
      ) {
        throw new DomainError(
          "tenant_resource_unavailable",
          "The requested resource is not available."
        );
      }
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new DomainError("invalid_tenant_command_clock", "tenant command clock is invalid");
      }

      const result = await client.query(`
        WITH intent_metrics AS (
          SELECT
            COUNT(*)::text AS intent_count,
            COUNT(*) FILTER (WHERE authority_type = 'consent')::text AS human_intent_count,
            COUNT(*) FILTER (WHERE authority_type = 'mandate')::text AS agent_intent_count
          FROM credit_intents
        ),
        offer_metrics AS (
          SELECT COUNT(DISTINCT credit_intent_id)::text AS offered_intent_count
          FROM credit_offers
        ),
        acceptance_metrics AS (
          SELECT COUNT(DISTINCT credit_intent_id)::text AS accepted_intent_count
          FROM credit_offer_acceptances
        ),
        obligation_metrics AS (
          SELECT
            COUNT(DISTINCT credit_intent_id) FILTER (
              WHERE schema_version = 'obligation.v2' AND execution_status = 'executed'
            )::text AS executed_intent_count,
            COUNT(*) FILTER (WHERE schema_version = 'obligation.v2')::text AS obligation_count,
            COUNT(*) FILTER (
              WHERE schema_version = 'obligation.v2'
                AND status NOT IN ('fully_repaid', 'written_off', 'closed')
            )::text AS open_position_count,
            COUNT(*) FILTER (
              WHERE schema_version = 'obligation.v2'
                AND (status IN ('delinquent', 'defaulted', 'written_off') OR days_past_due > 0)
            )::text AS adverse_position_count,
            COUNT(DISTINCT credit_intent_id) FILTER (
              WHERE schema_version = 'obligation.v2' AND status = 'fully_repaid'
            )::text AS fully_repaid_intent_count
          FROM obligations
        ),
        repayment_metrics AS (
          SELECT COUNT(DISTINCT o.credit_intent_id)::text AS repaid_intent_count
          FROM obligations o
          WHERE o.schema_version = 'obligation.v2'
            AND EXISTS (
              SELECT 1
              FROM repayment_events r
              WHERE r.obligation_id = o.id AND r.schema_version = 'repayment.v2'
            )
        )
        SELECT *
        FROM intent_metrics, offer_metrics, acceptance_metrics, obligation_metrics, repayment_metrics
      `);
      if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
        throw new DomainError("invalid_pilot_health_projection", "Pilot health projection is invalid");
      }
      const counts = normalizeProjection(result.rows[0]);
      const dualNativeObserved = counts.human_intent_count > 0 && counts.agent_intent_count > 0;
      const fullLifecycleObserved = counts.fully_repaid_intent_count > 0;

      return {
        portfolioId: authorizationDecision.resourceId,
        asOf: now.toISOString(),
        entryModes: {
          humanIntentCount: counts.human_intent_count,
          agentIntentCount: counts.agent_intent_count,
          dualNativeObserved
        },
        funnel: {
          intentCount: counts.intent_count,
          offeredIntentCount: counts.offered_intent_count,
          acceptedIntentCount: counts.accepted_intent_count,
          executedIntentCount: counts.executed_intent_count,
          repaidIntentCount: counts.repaid_intent_count,
          fullyRepaidIntentCount: counts.fully_repaid_intent_count
        },
        conversionBps: {
          offer: conversionBps(counts.offered_intent_count, counts.intent_count),
          acceptance: conversionBps(counts.accepted_intent_count, counts.intent_count),
          execution: conversionBps(counts.executed_intent_count, counts.intent_count),
          repayment: conversionBps(counts.repaid_intent_count, counts.intent_count),
          fullRepayment: conversionBps(counts.fully_repaid_intent_count, counts.intent_count)
        },
        positions: {
          obligationCount: counts.obligation_count,
          openPositionCount: counts.open_position_count,
          adversePositionCount: counts.adverse_position_count
        },
        readiness: {
          stage: readinessStage({
            intentCount: counts.intent_count,
            acceptedIntentCount: counts.accepted_intent_count,
            executedIntentCount: counts.executed_intent_count,
            repaidIntentCount: counts.repaid_intent_count,
            fullyRepaidIntentCount: counts.fully_repaid_intent_count,
            dualNativeObserved
          }),
          dualNativeObserved,
          fullLifecycleObserved
        },
        safety: {
          readOnly: true,
          piiIncluded: false,
          thirdPartyAnalytics: false,
          sandboxOnly: true,
          productionFundsMoved: false
        },
        schemaVersion: "tenant_pilot_health_view.v1"
      };
    }
  });
}

export function createPilotHealthQueryHandlers() {
  return Object.freeze([readPilotHealthQueryHandler()]);
}
