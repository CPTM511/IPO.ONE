import Ajv2020 from "ajv/dist/2020.js";
import { DomainError } from "../../domain/src/index.js";
import mandateSchema from "../../../schemas/v2/mandate.schema.json" with { type: "json" };
import providerIntentAcknowledgementSchema from "../../../schemas/v2/provider-intent-acknowledgement.schema.json" with { type: "json" };
import providerIntentViewSchema from "../../../schemas/v2/provider-intent-view.schema.json" with { type: "json" };
import providerSandboxCallbackSchema from "../../../schemas/v2/provider-sandbox-callback.schema.json" with { type: "json" };
import catalogSchema from "../../../schemas/v2/tenant-protocol-catalog.schema.json" with { type: "json" };
import requestSchema from "../../../schemas/v2/tenant-protocol-request.schema.json" with { type: "json" };
import resultSchema from "../../../schemas/v2/tenant-protocol-result.schema.json" with { type: "json" };

export const TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION = "tenant_protocol_request.v1";
export const TENANT_PROTOCOL_RESULT_SCHEMA_VERSION = "tenant_protocol_result.v1";
export const TENANT_PROTOCOL_CATALOG_SCHEMA_VERSION = "tenant_protocol_catalog.v1";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function dateTime(value) {
  return (
    typeof value === "string" &&
    /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
    Number.isFinite(new Date(value).getTime())
  );
}

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
ajv.addFormat("date-time", { type: "string", validate: dateTime });
ajv.addSchema(mandateSchema);
ajv.addSchema(providerIntentAcknowledgementSchema);
ajv.addSchema(providerIntentViewSchema);
ajv.addSchema(providerSandboxCallbackSchema);

const validateRequest = ajv.compile(requestSchema);
const validateResult = ajv.compile(resultSchema);
const validateCatalog = ajv.compile(catalogSchema);

export const TENANT_PROTOCOL_OPERATIONS = deepFreeze([
  {
    operationId: "pilotAcceptCreditOffer",
    kind: "command",
    actorTypes: ["human", "agent"],
    resourceType: "credit_offer",
    requiredCapability: "credit.offer.accept.self",
    idempotency: "required",
    quotaClass: "economic",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_credit_offer_accepted.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotExecuteSandboxObligation",
    kind: "command",
    actorTypes: ["human", "agent"],
    resourceType: "obligation",
    requiredCapability: "credit.execute.sandbox.self",
    idempotency: "required",
    quotaClass: "economic",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_sandbox_obligation_executed.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotPostSandboxRepayment",
    kind: "command",
    actorTypes: ["human", "agent"],
    resourceType: "obligation",
    requiredCapability: "repayment.post.sandbox.self",
    idempotency: "required",
    quotaClass: "economic",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_sandbox_repayment_posted.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotRestructureSandboxObligation",
    kind: "command",
    actorTypes: ["operations_operator"],
    resourceType: "obligation",
    requiredCapability: "servicing.restructure.sandbox",
    idempotency: "required",
    quotaClass: "privileged",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_sandbox_obligation_restructured.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotRepurchaseSandboxObligation",
    kind: "command",
    actorTypes: ["operations_operator"],
    resourceType: "obligation",
    requiredCapability: "servicing.repurchase.sandbox",
    idempotency: "required",
    quotaClass: "privileged",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_sandbox_obligation_repurchased.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotWriteOffSandboxObligation",
    kind: "command",
    actorTypes: ["operations_operator"],
    resourceType: "obligation",
    requiredCapability: "servicing.writeoff.sandbox",
    idempotency: "required",
    quotaClass: "privileged",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_sandbox_obligation_written_off.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "workerAdvanceSandboxServicing",
    kind: "command",
    actorTypes: ["system_worker"],
    resourceType: "obligation",
    requiredCapability: "servicing.advance.sandbox",
    idempotency: "required",
    quotaClass: "worker",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_sandbox_servicing_advanced.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotCreateAgentAccountChallenge",
    kind: "command",
    actorTypes: ["human"],
    resourceType: "subject",
    requiredCapability: "agent_account.challenge.create.owned",
    idempotency: "required",
    quotaClass: "credential",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_agent_account_challenge_created.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotActivateSandboxMandate",
    kind: "command",
    actorTypes: ["human"],
    resourceType: "mandate",
    requiredCapability: "mandate.activate.owned",
    idempotency: "required",
    quotaClass: "mutation",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_sandbox_mandate_activated.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotCreateAgentSubject",
    kind: "command",
    actorTypes: ["human"],
    resourceType: "subject",
    requiredCapability: "agent.create",
    idempotency: "required",
    quotaClass: "mutation",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_agent_subject_created.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotCreateConsent",
    kind: "command",
    actorTypes: ["human"],
    resourceType: "subject",
    requiredCapability: "consent.create.self",
    idempotency: "required",
    quotaClass: "mutation",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_consent_created.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotCreateHumanSubject",
    kind: "command",
    actorTypes: ["human"],
    resourceType: "subject",
    requiredCapability: "human_subject.create.self",
    idempotency: "required",
    quotaClass: "mutation",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_human_subject_created.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotCreateDraftMandate",
    kind: "command",
    actorTypes: ["human"],
    resourceType: "subject",
    requiredCapability: "mandate.draft.create",
    idempotency: "required",
    quotaClass: "mutation",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_draft_mandate_created.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotEvaluateCreditApplication",
    kind: "command",
    actorTypes: ["human", "agent"],
    resourceType: "credit_intent",
    requiredCapability: "credit.evaluate.self",
    idempotency: "required",
    quotaClass: "economic",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_credit_application_evaluated.v2",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotFreezeSubject",
    kind: "command",
    actorTypes: ["risk_operator", "operations_operator"],
    resourceType: "subject",
    requiredCapability: "risk.freeze",
    idempotency: "required",
    quotaClass: "privileged",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_agent_subject_frozen.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotRequestCredit",
    kind: "command",
    actorTypes: ["human", "agent"],
    resourceType: "subject",
    requiredCapability: "credit.request",
    idempotency: "required",
    quotaClass: "economic",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_credit_intent_created.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadAgentSelf",
    kind: "query",
    actorTypes: ["agent"],
    resourceType: "subject",
    requiredCapability: "subject.read.self",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_agent_subject_view.v2",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadAgentAccountBinding",
    kind: "query",
    actorTypes: ["human", "agent"],
    resourceType: "subject",
    requiredCapability: "agent_account.binding.read.self",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_agent_account_binding_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadCreditApplication",
    kind: "query",
    actorTypes: ["human", "agent"],
    resourceType: "credit_intent",
    requiredCapability: "credit.read.self",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_credit_application_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadConsent",
    kind: "query",
    actorTypes: ["human"],
    resourceType: "consent",
    requiredCapability: "consent.read.self",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_consent_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadHumanSelf",
    kind: "query",
    actorTypes: ["human"],
    resourceType: "subject",
    requiredCapability: "subject.read.self",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_human_subject_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadWorkspaceResume",
    kind: "query",
    actorTypes: ["human"],
    resourceType: "workspace",
    requiredCapability: "workspace.resume.self",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_workspace_resume_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadIdentityReference",
    kind: "query",
    actorTypes: ["human"],
    resourceType: "human_identity_reference",
    requiredCapability: "identity_reference.read.self",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_human_identity_reference_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadMandate",
    kind: "query",
    actorTypes: ["human"],
    resourceType: "mandate",
    requiredCapability: "integration.read.owned",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_mandate_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadTenantRisk",
    kind: "query",
    actorTypes: ["risk_operator", "auditor"],
    resourceType: "risk_portfolio",
    requiredCapability: "risk.read.tenant",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_risk_portfolio_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadPilotHealth",
    kind: "query",
    actorTypes: ["risk_operator", "operations_operator", "auditor"],
    resourceType: "risk_portfolio",
    requiredCapability: "pilot.health.read",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_pilot_health_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadPilotFeedbackSummary",
    kind: "query",
    actorTypes: ["risk_operator", "operations_operator", "auditor"],
    resourceType: "risk_portfolio",
    requiredCapability: "pilot.feedback.read.tenant",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_pilot_feedback_summary_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadServicingQueue",
    kind: "query",
    actorTypes: ["risk_operator", "operations_operator"],
    resourceType: "servicing_queue",
    requiredCapability: "servicing.queue.read",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_servicing_queue_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadEvidence",
    kind: "query",
    actorTypes: ["auditor"],
    resourceType: "evidence",
    requiredCapability: "evidence.read",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_obligation_evidence_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadOwnObligationEvidence",
    kind: "query",
    actorTypes: ["human", "agent"],
    resourceType: "evidence",
    requiredCapability: "evidence.read.owned",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_owned_obligation_evidence_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadOwnObligation",
    kind: "query",
    actorTypes: ["human", "agent"],
    resourceType: "obligation",
    requiredCapability: "obligation.read.owned",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_owned_obligation_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotRevokeConsent",
    kind: "command",
    actorTypes: ["human"],
    resourceType: "consent",
    requiredCapability: "consent.revoke.self",
    idempotency: "required",
    quotaClass: "mutation",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_consent_revoked.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotSubmitPilotFeedback",
    kind: "command",
    actorTypes: ["human", "agent"],
    resourceType: "subject",
    requiredCapability: "pilot.feedback.submit.self",
    idempotency: "required",
    quotaClass: "mutation",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_pilot_feedback_recorded.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotRevokeDraftMandate",
    kind: "command",
    actorTypes: ["human"],
    resourceType: "mandate",
    requiredCapability: "mandate.draft.revoke",
    idempotency: "required",
    quotaClass: "mutation",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_draft_mandate_revoked.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotSubmitAgentAccountProof",
    kind: "command",
    actorTypes: ["agent"],
    resourceType: "subject",
    requiredCapability: "agent_account.proof.submit.self",
    idempotency: "required",
    quotaClass: "credential",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "tenant_agent_account_proof_verified.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotReadProviderIntent",
    kind: "query",
    actorTypes: ["provider"],
    resourceType: "transfer_intent",
    requiredCapability: "provider.intent.read",
    idempotency: "prohibited",
    quotaClass: "read",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "provider_intent_view.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "pilotAcknowledgeProviderIntent",
    kind: "command",
    actorTypes: ["provider"],
    resourceType: "transfer_intent",
    requiredCapability: "provider.intent.acknowledge",
    idempotency: "required",
    quotaClass: "mutation",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "provider_intent_acknowledgement.v1",
    public: false,
    fundsAuthority: false
  },
  {
    operationId: "workerProcessInbox",
    kind: "command",
    actorTypes: ["system_worker"],
    resourceType: "inbox_message",
    requiredCapability: "worker.inbox.process",
    idempotency: "required",
    quotaClass: "worker",
    requestSchemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: "provider_sandbox_callback_result.v1",
    public: false,
    fundsAuthority: false
  }
]);

export const TENANT_PROTOCOL_CATALOG = deepFreeze({
  protocol: "IPO.ONE",
  protocolVersion: "tenant_protocol.v1",
  maturity: "local_non_funds",
  availability: {
    enabledTransports: [
      "local_in_process",
      "authenticated_http_loopback",
      "mcp_stdio_local"
    ],
    publicEndpointEnabled: false,
    authenticatedHttpEnabled: true,
    authenticatedHttpProfile: "loopback_test_only",
    mcpStdioLocalEnabled: true,
    mcpA2aEnabled: false,
    authenticationContextSource: "trusted_transport_adapter",
    networkContextSource: "trusted_ingress_adapter"
  },
  compatibility: {
    acceptedRequestSchemaVersions: [TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION],
    emittedResultSchemaVersions: [TENANT_PROTOCOL_RESULT_SCHEMA_VERSION],
    unknownFieldsRejected: true,
    unknownOperationsRejected: true,
    breakingChangeRequiresNewSchemaVersion: true,
    minimumProductionDeprecationDays: 90
  },
  operations: TENANT_PROTOCOL_OPERATIONS,
  safety: {
    realFundsEnabled: false,
    productionCreditEnabled: false,
    humanCreditEnabled: false,
    humanCreditIntentEnabled: true,
    agentCreditIntentEnabled: true,
    humanCreditDecisionEnabled: true,
    agentCreditDecisionEnabled: true,
    offerAcceptanceEnabled: true,
    sandboxExecutionEnabled: true,
    sandboxRepaymentEnabled: true,
    sandboxServicingEnabled: true,
    sandboxResolutionEnabled: true,
    agentAccountProofEnabled: true,
    mandateActivationEnabled: true,
    providerSandboxEnabled: true,
    productionIdentityEnabled: false,
    rawPiiAllowed: false
  },
  schemaVersion: TENANT_PROTOCOL_CATALOG_SCHEMA_VERSION
});

function invalid(code, message) {
  throw new DomainError(code, message);
}

export function isTenantProtocolRequest(value) {
  return validateRequest(value) === true;
}

export function assertTenantProtocolRequest(value) {
  if (!isTenantProtocolRequest(value)) {
    invalid("invalid_tenant_protocol_request", "tenant protocol request does not satisfy its versioned contract");
  }
  return value;
}

export function isTenantProtocolResult(value) {
  return validateResult(value) === true;
}

export function assertTenantProtocolResult(value) {
  if (!isTenantProtocolResult(value)) {
    invalid("invalid_tenant_protocol_result", "tenant protocol result does not satisfy its versioned contract");
  }
  return value;
}

export function isTenantProtocolCatalog(value) {
  return validateCatalog(value) === true;
}

export function assertTenantProtocolCatalog(value) {
  if (!isTenantProtocolCatalog(value)) {
    invalid("invalid_tenant_protocol_catalog", "tenant protocol catalog does not satisfy its versioned contract");
  }
  return value;
}

assertTenantProtocolCatalog(TENANT_PROTOCOL_CATALOG);
