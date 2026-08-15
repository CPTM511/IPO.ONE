# AGENT-CREDIT-EXEC-001 — Protocol-Agnostic Agent Credit Execution Boundary

Status: `COMPLETED — L0 PASS; L3 BLOCKED AT API WALLET REGISTRATION; NO ORDER OR ASSET MOVEMENT`

Owner directive: `IPO_ONE_AGENT_CREDIT_EXECUTION_CODEX_TASK_SPEC_v0.1.md`,
2026-08-14, P0 / next vertical slice.

Base commit: `fb83a83566b136aa24159d1ab42b8db0caf9b40d`

Working branch: `codex/agent-credit-exec-001`

Delivery classification:

- implementation target: `L0_LOCAL_NO_FUNDS`;
- external readiness target: `L3_LIVE_TESTNET` preflight only;
- production/mainnet/real-value authority: prohibited;
- Hyperliquid Testnet write authority: not granted by this Issue.

## Context and current baseline

IPO.ONE already has one shared Subject, PrincipalRelationship, Mandate, Credit
Intent, Offer, Obligation, Facility, Ledger, repayment, servicing and Evidence
kernel. It also has existing Hyperliquid/HyperCore modules for read-only venue
information, synthetic Facility funding, policy-gated execution, risk,
reconciliation, settlement and previously bounded testnet adapter work.

The new Founder-directed task requires those capabilities to be composed into
one protocol-agnostic external-Agent lifecycle without creating a second credit
or trading kernel. The current Product Constitution v1.1 has
`REQ-TRADE-001..004` but no requirement that explicitly authorizes the target
architecture for purpose-bound delegated venue-write execution. Governance
must therefore add `REQ-TRADE-005` and `DEC-AGENT-VENUE-EXEC-001` before any L3
runtime claim.

The source worktree at `/Users/cptmao/Documents/IPO.ONE` contained material
uncommitted Founder/user work when this Issue started. This isolated checkout
uses only the exact committed base above and must not copy, overwrite or claim
those uncommitted changes.

## Ordered-program exception

This Issue is an exception to Product Engineering and Experience Standard v1.0
section 14 because the 2026-08-14 Founder P0 directive explicitly names this as
the next vertical slice. Continuing the older order would prevent implementing
the newly directed Agent Credit Execution Boundary.

Added risk: the slice crosses existing Trading Capital, authorization, risk,
venue and settlement modules and could duplicate or silently broaden them.

Compensating controls:

- reuse the shared kernel and existing operation contracts;
- add no production dependency or microservice;
- keep all L0 venue effects deterministic and synthetic;
- deny unknown, transfer, withdrawal, stale, ambiguous and mainnet actions
  before any signer boundary;
- add governance as architecture-approved/runtime-gated only;
- require a separate exact run-id approval for every future L3 write;
- preserve exact requirement mapping and executable negative Evidence.

The exception expires when this Issue is completed or rolled back. Any later
L3 write remains a separate reviewed Issue/run and is not covered by this
exception.

## Scope

1. Add the versioned governance requirement and decision without reinterpreting
   an existing requirement.
2. Define or reuse generic `CreditProvider`, `ExecutionVenue`,
   `ExecutionPolicy` and isolated `Signer` boundaries.
3. Add one isolated reference economic Agent that depends only on intentionally
   exported machine interfaces and never imports IPO.ONE domain/database
   internals.
4. Compose the existing shared credit lifecycle through a purpose-bound Trading
   Capital Facility into deterministic L0 execution, close, reconciliation,
   repayment and performance Evidence.
5. Enforce a versioned server-controlled Facility authorization envelope for
   Hyperliquid Testnet profile semantics while keeping L0 effects synthetic.
6. Implement deterministic order correlation, idempotency and restart/replay
   recovery across the required checkpoints.
7. Prove repayment-first settlement, residual-release ordering and a truthful
   partial-repayment/loss case.
8. Add the complete negative authorization matrix with typed denial Evidence
   and zero adapter/economic mutation.
9. Add L3 preflight/run-once/reconcile/emergency-close commands that fail closed
   without the exact run-id approval, in CI, for mainnet, unknown venues/actions
   or unavailable signer isolation. Do not execute a testnet write in this
   Issue.
10. Provide current executable Evidence and a local clickable Founder review
    experience.

## Non-goals

- mainnet, real USDC, real lending, LP capital or any real-value movement;
- a production Hyperliquid account, credential, signer, custody or risk limit;
- approval or execution of a Hyperliquid Testnet write;
- Agent access to `capitalController`, `venueApiSigner` or arbitrary signing;
- withdrawal, transfer, bridge, staking, vault, Strategy Vault or residual
  release before canonical repayment and reconciliation;
- proprietary strategy, alpha, portfolio optimization, copy trading or fund
  management;
- a second Trading Ledger, Obligation, Evidence stream or credit lifecycle;
- a new microservice, database, queue, framework or production dependency;
- L4/L5 activation or automatic promotion from L0/L3.

## Files likely to modify

Governance and issue:

- `docs/PRODUCT_CONSTITUTION.md`
- `docs/codex/tasks/AGENT_CREDIT_EXEC_001_PROTOCOL_AGNOSTIC_AGENT_CREDIT_EXECUTION.md`
- a subordinate architecture/security runbook only if the implementation needs
  exact clarification.

Application and boundaries:

- focused files under `modules/hyperliquid-*`,
  `modules/hypercore-venue-adapter`, `modules/tenant-command-gateway`, and
  intentionally exported Agent API/SDK/MCP boundaries;
- one isolated reference Agent package/app;
- versioned L0/L3 policy configuration;
- focused scripts under `scripts/` or `deploy/testnet/`;
- `package.json` scripts only, with no new dependency.

Tests and Evidence:

- focused unit, integration, negative, loss, replay and restart suites;
- `artifacts/agent-credit-exec-001/` for redacted generated Evidence.

The likely-file list will be narrowed after reuse analysis. Touching schema,
migration, API catalog or traceability files requires documenting the exact
need before the edit.

## Acceptance criteria

### Governance and independence

- Given the current requirement registry, when governance is inspected, then
  `REQ-TRADE-005` and `DEC-AGENT-VENUE-EXEC-001` exist with
  `ARCHITECTURE_APPROVED_RUNTIME_GATED`, earliest `L3_LIVE_TESTNET`, and no
  L4/L5 authority.
- Given the reference Agent, when its dependency graph is inspected, then it
  uses only public/intentionally exported wallet and machine interfaces and no
  IPO.ONE database/domain/server-only implementation.
- Given a replacement CreditProvider or ExecutionVenue fixture, when the L0
  lifecycle runs, then the canonical kernel requires no redesign.

### Shared lifecycle and controlled capital

- Given an authenticated external economic Agent wallet and active Principal
  Mandate, when an exact Offer is accepted, then one canonical Obligation and
  one purpose-bound Facility are created through the shared lifecycle.
- Given financed synthetic capital, when the Agent requests execution, then it
  receives only an opaque constrained execution capability; neither controller
  nor venue signer key is observable.
- Given a permitted BTC, 1x, bounded-notional L0 intent, when policy authorizes
  it, then one deterministic open/confirm/reduce-only-close cycle is recorded
  with stable correlation references.

### Fail-closed policy and risk

- Given every action in the task's mandatory deny matrix, when requested, then
  authorization returns typed denial Evidence before signing or adapter
  invocation and causes zero economic mutation, retry or authority expansion.
- Given unknown, stale, expired, revoked, frozen, cross-Tenant, over-notional,
  over-leverage, over-drawdown, unreconciled or mainnet state, when execution is
  requested, then new risk is denied.
- Given emergency freeze, when recovery runs, then new execution is rejected,
  permitted close/cancel is bounded, Evidence is preserved and residual release
  remains blocked until reconciliation.

### Settlement, loss and durability

- Given a reconciled profitable/even L0 cycle, when settlement runs, then the
  order is close, cancel, reconcile, canonical repayment, then residual release.
- Given Facility 100 and final equity 96, when settlement runs, then repayment
  is 96, remaining outstanding is 4 and Obligation/Performance/Credit/Risk/
  Servicing state truthfully remains adverse or unsettled.
- Given restart after each required checkpoint, when the process resumes or a
  request replays, then no duplicate funding, order or repayment occurs and no
  stale authority is resurrected.
- Given an unexplained venue/Ledger mismatch, when reconciliation runs, then the
  state is `RECONCILIATION_BLOCKED` and new risk is prohibited.

### L3 readiness

- Given a missing/wrong approval, CI, mainnet URL, unknown venue/action or
  unavailable isolated signer, when an L3 command starts, then it fails before
  any write.
- Given reviewed configuration but no exact run-id approval, when preflight
  completes, then status is at most `READY_FOR_L3_APPROVAL`; it is never
  `L3_VERIFIED`.

## Test commands

Required focused commands (repo naming may be implemented as aliases):

```sh
pnpm test:agent-credit
pnpm test:venue:hyperliquid
pnpm test:venue:policy
pnpm test:e2e:agent-credit
pnpm test:e2e:agent-credit:negative
pnpm test:e2e:agent-credit:restart

pnpm testnet:hyperliquid:preflight
pnpm testnet:hyperliquid:run-once
pnpm testnet:hyperliquid:reconcile
pnpm testnet:hyperliquid:emergency-close

pnpm run lint
pnpm run typecheck
pnpm run check:schemas
pnpm run check:openapi
pnpm run check:tenant-protocol
pnpm run check:product-traceability
pnpm run check
git diff --check
```

L3 commands are gate tests only in this Issue and must not submit an external
write.

## Security checklist

- [x] `economicAgentWallet`, `capitalController`, `venueApiSigner` and
  `ipoOneSubject` remain separate identities.
- [x] Agent never receives controller/signer keys or arbitrary-signing input.
- [x] All venue/account/action/market/notional/leverage/expiry limits are
  server-derived from a versioned profile.
- [x] `UNKNOWN_ACTION => DENY` and every named transfer/withdrawal action denies
  before signing.
- [x] Raw target, calldata, venue action, recipient or ExpectedEffects cannot be
  supplied by the Agent.
- [x] Current Mandate, Facility, freeze, reconciliation and Tenant state is
  revalidated at the command boundary.
- [x] Commands are idempotent and unknown outcomes reconcile before retry.
- [x] No raw key, signature, credential, private policy, PII or sensitive input
  enters Git, logs, Evidence, database, browser, prompt, telemetry or CI.
- [x] Mainnet and real-value behavior is structurally denied.
- [x] Typed durable Evidence proves denials and significant transitions.
- [x] No test weakens an existing invariant.

## Permission boundary

The Founder directive authorizes implementation and deterministic testing of
the L0 no-funds slice plus documentation/tooling that can become ready for a
later L3 approval. It does not authorize creation/use of an external signer,
account registration, venue write, testnet asset movement, deployment,
production credential, mainnet or real value.

Every future L3 signer/account/run requires a new exact approval such as:

```text
IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN=<exact-run-id>
```

No environment variable value is treated as approval unless it matches the
reviewed run record and all preflight Evidence is current.

## Data and migration impact

The preferred L0 implementation uses existing canonical persistence and adds no
new migration. If durable order correlation or restart proof cannot be
represented without schema change, add one forward-only SQL-first migration,
forced-RLS coverage, rollback/down behavior and restart Evidence in this Issue
before editing the migration catalog.

No raw venue response or signing material may be persisted.

## Rollback plan

1. Disable the Agent Credit Execution profile and all L3 command aliases.
2. Remove the isolated reference Agent and focused composition code.
3. Revert additive governance/decision text through a new reviewed governance
   version; do not silently delete historical approval records.
4. Preserve append-only Evidence and mark superseded/invalidated records rather
   than deleting them.
5. Re-run the pre-Issue shared-kernel and venue suites to prove no regression.

No external transaction or real/testnet value movement is expected, so no
onchain rollback is authorized or required in this Issue.

## Required Evidence

- exact base and final commit SHAs;
- requirement-to-file/test mapping;
- focused and aggregate command results with counts/failures/skips;
- individual negative authorization results;
- restart/idempotency checkpoint results;
- redacted L0 lifecycle and loss-case receipts;
- L3 status exactly `NOT_ATTEMPTED`, `READY_FOR_L3_APPROVAL` or `BLOCKED`;
- explicit funds truth;
- working loopback product experience URL kept available for Founder review;
- exact remaining blocker and next smallest Founder decision.

## Dependency and sequencing notes

1. Governance and reuse inventory precede behavior changes.
2. L0 composition and policy precede L3 tooling.
3. Positive flow, deny matrix, loss settlement and restart proof must all pass
   before L3 readiness can be claimed.
4. L3 external writes are a separate future gate even when all local tests pass.

## Completion Evidence

Implementation completed on 2026-08-14 from the exact base recorded above.
The final commit SHA is reported by the completion handoff after the Evidence
document is committed; no prior testnet result is used as current Evidence.

Implemented result:

- independent reference Agent imports only generic `CreditProvider` and
  `ExecutionVenue` ports;
- shared Principal/Mandate/CreditIntent/Offer/Obligation/Ledger/Facility/
  repayment/Evidence kernel remains canonical;
- four identities are hash-separated and no raw wallet, key, signature or
  response is durably retained;
- profitable L0 path ends `SETTLED` with 1,000 repaid, 0 outstanding and 100
  released only after repayment;
- loss L0 path ends `PARTIAL_REPAYMENT` with 960 repaid, 40 outstanding and 0
  residual released;
- open/close uses two simulated, idempotent execution records and one
  reconciled canonical repayment;
- every mandatory denied action and mutation records zero external submission,
  zero economic mutation, zero authority expansion and no silent retry;
- Facility/funding, prepared action, execution, reconciliation and repayment
  restart/replay checkpoints preserve single economic effects;
- HyperCore compiler/policy now supports the approved `scheduleCancel` action
  only with an exact timestamp from 5 seconds ahead through the bounded proof
  window;
- L3 preflight reports `READY_FOR_L3_APPROVAL`; all write/read-follow-up
  commands fail before network without exact account/signer/run/action inputs.

Executable verification:

| Command | Result | Tests / checks | Failures | Skips |
|---|---:|---:|---:|---:|
| `pnpm test:agent-credit` | PASS | 41 | 0 | 0 |
| `pnpm test:venue:hyperliquid` | PASS | 79 | 0 | 0 |
| `pnpm test:venue:policy` | PASS | 69 | 0 | 0 |
| `pnpm test:e2e:agent-credit` | PASS | 2 | 0 | 0 |
| `pnpm test:e2e:agent-credit:negative` | PASS | 34 | 0 | 0 |
| `pnpm test:e2e:agent-credit:restart` | PASS | 2 | 0 | 0 |
| `pnpm test` | PASS | 1,080 | 0 | 0 |
| `pnpm lint` | PASS | 717 JS modules + boundary rules | 0 | 0 |
| `pnpm typecheck` | PASS | 3 surfaces / 72 exports | 0 | 0 |
| `pnpm check:schemas` | PASS | 136 contracts | 0 | 0 |
| `pnpm check:openapi` | PASS | 21 paths / 21 operations | 0 | 0 |
| `pnpm check:tenant-protocol` | PASS | 102 operations | 0 | 0 |
| `pnpm check:product-traceability` | PASS | 102 bound operations | 0 | 0 |
| `pnpm check` | PASS | aggregate gates + 1,080 tests | 0 | 0 |
| `git diff --check` | PASS | working diff | 0 | 0 |

L3 command truth:

- `pnpm testnet:hyperliquid:preflight` without explicit venue, environment and
  origin: expected `BLOCKED`, no external request;
- the same preflight with the exact explicit Hyperliquid Testnet environment:
  PASS, `READY_FOR_L3_APPROVAL`, no external request;
- `run-once`: expected fail-closed because run ID, exact approval, account,
  distinct signer reference and allowlisted action are absent;
- `reconcile`: expected fail-closed for the same unapproved run binding;
- `emergency-close`: expected fail-closed plus no restrictive approved action;
- real funds moved: false;
- mainnet interaction: false;
- testnet asset used: false.

Evidence paths:

- `artifacts/agent-credit-exec-001/l0-acceptance-evidence.json`;
- `artifacts/testnet/agent-credit-exec-001-l3-readiness.json`;
- `modules/agent-credit-execution/test/agent-credit-execution.e2e.test.js`;
- `deploy/testnet/test/agent-credit-hyperliquid-l3-gate.test.js`.

Founder review experience: `http://127.0.0.1:4177/`. Browser verification
proved the page loads without console errors and both healthy and loss controls
render the expected current L0 outcomes. The loopback process remains available
for review; it is not a deployment or L3/real-value authorization.

## PRE-L3 security seal correction — 2026-08-14

Founder approval permits one correction over base candidate
`ead36574b65820154415bd958e96534d906a0c4d`: remove implicit L3 execution
environment defaults and bind the exact environment authority into immutable
preparation and idempotency identity.

The corrected boundary requires the operator to provide all three exact values:

- venue `hyperliquid`;
- environment `testnet`;
- origin `https://api.hyperliquid-testnet.xyz`.

Missing, empty, unknown, malformed, case-ambiguous, or mainnet values deny both
preflight and write-operation gates. The environment, account, Facility,
Obligation, Authorization, policy, action, market, notional, leverage, expiry,
signer reference, and run bind one immutable no-write preparation identity.
Submission-bound revalidation rejects environment drift as
`EXECUTION_ENVIRONMENT_DRIFT` and other bound-field drift as
`EXECUTION_PREPARATION_DRIFT`; neither path creates a signature, invokes an
adapter, submits externally, mutates economics, expands authority, or retries.

The incomplete pre-fix L3 handoff in the local stash is stale and non-
authoritative. It must not be restored as execution input. A later handoff must
be regenerated from the new pushed security candidate after a separate Founder
approval. This correction does not register a signer, activate L3, move an
asset, submit a venue request, execute an order, settle, merge, or broaden
`REQ-TRADE-005`.

## First bounded L3 attempt — 2026-08-15

Founder approval bound one Hyperliquid Testnet attempt to run
`agent-credit-exec-001-l3-20260814-001` and candidate
`ffbcae38fedcb6dbcc4b2da538a2636df0836fde`. The exact preparation and
registration-preflight dry-run passed with BTC capped at USD 10 notional, 1x
maximum leverage, one position and one trade cycle. The reviewed master account
was a Testnet `user` with 999 Testnet USDC account value/withdrawable, zero
positions and zero open orders. The isolated API wallet was initially
`missing` and had not been reused from another run.

One exact `approveAgent` registration request was signed by the reviewed master
and submitted to Hyperliquid Testnet. The venue returned `REJECTED`; the
one-use local authorization was consumed, the API wallet remained `missing`,
and no corrected registration request or automatic retry was attempted. The
redacted response hash is retained, but the raw response was intentionally not
persisted, so this record does not infer an unproven rejection reason.

The post-registration hard-check dry-run failed only
`signerRegistration`. All other environment, preparation, isolation, Facility,
Mandate, Authorization, reconciliation, balance, mainnet, withdrawal and
transfer checks passed. Execution therefore stopped before any order
signature. No order, fill, position, close, cancel, repayment or Obligation
settlement occurred; zero Testnet assets, real funds or mainnet funds moved.

Current L3 truth is `BLOCKED`, not `L3_VERIFIED`. No replay or second run is
authorized. Durable redacted Evidence:
`artifacts/testnet/agent-credit-exec-001-l3-registration-blocked-20260815.json`.
Post-stop verification passed 1,087 full-repository tests, 721-module source
lint, 136 Schema checks, the 72-export contract typecheck, focused Agent Credit,
venue-policy, Hyperliquid, negative and restart suites, `git diff --check`, and
an exact signer-secret scan across 1,777 repository files.

## Founder-confirmed bounded L3 verification — 2026-08-15

The Founder confirmed that, before execution, explicit approval had been given
for the exact Hyperliquid Testnet run
`agent-credit-exec-001-l3-20260815-003`, reuse of the reviewed isolated API
wallet signer for that run, policy
`agent_credit_hyperliquid_testnet.v2`, and a USD 12 maximum-notional ceiling.
This exact approval superseded the earlier no-replay statement only for run
`...-003`; it did not authorize any additional registration, retry, signer
reuse, trade cycle, mainnet action, deployment, real funds or production
authority.

Candidate `b78f37a1f8dfd12c6011b23722874b740aed33be` corrected the venue-minimum
sizing boundary so the prepared BTC IOC opening quantity had to be strictly
above USD 10 and no greater than USD 12 at the current venue precision. The
exact approved run then completed one filled BTC opening order and one filled
reduce-only close. Recorded opening limit notional was USD 10.18272. Terminal
reconciliation found zero positions and zero open orders, with no automatic
retry or second cycle.

The venue reported a cross-leverage setting of 20 while the bounded position
used 0.84002667x of the USD 12 Facility allocation. The approved IPO.ONE policy
and runtime checks remained capped at 1x actual Facility allocation leverage;
the venue setting is retained as an explicit Evidence fact and not relabelled
as a 1x venue configuration. Any future run that depends on changing or
accepting a venue leverage setting requires a separate reviewed decision.

Terminal truth for this exact run is `L3_VERIFIED`:

- Testnet assets moved: true;
- real funds moved: false;
- mainnet interaction: false;
- withdrawal, transfer and external funding transfer: false;
- Agent custody created: false;
- recorded realized Testnet PnL including fees: USD `-0.01067200`;
- controlled-account repayment allocation: 1,199 of 1,200 synthetic minor
  units, leaving 1 synthetic minor unit outstanding;
- real outstanding debt created: false.

Durable redacted Evidence is
`artifacts/testnet/agent-credit-exec-001-l3-verified-20260815.json`. Final
integrated regression recorded 1,076 tests passed, zero failed and zero
skipped. The earlier rejected registration attempt remains historically true;
its `BLOCKED` status is not the terminal status of run `...-003`.

No further Testnet run, signer reuse, retry, deployment, mainnet interaction,
production credential, funds movement or real-value action is authorized by
this confirmation or by merging the implementation and Evidence.
