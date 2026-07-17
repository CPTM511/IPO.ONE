import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AGENT_PILOT_MCP_TOOLS,
  assertAgentPilotCapabilityManifest,
  createAgentPilotCapabilityManifest,
  isAgentPilotCapabilityManifest
} from "../src/index.js";

const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-pilot-capability-manifest.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));

function applyFixtureMutation(source, mutation) {
  const result = structuredClone(source);
  let target = result;
  for (const segment of mutation.path.slice(0, -1)) target = target[segment];
  target[mutation.path.at(-1)] = mutation.value;
  return result;
}

function isDeeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

test("Agent pilot capability fixtures bind one closed three-workflow contract", () => {
  for (const manifest of fixtures.valid) {
    assert.equal(isAgentPilotCapabilityManifest(manifest), true);
    assert.deepEqual(createAgentPilotCapabilityManifest(manifest.handoff), manifest);
  }
  const valid = fixtures.valid[0];
  for (const mutation of fixtures.invalidMutations) {
    assert.equal(
      isAgentPilotCapabilityManifest(applyFixtureMutation(valid, mutation)),
      false,
      mutation.name
    );
  }
  assert.throws(
    () => assertAgentPilotCapabilityManifest(
      applyFixtureMutation(valid, fixtures.invalidMutations[0])
    ),
    (error) => (
      error.code === "invalid_agent_pilot_capability_manifest" &&
      Object.keys(error.details).length === 0 &&
      !error.message.includes("instancePath")
    )
  );
});

test("capability manifest derives staged availability without granting authority", () => {
  const [waiting, applicationReady, runtimeReady] = fixtures.valid;
  assert.deepEqual(
    [waiting.status, applicationReady.status, runtimeReady.status],
    ["waiting", "application_ready", "runtime_ready"]
  );
  assert.deepEqual(
    waiting.workflows.map(({ availability }) => availability),
    ["locked", "locked", "input_required"]
  );
  assert.deepEqual(
    applicationReady.workflows.map(({ availability }) => availability),
    ["enabled", "locked", "input_required"]
  );
  assert.deepEqual(
    runtimeReady.workflows.map(({ availability }) => availability),
    ["locked", "enabled", "input_required"]
  );
  assert.equal(runtimeReady.mcp.toolCount, 11);
  assert.deepEqual(runtimeReady.mcp.tools, AGENT_PILOT_MCP_TOOLS);
  assert.equal(runtimeReady.mcp.economicLifecycleToolsIncluded, true);
  for (const safety of [
    "productionFundsApproved",
    "productionFundsMoved",
    "withdrawable",
    "fundsAuthority",
    "credentialsIncluded",
    "publicEndpointEnabled",
    "remoteMcpEnabled",
    "liveChainExecution"
  ]) {
    assert.equal(runtimeReady[safety], false, safety);
  }
  assert.equal(runtimeReady.economicMcpToolsEnabled, true);
  assert.equal(isDeeplyFrozen(createAgentPilotCapabilityManifest(runtimeReady.handoff)), true);
});

test("capability manifest builder rejects accessors, symbols, and extra authority", () => {
  const getterInput = structuredClone(fixtures.valid[0].handoff);
  Object.defineProperty(getterInput, "tenantId", {
    enumerable: true,
    get() { throw new Error("must not execute"); }
  });
  assert.throws(
    () => createAgentPilotCapabilityManifest(getterInput),
    (error) => error.code === "invalid_agent_pilot_capability_manifest"
  );

  const symbolInput = structuredClone(fixtures.valid[0].handoff);
  symbolInput[Symbol("authority")] = "prohibited";
  assert.throws(
    () => createAgentPilotCapabilityManifest(symbolInput),
    (error) => error.code === "invalid_agent_pilot_capability_manifest"
  );

  assert.throws(
    () => createAgentPilotCapabilityManifest({
      ...fixtures.valid[0].handoff,
      accessToken: "prohibited"
    }),
    (error) => error.code === "invalid_agent_pilot_capability_manifest"
  );
});
