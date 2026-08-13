# IPO.ONE Vercel deployment surfaces

## Canonical M1-B no-funds product

The root `vercel.json` and the reviewed M1-B bundle configurations select
`api/vercel-sandbox.mjs` and `api/vercel-sandbox-cron.mjs`. Those entry points
compose the Tenant Protocol and Tenant Command Gateway over the shared Human
and Agent obligation kernel, with PostgreSQL as canonical state. Exact release
bundles are built with `scripts/build-vercel-sandbox-bundle.mjs`; their source
commit and every output artifact are recorded in the generated deployment
artifact manifest.

This hosted profile remains synthetic and no-funds. It does not enable real
credit, mainnet funds, protocol fees, signer authority, withdrawals, or venue
writes. Secrets and deployment environment values belong in the reviewed
Vercel project configuration, never in a tracked Vercel file.

## Legacy demonstration compatibility

`api/index.mjs`, `deploy/vercel/vercel.bundle.json`, and
`deploy/vercel/package.bundle.json` are preserved only for the older public
demonstration and historical security tests. That surface keeps bounded
process-local sessions, does not publish the PostgreSQL closed pilot, and is
explicitly non-authoritative and non-release-eligible. It must not be used for
an M1-B release or attached to the canonical product domain.
