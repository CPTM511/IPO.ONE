export type JsonObject = Record<string, unknown>;

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
