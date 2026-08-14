# M1-B Current Release Truth

## Status

Status: `EXACT_CANDIDATE_BINDING_PENDING_COMMIT_DEPLOYMENT_PENDING_AUTHORIZATION`

This document is the current claim boundary for M1-B release closure. It does
not authorize deployment, merge, promotion, alias or DNS mutation, tag, seal,
Provider execution, signer action, transfer, withdrawal, Venue write, protocol
fees, real Human lending, or real funds.

The current Vercel configuration authority is
`deploy/vercel/m1-b-sandbox.manifest.v2.json`: one configured Primary project,
no M1-B Risk deployment target, `productionHostingClaim:false`, and deployment
pending. `deploy/vercel/m1-b-sandbox.manifest.v1.json` is preserved historical
two-project context and its former deployment/custom-domain authority is not
inherited.

## Candidate identity and stage

An exact Git commit cannot contain its own commit SHA or tree as a
self-referential field. Therefore the final candidate identity and exact gate
counts are bound after the candidate commit exists in GitHub PR #20 and in the
private P0-5 acceptance Evidence. They must not be copied from an ancestor,
working-tree build, historical deployment, or prior browser run.

| Release identity | Current rule |
| --- | --- |
| Source SHA | `PENDING_POST_COMMIT_BINDING` |
| Source tree | `PENDING_POST_COMMIT_BINDING` |
| Tested SHA | Must equal the post-commit Source SHA |
| Accepted SHA | Must equal the Tested and Source SHA after P0-5 passes |
| Deployed SHA | `null` while deployment is pending |
| Deployment status | `PENDING_FINAL_FOUNDER_AUTHORIZATION` |
| Final test counts | Bound from exact-candidate CI and private P0-5 Evidence after commit |

Before acceptance, Source, Tested, and Accepted remain pending. After exact
acceptance they must satisfy `source = tested = accepted`; while deployment is
pending, `deployed = null`. A later deployed claim is valid only if the same
accepted SHA is separately authorized, deployed, and verified on the target
runtime.

## Canonical product truth

The canonical M1-B runtime remains:

```text
Human Web / Agent MCP / Tenant API
  -> Tenant Protocol
  -> Tenant Command Gateway
  -> shared Human and Agent Obligation kernel
  -> PostgreSQL 17
```

Browser or process memory is not canonical authority. The exact source contains
61 ordered migration pairs through `0061_execution_account_bindings`. Final
repository, security, transport, PostgreSQL, browser, restart, and release-gate
counts must be copied from the exact candidate's passing Evidence, not from this
pre-commit document.

## Older hosted baseline

The last recorded read-only observation, dated 2026-08-13 in
`docs/codex/audits/UX-006/README.md`, reported `https://ipo.one/readyz` and the
public capability document on release
`d36ff20c2049b199ed3032e85752f36e36300312`. This is not a timeless current-state
claim. That release is the older hosted no-real-funds baseline and remains
useful as historical deployment and rollback context, but it is not:

- the current M1-B source candidate;
- current-candidate test or acceptance Evidence;
- the deployed identity of the pending candidate; or
- permission to redeploy, promote, alias, change DNS, tag, or seal.

Recorded deployment baselines are Primary
`dpl_2JBesAqB2MXZZBCEDypMq5Gzm7Ue` and Risk
`dpl_62VpuVX2GRd2uMxpfYXZ7EYxKY7p`. The Primary baseline requires fresh
read-only revalidation before any separately authorized M1-B deployment. The
Risk baseline is historical only and becomes relevant again solely under a
separately approved M1-C/L2 Risk topology. Recording either here does not
authorize a Vercel action.

## Historical and superseded current claims

The following files remain preserved as Evidence for the state and date they
recorded. They are historical, or superseded for current M1-B identity, count,
acceptance, deployment-status, and completion claims. Do not rewrite them to
impersonate the final candidate:

- `docs/codex/audits/PROD-CUTOVER-002/audit.md`;
- `docs/security/IPO_ONE_PUBLIC_SANDBOX_DEPLOYMENT_EVIDENCE_v0.1.md`;
- `deploy/local/prod-cutover-001.release-candidate.v1.json`;
- `docs/verification/M1_B_GOLDEN_FLOW_EVIDENCE.md`;
- `docs/verification/M1_B_VERCEL_GOLDEN_FLOW.md`;
- `docs/verification/m1-b-vercel-golden-flow-evidence.v1.json`;
- `docs/verification/M1_B_CANONICAL_CLOSURE_EVIDENCE.md`;
- `docs/codex/tasks/M1_B_DEPLOYABLE_SANDBOX_CLOSURE.md`;
- `docs/releases/M1_B_WORKTREE_INCLUSION_MANIFEST.md`; and
- `deploy/vercel/m1-b-sandbox.manifest.v1.json`.

Their old SHA, deployment, migration, and test-count statements remain
point-in-time facts only. PR #20 and private exact-candidate P0-5 Evidence are
the post-commit identity and acceptance authorities for this closure.

## Rollback boundary

No final or current exact-candidate deployment has been authorized or performed
in this closure, so no external rollback is currently required. Earlier
unaliased, unpromoted exact-source previews—`93b0303...` at
`dpl_C3cSHa5vHYaHm7gEKBKJpYcRGaXM` and `8754408...` at
`dpl_491k2nW5gjahKiCk63duBXQjc2wk`—are superseded historical staging records.
They do not change `deployed = null` for the candidate that will be cut from
this work. PostgreSQL remains canonical and
must not be deleted, restored, or rewritten merely to align it with application
code. Any later authorized rollback must first preserve Events, Evidence,
repayments, sessions, continuation receipts, inbox/outbox state, reconciliation
history, and the exact before/after deployment identities.

Real funds, external Provider execution, production signer authority, arbitrary
withdrawal, Venue write, production Human lending, mainnet, and protocol fees
remain disabled.
