# M3-L2-001 — Metered Resource Public Beta productization

Status: `IN PROGRESS — ONE BRANCH / ONE PR`

Date: 2026-09-03

Baseline: `6b18501b564664167b67bb1489c2678f46c494df`

Requirements: `REQ-EXEC-002`, `REQ-EXEC-005`, `REQ-CREDIT-005..009`,
`REQ-PAY-001..002`, `REQ-EVID-001..002`, `REQ-UX-002`, `REQ-UX-005`,
`REQ-PRIV-001`, `REQ-AUTO-001`

## Authority and provenance

The Founder ratified the prior M3-000 L0 scope without rewriting its historical
authorization state, and separately authorized the exact synthetic Metered
Resource profile for `L2_PUBLIC_AUTHENTICATED_NO_FUNDS`. This task is the one
issue-sized Constitution, launch-policy, productization, deployment and
acceptance unit authorized by that directive.

## Scope

- supersede Product Constitution v1.5 with the minimal v1.6 L2 amendment;
- activate one canonical launch-policy capability only for
  `public_authenticated_no_funds_beta`;
- reuse the `0073_metered_usage_evidence` schema and advance the migration head
  only through `0075_metered_usage_system_worker_capability`: `0074` repairs
  least-privilege runtime table access and `0075` reconciles the one already
  authorized admission capability into pre-M3 System Worker memberships;
- load one fresh hosted Ed25519 synthetic Provider signing identity from an
  immutable-version-bound Vercel secret;
- expose one sender-constrained Agent resource-consumption endpoint for the
  exact `provider_gateway_compute` / `inference_tokens` / `token` profile;
- preserve System Worker-only admission through a non-exportable in-process
  credential boundary;
- show Provider, resource, cap, consumed amount, remaining capacity,
  Obligation, repayment and finalized/reconciled Evidence in the normal
  Principal product journey; and
- deploy the exact merged SHA and complete hosted visible product acceptance.

## Non-goals

No external Provider or credential, second Provider/resource/unit, Task
orchestration system, additional Ledger or Obligation, production pricing or
risk-policy change, real funds, mainnet, custody, withdrawal, venue write,
Phase 4, or `M3-RESOURCE-003` is authorized.

## Likely files

- `docs/PRODUCT_CONSTITUTION.md`, `AGENTS.md`, this task and its final Evidence;
- `deploy/launch-policy.v1.json` and its release-governance contracts;
- `apps/private-pilot/src/production-*`, the synthetic Provider adapter and
  Golden Flow Agent;
- `apps/tenant-api/src/production-tenant-host.js` and OpenAPI;
- `packages/sdk/src/production-agent-client.js`;
- `apps/web/src/`; and
- focused tests and production runbooks only.

## Acceptance criteria

1. Exact public Beta policy enables the synthetic Metered Resource while every
   other profile and every external/real-value capability remains false.
2. Agent DPoP authentication and owned-Obligation authorization precede use;
   Human, cross-user, cross-Tenant, stale, invalid-signature, over-cap and
   conflicting-replay requests fail closed.
3. A fresh hosted Provider key signs finalized/reconciled Evidence and never
   appears in source, logs, response payloads or client authority.
4. One Agent flow completes Obligation, resource use, deterministic charge,
   double-entry Ledger, repayment and Principal/Agent-identical Evidence with
   no database intervention.
5. Duplicate exact requests replay one receipt and create no second charge.
6. Refresh/relogin/recovery, worker/reconciliation, restore and rollback remain
   operational against migration head
   `0075_metered_usage_system_worker_capability`.
7. CI is green, the exact merged SHA is deployed to `https://ipo.one`, and the
   normal visible Principal journey is verified in a real browser.

## Test commands

```text
pnpm run check:launch-policy
pnpm run check:agent-https-transport
node --test apps/private-pilot/test/local-synthetic-metered-provider.test.js
node --test apps/private-pilot/test/hosted-synthetic-metered-provider.test.js
node --test packages/sdk/test/production-agent-client.test.js
pnpm check
git diff --check
```

## Security and permission checklist

- [ ] immutable Vercel secret reference matches exact Provider key bytes;
- [ ] Provider signature, policy, price schedule and caps remain server-owned;
- [ ] System Worker admission cannot be authenticated from the public edge;
- [ ] object authorization is non-enumerating and Tenant-bound;
- [ ] exact idempotency/replay and UNKNOWN-outcome behavior is preserved;
- [ ] no PII, task content, prompt/output, raw signature or private key is
  stored in Metered Usage Evidence;
- [ ] real funds, external Provider, mainnet, custody and withdrawal remain
  disabled; and
- [ ] zero scoped P0/P1 remains at release.

## Migration and rollback

Migration head is `0075_metered_usage_system_worker_capability`: `0073` owns
the immutable Metered Usage schema, `0074` grants only the existing Gateway
runtime role the exact reads, inserts and column-bounded upserts needed by the
hosted synthetic path, and `0075` version-reconciles
`worker.metered_usage.admit` only into active `system_worker` memberships that
lack it. Apply the migrations through the existing production Neon migration
path and verify exact checksums. Rollback
reverts the Vercel deployment and disables the canonical capability in the
prior release. Immutable Evidence and balanced Ledger history remain readable;
the hosted Provider key is retired from the production environment after
rollback. No destructive data rollback is permitted.

## Completion Evidence

Record the 22 Founder-required final items: baseline, branch, PR, merged SHA,
CI, migration, launch policy, Provider key ID and secret reference (never key
material), deployment URL/SHA, Human and Agent journeys, Provider admission,
Evidence, Ledger/repayment, replay/recovery, authorization denials, abuse
controls, reconciliation/restore/rollback/observability, remaining risks,
scoped P0/P1 count, external Provider decision package and exact STOP boundary.

Final verdict must be either `PASS — DEPLOYED AND USER-VERIFIED` or
`BLOCKED — NOT COMPLETE`.
