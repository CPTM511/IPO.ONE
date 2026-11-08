import {
  DomainError, CreditEventType, SYNTHETIC_COLLATERAL_PROFILE,
  createSyntheticCollateralTerms, createCreditEvent, transitionSyntheticCollateral
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import { loadObligationContext } from "./credit-execution-handlers.js";
import { summarizeSharedObligation } from "./credit-acceptance-handlers.js";
import {
  normalizeEconomicActionConfirmation, sha256Json, summarizeEconomicActionConfirmation
} from "./economic-action-confirmation.js";

const KEYS = ["expectedVersion", "termsHash", "chainId", "amountAssets", "actionConfirmation"];

function command(action, enabled) {
  const operationId = action === "confirm"
    ? "pilotConfirmSyntheticCollateral" : "pilotReleaseSyntheticCollateral";
  return Object.freeze({
    operationId, kind: "command",
    async plan(input) {
      if (!enabled && action === "confirm") throw new DomainError("synthetic_collateral_disabled", "Synthetic collateral is not enabled in this environment");
      const { payload, client, coreRepository, authenticationContext, requestId, correlationId, now } = input;
      if (!payload || Object.keys(payload).length !== KEYS.length ||
        KEYS.some(key => !Object.hasOwn(payload, key)) ||
        !Number.isSafeInteger(payload.expectedVersion) || payload.expectedVersion < 0) {
        throw new DomainError("invalid_tenant_command_payload", "The exact synthetic collateral confirmation is required");
      }
      const { state, obligation } = await loadObligationContext({
        ...input, operation: action === "confirm" ? "execute" : "repay"
      });
      const { actionConfirmation: _confirmation, ...businessPayload } = payload;
      const confirmation = normalizeEconomicActionConfirmation(payload.actionConfirmation, {
        operationId, resource: { resourceType: "obligation", resourceId: obligation.obligationId },
        resourceHash: obligation.obligationHash, payloadHash: sha256Json(businessPayload),
        businessPayload, requestId, authenticationContext, now
      });
      const result = transitionSyntheticCollateral(obligation, { action, ...businessPayload, now });
      const event = createCreditEvent({
        eventType: action === "confirm"
          ? CreditEventType.SYNTHETIC_COLLATERAL_CONFIRMED : CreditEventType.SYNTHETIC_COLLATERAL_RELEASED,
        subjectId: obligation.subjectId, obligationId: obligation.obligationId,
        payload: {
          ...result.receipt, actorId: authenticationContext.actorId,
          causationId: requestId, correlationId,
          actionConfirmation: summarizeEconomicActionConfirmation(confirmation)
        }, now
      });
      return {
        aggregateType: "obligation", aggregateId: obligation.obligationId,
        events: [{ aggregateType: "obligation", aggregateId: obligation.obligationId,
          expectedVersion: state.aggregateVersion, event }],
        writes: [{ type: CoreProjectionType.OBLIGATION, value: result.obligation, eventId: event.eventId }],
        response: {
          obligation: summarizeSharedObligation(result.obligation), receipt: result.receipt,
          syntheticOnly: true, productionFundsMoved: false, transactionHash: null,
          schemaVersion: action === "confirm" ? "tenant_synthetic_collateral_confirmed.v1" : "tenant_synthetic_collateral_released.v1"
        }
      };
    }
  });
}

export function createSyntheticCollateralHandlers({ syntheticCollateralEnabled = false } = {}) {
  const enabled = syntheticCollateralEnabled === true;
  return Object.freeze([
    {
      operationId: "pilotReadSyntheticCollateralProfile", kind: "query",
      async execute({ payload }) {
        if (!payload || Object.keys(payload).length) {
          throw new DomainError("invalid_tenant_command_payload", "Collateral profile query requires an empty payload");
        }
        return {
          enabled, profile: SYNTHETIC_COLLATERAL_PROFILE,
          exampleTerms: createSyntheticCollateralTerms({
            profile: SYNTHETIC_COLLATERAL_PROFILE,
            assetId: "urn:ipo-one:sandbox-asset:usd-cent", principalMinor: "12000"
          }),
          syntheticOnly: true, productionFundsMoved: false, transactionHash: null,
          schemaVersion: "tenant_synthetic_collateral_profile.v1"
        };
      }
    },
    command("confirm", enabled), command("release", enabled)
  ]);
}
