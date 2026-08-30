import assert from "node:assert/strict";
import test from "node:test";
import { readClosedPilotReadinessQueryHandler } from "../src/closed-pilot-readiness-handlers.js";

const NOW = new Date("2026-08-29T04:00:00.000Z");

test("public Beta readiness remains queryable, versioned, and no-funds bounded", async () => {
  const response = await readClosedPilotReadinessQueryHandler().execute({
    authorizationDecision: {
      resourceType: "risk_portfolio",
      resourceId: "risk_portfolio_closed_pilot"
    },
    payload: {},
    now: NOW
  });

  assert.equal(response.schemaVersion, "tenant_public_beta_readiness_view.v1");
  assert.equal(response.requirementId, "REQ-PILOT-002");
  assert.equal(response.profile, "public_authenticated_no_funds_beta");
  assert.equal(response.overallStatus, "authorized_runtime_verification_pending");
  assert.equal(response.releaseEnabled, true);
  assert.equal(response.activationAuthorized, true);
  assert.equal(response.summary.requiredControlCount, 7);
  assert.equal(response.summary.approvedControlCount, 1);
  assert.equal(response.summary.pendingControlCount, 6);
  assert.equal(response.summary.unavailableControlCount, 0);
  assert.equal(response.summary.activationReady, false);
  assert.deepEqual(
    response.controls.map(({ controlId }) => controlId),
    [
      "repository_quality",
      "tenant_authn_authz_tests",
      "durable_data_restore",
      "reconciliation_operations",
      "hosted_abuse_controls",
      "public_beta_notice",
      "founder_activation_authorization"
    ]
  );
  assert.equal(
    response.controls.find(({ controlId }) =>
      controlId === "founder_activation_authorization"
    ).approvalStatus,
    "approved_by_founder_decision"
  );
  assert.equal(response.controls.filter(({ namedOwnerConfigured }) => namedOwnerConfigured).length, 1);
  assert.equal(response.productFeedback.categoricalOnly, true);
  assert.equal(response.productFeedback.thirdPartyAnalytics, false);
  assert.equal(response.productFeedback.underwritingEffect, false);
  assert.equal(response.sourceBaseline.currentCandidateVerified, false);
  assert.equal(response.safety.piiIncluded, false);
  assert.equal(response.safety.contactDetailsIncluded, false);
  assert.equal(response.safety.productionAuthority, false);
  assert.doesNotMatch(JSON.stringify(response), /\[APPROVER\]|EVIDENCE_URL|approvalUrl|approvedBy/i);
});

test("public Beta readiness rejects non-empty input and unscoped resources", async () => {
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
