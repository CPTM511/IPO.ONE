import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AGENT_PILOT_MCP_TOOLS as CONTRACT_TOOLS,
  createAgentPilotCapabilityManifest as createContractManifest,
  isAgentPilotCapabilityManifest
} from "../../../packages/api-contract/src/index.js";
import { AGENT_MCP_TOOLS } from "../../agent-mcp/src/index.js";
import {
  AGENT_PILOT_MCP_TOOLS,
  createAgentPilotCapabilityManifest
} from "../src/agent-pilot-capability-manifest.js";

const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-pilot-capability-manifest.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));

test("browser and contract builders emit byte-equivalent capability manifests", () => {
  for (const fixture of fixtures.valid) {
    const browserManifest = createAgentPilotCapabilityManifest(fixture.handoff);
    const contractManifest = createContractManifest(fixture.handoff);
    assert.equal(JSON.stringify(browserManifest), JSON.stringify(contractManifest));
    assert.equal(isAgentPilotCapabilityManifest(browserManifest), true);
    assert.equal(Object.isFrozen(browserManifest.workflows), true);
  }
});

test("browser capability registry stays exact with MCP and API contracts", () => {
  const approved = AGENT_MCP_TOOLS.map(({ name, operationId }) => ({ name, operationId }));
  assert.deepEqual(AGENT_PILOT_MCP_TOOLS, approved);
  assert.deepEqual(CONTRACT_TOOLS, approved);
});
