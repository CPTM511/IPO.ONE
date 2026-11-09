import { hashId } from "./ids.js";

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
