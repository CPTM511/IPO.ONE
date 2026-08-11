import type {
  AgentCreditOfferWorkflowReceipt,
  AgentPilotCapabilityManifest,
  AgentHandoffManifest,
  AgentSandboxObligationWorkflowReceipt,
  ApplicationReadyAgentHandoffManifest,
  ReadyAgentHandoffManifest,
  SandboxObligationPortabilityReceipt,
  TenantProtocolRequest,
  TenantProtocolResult
} from "@ipo-one/api-contract";

export type TradingCapitalActorType =
  | "human"
  | "agent"
  | "provider"
  | "risk_operator"
  | "operations_operator"
  | "system_worker";

export const TRADING_CAPITAL_OPERATION_IDS:
  readonly import("@ipo-one/api-contract").TenantProtocolOperationId[];
export const TRADING_CAPITAL_ROLE_OPERATIONS: Readonly<
  Record<TradingCapitalActorType, readonly import("@ipo-one/api-contract").TenantProtocolOperationId[]>
>;

export class IpoOneTradingCapitalSdkError extends Error {
  constructor(code: string, message: string);
  readonly code: string;
}

export interface IpoOneTradingCapitalClientOptions {
  execute: AgentTenantProtocolExecute;
  actorType: TradingCapitalActorType;
  transportProfile: "local_in_process";
}

export class IpoOneTradingCapitalClient {
  constructor(options: IpoOneTradingCapitalClientOptions);
  readonly actorType: TradingCapitalActorType;
  listOperations(): import("@ipo-one/api-contract").TenantProtocolOperationId[];
  executeOperation<OperationId extends import("@ipo-one/api-contract").TenantProtocolOperationId>(
    request: Extract<
      import("@ipo-one/api-contract").TenantProtocolRequest,
      { operationId: OperationId }
    >
  ): Promise<
    import("@ipo-one/api-contract").TenantProtocolResultFor<OperationId>
  >;
}

export type {
  AgentCreditOfferWorkflowReceipt,
  AgentPilotCapabilityManifest,
  AgentHandoffManifest,
  AgentSandboxObligationWorkflowReceipt,
  ApplicationReadyAgentHandoffManifest,
  ReadyAgentHandoffManifest,
  SandboxObligationPortabilityReceipt
} from "@ipo-one/api-contract";

export type JsonObject = Record<string, unknown>;

export interface AgentMcpToolOperation {
  readonly name:
    | "ipo_one_read_self"
    | "ipo_one_request_credit"
    | "ipo_one_read_credit_application"
    | "ipo_one_evaluate_credit_application"
    | "ipo_one_submit_account_proof"
    | "ipo_one_read_account_binding"
    | "ipo_one_read_obligation"
    | "ipo_one_read_obligation_evidence"
    | "ipo_one_accept_credit_offer"
    | "ipo_one_execute_sandbox_obligation"
    | "ipo_one_post_sandbox_repayment"
    | "ipo_one_read_credit_registry_evidence";
  readonly operationId:
    | "pilotReadAgentSelf"
    | "pilotRequestCredit"
    | "pilotReadCreditApplication"
    | "pilotEvaluateCreditApplication"
    | "pilotSubmitAgentAccountProof"
    | "pilotReadAgentAccountBinding"
    | "pilotReadOwnObligation"
    | "pilotReadOwnObligationEvidence"
    | "pilotAcceptCreditOffer"
    | "pilotExecuteSandboxObligation"
    | "pilotPostSandboxRepayment"
    | "pilotReadCreditRegistryEvidence";
}

export const AGENT_MCP_CLIENT_TOOLS: readonly AgentMcpToolOperation[];

export interface AgentCreditRequest {
  assetId: string;
  installmentCount: number;
  purposeCode: string;
  repaymentFrequency: "weekly" | "biweekly" | "monthly" | "end_of_term";
  requestedPrincipalMinor: string;
  requestedTermDays: number;
}

export interface AgentCreditOfferWorkflowInput {
  creditRequest: AgentCreditRequest;
  workflowId: string;
}

export type AgentMcpLocalHandle = (
  message: JsonObject
) => Promise<JsonObject>;

export interface IpoOneAgentMcpClientOptions {
  handle: AgentMcpLocalHandle;
  manifest: ApplicationReadyAgentHandoffManifest;
  transportProfile: "mcp_stdio_local";
}

export class IpoOneAgentSdkError extends Error {
  constructor(code: string, message: string);
  readonly code: string;
}

export class IpoOneAgentMcpClient {
  constructor(options: IpoOneAgentMcpClientOptions);
  runCreditOfferWorkflow(
    input: AgentCreditOfferWorkflowInput
  ): Promise<AgentCreditOfferWorkflowReceipt>;
}

export function runAgentCreditOfferWorkflow(
  input: IpoOneAgentMcpClientOptions & AgentCreditOfferWorkflowInput
): Promise<AgentCreditOfferWorkflowReceipt>;

export type AgentTenantProtocolExecute = (
  request: TenantProtocolRequest
) => Promise<TenantProtocolResult>;

export interface IpoOneAgentEvidenceClientOptions {
  execute: AgentTenantProtocolExecute;
  manifest: ReadyAgentHandoffManifest;
  transportProfile: "local_in_process";
}

export interface IpoOneAgentRegistryEvidenceClientOptions {
  execute: AgentTenantProtocolExecute;
  manifest: ReadyAgentHandoffManifest;
  transportProfile: "local_in_process";
}

export interface AgentCreditRegistryEvidenceQuery {
  authorizationHash: `0x${string}`;
  requestId: string;
  correlationId: string;
}

export class IpoOneAgentRegistryEvidenceClient {
  constructor(options: IpoOneAgentRegistryEvidenceClientOptions);
  readCreditRegistryEvidence(
    input: AgentCreditRegistryEvidenceQuery
  ): Promise<
    import("@ipo-one/api-contract").CreditRegistryEvidenceViewResponse
  >;
}

export function readAgentCreditRegistryEvidence(
  input: IpoOneAgentRegistryEvidenceClientOptions &
    AgentCreditRegistryEvidenceQuery
): Promise<
  import("@ipo-one/api-contract").CreditRegistryEvidenceViewResponse
>;

export interface AgentObligationEvidenceQuery {
  obligationId: string;
  limit: number;
  cursor?: string;
  requestId: string;
  correlationId: string;
}

export class IpoOneAgentEvidenceClient {
  constructor(options: IpoOneAgentEvidenceClientOptions);
  readObligationEvidence(
    input: AgentObligationEvidenceQuery
  ): Promise<import("@ipo-one/api-contract").OwnedObligationEvidenceViewResponse>;
}

export function readAgentObligationEvidence(
  input: IpoOneAgentEvidenceClientOptions & AgentObligationEvidenceQuery
): Promise<import("@ipo-one/api-contract").OwnedObligationEvidenceViewResponse>;

export interface IpoOneAgentFeedbackClientOptions {
  execute: AgentTenantProtocolExecute;
  manifest: ReadyAgentHandoffManifest;
  transportProfile: "local_in_process";
}

export interface AgentPilotFeedbackInput {
  subjectId: string;
  feedback: import("@ipo-one/api-contract").PilotFeedbackPayload;
  idempotencyKey: string;
  requestId: string;
  correlationId: string;
}

export class IpoOneAgentFeedbackClient {
  constructor(options: IpoOneAgentFeedbackClientOptions);
  submitFeedback(
    input: AgentPilotFeedbackInput
  ): Promise<import("@ipo-one/api-contract").PilotFeedbackRecordedResponse>;
}

export function submitAgentPilotFeedback(
  input: IpoOneAgentFeedbackClientOptions & AgentPilotFeedbackInput
): Promise<import("@ipo-one/api-contract").PilotFeedbackRecordedResponse>;

export interface IpoOneAgentObligationClientOptions {
  execute: AgentTenantProtocolExecute;
  manifest: ReadyAgentHandoffManifest;
  transportProfile: "local_in_process";
}

export interface AgentObligationQuery {
  obligationId: string;
  requestId: string;
  correlationId: string;
}

export class IpoOneAgentObligationClient {
  constructor(options: IpoOneAgentObligationClientOptions);
  readObligation(
    input: AgentObligationQuery
  ): Promise<import("@ipo-one/api-contract").OwnedObligationViewResponse>;
}

export function readAgentObligation(
  input: IpoOneAgentObligationClientOptions & AgentObligationQuery
): Promise<import("@ipo-one/api-contract").OwnedObligationViewResponse>;

export interface IpoOneAgentSandboxObligationClientOptions {
  execute: AgentTenantProtocolExecute;
  manifest: ReadyAgentHandoffManifest;
  transportProfile: "local_in_process";
}

export interface AgentSandboxRepaymentInput {
  amountMinor: string;
  sourceCode: "synthetic_wallet" | "synthetic_bank" | "synthetic_revenue";
}

export interface AgentSandboxObligationWorkflowInput {
  acknowledgementHash: string;
  offerReceipt: AgentCreditOfferWorkflowReceipt & { status: "offer_ready" };
  repayment: AgentSandboxRepaymentInput;
  workflowId: string;
}

export class IpoOneAgentSandboxObligationClient {
  constructor(options: IpoOneAgentSandboxObligationClientOptions);
  runObligationWorkflow(
    input: AgentSandboxObligationWorkflowInput
  ): Promise<AgentSandboxObligationWorkflowReceipt>;
}

export function runAgentSandboxObligationWorkflow(
  input: IpoOneAgentSandboxObligationClientOptions & AgentSandboxObligationWorkflowInput
): Promise<AgentSandboxObligationWorkflowReceipt>;

export function runSandboxObligationPortabilityConformance(input: {
  workflowReceipt:
    | AgentSandboxObligationWorkflowReceipt
    | import("@ipo-one/api-contract").HumanSandboxObligationWorkflowReceipt;
}): Promise<SandboxObligationPortabilityReceipt>;

export function createAgentPilotCapabilityManifest(
  handoff: AgentHandoffManifest
): AgentPilotCapabilityManifest;

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  requestId: string;
  retryAfterClass?: "manual" | "short" | "long";
  schemaVersion: "problem_details.v1";
}

export interface RequestOptions {
  requestId?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface SafetyBoundary {
  noRealLending: boolean;
  noRealFunds: boolean;
  noFinancialAdvice: boolean;
  productionRailNetworkCalls: boolean;
  [key: string]: unknown;
}

export interface DemoState extends JsonObject {
  safety: SafetyBoundary;
  assetId: string;
  assetScale: number;
  agent?: JsonObject;
  principal?: JsonObject;
  mandate?: JsonObject;
  providers: JsonObject[];
  transferIntents: JsonObject[];
  settlementReceipts: JsonObject[];
  obligations: JsonObject[];
  repayments: JsonObject[];
}

export interface IpoOneClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  sandboxSessionId?: string;
}

export class IpoOneApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly problem?: ProblemDetails;
}

export class IpoOneTransportError extends Error {
  readonly status?: number;
  readonly requestId?: string;
}

export class IpoOneClient {
  constructor(options: IpoOneClientOptions);
  health(options?: RequestOptions): Promise<JsonObject>;
  getDemoState(options?: RequestOptions): Promise<DemoState>;
  createAgent(input?: { displayName?: string }, options?: RequestOptions): Promise<DemoState>;
  bindWallet(agentId: string, input?: { accountId?: string }, options?: RequestOptions): Promise<DemoState>;
  createLockbox(agentId: string, options?: RequestOptions): Promise<DemoState>;
  requestCreditLine(agentId: string, options?: RequestOptions): Promise<DemoState>;
  submitSpendRequest(input: JsonObject, options?: RequestOptions): Promise<DemoState>;
  recordSettlement(input?: JsonObject, options?: RequestOptions): Promise<DemoState>;
  captureRevenue(input: JsonObject, options?: RequestOptions): Promise<DemoState>;
  autoRepay(input: JsonObject, options?: RequestOptions): Promise<DemoState>;
  evaluateCreditLearning(input: JsonObject, options?: RequestOptions): Promise<DemoState>;
  runCycle(cycleType: "healthy" | "risky" | "recovery", input: JsonObject, options?: RequestOptions): Promise<DemoState>;
  getAgentStatus(agentId: string, options?: RequestOptions): Promise<DemoState>;
  getCreditProfile(agentId: string, options?: RequestOptions): Promise<JsonObject>;
  getAudit(options?: RequestOptions): Promise<JsonObject>;
  listRails(options?: RequestOptions): Promise<{ rails: JsonObject[] }>;
  getTransferIntent(transferIntentId: string, options?: RequestOptions): Promise<JsonObject>;
  runVerticalSlice(options?: RequestOptions): Promise<JsonObject>;
  resetDemo(options?: RequestOptions): Promise<DemoState>;
}

export type WalletExecutionOperationId =
  | "walletPrepareAccountBinding"
  | "walletSubmitAccountBinding"
  | "walletReadAccountBindings"
  | "walletRevokeAccountBinding"
  | "walletDiscoverCapabilities"
  | "walletPrepareGrant"
  | "walletActivateGrant"
  | "walletReadGrant"
  | "walletRevokeGrant"
  | "walletPrepareExecution"
  | "walletApproveExecution"
  | "walletSubmitExecution"
  | "walletReadExecution";

export const WALLET_EXECUTION_SDK_OPERATIONS: readonly WalletExecutionOperationId[];

export interface WalletExecutionRequestIdentity {
  requestId: string;
  correlationId: string;
}

export interface WalletExecutionCommandIdentity extends WalletExecutionRequestIdentity {
  idempotencyKey: string;
}

export interface WalletExecutionClientOptions {
  execute(
    request: import("@ipo-one/api-contract").TenantProtocolRequest
  ): Promise<import("@ipo-one/api-contract").TenantProtocolResult>;
}

export class WalletExecutionClient {
  constructor(options: WalletExecutionClientOptions);
  prepareAccountBinding(input: WalletExecutionCommandIdentity & {
    subjectId: string;
    accountId: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletPrepareAccountBinding">>;
  submitAccountBinding(input: WalletExecutionCommandIdentity & {
    subjectId: string;
    challengeId: string;
    accountId: string;
    signature: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletSubmitAccountBinding">>;
  readAccountBindings(input: WalletExecutionRequestIdentity & {
    subjectId: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletReadAccountBindings">>;
  revokeAccountBinding(input: WalletExecutionCommandIdentity & {
    subjectId: string;
    accountBindingId: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletRevokeAccountBinding">>;
  discoverCapabilities(input: WalletExecutionRequestIdentity & { adapterId: string }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletDiscoverCapabilities">>;
  prepareGrant(input: WalletExecutionCommandIdentity & {
    subjectId: string;
    providerId: string;
    accountBindingId: string;
    chainId: "eip155:84532" | "eip155:1952";
    requestedExpiresAt: string;
    sessionEpoch: number;
    nonce: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletPrepareGrant">>;
  activateGrant(input: WalletExecutionCommandIdentity & {
    grantId: string;
    expectedGrantHash: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletActivateGrant">>;
  readGrant(input: WalletExecutionRequestIdentity & { grantId: string }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletReadGrant">>;
  revokeGrant(input: WalletExecutionCommandIdentity & {
    grantId: string;
    reasonCode: "credential_compromise" | "operator_request" | "security_incident";
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletRevokeGrant">>;
  prepareExecution(input: WalletExecutionCommandIdentity & {
    grantId: string;
    transferIntentId: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletPrepareExecution">>;
  approveExecution(input: WalletExecutionCommandIdentity & {
    executionId: string;
    preflightHash: string;
    approvalArtifactHash: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletApproveExecution">>;
  submitExecution(input: WalletExecutionCommandIdentity & {
    executionId: string;
    preflightHash: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletSubmitExecution">>;
  readExecution(input: WalletExecutionRequestIdentity & { executionId: string }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"walletReadExecution">>;
}

export type VenueExecutionOperationId =
  | "venueDiscoverCapabilities"
  | "venueReadBinding"
  | "venuePrepareDelegate"
  | "venueActivateDelegate"
  | "venueRevokeDelegate"
  | "venuePrepareExecution"
  | "venueSubmitExecution"
  | "venueReadExecution";

export const VENUE_EXECUTION_SDK_OPERATIONS: readonly VenueExecutionOperationId[];

export interface VenueExecutionRequestIdentity {
  requestId: string;
  correlationId: string;
}

export interface VenueExecutionCommandIdentity extends VenueExecutionRequestIdentity {
  idempotencyKey: string;
}

export interface VenueExecutionClientOptions {
  execute(
    request: import("@ipo-one/api-contract").TenantProtocolRequest
  ): Promise<import("@ipo-one/api-contract").TenantProtocolResult>;
}

export class VenueExecutionClient {
  constructor(options: VenueExecutionClientOptions);
  discoverCapabilities(input: VenueExecutionRequestIdentity & { adapterId: string }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"venueDiscoverCapabilities">>;
  readBinding(input: VenueExecutionRequestIdentity & { bindingId: string }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"venueReadBinding">>;
  prepareDelegate(input: VenueExecutionCommandIdentity & {
    bindingId: string;
    delegateAddressHash: string;
    signerReferenceHash: string;
    requestedExpiresAt: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"venuePrepareDelegate">>;
  activateDelegate(input: VenueExecutionCommandIdentity & {
    delegateId: string;
    expectedDelegateHash: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"venueActivateDelegate">>;
  revokeDelegate(input: VenueExecutionCommandIdentity & {
    delegateId: string;
    reasonCode: "credential_compromise" | "operator_request" | "security_incident" | "scheduled_rotation" | "delegate_expired";
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"venueRevokeDelegate">>;
  prepareExecution(input: VenueExecutionCommandIdentity & {
    delegateId: string;
    orderIntentId: string;
    orderIntentHash: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"venuePrepareExecution">>;
  submitExecution(input: VenueExecutionCommandIdentity & {
    executionId: string;
    preparedExecutionHash: string;
  }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"venueSubmitExecution">>;
  readExecution(input: VenueExecutionRequestIdentity & { executionId: string }): Promise<import("@ipo-one/api-contract").TenantProtocolResultFor<"venueReadExecution">>;
}
