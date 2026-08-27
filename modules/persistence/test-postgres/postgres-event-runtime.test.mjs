import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  AccountPurpose,
  ConsentPurpose,
  ConsentStatus,
  CreditAuthorityType,
  CreditEventType,
  CreditIntentStatus,
  CreditLineStatus,
  CreditOfferStatus,
  HumanIdentityAssurance,
  HumanIdentityReferenceStatus,
  HumanIdentityReferenceType,
  LedgerAccountType,
  LedgerEntryDirection,
  LedgerNormalSide,
  LockboxStatus,
  MandateCapability,
  MandateStatus,
  ObligationStatus,
  PrincipalType,
  RepaymentFrequency,
  RiskAction,
  SettlementFinality,
  SettlementOutcome,
  SubjectStatus,
  SubjectType,
  TransferDirection,
  TradingOrderDirection,
  acceptCreditOffer,
  acceptTradingMatchAsProvider,
  acceptTradingMatchAsSubject,
  activateTradingFacility,
  contributeTradingSubjectCollateral,
  createAccountBinding,
  createAcceptedOfferObligation,
  createAdminAction,
  createConsentRecord,
  createCreditOfferAcceptance,
  createCreditIntent,
  createCreditLine,
  createCreditEvent,
  createCreditOffer,
  createDeterministicCreditDecisionOutcome,
  createHumanIdentityReference,
  createLedgerAccount,
  createLedgerEntry,
  createLedgerTransaction,
  createLockbox,
  createMandate,
  createObligation,
  createPrincipal,
  createProvider,
  createRealTradingAccountBindingChallenge,
  createRiskDecision,
  createSpendPolicy,
  createSpendRequest,
  createSubject,
  createTradingAccountBindingChallenge,
  createTradingCapitalRequest,
  createTradingFacility,
  createTradingMatchProposal,
  createTradingProviderMandate,
  evaluateTradingFacilityRisk,
  executeSandboxObligation,
  finalizeTradingEvidenceSnapshot,
  finalizeRealTradingEvidenceSnapshot,
  flattenTradingFacility,
  importSyntheticTradingHistory,
  importRealTradingHistory,
  listCompatibleTradingProviderMandates,
  pauseTradingFacilityNewRisk,
  recordTradingProviderFunding,
  requestTradingFacilityClose,
  createWalletAccount,
  hashId,
  revokeConsentRecord,
  revokeHumanIdentityReference,
  submitTradingOrderIntent
} from "../../../packages/domain/src/index.js";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "../../authentication/src/index.js";
import { createAuthenticationContext } from "../../authentication/src/authentication-context.js";
import {
  AbuseControlService,
  AdmissionDisposition,
  AdmissionOutcome,
  PostgresQuotaStore,
  abuseHash
} from "../../abuse-control/src/index.js";
import {
  PilotCapability,
  RoleBundle
} from "../../authorization/src/index.js";
import {
  FIXED_NOW as AUTHORIZATION_FIXED_NOW,
  authorizationRequest,
  createAuthorizationHarness
} from "../../authorization/test/support/authorization-fixture.js";
import {
  ApprovalDecisionValue,
  ApprovalProposalStatus,
  ApprovalService,
  BreakGlassIncidentStatus,
  BreakGlassReviewStatus,
  BreakGlassService,
  createBreakGlassRuntimeConfig
} from "../../approval/src/index.js";
import {
  PostgresAgenticExecutionPreflightRepository,
  PostgresAgenticExecutionRepository,
  constructExactEvmPayload,
  createExecutionTargetPolicy,
  createPendingExposureReservation,
  createSimulationReport,
  evaluateTransactionPreflight,
  normalizeExecutionEffects
} from "../../agentic-execution/src/index.js";
import { RailService, SandboxRailAdapter } from "../../rail/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  SandboxChainAdapter
} from "../../chain-adapter/src/index.js";
import {
  LiveChainIndexer,
  PostgresChainObservationStore,
  PostgresCreditRegistryObservationStore,
  calculateCreditRegistryObservationHash
} from "../../event-indexer/src/index.js";
import {
  HyperliquidTestnetExecutionGateway,
  PostgresHyperliquidExecutionRepository,
  SimulatedHyperliquidExchangeTransport,
  SimulatedIsolatedHyperliquidSigner
} from "../../hyperliquid-execution/src/index.js";
import {
  HypercoreExecutionActionKind,
  HypercoreDelegateStatus,
  PostgresHypercoreDelegateRepository,
  PostgresHypercoreTestnetSubmissionRepository,
  authorizeHypercoreTestnetAction,
  compileHypercoreExecutionAction,
  createHypercoreAccountBinding,
  createHypercoreTestnetFounderApproval,
  createHypercoreTestnetProofPolicy,
  createHypercoreTestnetSignerHandoff,
  founderApprovalHumanConfirmation,
  retireHypercoreTestnetSignerHandoff
} from "../../hypercore-venue-adapter/src/index.js";
import {
  HYPERLIQUID_TESTNET_RISK_POLICY_VERSION,
  HyperliquidTestnetRiskGuardian,
  PostgresHyperliquidRiskGuardianRepository,
  SimulatedHyperliquidProtectiveExecutor,
  createHyperliquidTestnetRiskSnapshot,
  createHyperliquidTestnetVenueState
} from "../../hyperliquid-risk-guardian/src/index.js";
import {
  HyperliquidTestnetReconciliationService,
  HyperliquidVenueOrderStatus,
  PostgresHyperliquidReconciliationRepository,
  ScriptedHyperliquidVenueObservationAdapter,
  SimulatedHyperliquidReconciliationCommandGuard,
  SimulatedHyperliquidReconciliationKernelResolver,
  createSimulatedHyperliquidVenueObservation
} from "../../hyperliquid-reconciliation/src/index.js";
import {
  HyperliquidTestnetContributionReceiptKind,
  HyperliquidTestnetContributionRole,
  HyperliquidTestnetFacilityFundingService,
  PostgresHyperliquidFacilityFundingRepository,
  ScriptedHyperliquidContributionReceiptAdapter,
  SimulatedHyperliquidFacilityFundingCommandGuard,
  SimulatedHyperliquidFacilityFundingKernelResolver,
  createSimulatedTestnetContributionReceipt
} from "../../hyperliquid-facility-funding/src/index.js";
import {
  HyperliquidTestnetSettlementService,
  PostgresHyperliquidSettlementRepository,
  ScriptedHyperliquidFeePolicyAdapter,
  ScriptedHyperliquidFinalityObservationAdapter,
  SimulatedHyperliquidSettlementCommandGuard,
  SimulatedHyperliquidSettlementKernelResolver,
  createSimulatedTestnetFeePolicy,
  createSimulatedTestnetFinalityObservation
} from "../../hyperliquid-settlement/src/index.js";
import { migrateDown, migrateUp, migrationStatus } from "../../../scripts/migrate.mjs";
import {
  CoreProjectionType,
  PostgresCoreRepository,
  PostgresEventRepository,
  PostgresReconciliationService,
  assertTenantDatabaseRole,
  createTenantSecurityContext,
  createPostgresPool,
  setTenantTransactionContext
} from "../src/index.js";

const CONNECTION_STRING = process.env.DATABASE_URL;
const FIXED_NOW = new Date("2026-07-11T00:00:00.000Z");
const ABUSE_RATE_WINDOW_MS = 60_000;
const ABUSE_RATE_TEST_RUNWAY_MS = 5_000;
const ASSET = { assetId: "asset:demo-usd", scale: 2 };
const PROVIDER_ACCOUNT = "eip155:8453:0x3333333333333333333333333333333333333333";
const TENANT_CONTEXT = createTenantSecurityContext({
  tenantId: "tenant_ipo_one_local_pilot",
  actorId: "actor_local_system",
  policyVersion: "security_001.v1",
  source: "local_test"
});
const TENANT_TWO_CONTEXT = createTenantSecurityContext({
  tenantId: "tenant_ipo_one_test_two",
  actorId: "actor_tenant_two_system",
  policyVersion: "security_001.v1",
  source: "local_test"
});

function creditRegistryObservationFixture() {
  const observation = {
    chainId: "eip155:84532",
    providerSlot: "primary",
    contractAddress: "0x1111111111111111111111111111111111111111",
    authorizationHash: hashId("pg_credit_registry_authorization", "one"),
    accountReferenceHash: hashId(
      "pg_credit_registry_account_reference",
      "one"
    ),
    subjectAccountHash: hashId("pg_credit_registry_subject", "one"),
    acceptedOfferHash: hashId("pg_credit_registry_offer", "one"),
    policyHash: hashId("pg_credit_registry_policy", "one"),
    providerScopeHash: hashId("pg_credit_registry_provider", "one"),
    finalCreditStateHash: hashId("pg_credit_registry_credit_state", "repaid"),
    finalObligationProofHash: hashId(
      "pg_credit_registry_obligation_proof",
      "settled"
    ),
    validUntil: "2026-07-28T13:11:00.000Z",
    finalStatus: "closed",
    finalVersion: 3,
    registryPaused: true,
    authorizationActive: false,
    transactions: [
      ["publication", "one", "44734260", "one"],
      ["proof_update", "two", "44734583", "two"],
      ["close", "three", "44734585", "three"],
      ["pause", "four", "44734587", "four"]
    ].map(([kind, transaction, blockNumber, blockValue], index) => ({
      kind,
      transactionHash: hashId(
        "pg_credit_registry_transaction",
        transaction
      ),
      blockNumber,
      blockHash: hashId("pg_credit_registry_block", blockValue),
      transactionIndex: "0",
      eventOrdinal: "0",
      observationStatus: "safe",
      confirmations: 12 - index
    })),
    safeBlock: {
      number: "44734636",
      hash: hashId("pg_credit_registry_safe_block", "one")
    },
    finalizedBlock: {
      number: "44734600",
      hash: hashId("pg_credit_registry_finalized_block", "one")
    },
    finalityProofHash: hashId("pg_credit_registry_finality", "one"),
    observedAt: "2026-07-28T12:00:00.000Z",
    readOnly: true,
    liveTestnetObservation: true,
    rawAccountPersisted: false,
    rawProviderPayloadPersisted: false,
    syntheticOnly: true,
    productionFundsMoved: false,
    schemaVersion: "credit_registry_live_observation.v1"
  };
  observation.observationHash =
    calculateCreditRegistryObservationHash(observation);
  return observation;
}

const TENANT_OWNED_TABLES = [
  "abuse_admissions",
  "abuse_capacity_buckets",
  "abuse_command_charges",
  "abuse_rate_buckets",
  "access_grants",
  "account_bindings",
  "admin_actions",
  "agent_account_challenges",
  "agent_account_proof_attempts",
  "agent_dual_risk_incident_transitions",
  "agent_dual_risk_incidents",
  "agent_hyperliquid_composition_transitions",
  "agent_hyperliquid_compositions",
  "agent_secured_facility_authorizations",
  "aggregate_stream_heads",
  "approval_decisions",
  "approval_executions",
  "approval_proposals",
  "authentication_credentials",
  "authentication_events",
  "authentication_oidc_transactions",
  "authentication_replay_entries",
  "authentication_role_enrollments",
  "authentication_session_invalidations",
  "authentication_sessions",
  "authentication_wallet_transactions",
  "authorization_audit_events",
  "authorization_resource_bindings",
  "authorization_resources",
  "behavioral_metrics",
  "break_glass_custodian_decisions",
  "break_glass_incidents",
  "break_glass_reviews",
  "capital_partner_profiles",
  "command_events",
  "command_idempotency",
  "consent_records",
  "credit_events",
  "credit_intents",
  "credit_learning_events",
  "credit_lines",
  "credit_offer_acceptances",
  "credit_offers",
  "credit_outcomes",
  "credit_passport_artifacts",
  "credit_profiles",
  "credit_registry_chain_observations",
  "credit_registry_chain_outbox_messages",
  "credit_state_projections",
  "delegated_wallet_grant_target_policies",
  "delegated_wallet_grant_transitions",
  "delegated_wallet_grants",
  "delegated_wallet_pending_exposures",
  "domain_events",
  "evidence_chain_anchor_binding_repairs",
  "evidence_chain_anchor_observations",
  "evidence_chain_anchors",
  "evidence_envelopes",
  "execution_account_binding_challenges",
  "execution_account_binding_proof_attempts",
  "execution_target_policies",
  "human_identity_references",
  "hypercore_account_bindings",
  "hypercore_api_wallet_delegates",
  "hypercore_delegate_tombstones",
  "hypercore_jit_venue_preflight_receipts",
  "hypercore_stable_execution_intents",
  "hypercore_stable_execution_transitions",
  "hypercore_stable_founder_approvals",
  "hypercore_testnet_founder_approvals",
  "hypercore_testnet_nonce_heads",
  "hypercore_testnet_signer_handoffs",
  "hypercore_testnet_submission_attempts",
  "hypercore_testnet_submission_transitions",
  "inbox_messages",
  "ledger_accounts",
  "ledger_entries",
  "ledger_transactions",
  "live_chain_indexer_snapshots",
  "live_chain_observations",
  "live_chain_outbox_messages",
  "lockboxes",
  "mandate_releases",
  "mandate_reservations",
  "mandates",
  "memberships",
  "obligation_installments",
  "obligations",
  "official_report_artifacts",
  "operational_alert_occurrences",
  "operational_alerts",
  "operational_synthetic_runs",
  "outbox_messages",
  "pilot_feedback_records",
  "pool_chain_cursors",
  "pool_chain_finalized_effects",
  "pool_chain_observations",
  "pool_chain_outbox_messages",
  "pool_execution_receipts",
  "pool_obligation_bindings",
  "pool_obligation_effect_receipts",
  "pool_obligation_projections",
  "pool_reconciliation_discrepancies",
  "pool_reconciliation_evidence",
  "pool_reconciliation_runs",
  "pool_risk_control_transitions",
  "pool_risk_controls",
  "principals",
  "projection_registry",
  "projection_replay_jobs",
  "projection_snapshots",
  "provider_callback_inbox",
  "provider_intent_acknowledgements",
  "provider_intent_deliveries",
  "providers",
  "reconciliation_discrepancies",
  "reconciliation_runs",
  "repayment_events",
  "reputation_signals",
  "risk_decisions",
  "sandbox_execution_receipts",
  "sandbox_servicing_actions",
  "settlement_receipts",
  "spend_policies",
  "spend_requests",
  "subjects",
  "tenant_command_executions",
  "tenant_command_pauses",
  "trading_capital_requests",
  "trading_credit_profiles",
  "trading_execution_nonce_heads",
  "trading_facilities",
  "trading_facility_close_requests",
  "trading_facility_risk_evaluations",
  "trading_match_proposals",
  "trading_order_intents",
  "trading_performance_proofs",
  "trading_provider_mandates",
  "trading_settlements",
  "trading_testnet_execution_records",
  "trading_testnet_execution_transitions",
  "trading_testnet_facility_funding_controls",
  "trading_testnet_protective_controls",
  "trading_testnet_protective_transitions",
  "trading_testnet_reconciliation_runs",
  "trading_testnet_settlement_runs",
  "transfer_intents",
  "transfer_quotes",
  "wallet_prepared_executions",
  "wallet_simulation_reports",
  "wallet_transaction_preflight_receipts",
  "workspace_continuation_receipts"
];

async function withTenantTransaction(pool, context, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantTransactionContext(client, context);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original test failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

function createTestEvent({ eventType = "integration_test_event", subjectId = "subject_pg_test", payload = {}, now = FIXED_NOW } = {}) {
  return createCreditEvent({ eventType, subjectId, payload, now });
}

async function resetRuntime(pool) {
  await pool.query(`
    TRUNCATE TABLE
      outbox_messages,
      inbox_messages,
      command_idempotency,
      domain_events,
      aggregate_stream_heads,
      evidence_envelopes,
      credit_events
    RESTART IDENTITY CASCADE
  `);
}

async function runtimeCounts(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM command_idempotency) AS commands,
      (SELECT count(*)::int FROM domain_events) AS events,
      (SELECT count(*)::int FROM evidence_envelopes) AS evidence,
      (SELECT count(*)::int FROM evidence_chain_anchors) AS anchors,
      (SELECT count(*)::int FROM credit_events) AS credit_events,
      (SELECT count(*)::int FROM outbox_messages) AS outbox,
      (SELECT count(*)::int FROM aggregate_stream_heads) AS stream_heads
  `);
  return result.rows[0];
}

async function resetCoreRuntime(pool) {
  await pool.query(`
    TRUNCATE TABLE
      break_glass_reviews,
      break_glass_custodian_decisions,
      break_glass_incidents,
      approval_executions,
      approval_decisions,
      approval_proposals,
      projection_replay_jobs,
      reconciliation_discrepancies,
      reconciliation_runs,
      projection_registry,
      projection_snapshots,
      command_events,
      human_identity_references,
      consent_records,
      agent_account_proof_attempts,
      obligation_installments,
      credit_offer_acceptances,
      credit_offers,
      credit_intents,
      risk_decisions,
      admin_actions,
      repayment_events,
      obligations,
      credit_lines,
      lockboxes,
      ledger_entries,
      ledger_transactions,
      ledger_accounts,
      spend_requests,
      spend_policies,
      providers,
      account_bindings,
      agent_account_challenges,
      mandates,
      subjects,
      principals,
      outbox_messages,
      inbox_messages,
      command_idempotency,
      domain_events,
      aggregate_stream_heads,
      evidence_envelopes,
      credit_events
    RESTART IDENTITY CASCADE
  `);
}

async function resetAbuseRuntime(pool) {
  await pool.query(`
    TRUNCATE TABLE
      abuse_command_charges,
      abuse_admissions,
      abuse_capacity_buckets,
      abuse_rate_buckets
    RESTART IDENTITY CASCADE
  `);
}

async function waitForAbuseRateWindowRunway(pool) {
  const result = await pool.query(
    "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms"
  );
  const nowMs = Number(result.rows[0]?.now_ms);
  assert.equal(Number.isSafeInteger(nowMs), true);
  const remainingMs = ABUSE_RATE_WINDOW_MS - (nowMs % ABUSE_RATE_WINDOW_MS);
  if (remainingMs < ABUSE_RATE_TEST_RUNWAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs + 25));
  }
}

function createAbuseAuthenticationContext(actorId) {
  return createAuthenticationContext({
    tenantId: TENANT_CONTEXT.tenantId,
    actorId,
    actorType: ActorType.AGENT,
    clientId: `client_${actorId}`,
    credentialId: `credential_${actorId}`,
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: ["credit.request"],
    roles: ["agent"],
    tokenJtiHash: abuseHash("postgres_test_token", { actorId }),
    authenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraintMethod: SenderConstraintMethod.DPOP,
    authenticatedAt: new Date(),
    amr: []
  });
}

function buildCoreFixture() {
  const now = FIXED_NOW;
  const principal = createPrincipal({ principalType: PrincipalType.DEVELOPER, jurisdiction: "US", now });
  const subject = {
    ...createSubject({
      subjectType: SubjectType.AGENT,
      primaryPrincipalId: principal.principalId,
      displayName: "Durable Pilot Agent",
      now
    }),
    status: SubjectStatus.ACTIVE
  };
  const walletAccount = createWalletAccount({
    accountId: "eip155:8453:0x1111111111111111111111111111111111111111",
    purpose: AccountPurpose.EXECUTION,
    verificationMethod: "verified_signature",
    now
  });
  const accountBinding = createAccountBinding({
    subjectId: subject.subjectId,
    account: walletAccount,
    signatureHash: hashId("signature", { fixture: "durable-account-binding" }),
    nonce: "durable-account-binding-1",
    now
  });
  const provider = createProvider({
    name: "Durable Compute Provider",
    settlementAccountId: PROVIDER_ACCOUNT,
    riskTier: "tier_1",
    now
  });
  const mandate = {
    ...createMandate({
      principalId: principal.principalId,
      subjectId: subject.subjectId,
      capabilities: Object.values(MandateCapability),
      allowedProviderIds: [provider.providerId],
      allowedCategories: ["compute"],
      assetIds: [ASSET.assetId],
      perActionLimitMinor: "100000",
      aggregateLimitMinor: "500000",
      validFrom: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86400_000).toISOString(),
      nonce: "durable-mandate-1",
      termsRef: "urn:ipo.one:test:durable-mandate:v1",
      now
    }),
    status: MandateStatus.ACTIVE
  };
  const creditIntent = createCreditIntent({
    subjectId: subject.subjectId,
    principalId: principal.principalId,
    authorityType: CreditAuthorityType.MANDATE,
    authorityRef: mandate.mandateId,
    assetId: ASSET.assetId,
    requestedPrincipalMinor: "250000",
    purposeCode: "provider_working_capital",
    requestedTermDays: 90,
    repaymentFrequency: RepaymentFrequency.MONTHLY,
    installmentCount: 3,
    now
  });
  const spendPolicy = createSpendPolicy({
    subjectId: subject.subjectId,
    providerId: provider.providerId,
    assetId: ASSET.assetId,
    perTxLimitMinor: "100000",
    dailyLimitMinor: "250000",
    obligationCapMinor: "100000",
    category: "compute",
    now
  });
  const spendRequest = {
    ...createSpendRequest({
      subjectId: subject.subjectId,
      mandateId: mandate.mandateId,
      providerId: provider.providerId,
      spendPolicyId: spendPolicy.spendPolicyId,
      assetId: ASSET.assetId,
      amountMinor: "10000",
      purposeCode: "compute",
      now
    }),
    status: "approved"
  };
  mandate.utilizedMinor = spendRequest.amountMinor;
  spendPolicy.dailySpentMinor = spendRequest.amountMinor;
  const reservation = {
    reservationId: spendRequest.spendRequestId,
    reservationHash: hashId("mandate_reservation", {
      mandateId: mandate.mandateId,
      reservationId: spendRequest.spendRequestId,
      subjectId: subject.subjectId,
      capability: MandateCapability.PROVIDER_SPEND,
      providerId: provider.providerId,
      category: "compute",
      assetId: ASSET.assetId,
      amountMinor: spendRequest.amountMinor
    }),
    mandateId: mandate.mandateId,
    subjectId: subject.subjectId,
    capability: MandateCapability.PROVIDER_SPEND,
    providerId: provider.providerId,
    category: "compute",
    assetId: ASSET.assetId,
    amountMinor: spendRequest.amountMinor,
    releasedMinor: "0",
    createdAt: now.toISOString(),
    schemaVersion: "mandate_reservation.v1"
  };
  const baseLockbox = createLockbox({
    subjectId: subject.subjectId,
    chainId: "eip155:8453",
    assetId: ASSET.assetId,
    accountId: "eip155:8453:0x2222222222222222222222222222222222222222",
    now
  });
  const lockboxAccount = createLedgerAccount({
    ownerType: "lockbox",
    ownerId: baseLockbox.lockboxId,
    assetId: ASSET.assetId,
    accountType: LedgerAccountType.LOCKBOX_ASSET,
    normalSide: LedgerNormalSide.DEBIT,
    now
  });
  const revenueAccount = createLedgerAccount({
    ownerType: "system",
    ownerId: "external_revenue",
    assetId: ASSET.assetId,
    accountType: LedgerAccountType.EXTERNAL_REVENUE,
    normalSide: LedgerNormalSide.CREDIT,
    now
  });
  const repaymentAccount = createLedgerAccount({
    ownerType: "system",
    ownerId: "repayment_clearing",
    assetId: ASSET.assetId,
    accountType: LedgerAccountType.REPAYMENT_CLEARING,
    normalSide: LedgerNormalSide.DEBIT,
    now
  });
  const lockbox = {
    ...baseLockbox,
    status: LockboxStatus.ACTIVE,
    ledgerAccountId: lockboxAccount.ledgerAccountId,
    revenueLedgerAccountId: revenueAccount.ledgerAccountId,
    repaymentLedgerAccountId: repaymentAccount.ledgerAccountId
  };
  const normalizedEntries = [
    { ledgerAccountId: lockboxAccount.ledgerAccountId, direction: LedgerEntryDirection.DEBIT, amountMinor: "10000", sequence: 0 },
    { ledgerAccountId: revenueAccount.ledgerAccountId, direction: LedgerEntryDirection.CREDIT, amountMinor: "10000", sequence: 1 }
  ];
  const ledgerTransaction = createLedgerTransaction({
    idempotencyKey: "durable-ledger-capture-1",
    transactionType: "lockbox_revenue_capture",
    assetId: ASSET.assetId,
    referenceType: "lockbox",
    referenceId: lockbox.lockboxId,
    metadata: { source: "postgres_test" },
    normalizedEntries,
    debitTotalMinor: "10000",
    creditTotalMinor: "10000",
    now
  });
  ledgerTransaction.entries = normalizedEntries.map((entry) =>
    createLedgerEntry({
      ledgerTransactionId: ledgerTransaction.ledgerTransactionId,
      ledgerAccountId: entry.ledgerAccountId,
      direction: entry.direction,
      amountMinor: entry.amountMinor,
      sequence: entry.sequence,
      now
    })
  );
  const riskDecision = createRiskDecision({
    subjectId: subject.subjectId,
    mandateId: mandate.mandateId,
    assetId: ASSET.assetId,
    status: CreditLineStatus.APPROVED,
    limitMinor: "500000",
    action: RiskAction.NONE,
    reasons: [{ code: "approved_by_rules_v0", message: "test fixture" }],
    now
  });
  const creditOffer = createCreditOffer({
    creditIntentId: creditIntent.creditIntentId,
    subjectId: subject.subjectId,
    riskDecisionId: riskDecision.riskDecisionId,
    assetId: ASSET.assetId,
    approvedPrincipalMinor: "250000",
    annualRateBps: 1800,
    originationFeeMinor: "2500",
    repaymentFrequency: RepaymentFrequency.MONTHLY,
    installmentCount: 3,
    firstPaymentAt: new Date(now.getTime() + 30 * 86400_000).toISOString(),
    maturityAt: new Date(now.getTime() + 90 * 86400_000).toISOString(),
    validUntil: new Date(now.getTime() + 86400_000).toISOString(),
    reasonCodes: ["sandbox_policy_approved", "capacity_available"],
    disclosureRef: "urn:ipo.one:sandbox:credit-terms:v1",
    now
  });
  const creditLine = createCreditLine({
    subjectId: subject.subjectId,
    mandateId: mandate.mandateId,
    assetId: ASSET.assetId,
    limitMinor: "500000",
    utilizedMinor: spendRequest.amountMinor,
    riskSnapshotId: riskDecision.riskDecisionId,
    now
  });
  const obligation = {
    ...createObligation({
      subjectId: subject.subjectId,
      principalId: principal.principalId,
      mandateId: mandate.mandateId,
      assetId: ASSET.assetId,
      amountMinor: "10000",
      dueAt: new Date(now.getTime() + 86400_000).toISOString(),
      spendPolicyId: spendPolicy.spendPolicyId,
      cashflowRouteId: `route_${lockbox.lockboxId}`,
      nonce: spendRequest.spendRequestId,
      now
    }),
    status: ObligationStatus.ACTIVE
  };
  const adminAction = createAdminAction({
    adminId: "system:test",
    actionType: "pilot_fixture_created",
    targetType: "subject",
    targetId: subject.subjectId,
    reason: "postgres durability verification",
    now
  });

  const events = [
    {
      aggregateType: "principal",
      aggregateId: principal.principalId,
      expectedVersion: 0,
      event: createTestEvent({
        eventType: "principal_created",
        payload: { principalId: principal.principalId },
        now
      })
    },
    {
      aggregateType: "subject",
      aggregateId: subject.subjectId,
      expectedVersion: 0,
      event: createTestEvent({
        eventType: "subject_created",
        subjectId: subject.subjectId,
        payload: { subjectId: subject.subjectId, principalId: principal.principalId },
        now
      })
    },
    {
      aggregateType: "subject",
      aggregateId: subject.subjectId,
      expectedVersion: 1,
      event: createTestEvent({
        eventType: "pilot_control_plane_initialized",
        subjectId: subject.subjectId,
        payload: { subjectId: subject.subjectId, lockboxId: lockbox.lockboxId },
        now
      })
    }
  ];
  const sourceEventId = events[2].event.eventId;
  const writes = [
    { type: CoreProjectionType.PRINCIPAL, value: principal, eventId: events[0].event.eventId },
    { type: CoreProjectionType.SUBJECT, value: subject, eventId: events[1].event.eventId },
    { type: CoreProjectionType.ACCOUNT_BINDING, value: accountBinding, eventId: sourceEventId },
    { type: CoreProjectionType.PROVIDER, value: provider, eventId: sourceEventId },
    { type: CoreProjectionType.MANDATE, value: mandate, eventId: sourceEventId },
    { type: CoreProjectionType.CREDIT_INTENT, value: creditIntent, eventId: sourceEventId },
    { type: CoreProjectionType.MANDATE_RESERVATION, value: reservation, eventId: sourceEventId },
    { type: CoreProjectionType.SPEND_POLICY, value: spendPolicy, eventId: sourceEventId },
    { type: CoreProjectionType.SPEND_REQUEST, value: spendRequest, eventId: sourceEventId },
    { type: CoreProjectionType.LEDGER_ACCOUNT, value: lockboxAccount, eventId: sourceEventId },
    { type: CoreProjectionType.LEDGER_ACCOUNT, value: revenueAccount, eventId: sourceEventId },
    { type: CoreProjectionType.LEDGER_ACCOUNT, value: repaymentAccount, eventId: sourceEventId },
    { type: CoreProjectionType.LOCKBOX, value: lockbox, eventId: sourceEventId },
    { type: CoreProjectionType.LEDGER_TRANSACTION, value: ledgerTransaction, eventId: sourceEventId },
    { type: CoreProjectionType.RISK_DECISION, value: riskDecision, eventId: sourceEventId },
    { type: CoreProjectionType.CREDIT_OFFER, value: creditOffer, eventId: sourceEventId },
    { type: CoreProjectionType.CREDIT_LINE, value: creditLine, eventId: sourceEventId },
    { type: CoreProjectionType.OBLIGATION, value: obligation, eventId: sourceEventId },
    { type: CoreProjectionType.ADMIN_ACTION, value: adminAction, eventId: sourceEventId }
  ];
  return {
    principal,
    subject,
    accountBinding,
    provider,
    mandate,
    creditIntent,
    reservation,
    spendPolicy,
    spendRequest,
    lockbox,
    ledgerTransaction,
    riskDecision,
    creditOffer,
    creditLine,
    obligation,
    adminAction,
    events,
    writes
  };
}

function createDurableApprovalHarness(repository, resourceId) {
  const state = { approvalService: undefined };
  const harness = createAuthorizationHarness({
    approvalVerifier: {
      assertApproved(input) {
        return state.approvalService.assertApproved(input);
      }
    }
  });
  const createService = (nextRepository) => new ApprovalService({
    repository: nextRepository,
    policyRegistry: harness.policyRegistry,
    directory: harness.directory,
    credentialRegistry: harness.credentialRegistry,
    referenceHasher: harness.referenceHasher,
    clock: () => AUTHORIZATION_FIXED_NOW
  });
  state.approvalService = createService(repository);
  const commandActor = harness.addIdentity({
    tenantId: TENANT_CONTEXT.tenantId,
    actorId: "actor_pg_risk_command",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [
      PilotCapability.RISK_LIMIT_INCREASE,
      PilotCapability.APPROVAL_PROPOSE,
      PilotCapability.APPROVAL_DECIDE,
      PilotCapability.APPROVAL_CANCEL
    ]
  });
  const riskApprover = harness.addIdentity({
    tenantId: TENANT_CONTEXT.tenantId,
    actorId: "actor_pg_risk_approver",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [PilotCapability.APPROVAL_DECIDE]
  });
  const operationsApprover = harness.addIdentity({
    tenantId: TENANT_CONTEXT.tenantId,
    actorId: "actor_pg_operations_approver",
    actorType: ActorType.OPERATIONS_OPERATOR,
    roleBundle: RoleBundle.OPERATIONS_OPERATOR,
    capabilities: [PilotCapability.APPROVAL_DECIDE]
  });
  harness.directory.registerResource({
    tenantId: TENANT_CONTEXT.tenantId,
    resourceType: "credit_line",
    resourceId,
    now: AUTHORIZATION_FIXED_NOW
  });
  harness.livePolicyAdapter.register({
    tenantId: TENANT_CONTEXT.tenantId,
    operationId: "pilotIncreaseCreditLimit",
    resourceType: "credit_line",
    resourceId,
    checks: ["risk", "cap", "credit_line_state", "stop_loss"],
    allowed: true
  });
  const commandRequest = authorizationRequest(
    commandActor.authenticationContext,
    "pilotIncreaseCreditLimit",
    {
      resource: { resourceType: "credit_line", resourceId },
      reasonCode: "approved_exposure_change",
      idempotencyKey: "postgres-increase-credit-limit-0001"
    }
  );
  return {
    commandActor,
    commandRequest,
    harness,
    operationsApprover,
    riskApprover,
    get approvalService() {
      return state.approvalService;
    },
    restart(nextRepository) {
      state.approvalService = createService(nextRepository);
      return state.approvalService;
    }
  };
}

async function seedApprovalIdentity(pool, identity) {
  const context = identity.authenticationContext;
  const membership = identity.membership;
  await pool.query(
    `INSERT INTO actors(
       id, actor_hash, actor_type, status, created_at, updated_at, schema_version
     ) VALUES ($1, $2, $3, 'active', $4, $4, 'actor.v1')
     ON CONFLICT (id) DO NOTHING`,
    [
      context.actorId,
      hashId("postgres_approval_actor", { actorId: context.actorId }),
      context.actorType,
      AUTHORIZATION_FIXED_NOW.toISOString()
    ]
  );
  await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
    `INSERT INTO memberships(
       id, membership_hash, tenant_id, actor_id, role_bundle, capabilities,
       client_ids, policy_version, status, valid_from, created_at, updated_at,
       version, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       'active', $9, $9, $9, 1, 'membership.v1'
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      membership.membershipId,
      hashId("postgres_approval_membership", { membershipId: membership.membershipId }),
      TENANT_CONTEXT.tenantId,
      context.actorId,
      membership.roleBundle,
      JSON.stringify(membership.capabilities),
      JSON.stringify(membership.clientIds),
      membership.policyVersion,
      AUTHORIZATION_FIXED_NOW.toISOString()
    ]
  ));
}

function createDurableBreakGlassHarness(repository) {
  const harness = createAuthorizationHarness();
  const requester = harness.addIdentity({
    tenantId: TENANT_CONTEXT.tenantId,
    actorId: "actor_pg_break_glass_requester",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [PilotCapability.APPROVAL_READ]
  });
  const riskCustodian = harness.addIdentity({
    tenantId: TENANT_CONTEXT.tenantId,
    actorId: "actor_pg_break_glass_risk_custodian",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [PilotCapability.APPROVAL_READ]
  });
  const operationsCustodian = harness.addIdentity({
    tenantId: TENANT_CONTEXT.tenantId,
    actorId: "actor_pg_break_glass_operations_custodian",
    actorType: ActorType.OPERATIONS_OPERATOR,
    roleBundle: RoleBundle.OPERATIONS_OPERATOR,
    capabilities: [PilotCapability.APPROVAL_READ]
  });
  const reviewOwner = harness.addIdentity({
    tenantId: TENANT_CONTEXT.tenantId,
    actorId: "actor_pg_break_glass_review_owner",
    actorType: ActorType.AUDITOR,
    roleBundle: RoleBundle.AUDITOR,
    capabilities: [PilotCapability.APPROVAL_READ]
  });
  const config = createBreakGlassRuntimeConfig({
    enabled: true,
    environment: "local_postgres_test",
    deploymentApprovalRef: "approval_local_test_only",
    requesterActorIds: [requester.authenticationContext.actorId],
    custodianActorIds: [
      riskCustodian.authenticationContext.actorId,
      operationsCustodian.authenticationContext.actorId
    ],
    reviewOwnerActorId: reviewOwner.authenticationContext.actorId,
    notificationTargetRef: "notification_local_test_sink",
    maximumSessionMs: 5 * 60_000
  });
  const state = { service: undefined };
  const createService = (nextRepository) => new BreakGlassService({
    repository: nextRepository,
    directory: harness.directory,
    credentialRegistry: harness.credentialRegistry,
    referenceHasher: harness.referenceHasher,
    config,
    clock: () => AUTHORIZATION_FIXED_NOW
  });
  state.service = createService(repository);
  return {
    harness,
    operationsCustodian,
    requester,
    reviewOwner,
    riskCustodian,
    get service() {
      return state.service;
    },
    restart(nextRepository) {
      state.service = createService(nextRepository);
      return state.service;
    }
  };
}

test("PostgreSQL event runtime proves atomicity, recovery, and replay", { timeout: 60_000 }, async (t) => {
  assert.ok(CONNECTION_STRING, "DATABASE_URL must be provided by scripts/run-postgres-tests.mjs");
  const pool = createPostgresPool({
    connectionString: CONNECTION_STRING,
    max: 8,
    applicationName: "ipo-one-postgres-integration"
  });

  try {
    await t.test("migrations run up, down, and up with recorded checksums", async () => {
      const initialStatus = await migrationStatus({ pool });
      const appliedCount = initialStatus.filter((migration) => migration.applied).length;
      if (appliedCount > 0) await migrateDown({ pool, steps: appliedCount });

      assert.deepEqual(await migrateUp({ pool }), [
        "0001_mvp_foundation",
        "0002_event_runtime",
        "0003_core_aggregate_persistence",
        "0004_reconciliation_runtime",
        "0005_tenant_isolation_rls",
        "0006_approval_runtime",
        "0007_abuse_control_runtime",
        "0008_durable_tenant_command_gateway",
        "0009_durable_identity_resource_capacity",
        "0010_durable_credit_application_projections",
        "0011_durable_human_credit_consent",
        "0012_durable_human_identity_reference",
        "0013_durable_credit_intent_resource_capacity",
        "0014_shared_credit_decision_offer",
        "0015_sandbox_mandate_activation",
        "0016_agent_account_proof_activation",
        "0017_shared_offer_acceptance_obligation_v2",
        "0018_sandbox_execution_accounting",
        "0019_shared_sandbox_servicing",
        "0020_live_testnet_chain_observations",
        "0021_signed_provider_sandbox",
        "0022_durable_operational_alerts",
        "0023_evidence_derived_risk_decisions",
        "0024_privacy_safe_pilot_feedback",
        "0025_durable_human_authentication",
        "0026_idempotent_wallet_session_invalidation",
        "0027_credit_passport_artifacts",
        "0028_official_report_artifacts",
        "0029_trading_credit_profiles",
        "0030_trading_capital_matching",
        "0031_trading_capital_facilities",
        "0032_trading_capital_settlement",
        "0033_trading_real_evidence_binding",
        "0034_trading_testnet_execution",
        "0035_trading_testnet_risk_guardian",
        "0036_trading_testnet_reconciliation_recovery",
        "0037_trading_testnet_facility_funding",
        "0038_trading_testnet_settlement",
        "0039_durable_authentication_replay",
        "0040_credit_registry_chain_observations",
        "0041_credit_registry_evidence_resource",
        "0042_invite_bound_authentication_credentials",
        "0043_durable_credit_outcomes",
        "0044_durable_tenant_command_pause",
        "0045_evidence_chain_anchors",
        "0046_evidence_anchor_coverage_guard",
        "0047_chain_001f_anchor_binding_repair",
        "0048_synthetic_capital_partner_marketplace",
        "0049_agent_lockbox_projection",
        "0050_canonical_credit_line_projection",
        "0051_durable_workspace_continuation_receipts",
        "0052_provider_bound_sandbox_execution_receipts",
        "0053_workspace_continuation_tenant_guard",
        "0054_universal_evm_signature_methods",
        "0055_agentic_execution_grants",
        "0056_agentic_execution_preflight",
        "0057_hypercore_delegate_persistence",
        "0058_hypercore_testnet_submission_closure",
        "0059_hypercore_stable_intent_jit_preflight",
        "0060_hypercore_stable_cancel_closure",
        "0061_execution_account_bindings",
        "0062_durable_credit_state_projection",
        "0063_selected_human_role_enrollment",
        "0064_pool_chain_reconciliation",
        "0065_pool_obligation_integration",
        "0066_agent_secured_facility_authorizations",
        "0067_m2b_hyperliquid_compositions",
        "0068_m2b_dual_risk_recovery",
        "0069_auth_reference_hash_key_rotation"
      ]);
      const firstStatus = await migrationStatus({ pool });
      assert.equal(firstStatus.every((migration) => migration.applied && migration.checksum.length === 64), true);

      assert.deepEqual(await migrateDown({ pool, steps: 69 }), [
        "0069_auth_reference_hash_key_rotation",
        "0068_m2b_dual_risk_recovery",
        "0067_m2b_hyperliquid_compositions",
        "0066_agent_secured_facility_authorizations",
        "0065_pool_obligation_integration",
        "0064_pool_chain_reconciliation",
        "0063_selected_human_role_enrollment",
        "0062_durable_credit_state_projection",
        "0061_execution_account_bindings",
        "0060_hypercore_stable_cancel_closure",
        "0059_hypercore_stable_intent_jit_preflight",
        "0058_hypercore_testnet_submission_closure",
        "0057_hypercore_delegate_persistence",
        "0056_agentic_execution_preflight",
        "0055_agentic_execution_grants",
        "0054_universal_evm_signature_methods",
        "0053_workspace_continuation_tenant_guard",
        "0052_provider_bound_sandbox_execution_receipts",
        "0051_durable_workspace_continuation_receipts",
        "0050_canonical_credit_line_projection",
        "0049_agent_lockbox_projection",
        "0048_synthetic_capital_partner_marketplace",
        "0047_chain_001f_anchor_binding_repair",
        "0046_evidence_anchor_coverage_guard",
        "0045_evidence_chain_anchors",
        "0044_durable_tenant_command_pause",
        "0043_durable_credit_outcomes",
        "0042_invite_bound_authentication_credentials",
        "0041_credit_registry_evidence_resource",
        "0040_credit_registry_chain_observations",
        "0039_durable_authentication_replay",
        "0038_trading_testnet_settlement",
        "0037_trading_testnet_facility_funding",
        "0036_trading_testnet_reconciliation_recovery",
        "0035_trading_testnet_risk_guardian",
        "0034_trading_testnet_execution",
        "0033_trading_real_evidence_binding",
        "0032_trading_capital_settlement",
        "0031_trading_capital_facilities",
        "0030_trading_capital_matching",
        "0029_trading_credit_profiles",
        "0028_official_report_artifacts",
        "0027_credit_passport_artifacts",
        "0026_idempotent_wallet_session_invalidation",
        "0025_durable_human_authentication",
        "0024_privacy_safe_pilot_feedback",
        "0023_evidence_derived_risk_decisions",
        "0022_durable_operational_alerts",
        "0021_signed_provider_sandbox",
        "0020_live_testnet_chain_observations",
        "0019_shared_sandbox_servicing",
        "0018_sandbox_execution_accounting",
        "0017_shared_offer_acceptance_obligation_v2",
        "0016_agent_account_proof_activation",
        "0015_sandbox_mandate_activation",
        "0014_shared_credit_decision_offer",
        "0013_durable_credit_intent_resource_capacity",
        "0012_durable_human_identity_reference",
        "0011_durable_human_credit_consent",
        "0010_durable_credit_application_projections",
        "0009_durable_identity_resource_capacity",
        "0008_durable_tenant_command_gateway",
        "0007_abuse_control_runtime",
        "0006_approval_runtime",
        "0005_tenant_isolation_rls",
        "0004_reconciliation_runtime",
        "0003_core_aggregate_persistence",
        "0002_event_runtime",
        "0001_mvp_foundation"
      ]);
      assert.deepEqual(await migrateUp({ pool }), [
        "0001_mvp_foundation",
        "0002_event_runtime",
        "0003_core_aggregate_persistence",
        "0004_reconciliation_runtime",
        "0005_tenant_isolation_rls",
        "0006_approval_runtime",
        "0007_abuse_control_runtime",
        "0008_durable_tenant_command_gateway",
        "0009_durable_identity_resource_capacity",
        "0010_durable_credit_application_projections",
        "0011_durable_human_credit_consent",
        "0012_durable_human_identity_reference",
        "0013_durable_credit_intent_resource_capacity",
        "0014_shared_credit_decision_offer",
        "0015_sandbox_mandate_activation",
        "0016_agent_account_proof_activation",
        "0017_shared_offer_acceptance_obligation_v2",
        "0018_sandbox_execution_accounting",
        "0019_shared_sandbox_servicing",
        "0020_live_testnet_chain_observations",
        "0021_signed_provider_sandbox",
        "0022_durable_operational_alerts",
        "0023_evidence_derived_risk_decisions",
        "0024_privacy_safe_pilot_feedback",
        "0025_durable_human_authentication",
        "0026_idempotent_wallet_session_invalidation",
        "0027_credit_passport_artifacts",
        "0028_official_report_artifacts",
        "0029_trading_credit_profiles",
        "0030_trading_capital_matching",
        "0031_trading_capital_facilities",
        "0032_trading_capital_settlement",
        "0033_trading_real_evidence_binding",
        "0034_trading_testnet_execution",
        "0035_trading_testnet_risk_guardian",
        "0036_trading_testnet_reconciliation_recovery",
        "0037_trading_testnet_facility_funding",
        "0038_trading_testnet_settlement",
        "0039_durable_authentication_replay",
        "0040_credit_registry_chain_observations",
        "0041_credit_registry_evidence_resource",
        "0042_invite_bound_authentication_credentials",
        "0043_durable_credit_outcomes",
        "0044_durable_tenant_command_pause",
        "0045_evidence_chain_anchors",
        "0046_evidence_anchor_coverage_guard",
        "0047_chain_001f_anchor_binding_repair",
        "0048_synthetic_capital_partner_marketplace",
        "0049_agent_lockbox_projection",
        "0050_canonical_credit_line_projection",
        "0051_durable_workspace_continuation_receipts",
        "0052_provider_bound_sandbox_execution_receipts",
        "0053_workspace_continuation_tenant_guard",
        "0054_universal_evm_signature_methods",
        "0055_agentic_execution_grants",
        "0056_agentic_execution_preflight",
        "0057_hypercore_delegate_persistence",
        "0058_hypercore_testnet_submission_closure",
        "0059_hypercore_stable_intent_jit_preflight",
        "0060_hypercore_stable_cancel_closure",
        "0061_execution_account_bindings",
        "0062_durable_credit_state_projection",
        "0063_selected_human_role_enrollment",
        "0064_pool_chain_reconciliation",
        "0065_pool_obligation_integration",
        "0066_agent_secured_facility_authorizations",
        "0067_m2b_hyperliquid_compositions",
        "0068_m2b_dual_risk_recovery",
        "0069_auth_reference_hash_key_rotation"
      ]);

      assert.deepEqual(await migrateDown({ pool, steps: 67 }), [
        "0069_auth_reference_hash_key_rotation",
        "0068_m2b_dual_risk_recovery",
        "0067_m2b_hyperliquid_compositions",
        "0066_agent_secured_facility_authorizations",
        "0065_pool_obligation_integration",
        "0064_pool_chain_reconciliation",
        "0063_selected_human_role_enrollment",
        "0062_durable_credit_state_projection",
        "0061_execution_account_bindings",
        "0060_hypercore_stable_cancel_closure",
        "0059_hypercore_stable_intent_jit_preflight",
        "0058_hypercore_testnet_submission_closure",
        "0057_hypercore_delegate_persistence",
        "0056_agentic_execution_preflight",
        "0055_agentic_execution_grants",
        "0054_universal_evm_signature_methods",
        "0053_workspace_continuation_tenant_guard",
        "0052_provider_bound_sandbox_execution_receipts",
        "0051_durable_workspace_continuation_receipts",
        "0050_canonical_credit_line_projection",
        "0049_agent_lockbox_projection",
        "0048_synthetic_capital_partner_marketplace",
        "0047_chain_001f_anchor_binding_repair",
        "0046_evidence_anchor_coverage_guard",
        "0045_evidence_chain_anchors",
        "0044_durable_tenant_command_pause",
        "0043_durable_credit_outcomes",
        "0042_invite_bound_authentication_credentials",
        "0041_credit_registry_evidence_resource",
        "0040_credit_registry_chain_observations",
        "0039_durable_authentication_replay",
        "0038_trading_testnet_settlement",
        "0037_trading_testnet_facility_funding",
        "0036_trading_testnet_reconciliation_recovery",
        "0035_trading_testnet_risk_guardian",
        "0034_trading_testnet_execution",
        "0033_trading_real_evidence_binding",
        "0032_trading_capital_settlement",
        "0031_trading_capital_facilities",
        "0030_trading_capital_matching",
        "0029_trading_credit_profiles",
        "0028_official_report_artifacts",
        "0027_credit_passport_artifacts",
        "0026_idempotent_wallet_session_invalidation",
        "0025_durable_human_authentication",
        "0024_privacy_safe_pilot_feedback",
        "0023_evidence_derived_risk_decisions",
        "0022_durable_operational_alerts",
        "0021_signed_provider_sandbox",
        "0020_live_testnet_chain_observations",
        "0019_shared_sandbox_servicing",
        "0018_sandbox_execution_accounting",
        "0017_shared_offer_acceptance_obligation_v2",
        "0016_agent_account_proof_activation",
        "0015_sandbox_mandate_activation",
        "0014_shared_credit_decision_offer",
        "0013_durable_credit_intent_resource_capacity",
        "0012_durable_human_identity_reference",
        "0011_durable_human_credit_consent",
        "0010_durable_credit_application_projections",
        "0009_durable_identity_resource_capacity",
        "0008_durable_tenant_command_gateway",
        "0007_abuse_control_runtime",
        "0006_approval_runtime",
        "0005_tenant_isolation_rls",
        "0004_reconciliation_runtime",
        "0003_core_aggregate_persistence"
      ]);
      await pool.query(
        `INSERT INTO principals(id, principal_hash, principal_type, jurisdiction, status, created_at)
         VALUES ('principal_legacy_upgrade', 'hash_principal_legacy_upgrade', 'developer', 'US', 'active', $1)`,
        [FIXED_NOW.toISOString()]
      );
      await pool.query(
        `INSERT INTO subjects(id, subject_hash, subject_type, status, display_name, created_at, updated_at)
         VALUES (
           'subject_legacy_upgrade', 'hash_subject_legacy_upgrade', 'agent', 'active',
           'Legacy Upgrade Fixture', $1, $1
         )`,
        [FIXED_NOW.toISOString()]
      );
      assert.deepEqual(await migrateUp({ pool }), [
        "0003_core_aggregate_persistence",
        "0004_reconciliation_runtime",
        "0005_tenant_isolation_rls",
        "0006_approval_runtime",
        "0007_abuse_control_runtime",
        "0008_durable_tenant_command_gateway",
        "0009_durable_identity_resource_capacity",
        "0010_durable_credit_application_projections",
        "0011_durable_human_credit_consent",
        "0012_durable_human_identity_reference",
        "0013_durable_credit_intent_resource_capacity",
        "0014_shared_credit_decision_offer",
        "0015_sandbox_mandate_activation",
        "0016_agent_account_proof_activation",
        "0017_shared_offer_acceptance_obligation_v2",
        "0018_sandbox_execution_accounting",
        "0019_shared_sandbox_servicing",
        "0020_live_testnet_chain_observations",
        "0021_signed_provider_sandbox",
        "0022_durable_operational_alerts",
        "0023_evidence_derived_risk_decisions",
        "0024_privacy_safe_pilot_feedback",
        "0025_durable_human_authentication",
        "0026_idempotent_wallet_session_invalidation",
        "0027_credit_passport_artifacts",
        "0028_official_report_artifacts",
        "0029_trading_credit_profiles",
        "0030_trading_capital_matching",
        "0031_trading_capital_facilities",
        "0032_trading_capital_settlement",
        "0033_trading_real_evidence_binding",
        "0034_trading_testnet_execution",
        "0035_trading_testnet_risk_guardian",
        "0036_trading_testnet_reconciliation_recovery",
        "0037_trading_testnet_facility_funding",
        "0038_trading_testnet_settlement",
        "0039_durable_authentication_replay",
        "0040_credit_registry_chain_observations",
        "0041_credit_registry_evidence_resource",
        "0042_invite_bound_authentication_credentials",
        "0043_durable_credit_outcomes",
        "0044_durable_tenant_command_pause",
        "0045_evidence_chain_anchors",
        "0046_evidence_anchor_coverage_guard",
        "0047_chain_001f_anchor_binding_repair",
        "0048_synthetic_capital_partner_marketplace",
        "0049_agent_lockbox_projection",
        "0050_canonical_credit_line_projection",
        "0051_durable_workspace_continuation_receipts",
        "0052_provider_bound_sandbox_execution_receipts",
        "0053_workspace_continuation_tenant_guard",
        "0054_universal_evm_signature_methods",
        "0055_agentic_execution_grants",
        "0056_agentic_execution_preflight",
        "0057_hypercore_delegate_persistence",
        "0058_hypercore_testnet_submission_closure",
        "0059_hypercore_stable_intent_jit_preflight",
        "0060_hypercore_stable_cancel_closure",
        "0061_execution_account_bindings",
        "0062_durable_credit_state_projection",
        "0063_selected_human_role_enrollment",
        "0064_pool_chain_reconciliation",
        "0065_pool_obligation_integration",
        "0066_agent_secured_facility_authorizations",
        "0067_m2b_hyperliquid_compositions",
        "0068_m2b_dual_risk_recovery",
        "0069_auth_reference_hash_key_rotation"
      ]);
      assert.equal(
        (await pool.query("SELECT primary_principal_id FROM subjects WHERE id = 'subject_legacy_upgrade'"))
          .rows[0].primary_principal_id,
        null
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
            `INSERT INTO subjects(
               id, subject_hash, subject_type, status, display_name,
               primary_principal_id, created_at, updated_at
             ) VALUES (
               'subject_missing_principal', 'hash_subject_missing_principal', 'agent',
               'active', 'Invalid New Subject', NULL, $1, $1
             )`,
            [FIXED_NOW.toISOString()]
          )),
        (error) => error.code === "23514"
      );
      await pool.query("TRUNCATE TABLE principals RESTART IDENTITY CASCADE");
    });

    await t.test("tenant context, RLS, role posture, and pooled reuse fail closed", async () => {
      const appRole = "ipo_one_app_test";
      const dropAppRole = async () => {
        const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole]);
        if (exists.rowCount === 0) return;
        await pool.query(`DROP OWNED BY ${appRole}`);
        await pool.query(`DROP ROLE ${appRole}`);
      };
      await dropAppRole();
      const tenantTableCoverage = await pool.query(`
        SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced,
          EXISTS (
            SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
          ) AS has_policy,
          EXISTS (
            SELECT 1
              FROM pg_trigger t
             WHERE t.tgrelid = c.oid
               AND t.tgname = 'tenant_context_guard_' || c.relname
               AND t.tgenabled = 'O'
               AND NOT t.tgisinternal
          ) AS has_write_guard
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind IN ('r', 'p')
          AND EXISTS (
            SELECT 1
              FROM pg_attribute a
             WHERE a.attrelid = c.oid
               AND a.attname = 'tenant_id'
               AND NOT a.attisdropped
          )
        ORDER BY c.relname
      `);
      assert.deepEqual(
        tenantTableCoverage.rows.map((row) => row.table_name),
        TENANT_OWNED_TABLES
      );
      assert.equal(
        tenantTableCoverage.rows.every((row) =>
          row.rls_enabled && row.rls_forced && row.has_policy && row.has_write_guard
        ),
        true
      );
      const missingTenantForeignKeys = await pool.query(`
        SELECT source.relname AS source_table, original.conname AS constraint_name,
               target.relname AS target_table
          FROM pg_constraint original
          JOIN pg_class source ON source.oid = original.conrelid
          JOIN pg_class target ON target.oid = original.confrelid
         WHERE original.contype = 'f'
           AND EXISTS (
             SELECT 1 FROM pg_attribute source_tenant
              WHERE source_tenant.attrelid = source.oid
                AND source_tenant.attname = 'tenant_id'
                AND NOT source_tenant.attisdropped
           )
           AND EXISTS (
             SELECT 1 FROM pg_attribute target_tenant
              WHERE target_tenant.attrelid = target.oid
                AND target_tenant.attname = 'tenant_id'
                AND NOT target_tenant.attisdropped
           )
           AND NOT EXISTS (
             SELECT 1
               FROM unnest(original.conkey) source_key
               JOIN pg_attribute source_attribute
                 ON source_attribute.attrelid = source.oid
                AND source_attribute.attnum = source_key
              WHERE source_attribute.attname = 'tenant_id'
           )
           AND NOT EXISTS (
             SELECT 1
               FROM pg_constraint tenant_constraint
              WHERE tenant_constraint.contype = 'f'
                AND tenant_constraint.conrelid = original.conrelid
                AND tenant_constraint.confrelid = original.confrelid
                AND original.conkey <@ tenant_constraint.conkey
                AND EXISTS (
                  SELECT 1
                    FROM unnest(tenant_constraint.conkey) tenant_key
                    JOIN pg_attribute tenant_attribute
                      ON tenant_attribute.attrelid = source.oid
                     AND tenant_attribute.attnum = tenant_key
                   WHERE tenant_attribute.attname = 'tenant_id'
                )
           )
         ORDER BY source.relname, original.conname
      `);
      assert.deepEqual(missingTenantForeignKeys.rows, []);
      const unscopedIdempotencyTables = await pool.query(`
        SELECT c.relname AS table_name
          FROM pg_class c
         WHERE c.relkind IN ('r', 'p')
           AND EXISTS (
           SELECT 1 FROM pg_attribute tenant_column
            WHERE tenant_column.attrelid = c.oid
              AND tenant_column.attname = 'tenant_id'
              AND NOT tenant_column.attisdropped
         )
           AND EXISTS (
             SELECT 1 FROM pg_attribute idempotency_column
              WHERE idempotency_column.attrelid = c.oid
                AND idempotency_column.attname = 'idempotency_key'
                AND NOT idempotency_column.attisdropped
           )
           AND NOT EXISTS (
             SELECT 1
               FROM pg_constraint identity_constraint
              WHERE identity_constraint.conrelid = c.oid
                AND identity_constraint.contype IN ('p', 'u')
                AND EXISTS (
                  SELECT 1
                    FROM unnest(identity_constraint.conkey) identity_key
                    JOIN pg_attribute identity_attribute
                      ON identity_attribute.attrelid = c.oid
                     AND identity_attribute.attnum = identity_key
                   WHERE identity_attribute.attname = 'tenant_id'
                )
                AND EXISTS (
                  SELECT 1
                    FROM unnest(identity_constraint.conkey) identity_key
                    JOIN pg_attribute identity_attribute
                      ON identity_attribute.attrelid = c.oid
                     AND identity_attribute.attnum = identity_key
                   WHERE identity_attribute.attname = 'idempotency_key'
                )
           )
         ORDER BY c.relname
      `);
      assert.deepEqual(unscopedIdempotencyTables.rows, []);
      const rootRlsCoverage = await pool.query(`
        SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
               c.relforcerowsecurity AS rls_forced,
               EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS has_policy
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = current_schema()
           AND c.relname IN ('actors', 'tenants')
         ORDER BY c.relname
      `);
      assert.deepEqual(
        rootRlsCoverage.rows,
        [
          { table_name: "actors", rls_enabled: true, rls_forced: true, has_policy: true },
          { table_name: "tenants", rls_enabled: true, rls_forced: true, has_policy: true }
        ]
      );
      await pool.query(`CREATE ROLE ${appRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
      await pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON
           tenants, actors, memberships, access_grants, principals, subjects
         TO ${appRole}`
      );

      const appTransaction = async (context, operation, { includeContext = true } = {}) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(`SET LOCAL ROLE ${appRole}`);
          if (includeContext) await setTenantTransactionContext(client, context);
          const result = await operation(client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Preserve the original test error.
          }
          throw error;
        } finally {
          client.release();
        }
      };

      try {
        await pool.query(
          `INSERT INTO tenants(
             id, tenant_hash, organization_ref, display_name, status,
             pilot_jurisdiction, legal_retention_owner_ref, created_at,
             updated_at, schema_version
           ) VALUES (
             'tenant_ipo_one_test_two', 'tenant_hash_test_two',
             'org:test-two', 'Tenant Two', 'active', 'US', 'org:test-two',
             $1, $1, 'tenant.v1'
           ) ON CONFLICT (id) DO NOTHING`,
          [FIXED_NOW.toISOString()]
        );
        await pool.query(
          `INSERT INTO actors(
             id, actor_hash, actor_type, status, created_at, updated_at,
             schema_version
           ) VALUES (
             'actor_tenant_two_system', 'actor_hash_tenant_two_system',
             'system_worker', 'active', $1, $1, 'actor.v1'
           ) ON CONFLICT (id) DO NOTHING`,
          [FIXED_NOW.toISOString()]
        );
        await withTenantTransaction(pool, TENANT_TWO_CONTEXT, (client) => client.query(
           `INSERT INTO memberships(
              id, membership_hash, tenant_id, actor_id, role_bundle,
              capabilities, client_ids, policy_version, status, valid_from,
              created_at, updated_at, version, schema_version
            ) VALUES (
              'membership_tenant_two_system', 'membership_hash_tenant_two_system',
              'tenant_ipo_one_test_two', 'actor_tenant_two_system',
              'system_worker', '["local_non_funds_repository"]'::jsonb,
              '["client_actor_tenant_two_system"]'::jsonb, 'security_001.v1',
              'active', $1, $1, $1, 1, 'membership.v1'
            ) ON CONFLICT (id) DO NOTHING`,
          [FIXED_NOW.toISOString()]
        ));

        const seedTenant = (context, suffix) => withTenantTransaction(pool, context, async (client) => {
          await client.query(
            `INSERT INTO principals(
               id, principal_hash, principal_type, jurisdiction, status,
               created_at
             ) VALUES ($1, $2, 'developer', 'US', 'active', $3)`,
            [`principal_rls_${suffix}`, `principal_hash_rls_${suffix}`, FIXED_NOW.toISOString()]
          );
          await client.query(
            `INSERT INTO subjects(
               id, subject_hash, subject_type, status, display_name,
               primary_principal_id, created_at, updated_at
             ) VALUES ($1, $2, 'agent', 'active', $3, $4, $5, $5)`,
            [
              `subject_rls_${suffix}`,
              `subject_hash_rls_${suffix}`,
              `Tenant ${suffix} Agent`,
              `principal_rls_${suffix}`,
              FIXED_NOW.toISOString()
            ]
          );
        });
        await seedTenant(TENANT_CONTEXT, "one");
        await seedTenant(TENANT_TWO_CONTEXT, "two");

        const roleProof = await appTransaction(TENANT_CONTEXT, (client) => assertTenantDatabaseRole(client));
        assert.equal(roleProof.roleName, appRole);

        const tenantOneRows = await appTransaction(TENANT_CONTEXT, (client) =>
          client.query("SELECT id, tenant_id FROM subjects ORDER BY id")
        );
        assert.deepEqual(tenantOneRows.rows, [{
          id: "subject_rls_one",
          tenant_id: TENANT_CONTEXT.tenantId
        }]);
        const hiddenTenantTwo = await appTransaction(TENANT_CONTEXT, (client) =>
          client.query("SELECT id FROM subjects WHERE id = 'subject_rls_two'")
        );
        assert.equal(hiddenTenantTwo.rowCount, 0);

        const tenantTwoRows = await appTransaction(TENANT_TWO_CONTEXT, (client) =>
          client.query("SELECT id, tenant_id FROM subjects ORDER BY id")
        );
        assert.deepEqual(tenantTwoRows.rows, [{
          id: "subject_rls_two",
          tenant_id: TENANT_TWO_CONTEXT.tenantId
        }]);

        await assert.rejects(
          () => appTransaction(TENANT_CONTEXT, (client) => client.query(
            `INSERT INTO subjects(
               id, subject_hash, subject_type, status, display_name,
               primary_principal_id, created_at, updated_at, tenant_id
             ) VALUES (
               'subject_cross_tenant_explicit', 'subject_hash_cross_explicit',
               'agent', 'active', 'Cross Tenant Explicit', 'principal_rls_two',
               $1, $1, 'tenant_ipo_one_test_two'
             )`,
            [FIXED_NOW.toISOString()]
          )),
          (error) => error.code === "42501"
        );

        await assert.rejects(
          () => appTransaction(TENANT_CONTEXT, (client) => client.query(
            `INSERT INTO subjects(
               id, subject_hash, subject_type, status, display_name,
               primary_principal_id, created_at, updated_at
             ) VALUES (
               'subject_cross_tenant_fk', 'subject_hash_cross_fk', 'agent',
               'active', 'Cross Tenant FK', 'principal_rls_two', $1, $1
             )`,
            [FIXED_NOW.toISOString()]
          )),
          (error) => error.code === "23503"
        );

        await assert.rejects(
          () => appTransaction(TENANT_CONTEXT, (client) => client.query(
            `INSERT INTO principals(
               id, principal_hash, principal_type, jurisdiction, status,
               created_at
             ) VALUES (
               'principal_missing_context', 'principal_hash_missing_context',
               'developer', 'US', 'active', $1
             )`,
            [FIXED_NOW.toISOString()]
          ), { includeContext: false }),
          (error) => error.code === "42501"
        );

        const pooledClient = await pool.connect();
        try {
          await pooledClient.query("BEGIN");
          await pooledClient.query(`SET LOCAL ROLE ${appRole}`);
          await setTenantTransactionContext(pooledClient, TENANT_CONTEXT);
          assert.equal(
            (await pooledClient.query("SELECT count(*)::int AS count FROM subjects")).rows[0].count,
            1
          );
          await pooledClient.query("COMMIT");

          await pooledClient.query("BEGIN");
          await pooledClient.query(`SET LOCAL ROLE ${appRole}`);
          assert.equal(
            (await pooledClient.query("SELECT count(*)::int AS count FROM subjects")).rows[0].count,
            0
          );
          await pooledClient.query("ROLLBACK");
        } finally {
          pooledClient.release();
        }
      } finally {
        await pool.query("TRUNCATE TABLE principals RESTART IDENTITY CASCADE");
        await dropAppRole();
      }
    });

    await t.test("distributed quota reservations survive races, restart, replay, and rollback", async () => {
      await resetAbuseRuntime(pool);
      await waitForAbuseRateWindowRunway(pool);
      const context = createAbuseAuthenticationContext("actor_postgres_abuse_race");
      const createStore = () => new PostgresQuotaStore({
        eventRepository: new PostgresEventRepository({
          pool,
          tenantContext: TENANT_CONTEXT,
          transactionRetries: 10
        })
      });
      const firstStore = createStore();
      const secondStore = createStore();
      const firstService = new AbuseControlService({ store: firstStore });
      const secondService = new AbuseControlService({ store: secondStore });
      const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
        (index % 2 === 0 ? firstService : secondService).admitTenant({
          authenticationContext: context,
          operationId: "pilotSubmitSpend",
          idempotencyKey: `postgres-concurrent-spend-${index}`
        })
      ));
      const admitted = attempts.filter((item) => item.status === "fulfilled").map((item) => item.value);
      const denied = attempts.filter((item) => item.status === "rejected").map((item) => item.reason);
      assert.equal(
        admitted.length,
        2,
        JSON.stringify(denied.map((error) => ({ code: error.code, message: error.message })))
      );
      assert.equal(denied.length, 6);
      assert.equal(denied.every((error) => error.code === "request_budget_exceeded"), true);
      for (const admission of admitted) {
        await firstService.complete({ admission, outcome: AdmissionOutcome.SUCCEEDED });
      }

      const restartedRateService = new AbuseControlService({ store: createStore() });
      for (let index = 8; index < 30; index += 1) {
        const admission = await restartedRateService.admitTenant({
          authenticationContext: context,
          operationId: "pilotSubmitSpend",
          idempotencyKey: `postgres-rate-spend-${index}`
        });
        await restartedRateService.complete({ admission, outcome: AdmissionOutcome.SUCCEEDED });
      }
      await assert.rejects(
        () => restartedRateService.admitTenant({
          authenticationContext: context,
          operationId: "pilotSubmitSpend",
          idempotencyKey: "postgres-rate-spend-over-limit"
        }),
        (error) => error.code === "request_budget_exceeded"
      );

      const replayContext = createAbuseAuthenticationContext("actor_postgres_abuse_replay");
      const replayInput = {
        authenticationContext: replayContext,
        operationId: "pilotRequestCredit",
        idempotencyKey: "postgres-economic-replay-0001",
        resourceDeltas: { open_obligations: 1 }
      };
      const replayService = new AbuseControlService({ store: createStore() });
      const original = await replayService.admitTenant(replayInput);
      const originalResult = await replayService.executeAdmitted({
        admission: original,
        execute: async () => ({ obligationId: "obligation_postgres_abuse_001" })
      });
      const restartedReplayService = new AbuseControlService({ store: createStore() });
      const replay = await restartedReplayService.admitTenant(replayInput);
      assert.equal(replay.disposition, AdmissionDisposition.REPLAY);
      const replayResult = await restartedReplayService.executeAdmitted({
        admission: replay,
        execute: async () => { throw new Error("replay executed twice"); },
        loadReplay: async () => originalResult.value
      });
      assert.deepEqual(replayResult, { value: originalResult.value, replayed: true });
      assert.equal((await restartedReplayService.store.snapshot()).capacities.open_obligations, 1);

      const rollbackContext = createAbuseAuthenticationContext("actor_postgres_abuse_rollback");
      const failedService = new AbuseControlService({ store: createStore() });
      const failed = await failedService.admitTenant({
        authenticationContext: rollbackContext,
        operationId: "pilotFreezeSubject",
        idempotencyKey: "postgres-resource-rollback-0001",
        resourceDeltas: { providers: 100 }
      });
      await failedService.complete({ admission: failed, outcome: AdmissionOutcome.FAILED });
      const afterFailureService = new AbuseControlService({ store: createStore() });
      const afterFailure = await afterFailureService.admitTenant({
        authenticationContext: rollbackContext,
        operationId: "pilotFreezeSubject",
        idempotencyKey: "postgres-resource-after-rollback",
        resourceDeltas: { providers: 100 }
      });
      await afterFailureService.complete({
        admission: afterFailure,
        outcome: AdmissionOutcome.SUCCEEDED
      });
      const finalSnapshot = await afterFailureService.store.snapshot();
      assert.equal(finalSnapshot.capacities.providers, 100);
      assert.equal(finalSnapshot.charges.succeeded >= 2, true);
      await resetAbuseRuntime(pool);
    });

    await t.test("two tenants can reuse stream and idempotency identities without coupling", async () => {
      await resetRuntime(pool);
      const appRole = "ipo_one_runtime_tenant_test";
      const dropAppRole = async () => {
        const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole]);
        if (exists.rowCount === 0) return;
        await pool.query(`DROP OWNED BY ${appRole}`);
        await pool.query(`DROP ROLE ${appRole}`);
      };
      await dropAppRole();
      const appRolePassword = randomBytes(24).toString("base64url");
      const quotedPassword = (
        await pool.query("SELECT quote_literal($1) AS value", [appRolePassword])
      ).rows[0].value;
      await pool.query(
        `CREATE ROLE ${appRole} LOGIN PASSWORD ${quotedPassword} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
      );
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
      await pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON
           aggregate_stream_heads, domain_events, command_idempotency,
           outbox_messages, inbox_messages, evidence_envelopes, credit_events,
           command_events, evidence_chain_anchors,
           evidence_chain_anchor_observations
         TO ${appRole}`
      );
      const appConnection = new URL(CONNECTION_STRING);
      appConnection.username = appRole;
      appConnection.password = appRolePassword;
      const appPool = createPostgresPool({
        connectionString: appConnection.toString(),
        max: 4,
        applicationName: "ipo-one-runtime-tenant-test"
      });

      try {
        await assertTenantDatabaseRole(appPool);
        const tenantOneRepository = new PostgresEventRepository({
          pool: appPool,
          tenantContext: TENANT_CONTEXT
        });
        const tenantTwoRepository = new PostgresEventRepository({
          pool: appPool,
          tenantContext: TENANT_TWO_CONTEXT
        });
        const sharedIdentity = {
          aggregateType: "tenant_scoped_aggregate",
          aggregateId: "shared_aggregate_id",
          expectedVersion: 0,
          idempotencyKey: "shared_idempotency_key",
          commandHash: hashId("integration_command", { operation: "tenant-scoped" })
        };
        const tenantOneCommand = {
          ...sharedIdentity,
          event: createTestEvent({
            subjectId: "subject_tenant_one_event",
            payload: { tenant: "one" }
          })
        };
        const tenantTwoCommand = {
          ...sharedIdentity,
          event: createTestEvent({
            subjectId: "subject_tenant_two_event",
            payload: { tenant: "two" }
          })
        };

        const [tenantOneCommit, tenantTwoCommit] = await Promise.all([
          tenantOneRepository.appendCommand(tenantOneCommand),
          tenantTwoRepository.appendCommand(tenantTwoCommand)
        ]);

        assert.equal(tenantOneCommit.replayed, false);
        assert.equal(tenantTwoCommit.replayed, false);
        assert.notEqual(tenantOneCommit.event.eventId, tenantTwoCommit.event.eventId);
        assert.deepEqual(
          (await tenantOneRepository.listEvents(sharedIdentity)).map((event) => event.eventId),
          [tenantOneCommit.event.eventId]
        );
        assert.deepEqual(
          (await tenantTwoRepository.listEvents(sharedIdentity)).map((event) => event.eventId),
          [tenantTwoCommit.event.eventId]
        );
        assert.equal(await tenantOneRepository.getStreamVersion(sharedIdentity), 1);
        assert.equal(await tenantTwoRepository.getStreamVersion(sharedIdentity), 1);

        const tenantOneReplay = await tenantOneRepository.appendCommand(tenantOneCommand);
        assert.equal(tenantOneReplay.replayed, true);
        assert.equal(tenantOneReplay.event.eventId, tenantOneCommit.event.eventId);
        assert.deepEqual(await runtimeCounts(pool), {
          commands: 2,
          events: 2,
          evidence: 2,
          anchors: 2,
          credit_events: 2,
          outbox: 2,
          stream_heads: 2
        });
      } finally {
        await appPool.end();
        await dropAppRole();
      }
    });

    await t.test("an injected crash rolls back command, event, Evidence, outbox, and stream head", async () => {
      await resetRuntime(pool);
      const event = createTestEvent({ payload: { operation: "atomic-crash-test" } });
      const input = {
        aggregateType: "integration_aggregate",
        aggregateId: "aggregate_crash",
        expectedVersion: 0,
        idempotencyKey: "command-crash-1",
        commandHash: hashId("integration_command", { operation: "atomic-crash-test" }),
        event
      };
      const crashingRepository = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        faultInjector: ({ stage }) => {
          if (stage === "after_event_inserted") throw new Error("injected process crash");
        }
      });

      await assert.rejects(() => crashingRepository.appendCommand(input), /injected process crash/);
      assert.deepEqual(await runtimeCounts(pool), {
        commands: 0,
        events: 0,
        evidence: 0,
        anchors: 0,
        credit_events: 0,
        outbox: 0,
        stream_heads: 0
      });

      const repository = new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT });
      const committed = await repository.appendCommand(input);
      assert.equal(committed.replayed, false);
      assert.deepEqual(await runtimeCounts(pool), {
        commands: 1,
        events: 1,
        evidence: 1,
        anchors: 1,
        credit_events: 1,
        outbox: 1,
        stream_heads: 1
      });
      assert.equal(await repository.getStreamVersion(input), 1);
    });

    await t.test("command replay is stable and conflicting idempotency reuse fails closed", async () => {
      await resetRuntime(pool);
      const repository = new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT });
      const command = {
        aggregateType: "integration_aggregate",
        aggregateId: "aggregate_idempotency",
        expectedVersion: 0,
        idempotencyKey: "command-idempotency-1",
        commandHash: hashId("integration_command", { value: 1 }),
        event: createTestEvent({ payload: { value: 1 } })
      };

      const first = await repository.appendCommand(command);
      const replay = await repository.appendCommand(command);
      assert.equal(replay.replayed, true);
      assert.equal(replay.event.eventId, first.event.eventId);
      assert.equal((await repository.listEvents({ aggregateId: command.aggregateId })).length, 1);

      await assert.rejects(
        () => repository.appendCommand({ ...command, commandHash: hashId("integration_command", { value: 2 }) }),
        (error) => error.code === "event_idempotency_conflict"
      );
      assert.equal((await repository.listOutbox()).length, 1);
    });

    await t.test("concurrent writers with one expected version produce one winner", async () => {
      await resetRuntime(pool);
      const repository = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        transactionRetries: 5
      });
      const aggregate = { aggregateType: "integration_aggregate", aggregateId: "aggregate_race" };
      await repository.appendCommand({
        ...aggregate,
        expectedVersion: 0,
        idempotencyKey: "race-seed",
        commandHash: hashId("integration_command", { race: "seed" }),
        event: createTestEvent({ payload: { race: "seed" } })
      });

      const attempts = ["left", "right"].map((side) =>
        repository.appendCommand({
          ...aggregate,
          expectedVersion: 1,
          idempotencyKey: `race-${side}`,
          commandHash: hashId("integration_command", { race: side }),
          event: createTestEvent({ payload: { race: side } })
        })
      );
      const results = await Promise.allSettled(attempts);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.find((result) => result.status === "rejected");
      assert.equal(rejected.reason.code, "stale_aggregate_version");
      assert.equal(await repository.getStreamVersion(aggregate), 2);
      assert.equal((await repository.listEvents(aggregate)).length, 2);
      assert.equal((await repository.listOutbox()).length, 2);
    });

    await t.test("outbox leases recover after worker death and terminate at the retry bound", async () => {
      await resetRuntime(pool);
      const repository = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        maxOutboxAttempts: 2
      });
      await repository.appendCommand({
        aggregateType: "integration_aggregate",
        aggregateId: "aggregate_outbox_dead",
        expectedVersion: 0,
        idempotencyKey: "outbox-dead-1",
        commandHash: hashId("integration_command", { outbox: "dead" }),
        event: createTestEvent({ payload: { outbox: "dead" } })
      });

      const firstClaim = await repository.claimOutboxBatch({ workerId: "worker-dead", limit: 1, leaseMs: 60_000 });
      assert.equal(firstClaim.length, 1);
      assert.equal((await repository.claimOutboxBatch({ workerId: "worker-waiting", limit: 1, leaseMs: 60_000 })).length, 0);

      await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
        "UPDATE outbox_messages SET locked_at = clock_timestamp() - interval '2 minutes' WHERE id = $1",
        [firstClaim[0].outboxMessageId]
      ));
      const recovered = await repository.claimOutboxBatch({ workerId: "worker-recovery", limit: 1, leaseMs: 60_000 });
      assert.equal(recovered[0].outboxMessageId, firstClaim[0].outboxMessageId);
      assert.equal(recovered[0].attempts, 2);
      const deadLettered = await repository.markOutboxFailed({
        outboxMessageId: recovered[0].outboxMessageId,
        workerId: "worker-recovery",
        error: new Error("broker unavailable")
      });
      assert.ok(deadLettered.deadLetteredAt);

      await repository.appendCommand({
        aggregateType: "integration_aggregate",
        aggregateId: "aggregate_outbox_publish",
        expectedVersion: 0,
        idempotencyKey: "outbox-publish-1",
        commandHash: hashId("integration_command", { outbox: "publish" }),
        event: createTestEvent({ payload: { outbox: "publish" } })
      });
      const publishable = await repository.claimOutboxBatch({ workerId: "worker-publish", limit: 10 });
      assert.equal(publishable.length, 1);
      const published = await repository.markOutboxPublished({
        outboxMessageId: publishable[0].outboxMessageId,
        workerId: "worker-publish"
      });
      assert.ok(published.publishedAt);

      const finalAttemptRepository = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        maxOutboxAttempts: 1
      });
      await finalAttemptRepository.appendCommand({
        aggregateType: "integration_aggregate",
        aggregateId: "aggregate_outbox_final_crash",
        expectedVersion: 0,
        idempotencyKey: "outbox-final-crash-1",
        commandHash: hashId("integration_command", { outbox: "final-crash" }),
        event: createTestEvent({ payload: { outbox: "final-crash" } })
      });
      const finalClaim = await finalAttemptRepository.claimOutboxBatch({
        workerId: "worker-final-crash",
        limit: 1,
        leaseMs: 60_000
      });
      await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
        "UPDATE outbox_messages SET locked_at = clock_timestamp() - interval '2 minutes' WHERE id = $1",
        [finalClaim[0].outboxMessageId]
      ));
      assert.equal(
        (await finalAttemptRepository.claimOutboxBatch({ workerId: "worker-after-final-crash", limit: 1, leaseMs: 60_000 }))
          .length,
        0
      );
      const recoveredFinalAttempt = (await finalAttemptRepository.listOutbox()).find(
        (message) => message.outboxMessageId === finalClaim[0].outboxMessageId
      );
      assert.ok(recoveredFinalAttempt.deadLetteredAt);
      assert.equal(recoveredFinalAttempt.lastError, "delivery lease expired after final attempt");
    });

    await t.test("inbox commits consumer effects once and rolls back interrupted handlers", async () => {
      await resetRuntime(pool);
      await pool.query("DROP TABLE IF EXISTS integration_test_effects");
      await pool.query("CREATE TABLE integration_test_effects(event_id TEXT PRIMARY KEY, value INTEGER NOT NULL)");
      const payload = { operation: "apply", value: 7 };
      const applyEffect = async ({ client, eventId }) => {
        await client.query("INSERT INTO integration_test_effects(event_id, value) VALUES ($1, $2)", [eventId, payload.value]);
        return { applied: true, value: payload.value };
      };

      try {
        const crashingRepository = new PostgresEventRepository({
          pool,
          tenantContext: TENANT_CONTEXT,
          faultInjector: ({ stage }) => {
            if (stage === "before_inbox_complete") throw new Error("injected inbox crash");
          }
        });
        await assert.rejects(
          () => crashingRepository.processInbox({ consumerName: "projection", eventId: "inbox-1", payload, handler: applyEffect }),
          /injected inbox crash/
        );
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM integration_test_effects")).rows[0].count, 0);
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM inbox_messages")).rows[0].count, 0);

        const repository = new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT });
        const first = await repository.processInbox({
          consumerName: "projection",
          eventId: "inbox-1",
          payload,
          handler: applyEffect
        });
        const replay = await repository.processInbox({
          consumerName: "projection",
          eventId: "inbox-1",
          payload,
          handler: () => {
            throw new Error("completed inbox handler must not run again");
          }
        });
        assert.equal(first.replayed, false);
        assert.equal(replay.replayed, true);
        assert.deepEqual(replay.result, first.result);
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM integration_test_effects")).rows[0].count, 1);

        await assert.rejects(
          () =>
            repository.processInbox({
              consumerName: "projection",
              eventId: "inbox-1",
              payload: { ...payload, value: 8 },
              handler: applyEffect
            }),
          (error) => error.code === "inbox_payload_conflict"
        );
      } finally {
        await pool.query("DROP TABLE IF EXISTS integration_test_effects");
      }
    });

    await t.test("a multi-event core command rolls back projections after an injected crash", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const command = {
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "core-command-crash-1",
        commandHash: hashId("core_command", { fixture: "durable-pilot-v1" }),
        events: fixture.events,
        writes: fixture.writes,
        response: {
          principalId: fixture.principal.principalId,
          subjectId: fixture.subject.subjectId,
          lockboxId: fixture.lockbox.lockboxId
        }
      };
      const crashingEvents = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        faultInjector: ({ stage }) => {
          if (stage === "after_projection_applied") throw new Error("injected core projection crash");
        }
      });
      const crashingRepository = new PostgresCoreRepository({ pool, eventRepository: crashingEvents });

      await assert.rejects(() => crashingRepository.commitCommand(command), /injected core projection crash/);
      const rolledBack = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM principals) AS principals,
          (SELECT count(*)::int FROM subjects) AS subjects,
          (SELECT count(*)::int FROM credit_intents) AS credit_intents,
          (SELECT count(*)::int FROM credit_offers) AS credit_offers,
          (SELECT count(*)::int FROM ledger_transactions) AS ledger_transactions,
          (SELECT count(*)::int FROM domain_events) AS events,
          (SELECT count(*)::int FROM outbox_messages) AS outbox,
          (SELECT count(*)::int FROM projection_registry) AS projections,
          (SELECT count(*)::int FROM projection_snapshots) AS snapshots,
          (SELECT count(*)::int FROM command_events) AS command_events
      `);
      assert.deepEqual(rolledBack.rows[0], {
        principals: 0,
        subjects: 0,
        credit_intents: 0,
        credit_offers: 0,
        ledger_transactions: 0,
        events: 0,
        outbox: 0,
        projections: 0,
        snapshots: 0,
        command_events: 0
      });
    });

    await t.test("core projections survive restart and replay the original command response", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const command = {
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "core-command-durable-1",
        commandHash: hashId("core_command", { fixture: "durable-pilot-v1" }),
        events: fixture.events,
        writes: fixture.writes,
        response: {
          principalId: fixture.principal.principalId,
          subjectId: fixture.subject.subjectId,
          lockboxId: fixture.lockbox.lockboxId
        }
      };

      const firstRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      const committed = await firstRepository.commitCommand(command);
      assert.equal(committed.replayed, false);
      assert.equal(committed.events.length, 3);
      assert.deepEqual(committed.response, command.response);

      const restartedRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      const [
        principal,
        subject,
        accountBinding,
        mandate,
        creditIntent,
        creditOffer,
        lockbox,
        ledgerTransaction,
        obligation,
        riskDecision,
        adminAction
      ] =
        await Promise.all([
          restartedRepository.getPrincipal(fixture.principal.principalId),
          restartedRepository.getSubject(fixture.subject.subjectId),
          restartedRepository.getAccountBinding(fixture.accountBinding.accountBindingId),
          restartedRepository.getMandate(fixture.mandate.mandateId),
          restartedRepository.getCreditIntent(fixture.creditIntent.creditIntentId),
          restartedRepository.getCreditOffer(fixture.creditOffer.creditOfferId),
          restartedRepository.getLockbox(fixture.lockbox.lockboxId),
          restartedRepository.getLedgerTransaction(fixture.ledgerTransaction.ledgerTransactionId),
          restartedRepository.getObligation(fixture.obligation.obligationId),
          restartedRepository.getRiskDecision(fixture.riskDecision.riskDecisionId),
          restartedRepository.getAdminAction(fixture.adminAction.adminActionId)
        ]);
      assert.deepEqual(principal.linkedSubjectIds, [fixture.subject.subjectId]);
      assert.equal(subject.primaryPrincipalId, fixture.principal.principalId);
      assert.deepEqual(subject.linkedAccountIds, [fixture.accountBinding.accountBindingId]);
      assert.equal(accountBinding.verificationMethod, "verified_signature");
      assert.equal(mandate.status, MandateStatus.ACTIVE);
      assert.deepEqual(creditIntent, fixture.creditIntent);
      assert.deepEqual(creditOffer, fixture.creditOffer);
      assert.equal(lockbox.balanceMinor, "10000");
      assert.equal(lockbox.capturedRevenueMinor, "10000");
      assert.equal(ledgerTransaction.entries.length, 2);
      assert.equal(ledgerTransaction.debitTotalMinor, "10000");
      assert.equal(obligation.outstandingPrincipalMinor, "10000");
      assert.equal(riskDecision.riskDecisionId, fixture.riskDecision.riskDecisionId);
      assert.equal(adminAction.reason, fixture.adminAction.reason);

      const registration = await restartedRepository.getProjectionRegistration(
        CoreProjectionType.OBLIGATION,
        fixture.obligation.obligationId
      );
      assert.equal(registration.rootAggregateId, fixture.subject.subjectId);
      assert.equal(registration.lastEventId, fixture.events[2].event.eventId);
      assert.equal(registration.aggregateVersion, 2);
      const projectionProof = await restartedRepository.verifyProjection(
        CoreProjectionType.OBLIGATION,
        fixture.obligation.obligationId
      );
      assert.equal(projectionProof.matches, true);
      assert.equal(
        (await restartedRepository.verifyProjection(
          CoreProjectionType.CREDIT_INTENT,
          fixture.creditIntent.creditIntentId
        )).matches,
        true
      );
      assert.equal(
        (await restartedRepository.verifyProjection(
          CoreProjectionType.CREDIT_OFFER,
          fixture.creditOffer.creditOfferId
        )).matches,
        true
      );

      const replay = await restartedRepository.commitCommand(command);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.response, command.response);
      assert.deepEqual(
        replay.events.map((event) => event.eventId),
        committed.events.map((event) => event.eventId)
      );
      const counts = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM command_idempotency) AS commands,
          (SELECT count(*)::int FROM command_events) AS command_events,
          (SELECT count(*)::int FROM domain_events) AS events,
          (SELECT count(*)::int FROM outbox_messages) AS outbox,
          (SELECT count(*)::int FROM projection_registry) AS projections,
          (SELECT count(*)::int FROM projection_snapshots) AS snapshots
      `);
      assert.deepEqual(counts.rows[0], {
        commands: 1,
        command_events: 3,
        events: 3,
        outbox: 3,
        projections: fixture.writes.length,
        snapshots: fixture.writes.length
      });

      await assert.rejects(
        () =>
          restartedRepository.commitCommand({
            ...command,
            commandHash: hashId("core_command", { fixture: "conflicting-input" })
        }),
        (error) => error.code === "event_idempotency_conflict"
      );

      const conflictingBindingEvent = createTestEvent({
        eventType: "account_binding_changed",
        subjectId: fixture.subject.subjectId,
        payload: { accountBindingId: fixture.accountBinding.accountBindingId },
        now: new Date(FIXED_NOW.getTime() + 1000)
      });
      await assert.rejects(
        () =>
          restartedRepository.commitCommand({
            aggregateType: "subject",
            aggregateId: fixture.subject.subjectId,
            idempotencyKey: "core-binding-identity-conflict",
            commandHash: hashId("core_command", { case: "binding_identity_conflict" }),
            events: [
              {
                aggregateType: "subject",
                aggregateId: fixture.subject.subjectId,
                expectedVersion: 2,
                event: conflictingBindingEvent
              }
            ],
            writes: [
              {
                type: CoreProjectionType.ACCOUNT_BINDING,
                value: { ...fixture.accountBinding, purpose: AccountPurpose.PRIMARY },
                eventId: conflictingBindingEvent.eventId
              }
            ],
            response: { changed: true }
          }),
        (error) => error.code === "projection_identity_conflict"
      );
      assert.equal(
        (await restartedRepository.getAccountBinding(fixture.accountBinding.accountBindingId)).purpose,
        AccountPurpose.EXECUTION
      );
    });

    await t.test("EXEC-001 grant persistence is atomic, RLS-isolated, and race-safe", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const coreRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      await coreRepository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "exec-001-foundation-fixture",
        commandHash: hashId("exec_001_foundation", { subjectId: fixture.subject.subjectId }),
        events: fixture.events,
        writes: fixture.writes,
        response: { created: true }
      });

      const targetPolicy = createExecutionTargetPolicy({
        providerId: fixture.provider.providerId,
        chainId: "eip155:84532",
        targetAddress: "0x1111111111111111111111111111111111111111",
        codeHash: hashId("exec_001_postgres_target_code", { version: 1 }),
        allowedFunctionSelectors: ["0x12345678"],
        validFrom: new Date(FIXED_NOW.getTime() - 1_000).toISOString(),
        expiresAt: new Date(FIXED_NOW.getTime() + 3_600_000).toISOString(),
        now: FIXED_NOW
      });
      const grantCore = {
        subjectId: fixture.subject.subjectId,
        principalId: fixture.principal.principalId,
        accountBindingId: fixture.accountBinding.accountBindingId,
        executionDomain: "evm",
        adapterId: "local_sandbox",
        mandateId: fixture.mandate.mandateId,
        mandateHash: fixture.mandate.mandateHash,
        spendPolicyId: fixture.spendPolicy.spendPolicyId,
        spendPolicyHash: fixture.spendPolicy.spendPolicyHash,
        creditLineId: fixture.creditLine.creditLineId,
        creditLineHash: hashId("exec_001_postgres_credit_line", { version: 1 }),
        obligationId: fixture.obligation.obligationId,
        obligationHash: fixture.obligation.obligationHash,
        authorizationDecisionId: "authorization_decision_exec_001_postgres",
        authorizationHash: hashId("exec_001_postgres_authorization", { version: 1 }),
        sessionSignerRefHash: hashId("exec_001_postgres_session_signer", { epoch: 3 }),
        providerId: fixture.provider.providerId,
        chainIds: ["eip155:84532"],
        assetIds: [ASSET.assetId],
        allowedTargetPolicyIds: [targetPolicy.targetPolicyId],
        perTxLimitMinor: "60000",
        rolling24hLimitMinor: "100000",
        aggregateLimitMinor: "100000",
        obligationLimitMinor: "100000",
        validFrom: FIXED_NOW.toISOString(),
        expiresAt: new Date(FIXED_NOW.getTime() + 1_800_000).toISOString(),
        sessionEpoch: 3,
        nonce: "exec-001-postgres-grant-nonce",
        sandboxOnly: true,
        productionAuthority: false,
        fundsAuthority: false,
        transactionsAllowed: false,
        schemaVersion: "delegated_wallet_grant.v1"
      };
      const grantHash = hashId("delegated_wallet_grant", grantCore);
      const prepared = {
        grantId: `delegated_wallet_grant_${grantHash.slice(2)}`,
        grantHash,
        ...grantCore,
        externalPermissionRefHash: null,
        externalPolicyHash: null,
        status: "prepared",
        pendingExposureMinor: "0",
        version: 1,
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString()
      };
      const eventRepository = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        clock: () => FIXED_NOW
      });
      const repository = new PostgresAgenticExecutionRepository({ eventRepository });
      const created = await repository.create({
        grant: prepared,
        targetPolicies: [targetPolicy],
        idempotencyKey: "exec-001-create-grant-0001",
        correlationId: "exec-001-postgres-race",
        actorId: "actor_exec_001_principal",
        now: FIXED_NOW
      });
      assert.equal(created.replayed, false);

      const active = {
        ...prepared,
        externalPermissionRefHash: hashId("exec_001_postgres_local_permission", { version: 1 }),
        externalPolicyHash: hashId("exec_001_postgres_local_policy", { version: 1 }),
        status: "active",
        version: 2,
        updatedAt: new Date(FIXED_NOW.getTime() + 1_000).toISOString()
      };
      await repository.activate({
        currentGrant: prepared,
        activation: {
          value: active,
          transition: {
            previousStatus: "prepared",
            nextStatus: "active",
            reasonCode: "local_sandbox_permission_compiled",
            authorizationDecisionId: "authorization_decision_exec_001_activate",
            authorizationHash: hashId("exec_001_postgres_activation", { version: 1 }),
            occurredAt: active.updatedAt
          }
        },
        idempotencyKey: "exec-001-activate-grant-0001",
        correlationId: "exec-001-postgres-race",
        actorId: "actor_exec_001_principal",
        now: new Date(FIXED_NOW.getTime() + 1_000)
      });

      const reservations = ["one", "two"].map((suffix, index) =>
        createPendingExposureReservation({
          grant: active,
          targetPolicy,
          amountMinor: "60000",
          sessionEpoch: active.sessionEpoch,
          idempotencyKey: `exec-001-pending-${suffix}-0001`,
          expiresAt: new Date(FIXED_NOW.getTime() + 300_000).toISOString(),
          now: new Date(FIXED_NOW.getTime() + 2_000 + index)
        })
      );
      const race = await Promise.allSettled(reservations.map((reservation, index) =>
        repository.reserve({
          grant: active,
          reservation,
          idempotencyKey: `exec-001-reserve-command-${index + 1}`,
          correlationId: "exec-001-postgres-race",
          actorId: "actor_exec_001_principal",
          now: new Date(FIXED_NOW.getTime() + 2_000 + index)
        })
      ));
      assert.equal(race.filter(({ status }) => status === "fulfilled").length, 1);
      assert.equal(race.filter(({ status }) => status === "rejected").length, 1);
      assert.equal(
        ["stale_aggregate_version", "agentic_execution_exposure_limit_exceeded"].includes(
          race.find(({ status }) => status === "rejected").reason.code
        ),
        true
      );

      const durable = await repository.findById(active.grantId);
      assert.equal(durable.grant.pendingExposureMinor, "60000");
      assert.equal(durable.grant.version, 3);
      assert.equal(durable.grant.transactionsAllowed, false);
      const proof = await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
        `SELECT
           (SELECT count(*)::INT FROM delegated_wallet_pending_exposures WHERE grant_id = $1) AS reservations,
           (SELECT count(*)::INT FROM delegated_wallet_grant_transitions WHERE grant_id = $1) AS transitions,
           (SELECT count(*)::INT FROM domain_events WHERE aggregate_type = 'delegated_wallet_grant' AND aggregate_id = $1) AS events,
           (SELECT count(*)::INT FROM evidence_envelopes WHERE aggregate_type = 'delegated_wallet_grant' AND aggregate_id = $1) AS evidence,
           (SELECT count(*)::INT FROM outbox_messages WHERE message_key = $1) AS outbox`,
        [active.grantId]
      ));
      assert.deepEqual(proof.rows[0], {
        reservations: 1,
        transitions: 2,
        events: 3,
        evidence: 3,
        outbox: 3
      });

      const rls = await pool.query(`
        SELECT relname, relrowsecurity, relforcerowsecurity
          FROM pg_class
         WHERE relname IN (
           'execution_target_policies',
           'delegated_wallet_grants',
           'delegated_wallet_grant_target_policies',
           'delegated_wallet_grant_transitions',
           'delegated_wallet_pending_exposures'
         )
         ORDER BY relname
      `);
      assert.equal(rls.rowCount, 5);
      assert.equal(
        rls.rows.every(({ relrowsecurity, relforcerowsecurity }) =>
          relrowsecurity && relforcerowsecurity
        ),
        true
      );
    });

    await t.test("EXEC-002 denied preflight Evidence is atomic, queryable, immutable, and RLS-isolated", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const coreRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      await coreRepository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "exec-002-foundation-fixture",
        commandHash: hashId("exec_002_foundation", { subjectId: fixture.subject.subjectId }),
        events: fixture.events,
        writes: fixture.writes,
        response: { created: true }
      });

      const targetPolicy = createExecutionTargetPolicy({
        providerId: fixture.provider.providerId,
        chainId: "eip155:84532",
        targetAddress: "0x1111111111111111111111111111111111111111",
        codeHash: hashId("exec_002_postgres_target_code", { version: 1 }),
        allowedFunctionSelectors: ["0x12345678"],
        validFrom: new Date(FIXED_NOW.getTime() - 1_000).toISOString(),
        expiresAt: new Date(FIXED_NOW.getTime() + 3_600_000).toISOString(),
        now: FIXED_NOW
      });
      const grantCore = {
        subjectId: fixture.subject.subjectId,
        principalId: fixture.principal.principalId,
        accountBindingId: fixture.accountBinding.accountBindingId,
        executionDomain: "evm",
        adapterId: "local_sandbox",
        mandateId: fixture.mandate.mandateId,
        mandateHash: fixture.mandate.mandateHash,
        spendPolicyId: fixture.spendPolicy.spendPolicyId,
        spendPolicyHash: fixture.spendPolicy.spendPolicyHash,
        creditLineId: fixture.creditLine.creditLineId,
        creditLineHash: hashId("exec_002_postgres_credit_line", { version: 1 }),
        obligationId: fixture.obligation.obligationId,
        obligationHash: fixture.obligation.obligationHash,
        authorizationDecisionId: "authorization_decision_exec_002_postgres",
        authorizationHash: hashId("exec_002_postgres_authorization", { version: 1 }),
        sessionSignerRefHash: hashId("exec_002_postgres_session_signer", { epoch: 4 }),
        providerId: fixture.provider.providerId,
        chainIds: ["eip155:84532"],
        assetIds: [ASSET.assetId],
        allowedTargetPolicyIds: [targetPolicy.targetPolicyId],
        perTxLimitMinor: "60000",
        rolling24hLimitMinor: "100000",
        aggregateLimitMinor: "100000",
        obligationLimitMinor: "100000",
        validFrom: FIXED_NOW.toISOString(),
        expiresAt: new Date(FIXED_NOW.getTime() + 1_800_000).toISOString(),
        sessionEpoch: 4,
        nonce: "exec-002-postgres-grant-nonce",
        sandboxOnly: true,
        productionAuthority: false,
        fundsAuthority: false,
        transactionsAllowed: false,
        schemaVersion: "delegated_wallet_grant.v1"
      };
      const grantHash = hashId("delegated_wallet_grant", grantCore);
      const preparedGrant = {
        grantId: `delegated_wallet_grant_${grantHash.slice(2)}`,
        grantHash,
        ...grantCore,
        externalPermissionRefHash: null,
        externalPolicyHash: null,
        status: "prepared",
        pendingExposureMinor: "0",
        version: 1,
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString()
      };
      const eventRepository = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        clock: () => FIXED_NOW
      });
      const grantRepository = new PostgresAgenticExecutionRepository({ eventRepository });
      await grantRepository.create({
        grant: preparedGrant,
        targetPolicies: [targetPolicy],
        idempotencyKey: "exec-002-create-grant-0001",
        correlationId: "exec-002-postgres",
        actorId: "actor_exec_002_principal",
        now: FIXED_NOW
      });
      const activeGrant = {
        ...preparedGrant,
        externalPermissionRefHash: hashId("exec_002_postgres_local_permission", { version: 1 }),
        externalPolicyHash: hashId("exec_002_postgres_local_policy", { version: 1 }),
        status: "active",
        version: 2,
        updatedAt: new Date(FIXED_NOW.getTime() + 1_000).toISOString()
      };
      await grantRepository.activate({
        currentGrant: preparedGrant,
        activation: {
          value: activeGrant,
          transition: {
            previousStatus: "prepared",
            nextStatus: "active",
            reasonCode: "local_sandbox_permission_compiled",
            authorizationDecisionId: "authorization_decision_exec_002_activate",
            authorizationHash: hashId("exec_002_postgres_activation", { version: 1 }),
            occurredAt: activeGrant.updatedAt
          }
        },
        idempotencyKey: "exec-002-activate-grant-0001",
        correlationId: "exec-002-postgres",
        actorId: "actor_exec_002_principal",
        now: new Date(FIXED_NOW.getTime() + 1_000)
      });
      const pending = createPendingExposureReservation({
        grant: activeGrant,
        targetPolicy,
        amountMinor: "5000",
        sessionEpoch: activeGrant.sessionEpoch,
        idempotencyKey: "exec-002-pending-0001",
        expiresAt: new Date(FIXED_NOW.getTime() + 300_000).toISOString(),
        now: new Date(FIXED_NOW.getTime() + 2_000)
      });
      const reservation = pending;
      const currentGrant = {
        ...activeGrant,
        pendingExposureMinor: pending.amountMinor,
        version: activeGrant.version + 1,
        updatedAt: pending.reservedAt
      };
      const payload = constructExactEvmPayload({
        chainId: "eip155:84532",
        accountRefHash: hashId("exec_002_postgres_account", { version: 1 }),
        targetAddress: targetPolicy.targetAddress,
        calldata: "0x12345678",
        nativeValueMinor: "0"
      });
      const expectedEffects = normalizeExecutionEffects({
        nativeDeltaMinor: "0",
        assetDeltas: [{
          assetId: ASSET.assetId,
          accountRefHash: hashId("exec_002_postgres_effect_account", { version: 1 }),
          deltaMinor: "-5000"
        }],
        allowanceDeltas: [],
        withdrawal: false,
        transfer: false
      });
      const preparedCore = {
        subjectId: currentGrant.subjectId,
        principalId: currentGrant.principalId,
        accountBindingId: currentGrant.accountBindingId,
        obligationId: currentGrant.obligationId,
        transferIntentId: "transfer_intent_exec_002_postgres",
        grantId: currentGrant.grantId,
        grantHash: currentGrant.grantHash,
        targetPolicyId: targetPolicy.targetPolicyId,
        targetPolicyHash: targetPolicy.policyHash,
        authorizationDecisionId: "authorization_decision_exec_002_prepare",
        authorizationHash: hashId("exec_002_prepare_authorization", { version: 1 }),
        reservationId: reservation.reservationId,
        reservationHash: reservation.reservationHash,
        sessionEpoch: currentGrant.sessionEpoch,
        payload,
        expectedEffects,
        stepUpRequired: false,
        validFrom: new Date(FIXED_NOW.getTime() + 3_000).toISOString(),
        expiresAt: new Date(FIXED_NOW.getTime() + 180_000).toISOString(),
        transactionsAllowed: false,
        sandboxOnly: true,
        productionAuthority: false,
        fundsAuthority: false,
        schemaVersion: "prepared_execution.v1"
      };
      const preparedExecutionHash = hashId("prepared_execution", preparedCore);
      const preparedExecution = {
        executionId: `wallet_execution_${preparedExecutionHash.slice(2)}`,
        preparedExecutionHash,
        ...preparedCore,
        createdAt: preparedCore.validFrom
      };
      const simulationReport = createSimulationReport({
        preparedExecution,
        simulatorId: "local_deterministic_evm",
        simulatorVersion: "exec002.v1",
        result: {
          status: "succeeded",
          chainId: "eip155:84532",
          blockNumber: "123456",
          blockHash: hashId("exec_002_postgres_block", { version: 1 }),
          observedCodeHash: targetPolicy.codeHash,
          observedProxyImplementationHash: null,
          effects: {
            nativeDeltaMinor: expectedEffects.nativeDeltaMinor,
            assetDeltas: expectedEffects.assetDeltas,
            allowanceDeltas: expectedEffects.allowanceDeltas,
            withdrawal: false,
            transfer: false
          },
          threatCheckStatus: "passed",
          revertReasonHash: null
        },
        expiresAt: new Date(FIXED_NOW.getTime() + 120_000).toISOString(),
        now: new Date(FIXED_NOW.getTime() + 4_000)
      });
      const preflightReceipt = evaluateTransactionPreflight({
        preparedExecution,
        currentGrant,
        targetPolicy,
        reservation,
        simulationReport,
        currentChainId: "eip155:1952",
        currentSessionEpoch: currentGrant.sessionEpoch,
        now: new Date(FIXED_NOW.getTime() + 5_000)
      });
      assert.equal(preflightReceipt.decision, "DENY");
      assert.ok(preflightReceipt.reasonCodes.includes("wrong_chain"));
      const exposureEvent = createCreditEvent({
        eventType: CreditEventType.DELEGATED_WALLET_PENDING_EXPOSURE_RESERVED,
        subjectId: currentGrant.subjectId,
        obligationId: currentGrant.obligationId,
        payload: {
          grantId: currentGrant.grantId,
          grantHash: currentGrant.grantHash,
          reservationId: reservation.reservationId,
          reservationHash: reservation.reservationHash,
          pendingExposureMinor: currentGrant.pendingExposureMinor,
          transactionsAllowed: false,
          productionAuthority: false,
          fundsAuthority: false
        },
        now: new Date(FIXED_NOW.getTime() + 2_000)
      });
      const preparedEvent = createCreditEvent({
        eventType: CreditEventType.WALLET_EXECUTION_PREPARED,
        subjectId: preparedExecution.subjectId,
        obligationId: preparedExecution.obligationId,
        payload: {
          executionId: preparedExecution.executionId,
          preparedExecutionHash: preparedExecution.preparedExecutionHash,
          exactPayloadHash: preparedExecution.payload.exactPayloadHash,
          transactionsAllowed: false,
          productionAuthority: false,
          fundsAuthority: false
        },
        now: new Date(FIXED_NOW.getTime() + 3_000)
      });
      const preflightEvent = createCreditEvent({
        eventType: CreditEventType.WALLET_EXECUTION_PREFLIGHTED,
        subjectId: preparedExecution.subjectId,
        obligationId: preparedExecution.obligationId,
        payload: {
          executionId: preparedExecution.executionId,
          preparedExecutionHash: preparedExecution.preparedExecutionHash,
          simulationHash: simulationReport.simulationHash,
          preflightHash: preflightReceipt.preflightHash,
          decision: preflightReceipt.decision,
          transactionsAllowed: false,
          productionAuthority: false,
          fundsAuthority: false
        },
        now: new Date(FIXED_NOW.getTime() + 5_000)
      });
      const executionRecord = (recordType, record, eventId) => ({
        type: CoreProjectionType.AGENTIC_EXECUTION_RECORD,
        value: {
          recordId: {
            grant: record.grantId,
            pending_exposure: record.reservationId,
            prepared_execution: record.executionId,
            simulation_report: record.simulationReportId,
            preflight_receipt: record.preflightReceiptId
          }[recordType],
          recordType,
          record
        },
        eventId
      });
      const atomicCommand = {
        aggregateType: "wallet_execution",
        aggregateId: preparedExecution.executionId,
        idempotencyKey: "product-integration-001-atomic-execution-0001",
        commandHash: hashId("product_integration_001_atomic_execution", {
          preparedExecutionHash,
          preflightHash: preflightReceipt.preflightHash
        }),
        events: [
          {
            aggregateType: "delegated_wallet_grant",
            aggregateId: currentGrant.grantId,
            expectedVersion: activeGrant.version,
            event: exposureEvent
          },
          {
            aggregateType: "wallet_execution",
            aggregateId: preparedExecution.executionId,
            expectedVersion: 0,
            event: preparedEvent
          },
          {
            aggregateType: "wallet_execution",
            aggregateId: preparedExecution.executionId,
            expectedVersion: 1,
            event: preflightEvent
          }
        ],
        writes: [
          executionRecord("pending_exposure", reservation, exposureEvent.eventId),
          executionRecord("grant", currentGrant, exposureEvent.eventId),
          executionRecord("prepared_execution", preparedExecution, preparedEvent.eventId),
          executionRecord("simulation_report", simulationReport, preflightEvent.eventId),
          executionRecord("preflight_receipt", preflightReceipt, preflightEvent.eventId)
        ],
        response: {
          executionId: preparedExecution.executionId,
          preflightHash: preflightReceipt.preflightHash,
          atomicGatewayCommit: true
        }
      };
      const malformedWrite = structuredClone(atomicCommand.writes.at(-1));
      malformedWrite.value.recordId = `${malformedWrite.value.recordId}-mismatch`;
      await assert.rejects(
        coreRepository.commitCommand({
          ...atomicCommand,
          writes: [...atomicCommand.writes.slice(0, -1), malformedWrite]
        }),
        (error) => error.code === "invalid_core_projection"
      );
      const rolledBack = await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
        `SELECT
           (SELECT count(*)::INT FROM delegated_wallet_pending_exposures WHERE id = $1) AS reservations,
           (SELECT count(*)::INT FROM wallet_prepared_executions WHERE id = $2) AS prepared,
           (SELECT count(*)::INT FROM wallet_simulation_reports WHERE execution_id = $2) AS simulations,
           (SELECT count(*)::INT FROM wallet_transaction_preflight_receipts WHERE execution_id = $2) AS receipts,
           (SELECT version FROM delegated_wallet_grants WHERE id = $3) AS grant_version`,
        [reservation.reservationId, preparedExecution.executionId, activeGrant.grantId]
      ));
      assert.deepEqual(rolledBack.rows[0], {
        reservations: 0,
        prepared: 0,
        simulations: 0,
        receipts: 0,
        grant_version: String(activeGrant.version)
      });
      const recorded = await coreRepository.commitCommand(atomicCommand);
      assert.equal(recorded.replayed, false);
      assert.equal(recorded.response.atomicGatewayCommit, true);
      const replay = await coreRepository.commitCommand(atomicCommand);
      assert.equal(replay.replayed, true);

      const preflightRepository = new PostgresAgenticExecutionPreflightRepository({ eventRepository });
      const durable = await preflightRepository.findById(preparedExecution.executionId);
      assert.equal(durable.preparedExecution.preparedExecutionHash, preparedExecutionHash);
      assert.equal(durable.preflights.length, 1);
      assert.equal(durable.preflights[0].preflightReceipt.decision, "DENY");
      assert.equal(durable.preflights[0].simulationReport.externalCallPerformed, false);
      const proof = await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
        `SELECT
           (SELECT count(*)::INT FROM wallet_prepared_executions WHERE id = $1) AS prepared,
           (SELECT count(*)::INT FROM wallet_simulation_reports WHERE execution_id = $1) AS simulations,
           (SELECT count(*)::INT FROM wallet_transaction_preflight_receipts WHERE execution_id = $1) AS receipts,
           (SELECT count(*)::INT FROM domain_events WHERE aggregate_type = 'wallet_execution' AND aggregate_id = $1) AS events,
           (SELECT count(*)::INT FROM evidence_envelopes WHERE aggregate_type = 'wallet_execution' AND aggregate_id = $1) AS evidence,
           (SELECT count(*)::INT FROM outbox_messages WHERE message_key = $1) AS outbox`,
        [preparedExecution.executionId]
      ));
      assert.deepEqual(proof.rows[0], {
        prepared: 1,
        simulations: 1,
        receipts: 1,
        events: 2,
        evidence: 2,
        outbox: 2
      });
      const rls = await pool.query(`
        SELECT relname, relrowsecurity, relforcerowsecurity
          FROM pg_class
         WHERE relname IN (
           'wallet_prepared_executions',
           'wallet_simulation_reports',
           'wallet_transaction_preflight_receipts'
         )
         ORDER BY relname
      `);
      assert.equal(rls.rowCount, 3);
      assert.equal(rls.rows.every(({ relrowsecurity, relforcerowsecurity }) =>
        relrowsecurity && relforcerowsecurity
      ), true);
      const rlsRole = "ipo_one_exec002_rls_test";
      const dropRlsRole = async () => {
        const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [rlsRole]);
        if (exists.rowCount === 0) return;
        await pool.query(`DROP OWNED BY ${rlsRole}`);
        await pool.query(`DROP ROLE ${rlsRole}`);
      };
      await dropRlsRole();
      try {
        await pool.query(`CREATE ROLE ${rlsRole} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
        await pool.query(`GRANT USAGE ON SCHEMA public TO ${rlsRole}`);
        await pool.query(
          `GRANT SELECT ON wallet_prepared_executions,
             wallet_simulation_reports,
             wallet_transaction_preflight_receipts TO ${rlsRole}`
        );
        const isolated = await pool.connect();
        try {
          await isolated.query("BEGIN READ ONLY");
          await isolated.query(`SET LOCAL ROLE ${rlsRole}`);
          await setTenantTransactionContext(isolated, TENANT_TWO_CONTEXT);
          assert.equal(
            (await isolated.query(
              "SELECT count(*)::INT AS count FROM wallet_prepared_executions WHERE id = $1",
              [preparedExecution.executionId]
            )).rows[0].count,
            0
          );
          await isolated.query("ROLLBACK");
        } finally {
          isolated.release();
        }
      } finally {
        await dropRlsRole();
      }
      await assert.rejects(
        withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
          "UPDATE wallet_transaction_preflight_receipts SET decision = 'DENY' WHERE id = $1",
          [preflightReceipt.preflightReceiptId]
        )),
        (error) => error.code === "23514"
      );
    });

    await t.test("TC-101 Trading Capital Evidence is atomic, RLS-isolated, restart-safe, and replayable", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const repository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      await repository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "tc-101-foundation-fixture",
        commandHash: hashId("tc_101_foundation", { subjectId: fixture.subject.subjectId }),
        events: fixture.events,
        writes: fixture.writes,
        response: { created: true }
      });
      const baseline = await runtimeCounts(pool);
      const challenge = createTradingAccountBindingChallenge({
        tenantId: TENANT_CONTEXT.tenantId,
        subject: fixture.subject,
        principal: fixture.principal,
        requestedByActorId: "actor_tc_101",
        challengeNonce: `0x${"1".repeat(64)}`,
        now: new Date("2026-07-25T00:00:00.000Z")
      });
      const challengeEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_ACCOUNT_BINDING_CHALLENGE_CREATED,
        subjectId: challenge.subjectId,
        payload: {
          tradingCreditProfileId: challenge.tradingCreditProfileId,
          challengeHash: challenge.bindingChallenge.challengeHash,
          sandboxOnly: true,
          syntheticOnly: true,
          fundsAuthority: false,
          externalSystemQueried: false
        },
        now: new Date(challenge.createdAt)
      });
      const challengeCommand = {
        aggregateType: "trading_credit_profile",
        aggregateId: challenge.tradingCreditProfileId,
        idempotencyKey: "tc-101-challenge-command",
        commandHash: hashId("tc_101_challenge", {
          profileId: challenge.tradingCreditProfileId,
          challengeHash: challenge.bindingChallenge.challengeHash
        }),
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: challenge.tradingCreditProfileId,
          expectedVersion: 0,
          event: challengeEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: challenge,
          eventId: challengeEvent.eventId
        }],
        response: { profileId: challenge.tradingCreditProfileId, stage: challenge.stage }
      };
      const challengeCommit = await repository.commitCommand(challengeCommand);
      assert.equal(challengeCommit.replayed, false);

      const challengeState = await repository.eventRepository.withTenantRead((client) =>
        repository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.TRADING_CREDIT_PROFILE,
          challenge.tradingCreditProfileId
        )
      );
      const imported = importSyntheticTradingHistory({
        profile: challengeState.value,
        requestedByActorId: "actor_tc_101",
        challengeEventId: challengeState.sourceEventId,
        challengeEvidenceHash: challengeState.sourceEvidenceHash,
        now: new Date("2026-07-25T00:01:00.000Z")
      });
      const importEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_SYNTHETIC_HISTORY_IMPORTED,
        subjectId: imported.subjectId,
        payload: {
          tradingCreditProfileId: imported.tradingCreditProfileId,
          historyHash: imported.historyImport.historyHash,
          dataQuality: imported.historyImport.dataQuality,
          sandboxOnly: true,
          syntheticOnly: true,
          fundsAuthority: false,
          externalSystemQueried: false
        },
        now: new Date(imported.updatedAt)
      });
      await repository.commitCommand({
        aggregateType: "trading_credit_profile",
        aggregateId: imported.tradingCreditProfileId,
        idempotencyKey: "tc-101-import-command",
        commandHash: hashId("tc_101_import", {
          profileId: imported.tradingCreditProfileId,
          historyHash: imported.historyImport.historyHash
        }),
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: imported.tradingCreditProfileId,
          expectedVersion: challengeState.aggregateVersion,
          event: importEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: imported,
          eventId: importEvent.eventId
        }],
        response: { profileId: imported.tradingCreditProfileId, stage: imported.stage }
      });

      const importState = await repository.eventRepository.withTenantRead((client) =>
        repository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.TRADING_CREDIT_PROFILE,
          imported.tradingCreditProfileId
        )
      );
      const finalized = finalizeTradingEvidenceSnapshot({
        profile: importState.value,
        sourceProjectionHash: importState.entityHash,
        historyImportEventId: importState.sourceEventId,
        historyImportEvidenceHash: importState.sourceEvidenceHash,
        sourceFinality: importState.sourceFinality,
        now: new Date("2026-07-25T00:02:00.000Z")
      });
      const finalizeEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_EVIDENCE_SNAPSHOT_FINALIZED,
        subjectId: finalized.subjectId,
        payload: {
          tradingCreditProfileId: finalized.tradingCreditProfileId,
          evidenceSnapshotHash: finalized.evidenceSnapshot.snapshotHash,
          scorecardHash: finalized.factorScorecard.scorecardHash,
          factorCount: 5,
          pointInTime: true,
          sandboxOnly: true,
          syntheticOnly: true,
          fundsAuthority: false,
          creditApproval: false,
          externalSystemQueried: false
        },
        now: new Date(finalized.updatedAt)
      });
      const finalizeCommand = {
        aggregateType: "trading_credit_profile",
        aggregateId: finalized.tradingCreditProfileId,
        idempotencyKey: "tc-101-finalize-command",
        commandHash: hashId("tc_101_finalize", {
          profileId: finalized.tradingCreditProfileId,
          snapshotHash: finalized.evidenceSnapshot.snapshotHash
        }),
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: finalized.tradingCreditProfileId,
          expectedVersion: importState.aggregateVersion,
          event: finalizeEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: finalized,
          eventId: finalizeEvent.eventId
        }],
        response: {
          profileId: finalized.tradingCreditProfileId,
          stage: finalized.stage,
          snapshotHash: finalized.evidenceSnapshot.snapshotHash
        }
      };
      const finalizedCommit = await repository.commitCommand(finalizeCommand);
      assert.equal(finalizedCommit.replayed, false);

      const restarted = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      assert.deepEqual(
        await restarted.getTradingCreditProfile(finalized.tradingCreditProfileId),
        finalized
      );
      assert.equal(
        (await restarted.verifyProjection(
          CoreProjectionType.TRADING_CREDIT_PROFILE,
          finalized.tradingCreditProfileId
        )).matches,
        true
      );
      const replay = await restarted.commitCommand(finalizeCommand);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.response, finalizeCommand.response);
      const after = await runtimeCounts(pool);
      assert.equal(after.events - baseline.events, 3);
      assert.equal(after.evidence - baseline.evidence, 3);
      assert.equal(after.anchors - baseline.anchors, 3);
      assert.equal(after.outbox - baseline.outbox, 3);
      await assert.rejects(
        () =>
          withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
            client.query(
              "UPDATE trading_credit_profiles SET stage = 'challenge_pending', version = 1 WHERE id = $1",
              [finalized.tradingCreditProfileId]
            )
          ),
        (error) => error.code === "23514"
      );
    });

    await t.test("TC-202/203 real Evidence and non-authorizing Shadow Risk survive restart, replay, and rebinding", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const repository = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      await repository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "tc-202-foundation-fixture",
        commandHash: hashId("tc_202_foundation", {
          subjectId: fixture.subject.subjectId
        }),
        events: fixture.events,
        writes: fixture.writes,
        response: { created: true }
      });
      const baseline = await runtimeCounts(pool);
      const masterAddressHash = hashId(
        "hyperliquid_account_address",
        "0x1111111111111111111111111111111111111111"
      );
      const subaccountAddressHash = hashId(
        "hyperliquid_account_address",
        "0x2222222222222222222222222222222222222222"
      );
      const descriptor = ({
        challengeId,
        challengeHash,
        nonceHash,
        typedDataHash,
        issuedAt,
        expiresAt
      }) => ({
        challengeId,
        challengeHash,
        nonceHash,
        typedDataHash,
        masterAddressHash,
        subaccountAddressHash,
        chainId: "eip155:998",
        environment: "hyperliquid_testnet",
        infoProfileId: "hyperliquid_testnet_info.v1",
        issuedAt,
        expiresAt
      });
      const challenge = createRealTradingAccountBindingChallenge({
        tenantId: TENANT_CONTEXT.tenantId,
        subject: fixture.subject,
        principal: fixture.principal,
        requestedByActorId: "actor_tc_202",
        bindingDescriptor: descriptor({
          challengeId: "tc_202_binding_challenge_1",
          challengeHash: `0x${"1".repeat(64)}`,
          nonceHash: `0x${"2".repeat(64)}`,
          typedDataHash: `0x${"3".repeat(64)}`,
          issuedAt: "2026-07-25T01:00:00.000Z",
          expiresAt: "2026-07-25T01:05:00.000Z"
        }),
        now: new Date("2026-07-25T01:00:00.000Z")
      });
      const challengeEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_ACCOUNT_BINDING_CHALLENGE_CREATED,
        subjectId: challenge.subjectId,
        payload: {
          tradingCreditProfileId: challenge.tradingCreditProfileId,
          bindingChallengeHash: challenge.bindingChallenge.challengeHash,
          bindingEpoch: challenge.bindingEpoch,
          sandboxOnly: true,
          syntheticOnly: false,
          testnetOnly: true,
          rawSignaturePersisted: false,
          fundsAuthority: false,
          externalSystemQueried: false
        },
        now: new Date(challenge.createdAt)
      });
      await repository.commitCommand({
        aggregateType: "trading_credit_profile",
        aggregateId: challenge.tradingCreditProfileId,
        idempotencyKey: "tc-202-challenge-command",
        commandHash: hashId("tc_202_challenge", {
          challengeHash: challenge.bindingChallenge.challengeHash
        }),
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: challenge.tradingCreditProfileId,
          expectedVersion: 0,
          event: challengeEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: challenge,
          eventId: challengeEvent.eventId
        }],
        response: { stage: challenge.stage }
      });
      const challengeState = await repository.eventRepository.withTenantRead(
        (client) =>
          repository.getProjectionStateInTransaction(
            client,
            CoreProjectionType.TRADING_CREDIT_PROFILE,
            challenge.tradingCreditProfileId
          )
      );
      const imported = importRealTradingHistory({
        profile: challengeState.value,
        requestedByActorId: "actor_tc_202",
        bindingProof: {
          masterAddressHash,
          typedDataHash: challenge.bindingChallenge.typedDataHash,
          proofHash: `0x${"4".repeat(64)}`,
          verificationMethod: "eip712_eoa_master_v1",
          rawSignaturePersisted: false,
          reusableSignature: false,
          chainId: "eip155:998",
          environment: "hyperliquid_testnet",
          schemaVersion: "hyperliquid_binding_proof_result.v1"
        },
        relationship: {
          profileId: "hyperliquid_testnet_info.v1",
          environment: "testnet",
          masterAddressHash,
          subaccountAddressHash,
          sourceResponseHashes: {
            masterUserRole: `0x${"5".repeat(64)}`,
            subaccountUserRole: `0x${"6".repeat(64)}`,
            subAccounts: `0x${"7".repeat(64)}`
          },
          observedAt: "2026-07-25T01:01:00.000Z",
          relationshipHash: `0x${"8".repeat(64)}`,
          masterRole: "user",
          subaccountRole: "subAccount",
          relationshipVerified: true,
          actualAccountAddressesQueried: true,
          apiWalletAddressAccepted: false,
          readOnly: true,
          testnetOnly: true,
          externalOrderSubmitted: false,
          signerAvailable: false,
          credentialsUsed: false,
          productionAuthority: false,
          fundsAuthority: false,
          schemaVersion: "hyperliquid_account_relationship.v1"
        },
        history: {
          profileId: "hyperliquid_testnet_info.v1",
          environment: "testnet",
          accountAddressHash: subaccountAddressHash,
          windowStartsAt: "2026-06-25T01:01:00.000Z",
          windowEndsAt: "2026-07-25T01:01:00.000Z",
          sourceRoleHash: `0x${"9".repeat(64)}`,
          pageHashes: [`0x${"a".repeat(64)}`],
          eventHashes: [],
          paginationComplete: true,
          paginationStalled: false,
          pageLimitReached: false,
          sourceRetentionLimitReached: false,
          historyManifestHash: `0x${"b".repeat(64)}`,
          events: [],
          counts: {
            pageCount: 1,
            totalReturnedCount: 0,
            uniqueEventCount: 0,
            duplicateCount: 0
          },
          sourceLimits: {
            maximumPages: 5,
            maximumFillsPerPage: 2000,
            venueMostRecentFillLimit: 10000,
            maximumWindowMs: 2592000000
          },
          dataGapCodes: [
            "venue_exposes_only_10000_most_recent_fills"
          ],
          observedAt: "2026-07-25T01:01:00.000Z",
          readOnly: true,
          testnetOnly: true,
          externalOrderSubmitted: false,
          signerAvailable: false,
          credentialsUsed: false,
          productionAuthority: false,
          fundsAuthority: false,
          schemaVersion: "hyperliquid_fill_history.v1"
        },
        currentSnapshot: {
          profileId: "hyperliquid_testnet_info.v1",
          environment: "testnet",
          accountRole: "subaccount",
          accountAddressHash: subaccountAddressHash,
          verifiedMasterAddressHash: masterAddressHash,
          accountRoleVerified: true,
          equity: {
            accountValue: "1000",
            withdrawable: "1000"
          },
          counts: {
            positions: 0,
            openOrders: 0
          },
          sourceBundleHash: `0x${"c".repeat(64)}`,
          snapshotHash: `0x${"d".repeat(64)}`,
          observedAt: "2026-07-25T01:01:30.000Z",
          venueTime: "2026-07-25T01:01:29.000Z",
          freshness: "fresh",
          readOnly: true,
          testnetOnly: true,
          externalOrderSubmitted: false,
          signerAvailable: false,
          credentialsUsed: false,
          productionAuthority: false,
          fundsAuthority: false,
          schemaVersion: "hyperliquid_info_account_snapshot.v1"
        },
        challengeEventId: challengeState.sourceEventId,
        challengeEvidenceHash: challengeState.sourceEvidenceHash,
        now: new Date("2026-07-25T01:02:00.000Z")
      });
      const importEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_HYPERLIQUID_HISTORY_IMPORTED,
        subjectId: imported.subjectId,
        payload: {
          tradingCreditProfileId: imported.tradingCreditProfileId,
          historyHash: imported.historyImport.historyHash,
          relationshipHash: imported.accountBinding.relationshipHash,
          bindingEpoch: imported.bindingEpoch,
          rawEventsPersisted: false,
          rawSignaturePersisted: false,
          fundsAuthority: false
        },
        now: new Date(imported.updatedAt)
      });
      await repository.commitCommand({
        aggregateType: "trading_credit_profile",
        aggregateId: imported.tradingCreditProfileId,
        idempotencyKey: "tc-202-import-command",
        commandHash: hashId("tc_202_import", {
          historyHash: imported.historyImport.historyHash
        }),
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: imported.tradingCreditProfileId,
          expectedVersion: challengeState.aggregateVersion,
          event: importEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: imported,
          eventId: importEvent.eventId
        }],
        response: { stage: imported.stage }
      });
      const importState = await repository.eventRepository.withTenantRead(
        (client) =>
          repository.getProjectionStateInTransaction(
            client,
            CoreProjectionType.TRADING_CREDIT_PROFILE,
            imported.tradingCreditProfileId
          )
      );
      const finalized = finalizeRealTradingEvidenceSnapshot({
        profile: importState.value,
        sourceProjectionHash: importState.entityHash,
        historyImportEventId: importState.sourceEventId,
        historyImportEvidenceHash: importState.sourceEvidenceHash,
        sourceFinality: importState.sourceFinality,
        now: new Date("2026-07-25T01:03:00.000Z")
      });
      const finalizedEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_EVIDENCE_SNAPSHOT_FINALIZED,
        subjectId: finalized.subjectId,
        payload: {
          tradingCreditProfileId: finalized.tradingCreditProfileId,
          evidenceSnapshotHash: finalized.evidenceSnapshot.snapshotHash,
          authorizing: false,
          fundsAuthority: false
        },
        now: new Date(finalized.updatedAt)
      });
      await repository.commitCommand({
        aggregateType: "trading_credit_profile",
        aggregateId: finalized.tradingCreditProfileId,
        idempotencyKey: "tc-202-finalize-command",
        commandHash: hashId("tc_202_finalize", {
          snapshotHash: finalized.evidenceSnapshot.snapshotHash
        }),
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: finalized.tradingCreditProfileId,
          expectedVersion: importState.aggregateVersion,
          event: finalizedEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: finalized,
          eventId: finalizedEvent.eventId
        }],
        response: { stage: finalized.stage }
      });

      const restarted = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const durableFinalized = await restarted.getTradingCreditProfile(
        finalized.tradingCreditProfileId
      );
      assert.deepEqual(durableFinalized, finalized);
      assert.equal(
        durableFinalized.factorScorecard.schemaVersion,
        "trading_real_factor_scorecard.v2"
      );
      assert.equal(
        durableFinalized.factorScorecard.shadowRisk.features.length,
        16
      );
      assert.equal(
        durableFinalized.factorScorecard.shadowRisk.authorizing,
        false
      );
      assert.equal(
        durableFinalized.factorScorecard.shadowRisk.economicStateMutation,
        false
      );
      assert.deepEqual(
        durableFinalized.factorScorecard.shadowRisk.stressWindows.map(
          ({ windowId, state }) => [windowId, state]
        ),
        [
          ["observed_history", "observed"],
          ["out_of_time", "insufficient"],
          ["tail_stress", "insufficient"]
        ]
      );
      const finalizedState = await restarted.eventRepository.withTenantRead(
        (client) =>
          restarted.getProjectionStateInTransaction(
            client,
            CoreProjectionType.TRADING_CREDIT_PROFILE,
            finalized.tradingCreditProfileId
          )
      );
      const rebound = createRealTradingAccountBindingChallenge({
        tenantId: TENANT_CONTEXT.tenantId,
        subject: fixture.subject,
        principal: fixture.principal,
        requestedByActorId: "actor_tc_202",
        bindingDescriptor: descriptor({
          challengeId: "tc_202_binding_challenge_2",
          challengeHash: `0x${"e".repeat(64)}`,
          nonceHash: `0x${"f".repeat(64)}`,
          typedDataHash: `0x${"1".repeat(64)}`,
          issuedAt: "2026-07-25T01:04:00.000Z",
          expiresAt: "2026-07-25T01:09:00.000Z"
        }),
        existingProfile: finalizedState.value,
        now: new Date("2026-07-25T01:04:00.000Z")
      });
      const reboundEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_ACCOUNT_BINDING_CHALLENGE_CREATED,
        subjectId: rebound.subjectId,
        payload: {
          tradingCreditProfileId: rebound.tradingCreditProfileId,
          bindingEpoch: rebound.bindingEpoch,
          priorEvidenceSnapshotHash:
            rebound.priorEvidenceInvalidation.evidenceSnapshotHash,
          priorEvidenceActive: false,
          fundsAuthority: false
        },
        now: new Date(rebound.updatedAt)
      });
      const reboundCommand = {
        aggregateType: "trading_credit_profile",
        aggregateId: rebound.tradingCreditProfileId,
        idempotencyKey: "tc-202-rebind-command",
        commandHash: hashId("tc_202_rebind", {
          challengeHash: rebound.bindingChallenge.challengeHash
        }),
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: rebound.tradingCreditProfileId,
          expectedVersion: finalizedState.aggregateVersion,
          event: reboundEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: rebound,
          eventId: reboundEvent.eventId
        }],
        response: {
          stage: rebound.stage,
          bindingEpoch: rebound.bindingEpoch
        }
      };
      const reboundCommit = await restarted.commitCommand(reboundCommand);
      assert.equal(reboundCommit.replayed, false);
      const afterRestart = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const durableRebound = await afterRestart.getTradingCreditProfile(
        rebound.tradingCreditProfileId
      );
      assert.equal(durableRebound.bindingEpoch, 2);
      assert.equal(durableRebound.evidenceAuthority.active, false);
      assert.equal(durableRebound.priorEvidenceInvalidation.active, false);
      assert.equal(durableRebound.externalSystemQueried, true);
      assert.equal(
        JSON.stringify(durableRebound).includes("masterAccountAddress"),
        false
      );
      assert.equal(
        JSON.stringify(durableRebound).includes("signature"),
        false
      );
      const replay = await afterRestart.commitCommand(reboundCommand);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.response, reboundCommand.response);
      const after = await runtimeCounts(pool);
      assert.equal(after.events - baseline.events, 4);
      assert.equal(after.evidence - baseline.evidence, 4);
      assert.equal(after.anchors - baseline.anchors, 4);
      assert.equal(after.outbox - baseline.outbox, 4);
    });

    let tc103Seed;
    let tc104Seed;
    await t.test("TC-102 no-funds matching is durable, race-safe, RLS-isolated, and restart-recoverable", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const repository = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        transactionRetries: 10
      });
      await repository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "tc-102-foundation-fixture",
        commandHash: hashId("tc_102_foundation", {
          subjectId: fixture.subject.subjectId
        }),
        events: fixture.events,
        writes: fixture.writes,
        response: { created: true }
      });

      const challenge = createTradingAccountBindingChallenge({
        tenantId: TENANT_CONTEXT.tenantId,
        subject: fixture.subject,
        principal: fixture.principal,
        requestedByActorId: "actor_tc_102_subject",
        challengeNonce: `0x${"1".repeat(64)}`,
        now: new Date("2026-07-25T01:00:00.000Z")
      });
      const imported = importSyntheticTradingHistory({
        profile: challenge,
        requestedByActorId: "actor_tc_102_subject",
        challengeEventId: "event_tc_102_challenge",
        challengeEvidenceHash: `0x${"2".repeat(64)}`,
        now: new Date("2026-07-25T01:01:00.000Z")
      });
      const profile = finalizeTradingEvidenceSnapshot({
        profile: imported,
        sourceProjectionHash: `0x${"3".repeat(64)}`,
        historyImportEventId: "event_tc_102_import",
        historyImportEvidenceHash: `0x${"4".repeat(64)}`,
        sourceFinality: "finalized",
        now: new Date("2026-07-25T01:02:00.000Z")
      });
      const profileEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_EVIDENCE_SNAPSHOT_FINALIZED,
        subjectId: profile.subjectId,
        payload: {
          tradingCreditProfileId: profile.tradingCreditProfileId,
          evidenceSnapshotHash: profile.evidenceSnapshot.snapshotHash,
          syntheticOnly: true,
          productionAuthority: false,
          fundsAuthority: false
        },
        now: new Date(profile.updatedAt)
      });
      await repository.commitCommand({
        aggregateType: "trading_credit_profile",
        aggregateId: profile.tradingCreditProfileId,
        idempotencyKey: "tc-102-finalized-profile",
        commandHash: hashId("tc_102_finalized_profile", {
          profileId: profile.tradingCreditProfileId,
          snapshotHash: profile.evidenceSnapshot.snapshotHash
        }),
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: profile.tradingCreditProfileId,
          expectedVersion: 0,
          event: profileEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: profile,
          eventId: profileEvent.eventId
        }],
        response: { profileId: profile.tradingCreditProfileId }
      });

      const capitalRequest = createTradingCapitalRequest({
        tradingCreditProfile: profile,
        requestedByActorId: "actor_tc_102_subject",
        templateType: "hybrid",
        strategyClass: "market_neutral",
        assetId: "urn:ipo-one:sandbox-asset:usd-cent",
        requestedAmountMinor: "500000",
        durationDays: 90,
        now: new Date("2026-07-25T01:03:00.000Z")
      });
      const requestEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_CAPITAL_REQUEST_CREATED,
        subjectId: capitalRequest.subjectId,
        payload: {
          tradingCapitalRequestId: capitalRequest.tradingCapitalRequestId,
          requestHash: capitalRequest.requestHash,
          riskClassCallerSupplied: false,
          autoMatch: false,
          fundsAuthority: false
        },
        now: new Date(capitalRequest.createdAt)
      });
      await repository.commitCommand({
        aggregateType: "trading_capital_request",
        aggregateId: capitalRequest.tradingCapitalRequestId,
        idempotencyKey: "tc-102-capital-request",
        commandHash: hashId("tc_102_capital_request", {
          requestHash: capitalRequest.requestHash
        }),
        events: [{
          aggregateType: "trading_capital_request",
          aggregateId: capitalRequest.tradingCapitalRequestId,
          expectedVersion: 0,
          event: requestEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CAPITAL_REQUEST,
          value: capitalRequest,
          eventId: requestEvent.eventId
        }],
        response: {
          tradingCapitalRequestId: capitalRequest.tradingCapitalRequestId
        }
      });

      const providerMandate = createTradingProviderMandate({
        provider: fixture.provider,
        providerActorId: "actor_tc_102_provider",
        supportedTemplateTypes: ["credit", "hybrid"],
        allowedSubjectTypes: ["human", "agent"],
        allowedStrategyClasses: ["market_neutral", "directional"],
        assetId: "urn:ipo-one:sandbox-asset:usd-cent",
        minAmountMinor: "500000",
        maxAmountMinor: "2000000",
        minDurationDays: 30,
        maxDurationDays: 180,
        now: new Date("2026-07-25T01:04:00.000Z")
      });
      const mandateEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_PROVIDER_MANDATE_CREATED,
        payload: {
          tradingProviderMandateId:
            providerMandate.tradingProviderMandateId,
          mandateHash: providerMandate.mandateHash,
          providerId: providerMandate.providerId,
          selfDeclaredRiskClassAccepted: false,
          fundsAuthority: false
        },
        now: new Date(providerMandate.createdAt)
      });
      await repository.commitCommand({
        aggregateType: "trading_provider_mandate",
        aggregateId: providerMandate.tradingProviderMandateId,
        idempotencyKey: "tc-102-provider-mandate",
        commandHash: hashId("tc_102_provider_mandate", {
          mandateHash: providerMandate.mandateHash
        }),
        events: [{
          aggregateType: "trading_provider_mandate",
          aggregateId: providerMandate.tradingProviderMandateId,
          expectedVersion: 0,
          event: mandateEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_PROVIDER_MANDATE,
          value: providerMandate,
          eventId: mandateEvent.eventId
        }],
        response: {
          tradingProviderMandateId:
            providerMandate.tradingProviderMandateId
        }
      });

      const compatible = listCompatibleTradingProviderMandates({
        capitalRequest,
        providerMandates: [providerMandate],
        now: new Date("2026-07-25T01:05:00.000Z")
      });
      assert.equal(compatible.compatibleMandateCount, 1);
      assert.equal(compatible.hardFiltersAppliedBeforeRanking, true);
      assert.equal(compatible.matches[0].rank, 1);
      const proposal = createTradingMatchProposal({
        capitalRequest,
        providerMandate,
        requestedRequestHash: capitalRequest.requestHash,
        requestedMandateHash: providerMandate.mandateHash,
        now: new Date("2026-07-25T01:05:00.000Z")
      });
      const proposalEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_MATCH_PROPOSAL_CREATED,
        subjectId: proposal.subjectId,
        payload: {
          tradingMatchProposalId: proposal.tradingMatchProposalId,
          proposalHash: proposal.proposalHash,
          termsHash: proposal.termsHash,
          autoAccepted: false,
          fundsAuthority: false
        },
        now: new Date(proposal.createdAt)
      });
      await repository.commitCommand({
        aggregateType: "trading_match_proposal",
        aggregateId: proposal.tradingMatchProposalId,
        idempotencyKey: "tc-102-match-proposal",
        commandHash: hashId("tc_102_match_proposal", {
          proposalHash: proposal.proposalHash
        }),
        events: [{
          aggregateType: "trading_match_proposal",
          aggregateId: proposal.tradingMatchProposalId,
          expectedVersion: 0,
          event: proposalEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_MATCH_PROPOSAL,
          value: proposal,
          eventId: proposalEvent.eventId
        }],
        response: { proposalId: proposal.tradingMatchProposalId }
      });

      const providerAccepted = acceptTradingMatchAsProvider({
        proposal,
        capitalRequest,
        providerMandate,
        acceptedByActorId: "actor_tc_102_provider",
        acceptedProposalHash: proposal.proposalHash,
        acceptedTermsHash: proposal.termsHash,
        now: new Date("2026-07-25T01:06:00.000Z")
      });
      const subjectAccepted = acceptTradingMatchAsSubject({
        proposal,
        capitalRequest,
        providerMandate,
        acceptedByActorId: "actor_tc_102_subject",
        acceptedProposalHash: proposal.proposalHash,
        acceptedTermsHash: proposal.termsHash,
        now: new Date("2026-07-25T01:06:00.001Z")
      });
      const acceptanceCommand = ({
        value,
        side,
        eventType
      }) => {
        const event = createCreditEvent({
          eventType,
          subjectId: value.subjectId,
          payload: {
            tradingMatchProposalId: value.tradingMatchProposalId,
            proposalHash: value.proposalHash,
            termsHash: value.termsHash,
            side,
            exactTerms: true,
            fundsAuthority: false
          },
          now: new Date(value.updatedAt)
        });
        return {
          aggregateType: "trading_match_proposal",
          aggregateId: value.tradingMatchProposalId,
          idempotencyKey: `tc-102-${side}-acceptance-race`,
          commandHash: hashId("tc_102_acceptance", {
            side,
            proposalHash: value.proposalHash,
            termsHash: value.termsHash
          }),
          events: [{
            aggregateType: "trading_match_proposal",
            aggregateId: value.tradingMatchProposalId,
            expectedVersion: 1,
            event
          }],
          writes: [{
            type: CoreProjectionType.TRADING_MATCH_PROPOSAL,
            value,
            eventId: event.eventId
          }],
          response: { side, status: value.status }
        };
      };
      const providerRaceCommand = acceptanceCommand({
        value: providerAccepted,
        side: "provider",
        eventType: CreditEventType.TRADING_MATCH_PROVIDER_ACCEPTED
      });
      const subjectRaceCommand = acceptanceCommand({
        value: subjectAccepted,
        side: "subject",
        eventType: CreditEventType.TRADING_MATCH_SUBJECT_ACCEPTED
      });
      const racingRepository = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        transactionRetries: 10
      });
      const race = await Promise.allSettled([
        repository.commitCommand(providerRaceCommand),
        racingRepository.commitCommand(subjectRaceCommand)
      ]);
      assert.equal(
        race.filter(({ status }) => status === "fulfilled").length,
        1
      );
      assert.equal(
        race.filter(({ status }) => status === "rejected").length,
        1
      );

      const partialState = await repository.eventRepository.withTenantRead(
        (client) => repository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.TRADING_MATCH_PROPOSAL,
          proposal.tradingMatchProposalId
        )
      );
      assert.equal(
        ["provider_accepted", "subject_accepted"].includes(
          partialState.value.status
        ),
        true
      );
      const missingSide =
        partialState.value.status === "provider_accepted"
          ? "subject"
          : "provider";
      const finalProposal =
        missingSide === "subject"
          ? acceptTradingMatchAsSubject({
              proposal: partialState.value,
              capitalRequest,
              providerMandate,
              acceptedByActorId: "actor_tc_102_subject",
              acceptedProposalHash: proposal.proposalHash,
              acceptedTermsHash: proposal.termsHash,
              now: new Date("2026-07-25T01:07:00.000Z")
            })
          : acceptTradingMatchAsProvider({
              proposal: partialState.value,
              capitalRequest,
              providerMandate,
              acceptedByActorId: "actor_tc_102_provider",
              acceptedProposalHash: proposal.proposalHash,
              acceptedTermsHash: proposal.termsHash,
              now: new Date("2026-07-25T01:07:00.000Z")
            });
      const finalEvent = createCreditEvent({
        eventType:
          missingSide === "subject"
            ? CreditEventType.TRADING_MATCH_SUBJECT_ACCEPTED
            : CreditEventType.TRADING_MATCH_PROVIDER_ACCEPTED,
        subjectId: finalProposal.subjectId,
        payload: {
          tradingMatchProposalId: finalProposal.tradingMatchProposalId,
          proposalHash: finalProposal.proposalHash,
          termsHash: finalProposal.termsHash,
          side: missingSide,
          exactTerms: true,
          bilaterallyAccepted: true,
          fundsAuthority: false
        },
        now: new Date(finalProposal.updatedAt)
      });
      const finalCommand = {
        aggregateType: "trading_match_proposal",
        aggregateId: finalProposal.tradingMatchProposalId,
        idempotencyKey: `tc-102-${missingSide}-acceptance-retry`,
        commandHash: hashId("tc_102_acceptance_retry", {
          side: missingSide,
          proposalHash: finalProposal.proposalHash,
          termsHash: finalProposal.termsHash
        }),
        events: [{
          aggregateType: "trading_match_proposal",
          aggregateId: finalProposal.tradingMatchProposalId,
          expectedVersion: partialState.aggregateVersion,
          event: finalEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_MATCH_PROPOSAL,
          value: finalProposal,
          eventId: finalEvent.eventId
        }],
        response: {
          status: finalProposal.status,
          version: finalProposal.version
        }
      };
      await repository.commitCommand(finalCommand);

      const restarted = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const durable = await restarted.getTradingMatchProposal(
        proposal.tradingMatchProposalId
      );
      assert.equal(durable.status, "bilaterally_accepted");
      assert.equal(durable.version, 3);
      assert.equal(durable.termsHash, proposal.termsHash);
      assert.equal(durable.providerAcceptance.exactTerms, true);
      assert.equal(durable.subjectAcceptance.exactTerms, true);
      assert.equal(durable.fundsAuthority, false);
      assert.equal(
        (await restarted.verifyProjection(
          CoreProjectionType.TRADING_MATCH_PROPOSAL,
          proposal.tradingMatchProposalId
        )).matches,
        true
      );
      assert.equal((await restarted.commitCommand(finalCommand)).replayed, true);

      const rlsRole =
        `ipo_one_tc102_rls_${randomBytes(6).toString("hex")}`;
      await pool.query(
        `CREATE ROLE ${rlsRole}
         NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
         NOINHERIT NOREPLICATION NOBYPASSRLS`
      );
      try {
        await pool.query(`GRANT USAGE ON SCHEMA public TO ${rlsRole}`);
        await pool.query(
          `GRANT SELECT ON
             trading_capital_requests,
             trading_provider_mandates,
             trading_match_proposals
           TO ${rlsRole}`
        );
        const hidden = await (async () => {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query(`SET LOCAL ROLE ${rlsRole}`);
            await setTenantTransactionContext(client, TENANT_TWO_CONTEXT);
            const result = await client.query(
              `SELECT
                 (SELECT count(*)::int FROM trading_capital_requests
                   WHERE id = $1) AS requests,
                 (SELECT count(*)::int FROM trading_provider_mandates
                   WHERE id = $2) AS mandates,
                 (SELECT count(*)::int FROM trading_match_proposals
                   WHERE id = $3) AS proposals`,
              [
                capitalRequest.tradingCapitalRequestId,
                providerMandate.tradingProviderMandateId,
                proposal.tradingMatchProposalId
              ]
            );
            await client.query("COMMIT");
            return result.rows[0];
          } catch (error) {
            try {
              await client.query("ROLLBACK");
            } catch {
              // Preserve the original test failure.
            }
            throw error;
          } finally {
            client.release();
          }
        })();
        assert.deepEqual(hidden, {
          requests: 0,
          mandates: 0,
          proposals: 0
        });
      } finally {
        await pool.query(`DROP OWNED BY ${rlsRole}`);
        await pool.query(`DROP ROLE ${rlsRole}`);
      }

      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
          client.query(
            "UPDATE trading_capital_requests SET requested_amount_minor = 1 WHERE id = $1",
            [capitalRequest.tradingCapitalRequestId]
          )
        ),
        (error) => error.code === "23514"
      );
      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
          client.query(
            "UPDATE trading_match_proposals SET terms_hash = $2 WHERE id = $1",
            [
              proposal.tradingMatchProposalId,
              `0x${"f".repeat(64)}`
            ]
          )
        ),
        (error) => error.code === "23514"
      );

      const reconciliation = new PostgresReconciliationService({
        pool,
        tenantContext: TENANT_CONTEXT,
        coreRepository: restarted,
        eventRepository: restarted.eventRepository,
        approvalService: {
          assertApproved() {
            throw new Error("repair is not authorized in the clean path");
          }
        }
      });
      const reconciled = await reconciliation.run({
        initiatedBy: "system:test-tc-102-reconciliation",
        idempotencyKey: "tc-102-reconciliation-clean-0001"
      });
      assert.equal(
        reconciled.status,
        "passed",
        JSON.stringify(await reconciliation.getRun(reconciled.runId))
      );
      tc103Seed = { fixture, finalProposal };
    });

    if (process.env.IPO_ONE_PERSIST_HYPERCORE_002D_TC102_FIXTURE === "true") {
      assert.notEqual(
        process.env.CI,
        "true",
        "the HYPERLIQUID-002D local fixture must never be persisted in CI"
      );
      return;
    }

    await t.test("TC-103 synthetic Facility is durable, race-safe, monotonic, RLS-isolated, and restart-recoverable", async () => {
      assert.ok(tc103Seed, "TC-102 accepted-match foundation must be durable");
      const { fixture, finalProposal } = tc103Seed;
      const repository = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        transactionRetries: 10
      });
      const setupAt = new Date("2026-07-25T01:10:00.000Z");
      const facilityMandate = {
        ...createMandate({
          principalId: fixture.principal.principalId,
          subjectId: fixture.subject.subjectId,
          capabilities: Object.values(MandateCapability),
          allowedProviderIds: [fixture.provider.providerId],
          allowedCategories: ["trading_capital_synthetic"],
          assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
          perActionLimitMinor: "2000000",
          aggregateLimitMinor: "2000000",
          validFrom: setupAt.toISOString(),
          expiresAt: new Date(setupAt.getTime() + 180 * 86400_000).toISOString(),
          nonce: "tc-103-canonical-obligation-mandate",
          termsRef: "urn:ipo.one:tc-103:canonical-obligation:v1",
          now: setupAt
        }),
        status: MandateStatus.ACTIVE
      };
      const submittedIntent = createCreditIntent({
        subjectId: fixture.subject.subjectId,
        principalId: fixture.principal.principalId,
        authorityType: CreditAuthorityType.MANDATE,
        authorityRef: facilityMandate.mandateId,
        assetId: finalProposal.terms.assetId,
        requestedPrincipalMinor: finalProposal.terms.syntheticPrincipalMinor,
        purposeCode: "trading_capital_synthetic",
        requestedTermDays: 90,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        installmentCount: 3,
        now: setupAt
      });
      const outcome = createDeterministicCreditDecisionOutcome({
        intent: submittedIntent,
        now: setupAt
      });
      const decidedIntent = {
        ...submittedIntent,
        status: CreditIntentStatus.DECIDED,
        updatedAt: setupAt.toISOString()
      };
      const acceptance = createCreditOfferAcceptance({
        offer: outcome.offer,
        intent: decidedIntent,
        decision: outcome.decision,
        authorityType: CreditAuthorityType.MANDATE,
        authorityRef: facilityMandate.mandateId,
        acknowledgementHash: `0x${"5".repeat(64)}`,
        acceptedByActorId: "actor_tc_102_subject",
        now: setupAt
      });
      const acceptedOffer = acceptCreditOffer(outcome.offer, {
        expectedOfferHash: outcome.offer.creditOfferHash,
        expectedTermsHash: outcome.offer.termsHash,
        acceptanceId: acceptance.creditOfferAcceptanceId,
        now: setupAt
      });
      const pendingObligation = createAcceptedOfferObligation({
        offer: acceptedOffer,
        intent: decidedIntent,
        decision: outcome.decision,
        acceptance,
        now: setupAt
      });
      const facilityCreditLine = createCreditLine({
        subjectId: pendingObligation.subjectId,
        mandateId: facilityMandate.mandateId,
        assetId: pendingObligation.assetId,
        limitMinor: pendingObligation.originalPrincipalMinor,
        utilizedMinor: pendingObligation.originalPrincipalMinor,
        riskSnapshotId: outcome.decision.riskDecisionId,
        now: setupAt
      });
      const decisionEvent = createCreditEvent({
        eventType: "tc_103_canonical_offer_decided",
        subjectId: decidedIntent.subjectId,
        payload: {
          creditIntentId: decidedIntent.creditIntentId,
          creditOfferId: outcome.offer.creditOfferId,
          matchProposalId: finalProposal.tradingMatchProposalId,
          sandboxOnly: true,
          productionFundsMoved: false
        },
        now: setupAt
      });
      await repository.commitCommand({
        aggregateType: "credit_intent",
        aggregateId: decidedIntent.creditIntentId,
        idempotencyKey: "tc-103-canonical-offer-decision",
        commandHash: hashId("tc_103_offer_decision", {
          decisionHash: outcome.decision.decisionHash,
          offerHash: outcome.offer.creditOfferHash
        }),
        events: [{
          aggregateType: "credit_intent",
          aggregateId: decidedIntent.creditIntentId,
          expectedVersion: 0,
          event: decisionEvent
        }],
        writes: [
          {
            type: CoreProjectionType.MANDATE,
            value: facilityMandate,
            eventId: decisionEvent.eventId
          },
          {
            type: CoreProjectionType.CREDIT_INTENT,
            value: decidedIntent,
            eventId: decisionEvent.eventId
          },
          {
            type: CoreProjectionType.RISK_DECISION,
            value: outcome.decision,
            eventId: decisionEvent.eventId
          },
          {
            type: CoreProjectionType.CREDIT_OFFER,
            value: outcome.offer,
            eventId: decisionEvent.eventId
          }
        ],
        response: { creditOfferId: outcome.offer.creditOfferId }
      });
      const acceptanceEvent = createCreditEvent({
        eventType: "tc_103_canonical_obligation_created",
        subjectId: pendingObligation.subjectId,
        obligationId: pendingObligation.obligationId,
        payload: {
          obligationId: pendingObligation.obligationId,
          creditOfferAcceptanceId: acceptance.creditOfferAcceptanceId,
          matchProposalId: finalProposal.tradingMatchProposalId,
          sandboxOnly: true,
          productionFundsMoved: false
        },
        now: setupAt
      });
      await repository.commitCommand({
        aggregateType: "obligation",
        aggregateId: pendingObligation.obligationId,
        idempotencyKey: "tc-103-canonical-obligation-setup",
        commandHash: hashId("tc_103_obligation_setup", {
          obligationHash: pendingObligation.obligationHash
        }),
        events: [{
          aggregateType: "obligation",
          aggregateId: pendingObligation.obligationId,
          expectedVersion: 0,
          event: acceptanceEvent
        }],
        writes: [
          {
            type: CoreProjectionType.CREDIT_OFFER_ACCEPTANCE,
            value: acceptance,
            eventId: acceptanceEvent.eventId
          },
          {
            type: CoreProjectionType.CREDIT_OFFER,
            value: acceptedOffer,
            eventId: acceptanceEvent.eventId
          },
          {
            type: CoreProjectionType.OBLIGATION,
            value: pendingObligation,
            eventId: acceptanceEvent.eventId
          }
        ],
        response: { obligationId: pendingObligation.obligationId }
      });

      const executionAt = new Date("2026-07-25T01:11:00.000Z");
      const execution = executeSandboxObligation(pendingObligation, {
        adapterReceipt: {
          obligationId: pendingObligation.obligationId,
          assetId: pendingObligation.assetId,
          amountMinor: pendingObligation.originalPrincipalMinor,
          adapterId: "sandbox_rail_tc_103",
          adapterVersion: "1.0.0",
          adapterKeyId: `0x${"7".repeat(64)}`,
          messageHash: `0x${"6".repeat(64)}`,
          signature: `ed25519:${"8".repeat(64)}`,
          issuedAt: executionAt.toISOString(),
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false
        },
        now: executionAt
      });
      const executionEvent = createCreditEvent({
        eventType: CreditEventType.OBLIGATION_SANDBOX_EXECUTED,
        subjectId: execution.obligation.subjectId,
        obligationId: execution.obligation.obligationId,
        payload: {
          obligationId: execution.obligation.obligationId,
          sandboxExecutionReceiptId:
            execution.receipt.sandboxExecutionReceiptId,
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false
        },
        now: executionAt
      });
      await repository.commitCommand({
        aggregateType: "obligation",
        aggregateId: execution.obligation.obligationId,
        idempotencyKey: "tc-103-canonical-obligation-execution",
        commandHash: hashId("tc_103_obligation_execution", {
          receiptHash: execution.receipt.receiptHash
        }),
        events: [{
          aggregateType: "obligation",
          aggregateId: execution.obligation.obligationId,
          expectedVersion: 1,
          event: executionEvent
        }],
        writes: [
          ...Object.values(execution.accounts).map((value) => ({
            type: CoreProjectionType.LEDGER_ACCOUNT,
            value,
            eventId: executionEvent.eventId
          })),
          {
            type: CoreProjectionType.LEDGER_TRANSACTION,
            value: execution.ledgerTransaction,
            eventId: executionEvent.eventId
          },
          {
            type: CoreProjectionType.SANDBOX_EXECUTION_RECEIPT,
            value: execution.receipt,
            eventId: executionEvent.eventId
          },
          {
            type: CoreProjectionType.OBLIGATION,
            value: execution.obligation,
            eventId: executionEvent.eventId
          },
          {
            type: CoreProjectionType.CREDIT_LINE,
            value: facilityCreditLine,
            eventId: executionEvent.eventId
          }
        ],
        response: { obligationId: execution.obligation.obligationId }
      });

      const facility = createTradingFacility({
        matchProposal: finalProposal,
        obligation: execution.obligation,
        createdByActorId: "actor_tc_102_subject",
        now: new Date("2026-07-25T01:12:00.000Z")
      });
      const facilityEvent = (eventType, value, now) => createCreditEvent({
        eventType,
        subjectId: value.subjectId,
        obligationId: value.obligationId,
        payload: {
          tradingFacilityId: value.tradingFacilityId,
          stateHash: value.stateHash,
          lifecycleStatus: value.lifecycleStatus,
          riskState: value.riskState,
          syntheticOnly: true,
          productionAuthority: false,
          fundsAuthority: false
        },
        now
      });
      const facilityCommand = ({
        value,
        eventType,
        idempotencyKey,
        expectedVersion,
        now
      }) => {
        const event = facilityEvent(eventType, value, now);
        return {
          aggregateType: "trading_facility",
          aggregateId: value.tradingFacilityId,
          idempotencyKey,
          commandHash: hashId("tc_103_facility_command", {
            idempotencyKey,
            stateHash: value.stateHash
          }),
          events: [{
            aggregateType: "trading_facility",
            aggregateId: value.tradingFacilityId,
            expectedVersion,
            event
          }],
          writes: [{
            type: CoreProjectionType.TRADING_FACILITY,
            value,
            eventId: event.eventId
          }],
          response: {
            tradingFacilityId: value.tradingFacilityId,
            stateHash: value.stateHash,
            version: value.version
          }
        };
      };
      await repository.commitCommand(facilityCommand({
        value: facility,
        eventType: CreditEventType.TRADING_FACILITY_CREATED,
        idempotencyKey: "tc-103-facility-created",
        expectedVersion: 0,
        now: new Date(facility.createdAt)
      }));

      const hypercoreMasterAddress =
        "0x1111111111111111111111111111111111111111";
      const hypercoreSubaccountAddress =
        "0x2222222222222222222222222222222222222222";
      const hypercoreDelegateAddress =
        "0x3333333333333333333333333333333333333333";
      const hypercoreBinding = createHypercoreAccountBinding({
        facilityId: facility.tradingFacilityId,
        facilityHash: facility.facilityHash,
        accountRole: "subaccount",
        masterAccountAddress: hypercoreMasterAddress,
        subaccountAddress: hypercoreSubaccountAddress,
        bindingProofHash: hashId("hypercore_002b_binding_proof", {
          facilityId: facility.tradingFacilityId
        }),
        bindingVersion: 1
      });
      const hypercoreRepository =
        new PostgresHypercoreDelegateRepository({
          coreRepository: repository
        });
      const durableHypercoreBinding = await hypercoreRepository.recordBinding({
        binding: hypercoreBinding,
        idempotencyKey: "hypercore-002b-binding-0001",
        now: new Date("2026-07-25T01:12:01.000Z")
      });
      assert.deepEqual(durableHypercoreBinding, hypercoreBinding);
      const delegateAddressHash = hashId(
        "hypercore_account_address",
        hypercoreDelegateAddress
      );
      const preparedHypercoreDelegate = await hypercoreRepository.prepare({
        bindingId: hypercoreBinding.accountBindingId,
        apiWalletAddressHash: delegateAddressHash,
        signerReferenceHash: hashId("hypercore_002b_signer_reference", {
          facilityId: facility.tradingFacilityId
        }),
        delegateNameHash: hashId("hypercore_delegate_name", "hypercore-002b"),
        expiresAt: new Date("2026-07-26T01:12:02.000Z"),
        idempotencyKey: "hypercore-002b-prepare-0001",
        now: new Date("2026-07-25T01:12:02.000Z")
      });
      assert.equal(
        preparedHypercoreDelegate.status,
        HypercoreDelegateStatus.PREPARED
      );
      assert.equal(
        JSON.stringify({
          binding: durableHypercoreBinding,
          delegate: preparedHypercoreDelegate
        }).includes(hypercoreDelegateAddress),
        false
      );
      const restartedHypercoreRepository =
        new PostgresHypercoreDelegateRepository({
          coreRepository: new PostgresCoreRepository({
            pool,
            tenantContext: TENANT_CONTEXT
          })
        });
      assert.deepEqual(
        await restartedHypercoreRepository.find(
          preparedHypercoreDelegate.delegateId
        ),
        preparedHypercoreDelegate
      );
      const hypercore002dRiskSnapshot = {
        accountBindingHash: hypercoreBinding.accountBindingHash,
        metadataHash: hashId("hypercore_002d_market_metadata", {
          market: "BTC",
          assetIndex: 3
        }),
        metadataObservedAt: "2026-07-25T01:11:30.000Z",
        observedAt: "2026-07-25T01:12:02.200Z",
        status: "FRESH",
        openOrdersCount: 0,
        aggregateExposureUsd: "0",
        positionNotionalUsd: "0",
        unknownOutcomeCount: 0,
        reconciliationStatus: "RECONCILED",
        paused: false
      };
      hypercore002dRiskSnapshot.riskSnapshotHash = hashId(
        "hypercore_testnet_risk_snapshot",
        hypercore002dRiskSnapshot
      );
      const hypercore002dPolicy = createHypercoreTestnetProofPolicy({
        policyId: "hypercore_testnet_btc_proof_002d_postgres",
        accountBindingHash: hypercoreBinding.accountBindingHash,
        delegateHash: preparedHypercoreDelegate.delegateHash,
        signerReferenceHash: preparedHypercoreDelegate.signerReferenceHash,
        metadataHash: hypercore002dRiskSnapshot.metadataHash,
        assetIndex: 3,
        sizeDecimals: 5,
        priceDecimals: 1,
        metadataObservedAt: hypercore002dRiskSnapshot.metadataObservedAt,
        executionOwnerActorId: "actor_hypercore_execution_owner",
        riskOwnerActorId: "actor_hypercore_risk_owner",
        incidentOwnerActorId: "actor_ipo_one_founder",
        approvedAt: "2026-07-25T01:12:02.100Z",
        expiresAt: "2026-07-25T01:30:00.000Z"
      });
      const hypercore002dPreparedAction = compileHypercoreExecutionAction({
        actionKind: HypercoreExecutionActionKind.ORDER,
        action: {
          assetIndex: 3,
          side: "buy",
          limitPx: "50000",
          size: "0.0002",
          reduceOnly: false,
          timeInForce: "Alo",
          cloid: "0x00000000000000000000000000000001"
        },
        sourceActionHash: hashId("hypercore_002d_source_action", {
          facilityId: facility.tradingFacilityId
        }),
        policyDecisionHash: hashId("hypercore_002d_policy_decision", {
          policyId: hypercore002dPolicy.policyId
        }),
        riskSnapshotHash: hypercore002dRiskSnapshot.riskSnapshotHash,
        accountBindingHash: hypercoreBinding.accountBindingHash,
        delegateHash: preparedHypercoreDelegate.delegateHash
      });
      const hypercore002dHandoff = createHypercoreTestnetSignerHandoff({
        binding: hypercoreBinding,
        delegate: preparedHypercoreDelegate,
        registrationEvidenceHash: hashId(
          "hypercore_002d_signer_registration_evidence",
          { delegateId: preparedHypercoreDelegate.delegateId }
        ),
        verifiedAt: new Date("2026-07-25T01:12:02.100Z"),
        expiresAt: new Date("2026-07-25T01:30:00.000Z")
      });
      const hypercore002dEvents = new PostgresEventRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const hypercore002dRepository =
        new PostgresHypercoreTestnetSubmissionRepository({
          eventRepository: hypercore002dEvents
        });
      const restartedHypercore002dRepository =
        new PostgresHypercoreTestnetSubmissionRepository({
          eventRepository: new PostgresEventRepository({
            pool,
            tenantContext: TENANT_CONTEXT
          })
        });
      assert.deepEqual(
        await hypercore002dRepository.recordSignerHandoff(
          hypercore002dHandoff
        ),
        hypercore002dHandoff
      );
      assert.deepEqual(
        await restartedHypercore002dRepository.findSignerHandoff(
          hypercore002dHandoff.handoffId
        ),
        hypercore002dHandoff
      );
      const concurrentPreparations = await Promise.all([
        hypercore002dRepository.prepare({
          binding: hypercoreBinding,
          handoffId: hypercore002dHandoff.handoffId,
          policy: hypercore002dPolicy,
          preparedAction: hypercore002dPreparedAction,
          idempotencyKey: "hypercore-002d-postgres-prepare-0001",
          now: new Date("2026-07-25T01:12:02.300Z")
        }),
        restartedHypercore002dRepository.prepare({
          binding: hypercoreBinding,
          handoffId: hypercore002dHandoff.handoffId,
          policy: hypercore002dPolicy,
          preparedAction: hypercore002dPreparedAction,
          idempotencyKey: "hypercore-002d-postgres-prepare-0001",
          now: new Date("2026-07-25T01:12:02.300Z")
        })
      ]);
      assert.deepEqual(
        concurrentPreparations.map(({ replayed }) => replayed).sort(),
        [false, true]
      );
      const hypercore002dAttempt = concurrentPreparations[0].attempt;
      assert.deepEqual(concurrentPreparations[1].attempt, hypercore002dAttempt);
      assert.deepEqual(
        await restartedHypercore002dRepository.find(
          hypercore002dAttempt.executionId
        ),
        hypercore002dAttempt
      );
      await assert.rejects(
        () => restartedHypercore002dRepository.prepare({
          binding: hypercoreBinding,
          handoffId: hypercore002dHandoff.handoffId,
          policy: hypercore002dPolicy,
          preparedAction: hypercore002dPreparedAction,
          idempotencyKey: "hypercore-002d-economic-replay-denied-0002",
          now: new Date("2026-07-25T01:12:02.301Z")
        }),
        (error) => error.code === "23505"
      );
      const hypercore002dCancelAction = compileHypercoreExecutionAction({
        actionKind: HypercoreExecutionActionKind.CANCEL,
        action: { assetIndex: 3, orderId: 7 },
        sourceActionHash: hashId("hypercore_002d_cancel_source_action", {
          facilityId: facility.tradingFacilityId
        }),
        policyDecisionHash: hashId("hypercore_002d_policy_decision", {
          policyId: hypercore002dPolicy.policyId
        }),
        riskSnapshotHash: hypercore002dRiskSnapshot.riskSnapshotHash,
        accountBindingHash: hypercoreBinding.accountBindingHash,
        delegateHash: preparedHypercoreDelegate.delegateHash
      });
      const hypercore002dNextAttempt = (await hypercore002dRepository.prepare({
        binding: hypercoreBinding,
        handoffId: hypercore002dHandoff.handoffId,
        policy: hypercore002dPolicy,
        preparedAction: hypercore002dCancelAction,
        idempotencyKey: "hypercore-002d-next-nonce-0003",
        now: new Date("2026-07-25T01:12:02.301Z")
      })).attempt;
      assert.equal(
        hypercore002dNextAttempt.nonce,
        hypercore002dAttempt.nonce + 1
      );
      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
          client.query(
            `UPDATE hypercore_testnet_submission_attempts SET nonce = $2
              WHERE id = $1`,
            [hypercore002dNextAttempt.executionId, hypercore002dAttempt.nonce]
          )
        ),
        (error) => error.code === "23514" || error.code === "23505"
      );
      const hypercore002dApproval = createHypercoreTestnetFounderApproval({
        attempt: hypercore002dAttempt,
        actorId: "actor_ipo_one_founder",
        confirmationNonceHash: hashId(
          "hypercore_002d_founder_confirmation_nonce",
          { executionId: hypercore002dAttempt.executionId }
        ),
        approvedAt: new Date("2026-07-25T01:12:02.400Z"),
        expiresAt: new Date("2026-07-25T01:17:00.000Z")
      });
      const hypercore002dApproved = await hypercore002dRepository.approve({
        executionId: hypercore002dAttempt.executionId,
        approval: hypercore002dApproval
      });
      assert.equal(hypercore002dApproved.state, "APPROVED");
      assert.deepEqual(
        await restartedHypercore002dRepository.findFounderApproval(
          hypercore002dAttempt.executionId
        ),
        hypercore002dApproval
      );
      const hypercore002dAuthorization = authorizeHypercoreTestnetAction({
        policy: hypercore002dPolicy,
        preparedAction: hypercore002dPreparedAction,
        riskSnapshot: hypercore002dRiskSnapshot,
        proofState: {
          proofId: "hypercore_testnet_proof_run_002d_postgres",
          startedAt: "2026-07-25T01:12:02.150Z",
          submissionCount: 0,
          openOrderCount: 0,
          aggregateExposureUsd: "0"
        },
        humanConfirmation: founderApprovalHumanConfirmation(
          hypercore002dApproval
        ),
        now: new Date("2026-07-25T01:12:02.500Z")
      });
      const hypercore002dClaim = {
        executionId: hypercore002dAttempt.executionId,
        authorization: hypercore002dAuthorization,
        requestBodyHash: hashId("hypercore_002d_request_body", {
          executionId: hypercore002dAttempt.executionId
        }),
        signatureHash: hashId("hypercore_002d_ephemeral_signature", {
          executionId: hypercore002dAttempt.executionId
        }),
        claimHash: hashId("hypercore_002d_submission_claim", {
          executionId: hypercore002dAttempt.executionId
        }),
        now: new Date("2026-07-25T01:12:02.600Z")
      };
      const concurrentClaims = await Promise.allSettled([
        hypercore002dRepository.claim(hypercore002dClaim),
        restartedHypercore002dRepository.claim(hypercore002dClaim)
      ]);
      assert.equal(
        concurrentClaims.filter(({ status }) => status === "fulfilled").length,
        1
      );
      assert.equal(
        concurrentClaims.filter(({ status }) => status === "rejected").length,
        1
      );
      assert.equal(
        (await restartedHypercore002dRepository.find(
          hypercore002dAttempt.executionId
        )).state,
        "SUBMITTING"
      );
      const crashRecoveryRepository =
        new PostgresHypercoreTestnetSubmissionRepository({
          eventRepository: new PostgresEventRepository({
            pool,
            tenantContext: TENANT_CONTEXT
          })
        });
      const hypercore002dUnknown = await crashRecoveryRepository.recoverUnknown({
        executionId: hypercore002dAttempt.executionId,
        reasonHash: hashId("hypercore_002d_lost_remote_outcome", {
          executionId: hypercore002dAttempt.executionId
        }),
        now: new Date("2026-07-25T01:12:02.700Z")
      });
      assert.equal(hypercore002dUnknown.state, "UNKNOWN");
      assert.equal(hypercore002dUnknown.retryAllowed, false);
      await assert.rejects(
        () => crashRecoveryRepository.claim({
          ...hypercore002dClaim,
          claimHash: hashId("hypercore_002d_replay_claim", {
            executionId: hypercore002dAttempt.executionId
          }),
          now: new Date("2026-07-25T01:12:02.800Z")
        }),
        { code: "hypercore_testnet_submission_claim_denied" }
      );
      const hypercore002dReconciled = await crashRecoveryRepository.reconcile({
        executionId: hypercore002dAttempt.executionId,
        reconciliationHash: hashId("hypercore_002d_reconciliation", {
          executionId: hypercore002dAttempt.executionId
        }),
        venueOrderStateHash: hashId("hypercore_002d_venue_order_state", {
          executionId: hypercore002dAttempt.executionId
        }),
        venueAccountStateHash: hashId("hypercore_002d_venue_account_state", {
          executionId: hypercore002dAttempt.executionId
        }),
        ledgerStateHash: hashId("hypercore_002d_ledger_state", {
          executionId: hypercore002dAttempt.executionId
        }),
        obligationEvidenceHash: hashId(
          "hypercore_002d_obligation_evidence",
          { executionId: hypercore002dAttempt.executionId }
        ),
        now: new Date("2026-07-25T01:12:02.900Z")
      });
      assert.equal(hypercore002dReconciled.state, "RECONCILED");
      const hypercoreRlsRole = "ipo_one_hypercore002b_rls_test";
      const dropHypercoreRlsRole = async () => {
        const exists = await pool.query(
          "SELECT 1 FROM pg_roles WHERE rolname = $1",
          [hypercoreRlsRole]
        );
        if (exists.rowCount === 0) return;
        await pool.query(`DROP OWNED BY ${hypercoreRlsRole}`);
        await pool.query(`DROP ROLE ${hypercoreRlsRole}`);
      };
      await dropHypercoreRlsRole();
      await pool.query(
        `CREATE ROLE ${hypercoreRlsRole}
          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
          NOREPLICATION NOBYPASSRLS`
      );
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${hypercoreRlsRole}`);
      await pool.query(
        `GRANT SELECT ON hypercore_account_bindings,
          hypercore_api_wallet_delegates, hypercore_delegate_tombstones,
          hypercore_testnet_signer_handoffs, hypercore_testnet_nonce_heads,
          hypercore_testnet_submission_attempts,
          hypercore_testnet_founder_approvals,
          hypercore_testnet_submission_transitions
          TO ${hypercoreRlsRole}`
      );
      try {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(`SET LOCAL ROLE ${hypercoreRlsRole}`);
          await setTenantTransactionContext(client, TENANT_TWO_CONTEXT);
          assert.equal(
            (await client.query(
              "SELECT id FROM hypercore_api_wallet_delegates WHERE id = $1",
              [preparedHypercoreDelegate.delegateId]
            )).rowCount,
            0
          );
          assert.equal(
            (await client.query(
              "SELECT id FROM hypercore_testnet_submission_attempts WHERE id = $1",
              [hypercore002dAttempt.executionId]
            )).rowCount,
            0
          );
          await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      } finally {
        await dropHypercoreRlsRole();
      }
      const terminalHypercore = await restartedHypercoreRepository.terminate({
        delegateId: preparedHypercoreDelegate.delegateId,
        expectedDelegateHash: preparedHypercoreDelegate.delegateHash,
        status: HypercoreDelegateStatus.REVOKED,
        reason: "operator_request",
        idempotencyKey: "hypercore-002b-terminate-0001",
        now: new Date("2026-07-25T01:12:03.000Z")
      });
      assert.equal(
        terminalHypercore.delegate.status,
        HypercoreDelegateStatus.REVOKED
      );
      assert.equal(
        await restartedHypercoreRepository.hasTombstone(delegateAddressHash),
        true
      );
      assert.deepEqual(
        await new PostgresHypercoreDelegateRepository({
          coreRepository: new PostgresCoreRepository({
            pool,
            tenantContext: TENANT_CONTEXT
          })
        }).terminate({
          delegateId: preparedHypercoreDelegate.delegateId,
          expectedDelegateHash: preparedHypercoreDelegate.delegateHash,
          status: HypercoreDelegateStatus.REVOKED,
          reason: "operator_request",
          idempotencyKey: "hypercore-002b-terminate-0001",
          now: new Date("2026-07-25T01:12:03.000Z")
        }),
        terminalHypercore
      );
      const retiredHypercore002dHandoff =
        retireHypercoreTestnetSignerHandoff({
          handoff: hypercore002dHandoff,
          retirementEvidenceHash: hashId(
            "hypercore_002d_signer_retirement",
            { tombstoneId: terminalHypercore.tombstone.tombstoneId }
          ),
          now: new Date("2026-07-25T01:12:03.100Z")
        });
      assert.deepEqual(
        await crashRecoveryRepository.retireSignerHandoff(
          retiredHypercore002dHandoff
        ),
        retiredHypercore002dHandoff
      );
      const closedHypercore002d = await crashRecoveryRepository.close({
        executionId: hypercore002dAttempt.executionId,
        now: new Date("2026-07-25T01:12:03.200Z")
      });
      assert.equal(closedHypercore002d.state, "CLOSED");
      assert.equal(closedHypercore002d.retryAllowed, false);
      assert.equal(closedHypercore002d.rawResponsePersisted, false);
      assert.equal(closedHypercore002d.rawKeyPersisted, false);
      assert.equal(closedHypercore002d.rawSignaturePersisted, false);
      assert.deepEqual(
        (await crashRecoveryRepository.history(
          hypercore002dAttempt.executionId
        )).map(({ nextState }) => nextState),
        [
          "PREPARED",
          "APPROVED",
          "SUBMITTING",
          "UNKNOWN",
          "RECONCILED",
          "CLOSED"
        ]
      );
      const hypercore002dDurableRows = await withTenantTransaction(
        pool,
        TENANT_CONTEXT,
        async (client) => ({
          attempts: Number((await client.query(
            "SELECT COUNT(*) AS count FROM hypercore_testnet_submission_attempts WHERE id = $1",
            [hypercore002dAttempt.executionId]
          )).rows[0].count),
          approvals: Number((await client.query(
            "SELECT COUNT(*) AS count FROM hypercore_testnet_founder_approvals WHERE execution_id = $1",
            [hypercore002dAttempt.executionId]
          )).rows[0].count),
          transitions: Number((await client.query(
            "SELECT COUNT(*) AS count FROM hypercore_testnet_submission_transitions WHERE execution_id = $1",
            [hypercore002dAttempt.executionId]
          )).rows[0].count),
          consumedApprovals: Number((await client.query(
            `SELECT COUNT(*) AS count
               FROM hypercore_testnet_founder_approvals
              WHERE execution_id = $1 AND status = 'CONSUMED'`,
            [hypercore002dAttempt.executionId]
          )).rows[0].count)
        })
      );
      assert.deepEqual(hypercore002dDurableRows, {
        attempts: 1,
        approvals: 1,
        transitions: 6,
        consumedApprovals: 1
      });
      for (const tableName of [
        "hypercore_testnet_signer_handoffs",
        "hypercore_testnet_submission_attempts",
        "hypercore_testnet_founder_approvals",
        "hypercore_testnet_submission_transitions"
      ]) {
        for (const rawValue of [
          hypercoreMasterAddress,
          hypercoreSubaccountAddress,
          hypercoreDelegateAddress
        ]) {
          assert.equal(
            (await withTenantTransaction(
              pool,
              TENANT_CONTEXT,
              (client) => client.query(
                `SELECT 1 FROM ${tableName}
                  WHERE row_to_json(${tableName})::TEXT LIKE $1 LIMIT 1`,
                [`%${rawValue}%`]
              )
            )).rowCount,
            0
          );
        }
      }
      await assert.rejects(
        () => restartedHypercoreRepository.prepare({
          bindingId: hypercoreBinding.accountBindingId,
          apiWalletAddressHash: delegateAddressHash,
          signerReferenceHash: hashId("hypercore_002b_signer_reference", {
            facilityId: facility.tradingFacilityId
          }),
          delegateNameHash: hashId("hypercore_delegate_name", "hypercore-002b-reuse"),
          expiresAt: new Date("2026-07-26T01:12:04.000Z"),
          idempotencyKey: "hypercore-002b-reuse-denied-0001",
          now: new Date("2026-07-25T01:12:04.000Z")
        }),
        { code: "hypercore_delegate_address_reuse_denied" }
      );
      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
          client.query(
            `DELETE FROM hypercore_delegate_tombstones WHERE id = $1`,
            [terminalHypercore.tombstone.tombstoneId]
          )
        ),
        (error) => error.code === "23514"
      );
      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
          client.query(
            `DELETE FROM hypercore_testnet_submission_transitions
              WHERE execution_id = $1`,
            [hypercore002dAttempt.executionId]
          )
        ),
        (error) => error.code === "23514"
      );
      await assert.rejects(
        () => migrateDown({ pool, steps: 12 }),
        (error) => error.code === "23514"
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0058_hypercore_testnet_submission_closure"
        ).applied,
        true
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0059_hypercore_stable_intent_jit_preflight"
        ).applied,
        false
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0060_hypercore_stable_cancel_closure"
        ).applied,
        false
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0061_execution_account_bindings"
        ).applied,
        false
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0062_durable_credit_state_projection"
        ).applied,
        false
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0063_selected_human_role_enrollment"
        ).applied,
        false
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0064_pool_chain_reconciliation"
        ).applied,
        false
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0065_pool_obligation_integration"
        ).applied,
        false
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0066_agent_secured_facility_authorizations"
        ).applied,
        false
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0067_m2b_hyperliquid_compositions"
        ).applied,
        false
      );
      assert.equal(
        (await migrationStatus({ pool })).find(
          ({ name }) => name === "0068_m2b_dual_risk_recovery"
        ).applied,
        false
      );
      assert.deepEqual(await migrateUp({ pool }), [
        "0059_hypercore_stable_intent_jit_preflight",
        "0060_hypercore_stable_cancel_closure",
        "0061_execution_account_bindings",
        "0062_durable_credit_state_projection",
        "0063_selected_human_role_enrollment",
        "0064_pool_chain_reconciliation",
        "0065_pool_obligation_integration",
        "0066_agent_secured_facility_authorizations",
        "0067_m2b_hyperliquid_compositions",
        "0068_m2b_dual_risk_recovery",
        "0069_auth_reference_hash_key_rotation"
      ]);

      const subjectContribution = contributeTradingSubjectCollateral(
        facility,
        {
          contributedByActorId: "actor_tc_102_subject",
          amountMinor: facility.requiredSubjectCollateralMinor,
          expectedStateHash: facility.stateHash,
          expectedVersion: facility.version,
          now: new Date("2026-07-25T01:13:00.000Z")
        }
      );
      const providerFunding = recordTradingProviderFunding(facility, {
        fundedByActorId: "actor_tc_102_provider",
        amountMinor: facility.requiredProviderFundingMinor,
        expectedStateHash: facility.stateHash,
        expectedVersion: facility.version,
        now: new Date("2026-07-25T01:13:00.001Z")
      });
      const contributionCommand = facilityCommand({
        value: subjectContribution,
        eventType:
          CreditEventType.TRADING_FACILITY_SUBJECT_COLLATERAL_RECORDED,
        idempotencyKey: "tc-103-subject-contribution-race",
        expectedVersion: 1,
        now: new Date(subjectContribution.updatedAt)
      });
      const fundingCommand = facilityCommand({
        value: providerFunding,
        eventType:
          CreditEventType.TRADING_FACILITY_PROVIDER_FUNDING_RECORDED,
        idempotencyKey: "tc-103-provider-funding-race",
        expectedVersion: 1,
        now: new Date(providerFunding.updatedAt)
      });
      const race = await Promise.allSettled([
        repository.commitCommand(contributionCommand),
        new PostgresCoreRepository({
          pool,
          tenantContext: TENANT_CONTEXT,
          transactionRetries: 10
        }).commitCommand(fundingCommand)
      ]);
      assert.equal(
        race.filter(({ status }) => status === "fulfilled").length,
        1
      );
      assert.equal(
        race.filter(({ status }) => status === "rejected").length,
        1
      );
      const afterRace = await repository.getTradingFacility(
        facility.tradingFacilityId
      );
      const ready =
        afterRace.subjectCollateralRecorded
          ? recordTradingProviderFunding(afterRace, {
              fundedByActorId: "actor_tc_102_provider",
              amountMinor: afterRace.requiredProviderFundingMinor,
              expectedStateHash: afterRace.stateHash,
              expectedVersion: afterRace.version,
              now: new Date("2026-07-25T01:14:00.000Z")
            })
          : contributeTradingSubjectCollateral(afterRace, {
              contributedByActorId: "actor_tc_102_subject",
              amountMinor: afterRace.requiredSubjectCollateralMinor,
              expectedStateHash: afterRace.stateHash,
              expectedVersion: afterRace.version,
              now: new Date("2026-07-25T01:14:00.000Z")
            });
      await repository.commitCommand(facilityCommand({
        value: ready,
        eventType: afterRace.subjectCollateralRecorded
          ? CreditEventType.TRADING_FACILITY_PROVIDER_FUNDING_RECORDED
          : CreditEventType.TRADING_FACILITY_SUBJECT_COLLATERAL_RECORDED,
        idempotencyKey: "tc-103-contribution-race-recovery",
        expectedVersion: 2,
        now: new Date(ready.updatedAt)
      }));
      const tc401PreparedAt =
        new Date("2026-07-25T01:14:10.000Z").getTime();
      const tc401ActivationAt =
        new Date("2026-07-25T01:15:00.000Z").getTime();
      const tc401KernelSnapshot = {
        facility: ready,
        matchProposal: finalProposal,
        obligation: execution.obligation,
        subjectActorId: "actor_tc_102_subject",
        facilityId: ready.tradingFacilityId,
        facilityHash: ready.facilityHash,
        facilityStateHash: ready.stateHash,
        facilityVersion: ready.version,
        facilityLifecycleStatus: ready.lifecycleStatus,
        obligationId: ready.obligationId,
        subjectId: ready.subjectId,
        bilateralTermsHash: ready.termsHash,
        assetId: ready.assetId,
        requiredSubjectContributionMinor:
          ready.requiredSubjectCollateralMinor,
        requiredProviderContributionMinor:
          ready.requiredProviderFundingMinor,
        maximumFacilityCapMinor: ready.syntheticCapitalMinor,
        facilityDestinationHash: hashId(
          "tc_401_postgres_segregated_facility_destination",
          { facilityId: ready.tradingFacilityId }
        ),
        accountBindingHash: hashId(
          "tc_401_postgres_account_binding",
          { facilityId: ready.tradingFacilityId }
        ),
        masterAccountHash: hashId(
          "tc_401_postgres_master_account",
          { facilityId: ready.tradingFacilityId }
        ),
        withdrawalAuthorityHash: hashId(
          "tc_401_postgres_withdrawal_authority",
          { facilityId: ready.tradingFacilityId }
        ),
        executionSignerReferenceHash: hashId(
          "tc_401_postgres_execution_signer",
          { facilityId: ready.tradingFacilityId }
        ),
        canonicalLedgerStateHash: hashId(
          "tc_401_postgres_canonical_ledger",
          {
            facilityId: ready.tradingFacilityId,
            obligationId: ready.obligationId
          }
        ),
        ledgerTransactionCount: 1,
        riskSnapshotHash: hashId(
          "tc_401_postgres_fresh_normal_risk",
          { facilityId: ready.tradingFacilityId }
        ),
        riskState: "NORMAL",
        riskFreshness: "FRESH",
        riskObservedAt: new Date(
          tc401ActivationAt - 1_000
        ).toISOString(),
        riskMaximumAgeMs: 60_000,
        simulationOnly: true,
        canonicalFacility: true,
        secondFacilityCreated: false,
        canonicalLedger: true,
        secondLedgerCreated: false,
        liveAccountsApproved: false,
        capturedAt: new Date(tc401PreparedAt).toISOString(),
        schemaVersion:
          "hyperliquid_testnet_facility_funding_kernel_snapshot.v1"
      };
      const tc401PlaceholderReceipt =
        createSimulatedTestnetContributionReceipt(
          {
            fundingHash: `0x${"4".repeat(64)}`,
            facilityHash: ready.facilityHash,
            contributorRole:
              HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS,
            kind:
              HyperliquidTestnetContributionReceiptKind
                .FINALIZED_CONTRIBUTION,
            assetId: ready.assetId,
            amountMinor: ready.requiredSubjectCollateralMinor,
            destinationHash:
              tc401KernelSnapshot.facilityDestinationHash,
            transactionReferenceHash: `0x${"5".repeat(64)}`,
            blockReferenceHash: `0x${"6".repeat(64)}`,
            relatedReceiptHash: null,
            freshness: "FRESH",
            complete: true,
            finalized: true
          },
          { clock: () => tc401PreparedAt }
        );
      const createTc401Service = (
        core,
        receipts,
        nowMs
      ) =>
        new HyperliquidTestnetFacilityFundingService({
          repository:
            new PostgresHyperliquidFacilityFundingRepository({
              coreRepository: core
            }),
          commandGuard:
            new SimulatedHyperliquidFacilityFundingCommandGuard(),
          kernelResolver:
            new SimulatedHyperliquidFacilityFundingKernelResolver({
              snapshots: [tc401KernelSnapshot]
            }),
          receiptAdapter:
            new ScriptedHyperliquidContributionReceiptAdapter({
              receipts
            }),
          clock: () => nowMs
        });
      const tc401Prepared = await createTc401Service(
        repository,
        [tc401PlaceholderReceipt],
        tc401PreparedAt
      ).prepare({
        facilityId: ready.tradingFacilityId,
        facilityHash: ready.facilityHash,
        idempotencyKey: "tc401-postgres-prepare-0001"
      });
      const tc401Receipt = ({
        role,
        kind =
          HyperliquidTestnetContributionReceiptKind
            .FINALIZED_CONTRIBUTION,
        relatedReceiptHash = null,
        suffix,
        nowMs
      }) =>
        createSimulatedTestnetContributionReceipt(
          {
            fundingHash: tc401Prepared.fundingHash,
            facilityHash: ready.facilityHash,
            contributorRole: role,
            kind,
            assetId: ready.assetId,
            amountMinor: role ===
              HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS
              ? ready.requiredSubjectCollateralMinor
              : ready.requiredProviderFundingMinor,
            destinationHash:
              tc401KernelSnapshot.facilityDestinationHash,
            transactionReferenceHash: hashId(
              "tc_401_postgres_contribution_transaction",
              { suffix }
            ),
            blockReferenceHash: hashId(
              "tc_401_postgres_contribution_block",
              { suffix }
            ),
            relatedReceiptHash,
            freshness: "FRESH",
            complete: true,
            finalized: kind ===
              HyperliquidTestnetContributionReceiptKind
                .FINALIZED_CONTRIBUTION
          },
          { clock: () => nowMs }
        );
      const tc401SubjectReceipt = tc401Receipt({
        role: HyperliquidTestnetContributionRole.SUBJECT_FIRST_LOSS,
        suffix: "subject",
        nowMs: tc401PreparedAt + 1_000
      });
      const tc401ProviderReceipt = tc401Receipt({
        role: HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL,
        suffix: "provider-original",
        nowMs: tc401PreparedAt + 2_000
      });
      const tc401InitialReceipts = createTc401Service(
        repository,
        [tc401SubjectReceipt, tc401ProviderReceipt],
        tc401PreparedAt + 3_000
      );
      await tc401InitialReceipts.reconcileNext({
        fundingId: tc401Prepared.fundingId
      });
      const tc401InitiallyReady =
        await tc401InitialReceipts.reconcileNext({
          fundingId: tc401Prepared.fundingId
        });
      assert.equal(tc401InitiallyReady.status, "READY");
      assert.equal(
        tc401InitiallyReady.reconciledTotalMinor,
        ready.syntheticCapitalMinor
      );
      const tc401ReorgReceipt = tc401Receipt({
        role: HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL,
        kind:
          HyperliquidTestnetContributionReceiptKind.REORG_INVALIDATION,
        relatedReceiptHash: tc401ProviderReceipt.receiptHash,
        suffix: "provider-reorg",
        nowMs: tc401PreparedAt + 4_000
      });
      const tc401AfterReorg = await createTc401Service(
        repository,
        [tc401ReorgReceipt],
        tc401PreparedAt + 5_000
      ).reconcileNext({ fundingId: tc401Prepared.fundingId });
      assert.equal(tc401AfterReorg.status, "AWAITING_PROVIDER");
      assert.equal(tc401AfterReorg.providerReceiptHash, null);

      const tc401RestartedCore = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const tc401ReplacementReceipt = tc401Receipt({
        role: HyperliquidTestnetContributionRole.PROVIDER_PRINCIPAL,
        suffix: "provider-replacement",
        nowMs: tc401PreparedAt + 6_000
      });
      const tc401Recovered = await createTc401Service(
        tc401RestartedCore,
        [tc401ReplacementReceipt],
        tc401PreparedAt + 7_000
      ).reconcileNext({ fundingId: tc401Prepared.fundingId });
      assert.equal(tc401Recovered.status, "READY");
      assert.notEqual(
        tc401Recovered.providerReceiptHash,
        tc401ProviderReceipt.receiptHash
      );
      const tc401Activation = await createTc401Service(
        tc401RestartedCore,
        [tc401PlaceholderReceipt],
        tc401ActivationAt
      ).activate({
        fundingId: tc401Prepared.fundingId,
        idempotencyKey: "tc401-postgres-activate-0001"
      });
      const active = tc401Activation.facility;
      assert.equal(tc401Activation.record.status, "ACTIVE");
      assert.equal(active.lifecycleStatus, "active");
      assert.equal(
        tc401Activation.record.canonicalFacilityMutationCreated,
        true
      );
      assert.equal(tc401Activation.record.secondFacilityCreated, false);
      assert.equal(tc401Activation.record.ledgerMutationCreated, false);
      assert.equal(tc401Activation.record.secondLedgerCreated, false);
      const tc401ReplayAdapter =
        new ScriptedHyperliquidContributionReceiptAdapter({
          receipts: [tc401PlaceholderReceipt]
        });
      const tc401Replay = await new HyperliquidTestnetFacilityFundingService({
        repository:
          new PostgresHyperliquidFacilityFundingRepository({
            coreRepository: new PostgresCoreRepository({
              pool,
              tenantContext: TENANT_CONTEXT
            })
          }),
        commandGuard:
          new SimulatedHyperliquidFacilityFundingCommandGuard(),
        kernelResolver:
          new SimulatedHyperliquidFacilityFundingKernelResolver({
            snapshots: [tc401KernelSnapshot]
          }),
        receiptAdapter: tc401ReplayAdapter,
        clock: () => tc401ActivationAt + 1_000
      }).activate({
        fundingId: tc401Prepared.fundingId,
        idempotencyKey: "tc401-postgres-activate-0001"
      });
      assert.equal(tc401Replay.replayed, true);
      assert.deepEqual(tc401Replay.record, tc401Activation.record);
      assert.deepEqual(tc401Replay.facility, active);
      assert.equal(tc401ReplayAdapter.callCount, 0);
      const tc401Audit = await withTenantTransaction(
        pool,
        TENANT_CONTEXT,
        (client) =>
          client.query(
            `SELECT
               (SELECT count(*)::int
                  FROM trading_testnet_facility_funding_controls
                 WHERE facility_id = $1) AS controls,
               (SELECT count(*)::int
                  FROM domain_events
                 WHERE aggregate_type =
                   'trading_testnet_facility_funding') AS events,
               (SELECT count(*)::int
                  FROM evidence_envelopes
                 WHERE aggregate_type =
                   'trading_testnet_facility_funding') AS evidence,
               (SELECT count(*)::int
                  FROM outbox_messages o
                  JOIN domain_events e ON e.id = o.event_id
                 WHERE e.aggregate_type =
                   'trading_testnet_facility_funding') AS outbox,
               (SELECT count(*)::int
                  FROM inbox_messages
                 WHERE consumer_name =
                   'ipo.one.trading-testnet-facility-funding-receipts.v1')
                 AS inbox`,
            [ready.tradingFacilityId]
          )
      );
      assert.deepEqual(tc401Audit.rows[0], {
        controls: 1,
        events: 6,
        evidence: 6,
        outbox: 6,
        inbox: 4
      });

      const submitOrder = (current, now) =>
        submitTradingOrderIntent(current, {
          submittedByActorId: "actor_tc_102_subject",
          direction: TradingOrderDirection.LONG,
          syntheticNotionalMinor: "450000",
          expectedStateHash: current.stateHash,
          expectedVersion: current.version,
          now
        });
      const orderCommand = (result, idempotencyKey, expectedVersion) => {
        const payload = {
          tradingFacilityId: result.facility.tradingFacilityId,
          tradingOrderIntentId: result.orderIntent.tradingOrderIntentId,
          syntheticNotionalMinor: result.orderIntent.syntheticNotionalMinor,
          rawVenueActionAccepted: false,
          fundsAuthority: false
        };
        const eventInput = {
          eventType: CreditEventType.TRADING_ORDER_INTENT_SUBMITTED,
          subjectId: result.facility.subjectId,
          obligationId: result.facility.obligationId,
          payload,
          now: new Date(result.facility.updatedAt)
        };
        const facilityOrderEvent = createCreditEvent(eventInput);
        const orderProjectionEvent = createCreditEvent(eventInput);
        return {
          aggregateType: "trading_facility",
          aggregateId: result.facility.tradingFacilityId,
          idempotencyKey,
          commandHash: hashId("tc_103_order_submit", {
            orderIntentHash: result.orderIntent.orderIntentHash
          }),
          events: [
            {
              aggregateType: "trading_facility",
              aggregateId: result.facility.tradingFacilityId,
              expectedVersion,
              event: facilityOrderEvent
            },
            {
              aggregateType: "trading_order_intent",
              aggregateId: result.orderIntent.tradingOrderIntentId,
              expectedVersion: 0,
              event: orderProjectionEvent
            }
          ],
          writes: [
            {
              type: CoreProjectionType.TRADING_FACILITY,
              value: result.facility,
              eventId: facilityOrderEvent.eventId
            },
            {
              type: CoreProjectionType.TRADING_ORDER_INTENT,
              value: result.orderIntent,
              eventId: orderProjectionEvent.eventId
            }
          ],
          response: {
            tradingOrderIntentId: result.orderIntent.tradingOrderIntentId
          }
        };
      };
      const evaluateRisk = (current, now) =>
        evaluateTradingFacilityRisk(current, {
          evaluatedByActorId: "actor_tc_103_risk",
          expectedStateHash: current.stateHash,
          expectedVersion: current.version,
          now
        });
      const riskCommand = (result, idempotencyKey, expectedVersion) => {
        const riskEvent = facilityEvent(
          CreditEventType.TRADING_FACILITY_RISK_EVALUATED,
          result.facility,
          new Date(result.facility.updatedAt)
        );
        return {
          aggregateType: "trading_facility",
          aggregateId: result.facility.tradingFacilityId,
          idempotencyKey,
          commandHash: hashId("tc_103_risk_evaluation", {
            evaluationHash: result.riskEvaluation.evaluationHash
          }),
          events: [{
            aggregateType: "trading_facility",
            aggregateId: result.facility.tradingFacilityId,
            expectedVersion,
            event: riskEvent
          }],
          writes: [
            {
              type: CoreProjectionType.TRADING_FACILITY,
              value: result.facility,
              eventId: riskEvent.eventId
            },
            {
              type:
                CoreProjectionType.TRADING_FACILITY_RISK_EVALUATION,
              value: result.riskEvaluation,
              eventId: riskEvent.eventId
            }
          ],
          response: {
            evaluationHash: result.riskEvaluation.evaluationHash,
            riskState: result.facility.riskState
          }
        };
      };
      const orderCandidate = submitOrder(
        active,
        new Date("2026-07-25T01:16:00.000Z")
      );
      const riskCandidate = evaluateRisk(
        active,
        new Date("2026-07-25T01:16:00.001Z")
      );
      const orderRiskRace = await Promise.allSettled([
        repository.commitCommand(orderCommand(
          orderCandidate,
          "tc-103-order-risk-race-order",
          active.version
        )),
        new PostgresCoreRepository({
          pool,
          tenantContext: TENANT_CONTEXT,
          transactionRetries: 10
        }).commitCommand(riskCommand(
          riskCandidate,
          "tc-103-order-risk-race-evaluation",
          active.version
        ))
      ]);
      assert.equal(
        orderRiskRace.filter(({ status }) => status === "fulfilled").length,
        1
      );
      assert.equal(
        orderRiskRace.filter(({ status }) => status === "rejected").length,
        1
      );
      let submitted;
      let evaluated;
      const afterOrderRiskRace = await repository.getTradingFacility(
        active.tradingFacilityId
      );
      if (orderRiskRace[0].status === "fulfilled") {
        submitted = orderCandidate;
        evaluated = evaluateRisk(
          afterOrderRiskRace,
          new Date("2026-07-25T01:16:02.000Z")
        );
        await repository.commitCommand(riskCommand(
          evaluated,
          "tc-103-risk-after-order-race",
          afterOrderRiskRace.version
        ));
      } else {
        submitted = submitOrder(
          afterOrderRiskRace,
          new Date("2026-07-25T01:16:01.000Z")
        );
        await repository.commitCommand(orderCommand(
          submitted,
          "tc-103-order-after-risk-race",
          afterOrderRiskRace.version
        ));
        evaluated = evaluateRisk(
          submitted.facility,
          new Date("2026-07-25T01:16:02.000Z")
        );
        await repository.commitCommand(riskCommand(
          evaluated,
          "tc-103-risk-after-order-recovery",
          submitted.facility.version
        ));
      }
      assert.equal(evaluated.facility.riskState, "REDUCE_ONLY");
      const paused = pauseTradingFacilityNewRisk(evaluated.facility, {
        pausedByActorId: "actor_tc_103_risk",
        reasonCode: "postgres_protective_pause",
        expectedStateHash: evaluated.facility.stateHash,
        expectedVersion: evaluated.facility.version,
        now: new Date("2026-07-25T01:17:00.000Z")
      });
      await repository.commitCommand(facilityCommand({
        value: paused,
        eventType: CreditEventType.TRADING_FACILITY_NEW_RISK_PAUSED,
        idempotencyKey: "tc-103-protective-pause",
        expectedVersion: evaluated.facility.version,
        now: new Date(paused.updatedAt)
      }));
      const flattened = flattenTradingFacility(
        paused,
        [submitted.orderIntent],
        {
          flattenedByActorId: "actor_tc_103_risk",
          reasonCode: "postgres_protective_flatten",
          expectedStateHash: paused.stateHash,
          expectedVersion: paused.version,
          now: new Date("2026-07-25T01:18:00.000Z")
        }
      );
      const flattenEvent = facilityEvent(
        CreditEventType.TRADING_FACILITY_FLATTENED,
        flattened.facility,
        new Date(flattened.facility.updatedAt)
      );
      const flattenOrderEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_FACILITY_FLATTENED,
        subjectId: flattened.facility.subjectId,
        obligationId: flattened.facility.obligationId,
        payload: {
          tradingFacilityId: flattened.facility.tradingFacilityId,
          tradingOrderIntentId:
            flattened.orderIntents[0].tradingOrderIntentId,
          orderStateHash: flattened.orderIntents[0].orderStateHash,
          syntheticOnly: true,
          productionAuthority: false,
          fundsAuthority: false
        },
        now: new Date(flattened.facility.updatedAt)
      });
      const flattenCommand = {
        aggregateType: "trading_facility",
        aggregateId: active.tradingFacilityId,
        idempotencyKey: "tc-103-protective-flatten",
        commandHash: hashId("tc_103_protective_flatten", {
          stateHash: flattened.facility.stateHash,
          orderStateHash: flattened.orderIntents[0].orderStateHash
        }),
        events: [
          {
            aggregateType: "trading_facility",
            aggregateId: active.tradingFacilityId,
            expectedVersion: paused.version,
            event: flattenEvent
          },
          {
            aggregateType: "trading_order_intent",
            aggregateId: submitted.orderIntent.tradingOrderIntentId,
            expectedVersion: 1,
            event: flattenOrderEvent
          }
        ],
        writes: [
          {
            type: CoreProjectionType.TRADING_FACILITY,
            value: flattened.facility,
            eventId: flattenEvent.eventId
          },
          {
            type: CoreProjectionType.TRADING_ORDER_INTENT,
            value: flattened.orderIntents[0],
            eventId: flattenOrderEvent.eventId
          }
        ],
        response: {
          tradingFacilityId: flattened.facility.tradingFacilityId,
          lifecycleStatus: flattened.facility.lifecycleStatus,
          riskState: flattened.facility.riskState,
          stateHash: flattened.facility.stateHash
        }
      };
      await repository.commitCommand(flattenCommand);

      const restarted = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const durableFacility = await restarted.getTradingFacility(
        active.tradingFacilityId
      );
      const durableOrder = await restarted.getTradingOrderIntent(
        submitted.orderIntent.tradingOrderIntentId
      );
      assert.equal(durableFacility.lifecycleStatus, "flattened");
      assert.equal(durableFacility.riskState, "FLATTEN");
      assert.equal(durableFacility.syntheticExposureMinor, "0");
      assert.equal(durableFacility.openOrderCount, 0);
      assert.equal(durableFacility.withdrawable, false);
      assert.equal(durableFacility.productionAuthority, false);
      assert.equal(durableFacility.fundsAuthority, false);
      assert.equal(durableOrder.status, "flattened");
      assert.equal(durableOrder.externalOrderSubmitted, false);
      assert.equal((await restarted.commitCommand(flattenCommand)).replayed, true);
      assert.equal(
        (await restarted.verifyProjection(
          CoreProjectionType.TRADING_FACILITY,
          active.tradingFacilityId
        )).matches,
        true
      );
      assert.equal(
        (await restarted.verifyProjection(
          CoreProjectionType.TRADING_ORDER_INTENT,
          submitted.orderIntent.tradingOrderIntentId
        )).matches,
        true
      );
      assert.equal(
        (await restarted.verifyProjection(
          CoreProjectionType.TRADING_FACILITY_RISK_EVALUATION,
          evaluated.riskEvaluation.tradingFacilityRiskEvaluationId
        )).matches,
        true
      );

      const executionClockMs = new Date(
        "2026-07-25T02:00:00.000Z"
      ).getTime();
      const executionBindingHash = hashId("tc_301_account_binding", {
        facilityId: durableFacility.tradingFacilityId
      });
      const executionSignerReferenceHash = hashId(
        "tc_301_simulated_signer_reference",
        { facilityId: durableFacility.tradingFacilityId }
      );
      const createExecutionGateway = (core, transport) =>
        new HyperliquidTestnetExecutionGateway({
          repository: new PostgresHyperliquidExecutionRepository({
            eventRepository: core.eventRepository
          }),
          bindingResolver: {
            async resolve({ facilityId, facilityHash }) {
              return {
                facilityId,
                facilityHash,
                accountBindingHash: executionBindingHash,
                signerReferenceHash: executionSignerReferenceHash,
                simulationOnly: true,
                liveSignerAvailable: false,
                apiWalletApproved: false,
                keyExportable: false
              };
            }
          },
          policyEvaluator: {
            async evaluate(input) {
              return {
                approved: true,
                policyDecisionHash: hashId(
                  "tc_301_simulated_policy_decision",
                  input
                ),
                actionKind: input.actionKind,
                serverReduceOnlyProven:
                  input.actionKind === "reduceOnlyOrder",
                killSwitchOpen: true,
                simulationOnly: true
              };
            }
          },
          signer: new SimulatedIsolatedHyperliquidSigner(),
          transport,
          clock: () => executionClockMs
        });
      const executionInput = (suffix) => ({
        facilityId: durableFacility.tradingFacilityId,
        facilityHash: durableFacility.facilityHash,
        facilityVersion: durableFacility.version,
        orderIntentId: durableOrder.tradingOrderIntentId,
        orderIntentHash: durableOrder.orderIntentHash,
        orderIntentVersion: durableOrder.version,
        idempotencyKey: `tc301-postgres-${suffix}`,
        action: {
          kind: "reduceOnlyOrder",
          assetIndex: 1,
          side: "sell",
          limitPx: "2500",
          size: "0.001",
          timeInForce: "Ioc"
        }
      });
      const firstExecutionTransport =
        new SimulatedHyperliquidExchangeTransport();
      const firstExecution = await createExecutionGateway(
        restarted,
        firstExecutionTransport
      ).execute(executionInput("first"));
      assert.equal(firstExecution.nonceState, "CONFIRMED");
      assert.equal(firstExecution.externalSystemQueried, false);
      assert.equal(firstExecution.externalOrderSubmitted, false);
      assert.equal(firstExecution.secretsIncluded, false);
      assert.equal(firstExecutionTransport.submissionHashes.length, 1);

      const executionRestart = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const replayTransport = new SimulatedHyperliquidExchangeTransport();
      const replayedExecution = await createExecutionGateway(
        executionRestart,
        replayTransport
      ).execute(executionInput("first"));
      assert.deepEqual(replayedExecution, firstExecution);
      assert.equal(replayTransport.submissionHashes.length, 0);

      const concurrentExecutions = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          createExecutionGateway(
            new PostgresCoreRepository({
              pool,
              tenantContext: TENANT_CONTEXT,
              transactionRetries: 10
            }),
            new SimulatedHyperliquidExchangeTransport()
          ).execute(executionInput(`concurrent-${index}`))
        )
      );
      const durableNonces = [
        firstExecution,
        ...concurrentExecutions
      ].map(({ nonce }) => nonce);
      assert.equal(new Set(durableNonces).size, durableNonces.length);
      assert.deepEqual(
        [...durableNonces].sort((left, right) => left - right),
        Array.from(
          { length: durableNonces.length },
          (_, index) => executionClockMs + index
        )
      );
      const executionAudit = await withTenantTransaction(
        pool,
        TENANT_CONTEXT,
        (client) =>
          client.query(
            `SELECT
               (SELECT count(*)::int
                  FROM trading_testnet_execution_records
                 WHERE facility_id = $1) AS records,
               (SELECT count(*)::int
                  FROM trading_testnet_execution_transitions t
                  JOIN trading_testnet_execution_records r
                    ON r.tenant_id = t.tenant_id
                   AND r.id = t.execution_id
                 WHERE r.facility_id = $1) AS transitions,
               (SELECT count(*)::int
                  FROM trading_execution_nonce_heads
                 WHERE facility_id = $1) AS nonce_heads`,
            [durableFacility.tradingFacilityId]
          )
      );
      assert.deepEqual(executionAudit.rows[0], {
        records: 21,
        transitions: 63,
        nonce_heads: 1
      });

      const guardianClockMs = executionClockMs + 10_000;
      const protectiveVenueState = createHyperliquidTestnetVenueState(
        {
          facilityId: durableFacility.tradingFacilityId,
          facilityHash: durableFacility.facilityHash,
          sourceInfoSnapshotHash: hashId(
            "tc_302_simulated_info_snapshot",
            { facilityId: durableFacility.tradingFacilityId }
          ),
          observedAtMs: guardianClockMs,
          maximumAgeMs: 60_000,
          openOrders: [
            {
              assetIndex: 1,
              orderId: 302001,
              cloid: "0x30203020302030203020302030203020",
              riskIncreasing: true
            }
          ],
          positions: [
            {
              assetIndex: 1,
              side: "long",
              size: "0.001",
              protectiveLimitPx: "2500"
            }
          ],
          simulationFixtureOnly: true,
          productionPolicyApproved: false
        },
        { clock: () => guardianClockMs }
      );
      const protectiveRiskSnapshot =
        createHyperliquidTestnetRiskSnapshot(
          {
            facilityId: durableFacility.tradingFacilityId,
            facilityHash: durableFacility.facilityHash,
            facilityVersion: durableFacility.version,
            venueState: protectiveVenueState,
            evaluatedRiskState: "FLATTEN",
            riskPolicyVersion:
              HYPERLIQUID_TESTNET_RISK_POLICY_VERSION,
            riskPolicyHash: hashId(
              "tc_302_simulation_policy",
              { version: HYPERLIQUID_TESTNET_RISK_POLICY_VERSION }
            ),
            reasonCodes: ["simulation_fixture_liquidation_buffer"],
            riskIncreasingKillSwitchOpen: true,
            externalWriteState: "RECONCILED",
            simulationFixtureOnly: true,
            productionPolicyApproved: false
          },
          { clock: () => guardianClockMs }
        );
      const protectiveExecutor =
        new SimulatedHyperliquidProtectiveExecutor({
          venueState: protectiveVenueState,
          clock: () => guardianClockMs
        });
      const protectiveRepository =
        new PostgresHyperliquidRiskGuardianRepository({
          eventRepository: restarted.eventRepository
        });
      const riskGuardian = new HyperliquidTestnetRiskGuardian({
        repository: protectiveRepository,
        executor: protectiveExecutor,
        clock: () => guardianClockMs
      });
      const protectiveInput = {
        riskSnapshot: protectiveRiskSnapshot,
        venueState: protectiveVenueState,
        idempotencyKey: "tc302-postgres-flatten-0001"
      };
      const [protectiveControl, concurrentProtectiveReplay] =
        await Promise.all([
          riskGuardian.enforce(protectiveInput),
          riskGuardian.enforce(protectiveInput)
        ]);
      assert.deepEqual(concurrentProtectiveReplay, protectiveControl);
      assert.equal(protectiveControl.status, "VERIFIED");
      assert.equal(protectiveControl.targetRiskState, "FLATTEN");
      assert.deepEqual(
        protectiveControl.actions.map(({ kind }) => kind),
        ["cancel", "reduceOnlyClose"]
      );
      assert.equal(
        protectiveControl.actions[1].reduceOnly,
        true
      );
      assert.equal(protectiveControl.verification.openOrderCount, 0);
      assert.equal(protectiveControl.verification.positionCount, 0);
      assert.equal(protectiveControl.withdrawalAuthority, false);
      assert.equal(protectiveControl.transferAuthority, false);
      assert.equal(protectiveControl.automaticRecovery, false);
      assert.equal(protectiveExecutor.executionCount, 2);
      assert.deepEqual(
        (
          await protectiveRepository.transitionHistory(
            protectiveControl.controlId
          )
        ).map(({ nextStatus }) => nextStatus),
        ["PLANNED", "EXECUTING", "VERIFIED"]
      );

      const guardianRestart = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const guardianReplayExecutor =
        new SimulatedHyperliquidProtectiveExecutor({
          venueState: protectiveVenueState,
          clock: () => guardianClockMs
        });
      const durableProtectiveReplay =
        await new HyperliquidTestnetRiskGuardian({
          repository: new PostgresHyperliquidRiskGuardianRepository({
            eventRepository: guardianRestart.eventRepository
          }),
          executor: guardianReplayExecutor,
          clock: () => guardianClockMs
        }).enforce(protectiveInput);
      assert.deepEqual(durableProtectiveReplay, protectiveControl);
      assert.equal(guardianReplayExecutor.executionCount, 0);
      const protectiveAudit = await withTenantTransaction(
        pool,
        TENANT_CONTEXT,
        (client) =>
          client.query(
            `SELECT
               (SELECT count(*)::int
                  FROM trading_testnet_protective_controls
                 WHERE facility_id = $1) AS controls,
               (SELECT count(*)::int
                  FROM trading_testnet_protective_transitions t
                  JOIN trading_testnet_protective_controls c
                    ON c.tenant_id = t.tenant_id
                   AND c.id = t.control_id
                 WHERE c.facility_id = $1) AS transitions`,
            [durableFacility.tradingFacilityId]
          )
      );
      assert.deepEqual(protectiveAudit.rows[0], {
        controls: 1,
        transitions: 3
      });

      const reconciliationClockMs = guardianClockMs + 1_000;
      const canonicalLedgerSnapshot = await withTenantTransaction(
        pool,
        TENANT_CONTEXT,
        async (client) => {
          const result = await client.query(
            `SELECT
               count(*)::int AS transaction_count,
               COALESCE(
                 string_agg(transaction_hash, ',' ORDER BY transaction_hash),
                 ''
               ) AS transaction_hashes
               FROM ledger_transactions`
          );
          return {
            transactionCount: result.rows[0].transaction_count,
            stateHash: hashId("tc_303_canonical_ledger_snapshot", {
              transactionCount: result.rows[0].transaction_count,
              transactionHashes: result.rows[0].transaction_hashes
            })
          };
        }
      );
      const reconciliationKernelSnapshot = {
        executionId: firstExecution.executionId,
        executionHash: firstExecution.executionHash,
        executionNonceState: firstExecution.nonceState,
        nonce: firstExecution.nonce,
        actionKind: firstExecution.actionKind,
        actionHash: firstExecution.actionHash,
        cloid: firstExecution.cloid,
        facilityId: durableFacility.tradingFacilityId,
        facilityHash: durableFacility.facilityHash,
        facilityStateHash: durableFacility.stateHash,
        facilityVersion: durableFacility.version,
        orderIntentId: durableOrder.tradingOrderIntentId,
        orderIntentHash: durableOrder.orderIntentHash,
        orderIntentStateHash: durableOrder.orderStateHash,
        orderIntentVersion: durableOrder.version,
        subjectId: durableFacility.subjectId,
        obligationId: durableFacility.obligationId,
        accountBindingHash: firstExecution.accountBindingHash,
        signerReferenceHash: firstExecution.signerReferenceHash,
        requestedSize: firstExecution.action.size,
        requestedNotionalMinor: "250",
        canonicalLedgerStateHash: canonicalLedgerSnapshot.stateHash,
        ledgerTransactionCount:
          canonicalLedgerSnapshot.transactionCount,
        riskSnapshotHash: protectiveRiskSnapshot.riskSnapshotHash,
        riskState: "FLATTEN",
        simulationOnly: true,
        externalOrderSubmitted: false,
        canonicalLedger: true,
        secondLedgerCreated: false,
        capturedAt: new Date(reconciliationClockMs).toISOString(),
        schemaVersion:
          "hyperliquid_testnet_reconciliation_kernel_snapshot.v1"
      };
      const reconciledVenueObservation =
        createSimulatedHyperliquidVenueObservation(
          {
            executionHash: firstExecution.executionHash,
            facilityHash: durableFacility.facilityHash,
            actionHash: firstExecution.actionHash,
            cloid: firstExecution.cloid,
            kind: "NORMALIZED_STATE",
            venueStatus: HyperliquidVenueOrderStatus.FILLED,
            cumulativeFilledSize: firstExecution.action.size,
            cumulativeFillNotionalMinor: "250",
            venueOrderReferenceHash: hashId(
              "tc_303_simulated_venue_order",
              { executionHash: firstExecution.executionHash }
            ),
            orderStateHash: hashId(
              "tc_303_simulated_venue_order_state",
              { executionHash: firstExecution.executionHash }
            ),
            positionStateHash: hashId(
              "tc_303_simulated_venue_position_state",
              { executionHash: firstExecution.executionHash }
            ),
            accountStateHash: hashId(
              "tc_303_simulated_venue_account_state",
              { executionHash: firstExecution.executionHash }
            ),
            freshness: "FRESH",
            complete: true,
            reasonCode: "protected_simulation_e2e"
          },
          { clock: () => reconciliationClockMs }
        );
      const reconciliationRepository =
        new PostgresHyperliquidReconciliationRepository({
          eventRepository: restarted.eventRepository
        });
      const createReconciliationService = (
        core,
        observationAdapter,
        {
          snapshot = reconciliationKernelSnapshot,
          maxPollAttempts = 2,
          circuitBreakerFailureThreshold = 2
        } = {}
      ) =>
        new HyperliquidTestnetReconciliationService({
          repository:
            new PostgresHyperliquidReconciliationRepository({
              eventRepository: core.eventRepository
            }),
          commandGuard:
            new SimulatedHyperliquidReconciliationCommandGuard(),
          kernelResolver:
            new SimulatedHyperliquidReconciliationKernelResolver({
              snapshots: [snapshot]
            }),
          observationAdapter,
          maxPollAttempts,
          circuitBreakerFailureThreshold,
          clock: () => reconciliationClockMs
        });
      const reconciliationInput = {
        executionId: firstExecution.executionId,
        executionHash: firstExecution.executionHash,
        idempotencyKey: "tc303-postgres-reconciliation-0001"
      };
      const firstReconciliationAdapter =
        new ScriptedHyperliquidVenueObservationAdapter({
          steps: [reconciledVenueObservation]
        });
      const firstReconciliation =
        await createReconciliationService(
          restarted,
          firstReconciliationAdapter
        ).reconcile(reconciliationInput);
      assert.equal(firstReconciliation.status, "RECONCILED");
      assert.equal(firstReconciliation.outcome, "confirmed");
      assert.equal(firstReconciliation.executionNonceState, "CONFIRMED");
      assert.equal(firstReconciliation.cumulativeFilledSize, "0.001");
      assert.equal(
        firstReconciliation.cumulativeFillNotionalMinor,
        "250"
      );
      assert.equal(firstReconciliation.ledgerMutationCreated, false);
      assert.equal(firstReconciliation.facilityMutationCreated, false);
      assert.equal(firstReconciliation.secondLedgerCreated, false);
      assert.equal(firstReconciliation.externalSystemQueried, false);
      assert.equal(firstReconciliation.externalOrderSubmitted, false);
      assert.equal(firstReconciliationAdapter.callCount, 1);

      const reconciliationRestart = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const replayReconciliationAdapter =
        new ScriptedHyperliquidVenueObservationAdapter({
          steps: [reconciledVenueObservation]
        });
      const replayedReconciliation =
        await createReconciliationService(
          reconciliationRestart,
          replayReconciliationAdapter
        ).reconcile(reconciliationInput);
      assert.deepEqual(replayedReconciliation, firstReconciliation);
      assert.equal(replayReconciliationAdapter.callCount, 0);
      assert.equal(
        (
          await reconciliationRepository.history(
            firstReconciliation.reconciliationId
          )
        ).length,
        2
      );

      const unknownExecutionTransport =
        new SimulatedHyperliquidExchangeTransport({
          disposition: "unknown"
        });
      const unknownExecution = await createExecutionGateway(
        reconciliationRestart,
        unknownExecutionTransport
      ).execute(executionInput("unknown-recovery"));
      assert.equal(unknownExecution.nonceState, "UNKNOWN");
      assert.equal(unknownExecutionTransport.submissionHashes.length, 1);
      const unknownKernelSnapshot = {
        ...reconciliationKernelSnapshot,
        executionId: unknownExecution.executionId,
        executionHash: unknownExecution.executionHash,
        executionNonceState: unknownExecution.nonceState,
        nonce: unknownExecution.nonce,
        actionKind: unknownExecution.actionKind,
        actionHash: unknownExecution.actionHash,
        cloid: unknownExecution.cloid,
        accountBindingHash: unknownExecution.accountBindingHash,
        signerReferenceHash: unknownExecution.signerReferenceHash
      };
      const unknownReconciliationInput = {
        executionId: unknownExecution.executionId,
        executionHash: unknownExecution.executionHash,
        idempotencyKey: "tc303-postgres-unknown-recovery-0001"
      };
      const outageAdapter =
        new ScriptedHyperliquidVenueObservationAdapter({
          steps: [{ errorCode: "simulated_adapter_timeout" }]
        });
      const unknownReconciliation =
        await createReconciliationService(
          reconciliationRestart,
          outageAdapter,
          {
            snapshot: unknownKernelSnapshot,
            maxPollAttempts: 1,
            circuitBreakerFailureThreshold: 3
          }
        ).reconcile(unknownReconciliationInput);
      assert.equal(unknownReconciliation.status, "UNKNOWN");
      assert.equal(unknownReconciliation.reconciled, false);
      assert.equal(unknownReconciliation.newRiskBlocked, true);
      assert.equal(unknownReconciliation.executionNonceState, "UNKNOWN");
      assert.equal(outageAdapter.callCount, 1);

      const recoveredObservation =
        createSimulatedHyperliquidVenueObservation(
          {
            executionHash: unknownExecution.executionHash,
            facilityHash: durableFacility.facilityHash,
            actionHash: unknownExecution.actionHash,
            cloid: unknownExecution.cloid,
            kind: "NORMALIZED_STATE",
            venueStatus: HyperliquidVenueOrderStatus.FILLED,
            cumulativeFilledSize: unknownExecution.action.size,
            cumulativeFillNotionalMinor: "250",
            venueOrderReferenceHash: hashId(
              "tc_303_simulated_recovered_venue_order",
              { executionHash: unknownExecution.executionHash }
            ),
            orderStateHash: hashId(
              "tc_303_simulated_recovered_order_state",
              { executionHash: unknownExecution.executionHash }
            ),
            positionStateHash: hashId(
              "tc_303_simulated_recovered_position_state",
              { executionHash: unknownExecution.executionHash }
            ),
            accountStateHash: hashId(
              "tc_303_simulated_recovered_account_state",
              { executionHash: unknownExecution.executionHash }
            ),
            freshness: "FRESH",
            complete: true,
            reasonCode: "restart_unknown_recovered"
          },
          { clock: () => reconciliationClockMs }
        );
      const recoveredAdapter =
        new ScriptedHyperliquidVenueObservationAdapter({
          steps: [recoveredObservation]
        });
      const recoveredCore = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const recoveredReconciliation =
        await createReconciliationService(
          recoveredCore,
          recoveredAdapter,
          {
            snapshot: unknownKernelSnapshot,
            maxPollAttempts: 1,
            circuitBreakerFailureThreshold: 3
          }
        ).reconcile(unknownReconciliationInput);
      assert.equal(recoveredReconciliation.status, "RECONCILED");
      assert.equal(recoveredReconciliation.outcome, "confirmed");
      assert.equal(
        recoveredReconciliation.executionNonceState,
        "UNKNOWN"
      );
      assert.equal(
        recoveredReconciliation.nonce,
        unknownReconciliation.nonce
      );
      assert.equal(
        recoveredReconciliation.reconciliationHash,
        unknownReconciliation.reconciliationHash
      );
      assert.equal(recoveredAdapter.callCount, 1);
      assert.equal(
        (
          await new PostgresHyperliquidReconciliationRepository({
            eventRepository: recoveredCore.eventRepository
          }).history(recoveredReconciliation.reconciliationId)
        ).length,
        4
      );
      const reconciliationAudit = await withTenantTransaction(
        pool,
        TENANT_CONTEXT,
        (client) =>
          client.query(
            `SELECT
               (SELECT count(*)::int
                  FROM trading_testnet_reconciliation_runs
                 WHERE facility_id = $1) AS runs,
               (SELECT count(*)::int
                  FROM domain_events
                 WHERE aggregate_type =
                   'trading_execution_reconciliation') AS events,
               (SELECT count(*)::int
                  FROM evidence_envelopes
                 WHERE aggregate_type =
                   'trading_execution_reconciliation') AS evidence,
               (SELECT count(*)::int
                  FROM outbox_messages o
                  JOIN domain_events e ON e.id = o.event_id
                 WHERE e.aggregate_type =
                   'trading_execution_reconciliation') AS outbox,
               (SELECT count(*)::int
                  FROM inbox_messages
                 WHERE consumer_name =
                   'ipo.one.hyperliquid-testnet-reconciliation.v1') AS inbox`,
            [durableFacility.tradingFacilityId]
          )
      );
      assert.deepEqual(reconciliationAudit.rows[0], {
        runs: 2,
        events: 6,
        evidence: 6,
        outbox: 6,
        inbox: 4
      });
      await assert.rejects(
        () =>
          withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
            client.query(
              `UPDATE trading_testnet_execution_records
                  SET nonce = nonce + 1
                WHERE id = $1`,
              [firstExecution.executionId]
            )
          ),
        (error) => error.code === "23514"
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
            client.query(
              `UPDATE trading_testnet_reconciliation_runs
                  SET nonce = nonce + 1
                WHERE id = $1`,
              [firstReconciliation.reconciliationId]
            )
          ),
        (error) => error.code === "23514"
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
            client.query(
              `DELETE FROM trading_testnet_execution_transitions
                WHERE execution_id = $1`,
              [firstExecution.executionId]
            )
          ),
        (error) => error.code === "23514"
      );

      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
          client.query(
            `UPDATE trading_facilities
             SET risk_state = 'normal',
                 lifecycle_status = 'active',
                 version = version + 1
             WHERE id = $1`,
            [active.tradingFacilityId]
          )
        ),
        (error) => error.code === "23514"
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
            client.query(
              `UPDATE trading_testnet_protective_controls
                  SET target_risk_state = 'NORMAL'
                WHERE id = $1`,
              [protectiveControl.controlId]
            )
          ),
        (error) => error.code === "23514"
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
            client.query(
              `DELETE FROM trading_testnet_protective_transitions
                WHERE control_id = $1`,
              [protectiveControl.controlId]
            )
        ),
        (error) => error.code === "23514"
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
            client.query(
              `UPDATE trading_testnet_facility_funding_controls
                  SET facility_destination_hash = $2
                WHERE id = $1`,
              [
                tc401Prepared.fundingId,
                hashId("tc_401_forbidden_destination_mutation", {
                  fundingId: tc401Prepared.fundingId
                })
              ]
            )
          ),
        (error) => error.code === "23514"
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, TENANT_CONTEXT, (client) =>
            client.query(
              `DELETE FROM trading_testnet_facility_funding_controls
                WHERE id = $1`,
              [tc401Prepared.fundingId]
            )
          ),
        (error) => error.code === "23514"
      );
      const rlsRole =
        `ipo_one_tc103_rls_${randomBytes(6).toString("hex")}`;
      await pool.query(
        `CREATE ROLE ${rlsRole}
         NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
         NOINHERIT NOREPLICATION NOBYPASSRLS`
      );
      try {
        await pool.query(`GRANT USAGE ON SCHEMA public TO ${rlsRole}`);
        await pool.query(
          `GRANT SELECT ON
             trading_facilities,
             trading_order_intents,
             trading_facility_risk_evaluations,
             trading_execution_nonce_heads,
             trading_testnet_execution_records,
             trading_testnet_execution_transitions,
             trading_testnet_protective_controls,
             trading_testnet_protective_transitions,
             trading_testnet_reconciliation_runs,
             trading_testnet_facility_funding_controls
           TO ${rlsRole}`
        );
        const hidden = await (async () => {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query(`SET LOCAL ROLE ${rlsRole}`);
            await setTenantTransactionContext(client, TENANT_TWO_CONTEXT);
            const result = await client.query(
              `SELECT
                 (SELECT count(*)::int FROM trading_facilities
                   WHERE id = $1) AS facilities,
                 (SELECT count(*)::int FROM trading_order_intents
                   WHERE id = $2) AS orders,
                 (SELECT count(*)::int FROM trading_facility_risk_evaluations
                   WHERE id = $3) AS evaluations,
                 (SELECT count(*)::int FROM trading_execution_nonce_heads
                   WHERE facility_id = $1) AS nonce_heads,
                 (SELECT count(*)::int FROM trading_testnet_execution_records
                   WHERE facility_id = $1) AS executions,
                 (SELECT count(*)::int
                    FROM trading_testnet_execution_transitions
                   WHERE execution_id = $4) AS execution_transitions,
                 (SELECT count(*)::int
                    FROM trading_testnet_protective_controls
                   WHERE facility_id = $1) AS protective_controls,
                 (SELECT count(*)::int
                    FROM trading_testnet_protective_transitions
                   WHERE control_id = $5) AS protective_transitions,
                 (SELECT count(*)::int
                    FROM trading_testnet_reconciliation_runs
                   WHERE id = $6) AS reconciliation_runs,
                 (SELECT count(*)::int
                    FROM trading_testnet_facility_funding_controls
                   WHERE id = $7) AS facility_funding_controls`,
              [
                active.tradingFacilityId,
                submitted.orderIntent.tradingOrderIntentId,
                evaluated.riskEvaluation.tradingFacilityRiskEvaluationId,
                firstExecution.executionId,
                protectiveControl.controlId,
                firstReconciliation.reconciliationId,
                tc401Prepared.fundingId
              ]
            );
            await client.query("COMMIT");
            return result.rows[0];
          } catch (error) {
            try {
              await client.query("ROLLBACK");
            } catch {
              // Preserve the original test failure.
            }
            throw error;
          } finally {
            client.release();
          }
        })();
        assert.deepEqual(hidden, {
          facilities: 0,
          orders: 0,
          evaluations: 0,
          nonce_heads: 0,
          executions: 0,
          execution_transitions: 0,
          protective_controls: 0,
          protective_transitions: 0,
          reconciliation_runs: 0,
          facility_funding_controls: 0
        });
      } finally {
        await pool.query(`DROP OWNED BY ${rlsRole}`);
        await pool.query(`DROP ROLE ${rlsRole}`);
      }

      const reconciliation = new PostgresReconciliationService({
        pool,
        tenantContext: TENANT_CONTEXT,
        coreRepository: restarted,
        eventRepository: restarted.eventRepository,
        approvalService: {
          assertApproved() {
            throw new Error("repair is not authorized in the clean path");
          }
        }
      });
      const reconciled = await reconciliation.run({
        initiatedBy: "system:test-tc-103-reconciliation",
        idempotencyKey: "tc-103-reconciliation-clean-0001"
      });
      assert.equal(
        reconciled.status,
        "passed",
        JSON.stringify(await reconciliation.getRun(reconciled.runId))
      );
      tc104Seed = {
        facility: durableFacility,
        obligation: execution.obligation,
        proposal: finalProposal,
        funding: tc401Activation.record,
        finalReconciliationHash:
          recoveredReconciliation.reconciliationHash
      };
    });

    await t.test("TC-104 close plus TC-402 final settlement and revocable Evidence are durable, balanced, isolated, and restart-recoverable", async () => {
      assert.ok(tc104Seed, "TC-103 flattened Facility must be durable");
      const repository = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT,
        transactionRetries: 10
      });
      const { facility, obligation } = tc104Seed;
      const ledgerBefore = await withTenantTransaction(
        pool,
        TENANT_CONTEXT,
        async (client) => {
          const result = await client.query(
            "SELECT count(*)::int AS transactions FROM ledger_transactions"
          );
          return result.rows[0].transactions;
        }
      );
      const closeRequest = requestTradingFacilityClose({
        facility,
        requestedByActorId: "actor_tc_102_subject",
        expectedStateHash: facility.stateHash,
        expectedVersion: facility.version,
        now: new Date("2026-07-25T01:19:00.000Z")
      });
      const closeEvent = createCreditEvent({
        eventType: CreditEventType.TRADING_FACILITY_CLOSE_REQUESTED,
        subjectId: facility.subjectId,
        obligationId: facility.obligationId,
        payload: {
          tradingFacilityId: facility.tradingFacilityId,
          tradingFacilityCloseRequestId:
            closeRequest.tradingFacilityCloseRequestId,
          requestHash: closeRequest.requestHash,
          syntheticOnly: true,
          nonRedeemable: true,
          fundsAuthority: false,
          productionFundsMoved: false
        },
        now: new Date(closeRequest.requestedAt)
      });
      const closeCommand = {
        aggregateType: "trading_facility_close_request",
        aggregateId: closeRequest.tradingFacilityCloseRequestId,
        idempotencyKey: "tc-104-close-request-0001",
        commandHash: hashId("tc_104_close_request", {
          requestHash: closeRequest.requestHash
        }),
        events: [{
          aggregateType: "trading_facility_close_request",
          aggregateId: closeRequest.tradingFacilityCloseRequestId,
          expectedVersion: 0,
          event: closeEvent
        }],
        writes: [{
          type: CoreProjectionType.TRADING_FACILITY_CLOSE_REQUEST,
          value: closeRequest,
          eventId: closeEvent.eventId
        }],
        response: {
          tradingFacilityCloseRequestId:
            closeRequest.tradingFacilityCloseRequestId
        }
      };
      await repository.commitCommand(closeCommand);
      assert.equal((await repository.commitCommand(closeCommand)).replayed, true);

      {
        const {
          proposal,
          funding,
          finalReconciliationHash
        } = tc104Seed;
        const settlementNow =
          new Date("2026-07-25T01:20:00.000Z").getTime();
        const canonicalLedgerState = await withTenantTransaction(
          pool,
          TENANT_CONTEXT,
          async (client) => {
            const result = await client.query(
              `SELECT count(*)::int AS transaction_count,
                      coalesce(
                        jsonb_agg(transaction_hash ORDER BY id),
                        '[]'::jsonb
                      ) AS transaction_hashes
                 FROM ledger_transactions`
            );
            return {
              count: result.rows[0].transaction_count,
              stateHash: hashId("tc_402_canonical_ledger_snapshot", {
                transactionHashes: result.rows[0].transaction_hashes
              })
            };
          }
        );
        const snapshot = {
          facility,
          proposal,
          obligation,
          facilityId: facility.tradingFacilityId,
          facilityHash: facility.facilityHash,
          facilityStateHash: facility.stateHash,
          facilityVersion: facility.version,
          facilityLifecycleStatus: facility.lifecycleStatus,
          facilityRiskState: "FLATTEN",
          openOrderCount: 0,
          exposureMinor: "0",
          newRiskAdmissionOpen: false,
          closeAdmissionFrozen: true,
          fundingId: funding.fundingId,
          fundingHash: funding.fundingHash,
          fundingStatus: funding.status,
          closeRequestId:
            closeRequest.tradingFacilityCloseRequestId,
          closeRequestHash: closeRequest.requestHash,
          closeRequestStatus: closeRequest.status,
          obligationId: obligation.obligationId,
          obligationHash: obligation.obligationHash,
          obligationExecutionStatus: obligation.executionStatus,
          obligationWithdrawable: obligation.withdrawable,
          subjectId: facility.subjectId,
          assetId: facility.assetId,
          templateType: proposal.terms.templateType,
          termsHash: facility.termsHash,
          fixedReturnBps: proposal.terms.fixedReturnBps,
          performanceParticipationBps:
            proposal.terms.performanceParticipationBps,
          durationDays: proposal.terms.durationDays,
          subjectContributionMinor:
            facility.subjectCollateralMinor,
          providerContributionMinor:
            facility.providerFundingMinor,
          finalReconciliationHash,
          reconciliationStatus: "RECONCILED",
          unknownExecutionCount: 0,
          canonicalLedgerStateHash:
            canonicalLedgerState.stateHash,
          ledgerTransactionCount:
            canonicalLedgerState.count,
          canonicalFacility: true,
          canonicalObligation: true,
          canonicalLedger: true,
          secondFacilityCreated: false,
          secondObligationCreated: false,
          secondLedgerCreated: false,
          simulationOnly: true,
          externalSystemQueried: false,
          liveAccountsApproved: false,
          capturedAt: new Date(settlementNow).toISOString(),
          schemaVersion:
            "hyperliquid_testnet_settlement_kernel_snapshot.v1"
        };
        const policy = createSimulatedTestnetFeePolicy({
          policyId: "tc402_postgres_simulation_fee_policy_v1",
          approvalEvidenceHash: hashId(
            "tc_402_postgres_fee_policy_decision",
            { scope: "simulation_only" }
          ),
          approvedByActorHash: hashId(
            "actor",
            "IPO.ONE Founder"
          ),
          ipoOneFeeBps: 200,
          validFrom: new Date(settlementNow - 60_000).toISOString(),
          validUntil: new Date(
            settlementNow + 86_400_000
          ).toISOString()
        }, { clock: () => settlementNow });
        const placeholder =
          createSimulatedTestnetFinalityObservation({
            settlementHash: hashId(
              "tc_402_postgres_placeholder",
              { facilityId: facility.tradingFacilityId }
            ),
            facilityHash: facility.facilityHash,
            fundingHash: funding.fundingHash,
            assetId: facility.assetId,
            sourceEvidenceHash: hashId(
              "tc_402_postgres_placeholder_evidence",
              { facilityId: facility.tradingFacilityId }
            ),
            finalityStatus: "UNKNOWN",
            reconciliationStatus: "UNKNOWN",
            openOrderCount: 0,
            exposureMinor: "0",
            unknownExecutionCount: 1,
            positionsFinal: false,
            unrealizedPnlMinor: "0",
            realizedPnlMinor: "0",
            venueCostMinor: "0",
            closingCostMinor: "0",
            finalEquityMinor: "0",
            complete: false,
            economicValuesAuthoritative: false,
            reasonCode: "prepare_only"
          }, { clock: () => settlementNow });
        const createSettlementService = (
          core,
          observations,
          nowMs
        ) =>
          new HyperliquidTestnetSettlementService({
            repository:
              new PostgresHyperliquidSettlementRepository({
                coreRepository: core
              }),
            commandGuard:
              new SimulatedHyperliquidSettlementCommandGuard(),
            kernelResolver:
              new SimulatedHyperliquidSettlementKernelResolver({
                snapshots: [snapshot]
              }),
            observationAdapter:
              new ScriptedHyperliquidFinalityObservationAdapter({
                observations
              }),
            feePolicyAdapter:
              new ScriptedHyperliquidFeePolicyAdapter({ policy }),
            clock: () => nowMs
          });
        const prepared = await createSettlementService(
          repository,
          [placeholder],
          settlementNow
        ).prepare({
          facilityId: facility.tradingFacilityId,
          facilityHash: facility.facilityHash,
          idempotencyKey: "tc402-postgres-prepare-0001"
        });
        assert.equal(prepared.record.status, "AWAITING_FINALITY");
        const capital =
          BigInt(facility.subjectCollateralMinor) +
          BigInt(facility.providerFundingMinor);
        const realizedPnl = 120_000n;
        const venueCost = 15_000n;
        const closingCost = 5_000n;
        const finalEquity =
          capital + realizedPnl - venueCost - closingCost;
        const finalObservation =
          createSimulatedTestnetFinalityObservation({
            settlementHash: prepared.record.settlementHash,
            facilityHash: facility.facilityHash,
            fundingHash: funding.fundingHash,
            assetId: facility.assetId,
            sourceEvidenceHash: hashId(
              "tc_402_postgres_final_source_evidence",
              { settlementHash: prepared.record.settlementHash }
            ),
            finalityStatus: "FINAL",
            reconciliationStatus: "RECONCILED",
            openOrderCount: 0,
            exposureMinor: "0",
            unknownExecutionCount: 0,
            positionsFinal: true,
            unrealizedPnlMinor: "0",
            realizedPnlMinor: realizedPnl.toString(),
            venueCostMinor: venueCost.toString(),
            closingCostMinor: closingCost.toString(),
            finalEquityMinor: finalEquity.toString(),
            complete: true,
            economicValuesAuthoritative: true,
            reasonCode: "final_reconciled"
          }, { clock: () => settlementNow + 1_000 });
        const activeService = createSettlementService(
          repository,
          [finalObservation],
          settlementNow + 1_000
        );
        const ready = await activeService.reconcileFinality({
          settlementId: prepared.record.settlementId
        });
        assert.equal(ready.record.status, "READY_TO_SETTLE");
        const settled402 = await activeService.settle({
          settlementId: prepared.record.settlementId,
          idempotencyKey: "tc402-postgres-settle-0001"
        });
        assert.equal(settled402.record.status, "SETTLED");
        assert.equal(settled402.facility.riskState, "SETTLEMENT");
        assert.equal(
          settled402.ledger.transaction.debitTotalMinor,
          settled402.ledger.transaction.creditTotalMinor
        );
        assert.equal(
          settled402.record.waterfall.totalAllocatedMinor,
          finalEquity.toString()
        );
        assert.equal(
          settled402.record.waterfall.principalFeeApplied,
          false
        );
        assert.equal(
          settled402.record.waterfall.unrealizedPnlFeeApplied,
          false
        );
        const settledReplay = await activeService.settle({
          settlementId: prepared.record.settlementId,
          idempotencyKey: "tc402-postgres-settle-0001"
        });
        assert.equal(settledReplay.replayed, true);
        assert.deepEqual(
          settledReplay.record,
          settled402.record
        );
        const issued = await activeService.issuePerformanceEvidence({
          settlementId: prepared.record.settlementId,
          idempotencyKey: "tc402-postgres-evidence-v1"
        });
        assert.equal(issued.record.status, "EVIDENCE_ACTIVE");
        const firstEvidenceHash =
          issued.record.currentPerformanceEvidence
            .performanceEvidenceHash;
        const revoked =
          await activeService.revokePerformanceEvidence({
            settlementId: prepared.record.settlementId,
            idempotencyKey:
              "tc402-postgres-evidence-revoke-v2",
            reasonCode: "source_evidence_invalidated"
          });
        assert.equal(revoked.record.status, "EVIDENCE_REVOKED");
        assert.equal(
          revoked.record.currentPerformanceEvidence
            .previousEvidenceHash,
          firstEvidenceHash
        );
        const restartedCore = new PostgresCoreRepository({
          pool,
          tenantContext: TENANT_CONTEXT
        });
        const restartedService = createSettlementService(
          restartedCore,
          [finalObservation],
          settlementNow + 2_000
        );
        const reissued =
          await restartedService.issuePerformanceEvidence({
            settlementId: prepared.record.settlementId,
            idempotencyKey: "tc402-postgres-evidence-v3"
          });
        assert.equal(reissued.record.status, "EVIDENCE_ACTIVE");
        assert.equal(reissued.record.performanceEvidenceVersion, 3);
        assert.equal(
          reissued.record.currentPerformanceEvidence
            .previousEvidenceHash,
          revoked.record.currentPerformanceEvidence
            .performanceEvidenceHash
        );
        const reissueReplay =
          await restartedService.issuePerformanceEvidence({
            settlementId: prepared.record.settlementId,
            idempotencyKey: "tc402-postgres-evidence-v3"
          });
        assert.equal(reissueReplay.replayed, true);
        assert.deepEqual(reissueReplay.record, reissued.record);
        const durable =
          await new PostgresHyperliquidSettlementRepository({
            coreRepository: restartedCore
          }).findById(prepared.record.settlementId);
        assert.deepEqual(durable, reissued.record);
        assert.equal(
          (
            await new PostgresHyperliquidSettlementRepository({
              coreRepository: restartedCore
            }).history(prepared.record.settlementId)
          ).length,
          6
        );
        const ledgerAfter402 = await withTenantTransaction(
          pool,
          TENANT_CONTEXT,
          async (client) => {
            const result = await client.query(
              `SELECT
                 (SELECT count(*)::int
                    FROM ledger_transactions) AS transactions,
                 (SELECT count(*)::int
                    FROM trading_testnet_settlement_runs
                   WHERE id = $1) AS runs,
                 (SELECT count(*)::int
                    FROM domain_events
                   WHERE aggregate_type =
                     'trading_testnet_settlement') AS events,
                 (SELECT count(*)::int
                    FROM evidence_envelopes
                   WHERE aggregate_type =
                     'trading_testnet_settlement') AS evidence,
                 (SELECT count(*)::int
                    FROM outbox_messages o
                    JOIN domain_events e ON e.id = o.event_id
                   WHERE e.aggregate_type =
                     'trading_testnet_settlement') AS outbox,
                 (SELECT count(*)::int
                    FROM inbox_messages
                   WHERE consumer_name =
                     'ipo.one.hyperliquid-testnet-finality-observations.v1')
                   AS inbox`
              ,
              [prepared.record.settlementId]
            );
            return result.rows[0];
          }
        );
        assert.deepEqual(ledgerAfter402, {
          transactions: ledgerBefore + 1,
          runs: 1,
          events: 6,
          evidence: 6,
          outbox: 6,
          inbox: 1
        });
        assert.equal(
          (
            await restartedCore.verifyProjection(
              CoreProjectionType.TRADING_FACILITY,
              facility.tradingFacilityId
            )
          ).matches,
          true
        );
        assert.equal(
          (
            await restartedCore.verifyProjection(
              CoreProjectionType.LEDGER_TRANSACTION,
              settled402.ledger.transaction
                .ledgerTransactionId
            )
          ).matches,
          true
        );
        await assert.rejects(
          () =>
            withTenantTransaction(
              pool,
              TENANT_CONTEXT,
              (client) => client.query(
                `UPDATE trading_testnet_settlement_runs
                    SET ipo_one_fee_bps = ipo_one_fee_bps + 1
                  WHERE id = $1`,
                [prepared.record.settlementId]
              )
            ),
          (error) => error.code === "23514"
        );
        await assert.rejects(
          () =>
            withTenantTransaction(
              pool,
              TENANT_CONTEXT,
              (client) => client.query(
                `DELETE FROM trading_testnet_settlement_runs
                  WHERE id = $1`,
                [prepared.record.settlementId]
              )
            ),
          (error) => error.code === "23514"
        );
        const rlsRole =
          `ipo_one_tc402_rls_${randomBytes(6).toString("hex")}`;
        await pool.query(
          `CREATE ROLE ${rlsRole}
           NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
           NOINHERIT NOREPLICATION NOBYPASSRLS`
        );
        try {
          await pool.query(
            `GRANT USAGE ON SCHEMA public TO ${rlsRole}`
          );
          await pool.query(
            `GRANT SELECT ON
               trading_facility_close_requests,
               trading_testnet_settlement_runs
             TO ${rlsRole}`
          );
          const hidden = await (async () => {
            const client = await pool.connect();
            try {
              await client.query("BEGIN");
              await client.query(`SET LOCAL ROLE ${rlsRole}`);
              await setTenantTransactionContext(
                client,
                TENANT_TWO_CONTEXT
              );
              const result = await client.query(
                `SELECT
                   (SELECT count(*)::int
                      FROM trading_facility_close_requests
                     WHERE id = $1) AS close_requests,
                   (SELECT count(*)::int
                      FROM trading_testnet_settlement_runs
                     WHERE id = $2) AS settlement_runs`,
                [
                  closeRequest.tradingFacilityCloseRequestId,
                  prepared.record.settlementId
                ]
              );
              await client.query("COMMIT");
              return result.rows[0];
            } catch (error) {
              await client.query("ROLLBACK");
              throw error;
            } finally {
              client.release();
            }
          })();
          assert.deepEqual(hidden, {
            close_requests: 0,
            settlement_runs: 0
          });
        } finally {
          await pool.query(`DROP OWNED BY ${rlsRole}`);
          await pool.query(`DROP ROLE ${rlsRole}`);
        }
        if (process.env.IPO_ONE_TC403_DRILL_APPROVAL === "TC-403") {
          const drill = spawnSync(
            process.execPath,
            ["scripts/run-tc403-disaster-recovery-drill.mjs"],
            {
              cwd: process.cwd(),
              env: process.env,
              encoding: "utf8",
              maxBuffer: 16 * 1024 * 1024
            }
          );
          assert.equal(
            drill.status,
            0,
            drill.stderr || drill.stdout || "TC-403 DR drill failed"
          );
          const evidence = JSON.parse(drill.stdout);
          assert.equal(evidence.status, "EXACT_MATCH");
          assert.equal(evidence.exactMatch, true);
          assert.equal(evidence.sourceCounts.facility, 1);
          assert.ok(evidence.sourceCounts.ledgerTransactions > 0);
          assert.ok(evidence.sourceCounts.ledgerEntries > 0);
          assert.ok(evidence.sourceCounts.evidence > 0);
          assert.equal(evidence.sourceCounts.settlements, 1);
          assert.equal(evidence.sourceDatabaseMutated, false);
          assert.equal(evidence.restoreDatabaseRetained, false);
          assert.equal(evidence.backupArtifactRetained, false);
          assert.equal(evidence.externalSystemQueried, false);
          assert.equal(evidence.exchangeWriteSubmitted, false);
          assert.equal(evidence.credentialOperationPerformed, false);
          assert.equal(evidence.productionFundsMoved, false);
          if (
            process.env.IPO_ONE_TC403_DRILL_PRINT_EVIDENCE === "TC-403"
          ) {
            process.stdout.write(
              `[TC403_DR_EVIDENCE]${JSON.stringify(evidence)}\n`
            );
          }
        }
      }
    });

    await t.test("Human Consent and Agent Mandate credit applications share one durable kernel", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const repository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      await repository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "credit-application-agent-seed-0001",
        commandHash: hashId("core_command", { creditApplication: "agent_seed" }),
        events: fixture.events,
        writes: fixture.writes,
        response: { creditIntentId: fixture.creditIntent.creditIntentId }
      });

      const humanPrincipal = createPrincipal({
        principalType: PrincipalType.HUMAN_SELF,
        jurisdiction: "US",
        now: FIXED_NOW
      });
      const humanSubject = {
        ...createSubject({
          subjectType: SubjectType.HUMAN,
          primaryPrincipalId: humanPrincipal.principalId,
          displayName: "Human Sandbox Borrower",
          prototypeOnly: true,
          now: FIXED_NOW
        }),
        status: SubjectStatus.ACTIVE
      };
      const humanConsent = createConsentRecord({
        subjectId: humanSubject.subjectId,
        principalId: humanPrincipal.principalId,
        purposes: [
          ConsentPurpose.CREDIT_APPLICATION,
          ConsentPurpose.CREDIT_DECISION,
          ConsentPurpose.IDENTITY_REFERENCE_USE
        ],
        allowedAssetIds: [ASSET.assetId],
        allowedCreditPurposeCodes: ["human_sandbox_credit"],
        allowedRepaymentFrequencies: [RepaymentFrequency.MONTHLY],
        maxRequestedPrincipalMinor: "100000",
        maxRequestedTermDays: 90,
        maxInstallmentCount: 3,
        termsRef: "urn:ipo.one:sandbox:consent-terms:v1",
        termsVersion: "credit_consent_terms.v1",
        dataUsageRef: "urn:ipo.one:sandbox:data-usage:v1",
        dataUsageVersion: "credit_data_usage.v1",
        disclosureRef: "urn:ipo.one:sandbox:human-disclosure:v1",
        validFrom: FIXED_NOW.toISOString(),
        expiresAt: new Date(FIXED_NOW.getTime() + 90 * 86400_000).toISOString(),
        now: FIXED_NOW
      });
      const humanIntent = createCreditIntent({
        subjectId: humanSubject.subjectId,
        principalId: humanPrincipal.principalId,
        authorityType: CreditAuthorityType.CONSENT,
        authorityRef: humanConsent.consentId,
        assetId: ASSET.assetId,
        requestedPrincipalMinor: "75000",
        purposeCode: "human_sandbox_credit",
        requestedTermDays: 60,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        installmentCount: 2,
        now: FIXED_NOW
      });
      const humanEvents = [
        {
          aggregateType: "principal",
          aggregateId: humanPrincipal.principalId,
          expectedVersion: 0,
          event: createTestEvent({
            eventType: "principal_created",
            payload: { principalId: humanPrincipal.principalId },
            now: FIXED_NOW
          })
        },
        {
          aggregateType: "subject",
          aggregateId: humanSubject.subjectId,
          expectedVersion: 0,
          event: createTestEvent({
            eventType: "subject_created",
            subjectId: humanSubject.subjectId,
            payload: { subjectId: humanSubject.subjectId, principalId: humanPrincipal.principalId },
            now: FIXED_NOW
          })
        },
        {
          aggregateType: "subject",
          aggregateId: humanSubject.subjectId,
          expectedVersion: 1,
          event: createTestEvent({
            eventType: "consent_recorded",
            subjectId: humanSubject.subjectId,
            payload: { consentId: humanConsent.consentId },
            now: FIXED_NOW
          })
        },
        {
          aggregateType: "subject",
          aggregateId: humanSubject.subjectId,
          expectedVersion: 2,
          event: createTestEvent({
            eventType: "credit_intent_submitted",
            subjectId: humanSubject.subjectId,
            payload: { creditIntentId: humanIntent.creditIntentId },
            now: FIXED_NOW
          })
        }
      ];
      await repository.commitCommand({
        aggregateType: "subject",
        aggregateId: humanSubject.subjectId,
        idempotencyKey: "credit-application-human-seed-0001",
        commandHash: hashId("core_command", { creditApplication: "human_seed" }),
        events: humanEvents,
        writes: [
          {
            type: CoreProjectionType.PRINCIPAL,
            value: humanPrincipal,
            eventId: humanEvents[0].event.eventId
          },
          {
            type: CoreProjectionType.SUBJECT,
            value: humanSubject,
            eventId: humanEvents[1].event.eventId
          },
          {
            type: CoreProjectionType.CONSENT_RECORD,
            value: humanConsent,
            eventId: humanEvents[2].event.eventId
          },
          {
            type: CoreProjectionType.CREDIT_INTENT,
            value: humanIntent,
            eventId: humanEvents[3].event.eventId
          }
        ],
        response: {
          consentId: humanConsent.consentId,
          creditIntentId: humanIntent.creditIntentId
        }
      });

      const restartedHumanRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      const storedAgentIntent = await restartedHumanRepository.getCreditIntent(fixture.creditIntent.creditIntentId);
      const storedHumanIntent = await restartedHumanRepository.getCreditIntent(humanIntent.creditIntentId);
      const storedHumanConsent = await restartedHumanRepository.getConsentRecord(humanConsent.consentId);
      assert.equal(storedAgentIntent.authorityType, CreditAuthorityType.MANDATE);
      assert.equal(storedHumanIntent.authorityType, CreditAuthorityType.CONSENT);
      assert.deepEqual(storedHumanConsent, humanConsent);
      assert.equal(storedHumanIntent.sandboxOnly, true);
      assert.equal(storedHumanIntent.productionFundsRequested, false);
      assert.equal(
        (await restartedHumanRepository.verifyProjection(
          CoreProjectionType.CONSENT_RECORD,
          humanConsent.consentId
        )).matches,
        true
      );

      const consentRevokedAt = new Date(FIXED_NOW.getTime() + 86400_000);
      const revokedConsent = revokeConsentRecord(humanConsent, {
        reasonCode: "human_withdrawal",
        evidenceRef: "urn:ipo.one:evidence:consent-revocation:postgres-test",
        now: consentRevokedAt
      });
      const consentRevokedEvent = createTestEvent({
        eventType: "consent_status_changed",
        subjectId: humanSubject.subjectId,
        payload: {
          consentId: humanConsent.consentId,
          fromStatus: ConsentStatus.ACTIVE,
          toStatus: ConsentStatus.REVOKED,
          reasonCode: revokedConsent.revocationReasonCode
        },
        now: consentRevokedAt
      });
      await restartedHumanRepository.commitCommand({
        aggregateType: "subject",
        aggregateId: humanSubject.subjectId,
        idempotencyKey: "human-consent-revoke-0001",
        commandHash: hashId("core_command", { humanConsent: "revoke" }),
        events: [{
          aggregateType: "subject",
          aggregateId: humanSubject.subjectId,
          expectedVersion: 3,
          event: consentRevokedEvent
        }],
        writes: [{
          type: CoreProjectionType.CONSENT_RECORD,
          value: revokedConsent,
          eventId: consentRevokedEvent.eventId
        }],
        response: { consentId: humanConsent.consentId, status: ConsentStatus.REVOKED }
      });
      assert.deepEqual(
        await restartedHumanRepository.getConsentRecord(humanConsent.consentId),
        revokedConsent
      );
      assert.deepEqual(
        await restartedHumanRepository.getCreditIntent(humanIntent.creditIntentId),
        humanIntent
      );

      const {
        revokedAt: _revokedAt,
        revocationReasonCode: _revocationReasonCode,
        revocationEvidenceRef: _revocationEvidenceRef,
        ...consentWithoutRevocation
      } = revokedConsent;
      const consentReverseEvent = createTestEvent({
        eventType: "consent_status_changed",
        subjectId: humanSubject.subjectId,
        payload: { consentId: humanConsent.consentId, attemptedStatus: ConsentStatus.ACTIVE },
        now: new Date(FIXED_NOW.getTime() + 2 * 86400_000)
      });
      await assert.rejects(
        () => restartedHumanRepository.commitCommand({
          aggregateType: "subject",
          aggregateId: humanSubject.subjectId,
          idempotencyKey: "human-consent-reverse-0001",
          commandHash: hashId("core_command", { humanConsent: "reverse" }),
          events: [{
            aggregateType: "subject",
            aggregateId: humanSubject.subjectId,
            expectedVersion: 4,
            event: consentReverseEvent
          }],
          writes: [{
            type: CoreProjectionType.CONSENT_RECORD,
            value: {
              ...consentWithoutRevocation,
              status: ConsentStatus.ACTIVE,
              updatedAt: new Date(FIXED_NOW.getTime() + 2 * 86400_000).toISOString()
            },
            eventId: consentReverseEvent.eventId
          }],
          response: { restored: true }
        }),
        (error) => error.code === "projection_invariant_violation"
      );

      const consentMutationEvent = createTestEvent({
        eventType: "consent_scope_mutation_rejected",
        subjectId: humanSubject.subjectId,
        payload: { consentId: humanConsent.consentId },
        now: new Date(FIXED_NOW.getTime() + 3 * 86400_000)
      });
      await assert.rejects(
        () => restartedHumanRepository.commitCommand({
          aggregateType: "subject",
          aggregateId: humanSubject.subjectId,
          idempotencyKey: "human-consent-mutate-scope-0001",
          commandHash: hashId("core_command", { humanConsent: "mutate_scope" }),
          events: [{
            aggregateType: "subject",
            aggregateId: humanSubject.subjectId,
            expectedVersion: 4,
            event: consentMutationEvent
          }],
          writes: [{
            type: CoreProjectionType.CONSENT_RECORD,
            value: { ...revokedConsent, maxRequestedPrincipalMinor: "100001" },
            eventId: consentMutationEvent.eventId
          }],
          response: { mutated: true }
        }),
        (error) => error.code === "projection_identity_conflict"
      );
      assert.equal(
        await restartedHumanRepository.eventRepository.getStreamVersion({
          aggregateType: "subject",
          aggregateId: humanSubject.subjectId
        }),
        4
      );

      const transitionAt = new Date(FIXED_NOW.getTime() + 1000).toISOString();
      const transitionEvent = createTestEvent({
        eventType: "credit_offer_declined",
        subjectId: fixture.subject.subjectId,
        payload: {
          creditIntentId: fixture.creditIntent.creditIntentId,
          creditOfferId: fixture.creditOffer.creditOfferId
        },
        now: new Date(transitionAt)
      });
      const decidedIntent = {
        ...fixture.creditIntent,
        status: CreditIntentStatus.DECIDED,
        updatedAt: transitionAt
      };
      const declinedOffer = {
        ...fixture.creditOffer,
        status: CreditOfferStatus.DECLINED,
        updatedAt: transitionAt
      };
      await repository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "credit-application-accept-0001",
        commandHash: hashId("core_command", { creditApplication: "accept" }),
        events: [{
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId,
          expectedVersion: 2,
          event: transitionEvent
        }],
        writes: [
          { type: CoreProjectionType.CREDIT_INTENT, value: decidedIntent, eventId: transitionEvent.eventId },
          { type: CoreProjectionType.CREDIT_OFFER, value: declinedOffer, eventId: transitionEvent.eventId }
        ],
        response: { accepted: true }
      });
      assert.equal(
        (await repository.getCreditIntent(fixture.creditIntent.creditIntentId)).status,
        CreditIntentStatus.DECIDED
      );
      assert.equal(
        (await repository.getCreditOffer(fixture.creditOffer.creditOfferId)).status,
        CreditOfferStatus.DECLINED
      );

      const invalidTransitionEvent = createTestEvent({
        eventType: "credit_application_transition_rejected",
        subjectId: fixture.subject.subjectId,
        payload: { reason: "terminal_state" },
        now: new Date(FIXED_NOW.getTime() + 2000)
      });
      await assert.rejects(
        () => repository.commitCommand({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId,
          idempotencyKey: "credit-application-reverse-0001",
          commandHash: hashId("core_command", { creditApplication: "reverse" }),
          events: [{
            aggregateType: "subject",
            aggregateId: fixture.subject.subjectId,
            expectedVersion: 3,
            event: invalidTransitionEvent
          }],
          writes: [{
            type: CoreProjectionType.CREDIT_INTENT,
            value: {
              ...decidedIntent,
              status: CreditIntentStatus.SUBMITTED,
              updatedAt: new Date(FIXED_NOW.getTime() + 2000).toISOString()
            },
            eventId: invalidTransitionEvent.eventId
          }],
          response: { accepted: false }
        }),
        (error) => error.code === "projection_invariant_violation"
      );

      const immutableTermsEvent = createTestEvent({
        eventType: "credit_application_terms_rejected",
        subjectId: fixture.subject.subjectId,
        payload: { reason: "immutable_terms" },
        now: new Date(FIXED_NOW.getTime() + 3000)
      });
      await assert.rejects(
        () => repository.commitCommand({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId,
          idempotencyKey: "credit-application-mutate-terms-0001",
          commandHash: hashId("core_command", { creditApplication: "mutate_terms" }),
          events: [{
            aggregateType: "subject",
            aggregateId: fixture.subject.subjectId,
            expectedVersion: 3,
            event: immutableTermsEvent
          }],
          writes: [{
            type: CoreProjectionType.CREDIT_INTENT,
            value: { ...decidedIntent, requestedPrincipalMinor: "250001" },
            eventId: immutableTermsEvent.eventId
          }],
          response: { mutated: true }
        }),
        (error) => error.code === "projection_identity_conflict"
      );
      assert.equal(
        await repository.eventRepository.getStreamVersion({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId
        }),
        3
      );

      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
          "DELETE FROM consent_records WHERE id = $1",
          [humanConsent.consentId]
        )),
        /Consent projections cannot be deleted/
      );

      const reconciliation = new PostgresReconciliationService({
        pool,
        coreRepository: restartedHumanRepository,
        eventRepository: restartedHumanRepository.eventRepository,
        release: "postgres-human-consent-test",
        clock: () => new Date(FIXED_NOW.getTime() + 4 * 86400_000)
      });
      const reconciled = await reconciliation.run({
        initiatedBy: "system:test-human-consent-reconciliation",
        idempotencyKey: "human-consent-reconciliation-clean-0001"
      });
      assert.equal(reconciled.status, "passed", JSON.stringify(await reconciliation.getRun(reconciled.runId)));
      assert.equal(reconciled.discrepancyCount, 0);

      const tenantTwoRepository = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_TWO_CONTEXT
      });
      assert.equal(await tenantTwoRepository.getConsentRecord(humanConsent.consentId), undefined);
      assert.equal(await tenantTwoRepository.getCreditIntent(humanIntent.creditIntentId), undefined);
      assert.equal(await tenantTwoRepository.getCreditOffer(fixture.creditOffer.creditOfferId), undefined);

      const agentConsent = createConsentRecord({
        subjectId: fixture.subject.subjectId,
        principalId: fixture.principal.principalId,
        purposes: [ConsentPurpose.CREDIT_APPLICATION],
        allowedAssetIds: [ASSET.assetId],
        allowedCreditPurposeCodes: ["agent_consent_rejected"],
        allowedRepaymentFrequencies: [RepaymentFrequency.END_OF_TERM],
        maxRequestedPrincipalMinor: "50000",
        maxRequestedTermDays: 30,
        maxInstallmentCount: 1,
        termsRef: "urn:ipo.one:sandbox:consent-terms:agent-rejected",
        termsVersion: "credit_consent_terms.v1",
        dataUsageRef: "urn:ipo.one:sandbox:data-usage:v1",
        dataUsageVersion: "credit_data_usage.v1",
        disclosureRef: "urn:ipo.one:sandbox:human-disclosure:v1",
        validFrom: FIXED_NOW.toISOString(),
        expiresAt: new Date(FIXED_NOW.getTime() + 30 * 86400_000).toISOString(),
        now: FIXED_NOW
      });
      const agentConsentEvent = createTestEvent({
        eventType: "consent_recorded",
        subjectId: fixture.subject.subjectId,
        payload: { consentId: agentConsent.consentId },
        now: new Date(FIXED_NOW.getTime() + 3500)
      });
      await assert.rejects(
        () => repository.commitCommand({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId,
          idempotencyKey: "human-consent-agent-subject-rejected-0001",
          commandHash: hashId("core_command", { humanConsent: "agent_subject_rejected" }),
          events: [{
            aggregateType: "subject",
            aggregateId: fixture.subject.subjectId,
            expectedVersion: 3,
            event: agentConsentEvent
          }],
          writes: [{
            type: CoreProjectionType.CONSENT_RECORD,
            value: agentConsent,
            eventId: agentConsentEvent.eventId
          }],
          response: { created: true }
        }),
        (error) => error.code === "projection_reference_missing"
      );

      const tenantTwoPrincipal = createPrincipal({
        principalType: PrincipalType.HUMAN_SELF,
        jurisdiction: "GB",
        now: FIXED_NOW
      });
      const tenantTwoSubject = {
        ...createSubject({
          subjectType: SubjectType.HUMAN,
          primaryPrincipalId: tenantTwoPrincipal.principalId,
          displayName: "Tenant Two Sandbox Borrower",
          prototypeOnly: true,
          now: FIXED_NOW
        }),
        status: SubjectStatus.ACTIVE
      };
      const tenantTwoEvents = [
        {
          aggregateType: "principal",
          aggregateId: tenantTwoPrincipal.principalId,
          expectedVersion: 0,
          event: createTestEvent({
            eventType: "principal_created",
            payload: { principalId: tenantTwoPrincipal.principalId },
            now: FIXED_NOW
          })
        },
        {
          aggregateType: "subject",
          aggregateId: tenantTwoSubject.subjectId,
          expectedVersion: 0,
          event: createTestEvent({
            eventType: "subject_created",
            subjectId: tenantTwoSubject.subjectId,
            payload: {
              subjectId: tenantTwoSubject.subjectId,
              principalId: tenantTwoPrincipal.principalId
            },
            now: FIXED_NOW
          })
        }
      ];
      await tenantTwoRepository.commitCommand({
        aggregateType: "subject",
        aggregateId: tenantTwoSubject.subjectId,
        idempotencyKey: "credit-application-tenant-two-seed-0001",
        commandHash: hashId("core_command", { creditApplication: "tenant_two_seed" }),
        events: tenantTwoEvents,
        writes: [
          {
            type: CoreProjectionType.PRINCIPAL,
            value: tenantTwoPrincipal,
            eventId: tenantTwoEvents[0].event.eventId
          },
          {
            type: CoreProjectionType.SUBJECT,
            value: tenantTwoSubject,
            eventId: tenantTwoEvents[1].event.eventId
          }
        ],
        response: { subjectId: tenantTwoSubject.subjectId }
      });

      const crossTenantConsent = createConsentRecord({
        subjectId: tenantTwoSubject.subjectId,
        principalId: tenantTwoPrincipal.principalId,
        purposes: [ConsentPurpose.CREDIT_APPLICATION],
        allowedAssetIds: [ASSET.assetId],
        allowedCreditPurposeCodes: ["cross_tenant_rejected"],
        allowedRepaymentFrequencies: [RepaymentFrequency.END_OF_TERM],
        maxRequestedPrincipalMinor: "50000",
        maxRequestedTermDays: 30,
        maxInstallmentCount: 1,
        termsRef: "urn:ipo.one:sandbox:consent-terms:cross-tenant-test",
        termsVersion: "credit_consent_terms.v1",
        dataUsageRef: "urn:ipo.one:sandbox:data-usage:v1",
        dataUsageVersion: "credit_data_usage.v1",
        disclosureRef: "urn:ipo.one:sandbox:human-disclosure:v1",
        validFrom: FIXED_NOW.toISOString(),
        expiresAt: new Date(FIXED_NOW.getTime() + 30 * 86400_000).toISOString(),
        now: FIXED_NOW
      });
      const crossTenantConsentEvent = createTestEvent({
        eventType: "consent_recorded",
        subjectId: fixture.subject.subjectId,
        payload: { consentId: crossTenantConsent.consentId },
        now: new Date(FIXED_NOW.getTime() + 3750)
      });
      await assert.rejects(
        () => repository.commitCommand({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId,
          idempotencyKey: "human-consent-cross-tenant-reference-0001",
          commandHash: hashId("core_command", { humanConsent: "cross_tenant_reference" }),
          events: [{
            aggregateType: "subject",
            aggregateId: fixture.subject.subjectId,
            expectedVersion: 3,
            event: crossTenantConsentEvent
          }],
          writes: [{
            type: CoreProjectionType.CONSENT_RECORD,
            value: crossTenantConsent,
            eventId: crossTenantConsentEvent.eventId
          }],
          response: { created: true }
        }),
        (error) => error.code === "projection_reference_missing"
      );

      const crossTenantIntent = createCreditIntent({
        subjectId: tenantTwoSubject.subjectId,
        principalId: tenantTwoPrincipal.principalId,
        authorityType: CreditAuthorityType.CONSENT,
        authorityRef: "urn:ipo.one:sandbox:consent:cross-tenant-test",
        assetId: ASSET.assetId,
        requestedPrincipalMinor: "50000",
        purposeCode: "cross_tenant_rejected",
        requestedTermDays: 30,
        repaymentFrequency: RepaymentFrequency.END_OF_TERM,
        installmentCount: 1,
        now: FIXED_NOW
      });
      const crossTenantEvent = createTestEvent({
        eventType: "credit_intent_submitted",
        subjectId: fixture.subject.subjectId,
        payload: { creditIntentId: crossTenantIntent.creditIntentId },
        now: new Date(FIXED_NOW.getTime() + 4000)
      });
      await assert.rejects(
        () => repository.commitCommand({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId,
          idempotencyKey: "credit-application-cross-tenant-reference-0001",
          commandHash: hashId("core_command", { creditApplication: "cross_tenant_reference" }),
          events: [{
            aggregateType: "subject",
            aggregateId: fixture.subject.subjectId,
            expectedVersion: 3,
            event: crossTenantEvent
          }],
          writes: [{
            type: CoreProjectionType.CREDIT_INTENT,
            value: crossTenantIntent,
            eventId: crossTenantEvent.eventId
          }],
          response: { created: true }
        }),
        (error) => error.code === "projection_reference_missing"
      );
      assert.equal(
        await repository.eventRepository.getStreamVersion({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId
        }),
        3
      );
    });

    await t.test("synthetic Human identity references require durable Consent and remain auditable", async () => {
      await resetCoreRuntime(pool);
      const repository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      const principal = createPrincipal({
        principalType: PrincipalType.HUMAN_SELF,
        jurisdiction: "US",
        now: FIXED_NOW
      });
      const subject = {
        ...createSubject({
          subjectType: SubjectType.HUMAN,
          primaryPrincipalId: principal.principalId,
          displayName: "Synthetic Identity Reference Borrower",
          prototypeOnly: true,
          now: FIXED_NOW
        }),
        status: SubjectStatus.ACTIVE
      };
      const consent = createConsentRecord({
        subjectId: subject.subjectId,
        principalId: principal.principalId,
        purposes: [
          ConsentPurpose.CREDIT_APPLICATION,
          ConsentPurpose.CREDIT_DECISION,
          ConsentPurpose.IDENTITY_REFERENCE_USE
        ],
        allowedAssetIds: [ASSET.assetId],
        allowedCreditPurposeCodes: ["human_sandbox_credit"],
        allowedRepaymentFrequencies: [RepaymentFrequency.MONTHLY],
        maxRequestedPrincipalMinor: "100000",
        maxRequestedTermDays: 90,
        maxInstallmentCount: 3,
        termsRef: "urn:ipo.one:sandbox:consent-terms:identity-reference:v1",
        termsVersion: "credit_consent_terms.v1",
        dataUsageRef: "urn:ipo.one:sandbox:data-usage:identity-reference:v1",
        dataUsageVersion: "credit_data_usage.v1",
        disclosureRef: "urn:ipo.one:sandbox:human-disclosure:identity-reference:v1",
        validFrom: FIXED_NOW.toISOString(),
        expiresAt: new Date(FIXED_NOW.getTime() + 90 * 86400_000).toISOString(),
        now: FIXED_NOW
      });
      const identityReference = createHumanIdentityReference({
        subjectId: subject.subjectId,
        principalId: principal.principalId,
        consent,
        referenceType: HumanIdentityReferenceType.VERIFIABLE_CREDENTIAL_REFERENCE,
        providerRef: "urn:ipo.one:mock:identity-provider:postgres:v1",
        providerVersion: "mock_identity_provider.v1",
        referenceRef: "urn:ipo.one:mock:identity-evidence:postgres-human:v1",
        assuranceLevel: HumanIdentityAssurance.SYNTHETIC_PROVIDER_ASSERTED,
        purposeCodes: [ConsentPurpose.IDENTITY_REFERENCE_USE, ConsentPurpose.CREDIT_DECISION],
        validFrom: FIXED_NOW.toISOString(),
        expiresAt: new Date(FIXED_NOW.getTime() + 60 * 86400_000).toISOString(),
        now: FIXED_NOW
      });
      const events = [
        {
          aggregateType: "principal",
          aggregateId: principal.principalId,
          expectedVersion: 0,
          event: createTestEvent({
            eventType: CreditEventType.PRINCIPAL_CREATED,
            payload: { principalId: principal.principalId },
            now: FIXED_NOW
          })
        },
        {
          aggregateType: "subject",
          aggregateId: subject.subjectId,
          expectedVersion: 0,
          event: createTestEvent({
            eventType: CreditEventType.SUBJECT_CREATED,
            subjectId: subject.subjectId,
            payload: { subjectId: subject.subjectId, principalId: principal.principalId },
            now: FIXED_NOW
          })
        },
        {
          aggregateType: "subject",
          aggregateId: subject.subjectId,
          expectedVersion: 1,
          event: createTestEvent({
            eventType: CreditEventType.CONSENT_RECORDED,
            subjectId: subject.subjectId,
            payload: { consentId: consent.consentId },
            now: FIXED_NOW
          })
        },
        {
          aggregateType: "subject",
          aggregateId: subject.subjectId,
          expectedVersion: 2,
          event: createTestEvent({
            eventType: CreditEventType.IDENTITY_REFERENCE_RECORDED,
            subjectId: subject.subjectId,
            payload: { identityReferenceId: identityReference.identityReferenceId },
            now: FIXED_NOW
          })
        }
      ];
      await repository.commitCommand({
        aggregateType: "subject",
        aggregateId: subject.subjectId,
        idempotencyKey: "human-identity-reference-seed-0001",
        commandHash: hashId("core_command", { humanIdentityReference: "seed" }),
        events,
        writes: [
          { type: CoreProjectionType.PRINCIPAL, value: principal, eventId: events[0].event.eventId },
          { type: CoreProjectionType.SUBJECT, value: subject, eventId: events[1].event.eventId },
          { type: CoreProjectionType.CONSENT_RECORD, value: consent, eventId: events[2].event.eventId },
          {
            type: CoreProjectionType.HUMAN_IDENTITY_REFERENCE,
            value: identityReference,
            eventId: events[3].event.eventId
          }
        ],
        response: {
          consentId: consent.consentId,
          identityReferenceId: identityReference.identityReferenceId
        }
      });

      const restartedRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      assert.deepEqual(
        await restartedRepository.getHumanIdentityReference(identityReference.identityReferenceId),
        identityReference
      );
      assert.equal(
        (await restartedRepository.verifyProjection(
          CoreProjectionType.HUMAN_IDENTITY_REFERENCE,
          identityReference.identityReferenceId
        )).matches,
        true
      );
      assert.equal(
        await new PostgresCoreRepository({ pool, tenantContext: TENANT_TWO_CONTEXT })
          .getHumanIdentityReference(identityReference.identityReferenceId),
        undefined
      );

      const revokedAt = new Date(FIXED_NOW.getTime() + 86400_000);
      const revokedReference = revokeHumanIdentityReference(identityReference, {
        reasonCode: "provider_withdrawal",
        evidenceRef: "urn:ipo.one:evidence:identity-reference-revocation:postgres-test",
        now: revokedAt
      });
      const revokedEvent = createTestEvent({
        eventType: CreditEventType.IDENTITY_REFERENCE_STATUS_CHANGED,
        subjectId: subject.subjectId,
        payload: {
          identityReferenceId: identityReference.identityReferenceId,
          fromStatus: HumanIdentityReferenceStatus.ACTIVE,
          toStatus: HumanIdentityReferenceStatus.REVOKED,
          reasonCode: revokedReference.revocationReasonCode
        },
        now: revokedAt
      });
      await restartedRepository.commitCommand({
        aggregateType: "subject",
        aggregateId: subject.subjectId,
        idempotencyKey: "human-identity-reference-revoke-0001",
        commandHash: hashId("core_command", { humanIdentityReference: "revoke" }),
        events: [{
          aggregateType: "subject",
          aggregateId: subject.subjectId,
          expectedVersion: 3,
          event: revokedEvent
        }],
        writes: [{
          type: CoreProjectionType.HUMAN_IDENTITY_REFERENCE,
          value: revokedReference,
          eventId: revokedEvent.eventId
        }],
        response: {
          identityReferenceId: identityReference.identityReferenceId,
          status: HumanIdentityReferenceStatus.REVOKED
        }
      });
      assert.deepEqual(
        await restartedRepository.getHumanIdentityReference(identityReference.identityReferenceId),
        revokedReference
      );
      assert.deepEqual(await restartedRepository.getConsentRecord(consent.consentId), consent);

      const mutationEvent = createTestEvent({
        eventType: "identity_reference_mutation_rejected",
        subjectId: subject.subjectId,
        payload: { identityReferenceId: identityReference.identityReferenceId },
        now: new Date(FIXED_NOW.getTime() + 2 * 86400_000)
      });
      await assert.rejects(
        () => restartedRepository.commitCommand({
          aggregateType: "subject",
          aggregateId: subject.subjectId,
          idempotencyKey: "human-identity-reference-mutate-0001",
          commandHash: hashId("core_command", { humanIdentityReference: "mutate" }),
          events: [{
            aggregateType: "subject",
            aggregateId: subject.subjectId,
            expectedVersion: 4,
            event: mutationEvent
          }],
          writes: [{
            type: CoreProjectionType.HUMAN_IDENTITY_REFERENCE,
            value: { ...revokedReference, providerRef: "urn:ipo.one:mock:other-provider:v1" },
            eventId: mutationEvent.eventId
          }],
          response: { mutated: true }
        }),
        (error) => error.code === "projection_identity_conflict"
      );

      const {
        revokedAt: _revokedAt,
        revocationReasonCode: _revocationReasonCode,
        revocationEvidenceRef: _revocationEvidenceRef,
        ...referenceWithoutRevocation
      } = revokedReference;
      const reverseEvent = createTestEvent({
        eventType: "identity_reference_transition_rejected",
        subjectId: subject.subjectId,
        payload: { identityReferenceId: identityReference.identityReferenceId },
        now: new Date(FIXED_NOW.getTime() + 3 * 86400_000)
      });
      await assert.rejects(
        () => restartedRepository.commitCommand({
          aggregateType: "subject",
          aggregateId: subject.subjectId,
          idempotencyKey: "human-identity-reference-reverse-0001",
          commandHash: hashId("core_command", { humanIdentityReference: "reverse" }),
          events: [{
            aggregateType: "subject",
            aggregateId: subject.subjectId,
            expectedVersion: 4,
            event: reverseEvent
          }],
          writes: [{
            type: CoreProjectionType.HUMAN_IDENTITY_REFERENCE,
            value: {
              ...referenceWithoutRevocation,
              status: HumanIdentityReferenceStatus.ACTIVE,
              updatedAt: new Date(FIXED_NOW.getTime() + 3 * 86400_000).toISOString()
            },
            eventId: reverseEvent.eventId
          }],
          response: { restored: true }
        }),
        (error) => error.code === "projection_invariant_violation"
      );
      assert.equal(
        await restartedRepository.eventRepository.getStreamVersion({
          aggregateType: "subject",
          aggregateId: subject.subjectId
        }),
        4
      );
      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
          "DELETE FROM human_identity_references WHERE id = $1",
          [identityReference.identityReferenceId]
        )),
        /Human identity-reference projections cannot be deleted/
      );

      const reconciliation = new PostgresReconciliationService({
        pool,
        coreRepository: restartedRepository,
        eventRepository: restartedRepository.eventRepository,
        release: "postgres-human-identity-reference-test",
        clock: () => new Date(FIXED_NOW.getTime() + 4 * 86400_000)
      });
      const reconciled = await reconciliation.run({
        initiatedBy: "system:test-human-identity-reference-reconciliation",
        idempotencyKey: "human-identity-reference-reconciliation-clean-0001"
      });
      assert.equal(reconciled.status, "passed", JSON.stringify(await reconciliation.getRun(reconciled.runId)));
      assert.equal(reconciled.discrepancyCount, 0);
    });

    await t.test("core stream races produce one projection winner", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const repository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      await repository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "core-race-seed",
        commandHash: hashId("core_command", { race: "seed" }),
        events: fixture.events,
        writes: fixture.writes,
        response: { status: fixture.subject.status }
      });

      const attempts = [SubjectStatus.SUSPENDED, SubjectStatus.CLOSED].map((status) => {
        const nextSubject = {
          ...fixture.subject,
          status,
          updatedAt: new Date(FIXED_NOW.getTime() + 1000).toISOString()
        };
        const event = createTestEvent({
          eventType: "subject_status_changed",
          subjectId: fixture.subject.subjectId,
          payload: { subjectId: fixture.subject.subjectId, newStatus: status },
          now: new Date(FIXED_NOW.getTime() + 1000)
        });
        return repository.commitCommand({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId,
          idempotencyKey: `core-race-${status}`,
          commandHash: hashId("core_command", { race: status }),
          events: [
            {
              aggregateType: "subject",
              aggregateId: fixture.subject.subjectId,
              expectedVersion: 2,
              event
            }
          ],
          writes: [{ type: CoreProjectionType.SUBJECT, value: nextSubject, eventId: event.eventId }],
          response: { status }
        });
      });
      const results = await Promise.allSettled(attempts);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.find((result) => result.status === "rejected");
      assert.equal(rejected.reason.code, "stale_aggregate_version");
      const stored = await repository.getSubject(fixture.subject.subjectId);
      const winner = results.find((result) => result.status === "fulfilled").value.response.status;
      assert.equal(stored.status, winner);
      assert.equal(
        await repository.eventRepository.getStreamVersion({
          aggregateType: "subject",
          aggregateId: fixture.subject.subjectId
        }),
        3
      );
    });

    await t.test("durable dual control survives restart and executes one atomic mutation", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const initialRepository = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      await initialRepository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "approval-core-fixture-0001",
        commandHash: hashId("core_command", { approval: "fixture" }),
        events: fixture.events,
        writes: fixture.writes,
        response: { creditLineId: fixture.creditLine.creditLineId }
      });

      const state = createDurableApprovalHarness(
        initialRepository,
        fixture.creditLine.creditLineId
      );
      await Promise.all([
        seedApprovalIdentity(pool, state.commandActor),
        seedApprovalIdentity(pool, state.riskApprover),
        seedApprovalIdentity(pool, state.operationsApprover)
      ]);
      const preparation = await state.harness.service.prepareApproval(state.commandRequest);
      const proposed = await state.approvalService.propose({
        approvalPreparation: preparation,
        authenticationContext: state.commandActor.authenticationContext,
        idempotencyKey: "postgres-approval-proposal-0001",
        expiresAt: new Date(AUTHORIZATION_FIXED_NOW.getTime() + 30 * 60_000),
        now: AUTHORIZATION_FIXED_NOW
      });
      const riskApproved = await state.approvalService.decide({
        approvalProposalId: proposed.proposal.approvalProposalId,
        expectedVersion: proposed.proposal.version,
        decision: ApprovalDecisionValue.APPROVE,
        reasonCode: "approval_confirmed",
        authenticationContext: state.riskApprover.authenticationContext,
        idempotencyKey: "postgres-approval-risk-decision-0001",
        now: AUTHORIZATION_FIXED_NOW
      });
      const fullyApproved = await state.approvalService.decide({
        approvalProposalId: proposed.proposal.approvalProposalId,
        expectedVersion: riskApproved.proposal.version,
        decision: ApprovalDecisionValue.APPROVE,
        reasonCode: "approval_confirmed",
        authenticationContext: state.operationsApprover.authenticationContext,
        idempotencyKey: "postgres-approval-operations-decision-0001",
        now: AUTHORIZATION_FIXED_NOW
      });
      assert.equal(fullyApproved.proposal.status, ApprovalProposalStatus.APPROVED);

      const restartedRepository = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      state.restart(restartedRepository);
      assert.equal(
        (await restartedRepository.getApprovalProposal(proposed.proposal.approvalProposalId)).status,
        ApprovalProposalStatus.APPROVED
      );
      assert.equal(
        (await restartedRepository.listApprovalDecisions(proposed.proposal.approvalProposalId)).length,
        2
      );

      const approvalArtifact = {
        proposalId: fullyApproved.proposal.approvalProposalId,
        proposalVersion: fullyApproved.proposal.version
      };
      const authorizeAndRevalidate = async (requestSuffix) => {
        const decision = await state.harness.service.authorize({
          ...state.commandRequest,
          requestId: `request_postgres_approval_${requestSuffix}`,
          correlationId: `correlation_postgres_approval_${requestSuffix}`,
          approvalArtifact
        });
        return state.harness.service.revalidate({
          decision,
          authenticationContext: state.commandActor.authenticationContext,
          now: new Date(AUTHORIZATION_FIXED_NOW.getTime() + 1_000)
        });
      };
      const [leftDecision, rightDecision] = await Promise.all([
        authorizeAndRevalidate("left"),
        authorizeAndRevalidate("right")
      ]);
      assert.notEqual(leftDecision.decisionId, rightDecision.decisionId);

      const executionTime = new Date(AUTHORIZATION_FIXED_NOW.getTime() + 2_000);
      const buildMutation = () => {
        const event = createCreditEvent({
          eventType: "credit_limit_increased",
          subjectId: fixture.subject.subjectId,
          payload: {
            creditLineId: fixture.creditLine.creditLineId,
            previousLimitMinor: fixture.creditLine.limitMinor,
            limitMinor: "150000",
            actorId: state.commandActor.authenticationContext.actorId
          },
          now: executionTime
        });
        return {
          events: [{
            aggregateType: "credit_line",
            aggregateId: fixture.creditLine.creditLineId,
            expectedVersion: 0,
            event
          }],
          writes: [{
            type: CoreProjectionType.CREDIT_LINE,
            value: {
              ...fixture.creditLine,
              limitMinor: "150000",
              updatedAt: executionTime.toISOString()
            },
            eventId: event.eventId
          }],
          response: {
            creditLineId: fixture.creditLine.creditLineId,
            previousLimitMinor: fixture.creditLine.limitMinor,
            limitMinor: "150000"
          }
        };
      };
      const executionKey = state.commandRequest.idempotencyKey;
      const executionAttempts = await Promise.allSettled([
        state.approvalService.executeApprovedCommand({
          authorizationDecision: leftDecision,
          idempotencyKey: executionKey,
          buildApprovedMutation: buildMutation,
          now: executionTime
        }),
        state.approvalService.executeApprovedCommand({
          authorizationDecision: rightDecision,
          idempotencyKey: executionKey,
          buildApprovedMutation: buildMutation,
          now: executionTime
        })
      ]);
      assert.equal(executionAttempts.every(({ status }) => status === "fulfilled"), true);
      const executionResults = executionAttempts.map(({ value }) => value);
      assert.equal(executionResults.filter(({ replayed }) => replayed).length, 1);
      assert.equal(executionResults.filter(({ replayed }) => !replayed).length, 1);
      assert.equal(
        new Set(executionResults.map(({ approvalExecution }) =>
          approvalExecution.approvalExecutionId
        )).size,
        1
      );
      const winner = executionResults.find(({ replayed }) => !replayed);
      assert.equal(winner.result.limitMinor, "150000");

      const finalRepository = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      state.restart(finalRepository);
      const retry = await state.approvalService.executeApprovedCommand({
        authorizationDecision: rightDecision,
        idempotencyKey: executionKey,
        buildApprovedMutation() {
          throw new Error("an idempotent retry must not rebuild the mutation");
        },
        now: new Date(AUTHORIZATION_FIXED_NOW.getTime() + 3_000)
      });
      assert.equal(retry.replayed, true);
      assert.equal(
        retry.approvalExecution.approvalExecutionId,
        winner.approvalExecution.approvalExecutionId
      );
      assert.equal(
        (await finalRepository.getCreditLine(fixture.creditLine.creditLineId)).limitMinor,
        "150000"
      );
      const executedProposal = await finalRepository.getApprovalProposal(
        proposed.proposal.approvalProposalId
      );
      assert.equal(executedProposal.status, ApprovalProposalStatus.EXECUTED);
      assert.equal(executedProposal.version, fullyApproved.proposal.version + 1);
      assert.equal(
        (await finalRepository.getApprovalExecutionByProposal(executedProposal.approvalProposalId))
          .approvalExecutionId,
        executedProposal.executionId
      );

      const approvalReaderRole = "ipo_one_approval_reader_test";
      if ((await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [approvalReaderRole])).rowCount > 0) {
        await pool.query(`DROP OWNED BY ${approvalReaderRole}`);
        await pool.query(`DROP ROLE ${approvalReaderRole}`);
      }
      await pool.query(
        `CREATE ROLE ${approvalReaderRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
      );
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${approvalReaderRole}`);
      await pool.query(`GRANT SELECT ON approval_proposals TO ${approvalReaderRole}`);
      const readProposalAs = async (context) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(`SET LOCAL ROLE ${approvalReaderRole}`);
          await setTenantTransactionContext(client, context);
          const result = await client.query(
            "SELECT id FROM approval_proposals WHERE id = $1",
            [executedProposal.approvalProposalId]
          );
          await client.query("COMMIT");
          return result.rows;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      };
      try {
        assert.equal((await readProposalAs(TENANT_CONTEXT)).length, 1);
        assert.equal((await readProposalAs(TENANT_TWO_CONTEXT)).length, 0);
      } finally {
        await pool.query(`DROP OWNED BY ${approvalReaderRole}`);
        await pool.query(`DROP ROLE ${approvalReaderRole}`);
      }

      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
          "UPDATE approval_decisions SET reason_code = 'tampered' WHERE proposal_id = $1",
          [executedProposal.approvalProposalId]
        )),
        /append-only rows cannot be updated or deleted/
      );
      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
          "DELETE FROM approval_proposals WHERE id = $1",
          [executedProposal.approvalProposalId]
        )),
        /append-only rows cannot be updated or deleted/
      );

      const reconciliation = new PostgresReconciliationService({
        pool,
        coreRepository: finalRepository,
        eventRepository: finalRepository.eventRepository,
        release: "postgres-approval-test",
        clock: () => new Date(AUTHORIZATION_FIXED_NOW.getTime() + 4_000)
      });
      const reconciled = await reconciliation.run({
        initiatedBy: "system:test-approval-reconciliation",
        idempotencyKey: "approval-reconciliation-clean-0001"
      });
      assert.equal(reconciled.status, "passed", JSON.stringify(await reconciliation.getRun(reconciled.runId)));
      assert.equal(reconciled.discrepancyCount, 0);
    });

    await t.test("durable break glass remains protective, bounded, restart-safe, and reviewable", async () => {
      await resetCoreRuntime(pool);
      const initialRepository = new PostgresCoreRepository({
        pool,
        tenantContext: TENANT_CONTEXT
      });
      const state = createDurableBreakGlassHarness(initialRepository);
      await Promise.all([
        seedApprovalIdentity(pool, state.requester),
        seedApprovalIdentity(pool, state.riskCustodian),
        seedApprovalIdentity(pool, state.operationsCustodian),
        seedApprovalIdentity(pool, state.reviewOwner)
      ]);
      const declared = await state.service.declareIncident({
        authenticationContext: state.requester.authenticationContext,
        reasonCode: "security_incident",
        allowedActions: ["risk.freeze", "provider.pause"],
        resourceScopes: [{ resourceType: "subject", resourceId: "subject_break_glass_test" }],
        idempotencyKey: "postgres-break-glass-declare-0001",
        now: AUTHORIZATION_FIXED_NOW
      });
      assert.equal(declared.incident.status, BreakGlassIncidentStatus.PENDING_CUSTODIANS);

      const firstRestart = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      state.restart(firstRestart);
      assert.equal(
        (await firstRestart.getBreakGlassIncident(declared.incident.breakGlassIncidentId)).version,
        1
      );
      const firstConfirmation = await state.service.confirmCustodian({
        breakGlassIncidentId: declared.incident.breakGlassIncidentId,
        expectedVersion: 1,
        authenticationContext: state.riskCustodian.authenticationContext,
        hardwareKeyRefHash: state.harness.referenceHasher.hash(
          "break_glass.hardware_key",
          "postgres-risk-custodian-key"
        ),
        idempotencyKey: "postgres-break-glass-risk-confirm-0001",
        now: new Date(AUTHORIZATION_FIXED_NOW.getTime() + 1_000)
      });
      assert.equal(firstConfirmation.incident.status, BreakGlassIncidentStatus.PENDING_CUSTODIANS);

      const secondRestart = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      state.restart(secondRestart);
      const activated = await state.service.confirmCustodian({
        breakGlassIncidentId: declared.incident.breakGlassIncidentId,
        expectedVersion: firstConfirmation.incident.version,
        authenticationContext: state.operationsCustodian.authenticationContext,
        hardwareKeyRefHash: state.harness.referenceHasher.hash(
          "break_glass.hardware_key",
          "postgres-operations-custodian-key"
        ),
        idempotencyKey: "postgres-break-glass-operations-confirm-0001",
        now: new Date(AUTHORIZATION_FIXED_NOW.getTime() + 2_000)
      });
      assert.equal(activated.incident.status, BreakGlassIncidentStatus.ACTIVE);
      assert.equal(activated.custodianDecisions.length, 2);

      const protectiveAuthorization = await state.service.assertProtectiveScope({
        breakGlassIncidentId: declared.incident.breakGlassIncidentId,
        action: "risk.freeze",
        resourceType: "subject",
        resourceId: "subject_break_glass_test",
        authenticationContext: state.requester.authenticationContext,
        now: new Date(AUTHORIZATION_FIXED_NOW.getTime() + 2_500)
      });
      assert.equal(
        (await state.service.revalidateProtectiveAuthorization({
          breakGlassAuthorization: protectiveAuthorization,
          authenticationContext: state.requester.authenticationContext,
          now: new Date(AUTHORIZATION_FIXED_NOW.getTime() + 2_500)
        })).authorizationDecision,
        "protective_only"
      );
      await assert.rejects(
        () => state.service.assertProtectiveScope({
          breakGlassIncidentId: declared.incident.breakGlassIncidentId,
          action: "risk.unfreeze",
          resourceType: "subject",
          resourceId: "subject_break_glass_test",
          authenticationContext: state.requester.authenticationContext,
          now: new Date(AUTHORIZATION_FIXED_NOW.getTime() + 2_500)
        }),
        (error) => error.code === "break_glass_scope_rejected"
      );

      const closed = await state.service.close({
        breakGlassIncidentId: declared.incident.breakGlassIncidentId,
        expectedVersion: activated.incident.version,
        authenticationContext: state.requester.authenticationContext,
        idempotencyKey: "postgres-break-glass-close-0001",
        now: new Date(AUTHORIZATION_FIXED_NOW.getTime() + 3_000)
      });
      assert.equal(closed.incident.status, BreakGlassIncidentStatus.CLOSED);
      assert.equal(closed.incident.reviewStatus, BreakGlassReviewStatus.PENDING);

      const finalRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      state.restart(finalRepository);
      await assert.rejects(
        () => withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
          "DELETE FROM break_glass_incidents WHERE id = $1",
          [declared.incident.breakGlassIncidentId]
        )),
        /append-only rows cannot be updated or deleted/
      );
      const reviewed = await state.service.review({
        breakGlassIncidentId: declared.incident.breakGlassIncidentId,
        expectedVersion: closed.incident.version,
        authenticationContext: state.reviewOwner.authenticationContext,
        findingsRefHash: state.harness.referenceHasher.hash(
          "break_glass.review",
          "postgres-break-glass-review-findings"
        ),
        idempotencyKey: "postgres-break-glass-review-0001",
        now: new Date(AUTHORIZATION_FIXED_NOW.getTime() + 4_000)
      });
      assert.equal(reviewed.incident.reviewStatus, BreakGlassReviewStatus.COMPLETED);
      assert.equal(
        (await finalRepository.getBreakGlassReview(declared.incident.breakGlassIncidentId))
          .breakGlassReviewId,
        reviewed.review.breakGlassReviewId
      );

      const reconciliation = new PostgresReconciliationService({
        pool,
        coreRepository: finalRepository,
        eventRepository: finalRepository.eventRepository,
        release: "postgres-break-glass-test",
        clock: () => new Date(AUTHORIZATION_FIXED_NOW.getTime() + 5_000)
      });
      const reconciled = await reconciliation.run({
        initiatedBy: "system:test-break-glass-reconciliation",
        idempotencyKey: "break-glass-reconciliation-clean-0001"
      });
      assert.equal(reconciled.status, "passed", JSON.stringify(await reconciliation.getRun(reconciled.runId)));
      assert.equal(reconciled.discrepancyCount, 0);
    });

    await t.test("reconciliation detects drift and approval-gated repair restores a clean state", async () => {
      await resetCoreRuntime(pool);
      const fixture = buildCoreFixture();
      const coreRepository = new PostgresCoreRepository({ pool, tenantContext: TENANT_CONTEXT });
      await coreRepository.commitCommand({
        aggregateType: "subject",
        aggregateId: fixture.subject.subjectId,
        idempotencyKey: "reconciliation-fixture-1",
        commandHash: hashId("core_command", { reconciliation: "fixture" }),
        events: fixture.events,
        writes: fixture.writes,
        response: { subjectId: fixture.subject.subjectId }
      });
      const reconciliation = new PostgresReconciliationService({
        pool,
        coreRepository,
        eventRepository: coreRepository.eventRepository,
        release: "postgres-test",
        clock: (() => {
          let tick = 0;
          return () => new Date(FIXED_NOW.getTime() + 10_000 + tick++ * 1000);
        })()
      });

      const clean = await reconciliation.run({
        initiatedBy: "system:test-reconciliation",
        idempotencyKey: "reconciliation-clean-1"
      });
      assert.equal(clean.status, "passed", JSON.stringify(await reconciliation.getRun(clean.runId)));
      assert.equal(clean.discrepancyCount, 0);
      const cleanReplay = await reconciliation.run({
        initiatedBy: "system:test-reconciliation",
        idempotencyKey: "reconciliation-clean-1"
      });
      assert.equal(cleanReplay.replayed, true);
      assert.equal(cleanReplay.runId, clean.runId);
      const cleanRun = await reconciliation.getRun(clean.runId);
      assert.equal(cleanRun.discrepancies.length, 0);
      assert.ok(cleanRun.evidenceEventId);

      await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
        `UPDATE obligations
            SET outstanding_minor = 9000,
                repaid_amount_minor = 1000,
                updated_at = clock_timestamp()
          WHERE id = $1`,
        [fixture.obligation.obligationId]
      ));
      const drifted = await reconciliation.run({ initiatedBy: "system:test-reconciliation" });
      assert.equal(drifted.status, "failed");
      assert.ok(drifted.criticalCount >= 2);
      const driftedRun = await reconciliation.getRun(drifted.runId);
      const codes = new Set(driftedRun.discrepancies.map((item) => item.checkCode));
      assert.equal(codes.has("projection_hash_mismatch"), true);
      assert.equal(codes.has("obligation_repayment_mismatch"), true);
      assert.equal(codes.has("credit_exposure_mismatch"), true);
      assert.equal(driftedRun.discrepancies.every((item) => item.evidenceEventId), true);

      const plan = await reconciliation.planProjectionReplay({
        entityType: CoreProjectionType.OBLIGATION,
        entityId: fixture.obligation.obligationId,
        requestedBy: "operator:test",
        reason: "restore the verified obligation projection"
      });
      assert.equal(plan.wouldRepair, true);
      assert.equal(plan.snapshotAvailable, true);

      const repaired = await reconciliation.repairProjection({
        entityType: CoreProjectionType.OBLIGATION,
        entityId: fixture.obligation.obligationId,
        approvedBy: "operator:test",
        reason: "restore the verified obligation projection",
        idempotencyKey: "projection-repair-obligation-1"
      });
      assert.equal(repaired.status, "completed");
      assert.ok(repaired.repairEventId);
      const repairReplay = await reconciliation.repairProjection({
        entityType: CoreProjectionType.OBLIGATION,
        entityId: fixture.obligation.obligationId,
        approvedBy: "operator:test",
        reason: "restore the verified obligation projection",
        idempotencyKey: "projection-repair-obligation-1"
      });
      assert.deepEqual(repairReplay, repaired);

      const restored = await coreRepository.getObligation(fixture.obligation.obligationId);
      assert.equal(restored.outstandingPrincipalMinor, fixture.obligation.outstandingPrincipalMinor);
      assert.equal(restored.repaidAmountMinor, fixture.obligation.repaidAmountMinor);
      assert.equal(
        (await coreRepository.verifyProjection(CoreProjectionType.OBLIGATION, fixture.obligation.obligationId)).matches,
        true
      );
      const finalRun = await reconciliation.run({ initiatedBy: "system:test-reconciliation" });
      assert.equal(finalRun.status, "passed");
      assert.equal(finalRun.discrepancyCount, 0);
    });

    await t.test("live testnet observations persist, isolate, outbox, and reconcile without raw RPC state", async () => {
      const appRole = "ipo_one_live_chain_test";
      const dropAppRole = async () => {
        const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole]);
        if (exists.rowCount === 0) return;
        await pool.query(`DROP OWNED BY ${appRole}`);
        await pool.query(`DROP ROLE ${appRole}`);
      };
      await dropAppRole();
      const appRolePassword = randomBytes(24).toString("base64url");
      const quotedPassword = (
        await pool.query("SELECT quote_literal($1) AS value", [appRolePassword])
      ).rows[0].value;
      await pool.query(
        `CREATE ROLE ${appRole} LOGIN PASSWORD ${quotedPassword} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
      );
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
      await pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON
           live_chain_observations, live_chain_indexer_snapshots,
           live_chain_outbox_messages
         TO ${appRole}`
      );
      const appConnection = new URL(CONNECTION_STRING);
      appConnection.username = appRole;
      appConnection.password = appRolePassword;
      const appPool = createPostgresPool({
        connectionString: appConnection.toString(),
        max: 4,
        applicationName: "ipo-one-live-chain-test"
      });
      const adapter = new SandboxChainAdapter({ profile: BASE_SEPOLIA_PROFILE });
      const observation = {
        chainId: BASE_SEPOLIA_PROFILE.chainId,
        transactionHash: hashId("pg_live_chain_tx", "one"),
        eventOrdinal: 0,
        blockNumber: "44240000",
        blockHash: hashId("pg_live_chain_block", "44240000"),
        obligationId: "obligation_pg_live_chain_001",
        paymentId: "payment_pg_live_chain_001",
        assetId: "urn:ipo-one:sandbox-asset:usd-cent",
        amountMinor: "100",
        observationStatus: "included",
        confirmations: 1,
        observedAt: "2026-07-16T04:00:00.000Z"
      };
      const proof = adapter.normalizeObservation(observation);
      const live = {
        observation,
        proof,
        evidence: adapter.createPaymentEvidence(proof),
        eventBinding: {
          evidenceHash: hashId("pg_live_source_evidence", "one"),
          obligationHash: hashId("testnet_obligation_reference", { obligationId: observation.obligationId }),
          paymentHash: hashId("testnet_payment_reference", { paymentId: observation.paymentId }),
          runIdHash: hashId("testnet_run_id", { runId: "pg-live-chain-run-0001" }),
          sequence: 1
        },
        providerSlot: "primary",
        networkCallsMade: 4,
        readOnly: true,
        liveTestnetObservation: true,
        productionFundsMoved: false,
        rawProviderPayloadPersisted: false,
        schemaVersion: "live_testnet_evidence_observation.v1"
      };
      try {
        await assertTenantDatabaseRole(appPool);
        const store = new PostgresChainObservationStore({
          pool: appPool,
          tenantContext: TENANT_CONTEXT,
          clock: () => new Date("2026-07-16T04:00:01.000Z")
        });
        const indexer = new LiveChainIndexer({ profile: BASE_SEPOLIA_PROFILE, store });
        const first = await indexer.ingest(live);
        const duplicate = await indexer.ingest(live);
        assert.equal(first.persisted.replayed, false);
        assert.equal(duplicate.persisted.replayed, true);
        assert.equal((await store.listPendingOutbox(BASE_SEPOLIA_PROFILE.chainId)).length, 1);
        const reconciliation = await store.reconcile({
          chainId: BASE_SEPOLIA_PROFILE.chainId,
          adapter
        });
        assert.equal(reconciliation.consistent, true);
        assert.equal(reconciliation.observationCount, 1);

        const otherTenantStore = new PostgresChainObservationStore({
          pool: appPool,
          tenantContext: TENANT_TWO_CONTEXT,
          clock: () => new Date("2026-07-16T04:00:02.000Z")
        });
        assert.deepEqual(await otherTenantStore.listReplayInputs(BASE_SEPOLIA_PROFILE.chainId), []);
        const durable = await withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
          "SELECT observation_input, finality_proof, evidence_envelope FROM live_chain_observations"
        ));
        assert.equal(durable.rowCount, 1);
        assert.equal(JSON.stringify(durable.rows).includes("rpcUrl"), false);
        assert.equal(JSON.stringify(durable.rows).includes("sepolia.base.org"), false);
        await assert.rejects(
          () => withTenantTransaction(pool, TENANT_CONTEXT, (client) => client.query(
            "UPDATE live_chain_observations SET finality_proof = '{}'::jsonb"
          )),
          /append-only|immutable/
        );
      } finally {
        await appPool.end();
        await dropAppRole();
      }
    });

    await t.test("credit Registry observations persist, isolate, deduplicate, and reconcile without raw account state", async () => {
      const appRole = "ipo_one_credit_registry_test";
      const dropAppRole = async () => {
        const exists = await pool.query(
          "SELECT 1 FROM pg_roles WHERE rolname = $1",
          [appRole]
        );
        if (exists.rowCount === 0) return;
        await pool.query(`DROP OWNED BY ${appRole}`);
        await pool.query(`DROP ROLE ${appRole}`);
      };
      await dropAppRole();
      const appRolePassword = randomBytes(24).toString("base64url");
      const quotedPassword = (
        await pool.query("SELECT quote_literal($1) AS value", [appRolePassword])
      ).rows[0].value;
      await pool.query(
        `CREATE ROLE ${appRole} LOGIN PASSWORD ${quotedPassword}
         NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
         NOBYPASSRLS`
      );
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
      await pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON
           credit_registry_chain_observations,
           credit_registry_chain_outbox_messages
         TO ${appRole}`
      );
      await pool.query(
        `GRANT SELECT, INSERT ON authorization_resources TO ${appRole};
         GRANT SELECT ON access_grants TO ${appRole}`
      );
      const appConnection = new URL(CONNECTION_STRING);
      appConnection.username = appRole;
      appConnection.password = appRolePassword;
      const appPool = createPostgresPool({
        connectionString: appConnection.toString(),
        max: 4,
        applicationName: "ipo-one-credit-registry-test"
      });
      const observation = creditRegistryObservationFixture();
      try {
        await assertTenantDatabaseRole(appPool);
        const store = new PostgresCreditRegistryObservationStore({
          pool: appPool,
          tenantContext: TENANT_CONTEXT,
          clock: () => new Date("2026-07-28T12:01:00.000Z")
        });
        const first = await store.append(observation);
        const replay = await store.append(observation);
        assert.equal(first.replayed, false);
        assert.equal(replay.replayed, true);
        assert.equal((await store.listPendingOutbox()).length, 1);
        const restored = await store.readLatest(
          observation.authorizationHash
        );
        assert.deepEqual(restored, observation);
        const resource = await withTenantTransaction(
          pool,
          TENANT_CONTEXT,
          (client) => client.query(
            `SELECT status, version, schema_version
               FROM authorization_resources
              WHERE resource_type = 'credit_registry_evidence'
                AND resource_id = $1`,
            [observation.authorizationHash]
          )
        );
        assert.deepEqual(resource.rows, [{
          status: "active",
          version: "1",
          schema_version: "authorization_resource.v1"
        }]);
        const result = await store.reconcile(observation.authorizationHash);
        assert.equal(result.consistent, true);
        assert.deepEqual(result.differences, []);

        const otherTenantStore = new PostgresCreditRegistryObservationStore({
          pool: appPool,
          tenantContext: TENANT_TWO_CONTEXT,
          clock: () => new Date("2026-07-28T12:02:00.000Z")
        });
        assert.equal(
          await otherTenantStore.readLatest(observation.authorizationHash),
          undefined
        );
        const durable = await withTenantTransaction(
          pool,
          TENANT_CONTEXT,
          (client) => client.query(
            `SELECT observation
               FROM credit_registry_chain_observations`
          )
        );
        assert.equal(durable.rowCount, 1);
        const serialized = JSON.stringify(durable.rows);
        assert.equal(serialized.includes("rpcUrl"), false);
        assert.equal(serialized.includes("privateKey"), false);
        assert.equal(serialized.includes("accountAddress"), false);
        await assert.rejects(
          () => withTenantTransaction(
            pool,
            TENANT_CONTEXT,
            (client) => client.query(
              `UPDATE credit_registry_chain_observations
                  SET observation = '{}'::jsonb`
            )
          ),
          /append-only|immutable/
        );
      } finally {
        await appPool.end();
        await pool.query(
          `TRUNCATE TABLE
             credit_registry_chain_outbox_messages,
             credit_registry_chain_observations`
        );
        await dropAppRole();
      }
    });

    await t.test("a fresh Rail Service reconstructs state and idempotency from PostgreSQL", async () => {
      await resetRuntime(pool);
      const state = {
        spendRequest: {
          spendRequestId: "spend_pg_restart_1",
          subjectId: "subject_pg_restart_1",
          mandateId: "mandate_pg_restart_1",
          providerId: "provider_pg_restart_1",
          assetId: ASSET.assetId,
          amountMinor: "10000",
          purposeCode: "compute",
          status: "approved"
        },
        provider: {
          providerId: "provider_pg_restart_1",
          settlementAccountIdRef: PROVIDER_ACCOUNT,
          status: "allowlisted"
        }
      };
      const policyDecisionService = {
        getSpendRequest: () => structuredClone(state.spendRequest),
        getProvider: () => structuredClone(state.provider)
      };
      const authorizationService = { assertAuthorized: () => ({ mandateId: state.spendRequest.mandateId }) };
      const adapter = new SandboxRailAdapter({ sourceAssets: [ASSET] });
      const createRail = () =>
        new RailService({
          eventRepository: new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT }),
          policyDecisionService,
          authorizationService,
          adapters: [adapter]
        });

      const rail = createRail();
      let intent = await rail.createProviderSpendIntent({
        spendRequestId: state.spendRequest.spendRequestId,
        sourceAccountRefHash: hashId("test_source_account", "source_pg_restart_1"),
        direction: TransferDirection.NATIVE,
        idempotencyKey: "pg-restart-intent",
        now: FIXED_NOW
      });
      intent = await rail.quoteTransfer({
        transferIntentId: intent.transferIntentId,
        idempotencyKey: "pg-restart-quote",
        expectedVersion: intent.version,
        now: FIXED_NOW
      });
      intent = await rail.authorizeTransfer({
        transferIntentId: intent.transferIntentId,
        actorRef: "principal_pg_restart_1",
        idempotencyKey: "pg-restart-authorize",
        expectedVersion: intent.version,
        now: FIXED_NOW
      });
      intent = await rail.submitTransfer({
        transferIntentId: intent.transferIntentId,
        idempotencyKey: "pg-restart-submit",
        expectedVersion: intent.version,
        now: FIXED_NOW
      });
      intent = await rail.simulateSettlement({
        transferIntentId: intent.transferIntentId,
        providerEventId: "provider-pg-final-1",
        outcome: SettlementOutcome.SUCCEEDED,
        finality: SettlementFinality.FINALIZED,
        idempotencyKey: "pg-restart-receipt",
        expectedVersion: intent.version,
        now: FIXED_NOW
      });

      const restartedRail = createRail();
      const rebuilt = await restartedRail.getTransferIntent(intent.transferIntentId);
      assert.deepEqual(rebuilt, intent);
      const proof = await restartedRail.getReplayProof(intent.transferIntentId);
      assert.equal(proof.replayable, true);
      assert.equal(proof.eventCount, 5);
      assert.equal((await restartedRail.listSettlementReceipts()).length, 1);
      assert.equal(
        (await new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT }).listOutbox()).length,
        5
      );

      const replay = await restartedRail.simulateSettlement({
        transferIntentId: intent.transferIntentId,
        providerEventId: "provider-pg-final-1",
        outcome: SettlementOutcome.SUCCEEDED,
        finality: SettlementFinality.FINALIZED,
        idempotencyKey: "pg-restart-receipt",
        expectedVersion: 4,
        now: FIXED_NOW
      });
      assert.deepEqual(replay, intent);
      assert.equal(
        (await new PostgresEventRepository({ pool, tenantContext: TENANT_CONTEXT }).listEvents({
          aggregateId: intent.transferIntentId
        })).length,
        5
      );
    });
  } finally {
    await pool.end();
  }
});
