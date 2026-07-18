import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";
import { createAgentPilotHost } from "../../agent-mcp/src/index.js";
import { createAgentSubjectBindingVerifier, createPrivatePilotGateway } from "./private-pilot-runtime.js";

const cliArguments = process.argv.slice(2);
const manifestPath = (cliArguments[0] === "--" ? cliArguments[1] : cliArguments[0]) ||
  process.env.IPO_ONE_AGENT_HANDOFF_FILE;
const databaseUrl = process.env.DATABASE_URL;

if (!manifestPath || cliArguments.length > (cliArguments[0] === "--" ? 2 : 1)) {
  process.stderr.write("Usage: pnpm run pilot:agent -- <agent-handoff.json>\n");
  process.exit(1);
}

let runtime;
try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  runtime = await createPrivatePilotGateway(databaseUrl);
  const agentIdentity = runtime.authentication.identities.agent;
  const host = createAgentPilotHost({
    gateway: runtime.gateway,
    manifest,
    authenticateAgent: async () => agentIdentity.createContext(),
    verifyAgentSubjectBinding: createAgentSubjectBindingVerifier(runtime.pool),
    createNetworkContext: async () => createTrustedNetworkContext({
      networkRefHash: hashId("private_pilot_network", "local_mcp_stdio"),
      source: "local_test"
    })
  });
  const running = host.startStdio();
  await once(process.stdin, "end");
  await running.close();
} catch (error) {
  process.stderr.write(`Agent MCP failed: ${error?.code ?? "startup_failed"}\n`);
  process.exitCode = 1;
} finally {
  await runtime?.pool.end();
}
