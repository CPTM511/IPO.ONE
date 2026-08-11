import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { VenueExecutionClient } from "../src/index.js";

const REQUEST = { requestId: "request_venue002a_0001", correlationId: "correlation_venue002a_0001" };
const COMMAND = { ...REQUEST, idempotencyKey: "idempotency_venue002a_0001" };
const HASH = `0x${"a".repeat(64)}`;
const fixtures = JSON.parse(await readFile(
  join(process.cwd(), "api", "tenant-protocol", "conformance", "venue-execution.v1.fixtures.json"),
  "utf8"
));

function makeClient() {
  const requests = [];
  return {
    requests,
    client: new VenueExecutionClient({
      execute: async (request) => {
        requests.push(request);
        return structuredClone(fixtures.validResults.find(({ operationId }) => operationId === request.operationId));
      }
    })
  };
}

test("HYPERLIQUID-002A SDK derives exact Venue execution from OrderIntent", async () => {
  const state = makeClient();
  await state.client.prepareExecution({
    ...COMMAND, delegateId: "venue_delegate_fixture",
    orderIntentId: "trading_order_intent_fixture", orderIntentHash: HASH
  });
  assert.deepEqual(state.requests[0].payload, {
    orderIntentId: "trading_order_intent_fixture", orderIntentHash: HASH
  });
  assert.equal(state.requests[0].resource.resourceType, "venue_delegate");
});

test("HYPERLIQUID-002A SDK rejects raw Venue payload and malformed hash", () => {
  const state = makeClient();
  assert.throws(() => state.client.prepareExecution({
    ...COMMAND, delegateId: "venue_delegate_fixture",
    orderIntentId: "trading_order_intent_fixture", orderIntentHash: HASH,
    action: { type: "order" }
  }), TypeError);
  assert.throws(() => state.client.submitExecution({
    ...COMMAND, executionId: "venue_execution_fixture", preparedExecutionHash: "not-a-hash"
  }), TypeError);
  assert.equal(state.requests.length, 0);
});
