# M1-B P0-5 — Exact-commit acceptance

Status: In progress

## Context and current baseline

The Founder-directed M1-B closure requires positive Human, Principal/Agent, and
Capital Partner acceptance against the exact clean release commit. The full
privileged Risk/Operations journey is deferred to
`M1_C_L2_CLOSED_NO_FUNDS`; M1-B instead requires exact-candidate split proof:
an exhaustive exact-source policy regression over every operation whose
`security_001.v1` policy requires recent phishing-resistant MFA, plus two real
post-restart SIWE-only runtime denials for the exposed protected read and valid
mutation attempt. The canonical
local product is PostgreSQL-backed and restart-safe, but its OCI image currently
reports the generic revision `local-stack`. Existing browser QA hosts exercise
presentation fixtures and therefore cannot prove PostgreSQL, release identity,
or deployable-product behavior.

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
- Define the current machine-verifiable P0-5 Evidence v2 contract bound to one
  exact commit, one canonical PostgreSQL product truth, three positive
  authenticated journeys, a 24-row local browser/recovery matrix, the exact
  eight-row hosted Principal/Agent matrix when deployment passes, restart
  recovery, negative authorization, the separate fail-closed Risk boundary,
  and unchanged no-funds authority.
- Preserve the separately callable historical v1 verifier for already captured
  evidence. Historical v1 Evidence is not rewritten or reclassified as v2.
- Require the Risk boundary receipt to bind the exact SHA and post-restart
  PostgreSQL start, enumerate the complete policy-derived Risk/Operations
  recent-MFA operation set, record exhaustive exact-source
  `actor_capability_rejected` denials with zero additional effects for every
  operation, and separately bind two real post-restart PostgreSQL denial audits
  to the fresh SIWE Risk session. The local receipt must prove equal protected-
  state hashes, zero privileged mutation, and the complete policy-derived
  protected identity surface (`auditor`, `operations_operator`, and
  `risk_operator`) containing only the reviewed active Risk membership and
  SIWE credentials. The top-level v2 contract separately proves that no hosted
  Risk surface exists.
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
  Partner, or Risk authorization. In particular, do not weaken or emulate
  phishing-resistant MFA.
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
6. Given a complete canonical v2 Evidence document, when verified against the
   explicit expected SHA, then every applicable local and hosted browser artifact is
   classified as real-browser Evidence from its matching runtime, every
   lifecycle receipt is PostgreSQL-backed, and hosted release identity equals
   the exact SHA. Row-specific proof must also be byte-distinct; copied content
   under new artifact IDs or paths is rejected.
   Local OCI identity and both Agent phase linkages are also parsed from the
   referenced artifact bodies; declarative artifact kinds and hashes alone are
   insufficient.
7. Given the wallet-gated positive Human roles, when sign-out/re-login is accepted, then
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
10. Given the exact local runtime after restart, the tracked Risk producer
    derives every policy whose `requiresRecentMfaActorTypes` intersects the
    protected Risk/Operations policy surface and executes the exhaustive
    21-operation `AuthorizationService` regression with server-trusted SIWE
    contexts and zero allows. Separately, a fresh real Risk SIWE session must
    produce PostgreSQL audit denials for exposed
    `pilotReadTenantRiskPortfolioReference` and a valid `pilotFreezeSubject`
    attempt. The split-provenance v2 receipt proves both live requests deny as
    `actor_capability_rejected`; the session, credential, and membership already
    satisfy the required Risk role, client, policy, and capabilities; session
    `authTime` is after observation starts and no later than session creation;
    the active protected actor surface has exactly the reviewed Risk membership,
    no Operations or Auditor membership, and no non-SIWE credential path; each
    audit binds to the submitted correlation ID and fresh session token-JTI
    reference without emitting either hash; the nontrivial protected-state hash
    is unchanged; no command/economic effect occurs; and the active Risk
    credential set contains only SIWE. Before and after collection, the wrapper
    must not rebuild or retag the post-restart image; it requires the sealed
    Agent-after phase receipt, both long-lived product containers, and the
    current Compose Pilot tag to bind the same content-addressed image ID and
    exact OCI revision, then binds that image ID plus the prior release-identity
    artifact digest into the receipt. The ephemeral producer receives a
    credential-free database endpoint and derives the application-role
    connection only from the existing
    read-only role-secret mount. An incomplete source regression, two
    simulated live denials, or a unit-test-only claim cannot close the runtime
    Evidence requirement; nor may the receipt falsely claim all 21 operations
    were live browser attempts. Hosted Risk absence remains a separate
    top-level v2 Evidence invariant.
11. Given no exact hosted deployment, v2 may report
    `runtime.hosted.status=deployment_pending` only with `releaseId:null`,
    `postgresBacked:false`, `surfaces:[]`, and zero hosted matrix rows. Given a
    passed hosted deployment, `releaseId` must equal the exact candidate SHA,
    PostgreSQL must be canonical, and the only M1-B hosted surface is
    `primary` mapped to Principal/Agent. Hosted Risk is rejected.

## Exact test commands

```text
node --test packages/deployment-topology/test/local-release-identity.test.js
node --test packages/deployment-topology/test/m1-b-acceptance-evidence.test.js
node --test packages/deployment-topology/test/m1-b-acceptance-evidence-files.test.js
node --test apps/private-pilot/test/m1-b-acceptance-postgres.test.js apps/private-pilot/test/m1-b-human-capital-partner-acceptance.test.js apps/private-pilot/test/m1-b-human-capital-partner-acceptance-cli.test.js packages/deployment-topology/test/local-human-capital-partner-acceptance.test.mjs
node --test modules/authorization/test/authorization-service.test.js
node --test apps/private-pilot/test/m1-b-risk-mfa-boundary-acceptance.test.js
node --test apps/private-pilot/test/agent-reference-acceptance.test.js
node --test apps/private-pilot/test/agent-reference-workflows.test.js
node --test apps/private-pilot/test/m1-b-expired-offer-setup.test.js apps/private-pilot/test/m1-b-operational-live-negative-acceptance.test.js apps/private-pilot/test/m1-b-operational-negative-acceptance.test.js packages/deployment-topology/test/m1-b-operational-evidence-builder.test.mjs packages/deployment-topology/test/m1-b-operational-negative-orchestrator.test.mjs
node scripts/check-local-stack.mjs
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:up
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:acceptance
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_ACCEPTANCE_PHASE=before_restart IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:agent:acceptance
# Record only safe server-derived Human Offer and Capital Partner profile/Passport recovery anchors.
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:restart
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:acceptance
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_ACCEPTANCE_PHASE=after_restart IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:agent:acceptance
pnpm run acceptance:m1-b:human-capital-partner -- --candidate-release-id <exact-clean-head> --database-started-at <exact-post-restart-time> --pilot-image-id <exact-pilot-image> --output-root output/playwright/m1-b-p0-5
pnpm run acceptance:m1-b:operational -- expired-offer-setup --candidate-release-id <exact-clean-head> --pilot-image-id <exact-pilot-image> --output-root output/playwright/m1-b-p0-5
pnpm run acceptance:m1-b:operational -- live-negative --candidate-release-id <exact-clean-head> --pilot-image-id <exact-pilot-image> --output-root output/playwright/m1-b-p0-5 --negative-case human:expired_offer
pnpm run acceptance:m1-b:operational -- live-negative --candidate-release-id <exact-clean-head> --pilot-image-id <exact-pilot-image> --output-root output/playwright/m1-b-p0-5 --negative-case human:unauthorized_subject
pnpm run acceptance:m1-b:operational -- live-negative --candidate-release-id <exact-clean-head> --pilot-image-id <exact-pilot-image> --output-root output/playwright/m1-b-p0-5 --negative-case authorization:cross_role_private_read
# human:replaced_stale_offer is derived from the sealed Capital Partner critical receipt; do not replay it in a browser.
pnpm run acceptance:m1-b:operational -- negative-run --candidate-release-id <exact-clean-head> --pilot-image-id <exact-pilot-image> --output-root output/playwright/m1-b-p0-5
# Complete only the builder-issued browser prompts; do not supply row claims, journey steps/timestamps, session, signature, cookie, CSRF, credential, or PII material.
pnpm run acceptance:m1-b:operational -- collect-pre-risk --candidate-release-id <exact-clean-head> --pilot-image-id <exact-pilot-image> --output-root output/playwright/m1-b-p0-5
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:risk:mfa-boundary
pnpm run acceptance:m1-b:operational -- finalize --candidate-release-id <exact-clean-head> --pilot-image-id <exact-pilot-image> --output-root output/playwright/m1-b-p0-5
node scripts/verify-m1-b-acceptance-evidence.mjs --evidence output/playwright/m1-b-p0-5/<exact-clean-head>.m1-b-p0-5-acceptance-evidence.v2.json --evidence-root <repository-root> --expected-sha <exact-clean-head>
pnpm test
```

The ordering above is normative. Before restart, record only the safe retained
anchors needed for recovery; do not create the Capital Partner lifecycle or
collect browser/journey/negative rows. The stack restart command runs exactly
once. Agent `after_restart` must complete before the Human/Capital Partner
producer and all candidate-bound browser Evidence. All 24 browser rows, the
Human and Capital Partner journey verification, Principal/Agent
`restart_recovery`, the four safe `live_post_restart` negatives, and the live part of
the Risk receipt bind to that one retained post-restart database start and
candidate image; the three restart-recovery rows compare to the pre-restart
anchors. The first ten Principal/Agent journey steps bind the pre-restart Agent
acceptance plus its exact application and runtime MCP receipts and are only
reconciled after restart; those economic actions must not be replayed. The
same `before_restart` producer also seals `agent_foreign_offer_setup`: one
distinct four-step application-only MCP workflow whose `credit_offer.v1`
remains physically `offered`, Agent-owned, and free of acceptance, Obligation,
execution, repayment, or ledger effects. `local:restart` automatically binds
that receipt into the restart-begin journal and completed restart receipt. It
must remain unexpired and physically offered through the
`human:unauthorized_subject` live denial. If it expires first, fail and recut;
never reissue it after Mandate activation or weaken the denial case. The
ten `exact_source_disposable_postgres` negatives use fresh disposable
PostgreSQL through the application role. The one
`exact_source_ui_binding` changed-version case proves that exact tracked UI
binding rejects stale version state before submission without a Tenant audit.
The one `exact_source_transport` signed-out case has no Tenant audit or database
binding. Those twelve non-live cases must still bind the same exact candidate
SHA, tree, OCI image, closed case registry, and tracked source; disposable,
UI-binding, or transport proof must never be relabeled as live. A second restart of the retained runtime
invalidates the timeline and requires the operator to start P0-5 collection
again from a clean candidate.

The operational output root must be one existing real `0700` direct child of
`output/playwright/`. The `expired-offer-setup` mode arms a separate `0600`,
non-overwriting safety latch immediately before its first authoring browser
action. The latch contains only candidate/runtime intent and critical-artifact
hashes, is never deleted, and is not an Evidence artifact. A latch without a
valid matching setup receipt means the mutating attempt may have occurred and
requires a new candidate; it must never be retried. A matching sealed latch and
receipt makes a duplicate invocation read-only and idempotently refuses to
author another Offer. The setup, all three interactive live-negative attempts,
the twelve exact-source cases, all browser rows, and all journey reconciliation
must be sealed before the tracked Risk producer runs. `finalize` runs only after
Risk and consumes those immutable bytes; it performs no operational retry.

`collect-pre-risk` emits 33 unique phase prompts for the 24-row browser matrix.
For each prompt, the operator executes only its tracked same-origin expression
in the named Chrome role surface and returns the closed safe measurement; the
builder owns the timestamp, immediately reconciles every authenticated private
read to the exact request/correlation pair, exact two PostgreSQL allow audits,
and active wallet-SIWE binding, and seals one real challenge-bound `0600` PNG per
phase. The runtime-captured response projection and its counts/presence flags
are supplementary browser Evidence, not a durable PostgreSQL query-response
record or canonical state. Canonical journey truth remains the already parsed
Human, Agent, and Capital Partner critical receipts. Journey receipts are
derived from those receipts, MCP sources, measured UI checkpoints, and restart
Evidence; no operator-authored journey step or timestamp is accepted.

The exact browser set is 81 artifacts: 24 runtime receipts, 24 browser audits,
and 33 phase PNGs. The immutable pre-Risk set is exactly 148 artifacts. The
canonical v2 set is exactly 151 after adding the pre-Risk receipt, Risk receipt,
and final closure receipt; missing, extra, filler, or wrong-kind entries fail.

The Human/Capital Partner command is an interactive, response-only NDJSON
collector. The operator completes the prompted real signed-in browser actions
in order and returns only the prompt's request ID, correlation ID, and response
body; input must not contain `capturedAt`, request headers or bodies, cookies,
CSRF values, wallet signatures, session material, credentials, or PII. The CLI
timestamps each line when observed. After the five Human prompts, prepare
lineage A through the normal Human UI: start a new application, create one
fresh scoped Consent, request and evaluate credit, and issue one expiring
Passport to the exact invited Capital Partner Actor. The producer must bind
those setup commands and PostgreSQL lineage in a safe setup envelope before
Capital Partner inbox A. After stale preliminary-A denial and recovery of
current Offer A, repeat that normal UI setup as distinct lineage B before
Capital Partner inbox B. Do not prepare B before the first A recovery, because
two actionable Offers make workspace recovery intentionally ambiguous. The
exact ten Capital Partner prompts remain self, Passport inbox A, author Offer
A, deny stale preliminary A, recover Offer A, Passport inbox B, author Offer B,
withdraw Offer B, deny withdrawn Offer B, and recover Offer A again. At
Capital Partner denial steps 4 and 9,
the CLI first generates the exact request identifiers and idempotency key,
resolves the already-proven invited Human SIWE client, and takes the
tenant-scoped application-role PostgreSQL baseline. Only then does it emit
`denial_response_ready` with an exact same-origin `browserExpression`. That
expression uses the loopback-only app bridge to open the existing
economic-action modal and requires a fresh explicit wallet click and
`wallet_personal_sign` bound to the exact Offer hashes and request. Rejecting
the modal or wallet request submits nothing. CSRF, connector, session, and raw
signature remain in page memory. The expression prints only the contract-valid
redacted request projection (hashes, times, method, and
`rawSignaturePersisted:false`) and problem response; the CLI recomputes the
action-payload, acknowledgement, and request-projection hashes and binds them
to the same PostgreSQL target, denial audit, and zero-effect readback. The
command performs no restart and fails if the PostgreSQL start or Pilot/Worker
container identity changes.

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
- [ ] The exact post-restart Risk receipt proves a real SIWE wallet ACR/AMR,
      exhaustive exact-source denial of the complete current Risk/Operations
      recent-MFA policy set, separately correlated live denial audits for the
      reference read and freeze attempt, equal protected-state hashes, zero
      privileged mutation, and no unreviewed active protected actor, non-SIWE
      credential, synthetic MFA claim, session material, or policy weakening.
      The top-level v2 contract
      independently rejects any hosted Risk surface.
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
- real-browser measured audits and 33 phase screenshots for the Human,
  Principal/Agent, and Capital Partner positive paths at all eight local checks
  (24 rows, 81 browser artifacts total), plus the hosted Principal/Agent primary
  surface at all eight checks when actually deployed;
- reload, new context, Back/Forward, sign-out/re-login, and restart receipts;
- Human and Agent full lifecycle receipts from PostgreSQL server truth;
- Capital Partner author/replace/withdraw/current-Offer recovery receipts;
- one post-restart exact-candidate Risk security-boundary v2 receipt with the
  complete 21-operation exact-source regression plus separate live PostgreSQL
  audit denials for the exposed protected read and valid freeze attempt; it
  must prove no successful privileged read or mutation, no unreviewed active
  protected actor, no non-SIWE active credential, no protected-state change,
  and no economic effect. The enclosing
  v2 Evidence must separately prove that no hosted Risk surface exists;
- negative authorization receipts with no disclosed protected object;
- hosted HTTPS URL and runtime-reported exact release identity, when deployment
  acceptance is performed;
- explicit no-funds and disabled-authority confirmation.

## Dependency and sequencing notes

P0-5 execution waits for P0-1 through P0-4 and one clean exact candidate. This
issue may prepare the fail-closed harness in parallel, but no row or runtime
Risk denial may be marked passed from source presence, unit tests, fixtures,
prior screenshots, or a generic local image. The Founder or operator completes
real wallet prompts; Codex may drive the surrounding browser flow and collect
redacted Evidence. Full privileged Risk workspace acceptance remains an M1-C
gate and must not be fabricated to close M1-B.
