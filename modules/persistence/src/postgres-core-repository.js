import {
  DomainError,
  assertNoRawPiiReference,
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";
import { PostgresEventRepository } from "./postgres-event-repository.js";
import { ApprovalProjectionType } from "../../approval/src/approval-constants.js";

export const CoreProjectionType = Object.freeze({
  PRINCIPAL: "principal",
  SUBJECT: "subject",
  ACCOUNT_BINDING: "account_binding",
  MANDATE: "mandate",
  MANDATE_RESERVATION: "mandate_reservation",
  MANDATE_RELEASE: "mandate_release",
  PROVIDER: "provider",
  SPEND_POLICY: "spend_policy",
  SPEND_REQUEST: "spend_request",
  LEDGER_ACCOUNT: "ledger_account",
  LEDGER_TRANSACTION: "ledger_transaction",
  LOCKBOX: "lockbox",
  OBLIGATION: "obligation",
  REPAYMENT: "repayment",
  CREDIT_LINE: "credit_line",
  RISK_DECISION: "risk_decision",
  ADMIN_ACTION: "admin_action",
  ...ApprovalProjectionType
});

const ENTITY_ID_FIELDS = Object.freeze({
  [CoreProjectionType.PRINCIPAL]: "principalId",
  [CoreProjectionType.SUBJECT]: "subjectId",
  [CoreProjectionType.ACCOUNT_BINDING]: "accountBindingId",
  [CoreProjectionType.MANDATE]: "mandateId",
  [CoreProjectionType.MANDATE_RESERVATION]: "reservationId",
  [CoreProjectionType.MANDATE_RELEASE]: "releaseId",
  [CoreProjectionType.PROVIDER]: "providerId",
  [CoreProjectionType.SPEND_POLICY]: "spendPolicyId",
  [CoreProjectionType.SPEND_REQUEST]: "spendRequestId",
  [CoreProjectionType.LEDGER_ACCOUNT]: "ledgerAccountId",
  [CoreProjectionType.LEDGER_TRANSACTION]: "ledgerTransactionId",
  [CoreProjectionType.LOCKBOX]: "lockboxId",
  [CoreProjectionType.OBLIGATION]: "obligationId",
  [CoreProjectionType.REPAYMENT]: "repaymentId",
  [CoreProjectionType.CREDIT_LINE]: "creditLineId",
  [CoreProjectionType.RISK_DECISION]: "riskDecisionId",
  [CoreProjectionType.ADMIN_ACTION]: "adminActionId",
  [CoreProjectionType.APPROVAL_PROPOSAL]: "approvalProposalId",
  [CoreProjectionType.APPROVAL_DECISION]: "approvalDecisionId",
  [CoreProjectionType.APPROVAL_EXECUTION]: "approvalExecutionId",
  [CoreProjectionType.BREAK_GLASS_INCIDENT]: "breakGlassIncidentId",
  [CoreProjectionType.BREAK_GLASS_CUSTODIAN_DECISION]: "breakGlassCustodianDecisionId",
  [CoreProjectionType.BREAK_GLASS_REVIEW]: "breakGlassReviewId"
});
const MAX_PROJECTION_BYTES = 128 * 1024;
const MAX_PROJECTION_WRITE_SET_BYTES = 2 * 1024 * 1024;

function clone(value) {
  return structuredClone(value);
}

function assertString(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new DomainError("invalid_core_projection", `${name} must be a non-empty string`, { name });
  }
}

function assertQueryable(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new DomainError("postgres_client_required", "an active pg-compatible transaction client is required");
  }
}

function normalizeJson(value, name) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new DomainError("invalid_core_projection", `${name} must be JSON-compatible`, {
      name,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

function json(value) {
  return JSON.stringify(value);
}

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value.slice(0, 10) : value;
}

function safeInteger(value, name) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new DomainError("invalid_core_projection", `${name} is not a safe integer`, { name });
  }
  return normalized;
}

function projectionConflict(entityType, entityId) {
  return new DomainError(
    "projection_identity_conflict",
    "projection identity was reused with different immutable fields",
    { entityType, entityId }
  );
}

function translateDatabaseError(error, write) {
  if (error instanceof DomainError) return error;
  if (error?.code === "23505") {
    if (
      write.type === CoreProjectionType.MANDATE &&
      typeof error.constraint === "string" &&
      error.constraint.includes("principal_id_nonce")
    ) {
      return new DomainError(
        "mandate_nonce_conflict",
        "principal mandate nonce is already in use"
      );
    }
    return new DomainError("projection_uniqueness_conflict", "projection violates a unique identity constraint", {
      entityType: write.type,
      constraint: error.constraint
    });
  }
  if (error?.code === "23503") {
    return new DomainError("projection_reference_missing", "projection references an entity that does not exist", {
      entityType: write.type,
      constraint: error.constraint
    });
  }
  if (error?.code === "23514") {
    return new DomainError("projection_invariant_violation", "projection violates a database invariant", {
      entityType: write.type,
      constraint: error.constraint
    });
  }
  if (error?.code === "23502" || error?.code === "22P02") {
    return new DomainError("invalid_core_projection", "projection contains a missing or invalid field", {
      entityType: write.type,
      column: error.column
    });
  }
  return error;
}

export function canonicalCoreProjection(entityType, value, { occurredAt } = {}) {
  if (!Object.hasOwn(ENTITY_ID_FIELDS, entityType)) {
    throw new DomainError("unsupported_projection_type", "projection type is not supported", { entityType });
  }
  const canonical = clone(value);
  if (entityType === CoreProjectionType.PRINCIPAL) delete canonical.linkedSubjectIds;
  if (entityType === CoreProjectionType.SUBJECT) delete canonical.linkedAccountIds;
  if (entityType === CoreProjectionType.ACCOUNT_BINDING) {
    canonical.verificationMethod ??= "verified_signature";
  }
  if (entityType === CoreProjectionType.LOCKBOX) {
    delete canonical.balanceMinor;
    delete canonical.capturedRevenueMinor;
    canonical.updatedAt ??= occurredAt;
  }
  if (entityType === CoreProjectionType.SPEND_POLICY || entityType === CoreProjectionType.CREDIT_LINE) {
    canonical.updatedAt ??= occurredAt;
  }
  if (entityType === CoreProjectionType.ADMIN_ACTION) {
    canonical.payload ??= {};
    canonical.payloadHash ??= hashId("admin_action_payload", canonical.payload);
  }
  return normalizeJson(canonical, `${entityType} projection`);
}

export function createCoreProjectionHash(entityType, value, options) {
  return hashId("core_projection", {
    entityType,
    entity: canonicalCoreProjection(entityType, value, options)
  });
}

function projectionStateFromRow(entityType, entityId, row) {
  if (!row?.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
    throw new DomainError("projection_integrity_mismatch", "durable projection payload is unavailable", {
      entityType,
      entityId
    });
  }
  const payloadHash = createCoreProjectionHash(entityType, row.payload);
  if (
    row.registry_hash !== row.snapshot_hash ||
    row.snapshot_hash !== payloadHash ||
    row.registry_root_aggregate_type !== row.root_aggregate_type ||
    row.registry_root_aggregate_id !== row.root_aggregate_id ||
    Number(row.registry_aggregate_version) !== Number(row.aggregate_version)
  ) {
    throw new DomainError("projection_integrity_mismatch", "durable projection registry and snapshot disagree", {
      entityType,
      entityId
    });
  }
  const aggregateVersion = safeInteger(row.registry_aggregate_version, "aggregateVersion");
  if (aggregateVersion < 1) {
    throw new DomainError("projection_integrity_mismatch", "durable projection version is invalid", {
      entityType,
      entityId
    });
  }
  return {
    value: clone(row.payload),
    aggregateVersion,
    entityHash: row.registry_hash,
    rootAggregateType: row.registry_root_aggregate_type,
    rootAggregateId: row.registry_root_aggregate_id
  };
}

function mapPrincipal(row, linkedSubjectIds = []) {
  if (!row) return undefined;
  return {
    principalId: row.id,
    principalHash: row.principal_hash,
    principalType: row.principal_type,
    legalEntityRef: row.legal_entity_ref ?? undefined,
    jurisdiction: row.jurisdiction ?? undefined,
    responsibilityScope: row.responsibility_scope,
    linkedSubjectIds,
    status: row.status,
    createdAt: timestamp(row.created_at),
    schemaVersion: row.schema_version
  };
}

function mapSubject(row, linkedAccountIds = []) {
  if (!row) return undefined;
  return {
    subjectId: row.id,
    subjectHash: row.subject_hash,
    subjectType: row.subject_type,
    displayName: row.display_name,
    primaryPrincipalId: row.primary_principal_id,
    linkedAccountIds,
    status: row.status,
    riskTier: row.risk_tier,
    metadataRef: row.metadata_ref ?? undefined,
    prototypeOnly: row.prototype_only,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapAccountBinding(row) {
  if (!row) return undefined;
  return {
    accountBindingId: row.id,
    subjectId: row.subject_id,
    accountHash: row.account_hash,
    accountIdRef: row.account_ref,
    chainId: row.chain_id,
    purpose: row.purpose,
    signatureHash: row.signature_hash,
    nonce: row.nonce,
    verificationMethod: row.verification_method,
    status: row.status,
    boundAt: timestamp(row.bound_at),
    revokedAt: row.revoked_at ? timestamp(row.revoked_at) : undefined,
    schemaVersion: row.schema_version
  };
}

function mapMandate(row) {
  if (!row) return undefined;
  return {
    mandateId: row.id,
    mandateHash: row.mandate_hash,
    principalId: row.principal_id,
    subjectId: row.subject_id,
    capabilities: row.capabilities,
    allowedProviderIds: row.allowed_provider_ids,
    allowedCategories: row.allowed_categories,
    assetIds: row.asset_ids,
    perActionLimitMinor: row.per_action_limit_minor,
    aggregateLimitMinor: row.aggregate_limit_minor,
    utilizedMinor: row.utilized_minor,
    validFrom: timestamp(row.valid_from),
    expiresAt: timestamp(row.expires_at),
    nonce: row.nonce,
    termsRef: row.terms_ref,
    status: row.status,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapMandateReservation(row) {
  if (!row) return undefined;
  return {
    reservationId: row.id,
    reservationHash: row.reservation_hash,
    mandateId: row.mandate_id,
    subjectId: row.subject_id,
    capability: row.capability,
    providerId: row.provider_id ?? undefined,
    category: row.category ?? undefined,
    assetId: row.asset_id,
    amountMinor: row.amount_minor,
    releasedMinor: row.released_minor,
    createdAt: timestamp(row.created_at),
    schemaVersion: row.schema_version
  };
}

function mapMandateRelease(row) {
  if (!row) return undefined;
  return {
    releaseId: row.id,
    releaseHash: row.release_hash,
    mandateId: row.mandate_id,
    reservationId: row.reservation_id,
    amountMinor: row.amount_minor,
    reason: row.reason,
    createdAt: timestamp(row.created_at),
    schemaVersion: row.schema_version
  };
}

function mapProvider(row) {
  if (!row) return undefined;
  return {
    providerId: row.id,
    providerHash: row.provider_hash,
    name: row.name,
    settlementAccountIdRef: row.settlement_account_ref,
    status: row.status,
    riskTier: row.risk_tier,
    createdAt: timestamp(row.created_at),
    schemaVersion: row.schema_version
  };
}

function mapSpendPolicy(row) {
  if (!row) return undefined;
  return {
    spendPolicyId: row.id,
    spendPolicyHash: row.policy_hash,
    subjectId: row.subject_id,
    providerId: row.provider_id,
    assetId: row.asset_id,
    category: row.category,
    perTxLimitMinor: row.per_tx_limit_minor,
    dailyLimitMinor: row.daily_limit_minor,
    obligationCapMinor: row.obligation_cap_minor,
    dailySpentMinor: row.daily_spent_minor,
    dailySpentDate: dateOnly(row.daily_spent_date_text ?? row.daily_spent_date),
    status: row.status,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapSpendRequest(row) {
  if (!row) return undefined;
  return {
    spendRequestId: row.id,
    subjectId: row.subject_id,
    mandateId: row.mandate_id,
    providerId: row.provider_id,
    spendPolicyId: row.spend_policy_id,
    assetId: row.asset_id,
    amountMinor: row.amount_minor,
    purposeCode: row.purpose_code,
    status: row.status,
    rejectionReason: row.rejection_reason ?? undefined,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapLedgerAccount(row) {
  if (!row) return undefined;
  return {
    ledgerAccountId: row.id,
    ledgerAccountHash: row.account_hash,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    assetId: row.asset_id,
    accountType: row.account_type,
    normalSide: row.normal_side,
    status: row.status,
    openedAt: timestamp(row.opened_at),
    schemaVersion: row.schema_version
  };
}

function mapLedgerTransaction(row, entries = []) {
  if (!row) return undefined;
  return {
    ledgerTransactionId: row.id,
    transactionHash: row.transaction_hash,
    idempotencyKey: row.idempotency_key,
    transactionType: row.transaction_type,
    assetId: row.asset_id,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    metadata: row.metadata,
    metadataHash: row.metadata_hash,
    debitTotalMinor: row.debit_total_minor,
    creditTotalMinor: row.credit_total_minor,
    entryCount: row.entry_count,
    postedAt: timestamp(row.posted_at),
    schemaVersion: row.schema_version,
    entries
  };
}

function mapLedgerEntry(row) {
  return {
    ledgerEntryId: row.id,
    ledgerTransactionId: row.transaction_id,
    ledgerAccountId: row.account_id,
    direction: row.direction,
    amountMinor: row.amount_minor,
    sequence: row.sequence,
    postedAt: timestamp(row.posted_at),
    schemaVersion: row.schema_version
  };
}

function mapLockbox(row) {
  if (!row) return undefined;
  return {
    lockboxId: row.id,
    lockboxHash: row.lockbox_hash,
    subjectId: row.subject_id,
    chainId: row.chain_id,
    assetId: row.asset_id,
    accountIdRef: row.account_ref,
    ledgerAccountId: row.ledger_account_id,
    revenueLedgerAccountId: row.revenue_ledger_account_id,
    repaymentLedgerAccountId: row.repayment_ledger_account_id,
    status: row.status,
    balanceMinor: row.balance_minor ?? "0",
    capturedRevenueMinor: row.captured_revenue_minor ?? "0",
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapObligation(row) {
  if (!row) return undefined;
  return {
    obligationId: row.id,
    obligationHash: row.obligation_hash,
    subjectId: row.subject_id,
    principalId: row.principal_id,
    mandateId: row.mandate_id,
    assetId: row.asset_id,
    principalAmountMinor: row.amount_minor,
    outstandingPrincipalMinor: row.outstanding_minor,
    accruedFeesMinor: row.accrued_fees_minor,
    repaidAmountMinor: row.repaid_amount_minor,
    spendPolicyId: row.spend_policy_id,
    cashflowRouteId: row.cashflow_route_id,
    dueAt: timestamp(row.due_at),
    status: row.status,
    repaymentPriority: row.repayment_priority,
    attestationIds: row.attestation_ids,
    chainExecutions: row.chain_executions,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapRepayment(row) {
  if (!row) return undefined;
  return {
    repaymentId: row.id,
    obligationId: row.obligation_id,
    subjectId: row.subject_id,
    amountMinor: row.amount_minor,
    assetId: row.asset_id,
    remainingMinor: row.remaining_minor,
    occurredAt: timestamp(row.occurred_at),
    schemaVersion: row.schema_version
  };
}

function mapCreditLine(row) {
  if (!row) return undefined;
  return {
    creditLineId: row.id,
    subjectId: row.subject_id,
    mandateId: row.mandate_id,
    assetId: row.asset_id,
    limitMinor: row.limit_minor,
    utilizedMinor: row.utilized_minor,
    status: row.status,
    riskSnapshotId: row.risk_snapshot_id ?? undefined,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapRiskDecision(row) {
  if (!row) return undefined;
  return {
    riskDecisionId: row.id,
    subjectId: row.subject_id,
    mandateId: row.mandate_id,
    assetId: row.asset_id,
    status: row.status,
    modelVersion: row.model_version,
    limitMinor: row.limit_minor,
    utilizationMinor: row.utilization_minor,
    action: row.action,
    reasons: row.reasons,
    createdAt: timestamp(row.created_at),
    schemaVersion: row.schema_version
  };
}

function mapAdminAction(row) {
  if (!row) return undefined;
  return {
    adminActionId: row.id,
    adminId: row.admin_id,
    actionType: row.action_type,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    payloadHash: row.payload_hash,
    payload: row.payload,
    createdAt: timestamp(row.created_at),
    schemaVersion: row.schema_version
  };
}

function mapApprovalProposal(row) {
  if (!row) return undefined;
  return {
    approvalProposalId: row.id,
    proposalHash: row.proposal_hash,
    tenantId: row.tenant_id,
    operationId: row.operation_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    commandActorId: row.command_actor_id,
    commandActorType: row.command_actor_type,
    commandClientId: row.command_client_id,
    commandHash: row.command_hash,
    idempotencyKeyHash: row.idempotency_key_hash,
    resourceVersion: safeInteger(row.resource_version, "resourceVersion"),
    liveStateVersion: safeInteger(row.live_state_version, "liveStateVersion"),
    reasonCode: row.reason_code,
    policyVersion: row.policy_version,
    approvalPolicyVersion: row.approval_policy_version,
    proposerActorId: row.proposer_actor_id,
    proposerClientId: row.proposer_client_id,
    proposerMembershipId: row.proposer_membership_id,
    proposerMembershipVersion: safeInteger(row.proposer_membership_version, "proposerMembershipVersion"),
    requiredApproverRoleBundles: row.required_approver_role_bundles,
    requiredApprovalCount: row.required_approval_count,
    status: row.status,
    version: safeInteger(row.version, "version"),
    expiresAt: timestamp(row.expires_at),
    approvedAt: row.approved_at ? timestamp(row.approved_at) : undefined,
    rejectedAt: row.rejected_at ? timestamp(row.rejected_at) : undefined,
    canceledAt: row.canceled_at ? timestamp(row.canceled_at) : undefined,
    expiredAt: row.expired_at ? timestamp(row.expired_at) : undefined,
    supersededAt: row.superseded_at ? timestamp(row.superseded_at) : undefined,
    supersededByProposalId: row.superseded_by_proposal_id ?? undefined,
    executedAt: row.executed_at ? timestamp(row.executed_at) : undefined,
    executionId: row.execution_id ?? undefined,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapApprovalDecision(row) {
  if (!row) return undefined;
  return {
    approvalDecisionId: row.id,
    decisionHash: row.decision_hash,
    tenantId: row.tenant_id,
    approvalProposalId: row.proposal_id,
    proposalVersion: safeInteger(row.proposal_version, "proposalVersion"),
    proposalHash: row.proposal_hash,
    commandHash: row.command_hash,
    policyVersion: row.policy_version,
    decision: row.decision,
    reasonCode: row.reason_code,
    approverActorId: row.approver_actor_id,
    approverActorType: row.approver_actor_type,
    approverClientId: row.approver_client_id,
    approverCredentialId: row.approver_credential_id,
    approverCredentialVersion: safeInteger(row.approver_credential_version, "approverCredentialVersion"),
    approverMembershipId: row.approver_membership_id,
    approverMembershipVersion: safeInteger(row.approver_membership_version, "approverMembershipVersion"),
    approverRoleBundle: row.approver_role_bundle,
    authTime: timestamp(row.auth_time),
    authenticationMethods: row.authentication_methods,
    tokenJtiHash: row.token_jti_hash,
    version: safeInteger(row.version, "version"),
    createdAt: timestamp(row.created_at),
    schemaVersion: row.schema_version
  };
}

function mapApprovalExecution(row) {
  if (!row) return undefined;
  return {
    approvalExecutionId: row.id,
    executionHash: row.execution_hash,
    tenantId: row.tenant_id,
    approvalProposalId: row.proposal_id,
    proposalVersion: safeInteger(row.proposal_version, "proposalVersion"),
    proposalHash: row.proposal_hash,
    commandHash: row.command_hash,
    authorizationDecisionId: row.authorization_decision_id,
    executedByActorId: row.executed_by_actor_id,
    idempotencyKeyHash: row.idempotency_key_hash,
    approvalDecisionIds: row.approval_decision_ids,
    businessEventIds: row.business_event_ids,
    resultHash: row.result_hash,
    version: safeInteger(row.version, "version"),
    executedAt: timestamp(row.executed_at),
    schemaVersion: row.schema_version
  };
}

function mapBreakGlassIncident(row) {
  if (!row) return undefined;
  return {
    breakGlassIncidentId: row.id,
    incidentHash: row.incident_hash,
    tenantId: row.tenant_id,
    reasonCode: row.reason_code,
    allowedActions: row.allowed_actions,
    resourceScopes: row.resource_scopes,
    requestedByActorId: row.requested_by_actor_id,
    requestedByClientId: row.requested_by_client_id,
    custodianActorIds: row.custodian_actor_ids,
    reviewOwnerActorId: row.review_owner_actor_id,
    deploymentApprovalRefHash: row.deployment_approval_ref_hash,
    notificationTargetRefHash: row.notification_target_ref_hash,
    maximumSessionMs: safeInteger(row.maximum_session_ms, "maximumSessionMs"),
    status: row.status,
    reviewStatus: row.review_status,
    version: safeInteger(row.version, "version"),
    activationDeadline: timestamp(row.activation_deadline),
    activatedAt: row.activated_at ? timestamp(row.activated_at) : undefined,
    expiresAt: row.expires_at ? timestamp(row.expires_at) : undefined,
    expiredAt: row.expired_at ? timestamp(row.expired_at) : undefined,
    closedAt: row.closed_at ? timestamp(row.closed_at) : undefined,
    canceledAt: row.canceled_at ? timestamp(row.canceled_at) : undefined,
    reviewDueAt: row.review_due_at ? timestamp(row.review_due_at) : undefined,
    declaredAt: timestamp(row.declared_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapBreakGlassCustodianDecision(row) {
  if (!row) return undefined;
  return {
    breakGlassCustodianDecisionId: row.id,
    decisionHash: row.decision_hash,
    tenantId: row.tenant_id,
    breakGlassIncidentId: row.incident_id,
    incidentVersion: safeInteger(row.incident_version, "incidentVersion"),
    incidentHash: row.incident_hash,
    custodianActorId: row.custodian_actor_id,
    custodianClientId: row.custodian_client_id,
    custodianCredentialId: row.custodian_credential_id,
    custodianCredentialVersion: safeInteger(row.custodian_credential_version, "custodianCredentialVersion"),
    hardwareKeyRefHash: row.hardware_key_ref_hash,
    authTime: timestamp(row.auth_time),
    authenticationMethods: row.authentication_methods,
    version: safeInteger(row.version, "version"),
    createdAt: timestamp(row.created_at),
    schemaVersion: row.schema_version
  };
}

function mapBreakGlassReview(row) {
  if (!row) return undefined;
  return {
    breakGlassReviewId: row.id,
    reviewHash: row.review_hash,
    tenantId: row.tenant_id,
    breakGlassIncidentId: row.incident_id,
    incidentHash: row.incident_hash,
    reviewerActorId: row.reviewer_actor_id,
    reviewerClientId: row.reviewer_client_id,
    findingsRefHash: row.findings_ref_hash,
    version: safeInteger(row.version, "version"),
    completedAt: timestamp(row.completed_at),
    schemaVersion: row.schema_version
  };
}

export class PostgresCoreRepository {
  constructor({ pool, eventRepository, tenantContext } = {}) {
    if (!pool || typeof pool.query !== "function") {
      throw new DomainError("postgres_pool_required", "PostgresCoreRepository requires a pg-compatible pool");
    }
    this.pool = pool;
    this.eventRepository = eventRepository ?? new PostgresEventRepository({ pool, tenantContext });
  }

  async findCommand(input) {
    return this.eventRepository.findCommand(input);
  }

  async findCommandInTransaction(client, input) {
    assertQueryable(client);
    return this.eventRepository.findCommandInTransaction(client, input);
  }

  async withTenantTransaction(operation) {
    return this.eventRepository.withTenantWrite(operation);
  }

  async commitCommand(input) {
    return this.#commitCommand(input);
  }

  async commitCommandInTransaction(client, input) {
    assertQueryable(client);
    return this.#commitCommand(input, client);
  }

  async #commitCommand({ aggregateType, aggregateId, idempotencyKey, commandHash, events, writes, response }, client) {
    for (const [name, value] of Object.entries({ aggregateType, aggregateId, idempotencyKey, commandHash })) {
      assertString(name, value);
    }
    if (!Array.isArray(writes) || writes.length === 0 || writes.length > 256) {
      throw new DomainError("invalid_projection_write_set", "writes must contain between 1 and 256 projections");
    }
    assertNoRawPiiReference(response, "commandResponse");
    const normalizedWrites = writes.map((write, index) => this.#normalizeWrite(write, index));
    const writeSetBytes = normalizedWrites.reduce((sum, write) => sum + Buffer.byteLength(json(write.value)), 0);
    if (writeSetBytes > MAX_PROJECTION_WRITE_SET_BYTES) {
      throw new DomainError("projection_write_set_too_large", "combined projection writes exceed the repository limit");
    }
    const writeKeys = normalizedWrites.map((write) => `${write.type}\0${write.entityId}`);
    if (new Set(writeKeys).size !== writeKeys.length) {
      throw new DomainError("duplicate_projection_write", "a command may write each projected entity only once");
    }

    const appendCommand = client
      ? (command) => this.eventRepository.appendCommandBatchInTransaction(client, command)
      : (command) => this.eventRepository.appendCommandBatch(command);
    return appendCommand({
      aggregateType,
      aggregateId,
      idempotencyKey,
      commandHash,
      events,
      response,
      applyProjection: async ({ client, committed }) => {
        const committedByEventId = new Map(committed.map((item) => [item.event.eventId, item]));
        for (const write of normalizedWrites) {
          const source = write.eventId
            ? committedByEventId.get(write.eventId)
            : committed.at(-1);
          if (!source) {
            throw new DomainError("projection_event_missing", "projection references an event outside the command", {
              entityType: write.type,
              eventId: write.eventId
            });
          }
          try {
            await this.#applyWrite(client, write, source.event.occurredAt);
            const canonical = canonicalCoreProjection(write.type, write.value, {
              occurredAt: source.event.occurredAt
            });
            const entityHash = createCoreProjectionHash(write.type, canonical);
            await client.query(
              `INSERT INTO projection_snapshots(
                 id, entity_type, entity_id, entity_hash, root_aggregate_type,
                 root_aggregate_id, aggregate_version, source_event_id, payload, recorded_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                hashId("projection_snapshot_id", {
                  eventId: source.event.eventId,
                  entityType: write.type,
                  entityId: write.entityId
                }),
                write.type,
                write.entityId,
                entityHash,
                aggregateType,
                aggregateId,
                source.aggregateVersion,
                source.event.eventId,
                json(canonical),
                source.event.occurredAt
              ]
            );
            await client.query(
              `INSERT INTO projection_registry(
                 entity_type, entity_id, entity_hash, root_aggregate_type,
                 root_aggregate_id, aggregate_version, last_event_id, updated_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (tenant_id, entity_type, entity_id) DO UPDATE
                 SET entity_hash = EXCLUDED.entity_hash,
                     root_aggregate_type = EXCLUDED.root_aggregate_type,
                     root_aggregate_id = EXCLUDED.root_aggregate_id,
                     aggregate_version = EXCLUDED.aggregate_version,
                     last_event_id = EXCLUDED.last_event_id,
                     updated_at = EXCLUDED.updated_at`,
              [
                write.type,
                write.entityId,
                entityHash,
                aggregateType,
                aggregateId,
                source.aggregateVersion,
                source.event.eventId,
                source.event.occurredAt
              ]
            );
          } catch (error) {
            throw translateDatabaseError(error, write);
          }
        }
      }
    });
  }

  async getPrincipal(principalId) {
    assertString("principalId", principalId);
    const [principal, subjects] = await this.eventRepository.withTenantRead((client) => Promise.all([
      client.query("SELECT * FROM principals WHERE id = $1", [principalId]),
      client.query("SELECT id FROM subjects WHERE primary_principal_id = $1 ORDER BY created_at, id", [principalId])
    ]));
    return mapPrincipal(principal.rows[0], subjects.rows.map((row) => row.id));
  }

  async findPrincipalByHashInTransaction(client, principalHash) {
    assertQueryable(client);
    assertString("principalHash", principalHash);
    const result = await client.query(
      "SELECT * FROM principals WHERE principal_hash = $1",
      [principalHash]
    );
    return mapPrincipal(result.rows[0]);
  }

  async countAgentSubjectsForCapacityInTransaction(client) {
    return this.#lockAndCountPersistentResource(
      client,
      "agent_subjects",
      "SELECT count(*)::bigint AS count FROM subjects WHERE subject_type = 'agent'"
    );
  }

  async countMandatesForCapacityInTransaction(client) {
    return this.#lockAndCountPersistentResource(
      client,
      "mandates",
      "SELECT count(*)::bigint AS count FROM mandates"
    );
  }

  async findMandateByPrincipalNonceInTransaction(client, principalId, nonce) {
    assertQueryable(client);
    assertString("principalId", principalId);
    assertString("nonce", nonce);
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtext('mandate_nonce:' || $1 || ':' || $2),
         hashtext($3)
       )`,
      [this.eventRepository.tenantContext.tenantId, principalId, nonce]
    );
    const result = await client.query(
      "SELECT * FROM mandates WHERE principal_id = $1 AND nonce = $2 FOR UPDATE",
      [principalId, nonce]
    );
    return mapMandate(result.rows[0]);
  }

  async getSubject(subjectId) {
    assertString("subjectId", subjectId);
    const [subject, bindings] = await this.eventRepository.withTenantRead((client) => Promise.all([
      client.query("SELECT * FROM subjects WHERE id = $1", [subjectId]),
      client.query("SELECT id FROM account_bindings WHERE subject_id = $1 ORDER BY bound_at, id", [subjectId])
    ]));
    return mapSubject(subject.rows[0], bindings.rows.map((row) => row.id));
  }

  async getAccountBinding(accountBindingId) {
    return this.#getOne("accountBindingId", accountBindingId, "SELECT * FROM account_bindings WHERE id = $1", mapAccountBinding);
  }

  async getMandate(mandateId) {
    return this.#getOne("mandateId", mandateId, "SELECT * FROM mandates WHERE id = $1", mapMandate);
  }

  async getMandateReservation(reservationId) {
    return this.#getOne(
      "reservationId",
      reservationId,
      "SELECT * FROM mandate_reservations WHERE id = $1",
      mapMandateReservation
    );
  }

  async getMandateRelease(releaseId) {
    return this.#getOne("releaseId", releaseId, "SELECT * FROM mandate_releases WHERE id = $1", mapMandateRelease);
  }

  async getProvider(providerId) {
    return this.#getOne("providerId", providerId, "SELECT * FROM providers WHERE id = $1", mapProvider);
  }

  async getSpendPolicy(spendPolicyId) {
    return this.#getOne(
      "spendPolicyId",
      spendPolicyId,
      "SELECT *, daily_spent_date::text AS daily_spent_date_text FROM spend_policies WHERE id = $1",
      mapSpendPolicy
    );
  }

  async getSpendRequest(spendRequestId) {
    return this.#getOne("spendRequestId", spendRequestId, "SELECT * FROM spend_requests WHERE id = $1", mapSpendRequest);
  }

  async getLedgerAccount(ledgerAccountId) {
    return this.#getOne("ledgerAccountId", ledgerAccountId, "SELECT * FROM ledger_accounts WHERE id = $1", mapLedgerAccount);
  }

  async getLedgerTransaction(ledgerTransactionId) {
    assertString("ledgerTransactionId", ledgerTransactionId);
    const [transaction, entries] = await this.eventRepository.withTenantRead((client) => Promise.all([
      client.query("SELECT * FROM ledger_transactions WHERE id = $1", [ledgerTransactionId]),
      client.query("SELECT * FROM ledger_entries WHERE transaction_id = $1 ORDER BY sequence", [ledgerTransactionId])
    ]));
    return mapLedgerTransaction(transaction.rows[0], entries.rows.map(mapLedgerEntry));
  }

  async getLockbox(lockboxId) {
    assertString("lockboxId", lockboxId);
    const result = await this.#tenantQuery(
      `SELECT l.*,
              COALESCE(SUM(CASE
                WHEN e.account_id = l.ledger_account_id AND e.direction = 'debit' THEN e.amount_minor
                WHEN e.account_id = l.ledger_account_id AND e.direction = 'credit' THEN -e.amount_minor
                ELSE 0
              END), 0)::text AS balance_minor,
              COALESCE(SUM(CASE
                WHEN e.account_id = l.ledger_account_id AND e.direction = 'debit' THEN e.amount_minor
                ELSE 0
              END), 0)::text AS captured_revenue_minor
         FROM lockboxes l
         LEFT JOIN ledger_entries e ON e.account_id = l.ledger_account_id
        WHERE l.id = $1
        GROUP BY l.id`,
      [lockboxId]
    );
    return mapLockbox(result.rows[0]);
  }

  async getLockboxInTransaction(client, lockboxId) {
    assertQueryable(client);
    assertString("lockboxId", lockboxId);
    const result = await client.query(
      `SELECT l.*,
              COALESCE(SUM(CASE
                WHEN e.account_id = l.ledger_account_id AND e.direction = 'debit' THEN e.amount_minor
                WHEN e.account_id = l.ledger_account_id AND e.direction = 'credit' THEN -e.amount_minor
                ELSE 0
              END), 0)::text AS balance_minor,
              COALESCE(SUM(CASE
                WHEN e.account_id = l.ledger_account_id AND e.direction = 'debit' THEN e.amount_minor
                ELSE 0
              END), 0)::text AS captured_revenue_minor
         FROM lockboxes l
         LEFT JOIN ledger_entries e ON e.account_id = l.ledger_account_id
        WHERE l.id = $1
        GROUP BY l.id`,
      [lockboxId]
    );
    return mapLockbox(result.rows[0]);
  }

  async getObligation(obligationId) {
    return this.#getOne("obligationId", obligationId, "SELECT * FROM obligations WHERE id = $1", mapObligation);
  }

  async listObligations({ subjectId, status } = {}) {
    const values = [];
    const where = [];
    if (subjectId !== undefined) {
      assertString("subjectId", subjectId);
      values.push(subjectId);
      where.push(`subject_id = $${values.length}`);
    }
    if (status !== undefined) {
      assertString("status", status);
      values.push(status);
      where.push(`status = $${values.length}`);
    }
    const result = await this.#tenantQuery(
      `SELECT * FROM obligations ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at, id`,
      values
    );
    return result.rows.map(mapObligation);
  }

  async getRepayment(repaymentId) {
    return this.#getOne("repaymentId", repaymentId, "SELECT * FROM repayment_events WHERE id = $1", mapRepayment);
  }

  async getCreditLine(creditLineId) {
    return this.#getOne("creditLineId", creditLineId, "SELECT * FROM credit_lines WHERE id = $1", mapCreditLine);
  }

  async getRiskDecision(riskDecisionId) {
    return this.#getOne("riskDecisionId", riskDecisionId, "SELECT * FROM risk_decisions WHERE id = $1", mapRiskDecision);
  }

  async getAdminAction(adminActionId) {
    return this.#getOne("adminActionId", adminActionId, "SELECT * FROM admin_actions WHERE id = $1", mapAdminAction);
  }

  async getApprovalProposal(approvalProposalId) {
    return this.#getOne(
      "approvalProposalId",
      approvalProposalId,
      "SELECT * FROM approval_proposals WHERE id = $1",
      mapApprovalProposal
    );
  }

  async listApprovalDecisions(approvalProposalId) {
    assertString("approvalProposalId", approvalProposalId);
    const result = await this.#tenantQuery(
      "SELECT * FROM approval_decisions WHERE proposal_id = $1 ORDER BY created_at, id",
      [approvalProposalId]
    );
    return result.rows.map(mapApprovalDecision);
  }

  async getApprovalDecision(approvalDecisionId) {
    return this.#getOne(
      "approvalDecisionId",
      approvalDecisionId,
      "SELECT * FROM approval_decisions WHERE id = $1",
      mapApprovalDecision
    );
  }

  async getApprovalExecution(approvalExecutionId) {
    return this.#getOne(
      "approvalExecutionId",
      approvalExecutionId,
      "SELECT * FROM approval_executions WHERE id = $1",
      mapApprovalExecution
    );
  }

  async getApprovalExecutionByProposal(approvalProposalId) {
    return this.#getOne(
      "approvalProposalId",
      approvalProposalId,
      "SELECT * FROM approval_executions WHERE proposal_id = $1",
      mapApprovalExecution
    );
  }

  async getBreakGlassIncident(breakGlassIncidentId) {
    return this.#getOne(
      "breakGlassIncidentId",
      breakGlassIncidentId,
      "SELECT * FROM break_glass_incidents WHERE id = $1",
      mapBreakGlassIncident
    );
  }

  async listBreakGlassCustodianDecisions(breakGlassIncidentId) {
    assertString("breakGlassIncidentId", breakGlassIncidentId);
    const result = await this.#tenantQuery(
      "SELECT * FROM break_glass_custodian_decisions WHERE incident_id = $1 ORDER BY created_at, id",
      [breakGlassIncidentId]
    );
    return result.rows.map(mapBreakGlassCustodianDecision);
  }

  async getBreakGlassCustodianDecision(breakGlassCustodianDecisionId) {
    return this.#getOne(
      "breakGlassCustodianDecisionId",
      breakGlassCustodianDecisionId,
      "SELECT * FROM break_glass_custodian_decisions WHERE id = $1",
      mapBreakGlassCustodianDecision
    );
  }

  async getBreakGlassReviewById(breakGlassReviewId) {
    return this.#getOne(
      "breakGlassReviewId",
      breakGlassReviewId,
      "SELECT * FROM break_glass_reviews WHERE id = $1",
      mapBreakGlassReview
    );
  }

  async getBreakGlassReview(breakGlassIncidentId) {
    return this.#getOne(
      "breakGlassIncidentId",
      breakGlassIncidentId,
      "SELECT * FROM break_glass_reviews WHERE incident_id = $1",
      mapBreakGlassReview
    );
  }

  async getProjectionRegistration(entityType, entityId) {
    assertString("entityType", entityType);
    assertString("entityId", entityId);
    const result = await this.#tenantQuery(
      `SELECT entity_type, entity_id, entity_hash, root_aggregate_type,
              root_aggregate_id, aggregate_version, last_event_id, updated_at
         FROM projection_registry
        WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId]
    );
    if (result.rowCount === 0) return undefined;
    const row = result.rows[0];
    return {
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityHash: row.entity_hash,
      rootAggregateType: row.root_aggregate_type,
      rootAggregateId: row.root_aggregate_id,
      aggregateVersion: Number(row.aggregate_version),
      lastEventId: row.last_event_id,
      updatedAt: timestamp(row.updated_at)
    };
  }

  async getLatestProjectionSnapshot(entityType, entityId) {
    assertString("entityType", entityType);
    assertString("entityId", entityId);
    const result = await this.#tenantQuery(
      `SELECT id, write_sequence, entity_type, entity_id, entity_hash, root_aggregate_type,
              root_aggregate_id, aggregate_version, source_event_id, payload, recorded_at
         FROM projection_snapshots
        WHERE entity_type = $1 AND entity_id = $2
        ORDER BY write_sequence DESC
        LIMIT 1`,
      [entityType, entityId]
    );
    if (result.rowCount === 0) return undefined;
    const row = result.rows[0];
    return {
      projectionSnapshotId: row.id,
      writeSequence: Number(row.write_sequence),
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityHash: row.entity_hash,
      rootAggregateType: row.root_aggregate_type,
      rootAggregateId: row.root_aggregate_id,
      aggregateVersion: Number(row.aggregate_version),
      sourceEventId: row.source_event_id,
      payload: row.payload,
      recordedAt: timestamp(row.recorded_at)
    };
  }

  async getProjectionStateInTransaction(client, entityType, entityId, { lock = false } = {}) {
    assertQueryable(client);
    assertString("entityType", entityType);
    assertString("entityId", entityId);
    if (typeof lock !== "boolean") {
      throw new DomainError("invalid_core_projection", "lock must be a boolean");
    }
    const result = await client.query(
      `SELECT r.entity_hash AS registry_hash,
              r.root_aggregate_type AS registry_root_aggregate_type,
              r.root_aggregate_id AS registry_root_aggregate_id,
              r.aggregate_version AS registry_aggregate_version,
              s.entity_hash AS snapshot_hash,
              s.root_aggregate_type,
              s.root_aggregate_id,
              s.aggregate_version,
              s.payload
         FROM projection_registry r
         JOIN LATERAL (
           SELECT entity_hash, root_aggregate_type, root_aggregate_id, aggregate_version, payload
             FROM projection_snapshots
            WHERE tenant_id = r.tenant_id
              AND entity_type = r.entity_type
              AND entity_id = r.entity_id
            ORDER BY write_sequence DESC
            LIMIT 1
         ) s ON TRUE
        WHERE r.entity_type = $1 AND r.entity_id = $2
        ${lock ? "FOR UPDATE OF r" : ""}`,
      [entityType, entityId]
    );
    if (result.rowCount === 0) return undefined;
    return projectionStateFromRow(entityType, entityId, result.rows[0]);
  }

  async getProjectionInTransaction(client, entityType, entityId, options) {
    const state = await this.getProjectionStateInTransaction(client, entityType, entityId, options);
    return state?.value;
  }

  async listMandatesForSubjectInTransaction(client, subjectId, { limit = 50 } = {}) {
    assertQueryable(client);
    assertString("subjectId", subjectId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new DomainError("invalid_core_projection", "Mandate list limit must be between 1 and 50");
    }
    const result = await client.query(
      `SELECT m.id AS entity_id,
              m.subject_id AS normalized_subject_id,
              r.entity_hash AS registry_hash,
              r.root_aggregate_type AS registry_root_aggregate_type,
              r.root_aggregate_id AS registry_root_aggregate_id,
              r.aggregate_version AS registry_aggregate_version,
              s.entity_hash AS snapshot_hash,
              s.root_aggregate_type,
              s.root_aggregate_id,
              s.aggregate_version,
              s.payload
         FROM mandates m
         LEFT JOIN projection_registry r
           ON r.tenant_id = m.tenant_id
          AND r.entity_type = $1
          AND r.entity_id = m.id
         LEFT JOIN LATERAL (
           SELECT entity_hash, root_aggregate_type, root_aggregate_id, aggregate_version, payload
             FROM projection_snapshots
            WHERE tenant_id = m.tenant_id
              AND entity_type = $1
              AND entity_id = m.id
            ORDER BY write_sequence DESC
            LIMIT 1
         ) s ON TRUE
        WHERE m.subject_id = $2
        ORDER BY m.created_at DESC, m.id
        LIMIT $3`,
      [CoreProjectionType.MANDATE, subjectId, limit + 1]
    );
    const states = result.rows.map((row) => {
      const state = projectionStateFromRow(CoreProjectionType.MANDATE, row.entity_id, row);
      if (
        row.normalized_subject_id !== subjectId ||
        state.value.mandateId !== row.entity_id ||
        state.value.subjectId !== row.normalized_subject_id
      ) {
        throw new DomainError("projection_integrity_mismatch", "Mandate projection identity is invalid", {
          entityType: CoreProjectionType.MANDATE,
          entityId: row.entity_id
        });
      }
      return state.value;
    });
    return {
      items: states.slice(0, limit),
      hasMore: states.length > limit
    };
  }

  async verifyProjection(entityType, entityId) {
    const [registration, snapshot, projection] = await Promise.all([
      this.getProjectionRegistration(entityType, entityId),
      this.getLatestProjectionSnapshot(entityType, entityId),
      this.getCanonicalProjection(entityType, entityId)
    ]);
    const actualHash = projection ? createCoreProjectionHash(entityType, projection) : undefined;
    const expectedHash = snapshot?.entityHash ?? registration?.entityHash;
    const snapshotPayloadHash = snapshot?.payload
      ? createCoreProjectionHash(entityType, snapshot.payload)
      : undefined;
    return {
      entityType,
      entityId,
      exists: projection !== undefined,
      registered: registration !== undefined,
      snapshotted: snapshot !== undefined,
      expectedHash,
      actualHash,
      snapshotPayloadHash,
      matches:
        projection !== undefined &&
        registration !== undefined &&
        snapshot !== undefined &&
        expectedHash === actualHash &&
        snapshot.entityHash === snapshotPayloadHash &&
        registration.entityHash === snapshot.entityHash
    };
  }

  async repairProjection({
    entityType,
    entityId,
    approvedBy,
    reason,
    idempotencyKey,
    now = new Date()
  }) {
    if (!Object.hasOwn(ENTITY_ID_FIELDS, entityType)) {
      throw new DomainError("unsupported_projection_type", "projection type is not supported", { entityType });
    }
    assertString("entityId", entityId);
    assertString("approvedBy", approvedBy);
    assertString("reason", reason);
    assertString("idempotencyKey", idempotencyKey);
    if (approvedBy.length > 200 || reason.length > 500 || idempotencyKey.length > 300) {
      throw new DomainError("invalid_projection_repair", "projection repair fields exceed their bounds");
    }
    assertNoRawPiiReference({ reason }, "projectionRepair");
    const snapshot = await this.getLatestProjectionSnapshot(entityType, entityId);
    if (!snapshot) {
      throw new DomainError("projection_snapshot_not_found", "projection repair requires an immutable snapshot", {
        entityType,
        entityId
      });
    }
    const snapshotHash = createCoreProjectionHash(entityType, snapshot.payload);
    if (snapshotHash !== snapshot.entityHash) {
      throw new DomainError("projection_snapshot_hash_mismatch", "projection snapshot failed its integrity check", {
        entityType,
        entityId
      });
    }
    const expectedVersion = await this.eventRepository.getStreamVersion({
      aggregateType: snapshot.rootAggregateType,
      aggregateId: snapshot.rootAggregateId
    });
    const event = createCreditEvent({
      eventType: "projection_repaired",
      subjectId:
        snapshot.payload.subjectId ??
        (entityType === CoreProjectionType.SUBJECT ? snapshot.payload.subjectId : undefined),
      payload: {
        entityType,
        entityId,
        sourceSnapshotId: snapshot.projectionSnapshotId,
        sourceHash: snapshot.entityHash,
        reason,
        actorId: approvedBy,
        idempotencyKey
      },
      now
    });
    return this.commitCommand({
      aggregateType: snapshot.rootAggregateType,
      aggregateId: snapshot.rootAggregateId,
      idempotencyKey,
      commandHash: hashId("projection_repair_command", {
        entityType,
        entityId,
        sourceSnapshotId: snapshot.projectionSnapshotId,
        sourceHash: snapshot.entityHash,
        reason,
        approvedBy
      }),
      events: [
        {
          aggregateType: snapshot.rootAggregateType,
          aggregateId: snapshot.rootAggregateId,
          expectedVersion,
          event
        }
      ],
      writes: [{ type: entityType, value: snapshot.payload, eventId: event.eventId }],
      response: {
        repaired: true,
        entityType,
        entityId,
        sourceSnapshotId: snapshot.projectionSnapshotId,
        repairEventId: event.eventId
      }
    });
  }

  async getCanonicalProjection(entityType, entityId) {
    let value;
    switch (entityType) {
      case CoreProjectionType.PRINCIPAL:
        value = await this.getPrincipal(entityId);
        break;
      case CoreProjectionType.SUBJECT:
        value = await this.getSubject(entityId);
        break;
      case CoreProjectionType.ACCOUNT_BINDING:
        value = await this.getAccountBinding(entityId);
        break;
      case CoreProjectionType.MANDATE:
        value = await this.getMandate(entityId);
        break;
      case CoreProjectionType.MANDATE_RESERVATION:
        value = await this.getMandateReservation(entityId);
        break;
      case CoreProjectionType.MANDATE_RELEASE:
        value = await this.getMandateRelease(entityId);
        break;
      case CoreProjectionType.PROVIDER:
        value = await this.getProvider(entityId);
        break;
      case CoreProjectionType.SPEND_POLICY:
        value = await this.getSpendPolicy(entityId);
        break;
      case CoreProjectionType.SPEND_REQUEST:
        value = await this.getSpendRequest(entityId);
        break;
      case CoreProjectionType.LEDGER_ACCOUNT:
        value = await this.getLedgerAccount(entityId);
        break;
      case CoreProjectionType.LEDGER_TRANSACTION:
        value = await this.getLedgerTransaction(entityId);
        break;
      case CoreProjectionType.LOCKBOX:
        value = await this.getLockbox(entityId);
        break;
      case CoreProjectionType.OBLIGATION:
        value = await this.getObligation(entityId);
        break;
      case CoreProjectionType.REPAYMENT:
        value = await this.getRepayment(entityId);
        break;
      case CoreProjectionType.CREDIT_LINE:
        value = await this.getCreditLine(entityId);
        break;
      case CoreProjectionType.RISK_DECISION:
        value = await this.getRiskDecision(entityId);
        break;
      case CoreProjectionType.ADMIN_ACTION:
        value = await this.getAdminAction(entityId);
        break;
      case CoreProjectionType.APPROVAL_PROPOSAL:
        value = await this.getApprovalProposal(entityId);
        break;
      case CoreProjectionType.APPROVAL_DECISION:
        value = await this.getApprovalDecision(entityId);
        break;
      case CoreProjectionType.APPROVAL_EXECUTION:
        value = await this.getApprovalExecution(entityId);
        break;
      case CoreProjectionType.BREAK_GLASS_INCIDENT:
        value = await this.getBreakGlassIncident(entityId);
        break;
      case CoreProjectionType.BREAK_GLASS_CUSTODIAN_DECISION:
        value = await this.getBreakGlassCustodianDecision(entityId);
        break;
      case CoreProjectionType.BREAK_GLASS_REVIEW:
        value = await this.getBreakGlassReviewById(entityId);
        break;
      default:
        throw new DomainError("unsupported_projection_type", "projection type is not supported", { entityType });
    }
    return value ? canonicalCoreProjection(entityType, value) : undefined;
  }

  #normalizeWrite(write, index) {
    if (!write || typeof write !== "object" || !Object.hasOwn(ENTITY_ID_FIELDS, write.type)) {
      throw new DomainError("unsupported_projection_type", "write has an unsupported projection type", {
        index,
        type: write?.type
      });
    }
    const value = normalizeJson(write.value, `writes[${index}].value`);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new DomainError("invalid_core_projection", "projection value must be an object", { index });
    }
    const entityId = value[ENTITY_ID_FIELDS[write.type]];
    assertNoRawPiiReference(value, `writes[${index}].value`);
    if (Buffer.byteLength(json(value)) > MAX_PROJECTION_BYTES) {
      throw new DomainError("projection_too_large", "projection exceeds the repository limit", { index });
    }
    assertString(`writes[${index}].${ENTITY_ID_FIELDS[write.type]}`, entityId);
    if (write.eventId !== undefined) assertString(`writes[${index}].eventId`, write.eventId);
    return { type: write.type, value, entityId, eventId: write.eventId };
  }

  async #getOne(name, id, statement, mapper) {
    assertString(name, id);
    const result = await this.#tenantQuery(statement, [id]);
    return mapper(result.rows[0]);
  }

  async #lockAndCountPersistentResource(client, kind, statement) {
    assertQueryable(client);
    assertString("resourceKind", kind);
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtext('tenant_resource_capacity:' || $1),
         hashtext($2)
       )`,
      [this.eventRepository.tenantContext.tenantId, kind]
    );
    const result = await client.query(statement);
    return safeInteger(result.rows[0]?.count, `${kind}Count`);
  }

  async #tenantQuery(statement, values = []) {
    return this.eventRepository.withTenantRead((client) => client.query(statement, values));
  }

  async #applyWrite(client, write, occurredAt) {
    const value = write.value;
    switch (write.type) {
      case CoreProjectionType.PRINCIPAL:
        return this.#writePrincipal(client, value);
      case CoreProjectionType.SUBJECT:
        return this.#writeSubject(client, value);
      case CoreProjectionType.ACCOUNT_BINDING:
        return this.#writeAccountBinding(client, value);
      case CoreProjectionType.MANDATE:
        return this.#writeMandate(client, value);
      case CoreProjectionType.MANDATE_RESERVATION:
        return this.#writeMandateReservation(client, value);
      case CoreProjectionType.MANDATE_RELEASE:
        return this.#writeMandateRelease(client, value);
      case CoreProjectionType.PROVIDER:
        return this.#writeProvider(client, value);
      case CoreProjectionType.SPEND_POLICY:
        return this.#writeSpendPolicy(client, value, occurredAt);
      case CoreProjectionType.SPEND_REQUEST:
        return this.#writeSpendRequest(client, value);
      case CoreProjectionType.LEDGER_ACCOUNT:
        return this.#writeLedgerAccount(client, value);
      case CoreProjectionType.LEDGER_TRANSACTION:
        return this.#writeLedgerTransaction(client, value);
      case CoreProjectionType.LOCKBOX:
        return this.#writeLockbox(client, value, occurredAt);
      case CoreProjectionType.OBLIGATION:
        return this.#writeObligation(client, value);
      case CoreProjectionType.REPAYMENT:
        return this.#writeRepayment(client, value);
      case CoreProjectionType.CREDIT_LINE:
        return this.#writeCreditLine(client, value, occurredAt);
      case CoreProjectionType.RISK_DECISION:
        return this.#writeRiskDecision(client, value);
      case CoreProjectionType.ADMIN_ACTION:
        return this.#writeAdminAction(client, value);
      case CoreProjectionType.APPROVAL_PROPOSAL:
        return this.#writeApprovalProposal(client, value);
      case CoreProjectionType.APPROVAL_DECISION:
        return this.#writeApprovalDecision(client, value);
      case CoreProjectionType.APPROVAL_EXECUTION:
        return this.#writeApprovalExecution(client, value);
      case CoreProjectionType.BREAK_GLASS_INCIDENT:
        return this.#writeBreakGlassIncident(client, value);
      case CoreProjectionType.BREAK_GLASS_CUSTODIAN_DECISION:
        return this.#writeBreakGlassCustodianDecision(client, value);
      case CoreProjectionType.BREAK_GLASS_REVIEW:
        return this.#writeBreakGlassReview(client, value);
      default:
        throw new DomainError("unsupported_projection_type", "projection type is not implemented", { type: write.type });
    }
  }

  async #writePrincipal(client, value) {
    const result = await client.query(
      `INSERT INTO principals(
         id, principal_hash, principal_type, legal_entity_ref, jurisdiction,
         responsibility_scope, status, created_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
       WHERE principals.principal_hash = EXCLUDED.principal_hash
         AND principals.principal_type = EXCLUDED.principal_type
         AND principals.responsibility_scope = EXCLUDED.responsibility_scope
       RETURNING id`,
      [
        value.principalId,
        value.principalHash,
        value.principalType,
        value.legalEntityRef ?? null,
        value.jurisdiction ?? null,
        value.responsibilityScope,
        value.status,
        value.createdAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.PRINCIPAL, value.principalId);
  }

  async #writeSubject(client, value) {
    const result = await client.query(
      `INSERT INTO subjects(
         id, subject_hash, subject_type, status, display_name, metadata_ref,
         primary_principal_id, risk_tier, prototype_only, created_at, updated_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             risk_tier = EXCLUDED.risk_tier,
             updated_at = EXCLUDED.updated_at
       WHERE subjects.subject_hash = EXCLUDED.subject_hash
         AND subjects.subject_type = EXCLUDED.subject_type
         AND subjects.primary_principal_id = EXCLUDED.primary_principal_id
       RETURNING id`,
      [
        value.subjectId,
        value.subjectHash,
        value.subjectType,
        value.status,
        value.displayName,
        value.metadataRef ?? null,
        value.primaryPrincipalId,
        value.riskTier,
        value.prototypeOnly,
        value.createdAt,
        value.updatedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.SUBJECT, value.subjectId);
  }

  async #writeAccountBinding(client, value) {
    const result = await client.query(
      `INSERT INTO account_bindings(
         id, subject_id, account_hash, chain_id, account_ref, signature_hash,
         nonce, purpose, verification_method, status, bound_at, revoked_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status, revoked_at = EXCLUDED.revoked_at
       WHERE account_bindings.subject_id = EXCLUDED.subject_id
         AND account_bindings.account_hash = EXCLUDED.account_hash
         AND account_bindings.chain_id = EXCLUDED.chain_id
         AND account_bindings.account_ref = EXCLUDED.account_ref
         AND account_bindings.signature_hash = EXCLUDED.signature_hash
         AND account_bindings.nonce = EXCLUDED.nonce
         AND account_bindings.purpose = EXCLUDED.purpose
         AND account_bindings.verification_method = EXCLUDED.verification_method
       RETURNING id`,
      [
        value.accountBindingId,
        value.subjectId,
        value.accountHash,
        value.chainId,
        value.accountIdRef,
        value.signatureHash,
        value.nonce,
        value.purpose,
        value.verificationMethod ?? "verified_signature",
        value.status,
        value.boundAt,
        value.revokedAt ?? null,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.ACCOUNT_BINDING, value.accountBindingId);
  }

  async #writeMandate(client, value) {
    const result = await client.query(
      `INSERT INTO mandates(
         id, mandate_hash, principal_id, subject_id, capabilities,
         allowed_provider_ids, allowed_categories, asset_ids,
         per_action_limit_minor, aggregate_limit_minor, utilized_minor,
         valid_from, expires_at, nonce, terms_ref, status, created_at, updated_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19
       )
       ON CONFLICT (id) DO UPDATE
         SET utilized_minor = EXCLUDED.utilized_minor,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at
       WHERE mandates.mandate_hash = EXCLUDED.mandate_hash
         AND mandates.principal_id = EXCLUDED.principal_id
         AND mandates.subject_id = EXCLUDED.subject_id
       RETURNING id`,
      [
        value.mandateId,
        value.mandateHash,
        value.principalId,
        value.subjectId,
        json(value.capabilities),
        json(value.allowedProviderIds),
        json(value.allowedCategories),
        json(value.assetIds),
        value.perActionLimitMinor,
        value.aggregateLimitMinor,
        value.utilizedMinor,
        value.validFrom,
        value.expiresAt,
        value.nonce,
        value.termsRef,
        value.status,
        value.createdAt,
        value.updatedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.MANDATE, value.mandateId);
  }

  async #writeMandateReservation(client, value) {
    const result = await client.query(
      `INSERT INTO mandate_reservations(
         id, reservation_hash, mandate_id, subject_id, capability, provider_id,
         category, asset_id, amount_minor, released_minor, created_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET released_minor = EXCLUDED.released_minor
       WHERE mandate_reservations.reservation_hash = EXCLUDED.reservation_hash
         AND mandate_reservations.mandate_id = EXCLUDED.mandate_id
         AND mandate_reservations.subject_id = EXCLUDED.subject_id
       RETURNING id`,
      [
        value.reservationId,
        value.reservationHash,
        value.mandateId,
        value.subjectId,
        value.capability,
        value.providerId ?? null,
        value.category ?? null,
        value.assetId,
        value.amountMinor,
        value.releasedMinor,
        value.createdAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.MANDATE_RESERVATION, value.reservationId);
    }
  }

  async #writeMandateRelease(client, value) {
    const result = await client.query(
      `INSERT INTO mandate_releases(
         id, release_hash, mandate_id, reservation_id, amount_minor, reason, created_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.releaseId,
        value.releaseHash,
        value.mandateId,
        value.reservationId,
        value.amountMinor,
        value.reason,
        value.createdAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query("SELECT * FROM mandate_releases WHERE id = $1", [value.releaseId]);
    if (
      createCoreProjectionHash(CoreProjectionType.MANDATE_RELEASE, mapMandateRelease(existing.rows[0])) !==
      createCoreProjectionHash(CoreProjectionType.MANDATE_RELEASE, value)
    ) {
      throw projectionConflict(CoreProjectionType.MANDATE_RELEASE, value.releaseId);
    }
  }

  async #writeProvider(client, value) {
    const result = await client.query(
      `INSERT INTO providers(
         id, provider_hash, name, settlement_account_ref, status, risk_tier, created_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status, risk_tier = EXCLUDED.risk_tier
       WHERE providers.provider_hash = EXCLUDED.provider_hash
       RETURNING id`,
      [
        value.providerId,
        value.providerHash,
        value.name,
        value.settlementAccountIdRef,
        value.status,
        value.riskTier,
        value.createdAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.PROVIDER, value.providerId);
  }

  async #writeSpendPolicy(client, value, occurredAt) {
    const result = await client.query(
      `INSERT INTO spend_policies(
         id, policy_hash, subject_id, provider_id, asset_id, category,
         per_tx_limit_minor, daily_limit_minor, obligation_cap_minor,
         daily_spent_minor, daily_spent_date, status, created_at, updated_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE
         SET daily_spent_minor = EXCLUDED.daily_spent_minor,
             daily_spent_date = EXCLUDED.daily_spent_date,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at
       WHERE spend_policies.policy_hash = EXCLUDED.policy_hash
         AND spend_policies.subject_id = EXCLUDED.subject_id
         AND spend_policies.provider_id = EXCLUDED.provider_id
       RETURNING id`,
      [
        value.spendPolicyId,
        value.spendPolicyHash,
        value.subjectId,
        value.providerId,
        value.assetId,
        value.category,
        value.perTxLimitMinor,
        value.dailyLimitMinor,
        value.obligationCapMinor,
        value.dailySpentMinor,
        value.dailySpentDate,
        value.status,
        value.createdAt,
        value.updatedAt ?? occurredAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.SPEND_POLICY, value.spendPolicyId);
  }

  async #writeSpendRequest(client, value) {
    const result = await client.query(
      `INSERT INTO spend_requests(
         id, subject_id, mandate_id, provider_id, spend_policy_id, asset_id,
         amount_minor, purpose_code, status, rejection_reason, created_at, updated_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             rejection_reason = EXCLUDED.rejection_reason,
             updated_at = EXCLUDED.updated_at
       WHERE spend_requests.subject_id = EXCLUDED.subject_id
         AND spend_requests.mandate_id = EXCLUDED.mandate_id
         AND spend_requests.provider_id = EXCLUDED.provider_id
         AND spend_requests.spend_policy_id = EXCLUDED.spend_policy_id
         AND spend_requests.asset_id = EXCLUDED.asset_id
         AND spend_requests.amount_minor = EXCLUDED.amount_minor
         AND spend_requests.purpose_code = EXCLUDED.purpose_code
       RETURNING id`,
      [
        value.spendRequestId,
        value.subjectId,
        value.mandateId,
        value.providerId,
        value.spendPolicyId,
        value.assetId,
        value.amountMinor,
        value.purposeCode,
        value.status,
        value.rejectionReason ?? null,
        value.createdAt,
        value.updatedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.SPEND_REQUEST, value.spendRequestId);
  }

  async #writeLedgerAccount(client, value) {
    const result = await client.query(
      `INSERT INTO ledger_accounts(
         id, account_hash, owner_type, owner_id, asset_id, account_type,
         normal_side, status, opened_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
       WHERE ledger_accounts.account_hash = EXCLUDED.account_hash
         AND ledger_accounts.asset_id = EXCLUDED.asset_id
         AND ledger_accounts.normal_side = EXCLUDED.normal_side
       RETURNING id`,
      [
        value.ledgerAccountId,
        value.ledgerAccountHash,
        value.ownerType,
        value.ownerId,
        value.assetId,
        value.accountType,
        value.normalSide,
        value.status,
        value.openedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.LEDGER_ACCOUNT, value.ledgerAccountId);
  }

  async #writeLedgerTransaction(client, value) {
    if (!Array.isArray(value.entries) || value.entries.length !== value.entryCount) {
      throw new DomainError("invalid_ledger_projection", "ledger transaction entries must match entryCount", {
        ledgerTransactionId: value.ledgerTransactionId
      });
    }
    const inserted = await client.query(
      `INSERT INTO ledger_transactions(
         id, transaction_hash, idempotency_key, transaction_type, asset_id,
         reference_type, reference_id, metadata, metadata_hash,
         debit_total_minor, credit_total_minor, entry_count, posted_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        value.ledgerTransactionId,
        value.transactionHash,
        value.idempotencyKey,
        value.transactionType,
        value.assetId,
        value.referenceType,
        value.referenceId,
        json(value.metadata),
        value.metadataHash,
        value.debitTotalMinor,
        value.creditTotalMinor,
        value.entryCount,
        value.postedAt,
        value.schemaVersion
      ]
    );
    if (inserted.rowCount === 0) {
      const existing = await client.query(
        "SELECT id, transaction_hash FROM ledger_transactions WHERE idempotency_key = $1",
        [value.idempotencyKey]
      );
      if (
        existing.rowCount !== 1 ||
        existing.rows[0].id !== value.ledgerTransactionId ||
        existing.rows[0].transaction_hash !== value.transactionHash
      ) {
        throw projectionConflict(CoreProjectionType.LEDGER_TRANSACTION, value.ledgerTransactionId);
      }
      const entries = await client.query(
        `SELECT id, account_id, direction, amount_minor, sequence
           FROM ledger_entries
          WHERE transaction_id = $1
          ORDER BY sequence`,
        [value.ledgerTransactionId]
      );
      const expected = value.entries.map((entry) => ({
        id: entry.ledgerEntryId,
        account_id: entry.ledgerAccountId,
        direction: entry.direction,
        amount_minor: entry.amountMinor,
        sequence: entry.sequence
      }));
      if (json(entries.rows) !== json(expected)) {
        throw projectionConflict(CoreProjectionType.LEDGER_TRANSACTION, value.ledgerTransactionId);
      }
      return;
    }
    for (const entry of value.entries) {
      await client.query(
        `INSERT INTO ledger_entries(
           id, transaction_id, account_id, direction, amount_minor, sequence, posted_at, schema_version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entry.ledgerEntryId,
          value.ledgerTransactionId,
          entry.ledgerAccountId,
          entry.direction,
          entry.amountMinor,
          entry.sequence,
          entry.postedAt,
          entry.schemaVersion
        ]
      );
    }
  }

  async #writeLockbox(client, value, occurredAt) {
    const result = await client.query(
      `INSERT INTO lockboxes(
         id, lockbox_hash, subject_id, chain_id, asset_id, account_ref,
         ledger_account_id, revenue_ledger_account_id, repayment_ledger_account_id,
         status, created_at, updated_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
       WHERE lockboxes.lockbox_hash = EXCLUDED.lockbox_hash
         AND lockboxes.subject_id = EXCLUDED.subject_id
         AND lockboxes.chain_id = EXCLUDED.chain_id
         AND lockboxes.asset_id = EXCLUDED.asset_id
         AND lockboxes.account_ref = EXCLUDED.account_ref
         AND lockboxes.ledger_account_id = EXCLUDED.ledger_account_id
         AND lockboxes.revenue_ledger_account_id = EXCLUDED.revenue_ledger_account_id
         AND lockboxes.repayment_ledger_account_id = EXCLUDED.repayment_ledger_account_id
       RETURNING id`,
      [
        value.lockboxId,
        value.lockboxHash,
        value.subjectId,
        value.chainId,
        value.assetId,
        value.accountIdRef,
        value.ledgerAccountId,
        value.revenueLedgerAccountId,
        value.repaymentLedgerAccountId,
        value.status,
        value.createdAt,
        value.updatedAt ?? occurredAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.LOCKBOX, value.lockboxId);
  }

  async #writeObligation(client, value) {
    const result = await client.query(
      `INSERT INTO obligations(
         id, obligation_hash, subject_id, principal_id, mandate_id, asset_id,
         amount_minor, outstanding_minor, accrued_fees_minor, repaid_amount_minor,
         spend_policy_id, cashflow_route_id, status, repayment_priority,
         attestation_ids, chain_executions, due_at, created_at, updated_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
       )
       ON CONFLICT (id) DO UPDATE
         SET outstanding_minor = EXCLUDED.outstanding_minor,
             accrued_fees_minor = EXCLUDED.accrued_fees_minor,
             repaid_amount_minor = EXCLUDED.repaid_amount_minor,
             status = EXCLUDED.status,
             attestation_ids = EXCLUDED.attestation_ids,
             chain_executions = EXCLUDED.chain_executions,
             updated_at = EXCLUDED.updated_at
       WHERE obligations.obligation_hash = EXCLUDED.obligation_hash
         AND obligations.subject_id = EXCLUDED.subject_id
         AND obligations.asset_id = EXCLUDED.asset_id
       RETURNING id`,
      [
        value.obligationId,
        value.obligationHash,
        value.subjectId,
        value.principalId,
        value.mandateId,
        value.assetId,
        value.principalAmountMinor,
        value.outstandingPrincipalMinor,
        value.accruedFeesMinor,
        value.repaidAmountMinor,
        value.spendPolicyId,
        value.cashflowRouteId,
        value.status,
        value.repaymentPriority,
        json(value.attestationIds),
        json(value.chainExecutions),
        value.dueAt,
        value.createdAt,
        value.updatedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.OBLIGATION, value.obligationId);
  }

  async #writeRepayment(client, value) {
    const result = await client.query(
      `INSERT INTO repayment_events(
         id, obligation_id, subject_id, amount_minor, asset_id, remaining_minor, occurred_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.repaymentId,
        value.obligationId,
        value.subjectId,
        value.amountMinor,
        value.assetId,
        value.remainingMinor,
        value.occurredAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query("SELECT * FROM repayment_events WHERE id = $1", [value.repaymentId]);
    if (hashId("projection_compare", mapRepayment(existing.rows[0])) !== hashId("projection_compare", value)) {
      throw projectionConflict(CoreProjectionType.REPAYMENT, value.repaymentId);
    }
  }

  async #writeCreditLine(client, value, occurredAt) {
    const result = await client.query(
      `INSERT INTO credit_lines(
         id, subject_id, mandate_id, asset_id, limit_minor, utilized_minor,
         status, risk_snapshot_id, created_at, updated_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE
         SET mandate_id = EXCLUDED.mandate_id,
             limit_minor = EXCLUDED.limit_minor,
             utilized_minor = EXCLUDED.utilized_minor,
             status = EXCLUDED.status,
             risk_snapshot_id = EXCLUDED.risk_snapshot_id,
             updated_at = EXCLUDED.updated_at
       WHERE credit_lines.subject_id = EXCLUDED.subject_id
         AND credit_lines.asset_id = EXCLUDED.asset_id
       RETURNING id`,
      [
        value.creditLineId,
        value.subjectId,
        value.mandateId,
        value.assetId,
        value.limitMinor,
        value.utilizedMinor,
        value.status,
        value.riskSnapshotId ?? null,
        value.createdAt,
        value.updatedAt ?? occurredAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.CREDIT_LINE, value.creditLineId);
  }

  async #writeRiskDecision(client, value) {
    const result = await client.query(
      `INSERT INTO risk_decisions(
         id, subject_id, mandate_id, asset_id, status, model_version,
         limit_minor, utilization_minor, action, reasons, created_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.riskDecisionId,
        value.subjectId,
        value.mandateId,
        value.assetId,
        value.status,
        value.modelVersion,
        value.limitMinor,
        value.utilizationMinor,
        value.action,
        json(value.reasons),
        value.createdAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query("SELECT * FROM risk_decisions WHERE id = $1", [value.riskDecisionId]);
    if (hashId("projection_compare", mapRiskDecision(existing.rows[0])) !== hashId("projection_compare", value)) {
      throw projectionConflict(CoreProjectionType.RISK_DECISION, value.riskDecisionId);
    }
  }

  async #writeAdminAction(client, value) {
    const payload = value.payload ?? {};
    const payloadHash = value.payloadHash ?? hashId("admin_action_payload", payload);
    const result = await client.query(
      `INSERT INTO admin_actions(
         id, admin_id, action_type, target_type, target_id, reason,
         payload_hash, payload, created_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.adminActionId,
        value.adminId,
        value.actionType,
        value.targetType,
        value.targetId,
        value.reason,
        payloadHash,
        json(payload),
        value.createdAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query("SELECT * FROM admin_actions WHERE id = $1", [value.adminActionId]);
    const normalizedValue = { ...value, payloadHash, payload };
    if (hashId("projection_compare", mapAdminAction(existing.rows[0])) !== hashId("projection_compare", normalizedValue)) {
      throw projectionConflict(CoreProjectionType.ADMIN_ACTION, value.adminActionId);
    }
  }

  async #writeApprovalProposal(client, value) {
    const result = await client.query(
      `INSERT INTO approval_proposals(
         id, proposal_hash, operation_id, action, resource_type, resource_id,
         command_actor_id, command_actor_type, command_client_id, command_hash,
         idempotency_key_hash, resource_version, live_state_version, reason_code,
         policy_version, approval_policy_version, proposer_actor_id,
         proposer_client_id, proposer_membership_id, proposer_membership_version,
         required_approver_role_bundles, required_approval_count, status, version,
         expires_at, approved_at, rejected_at, canceled_at, expired_at,
         superseded_at, superseded_by_proposal_id, executed_at, execution_id,
         created_at, updated_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
         $31, $32, $33, $34, $35, $36
       )
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             version = EXCLUDED.version,
             approved_at = EXCLUDED.approved_at,
             rejected_at = EXCLUDED.rejected_at,
             canceled_at = EXCLUDED.canceled_at,
             expired_at = EXCLUDED.expired_at,
             superseded_at = EXCLUDED.superseded_at,
             superseded_by_proposal_id = EXCLUDED.superseded_by_proposal_id,
             executed_at = EXCLUDED.executed_at,
             execution_id = EXCLUDED.execution_id,
             updated_at = EXCLUDED.updated_at
       WHERE approval_proposals.proposal_hash = EXCLUDED.proposal_hash
         AND approval_proposals.version + 1 = EXCLUDED.version
       RETURNING id`,
      [
        value.approvalProposalId,
        value.proposalHash,
        value.operationId,
        value.action,
        value.resourceType,
        value.resourceId,
        value.commandActorId,
        value.commandActorType,
        value.commandClientId,
        value.commandHash,
        value.idempotencyKeyHash,
        value.resourceVersion,
        value.liveStateVersion,
        value.reasonCode,
        value.policyVersion,
        value.approvalPolicyVersion,
        value.proposerActorId,
        value.proposerClientId,
        value.proposerMembershipId,
        value.proposerMembershipVersion,
        json(value.requiredApproverRoleBundles),
        value.requiredApprovalCount,
        value.status,
        value.version,
        value.expiresAt,
        value.approvedAt ?? null,
        value.rejectedAt ?? null,
        value.canceledAt ?? null,
        value.expiredAt ?? null,
        value.supersededAt ?? null,
        value.supersededByProposalId ?? null,
        value.executedAt ?? null,
        value.executionId ?? null,
        value.createdAt,
        value.updatedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.APPROVAL_PROPOSAL, value.approvalProposalId);
    }
  }

  async #writeApprovalDecision(client, value) {
    const result = await client.query(
      `INSERT INTO approval_decisions(
         id, proposal_id, decision_hash, proposal_version, proposal_hash,
         command_hash, policy_version, decision, reason_code, approver_actor_id,
         approver_actor_type, approver_client_id, approver_credential_id,
         approver_credential_version, approver_membership_id,
         approver_membership_version, approver_role_bundle, auth_time,
         authentication_methods, token_jti_hash, version, created_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23
       )
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.approvalDecisionId,
        value.approvalProposalId,
        value.decisionHash,
        value.proposalVersion,
        value.proposalHash,
        value.commandHash,
        value.policyVersion,
        value.decision,
        value.reasonCode,
        value.approverActorId,
        value.approverActorType,
        value.approverClientId,
        value.approverCredentialId,
        value.approverCredentialVersion,
        value.approverMembershipId,
        value.approverMembershipVersion,
        value.approverRoleBundle,
        value.authTime,
        json(value.authenticationMethods),
        value.tokenJtiHash,
        value.version,
        value.createdAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query("SELECT * FROM approval_decisions WHERE id = $1", [
      value.approvalDecisionId
    ]);
    if (hashId("projection_compare", mapApprovalDecision(existing.rows[0])) !== hashId("projection_compare", value)) {
      throw projectionConflict(CoreProjectionType.APPROVAL_DECISION, value.approvalDecisionId);
    }
  }

  async #writeApprovalExecution(client, value) {
    const result = await client.query(
      `INSERT INTO approval_executions(
         id, proposal_id, execution_hash, proposal_version, proposal_hash,
         command_hash, authorization_decision_id, executed_by_actor_id,
         idempotency_key_hash, approval_decision_ids, business_event_ids,
         result_hash, version, executed_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15
       )
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.approvalExecutionId,
        value.approvalProposalId,
        value.executionHash,
        value.proposalVersion,
        value.proposalHash,
        value.commandHash,
        value.authorizationDecisionId,
        value.executedByActorId,
        value.idempotencyKeyHash,
        json(value.approvalDecisionIds),
        json(value.businessEventIds),
        value.resultHash,
        value.version,
        value.executedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query("SELECT * FROM approval_executions WHERE id = $1", [
      value.approvalExecutionId
    ]);
    if (hashId("projection_compare", mapApprovalExecution(existing.rows[0])) !== hashId("projection_compare", value)) {
      throw projectionConflict(CoreProjectionType.APPROVAL_EXECUTION, value.approvalExecutionId);
    }
  }

  async #writeBreakGlassIncident(client, value) {
    const result = await client.query(
      `INSERT INTO break_glass_incidents(
         id, incident_hash, reason_code, allowed_actions, resource_scopes,
         requested_by_actor_id, requested_by_client_id, custodian_actor_ids,
         review_owner_actor_id, deployment_approval_ref_hash,
         notification_target_ref_hash, maximum_session_ms, status,
         review_status, version, activation_deadline, activated_at, expires_at,
         expired_at, closed_at, canceled_at, review_due_at, declared_at,
         updated_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25
       )
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             review_status = EXCLUDED.review_status,
             version = EXCLUDED.version,
             activated_at = EXCLUDED.activated_at,
             expires_at = EXCLUDED.expires_at,
             expired_at = EXCLUDED.expired_at,
             closed_at = EXCLUDED.closed_at,
             canceled_at = EXCLUDED.canceled_at,
             review_due_at = EXCLUDED.review_due_at,
             updated_at = EXCLUDED.updated_at
       WHERE break_glass_incidents.incident_hash = EXCLUDED.incident_hash
         AND break_glass_incidents.version + 1 = EXCLUDED.version
       RETURNING id`,
      [
        value.breakGlassIncidentId,
        value.incidentHash,
        value.reasonCode,
        json(value.allowedActions),
        json(value.resourceScopes),
        value.requestedByActorId,
        value.requestedByClientId,
        json(value.custodianActorIds),
        value.reviewOwnerActorId,
        value.deploymentApprovalRefHash,
        value.notificationTargetRefHash,
        value.maximumSessionMs,
        value.status,
        value.reviewStatus,
        value.version,
        value.activationDeadline,
        value.activatedAt ?? null,
        value.expiresAt ?? null,
        value.expiredAt ?? null,
        value.closedAt ?? null,
        value.canceledAt ?? null,
        value.reviewDueAt ?? null,
        value.declaredAt,
        value.updatedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.BREAK_GLASS_INCIDENT, value.breakGlassIncidentId);
    }
  }

  async #writeBreakGlassCustodianDecision(client, value) {
    const result = await client.query(
      `INSERT INTO break_glass_custodian_decisions(
         id, incident_id, decision_hash, incident_version, incident_hash,
         custodian_actor_id, custodian_client_id, custodian_credential_id,
         custodian_credential_version, hardware_key_ref_hash, auth_time,
         authentication_methods, version, created_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15
       )
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.breakGlassCustodianDecisionId,
        value.breakGlassIncidentId,
        value.decisionHash,
        value.incidentVersion,
        value.incidentHash,
        value.custodianActorId,
        value.custodianClientId,
        value.custodianCredentialId,
        value.custodianCredentialVersion,
        value.hardwareKeyRefHash,
        value.authTime,
        json(value.authenticationMethods),
        value.version,
        value.createdAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query("SELECT * FROM break_glass_custodian_decisions WHERE id = $1", [
      value.breakGlassCustodianDecisionId
    ]);
    if (
      hashId("projection_compare", mapBreakGlassCustodianDecision(existing.rows[0])) !==
      hashId("projection_compare", value)
    ) {
      throw projectionConflict(
        CoreProjectionType.BREAK_GLASS_CUSTODIAN_DECISION,
        value.breakGlassCustodianDecisionId
      );
    }
  }

  async #writeBreakGlassReview(client, value) {
    const result = await client.query(
      `INSERT INTO break_glass_reviews(
         id, incident_id, review_hash, incident_hash, reviewer_actor_id,
         reviewer_client_id, findings_ref_hash, version, completed_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.breakGlassReviewId,
        value.breakGlassIncidentId,
        value.reviewHash,
        value.incidentHash,
        value.reviewerActorId,
        value.reviewerClientId,
        value.findingsRefHash,
        value.version,
        value.completedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query("SELECT * FROM break_glass_reviews WHERE id = $1", [
      value.breakGlassReviewId
    ]);
    if (hashId("projection_compare", mapBreakGlassReview(existing.rows[0])) !== hashId("projection_compare", value)) {
      throw projectionConflict(CoreProjectionType.BREAK_GLASS_REVIEW, value.breakGlassReviewId);
    }
  }
}
