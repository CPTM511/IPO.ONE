import { DomainError } from "./errors.js";
import {
  LockboxStatus,
  ObligationStatus,
  SettlementStatus,
  SpendRequestStatus,
  SubjectStatus
} from "./enums.js";

function machine(definition) {
  return Object.freeze(
    Object.fromEntries(Object.entries(definition).map(([key, values]) => [key, Object.freeze(values)]))
  );
}

export const SubjectTransitions = machine({
  [SubjectStatus.PENDING]: [SubjectStatus.ACTIVE, SubjectStatus.SUSPENDED, SubjectStatus.CLOSED],
  [SubjectStatus.ACTIVE]: [SubjectStatus.SUSPENDED, SubjectStatus.CLOSED],
  [SubjectStatus.SUSPENDED]: [SubjectStatus.ACTIVE, SubjectStatus.CLOSED],
  [SubjectStatus.CLOSED]: []
});

export const LockboxTransitions = machine({
  [LockboxStatus.CREATED]: [LockboxStatus.ACTIVE, LockboxStatus.CLOSED],
  [LockboxStatus.ACTIVE]: [LockboxStatus.FROZEN, LockboxStatus.CLOSED],
  [LockboxStatus.FROZEN]: [LockboxStatus.ACTIVE, LockboxStatus.CLOSED],
  [LockboxStatus.CLOSED]: []
});

export const ObligationTransitions = machine({
  [ObligationStatus.CREATED]: [ObligationStatus.ACTIVE, ObligationStatus.CLOSED],
  [ObligationStatus.ACTIVE]: [
    ObligationStatus.PARTIALLY_REPAID,
    ObligationStatus.FULLY_REPAID,
    ObligationStatus.OVERDUE,
    ObligationStatus.DEFAULTED,
    ObligationStatus.CLOSED
  ],
  [ObligationStatus.PARTIALLY_REPAID]: [
    ObligationStatus.FULLY_REPAID,
    ObligationStatus.OVERDUE,
    ObligationStatus.DEFAULTED,
    ObligationStatus.CLOSED
  ],
  [ObligationStatus.FULLY_REPAID]: [ObligationStatus.CLOSED],
  [ObligationStatus.OVERDUE]: [ObligationStatus.PARTIALLY_REPAID, ObligationStatus.DEFAULTED, ObligationStatus.CLOSED],
  [ObligationStatus.DEFAULTED]: [ObligationStatus.CLOSED],
  [ObligationStatus.CLOSED]: []
});

export const SpendRequestTransitions = machine({
  [SpendRequestStatus.REQUESTED]: [SpendRequestStatus.APPROVED, SpendRequestStatus.REJECTED, SpendRequestStatus.FAILED],
  [SpendRequestStatus.APPROVED]: [SpendRequestStatus.SETTLED, SpendRequestStatus.FAILED],
  [SpendRequestStatus.REJECTED]: [],
  [SpendRequestStatus.SETTLED]: [],
  [SpendRequestStatus.FAILED]: []
});

export const SettlementTransitions = machine({
  [SettlementStatus.RECORDED]: [SettlementStatus.SETTLED, SettlementStatus.FAILED],
  [SettlementStatus.SETTLED]: [],
  [SettlementStatus.FAILED]: []
});

export function assertTransition(machineName, transitions, from, to) {
  const allowed = transitions[from] ?? [];
  if (!allowed.includes(to)) {
    throw new DomainError("invalid_state_transition", `${machineName} cannot transition from ${from} to ${to}`, {
      machineName,
      from,
      to,
      allowed
    });
  }
}
