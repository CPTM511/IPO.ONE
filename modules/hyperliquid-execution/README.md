# Hyperliquid Testnet Execution Boundary

TC-301 implements an offline, simulation-only model of the protected
Hyperliquid Testnet writer. It is intentionally not a live Exchange client.

## Current authority

- Fixed profile: `POST https://api.hyperliquid-testnet.xyz/exchange`.
- Network transport: unavailable.
- API Wallet: not approved and not provisioned.
- Live signer: unavailable.
- Mainnet, production, withdrawal, transfer, account administration, and funds
  authority: unavailable.
- Supported simulated action shapes: `order`, `reduceOnlyOrder`, `cancel`,
  `cancelByCloid`, and `modify`.

The gateway constructor accepts only an offline binding resolver, a
fail-closed server policy evaluator, an isolated simulated signer, a
network-disabled simulated transport, and a nonce repository. Supplying an
origin, URL, fetch implementation, private key, raw action, unknown field, or
live-capable adapter fails before a nonce is reserved.

## Signer lifecycle boundary

The signer port exposes only `sign({digestHash})`. It has no key import,
export, reveal, derive, register, rotate, revoke, address-selection, or
arbitrary-message method. The checked-in simulated signer has no key material
and produces a non-reusable deterministic test artifact.

A later approval must select and review the real non-exportable custody
technology, per-Facility API Wallet registration, rotation, revocation,
emergency retirement, subaccount binding, official signing implementation,
deployment identity, and operational owners. None of those decisions are
implemented or implied by this module.

## Nonce and recovery model

Nonce state is:

`RESERVED -> SUBMITTED -> CONFIRMED | REJECTED | UNKNOWN`

A local pre-submission signer rejection may transition directly from
`RESERVED` to `REJECTED`; the nonce remains consumed. Nonces are unique and
monotonic per hashed signer reference. Idempotent replay returns the same
terminal record. `UNKNOWN` is terminal and is never resubmitted.

The PostgreSQL repository uses the existing Tenant-scoped serializable
transaction boundary. It atomically advances the nonce head, writes the
hash-only execution record, and appends an immutable transition. It persists
no private key, raw account address, raw response, raw signature, or reusable
signature.

## Live activation gate

Do not add a real signer or network transport until a new human approval names:

1. the Founder-controlled qualified Testnet master/subaccount;
2. the per-Facility API Wallet and non-exportable custody implementation;
3. numeric global, Facility, action, exposure, price, size, and rate caps;
4. the kill-switch and recovery owners;
5. the exact deployment and credential-destruction procedure; and
6. the bounded Testnet order/cancel/reduce-only E2E evidence plan.

Live activation also requires independent security review and official signing
conformance. This module cannot be treated as production or live-Testnet
readiness evidence.
