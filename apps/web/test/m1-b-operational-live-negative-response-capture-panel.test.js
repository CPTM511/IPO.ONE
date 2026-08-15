import assert from "node:assert/strict";
import test from "node:test";
import {
  installM1BOperationalLiveNegativeResponseCapturePanel
} from "../src/m1-b-operational-live-negative-response-capture-panel.js";

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

const CHALLENGE =
  "m1_b_live_negative_response_01234567-89ab-4def-8123-456789abcdef";

function armToken() {
  return JSON.stringify({
    schemaVersion: "m1_b_operational_live_negative_arm.v1",
    challenge: CHALLENGE,
    issuedAt: "2026-08-15T01:00:00.000Z",
    expiresAt: "2026-08-15T01:15:00.000Z",
    flow: "operational_live_negative",
    group: "authorization",
    id: "cross_role_private_read",
    actorRole: "capital_partner",
    operationId: "pilotReadOwnObligation",
    responseSchemaVersion: "problem_details.v1",
    expectedStatus: 404,
    resourceType: "obligation",
    resourceId: "obligation_human_critical",
    expectedOfferHash: null,
    expectedTermsHash: null,
    disclosureRef: null,
    requestId: "request_m1b_cross_role_0001",
    correlationId: "correlation_m1b_cross_role_0001"
  });
}

test("visible live-negative panel arms without a request, runs one fixed probe, and removes copied truth", async () => {
  const ids = [
    "m1BOperationalLiveNegativeControls",
    "m1BOperationalLiveNegativeArmToken",
    "m1BOperationalLiveNegativeArmBtn",
    "m1BOperationalLiveNegativeRunBtn",
    "m1BOperationalLiveNegativeCopyBtn",
    "m1BOperationalLiveNegativeStatus"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  const attempts = [];
  const copied = [];
  const capture = installM1BOperationalLiveNegativeResponseCapturePanel({
    document: { getElementById: (id) => elements[id] },
    location: { protocol: "http:", hostname: "127.0.0.1" },
    getRuntimeState: () => ({
      connected: true,
      authenticationMethod: "siwe",
      authenticationProfile: "local_no_funds",
      workspaceKind: "capital_partner",
      hostWorkspaceName: "capitalPartner",
      walletAuthorityAvailable: true
    }),
    async performDenial(attempt) {
      attempts.push(attempt);
      return {
        requestProjection: {
          operationId: attempt.operationId,
          resource: {
            resourceType: attempt.resourceType,
            resourceId: attempt.resourceId
          },
          payload: {},
          requestId: attempt.requestId,
          correlationId: attempt.correlationId,
          schemaVersion: "tenant_protocol_request.v1"
        },
        response: {
          schemaVersion: "problem_details.v1",
          type: "urn:ipo.one:problem:authorization_denied",
          title: "Not available",
          status: 404,
          code: "authorization_denied",
          detail: "The requested operation is not available.",
          requestId: attempt.requestId
        }
      };
    },
    clipboard: { async writeText(value) { copied.push(value); } },
    now: () => new Date("2026-08-15T01:00:00.000Z")
  });
  elements.m1BOperationalLiveNegativeArmToken.value = armToken();
  await elements.m1BOperationalLiveNegativeArmBtn.dispatch("click");
  assert.equal(attempts.length, 0);
  assert.equal(elements.m1BOperationalLiveNegativeArmToken.value, "");
  await elements.m1BOperationalLiveNegativeRunBtn.dispatch("click");
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].kind, "cross_role_read_denial");
  assert.equal(elements.m1BOperationalLiveNegativeCopyBtn.disabled, false);
  await elements.m1BOperationalLiveNegativeCopyBtn.dispatch("click");
  assert.equal(copied.length, 1);
  assert.equal(JSON.parse(copied[0]).armChallenge, CHALLENGE);
  assert.equal(capture.snapshot().phase, "consumed");
});

test("clipboard absence still consumes the one-shot observation", async () => {
  const ids = [
    "m1BOperationalLiveNegativeControls",
    "m1BOperationalLiveNegativeArmToken",
    "m1BOperationalLiveNegativeArmBtn",
    "m1BOperationalLiveNegativeRunBtn",
    "m1BOperationalLiveNegativeCopyBtn",
    "m1BOperationalLiveNegativeStatus"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  const capture = installM1BOperationalLiveNegativeResponseCapturePanel({
    document: { getElementById: (id) => elements[id] },
    location: { protocol: "http:", hostname: "localhost" },
    getRuntimeState: () => ({
      connected: true,
      authenticationMethod: "siwe",
      authenticationProfile: "local_no_funds",
      workspaceKind: "capital_partner",
      hostWorkspaceName: "capitalPartner",
      walletAuthorityAvailable: true
    }),
    async performDenial(attempt) {
      return {
        requestProjection: {
          operationId: attempt.operationId,
          resource: { resourceType: attempt.resourceType, resourceId: attempt.resourceId },
          payload: {},
          requestId: attempt.requestId,
          correlationId: attempt.correlationId,
          schemaVersion: "tenant_protocol_request.v1"
        },
        response: {
          schemaVersion: "problem_details.v1",
          status: 404,
          code: "authorization_denied",
          requestId: attempt.requestId
        }
      };
    },
    clipboard: undefined,
    now: () => new Date("2026-08-15T01:00:00.000Z")
  });
  elements.m1BOperationalLiveNegativeArmToken.value = armToken();
  await elements.m1BOperationalLiveNegativeArmBtn.dispatch("click");
  await elements.m1BOperationalLiveNegativeRunBtn.dispatch("click");
  assert.equal(capture.snapshot().phase, "ready");
  await elements.m1BOperationalLiveNegativeCopyBtn.dispatch("click");
  assert.equal(capture.snapshot().phase, "consumed");
});
