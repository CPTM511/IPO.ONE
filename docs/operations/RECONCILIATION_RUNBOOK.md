# IPO.ONE Reconciliation and Projection Recovery Runbook

Status: Local non-funds pilot foundation. Production scheduling, alerting,
database access, and repair authority require human approval.

## Purpose

Use this runbook when validating a durable pilot database, investigating a
readiness failure, or planning recovery of a normalized core projection. The
reconciliation service never moves funds and never repairs business state
automatically.

## Preconditions

- Confirm the target is the intended non-production database.
- Confirm ordered migrations are current and their checksums pass.
- Use a least-privilege operator identity; do not use an application credential
  for manual SQL.
- Capture the release identifier and incident/change ticket in the operator
  record.
- Do not place PII, KYC data, secrets, private keys, or raw account proofs in a
  reason or evidence field.

## Run Reconciliation

Invoke `PostgresReconciliationService.run` from an authenticated operations
worker with:

```js
const result = await reconciliation.run({
  scope: "full",
  initiatedBy: "operator:<approved-id>",
  idempotencyKey: "reconciliation:<change-or-incident-id>"
});
```

Interpret the result:

- `passed`: all implemented checks returned zero discrepancies.
- `failed`: one or more warning or critical discrepancy records were committed.
- `criticalCount > 0`: durable pilot readiness must fail closed.
- `truncated: true`: the discrepancy bound was reached; treat as critical and
  investigate with read-only database tooling before another run.

Every run has a domain event, Evidence envelope, outbox message, stored summary,
and immutable discrepancy Evidence.

## Triage Order

1. `stream_head_mismatch`, `event_companion_mismatch`, or
   `command_event_link_mismatch`: stop writers and investigate the event runtime
   before evaluating business projections.
2. `command_response_hash_mismatch`: stop the affected command surface and
   preserve database/backups for incident review.
3. `ledger_transaction_mismatch` or `lockbox_negative_balance`: stop all spend,
   capture, and repayment commands for the affected subject/asset.
4. `projection_hash_mismatch` or `projection_coverage_mismatch`: compare the
   immutable snapshot, registry, source event, and normalized row.
5. `mandate_utilization_mismatch`, `obligation_*`, or
   `credit_exposure_mismatch`: freeze new credit for the affected subject until
   the upstream discrepancy is understood.
6. `legacy_command_response_unverified`: migrate or explicitly accept the
   historical record; do not represent it as hash-verified.

## Dry-Run Recovery Plan

Planning is always non-mutating:

```js
const plan = await reconciliation.planProjectionReplay({
  entityType: "obligation",
  entityId: "obligation_...",
  requestedBy: "operator:<approved-id>",
  reason: "incident/change reference without sensitive data"
});
```

Review `snapshotAvailable`, `wouldRepair`, `expectedHash`, and `observedHash`.
If no immutable snapshot exists, do not reconstruct the row manually. Escalate
to protocol/data owners and restore from a reviewed backup or source system.

## Approval-Gated Repair

Repair is allowed only after root cause, blast radius, and the exact snapshot
have been reviewed. Use a unique idempotency key tied to the approval record:

```js
const repair = await reconciliation.repairProjection({
  entityType: "obligation",
  entityId: "obligation_...",
  approvedBy: "operator:<approved-id>",
  reason: "approved incident/change reference",
  idempotencyKey: "projection-repair:<approval-id>"
});
```

The repair appends `projection_repaired`, Evidence, outbox, a new immutable
snapshot, and the normalized projection update. It does not alter prior events
or snapshots. Retry the same idempotency key after an uncertain client result.

## Post-Repair Verification

1. Re-run full reconciliation with a new idempotency key.
2. Require `passed` and `criticalCount = 0` before unfreezing command paths.
3. Verify the repair event reached the outbox consumer and audit store.
4. Attach run IDs, discrepancy IDs, repair event ID, release, and approval
   reference to the incident/change record.
5. Fix the source defect and add a regression test; a repair is not closure by
   itself.

## Prohibited Actions

- Do not update `domain_events`, `credit_events`, `evidence_envelopes`,
  `command_events`, ledger transactions/entries, or projection snapshots.
- Do not delete discrepancy evidence to make readiness green.
- Do not disable database constraints or triggers during repair.
- Do not run repair automatically from a health endpoint or retry loop.
- Do not use this local foundation as evidence of production backup, HA, DR,
  tenant isolation, or operator authorization.
