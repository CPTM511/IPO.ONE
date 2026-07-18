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

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
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
  if (handoff.status !== "ready") {
    throw new TypeError("handoff must satisfy agent_handoff_manifest.v1");
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
  const availability = workflowAvailability(handoff);
  return deepFreeze({
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
  });
}
