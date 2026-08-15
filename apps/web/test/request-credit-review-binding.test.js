import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertRequestCreditReviewCurrent,
  assertRecoveredHumanCreditReviewUnchanged,
  createRecoveredHumanCreditReviewBinding,
  createRequestCreditReviewBinding,
  evaluateRequestCreditReviewBinding
} from "../src/request-credit-review-binding.js";

const humanFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/human-credit-offer-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const agentFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-credit-offer-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));

function currentFrom(binding) {
  return {
    authorityId: binding.authorityId,
    creditRequest: structuredClone(binding.creditRequest),
    entryMode: binding.entryMode,
    subjectId: binding.subjectId
  };
}

test("Human and Agent Offer receipts create one closed economic review binding", () => {
  const human = createRequestCreditReviewBinding({
    entryMode: "human",
    receipt: structuredClone(humanFixtures.valid[0])
  });
  const agent = createRequestCreditReviewBinding({
    entryMode: "agent",
    receipt: structuredClone(agentFixtures.valid[0])
  });

  for (const binding of [human, agent]) {
    assert.equal(binding.schemaVersion, "request_credit_review_binding.v1");
    assert.equal(binding.offer.originationFeeMinor, "0");
    assert.equal(binding.offer.termsVersion, "credit_terms.v1");
    assert.equal(binding.serverReceipts.length, 4);
    assert.equal(binding.serverReceipts.at(-1).operationId, "pilotEvaluateCreditApplication");
    assert.equal(binding.sandboxOnly, true);
    assert.equal(binding.productionFundsApproved, false);
    assert.equal(binding.fundsAuthority, false);
    assert.equal(Object.isFrozen(binding), true);
    assert.equal(Object.isFrozen(binding.offer), true);
    assert.equal(evaluateRequestCreditReviewBinding(
      binding,
      currentFrom(binding)
    ).current, true);
  }

  const serialized = JSON.stringify([human, agent]);
  for (const prohibited of [
    "accessToken",
    "csrfToken",
    "privateKey",
    "signature"
  ]) assert.equal(serialized.includes(prohibited), false, prohibited);
  assert.equal(human.credentialsIncluded, false);
  assert.equal(agent.credentialsIncluded, false);
});

test("review binding fails closed on authority and visible economic drift", () => {
  const binding = createRequestCreditReviewBinding({
    entryMode: "human",
    receipt: structuredClone(humanFixtures.valid[0])
  });
  const authorityDrift = currentFrom(binding);
  authorityDrift.authorityId = "consent_other_review";
  assert.deepEqual(evaluateRequestCreditReviewBinding(binding, authorityDrift), {
    current: false,
    reasonCode: "authority_changed"
  });

  const amountDrift = currentFrom(binding);
  amountDrift.creditRequest.requestedPrincipalMinor = "13000";
  assert.deepEqual(evaluateRequestCreditReviewBinding(binding, amountDrift), {
    current: false,
    reasonCode: "request_economics_changed"
  });
  assert.throws(
    () => assertRequestCreditReviewCurrent(binding, amountDrift),
    /stale_request_credit_review:request_economics_changed/
  );

  const openInput = {
    entryMode: "human",
    receipt: structuredClone(humanFixtures.valid[0]),
    accessToken: "prohibited"
  };
  assert.throws(
    () => createRequestCreditReviewBinding(openInput),
    /invalid_request_credit_review_binding/
  );
});

test("review binding rejects server receipt safety and Offer drift", () => {
  const fundsDrift = structuredClone(humanFixtures.valid[0]);
  fundsDrift.fundsAuthority = true;
  assert.throws(
    () => createRequestCreditReviewBinding({
      entryMode: "human",
      receipt: fundsDrift
    }),
    /invalid_request_credit_review_binding/
  );

  const feeDrift = structuredClone(agentFixtures.valid[0]);
  feeDrift.offer.originationFeeMinor = "-1";
  assert.throws(
    () => createRequestCreditReviewBinding({
      entryMode: "agent",
      receipt: feeDrift
    }),
    /invalid_request_credit_review_binding/
  );
});

function recoveredHumanReview() {
  const receipt = structuredClone(humanFixtures.valid[0]);
  return {
    subjectId: receipt.subjectId,
    consentId: receipt.consentId,
    creditIntent: receipt.creditIntent,
    decision: receipt.decision,
    offer: receipt.offer,
    offerSchemaVersion: "credit_offer.v1",
    offerAggregateVersion: 1,
    serverTruth: true,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsApproved: false,
    fundsAuthority: false,
    schemaVersion: "human_offer_review_recovery.v1"
  };
}

test("fresh Human sessions rebuild an exact review binding only from closed server truth", () => {
  const recovery = recoveredHumanReview();
  const binding = createRecoveredHumanCreditReviewBinding(recovery, {
    now: new Date("2026-07-15T03:00:00.000Z")
  });

  assert.equal(binding.schemaVersion, "request_credit_review_binding.v2");
  assert.equal(binding.serverTruth, true);
  assert.equal(binding.offerSchemaVersion, "credit_offer.v1");
  assert.equal(binding.offerAggregateVersion, 1);
  assert.equal(binding.serverReceipts.length, 0);
  assert.equal(evaluateRequestCreditReviewBinding(binding, currentFrom(binding)).current, true);
  assert.equal(
    assertRecoveredHumanCreditReviewUnchanged(binding, structuredClone(recovery), {
      now: new Date("2026-07-15T03:00:00.000Z")
    }).offer.creditOfferId,
    recovery.offer.creditOfferId
  );
});

test("recovered Human review fails closed on changed versions, stale replacement, expiry, and invalid binding", () => {
  const recovery = recoveredHumanReview();
  const options = { now: new Date("2026-07-15T03:00:00.000Z") };
  const binding = createRecoveredHumanCreditReviewBinding(recovery, options);

  const changedVersion = structuredClone(recovery);
  changedVersion.offerAggregateVersion = 2;
  assert.throws(
    () => assertRecoveredHumanCreditReviewUnchanged(binding, changedVersion, options),
    /stale_request_credit_review:offer_version_changed/
  );

  const replacement = structuredClone(recovery);
  replacement.offer.creditOfferId = "credit_offer_replacement";
  assert.throws(
    () => assertRecoveredHumanCreditReviewUnchanged(binding, replacement, options),
    /stale_request_credit_review:offer_changed/
  );

  for (const [field, value] of [
    ["annualRateBps", recovery.offer.annualRateBps + 1],
    ["maturityAt", "2026-07-19T12:00:00.000Z"]
  ]) {
    const termsDrift = structuredClone(recovery);
    termsDrift.offer[field] = value;
    assert.throws(
      () => assertRecoveredHumanCreditReviewUnchanged(binding, termsDrift, options),
      /stale_request_credit_review:offer_changed/
    );
  }

  const decisionDrift = structuredClone(recovery);
  decisionDrift.decision.reasonCodes = [
    ...decisionDrift.decision.reasonCodes,
    "manual_review_required"
  ];
  assert.throws(
    () => assertRecoveredHumanCreditReviewUnchanged(binding, decisionDrift, options),
    /stale_request_credit_review:decision_changed/
  );

  assert.throws(
    () => createRecoveredHumanCreditReviewBinding(recovery, {
      now: new Date(recovery.offer.validUntil)
    }),
    /invalid_request_credit_review_binding/
  );

  const invalid = { ...structuredClone(recovery), accessToken: "prohibited" };
  assert.throws(
    () => createRecoveredHumanCreditReviewBinding(invalid, options),
    /invalid_request_credit_review_binding/
  );
});

test("recovered Human review preserves exact cent-denominated request economics", () => {
  const recovery = recoveredHumanReview();
  recovery.creditIntent.requestedPrincipalMinor = "12050";
  recovery.decision.approvedPrincipalMinor = "12050";
  recovery.offer.approvedPrincipalMinor = "12050";
  const binding = createRecoveredHumanCreditReviewBinding(recovery, {
    now: new Date("2026-07-15T03:00:00.000Z")
  });

  assert.equal(binding.creditRequest.requestedPrincipalMinor, "12050");
  assert.equal(binding.offer.approvedPrincipalMinor, "12050");
  assert.equal(evaluateRequestCreditReviewBinding(binding, currentFrom(binding)).current, true);
});

test("Capital Partner v2 recovery binds exact facility and Provider-authored terms", () => {
  const recovery = recoveredHumanReview();
  recovery.offerSchemaVersion = "credit_offer.v2";
  recovery.offer = {
    ...recovery.offer,
    capitalPartnerId: "capital_partner_review_fixture",
    capitalPartnerOperatorId: "actor_partner_operator_review_fixture",
    creditPassportArtifactId: "credit_passport_review_fixture",
    creditPassportArtifactHash: "0x" + "a".repeat(64),
    creditPassportArtifactVersion: 2,
    passportVerificationHash: "0x" + "b".repeat(64),
    underwritingSnapshotHash: "0x" + "c".repeat(64),
    facilityLimitMinor: "15000",
    perDrawCapMinor: "12000",
    permittedPurposeCode: recovery.creditIntent.purposeCode,
    conditions: ["authority_current_at_acceptance"],
    undrawnRevocationRule: "capital_partner_before_acceptance",
    termsVersion: "credit_terms.v2",
    schemaVersion: "credit_offer.v2"
  };
  const options = { now: new Date("2026-07-15T03:00:00.000Z") };
  const binding = createRecoveredHumanCreditReviewBinding(recovery, options);

  assert.equal(binding.offerSchemaVersion, "credit_offer.v2");
  const sameVersionFacilityDrift = structuredClone(recovery);
  sameVersionFacilityDrift.offer.facilityLimitMinor = "16000";
  assert.throws(
    () => assertRecoveredHumanCreditReviewUnchanged(
      binding,
      sameVersionFacilityDrift,
      options
    ),
    /stale_request_credit_review:offer_changed/
  );
  for (const [field, value] of [
    ["facilityLimitMinor", "11999"],
    ["perDrawCapMinor", "11999"],
    ["capitalPartnerOperatorId", ""]
  ]) {
    const drifted = structuredClone(recovery);
    drifted.offer[field] = value;
    assert.throws(
      () => createRecoveredHumanCreditReviewBinding(drifted, options),
      /invalid_request_credit_review_binding/
    );
  }
  const decisionDrift = structuredClone(recovery);
  decisionDrift.decision.approvedPrincipalMinor = "11999";
  assert.throws(
    () => createRecoveredHumanCreditReviewBinding(decisionDrift, options),
    /invalid_request_credit_review_binding/
  );
});
