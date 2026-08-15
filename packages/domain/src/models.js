import {
  AccountBindingStatus,
  AccountPurpose,
  CreditEventType,
  CreditLineStatus,
  FinalityStatus,
  LedgerAccountStatus,
  LockboxStatus,
  MandateStatus,
  ObligationStatus,
  PrincipalStatus,
  ProviderStatus,
  RiskTier,
  SpendPolicyStatus,
  SpendRequestStatus,
  SubjectStatus
} from "./enums.js";
import {
  createAccountHash,
  createCashflowRouteHash,
  createObligationHash,
  createOperationalId,
  createPrincipalHash,
  createSpendPolicyHash,
  createSubjectHash,
  hashId
} from "./ids.js";

export function createPrincipal({ principalType, jurisdiction = "global", legalEntityRef, now = new Date() }) {
  const principalHash = createPrincipalHash({ principalType, jurisdiction, legalEntityRef: legalEntityRef ?? null });
  return {
    principalId: createOperationalId("principal"),
    principalHash,
    principalType,
    legalEntityRef,
    jurisdiction,
    responsibilityScope: "full",
    linkedSubjectIds: [],
    status: PrincipalStatus.ACTIVE,
    createdAt: now.toISOString(),
    schemaVersion: "principal.v1"
  };
}

export function createSubject({
  subjectType,
  primaryPrincipalId,
  displayName,
  metadataRef,
  prototypeOnly = false,
  now = new Date()
}) {
  const subjectHash = createSubjectHash({ subjectType, primaryPrincipalId, displayName, metadataRef: metadataRef ?? null });
  return {
    subjectId: createOperationalId("subject"),
    subjectHash,
    subjectType,
    displayName,
    primaryPrincipalId,
    linkedAccountIds: [],
    status: SubjectStatus.PENDING,
    riskTier: "unrated",
    metadataRef,
    prototypeOnly,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    schemaVersion: "subject.v1"
  };
}

export function createWalletAccount({ accountId, purpose = AccountPurpose.PRIMARY, verificationMethod = "eip712", now = new Date() }) {
  return {
    accountId,
    accountHash: createAccountHash(accountId),
    purpose,
    verifiedAt: now.toISOString(),
    verificationMethod,
    status: AccountBindingStatus.ACTIVE,
    schemaVersion: "wallet_account.v1"
  };
}

export function createAccountBinding({ subjectId, account, signatureHash, nonce, now = new Date() }) {
  return {
    accountBindingId: createOperationalId("account_binding"),
    subjectId,
    accountHash: account.accountHash,
    accountIdRef: account.accountId,
    chainId: account.accountId.split(":").slice(0, 2).join(":"),
    purpose: account.purpose,
    signatureHash,
    nonce,
    status: AccountBindingStatus.ACTIVE,
    boundAt: now.toISOString(),
    revokedAt: undefined,
    schemaVersion: "account_binding.v1"
  };
}

export function createMandate({
  principalId,
  subjectId,
  capabilities,
  allowedProviderIds = [],
  allowedCategories = [],
  assetIds,
  perActionLimitMinor,
  aggregateLimitMinor,
  validFrom,
  expiresAt,
  nonce,
  termsRef,
  now = new Date()
}) {
  const termsCore = {
    capabilities,
    allowedProviderIds,
    allowedCategories,
    assetIds,
    perActionLimitMinor,
    aggregateLimitMinor,
    validFrom,
    expiresAt,
    nonce,
    termsRef: termsRef ?? null,
    sandboxOnly: true,
    productionAuthority: false
  };
  const mandateHash = hashId("mandate", {
    principalId,
    subjectId,
    ...termsCore
  });
  return {
    mandateId: createOperationalId("mandate"),
    mandateHash,
    termsHash: hashId("mandate_terms", termsCore),
    principalId,
    subjectId,
    capabilities: [...capabilities],
    allowedProviderIds: [...allowedProviderIds],
    allowedCategories: [...allowedCategories],
    assetIds: [...assetIds],
    perActionLimitMinor,
    aggregateLimitMinor,
    utilizedMinor: "0",
    validFrom,
    expiresAt,
    nonce,
    termsRef,
    sandboxOnly: true,
    productionAuthority: false,
    status: MandateStatus.DRAFT,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    schemaVersion: "mandate.v3"
  };
}

export function createLockbox({ subjectId, chainId, assetId, accountId, now = new Date() }) {
  return {
    lockboxId: createOperationalId("lockbox"),
    lockboxHash: hashId("lockbox", { subjectId, chainId, assetId, accountId }),
    subjectId,
    chainId,
    assetId,
    accountIdRef: accountId,
    status: LockboxStatus.CREATED,
    balanceMinor: "0",
    capturedRevenueMinor: "0",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    schemaVersion: "lockbox.v1"
  };
}

export function createLedgerAccount({ ownerType, ownerId, assetId, accountType, normalSide, now = new Date() }) {
  return {
    ledgerAccountId: createOperationalId("ledger_account"),
    ledgerAccountHash: hashId("ledger_account", { ownerType, ownerId, assetId, accountType }),
    ownerType,
    ownerId,
    assetId,
    accountType,
    normalSide,
    status: LedgerAccountStatus.ACTIVE,
    openedAt: now.toISOString(),
    schemaVersion: "ledger_account.v1"
  };
}

export function createLedgerTransaction({
  idempotencyKey,
  transactionType,
  assetId,
  referenceType,
  referenceId,
  metadata,
  normalizedEntries,
  debitTotalMinor,
  creditTotalMinor,
  now = new Date()
}) {
  const transactionHash = hashId("ledger_transaction", {
    idempotencyKey,
    transactionType,
    assetId,
    referenceType,
    referenceId,
    metadata,
    entries: normalizedEntries
  });
  return {
    ledgerTransactionId: createOperationalId("ledger_transaction"),
    transactionHash,
    idempotencyKey,
    transactionType,
    assetId,
    referenceType,
    referenceId,
    metadata: structuredClone(metadata ?? {}),
    metadataHash: hashId("ledger_metadata", metadata ?? {}),
    debitTotalMinor,
    creditTotalMinor,
    entryCount: normalizedEntries.length,
    postedAt: now.toISOString(),
    schemaVersion: "ledger_transaction.v1"
  };
}

export function createLedgerEntry({ ledgerTransactionId, ledgerAccountId, direction, amountMinor, sequence, now = new Date() }) {
  return {
    ledgerEntryId: createOperationalId("ledger_entry"),
    ledgerTransactionId,
    ledgerAccountId,
    direction,
    amountMinor,
    sequence,
    postedAt: now.toISOString(),
    schemaVersion: "ledger_entry.v1"
  };
}

export function createProvider({ name, settlementAccountId, riskTier = "tier_1", now = new Date() }) {
  return {
    providerId: createOperationalId("provider"),
    providerHash: hashId("provider", { name, settlementAccountId }),
    name,
    settlementAccountIdRef: settlementAccountId,
    status: ProviderStatus.ALLOWLISTED,
    riskTier,
    createdAt: now.toISOString(),
    schemaVersion: "provider.v1"
  };
}

export function createSpendPolicy({
  subjectId,
  providerId,
  assetId,
  perTxLimitMinor,
  dailyLimitMinor,
  obligationCapMinor,
  category = "model_api",
  now = new Date()
}) {
  const spendPolicyHash = createSpendPolicyHash({
    subjectId,
    providerId,
    assetId,
    perTxLimitMinor,
    dailyLimitMinor,
    obligationCapMinor,
    category
  });
  return {
    spendPolicyId: createOperationalId("spend_policy"),
    spendPolicyHash,
    subjectId,
    providerId,
    assetId,
    category,
    perTxLimitMinor,
    dailyLimitMinor,
    obligationCapMinor,
    dailySpentMinor: "0",
    dailySpentDate: now.toISOString().slice(0, 10),
    status: SpendPolicyStatus.ACTIVE,
    createdAt: now.toISOString(),
    schemaVersion: "spend_policy.v1"
  };
}

export function createSpendRequest({
  subjectId,
  mandateId,
  providerId,
  spendPolicyId,
  assetId,
  amountMinor,
  purposeCode,
  now = new Date()
}) {
  return {
    spendRequestId: createOperationalId("spend_request"),
    subjectId,
    mandateId,
    providerId,
    spendPolicyId,
    assetId,
    amountMinor,
    purposeCode,
    status: SpendRequestStatus.REQUESTED,
    rejectionReason: undefined,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    schemaVersion: "spend_request.v1"
  };
}

export function createCreditLine({
  subjectId,
  mandateId,
  assetId,
  limitMinor,
  utilizedMinor = "0",
  riskSnapshotId,
  now = new Date()
}) {
  return {
    creditLineId: createOperationalId("credit_line"),
    subjectId,
    mandateId,
    assetId,
    limitMinor,
    utilizedMinor,
    status: CreditLineStatus.APPROVED,
    riskSnapshotId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    schemaVersion: "credit_line.v1"
  };
}

export function createObligation({
  subjectId,
  principalId,
  mandateId,
  assetId,
  amountMinor,
  dueAt,
  spendPolicyId,
  cashflowRouteId,
  nonce,
  now = new Date()
}) {
  const obligationHash = createObligationHash({
    subjectId,
    principalId,
    mandateId,
    assetId,
    amountMinor,
    dueAt,
    spendPolicyId,
    cashflowRouteId,
    nonce
  });
  return {
    obligationId: createOperationalId("obligation"),
    obligationHash,
    subjectId,
    principalId,
    mandateId,
    assetId,
    principalAmountMinor: amountMinor,
    outstandingPrincipalMinor: amountMinor,
    accruedFeesMinor: "0",
    repaidAmountMinor: "0",
    spendPolicyId,
    cashflowRouteId,
    dueAt,
    status: ObligationStatus.CREATED,
    repaymentPriority: 1,
    attestationIds: [],
    chainExecutions: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    schemaVersion: "obligation.v1"
  };
}

export function createCashflowRoute({ subjectId, lockboxId, minCaptureRatioBps = 9000 }) {
  return {
    cashflowRouteId: createCashflowRouteHash({ subjectId, lockboxId, routeType: "agent_lockbox" }),
    subjectId,
    lockboxId,
    routeType: "agent_lockbox",
    minCaptureRatioBps,
    lookbackDays: 30,
    status: "active",
    schemaVersion: "cashflow_route.v1"
  };
}

export function createRepayment({ obligationId, subjectId, assetId, amountMinor, remainingMinor, now = new Date() }) {
  return {
    repaymentId: createOperationalId("repayment"),
    obligationId,
    subjectId,
    assetId,
    amountMinor,
    remainingMinor,
    occurredAt: now.toISOString(),
    schemaVersion: "repayment.v1"
  };
}

export function createRiskDecision({
  subjectId,
  mandateId,
  assetId,
  status,
  limitMinor,
  utilizationMinor = "0",
  action,
  reasons,
  now = new Date()
}) {
  return {
    riskDecisionId: createOperationalId("risk_decision"),
    subjectId,
    mandateId,
    assetId,
    status,
    modelVersion: "risk-rules-v0",
    limitMinor,
    utilizationMinor,
    action,
    reasons,
    createdAt: now.toISOString(),
    schemaVersion: "risk_decision.v1"
  };
}

export function createCreditScore({ score = 500, previousScore = 500, maxScore = 850, minScore = 300, now = new Date() } = {}) {
  return {
    creditScoreId: createOperationalId("credit_score"),
    score,
    previousScore,
    minScore,
    maxScore,
    updatedAt: now.toISOString(),
    schemaVersion: "credit_score.v1"
  };
}

export function createCreditProfile({ subjectId, initialScore = 500, currentCreditLimitMinor = "0", now = new Date() }) {
  const riskTier = tierForScore(initialScore);
  return {
    creditProfileId: createOperationalId("credit_profile"),
    subjectId,
    currentScore: initialScore,
    riskTier,
    currentCreditLimitMinor,
    recommendedNextCreditLimitMinor: currentCreditLimitMinor,
    currentDemoInterestRateBps: demoInterestRateForTier(riskTier),
    recommendedDemoInterestRateBps: demoInterestRateForTier(riskTier),
    repaymentPerformanceBps: 0,
    utilizationBehaviorBps: 0,
    revenueConsistencyBps: 0,
    recentSignalIds: [],
    scoreHistory: [{ score: initialScore, riskTier, reasonCode: "initial_profile", occurredAt: now.toISOString() }],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    schemaVersion: "credit_profile.v1"
  };
}

export function createBehavioralMetric({ subjectId, metricType, value, unit = "bps", cycleType = "manual", now = new Date() }) {
  return {
    behavioralMetricId: createOperationalId("behavioral_metric"),
    subjectId,
    metricType,
    value,
    unit,
    cycleType,
    occurredAt: now.toISOString(),
    schemaVersion: "behavioral_metric.v1"
  };
}

export function createReputationSignal({
  subjectId,
  signalType,
  scoreDelta,
  previousScore,
  newScore,
  reasonCode,
  relatedEventId,
  cycleType = "manual",
  now = new Date()
}) {
  return {
    reputationSignalId: createOperationalId("reputation_signal"),
    subjectId,
    signalType,
    scoreDelta,
    previousScore,
    newScore,
    reasonCode,
    relatedEventId,
    cycleType,
    occurredAt: now.toISOString(),
    schemaVersion: "reputation_signal.v1"
  };
}

export function createCreditLimitRecommendation({ subjectId, riskTier, currentLimitMinor, recommendedLimitMinor, reasonCode, now = new Date() }) {
  return {
    creditLimitRecommendationId: createOperationalId("credit_limit_recommendation"),
    subjectId,
    riskTier,
    currentLimitMinor,
    recommendedLimitMinor,
    reasonCode,
    occurredAt: now.toISOString(),
    schemaVersion: "credit_limit_recommendation.v1"
  };
}

export function createInterestRateRecommendation({
  subjectId,
  riskTier,
  currentDemoInterestRateBps,
  recommendedDemoInterestRateBps,
  reasonCode,
  now = new Date()
}) {
  return {
    interestRateRecommendationId: createOperationalId("interest_rate_recommendation"),
    subjectId,
    riskTier,
    currentDemoInterestRateBps,
    recommendedDemoInterestRateBps,
    reasonCode,
    occurredAt: now.toISOString(),
    schemaVersion: "interest_rate_recommendation.v1"
  };
}

export function createCreditLearningEvent({ subjectId, cycleType, score, riskTier, signalIds, reasonCodes, now = new Date() }) {
  return {
    creditLearningEventId: createOperationalId("credit_learning_event"),
    subjectId,
    cycleType,
    score,
    riskTier,
    signalIds,
    reasonCodes,
    occurredAt: now.toISOString(),
    schemaVersion: "credit_learning_event.v1"
  };
}

export function tierForScore(score) {
  if (score >= 750) return RiskTier.PRIME;
  if (score >= 650) return RiskTier.STRONG;
  if (score >= 550) return RiskTier.STANDARD;
  if (score >= 450) return RiskTier.WATCH;
  return RiskTier.RESTRICTED;
}

export function demoInterestRateForTier(riskTier) {
  return {
    [RiskTier.PRIME]: 800,
    [RiskTier.STRONG]: 1200,
    [RiskTier.STANDARD]: 1800,
    [RiskTier.WATCH]: 2800,
    [RiskTier.RESTRICTED]: null
  }[riskTier];
}

export function createCreditEvent({
  eventType,
  subjectId,
  obligationId,
  payload,
  chainId,
  txHash,
  blockNumber,
  finalityStatus = FinalityStatus.FINALIZED,
  now = new Date()
}) {
  return {
    eventId: createOperationalId("credit_event"),
    eventType,
    subjectId,
    obligationId,
    chainId,
    txHash,
    blockNumber,
    finalityStatus,
    payloadHash: hashId("event_payload", payload ?? {}),
    payload,
    occurredAt: now.toISOString(),
    schemaVersion: "event.v1"
  };
}

export function createAuditEvent({ actorId, actionType, targetType, targetId, reason, payload = {}, now = new Date() }) {
  return {
    auditEventId: createOperationalId("audit_event"),
    actorId,
    actionType,
    targetType,
    targetId,
    reason,
    payloadHash: hashId("audit_payload", payload),
    payload,
    occurredAt: now.toISOString(),
    schemaVersion: "audit_event.v1"
  };
}

export function createAdminAction({ adminId, actionType, targetType, targetId, reason, now = new Date() }) {
  return {
    adminActionId: createOperationalId("admin_action"),
    adminId,
    actionType,
    targetType,
    targetId,
    reason,
    createdAt: now.toISOString(),
    schemaVersion: "admin_action.v1"
  };
}

export { CreditEventType };
