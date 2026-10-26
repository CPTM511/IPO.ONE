import assert from "node:assert/strict";
import test from "node:test";
import { runFoundryStages } from "../../../scripts/run-foundry-tests.mjs";

test("Foundry gate propagates the failing child status and never runs later stages", () => {
  const seen = [];
  const status = runFoundryStages({ executable: "reviewed-forge", run(binary, args) {
    assert.equal(binary, "reviewed-forge");
    seen.push(args[0]);
    return { status: args[0] === "build" ? 17 : 0 };
  } });
  assert.equal(status, 17);
  assert.deepEqual(seen, ["fmt", "build"]);
});

test("Foundry gate fails closed on a killed or unlaunchable child", () => {
  assert.equal(runFoundryStages({ executable: "reviewed-forge", run: () => ({ status: null, signal: "SIGTERM" }) }), 1);
  assert.throws(() => runFoundryStages({ executable: "reviewed-forge", run: () => ({ error: new Error("launch failed") }) }), /launch failed/);
});
