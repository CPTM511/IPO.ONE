# IPO.ONE Closed Pilot Operations Runbook v0.1

Status: Local preflight only; every hosted action is disabled

This runbook operationalizes `OPS-004` for the invited, no-real-funds pilot.
It grants no cloud, deployment, scheduler, notification, secret, remote-access,
signer, Provider-execution, or funds authority.

## Activation prerequisites

Do not provision or activate anything until all approval inputs in
`deploy/closed-pilot/operations.v1.json` are resolved and recorded outside the
repository through approved change control. The exact release, region, budget,
owners, RPO/RTO, alert provider, recipients, secret manager, and rollback owner
must be named.

The sealed baseline is:

- commit `129f8bb28ff53d6dfb4e175b953a537b987a2a84`;
- release candidate `ipo-one-local-rc-20260730-003`;
- Node 26.5.0, pnpm 11.1.3, PostgreSQL 17; and
- no real funds, public signup, Provider execution, or venue signer.

## Restore drill

1. Verify a successful backup and PITR coverage from the approved provider.
2. Create a new isolated, non-canonical restore target with no participant
   ingress and no worker schedules.
3. Restore the selected recovery point into that target. Never overwrite the
   canonical pilot database.
4. Apply only the exact sealed migration set and verify migration checksums.
5. Run RLS, Tenant isolation, authentication revocation, idempotency, Ledger,
   Evidence, outbox, and reconciliation checks.
6. Compare bounded database summaries and Evidence hashes; never export raw PII
   or credentials into the receipt.
7. Destroy the isolated target only after the named restore owner accepts the
   redacted receipt.

RPO and RTO remain unset until founder approval. An unset objective is a failed
launch gate, not permission to use a default.

## Reconciliation and synthetic checks

- Run workers from the same immutable release as the API.
- Use PostgreSQL leases and idempotency; overlapping scheduled runs are
  forbidden.
- Reconcile outbox, canonical projections, obligations, repayments, Evidence,
  credit Outcomes, and any approved testnet observations.
- Resolve `unknown` outcomes through read/reconciliation paths without issuing
  a new economic command or idempotency key.
- Automatic repair is forbidden. Any repair must use the existing reviewed
  approval path and produce immutable Evidence.
- Run both Human and Agent full-lifecycle no-funds synthetics. Any failed or
  missing run blocks launch and cohort continuation.

## Alerting and ownership

Alert payloads must remain PII-free and low-cardinality. Before activation,
record:

- named incident owner and backup;
- named restore owner;
- delivery provider and exact approved recipients;
- escalation and stop procedure;
- acknowledgement and resolution permissions; and
- notification delivery and recipient-removal drills.

Until those inputs exist, delivery stays disabled. A logged alert without a
verified recipient is not an operational alerting gate pass.

## Secret rotation

- Select a managed secret store through separate founder approval.
- Inject secrets only into the private runtime/worker identities that require
  them.
- Never expose database, Agent workload, OIDC, mTLS, attestor, or future venue
  credentials to browser code.
- Vercel must not receive direct database credentials.
- Long-lived cloud service-account keys are forbidden.
- Prove rotation, old-credential revocation, process restart, replay rejection,
  and rollback before cohort access.
- Store only redacted rotation receipts; never store secret values or raw
  authentication material.

## Rollback

1. Pause new mutations through the reviewed protective control.
2. Stop schedules while preserving reconciliation and Evidence reads.
3. Record the incident, exact release, database migration state, and rollback
   decision.
4. Redeploy the previous immutable commit; do not use a mutable image tag.
5. Do not automatically downgrade PostgreSQL. Use only a separately reviewed
   forward migration that preserves canonical Events, Evidence, idempotency,
   and audit state.
6. Re-run reconciliation, Human/Agent synthetics, credential revocation, and
   Evidence integrity checks.
7. Resume only after the named incident and rollback owners accept the
   redacted receipt.

Rollback never rewrites Base Sepolia history or treats a chain receipt as a
replacement for canonical PostgreSQL truth.

## Current blocked state

All OPS-004 activation gates are unsatisfied. Cloud provisioning, schedules,
notifications, secret writes, ingress, and launch remain disabled. The next
step after this local contract passes is a separate founder decision on the
listed approval inputs, not an automatic deployment.
