# Hyperliquid Testnet Facility funding and activation

This module is the TC-401 protected, simulation-only funding-control boundary.
It binds non-redeemable Testnet-labeled contribution Evidence to one existing
canonical Facility and atomically releases that Facility's existing activation
transition only after exact reconciliation.

It does not connect to Hyperliquid, submit a contribution, provision an API
Wallet, sign a transaction, expose an address, move funds, deploy, or use
mainnet.

## What it proves

- Subject first-loss and Provider principal intents are derived from the exact
  immutable bilateral Facility terms.
- Both contributions must use the exact asset, exact amount, and one
  server-bound segregated Facility destination.
- Funds never pass through a Trader-controlled or Agent-controlled withdrawable
  wallet.
- The Facility destination, master account, withdrawal authority, and
  execution signer are represented only by server-owned hashes and must remain
  separated.
- Source-fixed normalized receipt Evidence is processed through the existing
  durable inbox. Duplicate delivery cannot duplicate an Event, Evidence,
  outbox message, contribution, balance, or activation.
- Reorg invalidation removes the affected contribution and requires fresh
  replacement Evidence before readiness.
- Wrong destination, asset, amount, role, finality, cap, Facility, Obligation,
  bilateral terms, Ledger, risk, or account binding fails closed.
- Privileged activation rechecks server authorization, admission, exact
  contribution balances, current canonical Facility state, and a fresh
  `NORMAL` risk snapshot.
- PostgreSQL commits the funding-control activation and the existing canonical
  Facility activation in one Tenant-scoped serializable transaction.

## Shared-kernel boundary

The funding control is not a second Facility. It has a unique foreign key to
the existing `trading_facilities` row and records
`canonicalFacility=true` and `secondFacilityCreated=false`.

It is not a second Ledger and does not invent a Testnet accounting policy.
The existing canonical Ledger snapshot is hash-bound and must remain
unchanged. The control records `canonicalLedger=true`,
`ledgerMutationCreated=false`, and `secondLedgerCreated=false`.

The canonical Facility continues to own the bilateral terms, Obligation link,
lifecycle, and risk state. TC-401 only adds the exact receipt/finality gate
that must succeed before its existing activation transition.

## Reorg and restart

A `REORG_INVALIDATION` receipt must name the exact previously accepted receipt
hash. The affected contribution returns to an awaiting state. A different
finalized transaction can then restore readiness. Unknown or mismatched
invalidation Evidence becomes an incident.

The funding record, receipts, Events, Evidence, outbox, inbox, and canonical
Facility transition are durable. Restart replay uses the same idempotency
identity and performs no second contribution or activation.

## Live activation gate

The checked-in receipt adapter is network-disabled and cannot submit value.
All amounts and caps exercised in tests are protected simulation fixtures, not
approved production limits.

A new, precise human approval and independent review are still required for:

- exact live Provider, Subject/Agent, master, subaccount, Facility destination,
  and withdrawal-authority accounts;
- exact live contribution caps and assets;
- a real source-chain transaction, bridge/deposit path, finality rule, reorg
  window, and source-fixed read adapter;
- API Wallet, live signer, custody, credential lifecycle, or reusable signing;
- live Testnet contribution submission or external Facility activation;
- Ledger policy for real external balances; and
- deployment, mainnet, production, real capital, or real funds.

The protected simulation E2E is not live-Testnet or production-readiness evidence.
