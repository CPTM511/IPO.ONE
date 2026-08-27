# M3-000 — Post-M2 Task/API/Compute Agent credit alignment

Status: `DEFERRED — NOT AUTHORIZED BEFORE PHASE3-CLOSE-001`

## Context

The current M2 Pre-Development Alignment contains one direction only:
`Task/API/Compute Agent credit: deferred to M3.` Product Constitution v1.3 is
an M2 Constitution and contains no post-M2 governing decision, stable
Task/API/Compute requirement family, M3 scope, task decomposition, launch
profile, or implementation authority.

This post-M2 M3 must not be confused with the historical `M3 Backend Alpha`
milestone row in the 2026-07-01 MVP Build Spec.

## Scope after explicit entry approval

- Audit Phase 3 Evidence and state which problem remains unsolved for
  Task/API/Compute Agents.
- Propose Product Constitution vNext with stable requirement IDs, decision
  owner, effective date, supersession, and crosswalk.
- Define accountable Principal, Agent, provider/compute counterparty, identity,
  Mandate, Credit Intent, Offer, Facility, spend/execution, cashflow, repayment,
  adverse outcome, Evidence, privacy, support, loss, and reconciliation
  boundaries.
- Prove non-redundancy with Agent Lockbox, Provider spend, Capital Partner
  Offers, Trading Capital, and the shared kernel.
- Prepare architecture decisions, threat model, launch-policy proposal,
  traceability, issue-sized execution plan, tests, permissions, migrations,
  rollback, and Evidence contract.

## Non-goals

- No M3 application, domain, API, SDK, MCP, worker, Provider, compute, payment,
  model, contract, chain, signer, deployment, credential, KYC, privacy,
  capital, custody, or funds implementation.
- No automatic inheritance from M2, Phase 3, Hyperliquid Testnet, Base Sepolia,
  public sandbox, closed pilot, or controlled-real-value proposals.
- No second Obligation, Ledger, risk, Event, Evidence, repayment, or
  reconciliation kernel.
- No claim that the historical Product Description's Task/API/Compute direction
  is current Constitution approval.

## Likely files

- Product Constitution vNext proposal and crosswalk
- new `docs/guidance/` M3 alignment only after Founder direction
- new M3 ADRs, threat model, traceability, launch-policy proposal, and execution
  plan
- this task file and later issue-sized child tasks

## Acceptance criteria

1. The exact M3 product user, problem, value path, repayment path, and loss
   bearer are explicit.
2. Human/Agent shared-kernel and Capital Partner Offer ownership are preserved.
3. No existing Agent Lockbox, Provider spend, or Trading Capital capability is
   duplicated under a new name.
4. Stable requirements have one governing decision each and an explicit
   Constitution crosswalk.
5. Active deterministic policy, shadow learning, privacy, withdrawal, transfer,
   mainnet, and real-value boundaries are explicit.
6. Every implementation node is issue-sized and contains the Engineering
   Standard's full task contract.
7. Contracts, Provider/compute integrations, credentials, privacy, deployment,
   risk, capital, custody, and funds remain separately reviewed gates.
8. The result is `ALIGNMENT READY — NO RUNTIME CHANGE`, not M3 product
   completion or implementation authority.

## Test commands

```sh
pnpm run check:product-traceability
node scripts/check-launch-policy.mjs
rg -n "M3|Task|API|Compute" docs/PRODUCT_CONSTITUTION.md docs/guidance \
  docs/architecture docs/codex/tasks docs/traceability
git diff --check
```

## Security checklist

- [ ] Phase 3 is formally closed and exact Evidence is current.
- [ ] No authority is inherited from a prior phase or testnet run.
- [ ] No second kernel or arbitrary withdrawal/transfer path is proposed.
- [ ] Raw KYC/PII, credentials, private policy, signer, and sensitive Provider
      data stay offchain/least-privilege.
- [ ] All permission, risk, privacy, deployment, external dependency, contract,
      capital, custody, and funds gates are named.

## Permission boundary

This file grants no Constitution change or M3 planning start. Entry requires
`PHASE3-CLOSE-001` plus explicit Founder direction. Constitution ratification
and the final M3 execution plan require separate review before any code begins.

## Data and migration impact

None. M3 alignment is documentation only. Any future schema or migration must
be proposed under a later active issue after governance approval.

## Rollback

Reject or revise the proposal documents. No runtime or durable state exists to
roll back.

Current verdict: `NOT AUTHORIZED`.
