# DEPLOY-001B Provider and Cost Review

Observed: 2026-07-27
Decision state: recommendation only; founder approval and fresh quotes required

## Outcome

Recommend **Vercel Web + Neon Launch PostgreSQL 17 + Google Cloud Run API +
Cloud Run Jobs/Scheduler** for the first synthetic closed pilot.

This is the best present balance of low idle cost, code compatibility,
recoverability, and reversibility. It is conditional on accepting authenticated
public-TLS database reachability between Cloud Run and Neon. If a private
provider network is mandatory, use Cloud SQL + Cloud Run instead.

No Vercel project is locally linked, the Vercel CLI is absent, and no provider
integration, account, resource, billing plan, DNS record, secret, or remote
access was created during this review.

## Code constraints checked

IPO.ONE is not a generic stateless CRUD service:

- `modules/persistence/src/postgres-tenant-context.js` sets Tenant, Actor,
  policy, and safe `search_path` values transaction-locally;
- repositories use PostgreSQL transaction advisory locks;
- outbox claims use `FOR UPDATE SKIP LOCKED` with recoverable leases;
- `modules/persistence/src/postgres.js` already owns bounded application
  pooling; and
- runtime and database contracts require Node 26.5.0 and PostgreSQL 17.

Therefore the private runtime and worker must use Neon's direct TLS endpoint
through the existing application `pg.Pool`. Neon's pooled endpoint uses
PgBouncer transaction mode, whose documented limitations include session-level
features. It is not approved as IPO.ONE's canonical connection without a
separate compatibility test.

## Weighted review

Scoring is 1–5 against: safety/durability 30%, current-code compatibility 25%,
L1 cost 20%, operations simplicity 15%, and portability 10%.

| Option | Safety | Compatibility | Cost | Operations | Portability | Weighted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Vercel + Neon Launch + Cloud Run | 4 | 5 | 5 | 3 | 4 | 86/100 |
| Vercel + Cloud SQL + Cloud Run | 5 | 5 | 2 | 4 | 4 | 83/100 |
| Vercel + Render runtime/DB | 4 | 5 | 3 | 3 | 4 | 78/100 |

The scoring is a decision aid, not an assurance certification.

## Cost snapshot

Assumptions: one small PostgreSQL database, approximately 1 GB data, ten or
fewer invited users, low request volume, API max one instance, scheduled
worker jobs, no HA replica, no real-value workload, and existing Vercel Web
cost excluded.

| Option | Indicative incremental monthly posture | Main cost behavior |
| --- | --- | --- |
| Neon Launch + Cloud Run | roughly USD 15–30 before taxes and unusual egress | Neon publishes a USD 15/month typical intermittent 1 GB example; low Cloud Run use can remain inside or near its free allowances |
| Cloud SQL + Cloud Run | obtain a calculator quote; expected higher fixed floor | Cloud SQL compute is charged while the instance is active; HA adds a charged standby |
| Render runtime + Postgres + worker | roughly USD 20–40, dashboard quote required | paid database plus separate API and worker/cron service; simpler runtime operations but more always-on floor |

These are planning ranges, not quotes. Re-check prices immediately before
approval and set a provider budget alert and hard topology caps.

## Why the recommendation fits

- Neon Launch supplies the required seven-day restore window and managed
  PostgreSQL while retaining a low intermittent-use posture.
- Direct PostgreSQL connections preserve transaction-local RLS context,
  advisory locks, and lease semantics.
- Cloud Run accepts the existing OCI image and can scale the request-driven API
  to zero, with max instances capped at one initially.
- Cloud Run Jobs fit scheduled reconciliation, synthetics, Evidence
  finalization, credit-outcome materialization, and alert delivery without
  paying for an always-on worker before cohort evidence requires it.
- The existing Vercel deployment remains the Web/BFF boundary and does not
  become the private database or signer.
- All components are replaceable through standard OCI, PostgreSQL, HTTP, and
  scheduled-job boundaries.

## Material tradeoffs

1. Neon and Cloud Run are cross-cloud. Expect public TLS, possible egress, and
   more latency than a same-provider database. Select aligned Singapore regions
   only after founder review; both providers publish Singapore availability.
2. Neon Launch does not provide the private-network controls of higher tiers.
   The L1 dataset must remain synthetic/redacted, credentials least-privilege,
   TLS verified, and direct database access limited to the API/worker.
3. Scale-to-zero causes cold starts. This is acceptable for a small private
   pilot but must be measured.
4. Scheduled outbox processing introduces bounded delivery delay. It is
   acceptable only while no real-value or time-critical execution is enabled.
5. The database and runtime have separate provider consoles and incident
   surfaces.

## Alternatives

### Cloud SQL + Cloud Run

Choose this if private Google connectivity, one-cloud incident ownership, or
the existing Cloud SQL connector runbook outweighs cost. It has the strongest
control posture and closest fit to the repository's prior GCP deployment
assets, but it keeps database compute allocated and paid while active.

### Render runtime + Render Postgres

Choose this if a single vendor for Docker runtime, private service, background
worker/cron, and PostgreSQL matters more than scale-to-zero. Render supports
Docker, paid Postgres PITR, direct connections, integrated optional PgBouncer,
and Singapore. Vercel is still retained for Web, so the overall system is not
actually single-vendor.

### Vercel-only runtime

Rejected for this issue. Vercel Functions have bounded execution duration and
are not the selected host for a durable Node worker. Vercel Services is still a
beta surface and its current guidance does not validate Node as the production
service runtime for this workload. Vercel remains the Web and bounded BFF.

## Official sources

- [Vercel Neon Marketplace](https://vercel.com/marketplace/neon)
- [Neon pricing](https://neon.com/pricing)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon PostgreSQL 17 default](https://neon.com/docs/changelog/2025-01-10)
- [Neon regional latency and Singapore availability](https://neon.com/demos/regional-latency)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Run minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances)
- [Cloud Run autoscaling](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)
- [Cloud Run to Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/connect-run)
- [Cloud SQL pricing](https://cloud.google.com/sql/pricing)
- [Render service types](https://render.com/docs/service-types)
- [Render Docker support](https://render.com/docs/docker)
- [Render Postgres recovery](https://render.com/docs/postgresql-backups)
- [Render flexible Postgres plans](https://render.com/docs/postgresql-refresh)
- [Render July 2026 small-business cost snapshot](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses)
- [Vercel Function limits](https://vercel.com/docs/functions/limitations)

## Approval gate

Provisioning may begin only after the founder records:

- selected option and region;
- monthly cost ceiling;
- billing and provider-account owners;
- public-TLS database risk decision;
- restore and incident owners; and
- explicit authority for the exact next issue.

Approval of this recommendation would authorize provider setup only if the
founder says so explicitly. It would not authorize remote participants, testnet
writes, signers, external execution, Human credit, or real funds.
