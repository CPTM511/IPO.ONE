# HYPERLIQUID-002D Audit — Durable Testnet Execution Closure

Date: 2026-08-10

Issue: `HYPERLIQUID-002D`

Implementation state: `VERIFIED_TESTNET — BOUNDED PROOF CLOSED`

Parent Phase 4 verdict: `HYPERLIQUID-002 — VERIFIED_TESTNET_CLOSED`

External Hyperliquid writes: `EXACTLY TWO TESTNET WRITES — ONE ORDER, ONE CANCEL`

Document history note: the pre-write and intermediate STOP sections below are
retained as chronological audit checkpoints. The final closure addendum is the
authoritative current state and supersedes their then-current verdicts.

## Outcome

The local pre-write boundary is implemented and verified. PostgreSQL now owns
the exact, crash-safe, non-replayable submission lifecycle; the execution
service cannot invoke the 002C Exchange transport until the exact approval,
authorization, nonce, request body and signature hashes have been atomically
claimed as `SUBMITTING`.

No external Testnet master/subaccount, fresh API-wallet address or
non-exporting signer handoff was supplied. The prior 002C metadata artifact is
also outside its five-minute freshness window. The preflight therefore returns
`BLOCKED`; no isolated signing, `/exchange` request, Testnet order, fill,
external account observation, canonical Ledger/Evidence reconciliation or
external signer retirement occurred.

## Changes

- Migration `0058_hypercore_testnet_submission_closure` adds five forced-RLS
  tables: signer handoffs, nonce heads, submission attempts, exact Founder
  approvals and append-only transitions.
- `PostgresHypercoreTestnetSubmissionRepository` supplies concurrent
  idempotent preparation, one-use approval consumption, atomic claim, terminal
  result, forced `UNKNOWN` recovery, reconciliation, retirement and closure.
- `HypercoreDurableTestnetExecutionService` validates the entire 002C envelope
  before claim, performs transport only after `SUBMITTING`, never retries, and
  provides one explicit restart recovery from in-flight to `UNKNOWN`.
- Four closed JSON Schemas cover the handoff, approval, attempt and transition
  contracts. Schema inventory is now 120.
- The v2 preflight queries exact PostgreSQL records and matches the external
  account, API-wallet, signer, execution, action, policy, metadata and approval
  hashes. Environment claims alone cannot create readiness.

The exact prepared HyperCore action is durable internal control-plane truth so
the request can be reconstructed and compared. It is not emitted as canonical
Ledger/Evidence or a provider response. SQL rejects secret-like fields, while
keys, raw signatures, raw addresses and raw Exchange responses have no durable
column.

## Testnet Proof

No Testnet proof was attempted. Consequently there is no account, signer,
execution hash, result or final external state to report or approve.

Current v2 preflight report hash:
`0x69db5c1b615c72ccf237b9f33f43de7344f85c04aabe81ac417e9ac1178af5e4`.

Current decision: `BLOCKED`.

Material missing inputs:

- exact qualified Testnet master/subaccount and role;
- fresh, distinct API-wallet address and verified external registration;
- non-exporting isolated signer reference;
- exact durable execution/action bound to those identities;
- fresh reviewed BTC metadata; and
- after readiness, the one-use Founder approval bound to the exact execution
  hash.

## Safety

- Two concurrent workers with one idempotency key converge on one preparation.
- Two concurrent claims consume one approval exactly once; only one reaches
  `SUBMITTING`.
- A second distinct action receives the next monotonic nonce; a direct attempt
  to rewrite it to the prior nonce is rejected by the immutable/unique SQL
  boundary.
- Crash before claim performs no transport and leaves approval unconsumed.
- Crash after claim but before transport leaves `SUBMITTING`; restart can only
  recover it to `UNKNOWN`.
- Timeout or lost response becomes durable `UNKNOWN`; a second submission is
  denied and transport call count remains one.
- Crash after remote acceptance but before local result persistence also
  recovers to `UNKNOWN`, never to a retryable state.
- Changed account, signer, action, policy, expired approval, expired/retired
  signer, replayed request and duplicate economic action fail closed.
- Forced RLS hides every 0058 row across Tenants. Transition deletion, delegate
  tombstone deletion and populated 0058 downgrade return SQLSTATE `23514`.
- Durable tests find no raw master, subaccount or API-wallet address in any
  0058 submission, approval, handoff or transition row.

## Reconciliation

The synthetic PostgreSQL acceptance path proves the required local sequence:

`PREPARED → APPROVED → SUBMITTING → UNKNOWN → RECONCILED → CLOSED`.

Reconciliation stores independent venue-order, venue-account, Ledger,
Obligation Evidence and reconciliation hashes before signer closure. This is
fault-path implementation Evidence only; it is not a claim that external
Hyperliquid state or canonical production Ledger state was observed.

## Signer Retirement

The durable retirement path requires the matching 0057 delegate tombstone,
changes the verified handoff to `RETIRED`, records only retirement Evidence
hashes, prevents address reuse and is required before `CLOSED`.

The path passed synthetic PostgreSQL tests. No external API wallet existed in
this task, so no external deregistration, credential destruction or retirement
was performed.

## Tests

- `node --test modules/hypercore-venue-adapter/test/hypercore-durable-submission.test.js modules/hypercore-venue-adapter/test/hypercore-testnet-proof.test.js`:
  PASS, 17 tests, 0 failures.
- `pnpm test`: PASS, 841 tests, 0 failures.
- `pnpm run test:postgres`: PASS, 85 tests, 0 failures, using an isolated local
  PostgreSQL database owner under forced RLS.
- `pnpm run test:transport`: PASS, 74 tests, 0 failures when run with loopback
  permission. The restricted sandbox run produced ten `listen EPERM` setup
  errors; the identical allowed run passed every assertion.
- `pnpm run check:schemas`: PASS, 120 contracts.
- `pnpm run check:migrations`: PASS, 58 ordered up/down pairs.
- `pnpm run lint`: PASS, 630 JavaScript modules; boundary lint PASS.
- `pnpm run typecheck`: PASS, 3 package export surfaces and 72 declared runtime
  exports.
- `git diff --check`: PASS.

The aggregate `pnpm run check` passed runtime, source/boundary lint, type,
schema, OpenAPI, migration, deployment topology, provider selection,
closed-pilot operations, local-stack and all 44 M1 Constitution requirement
gates. It then stopped at the pre-existing sealed-candidate branch assertion:

```text
actual:   codex/checkpoint-20260727-pre-strategy
expected: codex/m1-b-deployable-sandbox
```

No HYPERLIQUID-002D implementation or security assertion failed.

## Residual Risks

- External account ownership and account/subaccount role are unverified.
- No fresh API wallet has been externally registered, isolated or retired.
- Metadata, risk and account observations must be refreshed immediately before
  preparing the exact execution and again before write as required by policy.
- Hyperliquid may accept an action while its response is lost; this is why the
  design intentionally stops at `UNKNOWN` and requires independent observation
  rather than retry.
- External order/fill/account truth, canonical Ledger impact and final Evidence
  remain unproven until the bounded Testnet proof is actually executed.

## Phase 4 Verdict

`HYPERLIQUID-002` remains `IMPLEMENTED_UNVERIFIED`.

Do not claim `READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL` yet. Once the exact
external account and fresh signer handoff are supplied, continue this same
`HYPERLIQUID-002D` issue, prepare one exact durable action, refresh metadata and
return once at that gate. Do not begin Phase 5.

## 2026-08-09 external registration and balance addendum

One Founder-approved API-wallet registration attempt was completed through the
official Hyperliquid Testnet UI for the reviewed account, agent name
`ipo-one-002d` and API-wallet address hash
`0x1d1911fcbdb3809a1530f1e0740e23e04ff795239f0b497674a2c756322acea1`.
Post-confirmation `userRole` observation remained `missing`.

The follow-up was read-only and found `0.0` Perp account value, `0.0`
withdrawable, no Spot balances, no positions and no open orders. The official
faucet UI reported `Already claimed mock USDC`; it did not expose another claim
and no claim, transfer or deposit was attempted. Hyperliquid's documented
API-wallet pruning rule includes a registering account that no longer has
funds, which is consistent with the observed non-durable registration result.

The safe evidence artifact is
`artifacts/testnet/hyperliquid-002d-registration-balance-observation-20260809.json`.
It stores only hashes and non-secret balance/status summaries.

Updated verdict:
`IMPLEMENTED_UNVERIFIED — BLOCKED_ACCOUNT_HAS_NO_TESTNET_FUNDS`.

No third registration attempt or Testnet Exchange write is authorized by this
addendum. A new exact approval must identify the Testnet funding source and
scope before registration can be retried; the exact order write remains a
later, separate approval.

## 2026-08-10 successful registration and PREPARED addendum

The repaired one-use registration succeeded and independent Testnet reads now
show the reviewed master as `user`, the API wallet as `agent`, `999.0` account
value/withdrawable, and no positions or open orders. Exactly one registration
request was submitted; its authorization is consumed and no retry occurred.

Fresh BTC metadata compiled one exact `$10` buy ALO at `62500`, size
`0.00016`, with expected immediate fill `0`. PostgreSQL contains one
`PREPARED` attempt and one transition, no Founder approval, no `UNKNOWN`, no
retryable state and no external submission. The positive preflight passed
15/15 checks with report hash
`0xa89d5af9128db69f6688d23739f5a5507666c42926ec68be75aa656941de82a6`.
Stale metadata and altered execution-hash negative tests both returned
`BLOCKED`.

Fresh-observation STOP verdict:
`READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL`.

Exact execution marker:
`HYPERLIQUID-002D:0x74c5a9bb0aaa1b5bba8516de249533d4c37074f189f015313eda146cf691099e`.

The attempt expires at `2026-08-10T10:08:18.282Z`; the five-minute metadata
freshness window is shorter. Stale or expired state cannot submit and requires
a newly prepared action plus a new exact approval. No order signature or
`/exchange` order request was performed by this addendum.

The metadata window elapsed at `2026-08-10T09:58:18.282Z`, so current
preflight state is again `BLOCKED`. The recorded marker is historical Evidence
only and must not be approved or reused. A later write requires a just-in-time
refresh, a new execution hash and a new exact Founder approval.

## 2026-08-10 just-in-time refresh addendum

At `2026-08-10T10:13:50.215Z`, read-only Testnet observation again returned
master `user`, API wallet `agent`, `999.0` account value/withdrawable, no
positions and no open orders. A new immutable metadata artifact recorded BTC
mid/bid/ask `65100.5 / 65098.0 / 65103.0` and hash
`0xcfd7e04f6d154295b2cef43956b45aca246e63c679777badf0dfd62c24aac1fc`.

The durable store prepared a second exact nonce with execution hash
`0x4b7c3273732982178fafe5e56c5983da6d7397d760b226a5538b88584589b5d8`.
The action remains one BTC buy ALO at `62500`, size `0.00016`, exact maximum
notional `10` Testnet USDC and expected immediate fill `0`. Preflight passed
15/15 with report hash
`0x746436b02c0b202f93f6684cff4fba3333c9b75e42e78a5463d9086ce4dab939`.
Database readback is two attempts/two transitions, zero approvals, zero
`UNKNOWN` and zero external submissions. No signing or `/exchange` request was
performed.

The marker is
`HYPERLIQUID-002D:0x4b7c3273732982178fafe5e56c5983da6d7397d760b226a5538b88584589b5d8`.
The preparation expires at `2026-08-10T10:28:50.215Z`; metadata freshness ends
at `2026-08-10T10:18:50.215Z` and must be checked again immediately before any
write. The previous marker remains stale historical Evidence.

## 2026-08-10 exact-approval timing blocker

Founder approval for
`0xca2175cc548b3e630837ecbe19cb568fe0acb4a7772d827ac450cc2f96e5e056`
arrived inside the metadata/preparation windows but after the ten-second risk
snapshot embedded in its v1 execution hash had expired. The action authorizer
would therefore return `hypercore_testnet_risk_stale`; no approval was stored,
no signature was created and no `/exchange` request occurred.

ADR-039 is proposed to preserve the ten-second risk limit while moving dynamic
venue state into a just-in-time receipt bound at durable claim. Founder review
is required before implementation because this changes the execution approval
and risk-control identity. Current verdict remains `IMPLEMENTED_UNVERIFIED`.

## ADR-039 accepted, implemented and stopped at fresh exact marker — 2026-08-10

Founder authority covered implementation, local/mock/PostgreSQL verification
and a new marker, not `/exchange`. Stable v2 intent, exact approval, ten-second
JIT receipt, immutable `0059` persistence, atomic single-use claim and the
closed runner are present. Fixed-price JIT comparison also requires the order
to remain post-only inside `50..3500bps`.

Verification passed: domain `8/8`, focused PostgreSQL `1/1`, full PostgreSQL
runtime `28/28`, schemas `125`, migrations `59`. Canonical readback is two
stable `PREPARED` records (the earlier verification record and the final
fresh marker), zero approvals, zero JIT receipts and zero external submission
attempts across v1/v2. No signature was created.

Exact marker:
`HYPERLIQUID-002D:0x4cc4d9cf487f1877767594529eaa4271426bc2f463f1a7a533ab159316746784`.

Approval expiry: `2026-08-10T11:27:02.929Z`. Evidence:
`artifacts/testnet/hyperliquid-002d-stable-exact-preparation-20260810T111202Z.json`.

## Founder-approved 30-minute stable marker — 2026-08-10T11:56:49.663Z

Founder approval expanded only the immutable stable marker window to thirty
minutes; the JIT risk receipt remains exactly ten seconds. The new intent is
`PREPARED`, with zero approval/JIT/signature/external-submission state.

Marker:
`HYPERLIQUID-002D:0x62d522423fb1583e530851a950291598a4e369f91dab11f7efbf31ef43fbdea5`.

Expiry: `2026-08-10T12:26:49.663Z`. Evidence:
`artifacts/testnet/hyperliquid-002d-stable-exact-preparation-20260810T115649Z.json`.

## Exact write and read-only reconciliation — 2026-08-10

The Founder-approved exact v2 intent passed its fresh ten-second JIT gate and
produced one confirmed Testnet `/exchange` submission. Durable state is
`SUBMITTED` version `5`; the single Founder approval is `CONSUMED`, one JIT
receipt and five transitions exist, external submission is true and retry is
false. No raw key, signature or venue response was persisted.

Read-only venue reconciliation found the matching BTC buy ALO still resting:
price `62500`, size `0.00016`, client order ID
`0x3ec931145cbe6e36213621b50521a704`, venue order ID `57670774189`. The account
has one open order, no positions and no margin use. This proves acceptance but
not terminal close/retirement.

The one-write marker does not authorize cancellation. No second `/exchange`
call or retry occurred. Exact-cancel preparation and Founder approval, or a
later read-only natural-terminal observation, is the remaining closure gate.
Evidence is
`artifacts/testnet/hyperliquid-002d-stable-once-result-20260810T121811Z.json`.

## ADR-039 Closure Addendum prepared — 2026-08-10

Founder authority covered implementation, tests, read-only observation and a
new cancel marker only. The cancel-specific stable intent, policy, ten-second
JIT receipt, PostgreSQL parent/target linkage, one-attempt index and closed
future runner are implemented. No generic cancellation authority was added.

Verification passed: cancel domain `7/7`, focused aggregate `21/21`,
preparation `6/6`, focused PostgreSQL `2/2`, full PostgreSQL `85/85`, schemas
`128`, migrations `60`, and full unit `870/870`. Rollback rejects populated
cancel truth. The umbrella check's only stop was the pre-existing M1 snapshot
branch-name assertion.

Fresh `/info` reads found the exact resting BTC order with cloid
`0x3ec931145cbe6e36213621b50521a704`, venue order `57670774189`, one open
order and no positions. The new durable intent has one preparation transition,
no approval, no JIT receipt, no external attempt and no retry authority.

Marker:
`HYPERLIQUID-002D-CANCEL:0x1b81500360937c75dcae6a5d764076a19db7336c2484b7866350381b0dfc1b06`.

Expiry: `2026-08-10T13:30:16.193Z`. Evidence:
`artifacts/testnet/hyperliquid-002d-stable-cancel-preparation-20260810T130016Z.json`.
Current status is `READY_FOR_EXACT_CANCEL_APPROVAL`; no signature was created
and `/exchange` was not called.

## Final exact cancel, reconciliation and signer retirement — 2026-08-10

The Founder approved the fresh exact marker
`HYPERLIQUID-002D-CANCEL:0x773eb0c6262e91681ba2f526d0ece54e1397b70b8d76224361d5020fc77dc381`.
The closed runner observed the exact resting BTC order inside a new ten-second
JIT window, durably claimed the action, signed only after that gate and called
Testnet `/exchange` once. Hyperliquid confirmed the `cancelByCloid` request.
No automatic retry or second cancel attempt occurred.

An independent read-only observation then found zero open orders, zero
positions and the exact venue order `57670774189` / cloid
`0x3ec931145cbe6e36213621b50521a704` in `canceled` state. Reconciliation bound
that terminal venue truth to Ledger and Obligation Evidence. The parent order
intent and cancel intent are both `CLOSED` version `7`, each with
`external_submission_attempted=true` and `retry_allowed=false`.

The isolated signer handoff and delegate are `RETIRED`; a terminal tombstone
forbids address reuse. The isolated key file was overwritten, truncated,
unlinked and independently verified absent. This is a logical key-destruction
claim, not a storage-medium secure-erasure claim. Venue-side API-wallet
deregistration was not performed; local signing capability is nevertheless
unavailable because the key is destroyed and every local authority record is
terminal.

Final verification passed: focused closure `24/24`, complete unit `871/871`,
complete PostgreSQL `85/85`, schemas `128/128`, migrations `60/60`, and
`git diff --check`. The bounded proof made exactly two `/exchange` writes in
total: one approved order and one separately approved cancel. Post-cancel
closure used read-only venue calls and local durable transitions only.

Final Evidence:
`artifacts/testnet/hyperliquid-002d-final-closure-20260810T142835Z.json`.

Current verdict: `VERIFIED_TESTNET_CLOSED`. This closes the bounded Phase 4
HyperCore Testnet proof. It does not authorize mainnet, production, deployment,
real value, transfers, withdrawals or continued use of the retired signer.
