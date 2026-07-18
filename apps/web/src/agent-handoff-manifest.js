export const AGENT_HANDOFF_MANIFEST_SCHEMA_VERSION = "agent_handoff_manifest.v1";

export const AGENT_HANDOFF_TOOLS = Object.freeze([
  Object.freeze({ name: "ipo_one_read_self", operationId: "pilotReadAgentSelf" }),
  Object.freeze({ name: "ipo_one_request_credit", operationId: "pilotRequestCredit" }),
  Object.freeze({ name: "ipo_one_read_credit_application", operationId: "pilotReadCreditApplication" }),
  Object.freeze({ name: "ipo_one_evaluate_credit_application", operationId: "pilotEvaluateCreditApplication" }),
  Object.freeze({ name: "ipo_one_submit_account_proof", operationId: "pilotSubmitAgentAccountProof" }),
  Object.freeze({ name: "ipo_one_read_account_binding", operationId: "pilotReadAgentAccountBinding" }),
  Object.freeze({ name: "ipo_one_read_obligation", operationId: "pilotReadOwnObligation" }),
  Object.freeze({ name: "ipo_one_read_obligation_evidence", operationId: "pilotReadOwnObligationEvidence" }),
  Object.freeze({ name: "ipo_one_accept_credit_offer", operationId: "pilotAcceptCreditOffer" }),
  Object.freeze({ name: "ipo_one_execute_sandbox_obligation", operationId: "pilotExecuteSandboxObligation" }),
  Object.freeze({ name: "ipo_one_post_sandbox_repayment", operationId: "pilotPostSandboxRepayment" })
]);

const MANDATE_CAPABILITIES = new Set([
  "request_credit",
  "accept_credit_offer",
  "execute_sandbox_credit",
  "provider_spend",
  "capture_revenue",
  "route_repayment"
]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const POSITIVE_MINOR = /^[1-9][0-9]{0,77}$/;

function validIdentifier(value) {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function validStringArray(values, predicate, maximum) {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.length <= maximum &&
    new Set(values).size === values.length &&
    values.every(predicate)
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function createAwaitingAgentHandoffManifest() {
  return deepFreeze({
    schemaVersion: AGENT_HANDOFF_MANIFEST_SCHEMA_VERSION,
    status: "awaiting_active_mandate",
    nonAuthorizing: true,
    requiredState: ["active Agent Subject", "active sandbox Mandate"],
    credentialDelivery: "out_of_band",
    credentialsIncluded: false,
    publicEndpointEnabled: false,
    remoteMcpEnabled: false,
    fundsAuthority: false
  });
}

function createScopedAgentHandoffManifest(mandate, status, authorityStatus) {
  const valid = (
    mandate?.status === authorityStatus &&
    mandate.sandboxOnly === true &&
    mandate.productionAuthority === false &&
    validIdentifier(mandate.subjectId) &&
    validIdentifier(mandate.mandateId) &&
    HASH.test(mandate.mandateHash ?? "") &&
    HASH.test(mandate.termsHash ?? "") &&
    validStringArray(mandate.capabilities, (value) => MANDATE_CAPABILITIES.has(value), 6) &&
    mandate.capabilities.includes("request_credit") &&
    validStringArray(mandate.assetIds, validIdentifier, 16) &&
    POSITIVE_MINOR.test(mandate.perActionLimitMinor ?? "") &&
    POSITIVE_MINOR.test(mandate.aggregateLimitMinor ?? "") &&
    typeof mandate.expiresAt === "string" &&
    /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(mandate.expiresAt) &&
    Number.isFinite(new Date(mandate.expiresAt).getTime())
  );
  if (!valid) return null;

  return deepFreeze({
    schemaVersion: AGENT_HANDOFF_MANIFEST_SCHEMA_VERSION,
    status,
    nonAuthorizing: true,
    subjectId: mandate.subjectId,
    mandateId: mandate.mandateId,
    mandateHash: mandate.mandateHash,
    termsHash: mandate.termsHash,
    authority: {
      status: mandate.status,
      capabilities: [...mandate.capabilities],
      assetIds: [...mandate.assetIds],
      perActionLimitMinor: mandate.perActionLimitMinor,
      aggregateLimitMinor: mandate.aggregateLimitMinor,
      expiresAt: mandate.expiresAt
    },
    protocol: {
      requestSchemaVersion: "tenant_protocol_request.v1",
      transportProfile: "mcp_stdio_local",
      nextTool: "ipo_one_read_self",
      tools: AGENT_HANDOFF_TOOLS.map((tool) => ({ ...tool }))
    },
    credentialDelivery: "out_of_band",
    credentialsIncluded: false,
    publicEndpointEnabled: false,
    remoteMcpEnabled: false,
    fundsAuthority: false
  });
}

export function createApplicationReadyAgentHandoffManifest(mandate) {
  return createScopedAgentHandoffManifest(mandate, "application_ready", "draft");
}

export function createReadyAgentHandoffManifest(mandate) {
  return createScopedAgentHandoffManifest(mandate, "ready", "active");
}
