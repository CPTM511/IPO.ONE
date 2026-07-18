import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AGENT_MCP_TOOLS } from "../../agent-mcp/src/index.js";
import {
  assertAgentHandoffManifest,
  isAgentHandoffManifest
} from "../../../packages/api-contract/src/index.js";
import {
  AGENT_HANDOFF_TOOLS,
  createApplicationReadyAgentHandoffManifest,
  createAwaitingAgentHandoffManifest,
  createReadyAgentHandoffManifest
} from "../src/agent-handoff-manifest.js";

const fixtures = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json", import.meta.url),
  "utf8"
));

const mandate = Object.freeze({
  status: "active",
  sandboxOnly: true,
  productionAuthority: false,
  subjectId: "subject_agent_handoff_001",
  mandateId: "mandate_handoff_001",
  mandateHash: `0x${"a".repeat(64)}`,
  termsHash: `0x${"b".repeat(64)}`,
  capabilities: ["request_credit", "accept_credit_offer", "execute_sandbox_credit"],
  assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
  perActionLimitMinor: "25000",
  aggregateLimitMinor: "100000",
  expiresAt: "2027-07-15T00:00:00.000Z"
});

test("Agent handoff manifest fixtures enforce the closed non-authorizing contract", () => {
  for (const fixture of fixtures.valid) assert.equal(isAgentHandoffManifest(fixture), true);
  for (const fixture of fixtures.invalid) assert.equal(isAgentHandoffManifest(fixture), false);
  assert.throws(
    () => assertAgentHandoffManifest(fixtures.invalid[0]),
    (error) => error.code === "invalid_agent_handoff_manifest" && Object.keys(error.details).length === 0
  );
});

test("browser handoff tool pairs stay exact with the approved Agent MCP registry", () => {
  assert.deepEqual(
    AGENT_HANDOFF_TOOLS,
    AGENT_MCP_TOOLS.map(({ name, operationId }) => ({ name, operationId }))
  );
});

test("ready handoff is schema-valid, immutable, and contains no credential authority", () => {
  const manifest = createReadyAgentHandoffManifest(mandate);
  assert.equal(isAgentHandoffManifest(manifest), true);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.protocol.tools), true);
  assert.equal(manifest.status, "ready");
  assert.equal(manifest.nonAuthorizing, true);
  assert.equal(manifest.credentialsIncluded, false);
  assert.equal(manifest.publicEndpointEnabled, false);
  assert.equal(manifest.remoteMcpEnabled, false);
  assert.equal(manifest.fundsAuthority, false);
  assert.equal(Object.hasOwn(manifest, "tenantId"), false);
  assert.equal(Object.hasOwn(manifest, "roles"), false);
});

test("application handoff is schema-valid, immutable, and bound to one draft Mandate", () => {
  const manifest = createApplicationReadyAgentHandoffManifest({ ...mandate, status: "draft" });
  assert.equal(isAgentHandoffManifest(manifest), true);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.authority), true);
  assert.equal(manifest.status, "application_ready");
  assert.equal(manifest.authority.status, "draft");
  assert.equal(manifest.subjectId, mandate.subjectId);
  assert.equal(manifest.mandateId, mandate.mandateId);
  assert.equal(manifest.nonAuthorizing, true);
  assert.equal(manifest.fundsAuthority, false);
  assert.equal(createApplicationReadyAgentHandoffManifest(mandate), null);
});

test("handoff fails closed until the exact active sandbox Mandate is eligible", () => {
  assert.equal(isAgentHandoffManifest(createAwaitingAgentHandoffManifest()), true);
  assert.equal(createApplicationReadyAgentHandoffManifest({ ...mandate, status: "active" }), null);
  assert.equal(createReadyAgentHandoffManifest({ ...mandate, status: "draft" }), null);
  assert.equal(createReadyAgentHandoffManifest({ ...mandate, sandboxOnly: false }), null);
  assert.equal(createReadyAgentHandoffManifest({ ...mandate, productionAuthority: true }), null);
  assert.equal(createReadyAgentHandoffManifest({ ...mandate, mandateHash: "invalid" }), null);
  assert.equal(createReadyAgentHandoffManifest({ ...mandate, capabilities: ["admin"] }), null);
});
