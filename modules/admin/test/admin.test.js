import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../../event-audit/src/index.js";
import { AdminService } from "../src/index.js";

test("admin service aggregates exposure and routes freeze through risk interface", () => {
  const store = new EventStore();
  let frozen = false;
  const service = new AdminService({
    eventStore: store,
    riskService: {
      listCreditLines: () => [{ limitMinor: "100", utilizedMinor: "20" }],
      freezeCreditLine: () => {
        frozen = true;
        return { status: "frozen" };
      }
    },
    obligationService: {
      listObligations: () => [{ outstandingPrincipalMinor: "20" }]
    }
  });

  assert.deepEqual(service.getExposure(), {
    creditLineCount: 1,
    obligationCount: 1,
    outstandingMinor: "20",
    utilizedMinor: "20",
    limitMinor: "100"
  });
  const result = service.freezeCreditLine({ adminId: "admin_1", creditLineId: "credit_1", reason: "risk review" });
  assert.equal(result.creditLine.status, "frozen");
  assert.equal(frozen, true);
});
