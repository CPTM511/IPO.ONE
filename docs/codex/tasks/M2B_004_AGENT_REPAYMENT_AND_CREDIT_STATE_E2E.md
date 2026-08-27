# M2B-004 — Agent repayment and Credit State E2E

Status: `LOCAL L0 IMPLEMENTED — EXTERNAL EXECUTION AND RELEASE BLOCKED`

Baseline: `b7cb70d2facc749c01a40ece6e0261a8bfac6667`

Requirements: `REQ-CORE-001`, `REQ-ID-002`, `REQ-ID-005`,
`REQ-CREDIT-007`, `REQ-EXEC-003`, `REQ-EXEC-004`, `REQ-PAY-001`,
`REQ-PAY-002`, `REQ-EVID-001`, `REQ-EVID-002`, `REQ-EVID-004`,
`REQ-RISK-002`, `REQ-UX-002`, `REQ-UX-004`, `REQ-UX-005`,
`REQ-TRADE-001`, `REQ-TRADE-004`, `REQ-TRADE-005`

## Context

M2B-003 provides signer-free dual-risk STOP truth but grants no external
protective execution. The existing `AGENT-CREDIT-EXEC-001` local runtime and
independent reference Agent already compose one shared Subject, Principal,
Mandate, Credit Intent, Capital Partner Offer, Obligation, Facility, Ledger,
synthetic venue execution, reconciliation and canonical repayment. The private
pilot already exposes versioned API/SDK/MCP operations for sandbox repayment
and owned Credit State.

The missing M2B-004 closure is to turn a fully repaid local Agent cycle into the
same finalized Credit Outcome and non-authorizing Credit State used by the
shared kernel, preserve that truth across restart, and make the result directly
reviewable. This issue must not create a Trading Credit State, second Ledger,
second Obligation or an automatically authorizing history record.

## Scope

- Finalize one shared `credit_outcome.v1` only after the canonical Obligation is
  terminal and source Evidence is present.
- Build one `credit_state_projection.v1` from finalized outcomes only.
- Expose exact outcome and Credit State reads through the replaceable
  `CreditProvider` port used by the independent Agent.
- Require the Agent to read Evidence, performance, terminal outcome and Credit
  State after canonical repayment.
- Preserve the outcome, Credit State, Obligation, Ledger, reconciliation and
  execution correlation in the exported restart snapshot.
- Keep partial repayment/loss non-terminal: outstanding debt remains visible,
  no positive Credit Outcome is manufactured, and future capacity remains
  held for review.
- Upgrade the local Founder review experience to show Outcome finality, Credit
  State hash/version and the explicit non-authorizing/no-auto-limit boundary.
- Add focused positive, negative, restart, API/SDK/MCP parity and browser tests.

## Non-goals

- No Hyperliquid or Pool network request, signer, nonce, signature or external
  transaction.
- No testnet retry, signer reuse, external Agent credential issuance or remote
  MCP endpoint.
- No real funds, mainnet, production custody, transfer, withdrawal or residual
  release authority.
- No automatic limit increase, collateral relief, repricing, unfreeze, policy
  eligibility or new Facility authorization derived from Credit State.
- No new scoring model, learning promotion, second economic kernel, new
  service, queue, dependency or production deployment.
- No schema migration unless the existing canonical snapshot and Credit State
  persistence prove insufficient.

## Likely files

- `modules/agent-credit-execution/src/runtime.js`
- `modules/agent-credit-execution/test/agent-credit-execution.e2e.test.js`
- `packages/reference-economic-agent/src/index.js`
- `packages/reference-economic-agent/test/reference-economic-agent.test.js`
- `scripts/agent-credit-experience.mjs`
- focused browser/experience tests and `artifacts/m2b-004/`
- `package.json` focused command aliases

## Acceptance criteria

1. Given a profitable/even local Agent cycle, when canonical repayment makes
   the Obligation `fully_repaid`, then exactly one finalized shared Credit
   Outcome and one non-authorizing Credit State projection are created.
2. Given the same run after restart, when outcome, Credit State, Obligation,
   Ledger, venue reconciliation and Evidence are read, then their identifiers,
   hashes, versions and amounts match the pre-restart truth.
3. Given repayment retry or a changed reconciliation hash, when attempted,
   then it fails closed and creates no duplicate Outcome, Credit State, Ledger
   transaction or external effect.
4. Given a partial repayment/loss, when the Agent completes its run, then the
   outstanding amount remains visible, no terminal positive Outcome or Credit
   State is fabricated, and future capacity remains held for review.
5. Given Agent API/SDK/MCP surfaces, when repayment and Credit State are queried,
   then they use the existing shared operation contracts and return the same
   non-authorizing state semantics.
6. Given Principal/Risk browser review, when each visible local scenario is
   run, then the terminal or pending status, canonical repayment, outstanding
   balance, Evidence and no-authority boundary are understandable without
   developer tools.

## Test commands

```sh
pnpm test:agent-credit
pnpm test:e2e:agent-credit
pnpm test:e2e:agent-credit:negative
pnpm test:e2e:agent-credit:restart
pnpm test:transport
pnpm test:security
pnpm test:postgres
pnpm test
git diff --check
```

## Security checklist

- [x] Shared terminal Obligation and finalized Evidence are required.
- [x] Credit Outcome and Credit State remain non-authorizing and sandbox-only.
- [x] Credit State cannot alter limits, collateral, policy or Facility state.
- [x] Partial repayment cannot become a positive terminal outcome.
- [x] Replay cannot duplicate repayment, Outcome, Credit State or Ledger truth.
- [x] Restart preserves exact hashes and does not resurrect stale authority.
- [x] Independent Agent imports no IPO.ONE domain, database or signer internals.
- [x] No raw wallet, key, signature, credential, PII or venue response is stored.
- [x] Human and Agent surfaces show the same finality and authority boundaries.

## Permission boundary

The instruction to continue authorizes only deterministic `L0_LOCAL_NO_FUNDS`
implementation, local persistence/restart verification, existing private
API/SDK/MCP conformance, browser review and redacted Evidence. It does not
authorize a Hyperliquid or Pool write, external Agent credential, signer or
nonce, testnet asset movement, deployment, production, mainnet, real value,
custody, transfer, withdrawal, risk parameter or automatic credit change.

## Data and migration impact

No migration is planned. The Agent execution snapshot will reuse canonical
`credit_outcome.v1` and `credit_state_projection.v1` values. The authenticated
private pilot already durably persists those projections under forced RLS.
If that proves insufficient, implementation must stop and amend this contract
before adding schema.

## Rollback

Disable the M2B-004 local experience and new terminal reads, freeze new Agent
risk, preserve all canonical repayments and finalized outcomes, and retain the
existing M2B-003 STOP boundary. Never delete or relabel a repayment, Outcome or
ambiguous venue observation.

## Required Evidence

Issue contract, focused shared-outcome tests, partial-loss denial proof,
restart/replay proof, existing API/SDK/MCP conformance, full repository gates,
exact SHA, browser-visible healthy and loss flows, redacted local artifact and
a working loopback product URL.

## Dependency and sequencing

M2B-004 is stacked on M2B-003 exact commit
`b7cb70d2facc749c01a40ece6e0261a8bfac6667`. PR #56 remains Draft and unmerged.
M2B-005 stays locked until this local boundary is implemented and explicitly
accepted. Nothing in this issue authorizes external M2B execution.

## Completion Evidence

The L0 implementation composes the existing shared repayment, finalized Credit
Outcome and Credit State projection without a migration or second economic
kernel. A successful cycle ends with `fully_repaid`, `on_time_repaid`, one
projection version and twelve Evidence items. A 40-minor-unit loss remains
`PARTIAL_REPAYMENT`, produces no terminal Outcome or Credit State, releases no
residual and holds future capacity for review.

Executable results:

- Agent Credit focused suite: 44 passed, 0 failed, 0 skipped.
- positive / negative / restart E2E: 2 / 34 / 2 passed.
- API/SDK/MCP transport: 85 passed.
- security: 34 passed.
- PostgreSQL forced-RLS/restart suite: 91 passed inside the isolated local VM
  test database.
- full repository JavaScript suite: 1,196 passed.
- source/boundary lint: 777 modules plus boundary graph passed.
- types: 3 export surfaces and 75 runtime values passed.
- contracts: 142 Schemas, 21 OpenAPI operations, 68 migration pairs and 109
  Tenant operations passed.
- real-browser visible-click acceptance: both terminal and partial-loss
  controls passed with 0 console errors and 0 warnings.

`check:product-traceability` remains a pre-existing baseline blocker for launch
policy and closed-catalog accounting. M2B-004 changes no product, deploy,
release, launch-policy or traceability source and does not claim to repair that
separate obligation.

Generated redacted Evidence:
`artifacts/m2b-004/local-e2e-evidence.json`.

Founder/Risk review experience: `http://127.0.0.1:4177/`. This loopback runtime
is not an external deployment, testnet write, production or real-value claim.
