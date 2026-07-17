import Ajv2020 from "ajv/dist/2020.js";
import { DomainError } from "../../domain/src/index.js";
import handoffSchema from "../../../schemas/v2/agent-handoff-manifest.schema.json" with { type: "json" };
import capabilityManifestSchema from "../../../schemas/v2/agent-pilot-capability-manifest.schema.json" with { type: "json" };
import { assertAgentHandoffManifest } from "./agent-handoff-manifest.js";

export const AGENT_PILOT_CAPABILITY_MANIFEST_SCHEMA_VERSION =
  "agent_pilot_capability_manifest.v1";

export const AGENT_PILOT_MCP_TOOLS = Object.freeze([
  Object.freeze({ name: "ipo_one_read_self", operationId: "pilotReadAgentSelf" }),
  Object.freeze({ name: "ipo_one_request_credit", operationId: "pilotRequestCredit" }),
  Object.freeze({
    name: "ipo_one_read_credit_application",
    operationId: "pilotReadCreditApplication"
  }),
  Object.freeze({
    name: "ipo_one_evaluate_credit_application",
    operationId: "pilotEvaluateCreditApplication"
  }),
  Object.freeze({
    name: "ipo_one_submit_account_proof",
    operationId: "pilotSubmitAgentAccountProof"
  }),
  Object.freeze({
    name: "ipo_one_read_account_binding",
    operationId: "pilotReadAgentAccountBinding"
  }),
  Object.freeze({
    name: "ipo_one_read_obligation",
    operationId: "pilotReadOwnObligation"
  }),
  Object.freeze({
    name: "ipo_one_read_obligation_evidence",
    operationId: "pilotReadOwnObligationEvidence"
  }),
  Object.freeze({
    name: "ipo_one_accept_credit_offer",
    operationId: "pilotAcceptCreditOffer"
  }),
  Object.freeze({
    name: "ipo_one_execute_sandbox_obligation",
    operationId: "pilotExecuteSandboxObligation"
  }),
  Object.freeze({
    name: "ipo_one_post_sandbox_repayment",
    operationId: "pilotPostSandboxRepayment"
  })
]);

const REQUIRED_RUNTIME_CAPABILITIES = Object.freeze([
  "accept_credit_offer",
  "execute_sandbox_credit",
  "route_repayment"
]);

const ajv = new Ajv2020({
  allErrors: false,
  allowUnionTypes: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: true,
  strictRequired: false,
  useDefaults: false,
  validateFormats: true
});
ajv.addFormat("date-time", {
  type: "string",
  validate: (value) => (
    /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
    Number.isFinite(new Date(value).getTime())
  )
});
ajv.addSchema(handoffSchema);
const validateManifest = ajv.compile(capabilityManifestSchema);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function isClosedDataGraph(value, seen = new WeakSet()) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (typeof value !== "object" || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) delete descriptors.length;
  for (const descriptor of Object.values(descriptors)) {
    if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) return false;
    if (!isClosedDataGraph(descriptor.value, seen)) return false;
  }
  return true;
}

function invalidManifest() {
  return new DomainError(
    "invalid_agent_pilot_capability_manifest",
    "Agent pilot capability manifest does not satisfy its versioned contract"
  );
}

function workflowAvailability(handoff) {
  if (handoff.status === "awaiting_active_mandate") {
    return {
      status: "waiting",
      nextAgentAction: "await_principal_handoff",
      creditOffer: { availability: "locked", blockedReason: "awaiting_application_handoff" },
      sandboxObligation: { availability: "locked", blockedReason: "active_mandate_required" }
    };
  }
  if (handoff.status === "application_ready") {
    return {
      status: "application_ready",
      nextAgentAction: "run_credit_offer_workflow",
      creditOffer: { availability: "enabled" },
      sandboxObligation: { availability: "locked", blockedReason: "active_mandate_required" }
    };
  }
  const hasRuntimeCapabilities = REQUIRED_RUNTIME_CAPABILITIES.every((capability) =>
    handoff.authority.capabilities.includes(capability)
  );
  return {
    status: "runtime_ready",
    nextAgentAction: hasRuntimeCapabilities
      ? "run_sandbox_obligation_workflow"
      : "request_principal_scope_review",
    creditOffer: { availability: "locked", blockedReason: "application_handoff_only" },
    sandboxObligation: hasRuntimeCapabilities
      ? { availability: "enabled" }
      : { availability: "locked", blockedReason: "required_mandate_capabilities_missing" }
  };
}

export function createAgentPilotCapabilityManifest(handoff) {
  if (!isClosedDataGraph(handoff)) throw invalidManifest();
  try {
    assertAgentHandoffManifest(handoff);
  } catch {
    throw invalidManifest();
  }
  const availability = workflowAvailability(handoff);
  const manifest = {
    schemaVersion: AGENT_PILOT_CAPABILITY_MANIFEST_SCHEMA_VERSION,
    status: availability.status,
    nextAgentAction: availability.nextAgentAction,
    handoff: structuredClone(handoff),
    mcp: {
      registryVersion: "agent_mcp_registry.v2",
      transportProfile: "mcp_stdio_local",
      toolCount: AGENT_PILOT_MCP_TOOLS.length,
      tools: AGENT_PILOT_MCP_TOOLS.map((tool) => ({ ...tool })),
      economicLifecycleToolsIncluded: true
    },
    workflows: [
      {
        sequence: 1,
        workflowId: "credit_offer",
        entryPoint: "runAgentCreditOfferWorkflow",
        interface: "sdk_mcp_stdio_local",
        requiredHandoffStatus: "application_ready",
        requiredCapabilities: ["request_credit"],
        inputSchemaVersion: "tenant_protocol_request.v1",
        outputSchemaVersion: "agent_credit_offer_workflow_receipt.v1",
        ...availability.creditOffer
      },
      {
        sequence: 2,
        workflowId: "sandbox_obligation",
        entryPoint: "runAgentSandboxObligationWorkflow",
        interface: "sdk_tenant_protocol_local",
        requiredHandoffStatus: "ready",
        requiredCapabilities: [...REQUIRED_RUNTIME_CAPABILITIES],
        inputSchemaVersion: "agent_credit_offer_workflow_receipt.v1",
        outputSchemaVersion: "agent_sandbox_obligation_workflow_receipt.v1",
        ...availability.sandboxObligation
      },
      {
        sequence: 3,
        workflowId: "obligation_portability",
        entryPoint: "runSandboxObligationPortabilityConformance",
        interface: "sdk_local_conformance",
        requiredHandoffStatus: "none",
        requiredCapabilities: [],
        inputSchemaVersion: "agent_sandbox_obligation_workflow_receipt.v1",
        outputSchemaVersion: "sandbox_obligation_portability_receipt.v1",
        availability: "input_required",
        blockedReason: "prior_receipt_required"
      }
    ],
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsApproved: false,
    productionFundsMoved: false,
    withdrawable: false,
    fundsAuthority: false,
    credentialsIncluded: false,
    publicEndpointEnabled: false,
    remoteMcpEnabled: false,
    economicMcpToolsEnabled: true,
    liveChainExecution: false
  };
  if (validateManifest(manifest) !== true) throw invalidManifest();
  return deepFreeze(manifest);
}

export function isAgentPilotCapabilityManifest(value) {
  if (!isClosedDataGraph(value) || validateManifest(value) !== true) return false;
  try {
    return JSON.stringify(value) === JSON.stringify(createAgentPilotCapabilityManifest(value.handoff));
  } catch {
    return false;
  }
}

export function assertAgentPilotCapabilityManifest(value) {
  if (!isAgentPilotCapabilityManifest(value)) throw invalidManifest();
}
