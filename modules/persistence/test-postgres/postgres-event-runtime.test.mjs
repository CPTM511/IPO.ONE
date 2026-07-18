import assert from "node:assert/strict";
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
  createAccountBinding,
  createAdminAction,
  createConsentRecord,
  createCreditIntent,
  createCreditLine,
  createCreditEvent,
  createCreditOffer,
  createHumanIdentityReference,
  createLedgerAccount,
  createLedgerEntry,
  createLedgerTransaction,
  createLockbox,
  createMandate,
  createObligation,
  createPrincipal,
  createProvider,
  createRiskDecision,
  createSpendPolicy,
  createSpendRequest,
  createSubject,
  createWalletAccount,
  hashId,
  revokeConsentRecord,
  revokeHumanIdentityReference
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
import { RailService, SandboxRailAdapter } from "../../rail/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  SandboxChainAdapter
} from "../../chain-adapter/src/index.js";
import {
  LiveChainIndexer,
  PostgresChainObservationStore
} from "../../event-indexer/src/index.js";
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
  "aggregate_stream_heads",
  "approval_decisions",
  "approval_executions",
  "approval_proposals",
  "authentication_credentials",
  "authentication_events",
  "authentication_oidc_transactions",
  "authentication_sessions",
  "authentication_wallet_transactions",
  "authorization_audit_events",
  "authorization_resource_bindings",
  "authorization_resources",
  "behavioral_metrics",
  "break_glass_custodian_decisions",
  "break_glass_incidents",
  "break_glass_reviews",
  "command_events",
  "command_idempotency",
  "consent_records",
  "credit_events",
  "credit_intents",
  "credit_learning_events",
  "credit_lines",
  "credit_offer_acceptances",
  "credit_offers",
  "credit_profiles",
  "domain_events",
  "evidence_envelopes",
  "human_identity_references",
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
  "operational_alert_occurrences",
  "operational_alerts",
  "operational_synthetic_runs",
  "outbox_messages",
  "pilot_feedback_records",
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
  "transfer_intents",
  "transfer_quotes"
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
        "0025_durable_human_authentication"
      ]);
      const firstStatus = await migrationStatus({ pool });
      assert.equal(firstStatus.every((migration) => migration.applied && migration.checksum.length === 64), true);

      assert.deepEqual(await migrateDown({ pool, steps: 25 }), [
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
        "0025_durable_human_authentication"
      ]);

      assert.deepEqual(await migrateDown({ pool, steps: 23 }), [
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
        "0025_durable_human_authentication"
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
           command_events
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
