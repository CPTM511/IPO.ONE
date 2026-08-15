# DEPLOY-001 — Durable Hosted Pilot Topology

Status: Implemented locally on 2026-07-27; vendor selection and activation pending

## Context

The public Vercel deployment is a synthetic process-local sandbox. IPO.ONE also
has a PostgreSQL-backed authenticated private runtime locally, but the former
GCP closed-pilot runtime is offboarded. The approved delivery guide requires a
cost-controlled durable topology contract before purchasing infrastructure or
opening remote access.

This issue selects and composes the minimum architecture shape. It does not
select a managed PostgreSQL or OCI runtime vendor and does not deploy anything.

## Scope

- keep Vercel as the selected Web provider;
- select one OCI private-pilot runtime with PostgreSQL-only canonical state;
- require one managed PostgreSQL 17 service with separate migration, gateway,
  and authentication roles, forced Tenant RLS, encryption, pooling, backups,
  PITR, and restore evidence;
- select a separate same-release worker shape for outbox, reconciliation,
  synthetics, Evidence finalization, credit outcomes, and alert delivery;
- prefer PostgreSQL outbox/leases before Redis;
- define the same-origin private API edge and deny direct runtime origin access;
- keep all remote, cloud, signer, testnet-write, Provider-execution, Human
  credit, and real-funds authority disabled;
- add a canonical machine-validated topology contract and negative tests; and
- add the contract to the repository-wide quality gate.

## Non-goals

- no cloud resource, Vercel project, DNS, database, service, job, secret, or
  alert mutation;
- no PostgreSQL or container vendor selection or cost commitment;
- no remote Human/Agent access, public signup, credential issuance, or IdP;
- no private API edge activation or direct runtime ingress;
- no Hyperliquid Testnet write, signer, external Provider execution, contract,
  custody, withdrawal, capital, lending, or real funds;
- no background worker activation; and
- no launch-policy unlock.

## Likely files

- `deploy/closed-pilot/topology.v1.json`
- `deploy/closed-pilot/README.md`
- `packages/deployment-topology/src/index.js`
- `packages/deployment-topology/test/deployment-topology.test.js`
- `scripts/check-deploy-topology.mjs`
- `package.json`

## Acceptance criteria

- one canonical topology names Vercel Web, one OCI runtime, managed PostgreSQL
  17, and one separate same-release worker;
- the current public Vercel sandbox remains process-local, public-sandbox only,
  and unattached to the private runtime;
- private canonical state cannot use Vercel or runtime process memory;
- all authority-expanding flags are exactly false and launch is blocked;
- vendor selection remains a named human decision;
- runtime Node version matches the repository runtime contract;
- RLS, encrypted transport, connection pooling, backups, PITR, restore drills,
  reconciliation, synthetics, alert ownership, and rollback remain mandatory;
- Redis, Kubernetes, warehouse, multi-cloud, and mainnet indexer are absent;
- mutation tests reject remote access, real funds, signer activation, process
  state, weaker durability, runtime drift, missing gates, and unknown fields;
  and
- the repository-wide check executes the topology contract.

## Test commands

```sh
pnpm run check:deploy-topology
node --test packages/deployment-topology/test/deployment-topology.test.js
pnpm run check
git diff --check
```

## Security checklist

- [x] No endpoint, credential, secret value, key, token, private data, or PII is
  added.
- [x] Cloud mutation and remote access are explicitly false.
- [x] Public signup, external Provider execution, testnet writes, signers,
  Human credit, and real funds are explicitly false.
- [x] Direct runtime origin access is denied by the selected edge shape.
- [x] Tenant RLS, encrypted transport, least-privilege database roles, backup,
  restore, replay, reconciliation, and rollback are mandatory.
- [x] Current public Vercel behavior is not relabelled as the private pilot.
- [x] Later `AUTHN-005`, `TRANSPORT-003`, `OPS-004`, independent reviews,
  deployment approval, and launch-policy revision remain required.

## Verification evidence

- `pnpm run check:deploy-topology` passes and confirms launch remains blocked.
- Four topology contract tests pass, including negative mutation coverage for
  remote access, real funds, testnet writes, signer activation, process-local
  private state, worker activation, weaker database durability, runtime drift,
  missing gates, and unknown fields.
- Exact Node 26.5.0 `pnpm run check` passes 562/562 with the topology contract in
  the default release gate.
- Exact Node 26.5.0 security 33/33, transport 52/52, and isolated PostgreSQL 17
  integration 77/77 pass.
- No cloud, Vercel, database, DNS, secret, identity, signer, Provider, contract,
  or funds resource was created or changed.
- `git diff --check` passes.
