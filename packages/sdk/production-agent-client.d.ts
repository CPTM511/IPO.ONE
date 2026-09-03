import type {
  TenantProtocolOperationId,
  TenantProtocolRequest,
  TenantProtocolResultFor
} from "@ipo-one/api-contract";

export interface ProductionAgentClientOptions {
  baseUrl: string;
  accessTokenProvider: () => Promise<string> | string;
  cert?: string;
  key?: string;
  ca?: string;
  dpopProofProvider?: (input: {
    accessToken: string;
    method: "POST";
    url: string;
  }) => Promise<string> | string;
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
  readonly operationId: TenantProtocolOperationId | "consumeSyntheticMeteredResource";
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
  consumeSyntheticMeteredResource(
    request: {
      obligationId: string;
      quantity: string;
      idempotencyKey: string;
      requestId: string;
    },
    options?: ProductionAgentExecuteOptions
  ): Promise<{
    status: "consumed";
    providerId: string;
    resourceClass: "inference_tokens";
    measurementUnit: "token";
    quantity: string;
    unitPriceMinor: string;
    chargeMinor: string;
    consumedWindowMinor: string;
    remainingWindowMinor: string;
    maxChargePerWindowMinor: string;
    obligationId: string;
    usageEvidenceId: string;
    meteredUsageAdmissionId: string;
    ledgerTransactionId: string;
    replayed: boolean;
    nextAction: "review_metered_usage_receipt";
    sandboxOnly: true;
    productionFundsMoved: false;
    realFundsEnabled: false;
    schemaVersion: "ipo_one_synthetic_metered_resource_receipt.v1";
  }>;
}
