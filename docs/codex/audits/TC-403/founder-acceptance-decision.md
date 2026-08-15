# TC-403 Founder acceptance decision package

Status: `PENDING_EXTERNAL_INDEPENDENT_REVIEW`

Founder: `ipo_one_founder`

Prepared at: `2026-07-26T04:37:04.000Z`

## Exact candidate

- Branch: `codex/commercial-access-release`
- Baseline HEAD:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- Content-addressed stacked-worktree artifact set:
  `0x19d3fb26a3343354cf0cd98e3433b30313fd132a715083198dc5361fe936ffd3`
- TC-403 assurance:
  `0x8bad2dce477e84d726b07f20277a841ec3d81f2b6613521b8f8c998b05785124`
- Source-approved policy:
  `0x295c4e61e823694e62795af6d977649eceb420a93aec0ff3510c8b69e0bd9da0`
- GPT supplementary-review file SHA-256:
  `d6d231c88739882e5a97c4985f269b57cb32ffe4a17a85df54c0b1f4c6d7ce6c`
- GPT supplementary retest digest:
  `e1583b0f7a158c965a9d3aa55fec4887393bea0a365778676e4d51040ff83d9b`

## Current evidence

- Open P0: `0`
- Open P1: `0`
- Open P2: `1`
- TC-403 targeted tests: 11/11
- Security tests: 33/33
- PostgreSQL tests and physical restore: 75/75
- Complete repository tests: 544/544
- Runtime authority: none
- Exchange writes, API Wallet, mainnet, production, deployment, payout, and
  funds authority: all false

## Gate that is not satisfied

The accepted TC-403 handoff requires an organizationally independent human or
external security reviewer and explicitly prohibits Codex or the implementation
author from approving its own work.

The GPT Agents completed useful supplementary review and P0/P1 remediation,
but they do not satisfy that requirement. The formal assurance therefore
truthfully remains:

- independent review: `NOT_PERFORMED`;
- release: `BLOCKED_INDEPENDENT_REVIEW`; and
- launch blocked: `true`.

The Founder's instruction to use a GPT Agent cannot simultaneously preserve
the accepted no-Codex-self-review rule. This package does not silently weaken
that rule or fabricate Founder acceptance.

## Decision

Founder acceptance cannot yet be recorded against a qualifying external report
hash. RELEASE-001 remains blocked.

To complete the gate without changing governance:

1. appoint an external human or organizational reviewer;
2. review the exact artifact-set hash above;
3. record the reviewer identity/type, report hash, attestation hash, reviewed
   timestamp, policy hash, finding-set hash, and P0/P1 retest evidence;
4. regenerate the assurance as ready for Founder acceptance; and
5. have the Founder accept that exact final assurance/report hash.

Changing the independence rule to permit a GPT/Codex reviewer would be a
separate governance and risk-control change. It is not implied or executed by
this decision package.

## Founder process override for RELEASE-001

Recorded at: `2026-07-26T05:44:16.000Z`

The Founder subsequently stated that a colleague had reviewed the artifact set
without issue, explicitly directed Codex to skip collection of the external
review report/hash, and instructed RELEASE-001 to continue.

This is recorded as:

`FOUNDER_PROCESS_OVERRIDE_ACCEPTED_FOR_RELEASE_001_EVALUATION_ONLY`

It authorizes running the RELEASE-001 acceptance evaluation. It does not
retroactively create missing report Evidence, change
`independentReview.status=NOT_PERFORMED`, make the colleague's review
independently reproducible, set `launchBlocked=false`, unlock a deployment or
release policy, or authorize mainnet, production, signers, API Wallets,
Exchange writes, payout, transfer, withdrawal, capital, or funds.

RELEASE-001 must report this row as `UNVERIFIED/WAIVED_BY_FOUNDER`, never as
`PASS`.
