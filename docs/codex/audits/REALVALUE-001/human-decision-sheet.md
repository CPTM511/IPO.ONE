# REALVALUE-001 human decision sheet

Package: `REALVALUE-001-DECISION-PACKAGE-001`

Machine-readable source:
`docs/codex/audits/REALVALUE-001/decision-package.v1.json`

Current overall decision: `REJECT_LOCKED`

This document is a review interface, not an authorization instrument. Codex
cannot approve any row. Reviewers do not need an online account: they may
provide signed paper/PDF, meeting minutes or another offline record to the
IPO.ONE Founder. The Founder acts as Evidence custodian and supplies a faithful,
privacy-minimized transcription plus the source-record SHA-256 using
`offline-review-intake-template.md`.

A later human process must assign each required independent owner, attach the
required evidence, record an explicit approve/reject decision and bind it to an
exact artifact, policy and validity window. Any unanswered or expired P0 keeps
launch rejected.

## Decision register

| ID | Human approve/reject question | Required human owners | Current evidence | Residual risk | Current decision |
| --- | --- | --- | --- | --- | --- |
| RV-P0-01 | Capital source, beneficial owner, source of funds, amount, term and use restrictions? | Founder; Finance/source-of-funds reviewer; Legal | Missing | Unlawful/unavailable capital; undisclosed control rights | `REJECT_LOCKED` |
| RV-P0-02 | First and ultimate loss bearer, maximum loss, replenishment and no-guarantee disclosure? | Founder; Capital Risk | Missing | Unauthorized loss transfer; uncapped recourse | `REJECT_LOCKED` |
| RV-P0-03 | Entities, product/legal roles, jurisdictions, licensing, privacy and complaints? | Founder; Legal; Privacy/Compliance | Missing | Unlicensed activity; unenforceable obligations | `REJECT_LOCKED` |
| RV-P0-04 | Custody, safeguarding, settlement, reconciliation, withdrawal and recovery authority? | Founder; Custody/Treasury; Legal | Missing | Asset loss; unauthorized withdrawal; Ledger divergence | `REJECT_LOCKED` |
| RV-P0-05 | HSM/MPC signer, action allowlist, nonce, rotation, revocation, destruction and recovery? | Founder; Signer Custodian; Independent Security | Unverified | Key theft; signing escalation; replay | `REJECT_LOCKED` |
| RV-P0-06 | Exact chain, asset, venue, master/subaccount, contracts and finality? | Founder; Chain/Venue Risk; Legal | Unverified | Wrong chain/account; bridge/issuer/venue failure | `REJECT_LOCKED` |
| RV-P0-07 | Named Provider, Trader and Agent allowlist, KYP/KYB, SLA and removal criteria? | Founder; Participant Risk; Compliance | Missing | Fraud; conflicts; concentration | `REJECT_LOCKED` |
| RV-P0-08 | Numeric total and per-Facility/Agent/Trader/Provider/asset/chain caps? | Founder; Independent Risk | Missing | Loss beyond capacity; correlated concentration | `REJECT_LOCKED` |
| RV-P0-09 | Collateral, haircuts, first loss, margin and realized-income/loss waterfall? | Founder; Capital Risk; Finance | Missing | Collateral shortfall; wrong priority; synthetic income | `REJECT_LOCKED` |
| RV-P0-10 | Risk, staleness, stop-loss, REDUCE_ONLY, FLATTEN and recovery thresholds? | Founder; Independent Risk; Operations | Partial | Delayed protection; stale data; automatic reopening | `REJECT_LOCKED` |
| RV-P0-11 | Payer, pricing/fees, tax, disclosures, chart of accounts and reconciliation? | Founder; Finance; Legal | Missing | Unlawful pricing; accounting error | `REJECT_LOCKED` |
| RV-P0-12 | SLO, 24-hour rota, alerts, recipients, escalation, incident ownership and exercises? | Founder; Operations; Risk on-call | Partial | No response during loss/outage; open P2 | `REJECT_LOCKED` |
| RV-P0-13 | Independent review of exact custody/signer/Exchange/funds/infrastructure artifact with P0/P1 zero? | Founder; Independent Security | Unverified | Critical self-review blind spot | `REJECT_LOCKED` |
| RV-P0-14 | Pause, reduce, flatten, settle, recover capital, rollback, correct and notify? | Founder; Operations; Custody/Treasury | Partial | Trapped/duplicated capital; economic-state divergence | `REJECT_LOCKED` |
| RV-P0-15 | Production identity, data, secrets, database, DR, RPC/indexer, monitoring and deployment? | Founder; Infrastructure; Privacy/Security | Missing | Sandbox/production confusion; data/credential loss | `REJECT_LOCKED` |
| RV-P0-16 | Exact-release final go/no-go and separate launch-policy revision? | Founder/Release; Legal; Security; Risk; Operations | Missing | Approval drift; evidence mistaken for authority | `REJECT_LOCKED` |

## Minimum order of review

1. Assign the independent and operational owners. They may stay offline, but
   an `UNASSIGNED` approver remains a launch blocker.
2. Complete RV-P0-01 through RV-P0-15 with exact, current Evidence.
3. Rebuild an exact content-addressed release and repeat security, PostgreSQL,
   disaster-recovery, live account and bounded signed Testnet acceptance.
4. Obtain independent legal, security and risk decisions.
5. Only then prepare a separate launch-policy revision for human review.
6. RV-P0-16 must bind the exact release, policy, chain, asset, accounts,
   participants, capital amount, caps and expiry. It cannot be inferred from
   any earlier approval.

## Explicitly not authorized

- mainnet or real funds;
- API Wallet or production signer provisioning;
- Hyperliquid Exchange writes;
- withdrawal, transfer, custody or capital movement;
- deployment or launch-policy modification; or
- Codex approval on behalf of any human.
