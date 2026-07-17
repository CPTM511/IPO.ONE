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
    | "ipo_one_post_sandbox_repayment";
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
    | "pilotPostSandboxRepayment";
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
