import {
  AGENT_PILOT_MCP_TOOLS,
  createAgentPilotCapabilityManifest
} from "./agent-pilot-capability-manifest.js";

export const AGENT_CONSOLE_PRESENTATION_VERSION =
  "agent_console_presentation.v1";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const MINOR = /^(?:0|[1-9][0-9]{0,77})$/;
const SUBJECT_STATUSES = new Set(["pending", "active", "suspended", "closed"]);
const MANDATE_STATUSES = new Set(["draft", "active", "revoked", "expired"]);

const TOOL_PHASES = Object.freeze({
  pilotReadAgentSelf: "shared",
  pilotRequestCredit: "application",
  pilotReadCreditApplication: "shared",
  pilotEvaluateCreditApplication: "shared",
  pilotSubmitAgentAccountProof: "shared",
  pilotReadAgentAccountBinding: "shared",
  pilotReadOwnObligation: "runtime",
  pilotReadOwnObligationEvidence: "runtime",
  pilotAcceptCreditOffer: "runtime",
  pilotExecuteSandboxObligation: "runtime",
  pilotPostSandboxRepayment: "runtime"
});

const TOOL_GROUPS = Object.freeze({
  pilotReadAgentSelf: "identity",
  pilotSubmitAgentAccountProof: "identity",
  pilotReadAgentAccountBinding: "identity",
  pilotRequestCredit: "application",
  pilotReadCreditApplication: "application",
  pilotEvaluateCreditApplication: "application",
  pilotReadOwnObligation: "evidence",
  pilotReadOwnObligationEvidence: "evidence",
  pilotAcceptCreditOffer: "economic",
  pilotExecuteSandboxObligation: "economic",
  pilotPostSandboxRepayment: "economic"
});

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function closedRecord(value, required) {
  if (!plainRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || !required.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") &&
      !descriptor.get && !descriptor.set;
  });
}

function closedDataGraph(value, seen = new WeakSet()) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }
  if (typeof value !== "object" || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) delete descriptors.length;
  return Object.values(descriptors).every((descriptor) =>
    Object.hasOwn(descriptor, "value") &&
    descriptor.enumerable &&
    closedDataGraph(descriptor.value, seen)
  );
}

function validTimestamp(value) {
  if (typeof value !== "string" || !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function uniqueIdentifiers(values, maximum) {
  return Array.isArray(values) &&
    values.length <= maximum &&
    new Set(values).size === values.length &&
    values.every((value) => typeof value === "string" && IDENTIFIER.test(value));
}

function canonicalManifest(value) {
  if (!closedDataGraph(value)) return null;
  try {
    const canonical = createAgentPilotCapabilityManifest(value.handoff);
    return JSON.stringify(canonical) === JSON.stringify(value) ? canonical : null;
  } catch {
    return null;
  }
}

function validSubject(subject) {
  return subject === null || (
    closedRecord(subject, [
      "subjectId",
      "principalId",
      "status",
      "schemaVersion"
    ]) &&
    IDENTIFIER.test(subject.subjectId ?? "") &&
    (subject.principalId === null || IDENTIFIER.test(subject.principalId ?? "")) &&
    SUBJECT_STATUSES.has(subject.status) &&
    subject.schemaVersion === "agent_console_subject_snapshot.v1"
  );
}

function validBinding(binding) {
  return binding === null || (
    closedRecord(binding, [
      "subjectId",
      "status",
      "chainId",
      "purpose",
      "accountHash",
      "proofHash",
      "verificationMethod",
      "boundAt",
      "schemaVersion"
    ]) &&
    IDENTIFIER.test(binding.subjectId ?? "") &&
    binding.status === "active" &&
    new Set(["eip155:84532", "eip155:1952"]).has(binding.chainId) &&
    IDENTIFIER.test(binding.purpose ?? "") &&
    HASH.test(binding.accountHash ?? "") &&
    HASH.test(binding.proofHash ?? "") &&
    IDENTIFIER.test(binding.verificationMethod ?? "") &&
    validTimestamp(binding.boundAt) &&
    binding.schemaVersion === "agent_console_account_binding_snapshot.v1"
  );
}

function validMandate(mandate) {
  return mandate === null || (
    closedRecord(mandate, [
      "mandateId",
      "subjectId",
      "principalId",
      "status",
      "capabilities",
      "assetIds",
      "perActionLimitMinor",
      "aggregateLimitMinor",
      "utilizedMinor",
      "expiresAt",
      "mandateHash",
      "termsHash",
      "sandboxOnly",
      "productionAuthority",
      "schemaVersion"
    ]) &&
    IDENTIFIER.test(mandate.mandateId ?? "") &&
    IDENTIFIER.test(mandate.subjectId ?? "") &&
    IDENTIFIER.test(mandate.principalId ?? "") &&
    MANDATE_STATUSES.has(mandate.status) &&
    uniqueIdentifiers(mandate.capabilities, 6) &&
    uniqueIdentifiers(mandate.assetIds, 16) &&
    MINOR.test(mandate.perActionLimitMinor ?? "") &&
    MINOR.test(mandate.aggregateLimitMinor ?? "") &&
    MINOR.test(mandate.utilizedMinor ?? "") &&
    BigInt(mandate.perActionLimitMinor) <= BigInt(mandate.aggregateLimitMinor) &&
    BigInt(mandate.utilizedMinor) <= BigInt(mandate.aggregateLimitMinor) &&
    validTimestamp(mandate.expiresAt) &&
    HASH.test(mandate.mandateHash ?? "") &&
    HASH.test(mandate.termsHash ?? "") &&
    mandate.sandboxOnly === true &&
    mandate.productionAuthority === false &&
    mandate.schemaVersion === "agent_console_mandate_snapshot.v1"
  );
}

function toolAvailability(manifestStatus, phase, catalogAvailable) {
  if (!catalogAvailable) return "catalog_unavailable";
  if (manifestStatus === "waiting") return "handoff_required";
  if (phase === "application" && manifestStatus !== "application_ready") {
    return "application_handoff_required";
  }
  if (phase === "runtime" && manifestStatus !== "runtime_ready") {
    return "active_mandate_required";
  }
  return "eligible_for_gateway_check";
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function createAgentConsolePresentation(input) {
  if (
    !closedRecord(input, [
      "manifest",
      "catalogOperationIds",
      "subject",
      "accountBinding",
      "mandate"
    ]) ||
    !uniqueIdentifiers(input.catalogOperationIds, 128) ||
    !validSubject(input.subject) ||
    !validBinding(input.accountBinding) ||
    !validMandate(input.mandate)
  ) return null;

  const manifest = canonicalManifest(input.manifest);
  if (!manifest) return null;
  if (
    input.accountBinding && input.subject?.subjectId !== input.accountBinding.subjectId ||
    input.mandate && input.subject?.subjectId !== input.mandate.subjectId ||
    input.mandate && input.subject?.principalId &&
      input.subject.principalId !== input.mandate.principalId ||
    manifest.status !== "waiting" && (
      input.subject?.subjectId !== manifest.handoff.subjectId ||
      input.mandate?.mandateId !== manifest.handoff.mandateId ||
      input.mandate?.mandateHash !== manifest.handoff.mandateHash ||
      input.mandate?.termsHash !== manifest.handoff.termsHash
    )
  ) return null;

  const catalog = new Set(input.catalogOperationIds);
  const tools = manifest.mcp.tools.map((tool) => {
    const phase = TOOL_PHASES[tool.operationId];
    const catalogAvailable = catalog.has(tool.operationId);
    return {
      ...tool,
      group: TOOL_GROUPS[tool.operationId],
      phase,
      catalogAvailable,
      availability: toolAvailability(manifest.status, phase, catalogAvailable),
      schemaVersion: "agent_console_tool_presentation.v1"
    };
  });
  if (
    tools.length !== AGENT_PILOT_MCP_TOOLS.length ||
    tools.some((tool, index) =>
      tool.name !== AGENT_PILOT_MCP_TOOLS[index].name ||
      tool.operationId !== AGENT_PILOT_MCP_TOOLS[index].operationId
    )
  ) return null;

  const catalogBoundCount = tools.filter(({ catalogAvailable }) => catalogAvailable).length;
  return deepFreeze({
    schemaVersion: AGENT_CONSOLE_PRESENTATION_VERSION,
    status: manifest.status,
    nextAgentAction: manifest.nextAgentAction,
    principal: {
      principalId: input.mandate?.principalId ?? input.subject?.principalId ?? null,
      bound: Boolean(input.mandate?.principalId ?? input.subject?.principalId),
      controllerOnly: true
    },
    identity: {
      subjectId: input.subject?.subjectId ?? null,
      subjectStatus: input.subject?.status ?? null,
      accountBinding: input.accountBinding ? { ...input.accountBinding } : null
    },
    mandate: input.mandate ? { ...input.mandate } : null,
    registry: {
      registryVersion: manifest.mcp.registryVersion,
      transportProfile: manifest.mcp.transportProfile,
      toolCount: tools.length,
      catalogBoundCount,
      catalogParity: catalogBoundCount === tools.length,
      tools
    },
    workflows: manifest.workflows.map((workflow) => ({ ...workflow })),
    reliability: {
      idempotency: "stable_workflow_and_command_ids",
      errors: "stable_problem_details_and_mcp_codes",
      evidence: "owned_hash_only_immutable_evidence",
      conformance: "registry_sdk_browser_contract_parity_checked",
      browserExecutesAgentWorkflow: false
    },
    unavailableCapabilities: [
      "remote_mcp",
      "a2a",
      "production_workload_credentials",
      "public_agent_endpoint",
      "real_provider_execution",
      "real_funds",
      "active_mandate_edit"
    ],
    nonAuthorizing: true,
    sandboxOnly: true,
    credentialsIncluded: false,
    fundsAuthority: false,
    productionFundsApproved: false,
    publicEndpointEnabled: false,
    remoteMcpEnabled: false,
    liveChainExecution: false
  });
}
