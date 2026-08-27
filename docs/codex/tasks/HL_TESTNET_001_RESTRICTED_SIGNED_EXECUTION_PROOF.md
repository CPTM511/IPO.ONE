# HL-TESTNET-001 — Restricted signed Hyperliquid Testnet execution proof

Status: `PREPARED — BLOCKED; NO ACCOUNT, SIGNER, CAPS, OR RUN APPROVAL`

Canonical mode: exact `L3_LIVE_TESTNET` Venue profile

Requirements: `REQ-TRADE-005`, `REQ-AGENT-POOL-001`, `REQ-RISK-001..002`,
`REQ-PAY-001..004`, `REQ-EVID-001..004`, `REQ-AUTO-001`

## Context and current baseline

M2B-001 through M2B-004 implement local no-funds authorization, bounded Venue
composition, dual-risk recovery, repayment, and Credit State Evidence. M2B-006
deploys only the no-funds product and explicitly disables signer, chain, Pool,
and Venue writes.

The existing Base Sepolia secured-pool proof is separate M2 Evidence. It does
not approve or prove a Hyperliquid account, signer, order, fill, cancel,
reduce-only action, flatten, or Venue reconciliation.

This umbrella must be split into an approval/preflight issue and one exact run
issue before any credential or external mutation exists.

## Scope

### HL-TESTNET-001A — exact approval package and no-write preflight

- Select one accountable Principal and one approved testnet master/subaccount
  structure.
- Define one dedicated restricted API Wallet or equivalent signer boundary.
- Freeze the exact closed action allowlist: order, modify/cancel, reduce-only,
  and flatten only as approved.
- Freeze product/market, position, notional, leverage, order, price-deviation,
  rate, staleness, drawdown/loss, expiry, and run-count caps.
- Bind exact source SHA, adapter/config hashes, nonce/unknown-outcome rules,
  owners, incident response, signer rotation/revocation/destruction, and
  rollback.
- Run read-only and deterministic no-write preflight. No signer may be created
  or loaded in this sub-gate without separate approval.

### HL-TESTNET-001B — one bounded signed proof

- Provision the exact approved signer through the reviewed private boundary.
- Execute only the approved testnet actions within the one-run window.
- Treat timeout, disconnect, ambiguous response, missing fill, or stale state as
  `UNKNOWN`; reconcile before any exact replay and never issue a new economic
  request from inference.
- Map order/fill/funding/position/settlement facts to canonical Ledger,
  Obligation, repayment, Event, Evidence, and reconciliation state.
- Exercise pause, cancel, reduce-only/flatten, restart, revocation, close,
  settlement, and incident recovery.
- Retire/revoke the signer and preserve only redacted non-secret Evidence.

## Non-goals

- No mainnet, real funds, production custody, real-value credit, or Human cash
  lending.
- No withdrawal, external transfer, controller-key access, arbitrary signing,
  residual release, new market, multi-venue, or strategy code.
- No signer reuse from M2, Base Sepolia, browser, CI, fixtures, or prior runs.
- No caller-selected raw action payload, target, expected effect, nonce, risk
  state, or authority.
- No automatic retry of unknown outcomes and no automatic unfreeze.
- No Credit State or shadow-model result may increase limits, relax collateral,
  broaden authority, or approve another action.

## Likely files

- New child task files for `HL-TESTNET-001A/B`
- `deploy/testnet/` exact private decision/runner contracts
- Hyperliquid adapter, settlement, signer-policy, nonce, recovery, and
  reconciliation modules already used by M2B local composition
- additive persistence only if the current M2B schema cannot represent the
  exact run without semantic drift
- `docs/security/` runbook and threat-model supplement
- `docs/codex/audits/HL-TESTNET-001/`
- redacted `artifacts/testnet/hl-testnet-001/`

## Acceptance criteria

1. The exact Principal, Subject, Mandate, Facility, controlled account, Venue
   account, signer, market, action, amount, caps, expiry, nonce, code, config,
   owner, and run ID are bound before signing.
2. Wrong, stale, revoked, expired, cross-Tenant, cross-Subject, cross-Facility,
   cross-account, unapproved-action, over-cap, or unreconciled requests deny
   before nonce allocation and signing.
3. The financed Agent receives no controller key, signer key, arbitrary-sign,
   withdrawal, transfer, or residual-release authority.
4. A submitted action commits at most once. An uncertain result remains
   `UNKNOWN` until read reconciliation; a new idempotency key cannot bypass it.
5. Order, modification/cancel, fill, funding, position, margin, settlement,
   repayment, and close facts are normalized from authenticated Venue reads and
   preserve source time and provenance.
6. Pool, Venue, Ledger, Obligation, repayment, and Evidence reconcile for every
   admitted test case with zero unexplained divergence.
7. Pause, cancel, reduce-only, flatten, restart, crash-after-send, signer
   revocation, and incident drills pass without increasing risk.
8. Every submitted action is on Hyperliquid Testnet, uses test assets only, and
   satisfies the exact run-count and numerical caps.
9. Signer material never enters Git, CLI arguments, environment dumps, logs,
   database rows, browser state, Evidence, artifacts, screenshots, or prompts.
10. The signer is revoked/retired after the run, no active acceptance
    credential remains, and the final redacted Evidence is replayable.

## Test commands

The active child issue must pin exact commands and external conformance. The
minimum families are:

```sh
pnpm check
pnpm test
pnpm run test:postgres
pnpm run test:security
pnpm run test:transport
pnpm run check:product-traceability
git diff --check
```

The exact run adds read-only account/market preflight, signer-policy negative
tests, nonce/unknown crash tests, external Testnet execution receipts, direct
Venue reconciliation, restart replay, and signer retirement verification.

## Security checklist

- [ ] `PILOT-008` has formally exited and an exact L3 go/no-go exists.
- [ ] Account, signer, action allowlist, caps, owner, incident responder, and
      one-run window have named approval.
- [ ] No withdrawal, transfer, controller authority, arbitrary action, mainnet,
      or real value is reachable.
- [ ] Signer/key material is private, least-privilege, rotatable, revocable,
      non-browser, non-database, and absent from Evidence.
- [ ] Unknown outcomes block new risk and reconcile before exact replay.
- [ ] Pool/Venue dual-risk recovery can only hold or reduce risk.
- [ ] Final Evidence distinguishes request, signature, submission,
      observation, fill, finality, settlement, repayment, and reconciliation.

## Permission boundary

This prepared task grants no account access, signer creation/load, credential,
network, nonce, action, deployment, testnet write, risk-value, or run authority.
Each child issue and the exact signed run require separate Founder, Security,
Risk, Operations, and Release approval.

## Data and migration impact

Prefer the existing M2B additive incident, nonce, composition, repayment, and
Evidence schema. Any new table or field requires a separate reviewed additive
migration with forced RLS, replay, restart, idempotency, and forward-only
rollback. Raw Venue secrets and private keys are prohibited from persistence.

## Rollback

Before signing, reject the package and create no signer. After any submission:
freeze new risk, preserve redacted Evidence, reconcile reads, cancel open
orders, reduce-only/flatten when authorized and safe, close/settle, post the
canonical repayment outcome, revoke/retire the signer, and disable the exact
profile. Never resend an unknown action blindly or delete history.

## Required Evidence and dependencies

Dependencies: `PILOT-008` exit, exact L3 decision, current candidate, current
threat model, approved signer/account/action/caps/owners, and one-run
authorization.

Current verdict: `BLOCKED — NOT COMPLETE`.
