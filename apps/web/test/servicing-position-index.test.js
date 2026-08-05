import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SERVICING_POSITION_INDEX_LIMIT,
  acceptServicingPositionRefresh,
  createServicingPositionIndex
} from "../src/servicing-position-index.js";

const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const owned = structuredClone(fixtures.validResults.find(
  ({ operationId }) => operationId === "pilotReadOwnObligation"
).response);

function workspace(ids, extra = {}) {
  return {
    workspaceKind: "human_borrower",
    resources: ids.map((resourceId) => ({
      resourceType: "obligation",
      resourceId,
      relationship: "owner"
    })),
    hasMore: false,
    serverTruth: true,
    schemaVersion: "tenant_workspace_resume_view.v1",
    ...extra
  };
}

function viewFor(obligationId) {
  const view = structuredClone(owned);
  view.obligation.obligationId = obligationId;
  view.obligation.installments.forEach((installment, index) => {
    installment.obligationId = obligationId;
    installment.installmentId = `installment_position_${index + 1}_${obligationId}`;
  });
  view.obligation.oldestUnpaidInstallmentId = view.obligation.installments.find(
    (installment) => installment.status !== "paid"
  )?.installmentId ?? null;
  if (view.latestServicingAction) {
    view.latestServicingAction.obligationId = obligationId;
    view.latestServicingAction.oldestUnpaidInstallmentId =
      view.obligation.oldestUnpaidInstallmentId;
  }
  return view;
}

function deeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

test("servicing position index exposes only reauthorized server-current values", () => {
  const ids = ["obligation_position_alpha", "obligation_position_beta"];
  const index = createServicingPositionIndex({
    workspace: workspace(ids),
    views: [
      { obligationId: ids[0], view: viewFor(ids[0]) },
      { obligationId: ids[1], view: viewFor(ids[1]) }
    ],
    selectedObligationId: ids[1]
  });
  assert.equal(index.schemaVersion, "servicing_position_index.v1");
  assert.equal(index.referenceCount, 2);
  assert.equal(index.reviewedCount, 2);
  assert.equal(index.coverage, "complete");
  assert.equal(index.positions.every(({ availability }) => availability === "server_current"), true);
  assert.equal(index.positions.every(({ serverAuthoritative }) => serverAuthoritative === true), true);
  assert.equal(
    index.aggregate.outstandingMinor,
    String(BigInt(owned.obligation.outstandingPrincipalMinor) * 2n)
  );
  assert.equal(index.productionFundsMoved, false);
  assert.equal(deeplyFrozen(index), true);
});

test("principal controller uses the same bounded index for Agent-owned obligations", () => {
  const id = "obligation_agent_position_alpha";
  const index = createServicingPositionIndex({
    workspace: workspace([id], {
      workspaceKind: "principal_controller",
      continuationReceipts: [],
      controlledAgentActorIds: ["actor_agent_controlled"]
    }),
    views: [{ obligationId: id, view: viewFor(id) }],
    selectedObligationId: id
  });
  assert.equal(index.workspaceKind, "principal_controller");
  assert.equal(index.positions[0].relationship, "owner");
  assert.equal(index.positions[0].outstandingMinor, owned.obligation.outstandingPrincipalMinor);
  assert.equal(index.aggregate.outstandingMinor, owned.obligation.outstandingPrincipalMinor);
});

test("servicing position index never invents values for an unrefreshed position", () => {
  const ids = ["obligation_position_alpha", "obligation_position_beta"];
  const index = createServicingPositionIndex({
    workspace: workspace(ids),
    views: [{ obligationId: ids[0], view: viewFor(ids[0]) }]
  });
  assert.equal(index.coverage, "partial");
  assert.equal(index.aggregate, null);
  assert.deepEqual(index.positions[1], {
    obligationId: ids[1],
    relationship: "owner",
    availability: "not_loaded",
    schemaVersion: "servicing_position_summary.v1"
  });
  assert.equal(Object.hasOwn(index.positions[1], "outstandingMinor"), false);
});

test("servicing position index fails closed on authority, identity, clock, and safety drift", () => {
  const id = "obligation_position_alpha";
  const cases = [];

  const unknownWorkspace = workspace([id]);
  unknownWorkspace.actorId = "attacker";
  cases.push({ workspace: unknownWorkspace, views: [] });

  cases.push({
    workspace: workspace([id], { workspaceKind: "auditor" }),
    views: []
  });

  cases.push({
    workspace: workspace([id], {
      controlledAgentActorIds: ["actor_agent_not_human_workspace_data"]
    }),
    views: []
  });

  const mismatched = viewFor("obligation_position_other");
  cases.push({
    workspace: workspace([id]),
    views: [{ obligationId: id, view: mismatched }]
  });

  const unsafe = viewFor(id);
  unsafe.productionFundsMoved = true;
  cases.push({
    workspace: workspace([id]),
    views: [{ obligationId: id, view: unsafe }]
  });

  const stale = viewFor(id);
  stale.asOf = "2020-01-01T00:00:00.000Z";
  cases.push({
    workspace: workspace([id]),
    views: [{ obligationId: id, view: stale }]
  });

  const unknownView = viewFor(id);
  unknownView.settlementPredicted = true;
  cases.push({
    workspace: workspace([id]),
    views: [{ obligationId: id, view: unknownView }]
  });

  for (const input of cases) assert.equal(createServicingPositionIndex(input), null);
});

test("servicing position index is bounded and rejects duplicate reauthorization results", () => {
  const ids = Array.from(
    { length: SERVICING_POSITION_INDEX_LIMIT + 1 },
    (_, index) => `obligation_position_${index + 1}`
  );
  const index = createServicingPositionIndex({
    workspace: workspace(ids),
    views: []
  });
  assert.equal(index.referenceCount, SERVICING_POSITION_INDEX_LIMIT);
  assert.equal(index.hasMoreReferences, true);
  assert.equal(index.coverage, "partial");

  const duplicate = { obligationId: ids[0], view: viewFor(ids[0]) };
  assert.equal(createServicingPositionIndex({
    workspace: workspace(ids),
    views: [duplicate, structuredClone(duplicate)]
  }), null);
});

test("servicing position refresh rejects trusted-time, schedule, and repayment regression", () => {
  const id = "obligation_position_alpha";
  const current = viewFor(id);
  const later = viewFor(id);
  later.asOf = new Date(new Date(current.asOf).getTime() + 1_000).toISOString();
  assert.ok(acceptServicingPositionRefresh(current, later));

  const clockRegression = structuredClone(later);
  clockRegression.asOf = new Date(new Date(current.asOf).getTime() - 1_000).toISOString();
  assert.equal(acceptServicingPositionRefresh(current, clockRegression), null);

  const servicingRegression = structuredClone(later);
  servicingRegression.obligation.servicingEffectiveAt = new Date(
    new Date(current.obligation.servicingEffectiveAt).getTime() - 1_000
  ).toISOString();
  assert.equal(acceptServicingPositionRefresh(current, servicingRegression), null);

  const scheduleRegression = structuredClone(later);
  scheduleRegression.obligation.scheduleSequence = 0;
  assert.equal(acceptServicingPositionRefresh(current, scheduleRegression), null);

  const previousRepaid = viewFor(id);
  const previousInstallment = previousRepaid.obligation.installments[0];
  previousInstallment.paidPrincipalMinor = "5000";
  previousInstallment.status = "partial";
  previousRepaid.obligation.outstandingPrincipalMinor = "5000";
  previousRepaid.obligation.totalRepaidMinor = "5000";
  previousRepaid.obligation.status = "partially_repaid";
  const repaymentRegression = viewFor(id);
  repaymentRegression.asOf = new Date(
    new Date(previousRepaid.asOf).getTime() + 1_000
  ).toISOString();
  assert.equal(
    acceptServicingPositionRefresh(previousRepaid, repaymentRegression),
    null
  );
});
