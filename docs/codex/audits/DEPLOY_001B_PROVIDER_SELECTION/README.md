# DEPLOY-001B Provider Selection Evidence

Observed: 2026-08-30

Decision state: Founder-selected existing stack; cohort activation pending

## Outcome

The selected stack is the existing Vercel project plus the existing
Vercel-managed Neon Launch PostgreSQL project. Cloud SQL and Cloud Run are not
selected for PILOT-008B.

```text
ipo-one-internal on Vercel
  -> Vercel Node Functions
  -> bounded Vercel Cron
  -> ipo-one-m1-b-sandbox on Neon Launch, aws-us-east-1
```

## Sanitized evidence

- Vercel project exists and serves the production-readiness contract.
- Production PostgreSQL variables are distinct Vercel `sensitive` values; they
  are not exportable and no value was printed.
- Neon organization is `managed_by=vercel` with `plan=launch`.
- Neon project `ipo-one-m1-b-sandbox` is active in `aws-us-east-1`.
- Its one `main` branch is ready.
- PostgreSQL 17 is reachable over TLS and contains 69 migrations through
  `0069_auth_reference_hash_key_rotation`.
- The expected durable schema is present; all 152 observed tenant-scoped tables
  have RLS and FORCE RLS.

## Superseded alternatives

- `vercel_neon_cloud_run`: not applicable because Vercel Functions and bounded
  Cron already implement the required small-pilot runtime.
- `vercel_cloud_sql_cloud_run`: withdrawn because Neon is the authoritative
  durable source of truth and there is no requirement for a second database or
  control plane.

These alternatives may not be revived merely because historical documents or
resources exist.

## Gates preserved

Provider selection does not weaken transaction-local Tenant context, advisory
locks, `SKIP LOCKED` leases, forced RLS, TLS, backup/restore, reconciliation,
runtime observability, independent Security, Legal/Privacy or operational
ownership requirements.

Technical-readiness deployment and the approved additive migration are allowed.
New provider provisioning, plan upgrade, participant access, profile activation,
real funds, signer, external execution, chain writes and Pool economic writes
remain false.
