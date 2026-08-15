import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  IpoOneAgentFeedbackClient,
  submitAgentPilotFeedback
} from "../src/agent-feedback-client.js";

const handoffs = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json", import.meta.url),
  "utf8"
));
const protocol = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json", import.meta.url),
  "utf8"
));
const ready = handoffs.valid.find((fixture) => fixture.status === "ready");
const baseResult = protocol.validResults.find(
  (result) => result.operationId === "pilotSubmitPilotFeedback"
);
const agentResult = {
  ...structuredClone(baseResult),
  response: {
    ...structuredClone(baseResult.response),
    entryMode: "agent",
    surface: "agent_sdk"
  }
};

function input() {
  return {
    subjectId: ready.subjectId,
    feedback: {
      surface: "agent_sdk",
      lifecycleStage: "application",
      sentiment: "easy",
      outcome: "completed",
      blockerCode: "none",
      schemaVersion: "pilot_feedback_record.v1"
    },
    idempotencyKey: "agent-feedback-sdk-0001",
    requestId: "request-agent-feedback-0001",
    correlationId: "correlation-agent-feedback-0001"
  };
}

test("typed Agent SDK submits the shared closed feedback command", async () => {
  const calls = [];
  const client = new IpoOneAgentFeedbackClient({
    manifest: ready,
    transportProfile: "local_in_process",
    async execute(request) {
      calls.push(structuredClone(request));
      return structuredClone(agentResult);
    }
  });
  const response = await client.submitFeedback(input());
  assert.deepEqual(response, agentResult.response);
  assert.deepEqual(calls[0], {
    schemaVersion: "tenant_protocol_request.v1",
    operationId: "pilotSubmitPilotFeedback",
    payload: input().feedback,
    resource: { resourceType: "subject", resourceId: ready.subjectId },
    idempotencyKey: "agent-feedback-sdk-0001",
    requestId: "request-agent-feedback-0001",
    correlationId: "correlation-agent-feedback-0001"
  });
});

test("Agent SDK rejects free text, Human surfaces, and response mode drift", async () => {
  const base = {
    execute: async () => structuredClone(agentResult),
    manifest: ready,
    transportProfile: "local_in_process"
  };
  assert.throws(
    () => submitAgentPilotFeedback({ ...base, ...input(), note: "call me" }),
    (error) => error.code === "invalid_agent_feedback"
  );
  const client = new IpoOneAgentFeedbackClient(base);
  await assert.rejects(
    () => client.submitFeedback({
      ...input(),
      feedback: { ...input().feedback, surface: "human_application" }
    }),
    (error) => error.code === "invalid_agent_feedback"
  );
  const drifted = new IpoOneAgentFeedbackClient({
    ...base,
    execute: async () => structuredClone(baseResult)
  });
  await assert.rejects(
    () => drifted.submitFeedback(input()),
    (error) => error.code === "agent_feedback_response_drift"
  );
});
