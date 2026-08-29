# PILOT-008B Gate 0 — Exact deployment and activation readiness

Status: `GATE 0 READY — DEPLOYMENT/ACTIVATION BLOCKED`

Date: 2026-08-29

Prerequisite candidate: `PILOT-008A` local commit
`bb72a66f8627f9751c493f464a814bb53da9f403`

Requirements: `REQ-PILOT-001`, `REQ-PILOT-002`, `REQ-CORE-001`,
`REQ-UX-001..005`, `REQ-EVID-001..004`, `REQ-RISK-001..002`,
`REQ-PRIV-001`, `REQ-AUTO-001`

Founder direction: continue in the approved Phase 3 order after local
`PILOT-008A` closure. Under the Product Engineering and Experience Standard,
this issue activates documentation, read-only diagnosis, candidate truth and
fail-closed preflight only. Deployment, production dependencies, identity or
credential provisioning, permission expansion, profile unlock and traffic
cutover still require their separately named reviews.

## Context

`PILOT-008A` provides the locally verified case/correction workflow and
queryable readiness contract. It is not yet an immutable merged CI release or
digest-pinned deployable image. The checked-in closed-pilot operations source
still points at a historical July local release candidate, while launch policy
v1.3.3 keeps `closed_non_funds_pilot.releaseEnabled=false`.

Read-only cloud observation on 2026-08-29 found the selected GCP project active
and the PostgreSQL 17 closed-pilot instance still present with the expected HA,
connector-only, encrypted, deletion-protected, backup and PITR posture. The
database is stopped; no closed-pilot Cloud Run service or Job is deployed;
billing is disabled; Secret Manager cannot be queried while billing is
disabled; and the Compute API needed for the proposed edge policy is disabled.
These are current observations, not approvals or an instruction to enable,
start, provision or purchase anything.

## Scope

- Bind one machine-readable Gate 0 readiness record to the exact
  `PILOT-008A` prerequisite commit while leaving the future deployment commit,
  CI run, image digest, migration receipt and rollback release unset.
- Reconcile the checked-in topology, provider-selection, operations, launch
  policy and pending approval template into one fail-closed blocker list.
- Record current non-secret cloud observations through read-only commands and
  distinguish observation from desired configuration and verified Evidence.
- Add executable validation that rejects invented approvers, unresolved
  placeholders represented as approved, an enabled profile, any deployment
  candidate without an immutable image/CI/migration/rollback binding, or any
  permission-expanding authority in Gate 0.
- Produce the exact Founder and named-review input checklist required before a
  later `PILOT-008B` deployment turn can begin.

## Non-goals

- No merge, push, pull request, CI release, image build/push, cloud deployment,
  service/job/database start, billing enablement, API enablement, provider
  purchase, IAM change, secret creation/write, DNS/WAF/edge mutation or traffic
  cutover.
- No Human, Principal, Agent, Capital Partner or Risk identity/credential
  issuance; no invitation, participant access or cohort operation.
- No launch-policy edit and no change to
  `closed_non_funds_pilot.releaseEnabled=false`.
- No Provider/Venue execution, signer, chain write, mainnet, real funds,
  Human cash loan, custody, withdrawal, external transfer, risk-policy change,
  `PILOT-008C`, `HL-TESTNET-001`, `RISK-003B` or M3 work.

## Likely files

- `deploy/closed-pilot/pilot-008b-gate0.v1.json`
- `packages/deployment-topology/` for the closed fail-closed parser
- `scripts/check-pilot-008b-gate0.mjs`
- `package.json` for the check entry point and aggregate gate
- `docs/codex/audits/PILOT-008B/` for non-secret read-only observation
- Phase 3 task and traceability documents

## Acceptance criteria

1. One checked-in Gate 0 record names the exact local prerequisite commit and
   truthfully leaves the future deployment SHA, immutable image, CI run,
   migration receipt and rollback target unavailable.
2. The record contains no name, email, contact, credential, secret, account
   token, private identifier or fabricated approval.
3. All eight launch gates remain pending and all permission-expanding
   authorities remain false.
4. The validator cross-checks launch-policy v1.3.3, the pending evidence
   template, topology, provider selection and operations source.
5. The validator fails if the launch profile is enabled, an approval is
   represented as complete, a placeholder is treated as Evidence, or the
   historical operations candidate is represented as the current deployable
   candidate.
6. Current read-only cloud state is reported separately from desired topology;
   unavailable checks remain unavailable and do not become passes.
7. The output names the exact missing decision/approval inputs for the next
   human review without requesting or exposing secret values.
8. Targeted unit tests, source/boundary lint, schemas, topology, operations,
   launch policy and `git diff --check` pass.
9. The final verdict is `GATE 0 READY — DEPLOYMENT/ACTIVATION BLOCKED` or
   `BLOCKED — NOT COMPLETE`.

## Test commands

```sh
pnpm run check:pilot-008b-gate0
node --test packages/deployment-topology/test/pilot-008b-gate0.test.js
pnpm run check:deploy-topology
pnpm run check:closed-pilot-operations
pnpm run check:launch-policy
pnpm run lint
pnpm run typecheck
git diff --check
```

## Security checklist

- [x] Gate 0 has no cloud, IAM, secret, credential, participant, profile,
      traffic, Provider/Venue, signer, chain or funds write authority.
- [x] Exact launch-policy and approval-template gate IDs match and remain
      pending.
- [x] Missing owners, contacts, jurisdictions and review Evidence remain
      unavailable rather than invented.
- [x] The historical operations release is not relabeled as the current
      candidate.
- [x] Current cloud observations contain no secret values or private
      participant data.
- [x] A future deployment candidate cannot become ready without exact SHA,
      immutable image, green CI, migration, rollback and named-review inputs.

## Completion Evidence

- Machine record:
  `deploy/closed-pilot/pilot-008b-gate0.v1.json`.
- Read-only cloud report:
  `docs/codex/audits/PILOT-008B/gate-0-readiness.md`.
- The validator cross-checks the exact launch policy, pending approval
  template, topology, provider selection and historical operations source.
- Targeted Gate 0 tests passed `5/5`; aggregate unit tests passed `1,233/1,233`.
- Source/boundary lint, contract typecheck, 143 schemas, product traceability,
  deployment topology, closed-pilot operations, launch policy and
  `git diff --check` passed.
- The current cloud observation was read-only. The database remained stopped;
  no service, job, billing, API, secret, IAM, edge, credential, profile or
  traffic state was changed.

## Permission boundary

This issue authorizes repository documentation, a fail-closed local validator,
tests and read-only cloud observation. It grants no permission to merge or
publish a release, mutate cloud/provider state, start the stopped database,
enable billing/APIs, create secrets, change IAM, issue credentials, activate
remote access, edit launch policy, switch traffic or operate a cohort.

The next permission-expanding turn requires an explicit deployment decision
bound to the exact merged candidate and named Security, Legal, Privacy,
Operations, Product, Support, Deployment and Founder inputs. Profile unlock and
traffic activation remain a later distinct decision even after zero-traffic
deployment verification.

## Data and migration impact

None. Gate 0 does not connect to or mutate the stopped cloud database. It adds
no migration and changes no participant, credential, Event, Evidence, Ledger
or economic state.

## Rollback

Remove only this Gate 0 record, validator, test and documentation update. No
cloud or durable product state exists to roll back. Preserve the
`PILOT-008A` commit and its local PostgreSQL Evidence.

Current verdict: `GATE 0 READY — DEPLOYMENT/ACTIVATION BLOCKED`.
