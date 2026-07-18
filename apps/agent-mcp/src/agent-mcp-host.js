import { assertAgentHandoffManifest } from "../../../packages/api-contract/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import { createAgentMcpAdapter } from "./agent-mcp-adapter.js";
import { createAgentMcpJsonRpcHandler, startAgentMcpStdio } from "./stdio-server.js";

const HOST_CONFIG_KEYS = new Set(["client", "manifest"]);

function assertExactHostConfig(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Object.keys(input).some((key) => !HOST_CONFIG_KEYS.has(key))
  ) {
    throw new DomainError("invalid_agent_mcp_host_config", "Agent MCP Host configuration is invalid");
  }
}

function requireSubject(subjectId, expectedSubjectId) {
  if (subjectId !== expectedSubjectId) {
    throw new DomainError(
      "mcp_subject_scope_denied",
      "The requested Agent Subject is outside this handoff"
    );
  }
}

function requireMandate(authorityId, expectedMandateId) {
  if (authorityId !== expectedMandateId) {
    throw new DomainError(
      "mcp_mandate_scope_denied",
      "The requested Agent Mandate is outside this handoff"
    );
  }
}

function manifestBoundClient(client, manifest) {
  function requireRuntimeHandoff() {
    if (manifest.status !== "ready") {
      throw new DomainError(
        "mcp_runtime_handoff_required",
        "An active runtime handoff is required for this tool"
      );
    }
  }
  return Object.freeze({
    async getSelf(input) {
      requireSubject(input.subjectId, manifest.subjectId);
      return client.getSelf(input);
    },
    async submitAccountProof(input) {
      requireSubject(input.subjectId, manifest.subjectId);
      return client.submitAccountProof(input);
    },
    async getAccountBinding(input) {
      requireSubject(input.subjectId, manifest.subjectId);
      return client.getAccountBinding(input);
    },
    async requestCredit(input) {
      requireSubject(input.subjectId, manifest.subjectId);
      requireMandate(input.payload?.authorityId, manifest.mandateId);
      if (manifest.status !== "application_ready") {
        throw new DomainError(
          "mcp_application_handoff_required",
          "A draft application handoff is required to request credit"
        );
      }
      return client.requestCredit(input);
    },
    async getCreditApplication(input) {
      return client.getCreditApplication(input);
    },
    async evaluateCreditApplication(input) {
      return client.evaluateCreditApplication(input);
    },
    async getOwnObligationEvidence(input) {
      requireRuntimeHandoff();
      return client.getOwnObligationEvidence(input);
    },
    async getOwnObligation(input) {
      requireRuntimeHandoff();
      return client.getOwnObligation(input);
    },
    async acceptCreditOffer(input) {
      requireRuntimeHandoff();
      return client.acceptCreditOffer(input);
    },
    async executeSandboxObligation(input) {
      requireRuntimeHandoff();
      return client.executeSandboxObligation(input);
    },
    async postSandboxRepayment(input) {
      requireRuntimeHandoff();
      return client.postSandboxRepayment(input);
    }
  });
}

export function createAgentMcpHost(input) {
  assertExactHostConfig(input);
  const { client, manifest } = input;
  if (
    !client ||
    ![
      "getSelf",
      "requestCredit",
      "getCreditApplication",
      "evaluateCreditApplication",
      "submitAccountProof",
      "getAccountBinding",
      "getOwnObligation",
      "getOwnObligationEvidence",
      "acceptCreditOffer",
      "executeSandboxObligation",
      "postSandboxRepayment"
    ]
      .every((method) => typeof client[method] === "function")
  ) {
    throw new DomainError("invalid_agent_mcp_host_config", "Agent MCP Host client is invalid");
  }
  assertAgentHandoffManifest(manifest);
  if (!new Set(["application_ready", "ready"]).has(manifest.status)) {
    throw new DomainError(
      "agent_handoff_not_ready",
      "Agent MCP Host requires an application-ready or runtime-ready handoff"
    );
  }
  const adapter = createAgentMcpAdapter({ client: manifestBoundClient(client, manifest) });
  const handle = createAgentMcpJsonRpcHandler({ adapter });
  return Object.freeze({
    handle,
    startStdio({ input: stdioInput = process.stdin, output: stdioOutput = process.stdout } = {}) {
      return startAgentMcpStdio({ adapter, input: stdioInput, output: stdioOutput });
    }
  });
}
