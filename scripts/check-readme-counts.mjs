import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_MCP_TOOLS } from "../apps/agent-mcp/src/agent-mcp-adapter.js";
import { readMigrationSet } from "./migrate.mjs";

async function countSchemaContracts(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += await countSchemaContracts(entryPath);
    } else if (entry.isFile() && entry.name.endsWith(".schema.json")) {
      count += 1;
    }
  }
  return count;
}

const [readme, tenantCatalog, migrations, schemaCount] = await Promise.all([
  readFile("README.md", "utf8"),
  readFile("api/tenant-protocol/ipo-one.tenant-protocol.v1.json", "utf8").then(JSON.parse),
  readMigrationSet(),
  countSchemaContracts("schemas/v2")
]);

const counts = {
  coreAgentMcpTools: AGENT_MCP_TOOLS.length,
  tenantOperations: tenantCatalog.operations.length,
  schemas: schemaCount,
  migrations: migrations.length
};

assert.match(
  readme,
  new RegExp(`\\b${counts.coreAgentMcpTools} core MCP tools\\b`),
  "README Agent MCP tool count drifted"
);
assert.match(
  readme,
  new RegExp(`\\[${counts.tenantOperations}-operation Tenant catalog\\]`),
  "README Tenant operation count drifted"
);
assert.match(
  readme,
  new RegExp(`\\[${counts.schemas} JSON Schemas\\]`),
  "README schema count drifted"
);
assert.match(
  readme,
  new RegExp(`\\[${counts.migrations} reversible migrations\\]`),
  "README migration count drifted"
);

console.log(
  `README counts match executable sources: ${counts.coreAgentMcpTools} core Agent MCP tools, ` +
    `${counts.tenantOperations} Tenant operations, ${counts.schemas} schemas, ` +
    `${counts.migrations} migrations.`
);
