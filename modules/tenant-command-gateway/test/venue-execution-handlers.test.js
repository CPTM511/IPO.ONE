import assert from "node:assert/strict";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  TenantCommandHandlerRegistry,
  VENUE_EXECUTION_OPERATION_IDS,
  createVenueExecutionHandlers
} from "../src/index.js";

function h(scope) {
  return hashId("hyperliquid002_tenant_handler", { scope });
}

function application(calls) {
  const record = (method) => async (context) => {
    calls.push({ method, context });
    return {
      event: {
        aggregateType: "venue_execution_fixture",
        aggregateId: context.resourceId,
        aggregateVersion: 1,
        eventType: `venue.${method}`,
        payload: { method }
      },
      response: { method, schemaVersion: `tenant_venue_${method}.v1` }
    };
  };
  return Object.freeze({
    discoverCapabilities: record("discover_capabilities"),
    readBinding: record("read_binding"),
    prepareDelegate: record("prepare_delegate"),
    assertActivationDisabled: record("activation_disabled"),
    assertRevocationDisabled: record("revocation_disabled"),
    prepareExecution: record("prepare_execution"),
    assertSubmissionDisabled: record("submission_disabled"),
    readExecution: record("read_execution")
  });
}

function resource(resourceType, resourceId = `${resourceType}_hyperliquid002`) {
  return { resourceType, resourceId };
}

function context(resourceType, payload, reasonCode) {
  return {
    payload,
    reasonCode,
    authorizationDecision: {
      resourceType,
      resourceId: `${resourceType}_hyperliquid002`
    }
  };
}

test("Venue handlers register exactly the ADR-038 canonical operation family", () => {
  const registry = new TenantCommandHandlerRegistry(
    createVenueExecutionHandlers({ application: application([]) })
  );
  assert.deepEqual(
    registry.listOperationIds(),
    [...VENUE_EXECUTION_OPERATION_IDS].sort()
  );
});

test("delegate preparation accepts only hash references and canonical expiry", async () => {
  const calls = [];
  const handler = createVenueExecutionHandlers({ application: application(calls) })
    .find(({ operationId }) => operationId === "venuePrepareDelegate");
  const payload = {
    delegateAddressHash: h("delegate"),
    signerReferenceHash: h("signer"),
    requestedExpiresAt: "2026-08-09T08:00:00.000Z"
  };
  handler.preflight({ payload, resource: resource("venue_binding") });
  await handler.plan(context("venue_binding", payload));
  assert.equal(calls[0].method, "prepare_delegate");
  assert.throws(
    () =>
      handler.preflight({
        payload: { ...payload, privateKey: "never" },
        resource: resource("venue_binding")
      }),
    { code: "invalid_tenant_command_payload" }
  );
});

test("delegate activation, external revocation and submission are blocked locally", async () => {
  const calls = [];
  const handlers = createVenueExecutionHandlers({ application: application(calls) });
  const activation = handlers.find(
    ({ operationId }) => operationId === "venueActivateDelegate"
  );
  const revocation = handlers.find(
    ({ operationId }) => operationId === "venueRevokeDelegate"
  );
  const submission = handlers.find(
    ({ operationId }) => operationId === "venueSubmitExecution"
  );
  await assert.rejects(
    activation.plan(
      context("venue_delegate", { expectedDelegateHash: h("delegate") })
    ),
    { code: "venue_delegate_activation_disabled_l0_local_no_funds" }
  );
  await assert.rejects(
    revocation.plan(context("venue_delegate", {}, "security_incident")),
    { code: "venue_delegate_revocation_disabled_l0_local_no_funds" }
  );
  await assert.rejects(
    submission.plan(
      context("venue_execution", { preparedExecutionHash: h("prepared") })
    ),
    { code: "venue_execution_submission_disabled_l0_local_no_funds" }
  );
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["activation_disabled", "revocation_disabled", "submission_disabled"]
  );
});

test("wrong resources and unknown revocation reasons fail closed", async () => {
  const handler = createVenueExecutionHandlers({ application: application([]) })
    .find(({ operationId }) => operationId === "venueRevokeDelegate");
  assert.throws(
    () => handler.preflight({ payload: {}, resource: resource("wallet_execution") }),
    { code: "invalid_tenant_command_payload" }
  );
  await assert.rejects(
    handler.plan(context("venue_delegate", {}, "unreviewed_reason")),
    { code: "invalid_tenant_command_payload" }
  );
});
