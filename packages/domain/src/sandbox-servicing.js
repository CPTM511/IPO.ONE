import {
  ObligationExecutionStatus,
  ObligationStatus,
  SandboxServicingOwner,
  SandboxServicingResolution,
  ServicingClassification,
  enumValues
} from "./enums.js";
import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import {
  assertEnumValue,
  assertNoRawPiiReference,
  assertNonEmptyString
} from "./validators.js";

const DAY_MS = 86_400_000;

export const SANDBOX_SERVICING_POLICY_VERSION = "sandbox-servicing-policy.v1";
export const SANDBOX_SERVICING_GRACE_DAYS = 3;
export const SANDBOX_SERVICING_DEFAULT_DPD = 90;

function immutable(value) {
  return Object.freeze(structuredClone(value));
}

function moneySnapshot(obligation) {
  return Object.freeze({
    outstandingPrincipalMinor: obligation.outstandingPrincipalMinor,
    outstandingInterestMinor: obligation.outstandingInterestMinor,
    outstandingFeesMinor: obligation.outstandingFeesMinor,
    totalRepaidMinor: obligation.totalRepaidMinor
  });
}

function installmentOutstandingMinor(row) {
  return BigInt(row.scheduledPrincipalMinor) - BigInt(row.paidPrincipalMinor) +
    BigInt(row.scheduledInterestMinor) - BigInt(row.paidInterestMinor) +
    BigInt(row.scheduledFeeMinor) - BigInt(row.paidFeeMinor);
}

function assertSharedServicingObligation(obligation, { executed = true } = {}) {
  if (
    !obligation || obligation.schemaVersion !== "obligation.v2" ||
    obligation.sandboxOnly !== true || obligation.productionFundsMoved !== false ||
    !Array.isArray(obligation.installments) || obligation.installments.length === 0 ||
    (executed && obligation.executionStatus !== ObligationExecutionStatus.EXECUTED)
  ) {
    throw new DomainError("servicing_state_unavailable", "shared sandbox servicing state is unavailable");
  }
  assertNoRawPiiReference(obligation, "sandboxServicing.obligation");
  return obligation;
}

function basePerformingStatus(obligation) {
  const total = BigInt(obligation.outstandingPrincipalMinor) +
    BigInt(obligation.outstandingInterestMinor) + BigInt(obligation.outstandingFeesMinor);
  if (total === 0n) return ObligationStatus.FULLY_REPAID;
  if (
    [ObligationStatus.RESTRUCTURED, ObligationStatus.REPURCHASED].includes(obligation.status) &&
    [ServicingClassification.RESTRUCTURED, ServicingClassification.REPURCHASED].includes(
      obligation.servicingClassification
    )
  ) {
    return obligation.status;
  }
  return BigInt(obligation.totalRepaidMinor) > 0n
    ? ObligationStatus.PARTIALLY_REPAID
    : ObligationStatus.ACTIVE;
}

function classificationForDpd(daysPastDue) {
  if (daysPastDue <= SANDBOX_SERVICING_GRACE_DAYS) {
    return ServicingClassification.GRACE_PERIOD;
  }
  if (daysPastDue <= 30) return ServicingClassification.DPD_1_30;
  if (daysPastDue <= 60) return ServicingClassification.DPD_31_60;
  if (daysPastDue <= 89) return ServicingClassification.DPD_61_89;
  return ServicingClassification.DEFAULTED;
}

function reasonForClassification(classification) {
  return {
    [ServicingClassification.CURRENT]: "servicing_current",
    [ServicingClassification.GRACE_PERIOD]: "servicing_grace_period",
    [ServicingClassification.DPD_1_30]: "servicing_dpd_1_30",
    [ServicingClassification.DPD_31_60]: "servicing_dpd_31_60",
    [ServicingClassification.DPD_61_89]: "servicing_dpd_61_89",
    [ServicingClassification.DEFAULTED]: "servicing_default_threshold"
  }[classification];
}

export function assertSandboxServicingState(obligation) {
  assertSharedServicingObligation(obligation, { executed: false });
  assertEnumValue(
    "servicingClassification",
    obligation.servicingClassification,
    enumValues(ServicingClassification)
  );
  if (
    obligation.servicingPolicyVersion !== SANDBOX_SERVICING_POLICY_VERSION ||
    !Number.isSafeInteger(obligation.daysPastDue) || obligation.daysPastDue < 0 ||
    !Number.isSafeInteger(obligation.scheduleSequence) || obligation.scheduleSequence < 1 ||
    !Number.isFinite(new Date(obligation.servicingEffectiveAt).getTime()) ||
    !enumValues(SandboxServicingOwner).includes(obligation.servicingOwnerCode)
  ) {
    throw new DomainError("invalid_servicing_state", "sandbox servicing state is invalid");
  }
  const allowedPairs = new Map([
    [ObligationStatus.CREATED, new Set([ServicingClassification.CURRENT])],
    [ObligationStatus.ACTIVE, new Set([ServicingClassification.CURRENT, ServicingClassification.CURED])],
    [ObligationStatus.PARTIALLY_REPAID, new Set([ServicingClassification.CURRENT, ServicingClassification.CURED])],
    [ObligationStatus.FULLY_REPAID, new Set([ServicingClassification.CURRENT, ServicingClassification.CURED])],
    [ObligationStatus.DELINQUENT, new Set([
      ServicingClassification.GRACE_PERIOD,
      ServicingClassification.DPD_1_30,
      ServicingClassification.DPD_31_60,
      ServicingClassification.DPD_61_89
    ])],
    [ObligationStatus.DEFAULTED, new Set([ServicingClassification.DEFAULTED])],
    [ObligationStatus.RESTRUCTURED, new Set([ServicingClassification.RESTRUCTURED])],
    [ObligationStatus.REPURCHASED, new Set([ServicingClassification.REPURCHASED])],
    [ObligationStatus.WRITTEN_OFF, new Set([ServicingClassification.WRITTEN_OFF])]
  ]);
  if (!allowedPairs.get(obligation.status)?.has(obligation.servicingClassification)) {
    throw new DomainError("invalid_servicing_state", "Obligation lifecycle and servicing classification conflict");
  }
  if (
    (obligation.servicingClassification === ServicingClassification.CURRENT && obligation.daysPastDue !== 0) ||
    (obligation.status === ObligationStatus.DEFAULTED && obligation.daysPastDue < SANDBOX_SERVICING_DEFAULT_DPD) ||
    (obligation.oldestUnpaidInstallmentId === null && obligation.daysPastDue !== 0)
  ) {
    throw new DomainError("invalid_servicing_state", "Obligation DPD fields conflict with servicing state");
  }
  return true;
}

export function deriveSandboxServicing(obligation, { now = new Date() } = {}) {
  assertSharedServicingObligation(obligation);
  if (!Number.isFinite(now.getTime())) {
    throw new DomainError("invalid_servicing_time", "trusted servicing time is invalid");
  }
  const unpaid = obligation.installments
    .filter((row) => installmentOutstandingMinor(row) > 0n)
    .sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt) ||
      left.installmentNumber - right.installmentNumber);
  const oldest = unpaid[0];
  if (!oldest || now <= new Date(oldest.dueAt)) {
    return immutable({
      status: basePerformingStatus(obligation),
      servicingClassification: [ObligationStatus.RESTRUCTURED, ObligationStatus.REPURCHASED].includes(
        obligation.status
      ) ? obligation.servicingClassification : ServicingClassification.CURRENT,
      daysPastDue: 0,
      oldestUnpaidInstallmentId: oldest?.installmentId ?? null,
      servicingReasonCode: "servicing_current"
    });
  }
  const daysPastDue = Math.floor((now.getTime() - new Date(oldest.dueAt).getTime()) / DAY_MS);
  const servicingClassification = classificationForDpd(daysPastDue);
  return immutable({
    status: servicingClassification === ServicingClassification.DEFAULTED
      ? ObligationStatus.DEFAULTED
      : ObligationStatus.DELINQUENT,
    servicingClassification,
    daysPastDue,
    oldestUnpaidInstallmentId: oldest.installmentId,
    servicingReasonCode: reasonForClassification(servicingClassification)
  });
}

function createServicingAction({
  actionType,
  previous,
  next,
  reasonCode,
  source,
  actorId,
  approvalProposalId,
  approvalExecutionId,
  previousSchedule,
  now
}) {
  const core = {
    obligationId: previous.obligationId,
    subjectId: previous.subjectId,
    actionType,
    previousStatus: previous.status,
    nextStatus: next.status,
    previousClassification: previous.servicingClassification,
    nextClassification: next.servicingClassification,
    daysPastDue: next.daysPastDue,
    oldestUnpaidInstallmentId: next.oldestUnpaidInstallmentId,
    reasonCode,
    source,
    actorHash: hashId("actor", actorId),
    policyVersion: SANDBOX_SERVICING_POLICY_VERSION,
    scheduleSequenceBefore: previous.scheduleSequence,
    scheduleSequenceAfter: next.scheduleSequence,
    scheduleHashBefore: previous.scheduleHash,
    scheduleHashAfter: next.scheduleHash,
    balancesBefore: moneySnapshot(previous),
    balancesAfter: moneySnapshot(next),
    ...(previousSchedule ? { previousSchedule } : {}),
    ...(approvalProposalId ? { approvalProposalId } : {}),
    ...(approvalExecutionId ? { approvalExecutionId } : {}),
    effectiveAt: now.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "sandbox_servicing_action.v1"
  };
  assertNoRawPiiReference(core, "sandboxServicing.action");
  const servicingActionHash = hashId("sandbox_servicing_action", core);
  return immutable({
    servicingActionId: `sandbox_servicing_action_${servicingActionHash.slice(2)}`,
    servicingActionHash,
    ...core
  });
}

function applyDerivedServicing(previous, derived, { reasonCode, now }) {
  const next = immutable({
    ...previous,
    ...derived,
    servicingEffectiveAt: now.toISOString(),
    servicingReasonCode: reasonCode ?? derived.servicingReasonCode,
    servicingPolicyVersion: SANDBOX_SERVICING_POLICY_VERSION,
    updatedAt: now.toISOString()
  });
  assertSandboxServicingState(next);
  return next;
}

export function advanceSandboxServicing(obligation, {
  actorId,
  now = new Date()
}) {
  assertNonEmptyString("actorId", actorId);
  const derived = deriveSandboxServicing(obligation, { now });
  const changed = obligation.status !== derived.status ||
    obligation.servicingClassification !== derived.servicingClassification ||
    obligation.daysPastDue !== derived.daysPastDue ||
    obligation.oldestUnpaidInstallmentId !== derived.oldestUnpaidInstallmentId ||
    obligation.servicingReasonCode !== derived.servicingReasonCode;
  if (!changed) {
    return immutable({ obligation, changed: false });
  }
  const next = applyDerivedServicing(obligation, derived, { now });
  const action = createServicingAction({
    actionType: "advance",
    previous: obligation,
    next,
    reasonCode: next.servicingReasonCode,
    source: "system_worker",
    actorId,
    now
  });
  return immutable({
    obligation: next,
    servicingAction: action,
    changed: true
  });
}

export function applySandboxServicingAfterRepayment(previous, repaid, {
  actorId,
  now = new Date()
}) {
  assertNonEmptyString("actorId", actorId);
  const derived = deriveSandboxServicing(repaid, { now });
  const wasAdverse = [
    ObligationStatus.DELINQUENT,
    ObligationStatus.DEFAULTED
  ].includes(previous.status) || [
    ServicingClassification.GRACE_PERIOD,
    ServicingClassification.DPD_1_30,
    ServicingClassification.DPD_31_60,
    ServicingClassification.DPD_61_89,
    ServicingClassification.DEFAULTED
  ].includes(previous.servicingClassification);
  const cured = wasAdverse && derived.daysPastDue === 0;
  const nextDerived = cured
    ? {
        ...derived,
        status: basePerformingStatus(repaid),
        servicingClassification: ServicingClassification.CURED,
        servicingReasonCode: "servicing_cured_by_repayment"
      }
    : derived;
  const next = applyDerivedServicing(repaid, nextDerived, { now });
  if (!cured && previous.status === next.status &&
      previous.servicingClassification === next.servicingClassification &&
      previous.daysPastDue === next.daysPastDue &&
      previous.oldestUnpaidInstallmentId === next.oldestUnpaidInstallmentId) {
    return immutable({ obligation: next });
  }
  return immutable({
    obligation: next,
    servicingAction: createServicingAction({
      actionType: cured ? "cure" : "advance",
      previous,
      next,
      reasonCode: next.servicingReasonCode,
      source: "repayment",
      actorId,
      now
    }),
    cured
  });
}

function assertResolutionEligible(obligation, allowedStatuses) {
  assertSharedServicingObligation(obligation);
  if (!allowedStatuses.includes(obligation.status)) {
    throw new DomainError("servicing_resolution_unavailable", "Obligation is not eligible for this resolution");
  }
}

function resolve({
  obligation,
  status,
  classification,
  resolutionType,
  reasonCode,
  actorId,
  approvalProposalId,
  approvalExecutionId,
  changes = {},
  previousSchedule,
  now
}) {
  assertNonEmptyString("reasonCode", reasonCode);
  assertNonEmptyString("actorId", actorId);
  assertNonEmptyString("approvalProposalId", approvalProposalId);
  assertNonEmptyString("approvalExecutionId", approvalExecutionId);
  const next = immutable({
    ...obligation,
    ...changes,
    status,
    servicingClassification: classification,
    servicingReasonCode: reasonCode,
    servicingEffectiveAt: now.toISOString(),
    resolutionType,
    resolutionReasonCode: reasonCode,
    resolutionAt: now.toISOString(),
    servicingPolicyVersion: SANDBOX_SERVICING_POLICY_VERSION,
    updatedAt: now.toISOString()
  });
  assertSandboxServicingState(next);
  return immutable({
    obligation: next,
    servicingAction: createServicingAction({
      actionType: resolutionType,
      previous: obligation,
      next,
      reasonCode,
      source: "dual_control",
      actorId,
      approvalProposalId,
      approvalExecutionId,
      previousSchedule,
      now
    })
  });
}

export function restructureSandboxObligation(obligation, {
  additionalTermDays,
  reasonCode,
  actorId,
  approvalProposalId,
  approvalExecutionId,
  now = new Date()
}) {
  assertResolutionEligible(obligation, [ObligationStatus.DELINQUENT, ObligationStatus.DEFAULTED]);
  if (!Number.isSafeInteger(additionalTermDays) || additionalTermDays < 1 || additionalTermDays > 90) {
    throw new DomainError("invalid_servicing_resolution", "restructure term must be between 1 and 90 days");
  }
  const dueAt = new Date(now.getTime() + additionalTermDays * DAY_MS).toISOString();
  const scheduleSequence = obligation.scheduleSequence + 1;
  const rowCore = {
    obligationId: obligation.obligationId,
    installmentNumber: 1,
    dueAt,
    scheduledPrincipalMinor: obligation.outstandingPrincipalMinor,
    scheduledInterestMinor: obligation.outstandingInterestMinor,
    scheduledFeeMinor: obligation.outstandingFeesMinor,
    paidPrincipalMinor: "0",
    paidInterestMinor: "0",
    paidFeeMinor: "0",
    status: "scheduled",
    scheduleVersion: "obligation_schedule.v1",
    scheduleSequence
  };
  const installment = immutable({
    installmentId: `obligation_installment_${hashId("obligation_installment", rowCore).slice(2)}`,
    ...rowCore,
    schemaVersion: "obligation_installment.v1"
  });
  const installments = Object.freeze([installment]);
  return resolve({
    obligation,
    status: ObligationStatus.RESTRUCTURED,
    classification: ServicingClassification.RESTRUCTURED,
    resolutionType: SandboxServicingResolution.RESTRUCTURE,
    reasonCode,
    actorId,
    approvalProposalId,
    approvalExecutionId,
    previousSchedule: immutable({
      scheduleSequence: obligation.scheduleSequence,
      scheduleHash: obligation.scheduleHash,
      installments: obligation.installments
    }),
    changes: {
      installmentCount: 1,
      firstPaymentAt: dueAt,
      maturityAt: dueAt,
      scheduleSequence,
      scheduleHash: hashId("obligation_schedule", installments),
      installments,
      daysPastDue: 0,
      oldestUnpaidInstallmentId: installment.installmentId
    },
    now
  });
}

export function repurchaseSandboxObligation(obligation, {
  servicingOwnerCode,
  reasonCode,
  actorId,
  approvalProposalId,
  approvalExecutionId,
  now = new Date()
}) {
  assertResolutionEligible(obligation, [
    ObligationStatus.DELINQUENT,
    ObligationStatus.DEFAULTED,
    ObligationStatus.RESTRUCTURED
  ]);
  assertEnumValue("servicingOwnerCode", servicingOwnerCode, enumValues(SandboxServicingOwner));
  if (servicingOwnerCode === obligation.servicingOwnerCode) {
    throw new DomainError("invalid_servicing_resolution", "repurchase must change the sandbox servicing owner");
  }
  return resolve({
    obligation,
    status: ObligationStatus.REPURCHASED,
    classification: ServicingClassification.REPURCHASED,
    resolutionType: SandboxServicingResolution.REPURCHASE,
    reasonCode,
    actorId,
    approvalProposalId,
    approvalExecutionId,
    changes: { servicingOwnerCode },
    now
  });
}

export function writeOffSandboxObligation(obligation, {
  reasonCode,
  actorId,
  approvalProposalId,
  approvalExecutionId,
  now = new Date()
}) {
  assertResolutionEligible(obligation, [
    ObligationStatus.DEFAULTED,
    ObligationStatus.RESTRUCTURED,
    ObligationStatus.REPURCHASED
  ]);
  const writtenOffPrincipalMinor = obligation.outstandingPrincipalMinor;
  const writtenOffInterestMinor = obligation.outstandingInterestMinor;
  const writtenOffFeesMinor = obligation.outstandingFeesMinor;
  if (BigInt(writtenOffPrincipalMinor) + BigInt(writtenOffInterestMinor) + BigInt(writtenOffFeesMinor) === 0n) {
    throw new DomainError("servicing_resolution_unavailable", "Obligation has no balance to write off");
  }
  return resolve({
    obligation,
    status: ObligationStatus.WRITTEN_OFF,
    classification: ServicingClassification.WRITTEN_OFF,
    resolutionType: SandboxServicingResolution.WRITE_OFF,
    reasonCode,
    actorId,
    approvalProposalId,
    approvalExecutionId,
    changes: {
      writtenOffPrincipalMinor,
      writtenOffInterestMinor,
      writtenOffFeesMinor
    },
    now
  });
}
