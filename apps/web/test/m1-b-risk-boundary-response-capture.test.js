import assert from "node:assert/strict";
import test from "node:test";
import {
  createM1BRiskBoundaryResponseCapture,
  deriveM1BRiskBoundaryFreezeIdempotencyKey,
  isExactM1BRiskBoundaryDeniedTransport
} from "../src/m1-b-risk-boundary-response-capture.js";

const NOW = new Date("2026-08-15T01:00:00.000Z");
const CHALLENGE =
  "m1_b_risk_boundary_01234567-89ab-4def-8123-456789abcdef";

function runtime(overrides = {}) {
  return {
    connected: true,
    authenticationMethod: "siwe",
    authenticationProfile: "local_no_funds",
    hostWorkspaceName: "risk",
    ...overrides
  };
}

function armToken(overrides = {}) {
  return JSON.stringify({
    schemaVersion: "m1_b_risk_boundary_response_arm.v1",
    challenge: CHALLENGE,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
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
    freezeCorrelationId: "correlation_m1_b_risk_boundary_41234567-89ab-4def-8123-456789abcdef",
    ...overrides
  });
}

function problem(requestId, overrides = {}) {
  return {
    schemaVersion: "problem_details.v1",
    type: "urn:ipo-one:problem:authorization_denied",
    title: "Operation unavailable",
    status: 404,
    detail: "The requested operation is not available.",
    instance: `urn:ipo-one:request:${requestId}`,
    code: "authorization_denied",
    requestId,
    ...overrides
  };
}

function probe(requestProjection, overrides = {}) {
  return {
    requestProjection: structuredClone(requestProjection),
    responseStatus: 404,
    responseRequestIdHeader: requestProjection.requestId,
    response: problem(requestProjection.requestId),
    ...overrides
  };
}

function result(attempt, overrides = {}) {
  return {
    read: probe(attempt.read),
    freeze: probe(attempt.freeze),
    ...overrides
  };
}

function capture(runtimeState = runtime(), options = {}) {
  return createM1BRiskBoundaryResponseCapture({
    location: { protocol: "http:", hostname: "127.0.0.1" },
    getRuntimeState: () => runtimeState,
    now: () => NOW,
    ...options
  });
}

test("visible Risk boundary capture binds two exact denied probes and consumes responses once", () => {
  const controller = capture();
  controller.arm(armToken());
  const attempt = controller.begin();
  assert.deepEqual(attempt.read, {
    operationId: "pilotReadTenantRiskPortfolioReference",
    payload: {},
    requestId: "request_m1_b_risk_read_11234567-89ab-4def-8123-456789abcdef",
    correlationId: "correlation_m1_b_risk_boundary_21234567-89ab-4def-8123-456789abcdef",
    schemaVersion: "tenant_protocol_request.v1"
  });
  assert.deepEqual(attempt.freeze, {
    operationId: "pilotFreezeSubject",
    payload: {},
    resource: {
      resourceType: "subject",
      resourceId: "subject_risk_boundary_candidate"
    },
    reasonCode: "security_incident",
    idempotencyKey:
      "idempotency_m1b_risk_freeze_01234567-89ab-4def-8123-456789abcdef",
    requestId: "request_m1_b_risk_freeze_31234567-89ab-4def-8123-456789abcdef",
    correlationId: "correlation_m1_b_risk_boundary_41234567-89ab-4def-8123-456789abcdef",
    schemaVersion: "tenant_protocol_request.v1"
  });
  assert.equal(controller.complete(result(attempt)), true);
  assert.deepEqual(controller.snapshot(), {
    phase: "consumed",
    statusCode: "two_denials_observed_and_discarded",
    runtimeAvailable: true,
    operationCount: 2
  });
  assert.equal(controller.complete(result(attempt)), false);
  assert.equal(controller.snapshot().phase, "consumed");
  assert.throws(
    () => controller.begin(),
    (error) => error.code === "m1_b_risk_boundary_unavailable"
  );
  assert.throws(
    () => controller.arm(armToken()),
    (error) => error.code === "m1_b_risk_boundary_challenge_reused"
  );
  assert.doesNotMatch(
    JSON.stringify(controller.snapshot()),
    /request_m1_b|correlation_m1_b|subject_risk|authorization_denied|csrf|cookie/i
  );
});

test("Risk boundary arm rejects tamper, executable fields, wrong role, and wrong operations", () => {
  for (const token of [
    armToken({ executableProbe: "forbidden" }),
    armToken({ idempotencyKey: "caller-controlled" }),
    armToken({ actorRole: "human" }),
    armToken({ hostWorkspaceName: "borrower" }),
    armToken({ reasonCode: "caller_selected" }),
    armToken({ operationIds: [
      "pilotReadTenantRiskPortfolioReference",
      "pilotUnfreezeSubject"
    ] })
  ]) {
    assert.throws(
      () => capture().arm(token),
      (error) => error.code === "m1_b_risk_boundary_arm_invalid"
    );
  }
  assert.equal(
    Object.hasOwn(JSON.parse(armToken()), "idempotencyKey"),
    false
  );
});

test("Risk boundary requires the fresh SIWE Risk loopback runtime", () => {
  for (const runtimeState of [
    runtime({ connected: false }),
    runtime({ authenticationMethod: "oidc_pkce_bff" }),
    runtime({ authenticationProfile: "public_sandbox" }),
    runtime({ hostWorkspaceName: "borrower" })
  ]) {
    assert.throws(
      () => capture(runtimeState).arm(armToken()),
      (error) => error.code === "m1_b_risk_boundary_runtime_mismatch"
    );
  }
  assert.throws(
    () => createM1BRiskBoundaryResponseCapture({
      location: { protocol: "https:", hostname: "example.com" },
      getRuntimeState: () => runtime()
    }),
    (error) => error.code === "m1_b_risk_boundary_unavailable"
  );
});

test("Risk boundary rejects request, operation, raw header, problem, and secret-output mismatches", () => {
  const cases = [
    (value) => {
      value.read.requestProjection.operationId = "pilotReadTenantRisk";
    },
    (value) => {
      value.freeze.requestProjection.resource.resourceId = "subject_wrong";
    },
    (value) => {
      value.freeze.requestProjection.idempotencyKey = "idempotency_wrong";
    },
    (value) => {
      value.read.responseRequestIdHeader = null;
    },
    (value) => {
      value.freeze.responseRequestIdHeader = "request_wrong_0001";
    },
    (value) => {
      value.read.response.status = 403;
    },
    (value) => {
      value.freeze.response.detail = "session_token=secret-session-material";
    }
  ];
  cases.forEach((tamper, index) => {
    const controller = capture();
    controller.arm(armToken({
      challenge:
        `m1_b_risk_boundary_${index + 1}1234567-89ab-4def-8123-456789abcdef`
    }));
    const attempt = controller.begin();
    const observed = result(attempt);
    tamper(observed);
    assert.equal(controller.complete(observed), false);
    assert.equal(controller.snapshot().phase, "failed");
  });
});

test("Risk boundary arm expires before any probe can begin", () => {
  let clock = new Date(NOW);
  const controller = capture(runtime(), { now: () => clock });
  controller.arm(armToken());
  clock = new Date(NOW.getTime() + 15 * 60_000 + 1);
  assert.throws(
    () => controller.begin(),
    (error) => error.code === "m1_b_risk_boundary_unavailable"
  );
  assert.equal(controller.snapshot().statusCode, "arm_expired");
});

test("Risk boundary transport requires the raw exact x-request-id echo", () => {
  const requestId =
    "request_m1_b_risk_read_11234567-89ab-4def-8123-456789abcdef";
  const response = problem(requestId);
  assert.equal(isExactM1BRiskBoundaryDeniedTransport({
    requestId,
    responseStatus: 404,
    responseRequestIdHeader: requestId,
    response
  }), true);
  assert.equal(isExactM1BRiskBoundaryDeniedTransport({
    requestId,
    responseStatus: 404,
    responseRequestIdHeader: null,
    response
  }), false);
  assert.equal(isExactM1BRiskBoundaryDeniedTransport({
    requestId,
    responseStatus: 404,
    responseRequestIdHeader:
      "request_m1_b_risk_read_91234567-89ab-4def-8123-456789abcdef",
    response
  }), false);
  assert.equal(
    deriveM1BRiskBoundaryFreezeIdempotencyKey(CHALLENGE),
    "idempotency_m1b_risk_freeze_01234567-89ab-4def-8123-456789abcdef"
  );
});
