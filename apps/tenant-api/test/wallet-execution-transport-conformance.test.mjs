import assert from "node:assert/strict";
import test from "node:test";
import { TENANT_PROTOCOL_OPERATIONS } from "../../../packages/api-contract/src/index.js";
import { WALLET_EXECUTION_SDK_OPERATIONS } from "../../../packages/sdk/src/index.js";
import {
  EXECUTION_ACCOUNT_BINDING_OPERATION_IDS,
  WALLET_EXECUTION_OPERATION_IDS
} from "../../../modules/tenant-command-gateway/src/index.js";
import { WALLET_EXECUTION_MCP_TOOLS } from "../../agent-mcp/src/index.js";
import {
  WALLET_EXECUTION_OPENAPI_OPERATION_IDS,
  createTenantOpenApiDocument
} from "../src/tenant-openapi.js";

const EXPECTED = [
  "walletPrepareAccountBinding", "walletSubmitAccountBinding",
  "walletReadAccountBindings", "walletRevokeAccountBinding",
  "walletDiscoverCapabilities", "walletPrepareGrant", "walletActivateGrant",
  "walletReadGrant", "walletRevokeGrant", "walletPrepareExecution",
  "walletApproveExecution", "walletSubmitExecution", "walletReadExecution"
];

test("PRODUCT-INTEGRATION-001 Tenant/OpenAPI/SDK/MCP/Gateway expose one exact operation family", () => {
  const catalog = TENANT_PROTOCOL_OPERATIONS
    .map(({ operationId }) => operationId)
    .filter((operationId) => operationId.startsWith("wallet"));
  const mcp = WALLET_EXECUTION_MCP_TOOLS.map(({ operationId }) => operationId);
  assert.deepEqual(catalog, EXPECTED);
  assert.deepEqual(WALLET_EXECUTION_OPENAPI_OPERATION_IDS, EXPECTED);
  assert.deepEqual(WALLET_EXECUTION_SDK_OPERATIONS, EXPECTED);
  assert.deepEqual([
    ...EXECUTION_ACCOUNT_BINDING_OPERATION_IDS,
    ...WALLET_EXECUTION_OPERATION_IDS
  ], EXPECTED);
  assert.deepEqual(mcp, EXPECTED);
});

test("PRODUCT-INTEGRATION-001 OpenAPI declares authenticated binding and disabled submission", () => {
  const document = createTenantOpenApiDocument("http://127.0.0.1:3000");
  assert.ok(document.paths["/tenant/v1/operations"].post);
  assert.deepEqual(document["x-ipo-one-wallet-operations"], EXPECTED);
  assert.equal(document["x-ipo-one-wallet-submission-enabled"], false);
  assert.equal(document["x-real-funds-enabled"], false);
});

test("PRODUCT-INTEGRATION-001 every wallet catalog entry is private and has no funds authority", () => {
  const entries = TENANT_PROTOCOL_OPERATIONS.filter(({ operationId }) => operationId.startsWith("wallet"));
  assert.equal(entries.length, 13);
  assert.ok(entries.every((entry) => entry.public === false && entry.fundsAuthority === false));
  assert.equal(entries.find(({ operationId }) => operationId === "walletSubmitExecution").quotaClass, "economic");
});
