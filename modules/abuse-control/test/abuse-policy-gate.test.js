import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const operation = "pilotActivateSandboxHumanSubject";
const root = new URL("../../../", import.meta.url);
const script = fileURLToPath(new URL("scripts/check-abuse-policy.mjs", root));
const source = JSON.parse(await readFile(new URL("schemas/v2/abuse-control-policy.schema.json", root), "utf8"));

// Exercise the actual gate's exit code, against unchanged runtime policies and
// isolated schema fixtures. Never mutate the working tree or loosen the gate.
async function checkSchema(schema) {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-abuse-policy-"));
  try {
    await mkdir(join(directory, "schemas", "v2"), { recursive: true });
    await writeFile(join(directory, "schemas", "v2", "abuse-control-policy.schema.json"), JSON.stringify(schema));
    return spawnSync(process.execPath, [script], {
      cwd: directory, encoding: "utf8", timeout: 15_000
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("abuse-policy CLI accepts the exact runtime/schema contract", async () => {
  const result = await checkSchema(source);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Abuse-control policy checks passed/);
});

for (const [name, mutate, diagnostic] of [
  ["added operation", ops => {
    ops.properties.pilotUnexpectedOperation = { const: "mutation" };
    ops.required.push("pilotUnexpectedOperation");
  }, "policy schema operation coverage drifted"],
  ["deleted operation", ops => {
    delete ops.properties[operation];
    ops.required = ops.required.filter(id => id !== operation);
  }, "policy schema operation coverage drifted"],
  ["replacement with unchanged operation count", ops => {
    ops.properties.pilotRenamedOperation = ops.properties[operation];
    delete ops.properties[operation];
    ops.required = ops.required.map(id => id === operation ? "pilotRenamedOperation" : id);
  }, "policy schema operation coverage drifted"],
  ["incorrect classification", ops => {
    ops.properties[operation].const = "read";
  }, `policy schema classification drifted: ${operation}`],
  ["operation made optional", ops => {
    ops.required = ops.required.filter(id => id !== operation);
  }, "policy schema required operation coverage drifted"],
  ["extra required operation", ops => {
    ops.required.push("pilotUnexpectedOperation");
  }, "policy schema required operation coverage drifted"],
  ["duplicate required operation", ops => {
    ops.required.push(operation);
  }, "policy schema required operation coverage drifted"],
  ["opened operation set", ops => {
    ops.additionalProperties = true;
  }, "policy schema operations must remain a closed object"]
]) {
  test(`abuse-policy CLI rejects ${name}`, async () => {
    const schema = structuredClone(source);
    mutate(schema.properties.operations);
    const result = await checkSchema(schema);
    assert.equal(result.status, 1, `${result.error ?? ""}\n${result.stderr}`);
    assert.ok(result.stderr.includes(diagnostic), result.stderr);
    assert.doesNotMatch(result.stdout, /checks passed/);
  });
}

test("abuse-policy and its drift regressions remain mandatory local/CI gates", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.ok(manifest.scripts.check.split("&&").map(value => value.trim()).includes("pnpm run check:abuse-policy"));
  const workflow = await readFile(new URL(".github/workflows/quality.yml", root), "utf8");
  const step = workflow.split("      - name: ").find(value =>
    value.startsWith("Verify abuse policy classification and drift regressions\n"));
  assert.ok(step, "CI must run the policy gate before the full quality gate");
  assert.match(step, /\n          pnpm run check:abuse-policy\n/);
  assert.match(step, /\n          node --test modules\/abuse-control\/test\/abuse-policy-gate.test.js\n/);
  assert.doesNotMatch(step, /continue-on-error|\bif:/);
  assert.match(workflow, /\n  push:\n  pull_request:\n/);
});
