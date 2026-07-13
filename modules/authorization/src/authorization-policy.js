import { ActorType } from "../../authentication/src/constants.js";
import {
  AUTHORIZATION_POLICY_VERSION,
  AccessGrantCapability,
  ApprovalRequirement,
  AuthorizationSurface,
  EXPOSURE_INCREASE_REASON_CODES,
  IdempotencyRequirement,
  OwnershipRule,
  PROTECTIVE_REASON_CODES,
  PilotCapability,
  REPAIR_REASON_CODES
} from "./authorization-constants.js";
import {
  assertAuthorizationList,
  assertAuthorizationIdentifier,
  assertAuthorizationShape,
  assertAuthorizationString,
  assertCapability,
  assertReasonCode,
  authorizationError,
  cloneAuthorization,
  deepFreezeAuthorization
} from "./authorization-utils.js";

const PUBLIC_ACTOR = "anonymous_sandbox";

function publicOperation(operationId, method, path, action, resourceType) {
  return deepFreezeAuthorization({
    operationId,
    surface: AuthorizationSurface.PUBLIC_SANDBOX,
    transport: { kind: "http", method, path },
    action,
    resourceType,
    allowedActorTypes: [PUBLIC_ACTOR],
    requiredCapability: "sandbox.demo.use",
    ownershipRule: OwnershipRule.SANDBOX_PARTITION,
    accessGrantCapability: null,
    purposePolicy: "none",
    reasonPolicy: { required: false, allowedCodes: [] },
    idempotencyRequirement: IdempotencyRequirement.OPTIONAL,
    approvalRequirement: ApprovalRequirement.NONE,
    liveChecks: [],
    requiresRecentMfaActorTypes: [],
    auditRequirement: "http_boundary"
  });
}

function tenantOperation({
  operationId,
  action,
  resourceType,
  allowedActorTypes,
  requiredCapability,
  ownershipRule,
  accessGrantCapability = null,
  purposePolicy = "none",
  reasonCodes = [],
  idempotencyRequirement = IdempotencyRequirement.OPTIONAL,
  approvalRequirement = ApprovalRequirement.NONE,
  liveChecks = [],
  requiresRecentMfaActorTypes = [],
  worker = false
}) {
  return deepFreezeAuthorization({
    operationId,
    surface: worker ? AuthorizationSurface.TENANT_WORKER : AuthorizationSurface.AUTHENTICATED_TENANT,
    transport: { kind: worker ? "worker" : "command" },
    action,
    resourceType,
    allowedActorTypes,
    requiredCapability,
    ownershipRule,
    accessGrantCapability,
    purposePolicy,
    reasonPolicy: { required: reasonCodes.length > 0, allowedCodes: reasonCodes },
    idempotencyRequirement,
    approvalRequirement,
    liveChecks,
    requiresRecentMfaActorTypes,
    auditRequirement: "allow_and_deny"
  });
}

export const PUBLIC_SANDBOX_OPERATION_POLICIES = Object.freeze([
  publicOperation("getHealth", "GET", "/healthz", "sandbox.health.read", "service_health"),
  publicOperation("createAgent", "POST", "/v1/agents", "sandbox.agent.create", "subject"),
  publicOperation("bindAgentWallet", "POST", "/v1/agents/{id}/wallet-bindings", "sandbox.account.bind", "account_binding"),
  publicOperation("createAgentLockbox", "POST", "/v1/agents/{id}/lockbox", "sandbox.lockbox.create", "lockbox"),
  publicOperation("requestAgentCreditLine", "POST", "/v1/agents/{id}/credit-line", "sandbox.credit.request", "credit_line"),
  publicOperation("submitSpendRequest", "POST", "/v1/spend-requests", "sandbox.spend.request", "spend_request"),
  publicOperation("recordSettlement", "POST", "/v1/settlements", "sandbox.settlement.record", "settlement_receipt"),
  publicOperation("captureRevenue", "POST", "/v1/revenue-capture", "sandbox.revenue.capture", "lockbox"),
  publicOperation("autoRepay", "POST", "/v1/repayments/auto", "sandbox.repayment.execute", "obligation"),
  publicOperation("evaluateCreditLearning", "POST", "/v1/credit-learning/evaluate", "sandbox.credit_learning.evaluate", "credit_profile"),
  publicOperation("runHealthyCycle", "POST", "/v1/demo/cycles/healthy", "sandbox.scenario.healthy", "demo_scenario"),
  publicOperation("runRiskyCycle", "POST", "/v1/demo/cycles/risky", "sandbox.scenario.risky", "demo_scenario"),
  publicOperation("runRecoveryCycle", "POST", "/v1/demo/cycles/recovery", "sandbox.scenario.recovery", "demo_scenario"),
  publicOperation("getAgentStatus", "GET", "/v1/agents/{id}/status", "sandbox.agent.read", "subject"),
  publicOperation("getCreditProfile", "GET", "/v1/agents/{id}/credit-profile", "sandbox.credit_profile.read", "credit_profile"),
  publicOperation("getDemoAudit", "GET", "/v1/admin/audit", "sandbox.audit.read", "evidence"),
  publicOperation("listSandboxRails", "GET", "/v1/rails", "sandbox.rail.list", "rail"),
  publicOperation("getTransferIntent", "GET", "/v1/transfer-intents/{id}", "sandbox.transfer_intent.read", "transfer_intent"),
  publicOperation("getDemoState", "GET", "/v1/demo/state", "sandbox.state.read", "demo_state"),
  publicOperation("runVerticalSlice", "GET", "/v1/demo/vertical-slice", "sandbox.vertical_slice.run", "demo_scenario"),
  publicOperation("resetDemo", "POST", "/v1/demo/reset", "sandbox.state.reset", "demo_state")
]);

export const TENANT_OPERATION_POLICIES = Object.freeze([
  tenantOperation({
    operationId: "pilotCreateAgentSubject",
    action: "agent.create",
    resourceType: "subject",
    allowedActorTypes: [ActorType.HUMAN],
    requiredCapability: PilotCapability.AGENT_CREATE,
    ownershipRule: OwnershipRule.NONE,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED
  }),
  tenantOperation({
    operationId: "pilotCreateDraftMandate",
    action: "mandate.draft.create",
    resourceType: "subject",
    allowedActorTypes: [ActorType.HUMAN],
    requiredCapability: PilotCapability.MANDATE_DRAFT_CREATE,
    ownershipRule: OwnershipRule.ACTOR,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["subject_state"]
  }),
  tenantOperation({
    operationId: "pilotReadAgentSelf",
    action: "subject.read.self",
    resourceType: "subject",
    allowedActorTypes: [ActorType.AGENT],
    requiredCapability: PilotCapability.SUBJECT_READ_SELF,
    ownershipRule: OwnershipRule.ACTOR
  }),
  tenantOperation({
    operationId: "pilotRequestCredit",
    action: "credit.request",
    resourceType: "subject",
    allowedActorTypes: [ActorType.AGENT],
    requiredCapability: PilotCapability.CREDIT_REQUEST,
    ownershipRule: OwnershipRule.ACTOR,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["mandate", "risk", "cap", "freeze"]
  }),
  tenantOperation({
    operationId: "pilotSubmitSpend",
    action: "spend.request",
    resourceType: "subject",
    allowedActorTypes: [ActorType.AGENT],
    requiredCapability: PilotCapability.SPEND_REQUEST,
    ownershipRule: OwnershipRule.ACTOR,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["mandate", "spend_policy", "risk", "cap", "freeze"]
  }),
  tenantOperation({
    operationId: "pilotCaptureRevenue",
    action: "revenue.capture",
    resourceType: "lockbox",
    allowedActorTypes: [ActorType.AGENT],
    requiredCapability: PilotCapability.REVENUE_CAPTURE,
    ownershipRule: OwnershipRule.ACTOR,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["lockbox_state", "cashflow_route", "freeze"]
  }),
  tenantOperation({
    operationId: "pilotAutoRepay",
    action: "repayment.execute",
    resourceType: "obligation",
    allowedActorTypes: [ActorType.AGENT],
    requiredCapability: PilotCapability.REPAYMENT_EXECUTE,
    ownershipRule: OwnershipRule.ACTOR,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["obligation_state", "lockbox_state", "repayment_waterfall", "freeze"]
  }),
  tenantOperation({
    operationId: "pilotReadTenantRisk",
    action: "risk.read.tenant",
    resourceType: "risk_portfolio",
    allowedActorTypes: [ActorType.RISK_OPERATOR, ActorType.AUDITOR],
    requiredCapability: PilotCapability.RISK_READ_TENANT,
    ownershipRule: OwnershipRule.TENANT,
    requiresRecentMfaActorTypes: [ActorType.RISK_OPERATOR, ActorType.AUDITOR]
  }),
  tenantOperation({
    operationId: "pilotFreezeSubject",
    action: "risk.freeze",
    resourceType: "subject",
    allowedActorTypes: [ActorType.RISK_OPERATOR, ActorType.OPERATIONS_OPERATOR],
    requiredCapability: PilotCapability.RISK_FREEZE,
    ownershipRule: OwnershipRule.TENANT,
    reasonCodes: PROTECTIVE_REASON_CODES,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    approvalRequirement: ApprovalRequirement.PROTECTIVE,
    liveChecks: ["risk", "freeze"],
    requiresRecentMfaActorTypes: [ActorType.RISK_OPERATOR, ActorType.OPERATIONS_OPERATOR]
  }),
  tenantOperation({
    operationId: "pilotReduceCreditLimit",
    action: "risk.limit.reduce",
    resourceType: "credit_line",
    allowedActorTypes: [ActorType.RISK_OPERATOR],
    requiredCapability: PilotCapability.RISK_LIMIT_REDUCE,
    ownershipRule: OwnershipRule.TENANT,
    reasonCodes: PROTECTIVE_REASON_CODES,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    approvalRequirement: ApprovalRequirement.PROTECTIVE,
    liveChecks: ["risk", "cap", "credit_line_state"],
    requiresRecentMfaActorTypes: [ActorType.RISK_OPERATOR]
  }),
  tenantOperation({
    operationId: "pilotIncreaseCreditLimit",
    action: "risk.limit.increase",
    resourceType: "credit_line",
    allowedActorTypes: [ActorType.RISK_OPERATOR],
    requiredCapability: PilotCapability.RISK_LIMIT_INCREASE,
    ownershipRule: OwnershipRule.TENANT,
    reasonCodes: EXPOSURE_INCREASE_REASON_CODES,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    approvalRequirement: ApprovalRequirement.DUAL_CONTROL,
    liveChecks: ["risk", "cap", "credit_line_state", "stop_loss"],
    requiresRecentMfaActorTypes: [ActorType.RISK_OPERATOR]
  }),
  tenantOperation({
    operationId: "pilotUnfreezeSubject",
    action: "risk.unfreeze",
    resourceType: "subject",
    allowedActorTypes: [ActorType.RISK_OPERATOR],
    requiredCapability: PilotCapability.RISK_UNFREEZE,
    ownershipRule: OwnershipRule.TENANT,
    reasonCodes: PROTECTIVE_REASON_CODES,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    approvalRequirement: ApprovalRequirement.DUAL_CONTROL,
    liveChecks: ["risk", "freeze", "stop_loss", "reconciliation"],
    requiresRecentMfaActorTypes: [ActorType.RISK_OPERATOR]
  }),
  tenantOperation({
    operationId: "pilotReadProviderIntent",
    action: "provider.intent.read",
    resourceType: "transfer_intent",
    allowedActorTypes: [ActorType.PROVIDER],
    requiredCapability: PilotCapability.PROVIDER_INTENT_READ,
    ownershipRule: OwnershipRule.TENANT_OR_ACCESS_GRANT,
    accessGrantCapability: AccessGrantCapability.PROVIDER_INTENT_DELIVERY,
    purposePolicy: "grant_only",
    liveChecks: ["provider_assignment", "provider_state"]
  }),
  tenantOperation({
    operationId: "pilotAcknowledgeProviderIntent",
    action: "provider.intent.acknowledge",
    resourceType: "transfer_intent",
    allowedActorTypes: [ActorType.PROVIDER],
    requiredCapability: PilotCapability.PROVIDER_INTENT_ACKNOWLEDGE,
    ownershipRule: OwnershipRule.TENANT_OR_ACCESS_GRANT,
    accessGrantCapability: AccessGrantCapability.PROVIDER_INTENT_DELIVERY,
    purposePolicy: "grant_only",
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["provider_assignment", "provider_state", "transfer_intent_state"]
  }),
  tenantOperation({
    operationId: "pilotReadEvidence",
    action: "evidence.read",
    resourceType: "evidence",
    allowedActorTypes: [ActorType.AUDITOR],
    requiredCapability: PilotCapability.EVIDENCE_READ,
    ownershipRule: OwnershipRule.TENANT_OR_ACCESS_GRANT,
    accessGrantCapability: AccessGrantCapability.SCOPED_AUDIT_READ,
    purposePolicy: "grant_only",
    requiresRecentMfaActorTypes: [ActorType.AUDITOR]
  }),
  tenantOperation({
    operationId: "pilotExportAudit",
    action: "audit.export",
    resourceType: "evidence_export",
    allowedActorTypes: [ActorType.AUDITOR],
    requiredCapability: PilotCapability.AUDIT_EXPORT,
    ownershipRule: OwnershipRule.TENANT_OR_ACCESS_GRANT,
    accessGrantCapability: AccessGrantCapability.SCOPED_AUDIT_READ,
    purposePolicy: "grant_only",
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["export_bounds"],
    requiresRecentMfaActorTypes: [ActorType.AUDITOR]
  }),
  tenantOperation({
    operationId: "workerPublishOutbox",
    action: "worker.outbox.publish",
    resourceType: "outbox_message",
    allowedActorTypes: [ActorType.SYSTEM_WORKER],
    requiredCapability: PilotCapability.WORKER_OUTBOX_PUBLISH,
    ownershipRule: OwnershipRule.TENANT,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["worker_lease", "delivery_attempt"],
    worker: true
  }),
  tenantOperation({
    operationId: "workerProcessInbox",
    action: "worker.inbox.process",
    resourceType: "inbox_message",
    allowedActorTypes: [ActorType.SYSTEM_WORKER],
    requiredCapability: PilotCapability.WORKER_INBOX_PROCESS,
    ownershipRule: OwnershipRule.TENANT,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["inbox_replay"],
    worker: true
  }),
  tenantOperation({
    operationId: "workerAutoRepay",
    action: "repayment.execute",
    resourceType: "obligation",
    allowedActorTypes: [ActorType.SYSTEM_WORKER],
    requiredCapability: PilotCapability.REPAYMENT_EXECUTE,
    ownershipRule: OwnershipRule.TENANT,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["obligation_state", "lockbox_state", "repayment_waterfall", "freeze"],
    worker: true
  }),
  tenantOperation({
    operationId: "workerRunReconciliation",
    action: "reconciliation.run",
    resourceType: "tenant",
    allowedActorTypes: [ActorType.SYSTEM_WORKER],
    requiredCapability: PilotCapability.RECONCILIATION_RUN,
    ownershipRule: OwnershipRule.TENANT,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    liveChecks: ["reconciliation_capacity"],
    worker: true
  }),
  tenantOperation({
    operationId: "workerPlanProjectionRepair",
    action: "projection_repair.plan",
    resourceType: "reconciliation_discrepancy",
    allowedActorTypes: [ActorType.SYSTEM_WORKER],
    requiredCapability: PilotCapability.PROJECTION_REPAIR_PLAN,
    ownershipRule: OwnershipRule.TENANT,
    reasonCodes: REPAIR_REASON_CODES,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    approvalRequirement: ApprovalRequirement.PROTECTIVE,
    liveChecks: ["reconciliation", "projection_hash"],
    worker: true
  }),
  tenantOperation({
    operationId: "workerExecuteProjectionRepair",
    action: "projection_repair.execute",
    resourceType: "reconciliation_discrepancy",
    allowedActorTypes: [ActorType.SYSTEM_WORKER],
    requiredCapability: PilotCapability.PROJECTION_REPAIR_EXECUTE,
    ownershipRule: OwnershipRule.TENANT,
    reasonCodes: REPAIR_REASON_CODES,
    idempotencyRequirement: IdempotencyRequirement.REQUIRED,
    approvalRequirement: ApprovalRequirement.DUAL_CONTROL,
    liveChecks: ["reconciliation", "projection_hash", "repair_dry_run"],
    worker: true
  })
]);

const SURFACES = new Set(Object.values(AuthorizationSurface));
const OWNERSHIP_RULES = new Set(Object.values(OwnershipRule));
const APPROVAL_REQUIREMENTS = new Set(Object.values(ApprovalRequirement));
const IDEMPOTENCY_REQUIREMENTS = new Set(Object.values(IdempotencyRequirement));
const ACTOR_TYPES = new Set(Object.values(ActorType));
const ACCESS_GRANT_CAPABILITIES = new Set(Object.values(AccessGrantCapability));
const PURPOSE_POLICIES = new Set(["none", "grant_only"]);
const AUDIT_REQUIREMENTS = new Set(["http_boundary", "allow_and_deny"]);

function validatePolicy(policy) {
  assertAuthorizationShape("authorization policy", policy, {
    required: [
      "operationId",
      "surface",
      "transport",
      "action",
      "resourceType",
      "allowedActorTypes",
      "requiredCapability",
      "ownershipRule",
      "accessGrantCapability",
      "purposePolicy",
      "reasonPolicy",
      "idempotencyRequirement",
      "approvalRequirement",
      "liveChecks",
      "requiresRecentMfaActorTypes",
      "auditRequirement"
    ]
  });
  assertAuthorizationIdentifier("operationId", policy.operationId);
  assertCapability("action", policy.action);
  assertAuthorizationIdentifier("resourceType", policy.resourceType);
  assertCapability("requiredCapability", policy.requiredCapability);
  assertAuthorizationShape("policy transport", policy.transport, {
    required: ["kind"],
    optional: ["method", "path"]
  });
  assertAuthorizationShape("policy reason", policy.reasonPolicy, {
    required: ["required", "allowedCodes"]
  });
  const liveChecks = assertAuthorizationList("liveChecks", policy.liveChecks);
  const allowedActors = assertAuthorizationList("allowedActorTypes", policy.allowedActorTypes, {
    maximumItems: 8,
    allowEmpty: false,
    itemValidator: assertAuthorizationIdentifier
  });
  const mfaActors = assertAuthorizationList("requiresRecentMfaActorTypes", policy.requiresRecentMfaActorTypes, {
    maximumItems: 8,
    itemValidator: assertAuthorizationIdentifier
  });
  const reasonCodes = assertAuthorizationList("reasonCodes", policy.reasonPolicy.allowedCodes, {
    maximumItems: 16,
    itemValidator: assertReasonCode
  });
  if (
    !SURFACES.has(policy.surface) ||
    !OWNERSHIP_RULES.has(policy.ownershipRule) ||
    !APPROVAL_REQUIREMENTS.has(policy.approvalRequirement) ||
    !IDEMPOTENCY_REQUIREMENTS.has(policy.idempotencyRequirement) ||
    !PURPOSE_POLICIES.has(policy.purposePolicy) ||
    !AUDIT_REQUIREMENTS.has(policy.auditRequirement) ||
    typeof policy.reasonPolicy.required !== "boolean" ||
    !Array.isArray(policy.allowedActorTypes) ||
    policy.allowedActorTypes.length === 0
  ) {
    throw authorizationError("invalid_authorization_policy", "authorization policy is invalid");
  }
  if (
    policy.surface === AuthorizationSurface.PUBLIC_SANDBOX &&
    (
      policy.ownershipRule !== OwnershipRule.SANDBOX_PARTITION ||
      policy.transport.kind !== "http" ||
      policy.transport.method === undefined ||
      policy.transport.path === undefined ||
      allowedActors.length !== 1 ||
      allowedActors[0] !== PUBLIC_ACTOR ||
      mfaActors.length !== 0 ||
      policy.auditRequirement !== "http_boundary" ||
      policy.approvalRequirement !== ApprovalRequirement.NONE
    )
  ) {
    throw authorizationError("invalid_authorization_policy", "public sandbox policy boundary is invalid");
  }
  if (
    policy.surface !== AuthorizationSurface.PUBLIC_SANDBOX &&
    (
      policy.ownershipRule === OwnershipRule.SANDBOX_PARTITION ||
      allowedActors.some((actorType) => !ACTOR_TYPES.has(actorType)) ||
      mfaActors.some((actorType) => !allowedActors.includes(actorType)) ||
      policy.transport.kind !== (
        policy.surface === AuthorizationSurface.TENANT_WORKER ? "worker" : "command"
      ) ||
      policy.transport.method !== undefined ||
      policy.transport.path !== undefined ||
      policy.auditRequirement !== "allow_and_deny"
    )
  ) {
    throw authorizationError("invalid_authorization_policy", "tenant policy cannot use sandbox ownership");
  }
  if (policy.surface === AuthorizationSurface.PUBLIC_SANDBOX) {
    assertAuthorizationString("HTTP method", policy.transport.method, {
      maximum: 8,
      pattern: /^(?:GET|POST|PUT|PATCH|DELETE)$/
    });
    assertAuthorizationString("HTTP path", policy.transport.path, {
      maximum: 256,
      pattern: /^\/[A-Za-z0-9_{}./:-]*$/
    });
  }
  if (
    (policy.ownershipRule === OwnershipRule.TENANT_OR_ACCESS_GRANT && (
      !ACCESS_GRANT_CAPABILITIES.has(policy.accessGrantCapability) ||
      policy.purposePolicy !== "grant_only"
    )) ||
    (policy.ownershipRule !== OwnershipRule.TENANT_OR_ACCESS_GRANT && (
      policy.accessGrantCapability !== null ||
      policy.purposePolicy !== "none"
    )) ||
    (policy.reasonPolicy.required !== (reasonCodes.length > 0)) ||
    ([ApprovalRequirement.PROTECTIVE, ApprovalRequirement.DUAL_CONTROL].includes(
      policy.approvalRequirement
    ) && (
      !policy.reasonPolicy.required ||
      policy.idempotencyRequirement !== IdempotencyRequirement.REQUIRED
    ))
  ) {
    throw authorizationError("invalid_authorization_policy", "authorization policy scope is invalid");
  }
  assertAuthorizationString("auditRequirement", policy.auditRequirement, { maximum: 32 });
  void liveChecks;
  return policy;
}

export class AuthorizationPolicyRegistry {
  #policies = new Map();

  constructor({
    policyVersion = AUTHORIZATION_POLICY_VERSION,
    publicOperations = PUBLIC_SANDBOX_OPERATION_POLICIES,
    tenantOperations = TENANT_OPERATION_POLICIES
  } = {}) {
    this.policyVersion = assertAuthorizationIdentifier("policyVersion", policyVersion);
    for (const policy of [...publicOperations, ...tenantOperations]) {
      validatePolicy(policy);
      const storedPolicy = deepFreezeAuthorization(cloneAuthorization(policy));
      if (this.#policies.has(storedPolicy.operationId)) {
        throw authorizationError("duplicate_authorization_policy", "operation policy is duplicated");
      }
      this.#policies.set(storedPolicy.operationId, storedPolicy);
    }
    Object.freeze(this);
  }

  get(operationId) {
    return this.#policies.get(operationId);
  }

  getAuthenticated(operationId) {
    const policy = this.#policies.get(operationId);
    return policy && policy.surface !== AuthorizationSurface.PUBLIC_SANDBOX ? policy : undefined;
  }

  list({ surface } = {}) {
    return [...this.#policies.values()]
      .filter((policy) => surface === undefined || policy.surface === surface)
      .map(cloneAuthorization);
  }
}

const APPROVAL_STRENGTH = new Map([
  [ApprovalRequirement.NONE, 0],
  [ApprovalRequirement.PROTECTIVE, 1],
  [ApprovalRequirement.DUAL_CONTROL, 2],
  [ApprovalRequirement.PROHIBITED, 3]
]);
export function assertPolicyTransitionDoesNotBroaden(currentPolicies, candidatePolicies) {
  const current = new Map(currentPolicies.map((policy) => [policy.operationId, policy]));
  const candidateOperationIds = new Set();
  for (const candidate of candidatePolicies) {
    try {
      validatePolicy(candidate);
    } catch {
      throw authorizationError(
        "authorization_policy_broadening_rejected",
        "rollback policy is invalid"
      );
    }
    if (candidateOperationIds.has(candidate.operationId)) {
      throw authorizationError(
        "authorization_policy_broadening_rejected",
        "rollback policy duplicates an operation"
      );
    }
    candidateOperationIds.add(candidate.operationId);
    const previous = current.get(candidate.operationId);
    if (!previous) {
      throw authorizationError("authorization_policy_broadening_rejected", "rollback cannot add an operation");
    }
    const actorSubset = candidate.allowedActorTypes.every((actorType) =>
      previous.allowedActorTypes.includes(actorType)
    );
    const liveCheckSuperset = previous.liveChecks.every((check) => candidate.liveChecks.includes(check));
    const mfaSuperset = previous.requiresRecentMfaActorTypes.every((actorType) =>
      candidate.requiresRecentMfaActorTypes.includes(actorType)
    );
    const reasonSafe = !previous.reasonPolicy.required || (
      candidate.reasonPolicy.required &&
      candidate.reasonPolicy.allowedCodes.every((reasonCode) =>
        previous.reasonPolicy.allowedCodes.includes(reasonCode)
      )
    );
    const idempotencySafe = (
      candidate.idempotencyRequirement === previous.idempotencyRequirement ||
      (
        previous.idempotencyRequirement === IdempotencyRequirement.OPTIONAL &&
        candidate.idempotencyRequirement === IdempotencyRequirement.REQUIRED
      )
    );
    if (
      candidate.surface !== previous.surface ||
      candidate.action !== previous.action ||
      candidate.resourceType !== previous.resourceType ||
      JSON.stringify(candidate.transport) !== JSON.stringify(previous.transport) ||
      candidate.requiredCapability !== previous.requiredCapability ||
      candidate.ownershipRule !== previous.ownershipRule ||
      candidate.accessGrantCapability !== previous.accessGrantCapability ||
      candidate.purposePolicy !== previous.purposePolicy ||
      !actorSubset ||
      !liveCheckSuperset ||
      !mfaSuperset ||
      !reasonSafe ||
      Number(candidate.reasonPolicy.required) < Number(previous.reasonPolicy.required) ||
      APPROVAL_STRENGTH.get(candidate.approvalRequirement) < APPROVAL_STRENGTH.get(previous.approvalRequirement) ||
      !idempotencySafe ||
      candidate.auditRequirement !== previous.auditRequirement
    ) {
      throw authorizationError(
        "authorization_policy_broadening_rejected",
        "rollback policy would broaden authorization"
      );
    }
  }
  return true;
}
