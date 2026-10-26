import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkAgentMcpRegistry, schemaBinding } from "../../../scripts/check-agent-mcp-registry.mjs";

test("registry pins every family, schema and authorization and detects documentation drift", async () => {
  const inventory = await checkAgentMcpRegistry();
  assert.deepEqual(inventory.map(({ tools }) => tools.length), [15, 13, 8, 28, 2]);
  for (const target of ["docs/architecture/AGENT_MCP_INVENTORY.md", "docs/architecture/agent-mcp-registry.json", "apps/agent-mcp/README.md"]) {
    await assert.rejects(checkAgentMcpRegistry({
      async readArtifact(path) {
        const text = await readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
        return path === target ? text.replaceAll("15", "12").replaceAll("subject.read.self", "forged.capability") : text;
      }
    }), /drift|missing current main count/);
  }
  assert.equal(inventory[0].tools.every(({ authorization }) => authorization.allowedActorTypes.includes("agent")), true);
});

test("registry fingerprints referenced definitions and sibling schema constraints", () => {
  const schema = { $defs: { scope: { type: "string" } }, oneOf: [{ properties: {
    operationId: { const: "testOperation" }, subject: { $ref: "#/$defs/scope", maxLength: 64 }
  } }] };
  const fingerprint = (value) => schemaBinding(value, "testOperation", "test-schema").sha256;
  const siblingDrift = structuredClone(schema);
  siblingDrift.oneOf[0].properties.subject.maxLength = 128;
  assert.notEqual(fingerprint(schema), fingerprint(siblingDrift));
  const definitionDrift = structuredClone(schema);
  definitionDrift.$defs.scope.type = "number";
  assert.notEqual(fingerprint(schema), fingerprint(definitionDrift));
  definitionDrift.$defs.scope = false;
  assert.doesNotThrow(() => fingerprint(definitionDrift));
  assert.notEqual(fingerprint(schema), fingerprint(definitionDrift));
  delete definitionDrift.$defs.scope;
  assert.throws(() => fingerprint(definitionDrift), /Unresolved schema reference/);
});
