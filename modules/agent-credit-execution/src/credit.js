import {
  CreditAuthorityType,
  CREDIT_APPLICATION_RISK_STATE_QUERY_VERSION,
  MandateCapability,
  PrincipalType,
  RepaymentFrequency,
  SandboxRepaymentSource,
  SubjectType,
  acceptCreditOffer,
  acceptTradingMatchAsProvider,
  acceptTradingMatchAsSubject,
  activateTradingFacility,
  contributeTradingSubjectCollateral,
  createAcceptedOfferObligation,
  createCapitalPartnerCreditOffer,
  createCreditIntent,
  createCreditOfferAcceptance,
  createEvidenceDerivedCreditDecisionOutcome,
  createMandate,
  createPrincipal,
  createSubject,
  createTradingAccountBindingChallenge,
  createTradingCapitalRequest,
  createTradingFacility,
  createTradingMatchProposal,
  createTradingProviderMandate,
  executeSandboxObligation,
  finalizeTradingEvidenceSnapshot,
  hashId,
  importSyntheticTradingHistory,
  postSandboxRepayment,
  recordTradingProviderFunding
} from "../../../packages/domain/src/index.js";
import { AGENT_CREDIT_EXECUTION_POLICY } from "./policy.js";

const ASSET_ID = AGENT_CREDIT_EXECUTION_POLICY.asset.settlementAsset;
const PROVIDER_ID = "capital_partner_agent_credit_exec_001";
const PROVIDER_ACTOR_ID = "actor_capital_partner_agent_credit_exec_001";

export function createAgentCreditIdentity({ economicAgentWalletHash, now, runId }) {
  const principal = createPrincipal({
    principalType: PrincipalType.DEVELOPER,
    jurisdiction: "synthetic",
    now
  });
  const subject = {
    ...createSubject({
      subjectType: SubjectType.AGENT,
      primaryPrincipalId: principal.principalId,
      displayName: "reference-economic-agent",
      now
    }),
    status: "active",
    updatedAt: now.toISOString()
  };
  const mandate = {
    ...createMandate({
      principalId: principal.principalId,
      subjectId: subject.subjectId,
      capabilities: Object.values(MandateCapability),
      allowedProviderIds: [PROVIDER_ID],
      allowedCategories: ["trading_capital"],
      assetIds: [ASSET_ID],
      perActionLimitMinor:
        AGENT_CREDIT_EXECUTION_POLICY.execution.maxOrderNotionalMinor,
      aggregateLimitMinor:
        AGENT_CREDIT_EXECUTION_POLICY.execution.maxFacilityExposureMinor,
      validFrom: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
      nonce: `agent-credit-${runId}`,
      termsRef: "urn:ipo.one:terms:agent-credit-execution:v1",
      now
    }),
    status: "active",
    updatedAt: now.toISOString()
  };
  return {
    economicAgentWalletHash,
    principal,
    subject,
    mandate,
    ipoOneSubject: subject.subjectId,
    schemaVersion: "agent_credit_identity_state.v1"
  };
}

function passport({ intent, decision, now }) {
  const artifact = {
    creditPassportArtifactId: `credit_passport_${intent.creditIntentId}`,
    artifactHash: hashId("agent_credit_passport", {
      creditIntentId: intent.creditIntentId,
      decisionHash: decision.decisionHash
    }),
    version: 1,
    subjectId: intent.subjectId,
    sourceRiskDecisionId: decision.riskDecisionId,
    sourceDecisionHash: decision.decisionHash,
    purpose: "private_credit_review",
    status: "active",
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "credit_passport_artifact.v1"
  };
  return {
    artifact,
    verification: {
      verified: true,
      status: "active",
      sourceCurrent: true,
      checkedAt: now.toISOString(),
      artifactHash: artifact.artifactHash,
      artifactVersion: 1,
      onlineVerificationRequired: true,
      schemaVersion: "credit_passport_verification.v1"
    }
  };
}

export function createAgentCreditOffer({ identity, requestedPrincipalMinor, now }) {
  const intent = createCreditIntent({
    subjectId: identity.subject.subjectId,
    principalId: identity.principal.principalId,
    authorityType: CreditAuthorityType.MANDATE,
    authorityRef: identity.mandate.mandateId,
    assetId: ASSET_ID,
    requestedPrincipalMinor,
    purposeCode: "trading_capital",
    requestedTermDays: 30,
    repaymentFrequency: RepaymentFrequency.END_OF_TERM,
    installmentCount: 1,
    now
  });
  const sourceEvidence = [
    ["credit_intent", "credit_intent", intent.creditIntentId, intent],
    ["subject", "subject", identity.subject.subjectId, identity.subject],
    ["principal", "principal", identity.principal.principalId, identity.principal],
    ["authority", "mandate", identity.mandate.mandateId, identity.mandate]
  ].map(([role, entityType, entityId, entity]) => ({
    role,
    entityType,
    entityIdHash: hashId("agent_credit_risk_entity_id", { entityId }),
    entityHash: hashId("agent_credit_risk_entity", entity),
    aggregateVersion: 1,
    eventId: `event_agent_credit_risk_${role}`,
    evidenceHash: hashId("agent_credit_risk_source_evidence", {
      role,
      entityId
    }),
    sourceFinality: "finalized"
  }));
  const evaluated = createEvidenceDerivedCreditDecisionOutcome({
    intent,
    eligibilityFacts: {
      subjectEligible: true,
      subjectSuspended: false,
      principalEligible: true,
      authorityCurrent: true,
      identityEvidenceCurrent: null,
      principalBindingCurrent: true
    },
    sourceEvidence,
    riskState: {
      adverseObligationCount: 0,
      frozenCreditLineCount: 0,
      liveStateVersion: 1,
      queryVersion: CREDIT_APPLICATION_RISK_STATE_QUERY_VERSION,
      stateHash: hashId("agent_credit_risk_state", {
        subjectId: identity.subject.subjectId,
        adverseObligationCount: 0,
        frozenCreditLineCount: 0
      })
    },
    now
  });
  const decision = evaluated.decision;
  const decidedIntent = {
    ...intent,
    status: "decided",
    updatedAt: now.toISOString()
  };
  const { artifact, verification } = passport({
    intent: decidedIntent,
    decision,
    now
  });
  const maturityAt = new Date(now.getTime() + 30 * 86_400_000).toISOString();
  const offer = createCapitalPartnerCreditOffer({
    creditIntent: decidedIntent,
    decision,
    passportArtifact: artifact,
    passportVerification: verification,
    capitalPartnerId: PROVIDER_ID,
    capitalPartnerOperatorId: PROVIDER_ACTOR_ID,
    underwritingSnapshotHash: hashId("agent_credit_underwriting", {
      artifactHash: artifact.artifactHash,
      decisionHash: decision.decisionHash
    }),
    assetId: ASSET_ID,
    facilityLimitMinor: requestedPrincipalMinor,
    approvedPrincipalMinor: requestedPrincipalMinor,
    perDrawCapMinor: requestedPrincipalMinor,
    annualRateBps: 0,
    originationFeeMinor: "0",
    repaymentFrequency: RepaymentFrequency.END_OF_TERM,
    installmentCount: 1,
    firstPaymentAt: maturityAt,
    maturityAt,
    permittedPurposeCode: "trading_capital",
    validUntil: new Date(now.getTime() + 3_600_000).toISOString(),
    disclosureRef: "urn:ipo.one:disclosure:agent-credit-execution:v1",
    now
  });
  return {
    intent: decidedIntent,
    decision,
    passportArtifact: artifact,
    passportVerification: verification,
    offer
  };
}

function tradingProfile({ identity, now }) {
  const challenge = createTradingAccountBindingChallenge({
    tenantId: "tenant_agent_credit_exec_001",
    subject: identity.subject,
    principal: identity.principal,
    requestedByActorId: identity.principal.principalId,
    challengeNonce: hashId("agent_credit_trading_challenge", {
      subjectId: identity.subject.subjectId
    }),
    now
  });
  const imported = importSyntheticTradingHistory({
    profile: challenge,
    requestedByActorId: identity.principal.principalId,
    challengeEventId: "event_agent_credit_trading_challenge",
    challengeEvidenceHash: hashId("agent_credit_challenge_evidence", {
      challengeId: challenge.challengeId ?? challenge.tradingCreditProfileId
    }),
    now: new Date(now.getTime() + 1_000)
  });
  return finalizeTradingEvidenceSnapshot({
    profile: imported,
    sourceProjectionHash: hashId("agent_credit_history_projection", {
      profileId: imported.tradingCreditProfileId
    }),
    historyImportEventId: "event_agent_credit_history_import",
    historyImportEvidenceHash: hashId("agent_credit_history_evidence", {
      profileId: imported.tradingCreditProfileId
    }),
    sourceFinality: "finalized",
    now: new Date(now.getTime() + 2_000)
  });
}

function bilateralProposal({ identity, requestedPrincipalMinor, now }) {
  const profile = tradingProfile({ identity, now });
  const request = createTradingCapitalRequest({
    tradingCreditProfile: profile,
    requestedByActorId: identity.principal.principalId,
    templateType: "credit",
    strategyClass: "directional",
    assetId: ASSET_ID,
    requestedAmountMinor: requestedPrincipalMinor,
    durationDays: 30,
    now: new Date(now.getTime() + 3_000)
  });
  const provider = {
    providerId: PROVIDER_ID,
    providerHash: hashId("provider", { providerId: PROVIDER_ID }),
    status: "allowlisted",
    schemaVersion: "provider.v1"
  };
  const providerMandate = createTradingProviderMandate({
    provider,
    providerActorId: PROVIDER_ACTOR_ID,
    supportedTemplateTypes: ["credit"],
    allowedSubjectTypes: ["agent"],
    allowedStrategyClasses: ["directional"],
    assetId: ASSET_ID,
    minAmountMinor: "1",
    maxAmountMinor:
      AGENT_CREDIT_EXECUTION_POLICY.execution.maxFacilityExposureMinor,
    minDurationDays: 30,
    maxDurationDays: 30,
    now: new Date(now.getTime() + 4_000)
  });
  const proposed = createTradingMatchProposal({
    capitalRequest: request,
    providerMandate,
    requestedMandateHash: providerMandate.mandateHash,
    requestedRequestHash: request.requestHash,
    now: new Date(now.getTime() + 5_000)
  });
  const providerAccepted = acceptTradingMatchAsProvider({
    proposal: proposed,
    capitalRequest: request,
    providerMandate,
    acceptedByActorId: PROVIDER_ACTOR_ID,
    acceptedProposalHash: proposed.proposalHash,
    acceptedTermsHash: proposed.terms.termsHash,
    now: new Date(now.getTime() + 6_000)
  });
  const accepted = acceptTradingMatchAsSubject({
    proposal: providerAccepted,
    capitalRequest: request,
    providerMandate,
    acceptedByActorId: identity.principal.principalId,
    acceptedProposalHash: providerAccepted.proposalHash,
    acceptedTermsHash: providerAccepted.terms.termsHash,
    now: new Date(now.getTime() + 7_000)
  });
  return { profile, request, provider, providerMandate, proposal: accepted };
}

export function acceptAgentCreditOffer({ identity, offerState, now }) {
  const acceptance = createCreditOfferAcceptance({
    offer: offerState.offer,
    intent: offerState.intent,
    decision: offerState.decision,
    authorityType: CreditAuthorityType.MANDATE,
    authorityRef: identity.mandate.mandateId,
    acknowledgementHash: hashId("agent_credit_offer_acknowledgement", {
      offerHash: offerState.offer.creditOfferHash
    }),
    acceptedByActorId: identity.principal.principalId,
    now
  });
  const acceptedOffer = acceptCreditOffer(offerState.offer, {
    expectedOfferHash: offerState.offer.creditOfferHash,
    expectedTermsHash: offerState.offer.termsHash,
    acceptanceId: acceptance.creditOfferAcceptanceId,
    now
  });
  const pendingObligation = createAcceptedOfferObligation({
    offer: offerState.offer,
    intent: offerState.intent,
    decision: offerState.decision,
    acceptance,
    now
  });
  const executed = executeSandboxObligation(pendingObligation, {
    adapterReceipt: {
      obligationId: pendingObligation.obligationId,
      assetId: pendingObligation.assetId,
      amountMinor: pendingObligation.originalPrincipalMinor,
      adapterId: "controlled_capital_account_l0",
      adapterVersion: "controlled_capital_account.v1",
      adapterKeyId: "simulated_non_exportable_signer",
      messageHash: hashId("controlled_capital_allocation", {
        obligationHash: pendingObligation.obligationHash
      }),
      signature: "synthetic-signature-not-persisted",
      issuedAt: now.toISOString(),
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false
    },
    now
  });
  const bilateral = bilateralProposal({
    identity,
    requestedPrincipalMinor: pendingObligation.originalPrincipalMinor,
    now
  });
  const created = createTradingFacility({
    matchProposal: bilateral.proposal,
    obligation: executed.obligation,
    createdByActorId: identity.principal.principalId,
    now: new Date(now.getTime() + 8_000)
  });
  const collateralized = contributeTradingSubjectCollateral(created, {
    contributedByActorId: identity.principal.principalId,
    amountMinor: created.requiredSubjectCollateralMinor,
    expectedStateHash: created.stateHash,
    expectedVersion: created.version,
    now: new Date(now.getTime() + 9_000)
  });
  const funded = recordTradingProviderFunding(collateralized, {
    fundedByActorId: PROVIDER_ACTOR_ID,
    amountMinor: collateralized.requiredProviderFundingMinor,
    expectedStateHash: collateralized.stateHash,
    expectedVersion: collateralized.version,
    now: new Date(now.getTime() + 10_000)
  });
  const facility = activateTradingFacility(funded, {
    matchProposal: bilateral.proposal,
    obligation: executed.obligation,
    activatedByActorId: identity.principal.principalId,
    expectedStateHash: funded.stateHash,
    expectedVersion: funded.version,
    now: new Date(now.getTime() + 11_000)
  });
  return {
    acceptance,
    acceptedOffer,
    obligation: executed.obligation,
    principalLedgerTransaction: executed.ledgerTransaction,
    sandboxExecutionReceiptHash: executed.receipt.receiptHash,
    bilateral,
    facility
  };
}

export function applyAgentCreditRepayment({ obligation, amountMinor, actorId, now }) {
  return postSandboxRepayment(obligation, {
    amountMinor,
    sourceCode: SandboxRepaymentSource.SYNTHETIC_REVENUE,
    actorId,
    now
  });
}
