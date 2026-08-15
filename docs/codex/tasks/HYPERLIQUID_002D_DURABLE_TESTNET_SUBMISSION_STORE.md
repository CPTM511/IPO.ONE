# HYPERLIQUID-002D — Complete HyperCore Testnet Execution Closure

Status: `IMPLEMENTED_UNVERIFIED — EXTERNAL ACCOUNT/SIGNER HANDOFF REQUIRED`

Phase: 4 — Hyperliquid Execution

Decision authority: IPO.ONE Founder

Approved: 2026-08-08

## Context

`HYPERLIQUID-002C` completed official signing conformance, the fixed Testnet
policy, an isolated signer port and a bounded one-shot Exchange transport. Its
write preflight correctly stopped because the repository does not yet have a
crash-safe, single-use record for a real Testnet authorization and submission,
nor an approved non-logging handoff for the exact external account and signer.

The Founder has now authorized `HYPERLIQUID-002D` as the final implementation
slice for the parent `HYPERLIQUID-002` capability. This issue must complete the
durable boundary and stop before the first real Testnet `/exchange` write at
`READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL`. After a later exact approval, the
same issue continues through one bounded proof, reconciliation and signer
retirement; no `002E`/`002F`/`002G` sequence is implied.

Migration `0057` remains canonical for account binding, delegate lifecycle and
tombstones. The simulation-only `0056` tables must not be widened or relabeled
as real submission truth.

## Scope

- Add Tenant-scoped signer handoff, Founder approval, nonce head, submission
  attempt and append-only transition projections. The execution lifecycle must
  distinguish `PREPARED`, `APPROVED`, `SUBMITTING`, `SUBMITTED`, `REJECTED`,
  `UNKNOWN`, `RECONCILED` and final `CLOSED` state.
- Atomically consume the exact short-lived action authorization, human
  confirmation, nonce and submission ordinal before network I/O.
- Bind every attempt to the account binding, delegate, signer reference,
  policy, metadata, risk snapshot, prepared action and request-body hashes.
- Force crash or ambiguous transport recovery to `UNKNOWN`; never retry or
  reuse an authorization, confirmation, nonce or signature.
- Preserve one immutable transition/event trail under forced RLS and
  Tenant-context guards, with optimistic concurrency and unique replay keys.
- Compose the existing Exchange transport only after the durable transition to
  `SUBMITTING`, and require signer-free reconciliation before new risk. A crash
  after claim always recovers to `UNKNOWN`, even when the request may not have
  left the process.
- Define a non-logging operational handoff for one reviewed Testnet
  master/subaccount, one fresh API wallet and one non-exporting isolated signer
  reference. Store only hashes and opaque references.
- Add restart, concurrent replay, transaction rollback, RLS isolation,
  timeout/UNKNOWN, response-loss, post-remote/pre-persistence crash, stale or
  drifted approval, changed account/signer, expiry, retirement, nonce reuse,
  terminal immutability and populated-down-migration tests.
- Reuse canonical Ledger, Obligation and Evidence truth for final closure; no
  Venue acknowledgement may create a second ledger or bypass reconciliation.

## Non-goals

- No mainnet, production, deployment, real funds, withdrawals, transfers,
  leverage or margin changes, vault actions, builder fees or continuing
  strategy loop.
- No private key, seed phrase, raw signature, raw account address, reusable
  credential or raw Exchange response in PostgreSQL, logs or Evidence.
- No automatic `approveAgent`, API-wallet generation, deregistration or
  address reuse.
- No automatic retry, status inference from a timeout, Ledger settlement from
  an Exchange response or deletion of an `UNKNOWN` attempt.
- No Testnet write until the migration, qualified account, signer handoff and
  exact one-use human confirmation pass a new preflight.

## Acceptance criteria

1. Exactly one transaction consumes one authorization/confirmation/nonce and
   creates one `SUBMITTING` attempt; concurrent/restarted replays fail closed.
2. Any crash after consumption but before a proven terminal response recovers
   as `UNKNOWN`, blocks new risk and can only enter reconciliation.
3. Terminal attempts and their binding hashes are immutable; rollback cannot
   erase them or make an authorization reusable.
4. Forced RLS prevents cross-Tenant reads and writes, including under a
   non-superuser `NOBYPASSRLS` role.
5. Raw keys, addresses, signatures and responses are rejected from durable and
   diagnostic surfaces.
6. The down migration refuses to remove populated submission truth.
7. The Testnet proof runner remains blocked unless every `002C` and `002D`
   prerequisite is current and exactly bound.

## Pre-write STOP gate

After persistence, replay/concurrency, signer/account binding and fault tests
pass, stop once before the first real `/exchange` write. The report must name
the exact account, fresh API-wallet signer reference, exact action and hashes,
maximum exposure, expiry, current durable state, duplicate-prevention proof,
test results and remaining risks.

The required stop status is:

`READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL`

If the exact external account or signer handoff has not been supplied, report
that prerequisite precisely and remain `IMPLEMENTED_UNVERIFIED`; do not invent
or persist credentials and do not perform a partial write.

## Permission boundary

The current approval authorizes the local PostgreSQL migration, control-plane
composition, non-logging handoff contract and tests through the pre-write STOP.
It does not itself supply an account or signer, approve `approveAgent`,
authorize an Exchange request, deploy anything, or permit mainnet, production,
real value or funds movement.

Any later Testnet write requires an additional run-time readiness decision with
the exact account, API wallet, signer, fresh reads, one-use confirmation and
approved proof action present.

After that exact approval, the same issue may submit only the unchanged BTC,
ALO, maximum-10-Testnet-USDC proof, observe using the canonical master or
subaccount identity, reconcile, close any remaining order safely, retire the
API wallet and return for Founder review. It must not begin Phase 5.

## Rollback

Disable admission and signer composition first. Retain every consumed nonce,
authorization, confirmation, `SUBMITTING` or `UNKNOWN` attempt and reconcile
without resubmission. The schema may be removed only when no durable attempt
truth exists; it must never be replaced by an in-memory replay guard.

## Implementation checkpoint — 2026-08-08

The local pre-write implementation is complete:

- migration `0058_hypercore_testnet_submission_closure` adds the Tenant-scoped
  signer handoff, nonce head, exact Founder approval, submission attempt and
  immutable transition tables under forced RLS;
- the PostgreSQL repository makes preparation idempotent across concurrent
  workers, atomically consumes one approval at `SUBMITTING`, preserves
  `UNKNOWN` as non-retryable, and requires reconciliation plus a durable `0057`
  tombstone before final `CLOSED` state;
- the execution service validates the complete Exchange envelope before claim,
  performs no network I/O before durable `SUBMITTING`, and exposes only an
  explicit in-flight-to-`UNKNOWN` restart recovery path;
- crash-before-claim, crash-after-claim/before-transport, timeout/response loss,
  crash-after-remote/before-result-persistence, concurrent claim, replay,
  drift, expiry, RLS, immutable history, retirement and populated-down tests
  pass; and
- the v2 preflight reads the exact PostgreSQL attempt and returns
  `READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL` only when the reviewed external
  account, fresh signer handoff, exact action/execution and current metadata are
  present. It requires the exact one-use approval marker before returning
  `AUTHORIZED_FOR_EXACT_TESTNET_WRITE`.

No qualified external Testnet master/subaccount, fresh API-wallet address or
non-exporting signer handoff was supplied to this task. Therefore no exact
durable external execution could be prepared, the reviewed metadata is no
longer fresh, preflight remains `BLOCKED`, and no `/exchange` write, external
signing, account observation, Ledger/Evidence closure or external signer
retirement occurred. The same `HYPERLIQUID-002D` issue continues when those
inputs and the later exact Founder approval are supplied.

## External handoff checkpoint — 2026-08-09

The Founder supplied and approved one exact Testnet API-wallet registration
attempt for the reviewed account, agent name `ipo-one-002d` and API-wallet
address hash
`0x1d1911fcbdb3809a1530f1e0740e23e04ff795239f0b497674a2c756322acea1`.
The official Hyperliquid Testnet UI received the exact request and the Founder
confirmed it in the connected wallet. A read-only post-confirmation query still
returned `role: missing`.

Read-only master-account queries then established:

- Perp account value and withdrawable balance are both `0.0`;
- the Spot balance list is empty;
- there are no positions or open orders; and
- the official faucet UI reports that mock USDC was already claimed, so no
  additional faucet claim was performed.

This is a hard readiness failure. Hyperliquid documents that an API wallet may
be pruned when the registering account no longer has funds. The registration
result therefore cannot be treated as a durable delegate, and preparing or
submitting the maximum-10-Testnet-USDC proof would be invalid. The implementation
remains `IMPLEMENTED_UNVERIFIED` and `BLOCKED_ACCOUNT_HAS_NO_TESTNET_FUNDS`.

Evidence:
`artifacts/testnet/hyperliquid-002d-registration-balance-observation-20260809.json`.

No automatic retry, third registration attempt, Exchange write, order,
transfer, withdrawal, leverage or real-value action followed this observation.
A new exact approval must identify an authorized Testnet funding source before
registration is retried. The later exact BTC ALO proof approval remains a
separate gate.

## Successful registration and pre-write STOP checkpoint — 2026-08-10

The Founder approved one repaired, hash-bound API-wallet registration request:
`0x7903ed662ca1b3225ba4e57f53fac4d1fa4a289a68f05bc18df4a1fe1d30bf0a`.
The wallet signature recovered to the reviewed master account, the one-use
authorization was consumed, and exactly one Testnet `approveAgent` request
returned `REGISTERED`. Independent read-only `userRole` verification then
returned `agent`; no registration retry occurred.

The reviewed master account returned role `user`, account value and
withdrawable balance `999.0`, zero positions and zero open orders. A fresh BTC
market observation preserved asset index `3`, size decimals `5`, mid
`65081.0`, best bid `65074.0` and best ask `65088.0`. Safe artifacts are:

- `artifacts/testnet/hyperliquid-002d-api-wallet-registration-20260810.json`;
- `artifacts/testnet/hyperliquid-002d-market-metadata-20260810.json`.

An isolated local PostgreSQL store now holds one canonical synthetic active
Facility and one exact submission attempt in `PREPARED`. The proposed action is
one BTC buy ALO at `62500`, size `0.00016`, exact limit notional `10` Testnet
USDC and expected immediate fill notional `0`. Its bindings are:

- execution hash:
  `0x74c5a9bb0aaa1b5bba8516de249533d4c37074f189f015313eda146cf691099e`;
- prepared action hash:
  `0xb8f1af916471239f552442e6c946c47fabfda5c32dacdb0bd0d0a4f6aa76dd6f`;
- account binding hash:
  `0x21398d62dfc114228399ce00543ecbe2a4721b7d06fc8db3017f5e0ca17f4be8`;
- delegate hash:
  `0x2d98609ff479184904e4cbfd75962bd90f4c2fbbd1727f1dc071711a686f97da`;
- signer handoff hash:
  `0x1914e382c7b84315c9ec81300240bf305369810805e261bd0efa6519c20fa82f`;
- metadata hash:
  `0xd3dea8ead66f52d935a01a67024aca64efea15433103ea37a4c4683e94aebce0`;
- risk snapshot hash:
  `0x80f70585ed1f4ecdddd803e361a39cbf39e0926c89edd575e28e5b6c05091bff`.

The fresh preflight passed all 15 checks and returned
`READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL`, report hash
`0xa89d5af9128db69f6688d23739f5a5507666c42926ec68be75aa656941de82a6`.
Negative preflights returned `BLOCKED` for both stale metadata and an altered
execution hash. Durable readback shows exactly one attempt, one `PREPARED`
transition, one nonce head, zero Founder approvals, zero `UNKNOWN` attempts,
zero retryable attempts and zero external submission attempts.

The preparation expires at `2026-08-10T10:08:18.282Z`; its metadata freshness
window expires five minutes after `2026-08-10T09:53:18.282Z`. Expiry or stale
metadata invalidates this preparation and this exact marker must not be reused.
No order signature or `/exchange` order request has occurred. At the fresh
observation time, the required STOP status was reached:

`READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL`

The exact marker recorded as preparation Evidence was:

`HYPERLIQUID-002D:0x74c5a9bb0aaa1b5bba8516de249533d4c37074f189f015313eda146cf691099e`

At `2026-08-10T09:58:18.282Z` the metadata freshness window elapsed. The
current decision therefore automatically reverted to `BLOCKED` without any
state mutation or submission. The marker above is historical Evidence and
must not be approved or reused; a just-in-time refresh must produce a new
execution hash before any later Founder write approval.

## Fresh exact-write authorization checkpoint — 2026-08-10T10:13:50.215Z

A new read-only Testnet refresh revalidated master role `user`, API-wallet role
`agent`, account value and withdrawable balance `999.0`, and zero positions and
open orders. Fresh BTC metadata observed mid `65100.5`, best bid `65098.0` and
best ask `65103.0`. The immutable registration result was not replayed.

The local durable store created a second, non-replayed `PREPARED` nonce for the
same bounded BTC buy ALO at `62500`, size `0.00016`, exact maximum notional
`10` Testnet USDC and expected immediate fill `0`. Its execution hash is
`0x4b7c3273732982178fafe5e56c5983da6d7397d760b226a5538b88584589b5d8`
and prepared-action hash is
`0x14ec90b4e3a8f274b3f5369a581db3604ac563a1e36742e7d14b8c42bf03acc7`.
Preflight passed 15/15 checks with report hash
`0x746436b02c0b202f93f6684cff4fba3333c9b75e42e78a5463d9086ce4dab939`.

Readback after preparation shows two historical/current `PREPARED` attempts,
two transitions, zero approvals, zero `UNKNOWN` attempts and zero external
submissions. No signature or `/exchange` request occurred. The attempt expires
at `2026-08-10T10:28:50.215Z`; the current metadata freshness window ends at
`2026-08-10T10:18:50.215Z` and must be revalidated again immediately before any
authorized write.

Fresh exact marker:

`HYPERLIQUID-002D:0x4b7c3273732982178fafe5e56c5983da6d7397d760b226a5538b88584589b5d8`

The older `0x74c5...` marker remains expired historical Evidence and cannot be
reused.

## Exact-approval timing contradiction — 2026-08-10

The Founder approved execution
`0xca2175cc548b3e630837ecbe19cb568fe0acb4a7772d827ac450cc2f96e5e056`
while its metadata and preparation windows were still current. The implemented
action authorization nevertheless embeds the preparation-time risk snapshot
in the approved execution identity and allows that snapshot for only ten
seconds. The approval arrived after that ten-second risk window, so the writer
correctly did not record approval, sign or call `/exchange`.

This is an actual architecture contradiction discovered inside 002D, not a
reason to weaken staleness or reuse approval. ADR-039 proposes separating the
stable exact payload/account/signer/policy approval from a new ten-second
just-in-time venue preflight receipt. Until ADR-039 is accepted and implemented,
all recorded markers remain non-executable historical Evidence.

## ADR-039 stable-intent implementation and fresh STOP — 2026-08-10T11:01:46.425Z

The Founder accepted ADR-039 for implementation, local/mock and PostgreSQL
verification plus generation of a new marker, while withholding `/exchange`
authority. Stable v2 intent, exact Founder approval, ten-second JIT receipt,
atomic claim, migration `0059`, closed runner, schemas and tests are implemented.

The stable intent excludes mutable risk state. After approval, a fresh JIT
receipt must pass within exactly ten seconds and prove the unchanged price is
still post-only inside `50..3500bps`. Preparation observed master `user`, API
wallet `agent`, value/withdrawable `999.0`, no positions/orders, and BTC
mid/bid/ask `65086.5 / 65077.0 / 65096.0`.

PostgreSQL has two v2 `PREPARED` records (the earlier verification record and
the final fresh marker), zero approvals, zero JIT receipts and zero v1/v2
external submissions. No signature or `/exchange` request occurred.
The exact action is one BTC buy ALO at `62500`, size `0.00016`, cloid
`0xef643926e4bdc747b26ca35ddc59d780`, exact maximum notional `10` Testnet USDC.

Current verdict: `READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL`.

Exact marker:
`HYPERLIQUID-002D:0x4cc4d9cf487f1877767594529eaa4271426bc2f463f1a7a533ab159316746784`.

Approval expiry: `2026-08-10T11:27:02.929Z`. Evidence:
`artifacts/testnet/hyperliquid-002d-stable-exact-preparation-20260810T111202Z.json`.

## Founder-approved 30-minute stable marker — 2026-08-10T11:56:49.663Z

The Founder separately approved a thirty-minute stable exact-intent approval
window while retaining the exact ten-second JIT risk window. A new signer-free
observation returned master `user`, API wallet `agent`, `999.0`
value/withdrawable, zero positions/orders and BTC bid/ask `65236.0 / 65251.0`.

The immutable action is BTC buy ALO `62500 × 0.00016`, cloid
`0x3ec931145cbe6e36213621b50521a704`, exact maximum notional `10` Testnet USDC.
No approval, JIT receipt, signature or `/exchange` write was created.

Exact marker:
`HYPERLIQUID-002D:0x62d522423fb1583e530851a950291598a4e369f91dab11f7efbf31ef43fbdea5`.

Approval expiry: `2026-08-10T12:26:49.663Z`. Evidence:
`artifacts/testnet/hyperliquid-002d-stable-exact-preparation-20260810T115649Z.json`.

## Exact Testnet submission confirmed; resting-order STOP — 2026-08-10

The Founder approved the exact marker
`HYPERLIQUID-002D:0x62d522423fb1583e530851a950291598a4e369f91dab11f7efbf31ef43fbdea5`.
The closed runner passed a fresh JIT venue preflight at
`2026-08-10T12:15:39.465Z`, with the unchanged ten-second expiry and a
post-only distance of `414bps`. It signed after that gate, claimed durably,
and called Testnet `/exchange` once. The venue response was `confirmed` and
the durable state is `SUBMITTED` version `5`.

Post-run PostgreSQL readback shows the Founder approval `CONSUMED`, exactly one
JIT receipt, five immutable transitions, `external_submission_attempted=true`
and `retry_allowed=false`. Raw key, signature and response persistence all
remain false.

Read-only `/info` reconciliation matched client order ID
`0x3ec931145cbe6e36213621b50521a704` to venue order `57670774189`. The exact
BTC buy ALO is currently resting at `62500 × 0.00016`; the account has one open
order, zero positions and zero margin used. Therefore the submission is
confirmed but execution closure is not yet terminal.

No cancel or second `/exchange` write was attempted. The task is stopped at a
new authority boundary: either observe a natural terminal state read-only, or
prepare and separately approve an exact cancellation intent. Evidence:
`artifacts/testnet/hyperliquid-002d-stable-once-result-20260810T121811Z.json`.

## ADR-039 Closure Addendum implementation contract — 2026-08-10

### Context and baseline

The Founder approved implementation and marker preparation for one exact
`cancelByCloid` closure intent. The parent order submission is confirmed and
durable as `SUBMITTED` version `5`; the last read-only venue observation found
the exact BTC ALO still resting with no position. The current v2 stable engine
is order-only and therefore cannot safely reuse the order marker for a second
mutation.

The working tree contains the ongoing AECL/Hyperliquid implementation and is
not a sealed release candidate. This addendum may touch only the files required
to version the existing stable-intent kernel, persistence, schemas, runner,
tests and Evidence. Unrelated worktree changes remain untouched.

### Scope

- Add a versioned stable cancellation intent over the same PostgreSQL
  intent/approval/JIT/transition truth, linked to the exact parent intent and
  independently observed target order.
- Permit only BTC asset index `3` and client order ID
  `0x3ec931145cbe6e36213621b50521a704` through the closed preparation/runner.
- Add cancel-specific JIT validation requiring exactly one matching resting
  order, zero positions, fresh roles/metadata, no pause and no `UNKNOWN`.
- Preserve the exact ten-second JIT lifetime, thirty-minute stable marker,
  durable claim-before-I/O, one-use approval/nonce and no-retry behavior.
- Add an additive migration and closed schemas without rewriting historical
  order intents or their Evidence.
- Add a preparation command and future one-shot runner; execute only the
  read-only preparation path in this authorization.
- Generate one safe exact cancel marker and stop before signing or
  `/exchange`.

### Non-goals and permission boundary

- No cancellation write, order write, retry, modify, reduce-only order,
  position close, transfer, withdrawal, leverage change or signer retirement
  in this authorization.
- No mainnet, production, real funds, deployment, new dependency, generic
  workflow engine or second execution kernel.
- The original order marker grants no cancellation authority. The generated
  cancel marker requires a separate exact Founder approval before one Testnet
  `/exchange` call.

### Likely files

- `modules/hypercore-venue-adapter/src/hypercore-cancel-closure.js`
- `modules/hypercore-venue-adapter/src/hypercore-jit-execution.js`
- `modules/hypercore-venue-adapter/src/postgres-hypercore-stable-execution-repository.js`
- `modules/hypercore-venue-adapter/src/hypercore-stable-execution-service.js`
- `deploy/testnet/prepare-hypercore-002d-cancel-closure.mjs`
- `deploy/testnet/run-hypercore-002d-cancel-once.mjs`
- `db/migrations/0060_hypercore_stable_cancel_closure.*.sql`
- cancel intent/policy/JIT schemas and focused unit/PostgreSQL tests
- this task, ADR, audit and final Testnet Evidence

### Acceptance criteria

1. Given the exact confirmed parent order, concurrent preparation converges
   on one marker for one idempotency identity without mutating the parent.
2. Changed parent hash, cloid, market, venue order, account, signer, policy or
   payload fails before approval/signing.
3. JIT passes only for exactly one matching open order and expires after
   `10,000ms`; missing, filled, changed, duplicate, stale, paused, positioned
   or `UNKNOWN` state fails closed.
4. Concurrent claims can produce at most one external attempt for the parent;
   restart, timeout and result loss remain `UNKNOWN` and non-retryable.
5. Existing order v2 rows remain immutable and verifiable; migration rollback
   refuses to discard populated cancel truth.
6. Raw account addresses, keys, signatures and responses are absent from
   durable and repository Evidence.
7. Current live work stops at `READY_FOR_EXACT_CANCEL_APPROVAL` with zero new
   signatures and zero cancellation `/exchange` writes.

### Test commands

```sh
node --test modules/hypercore-venue-adapter/test/hypercore-jit-execution.test.js
node --test modules/hypercore-venue-adapter/test/hypercore-cancel-closure.test.js
IPO_ONE_RUN_HYPERCORE_ADR039_POSTGRES_TESTS=true DATABASE_URL=... \
  node --test modules/hypercore-venue-adapter/test-postgres/hypercore-stable-execution-repository.test.mjs
pnpm run check:schemas
pnpm run check:migrations
pnpm run test:postgres
git diff --check
```

### Security checklist

- Exact parent/order/account/signer/policy/payload binding.
- Ten-second JIT with one matching open order and zero-position proof.
- Durable one-use claim before network I/O; unique parent cancellation attempt.
- `UNKNOWN` never retryable; no automatic retry or generic passthrough.
- Secrets and raw responses rejected from persistence/Evidence.
- Testnet-only, one market, no funds/mainnet/production authority.

### Data, migration and rollback

Migration `0060` is additive and preserves all `0059` order rows. It adds only
the versioned parent/target linkage and cancel receipt admission required by
the shared stable kernel. Rollback first disables cancel admission and refuses
to remove the extension while any cancel intent exists; historical order
truth remains unchanged.

### Required completion Evidence

Record the exact cancel intent/payload/policy/target hashes, parent linkage,
fresh read-only observation, approval expiry, durable counts, test results and
explicit zero-write/zero-signature assertions in a safe Testnet artifact. The
next status must be `READY_FOR_EXACT_CANCEL_APPROVAL`, not
`VERIFIED_TESTNET`.

## Closure Addendum result — READY_FOR_EXACT_CANCEL_APPROVAL

The addendum is implemented over the existing stable execution tables. The
closed cancel variant binds the confirmed parent, exact BTC/cloid/venue-order
target, account, delegate, signer, Facility, policy, payload and durable nonce.
The later execution path preserves a ten-second JIT receipt, claim-before-I/O,
one attempted cancel per parent, no automatic retry and `UNKNOWN` fail-closed.

Verification passed: domain `7/7`, combined focused `21/21`, preparation
`6/6`, focused PostgreSQL `2/2`, complete PostgreSQL `85/85`, schemas
`128/128`, migrations `60/60`, complete unit `870/870`, and
`git diff --check`. A populated cancel row also prevented migration rollback
with SQLSTATE `23514`. The umbrella check stopped only at the existing M1
candidate-snapshot branch assertion, not in the closure implementation.

Read-only `/info` observation at `2026-08-10T13:00:16.193Z` confirmed one and
only one matching open order and zero positions. Durable readback shows the new
intent in `PREPARED` with one transition, zero Founder approvals, zero JIT
receipts, `external_submission_attempted=false` and `retry_allowed=false`.

Exact marker:
`HYPERLIQUID-002D-CANCEL:0x1b81500360937c75dcae6a5d764076a19db7336c2484b7866350381b0dfc1b06`.

Approval expiry: `2026-08-10T13:30:16.193Z`. Evidence:
`artifacts/testnet/hyperliquid-002d-stable-cancel-preparation-20260810T130016Z.json`.
No signature or `/exchange` request occurred. This issue remains at the exact
cancel approval STOP gate.

## Final closure result — VERIFIED_TESTNET_CLOSED

The Founder separately approved the fresh exact cancel marker
`HYPERLIQUID-002D-CANCEL:0x773eb0c6262e91681ba2f526d0ece54e1397b70b8d76224361d5020fc77dc381`.
One and only one Testnet `cancelByCloid` `/exchange` request was submitted after
a fresh ten-second JIT venue preflight. The response was confirmed; automatic
retry remained disabled.

Read-only reconciliation found the target BTC order canceled, with zero open
orders and zero positions. The parent and cancel stable intents were reconciled
to venue, Ledger and Obligation Evidence and then closed at version `7`. The
delegate and handoff were retired, a no-reuse tombstone was written, and the
isolated signer key was logically destroyed and verified absent. External
API-wallet deregistration was not performed, and no storage-medium secure erase
is claimed.

The final checks passed: focused closure `24/24`, full unit `871/871`, full
PostgreSQL `85/85`, schemas `128/128`, migrations `60/60`, plus
`git diff --check`. The complete bounded proof used exactly two Testnet
`/exchange` writes: the order and the separately approved cancel. No write was
made during reconciliation or retirement.

Evidence:
`artifacts/testnet/hyperliquid-002d-final-closure-20260810T142835Z.json`.

This issue is complete at `VERIFIED_TESTNET_CLOSED`. Mainnet, production,
deployment, real value, transfers, withdrawals and any new signer remain
outside this authority.
