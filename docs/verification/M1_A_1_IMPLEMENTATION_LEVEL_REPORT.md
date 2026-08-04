# M1-A.1 Implementation Level Report

Audit date: 2026-08-04

The machine-readable authority for this report is
`product/traceability/ipo-one.m1-requirement-evidence.v1.json`. Run
`pnpm run check:m1-requirements` to validate the exact 44-ID registry,
Constitution hash, evidence hashes, classifications, and explicit exclusions.

## Classification totals

| Classification | Count |
| --- | ---: |
| `NOT_IMPLEMENTED` | 1 |
| `WIRED_MOCK` | 0 |
| `IMPLEMENTED_UNVERIFIED` | 8 |
| `VERIFIED_SANDBOX` | 35 |
| `VERIFIED_REAL` | 0 |
| `PRODUCTION_READY` | 0 |

## Unverified or absent requirements

| Requirement | Classification | Reproducible blocking evidence gap |
| --- | --- | --- |
| `REQ-CREDIT-009` | `IMPLEMENTED_UNVERIFIED` | No isolated proof of complete canonical CreditLine recalculation and Human/Agent parity. It remains a projection, never independent authority. |
| `REQ-PAY-002` | `IMPLEMENTED_UNVERIFIED` | Repayment executes, but Protocol Execution Fee and Financial Revenue Share runtime policy is frozen pending a Founder-approved Fee Policy or ADR. |
| `REQ-UX-001` | `IMPLEMENTED_UNVERIFIED` | Real SIWE Human credit through repayment/Credit Outcome passed; durable Dispute/Correction is absent. |
| `REQ-UX-003` | `IMPLEMENTED_UNVERIFIED` | No authenticated Capital Partner browser journey. |
| `REQ-UX-004` | `IMPLEMENTED_UNVERIFIED` | No authenticated Risk/Operations browser journey. |
| `REQ-UX-005` | `IMPLEMENTED_UNVERIFIED` | Durable Agent state recovers after reload, but browser continuation still depends on a same-tab Agent Offer receipt. |
| `REQ-TRADE-002` | `IMPLEMENTED_UNVERIFIED` | No current approved external venue read is bound to this dirty candidate snapshot. |
| `REQ-PILOT-001` | `NOT_IMPLEMENTED` | Dispute, appeal, and additive correction case workflow is absent. |
| `REQ-PILOT-002` | `IMPLEMENTED_UNVERIFIED` | Retention, privacy, named support, incident ownership, and complete closed-pilot workflow remain unresolved. |

## Evidence-based changes

`REQ-UX-002` moves from `IMPLEMENTED_UNVERIFIED` to `VERIFIED_SANDBOX`.
The status is supported by both the real SIWE Principal/Agent browser lifecycle
and a separate protected reference-Agent acceptance that produced a fresh
Mandate, Obligation, repayment, and thirteen Evidence events.

`REQ-EXEC-003` remains `VERIFIED_SANDBOX` with stronger evidence. Its durable
PostgreSQL Lockbox assertions now have matching real-browser and independent
Agent-runtime evidence. This does not elevate it to `VERIFIED_REAL` and does not
authorize custody, pooling, unrestricted transfer, production, or real funds.

`REQ-UX-001` and `REQ-UX-005` are deliberately not upgraded. A passing partial
journey or same-tab reload cannot override their unresolved canonical steps.

## Gate semantics

- `VERIFIED_SANDBOX` requires a passing executable runtime artifact plus bounded
  assertions and implementation paths.
- Source presence, filenames, comments, fixtures, test names, UI presence, or
  passing unit tests alone cannot produce `VERIFIED_SANDBOX`.
- `VERIFIED_REAL` requires approved current external runtime evidence. None is
  claimed.
- `PRODUCTION_READY` requires a Founder-approved immutable clean release and all
  production gates. None is claimed.
- Failed evidence remains retained and cannot be converted to a pass by adding
  unrelated tests.
