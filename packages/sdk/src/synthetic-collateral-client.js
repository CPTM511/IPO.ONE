import {
  assertTenantProtocolRequest,
  assertTenantProtocolResult
} from "@ipo-one/api-contract";

export const SYNTHETIC_COLLATERAL_AGENT_OPERATION_IDS = Object.freeze([
  "pilotReadSyntheticCollateralProfile",
  "pilotConfirmSyntheticCollateral",
  "pilotReleaseSyntheticCollateral"
]);

const OPERATION_IDS = new Set(SYNTHETIC_COLLATERAL_AGENT_OPERATION_IDS);

export class IpoOneSyntheticCollateralSdkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IpoOneSyntheticCollateralSdkError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new IpoOneSyntheticCollateralSdkError(code, message);
}

export class IpoOneSyntheticCollateralClient {
  #execute;

  constructor({ execute, transportProfile }) {
    if (typeof execute !== "function" || transportProfile !== "local_in_process") {
      fail("invalid_synthetic_collateral_sdk_config", "Synthetic collateral SDK configuration is invalid");
    }
    this.#execute = execute;
  }

  listOperations() {
    return [...SYNTHETIC_COLLATERAL_AGENT_OPERATION_IDS];
  }

  async executeOperation(request) {
    if (!request || typeof request !== "object" || !OPERATION_IDS.has(request.operationId)) {
      fail("synthetic_collateral_sdk_scope_denied", "Synthetic collateral operation is outside the Agent SDK scope");
    }
    try {
      assertTenantProtocolRequest(request);
    } catch {
      fail("invalid_synthetic_collateral_sdk_request", "Synthetic collateral request does not satisfy the closed Tenant contract");
    }
    const result = await this.#execute(request);
    try {
      assertTenantProtocolResult(result);
    } catch {
      fail("invalid_synthetic_collateral_sdk_result", "Synthetic collateral result does not satisfy the closed Tenant contract");
    }
    if (result.operationId !== request.operationId) {
      fail("synthetic_collateral_sdk_operation_drift", "Synthetic collateral response operation changed");
    }
    if (request.operationId !== "pilotReadSyntheticCollateralProfile" && (
      result.response?.obligation?.obligationId !== request.resource?.resourceId ||
      result.response?.receipt?.obligationId !== request.resource?.resourceId ||
      result.response?.receipt?.termsHash !== request.payload?.termsHash ||
      result.response?.receipt?.chainId !== request.payload?.chainId ||
      result.response?.receipt?.amountAssets !== request.payload?.amountAssets ||
      result.response?.receipt?.previousVersion !== request.payload?.expectedVersion ||
      result.response?.obligation?.syntheticCollateral?.lastReceipt?.receiptId !== result.response?.receipt?.receiptId
    )) fail("synthetic_collateral_resource_drift", "Synthetic collateral receipt does not match the requested Obligation");
    if (result.response?.productionFundsMoved !== false) {
      fail("synthetic_collateral_sdk_safety_drift", "Synthetic collateral response lost the no-funds safety declaration");
    }
    return structuredClone(result);
  }
}
