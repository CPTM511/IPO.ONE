import {
  DomainError,
  MandateStatus,
  SubjectStatus,
  SubjectType
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const ALLOWED_DRAFT_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);
const FREEZABLE_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);

function hasExactChecks(policy, checks) {
  return (
    policy.liveChecks.length === checks.length &&
    checks.every((check, index) => policy.liveChecks[index] === check)
  );
}

export function createPostgresTenantLivePolicyAdapter({ client, coreRepository, handler }) {
  if (!client?.query || !coreRepository?.getProjectionStateInTransaction || !handler?.operationId) {
    throw new DomainError("invalid_tenant_live_policy_adapter", "live policy adapter dependencies are invalid");
  }
  return Object.freeze({
    async evaluate({ policy, resource }) {
      if (policy.operationId !== handler.operationId) {
        throw new DomainError("authorization_live_policy_rejected", "live policy is unavailable");
      }

      if (
        handler.operationId === "pilotCreateDraftMandate" &&
        hasExactChecks(policy, ["subject_state"]) &&
        resource?.resourceType === "subject"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.SUBJECT,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state ||
          state.value.subjectType !== SubjectType.AGENT ||
          !ALLOWED_DRAFT_SUBJECT_STATUSES.has(state.value.status)
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Subject state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["subject_state"])
        });
      }

      if (
        handler.operationId === "pilotRevokeDraftMandate" &&
        hasExactChecks(policy, ["mandate_state"]) &&
        resource?.resourceType === "mandate"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.MANDATE,
          resource.resourceId,
          { lock: true }
        );
        if (!state || state.value.status !== MandateStatus.DRAFT) {
          throw new DomainError("authorization_live_policy_rejected", "live Mandate state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["mandate_state"])
        });
      }

      if (
        handler.operationId === "pilotFreezeSubject" &&
        hasExactChecks(policy, ["risk", "freeze"]) &&
        resource?.resourceType === "subject"
      ) {
        const state = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.SUBJECT,
          resource.resourceId,
          { lock: true }
        );
        if (
          !state ||
          state.value.subjectType !== SubjectType.AGENT ||
          !FREEZABLE_SUBJECT_STATUSES.has(state.value.status)
        ) {
          throw new DomainError("authorization_live_policy_rejected", "live Subject state rejected the operation");
        }
        return Object.freeze({
          liveStateVersion: state.aggregateVersion,
          evaluatedChecks: Object.freeze(["risk", "freeze"])
        });
      }

      throw new DomainError("authorization_live_policy_rejected", "live policy is unavailable");
    }
  });
}
