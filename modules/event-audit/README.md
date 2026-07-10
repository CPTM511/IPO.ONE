# event-audit

Owns append-only `CreditEvent` and `AuditEvent` storage for the local MVP foundation. Other modules produce events for their own state changes; this module stores and filters them without mutating business state.

Public interface: `EventStore`.
