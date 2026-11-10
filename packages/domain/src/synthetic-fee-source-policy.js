import { hashId } from "./ids.js";
import { SYNTHETIC_FEE_PROFILE, HOSTED_SYNTHETIC_FEE_PROFILE } from "./synthetic-fees.js";
import { DomainError } from "./errors.js";

export const SYNTHETIC_FEE_SOURCE_POLICY = Object.freeze({
  schemaVersion: "synthetic_fee_source_policy.v1",
  scope: "L0_LOCAL_NO_FUNDS",
  profile: "synthetic_usd_platform_fee.v1",
  effectiveAt: "approved_execution",
  creditAllocation: "unpaid_then_written_off_then_refund_credit",
  priorInterestRepriced: false,
  requiresRecentMfa: true,
  requiresIndependentDualApproval: true,
  cashRefundAuthorized: false,
  syntheticOnly: true,
  productionFundsMoved: false
});
export const SYNTHETIC_FEE_SOURCE_POLICY_HASH = hashId("synthetic_fee_source_policy", SYNTHETIC_FEE_SOURCE_POLICY);
export const HOSTED_SYNTHETIC_FEE_SOURCE_POLICY = Object.freeze({
  ...SYNTHETIC_FEE_SOURCE_POLICY,
  schemaVersion: "synthetic_fee_source_policy.hosted.v1",
  scope: "L2_PUBLIC_AUTHENTICATED_NO_FUNDS",
  profile: HOSTED_SYNTHETIC_FEE_PROFILE
});
export const HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH = hashId("synthetic_fee_source_policy", HOSTED_SYNTHETIC_FEE_SOURCE_POLICY);
export function syntheticFeeSourcePolicyHash(profile) {
  if (profile === SYNTHETIC_FEE_PROFILE) return SYNTHETIC_FEE_SOURCE_POLICY_HASH;
  if (profile === HOSTED_SYNTHETIC_FEE_PROFILE) return HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH;
  throw new DomainError("synthetic_fee_profile_invalid", "A known source correction policy is required");
}
