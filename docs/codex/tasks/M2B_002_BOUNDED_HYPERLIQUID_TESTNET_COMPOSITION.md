# M2B-002 — bounded Hyperliquid Testnet composition

Status: `LOCAL PRE-WRITE IMPLEMENTED — L3 EXTERNAL WRITE BLOCKED`

Baseline: `2e27c35d09530404a2eea9b35168abcbb7306cbc`

Requirements: `REQ-CORE-001`, `REQ-ID-002`, `REQ-ID-004`, `REQ-ID-005`,
`REQ-EXEC-001`, `REQ-EXEC-002`, `REQ-EXEC-004`, `REQ-EVID-001`,
`REQ-EVID-002`, `REQ-TRADE-001`, `REQ-TRADE-005`, `REQ-AGENT-POOL-001`,
`REQ-AGENT-POOL-002`, `REQ-PRIV-001`

## Context

M2B-001 adds one durable Principal/Mandate/AccountBinding/Obligation/Pool/
Facility authorization that deliberately stops before nonce, signing and
network execution. The repository already contains the ADR-035/038/039
HyperCore stable intent, exact Founder approval, ten-second JIT preflight,
durable nonce, single-attempt submission, `UNKNOWN`, cancellation and
reconciliation boundaries. M2B-002 must compose these existing objects without
creating a second credit, Facility, Ledger, Event, Evidence or venue kernel.

The current launch policy has no
`live_testnet_secured_pool_agent_execution` profile and the existing secured
pool profile explicitly sets `agentVenueExecutionEnabled=false`. Therefore this
issue may implement and verify local/mock/PostgreSQL composition and prepare a
reviewable pre-write marker, but it must fail closed before signer or
Hyperliquid `/exchange` use.

## Scope

- Add one immutable M2B execution composition binding the current active
  M2B-001 authorization to one stable HyperCore intent, exact BTC Testnet ALO
  action, account/delegate/signer references, policy, Facility and canonical
  Obligation hashes.
- Map the M2B-001 `open` intent only to the existing stable `order` path and its
  exact maximum-10-Testnet-USDC profile.
- Map M2B-001 `close` only to exact bound cancellation or server-proven
  reduce-only protection; it may never increase exposure.
- Recheck current M2B-001 authorization and all immutable resource hashes before
  preparation, exact approval consumption, signing claim and submission claim.
- Persist only hash/opaque composition truth under forced Tenant RLS with
  idempotent preparation and one append-only `PREPARED` transition. The domain
  vocabulary reserves `APPROVED`, `SIGNING`, `SUBMITTING`, `SUBMITTED`,
  `REJECTED`, `UNKNOWN`, `RECONCILED`, `CLOSED`, and `ABORTED`, but the current
  migration structurally rejects every post-`PREPARED` state. A separately
  reviewed L3 migration is required before any later state can be durable.
- Expose queryable readiness and receipt surfaces for Principal and Agent while
  keeping all mutation disabled until the exact reviewed L3 profile and one-use
  run approval exist.
- Produce a pre-write STOP report naming every missing exact L3 prerequisite.

## Non-goals

- No Hyperliquid `/exchange` request, live signature, nonce allocation for an
  external signer, API-wallet registration, delegate mutation or account write
  under the current issue state.
- No withdrawal, transfer, leverage/margin change, vault, builder fee,
  arbitrary action, raw Venue payload, strategy loop or signer reuse.
- No mainnet, production, real funds, production credentials, custody, hosting
  or public deployment change.
- No second economic kernel and no settlement from an HTTP acknowledgement.
- No automatic retry of ambiguous or `UNKNOWN` outcomes.
- No enabling or silently broadening the existing M2A launch profile.

## Likely files

- `modules/hypercore-venue-adapter/src/m2b-secured-facility-composition.js`
- `modules/hypercore-venue-adapter/src/postgres-m2b-composition-repository.js`
- `modules/hypercore-venue-adapter/src/index.js`
- `db/migrations/0067_m2b_hyperliquid_compositions.*.sql`
- `schemas/v2/m2b-hyperliquid-composition.schema.json`
- Tenant protocol, SDK/MCP, Human Web readiness surfaces and focused tests
- `deploy/testnet/m2b-002-prewrite.mjs`
- `docs/codex/audits/M2B-002/`

## Acceptance criteria

1. Exact current M2B-001 authority and current shared-kernel hashes are required
   before one composition can enter `PREPARED`; wrong, expired, revoked,
   superseded or unreconciled authority denies before nonce/signing.
2. One stable intent hash is bound to the exact Facility, account, delegate,
   signer reference, BTC Testnet market, ALO action, notional, policy and
   M2B-001 authorization. Any drift requires a new composition and approval.
3. The same idempotency identity returns the same composition; conflicting or
   concurrent preparation cannot create a second executable attempt.
4. Existing ADR-039 `UNKNOWN` handling remains non-retryable and blocks new
   risk until signer-free read reconciliation establishes an exact terminal
   outcome; M2B-002 does not create a parallel retry or outcome path.
5. Cancellation and reduce-only protection can only reduce or close the exact
   bound exposure; arbitrary or exposure-increasing close requests deny.
6. PostgreSQL forced RLS prevents cross-Tenant reads/writes and populated down
   migration refuses to erase durable execution truth.
7. Principal Human Web and Agent API/SDK/MCP expose the same readiness and
   outcome truth, with disabled controls and explicit recovery conditions while
   the L3 profile is absent.
8. The pre-write runner returns `BLOCKED_PREWRITE` with zero signatures, zero
   external nonces and zero network submissions until a distinct exact launch
   profile, account, signer, fresh reads and one-use Founder run approval exist.

## Test commands

```sh
node --test modules/hypercore-venue-adapter/test/m2b-secured-facility-composition.test.js
pnpm run test:postgres
pnpm run test:security
pnpm run test:transport
pnpm run check:schemas
pnpm run check:migrations
pnpm test
node deploy/testnet/m2b-002-prewrite.mjs
```

## Security checklist

- [x] Exact closed input and current M2B-001 authority rechecked at every
      irreversible boundary.
- [x] Stable approval and ten-second JIT state remain separate and hash-bound.
- [x] Durable claim precedes network I/O; nonce, approval and attempt are
      single-use and never restored by restart.
- [x] `UNKNOWN` is terminal for resubmission and enters read-only reconciliation.
- [x] No raw account, private key, signature, credential, response, KYC or PII
      enters database, Event, Evidence, logs or artifacts.
- [x] Withdrawal, transfer, leverage, mainnet, production and real-funds
      authority are structurally false.
- [x] M2A pool and canonical Obligation/Ledger/Evidence remain authoritative.
- [x] Human and Agent product surfaces remain parity-bound and truthful.

## Permission boundary

Founder authorization on 2026-08-25 unlocks this issue only through local/mock/
PostgreSQL implementation, disabled product readiness, and pre-write STOP
Evidence. It does not authorize a live signer, external nonce, API-wallet
registration, Hyperliquid `/exchange` request, launch-profile enablement,
mainnet, production, real value, custody, transfer or withdrawal.

A later Testnet write requires a distinct reviewed disabled-to-enabled launch
policy change and one exact run approval naming the Principal, Agent, Mandate,
M2B-001 authorization, pool position/Facility, Hyperliquid master/subaccount,
fresh delegate/signer reference, exact action/payload/nonce, numerical caps,
expiry, rollback owner and Evidence hashes.

## Data and migration impact

One additive forced-RLS composition/transition projection is permitted. It
stores only bounded identifiers, hashes, state and timestamps. Historical
HyperCore v1/v2 attempts remain immutable. Down migration must refuse to remove
populated execution truth.

## Rollback

Disable M2B admission and signer composition, freeze new risk, retain every
composition/approval/nonce/attempt/transition, cancel or reduce only under a
separate exact protective approval, reconcile signer-free, repay canonical
outstanding Obligation truth and retire the signer without reuse. Never resend
or delete an ambiguous outcome.

## Required Evidence

Issue contract, domain and persistence tests, denial matrix, RLS/concurrency/
restart/UNKNOWN proof, protocol/SDK/MCP/Web parity, aggregate gates, exact SHA,
clickable local product URL and a hash-only pre-write STOP artifact proving no
signature, external nonce or network submission occurred.
