# OPS-001C durable alert and dual-native synthetic runtime audit

Date: 2026-07-17
Scope: exact-release Human/Agent lifecycle checks, Tenant-RLS operational alert
state, immutable occurrences/synthetic runs, Event/Evidence/Outbox linkage,
replay, privacy, migration reversibility, and current repository gates.

## Outcome

Passed for the local closed no-real-funds product boundary. IPO.ONE now has a
callable dual-native lifecycle runner and restart-safe operational state. A
passing result requires both entry modes to complete their reviewed Offer and
Obligation/repayment receipts, pass economic parity and exact linkage, then
finish a full untruncated reconciliation with zero discrepancies. Failed runs
retain only a stable stage/code and content hashes.

This is not continuous monitoring or a production incident system. No
scheduler, notification channel, named recipient/owner, acknowledgement or
resolution permission, automatic action, release capability, deployment, or
funds authority was added.

## Durable evidence

- Migration `0022` adds Tenant-scoped `operational_alerts`, append-only
  `operational_alert_occurrences`, and append-only
  `operational_synthetic_runs`.
- All three tables have forced RLS, Tenant context guards, and Tenant-scoped
  foreign keys; a PostgreSQL superuser result is not accepted as isolation proof.
- Every accepted store operation commits domain Event, Evidence, Outbox,
  command idempotency, stream version, and operational projection atomically.
- Exact command replay returns the stored response. A new command carrying an
  existing source reference writes an auditable ingestion event but does not
  increment the alert count.
- Two Tenants can reuse the same idempotency key, source hash, alert ID, and
  synthetic check identity without visibility or coupling.
- Alert identity and safety policy are immutable, versions/count/time are
  monotonic, and occurrence/synthetic rows reject update or deletion.
- Evidence retention is capped at 32 hashes while total unique occurrence count
  stays exact.

## Privacy and authority evidence

- Tenant, Actor, source, scope, check, receipt, and reconciliation references
  are domain-separated hashes.
- Operations idempotency keys use a closed machine-identifier alphabet rather
  than accepting email addresses or free-text incident content.
- Synthetic outputs contain no raw workflow receipt, Subject, Obligation,
  account, credential, KYC/PII, request payload, or executor error text.
- `deliveryStatus=unconfigured`, `requiresNamedOwner=true`,
  `automaticActionTaken=false`, `productionReleaseAuthority=false`,
  `sandboxOnly=true`, and `productionFundsMoved=false` remain database-enforced.
- The internal read methods register no Tenant protocol, HTTP, SDK, or MCP
  capability. The existing 32-operation protocol and ten-tool MCP registry do
  not gain operations access.

## Verification matrix

| Gate | Result |
| --- | --- |
| Runtime | Node 24.18.0 / pnpm 11.1.3 |
| Full repository | 289/289 |
| OPS module | 13/13 |
| PostgreSQL 17 fresh disposable database | 61/61 |
| PostgreSQL RLS proof | temporary non-owner `NOSUPERUSER NOBYPASSRLS` role |
| Security | 21/21 |
| Human/Agent transport | 35/35 |
| Provider real-process conformance | 5/5 |
| Chain live-unit / conformance / reorg | 9/9, 6/6, 5/5 |
| Schemas | 46 contracts |
| Migrations | 22 ordered up/down pairs |
| Private protocol / Agent MCP | 32 operations / exactly 10 tools |
| Diff whitespace | clean |

The first in-sandbox PostgreSQL initialization attempt was blocked by local
shared-memory policy. The approved disposable PostgreSQL 17 loopback boundary
then ran the complete suite. An early superuser test correctly failed to prove
RLS; the final test creates a real non-owner application role. A second early
full-suite attempt exposed test-order state leakage from the deliberate
cross-Tenant duplicate idempotency proof; explicit test cleanup fixed the
fixture, after which a fresh database passed 61/61 without weakening product code.

## Remaining commercialization gaps

- Approve and configure named recipients, incident owners, escalation rota,
  retention and response SLOs.
- Add protected scheduling and deployment for the completed callable runner;
  record fresh exact-release evidence continuously.
- Define and authorize product operations for alert read, acknowledgement,
  resolution and incident linkage before exposing them in UI/API/MCP.
- Add the Human-friendly servicing case/incident UI and authorized Evidence
  drilldown without exposing raw identifiers or a technical paste console.
- Separately approve numeric SLO/cap/stop-loss policies, notification provider,
  production identities/secrets, exercises, and protected release evidence.
- Keep unfreeze/limit increases, contracts, custody, collections, capital,
  mainnet, real funds and Human cash lending behind their independent gates.

## Commercialization conflict rule

Historical DEMO behavior is not a compatibility requirement. If a DEMO route,
fixture, process-local state, copy string, or UI conflicts with Product Charter
v1.1 or the current commercialization requirements, the newer formal product
requirement wins. DEMO infrastructure cannot supply durable private-product or
operational truth.
