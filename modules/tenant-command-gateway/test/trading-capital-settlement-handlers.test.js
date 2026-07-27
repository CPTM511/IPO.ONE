import assert from "node:assert/strict";
import test from "node:test";
import {
  createTradingCapitalSettlementHandlers
} from "../src/trading-capital-settlement-handlers.js";

const H = `0x${"a".repeat(64)}`;

test("TC-104 settlement handler registry is exact and role-separated", () => {
  const handlers = createTradingCapitalSettlementHandlers();
  assert.deepEqual(
    handlers.map(({ operationId }) => operationId),
    [
      "tradingRequestClose",
      "tradingRunSettlement",
      "tradingReadSettlement",
      "tradingIssuePerformanceProof",
      "tradingReadFacilityEvidence"
    ]
  );
  assert.deepEqual(
    handlers.map(({ kind }) => kind),
    ["command", "command", "query", "command", "query"]
  );
  assert.equal(Object.isFrozen(handlers), true);
});

test("TC-104 command preflight rejects caller-supplied economics and open shapes", () => {
  const byId = new Map(
    createTradingCapitalSettlementHandlers().map((handler) => [
      handler.operationId,
      handler
    ])
  );
  assert.doesNotThrow(() =>
    byId.get("tradingRequestClose").preflight({
      payload: { expectedStateHash: H, expectedVersion: 8 }
    })
  );
  assert.doesNotThrow(() =>
    byId.get("tradingRunSettlement").preflight({
      payload: {
        expectedCloseRequestHash: H,
        expectedFacilityStateHash: H,
        expectedFacilityVersion: 8
      }
    })
  );
  assert.doesNotThrow(() =>
    byId.get("tradingIssuePerformanceProof").preflight({
      payload: { expectedSettlementHash: H }
    })
  );
  for (const [operationId, payload] of [
    [
      "tradingRequestClose",
      { expectedStateHash: H, expectedVersion: 8, feeMinor: "1" }
    ],
    [
      "tradingRunSettlement",
      {
        expectedCloseRequestHash: H,
        expectedFacilityStateHash: H,
        expectedFacilityVersion: 8,
        realizedPnlMinor: "1"
      }
    ],
    [
      "tradingIssuePerformanceProof",
      { expectedSettlementHash: H, rawStrategy: "forbidden" }
    ]
  ]) {
    assert.throws(
      () => byId.get(operationId).preflight({ payload }),
      /not available/
    );
  }
});
