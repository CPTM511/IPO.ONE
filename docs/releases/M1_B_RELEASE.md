# M1-B Release

Status: `MERGED_HOSTED_NO_REAL_FUNDS`

## Release identity

- Immutable safety baseline: `fb83a83566b136aa24159d1ab42b8db0caf9b40d`
- Final implementation SHA: `a0d32b4f9b936eacc1a80d0417fc1349a57ab2eb`
- Final accepted candidate SHA: `74ac425dad33bf667ee2550e33e36220dcfed402`
- Final accepted candidate tree: `fc5f3eb1c4de1cc7e97e6fa5cc1a411b53490f7f`
- GitHub merge commit: `80efebf33352cd2fd787ef564c5cc7038a5359f0`
- Hosted release SHA: `74ac425dad33bf667ee2550e33e36220dcfed402`
- Primary Vercel deployment: `dpl_GYsPPTJ49pB4KrxFdHNJow5PTeUg`
- Primary deployment URL:
  `https://ipo-one-internal-8y9a1jmfx-cptm-111-s-projects.vercel.app`
- Verified hosted rollback deployment: `dpl_2JBesAqB2MXZZBCEDypMq5Gzm7Ue`
- Rollback deployment URL:
  `https://ipo-one-internal-8cbtv7ara-cptm-111-s-projects.vercel.app`
- Immutable local safety baseline: `fb83a83566b136aa24159d1ab42b8db0caf9b40d`

M1-B is merged and hosted at <https://ipo.one> on the exact accepted product
artifact. The hosted profile remains synthetic or redacted and
no-real-funds. Hosting does not authorize mainnet activity, real value,
production Human lending, custody, signing, withdrawals, Venue writes, or
external Provider execution.

## Final fixes

- Human PostgreSQL session refresh is serialized, and the current Human Offer
  recovers from authenticated server truth across reload, re-login, and
  restart.
- Human acceptance is bound to the exact current Offer and terms; a replaced
  or stale Offer cannot be accepted.
- Agent MCP carries Provider scope through Tenant Gateway into durable
  PostgreSQL execution, Ledger, repayment, Evidence, and restart recovery.
- Capital Partners can author or replace bilateral synthetic Offers, while the
  borrower recovers only the current Offer.
- SIWE-only authentication cannot satisfy phishing-resistant recent-MFA policy
  for privileged Risk or Operations actions, and no weak fallback exists.

## Canonical runtime and simplification result

```text
Human Web / Agent MCP / Tenant API
  -> Tenant Protocol
  -> TenantCommandGateway
  -> shared deterministic obligation kernel
  -> PostgreSQL canonical truth
```

The in-memory demo is compatibility-only and non-authoritative. The former
release-specific evidence ceremony is not a release gate. Final acceptance
used the canonical GitHub quality gate, one retained Agent MCP lifecycle and
restart-recovery smoke, focused Human/Capital Partner/Risk checks, and this
single release record.

## Final remote CI

- Exact candidate: `74ac425dad33bf667ee2550e33e36220dcfed402`.
- Required GitHub Actions run: `31864233046`, event `pull_request`, conclusion
  `success`; the duplicate push-triggered run was cancelled before use.
- Locked install, lint, typecheck, schemas, migrations, Tenant Protocol,
  security, transport, PostgreSQL, deployment topology, local-stack contract,
  launch policy, web bundle, aggregate tests, and production dependency audit
  passed without source changes.
- Static counts: 699 source modules, 136 schemas, 21 OpenAPI paths and 21
  operations, 61 migration up/down pairs, and 102 Tenant Protocol operations.
- Test counts: security 34/34, transport 80/80, PostgreSQL 87/87, aggregate
  1008/1008; production dependency audit found no known vulnerability.
- CI evidence: <https://github.com/CPTM511/IPO.ONE/actions/runs/31864233046>

## Minimal final acceptance

### Human

- Real invited OKX wallet connected on Base Sepolia (`eip155:84532`) and
  established one authenticated SIWE session.
- The borrower recovered the same current $120.00 Offer from PostgreSQL after
  reload: Offer digest `0x0924c293...9e88ef`, terms digest
  `0xa7883e40...3ffca8`.
- The exact no-funds action was confirmed manually in the wallet. One
  Obligation and a deterministic two-installment schedule were created, with
  three finalized offchain Evidence events. No transaction, token approval,
  signer injection, or funds movement occurred.
- Repayment was not repeated: the required final state was Obligation creation,
  and the retained Agent smoke already exercised repayment and recovery.

### Agent

- One retained MCP -> Tenant Gateway -> PostgreSQL -> controlled execution ->
  Ledger -> repayment lifecycle passed on the exact candidate image.
- After one full local stack restart, the same Subject, Mandate, Offer,
  Obligation, Facility, CreditLine, Ledger, repayment, and Evidence state was
  recovered; Evidence count advanced from 14 to 15. `productionFundsMoved`
  remained `false`.

### Capital Partner

- The real SIWE Borrower session was denied Capital Partner workspace recovery
  and disclosed no authorized application, confirming role isolation without
  an authentication bypass.
- The existing PostgreSQL Capital Partner runtime path passed: v1 Offer was
  replaced by v2, a fresh borrower session recovered only v2, and v1 acceptance
  failed closed. Its 42-test Tenant Gateway parent passed 42/42 in the Lima
  database network with no source change; an initial host-port invocation ended
  only in tunnel cleanup timeout and did not report a business assertion
  failure.

### Risk and Operations

- The SIWE-only Borrower session reached the Risk surface but received
  `Access required`; portfolio, queue, and protective mutation state remained
  unavailable, with no weak fallback or mutation.
- The focused policy assertion passed 1/1: SIWE-only Risk and Operations
  sessions fail closed for every recent-MFA policy.

## Deployment and rollback state

- Public origin: <https://ipo.one>; `www.ipo.one` redirects to the apex origin.
- `/livez`, `/readyz`, and `/.well-known/ipo-one.json` returned HTTP 200 on
  2026-08-15 and reported exact release
  `74ac425dad33bf667ee2550e33e36220dcfed402`, deployment role `primary`,
  profile `closed_non_funds_pilot`, and `realFundsEnabled:false`.
- The current Primary Vercel deployment is
  `dpl_GYsPPTJ49pB4KrxFdHNJow5PTeUg`; Vercel reported it `READY` and production
  targeted. This is hosting identity, not real-value production authority.
- The verified rollback deployment is
  `dpl_2JBesAqB2MXZZBCEDypMq5Gzm7Ue`, the last independently recorded hosted
  zero-funded baseline. Rollback would restore that older hosted artifact; it
  would not activate real value or replace reviewed data-recovery procedures.

## Explicitly disabled flags and authorities

- `realFundsEnabled: false`
- `productionFundsMoved: false`
- Real Human lending, mainnet, and production asset movement
- Signer, custody, withdrawal, arbitrary spend, and Venue-write authority
- Protocol fees, public pools, deposits, allocations, and capital commitment
- Public Risk/Admin promotion under SIWE-only authentication
- Paid external Provider execution and remote Agent HTTPS

## Deferred to M1-C / L2

- Compose phishing-resistant MFA before privileged Risk or Operations
  promotion.
- Complete separately authorized participant invitation, observability,
  rollback exercises, and closed-pilot gates.
- Review production Provider, signer, custody, capital, servicing, legal,
  privacy, and loss-bearing decisions through named human approvals.
- Keep A2A, subscriptions, streaming transports, new CreditLine products, new
  chains, new Venues, and scoring-model changes outside M1-B closure.
