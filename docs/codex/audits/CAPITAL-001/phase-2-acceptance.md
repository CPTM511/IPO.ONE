# CAPITAL-001 Phase 2 acceptance

Date: 2026-07-30

Status: accepted as a local synthetic/no-funds release candidate

## Sealed source

- Release candidate: `ipo-one-local-rc-20260730-003`
- Candidate commit:
  `129f8bb28ff53d6dfb4e175b953a537b987a2a84`
- Manifest SHA-256:
  `5afc8932e2be7e3a4acb5420e1c873b5e76a34b0f5fa7dd62df6bf0b8c90bdc6`
- Runtime: Node 26.5.0, pnpm 11.1.3, PostgreSQL 17
- Database: 48 ordered migration up/down pairs
- Shared protocol: `tenant_protocol.v1`, 76 closed operations
- Product boundary: local, private, synthetic, no-funds

## Delivered product

One shared obligation kernel now supports a three-sided workflow:

1. Human or Agent creates a Credit Intent.
2. The borrower/controller issues an exact, expiring, revocable Credit
   Passport for the invited Capital Partner verifier.
3. The dedicated Capital Partner operator verifies the bounded artifact and
   authors immutable `credit_offer.v2` terms.
4. Human or Agent accepts the exact Offer into the existing `obligation.v2`,
   Lockbox, Ledger, servicing, repayment, Evidence, and credit-outcome path.
5. `facility_view.v1` and the Capital Partner portfolio are composed from
   canonical server truth.

No parallel Facility ledger, lender state machine, browser arithmetic, or
production capital path was added.

## Migration and schema inventory

- Migration:
  `0048_synthetic_capital_partner_marketplace`
- New durable projection:
  `capital_partner_profiles`
- Extended projection:
  `credit_offers` with backward-compatible v1 and v2 constraints
- New closed schemas:
  `capital-partner-profile`, `credit-offer-v2`, `facility-view`, and
  `capital-partner-portfolio`
- New operations:
  author/transition Capital Partner Offer and read own Portfolio/Facility
- Existing `credit_offer.v1` fixtures and Human/Agent routes remain compatible.

## Authorization and RLS matrix

| Actor | Passport | Offer | Portfolio/Facility | Borrower/Risk/Admin |
| --- | --- | --- | --- | --- |
| Human borrower | issue/read/revoke own | accept exact own | own Obligation only | no elevated role |
| Principal controller | issue/read/revoke for owned Agent | controller boundary | owned Agent Evidence | no Capital Partner role |
| Agent runtime | verify/read bounded input; cannot issue | accept exact Mandate-bound Offer | owned Obligation only | no Human/Risk/Admin role |
| Capital Partner operator | verify exact granted artifact | author/manage own only | read own only | no borrower, Risk, Provider, Auditor, or Tenant administration |

The profile table is forced-RLS, Tenant-scoped, bootstrap-owned, and immutable.
Offer reads and transitions require both RLS and object authorization. Live
acceptance rechecks Passport status/version/hash, verifier, purpose, Subject,
Intent, operator/profile, Offer validity/terms, pause/freeze, and
idempotency.

## Four required workflow receipts

- Human: exact Partner Offer accepted, sandbox Obligation executed, fully
  repaid, Evidence and credit outcome finalized.
- Agent: active Agent account and Mandate used to accept the same v2 economic
  contract, execute, fully repay, and finalize Evidence/outcome.
- Failure path: stale Passport hash/version, revoked Passport, expired Offer,
  and withdrawn Offer fail closed; duplicate author/accept/execute calls replay
  without duplicate economics.
- Adverse path: a separate Human Facility advances to delinquent/grace-period
  servicing and appears in the Partner portfolio without Ledger divergence.

## Reconciliation

- Portfolio totals are derived from Offer, Obligation, Ledger, repayment,
  servicing, and Evidence projections.
- Restart and replay preserve exact command results.
- The final live local acceptance reported an empty pending outbox, clean
  reconciliation, forced RLS, no fake transaction hashes, and one-to-one
  Evidence anchor coverage.
- Existing CHAIN-001F remains a separately approved Base Sepolia zero-value,
  hash-only attestor. Phase 2 added no contract, signer, transaction, or chain
  write authority.

## Verification

- Repository tests: 666 passed, 0 failed.
- Fresh PostgreSQL 17 integration/RLS tests: 82 passed, 0 failed.
- Local acceptance: passed twice with a full PostgreSQL, Pilot, and worker
  restart between passes.
- Browser: authenticated Capital Partner Portfolio read passed with zero
  console errors; Sign out revoked the session and hid all private state.
- Static contract, schema, migration, OpenAPI, abuse-policy, authorization,
  transport, web-bundle, and local RC checks passed.

Browser evidence:

- Human:
  `output/playwright/local-stack-human-lifecycle.png`
- Agent:
  `output/playwright/local-stack-agent-activation.png`
- Capital Partner:
  `output/playwright/phase2-capital-partner-authenticated.png`

The final Capital Partner screenshot used a short-lived local server session
only because the Playwright browser has no wallet extension. Durable SIWE with
real EIP-191 signatures, logout/re-login, expiry, revocation, and unprovisioned
wallet rejection were independently exercised by the production-runtime and
PostgreSQL suites. The temporary browser session was revoked through the
product Sign out action.

## Remaining observations

- P0: none.
- P1: none.
- P2 UX: the invitation package should prefill the exact Capital Partner
  profile ID; the current fail-closed UI requires the invited operator to enter
  it before the first Portfolio refresh.
- P2 operations: cloud backup/PITR, scheduler, secret manager, alert delivery,
  external participant onboarding, and hosted abuse testing remain unexecuted.

## Phase 3 recommendation

Go for preparing a hosted private no-funds pilot decision package and
environment validation.

No-go for deployment activation, remote participant mutation, real Human
lending, real capital, custody, public LP/vaults, external Provider execution,
mainnet, a new contract/signer, or automatic credit-policy promotion. Each
remains behind its named human, legal, privacy, risk, capital, security, and
deployment approvals.
