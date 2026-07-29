import assert from "node:assert/strict";
import test from "node:test";
import { runLocalWorkerCycle } from "../src/local-worker.js";

function adapters({ publishFails = false } = {}) {
  const calls = [];
  const message = {
    outboxMessageId: "outbox_local_test",
    topic: "ipo.one.domain-events.v1",
    payloadHash: "0x1234"
  };
  return {
    calls,
    repository: {
      async claimOutboxBatch(input) {
        calls.push(["claim", input]);
        return [message];
      },
      async markOutboxPublished(input) {
        calls.push(["published", input]);
      },
      async markOutboxFailed(input) {
        calls.push(["failed", {
          outboxMessageId: input.outboxMessageId,
          workerId: input.workerId
        }]);
      }
    },
    reconciliationService: {
      async run(input) {
        calls.push(["reconcile", input]);
        return { status: "passed", replayed: false };
      }
    },
    creditOutcomeMaterializer: {
      async run(input) {
        calls.push(["credit-outcome", input]);
        return { materializedCount: 1 };
      }
    },
    async publish(value) {
      calls.push(["sink", value]);
      if (publishFails) throw new Error("local sink unavailable");
    }
  };
}

test("local worker delivers a bounded synthetic outbox batch and reconciles", async () => {
  const fake = adapters();
  const result = await runLocalWorkerCycle({
    repository: fake.repository,
    reconciliationService: fake.reconciliationService,
    creditOutcomeMaterializer: fake.creditOutcomeMaterializer,
    workerId: "local_worker_test",
    reconciliationKey: "local-stack-reconciliation-test",
    publish: fake.publish
  });

  assert.equal(result.claimedCount, 1);
  assert.equal(result.publishedCount, 1);
  assert.equal(result.creditOutcomes.materializedCount, 1);
  assert.equal(result.reconciliation.status, "passed");
  assert.deepEqual(fake.calls.map(([name]) => name), [
    "credit-outcome",
    "claim",
    "sink",
    "published",
    "reconcile"
  ]);
});

test("local worker releases a failed synthetic delivery for bounded retry", async () => {
  const fake = adapters({ publishFails: true });
  await assert.rejects(
    runLocalWorkerCycle({
      repository: fake.repository,
      reconciliationService: fake.reconciliationService,
      creditOutcomeMaterializer: fake.creditOutcomeMaterializer,
      workerId: "local_worker_test",
      reconciliationKey: "local-stack-reconciliation-test",
      publish: fake.publish
    }),
    /local sink unavailable/
  );
  assert.deepEqual(fake.calls.map(([name]) => name), [
    "credit-outcome",
    "claim",
    "sink",
    "failed"
  ]);
});

test("local worker runs one bounded Evidence anchor cycle without changing outbox semantics", async () => {
  const fake = adapters();
  const evidenceCalls = [];
  const result = await runLocalWorkerCycle({
    repository: fake.repository,
    reconciliationService: fake.reconciliationService,
    creditOutcomeMaterializer: fake.creditOutcomeMaterializer,
    evidenceAnchorWorker: {
      async runOnce(input) {
        evidenceCalls.push(input);
        return {
          status: "unknown",
          manualReconciliationRequired: false
        };
      }
    },
    workerId: "local_worker_test",
    publish: fake.publish
  });
  assert.deepEqual(evidenceCalls, [{ limit: 16 }]);
  assert.equal(result.evidenceAnchors.status, "unknown");
  assert.equal(result.claimedCount, 1);
  assert.equal(result.publishedCount, 1);
});

test("local worker rejects open identifiers and adapter drift", async () => {
  const fake = adapters();
  await assert.rejects(
    runLocalWorkerCycle({
      repository: fake.repository,
      reconciliationService: fake.reconciliationService,
      creditOutcomeMaterializer: fake.creditOutcomeMaterializer,
      workerId: "INVALID WORKER",
      publish: fake.publish
    }),
    (error) => error?.code === "invalid_local_worker_configuration"
  );
  await assert.rejects(
    runLocalWorkerCycle({
      repository: {},
      reconciliationService: fake.reconciliationService,
      workerId: "local_worker_test",
      publish: fake.publish
    }),
    (error) => error?.code === "invalid_local_worker_configuration"
  );
});
