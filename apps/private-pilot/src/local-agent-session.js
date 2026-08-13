import { resolve } from "node:path";
import {
  ActorType,
  assertAuthenticationContext
} from "../../../modules/authentication/src/index.js";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
import { AgentTenantCommandClient } from "../../../modules/tenant-command-gateway/src/index.js";
import { createAgentMcpHost } from "../../agent-mcp/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { loadLocalAgentKeyMaterial } from "./local-authentication-material.js";
import { createLocalAgentProof } from "./local-durable-agent-authentication.js";
import {
  createAgentSubjectBindingVerifier,
  createPrivatePilotDurableAgentGateway
} from "./private-pilot-runtime.js";

const DEFAULT_AGENT_KEY_FILE = resolve(
  process.cwd(),
  ".ipo-one/local-stack/agent-key.v1.json"
);

function assertManifestSubject(context, manifest, verifyAgentSubjectBinding) {
  if (context.actorType !== ActorType.AGENT) {
    throw new DomainError(
      "local_agent_session_identity_mismatch",
      "Authenticated Actor is not an Agent"
    );
  }
  return verifyAgentSubjectBinding({
    authenticationContext: context,
    subjectId: manifest.subjectId
  });
}

export async function createDurableLocalAgentSession({
  databaseUrl,
  manifest,
  agentKeyFile =
    process.env.IPO_ONE_LOCAL_AGENT_KEY_FILE || DEFAULT_AGENT_KEY_FILE,
  networkSource = "local_reference_agent"
}) {
  const basePort = process.env.IPO_ONE_PILOT_PORT === undefined
    ? 8787
    : Number(process.env.IPO_ONE_PILOT_PORT);
  const agentKey = await loadLocalAgentKeyMaterial(agentKeyFile);
  const runtime = await createPrivatePilotDurableAgentGateway(databaseUrl, {
    basePort
  });
  const agentIdentity = runtime.authentication.identities.agent;
  const verifyAgentSubjectBinding =
    createAgentSubjectBindingVerifier(runtime.pool);

  async function authenticationContextProvider() {
    const context = assertAuthenticationContext(
      await runtime.agentAuthenticator.authenticate({
        proof: await createLocalAgentProof({
          keyMaterial: agentKey,
          tenantId: runtime.authentication.profile.tenantId,
          clientId: agentIdentity.clientId,
          policyVersion: agentIdentity.createContext().policyVersion,
          audience: runtime.audience
        })
      })
    );
    if (
      await assertManifestSubject(
        context,
        manifest,
        verifyAgentSubjectBinding
      ) !== true
    ) {
      throw new DomainError(
        "local_agent_session_identity_mismatch",
        "Authenticated Agent is not bound to the handoff Subject"
      );
    }
    return context;
  }

  const client = new AgentTenantCommandClient({
    gateway: runtime.gateway,
    authenticationContextProvider,
    async networkContextProvider() {
      return createTrustedNetworkContext({
        networkRefHash: hashId(
          "private_pilot_network",
          networkSource
        ),
        source: "local_test"
      });
    }
  });
  const host = createAgentMcpHost({ client, manifest });

  return Object.freeze({
    client,
    host,
    async close() {
      await Promise.allSettled([
        runtime.pool.end(),
        runtime.authenticationPool.end()
      ]);
    }
  });
}
