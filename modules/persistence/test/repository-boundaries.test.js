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
    outstanding_principal_minor: "400"
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
        closed_count: "0",
        principal_minor: "900",
        outstanding_principal_minor: "400",
        accrued_fees_minor: "10",
        repaid_amount_minor: "500"
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
  assert.equal(queries.every(({ sql }) => sql.includes("subject_type")), true);
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
