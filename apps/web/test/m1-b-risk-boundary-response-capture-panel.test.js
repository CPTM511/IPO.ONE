import assert from "node:assert/strict";
import test from "node:test";
import {
  installM1BRiskBoundaryResponseCapturePanel
} from "../src/m1-b-risk-boundary-response-capture-panel.js";

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
    schemaVersion: "m1_b_risk_boundary_response_arm.v1",
    challenge: "m1_b_risk_boundary_01234567-89ab-4def-8123-456789abcdef",
    issuedAt: "2026-08-15T01:00:00.000Z",
    expiresAt: "2026-08-15T01:15:00.000Z",
    flow: "risk_mfa_boundary",
    actorRole: "risk_operations",
    authenticationMethod: "siwe",
    authenticationProfile: "local_no_funds",
    hostWorkspaceName: "risk",
    responseSchemaVersion: "problem_details.v1",
    operationIds: [
      "pilotReadTenantRiskPortfolioReference",
      "pilotFreezeSubject"
    ],
    subjectId: "subject_risk_boundary_candidate",
    reasonCode: "security_incident",
    readRequestId: "request_m1_b_risk_read_11234567-89ab-4def-8123-456789abcdef",
    readCorrelationId: "correlation_m1_b_risk_boundary_21234567-89ab-4def-8123-456789abcdef",
    freezeRequestId: "request_m1_b_risk_freeze_31234567-89ab-4def-8123-456789abcdef",
    freezeCorrelationId: "correlation_m1_b_risk_boundary_41234567-89ab-4def-8123-456789abcdef"
  });
}

function elements() {
  const ids = [
    "m1BRiskBoundaryControls",
    "m1BRiskBoundaryArmToken",
    "m1BRiskBoundaryArmBtn",
    "m1BRiskBoundaryRunBtn",
    "m1BRiskBoundaryStatus"
  ];
  return Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
}

function problem(requestId) {
  return {
    schemaVersion: "problem_details.v1",
    type: "urn:ipo-one:problem:authorization_denied",
    title: "Operation unavailable",
    status: 404,
    detail: "The requested operation is not available.",
    instance: `urn:ipo-one:request:${requestId}`,
    code: "authorization_denied",
    requestId
  };
}

function boundaryResult(attempt) {
  const denied = (requestProjection) => ({
    requestProjection: structuredClone(requestProjection),
    responseStatus: 404,
    responseRequestIdHeader: requestProjection.requestId,
    response: problem(requestProjection.requestId)
  });
  return {
    read: denied(attempt.read),
    freeze: denied(attempt.freeze)
  };
}

function install({ performBoundary = boundaryResult } = {}) {
  const controls = elements();
  const attempts = [];
  const announcements = [];
  const controller = installM1BRiskBoundaryResponseCapturePanel({
    document: { getElementById: (id) => controls[id] },
    location: { protocol: "http:", hostname: "127.0.0.1" },
    getRuntimeState: () => ({
      connected: true,
      authenticationMethod: "siwe",
      authenticationProfile: "local_no_funds",
      hostWorkspaceName: "risk"
    }),
    async performBoundary(attempt) {
      attempts.push(attempt);
      return performBoundary(attempt);
    },
    announce(message) {
      announcements.push(message);
    },
    now: () => new Date("2026-08-15T01:00:00.000Z")
  });
  return { announcements, attempts, controller, controls };
}

test("visible Risk controls arm with zero requests, then run the two probes exactly once", async () => {
  const { announcements, attempts, controller, controls } = install();
  controls.m1BRiskBoundaryArmToken.value = armToken();
  await controls.m1BRiskBoundaryArmBtn.dispatch("click");
  assert.deepEqual(attempts, []);
  assert.equal(controller.snapshot().phase, "armed");
  assert.equal(controls.m1BRiskBoundaryArmToken.value, "");
  assert.match(announcements[0], /No request was submitted/);

  await controls.m1BRiskBoundaryRunBtn.dispatch("click");
  assert.equal(attempts.length, 1);
  assert.equal(controller.snapshot().phase, "consumed");
  assert.equal(controls.m1BRiskBoundaryRunBtn.disabled, true);
  assert.match(controls.m1BRiskBoundaryStatus.textContent, /discarded/);
  assert.doesNotMatch(
    controls.m1BRiskBoundaryStatus.textContent,
    /request_m1_b|correlation_m1_b|subject_risk|authorization_denied|csrf|cookie/i
  );
  await controls.m1BRiskBoundaryRunBtn.dispatch("click");
  assert.equal(attempts.length, 1);
});

test("invalid arm and failed probe stay fail-closed without a second request", async () => {
  const { attempts, controller, controls } = install({
    async performBoundary() {
      throw new Error("transport unavailable");
    }
  });
  controls.m1BRiskBoundaryArmToken.value = JSON.stringify({
    ...JSON.parse(armToken()),
    actorRole: "human"
  });
  await controls.m1BRiskBoundaryArmBtn.dispatch("click");
  assert.deepEqual(attempts, []);
  assert.equal(controller.snapshot().phase, "failed");

  controls.m1BRiskBoundaryArmToken.value = armToken();
  await controls.m1BRiskBoundaryArmBtn.dispatch("click");
  await controls.m1BRiskBoundaryRunBtn.dispatch("click");
  assert.equal(attempts.length, 1);
  assert.equal(controller.snapshot().phase, "failed");
  assert.equal(controls.m1BRiskBoundaryRunBtn.disabled, true);
  await controls.m1BRiskBoundaryRunBtn.dispatch("click");
  assert.equal(attempts.length, 1);
});
