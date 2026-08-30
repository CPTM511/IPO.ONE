import { DomainError } from "../../../packages/domain/src/index.js";
import approvalEvidence from "../../../deploy/approvals/public-authenticated-no-funds-beta.pending.json" with { type: "json" };
import launchPolicy from "../../../deploy/launch-policy.v1.json" with { type: "json" };

const PROFILE = "public_authenticated_no_funds_beta";
const REQUIREMENT_ID = "REQ-PILOT-002";
const EXPECTED_APPROVAL_GATES = Object.freeze([
  "repository_quality",
  "tenant_authn_authz_tests",
  "durable_data_restore",
  "reconciliation_operations",
  "hosted_abuse_controls",
  "public_beta_notice",
  "founder_activation_authorization"
]);

const SOURCES = Object.freeze({
  launch: "deploy/launch-policy.v1.json",
  approvals:
    "deploy/approvals/public-authenticated-no-funds-beta.pending.json",
  constitution: "docs/PRODUCT_CONSTITUTION.md"
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
      "Public Beta readiness payload must be empty"
    );
  }
}

function assertFailClosedSourceContracts() {
  const profile = launchPolicy?.profiles?.[PROFILE];
  if (
    !profile ||
    profile.releaseEnabled !== true ||
    profile.exactProfile !== null ||
    profile.capabilities?.privateTenantDataEnabled !== true ||
    profile.capabilities?.realFundsEnabled !== false ||
    profile.capabilities?.externalProviderExecutionEnabled !== false ||
    profile.capabilities?.agentVenueExecutionEnabled !== false ||
    profile.capabilities?.mainnetAuthorized !== false ||
    profile.capabilities?.custodyAuthorized !== false ||
    profile.capabilities?.withdrawalAuthorized !== false ||
    profile.gates?.some(({ id }) => id === "pilot_participant_approval")
  ) {
    failClosed("Public Beta launch policy is outside the approved no-funds boundary");
  }
  const gates = approvalEvidence?.gates;
  if (
    approvalEvidence?.profile !== PROFILE ||
    !Array.isArray(gates) ||
    gates.length !== EXPECTED_APPROVAL_GATES.length ||
    gates.some((gate, index) => gate?.id !== EXPECTED_APPROVAL_GATES[index] || gate.status !== "pending")
  ) {
    failClosed("Public Beta release evidence is not the expected bounded template");
  }
  return profile;
}

function buildControls() {
  return Object.freeze(EXPECTED_APPROVAL_GATES.map((controlId) => {
    const gate = launchPolicy.profiles[PROFILE].gates.find(
      ({ id }) => id === controlId
    );
    const founderAuthorized = controlId === "founder_activation_authorization";
    return Object.freeze({
      controlId,
      implementationState: founderAuthorized
        ? "authorized"
        : "implemented_pending_release_verification",
      approvalStatus: founderAuthorized
        ? "approved_by_founder_decision"
        : "verification_pending",
      ownerRole: gate.ownerRole,
      namedOwnerConfigured: founderAuthorized,
      evidenceRefs: Object.freeze([
        SOURCES.launch,
        SOURCES.approvals,
        ...(founderAuthorized ? [SOURCES.constitution] : [])
      ]),
      blockerCode: founderAuthorized
        ? null
        : `${controlId}_release_evidence_pending`
    });
  }));
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
      return {
        asOf: now.toISOString(),
        profile: PROFILE,
        requirementId: REQUIREMENT_ID,
        overallStatus: "authorized_runtime_verification_pending",
        releaseEnabled: profile.releaseEnabled,
        activationAuthorized: true,
        productFeedback: {
          source: "pilot_feedback_record.v1",
          categoricalOnly: true,
          thirdPartyAnalytics: false,
          underwritingEffect: false
        },
        controls,
        summary: {
          requiredControlCount: controls.length,
          approvedControlCount: 1,
          pendingControlCount: controls.length - 1,
          unavailableControlCount: 0,
          activationReady: false
        },
        sourceBaseline: {
          operationsReleaseCandidateId: null,
          commitSha: null,
          currentCandidateVerified: false
        },
        safety: {
          piiIncluded: false,
          contactDetailsIncluded: false,
          productionAuthority: false,
          releasePolicyMutated: false
        },
        schemaVersion: "tenant_public_beta_readiness_view.v1"
      };
    }
  });
}

export function createClosedPilotReadinessHandlers() {
  return Object.freeze([readClosedPilotReadinessQueryHandler()]);
}
