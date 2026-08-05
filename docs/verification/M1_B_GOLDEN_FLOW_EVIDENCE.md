# M1-B Authenticated Golden Flow Evidence

## Evidence status

Status: `LOCAL_SIGN_IN_CONFIRMED_VERCEL_DEPLOYED_EVIDENCE_PENDING`

This report is the evidence ledger for the Founder-authorized M1-B Agent Golden
Flow. It is not a test plan presented as proof. A row may move to `PASS` only
when it has reproducible machine evidence and current human-visible browser
evidence bound to the same exact deployed commit.

Base checkpoint:
`59dc448576553537b9bb4b702b308e461734dee3`

Working branch: `codex/m1-b-deployable-sandbox`

Exact deployed commit: `NOT_AVAILABLE`

Exact deployed tree: `NOT_AVAILABLE`

Deployment artifact manifest: `NOT_AVAILABLE`

Deployment URL: `NOT_AVAILABLE`

## Current blockers

1. The Founder subsequently completed real wallet SIWE in the current local
   browser. That is local authentication evidence only; it is not deployed
   Vercel Golden Flow evidence.
2. The wallet-enabled Chrome session cannot yet provide an exported
   Playwright process; no Playwright trace exists for the real-wallet session.
3. The Founder Vercel amendment resolved the deployment provider. The exact
   Vercel/Neon deployment, migration, seed, URL, and evidence remain pending.
4. The working tree is unsealed and intentionally contains protected user WIP
   that must not be committed.
5. The complete current local verification passes: 717/717 unit and contract
   tests and 83/83 PostgreSQL tests. These counts do not upgrade any Requirement
   without deployed evidence.

## Golden Flow ledger

Allowed step statuses:
`PASS`, `FAIL`, `BLOCKED`, `UNVERIFIED`.

| Step | Required proof | Current status | Current evidence |
| --- | --- | --- | --- |
| Sign in | Pre-provisioned wallet Actor, accepted SIWE, authenticated server session | `UNVERIFIED` | Local real SIWE visible; deployed Vercel proof pending |
| Create Principal | Authenticated command, durable Principal row and Events, visible workspace result | `UNVERIFIED` | No current M1-B browser proof |
| Create Agent | Principal-authorized command, durable Agent binding and Events | `UNVERIFIED` | No current M1-B browser proof |
| Bind Wallet | Exact CAIP-10 binding, Actor/Principal/Agent authorization, durable Evidence | `UNVERIFIED` | No current M1-B browser proof |
| Create Lockbox | Purpose-bound, Mandate-controlled, Provider-restricted persisted capability | `UNVERIFIED` | Fresh PostgreSQL automated coverage exists; browser proof absent |
| Obtain CreditLine | Canonical `credit_line.v2` derived projection with current provenance and exposure | `UNVERIFIED` | Replay/PostgreSQL automated parity passes; deployed browser proof absent |
| Provider Spend | Offer, Policy, Authorization, Facility, Mandate, exposure, status, Provider and purpose checks | `UNVERIFIED` | Fresh PostgreSQL automated positive and negative coverage passes |
| Obligation | Durable shared-kernel Obligation and Events visible to authenticated Actor | `UNVERIFIED` | Automated coverage passes; browser proof absent |
| Revenue Capture | Idempotent synthetic revenue receipt bound to Obligation | `UNVERIFIED` | Automated coverage passes; browser proof absent |
| Automatic Repayment | Deterministic allocation and durable repayment command/Event | `UNVERIFIED` | Automated coverage passes; browser proof absent |
| Repayment Event | Partial and full repayment Events and balances | `UNVERIFIED` | Automated coverage passes; deployed runtime proof absent |
| Risk/Admin View | Authenticated exposure, repayment, Agent and Principal state | `UNVERIFIED` | No current M1-B browser proof |
| Admin Freeze | Authorized protective freeze with immutable Event and current status | `UNVERIFIED` | Automated invariants exist; browser proof absent |
| Subsequent Spend Rejected | New spend rejected specifically because current Agent status is frozen | `UNVERIFIED` | No current M1-B browser or correlated command evidence |

## Recovery, replay, and idempotency ledger

| Verification | Required proof | Current status | Current evidence |
| --- | --- | --- | --- |
| Fresh-browser recovery | Clear browser state, sign in again, recover next action from server receipt and current truth | `UNVERIFIED` | Durable receipt tests pass; real browser proof absent |
| API restart recovery | Restart API without data mutation; recover session-authorized current state | `UNVERIFIED` | Local acceptance covers runtime recovery; exact deployed proof absent |
| Worker restart recovery | Restart worker; prove leases/outbox/idempotency recover without duplication | `UNVERIFIED` | Local acceptance covers worker heartbeat/reconciliation; deployed proof absent |
| Duplicate webhook | Same external receipt/idempotency key produces one economic mutation | `UNVERIFIED` | Automated idempotency coverage exists; Golden Flow evidence absent |
| Partial repayment | Durable partial allocation, updated outstanding exposure, replay parity | `UNVERIFIED` | Automated coverage exists; Golden Flow evidence absent |
| Full repayment | Durable final allocation, released capacity, final lifecycle state | `UNVERIFIED` | Automated coverage exists; Golden Flow evidence absent |
| Event/projection parity | Full replay equals current PostgreSQL `credit_line.v2` projection and hash | `UNVERIFIED` | Fresh PostgreSQL test passes; exact deployed proof absent |

## Evidence bundle slots

The following artifacts are required and currently `NOT_AVAILABLE`:

- `environment-and-version-manifest.json`
- `migration-result.txt`
- `playwright-trace.zip`
- Golden Flow screenshots with timestamps and step identifiers
- authenticated session and continuation receipt identifiers
- command IDs, idempotency keys, Event IDs, Evidence IDs, and projection hash
- row-level PostgreSQL evidence using redacted, read-only queries
- API restart evidence
- worker restart and reconciliation evidence
- duplicate-delivery evidence
- partial and full repayment evidence
- freeze command/Event and rejected-spend error evidence
- structured-log correlation extract
- backup and isolated restore-drill evidence
- rollback record
- complete test output and checksums

The serverless deployment-specific ledger and machine evidence are maintained
in `docs/verification/M1_B_VERCEL_GOLDEN_FLOW.md` and
`docs/verification/m1-b-vercel-golden-flow-evidence.v1.json`.

## Requirement disposition

`REQ-CREDIT-009`, `REQ-UX-004`, and `REQ-UX-005` remain
`IMPLEMENTED_UNVERIFIED`. Passing unit, contract, and PostgreSQL tests does not
upgrade them. They may reach `VERIFIED_SANDBOX` only after this ledger is
complete at one exact deployed commit and every claimed artifact is present and
reproducible.

Protocol fees remain disabled. The flow must not create a real payment,
mainnet transaction, signer, transfer, withdrawal, custody relationship, paid
pilot, or production financial claim.
