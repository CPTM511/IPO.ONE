import { DomainError } from "./errors.js";
import {
  LockboxStatus,
  MandateStatus,
  ObligationStatus,
  PluginStatus,
  TransferIntentStatus,
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

export const MandateTransitions = machine({
  [MandateStatus.DRAFT]: [MandateStatus.ACTIVE, MandateStatus.REVOKED, MandateStatus.EXPIRED],
  [MandateStatus.ACTIVE]: [MandateStatus.SUSPENDED, MandateStatus.REVOKED, MandateStatus.EXPIRED],
  [MandateStatus.SUSPENDED]: [MandateStatus.ACTIVE, MandateStatus.REVOKED, MandateStatus.EXPIRED],
  [MandateStatus.REVOKED]: [],
  [MandateStatus.EXPIRED]: []
});

export const PluginTransitions = machine({
  [PluginStatus.PENDING]: [PluginStatus.ACTIVE, PluginStatus.REVOKED],
  [PluginStatus.ACTIVE]: [PluginStatus.SUSPENDED, PluginStatus.REVOKED],
  [PluginStatus.SUSPENDED]: [PluginStatus.ACTIVE, PluginStatus.REVOKED],
  [PluginStatus.REVOKED]: []
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
  [ObligationStatus.OVERDUE]: [
    ObligationStatus.PARTIALLY_REPAID,
    ObligationStatus.FULLY_REPAID,
    ObligationStatus.DEFAULTED,
    ObligationStatus.CLOSED
  ],
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

export const TransferIntentTransitions = machine({
  [TransferIntentStatus.CREATED]: [TransferIntentStatus.QUOTED, TransferIntentStatus.EXPIRED],
  [TransferIntentStatus.QUOTED]: [
    TransferIntentStatus.AUTHORIZED,
    TransferIntentStatus.FAILED,
    TransferIntentStatus.EXPIRED
  ],
  [TransferIntentStatus.AUTHORIZED]: [
    TransferIntentStatus.SUBMITTED,
    TransferIntentStatus.FAILED,
    TransferIntentStatus.EXPIRED
  ],
  [TransferIntentStatus.SUBMITTED]: [
    TransferIntentStatus.PENDING,
    TransferIntentStatus.SETTLED,
    TransferIntentStatus.FAILED
  ],
  [TransferIntentStatus.PENDING]: [
    TransferIntentStatus.PENDING,
    TransferIntentStatus.SETTLED,
    TransferIntentStatus.FAILED
  ],
  [TransferIntentStatus.SETTLED]: [TransferIntentStatus.REVERSED],
  [TransferIntentStatus.FAILED]: [],
  [TransferIntentStatus.REVERSED]: [],
  [TransferIntentStatus.EXPIRED]: []
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
