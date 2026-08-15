import {
  assertTenantProtocolRequest,
  assertTenantProtocolResult
} from "@ipo-one/api-contract";

export const TRADING_CAPITAL_OPERATION_IDS = Object.freeze([
  "tradingCreateAccountBindingChallenge",
  "tradingImportHyperliquidHistory",
  "tradingFinalizeEvidenceSnapshot",
  "tradingReadCreditProfile",
  "tradingCreateCapitalRequest",
  "tradingCreateProviderMandate",
  "tradingListCompatibleMandates",
  "tradingCreateMatchProposal",
  "tradingAcceptMatchAsProvider",
  "tradingAcceptMatchAsSubject",
  "tradingCreateFacility",
  "tradingContributeSubjectCollateral",
  "tradingRecordProviderFunding",
  "tradingActivateFacility",
  "tradingSubmitOrderIntent",
  "tradingCancelOrderIntent",
  "tradingReadFacilityState",
  "tradingEvaluateRisk",
  "tradingPauseNewRisk",
  "tradingFlattenFacility",
  "tradingRequestClose",
  "tradingRunSettlement",
  "tradingReadSettlement",
  "tradingIssuePerformanceProof",
  "tradingReadFacilityEvidence"
]);

export const TRADING_CAPITAL_ROLE_OPERATIONS = Object.freeze({
  human: Object.freeze([
    ...TRADING_CAPITAL_OPERATION_IDS.slice(0, 5),
    "tradingListCompatibleMandates",
    "tradingCreateMatchProposal",
    "tradingAcceptMatchAsSubject",
    "tradingCreateFacility",
    "tradingContributeSubjectCollateral",
    "tradingActivateFacility",
    "tradingSubmitOrderIntent",
    "tradingCancelOrderIntent",
    "tradingReadFacilityState",
    "tradingRequestClose",
    "tradingReadSettlement",
    "tradingIssuePerformanceProof",
    "tradingReadFacilityEvidence"
  ]),
  agent: Object.freeze([
    ...TRADING_CAPITAL_OPERATION_IDS.slice(0, 5),
    "tradingListCompatibleMandates",
    "tradingCreateMatchProposal",
    "tradingAcceptMatchAsSubject",
    "tradingCreateFacility",
    "tradingContributeSubjectCollateral",
    "tradingActivateFacility",
    "tradingSubmitOrderIntent",
    "tradingCancelOrderIntent",
    "tradingReadFacilityState",
    "tradingRequestClose",
    "tradingReadSettlement",
    "tradingIssuePerformanceProof",
    "tradingReadFacilityEvidence"
  ]),
  provider: Object.freeze([
    "tradingCreateProviderMandate",
    "tradingAcceptMatchAsProvider",
    "tradingRecordProviderFunding",
    "tradingReadFacilityState",
    "tradingReadSettlement",
    "tradingIssuePerformanceProof",
    "tradingReadFacilityEvidence"
  ]),
  risk_operator: Object.freeze([
    "tradingEvaluateRisk",
    "tradingPauseNewRisk",
    "tradingFlattenFacility"
  ]),
  operations_operator: Object.freeze([
    "tradingEvaluateRisk",
    "tradingPauseNewRisk",
    "tradingFlattenFacility"
  ]),
  system_worker: Object.freeze(["tradingRunSettlement"])
});

const ACTOR_TYPES = new Set(Object.keys(TRADING_CAPITAL_ROLE_OPERATIONS));
const OPERATION_IDS = new Set(TRADING_CAPITAL_OPERATION_IDS);

function plainObject(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  return true;
}

export class IpoOneTradingCapitalSdkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IpoOneTradingCapitalSdkError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new IpoOneTradingCapitalSdkError(code, message);
}

export class IpoOneTradingCapitalClient {
  #execute;
  #actorType;
  #allowedOperations;

  constructor({ execute, actorType, transportProfile }) {
    if (
      typeof execute !== "function" ||
      !ACTOR_TYPES.has(actorType) ||
      transportProfile !== "local_in_process"
    ) {
      fail(
        "invalid_trading_capital_sdk_config",
        "Trading Capital SDK configuration is invalid"
      );
    }
    this.#execute = execute;
    this.#actorType = actorType;
    this.#allowedOperations = new Set(
      TRADING_CAPITAL_ROLE_OPERATIONS[actorType]
    );
  }

  get actorType() {
    return this.#actorType;
  }

  listOperations() {
    return [...this.#allowedOperations];
  }

  async executeOperation(request) {
    if (
      !plainObject(request) ||
      !OPERATION_IDS.has(request?.operationId) ||
      !this.#allowedOperations.has(request.operationId)
    ) {
      fail(
        "trading_capital_sdk_scope_denied",
        "Trading Capital operation is not available for this SDK role"
      );
    }
    try {
      assertTenantProtocolRequest(request);
    } catch {
      fail(
        "invalid_trading_capital_sdk_request",
        "Trading Capital request does not satisfy the closed Tenant contract"
      );
    }
    const result = await this.#execute(request);
    try {
      assertTenantProtocolResult(result);
    } catch {
      fail(
        "invalid_trading_capital_sdk_result",
        "Trading Capital result does not satisfy the closed Tenant contract"
      );
    }
    if (result.operationId !== request.operationId) {
      fail(
        "trading_capital_sdk_operation_drift",
        "Trading Capital response operation changed"
      );
    }
    return structuredClone(result);
  }
}
