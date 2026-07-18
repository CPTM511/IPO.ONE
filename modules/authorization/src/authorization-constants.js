export const AUTHORIZATION_POLICY_VERSION = "security_001.v1";
export const AUTHORIZATION_DECISION_SCHEMA_VERSION = "authorization_decision.v2";
export const AUTHORIZATION_AUDIT_SCHEMA_VERSION = "authorization_audit_event.v2";

export const AuthorizationSurface = Object.freeze({
  PUBLIC_SANDBOX: "public_sandbox",
  AUTHENTICATED_TENANT: "authenticated_tenant",
  TENANT_WORKER: "tenant_worker"
});

export const OwnershipRule = Object.freeze({
  NONE: "none",
  ACTOR: "actor",
  TENANT: "tenant",
  TENANT_OR_ACCESS_GRANT: "tenant_or_access_grant",
  SANDBOX_PARTITION: "sandbox_partition"
});

export const ApprovalRequirement = Object.freeze({
  NONE: "none",
  PROTECTIVE: "protective_single_actor",
  DUAL_CONTROL: "dual_control",
  PROHIBITED: "prohibited"
});

export const IdempotencyRequirement = Object.freeze({
  OPTIONAL: "optional",
  REQUIRED: "required",
  PROHIBITED: "prohibited"
});

export const AuthorizationDecisionValue = Object.freeze({
  ALLOW: "allow",
  DENY: "deny"
});

export const MembershipStatus = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  REVOKED: "revoked",
  EXPIRED: "expired"
});

export const AccessGrantStatus = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked",
  EXPIRED: "expired"
});

export const AccessGrantCapability = Object.freeze({
  PROVIDER_INTENT_DELIVERY: "provider_intent_delivery",
  SCOPED_AUDIT_READ: "scoped_audit_read",
  PLATFORM_RECONCILIATION_READ: "platform_reconciliation_read"
});

export const RoleBundle = Object.freeze({
  TENANT_OWNER: "tenant_owner",
  DEVELOPER: "developer",
  PRINCIPAL_CONTROLLER: "principal_controller",
  HUMAN_BORROWER: "human_borrower",
  AGENT_RUNTIME: "agent_runtime",
  RISK_OPERATOR: "risk_operator",
  OPERATIONS_OPERATOR: "operations_operator",
  AUDITOR: "auditor",
  PROVIDER_SERVICE: "provider_service",
  SYSTEM_WORKER: "system_worker"
});

export const PilotCapability = Object.freeze({
  TENANT_MEMBERSHIP_MANAGE: "tenant.membership.manage",
  TENANT_CLIENT_MANAGE: "tenant.client.manage",
  TENANT_SETTINGS_READ: "tenant.settings.read",
  TENANT_SETTINGS_WRITE: "tenant.settings.write",
  TENANT_SUMMARY_READ: "tenant.summary.read",
  AGENT_CREATE: "agent.create",
  AGENT_MANAGE_OWNED: "agent.manage.owned",
  AGENT_ACCOUNT_CHALLENGE_CREATE_OWNED: "agent_account.challenge.create.owned",
  AGENT_ACCOUNT_PROOF_SUBMIT_SELF: "agent_account.proof.submit.self",
  AGENT_ACCOUNT_BINDING_READ_SELF: "agent_account.binding.read.self",
  INTEGRATION_READ_OWNED: "integration.read.owned",
  MANDATE_DRAFT_CREATE: "mandate.draft.create",
  MANDATE_DRAFT_REVOKE: "mandate.draft.revoke",
  MANDATE_ACTIVATE_OWNED: "mandate.activate.owned",
  HUMAN_SUBJECT_CREATE_SELF: "human_subject.create.self",
  SUBJECT_READ_SELF: "subject.read.self",
  WORKSPACE_RESUME_SELF: "workspace.resume.self",
  CONSENT_CREATE_SELF: "consent.create.self",
  CONSENT_READ_SELF: "consent.read.self",
  CONSENT_REVOKE_SELF: "consent.revoke.self",
  IDENTITY_REFERENCE_READ_SELF: "identity_reference.read.self",
  CREDIT_REQUEST: "credit.request",
  CREDIT_READ_SELF: "credit.read.self",
  CREDIT_EVALUATE_SELF: "credit.evaluate.self",
  CREDIT_OFFER_ACCEPT_SELF: "credit.offer.accept.self",
  CREDIT_EXECUTE_SANDBOX_SELF: "credit.execute.sandbox.self",
  REPAYMENT_POST_SANDBOX_SELF: "repayment.post.sandbox.self",
  OBLIGATION_READ_OWNED: "obligation.read.owned",
  SERVICING_QUEUE_READ: "servicing.queue.read",
  SERVICING_ADVANCE_SANDBOX: "servicing.advance.sandbox",
  SERVICING_RESTRUCTURE_SANDBOX: "servicing.restructure.sandbox",
  SERVICING_REPURCHASE_SANDBOX: "servicing.repurchase.sandbox",
  SERVICING_WRITEOFF_SANDBOX: "servicing.writeoff.sandbox",
  SPEND_REQUEST: "spend.request",
  REVENUE_CAPTURE: "revenue.capture",
  REPAYMENT_EXECUTE: "repayment.execute",
  RISK_READ_TENANT: "risk.read.tenant",
  PILOT_HEALTH_READ: "pilot.health.read",
  PILOT_FEEDBACK_SUBMIT_SELF: "pilot.feedback.submit.self",
  PILOT_FEEDBACK_READ_TENANT: "pilot.feedback.read.tenant",
  RISK_FREEZE: "risk.freeze",
  RISK_LIMIT_REDUCE: "risk.limit.reduce",
  RISK_LIMIT_INCREASE: "risk.limit.increase",
  RISK_UNFREEZE: "risk.unfreeze",
  PROVIDER_INTENT_READ: "provider.intent.read",
  PROVIDER_INTENT_ACKNOWLEDGE: "provider.intent.acknowledge",
  EVIDENCE_READ: "evidence.read",
  EVIDENCE_READ_OWNED: "evidence.read.owned",
  AUDIT_EXPORT: "audit.export",
  PROVIDER_HEALTH_READ: "provider.health.read",
  RECONCILIATION_READ: "reconciliation.read",
  RECONCILIATION_RUN: "reconciliation.run",
  PROVIDER_PAUSE: "provider.pause",
  PROJECTION_REPAIR_PLAN: "projection_repair.plan",
  PROJECTION_REPAIR_EXECUTE: "projection_repair.execute",
  APPROVAL_PROPOSE: "approval.propose",
  APPROVAL_DECIDE: "approval.decide",
  APPROVAL_READ: "approval.read",
  APPROVAL_CANCEL: "approval.cancel",
  APPROVAL_EXPIRE: "approval.expire",
  WORKER_OUTBOX_PUBLISH: "worker.outbox.publish",
  WORKER_INBOX_PROCESS: "worker.inbox.process"
});

export const ROLE_BUNDLE_CAPABILITIES = Object.freeze({
  [RoleBundle.TENANT_OWNER]: Object.freeze([
    PilotCapability.TENANT_MEMBERSHIP_MANAGE,
    PilotCapability.TENANT_CLIENT_MANAGE,
    PilotCapability.TENANT_SETTINGS_READ,
    PilotCapability.TENANT_SETTINGS_WRITE,
    PilotCapability.TENANT_SUMMARY_READ
  ]),
  [RoleBundle.DEVELOPER]: Object.freeze([
    PilotCapability.AGENT_CREATE,
    PilotCapability.AGENT_MANAGE_OWNED,
    PilotCapability.AGENT_ACCOUNT_CHALLENGE_CREATE_OWNED,
    PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
    PilotCapability.INTEGRATION_READ_OWNED,
    PilotCapability.MANDATE_DRAFT_CREATE,
    PilotCapability.MANDATE_DRAFT_REVOKE,
    PilotCapability.EVIDENCE_READ_OWNED
  ]),
  [RoleBundle.PRINCIPAL_CONTROLLER]: Object.freeze([
    PilotCapability.AGENT_CREATE,
    PilotCapability.AGENT_MANAGE_OWNED,
    PilotCapability.AGENT_ACCOUNT_CHALLENGE_CREATE_OWNED,
    PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
    PilotCapability.INTEGRATION_READ_OWNED,
    PilotCapability.MANDATE_DRAFT_CREATE,
    PilotCapability.MANDATE_DRAFT_REVOKE,
    PilotCapability.MANDATE_ACTIVATE_OWNED,
    PilotCapability.EVIDENCE_READ_OWNED
  ]),
  [RoleBundle.HUMAN_BORROWER]: Object.freeze([
    PilotCapability.HUMAN_SUBJECT_CREATE_SELF,
    PilotCapability.SUBJECT_READ_SELF,
    PilotCapability.CONSENT_CREATE_SELF,
    PilotCapability.CONSENT_READ_SELF,
    PilotCapability.CONSENT_REVOKE_SELF,
    PilotCapability.IDENTITY_REFERENCE_READ_SELF,
    PilotCapability.CREDIT_REQUEST,
    PilotCapability.CREDIT_READ_SELF,
    PilotCapability.CREDIT_EVALUATE_SELF,
    PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
    PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
    PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
    PilotCapability.OBLIGATION_READ_OWNED,
    PilotCapability.EVIDENCE_READ_OWNED,
    PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF
  ]),
  [RoleBundle.AGENT_RUNTIME]: Object.freeze([
    PilotCapability.SUBJECT_READ_SELF,
    PilotCapability.AGENT_ACCOUNT_PROOF_SUBMIT_SELF,
    PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
    PilotCapability.CREDIT_REQUEST,
    PilotCapability.CREDIT_READ_SELF,
    PilotCapability.CREDIT_EVALUATE_SELF,
    PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
    PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
    PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
    PilotCapability.OBLIGATION_READ_OWNED,
    PilotCapability.EVIDENCE_READ_OWNED,
    PilotCapability.SPEND_REQUEST,
    PilotCapability.REVENUE_CAPTURE,
    PilotCapability.REPAYMENT_EXECUTE,
    PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF
  ]),
  [RoleBundle.RISK_OPERATOR]: Object.freeze([
    PilotCapability.RISK_READ_TENANT,
    PilotCapability.PILOT_HEALTH_READ,
    PilotCapability.PILOT_FEEDBACK_READ_TENANT,
    PilotCapability.SERVICING_QUEUE_READ,
    PilotCapability.RISK_FREEZE,
    PilotCapability.RISK_LIMIT_REDUCE,
    PilotCapability.RISK_LIMIT_INCREASE,
    PilotCapability.RISK_UNFREEZE,
    PilotCapability.APPROVAL_PROPOSE,
    PilotCapability.APPROVAL_DECIDE,
    PilotCapability.APPROVAL_READ,
    PilotCapability.APPROVAL_CANCEL
  ]),
  [RoleBundle.OPERATIONS_OPERATOR]: Object.freeze([
    PilotCapability.PILOT_HEALTH_READ,
    PilotCapability.PILOT_FEEDBACK_READ_TENANT,
    PilotCapability.PROVIDER_HEALTH_READ,
    PilotCapability.RECONCILIATION_READ,
    PilotCapability.SERVICING_QUEUE_READ,
    PilotCapability.RISK_FREEZE,
    PilotCapability.PROVIDER_PAUSE,
    PilotCapability.PROJECTION_REPAIR_PLAN,
    PilotCapability.PROJECTION_REPAIR_EXECUTE,
    PilotCapability.SERVICING_RESTRUCTURE_SANDBOX,
    PilotCapability.SERVICING_REPURCHASE_SANDBOX,
    PilotCapability.SERVICING_WRITEOFF_SANDBOX,
    PilotCapability.APPROVAL_PROPOSE,
    PilotCapability.APPROVAL_DECIDE,
    PilotCapability.APPROVAL_READ,
    PilotCapability.APPROVAL_CANCEL
  ]),
  [RoleBundle.AUDITOR]: Object.freeze([
    PilotCapability.EVIDENCE_READ,
    PilotCapability.AUDIT_EXPORT,
    PilotCapability.RISK_READ_TENANT,
    PilotCapability.PILOT_HEALTH_READ,
    PilotCapability.PILOT_FEEDBACK_READ_TENANT,
    PilotCapability.RECONCILIATION_READ,
    PilotCapability.APPROVAL_READ
  ]),
  [RoleBundle.PROVIDER_SERVICE]: Object.freeze([
    PilotCapability.PROVIDER_INTENT_READ,
    PilotCapability.PROVIDER_INTENT_ACKNOWLEDGE
  ]),
  [RoleBundle.SYSTEM_WORKER]: Object.freeze([
    PilotCapability.WORKER_OUTBOX_PUBLISH,
    PilotCapability.WORKER_INBOX_PROCESS,
    PilotCapability.REPAYMENT_EXECUTE,
    PilotCapability.SERVICING_ADVANCE_SANDBOX,
    PilotCapability.RECONCILIATION_READ,
    PilotCapability.RECONCILIATION_RUN,
    PilotCapability.PROJECTION_REPAIR_PLAN,
    PilotCapability.PROJECTION_REPAIR_EXECUTE,
    PilotCapability.APPROVAL_EXPIRE
  ])
});

export const ROLE_BUNDLE_ACTOR_TYPES = Object.freeze({
  [RoleBundle.TENANT_OWNER]: "human",
  [RoleBundle.DEVELOPER]: "human",
  [RoleBundle.PRINCIPAL_CONTROLLER]: "human",
  [RoleBundle.HUMAN_BORROWER]: "human",
  [RoleBundle.AGENT_RUNTIME]: "agent",
  [RoleBundle.RISK_OPERATOR]: "risk_operator",
  [RoleBundle.OPERATIONS_OPERATOR]: "operations_operator",
  [RoleBundle.AUDITOR]: "auditor",
  [RoleBundle.PROVIDER_SERVICE]: "provider",
  [RoleBundle.SYSTEM_WORKER]: "system_worker"
});

export const PROTECTIVE_REASON_CODES = Object.freeze([
  "credential_compromise",
  "operator_request",
  "provider_failure",
  "reconciliation_failure",
  "risk_limit_breach",
  "security_incident",
  "stop_loss_triggered"
]);

export const EXPOSURE_INCREASE_REASON_CODES = Object.freeze([
  "approved_exposure_change",
  "contractual_limit_change",
  "pilot_credit_review"
]);

export const REPAIR_REASON_CODES = Object.freeze([
  "projection_drift",
  "reconciliation_discrepancy"
]);

export const APPROVAL_LIFECYCLE_REASON_CODES = Object.freeze([
  "approval_confirmed",
  "approval_rejected",
  "approval_window_elapsed",
  "proposal_canceled",
  "proposal_superseded"
]);
