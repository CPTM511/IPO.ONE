import type {
  TenantProtocolOperationId,
  TenantProtocolRequest,
  TenantProtocolResultFor
} from "@ipo-one/api-contract";

export interface ProductionAgentClientOptions {
  baseUrl: string;
  accessTokenProvider: () => Promise<string> | string;
  cert: string;
  key: string;
  ca?: string;
  request?: (...args: unknown[]) => unknown;
  clock?: () => Date;
}

export interface ProductionAgentExecuteOptions {
  signal?: AbortSignal;
}

export class IpoOneAgentApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly problem?: Record<string, unknown>;
  readonly outcome: "known_rejection";
  readonly retryAfterClass?: "manual" | "short" | "long";
}

export class IpoOneAgentTransportError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly operationId: TenantProtocolOperationId;
  readonly outcome: "unknown";
  readonly retryDirective:
    | "read_or_reconcile_before_retry"
    | "replay_exact_request_with_same_idempotency_key";
}

export class ProductionAgentClient {
  constructor(options: ProductionAgentClientOptions);
  execute<OperationId extends TenantProtocolOperationId>(
    request: Extract<TenantProtocolRequest, { operationId: OperationId }>,
    options?: ProductionAgentExecuteOptions
  ): Promise<TenantProtocolResultFor<OperationId>>;
}
