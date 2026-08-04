# M1 Implementation Level Report

Historical-snapshot notice: this is the original M1-A classification report.
Current M1-A.1 classifications are machine-authoritative in
`product/traceability/ipo-one.m1-requirement-evidence.v1.json` and summarized in
`docs/verification/M1_A_1_IMPLEMENTATION_LEVEL_REPORT.md`.

Audit ID: `M1-A-20260803T132413Z`

## Evidence rubric

| Level | Required evidence |
| --- | --- |
| `NOT_IMPLEMENTED` | no executable capability path, or only specification/UX intent exists |
| `WIRED_MOCK` | callable path exists but canonical state, authority, external effect, or persistence is supplied by process-local, fixture, mock, fake, or demo infrastructure |
| `IMPLEMENTED_UNVERIFIED` | material implementation exists, but current evidence does not prove the complete approved boundary across persistence, authorization, runtime, and any required integration |
| `VERIFIED_SANDBOX` | current executable evidence proves the approved local/synthetic/no-funds boundary, including required negative authorization and persistence behavior |
| `VERIFIED_REAL` | current executable evidence proves the required real external integration or real-value boundary under explicit authority |
| `PRODUCTION_READY` | exact immutable candidate, clean reproducibility, production dependencies, operations, approvals, security, and current runtime Evidence all pass |

Unit tests, fixture hosts, UI presence, filenames, comments, and mock handlers
cannot independently satisfy `VERIFIED_SANDBOX` or higher.

## Requirement-level result

| Level | Count | Requirement IDs |
| --- | ---: | --- |
| `NOT_IMPLEMENTED` | 1 | REQ-PILOT-001 |
| `WIRED_MOCK` | 1 | REQ-EXEC-003 |
| `IMPLEMENTED_UNVERIFIED` | 7 | REQ-CREDIT-009, REQ-UX-001, REQ-UX-003, REQ-UX-004, REQ-UX-005, REQ-TRADE-002, REQ-PILOT-002 |
| `VERIFIED_SANDBOX` | 35 | all remaining stable requirements |
| `VERIFIED_REAL` | 0 | none |
| `PRODUCTION_READY` | 0 | none |

The detailed mapping is in
`docs/traceability/M1_REQUIREMENT_TRACEABILITY_MATRIX.md`.

## Critical domain assessment

| Domain | Current truth | Level / impact |
| --- | --- | --- |
| Identity | durable synthetic Human/Agent identity, Consent, Mandate, account-proof, session, RLS, and negative authorization are executable | VERIFIED_SANDBOX; no real KYC or production identity |
| Wallet authenticity | one-use proof and CAIP boundaries are durable; real wallet/connector browser E2E is absent and remote/mobile/ERC-1271 paths are disabled | VERIFIED_SANDBOX for synthetic proof; no real wallet claim |
| Mandate authority | durable exact Principal control, nonce, revocation, binding, pause/freeze, and restart behavior pass | VERIFIED_SANDBOX |
| CreditLine | Agent execution derives utilization from current authority and prevents expansion, but isolated proof of complete canonical recalculation/parity is missing | IMPLEMENTED_UNVERIFIED |
| Agent Lockbox | service has lifecycle/Ledger behavior but stores canonical objects in a process-local `Map`; no Tenant operation binding | WIRED_MOCK; P0 |
| Strategy Vault | correctly absent and explicitly not approved | not a capability; any product exposure would be a Constitution violation |
| Withdrawal/transfer restrictions | prohibited actions are absent/disabled and synthetic Facilities are non-withdrawable in tests | VERIFIED_SANDBOX only |
| Settlement | synthetic Trading Capital settlement, reconciliation, Ledger, and performance proof pass | VERIFIED_SANDBOX; no real settlement authority |
| Deterministic repayment | exact fee/interest/principal allocation and idempotent Ledger receipt pass locally | VERIFIED_SANDBOX; Founder fee formulas unresolved |
| Receipts | server-authored Evidence, official reports, and owned reads exist; browser-generated exports remain simulation-only | VERIFIED_SANDBOX at backend boundary |
| Reputation | Evidence-derived outcomes and Credit Passport exist; legacy universal score code remains in demo scope | VERIFIED_SANDBOX for Passport; prevent demo score from becoming authority |
| Dispute/audit trail | append-only Event/Evidence/Ledger audit exists; a user/operator dispute/appeal/case workflow does not | REQ-PILOT-001 NOT_IMPLEMENTED; P1 closed-pilot blocker |

## External integration truth

- Loopback signed Provider sandbox: verified locally; not an external Provider.
- Base Sepolia and X Layer adapter conformance: verified with synthetic/unit
  evidence.
- Base Sepolia Registry and Evidence contracts: compile and closed-boundary
  live-unit tests pass; M1-A performed no transaction and no fresh live RPC
  verification.
- Hyperliquid Testnet: read/simulation adapters and persistence tests exist;
  M1-A did not activate the separately gated live read.
- Real KYC, lender, bank/payment rail, custody, wallet connector, external
  signer, mainnet, and real capital: absent or explicitly disabled.

Therefore no stable Requirement ID receives `VERIFIED_REAL`.

## Authorization and persistence integrity

Strong current evidence:

- 82 PostgreSQL tests prove fresh migration, forced RLS, atomic event/outbox,
  idempotency, restart recovery, reconciliation, Human/Agent shared credit,
  Capital Partner, and Trading Capital synthetic paths.
- 33 host-context security tests prove bounded ingress, Tenant authorization,
  protective operations, and disabled real-value paths.
- 59 host-context transport tests prove closed local HTTP/MCP/SDK contracts and
  disabled remote Agent behavior.

Known losses of integrity:

- Lockbox canonical state is process-local rather than PostgreSQL-backed.
- Browser journeys have no current authenticated runtime evidence.
- Fixture browser hosts can exercise flows without proving current product
  authentication, persistence, or real server composition.
- Legacy demo routes expose a different, process-local product shape and must
  not be confused with the 76-operation Tenant protocol.

## P0 gaps

1. `P0-RC-REPRO`: no clean reproducible install/build and aggregate RC check.
2. `P0-RUNTIME-E2E`: no current authenticated Human or Agent browser Golden
   Flow evidence.
3. `P0-LOCKBOX-DURABILITY`: Agent Lockbox is process-local and lacks durable
   Tenant authorization/persistence.
4. `P0-FEE-AUTHORITY`: the two Founder-directed fee formulas have no approved
   Requirement ID or policy authority and conflict with accepted “unapproved”
   fee status.

## P1 gaps

1. `P1-DISPUTE`: dispute/appeal/correction case workflow absent.
2. `P1-CREDITLINE-PROOF`: complete canonical capacity recalculation/parity is
   not isolated in current evidence.
3. `P1-UI-ROLE-JOURNEYS`: Capital Partner, Risk/Operations, and workspace
   recovery are not current-browser verified.
4. `P1-LEGACY-DEMO-BOUNDARY`: demo API and 300-850 score code coexist with the
   canonical product and require explicit non-authoritative treatment in any RC.
5. `P1-PILOT-OPERATIONS`: feedback/alerts exist, but retention, support,
   incident ownership, and privacy approvals are incomplete.

## Production-readiness denial

No capability is production ready because the candidate is not immutable or
reproducible, authenticated browser journeys are not currently proven, external
production dependencies and permissions are absent, closed-pilot activation is
disabled, and real-value/mainnet/custody/signer actions are not approved.
