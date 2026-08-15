import assert from "node:assert/strict";
import test from "node:test";
import { assertTenantProtocolResult } from "../../../packages/api-contract/src/index.js";
import { readServicingQueueQueryHandler } from "../src/index.js";

function row(overrides = {}) {
  return {
    obligationId: "obligation_queue_001",
    subjectId: "subject_queue_001",
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
    oldestUnpaidInstallmentId: "installment_queue_001",
    oldestDueAt: "2026-04-11T01:00:00.000Z",
    servicingEffectiveAt: "2026-07-16T01:00:00.000Z",
    scheduleSequence: 1,
    servicingOwnerCode: "sandbox_platform",
    latestServicingAction: {
      servicingActionId: "servicing_action_queue_001",
      actionType: "advance",
      nextStatus: "defaulted",
      nextClassification: "defaulted",
      daysPastDue: 96,
      reasonCode: "servicing_default_threshold",
      source: "system_worker",
      effectiveAt: "2026-07-16T01:00:00.000Z",
      schemaVersion: "servicing_queue_action_summary.v1"
    },
    ...overrides
  };
}

function context(repository, payload = {}) {
  return {
    client: {},
    coreRepository: repository,
    authorizationDecision: {
      resourceType: "servicing_queue",
      resourceId: "servicing_queue_test"
    },
    payload,
    now: new Date("2026-07-17T01:00:00.000Z")
  };
}

test("private Servicing queue returns a closed PII-free severity page", async () => {
  const calls = [];
  const handler = readServicingQueueQueryHandler();
  const response = await handler.execute(context({
    async getServicingOperationsQueueInTransaction(_client, options) {
      calls.push(options);
      return [row(), row({
        obligationId: "obligation_queue_002",
        subjectId: "subject_queue_002",
        status: "delinquent",
        servicingClassification: "dpd_61_89",
        daysPastDue: 72,
        priorityRank: 2,
        oldestUnpaidInstallmentId: "installment_queue_002",
        oldestDueAt: "2026-05-05T01:00:00.000Z",
        latestServicingAction: undefined
      })];
    }
  }, { classifications: ["dpd_61_89", "defaulted"], limit: 1 }));

  assert.deepEqual(calls, [{
    classifications: ["defaulted", "dpd_61_89"],
    limit: 2
  }]);
  assert.equal(response.cases.length, 1);
  assert.equal(response.cases[0].priority, "critical");
  assert.equal(response.cases[0].reviewCode, "default_resolution_review");
  assert.equal(response.page.hasMore, true);
  assert.match(response.page.nextCursor, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(response.safety, {
    readOnly: true,
    piiIncluded: false,
    dispositionAuthority: false,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false
  });
  assert.equal(JSON.stringify(response).includes("actorHash"), false);
  assertTenantProtocolResult({
    operationId: "pilotReadServicingQueue",
    replayed: false,
    response,
    schemaVersion: "tenant_protocol_result.v1"
  });
});

test("Servicing queue cursor is filter-bound and forwards exact keyset state", async () => {
  const handler = readServicingQueueQueryHandler();
  const first = await handler.execute(context({
    async getServicingOperationsQueueInTransaction() {
      return [row(), row({ obligationId: "obligation_queue_extra" })];
    }
  }, { classifications: ["defaulted"], limit: 1 }));
  let received;
  await handler.execute(context({
    async getServicingOperationsQueueInTransaction(_client, options) {
      received = options;
      return [];
    }
  }, {
    classifications: ["defaulted"],
    limit: 1,
    cursor: first.page.nextCursor
  }));
  assert.deepEqual(received, {
    classifications: ["defaulted"],
    limit: 2,
    afterPriorityRank: 1,
    afterDaysPastDue: 96,
    afterOldestDueAt: "2026-04-11T01:00:00.000Z",
    afterObligationId: "obligation_queue_001"
  });

  await assert.rejects(
    () => handler.execute(context({
      async getServicingOperationsQueueInTransaction() { return []; }
    }, {
      classifications: ["dpd_61_89"],
      limit: 1,
      cursor: first.page.nextCursor
    })),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

test("Servicing queue rejects unreviewed filters and resource mismatches", async () => {
  const handler = readServicingQueueQueryHandler();
  const repository = {
    async getServicingOperationsQueueInTransaction() { return []; }
  };
  for (const payload of [
    { classifications: ["current"] },
    { classifications: [] },
    { classifications: ["defaulted", "defaulted"] },
    { limit: 51 },
    { search: "borrower" },
    { cursor: "not_a_valid_cursor" }
  ]) {
    await assert.rejects(
      () => handler.execute(context(repository, payload)),
      (error) => error.code === "invalid_tenant_command_payload"
    );
  }

  await assert.rejects(
    () => handler.execute({
      ...context(repository),
      authorizationDecision: { resourceType: "risk_portfolio", resourceId: "queue" }
    }),
    (error) => error.code === "tenant_resource_unavailable"
  );
});
