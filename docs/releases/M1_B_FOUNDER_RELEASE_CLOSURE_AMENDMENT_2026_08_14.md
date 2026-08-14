# M1-B Founder Release-Closure Amendment — 2026-08-14

Status: `FOUNDER_APPROVED_EFFECTIVE_FOR_M1_B_RELEASE_CLOSURE`

Effective date: 2026-08-14

Delivery mode: `L1_PUBLIC_SANDBOX`

## Context

This amendment records the Founder decision for the remaining M1-B exact-
candidate acceptance. It is a current release-closure overlay over the preserved
M1-B Gate Profile. It does not rewrite that source profile, its checker, the
requirement registry, or any historical release or deployment Evidence.

The machine-readable authority is
`product/traceability/ipo-one.m1-b-release-closure-founder-overlay.2026-08-14.v1.json`.
Its dedicated checker is
`scripts/check-m1-b-release-closure-founder-overlay.mjs`.

## Effective requirement gate

The preserved base profile records 38 requirements required for M1-B and 6
deferred requirements. This amendment changes only the effective M1-B
release-closure disposition:

- 39 requirements are required at `VERIFIED_SANDBOX`;
- 5 requirements are deferred: `REQ-PAY-002`, `REQ-PILOT-001`,
  `REQ-PILOT-002`, `REQ-TRADE-002`, and `REQ-UX-004`;
- current blockers are `REQ-CREDIT-009`, `REQ-UX-001`, `REQ-UX-003`, and
  `REQ-UX-005`.

`REQ-UX-001` now requires the complete Human no-funds lifecycle against the
exact candidate, including invited-wallet SIWE, exact Offer recovery and
acceptance, repayment, Evidence, reload, re-login, and restart recovery.

`REQ-UX-003` now requires the existing synthetic Capital Partner path against
the exact candidate: authenticated workspace, borrower-authorized Passport
review, Offer authoring, replacement, withdrawal, stale-Offer denial, and
borrower recovery of only the current PostgreSQL Offer. This grants no real
capital, marketplace, matching, allocation, custody, settlement, withdrawal, or
pricing authority.

The full privileged `REQ-UX-004` Risk or Operations journey is deferred to
`M1_C_L2_CLOSED_NO_FUNDS`. It requires a separately approved and deployed
phishing-resistant OIDC or WebAuthn assurance topology. M1-B must not weaken,
emulate, fabricate, or bypass that requirement.

## Mandatory M1-B Risk security boundary

The deferral of the full privileged journey does not remove Risk security from
M1-B. Gate `M1_B_RISK_SIWE_ONLY_FAIL_CLOSED` remains mandatory and must reach
`VERIFIED_FAIL_CLOSED` through exact-candidate Evidence proving all of the
following:

- a real SIWE-only session cannot satisfy an operation requiring recent
  phishing-resistant MFA;
- protected Risk or Operations attempts fail closed and non-enumerating;
- no weak-auth fallback or alternate privileged route exists;
- `requiresRecentMfaActorTypes` and the authorization policy remain unchanged;
- no under-assured Risk surface is exposed or promoted; and
- before-and-after durable Evidence shows zero privileged mutations and zero
  additional economic effects.

M1-B must not invent a successful privileged session or protective mutation.

## Mandatory operational negative Evidence boundary

Gate `M1_B_16_CASE_SPLIT_PROVENANCE` preserves all 16 required Human, Agent,
and authorization negative cases while making their exact-candidate provenance
executable. This is an Evidence-method clarification, not a case waiver or
product-scope expansion. Every case binds the same candidate SHA, Git tree,
tracked source, and exact OCI image through one closed semantic registry and a
unique case-definition hash, receipt, request ID, correlation ID, and audit ID
where a Tenant audit is applicable.

The only authorized source split is:

- `live_post_restart`: four safe cases that do not destroy or replace retained
  canonical state or replay captured wallet or session material;
- `exact_source_disposable_postgres`: ten replay-sensitive, wrong-Tenant,
  invalid-binding, or destructive and terminal cases,
  each executed from exact tracked source and the exact OCI image against
  fresh disposable PostgreSQL through the application role; and
- `exact_source_ui_binding`: the changed-version case, because the production
  acceptance payload has no client version field; the exact tracked browser
  binding rejects it before submission and claims no Tenant audit; and
- `exact_source_transport`: the signed-out private read, which executes without
  a cookie, proves the Tenant gateway is not reached, and must not claim a
  Tenant audit or PostgreSQL mutation readback.

Disposable PostgreSQL Evidence must include the exact closed subtest, captured
TAP result and exit status, ordered source digests, before-and-after protected
state, and zero additional command, event, ledger, or economic effects.
Duplicate acceptance is not rewritten as a generic denial and never replays
captured wallet material: disposable exact-source execution must prove the
status-200 idempotent replay contract with no second effects.
Fixtures, mocks, hand-authored proofs, omitted cases, and relabeling disposable
or transport Evidence as live are forbidden.

## Exact-candidate and deployment truth

The tracked checkpoint remains an in-progress authority document with
`candidateCommit:null`, `exactGreen:false`, and
`deploymentClosureClaimed:false`. It cannot safely contain the hash of its own
commit and is not a release seal.

Final candidate identity, tree, test counts, acceptance counts, runtime
identity, artifact hashes, rollback target, and deployment status must be bound
in private exact-commit Evidence under `output/playwright/m1-b-p0-5/` and in the
PR #20 release report. That Evidence must prove:

```text
source SHA = tested SHA = accepted SHA
```

If the candidate is deployed, it must additionally prove:

```text
accepted SHA = deployed SHA
```

Deployment may remain explicitly pending. A pending deployment must not claim a
deployed SHA or reuse the older deployed SHA as current-candidate Evidence.
There must be no tracked post-acceptance metadata commit, tag, or seal under
this amendment.

## Scope and non-goals

This amendment changes release-gate disposition and Evidence semantics only.
It authorizes no product feature, authorization-policy change, MFA bypass,
Risk-surface promotion, merge, deployment, deployment Evidence collection that
requires an external deployment action, deployment promotion, alias or DNS
change, custom-domain change, release tag or seal, real funds, mainnet, signer,
withdrawal, Venue write, protocol fee, or real Human lending. The historical
base profile's `deploymentAuthorized:true` field is preserved but is explicitly
not inherited by this current overlay.

Wallet, A2A, MCP, Agent, multi-chain, and future identity-provider adapter
boundaries remain preserved.

## Acceptance checks

```text
node scripts/check-m1-b-gate-profile.mjs
node scripts/check-m1-b-release-closure-founder-overlay.mjs
node scripts/check-m1-b-release-closure-checkpoint.mjs
git diff --check
```

The base profile checker must continue to pass unchanged. The overlay checker
must derive the effective 39/5 split from the preserved 44-requirement profile,
validate all three overrides, and enforce the separate mandatory Risk boundary.
The checkpoint checker must bind the overlay without claiming a candidate,
deployment closure, or seal.

## Data, migration, rollback, and Evidence

There is no schema, migration, seed, business-data, authentication-policy, or
runtime mutation. Rollback removes only this overlay, its checker, its
checkpoint binding, and this amendment; it does not modify historical Evidence
or retained PostgreSQL data.

Completion Evidence for this amendment consists of the unchanged base-profile
verification, overlay verification, checkpoint verification, focused diff
checks, and explicit confirmation that all authority flags remain false.
