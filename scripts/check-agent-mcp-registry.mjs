import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AGENT_MCP_TOOLS } from "../apps/agent-mcp/src/agent-mcp-adapter.js";
import { WALLET_EXECUTION_MCP_TOOLS } from "../apps/agent-mcp/src/wallet-execution-mcp-adapter.js";
import { VENUE_EXECUTION_MCP_TOOLS } from "../apps/agent-mcp/src/venue-execution-mcp-adapter.js";
import { TRADING_CAPITAL_MCP_TOOLS } from "../apps/agent-mcp/src/trading-capital-mcp-adapter.js";
import { SECURED_POOL_MCP_TOOLS } from "../apps/agent-mcp/src/secured-pool-mcp-adapter.js";
import { AGENT_MCP_CLIENT_TOOLS } from "../packages/sdk/src/agent-mcp-client.js";
import { TENANT_OPERATION_POLICIES } from "../modules/authorization/src/authorization-policy.js";
import catalog from "../api/tenant-protocol/ipo-one.tenant-protocol.v1.json" with { type: "json" };
import requests from "../schemas/v2/tenant-protocol-request.schema.json" with { type: "json" };
import results from "../schemas/v2/tenant-protocol-result.schema.json" with { type: "json" };

const root = new URL("../", import.meta.url);
const inventoryPath = "docs/architecture/agent-mcp-registry.json";
const documentPath = "docs/architecture/AGENT_MCP_INVENTORY.md";
const families = [
  ["agent", "agent-mcp-adapter.js", AGENT_MCP_TOOLS],
  ["wallet-execution", "wallet-execution-mcp-adapter.js", WALLET_EXECUTION_MCP_TOOLS],
  ["venue-execution", "venue-execution-mcp-adapter.js", VENUE_EXECUTION_MCP_TOOLS],
  ["trading-capital", "trading-capital-mcp-adapter.js", TRADING_CAPITAL_MCP_TOOLS],
  ["secured-pool", "secured-pool-mcp-adapter.js", SECURED_POOL_MCP_TOOLS]
];
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function materialize(value, schema) {
  if (Array.isArray(value)) return value.map((item) => materialize(item, schema));
  if (!value || typeof value !== "object") return value;
  if (value.$ref?.startsWith("#/$defs/")) {
    const name = value.$ref.slice(8);
    assert(Object.hasOwn(schema.$defs ?? {}, name), `Unresolved schema reference ${value.$ref}`);
    const definition = schema.$defs[name];
    // Keep the reference and every sibling constraint in the fingerprint.
    // JSON Schema 2020-12 permits constraints alongside $ref.
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      key === "$ref" ? { reference: item, definition: materialize(definition, schema) }
        : materialize(item, schema)
    ]));
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item, schema)]));
}
export function schemaBinding(schema, operationId, path) {
  const index = schema.oneOf.findIndex((branch) => branch.properties?.operationId?.const === operationId);
  assert.notEqual(index, -1, `${operationId} lacks ${path}`);
  return { source: `${path}#/oneOf/${index}`, sha256: hash(materialize(schema.oneOf[index], schema)) };
}
export async function buildAgentMcpInventory() {
  const files = (await readdir(new URL("apps/agent-mcp/src/", root)))
    .filter((file) => file.endsWith("-mcp-adapter.js")).sort();
  assert.deepEqual(files, families.map(([, file]) => file).sort(), "Uninventoried MCP adapter family");
  assert.equal(AGENT_MCP_TOOLS.length, 15, "Main Host scope requires explicit review");
  assert.deepEqual(AGENT_MCP_TOOLS.map(({ name, operationId }) => ({ name, operationId })), AGENT_MCP_CLIENT_TOOLS);
  const names = new Set();
  return families.map(([family, file, tools]) => ({
    family,
    exposure: family === "agent" ? "existing_local_stdio_host" : "separate_adapter_not_mounted_by_main_host",
    tools: tools.map(({ name, operationId, inputSchema }) => {
      assert(!names.has(name), `Duplicate MCP tool ${name}`);
      names.add(name);
      const operation = catalog.operations.find((item) => item.operationId === operationId);
      const authorization = TENANT_OPERATION_POLICIES.find((item) => item.operationId === operationId);
      assert(operation && authorization, `Missing canonical operation/policy for ${name}`);
      assert.equal(operation.requiredCapability, authorization.requiredCapability);
      assert.equal(operation.resourceType, authorization.resourceType);
      // The protocol can be stricter than a legacy policy (query: prohibited
      // versus optional). Pin both instead of silently rewriting authority.
      assert.equal(inputSchema.additionalProperties, false, `Open arguments for ${name}`);
      return {
        name, operationId,
        inputSchema: { source: `apps/agent-mcp/src/${file}#${name}`, sha256: hash(inputSchema) },
        requestSchema: schemaBinding(requests, operationId, "schemas/v2/tenant-protocol-request.schema.json"),
        resultSchema: schemaBinding(results, operationId, "schemas/v2/tenant-protocol-result.schema.json"),
        operation,
        authorization
      };
    })
  }));
}
export function renderAgentMcpInventory(inventory) {
  const lines = [
    "# Existing MCP tool, protocol and authorization inventory", "",
    "Generated from existing adapters, Tenant protocol schemas/catalog and authorization policy.",
    "This is a drift snapshot, not an authority registry or a new tool surface.",
    "Full schema references and SHA-256 bindings, operation metadata and authorization",
    "fields are in [agent-mcp-registry.json](agent-mcp-registry.json).", "",
    "Only the 15 main Agent tools belong to the existing local stdio Host. Other families",
    "are enumerated separately; their existence grants no activation or remote exposure.",
    "AuthenticationContext is created by the Host; all tool arguments (including Subject",
    "and authority references) are untrusted. AgentTenantCommandClient validates the",
    "canonical envelope and injects context. Gateway admission, current credential/",
    "membership/object checks, exact command hash, commit-time revalidation, atomic",
    "audit and durable idempotency remain authoritative. Runtime Offer acceptance pins",
    "the current Offer/terms/acknowledgement hashes in the existing domain handlers.", "",
    "Schema bindings resolve local definitions before hashing. Tool schemas are discovery",
    "contracts; canonical request/result schemas and domain authorization remain mandatory.",
    "Regenerate intentionally with `node scripts/check-agent-mcp-registry.mjs --write`;",
    "review all policy/schema changes before accepting a regenerated snapshot.", ""
  ];
  for (const family of inventory) {
    lines.push(`## ${family.family} — ${family.tools.length} tools`, "",
      "| Tool → operation | Result schema | Capability / resource | Ownership / actors | Protocol / policy idempotency; live checks |",
      "| --- | --- | --- | --- | --- |");
    for (const tool of family.tools) {
      const a = tool.authorization;
      lines.push(`| \`${tool.name}\` → \`${tool.operationId}\` | ${tool.operation.responseSchemaVersion} | ${a.requiredCapability} / ${a.resourceType} | ${a.ownershipRule} / ${a.allowedActorTypes.join(", ")} | ${tool.operation.idempotency} / ${a.idempotencyRequirement}; ${a.liveChecks.join(", ") || "none in policy; domain checks still apply"} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
export async function checkAgentMcpRegistry({
  write = false,
  readArtifact = (path) => readFile(new URL(path, root), "utf8")
} = {}) {
  const inventory = await buildAgentMcpInventory();
  const outputs = [[inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`], [documentPath, renderAgentMcpInventory(inventory)]];
  for (const [path, expected] of outputs) {
    if (write) await writeFile(new URL(path, root), expected);
    else assert.equal(await readArtifact(path), expected, `${path} drift`);
  }
  for (const path of ["apps/agent-mcp/README.md", "docs/architecture/ADR-031-authenticated-transport-adapters.md"]) {
    const text = await readArtifact(path);
    assert.match(text, /15 main Agent tools/, `${path}: missing current main count`);
    assert.match(text, /AGENT_MCP_INVENTORY\.md/, `${path}: missing complete inventory link`);
    assert.doesNotMatch(text, /(?:twelve|12) tool\/operation pairs/i, `${path}: obsolete count`);
    if (path === "apps/agent-mcp/README.md") {
      const block = text.match(/The closed tool list is:\n\n([\s\S]*?)\n\n/)?.[1] ?? "";
      const names = [...block.matchAll(/^- `([^`]+)`[;.]/gm)].map((match) => match[1]);
      assert.deepEqual(names, AGENT_MCP_TOOLS.map(({ name }) => name), `${path}: tool list drift`);
    }
  }
  return inventory;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inventory = await checkAgentMcpRegistry({ write: process.argv.includes("--write") });
  console.log(`MCP registry verified: ${inventory.map(({ family, tools }) => `${family}=${tools.length}`).join(", ")}`);
}
