import {
  ApprovalRequirement,
  TENANT_OPERATION_POLICIES
} from "../modules/authorization/src/index.js";
import {
  APPROVAL_OPERATION_CLASSIFICATIONS,
  BREAK_GLASS_PROHIBITED_ACTION_PREFIXES,
  BREAK_GLASS_PROTECTIVE_ACTIONS,
  assertApprovalPolicyCoverage
} from "../modules/approval/src/index.js";

assertApprovalPolicyCoverage();

const highImpactOperations = TENANT_OPERATION_POLICIES.filter(
  ({ approvalRequirement }) => approvalRequirement !== ApprovalRequirement.NONE
);
if (highImpactOperations.length !== APPROVAL_OPERATION_CLASSIFICATIONS.length) {
  throw new Error("approval classification count does not match the high-impact operation set");
}
for (const action of BREAK_GLASS_PROTECTIVE_ACTIONS) {
  if (BREAK_GLASS_PROHIBITED_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix))) {
    throw new Error(`break-glass action '${action}' collides with a prohibited prefix`);
  }
}

console.log(
  `Approval policy checks passed (${highImpactOperations.length} high-impact operations, ` +
  `${BREAK_GLASS_PROTECTIVE_ACTIONS.length} protective break-glass actions).`
);
