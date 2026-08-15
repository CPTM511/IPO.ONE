import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  WALLET_EXECUTION_SDK_OPERATIONS,
  WalletExecutionClient
} from "../src/index.js";

const REQUEST = {
  requestId: "request_exec003_0001",
  correlationId: "correlation_exec003_0001"
};
const COMMAND = { ...REQUEST, idempotencyKey: "idempotency_exec003_0001" };
const HASH = `0x${"a".repeat(64)}`;
const fixtures = JSON.parse(await readFile(
  join(process.cwd(), "api", "tenant-protocol", "conformance", "wallet-execution.v1.fixtures.json"),
  "utf8"
));

function client() {
  const requests = [];
  return {
    requests,
    value: new WalletExecutionClient({
      execute: async (request) => {
        requests.push(request);
        return structuredClone(
          fixtures.validResults.find(({ operationId }) => operationId === request.operationId)
        );
      }
    })
  };
}

test("PRODUCT-INTEGRATION-001 SDK exposes binding and execution through one wallet family", () => {
  assert.deepEqual(WALLET_EXECUTION_SDK_OPERATIONS, [
    "walletPrepareAccountBinding", "walletSubmitAccountBinding",
    "walletReadAccountBindings", "walletRevokeAccountBinding",
    "walletDiscoverCapabilities", "walletPrepareGrant", "walletActivateGrant",
    "walletReadGrant", "walletRevokeGrant", "walletPrepareExecution",
    "walletApproveExecution", "walletSubmitExecution", "walletReadExecution"
  ]);
});

test("PRODUCT-INTEGRATION-001 SDK keeps AccountBinding separate from authentication", async () => {
  const state = client();
  await state.value.prepareAccountBinding({
    ...COMMAND,
    subjectId: "subject_exec_binding",
    accountId: "eip155:84532:0x1111111111111111111111111111111111111111"
  });
  assert.deepEqual(state.requests[0], {
    operationId: "walletPrepareAccountBinding",
    payload: { accountId: "eip155:84532:0x1111111111111111111111111111111111111111" },
    resource: { resourceType: "subject", resourceId: "subject_exec_binding" },
    ...COMMAND,
    schemaVersion: "tenant_protocol_request.v1"
  });
  assert.equal(Object.hasOwn(state.requests[0], "authentication"), false);
});

test("EXEC-003 SDK prepares execution from intent reference without calldata", async () => {
  const state = client();
  await state.value.prepareExecution({
    ...COMMAND,
    grantId: "delegated_wallet_grant_exec003",
    transferIntentId: "transfer_intent_exec003"
  });
  assert.deepEqual(state.requests[0], {
    operationId: "walletPrepareExecution",
    payload: { transferIntentId: "transfer_intent_exec003" },
    resource: {
      resourceType: "delegated_wallet_grant",
      resourceId: "delegated_wallet_grant_exec003"
    },
    ...COMMAND,
    schemaVersion: "tenant_protocol_request.v1"
  });
});

test("EXEC-003 SDK rejects raw payload expansion and malformed bindings", async () => {
  const state = client();
  assert.throws(
    () => state.value.prepareExecution({
      ...COMMAND,
      grantId: "delegated_wallet_grant_exec003",
      transferIntentId: "transfer_intent_exec003",
      calldata: "0x12345678"
    }),
    TypeError
  );
  assert.throws(
    () => state.value.submitExecution({
      ...COMMAND,
      executionId: "wallet_execution_exec003",
      preflightHash: "not-a-hash"
    }),
    TypeError
  );
  assert.equal(state.requests.length, 0);
});

test("EXEC-003 SDK binds submit to one execution and preflight hash", async () => {
  const state = client();
  await state.value.submitExecution({
    ...COMMAND,
    executionId: "wallet_execution_exec003",
    preflightHash: HASH
  });
  assert.equal(state.requests[0].operationId, "walletSubmitExecution");
  assert.deepEqual(state.requests[0].payload, { preflightHash: HASH });
  assert.equal(state.requests[0].resource.resourceId, "wallet_execution_exec003");
});

test("EXEC-003 SDK rejects response operation and safety drift", async () => {
  const baseInput = { ...REQUEST, executionId: "wallet_execution_exec003" };
  const wrongOperation = new WalletExecutionClient({
    execute: async () => structuredClone(
      fixtures.validResults.find(({ operationId }) => operationId === "walletReadGrant")
    )
  });
  await assert.rejects(wrongOperation.readExecution(baseInput), TypeError);

  const unsafe = structuredClone(
    fixtures.validResults.find(({ operationId }) => operationId === "walletReadExecution")
  );
  unsafe.response.transactionsAllowed = true;
  const unsafeClient = new WalletExecutionClient({ execute: async () => unsafe });
  await assert.rejects(unsafeClient.readExecution(baseInput), {
    code: "invalid_tenant_protocol_result"
  });
});
