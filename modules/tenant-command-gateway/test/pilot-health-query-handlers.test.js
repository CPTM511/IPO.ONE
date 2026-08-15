import assert from "node:assert/strict";
import test from "node:test";
import { readPilotHealthQueryHandler } from "../src/pilot-health-query-handlers.js";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const AUTHORIZATION = Object.freeze({
  resourceType: "risk_portfolio",
  resourceId: "risk_portfolio_test"
});

function row(overrides = {}) {
  return {
    intent_count: "5",
    human_intent_count: "3",
    agent_intent_count: "2",
    offered_intent_count: "5",
    accepted_intent_count: "4",
    executed_intent_count: "3",
    repaid_intent_count: "2",
    fully_repaid_intent_count: "1",
    obligation_count: "4",
    open_position_count: "3",
    adverse_position_count: "1",
    ...overrides
  };
}

async function execute(projection = row(), overrides = {}) {
  let sql = null;
  const response = await readPilotHealthQueryHandler().execute({
    client: {
      async query(statement) {
        sql = statement;
        return { rows: [projection] };
      }
    },
    authorizationDecision: AUTHORIZATION,
    payload: {},
    now: NOW,
    ...overrides
  });
  return { response, sql };
}

test("Pilot health returns one bounded PII-free dual-native lifecycle view", async () => {
  const { response, sql } = await execute();
  assert.deepEqual(response, {
    portfolioId: "risk_portfolio_test",
    asOf: NOW.toISOString(),
    entryModes: {
      humanIntentCount: 3,
      agentIntentCount: 2,
      dualNativeObserved: true
    },
    funnel: {
      intentCount: 5,
      offeredIntentCount: 5,
      acceptedIntentCount: 4,
      executedIntentCount: 3,
      repaidIntentCount: 2,
      fullyRepaidIntentCount: 1
    },
    conversionBps: {
      offer: 10000,
      acceptance: 8000,
      execution: 6000,
      repayment: 4000,
      fullRepayment: 2000
    },
    positions: {
      obligationCount: 4,
      openPositionCount: 3,
      adversePositionCount: 1
    },
    readiness: {
      stage: "verified",
      dualNativeObserved: true,
      fullLifecycleObserved: true
    },
    safety: {
      readOnly: true,
      piiIncluded: false,
      thirdPartyAnalytics: false,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    schemaVersion: "tenant_pilot_health_view.v1"
  });
  assert.match(sql, /COUNT\(/);
  assert.doesNotMatch(JSON.stringify(response), /subjectId|principalId|actorId|authorityRef|email/i);
});

test("Pilot health reports empty and partial stages deterministically", async () => {
  const empty = await execute(row({
    intent_count: "0",
    human_intent_count: "0",
    agent_intent_count: "0",
    offered_intent_count: "0",
    accepted_intent_count: "0",
    executed_intent_count: "0",
    repaid_intent_count: "0",
    fully_repaid_intent_count: "0",
    obligation_count: "0",
    open_position_count: "0",
    adverse_position_count: "0"
  }));
  assert.equal(empty.response.readiness.stage, "empty");
  assert.deepEqual(Object.values(empty.response.conversionBps), [0, 0, 0, 0, 0]);

  const execution = await execute(row({
    intent_count: "2",
    human_intent_count: "2",
    agent_intent_count: "0",
    offered_intent_count: "2",
    accepted_intent_count: "1",
    executed_intent_count: "1",
    repaid_intent_count: "0",
    fully_repaid_intent_count: "0",
    obligation_count: "1",
    open_position_count: "1",
    adverse_position_count: "0"
  }));
  assert.equal(execution.response.readiness.stage, "execution");
  assert.equal(execution.response.readiness.dualNativeObserved, false);
});

test("Pilot health rejects invalid payloads, resources, and clocks before querying", async () => {
  let calls = 0;
  const client = { async query() { calls += 1; return { rows: [row()] }; } };
  for (const input of [null, [], { unexpected: true }]) {
    await assert.rejects(
      readPilotHealthQueryHandler().execute({
        client,
        authorizationDecision: AUTHORIZATION,
        payload: input,
        now: NOW
      }),
      (error) => error.code === "invalid_tenant_command_payload"
    );
  }
  await assert.rejects(
    readPilotHealthQueryHandler().execute({
      client,
      authorizationDecision: { resourceType: "subject", resourceId: "subject_test" },
      payload: {},
      now: NOW
    }),
    (error) => error.code === "tenant_resource_unavailable"
  );
  await assert.rejects(
    readPilotHealthQueryHandler().execute({
      client,
      authorizationDecision: AUTHORIZATION,
      payload: {},
      now: new Date("invalid")
    }),
    (error) => error.code === "invalid_tenant_command_clock"
  );
  assert.equal(calls, 0);
});

test("Pilot health fails closed on malformed or non-monotonic projections", async () => {
  for (const projection of [
    row({ intent_count: "01" }),
    row({ agent_intent_count: "3" }),
    row({ accepted_intent_count: "6" }),
    row({ repaid_intent_count: "4" }),
    row({ adverse_position_count: "5" }),
    row({ intent_count: String(Number.MAX_SAFE_INTEGER + 1) })
  ]) {
    await assert.rejects(
      execute(projection),
      (error) => error.code === "invalid_pilot_health_projection"
    );
  }
  await assert.rejects(
    readPilotHealthQueryHandler().execute({
      client: { async query() { return { rows: [] }; } },
      authorizationDecision: AUTHORIZATION,
      payload: {},
      now: NOW
    }),
    (error) => error.code === "invalid_pilot_health_projection"
  );
});
