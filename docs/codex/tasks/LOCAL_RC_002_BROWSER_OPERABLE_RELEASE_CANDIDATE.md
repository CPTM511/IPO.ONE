# LOCAL-RC-002 — Browser-operable shared-credit release candidate

Status: Sealed locally on 2026-07-31

## Context

`LOCAL-RC-001` sealed the prior local no-funds baseline. Subsequent
authentication recovery, Principal/Agent authority recovery, browser-operable
Human and Agent credit, early repayment, Credit Passport, Credit Track Record,
and Base Sepolia Evidence-observer repairs were verified without rewriting that
immutable manifest. The project owner explicitly authorized one new seal.

This release candidate records the exact successor source, runtime, migrations,
contracts, fixtures, product surfaces, failure-path tests, restart acceptance,
and bounded live-testnet Evidence state.

## Scope

- Preserve `deploy/local/release-candidate.v1.json` as the immutable predecessor.
- Seal Node 26.5.0, pnpm 11.1.3, PostgreSQL 17, and all 48 migrations.
- Pin the shared Human/Agent Tenant protocol and disabled remote Agent HTTPS
  contract.
- Pin browser-operable Human Offer acceptance, early repayment, Passport and
  Track Record recovery.
- Pin the protected local reference-Agent HTTP path for account proof,
  application, exact Mandate activation, Obligation, execution, repayment, and
  Evidence.
- Pin stale-session recovery, restart persistence, idempotency, pause/freeze,
  unknown-outcome, reconciliation, and Base Sepolia observer behavior.
- Record the separately approved CHAIN-001F zero-native-value Evidence attestor
  without granting new chain-write authority.

## Non-goals

- No cloud deployment, remote participant access, production identity provider,
  mainnet action, real funds, Provider execution, venue signer, public signup,
  KYC vendor, custody, contract deployment, or pricing/risk-policy change.
- No claim that every current Evidence requirement was finalized at the same
  instant; non-final chain states remain explicit and the observer continues
  reconciliation.
- No new Human/Agent obligation kernel and no browser-side Agent credential.

## Files likely to modify

- `deploy/local/release-candidate.v2.json`
- `scripts/check-local-release-candidate-v2.mjs`
- `package.json`
- `docs/codex/tasks/LOCAL_RC_002_BROWSER_OPERABLE_RELEASE_CANDIDATE.md`
- status lines in the sealed user manual and affected task/audit records

## Acceptance criteria

1. The predecessor manifest remains byte-identical and its SHA-256 is pinned.
2. The v2 verifier fails closed on runtime, migration, contract, fixture,
   product-source, operational-source, acceptance-test, authority, or predecessor
   drift.
3. Repository tests pass with zero failures.
4. PostgreSQL 17 integration/RLS tests pass against an isolated fresh database.
5. The local stack passes acceptance, restarts with its persistent volume, then
   passes acceptance again with an empty pending outbox.
6. The protected reference Agent completes its shared no-funds lifecycle before
   and after restart.
7. Evidence-anchor records contain no production-funds claim or fabricated
   transaction hash; pending/included/safe/finalized states remain distinct.
8. The Git commit containing the v2 manifest is the immutable source identity.

## Test commands

```text
pnpm run check:local-rc
pnpm run check
pnpm run test:postgres
pnpm run local:acceptance
pnpm run local:agent:acceptance
pnpm run local:restart
pnpm run local:acceptance
pnpm run local:agent:acceptance
pnpm run local:evidence-anchor:status
```

## Verification receipt

- Node 26.5.0 repository tests: 678 passed, 0 failed.
- Fresh isolated PostgreSQL 17 tests: 82 passed, 0 failed.
- Two local acceptance passes completed with a full PostgreSQL, Pilot, and
  worker restart between them.
- The reference Agent completed Request, Decision, Offer, exact Mandate-bound
  acceptance, Obligation, execution, early full repayment, and 11-event
  Evidence reads on both passes.
- The first post-restart check correctly caught one transient unpublished
  outbox message; the worker consumed it, the pending count returned to zero,
  and the complete second pass then succeeded.
- CHAIN-001F remains Base Sepolia-only, zero-native-value, below its configured
  balance cap, key-excluded, and separately authorized.

## Security checklist

- [x] Synthetic/no-real-funds only.
- [x] Human and Agent share one obligation, Ledger, servicing, Event, and
      Evidence kernel.
- [x] Raw KYC/PII, credentials, private keys, and signatures are not committed.
- [x] Browser reference-Agent operations remain Principal-gated and return only
      sanitized receipts.
- [x] Remote Agent activation remains disabled pending named deployment approval.
- [x] This seal grants no new chain write, contract, signer, venue, Provider,
      deployment, or funds authority.
- [x] Base Sepolia finality and unknown states remain truthful and retry-safe.
- [x] Candidate source is sealed by the exact Git commit containing the manifest.

## Rollback

Revert the LOCAL-RC-002 seal commit to return to the prior source baseline.
That does not rewrite PostgreSQL, already-submitted testnet transactions, or
finalized Evidence. Any hosted or real-value rollout requires a separate
reviewed release, rollback procedure, and permission gate.
