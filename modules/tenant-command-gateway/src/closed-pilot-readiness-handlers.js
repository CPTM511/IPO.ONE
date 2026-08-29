import { DomainError } from "../../../packages/domain/src/index.js";
import approvalEvidence from "../../../deploy/approvals/closed-non-funds-pilot.pending.json" with { type: "json" };
import operationsBaseline from "../../../deploy/closed-pilot/operations.v1.json" with { type: "json" };
import launchPolicy from "../../../deploy/launch-policy.v1.json" with { type: "json" };
import alertPolicy from "../../operations-control/policy/private-pilot-alert-policy.v1.json" with { type: "json" };

const PROFILE = "closed_non_funds_pilot";
const REQUIREMENT_ID = "REQ-PILOT-002";
const EXPECTED_APPROVAL_GATES = Object.freeze([
  "security_001_approval",
  "tenant_authn_authz_tests",
  "durable_data_restore",
  "reconciliation_operations",
  "independent_pentest",
  "privacy_legal_terms",
  "support_slo_oncall",
  "pilot_participant_approval"
]);

const SOURCES = Object.freeze({
  launch: "deploy/launch-policy.v1.json",
  operations: "deploy/closed-pilot/operations.v1.json",
  approvals: "deploy/approvals/closed-non-funds-pilot.pending.json",
  alerts: "modules/operations-control/policy/private-pilot-alert-policy.v1.json",
  runbook: "docs/operations/PRIVATE_PILOT_ALERT_AND_INCIDENT_RUNBOOK.md"
});

function failClosed(message) {
  throw new DomainError("closed_pilot_readiness_contract_invalid", message);
}

function assertEmptyPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== 0
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Closed-pilot readiness payload must be empty"
    );
  }
}

function assertFailClosedSourceContracts() {
  const profile = launchPolicy?.profiles?.[PROFILE];
  if (!profile || profile.releaseEnabled !== false || profile.exactProfile !== null) {
    failClosed("Closed-pilot launch policy is not fail-closed");
  }
  if (
    operationsBaseline?.profile !== PROFILE ||
    operationsBaseline.launchBlocked !== true ||
    operationsBaseline.authority?.remoteParticipantAccessEnabled !== false ||
    operationsBaseline.authority?.notificationDeliveryEnabled !== false ||
    operationsBaseline.authority?.realFundsEnabled !== false
  ) {
    failClosed("Closed-pilot operations baseline is not fail-closed");
  }
  const gates = approvalEvidence?.gates;
  if (
    approvalEvidence?.profile !== PROFILE ||
    !Array.isArray(gates) ||
    gates.length !== EXPECTED_APPROVAL_GATES.length ||
    gates.some((gate, index) => gate?.id !== EXPECTED_APPROVAL_GATES[index] || gate.status !== "pending")
  ) {
    failClosed("Closed-pilot approval evidence is not the expected pending template");
  }
  if (
    alertPolicy?.environment !== "closed-pilot" ||
    alertPolicy.delivery?.notificationTargetStatus !== "unconfigured" ||
    alertPolicy.delivery?.namedOwnerStatus !== "unconfigured" ||
    alertPolicy.safetyBoundary?.productionReleaseAuthority !== false
  ) {
    failClosed("Closed-pilot alert policy is not the expected unconfigured baseline");
  }
  return profile;
}

function control({ controlId, ownerRole, implementationState, evidenceRefs, blockerCode }) {
  return Object.freeze({
    controlId,
    implementationState,
    approvalStatus: "pending",
    ownerRole,
    namedOwnerConfigured: false,
    evidenceRefs: Object.freeze(evidenceRefs),
    blockerCode
  });
}

function buildControls() {
  return Object.freeze([
    control({
      controlId: "retention",
      ownerRole: "Legal/Privacy",
      implementationState: "specified_unverified",
      evidenceRefs: [SOURCES.launch, SOURCES.approvals, SOURCES.runbook],
      blockerCode: "jurisdiction_retention_owner_and_approval_pending"
    }),
    control({
      controlId: "ordinary_support",
      ownerRole: "Operations/Product",
      implementationState: "specified_unverified",
      evidenceRefs: [SOURCES.launch, SOURCES.approvals, SOURCES.runbook],
      blockerCode: "support_slo_named_owner_and_approval_pending"
    }),
    control({
      controlId: "incident",
      ownerRole: "Operations/Security",
      implementationState: "implemented_unverified",
      evidenceRefs: [SOURCES.operations, SOURCES.alerts, SOURCES.runbook],
      blockerCode: "incident_owner_delivery_and_drill_pending"
    }),
    control({
      controlId: "restore",
      ownerRole: "Backend/DevOps",
      implementationState: "specified_unverified",
      evidenceRefs: [SOURCES.operations, SOURCES.approvals],
      blockerCode: "provider_objectives_owner_and_restore_drill_pending"
    }),
    control({
      controlId: "rollback",
      ownerRole: "Operations/Release",
      implementationState: "specified_unverified",
      evidenceRefs: [SOURCES.operations, SOURCES.runbook],
      blockerCode: "rollback_owner_activation_and_drill_pending"
    }),
    control({
      controlId: "on_call",
      ownerRole: "Operations/Product",
      implementationState: "unavailable",
      evidenceRefs: [SOURCES.approvals, SOURCES.runbook],
      blockerCode: "named_rota_owner_and_approval_pending"
    }),
    control({
      controlId: "notification",
      ownerRole: "Operations/Security",
      implementationState: "unavailable",
      evidenceRefs: [SOURCES.operations, SOURCES.alerts, SOURCES.runbook],
      blockerCode: "provider_named_recipients_owner_and_delivery_drill_pending"
    })
  ]);
}

export function readClosedPilotReadinessQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadClosedPilotReadiness",
    kind: "query",
    async execute({ authorizationDecision, payload, now }) {
      assertEmptyPayload(payload);
      if (
        authorizationDecision?.resourceType !== "risk_portfolio" ||
        typeof authorizationDecision.resourceId !== "string" ||
        authorizationDecision.resourceId.length === 0
      ) {
        throw new DomainError("resource_unavailable", "The requested resource is unavailable.");
      }
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new DomainError("invalid_tenant_command_clock", "tenant command clock is invalid");
      }
      const profile = assertFailClosedSourceContracts();
      const controls = buildControls();
      const unavailableControlCount = controls.filter(
        (item) => item.implementationState === "unavailable"
      ).length;
      return {
        asOf: now.toISOString(),
        profile: PROFILE,
        requirementId: REQUIREMENT_ID,
        overallStatus: "blocked_pending_approvals",
        releaseEnabled: profile.releaseEnabled,
        activationAuthorized: false,
        productFeedback: {
          source: "pilot_feedback_record.v1",
          categoricalOnly: true,
          thirdPartyAnalytics: false,
          underwritingEffect: false
        },
        controls,
        summary: {
          requiredControlCount: controls.length,
          approvedControlCount: 0,
          pendingControlCount: controls.length,
          unavailableControlCount,
          activationReady: false
        },
        sourceBaseline: {
          operationsReleaseCandidateId: operationsBaseline.sourceRelease.releaseCandidateId,
          commitSha: operationsBaseline.sourceRelease.commitSha,
          currentCandidateVerified: false
        },
        safety: {
          piiIncluded: false,
          contactDetailsIncluded: false,
          productionAuthority: false,
          releasePolicyMutated: false
        },
        schemaVersion: "tenant_closed_pilot_readiness_view.v1"
      };
    }
  });
}

export function createClosedPilotReadinessHandlers() {
  return Object.freeze([readClosedPilotReadinessQueryHandler()]);
}
