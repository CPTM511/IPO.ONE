export const SubjectType = Object.freeze({
  AGENT: "agent",
  HUMAN: "human",
  ORG: "org",
  ORIGINATOR: "originator"
});

export const SubjectStatus = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  CLOSED: "closed"
});

export const PrincipalType = Object.freeze({
  HUMAN_SELF: "human_self",
  DEVELOPER: "developer",
  COMPANY: "company",
  ORIGINATOR: "originator",
  EMPLOYER: "employer",
  PLATFORM: "platform"
});

export const PrincipalStatus = Object.freeze({
  ACTIVE: "active",
  UNDER_REVIEW: "under_review",
  RESTRICTED: "restricted",
  CLOSED: "closed"
});

export const AccountPurpose = Object.freeze({
  PRIMARY: "primary",
  REVENUE: "revenue",
  REPAYMENT: "repayment",
  TREASURY: "treasury",
  EXECUTION: "execution"
});

export const AccountBindingStatus = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked",
  COMPROMISED: "compromised"
});

export const AgentAccountChallengeStatus = Object.freeze({
  PENDING: "pending",
  CONSUMED: "consumed",
  EXPIRED: "expired"
});

export const MandateStatus = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  REVOKED: "revoked",
  EXPIRED: "expired"
});

export const MandateCapability = Object.freeze({
  REQUEST_CREDIT: "request_credit",
  ACCEPT_CREDIT_OFFER: "accept_credit_offer",
  EXECUTE_SANDBOX_CREDIT: "execute_sandbox_credit",
  PROVIDER_SPEND: "provider_spend",
  CAPTURE_REVENUE: "capture_revenue",
  ROUTE_REPAYMENT: "route_repayment"
});

export const RiskDecisionStatus = Object.freeze({
  APPROVED: "approved",
  REJECTED: "rejected",
  FROZEN: "frozen"
});

export const LockboxStatus = Object.freeze({
  CREATED: "created",
  ACTIVE: "active",
  FROZEN: "frozen",
  CLOSED: "closed"
});

export const LedgerAccountStatus = Object.freeze({
  ACTIVE: "active",
  FROZEN: "frozen",
  CLOSED: "closed"
});

export const LedgerEntryDirection = Object.freeze({
  DEBIT: "debit",
  CREDIT: "credit"
});

export const LedgerNormalSide = Object.freeze({
  DEBIT: "debit",
  CREDIT: "credit"
});

export const LedgerAccountType = Object.freeze({
  LOCKBOX_ASSET: "lockbox_asset",
  EXTERNAL_REVENUE: "external_revenue",
  REPAYMENT_CLEARING: "repayment_clearing",
  SANDBOX_FUNDING_SOURCE: "sandbox_funding_source",
  PRINCIPAL_RECEIVABLE: "principal_receivable",
  INTEREST_RECEIVABLE: "interest_receivable",
  FEE_RECEIVABLE: "fee_receivable",
  SYNTHETIC_INTEREST_INCOME: "synthetic_interest_income",
  SYNTHETIC_FEE_INCOME: "synthetic_fee_income",
  WRITE_OFF_LOSS: "write_off_loss"
});

export const SandboxRepaymentSource = Object.freeze({
  SYNTHETIC_WALLET: "synthetic_wallet",
  SYNTHETIC_BANK: "synthetic_bank",
  SYNTHETIC_REVENUE: "synthetic_revenue"
});

export const CreditLineStatus = Object.freeze({
  REQUESTED: "requested",
  APPROVED: "approved",
  REJECTED: "rejected",
  FROZEN: "frozen",
  CLOSED: "closed"
});

export const CreditAuthorityType = Object.freeze({
  CONSENT: "consent",
  MANDATE: "mandate"
});

export const ConsentPurpose = Object.freeze({
  CREDIT_APPLICATION: "credit_application",
  CREDIT_DECISION: "credit_decision",
  CREDIT_OFFER_ACCEPTANCE: "credit_offer_acceptance",
  IDENTITY_REFERENCE_USE: "identity_reference_use",
  OBLIGATION_SERVICING: "obligation_servicing",
  EVIDENCE_SHARING: "evidence_sharing"
});

export const ConsentStatus = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked",
  EXPIRED: "expired"
});

export const HumanIdentityReferenceType = Object.freeze({
  KYC_REFERENCE: "kyc_reference",
  VERIFIABLE_CREDENTIAL_REFERENCE: "verifiable_credential_reference"
});

export const HumanIdentityAssurance = Object.freeze({
  SYNTHETIC_SELF_ASSERTED: "synthetic_self_asserted",
  SYNTHETIC_PROVIDER_ASSERTED: "synthetic_provider_asserted"
});

export const HumanIdentityReferenceStatus = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked",
  EXPIRED: "expired"
});

export const CreditIntentStatus = Object.freeze({
  SUBMITTED: "submitted",
  DECIDED: "decided",
  WITHDRAWN: "withdrawn",
  EXPIRED: "expired"
});

export const CreditOfferStatus = Object.freeze({
  OFFERED: "offered",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  EXPIRED: "expired",
  SUPERSEDED: "superseded"
});

export const RepaymentFrequency = Object.freeze({
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
  END_OF_TERM: "end_of_term"
});

export const ObligationStatus = Object.freeze({
  CREATED: "created",
  ACTIVE: "active",
  PARTIALLY_REPAID: "partially_repaid",
  FULLY_REPAID: "fully_repaid",
  DELINQUENT: "delinquent",
  OVERDUE: "overdue",
  DEFAULTED: "defaulted",
  RESTRUCTURED: "restructured",
  REPURCHASED: "repurchased",
  WRITTEN_OFF: "written_off",
  CLOSED: "closed"
});

export const ObligationExecutionStatus = Object.freeze({
  PENDING: "pending",
  EXECUTED: "executed",
  FAILED: "failed"
});

export const ServicingClassification = Object.freeze({
  CURRENT: "current",
  GRACE_PERIOD: "grace_period",
  DPD_1_30: "dpd_1_30",
  DPD_31_60: "dpd_31_60",
  DPD_61_89: "dpd_61_89",
  DEFAULTED: "defaulted",
  CURED: "cured",
  RESTRUCTURED: "restructured",
  REPURCHASED: "repurchased",
  WRITTEN_OFF: "written_off"
});

export const SandboxServicingOwner = Object.freeze({
  PLATFORM: "sandbox_platform",
  ORIGINATOR: "sandbox_originator"
});

export const SandboxServicingResolution = Object.freeze({
  RESTRUCTURE: "restructure",
  REPURCHASE: "repurchase",
  WRITE_OFF: "write_off"
});

export const SpendRequestStatus = Object.freeze({
  REQUESTED: "requested",
  APPROVED: "approved",
  REJECTED: "rejected",
  SETTLED: "settled",
  FAILED: "failed"
});

export const SpendPolicyStatus = Object.freeze({
  ACTIVE: "active",
  PAUSED: "paused",
  EXPIRED: "expired"
});

export const ProviderStatus = Object.freeze({
  PENDING: "pending",
  ALLOWLISTED: "allowlisted",
  SUSPENDED: "suspended",
  CLOSED: "closed"
});

export const PluginType = Object.freeze({
  IDENTITY: "identity",
  COMPLIANCE: "compliance",
  PAYMENT_RAIL: "payment_rail",
  ON_OFF_RAMP: "on_off_ramp",
  PROVIDER: "provider",
  ATTESTER: "attester",
  CHAIN: "chain",
  RISK: "risk"
});

export const PluginStatus = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  REVOKED: "revoked"
});

export const PluginAuthMethod = Object.freeze({
  OAUTH2: "oauth2",
  SIGNED_REQUEST: "signed_request",
  MTLS: "mtls",
  NONE: "none"
});

export const PluginFailurePolicy = Object.freeze({
  FAIL_CLOSED: "fail_closed",
  QUEUE_FOR_REVIEW: "queue_for_review",
  DENY_AND_ALERT: "deny_and_alert"
});

export const SettlementStatus = Object.freeze({
  RECORDED: "recorded",
  SETTLED: "settled",
  FAILED: "failed"
});

export const RailKind = Object.freeze({
  WEB2: "web2",
  WEB3: "web3",
  HYBRID: "hybrid"
});

export const RailFinalityModel = Object.freeze({
  INSTANT: "instant",
  ASYNC: "async",
  CHAIN: "chain"
});

export const TransferDirection = Object.freeze({
  ON_RAMP: "on_ramp",
  OFF_RAMP: "off_ramp",
  NATIVE: "native"
});

export const TransferIntentStatus = Object.freeze({
  CREATED: "created",
  QUOTED: "quoted",
  AUTHORIZED: "authorized",
  SUBMITTED: "submitted",
  PENDING: "pending",
  SETTLED: "settled",
  FAILED: "failed",
  REVERSED: "reversed",
  EXPIRED: "expired"
});

export const SettlementOutcome = Object.freeze({
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  REVERSED: "reversed"
});

export const SettlementFinality = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  FINALIZED: "finalized"
});

export const RiskAction = Object.freeze({
  NONE: "none",
  REDUCE_LIMIT: "reduce_limit",
  FREEZE_LOCKBOX: "freeze_lockbox",
  SUSPEND_SUBJECT: "suspend_subject",
  CLOSE_CREDIT_LINE: "close_credit_line"
});

export const RiskTier = Object.freeze({
  PRIME: "prime",
  STRONG: "strong",
  STANDARD: "standard",
  WATCH: "watch",
  RESTRICTED: "restricted"
});

export const CreditLearningSignalType = Object.freeze({
  ON_TIME_REPAYMENT: "on_time_repayment",
  FULL_REPAYMENT: "full_repayment",
  HIGH_REVENUE_CAPTURE: "high_revenue_capture",
  LOW_UTILIZATION: "low_utilization",
  HEALTHY_REPEAT_CYCLE: "healthy_repeat_cycle",
  LATE_REPAYMENT: "late_repayment",
  REJECTED_RISKY_SPEND: "rejected_risky_spend",
  HIGH_UTILIZATION: "high_utilization",
  DEFAULT_EVENT: "default_event",
  ADMIN_FREEZE: "admin_freeze"
});

export const CreditLearningCycleType = Object.freeze({
  MANUAL: "manual",
  HEALTHY: "healthy",
  RISKY: "risky",
  RECOVERY: "recovery"
});

export const CreditEventType = Object.freeze({
  SUBJECT_CREATED: "subject_created",
  SUBJECT_STATUS_CHANGED: "subject_status_changed",
  PRINCIPAL_CREATED: "principal_created",
  ACCOUNT_BOUND: "account_bound",
  AGENT_ACCOUNT_CHALLENGE_CREATED: "agent_account_challenge_created",
  AGENT_ACCOUNT_CHALLENGE_EXPIRED: "agent_account_challenge_expired",
  AGENT_ACCOUNT_PROOF_VERIFIED: "agent_account_proof_verified",
  WALLET_BOUND: "wallet_bound",
  MANDATE_CREATED: "mandate_created",
  MANDATE_STATUS_CHANGED: "mandate_status_changed",
  CONSENT_RECORDED: "consent_recorded",
  CONSENT_STATUS_CHANGED: "consent_status_changed",
  IDENTITY_REFERENCE_RECORDED: "identity_reference_recorded",
  IDENTITY_REFERENCE_STATUS_CHANGED: "identity_reference_status_changed",
  MANDATE_UTILIZATION_RESERVED: "mandate_utilization_reserved",
  MANDATE_UTILIZATION_RELEASED: "mandate_utilization_released",
  LEDGER_ACCOUNT_OPENED: "ledger_account_opened",
  LEDGER_TRANSACTION_POSTED: "ledger_transaction_posted",
  PLUGIN_REGISTERED: "plugin_registered",
  PLUGIN_STATUS_CHANGED: "plugin_status_changed",
  LOCKBOX_CREATED: "lockbox_created",
  LOCKBOX_STATUS_CHANGED: "lockbox_status_changed",
  LOCKBOX_BALANCE_DEBITED: "lockbox_balance_debited",
  REVENUE_CAPTURED: "revenue_captured",
  PROVIDER_ALLOWLISTED: "provider_allowlisted",
  SPEND_POLICY_CREATED: "spend_policy_created",
  SPEND_REQUESTED: "spend_requested",
  SPEND_APPROVED: "spend_approved",
  SPEND_REJECTED: "spend_rejected",
  SPEND_SETTLED: "spend_settled",
  CREDIT_LINE_DECIDED: "credit_line_decided",
  CREDIT_LINE_GRANTED: "credit_line_granted",
  CREDIT_LINE_UTILIZED: "credit_line_utilized",
  CREDIT_LINE_RELEASED: "credit_line_released",
  CREDIT_LINE_ADJUSTED: "credit_line_adjusted",
  CREDIT_LINE_STATUS_CHANGED: "credit_line_status_changed",
  CREDIT_INTENT_CREATED: "credit_intent_created",
  CREDIT_INTENT_STATUS_CHANGED: "credit_intent_status_changed",
  CREDIT_OFFER_CREATED: "credit_offer_created",
  CREDIT_OFFER_ACCEPTED: "credit_offer_accepted",
  CREDIT_OFFER_ACCEPTANCE_RECORDED: "credit_offer_acceptance_recorded",
  CREDIT_OFFER_STATUS_CHANGED: "credit_offer_status_changed",
  RISK_DECISION_CREATED: "risk_decision_created",
  OBLIGATION_CREATED: "obligation_created",
  OBLIGATION_SANDBOX_EXECUTED: "obligation_sandbox_executed",
  INTEREST_ACCRUED: "interest_accrued",
  OBLIGATION_STATUS_CHANGED: "obligation_status_changed",
  OBLIGATION_UPDATED: "obligation_updated",
  REPAYMENT_POSTED: "repayment_posted",
  REPAYMENT_CAPTURED: "repayment_captured",
  REPAYMENT_ROUTED: "repayment_routed",
  DEFAULT_RECORDED: "default_recorded",
  SERVICING_ADVANCED: "servicing_advanced",
  OBLIGATION_CURED: "obligation_cured",
  OBLIGATION_RESTRUCTURED: "obligation_restructured",
  OBLIGATION_REPURCHASED: "obligation_repurchased",
  OBLIGATION_WRITTEN_OFF: "obligation_written_off",
  TRANSFER_INTENT_CREATED: "transfer_intent_created",
  TRANSFER_QUOTED: "transfer_quoted",
  TRANSFER_AUTHORIZED: "transfer_authorized",
  TRANSFER_SUBMITTED: "transfer_submitted",
  TRANSFER_EXPIRED: "transfer_expired",
  SETTLEMENT_RECEIPT_RECORDED: "settlement_receipt_recorded",
  CREDIT_PROFILE_CREATED: "credit_profile_created",
  CREDIT_SCORE_UPDATED: "credit_score_updated",
  REPUTATION_SIGNAL_RECORDED: "reputation_signal_recorded",
  CREDIT_LIMIT_RECOMMENDED: "credit_limit_recommended",
  INTEREST_RATE_RECOMMENDED: "interest_rate_recommended",
  RISK_TIER_UPDATED: "risk_tier_updated",
  CREDIT_LEARNING_CYCLE_COMPLETED: "credit_learning_cycle_completed",
  PILOT_FEEDBACK_RECORDED: "pilot_feedback_recorded",
  ADMIN_ACTION_RECORDED: "admin_action_recorded"
});

export const FinalityStatus = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  FINALIZED: "finalized",
  REORGED: "reorged",
  INVALIDATED: "invalidated"
});

export function enumValues(enumObject) {
  return Object.values(enumObject);
}
