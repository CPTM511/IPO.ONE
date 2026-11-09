import { CoreProjectionType } from "../../persistence/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import {
  summarizeServicingAction,
  summarizeSharedObligation
} from "./credit-acceptance-handlers.js";

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

export function readOwnedObligationQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadOwnObligation",
    kind: "query",
    async execute({ client, coreRepository, resource, payload, now }) {
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.keys(payload).length !== 0 ||
        resource?.resourceType !== "obligation" ||
        !(now instanceof Date) ||
        !Number.isFinite(now.getTime())
      ) unavailable();

      const obligation = await coreRepository.getObligationInTransaction(
        client,
        resource.resourceId,
        { lock: false }
      );
      if (
        !obligation ||
        obligation.obligationId !== resource.resourceId ||
        obligation.schemaVersion !== "obligation.v2" ||
        obligation.sandboxOnly !== true ||
        obligation.productionFundsMoved !== false
      ) unavailable();

      const latestServicingAction =
        await coreRepository.findLatestSandboxServicingActionInTransaction(
          client,
          obligation.obligationId
        );
      if (
        latestServicingAction &&
        (latestServicingAction.obligationId !== obligation.obligationId ||
          latestServicingAction.schemaVersion !== "sandbox_servicing_action.v1" ||
          latestServicingAction.sandboxOnly !== true ||
          latestServicingAction.productionFundsMoved !== false)
      ) {
        throw new DomainError(
          "projection_integrity_mismatch",
          "Owned Obligation projections are inconsistent"
        );
      }

      const sourceId=obligation.syntheticFees?.lastSourceCorrectionReceiptId;
      const source=sourceId?await coreRepository.getProjectionInTransaction(client,CoreProjectionType.SYNTHETIC_FEE_SOURCE_CORRECTION,sourceId):null;
      const sourceCurrent=source?.obligationId===obligation.obligationId && source.receiptId===sourceId &&
        source.effects.nextOutstandingPrincipalMinor===obligation.outstandingPrincipalMinor &&
        source.effects.nextOutstandingInterestMinor===obligation.outstandingInterestMinor &&
        source.effects.nextOutstandingFeesMinor===obligation.outstandingFeesMinor &&
        source.effects.scheduleSequenceAfter===obligation.scheduleSequence && source.effects.scheduleHashAfter===obligation.scheduleHash &&
        (!latestServicingAction || source.effectiveAt>=latestServicingAction.effectiveAt);
      return {
        obligation: summarizeSharedObligation(obligation),
        ...(sourceCurrent?{latestSourceCorrection:source}:{}),
        ...(!sourceCurrent && latestServicingAction
          ? { latestServicingAction: summarizeServicingAction(latestServicingAction) }
          : {}),
        asOf: now.toISOString(),
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false,
        schemaVersion: "tenant_owned_obligation_view.v1"
      };
    }
  });
}

export function createOwnedObligationQueryHandlers() {
  return Object.freeze([readOwnedObligationQueryHandler()]);
}
