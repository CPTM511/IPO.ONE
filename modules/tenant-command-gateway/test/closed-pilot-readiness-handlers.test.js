import assert from "node:assert/strict";
import test from "node:test";
import { readClosedPilotReadinessQueryHandler } from "../src/closed-pilot-readiness-handlers.js";

const NOW = new Date("2026-08-29T04:00:00.000Z");

test("closed-pilot readiness remains queryable, versioned, and fail-closed", async () => {
  const response = await readClosedPilotReadinessQueryHandler().execute({
    authorizationDecision: {
      resourceType: "risk_portfolio",
      resourceId: "risk_portfolio_closed_pilot"
    },
    payload: {},
    now: NOW
  });

  assert.equal(response.schemaVersion, "tenant_closed_pilot_readiness_view.v1");
  assert.equal(response.requirementId, "REQ-PILOT-002");
  assert.equal(response.overallStatus, "blocked_pending_approvals");
  assert.equal(response.releaseEnabled, false);
  assert.equal(response.activationAuthorized, false);
  assert.equal(response.summary.requiredControlCount, 7);
  assert.equal(response.summary.approvedControlCount, 0);
  assert.equal(response.summary.pendingControlCount, 7);
  assert.equal(response.summary.unavailableControlCount, 2);
  assert.equal(response.summary.activationReady, false);
  assert.deepEqual(
    response.controls.map(({ controlId }) => controlId),
    ["retention", "ordinary_support", "incident", "restore", "rollback", "on_call", "notification"]
  );
  assert.ok(response.controls.every((control) => control.approvalStatus === "pending"));
  assert.ok(response.controls.every((control) => control.namedOwnerConfigured === false));
  assert.equal(response.productFeedback.categoricalOnly, true);
  assert.equal(response.productFeedback.thirdPartyAnalytics, false);
  assert.equal(response.productFeedback.underwritingEffect, false);
  assert.equal(response.sourceBaseline.currentCandidateVerified, false);
  assert.equal(response.safety.piiIncluded, false);
  assert.equal(response.safety.contactDetailsIncluded, false);
  assert.equal(response.safety.productionAuthority, false);
  assert.doesNotMatch(JSON.stringify(response), /\[APPROVER\]|EVIDENCE_URL|approvalUrl|approvedBy/i);
});

test("closed-pilot readiness rejects non-empty input and unscoped resources", async () => {
  const handler = readClosedPilotReadinessQueryHandler();
  await assert.rejects(
    handler.execute({
      authorizationDecision: { resourceType: "risk_portfolio", resourceId: "risk_portfolio" },
      payload: { activate: true },
      now: NOW
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  await assert.rejects(
    handler.execute({
      authorizationDecision: { resourceType: "workspace", resourceId: "workspace" },
      payload: {},
      now: NOW
    }),
    (error) => error.code === "resource_unavailable"
  );
});
