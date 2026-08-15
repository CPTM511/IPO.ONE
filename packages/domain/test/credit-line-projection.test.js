import assert from "node:assert/strict";
import test from "node:test";
import {
  SANDBOX_CREDIT_DECISION_POLICY,
  SANDBOX_CREDIT_POLICY_HASH,
  createAgentCreditExposureHash,
  deriveAgentCreditLineProjection,
  hashId,
  replayAgentCreditLineProjection,
  verifyCreditLineProjection
} from "../src/index.js";

const NOW = new Date("2026-08-04T00:00:00.000Z");

function h(scope) {
  return hashId(scope, { fixture: true });
}

function fixture() {
  const intent = {
    creditIntentId: "credit_intent_projection_1",
    creditIntentHash: h("intent"),
    subjectId: "subject_agent_projection_1",
    principalId: "principal_projection_1",
    authorityType: "mandate",
    authorityRef: "mandate_projection_1",
    assetId: SANDBOX_CREDIT_DECISION_POLICY.assetId,
    requestedPrincipalMinor: "100000",
    purposeCode: "provider_inventory",
    requestedTermDays: 30,
    repaymentFrequency: "end_of_term",
    installmentCount: 1,
    sandboxOnly: true,
    productionFundsRequested: false,
    status: "decided",
    schemaVersion: "credit_intent.v1"
  };
  const decision = {
    riskDecisionId: "risk_decision_projection_1",
    decisionHash: h("decision"),
    creditIntentId: intent.creditIntentId,
    subjectId: intent.subjectId,
    principalId: intent.principalId,
    authorityType: "mandate",
    authorityRef: intent.authorityRef,
    mandateId: intent.authorityRef,
    assetId: intent.assetId,
    status: "approved",
    modelVersion: SANDBOX_CREDIT_DECISION_POLICY.modelVersion,
    limitMinor: intent.requestedPrincipalMinor,
    utilizationMinor: "0",
    policyHash: SANDBOX_CREDIT_POLICY_HASH,
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "risk_decision.v3"
  };
  const offer = {
    creditOfferId: "credit_offer_projection_1",
    creditOfferHash: h("offer"),
    termsHash: h("terms"),
    creditIntentId: intent.creditIntentId,
    subjectId: intent.subjectId,
    riskDecisionId: decision.riskDecisionId,
    assetId: intent.assetId,
    approvedPrincipalMinor: intent.requestedPrincipalMinor,
    status: "accepted",
    sandboxOnly: true,
    productionFundsApproved: false,
    schemaVersion: "credit_offer.v1"
  };
  const acceptance = {
    creditOfferAcceptanceId: "credit_offer_acceptance_projection_1",
    acceptanceHash: h("acceptance"),
    creditOfferId: offer.creditOfferId,
    creditOfferHash: offer.creditOfferHash,
    termsHash: offer.termsHash,
    creditIntentId: intent.creditIntentId,
    riskDecisionId: decision.riskDecisionId,
    subjectId: intent.subjectId,
    principalId: intent.principalId,
    authorityType: "mandate",
    authorityRef: intent.authorityRef,
    mandateId: intent.authorityRef,
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "credit_offer_acceptance.v1"
  };
  const obligation = {
    obligationId: "obligation_projection_1",
    subjectId: intent.subjectId,
    principalId: intent.principalId,
    creditIntentId: intent.creditIntentId,
    riskDecisionId: decision.riskDecisionId,
    creditOfferId: offer.creditOfferId,
    creditOfferAcceptanceId: acceptance.creditOfferAcceptanceId,
    authorityType: "mandate",
    authorityRef: intent.authorityRef,
    mandateId: intent.authorityRef,
    assetId: intent.assetId,
    originalPrincipalMinor: intent.requestedPrincipalMinor,
    outstandingPrincipalMinor: intent.requestedPrincipalMinor,
    status: "created",
    executionStatus: "pending",
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "obligation.v2"
  };
  const authority = {
    mandateId: intent.authorityRef,
    termsHash: h("mandate_terms"),
    subjectId: intent.subjectId,
    principalId: intent.principalId,
    assetIds: [intent.assetId],
    allowedProviderIds: ["provider_sandbox_inventory"],
    aggregateLimitMinor: "150000",
    status: "active",
    validFrom: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-09-01T00:00:00.000Z",
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "mandate.v3"
  };
  return { intent, decision, offer, acceptance, obligation, authority };
}

function exposure(input, obligations = [], committedLimitMinor = "0") {
  const normalized = obligations.map((item) => ({ ...item }));
  return {
    subjectId: input.obligation.subjectId,
    assetId: input.obligation.assetId,
    outstandingPrincipalMinor: normalized.reduce(
      (total, item) => total + BigInt(item.outstandingPrincipalMinor),
      0n
    ).toString(),
    committedLimitMinor,
    exposureHash: createAgentCreditExposureHash({
      subjectId: input.obligation.subjectId,
      assetId: input.obligation.assetId,
      obligations: normalized
    }),
    obligations: normalized,
    schemaVersion: "agent_credit_exposure.v1"
  };
}

test("CreditLine is derived from exact Facility provenance and canonical exposure", () => {
  const input = fixture();
  const first = deriveAgentCreditLineProjection({
    ...input,
    exposure: exposure(input),
    principalDeltaMinor: "100000",
    now: NOW
  });
  assert.equal(first.value.schemaVersion, "credit_line.v2");
  assert.equal(first.value.limitMinor, "100000");
  assert.equal(first.value.utilizedMinor, "100000");
  assert.equal(first.value.policyHash, SANDBOX_CREDIT_POLICY_HASH);
  assert.equal(first.value.validatedFacilityId, first.facility.facilityId);
  assert.equal(first.value.productionAuthority, false);
  assert.equal(verifyCreditLineProjection(first.value), true);

  const second = deriveAgentCreditLineProjection({
    ...input,
    obligation: {
      ...input.obligation,
      status: "active",
      executionStatus: "executed"
    },
    currentProjection: first.value,
    exposure: exposure(input, [{
      obligationId: input.obligation.obligationId,
      outstandingPrincipalMinor: "100000"
    }], "100000"),
    principalDeltaMinor: "-40000",
    now: new Date("2026-08-04T00:01:00.000Z")
  });
  assert.equal(second.value.utilizedMinor, "60000");
  assert.equal(second.value.validatedFacilityHash, first.value.validatedFacilityHash);

  const replayed = replayAgentCreditLineProjection([
    {
      eventType: "credit_line_utilized",
      payload: {
        previousUtilizedMinor: "0",
        utilizedMinor: first.value.utilizedMinor,
        creditLineProjection: first.value
      }
    },
    {
      eventType: "credit_line_released",
      payload: {
        previousUtilizedMinor: first.value.utilizedMinor,
        utilizedMinor: second.value.utilizedMinor,
        creditLineProjection: second.value
      }
    }
  ]);
  assert.deepEqual(replayed, second.value);
});

test("CreditLine fails closed on stale exposure, policy, or Provider scope", () => {
  const input = fixture();
  const first = deriveAgentCreditLineProjection({
    ...input,
    exposure: exposure(input),
    principalDeltaMinor: "100000",
    now: NOW
  });
  assert.throws(
    () => deriveAgentCreditLineProjection({
      ...input,
      obligation: { ...input.obligation, status: "active", executionStatus: "executed" },
      currentProjection: first.value,
      exposure: {
        ...exposure(input, [{
          obligationId: input.obligation.obligationId,
          outstandingPrincipalMinor: "100000"
        }], "100000"),
        outstandingPrincipalMinor: "99999"
      },
      principalDeltaMinor: "-1",
      now: new Date("2026-08-04T00:01:00.000Z")
    }),
    { code: "credit_line_projection_stale" }
  );
  assert.throws(
    () => deriveAgentCreditLineProjection({
      ...input,
      decision: { ...input.decision, policyHash: h("unauthorized_policy") },
      exposure: exposure(input),
      principalDeltaMinor: "100000",
      now: NOW
    }),
    { code: "credit_facility_not_current" }
  );
  assert.throws(
    () => deriveAgentCreditLineProjection({
      ...input,
      authority: { ...input.authority, allowedProviderIds: [] },
      exposure: exposure(input),
      principalDeltaMinor: "100000",
      now: NOW
    }),
    { code: "credit_facility_scope_mismatch" }
  );
});
