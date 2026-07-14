import Ajv2020 from "ajv/dist/2020.js";
import { DomainError } from "../../domain/src/index.js";
import mandateSchema from "../../../schemas/v2/mandate.schema.json" with { type: "json" };
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

const validateRequest = ajv.compile(requestSchema);
const validateResult = ajv.compile(resultSchema);
const validateCatalog = ajv.compile(catalogSchema);

export const TENANT_PROTOCOL_OPERATIONS = deepFreeze([
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
  }
]);

export const TENANT_PROTOCOL_CATALOG = deepFreeze({
  protocol: "IPO.ONE",
  protocolVersion: "tenant_protocol.v1",
  maturity: "local_non_funds",
  availability: {
    enabledTransports: ["local_in_process"],
    publicEndpointEnabled: false,
    authenticatedHttpEnabled: false,
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
    mandateActivationEnabled: false,
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
