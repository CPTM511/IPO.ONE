# M1-B P0-5 — Exact-commit acceptance

Status: In progress

## Context and current baseline

The Founder-directed M1-B closure requires Human, Principal/Agent, Capital
Partner, and Risk/Operations acceptance against the exact clean release commit.
The canonical local product is PostgreSQL-backed and restart-safe, but its OCI
image currently reports the generic revision `local-stack`. Existing browser QA
hosts exercise presentation fixtures and therefore cannot prove PostgreSQL,
release identity, or deployable-product behavior.

Ordered baseline:
`ae6a0571d9052028b2043437938ca37d15b96f6b` on
`codex/m1-b-deployable-sandbox`.

This issue is L1 public-sandbox release-closure Evidence for a synthetic,
no-real-funds product. It does not approve a private closed pilot, production
credit, external execution, deployment, or real value.

## Scope

- Permit the local Compose build to receive one optional exact M1-B source SHA.
- Build exact local and hosted candidates from a tracked Git archive, excluding
  untracked workspace files and secrets from release bytes.
- Permit one validated local review port base while retaining 8787-8790 as the
  default four-workspace topology.
- Fail closed when an exact-SHA local run does not match clean `HEAD`.
- Verify the running Pilot and Worker OCI revision labels before accepting local
  runtime Evidence.
- Bind the durable Agent acceptance lifecycle to the exact candidate SHA with a
  candidate-scoped Agent Subject, deterministic tenant/account binding, and
  exact Mandate nonce. Run its economic lifecycle through the local MCP bridge
  before restart, then prove the same PostgreSQL lifecycle through canonical
  lifecycle recovery after restart; authenticated read audit/replay
  bookkeeping may still be recorded.
- Preserve generic `local-stack` developer operation while marking it
  ineligible for exact-commit release acceptance.
- Define a machine-verifiable P0-5 Evidence contract bound to one exact commit,
  one canonical PostgreSQL product truth, four authenticated roles, distinct
  complete local and hosted browser-recovery matrices, restart recovery,
  negative authorization, and unchanged no-funds authority.
- Require hosted Evidence to come from an HTTPS canonical runtime that reports
  the expected release identity. Reject loopback and browser fixture hosts as
  hosted/release Evidence.
- Document the operator-assisted wallet ceremony without introducing a test
  authentication bypass or committing wallet/session material.

## Non-goals

- No automated wallet signing, injected wallet, private key, session-cookie
  capture, or authentication bypass.
- No Vercel, database, DNS, secret, signer, Provider, Venue, or funds mutation.
- No new browser product behavior and no changes to Human, Agent, Capital
  Partner, or Risk authorization.
- No A2A, subscriptions, notifications, new product capability, or UI redesign.
- No use of `apps/web/test/support/*browser-host.mjs` as PostgreSQL or release
  Evidence.
- No claim that local source stamping proves a hosted deployment.

## Likely files

- `deploy/local/compose.yaml`
- `scripts/local-release-identity.mjs`
- `scripts/local-stack.mjs`
- `scripts/local-stack-acceptance.mjs`
- `scripts/local-agent-reference-acceptance.mjs`
- `scripts/check-local-stack.mjs`
- `scripts/verify-m1-b-acceptance-evidence.mjs`
- `apps/private-pilot/src/agent-reference-acceptance.js`
- `apps/private-pilot/src/agent-reference-acceptance-scope.js`
- `apps/private-pilot/test/agent-reference-acceptance.test.js`
- `packages/deployment-topology/test/local-release-identity.test.js`
- `packages/deployment-topology/test/m1-b-acceptance-evidence.test.js`
- `deploy/local/README.md`
- `docs/verification/M1_B_P0_5_ACCEPTANCE.md`

## Given / When / Then acceptance criteria

1. Given `IPO_ONE_M1_B_RELEASE_SHA` is absent, when the local stack is built and
   accepted, then its revision is `local-stack` and the result explicitly says
   it is developer-only and cannot close P0-5.
2. Given `IPO_ONE_M1_B_RELEASE_SHA` is malformed, uppercase, not current `HEAD`,
   or a tracked file differs from `HEAD`, when any local stack command prepares
   Compose, then preparation fails before build or runtime mutation. Unrelated
   untracked Founder work is ignored for Git identity, preserved, and excluded
   from the exact Git-archive build context.
3. Given a clean checkout whose `HEAD` equals the supplied 40-character SHA,
   when `local:up` builds the Pilot image, then Pilot and Worker containers carry
   exactly that OCI revision label.
4. Given an exact-SHA runtime, when `local:acceptance` runs before and after
   `local:restart`, then it verifies the runtime labels, PostgreSQL/RLS state,
   worker/reconciliation state, and unchanged no-funds boundary.
5. Given an acceptance Evidence document with a wrong SHA, dirty-source claim,
   fixture origin, loopback hosted origin, incomplete role journey, missing
   local or applicable hosted desktop/mobile or recovery coverage, reused
   browser/receipt artifacts, missing negative
   authorization, missing restart pass, browser-storage authority, or enabled
   real-value flag, when verified, then it fails closed.
6. Given a complete canonical Evidence document, when verified against the
   explicit expected SHA, then every local and hosted browser artifact is
   classified as real-browser Evidence from its matching runtime, every
   lifecycle receipt is PostgreSQL-backed, and hosted release identity equals
   the exact SHA. Row-specific proof must also be byte-distinct; copied content
   under new artifact IDs or paths is rejected.
   Local OCI identity and both Agent phase linkages are also parsed from the
   referenced artifact bodies; declarative artifact kinds and hashes alone are
   insufficient.
7. Given the wallet-gated Human roles, when sign-out/re-login is accepted, then
   a real invited wallet performs the ceremony; no repository-held key or
   synthetic login substitutes for it.
8. Given the exact Agent acceptance command with
   `IPO_ONE_M1_B_ACCEPTANCE_PHASE=before_restart`, when it succeeds, then the
   Subject display marker, account binding, Mandate nonce, and returned
   lifecycle are bound to the supplied candidate SHA, controlled execution
   traverses the MCP bridge with the exact Provider ID and category, and the
   resulting Ledger, repayment, and Evidence are PostgreSQL-backed and
   no-funds.
9. Given that exact pre-restart Agent acceptance and a complete local stack
   restart, when the same SHA is accepted with
   `IPO_ONE_M1_B_ACCEPTANCE_PHASE=after_restart`, then the harness performs
   canonical lifecycle recovery with no onboarding or economic mutation,
   returns the same Subject, Mandate, Intent, Offer, Obligation, Facility,
   CreditLine, and account binding, and proves the PostgreSQL process started
   after the pre-restart receipt. Authenticated read audit/replay bookkeeping
   may be recorded; a missing or mismatched pre-restart receipt, candidate
   lifecycle, phase, SHA, or canonical identifier fails closed.
   The private phase markers are
   `.ipo-one/local-stack/agent-workflows/<sha>.before-restart.acceptance.json`
   and `<sha>.after-restart.acceptance.json`; post-restart acceptance reads the
   former and writes the latter only after the linkage checks pass.

## Exact test commands

```text
node --test packages/deployment-topology/test/local-release-identity.test.js
node --test packages/deployment-topology/test/m1-b-acceptance-evidence.test.js
node --test apps/private-pilot/test/agent-reference-acceptance.test.js
node --test apps/private-pilot/test/agent-reference-workflows.test.js
node scripts/check-local-stack.mjs
pnpm run local:acceptance
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:up
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:acceptance
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_ACCEPTANCE_PHASE=before_restart IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:agent:acceptance
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:restart
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:acceptance
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_ACCEPTANCE_PHASE=after_restart IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:agent:acceptance
node scripts/verify-m1-b-acceptance-evidence.mjs --evidence <private-evidence.local.json> --evidence-root <repository-root> --expected-sha <exact-clean-head>
pnpm test
```

## Security checklist

- [ ] Supplied release identity is exact lowercase Git SHA, equals `HEAD`, and
      is used only when tracked source matches that commit; unrelated untracked
      Founder work remains preserved and outside the Git-archive release bundle.
- [ ] Runtime image and both long-lived product containers report that exact
      immutable source identity.
- [ ] Agent pre-restart and post-restart receipts identify the same exact SHA,
      candidate-scoped Subject/account/Mandate, canonical lifecycle IDs, and
      retained PostgreSQL truth; only the pre-restart phase performs the MCP
      economic workflow.
- [ ] Fixture/scenario browser hosts cannot be classified as PostgreSQL or
      release Evidence.
- [ ] Browser state, storage, URLs, screenshots, and operator attestations never
      become lifecycle or acceptance authority.
- [ ] Wallet credentials, raw signatures, session cookies, CSRF material, raw
      PII, and database credentials are absent from artifacts.
- [ ] Cross-role, signed-out, wrong-Tenant, stale/replaced Offer, replay-invalid,
      and protected-action denial Evidence is present and non-enumerating.
- [ ] Real funds, external Provider execution, production signer, arbitrary
      withdrawal, Venue write, production Human credit, and mainnet remain
      disabled.

## Permission boundary

This issue changes local release provenance checks and acceptance Evidence only.
It grants no deployment, remote access, credential issuance, transaction,
signer, Provider, Venue, chain-write, funds, credit-policy, or production
authority. Hosted acceptance may run only after the existing reviewed no-funds
deployment workflow produces an exact deployment; this issue itself performs
no external mutation.

## Data and migration impact

No schema, migration, seed, or canonical data mutation is introduced. The local
PostgreSQL volume is retained across the restart drill. Exact-SHA stamping
changes OCI metadata only.

## Rollback plan

Revert the optional Compose build argument, local release-identity helper,
acceptance label checks, verifier, and this issue together. The existing
`local-stack` developer build and persistent PostgreSQL volume remain usable;
rollback must not delete the volume or authentication material.

## Required Evidence

- failing-before and passing-after release-identity conformance test;
- exact clean commit and tree;
- Pilot image, Pilot container, and Worker container revision labels;
- local acceptance before and after complete PostgreSQL/Pilot/Worker restart;
- the redacted local OCI identity receipt emitted by exact `local:acceptance`;
- exact-SHA Agent pre-restart acceptance containing the MCP execution receipt,
  Ledger, repayment, and Evidence, followed by exact-SHA post-restart canonical
  lifecycle recovery containing the same identifiers and a later
  PostgreSQL process start, with no onboarding or economic lifecycle mutation.
  The pre-restart extracted set includes an MCP receipt; the post-restart set
  includes a recovery receipt and omits MCP;
- real-browser trace/screenshots for all four local roles at desktop and mobile,
  plus the hosted Principal Agent surface and optional hosted Risk / Operations
  surface when actually deployed;
- reload, new context, Back/Forward, sign-out/re-login, and restart receipts;
- Human and Agent full lifecycle receipts from PostgreSQL server truth;
- Capital Partner author/replace/withdraw/current-Offer recovery receipts;
- Risk portfolio/queue/protective-control/audit Evidence receipts;
- negative authorization receipts with no disclosed protected object;
- hosted HTTPS URL and runtime-reported exact release identity, when deployment
  acceptance is performed;
- explicit no-funds and disabled-authority confirmation.

## Dependency and sequencing notes

P0-5 execution waits for P0-1 through P0-4 and one clean exact candidate. This
issue may prepare the fail-closed harness in parallel, but no row may be marked
passed from source presence, unit tests, fixtures, prior screenshots, or a
generic local image. The Founder or operator completes real wallet prompts;
Codex may drive the surrounding browser flow and collect redacted Evidence.
