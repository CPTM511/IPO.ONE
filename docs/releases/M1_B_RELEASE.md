# M1-B Release

Status: `CLOSED_LOCAL_NO_REAL_FUNDS`

## Identity

- Immutable safety checkpoint: `fb83a83566b136aa24159d1ab42b8db0caf9b40d`
- Final implementation SHA: `PENDING_FINAL_VERIFICATION_COMMIT`
- Rollback target: `fb83a83566b136aa24159d1ab42b8db0caf9b40d`

The final implementation is a local, persistent, no-real-funds product. It is
not a remote deployment, production financial release, or capital authorization.

## Major defects fixed

- Human PostgreSQL session refresh is serialized, and Human Offer v1/v2 state
  recovers from authenticated server truth across reload, re-login, and restart.
- Human acceptance is bound to the exact authorized Offer and terms.
- Agent MCP carries `providerId` and `providerCategory` through the Tenant
  Gateway into durable PostgreSQL execution.
- Agent execution preserves Mandate, Facility, Provider-scope, idempotency,
  Ledger, repayment, and Evidence invariants across restart.
- Capital Partners can review, author or replace an Offer, and the borrower
  recovers the current Offer.
- SIWE-only authentication remains unable to perform operations that require
  recent phishing-resistant MFA.

## Canonical runtime

```text
Human Web / Agent MCP / Tenant API
  -> Tenant Protocol
  -> TenantCommandGateway
  -> shared deterministic kernel
  -> PostgreSQL canonical truth
```

The in-memory demo remains compatibility-only and non-authoritative.

## Final verification

- Locked install: `PENDING`
- Required repository gate: `PENDING`
- PostgreSQL integration: `PENDING`
- Agent before/restart/after recovery: `PENDING`
- Minimal Human, Agent, Capital Partner, and Risk browser smoke: `PENDING`

## Deployment state

- Local loopback product: runnable for Founder review.
- Remote deployment: pending separate Founder authorization.
- Generic launch policy and deployment identity checks remain active.
- The versioned Vercel sandbox v2 manifest and package/config files are retained
  because the canonical deployment runtime references them; they grant no
  deployment authority.

## Explicitly disabled authorities

- Real funds and real Human lending
- Mainnet and production asset movement
- Signer, custody, withdrawal, and Venue-write authority
- Protocol fees
- Public Risk/Admin promotion under SIWE-only authentication
- Paid external Provider or capital commitment

## Deferred M1-C/L2 work

- Compose phishing-resistant MFA before promoting privileged Risk operations.
- Complete separately approved hosted deployment and invitation controls.
- Revisit production Provider, signer, custody, capital, servicing, legal,
  privacy, and loss-bearing decisions only through named human approvals.
- Keep A2A, subscriptions, streaming transports, new CreditLine products, new
  chains, new Venues, and scoring-model changes outside this closure.
