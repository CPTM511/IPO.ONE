# PROD-CUTOVER-002 — Formal Domain and Zero-Funded Real-Value Support

Status: `COMPLETE`

Owner: IPO.ONE Founder / Release Owner

Date opened: 2026-08-12

## Context

The Founder authorized continued production rollout on the formal GoDaddy
domain `ipo.one`, Provider integration support and real-value-capable product
support while allowing the initial balance to remain zero. This authorization
does not supply or invent a production chain, asset, capital source, custodian,
signer, Provider contract, numerical limits or loss bearer, and therefore does
not authorize a value-moving transaction.

The promoted Vercel candidate was healthy at the Cron/database boundary and
kept `realFundsEnabled:false`. Before this issue, its runtime required
`IPO_ONE_PUBLIC_ORIGIN` to equal Vercel's generated project URL, so a DNS
cutover without a reviewed custom-origin exception would have failed closed at
the Host boundary. This issue added and verified that exact exception for the
Primary project only.

## Scope

1. Add an exact, Primary-only custom-domain configuration for `https://ipo.one`.
2. Keep the Risk project restricted to its generated Vercel production URL.
3. Publish a machine-readable deployment capability document that distinguishes
   real-value support from real-funds activation.
4. Report Provider/Venue states independently without a false `AVAILABLE`
   claim.
5. Build, test and deploy one exact clean Primary/Risk release.
6. Bind `ipo.one` and `www.ipo.one` in Vercel and apply the exact live Vercel
   DNS recommendation: root A records `216.150.1.1` and `216.150.16.1` while
   preserving the existing `www -> ipo.one` CNAME after Vercel verified that
   equivalent chain as configured correctly. Preserve NS, MX, TXT and unrelated
   records.
7. Verify HTTPS, health, release identity, database readiness, reconciliation,
   Primary/Risk parity, rollback and `realFundsEnabled:false`.

## Non-goals

- No real Human cash loan, public LP/vault, token/DAO or arbitrary withdrawal.
- No production funds transfer, Provider/Venue write, signer activation or
  capital commitment.
- No fabricated Provider credentials, production account, chain, asset,
  custody model, numerical cap or legal/risk approval.
- No mutation of historical release seals.
- No reuse or reset of unrelated dirty working-copy changes.

## Likely files

- `apps/private-pilot/src/production-environment.js`
- `apps/private-pilot/test/vercel-sandbox-serverless.test.js`
- `apps/tenant-api/src/production-tenant-host.js`
- `apps/tenant-api/test/production-tenant-host.test.mjs`
- `deploy/vercel/m1-b-sandbox.manifest.v1.json`
- `docs/codex/tasks/PROD_CUTOVER_002_FORMAL_DOMAIN_AND_ZERO_FUNDED_REAL_VALUE_SUPPORT.md`
- `docs/codex/audits/PROD-CUTOVER-002/`

## Acceptance criteria

1. The Primary project accepts `https://ipo.one` only when the exact custom
   domain and Founder acknowledgement are configured; all other custom origins
   fail closed.
2. The Risk project rejects custom-domain configuration and remains bound to
   its generated Vercel production URL.
3. `GET /.well-known/ipo-one.json` reports the deployed release and formal
   interfaces, `supportStatus: SUPPORTED_INACTIVE_ZERO_FUNDED`, and
   `realFundsEnabled:false`.
4. External Provider execution and Venue write authority remain disabled; a
   missing production Provider is `BLOCKED_EXTERNAL_DEPENDENCY` or `DISABLED`
   without taking healthy product surfaces down.
5. The exact clean release passes focused environment, transport, serverless,
   deployment and security checks before promotion.
6. Public DNS resolves `ipo.one` to the Vercel-required target while existing
   mail and nameserver records remain unchanged.
7. Public HTTPS health, discovery and product routes return the exact release;
   Primary and Risk read the same migration head and canonical database.
8. Rollback targets and the pre-cutover DNS value are recorded and remain
   actionable.

## Test commands

```sh
node --test apps/private-pilot/test/vercel-sandbox-serverless.test.js
node --test apps/tenant-api/test/production-tenant-host.test.mjs
pnpm run check:deploy
pnpm run test:security
git diff --check
```

Run broader repository and PostgreSQL gates against the exact clean candidate
in proportion to the release change and reuse unchanged PROD-CUTOVER-001
evidence only where source identity remains valid.

## Security checklist

- [x] Host/origin validation remains exact and HTTPS-only.
- [x] Custom-domain acknowledgement is Primary-only and fail closed.
- [x] Risk remains on its separate generated production URL.
- [x] Real funds, signer, fee, withdrawal and Venue-write authority remain off.
- [x] Provider status is independently queryable and never inferred from UI
      availability.
- [x] Secrets, PII, wallet addresses and credentials are absent from repository
      Evidence and logs.
- [x] DNS mutation preserves mail, nameserver and unrelated records.
- [x] Rollback restores both the prior Vercel deployment and the prior root A
      record if post-cutover acceptance fails.

## Permission boundary

The Founder instruction of 2026-08-12 authorizes the exact Vercel custom-domain
and GoDaddy DNS changes in this issue, plus zero-funded real-value capability
support and Provider integration preparation. It does not authorize a real
transaction or permit missing production inputs to be invented. Any later
value-moving action still requires an exact reviewed production profile and a
transaction-specific confirmation with target, network, asset, amount, cap,
fee, signer and recovery consequence.

## Data and migration impact

No schema migration is planned. Neon remains at the already verified migration
head. The change is limited to origin validation, public deployment discovery,
release metadata and external routing.

## Rollback plan

- Promote the previous verified Vercel deployment for the affected project.
- Restore the Primary public origin to the generated Vercel project URL.
- Restore the GoDaddy root A record to the recorded pre-cutover value
  `136.68.214.66` and remove the second root A record added for Vercel.
- Restore `www` to the preserved pre-cutover CNAME `ipo.one.` if it is changed
  by any later operation.
- Keep external Provider execution and all real-funds authority disabled.
- Pause new exposure and reconcile without blind retry if any outcome is
  unknown.

## Required Evidence

- exact source commit, tree and deployment IDs;
- focused test and build outputs;
- Vercel domain, alias and environment-key state without secret values;
- GoDaddy before/after record snapshot;
- public DNS, TLS, health, discovery and product responses;
- Primary/Risk deployment and migration parity;
- Provider/Venue status matrix;
- rollback deployment IDs and prior DNS value;
- explicit proof that no production funds moved.

## Completion Evidence

Completed on 2026-08-12. The detailed record is
[`docs/codex/audits/PROD-CUTOVER-002/audit.md`](../audits/PROD-CUTOVER-002/audit.md).

- Exact source: commit `d36ff20c2049b199ed3032e85752f36e36300312`,
  tree `9a47dbb359f0124131f907d2786ece34549cd84f`.
- Primary: `dpl_2JBesAqB2MXZZBCEDypMq5Gzm7Ue`, Ready and promoted at
  `ipo.one` and `ipo-one-internal.vercel.app`.
- Risk: `dpl_62VpuVX2GRd2uMxpfYXZ7EYxKY7p`, Ready and promoted at the
  separate internal Risk alias.
- GoDaddy authoritative DNS returns both `216.150.1.1` and `216.150.16.1` for
  the apex. Vercel reports both `ipo.one` and `www.ipo.one` configured correctly.
- Vercel certificate `cert_kIsDJy71Q78FCMG88nTi6zS3` covers both names and has
  automatic renewal enabled.
- Public `livez`, `readyz`, discovery, product and OpenAPI routes return 200;
  `www` returns 308 to `https://ipo.one/`.
- Discovery reports `SUPPORTED_INACTIVE_ZERO_FUNDED`,
  `activationStatus: DISABLED`, `realFundsEnabled:false` and
  `productionFundsMoved:false`.
- A production Cron run completed with reconciliation passed and
  `realFundsEnabled:false`. No production funds moved.
