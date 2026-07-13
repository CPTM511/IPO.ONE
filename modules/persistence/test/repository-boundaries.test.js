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
