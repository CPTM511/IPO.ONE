# M1-B Deployment Blockers

## Current status

Status: `VERCEL_ARCHITECTURE_AUTHORIZED_DEPLOYED_EVIDENCE_PENDING`

The Founder Deployment Architecture Amendment supersedes the prior unresolved
Railway/GCP provider decision. The authorized topology uses two role-isolated
Vercel Projects, within the amendment's maximum of two, with Node.js Functions,
Vercel Pro five-minute Cron on the primary project only, and one Neon
PostgreSQL 17 database installed through the Vercel Marketplace on the
lowest/free tier.

The existing Vercel team and project are:

```text
team: cptm-111-s-projects
project: ipo-one-internal
project ID: prj_KLyAPHnFCtQAxIbUjdJa012gAq7Y
risk project: ipo-one-internal-risk (pending creation)
```

No custom domain, paid Neon tier, paid add-on, third project, external worker,
queue, cache, signer, or production financial path is authorized.

## Remaining execution blockers

1. Create one exact normal implementation commit that excludes protected user
   WIP and unrelated work. This is not an RC commit or release.
2. Create only the approved Risk project and provision the Neon Free
   integration. Stop if either operation requires a paid add-on or new billing
   commitment.
   plan or an additional billing commitment.
3. Apply and record the exact 53 migrations, least-privilege roles, and
   synthetic invitation seed.
4. Configure the Vercel runtime variables without exposing values.
5. Deploy the exact clean bundle and bind it to its commit/tree/artifact hash.
6. Complete the authenticated deployed Agent Golden Flow and all 15
   serverless-specific acceptance checks.
7. Preserve Playwright trace, screenshots, Events, database evidence, logs,
   replay/restart proof, and rollback proof.

Until these items pass, `REQ-CREDIT-009`, `REQ-UX-004`, and `REQ-UX-005`
remain `IMPLEMENTED_UNVERIFIED` and no M1-B completion claim is permitted.

## Historical provider decision

`deploy/closed-pilot/provider-selection.pending.json` remains immutable
historical evidence for the earlier GCP/Cloud Run proposal. It is superseded
only for the M1-B deployment work package and must not be rewritten as if its
original observation had approved provisioning.

## Prohibited escalation

- RC branch or tag;
- release or production financial claim;
- paid Neon plan or Vercel add-on without Founder approval;
- fee runtime;
- signer, transfer, withdrawal, custody, or venue write;
- Human production lending or real funds;
- new chain, credit model, Capital Partner expansion, UI redesign, marketing,
  broad refactor, or dependency major upgrade.
