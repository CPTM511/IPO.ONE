import {
  ApprovalRequirement,
  RoleBundle,
  TENANT_OPERATION_POLICIES
} from "../../authorization/src/index.js";
import { APPROVAL_POLICY_VERSION } from "./approval-constants.js";
import {
  assertApprovalIdentifier,
  approvalError,
  cloneApproval,
  deepFreezeApproval
} from "./approval-utils.js";

const classifications = [
  {
    operationId: "pilotFreezeSubject",
    classification: ApprovalRequirement.PROTECTIVE,
    requiredApproverRoleBundles: []
  },
  {
    operationId: "pilotReduceCreditLimit",
    classification: ApprovalRequirement.PROTECTIVE,
    requiredApproverRoleBundles: []
  },
  {
    operationId: "pilotIncreaseCreditLimit",
    classification: ApprovalRequirement.DUAL_CONTROL,
    requiredApproverRoleBundles: [RoleBundle.RISK_OPERATOR, RoleBundle.OPERATIONS_OPERATOR]
  },
  {
    operationId: "pilotUnfreezeSubject",
    classification: ApprovalRequirement.DUAL_CONTROL,
    requiredApproverRoleBundles: [RoleBundle.RISK_OPERATOR, RoleBundle.OPERATIONS_OPERATOR]
  },
  {
    operationId: "workerPlanProjectionRepair",
    classification: ApprovalRequirement.PROTECTIVE,
    requiredApproverRoleBundles: []
  },
  {
    operationId: "workerExecuteProjectionRepair",
    classification: ApprovalRequirement.DUAL_CONTROL,
    requiredApproverRoleBundles: [RoleBundle.RISK_OPERATOR, RoleBundle.OPERATIONS_OPERATOR]
  },
  {
    operationId: "pilotRestructureSandboxObligation",
    classification: ApprovalRequirement.DUAL_CONTROL,
    requiredApproverRoleBundles: [RoleBundle.RISK_OPERATOR, RoleBundle.OPERATIONS_OPERATOR]
  },
  {
    operationId: "pilotRepurchaseSandboxObligation",
    classification: ApprovalRequirement.DUAL_CONTROL,
    requiredApproverRoleBundles: [RoleBundle.RISK_OPERATOR, RoleBundle.OPERATIONS_OPERATOR]
  },
  {
    operationId: "pilotWriteOffSandboxObligation",
    classification: ApprovalRequirement.DUAL_CONTROL,
    requiredApproverRoleBundles: [RoleBundle.RISK_OPERATOR, RoleBundle.OPERATIONS_OPERATOR]
  }
];

export const APPROVAL_OPERATION_CLASSIFICATIONS = Object.freeze(
  classifications.map((profile) => deepFreezeApproval({
    ...profile,
    policyVersion: APPROVAL_POLICY_VERSION
  }))
);

const profilesByOperation = new Map(
  APPROVAL_OPERATION_CLASSIFICATIONS.map((profile) => [profile.operationId, profile])
);

export function getApprovalOperationProfile(operationId) {
  const profile = profilesByOperation.get(assertApprovalIdentifier("operationId", operationId));
  return profile ? cloneApproval(profile) : undefined;
}

export function requireDualControlProfile(operationId) {
  const profile = getApprovalOperationProfile(operationId);
  if (
    !profile ||
    profile.classification !== ApprovalRequirement.DUAL_CONTROL ||
    profile.requiredApproverRoleBundles.length !== 2 ||
    new Set(profile.requiredApproverRoleBundles).size !== 2
  ) {
    throw approvalError("approval_operation_not_dual_control", "operation is not approved for dual control");
  }
  return profile;
}

export function assertApprovalPolicyCoverage(policies = TENANT_OPERATION_POLICIES) {
  const classified = new Set();
  for (const profile of APPROVAL_OPERATION_CLASSIFICATIONS) {
    if (classified.has(profile.operationId)) {
      throw approvalError("duplicate_approval_classification", "approval operation is classified more than once");
    }
    classified.add(profile.operationId);
    const policy = policies.find(({ operationId }) => operationId === profile.operationId);
    if (!policy || policy.approvalRequirement !== profile.classification) {
      throw approvalError("approval_policy_coverage_failed", "approval classification does not match authorization policy");
    }
    const requiredRoles = profile.requiredApproverRoleBundles;
    if (
      (profile.classification === ApprovalRequirement.DUAL_CONTROL && (
        requiredRoles.length !== 2 || new Set(requiredRoles).size !== requiredRoles.length
      )) ||
      (profile.classification !== ApprovalRequirement.DUAL_CONTROL && requiredRoles.length !== 0)
    ) {
      throw approvalError("approval_policy_coverage_failed", "approval role separation is invalid");
    }
  }

  const highImpact = policies.filter(
    ({ approvalRequirement }) => approvalRequirement !== ApprovalRequirement.NONE
  );
  if (
    highImpact.length !== APPROVAL_OPERATION_CLASSIFICATIONS.length ||
    highImpact.some(({ operationId }) => !classified.has(operationId))
  ) {
    throw approvalError("approval_policy_coverage_failed", "a high-impact operation is not classified");
  }
  return true;
}
