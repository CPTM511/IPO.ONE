import assert from "node:assert/strict";
import test from "node:test";
import { IpoOneApiError, IpoOneClient } from "../src/index.js";

function jsonResponse(payload, { status = 200, requestId = "server-request-001" } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "x-request-id": requestId }
  });
}

test("SDK sends typed Agent commands with encoded paths and request correlation", async () => {
  const calls = [];
  const client = new IpoOneClient({
    baseUrl: "https://sandbox.ipo.one/",
    sandboxSessionId: "sdk_session_test_001",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ safety: {}, providers: [], transferIntents: [], settlementReceipts: [], obligations: [], repayments: [] });
    }
  });

  await client.createAgent({ displayName: "SDK Agent" }, { requestId: "sdk-request-001" });
  await client.getAgentStatus("agent/with space", { requestId: "sdk-request-002" });
  await client.getDemoState({ requestId: "sdk-request-003" });

  assert.equal(calls[0].url, "https://sandbox.ipo.one/v1/agents");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["x-request-id"], "sdk-request-001");
  assert.equal(calls[0].init.headers["x-ipo-one-sandbox-session"], "sdk_session_test_001");
  assert.deepEqual(JSON.parse(calls[0].init.body), { displayName: "SDK Agent" });
  assert.equal(calls[1].url, "https://sandbox.ipo.one/v1/agents/agent%2Fwith%20space/status");
  assert.equal(calls[1].init.body, undefined);
  assert.equal(calls[2].url, "https://sandbox.ipo.one/v1/demo/state");
  assert.equal(calls[2].init.method, "GET");
  assert.equal(calls[2].init.headers["x-ipo-one-sandbox-session"], "sdk_session_test_001");
});

test("SDK exposes Problem Details without parsing human text", async () => {
  const problem = {
    type: "urn:ipo-one:problem:transfer_intent_not_found",
    title: "Not Found",
    status: 404,
    detail: "Transfer intent was not found.",
    instance: "urn:ipo-one:request:server-request-404",
    code: "transfer_intent_not_found",
    requestId: "server-request-404",
    retryAfterClass: "manual",
    schemaVersion: "problem_details.v1"
  };
  const client = new IpoOneClient({
    baseUrl: "https://sandbox.ipo.one",
    fetch: async () => jsonResponse(problem, { status: 404, requestId: "server-request-404" })
  });

  await assert.rejects(
    () => client.getTransferIntent("missing"),
    (error) =>
      error instanceof IpoOneApiError &&
      error.status === 404 &&
      error.code === "transfer_intent_not_found" &&
      error.requestId === "server-request-404" &&
      error.problem.retryAfterClass === "manual"
  );
});

test("SDK rejects unsupported cycles and never retries failed mutations", async () => {
  let calls = 0;
  const client = new IpoOneClient({
    baseUrl: "https://sandbox.ipo.one",
    fetch: async () => {
      calls += 1;
      return jsonResponse({ code: "unavailable", detail: "Unavailable" }, { status: 503 });
    }
  });

  assert.throws(() => client.runCycle("unknown", {}), /cycleType/);
  await assert.rejects(() => client.createAgent({}), IpoOneApiError);
  assert.equal(calls, 1);
});

test("SDK rejects base URLs containing credentials", () => {
  assert.throws(
    () => new IpoOneClient({ baseUrl: "https://user:secret@sandbox.ipo.one" }),
    /must not contain credentials/
  );
});

test("SDK rejects unsafe sandbox session identifiers", () => {
  assert.throws(
    () => new IpoOneClient({ baseUrl: "https://sandbox.ipo.one", sandboxSessionId: "short" }),
    /bounded safe identifier/
  );
});
