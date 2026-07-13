export const APPROVAL_POLICY_VERSION = "approval_001.v1";
export const APPROVAL_PROPOSAL_SCHEMA_VERSION = "approval_proposal.v1";
export const APPROVAL_DECISION_SCHEMA_VERSION = "approval_decision.v1";
export const APPROVAL_EXECUTION_SCHEMA_VERSION = "approval_execution.v1";
export const BREAK_GLASS_INCIDENT_SCHEMA_VERSION = "break_glass_incident.v1";
export const BREAK_GLASS_CUSTODIAN_DECISION_SCHEMA_VERSION =
  "break_glass_custodian_decision.v1";
export const BREAK_GLASS_REVIEW_SCHEMA_VERSION = "break_glass_review.v1";

export const ApprovalProjectionType = Object.freeze({
  APPROVAL_PROPOSAL: "approval_proposal",
  APPROVAL_DECISION: "approval_decision",
  APPROVAL_EXECUTION: "approval_execution",
  BREAK_GLASS_INCIDENT: "break_glass_incident",
  BREAK_GLASS_CUSTODIAN_DECISION: "break_glass_custodian_decision",
  BREAK_GLASS_REVIEW: "break_glass_review"
});

export const ApprovalProposalStatus = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELED: "canceled",
  EXPIRED: "expired",
  SUPERSEDED: "superseded",
  EXECUTED: "executed"
});

export const ApprovalDecisionValue = Object.freeze({
  APPROVE: "approve",
  REJECT: "reject"
});

export const BreakGlassIncidentStatus = Object.freeze({
  PENDING_CUSTODIANS: "pending_custodians",
  ACTIVE: "active",
  EXPIRED: "expired",
  CLOSED: "closed",
  CANCELED: "canceled"
});

export const BreakGlassReviewStatus = Object.freeze({
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  COMPLETED: "completed",
  OVERDUE: "overdue"
});

export const MAX_APPROVAL_WINDOW_MS = 30 * 60 * 1000;
export const DEFAULT_APPROVAL_WINDOW_MS = 15 * 60 * 1000;
export const MAX_BREAK_GLASS_WINDOW_MS = 30 * 60 * 1000;
export const BREAK_GLASS_ACTIVATION_WINDOW_MS = 10 * 60 * 1000;
export const BREAK_GLASS_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export const BREAK_GLASS_PROTECTIVE_ACTIONS = Object.freeze([
  "credential.revoke",
  "provider.pause",
  "risk.freeze",
  "tenant.command.pause",
  "worker.delivery.pause"
]);

export const BREAK_GLASS_PROHIBITED_ACTION_PREFIXES = Object.freeze([
  "access_grant.",
  "credential.issue",
  "funds.",
  "history.",
  "pii.",
  "projection_repair.execute",
  "risk.limit.increase",
  "risk.unfreeze"
]);
