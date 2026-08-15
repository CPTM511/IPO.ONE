import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readOwnedObligationQueryHandler } from "../src/index.js";

const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const view = fixtures.validResults.find(
  (result) => result.operationId === "pilotReadOwnObligation"
).response;
const servicingAction = {
  servicingActionId: "sandbox_servicing_action_owned_read_001",
  servicingActionHash: view.obligation.obligationHash,
  obligationId: view.obligation.obligationId,
  subjectId: view.obligation.subjectId,
  actionType: "advance",
  previousStatus: "active",
  nextStatus: "delinquent",
  previousClassification: "current",
  nextClassification: "dpd_1_30",
  daysPastDue: 1,
  oldestUnpaidInstallmentId: view.obligation.installments[0].installmentId,
  reasonCode: "scheduled_payment_past_due",
  source: "system_worker",
  policyVersion: "sandbox-servicing-policy.v1",
  scheduleSequenceBefore: 1,
  scheduleSequenceAfter: 1,
  balancesBefore: {
    outstandingPrincipalMinor: view.obligation.outstandingPrincipalMinor,
    outstandingInterestMinor: view.obligation.outstandingInterestMinor,
    outstandingFeesMinor: view.obligation.outstandingFeesMinor,
    totalRepaidMinor: view.obligation.totalRepaidMinor
  },
  balancesAfter: {
    outstandingPrincipalMinor: view.obligation.outstandingPrincipalMinor,
    outstandingInterestMinor: view.obligation.outstandingInterestMinor,
    outstandingFeesMinor: view.obligation.outstandingFeesMinor,
    totalRepaidMinor: view.obligation.totalRepaidMinor
  },
  effectiveAt: view.asOf,
  sandboxOnly: true,
  productionFundsMoved: false,
  schemaVersion: "sandbox_servicing_action.v1"
};

function repository({ obligation = view.obligation, latestServicingAction } = {}) {
  const storedObligation = obligation === undefined
    ? undefined
    : {
        ...obligation,
        authorityRef: obligation.authorityId,
        authorityId: undefined
      };
  return {
    async getObligationInTransaction(_client, obligationId, options) {
      assert.equal(obligationId, view.obligation.obligationId);
      assert.deepEqual(options, { lock: false });
      return storedObligation;
    },
    async findLatestSandboxServicingActionInTransaction(_client, obligationId) {
      assert.equal(obligationId, view.obligation.obligationId);
      return latestServicingAction;
    }
  };
}

function input(coreRepository) {
  return {
    client: {},
    coreRepository,
    resource: {
      resourceType: "obligation",
      resourceId: view.obligation.obligationId
    },
    payload: {},
    now: new Date(view.asOf)
  };
}

test("owned Obligation query returns one exact durable sandbox projection", async () => {
  const result = await readOwnedObligationQueryHandler().execute(input(repository()));
  assert.deepEqual(result, view);
  assert.equal(result.obligation.schemaVersion, "obligation.v2");
  assert.equal(result.sandboxOnly, true);
  assert.equal(result.productionFundsMoved, false);
  assert.equal(result.withdrawable, false);
});

test("owned Obligation query includes the latest verified servicing action when present", async () => {
  const result = await readOwnedObligationQueryHandler().execute(input(repository({
    latestServicingAction: {
      ...servicingAction,
      obligationId: view.obligation.obligationId,
      subjectId: view.obligation.subjectId
    }
  })));
  assert.equal(result.latestServicingAction.servicingActionId, servicingAction.servicingActionId);
  assert.equal(result.latestServicingAction.obligationId, view.obligation.obligationId);
  assert.equal(result.latestServicingAction.sandboxOnly, true);
  assert.equal(result.latestServicingAction.productionFundsMoved, false);
});

test("owned Obligation query fails closed for malformed requests and unsafe projections", async () => {
  const handler = readOwnedObligationQueryHandler();
  await assert.rejects(
    handler.execute({ ...input(repository()), payload: { actorId: "attacker" } }),
    (error) => error.code === "tenant_resource_unavailable"
  );
  await assert.rejects(
    handler.execute(input(repository({
      obligation: { ...view.obligation, productionFundsMoved: true }
    }))),
    (error) => error.code === "tenant_resource_unavailable"
  );
  await assert.rejects(
    handler.execute(input(repository({
      latestServicingAction: {
        obligationId: view.obligation.obligationId,
        schemaVersion: "sandbox_servicing_action.v1",
        sandboxOnly: true,
        productionFundsMoved: true
      }
    }))),
    (error) => error.code === "projection_integrity_mismatch"
  );
});
