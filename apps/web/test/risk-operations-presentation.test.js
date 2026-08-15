import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  RISK_OPERATIONS_POLICY_EVIDENCE,
  RISK_OPERATIONS_PRESENTATION_VERSION,
  createRiskOperationsPresentation
} from "../src/risk-operations-presentation.js";
import { AUTHORIZATION_POLICY_VERSION } from
  "../../../modules/authorization/src/authorization-constants.js";

const catalogDocument = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/ipo-one.tenant-protocol.v1.json",
    import.meta.url
  ),
  "utf8"
));
const operationalPolicy = JSON.parse(await readFile(
  new URL(
    "../../../modules/operations-control/policy/private-pilot-alert-policy.v1.json",
    import.meta.url
  ),
  "utf8"
));
const launchPolicy = JSON.parse(await readFile(
  new URL("../../../deploy/launch-policy.v1.json", import.meta.url),
  "utf8"
));
const catalogOperationIds = catalogDocument.operations.map(
  ({ operationId }) => operationId
);

function presentation(overrides = {}) {
  return createRiskOperationsPresentation({
    catalogOperationIds,
    ...overrides
  });
}

function deeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

test("Risk & Operations presentation is closed, immutable and catalog-derived", () => {
  const result = presentation();
  assert.equal(result.schemaVersion, RISK_OPERATIONS_PRESENTATION_VERSION);
  assert.equal(result.availability.portfolio, true);
  assert.equal(result.availability.health, true);
  assert.equal(result.availability.feedback, true);
  assert.equal(result.availability.servicingQueue, true);
  assert.equal(result.availability.freeze, true);
  assert.equal(result.availability.servicingResolution, true);
  assert.equal(result.catalogIsAuthorization, false);
  assert.equal(result.checkedInEvidenceIsLiveState, false);
  assert.equal(result.piiInAggregateViews, false);
  assert.equal(result.productionFundsMoved, false);
  assert.equal(deeplyFrozen(result), true);
});

test("checked-in alert and launch evidence cannot drift into a live readiness claim", () => {
  const result = presentation();
  assert.equal(
    RISK_OPERATIONS_POLICY_EVIDENCE.alertPolicyVersion,
    operationalPolicy.policyVersion
  );
  assert.equal(
    RISK_OPERATIONS_POLICY_EVIDENCE.alertRuleCount,
    operationalPolicy.rules.length
  );
  assert.equal(
    RISK_OPERATIONS_POLICY_EVIDENCE.alertDeliveryStatus,
    operationalPolicy.delivery.notificationTargetStatus
  );
  assert.equal(
    RISK_OPERATIONS_POLICY_EVIDENCE.namedIncidentOwnerStatus,
    operationalPolicy.delivery.namedOwnerStatus
  );
  assert.equal(
    RISK_OPERATIONS_POLICY_EVIDENCE.launchPolicyVersion,
    launchPolicy.policyVersion
  );
  assert.equal(
    RISK_OPERATIONS_POLICY_EVIDENCE.approvalPolicyVersion,
    AUTHORIZATION_POLICY_VERSION
  );
  assert.equal(
    RISK_OPERATIONS_POLICY_EVIDENCE.closedPilotReleaseEnabled,
    launchPolicy.profiles.closed_non_funds_pilot.releaseEnabled
  );
  assert.equal(result.operationalEvidence.alerts.liveStateLoaded, false);
  assert.equal(result.operationalEvidence.reconciliation.liveStateLoaded, false);
  assert.equal(result.operationalEvidence.launch.runtimeApprovalInferred, false);
  assert.equal(result.operationalEvidence.launch.closedPilotReleaseEnabled, false);
});

test("Borrower, Risk, Operations and Auditor policy ceilings remain separate", () => {
  const result = presentation();
  const byActor = Object.fromEntries(
    result.actorPolicyCeilings.map((entry) => [entry.actorType, entry])
  );
  assert.deepEqual(byActor.borrower, {
    actorType: "borrower",
    portfolio: false,
    health: false,
    feedback: false,
    servicingQueue: false,
    freeze: false,
    servicingResolution: false
  });
  assert.equal(byActor.risk_operator.portfolio, true);
  assert.equal(byActor.risk_operator.freeze, true);
  assert.equal(byActor.risk_operator.servicingResolution, false);
  assert.equal(byActor.operations_operator.portfolio, false);
  assert.equal(byActor.operations_operator.servicingQueue, true);
  assert.equal(byActor.operations_operator.servicingResolution, true);
  assert.equal(byActor.auditor.portfolio, true);
  assert.equal(byActor.auditor.servicingQueue, false);
  assert.equal(byActor.auditor.freeze, false);
});

test("dual-controlled servicing resolution is not relabelled as browser approval", () => {
  const result = presentation();
  assert.equal(
    result.operationalEvidence.approvals.state,
    "exact_external_artifact_required"
  );
  assert.equal(
    result.operationalEvidence.approvals.exactCommandBound,
    true
  );
  assert.equal(
    result.operationalEvidence.approvals.proposalLocatorIsAuthority,
    false
  );
  assert.equal(
    result.operationalEvidence.approvals.browserProposalWorkflowAvailable,
    false
  );
  assert.deepEqual(
    result.operationalEvidence.approvals.requiredDistinctApproverRoles,
    ["risk_operator", "operations_operator"]
  );
  assert.equal(result.breakGlassEnabled, false);
  assert.equal(result.disabledCapabilities.includes("unfreeze"), true);
  assert.equal(result.disabledCapabilities.includes("limit_increase"), true);
});

test("missing catalog operations fail closed without inventing authority", () => {
  const result = presentation({ catalogOperationIds: ["pilotReadTenantRisk"] });
  assert.equal(result.availability.portfolio, true);
  assert.equal(result.availability.health, false);
  assert.equal(result.availability.servicingQueue, false);
  assert.equal(result.availability.freeze, false);
  assert.equal(result.availability.servicingResolution, false);
  assert.equal(
    result.operationalEvidence.approvals.state,
    "operation_unavailable"
  );
  assert.deepEqual(
    result.operationalEvidence.approvals.servicingResolutionOperations,
    []
  );
});

test("presentation rejects unknown fields, unsafe identifiers and duplicates", () => {
  assert.equal(createRiskOperationsPresentation({
    catalogOperationIds,
    actorType: "risk_operator"
  }), null);
  assert.equal(createRiskOperationsPresentation({
    catalogOperationIds: ["pilotReadTenantRisk", "pilotReadTenantRisk"]
  }), null);
  assert.equal(createRiskOperationsPresentation({
    catalogOperationIds: ["pilotReadTenantRisk<script>"]
  }), null);
});
