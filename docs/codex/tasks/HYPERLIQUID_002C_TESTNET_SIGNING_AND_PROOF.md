# HYPERLIQUID-002C — Testnet Signing and Bounded Proof

Status: `IMPLEMENTED_UNVERIFIED — BLOCKED BEFORE TESTNET WRITE`

Phase: 4 — Hyperliquid Execution

Decision authority: IPO.ONE Founder

Approved: 2026-08-08

## Context

`HYPERLIQUID-002`, `002A` and `002B` established the offline Venue SPI,
transport parity and durable hash-only delegate/tombstone truth. The Founder
has now explicitly authorized the next named gate: official signing
conformance, a closed Hyperliquid Testnet execution policy, an isolated signer
port, bounded Exchange transport and one zero-real-value proof runner.

The repository still has no qualified Hyperliquid Testnet master/subaccount or
approved API-wallet signer material. Implementation and read-only metadata
observation may continue, but the runner must fail closed before any Exchange
write until those prerequisites are supplied through a non-logging human
handoff.

## Exact proof profile

- Environment: `hyperliquid_testnet` only.
- Origin: `https://api.hyperliquid-testnet.xyz`; path: `/exchange`.
- Product: one Testnet perpetual market selected from a fresh `meta` response;
  the first candidate is `BTC` only if its live asset index and decimal rules
  match the reviewed metadata receipt.
- Actions: one ALO non-reduce-only order, at most one modify of that exact
  cloid/order and one cancel/cancel-by-cloid; reduce-only emergency flattening
  is permitted only when a fresh venue position proves it is restrictive.
- Testnet notional per proof order: exactly `10 USDC`, the documented minimum
  order notional and also the hard maximum; this remains zero real value.
- Maximum concurrently open proof orders: `1`.
- Maximum signed Exchange submissions in one proof: `3`.
- Exchange request expiry: `30 seconds`; complete proof window: `15 minutes`.
- Expected fill notional: `0`; any fill or unknown outcome stops new risk and
  enters cancellation plus reconciliation.
- ALO is mandatory for the opening order. IOC/GTC opening orders, market or
  trigger orders, builder fees, leverage/margin changes, transfers,
  withdrawals, vault actions, account administration and unknown actions are
  denied.
- Accountable decision owner and incident owner: IPO.ONE Founder. Execution,
  signer custody and Risk Guardian capabilities remain separated ports.

## Scope

- Add the exact issue and proof-profile contract before runtime code.
- Implement official-reference Hyperliquid `l1_action` action hashing and
  EIP-712 typed-data construction with published SDK conformance vectors.
- Implement the `user_signed_action` typed-data shape required for one
  human-confirmed Testnet `approveAgent` provisioning request without accepting
  a master private key.
- Add a non-exporting isolated signer interface that accepts only a closed
  typed-data request and returns one bounded signature plus signer identity.
- Add a Testnet-only Exchange transport with fixed origin/path, closed request
  body, deadline, no redirect, response size bound, structured result hashing
  and UNKNOWN-on-ambiguous-outcome behavior.
- Add a closed deterministic policy evaluator for account binding, market,
  action class, ALO, notional, open-order count, proof count, freshness,
  expiry, pause and reconciliation state.
- Add a preflight/proof runner that cannot submit until the exact account,
  delegate, signer, policy, metadata and human confirmation bindings agree.
- Add conformance, malicious-action, wrong-environment, stale-state, signer
  mismatch, timeout/UNKNOWN and no-retry tests.
- Perform only read-only Testnet metadata observation before the final write
  readiness decision.

## Non-goals

- No mainnet, production, real funds, arbitrary market, open strategy loop,
  withdrawal, transfer, leverage/margin change, vault operation or builder fee.
- No raw action, raw response, private key, seed phrase, credential, reusable
  signature or unredacted account address in durable Evidence.
- No automatic API-wallet generation/approval, browser-held API-wallet key,
  Agent-held master key or repository/environment-file secret.
- No automatic retry after submission, timeout or unknown outcome.
- No Ledger settlement from a Venue acknowledgement; reconciliation remains
  mandatory.
- No HyperEVM enablement and no deployment/hosting change.

## Files likely to modify

- `modules/hypercore-venue-adapter/src/hypercore-official-signing.js`
- `modules/hypercore-venue-adapter/src/hypercore-testnet-proof.js`
- `modules/hypercore-venue-adapter/test/hypercore-official-signing.test.js`
- `modules/hypercore-venue-adapter/test/hypercore-testnet-proof.test.js`
- `deploy/testnet/preflight-hypercore-proof.mjs`
- `schemas/v2/hypercore-testnet-proof-policy.schema.json`
- `scripts/check-schemas.mjs`
- `package.json` / `pnpm-lock.yaml`
- `docs/architecture/ADR-038-agentic-execution-compatibility-layer.md`

## Acceptance criteria

1. Published official SDK L1 Testnet signature vectors match exactly, including
   msgpack field order, nonce, vault/subaccount marker, expiry marker, phantom
   agent source and EIP-712 digest.
2. User-signed Testnet provisioning typed data is closed to `approveAgent`,
   `HyperliquidTransaction:ApproveAgent`, chain `0x66eee` and environment
   `Testnet`; all other user-signed actions fail closed.
3. The application never accepts or persists a private key. Signatures are
   transient and only their hash/recovered signer binding may become Evidence.
4. The policy denies wrong environment/origin/account/delegate/market/action,
   non-ALO opening orders, notional above `10`, more than one open order, more
   than three proof submissions, stale metadata/risk, paused state, outstanding
   UNKNOWN or missing human confirmation.
5. The transport sends only the exact signed body to the fixed Testnet endpoint,
   does not follow redirects and classifies timeout/invalid/oversized responses
   as UNKNOWN without retry.
6. Withdrawal, transfer, leverage, margin, vault, builder, `approveBuilderFee`,
   raw and unknown actions are denied before signing or transport.
7. A real proof cannot start without a live qualified master/subaccount,
   one-use delegate, fresh read Evidence, isolated signer and exact human
   confirmation. Missing prerequisites produce a reviewable readiness report,
   not a partial write.
8. Repository regression gates pass apart from separately documented existing
   release-snapshot constraints.

## Test commands

```sh
node --test modules/hypercore-venue-adapter/test/*.test.js
pnpm run check:schemas
pnpm run lint
pnpm run typecheck
pnpm test
node deploy/testnet/preflight-hypercore-proof.mjs
```

## Security checklist

- [x] Official L1 published vectors match; the user-signed Testnet construction
      is primary-source checked and digest-bound.
- [x] No raw key ingress, persistence or logging path exists.
- [x] Account query identity is never replaced with the API-wallet signer.
- [x] Fresh API-wallet address and tombstone checks are mandatory preconditions.
- [x] Testnet origin/path/method are immutable and mainnet is rejected.
- [x] Exact market metadata, asset index and decimals are freshness-bound.
- [x] Hard notional/order/submission limits and ALO opening policy fail closed.
- [x] Unknown outcome is terminal for submission and blocks retry/new risk.
- [x] Withdrawal/transfer/account administration remain impossible.
- [x] Proof Evidence is hash-only and cannot post canonical settlement.

## Permission boundary

Approved now: official-reference conformance, one closed Testnet policy,
isolated signer and Exchange transport ports, read-only Testnet metadata,
non-logging credential handoff design and one zero-real-value proof runner.

The approval does not provide the missing master/subaccount, delegate address
or signing authority. It also does not authorize mainnet, production, real
funds, deployment, withdrawals, transfers, capital movement, Ledger settlement
or a continuing strategy. A Testnet write is allowed only when this runner
reports every named prerequisite ready and uses the exact one-time human
confirmation.

## Migration impact

No migration is planned for signing material. Existing durable nonce,
execution, Evidence and HYPERLIQUID-002B tombstone truth must be reused. If the
current simulation-only persistence schema cannot represent a real Testnet
attempt without weakening its invariants, a separate migration and review
checkpoint must be added instead of altering historical Evidence semantics.

## Rollback

Disable the proof runner and Exchange transport, retain signer tombstones,
nonce heads, submission/UNKNOWN records and all Evidence, then reconcile by
account, cloid, order, fills and position without resubmission. Retire the
delegate through the approved external procedure and never reuse its address.

Rollback must not delete or rewrite an ambiguous outcome, reuse a nonce or
signer, flatten through an unapproved transfer, or treat an Exchange response
as canonical Ledger truth.

## Completion Evidence

Record primary-source versions, hashes/vectors, live metadata receipt,
readiness outcome, exact test counts and whether any external write occurred
under `docs/codex/audits/HYPERLIQUID-002C/`. Stop for Founder/security review
after any Testnet proof or when a missing account/signer prerequisite is found.

The stop condition was reached before any write: the preflight found no
qualified Testnet master/subaccount, durable account binding, approved fresh
API-wallet delegate, isolated signer reference, one-use human confirmation or
durable single-use submission/UNKNOWN store. The implementation Evidence is
recorded under `docs/codex/audits/HYPERLIQUID-002C/audit.md`; no `/exchange`
request was made.
