import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../../event-audit/src/index.js";
import { ObligationService } from "../src/index.js";

function createServiceWithActiveObligation() {
  const service = new ObligationService({ eventStore: new EventStore() });
  const obligation = service.createObligation({
    subjectId: "subject_1",
    principalId: "principal_1",
    mandateId: "mandate_1",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    amountMinor: "100",
    dueAt: new Date(Date.now() + 86400_000).toISOString(),
    spendPolicyId: "policy_1",
    cashflowRouteId: "route_1",
    nonce: "nonce-1"
  });
  return { service, obligation: service.activateObligation(obligation.obligationId) };
}

test("obligation service applies repayment and closes valid lifecycle", () => {
  const { service, obligation } = createServiceWithActiveObligation();
  const partial = service.applyRepayment({ obligationId: obligation.obligationId, amountMinor: "40" });
  const full = service.applyRepayment({ obligationId: obligation.obligationId, amountMinor: "60" });
  const closed = service.closeObligation(obligation.obligationId);

  assert.equal(partial.obligation.status, "partially_repaid");
  assert.equal(full.obligation.status, "fully_repaid");
  assert.equal(closed.status, "closed");
});

test("obligation service rejects invalid direct repayment from created", () => {
  const service = new ObligationService({ eventStore: new EventStore() });
  const obligation = service.createObligation({
    subjectId: "subject_1",
    principalId: "principal_1",
    mandateId: "mandate_1",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    amountMinor: "100",
    dueAt: new Date(Date.now() + 86400_000).toISOString(),
    spendPolicyId: "policy_1",
    cashflowRouteId: "route_1",
    nonce: "nonce-1"
  });

  assert.throws(() => service.applyRepayment({ obligationId: obligation.obligationId, amountMinor: "10" }), /not in a repayable/);
});

test("overdue obligation can be cured by full repayment", () => {
  const { service, obligation } = createServiceWithActiveObligation();
  service.markOverdue(obligation.obligationId);

  const result = service.applyRepayment({ obligationId: obligation.obligationId, amountMinor: "100" });

  assert.equal(result.obligation.status, "fully_repaid");
  assert.equal(result.obligation.outstandingPrincipalMinor, "0");
});
