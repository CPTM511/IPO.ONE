# PUBLIC-BETA-001C production Evidence closure

Date: 2026-08-31

Verdict: `PASS — DEPLOYED AND USER-VERIFIED`

L2 delivery gate: `COMPLETE — PUBLIC BETA ACTIVE`

## Exact release truth

- Main and deployed release:
  `c4cc81f09f1c7aeb78871373d29ed581e428daca`.
- Vercel production deployment:
  `dpl_XF9tYaYWe8qBuiXrQkWGrV4yChGt`, state `Ready`, serving
  `https://ipo.one`.
- Final Quality Gate:
  `https://github.com/CPTM511/IPO.ONE/actions/runs/33375795085`, success.
- Public-Beta activation and hosted recovery Quality Gates:
  `33312950818` and `33352962070`, both success.
- `/tenant/v1/healthz` reports `ready`, release `c4cc81f...`, role `primary`,
  `public_authenticated_no_funds_beta`, authentication `single_v2`, and
  `realFundsEnabled=false`.
- `/.well-known/ipo-one.json` truthfully reports hosted production with real
  value, funds, signer, withdrawal, Venue writes and chain Evidence disabled.

## Product acceptance bound to the release

The already-completed production visible-click acceptance proved actual SIWE
self-service authentication, Offer acceptance, Obligation creation, `$120.00`
synthetic execution, `$120.00` full repayment, `Fully Repaid`, `$0.00`
outstanding, nine finalized Evidence events, refresh recovery and relogin from
durable server truth. It moved no real funds and made no chain or Venue write.

Principal/Agent access remains an authorized parallel entry over the shared
kernel. The current `PHASE3-POOL-001` acceptance remains read-only: subsequent
changes did not enable Pool economic writes or change the Pool read model.
Cross-user/cross-Tenant denial, privileged-role denial, SIWE replay denial and
durable abuse controls remain bound by the green activation, repair and final
Quality Gates; no scoped P0/P1 is open.

## Migration and current restore proof

Production Neon PostgreSQL 17 was queried read-only. The direct snapshot is:

- 72 recorded migrations;
- head `0072_public_beta_self_service_identity`;
- migration digest
  `8c43be9dda92baa491b0904b9849d36e7c6683b87d019be0afc7aba084ee6808`;
- 158 public relations, 155 with RLS and FORCE RLS;
- 164 public policies; and
- schema-object digest
  `11025810ae49e53749aa70d14fe5c91a835654c949c4e4302bf3fba2fe9fda55`.

Because the prior documents still marked restore as pending, one minimal new
verification was required. A temporary expiring Neon branch was created from
production with a read-only compute. Its migration, relation, RLS, policy and
schema snapshot matched production exactly. The exact temporary branch was
deleted immediately after comparison; a final branch inventory contains only
`main`.

## Reconciliation, observability and rollback

The bounded current production log sample contained 50 release-bound entries,
reported reconciliation passed and contained no observed 5xx. Runtime and edge
health are therefore current for the closure window; this is a bounded sample,
not a claim that future incidents are impossible.

Rollback is prepared, not performed. The prior production deployment
`dpl_6Y47KqGKzNN1sR3vjr4Dfgwod2XB` remains a known Ready release at
`aab982eb32792c072e0250eb886210e339cf6c90`, with reconciliation passed and no
server error in its bound log sample. Current production was healthy, so an
unnecessary rollback was not executed.

## Truth boundary

This closure does not authorize a signer, Venue mutation, transfer, withdrawal,
mainnet, real funds, `HL-TESTNET-001B`, `RISK-003B` or M3. Public Beta remains
live while the separately gated Phase 3 sequence proceeds.

Product: `https://ipo.one/#request-credit`.
