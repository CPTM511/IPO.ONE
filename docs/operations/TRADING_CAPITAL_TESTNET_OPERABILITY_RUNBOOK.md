# Trading Capital Testnet operability and disaster-recovery runbook

Status: TC-403 local/Testnet operating baseline. No live Exchange writer,
signer, API Wallet, production deployment, mainnet, payout, or real funds.

Policy:
`modules/hyperliquid-operability/policy/testnet-facility-operability-policy.v1.json`

## Owners and authority boundary

| Responsibility | Interim Testnet owner | Authority this runbook grants |
| --- | --- | --- |
| Incident/takedown accountability | `ipo_one_founder` | Review and stop decision only |
| Database recovery accountability | `ipo_one_founder` | Approve a local/test restore drill only |
| Signer lifecycle commissioning | `ipo_one_founder` | Commission a drill; no credential operation |
| Evidence custody | `ipo_one_founder` | Retain privacy-minimized hashes and reports |
| Independent-review commissioning | `ipo_one_founder` | Select a separate reviewer; cannot review own work |
| Independent reviewer | Unassigned | None until separately appointed |

These owner references are names, not Credentials, roles, pager delivery,
database access, signer material, or bypass grants. Production ownership,
notification delivery, escalation rota, credentials, custody, and deployment
remain unapproved.

The local evaluator emits privacy-minimized alert candidates at the thresholds
below. It does not deliver a page or schedule itself; both capabilities remain
false in the policy and require later protected operations approval.

## Universal first response

For any signal in this runbook:

1. Stop new risk for the affected Facility.
2. Preserve immutable Event, Evidence, Ledger, nonce, reconciliation, funding,
   settlement, policy, release, and alert references.
3. Do not retry an unknown Exchange effect.
4. Do not mutate, delete, or rewrite Event/Evidence/Ledger history.
5. Do not unfreeze, rotate/revoke a credential, switch endpoint/account, repair
   a projection, or restore a database automatically.
6. Do not submit a Hyperliquid action, withdrawal, transfer, key approval,
   mainnet action, payout, or funds movement from this runbook.
7. Require a fresh full reconciliation and an authorized human closure record
   before any future reduction in restriction.

## Alert matrix and objectives

The values below are accepted only for the source-fixed local/Testnet TC-403
policy. They are not production SLOs or financial-risk parameters.

| Signal | Warning / critical objective | Route | Runbook | Readiness effect |
| --- | --- | --- | --- | --- |
| Risk or required venue data stale | 30s / 120s | Critical to Founder | `TC403-RUNBOOK-RISK-DATA` | Block new risk |
| Reconciliation not terminal | 30s / 120s | Critical to Founder | `TC403-RUNBOOK-RECONCILIATION` | Block new risk |
| Unknown Exchange outcome aging | 30s / 120s | Critical to Founder | `TC403-RUNBOOK-UNKNOWN-OUTCOME` | Block new risk; never resend |
| Signer unavailable, lost, expired, or revoked | Immediate | Critical to Founder | `TC403-RUNBOOK-SIGNER` | Block new risk |
| Venue/adapter unavailable or response invalid | Immediate | Critical to Founder | `TC403-RUNBOOK-VENUE` | Block new risk |
| Restore fingerprint mismatch | Immediate | Critical to Founder | `TC403-RUNBOOK-RESTORE` | Block release and all affected writers |
| Capacity/input/concurrency ceiling exceeded | Immediate | High to Founder | `TC403-RUNBOOK-CAPACITY` | Deny excess; do not raise limits automatically |

Local restore-exercise objectives are RPO `0 ms` relative to the completed
source dump and RTO `900000 ms`. Backup age may not exceed `86400000 ms`.

## TC403-RUNBOOK-RISK-DATA

- Classify incomplete identity, pagination, timestamps, finality, or
  reconciliation as `UNKNOWN`, never zero exposure.
- At warning, block new risk and inspect source health.
- At critical, move or retain the Facility at least `REDUCE_ONLY`; use only
  separately authorized server-proven protection.
- Recovery requires fresh complete Evidence, full reconciliation, hysteresis,
  and human acceptance. Time alone never restores `NORMAL`.

## TC403-RUNBOOK-RECONCILIATION

- Keep `SUBMITTED` and `UNKNOWN` nonce state durable.
- Query only through the separately approved signer-free Info plane when that
  plane exists; never use an API-wallet address as account identity.
- Reconcile cloid/order/fills/positions/account state. Apply cumulative
  economics once.
- Follow `docs/operations/RECONCILIATION_RUNBOOK.md`.
- Closure requires terminal source Evidence, no unknown execution, zero
  unexplained divergence, and a new full reconciliation.

## TC403-RUNBOOK-UNKNOWN-OUTCOME

- Mark the effect `UNKNOWN`; do not mark success or failure.
- Never resubmit the action or reuse its nonce.
- Block new risk for the affected Facility.
- Preserve the original action hash, signer reference hash, nonce, cloid,
  timestamps, and redacted transport outcome.
- Reconcile through read-side truth. If truth remains unavailable, retain the
  block and escalate; uncertainty is a valid terminal operational posture.

## TC403-RUNBOOK-SIGNER

- Stop writer admission and new risk.
- Do not load a fallback key, reuse a retired address, or move signing into the
  browser, strategy, Agent, or general application process.
- Inventory `RESERVED`, `SUBMITTED`, and `UNKNOWN` records without exposing key
  material.
- A real rotation/revocation requires a new exact approval, dedicated signer,
  custody procedure, dual control, Evidence, and address non-reuse. TC-403 only
  drills the state transition and does not perform it.
- Preserve withdrawal/capital separation; signer loss must not grant custody.

## TC403-RUNBOOK-VENUE

- Open the circuit breaker and block new risk.
- Treat malformed, incomplete, stale, identity-mismatched, or untrusted
  responses as `UNKNOWN`.
- Do not switch to an unapproved endpoint, account, subaccount, asset, product,
  or network.
- Protective cancellation/flatten remains available only if separately
  authorized and server-proven to reduce exposure. TC-403 submits none.

## TC403-RUNBOOK-RESTORE

1. Confirm the target is localhost and the database name contains `test`.
2. Confirm the exact TC-403 drill acknowledgement and release identity.
3. Produce a mode-0600 custom-format dump into a mode-0700 temporary directory.
4. Restore into a newly created ephemeral local test database.
5. Compare complete fingerprints for Facility/close, Ledger
   accounts/transactions/entries, Event/Evidence/snapshots, execution/nonce,
   risk, reconciliation, funding, and settlement.
6. Require non-empty Facility, Ledger, Evidence, and settlement truth.
7. Any mismatch is critical. Retain the source untouched and do not release.
8. After a passing comparison, remove only the ephemeral restore database and
   temporary backup directory. The source database is never mutated.

Command:

```sh
DATABASE_URL='postgresql://127.0.0.1:55439/ipo_one_tc403_test' \
IPO_ONE_TC403_DRILL_APPROVAL=TC-403 \
pnpm run test:tc403:dr
```

The output is a privacy-minimized comparison and counts, not database rows.

## TC403-RUNBOOK-CAPACITY

- Maximum assurance input: 2 MiB.
- Maximum findings: 256.
- Maximum alert routes: 16.
- Maximum failure drills: 16.
- Configured concurrency ceiling: 8.
- Required deterministic boundary-arithmetic self-test: 2,048 cases.
- This is not a measured runtime-concurrency or distributed load result.
- Reject oversize/excess work before expensive evaluation.
- Do not reveal object existence, configured thresholds, Tenant IDs, account
  addresses, credentials, raw requests, or database topology in telemetry.
- Do not raise a ceiling, fail open, or bypass admission during an incident.

## Application/database restart drill

- Persist the canonical state before shutdown.
- Stop and restart the application object/service; verify exact replay and no
  second Event/Ledger effect.
- Stop and restart the temporary local PostgreSQL process; run the complete
  PostgreSQL suite again and require the same migrations, forced RLS,
  immutable history, balances, and projections.
- Process restart and database restart are separate Evidence items.

## Finding and release gate

- Every finding has a stable ID, severity, status, summary, and Evidence hash.
- Any open or accepted-launch-blocker P0/P1 finding blocks release.
- Zero open P0/P1 is necessary but not sufficient.
- Independent review must be performed by a reviewer separate from
  `ipo_one_founder`, with a report hash and review timestamp.
- Codex tests, this runbook, and the TC-403 audit are not independent review.
- A passing external review can only make TC-403 ready for Founder acceptance.
  It cannot enable Exchange writes, signers, API Wallets, mainnet, production,
  payout, deployment, or real funds.

## Rollback

Remove the internal TC-403 module, policy, schema, test, and local drill script.
No migration, operation, catalog, AuthZ, admission, route, SDK, UI, MCP,
deployment, credential, venue, Ledger, or funds rollback is required because
TC-403 adds none. Historical external-review or incident evidence, if later
created, must be retained or superseded append-only.
