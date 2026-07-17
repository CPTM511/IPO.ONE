import assert from "node:assert/strict";
import test from "node:test";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  readPilotFeedbackSummaryQueryHandler,
  submitPilotFeedbackCommandHandler
} from "../src/pilot-feedback-handlers.js";

const NOW = new Date("2026-07-17T13:00:00.000Z");
const HUMAN_PAYLOAD = Object.freeze({
  surface: "human_application",
  lifecycleStage: "application",
  sentiment: "easy",
  outcome: "completed",
  blockerCode: "none",
  schemaVersion: "pilot_feedback_record.v1"
});

const DIMENSIONS = {
  entryModes: { human: "human", agent: "agent" },
  surfaces: {
    humanPortfolio: "human_portfolio",
    humanApplication: "human_application",
    humanOffer: "human_offer",
    humanPayments: "human_payments",
    agentProtocol: "agent_protocol",
    agentSdk: "agent_sdk",
    agentMcp: "agent_mcp",
    evidence: "evidence",
    servicing: "servicing"
  },
  lifecycleStages: {
    onboarding: "onboarding",
    application: "application",
    offer: "offer",
    obligation: "obligation",
    execution: "execution",
    repayment: "repayment",
    servicing: "servicing",
    evidence: "evidence"
  },
  sentiments: {
    blocked: "blocked",
    difficult: "difficult",
    neutral: "neutral",
    easy: "easy",
    valuable: "valuable"
  },
  outcomes: { incomplete: "incomplete", completed: "completed", needsSupport: "needs_support" },
  blockerCodes: {
    none: "none",
    unclearCopy: "unclear_copy",
    missingCapability: "missing_capability",
    authentication: "authentication",
    authoritySetup: "authority_setup",
    identityProof: "identity_proof",
    creditTerms: "credit_terms",
    execution: "execution",
    repayment: "repayment",
    servicing: "servicing",
    evidence: "evidence",
    integration: "integration",
    otherNoText: "other_no_text"
  }
};

function alias(group, key) {
  const snake = (value) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return `${snake(group)}_${snake(key)}`;
}

function summaryRow(selections = {}) {
  const row = { total_count: "1" };
  for (const [group, codes] of Object.entries(DIMENSIONS)) {
    for (const [key, code] of Object.entries(codes)) {
      row[alias(group, key)] = selections[group] === code ? "1" : "0";
    }
  }
  return row;
}

test("Human and Agent feedback share one closed, non-funds command projection", async () => {
  let capacityCalls = 0;
  const coreRepository = {
    async countPilotFeedbackRecordsForCapacityInTransaction() {
      capacityCalls += 1;
      return 4;
    },
    async getProjectionStateInTransaction() {
      return {
        aggregateVersion: 1,
        value: {
          subjectId: "subject_human_feedback",
          subjectType: "human",
          status: "active",
          prototypeOnly: true
        }
      };
    }
  };
  const plan = await submitPilotFeedbackCommandHandler().plan({
    client: {},
    coreRepository,
    payload: HUMAN_PAYLOAD,
    authenticationContext: {
      actorId: "actor_human_feedback",
      actorType: "human"
    },
    authorizationDecision: {
      resourceType: "subject",
      resourceId: "subject_human_feedback"
    },
    now: NOW,
    requestId: "request-feedback-human-0001",
    correlationId: "correlation-feedback-human-0001"
  });

  assert.equal(capacityCalls, 1);
  assert.deepEqual(plan.resourceBaselines, { pilot_feedback_records: 4 });
  assert.equal(plan.events.length, 1);
  assert.equal(plan.events[0].event.eventType, "pilot_feedback_recorded");
  assert.equal(plan.writes.length, 1);
  assert.equal(plan.writes[0].type, CoreProjectionType.PILOT_FEEDBACK_RECORD);
  assert.equal(plan.writes[0].value.subjectId, "subject_human_feedback");
  assert.equal(plan.writes[0].value.entryMode, "human");
  assert.equal(plan.writes[0].value.sandboxOnly, true);
  assert.equal(plan.writes[0].value.productionAuthority, false);
  assert.deepEqual(plan.response, {
    entryMode: "human",
    surface: "human_application",
    lifecycleStage: "application",
    sentiment: "easy",
    outcome: "completed",
    blockerCode: "none",
    recordedAt: NOW.toISOString(),
    safety: {
      categoricalOnly: true,
      piiIncluded: false,
      thirdPartyAnalytics: false,
      sandboxOnly: true,
      productionAuthority: false
    },
    schemaVersion: "tenant_pilot_feedback_recorded.v1"
  });
  assert.doesNotMatch(
    JSON.stringify(plan.response),
    /subjectId|actorId|principalId|feedbackId|feedbackHash|email|wallet/i
  );
});

test("feedback rejects unknown fields, free text, mode mismatch, and inconsistent blockers", async () => {
  const base = {
    client: {},
    coreRepository: {
      async countPilotFeedbackRecordsForCapacityInTransaction() { return 0; },
      async getProjectionStateInTransaction() {
        return {
          aggregateVersion: 1,
          value: {
            subjectId: "subject_human_feedback",
            subjectType: "human",
            status: "active",
            prototypeOnly: true
          }
        };
      }
    },
    authenticationContext: { actorId: "actor_human_feedback", actorType: "human" },
    authorizationDecision: { resourceType: "subject", resourceId: "subject_human_feedback" },
    now: NOW,
    requestId: "request-feedback-invalid-0001",
    correlationId: "correlation-feedback-invalid-0001"
  };
  for (const payload of [
    { ...HUMAN_PAYLOAD, comment: "contact me" },
    { ...HUMAN_PAYLOAD, surface: "agent_mcp" },
    { ...HUMAN_PAYLOAD, sentiment: "blocked" },
    { ...HUMAN_PAYLOAD, outcome: "completed", blockerCode: "credit_terms" }
  ]) {
    await assert.rejects(
      submitPilotFeedbackCommandHandler().plan({ ...base, payload }),
      (error) => error.code === "invalid_tenant_command_payload"
    );
  }
});

test("feedback summary returns only consistent tenant aggregates", async () => {
  const row = summaryRow({
    entryModes: "human",
    surfaces: "human_application",
    lifecycleStages: "application",
    sentiments: "easy",
    outcomes: "completed",
    blockerCodes: "none"
  });
  const response = await readPilotFeedbackSummaryQueryHandler().execute({
    client: { async query() { return { rows: [row] }; } },
    authorizationDecision: {
      resourceType: "risk_portfolio",
      resourceId: "risk_portfolio_feedback"
    },
    payload: {},
    now: NOW
  });
  assert.equal(response.totalCount, 1);
  assert.deepEqual(response.entryModes, { humanCount: 1, agentCount: 0 });
  assert.equal(response.surfaces.humanApplicationCount, 1);
  assert.equal(response.sentiments.easyCount, 1);
  assert.equal(response.outcomes.completedCount, 1);
  assert.equal(response.blockerCodes.noneCount, 1);
  assert.deepEqual(response.safety, {
    aggregateOnly: true,
    piiIncluded: false,
    identifiersIncluded: false,
    thirdPartyAnalytics: false,
    sandboxOnly: true,
    productionFundsMoved: false
  });
  assert.doesNotMatch(
    JSON.stringify(response),
    /subjectId|actorId|principalId|feedbackId|eventId|wallet|email/i
  );
});

test("feedback summary fails closed on malformed dimensions", async () => {
  const valid = summaryRow({
    entryModes: "human",
    surfaces: "human_application",
    lifecycleStages: "application",
    sentiments: "easy",
    outcomes: "completed",
    blockerCodes: "none"
  });
  for (const row of [
    { ...valid, entry_modes_human: "0" },
    { ...valid, sentiments_easy: "01" },
    { ...valid, total_count: String(Number.MAX_SAFE_INTEGER + 1) }
  ]) {
    await assert.rejects(
      readPilotFeedbackSummaryQueryHandler().execute({
        client: { async query() { return { rows: [row] }; } },
        authorizationDecision: {
          resourceType: "risk_portfolio",
          resourceId: "risk_portfolio_feedback"
        },
        payload: {},
        now: NOW
      }),
      (error) => error.code === "invalid_pilot_feedback_projection"
    );
  }
});
