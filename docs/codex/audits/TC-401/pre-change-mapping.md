# TC-401 pre-change mapping

Prepared: 2026-07-25

## Source and human gate

- Branch: `codex/commercial-access-release`.
- Package baseline/source commit:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`.
- The Founder accepted TC-303 and explicitly approved continuation into
  TC-401.
- The accepted stacked worktree is intentionally uncommitted and must remain
  intact.
- The approval unlocks the TC-401 contract, code, offline fault injection,
  PostgreSQL restart/reorg tests, and protected non-redeemable Testnet
  simulation E2E.
- It does not supply or approve an exact live Provider account, live
  Subject/Agent account, live Facility destination, API Wallet, reusable
  signer, credential, external contribution transaction, mainnet operation, or
  real funds. Those paths remain unavailable and must be reported
  `UNVERIFIED`.

## Existing runtime truth

1. TC-103 owns the canonical `trading_facility.v1`. It links one bilaterally
   accepted Match Proposal and one executed non-withdrawable Obligation to the
   shared kernel. Its current contributions are explicitly local, synthetic,
   non-redeemable, and no-funds.
2. `activateTradingFacility` currently requires exact synthetic Subject and
   Provider contributions, an executed nonwithdrawable Obligation, current
   Facility state/version, and the exact Subject actor. It has no Testnet
   destination, receipt, finality, reorg, account-separation, or external
   reconciliation input.
3. TC-301 owns the isolated simulated Exchange writer and signer/nonce
   boundary. TC-302 owns monotonic protective risk. TC-303 owns cumulative
   order reconciliation. None of those modules funds or activates a Facility.
4. The canonical PostgreSQL Event Repository already provides Tenant-scoped
   serializable commands, idempotency, Events, Evidence, durable outbox, and
   exactly-once inbox processing. TC-401 must reuse it.
5. The canonical Facility and Ledger projections are already persisted through
   `PostgresCoreRepository`. TC-401 must use that repository for the Facility
   activation and must not create a second Facility, Ledger, Obligation
   kernel, or accounting policy.
6. No approved live account/cap package or non-exportable signer exists.
   Browser, Trader, Agent, test fixtures, logs, reports, and durable records
   may not receive raw addresses, private keys, signatures, credentials, raw
   venue responses, or arbitrary destinations.

## Change boundary

TC-401 will add one closed versioned Testnet Facility funding-control record
and one internal protected simulation module. The control will:

- bind one existing canonical Facility, Obligation, bilateral terms, canonical
  Ledger snapshot, fresh risk snapshot, and server-owned account-separation
  hashes;
- create exact Subject first-loss and Provider principal contribution intents;
- accept only source-fixed normalized finalized receipt Evidence;
- require the exact asset, amount, contributor role, and single segregated
  Facility destination;
- process every receipt through the existing durable inbox;
- atomically update the funding control, Event, Evidence, and outbox;
- invalidate a contribution on explicit reorg Evidence and require a fresh
  replacement receipt before readiness;
- reject wrong destination, asset, amount, stale/incomplete Evidence,
  duplicate economic contribution, account-authority collision, cap overflow,
  or kernel drift;
- require a fresh `NORMAL` risk state and privileged server authorization plus
  admission immediately before activation; and
- atomically activate the existing canonical Facility through
  `PostgresCoreRepository` while marking the control active.

The checked-in adapter will be source-fixed, network-disabled, and
simulation-only. It will not submit a contribution or expose a signer. Raw
addresses will be represented only by server-owned hashes.

## Contract and catalog decision

- Add
  `schemas/v2/hyperliquid-testnet-facility-funding-record.schema.json`.
- Add internal module `modules/hyperliquid-facility-funding`.
- Add migration `0037_trading_testnet_facility_funding`.
- Keep the Trading Capital Tenant catalog at 25 operations and the complete
  Tenant catalog at 71 operations.
- Add no OpenAPI, SDK, MCP, browser, AuthZ capability, admission quota,
  approval-policy, external endpoint, dependency, credential, or deployment
  surface.

## Planned verification

- Exact Provider and Subject contribution order-independence and duplicate
  receipt delivery.
- Wrong destination, asset, amount, role, incomplete/future/stale receipt,
  authority collision, and cap overflow.
- Reorg invalidation followed by fresh replacement Evidence.
- Fresh-risk, bilateral-terms, Facility, Obligation, Ledger, and account
  binding checks immediately before activation.
- Atomic canonical Facility activation and funding-control activation.
- PostgreSQL RLS, immutable identity/safety fields, legal transitions,
  restart replay, inbox idempotency, Event/Evidence/outbox counts, and rollback
  refusal while records exist.
- Protected simulation E2E only. Live Testnet contribution and activation
  remain `UNVERIFIED`.
