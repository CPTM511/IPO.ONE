export const RISK_OPERATIONS_PRESENTATION_VERSION =
  "risk_operations_presentation.v1";

export const RISK_OPERATIONS_POLICY_EVIDENCE = Object.freeze({
  alertPolicyVersion: "ops_001b.v1",
  alertRuleCount: 7,
  alertDeliveryStatus: "unconfigured",
  namedIncidentOwnerStatus: "unconfigured",
  reconciliationSchemaVersion: "reconciliation_summary.v1",
  approvalPolicyVersion: "security_001.v1",
  launchPolicyVersion: "1.2.0",
  closedPilotReleaseEnabled: false
});

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const READ_OPERATIONS = Object.freeze({
  portfolio: "pilotReadTenantRisk",
  health: "pilotReadPilotHealth",
  feedback: "pilotReadPilotFeedbackSummary",
  queue: "pilotReadServicingQueue"
});
const RESOLUTION_OPERATIONS = Object.freeze([
  "pilotRestructureSandboxObligation",
  "pilotRepurchaseSandboxObligation",
  "pilotWriteOffSandboxObligation"
]);

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function closedRecord(value, required) {
  if (!plainRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || !required.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") &&
      !descriptor.get && !descriptor.set;
  });
}

function uniqueIdentifiers(values) {
  return Array.isArray(values) &&
    values.length <= 128 &&
    new Set(values).size === values.length &&
    values.every((value) => typeof value === "string" && IDENTIFIER.test(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function operationAvailability(catalog) {
  return Object.freeze({
    portfolio: catalog.has(READ_OPERATIONS.portfolio),
    health: catalog.has(READ_OPERATIONS.health),
    feedback: catalog.has(READ_OPERATIONS.feedback),
    servicingQueue: catalog.has(READ_OPERATIONS.queue),
    freeze: catalog.has("pilotFreezeSubject"),
    servicingResolution: RESOLUTION_OPERATIONS.every((operationId) =>
      catalog.has(operationId)
    )
  });
}

function actorPolicyCeilings(availability) {
  return Object.freeze([
    Object.freeze({
      actorType: "borrower",
      portfolio: false,
      health: false,
      feedback: false,
      servicingQueue: false,
      freeze: false,
      servicingResolution: false
    }),
    Object.freeze({
      actorType: "risk_operator",
      portfolio: availability.portfolio,
      health: availability.health,
      feedback: availability.feedback,
      servicingQueue: availability.servicingQueue,
      freeze: availability.freeze,
      servicingResolution: false
    }),
    Object.freeze({
      actorType: "operations_operator",
      portfolio: false,
      health: availability.health,
      feedback: availability.feedback,
      servicingQueue: availability.servicingQueue,
      freeze: availability.freeze,
      servicingResolution: availability.servicingResolution
    }),
    Object.freeze({
      actorType: "auditor",
      portfolio: availability.portfolio,
      health: availability.health,
      feedback: availability.feedback,
      servicingQueue: false,
      freeze: false,
      servicingResolution: false
    })
  ]);
}

export function createRiskOperationsPresentation(input) {
  if (
    !closedRecord(input, ["catalogOperationIds"]) ||
    !uniqueIdentifiers(input.catalogOperationIds)
  ) return null;

  const catalog = new Set(input.catalogOperationIds);
  const availability = operationAvailability(catalog);

  return deepFreeze({
    schemaVersion: RISK_OPERATIONS_PRESENTATION_VERSION,
    mode: "closed_non_funds_pilot",
    maturity: "local_non_funds",
    availability,
    actorPolicyCeilings: actorPolicyCeilings(availability),
    operationalEvidence: {
      alerts: {
        state: "internal_durable_unexposed",
        policyVersion: RISK_OPERATIONS_POLICY_EVIDENCE.alertPolicyVersion,
        ruleCount: RISK_OPERATIONS_POLICY_EVIDENCE.alertRuleCount,
        notificationTargetStatus:
          RISK_OPERATIONS_POLICY_EVIDENCE.alertDeliveryStatus,
        readOperationId: null,
        liveStateLoaded: false
      },
      reconciliation: {
        state: "internal_worker_unexposed",
        schemaVersion:
          RISK_OPERATIONS_POLICY_EVIDENCE.reconciliationSchemaVersion,
        readOperationId: null,
        liveStateLoaded: false,
        automaticRepairEnabled: false,
        approvalRequiredForRepair: true
      },
      incidents: {
        state: "runbook_only_unconfigured",
        runbookRef:
          "docs/operations/PRIVATE_PILOT_ALERT_AND_INCIDENT_RUNBOOK.md",
        namedOwnerStatus:
          RISK_OPERATIONS_POLICY_EVIDENCE.namedIncidentOwnerStatus,
        notificationTargetStatus:
          RISK_OPERATIONS_POLICY_EVIDENCE.alertDeliveryStatus,
        acknowledgeOperationId: null,
        resolveOperationId: null
      },
      approvals: {
        state: availability.servicingResolution
          ? "exact_external_artifact_required"
          : "operation_unavailable",
        policyVersion:
          RISK_OPERATIONS_POLICY_EVIDENCE.approvalPolicyVersion,
        exactCommandBound: true,
        proposalLocatorIsAuthority: false,
        requiredDistinctApproverRoles: [
          "risk_operator",
          "operations_operator"
        ],
        browserProposalWorkflowAvailable: false,
        servicingResolutionOperations: availability.servicingResolution
          ? [...RESOLUTION_OPERATIONS]
          : []
      },
      launch: {
        state: "checked_in_policy_only",
        policyVersion:
          RISK_OPERATIONS_POLICY_EVIDENCE.launchPolicyVersion,
        closedPilotReleaseEnabled:
          RISK_OPERATIONS_POLICY_EVIDENCE.closedPilotReleaseEnabled,
        runtimeApprovalInferred: false
      }
    },
    disabledCapabilities: [
      "unfreeze",
      "limit_increase",
      "generic_emergency_mutation",
      "browser_break_glass",
      "automatic_projection_repair",
      "automatic_funds_action",
      "incident_acknowledgement",
      "incident_resolution",
      "demo_reset",
      "mainnet",
      "real_funds"
    ],
    recentMfaRequired: true,
    catalogIsAuthorization: false,
    checkedInEvidenceIsLiveState: false,
    automaticActionsEnabled: false,
    breakGlassEnabled: false,
    serverDerivedRiskOnly: true,
    piiInAggregateViews: false,
    sandboxOnly: true,
    productionFundsMoved: false
  });
}
