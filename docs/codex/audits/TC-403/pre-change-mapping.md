# TC-403 pre-change mapping

Date: 2026-07-26

Source branch: `codex/commercial-access-release`

Source commit: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

Human gate: the IPO.ONE Founder accepted TC-402 and explicitly authorized
TC-403 implementation. This gate permits local/offline implementation,
failure injection, a temporary local PostgreSQL disaster-recovery exercise,
and security regression. It does not authorize a Hyperliquid Exchange write,
API Wallet or signer provisioning, deployment, mainnet, payout, withdrawal,
transfer, production credentials, private data, or real funds.

## Accepted requirements mapped to current truth

| TC-403 requirement | Existing control | Gap before TC-403 | Planned bounded change |
| --- | --- | --- | --- |
| Backup and restore | Ordered SQL migrations, durable Event/Evidence/Ledger, restart tests | No complete Trading Facility dump/restore comparison or reproducible local drill | Add a localhost/test-database-only physical PostgreSQL drill that fingerprints and compares Facility, Ledger, Evidence, execution, risk, reconciliation, funding, and settlement truth |
| Process/database failure | Application restart and prior physical PostgreSQL restart tests | No one-record TC-403 assurance result binding both forms of recovery | Bind restart and restore evidence through a closed operability-assurance contract |
| Signer loss, rotation, and revocation | Dedicated signer reference, durable nonce state, no uncertain retry, signer retirement boundary | No TC-403 drill matrix or named recovery owner/runbook | Add fail-closed signer-loss/key-rotation drill requirements; do not provision, rotate, or revoke a real credential |
| Adapter/venue outage | Circuit breaker, `STALE`/`UNKNOWN`, reconciliation safe stop | Alert thresholds and end-to-end operations evidence absent | Add fixed Testnet-only staleness/reconciliation SLOs and venue-outage scenario |
| Incident/takedown | Generic private-pilot runbooks; Founder is interim no-funds/Testnet incident owner | Trading Capital routes, closure evidence, and exact stop conditions absent | Add a Trading Capital Testnet operations and disaster-recovery runbook |
| Risk/data staleness alerts | Risk Guardian freshness states | No named alert matrix or bounded thresholds for TC-403 | Add a source-fixed Testnet-only alert policy with named accountable owner |
| Reconciliation SLO | Durable poll/circuit-breaker state | Exact warning/critical time and closure requirement absent | Add fixed local/Testnet SLOs; breaches block new risk and cannot auto-recover |
| Capacity/load bounds | Global API/admission bounds and module-local list limits | No Trading Capital operability-assurance input/load ceiling or abuse test | Add closed object/list/byte/concurrency ceilings and deterministic load tests |
| P0/P1 governance | Security tests and threat model | No TC-403 finding register or machine-enforced release block | Open P0/P1 findings hard-block; all resolved is necessary but not sufficient |
| Independent review | Explicitly absent in the repository | Codex cannot independently review its own work | Add a separation-of-duties review contract and handoff checklist; status remains `NOT_PERFORMED` until external evidence is supplied |
| Named owners/current runbooks | Founder is interim no-funds/Testnet incident owner | Specialist production operators and independent reviewer are not appointed | Name Founder as interim Testnet accountability owner only; keep production authority false and the independent reviewer unassigned |

## Invariants preserved

- One canonical Facility, Obligation, Ledger, Event stream, and Evidence model.
- `STALE` and `UNKNOWN` never authorize new risk.
- Unknown Exchange outcomes are never resent.
- Signer loss cannot grant custody, withdrawal, transfer, approval, or
  settlement authority.
- Restore never rewrites history and never creates a second economic truth.
- No automatic unfreeze, rollback, key operation, deployment, or release.
- No self-authored test or audit is represented as independent assurance.
- All live Hyperliquid, signer, mainnet, payout, production, and real-value
  paths remain unavailable.

## Expected completion state

The code and local disaster-recovery drill may reach
`IMPLEMENTED_UNVERIFIED`. RELEASE-001 remains blocked until an independent
reviewer supplies an accepted report with no open P0/P1 findings and the
Founder separately accepts TC-403 evidence.
