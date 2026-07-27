# V9-008 Pre-change Mapping

Date: 2026-07-24

Source identity:

- branch: `codex/commercial-access-release`
- required package commit: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- observed source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- worktree: intentionally dirty with the accepted stacked WALLET and V9
  increments; unrelated changes must be preserved

## Current runtime truth

| Product need | Authoritative current source | Pre-change browser state | V9-008 treatment |
| --- | --- | --- | --- |
| Tenant portfolio | `pilotReadTenantRisk` through the authenticated Tenant Gateway and PostgreSQL RLS | Implemented in Risk & Operations | Preserve the exact recent-MFA aggregate read; do not add identity or PII |
| Pilot health | `pilotReadPilotHealth` | Implemented and loaded after the portfolio | Preserve the separate Risk/Operations/Auditor authorization |
| Pilot feedback | `pilotReadPilotFeedbackSummary` | Implemented and loaded after the portfolio | Preserve closed categorical aggregation only |
| Adverse servicing queue | `pilotReadServicingQueue` | Implemented with bounded filters and cursor | Preserve read-only, recent-MFA, PII-free queue behavior |
| Protective Subject freeze | `pilotFreezeSubject` | Implemented as an exact, reason-bound, idempotent command | Preserve the one-way protective action; expose no inverse action |
| Sandbox servicing resolution | `pilotRestructureSandboxObligation`, `pilotRepurchaseSandboxObligation`, and `pilotWriteOffSandboxObligation` | Implemented in the Gateway but not presented as generally available browser controls | Describe the exact external approval prerequisite; do not create an approval, infer authority, or add a browser bypass |
| Operational alerts | `ops_001b.v1` policy and OPS-001C Tenant-RLS PostgreSQL store | Durable internal state exists, but no Tenant protocol read operation exists | Present checked-in policy evidence separately from live state and label live operator read unavailable |
| Reconciliation | `PostgresReconciliationService`, `reconciliation_summary.v1`, and immutable discrepancy Evidence | Worker/internal service exists, but no Tenant protocol read operation exists | Present the checked-in runbook and fail-closed boundary; do not claim a current run was loaded |
| Incidents | `PRIVATE_PILOT_ALERT_AND_INCIDENT_RUNBOOK.md` | Runbook exists; named owners, notification delivery, acknowledgement, and resolution operations are unconfigured | Show the unconfigured state explicitly; add no incident mutation |
| Dual control | ADR-020, approval policy, durable ApprovalProposal/Decision/Execution records | Enforced for the existing servicing resolution operations; no browser proposal/decision workflow exists | Show exact-command and two-role evidence requirements; do not accept a client assertion as approval |
| Break glass | ADR-020 durable protective-only state machine | Disabled by default and not available through the browser | Keep disabled, protective-only, and unavailable |
| Launch gates | `deploy/launch-policy.v1.json` | Checked-in contract exists; the browser does not currently summarize it | Expose checked-in policy status as configuration evidence, never as runtime release authority |

## Authority separation

- Borrower surfaces remain owner-scoped and cannot enter the Risk & Operations
  workspace merely because an operation appears in the catalog.
- `risk_operator` can read the aggregate portfolio and servicing queue and can
  submit a protective freeze when the exact capability and recent MFA pass.
- `operations_operator` can read pilot health, feedback, and servicing queue,
  can submit protective freeze, and is the command Actor for the existing
  dual-controlled sandbox servicing resolutions.
- `auditor` can read the aggregate portfolio, pilot health, and feedback but
  cannot freeze or resolve an Obligation.
- Catalog presence is discovery only. Gateway Authentication, Membership,
  capability, object ownership, recent MFA, live state, admission, approval,
  audit, transaction, Event, Evidence, outbox, and reconciliation remain
  authoritative.

## Gaps that must remain visible

1. There is no Tenant protocol operation to list operational alert state,
   reconciliation summaries, incidents, or approval records.
2. Notification targets and named incident owners remain `unconfigured`.
3. There is no browser authority to create or decide an ApprovalProposal.
4. Unfreeze, limit increase, generic emergency mutation, automatic repair,
   automatic funds action, and demo reset are not product controls.
5. A checked-in policy or runbook is configuration evidence, not proof that a
   current operational run passed or that a release gate is approved.

## Planned bounded change

1. Add one closed, immutable `risk_operations_presentation.v1` browser
   contract derived from the current Tenant catalog and reviewed checked-in
   policy constants.
2. Use that contract to render:
   - exact authority separation;
   - live operation availability;
   - internal-only alert and reconciliation Evidence boundaries;
   - incident and delivery configuration gaps;
   - exact-command dual-control requirements;
   - explicitly unavailable authority-increasing actions.
3. Keep all existing server calls unchanged. Add no operation, role,
   capability, AccessGrant, migration, external dependency, route, deployment,
   credential, signer, or funds path.
4. Extend recent-MFA browser evidence and run the operations, approval,
   reconciliation, security, PostgreSQL, schema/catalog/migration, and affected
   UI gates.
