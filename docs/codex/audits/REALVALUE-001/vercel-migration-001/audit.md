# VERCEL-MIGRATION-001 audit

Status: `READY_FOR_NO_REAL_FUNDS_INTERNAL_TESTING`  
Completed: `2026-07-27`  
Owner: `IPO.ONE Founder`

## Outcome

The current public, synthetic, no-real-funds IPO.ONE product surface is
available at:

- stable URL: `https://ipo-one-internal.vercel.app`
- Vercel project: `ipo-one-internal`
- project ID: `prj_KLyAPHnFCtQAxIbUjdJa012gAq7Y`
- team ID: `team_f6TQU7mloG5OnQGNmtXwFkOi`
- production deployment ID: `dpl_5GkjnPJrJ2YLUqqv9nJNaYz6KpNH`
- deployment state: `READY`
- runtime region: `iad1`

The production `ipo.one` domain was not attached. The prior GCP address was
released during offboarding, so any external DNS record still pointing to
`136.68.214.66` is stale and must not be used as a rollback address.

## Published boundary

This target intentionally publishes the complete current public sandbox UI and
its no-real-funds API only. It does not enable:

- the PostgreSQL-backed closed-pilot runtime;
- durable private Tenant data or production identity;
- real credit or real-value settlement;
- mainnet execution;
- Hyperliquid Exchange writes or an API Wallet;
- withdrawals, external transfers, or production funds movement.

Public sandbox sessions are bounded and process-local. Vercel may replace a
Function instance, so testers must treat session state as ephemeral and must
not enter private or irreplaceable information.

## Verification

Repository checks after the Vercel runtime changes:

- full repository test suite: `545/545 PASS`;
- security test suite: `33/33 PASS`;
- JavaScript/runtime configuration tests include exact Vercel hostname
  validation and malicious-host rejection;
- `git diff --check`: `PASS`;
- deployment build: `READY`.

Production HTTP and browser checks:

- `/`, `/livez`, `/readyz`, `/.well-known/ipo-one.json`, `/openapi.json`, and
  `/auth/v1/options`: `200`;
- discovery reports `serviceClass=public_sandbox`;
- authentication discovery truthfully reports `enabled=false`;
- browser console: zero errors and zero warnings;
- all 14 primary product destinations rendered and navigated;
- all eight Trading Capital views rendered and selected;
- production runtime error scan over the validation window: zero errors;
- runtime status counts: 48 responses with `200`, one with `204`, and one
  non-functional `/favicon.png` request with `404`.

The live synthetic lifecycle E2E completed on the production deployment:

- Subject created;
- Mandate active;
- spend request settled on the sandbox rail;
- Obligation fully repaid;
- outstanding and utilization returned to zero;
- settlement finalized;
- Evidence replayable;
- ledger balanced with two transactions;
- 37 Evidence envelopes and 33 timeline events;
- `productionFundsMoved=false`.

Screenshots:

- `screenshots/vercel-production-trading-capital-proof.png`
- `screenshots/vercel-preview-trading-capital-proof.png`

## Superseded deployment attempts

Three earlier preview builds failed while the minimal Vercel bundle and runtime
configuration were being validated. They never served production traffic and
are superseded by the successful preview
`dpl_Gq18CMPfRW7u9XTKxQ44SDWgThzp` and production deployment
`dpl_5GkjnPJrJ2YLUqqv9nJNaYz6KpNH`.

## Recovery and next gate

The GCP resource inventory, retained backup, and offboarding evidence are in
`../gcp-offboarding-001/inventory.md`.

Restoring the former GCP shape requires a reviewed action to restart Cloud SQL,
recreate Cloud Run and global edge resources from the retained templates, and
assign and publish a new address. The released address cannot be assumed to
return.

A durable authenticated internal pilot on Vercel requires a separately
reviewed Vercel-compatible PostgreSQL service, production secrets, migrations,
and private-access verification. That work is not implied by this public
sandbox migration and remains locked behind its own production-dependency and
deployment review.
