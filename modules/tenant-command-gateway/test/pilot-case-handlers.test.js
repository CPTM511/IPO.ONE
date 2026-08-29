import assert from "node:assert/strict";
import test from "node:test";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  filePilotCaseCommandHandler,
  listOwnPilotCasesQueryHandler,
  readPilotCaseQueueQueryHandler,
  transitionPilotCaseCommandHandler
} from "../src/pilot-case-handlers.js";

const NOW = new Date("2026-08-29T01:00:00.000Z");
const HASH = `0x${"3".repeat(64)}`;
const payload = Object.freeze({
  targetType: "decision",
  targetId: "risk_decision_case_fixture",
  reasonCode: "context_missing",
  schemaVersion: "pilot_case_file.v1"
});

function referenceHasher() {
  return { hash: () => Buffer.alloc(32, 3).toString("base64url") };
}

function repository() {
  return {
    async countPilotCasesForCapacityInTransaction() { return 0; },
    async getProjectionStateInTransaction(_client, type, id) {
      if (type === CoreProjectionType.SUBJECT && id === "subject_case_fixture") {
        return { aggregateVersion: 1, value: {
          subjectId: id,
          subjectType: "human",
          status: "active",
          prototypeOnly: true
        } };
      }
      if (type === CoreProjectionType.RISK_DECISION && id === payload.targetId) {
        return { aggregateVersion: 1, entityHash: HASH, value: {
          riskDecisionId: id,
          subjectId: "subject_case_fixture"
        } };
      }
      return undefined;
    },
    async listPilotCasesForSubjectInTransaction() { return []; },
    async listPilotCaseQueueInTransaction() { return []; }
  };
}

function fileContext(overrides = {}) {
  return {
    client: {},
    coreRepository: repository(),
    authenticationContext: { actorId: "actor_case_fixture", actorType: ActorType.HUMAN },
    authorizationDecision: { resourceType: "subject", resourceId: "subject_case_fixture" },
    referenceHasher: referenceHasher(),
    payload,
    now: NOW,
    requestId: "request-pilot-case-file-0001",
    correlationId: "correlation-pilot-case-file-0001",
    ...overrides
  };
}

test("Human case filing creates one immutable, non-economic projection and closed response", async () => {
  const plan = await filePilotCaseCommandHandler().plan(fileContext());
  assert.equal(plan.events.length, 1);
  assert.equal(plan.events[0].event.eventType, "pilot_case_filed");
  assert.equal(plan.writes[0].type, CoreProjectionType.PILOT_CASE);
  assert.equal(plan.writes[0].value.status, "open");
  assert.deepEqual(plan.resourceBaselines, { pilot_cases: 0 });
  assert.equal(plan.response.pilotCase.safety.originalRecordImmutable, true);
  assert.equal(plan.response.pilotCase.safety.economicMutationAuthorized, false);
  assert.doesNotMatch(JSON.stringify(plan.response), /actor_case_fixture|filerActorRefHash|email|wallet/i);
});

test("case filing rejects free text and cross-Subject targets", async () => {
  assert.throws(
    () => filePilotCaseCommandHandler().preflight({ payload: { ...payload, note: "call me" } }),
    (error) => error.code === "invalid_pilot_case"
  );
  await assert.rejects(
    filePilotCaseCommandHandler().plan(fileContext({
      coreRepository: {
        ...repository(),
        async getProjectionStateInTransaction(_client, type, id) {
          if (type === CoreProjectionType.SUBJECT) return repository().getProjectionStateInTransaction(_client, type, id);
          return { aggregateVersion: 1, entityHash: HASH, value: {
            riskDecisionId: payload.targetId,
            subjectId: "subject_other"
          } };
        }
      }
    })),
    (error) => error.code === "tenant_resource_unavailable"
  );
});

test("case queue is privacy-safe and transition remains additive", async () => {
  const filed = (await filePilotCaseCommandHandler().plan(fileContext())).writes[0].value;
  const queueRepository = {
    ...repository(),
    async listPilotCasesForSubjectInTransaction() { return [filed]; },
    async listPilotCaseQueueInTransaction() { return [filed]; }
  };
  const own = await listOwnPilotCasesQueryHandler().execute({
    client: {}, coreRepository: queueRepository,
    authenticationContext: { actorId: "actor_case_fixture", actorType: ActorType.HUMAN },
    authorizationDecision: { resourceType: "subject", resourceId: "subject_case_fixture" },
    payload: {}
  });
  assert.equal(own.items[0].subjectId, undefined);
  const queue = await readPilotCaseQueueQueryHandler().execute({
    client: {}, coreRepository: queueRepository,
    authorizationDecision: { resourceType: "risk_portfolio", resourceId: "risk_portfolio_case" },
    payload: {}, now: NOW
  });
  assert.equal(queue.items[0].subjectId, "subject_case_fixture");
  assert.equal(queue.safety.freeTextIncluded, false);

  const transitionRepository = {
    ...repository(),
    async getProjectionStateInTransaction(_client, type) {
      if (type === CoreProjectionType.PILOT_CASE) return {
        rootAggregateType: "pilot_case",
        rootAggregateId: filed.pilotCaseId,
        aggregateVersion: 1,
        value: filed
      };
      return undefined;
    }
  };
  const assignedPlan = await transitionPilotCaseCommandHandler().plan({
    client: {}, coreRepository: transitionRepository,
    authenticationContext: { actorId: "actor_risk_case", actorType: ActorType.HUMAN },
    authorizationDecision: { resourceType: "pilot_case", resourceId: filed.pilotCaseId },
    referenceHasher: referenceHasher(),
    payload: { transition: "assign", schemaVersion: "pilot_case_transition.v1" },
    now: new Date("2026-08-29T01:01:00.000Z"),
    requestId: "request-pilot-case-assign-0001",
    correlationId: "correlation-pilot-case-assign-0001"
  });
  const assigned = assignedPlan.writes[0].value;
  assert.equal(assigned.status, "assigned");
  assert.equal(assigned.targetRefHash, filed.targetRefHash);

  transitionRepository.getProjectionStateInTransaction = async (_client, type) =>
    type === CoreProjectionType.PILOT_CASE ? {
      rootAggregateType: "pilot_case", rootAggregateId: filed.pilotCaseId,
      aggregateVersion: 2, value: assigned
    } : undefined;
  const correctedPlan = await transitionPilotCaseCommandHandler().plan({
    client: {}, coreRepository: transitionRepository,
    authenticationContext: { actorId: "actor_risk_case", actorType: ActorType.HUMAN },
    authorizationDecision: { resourceType: "pilot_case", resourceId: filed.pilotCaseId },
    referenceHasher: referenceHasher(),
    payload: {
      transition: "correct",
      correctionCode: "status_context_added",
      schemaVersion: "pilot_case_transition.v1"
    },
    now: new Date("2026-08-29T01:02:00.000Z"),
    requestId: "request-pilot-case-correct-0001",
    correlationId: "correlation-pilot-case-correct-0001"
  });
  const corrected = correctedPlan.writes[0].value;
  assert.equal(corrected.status, "resolved_corrected");
  assert.equal(corrected.correction.originalTargetRefHash, filed.targetRefHash);
  assert.equal(corrected.economicMutationAuthorized, false);
});
