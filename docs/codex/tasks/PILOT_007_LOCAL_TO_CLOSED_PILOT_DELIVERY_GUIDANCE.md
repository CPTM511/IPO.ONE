# PILOT-007 — Local-to-Closed-Pilot Delivery Guidance

Status: Guidance implemented; no runtime or launch authority

## Context

IPO.ONE has a broad local no-real-funds Human/Agent lifecycle and a public
process-local sandbox. The Founder approved a cost-controlled delivery direction:
run and verify the complete system locally, then publish an invited durable
no-real-funds pilot, then prove restricted Hyperliquid Testnet execution, and
only later consider controlled real value.

The direction needs one versioned source so that local success, Vercel
publication, invited use, live testnet writes, and real funds cannot be
accidentally treated as the same launch gate.

## Scope

- add a non-canonical delivery guide subordinate to the Product Charter, MVP
  Build Spec, and launch policy;
- define L0 local, L1 hosted closed pilot, L2 live testnet, and L3 controlled
  real-value stages;
- define the minimum Vercel, durable PostgreSQL, protected worker, Human
  authentication, and Agent access boundaries;
- define cost-control principles, stage exits, operational evidence, and
  anti-patterns;
- preserve deterministic credit authority and shadow-only learning before
  separately approved promotion; and
- add the guide to the repository guidance index.

## Non-goals

- no application, API, database, migration, contract, or deployment change;
- no cloud or infrastructure vendor selection;
- no remote participant access or production credential issuance;
- no testnet signer or external venue write;
- no numeric production risk policy;
- no KYC, PII, capital, custody, lending, withdrawal, or real funds;
- no approval of the proposed follow-on engineering issues; and
- no change to the canonical Product Charter or launch policy.

## Likely files

- `docs/guidance/IPO_ONE_LOCAL_TO_CLOSED_PILOT_DELIVERY_GUIDE_v0.1_DRAFT.md`
- `docs/codex/tasks/PILOT_007_LOCAL_TO_CLOSED_PILOT_DELIVERY_GUIDANCE.md`
- `AGENTS.md`

## Acceptance criteria

- the guide clearly separates local, hosted no-funds, live testnet, and
  real-value authority;
- Vercel is not described as durable product truth or a signer;
- the hosted pilot requires durable PostgreSQL, separate Human/Agent
  authentication, operations, backup/restore, reconciliation, and rollback;
- Agents are external product users through versioned interfaces, not
  IPO.ONE-deployed customer Agents;
- the credit-learning loop remains shadow-only and cannot loosen policy;
- real Human cash lending, public LP/vaults, arbitrary withdrawal, and real
  funds remain excluded;
- the guide declares every permission-expanding step as separately reviewed;
- existing working-tree product changes are not modified; and
- all affected Markdown links and repository boundary checks pass.

## Test command

```sh
rg -n "IPO_ONE_LOCAL_TO_CLOSED_PILOT_DELIVERY_GUIDE" AGENTS.md \
  docs/guidance/IPO_ONE_LOCAL_TO_CLOSED_PILOT_DELIVERY_GUIDE_v0.1_DRAFT.md
pnpm run lint:boundaries
git diff --check
```

## Security checklist

- [x] No secret, token, key, endpoint credential, or raw PII is documented.
- [x] No remote access, signer, deployment, contract, or funds authority is
  granted.
- [x] Human and Agent identities remain distinct and Tenant-scoped.
- [x] Durable truth, replay protection, idempotency, reconciliation, backup,
  pause, and rollback remain mandatory.
- [x] Testnet and synthetic value cannot be represented as real credit.
- [x] Learning cannot directly modify active risk or execution authority.
- [x] Existing unrelated working-tree changes are preserved.
