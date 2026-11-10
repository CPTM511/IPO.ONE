import { assertHostedSyntheticFeeGovernance, HOSTED_SYNTHETIC_FEE_PROFILE,
  SYNTHETIC_FEE_PROFILE, DomainError } from "../../../packages/domain/src/index.js";

export function checkedHostedFeeGovernance(value) {
  return value === undefined ? undefined : assertHostedSyntheticFeeGovernance(value,{tenantId:value.tenantId});
}
export function syntheticFeeLoanMatchesContext(governance,input,loan) {
  if(!governance)return loan.syntheticFees?.terms.profile===SYNTHETIC_FEE_PROFILE;
  return input.authenticationContext.tenantId===governance.tenantId &&
    loan.syntheticFees?.terms.profile===HOSTED_SYNTHETIC_FEE_PROFILE &&
    loan.syntheticFees.terms.institutionId===governance.institutionId;
}
export function assertSyntheticFeeLoanContext(governance,input,loan) {
  if(!syntheticFeeLoanMatchesContext(governance,input,loan))
    throw new DomainError("tenant_resource_unavailable","The requested resource is not available.");
}
