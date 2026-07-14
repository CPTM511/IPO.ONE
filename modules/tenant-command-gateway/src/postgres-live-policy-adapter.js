import {
  DomainError,
  SubjectStatus,
  SubjectType
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const ALLOWED_DRAFT_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);

export function createPostgresTenantLivePolicyAdapter({ client, coreRepository, handler }) {
  if (!client?.query || !coreRepository?.getProjectionStateInTransaction || !handler?.operationId) {
    throw new DomainError("invalid_tenant_live_policy_adapter", "live policy adapter dependencies are invalid");
  }
  return Object.freeze({
    async evaluate({ policy, resource }) {
      if (
        handler.operationId !== "pilotCreateDraftMandate" ||
        policy.operationId !== handler.operationId ||
        policy.liveChecks.length !== 1 ||
        policy.liveChecks[0] !== "subject_state" ||
        resource?.resourceType !== "subject"
      ) {
        throw new DomainError("authorization_live_policy_rejected", "live policy is unavailable");
      }
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
  });
}
