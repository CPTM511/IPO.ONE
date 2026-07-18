import assert from "node:assert/strict";
import test from "node:test";
import { createCreditEvent, hashId } from "../../../packages/domain/src/index.js";
import {
  CoreProjectionType,
  PostgresCoreRepository,
  PostgresEventRepository,
  createTenantSecurityContext
} from "../src/index.js";

const TENANT_CONTEXT = createTenantSecurityContext({
  tenantId: "tenant_ipo_one_local_pilot",
  actorId: "actor_local_system",
  policyVersion: "security_001.v1",
  source: "local_test"
});

function unreachablePool() {
  return {
    connect: async () => {
      throw new Error("database access must not occur for rejected input");
    },
    query: async () => {
      throw new Error("database access must not occur for rejected input");
    }
  };
}

function eventDescriptor(payload = { operation: "boundary_test" }) {
  return {
    aggregateType: "boundary_test",
    aggregateId: "boundary_aggregate_1",
    expectedVersion: 0,
    event: createCreditEvent({ eventType: "boundary_tested", payload })
  };
}

test("event repository rejects oversized event and response payloads before database access", async () => {
  const repository = new PostgresEventRepository({ pool: unreachablePool(), tenantContext: TENANT_CONTEXT });
  await assert.rejects(
    () =>
      repository.appendCommandBatch({
        aggregateType: "boundary_test",
        aggregateId: "boundary_aggregate_1",
        idempotencyKey: "boundary-event-too-large",
        commandHash: hashId("boundary_command", { case: "event" }),
        events: [eventDescriptor({ content: "x".repeat(64 * 1024) })]
      }),
    (error) => error.code === "event_payload_too_large"
  );
  await assert.rejects(
    () =>
      repository.appendCommandBatch({
        aggregateType: "boundary_test",
        aggregateId: "boundary_aggregate_1",
        idempotencyKey: "boundary-response-too-large",
        commandHash: hashId("boundary_command", { case: "response" }),
        events: [eventDescriptor()],
        response: { content: "x".repeat(256 * 1024) }
      }),
    (error) => error.code === "command_response_too_large"
  );
});

test("core repository rejects duplicate, oversized, and raw-PII projection writes before database access", async () => {
  const pool = unreachablePool();
  const repository = new PostgresCoreRepository({
    pool,
    eventRepository: new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT })
  });
  const command = {
    aggregateType: "subject",
    aggregateId: "subject_boundary_1",
    idempotencyKey: "projection-boundary-1",
    commandHash: hashId("boundary_command", { case: "projection" }),
    events: [eventDescriptor()],
    response: { accepted: false }
  };
  const principal = { principalId: "principal_boundary_1", schemaVersion: "principal.v1" };

  await assert.rejects(
    () =>
      repository.commitCommand({
        ...command,
        writes: [
          { type: CoreProjectionType.PRINCIPAL, value: principal },
          { type: CoreProjectionType.PRINCIPAL, value: principal }
        ]
      }),
    (error) => error.code === "duplicate_projection_write"
  );
  await assert.rejects(
    () =>
      repository.commitCommand({
        ...command,
        idempotencyKey: "projection-boundary-pii",
        writes: [
          {
            type: CoreProjectionType.PRINCIPAL,
            value: { ...principal, metadata: { ssn: "prohibited" } }
          }
        ]
      }),
    (error) => error.code === "raw_pii_prohibited"
  );
  await assert.rejects(
    () =>
      repository.commitCommand({
        ...command,
        idempotencyKey: "projection-boundary-size",
        writes: [
          {
            type: CoreProjectionType.PRINCIPAL,
            value: { ...principal, content: "x".repeat(128 * 1024) }
          }
        ]
      }),
    (error) => error.code === "projection_too_large"
  );
});

test("Tenant risk portfolio maps exact aggregate values and bounds per-asset detail", async () => {
  const repository = new PostgresCoreRepository({
    pool: { query: async () => ({ rows: [] }) },
    eventRepository: {}
  });
  const assetRows = Array.from({ length: 51 }, (_, index) => ({
    asset_id: `asset_${String(index + 1).padStart(2, "0")}`,
    credit_line_count: "2",
    approved_credit_line_count: "1",
    frozen_credit_line_count: "1",
    limit_minor: "1000",
    utilized_minor: "250",
    obligation_count: "3",
    open_obligation_count: "2",
    overdue_obligation_count: "1",
    defaulted_obligation_count: "0",
    delinquent_obligation_count: "0",
    restructured_obligation_count: "0",
    repurchased_obligation_count: "0",
    written_off_obligation_count: "0",
    outstanding_principal_minor: "400",
    written_off_principal_minor: "0"
  }));
  const responses = [
    {
      rows: [{
        total_count: "2",
        pending_count: "1",
        active_count: "1",
        suspended_count: "0",
        closed_count: "0"
      }]
    },
    {
      rows: [{
        total_count: "2",
        requested_count: "0",
        approved_count: "1",
        rejected_count: "0",
        frozen_count: "1",
        closed_count: "0",
        limit_minor: "1000",
        utilized_minor: "250"
      }]
    },
    {
      rows: [{
        total_count: "3",
        open_count: "2",
        created_count: "0",
        active_count: "1",
        partially_repaid_count: "0",
        fully_repaid_count: "1",
        overdue_count: "1",
        defaulted_count: "0",
        delinquent_count: "0",
        restructured_count: "0",
        repurchased_count: "0",
        written_off_count: "0",
        closed_count: "0",
        principal_minor: "900",
        outstanding_principal_minor: "400",
        accrued_fees_minor: "10",
        repaid_amount_minor: "500",
        written_off_principal_minor: "0",
        written_off_interest_minor: "0",
        written_off_fees_minor: "0"
      }]
    },
    { rows: assetRows }
  ];
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return responses.shift();
    }
  };

  const result = await repository.getTenantRiskPortfolioInTransaction(client);
  assert.equal(queries.length, 4);
  assert.equal(queries[3].values.at(-1), 51);
  assert.equal(queries[1].sql.includes("subject_type"), true);
  assert.equal(queries[3].sql.includes("subject_type"), true);
  assert.deepEqual(result.subjects, {
    totalCount: 2,
    pendingCount: 1,
    activeCount: 1,
    suspendedCount: 0,
    closedCount: 0
  });
  assert.deepEqual(result.creditLines, {
    totalCount: 2,
    requestedCount: 0,
    approvedCount: 1,
    rejectedCount: 0,
    frozenCount: 1,
    closedCount: 0,
    limitMinor: "1000",
    utilizedMinor: "250"
  });
  assert.equal(result.obligations.openCount, 2);
  assert.equal(result.obligations.outstandingPrincipalMinor, "400");
  assert.equal(result.assetExposures.length, 50);
  assert.equal(result.assetExposures[0].assetId, "asset_01");
  assert.equal(result.assetExposures[49].assetId, "asset_50");
  assert.equal(result.hasMoreAssetExposures, true);
});

test("Tenant risk portfolio fails closed on unknown durable states", async () => {
  const repository = new PostgresCoreRepository({
    pool: { query: async () => ({ rows: [] }) },
    eventRepository: {}
  });
  const responses = [
    {
      rows: [{
        total_count: "0",
        pending_count: "0",
        active_count: "0",
        suspended_count: "0",
        closed_count: "0"
      }]
    },
    {
      rows: [{
        total_count: "2",
        requested_count: "0",
        approved_count: "1",
        rejected_count: "0",
        frozen_count: "0",
        closed_count: "0",
        limit_minor: "100",
        utilized_minor: "0"
      }]
    }
  ];
  const client = { query: async () => responses.shift() };
  await assert.rejects(
    () => repository.getTenantRiskPortfolioInTransaction(client),
    (error) => error.code === "projection_integrity_mismatch"
  );
});

test("Servicing Operations queue uses one bounded parameterized adverse projection", async () => {
  const repository = new PostgresCoreRepository({
    pool: { query: async () => ({ rows: [] }) },
    eventRepository: {}
  });
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return {
        rows: [{
          obligation_id: "obligation_queue_boundary_001",
          subject_id: "subject_queue_boundary_001",
          asset_id: "urn:ipo-one:sandbox-asset:usd-cent",
          status: "defaulted",
          servicing_classification: "defaulted",
          days_past_due: 96,
          priority_rank: 1,
          outstanding_principal_minor: "9000",
          outstanding_interest_minor: "220",
          outstanding_fees_minor: "0",
          past_due_principal_minor: "3000",
          past_due_interest_minor: "120",
          past_due_fees_minor: "0",
          oldest_unpaid_installment_id: "installment_queue_boundary_001",
          oldest_due_at: new Date("2026-04-11T01:00:00.000Z"),
          servicing_effective_at: new Date("2026-07-16T01:00:00.000Z"),
          schedule_sequence: 1,
          servicing_owner_code: "sandbox_platform",
          latest_action_id: "servicing_action_boundary_001",
          latest_action_type: "advance",
          latest_next_status: "defaulted",
          latest_next_classification: "defaulted",
          latest_days_past_due: 96,
          latest_reason_code: "servicing_default_threshold",
          latest_source: "system_worker",
          latest_effective_at: new Date("2026-07-16T01:00:00.000Z")
        }]
      };
    }
  };

  const result = await repository.getServicingOperationsQueueInTransaction(client, {
    classifications: ["defaulted", "dpd_61_89"],
    limit: 26,
    afterPriorityRank: 1,
    afterDaysPastDue: 97,
    afterOldestDueAt: "2026-04-10T01:00:00.000Z",
    afterObligationId: "obligation_queue_boundary_000"
  });
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, [
    ["defaulted", "dpd_61_89"],
    26,
    1,
    97,
    "2026-04-10T01:00:00.000Z",
    "obligation_queue_boundary_000"
  ]);
  assert.match(queries[0].sql, /o\.schema_version = 'obligation\.v2'/);
  assert.match(queries[0].sql, /o\.sandbox_only = TRUE/);
  assert.match(queries[0].sql, /o\.production_funds_moved = FALSE/);
  assert.match(queries[0].sql, /o\.withdrawable = FALSE/);
  assert.match(queries[0].sql, /o\.servicing_classification = ANY\(\$1::text\[\]\)/);
  assert.equal(queries[0].sql.includes("obligation_queue_boundary_000"), false);
  assert.deepEqual(result, [{
    obligationId: "obligation_queue_boundary_001",
    subjectId: "subject_queue_boundary_001",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    status: "defaulted",
    servicingClassification: "defaulted",
    daysPastDue: 96,
    priorityRank: 1,
    outstandingPrincipalMinor: "9000",
    outstandingInterestMinor: "220",
    outstandingFeesMinor: "0",
    outstandingTotalMinor: "9220",
    pastDuePrincipalMinor: "3000",
    pastDueInterestMinor: "120",
    pastDueFeesMinor: "0",
    pastDueTotalMinor: "3120",
    oldestUnpaidInstallmentId: "installment_queue_boundary_001",
    oldestDueAt: "2026-04-11T01:00:00.000Z",
    servicingEffectiveAt: "2026-07-16T01:00:00.000Z",
    scheduleSequence: 1,
    servicingOwnerCode: "sandbox_platform",
    latestServicingAction: {
      servicingActionId: "servicing_action_boundary_001",
      actionType: "advance",
      nextStatus: "defaulted",
      nextClassification: "defaulted",
      daysPastDue: 96,
      reasonCode: "servicing_default_threshold",
      source: "system_worker",
      effectiveAt: "2026-07-16T01:00:00.000Z",
      schemaVersion: "servicing_queue_action_summary.v1"
    }
  }]);
});

test("Servicing Operations queue rejects unsafe filters and inconsistent projections", async () => {
  const repository = new PostgresCoreRepository({
    pool: { query: async () => ({ rows: [] }) },
    eventRepository: {}
  });
  await assert.rejects(
    () => repository.getServicingOperationsQueueInTransaction(
      { query: async () => { throw new Error("must not query"); } },
      { classifications: ["current"], limit: 25 }
    ),
    (error) => error.code === "invalid_core_projection"
  );
  await assert.rejects(
    () => repository.getServicingOperationsQueueInTransaction({
      async query() {
        return { rows: [{
          obligation_id: "obligation_inconsistent",
          subject_id: "subject_inconsistent",
          asset_id: "asset_inconsistent",
          status: "delinquent",
          servicing_classification: "defaulted",
          days_past_due: 12,
          priority_rank: 1,
          outstanding_principal_minor: "100",
          outstanding_interest_minor: "0",
          outstanding_fees_minor: "0",
          past_due_principal_minor: "100",
          past_due_interest_minor: "0",
          past_due_fees_minor: "0",
          oldest_unpaid_installment_id: "installment_inconsistent",
          oldest_due_at: new Date("2026-07-01T00:00:00.000Z"),
          servicing_effective_at: new Date("2026-07-17T00:00:00.000Z"),
          schedule_sequence: 1,
          servicing_owner_code: "sandbox_platform",
          latest_action_id: null
        }] };
      }
    }, { classifications: ["defaulted"], limit: 25 }),
    (error) => error.code === "projection_integrity_mismatch"
  );
});
