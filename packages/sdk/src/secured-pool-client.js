import {
  assertTenantProtocolRequest,
  assertTenantProtocolResult
} from "@ipo-one/api-contract";

export const SECURED_POOL_AGENT_OPERATION_IDS = Object.freeze([
  "pilotReadOwnSecuredPool",
  "pilotReviewSecuredPoolAction"
]);

const OPERATION_IDS = new Set(SECURED_POOL_AGENT_OPERATION_IDS);

export class IpoOneSecuredPoolSdkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IpoOneSecuredPoolSdkError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new IpoOneSecuredPoolSdkError(code, message);
}

export class IpoOneSecuredPoolClient {
  #execute;

  constructor({ execute, transportProfile }) {
    if (typeof execute !== "function" || transportProfile !== "local_in_process") {
      fail("invalid_secured_pool_sdk_config", "Secured Pool SDK configuration is invalid");
    }
    this.#execute = execute;
  }

  listOperations() {
    return [...SECURED_POOL_AGENT_OPERATION_IDS];
  }

  async executeOperation(request) {
    if (!request || typeof request !== "object" || !OPERATION_IDS.has(request.operationId)) {
      fail("secured_pool_sdk_scope_denied", "Secured Pool operation is outside the Agent SDK scope");
    }
    try {
      assertTenantProtocolRequest(request);
    } catch {
      fail("invalid_secured_pool_sdk_request", "Secured Pool request does not satisfy the closed Tenant contract");
    }
    const result = await this.#execute(request);
    try {
      assertTenantProtocolResult(result);
    } catch {
      fail("invalid_secured_pool_sdk_result", "Secured Pool result does not satisfy the closed Tenant contract");
    }
    if (result.operationId !== request.operationId) {
      fail("secured_pool_sdk_operation_drift", "Secured Pool response operation changed");
    }
    if (result.response?.productionFundsMoved !== false) {
      fail("secured_pool_sdk_safety_drift", "Secured Pool response lost the no-funds safety declaration");
    }
    return structuredClone(result);
  }
}
