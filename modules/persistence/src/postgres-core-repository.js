import {
  CreditLineStatus,
  DomainError,
  ObligationStatus,
  SubjectStatus,
  SubjectType,
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
  AGENT_ACCOUNT_CHALLENGE: "agent_account_challenge",
  AGENT_ACCOUNT_PROOF_ATTEMPT: "agent_account_proof_attempt",
  MANDATE: "mandate",
  MANDATE_RESERVATION: "mandate_reservation",
  MANDATE_RELEASE: "mandate_release",
  PROVIDER: "provider",
  PROVIDER_INTENT_DELIVERY: "provider_intent_delivery",
  PROVIDER_INTENT_ACKNOWLEDGEMENT: "provider_intent_acknowledgement",
  PROVIDER_CALLBACK_INBOX: "provider_callback_inbox",
  SPEND_POLICY: "spend_policy",
  SPEND_REQUEST: "spend_request",
  LEDGER_ACCOUNT: "ledger_account",
  LEDGER_TRANSACTION: "ledger_transaction",
  LOCKBOX: "lockbox",
  OBLIGATION: "obligation",
  SANDBOX_EXECUTION_RECEIPT: "sandbox_execution_receipt",
  SANDBOX_SERVICING_ACTION: "sandbox_servicing_action",
  REPAYMENT: "repayment",
  CONSENT_RECORD: "consent_record",
  HUMAN_IDENTITY_REFERENCE: "human_identity_reference",
  CREDIT_INTENT: "credit_intent",
  CREDIT_OFFER: "credit_offer",
  CREDIT_OFFER_ACCEPTANCE: "credit_offer_acceptance",
  CREDIT_LINE: "credit_line",
  RISK_DECISION: "risk_decision",
  ADMIN_ACTION: "admin_action",
  PILOT_FEEDBACK_RECORD: "pilot_feedback_record",
  ...ApprovalProjectionType
});

const ENTITY_ID_FIELDS = Object.freeze({
  [CoreProjectionType.PRINCIPAL]: "principalId",
  [CoreProjectionType.SUBJECT]: "subjectId",
  [CoreProjectionType.ACCOUNT_BINDING]: "accountBindingId",
  [CoreProjectionType.AGENT_ACCOUNT_CHALLENGE]: "challengeId",
  [CoreProjectionType.AGENT_ACCOUNT_PROOF_ATTEMPT]: "proofAttemptId",
  [CoreProjectionType.MANDATE]: "mandateId",
  [CoreProjectionType.MANDATE_RESERVATION]: "reservationId",
  [CoreProjectionType.MANDATE_RELEASE]: "releaseId",
  [CoreProjectionType.PROVIDER]: "providerId",
  [CoreProjectionType.PROVIDER_INTENT_DELIVERY]: "deliveryId",
  [CoreProjectionType.PROVIDER_INTENT_ACKNOWLEDGEMENT]: "acknowledgementId",
  [CoreProjectionType.PROVIDER_CALLBACK_INBOX]: "callbackId",
  [CoreProjectionType.SPEND_POLICY]: "spendPolicyId",
  [CoreProjectionType.SPEND_REQUEST]: "spendRequestId",
  [CoreProjectionType.LEDGER_ACCOUNT]: "ledgerAccountId",
  [CoreProjectionType.LEDGER_TRANSACTION]: "ledgerTransactionId",
  [CoreProjectionType.LOCKBOX]: "lockboxId",
  [CoreProjectionType.OBLIGATION]: "obligationId",
  [CoreProjectionType.SANDBOX_EXECUTION_RECEIPT]: "sandboxExecutionReceiptId",
  [CoreProjectionType.SANDBOX_SERVICING_ACTION]: "servicingActionId",
  [CoreProjectionType.REPAYMENT]: "repaymentId",
  [CoreProjectionType.CONSENT_RECORD]: "consentId",
  [CoreProjectionType.HUMAN_IDENTITY_REFERENCE]: "identityReferenceId",
  [CoreProjectionType.CREDIT_INTENT]: "creditIntentId",
  [CoreProjectionType.CREDIT_OFFER]: "creditOfferId",
  [CoreProjectionType.CREDIT_OFFER_ACCEPTANCE]: "creditOfferAcceptanceId",
  [CoreProjectionType.CREDIT_LINE]: "creditLineId",
  [CoreProjectionType.RISK_DECISION]: "riskDecisionId",
  [CoreProjectionType.ADMIN_ACTION]: "adminActionId",
  [CoreProjectionType.PILOT_FEEDBACK_RECORD]: "pilotFeedbackId",
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

function portfolioIntegrityError(message) {
  return new DomainError(
    "projection_integrity_mismatch",
    message
  );
}

function portfolioCount(value, name) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 16 ||
    !/^(0|[1-9][0-9]*)$/.test(value)
  ) {
    throw portfolioIntegrityError(`Tenant risk portfolio ${name} is invalid`);
  }
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw portfolioIntegrityError(`Tenant risk portfolio ${name} is invalid`);
  }
  return normalized;
}

function minorUnitsBigInt(value) {
  return BigInt(value);
}

function assertPortfolioAmountAtMost(value, maximum, name) {
  if (minorUnitsBigInt(value) > minorUnitsBigInt(maximum)) {
    throw portfolioIntegrityError(`Tenant risk portfolio ${name} is inconsistent`);
  }
}

function assertPortfolioAmountIdentity(total, parts, name) {
  if (
    parts.reduce((sum, value) => sum + minorUnitsBigInt(value), 0n) !==
    minorUnitsBigInt(total)
  ) {
    throw portfolioIntegrityError(`Tenant risk portfolio ${name} is inconsistent`);
  }
}

function portfolioMinorUnits(value, name) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 78 ||
    !/^(0|[1-9][0-9]*)$/.test(value)
  ) {
    throw portfolioIntegrityError(`Tenant risk portfolio ${name} is invalid`);
  }
  return value;
}

function portfolioAssetId(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9:._/%-]*$/.test(value)
  ) {
    throw portfolioIntegrityError("Tenant risk portfolio asset identity is invalid");
  }
  return value;
}

function assertPortfolioStateCoverage(totalCount, stateCounts, name) {
  if (
    stateCounts.reduce((sum, count) => sum + BigInt(count), 0n) !==
    BigInt(totalCount)
  ) {
    throw portfolioIntegrityError(`Tenant risk portfolio ${name} states are incomplete`);
  }
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
    Number(row.registry_aggregate_version) !== Number(row.aggregate_version) ||
    row.registry_last_event_id !== row.source_event_id ||
    row.registry_last_event_id !== row.evidence_event_id
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
    rootAggregateId: row.registry_root_aggregate_id,
    sourceEventId: row.registry_last_event_id,
    sourceEvidenceHash: row.source_evidence_hash,
    sourceFinality: row.source_finality
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
    challengeId: row.challenge_id ?? undefined,
    proofHash: row.proof_hash ?? undefined,
    protocolVersion: row.protocol_version ?? undefined,
    verificationMethod: row.verification_method,
    status: row.status,
    boundAt: timestamp(row.bound_at),
    revokedAt: row.revoked_at ? timestamp(row.revoked_at) : undefined,
    schemaVersion: row.schema_version
  };
}

function mapAgentAccountChallenge(row) {
  if (!row) return undefined;
  return {
    challengeId: row.id,
    subjectId: row.subject_id,
    subjectHash: row.subject_hash,
    tenantHash: row.tenant_hash,
    controllerActorHash: row.controller_actor_hash,
    agentActorHash: row.agent_actor_hash,
    chainId: row.chain_id,
    accountHash: row.account_hash,
    purpose: row.purpose,
    nonce: row.nonce,
    typedDataHash: row.typed_data_hash,
    status: row.status,
    issuedAt: timestamp(row.issued_at),
    expiresAt: timestamp(row.expires_at),
    consumedAt: row.consumed_at ? timestamp(row.consumed_at) : undefined,
    protocolVersion: row.protocol_version,
    schemaVersion: row.schema_version
  };
}

function mapAgentAccountProofAttempt(row) {
  if (!row) return undefined;
  return {
    proofAttemptId: row.id,
    challengeId: row.challenge_id,
    subjectId: row.subject_id,
    accountHash: row.account_hash,
    chainId: row.chain_id,
    proofHash: row.proof_hash,
    verificationMethod: row.verification_method,
    outcome: row.outcome,
    attemptedAt: timestamp(row.attempted_at),
    schemaVersion: row.schema_version
  };
}

function mapMandate(row) {
  if (!row) return undefined;
  const base = {
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
  if (row.schema_version !== "mandate.v3") return base;
  return {
    ...base,
    termsHash: row.terms_hash,
    sandboxOnly: row.sandbox_only,
    productionAuthority: row.production_authority,
    ...(row.activation_acknowledgement
      ? { activationAcknowledgement: row.activation_acknowledgement }
      : {})
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

function mapProviderIntentDelivery(row) {
  if (!row) return undefined;
  return {
    deliveryId: row.id,
    deliveryHash: row.delivery_hash,
    transferIntentId: row.transfer_intent_id,
    transferIntentHash: row.transfer_intent_hash,
    providerId: row.provider_id,
    providerActorId: row.provider_actor_id,
    purposeCode: row.purpose_code,
    sourceAssetId: row.source_asset_id,
    sourceAmountMinor: row.source_amount_minor,
    destinationAssetId: row.destination_asset_id,
    status: row.status,
    acknowledgementId: row.acknowledgement_id ?? undefined,
    acknowledgedAt: row.acknowledged_at === null ? undefined : timestamp(row.acknowledged_at),
    callbackId: row.callback_id ?? undefined,
    callbackPayloadHash: row.callback_payload_hash ?? undefined,
    callbackCompletedAt: row.callback_completed_at === null
      ? undefined
      : timestamp(row.callback_completed_at),
    aggregateVersion: safeInteger(row.aggregate_version, "providerDeliveryAggregateVersion"),
    issuedAt: timestamp(row.issued_at),
    expiresAt: timestamp(row.expires_at),
    sandboxOnly: row.sandbox_only,
    productionFundsMoved: row.production_funds_moved,
    withdrawable: row.withdrawable,
    schemaVersion: row.schema_version
  };
}

function mapProviderIntentAcknowledgement(row) {
  if (!row) return undefined;
  return {
    acknowledgementId: row.id,
    deliveryId: row.delivery_id,
    deliveryHash: row.delivery_hash,
    transferIntentId: row.transfer_intent_id,
    providerId: row.provider_id,
    acknowledgedAt: timestamp(row.acknowledged_at),
    sandboxOnly: row.sandbox_only,
    productionFundsMoved: row.production_funds_moved,
    withdrawable: row.withdrawable,
    schemaVersion: row.schema_version
  };
}

function mapProviderCallbackInbox(row) {
  if (!row) return undefined;
  return {
    callbackId: row.callback_id,
    transferIntentId: row.transfer_intent_id,
    providerId: row.provider_id,
    deliveryHash: row.delivery_hash,
    payloadHash: row.payload_hash,
    nonceHash: row.nonce_hash,
    keyId: row.key_id,
    outcome: row.outcome,
    reasonCode: row.reason_code,
    providerEventRefHash: row.provider_event_ref_hash,
    processedAt: timestamp(row.processed_at),
    sandboxOnly: row.sandbox_only,
    productionFundsMoved: row.production_funds_moved,
    withdrawable: row.withdrawable,
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

function mapObligationInstallment(row) {
  if (!row) return undefined;
  return {
    installmentId: row.id,
    obligationId: row.obligation_id,
    installmentNumber: row.installment_number,
    dueAt: timestamp(row.due_at),
    scheduledPrincipalMinor: row.scheduled_principal_minor,
    scheduledInterestMinor: row.scheduled_interest_minor,
    scheduledFeeMinor: row.scheduled_fee_minor,
    paidPrincipalMinor: row.paid_principal_minor,
    paidInterestMinor: row.paid_interest_minor,
    paidFeeMinor: row.paid_fee_minor,
    status: row.status,
    scheduleVersion: row.schedule_version,
    scheduleSequence: row.schedule_sequence,
    schemaVersion: row.schema_version
  };
}

function mapSandboxServicingAction(row) {
  if (!row) return undefined;
  return {
    servicingActionId: row.id,
    servicingActionHash: row.servicing_action_hash,
    obligationId: row.obligation_id,
    subjectId: row.subject_id,
    actionType: row.action_type,
    previousStatus: row.previous_status,
    nextStatus: row.next_status,
    previousClassification: row.previous_classification,
    nextClassification: row.next_classification,
    daysPastDue: row.days_past_due,
    oldestUnpaidInstallmentId: row.oldest_unpaid_installment_id,
    reasonCode: row.reason_code,
    source: row.source,
    actorHash: row.actor_hash,
    policyVersion: row.policy_version,
    scheduleSequenceBefore: row.schedule_sequence_before,
    scheduleSequenceAfter: row.schedule_sequence_after,
    scheduleHashBefore: row.schedule_hash_before,
    scheduleHashAfter: row.schedule_hash_after,
    balancesBefore: row.balances_before,
    balancesAfter: row.balances_after,
    ...(row.previous_schedule ? { previousSchedule: row.previous_schedule } : {}),
    ...(row.approval_proposal_id ? { approvalProposalId: row.approval_proposal_id } : {}),
    ...(row.approval_execution_id ? { approvalExecutionId: row.approval_execution_id } : {}),
    effectiveAt: timestamp(row.effective_at),
    sandboxOnly: row.sandbox_only,
    productionFundsMoved: row.production_funds_moved,
    schemaVersion: row.schema_version
  };
}

function mapObligation(row, installments = []) {
  if (!row) return undefined;
  if (row.schema_version === "obligation.v2") {
    const shared = {
      obligationId: row.id,
      obligationHash: row.obligation_hash,
      subjectId: row.subject_id,
      principalId: row.principal_id,
      creditIntentId: row.credit_intent_id,
      riskDecisionId: row.risk_decision_id,
      creditOfferId: row.credit_offer_id,
      creditOfferAcceptanceId: row.acceptance_id,
      authorityType: row.authority_type,
      authorityRef: row.authority_ref,
      ...(row.consent_id ? { consentId: row.consent_id } : {}),
      ...(row.mandate_id ? { mandateId: row.mandate_id } : {}),
      assetId: row.asset_id,
      originalPrincipalMinor: row.amount_minor,
      outstandingPrincipalMinor: row.outstanding_minor,
      annualRateBps: row.annual_rate_bps,
      originationFeeMinor: row.origination_fee_minor,
      accruedInterestMinor: row.accrued_interest_minor,
      outstandingInterestMinor: row.outstanding_interest_minor,
      accruedFeesMinor: row.accrued_fees_minor,
      outstandingFeesMinor: row.outstanding_fees_minor,
      totalRepaidMinor: row.total_repaid_minor,
      repaymentFrequency: row.repayment_frequency,
      installmentCount: row.installment_count,
      firstPaymentAt: timestamp(row.first_payment_at),
      maturityAt: timestamp(row.maturity_at),
      scheduleVersion: row.schedule_version,
      scheduleHash: row.schedule_hash,
      scheduleSequence: row.schedule_sequence,
      installments: installments.map(mapObligationInstallment),
      executionStatus: row.execution_status,
      sandboxOnly: row.sandbox_only,
      productionFundsMoved: row.production_funds_moved,
      status: row.status,
      servicingClassification: row.servicing_classification,
      daysPastDue: row.days_past_due,
      oldestUnpaidInstallmentId: row.oldest_unpaid_installment_id,
      servicingEffectiveAt: timestamp(row.servicing_effective_at),
      servicingReasonCode: row.servicing_reason_code,
      servicingPolicyVersion: row.servicing_policy_version,
      servicingOwnerCode: row.servicing_owner_code,
      ...(row.resolution_type ? {
        resolutionType: row.resolution_type,
        resolutionReasonCode: row.resolution_reason_code,
        resolutionAt: timestamp(row.resolution_at)
      } : {}),
      writtenOffPrincipalMinor: row.written_off_principal_minor,
      writtenOffInterestMinor: row.written_off_interest_minor,
      writtenOffFeesMinor: row.written_off_fees_minor,
      acceptedAt: timestamp(row.accepted_at),
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
      schemaVersion: row.schema_version
    };
    if (row.execution_status === "executed") {
      shared.sandboxExecutionReceiptId = row.sandbox_execution_receipt_id;
      shared.executedAt = timestamp(row.executed_at);
      shared.lastAccruedAt = timestamp(row.last_accrued_at);
      shared.interestAccrualRemainder = row.interest_accrual_remainder;
      shared.withdrawable = row.withdrawable;
    }
    return shared;
  }
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

function mapSandboxExecutionReceipt(row) {
  if (!row) return undefined;
  return {
    sandboxExecutionReceiptId: row.id,
    receiptHash: row.receipt_hash,
    obligationId: row.obligation_id,
    subjectId: row.subject_id,
    assetId: row.asset_id,
    amountMinor: row.amount_minor,
    adapterId: row.adapter_id,
    adapterVersion: row.adapter_version,
    adapterKeyId: row.adapter_key_id,
    adapterMessageHash: row.adapter_message_hash,
    adapterSignature: row.adapter_signature,
    adapterIssuedAt: timestamp(row.adapter_issued_at),
    executedAt: timestamp(row.executed_at),
    sandboxOnly: row.sandbox_only,
    productionFundsMoved: row.production_funds_moved,
    withdrawable: row.withdrawable,
    schemaVersion: row.schema_version
  };
}

function mapRepayment(row) {
  if (!row) return undefined;
  if (row.schema_version === "repayment.v2") {
    return {
      repaymentId: row.id,
      repaymentHash: row.repayment_hash,
      obligationId: row.obligation_id,
      subjectId: row.subject_id,
      assetId: row.asset_id,
      requestedMinor: row.requested_minor,
      appliedMinor: row.applied_minor,
      appliedFeeMinor: row.applied_fee_minor,
      appliedInterestMinor: row.applied_interest_minor,
      appliedPrincipalMinor: row.applied_principal_minor,
      surplusMinor: row.surplus_minor,
      remainingPrincipalMinor: row.remaining_principal_minor,
      remainingInterestMinor: row.remaining_interest_minor,
      remainingFeesMinor: row.remaining_fees_minor,
      sourceCode: row.source_code,
      actorHash: row.actor_hash,
      accruedInterestMinor: row.accrued_interest_minor,
      accrualDays: row.accrual_days,
      ledgerTransactionId: row.ledger_transaction_id,
      ...(row.interest_ledger_transaction_id
        ? { interestLedgerTransactionId: row.interest_ledger_transaction_id }
        : {}),
      occurredAt: timestamp(row.occurred_at),
      sandboxOnly: row.sandbox_only,
      productionFundsMoved: row.production_funds_moved,
      schemaVersion: row.schema_version
    };
  }
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

function mapConsentRecord(row) {
  if (!row) return undefined;
  return {
    consentId: row.id,
    consentHash: row.consent_hash,
    termsHash: row.terms_hash,
    dataUsageHash: row.data_usage_hash,
    subjectId: row.subject_id,
    principalId: row.principal_id,
    purposes: row.purposes,
    allowedAssetIds: row.allowed_asset_ids,
    allowedCreditPurposeCodes: row.allowed_credit_purpose_codes,
    allowedRepaymentFrequencies: row.allowed_repayment_frequencies,
    maxRequestedPrincipalMinor: row.max_requested_principal_minor,
    maxRequestedTermDays: row.max_requested_term_days,
    maxInstallmentCount: row.max_installment_count,
    termsRef: row.terms_ref,
    termsVersion: row.terms_version,
    dataUsageRef: row.data_usage_ref,
    dataUsageVersion: row.data_usage_version,
    disclosureRef: row.disclosure_ref,
    validFrom: timestamp(row.valid_from),
    expiresAt: timestamp(row.expires_at),
    sandboxOnly: row.sandbox_only,
    productionAuthority: row.production_authority,
    status: row.status,
    ...(row.revoked_at ? { revokedAt: timestamp(row.revoked_at) } : {}),
    ...(row.revocation_reason_code ? { revocationReasonCode: row.revocation_reason_code } : {}),
    ...(row.revocation_evidence_ref ? { revocationEvidenceRef: row.revocation_evidence_ref } : {}),
    ...(row.expired_at ? { expiredAt: timestamp(row.expired_at) } : {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapHumanIdentityReference(row) {
  if (!row) return undefined;
  return {
    identityReferenceId: row.id,
    identityReferenceHash: row.identity_reference_hash,
    referenceEvidenceHash: row.reference_evidence_hash,
    subjectId: row.subject_id,
    principalId: row.principal_id,
    consentId: row.consent_id,
    consentHash: row.consent_hash,
    referenceType: row.reference_type,
    providerRef: row.provider_ref,
    providerVersion: row.provider_version,
    referenceRef: row.reference_ref,
    assuranceLevel: row.assurance_level,
    purposeCodes: row.purpose_codes,
    validFrom: timestamp(row.valid_from),
    expiresAt: timestamp(row.expires_at),
    syntheticOnly: row.synthetic_only,
    productionVerified: row.production_verified,
    status: row.status,
    ...(row.revoked_at ? { revokedAt: timestamp(row.revoked_at) } : {}),
    ...(row.revocation_reason_code ? { revocationReasonCode: row.revocation_reason_code } : {}),
    ...(row.revocation_evidence_ref ? { revocationEvidenceRef: row.revocation_evidence_ref } : {}),
    ...(row.expired_at ? { expiredAt: timestamp(row.expired_at) } : {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapCreditIntent(row) {
  if (!row) return undefined;
  return {
    creditIntentId: row.id,
    creditIntentHash: row.intent_hash,
    subjectId: row.subject_id,
    principalId: row.principal_id,
    authorityType: row.authority_type,
    authorityRef: row.authority_ref,
    assetId: row.asset_id,
    requestedPrincipalMinor: row.requested_principal_minor,
    purposeCode: row.purpose_code,
    requestedTermDays: row.requested_term_days,
    repaymentFrequency: row.repayment_frequency,
    installmentCount: row.installment_count,
    sandboxOnly: row.sandbox_only,
    productionFundsRequested: row.production_funds_requested,
    status: row.status,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapCreditOffer(row) {
  if (!row) return undefined;
  return {
    creditOfferId: row.id,
    creditOfferHash: row.offer_hash,
    termsHash: row.terms_hash,
    creditIntentId: row.credit_intent_id,
    subjectId: row.subject_id,
    riskDecisionId: row.risk_decision_id,
    assetId: row.asset_id,
    approvedPrincipalMinor: row.approved_principal_minor,
    annualRateBps: row.annual_rate_bps,
    originationFeeMinor: row.origination_fee_minor,
    repaymentFrequency: row.repayment_frequency,
    installmentCount: row.installment_count,
    firstPaymentAt: timestamp(row.first_payment_at),
    maturityAt: timestamp(row.maturity_at),
    disclosureRef: row.disclosure_ref,
    termsVersion: row.terms_version,
    validUntil: timestamp(row.valid_until),
    reasonCodes: row.reason_codes,
    sandboxOnly: row.sandbox_only,
    productionFundsApproved: row.production_funds_approved,
    status: row.status,
    ...(row.acceptance_id ? { acceptanceId: row.acceptance_id } : {}),
    ...(row.accepted_at ? { acceptedAt: timestamp(row.accepted_at) } : {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapCreditOfferAcceptance(row) {
  if (!row) return undefined;
  return {
    creditOfferAcceptanceId: row.id,
    acceptanceHash: row.acceptance_hash,
    creditOfferId: row.credit_offer_id,
    creditOfferHash: row.credit_offer_hash,
    termsHash: row.terms_hash,
    creditIntentId: row.credit_intent_id,
    riskDecisionId: row.risk_decision_id,
    subjectId: row.subject_id,
    principalId: row.principal_id,
    authorityType: row.authority_type,
    authorityRef: row.authority_ref,
    ...(row.consent_id ? { consentId: row.consent_id } : {}),
    ...(row.mandate_id ? { mandateId: row.mandate_id } : {}),
    acknowledgementHash: row.acknowledgement_hash,
    acceptedByActorHash: row.accepted_by_actor_hash,
    acceptedAt: timestamp(row.accepted_at),
    sandboxOnly: row.sandbox_only,
    productionAuthority: row.production_authority,
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
  const base = {
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
  if (!["risk_decision.v2", "risk_decision.v3"].includes(row.schema_version)) return base;
  delete base.mandateId;
  const applicationDecision = {
    riskDecisionId: row.id,
    decisionHash: row.decision_hash,
    creditIntentId: row.credit_intent_id,
    subjectId: row.subject_id,
    principalId: row.principal_id,
    authorityType: row.authority_type,
    authorityRef: row.authority_ref,
    ...(row.consent_id ? { consentId: row.consent_id } : {}),
    ...(row.mandate_id ? { mandateId: row.mandate_id } : {}),
    assetId: row.asset_id,
    status: row.status,
    modelVersion: row.model_version,
    limitMinor: row.limit_minor,
    utilizationMinor: row.utilization_minor,
    action: row.action,
    reasons: row.reasons,
    sandboxOnly: row.sandbox_only,
    productionAuthority: row.production_authority,
    createdAt: timestamp(row.created_at),
    schemaVersion: row.schema_version
  };
  if (row.schema_version !== "risk_decision.v3") return applicationDecision;
  return {
    ...applicationDecision,
    policyHash: row.policy_hash,
    riskFeatureSnapshotId: row.risk_feature_snapshot_id,
    featureSnapshotHash: row.feature_snapshot_hash,
    riskFeatureSnapshot: row.risk_feature_snapshot,
    decisionPassport: row.decision_passport
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

function mapPilotFeedbackRecord(row) {
  if (!row) return undefined;
  return {
    pilotFeedbackId: row.id,
    feedbackHash: row.feedback_hash,
    subjectId: row.subject_id,
    entryMode: row.entry_mode,
    surface: row.surface,
    lifecycleStage: row.lifecycle_stage,
    sentiment: row.sentiment,
    outcome: row.outcome,
    blockerCode: row.blocker_code,
    recordedAt: timestamp(row.recorded_at),
    sandboxOnly: row.sandbox_only,
    productionAuthority: row.production_authority,
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
                source.aggregateType,
                source.aggregateId,
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
                source.aggregateType,
                source.aggregateId,
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
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('principal_hash:' || $1), hashtext($2))",
      [this.eventRepository.tenantContext.tenantId, principalHash]
    );
    const result = await client.query(
      "SELECT * FROM principals WHERE principal_hash = $1 FOR UPDATE",
      [principalHash]
    );
    return mapPrincipal(result.rows[0]);
  }

  async findHumanSubjectByPrincipalInTransaction(client, principalId) {
    assertQueryable(client);
    assertString("principalId", principalId);
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('human_subject_principal:' || $1), hashtext($2))",
      [this.eventRepository.tenantContext.tenantId, principalId]
    );
    const result = await client.query(
      `SELECT * FROM subjects
        WHERE primary_principal_id = $1 AND subject_type = $2
        ORDER BY created_at, id
        LIMIT 2
        FOR UPDATE`,
      [principalId, SubjectType.HUMAN]
    );
    if (result.rowCount > 1) {
      throw new DomainError(
        "projection_integrity_mismatch",
        "Human Principal is bound to more than one Human Subject"
      );
    }
    return mapSubject(result.rows[0]);
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

  async countCreditIntentsForCapacityInTransaction(client) {
    return this.#lockAndCountPersistentResource(
      client,
      "credit_intents",
      "SELECT count(*)::bigint AS count FROM credit_intents"
    );
  }

  async countCreditDecisionsForCapacityInTransaction(client) {
    return this.#lockAndCountPersistentResource(
      client,
      "credit_decisions",
      "SELECT count(*)::bigint AS count FROM risk_decisions WHERE credit_intent_id IS NOT NULL"
    );
  }

  async countOpenObligationsForCapacityInTransaction(client) {
    return this.#lockAndCountPersistentResource(
      client,
      "open_obligations",
      "SELECT count(*)::bigint AS count FROM obligations WHERE status NOT IN ('fully_repaid', 'closed')"
    );
  }

  async countPilotFeedbackRecordsForCapacityInTransaction(client) {
    return this.#lockAndCountPersistentResource(
      client,
      "pilot_feedback_records",
      "SELECT count(*)::bigint AS count FROM pilot_feedback_records"
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

  async findConsentRecordByHashInTransaction(client, consentHash) {
    assertQueryable(client);
    assertString("consentHash", consentHash);
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('consent_hash:' || $1), hashtext($2))",
      [this.eventRepository.tenantContext.tenantId, consentHash]
    );
    const result = await client.query(
      "SELECT * FROM consent_records WHERE consent_hash = $1 FOR UPDATE",
      [consentHash]
    );
    return mapConsentRecord(result.rows[0]);
  }

  async findCreditIntentByHashInTransaction(client, creditIntentHash) {
    assertQueryable(client);
    assertString("creditIntentHash", creditIntentHash);
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('credit_intent_hash:' || $1), hashtext($2))",
      [this.eventRepository.tenantContext.tenantId, creditIntentHash]
    );
    const result = await client.query(
      "SELECT * FROM credit_intents WHERE intent_hash = $1 FOR UPDATE",
      [creditIntentHash]
    );
    return mapCreditIntent(result.rows[0]);
  }

  async findRiskDecisionByCreditIntentInTransaction(client, creditIntentId, { lock = true } = {}) {
    assertQueryable(client);
    assertString("creditIntentId", creditIntentId);
    if (lock) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('credit_decision_intent:' || $1), hashtext($2))",
        [this.eventRepository.tenantContext.tenantId, creditIntentId]
      );
    }
    const result = await client.query(
      `SELECT * FROM risk_decisions
        WHERE credit_intent_id = $1
        ${lock ? "FOR UPDATE" : ""}`,
      [creditIntentId]
    );
    return mapRiskDecision(result.rows[0]);
  }

  async findCreditOfferByIntentInTransaction(client, creditIntentId, { lock = true } = {}) {
    assertQueryable(client);
    assertString("creditIntentId", creditIntentId);
    const result = await client.query(
      `SELECT * FROM credit_offers
        WHERE credit_intent_id = $1
        ORDER BY created_at, id
        LIMIT 2
        ${lock ? "FOR UPDATE" : ""}`,
      [creditIntentId]
    );
    if (result.rowCount > 1) {
      throw new DomainError("projection_integrity_mismatch", "Credit Intent has more than one Offer");
    }
    return mapCreditOffer(result.rows[0]);
  }

  async findCreditOfferAcceptanceByOfferInTransaction(client, creditOfferId, { lock = true } = {}) {
    assertQueryable(client);
    assertString("creditOfferId", creditOfferId);
    const result = await client.query(
      `SELECT * FROM credit_offer_acceptances
        WHERE credit_offer_id = $1
        ${lock ? "FOR UPDATE" : ""}`,
      [creditOfferId]
    );
    return mapCreditOfferAcceptance(result.rows[0]);
  }

  async findObligationByCreditOfferInTransaction(client, creditOfferId, { lock = true } = {}) {
    assertQueryable(client);
    assertString("creditOfferId", creditOfferId);
    const result = await client.query(
      `SELECT * FROM obligations
        WHERE credit_offer_id = $1
        ${lock ? "FOR UPDATE" : ""}`,
      [creditOfferId]
    );
    return mapObligation(result.rows[0]);
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

  async getAgentAccountChallenge(challengeId) {
    return this.#getOne(
      "challengeId",
      challengeId,
      "SELECT * FROM agent_account_challenges WHERE id = $1",
      mapAgentAccountChallenge
    );
  }

  async getAgentAccountProofAttempt(proofAttemptId) {
    return this.#getOne(
      "proofAttemptId",
      proofAttemptId,
      "SELECT * FROM agent_account_proof_attempts WHERE id = $1",
      mapAgentAccountProofAttempt
    );
  }

  async getAgentAccountChallengeInTransaction(client, challengeId, { lock = true } = {}) {
    assertQueryable(client);
    assertString("challengeId", challengeId);
    const result = await client.query(
      `SELECT * FROM agent_account_challenges WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
      [challengeId]
    );
    return mapAgentAccountChallenge(result.rows[0]);
  }

  async findPendingAgentAccountChallengeForSubjectInTransaction(client, subjectId, { lock = true } = {}) {
    assertQueryable(client);
    assertString("subjectId", subjectId);
    const result = await client.query(
      `SELECT * FROM agent_account_challenges
        WHERE subject_id = $1 AND status = 'pending'
        ORDER BY issued_at DESC, id
        LIMIT 2
        ${lock ? "FOR UPDATE" : ""}`,
      [subjectId]
    );
    if (result.rowCount > 1) {
      throw new DomainError("projection_integrity_mismatch", "Agent Subject has more than one pending account challenge");
    }
    return mapAgentAccountChallenge(result.rows[0]);
  }

  async findAccountBindingByHashInTransaction(client, accountHash, { lock = true } = {}) {
    assertQueryable(client);
    assertString("accountHash", accountHash);
    const result = await client.query(
      `SELECT * FROM account_bindings WHERE account_hash = $1 ${lock ? "FOR UPDATE" : ""}`,
      [accountHash]
    );
    return mapAccountBinding(result.rows[0]);
  }

  async findActiveAccountBindingForSubjectInTransaction(client, subjectId, { lock = false } = {}) {
    assertQueryable(client);
    assertString("subjectId", subjectId);
    const result = await client.query(
      `SELECT * FROM account_bindings
        WHERE subject_id = $1 AND status = 'active'
        ORDER BY bound_at, id
        LIMIT 2
        ${lock ? "FOR SHARE" : ""}`,
      [subjectId]
    );
    if (result.rowCount > 1) {
      throw new DomainError("projection_integrity_mismatch", "Agent Subject has more than one active AccountBinding");
    }
    return mapAccountBinding(result.rows[0]);
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

  async getProviderIntentDelivery(deliveryId) {
    return this.#getOne(
      "deliveryId",
      deliveryId,
      "SELECT * FROM provider_intent_deliveries WHERE id = $1",
      mapProviderIntentDelivery
    );
  }

  async getProviderIntentAcknowledgement(acknowledgementId) {
    return this.#getOne(
      "acknowledgementId",
      acknowledgementId,
      "SELECT * FROM provider_intent_acknowledgements WHERE id = $1",
      mapProviderIntentAcknowledgement
    );
  }

  async getProviderCallbackInbox(callbackId) {
    return this.#getOne(
      "callbackId",
      callbackId,
      "SELECT * FROM provider_callback_inbox WHERE callback_id = $1",
      mapProviderCallbackInbox
    );
  }

  async getProviderIntentDeliveryByIntentInTransaction(client, transferIntentId, { lock = false } = {}) {
    assertQueryable(client);
    assertString("transferIntentId", transferIntentId);
    const result = await client.query(
      `SELECT * FROM provider_intent_deliveries
        WHERE transfer_intent_id = $1
        ${lock ? "FOR UPDATE" : ""}`,
      [transferIntentId]
    );
    return mapProviderIntentDelivery(result.rows[0]);
  }

  async getProviderCallbackInboxByIdInTransaction(client, callbackId, { lock = false } = {}) {
    assertQueryable(client);
    assertString("callbackId", callbackId);
    const result = await client.query(
      `SELECT * FROM provider_callback_inbox
        WHERE callback_id = $1
        ${lock ? "FOR UPDATE" : ""}`,
      [callbackId]
    );
    return mapProviderCallbackInbox(result.rows[0]);
  }

  async findProviderCallbackInboxByNonceInTransaction(client, nonceHash, { lock = false } = {}) {
    assertQueryable(client);
    assertString("nonceHash", nonceHash);
    const result = await client.query(
      `SELECT * FROM provider_callback_inbox
        WHERE nonce_hash = $1
        ${lock ? "FOR UPDATE" : ""}`,
      [nonceHash]
    );
    return mapProviderCallbackInbox(result.rows[0]);
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
    assertString("obligationId", obligationId);
    return this.eventRepository.withTenantRead(async (client) => {
      const [obligation, installments] = await Promise.all([
        client.query("SELECT * FROM obligations WHERE id = $1", [obligationId]),
        client.query(
          `SELECT i.* FROM obligation_installments i
             JOIN obligations o ON o.id = i.obligation_id
            WHERE i.obligation_id = $1
              AND (o.schema_version <> 'obligation.v2' OR i.schedule_sequence = o.schedule_sequence)
            ORDER BY i.installment_number`,
          [obligationId]
        )
      ]);
      return mapObligation(obligation.rows[0], installments.rows);
    });
  }

  async getObligationInTransaction(client, obligationId, { lock = true } = {}) {
    assertQueryable(client);
    assertString("obligationId", obligationId);
    const obligation = await client.query(
      `SELECT * FROM obligations WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
      [obligationId]
    );
    if (obligation.rowCount === 0) return undefined;
    const installments = await client.query(
      `SELECT * FROM obligation_installments
        WHERE obligation_id = $1 AND schedule_sequence = $2
        ORDER BY installment_number
        ${lock ? "FOR UPDATE" : ""}`,
      [obligationId, obligation.rows[0].schedule_sequence]
    );
    return mapObligation(obligation.rows[0], installments.rows);
  }

  async findLatestSandboxServicingActionInTransaction(client, obligationId) {
    assertQueryable(client);
    assertString("obligationId", obligationId);
    const result = await client.query(
      `SELECT * FROM sandbox_servicing_actions
        WHERE obligation_id = $1
        ORDER BY effective_at DESC, id DESC
        LIMIT 1`,
      [obligationId]
    );
    return mapSandboxServicingAction(result.rows[0]);
  }

  async getServicingOperationsQueueInTransaction(client, {
    classifications,
    limit = 26,
    afterPriorityRank,
    afterDaysPastDue,
    afterOldestDueAt,
    afterObligationId
  } = {}) {
    assertQueryable(client);
    const allowedClassifications = new Set([
      "defaulted",
      "dpd_61_89",
      "dpd_31_60",
      "dpd_1_30",
      "grace_period"
    ]);
    if (
      !Array.isArray(classifications) ||
      classifications.length < 1 ||
      classifications.length > allowedClassifications.size ||
      new Set(classifications).size !== classifications.length ||
      classifications.some((value) => !allowedClassifications.has(value)) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 51
    ) {
      throw new DomainError(
        "invalid_core_projection",
        "Servicing Operations queue query is invalid"
      );
    }
    const hasCursor = afterPriorityRank !== undefined;
    if (
      hasCursor !== (afterDaysPastDue !== undefined) ||
      hasCursor !== (afterOldestDueAt !== undefined) ||
      hasCursor !== (afterObligationId !== undefined) ||
      (hasCursor && (
        !Number.isSafeInteger(afterPriorityRank) ||
        afterPriorityRank < 1 ||
        afterPriorityRank > 5 ||
        !Number.isSafeInteger(afterDaysPastDue) ||
        afterDaysPastDue < 0 ||
        typeof afterOldestDueAt !== "string" ||
        !Number.isFinite(new Date(afterOldestDueAt).getTime()) ||
        new Date(afterOldestDueAt).toISOString() !== afterOldestDueAt ||
        typeof afterObligationId !== "string" ||
        afterObligationId.length < 1 ||
        afterObligationId.length > 256
      ))
    ) {
      throw new DomainError(
        "invalid_core_projection",
        "Servicing Operations queue cursor is invalid"
      );
    }

    const result = await client.query(
      `WITH adverse AS (
         SELECT o.id AS obligation_id,
                o.subject_id,
                o.asset_id,
                o.status,
                o.servicing_classification,
                o.days_past_due,
                CASE o.servicing_classification
                  WHEN 'defaulted' THEN 1
                  WHEN 'dpd_61_89' THEN 2
                  WHEN 'dpd_31_60' THEN 3
                  WHEN 'dpd_1_30' THEN 4
                  WHEN 'grace_period' THEN 5
                END AS priority_rank,
                o.outstanding_minor::text AS outstanding_principal_minor,
                o.outstanding_interest_minor::text AS outstanding_interest_minor,
                o.outstanding_fees_minor::text AS outstanding_fees_minor,
                past_due.principal_minor AS past_due_principal_minor,
                past_due.interest_minor AS past_due_interest_minor,
                past_due.fees_minor AS past_due_fees_minor,
                o.oldest_unpaid_installment_id,
                oldest.due_at AS oldest_due_at,
                o.servicing_effective_at,
                o.schedule_sequence,
                o.servicing_owner_code,
                latest.id AS latest_action_id,
                latest.action_type AS latest_action_type,
                latest.next_status AS latest_next_status,
                latest.next_classification AS latest_next_classification,
                latest.days_past_due AS latest_days_past_due,
                latest.reason_code AS latest_reason_code,
                latest.source AS latest_source,
                latest.effective_at AS latest_effective_at
           FROM obligations o
           JOIN obligation_installments oldest
             ON oldest.tenant_id = o.tenant_id
            AND oldest.obligation_id = o.id
            AND oldest.id = o.oldest_unpaid_installment_id
            AND oldest.schedule_sequence = o.schedule_sequence
           JOIN LATERAL (
             SELECT coalesce(sum(greatest(
                       i.scheduled_principal_minor - i.paid_principal_minor, 0
                     )), 0)::text AS principal_minor,
                    coalesce(sum(greatest(
                       i.scheduled_interest_minor - i.paid_interest_minor, 0
                     )), 0)::text AS interest_minor,
                    coalesce(sum(greatest(
                       i.scheduled_fee_minor - i.paid_fee_minor, 0
                     )), 0)::text AS fees_minor
               FROM obligation_installments i
              WHERE i.tenant_id = o.tenant_id
                AND i.obligation_id = o.id
                AND i.schedule_sequence = o.schedule_sequence
                AND i.due_at < o.servicing_effective_at
           ) past_due ON TRUE
           LEFT JOIN LATERAL (
             SELECT a.id, a.action_type, a.next_status, a.next_classification,
                    a.days_past_due, a.reason_code, a.source, a.effective_at
               FROM sandbox_servicing_actions a
              WHERE a.tenant_id = o.tenant_id
                AND a.obligation_id = o.id
              ORDER BY a.effective_at DESC, a.id DESC
              LIMIT 1
           ) latest ON TRUE
          WHERE o.schema_version = 'obligation.v2'
            AND o.status IN ('delinquent', 'defaulted')
            AND o.servicing_classification = ANY($1::text[])
            AND o.execution_status = 'executed'
            AND o.sandbox_only = TRUE
            AND o.production_funds_moved = FALSE
            AND o.withdrawable = FALSE
       )
       SELECT *
         FROM adverse
        WHERE $3::integer IS NULL
           OR priority_rank > $3
           OR (priority_rank = $3 AND days_past_due < $4)
           OR (priority_rank = $3 AND days_past_due = $4 AND oldest_due_at > $5::timestamptz)
           OR (
             priority_rank = $3 AND days_past_due = $4
             AND oldest_due_at = $5::timestamptz AND obligation_id > $6
           )
        ORDER BY priority_rank, days_past_due DESC, oldest_due_at, obligation_id
        LIMIT $2`,
      [
        classifications,
        limit,
        afterPriorityRank ?? null,
        afterDaysPastDue ?? null,
        afterOldestDueAt ?? null,
        afterObligationId ?? null
      ]
    );

    const expectedRank = new Map([
      ["defaulted", 1],
      ["dpd_61_89", 2],
      ["dpd_31_60", 3],
      ["dpd_1_30", 4],
      ["grace_period", 5]
    ]);
    const validDpd = {
      defaulted: (value) => value >= 90,
      dpd_61_89: (value) => value >= 61 && value <= 89,
      dpd_31_60: (value) => value >= 31 && value <= 60,
      dpd_1_30: (value) => value >= 4 && value <= 30,
      grace_period: (value) => value >= 1 && value <= 3
    };
    return result.rows.map((row) => {
      const daysPastDue = safeInteger(row.days_past_due, "Servicing queue DPD");
      const priorityRank = safeInteger(row.priority_rank, "Servicing queue priority");
      const outstandingPrincipalMinor = portfolioMinorUnits(
        row.outstanding_principal_minor,
        "Servicing queue outstanding principal"
      );
      const outstandingInterestMinor = portfolioMinorUnits(
        row.outstanding_interest_minor,
        "Servicing queue outstanding interest"
      );
      const outstandingFeesMinor = portfolioMinorUnits(
        row.outstanding_fees_minor,
        "Servicing queue outstanding fees"
      );
      const pastDuePrincipalMinor = portfolioMinorUnits(
        row.past_due_principal_minor,
        "Servicing queue past-due principal"
      );
      const pastDueInterestMinor = portfolioMinorUnits(
        row.past_due_interest_minor,
        "Servicing queue past-due interest"
      );
      const pastDueFeesMinor = portfolioMinorUnits(
        row.past_due_fees_minor,
        "Servicing queue past-due fees"
      );
      if (
        expectedRank.get(row.servicing_classification) !== priorityRank ||
        !validDpd[row.servicing_classification]?.(daysPastDue) ||
        (row.servicing_classification === "defaulted" && row.status !== "defaulted") ||
        (row.servicing_classification !== "defaulted" && row.status !== "delinquent") ||
        BigInt(pastDuePrincipalMinor) > BigInt(outstandingPrincipalMinor) ||
        BigInt(pastDueInterestMinor) > BigInt(outstandingInterestMinor) ||
        BigInt(pastDueFeesMinor) > BigInt(outstandingFeesMinor) ||
        typeof row.oldest_unpaid_installment_id !== "string" ||
        row.oldest_unpaid_installment_id.length === 0 ||
        typeof row.servicing_owner_code !== "string" ||
        !["sandbox_platform", "sandbox_originator"].includes(row.servicing_owner_code)
      ) {
        throw portfolioIntegrityError("Servicing Operations queue projection is inconsistent");
      }
      const latestServicingAction = row.latest_action_id ? {
        servicingActionId: row.latest_action_id,
        actionType: row.latest_action_type,
        nextStatus: row.latest_next_status,
        nextClassification: row.latest_next_classification,
        daysPastDue: safeInteger(row.latest_days_past_due, "Servicing queue latest action DPD"),
        reasonCode: row.latest_reason_code,
        source: row.latest_source,
        effectiveAt: timestamp(row.latest_effective_at),
        schemaVersion: "servicing_queue_action_summary.v1"
      } : undefined;
      return {
        obligationId: row.obligation_id,
        subjectId: row.subject_id,
        assetId: row.asset_id,
        status: row.status,
        servicingClassification: row.servicing_classification,
        daysPastDue,
        priorityRank,
        outstandingPrincipalMinor,
        outstandingInterestMinor,
        outstandingFeesMinor,
        outstandingTotalMinor: (
          BigInt(outstandingPrincipalMinor) +
          BigInt(outstandingInterestMinor) +
          BigInt(outstandingFeesMinor)
        ).toString(),
        pastDuePrincipalMinor,
        pastDueInterestMinor,
        pastDueFeesMinor,
        pastDueTotalMinor: (
          BigInt(pastDuePrincipalMinor) +
          BigInt(pastDueInterestMinor) +
          BigInt(pastDueFeesMinor)
        ).toString(),
        oldestUnpaidInstallmentId: row.oldest_unpaid_installment_id,
        oldestDueAt: timestamp(row.oldest_due_at),
        servicingEffectiveAt: timestamp(row.servicing_effective_at),
        scheduleSequence: safeInteger(row.schedule_sequence, "Servicing queue schedule sequence"),
        servicingOwnerCode: row.servicing_owner_code,
        ...(latestServicingAction ? { latestServicingAction } : {})
      };
    });
  }

  async getSandboxExecutionReceipt(sandboxExecutionReceiptId) {
    return this.#getOne(
      "sandboxExecutionReceiptId",
      sandboxExecutionReceiptId,
      "SELECT * FROM sandbox_execution_receipts WHERE id = $1",
      mapSandboxExecutionReceipt
    );
  }

  async getSandboxServicingAction(servicingActionId) {
    return this.#getOne(
      "servicingActionId",
      servicingActionId,
      "SELECT * FROM sandbox_servicing_actions WHERE id = $1",
      mapSandboxServicingAction
    );
  }

  async listSandboxServicingActions({ obligationId, limit = 100 } = {}) {
    assertString("obligationId", obligationId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new DomainError("invalid_list_limit", "servicing action limit must be between 1 and 500");
    }
    const result = await this.#tenantQuery(
      `SELECT * FROM sandbox_servicing_actions
        WHERE obligation_id = $1
        ORDER BY effective_at, id
        LIMIT $2`,
      [obligationId, limit]
    );
    return result.rows.map(mapSandboxServicingAction);
  }

  async findSandboxExecutionReceiptByObligationInTransaction(client, obligationId) {
    assertQueryable(client);
    assertString("obligationId", obligationId);
    const result = await client.query(
      "SELECT * FROM sandbox_execution_receipts WHERE obligation_id = $1 FOR UPDATE",
      [obligationId]
    );
    return mapSandboxExecutionReceipt(result.rows[0]);
  }

  async getCreditOfferAcceptance(acceptanceId) {
    return this.#getOne(
      "acceptanceId",
      acceptanceId,
      "SELECT * FROM credit_offer_acceptances WHERE id = $1",
      mapCreditOfferAcceptance
    );
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
    return this.eventRepository.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT * FROM obligations ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at, id`,
        values
      );
      const sharedIds = result.rows
        .filter((row) => row.schema_version === "obligation.v2")
        .map((row) => row.id);
      const installments = sharedIds.length === 0
        ? { rows: [] }
        : await client.query(
            `SELECT i.* FROM obligation_installments i
               JOIN obligations o ON o.id = i.obligation_id
              WHERE i.obligation_id = ANY($1::text[])
                AND i.schedule_sequence = o.schedule_sequence
              ORDER BY i.obligation_id, i.installment_number`,
            [sharedIds]
          );
      const installmentsByObligation = Map.groupBy(
        installments.rows,
        (row) => row.obligation_id
      );
      return result.rows.map((row) => mapObligation(
        row,
        installmentsByObligation.get(row.id) ?? []
      ));
    });
  }

  async getRepayment(repaymentId) {
    return this.#getOne("repaymentId", repaymentId, "SELECT * FROM repayment_events WHERE id = $1", mapRepayment);
  }

  async getConsentRecord(consentId) {
    return this.#getOne(
      "consentId",
      consentId,
      "SELECT * FROM consent_records WHERE id = $1 AND tenant_id = current_app_tenant_id()",
      mapConsentRecord
    );
  }

  async getConsentRecordInTransaction(client, consentId) {
    assertQueryable(client);
    assertString("consentId", consentId);
    const result = await client.query(
      "SELECT * FROM consent_records WHERE id = $1 AND tenant_id = current_app_tenant_id() FOR UPDATE",
      [consentId]
    );
    return mapConsentRecord(result.rows[0]);
  }

  async getHumanIdentityReference(identityReferenceId) {
    return this.#getOne(
      "identityReferenceId",
      identityReferenceId,
      "SELECT * FROM human_identity_references WHERE id = $1 AND tenant_id = current_app_tenant_id()",
      mapHumanIdentityReference
    );
  }

  async getHumanIdentityReferenceInTransaction(client, identityReferenceId) {
    assertQueryable(client);
    assertString("identityReferenceId", identityReferenceId);
    const result = await client.query(
      `SELECT * FROM human_identity_references
        WHERE id = $1 AND tenant_id = current_app_tenant_id()
        FOR UPDATE`,
      [identityReferenceId]
    );
    return mapHumanIdentityReference(result.rows[0]);
  }

  async getCreditIntent(creditIntentId) {
    return this.#getOne(
      "creditIntentId",
      creditIntentId,
      "SELECT * FROM credit_intents WHERE id = $1 AND tenant_id = current_app_tenant_id()",
      mapCreditIntent
    );
  }

  async getCreditOffer(creditOfferId) {
    return this.#getOne(
      "creditOfferId",
      creditOfferId,
      "SELECT * FROM credit_offers WHERE id = $1 AND tenant_id = current_app_tenant_id()",
      mapCreditOffer
    );
  }

  async getCreditLine(creditLineId) {
    return this.#getOne("creditLineId", creditLineId, "SELECT * FROM credit_lines WHERE id = $1", mapCreditLine);
  }

  async findCreditLineBySubjectAssetInTransaction(client, subjectId, assetId) {
    assertQueryable(client);
    assertString("subjectId", subjectId);
    assertString("assetId", assetId);
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtext('credit_application_risk:' || $1 || ':' || $2),
         hashtext($3)
       )`,
      [this.eventRepository.tenantContext.tenantId, subjectId, assetId]
    );
    const result = await client.query(
      `SELECT * FROM credit_lines
        WHERE subject_id = $1 AND asset_id = $2`,
      [subjectId, assetId]
    );
    return mapCreditLine(result.rows[0]);
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
              r.last_event_id AS registry_last_event_id,
              s.entity_hash AS snapshot_hash,
              s.root_aggregate_type,
              s.root_aggregate_id,
              s.aggregate_version,
              s.source_event_id,
              s.payload,
              e.id AS evidence_event_id,
              e.evidence_hash AS source_evidence_hash,
              e.source_finality
         FROM projection_registry r
         JOIN LATERAL (
           SELECT entity_hash, root_aggregate_type, root_aggregate_id, aggregate_version,
                  source_event_id, payload
             FROM projection_snapshots
            WHERE tenant_id = r.tenant_id
              AND entity_type = r.entity_type
              AND entity_id = r.entity_id
            ORDER BY write_sequence DESC
            LIMIT 1
         ) s ON TRUE
         JOIN evidence_envelopes e
           ON e.tenant_id = r.tenant_id
          AND e.id = r.last_event_id
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

  async listObligationEvidenceInTransaction(
    client,
    { obligationId, limit = 50, afterRecordedAt, afterEvidenceId } = {}
  ) {
    assertQueryable(client);
    assertString("obligationId", obligationId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 51) {
      throw new DomainError(
        "invalid_core_projection",
        "Obligation Evidence list limit must be between 1 and 51"
      );
    }
    if ((afterRecordedAt === undefined) !== (afterEvidenceId === undefined)) {
      throw new DomainError("invalid_core_projection", "Obligation Evidence cursor is incomplete");
    }
    if (afterRecordedAt !== undefined) {
      assertString("afterRecordedAt", afterRecordedAt);
      assertString("afterEvidenceId", afterEvidenceId);
      const parsedCursorTime = new Date(afterRecordedAt);
      if (
        !Number.isFinite(parsedCursorTime.getTime()) ||
        parsedCursorTime.toISOString() !== afterRecordedAt
      ) {
        throw new DomainError("invalid_core_projection", "Obligation Evidence cursor time is invalid");
      }
    }
    const result = await client.query(
      `SELECT id, evidence_hash, event_type, aggregate_type, aggregate_id,
              aggregate_version, obligation_id, source_finality, payload_hash,
              occurred_at, recorded_at, schema_version
         FROM evidence_envelopes
        WHERE obligation_id = $1
          AND ($2::timestamptz IS NULL OR (recorded_at, id) > ($2::timestamptz, $3::text))
        ORDER BY recorded_at, id
        LIMIT $4`,
      [obligationId, afterRecordedAt ?? null, afterEvidenceId ?? null, limit]
    );
    return result.rows.map((row) => ({
      evidenceId: row.id,
      evidenceHash: row.evidence_hash,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      aggregateVersion: safeInteger(row.aggregate_version, "aggregateVersion"),
      obligationId: row.obligation_id,
      sourceFinality: row.source_finality,
      payloadHash: row.payload_hash,
      occurredAt: timestamp(row.occurred_at),
      recordedAt: timestamp(row.recorded_at),
      schemaVersion: row.schema_version
    }));
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

  async listConsentRecordsForSubjectInTransaction(client, subjectId, { limit = 50 } = {}) {
    assertQueryable(client);
    assertString("subjectId", subjectId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new DomainError("invalid_core_projection", "Consent list limit must be between 1 and 50");
    }
    const result = await client.query(
      `SELECT c.id AS entity_id,
              c.subject_id AS normalized_subject_id,
              r.entity_hash AS registry_hash,
              r.root_aggregate_type AS registry_root_aggregate_type,
              r.root_aggregate_id AS registry_root_aggregate_id,
              r.aggregate_version AS registry_aggregate_version,
              s.entity_hash AS snapshot_hash,
              s.root_aggregate_type,
              s.root_aggregate_id,
              s.aggregate_version,
              s.payload
         FROM consent_records c
         LEFT JOIN projection_registry r
           ON r.tenant_id = c.tenant_id
          AND r.entity_type = $1
          AND r.entity_id = c.id
         LEFT JOIN LATERAL (
           SELECT entity_hash, root_aggregate_type, root_aggregate_id, aggregate_version, payload
             FROM projection_snapshots
            WHERE tenant_id = c.tenant_id
              AND entity_type = $1
              AND entity_id = c.id
            ORDER BY write_sequence DESC
            LIMIT 1
         ) s ON TRUE
        WHERE c.subject_id = $2
        ORDER BY c.created_at DESC, c.id
        LIMIT $3`,
      [CoreProjectionType.CONSENT_RECORD, subjectId, limit + 1]
    );
    const values = result.rows.map((row) => {
      const state = projectionStateFromRow(CoreProjectionType.CONSENT_RECORD, row.entity_id, row);
      if (
        row.normalized_subject_id !== subjectId ||
        state.value.consentId !== row.entity_id ||
        state.value.subjectId !== row.normalized_subject_id
      ) {
        throw new DomainError("projection_integrity_mismatch", "Consent projection identity is invalid", {
          entityType: CoreProjectionType.CONSENT_RECORD,
          entityId: row.entity_id
        });
      }
      return state.value;
    });
    return { items: values.slice(0, limit), hasMore: values.length > limit };
  }

  async listHumanIdentityReferencesForSubjectInTransaction(client, subjectId, { limit = 50 } = {}) {
    assertQueryable(client);
    assertString("subjectId", subjectId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new DomainError("invalid_core_projection", "Identity-reference list limit must be between 1 and 50");
    }
    const result = await client.query(
      `SELECT h.id AS entity_id,
              h.subject_id AS normalized_subject_id,
              r.entity_hash AS registry_hash,
              r.root_aggregate_type AS registry_root_aggregate_type,
              r.root_aggregate_id AS registry_root_aggregate_id,
              r.aggregate_version AS registry_aggregate_version,
              s.entity_hash AS snapshot_hash,
              s.root_aggregate_type,
              s.root_aggregate_id,
              s.aggregate_version,
              s.payload
         FROM human_identity_references h
         LEFT JOIN projection_registry r
           ON r.tenant_id = h.tenant_id
          AND r.entity_type = $1
          AND r.entity_id = h.id
         LEFT JOIN LATERAL (
           SELECT entity_hash, root_aggregate_type, root_aggregate_id, aggregate_version, payload
             FROM projection_snapshots
            WHERE tenant_id = h.tenant_id
              AND entity_type = $1
              AND entity_id = h.id
            ORDER BY write_sequence DESC
            LIMIT 1
         ) s ON TRUE
        WHERE h.subject_id = $2
        ORDER BY h.created_at DESC, h.id
        LIMIT $3`,
      [CoreProjectionType.HUMAN_IDENTITY_REFERENCE, subjectId, limit + 1]
    );
    const values = result.rows.map((row) => {
      const state = projectionStateFromRow(CoreProjectionType.HUMAN_IDENTITY_REFERENCE, row.entity_id, row);
      if (
        row.normalized_subject_id !== subjectId ||
        state.value.identityReferenceId !== row.entity_id ||
        state.value.subjectId !== row.normalized_subject_id
      ) {
        throw new DomainError(
          "projection_integrity_mismatch",
          "Human identity-reference projection identity is invalid",
          { entityType: CoreProjectionType.HUMAN_IDENTITY_REFERENCE, entityId: row.entity_id }
        );
      }
      return state.value;
    });
    return { items: values.slice(0, limit), hasMore: values.length > limit };
  }

  async getCreditApplicationRiskStateInTransaction(client, subjectId, assetId) {
    assertQueryable(client);
    assertString("subjectId", subjectId);
    assertString("assetId", assetId);
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtext('credit_application_risk:' || $1 || ':' || $2),
         hashtext($3)
       )`,
      [this.eventRepository.tenantContext.tenantId, subjectId, assetId]
    );
    const obligations = await client.query(
      `SELECT id, status
         FROM obligations
        WHERE subject_id = $1
          AND asset_id = $2
          AND status IN (
            'overdue', 'delinquent', 'defaulted', 'restructured', 'repurchased', 'written_off'
          )
        ORDER BY id
        FOR SHARE`,
      [subjectId, assetId]
    );
    const creditLines = await client.query(
      `SELECT id, status
         FROM credit_lines
        WHERE subject_id = $1
          AND asset_id = $2
          AND status = 'frozen'
        ORDER BY id
        FOR SHARE`,
      [subjectId, assetId]
    );
    const adverseObligationCount = safeInteger(obligations.rowCount, "adverseObligationCount");
    const frozenCreditLineCount = safeInteger(creditLines.rowCount, "frozenCreditLineCount");
    const queryVersion = "credit-application-risk-state.v1";
    return {
      adverseObligationCount,
      frozenCreditLineCount,
      liveStateVersion: adverseObligationCount + frozenCreditLineCount + 1,
      queryVersion,
      stateHash: hashId("credit_application_risk_state", {
        tenantScopeHash: hashId("tenant", { tenantId: this.eventRepository.tenantContext.tenantId }),
        subjectId,
        assetId,
        queryVersion,
        adverseObligations: obligations.rows.map(({ id, status }) => ({ id, status })),
        frozenCreditLines: creditLines.rows.map(({ id, status }) => ({ id, status }))
      })
    };
  }

  async getTenantRiskPortfolioInTransaction(client, { assetLimit = 50 } = {}) {
    assertQueryable(client);
    if (!Number.isSafeInteger(assetLimit) || assetLimit < 1 || assetLimit > 50) {
      throw new DomainError(
        "invalid_core_projection",
        "Tenant risk portfolio asset limit must be between 1 and 50"
      );
    }

    const subjectResult = await client.query(
      `SELECT count(*)::text AS total_count,
              (count(*) FILTER (WHERE status = $1))::text AS pending_count,
              (count(*) FILTER (WHERE status = $2))::text AS active_count,
              (count(*) FILTER (WHERE status = $3))::text AS suspended_count,
              (count(*) FILTER (WHERE status = $4))::text AS closed_count
         FROM subjects`,
      [
        SubjectStatus.PENDING,
        SubjectStatus.ACTIVE,
        SubjectStatus.SUSPENDED,
        SubjectStatus.CLOSED
      ]
    );
    const subjectRow = subjectResult.rows[0];
    if (!subjectRow) {
      throw portfolioIntegrityError("Tenant risk portfolio Subject summary is unavailable");
    }
    const subjects = {
      totalCount: portfolioCount(subjectRow.total_count, "Subject total"),
      pendingCount: portfolioCount(subjectRow.pending_count, "pending Subject count"),
      activeCount: portfolioCount(subjectRow.active_count, "active Subject count"),
      suspendedCount: portfolioCount(subjectRow.suspended_count, "suspended Subject count"),
      closedCount: portfolioCount(subjectRow.closed_count, "closed Subject count")
    };
    assertPortfolioStateCoverage(subjects.totalCount, [
      subjects.pendingCount,
      subjects.activeCount,
      subjects.suspendedCount,
      subjects.closedCount
    ], "Subject");

    const creditLineResult = await client.query(
      `SELECT count(*)::text AS total_count,
              (count(*) FILTER (WHERE c.status = $1))::text AS requested_count,
              (count(*) FILTER (WHERE c.status = $2))::text AS approved_count,
              (count(*) FILTER (WHERE c.status = $3))::text AS rejected_count,
              (count(*) FILTER (WHERE c.status = $4))::text AS frozen_count,
              (count(*) FILTER (WHERE c.status = $5))::text AS closed_count,
              coalesce(sum(c.limit_minor), 0)::text AS limit_minor,
              coalesce(sum(c.utilized_minor), 0)::text AS utilized_minor
         FROM credit_lines c
         JOIN subjects s
           ON s.tenant_id = c.tenant_id
          AND s.id = c.subject_id
        WHERE s.subject_type = $6`,
      [
        CreditLineStatus.REQUESTED,
        CreditLineStatus.APPROVED,
        CreditLineStatus.REJECTED,
        CreditLineStatus.FROZEN,
        CreditLineStatus.CLOSED,
        SubjectType.AGENT
      ]
    );
    const creditLineRow = creditLineResult.rows[0];
    if (!creditLineRow) {
      throw portfolioIntegrityError("Tenant risk portfolio CreditLine summary is unavailable");
    }
    const creditLines = {
      totalCount: portfolioCount(creditLineRow.total_count, "CreditLine total"),
      requestedCount: portfolioCount(creditLineRow.requested_count, "requested CreditLine count"),
      approvedCount: portfolioCount(creditLineRow.approved_count, "approved CreditLine count"),
      rejectedCount: portfolioCount(creditLineRow.rejected_count, "rejected CreditLine count"),
      frozenCount: portfolioCount(creditLineRow.frozen_count, "frozen CreditLine count"),
      closedCount: portfolioCount(creditLineRow.closed_count, "closed CreditLine count"),
      limitMinor: portfolioMinorUnits(creditLineRow.limit_minor, "CreditLine limit"),
      utilizedMinor: portfolioMinorUnits(creditLineRow.utilized_minor, "CreditLine utilization")
    };
    assertPortfolioStateCoverage(creditLines.totalCount, [
      creditLines.requestedCount,
      creditLines.approvedCount,
      creditLines.rejectedCount,
      creditLines.frozenCount,
      creditLines.closedCount
    ], "CreditLine");
    assertPortfolioAmountAtMost(
      creditLines.utilizedMinor,
      creditLines.limitMinor,
      "CreditLine utilization"
    );

    const obligationResult = await client.query(
      `SELECT count(*)::text AS total_count,
              (count(*) FILTER (WHERE o.status NOT IN ($1, $2, $11)))::text AS open_count,
              (count(*) FILTER (WHERE o.status = $3))::text AS created_count,
              (count(*) FILTER (WHERE o.status = $4))::text AS active_count,
              (count(*) FILTER (WHERE o.status = $5))::text AS partially_repaid_count,
              (count(*) FILTER (WHERE o.status = $1))::text AS fully_repaid_count,
              (count(*) FILTER (WHERE o.status = $6))::text AS overdue_count,
              (count(*) FILTER (WHERE o.status = $7))::text AS defaulted_count,
              (count(*) FILTER (WHERE o.status = $8))::text AS delinquent_count,
              (count(*) FILTER (WHERE o.status = $9))::text AS restructured_count,
              (count(*) FILTER (WHERE o.status = $10))::text AS repurchased_count,
              (count(*) FILTER (WHERE o.status = $11))::text AS written_off_count,
              (count(*) FILTER (WHERE o.status = $2))::text AS closed_count,
              coalesce(sum(o.amount_minor), 0)::text AS principal_minor,
              coalesce(sum(o.outstanding_minor), 0)::text AS outstanding_principal_minor,
              coalesce(sum(o.accrued_fees_minor), 0)::text AS accrued_fees_minor,
              coalesce(sum(o.repaid_amount_minor), 0)::text AS repaid_amount_minor,
              coalesce(sum(o.written_off_principal_minor), 0)::text AS written_off_principal_minor,
              coalesce(sum(o.written_off_interest_minor), 0)::text AS written_off_interest_minor,
              coalesce(sum(o.written_off_fees_minor), 0)::text AS written_off_fees_minor
         FROM obligations o
         JOIN subjects s
           ON s.tenant_id = o.tenant_id
          AND s.id = o.subject_id`,
      [
        ObligationStatus.FULLY_REPAID,
        ObligationStatus.CLOSED,
        ObligationStatus.CREATED,
        ObligationStatus.ACTIVE,
        ObligationStatus.PARTIALLY_REPAID,
        ObligationStatus.OVERDUE,
        ObligationStatus.DEFAULTED,
        ObligationStatus.DELINQUENT,
        ObligationStatus.RESTRUCTURED,
        ObligationStatus.REPURCHASED,
        ObligationStatus.WRITTEN_OFF
      ]
    );
    const obligationRow = obligationResult.rows[0];
    if (!obligationRow) {
      throw portfolioIntegrityError("Tenant risk portfolio Obligation summary is unavailable");
    }
    const obligations = {
      totalCount: portfolioCount(obligationRow.total_count, "Obligation total"),
      openCount: portfolioCount(obligationRow.open_count, "open Obligation count"),
      createdCount: portfolioCount(obligationRow.created_count, "created Obligation count"),
      activeCount: portfolioCount(obligationRow.active_count, "active Obligation count"),
      partiallyRepaidCount: portfolioCount(
        obligationRow.partially_repaid_count,
        "partially repaid Obligation count"
      ),
      fullyRepaidCount: portfolioCount(
        obligationRow.fully_repaid_count,
        "fully repaid Obligation count"
      ),
      overdueCount: portfolioCount(obligationRow.overdue_count, "overdue Obligation count"),
      defaultedCount: portfolioCount(obligationRow.defaulted_count, "defaulted Obligation count"),
      delinquentCount: portfolioCount(obligationRow.delinquent_count, "delinquent Obligation count"),
      restructuredCount: portfolioCount(obligationRow.restructured_count, "restructured Obligation count"),
      repurchasedCount: portfolioCount(obligationRow.repurchased_count, "repurchased Obligation count"),
      writtenOffCount: portfolioCount(obligationRow.written_off_count, "written-off Obligation count"),
      closedCount: portfolioCount(obligationRow.closed_count, "closed Obligation count"),
      principalMinor: portfolioMinorUnits(obligationRow.principal_minor, "Obligation principal"),
      outstandingPrincipalMinor: portfolioMinorUnits(
        obligationRow.outstanding_principal_minor,
        "outstanding Obligation principal"
      ),
      accruedFeesMinor: portfolioMinorUnits(
        obligationRow.accrued_fees_minor,
        "Obligation accrued fees"
      ),
      repaidAmountMinor: portfolioMinorUnits(
        obligationRow.repaid_amount_minor,
        "Obligation repaid amount"
      ),
      writtenOffPrincipalMinor: portfolioMinorUnits(
        obligationRow.written_off_principal_minor,
        "Obligation written-off principal"
      ),
      writtenOffInterestMinor: portfolioMinorUnits(
        obligationRow.written_off_interest_minor,
        "Obligation written-off interest"
      ),
      writtenOffFeesMinor: portfolioMinorUnits(
        obligationRow.written_off_fees_minor,
        "Obligation written-off fees"
      )
    };
    assertPortfolioStateCoverage(obligations.totalCount, [
      obligations.createdCount,
      obligations.activeCount,
      obligations.partiallyRepaidCount,
      obligations.fullyRepaidCount,
      obligations.overdueCount,
      obligations.defaultedCount,
      obligations.delinquentCount,
      obligations.restructuredCount,
      obligations.repurchasedCount,
      obligations.writtenOffCount,
      obligations.closedCount
    ], "Obligation");
    if (
      obligations.openCount !==
      obligations.totalCount - obligations.fullyRepaidCount - obligations.writtenOffCount - obligations.closedCount
    ) {
      throw portfolioIntegrityError("Tenant risk portfolio open Obligation count is inconsistent");
    }
    assertPortfolioAmountAtMost(
      obligations.outstandingPrincipalMinor,
      obligations.principalMinor,
      "outstanding Obligation principal"
    );
    assertPortfolioAmountIdentity(
      obligations.principalMinor,
      [obligations.outstandingPrincipalMinor, obligations.repaidAmountMinor],
      "Obligation principal"
    );

    const assetResult = await client.query(
      `WITH credit AS (
         SELECT c.asset_id,
                count(*) AS credit_line_count,
                count(*) FILTER (WHERE c.status = $1) AS approved_credit_line_count,
                count(*) FILTER (WHERE c.status = $2) AS frozen_credit_line_count,
                coalesce(sum(c.limit_minor), 0) AS limit_minor,
                coalesce(sum(c.utilized_minor), 0) AS utilized_minor
           FROM credit_lines c
           JOIN subjects s
             ON s.tenant_id = c.tenant_id
            AND s.id = c.subject_id
          WHERE s.subject_type = $3
          GROUP BY c.asset_id
       ), debt AS (
         SELECT o.asset_id,
                count(*) AS obligation_count,
                count(*) FILTER (WHERE o.status NOT IN ($4, $5, $11)) AS open_obligation_count,
                count(*) FILTER (WHERE o.status = $6) AS overdue_obligation_count,
                count(*) FILTER (WHERE o.status = $7) AS defaulted_obligation_count,
                count(*) FILTER (WHERE o.status = $8) AS delinquent_obligation_count,
                count(*) FILTER (WHERE o.status = $9) AS restructured_obligation_count,
                count(*) FILTER (WHERE o.status = $10) AS repurchased_obligation_count,
                count(*) FILTER (WHERE o.status = $11) AS written_off_obligation_count,
                coalesce(sum(o.outstanding_minor), 0) AS outstanding_principal_minor,
                coalesce(sum(o.written_off_principal_minor), 0) AS written_off_principal_minor
           FROM obligations o
           JOIN subjects s
             ON s.tenant_id = o.tenant_id
            AND s.id = o.subject_id
          GROUP BY o.asset_id
       ), exposure AS (
         SELECT coalesce(credit.asset_id, debt.asset_id) AS asset_id,
                coalesce(credit.credit_line_count, 0) AS credit_line_count,
                coalesce(credit.approved_credit_line_count, 0) AS approved_credit_line_count,
                coalesce(credit.frozen_credit_line_count, 0) AS frozen_credit_line_count,
                coalesce(credit.limit_minor, 0) AS limit_minor,
                coalesce(credit.utilized_minor, 0) AS utilized_minor,
                coalesce(debt.obligation_count, 0) AS obligation_count,
                coalesce(debt.open_obligation_count, 0) AS open_obligation_count,
                coalesce(debt.overdue_obligation_count, 0) AS overdue_obligation_count,
                coalesce(debt.defaulted_obligation_count, 0) AS defaulted_obligation_count,
                coalesce(debt.delinquent_obligation_count, 0) AS delinquent_obligation_count,
                coalesce(debt.restructured_obligation_count, 0) AS restructured_obligation_count,
                coalesce(debt.repurchased_obligation_count, 0) AS repurchased_obligation_count,
                coalesce(debt.written_off_obligation_count, 0) AS written_off_obligation_count,
                coalesce(debt.outstanding_principal_minor, 0) AS outstanding_principal_minor,
                coalesce(debt.written_off_principal_minor, 0) AS written_off_principal_minor
           FROM credit
           FULL OUTER JOIN debt ON debt.asset_id = credit.asset_id
       )
       SELECT asset_id,
              credit_line_count::text,
              approved_credit_line_count::text,
              frozen_credit_line_count::text,
              limit_minor::text,
              utilized_minor::text,
              obligation_count::text,
              open_obligation_count::text,
              overdue_obligation_count::text,
              defaulted_obligation_count::text,
              delinquent_obligation_count::text,
              restructured_obligation_count::text,
              repurchased_obligation_count::text,
              written_off_obligation_count::text,
              outstanding_principal_minor::text,
              written_off_principal_minor::text
         FROM exposure
        ORDER BY outstanding_principal_minor DESC, utilized_minor DESC, asset_id
        LIMIT $12`,
      [
        CreditLineStatus.APPROVED,
        CreditLineStatus.FROZEN,
        SubjectType.AGENT,
        ObligationStatus.FULLY_REPAID,
        ObligationStatus.CLOSED,
        ObligationStatus.OVERDUE,
        ObligationStatus.DEFAULTED,
        ObligationStatus.DELINQUENT,
        ObligationStatus.RESTRUCTURED,
        ObligationStatus.REPURCHASED,
        ObligationStatus.WRITTEN_OFF,
        assetLimit + 1
      ]
    );
    if (assetResult.rows.length > assetLimit + 1) {
      throw portfolioIntegrityError("Tenant risk portfolio asset page exceeds its query bound");
    }
    const allAssetExposures = assetResult.rows.map((row) => ({
      assetId: portfolioAssetId(row.asset_id),
      creditLineCount: portfolioCount(row.credit_line_count, "asset CreditLine count"),
      approvedCreditLineCount: portfolioCount(
        row.approved_credit_line_count,
        "asset approved CreditLine count"
      ),
      frozenCreditLineCount: portfolioCount(
        row.frozen_credit_line_count,
        "asset frozen CreditLine count"
      ),
      limitMinor: portfolioMinorUnits(row.limit_minor, "asset CreditLine limit"),
      utilizedMinor: portfolioMinorUnits(row.utilized_minor, "asset CreditLine utilization"),
      obligationCount: portfolioCount(row.obligation_count, "asset Obligation count"),
      openObligationCount: portfolioCount(
        row.open_obligation_count,
        "asset open Obligation count"
      ),
      overdueObligationCount: portfolioCount(
        row.overdue_obligation_count,
        "asset overdue Obligation count"
      ),
      defaultedObligationCount: portfolioCount(
        row.defaulted_obligation_count,
        "asset defaulted Obligation count"
      ),
      delinquentObligationCount: portfolioCount(
        row.delinquent_obligation_count,
        "asset delinquent Obligation count"
      ),
      restructuredObligationCount: portfolioCount(
        row.restructured_obligation_count,
        "asset restructured Obligation count"
      ),
      repurchasedObligationCount: portfolioCount(
        row.repurchased_obligation_count,
        "asset repurchased Obligation count"
      ),
      writtenOffObligationCount: portfolioCount(
        row.written_off_obligation_count,
        "asset written-off Obligation count"
      ),
      outstandingPrincipalMinor: portfolioMinorUnits(
        row.outstanding_principal_minor,
        "asset outstanding Obligation principal"
      ),
      writtenOffPrincipalMinor: portfolioMinorUnits(
        row.written_off_principal_minor,
        "asset written-off Obligation principal"
      )
    }));
    const assetIds = allAssetExposures.map(({ assetId }) => assetId);
    if (new Set(assetIds).size !== assetIds.length) {
      throw portfolioIntegrityError("Tenant risk portfolio asset identities are duplicated");
    }
    for (const exposure of allAssetExposures) {
      if (
        BigInt(exposure.approvedCreditLineCount) + BigInt(exposure.frozenCreditLineCount) >
          BigInt(exposure.creditLineCount) ||
        exposure.openObligationCount > exposure.obligationCount ||
        exposure.overdueObligationCount > exposure.openObligationCount ||
        exposure.defaultedObligationCount > exposure.openObligationCount ||
        exposure.delinquentObligationCount > exposure.openObligationCount ||
        BigInt(exposure.overdueObligationCount) + BigInt(exposure.defaultedObligationCount) +
          BigInt(exposure.delinquentObligationCount) >
          BigInt(exposure.openObligationCount)
      ) {
        throw portfolioIntegrityError("Tenant risk portfolio asset status counts are inconsistent");
      }
      assertPortfolioAmountAtMost(
        exposure.utilizedMinor,
        exposure.limitMinor,
        "asset CreditLine utilization"
      );
    }
    if (allAssetExposures.length <= assetLimit) {
      const countTotal = (field) => allAssetExposures.reduce(
        (sum, exposure) => sum + BigInt(exposure[field]),
        0n
      );
      const amountTotal = (field) => allAssetExposures.reduce(
        (sum, exposure) => sum + minorUnitsBigInt(exposure[field]),
        0n
      );
      const exactCounts = [
        ["creditLineCount", creditLines.totalCount],
        ["approvedCreditLineCount", creditLines.approvedCount],
        ["frozenCreditLineCount", creditLines.frozenCount],
        ["obligationCount", obligations.totalCount],
        ["openObligationCount", obligations.openCount],
        ["overdueObligationCount", obligations.overdueCount],
        ["defaultedObligationCount", obligations.defaultedCount],
        ["delinquentObligationCount", obligations.delinquentCount],
        ["restructuredObligationCount", obligations.restructuredCount],
        ["repurchasedObligationCount", obligations.repurchasedCount],
        ["writtenOffObligationCount", obligations.writtenOffCount]
      ];
      const exactAmounts = [
        ["limitMinor", creditLines.limitMinor],
        ["utilizedMinor", creditLines.utilizedMinor],
        ["outstandingPrincipalMinor", obligations.outstandingPrincipalMinor],
        ["writtenOffPrincipalMinor", obligations.writtenOffPrincipalMinor]
      ];
      if (
        exactCounts.some(([field, total]) => countTotal(field) !== BigInt(total)) ||
        exactAmounts.some(([field, total]) => amountTotal(field) !== minorUnitsBigInt(total))
      ) {
        throw portfolioIntegrityError("Tenant risk portfolio asset and total summaries disagree");
      }
    }
    const hasMoreAssetExposures = allAssetExposures.length > assetLimit;
    const assetExposures = allAssetExposures.slice(0, assetLimit);

    return {
      subjects,
      creditLines,
      obligations,
      assetExposures,
      hasMoreAssetExposures
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

  async getPilotFeedbackRecord(pilotFeedbackId) {
    return this.#getOne(
      "pilotFeedbackId",
      pilotFeedbackId,
      "SELECT * FROM pilot_feedback_records WHERE id = $1",
      mapPilotFeedbackRecord
    );
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
      case CoreProjectionType.AGENT_ACCOUNT_CHALLENGE:
        value = await this.getAgentAccountChallenge(entityId);
        break;
      case CoreProjectionType.AGENT_ACCOUNT_PROOF_ATTEMPT:
        value = await this.getAgentAccountProofAttempt(entityId);
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
      case CoreProjectionType.PROVIDER_INTENT_DELIVERY:
        value = await this.getProviderIntentDelivery(entityId);
        break;
      case CoreProjectionType.PROVIDER_INTENT_ACKNOWLEDGEMENT:
        value = await this.getProviderIntentAcknowledgement(entityId);
        break;
      case CoreProjectionType.PROVIDER_CALLBACK_INBOX:
        value = await this.getProviderCallbackInbox(entityId);
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
      case CoreProjectionType.SANDBOX_EXECUTION_RECEIPT:
        value = await this.getSandboxExecutionReceipt(entityId);
        break;
      case CoreProjectionType.SANDBOX_SERVICING_ACTION:
        value = await this.getSandboxServicingAction(entityId);
        break;
      case CoreProjectionType.REPAYMENT:
        value = await this.getRepayment(entityId);
        break;
      case CoreProjectionType.CONSENT_RECORD:
        value = await this.getConsentRecord(entityId);
        break;
      case CoreProjectionType.HUMAN_IDENTITY_REFERENCE:
        value = await this.getHumanIdentityReference(entityId);
        break;
      case CoreProjectionType.CREDIT_INTENT:
        value = await this.getCreditIntent(entityId);
        break;
      case CoreProjectionType.CREDIT_OFFER:
        value = await this.getCreditOffer(entityId);
        break;
      case CoreProjectionType.CREDIT_OFFER_ACCEPTANCE:
        value = await this.getCreditOfferAcceptance(entityId);
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
      case CoreProjectionType.PILOT_FEEDBACK_RECORD:
        value = await this.getPilotFeedbackRecord(entityId);
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
      case CoreProjectionType.AGENT_ACCOUNT_CHALLENGE:
        return this.#writeAgentAccountChallenge(client, value);
      case CoreProjectionType.AGENT_ACCOUNT_PROOF_ATTEMPT:
        return this.#writeAgentAccountProofAttempt(client, value);
      case CoreProjectionType.MANDATE:
        return this.#writeMandate(client, value);
      case CoreProjectionType.MANDATE_RESERVATION:
        return this.#writeMandateReservation(client, value);
      case CoreProjectionType.MANDATE_RELEASE:
        return this.#writeMandateRelease(client, value);
      case CoreProjectionType.PROVIDER:
        return this.#writeProvider(client, value);
      case CoreProjectionType.PROVIDER_INTENT_DELIVERY:
        return this.#writeProviderIntentDelivery(client, value);
      case CoreProjectionType.PROVIDER_INTENT_ACKNOWLEDGEMENT:
        return this.#writeProviderIntentAcknowledgement(client, value);
      case CoreProjectionType.PROVIDER_CALLBACK_INBOX:
        return this.#writeProviderCallbackInbox(client, value);
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
      case CoreProjectionType.SANDBOX_EXECUTION_RECEIPT:
        return this.#writeSandboxExecutionReceipt(client, value);
      case CoreProjectionType.SANDBOX_SERVICING_ACTION:
        return this.#writeSandboxServicingAction(client, value);
      case CoreProjectionType.REPAYMENT:
        return this.#writeRepayment(client, value);
      case CoreProjectionType.CONSENT_RECORD:
        return this.#writeConsentRecord(client, value);
      case CoreProjectionType.HUMAN_IDENTITY_REFERENCE:
        return this.#writeHumanIdentityReference(client, value);
      case CoreProjectionType.CREDIT_INTENT:
        return this.#writeCreditIntent(client, value);
      case CoreProjectionType.CREDIT_OFFER:
        return this.#writeCreditOffer(client, value);
      case CoreProjectionType.CREDIT_OFFER_ACCEPTANCE:
        return this.#writeCreditOfferAcceptance(client, value);
      case CoreProjectionType.CREDIT_LINE:
        return this.#writeCreditLine(client, value, occurredAt);
      case CoreProjectionType.RISK_DECISION:
        return this.#writeRiskDecision(client, value);
      case CoreProjectionType.ADMIN_ACTION:
        return this.#writeAdminAction(client, value);
      case CoreProjectionType.PILOT_FEEDBACK_RECORD:
        return this.#writePilotFeedbackRecord(client, value);
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
         nonce, purpose, verification_method, status, bound_at, revoked_at, schema_version,
         challenge_id, proof_hash, protocol_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
         AND account_bindings.challenge_id IS NOT DISTINCT FROM EXCLUDED.challenge_id
         AND account_bindings.proof_hash IS NOT DISTINCT FROM EXCLUDED.proof_hash
         AND account_bindings.protocol_version IS NOT DISTINCT FROM EXCLUDED.protocol_version
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
        value.schemaVersion,
        value.challengeId ?? null,
        value.proofHash ?? null,
        value.protocolVersion ?? null
      ]
    );
    if (result.rowCount !== 1) throw projectionConflict(CoreProjectionType.ACCOUNT_BINDING, value.accountBindingId);
  }

  async #writeAgentAccountChallenge(client, value) {
    const result = await client.query(
      `INSERT INTO agent_account_challenges(
         id, subject_id, subject_hash, tenant_hash, controller_actor_hash,
         agent_actor_hash, chain_id, account_hash, purpose, nonce,
         typed_data_hash, status, issued_at, expires_at, consumed_at,
         protocol_version, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17
       )
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status, consumed_at = EXCLUDED.consumed_at
       WHERE agent_account_challenges.subject_id = EXCLUDED.subject_id
         AND agent_account_challenges.subject_hash = EXCLUDED.subject_hash
         AND agent_account_challenges.tenant_hash = EXCLUDED.tenant_hash
         AND agent_account_challenges.controller_actor_hash = EXCLUDED.controller_actor_hash
         AND agent_account_challenges.agent_actor_hash = EXCLUDED.agent_actor_hash
         AND agent_account_challenges.chain_id = EXCLUDED.chain_id
         AND agent_account_challenges.account_hash = EXCLUDED.account_hash
         AND agent_account_challenges.purpose = EXCLUDED.purpose
         AND agent_account_challenges.nonce = EXCLUDED.nonce
         AND agent_account_challenges.typed_data_hash = EXCLUDED.typed_data_hash
         AND agent_account_challenges.issued_at = EXCLUDED.issued_at
         AND agent_account_challenges.expires_at = EXCLUDED.expires_at
         AND agent_account_challenges.protocol_version = EXCLUDED.protocol_version
       RETURNING id`,
      [
        value.challengeId,
        value.subjectId,
        value.subjectHash,
        value.tenantHash,
        value.controllerActorHash,
        value.agentActorHash,
        value.chainId,
        value.accountHash,
        value.purpose,
        value.nonce,
        value.typedDataHash,
        value.status,
        value.issuedAt,
        value.expiresAt,
        value.consumedAt ?? null,
        value.protocolVersion,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.AGENT_ACCOUNT_CHALLENGE, value.challengeId);
    }
  }

  async #writeAgentAccountProofAttempt(client, value) {
    const result = await client.query(
      `INSERT INTO agent_account_proof_attempts(
         id, challenge_id, subject_id, account_hash, chain_id, proof_hash,
         verification_method, outcome, attempted_at, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.proofAttemptId,
        value.challengeId,
        value.subjectId,
        value.accountHash,
        value.chainId,
        value.proofHash,
        value.verificationMethod,
        value.outcome,
        value.attemptedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.AGENT_ACCOUNT_PROOF_ATTEMPT, value.proofAttemptId);
    }
  }

  async #writeMandate(client, value) {
    const result = await client.query(
      `INSERT INTO mandates(
         id, mandate_hash, principal_id, subject_id, capabilities,
         allowed_provider_ids, allowed_categories, asset_ids,
         per_action_limit_minor, aggregate_limit_minor, utilized_minor,
         valid_from, expires_at, nonce, terms_ref, status, created_at, updated_at, schema_version,
         terms_hash, sandbox_only, production_authority, activation_acknowledgement
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19,
         $20, $21, $22, $23
       )
       ON CONFLICT (id) DO UPDATE
         SET utilized_minor = EXCLUDED.utilized_minor,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at,
             activation_acknowledgement = EXCLUDED.activation_acknowledgement
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
        value.schemaVersion,
        value.termsHash ?? null,
        value.sandboxOnly ?? true,
        value.productionAuthority ?? false,
        value.activationAcknowledgement === undefined
          ? null
          : json(value.activationAcknowledgement)
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

  async #writeProviderIntentDelivery(client, value) {
    const columns = `
         id, delivery_hash, transfer_intent_id, transfer_intent_hash, provider_id,
         provider_actor_id, purpose_code, source_asset_id, source_amount_minor,
         destination_asset_id, status, acknowledgement_id, acknowledged_at,
         callback_id, callback_payload_hash, callback_completed_at, aggregate_version,
         issued_at, expires_at, sandbox_only, production_funds_moved, withdrawable,
         schema_version`;
    const values = [
      value.deliveryId,
      value.deliveryHash,
      value.transferIntentId,
      value.transferIntentHash,
      value.providerId,
      value.providerActorId,
      value.purposeCode,
      value.sourceAssetId,
      value.sourceAmountMinor,
      value.destinationAssetId,
      value.status,
      value.acknowledgementId ?? null,
      value.acknowledgedAt ?? null,
      value.callbackId ?? null,
      value.callbackPayloadHash ?? null,
      value.callbackCompletedAt ?? null,
      value.aggregateVersion,
      value.issuedAt,
      value.expiresAt,
      value.sandboxOnly,
      value.productionFundsMoved,
      value.withdrawable,
      value.schemaVersion
    ];
    const result = value.aggregateVersion === 1
      ? await client.query(
        `INSERT INTO provider_intent_deliveries(${columns}) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17,
           $18, $19, $20, $21, $22, $23
         )
         ON CONFLICT DO NOTHING
         RETURNING id`,
        values
      )
      : await client.query(
        `UPDATE provider_intent_deliveries
            SET status = $11,
                acknowledgement_id = $12,
                acknowledged_at = $13,
                callback_id = $14,
                callback_payload_hash = $15,
                callback_completed_at = $16,
                aggregate_version = $17
          WHERE id = $1
            AND delivery_hash = $2
            AND transfer_intent_id = $3
            AND transfer_intent_hash = $4
            AND provider_id = $5
            AND provider_actor_id = $6
            AND purpose_code = $7
            AND source_asset_id = $8
            AND source_amount_minor = $9
            AND destination_asset_id = $10
            AND aggregate_version = $17 - 1
            AND issued_at = $18
            AND expires_at = $19
            AND sandbox_only = $20
            AND production_funds_moved = $21
            AND withdrawable = $22
            AND schema_version = $23
        RETURNING id`,
        values
      );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.PROVIDER_INTENT_DELIVERY, value.deliveryId);
    }
  }

  async #writeProviderIntentAcknowledgement(client, value) {
    const result = await client.query(
      `INSERT INTO provider_intent_acknowledgements(
         id, delivery_id, delivery_hash, transfer_intent_id, provider_id,
         acknowledged_at, sandbox_only, production_funds_moved, withdrawable,
         schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        value.acknowledgementId,
        value.deliveryId,
        value.deliveryHash,
        value.transferIntentId,
        value.providerId,
        value.acknowledgedAt,
        value.sandboxOnly,
        value.productionFundsMoved,
        value.withdrawable,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.PROVIDER_INTENT_ACKNOWLEDGEMENT, value.acknowledgementId);
    }
  }

  async #writeProviderCallbackInbox(client, value) {
    const result = await client.query(
      `INSERT INTO provider_callback_inbox(
         callback_id, transfer_intent_id, provider_id, delivery_hash, payload_hash,
         nonce_hash, key_id, outcome, reason_code, provider_event_ref_hash,
         result_json, processed_at, sandbox_only, production_funds_moved,
         withdrawable, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11::jsonb, $12, $13, $14, $15, $16
       )
       RETURNING callback_id`,
      [
        value.callbackId,
        value.transferIntentId,
        value.providerId,
        value.deliveryHash,
        value.payloadHash,
        value.nonceHash,
        value.keyId,
        value.outcome,
        value.reasonCode,
        value.providerEventRefHash,
        json(value),
        value.processedAt,
        value.sandboxOnly,
        value.productionFundsMoved,
        value.withdrawable,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.PROVIDER_CALLBACK_INBOX, value.callbackId);
    }
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
    if (value.schemaVersion === "obligation.v2") {
      return this.#writeSharedObligation(client, value);
    }
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

  async #writeSharedObligation(client, value) {
    const repaidPrincipalMinor = (
      BigInt(value.originalPrincipalMinor) - BigInt(value.outstandingPrincipalMinor)
    ).toString();
    const result = await client.query(
      `INSERT INTO obligations(
         id, obligation_hash, subject_id, principal_id, mandate_id, asset_id,
         amount_minor, outstanding_minor, accrued_fees_minor, repaid_amount_minor,
         spend_policy_id, cashflow_route_id, status, repayment_priority,
         attestation_ids, chain_executions, due_at, created_at, updated_at, schema_version,
         credit_intent_id, risk_decision_id, credit_offer_id, acceptance_id,
         authority_type, authority_ref, consent_id, annual_rate_bps,
         origination_fee_minor, accrued_interest_minor, outstanding_interest_minor,
         outstanding_fees_minor, total_repaid_minor, repayment_frequency,
         installment_count, first_payment_at, maturity_at, schedule_version,
         schedule_hash, execution_status, sandbox_only, production_funds_moved,
         accepted_at, sandbox_execution_receipt_id, executed_at, last_accrued_at,
         interest_accrual_remainder, withdrawable,
         servicing_classification, days_past_due, oldest_unpaid_installment_id,
         servicing_effective_at, servicing_reason_code, servicing_policy_version,
         schedule_sequence, servicing_owner_code, resolution_type,
         resolution_reason_code, resolution_at, written_off_principal_minor,
         written_off_interest_minor, written_off_fees_minor
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         NULL, NULL, $11, 1, '[]'::jsonb, '[]'::jsonb, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
         $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
         $39, $40, $41, $42, $43,
         $44, $45, $46, $47, $48, $49, $50, $51, $52, $53,
         $54, $55, $56, $57
       )
       ON CONFLICT (id) DO UPDATE
         SET outstanding_minor = EXCLUDED.outstanding_minor,
             accrued_fees_minor = EXCLUDED.accrued_fees_minor,
             repaid_amount_minor = EXCLUDED.repaid_amount_minor,
             accrued_interest_minor = EXCLUDED.accrued_interest_minor,
             outstanding_interest_minor = EXCLUDED.outstanding_interest_minor,
             outstanding_fees_minor = EXCLUDED.outstanding_fees_minor,
             total_repaid_minor = EXCLUDED.total_repaid_minor,
             execution_status = EXCLUDED.execution_status,
             sandbox_execution_receipt_id = EXCLUDED.sandbox_execution_receipt_id,
             executed_at = EXCLUDED.executed_at,
             last_accrued_at = EXCLUDED.last_accrued_at,
             interest_accrual_remainder = EXCLUDED.interest_accrual_remainder,
             withdrawable = EXCLUDED.withdrawable,
             due_at = EXCLUDED.due_at,
             installment_count = EXCLUDED.installment_count,
             first_payment_at = EXCLUDED.first_payment_at,
             maturity_at = EXCLUDED.maturity_at,
             schedule_hash = EXCLUDED.schedule_hash,
             schedule_sequence = EXCLUDED.schedule_sequence,
             servicing_classification = EXCLUDED.servicing_classification,
             days_past_due = EXCLUDED.days_past_due,
             oldest_unpaid_installment_id = EXCLUDED.oldest_unpaid_installment_id,
             servicing_effective_at = EXCLUDED.servicing_effective_at,
             servicing_reason_code = EXCLUDED.servicing_reason_code,
             servicing_policy_version = EXCLUDED.servicing_policy_version,
             servicing_owner_code = EXCLUDED.servicing_owner_code,
             resolution_type = EXCLUDED.resolution_type,
             resolution_reason_code = EXCLUDED.resolution_reason_code,
             resolution_at = EXCLUDED.resolution_at,
             written_off_principal_minor = EXCLUDED.written_off_principal_minor,
             written_off_interest_minor = EXCLUDED.written_off_interest_minor,
             written_off_fees_minor = EXCLUDED.written_off_fees_minor,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at
       WHERE obligations.obligation_hash = EXCLUDED.obligation_hash
         AND obligations.credit_offer_id = EXCLUDED.credit_offer_id
         AND obligations.acceptance_id = EXCLUDED.acceptance_id
         AND obligations.schema_version = 'obligation.v2'
       RETURNING id`,
      [
        value.obligationId,
        value.obligationHash,
        value.subjectId,
        value.principalId,
        value.mandateId ?? null,
        value.assetId,
        value.originalPrincipalMinor,
        value.outstandingPrincipalMinor,
        value.accruedFeesMinor,
        repaidPrincipalMinor,
        value.status,
        value.maturityAt,
        value.createdAt,
        value.updatedAt,
        value.schemaVersion,
        value.creditIntentId,
        value.riskDecisionId,
        value.creditOfferId,
        value.creditOfferAcceptanceId,
        value.authorityType,
        value.authorityRef,
        value.consentId ?? null,
        value.annualRateBps,
        value.originationFeeMinor,
        value.accruedInterestMinor,
        value.outstandingInterestMinor,
        value.outstandingFeesMinor,
        value.totalRepaidMinor,
        value.repaymentFrequency,
        value.installmentCount,
        value.firstPaymentAt,
        value.maturityAt,
        value.scheduleVersion,
        value.scheduleHash,
        value.executionStatus,
        value.sandboxOnly,
        value.productionFundsMoved,
        value.acceptedAt,
        value.sandboxExecutionReceiptId ?? null,
        value.executedAt ?? null,
        value.lastAccruedAt ?? null,
        value.interestAccrualRemainder ?? "0",
        value.withdrawable ?? false,
        value.servicingClassification,
        value.daysPastDue,
        value.oldestUnpaidInstallmentId,
        value.servicingEffectiveAt,
        value.servicingReasonCode,
        value.servicingPolicyVersion,
        value.scheduleSequence,
        value.servicingOwnerCode,
        value.resolutionType ?? null,
        value.resolutionReasonCode ?? null,
        value.resolutionAt ?? null,
        value.writtenOffPrincipalMinor ?? "0",
        value.writtenOffInterestMinor ?? "0",
        value.writtenOffFeesMinor ?? "0"
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.OBLIGATION, value.obligationId);
    }
    if (!Array.isArray(value.installments) || value.installments.length !== value.installmentCount) {
      throw new DomainError("invalid_core_projection", "shared Obligation schedule is incomplete");
    }
    for (const installment of value.installments) {
      const inserted = await client.query(
        `INSERT INTO obligation_installments(
           id, obligation_id, installment_number, due_at,
           scheduled_principal_minor, scheduled_interest_minor, scheduled_fee_minor,
           paid_principal_minor, paid_interest_minor, paid_fee_minor,
           status, schedule_version, schedule_sequence, schema_version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE
           SET scheduled_interest_minor = EXCLUDED.scheduled_interest_minor,
               scheduled_fee_minor = EXCLUDED.scheduled_fee_minor,
               paid_principal_minor = EXCLUDED.paid_principal_minor,
               paid_interest_minor = EXCLUDED.paid_interest_minor,
               paid_fee_minor = EXCLUDED.paid_fee_minor,
               status = EXCLUDED.status
         WHERE obligation_installments.obligation_id = EXCLUDED.obligation_id
           AND obligation_installments.installment_number = EXCLUDED.installment_number
           AND obligation_installments.due_at = EXCLUDED.due_at
           AND obligation_installments.scheduled_principal_minor = EXCLUDED.scheduled_principal_minor
           AND obligation_installments.schedule_version = EXCLUDED.schedule_version
           AND obligation_installments.schedule_sequence = EXCLUDED.schedule_sequence
           AND obligation_installments.schema_version = EXCLUDED.schema_version
         RETURNING id`,
        [
          installment.installmentId,
          installment.obligationId,
          installment.installmentNumber,
          installment.dueAt,
          installment.scheduledPrincipalMinor,
          installment.scheduledInterestMinor,
          installment.scheduledFeeMinor,
          installment.paidPrincipalMinor,
          installment.paidInterestMinor,
          installment.paidFeeMinor,
          installment.status,
          installment.scheduleVersion,
          installment.scheduleSequence,
          installment.schemaVersion
        ]
      );
      if (inserted.rowCount === 1) continue;
      const existing = await client.query("SELECT * FROM obligation_installments WHERE id = $1", [installment.installmentId]);
      if (hashId("projection_compare", mapObligationInstallment(existing.rows[0])) !==
          hashId("projection_compare", installment)) {
        throw projectionConflict("obligation_installment", installment.installmentId);
      }
    }
  }

  async #writeSandboxExecutionReceipt(client, value) {
    const result = await client.query(
      `INSERT INTO sandbox_execution_receipts(
         id, receipt_hash, obligation_id, subject_id, asset_id, amount_minor,
         adapter_id, adapter_version, adapter_key_id, adapter_message_hash,
         adapter_signature, adapter_issued_at, executed_at, sandbox_only,
         production_funds_moved, withdrawable, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17
       ) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [
        value.sandboxExecutionReceiptId,
        value.receiptHash,
        value.obligationId,
        value.subjectId,
        value.assetId,
        value.amountMinor,
        value.adapterId,
        value.adapterVersion,
        value.adapterKeyId,
        value.adapterMessageHash,
        value.adapterSignature,
        value.adapterIssuedAt,
        value.executedAt,
        value.sandboxOnly,
        value.productionFundsMoved,
        value.withdrawable,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query(
      "SELECT * FROM sandbox_execution_receipts WHERE id = $1",
      [value.sandboxExecutionReceiptId]
    );
    if (
      hashId("projection_compare", mapSandboxExecutionReceipt(existing.rows[0])) !==
      hashId("projection_compare", value)
    ) {
      throw projectionConflict(
        CoreProjectionType.SANDBOX_EXECUTION_RECEIPT,
        value.sandboxExecutionReceiptId
      );
    }
  }

  async #writeSandboxServicingAction(client, value) {
    const result = await client.query(
      `INSERT INTO sandbox_servicing_actions(
         id, servicing_action_hash, obligation_id, subject_id, action_type,
         previous_status, next_status, previous_classification, next_classification,
         days_past_due, oldest_unpaid_installment_id, reason_code, source,
         actor_hash, policy_version, schedule_sequence_before,
         schedule_sequence_after, schedule_hash_before, schedule_hash_after,
         balances_before, balances_after, previous_schedule, approval_proposal_id,
         approval_execution_id, effective_at, sandbox_only,
         production_funds_moved, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25, $26, $27, $28
       ) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [
        value.servicingActionId,
        value.servicingActionHash,
        value.obligationId,
        value.subjectId,
        value.actionType,
        value.previousStatus,
        value.nextStatus,
        value.previousClassification,
        value.nextClassification,
        value.daysPastDue,
        value.oldestUnpaidInstallmentId,
        value.reasonCode,
        value.source,
        value.actorHash,
        value.policyVersion,
        value.scheduleSequenceBefore,
        value.scheduleSequenceAfter,
        value.scheduleHashBefore,
        value.scheduleHashAfter,
        json(value.balancesBefore),
        json(value.balancesAfter),
        value.previousSchedule ? json(value.previousSchedule) : null,
        value.approvalProposalId ?? null,
        value.approvalExecutionId ?? null,
        value.effectiveAt,
        value.sandboxOnly,
        value.productionFundsMoved,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query(
      "SELECT * FROM sandbox_servicing_actions WHERE id = $1",
      [value.servicingActionId]
    );
    if (
      hashId("projection_compare", mapSandboxServicingAction(existing.rows[0])) !==
      hashId("projection_compare", value)
    ) {
      throw projectionConflict(CoreProjectionType.SANDBOX_SERVICING_ACTION, value.servicingActionId);
    }
  }

  async #writeRepayment(client, value) {
    if (value.schemaVersion === "repayment.v2") {
      return this.#writeSharedRepayment(client, value);
    }
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

  async #writeSharedRepayment(client, value) {
    const remainingMinor = (
      BigInt(value.remainingPrincipalMinor) + BigInt(value.remainingInterestMinor) +
      BigInt(value.remainingFeesMinor)
    ).toString();
    const result = await client.query(
      `INSERT INTO repayment_events(
         id, obligation_id, subject_id, amount_minor, asset_id, remaining_minor,
         occurred_at, schema_version, repayment_hash, requested_minor, applied_minor,
         applied_fee_minor, applied_interest_minor, applied_principal_minor,
         surplus_minor, remaining_principal_minor, remaining_interest_minor,
         remaining_fees_minor, source_code, actor_hash, accrued_interest_minor,
         accrual_days, ledger_transaction_id, interest_ledger_transaction_id,
         sandbox_only, production_funds_moved
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
       ) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [
        value.repaymentId,
        value.obligationId,
        value.subjectId,
        value.appliedMinor,
        value.assetId,
        remainingMinor,
        value.occurredAt,
        value.schemaVersion,
        value.repaymentHash,
        value.requestedMinor,
        value.appliedMinor,
        value.appliedFeeMinor,
        value.appliedInterestMinor,
        value.appliedPrincipalMinor,
        value.surplusMinor,
        value.remainingPrincipalMinor,
        value.remainingInterestMinor,
        value.remainingFeesMinor,
        value.sourceCode,
        value.actorHash,
        value.accruedInterestMinor,
        value.accrualDays,
        value.ledgerTransactionId,
        value.interestLedgerTransactionId ?? null,
        value.sandboxOnly,
        value.productionFundsMoved
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query("SELECT * FROM repayment_events WHERE id = $1", [value.repaymentId]);
    if (hashId("projection_compare", mapRepayment(existing.rows[0])) !== hashId("projection_compare", value)) {
      throw projectionConflict(CoreProjectionType.REPAYMENT, value.repaymentId);
    }
  }

  async #writeConsentRecord(client, value) {
    const result = await client.query(
      `INSERT INTO consent_records(
         id, consent_hash, terms_hash, data_usage_hash, subject_id,
         principal_id, purposes, allowed_asset_ids,
         allowed_credit_purpose_codes, allowed_repayment_frequencies,
         max_requested_principal_minor, max_requested_term_days,
         max_installment_count, terms_ref, terms_version, data_usage_ref,
         data_usage_version, disclosure_ref, valid_from, expires_at,
         sandbox_only, production_authority, status, revoked_at,
         revocation_reason_code, revocation_evidence_ref, expired_at,
         created_at, updated_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
       )
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             revoked_at = EXCLUDED.revoked_at,
             revocation_reason_code = EXCLUDED.revocation_reason_code,
             revocation_evidence_ref = EXCLUDED.revocation_evidence_ref,
             expired_at = EXCLUDED.expired_at,
             updated_at = EXCLUDED.updated_at
       WHERE consent_records.consent_hash = EXCLUDED.consent_hash
         AND consent_records.terms_hash = EXCLUDED.terms_hash
         AND consent_records.data_usage_hash = EXCLUDED.data_usage_hash
         AND consent_records.subject_id = EXCLUDED.subject_id
         AND consent_records.principal_id = EXCLUDED.principal_id
         AND consent_records.purposes = EXCLUDED.purposes
         AND consent_records.allowed_asset_ids = EXCLUDED.allowed_asset_ids
         AND consent_records.allowed_credit_purpose_codes = EXCLUDED.allowed_credit_purpose_codes
         AND consent_records.allowed_repayment_frequencies = EXCLUDED.allowed_repayment_frequencies
         AND consent_records.max_requested_principal_minor = EXCLUDED.max_requested_principal_minor
         AND consent_records.max_requested_term_days = EXCLUDED.max_requested_term_days
         AND consent_records.max_installment_count = EXCLUDED.max_installment_count
         AND consent_records.terms_ref = EXCLUDED.terms_ref
         AND consent_records.terms_version = EXCLUDED.terms_version
         AND consent_records.data_usage_ref = EXCLUDED.data_usage_ref
         AND consent_records.data_usage_version = EXCLUDED.data_usage_version
         AND consent_records.disclosure_ref = EXCLUDED.disclosure_ref
         AND consent_records.valid_from = EXCLUDED.valid_from
         AND consent_records.expires_at = EXCLUDED.expires_at
         AND consent_records.sandbox_only = EXCLUDED.sandbox_only
         AND consent_records.production_authority = EXCLUDED.production_authority
         AND consent_records.created_at = EXCLUDED.created_at
         AND consent_records.schema_version = EXCLUDED.schema_version
       RETURNING id`,
      [
        value.consentId,
        value.consentHash,
        value.termsHash,
        value.dataUsageHash,
        value.subjectId,
        value.principalId,
        json(value.purposes),
        json(value.allowedAssetIds),
        json(value.allowedCreditPurposeCodes),
        json(value.allowedRepaymentFrequencies),
        value.maxRequestedPrincipalMinor,
        value.maxRequestedTermDays,
        value.maxInstallmentCount,
        value.termsRef,
        value.termsVersion,
        value.dataUsageRef,
        value.dataUsageVersion,
        value.disclosureRef,
        value.validFrom,
        value.expiresAt,
        value.sandboxOnly,
        value.productionAuthority,
        value.status,
        value.revokedAt ?? null,
        value.revocationReasonCode ?? null,
        value.revocationEvidenceRef ?? null,
        value.expiredAt ?? null,
        value.createdAt,
        value.updatedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.CONSENT_RECORD, value.consentId);
    }
  }

  async #writeHumanIdentityReference(client, value) {
    const result = await client.query(
      `INSERT INTO human_identity_references(
         id, identity_reference_hash, reference_evidence_hash, subject_id,
         principal_id, consent_id, consent_hash, reference_type, provider_ref,
         provider_version, reference_ref, assurance_level, purpose_codes,
         valid_from, expires_at, synthetic_only, production_verified, status,
         revoked_at, revocation_reason_code, revocation_evidence_ref, expired_at,
         created_at, updated_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25
       )
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             revoked_at = EXCLUDED.revoked_at,
             revocation_reason_code = EXCLUDED.revocation_reason_code,
             revocation_evidence_ref = EXCLUDED.revocation_evidence_ref,
             expired_at = EXCLUDED.expired_at,
             updated_at = EXCLUDED.updated_at
       WHERE human_identity_references.identity_reference_hash = EXCLUDED.identity_reference_hash
         AND human_identity_references.reference_evidence_hash = EXCLUDED.reference_evidence_hash
         AND human_identity_references.subject_id = EXCLUDED.subject_id
         AND human_identity_references.principal_id = EXCLUDED.principal_id
         AND human_identity_references.consent_id = EXCLUDED.consent_id
         AND human_identity_references.consent_hash = EXCLUDED.consent_hash
         AND human_identity_references.reference_type = EXCLUDED.reference_type
         AND human_identity_references.provider_ref = EXCLUDED.provider_ref
         AND human_identity_references.provider_version = EXCLUDED.provider_version
         AND human_identity_references.reference_ref = EXCLUDED.reference_ref
         AND human_identity_references.assurance_level = EXCLUDED.assurance_level
         AND human_identity_references.purpose_codes = EXCLUDED.purpose_codes
         AND human_identity_references.valid_from = EXCLUDED.valid_from
         AND human_identity_references.expires_at = EXCLUDED.expires_at
         AND human_identity_references.synthetic_only = EXCLUDED.synthetic_only
         AND human_identity_references.production_verified = EXCLUDED.production_verified
         AND human_identity_references.created_at = EXCLUDED.created_at
         AND human_identity_references.schema_version = EXCLUDED.schema_version
       RETURNING id`,
      [
        value.identityReferenceId,
        value.identityReferenceHash,
        value.referenceEvidenceHash,
        value.subjectId,
        value.principalId,
        value.consentId,
        value.consentHash,
        value.referenceType,
        value.providerRef,
        value.providerVersion,
        value.referenceRef,
        value.assuranceLevel,
        json(value.purposeCodes),
        value.validFrom,
        value.expiresAt,
        value.syntheticOnly,
        value.productionVerified,
        value.status,
        value.revokedAt ?? null,
        value.revocationReasonCode ?? null,
        value.revocationEvidenceRef ?? null,
        value.expiredAt ?? null,
        value.createdAt,
        value.updatedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.HUMAN_IDENTITY_REFERENCE, value.identityReferenceId);
    }
  }

  async #writeCreditIntent(client, value) {
    const result = await client.query(
      `INSERT INTO credit_intents(
         id, intent_hash, subject_id, principal_id, authority_type,
         authority_ref, asset_id, requested_principal_minor, purpose_code,
         requested_term_days, repayment_frequency, installment_count,
         sandbox_only, production_funds_requested, status, created_at,
         updated_at, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16, $17, $18
       )
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at
       WHERE credit_intents.intent_hash = EXCLUDED.intent_hash
         AND credit_intents.subject_id = EXCLUDED.subject_id
         AND credit_intents.principal_id = EXCLUDED.principal_id
         AND credit_intents.authority_type = EXCLUDED.authority_type
         AND credit_intents.authority_ref = EXCLUDED.authority_ref
         AND credit_intents.asset_id = EXCLUDED.asset_id
         AND credit_intents.requested_principal_minor = EXCLUDED.requested_principal_minor
         AND credit_intents.purpose_code = EXCLUDED.purpose_code
         AND credit_intents.requested_term_days = EXCLUDED.requested_term_days
         AND credit_intents.repayment_frequency = EXCLUDED.repayment_frequency
         AND credit_intents.installment_count = EXCLUDED.installment_count
         AND credit_intents.sandbox_only = EXCLUDED.sandbox_only
         AND credit_intents.production_funds_requested = EXCLUDED.production_funds_requested
         AND credit_intents.created_at = EXCLUDED.created_at
         AND credit_intents.schema_version = EXCLUDED.schema_version
       RETURNING id`,
      [
        value.creditIntentId,
        value.creditIntentHash,
        value.subjectId,
        value.principalId,
        value.authorityType,
        value.authorityRef,
        value.assetId,
        value.requestedPrincipalMinor,
        value.purposeCode,
        value.requestedTermDays,
        value.repaymentFrequency,
        value.installmentCount,
        value.sandboxOnly,
        value.productionFundsRequested,
        value.status,
        value.createdAt,
        value.updatedAt,
        value.schemaVersion
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.CREDIT_INTENT, value.creditIntentId);
    }
  }

  async #writeCreditOffer(client, value) {
    const result = await client.query(
      `INSERT INTO credit_offers(
         id, offer_hash, terms_hash, credit_intent_id, subject_id,
         risk_decision_id, asset_id, approved_principal_minor,
         annual_rate_bps, origination_fee_minor, repayment_frequency,
         installment_count, first_payment_at, maturity_at, disclosure_ref,
         terms_version, valid_until, reason_codes, sandbox_only,
         production_funds_approved, status, created_at, updated_at,
         schema_version, acceptance_id, accepted_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15, $16,
         $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
       )
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at,
             acceptance_id = EXCLUDED.acceptance_id,
             accepted_at = EXCLUDED.accepted_at
       WHERE credit_offers.offer_hash = EXCLUDED.offer_hash
         AND credit_offers.terms_hash = EXCLUDED.terms_hash
         AND credit_offers.credit_intent_id = EXCLUDED.credit_intent_id
         AND credit_offers.subject_id = EXCLUDED.subject_id
         AND credit_offers.risk_decision_id = EXCLUDED.risk_decision_id
         AND credit_offers.asset_id = EXCLUDED.asset_id
         AND credit_offers.approved_principal_minor = EXCLUDED.approved_principal_minor
         AND credit_offers.annual_rate_bps = EXCLUDED.annual_rate_bps
         AND credit_offers.origination_fee_minor = EXCLUDED.origination_fee_minor
         AND credit_offers.repayment_frequency = EXCLUDED.repayment_frequency
         AND credit_offers.installment_count = EXCLUDED.installment_count
         AND credit_offers.first_payment_at = EXCLUDED.first_payment_at
         AND credit_offers.maturity_at = EXCLUDED.maturity_at
         AND credit_offers.disclosure_ref = EXCLUDED.disclosure_ref
         AND credit_offers.terms_version = EXCLUDED.terms_version
         AND credit_offers.valid_until = EXCLUDED.valid_until
         AND credit_offers.reason_codes = EXCLUDED.reason_codes
         AND credit_offers.sandbox_only = EXCLUDED.sandbox_only
         AND credit_offers.production_funds_approved = EXCLUDED.production_funds_approved
         AND credit_offers.created_at = EXCLUDED.created_at
         AND credit_offers.schema_version = EXCLUDED.schema_version
       RETURNING id`,
      [
        value.creditOfferId,
        value.creditOfferHash,
        value.termsHash,
        value.creditIntentId,
        value.subjectId,
        value.riskDecisionId,
        value.assetId,
        value.approvedPrincipalMinor,
        value.annualRateBps,
        value.originationFeeMinor,
        value.repaymentFrequency,
        value.installmentCount,
        value.firstPaymentAt,
        value.maturityAt,
        value.disclosureRef,
        value.termsVersion,
        value.validUntil,
        json(value.reasonCodes),
        value.sandboxOnly,
        value.productionFundsApproved,
        value.status,
        value.createdAt,
        value.updatedAt,
        value.schemaVersion,
        value.acceptanceId ?? null,
        value.acceptedAt ?? null
      ]
    );
    if (result.rowCount !== 1) {
      throw projectionConflict(CoreProjectionType.CREDIT_OFFER, value.creditOfferId);
    }
  }

  async #writeCreditOfferAcceptance(client, value) {
    const result = await client.query(
      `INSERT INTO credit_offer_acceptances(
         id, acceptance_hash, credit_offer_id, credit_offer_hash, terms_hash,
         credit_intent_id, risk_decision_id, subject_id, principal_id,
         authority_type, authority_ref, consent_id, mandate_id,
         acknowledgement_hash, accepted_by_actor_hash, accepted_at,
         sandbox_only, production_authority, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
       )
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.creditOfferAcceptanceId,
        value.acceptanceHash,
        value.creditOfferId,
        value.creditOfferHash,
        value.termsHash,
        value.creditIntentId,
        value.riskDecisionId,
        value.subjectId,
        value.principalId,
        value.authorityType,
        value.authorityRef,
        value.consentId ?? null,
        value.mandateId ?? null,
        value.acknowledgementHash,
        value.acceptedByActorHash,
        value.acceptedAt,
        value.sandboxOnly,
        value.productionAuthority,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query("SELECT * FROM credit_offer_acceptances WHERE id = $1", [
      value.creditOfferAcceptanceId
    ]);
    if (hashId("projection_compare", mapCreditOfferAcceptance(existing.rows[0])) !==
        hashId("projection_compare", value)) {
      throw projectionConflict(CoreProjectionType.CREDIT_OFFER_ACCEPTANCE, value.creditOfferAcceptanceId);
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
         limit_minor, utilization_minor, action, reasons, created_at, schema_version,
         decision_hash, credit_intent_id, principal_id, authority_type,
         authority_ref, consent_id, sandbox_only, production_authority,
         policy_hash, risk_feature_snapshot_id, feature_snapshot_hash,
         risk_feature_snapshot, decision_passport_id, decision_passport_hash,
         decision_passport
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14,
         COALESCE($15, (SELECT principal_id FROM mandates WHERE id = $3)),
         $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25, $26, $27
       )
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
        value.schemaVersion,
        value.decisionHash ?? null,
        value.creditIntentId ?? null,
        value.principalId ?? null,
        value.authorityType ?? "mandate",
        value.authorityRef ?? value.mandateId,
        value.consentId ?? null,
        value.sandboxOnly ?? true,
        value.productionAuthority ?? false,
        value.policyHash ?? null,
        value.riskFeatureSnapshotId ?? null,
        value.featureSnapshotHash ?? null,
        value.riskFeatureSnapshot ? json(value.riskFeatureSnapshot) : null,
        value.decisionPassport?.riskDecisionPassportId ?? null,
        value.decisionPassport?.decisionPassportHash ?? null,
        value.decisionPassport ? json(value.decisionPassport) : null
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

  async #writePilotFeedbackRecord(client, value) {
    const result = await client.query(
      `INSERT INTO pilot_feedback_records(
         id, feedback_hash, subject_id, entry_mode, surface, lifecycle_stage,
         sentiment, outcome, blocker_code, recorded_at, sandbox_only,
         production_authority, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        value.pilotFeedbackId,
        value.feedbackHash,
        value.subjectId,
        value.entryMode,
        value.surface,
        value.lifecycleStage,
        value.sentiment,
        value.outcome,
        value.blockerCode,
        value.recordedAt,
        value.sandboxOnly,
        value.productionAuthority,
        value.schemaVersion
      ]
    );
    if (result.rowCount === 1) return;
    const existing = await client.query(
      "SELECT * FROM pilot_feedback_records WHERE id = $1",
      [value.pilotFeedbackId]
    );
    if (
      hashId("projection_compare", mapPilotFeedbackRecord(existing.rows[0])) !==
      hashId("projection_compare", value)
    ) {
      throw projectionConflict(
        CoreProjectionType.PILOT_FEEDBACK_RECORD,
        value.pilotFeedbackId
      );
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
