export type TenantProtocolOperationId =
  | "pilotCreateAgentSubject"
  | "pilotCreateDraftMandate"
  | "pilotReadAgentSelf"
  | "pilotReadMandate"
  | "pilotRevokeDraftMandate";

export type TenantProtocolRequestSchemaVersion = "tenant_protocol_request.v1";
export type TenantProtocolResultSchemaVersion = "tenant_protocol_result.v1";
export type TenantProtocolCatalogSchemaVersion = "tenant_protocol_catalog.v1";
export type MandateCapability =
  | "request_credit"
  | "provider_spend"
  | "capture_revenue"
  | "route_repayment";
export type MandateStatus = "draft" | "active" | "suspended" | "revoked" | "expired";
export type SubjectStatus = "pending" | "active" | "suspended" | "closed";

export interface TenantProtocolResourceReference {
  resourceType: "subject" | "mandate";
  resourceId: string;
}

export interface TenantProtocolRequestBase {
  operationId: TenantProtocolOperationId;
  payload: Record<string, unknown>;
  requestId: string;
  correlationId: string;
  retryAttempt?: number;
  schemaVersion: TenantProtocolRequestSchemaVersion;
}

export interface CreateAgentSubjectRequest extends TenantProtocolRequestBase {
  operationId: "pilotCreateAgentSubject";
  payload: { subjectActorId: string; displayName: string; jurisdiction?: string };
  idempotencyKey: string;
}

export interface CreateDraftMandateRequest extends TenantProtocolRequestBase {
  operationId: "pilotCreateDraftMandate";
  payload: {
    capabilities: MandateCapability[];
    allowedProviderIds: string[];
    allowedCategories: string[];
    assetIds: string[];
    perActionLimitMinor: string;
    aggregateLimitMinor: string;
    validFrom: string;
    expiresAt: string;
    nonce: string;
    termsRef: string;
  };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadAgentSelfRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadAgentSelf";
  payload: Record<string, never>;
  resource: { resourceType: "subject"; resourceId: string };
}

export interface ReadMandateRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadMandate";
  payload: Record<string, never>;
  resource: { resourceType: "mandate"; resourceId: string };
}

export interface RevokeDraftMandateRequest extends TenantProtocolRequestBase {
  operationId: "pilotRevokeDraftMandate";
  payload: Record<string, never>;
  resource: { resourceType: "mandate"; resourceId: string };
  reasonCode: "credential_compromise" | "operator_request" | "security_incident";
  idempotencyKey: string;
}

export type TenantProtocolRequest =
  | CreateAgentSubjectRequest
  | CreateDraftMandateRequest
  | ReadAgentSelfRequest
  | ReadMandateRequest
  | RevokeDraftMandateRequest;

export interface AgentSubjectCreatedResponse {
  principalId: string;
  subjectId: string;
  subjectHash: string;
  subjectType: "agent";
  status: SubjectStatus;
  schemaVersion: "tenant_agent_subject_created.v1";
}

export interface DraftMandateCreatedResponse {
  mandateId: string;
  mandateHash: string;
  subjectId: string;
  status: "draft";
  capabilities: MandateCapability[];
  assetIds: string[];
  perActionLimitMinor: string;
  aggregateLimitMinor: string;
  validFrom: string;
  expiresAt: string;
  schemaVersion: "tenant_draft_mandate_created.v1";
}

export interface AgentSubjectView {
  subjectId: string;
  subjectHash: string;
  subjectType: "agent";
  displayName: string;
  primaryPrincipalId: string;
  status: SubjectStatus;
  riskTier: "unrated" | "tier_1" | "tier_2" | "tier_3" | "tier_4";
  metadataRef?: string;
  prototypeOnly: boolean;
  createdAt: string;
  updatedAt: string;
  schemaVersion: "subject.v1";
}

export interface MandateSummary {
  mandateId: string;
  mandateHash: string;
  status: MandateStatus;
  capabilities: MandateCapability[];
  assetIds: string[];
  providerScopeCount: number;
  categoryScopeCount: number;
  perActionLimitMinor: string;
  aggregateLimitMinor: string;
  utilizedMinor: string;
  validFrom: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSubjectViewResponse {
  subject: AgentSubjectView;
  mandates: MandateSummary[];
  hasMoreMandates: boolean;
  schemaVersion: "tenant_agent_subject_view.v2";
}

export interface MandateView {
  mandateId: string;
  mandateHash: string;
  principalId: string;
  subjectId: string;
  capabilities: MandateCapability[];
  allowedProviderIds: string[];
  allowedCategories: string[];
  assetIds: string[];
  perActionLimitMinor: string;
  aggregateLimitMinor: string;
  utilizedMinor: string;
  validFrom: string;
  expiresAt: string;
  nonce: string;
  termsRef: string;
  status: MandateStatus;
  createdAt: string;
  updatedAt: string;
  schemaVersion: "mandate.v2";
}

export interface MandateViewResponse {
  mandate: MandateView;
  schemaVersion: "tenant_mandate_view.v1";
}

export interface DraftMandateRevokedResponse {
  mandateId: string;
  mandateHash: string;
  subjectId: string;
  status: "revoked";
  reasonCode: "credential_compromise" | "operator_request" | "security_incident";
  updatedAt: string;
  schemaVersion: "tenant_draft_mandate_revoked.v1";
}

export interface TenantProtocolResultBase<
  OperationId extends TenantProtocolOperationId,
  Response
> {
  operationId: OperationId;
  replayed: boolean;
  response: Response;
  schemaVersion: TenantProtocolResultSchemaVersion;
}

export type TenantProtocolResult =
  | TenantProtocolResultBase<"pilotCreateAgentSubject", AgentSubjectCreatedResponse>
  | TenantProtocolResultBase<"pilotCreateDraftMandate", DraftMandateCreatedResponse>
  | TenantProtocolResultBase<"pilotReadAgentSelf", AgentSubjectViewResponse>
  | TenantProtocolResultBase<"pilotReadMandate", MandateViewResponse>
  | TenantProtocolResultBase<"pilotRevokeDraftMandate", DraftMandateRevokedResponse>;

export type TenantProtocolResultFor<OperationId extends TenantProtocolOperationId> = Extract<
  TenantProtocolResult,
  { operationId: OperationId }
>;

export interface TenantProtocolOperationBase<
  OperationId extends TenantProtocolOperationId,
  Kind extends "command" | "query",
  ActorType extends "human" | "agent",
  ResourceType extends "subject" | "mandate",
  Capability extends string,
  Idempotency extends "required" | "prohibited",
  QuotaClass extends "read" | "mutation",
  ResponseSchemaVersion extends string
> {
  readonly operationId: OperationId;
  readonly kind: Kind;
  readonly actorTypes: readonly [ActorType];
  readonly resourceType: ResourceType;
  readonly requiredCapability: Capability;
  readonly idempotency: Idempotency;
  readonly quotaClass: QuotaClass;
  readonly requestSchemaVersion: TenantProtocolRequestSchemaVersion;
  readonly responseSchemaVersion: ResponseSchemaVersion;
  readonly public: false;
  readonly fundsAuthority: false;
}

export type TenantProtocolOperation =
  | TenantProtocolOperationBase<
      "pilotCreateAgentSubject",
      "command",
      "human",
      "subject",
      "agent.create",
      "required",
      "mutation",
      "tenant_agent_subject_created.v1"
    >
  | TenantProtocolOperationBase<
      "pilotCreateDraftMandate",
      "command",
      "human",
      "subject",
      "mandate.draft.create",
      "required",
      "mutation",
      "tenant_draft_mandate_created.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadAgentSelf",
      "query",
      "agent",
      "subject",
      "subject.read.self",
      "prohibited",
      "read",
      "tenant_agent_subject_view.v2"
    >
  | TenantProtocolOperationBase<
      "pilotReadMandate",
      "query",
      "human",
      "mandate",
      "integration.read.owned",
      "prohibited",
      "read",
      "tenant_mandate_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotRevokeDraftMandate",
      "command",
      "human",
      "mandate",
      "mandate.draft.revoke",
      "required",
      "mutation",
      "tenant_draft_mandate_revoked.v1"
    >;

export interface TenantProtocolCatalog {
  protocol: "IPO.ONE";
  protocolVersion: "tenant_protocol.v1";
  maturity: "local_non_funds";
  availability: {
    enabledTransports: readonly ["local_in_process"];
    publicEndpointEnabled: false;
    authenticatedHttpEnabled: false;
    mcpA2aEnabled: false;
    authenticationContextSource: "trusted_transport_adapter";
    networkContextSource: "trusted_ingress_adapter";
  };
  compatibility: {
    acceptedRequestSchemaVersions: readonly [TenantProtocolRequestSchemaVersion];
    emittedResultSchemaVersions: readonly [TenantProtocolResultSchemaVersion];
    unknownFieldsRejected: true;
    unknownOperationsRejected: true;
    breakingChangeRequiresNewSchemaVersion: true;
    minimumProductionDeprecationDays: 90;
  };
  operations: readonly TenantProtocolOperation[];
  safety: {
    realFundsEnabled: false;
    productionCreditEnabled: false;
    humanCreditEnabled: false;
    mandateActivationEnabled: false;
    productionIdentityEnabled: false;
    rawPiiAllowed: false;
  };
  schemaVersion: TenantProtocolCatalogSchemaVersion;
}

export const TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION: TenantProtocolRequestSchemaVersion;
export const TENANT_PROTOCOL_RESULT_SCHEMA_VERSION: TenantProtocolResultSchemaVersion;
export const TENANT_PROTOCOL_CATALOG_SCHEMA_VERSION: TenantProtocolCatalogSchemaVersion;
export const TENANT_PROTOCOL_OPERATIONS: readonly TenantProtocolOperation[];
export const TENANT_PROTOCOL_CATALOG: Readonly<TenantProtocolCatalog>;

export function isTenantProtocolRequest(value: unknown): value is TenantProtocolRequest;
export function assertTenantProtocolRequest(value: unknown): asserts value is TenantProtocolRequest;
export function isTenantProtocolResult(value: unknown): value is TenantProtocolResult;
export function assertTenantProtocolResult(value: unknown): asserts value is TenantProtocolResult;
export function isTenantProtocolCatalog(value: unknown): value is TenantProtocolCatalog;
export function assertTenantProtocolCatalog(value: unknown): asserts value is TenantProtocolCatalog;

export class ApiBoundaryError extends Error {
  readonly code: string;
  readonly status: number;
  readonly headers: Record<string, string>;
}

export function createRequestId(headers?: Record<string, string | string[]>): string;
export function createProblemDetails(error: unknown, input: { requestId: string }): Record<string, unknown>;
export function isValidRequestId(value: unknown): value is string;
