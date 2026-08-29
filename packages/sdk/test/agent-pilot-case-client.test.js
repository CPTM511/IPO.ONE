import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IpoOneAgentPilotCaseClient } from "../src/agent-pilot-case-client.js";

const handoffs = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json", import.meta.url),
  "utf8"
));
const protocol = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json", import.meta.url),
  "utf8"
));
const ready = handoffs.valid.find((fixture) => fixture.status === "ready");
const filedResult = structuredClone(protocol.validResults.find(
  (result) => result.operationId === "pilotFileCase"
));
filedResult.response.pilotCase.entryMode = "agent";
const listedResult = structuredClone(protocol.validResults.find(
  (result) => result.operationId === "pilotListOwnCases"
));

function fileInput() {
  return {
    subjectId: ready.subjectId,
    pilotCase: {
      targetType: "decision",
      targetId: "risk_decision_agent_fixture",
      reasonCode: "context_missing",
      schemaVersion: "pilot_case_file.v1"
    },
    idempotencyKey: "agent-pilot-case-sdk-0001",
    requestId: "request-agent-pilot-case-0001",
    correlationId: "correlation-agent-pilot-case-0001"
  };
}

test("Agent case SDK files and lists through the shared no-funds contract", async () => {
  const calls = [];
  const client = new IpoOneAgentPilotCaseClient({
    manifest: ready,
    transportProfile: "local_in_process",
    async execute(request) {
      calls.push(structuredClone(request));
      return request.operationId === "pilotFileCase"
        ? structuredClone(filedResult)
        : structuredClone(listedResult);
    }
  });

  const filed = await client.fileCase(fileInput());
  assert.equal(filed.pilotCase.entryMode, "agent");
  assert.equal(filed.pilotCase.safety.economicMutationAuthorized, false);
  assert.deepEqual(calls[0], {
    schemaVersion: "tenant_protocol_request.v1",
    operationId: "pilotFileCase",
    payload: fileInput().pilotCase,
    resource: { resourceType: "subject", resourceId: ready.subjectId },
    idempotencyKey: "agent-pilot-case-sdk-0001",
    requestId: "request-agent-pilot-case-0001",
    correlationId: "correlation-agent-pilot-case-0001"
  });

  const listed = await client.listCases({
    subjectId: ready.subjectId,
    requestId: "request-agent-pilot-case-list-0001",
    correlationId: "correlation-agent-pilot-case-list-0001"
  });
  assert.deepEqual(listed, listedResult.response);
  assert.equal(calls[1].operationId, "pilotListOwnCases");
  assert.deepEqual(calls[1].payload, {});
});

test("Agent case SDK rejects cross-Subject access, free text, and response drift", async () => {
  const client = new IpoOneAgentPilotCaseClient({
    manifest: ready,
    transportProfile: "local_in_process",
    execute: async () => structuredClone(filedResult)
  });
  await assert.rejects(
    () => client.fileCase({
      ...fileInput(),
      pilotCase: { ...fileInput().pilotCase, note: "contact me" }
    }),
    (error) => error.code === "invalid_agent_pilot_case"
  );
  await assert.rejects(
    () => client.listCases({
      subjectId: "subject_other_tenant",
      requestId: "request-agent-pilot-case-list-0002",
      correlationId: "correlation-agent-pilot-case-list-0002"
    }),
    (error) => error.code === "invalid_agent_pilot_case"
  );
  const drifted = new IpoOneAgentPilotCaseClient({
    manifest: ready,
    transportProfile: "local_in_process",
    execute: async () => structuredClone(listedResult)
  });
  await assert.rejects(
    () => drifted.fileCase(fileInput()),
    (error) => error.code === "agent_pilot_case_response_drift"
  );
});
