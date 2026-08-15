import { DomainError } from "../../../packages/domain/src/index.js";
import {
  IpoOneAgentSdkError,
  runAgentCreditOfferWorkflow as runSdkAgentCreditOfferWorkflow
} from "../../../packages/sdk/src/agent-mcp-client.js";

const WORKFLOW_CONFIG_KEYS = Object.freeze([
  "host",
  "manifest",
  "creditRequest",
  "workflowId"
]);

function hasExactDataKeys(value, expected) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) return false;
  const actual = Object.keys(descriptors).sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
}

function invalidWorkflow() {
  throw new DomainError(
    "invalid_agent_credit_workflow",
    "Agent credit workflow input is invalid"
  );
}

export async function runAgentCreditOfferWorkflow(input) {
  if (!hasExactDataKeys(input, WORKFLOW_CONFIG_KEYS)) invalidWorkflow();
  if (!input.host || typeof input.host.handle !== "function") invalidWorkflow();
  try {
    return await runSdkAgentCreditOfferWorkflow({
      handle: input.host.handle,
      manifest: input.manifest,
      transportProfile: "mcp_stdio_local",
      creditRequest: input.creditRequest,
      workflowId: input.workflowId
    });
  } catch (error) {
    if (error instanceof IpoOneAgentSdkError) {
      throw new DomainError(error.code, error.message);
    }
    throw new DomainError(
      "agent_credit_workflow_mcp_failed",
      "Agent credit workflow MCP step failed"
    );
  }
}
