# PILOT-008A — Prerequisite and current-candidate closure

Status: `PASS — LOCALLY VERIFIED; PILOT ACTIVATION NOT AUTHORIZED`

Date: 2026-08-29

Baseline: `origin/main` at
`316de8f0c2188c5f4d0b15a1cffbc50713b2972e`

Requirements: `REQ-PILOT-001`, `REQ-PILOT-002`, `REQ-CORE-001`,
`REQ-UX-001..005`, `REQ-EVID-001..004`, `REQ-PRIV-001`, `REQ-AUTO-001`

Founder direction: continue after the accepted `PHASE3-POOL-001` completion
report. This activates local implementation and exact candidate preparation
only. Deployment, L2 profile activation, participant access and cohort
operation remain separate gates.

## Context

`PHASE3-POOL-001` is complete at the exact merged and deployed SHA above.
Constitution v1.3 still requires two capabilities before an invited
`L2_CLOSED_NO_FUNDS` pilot:

1. `REQ-PILOT-001`: a durable dispute, appeal and additive-correction case
   workflow; and
2. `REQ-PILOT-002`: privacy-safe analytics/feedback plus named retention,
   support and incident ownership.

`PILOT-006` already supplies immutable categorical feedback and privacy-safe
Tenant aggregates, so this issue must reuse that work. It must not build a
second feedback system. The open product gap is the minimum approved durable
case/correction workflow and a queryable readiness contract that distinguishes
implemented controls from still-pending named approvals.

## Scope

### A. Minimum dispute and additive-correction workflow

- Add one shared-kernel `PilotCase` domain for an authorized owner to file a
  case against a Decision, Offer disclosure, Payment, servicing action,
  Evidence item or report.
- Store only closed reason and correction taxonomies; prohibit free text, raw
  KYC/PII, credentials, signatures and unrestricted attachments.
- Preserve the original target reference and Evidence as immutable.
- Support idempotent filing, authorized operator assignment, `UPHOLD` or
  `CORRECT` resolution, and an additive correction link/Event/version.
- A case or correction link may not directly mutate credit authority, Offer,
  Obligation, Ledger, Payment, servicing or original Evidence truth.
- Expose owner-safe filing/list/detail/status through visible Human controls and
  equivalent versioned API, SDK and MCP operations.
- Expose privacy-safe operator queue/detail/assignment/resolution controls only
  under exact Tenant/resource/capability authority and recent MFA where
  required.

### B. Minimum `REQ-PILOT-002` readiness closure

- Reuse the existing categorical `PILOT-006` feedback records and Tenant
  aggregate; add no third-party tracker or free-text analytics pipeline.
- Add a versioned, queryable closed-pilot readiness view for retention,
  ordinary support, incident, restore, rollback, on-call and notification
  ownership.
- Represent a missing owner or approval as `PENDING`/`UNAVAILABLE`; never invent
  a person, contact address, jurisdiction or approval.
- Prepare the exact approval/Evidence fields needed by `PILOT-008B`, while
  leaving every external or permission-expanding value pending human review.

### C. Current-candidate rebase

- Rebase retained topology, identity, Agent HTTPS, operations, restore,
  reconciliation, synthetics, alerting, rotation and rollback checks onto one
  exact candidate derived from this baseline.
- Record which checks are CODE, RUNTIME, DEPLOYED, REACHABLE and VERIFIED.
- Produce local no-funds product Evidence and a stable loopback experience for
  Founder review. Do not treat local Evidence as L2 activation.

## Non-goals

- No legal complaint platform, arbitration, jurisdictional workflow, adverse-
  action legal conclusion, SLA promise or multi-level appeal bureaucracy.
- No silent correction of economic truth and no deletion/rewrite of original
  Event, Evidence, Decision, Offer, Obligation, Ledger, Payment or servicing
  history.
- No public signup, invitation, participant provisioning, new production
  identity, credential, secret, remote-access or private-Tenant expansion.
- No launch-policy edit, L2 activation, deployment/promotion, DNS, cloud or
  database-provider mutation.
- No Pool or Venue transaction, signer, Hyperliquid action, mainnet, real
  funds, Human cash loan, custody, withdrawal or external transfer.
- No active risk-policy, limit, pricing, underwriting, score or model change.
- No `PILOT-008B/C`, `HL-TESTNET-001`, `RISK-003B` or M3 work.

## Likely files

- `packages/domain/` for closed case enums and invariants
- `packages/api-contract/` and versioned Tenant protocol schemas
- `modules/tenant-command-gateway/` for exact command/query handlers
- `modules/persistence/` and one additive `db/migrations/` pair with forced RLS
- `modules/authorization/` and `modules/abuse-control/` for exact capabilities
- `packages/sdk/` and `apps/agent-mcp/` for machine parity
- `apps/web/` for visible owner and operator controls
- existing pilot feedback modules as reused inputs, not a duplicate system
- `deploy/closed-pilot/`, audits and additive Evidence for candidate rebase

## Acceptance criteria

1. An authorized Human can discover, file, list and inspect their own case
   through visible controls without entering an internal ID.
2. An authorized Agent has equivalent versioned API/SDK/MCP operations and a
   structured receipt over the same case truth.
3. An authorized operator can query a Tenant-scoped queue, assign a case and
   resolve it as `UPHOLD` or `CORRECT`; unauthorized/cross-Tenant access is
   non-enumerating and denied.
4. Filing, assignment and resolution are idempotent, attributable, Event/
   Evidence linked, restart-readable and projection-reconcilable.
5. A `CORRECT` resolution creates only an additive correction reference/Event;
   the original target and Evidence remain immutable, and no credit/economic
   state changes implicitly.
6. Payloads use closed reason/correction taxonomies; raw KYC/PII, credentials,
   signatures, free text and files are rejected.
7. Existing `PILOT-006` feedback remains the only product-feedback truth and
   has no underwriting or authorization effect.
8. The readiness view truthfully reports named retention, support, incident,
   restore, rollback, on-call and notification inputs as approved or pending.
9. PostgreSQL forced-RLS, immutability, idempotency, replay, cross-Tenant,
   restart/reconciliation and additive migration tests pass.
10. Real-browser Human and Risk/Operations paths and Agent contract parity pass
    against the same local candidate.
11. No open P0/P1 remains in the local issue scope.
12. The final local verdict is `PASS — LOCALLY VERIFIED; PILOT ACTIVATION NOT
    AUTHORIZED` or `BLOCKED — NOT COMPLETE`.

## Test commands

The implementation will pin focused commands after the delta is known. The
minimum gate includes:

```sh
pnpm run check:migrations
pnpm run check:tenant-protocol
pnpm run test:postgres
pnpm run test:security
pnpm run test:transport
pnpm run test:browser:click-path
pnpm run check:closed-pilot-operations
pnpm run check
git diff --check
```

## Local completion Evidence — 2026-08-29

The implementation adds one closed-taxonomy, shared-kernel `PilotCase` with
forced Tenant RLS, immutable original target binding, idempotent owner filing,
MFA-gated operator queue/assignment/resolution, and additive correction links.
The same truth is exposed through visible Human and Risk/Operations controls,
the versioned Tenant protocol, typed SDK, and two bounded Agent MCP tools.

`REQ-PILOT-002` now has a versioned readiness query that reuses `PILOT-006`
categorical feedback and reads checked-in launch/operations sources. It reports
the exact pending approval and ownership inputs without inventing names,
contacts, jurisdictions, or approvals. The query remains fail-closed:
`releaseEnabled=false`, activation is false, all eight approval gates are
pending, seven operational controls are pending, and two are unavailable.

| Completion state | Evidence | Result |
| --- | --- | --- |
| CODE | domain, migration, persistence, gateway, authorization, protocol, SDK/MCP and UI delta | yes |
| RUNTIME | isolated local PostgreSQL-backed review runtime | yes, synthetic/no-funds only |
| DEPLOYED | remote release or promotion | no; not authorized by this issue |
| REACHABLE | four stable loopback role experiences | yes, localhost only |
| VERIFIED | actual Human SIWE and durable case recovery; real Chromium Human/Risk visible-click suite; PostgreSQL integration and full gates | yes, within the local boundary |

The actual Human runtime completed SIWE, created one case after a deterministic
Decision/Offer, and recovered the same case after a full page reload. This run
found and fixed an omitted PILOT capability in the explicit identity bootstrap
templates; local credential generation advanced to `phase7`, invalidating the
older session before the successful retest. The Risk/Operations visible path
passed in real Chromium and its MFA/Tenant behavior passed against PostgreSQL.
An actual private Risk session was deliberately not provisioned because that
requires a separately approved phishing-resistant Risk identity/provider; its
absence remains visible as a `PILOT-008B` activation input, not a credential
created by this issue.

Verification results:

- unit: 1,228 passed, 0 failed;
- PostgreSQL integration: 94 passed, 0 failed;
- transport: 89 passed, 0 failed;
- security: 34 passed, 0 failed;
- real-browser visible clicks: 11 passed, 0 failed;
- migrations: 70 ordered up/down pairs passed;
- Tenant protocol: 114 operations passed;
- schemas: 143 contracts passed;
- OpenAPI: 21 paths and 21 operations passed;
- source lint, boundary lint, contract typecheck, product traceability, deploy
  topology, web-bundle integrity, closed-pilot operations, and fail-closed
  launch-policy checks passed.

No external Provider/Venue/chain write, signer, deployment, participant
provisioning, mainnet action, or funds movement occurred. The checked-in
operations release remains historical rather than a current activation
candidate, and the readiness view truthfully reports that distinction.

## Security checklist

- [x] Exact Tenant, Actor, Subject, target object and capability checks are
      enforced at command, query, persistence and UI/API boundaries.
- [x] Case targets and responses are non-enumerating across Tenant/owner
      boundaries.
- [x] Original economic and Evidence truth is immutable; corrections are
      additive and separately linked.
- [x] No case action can authorize credit, change a limit or submit an economic
      operation.
- [x] Payloads and Evidence contain no raw PII/KYC, credentials, signatures,
      unrestricted attachments or lender-private policy.
- [x] Existing feedback is reused and remains categorical, aggregate and non-
      authorizing.
- [x] Missing operational owners/approvals remain pending and fail closed.
- [x] External Provider/Venue execution, deployment activation, mainnet and
      real funds remain disabled.

## Permission boundary

This issue authorizes repository changes, local PostgreSQL work, local no-funds
runtime verification and preparation of a candidate/Evidence package. It does
not authorize deployment, launch-policy change, participant provisioning,
remote private access, a production credential or secret, an external signer,
chain/Venue write, mainnet or funds movement. `PILOT-008B` requires a separate
Founder and launch-policy decision.

## Data and migration impact

One additive Tenant-RLS case projection and append-only status/correction
history is expected. Existing rows and Evidence remain immutable. After case
history exists, destructive down migration is prohibited; rollback disables
the feature and repairs forward while preserving case Events/Evidence.

## Rollback

Before any later activation, revert the scoped feature code/config and disable
its local capability exposure. Preserve applied case rows, Events, Evidence,
idempotency receipts and correction links. Never weaken RLS, delete original
records or roll back through durable case history.

## Required Evidence and dependencies

Dependencies:

- `PHASE3-000` complete;
- `PHASE3-POOL-001` at `PASS — DEPLOYED AND USER-VERIFIED`;
- exact baseline SHA recorded above; and
- this active issue contract merged with its coherent implementation, not as a
  separate documentation-only PR.

Current verdict: `PASS — LOCALLY VERIFIED; PILOT ACTIVATION NOT AUTHORIZED`.
