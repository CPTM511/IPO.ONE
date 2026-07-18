# Operations Control

`modules/operations-control` is the local no-real-funds `OPS-001B/OPS-001C`
alert, durable occurrence, and lifecycle-check foundation. It converts a bounded set of already-authoritative
Credit Events, Evidence envelopes, admission telemetry, and full-lifecycle
synthetic results into one versioned, low-cardinality operational signal model.
It then deterministically groups duplicate occurrences into privacy-safe alert
candidates with severity, route, owner role, readiness effect, runbook, and
manual action codes.

The output is advisory. This module does not send a notification, create a
ticket, freeze or unfreeze a Subject, pause a Provider, repair a projection,
change a limit, move funds, or authorize a release. The checked-in private-pilot
policy requires `automaticActionsEnabled=false`,
`realFundsActionsEnabled=false`, and `productionReleaseAuthority=false`.
Notification targets and named owners deliberately remain `unconfigured`.
Every adapter also requires a server-created `operational_source_boundary.v1`
before it can label an authoritative source as closed-pilot/no-real-funds;
caller-shaped lookalikes are rejected.

Raw Tenant, Actor, Subject, Obligation, payment, incident, and synthetic-check
identifiers are used only to derive domain-separated hashes. Alert candidates
contain bounded evidence and scope hashes, never source payloads or PII.

`DualNativeLifecycleSyntheticRunner` proves one exact release only after Human
Offer, Agent Offer, Offer parity, both no-funds Obligation/repayment receipts,
exact receipt linkage, Obligation parity, and full zero-difference
reconciliation succeed. Failure output retains only a stable stage/code and
hashes. `PostgresOperationalAlertStore` persists that result plus replay-safe
alert occurrences through the existing Event/Evidence/Outbox transaction. Its
three projection tables use forced Tenant RLS; occurrence and synthetic rows
are append-only, alert identity/policy is immutable, and versions are
monotonic. Exact source replay never increments the count.

Current event-presence rules cover:

- failed reconciliation;
- invalidated chain payment Evidence;
- activated break-glass incidents;
- unavailable authenticated admission control;
- failed no-funds full-lifecycle synthetic checks;
- servicing default cases; and
- write-off review cases.

The store exposes internal Tenant-scoped reads for verification only. It does
not register a Tenant protocol, HTTP, SDK, or MCP permission for alert read,
acknowledgement, resolution, or delivery.

No count, loss, utilization, credit, or stop-loss threshold is invented here.
Commercial caps, numeric SLOs, notification recipients, named incident owners,
and production deployment remain separate human-reviewed decisions.

Verification:

```sh
pnpm run check:operations-policy
node --test modules/operations-control/test/*.test.js
pnpm run test:postgres
pnpm run check
```
