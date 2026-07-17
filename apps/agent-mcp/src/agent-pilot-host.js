import {
  ActorType,
  assertAuthenticationContext
} from "../../../modules/authentication/src/index.js";
import { AgentTenantCommandClient } from "../../../modules/tenant-command-gateway/src/index.js";
import { assertAgentHandoffManifest } from "../../../packages/api-contract/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import { createAgentMcpHost } from "./agent-mcp-host.js";

const CONFIG_KEYS = new Set([
  "authenticateAgent",
  "createNetworkContext",
  "gateway",
  "manifest",
  "verifyAgentSubjectBinding"
]);

function assertClosedConfig(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new DomainError(
      "invalid_agent_pilot_host_config",
      "Agent pilot Host configuration is invalid"
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set) ||
    Object.keys(descriptors).some((key) => !CONFIG_KEYS.has(key))
  ) {
    throw new DomainError(
      "invalid_agent_pilot_host_config",
      "Agent pilot Host configuration is invalid"
    );
  }
}

export function createAgentPilotHost(input) {
  assertClosedConfig(input);
  const {
    authenticateAgent,
    createNetworkContext,
    gateway,
    manifest,
    verifyAgentSubjectBinding
  } = input;
  if (
    typeof authenticateAgent !== "function" ||
    typeof createNetworkContext !== "function" ||
    typeof gateway?.execute !== "function" ||
    typeof verifyAgentSubjectBinding !== "function"
  ) {
    throw new DomainError(
      "invalid_agent_pilot_host_config",
      "Agent pilot Host adapters are required"
    );
  }
  assertAgentHandoffManifest(manifest);

  const client = new AgentTenantCommandClient({
    gateway,
    async authenticationContextProvider() {
      const context = assertAuthenticationContext(await authenticateAgent());
      if (
        context.actorType !== ActorType.AGENT ||
        await verifyAgentSubjectBinding({
          authenticationContext: context,
          subjectId: manifest.subjectId
        }) !== true
      ) {
        throw new DomainError(
          "agent_pilot_host_identity_mismatch",
          "Authenticated Agent is not bound to the handoff Subject"
        );
      }
      return context;
    },
    async networkContextProvider() {
      return createNetworkContext();
    }
  });

  return createAgentMcpHost({ client, manifest });
}
