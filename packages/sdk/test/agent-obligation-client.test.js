import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  IpoOneAgentObligationClient,
  readAgentObligation
} from "../src/agent-obligation-client.js";

const handoffs = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const protocol = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const manifest = handoffs.valid.find((fixture) => fixture.status === "ready");
const result = protocol.validResults.find(
  (fixture) => fixture.operationId === "pilotReadOwnObligation"
);

test("typed Agent SDK reads one exact owned current Obligation", async () => {
  const requests = [];
  const client = new IpoOneAgentObligationClient({
    execute: async (request) => {
      requests.push(structuredClone(request));
      return structuredClone(result);
    },
    manifest,
    transportProfile: "local_in_process"
  });
  const response = await client.readObligation({
    obligationId: result.response.obligation.obligationId,
    requestId: "request-agent-obligation-sdk-0001",
    correlationId: "correlation-agent-obligation-sdk-0001"
  });
  assert.deepEqual(response, result.response);
  assert.deepEqual(requests[0].resource, {
    resourceType: "obligation",
    resourceId: result.response.obligation.obligationId
  });
  assert.deepEqual(requests[0].payload, {});
  assert.equal(JSON.stringify(requests[0]).includes("authenticationContext"), false);
});

test("Agent Obligation SDK rejects caller authority and response drift", async () => {
  const base = {
    execute: async () => structuredClone(result),
    manifest,
    transportProfile: "local_in_process",
    obligationId: result.response.obligation.obligationId,
    requestId: "request-agent-obligation-sdk-0002",
    correlationId: "correlation-agent-obligation-sdk-0002"
  };
  assert.throws(
    () => readAgentObligation({ ...base, actorId: "attacker" }),
    (error) => error.code === "invalid_agent_obligation_query"
  );
  const client = new IpoOneAgentObligationClient({
    execute: async () => ({ ...structuredClone(result), operationId: "pilotReadEvidence" }),
    manifest,
    transportProfile: "local_in_process"
  });
  await assert.rejects(
    client.readObligation({
      obligationId: result.response.obligation.obligationId,
      requestId: base.requestId,
      correlationId: base.correlationId
    }),
    (error) => error.code === "agent_obligation_response_drift"
  );
});
