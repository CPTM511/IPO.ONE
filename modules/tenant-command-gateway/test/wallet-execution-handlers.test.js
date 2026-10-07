import assert from "node:assert/strict";
import test from "node:test";
import {
  TenantCommandHandlerRegistry,
  WALLET_EXECUTION_OPERATION_IDS,
  createWalletExecutionHandlers
} from "../src/index.js";

const HASH = `0x${"a".repeat(64)}`;

function application(calls) {
  return Object.fromEntries([
    "discoverCapabilities", "prepareGrant", "activateGrant", "readGrant", "revokeGrant",
    "prepareExecution", "approveExecution", "assertSubmissionDisabled", "readExecution"
  ].map((name) => [name, async (context) => {
    calls.push({ name, context });
    return name.startsWith("read") || name === "discoverCapabilities"
      ? { name, sandboxOnly: true, fundsAuthority: false }
      : {
          aggregateType: "wallet_execution_fixture",
          aggregateId: context.resourceId,
          events: [{}],
          writes: [],
          response: { name, sandboxOnly: true, fundsAuthority: false }
        };
  }]));
}

function resource(resourceType, resourceId = `${resourceType}_local`) {
  return { resourceType, resourceId };
}

function planContext(resourceType, payload, reasonCode) {
  return {
    payload,
    reasonCode,
    authorizationDecision: {
      resourceType,
      resourceId: `${resourceType}_local`
    }
  };
}

test("EXEC-003 registers the exact wallet operation family once", () => {
  const handlers = createWalletExecutionHandlers({ application: application([]) });
  const registry = new TenantCommandHandlerRegistry(handlers);
  assert.deepEqual(registry.listOperationIds(), [...WALLET_EXECUTION_OPERATION_IDS].sort());
});

test("EXEC-003 prepare execution accepts intent reference and rejects raw transaction fields", async () => {
  const calls = [];
  const handler = createWalletExecutionHandlers({ application: application(calls) })
    .find(({ operationId }) => operationId === "walletPrepareExecution");
  const payload = { transferIntentId: "transfer_intent_exec003_local" };
  await handler.preflight({ payload, resource: resource("delegated_wallet_grant") });
  await handler.plan(planContext("delegated_wallet_grant", payload));
  assert.equal(calls[0].name, "prepareExecution");
  assert.deepEqual(calls[0].context.payload, payload);
  assert.throws(
    () => handler.preflight({
      payload: { ...payload, calldata: "0x12345678" },
      resource: resource("delegated_wallet_grant")
    }),
    { code: "invalid_tenant_command_payload" }
  );
});

test("EXEC-003 submission route always fails closed after the canonical guard", async () => {
  const calls = [];
  const handler = createWalletExecutionHandlers({ application: application(calls) })
    .find(({ operationId }) => operationId === "walletSubmitExecution");
  const payload = { preflightHash: HASH };
  await handler.preflight({ payload, resource: resource("wallet_execution") });
  await assert.rejects(
    handler.plan(planContext("wallet_execution", payload)),
    { code: "execution_submission_disabled_l0_local_no_funds" }
  );
  assert.equal(calls[0].name, "assertSubmissionDisabled");
});

test("EXEC-003 grant revocation requires a reviewed closed reason", async () => {
  const calls = [];
  const handler = createWalletExecutionHandlers({ application: application(calls) })
    .find(({ operationId }) => operationId === "walletRevokeGrant");
  await handler.preflight({ payload: {}, resource: resource("delegated_wallet_grant") });
  await assert.rejects(
    handler.plan(planContext("delegated_wallet_grant", {}, "unreviewed_reason")),
    { code: "invalid_tenant_command_payload" }
  );
  await handler.plan(planContext("delegated_wallet_grant", {}, "operator_request"));
  assert.equal(calls[0].name, "revokeGrant");
});

test("EXEC-003 query handlers preserve exact owned resources", async () => {
  const calls = [];
  const handlers = createWalletExecutionHandlers({ application: application(calls) });
  const read = handlers.find(({ operationId }) => operationId === "walletReadExecution");
  await read.preflight({ payload: {}, resource: resource("wallet_execution", "wallet_execution_exact") });
  const response = await read.execute({
    payload: {},
    resource: resource("wallet_execution", "wallet_execution_exact")
  });
  assert.equal(response.fundsAuthority, false);
  assert.equal(calls[0].context.resourceId, "wallet_execution_exact");
});


test("local runtime discovery satisfies the deployed protocol and cannot advertise funds authority", async () => {
  const { createPostgresWalletExecutionApplication } = await import("../../agentic-execution/src/postgres-wallet-execution-application.js");
  const { assertTenantProtocolResult } = await import("../../../packages/api-contract/src/tenant-protocol.js");
  const response = await createPostgresWalletExecutionApplication().discoverCapabilities();
  const result = { operationId: "walletDiscoverCapabilities", replayed: false, response, schemaVersion: "tenant_protocol_result.v1" };
  assert.equal(assertTenantProtocolResult(result), result);
  assert.equal(response.count, response.items.length);
  assert.equal(response.items[0].adapterId, "local_sandbox");
  for (const field of ["transactionsAllowed", "productionAuthority", "fundsAuthority", "externalCallsEnabled"]) {
    const widened = structuredClone(result);
    widened.response.items[0][field] = true;
    assert.throws(() => assertTenantProtocolResult(widened), { code: "invalid_tenant_protocol_result" });
  }
});
