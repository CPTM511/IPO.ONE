# HYPERLIQUID-002 — HyperCore Venue Execution Adapter

Status: `VERIFIED_SANDBOX — LOCAL/OFFLINE SLICE; ACTIVE PERMISSION AND TESTNET PROOF GATED`

Phase: 4 — Hyperliquid Execution

Decision authority: IPO.ONE Founder

Started: 2026-08-08

## Context

ADR-035 already fixes the Hyperliquid signer, custody, action and nonce
boundary. TC-201 provides the signer-free Testnet Info read plane. TC-301,
TC-302 and TC-303 provide an offline five-action execution gateway, risk
admission and reconciliation. ADR-038 and the Agentic Execution Compatibility
Layer now require those capabilities to sit behind a vendor-neutral Venue SPI,
while preserving HyperCore-specific master/subaccount, API-wallet, signing and
nonce semantics.

Founder direction on 2026-08-08 starts `HYPERLIQUID-002` and Phase 4. It does
not supersede ADR-035's separately named gates for `approveAgent`, credential
generation or custody, official live signing, Exchange transport, a Testnet
write, real funds, mainnet, deployment or production activation.

## Scope

- Add a closed, versioned Venue Execution Provider SPI for the eight canonical
  `venue*` operations in ADR-038.
- Add a disabled-by-default HyperCore Testnet adapter that reuses the existing
  Info, execution, risk and reconciliation modules rather than creating new
  credit or obligation truth.
- Model master/subaccount binding separately from an API-wallet signing
  delegate.
- Model local prepare, activate, revoke and rotate lifecycle Evidence for a
  fresh API-wallet delegate reference, without creating or accepting private
  key material and without calling `approveAgent`.
- Permanently tombstone every revoked, expired, compromised or retired
  API-wallet address so it cannot be prepared or activated again.
- Compile the reviewed Hyperliquid `l1Action` and `userSignedAction` signing
  schemes as closed hash-bound sign requests. Use an isolated signer interface;
  retain neither raw key nor reusable signature.
- Allow only `order`, server-proven `reduceOnlyOrder`, `cancel`,
  `cancelByCloid` and `modify`; deny transfer, withdrawal, leverage,
  account-mode, agent administration, arbitrary and unknown actions before
  nonce reservation or signing.
- Reuse the durable monotonic nonce and unknown-outcome protocol from TC-301.
- Normalize account/risk snapshot, execution receipt and reconciliation
  Evidence without treating venue state as Ledger, Obligation or settlement
  truth.
- Register the canonical Venue operation family with the existing authenticated
  Tenant Command Gateway. Submission and activation remain explicitly disabled
  in the local no-funds delivery profile.
- Add JSON Schemas and conformance fixtures for the new projection records.

## Non-goals

- No `approveAgent` request, Hyperliquid Exchange request or external write.
- No private-key generation, import, export, storage, logging or test fixture.
- No live/Testnet signature, funded or unfunded venue order, remote account
  mutation, mainnet action, withdrawal, transfer, leverage or account-mode
  change.
- No HyperEVM enablement; `HYPERLIQUID-EVM-001` remains separate.
- No deployment, remote access, credential, real-value, production, custody,
  risk-limit or signer-vendor decision.
- No duplicate CreditLine, Obligation, Facility, Ledger, Evidence or settlement
  kernel.

## Likely files

- `modules/hypercore-venue-adapter/**`
- `modules/tenant-command-gateway/src/venue-execution-handlers.js`
- `modules/tenant-command-gateway/src/index.js`
- `schemas/v2/hypercore-*.schema.json`
- `scripts/check-schemas.mjs`
- `docs/architecture/ADR-038-agentic-execution-compatibility-layer.md`
- `docs/codex/audits/HYPERLIQUID-002/audit.md`

Transport parity beyond the gateway is reserved for a follow-on review unless
the implementation can reuse the existing protocol generator without adding
transport-specific business logic.

## Acceptance criteria

1. The Venue SPI exposes exactly `venueDiscoverCapabilities`,
   `venueReadBinding`, `venuePrepareDelegate`, `venueActivateDelegate`,
   `venueRevokeDelegate`, `venuePrepareExecution`, `venueSubmitExecution` and
   `venueReadExecution` through one provider contract.
2. Capability discovery is versioned, hash-bound, time-bounded and
   non-permissive for unknown/unsupported capabilities.
3. Account binding always carries the master/subaccount account identity and a
   distinct API-wallet signing identity. An account query using the API-wallet
   identity is rejected.
4. Delegate preparation accepts only a hash/reference to isolated future key
   material; activation is a distinct protected step; revocation is terminal;
   rotation requires a fresh address.
5. A deregistered, expired, compromised or retired API-wallet address cannot be
   reused, even after restart from a durable snapshot.
6. The two Hyperliquid signing schemes are explicit and cannot be silently
   interchanged. Canonical action field order and the lower-case address rule
   are tested.
7. Order/cancel/modify and server-proven reduce-only are the only executable
   action classes. Withdrawal, transfer, leverage/account changes,
   `approveAgent`, caller-supplied raw action and every unknown action fail
   closed before nonce reservation/signing.
8. Nonces remain unique, monotonic, time-window checked and never reissued.
   UNKNOWN results block replay and require read-side reconciliation.
9. Venue/risk observations are fresh, hash-bound and use the canonical account
   identity. Stale or drifted binding, delegate, policy, risk or capability
   state quarantines prepared work.
10. Receipts and Evidence contain hashes/references only, no private key, raw
    signature, raw provider response, PII or secret.
11. Tenant Command Gateway handlers use closed payloads and the existing AuthN,
    AuthZ, quota, audit, idempotency and transaction boundary. The local
    delivery profile refuses delegate activation and external submission.
12. Existing Hyperliquid and full repository tests remain green, apart from a
    separately documented pre-existing sealed-branch check if still present.

## Test commands

```sh
node --test modules/hypercore-venue-adapter/test/*.test.js
node --test modules/hyperliquid-execution/test/*.test.js modules/hyperliquid-risk-guardian/test/*.test.js modules/hyperliquid-reconciliation/test/*.test.js
pnpm run check:schemas
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run check
```

No live Hyperliquid command is an acceptance command for this local slice.

## Security checklist

- [x] Master/subaccount query identity is distinct from delegate signer.
- [x] No API-wallet private key crosses the adapter boundary.
- [x] No reusable raw signature or raw provider response is persisted.
- [x] Delegate activation and submission are disabled locally.
- [x] Revoked/expired/compromised/retired delegate addresses are tombstoned.
- [x] Withdrawal, transfer, leverage, account-mode and unknown actions deny.
- [x] Every allowed action is server-created, exact, policy- and risk-bound.
- [x] Nonce reservation is atomic and UNKNOWN is never blindly retried.
- [x] Drift and staleness quarantine prepared work.
- [x] Evidence remains hash-only and Tenant-scoped.

## Permission boundary

Approved now: repository-local implementation, schemas, fixtures, synthetic
tests, disabled adapters, local no-funds gateway registration and documentation.

Not approved now: network access, `approveAgent`, account mutation, key
material, live signing, Exchange transport, Testnet write/proof, funding,
withdrawal, transfer, real value, mainnet, external credentials, custody,
deployment or production enablement. Each requires a later explicit, named
human review.

## Migration impact

The first slice adds no database migration. Durable production delegate state
will require a separately reviewed Tenant-scoped PostgreSQL migration before
any activation or live proof. Local conformance uses a snapshot-capable
repository whose records are projections only.

## Rollback plan

Remove the Venue SPI/HyperCore adapter registrations and their schemas, keep
the existing signer-free Info, execution, risk and reconciliation modules
unchanged, and preserve every delegate tombstone and execution/reconciliation
Evidence already emitted. Rollback never reuses a retired signer and never
resubmits an UNKNOWN action.

## Completion Evidence

Completion Evidence is recorded in
`docs/codex/audits/HYPERLIQUID-002/audit.md`. The local/offline acceptance suite
passes. Active Tenant Protocol/AuthZ/SDK/MCP parity, durable delegate storage,
official signer composition and a later Hyperliquid Testnet proof remain
separate permissioned checkpoints and must not be inferred from offline
success.
