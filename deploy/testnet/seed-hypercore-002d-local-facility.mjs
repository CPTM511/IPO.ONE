import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  CreditAuthorityType,
  CreditEventType,
  CreditIntentStatus,
  MandateCapability,
  MandateStatus,
  RepaymentFrequency,
  acceptCreditOffer,
  activateTradingFacility,
  contributeTradingSubjectCollateral,
  createAcceptedOfferObligation,
  createCreditEvent,
  createCreditLine,
  createCreditOfferAcceptance,
  createCreditIntent,
  createDeterministicCreditDecisionOutcome,
  createMandate,
  createTradingFacility,
  executeSandboxObligation,
  hashId,
  recordTradingProviderFunding
} from "../../packages/domain/src/index.js";
import {
  CoreProjectionType,
  PostgresCoreRepository,
  createTenantSecurityContext
} from "../../modules/persistence/src/index.js";

const { Pool } = pg;
const TENANT_ID = "tenant_ipo_one_local_pilot";
const ACTOR_ID = "actor_local_system";
const SUBJECT_ACTOR_ID = "actor_tc_102_subject";
const PROVIDER_ACTOR_ID = "actor_tc_102_provider";
const SETUP_AT = new Date("2026-07-25T01:10:00.000Z");

function fail(message) {
  throw new Error(`hypercore_002d_facility_seed_error: ${message}`);
}

function tenantContext() {
  return createTenantSecurityContext({
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    policyVersion: "security_001.v1",
    source: "system_worker"
  });
}

async function latestAcceptedProposal(repository) {
  return repository.eventRepository.withTenantRead(async (client) => {
    const result = await client.query(
      `SELECT proposal
         FROM trading_match_proposals
        WHERE status = 'bilaterally_accepted'
        ORDER BY updated_at DESC, id DESC
        LIMIT 1`
    );
    if (result.rowCount !== 1) {
      fail("a durable bilaterally accepted synthetic proposal is required");
    }
    return result.rows[0].proposal;
  });
}

function facilityEvent(eventType, value, now) {
  return createCreditEvent({
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
}

async function commitFacility(repository, {
  value,
  eventType,
  idempotencyKey,
  expectedVersion,
  now
}) {
  const event = facilityEvent(eventType, value, now);
  await repository.commitCommand({
    aggregateType: "trading_facility",
    aggregateId: value.tradingFacilityId,
    idempotencyKey,
    commandHash: hashId("hypercore_002d_facility_command", {
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
  });
}

export async function seedHypercore002dLocalFacility({ pool }) {
  if (!pool || typeof pool.connect !== "function") {
    fail("a PostgreSQL pool is required");
  }
  const repository = new PostgresCoreRepository({
    pool,
    tenantContext: tenantContext(),
    transactionRetries: 10
  });
  const proposal = await latestAcceptedProposal(repository);

  const existing = await repository.eventRepository.withTenantRead(
    async (client) => client.query(
      `SELECT facility
         FROM trading_facilities
        WHERE match_proposal_id = $1
        ORDER BY updated_at DESC
        LIMIT 1`,
      [proposal.tradingMatchProposalId]
    )
  );
  if (existing.rowCount === 1) return existing.rows[0].facility;

  const facilityMandate = {
    ...createMandate({
      principalId: proposal.principalId,
      subjectId: proposal.subjectId,
      capabilities: Object.values(MandateCapability),
      allowedProviderIds: [proposal.providerId],
      allowedCategories: ["trading_capital_synthetic"],
      assetIds: [proposal.terms.assetId],
      perActionLimitMinor: "2000000",
      aggregateLimitMinor: "2000000",
      validFrom: SETUP_AT.toISOString(),
      expiresAt: new Date(SETUP_AT.getTime() + 180 * 86_400_000).toISOString(),
      nonce: "hypercore-002d-canonical-obligation-mandate",
      termsRef: "urn:ipo.one:hypercore-002d:canonical-obligation:v1",
      now: SETUP_AT
    }),
    status: MandateStatus.ACTIVE
  };
  const submittedIntent = createCreditIntent({
    subjectId: proposal.subjectId,
    principalId: proposal.principalId,
    authorityType: CreditAuthorityType.MANDATE,
    authorityRef: facilityMandate.mandateId,
    assetId: proposal.terms.assetId,
    requestedPrincipalMinor: proposal.terms.syntheticPrincipalMinor,
    purposeCode: "trading_capital_synthetic",
    requestedTermDays: 90,
    repaymentFrequency: RepaymentFrequency.MONTHLY,
    installmentCount: 3,
    now: SETUP_AT
  });
  const outcome = createDeterministicCreditDecisionOutcome({
    intent: submittedIntent,
    now: SETUP_AT
  });
  const decidedIntent = {
    ...submittedIntent,
    status: CreditIntentStatus.DECIDED,
    updatedAt: SETUP_AT.toISOString()
  };
  const acceptance = createCreditOfferAcceptance({
    offer: outcome.offer,
    intent: decidedIntent,
    decision: outcome.decision,
    authorityType: CreditAuthorityType.MANDATE,
    authorityRef: facilityMandate.mandateId,
    acknowledgementHash: hashId("hypercore_002d_offer_acknowledgement", {
      proposalHash: proposal.proposalHash
    }),
    acceptedByActorId: SUBJECT_ACTOR_ID,
    now: SETUP_AT
  });
  const acceptedOffer = acceptCreditOffer(outcome.offer, {
    expectedOfferHash: outcome.offer.creditOfferHash,
    expectedTermsHash: outcome.offer.termsHash,
    acceptanceId: acceptance.creditOfferAcceptanceId,
    now: SETUP_AT
  });
  const pendingObligation = createAcceptedOfferObligation({
    offer: acceptedOffer,
    intent: decidedIntent,
    decision: outcome.decision,
    acceptance,
    now: SETUP_AT
  });
  const facilityCreditLine = createCreditLine({
    subjectId: pendingObligation.subjectId,
    mandateId: facilityMandate.mandateId,
    assetId: pendingObligation.assetId,
    limitMinor: pendingObligation.originalPrincipalMinor,
    utilizedMinor: pendingObligation.originalPrincipalMinor,
    riskSnapshotId: outcome.decision.riskDecisionId,
    now: SETUP_AT
  });

  const decisionEvent = createCreditEvent({
    eventType: "hypercore_002d_canonical_offer_decided",
    subjectId: decidedIntent.subjectId,
    payload: {
      creditIntentId: decidedIntent.creditIntentId,
      creditOfferId: outcome.offer.creditOfferId,
      matchProposalId: proposal.tradingMatchProposalId,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    now: SETUP_AT
  });
  await repository.commitCommand({
    aggregateType: "credit_intent",
    aggregateId: decidedIntent.creditIntentId,
    idempotencyKey: "hypercore-002d-canonical-offer-decision",
    commandHash: hashId("hypercore_002d_offer_decision", {
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
      { type: CoreProjectionType.MANDATE, value: facilityMandate, eventId: decisionEvent.eventId },
      { type: CoreProjectionType.CREDIT_INTENT, value: decidedIntent, eventId: decisionEvent.eventId },
      { type: CoreProjectionType.RISK_DECISION, value: outcome.decision, eventId: decisionEvent.eventId },
      { type: CoreProjectionType.CREDIT_OFFER, value: outcome.offer, eventId: decisionEvent.eventId }
    ],
    response: { creditOfferId: outcome.offer.creditOfferId }
  });

  const obligationEvent = createCreditEvent({
    eventType: "hypercore_002d_canonical_obligation_created",
    subjectId: pendingObligation.subjectId,
    obligationId: pendingObligation.obligationId,
    payload: {
      obligationId: pendingObligation.obligationId,
      creditOfferAcceptanceId: acceptance.creditOfferAcceptanceId,
      matchProposalId: proposal.tradingMatchProposalId,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    now: SETUP_AT
  });
  await repository.commitCommand({
    aggregateType: "obligation",
    aggregateId: pendingObligation.obligationId,
    idempotencyKey: "hypercore-002d-canonical-obligation-setup",
    commandHash: hashId("hypercore_002d_obligation_setup", {
      obligationHash: pendingObligation.obligationHash
    }),
    events: [{
      aggregateType: "obligation",
      aggregateId: pendingObligation.obligationId,
      expectedVersion: 0,
      event: obligationEvent
    }],
    writes: [
      { type: CoreProjectionType.CREDIT_OFFER_ACCEPTANCE, value: acceptance, eventId: obligationEvent.eventId },
      { type: CoreProjectionType.CREDIT_OFFER, value: acceptedOffer, eventId: obligationEvent.eventId },
      { type: CoreProjectionType.OBLIGATION, value: pendingObligation, eventId: obligationEvent.eventId }
    ],
    response: { obligationId: pendingObligation.obligationId }
  });

  const executionAt = new Date("2026-07-25T01:11:00.000Z");
  const execution = executeSandboxObligation(pendingObligation, {
    adapterReceipt: {
      obligationId: pendingObligation.obligationId,
      assetId: pendingObligation.assetId,
      amountMinor: pendingObligation.originalPrincipalMinor,
      adapterId: "sandbox_rail_hypercore_002d",
      adapterVersion: "1.0.0",
      adapterKeyId: hashId("hypercore_002d_adapter_key", proposal.proposalHash),
      messageHash: hashId("hypercore_002d_adapter_message", proposal.proposalHash),
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
      sandboxExecutionReceiptId: execution.receipt.sandboxExecutionReceiptId,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false
    },
    now: executionAt
  });
  await repository.commitCommand({
    aggregateType: "obligation",
    aggregateId: execution.obligation.obligationId,
    idempotencyKey: "hypercore-002d-canonical-obligation-execution",
    commandHash: hashId("hypercore_002d_obligation_execution", {
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
      { type: CoreProjectionType.LEDGER_TRANSACTION, value: execution.ledgerTransaction, eventId: executionEvent.eventId },
      { type: CoreProjectionType.SANDBOX_EXECUTION_RECEIPT, value: execution.receipt, eventId: executionEvent.eventId },
      { type: CoreProjectionType.OBLIGATION, value: execution.obligation, eventId: executionEvent.eventId },
      { type: CoreProjectionType.CREDIT_LINE, value: facilityCreditLine, eventId: executionEvent.eventId }
    ],
    response: { obligationId: execution.obligation.obligationId }
  });

  let facility = createTradingFacility({
    matchProposal: proposal,
    obligation: execution.obligation,
    createdByActorId: SUBJECT_ACTOR_ID,
    now: new Date("2026-07-25T01:12:00.000Z")
  });
  await commitFacility(repository, {
    value: facility,
    eventType: CreditEventType.TRADING_FACILITY_CREATED,
    idempotencyKey: "hypercore-002d-facility-created",
    expectedVersion: 0,
    now: new Date(facility.createdAt)
  });

  facility = contributeTradingSubjectCollateral(facility, {
    contributedByActorId: SUBJECT_ACTOR_ID,
    amountMinor: facility.requiredSubjectCollateralMinor,
    expectedStateHash: facility.stateHash,
    expectedVersion: facility.version,
    now: new Date("2026-07-25T01:13:00.000Z")
  });
  await commitFacility(repository, {
    value: facility,
    eventType: CreditEventType.TRADING_FACILITY_SUBJECT_COLLATERAL_RECORDED,
    idempotencyKey: "hypercore-002d-facility-subject-collateral",
    expectedVersion: 1,
    now: new Date(facility.updatedAt)
  });

  facility = recordTradingProviderFunding(facility, {
    fundedByActorId: PROVIDER_ACTOR_ID,
    amountMinor: facility.requiredProviderFundingMinor,
    expectedStateHash: facility.stateHash,
    expectedVersion: facility.version,
    now: new Date("2026-07-25T01:14:00.000Z")
  });
  await commitFacility(repository, {
    value: facility,
    eventType: CreditEventType.TRADING_FACILITY_PROVIDER_FUNDING_RECORDED,
    idempotencyKey: "hypercore-002d-facility-provider-funding",
    expectedVersion: 2,
    now: new Date(facility.updatedAt)
  });

  facility = activateTradingFacility(facility, {
    matchProposal: proposal,
    obligation: execution.obligation,
    activatedByActorId: SUBJECT_ACTOR_ID,
    expectedStateHash: facility.stateHash,
    expectedVersion: facility.version,
    now: new Date("2026-07-25T01:15:00.000Z")
  });
  await commitFacility(repository, {
    value: facility,
    eventType: CreditEventType.TRADING_FACILITY_ACTIVATED,
    idempotencyKey: "hypercore-002d-facility-activated",
    expectedVersion: 3,
    now: new Date(facility.updatedAt)
  });
  return facility;
}

async function runCli() {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    application_name: "ipo-one-hypercore-002d-facility-seed"
  });
  try {
    const facility = await seedHypercore002dLocalFacility({ pool });
    console.log(`HYPERCORE_002D_LOCAL_FACILITY ${JSON.stringify({
      facilityId: facility.tradingFacilityId,
      facilityHash: facility.facilityHash,
      obligationHash: facility.obligationHash,
      lifecycleStatus: facility.lifecycleStatus,
      riskState: facility.riskState,
      sandboxOnly: facility.sandboxOnly,
      syntheticOnly: facility.syntheticOnly,
      nonRedeemable: facility.nonRedeemable,
      withdrawable: facility.withdrawable,
      transferable: facility.transferable,
      productionAuthority: facility.productionAuthority,
      fundsAuthority: facility.fundsAuthority,
      schemaVersion: "hypercore_002d_local_facility_seed.v1"
    })}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
