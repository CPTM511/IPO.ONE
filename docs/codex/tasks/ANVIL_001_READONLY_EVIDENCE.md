# ANVIL-001 — Optional read-only Anvil LOC evidence

Date: 2026-10-07. Delivery: default-off candidate for Founder/release review.
Follow-up review: 2026-10-08. All original candidate files remain preserved.
Branch: `codex/anvil-readonly-evidence-20261007`.
Original preparation base: `01325c7546edbd50f906489b1b4212c526d78ed2` (PR88 merge).
Workspace: `/Users/cptmao/Documents/Codex/2026-10-07/task/ipo-one-anvil-evidence`.

## Context, authority and scope

The Founder requested following up on Anvil and adding it as a replaceable
building block where feasible. IPO.one's purpose here is credit history,
behavior evidence and risk analysis. An Anvil LOC is collateral-backed
assurance, not proof of good credit or repayment performance.

The isolated checkout's Product Constitution v1.6 governs this preparation:
REQ-EVID-001/004, REQ-CHAIN-001/002 and REQ-PRIV-001. The relevant
guidance-gate skill, Product Charter, engineering standard and accepted
[ADR-011](../../architecture/ADR-011-plugin-trust-boundary.md) were read.
Local memory supplied only relevant reminders about isolation and truthful
completion; another checkout's v1.7 was not imported as authority.

This task adds an explicitly imported, first-party module over the existing
Evidence envelope. No application or plugin-registry activation, parallel
kernel, migration, dependency or A2A infrastructure is introduced. Original
dirty files, `.ipo-one/bnb-002` and the separate release workspace were not
changed. Initial preparation did not authorize or perform push, merge or
deployment. The subsequent publication authorization is scoped below.

## Feasibility and independently checked public facts

- [SDK overview](https://sdk.anvil.xyz/) still describes partner preview.
  SDK access, commercial terms and fees remain unverified; no SDK was
  installed and no access, key, partner package or outreach was requested.
- [Official contract source](https://github.com/AcronymFoundation/anvil-contracts/tree/ced9166b130ad2bbe901070a7a50421090e06eb2)
  is pinned at `ced9166b130ad2bbe901070a7a50421090e06eb2`, committed
  2026-09-24. The contract declares 3.0.0 and public view `getLOC(uint96)`.
- [Official README](https://github.com/AcronymFoundation/anvil-contracts#mainnet-contract-addresses)
  lists Ethereum LOC proxy `0x14db9a91933ad9433e1a0db04d08e5d9ef7c4808`
  and singleton `0x6c22bea8930980c6c5b4f9c449da0964edcaa33b`.
- [Proxy explorer](https://etherscan.io/address/0x14db9a91933aD9433E1A0dB04D08e5D9EF7c4808)
  currently points to that singleton.
- [Verified implementation source](https://etherscan.io/address/0x6c22beA8930980C6C5B4f9c449DA0964eDCAa33B#code)
  contains 3.0.0. Its `LetterOfCredit.sol`, `LetterOfCreditStorage.sol` and
  `ILetterOfCredit.sol` match the pinned GitHub files after line-ending and
  surrounding-whitespace normalization. All seven selected LOC events and
  the twelve-word `getLOC` tuple agree with the explorer ABI.
- PublicNode's keyless Ethereum RPC observed chain ID `0x1`, block
  `26141229` / `0xa64bd57e2deabb24936ca187d2ae86ba17af5414d906cd19d54db6a558ed58a7`,
  the expected EIP-1967 implementation slot, and runtime-code Keccak hash
  `0xb4974f597f5d83cb51e8440b95c191400d555c630bceb7a643b00e354982642d`
  (22,314 bytes). The previous block's slot also agreed. This is a point-in-time
  provider observation, not an independent consensus or compiler proof.
- A temporary local instance successfully read public LOC ID `1` at that
  exact canonical block using the actual adapter. It returned unknown
  business semantics, unmapped identity/obligation, unverified finality,
  unreconciled state and `creditDecisionEligible: false`. No party/Subject
  relationship was inferred; no raw state is published in the inspection
  report, only provenance and result hashes.
- The second public RPC (`eth.llamarpc.com`) returned HTTP 525. Dual-provider
  agreement was **not** verified. Complete historical upgrade intervals and
  same-block execution versions were **not** verified.

Inspection time: 2026-10-07T15:08:05.659Z. Supporting local files beside this
clone: `ANVIL_MAINNET_READONLY_INSPECTION.json`,
`ANVIL_PUBLIC_SOURCE_COMPARISON.json` and `anvil-mainnet-readonly-check.mjs`.
The inspection script is not shipped or wired into application runtime.
No public REST or native A2A endpoint was verified or invented.

## Exact changed files and composition interface

New files only:

1. `modules/chain-adapter/src/anvil-readonly-abi.js` — pinned V3 ABI fragments.
2. `modules/chain-adapter/src/anvil-readonly-evidence.js` — default-off adapter.
3. `modules/chain-adapter/test/fixtures/anvil-readonly.js` — synthetic inputs.
4. `modules/chain-adapter/test/anvil-readonly-evidence.test.js` — boundary tests.
5. This task contract and evidence report.
6. `modules/chain-adapter/src/anvil-pending-evidence-event.js` — pure pending
   event conversion, validation and bounded replay preparation.
7. `modules/chain-adapter/test/anvil-pending-evidence-event.test.js` — pure
   connection and recovery boundary tests.

The optional file is absent from general index exports and application wiring.
No package/lockfile or new dependency changes are needed; existing
`viem@2.55.0` is reused. Remove these seven files to remove the local candidate.

```js
import { createAnvilReadonlyEvidenceAdapter } from
  "./modules/chain-adapter/src/anvil-readonly-evidence.js";
const disabled = createAnvilReadonlyEvidenceAdapter();
disabled.getDescriptor(); // enabled: false, reason: anvil_disabled
```

Explicit local composition requires `enabled: true`, a trusted profile and
an injected `rpc.call(method, params) -> result` port. Required profile fields:
CAIP-2 chain, proxy, implementation address/runtime-code hash, version 3.0.0,
exact source revision, `synthetic` or `public_readonly` data mode, opaque
source reference and deployment-verification reference. References are not
themselves proof of trust. Configuration must not come from a borrower.

The module ships no endpoint, network client, credentials or signer. The port
must enforce bounded JSON-RPC envelopes/body sizes, keyless public endpoints,
no redirects and underlying cancellation. The adapter permits only seven read
methods, bounds waits/logs/topics/data and rejects unsupported EIP-1898 rather
than falling back to an unpinned latest read. Timeout fails the observation;
transport cancellation remains the injected port's responsibility.
RPC quantities are canonical hexadecimal values bounded to 256 bits before
BigInt conversion. Missing/malformed log addresses reject the receipt; only a
valid address identifying another contract can be excluded. RPC exceptions,
including provider errors claiming the adapter timeout code, are sanitized.

`observeTransaction(hash)` verifies an exact successful receipt, configured
chain, canonical block identity before/after, implementation slot/code hash,
log provenance and canonical ABI encoding. It ignores unrelated contracts;
unsupported events at the configured proxy fail the entire receipt closed.
It supports V3 creation plus cancellation, extension, conversion, partial
liquidation, redemption and collateral modification. Historical V1/V2 creation
needs a separate pinned codec/profile. It does not scan complete history.

`readLOC({locId, blockHash})` uses block-hash-pinned EIP-1898 state reads with
`requireCanonical: true`. State is block-end state; its transaction hash is
explicitly null. A zero tuple means absent **or deleted**, not default/repayment.

Outputs carry chain/contract/LOC ID, transaction/log identity for events,
block number/hash/time, distinct observation time, ABI/contract/source version,
source references and original typed facts. Integers are decimal token-base-unit
strings. Potentially private tag bytes become only a hash and byte length.
No raw provider objects, URLs or tag bytes are returned.

The shared `createEvidenceEnvelope` is used with pending source finality and
external observation identity. Replay preserves tuple/observation identity;
recorded time can change independently. State observations additionally carry
`stateInterpretation`: tag is event-only/not stored, per-LOC factor fields are
deprecated rather than current global configuration, creation history is not
established by a snapshot, and a zero tuple is absent or deleted. These are
explicit interpretation limits, not new economic judgments.
No Subject, Obligation or Payment is
derived from addresses/tags or caller-provided mapping. Finality/reconciliation
and authorized identity/obligation mapping remain separate admission work.
The injected clock must return canonical UTC ISO text with milliseconds, at
or after the observed block time. Synthetic envelopes use
`sourceSystem: anvil_synthetic_fixture`; a separately trusted public-readonly
profile uses `anvil_public_contract`. Neither label establishes verification.
The shared kernel's observation/envelope hashes identify local records; they
are not consensus proofs, signatures or provider attestations.

## Acceptance, security and semantic limits

Every output remains `unknown / unmapped / unverified / unreconciled` and
`creditDecisionEligible: false`. Redemption does not equal repayment;
cancellation does not equal debt cure; conversion/liquidation does not equal
loan default. LOC balances do not establish good credit, solvency or valuation.
V3's deprecated per-LOC factor fields do not represent current global factors.

`versionVerification: block_end_bytecode_match` describes only the inspected
block-end implementation. It does not attest which implementation executed a
transaction during a same-block upgrade. Live event admission needs reviewed
upgrade intervals or exact tracing/exclusion of ambiguous blocks. Detected
reorgs reject observations; no persisted records or invalidations are written.

Acceptance tests require zero calls when disabled; precise facts when valid;
closed failure for chain/version/code mismatch, removed/duplicate/malformed
logs, noncanonical encoding, failed receipts, invalid IDs/clocks, timeouts and
reorgs; independent observation time and stable replay identity; preservation
of existing shared-kernel boundaries. No private key, signature, wallet,
collateral approval, LOC transaction, new credentials, real funds, risk-policy
change, automatic decision, database write, spending or outreach occurred.

## Final local verification and remaining gates

The approved isolated pnpm 11.11.0 was reused from
`/Users/cptmao/Documents/Codex/2026-10-05/task/candidate-audit/pnpm-tool-11.11.0`;
the toolchain was not installed or modified. Existing dependency installations
were only read through local links inside this clone. Node is v26.5.0.

```sh
pnpm run check:runtime
pnpm exec node --test modules/chain-adapter/test/*.test.js modules/event-indexer/test/pool-event-indexer.test.js
pnpm run lint:boundaries
pnpm run lint:source
git diff --cached --check
```

The commands use that isolated pnpm CLI, not host pnpm. Runtime contract passed;
the initial completed combined regression passed **97/97**, including **36**
adapter tests. The 2026-10-08 follow-up passed **103/103**, including **42**
adapter tests. Timestamp edits, canonical encoding protections and all six
additional source-boundary regressions are included in the final run.
The subsequent local code review passed **111/111**, including **50** adapter
tests. Its eight added cases protect error sanitization, malformed receipt/log
identities, quantity bounds, truthful synthetic labels and state-read
reorg/version failures. Existing clock tests now also cover non-ISO text,
normalized invalid dates and observation time preceding the block.
Boundary and source lint results and final diff checks are supplied in
the handoff logs. No UI, DB or deployed product acceptance is claimed.

Remaining activation gates: source trust and reviewed deployment/upgrade
intervals; a bounded maintained public transport; independent verification,
finality/reorg/reconciliation and authorized identity/Obligation mapping;
explicit product/runtime integration review. SDK commercial access remains
unverified but is unnecessary for this module. A2A adds no needed capability.

CODE: reviewable candidate. RUNTIME: synthetic boundaries and one local public
state read verified. DEPLOYED: no. REACHABLE: explicit local import only.
VERIFIED: the stated local scope. Production/product verdict:
**BLOCKED — NOT COMPLETE**. The successful smoke read does not activate or
approve a mainnet product capability. Rollback removes the seven new files;
there is no migration to reverse. Parent review decides further integration.

## 2026-10-08 source and upgrade follow-up

The LOC implementation, storage and interface files from the newly supplied
[official commit 34ff513](https://github.com/AcronymFoundation/anvil-contracts/commit/34ff51355298b193d3df9bfb65c773cb8b0aafa1)
are byte-for-byte identical to the existing pinned commit's three files; the
pin was preserved. Source publication/merge dates do not establish mainnet
activation dates. V0 was a separate deprecated contract, not automatically a
prior implementation of the present proxy.

The six new regression cases explicitly cover: empty/exactly-512-byte V3
tags; rejection above 512 bytes; rejection of each historical creation event
(`LOCCreated`, `LOCCreatedV2`) by the V3 codec; getLOC's lack of tag and
deprecated-factor interpretation with both zero/new and retained nonzero
historical values; and zero-tuple ambiguity across distinct IDs. No historical
codec was added or enabled. Any future V1/V2 support still requires an exact
versioned source/deployment profile and separate reviewed decoding.

Two indexed upgrade claims were queried through public keyless RPCs:

| Claim | Indexed block | Transaction | Explorer observation |
| --- | --- | --- | --- |
| V3 | 25848463 | `0xe9b8757c546012e5073dda7ae3fb1c6976100f5deeac1b920c9955bfa4c4b56e` | [Page](https://etherscan.io/tx/0xe9b8757c546012e5073dda7ae3fb1c6976100f5deeac1b920c9955bfa4c4b56e) displays success, 2026-08-27 18:49:47 UTC, and proxy Upgraded to the documented V3 singleton. |
| V2 | 22920136 | `0xed27031327b691bf7b2427b0839805fbeadf76925f3846c3fbb94df6a29d7ac8` | [Page](https://etherscan.io/tx/0xed27031327b691bf7b2427b0839805fbeadf76925f3846c3fbb94df6a29d7ac8) displays success, 2025-07-14 21:35:23 UTC, and proxy Upgraded to `0x24573b112456d3a96c97fb460b436e8ca870e27e`. |

These are explorer-indexed observations, **not raw-receipt-verified upgrade
intervals**. Both PublicNode and Flashbots returned null receipt results for
both supplied hashes. Exact indexed-block log checks returned RPC errors or
timeouts. Llama returned HTTP 525. Null receipt results do not establish that
the indexed transactions are absent or invalid. No claimed canonical log,
historical slot, implementation hash or complete upgrade history was inferred
from the explorer pages. Independent raw RPC agreement remains open.

The sidecar `ANVIL_UPGRADE_READONLY_INSPECTION_20261008.json` records precise
lookup failures and source availability. `ANVIL_UPGRADE_RAW/` contains the
actual null receipt lookup results; it contains no invented receipt or log.
`anvil-upgrade-readonly-check.mjs` permits only seven public read methods and
the two supplied hashes/exact blocks; it does not scan the full chain and is
not part of the application diff. The October 7 successful current-state
inspection is preserved as historical evidence, not presented as a fresh
October 8 observation.

No new live integration is enabled. Remaining conditions are unchanged:
raw receipt/log/source-bound upgrade verification, independent source trust,
full reviewed version intervals and ambiguous upgrade-block exclusion,
maintained bounded transport, finality/reconciliation and authorized identity/
Obligation mapping, plus explicit runtime/product integration review.

## Local code review and production activation checklist

This review changed only the adapter, its boundary tests and this document.
It reproduced and repaired: provider timeout-code impersonation leaking the
original error; silent omission of logs without an emitting address; native
TypeErrors on malformed receipt/log hashes; unbounded RPC quantities;
non-ISO/inconsistent observation times; and a public-contract source label
on synthetic envelopes. No observed LOC fact was found to confer repayment,
default, Subject binding, loan-obligation binding or credit eligibility.
The default-off descriptor, explicit import boundary and unknown/pending
semantics remain intact. No runtime, schema, risk-policy or historical codec
integration was added.

The already-recorded `ANVIL_RPC_SANITY_20261008.json` (03:16:01.318 UTC) refines
the historical evidence gap: PublicNode and Flashbots agreed on chain 1, head,
both indexed block hashes/timestamps, and inclusion of each exact supplied
transaction hash. PublicNode also returned both transactions, but their
receipt lookups were null; Flashbots' transaction/receipt lookups timed out
in that run. This supports transaction inclusion, not successful execution
or an Upgraded log. The provider-side cause remains unknown. This local code
review did not repeat those network queries.

Before any separately authorized production activation, review these gates:

1. **Exact source/deployment profile:** retain the source/ABI pin and ISC
   notice, independently verify proxy/implementation/code hash, establish
   reviewed version intervals, and trace or exclude ambiguous upgrade blocks.
   The known raw receipt/Upgraded-log gap remains unresolved.
2. **Trusted bounded transport/configuration:** explicit default-off setting;
   operator-controlled profile, never borrower-supplied; keyless read-only
   endpoint allowlist, bounded responses/concurrency, no redirects, timeout
   cancellation, and sanitized diagnostics. This module supplies no transport.
3. **Evidence admission:** validate schema and shared envelope/payload hashes
   before persistence; use the tuple identity for deduplication and observation
   identity for conflicting/reorged facts. Independent verification, finality,
   reorg invalidation and reconciliation must be separate durable processes.
   Neither mutable returned objects nor their local hashes grant authority.
4. **Separate authorized mapping:** bind chain addresses/LOCs to a Subject
   and a specific Obligation only through reviewed authorization and evidence.
   Keep mapping/private records offchain with tenant and least-privilege
   controls. Cancellation/redemption/liquidation alone must never create a
   repayment/default transition or automatic credit decision.
5. **Reviewed runtime/product contract:** retain the shared Evidence kernel
   and pending/non-authorizing semantics; expose truthful disabled/unknown
   states through the existing authorized Human/API surfaces when integrated.
   An optional module or local fixture is not a shipped capability.
6. **Release acceptance/rollback:** separately approve integration and
   deployment; verify actual deployed SHA, durable replay/recovery, and
   authorized visible journeys. Until then, CODE is reviewable and local
   RUNTIME tests pass, but production remains **BLOCKED — NOT COMPLETE**.
   The current candidate can be removed by deleting its seven added files.

## Approved local pending-event connection (2026-10-08)

The Founder explicitly approved the narrow local conversion/validation layer
and tests at 06:11:55 UTC. This implementation changes only the two additional
files listed above and this existing document. The reviewed 111-test reader
baseline, original checkout, release checkout and previous patch artifacts
are preserved. No additional approval rejection occurred during these edits.

```js
import {
  createAnvilPendingEvidenceEvent, prepareAnvilPendingEvidenceBatch
} from "./modules/chain-adapter/src/anvil-pending-evidence-event.js";

// observation comes from an explicitly enabled local reader; tenantId and
// profile come from trusted composition, not chain addresses or a borrower.
const candidate = createAnvilPendingEvidenceEvent({
  tenantId, profile: reader.getDescriptor(), observation
});
const prepared = prepareAnvilPendingEvidenceBatch({
  tenantId, profile: reader.getDescriptor(), observations: [observation],
  priorRecords: previousValidatedLocalSnapshot
});
// prepared.events are candidates, not executed/committed events.
// prepared.records is a caller-held bounded JSON snapshot, not a database.
```

Both functions are synchronous and pure. They accept only closed plain data,
reject integration hooks and mapping fields, and return detached deeply frozen
records. They import only the shared domain helpers and pinned ABI; no network,
repository, application, plugin registration, callback, signer, clock, queue or
internal durable state is introduced. They cannot schedule an anchor, post a
Ledger entry or run repayment/default/credit transitions. The original reader
remains default-off and neither file is added to the general index exports.

Validation checks the exact trusted normalized profile, schema/source/ABI pin,
canonical provenance and chronology, uint widths, ABI fact field allowlists,
LOC identity, snapshot interpretation limits, observation/tuple identities,
and the entire original shared Evidence envelope. Recomputing hashes does not
permit a caller to add repayment/default/credit claims or upgrade pending,
unmapped, unreconciled or unknown state. A hash or a caller-supplied tenant ID
does not prove authorization, source independence or finality; those remain
separate activation prerequisites.

Each candidate contains a tenant-scoped event/aggregate identity, stable command
hash and idempotency key, sourceSystem, and an `event.v1` candidate with explicit
`finalityStatus: pending`. Its payload retains the complete original observation
and `evidence_event.v2` envelope under `sourceObservation`; the event payload
hash uses the existing `event_payload` domain rather than the Evidence payload
hash domain. No Subject, Obligation or Payment ID is inferred or inserted.
No canonical aggregate version is allocated by this pure layer.

Replay identity excludes delivery/recording time but retains all immutable
source facts and profile fields. The batch function fully validates caller-held
prior records, including their candidate hashes/metadata and tenant. It keeps
the first complete source receipt for duplicate facts even if a later delivery
has a different valid observation time, and emits no new candidate for that
replay. Different facts sharing a tuple reject the whole preparation; input
snapshots are never mutated and no partial result is returned. JSON serialization
and recovery preserve this behavior. This is bounded local recovery, not durable
persistence or automatic reorg invalidation/reconciliation.

Fixed bounds match the existing repository contract: at most 128 incoming
observations, 128 prior records and 128 distinct combined records; at most
64 KiB per event payload and one MiB across the retained window. Source/record
JSON is additionally bounded before hashing/cloning. Overflow rejects the
preparation; it never silently truncates or evicts recovery truth. Larger work
needs a separately reviewed partition/durable-history policy.

The 24 new tests cover all seven LOC event candidates, getLOC preservation,
tenant-scoped identities, descriptor/profile matching, source-envelope and
payload tampering, rehashed unsupported claims, ABI limits, immutable snapshots,
changed-time duplicate delivery, JSON recovery, event/state tuple conflicts,
cross-tenant/modified recovery records, exact-128/overflow boundaries, oversized
data and non-executable JSON inputs. The full related regression passes
**135/135** (the original **111** plus **24** new cases). Runtime, dependency
boundaries, source lint and diff checks are recorded in the connection handoff.
All added tests use synthetic in-memory fixtures; no historic RPC lookup was
repeated.

Production integration remains blocked. Existing chain stores require a
Payment/finality-proof contract and are not an LOC admission endpoint. The
generic PostgreSQL command repository can be adapted later, but it rebuilds
Evidence, allocates stream versions and creates anchor requirements; database
migration 0046 requires an exact anchor for every durable Evidence envelope.
Do not pass a source envelope directly to EventStore (its missing
`finalityStatus` defaults to finalized and its source is rewritten), bypass the
anchor invariant, or pass these candidates directly to a live repository.
Existing owner/auditor Evidence queries require an authorized Obligation and
cannot expose unmapped LOC observations without separately reviewed mapping or
resource authorization. No ingestion, transport, security, schema or product
surface was changed. The known receipt/Upgraded-log, version-interval, complete
transport timeout/cancellation, finality/reconciliation and mapping gaps remain.
Product verdict remains **BLOCKED — NOT COMPLETE**. To revert only this
approved increment, remove the two new files and revert this document increment.

## Draft PR publication boundary (2026-10-08)

The Founder authorized publication at 08:46:59 UTC. This isolated branch was
reconciled without conflicts onto remote main
`7e667e3d27e4db22c9cd923feb58010b914d1d46` (PR89 merge); the unchanged reviewed
135-test candidate was preserved before rebasing. Publication covers a local
commit, push, draft PR and CI verification for that exact PR head. The separate
release task owns merge order and deployment; neither is performed here.

The PR changes only the seven candidate files. It has no code dependency on the
independent record-recovery UI branch. The original dirty checkout and release
workspaces remain untouched. No dependency, package/lockfile, workflow, security
policy, schema, application registration or runtime activation is changed.
Tests use synthetic data; no historic receipt lookup is repeated. Existing
GitHub quality gates remain required, including PostgreSQL, browser and audit
checks; local component success does not substitute for their result.

Merging/deploying this code preserves the disabled reader and explicit-import
pure conversion seam. It does not enable Anvil ingestion, source verification,
Subject/Obligation mapping, reconciliation, anchors or any financial action.
The production-capability verdict and activation prerequisites above remain
unchanged. The PR handoff must identify its exact head SHA and actual CI state.

## Upstream ISC notice for ABI-derived fragments

ISC License

Copyright (c) 2024, Acronym Foundation

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
