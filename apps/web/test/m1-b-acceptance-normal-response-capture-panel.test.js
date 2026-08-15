import assert from "node:assert/strict";
import test from "node:test";
import {
  installM1BAcceptanceNormalResponseCapturePanel
} from "../src/m1-b-acceptance-normal-response-capture-panel.js";

class FakeElement {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
    this.dataset = {};
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  async dispatch(type) {
    return this.listeners.get(type)?.();
  }
}

function armToken() {
  return JSON.stringify({
    schemaVersion: "m1_b_acceptance_normal_response_arm.v1",
    challenge:
      "m1_b_normal_response_01234567-89ab-4def-8123-456789abcdef",
    clockDomain: "lima_exact_pilot_vm_system_clock",
    issuedAt: "2026-08-15T01:00:00.000Z",
    expiresAt: "2026-08-15T01:15:00.000Z",
    flow: "human",
    sequence: 1,
    actorRole: "human",
    operationId: "pilotReadWorkspaceResume",
    responseSchemaVersion: "tenant_workspace_resume_view.v2"
  });
}

test("visible panel arms without a request, runs only the read callback, and copies one non-displayed safe response", async () => {
  const ids = [
    "m1BAcceptanceCapturePanel",
    "m1BAcceptanceArmToken",
    "m1BAcceptanceArmBtn",
    "m1BAcceptanceRunReadBtn",
    "m1BAcceptanceCopyResponseBtn",
    "m1BAcceptanceCaptureStatus"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  const copied = [];
  const reads = [];
  let controller;
  controller = installM1BAcceptanceNormalResponseCapturePanel({
    document: { getElementById: (id) => elements[id] },
    location: { protocol: "http:", hostname: "127.0.0.1" },
    getRuntimeState: () => ({
      connected: true,
      authenticationMethod: "siwe",
      authenticationProfile: "local_no_funds",
      workspaceKind: "human_borrower",
      hostWorkspaceName: "borrower",
      walletAuthorityAvailable: true
    }),
    async performRead(operationId) {
      reads.push(operationId);
      const requestPermit = controller.acquireRequestPermit(operationId);
      controller.observeTenantApiResult({
        requestedOperationId: operationId,
        requestPermit,
        requestId: "request_panel_workspace_0001",
        responseRequestIdHeader: "request_panel_workspace_0001",
        correlationId: "correlation_panel_workspace_0001",
        result: {
          operationId,
          replayed: false,
          response: {
            workspaceKind: "human_borrower",
            humanOfferReview: null,
            hasMore: false,
            serverTruth: true,
            schemaVersion: "tenant_workspace_resume_view.v2"
          },
          schemaVersion: "tenant_protocol_result.v1"
        }
      });
    },
    clipboard: { async writeText(value) { copied.push(value); } },
    now: () => new Date("2026-08-15T01:00:00.000Z")
  });

  assert.equal(elements.m1BAcceptanceCapturePanel.hidden, false);
  elements.m1BAcceptanceArmToken.value = armToken();
  await elements.m1BAcceptanceArmBtn.dispatch("click");
  assert.deepEqual(reads, []);
  assert.equal(elements.m1BAcceptanceArmToken.value, "");
  assert.equal(elements.m1BAcceptanceRunReadBtn.hidden, false);

  await elements.m1BAcceptanceRunReadBtn.dispatch("click");
  assert.deepEqual(reads, ["pilotReadWorkspaceResume"]);
  assert.equal(elements.m1BAcceptanceCopyResponseBtn.disabled, false);
  assert.doesNotMatch(
    elements.m1BAcceptanceCaptureStatus.textContent,
    /request_panel|correlation_panel|workspaceKind/
  );

  await elements.m1BAcceptanceCopyResponseBtn.dispatch("click");
  assert.equal(copied.length, 1);
  const response = JSON.parse(copied[0]);
  assert.equal(response.armChallenge,
    "m1_b_normal_response_01234567-89ab-4def-8123-456789abcdef");
  assert.equal(response.armIssuedAt, "2026-08-15T01:00:00.000Z");
  assert.equal(response.armClockDomain, "lima_exact_pilot_vm_system_clock");
  assert.equal(response.response.schemaVersion, "tenant_workspace_resume_view.v2");
  assert.equal(controller.snapshot().phase, "consumed");
  assert.equal(elements.m1BAcceptanceCopyResponseBtn.disabled, true);
});

test("normal panel installs without a Clipboard API and failed copy still removes the observation", async () => {
  const ids = [
    "m1BAcceptanceCapturePanel",
    "m1BAcceptanceArmToken",
    "m1BAcceptanceArmBtn",
    "m1BAcceptanceRunReadBtn",
    "m1BAcceptanceCopyResponseBtn",
    "m1BAcceptanceCaptureStatus"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  let controller;
  controller = installM1BAcceptanceNormalResponseCapturePanel({
    document: { getElementById: (id) => elements[id] },
    location: { protocol: "http:", hostname: "localhost" },
    getRuntimeState: () => ({
      connected: true,
      authenticationMethod: "siwe",
      authenticationProfile: "local_no_funds",
      workspaceKind: "human_borrower",
      hostWorkspaceName: "borrower",
      walletAuthorityAvailable: true
    }),
    async performRead(operationId) {
      const requestPermit = controller.acquireRequestPermit(operationId);
      controller.observeTenantApiResult({
        requestedOperationId: operationId,
        requestPermit,
        requestId: "request_panel_no_clipboard_0001",
        responseRequestIdHeader: "request_panel_no_clipboard_0001",
        correlationId: "correlation_panel_no_clipboard_0001",
        result: {
          operationId,
          replayed: false,
          response: { schemaVersion: "tenant_workspace_resume_view.v2" },
          schemaVersion: "tenant_protocol_result.v1"
        }
      });
    },
    clipboard: undefined,
    now: () => new Date("2026-08-15T01:00:00.000Z")
  });
  elements.m1BAcceptanceArmToken.value = armToken();
  await elements.m1BAcceptanceArmBtn.dispatch("click");
  await elements.m1BAcceptanceRunReadBtn.dispatch("click");
  assert.equal(controller.snapshot().phase, "ready");
  await elements.m1BAcceptanceCopyResponseBtn.dispatch("click");
  assert.equal(controller.snapshot().phase, "consumed");
  assert.equal(elements.m1BAcceptanceCopyResponseBtn.disabled, true);
});
