import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wrapper = await readFile(
  new URL(
    "../../../scripts/local-agent-reference-acceptance.mjs",
    import.meta.url
  ),
  "utf8"
);

test("M1-B exact Agent wrapper passes candidate scope into the run container", () => {
  assert.match(wrapper, /"--env",\s*`IPO_ONE_M1_B_RELEASE_SHA=\$\{releaseSha\}`/);
  assert.match(wrapper, /"--env",\s*`IPO_ONE_M1_B_ACCEPTANCE_PHASE=\$\{acceptancePhase\}`/);
  assert.match(wrapper, /"--env",\s*`IPO_ONE_PILOT_PORT=\$\{localReviewPorts\.basePort\}`/);
  assert.match(wrapper, /assertExactLocalReleaseSource/);
  assert.match(wrapper, /prepareLocalReleaseBuildContext/);
  assert.match(wrapper, /org\.opencontainers\.image\.revision/);
});

test("M1-B exact Agent wrapper binds both restart phases to one lifecycle", () => {
  assert.match(wrapper, /before-restart\.acceptance\.json/);
  assert.match(wrapper, /acceptancePhase\.replace\("_", "-"\)/);
  for (const name of [
    "subjectId",
    "mandateId",
    "creditIntentId",
    "creditOfferId",
    "obligationId",
    "facilityId",
    "creditLineId",
    "accountHash",
    "candidateMarker"
  ]) {
    assert.match(wrapper, new RegExp(`"${name}"`));
  }
  assert.match(wrapper, /afterDatabaseStartedAt <= beforeDatabaseStartedAt/);
});

test("M1-B exact Agent wrapper separates MCP execution from recovery", () => {
  assert.match(wrapper, /local_agent_mcp_transport_receipt\.v1/);
  assert.match(wrapper, /receipt\.transportProfile === "mcp_stdio_local"/);
  assert.match(wrapper, /mcpReceipt !== undefined/);
  assert.match(wrapper, /canonicalLifecycleReadOnly !== true/);
  assert.match(wrapper, /lifecycleMutationPerformed !== false/);
  assert.match(wrapper, /Object\.hasOwn\(acceptance, "lifecycle"\)/);
  assert.match(wrapper, /recovery-receipt/);
  assert.match(wrapper, /canonical-recovery/);
});

test("M1-B Agent artifacts are atomically replaced with private permissions", () => {
  assert.match(wrapper, /flag: "wx", mode: 0o600/);
  assert.match(wrapper, /await rename\(temporaryPath, path\)/);
  assert.match(wrapper, /await chmod\(path, 0o600\)/);
  assert.match(wrapper, /await chmod\(OUTPUT_DIRECTORY, 0o700\)/);
});
