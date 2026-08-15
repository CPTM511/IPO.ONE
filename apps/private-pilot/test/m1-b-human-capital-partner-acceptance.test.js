import assert from "node:assert/strict";
import test from "node:test";
import { createCoreProjectionHash } from "../../../modules/persistence/src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  M1BHumanCapitalPartnerAcceptanceError,
  assertM1BResponseOnlyCapture,
  captureM1BCapitalPartnerDenialBoundary,
  createM1BCommandResponseProjection,
  createM1BQueryResponseProjection,
  hashM1BAcceptanceManifest,
  projectM1BSafeResponse,
  readM1BActorResourceScope,
  readM1BCommandProof,
  readM1BCapitalPartnerDenialProtectedState,
  readM1BHumanEconomicReadBack,
  readM1BProjectionProof,
  readM1BQueryProof,
  readM1BSafeSiweAuthentication
} from "../src/m1-b-human-capital-partner-acceptance.js";
import {
  produceM1BCapitalPartnerCriticalReceipt,
  produceM1BCapitalPartnerFixtureReceiptForTest,
  produceM1BHumanCriticalReceipt,
  produceM1BHumanFixtureReceiptForTest
} from "../src/m1-b-human-capital-partner-producer.js";
import {
  verifyM1BHumanCriticalReceipt
} from "../../../scripts/m1-b-acceptance-evidence-files.mjs";

const SHA = "a".repeat(40);
const HASH = `0x${"1".repeat(64)}`;
const OTHER_HASH = `0x${"2".repeat(64)}`;
const TIME = "2026-08-14T01:00:00.000Z";
const START = "2026-08-14T00:00:00.000Z";
const ACCEPTED_RESPONSE = Object.freeze({
  sandboxOnly: true,
  schemaVersion: "tenant_credit_offer_accepted.v1"
});

function humanEconomicRows({ executionTime = TIME, repaymentTime = TIME } = {}) {
  const assetId = "eip155:84532/erc20:0x0000000000000000000000000000000000000001";
  const obligationId = "obligation_human_test";
  const repaymentHash = `0x${"4".repeat(64)}`;
  const dueAt = "2026-09-14T01:00:00.000Z";
  const normalSides = {
    principal_receivable: "debit",
    sandbox_funding_source: "credit",
    repayment_clearing: "debit"
  };
  const entry = ({ transactionId, sequence, direction, amount, accountType }) => ({
    id: `ledger_entry_${transactionId}_${sequence}`,
    transaction_id: transactionId,
    account_id: `ledger_account_${hashId("sandbox_ledger_account", {
      ownerType: "obligation",
      ownerId: obligationId,
      assetId,
      accountType
    }).slice(2)}`,
    account_owner_type: "obligation",
    account_owner_id: obligationId,
    account_asset_id: assetId,
    account_hash: hashId("ledger_account", {
      ownerType: "obligation",
      ownerId: obligationId,
      assetId,
      accountType
    }),
    account_type: accountType,
    account_normal_side: normalSides[accountType],
    account_status: "active",
    account_schema_version: "ledger_account.v1",
    direction,
    amount_minor: amount,
    sequence,
    posted_at: transactionId === "ledger_transaction_human_principal"
      ? executionTime
      : repaymentTime,
    schema_version: "ledger_entry.v1"
  });
  const entries = [
    entry({
      transactionId: "ledger_transaction_human_principal",
      sequence: 0,
      direction: "debit",
      amount: "1000000",
      accountType: "principal_receivable"
    }),
    entry({
      transactionId: "ledger_transaction_human_principal",
      sequence: 1,
      direction: "credit",
      amount: "1000000",
      accountType: "sandbox_funding_source"
    }),
    entry({
      transactionId: "ledger_transaction_human_repayment",
      sequence: 0,
      direction: "debit",
      amount: "1000000",
      accountType: "repayment_clearing"
    }),
    entry({
      transactionId: "ledger_transaction_human_repayment",
      sequence: 1,
      direction: "credit",
      amount: "1000000",
      accountType: "principal_receivable"
    })
  ];
  const ledgerTransaction = ({
    id,
    type,
    referenceType,
    referenceId,
    amount,
    idempotencyKey,
    metadata
  }) => {
    const normalizedEntries = entries
      .filter(({ transaction_id: transactionId }) => transactionId === id)
      .map((row) => ({
        ledgerAccountId: row.account_id,
        direction: row.direction,
        amountMinor: row.amount_minor,
        sequence: row.sequence
      }));
    return {
      id,
      transaction_hash: hashId("ledger_transaction", {
        idempotencyKey,
        transactionType: type,
        assetId,
        referenceType,
        referenceId,
        metadata,
        entries: normalizedEntries
      }),
      idempotency_key: idempotencyKey,
      transaction_type: type,
      asset_id: assetId,
      reference_type: referenceType,
      reference_id: referenceId,
      metadata,
      metadata_hash: hashId("ledger_metadata", metadata),
      debit_total_minor: amount,
      credit_total_minor: amount,
      entry_count: 2,
      posted_at: id === "ledger_transaction_human_principal"
        ? executionTime
        : repaymentTime,
      schema_version: "ledger_transaction.v1"
    };
  };
  const currentInstallment = {
    id: "obligation_installment_human_test",
    obligation_id: obligationId,
    installment_number: 1,
    due_at: dueAt,
    scheduled_principal_minor: "1000000",
    scheduled_interest_minor: "0",
    scheduled_fee_minor: "0",
    paid_principal_minor: "1000000",
    paid_interest_minor: "0",
    paid_fee_minor: "0",
    status: "paid",
    schedule_version: "obligation_schedule.v1",
    schedule_sequence: 1,
    schema_version: "obligation_installment.v1"
  };
  const originalInstallment = {
    installmentId: currentInstallment.id,
    obligationId,
    installmentNumber: 1,
    dueAt,
    scheduledPrincipalMinor: "1000000",
    scheduledInterestMinor: "0",
    scheduledFeeMinor: "0",
    paidPrincipalMinor: "0",
    paidInterestMinor: "0",
    paidFeeMinor: "0",
    status: "scheduled",
    scheduleVersion: "obligation_schedule.v1",
    scheduleSequence: 1,
    schemaVersion: "obligation_installment.v1"
  };
  const principalMetadata = {
    obligationId,
    receiptHash: HASH,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false
  };
  const repaymentMetadata = {
    repaymentHash,
    sourceCode: "synthetic_wallet",
    appliedFeeMinor: "0",
    appliedInterestMinor: "0",
    appliedPrincipalMinor: "1000000",
    surplusMinor: "0",
    sandboxOnly: true,
    productionFundsMoved: false
  };
  return {
    execution: {
      id: "sandbox_execution_receipt_human_test",
      receipt_hash: HASH,
      obligation_id: "obligation_human_test",
      subject_id: "subject_human_test",
      asset_id: assetId,
      amount_minor: "1000000",
      provider_id: null,
      provider_category: null,
      purpose_code: null,
      adapter_id: "signed_non_redeemable",
      adapter_version: "signed_non_redeemable.v1",
      adapter_key_id: OTHER_HASH,
      adapter_message_hash: `0x${"3".repeat(64)}`,
      adapter_issued_at: executionTime,
      executed_at: executionTime,
      sandbox_only: true,
      production_funds_moved: false,
      withdrawable: false,
      schema_version: "sandbox_execution_receipt.v1"
    },
    repayment: {
      id: "repayment_human_test",
      repayment_hash: repaymentHash,
      obligation_id: obligationId,
      subject_id: "subject_human_test",
      asset_id: assetId,
      requested_minor: "1000000",
      applied_minor: "1000000",
      applied_fee_minor: "0",
      applied_interest_minor: "0",
      applied_principal_minor: "1000000",
      surplus_minor: "0",
      remaining_principal_minor: "0",
      remaining_interest_minor: "0",
      remaining_fees_minor: "0",
      source_code: "synthetic_wallet",
      actor_hash: hashId("actor", "actor_human_borrower_pilot"),
      accrued_interest_minor: "0",
      accrual_days: 0,
      ledger_transaction_id: "ledger_transaction_human_repayment",
      interest_ledger_transaction_id: null,
      occurred_at: repaymentTime,
      sandbox_only: true,
      production_funds_moved: false,
      schema_version: "repayment.v2"
    },
    obligation: {
      id: obligationId,
      obligation_hash: `0x${"5".repeat(64)}`,
      subject_id: "subject_human_test",
      asset_id: assetId,
      amount_minor: "1000000",
      outstanding_minor: "0",
      repaid_amount_minor: "1000000",
      accrued_interest_minor: "0",
      outstanding_interest_minor: "0",
      accrued_fees_minor: "0",
      outstanding_fees_minor: "0",
      total_repaid_minor: "1000000",
      installment_count: 1,
      schedule_version: "obligation_schedule.v1",
      schedule_hash: hashId("obligation_schedule", [originalInstallment]),
      schedule_sequence: 1,
      execution_status: "executed",
      sandbox_execution_receipt_id: "sandbox_execution_receipt_human_test",
      executed_at: executionTime,
      updated_at: repaymentTime,
      status: "fully_repaid",
      sandbox_only: true,
      production_funds_moved: false,
      withdrawable: false,
      schema_version: "obligation.v2"
    },
    installments: [currentInstallment],
    transactions: [
      ledgerTransaction({
        id: "ledger_transaction_human_principal",
        type: "sandbox_credit_execution",
        referenceType: "sandbox_execution_receipt",
        referenceId: "sandbox_execution_receipt_human_test",
        amount: "1000000",
        idempotencyKey: hashId("sandbox_execution_ledger_idempotency", {
          obligationId,
          receiptHash: HASH
        }),
        metadata: principalMetadata
      }),
      ledgerTransaction({
        id: "ledger_transaction_human_repayment",
        type: "sandbox_repayment",
        referenceType: "repayment",
        referenceId: "repayment_human_test",
        amount: "1000000",
        idempotencyKey: hashId("sandbox_repayment_ledger_idempotency", {
          repaymentId: "repayment_human_test",
          repaymentHash
        }),
        metadata: repaymentMetadata
      })
    ],
    entries
  };
}

function humanCapture() {
  const rows = [
    ["pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2"],
    ["pilotAcceptCreditOffer", "tenant_credit_offer_accepted.v1"],
    ["pilotExecuteSandboxObligation", "tenant_sandbox_obligation_executed.v1"],
    ["pilotPostSandboxRepayment", "tenant_sandbox_repayment_posted.v1"],
    ["pilotReadOwnObligationEvidence", "tenant_owned_obligation_evidence_view.v1"]
  ];
  return {
    schemaVersion: "m1_b_human_response_capture.v1",
    candidateReleaseId: SHA,
    capturedAt: TIME,
    databaseStartedAt: START,
    role: "human",
    responses: rows.map(([operationId, responseSchemaVersion], index) => ({
      sequence: index + 1,
      actorRole: "human",
      operationId,
      requestId: `request-human-capture-${index + 1}`,
      correlationId: "correlation-human-capture",
      responseSchemaVersion,
      armIssuedAt: new Date(
        Date.parse(START) + ((index + 1) * 60_000) - 1_000
      ).toISOString(),
      armClockDomain: "lima_exact_pilot_vm_system_clock",
      capturedAt: new Date(Date.parse(START) + ((index + 1) * 60_000)).toISOString(),
      response: { schemaVersion: responseSchemaVersion, sandboxOnly: true }
    }))
  };
}

test("response-only capture accepts the exact Human sequence and rejects auth material", () => {
  const capture = humanCapture();
  const safe = assertM1BResponseOnlyCapture(capture, { role: "human" });
  assert.equal(safe.candidateReleaseId, SHA);
  assert.equal(safe.responses[0].response.sandboxOnly, undefined);
  assert.equal(
    safe.responses[0].rawResponseHash,
    hashId("command_response", capture.responses[0].response)
  );
  capture.responses[0].response.session = "opaque-session";
  assert.throws(
    () => assertM1BResponseOnlyCapture(capture, { role: "human" }),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_capture_sensitive_key"
  );
});

test("response-only capture rejects normalized credential keys and sensitive values", () => {
  for (const key of [
    "sessionId",
    "csrfToken",
    "accessToken",
    "tokenJtiHash",
    "walletAddress",
    "accountAddress",
    "privateKey",
    "databaseUrl",
    "rawSignature"
  ]) {
    const capture = humanCapture();
    capture.responses[0].response[key] = "opaque";
    assert.throws(
      () => assertM1BResponseOnlyCapture(capture, { role: "human" }),
      (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
        error.code === "acceptance_capture_sensitive_key",
      key
    );
  }
  for (const value of [
    `0x${"a".repeat(40)}`,
    `0x${"b".repeat(130)}`,
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwaWxvdCJ9.signaturevalue",
    "-----BEGIN PRIVATE KEY-----",
    "postgresql://pilot:credential@database.invalid/ipo_one",
    "sessionId=opaque-cookie-value",
    "Bearer opaque-access-material"
  ]) {
    const capture = humanCapture();
    capture.responses[0].response.note = value;
    assert.throws(
      () => assertM1BResponseOnlyCapture(capture, { role: "human" }),
      (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
        error.code === "acceptance_capture_sensitive_value",
      value
    );
  }
});

test("Capital Partner producer assembles two exact lineages and staged denial proofs", async () => {
  const tenantId = "tenant_local";
  const capitalPartnerActorId = "actor_capital_partner_pilot";
  const borrowerActorId = "actor_human_borrower_pilot";
  const subjectId = "subject_cp_candidate";
  const capitalPartnerId = "capital_partner_candidate";
  const times = Array.from({ length: 10 }, (_, index) =>
    new Date(Date.parse(START) + ((index + 1) * 60_000)).toISOString()
  );
  const offer = ({ id, intentId, riskDecisionId, passportId, hashDigit, status, closedAt }) => ({
    creditOfferId: id,
    creditOfferHash: `0x${hashDigit.repeat(64)}`,
    termsHash: `0x${String((Number(hashDigit) + 1) % 10).repeat(64)}`,
    creditIntentId: intentId,
    subjectId,
    riskDecisionId,
    capitalPartnerId,
    creditPassportArtifactId: passportId,
    creditPassportArtifactHash: `0x${String((Number(hashDigit) + 2) % 10).repeat(64)}`,
    creditPassportArtifactVersion: 1,
    passportVerificationHash: `0x${String((Number(hashDigit) + 3) % 10).repeat(64)}`,
    underwritingSnapshotHash: `0x${String((Number(hashDigit) + 4) % 10).repeat(64)}`,
    status,
    validUntil: "2026-08-15T00:00:00.000Z",
    ...(closedAt ? { closedAt } : {}),
    sandboxOnly: true,
    productionFundsApproved: false,
    schemaVersion: "credit_offer.v2"
  });
  const offerA = offer({
    id: "credit_offer_cp_a",
    intentId: "credit_intent_cp_a",
    riskDecisionId: "risk_decision_cp_a",
    passportId: "credit_passport_cp_a",
    hashDigit: "2",
    status: "offered"
  });
  const offerBAuthored = offer({
    id: "credit_offer_cp_b",
    intentId: "credit_intent_cp_b",
    riskDecisionId: "risk_decision_cp_b",
    passportId: "credit_passport_cp_b",
    hashDigit: "5",
    status: "offered"
  });
  const offerBWithdrawn = { ...offerBAuthored, status: "withdrawn", closedAt: times[7] };
  const passportInbox = (artifactId, artifactHash, creditIntentId, time) => ({
    items: [{
      resource: { resourceType: "credit_passport_artifact", resourceId: artifactId },
      reviewContext: { creditIntentId, artifactHash, artifactVersion: 1 },
      summary: {
        claimCount: 3,
        purpose: "private_credit_review",
        issuedAt: START,
        expiresAt: "2026-08-15T00:00:00.000Z"
      }
    }],
    count: 1,
    hasMore: false,
    fundsAuthority: false,
    serverTruth: true,
    readOnly: true,
    schemaVersion: "tenant_capital_partner_passport_inbox_view.v1",
    observedAt: time
  });
  const workspace = (exactOffer, intentId, riskDecisionId) => ({
    workspaceKind: "human_borrower",
    humanOfferReview: {
      subjectId,
      consentId: "consent_cp_candidate",
      creditIntent: { creditIntentId: intentId },
      decision: { riskDecisionId },
      offer: exactOffer,
      offerSchemaVersion: "credit_offer.v2",
      offerAggregateVersion: 1,
      serverTruth: true,
      nonAuthorizing: true,
      sandboxOnly: true,
      productionFundsApproved: false,
      fundsAuthority: false,
      schemaVersion: "human_offer_review_recovery.v1"
    },
    hasMore: false,
    serverTruth: true,
    schemaVersion: "tenant_workspace_resume_view.v2"
  });
  const rawResponses = [
    {
      resource: { resourceType: "capital_partner_profile", resourceId: capitalPartnerId },
      profile: { capitalPartnerId, displayName: "Synthetic Partner" },
      fundsAuthority: false,
      serverTruth: true,
      readOnly: true,
      schemaVersion: "tenant_capital_partner_self_view.v1"
    },
    passportInbox(
      offerA.creditPassportArtifactId,
      offerA.creditPassportArtifactHash,
      offerA.creditIntentId,
      times[1]
    ),
    {
      offer: offerA,
      capitalPartner: { capitalPartnerId, displayName: "Synthetic Partner" },
      fundsAuthority: false,
      schemaVersion: "tenant_capital_partner_offer_authored.v1"
    },
    { status: 404, code: "authorization_denied", requestId: "request-cp-denial-a", schemaVersion: "problem_details.v1" },
    workspace(offerA, offerA.creditIntentId, offerA.riskDecisionId),
    passportInbox(
      offerBAuthored.creditPassportArtifactId,
      offerBAuthored.creditPassportArtifactHash,
      offerBAuthored.creditIntentId,
      times[5]
    ),
    {
      offer: offerBAuthored,
      capitalPartner: { capitalPartnerId, displayName: "Synthetic Partner" },
      fundsAuthority: false,
      schemaVersion: "tenant_capital_partner_offer_authored.v1"
    },
    { offer: offerBWithdrawn, schemaVersion: "tenant_capital_partner_offer_transitioned.v1" },
    { status: 404, code: "authorization_denied", requestId: "request-cp-denial-b", schemaVersion: "problem_details.v1" },
    workspace(offerA, offerA.creditIntentId, offerA.riskDecisionId)
  ];
  const operationRows = [
    ["capital_partner", "pilotReadCapitalPartnerSelf", "tenant_capital_partner_self_view.v1"],
    ["capital_partner", "pilotReadCapitalPartnerPassportInbox", "tenant_capital_partner_passport_inbox_view.v1"],
    ["capital_partner", "pilotAuthorCapitalPartnerOffer", "tenant_capital_partner_offer_authored.v1"],
    ["human", "pilotAcceptCreditOffer", "problem_details.v1"],
    ["human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2"],
    ["capital_partner", "pilotReadCapitalPartnerPassportInbox", "tenant_capital_partner_passport_inbox_view.v1"],
    ["capital_partner", "pilotAuthorCapitalPartnerOffer", "tenant_capital_partner_offer_authored.v1"],
    ["capital_partner", "pilotTransitionCapitalPartnerOffer", "tenant_capital_partner_offer_transitioned.v1"],
    ["human", "pilotAcceptCreditOffer", "problem_details.v1"],
    ["human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2"]
  ];
  const denialTargetByIndex = new Map([
    [3, "credit_offer_cp_preliminary_a"],
    [8, offerBAuthored.creditOfferId]
  ]);
  const denialRequestProjection = (index) => {
    const resourceId = denialTargetByIndex.get(index);
    const requestId = index === 3
      ? "request-cp-denial-a"
      : "request-cp-denial-b";
    return {
      operationId: "pilotAcceptCreditOffer",
      resource: { resourceType: "credit_offer", resourceId },
      payload: {
        expectedOfferHash: HASH,
        expectedTermsHash: OTHER_HASH,
        acknowledgementHash: `0x${"3".repeat(64)}`,
        actionConfirmation: {
          actionType: "accept_offer",
          resourceId,
          resourceHash: HASH,
          payloadHash: `0x${"4".repeat(64)}`,
          requestId,
          requestNonce: `human_action_confirmation_01234567-89ab-4def-8123-456789abc${index === 3 ? "dea" : "deb"}`,
          requestedAt: times[index],
          confirmedAt: times[index],
          expiresAt: new Date(Date.parse(times[index]) + 300_000).toISOString(),
          confirmationMethod: "wallet_personal_sign",
          confirmationHash: `0x${"5".repeat(64)}`,
          messageHash: `0x${"6".repeat(64)}`,
          rawSignaturePersisted: false,
          blockchainTransactionSubmitted: false,
          schemaVersion: "economic_action_confirmation_result.v1"
        }
      },
      requestId,
      correlationId: `correlation-cp-producer-${index + 1}`,
      idempotencyKey: `idempotency-cp-denial-${index + 1}`,
      schemaVersion: "tenant_protocol_request.v1"
    };
  };
  const capture = {
    schemaVersion: "m1_b_capital_partner_response_capture.v1",
    candidateReleaseId: SHA,
    capturedAt: new Date(Date.parse(times[9]) + 1_000).toISOString(),
    databaseStartedAt: START,
    role: "capital_partner",
    responses: operationRows.map(([actorRole, operationId, responseSchemaVersion], index) => {
      const requestProjection = denialTargetByIndex.has(index)
        ? denialRequestProjection(index)
        : null;
      return {
        sequence: index + 1,
        actorRole,
        operationId,
        requestId: index === 3
          ? "request-cp-denial-a"
          : index === 8
            ? "request-cp-denial-b"
            : `request-cp-producer-${index + 1}`,
        correlationId: `correlation-cp-producer-${index + 1}`,
        responseSchemaVersion,
        ...(!requestProjection ? {
          armIssuedAt: new Date(Date.parse(times[index]) - 1_000).toISOString(),
          armClockDomain: "lima_exact_pilot_vm_system_clock"
        } : {}),
        capturedAt: times[index],
        ...(requestProjection ? {
          requestProjection,
          requestProjectionHash: hashM1BAcceptanceManifest(requestProjection)
        } : {}),
        response: rawResponses[index]
      };
    })
  };
  const safeProblem = (index) => ({
    status: 404,
    code: "authorization_denied",
    requestId: capture.responses[index].requestId,
    schemaVersion: "problem_details.v1"
  });
  const denial = (index, offerId) => ({
    creditOfferId: offerId,
    requestId: capture.responses[index].requestId,
    correlationId: capture.responses[index].correlationId,
    outwardResponse: {
      capturedAt: times[index],
      requestProjection: capture.responses[index].requestProjection,
      requestProjectionHash: capture.responses[index].requestProjectionHash,
      responseProjection: safeProblem(index),
      responseHash: hashM1BAcceptanceManifest(safeProblem(index))
    },
    authorizationAudit: { eventId: `authorization_denial_${index}` }
  });
  const denialProofs = [
    denial(3, "credit_offer_cp_preliminary_a"),
    denial(8, offerBAuthored.creditOfferId)
  ];
  const actorHash = (actorId) => hashId("m1_b_acceptance_actor_reference", { actorId });
  const queryProofs = new Map();
  for (const index of [0, 1, 4, 5, 9]) {
    const actorId = new Set([0, 1, 5]).has(index)
      ? capitalPartnerActorId
      : borrowerActorId;
    const safe = projectM1BSafeResponse(
      capture.responses[index].operationId,
      capture.responses[index].responseSchemaVersion,
      capture.responses[index].response
    );
    queryProofs.set(capture.responses[index].requestId, {
      operationId: capture.responses[index].operationId,
      requestId: capture.responses[index].requestId,
      correlationId: capture.responses[index].correlationId,
      responseSchemaVersion: capture.responses[index].responseSchemaVersion,
      responseProjection: createM1BQueryResponseProjection(
        capture.responses[index].operationId,
        safe
      ),
      occurredAt: times[index],
      authorizationAudits: [1, 2].map((sequence) => ({
        eventId: `authorization_query_${index}_${sequence}`,
        actorRefHash: actorHash(actorId),
        occurredAt: times[index]
      }))
    });
  }
  const event = ({ id, type, aggregateId, version, payload, time }) => ({
    sequence: 0,
    eventId: id,
    eventType: type,
    aggregateType: "credit_offer",
    aggregateId,
    aggregateVersion: version,
    payloadHash: hashId("event_payload", payload),
    payloadProjection: payload,
    evidenceId: id,
    evidenceHash: HASH,
    evidencePayloadHash: hashId("event_payload", payload),
    sourceFinality: "finalized",
    causationId: payload.causationId,
    correlationId: payload.correlationId,
    occurredAt: time
  });
  const commandProof = (index, preliminaryId, exactOffer, withdrawn = false) => {
    const entry = capture.responses[index];
    if (withdrawn) {
      const payload = {
        creditOfferId: exactOffer.creditOfferId,
        previousStatus: "offered",
        nextStatus: "withdrawn",
        capitalPartnerRefHash: HASH,
        operatorRefHash: OTHER_HASH,
        sandboxOnly: true,
        productionFundsApproved: false,
        causationId: entry.requestId,
        correlationId: entry.correlationId
      };
      const exactEvent = event({
        id: "event_cp_withdraw_b",
        type: "credit_offer_status_changed",
        aggregateId: exactOffer.creditOfferId,
        version: 2,
        payload,
        time: times[index]
      });
      return {
        operationId: entry.operationId,
        requestId: entry.requestId,
        correlationId: entry.correlationId,
        resourceType: "credit_offer",
        resourceId: exactOffer.creditOfferId,
        actorRefHash: actorHash(capitalPartnerActorId),
        authorizationAuditEventId: `authorization_command_${index}_2`,
        authorizationAudits: [1, 2].map((sequence) => ({
          eventId: `authorization_command_${index}_${sequence}`,
          occurredAt: times[index]
        })),
        businessEventId: exactEvent.eventId,
        occurredAt: times[index],
        completedAt: times[index],
        capturedAt: times[index],
        eventManifest: [exactEvent]
      };
    }
    const replacementPayload = {
      creditOfferId: preliminaryId,
      previousStatus: "offered",
      nextStatus: "declined",
      replacementOfferId: exactOffer.creditOfferId,
      reasonCode: "capital_partner_offer_authored",
      sandboxOnly: true,
      productionFundsApproved: false,
      causationId: entry.requestId,
      correlationId: entry.correlationId
    };
    const createdPayload = {
      creditOfferId: exactOffer.creditOfferId,
      creditOfferHash: exactOffer.creditOfferHash,
      termsHash: exactOffer.termsHash,
      creditIntentId: exactOffer.creditIntentId,
      riskDecisionId: exactOffer.riskDecisionId,
      capitalPartnerRefHash: HASH,
      operatorRefHash: OTHER_HASH,
      creditPassportArtifactHash: exactOffer.creditPassportArtifactHash,
      passportVerificationHash: exactOffer.passportVerificationHash,
      underwritingSnapshotHash: exactOffer.underwritingSnapshotHash,
      status: "offered",
      validUntil: exactOffer.validUntil,
      sandboxOnly: true,
      productionFundsApproved: false,
      causationId: entry.requestId,
      correlationId: entry.correlationId
    };
    const replacementEvent = event({
      id: `event_cp_replace_${index}`,
      type: "credit_offer_status_changed",
      aggregateId: preliminaryId,
      version: 2,
      payload: replacementPayload,
      time: times[index]
    });
    const createdEvent = {
      ...event({
        id: `event_cp_create_${index}`,
        type: "credit_offer_created",
        aggregateId: exactOffer.creditOfferId,
        version: 1,
        payload: createdPayload,
        time: times[index]
      }),
      sequence: 1
    };
    return {
      operationId: entry.operationId,
      requestId: entry.requestId,
      correlationId: entry.correlationId,
      resourceType: "credit_passport_artifact",
      resourceId: exactOffer.creditPassportArtifactId,
      actorRefHash: actorHash(capitalPartnerActorId),
      authorizationAuditEventId: `authorization_command_${index}_2`,
      authorizationAudits: [1, 2].map((sequence) => ({
        eventId: `authorization_command_${index}_${sequence}`,
        occurredAt: times[index]
      })),
      businessEventId: replacementEvent.eventId,
      occurredAt: times[index],
      completedAt: times[index],
      capturedAt: times[index],
      eventManifest: [replacementEvent, createdEvent]
    };
  };
  const commandProofs = new Map([
    [capture.responses[2].requestId, commandProof(2, "credit_offer_cp_preliminary_a", offerA)],
    [capture.responses[6].requestId, commandProof(6, "credit_offer_cp_preliminary_b", offerBAuthored)],
    [capture.responses[7].requestId, commandProof(7, null, offerBWithdrawn, true)]
  ]);
  const projection = (id, version, sourceEventId, digit) => ({
    entityType: "credit_offer",
    entityId: id,
    entityHash: `0x${digit.repeat(64)}`,
    rootAggregateType: "credit_offer",
    rootAggregateId: id,
    aggregateVersion: version,
    sourceEventId,
    sourceEvidenceHash: HASH,
    sourceFinality: "finalized"
  });
  const offerRows = new Map([
    ["credit_offer_cp_preliminary_a", {
      offer: { creditOfferId: "credit_offer_cp_preliminary_a", creditOfferHash: HASH, termsHash: OTHER_HASH, schemaVersion: "credit_offer.v1", aggregateVersion: 2, status: "declined" },
      projection: projection("credit_offer_cp_preliminary_a", 2, "event_cp_replace_2", "3")
    }],
    [offerA.creditOfferId, { offer: { creditOfferId: offerA.creditOfferId, creditOfferHash: offerA.creditOfferHash, termsHash: offerA.termsHash, schemaVersion: "credit_offer.v2", aggregateVersion: 1, status: "offered" }, projection: projection(offerA.creditOfferId, 1, "event_cp_create_2", "4") }],
    ["credit_offer_cp_preliminary_b", {
      offer: { creditOfferId: "credit_offer_cp_preliminary_b", creditOfferHash: `0x${"7".repeat(64)}`, termsHash: `0x${"8".repeat(64)}`, schemaVersion: "credit_offer.v1", aggregateVersion: 2, status: "declined" },
      projection: projection("credit_offer_cp_preliminary_b", 2, "event_cp_replace_6", "7")
    }],
    [offerBAuthored.creditOfferId, { offer: { creditOfferId: offerBAuthored.creditOfferId, creditOfferHash: offerBAuthored.creditOfferHash, termsHash: offerBAuthored.termsHash, schemaVersion: "credit_offer.v2", aggregateVersion: 2, status: "withdrawn" }, projection: projection(offerBAuthored.creditOfferId, 2, "event_cp_withdraw_b", "8") }]
  ]);
  const passportProof = (artifactId, exactOffer, inboxQueryProof) => ({
    artifactId,
    artifactHash: exactOffer.creditPassportArtifactHash,
    artifactVersion: 1,
    creditIntentId: exactOffer.creditIntentId,
    bindingActorRefHash: actorHash(capitalPartnerActorId),
    inboxQueryProof
  });
  const dependencies = {
    authorizationResourceLocator: async (_client, input) => ({
      resourceType: input.operationId === "pilotTransitionCapitalPartnerOffer"
        ? "credit_offer"
        : input.operationId === "pilotAuthorCapitalPartnerOffer"
          ? "credit_passport_artifact"
          : "workspace",
      resourceId: input.operationId === "pilotTransitionCapitalPartnerOffer"
        ? offerBAuthored.creditOfferId
        : input.operationId === "pilotAuthorCapitalPartnerOffer"
          ? commandProofs.get(input.requestId).resourceId
          : "workspace_candidate"
    }),
    queryProof: async (_client, input) => queryProofs.get(input.requestId),
    commandProof: async (_client, input) => commandProofs.get(input.requestId),
    profile: async () => ({
      resource_status: "active",
      resource_version: 1,
      binding_status: "active",
      binding_version: 1,
      binding_relationship: "owner"
    }),
    passport: async (_client, input) => passportProof(
      input.artifactId,
      input.artifactId === offerA.creditPassportArtifactId ? offerA : offerBAuthored,
      input.inboxQueryProof
    ),
    offer: async (_client, input) => offerRows.get(input.creditOfferId),
    projectionSourceEventId: async (_client, input) =>
      input.entityId.endsWith("_a") ? "event_cp_preliminary_a" : "event_cp_preliminary_b",
    projectionProof: async (_client, input) => projection(
      input.entityId,
      1,
      input.sourceEventId,
      input.entityId.endsWith("_a") ? "1" : "2"
    ),
    durableEvent: async (_client, input) => ({
      eventId: input.eventId,
      eventType: "credit_offer_created",
      aggregateType: "credit_offer",
      aggregateId: input.eventId.endsWith("_a")
        ? "credit_offer_cp_preliminary_a"
        : "credit_offer_cp_preliminary_b",
      aggregateVersion: 1,
      evidenceHash: HASH,
      sourceFinality: "finalized"
    }),
    safeAuthentication: async (_client, input) => ({
      actorRefHash: actorHash(input.actorId),
      clientRefHash: HASH,
      amr: ["wallet", "siwe", "eip191_eoa_v1"]
    }),
    preparation: async (_client, input) => ({
      subjectId: input.subjectId,
      consentId: input.creditIntentId.endsWith("_a")
        ? "consent_cp_a"
        : "consent_cp_b",
      creditIntentId: input.creditIntentId,
      riskDecisionId: input.riskDecisionId,
      preliminaryOfferId: input.preliminaryOfferId,
      passportArtifactId: input.passportArtifactId,
      commandReceipts: [0, 1, 2, 3].map((index) => ({
        authorizationAudits: [{ eventId: `authorization_preparation_${input.creditIntentId}_${index}` }]
      })),
      queryAuthorizationObservations: [0, 1].map((index) => ({
        authorizationAudits: [{ eventId: `authorization_preparation_query_${input.creditIntentId}_${index}` }]
      }))
    })
  };
  const receipt = await produceM1BCapitalPartnerFixtureReceiptForTest({
    client: {},
    tenantId,
    capitalPartnerActorId,
    borrowerActorId,
    candidateReleaseId: SHA,
    databaseStartedAt: START,
    capture,
    denialProofs,
    humanReceiptBinding: {
      schemaVersion: "m1_b_human_critical_receipt_binding.v1",
      candidateReleaseId: SHA,
      receiptHash: HASH,
      capturedAt: new Date(Date.parse(START) + 5_000).toISOString(),
      subjectId,
      actorRefHash: actorHash(borrowerActorId)
    },
    preparationMarkers: {
      schemaVersion: "m1_b_capital_partner_preparation_markers.v1",
      currentObservedAt: new Date(Date.parse(START) + 30_000).toISOString(),
      withdrawalObservedAt: new Date(Date.parse(times[4]) + 30_000).toISOString()
    },
    dependencies
  });
  assert.equal(receipt.currentLineage.authoredOffer.creditOfferId, offerA.creditOfferId);
  assert.equal(receipt.withdrawalLineage.authoredOffer.status, "withdrawn");
  assert.equal(
    receipt.withdrawalLineage.borrowerRecovery.creditOfferId,
    offerA.creditOfferId
  );
  assert.equal(receipt.durability.commandReceipts.length, 3);
  assert.equal(receipt.durability.fixtureUsed, true);
  assert.equal(receipt.authentication.borrower.amr[2], "eip191_eoa_v1");
  assert.equal(JSON.stringify(receipt).includes("displayName"), false);
  await assert.rejects(
    produceM1BCapitalPartnerCriticalReceipt({
      client: {},
      tenantId,
      capitalPartnerActorId,
      borrowerActorId,
      candidateReleaseId: SHA,
      databaseStartedAt: START,
      capture,
      denialProofs,
      dependencies
    }),
    (error) => error?.code === "capital_partner_dependency_override_forbidden"
  );
});

test("Human producer assembles the full EOA personal-sign lifecycle through its test-only reader seam", async () => {
  const tenantId = "tenant_local";
  const actorId = "actor_human_borrower_pilot";
  const subjectId = "subject_human_test";
  const consentId = "consent_human_test";
  const creditIntentId = "credit_intent_human_test";
  const riskDecisionId = "risk_decision_human_test";
  const creditOfferId = "credit_offer_human_test";
  const acceptanceId = "credit_offer_acceptance_human_test";
  const obligationId = "obligation_human_test";
  const executionReceiptId = "sandbox_execution_receipt_human_test";
  const repaymentId = "repayment_human_test";
  const principalLedgerTransactionId = "ledger_transaction_human_principal";
  const repaymentLedgerTransactionId = "ledger_transaction_human_repayment";
  const correlationId = "correlation-human-producer";
  const assetId = "eip155:84532/erc20:0x0000000000000000000000000000000000000001";
  const operationTimes = Array.from({ length: 5 }, (_, index) =>
    new Date(Date.parse(START) + ((index + 1) * 60_000)).toISOString()
  );
  const economicRows = humanEconomicRows({
    executionTime: operationTimes[2],
    repaymentTime: operationTimes[3]
  });
  const requestIds = operationTimes.map((_, index) =>
    `request-human-producer-${index + 1}`
  );
  const offerHash = `0x${"2".repeat(64)}`;
  const termsHash = `0x${"3".repeat(64)}`;
  const obligationHash = economicRows.obligation.obligation_hash;
  const executionReceiptHash = HASH;
  const repaymentHash = `0x${"4".repeat(64)}`;
  const offer = {
    creditOfferId,
    creditOfferHash: offerHash,
    termsHash,
    creditIntentId,
    subjectId,
    riskDecisionId,
    assetId,
    approvedPrincipalMinor: "1000000",
    annualRateBps: 0,
    originationFeeMinor: "0",
    repaymentFrequency: "end_of_term",
    installmentCount: 1,
    firstPaymentAt: "2026-09-14T01:00:00.000Z",
    maturityAt: "2026-09-14T01:00:00.000Z",
    status: "offered",
    validUntil: "2026-08-15T00:00:00.000Z",
    sandboxOnly: true,
    productionFundsApproved: false,
    schemaVersion: "credit_offer.v1"
  };
  const obligation = (status, executionStatus, receiptId) => ({
    obligationId,
    obligationHash,
    subjectId,
    principalId: "principal_human_test",
    creditIntentId,
    riskDecisionId,
    creditOfferId,
    creditOfferAcceptanceId: acceptanceId,
    authorityType: "consent",
    authorityId: consentId,
    assetId,
    scheduleHash: `0x${"7".repeat(64)}`,
    scheduleSequence: 1,
    executionStatus,
    ...(receiptId ? { sandboxExecutionReceiptId: receiptId } : {}),
    status,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: "obligation.v2"
  });
  const actionConfirmation = (actionType, requestId, digit, confirmedAt) => ({
    actionType,
    confirmationMethod: "wallet_personal_sign",
    confirmationHash: `0x${digit.repeat(64)}`,
    messageHash: `0x${String(Number(digit) + 1).repeat(64)}`,
    resourceHash: `0x${String(Number(digit) + 2).repeat(64)}`,
    payloadHash: `0x${String(Number(digit) + 3).repeat(64)}`,
    requestId,
    confirmedAt,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: "economic_action_confirmation_result.v1"
  });
  const acceptanceAction = actionConfirmation(
    "accept_offer",
    requestIds[1],
    "1",
    operationTimes[1]
  );
  const executionAction = actionConfirmation(
    "execute_obligation",
    requestIds[2],
    "2",
    operationTimes[2]
  );
  const repaymentAction = actionConfirmation(
    "post_repayment",
    requestIds[3],
    "3",
    operationTimes[3]
  );
  const humanActorHash = hashId("actor", actorId);
  const humanActorRefHash = hashId("m1_b_acceptance_actor_reference", { actorId });
  const principalTransaction = economicRows.transactions.find(
    ({ id }) => id === principalLedgerTransactionId
  );
  const repaymentTransaction = economicRows.transactions.find(
    ({ id }) => id === repaymentLedgerTransactionId
  );
  const lifecycleEvent = ({
    sequence,
    eventId,
    eventType,
    aggregateType,
    aggregateId,
    aggregateVersion,
    requestId,
    occurredAt,
    payloadProjection
  }) => {
    const payloadHash = hashId(
      "event_payload",
      payloadProjection ?? { eventId, eventType, opaque: true }
    );
    return {
      sequence,
      eventId,
      eventType,
      aggregateType,
      aggregateId,
      aggregateVersion,
      payloadHash,
      ...(payloadProjection === undefined ? {} : { payloadProjection }),
      evidenceId: eventId,
      evidenceHash: hashId("evidence", eventId),
      evidencePayloadHash: payloadHash,
      sourceFinality: "finalized",
      causationId: requestId,
      correlationId,
      occurredAt
    };
  };
  const eventSpecs = [
    [
      "pilotAcceptCreditOffer",
      requestIds[1],
      operationTimes[1],
      [
        ["event_human_acceptance_test", "credit_offer_acceptance_recorded", "credit_offer_acceptance", acceptanceId, 1, acceptanceAction],
        ["event_human_offer_accepted_test", "credit_offer_accepted", "credit_offer", creditOfferId, 2, acceptanceAction],
        ["event_human_obligation_test", "obligation_created", "obligation", obligationId, 1, acceptanceAction]
      ]
    ],
    [
      "pilotExecuteSandboxObligation",
      requestIds[2],
      operationTimes[2],
      [
        ["event_human_accounts_test", "ledger_account_opened", "obligation", obligationId, 2, null],
        ["event_human_execution_ledger_test", "ledger_transaction_posted", "obligation", obligationId, 3, null],
        ["event_human_execution_test", "obligation_sandbox_executed", "obligation", obligationId, 4, executionAction]
      ]
    ],
    [
      "pilotPostSandboxRepayment",
      requestIds[3],
      operationTimes[3],
      [
        ["event_human_repayment_ledger_test", "ledger_transaction_posted", "obligation", obligationId, 5, null],
        ["event_human_repayment_test", "repayment_posted", "obligation", obligationId, 6, repaymentAction]
      ]
    ]
  ];
  const eventManifests = new Map(eventSpecs.map(([
    operationId,
    requestId,
    occurredAt,
    specs
  ]) => [operationId, specs.map(([
    eventId,
    eventType,
    aggregateType,
    aggregateId,
    aggregateVersion,
    confirmation
  ], sequence) => {
    const payloadProjection = {
      credit_offer_acceptance_recorded: {
        creditOfferAcceptanceId: acceptanceId,
        acceptanceHash: `0x${"1".repeat(64)}`,
        creditOfferId,
        creditOfferHash: offerHash,
        termsHash,
        acknowledgementHash: OTHER_HASH,
        authorityType: "consent",
        authorityRef: consentId,
        actorHash: humanActorHash,
        actionConfirmation: confirmation,
        sandboxOnly: true,
        productionAuthority: false,
        causationId: requestId,
        correlationId
      },
      credit_offer_accepted: {
        creditOfferId,
        creditOfferAcceptanceId: acceptanceId,
        previousStatus: "offered",
        nextStatus: "accepted",
        actorHash: humanActorHash,
        actionConfirmation: confirmation,
        causationId: requestId,
        correlationId
      },
      obligation_created: {
        obligationId,
        obligationHash,
        creditIntentId,
        riskDecisionId,
        creditOfferId,
        creditOfferAcceptanceId: acceptanceId,
        authorityType: "consent",
        authorityRef: consentId,
        assetId,
        originalPrincipalMinor: "1000000",
        scheduleHash: economicRows.obligation.schedule_hash,
        executionStatus: "pending",
        sandboxOnly: true,
        productionFundsMoved: false,
        actorHash: humanActorHash,
        actionConfirmation: confirmation,
        causationId: requestId,
        correlationId
      },
      ledger_transaction_posted: operationId === "pilotExecuteSandboxObligation"
        ? {
            ledgerTransactionId: principalLedgerTransactionId,
            transactionHash: principalTransaction.transaction_hash,
            transactionType: "sandbox_credit_execution",
            assetId,
            debitTotalMinor: "1000000",
            creditTotalMinor: "1000000",
            entryCount: 2,
            actorId,
            causationId: requestId,
            correlationId,
            sandboxOnly: true,
            productionFundsMoved: false
          }
        : {
            ledgerTransactionId: repaymentLedgerTransactionId,
            transactionHash: repaymentTransaction.transaction_hash,
            transactionType: "sandbox_repayment",
            assetId,
            debitTotalMinor: "1000000",
            creditTotalMinor: "1000000",
            entryCount: 2,
            actorId,
            causationId: requestId,
            correlationId,
            sandboxOnly: true,
            productionFundsMoved: false
          },
      obligation_sandbox_executed: {
        obligationId,
        sandboxExecutionReceiptId: executionReceiptId,
        receiptHash: executionReceiptHash,
        principalLedgerTransactionId,
        previousStatus: "created",
        nextStatus: "active",
        previousExecutionStatus: "pending",
        nextExecutionStatus: "executed",
        actorId,
        causationId: requestId,
        correlationId,
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false,
        actionConfirmation: confirmation
      },
      repayment_posted: {
        repaymentId,
        repaymentHash,
        obligationId,
        requestedMinor: "1000000",
        appliedMinor: "1000000",
        appliedFeeMinor: "0",
        appliedInterestMinor: "0",
        appliedPrincipalMinor: "1000000",
        surplusMinor: "0",
        previousStatus: "active",
        nextStatus: "fully_repaid",
        actorId,
        causationId: requestId,
        correlationId,
        sandboxOnly: true,
        productionFundsMoved: false,
        actionConfirmation: confirmation
      }
    }[eventType];
    return lifecycleEvent({
      sequence,
      eventId,
      eventType,
      aggregateType,
      aggregateId,
      aggregateVersion,
      requestId,
      occurredAt,
      payloadProjection
    });
  })]));
  const evidenceEvents = [...eventManifests.values()].flat();
  const evidenceItems = evidenceEvents.map((event) => ({
    evidenceId: event.eventId,
    evidenceHash: event.evidenceHash,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    aggregateVersion: event.aggregateVersion,
    obligationId,
    sourceFinality: event.sourceFinality,
    payloadHash: event.payloadHash,
    occurredAt: event.occurredAt,
    recordedAt: event.occurredAt,
    schemaVersion: "evidence_event.v2"
  }));
  const rawResponses = [
    {
      workspaceKind: "human_borrower",
      humanOfferReview: {
        subjectId,
        consentId,
        creditIntent: { creditIntentId },
        decision: { riskDecisionId },
        offer,
        offerSchemaVersion: "credit_offer.v1",
        offerAggregateVersion: 1,
        serverTruth: true,
        nonAuthorizing: true,
        sandboxOnly: true,
        productionFundsApproved: false,
        fundsAuthority: false,
        schemaVersion: "human_offer_review_recovery.v1"
      },
      hasMore: false,
      serverTruth: true,
      schemaVersion: "tenant_workspace_resume_view.v2"
    },
    {
      acceptance: {
        creditOfferAcceptanceId: acceptanceId,
        acceptanceHash: `0x${"1".repeat(64)}`,
        creditOfferId,
        creditOfferHash: offerHash,
        termsHash,
        creditIntentId,
        riskDecisionId,
        subjectId,
        principalId: "principal_human_test",
        authorityType: "consent",
        authorityId: consentId,
        acknowledgementHash: OTHER_HASH,
        acceptedAt: operationTimes[1],
        sandboxOnly: true,
        productionAuthority: false
      },
      obligation: obligation("created", "pending"),
      offerStatus: "accepted",
      executionCreated: false,
      fundsAuthority: false,
      schemaVersion: "tenant_credit_offer_accepted.v1"
    },
    {
      obligation: obligation("active", "executed", executionReceiptId),
      executionReceipt: {
        sandboxExecutionReceiptId: executionReceiptId,
        receiptHash: executionReceiptHash,
        obligationId,
        assetId,
        amountMinor: "1000000",
        adapterId: "signed_non_redeemable",
        adapterVersion: "signed_non_redeemable.v1",
        adapterKeyId: OTHER_HASH,
        adapterMessageHash: `0x${"3".repeat(64)}`,
        executedAt: operationTimes[2],
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false,
        schemaVersion: "sandbox_execution_receipt.v1"
      },
      principalLedgerTransactionId,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_sandbox_obligation_executed.v1"
    },
    {
      obligation: obligation("fully_repaid", "executed", executionReceiptId),
      repayment: {
        repaymentId,
        repaymentHash,
        obligationId,
        subjectId,
        ledgerTransactionId: repaymentLedgerTransactionId,
        interestLedgerTransactionId: null,
        occurredAt: operationTimes[3],
        sandboxOnly: true,
        productionFundsMoved: false,
        schemaVersion: "repayment.v2"
      },
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_sandbox_repayment_posted.v1"
    },
    {
      obligationId,
      asOf: operationTimes[4],
      items: evidenceItems,
      hasMore: false,
      nextCursor: null,
      schemaVersion: "tenant_owned_obligation_evidence_view.v1"
    }
  ];
  const operationRows = [
    ["pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2"],
    ["pilotAcceptCreditOffer", "tenant_credit_offer_accepted.v1"],
    ["pilotExecuteSandboxObligation", "tenant_sandbox_obligation_executed.v1"],
    ["pilotPostSandboxRepayment", "tenant_sandbox_repayment_posted.v1"],
    ["pilotReadOwnObligationEvidence", "tenant_owned_obligation_evidence_view.v1"]
  ];
  const capture = {
    schemaVersion: "m1_b_human_response_capture.v1",
    candidateReleaseId: SHA,
    capturedAt: new Date(Date.parse(operationTimes[4]) + 1_000).toISOString(),
    databaseStartedAt: START,
    role: "human",
    responses: operationRows.map(([operationId, responseSchemaVersion], index) => ({
      sequence: index + 1,
      actorRole: "human",
      operationId,
      requestId: requestIds[index],
      correlationId,
      responseSchemaVersion,
      armIssuedAt: new Date(Date.parse(operationTimes[index]) - 1_000).toISOString(),
      armClockDomain: "lima_exact_pilot_vm_system_clock",
      capturedAt: operationTimes[index],
      response: rawResponses[index]
    }))
  };
  const economicResults = [
    { rowCount: 1, rows: [economicRows.execution] },
    { rowCount: 1, rows: [economicRows.repayment] },
    { rowCount: 1, rows: [{ repayment_row_count: 1, repayment_posted_event_count: 1 }] },
    { rowCount: 1, rows: [economicRows.obligation] },
    { rowCount: economicRows.installments.length, rows: economicRows.installments },
    { rowCount: economicRows.transactions.length, rows: economicRows.transactions },
    { rowCount: economicRows.entries.length, rows: economicRows.entries }
  ];
  const economicReadBack = await readM1BHumanEconomicReadBack({
    query: async () => economicResults.shift()
  }, {
    actorId,
    obligationId,
    subjectId,
    sandboxExecutionReceiptId: executionReceiptId,
    repaymentId,
    principalLedgerTransactionId,
    repaymentLedgerTransactionId
  });
  const identitySource = {
    role: "human_identity_reference",
    entityType: "human_identity_reference",
    entityIdHash: hashId("risk_source_entity", {
      entityType: "human_identity_reference",
      entityId: "identity_reference_human_test"
    }),
    aggregateVersion: 1,
    entityHash: `0x${"a".repeat(64)}`,
    evidenceHash: `0x${"b".repeat(64)}`,
    sourceFinality: "finalized"
  };
  const snapshotCore = {
    subjectId,
    asOf: "2026-08-13T23:00:00.000Z",
    sourceEvidence: [identitySource]
  };
  const featureSnapshotHash = hashId("risk_feature_snapshot", snapshotCore);
  const policyVersion = "wallet_private_pilot.v1";
  const authorizationAudit = ({
    operationId,
    requestId,
    resourceType,
    resourceId,
    occurredAt,
    suffix,
    sequence
  }) => ({
    eventId: `authorization_${suffix}_${sequence}`,
    operationId,
    requestId,
    correlationId,
    resourceType,
    resourceId,
    authorizationDecision: "allow",
    authorizationDecisionId: `authorization_decision_${suffix}_${sequence}`,
    actorRefHash: humanActorRefHash,
    policyVersion,
    reasonCode: "authorization_allowed",
    occurredAt
  });
  const completeCommandReceipt = ({
    operationId,
    requestId,
    resourceType,
    resourceId,
    occurredAt,
    suffix,
    eventManifest,
    responseSchemaVersion,
    responseProjection
  }) => {
    const authorizationAudits = [1, 2].map((sequence) => authorizationAudit({
      operationId,
      requestId,
      resourceType,
      resourceId,
      occurredAt,
      suffix,
      sequence
    }));
    return {
      operationId,
      requestId,
      correlationId,
      resourceType,
      resourceId,
      authorizationAuditEventId: authorizationAudits[1].eventId,
      authorizationDecisionId: authorizationAudits[1].authorizationDecisionId,
      authorizationDecision: "allow",
      actorRefHash: humanActorRefHash,
      policyVersion,
      authorizationReasonCode: "authorization_allowed",
      authorizationAudits,
      commandHash: hashId("m1_b_test_command", { operationId, requestId }),
      responseHash: hashId("command_response", responseProjection),
      responseSchemaVersion,
      responseProjection,
      capturedResponseHashVerified: true,
      capturedAt: occurredAt,
      businessEventId: eventManifest[0].eventId,
      occurredAt,
      completedAt: occurredAt,
      eventManifest
    };
  };
  const identityProjection = {
    entityType: "human_identity_reference",
    entityId: "identity_reference_human_test",
    entityHash: identitySource.entityHash,
    rootAggregateType: "human_identity_reference",
    rootAggregateId: "identity_reference_human_test",
    aggregateVersion: 1,
    sourceEventId: "event_human_identity_test",
    sourceEvidenceHash: identitySource.evidenceHash,
    sourceFinality: "finalized"
  };
  const retainedAt = "2026-08-13T23:30:00.000Z";
  const originEvent = ({
    sequence,
    eventId,
    eventType,
    aggregateType,
    aggregateId,
    aggregateVersion,
    requestId
  }) => lifecycleEvent({
    sequence,
    eventId,
    eventType,
    aggregateType,
    aggregateId,
    aggregateVersion,
    requestId,
    occurredAt: retainedAt,
    payloadProjection: { retainedOrigin: true }
  });
  const originSpecs = [
    ["pilotCreateHumanSubject", "subject", subjectId, [
      ["event_human_origin_subject_test", "subject_created", "subject", subjectId, 1]
    ]],
    ["pilotCreateConsent", "subject", subjectId, [
      ["event_human_origin_consent_test", "consent_recorded", "consent", consentId, 1]
    ]],
    ["pilotRequestCredit", "subject", subjectId, [
      ["event_human_origin_intent_test", "credit_intent_created", "credit_intent", creditIntentId, 1]
    ]],
    ["pilotEvaluateCreditApplication", "credit_intent", creditIntentId, [
      ["event_human_origin_intent_status_test", "credit_intent_status_changed", "credit_intent", creditIntentId, 2],
      ["event_human_origin_decision_test", "risk_decision_created", "risk_decision", riskDecisionId, 1],
      ["event_human_origin_offer_test", "credit_offer_created", "credit_offer", creditOfferId, 1]
    ]]
  ];
  const originCommandReceipts = originSpecs.map(([
    operationId,
    resourceType,
    resourceId,
    events
  ], index) => {
    const requestId = `request-human-origin-${index + 1}`;
    const eventManifest = events.map(([
      eventId,
      eventType,
      aggregateType,
      aggregateId,
      aggregateVersion
    ], sequence) => originEvent({
      sequence,
      eventId,
      eventType,
      aggregateType,
      aggregateId,
      aggregateVersion,
      requestId
    }));
    return completeCommandReceipt({
      operationId,
      requestId,
      resourceType,
      resourceId,
      occurredAt: retainedAt,
      suffix: `human_origin_${index + 1}`,
      eventManifest,
      responseSchemaVersion: "tenant_human_origin_fixture.v1",
      responseProjection: { schemaVersion: "tenant_human_origin_fixture.v1" }
    });
  });
  const origin = {
    row: {
      decision_hash: `0x${"c".repeat(64)}`,
      risk_feature_snapshot_id: "risk_feature_snapshot_human_test",
      feature_snapshot_hash: featureSnapshotHash,
      risk_feature_snapshot: {
        riskFeatureSnapshotId: "risk_feature_snapshot_human_test",
        featureSnapshotHash,
        ...snapshotCore,
        schemaVersion: "risk_feature_snapshot.v1"
      },
      decision_passport_id: "risk_decision_passport_human_test",
      decision_passport_hash: `0x${"d".repeat(64)}`
    },
    identityRow: {
      id: "identity_reference_human_test",
      identity_reference_hash: identitySource.entityHash,
      reference_evidence_hash: identitySource.evidenceHash
    },
    identityProjection,
    identitySource,
    commandReceipts: originCommandReceipts
  };
  const queryProofs = new Map([0, 4].map((index) => {
    const entry = capture.responses[index];
    const safeResponse = projectM1BSafeResponse(
      entry.operationId,
      entry.responseSchemaVersion,
      entry.response
    );
    const responseProjection = createM1BQueryResponseProjection(
      entry.operationId,
      safeResponse
    );
    const resourceType = index === 0 ? "workspace" : "evidence";
    const resourceId = index === 0 ? "workspace_human_test" : obligationId;
    const authorizationAudits = [1, 2].map((sequence) => authorizationAudit({
      operationId: entry.operationId,
      requestId: entry.requestId,
      resourceType,
      resourceId,
      occurredAt: entry.capturedAt,
      suffix: `human_query_${index}`,
      sequence
    }));
    return [entry.requestId, {
      operationId: entry.operationId,
      requestId: entry.requestId,
      correlationId: entry.correlationId,
      responseSchemaVersion: entry.responseSchemaVersion,
      responseProvenance: "runtime_response_capture_db_reconciled",
      responseProjection,
      responseHash: hashM1BAcceptanceManifest(responseProjection),
      occurredAt: entry.capturedAt,
      authorizationAudits
    }];
  }));
  const commandProofs = new Map([1, 2, 3].map((index) => {
    const entry = capture.responses[index];
    const safeResponse = projectM1BSafeResponse(
      entry.operationId,
      entry.responseSchemaVersion,
      entry.response
    );
    const resourceType = index === 1 ? "credit_offer" : "obligation";
    const resourceId = index === 1 ? creditOfferId : obligationId;
    const eventManifest = eventManifests.get(entry.operationId);
    const responseProjection = createM1BCommandResponseProjection(
      entry.operationId,
      safeResponse
    );
    return [entry.requestId, completeCommandReceipt({
      operationId: entry.operationId,
      requestId: entry.requestId,
      resourceType,
      resourceId,
      occurredAt: entry.capturedAt,
      suffix: `human_command_${index}`,
      eventManifest,
      responseSchemaVersion: entry.responseSchemaVersion,
      responseProjection
    })];
  }));
  const identityEvent = {
    sequence: 0,
    eventId: identityProjection.sourceEventId,
    eventType: "identity_reference_recorded",
    aggregateType: "human_identity_reference",
    aggregateId: identityProjection.entityId,
    aggregateVersion: 1,
    payloadHash: hashId("event_payload", { identityReferenceRecorded: true }),
    evidenceId: identityProjection.sourceEventId,
    evidenceHash: identitySource.evidenceHash,
    evidencePayloadHash: hashId("event_payload", { identityReferenceRecorded: true }),
    sourceFinality: "finalized",
    causationId: "request-human-identity-retained",
    correlationId,
    occurredAt: retainedAt
  };
  const recoverySourceEvent = originCommandReceipts[3].eventManifest[2];
  const acceptedSourceEvent = eventManifests.get("pilotAcceptCreditOffer")[1];
  const obligationSourceEvent = eventManifests.get("pilotPostSandboxRepayment").at(-1);
  const projections = {
    recovery: {
      entityType: "credit_offer",
      entityId: creditOfferId,
      entityHash: offerHash,
      rootAggregateType: "credit_offer",
      rootAggregateId: creditOfferId,
      aggregateVersion: 1,
      sourceEventId: recoverySourceEvent.eventId,
      sourceEvidenceHash: recoverySourceEvent.evidenceHash,
      sourceFinality: "finalized"
    },
    accepted: {
      entityType: "credit_offer",
      entityId: creditOfferId,
      entityHash: offerHash,
      rootAggregateType: "credit_offer",
      rootAggregateId: creditOfferId,
      aggregateVersion: 2,
      sourceEventId: acceptedSourceEvent.eventId,
      sourceEvidenceHash: acceptedSourceEvent.evidenceHash,
      sourceFinality: "finalized"
    },
    obligation: {
      entityType: "obligation",
      entityId: obligationId,
      entityHash: obligationHash,
      rootAggregateType: "obligation",
      rootAggregateId: obligationId,
      aggregateVersion: 6,
      sourceEventId: obligationSourceEvent.eventId,
      sourceEvidenceHash: obligationSourceEvent.evidenceHash,
      sourceFinality: "finalized"
    }
  };
  const interactions = [];
  const dependencies = {
    origin: async (_client, input) => {
      interactions.push(["origin", input]);
      assert.equal(input.subjectId, subjectId);
      assert.equal(input.creditOfferId, creditOfferId);
      return origin;
    },
    authorizationResourceLocator: async (_client, input) => {
      interactions.push(["authorizationResourceLocator", input]);
      return {
        resourceType: input.operationId === "pilotAcceptCreditOffer"
          ? "credit_offer"
          : input.operationId === "pilotReadWorkspaceResume"
            ? "workspace"
            : input.operationId === "pilotReadOwnObligationEvidence"
              ? "evidence"
              : "obligation",
        resourceId: input.operationId === "pilotAcceptCreditOffer"
          ? creditOfferId
          : input.operationId === "pilotReadWorkspaceResume"
            ? "workspace_human_test"
            : obligationId
      };
    },
    queryProof: async (_client, input) => {
      interactions.push(["queryProof", input]);
      return queryProofs.get(input.requestId);
    },
    commandProof: async (_client, input) => {
      interactions.push(["commandProof", input]);
      return commandProofs.get(input.requestId);
    },
    projectionSourceEventId: async (_client, input) => {
      interactions.push(["projectionSourceEventId", input]);
      assert.equal(input.aggregateVersion, 1);
      return projections.recovery.sourceEventId;
    },
    projectionProof: async (_client, input) => {
      interactions.push(["projectionProof", input]);
      if (input.entityType === "obligation") return projections.obligation;
      return input.sourceEventId ? projections.recovery : projections.accepted;
    },
    economicReadBack: async (_client, input) => {
      interactions.push(["economicReadBack", input]);
      assert.equal(input.repaymentLedgerTransactionId, repaymentLedgerTransactionId);
      return economicReadBack;
    },
    durableEvent: async (_client, input) => {
      interactions.push(["durableEvent", input]);
      if (input.eventId === identityEvent.eventId) return identityEvent;
      return evidenceEvents.find(({ eventId }) => eventId === input.eventId);
    },
    evidenceCount: async (_client, input) => {
      interactions.push(["evidenceCount", input]);
      assert.equal(input.obligationId, obligationId);
      return evidenceEvents.length;
    },
    actorResourceScope: async (_client, input) => {
      interactions.push(["actorResourceScope", input]);
      assert.equal(input.resources.length, 6);
      return input.resources.map(([resourceType, resourceId]) => ({
        resourceType,
        resourceId,
        resourceStatus: "active",
        resourceVersion: 1,
        bindingRelationship: "owner",
        bindingStatus: "active",
        bindingVersion: 1,
        actorRefHash: hashId("m1_b_acceptance_actor_reference", { actorId })
      }));
    },
    safeAuthentication: async (_client, input) => {
      interactions.push(["safeAuthentication", input]);
      assert.equal(input.auditEventIds.length, 10);
      const coveredAuditEventIds = [...input.auditEventIds].sort();
      const coveredRequestIds = capture.responses.map(({ requestId }) => requestId).sort();
      return {
        method: "siwe",
        acr: "urn:ipo.one:acr:wallet",
        amr: ["wallet", "siwe", "eip191_eoa_v1"],
        actorRefHash: hashId("m1_b_acceptance_actor_reference", { actorId }),
        clientRefHash: HASH,
        coveredAuditEventIds,
        auditEventCount: coveredAuditEventIds.length,
        coveredRequestIds,
        requestCount: coveredRequestIds.length,
        earliestAuthTime: capture.responses[0].capturedAt,
        latestAuthTime: capture.responses.at(-1).capturedAt,
        activeCredentialBinding: true,
        activeMembershipBinding: true,
        credentialBindingCount: 1,
        invitationBoundCredentialRegistrationCount: 1,
        sessionMaterialIncluded: false,
        rawSignatureIncluded: false,
        walletAddressIncluded: false
      };
    }
  };
  const receipt = await produceM1BHumanFixtureReceiptForTest({
    client: {},
    tenantId,
    actorId,
    candidateReleaseId: SHA,
    databaseStartedAt: START,
    capture,
    dependencies
  });
  assert.equal(receipt.durability.fixtureUsed, true);
  assert.equal(receipt.authentication.amr[2], "eip191_eoa_v1");
  assert.equal(receipt.linkage.obligationId, obligationId);
  assert.equal(receipt.recovery.creditOfferId, creditOfferId);
  assert.equal(receipt.durability.evidenceCompleteness.databaseEvidenceCount, 8);
  assert.equal(receipt.durability.economicReadBack.obligation.status, "fully_repaid");
  const personalSignConfirmations = receipt.operations
    .filter(({ commandReceipt }) => commandReceipt)
    .map(({ commandReceipt }) => commandReceipt.eventManifest.find(
      ({ payloadProjection }) => payloadProjection?.actionConfirmation
    )?.payloadProjection?.actionConfirmation);
  assert.deepEqual(
    personalSignConfirmations.map(({ confirmationMethod }) => confirmationMethod),
    ["wallet_personal_sign", "wallet_personal_sign", "wallet_personal_sign"]
  );
  assert.equal(personalSignConfirmations.every((confirmation) => (
    confirmation.rawSignaturePersisted === false &&
    confirmation.blockchainTransactionSubmitted === false
  )), true);
  assert.deepEqual(
    Object.fromEntries([
      "origin",
      "authorizationResourceLocator",
      "queryProof",
      "commandProof",
      "projectionSourceEventId",
      "projectionProof",
      "economicReadBack",
      "durableEvent",
      "evidenceCount",
      "actorResourceScope",
      "safeAuthentication"
    ].map((name) => [
      name,
      interactions.filter(([interaction]) => interaction === name).length
    ])),
    {
      origin: 1,
      authorizationResourceLocator: 5,
      queryProof: 2,
      commandProof: 3,
      projectionSourceEventId: 1,
      projectionProof: 3,
      economicReadBack: 1,
      durableEvent: 9,
      evidenceCount: 1,
      actorResourceScope: 1,
      safeAuthentication: 1
    }
  );
  assert.equal(receipt.authentication.walletAddressIncluded, false);
  assert.equal(receipt.authentication.rawSignatureIncluded, false);
  assert.equal(receipt.redaction.containsWalletAddress, false);
  assert.equal(receipt.redaction.containsRawSignature, false);

  const releaseLinkage = {
    schemaVersion: "local_human_release_acceptance_linkage.v1",
    status: "passed",
    candidateReleaseId: SHA,
    databaseStartedAt: START,
    subjectId: receipt.linkage.subjectId,
    consentId: receipt.linkage.consentId,
    creditIntentId: receipt.linkage.creditIntentId,
    riskDecisionId: receipt.linkage.riskDecisionId,
    creditOfferId: receipt.linkage.creditOfferId,
    creditOfferHash: receipt.linkage.creditOfferHash,
    termsHash: receipt.linkage.termsHash,
    offerAggregateVersion: receipt.linkage.offerAggregateVersion,
    creditOfferAcceptanceId: receipt.linkage.creditOfferAcceptanceId,
    obligationId: receipt.linkage.obligationId,
    repaymentId: receipt.linkage.repaymentId,
    artifactId: "human_fixture"
  };
  assert.throws(
    () => verifyM1BHumanCriticalReceipt(receipt, {
      linkage: releaseLinkage,
      expectedCommitSha: SHA,
      expectedDatabaseStartedAt: START
    }),
    (error) => error?.issues?.some((issue) => issue.includes("Human critical receipt"))
  );
  const producerShapedLiveReceipt = structuredClone(receipt);
  producerShapedLiveReceipt.durability.fixtureUsed = false;
  assert.equal(
    verifyM1BHumanCriticalReceipt(producerShapedLiveReceipt, {
      linkage: releaseLinkage,
      expectedCommitSha: SHA,
      expectedDatabaseStartedAt: START
    }),
    true
  );

  const staleQueryDependencies = {
    ...dependencies,
    queryProof: async (_client, input) => {
      const proof = structuredClone(queryProofs.get(input.requestId));
      if (input.operationId === "pilotReadWorkspaceResume") {
        proof.authorizationAudits[0].occurredAt = new Date(
          Date.parse(capture.responses[0].armIssuedAt) - 1
        ).toISOString();
      }
      return proof;
    }
  };
  await assert.rejects(
    produceM1BHumanFixtureReceiptForTest({
      client: {},
      tenantId,
      actorId,
      candidateReleaseId: SHA,
      databaseStartedAt: START,
      capture,
      dependencies: staleQueryDependencies
    }),
    (error) => error?.code === "normal_response_chronology_invalid"
  );

  const staleCommandDependencies = {
    ...dependencies,
    commandProof: async (_client, input) => {
      const proof = structuredClone(commandProofs.get(input.requestId));
      if (input.operationId === "pilotAcceptCreditOffer") {
        proof.authorizationAudits[0].occurredAt = new Date(
          Date.parse(capture.responses[1].armIssuedAt) - 1
        ).toISOString();
      }
      return proof;
    }
  };
  await assert.rejects(
    produceM1BHumanFixtureReceiptForTest({
      client: {},
      tenantId,
      actorId,
      candidateReleaseId: SHA,
      databaseStartedAt: START,
      capture,
      dependencies: staleCommandDependencies
    }),
    (error) => error?.code === "normal_response_chronology_invalid"
  );

  const futureCommandDependencies = {
    ...dependencies,
    commandProof: async (_client, input) => {
      const proof = structuredClone(commandProofs.get(input.requestId));
      if (input.operationId === "pilotAcceptCreditOffer") {
        proof.authorizationAudits[0].occurredAt = new Date(
          Date.parse(capture.responses[1].capturedAt) + 1
        ).toISOString();
      }
      return proof;
    }
  };
  await assert.rejects(
    produceM1BHumanFixtureReceiptForTest({
      client: {},
      tenantId,
      actorId,
      candidateReleaseId: SHA,
      databaseStartedAt: START,
      capture,
      dependencies: futureCommandDependencies
    }),
    (error) => error?.code === "normal_response_chronology_invalid"
  );

  await assert.rejects(
    produceM1BHumanCriticalReceipt({
      client: {},
      tenantId,
      actorId,
      candidateReleaseId: SHA,
      databaseStartedAt: START,
      capture,
      dependencies
    }),
    (error) => error?.code === "human_dependency_override_forbidden"
  );
});

test("Human economic readback proves the safe receipt and two balanced ledger transactions", async () => {
  const rows = humanEconomicRows();
  const results = [
    { rowCount: 1, rows: [rows.execution] },
    { rowCount: 1, rows: [rows.repayment] },
    { rowCount: 1, rows: [{ repayment_row_count: 1, repayment_posted_event_count: 1 }] },
    { rowCount: 1, rows: [rows.obligation] },
    { rowCount: rows.installments.length, rows: rows.installments },
    { rowCount: rows.transactions.length, rows: rows.transactions },
    { rowCount: rows.entries.length, rows: rows.entries }
  ];
  const proof = await readM1BHumanEconomicReadBack({
    query: async () => results.shift()
  }, {
    actorId: "actor_human_borrower_pilot",
    obligationId: "obligation_human_test",
    subjectId: "subject_human_test",
    sandboxExecutionReceiptId: "sandbox_execution_receipt_human_test",
    repaymentId: "repayment_human_test",
    principalLedgerTransactionId: "ledger_transaction_human_principal",
    repaymentLedgerTransactionId: "ledger_transaction_human_repayment"
  });
  assert.equal(proof.executionReceipt.amountMinor, "1000000");
  assert.equal(proof.obligation.status, "fully_repaid");
  assert.equal(proof.obligation.outstandingPrincipalMinor, "0");
  assert.equal(proof.obligation.totalRepaidMinor, "1000000");
  assert.equal(proof.installmentSummary.paidInstallmentCount, 1);
  assert.equal(proof.installmentSummary.paidTotalMinor, "1000000");
  assert.equal(proof.repayment.remainingPrincipalMinor, "0");
  assert.equal(proof.principalLedgerTransaction.debitTotalMinor, "1000000");
  assert.equal(proof.principalLedgerTransaction.creditTotalMinor, "1000000");
  assert.equal(proof.principalLedgerTransaction.entries.length, 2);
  assert.equal(proof.principalLedgerTransaction.canonicalSourceVerified, true);
  assert.equal(proof.principalLedgerTransaction.metadataIncluded, false);
  assert.equal(proof.principalLedgerTransaction.entries[0].canonicalAccountVerified, true);
  assert.match(proof.principalLedgerTransaction.entriesManifestHash, /^0x[0-9a-f]{64}$/);
  assert.equal(proof.repaymentLedgerTransaction.entries.length, 2);
  assert.equal(proof.interestLedgerTransaction, null);
  assert.equal(JSON.stringify(proof).includes("adapterSignature"), false);
  assert.equal(JSON.stringify(proof).includes("ledgerAccountId"), false);
  assert.equal(JSON.stringify(proof).includes("idempotency_key"), false);
  assert.equal(
    JSON.stringify(proof).includes(rows.transactions[0].idempotency_key),
    false
  );
  assert.equal(JSON.stringify(proof).includes('"metadata"'), false);
  assert.equal(JSON.stringify(proof).includes("account_hash"), false);
});

test("Human economic readback rejects an unbalanced or partial-payoff ledger", async () => {
  const rows = humanEconomicRows();
  rows.entries[1].amount_minor = "999999";
  const results = [
    { rowCount: 1, rows: [rows.execution] },
    { rowCount: 1, rows: [rows.repayment] },
    { rowCount: 1, rows: [{ repayment_row_count: 1, repayment_posted_event_count: 1 }] },
    { rowCount: 1, rows: [rows.obligation] },
    { rowCount: rows.installments.length, rows: rows.installments },
    { rowCount: rows.transactions.length, rows: rows.transactions },
    { rowCount: rows.entries.length, rows: rows.entries }
  ];
  await assert.rejects(
    readM1BHumanEconomicReadBack({ query: async () => results.shift() }, {
      actorId: "actor_human_borrower_pilot",
      obligationId: "obligation_human_test",
      subjectId: "subject_human_test",
      sandboxExecutionReceiptId: "sandbox_execution_receipt_human_test",
      repaymentId: "repayment_human_test",
      principalLedgerTransactionId: "ledger_transaction_human_principal",
      repaymentLedgerTransactionId: "ledger_transaction_human_repayment"
    }),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_human_ledger_unbalanced"
  );

  const partial = humanEconomicRows();
  partial.repayment.remaining_principal_minor = "1";
  const partialResults = [
    { rowCount: 1, rows: [partial.execution] },
    { rowCount: 1, rows: [partial.repayment] },
    { rowCount: 1, rows: [{ repayment_row_count: 1, repayment_posted_event_count: 1 }] }
  ];
  await assert.rejects(
    readM1BHumanEconomicReadBack({ query: async () => partialResults.shift() }, {
      actorId: "actor_human_borrower_pilot",
      obligationId: "obligation_human_test",
      subjectId: "subject_human_test",
      sandboxExecutionReceiptId: "sandbox_execution_receipt_human_test",
      repaymentId: "repayment_human_test",
      principalLedgerTransactionId: "ledger_transaction_human_principal",
      repaymentLedgerTransactionId: "ledger_transaction_human_repayment"
    }),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_human_repayment_invalid"
  );

  const repeated = humanEconomicRows();
  const repeatedResults = [
    { rowCount: 1, rows: [repeated.execution] },
    { rowCount: 1, rows: [repeated.repayment] },
    { rowCount: 1, rows: [{ repayment_row_count: 2, repayment_posted_event_count: 2 }] }
  ];
  await assert.rejects(
    readM1BHumanEconomicReadBack({ query: async () => repeatedResults.shift() }, {
      actorId: "actor_human_borrower_pilot",
      obligationId: "obligation_human_test",
      subjectId: "subject_human_test",
      sandboxExecutionReceiptId: "sandbox_execution_receipt_human_test",
      repaymentId: "repayment_human_test",
      principalLedgerTransactionId: "ledger_transaction_human_principal",
      repaymentLedgerTransactionId: "ledger_transaction_human_repayment"
    }),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_human_repayment_invalid"
  );

  const swapped = humanEconomicRows();
  swapped.entries[0].direction = "credit";
  swapped.entries[1].direction = "debit";
  const swappedPrincipal = swapped.transactions.find(({ id }) =>
    id === "ledger_transaction_human_principal"
  );
  swappedPrincipal.transaction_hash = hashId("ledger_transaction", {
    idempotencyKey: swappedPrincipal.idempotency_key,
    transactionType: swappedPrincipal.transaction_type,
    assetId: swappedPrincipal.asset_id,
    referenceType: swappedPrincipal.reference_type,
    referenceId: swappedPrincipal.reference_id,
    metadata: swappedPrincipal.metadata,
    entries: swapped.entries
      .filter(({ transaction_id: transactionId }) => transactionId === swappedPrincipal.id)
      .map((row) => ({
        ledgerAccountId: row.account_id,
        direction: row.direction,
        amountMinor: row.amount_minor,
        sequence: row.sequence
      }))
  });
  const swappedResults = [
    { rowCount: 1, rows: [swapped.execution] },
    { rowCount: 1, rows: [swapped.repayment] },
    { rowCount: 1, rows: [{ repayment_row_count: 1, repayment_posted_event_count: 1 }] },
    { rowCount: 1, rows: [swapped.obligation] },
    { rowCount: swapped.installments.length, rows: swapped.installments },
    { rowCount: swapped.transactions.length, rows: swapped.transactions },
    { rowCount: swapped.entries.length, rows: swapped.entries }
  ];
  await assert.rejects(
    readM1BHumanEconomicReadBack({ query: async () => swappedResults.shift() }, {
      actorId: "actor_human_borrower_pilot",
      obligationId: "obligation_human_test",
      subjectId: "subject_human_test",
      sandboxExecutionReceiptId: "sandbox_execution_receipt_human_test",
      repaymentId: "repayment_human_test",
      principalLedgerTransactionId: "ledger_transaction_human_principal",
      repaymentLedgerTransactionId: "ledger_transaction_human_repayment"
    }),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_human_ledger_linkage_invalid"
  );
});

test("Human economic readback rejects canonical Obligation, schedule, and ledger-source tampering", async () => {
  const input = {
    actorId: "actor_human_borrower_pilot",
    obligationId: "obligation_human_test",
    subjectId: "subject_human_test",
    sandboxExecutionReceiptId: "sandbox_execution_receipt_human_test",
    repaymentId: "repayment_human_test",
    principalLedgerTransactionId: "ledger_transaction_human_principal",
    repaymentLedgerTransactionId: "ledger_transaction_human_repayment"
  };
  const resultsFor = (rows) => [
    { rowCount: 1, rows: [rows.execution] },
    { rowCount: 1, rows: [rows.repayment] },
    { rowCount: 1, rows: [{ repayment_row_count: 1, repayment_posted_event_count: 1 }] },
    { rowCount: 1, rows: [rows.obligation] },
    { rowCount: rows.installments.length, rows: rows.installments },
    { rowCount: rows.transactions.length, rows: rows.transactions },
    { rowCount: rows.entries.length, rows: rows.entries }
  ];
  const readRows = (rows) => {
    const results = resultsFor(rows);
    return readM1BHumanEconomicReadBack({ query: async () => results.shift() }, input);
  };
  const rehashTransaction = (rows, transactionId) => {
    const transaction = rows.transactions.find(({ id }) => id === transactionId);
    transaction.transaction_hash = hashId("ledger_transaction", {
      idempotencyKey: transaction.idempotency_key,
      transactionType: transaction.transaction_type,
      assetId: transaction.asset_id,
      referenceType: transaction.reference_type,
      referenceId: transaction.reference_id,
      metadata: transaction.metadata,
      entries: rows.entries
        .filter(({ transaction_id: entryTransactionId }) =>
          entryTransactionId === transactionId
        )
        .map((entry) => ({
          ledgerAccountId: entry.account_id,
          direction: entry.direction,
          amountMinor: entry.amount_minor,
          sequence: entry.sequence
        }))
    });
  };

  const nonzeroOutstanding = humanEconomicRows();
  nonzeroOutstanding.obligation.outstanding_minor = "1";
  await assert.rejects(
    readRows(nonzeroOutstanding),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_human_obligation_invalid"
  );

  const incompleteInstallment = humanEconomicRows();
  incompleteInstallment.installments[0].paid_principal_minor = "999999";
  await assert.rejects(
    readRows(incompleteInstallment),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_human_installment_totals_invalid"
  );

  const selfConsistentMetadataTamper = humanEconomicRows();
  const principal = selfConsistentMetadataTamper.transactions.find(({ id }) =>
    id === "ledger_transaction_human_principal"
  );
  principal.metadata = { ...principal.metadata, withdrawable: true };
  principal.metadata_hash = hashId("ledger_metadata", principal.metadata);
  rehashTransaction(selfConsistentMetadataTamper, principal.id);
  await assert.rejects(
    readRows(selfConsistentMetadataTamper),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_human_ledger_transaction_invalid"
  );

  const staleTransactionHash = humanEconomicRows();
  staleTransactionHash.entries[0].amount_minor = "999999";
  staleTransactionHash.entries[1].amount_minor = "999999";
  staleTransactionHash.transactions[0].debit_total_minor = "999999";
  staleTransactionHash.transactions[0].credit_total_minor = "999999";
  await assert.rejects(
    readRows(staleTransactionHash),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_human_ledger_transaction_hash_invalid"
  );

  const badAccountHash = humanEconomicRows();
  badAccountHash.entries[0].account_hash = OTHER_HASH;
  await assert.rejects(
    readRows(badAccountHash),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_human_ledger_entry_invalid"
  );

  const badNormalSide = humanEconomicRows();
  badNormalSide.entries[0].account_normal_side = "credit";
  await assert.rejects(
    readRows(badNormalSide),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_human_ledger_entry_invalid"
  );
});

function commandRows({
  capturedResponse = ACCEPTED_RESPONSE,
  persistedResponseHash = hashId("command_response", capturedResponse)
} = {}) {
  const responseHash = hashId("command_response", capturedResponse);
  return [
    {
      rowCount: 1,
      rows: [{
        audit_event_id: "authorization_event_command",
        occurred_at: TIME,
        request_id: "request-command-proof",
        correlation_id: "correlation-command-proof",
        actor_id: "actor_human_borrower_pilot",
        operation_id: "pilotAcceptCreditOffer",
        resource_type: "credit_offer",
        resource_id: "credit_offer_candidate",
        authorization_decision: "allow",
        authorization_decision_id: "authorization_decision_command",
        command_payload_hash: HASH,
        audit_command_hash: HASH,
        policy_version: "security_001.v1",
        reason_code: "authorization_allowed",
        idempotency_key: "idempotency-command-proof",
        execution_payload_hash: HASH,
        execution_command_hash: HASH,
        execution_operation_id: "pilotAcceptCreditOffer",
        execution_actor_id: "actor_human_borrower_pilot",
        execution_response_hash: responseHash,
        business_event_id: "event_command_0",
        completed_at: TIME,
        persisted_command_hash: HASH,
        persisted_response_hash: persistedResponseHash,
        status: "completed",
        persisted_first_event_id: "event_command_0"
      }]
    },
    {
      rowCount: 2,
      rows: [0, 1].map((sequence) => {
        const payload = { sequence, safe: true };
        const payloadHash = hashId("event_payload", payload);
        return {
        sequence,
        event_id: `event_command_${sequence}`,
        aggregate_type: sequence === 0 ? "credit_offer" : "obligation",
        aggregate_id: sequence === 0
          ? "credit_offer_candidate"
          : "obligation_candidate",
        aggregate_version: 1,
        event_type: sequence === 0 ? "credit_offer_accepted" : "obligation_created",
        domain_aggregate_type: sequence === 0 ? "credit_offer" : "obligation",
        domain_aggregate_id: sequence === 0
          ? "credit_offer_candidate"
          : "obligation_candidate",
        domain_aggregate_version: 1,
        payload_hash: payloadHash,
        payload,
        source_finality: "finalized",
        occurred_at: TIME,
        evidence_id: `event_command_${sequence}`,
        evidence_event_type: sequence === 0
          ? "credit_offer_accepted"
          : "obligation_created",
        evidence_aggregate_type: sequence === 0 ? "credit_offer" : "obligation",
        evidence_aggregate_id: sequence === 0
          ? "credit_offer_candidate"
          : "obligation_candidate",
        evidence_aggregate_version: 1,
        evidence_payload_hash: payloadHash,
        evidence_hash: OTHER_HASH,
        evidence_source_finality: "finalized",
        causation_id: "request-command-proof",
        correlation_id: "correlation-command-proof"
      }})
    },
    {
      rowCount: 2,
      rows: [1, 2].map((index) => ({
        id: index === 2
          ? "authorization_event_command"
          : "authorization_event_command_initial",
        occurred_at: TIME,
        request_id: "request-command-proof",
        correlation_id: "correlation-command-proof",
        actor_id: "actor_human_borrower_pilot",
        operation_id: "pilotAcceptCreditOffer",
        resource_type: "credit_offer",
        resource_id: "credit_offer_candidate",
        authorization_decision: "allow",
        authorization_decision_id: index === 2
          ? "authorization_decision_command"
          : "authorization_decision_command_initial",
        command_payload_hash: HASH,
        command_hash: HASH,
        policy_version: "security_001.v1",
        reason_code: "authorization_allowed"
      }))
    }
  ];
}

function queuedClient(results) {
  return {
    async query() {
      const next = results.shift();
      if (!next) throw new Error("unexpected query");
      return next;
    }
  };
}

test("command proof binds final authorization, hashes, and the complete ordered event manifest", async () => {
  const input = {
    tenantId: "tenant_local",
    actorId: "actor_human_borrower_pilot",
    operationId: "pilotAcceptCreditOffer",
    requestId: "request-command-proof",
    correlationId: "correlation-command-proof",
    resourceType: "credit_offer",
    resourceId: "credit_offer_candidate",
    responseSchemaVersion: "tenant_credit_offer_accepted.v1",
    response: ACCEPTED_RESPONSE,
    capturedRawResponseHash: hashId("command_response", ACCEPTED_RESPONSE),
    capturedAt: TIME
  };
  const proof = await readM1BCommandProof(queuedClient(commandRows()), input);
  assert.equal(proof.businessEventId, "event_command_0");
  assert.deepEqual(
    proof.eventManifest.map(({ sequence, eventId }) => [sequence, eventId]),
    [[0, "event_command_0"], [1, "event_command_1"]]
  );
  await assert.rejects(
    readM1BCommandProof(
      queuedClient(commandRows({ persistedResponseHash: HASH })),
      input
    ),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_command_integrity_invalid"
  );
  await assert.rejects(
    readM1BCommandProof(
      queuedClient(commandRows()),
      {
        ...input,
        capturedRawResponseHash: HASH
      }
    ),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_command_integrity_invalid"
  );
});

test("execution command proof includes safe ledger payload but never account-open payload", async () => {
  const response = {
    obligation: {
      obligationId: "obligation_candidate",
      obligationHash: HASH,
      status: "active",
      executionStatus: "executed",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false
    },
    executionReceipt: {
      sandboxExecutionReceiptId: "sandbox_execution_receipt_candidate",
      receiptHash: OTHER_HASH,
      obligationId: "obligation_candidate",
      assetId: "asset_usdc",
      amountMinor: "1000000",
      adapterId: "signed_non_redeemable",
      adapterVersion: "signed_non_redeemable.v1",
      adapterKeyId: HASH,
      adapterMessageHash: OTHER_HASH,
      executedAt: TIME,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "sandbox_execution_receipt.v1"
    },
    principalLedgerTransactionId: "ledger_transaction_candidate",
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: "tenant_sandbox_obligation_executed.v1"
  };
  const rows = commandRows({ capturedResponse: response });
  const command = rows[0].rows[0];
  Object.assign(command, {
    operation_id: "pilotExecuteSandboxObligation",
    execution_operation_id: "pilotExecuteSandboxObligation",
    resource_type: "obligation",
    resource_id: "obligation_candidate"
  });
  const payloads = [
    {
      obligationId: "obligation_candidate",
      accountIds: ["ledger_account_raw_must_not_be_emitted"],
      accountTypes: ["principal_receivable"],
      assetId: "asset_usdc",
      actorId: "actor_human_borrower_pilot",
      causationId: "request-command-proof",
      correlationId: "correlation-command-proof",
      sandboxOnly: true
    },
    {
      ledgerTransactionId: "ledger_transaction_candidate",
      transactionHash: HASH,
      transactionType: "sandbox_credit_execution",
      assetId: "asset_usdc",
      debitTotalMinor: "1000000",
      creditTotalMinor: "1000000",
      entryCount: 2,
      actorId: "actor_human_borrower_pilot",
      causationId: "request-command-proof",
      correlationId: "correlation-command-proof",
      sandboxOnly: true,
      productionFundsMoved: false
    },
    {
      obligationId: "obligation_candidate",
      sandboxExecutionReceiptId: "sandbox_execution_receipt_candidate",
      receiptHash: OTHER_HASH,
      principalLedgerTransactionId: "ledger_transaction_candidate",
      previousStatus: "created",
      nextStatus: "active",
      previousExecutionStatus: "pending",
      nextExecutionStatus: "executed",
      actorId: "actor_human_borrower_pilot",
      causationId: "request-command-proof",
      correlationId: "correlation-command-proof",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      actionConfirmation: {
        actionType: "execute_obligation",
        confirmationMethod: "wallet_personal_sign",
        confirmationHash: HASH,
        messageHash: OTHER_HASH,
        resourceHash: HASH,
        payloadHash: OTHER_HASH,
        requestId: "request-command-proof",
        confirmedAt: TIME,
        rawSignaturePersisted: false,
        blockchainTransactionSubmitted: false,
        schemaVersion: "economic_action_confirmation_result.v1"
      }
    }
  ];
  rows[1] = {
    rowCount: 3,
    rows: payloads.map((payload, sequence) => ({
      sequence,
      event_id: `event_command_${sequence}`,
      aggregate_type: "obligation",
      aggregate_id: "obligation_candidate",
      aggregate_version: sequence + 1,
      event_type: [
        "ledger_account_opened",
        "ledger_transaction_posted",
        "obligation_sandbox_executed"
      ][sequence],
      domain_aggregate_type: "obligation",
      domain_aggregate_id: "obligation_candidate",
      domain_aggregate_version: sequence + 1,
      payload_hash: hashId("event_payload", payload),
      payload,
      source_finality: "finalized",
      occurred_at: TIME,
      evidence_id: `event_command_${sequence}`,
      evidence_event_type: [
        "ledger_account_opened",
        "ledger_transaction_posted",
        "obligation_sandbox_executed"
      ][sequence],
      evidence_aggregate_type: "obligation",
      evidence_aggregate_id: "obligation_candidate",
      evidence_aggregate_version: sequence + 1,
      evidence_payload_hash: hashId("event_payload", payload),
      evidence_hash: OTHER_HASH,
      evidence_source_finality: "finalized",
      causation_id: "request-command-proof",
      correlation_id: "correlation-command-proof"
    }))
  };
  for (const audit of rows[2].rows) {
    audit.operation_id = "pilotExecuteSandboxObligation";
    audit.resource_type = "obligation";
    audit.resource_id = "obligation_candidate";
  }
  const proof = await readM1BCommandProof(queuedClient(rows), {
    tenantId: "tenant_local",
    actorId: "actor_human_borrower_pilot",
    operationId: "pilotExecuteSandboxObligation",
    requestId: "request-command-proof",
    correlationId: "correlation-command-proof",
    resourceType: "obligation",
    resourceId: "obligation_candidate",
    responseSchemaVersion: "tenant_sandbox_obligation_executed.v1",
    response,
    capturedRawResponseHash: hashId("command_response", response),
    capturedAt: TIME
  });
  assert.equal(Object.hasOwn(proof.eventManifest[0], "payloadProjection"), false);
  assert.equal(
    proof.eventManifest[1].payloadProjection.ledgerTransactionId,
    "ledger_transaction_candidate"
  );
  assert.equal(
    proof.eventManifest[2].payloadProjection.sandboxExecutionReceiptId,
    "sandbox_execution_receipt_candidate"
  );
  assert.equal(JSON.stringify(proof).includes("ledger_account_raw_must_not_be_emitted"), false);
});

test("query proof requires the exact two-row allow set and hashes only the safe response", async () => {
  const auditRows = [1, 2].map((index) => ({
    id: `authorization_event_query_${index}`,
    occurred_at: TIME,
    request_id: "request-query-proof",
    correlation_id: "correlation-query-proof",
    actor_id: "actor_human_borrower_pilot",
    operation_id: "pilotReadWorkspaceResume",
    resource_type: "workspace",
    resource_id: "workspace_human",
    authorization_decision: "allow",
    authorization_decision_id: `authorization_decision_query_${index}`,
    policy_version: "security_001.v1",
    reason_code: "authorization_allowed"
  }));
  const response = {
    workspaceKind: "human_borrower",
    humanOfferReview: null,
    hasMore: false,
    serverTruth: true,
    schemaVersion: "tenant_workspace_resume_view.v2"
  };
  const proof = await readM1BQueryProof(
    queuedClient([{ rowCount: 2, rows: auditRows }]),
    {
      tenantId: "tenant_local",
      actorId: "actor_human_borrower_pilot",
      operationId: "pilotReadWorkspaceResume",
      requestId: "request-query-proof",
      correlationId: "correlation-query-proof",
      resourceType: "workspace",
      resourceId: "workspace_human",
      responseSchemaVersion: "tenant_workspace_resume_view.v2",
      response,
      capturedAt: TIME
    }
  );
  assert.equal(proof.responseHash, hashM1BAcceptanceManifest(proof.responseProjection));
  assert.equal(proof.responseProjection.humanOfferReview, null);
  assert.equal(proof.authorizationAudits.length, 2);
});

test("projection proof recomputes canonical payload hash and binds Event to Evidence", async () => {
  const payload = {
    creditOfferId: "credit_offer_candidate",
    creditOfferHash: HASH,
    termsHash: OTHER_HASH,
    status: "offered",
    schemaVersion: "credit_offer.v1"
  };
  const entityHash = createCoreProjectionHash("credit_offer", payload);
  const eventPayload = { creditOfferId: "credit_offer_candidate", status: "offered" };
  const eventPayloadHash = hashId("event_payload", eventPayload);
  const proof = await readM1BProjectionProof(
    queuedClient([{
      rowCount: 1,
      rows: [{
        entity_type: "credit_offer",
        entity_id: "credit_offer_candidate",
        entity_hash: entityHash,
        root_aggregate_type: "credit_offer",
        root_aggregate_id: "credit_offer_candidate",
        aggregate_version: 1,
        source_event_id: "event_offer_created",
        payload,
        last_event_id: "event_offer_created",
        registry_entity_hash: entityHash,
        event_type: "credit_offer_created",
        aggregate_type: "credit_offer",
        aggregate_id: "credit_offer_candidate",
        event_aggregate_version: 1,
        payload_hash: eventPayloadHash,
        event_payload: eventPayload,
        source_finality: "finalized",
        evidence_id: "event_offer_created",
        evidence_hash: OTHER_HASH,
        evidence_event_type: "credit_offer_created",
        evidence_aggregate_type: "credit_offer",
        evidence_aggregate_id: "credit_offer_candidate",
        evidence_aggregate_version: 1,
        evidence_payload_hash: eventPayloadHash,
        evidence_source_finality: "finalized"
      }]
    }]),
    {
      tenantId: "tenant_local",
      entityType: "credit_offer",
      entityId: "credit_offer_candidate"
    }
  );
  assert.equal(proof.entityHash, entityHash);
  assert.equal(proof.sourceEvidenceHash, OTHER_HASH);
});

test("resource and SIWE readers return only hashed actor scope and assurance", async () => {
  const resourceClient = queuedClient([{
    rowCount: 1,
    rows: [{
      resource_type: "subject",
      resource_id: "subject_candidate",
      resource_status: "active",
      resource_version: 2,
      relationship: "owner",
      binding_status: "active",
      binding_version: 1
    }]
  }]);
  const resources = await readM1BActorResourceScope(resourceClient, {
    tenantId: "tenant_local",
    actorId: "actor_human_borrower_pilot",
    resources: [["subject", "subject_candidate"]]
  });
  assert.equal(resources[0].bindingRelationship, "owner");
  assert.match(resources[0].actorRefHash, /^0x[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(resources[0], "actorId"), false);

  const authentication = await readM1BSafeSiweAuthentication(
    queuedClient([{
      rowCount: 1,
      rows: [{
        audit_event_id: "authorization_event_query_auth",
        request_id: "request-query-proof",
        correlation_id: "correlation-query-proof",
        operation_id: "pilotReadWorkspaceResume",
        occurred_at: TIME,
        audit_policy_version: "security_001.v1",
        session_actor_id: "actor_human_borrower_pilot",
        session_client_id: "client_phase4_actor_human_borrower_pilot",
        session_credential_id: "credential-opaque",
        session_credential_version: 1,
        authentication_method: "siwe",
        sender_constraint_method: "host_session",
        session_policy_version: "security_001.v1",
        acr: "urn:ipo.one:acr:wallet",
        amr: ["wallet", "siwe", "eip191_eoa_v1"],
        auth_time: TIME,
        session_created_at: TIME,
        absolute_expires_at: "2026-08-15T01:00:00.000Z",
        session_status: "active",
        credential_actor_id: "actor_human_borrower_pilot",
        credential_actor_type: "human",
        credential_client_id: "client_phase4_actor_human_borrower_pilot",
        client_authentication_method: "siwe",
        credential_sender_constraint_method: "host_session",
        credential_policy_version: "security_001.v1",
        credential_status: "active",
        current_credential_version: 1,
        credential_created_at: START,
        credential_expires_at: null,
        membership_actor_id: "actor_human_borrower_pilot",
        membership_client_ids: ["client_phase4_actor_human_borrower_pilot"],
        membership_policy_version: "security_001.v1",
        membership_status: "active",
        membership_valid_from: START,
        membership_expires_at: null,
        registration_count: "1",
        invitation_registration_count: "1",
        registration_occurred_at: START,
        session_match_count: "1"
      }]
    }]),
    {
      tenantId: "tenant_local",
      actorId: "actor_human_borrower_pilot",
      auditEventIds: ["authorization_event_query_auth"],
      databaseStartedAt: START
    }
  );
  assert.equal(authentication.sessionMaterialIncluded, false);
  assert.deepEqual(authentication.coveredRequestIds, ["request-query-proof"]);
  assert.equal(authentication.requestCount, 1);
  assert.deepEqual(authentication.coveredAuditEventIds, [
    "authorization_event_query_auth"
  ]);
  assert.equal(authentication.auditEventCount, 1);
  assert.equal(authentication.earliestAuthTime, TIME);
  assert.equal(authentication.latestAuthTime, TIME);
  assert.equal(Object.hasOwn(authentication, "actorId"), false);
});

function denialOfferRow({ offerId, status, schemaVersion, resourceStatus }) {
  return {
    id: offerId,
    offer_hash: HASH,
    terms_hash: OTHER_HASH,
    disclosure_ref: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
    status,
    schema_version: schemaVersion,
    projection_entity_hash: HASH,
    projection_aggregate_version: 2,
    projection_source_event_id: `event_${offerId}_status`,
    authorization_resource_status: resourceStatus,
    authorization_resource_version: resourceStatus === "closed" ? 2 : 1
  };
}

function denialCountRow(overrides = {}) {
  return {
    credit_offer_row_count: "1",
    projection_registry_count: "1",
    projection_snapshot_count: "2",
    domain_event_count: "2",
    evidence_envelope_count: "2",
    credit_offer_acceptance_count: "0",
    obligation_count: "0",
    sandbox_execution_receipt_count: "0",
    repayment_event_count: "0",
    ledger_transaction_count: "0",
    ledger_entry_count: "0",
    authorization_allow_count: "0",
    command_idempotency_count: "0",
    command_event_count: "0",
    tenant_command_execution_count: "0",
    business_domain_event_count: "0",
    business_evidence_envelope_count: "0",
    ...overrides
  };
}

const DENIAL_TARGETS = Object.freeze([
  Object.freeze({
    creditOfferId: "credit_offer_stale_candidate",
    expectedStatus: "declined",
    requestId: "request-cp-denial-stale",
    correlationId: "correlation-cp-denial-stale",
    clientId: "client_phase4_actor_human_borrower_pilot",
    idempotencyKey: "idempotency-cp-denial-stale"
  }),
  Object.freeze({
    creditOfferId: "credit_offer_withdrawn_candidate",
    expectedStatus: "withdrawn",
    requestId: "request-cp-denial-withdrawn",
    correlationId: "correlation-cp-denial-withdrawn",
    clientId: "client_phase4_actor_human_borrower_pilot",
    idempotencyKey: "idempotency-cp-denial-withdrawn"
  })
]);

function denialRuntimeRequest(target) {
  const request = {
    operationId: "pilotAcceptCreditOffer",
    resource: {
      resourceType: "credit_offer",
      resourceId: target.creditOfferId
    },
    payload: {
      expectedOfferHash: HASH,
      expectedTermsHash: OTHER_HASH,
      acknowledgementHash: `0x${"3".repeat(64)}`,
      actionConfirmation: {
        actionType: "accept_offer",
        resourceId: target.creditOfferId,
        resourceHash: HASH,
        payloadHash: `0x${"4".repeat(64)}`,
        requestId: target.requestId,
        requestNonce: "human_action_confirmation_01234567-89ab-4def-8123-456789abcdef",
        requestedAt: TIME,
        confirmedAt: TIME,
        expiresAt: "2026-08-14T01:05:00.000Z",
        confirmationMethod: "wallet_personal_sign",
        confirmationHash: `0x${"5".repeat(64)}`,
        messageHash: `0x${"6".repeat(64)}`,
        rawSignaturePersisted: false,
        blockchainTransactionSubmitted: false,
        schemaVersion: "economic_action_confirmation_result.v1"
      }
    },
    requestId: target.requestId,
    correlationId: target.correlationId,
    idempotencyKey: target.idempotencyKey,
    schemaVersion: "tenant_protocol_request.v1"
  };
  return {
    requestProjection: request,
    requestProjectionHash: hashM1BAcceptanceManifest(request)
  };
}

function denialSnapshotRows({ final = false, changed = false, targets = DENIAL_TARGETS } = {}) {
  const rows = [{ rowCount: 1, rows: [{ captured_at: TIME }] }];
  for (const [index, target] of targets.entries()) {
    const withdrawn = target.expectedStatus === "withdrawn";
    rows.push({
      rowCount: 1,
      rows: [denialOfferRow({
        offerId: target.creditOfferId,
        status: target.expectedStatus,
        schemaVersion: withdrawn ? "credit_offer.v2" : "credit_offer.v1",
        resourceStatus: withdrawn ? "closed" : "active"
      })]
    });
    rows.push({
      rowCount: 1,
      rows: [denialCountRow(
        final && changed && index === 0 ? { command_event_count: "1" } : {}
      )]
    });
    if (final) {
      rows.push({
        rowCount: 1,
        rows: [{
          id: `authorization_event_denial_${index}`,
          occurred_at: TIME,
          request_id: target.requestId,
          correlation_id: target.correlationId,
          operation_id: "pilotAcceptCreditOffer",
          resource_type: "credit_offer",
          resource_id: target.creditOfferId,
          authorization_decision: "deny",
          authorization_decision_id: null,
          policy_version: "security_001.v1",
          reason_code: "live_policy_rejected"
        }]
      });
    }
  }
  return rows;
}

function denialReadTenant({ changed = false, targets = DENIAL_TARGETS } = {}) {
  let snapshot = 0;
  return async (operation) => {
    const rows = denialSnapshotRows({ final: snapshot === 1, changed, targets });
    snapshot += 1;
    return operation(queuedClient(rows));
  };
}

test("Capital Partner denial boundary captures genuine pre/post protected state", async () => {
  const proofs = await captureM1BCapitalPartnerDenialBoundary({
    readTenant: denialReadTenant(),
    tenantId: "tenant_local",
    actorId: "actor_human_borrower_pilot",
    targets: DENIAL_TARGETS,
    async performDenials(targets) {
      return targets.map((target) => ({
        creditOfferId: target.creditOfferId,
        requestId: target.requestId,
        correlationId: target.correlationId,
        responseSchemaVersion: "problem_details.v1",
        capturedAt: TIME,
        ...denialRuntimeRequest(target),
        response: {
          status: 404,
          code: "authorization_denied",
          requestId: target.requestId,
          schemaVersion: "problem_details.v1"
        }
      }));
    }
  });
  assert.equal(proofs.length, 2);
  assert.equal(proofs[0].protectedStateBeforeHash, proofs[0].protectedStateAfterHash);
  assert.equal(proofs[1].outwardResponse.responseProjection.status, 404);
  assert.equal(proofs[0].protectedStateBefore.deniedCommand.commandEventCount, 0);

  await assert.rejects(
    captureM1BCapitalPartnerDenialBoundary({
      readTenant: denialReadTenant({ changed: true }),
      tenantId: "tenant_local",
      actorId: "actor_human_borrower_pilot",
      targets: DENIAL_TARGETS,
      performDenials: async (targets) => targets.map((target) => ({
        creditOfferId: target.creditOfferId,
        requestId: target.requestId,
        correlationId: target.correlationId,
        responseSchemaVersion: "problem_details.v1",
        capturedAt: TIME,
        ...denialRuntimeRequest(target),
        response: {
          status: 404,
          code: "authorization_denied",
          requestId: target.requestId,
          schemaVersion: "problem_details.v1"
        }
      }))
    }),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_denial_protected_state_invalid"
  );
});

test("Capital Partner denial boundaries can be captured around each strict lineage step", async () => {
  const timeline = [];
  const captureOne = async (target, label) => captureM1BCapitalPartnerDenialBoundary({
    readTenant: denialReadTenant({ targets: [target] }),
    tenantId: "tenant_local",
    actorId: "actor_human_borrower_pilot",
    targets: [target],
    async performDenials([exactTarget]) {
      timeline.push(label);
      return [{
        creditOfferId: exactTarget.creditOfferId,
        requestId: exactTarget.requestId,
        correlationId: exactTarget.correlationId,
        responseSchemaVersion: "problem_details.v1",
        capturedAt: TIME,
        ...denialRuntimeRequest(exactTarget),
        response: {
          status: 404,
          code: "authorization_denied",
          requestId: exactTarget.requestId,
          schemaVersion: "problem_details.v1"
        }
      }];
    }
  });
  const stale = await captureOne(DENIAL_TARGETS[0], "stale_denial");
  timeline.push("current_recovery", "withdrawal_inbox", "withdrawal_author", "withdrawal");
  const withdrawn = await captureOne(DENIAL_TARGETS[1], "withdrawn_denial");
  timeline.push("final_current_recovery");
  assert.equal(stale.length, 1);
  assert.equal(withdrawn.length, 1);
  assert.deepEqual(timeline, [
    "stale_denial",
    "current_recovery",
    "withdrawal_inbox",
    "withdrawal_author",
    "withdrawal",
    "withdrawn_denial",
    "final_current_recovery"
  ]);
});

test("protected-state reader rejects any prior command or economic effect", async () => {
  await assert.rejects(
    readM1BCapitalPartnerDenialProtectedState(
      queuedClient([
        {
          rowCount: 1,
          rows: [denialOfferRow({
            offerId: DENIAL_TARGETS[0].creditOfferId,
            status: "declined",
            schemaVersion: "credit_offer.v1",
            resourceStatus: "active"
          })]
        },
        { rowCount: 1, rows: [denialCountRow({ obligation_count: "1" })] }
      ]),
      {
        tenantId: "tenant_local",
        actorId: "actor_human_borrower_pilot",
        ...DENIAL_TARGETS[0]
      }
    ),
    (error) => error instanceof M1BHumanCapitalPartnerAcceptanceError &&
      error.code === "acceptance_denial_protected_state_invalid"
  );
});
