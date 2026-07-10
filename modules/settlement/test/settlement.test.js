import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../../event-audit/src/index.js";
import { SettlementService } from "../src/index.js";

test("settlement service records and settles provider spend", () => {
  const service = new SettlementService({ eventStore: new EventStore() });
  const settlement = service.recordSettlement({
    spendRequestId: "spend_1",
    providerId: "provider_1",
    assetId: "usdc",
    amountMinor: "20"
  });
  const settled = service.settle(settlement.settlementId);

  assert.equal(settlement.status, "recorded");
  assert.equal(settled.status, "settled");
  assert.throws(() => service.fail(settlement.settlementId, "late failure"), /cannot transition/);
});
