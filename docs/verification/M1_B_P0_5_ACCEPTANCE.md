# M1-B P0-5 exact-commit acceptance Evidence

Status: `PRODUCER_READY_RUNTIME_RECEIPT_PENDING`

This is the current operator ledger for Founder-directed M1-B P0-5
acceptance. It is not Evidence that P0-5 has passed. Positive journey rows,
exact-runtime artifacts, and the Risk boundary remain pending until collected
against one clean exact candidate.

## Effective M1-B boundary

- Delivery level: `L1_PUBLIC_SANDBOX`, synthetic and no funds.
- Positive acceptance paths: Human, Principal/Agent, and Capital Partner.
- Risk/Operations: fail-closed security-boundary proof only. A successful
  privileged Risk journey is neither required nor permitted without the
  separately approved `M1_C_L2_CLOSED_NO_FUNDS` phishing-resistant OIDC or
  WebAuthn topology.
- Canonical lifecycle truth: Human Web / Agent MCP / Tenant API -> Tenant
  Protocol -> Tenant Command Gateway -> shared Human/Agent kernel ->
  PostgreSQL.
- Browser fixtures under `apps/web/test/support/` are never runtime, hosted,
  PostgreSQL, or release Evidence.
- Wallet prompts are completed by the Founder/operator. No injected key,
  session replay, authentication bypass, synthetic MFA claim, captured cookie,
  or captured signature may substitute.

## Current and historical verifier contracts

Current Evidence must use
`ipo.one.m1-b-p0-5-acceptance-evidence/v2` and the exported
`verifyM1BAcceptanceEvidence` verifier.

The original v1 acceptance contract is preserved for historical Evidence only
through `verifyM1BAcceptanceEvidenceV1Historical`. It retains the former four-
journey, 32-local-row, optional hosted-Risk semantics so an existing historical
artifact can still be checked under the rules that produced it. Historical v1
Evidence must not be rewritten, relabeled, or used to claim current v2 closure.

## Exact v2 coverage

Positive journeys contain exactly 28 steps:

- Human, 11: sign in; Subject/Consent; Credit Intent; Decision/Offer;
  reload/re-login; exact Offer recovery; acceptance; Obligation; controlled
  sandbox execution; repayment; Evidence.
- Principal/Agent, 11: Principal sign in; Agent Subject; account proof;
  Mandate; Agent application; Offer; acceptance; MCP execution; repayment;
  Evidence; restart recovery.
- Capital Partner, 6: partner sign in; Passport review; author Offer; replace
  Offer; withdraw Offer; borrower recovers only the current Offer.

The local browser matrix contains exactly 24 distinct rows: each of those three
positive roles must pass desktop, mobile, reload, fresh browser context,
Back/Forward, sign-out/re-login, negative authorization, and restart recovery.
The tracked collector emits 33 unique phase challenges for those rows and seals
one challenge-bound, decodable, viewport-matched `0600` PNG per phase. Together
the 24 runtime receipts, 24 browser audits, and 33 PNGs form the exact 81 browser
artifacts. Renamed, copied, arbitrary, or operator-described bytes do not
establish a phase or row.

For each authenticated phase, the safe response projection is a supplementary
Chrome runtime measurement reconciled to the exact request/correlation pair,
the exact two PostgreSQL allow-audit events, and one active wallet-SIWE session.
It is not a durable PostgreSQL query-response record, and its counts/presence
flags are not canonical product truth. The parsed Human, Agent, and Capital
Partner critical receipts remain the canonical journey/server-truth source.

| Check | Human | Principal / Agent | Capital Partner |
| --- | --- | --- | --- |
| Desktop | `PENDING` | `PENDING` | `PENDING` |
| Mobile | `PENDING` | `PENDING` | `PENDING` |
| Reload | `PENDING` | `PENDING` | `PENDING` |
| Fresh browser context | `PENDING` | `PENDING` | `PENDING` |
| Back / Forward | `PENDING` | `PENDING` | `PENDING` |
| Sign-out / re-login | `PENDING` | `PENDING` | `PENDING` |
| Negative authorization | `PENDING` | `PENDING` | `PENDING` |
| Restart recovery | `PENDING` | `PENDING` | `PENDING` |

Principal/Agent application, Offer, acceptance, execution, repayment, and
Evidence steps must identify the `agent_mcp` transport and include the exact
application and runtime MCP receipts. All lifecycle and journey receipts must
be PostgreSQL-backed and bound to the exact candidate.

The existing negative set remains exact: seven Human cases, six Agent cases,
and three general authorization cases. All 16 cases are required and each must
reference a unique exact-candidate receipt with `additionalEffectCount:0`.
Four safe cases use `live_post_restart` on the retained database. Ten cases
that are destructive or impossible on retained canonical state use
`exact_source_disposable_postgres` through the application role, and the
changed-version case uses `exact_source_ui_binding` to prove exact tracked UI
rejection before submission with no Tenant audit. The signed-out private read
uses `exact_source_transport` with no Tenant audit.
Every mode binds the same exact candidate SHA, tree, OCI image, closed case
registry, and tracked source; fixtures, mocks, omitted cases, and provenance
relabeling are forbidden. Duplicate acceptance is an exact status-200 replay
with no second effects, not a generic denial. Non-enumerating denial is
required where the closed case definition is a denial.

## Hosted truth

M1-B v2 permits only these two exact states:

1. `passed`: `runtime.hosted.releaseId` equals the candidate SHA,
   `postgresBacked:true`, exactly one HTTPS `primary` surface maps to
   Principal/Agent, and the hosted matrix contains exactly eight primary rows.
2. `deployment_pending`: `releaseId:null`, `postgresBacked:false`,
   `surfaces:[]`, and `browser.hostedMatrix:[]`.

A hosted Risk surface is rejected. M1-B must not expose or promote an
under-assured privileged surface. An old deployed SHA must never be represented
as the current candidate deployment.

## Mandatory Risk/Operations boundary

The top-level `riskBoundary` linkage must be exact:

```json
{
  "schemaVersion": "m1_b_risk_boundary_linkage.v1",
  "status": "passed_fail_closed",
  "releaseLevel": "L1_PUBLIC_SANDBOX",
  "candidateReleaseId": "<exact-clean-head>",
  "surfaceDisposition": "private_unavailable",
  "hostedSurfaceDeployed": false,
  "strongMfaTopologyComposed": false,
  "siweOnlySessionObserved": true,
  "requiresRecentMfaPolicyPreserved": true,
  "weakAuthFallbackAvailable": false,
  "weakAuthFallbackUsed": false,
  "protectedReadDecision": "deny",
  "protectedMutationDecision": "deny",
  "denialReasonCode": "actor_capability_rejected",
  "privilegedMutationCount": 0,
  "postRestartFailClosed": true,
  "deferredGate": "M1_C_L2_CLOSED_NO_FUNDS",
  "artifactId": "<negative-receipt-artifact-id>"
}
```

The referenced artifact is parsed, not trusted from metadata. It must use
`m1_b_risk_mfa_boundary_receipt.v2`, bind the exact candidate SHA, identify
`sourceRuntime:local_exact_commit`, and be captured after the same
post-restart `databaseStartedAt` proven by Agent recovery. It must contain:

- `policyVersion:security_001.v1`,
  `requiresRecentMfaActorTypesPreserved:true`, and the exact complete exported
  protected-operation list;
- an exact-source `AuthorizationService` regression over all 21 exported
  protected operations, with policy-derived Risk or Operations actor type,
  zero allows, the checked source hashes, and a recomputable result digest;
- a separate real post-restart Risk SIWE authentication observation with
  `acr:urn:ipo.one:acr:wallet`, ordered AMR
  `wallet, siwe, <accepted EIP-191 verification method>`, no satisfied
  phishing-resistant MFA, no session material, and no synthetic MFA claim. The
  used session, credential, and membership must independently bind the Risk
  role, exact client and policy, and both live required capabilities. Its
  recorded `authTime` must begin after the receipt's post-restart observation
  start and no later than session creation. The policy-derived protected actor
  surface (`auditor`, `operations_operator`, and `risk_operator`) must match the
  reviewed deployed identity set: exactly one active Risk membership, no active
  Operations or Auditor membership, and only SIWE credentials across every
  active protected actor;
- real PostgreSQL authorization-audit denials for the exposed protected read
  `pilotReadTenantRiskPortfolioReference` and valid protected mutation attempt
  `pilotFreezeSubject`, each with
  `authorizationDecision:deny`, `reasonCode:actor_capability_rejected`, and
  `additionalEffectCount:0`. Each audit must match the submitted correlation
  ID and the fresh session token-JTI reference internally; only the resulting
  binding booleans are emitted, never either hash;
- equal valid protected-state `beforeHash` and `afterHash` values over the
  checked table catalog, nontrivial row-count invariants,
  `privilegedMutationCount:0`, and `additionalEconomicEffectCount:0`;
- a local-only exposure scope, the measured active Risk authentication method
  list `siwe`, zero non-SIWE active Risk credentials, and an explicit statement
  that the local receipt did not evaluate a hosted Risk surface. Hosted Risk
  absence remains independently enforced by the top-level v2 Evidence
  contract; and
- false values for MFA-policy weakening, privileged mutation, real funds,
  secrets, raw PII, and session material.

The complete current protected set has 21 operation IDs:

```text
pilotCancelApproval
pilotDecideApproval
pilotFreezeSubject
pilotIncreaseCreditLimit
pilotProposeApproval
pilotReadApproval
pilotReadCreditRegistryEvidence
pilotReadPilotFeedbackSummary
pilotReadPilotHealth
pilotReadServicingQueue
pilotReadServicingQueueReference
pilotReadTenantRisk
pilotReadTenantRiskPortfolioReference
pilotReduceCreditLimit
pilotRepurchaseSandboxObligation
pilotRestructureSandboxObligation
pilotUnfreezeSubject
pilotWriteOffSandboxObligation
tradingEvaluateRisk
tradingFlattenFacility
tradingPauseNewRisk
```

The conformance test and tracked producer derive this list from the
authorization registry and fail on policy drift. The regression creates
server-trusted SIWE contexts for both Risk and Operations actor types and proves
every current recent-MFA policy denies before resource or mutation handling.
This exhaustive exact-source layer is intentionally separate from live runtime
provenance: the local profile has no Operations actor and not every protected
policy has a Tenant Gateway handler, so the receipt must not claim 21 live
browser denials.

The reviewed producer is available as `pnpm run local:risk:mfa-boundary`. It
runs the named authorization test from the clean tracked host source, rebuilds
the Pilot image from the materialized tracked Git archive, requires the
long-lived Pilot and Worker to use that same content-addressed image ID, binds
the image ID and prior release-identity artifact digest into the receipt,
passes a closed digest manifest into that exact candidate image, and reruns the
21-operation `AuthorizationService` regression there. It uses the
least-privilege application role for transaction-local tenant-scoped,
repeatable-read, read-only PostgreSQL observations, waits for the operator's
fresh Risk SIWE ceremony, verifies the two live audit rows, and writes one
non-overwriting 0600 artifact atomically. The ephemeral producer receives a
credential-free database endpoint and derives its application-role URL only
from the pre-existing reviewed database-role secret mount. It only reads that
mount and never creates credentials. It never
receives a cookie, CSRF value, wallet signature, session handle, or raw
credential. The runtime receipt remains pending until that command
successfully observes the real ceremony; source presence or unit tests do not
mark the boundary passed.

## Restart contract

Run the existing exact Agent lifecycle before restart, restart the complete
local stack with the same SHA and port base, then run recovery-only Agent
acceptance after restart. The before and after artifacts must preserve the same
Subject, Mandate, Intent, Offer, Obligation, Facility, CreditLine, and account
binding; only the pre-restart phase may perform MCP/economic work. The
post-restart database start must be later.

`restart.riskFailClosedAfterRestart` must be true, and restart artifact IDs
must include the parsed Risk boundary receipt in addition to restart and local
runtime/PostgreSQL proof. This binds the Risk post-restart claim to content;
metadata alone is insufficient.

## Operator order

1. Confirm P0-1 through P0-4 and one clean candidate.
2. Record exact SHA, tree, tracked-clean status, migration head, and rollback
   target.
3. Build the local stack from the tracked Git archive with the exact SHA.
4. Run local acceptance and exact Agent `before_restart` acceptance. That phase
   also seals the candidate-bound `agent_foreign_offer_setup`: a distinct
   four-operation application-only MCP workflow with one Agent-owned
   `credit_offer.v1` that remains physically `offered` and has zero acceptance,
   Obligation, execution, repayment, or ledger effects. The subsequent
   `local:restart` restart-begin journal binds this receipt automatically. The
   Offer must remain unexpired and physically offered through the later
   `human:unauthorized_subject` live denial. If it expires before that attempt,
   fail and recut the candidate; do not reissue it after Mandate activation or
   weaken the denial case.
5. Before any restart, record only the safe, server-derived retained anchors
   required to prove later recovery: the preserved current Human Offer and the
   current Capital Partner profile/authorized Passport reference when present.
   Do not create the Capital Partner lifecycle, collect browser matrix rows, or
   claim journey/negative/restart recovery Evidence yet.
6. Restart Pilot, Worker, and PostgreSQL exactly once with the same candidate,
   port base, and retained PostgreSQL volume. Record the new exact PostgreSQL
   start time and re-run local acceptance. Do not perform a second restart
   anywhere in this P0-5 sequence.
7. Run exact Agent `after_restart` recovery first. This is the Principal/Agent
   canonical recovery step and must perform no onboarding or economic mutation.
8. Against that same post-restart database and image, run the candidate-bound
   Human and Capital Partner producer:

```sh
pnpm run acceptance:m1-b:human-capital-partner -- \
  --candidate-release-id <exact-clean-head> \
  --database-started-at <exact-post-restart-database-started-at> \
  --pilot-image-id <exact-post-restart-pilot-image-id> \
  --output-root output/playwright/m1-b-p0-5
```

   It must capture in strict order Human recovery, acceptance, execution, full
   repayment, and Evidence. Then, through the normal Human UI, start a new
   application, create a fresh scoped Consent, request and evaluate credit, and
   issue one expiring Passport to the exact invited Capital Partner Actor as
   lineage A. The producer must bind those setup commands and their PostgreSQL
   lineage in a safe setup envelope before Capital Partner self/Passport inbox,
   Offer A authoring, stale denial, and Offer A recovery. Only after that
   recovery, repeat the normal Human UI setup as distinct lineage B before
   Offer B inbox and authoring, Offer B withdrawal, withdrawn denial, and final
   Offer A recovery. Do not prepare B before the first A recovery: two
   actionable Offers make workspace recovery intentionally ambiguous. It must
   not restart the stack or capture raw credentials, signatures, session
   material, or PII.

   The command is an interactive, response-only NDJSON collector. Complete
   the five Human prompts and then the ten Capital Partner prompts in the
   emitted order. Return only each prompt's request ID, correlation ID, and
   response body; do not supply `capturedAt`, request headers or bodies,
   cookies, CSRF values, wallet signatures, session material, credentials, or
   PII. The CLI assigns the observation timestamp. For Capital Partner denial
   steps 4 and 9, wait for `denial_response_ready`: the CLI has already
   generated the request identifiers/idempotency key, resolved the proven
   invited Human SIWE client, and taken the tenant-scoped application-role
   PostgreSQL baseline before it emits the exact same-origin
   `browserExpression`. Paste that expression only into the correct signed-in
   Human origin. The loopback-only bridge opens the existing economic-action
   modal and requires a fresh explicit wallet click and `wallet_personal_sign`
   bound to the exact Offer hashes, request ID, and five-minute instruction.
   Rejecting the modal or wallet request submits nothing. The expression keeps
   CSRF and the connector in page memory and prints only the contract-valid
   redacted request projection (the confirmation contains hashes and
   `rawSignaturePersisted:false`, never the signature) plus the safe problem
   response. The collector recomputes the action-payload, acknowledgement, and
   request-projection hashes and cross-binds them to PostgreSQL state, audit,
   and zero effects. The wrapper performs no restart and rejects any
   PostgreSQL start or Pilot/Worker container identity drift.

   Focused producer checks:

```sh
node --test apps/private-pilot/test/m1-b-acceptance-postgres.test.js apps/private-pilot/test/m1-b-human-capital-partner-acceptance.test.js apps/private-pilot/test/m1-b-human-capital-partner-acceptance-cli.test.js packages/deployment-topology/test/local-human-capital-partner-acceptance.test.mjs
```
9. Use the tracked operational builder in the exact order below. Its output
   root must already be one real `0700` direct child of `output/playwright/`:

```sh
pnpm run acceptance:m1-b:operational -- expired-offer-setup \
  --candidate-release-id <exact-clean-head> \
  --pilot-image-id <exact-post-restart-pilot-image-id> \
  --output-root output/playwright/m1-b-p0-5

pnpm run acceptance:m1-b:operational -- live-negative \
  --candidate-release-id <exact-clean-head> \
  --pilot-image-id <exact-post-restart-pilot-image-id> \
  --output-root output/playwright/m1-b-p0-5 \
  --negative-case human:expired_offer

pnpm run acceptance:m1-b:operational -- live-negative \
  --candidate-release-id <exact-clean-head> \
  --pilot-image-id <exact-post-restart-pilot-image-id> \
  --output-root output/playwright/m1-b-p0-5 \
  --negative-case human:unauthorized_subject

pnpm run acceptance:m1-b:operational -- live-negative \
  --candidate-release-id <exact-clean-head> \
  --pilot-image-id <exact-post-restart-pilot-image-id> \
  --output-root output/playwright/m1-b-p0-5 \
  --negative-case authorization:cross_role_private_read

pnpm run acceptance:m1-b:operational -- negative-run \
  --candidate-release-id <exact-clean-head> \
  --pilot-image-id <exact-post-restart-pilot-image-id> \
  --output-root output/playwright/m1-b-p0-5

pnpm run acceptance:m1-b:operational -- collect-pre-risk \
  --candidate-release-id <exact-clean-head> \
  --pilot-image-id <exact-post-restart-pilot-image-id> \
  --output-root output/playwright/m1-b-p0-5
```

   `expired-offer-setup` creates lineage C through the existing real Human and
   Capital Partner browser sessions and seals its physical expiry and unchanged
   current-Offer proof. Immediately before its first authoring action the mode
   permanently arms a separate `0600`, non-overwriting safety latch containing
   only candidate/runtime intent and critical-artifact hashes. It is not one of
   the Evidence artifacts. A latch without its valid matching receipt is an
   unrecoverable ambiguity: do not retry the action; recut the candidate. A
   matching latch and receipt makes duplicate invocation a read-only refusal.

   The three `live-negative` commands collect the only interactive live cases.
   `human:replaced_stale_offer` is derived byte-for-byte from the sealed Capital
   Partner critical receipt and must not be replayed in a browser. `negative-run`
   executes the ten destructive, replay-sensitive, or retained-state-impossible
   cases through `exact_source_disposable_postgres`, the changed-version case
   through `exact_source_ui_binding`, and signed-out through
   `exact_source_transport`. It runs from the same exact tracked archive and OCI
   image, seals every raw TAP log, and never operates on the retained PostgreSQL
   database for those cases.

   Finally, `collect-pre-risk` validates all 16 unique negative receipts and
   interactively collects the exact 24 browser rows through 33 builder-issued
   prompt/expression challenges. The browser returns only the closed safe
   measurement for the current prompt; the builder owns every timestamp,
   immediately reconciles each authenticated private read to its exact two
   PostgreSQL allow audits and SIWE binding, and seals one real `0600` PNG for
   every phase. Never feed request headers/bodies, cookies, CSRF material,
   session data, wallet signatures, credentials, or PII. Journey receipts take
   no operator steps or timestamps: the Human and Capital Partner steps are
   derived from their critical receipts, while the first ten Principal/Agent
   steps bind the exact pre-restart Agent acceptance plus application/runtime
   MCP receipts and are only reconciled read-only after restart. Those economic
   actions are not replayed. All other positive actions are post-restart. The
   exact pre-Risk set is 148 artifacts, including 81 browser artifacts; the
   canonical set is exactly 151 after adding the pre-Risk receipt, Risk receipt,
   and final closure receipt. All cases bind the same candidate SHA, tree,
   image, closed registry, and source digests, and no disposable, UI-binding,
   or transport Evidence is relabeled as live. Do not restart again.
10. From the clean exact candidate and the same post-restart port base, run the
    tracked Risk producer, complete the prompted fresh SIWE ceremony in the
    existing Risk origin, and collect its split-provenance post-restart
    fail-closed receipt:

```sh
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> \
IPO_ONE_M1_B_PORT_BASE=<same-port-base> \
pnpm run local:risk:mfa-boundary
```

   Do not hand-author the receipt or expose hosted Risk.
11. If Primary is separately authorized and deployed, collect its eight
    exact-SHA hosted Principal/Agent rows. Otherwise
    record the strict `deployment_pending` state with no deployed SHA.
12. After the Risk receipt is sealed, finalize the already immutable pre-Risk
    collection and verify the generated private canonical v2 Evidence document
    read-only. `finalize` must not collect or replay any operation:

```sh
pnpm run acceptance:m1-b:operational -- finalize \
  --candidate-release-id <exact-clean-head> \
  --pilot-image-id <exact-post-restart-pilot-image-id> \
  --output-root output/playwright/m1-b-p0-5

node scripts/verify-m1-b-acceptance-evidence.mjs \
  --evidence output/playwright/m1-b-p0-5/<exact-clean-head>.m1-b-p0-5-acceptance-evidence.v2.json \
  --evidence-root <repository-root> \
  --expected-sha <exact-clean-head>
```

Artifacts must remain under `output/playwright/m1-b-p0-5/`, contain no secrets,
PII, cookies, CSRF material, signatures, private keys, or database credentials,
and be bound to the same exact candidate. The final v2 manifest must contain the
exact 151-artifact closed set; missing, extra, filler, or wrong-kind entries fail.

## Required final authority state

All remain false: real funds, external funds movement, production signer,
arbitrary withdrawal, Venue writes, real Human lending, mainnet, protocol fees,
and browser credential capture.

## Current result

- v2 structural verifier and parsed critical-artifact contract: implemented.
- Historical v1 verifier: preserved and separately callable.
- Exact 21-operation policy conformance and SIWE fail-closed authorization
  regression: implemented.
- Positive exact-candidate journeys, 24-row local matrix, applicable hosted
  primary rows, and live Risk boundary receipt: pending.
- Dedicated Risk receipt producer: implemented and focused-test verified;
  real post-restart operator ceremony and runtime receipt remain pending. This
  blocks a v2 pass and does not authorize strong-MFA bypass or a hosted Risk
  surface.
