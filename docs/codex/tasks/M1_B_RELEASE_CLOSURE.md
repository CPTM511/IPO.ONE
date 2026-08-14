# M1-B — Release Closure

## Status

- Status: In progress
- Founder order date: 2026-08-13
- Baseline branch: `codex/m1-b-deployable-sandbox`
- Baseline commit: `ae6a0571d9052028b2043437938ca37d15b96f6b`
- Product phase and delivery level: M1-B / L1 durable public no-funds sandbox

## Context

The Founder ordered M1-B to converge on one canonical runtime, restart-safe
Human and Agent core journeys, exact-green release gates, and exact-commit
deployment Evidence. The pre-launch audit remains backlog context; it does not
authorize feature expansion.

The Product Constitution v1.1 is the highest product-truth authority. The
Product Engineering and Experience Standard v1.0 governs implementation and
acceptance. This issue supersedes the obsolete use of the M1-A.1 dirty-worktree
snapshot as a current-stage gate without rewriting that historical Evidence.
The Founder release-closure amendment dated 2026-08-14 further defines current
P0-5 acceptance: Human, Principal/Agent, and Capital Partner remain positive
M1-B journeys, while the full privileged Risk/Operations journey is deferred
to `M1_C_L2_CLOSED_NO_FUNDS`. M1-B retains a mandatory exact-candidate Risk
security boundary proving exhaustive SIWE-only failure at the unchanged recent
phishing-resistant MFA policy, with no mutation, fallback, or hosted Risk
surface. This overlay does not rewrite the historical Gate Profile or Evidence.

## Scope

- Restore Human Offer continuation from authenticated PostgreSQL server truth
  for deterministic v1 and Capital Partner-authored replacement v2 Offers.
- Align the core Agent MCP execution tool with the durable Provider-scoped
  Gateway contract and prove it against PostgreSQL rather than mocks.
- Make the PostgreSQL-backed Tenant lifecycle the one canonical product truth
  for Human Web, Agent MCP, API, and released demo/product surfaces.
- Make root development and Vercel release topology name that canonical runtime
  unambiguously; quarantine any retained in-memory simulator as legacy-only.
- Preserve M1-A.1 historical Evidence while adding an exact-current-stage M1-B
  candidate and checker.
- Resolve CI ignored-build failures with the smallest reviewed dependency build
  allowlist.
- Correct mechanically derivable README contract counts.
- Run exact-commit repository, security, transport, PostgreSQL, browser,
  restart, deployment, and launch-evidence acceptance.
- Commit each bounded P0 separately before the final acceptance commit.

## Non-Goals

- No A2A, subscription, webhook, SSE, WebSocket, or notification architecture.
- No Human revolving CreditLine or new credit product.
- No new scoring, AI risk model, chain, Venue, or broad servicing redesign.
- No mainnet, real funds, real Human lending, production fees, production
  signer, arbitrary withdrawal, or Venue write authority.
- No broad `app.js`, SDK, MCP, or general deduplication refactor.
- No unrelated UI beautification or backlog clearing.
- No opportunistic Consent-withdrawal UI, Human freeze, identity-reference
  revocation, dispute/appeal/correction, servicing-resolution UI, aggregate
  Agent status, or available-credit projection.

## Likely Files

- `apps/web/src/app.js`
- `apps/web/src/*offer*receipt*.js`
- `modules/tenant-command-gateway/src/*credit*handlers.js`
- `modules/tenant-command-gateway/test-postgres/*`
- `apps/agent-mcp/src/agent-mcp-adapter.js`
- `apps/agent-mcp/test/*`
- `packages/sdk/src/*agent*.js`
- `apps/private-pilot/src/*runtime*.js`
- `apps/private-pilot/test*/*`
- `api/vercel-sandbox.mjs`
- `deploy/vercel/*`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `scripts/check-m1-b-*.mjs`
- `deploy/local/m1-b-*.json`
- `README.md`

No neighboring feature may be implemented merely because a touched module
contains a backlog gap.

## Acceptance Criteria

1. A Human can recover the exact current v1 or v2 Offer after reload, fresh
   browser, restart, or re-login and accept it without browser storage becoming
   authority.
2. Expired, replaced, stale, duplicate, unauthorized, cross-Tenant,
   version-drifted, and invalid-binding acceptance fails closed.
3. The advertised core MCP execution tool carries exact Provider scope through
   SDK/client/Gateway and reaches durable execution, Ledger, repayment, and
   Evidence in a PostgreSQL integration test.
4. Wrong Provider/category, stale or revoked Mandate, out-of-scope Facility,
   and invalid replay fail closed.
5. Released Human Web, Agent MCP, API, and demo/product surfaces resolve to the
   canonical deterministic Tenant lifecycle and PostgreSQL truth.
6. Root `pnpm dev`, root Vercel configuration, alternate deployment bundles,
   release identity, and rollback target have one unambiguous meaning.
7. CI permits only the reviewed dependency build scripts required by the
   current lockfile; frozen-lockfile and pnpm supply-chain protections remain.
8. M1-A.1 Evidence remains historically unchanged while current checks bind an
   exact M1-B candidate commit and tree.
9. Applicable repository, security, transport, PostgreSQL, deployment, browser,
   restart, and release gates pass on the exact clean commit.
10. Hosted Evidence, if separately authorized and executable, reports the same
    release SHA and configuration. If external mutation authority is required,
    execution stops with exact requested authority and rollback consequence.
11. Every Risk/Operations policy operation requiring recent phishing-resistant
    MFA rejects an exact-runtime SIWE-only session non-enumeratingly, preserves
    protected state across restart, performs zero privileged mutations, and
    exposes no weak-auth fallback or hosted Risk surface. A successful
    privileged Risk journey is not an M1-B requirement.
12. Funds, signer, withdrawal, Venue-write, production-credit, and real Human
    lending authority remain false.

## Test Commands

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:security
pnpm run test:transport
pnpm run test:postgres
pnpm run local:acceptance
pnpm run local:agent:acceptance
pnpm run local:restart
pnpm run local:acceptance
pnpm run local:agent:acceptance
pnpm run check:vercel-sandbox
pnpm run check:launch-policy
node scripts/check-m1-b-release-closure-founder-overlay.mjs
node scripts/check-m1-b-release-closure-checkpoint.mjs
node scripts/verify-m1-b-acceptance-evidence.mjs --evidence <private-v2-evidence> --evidence-root <repository-root> --expected-sha <exact-green-sha>
# Only after separate deployment authorization and exact hosted Evidence exists:
pnpm run launch:verify -- --evidence <exact-private-deployment-evidence> --profile public_sandbox --expected-sha <exact-green-sha>
```

The P0-5 v2 verifier, current overlay, and checkpoint are the strict
`deployment_pending` closure path. `launch:verify --profile public_sandbox`
requires deployed cloud, protected-environment, and DNS-cutover Evidence; it is
conditional on separate deployment authorization and must not run as an
implied current-closure step. Targeted P0 task documents may add narrower
failing and regression commands.

## Security Checklist

- [ ] Offer recovery derives exact hashes, version and current status from
      authenticated server truth; browser storage grants no authority.
- [ ] Agent execution remains exact-Mandate, Facility, purpose, Provider,
      account-binding and Tenant scoped.
- [ ] Replays are idempotent only at the exact accepted payload and fail closed
      on drift.
- [ ] Human and Agent reuse one Offer, Obligation, Ledger, servicing, Event and
      Evidence kernel.
- [ ] No raw PII, KYC payload, credential, private key, session secret, or raw
      external signature enters Evidence.
- [ ] Dependency build-script permission is a closed reviewed allowlist.
- [ ] Historical release Evidence is not rewritten to impersonate current
      approval.
- [ ] The current v2 Risk boundary is bound to the exact candidate and
      post-restart PostgreSQL start, exhaustively covers the policy-derived
      Risk/Operations recent-MFA operation set, and proves zero privileged
      state change, fallback, or surface exposure.
- [ ] All real-value and production-authority flags remain false.

## Permission Boundary

The Founder order authorizes bounded M1-B source changes, one exact candidate
commit, local exact-candidate acceptance, and correction of release truth. It
does not currently authorize merge, deployment, deployment Evidence collection
that requires an external deployment action, promotion, alias mutation, DNS or
custom-domain mutation, a release tag or seal, mainnet, real funds, a production
signer, arbitrary withdrawals, Venue writes, real Human lending, production
fees, new credentials, or product-scope expansion.

Read-only observation of already-existing historical deployments may be
recorded only as historical context. Any merge, deployment, promotion, hosting,
alias, DNS, custom-domain, tag, seal, credential, or other external mutation
must stop and request separate authority with the exact target, action,
Evidence need, and rollback consequence.

## Data and Migration Impact

No migration is expected. If a migration becomes unavoidable, it must be
additive, Tenant/RLS scoped, paired with rollback, and reviewed before use.
Browser/process-local state cannot replace PostgreSQL truth.

## Rollback Plan

- Revert each bounded P0 commit independently in reverse order.
- Preserve schema/version read compatibility for any data written by the
  candidate.
- Roll hosted runtime back to the exact pre-M1-B deployment SHA/configuration.
- Do not reset, clean, stash, or delete unrelated user work.

## Required Evidence

- Exact baseline, commits, final SHA/tree, tracked-source clean status and
  rollback target; unrelated untracked Founder work remains excluded.
- Failing-before/passing-after tests for Human continuation and Agent MCP
  execution.
- Current-stage M1-B candidate manifest/checker without M1-A.1 mutation.
- Exact aggregate gate counts and PostgreSQL/restart results.
- Desktop/mobile/reload/fresh-session/Back/Forward/re-login browser Evidence.
- Human, Agent, and Capital Partner positive-journey receipts plus the separate
  exhaustive SIWE-only Risk/Operations fail-closed boundary receipt.
- Exact canonical runtime and deployment configuration.
- Hosted SHA/readiness/launch evidence or the exact external authority blocker.
- Explicit unchanged-authority confirmation.

## Dependency and Sequencing Notes

1. P0-1 Human continuation.
2. P0-2 Agent MCP execution.
3. P0-3 canonical product truth and topology.
4. P0-4 exact-green release verification.
5. Bounded commits and clean candidate.
6. P0-5 exact-commit acceptance and closure.
7. Stop M1-B; do not continue backlog work.

The next phase, M1-C External Pilot Reality Gate, requires separate approval.

## P0-1 Completion Evidence — Human Offer Continuation

- Status: Complete in working tree; intentionally uncommitted for parent
  release sequencing.
- Root cause: authenticated Human workspace recovery reread the current Credit
  Application but cleared the exact acceptance review whenever the original
  in-memory four-step receipt was absent. Fresh pages and re-login therefore
  displayed an Offer without a review binding, and the application read shape
  could not represent `credit_offer.v2`.
- Implemented boundary: `pilotReadWorkspaceResume` now derives one
  non-authorizing Human review from Actor-bound PostgreSQL Intent resources,
  the exact approved Decision, current active Consent, current Actor-authorized
  offered Offer, and Offer aggregate version. It supports preliminary v1 and
  Capital Partner v2, scans bounded historical Intents, and returns no review
  when zero or more than one Offer is actionable.
- Browser continuation: a closed validator reconstructs the review without
  browser/session/local storage authority, restores the exact visible request
  terms including exact cents, and rereads server truth immediately before
  acceptance. The second read recursively compares the complete Decision and
  Offer, so same-version rate, maturity, facility, reason-code, hash, ID,
  schema, request, and aggregate-version drift all fail closed.
- Contract compatibility: the closed v1 Credit Application and workspace
  response definitions remain intact. The two live operations now advertise
  and emit honest v2 result contracts for Capital Partner Offers and Human
  continuation metadata; operation IDs, request schema, actor/capability scope,
  public status, and funds authority are unchanged.
- Compatibility: the existing Agent continuation receipt interface and all
  Wallet, A2A, MCP, Agent, Obligation, Ledger, Event, and Evidence boundaries
  are preserved. `WORKSPACE_RESUME_SELF` is reconciled into the Human Borrower
  role bundle because both canonical local and production Human profiles
  already grant it and the Tenant protocol already advertises the operation;
  this adds no operation, Actor type, or permission beyond those existing
  profiles. No migration, deployment, credential, funds, signer, withdrawal,
  Venue-write, or production-credit permission was introduced.
- Rollback: revert the P0-1 source, contract, browser, and test changes listed
  below. No data rollback or migration is required because recovery is an
  additive read projection and acceptance still uses the existing durable
  command path.

Exact P0-1 files:

- `apps/web/src/app.js`
- `apps/web/src/human-credit-offer-workflow-receipt.js`
- `apps/web/src/index.html`
- `apps/web/src/principal-agent-workspace-selection.js`
- `apps/web/src/request-credit-review-binding.js`
- `apps/web/src/servicing-position-index.js`
- `apps/web/test/human-credit-offer-workflow-receipt.test.js`
- `apps/web/test/principal-agent-workspace-selection.test.js`
- `apps/web/test/request-credit-review-binding.test.js`
- `apps/web/test/servicing-position-index.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/agent-console-browser-host.mjs`
- `apps/web/test/support/capital-network-browser-host.mjs`
- `apps/web/test/support/human-lifecycle-browser-host.mjs`
- `api/tenant-protocol/conformance/agent-credit-offer-workflow-receipt.v1.fixtures.json`
- `api/tenant-protocol/conformance/human-credit-offer-workflow-receipt.v1.fixtures.json`
- `api/tenant-protocol/ipo-one.tenant-protocol.v1.json`
- `modules/authorization/src/authorization-constants.js`
- `modules/authorization/test/authorization-policy.test.js`
- `modules/tenant-command-gateway/src/credit-decision-handlers.js`
- `modules/tenant-command-gateway/src/credit-intent-handlers.js`
- `modules/tenant-command-gateway/src/workspace-resume-handlers.js`
- `modules/tenant-command-gateway/test/workspace-resume-handlers.test.js`
- `modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs`
- `packages/api-contract/index.d.ts`
- `packages/api-contract/src/tenant-protocol.js`
- `product/traceability/ipo-one.v9-product-traceability.v1.json`
- `schemas/v2/agent-credit-offer-workflow-receipt.schema.json`
- `schemas/v2/human-credit-offer-workflow-receipt.schema.json`
- `schemas/v2/tenant-protocol-catalog.schema.json`
- `schemas/v2/tenant-protocol-result.schema.json`

Failing-before Evidence:

```text
node --test modules/tenant-command-gateway/test/workspace-resume-handlers.test.js
3 passed, 1 failed
TypeError: Cannot read properties of undefined (reading 'offer')
```

Passing-after Evidence:

```text
node --test modules/tenant-command-gateway/test/workspace-resume-handlers.test.js \
  apps/web/test/request-credit-review-binding.test.js \
  apps/web/test/servicing-position-index.test.js \
  apps/web/test/human-credit-offer-workflow-receipt.test.js \
  apps/web/test/principal-agent-workspace-selection.test.js
27 passed, 0 failed

pnpm run typecheck
Contract typecheck passed: 3 package export surfaces and 72 runtime value exports.

pnpm run check:schemas
Schema checks passed: 136 contracts.

node scripts/check-tenant-protocol.mjs
Tenant protocol checks passed: 102 operations, 103 request fixtures,
91 result fixtures, 8 handoff fixtures, 3 capability manifests,
5 workflow receipt fixtures.

PostgreSQL clean-database container command:
node --test --test-concurrency=1 modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs
42 passed, 0 failed
```

The PostgreSQL proof creates a new Gateway and Human client before recovery,
reconstructs the same closed browser binding from server truth, and then:

- accepts a recovered preliminary `credit_offer.v1` into an Obligation; and
- recovers Capital Partner `credit_offer.v2` after it replaces the preliminary
  v1, rejects the stale preliminary Offer, and accepts v2 into an Obligation.

Negative coverage confirms expired, replaced/stale ID, stale hash/terms,
changed aggregate version, duplicate/replayed acceptance, unauthorized Actor,
cross-Tenant access, ambiguous actionable Intents, and invalid/open binding
data fail closed.
