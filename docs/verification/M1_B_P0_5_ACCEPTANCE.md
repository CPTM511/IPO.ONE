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
4. Run local PostgreSQL and Agent acceptance before restart.
5. Use Playwright CLI or controlled Chrome against the real local four-role
   workspaces. Start a trace
   before the first interaction; use snapshots before element references; store
   redacted artifacts only under `output/playwright/m1-b-p0-5/`.
6. Complete the four journeys and the complete browser/recovery matrix below.
7. Run the Human Offer and Agent MCP fail-closed sets. Confirm zero additional
   economic effects and non-enumerating protected-resource denials.
8. Run `pnpm run local:restart`, wait for healthy loopback forwarding, then
   recover all four authenticated role workspaces from server truth.
9. Repeat local acceptance and Agent acceptance. Confirm empty pending outbox
   and no duplicate effects.
10. Against the exact hosted candidate, repeat the applicable browser matrix,
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
all four role journeys, all 32 browser role/check pairs, the complete negative
set, restart recovery, artifact provenance/redaction, disabled authority, and
the live hosted release identity at the actually deployed primary surface and
the Risk surface when that second reviewed project is deployed. Each browser
row needs a real-browser artifact plus a runtime/PostgreSQL receipt; each
journey step needs a runtime/PostgreSQL receipt; MCP execution additionally
needs an `agent_mcp_receipt`; negatives need `negative_receipt`; restart needs
`restart_log` plus a local runtime/PostgreSQL receipt.

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
| MCP execution | `PENDING` | Provider ID/category through MCP to durable Ledger effect |
| Repayment / Evidence | `PENDING` | Full synthetic repayment and owner Evidence read |
| Restart recovery | `PENDING` | Fresh Agent proof; same canonical lifecycle after restart |

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

## Browser and recovery matrix

Every role must pass all eight rows. One screenshot is insufficient; each result
needs a trace/snapshot or browser audit plus the linked runtime receipt.

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
- Exact clean candidate: pending P0-1 through P0-4 completion.
- Current local browser/runtime Evidence: not accepted because the shared
  developer runtime is generic `local-stack`, and its retained Agent credential
  must be reconciled with the current source before rerunning acceptance.
- Hosted exact deployment and real-browser Evidence: pending; no external
  deployment was performed by this issue.
