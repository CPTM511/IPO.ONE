# UX-004: Manual-to-product operability contract audit

Status: Completed on 2026-07-31

## Context

The Human/Agent user manual describes a clickable local no-funds lifecycle, but
manual copy can drift from the current browser, role, prerequisite, API stage,
or server-derived state. Repeated point fixes are insufficient if the manual
and product are not checked as one executable contract.

This task treats every primary manual action as a product acceptance
requirement. A documented action is not complete merely because a backend
operation or static button exists; the correct authenticated role must be able
to reach it, enable it after stated prerequisites, complete it, and see a
durable next state.

## Scope

- Build a bounded manual-to-UI action inventory for Human credit, Agent credit,
  Obligations, repayment, Evidence, Credit Passport, and Credit Track Record.
- Run current authenticated browser journeys from clean fixture state.
- Confirm page/workspace, button label, prerequisite, completion state, and
  recovery behavior for every primary action.
- Fix confirmed product defects or stale manual instructions.
- Add automated contract coverage so documented primary actions cannot silently
  disappear or change labels without a failing test.
- Preserve the unsealed UX-003 work already present in the worktree.

## Non-goals

- No production deployment, mainnet, real funds, custody, KYC vendor, external
  credential, new signer, contract deployment, or Testnet transaction.
- No new credit policy, score, limit, pricing, Capital Partner authority, or
  Trading Capital economic behavior.
- No duplicate Human/Agent kernel or alternate repayment/Evidence model.
- No assertion that an object hash or Evidence digest is a chain transaction.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/*browser-host.mjs`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md`
- `docs/codex/audits/UX-004/`

## Acceptance criteria

1. Every documented primary Human and Agent action maps to one current UI
   control and one server-derived success state.
2. Every documented page and workspace is reachable from the stated role.
3. Disabled actions explain their exact prerequisite and become enabled when
   that prerequisite is satisfied.
4. Human application, evaluation, Offer acceptance, Obligation creation,
   execution, early repayment, and Evidence read are browser-operable.
5. Agent application, Principal activation, Obligation creation, approved use,
   repayment, and Evidence read are browser-operable without a mandatory
   download or browser-held Agent credential.
6. Credit Passport and Credit Track Record expose visible load/recovery actions
   and do not manufacture missing Decision or Evidence state.
7. Automated tests fail when a documented action ID, label, view, or key safety
   statement drifts.
8. The manual names only currently verified labels and clearly separates local
   server hashes from verified Testnet transactions.

## Test commands

```bash
node --test apps/web/test/*.test.js
node --test apps/private-pilot/test/local-reference-agent-http.test.js
pnpm test
pnpm run local:agent:acceptance
pnpm run local:status
git diff --check
```

The sealed `LOCAL-RC-002` manifest remains unchanged. This task is part of the
same unsealed successor as UX-003.

## Security checklist

- [x] Raw KYC/PII remains absent from the browser and manual examples.
- [x] Agent credentials, private keys, and raw signatures remain server-side.
- [x] Human and Agent continue to use one shared Obligation kernel.
- [x] Agent use remains purpose-bound and non-withdrawable.
- [x] Exact Offer/Mandate acknowledgement and account confirmation remain.
- [x] Mutations remain authenticated, capability-bound, and idempotent.
- [x] No chain, finality, deployment, or real-funds claim is expanded.

## Completion evidence

- Browser Human path: $120.00 Offer → Obligation → execution → full early
  repayment → $0.00 outstanding → 3 Evidence events.
- Browser Agent path: $100.00 Offer → exact Mandate activation → Obligation →
  approved use → repayment → verified Evidence → owned position.
- Web suite: 108/108 passed.
- Repository suite: 680/680 passed.
- Reference Agent acceptance: passed with 11 Evidence events and no production
  funds moved.
- Local PostgreSQL, pilot, worker, and loopback forwarding: healthy.
- Audit: `docs/codex/audits/UX-004/README.md`.
