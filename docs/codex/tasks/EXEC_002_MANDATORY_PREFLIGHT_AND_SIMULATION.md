# EXEC-002 — Mandatory Preflight and Simulation

Status: IMPLEMENTED_UNVERIFIED — Phase 2 Founder review required

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Context

ADR-038 and the accepted AECL plan require every future wallet execution to be
an IPO.ONE-constructed exact payload with an atomic pending-exposure
reservation, a current target/code snapshot, an exact simulation, normalized
effects, and one immutable four-state preflight decision. EXEC-001 delivered
the narrower delegated grant, target policy and reservation boundary.

## Scope

- construct a closed EVM `PreparedExecution` from canonical resolved action
  data, never caller-authored raw transaction envelopes;
- bind chain, target, selector, calldata, value, grant, policy, Authorization,
  reservation, session epoch, ExpectedEffects and expiry by hash;
- add a separately testable simulation port and closed local deterministic
  simulator result contract;
- compare exact code/proxy snapshots and normalized native, asset and allowance
  effects with ExpectedEffects;
- emit exactly `ALLOW`, `STEP_UP`, `DENY` or `QUARANTINE` with stable reason
  codes and a short-lived immutable `TransactionPreflightReceipt`;
- reject stale simulation/preflight, revoked grant, wrong chain, unknown
  selector, code/proxy drift, effect drift and broad/unlimited approvals;
- persist prepared execution, simulation and preflight Evidence in additive,
  Tenant-scoped forced-RLS tables;
- prove that even a fresh `ALLOW` result cannot submit in the current delivery
  mode.

## Non-goals

- no external wallet/Provider/RPC call or live simulation service;
- no signature, UserOperation, transaction submission, chain write or venue
  action;
- no raw Agent/browser calldata acceptance;
- no production/testnet permission, external credential, signer, custody,
  contract deployment, real value or funds movement;
- no Ledger, Obligation, settlement or reconciliation mutation;
- no broad approvals, arbitrary transfer/withdrawal, bridge, delegatecall,
  owner/module/implementation upgrade or unknown effects.

## Likely files

- `modules/agentic-execution/src/*`
- `modules/agentic-execution/test/*`
- `packages/domain/src/enums.js`
- `schemas/v2/prepared-execution.schema.json`
- `schemas/v2/simulation-report.schema.json`
- `schemas/v2/transaction-preflight-receipt.schema.json`
- `db/migrations/0056_agentic_execution_preflight.*.sql`
- PostgreSQL/RLS tests and completion Evidence.

## Acceptance criteria

1. The exact payload is server-constructed from a closed resolved action and
   its selector equals the calldata prefix.
2. Active grant, current session, reserved exposure and exact target policy are
   required; wrong chain and revoked/expired grants deny.
3. Unknown selector and policy-prohibited target/value/approval deny.
4. Unlimited approval is denied unless a future separately reviewed explicit
   policy admits a narrower step-up path; current policy admits none.
5. Code or proxy implementation drift quarantines.
6. Exact simulation and ExpectedEffects hashes are compared; divergent or
   unknown effects quarantine.
7. Each valid evaluation returns exactly one closed decision and stable reason
   codes in immutable queryable Evidence.
8. Simulation and receipt expiry are enforced at the submission guard; stale
   preflight cannot submit.
9. A fresh `ALLOW` still fails closed with
   `execution_submission_disabled_l0_local_no_funds`.
10. State, Event, Evidence, outbox and durable response are atomic where a
    command mutates durable state; all new tables use forced RLS.

## Test commands

```bash
node --test modules/agentic-execution/test/agentic-execution-preflight.test.js
pnpm run check:schemas
pnpm run check:migrations
pnpm run test:postgres
pnpm test
```

## Security checklist

- [x] Raw transaction and caller-authored arbitrary calldata are unavailable.
- [x] Exact payload/context hashes are deterministic and closed.
- [x] Unknown selector and wrong chain deny.
- [x] Code/proxy/effect drift quarantines.
- [x] Unlimited approval denies under the current explicit `approvalMode=none`.
- [x] Revoked/expired grants and stale simulation/preflight fail closed.
- [x] No submission or Provider adapter receives a payload under the local
      no-funds profile.
- [x] No signature, credential, external response or secret is persisted.

## Permission boundary

This approval authorizes only local deterministic payload/preflight data and
permission checks. It does not authorize external simulation, signing,
submission, Provider provisioning, Testnet/mainnet writes, deployment or
funds movement.

## Migration impact

Migration 0056 may add only immutable execution/preflight projection and
Evidence tables. It must not alter Ledger balances, canonical Obligation truth,
or external systems.

## Rollback plan

The down migration removes only the additive immutable preflight tables after
verifying no future submission record depends on them. Code rollback removes
the local construction/simulation port; no external state exists to unwind.

## Completion Evidence

Implemented and stopped for Phase 2 review. See
`docs/codex/audits/EXEC-002/audit.md`.
