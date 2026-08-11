# ADR-039: HyperCore Exact Approval and Just-in-Time Risk Preflight

Status: Accepted by Founder on 2026-08-10 for implementation, local/mock and
PostgreSQL verification, and preparation of a new exact marker; no Testnet
`/exchange` write authority

Date: 2026-08-10

Decision owner: IPO.ONE Founder

Delivery mode: `L3_LIVE_TESTNET`, exact-run gated

## Context

`HYPERLIQUID-002D` correctly requires one exact Founder approval and a fresh
fail-closed risk preflight before signing or submitting one bounded Hyperliquid
Testnet action. The implemented v1 identity currently includes
`riskSnapshotHash` in `PreparedAction`, `preparedActionHash` and therefore the
durable `executionHash` that the Founder must approve.

The proof policy independently requires that risk state be no more than ten
seconds old at action authorization. This creates an operational contradiction:
the exact execution marker cannot be shown to and approved by a Human before
the risk snapshot embedded in that same immutable marker expires.

The contradiction was reproduced with the real bounded proof on 2026-08-10:

- the third preparation observed risk at `2026-08-10T10:21:38.684Z`;
- its ten-second risk authority ended at `2026-08-10T10:21:48.684Z`;
- the exact Founder approval arrived at `2026-08-10T10:23:35Z`, still inside
  the separate five-minute metadata and fifteen-minute preparation windows;
- the existing authorization contract would necessarily reject it as
  `hypercore_testnet_risk_stale` before signing; and
- no approval row, signature or `/exchange` request was created.

Lengthening the risk freshness window to make chat or UI approval convenient
would weaken ADR-035 and ADR-038. Reusing an approval for a different payload,
account, signer, policy, market or exposure would violate the exact approval
gate. Neither workaround is acceptable.

## Decision

Adopt a two-receipt v2 execution identity that separates stable exact economic
intent from short-lived external-state observation without permitting payload
change.

### 1. Stable exact execution intent

Create one immutable `HypercoreExecutionIntent` whose hash binds:

- canonical master/subaccount and durable AccountBinding;
- exact API-wallet signer/delegate/handoff reference;
- exact Hyperliquid action bytes and client order ID;
- BTC Testnet environment and market identity;
- exact `10` Testnet-USDC maximum exposure and ALO behavior;
- current policy, Facility and canonical authorization hashes;
- idempotency identity, execution identity and approval expiry; and
- explicit absence of withdrawal, transfer, leverage, mainnet, production and
  real-funds authority.

The stable intent hash MUST NOT include observation timestamps or mutable venue
state. Its payload hash MUST remain byte-for-byte unchanged through signing and
submission.

### 2. Exact Founder approval

The one-use Founder approval binds the stable intent hash and every stable
material field above. A changed action, account, signer, delegate, policy,
Facility, market, notional, order type, expiry or client order ID invalidates
the approval and requires a new exact marker.

The approval does not authorize future transactions, a transaction class,
mainnet, production, withdrawals, transfers, leverage changes or real value.

### 3. Just-in-time venue preflight receipt

After exact approval and before signing, the protected writer performs fresh,
signer-free `/info` reads using the canonical master/subaccount. It creates an
immutable `HypercoreVenuePreflightReceipt` that binds:

- the approved stable intent hash;
- current master and API-wallet roles;
- current account, position, open-order and exposure hashes;
- current market metadata and book hashes;
- pause, reconciliation and `UNKNOWN` state;
- the exact unchanged action/payload hash;
- observation time and a maximum ten-second risk expiry; and
- the current five-minute metadata rule.

Any existing position/order, insufficient Testnet balance, role drift,
delegate drift, unknown outcome, pause, changed payload, changed market rules,
crossed/malformed book or stale observation denies before signing.

### 4. Atomic durable claim

The PostgreSQL claim transaction accepts only the matching tuple:

`ExecutionIntent + FounderApproval + VenuePreflightReceipt + SigningRequest`

It verifies all hashes and expiries, atomically consumes the one-use approval
and nonce, stores only safe hashes, and moves the attempt to `SUBMITTING`
before the one permitted `/exchange` call. The final action authorization hash
binds both the stable intent and the just-in-time preflight receipt.

A replay, concurrent claim, process restart, timeout, lost response or
post-remote persistence failure cannot restore approval, nonce or retry
authority. Ambiguity remains `UNKNOWN` and blocks new risk.

### 5. One-shot runner and closure

Implement one closed `HYPERLIQUID-002D` runner that:

1. validates the exact environment marker against the stable intent;
2. loads durable PostgreSQL truth;
3. performs the just-in-time read-only preflight;
4. creates and verifies the v2 receipt;
5. signs once through the isolated API-wallet port;
6. claims once and submits once with automatic retry disabled;
7. persists the normalized disposition;
8. independently reconciles order/fill/account truth using the master account;
9. records Ledger/Evidence closure; and
10. retires the signer under the already approved 002D closure rules.

The runner MUST expose no raw action input, generic Exchange passthrough,
withdrawal, transfer, leverage, arbitrary market, mainnet or production path.

## Required Implementation Changes

- introduce versioned stable execution-intent and venue-preflight contracts;
- remove dynamic `riskSnapshotHash` from the stable approval/execution identity
  while retaining it in the just-in-time action authorization and claim;
- add an additive PostgreSQL migration for v2 intent/preflight hashes and
  immutable receipts; retain all v1 attempts as historical Evidence;
- update the durable repository and execution service to require the v2 tuple;
- add the closed one-shot Testnet runner;
- update schemas, exports and Evidence composition; and
- add focused unit, PostgreSQL, concurrency, crash, UNKNOWN, replay, stale,
  drift and transport tests.

## Security Acceptance

- the ten-second risk freshness limit remains unchanged;
- the five-minute metadata freshness limit remains unchanged;
- approval cannot be transferred to another payload, account, signer, policy,
  Facility, market, exposure, order type, expiry or client order ID;
- only observation time and external state may refresh after approval;
- refreshed state that is not equal or strictly safer denies;
- no signature exists before the just-in-time receipt passes;
- claim is durable before network I/O;
- one execution identity can produce at most one external submission attempt;
- `UNKNOWN` never becomes automatically retryable; and
- raw keys, signatures, addresses and responses remain outside durable Evidence.

## Alternatives Rejected

- **Increase the risk window to five or fifteen minutes:** rejected because it
  weakens the existing pre-signing risk control.
- **Ask the Founder to approve within ten seconds:** rejected as an unreliable
  Human control and not a durable product workflow.
- **Refresh risk and reuse the old execution hash:** rejected because the v1
  hash commits to the old snapshot and reuse would be misleading.
- **Treat the prior approval as approval for a new hash:** rejected because it
  violates exact-execution approval.
- **Submit with an ad hoc shell composition:** rejected because it bypasses the
  tested durable state machine and Evidence boundary.

## Migration and Rollback

The migration is additive. V1 attempts remain immutable historical Evidence
and are never upgraded in place or made executable. Rollback disables v2 writer
admission, leaves all durable receipts and terminal states intact, reconciles
`SUBMITTING`/`UNKNOWN` read-only, and never resends an uncertain action.

## Review Gate

The Founder accepted ADR-039 on 2026-08-10 for implementation and
local/mock/PostgreSQL verification of this separation plus preparation of a new
exact Testnet marker. This acceptance does not itself authorize a Testnet
`/exchange` write. After implementation and fresh preflight, one new exact
stable execution marker must be presented and approved before the one-shot
Testnet submission.

## Implementation Evidence — 2026-08-10

ADR-039 is implemented through the pre-write STOP gate. The stable v2 intent
commits the exact account, API-wallet signer, policy, Facility, BTC ALO payload,
client order ID, nonce and approval expiry while excluding mutable venue
observations. The JIT receipt binds current roles, balances, positions, orders,
exposure, metadata and book hashes plus the unchanged payload. It expires after
exactly `10,000ms`, and the fixed price must remain post-only in the closed
`50..3500bps` band.

Migration `0059_hypercore_stable_intent_jit_preflight` supplies forced-RLS,
immutable stable-intent, approval, JIT-receipt and transition truth. The closed
runner derives the payload from PostgreSQL, performs JIT reads only after exact
approval, signs only after the receipt passes, claims durably before network
I/O and disables automatic retry.

Verification passed: unit `8/8`, focused PostgreSQL `1/1`, complete PostgreSQL
runtime `28/28`, schemas `125/125`, and migration pairs `59/59`. Two stable
preparation records exist: the earlier verification record and the final fresh
marker; both have zero approvals, zero JIT receipts, zero signatures and zero
external submission attempts. Final Evidence is
`artifacts/testnet/hyperliquid-002d-stable-exact-preparation-20260810T111202Z.json`.
The implementation stopped before `/exchange` as required.

## Founder-approved stable approval window — 2026-08-10

The Founder separately approved changing the immutable stable exact-intent
approval window from fifteen minutes to thirty minutes. This approval covers
the stable marker lifetime and preparation of a new exact marker only; it does
not authorize `/exchange`. The post-approval JIT venue preflight and risk
authorization window remains exactly `10,000ms`. Expired markers and approvals
remain non-transferable and cannot be reused.

The first 30-minute marker was prepared at `2026-08-10T11:56:49.663Z` and
expires at `2026-08-10T12:26:49.663Z`. Its exact hash is
`0x62d522423fb1583e530851a950291598a4e369f91dab11f7efbf31ef43fbdea5`.
Preparation created no approval, JIT receipt, signature or `/exchange` write.

## First accepted exact execution — 2026-08-10

The Founder subsequently approved that exact marker. The runner passed JIT
preflight at `2026-08-10T12:15:39.465Z`, signed and durably claimed the exact
payload, and called Testnet `/exchange` once. The venue confirmed submission;
PostgreSQL records `SUBMITTED` version `5`, a consumed approval, one JIT
receipt, five transitions, external submission true and retry false.

Read-only reconciliation found the ALO accepted and still resting with zero
positions. ADR-039's exact single-write authority therefore stopped the runner
before any cancellation. Terminal close requires natural terminal observation
or a new exact cancel intent and separate Founder approval; the order marker
cannot be reused for that second mutation.

## Founder-approved Closure Addendum — 2026-08-10

The Founder approved implementation, local/mock/PostgreSQL verification,
read-only venue observation and generation of one new exact cancellation
marker. This addendum does not authorize a cancellation `/exchange` write.

The addendum extends the same durable stable-intent/JIT/claim kernel with a
versioned `cancelByCloid` closure intent. It is not a new task or a generic
cancel capability. The only permitted target is the accepted BTC proof order:

- parent intent hash
  `0x62d522423fb1583e530851a950291598a4e369f91dab11f7efbf31ef43fbdea5`;
- client order ID `0x3ec931145cbe6e36213621b50521a704`;
- BTC asset index `3`; and
- the exact venue order identity independently observed from the canonical
  master account.

The stable cancel marker binds the parent intent, target order, account,
delegate, signer, Facility, policy, exact `cancelByCloid` payload, nonce and
thirty-minute approval expiry. After later exact Founder approval, its JIT gate
expires after exactly ten seconds and must observe one and only one open order
matching the bound target, zero positions, no `UNKNOWN`, no pause, current
roles and current metadata. A missing, filled, replaced, modified, additional
or mismatched order denies before signing and instead requires read-only
reconciliation or a separately reviewed risk-reducing close path.

The cancel intent is one-use, can create at most one external submission for
the parent order, and remains non-retryable. Timeout, response loss, restart or
post-remote persistence failure becomes `UNKNOWN`; it cannot restore approval,
nonce or write authority. Raw addresses, keys, signatures and venue responses
remain outside PostgreSQL and Evidence.

Implementation must stop after tests, current read-only observation and exact
marker generation. A later cancel write requires approval of that marker and
must not reuse the original order marker.

## Closure Addendum implementation Evidence — 2026-08-10

The shared stable-intent kernel now admits the closed
`hypercore_stable_cancel_intent.v1` variant and its cancel-specific ten-second
JIT receipt. Migration `0060_hypercore_stable_cancel_closure` adds immutable
parent/target linkage and a unique attempted-cancel edge without rewriting the
confirmed order intent. A populated cancel intent prevents rollback. JSONB
field order is deliberately excluded from identity comparisons; the canonical
target hash and closed target validator remain the identity boundary.

Verification passed: cancel domain `7/7`, combined focused `21/21`, cancel
preparation `6/6`, focused PostgreSQL `2/2`, complete PostgreSQL `85/85`,
complete unit `870/870`, schemas `128/128` and migration pairs `60/60`.
Concurrent preparation and signing claims converge to one winner,
loss/timeout remains non-retryable, and the PostgreSQL test aborts before
external I/O. The populated-cancel down migration failed with SQLSTATE `23514`
as required. The umbrella `pnpm check` reached an existing M1 snapshot branch
assertion unrelated to this change; it requires
`codex/m1-b-deployable-sandbox` while the current branch is
`codex/checkpoint-20260727-pre-strategy`.

Fresh read-only Testnet observation at `2026-08-10T13:00:16.193Z` found the
reviewed master/API-wallet roles unchanged, exactly one open BTC order matching
cloid `0x3ec931145cbe6e36213621b50521a704` and venue order `57670774189`, and zero
positions. PostgreSQL contains one cancel intent in `PREPARED`, one transition,
zero approvals, zero JIT receipts and zero external attempts.

Exact cancel marker:
`HYPERLIQUID-002D-CANCEL:0x1b81500360937c75dcae6a5d764076a19db7336c2484b7866350381b0dfc1b06`.

It expires at `2026-08-10T13:30:16.193Z`. No signature was created and
`/exchange` was not called. Evidence is
`artifacts/testnet/hyperliquid-002d-stable-cancel-preparation-20260810T130016Z.json`.
Current status is `READY_FOR_EXACT_CANCEL_APPROVAL`, not a completed Testnet
cancellation or terminal closure.

## Accepted exact-cancel and terminal-closure Evidence — 2026-08-10

The Founder later approved fresh cancel intent
`0x773eb0c6262e91681ba2f526d0ece54e1397b70b8d76224361d5020fc77dc381`.
The runner retained ADR-039's exact ten-second JIT window, durable claim before
I/O, one-use approval and no-retry boundary. Hyperliquid confirmed one
`cancelByCloid` write for the exact parent order; no retry was attempted.

Independent `/info` reconciliation observed the order terminal as `canceled`,
zero open orders and zero positions. The parent and cancel intents were then
bound to venue, Ledger and Obligation Evidence, closed at version `7`, and the
signer handoff/delegate were retired behind a no-reuse tombstone. The isolated
key was logically destroyed and verified absent. Venue-side API-wallet
deregistration was not performed and storage-medium secure erase is not
claimed.

ADR-039 is therefore accepted and verified for the bounded HyperCore Testnet
proof. The proof made exactly one order write and one separately approved
cancel write, with no automatic retry. It grants no mainnet, production,
deployment, real-value, transfer or withdrawal authority. Final Evidence is
`artifacts/testnet/hyperliquid-002d-final-closure-20260810T142835Z.json`.
