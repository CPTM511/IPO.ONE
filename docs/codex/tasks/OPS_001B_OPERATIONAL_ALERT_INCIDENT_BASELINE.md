# OPS-001B: Operational Alert and Incident Baseline

Status: Implemented locally for the closed no-real-funds pilot. Notification
delivery, named ownership, scheduling, production deployment, and real-value
authority remain disabled or unconfigured.

Date: 2026-07-17

## Context

The hosted public sandbox has infrastructure-level readiness, 5xx, latency,
capacity, and edge-deny alerts. The private commercial-pilot kernel also emits
reconciliation, servicing, chain Evidence, break-glass, and admission-control
facts, but lacked one versioned contract for turning those facts into bounded
operational alert candidates and manual response guidance.

Commercial requirements supersede the historical DEMO. The local private
product therefore needs deterministic operational truth before a notification
provider, on-call rota, production identities, or real funds are selected.

## Scope

- Define a closed no-real-funds operational alert policy with exactly one rule
  for each reviewed signal type.
- Normalize authoritative Credit Events, Evidence envelopes, admission
  telemetry, and full-lifecycle synthetic results into PII-free signals.
- Hash source and scope references; never retain source payloads or identifiers.
- Deterministically deduplicate replayed occurrences and group repeated signals
  by alert type and logical scope.
- Emit severity, route, owner role, readiness effect, runbook, bounded Evidence
  hashes, and manual action codes.
- Add JSON Schemas, drift checks, tests, and an operator runbook.

## Non-Goals

- No notification channel, pager, ticketing, email, SMS, or webhook delivery.
- No scheduled worker, hosted deployment, SLO measurement, or monitoring-provider mutation.
- No automatic freeze, pause, repair, write-off, unfreeze, limit change, or fund action.
- No new credit, utilization, loss, stop-loss, or incident-time threshold.
- No named person, production role assignment, break-glass activation, release
  authorization, private-data approval, or real-value authority.

## Likely Files

- `modules/operations-control/*`
- `schemas/v2/operational-*.schema.json`
- `scripts/check-operations-policy.mjs`
- `docs/operations/PRIVATE_PILOT_ALERT_AND_INCIDENT_RUNBOOK.md`
- commercialization and launch-readiness guidance

## Acceptance Criteria

- [x] The policy is closed, versioned, complete, and has unique signal/alert mappings.
- [x] Policy drift that enables automatic actions, real funds, or release authority fails.
- [x] Failed reconciliation, invalidated chain Evidence, break-glass activation,
  admission unavailability, failed lifecycle synthetic checks, servicing
  default, and write-off review map to reviewed rules.
- [x] Irrelevant successful events produce no signal or alert.
- [x] Reviewed source events require a server-created closed-pilot/no-funds
  source boundary; caller-shaped lookalikes fail closed.
- [x] Duplicate event delivery is idempotent; repeated scoped occurrences aggregate.
- [x] Alert output contains no raw Tenant/Actor/Subject/Obligation/payment/
  incident/check identifiers, source payload, or PII.
- [x] Alert Evidence is bounded to 32 references while total occurrence count remains exact.
- [x] Notification and named-owner state remains explicitly unconfigured.
- [x] Runbooks prohibit bypassing authorization, direct database edits, or automatic repair.

## Test Commands

```sh
pnpm run check:operations-policy
node --test modules/operations-control/test/*.test.js
pnpm run check:schemas
pnpm run lint:boundaries
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run test:transport
pnpm run test:provider
git diff --check
```

## Security Checklist

- [x] Input shapes and supported source types are closed and bounded.
- [x] No source can be relabeled as closed-pilot/no-funds without the branded
  composition boundary.
- [x] Source payloads are not copied into operational signals or alerts.
- [x] Source and logical scope identifiers are domain-separated hashes.
- [x] Exact event replay cannot increase the occurrence count.
- [x] The evaluator cannot dispatch, mutate, release, or move funds.
- [x] Action codes are human review instructions, not executable capabilities.
- [x] The private policy cannot be represented as hosted or production-ready evidence.
- [ ] Named notification recipients and incident owners approved and configured.
- [x] Durable Tenant-RLS alert occurrence and synthetic-result persistence
  implemented and exercised locally by `OPS-001C`.
- [ ] Protected scheduled lifecycle execution and notification delivery deployed and exercised.
- [ ] Numeric SLO/cap/stop-loss policy separately approved before real value.
