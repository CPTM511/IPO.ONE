import assert from "node:assert/strict";
import test from "node:test";
import { TENANT_PROTOCOL_OPERATIONS } from "../../../packages/api-contract/src/index.js";
import { VENUE_EXECUTION_SDK_OPERATIONS } from "../../../packages/sdk/src/index.js";
import { VENUE_EXECUTION_OPERATION_IDS } from "../../../modules/tenant-command-gateway/src/index.js";
import { VENUE_EXECUTION_MCP_TOOLS } from "../../agent-mcp/src/index.js";
import {
  VENUE_EXECUTION_OPENAPI_OPERATION_IDS,
  createTenantOpenApiDocument
} from "../src/tenant-openapi.js";

const EXPECTED = [
  "venueDiscoverCapabilities", "venueReadBinding", "venuePrepareDelegate",
  "venueActivateDelegate", "venueRevokeDelegate", "venuePrepareExecution",
  "venueSubmitExecution", "venueReadExecution"
];

test("HYPERLIQUID-002A exposes one exact Venue operation family on every transport", () => {
  const catalog = TENANT_PROTOCOL_OPERATIONS
    .map(({ operationId }) => operationId)
    .filter((operationId) => operationId.startsWith("venue"));
  assert.deepEqual(catalog, EXPECTED);
  assert.deepEqual(VENUE_EXECUTION_OPENAPI_OPERATION_IDS, EXPECTED);
  assert.deepEqual(VENUE_EXECUTION_SDK_OPERATIONS, EXPECTED);
  assert.deepEqual(VENUE_EXECUTION_OPERATION_IDS, EXPECTED);
  assert.deepEqual(VENUE_EXECUTION_MCP_TOOLS.map(({ operationId }) => operationId), EXPECTED);
});

test("HYPERLIQUID-002A OpenAPI truthfully keeps activation and submission disabled", () => {
  const document = createTenantOpenApiDocument("http://127.0.0.1:3000");
  assert.deepEqual(document["x-ipo-one-venue-operations"], EXPECTED);
  assert.equal(document["x-ipo-one-venue-delegate-activation-enabled"], false);
  assert.equal(document["x-ipo-one-venue-submission-enabled"], false);
  assert.equal(document["x-real-funds-enabled"], false);
});

test("HYPERLIQUID-002A catalog grants no public or funds authority", () => {
  const entries = TENANT_PROTOCOL_OPERATIONS.filter(({ operationId }) => operationId.startsWith("venue"));
  assert.equal(entries.length, 8);
  assert.ok(entries.every((entry) => entry.public === false && entry.fundsAuthority === false));
});
