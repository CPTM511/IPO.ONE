# DEPLOY-001 Closed-Pilot Topology

Status: local preflight contract only; launch blocked

`operations.v1.json` is the machine-validated `OPS-004` hosted operations and
recovery baseline. It binds the sealed local RC while leaving cloud mutation,
worker schedules, alert delivery, secret writes, ingress, participant access,
and launch disabled.

`topology.v1.json` selects the minimum architecture shape for the next
IPO.ONE no-real-funds closed pilot:

```text
invited Human/Agent
        |
Vercel Web + reviewed same-origin request boundary
        |
one OCI private-pilot runtime
        |
managed PostgreSQL 17
        |
separate same-release background worker
```

## Selected now

- Vercel remains the Web provider.
- Private product truth moves to managed PostgreSQL, never Vercel process
  memory.
- The authenticated private runtime remains one digest-pinned OCI container.
- Background work uses a separate process from the same release.
- PostgreSQL outbox/leases are preferred before adding Redis.
- The smallest PITR-capable database and scale-to-zero runtime posture are the
  cost baseline before an invited cohort.

## Not selected or activated

- managed PostgreSQL vendor;
- OCI runtime/worker vendor;
- remote Human or Agent access;
- identity provider or workload credential issuance;
- edge proxy activation or direct runtime ingress;
- cloud resources, DNS, secrets, alert recipients, or on-call owner;
- Hyperliquid Testnet writes or a signer; and
- contracts, custody, withdrawals, lending capital, or real funds.

The existing `ipo-one-internal` Vercel deployment remains the public synthetic,
process-local sandbox and is not attached to the private runtime by
`DEPLOY-001`.

## Why this is the minimum topology

The current product already has a PostgreSQL-backed private runtime and a
digest-pinned container boundary. The lowest-risk cost reduction is to reuse
those application boundaries while deferring vendor purchase and capacity:

- no Kubernetes;
- no Redis until PostgreSQL outbox/lease evidence requires it;
- no data warehouse;
- no multi-cloud failover;
- no mainnet indexer; and
- no always-on signer.

Cost controls do not relax Tenant RLS, durable state, encrypted transport,
backups, PITR, restore drills, idempotency, reconciliation, or rollback.

## Validation

```sh
pnpm run check:deploy-topology
node --test packages/deployment-topology/test/deployment-topology.test.js
```

The checked contract fails if remote access, cloud mutation, real funds, Human
credit, testnet writes, external Provider execution, a venue signer, public
signup, process-local private state, or an unblocked launch is introduced.

## Next permission gates

1. `AUTHN-005` — choose and provision invite-only Human/Agent identity.
2. `TRANSPORT-003` — the remote Agent HTTPS contract, protected Host route,
   mTLS conformance client, response binding, and unknown-outcome rules are
   implemented locally. Remote participant access and edge activation remain
   disabled pending the later deployment gates.
3. `OPS-004` — compose backups, restore, jobs, alerts, ownership, and rollback.
4. Independent security and privacy review.
5. Named deployment approval and launch-policy revision.

Until those gates pass, the selected topology is an executable design contract,
not a deployed service.

## Provider recommendation

`provider-selection.pending.json` records the `DEPLOY-001B` recommendation:
Vercel Web, Neon Launch PostgreSQL 17, a Cloud Run private API, and Cloud Run
Jobs/Scheduler. It is a dated, non-binding review artifact. All provider
linking, Marketplace installation, billing, provisioning, secret, DNS, worker,
remote-access, and launch authority remains false.

The private API and worker must use the database's direct TLS endpoint and the
existing bounded application pool. Provider transaction pooling and direct
Vercel-to-database access are not approved.
