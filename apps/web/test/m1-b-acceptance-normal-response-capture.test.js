import assert from "node:assert/strict";
import test from "node:test";
import {
  M1BAcceptanceNormalResponseCaptureError,
  M1_B_ACCEPTANCE_NORMAL_RESPONSE_DEFINITIONS,
  M1_B_ACCEPTANCE_NORMAL_RESPONSE_ARM_SCHEMA_VERSION,
  M1_B_ACCEPTANCE_NORMAL_RESPONSE_CLOCK_DOMAIN,
  createM1BAcceptanceNormalResponseCapture
} from "../src/m1-b-acceptance-normal-response-capture.js";

const NOW = new Date("2026-08-15T01:00:00.000Z");
const CHALLENGE_A =
  "m1_b_normal_response_01234567-89ab-4def-8123-456789abcdef";
const CHALLENGE_B =
  "m1_b_normal_response_11234567-89ab-4def-8123-456789abcdef";

function runtime(overrides = {}) {
  return {
    connected: true,
    authenticationMethod: "siwe",
    authenticationProfile: "local_no_funds",
    workspaceKind: "human_borrower",
    hostWorkspaceName: "borrower",
    walletAuthorityAvailable: true,
    ...overrides
  };
}

function armToken(overrides = {}) {
  return JSON.stringify({
    schemaVersion: M1_B_ACCEPTANCE_NORMAL_RESPONSE_ARM_SCHEMA_VERSION,
    challenge: CHALLENGE_A,
    clockDomain: M1_B_ACCEPTANCE_NORMAL_RESPONSE_CLOCK_DOMAIN,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
    flow: "human",
    sequence: 1,
    actorRole: "human",
    operationId: "pilotReadWorkspaceResume",
    responseSchemaVersion: "tenant_workspace_resume_view.v2",
    ...overrides
  });
}

function tenantResult(operationId, response, overrides = {}) {
  return {
    operationId,
    replayed: false,
    response,
    schemaVersion: "tenant_protocol_result.v1",
    ...overrides
  };
}

function capture(runtimeState = runtime(), options = {}) {
  return createM1BAcceptanceNormalResponseCapture({
    location: { protocol: "http:", hostname: "127.0.0.1" },
    getRuntimeState: () => runtimeState,
    now: () => NOW,
    ...options
  });
}

function observe(controller, input, requestPermit = undefined) {
  const permit = requestPermit === undefined
    ? controller.acquireRequestPermit(input.requestedOperationId)
    : requestPermit;
  return controller.observeTenantApiResult({
    ...input,
    requestPermit: permit
  });
}

test("captures the exact response from a real tenantApi-shaped result and removes it after one read", () => {
  const controller = capture();
  controller.arm(armToken());
  assert.equal(controller.snapshot().armEpoch, 1);
  const response = {
    workspaceKind: "human_borrower",
    humanOfferReview: null,
    hasMore: false,
    serverTruth: true,
    schemaVersion: "tenant_workspace_resume_view.v2"
  };
  assert.equal(observe(controller, {
    requestedOperationId: "pilotReadWorkspaceResume",
    requestId: "request_capture_workspace_0001",
    responseRequestIdHeader: "request_capture_workspace_0001",
    correlationId: "correlation_capture_workspace_0001",
    result: tenantResult("pilotReadWorkspaceResume", response)
  }), true);
  assert.equal(controller.snapshot().phase, "ready");

  const copied = controller.consume();
  assert.deepEqual(copied, {
    schemaVersion: "m1_b_acceptance_operator_response.v1",
    flow: "human",
    sequence: 1,
    requestId: "request_capture_workspace_0001",
    correlationId: "correlation_capture_workspace_0001",
    armChallenge: CHALLENGE_A,
    armIssuedAt: NOW.toISOString(),
    armClockDomain: M1_B_ACCEPTANCE_NORMAL_RESPONSE_CLOCK_DOMAIN,
    response
  });
  assert.equal(Object.hasOwn(copied.response, "operationId"), false);
  assert.equal(Object.hasOwn(copied.response, "replayed"), false);
  assert.equal(controller.snapshot().phase, "consumed");
  assert.throws(
    () => controller.consume(),
    (error) => error.code === "m1_b_capture_response_unavailable"
  );
  assert.throws(
    () => controller.arm(armToken()),
    (error) => error.code === "m1_b_capture_challenge_reused"
  );
});

test("an armed capture rejects a missing or mismatched raw response request ID echo", () => {
  for (const responseRequestIdHeader of [
    undefined,
    null,
    "request_capture_workspace_wrong_0002"
  ]) {
    const controller = capture();
    controller.arm(armToken());
    assert.equal(observe(controller, {
      requestedOperationId: "pilotReadWorkspaceResume",
      requestId: "request_capture_workspace_exact_0001",
      responseRequestIdHeader,
      correlationId: "correlation_capture_workspace_exact_0001",
      result: tenantResult("pilotReadWorkspaceResume", {
        schemaVersion: "tenant_workspace_resume_view.v2"
      })
    }), false);
    assert.equal(controller.snapshot().phase, "failed");
    assert.equal(controller.snapshot().statusCode, "tenant_result_invalid");
  }
});

test("allows only the closed normal-UI preflight before the armed mutation", () => {
  const controller = capture();
  controller.arm(armToken({
    sequence: 2,
    operationId: "pilotAcceptCreditOffer",
    responseSchemaVersion: "tenant_credit_offer_accepted.v1"
  }));
  assert.equal(observe(controller, {
    requestedOperationId: "pilotReadWorkspaceResume",
    requestId: "request_capture_preflight_0001",
    responseRequestIdHeader: "request_capture_preflight_0001",
    correlationId: "correlation_capture_preflight_0001",
    result: tenantResult("pilotReadWorkspaceResume", {
      schemaVersion: "tenant_workspace_resume_view.v2"
    })
  }), false);
  assert.equal(controller.snapshot().phase, "armed");
  assert.equal(observe(controller, {
    requestedOperationId: "pilotAcceptCreditOffer",
    requestId: "request_capture_accept_0001",
    responseRequestIdHeader: "request_capture_accept_0001",
    correlationId: "correlation_capture_accept_0001",
    result: tenantResult("pilotAcceptCreditOffer", {
      offerStatus: "accepted",
      sandboxOnly: true,
      schemaVersion: "tenant_credit_offer_accepted.v1"
    })
  }), true);
  assert.equal(controller.consume().response.offerStatus, "accepted");
});

test("an unexpected operation consumes the arm fail-closed and cannot be recovered by a later target", () => {
  const controller = capture();
  controller.arm(armToken());
  assert.equal(observe(controller, {
    requestedOperationId: "pilotReadHumanSelf",
    requestId: "request_capture_mismatch_0001",
    responseRequestIdHeader: "request_capture_mismatch_0001",
    correlationId: "correlation_capture_mismatch_0001",
    result: tenantResult("pilotReadHumanSelf", {
      schemaVersion: "tenant_human_subject_view.v1"
    })
  }), false);
  assert.equal(controller.snapshot().phase, "failed");
  assert.equal(observe(controller, {
    requestedOperationId: "pilotReadWorkspaceResume",
    requestId: "request_capture_workspace_0002",
    responseRequestIdHeader: "request_capture_workspace_0002",
    correlationId: "correlation_capture_workspace_0002",
    result: tenantResult("pilotReadWorkspaceResume", {
      schemaVersion: "tenant_workspace_resume_view.v2"
    })
  }), false);
  assert.throws(
    () => controller.arm(armToken()),
    (error) => error.code === "m1_b_capture_challenge_reused"
  );
});

test("a request started before arming cannot satisfy a later arm", () => {
  const controller = capture();
  const preArmPermit = controller.acquireRequestPermit(
    "pilotReadWorkspaceResume"
  );
  assert.equal(preArmPermit, null);
  controller.arm(armToken());
  assert.equal(observe(controller, {
    requestedOperationId: "pilotReadWorkspaceResume",
    requestId: "request_capture_pre_arm_0001",
    responseRequestIdHeader: "request_capture_pre_arm_0001",
    correlationId: "correlation_capture_pre_arm_0001",
    result: tenantResult("pilotReadWorkspaceResume", {
      schemaVersion: "tenant_workspace_resume_view.v2"
    })
  }, preArmPermit), false);
  assert.equal(controller.snapshot().phase, "failed");
  assert.equal(controller.snapshot().statusCode, "request_permit_invalid");
});

test("mid-flight rearm and an old-arm response both fail closed", () => {
  const controller = capture();
  controller.arm(armToken());
  const oldPermit = controller.acquireRequestPermit(
    "pilotReadWorkspaceResume"
  );
  assert.ok(oldPermit);
  assert.throws(
    () => controller.arm(armToken({ challenge: CHALLENGE_B })),
    (error) => error.code === "m1_b_capture_rearm_rejected"
  );
  assert.equal(controller.snapshot().phase, "failed");
  assert.equal(controller.snapshot().statusCode, "rearm_rejected");

  controller.arm(armToken({ challenge: CHALLENGE_B }));
  assert.equal(observe(controller, {
    requestedOperationId: "pilotReadWorkspaceResume",
    requestId: "request_capture_old_arm_0001",
    responseRequestIdHeader: "request_capture_old_arm_0001",
    correlationId: "correlation_capture_old_arm_0001",
    result: tenantResult("pilotReadWorkspaceResume", {
      schemaVersion: "tenant_workspace_resume_view.v2"
    })
  }, oldPermit), false);
  assert.equal(controller.snapshot().phase, "failed");
  assert.equal(controller.snapshot().statusCode, "request_permit_invalid");
});

test("two same-arm requests cannot share or race one response permit", () => {
  const controller = capture();
  controller.arm(armToken());
  const firstPermit = controller.acquireRequestPermit(
    "pilotReadWorkspaceResume"
  );
  assert.ok(firstPermit);
  assert.equal(
    controller.acquireRequestPermit("pilotReadWorkspaceResume"),
    null
  );
  assert.equal(controller.snapshot().phase, "failed");
  assert.equal(controller.snapshot().statusCode, "concurrent_request_started");
  assert.equal(observe(controller, {
    requestedOperationId: "pilotReadWorkspaceResume",
    requestId: "request_capture_concurrent_0001",
    responseRequestIdHeader: "request_capture_concurrent_0001",
    correlationId: "correlation_capture_concurrent_0001",
    result: tenantResult("pilotReadWorkspaceResume", {
      schemaVersion: "tenant_workspace_resume_view.v2"
    })
  }, firstPermit), false);
});

test("rejects replayed, malformed, mismatched, and sensitive tenant results without exposing them", () => {
  const cases = [
    tenantResult("pilotReadWorkspaceResume", {
      schemaVersion: "tenant_workspace_resume_view.v2"
    }, { replayed: true }),
    {
      ...tenantResult("pilotReadWorkspaceResume", {
        schemaVersion: "tenant_workspace_resume_view.v2"
      }),
      requestHeaders: { cookie: "forbidden" }
    },
    tenantResult("pilotReadHumanSelf", {
      schemaVersion: "tenant_workspace_resume_view.v2"
    }),
    tenantResult("pilotReadWorkspaceResume", {
      sessionId: "forbidden-session",
      schemaVersion: "tenant_workspace_resume_view.v2"
    }),
    tenantResult("pilotReadWorkspaceResume", {
      actionConfirmation: { rawSignaturePersisted: false },
      schemaVersion: "tenant_workspace_resume_view.v2"
    }),
    tenantResult("pilotReadWorkspaceResume", {
      accountAddress: `0x${"a".repeat(40)}`,
      schemaVersion: "tenant_workspace_resume_view.v2"
    })
  ];
  cases.forEach((result, index) => {
    const controller = capture();
    controller.arm(armToken({
      challenge: index === 0
        ? CHALLENGE_A
        : `m1_b_normal_response_${index}1234567-89ab-4def-8123-456789abcdef`
    }));
    observe(controller, {
      requestedOperationId: "pilotReadWorkspaceResume",
      requestId: `request_capture_unsafe_${index}001`,
      responseRequestIdHeader: `request_capture_unsafe_${index}001`,
      correlationId: `correlation_capture_unsafe_${index}001`,
      result
    });
    assert.equal(controller.snapshot().phase, "failed");
    assert.throws(
      () => controller.consume(),
      (error) => error.code === "m1_b_capture_response_unavailable"
    );
  });
});

test("arm token parsing is closed, expiring, role-bound, and unavailable off loopback", () => {
  const controller = capture();
  for (const token of [
    armToken({ extra: true }),
    armToken({ sequence: 9 }),
    armToken({ actorRole: "capital_partner" }),
    armToken({ expiresAt: NOW.toISOString() }),
    armToken({ clockDomain: "host_process_clock" }),
    armToken({ challenge: "predictable" })
  ]) {
    assert.throws(
      () => controller.arm(token),
      (error) => error instanceof M1BAcceptanceNormalResponseCaptureError &&
        error.code === "m1_b_capture_arm_invalid"
    );
  }

  const wrongRole = capture(runtime({
    workspaceKind: "capital_partner",
    hostWorkspaceName: "capitalPartner"
  }));
  assert.throws(
    () => wrongRole.arm(armToken()),
    (error) => error.code === "m1_b_capture_runtime_mismatch"
  );
  assert.throws(
    () => createM1BAcceptanceNormalResponseCapture({
      location: { protocol: "https:", hostname: "example.test" },
      getRuntimeState: () => runtime()
    }),
    (error) => error.code === "m1_b_capture_unavailable"
  );
});

test("Capital Partner inbox uses only the exact existing self preflight and binds its own role", () => {
  const cpRuntime = runtime({
    workspaceKind: "capital_partner",
    hostWorkspaceName: "capitalPartner"
  });
  const controller = capture(cpRuntime);
  controller.arm(armToken({
    challenge: CHALLENGE_B,
    flow: "capital_partner",
    sequence: 2,
    actorRole: "capital_partner",
    operationId: "pilotReadCapitalPartnerPassportInbox",
    responseSchemaVersion: "tenant_capital_partner_passport_inbox_view.v1"
  }));
  assert.equal(controller.armedReadOperation(), "pilotReadCapitalPartnerPassportInbox");
  observe(controller, {
    requestedOperationId: "pilotReadCapitalPartnerSelf",
    requestId: "request_capture_cp_self_0001",
    responseRequestIdHeader: "request_capture_cp_self_0001",
    correlationId: "correlation_capture_cp_self_0001",
    result: tenantResult("pilotReadCapitalPartnerSelf", {
      schemaVersion: "tenant_capital_partner_self_view.v1"
    })
  });
  assert.equal(observe(controller, {
    requestedOperationId: "pilotReadCapitalPartnerPassportInbox",
    requestId: "request_capture_cp_inbox_0001",
    responseRequestIdHeader: "request_capture_cp_inbox_0001",
    correlationId: "correlation_capture_cp_inbox_0001",
    result: tenantResult("pilotReadCapitalPartnerPassportInbox", {
      items: [],
      count: 0,
      hasMore: false,
      fundsAuthority: false,
      serverTruth: true,
      readOnly: true,
      schemaVersion: "tenant_capital_partner_passport_inbox_view.v1"
    })
  }), true);
  assert.equal(controller.consume().flow, "capital_partner");
});

test("an armed challenge expires before observation and a captured response has a bounded copy window", () => {
  let clock = new Date(NOW);
  const controller = capture(runtime(), { now: () => clock });
  controller.arm(armToken());
  clock = new Date(NOW.getTime() + 15 * 60_000 + 1);
  assert.equal(observe(controller, {
    requestedOperationId: "pilotReadWorkspaceResume",
    requestId: "request_capture_expired_0001",
    responseRequestIdHeader: "request_capture_expired_0001",
    correlationId: "correlation_capture_expired_0001",
    result: tenantResult("pilotReadWorkspaceResume", {
      schemaVersion: "tenant_workspace_resume_view.v2"
    })
  }), false);
  assert.equal(controller.snapshot().statusCode, "arm_expired");

  clock = new Date(NOW);
  const ready = capture(runtime(), { now: () => clock });
  ready.arm(armToken({ challenge: CHALLENGE_B }));
  observe(ready, {
    requestedOperationId: "pilotReadWorkspaceResume",
    requestId: "request_capture_copy_expiry_0001",
    responseRequestIdHeader: "request_capture_copy_expiry_0001",
    correlationId: "correlation_capture_copy_expiry_0001",
    result: tenantResult("pilotReadWorkspaceResume", {
      schemaVersion: "tenant_workspace_resume_view.v2"
    })
  });
  clock = new Date(NOW.getTime() + 2 * 60_000 + 1);
  assert.throws(
    () => ready.consume(),
    (error) => error.code === "m1_b_capture_response_unavailable"
  );
  assert.equal(ready.snapshot().statusCode, "copy_window_expired");
});

test("all thirteen critical and two expired-Offer prompts capture only exact tenantApi result.response", () => {
  assert.equal(M1_B_ACCEPTANCE_NORMAL_RESPONSE_DEFINITIONS.length, 15);
  assert.deepEqual(
    M1_B_ACCEPTANCE_NORMAL_RESPONSE_DEFINITIONS
      .filter(({ flow }) => flow === "expired_offer_setup")
      .map(({ sequence, operationId, readOnly }) => ({
        sequence,
        operationId,
        readOnly
      })),
    [
      {
        sequence: 1,
        operationId: "pilotReadCapitalPartnerPassportInbox",
        readOnly: true
      },
      {
        sequence: 2,
        operationId: "pilotAuthorCapitalPartnerOffer",
        readOnly: false
      }
    ]
  );
  M1_B_ACCEPTANCE_NORMAL_RESPONSE_DEFINITIONS.forEach((definition, index) => {
    const runtimeState = definition.actorRole === "human"
      ? runtime()
      : runtime({
          workspaceKind: "capital_partner",
          hostWorkspaceName: "capitalPartner"
        });
    const controller = capture(runtimeState);
    const challenge =
      `m1_b_normal_response_${(index + 1).toString(16).padStart(8, "0")}` +
      "-89ab-4def-8123-456789abcdef";
    controller.arm(armToken({
      challenge,
      flow: definition.flow,
      sequence: definition.sequence,
      actorRole: definition.actorRole,
      operationId: definition.operationId,
      responseSchemaVersion: definition.responseSchemaVersion
    }));
    const response = {
      marker: `safe-response-${index + 1}`,
      schemaVersion: definition.responseSchemaVersion
    };
    assert.equal(observe(controller, {
      requestedOperationId: definition.operationId,
      requestId: `request_capture_all_${index + 1}_0001`,
      responseRequestIdHeader: `request_capture_all_${index + 1}_0001`,
      correlationId: `correlation_capture_all_${index + 1}_0001`,
      result: tenantResult(definition.operationId, response)
    }), true);
    const copied = controller.consume();
    assert.deepEqual(copied.response, response);
    assert.equal(Object.hasOwn(copied.response, "operationId"), false);
    assert.equal(Object.hasOwn(copied.response, "replayed"), false);
  });
});
