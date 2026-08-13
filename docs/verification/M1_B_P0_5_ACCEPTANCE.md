# M1-B P0-5 exact-commit acceptance Evidence

Status: `HARNESS_READY_EXACT_CANDIDATE_PENDING`

This document is the operator ledger for the Founder-directed P0-5 acceptance.
It is not evidence that P0-5 has passed. Rows remain pending until P0-1 through
P0-4 produce one clean candidate, the canonical local and hosted PostgreSQL
runtimes identify that exact commit, and real-browser artifacts are collected.

## Truth boundary

- Canonical lifecycle: Human Web / Agent MCP / Tenant API -> Tenant Protocol ->
  Tenant Command Gateway -> shared Human/Agent kernel -> PostgreSQL.
- Local product: four consecutive loopback ports derived from the recorded
  `portBase` (default 8787; isolated exact review example 18887), built from a
  tracked Git archive of the exact candidate SHA. A generic `local-stack` build
  remains developer evidence only.
- Hosted product: exact HTTPS role origins whose `/.well-known/ipo-one.json`
  and `/readyz` documents both report the candidate SHA.
- Browser QA fixtures under `apps/web/test/support/` remain presentation and
  fail-closed UI test surfaces. They are not PostgreSQL, runtime, hosted, or
  release Evidence.
- Human-role re-login uses the invited wallet and real SIWE. Codex may drive the
  surrounding browser flow, but the Founder/operator confirms wallet prompts.
  No injected key, session replay, authentication bypass, or captured credential
  may substitute.

## Execution order

1. Confirm P0-1 through P0-4 are committed and all applicable gates pass.
2. Record exact `HEAD`, tree, tracked-clean status, migration head, and rollback
   target.
3. Build and start the local stack with
   `IPO_ONE_M1_B_RELEASE_SHA=<exact-head> IPO_ONE_M1_B_PORT_BASE=18887`.
4. Run local PostgreSQL acceptance, then run exact Agent acceptance with both
   `IPO_ONE_M1_B_RELEASE_SHA=<exact-head>` and
   `IPO_ONE_M1_B_ACCEPTANCE_PHASE=before_restart`. Preserve the private,
   phase-specific acceptance receipt for the restart comparison.
5. Use Playwright CLI or controlled Chrome against the real local four-role
   workspaces. Start a trace
   before the first interaction; use snapshots before element references; store
   redacted artifacts only under `output/playwright/m1-b-p0-5/`.
6. Complete the four journeys and the complete browser/recovery matrix below.
7. Run the Human Offer and Agent MCP fail-closed sets. Confirm zero additional
   economic effects and non-enumerating protected-resource denials.
8. Run `pnpm run local:restart` with the same exact SHA and port base, wait for
   healthy loopback forwarding, then recover all four authenticated role
   workspaces from server truth.
9. Repeat local acceptance, then run Agent acceptance with the same SHA and
   `IPO_ONE_M1_B_ACCEPTANCE_PHASE=after_restart`. Confirm canonical recovery of
   the exact pre-restart Agent lifecycle without onboarding or economic
   mutation, a later PostgreSQL process start, an empty pending outbox, and no
   duplicate effects. Authenticated read audit/replay bookkeeping may still be
   recorded.
10. Against the exact hosted candidate, repeat all eight checks for each
    actually deployed surface: Principal Agent for `primary`, plus Risk /
    Operations when the optional `risk` surface is deployed,
    record exact capability/readiness release identity, and collect redacted
    runtime/PostgreSQL receipts.
11. Produce one canonical private Evidence JSON conforming to
    `ipo.one.m1-b-p0-5-acceptance-evidence/v1` and run:

```sh
node scripts/verify-m1-b-acceptance-evidence.mjs \
  --evidence <private-evidence.local.json> \
  --evidence-root <repository-root> \
  --expected-sha <exact-clean-head>
```

Artifact paths are repository-relative `output/playwright/m1-b-p0-5/...`
paths, so `--evidence-root` must identify the exact candidate repository root.
The verifier is read-only. It checks current Git HEAD/tree/tracked cleanliness,
opens and hashes every contained non-symlink artifact, the local exact-SHA claim,
all four role journeys, all 32 local browser role/check pairs, and all eight
hosted pairs for each actually deployed surface role,
the complete negative set, restart recovery, artifact provenance/redaction,
disabled authority, and
the live hosted release identity at the actually deployed primary surface and
the Risk surface when that second reviewed project is deployed. Each browser
row needs a real-browser artifact plus a runtime/PostgreSQL receipt from that
row's exact local or hosted runtime; each journey step needs a
runtime/PostgreSQL receipt; MCP execution additionally
needs an `agent_mcp_receipt`; negatives need `negative_receipt`; restart needs
`restart_log` plus a local runtime/PostgreSQL receipt.

Local runtime identity, the complete four-role journeys, all negative cases,
and the two Agent phases must use `local_exact_commit` artifacts. The Evidence
document's `runtime.local.agentAcceptance` linkage is not accepted on metadata
alone: the CLI parses the referenced pre/post acceptance files, application MCP
receipt, runtime MCP receipt, recovery receipt, and local OCI release-identity
receipt, then compares their SHA, account, lifecycle IDs, modes, timestamps,
Provider scope, and no-funds flags.
Exact `pnpm run local:acceptance` writes the required local OCI receipt to
`output/playwright/m1-b-p0-5/<sha>.local-release-identity.json`; hash and
reference that file as the `release_identity` artifact.

## Exact Agent two-phase contract

The exact Agent drill is one candidate-bound lifecycle, not two generic Agent
runs. Use the same lowercase 40-character SHA and local port base throughout:

```sh
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> \
IPO_ONE_M1_B_ACCEPTANCE_PHASE=before_restart \
IPO_ONE_M1_B_PORT_BASE=18887 \
pnpm run local:agent:acceptance

IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> \
IPO_ONE_M1_B_PORT_BASE=18887 \
pnpm run local:restart

IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-head> \
IPO_ONE_M1_B_ACCEPTANCE_PHASE=after_restart \
IPO_ONE_M1_B_PORT_BASE=18887 \
pnpm run local:agent:acceptance
```

The pre-restart phase must identify the candidate-scoped Agent Subject
(`IPO.ONE M1-B Agent <exact-clean-head>`), its deterministic tenant/account
binding, and Mandate nonce `m1b.agent.<exact-clean-head>`. It must traverse the
real local MCP bridge and durable Gateway for controlled Provider-scoped
execution, Ledger posting, repayment, and Evidence. Its phase-specific receipt
must contain the MCP receipt; direct SDK execution or a mocked MCP handler is
not equivalent. The full private marker is
`.ipo-one/local-stack/agent-workflows/<sha>.before-restart.acceptance.json`.

The post-restart phase is recovery-only. It must perform fresh authenticated
canonical lifecycle reads and contain the recovery receipt, with no onboarding
or economic lifecycle mutation and no claim of a second MCP execution.
Authenticated read audit/replay bookkeeping may still be recorded. The SHA,
candidate marker, account binding, Subject, Mandate, Credit Intent, Credit
Offer, Obligation, Facility, and CreditLine must equal the pre-restart
identifiers, while the recovered PostgreSQL process start must be later.
Missing phase linkage or any identifier mismatch fails closed. The successful
full recovery marker is
`.ipo-one/local-stack/agent-workflows/<sha>.after-restart.acceptance.json`.

Extracted receipt names use
`m1-b-<sha>.<before_restart|after_restart>.<mandate-hash-prefix>.<type>.json`,
where the prefix is the first 24 lowercase hex characters of the SHA-256 digest
of `mandateId`. The pre-restart set includes `mcp-receipt`; the post-restart set
includes `recovery-receipt` and must omit MCP. These files are private staging
material; only redacted, secret-free, session-free receipts may be copied under
`output/playwright/m1-b-p0-5/` and referenced by the final Evidence JSON.

## Human journey

| Step | Status | Required current Evidence |
| --- | --- | --- |
| Sign in | `PENDING` | Invited wallet SIWE; redacted trace and active server session |
| Subject / Consent | `PENDING` | Actor-bound PostgreSQL resources and Events |
| Credit request | `PENDING` | Exact Intent and idempotency receipt |
| Decision / Offer | `PENDING` | Deterministic Decision plus exact Offer/hash/version |
| Reload / re-login | `PENDING` | Browser state cleared; same current Offer from server truth |
| Offer recovery / acceptance | `PENDING` | v1 and Capital Partner replacement v2 exact current binding |
| Obligation | `PENDING` | Shared-kernel PostgreSQL Obligation and schedule |
| Controlled execution | `PENDING` | Synthetic, purpose-bound, non-withdrawable execution receipt |
| Repayment | `PENDING` | Ledger allocation, outstanding update, replay-safe Event |
| Evidence | `PENDING` | Owner-authorized immutable timeline and resolvable receipts |

Human negative set: expired Offer, replaced/stale Offer, duplicate acceptance,
unauthorized Subject, wrong Tenant, changed version, and invalid acceptance
binding. Each must produce zero additional economic effects.

## Principal / Agent journey

| Step | Status | Required current Evidence |
| --- | --- | --- |
| Principal sign in | `PENDING` | Invited wallet SIWE on exact Principal origin |
| Agent Subject / account proof | `PENDING` | CAIP-10 AccountBinding and current verified proof |
| Mandate | `PENDING` | Exact bounded active Mandate and Principal Evidence |
| Agent application / Offer | `PENDING` | Direct Agent-authenticated durable Gateway receipts |
| Acceptance / Obligation | `PENDING` | Exact Offer/Mandate binding and shared Obligation |
| MCP execution | `PENDING` | Exact-SHA pre-restart MCP receipt; Provider ID/category through durable Gateway to Ledger effect |
| Repayment / Evidence | `PENDING` | Full synthetic repayment and owner Evidence read |
| Restart recovery | `PENDING` | Exact-SHA post-restart canonical recovery receipt; same IDs/account binding, later PostgreSQL start, no onboarding/economic mutation |

Agent negative set: wrong Provider, wrong Provider category, stale Mandate,
revoked Mandate, out-of-scope Facility, and replay-invalid execution. No check
may stop at a mocked MCP handler.

## Capital Partner journey

| Step | Status | Required current Evidence |
| --- | --- | --- |
| Partner sign in / workspace | `PENDING` | Invited Partner session and actor-bound Profile/Portfolio |
| Passport review | `PENDING` | Borrower-authorized exact current disclosure only |
| Author Offer | `PENDING` | `credit_offer.v2` terms, hashes, version and Event |
| Replace Offer | `PENDING` | New current Offer; prior Offer cannot be accepted |
| Withdraw Offer | `PENDING` | Unaccepted current Offer terminally withdrawn |
| Borrower current recovery | `PENDING` | Borrower restores only exact current Offer from PostgreSQL |

## Risk / Operations journey

| Step | Status | Required current Evidence |
| --- | --- | --- |
| Risk sign in / workspace | `PENDING` | Exact Risk origin and recent phishing-resistant MFA |
| Portfolio / Queue recovery | `PENDING` | Server-derived authorized locators and PII-free details |
| Protective control | `PENDING` | Explicit reason/acknowledgement and immutable freeze Event |
| Audit Evidence | `PENDING` | Queryable protective action plus subsequent denial receipt |

## Local and hosted browser and recovery matrices

Every role must pass all eight rows against the local exact-commit runtime. The
hosted matrix covers only the actually deployed canonical surfaces: `primary`
maps to Principal Agent, and optional `risk` maps to Risk / Operations. Human
and Capital Partner are not invented as hosted surfaces. The Evidence JSON uses
distinct `browser.localMatrix` and `browser.hostedMatrix` arrays: exactly 32
local pairs and exactly eight hosted pairs per deployed surface role. One
screenshot is insufficient; each result needs its own trace/snapshot or browser
audit plus its own linked runtime/PostgreSQL receipt from the same exact runtime
source. Every row must include at least one browser artifact and at least one
runtime/PostgreSQL receipt unique to that row; shared extras do not substitute
for either unique proof. Renaming or copying identical bytes does not create
unique proof; row-bound browser and runtime artifacts must have distinct
content digests. Principal Agent application, Offer, acceptance, execution,
repayment, and Evidence rows must identify the `agent_mcp` transport and include
an Agent MCP receipt.

The following complete table is required for `local_exact_commit`. For
`hosted_exact_commit`, require only the Principal Agent column for `primary` and
the Risk / Operations column when `risk` is deployed:

| Check | Human | Principal / Agent | Capital Partner | Risk / Operations |
| --- | --- | --- | --- | --- |
| Desktop | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| Mobile | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| Reload | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| Fresh browser context | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| Back / Forward | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| Sign-out / re-login | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| Negative authorization | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| Restart recovery | `PENDING` | `PENDING` | `PENDING` | `PENDING` |

Minimum visual widths are 1440 desktop and 390 mobile. Record keyboard focus,
horizontal overflow, console errors, and failed network requests in the browser
audit. Browser storage may be inspected to prove it is not acceptance authority,
but session material must never enter an artifact.

## Required final authority state

All must remain `false`:

- real funds;
- external funds movement;
- production signer authority;
- arbitrary withdrawal;
- Venue write;
- real Human lending;
- mainnet;
- protocol fees; and
- browser credential capture.

## Current harness result

- Local exact-SHA conformance: implemented and unit-verified.
- P0-5 Evidence schema/verifier: implemented and unit-verified.
- Exact Agent two-phase, SHA-scoped harness: implemented; an exact pre-restart
  MCP receipt and matching post-restart recovery receipt are pending the clean
  P0-1 through P0-4 candidate.
- Exact clean candidate and current local browser/runtime Evidence: pending;
  generic `local-stack` or retained lifecycle Evidence is not accepted.
- Hosted exact deployment and real-browser Evidence: pending; no external
  deployment was performed by this issue.
