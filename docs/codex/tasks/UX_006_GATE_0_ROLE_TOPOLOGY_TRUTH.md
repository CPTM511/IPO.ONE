# UX-006 Gate 0.1: Role topology truth

Status: Complete locally

Date: 2026-08-12

Baseline commit: `65f999c0882ebd16486324509e0eb342a116cb19`

Branch: `codex/m1-b-deployable-sandbox`

## Context and current baseline

UX006-P0-001 proves that the production Primary origin advertises role
destinations that its deployed topology cannot serve. The Vercel architecture
binds Primary to Principal/Agent and the separate Risk project to Risk/Admin;
the Capital Partner production browser workspace is deferred. Production
currently renders an empty `ipo-one-workspace-name` value even though
`deploymentRole` is already validated as `primary` or `risk`.

The deployed backend release is `d36ff20c...`, an ancestor of this baseline;
their product web assets are byte-identical and the intervening change is
documentation-only. Deployment remains outside this issue.

The result is a role-ambiguous public shell: users can discover Capital Partner
and Risk destinations on the Primary origin, but those destinations cannot
recover the corresponding authenticated workspace.

This is an L0/L2 no-funds presentation and recovery repair. It does not activate
Capital Partner hosting or any higher delivery mode.

## Scope

- Derive one exact web workspace name from the already validated production
  deployment role:
  - `primary -> controller`
  - `risk -> risk`
- Pass that exact value through the production runtime and Host into the
  existing safe HTML meta injection boundary.
- Add a focused, pure browser topology policy that determines which protected
  destinations are visible on `borrower`, `controller`, `risk`, and
  `capitalPartner` workspaces.
- Hide deferred or cross-role protected entry controls without deleting the
  underlying local product implementation.
- Canonicalize an unavailable or invalid initial/hash destination to the safe
  default for that workspace.
- Preserve all four durable local workspaces and their existing permissions.

## Non-goals

- No new Capital Partner production origin, identity, invitation, or hosting.
- No authentication, authorization, capability, role, or permission expansion.
- No deployment, alias, environment-variable, database, migration, or bootstrap
  mutation.
- No change to credit policy, pricing, risk limits, Offer semantics, funds,
  custody, withdrawal, signer, transaction, chain, or external Provider.
- No complete navigation redesign; the four-destination role IA remains Gate 1.
- No edits to the user's existing modified Capital Network or Risk browser-host
  fixtures.

## Likely files

- `apps/private-pilot/src/production-environment.js`
- `apps/private-pilot/src/production-runtime.js`
- `apps/private-pilot/test/production-workspace.test.js`
- `apps/tenant-api/src/production-tenant-host.js`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/web/src/workspace-surface-access.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/test/workspace-surface-access.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/tenant-api/test/production-tenant-host.test.mjs`
- `apps/private-pilot/test/vercel-sandbox-serverless.test.js`
- `docs/codex/audits/UX-006/README.md`

## Acceptance criteria

### Production topology

- Given a validated Primary production configuration, when `/` is served, then
  the web shell contains exactly one workspace meta value of `controller`.
- Given a validated Risk production configuration, when `/` is served, then the
  web shell contains exactly one workspace meta value of `risk`.
- Given an unknown deployment role or workspace value, configuration or asset
  injection fails closed.

### Product visibility

- Given `controller`, protected Capital Partner and Risk destinations are not
  visible or keyboard reachable; Principal/Agent destinations remain available.
- Given `risk`, protected borrower, Agent, Capital Partner, trading, Provider,
  and wallet destinations are not visible or keyboard reachable; Risk is the
  safe default destination.
- Given `capitalPartner`, Capital Partner remains available locally and Risk is
  not visible.
- Given `borrower`, Capital Partner and Risk are not visible.
- Given an empty or unknown workspace, no Capital Partner or Risk destination is
  advertised.
- Given a hash for a destination unavailable to the current workspace, boot and
  hash navigation replace it with the workspace's safe canonical destination.
- Hidden destinations remain in the DOM only where existing fixed element
  bindings require them; they cannot be clicked, focused, or reached by hash.

### Regression and usability

- Existing local ports 8787–8790 remain healthy.
- No current role gains a new protocol operation or capability.
- Changed navigation remains keyboard operable, visibly focused, responsive,
  and valid at 200% zoom.
- Current browser evidence shows Primary/controller without Capital Partner or
  Risk, Risk with its exact workspace, and local Capital Partner still usable.

## Test commands

```sh
node --test apps/web/test/workspace-surface-access.test.js \
  apps/web/test/principal-workspace-access.test.js \
  apps/web/test/static-ui.test.js
node --test apps/tenant-api/test/production-tenant-host.test.mjs \
  apps/private-pilot/test/production-workspace.test.js \
  apps/private-pilot/test/production-environment.test.js \
  apps/private-pilot/test/vercel-sandbox-serverless.test.js
pnpm run test:transport
pnpm run check:web-bundle
pnpm test
pnpm run lint
pnpm run typecheck
pnpm run local:acceptance
git diff --check
```

## Security checklist

- [x] Workspace name is derived only from validated server deployment role.
- [x] Browser topology affects presentation only and never grants authority.
- [x] Protected reads and commands still re-run authenticated Gateway policy.
- [x] Unknown and cross-role destinations fail closed.
- [x] No raw identity, credential, signature, PII, or private resource is added.
- [x] No real funds, transfer, withdrawal, signer, or external execution is
      enabled.

## Permission boundary

Implementation is authorized only for local code, tests, and synthetic/no-funds
browser verification. Production deployment, aliasing, environment changes,
identity provisioning, and role activation require separate human review.

## Data and migration impact

None. No database schema, seed, credential, session, or domain data changes.

## Rollback plan

Revert only the bounded topology module, production workspace-name plumbing,
and related tests/copy. No data rollback is required. A future separately
approved deployment may roll back by promoting the previously recorded exact
deployment.

## Required Evidence

- Failing-before and passing-after focused tests.
- Exact production Host HTML meta assertions for Primary and Risk.
- Current desktop, keyboard, mobile, and 200% zoom browser observations.
- Local 8787–8790 acceptance.
- Exact diff, test output, and clickable local product URLs.

## Dependencies and sequencing

- This is Gate 0.1 and must close before UX-006 Gate 0.2 is implemented.
- Do not modify the pre-existing user changes in
  `capital-network-browser-host.mjs` or `risk-operations-browser-host.mjs`.
- Full signed-out and authenticated navigation simplification remains Gate 1.

## Completion Evidence

- Exact production workspace mapping and Host injection tests pass for
  `primary -> controller`, `risk -> risk`, and invalid-value fail-closed.
- Workspace visibility and canonical routing matrix passes for controller,
  borrower, risk, Capital Partner, empty and unknown workspaces.
- Fresh-browser four-workspace matrix passed on ports 8787–8790: protected
  cross-role deep links canonicalized, hidden entries were not keyboard
  reachable, mobile width 390 and 200%-equivalent narrow width had no overflow,
  skip-link focus worked, and all consoles reported zero errors/warnings.
- Browser evidence: `output/playwright/ux-006-gate0-1/`.
- Aggregate repository regression, Transport, web bundle, lint, typecheck and
  `git diff --check` pass. Current isolated review URLs remain available below.
- No production deployment, permission, role activation, database or funds
  change was made.
- At the original Gate 0 checkpoint, standard persistent compose acceptance was
  blocked because the recorded migration `0054` checksum predated a
  terminal-blank-line cleanup. Later compatibility review proved the SQL bodies
  byte-identical apart from that terminal whitespace and added one exact,
  fail-closed compatibility edge. The migration table was not rewritten and
  the persistent volume was not reset.
- The current standard local no-funds stack passes `pnpm run local:acceptance`:
  PostgreSQL 17 applies all 61 migrations, all four wallet-gated role
  workspaces respond, durable Agent proof, forced RLS, Worker heartbeat and
  reconciliation pass, and the pending outbox is empty. This supersedes only
  the historical local-compose blocker; it is not deployment, production or
  real-funds evidence.

Founder-review URLs (current standard local no-funds runtime):

- Human Borrower: `http://127.0.0.1:8787/#request-credit`
- Principal / Agent: `http://127.0.0.1:8788/#agent-console`
- Risk Operations: `http://127.0.0.1:8789/#risk-operations`
- Capital Partner: `http://127.0.0.1:8790/#capital-partners`
