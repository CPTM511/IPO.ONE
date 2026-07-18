import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  IpoOneAgentEvidenceClient,
  readAgentObligationEvidence
} from "../src/agent-evidence-client.js";

const handoffs = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json", import.meta.url),
  "utf8"
));
const protocol = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json", import.meta.url),
  "utf8"
));
const ready = handoffs.valid.find((fixture) => fixture.status === "ready");
const evidenceResult = protocol.validResults.find(
  (result) => result.operationId === "pilotReadOwnObligationEvidence"
);

function query() {
  return {
    obligationId: evidenceResult.response.obligationId,
    limit: 25,
    requestId: "request-agent-owned-evidence-0001",
    correlationId: "correlation-agent-owned-evidence-0001"
  };
}

test("typed Agent SDK reads only the owned closed Evidence summary", async () => {
  const calls = [];
  const client = new IpoOneAgentEvidenceClient({
    manifest: ready,
    transportProfile: "local_in_process",
    async execute(request) {
      calls.push(structuredClone(request));
      return structuredClone(evidenceResult);
    }
  });
  const response = await client.readObligationEvidence(query());
  assert.deepEqual(response, evidenceResult.response);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    schemaVersion: "tenant_protocol_request.v1",
    operationId: "pilotReadOwnObligationEvidence",
    payload: { limit: 25 },
    resource: {
      resourceType: "evidence",
      resourceId: evidenceResult.response.obligationId
    },
    requestId: "request-agent-owned-evidence-0001",
    correlationId: "correlation-agent-owned-evidence-0001"
  });
  assert.equal(JSON.stringify(response).includes("payloadReference"), false);
  assert.equal(JSON.stringify(response).includes("actorRef"), false);
});

test("functional Agent Evidence SDK entry point preserves cursor and rejects authority input", async () => {
  const cursor = "WyIyMDI2LTA3LTE0VDAwOjAwOjAwLjEwMFoiLCJldmVudF8xIl0";
  const response = await readAgentObligationEvidence({
    execute: async () => structuredClone(evidenceResult),
    manifest: ready,
    transportProfile: "local_in_process",
    ...query(),
    cursor
  });
  assert.equal(response.schemaVersion, "tenant_owned_obligation_evidence_view.v1");

  assert.throws(
    () => readAgentObligationEvidence({
      execute: async () => structuredClone(evidenceResult),
      manifest: ready,
      transportProfile: "local_in_process",
      ...query(),
      tenantId: "prohibited"
    }),
    (error) => error.code === "invalid_agent_evidence_query"
  );
});

test("Agent Evidence SDK fails closed for inactive handoff and response drift", async () => {
  assert.throws(
    () => new IpoOneAgentEvidenceClient({
      execute: async () => structuredClone(evidenceResult),
      manifest: handoffs.valid.find((fixture) => fixture.status === "application_ready"),
      transportProfile: "local_in_process"
    }),
    (error) => error.code === "agent_active_handoff_required"
  );
  const client = new IpoOneAgentEvidenceClient({
    execute: async () => ({
      ...structuredClone(evidenceResult),
      operationId: "pilotReadEvidence"
    }),
    manifest: ready,
    transportProfile: "local_in_process"
  });
  await assert.rejects(
    () => client.readObligationEvidence(query()),
    (error) => error.code === "agent_evidence_response_drift"
  );
});
