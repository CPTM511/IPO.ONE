# IPO.ONE Vercel Sandbox Architecture

## Status and authority

Status: `IMPLEMENTED_LOCALLY_PENDING_DEPLOYED_EVIDENCE`

This architecture implements the Founder-authorized M1-B Deployable Sandbox
Vertical Slice. It does not authorize or claim an RC, release, paid pilot,
mainnet operation, production financial service, real funds, custody, protocol
fees, external signer, withdrawal, transfer, or venue-write authority.

The Vercel target environment is `production` only because Vercel Cron invokes
production deployments. The IPO.ONE product profile remains an invitation-only,
synthetic, no-real-funds sandbox.

## Two-project role-isolated topology

```text
Invited Founder wallet                         DPoP-bound Agent workload
        |                                                |
        v                                                v
Primary Vercel Project: Principal/Agent/Automation (Node.js Functions)
  - Web assets and Principal authentication routes
  - /tenant/v1/operations
  - /livez, /readyz, /tenant/v1/healthz
  - /api/cron (authenticated, bounded recovery cycle)
        |
        |     Same invited Founder wallet
        |               |
        |               v
        |     Risk Vercel Project: Risk/Admin (Node.js Functions)
        |       - separate SIWE issuer and client binding
        |       - Risk views and freeze operations
        |       - no Cron registration
        |               |
        +---------------+
                        v
Neon PostgreSQL 17 through Vercel Marketplace
  - canonical domain state and projections
  - sessions and continuation receipts
  - Events, Evidence, inbox, outbox, leases, attempts
  - idempotency, reconciliation, CreditLine, Lockbox
```

The second project is required because one fixed SIWE issuer/client binding
cannot map the same wallet to both Principal Controller and Risk Operator
without a broad authentication redesign. Both projects deploy the same exact
source commit and share one canonical database. No continuous worker, external
queue, Redis, Kafka, second database, object store, or Edge runtime is
introduced.

## Process conversion

| Existing process | Vercel form | Canonical semantics |
| --- | --- | --- |
| Production Tenant HTTP listener | Request-driven Node.js Function | The same Tenant request handler, authentication composition, Gateway, policy, and PostgreSQL repositories |
| Web asset server | Same Node.js Function | Server-derived CSRF and session bootstrap; browser storage remains cache-only |
| Local worker loop | One bounded Cron Function cycle | Existing PostgreSQL outbox claim, lease, retry, materialization, and reconciliation logic |
| Provider callback processing | Authenticated `workerProcessInbox` operation at `/tenant/v1/operations` | Signed payload verification, durable inbox, nonce replay rejection, command idempotency |
| Chain receipt processing | Authenticated typed operations at `/tenant/v1/operations` | Read-only Testnet Evidence ingestion and durable idempotency; no signer or chain write |
| Worker heartbeat file | Function result, Vercel logs, and durable reconciliation/outbox state | No local filesystem or instance-lifetime truth |

## Persistence and authorization boundaries

PostgreSQL is authoritative for Subjects, Principals, Agent bindings, Mandates,
Offers, Authorizations, Facilities, Obligations, repayments, CreditLine
projections, Lockboxes, continuation receipts, Events, Evidence, inbox/outbox,
idempotency, and reconciliation.

Each spend or draw continues to validate the current Offer, Policy,
Authorization, Facility, Mandate or Consent, existing exposure, projection
version, and current status. CreditLine remains a derived projection and never
independently authorizes exposure. A stale or inconsistent projection fails
closed.

The two browser roles authenticate through invitation-only SIWE with distinct
project origins and client bindings. The Agent authenticates with the existing
asymmetric `private_key_jwt` and DPoP sender-constraint model. Vercel stores
only the public workload JWKS. The workload authentication private key remains
outside Vercel and cannot sign transactions, transfers, withdrawals, or venue
writes. A client-supplied certificate thumbprint header is rejected because
Vercel is not the trusted mTLS terminator. Vercel function
instances cache only the composed adapters and database pools. Cache loss
causes reconstruction from PostgreSQL and cannot create authority or financial
state.

## Serverless database management

- Gateway pool: maximum one connection per Function instance.
- Authentication pool: maximum one connection per Function instance.
- Cron pool: maximum two connections per invocation so one connection can hold
  the advisory lock while bounded repository work uses the second.
- Idle pool lifetime: five seconds with `allowExitOnIdle` enabled.
- Runtime roles remain separate, forced-RLS, least-privilege roles.
- Migration/bootstrap credentials are never available to request Functions.
- Neon pooled connection endpoints are preferred.

## Retry, lease, and idempotency behavior

The Cron route is `/api/cron` and runs on Vercel Pro at `*/5 * * * *`.
Vercel supplies `Authorization: Bearer ${CRON_SECRET}`; the endpoint also
supports an authenticated `POST` recovery invocation. It never accepts an
unauthenticated processing request.

Each cycle:

1. obtains the PostgreSQL advisory lock `ipo.one / vercel-sandbox-cron`;
2. skips without mutation when another cycle holds the lock;
3. materializes at most 64 credit outcomes;
4. claims at most 64 outbox rows with `FOR UPDATE SKIP LOCKED`;
5. binds every claim to a worker ID and 30-second lease;
6. increments durable attempt counts;
7. marks successful delivery or releases failures with `available_at` retry;
8. executes one reconciliation command keyed to the five-minute time bucket;
9. returns bounded, no-real-funds structured output.

Outbox messages have retry counters, maximum attempts, next-attempt time,
dead-letter state, and lease recovery. Provider callback identity, nonce,
signature, delivery binding, and command idempotency prevent duplicate effects.

## Edge and timeout behavior

The deployment uses the Node.js 24 runtime and a 30-second maximum duration.
Requests must match the configured HTTPS production project origin and the
Vercel-provided unique deployment headers. Direct, downgraded, host-drifted,
or non-Vercel requests fail before authentication.

Cron and request work is intentionally bounded below the Function timeout.
Unexpected termination leaves uncommitted transactions rolled back and leased
outbox work eligible for retry after lease expiry.

## Known Vercel limitations

- Cron is attached only to Vercel production deployments. The Vercel target
  label is therefore not evidence of IPO.ONE production readiness.
- Neon Free may scale to zero after inactivity, so the first request can have a
  cold database wake-up delay.
- Vercel Functions can overlap and Cron can be delivered more than once;
  PostgreSQL locking, leases, and idempotency are mandatory.
- Function-local files, memory, and open connections can disappear at any
  time and are never canonical state.
- Existing Base Sepolia and X Layer profiles remain read-only or synthetic
  unless separately authorized. No chain signer is deployed.
- The primary project is the only Cron target. The Risk project cannot invoke
  scheduled automation through Vercel Cron configuration.

## Intentionally deferred

- Protocol fee runtime (`REQ-PAY-002`); UI states that fees are disabled.
- Full Human dispute and appeal workflow (`REQ-UX-001`).
- Capital Partner browser workspace (`REQ-UX-003`).
- External account signer or transaction authority (`REQ-TRADE-002`).
- Controlled-pilot prerequisites (`REQ-PILOT-001`, `REQ-PILOT-002`).
- Real funds, custody, mainnet, KYC vendor, production lending, withdrawals,
  venue writes, public signup, and paid external queues.

## Expected monthly cost

- Vercel Pro: the Founder-confirmed team already has the Pro platform fee and
  included usage credit. Both projects remain inside that team. Expected
  incremental M1-B cost is USD 0 at the invitation-only test volume, subject
  to metered usage and actual invoice evidence.
- Neon Free: expected USD 0/month within the current Free allowance, including
  scale-to-zero. A paid Neon plan is not authorized.
- Added services: USD 0/month; no paid queue, cache, worker host, analytics
  add-on, domain, or object store is added.

Pricing sources: [Vercel Pro Plan](https://vercel.com/docs/plans/pro-plan) and
[Neon pricing](https://neon.com/pricing). Actual usage and invoices remain the
authoritative cost evidence.
