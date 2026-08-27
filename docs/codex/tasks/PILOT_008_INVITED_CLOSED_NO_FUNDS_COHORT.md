# PILOT-008 — Invited closed no-funds cohort

Status: `PREPARED — BLOCKED; PREREQUISITE AND APPROVAL GATES OPEN`

Canonical mode: `L2_CLOSED_NO_FUNDS`

Requirements: `REQ-PILOT-001`, `REQ-PILOT-002`, `REQ-CORE-001`,
`REQ-UX-001..005`, `REQ-EVID-001..004`, `REQ-RISK-001..002`,
`REQ-PRIV-001`, `REQ-AUTO-001`

## Context and current baseline

M2B-006 provides a remotely deployed, user-verified no-funds baseline at
`https://ipo.one`. It does not activate the closed-pilot launch profile or
authorize an invited cohort. Launch policy v1.3.3 keeps
`closed_non_funds_pilot.releaseEnabled=false`, and the approval template is
pending.

Constitution v1.3 requires both `REQ-PILOT-001` and `REQ-PILOT-002` before an
L2 pilot. Current Evidence finds no durable dispute/appeal/correction case
workflow and only partial feedback/support/incident capability.

This file is an umbrella planning contract. It does not satisfy the
Engineering Standard's active-issue requirement for implementation. Before
code or external mutation, split and activate issue-sized `PILOT-008A`,
`PILOT-008B`, and `PILOT-008C` contracts.

## Scope

### PILOT-008A — prerequisite and candidate closure

- Implement the minimum Constitution-approved dispute/appeal/correction case
  workflow over the shared kernel:
  - file against a Decision, Offer disclosure, Payment, servicing action,
    Evidence item, or report;
  - preserve the original immutable record and link additive correction;
  - record authorized filer, owner, status, reason, timestamps, Evidence, and
    resolution;
  - expose privacy-safe owner/operator state through Human UI and equivalent
    authorized versioned API/MCP; and
  - prevent cases from silently changing credit, Ledger, or Evidence truth.
- Close privacy-safe analytics, feedback, support, retention, escalation, and
  incident ownership with named approvals.
- Rebase retained topology, identity, Agent HTTPS, operations, restore,
  reconciliation, synthetics, alerting, rotation, and rollback controls to one
  exact current release candidate.

### PILOT-008B — exact deployment and activation

- Deploy one reviewed private-Tenant no-funds candidate through the exact
  approved topology.
- Pass the closed-pilot launch Evidence contract and a separately reviewed
  launch-policy revision.
- Provision only pre-approved Human, Principal, Agent, Capital Partner, and
  Risk/Operations identities and least-privilege credentials.
- Activate protected Web/API/worker paths without external Provider execution,
  Venue signing, mainnet, or funds.

### PILOT-008C — cohort and exit

- Run the approved small cohort.
- Measure lifecycle completion, support needs, failure/retry, repayment,
  dispute/correction, feedback, incidents, and reconciliation using only
  approved privacy-safe data.
- Execute restart, redeploy, restore, credential revocation, pause, duplicate,
  unknown-outcome, incident, rollback, and support drills.
- Produce one exact cohort exit report and L3 go/no-go recommendation.

## Non-goals

- No public/self-service signup or unrestricted participant creation.
- No raw KYC/PII, free-text analytics, third-party trackers, or lender-private
  policy on public/onchain surfaces.
- No real Human lending, real funds, custody, deposit, withdrawal, external
  transfer, public real-value LP/vault, mainnet, or production financial claim.
- No external Provider execution or Hyperliquid signed action.
- No new active risk policy, limit, pricing, automated adverse decision, or
  model promotion.
- No database intervention as a normal participant workflow.
- No profile activation from Evidence alone.

## Likely files

- New issue-sized task files for `PILOT-008A/B/C`
- `docs/PRODUCT_CONSTITUTION.md` only if a real governance conflict is found;
  no change is currently proposed
- `packages/domain/`, `packages/api-contract/`, `modules/persistence/`,
  `apps/tenant-api/`, `apps/web/`, `packages/sdk/` for `REQ-PILOT-001`
- `modules/feedback/`, alert/operations modules, and private product surfaces
  for `REQ-PILOT-002`
- additive `db/migrations/` only under the exact active prerequisite issue
- `deploy/closed-pilot/`, `deploy/gcp/closed-pilot/`, and
  `deploy/approvals/` for the exact deployment gate
- `docs/security/`, `docs/releases/`, `docs/codex/audits/PILOT-008/`, and
  `artifacts/pilot-008/` for runbooks and Evidence

## Acceptance criteria

1. A Human can discover, file, inspect, and follow a case through visible
   controls without an internal ID; an Agent has an equivalent authorized,
   versioned operation and structured receipt.
2. Filing, assignment, resolution, and correction linkage are Tenant/Actor/
   object authorized, idempotent, Event/Evidence linked, restart-readable, and
   non-enumerating.
3. A case cannot mutate an Offer, credit authority, Ledger, Payment, servicing
   state, or original Evidence except through a separately authorized canonical
   operation and additive correction Event.
4. Named privacy, retention, support, incident, restore, rollback, on-call, and
   notification owners are approved and tested.
5. The exact launch candidate passes migration, forced RLS, backup/restore,
   reconciliation, worker lease/retry, synthetics, alerts, secret rotation,
   edge, rollback, independent security, privacy/legal, and participant gates.
6. The launch-policy profile is enabled only through a reviewed policy change
   after the complete immutable Evidence package exists.
7. Two to three internal Human users, three to five invited design partners,
   and five to ten separately credentialed reference/participant Agents—or a
   smaller explicitly approved cohort—can complete assigned journeys without
   database intervention.
8. Refresh, logout/login, restart, redeploy, restore, duplicate, replay,
   revocation, pause, incident, and rollback preserve canonical state and do
   not create duplicate economic state.
9. No cross-Tenant disclosure or authority reuse occurs; every mutation is
   attributable to Tenant, Actor, current authority, request, Event, and
   Evidence.
10. No open P0/P1 security issue or unexplained Ledger/Obligation/Evidence
    divergence remains, and all value remains synthetic/non-withdrawable.

## Test commands

Exact child issues must select and pin the applicable commands. The umbrella
minimum is:

```sh
pnpm check
pnpm test
pnpm run test:postgres
pnpm run test:security
pnpm run test:transport
pnpm run check:closed-pilot-operations
pnpm run check:deploy-topology
pnpm run check:agent-https-transport
pnpm run launch:verify -- --evidence <immutable-evidence> \
  --profile closed_non_funds_pilot --expected-sha <exact-sha>
git diff --check
```

Real-browser Human, Principal, Capital Partner, Risk/Operations, and remote
Agent conformance commands must bind the actual deployed SHA.

## Security checklist

- [ ] `REQ-PILOT-001` and `REQ-PILOT-002` are implemented and current-user
      verified before activation.
- [ ] No raw PII, KYC, credential, signature, key, private policy, or free text
      enters logs, artifacts, prompts, analytics, or chain state.
- [ ] Authentication, object/capability authorization, RLS, admission,
      idempotency, Event/Evidence, and non-enumerating denial pass.
- [ ] Named support/incident/restore/rollback/on-call owners and notification
      delivery are exercised.
- [ ] External Provider/Venue execution, withdrawals, mainnet, and real funds
      remain disabled.
- [ ] Exact candidate, migrations, image, configuration, approvers, deployment,
      and rollback target are immutable and queryable.

## Permission boundary

This prepared file grants no implementation, participant, credential,
deployment, privacy, support, cloud, secret, profile, or remote-access
authority. Each child issue and each permission-expanding stage requires named
human review. The final traffic/profile activation requires a distinct Founder
and launch-policy decision.

## Data and migration impact

`REQ-PILOT-001` is expected to require additive Tenant-RLS case, status,
assignment, Evidence-link, and correction-link persistence. The exact schema is
not approved by this umbrella. No raw PII is required. Existing Evidence and
economic history remain append-only; destructive rollback is prohibited after
case history exists.

## Rollback

Before activation, revert only the scoped code/config/docs of the active child
issue. After cohort activation, stop invitations, revoke participant
credentials, disable the exact profile through reviewed change, return traffic
to the recorded immutable no-funds release, preserve Events/Evidence/
idempotency, reconcile, and repair forward. Do not downgrade the database,
weaken RLS, expose a direct origin, or convert synthetic value to real value.

## Required Evidence and dependencies

Dependencies:

- `PHASE3-000` complete;
- `PHASE3-POOL-001` complete with the exact final merged SHA deployed and
  user-verified on `ipo.one`;
- issue-sized `REQ-PILOT-001` and `REQ-PILOT-002` closure;
- exact current-candidate rebase of prior pilot controls;
- named Security, Legal, Privacy, Operations, Product, Support, Deployment, and
  Founder decisions; and
- reviewed launch-policy revision.

Current verdict: `BLOCKED — NOT COMPLETE`.
