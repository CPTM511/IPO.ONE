import assert from "node:assert/strict";
import { IpoOneClient } from "../packages/sdk/src/index.js";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const client = new IpoOneClient({ baseUrl });
const isolatedClientA = new IpoOneClient({ baseUrl, sandboxSessionId: "smoke_isolation_session_a" });
const isolatedClientB = new IpoOneClient({ baseUrl, sandboxSessionId: "smoke_isolation_session_b" });

await isolatedClientA.resetDemo();
await isolatedClientB.resetDemo();
const isolatedAgent = await isolatedClientA.createAgent({ displayName: "Isolated Agent" });
const isolatedPeerState = await isolatedClientB.getDemoState();

await client.resetDemo();
const initialState = await client.getDemoState();
const missingAgent = await fetch(`${baseUrl}/v1/agents/missing-agent/lockbox`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-request-id": "smoke-request-agent" },
  body: "{}"
});
const missingAgentProblem = await missingAgent.json();
const health = await client.health();
let status = await client.createAgent({ displayName: "API Smoke Agent" });
const agentId = status.agent.subjectId;
status = await client.bindWallet(agentId);
status = await client.createLockbox(agentId);
status = await client.requestCreditLine(agentId);
status = await client.submitSpendRequest({
  agentId,
  providerId: status.providers[0].providerId,
  amountMinor: "50000",
  purposeCode: "compute"
});
status = await client.recordSettlement();
status = await client.captureRevenue({ agentId, amountMinor: "65000" });
status = await client.autoRepay({ agentId });
status = await client.evaluateCreditLearning({ agentId });
const refreshedState = await client.getDemoState();

const transferIntentId = status.transferIntents[0].transferIntentId;
const [transfer, rails, verticalSlice] = await Promise.all([
  client.getTransferIntent(transferIntentId),
  client.listRails(),
  client.runVerticalSlice()
]);
const correlatedHealth = await fetch(`${baseUrl}/healthz`, {
  headers: { "x-request-id": "smoke-request-001" }
});
const missingRoute = await fetch(`${baseUrl}/v1/not-a-route`, {
  headers: { "x-request-id": "smoke-request-404" }
});
const missingProblem = await missingRoute.json();
const invalidJson = await fetch(`${baseUrl}/v1/agents`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-request-id": "smoke-request-json" },
  body: "{"
});
const invalidJsonProblem = await invalidJson.json();
const replacedUnsafeRequestId = await fetch(`${baseUrl}/healthz`, {
  headers: { "x-request-id": "short" }
});
const [home, openApiResponse] = await Promise.all([
  fetch(`${baseUrl}/`),
  fetch(`${baseUrl}/openapi.json`)
]);
const openApi = await openApiResponse.json();

assert.equal(health.ok, true);
assert.ok(isolatedAgent.agent);
assert.equal(isolatedPeerState.agent, undefined);
assert.equal(initialState.agent, undefined);
assert.equal(refreshedState.agent.subjectId, agentId);
assert.equal(status.safety.noRealFunds, true);
assert.equal(status.safety.productionRailNetworkCalls, false);
assert.equal(status.spendRequests.at(-1).status, "settled");
assert.equal(status.obligations.at(-1).status, "fully_repaid");
assert.equal(status.ledger.integrity.balanced, true);
assert.equal(transfer.transferIntent.status, "settled");
assert.equal(transfer.replayProof.replayable, true);
assert.equal(rails.rails.every((rail) => rail.sandboxOnly), true);
assert.equal(verticalSlice.railReplayable, true);
assert.equal(verticalSlice.ledgerBalanced, true);
assert.equal(verticalSlice.productionFundsMoved, false);
assert.equal(missingAgent.status, 400);
assert.equal(missingAgentProblem.code, "demo_agent_required");
assert.equal(missingAgentProblem.requestId, "smoke-request-agent");
assert.equal(correlatedHealth.headers.get("x-request-id"), "smoke-request-001");
assert.equal(missingRoute.status, 404);
assert.match(missingRoute.headers.get("content-type"), /^application\/problem\+json/);
assert.equal(missingProblem.code, "not_found");
assert.equal(missingProblem.requestId, "smoke-request-404");
assert.equal(invalidJson.status, 400);
assert.equal(invalidJsonProblem.code, "invalid_json");
assert.equal(invalidJsonProblem.detail.includes("stack"), false);
assert.notEqual(replacedUnsafeRequestId.headers.get("x-request-id"), "short");
assert.equal(home.status, 200);
assert.match(home.headers.get("content-type"), /^text\/html/);
assert.match(home.headers.get("content-security-policy"), /frame-ancestors 'none'/);
assert.equal(home.headers.get("x-frame-options"), "DENY");
assert.match(home.headers.get("permissions-policy"), /payment=\(\)/);
assert.equal(openApiResponse.status, 200);
assert.equal(openApi.info.version, "0.3.0-alpha.4");
assert.ok(openApi.paths["/v1/demo/state"]?.get);
assert.equal(Object.keys(openApi.paths).length, 21);
assert.equal(openApi["x-ipo-one-safety"].sandboxSessionAuthentication, false);

console.log(
  JSON.stringify(
    {
      ok: true,
      agentId,
      transferIntentId,
      transferStatus: transfer.transferIntent.status,
      obligationStatus: status.obligations.at(-1).status,
      evidenceEnvelopeCount: status.evidence.envelopeCount,
      ledgerTransactionCount: status.ledger.transactionCount
    },
    null,
    2
  )
);
