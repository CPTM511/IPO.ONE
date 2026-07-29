import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";
import { createAgentPilotHost } from "../../agent-mcp/src/index.js";
import {
  createAgentSubjectBindingVerifier,
  createPrivatePilotDurableAgentGateway
} from "./private-pilot-runtime.js";
import {
  loadLocalAgentKeyMaterial
} from "./local-authentication-material.js";
import {
  createLocalAgentProof
} from "./local-durable-agent-authentication.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_AGENT_KEY_FILE = resolve(
  MODULE_DIRECTORY,
  "../../../.ipo-one/local-stack/agent-key.v1.json"
);

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
  const agentKey = await loadLocalAgentKeyMaterial(
    process.env.IPO_ONE_LOCAL_AGENT_KEY_FILE || DEFAULT_AGENT_KEY_FILE
  );
  runtime = await createPrivatePilotDurableAgentGateway(databaseUrl);
  const agentIdentity = runtime.authentication.identities.agent;
  const host = createAgentPilotHost({
    gateway: runtime.gateway,
    manifest,
    authenticateAgent: async () => runtime.agentAuthenticator.authenticate({
      proof: await createLocalAgentProof({
        keyMaterial: agentKey,
        tenantId: runtime.authentication.profile.tenantId,
        clientId: agentIdentity.clientId,
        policyVersion: agentIdentity.createContext().policyVersion,
        audience: runtime.audience
      })
    }),
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
  await Promise.allSettled([
    runtime?.pool.end(),
    runtime?.authenticationPool.end()
  ]);
}
