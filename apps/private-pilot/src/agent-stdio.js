import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createDurableLocalAgentSession } from "./local-agent-session.js";

const cliArguments = process.argv.slice(2);
const manifestPath = (cliArguments[0] === "--" ? cliArguments[1] : cliArguments[0]) ||
  process.env.IPO_ONE_AGENT_HANDOFF_FILE;
const databaseUrl = process.env.DATABASE_URL;

if (!manifestPath || cliArguments.length > (cliArguments[0] === "--" ? 2 : 1)) {
  process.stderr.write("Usage: pnpm run pilot:agent -- <agent-handoff.json>\n");
  process.exit(1);
}

let session;
try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  session = await createDurableLocalAgentSession({
    databaseUrl,
    manifest,
    networkSource: "local_mcp_stdio"
  });
  const running = session.host.startStdio();
  await once(process.stdin, "end");
  await running.close();
} catch (error) {
  process.stderr.write(`Agent MCP failed: ${error?.code ?? "startup_failed"}\n`);
  process.exitCode = 1;
} finally {
  await session?.close();
}
