import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createServicingCasePresentation,
  hasVerifiedServicingCase
} from "../src/servicing-case-presentation.js";

const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/human-sandbox-obligation-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const validReceipt = fixtures.valid[0];

function installmentTotal(row) {
  return BigInt(row.scheduledPrincipalMinor) + BigInt(row.scheduledInterestMinor) +
    BigInt(row.scheduledFeeMinor);
}

function delinquentObligation() {
  const obligation = structuredClone(validReceipt.obligation);
  const first = obligation.installments[0];
  const effectiveAt = new Date(new Date(first.dueAt).getTime() + 21 * 86_400_000).toISOString();
  obligation.outstandingPrincipalMinor = obligation.originalPrincipalMinor;
  obligation.outstandingInterestMinor = "0";
  obligation.outstandingFeesMinor = "0";
  obligation.totalRepaidMinor = "0";
  obligation.status = "delinquent";
  obligation.servicingClassification = "dpd_1_30";
  obligation.daysPastDue = 21;
  obligation.oldestUnpaidInstallmentId = first.installmentId;
  obligation.servicingEffectiveAt = effectiveAt;
  obligation.servicingReasonCode = "servicing_dpd_1_30";
  for (const installment of obligation.installments) {
    installment.paidPrincipalMinor = "0";
    installment.paidInterestMinor = "0";
    installment.paidFeeMinor = "0";
    installment.status = "scheduled";
  }
  return obligation;
}

function curedObligation() {
  const obligation = delinquentObligation();
  const [first, second] = obligation.installments;
  first.paidPrincipalMinor = first.scheduledPrincipalMinor;
  first.paidInterestMinor = first.scheduledInterestMinor;
  first.paidFeeMinor = first.scheduledFeeMinor;
  first.status = "paid";
  const paid = installmentTotal(first);
  obligation.outstandingPrincipalMinor = String(
    BigInt(obligation.originalPrincipalMinor) - BigInt(first.scheduledPrincipalMinor)
  );
  obligation.totalRepaidMinor = String(paid);
  obligation.status = "partially_repaid";
  obligation.servicingClassification = "cured";
  obligation.daysPastDue = 0;
  obligation.oldestUnpaidInstallmentId = second.installmentId;
  obligation.servicingReasonCode = "servicing_cured_by_repayment";
  return obligation;
}

function multiInstallmentDelinquentObligation() {
  const obligation = delinquentObligation();
  const [first, second] = obligation.installments;
  const effectiveAt = new Date(
    new Date(second.dueAt).getTime() + 4 * 86_400_000
  ).toISOString();
  obligation.servicingEffectiveAt = effectiveAt;
  obligation.daysPastDue = Math.floor(
    (new Date(effectiveAt).getTime() - new Date(first.dueAt).getTime()) /
      86_400_000
  );
  obligation.servicingClassification = "dpd_31_60";
  obligation.servicingReasonCode = "servicing_dpd_31_60";
  return obligation;
}

function cureAction(obligation) {
  return {
    servicingActionId: "sandbox_servicing_action_browser_cure_001",
    servicingActionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    obligationId: obligation.obligationId,
    subjectId: obligation.subjectId,
    actionType: "cure",
    previousStatus: "delinquent",
    nextStatus: obligation.status,
    previousClassification: "dpd_1_30",
    nextClassification: obligation.servicingClassification,
    daysPastDue: obligation.daysPastDue,
    oldestUnpaidInstallmentId: obligation.oldestUnpaidInstallmentId,
    reasonCode: obligation.servicingReasonCode,
    source: "repayment",
    policyVersion: "sandbox-servicing-policy.v1",
    scheduleSequenceBefore: obligation.scheduleSequence,
    scheduleSequenceAfter: obligation.scheduleSequence,
    balancesBefore: {
      outstandingPrincipalMinor: validReceipt.obligation.originalPrincipalMinor,
      outstandingInterestMinor: "0",
      outstandingFeesMinor: "0",
      totalRepaidMinor: "0"
    },
    balancesAfter: {
      outstandingPrincipalMinor: obligation.outstandingPrincipalMinor,
      outstandingInterestMinor: obligation.outstandingInterestMinor,
      outstandingFeesMinor: obligation.outstandingFeesMinor,
      totalRepaidMinor: obligation.totalRepaidMinor
    },
    effectiveAt: obligation.servicingEffectiveAt,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "sandbox_servicing_action.v1"
  };
}

function fullyRepaidObligation() {
  const obligation = structuredClone(validReceipt.obligation);
  for (const installment of obligation.installments) {
    installment.paidPrincipalMinor = installment.scheduledPrincipalMinor;
    installment.paidInterestMinor = installment.scheduledInterestMinor;
    installment.paidFeeMinor = installment.scheduledFeeMinor;
    installment.status = "paid";
  }
  obligation.outstandingPrincipalMinor = "0";
  obligation.outstandingInterestMinor = "0";
  obligation.outstandingFeesMinor = "0";
  obligation.totalRepaidMinor = obligation.originalPrincipalMinor;
  obligation.status = "fully_repaid";
  obligation.servicingClassification = "current";
  obligation.daysPastDue = 0;
  obligation.oldestUnpaidInstallmentId = null;
  obligation.servicingReasonCode = "servicing_current";
  return obligation;
}

function repaymentAdvanceAction(obligation) {
  return {
    ...cureAction(obligation),
    servicingActionId: "sandbox_servicing_action_browser_repaid_001",
    actionType: "advance",
    previousStatus: "partially_repaid",
    previousClassification: "current",
    nextClassification: "current",
    source: "repayment",
    balancesBefore: {
      outstandingPrincipalMinor: validReceipt.obligation.outstandingPrincipalMinor,
      outstandingInterestMinor: validReceipt.obligation.outstandingInterestMinor,
      outstandingFeesMinor: validReceipt.obligation.outstandingFeesMinor,
      totalRepaidMinor: validReceipt.obligation.totalRepaidMinor
    }
  };
}

function deeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

test("Servicing Case defaults a current repayment to the next unpaid installment", () => {
  const presentation = createServicingCasePresentation(validReceipt.obligation);
  assert.equal(presentation.outstandingMinor, "9000");
  assert.equal(presentation.installments[0].outstandingMinor, "3000");
  assert.equal(presentation.suggestedPaymentMinor, "3000");
  assert.equal(presentation.repaymentAvailable, true);
});

test("Servicing Case presents one closed trusted-time delinquency truth", () => {
  const obligation = delinquentObligation();
  const presentation = createServicingCasePresentation(obligation);
  assert.equal(presentation.schemaVersion, "servicing_case_presentation.v1");
  assert.equal(presentation.classification, "dpd_1_30");
  assert.equal(presentation.daysPastDue, 21);
  assert.equal(presentation.pastDueMinor, String(installmentTotal(obligation.installments[0])));
  assert.equal(presentation.pastDuePrincipalMinor, obligation.installments[0].scheduledPrincipalMinor);
  assert.equal(presentation.pastDueInterestMinor, obligation.installments[0].scheduledInterestMinor);
  assert.equal(presentation.pastDueFeeMinor, obligation.installments[0].scheduledFeeMinor);
  assert.equal(presentation.cureAvailable, true);
  assert.equal(presentation.repaymentAvailable, true);
  assert.equal(presentation.suggestedPaymentMinor, presentation.pastDueMinor);
  assert.equal(presentation.stages.find(({ state }) => state === "current").key, "dpd_1_30");
  assert.equal(presentation.sandboxOnly, true);
  assert.equal(presentation.productionFundsMoved, false);
  assert.equal(hasVerifiedServicingCase(obligation), true);
  assert.equal(deeplyFrozen(presentation), true);
});

test("Servicing Case defaults an adverse repayment to every past-due installment", () => {
  const obligation = multiInstallmentDelinquentObligation();
  const presentation = createServicingCasePresentation(obligation);
  const expectedPastDue = obligation.installments.reduce(
    (sum, installment) => sum + installmentTotal(installment),
    0n
  );
  assert.ok(obligation.daysPastDue >= 31 && obligation.daysPastDue <= 60);
  assert.equal(presentation.pastDueMinor, String(expectedPastDue));
  assert.equal(presentation.suggestedPaymentMinor, String(expectedPastDue));
  assert.ok(expectedPastDue > installmentTotal(obligation.installments[0]));
});

test("Servicing Case records cure only from the exact returned action", () => {
  const obligation = curedObligation();
  const action = cureAction(obligation);
  const presentation = createServicingCasePresentation(obligation, action);
  assert.equal(presentation.classification, "cured");
  assert.equal(presentation.pastDueMinor, "0");
  assert.equal(presentation.pastDuePrincipalMinor, "0");
  assert.equal(presentation.pastDueInterestMinor, "0");
  assert.equal(presentation.pastDueFeeMinor, "0");
  assert.equal(presentation.cureAvailable, false);
  assert.equal(
    presentation.suggestedPaymentMinor,
    presentation.installments[1].outstandingMinor
  );
  assert.equal(presentation.latestAction.actionType, "cure");
  assert.equal(presentation.latestAction.source, "repayment");
  assert.equal(presentation.latestAction.nextClassification, "cured");
  assert.equal(Object.hasOwn(action, "actorHash"), false);
  assert.equal(Object.hasOwn(action, "scheduleHashBefore"), false);
  assert.equal(Object.hasOwn(action, "scheduleHashAfter"), false);
});

test("Servicing Case accepts a repayment-driven advance to fully repaid", () => {
  const obligation = fullyRepaidObligation();
  const action = repaymentAdvanceAction(obligation);
  const presentation = createServicingCasePresentation(obligation, action);
  assert.equal(presentation.classification, "current");
  assert.equal(presentation.repaymentAvailable, false);
  assert.equal(presentation.suggestedPaymentMinor, "0");
  assert.equal(presentation.latestAction.actionType, "advance");
  assert.equal(presentation.latestAction.source, "repayment");
  assert.equal(presentation.latestAction.nextClassification, "current");
});

test("Servicing Case fails closed on lifecycle, clock, schedule, safety, or action drift", () => {
  const cases = [];
  const pair = delinquentObligation();
  pair.status = "active";
  cases.push(pair);
  const dpd = delinquentObligation();
  dpd.daysPastDue = 35;
  cases.push(dpd);
  const policy = delinquentObligation();
  policy.servicingPolicyVersion = "runtime-policy";
  cases.push(policy);
  const funds = delinquentObligation();
  funds.productionFundsMoved = true;
  cases.push(funds);
  const oldest = delinquentObligation();
  oldest.oldestUnpaidInstallmentId = "installment_unknown";
  cases.push(oldest);
  const duplicate = delinquentObligation();
  duplicate.installments[1].installmentId = duplicate.installments[0].installmentId;
  cases.push(duplicate);
  const paid = delinquentObligation();
  paid.installments[0].status = "paid";
  cases.push(paid);
  const balanceDrift = delinquentObligation();
  balanceDrift.outstandingPrincipalMinor = "11999";
  cases.push(balanceDrift);
  const noPastDue = delinquentObligation();
  noPastDue.servicingEffectiveAt = new Date(
    new Date(noPastDue.installments[0].dueAt).getTime() - 1
  ).toISOString();
  cases.push(noPastDue);
  const falseCure = delinquentObligation();
  falseCure.status = "partially_repaid";
  falseCure.servicingClassification = "cured";
  falseCure.daysPastDue = 0;
  cases.push(falseCure);
  for (const value of cases) assert.equal(createServicingCasePresentation(value), null);

  const cured = curedObligation();
  const action = cureAction(cured);
  action.nextClassification = "current";
  assert.equal(createServicingCasePresentation(cured, action), null);
  const wrongSource = cureAction(cured);
  wrongSource.source = "system_worker";
  assert.equal(createServicingCasePresentation(cured, wrongSource), null);
  const wrongBalance = cureAction(cured);
  wrongBalance.balancesAfter.outstandingPrincipalMinor = "1";
  assert.equal(createServicingCasePresentation(cured, wrongBalance), null);
  const wrongSequence = cureAction(cured);
  wrongSequence.scheduleSequenceAfter += 1;
  assert.equal(createServicingCasePresentation(cured, wrongSequence), null);
  const noRepaymentProgress = repaymentAdvanceAction(fullyRepaidObligation());
  noRepaymentProgress.balancesBefore = structuredClone(noRepaymentProgress.balancesAfter);
  assert.equal(
    createServicingCasePresentation(fullyRepaidObligation(), noRepaymentProgress),
    null
  );
  const trustedTimeBalanceMutation = repaymentAdvanceAction(fullyRepaidObligation());
  trustedTimeBalanceMutation.source = "system_worker";
  assert.equal(
    createServicingCasePresentation(fullyRepaidObligation(), trustedTimeBalanceMutation),
    null
  );
});
