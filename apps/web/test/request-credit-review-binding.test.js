import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertRequestCreditReviewCurrent,
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
