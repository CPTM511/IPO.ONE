export const SERVICING_CASE_POLICY_VERSION = "sandbox-servicing-policy.v1";

export const SERVICING_CASE_STAGE_COPY = Object.freeze([
  Object.freeze({ key: "current", label: "Current", detail: "No past-due amount" }),
  Object.freeze({ key: "grace_period", label: "Grace", detail: "0–3 complete UTC days" }),
  Object.freeze({ key: "dpd_1_30", label: "DPD 1–30", detail: "Policy bucket starts after grace" }),
  Object.freeze({ key: "dpd_31_60", label: "DPD 31–60", detail: "Past-due servicing" }),
  Object.freeze({ key: "dpd_61_89", label: "DPD 61–89", detail: "Pre-default servicing" }),
  Object.freeze({ key: "defaulted", label: "Default", detail: "DPD 90+" })
]);

export const SERVICING_CASE_CLASSIFICATION_COPY = Object.freeze({
  current: Object.freeze({ title: "Current", detail: "No past-due amount is recorded.", tone: "performing" }),
  grace_period: Object.freeze({ title: "Grace period", detail: "A scheduled amount is past due inside the three-day policy grace window.", tone: "watch" }),
  dpd_1_30: Object.freeze({ title: "DPD 1–30", detail: "Pay every past-due component to cure the case.", tone: "adverse" }),
  dpd_31_60: Object.freeze({ title: "DPD 31–60", detail: "The case remains repayable through the same deterministic waterfall.", tone: "adverse" }),
  dpd_61_89: Object.freeze({ title: "DPD 61–89", detail: "The case is approaching the sandbox default threshold.", tone: "adverse" }),
  defaulted: Object.freeze({ title: "Defaulted", detail: "DPD is at or above the 90-day sandbox threshold.", tone: "critical" }),
  cured: Object.freeze({ title: "Cured", detail: "The returned Obligation confirms that every past-due component was paid.", tone: "performing" }),
  restructured: Object.freeze({ title: "Restructured", detail: "A dual-controlled schedule replacement is recorded in immutable Evidence.", tone: "resolved" }),
  repurchased: Object.freeze({ title: "Repurchased", detail: "Dual control changed synthetic servicing ownership without fabricating payment.", tone: "resolved" }),
  written_off: Object.freeze({ title: "Written off", detail: "A dual-controlled synthetic loss disposition is recorded; it is not repayment.", tone: "critical" })
});

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const MINOR = /^(?:0|[1-9][0-9]{0,30})$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const LIFECYCLE_PAIRS = Object.freeze({
  created: Object.freeze(["current"]),
  active: Object.freeze(["current", "cured"]),
  partially_repaid: Object.freeze(["current", "cured"]),
  fully_repaid: Object.freeze(["current", "cured"]),
  delinquent: Object.freeze(["grace_period", "dpd_1_30", "dpd_31_60", "dpd_61_89"]),
  defaulted: Object.freeze(["defaulted"]),
  restructured: Object.freeze(["restructured"]),
  repurchased: Object.freeze(["repurchased"]),
  written_off: Object.freeze(["written_off"])
});
const ADVERSE = new Set(["grace_period", "dpd_1_30", "dpd_31_60", "dpd_61_89", "defaulted"]);
const TERMINAL = new Set(["fully_repaid", "written_off"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function validDateTime(value) {
  return typeof value === "string" && /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
    Number.isFinite(new Date(value).getTime());
}

function minor(value) {
  if (typeof value !== "string" || !MINOR.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function validDpd(classification, daysPastDue) {
  if (!Number.isSafeInteger(daysPastDue) || daysPastDue < 0 || daysPastDue > 100000) return false;
  return {
    current: daysPastDue === 0,
    cured: daysPastDue === 0,
    grace_period: daysPastDue <= 3,
    dpd_1_30: daysPastDue >= 4 && daysPastDue <= 30,
    dpd_31_60: daysPastDue >= 31 && daysPastDue <= 60,
    dpd_61_89: daysPastDue >= 61 && daysPastDue <= 89,
    defaulted: daysPastDue >= 90,
    restructured: daysPastDue >= 0,
    repurchased: daysPastDue >= 0,
    written_off: daysPastDue >= 0
  }[classification] === true;
}

function normalizedInstallment(row, obligation) {
  if (
    !row || typeof row !== "object" || Array.isArray(row) ||
    row.schemaVersion !== "obligation_installment.v1" ||
    !IDENTIFIER.test(row.installmentId ?? "") || row.obligationId !== obligation.obligationId ||
    !Number.isSafeInteger(row.installmentNumber) || row.installmentNumber < 1 ||
    row.scheduleSequence !== obligation.scheduleSequence ||
    row.scheduleVersion !== obligation.scheduleVersion || !validDateTime(row.dueAt) ||
    !new Set(["scheduled", "partial", "paid"]).has(row.status)
  ) return null;
  const scheduledPrincipal = minor(row.scheduledPrincipalMinor);
  const scheduledInterest = minor(row.scheduledInterestMinor);
  const scheduledFee = minor(row.scheduledFeeMinor);
  const paidPrincipal = minor(row.paidPrincipalMinor);
  const paidInterest = minor(row.paidInterestMinor);
  const paidFee = minor(row.paidFeeMinor);
  if (
    [scheduledPrincipal, scheduledInterest, scheduledFee, paidPrincipal, paidInterest, paidFee]
      .some((value) => value === null) ||
    paidPrincipal > scheduledPrincipal || paidInterest > scheduledInterest || paidFee > scheduledFee
  ) return null;
  const outstandingPrincipalMinor = scheduledPrincipal - paidPrincipal;
  const outstandingInterestMinor = scheduledInterest - paidInterest;
  const outstandingFeeMinor = scheduledFee - paidFee;
  const outstandingMinor = outstandingPrincipalMinor + outstandingInterestMinor + outstandingFeeMinor;
  if ((row.status === "paid") !== (outstandingMinor === 0n)) return null;
  return {
    installmentId: row.installmentId,
    installmentNumber: row.installmentNumber,
    dueAt: row.dueAt,
    status: row.status,
    outstandingPrincipalMinor: String(outstandingPrincipalMinor),
    outstandingInterestMinor: String(outstandingInterestMinor),
    outstandingFeeMinor: String(outstandingFeeMinor),
    outstandingMinor: String(outstandingMinor)
  };
}

function stagePresentation(classification) {
  const stageIndex = SERVICING_CASE_STAGE_COPY.findIndex(({ key }) => key === classification);
  if (classification === "cured" || classification === "restructured" || classification === "repurchased") {
    return SERVICING_CASE_STAGE_COPY.map((stage, index) => ({ ...stage, state: index === 0 ? "current" : "upcoming" }));
  }
  if (classification === "written_off") {
    return SERVICING_CASE_STAGE_COPY.map((stage) => ({ ...stage, state: "complete" }));
  }
  return SERVICING_CASE_STAGE_COPY.map((stage, index) => ({
    ...stage,
    state: index < stageIndex ? "complete" : index === stageIndex ? "current" : "upcoming"
  }));
}

function actionPresentation(action, obligation) {
  if (action === undefined || action === null) return null;
  if (
    !action || typeof action !== "object" || Array.isArray(action) ||
    action.schemaVersion !== "sandbox_servicing_action.v1" ||
    action.obligationId !== obligation.obligationId ||
    action.nextClassification !== obligation.servicingClassification ||
    action.nextStatus !== obligation.status ||
    action.reasonCode !== obligation.servicingReasonCode ||
    action.daysPastDue !== obligation.daysPastDue ||
    action.oldestUnpaidInstallmentId !== obligation.oldestUnpaidInstallmentId ||
    action.scheduleSequenceAfter !== obligation.scheduleSequence ||
    action.effectiveAt !== obligation.servicingEffectiveAt ||
    action.policyVersion !== SERVICING_CASE_POLICY_VERSION ||
    action.sandboxOnly !== true || action.productionFundsMoved !== false ||
    !IDENTIFIER.test(action.servicingActionId ?? "") ||
    !HASH.test(action.servicingActionHash ?? "") ||
    action.subjectId !== obligation.subjectId ||
    !LIFECYCLE_PAIRS[action.previousStatus] ||
    !SERVICING_CASE_CLASSIFICATION_COPY[action.previousClassification] ||
    !Number.isSafeInteger(action.scheduleSequenceBefore) || action.scheduleSequenceBefore < 1 ||
    !new Set(["advance", "cure", "restructure", "repurchase", "write_off"]).has(action.actionType) ||
    !new Set(["system_worker", "repayment", "dual_control"]).has(action.source) ||
    !validDateTime(action.effectiveAt)
  ) return null;
  const sourceByAction = {
    advance: "system_worker",
    cure: "repayment",
    restructure: "dual_control",
    repurchase: "dual_control",
    write_off: "dual_control"
  };
  const scheduleDelta = action.actionType === "restructure" ? 1 : 0;
  if (
    sourceByAction[action.actionType] !== action.source ||
    !LIFECYCLE_PAIRS[action.previousStatus].includes(action.previousClassification) ||
    action.scheduleSequenceAfter !== action.scheduleSequenceBefore + scheduleDelta ||
    (action.actionType === "cure" && !ADVERSE.has(action.previousClassification))
  ) return null;
  const after = action.balancesAfter;
  if (
    !after ||
    after.outstandingPrincipalMinor !== obligation.outstandingPrincipalMinor ||
    after.outstandingInterestMinor !== obligation.outstandingInterestMinor ||
    after.outstandingFeesMinor !== obligation.outstandingFeesMinor ||
    after.totalRepaidMinor !== obligation.totalRepaidMinor ||
    [
      action.balancesBefore?.outstandingPrincipalMinor,
      action.balancesBefore?.outstandingInterestMinor,
      action.balancesBefore?.outstandingFeesMinor,
      action.balancesBefore?.totalRepaidMinor,
      after.outstandingPrincipalMinor,
      after.outstandingInterestMinor,
      after.outstandingFeesMinor,
      after.totalRepaidMinor
    ].some((value) => minor(value) === null)
  ) return null;
  return {
    actionId: action.servicingActionId,
    actionType: action.actionType,
    source: action.source,
    previousClassification: action.previousClassification,
    nextClassification: action.nextClassification,
    reasonCode: action.reasonCode,
    effectiveAt: action.effectiveAt
  };
}

export function createServicingCasePresentation(obligation, servicingAction = null) {
  if (
    !obligation || typeof obligation !== "object" || Array.isArray(obligation) ||
    obligation.schemaVersion !== "obligation.v2" ||
    !IDENTIFIER.test(obligation.obligationId ?? "") ||
    obligation.scheduleVersion !== "obligation_schedule.v1" ||
    !HASH.test(obligation.scheduleHash ?? "") ||
    !Number.isSafeInteger(obligation.scheduleSequence) || obligation.scheduleSequence < 1 ||
    obligation.servicingPolicyVersion !== SERVICING_CASE_POLICY_VERSION ||
    obligation.sandboxOnly !== true || obligation.productionFundsMoved !== false ||
    !new Set(["pending", "executed"]).has(obligation.executionStatus) ||
    !LIFECYCLE_PAIRS[obligation.status]?.includes(obligation.servicingClassification) ||
    !SERVICING_CASE_CLASSIFICATION_COPY[obligation.servicingClassification] ||
    !validDpd(obligation.servicingClassification, obligation.daysPastDue) ||
    !validDateTime(obligation.servicingEffectiveAt) ||
    !new Set(["sandbox_platform", "sandbox_originator"]).has(obligation.servicingOwnerCode) ||
    !Array.isArray(obligation.installments) || obligation.installments.length < 1 ||
    obligation.installments.length > 520
  ) return null;
  const amounts = [
    obligation.originalPrincipalMinor,
    obligation.outstandingPrincipalMinor,
    obligation.outstandingInterestMinor,
    obligation.outstandingFeesMinor,
    obligation.totalRepaidMinor
  ].map(minor);
  if (amounts.some((value) => value === null)) return null;
  const installments = obligation.installments.map((row) => normalizedInstallment(row, obligation));
  if (installments.some((row) => row === null)) return null;
  const ids = new Set(installments.map(({ installmentId }) => installmentId));
  if (ids.size !== installments.length) return null;
  const scheduledPrincipalMinor = obligation.installments.reduce(
    (sum, row) => sum + (minor(row.scheduledPrincipalMinor) ?? 0n),
    0n
  );
  const installmentOutstandingPrincipalMinor = installments.reduce(
    (sum, row) => sum + BigInt(row.outstandingPrincipalMinor),
    0n
  );
  const installmentOutstandingInterestMinor = installments.reduce(
    (sum, row) => sum + BigInt(row.outstandingInterestMinor),
    0n
  );
  const installmentOutstandingFeeMinor = installments.reduce(
    (sum, row) => sum + BigInt(row.outstandingFeeMinor),
    0n
  );
  const installmentPaidMinor = obligation.installments.reduce((sum, row) =>
    sum + BigInt(row.paidPrincipalMinor) + BigInt(row.paidInterestMinor) + BigInt(row.paidFeeMinor), 0n);
  if (
    scheduledPrincipalMinor < amounts[1] ||
    scheduledPrincipalMinor > amounts[0] ||
    installmentOutstandingPrincipalMinor !== amounts[1] ||
    installmentOutstandingInterestMinor !== amounts[2] ||
    installmentOutstandingFeeMinor !== amounts[3] ||
    (obligation.scheduleSequence === 1
      ? installmentPaidMinor !== amounts[4]
      : installmentPaidMinor > amounts[4])
  ) return null;
  const oldest = obligation.oldestUnpaidInstallmentId;
  if (oldest !== null && !ids.has(oldest)) return null;
  if (obligation.daysPastDue > 0 && oldest === null) return null;
  const effectiveAt = new Date(obligation.servicingEffectiveAt).getTime();
  const outstanding = installments.filter((row) => BigInt(row.outstandingMinor) > 0n)
    .sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt) || left.installmentNumber - right.installmentNumber);
  const pastDueRows = ADVERSE.has(obligation.servicingClassification)
    ? outstanding.filter((row) => new Date(row.dueAt).getTime() < effectiveAt)
    : [];
  if (
    new Set(["current", "cured"]).has(obligation.servicingClassification) &&
    outstanding.some((row) => new Date(row.dueAt).getTime() < effectiveAt)
  ) return null;
  const pastDuePrincipalMinor = pastDueRows.reduce(
    (sum, row) => sum + BigInt(row.outstandingPrincipalMinor),
    0n
  );
  const pastDueInterestMinor = pastDueRows.reduce(
    (sum, row) => sum + BigInt(row.outstandingInterestMinor),
    0n
  );
  const pastDueFeeMinor = pastDueRows.reduce(
    (sum, row) => sum + BigInt(row.outstandingFeeMinor),
    0n
  );
  const pastDueMinor = pastDuePrincipalMinor + pastDueInterestMinor + pastDueFeeMinor;
  if (ADVERSE.has(obligation.servicingClassification) && pastDueMinor === 0n) return null;
  const latestAction = actionPresentation(servicingAction, obligation);
  if (servicingAction && !latestAction) return null;
  const totalOutstandingMinor = amounts[1] + amounts[2] + amounts[3];
  return deepFreeze({
    obligationId: obligation.obligationId,
    lifecycleStatus: obligation.status,
    classification: obligation.servicingClassification,
    classificationCopy: SERVICING_CASE_CLASSIFICATION_COPY[obligation.servicingClassification],
    daysPastDue: obligation.daysPastDue,
    outstandingMinor: String(totalOutstandingMinor),
    pastDueMinor: String(pastDueMinor),
    pastDuePrincipalMinor: String(pastDuePrincipalMinor),
    pastDueInterestMinor: String(pastDueInterestMinor),
    pastDueFeeMinor: String(pastDueFeeMinor),
    totalRepaidMinor: obligation.totalRepaidMinor,
    nextDueAt: outstanding[0]?.dueAt ?? null,
    oldestUnpaidInstallmentId: oldest,
    scheduleSequence: obligation.scheduleSequence,
    policyVersion: obligation.servicingPolicyVersion,
    servicingOwnerCode: obligation.servicingOwnerCode,
    servicingEffectiveAt: obligation.servicingEffectiveAt,
    servicingReasonCode: obligation.servicingReasonCode,
    stages: stagePresentation(obligation.servicingClassification),
    installments,
    latestAction,
    adverse: ADVERSE.has(obligation.servicingClassification),
    cureAvailable: ADVERSE.has(obligation.servicingClassification) && obligation.executionStatus === "executed" && pastDueMinor > 0n,
    repaymentAvailable: obligation.executionStatus === "executed" && !TERMINAL.has(obligation.status) && totalOutstandingMinor > 0n,
    suggestedPaymentMinor: String(pastDueMinor > 0n ? pastDueMinor : totalOutstandingMinor),
    noPenalty: true,
    trustedTimeOnly: true,
    privilegedDisposition: "operations_plus_risk",
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "servicing_case_presentation.v1"
  });
}

export function hasVerifiedServicingCase(obligation, servicingAction = null) {
  return createServicingCasePresentation(obligation, servicingAction) !== null;
}
