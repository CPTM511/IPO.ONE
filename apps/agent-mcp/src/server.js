import { pathToFileURL } from "node:url";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stderr.write(
    "agent_mcp_composition_required: inject one verified Agent Authentication Context through AgentTenantCommandClient\n"
  );
  process.exitCode = 78;
}
