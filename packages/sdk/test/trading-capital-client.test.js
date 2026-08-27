import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  IpoOneTradingCapitalClient,
  IpoOneTradingCapitalSdkError,
  TRADING_CAPITAL_OPERATION_IDS,
  TRADING_CAPITAL_ROLE_OPERATIONS
} from "../src/trading-capital-client.js";
import { TENANT_PROTOCOL_OPERATIONS } from "../../api-contract/src/index.js";

const fixtures = JSON.parse(
  await readFile(
    new URL(
      "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
      import.meta.url
    ),
    "utf8"
  )
);

test("TC-104 and M2B-001 typed SDK cover the exact 28-operation catalog", () => {
  assert.deepEqual(
    TENANT_PROTOCOL_OPERATIONS
      .map(({ operationId }) => operationId)
      .filter((operationId) =>
        operationId.startsWith("trading") ||
        operationId.includes("SecuredFacilityAuthorization")
      ),
    TRADING_CAPITAL_OPERATION_IDS
  );
  assert.deepEqual(
    [...new Set(Object.values(TRADING_CAPITAL_ROLE_OPERATIONS).flat())].sort(),
    [...TRADING_CAPITAL_OPERATION_IDS].sort()
  );
});

test("M2B-001 SDK preserves Principal mutation and Agent read-only boundaries", async () => {
  const readRequest = fixtures.validRequests.find(
    ({ operationId }) => operationId === "agentReadSecuredFacilityAuthorization"
  );
  const readResult = fixtures.validResults.find(
    ({ operationId }) => operationId === "agentReadSecuredFacilityAuthorization"
  );
  const createRequest = fixtures.validRequests.find(
    ({ operationId }) => operationId === "agentCreateSecuredFacilityAuthorization"
  );
  const agent = new IpoOneTradingCapitalClient({
    actorType: "agent",
    transportProfile: "local_in_process",
    execute: async () => readResult
  });
  assert.deepEqual(await agent.executeOperation(readRequest), readResult);
  await assert.rejects(
    () => agent.executeOperation(createRequest),
    (error) => error.code === "trading_capital_sdk_scope_denied"
  );
  assert.equal(
    TRADING_CAPITAL_ROLE_OPERATIONS.human.includes(
      "agentRevokeSecuredFacilityAuthorization"
    ),
    true
  );
});

test("TC-104 typed SDK validates request, result, role, and local transport", async () => {
  const request = fixtures.validRequests.find(
    ({ operationId }) => operationId === "tradingRequestClose"
  );
  const response = fixtures.validResults.find(
    ({ operationId }) => operationId === "tradingRequestClose"
  );
  const calls = [];
  const client = new IpoOneTradingCapitalClient({
    actorType: "human",
    transportProfile: "local_in_process",
    execute: async (value) => {
      calls.push(structuredClone(value));
      return response;
    }
  });
  assert.deepEqual(await client.executeOperation(request), response);
  assert.deepEqual(calls, [request]);

  const provider = new IpoOneTradingCapitalClient({
    actorType: "provider",
    transportProfile: "local_in_process",
    execute: async () => response
  });
  await assert.rejects(
    () => provider.executeOperation(request),
    (error) =>
      error instanceof IpoOneTradingCapitalSdkError &&
      error.code === "trading_capital_sdk_scope_denied"
  );
  assert.throws(
    () =>
      new IpoOneTradingCapitalClient({
        actorType: "human",
        transportProfile: "remote_mcp",
        execute: async () => response
      }),
    /configuration is invalid/
  );
});

test("TC-104 typed SDK rejects open requests and response-operation drift", async () => {
  const request = fixtures.validRequests.find(
    ({ operationId }) => operationId === "tradingReadFacilityEvidence"
  );
  const wrong = fixtures.validResults.find(
    ({ operationId }) => operationId === "tradingReadSettlement"
  );
  const client = new IpoOneTradingCapitalClient({
    actorType: "agent",
    transportProfile: "local_in_process",
    execute: async () => wrong
  });
  await assert.rejects(
    () => client.executeOperation({ ...request, rawStrategy: "forbidden" }),
    (error) => error.code === "invalid_trading_capital_sdk_request"
  );
  await assert.rejects(
    () => client.executeOperation(request),
    (error) => error.code === "trading_capital_sdk_operation_drift"
  );
});
